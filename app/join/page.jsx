// app/join/page.jsx
'use client'
import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { auth, onAuthStateChanged, db, collection, addDoc, query, where, getDocs, deleteDoc, doc } from '../../lib/firebase'

export default function JoinPage(){
  const params = useSearchParams()
  const mode = params.get('mode') || ''
  const exam = params.get('exam') || ''
  const subject = params.get('subject') || ''
  const router = useRouter()

  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('idle')
  const queueDocRef = useRef(null)
  const pollRef = useRef(null)

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, u => {
      if (!u) router.push('/')
      else setUser(u)
    })
    return () => unsub && unsub()
  },[router])

  useEffect(()=>{
    if (!user || !mode || !exam || !subject) return
    startMatch()
    // cleanup on unmount
    return () => {
      stopPolling()
      removeQueueDoc()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mode, exam, subject])

  async function createQueueDoc(){
    try {
      const qRef = await addDoc(collection(db, 'queues'), {
        uid: user.uid,
        exam,
        subject,
        mode,
        createdAt: new Date().toISOString()
      })
      queueDocRef.current = qRef
      return qRef
    } catch (e) {
      console.error('createQueueDoc error', e)
      setStatus('error')
      return null
    }
  }

  async function removeQueueDoc(){
    try {
      if (queueDocRef.current) {
        await deleteDoc(doc(db, 'queues', queueDocRef.current.id))
        queueDocRef.current = null
      }
    } catch(e){ console.warn('removeQueueDoc failed', e) }
  }

  async function checkForMatch(){
    // find other docs in same exam/subject/mode
    try {
      if (mode === 'one-on-one') {
        const q = query(collection(db, 'queues'), where('mode', '==', 'one-on-one'), where('exam','==', exam), where('subject','==', subject))
        const snap = await getDocs(q)
        let partner = null
        snap.forEach(s => {
          if (s.data().uid !== user.uid && !partner) partner = { id: s.id, ...s.data() }
        })
        if (partner) {
          // create session and remove both queue docs
          const sessionRef = await addDoc(collection(db, 'sessions'), {
            participants: [user.uid, partner.uid],
            exam, subject, mode: 'one-on-one',
            startTime: new Date().toISOString(),
            status: 'active'
          })
          // remove partner queue
          try { await deleteDoc(doc(db,'queues', partner.id)) } catch(e){ console.warn(e) }
          // remove self queue
          try { if (queueDocRef.current) await deleteDoc(doc(db,'queues', queueDocRef.current.id)) } catch(e){ console.warn(e) }
          stopPolling()
          router.push(`/session/${sessionRef.id}`)
          return true
        }
      } else if (mode === 'group') {
        const q = query(collection(db,'queues'), where('mode','==','group'), where('exam','==', exam), where('subject','==', subject))
        const snap = await getDocs(q)
        const participants = []
        snap.forEach(s => {
          if (participants.length < 4) participants.push({ id: s.id, uid: s.data().uid })
        })
        // ensure we are included
        if (!participants.find(p => p.uid === user.uid)) {
          participants.push({ id: queueDocRef.current?.id, uid: user.uid })
        }
        if (participants.length >= 2) {
          // create session
          const sessionRef = await addDoc(collection(db,'sessions'), {
            participants: participants.map(p=>p.uid),
            exam, subject, mode: 'group',
            startTime: new Date().toISOString(),
            status: 'active'
          })
          // remove their queue docs
          for (const p of participants) {
            try { await deleteDoc(doc(db,'queues', p.id)) } catch(e) {}
          }
          stopPolling()
          router.push(`/session/${sessionRef.id}`)
          return true
        }
      }
      return false
    } catch(e){
      console.error('checkForMatch error', e)
      setStatus('error')
      return false
    }
  }

  function startPolling(){
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      const matched = await checkForMatch()
      if (matched) {
        // matched will route away
      } else {
        setStatus('waiting')
      }
    }, 3000)
  }

  function stopPolling(){
    if (pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
    }
  }

  async function startMatch(){
    setStatus('joining')
    const qRef = await createQueueDoc()
    if (!qRef) return setStatus('error')
    setStatus('waiting')
    // immediately check once
    const matchedNow = await checkForMatch()
    if (matchedNow) return
    // otherwise start polling
    startPolling()
  }

  return (
    <div className="container mt-8">
      <div className="card p-4">
        <h3>Matchmaking</h3>
        <div style={{marginTop:8}}>Mode: {mode} • Exam: {exam} • Subject: {subject}</div>
        <div style={{marginTop:8}}>Status: {status}</div>
        <div style={{marginTop:12}}>
          <a href="/dashboard" className="btn">Back to dashboard</a>
          <button onClick={async ()=>{ stopPolling(); await removeQueueDoc(); router.push('/dashboard') }} className="btn small" style={{marginLeft:8}}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
