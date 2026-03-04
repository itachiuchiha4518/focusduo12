// app/session/[id]/page.jsx
'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { db, doc, getDoc, updateDoc } from '../../../lib/firebase'
const JitsiRoom = dynamic(() => import('../../../components/JitsiRoom'), { ssr: false })

export default function SessionPage(){
  const pathname = usePathname()
  const id = pathname.split('/').pop() || ''
  const [session, setSession] = useState(null)

  useEffect(()=>{
    if(!id) return
    const load = async ()=>{
      const snap = await getDoc(doc(db,'sessions', id))
      if(snap.exists()) setSession(snap.data())
    }
    load()
  },[id])

  useEffect(()=>{
    const onUnload = async () => {
      if(!id) return
      try{ await updateDoc(doc(db,'sessions', id), { lastUpdated: new Date().toISOString() }) }catch(e){}
    }
    window.addEventListener('beforeunload', onUnload)
    return ()=> window.removeEventListener('beforeunload', onUnload)
  },[id])

  if(!id) return <div className="container p-6">Loading session...</div>

  return (
    <div className="container mt-6">
      <div className="card p-4" style={{display:'flex', justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:16, fontWeight:700}}>Session</div>
          <div className="muted">{session?.exam} • {session?.subject}</div>
        </div>
        <div className="muted">Participants: {session?.participants?.length || 1}</div>
      </div>

      <div style={{marginTop:12}}>
        <JitsiRoom roomId={id} displayName={session?.displayName || 'Student'} />
      </div>
    </div>
  )
}
