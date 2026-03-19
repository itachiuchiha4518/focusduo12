'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  auth,
  db,
  googleProvider
} from '../../lib/firebase'
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where
} from 'firebase/firestore'

export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      setUser(u || null)

      if (!u) {
        setProfile(null)
        setSessions([])
        setLoading(false)
        return
      }

      try {
        setLoading(true)

        const pSnap = await getDoc(doc(db, 'users', u.uid))
        setProfile(pSnap.exists() ? pSnap.data() : null)

        const q = query(
          collection(db, 'sessions'),
          where('participantUids', 'array-contains', u.uid)
        )
        const sSnap = await getDocs(q)

        const items = sSnap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => {
            const at = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0
            const bt = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0
            return bt - at
          })

        setSessions(items)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    })

    return () => unsub()
  }, [])

  async function login() {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      console.error(e)
      alert('Google sign in failed')
    }
  }

  async function logout() {
    try {
      await signOut(auth)
      router.push('/')
    } catch (e) {
      console.error(e)
    }
  }

  const completedSessions = useMemo(
    () => sessions.filter(s => s.status === 'finished').length,
    [sessions]
  )

  const activeSessions = useMemo(
    () => sessions.filter(s => s.status === 'active').length,
    [sessions]
  )

  const streakDays = profile?.streakDays ?? profile?.streak ?? 0
  const oneOnOneLeft = profile?.freeOneOnOneRemaining ?? 10
  const groupLeft = profile?.freeGroupRemaining ?? 10
  const planLabel = profile?.planLabel || 'Free'
  const planStatus = profile?.planStatus || 'active'
  const accountStatus = profile?.accountStatus || 'active'

  return (
    <div style={page}>
      <div style={shell}>
        <header style={header}>
          <div>
            <div style={brand}>Your Dashboard</div>
            <div style={sub}>
              Keep track of progress, streaks, credits, and your plan.
            </div>
          </div>

          <div style={row}>
            <Link href="/join" style={linkBtn}>Join session</Link>
            <Link href="/plans" style={linkBtn}>Plans</Link>
            <Link href="/admin" style={linkBtn}>Admin</Link>
            {user ? (
              <button onClick={logout} style={buttonDanger}>Log out</button>
            ) : (
              <button onClick={login} style={buttonBlue}>Sign in</button>
            )}
          </div>
        </header>

        {!user ? (
          <section style={heroCard}>
            <h1 style={title}>Sign in to see your streaks and credits.</h1>
            <p style={text}>
              Once you are signed in, this dashboard will show your sessions completed, streak, free credits,
              and subscription status.
            </p>
            <button onClick={login} style={buttonBlue}>Sign in with Google</button>
          </section>
        ) : (
          <>
            <section style={grid}>
              <div style={cardDark}>
                <div style={smallLabel}>Current plan</div>
                <div style={bigValue}>{planLabel}</div>
                <div style={muted}>Plan status: {planStatus}</div>
                <div style={muted}>Account status: {accountStatus}</div>
              </div>

              <div style={cardDark}>
                <div style={smallLabel}>Streak</div>
                <div style={bigValue}>{streakDays} day{streakDays === 1 ? '' : 's'}</div>
                <div style={muted}>Keep sessions going daily.</div>
              </div>

              <div style={cardDark}>
                <div style={smallLabel}>Sessions completed</div>
                <div style={bigValue}>{profile?.sessionsCompleted ?? completedSessions}</div>
                <div style={muted}>Finished study sessions.</div>
              </div>

              <div style={cardDark}>
                <div style={smallLabel}>Active sessions</div>
                <div style={bigValue}>{activeSessions}</div>
                <div style={muted}>Sessions currently running.</div>
              </div>

              <div style={cardDark}>
                <div style={smallLabel}>Free 1-on-1 left</div>
                <div style={bigValue}>{oneOnOneLeft}</div>
                <div style={muted}>Deducts only when session starts.</div>
              </div>

              <div style={cardDark}>
                <div style={smallLabel}>Free group left</div>
                <div style={bigValue}>{groupLeft}</div>
                <div style={muted}>Your group session balance.</div>
              </div>
            </section>

            <section style={cardLight}>
              <div style={sectionHead}>
                <div>
                  <div style={sectionTitle}>Recent sessions</div>
                  <div style={sectionSub}>Your latest activity on the platform.</div>
                </div>
                <Link href="/join" style={buttonBlue}>Start new session</Link>
              </div>

              {loading ? (
                <div style={muted}>Loading sessions...</div>
              ) : sessions.length === 0 ? (
                <div style={emptyBox}>
                  No sessions yet. Join one now and build your streak.
                </div>
              ) : (
                <div style={sessionList}>
                  {sessions.slice(0, 10).map(s => (
                    <div key={s.id} style={sessionCard}>
                      <div style={sessionTop}>
                        <strong>{s.exam || 'Exam'} • {s.subject || 'Subject'}</strong>
                        <span style={statusPill}>{s.status || 'active'}</span>
                      </div>
                      <div style={sessionMeta}>
                        Mode: {s.mode || 'one-on-one'}
                      </div>
                      <div style={sessionMeta}>
                        {s.participants?.map(p => p.name).join(' • ') || 'No names'}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section style={promoGrid}>
              <Link href="/plans" style={promoCard}>
                <div style={promoTitle}>Upgrade now</div>
                <div style={promoText}>
                  Unlock unlimited sessions and remove free time limits.
                </div>
              </Link>

              <Link href="/join" style={promoCard}>
                <div style={promoTitle}>Start studying</div>
                <div style={promoText}>
                  Jump straight into matchmaking and a live session.
                </div>
              </Link>

              <Link href="/admin" style={promoCard}>
                <div style={promoTitle}>Admin reports</div>
                <div style={promoText}>
                  Review reports, requests, warnings, and bans.
                </div>
              </Link>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

const page = {
  minHeight: '100vh',
  background:
    'radial-gradient(circle at top left, rgba(37,99,235,0.16), transparent 32%), radial-gradient(circle at top right, rgba(124,58,237,0.14), transparent 26%), linear-gradient(180deg, #0f172a 0%, #111827 100%)',
  color: '#e5e7eb'
}

const shell = {
  maxWidth: 1240,
  margin: '0 auto',
  padding: '28px 20px 48px'
}

const header = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  gap: 16,
  flexWrap: 'wrap',
  marginBottom: 22
}

const brand = {
  fontSize: 30,
  fontWeight: 900,
  letterSpacing: '-0.04em'
}

const sub = {
  color: '#94a3b8',
  marginTop: 4
}

const row = {
  display: 'flex',
  gap: 10,
  flexWrap: 'wrap',
  alignItems: 'center'
}

const linkBtn = {
  padding: '10px 14px',
  borderRadius: 12,
  border: '1px solid rgba(148,163,184,0.18)',
  background: 'rgba(255,255,255,0.04)',
  color: '#e2e8f0',
  textDecoration: 'none',
  fontWeight: 700
}

const buttonBlue = {
  padding: '10px 14px',
  borderRadius: 12,
  border: 'none',
  background: 'linear-gradient(90deg, #2563eb, #7c3aed)',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
  textDecoration: 'none'
}

const buttonDanger = {
  padding: '10px 14px',
  borderRadius: 12,
  border: 'none',
  background: '#ef4444',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer'
}

const heroCard = {
  padding: 24,
  borderRadius: 24,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(148,163,184,0.16)'
}

const title = {
  margin: 0,
  fontSize: 'clamp(32px, 5vw, 54px)',
  lineHeight: 1.05,
  letterSpacing: '-0.04em'
}

const text = {
  marginTop: 14,
  color: '#cbd5e1',
  fontSize: 17,
  lineHeight: 1.7,
  maxWidth: 780
}

const grid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 14,
  marginTop: 18
}

const cardDark = {
  padding: 18,
  borderRadius: 18,
  background: 'rgba(15,23,42,0.88)',
  border: '1px solid rgba(148,163,184,0.14)'
}

const smallLabel = {
  color: '#94a3b8',
  fontSize: 13
}

const bigValue = {
  fontSize: 28,
  fontWeight: 900,
  marginTop: 10
}

const muted = {
  color: '#cbd5e1',
  marginTop: 6,
  lineHeight: 1.6
}

const cardLight = {
  marginTop: 18,
  padding: 18,
  borderRadius: 22,
  background: 'rgba(255,255,255,0.05)',
  border: '1px solid rgba(148,163,184,0.16)'
}

const sectionHead = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  alignItems: 'center',
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

const emptyBox = {
  padding: 18,
  borderRadius: 14,
  background: 'rgba(15,23,42,0.8)',
  border: '1px solid rgba(148,163,184,0.12)',
  color: '#cbd5e1'
}

const sessionList = {
  display: 'grid',
  gap: 10
}

const sessionCard = {
  padding: 14,
  borderRadius: 14,
  background: 'rgba(15,23,42,0.82)',
  border: '1px solid rgba(148,163,184,0.12)'
}

const sessionTop = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  flexWrap: 'wrap'
}

const sessionMeta = {
  color: '#cbd5e1',
  marginTop: 6,
  lineHeight: 1.5
}

const statusPill = {
  padding: '4px 8px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.08)',
  border: '1px solid rgba(148,163,184,0.12)',
  fontSize: 12
}

const promoGrid = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
  gap: 12,
  marginTop: 18
}

const promoCard = {
  display: 'block',
  padding: 16,
  borderRadius: 18,
  textDecoration: 'none',
  color: '#e2e8f0',
  background: 'rgba(15,23,42,0.82)',
  border: '1px solid rgba(148,163,184,0.12)'
}

const promoTitle = {
  fontWeight: 900,
  fontSize: 16
}

const promoText = {
  marginTop: 6,
  color: '#94a3b8',
  lineHeight: 1.6
}
