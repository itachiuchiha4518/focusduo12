// app/session/[id]/page.jsx
'use client'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import SimpleJitsi from '../../components/SimpleJitsi' // safe iframe component

export default function SessionPage(){
  const { id } = useParams()
  const router = useRouter()
  const [status, setStatus] = useState('waiting')

  useEffect(()=>{
    // in safe-mode, status goes active automatically
    setTimeout(()=> setStatus('active'), 600)
  },[])

  return (
    <div style={{ padding: 18 }}>
      <h2>Session — {id}</h2>
      <div style={{ marginTop: 8, color: '#374151' }}>
        Mode: <strong>{id === 'demo' ? 'one-on-one' : 'group'}</strong>
      </div>

      <div style={{ marginTop: 12 }}>
        <div>Session status: <strong style={{ color: status === 'active' ? 'green' : '#374151' }}>{status}</strong></div>
      </div>

      <div style={{ marginTop: 18 }}>
        {status === 'active' ? (
          <div>
            <SimpleJitsi roomId={id} displayName={'Demo User'} />
          </div>
        ) : (
          <div style={{ color: '#6b7280' }}>Waiting for session to start...</div>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <button onClick={() => router.push('/dashboard')} style={{ padding: '8px 12px' }}>Back to dashboard</button>
      </div>
    </div>
  )
}
