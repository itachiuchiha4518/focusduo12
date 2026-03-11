'use client'
// app/session/[id]/page.jsx
import React, { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { auth, db } from '../../../lib/firebase'
import { doc, setDoc, serverTimestamp, onSnapshot } from 'firebase/firestore'
import dynamic from 'next/dynamic'

const WebRTCRoom = dynamic(() => import('../../../components/WebRTCRoom'), { ssr: false })

export default function SessionPage() {
  const router = useRouter()
  const params = useParams()
  const id = params?.id
  const [user, setUser] = useState(auth.currentUser)
  const [session, setSession] = useState(null)
  const [joined, setJoined] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => setUser(u))
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!id) return
    const ref = doc(db, 'sessions', id)
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) return setSession(null)
      setSession(snap.data())
    }, err => setError('Session read error: ' + (err.message||err)))
    return () => unsub()
  }, [id])

  async function join() {
    setError(null)
    if (!user) { setError('Sign in required on this device'); return }
    if (!id) { setError('No session id'); return }
    try {
      await setDoc(doc(db, 'sessions', id, 'participants', user.uid), {
        uid: user.uid, displayName: user.displayName || user.email || '', joinedAt: serverTimestamp()
      })
      setJoined(true)
    } catch (e) {
      setError('Failed to join session: ' + (e.message||e))
    }
  }

  async function leave() {
    try {
      if (user && id) {
        await setDoc(doc(db, 'sessions', id, 'participants', user.uid), { leftAt: serverTimestamp() }, { merge: true })
      }
    } catch (e) {}
    router.push('/join')
  }

  return (
    <div style={{padding:18}}>
      <h2>Session: {id}</h2>
      <div>Mode: {session?.mode || '—'}</div>
      <div>Exam/Subject: {session?.exam}/{session?.subject}</div>
      <div style={{marginTop:12}}>
        {!joined ? <button onClick={join}>Join meeting</button> : <button onClick={leave}>Leave</button>}
        {error && <div style={{color:'red', marginTop:10}}>{error}</div>}
      </div>

      <div style={{marginTop:18}}>
        {joined && <WebRTCRoom sessionId={id} displayName={user?.displayName || user?.email || 'Student'} />}
      </div>
    </div>
  )
}
