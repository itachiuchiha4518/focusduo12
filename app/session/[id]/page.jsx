// app/session/[id]/page.jsx
'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { doc, onSnapshot, getDoc } from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import WebRTCRoom from '../../../components/WebRTCRoom'

export default function SessionPage() {
  const { id } = useParams()
  const router = useRouter()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    const sRef = doc(db, 'sessions', id)
    const unsub = onSnapshot(sRef, (snap) => {
      if (!snap.exists()) {
        setSession(null)
        setLoading(false)
        setError('Session not found')
        return
      }
      setSession(snap.data())
      setLoading(false)
      setError(null)
    }, (err) => {
      console.warn('session snapshot error', err)
      setError('Error reading session')
      setLoading(false)
    })

    return () => unsub && unsub()
  }, [id])

  if (loading) return <div style={{ padding: 18 }}>Loading session...</div>
  if (error) return <div style={{ padding: 18, color: 'red' }}>{error}</div>
  if (!session) return <div style={{ padding: 18 }}>No session found.</div>

  const { exam, subject, mode } = session
  // use the session id as roomId for WebRTCRoom
  return (
    <div style={{ padding: 18, maxWidth: 980, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>Session</h1>
          <div style={{ color: '#666' }}>{(exam || '').toUpperCase()} • {(subject || '').toUpperCase()} • {mode}</div>
        </div>
      </header>

      <section style={{ marginTop: 18 }}>
        <div style={{ padding: 14, borderRadius: 12, background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,0.04)' }}>
          <div>Session id: <strong>{id}</strong></div>
          <div style={{ marginTop: 8 }}>Participants: {session.users ? session.users.length : 0}</div>
        </div>
      </section>

      <section style={{ marginTop: 18 }}>
        {/* Start the WebRTC room. Make sure you have the component WebRTCRoom implemented */}
        <WebRTCRoom roomId={id} displayName={''} />
      </section>
    </div>
  )
}
