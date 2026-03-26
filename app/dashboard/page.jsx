'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { auth, db, googleProvider } from '../../lib/firebase'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { getEffectivePlanId } from '../../lib/subscriptions'

// ————————————————————————————————————————
// 🔥 Streak Fire Display Component
// ————————————————————————————————————————
function StreakDisplay({ days }) {
  const flameCount = Math.min(days, 7)
  const message =
    days === 0 ? 'Start your streak today!' :
    days === 1 ? 'Day 1 — great start! Keep going.' :
    days < 5  ? `${days} days strong — don't break it!` :
    days < 14 ? `${days} days — you are on fire! 🔥` :
    `${days} days — absolute beast mode 🏆`

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 28, letterSpacing: 2, minHeight: 36 }}>
        {days === 0 ? '💤' : Array.from({ length: flameCount }).map((_, i) => '🔥').join('')}
      </div>
      <div style={{ fontSize: 44, fontWeight: 900, lineHeight: 1, marginTop: 6 }}>{days}</div>
      <div style={{ color: '#94a3b8', marginTop: 8, fontSize: 13, lineHeight: 1.5 }}>{message}</div>
    </div>
  )
}

// ————————————————————————————————————————
// 📊 Credits Progress Bar Component
// ————————————————————————————————————————
function CreditsBar({ remaining, total, label }) {
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100))
  const color = pct > 50 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ marginBottom: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 13 }}>
        <span style={{ color: '#94a3b8' }}>{label}</span>
        <span style={{ color, fontWeight: 800 }}>{remaining} / {total} left</span>
      </div>
      <div style={{ height: 7, borderRadius: 999, background: 'rgba(148,163,184,0.2)' }}>
        <div style={{
          height: '100%', width: `${pct}%`, borderRadius: 999,
          background: color, transition: 'width 0.4s ease'
        }} />
      </div>
    </div>
  )
}

