'use client'

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import WebRTCRoom from '../../../components/WebRTCRoom'
import Link from 'next/link'

export default function SessionPage({ params }) {
  const sessionId = params.id
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ref = doc(db, 'sessions', sessionId)
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) {
        setSession(null)
        setLoading(false)
        return
      }
      setSession({ id: snap.id, ...snap.data() })
      setLoading(false)
    })

    return () => unsub()
  }, [sessionId])

  if (loading) return <div style={{ padding: 20 }}>Loading session…</div>
  if (!session) return <div style={{ padding: 20 }}>Session not found</div>

  const names = (session.participants || []).map(p => p.name).join(', ')

  return (
    <div style={{ padding: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2>Session</h2>
        <Link href="/"><button>Home</button></Link>
      </div>

      <div style={{ marginTop: 12 }}>
        <div><strong>Exam:</strong> {session.exam} • <strong>Subject:</strong> {session.subject}</div>
        <div style={{ marginTop: 8 }}><strong>Matched:</strong> {names}</div>
        <div style={{ marginTop: 8 }}><strong>Status:</strong> {session.status}</div>
      </div>

      <div style={{ marginTop: 18 }}>
        <WebRTCRoom sessionId={sessionId} session={session} />
      </div>
    </div>
  )
}
