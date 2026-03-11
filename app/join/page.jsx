'use client'
// app/join/page.jsx
import React, { useEffect, useRef, useState } from 'react'
import { auth, provider } from '../../lib/firebase'
import { signInWithPopup } from 'firebase/auth'
import { doc, onSnapshot } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import { useRouter } from 'next/navigation'
import * as matchmaking from '../../lib/matchmaking'

const EXAMS = { jee: ['physics','chemistry','math'], neet: ['physics','chemistry','biology'] }

export default function JoinPage() {
  const router = useRouter()
  const [user, setUser] = useState(auth.currentUser)
  const [exam, setExam] = useState('jee')
  const [subject, setSubject] = useState(EXAMS['jee'][0])
  const [mode, setMode] = useState('one-on-one')
  const [status, setStatus] = useState('idle')
  const unsubRef = useRef(null)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => setUser(u))
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!EXAMS[exam].includes(subject)) setSubject(EXAMS[exam][0])
  }, [exam])

  async function login() {
    try { await signInWithPopup(auth, provider) } catch(e) { alert('Login failed: '+(e.message||e)) }
  }

  async function join() {
    if (!auth.currentUser) { setStatus('sign-in-required'); return }
    setStatus('joining')
    const u = { uid: auth.currentUser.uid, displayName: auth.currentUser.displayName || auth.currentUser.email }
    try {
      const res = await matchmaking.joinQueue({ exam, subject, mode, user: u, maxGroupSize: 5 })
      if (res.matched) {
        router.push(`/session/${res.sessionId}`)
        return
      }
      setStatus('waiting')
      const umRef = doc(db, 'userMatches', u.uid)
      unsubRef.current = onSnapshot(umRef, snap => {
        if (!snap.exists()) return
        const data = snap.data()
        if (data && data.sessionId) {
          setStatus('matched')
          if (unsubRef.current) unsubRef.current()
          router.push(`/session/${data.sessionId}`)
        }
      })
      window.addEventListener('beforeunload', async () => {
        try { await matchmaking.leaveQueue({ exam, subject, mode, uid: auth.currentUser.uid }) } catch(e){}
      })
    } catch (e) {
      setStatus('error: ' + (e.message||e))
    }
  }

  async function cancel() {
    try {
      if (auth.currentUser) await matchmaking.leaveQueue({ exam, subject, mode, uid: auth.currentUser.uid })
      if (unsubRef.current) unsubRef.current()
      setStatus('idle')
    } catch (e) {}
  }

  return (
    <div style={{padding:18, maxWidth:900, margin:'0 auto'}}>
      <h2>Join session</h2>
      {!user ? (
        <div>
          <p>Sign in to join</p>
          <button onClick={login}>Sign in with Google</button>
        </div>
      ) : (
        <>
          <div>Signed in as: {user.email}</div>
          <div style={{marginTop:12}}>
            <label>Exam</label>
            <select value={exam} onChange={e=>setExam(e.target.value)} style={{marginLeft:8}}>
              <option value="jee">JEE</option>
              <option value="neet">NEET</option>
            </select>
          </div>
          <div style={{marginTop:12}}>
            <label>Subject</label>
            <select value={subject} onChange={e=>setSubject(e.target.value)} style={{marginLeft:8}}>
              {EXAMS[exam].map(s=> <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{marginTop:12}}>
            <label>Mode</label>
            <select value={mode} onChange={e=>setMode(e.target.value)} style={{marginLeft:8}}>
              <option value="one-on-one">1-on-1</option>
              <option value="group">Group (max 5)</option>
            </select>
          </div>
          <div style={{marginTop:14}}>
            <button onClick={join} disabled={status==='joining' || status==='waiting'}>Join queue</button>
            <button onClick={cancel} style={{marginLeft:8}}>Cancel</button>
          </div>
          <div style={{marginTop:12}}>Status: {status}</div>
        </>
      )}
    </div>
  )
}
