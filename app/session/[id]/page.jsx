// app/session/[id]/page.jsx
'use client'
import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import WebRTCRoom from '../../../components/WebRTCRoom'
import { auth } from '../../../lib/firebase'

export default function SessionPage() {
  const params = useParams()
  const id = params?.id || 'demo'
  const router = useRouter()
  const [displayName, setDisplayName] = useState('Student')

  useEffect(() => {
    try {
      const u = auth?.currentUser
      if (u) setDisplayName(u.displayName || u.email || 'Student')
    } catch (e) {}
  }, [])

  return (
    <div style={{ padding: 18 }}>
      <h2>Session — {id}</h2>
      <div style={{ marginTop: 8, color: '#374151' }}>
        Mode: <strong>1-on-1 (WebRTC)</strong>
      </div>

      <div style={{ marginTop: 12 }}>
        <div>Session id: <strong>{id}</strong></div>
      </div>

      <div style={{ marginTop: 18 }}>
        <div style={{ marginBottom: 10 }}>
          <label style={{ marginRight: 8 }}>Display name:</label>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid #ddd' }} />
        </div>

        <WebRTCRoom roomId={id} displayName={displayName} />
      </div>

      <div style={{ marginTop: 18 }}>
        <button onClick={() => router.push('/dashboard')} style={{ padding: '8px 12px' }}>Back to dashboard</button>
      </div>
    </div>
  )
}
