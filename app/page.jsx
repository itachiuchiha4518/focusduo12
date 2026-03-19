'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, googleProvider } from '../lib/firebase'
import { signInWithPopup, signOut } from 'firebase/auth'

export default function HomePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => {
      setUser(u || null)
    })
    return () => unsub()
  }, [])

  async function handleGoogleAuth() {
    setLoading(true)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      console.error(err)
      alert('Google sign in failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleLogout() {
    setLoading(true)
    try {
      await signOut(auth)
    } catch (err) {
      console.error(err)
      alert('Logout failed')
    } finally {
      setLoading(false)
    }
  }

  async function handleGetStarted() {
    if (!auth.currentUser) {
      try {
        setLoading(true)
        await signInWithPopup(auth, googleProvider)
      } catch (err) {
        console.error(err)
        alert('Google sign in failed')
        setLoading(false)
        return
      }
    }
    setLoading(false)
    router.push('/join')
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0f172a', color: '#e2e8f0' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px' }}>
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 40
          }}
        >
          <div>
            <div style={{ fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em' }}>
              FocusDuo
            </div>
            <div style={{ color: '#94a3b8', marginTop: 4 }}>
              Study together. Stay accountable.
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            {user ? (
              <>
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 999,
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(148,163,184,0.18)'
                  }}
                >
                  Signed in as {user.displayName || user.email}
                </div>
                <button
                  onClick={handleLogout}
                  disabled={loading}
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    border: 'none',
                    background: '#f43f5e',
                    color: '#fff',
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Log out
                </button>
              </>
            ) : (
              <button
                onClick={handleGoogleAuth}
                disabled={loading}
                style={{
                  padding: '10px 14px',
                  borderRadius: 10,
                  border: 'none',
                  background: '#2563eb',
                  color: '#fff',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Sign up / Login with Google
              </button>
            )}
          </div>
        </header>

        <main
          style={{
            display: 'grid',
            gridTemplateColumns: '1.2fr 0.8fr',
            gap: 24,
            alignItems: 'center'
          }}
        >
          <section
            style={{
              padding: 24,
              borderRadius: 20,
              background:
                'linear-gradient(180deg, rgba(37,99,235,0.16), rgba(15,23,42,0.92))',
              border: '1px solid rgba(148,163,184,0.16)',
              boxShadow: '0 20px 50px rgba(0,0,0,0.25)'
            }}
          >
            <div
              style={{
                display: 'inline-block',
                padding: '6px 10px',
                borderRadius: 999,
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(148,163,184,0.16)',
                color: '#cbd5e1',
                fontSize: 13,
                marginBottom: 16
              }}
            >
              For JEE & NEET students
            </div>

            <h1
              style={{
                margin: 0,
                fontSize: 'clamp(34px, 5vw, 60px)',
                lineHeight: 1.02,
                letterSpacing: '-0.04em'
              }}
            >
              Study with accountability that actually keeps people focused.
            </h1>

            <p style={{ color: '#94a3b8', fontSize: 18, lineHeight: 1.7, marginTop: 16 }}>
              Join 1-on-1 or group sessions, match with the right subject and exam, track your progress,
              and keep the session moving without distractions.
            </p>

            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 22 }}>
              <button
                onClick={handleGetStarted}
                disabled={loading}
                style={{
                  padding: '12px 18px',
                  borderRadius: 12,
                  border: 'none',
                  background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
                  color: '#fff',
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                Get started
              </button>

              <button
                onClick={() => router.push('/join')}
                disabled={loading}
                style={{
                  padding: '12px 18px',
                  borderRadius: 12,
                  border: '1px solid rgba(148,163,184,0.22)',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#e2e8f0',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                Go to matchmaking
              </button>
            </div>
          </section>

          <aside
            style={{
              padding: 20,
              borderRadius: 20,
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(148,163,184,0.16)',
              minHeight: 320
            }}
          >
            <div style={{ fontSize: 14, color: '#94a3b8', marginBottom: 10 }}>
              Account
            </div>

            <div
              style={{
                padding: 16,
                borderRadius: 14,
                background: 'rgba(15,23,42,0.8)',
                border: '1px solid rgba(148,163,184,0.14)'
              }}
            >
              {user ? (
                <>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>
                    {user.displayName || 'Student'}
                  </div>
                  <div style={{ color: '#94a3b8', marginTop: 6 }}>{user.email}</div>
                  <div style={{ marginTop: 12, color: '#cbd5e1', lineHeight: 1.6 }}>
                    Your account is ready. Go to matchmaking and enter your exam and subject.
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontWeight: 800, fontSize: 18 }}>Not signed in</div>
                  <div style={{ color: '#94a3b8', marginTop: 6, lineHeight: 1.6 }}>
                    Sign in here first, or tap Get started and we will sign you in before sending you to matchmaking.
                  </div>
                  <button
                    onClick={handleGoogleAuth}
                    disabled={loading}
                    style={{
                      marginTop: 16,
                      padding: '12px 16px',
                      borderRadius: 12,
                      border: 'none',
                      background: '#2563eb',
                      color: '#fff',
                      fontWeight: 800,
                      cursor: 'pointer',
                      width: '100%'
                    }}
                  >
                    Sign up / Login
                  </button>
                </>
              )}
            </div>

            <div
              style={{
                marginTop: 16,
                padding: 16,
                borderRadius: 14,
                background: 'rgba(15,23,42,0.8)',
                border: '1px solid rgba(148,163,184,0.14)',
                lineHeight: 1.7,
                color: '#cbd5e1'
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: 8 }}>What you can do</div>
              <div>• Join 1-on-1 or group sessions</div>
              <div>• See live study progress</div>
              <div>• Chat inside the session</div>
              <div>• Report abusive users</div>
            </div>
          </aside>
        </main>
      </div>
    </div>
  )
}
