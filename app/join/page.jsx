'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

import { auth, googleProvider, db } from '../../lib/firebase'
import { signInWithPopup } from 'firebase/auth'

import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  serverTimestamp,
  runTransaction,
  query,
  where,
  onSnapshot,
  setDoc
} from 'firebase/firestore'

/**
 * Reliable matchmaking page (per-exam/subject/mode queues).
 *
 * Key changes:
 * - When matching: update partner's queue doc with { matched: true, sessionId, matchedWith }
 *   rather than deleting it. That guarantees the waiting user receives the session ID.
 * - The waiting client listens on *its own queue doc* for a sessionId, then redirects and
 *   deletes its own queue doc as cleanup.
 *
 * Paste this entire file (replace the old one).
 */

function cleanName(v = '') {
  return String(v).replace(/[^a-zA-Z0-9_-]/g, '_')
}
function queueCollectionName(exam, subject, mode) {
  return `queue_${cleanName(exam)}_${cleanName(subject)}_${cleanName(mode)}`
}

export default function JoinPage() {
  const router = useRouter()

  const [exam, setExam] = useState('JEE')
  const [subject, setSubject] = useState('Physics')
  const [mode, setMode] = useState('one-on-one')

  const [status, setStatus] = useState('idle') // idle | signing-in | searching | waiting | error
  const [queueDocId, setQueueDocId] = useState(null)
  const [queueDocRef, setQueueDocRef] = useState(null)

  const queueListenerRef = useRef(null) // unsubscribe for our own queue doc
  const sessionListenerRef = useRef(null)

  const userRef = useRef(null)

  async function ensureLogin() {
    if (auth.currentUser) {
      userRef.current = auth.currentUser
      return auth.currentUser
    }
    const res = await signInWithPopup(auth, googleProvider)
    userRef.current = res.user
    return res.user
  }

  // Listen for changes on our own queue doc (so we get sessionId update reliably)
  function listenOnOwnQueueDoc(colName, docId, uid) {
    if (queueListenerRef.current) {
      queueListenerRef.current()
      queueListenerRef.current = null
    }
    const ref = doc(db, colName, docId)
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) return
      const data = snap.data()
      // If another user matched us, they will update matched:true and sessionId
      if (data && data.matched && data.sessionId) {
        // cleanup our queue doc and redirect
        deleteDoc(ref).catch(()=>{})
        queueListenerRef.current && queueListenerRef.current()
        queueListenerRef.current = null
        router.push(`/session/${data.sessionId}`)
      }
    })
    queueListenerRef.current = unsub
  }

  // Fallback listener on sessions in case needed (keeps old behavior)
  function listenForSession(uid) {
    if (sessionListenerRef.current) {
      sessionListenerRef.current()
      sessionListenerRef.current = null
    }
    const q = query(collection(db, 'sessions'), where('participantUids', 'array-contains', uid))
    const unsub = onSnapshot(q, snap => {
      for (const d of snap.docs) {
        const data = d.data()
        if (data && data.status === 'active') {
          sessionListenerRef.current && sessionListenerRef.current()
          sessionListenerRef.current = null
          router.push(`/session/${d.id}`)
          return
        }
      }
    })
    sessionListenerRef.current = unsub
  }

  // Start matchmaking: either match existing waiting partner OR put ourselves in queue
  async function startMatchmaking() {
    setStatus('signing-in')

    let user
    try {
      user = await ensureLogin()
    } catch (err) {
      console.error('sign-in failed', err)
      setStatus('error')
      alert('Sign-in failed')
      return
    }

    const uid = user.uid
    const name = user.displayName || user.email || 'Anonymous'

    // start listening for session fallback
    listenForSession(uid)

    const colName = queueCollectionName(exam, subject, mode)
    const queueRef = collection(db, colName)

    setStatus('searching')

    try {
      // Take a snapshot of queue collection (per-queue so no composite index)
      const snap = await getDocs(queueRef)

      // find first valid partner (exclude ourselves)
      const partnerDoc = snap.docs.find(d => {
        const data = d.data()
        return data && data.uid && data.uid !== uid && !data.matched
      })

      if (partnerDoc) {
        // Found someone waiting -> attempt atomic transaction to create session + update partner's doc
        const partnerRef = doc(db, colName, partnerDoc.id)
        const sessionRef = doc(collection(db, 'sessions')) // pre-gen id

        await runTransaction(db, async (tx) => {
          const pSnap = await tx.get(partnerRef)
          if (!pSnap.exists()) throw new Error('partner-gone')

          const pData = pSnap.data()
          if (pData.matched) throw new Error('partner-already-matched')

          // session object
          const sessionObj = {
            exam,
            subject,
            mode,
            createdAt: serverTimestamp(),
            participants: [
              { uid, name },
              { uid: pData.uid, name: pData.name || 'Partner' }
            ],
            participantUids: [uid, pData.uid],
            status: 'active'
          }

          // create the session and update partner's queue doc to notify them
          tx.set(sessionRef, sessionObj)
          tx.update(partnerRef, { matched: true, sessionId: sessionRef.id, matchedWith: { uid, name } })
        })

        // transaction committed. redirect initiator.
        router.push(`/session/${sessionRef.id}`)
        return
      }

      // No partner found: add ourselves to queue and listen to our own doc
      const myDocRef = await addDoc(queueRef, {
        uid,
        name,
        exam,
        subject,
        mode,
        createdAt: serverTimestamp(),
        matched: false
      })

      setQueueDocId(myDocRef.id)
      setQueueDocRef(myDocRef)
      setStatus('waiting')

      // set up real-time listener on our own queue doc to detect "matched" update
      listenOnOwnQueueDoc(colName, myDocRef.id, uid)
    } catch (err) {
      console.error('matchmaking error', err)
      setStatus('error')
      alert('Matchmaking failed, check console')
    }
  }

  // Cancel queue: remove our queue doc
  async function cancelQueue() {
    if (!queueDocId) {
      setStatus('idle')
      return
    }
    try {
      // derive collection and delete
      const colName = queueCollectionName(exam, subject, mode)
      await deleteDoc(doc(db, colName, queueDocId))
    } catch (err) {
      console.warn('cancel failed', err)
    } finally {
      setQueueDocId(null)
      setQueueDocRef(null)
      setStatus('idle')
      if (queueListenerRef.current) {
        queueListenerRef.current()
        queueListenerRef.current = null
      }
    }
  }

  // Clean up on unmount / beforeunload
  useEffect(() => {
    const onUnload = () => {
      if (queueDocId) {
        const colName = queueCollectionName(exam, subject, mode)
        // best-effort
        deleteDoc(doc(db, colName, queueDocId)).catch(()=>{})
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => {
      window.removeEventListener('beforeunload', onUnload)
      if (queueDocId) {
        const colName = queueCollectionName(exam, subject, mode)
        deleteDoc(doc(db, colName, queueDocId)).catch(()=>{})
      }
      if (queueListenerRef.current) { queueListenerRef.current(); queueListenerRef.current = null }
      if (sessionListenerRef.current) { sessionListenerRef.current(); sessionListenerRef.current = null }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueDocId, exam, subject, mode])

  return (
    <div style={{ maxWidth: 900, margin: 32, padding: 20 }}>
      <h1 style={{ fontSize: 34, marginBottom: 6 }}>Join a study session</h1>
      <p style={{ color: '#666', marginTop: 0 }}>Pick exam, subject and mode. Matching is speed-first and immediate.</p>

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
            disabled={status === 'searching' || status === 'waiting' || status === 'signing-in'}
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
              Waiting in queue for <strong>{exam} • {subject}</strong>. You will be redirected automatically when matched.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
