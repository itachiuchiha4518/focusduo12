'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, googleProvider, db } from '../../lib/firebase'
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
import {
  ensureUserProfile,
  getEffectivePlanId,
  remainingForMode
} from '../../lib/subscriptions'

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

  const myQueueRef = useRef(null)
  const queueListenerRef = useRef(null)
  const ownDocListenerRef = useRef(null)
  const matchingRef = useRef(false)
  const redirectedRef = useRef(false)

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

        try {
          await deleteDoc(ref)
        } catch {}

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
        .sort((a, b) => (a.data()?.queuedAt || 0) - (b.data()?.queuedAt || 0))

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
    setStatus('signing-in')

    let user
    try {
      user = await ensureLogin()
    } catch (err) {
      console.error(err)
      setStatus('error')
      alert('Sign-in failed')
      return
    }

    try {
      const profile = await ensureUserProfile(user)
      setAccountInfo(profile)

      if (profile?.accountStatus === 'banned') {
        alert('Your account is banned.')
        setStatus('blocked')
        return
      }

      if (getEffectivePlanId(profile) === 'free') {
        const remaining = remainingForMode(profile, mode)
        if (remaining <= 0) {
          alert('Free credits finished. Open the plans page to upgrade.')
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
        createdAt: serverTimestamp()
      })
    } catch (err) {
      console.error('queue create failed', err)
      setStatus('error')
      alert('Failed to create queue entry')
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

    try {
      await deleteDoc(myQueueRef.current)
    } catch {}

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
      if (myQueueRef.current) {
        deleteDoc(myQueueRef.current).catch(() => {})
      }
    }

    window.addEventListener('beforeunload', onUnload)

    return () => {
      window.removeEventListener('beforeunload', onUnload)

      if (queueListenerRef.current) {
        queueListenerRef.current()
        queueListenerRef.current = null
      }

      if (ownDocListenerRef.current) {
        ownDocListenerRef.current()
        ownDocListenerRef.current = null
      }

      if (myQueueRef.current) {
        deleteDoc(myQueueRef.current).catch(() => {})
      }
    }
  }, [])

  return (
    <div style={{ maxWidth: 900, margin: '32px auto', padding: 20 }}>
      <h1 style={{ fontSize: 34, marginBottom: 6 }}>Join a study session</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        Same exam + same subject + same mode only. Matching is immediate.
      </p>

      {accountInfo && (
        <div style={{ marginBottom: 16, padding: 14, borderRadius: 14, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
          <div><strong>Plan:</strong> {accountInfo.planLabel || 'Free'}</div>
          <div><strong>Free 1-on-1 left:</strong> {accountInfo.freeOneOnOneRemaining ?? 10}</div>
          <div><strong>Free group left:</strong> {accountInfo.freeGroupRemaining ?? 10}</div>
        </div>
      )}

      <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
        <label>
          <div style={{ fontWeight: 700 }}>Exam</div>
          <select value={exam} onChange={e => setExam(e.target.value)} style={{ padding: 8, width: '100%', marginTop: 6 }}>
            <option>JEE</option>
            <option>NEET</option>
          </select>
        </label>

        <label>
          <div style={{ fontWeight: 700 }}>Subject</div>
          <select value={subject} onChange={e => setSubject(e.target.value)} style={{ padding: 8, width: '100%', marginTop: 6 }}>
            <option>Physics</option>
            <option>Chemistry</option>
            <option>Math</option>
            <option>Biology</option>
          </select>
        </label>

        <label>
          <div style={{ fontWeight: 700 }}>Mode</div>
          <select value={mode} onChange={e => setMode(e.target.value)} style={{ padding: 8, width: '100%', marginTop: 6 }}>
            <option value="one-on-one">1-on-1</option>
            <option value="group">Group (max 5)</option>
          </select>
        </label>

        <div style={{ marginTop: 6 }}>
          <button
            onClick={startMatchmaking}
            disabled={status === 'searching' || status === 'signing-in'}
            style={{
              padding: '10px 18px',
              fontWeight: 700,
              background: '#2563eb',
              color: '#fff',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer'
            }}
          >
            Start matchmaking
          </button>

          <button
            onClick={cancelQueue}
            style={{
              marginLeft: 10,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #ddd',
              background: '#fff',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <strong>Status:</strong> <span style={{ textTransform: 'capitalize' }}>{status}</span>
          {status === 'waiting' && (
            <div style={{ marginTop: 8, color: '#444' }}>
              Waiting for a partner in <strong>{exam} • {subject}</strong>.
            </div>
          )}
        </div>
      </div>
    </div>
  )
      }
