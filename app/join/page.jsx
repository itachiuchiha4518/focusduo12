// pages/join.js  (replace entire file)
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/router'
import { auth } from '../lib/firebase'
import { joinQueue, cancelQueue } from '../lib/matchmaking'

export default function JoinPage() {
  const router = useRouter()
  const [exam, setExam] = useState('JEE')
  const [subject, setSubject] = useState('Physics')
  const [mode, setMode] = useState('one-on-one')
  const [status, setStatus] = useState('idle')
  const queueIdRef = useRef(null)

  useEffect(() => {
    // cleanup on tab close
    const handler = async () => {
      if (queueIdRef.current) await cancelQueue(queueIdRef.current)
    }
    window.addEventListener('beforeunload', handler)
    return () => {
      window.removeEventListener('beforeunload', handler)
    }
  }, [])

  async function start() {
    if (!auth.currentUser) return alert('Sign in first')
    setStatus('joining')
    try {
      const res = await joinQueue({ exam, subject, mode })
      if (res.status === 'matched') {
        // immediate match - go to the session page
        router.push(`/session/${res.sessionId}`)
      } else {
        // waiting in queue
        queueIdRef.current = res.queueId
        setStatus('waiting')
        // optional: open a "waiting" view which polls or listens for a session creation
        // A simple approach: poll the 'sessions' collection for a session including this uid.
        // But best is your existing code that listens for session creation for this user.
      }
    } catch (e) {
      console.error(e)
      alert('Failed to join queue: ' + (e.message || e))
      setStatus('error')
    }
  }

  async function cancel() {
    if (!queueIdRef.current) return
    setStatus('cancelling')
    await cancelQueue(queueIdRef.current)
    queueIdRef.current = null
    setStatus('idle')
  }

  return (
    <div style={{padding:20}}>
      <h1>Join a study session</h1>

      <div style={{marginBottom:8}}>
        <label>Exam</label><br/>
        <select value={exam} onChange={e=>setExam(e.target.value)}>
          <option>JEE</option>
          <option>NEET</option>
        </select>
      </div>

      <div style={{marginBottom:8}}>
        <label>Subject</label><br/>
        <select value={subject} onChange={e=>setSubject(e.target.value)}>
          <option>Physics</option>
          <option>Chemistry</option>
          <option>Math</option>
          <option>Biology</option>
        </select>
      </div>

      <div style={{marginBottom:12}}>
        <label>Mode</label><br/>
        <select value={mode} onChange={e=>setMode(e.target.value)}>
          <option value="one-on-one">one-on-one</option>
          <option value="group">group</option>
        </select>
      </div>

      <div style={{display:'flex', gap:8}}>
        <button onClick={start} disabled={status === 'joining' || status === 'waiting'}>Start session</button>
        <button onClick={cancel} disabled={!queueIdRef.current}>Cancel</button>
      </div>

      <div style={{marginTop:12}}>
        Status: <strong>{status}</strong>
      </div>
    </div>
  )
}
