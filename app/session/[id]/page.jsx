// app/session/[id]/page.jsx
'use client'
import { useEffect, useState } from 'react'
import { db, auth } from '../../../lib/firebase'
import { doc, onSnapshot } from 'firebase/firestore'
import dynamic from 'next/dynamic'
import Link from 'next/link'

// dynamic import to avoid SSR issues with getUserMedia/RTCPeerConnection
const WebRTCRoom = dynamic(() => import('../../../components/WebRTCRoom'), { ssr: false })

export default function SessionPage({ params }) {
  const sessionId = params.id
  const [session, setSession] = useState(null)
  useEffect(() => {
    const ref = doc(db, 'sessions', sessionId)
    const unsub = onSnapshot(ref, snap => {
      if (snap.exists()) setSession({ id: snap.id, ...snap.data() })
    })
    return () => unsub()
  }, [sessionId])

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h2>Session — {session ? session.exam + ' • ' + session.subject : sessionId}</h2>
        <div><Link href="/"><button>Home</button></Link></div>
      </div>

      {session ? (
        <>
          <p>Participants: {session.participants?.length ?? 0}</p>
          <div style={{marginTop:16}}>
            <WebRTCRoom sessionId={sessionId} session={session} />
          </div>
        </>
      ) : (
        <p>Loading session…</p>
      )}
    </div>
  )
}
