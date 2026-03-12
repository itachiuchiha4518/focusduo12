'use client'
/*
  app/join/page.jsx
  Simple, deterministic matchmaking:
  - queue stored at: queues/{queueId}/users
  - transaction atomically: create session, create userMatches/{uid}, delete queue docs
  - clients listen to userMatches/{uid} and redirect to /session/{sessionId}
*/

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, googleProvider, db } from '../../lib/firebase'
import { signInWithPopup } from 'firebase/auth'
import {
  addDoc,
  collection,
  serverTimestamp,
  query,
  orderBy,
  onSnapshot,
  doc,
  runTransaction,
  limit
} from 'firebase/firestore'

export default function JoinPage() {
  const router = useRouter()
  const [exam, setExam] = useState('JEE')
  const [subject, setSubject] = useState('Physics')
  const [mode, setMode] = useState('1-on-1') // '1-on-1' or 'group'
  const [status, setStatus] = useState('idle')
  const [user, setUser] = useState(null)
  const myQueueDocRef = useRef(null)
  const queueUnsubRef = useRef(null)
  const userMatchUnsubRef = useRef(null)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => setUser(u))
    return () => unsub()
  }, [])

  function queueKey(exam, subject, mode) {
    return `${exam.toLowerCase()}__${subject.toLowerCase()}__${mode.replace(/\W/g,'').toLowerCase()}`
  }

  async function ensureSignedIn() {
    if (auth.currentUser) return auth.currentUser
    try {
      const res = await signInWithPopup(auth, googleProvider)
      return res.user
    } catch (e) {
      console.error('Google sign-in failed', e)
      throw e
    }
  }

  async function startMatchmaking() {
    setStatus('starting')
    try {
      const me = await ensureSignedIn()
      setUser(me)
      setStatus('joining-queue')

      const qk = queueKey(exam, subject, mode)
      const usersCol = collection(db, 'queues', qk, 'users')

      // Add this user to queue (we keep uid for server-side matching but UI shows only names)
      const myDocRef = await addDoc(usersCol, {
        uid: me.uid,
        name: me.displayName || me.email || 'Student',
        createdAt: serverTimestamp()
      })
      myQueueDocRef.current = myDocRef

      // Subscribe to userMatches/myUid -> redirect when we get a sessionId
      const myMatchDoc = doc(db, 'userMatches', me.uid)
      userMatchUnsubRef.current = onSnapshot(myMatchDoc, snap => {
        if (!snap.exists()) return
        const data = snap.data()
        if (data?.sessionId) {
          // matched — cleanup and redirect
          cleanupListeners()
          router.push(`/session/${data.sessionId}`)
        }
      })

      setStatus('waiting')

      // Listen to this queue and attempt to match as soon as there are enough users.
      const q = query(usersCol, orderBy('createdAt', 'asc'))
      queueUnsubRef.current = onSnapshot(q, async snap => {
        const docs = snap.docs
        const minRequired = mode === 'group' ? 2 : 2 // group requires at least 2 as well (you can change)
        const maxGroupSize = mode === 'group' ? 5 : 2

        if (docs.length < minRequired) {
          // not enough people yet
          setStatus('waiting')
          return
        }

        // If there are enough, pick earliest up to maxGroupSize
        const candidates = docs.slice(0, maxGroupSize)

        // We'll run a transaction that:
        // 1) re-reads selected queue docs to ensure existence
        // 2) creates a new session doc with participants (names only for display)
        // 3) writes userMatches/{uid} for each participant with sessionId
        // 4) deletes the queue docs
        try {
          setStatus('matching')
          const sessionId = await runTransaction(db, async (tx) => {
            // Re-check each selected doc under transaction
            const snapshotDocs = []
            for (const cand of candidates) {
              const qd = await tx.get(cand.ref)
              if (!qd.exists()) {
                // stale; abort
                throw new Error('stale-queue')
              }
              snapshotDocs.push({ id: cand.id, ref: cand.ref, data: qd.data() })
            }

            // create session document with deterministic ref so we can return id
            const sessionsCol = collection(db, 'sessions')
            const newSessionRef = doc(sessionsCol) // gives us ref with id
            const participants = snapshotDocs.map(s => ({ uid: s.data.uid, name: s.data.name }))

            tx.set(newSessionRef, {
              createdAt: serverTimestamp(),
              exam,
              subject,
              mode,
              participants,
              status: 'waiting_for_join'
            })

            // write userMatches for each participant to notify them
            for (const p of participants) {
              const umRef = doc(db, 'userMatches', p.uid)
              tx.set(umRef, { sessionId: newSessionRef.id, createdAt: serverTimestamp() })
            }

            // delete queue docs for those participants
            for (const s of snapshotDocs) {
              tx.delete(s.ref)
            }

            return newSessionRef.id
          })

          // transaction succeeded; sessionId returned. Both users will be notified via their userMatches listener.
          setStatus('matched')
          // we don't navigate here — userMatches snapshot will trigger redirect.
        } catch (err) {
          // transaction failed (race or stale docs). Just stay waiting and let the next snapshot attempt again.
          console.warn('match transaction failed or race condition', err)
          setStatus('waiting')
        }
      })
    } catch (err) {
      console.error('startMatchmaking error', err)
      setStatus('error')
    }
  }

  async function cancelMatchmaking() {
    setStatus('cancelling')
    try {
      // remove our queue doc if it still exists
      if (myQueueDocRef.current) {
        try { await myQueueDocRef.current.delete() } catch (e) { /* ignore */ }
        myQueueDocRef.current = null
      }
    } catch (e) {}
    cleanupListeners()
    setStatus('idle')
  }

  function cleanupListeners() {
    try { if (queueUnsubRef.current) { queueUnsubRef.current(); queueUnsubRef.current = null } } catch(e){}
    try { if (userMatchUnsubRef.current) { userMatchUnsubRef.current(); userMatchUnsubRef.current = null } } catch(e){}
  }

  return (
    <div style={{padding:20, maxWidth:640}}>
      <h1>Join a study session</h1>

      <div style={{marginTop:12}}>
        <label>Exam</label>
        <select value={exam} onChange={e=>setExam(e.target.value)}>
          <option>JEE</option>
          <option>NEET</option>
        </select>
      </div>

      <div style={{marginTop:8}}>
        <label>Subject</label>
        <select value={subject} onChange={e=>setSubject(e.target.value)}>
          <option>Physics</option>
          <option>Chemistry</option>
          <option>Math</option>
          <option>Biology</option>
        </select>
      </div>

      <div style={{marginTop:8}}>
        <label>Mode</label>
        <select value={mode} onChange={e=>setMode(e.target.value)}>
          <option value="1-on-1">1-on-1</option>
          <option value="group">Group (max 5)</option>
        </select>
      </div>

      <div style={{marginTop:14, display:'flex', gap:8}}>
        <button onClick={startMatchmaking}>Start matchmaking</button>
        <button onClick={cancelMatchmaking} style={{background:'#eee', color:'#000'}}>Cancel</button>
      </div>

      <div style={{marginTop:12}}>
        <strong>Status:</strong> {status}
      </div>

      <div style={{marginTop:10, color:'#666'}}>
        Note: matchmaking is immediate and deterministic — earliest users in the queue are matched.
      </div>
    </div>
  )
}
