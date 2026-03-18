'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, googleProvider, db } from '../../lib/firebase'
import { signInWithPopup } from 'firebase/auth'
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  deleteDoc
} from 'firebase/firestore'

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

  const myQueueRef = useRef(null)
  const queueUnsubRef = useRef(null)
  const navigatedRef = useRef(false)
  const matchedRef = useRef(false)

  async function ensureLogin() {
    if (auth.currentUser) return auth.currentUser
    const res = await signInWithPopup(auth, googleProvider)
    return res.user
  }

  function attachOwnQueueListener(queueRef) {
    if (queueUnsubRef.current) {
      queueUnsubRef.current()
      queueUnsubRef.current = null
    }

    queueUnsubRef.current = onSnapshot(queueRef, async snap => {
      if (!snap.exists()) return
      const data = snap.data()
      if (!data) return

      if (data.sessionId && !navigatedRef.current) {
        navigatedRef.current = true
        matchedRef.current = true
        try {
          await deleteDoc(queueRef)
        } catch {}
        router.push(`/session/${data.sessionId}`)
      }
    })
  }

  async function tryMatch(queueColName, myQueueDocRef, uid, name) {
    if (matchedRef.current || navigatedRef.current) return

    const allDocs = await getDocs(collection(db, queueColName))
    const partnerDoc = allDocs.docs.find(d => {
      const data = d.data()
      return data && data.uid && data.uid !== uid && !data.matched
    })

    if (!partnerDoc) {
      setStatus('waiting')
      return
    }

    const partnerRef = doc(db, queueColName, partnerDoc.id)
    const sessionRef = doc(collection(db, 'sessions'))

    try {
      await runTransaction(db, async tx => {
        const mySnap = await tx.get(myQueueDocRef)
        const otherSnap = await tx.get(partnerRef)

        if (!mySnap.exists()) throw new Error('my-queue-missing')
        if (!otherSnap.exists()) throw new Error('partner-queue-missing')

        const myData = mySnap.data()
        const otherData = otherSnap.data()

        if (!myData || !otherData) throw new Error('missing-data')
        if (myData.uid === otherData.uid) throw new Error('self-match')
        if (myData.matched || otherData.matched) throw new Error('already-matched')

        const sessionData = {
          exam,
          subject,
          mode,
          status: 'active',
          createdAt: serverTimestamp(),
          participantUids: [uid, otherData.uid],
          participants: [
            { uid, name },
            { uid: otherData.uid, name: otherData.name || 'Partner' }
          ],
          initiatorUid: otherData.uid
        }

        tx.set(sessionRef, sessionData)

        tx.update(myQueueDocRef, {
          matched: true,
          sessionId: sessionRef.id,
          matchedWith: { uid: otherData.uid, name: otherData.name || 'Partner' }
        })

        tx.update(partnerRef, {
          matched: true,
          sessionId: sessionRef.id,
          matchedWith: { uid, name }
        })
      })

      setStatus('matched')
    } catch (err) {
      console.warn('match transaction failed', err)
      setStatus('waiting')
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

    const uid = user.uid
    const name = user.displayName || user.email || 'Anonymous'
    const queueColName = queueCollectionName(exam, subject, mode)
    const myQueueRef = doc(collection(db, queueColName))

    myQueueRef.current = myQueueRef
    matchedRef.current = false
    navigatedRef.current = false

    try {
      await setDoc(myQueueRef, {
        uid,
        name,
        exam,
        subject,
        mode,
        matched: false,
        sessionId: null,
        createdAt: serverTimestamp()
      })
    } catch (err) {
      console.error('queue create failed', err)
      setStatus('error')
      alert('Failed to create queue')
      return
    }

    attachOwnQueueListener(myQueueRef)

    setStatus('searching')

    const queueUnsub = onSnapshot(collection(db, queueColName), async () => {
      if (matchedRef.current || navigatedRef.current) return
      await tryMatch(queueColName, myQueueRef, uid, name)
    })

    if (queueUnsubRef.current) {
      queueUnsubRef.current()
    }
    queueUnsubRef.current = queueUnsub

    await tryMatch(queueColName, myQueueRef, uid, name)
  }

  async function cancelQueue() {
    const ref = myQueueRef.current
    if (!ref) {
      setStatus('idle')
      return
    }

    try {
      await deleteDoc(ref)
    } catch {}

    try {
      if (queueUnsubRef.current) {
        queueUnsubRef.current()
        queueUnsubRef.current = null
      }
    } catch {}

    myQueueRef.current = null
    matchedRef.current = false
    navigatedRef.current = false
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
      if (queueUnsubRef.current) {
        queueUnsubRef.current()
        queueUnsubRef.current = null
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
        Pick exam, subject and mode. Matching is immediate and speed-first.
      </p>

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
