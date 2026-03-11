// app/join/page.jsx
'use client'

import React, { useEffect, useState, useRef } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { auth } from '../../lib/firebase'
import { collection, doc, onSnapshot, getDoc } from 'firebase/firestore'
import { db } from '../../lib/firebase'
import matchmaking from '../../lib/matchmaking'

/*
  UI:
   - Select exam (JEE / NEET)
   - Subject changes based on exam
   - Select mode (one-on-one / group)
   - Join queue button -> writes waiting doc + attempts immediate match
   - If not matched -> shows waiting screen, listens to userMatches/{uid}
   - Cancel button to leave queue
*/

const EXAMS = {
  jee: ['physics', 'chemistry', 'math'],
  neet: ['physics', 'chemistry', 'biology']
}

export default function JoinPage() {
  const params = useSearchParams()
  const router = useRouter()

  const defaultExam = params.get('exam') || 'jee'
  const defaultSubject = params.get('subject') || EXAMS[defaultExam][0]
  const defaultMode = params.get('mode') || 'one-on-one'

  const [exam, setExam] = useState(defaultExam)
  const [subject, setSubject] = useState(defaultSubject)
  const [mode, setMode] = useState(defaultMode)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [user, setUser] = useState(null)
  const [isWaiting, setIsWaiting] = useState(false)
  const unsubRef = useRef(null)

  useEffect(() => {
    const u = auth.currentUser
    setUser(u)
    const unsub = auth.onAuthStateChanged((nu) => setUser(nu))
    return () => unsub && unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    // keep subject valid when exam changes
    if (!EXAMS[exam].includes(subject)) {
      setSubject(EXAMS[exam][0])
    }
  }, [exam, subject])

  async function handleJoin() {
    setError(null)
    if (!auth.currentUser) {
      // prompt sign-in on this device (rely on your existing sign-in flow)
      setError('Sign in required on this device. Go to dashboard and sign in, then return.')
      return
    }
    setStatus('joining')
    const u = { uid: auth.currentUser.uid, displayName: auth.currentUser.displayName || auth.currentUser.email }
    try {
      const res = await matchmaking.joinQueue({ exam, subject, mode, user: u, opts: { maxGroupSize: 5 } })
      if (res.matched) {
        // immediate match -> redirect
        router.push(`/session/${res.sessionId}`)
        return
      } else {
        // not matched immediately: listen for userMatches/{uid}
        setIsWaiting(true)
        setStatus('waiting')
        const umRef = doc(db, 'userMatches', u.uid)
        unsubRef.current = onSnapshot(umRef, (snap) => {
          if (!snap.exists()) return
          const data = snap.data()
          if (data && data.sessionId) {
            // cleanup and redirect
            setIsWaiting(false)
            setStatus('matched')
            // stop listening
            if (unsubRef.current) unsubRef.current()
            router.push(`/session/${data.sessionId}`)
          }
        })
        // add beforeunload cleanup to leave queue if tab closed
        window.addEventListener('beforeunload', handleCancel)
      }
    } catch (e) {
      console.error('joinQueue failed', e)
      setError(String(e?.message || e))
      setStatus('error')
    }
  }

  async function handleCancel() {
    try {
      setIsWaiting(false)
      setStatus('idle')
      const u = auth.currentUser
      if (u) {
        await matchmaking.leaveQueue({ exam, subject, mode, uid: u.uid })
      }
      if (unsubRef.current) unsubRef.current()
      window.removeEventListener('beforeunload', handleCancel)
    } catch (e) {
      console.warn('leaveQueue error', e)
    }
  }

  return (
    <div style={{ padding: 18, maxWidth: 800, margin: '0 auto' }}>
      <h2 style={{ marginTop: 0 }}>Join a study session</h2>

      <div style={{ marginTop: 12 }}>
        <label>Exam</label>
        <select value={exam} onChange={(e) => setExam(e.target.value)} style={{ marginLeft: 8, padding: '6px 8px' }}>
          <option value="jee">JEE</option>
          <option value="neet">NEET</option>
        </select>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Subject</label>
        <select value={subject} onChange={(e) => setSubject(e.target.value)} style={{ marginLeft: 8, padding: '6px 8px' }}>
          {EXAMS[exam].map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>
      </div>

      <div style={{ marginTop: 12 }}>
        <label>Mode</label>
        <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ marginLeft: 8, padding: '6px 8px' }}>
          <option value="one-on-one">1-on-1</option>
          <option value="group">Group (up to 5)</option>
        </select>
      </div>

      <div style={{ marginTop: 18 }}>
        {status === 'idle' && <button onClick={handleJoin} style={{ padding: '10px 14px', background: '#0b74ff', color: '#fff', border: 0, borderRadius: 8 }}>Join queue</button>}
        {status === 'joining' && <div>Joining...</div>}
        {isWaiting && (
          <div style={{ marginTop: 12 }}>
            <div>Waiting for match in {exam.toUpperCase()} • {subject.toUpperCase()} • {mode}</div>
            <div style={{ marginTop: 10 }}>
              <button onClick={handleCancel} style={{ padding: '8px 12px', borderRadius: 8 }}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      {error && <div style={{ marginTop: 12, color: 'red' }}>{error}</div>}

      <div style={{ marginTop: 18, color: '#666' }}>
        Note: matching is speed-first and simple. You are matched with the earliest waiting user in the same exam, subject, and mode.
      </div>
    </div>
  )
}
