// app/session/[id]/page.jsx
'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import PeerRoom from '../../../components/PeerRoom'
import JitsiRoom from '../../../components/JitsiRoom'

import {
  auth,
  onAuthStateChanged,
  db,
  doc,
  onSnapshot,
  setDoc,
  getDoc
} from '../../../lib/firebase'

const ADMIN_UID = 'NIsbHB9RmXgR5vJEyv8CuV0ggD03'

export default function SessionPage() {
  const { id } = useParams()
  const router = useRouter()

  const [user, setUser] = useState(null)
  const [loadingUser, setLoadingUser] = useState(true)

  const [session, setSession] = useState(null)
  const [loadingSession, setLoadingSession] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (!u) {
        router.push('/')
        return
      }
      setUser(u)
      setLoadingUser(false)
    })
    return () => unsub && unsub()
  }, [router])

  useEffect(() => {
    if (!id) return
    setLoadingSession(true)
    const sRef = doc(db, 'sessions', id)
    const unsub = onSnapshot(sRef, (snap) => {
      if (!snap.exists()) {
        setSession(null)
        setLoadingSession(false)
        setError('Session not found')
        return
      }
      setSession(snap.data())
      setLoadingSession(false)
      setError(null)
    }, (err) => {
      console.warn('session snapshot error', err)
      setError('Error reading session: ' + (err.message || err))
      setLoadingSession(false)
    })

    return () => unsub && unsub()
  }, [id])

  if (loadingUser || loadingSession) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Loading session...</h2>
        <div style={{ color: '#666' }}>If this takes long, refresh the page once.</div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Error</h2>
        <div style={{ color: 'red' }}>{error}</div>
        <div style={{ marginTop: 12 }}>
          <button onClick={() => router.push('/')} style={{ padding: '8px 12px' }}>Back to dashboard</button>
        </div>
      </div>
    )
  }

  if (!session) {
    return (
      <div style={{ padding: 20 }}>
        <h2>Session not found</h2>
        <div style={{ marginTop: 12 }}>
          <button onClick={() => router.push('/')} style={{ padding: '8px 12px' }}>Back to dashboard</button>
        </div>
      </div>
    )
  }

  const users = session.users || []
  const names = session.names || []
  const mode = (session.mode || 'one-on-one')
  const exam = session.exam || ''
  const subject = session.subject || ''
  const sessionStatus = session.status || 'waiting'

  const isCreator = user && users[0] === user.uid
  const otherIndex = users[0] === user.uid ? 1 : 0
  const matchedWithName = names[otherIndex] || (users.length > 1 ? users[otherIndex] : null)

  const startMeeting = async () => {
    try {
      const sRef = doc(db, 'sessions', id)
      await setDoc(sRef, { status: 'active', startedAt: Date.now() }, { merge: true })
    } catch (e) {
      console.error('startMeeting failed', e)
      alert('Could not start meeting: ' + (e.message || e))
    }
  }

  const leaveSession = async () => {
    try { router.push('/') } catch (e) { console.warn('leaveSession', e) }
  }

  return (
    <div style={{ padding: 18, maxWidth: 980, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ margin: 0 }}>Session</h1>
          <div style={{ color: '#666' }}>{exam.toUpperCase()} • {subject.toUpperCase()}</div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14 }}>{user.displayName || user.email}</div>
          <div style={{ fontSize: 12, color: '#666' }}>uid: {user.uid}</div>
        </div>
      </header>

      <section style={{ marginTop: 18 }}>
        <div style={{ padding: 14, borderRadius: 12, background: '#fff', boxShadow: '0 8px 24px rgba(15,23,42,0.04)' }}>
          <div style={{ fontSize: 18, marginBottom: 6 }}>
            {mode === 'one-on-one' ? 'Matched with:' : 'Participants:'}
            {' '}
            <strong style={{ color: '#0f172a' }}>
              {mode === 'one-on-one' ? (matchedWithName || 'Waiting...') : (users.length || 0)}
            </strong>
          </div>

          <div style={{ marginTop: 6 }}>
            Session status: <strong style={{ color: sessionStatus === 'active' ? 'green' : '#0f172a' }}>{sessionStatus}</strong>
          </div>

          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            {isCreator && sessionStatus !== 'active' && (
              <button onClick={startMeeting} style={{ padding: '10px 14px', background: '#0b74ff', color: '#fff', borderRadius: 8 }}>
                Start meeting
              </button>
            )}
            <button onClick={leaveSession} style={{ padding: '10px 14px', borderRadius: 8 }}>Leave</button>

            {user.uid === ADMIN_UID && (
              <button onClick={() => router.push('/admin')} style={{ padding: '10px 14px', borderRadius: 8 }}>Admin</button>
            )}

            <button onClick={() => router.push('/')} style={{ padding: '10px 14px', borderRadius: 8 }}>Back to dashboard</button>
          </div>
        </div>
      </section>

      <section style={{ marginTop: 20 }}>
        {sessionStatus !== 'active' && (
          <div style={{ marginBottom: 12, color: '#666' }}>
            The meeting will start when the session status is active. Creator can press "Start meeting".
          </div>
        )}

        {sessionStatus === 'active' && mode === 'one-on-one' && (
          <PeerRoom
            sessionId={id}
            localName={user.displayName || user.email}
            userUid={user.uid}
            isInitiator={isCreator}
          />
        )}

        {sessionStatus === 'active' && mode === 'group' && (
          <JitsiRoom roomId={id} displayName={user.displayName || user.email} sessionId={id} />
        )}

        {sessionStatus !== 'active' && (
          <div style={{ marginTop: 22, color: '#888' }}>
            Waiting for the creator to start the session...
          </div>
        )}
      </section>
    </div>
  )
}
