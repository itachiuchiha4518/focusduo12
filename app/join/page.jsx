// app/join/page.jsx
'use client'
import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { auth, onAuthStateChanged, db, collection, addDoc, query, where, getDocs, deleteDoc, doc } from '../../lib/firebase'

export default function JoinPage(){
  const params = useSearchParams()
  const mode = params.get('mode') || ''
  const exam = params.get('exam') || ''
  const subject = params.get('subject') || ''
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('idle')

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, u => {
      if(!u) router.push('/')
      else setUser(u)
    })
    return () => unsub && unsub()
  },[])

  useEffect(()=>{ if(user && mode && exam && subject) startMatch() }, [user, mode, exam, subject])

  async function startMatch(){
    setStatus('joining')
    const qRef = await addDoc(collection(db,'queues'), { uid: user.uid, exam, subject, mode, createdAt: new Date().toISOString() })

    if(mode === 'one-on-one'){
      const q = query(collection(db,'queues'), where('mode','==','one-on-one'), where('exam','==', exam), where('subject','==', subject))
      const snap = await getDocs(q)
      let partnerDoc = null
      snap.forEach(s => {
        const d = s.data()
        if(d.uid !== user.uid && !partnerDoc) partnerDoc = { id: s.id, data: d }
      })
      if(partnerDoc){
        const session = await addDoc(collection(db,'sessions'), { participants: [user.uid, partnerDoc.data.uid], exam, subject, mode: 'one-on-one', startTime: new Date().toISOString(), status: 'active' })
        try{ await deleteDoc(doc(db,'queues', partnerDoc.id)) }catch(e){}
        try{ await deleteDoc(doc(db,'queues', qRef.id)) }catch(e){}
        router.push(`/session/${session.id}`)
        return
      }
    }

    if(mode === 'group'){
      const q = query(collection(db,'queues'), where('mode','==','group'), where('exam','==', exam), where('subject','==', subject))
      const snap = await getDocs(q)
      const participants = []
      snap.forEach(s => { if(participants.length < 4) participants.push({ id: s.id, uid: s.data().uid }) })
      if(!participants.find(p=>p.uid===user.uid)) participants.push({ id: qRef.id, uid: user.uid })
      if(participants.length >= 2){
        const session = await addDoc(collection(db,'sessions'), { participants: participants.map(p=>p.uid), exam, subject, mode: 'group', startTime: new Date().toISOString(), status: 'active' })
        for(const p of participants) try{ await deleteDoc(doc(db,'queues', p.id)) }catch(e){}
        router.push(`/session/${session.id}`)
        return
      }
    }

    setStatus('waiting')
  }

  return (
    <div className="container mt-8">
      <div className="card p-4">
        <h3>Matchmaking</h3>
        <div>Mode: {mode} • Exam: {exam} • Subject: {subject}</div>
        <div>Status: {status}</div>
        <div style={{marginTop:12}}><a href="/dashboard" className="btn">Back to dashboard</a></div>
      </div>
    </div>
  )
}
