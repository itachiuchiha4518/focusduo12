// app/session/[id]/page.jsx
'use client'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import JitsiClient from '../../../components/JitsiClient'

export default function SessionPage() {
  const params = useParams()
  const id = params?.id || 'demo'
  const router = useRouter()
  const [status, setStatus] = useState('waiting')
  const [displayName, setDisplayName] = useState('Student')

  useEffect(() => {
    const t = setTimeout(() => setStatus('active'), 600)
    return () => clearTimeout(t)
  }, [])

  return (
    <div style={{ padding: 18 }}>
      <h2>Session — {id}</h2>
      <div style={{ marginTop: 8, color: '#374151' }}>
        Mode: <strong>{id === 'demo' ? 'one-on-one' : 'group'}</strong>
      </div>

      <div style={{ marginTop: 12 }}>
        <div>
          Session status: <strong style={{ color: status === 'active' ? 'green' : '#374151' }}>{status}</strong>
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        {status === 'active' ? (
          <div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ marginRight: 8 }}>Display name:</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }}
              />
            </div>

            <JitsiClient roomId={id} displayName={displayName} onApiReady={(api) => {
              // useful place to attach extra listeners if needed
              console.log('Jitsi API ready', api)
            }} />
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
