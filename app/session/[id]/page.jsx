'use client'

import { useEffect, useState } from 'react'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../../lib/firebase'
import WebRTCRoom from '../../../components/WebRTCRoom'
import Link from 'next/link'

// This page is intentionally minimal.
// All post-session UI (rating, report, summary, end card)
// is handled inside WebRTCRoom — do NOT intercept session.status here.

export default function SessionPage({ params }) {
  const sessionId = params.id
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(function() {
    var ref = doc(db, 'sessions', sessionId)
    var unsub = onSnapshot(ref, function(snap) {
      if (!snap.exists()) {
        setSession(null)
        setLoading(false)
        return
      }
      setSession(Object.assign({ id: snap.id }, snap.data()))
      setLoading(false)
    })
    return function() { unsub() }
  }, [sessionId])

  if (loading) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#080d18',
        color: '#64748b', fontFamily: 'system-ui, sans-serif', fontSize: 16
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 40, marginBottom: 14 }}>⏳</div>
          <div>Loading session...</div>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center',
        justifyContent: 'center', background: '#080d18',
        fontFamily: 'system-ui, sans-serif', padding: 24
      }}>
        <div style={{ textAlign: 'center', color: '#e2e8f0' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Session not found</div>
          <div style={{ color: '#64748b', marginBottom: 20, fontSize: 14 }}>
            This session may have ended or the link is incorrect.
          </div>
          <Link href="/join" style={{
            padding: '11px 24px', borderRadius: 12,
            background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
            color: '#fff', fontWeight: 800, textDecoration: 'none', fontSize: 14
          }}>
            Start a new session →
          </Link>
        </div>
      </div>
    )
  }

  // Hand off everything to WebRTCRoom.
  // It handles: video call, chapter selection, timer,
  // session summary (pro), rating, report, and end card.
  return <WebRTCRoom sessionId={sessionId} session={session} />
}
