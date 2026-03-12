'use client'
// app/session/[id]/page.jsx
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore'
import { db, auth } from '../../../lib/firebase'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const WebRTCRoom = dynamic(() => import('../../../components/WebRTCRoom'), { ssr: false })

export default function SessionPage({ params }) {
  const sessionId = params.id
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [joined, setJoined] = useState(false)
  const [shouldAutoJoin, setShouldAutoJoin] = useState(false) // <-- flag passed to WebRTCRoom
  const router = useRouter()
  const userRef = useRef(null)

  useEffect(() => {
    const unsubAuth = auth.onAuthStateChanged(u => { userRef.current = u })
    const ref = doc(db, 'sessions', sessionId)
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) { setSession(null); setLoading(false); return }
      setSession({ id: snap.id, ...snap.data() })
      setLoading(false)
    }, (err) => {
      console.error('session snapshot error', err)
      setLoading(false)
    })
    return () => { unsub(); unsubAuth() }
  }, [sessionId])

  async function startSessionNow() {
    if (!userRef.current) { alert('Sign in required on this device'); return }
    try {
      // This is a user gesture. We'll both set startedAt AND trigger auto-join in child.
      const ref = doc(db, 'sessions', sessionId)
      await updateDoc(ref, { startedAt: serverTimestamp(), status: 'active' })
      // Tell child component to auto-join (this click is the user gesture so autoplay/audio will be allowed)
      setShouldAutoJoin(true)
      setJoined(true)
    } catch (e) {
      console.error('startSessionNow failed', e)
      alert('Failed to start session: ' + (e.message || e))
    }
  }

  async function endSession() {
    try {
      const ref = doc(db, 'sessions', sessionId)
      await updateDoc(ref, { status: 'finished', endedAt: serverTimestamp() })
    } catch (e) {
      console.error('endSession failed', e)
      alert('Failed to end session: ' + (e.message || e))
    }
  }

  if (loading) return <div style={{padding:20}}>Loading session…</div>
  if (!session) return <div style={{padding:20}}>Session not found</div>

  const participants = session.participants || []
  const participantNames = participants.map(p => p.name).join(', ')

  return (
    <div style={{padding:20}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h2>Session — {session.exam} / {session.subject}</h2>
        <div><Link href="/"><button>Home</button></Link></div>
      </div>

      <div style={{marginTop:12}}>
        <div><strong>Matched with:</strong> {participantNames || '—'}</div>
        <div style={{marginTop:6}}><strong>Status:</strong> <span style={{color: session.status === 'active' ? 'green' : (session.status === 'finished' ? '#888' : '#444')}}>{session.status}</span></div>
      </div>

      <div style={{marginTop:16, display:'flex', gap:8}}>
        {/* This button BOTH marks session started AND triggers child to join automatically (user gesture) */}
        <button onClick={startSessionNow}>Start session (join video)</button>
        <button onClick={endSession} style={{background:'#f33', color:'#fff'}}>End session</button>
      </div>

      <div style={{marginTop:20}}>
        {/* Pass `shouldAutoJoin` so child will run joinMeeting() immediately after the user gesture */}
        <WebRTCRoom sessionId={sessionId} session={session} autoJoin={shouldAutoJoin} />
      </div>

    </div>
  )
}