// ————————————————————————————————————————
// Main Dashboard Page
// ————————————————————————————————————————
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

        const q = query(collection(db, 'sessions'), where('participantUids', 'array-contains', u.uid))
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
    try { await signInWithPopup(auth, googleProvider) }
    catch (e) { console.error(e); alert('Google sign in failed') }
  }

  async function logout() {
    try { await signOut(auth); router.push('/') }
    catch (e) { console.error(e) }
  }

  const completedSessions = useMemo(() => sessions.filter(s => s.status === 'finished').length, [sessions])
  const activeSessions = useMemo(() => sessions.filter(s => s.status === 'active').length, [sessions])

  const streakDays   = profile?.streakDays ?? profile?.streak ?? 0
  const oneOnOneLeft = profile?.freeOneOnOneRemaining ?? 10
  const groupLeft    = profile?.freeGroupRemaining ?? 10
  const planLabel    = profile?.planLabel || 'Free'
  const planStatus   = profile?.planStatus || 'active'
  const accountStatus = profile?.accountStatus || 'active'
  const isPaid       = profile ? getEffectivePlanId(profile) !== 'free' : false
  const totalCompleted = profile?.sessionsCompleted ?? completedSessions

  // Low credits = either mode has ≤ 3 left and user is on free
  const lowCredits = !isPaid && (oneOnOneLeft <= 3 || groupLeft <= 3)

  // Session history: free users see only 5, paid see all
  const visibleSessions = isPaid ? sessions.slice(0, 20) : sessions.slice(0, 5)
  const lockedCount     = !isPaid && sessions.length > 5 ? sessions.length - 5 : 0

  return (
    <div style={page}>
      <div style={shell}>

        {/* ── Header ── */}
        <header style={header}>
          <div>
            <div style={brand}>Your Dashboard</div>
            <div style={sub}>Track progress, streaks, credits, and your plan.</div>
          </div>
          <div style={row}>
            <Link href="/join" style={linkBtn}>Join session</Link>
            <Link href="/plans" style={linkBtn}>Plans</Link>
            <Link href="/admin" style={linkBtn}>Admin</Link>
            {user
              ? <button onClick={logout} style={buttonDanger}>Log out</button>
              : <button onClick={login} style={buttonBlue}>Sign in</button>
            }
          </div>
        </header>

        {/* ── Signed out state ── */}
        {!user ? (
          <section style={heroCard}>
            <h1 style={title}>Sign in to see your streaks and credits.</h1>
            <p style={text}>
              Once signed in, see your sessions, streak, free credits, and subscription status.
            </p>
            <button onClick={login} style={buttonBlue}>Sign in with Google</button>
          </section>

        ) : (
          <>

            {/* ── LOW CREDITS UPGRADE NUDGE ── */}
            {lowCredits && (
              <div style={{
                marginBottom: 18, padding: '16px 20px', borderRadius: 18,
                background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(124,58,237,0.12))',
                border: '1px solid rgba(239,68,68,0.3)'
              }}>
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>
                  ⚠️ You are almost out of free sessions!
                </div>
                <div style={{ color: '#fca5a5', marginBottom: 12, lineHeight: 1.6 }}>
                  {oneOnOneLeft <= 3 && <span>Only <strong>{oneOnOneLeft} one-on-one</strong> sessions left. </span>}
                  {groupLeft <= 3 && <span>Only <strong>{groupLeft} group</strong> sessions left. </span>}
                  Upgrade for unlimited sessions — starting at just ₹99/month.
                </div>
                <Link href="/plans" style={{
                  display: 'inline-block', padding: '10px 18px', borderRadius: 12,
                  background: 'linear-gradient(90deg, #ef4444, #dc2626)',
                  color: '#fff', fontWeight: 800, textDecoration: 'none'
                }}>
                  Upgrade now — from ₹99 →
                </Link>
              </div>
            )}

            {/* ── Stats grid ── */}
            <section style={grid}>

              {/* Plan card */}
              <div style={cardDark}>
                <div style={smallLabel}>Current plan</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 10 }}>
                  {isPaid ? '⭐ ' : ''}{planLabel}
                </div>
                <div style={muted}>Status: {planStatus}</div>
                <div style={muted}>Account: {accountStatus}</div>
                {!isPaid && (
                  <Link href="/plans" style={{
                    display: 'inline-block', marginTop: 12, padding: '8px 14px',
                    borderRadius: 10, background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
                    color: '#fff', fontWeight: 800, textDecoration: 'none', fontSize: 13
                  }}>
                    Upgrade ↗
                  </Link>
                )}
              </div>

              {/* 🔥 Streak card */}
              <div style={cardDark}>
                <div style={smallLabel}>Study streak</div>
                <div style={{ marginTop: 10 }}>
                  <StreakDisplay days={streakDays} />
                </div>
              </div>

              {/* Sessions completed */}
              <div style={cardDark}>
                <div style={smallLabel}>Sessions completed</div>
                <div style={{ ...bigValue, color: totalCompleted > 0 ? '#34d399' : '#e5e7eb' }}>
                  {totalCompleted}
                </div>
                <div style={muted}>Finished study sessions</div>
              </div>

              {/* Active sessions */}
              <div style={cardDark}>
                <div style={smallLabel}>Active now</div>
                <div style={{ ...bigValue, color: activeSessions > 0 ? '#60a5fa' : '#e5e7eb' }}>
                  {activeSessions}
                </div>
                <div style={muted}>Sessions running right now</div>
              </div>

              {/* Free credits with progress bars */}
              <div style={{ ...cardDark, gridColumn: 'span 2' }}>
                <div style={smallLabel}>Free session credits</div>
                <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
                  <CreditsBar remaining={oneOnOneLeft} total={10} label="1-on-1 sessions" />
                  <CreditsBar remaining={groupLeft} total={10} label="Group sessions" />
                </div>
                {isPaid && (
                  <div style={{ marginTop: 12, color: '#34d399', fontWeight: 700, fontSize: 13 }}>
                    ✅ Paid plan active — unlimited sessions
                  </div>
                )}
                {!isPaid && (
                  <div style={{ marginTop: 10, color: '#94a3b8', fontSize: 13 }}>
                    Credits are only used when you complete a session (leaving in first 2 min is free).
                  </div>
                )}
              </div>

            </section>

            {/* ── Session history ── */}
            <section style={cardLight}>
              <div style={sectionHead}>
                <div>
                  <div style={sectionTitle}>
                    Session history
                    {!isPaid && <span style={{ marginLeft: 8, fontSize: 12, color: '#94a3b8', fontWeight: 400 }}>
                      (Last 5 — upgrade for full history)
                    </span>}
                  </div>
                  <div style={sectionSub}>Your recent study activity.</div>
                </div>
                <Link href="/join" style={buttonBlue}>Start new session</Link>
              </div>

              {loading ? (
                <div style={muted}>Loading sessions...</div>
              ) : sessions.length === 0 ? (
                <div style={emptyBox}>
                  No sessions yet. Join one now and start building your streak. 💪
                </div>
              ) : (
                <div style={sessionList}>
                  {visibleSessions.map(s => (
                    <div key={s.id} style={sessionCard}>
                      <div style={sessionTop}>
                        <strong>{s.exam || 'Exam'} • {s.subject || 'Subject'}</strong>
                        <span style={{
                          ...statusPill,
                          background: s.status === 'finished' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)',
                          color: s.status === 'finished' ? '#4ade80' : '#e2e8f0'
                        }}>
                          {s.status === 'finished' ? '✅ Finished' : s.status === 'active' ? '🟢 Active' : s.status}
                        </span>
                      </div>
                      <div style={sessionMeta}>Mode: {s.mode === 'one-on-one' ? '1-on-1' : 'Group'}</div>
                      <div style={sessionMeta}>{s.participants?.map(p => p.name).join(' • ') || 'No names'}</div>
                    </div>
                  ))}

                  {/* LOCKED HISTORY — upgrade to unlock */}
                  {lockedCount > 0 && (
                    <div style={{
                      padding: 18, borderRadius: 14, textAlign: 'center',
                      background: 'rgba(37,99,235,0.08)',
                      border: '1px dashed rgba(96,165,250,0.4)'
                    }}>
                      <div style={{ fontSize: 22, marginBottom: 8 }}>🔒</div>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>
                        {lockedCount} more session{lockedCount === 1 ? '' : 's'} in your history
                      </div>
                      <div style={{ color: '#94a3b8', marginBottom: 14, fontSize: 14 }}>
                        Upgrade to any paid plan to unlock your full session history.
                      </div>
                      <Link href="/plans" style={{
                        padding: '10px 18px', borderRadius: 12,
                        background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
                        color: '#fff', fontWeight: 800, textDecoration: 'none', fontSize: 14
                      }}>
                        Unlock full history — from ₹99 →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* ── Promo cards ── */}
            <section style={promoGrid}>
              <Link href="/plans" style={promoCard}>
                <div style={promoTitle}>⭐ Upgrade now</div>
                <div style={promoText}>
                  Unlimited sessions, priority matching, and full session history. From ₹99/month.
                </div>
              </Link>

              <Link href="/join" style={promoCard}>
                <div style={promoTitle}>📚 Start studying</div>
                <div style={promoText}>
                  Jump into matchmaking and get paired with a partner in seconds.
                </div>
              </Link>

              <Link href="/admin" style={promoCard}>
                <div style={promoTitle}>🛡️ Admin panel</div>
                <div style={promoText}>
                  Review reports, subscription requests, warnings, and bans.
                </div>
              </Link>
            </section>

          </>
        )}
      </div>
    </div>
  )
}

