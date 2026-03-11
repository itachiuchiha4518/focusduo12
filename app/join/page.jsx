'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import Link from 'next/link'

export default function Join() {
  const router = useRouter()
  const [exam, setExam] = useState('JEE')
  const [subject, setSubject] = useState('Physics')
  const [mode, setMode] = useState('1-on-1')

  function startQueue() {
    // placeholder: in next step we'll wire this to matchmaking
    router.push('/session/demo')
  }

  return (
    <div>
      <h2>Join a study session</h2>
      <div style={{maxWidth:420, marginTop:12}}>
        <label>Exam</label>
        <select value={exam} onChange={e=>setExam(e.target.value)} style={{display:'block',padding:8,marginTop:6,width:'100%'}}>
          <option>JEE</option>
          <option>NEET</option>
        </select>

        <label style={{marginTop:12}}>Subject</label>
        <select value={subject} onChange={e=>setSubject(e.target.value)} style={{display:'block',padding:8,marginTop:6,width:'100%'}}>
          <option>Physics</option>
          <option>Chemistry</option>
          <option>Math</option>
          <option>Biology</option>
        </select>

        <label style={{marginTop:12}}>Mode</label>
        <select value={mode} onChange={e=>setMode(e.target.value)} style={{display:'block',padding:8,marginTop:6,width:'100%'}}>
          <option>1-on-1</option>
          <option>Group</option>
        </select>

        <div style={{marginTop:16, display:'flex', gap:8}}>
          <button onClick={startQueue}>Start matchmaking</button>
          <Link href="/"><button style={{background:'#ddd',color:'#000'}}>Cancel</button></Link>
        </div>
      </div>
    </div>
  )
}
