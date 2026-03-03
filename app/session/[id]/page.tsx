// app/session/[id]/page.tsx
'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { db, doc, getDoc, updateDoc } from '../../../lib/firebase'
import { usePathname } from 'next/navigation'
const JitsiRoom = dynamic(() => import('../../../components/JitsiRoom'), { ssr: false })

export default function SessionPage(){
  const pathname = usePathname()
  const id = pathname.split('/').pop() || ''
  const [session, setSession] = useState<any>(null)

  useEffect(()=>{
    if(!id) return
    const load = async ()=>{
      const snap = await getDoc(doc(db,'sessions', id))
      if(snap.exists()) setSession(snap.data())
    }
    load()
  },[id])

  // mark lastUpdated on unload - simple client touch
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
      <div className="bg-white rounded shadow p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-lg font-bold">Session</div>
            <div className="text-sm text-slate-500">{session?.exam} • {session?.subject}</div>
          </div>
          <div className="text-sm">Participants: {session?.participants?.length || 1}</div>
        </div>
      </div>

      <div className="mt-4">
        <JitsiRoom roomId={id} displayName={session?.displayName || 'Student'} />
      </div>
    </div>
  )
}
