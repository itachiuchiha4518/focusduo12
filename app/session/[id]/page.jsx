'use client'
import { useEffect, useState } from 'react'
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

  useEffect(() => {
    const ref = doc(db, 'sessions', sessionId)
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) { setSession(null); setLoading(false); return }
      setSession({ id: snap.id, ...snap.data() })
      setLoading(false)
    }, err => {
      console.error('session snap error', err)
      setLoading(false)
    })
    return () => unsub()
  }, [sessionId])

  async function startSessionNow(){
    try {
      const ref = doc(db, 'sessions', sessionId)
      const snap = await getDoc(ref)
      if (!snap.exists()) return
      if (!snap.data().startedAt) await updateDoc(ref, { startedAt: serverTimestamp(), status: 'active' })
      else await updateDoc(ref, { status: 'active' })
    } catch (e) { console.error(e) }
  }

  async function endSession(){
    try {
      const ref = doc(db, 'sessions', sessionId)
      await updateDoc(ref, { status: 'finished', endedAt: serverTimestamp() })
    } catch (e) { console.error(e) }
  }

  if (loading) return <div style={{padding:20}}>Loading session…</div>
  if (!session) return <div style={{padding:20}}>Session not found</div>

  const names = (session.participants || []).map(p => p.name).join(', ')

  return (
    <div style={{padding:20}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h2>Session</h2>
        <div><Link href="/"><button>Home</button></Link></div>
      </div>

      <div style={{marginTop:12}}>
        <div><strong>Exam:</strong> {session.exam} • <strong>Subject:</strong> {session.subject}</div>
        <div style={{marginTop:8}}><strong>Matched:</strong> {names}</div>
        <div style={{marginTop:8}}><strong>Status:</strong> {session.status}</div>
      </div>

      <div style={{marginTop:14, display:'flex', gap:8}}>
        <button onClick={startSessionNow}>Start session</button>
        <button onClick={endSession} style={{background:'#f55', color:'#fff'}}>End session</button>
      </div>

      <div style={{marginTop:20}}>
        <WebRTCRoom sessionId={sessionId} session={session} />
      </div>
    </div>
  )
        }
