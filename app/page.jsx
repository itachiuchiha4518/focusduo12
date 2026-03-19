'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { auth, googleProvider } from '../lib/firebase'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'

export default function HomePage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u || null))
    return () => unsub()
  }, [])

  async function login() {
    setLoading(true)
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      console.error(e)
      alert('Google sign in failed')
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    setLoading(true)
    try {
      await signOut(auth)
    } catch (e) {
      console.error(e)
      alert('Logout failed')
    } finally {
      setLoading(false)
    }
  }

  async function getStarted() {
    setLoading(true)
    try {
      if (!auth.currentUser) {
        await signInWithPopup(auth, googleProvider)
      }
      router.push('/join')
    } catch (e) {
      console.error(e)
      alert('Sign in failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={page}>
      <div style={shell}>
        <header style={header}>
          <div>
            <div style={brand}>FocusDuo</div>
            <div style={tagline}>Study with accountability. Stop wasting sessions.</div>
          </div>

          <div style={navRow}>
            <Link href="/plans" style={navLink}>Plans</Link>
            <Link href="/dashboard" style={navLink}>Dashboard</Link>
            <Link href="/admin" style={navLink}>Admin</Link>
            {user ? (
              <>
                <div style={userPill}>{user.displayName || user.email || 'Student'}</div>
                <button onClick={logout} disabled={loading} style={buttonGhost}>Log out</button>
              </>
            ) : (
              <button onClick={login} disabled={loading} style={buttonBlue}>Sign in / Sign up</button>
            )}
          </div>
        </header>

        <main style={heroGrid}>
          <section style={heroCard}>
            <div style={badge}>Built for JEE and NEET students</div>
            <h1 style={heroTitle}>
              Study sessions that actually keep people focused.
            </h1>
            <p style={heroText}>
              Join the right subject, get matched fast, video call inside the site, chat during the session,
              report bad behavior, and upgrade when you are ready.
            </p>

            <div style={ctaRow}>
              <button onClick={getStarted} disabled={loading} style={buttonPrimary}>
                Get started
              </button>
              <Link href="/plans" style={buttonSecondary}>
                View plans
              </Link>
              <Link href="/dashboard" style={buttonSecondary}>
                Open dashboard
              </Link>
            </div>

            <div style={statsGrid}>
              <div style={statCard}>
                <div style={statLabel}>Free plan</div>
                <div style={statValue}>10 + 10 sessions</div>
              </div>
              <div style={statCard}>
                <div style={statLabel}>Paid plans</div>
                <div style={statValue}>Unlimited sessions</div>
              </div>
              <div style={statCard}>
                <div style={statLabel}>Session flow</div>
                <div style={statValue}>Match → start → study</div>
              </div>
              <div style={statCard}>
                <div style={statLabel}>Safety</div>
                <div style={statValue}>Chat censor + report</div>
              </div>
            </div>
          </section>

          <aside style={sideCard}>
            <div style={sideTitle}>What you get</div>

            <div style={featureList}>
              <div style={featureItem}>
                <div style={featureTitle}>Fast matchmaking</div>
                <div style={featureText}>Separate queues for exam, subject, and mode.</div>
              </div>
              <div style={featureItem}>
                <div style={featureTitle}>Real video room</div>
                <div style={featureText}>Mic, camera, switch camera, chat, and end card.</div>
              </div>
              <div style={featureItem}>
                <div style={featureTitle}>Free user limits</div>
                <div style={featureText}>2 minute setup, then 30 minute session limit.</div>
              </div>
              <div style={featureItem}>
                <div style={featureTitle}>Upgrade path</div>
                <div style={featureText}>Plans page with QR/UTR manual payment flow.</div>
              </div>
            </div>

            <div style={upgradeBox}>
              <div style={upgradeTitle}>Ready to upgrade?</div>
              <div style={upgradeText}>
                Open plans, pay by QR, submit UTR, and wait for admin approval.
              </div>
              <Link href="/plans" style={buttonBlueBlock}>
                Go to plans
              </Link>
            </div>
          </aside>
        </main>

        <section style={sectionCard}>
          <div style={sectionHeader}>
            <div>
              <div style={sectionTitle}>Quick access</div>
              <div style={sectionSub}>Everything important in one place.</div>
            </div>
          </div>

          <div style={quickGrid}>
            <Link href="/join" style={quickCard}>
              <div style={quickTitle}>Join session</div>
              <div style={quickText}>Start matchmaking now.</div>
            </Link>

            <Link href="/dashboard" style={quickCard}>
              <div style={quickTitle}>User dashboard</div>
              <div style={quickText}>View streaks, credits, sessions.</div>
            </Link>

            <Link href="/plans" style={quickCard}>
              <div style={quickTitle}>Plans</div>
              <div style={quickText}>Choose free or upgrade.</div>
            </Link>

            <Link href="/admin" style={quickCard}>
              <div style={quickTitle}>Admin panel</div>
              <div style={quickText}>Review reports and requests.</div>
            </Link>
          </div>
        </section>
      </div>
    </div>
  )
}

const page = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at top left, rgba(37,99,235,0.22), transparent 32%), radial-gradient(circle at top right, rgba(124,58,237,0.18), transparent 28%), linear-gradient(180deg, #0f172a 0%, #111827 100%)',
  color: '#e5e7eb'
}

