// app/join/page.jsx
'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { auth } from '../../lib/firebase'
import { signInWithPopup } from 'firebase/auth'
import { googleProvider, db } from '../../lib/firebase'
import { addDoc, collection, serverTimestamp, query, orderBy, onSnapshot, doc, runTransaction } from 'firebase/firestore'

export default function JoinPage() {
  const router = useRouter()
  const [exam, setExam] = useState('JEE')
  const [subject, setSubject] = useState('Physics')
  const [mode, setMode] = useState('1-on-1')
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('idle')
  const userDocRef = useRef(null) // store queue doc ref
  const unsubQueueListener = useRef(null)

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged(u => {
      setUser(u)
    })
    return unsubscribe
  }, [])

  async function loginGoogle() {
    try {
      setStatus('signing-in')
      await signInWithPopup(auth, googleProvider)
      setStatus('idle')
    } catch (e) {
      console.error(e)
      setStatus('error signing in')
    }
  }

  function queueIdFor(exam, subject, mode) {
    // normalized queue id
    return `${exam.toLowerCase()}_${subject.toLowerCase()}_${mode.replace(/[^a-z0-9]/gi,'').toLowerCase()}`
  }

  async function startMatchmaking() {
    if (!user) {
      await loginGoogle()
      if (!auth.currentUser) return
      setUser(auth.currentUser)
    }
    setStatus('joining-queue')
    const qid = queueIdFor(exam, subject, mode)
    const usersCol = collection(db, 'queues', qid, 'users')
    // add me to queue
    const docRef = await addDoc(usersCol, {
      uid: auth.currentUser.uid,
      name: auth.currentUser.displayName || auth.currentUser.email,
      exam, subject, mode,
      createdAt: serverTimestamp()
    })
    userDocRef.current = docRef

    // listen for the queue and attempt match when at least 2 are present
    const q = query(usersCol, orderBy('createdAt', 'asc'))
    unsubQueueListener.current = onSnapshot(q, async snap => {
      const docs = snap.docs
      // if less than 2, nothing to match
      if (docs.length < 2) {
        setStatus('waiting')
        return
      }
      // pick earliest two
      const first = docs[0]
      const second = docs[1]
      // attempt to create session (transaction)
      try {
        setStatus('matching')
        const sessionId = await runTransaction(db, async (tx) => {
          const d1 = await tx.get(first.ref)
          const d2 = await tx.get(second.ref)
          if (!d1.exists() || !d2.exists()) throw 'no docs'
          // create session doc
          const sessionRef = doc(collection(db, 'sessions'))
          const p1 = d1.data()
          const p2 = d2.data()
          tx.set(sessionRef, {
            createdAt: serverTimestamp(),
            exam,
            subject,
            mode,
            participants: [
              { uid: p1.uid, name: p1.name },
              { uid: p2.uid, name: p2.name }
            ],
            initiatorUid: p1.uid,
            status: 'active'
          })
          // delete both queue docs
          tx.delete(first.ref)
          tx.delete(second.ref)
          return sessionRef.id
        })
        // success: navigate both users to session page
        setStatus('matched')
        // cleanup local listener / doc
        if (unsubQueueListener.current) unsubQueueListener.current()
        try { /* remove local doc if still exists */ } catch(e){}
        router.push(`/session/${sessionId}`)
      } catch (err) {
        console.error('match transaction failed', err)
        setStatus('waiting')
      }
    })
  }

  async function cancelQueue() {
    if (userDocRef.current) {
      try {
        await userDocRef.current.delete()
      } catch (e) { /* ignore */ }
      userDocRef.current = null
    }
    if (unsubQueueListener.current) {
      unsubQueueListener.current()
      unsubQueueListener.current = null
    }
    setStatus('idle')
  }

  return (
    <div>
      <h2>Join a study session</h2>

      <div style={{maxWidth:520}}>
        <label>Exam</label>
        <select value={exam} onChange={e=>setExam(e.target.value)} style={{display:'block',padding:8}}>
          <option>JEE</option>
          <option>NEET</option>
        </select>

        <label style={{marginTop:8}}>Subject</label>
        <select value={subject} onChange={e=>setSubject(e.target.value)} style={{display:'block',padding:8}}>
          <option>Physics</option>
          <option>Chemistry</option>
          <option>Math</option>
          <option>Biology</option>
        </select>

        <label style={{marginTop:8}}>Mode</label>
        <select value={mode} onChange={e=>setMode(e.target.value)} style={{display:'block',padding:8}}>
          <option>1-on-1</option>
          <option>Group</option>
        </select>

        <div style={{marginTop:12, display:'flex', gap:8}}>
          <button onClick={startMatchmaking}>Start matchmaking</button>
          <button onClick={cancelQueue} style={{background:'#ddd',color:'#000'}}>Cancel</button>
        </div>

        <div style={{marginTop:12}}>
          <strong>Status:</strong> {status}
        </div>
      </div>
    </div>
  )
}
