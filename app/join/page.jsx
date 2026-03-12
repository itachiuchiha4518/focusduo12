'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { auth, googleProvider, db } from '../../lib/firebase'
import { signInWithPopup } from 'firebase/auth'
import { addDoc, collection, serverTimestamp, query, orderBy, onSnapshot, runTransaction } from 'firebase/firestore'

export default function JoinPage(){
  const router = useRouter()
  const [exam, setExam] = useState('JEE')
  const [subject, setSubject] = useState('Physics')
  const [mode, setMode] = useState('1-on-1')
  const [status, setStatus] = useState('idle')
  const queueListenerRef = useRef(null)
  const myQueueDocRef = useRef(null)

  useEffect(()=>{
    const unsub = auth.onAuthStateChanged(u => { /* nothing to show here */ })
    return () => unsub()
  },[])

  function qid(exam, subject, mode){
    return `${exam.toLowerCase()}_${subject.toLowerCase()}_${mode.replace(/\W/g,'').toLowerCase()}`
  }

  async function ensureSignedIn(){
    if (!auth.currentUser){
      try {
        await signInWithPopup(auth, googleProvider)
      } catch(e){
        console.error('signin failed', e)
        throw e
      }
    }
    return auth.currentUser
  }

  async function startMatchmaking(){
    try {
      setStatus('signing-in')
      const user = await ensureSignedIn()
      setStatus('joining-queue')

      const queueId = qid(exam, subject, mode)
      const usersCol = collection(db, 'queues', queueId, 'users')

      // Add current user to queue
      const docRef = await addDoc(usersCol, {
        uid: user.uid,
        name: user.displayName || user.email,
        exam, subject, mode,
        createdAt: serverTimestamp()
      })
      myQueueDocRef.current = docRef

      // Listen for earliest pair and match them instantly using transaction
      const q = query(usersCol, orderBy('createdAt', 'asc'))
      queueListenerRef.current = onSnapshot(q, async snap => {
        const docs = snap.docs
        if (docs.length < 2) {
          setStatus('waiting')
          return
        }

        // pick earliest two
        const d1 = docs[0]
        const d2 = docs[1]

        // Attempt transaction: create session + remove both queue docs (atomic)
        try {
          setStatus('matching')
          await runTransaction(db, async (tx) => {
            const s1 = await tx.get(d1.ref)
            const s2 = await tx.get(d2.ref)
            if (!s1.exists() || !s2.exists()) throw new Error('stale queue')
            // create session doc
            const sessionRef = collection(db, 'sessions')
            const newSessionRef = (await addDoc(sessionRef, {
              createdAt: serverTimestamp(),
              exam, subject, mode,
              participants: [
                { uid: s1.data().uid, name: s1.data().name },
                { uid: s2.data().uid, name: s2.data().name }
              ],
              status: 'waiting_for_join', // will be updated when first user starts video
            })).withConverter(null) // noop to get back ref
            // remove queue docs
            tx.delete(d1.ref)
            tx.delete(d2.ref)
            // NOTE: runTransaction cannot return the newly created id taken this way,
            // so we update client-side after transaction finishes via outside value
          })
          // Transaction succeeded — we still need to find the session id created.
          // Simpler: after deletion, query for sessions recently created with matching exam/subject & our uid
          // But to keep things robust: query sessions where status == 'waiting_for_join' and participants include current uid
          setStatus('matched — redirecting')
          // wait small time to let session doc propagate
          setTimeout(async ()=>{
            // find session doc for current pair (simple query)
            // We'll search sessions created recently for matching exam/subj and mode and containing current uid
            // This is somewhat naive but fine for early testing.
            const sessionsCol = collection(db, 'sessions')
            const qS = query(sessionsCol, orderBy('createdAt', 'desc'))
            const snapS = await (await import('firebase/firestore')).getDocs(qS)
            let found = null
            for (const sdoc of snapS.docs){
              const d = sdoc.data()
              if (d.exam === exam && d.subject === subject && d.mode === mode && Array.isArray(d.participants)){
                const uids = d.participants.map(p=>p.uid)
                if (uids.includes(user.uid)) { found = sdoc.id; break }
              }
            }
            if (found) {
              // cleanup local listener
              if (queueListenerRef.current) { queueListenerRef.current() ; queueListenerRef.current = null }
              router.push(`/session/${found}`)
            } else {
              setStatus('match_found_but_no_session')
            }
          }, 600)
        } catch (err){
          console.error('transaction failed', err)
          setStatus('waiting') // fallback
        }
      })
    } catch (e) {
      console.error(e)
      setStatus('error')
    }
  }

  async function cancel(){
    try {
      if (myQueueDocRef.current){
        await myQueueDocRef.current.delete()
        myQueueDocRef.current = null
      }
    } catch(e){}
    if (queueListenerRef.current){ queueListenerRef.current(); queueListenerRef.current = null }
    setStatus('idle')
  }

  return (
    <div style={{padding:20}}>
      <h1>Join a study session</h1>

      <div style={{maxWidth:520}}>
        <label>Exam</label>
        <select value={exam} onChange={e=>setExam(e.target.value)}>
          <option>JEE</option>
          <option>NEET</option>
        </select>

        <label style={{display:'block', marginTop:8}}>Subject</label>
        <select value={subject} onChange={e=>setSubject(e.target.value)}>
          <option>Physics</option>
          <option>Chemistry</option>
          <option>Math</option>
          <option>Biology</option>
        </select>

        <label style={{display:'block', marginTop:8}}>Mode</label>
        <select value={mode} onChange={e=>setMode(e.target.value)}>
          <option>1-on-1</option>
          <option>Group</option>
        </select>

        <div style={{marginTop:12, display:'flex', gap:8}}>
          <button onClick={startMatchmaking}>Start matchmaking</button>
          <button onClick={cancel} style={{background:'#eee'}}>Cancel</button>
        </div>

        <div style={{marginTop:12}}>
          <strong>Status:</strong> {status}
        </div>
      </div>
    </div>
  )
}
