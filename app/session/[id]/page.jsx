'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { doc, onSnapshot, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore'
import { db, auth } from '../../../lib/firebase'
import dynamic from 'next/dynamic'
import Link from 'next/link'

const WebRTCRoom = dynamic(() => import('../../../components/WebRTCRoom'), { ssr: false })

export default function SessionPage({ params }){
  const sessionId = params.id
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [joined, setJoined] = useState(false)
  const [summary, setSummary] = useState(null)
  const router = useRouter()

  useEffect(()=> {
    const ref = doc(db, 'sessions', sessionId)
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) { setSession(null); setLoading(false); return }
      const data = { id: snap.id, ...snap.data() }
      setSession(data)
      setLoading(false)
      if (data.status === 'finished') {
        computeSummary(data)
      }
    })
    return () => unsub()
  }, [sessionId])

  async function computeSummary(data){
    // compute duration from timestamps if present
    const started = data.startedAt?.toDate ? data.startedAt.toDate() : (data.startedAt ? new Date(data.startedAt) : null)
    const ended = data.endedAt?.toDate ? data.endedAt.toDate() : (data.endedAt ? new Date(data.endedAt) : null)
    let duration = null
    if (started && ended) duration = Math.max(0, Math.round((ended - started)/1000))
    setSummary({ duration, participants: data.participants || [] })
  }

  async function endSession(){
    if (!session) return
    try {
      const ref = doc(db, 'sessions', sessionId)
      await updateDoc(ref, {
        status: 'finished',
        endedAt: serverTimestamp()
      })
      // compute summary will run on snapshot
    } catch (e){ console.error(e); alert('failed to end') }
  }

  async function startSessionNow(){
    // set startedAt if not set and status -> active
    try {
      const ref = doc(db, 'sessions', sessionId)
      const snap = await getDoc(ref)
      if (!snap.exists()) return
      const data = snap.data()
      if (!data.startedAt) {
        await updateDoc(ref, { startedAt: serverTimestamp(), status: 'active' })
      } else {
        await updateDoc(ref, { status: 'active' })
      }
      setJoined(true)
    } catch (e) { console.error(e) }
  }

  if (loading) return <div style={{padding:20}}>Loading session…</div>
  if (!session) return <div style={{padding:20}}>Session not found</div>

  const otherNames = (session.participants || []).map(p => p.name).filter(n=>n).join(', ')
  const me = auth.currentUser?.uid || null

  return (
    <div style={{padding:20}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h1>Session</h1>
        <div><Link href="/"><button>Home</button></Link></div>
      </div>

      <div style={{marginTop:12}}>
        <div><strong>Exam:</strong> {session.exam} • <strong>Subject:</strong> {session.subject}</div>
        <div style={{marginTop:6}}><strong>Matched with:</strong> {otherNames}</div>
        <div style={{marginTop:6}}><strong>Session status:</strong> <span style={{color: session.status === 'active' ? 'green' : (session.status === 'finished' ? '#888' : '#444')}}>{session.status}</span></div>
      </div>

      <div style={{marginTop:18}}>
        {/* Start Session / End Session controls */}
        <div style={{display:'flex', gap:8}}>
          <button onClick={startSessionNow}>Start session (join video)</button>
          <button onClick={endSession} style={{background:'#f55', color:'#fff'}}>End session</button>
        </div>
      </div>

      <div style={{marginTop:18}}>
        {/* WebRTC room */}
        {session.status !== 'finished' ? (
          <WebRTCRoom sessionId={sessionId} session={session} />
        ) : (
          <>
            <h3>Session ended</h3>
            {summary ? (
              <div style={{border:'1px solid #ddd', padding:12, borderRadius:8, maxWidth:640}}>
                <div><strong>Duration (s):</strong> {summary.duration ?? 'n/a'}</div>
                <div style={{marginTop:8}}><strong>Participants:</strong>
                  <ul>{summary.participants.map(p => <li key={p.uid}>{p.name} ({p.uid})</li>)}</ul>
                </div>
                <div style={{marginTop:8}}>
                  <button onClick={()=>router.push('/')}>Back to Dashboard</button>
                </div>
              </div>
            ) : <div>Computing summary…</div>}
          </>
        )}
      </div>
    </div>
  )
}
