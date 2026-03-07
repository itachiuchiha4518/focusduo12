// app/join/page.jsx
'use client'
import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

export default function JoinPage(){
  const params = useSearchParams()
  const mode = params.get('mode') || 'one-on-one'
  const exam = params.get('exam') || 'jee'
  const subject = params.get('subject') || 'physics'
  const router = useRouter()
  const [status, setStatus] = useState('idle')

  useEffect(()=>{
    // immediately simulate joining and route to demo session for safe-mode
    setStatus('joining')
    setTimeout(()=> {
      // create deterministic demo id for this combination
      const sid = 'demo'
      router.push(`/session/${sid}`)
    }, 350)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  return (
    <div style={{ padding: 18 }}>
      <h2>Joining</h2>
      <div>Mode: <strong>{mode}</strong> • Exam: <strong>{exam}</strong> • Subject: <strong>{subject}</strong></div>
      <div style={{ marginTop: 12, color: '#6b7280' }}>Status: {status}</div>
      <div style={{ marginTop: 16 }}>
        <button onClick={() => router.push('/dashboard')} className="btn small">Back</button>
      </div>
    </div>
  )
}
