// app/dashboard/page.jsx
'use client'
import { useRouter } from 'next/navigation'

export default function Dashboard() {
  const router = useRouter()

  return (
    <div style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>Dashboard (Safe Mode)</h2>
      <div style={{ color: '#374151' }}>Minimal dashboard while we fix the client crash.</div>

      <div style={{ marginTop: 14 }}>
        <div style={{ marginBottom: 8 }}>
          <strong>Quick start (demo):</strong>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => router.push('/join?mode=one-on-one&exam=jee&subject=physics')} className="btn">Join 1-on-1</button>
          <button onClick={() => router.push('/join?mode=group&exam=jee&subject=physics')} className="btn">Join Group</button>
          <button onClick={() => router.push('/session/demo')} style={{ padding: '8px 12px' }}>Open Demo Session</button>
        </div>
      </div>

      <div style={{ marginTop: 20 }}>
        <h4>Your Stats (demo)</h4>
        <div>🔥 Current streak: <strong>0</strong></div>
        <div>Total study hours: <strong>0</strong></div>
        <div>Sessions completed: <strong>0</strong></div>
      </div>
    </div>
  )
}
