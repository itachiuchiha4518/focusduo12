'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

import { auth, googleProvider, db } from '../../lib/firebase' // keep your existing lib/firebase
import { signInWithPopup } from 'firebase/auth'
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  serverTimestamp
} from 'firebase/firestore'

export default function JoinPage() {
  const router = useRouter()

  const [exam, setExam] = useState('JEE')
  const [subject, setSubject] = useState('Physics')
  const [mode, setMode] = useState('one-on-one')

  const [status, setStatus] = useState('idle') // idle | signing-in | searching | waiting | error
  const [queueDocId, setQueueDocId] = useState(null)

  // Ensure user is signed in (Google). Returns user object.
  async function ensureLogin() {
    if (auth.currentUser) return auth.currentUser
    const res = await signInWithPopup(auth, googleProvider)
    return res.user
  }

  // Build unique collection name to avoid composite index requirement
  function queueCollectionName(examVal, subjectVal, modeVal) {
    // sanitize values to safe collection name
    const clean = v => String(v).replace(/[^a-zA-Z0-9_-]/g, '_')
    return `queue_${clean(examVal)}_${clean(subjectVal)}_${clean(modeVal)}`
  }

  async function startMatchmaking() {
    setStatus('signing-in')
    let user
    try {
      user = await ensureLogin()
    } catch (err) {
      console.error('Google sign-in failed', err)
      setStatus('error')
      alert('Sign-in failed.')
      return
    }

    setStatus('searching')

    try {
      const colName = queueCollectionName(exam, subject, mode)
      const queueRef = collection(db, colName)

      // Read entire queue collection for this exam/subject/mode
      const snap = await getDocs(queueRef)

      // If someone waiting, pick the first doc as partner
      if (snap.docs.length > 0) {
        const partnerDoc = snap.docs[0]
        const partner = partnerDoc.data()

        // Create session document with both participants
        const sessionRef = await addDoc(collection(db, 'sessions'), {
          exam,
          subject,
          mode,
          createdAt: serverTimestamp(),
          participants: [
            { uid: user.uid, name: user.displayName || user.email || 'Anonymous' },
            { uid: partner.uid, name: partner.name || partner.displayName || 'Partner' }
          ],
          status: 'active'
        })

        // Remove partner from queue immediately (prevent duplicates)
        await deleteDoc(doc(db, colName, partnerDoc.id))

        // Redirect to session page
        router.push(`/session/${sessionRef.id}`)
        return
      }

      // No partner — add current user to queue collection for this exam/subject/mode
      const myQueueDoc = await addDoc(queueRef, {
        uid: user.uid,
        name: user.displayName || user.email || 'Anonymous',
        exam,
        subject,
        mode,
        createdAt: serverTimestamp()
      })

      setQueueDocId(myQueueDoc.id)
      setStatus('waiting')
      // stay on page — user waits

    } catch (err) {
      console.error('Matchmaking error', err)
      setStatus('error')
      alert('Failed to join queue. Check console.')
    }
  }

  // Cancel and remove current user from queue (if in queue)
  async function cancelQueue() {
    if (!queueDocId) {
      setStatus('idle')
      return
    }
    try {
      const colName = queueCollectionName(exam, subject, mode)
      await deleteDoc(doc(db, colName, queueDocId))
    } catch (err) {
      console.error('Cancel queue failed', err)
    } finally {
      setQueueDocId(null)
      setStatus('idle')
    }
  }

  // Cleanup when leaving the page or switching queues
  useEffect(() => {
    return () => {
      if (queueDocId) {
        const colName = queueCollectionName(exam, subject, mode)
        deleteDoc(doc(db, colName, queueDocId)).catch(e => {
          // ignore cleanup errors
          console.warn('cleanup queue failed:', e)
        })
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueDocId]) // run cleanup on unmount or when queueDocId changes

  return (
    <div style={{ maxWidth: 860, margin: '32px auto', padding: 20 }}>
      <h1 style={{ fontSize: 34, marginBottom: 6 }}>Join a study session</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        Pick exam, subject and mode. Matching is immediate and speed-first.
      </p>

      <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
        <label>
          <div style={{ fontWeight: 600 }}>Exam</div>
          <select
            value={exam}
            onChange={e => setExam(e.target.value)}
            style={{ padding: 8, width: '100%', marginTop: 6 }}
          >
            <option>JEE</option>
            <option>NEET</option>
          </select>
        </label>

        <label>
          <div style={{ fontWeight: 600 }}>Subject</div>
          <select
            value={subject}
            onChange={e => setSubject(e.target.value)}
            style={{ padding: 8, width: '100%', marginTop: 6 }}
          >
            <option>Physics</option>
            <option>Chemistry</option>
            <option>Math</option>
            <option>Biology</option>
          </select>
        </label>

        <label>
          <div style={{ fontWeight: 600 }}>Mode</div>
          <select
            value={mode}
            onChange={e => setMode(e.target.value)}
            style={{ padding: 8, width: '100%', marginTop: 6 }}
          >
            <option value="one-on-one">1-on-1</option>
            <option value="group">Group (max 5)</option>
          </select>
        </label>

        <div style={{ marginTop: 4 }}>
          <button
            onClick={startMatchmaking}
            disabled={status === 'searching' || status === 'waiting' || status === 'signing-in'}
            style={{
              padding: '10px 18px',
              fontWeight: 700,
              background: '#3b82f6',
              color: 'white',
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
              You are in queue for <strong>{exam} • {subject}</strong>. Waiting for a partner...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
