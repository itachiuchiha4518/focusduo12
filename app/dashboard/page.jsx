// app/dashboard/page.jsx
'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth } from '../../lib/firebase'

export default function Dashboard() {
  const router = useRouter()
  const [user, setUser] = useState(null)

  useEffect(() => {
    const u = auth.currentUser
    setUser(u)
    const unsub = auth.onAuthStateChanged((nu) => setUser(nu))
    return () => unsub && unsub()
  }, [])

  return (
    <div style={{ padding: 18, maxWidth: 900, margin: '0 auto' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>Dashboard</h2>
          <div style={{ color: '#666' }}>Welcome to FocusDuo</div>
        </div>
        <div>
          {user ? (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 14 }}>{user.displayName || user.email}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{user.uid}</div>
            </div>
          ) : (
            <div style={{ color: '#666' }}>Sign in to join sessions</div>
          )}
        </div>
      </header>

      <section style={{ marginTop: 18 }}>
        <div style={{ display: 'flex', gap: 12 }}>
          <button onClick={() => router.push('/join?mode=one-on-one&exam=jee&subject=physics')} style={{ padding: '10px 14px', borderRadius: 8 }}>Join 1-on-1 (JEE Physics)</button>
          <button onClick={() => router.push('/join?mode=group&exam=jee&subject=physics')} style={{ padding: '10px 14px', borderRadius: 8 }}>Join Group (JEE Physics)</button>
          <button onClick={() => router.push('/join?mode=one-on-one&exam=neet&subject=biology')} style={{ padding: '10px 14px', borderRadius: 8 }}>Join 1-on-1 (NEET Biology)</button>
        </div>
      </section>

      <section style={{ marginTop: 20 }}>
        <h4>Your quick stats (demo)</h4>
        <div>🔥 Current streak: <strong>0</strong></div>
        <div>Total study hours: <strong>0</strong></div>
        <div>Sessions completed: <strong>0</strong></div>
      </section>
    </div>
  )
}
