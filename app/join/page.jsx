'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth, db, googleProvider } from '../../lib/firebase'
import { signInWithPopup } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  deleteDoc
} from 'firebase/firestore'
import { ensureUserProfile, getEffectivePlanId, remainingForMode } from '../../lib/subscriptions'
import { getLiveHoursStatus, normalizeLiveHours } from '../../lib/liveHours'

function clean(v = '') {
  return String(v).replace(/[^a-zA-Z0-9_-]/g, '_')
}

function queueCollectionName(exam, subject, mode) {
  return `queue_${clean(exam)}_${clean(subject)}_${clean(mode)}`
}

export default function JoinPage() {
  const router = useRouter()

  const [exam, setExam] = useState('JEE')
  const [subject, setSubject] = useState('Physics')
  const [mode, setMode] = useState('one-on-one')
  const [status, setStatus] = useState('idle')
  const [accountInfo, setAccountInfo] = useState(null)
  const [liveHours, setLiveHours] = useState(null)
  const [waitlistCount, setWaitlistCount] = useState(0)

  const myQueueRef = useRef(null)
  const queueListenerRef = useRef(null)
  const ownDocListenerRef = useRef(null)
  const waitlistUnsubRef = useRef(null)
  const matchingRef = useRef(false)
  const redirectedRef = useRef(false)
  const isPaidRef = useRef(false)

  // Live hours listener
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'siteConfig', 'liveHours'), snap => {
      const data = snap.exists() ? snap.data() : null
      setLiveHours(normalizeLiveHours(data || undefined))
    })
    return () => unsub()
  }, [])

  // Waitlist counter — updates live when exam/subject/mode changes
  useEffect(() => {
    if (waitlistUnsubRef.current) {
      waitlistUnsubRef.current()
      waitlistUnsubRef.current = null
    }
    const colName = queueCollectionName(exam, subject, mode)
    const unsub = onSnapshot(collection(db, colName), snap => {
      const waiting = snap.docs.filter(d => !d.data().matched).length
      setWaitlistCount(waiting)
    })
    waitlistUnsubRef.current = unsub
    return () => unsub()
  }, [exam, subject, mode])

  async function ensureLogin() {
    if (auth.currentUser) return auth.currentUser
    const res = await signInWithPopup(auth, googleProvider)
    return res.user
  }

  function attachOwnDocListener(queueColName, uid) {
    if (ownDocListenerRef.current) {
      ownDocListenerRef.current()
      ownDocListenerRef.current = null
    }

    const ref = doc(db, queueColName, uid)
    ownDocListenerRef.current = onSnapshot(ref, async snap => {
      if (!snap.exists()) return
      const data = snap.data()
      if (!data) return

      if (data.sessionId && !redirectedRef.current) {
        redirectedRef.current = true
        setStatus('matched')
        try { await deleteDoc(ref) } catch {}
        if (queueListenerRef.current) {
          queueListenerRef.current()
          queueListenerRef.current = null
        }
        router.push(`/session/${data.sessionId}`)
      }
    })
  }

  async function tryMatch(queueColName, uid, name) {
    if (matchingRef.current || redirectedRef.current) return
    matchingRef.current = true

    try {
      const queueRef = collection(db, queueColName)
      const snap = await getDocs(queueRef)

      const candidates = snap.docs
        .filter(d => {
          const data = d.data()
          return (
            data &&
            data.uid &&
            data.uid !== uid &&
            !data.matched &&
            data.exam === exam &&
            data.subject === subject &&
            data.mode === mode
          )
        })
        .sort((a, b) => {
          // ⚡ PRIORITY QUEUE: paid users at front of candidate list
          // This means paid users get matched faster when new people join
          const aPaid = a.data()?.isPaid ? 1 : 0
          const bPaid = b.data()?.isPaid ? 1 : 0
          if (bPaid !== aPaid) return bPaid - aPaid
          // Among same plan tier, match by join time (oldest first)
          return (a.data()?.queuedAt || 0) - (b.data()?.queuedAt || 0)
        })

      const partnerDoc = candidates[0]
      if (!partnerDoc) {
        setStatus('waiting')
        return
      }

      const partnerRef = doc(db, queueColName, partnerDoc.id)
      const myRef = doc(db, queueColName, uid)
      const sessionRef = doc(collection(db, 'sessions'))

      await runTransaction(db, async tx => {
        const mySnap = await tx.get(myRef)
        const otherSnap = await tx.get(partnerRef)

        if (!mySnap.exists()) throw new Error('my-queue-missing')
        if (!otherSnap.exists()) throw new Error('partner-queue-missing')

        const myData = mySnap.data()
        const otherData = otherSnap.data()

        if (!myData || !otherData) throw new Error('missing-data')
        if (myData.uid === otherData.uid) throw new Error('self-match')
        if (myData.matched || otherData.matched) throw new Error('already-matched')

        const initiatorUid = (myData.queuedAt || 0) <= (otherData.queuedAt || 0) ? myData.uid : otherData.uid

        tx.set(sessionRef, {
          exam,
          subject,
          mode,
          status: 'active',
          createdAt: serverTimestamp(),
          participantUids: [myData.uid, otherData.uid],
          participants: [
            { uid: myData.uid, name: myData.name || name || 'You' },
            { uid: otherData.uid, name: otherData.name || 'Partner' }
          ],
          initiatorUid
        })

        tx.update(myRef, {
          matched: true,
          sessionId: sessionRef.id,
          matchedWith: { uid: otherData.uid, name: otherData.name || 'Partner' }
        })

        tx.update(partnerRef, {
          matched: true,
          sessionId: sessionRef.id,
          matchedWith: { uid: myData.uid, name: myData.name || name || 'You' }
        })
      })

      setStatus('matched')
    } catch (err) {
      console.warn('match transaction failed', err)
      setStatus('waiting')
    } finally {
      matchingRef.current = false
    }
  }

  async function startMatchmaking() {
    const liveStatus = getLiveHoursStatus(liveHours || {})
    if (!liveStatus.open) {
      alert(liveStatus.message || 'Live sessions are closed right now.')
      setStatus('closed')
      return
    }

    setStatus('signing-in')

    let user
    try {
      user = await ensureLogin()
    } catch (err) {
      console.error(err)
      setStatus('error')
      alert('Sign-in failed. Please try again.')
      return
    }

    try {
      const profile = await ensureUserProfile(user)
      setAccountInfo(profile)

      if (profile?.accountStatus === 'banned') {
        alert('Your account is banned. Contact support.')
        setStatus('blocked')
        return
      }

      const planId = getEffectivePlanId(profile)
      isPaidRef.current = planId !== 'free'

      if (planId === 'free') {
        const remaining = remainingForMode(profile, mode)
        if (remaining <= 0) {
          alert('You have used all your free sessions for this mode. Upgrade to continue studying!')
          router.push('/plans')
          return
        }
      }
    } catch (err) {
      console.warn('profile init failed', err)
    }

    const uid = user.uid
    const name = user.displayName || user.email || 'Anonymous'
    const queueColName = queueCollectionName(exam, subject, mode)
    const myRef = doc(db, queueColName, uid)

    myQueueRef.current = myRef
    redirectedRef.current = false
    matchingRef.current = false

    try {
      const existing = await getDoc(myRef)
      if (existing.exists()) {
        const data = existing.data()
        if (data?.sessionId && data?.matched) {
          router.push(`/session/${data.sessionId}`)
          return
        }
      }

      await setDoc(myRef, {
        uid,
        name,
        exam,
        subject,
        mode,
        matched: false,
        sessionId: null,
        queuedAt: Date.now(),
        createdAt: serverTimestamp(),
        isPaid: isPaidRef.current   // ← Priority flag for queue sorting
      })
    } catch (err) {
      console.error('queue create failed', err)
      setStatus('error')
      alert('Failed to join queue. Please try again.')
      return
    }

    attachOwnDocListener(queueColName, uid)

    if (queueListenerRef.current) {
      queueListenerRef.current()
      queueListenerRef.current = null
    }

    queueListenerRef.current = onSnapshot(collection(db, queueColName), async () => {
      if (redirectedRef.current) return
      await tryMatch(queueColName, uid, name)
    })

    setStatus('searching')
    await tryMatch(queueColName, uid, name)
  }

  async function cancelQueue() {
    if (!myQueueRef.current) {
      setStatus('idle')
      return
    }
    try { await deleteDoc(myQueueRef.current) } catch {}

    if (queueListenerRef.current) {
      queueListenerRef.current()
      queueListenerRef.current = null
    }
    if (ownDocListenerRef.current) {
      ownDocListenerRef.current()
      ownDocListenerRef.current = null
    }

    myQueueRef.current = null
    matchingRef.current = false
    redirectedRef.current = false
    setStatus('idle')
  }

  useEffect(() => {
    const onUnload = () => {
      if (myQueueRef.current) deleteDoc(myQueueRef.current).catch(() => {})
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      if (queueListenerRef.current) queueListenerRef.current()
      if (ownDocListenerRef.current) ownDocListenerRef.current()
      if (waitlistUnsubRef.current) waitlistUnsubRef.current()
      if (myQueueRef.current) deleteDoc(myQueueRef.current).catch(() => {})
    }
  }, [])

  const liveStatus = getLiveHoursStatus(liveHours || {})
  const isPaid = isPaidRef.current
  const creditsLeft = accountInfo ? remainingForMode(accountInfo, mode) : null
  const lowCredits = creditsLeft !== null && !isPaid && creditsLeft <= 3
  const isSearching = status === 'searching' || status === 'signing-in'

  return (
    <div style={{ maxWidth: 560, margin: '32px auto', padding: 20, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 30, marginBottom: 4, fontWeight: 900 }}>Join a study session</h1>
      <p style={{ color: '#666', marginTop: 0, marginBottom: 20 }}>
        Same exam + subject + mode only. Get matched in seconds.
      </p>

      {/* Live status banner */}
      <div style={{
        marginBottom: 12, padding: '12px 14px', borderRadius: 12,
        background: liveStatus.open ? '#ecfdf5' : '#fff7ed',
        border: `1px solid ${liveStatus.open ? '#6ee7b7' : '#fcd34d'}`,
        fontWeight: 600
      }}>
        {liveStatus.open ? '🟢' : '🔴'}{' '}
        {liveHours ? liveStatus.message : 'Checking live hours...'}
      </div>

      {/* WAITLIST COUNTER — shows demand before login, creates urgency */}
      <div style={{
        marginBottom: 12, padding: '12px 14px', borderRadius: 12,
        background: waitlistCount > 0 ? '#eff6ff' : '#f8fafc',
        border: `1px solid ${waitlistCount > 0 ? '#93c5fd' : '#e5e7eb'}`
      }}>
        {waitlistCount > 0
          ? <span>👥 <strong>{waitlistCount} student{waitlistCount === 1 ? '' : 's'}</strong> waiting for a {subject} partner right now</span>
          : <span>📚 Be the first to join the {exam} {subject} queue</span>
        }
      </div>

      {/* PRIORITY BADGE — shows paid users they have an advantage */}
      {isPaid && (
        <div style={{
          marginBottom: 12, padding: '10px 14px', borderRadius: 12,
          background: '#fefce8', border: '1px solid #fde047',
          fontWeight: 700, color: '#854d0e'
        }}>
          ⚡ Priority matching active — you get matched before free users
        </div>
      )}

      {/* LOW CREDITS WARNING — urgency to upgrade */}
      {lowCredits && (
        <div style={{
          marginBottom: 12, padding: '12px 14px', borderRadius: 12,
          background: '#fef2f2', border: '1px solid #fca5a5'
        }}>
          ⚠️ Only <strong>{creditsLeft} session{creditsLeft === 1 ? '' : 's'}</strong> left.{' '}
          <Link href="/plans" style={{ color: '#dc2626', fontWeight: 700, textDecoration: 'underline' }}>
            Upgrade for ₹99 →
          </Link>
        </div>
      )}

      {/* Account credits summary */}
      {accountInfo && (
        <div style={{
          marginBottom: 16, padding: '10px 14px', borderRadius: 12,
          background: '#f8fafc', border: '1px solid #e5e7eb', fontSize: 14,
          display: 'flex', gap: 12, flexWrap: 'wrap'
        }}>
          <span>📋 <strong>{accountInfo.planLabel || 'Free'}</strong></span>
          <span>1-on-1 left: <strong>{accountInfo.freeOneOnOneRemaining ?? 10}</strong></span>
          <span>Group left: <strong>{accountInfo.freeGroupRemaining ?? 10}</strong></span>
        </div>
      )}

      {/* Selectors */}
      <div style={{ display: 'grid', gap: 14 }}>
        <label>
          <div style={{ fontWeight: 700, marginBottom: 5 }}>Exam</div>
          <select value={exam} onChange={e => setExam(e.target.value)}
            disabled={isSearching}
            style={{ padding: '10px 12px', width: '100%', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 15 }}>
            <option>JEE</option>
            <option>NEET</option>
          </select>
        </label>

        <label>
          <div style={{ fontWeight: 700, marginBottom: 5 }}>Subject</div>
          <select value={subject} onChange={e => setSubject(e.target.value)}
            disabled={isSearching}
            style={{ padding: '10px 12px', width: '100%', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 15 }}>
            <option>Physics</option>
            <option>Chemistry</option>
            <option>Math</option>
            <option>Biology</option>
          </select>
        </label>

        <label>
          <div style={{ fontWeight: 700, marginBottom: 5 }}>Mode</div>
          <select value={mode} onChange={e => setMode(e.target.value)}
            disabled={isSearching}
            style={{ padding: '10px 12px', width: '100%', borderRadius: 10, border: '1px solid #d1d5db', fontSize: 15 }}>
            <option value="one-on-one">1-on-1 (10 free sessions)</option>
            <option value="group">Group — max 5 (10 free sessions)</option>
          </select>
        </label>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            onClick={startMatchmaking}
            disabled={isSearching || !liveStatus.open}
            style={{
              flex: 1, padding: '13px 20px', fontWeight: 800, fontSize: 16,
              background: liveStatus.open ? (isSearching ? '#3b82f6' : '#2563eb') : '#94a3b8',
              color: '#fff', border: 'none', borderRadius: 12,
              cursor: (liveStatus.open && !isSearching) ? 'pointer' : 'not-allowed',
              transition: 'opacity 0.2s'
            }}
          >
            {status === 'signing-in' ? '⏳ Signing in...' :
             status === 'searching' ? '🔍 Finding partner...' :
             'Start matchmaking'}
          </button>

          <button onClick={cancelQueue}
            style={{
              padding: '13px 16px', borderRadius: 12, fontWeight: 700,
              border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 15
            }}>
            Cancel
          </button>
        </div>

        {/* Status display */}
        <div style={{
          padding: '14px 16px', borderRadius: 12,
          background: status === 'matched' ? '#ecfdf5' : '#f8fafc',
          border: `1px solid ${status === 'matched' ? '#6ee7b7' : '#e5e7eb'}`
        }}>
          <strong>Status: </strong>
          {status === 'idle' && 'Ready — pick your options and start'}
          {status === 'signing-in' && '⏳ Signing in with Google...'}
          {status === 'searching' && '🔍 Searching for a match...'}
          {status === 'waiting' && `⏳ Waiting for a partner in ${exam} • ${subject}. You'll be matched as soon as someone joins.`}
          {status === 'matched' && '✅ Match found! Joining your session now...'}
          {status === 'error' && '❌ Something went wrong. Try again.'}
          {status === 'closed' && '🔴 Sessions are closed right now. Come back later.'}
          {status === 'blocked' && '🚫 Account blocked. Contact support.'}
        </div>

        {/* Free plan info */}
        {!accountInfo && (
          <div style={{
            padding: '12px 14px', borderRadius: 12,
            background: '#f0f9ff', border: '1px solid #bae6fd', fontSize: 14, lineHeight: 1.7
          }}>
            <strong>Free plan:</strong> 10 one-on-one sessions + 10 group sessions.
            First 2 min are for chapter selection — leave early and your credit is not used.
            Sessions end after 30 min.{' '}
            <Link href="/plans" style={{ color: '#0284c7', fontWeight: 700 }}>See paid plans →</Link>
          </div>
        )}
      </div>
    </div>
  )
          }
        