// ——— Styles ———

const page = {
  minHeight: '100vh',
  background: 'radial-gradient(circle at top left, rgba(37,99,235,0.16), transparent 32%), radial-gradient(circle at top right, rgba(124,58,237,0.14), transparent 26%), linear-gradient(180deg, #0f172a 0%, #111827 100%)',
  color: '#e5e7eb'
}
const shell      = { maxWidth: 1240, margin: '0 auto', padding: '28px 20px 48px' }
const header     = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 22 }
const brand      = { fontSize: 30, fontWeight: 900, letterSpacing: '-0.04em' }
const sub        = { color: '#94a3b8', marginTop: 4 }
const row        = { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }
const linkBtn    = { padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', textDecoration: 'none', fontWeight: 700 }
const buttonBlue = { padding: '10px 14px', borderRadius: 12, border: 'none', background: 'linear-gradient(90deg,#2563eb,#7c3aed)', color: '#fff', fontWeight: 800, cursor: 'pointer', textDecoration: 'none' }
const buttonDanger = { padding: '10px 14px', borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 800, cursor: 'pointer' }
const heroCard   = { padding: 24, borderRadius: 24, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(148,163,184,0.16)' }
const title      = { margin: 0, fontSize: 'clamp(28px,5vw,48px)', lineHeight: 1.1, letterSpacing: '-0.03em' }
const text       = { marginTop: 14, color: '#cbd5e1', fontSize: 16, lineHeight: 1.7 }
const grid       = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, marginTop: 18 }
const cardDark   = { padding: 20, borderRadius: 18, background: 'rgba(15,23,42,0.88)', border: '1px solid rgba(148,163,184,0.14)' }
const smallLabel = { color: '#94a3b8', fontSize: 13, fontWeight: 600 }
const bigValue   = { fontSize: 42, fontWeight: 900, marginTop: 10, lineHeight: 1 }
const muted      = { color: '#cbd5e1', marginTop: 6, lineHeight: 1.6, fontSize: 14 }
const cardLight  = { marginTop: 18, padding: 20, borderRadius: 22, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(148,163,184,0.16)' }
const sectionHead = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }
const sectionTitle = { fontWeight: 900, fontSize: 20 }
const sectionSub = { color: '#94a3b8', marginTop: 4, fontSize: 14 }
const emptyBox   = { padding: 18, borderRadius: 14, background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.12)', color: '#cbd5e1' }
const sessionList = { display: 'grid', gap: 10 }
const sessionCard = { padding: 14, borderRadius: 14, background: 'rgba(15,23,42,0.82)', border: '1px solid rgba(148,163,184,0.12)' }
const sessionTop  = { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }
const sessionMeta = { color: '#cbd5e1', marginTop: 6, lineHeight: 1.5, fontSize: 14 }
const statusPill  = { padding: '4px 10px', borderRadius: 999, border: '1px solid rgba(148,163,184,0.12)', fontSize: 12, fontWeight: 600 }
const promoGrid  = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginTop: 18 }
const promoCard  = { display: 'block', padding: 18, borderRadius: 18, textDecoration: 'none', color: '#e2e8f0', background: 'rgba(15,23,42,0.82)', border: '1px solid rgba(148,163,184,0.12)' }
const promoTitle = { fontWeight: 900, fontSize: 16 }
const promoText  = { marginTop: 8, color: '#94a3b8', lineHeight: 1.6, fontSize: 14 }
                        