const shell = {
  maxWidth: 1280,
  margin: '0 auto',
  padding: '28px 20px 48px'
}

const header = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
  marginBottom: 36
}

const brand = {
  fontSize: 28,
  fontWeight: 900,
  letterSpacing: '-0.04em'
}

const tagline = {
  color: '#94a3b8',
  marginTop: 4
}

const navRow = {
  display: 'flex',
  alignItems: 'center',
  gap: 10,
  flexWrap: 'wrap'
}

const navLink = {
  color: '#e2e8f0',
  textDecoration: 'none',
  padding: '10px 12px',
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.18)',
  background: 'rgba(255,255,255,0.04)'
}

const userPill = {
  padding: '10px 14px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(148,163,184,0.16)',
  color: '#e2e8f0'
}

const heroGrid = {
  display: 'grid',
  gridTemplateColumns: '1.25fr 0.75fr',
  gap: 18,
  alignItems: 'start'
}

const heroCard = {
  padding: 24,
  borderRadius: 24,
  border: '1px solid rgba(148,163,184,0.16)',
  background: 'linear-gradient(180deg, rgba(37,99,235,0.14), rgba(15,23,42,0.95))',
  boxShadow: '0 24px 60px rgba(0,0,0,0.28)'
}

const badge = {
  display: 'inline-block',
  padding: '7px 11px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(148,163,184,0.18)',
  color: '#cbd5e1',
  fontSize: 13,
  marginBottom: 16
}

const heroTitle = {
  margin: 0,
  fontSize: 'clamp(34px, 5vw, 62px)',
  lineHeight: 1.02,
  letterSpacing: '-0.05em'
}

const heroText = {
  marginTop: 16,
  color: '#cbd5e1',
  fontSize: 18,
  lineHeight: 1.7,
  maxWidth: 760
}

const ctaRow = {
  display: 'flex',
  gap: 12,
  flexWrap: 'wrap',
  marginTop: 22
}

const buttonBlue = {
  padding: '12px 18px',
  borderRadius: 12,
  border: 'none',
  background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
  textDecoration: 'none'
}

const buttonSecondary = {
  padding: '12px 18px',
  borderRadius: 12,
  border: '1px solid rgba(148,163,184,0.22)',
  background: 'rgba(255,255,255,0.04)',
  color: '#e2e8f0',
  fontWeight: 700,
  cursor: 'pointer',
  textDecoration: 'none'
}

const buttonGhost = {
  padding: '12px 16px',
  borderRadius: 12,
  border: '1px solid rgba(148,163,184,0.22)',
  background: 'rgba(255,255,255,0.04)',
  color: '#e2e8f0',
  fontWeight: 700,
  cursor: 'pointer'
}

const buttonPrimary = {
  ...buttonBlue
}

const buttonBlueBlock = {
  display: 'block',
  textAlign: 'center',
  padding: '12px 18px',
  borderRadius: 12,
  border: 'none',
  background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
  textDecoration: 'none',
  marginTop: 14
}

const statsGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 12,
  marginTop: 24
}

const statCard = {
  padding: 16,
  borderRadius: 18,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(148,163,184,0.16)'
}

const statLabel = {
  color: '#94a3b8',
  fontSize: 13
}

const statValue = {
  fontSize: 18,
  fontWeight: 800,
  marginTop: 8
}

const sideCard = {
  padding: 20,
  borderRadius: 24,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(148,163,184,0.16)'
}

const sideTitle = {
  fontWeight: 900,
  fontSize: 20,
  marginBottom: 14
}

const featureList = {
  display: 'grid',
  gap: 12
}

const featureItem = {
  padding: 14,
  borderRadius: 16,
  background: 'rgba(15,23,42,0.8)',
  border: '1px solid rgba(148,163,184,0.12)'
}

const featureTitle = {
  fontWeight: 800,
  marginBottom: 6
}

const featureText = {
  color: '#94a3b8',
  lineHeight: 1.6
}

const upgradeBox = {
  marginTop: 16,
  padding: 16,
  borderRadius: 18,
  background: 'rgba(15,23,42,0.85)',
  border: '1px solid rgba(148,163,184,0.12)'
}

const upgradeTitle = {
  fontWeight: 900,
  fontSize: 18
}

const upgradeText = {
  color: '#cbd5e1',
  marginTop: 6,
  lineHeight: 1.6
}

const sectionCard = {
  marginTop: 18,
  padding: 20,
  borderRadius: 24,
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(148,163,184,0.16)'
}

const sectionHeader = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 12,
  flexWrap: 'wrap',
  marginBottom: 14
}

const sectionTitle = {
  fontWeight: 900,
  fontSize: 20
}

const sectionSub = {
  color: '#94a3b8',
  marginTop: 4
}

const quickGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12
}

const quickCard = {
  display: 'block',
  textDecoration: 'none',
  padding: 16,
  borderRadius: 18,
  background: 'rgba(15,23,42,0.82)',
  border: '1px solid rgba(148,163,184,0.12)',
  color: '#e2e8f0'
}

const quickTitle = {
  fontWeight: 900,
  fontSize: 16
}

const quickText = {
  color: '#94a3b8',
  marginTop: 6,
  lineHeight: 1.6
}
