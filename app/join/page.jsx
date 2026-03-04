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
  const [errorMsg, setErrorMsg] = useState(null)
  const [queueId, setQueueId] = useState(null)
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
      setQueueId(qRef.id)
      return qRef
    } catch (e) {
      console.error('createQueueDoc error', e)
      setErrorMsg(String(e.message || JSON.stringify(e)))
      setStatus('error')
      return null
    }
  }

  async function removeQueueDoc(){
    try {
      if (queueDocRef.current) {
        await deleteDoc(doc(db, 'queues', queueDocRef.current.id))
        queueDocRef.current = null
        setQueueId(null)
      }
    } catch(e){ console.warn('removeQueueDoc failed', e) }
  }

  async function checkForMatch(){
    try {
      if (mode === 'one-on-one') {
        const q = query(collection(db, 'queues'),
                        where('mode', '==', 'one-on-one'),
                        where('exam','==', exam),
                        where('subject','==', subject))
        const snap = await getDocs(q)
        let partner = null
        snap.forEach(s => {
          if (s.data().uid !== user.uid && !partner) partner = { id: s.id, ...s.data() }
        })
        if (partner) {
          const sessionRef = await addDoc(collection(db, 'sessions'), {
            participants: [user.uid, partner.uid],
            exam, subject, mode: 'one-on-one',
            startTime: new Date().toISOString(),
            status: 'active'
          })
          // remove partner queue and self
          try { await deleteDoc(doc(db,'queues', partner.id)) } catch(e){ console.warn(e) }
          try { if (queueDocRef.current) await deleteDoc(doc(db,'queues', queueDocRef.current.id)) } catch(e){ console.warn(e) }
          stopPolling()
          router.push(`/session/${sessionRef.id}`)
          return true
        }
      } else if (mode === 'group') {
        const q = query(collection(db,'queues'),
                        where('mode','==','group'),
                        where('exam','==', exam),
                        where('subject','==', subject))
        const snap = await getDocs(q)
        const participants = []
        snap.forEach(s => {
          if (participants.length < 4) participants.push({ id: s.id, uid: s.data().uid })
        })
        if (!participants.find(p => p.uid === user.uid)) {
          participants.push({ id: queueDocRef.current?.id, uid: user.uid })
        }
        if (participants.length >= 2) {
          const sessionRef = await addDoc(collection(db,'sessions'), {
            participants: participants.map(p=>p.uid),
            exam, subject, mode: 'group',
            startTime: new Date().toISOString(),
            status: 'active'
          })
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
      setErrorMsg(String(e.message || JSON.stringify(e)))
      setStatus('error')
      return false
    }
  }

  function startPolling(){
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      if (status === 'error') return
      const matched = await checkForMatch()
      if (!matched) setStatus('waiting')
    }, 3000)
  }

  function stopPolling(){
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function startMatch(){
    setStatus('joining')
    setErrorMsg(null)
    const qRef = await createQueueDoc()
    if (!qRef) return
    setStatus('waiting')
    const matchedNow = await checkForMatch()
    if (matchedNow) return
    startPolling()
  }

  return (
    <div className="container mt-8">
      <div className="card p-4" style={{maxWidth:700}}>
        <h3 style={{marginBottom:8}}>Matchmaking</h3>
        <div>Mode: {mode} • Exam: {exam} • Subject: {subject}</div>
        <div style={{marginTop:8}}>Status: {status}</div>
        {queueId && <div style={{marginTop:8}}><strong>Queue doc id:</strong> {queueId}</div>}
        {errorMsg && <div style={{marginTop:8, color:'#b91c1c'}}><strong>Error:</strong> {errorMsg}</div>}
        <div style={{marginTop:12}}>
          <a href="/dashboard" className="btn">Back to dashboard</a>
          <button onClick={async ()=>{ stopPolling(); await removeQueueDoc(); router.push('/dashboard') }} className="btn small" style={{marginLeft:8}}>Cancel</button>
          <a href="/debug" style={{marginLeft:12}} className="btn small">Open debug</a>
        </div>
      </div>
    </div>
  )
}
