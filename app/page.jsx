// app/page.jsx
'use client'
import { useRouter } from 'next/navigation'

export default function HomePage() {
  const router = useRouter()

  return (
    <div style={{ padding: 22 }}>
      <h1 style={{ margin: 0 }}>FocusDuo — Safe Mode</h1>
      <p style={{ color: '#374151' }}>
        This is a temporary safe build so your site can deploy. Matchmaking and video are disabled here — demo flows only.
      </p>

      <div style={{ marginTop: 18, display: 'flex', gap: 12 }}>
        <button
          onClick={() => router.push('/dashboard')}
          style={{ padding: '10px 14px', background: '#0b74ff', color: '#fff', borderRadius: 8, border: 0 }}
        >
          Go to Dashboard
        </button>

        <button
          onClick={() => router.push('/join?mode=one-on-one&exam=jee&subject=physics')}
          style={{ padding: '10px 14px', borderRadius: 8 }}
        >
          Simulate Join 1-on-1
        </button>

        <button
          onClick={() => router.push('/session/demo')}
          style={{ padding: '10px 14px', borderRadius: 8 }}
        >
          Open Demo Session
        </button>
      </div>

      <div style={{ marginTop: 20, color: '#6b7280' }}>
        After this loads on your domain, tell me “safe deploy ok” and I will restore core features step-by-step.
      </div>
    </div>
  )
}
