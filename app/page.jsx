// app/page.jsx
'use client'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  return (
    <div style={{ padding: 22 }}>
      <h1 style={{ margin: 0 }}>FocusDuo — Safe Mode</h1>
      <p style={{ color: '#374151' }}>Site is running in a temporary safe mode. Real-time features (Firebase / Jitsi / WebRTC) are disabled to remove the client crash. Use the actions below to navigate and test the UI.</p>

      <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
        <button className="btn-primary" onClick={() => router.push('/dashboard')} style={{ padding: '10px 14px' }}>
          Go to Dashboard
        </button>
        <button onClick={() => router.push('/join?mode=one-on-one&exam=jee&subject=physics')} style={{ padding: '10px 14px' }}>
          Simulate Join 1-on-1
        </button>
        <button onClick={() => router.push('/session/demo')} style={{ padding: '10px 14px' }}>
          Open Demo Session
        </button>
      </div>

      <div style={{ marginTop: 20, color: '#6b7280' }}>
        Once this loads successfully, tell me and I will re-introduce the real matchmaking & video code step-by-step.
      </div>
    </div>
  )
}
