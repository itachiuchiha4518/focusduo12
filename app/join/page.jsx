'use client'
/*
 app/join/page.jsx
 Deterministic matchmaking: transaction creates session + initiatorUid + userMatches
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
  limit as fbLimit
} from 'firebase/firestore'

export default function JoinPage() {
  const router = useRouter()
  const [exam, setExam] = useState('JEE')
  const [subject, setSubject] = useState('Physics')
  const [mode, setMode] = useState('1-on-1')
  const [status, setStatus] = useState('idle')
  const myQueueDocRef = useRef(null)
  const queueUnsubRef = useRef(null)
  const userMatchUnsubRef = useRef(null)
  const [user, setUser] = useState(null)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => setUser(u))
    return () => unsub()
  }, [])

  function queueKey(exam, subject, mode){
    return `${exam.toLowerCase()}__${subject.toLowerCase()}__${mode.replace(/\W/g,'').toLowerCase()}`
  }

  async function ensureSignedIn(){
    if (auth.currentUser) return auth.currentUser
    const res = await signInWithPopup(auth, googleProvider)
    return res.user
  }

  async function startMatchmaking(){
    setStatus('starting')
    try {
      const me = await ensureSignedIn()
      setUser(me)
      setStatus('joining-queue')

      const qk = queueKey(exam, subject, mode)
      const usersCol = collection(db, 'queues', qk, 'users')
      const qRef = await addDoc(usersCol, {
        uid: me.uid,
        name: me.displayName || me.email || 'Student',
        createdAt: serverTimestamp()
      })
      myQueueDocRef.current = qRef

      // listen for our userMatches doc for redirect
      const myMatchRef = doc(db, 'userMatches', me.uid)
      userMatchUnsubRef.current = onSnapshot(myMatchRef, snap => {
        if (!snap.exists()) return
        const data = snap.data()
        if (data && data.sessionId) {
          // cleanup listeners and redirect
          cleanupListeners()
          router.push(`/session/${data.sessionId}`)
        }
      })

      setStatus('waiting')

      // watch queue and attempt match when possible
      const q = query(usersCol, orderBy('createdAt', 'asc'))
      queueUnsubRef.current = onSnapshot(q, async snap => {
        const docs = snap.docs
        // For 1-on-1 we match first two, for group use up to 5
        const maxGroupSize = mode === 'group' ? 5 : 2
        if (docs.length < 2) { setStatus('waiting'); return }

        const candidates = docs.slice(0, maxGroupSize)

        // run transaction: ensure docs exist, create session with initiatorUid = earliest uid,
        // set userMatches/{uid} for each participant, delete queue docs
        try {
          setStatus('matching')
          const newSessionId = await runTransaction(db, async (tx) => {
            // re-read docs
            const snapDocs = []
            for (const c of candidates){
              const sd = await tx.get(c.ref)
              if (!sd.exists()) throw new Error('stale')
              snapDocs.push({ id: c.id, ref: c.ref, data: sd.data() })
            }

            // deterministically order by createdAt (should already be)
            const participants = snapDocs.map(s => ({ uid: s.data.uid, name: s.data.name }))

            // create session doc ref
            const sessionsCol = collection(db, 'sessions')
            const newSessionRef = doc(sessionsCol) // create new ref with ID
            const initiatorUid = participants[0].uid

            tx.set(newSessionRef, {
              createdAt: serverTimestamp(),
              exam,
              subject,
              mode,
              participants,
              initiatorUid,
              status: 'waiting_for_join'
            })

            // write userMatches/uid for each participant so clients get notified
            for (const p of participants){
              const umRef = doc(db, 'userMatches', p.uid)
              tx.set(umRef, { sessionId: newSessionRef.id, createdAt: serverTimestamp() })
            }

            // delete queue docs
            for (const s of snapDocs) tx.delete(s.ref)

            return newSessionRef.id
          })

          // transaction succeeded. userMatches listeners will redirect both users.
          setStatus('matched')
        } catch (err) {
          console.warn('transaction failed', err)
          setStatus('waiting')
        }
      })
    } catch (err) {
      console.error('startMatchmaking error', err)
      setStatus('error')
    }
  }

  async function cancelMatchmaking(){
    setStatus('cancelling')
    try {
      if (myQueueDocRef.current) {
        try { await myQueueDocRef.current.delete() } catch(e){}
        myQueueDocRef.current = null
      }
      cleanupListeners()
      setStatus('idle')
    } catch (e) {
      setStatus('idle')
    }
  }

  function cleanupListeners(){
    try { if (queueUnsubRef.current) { queueUnsubRef.current(); queueUnsubRef.current = null } } catch(e){}
    try { if (userMatchUnsubRef.current) { userMatchUnsubRef.current(); userMatchUnsubRef.current = null } } catch(e){}
  }

  return (
    <div style={{padding:20, maxWidth:720}}>
      <h2>Join a study session</h2>
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

      <div style={{marginTop:12, display:'flex', gap:8}}>
        <button onClick={startMatchmaking}>Start matchmaking</button>
        <button onClick={cancelMatchmaking} style={{background:'#eee', color:'#000'}}>Cancel</button>
      </div>

      <div style={{marginTop:12}}>
        <strong>Status</strong>: {status}
      </div>

      <div style={{marginTop:10, color:'#666'}}>Note: matchmaking is immediate and deterministic — earliest users are matched and removed from the queue atomically.</div>
    </div>
  )
}
