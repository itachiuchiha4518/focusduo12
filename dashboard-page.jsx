'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { auth, db, googleProvider } from '../lib/firebase'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { getEffectivePlanId, applyReferralCode } from '../lib/subscriptions'

// ─── Helpers ─────────────────────────────────────────
function isPro(profile) {
  const id = getEffectivePlanId(profile)
  return id === 'yearly_699' || id === 'first100_year_199' || id === 'pro'
}
function isPaid(profile) {
  return getEffectivePlanId(profile) !== 'free'
}
function fmtHours(seconds) {
  if (!seconds) return '0h 0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return m + 'm'
  return h + 'h ' + m + 'm'
}

// ─── Streak Fire ──────────────────────────────────────
function StreakDisplay({ days, isProUser }) {
  const flames = Math.min(days, 7)
  const msg =
    days === 0 ? 'Start your streak today!' :
    days < 3   ? `${days} day${days > 1 ? 's' : ''} — keep going!` :
    days < 7   ? `${days} days — you're on a roll 🔥` :
    days < 14  ? `${days} days — serious student!` :
                 `${days} days — absolute beast 🏆`
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 26, letterSpacing: 2, minHeight: 32 }}>
        {days === 0 ? '💤' : Array.from({ length: flames }).map(() => '🔥').join('')}
      </div>
      <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, marginTop: 6 }}>{days}</div>
      <div style={{ color: '#94a3b8', marginTop: 6, fontSize: 12, lineHeight: 1.5 }}>{msg}</div>
      {!isProUser && days > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
          🛡️ <Link href="/plans" style={{ color: '#7c3aed', textDecoration: 'none', fontWeight: 700 }}>Upgrade for streak shields</Link>
        </div>
      )}
    </div>
  )
}

// ─── Credits Bar ──────────────────────────────────────
function CreditsBar({ remaining, total, label }) {
  const pct = Math.max(0, Math.min(100, (remaining / total) * 100))
  const col  = pct > 50 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444'
  return (
    <div style={{ marginBottom: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5, fontSize: 13 }}>
        <span style={{ color: '#94a3b8' }}>{label}</span>
        <span style={{ color: col, fontWeight: 800 }}>{remaining} / {total} left</span>
      </div>
      <div style={{ height: 6, borderRadius: 999, background: 'rgba(148,163,184,0.15)' }}>
        <div style={{ height: '100%', width: pct + '%', borderRadius: 999, background: col, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

// ─── Referral Input ───────────────────────────────────
function ReferralSection({ uid, profile }) {
  const [inputCode, setInputCode] = useState('')
  const [msg, setMsg]             = useState('')
  const [busy, setBusy]           = useState(false)

  const myCode = profile?.referralCode || ''
  const alreadyUsed = !!profile?.referredBy

  async function handleApply() {
    if (!inputCode.trim() || !uid) return
    setBusy(true); setMsg('')
    try {
      const result = await applyReferralCode(uid, inputCode.trim())
      if (result.success) {
        setMsg('✅ Code applied! You both got 1 bonus session in each mode.')
        setInputCode('')
      } else if (result.reason === 'already-applied') {
        setMsg('You have already used a referral code.')
      } else if (result.reason === 'self-referral') {
        setMsg('You cannot use your own referral code.')
      } else if (result.reason === 'invalid-code') {
        setMsg('Invalid code. Check and try again.')
      } else {
        setMsg('Something went wrong. Try again.')
      }
    } catch (e) {
      setMsg('Error: ' + (e.message || 'Try again'))
    } finally { setBusy(false) }
  }

  function copyCode() {
    if (!myCode) return
    navigator.clipboard.writeText(myCode).then(() => setMsg('Copied!')).catch(() => setMsg('Copy failed'))
    setTimeout(() => setMsg(''), 2000)
  }

  return (
    <div style={{ ...cardDark, marginTop: 14 }}>
      <div style={smallLabel}>🔗 Referral</div>

      {/* My code */}
      {myCode && (
        <div style={{ marginTop: 12, marginBottom: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 6 }}>Your referral code</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{
              padding: '10px 16px', borderRadius: 12, fontWeight: 900, fontSize: 18,
              background: 'rgba(37,99,235,0.12)', border: '2px dashed rgba(96,165,250,0.4)',
              color: '#93c5fd', letterSpacing: 3, fontFamily: 'monospace'
            }}>
              {myCode}
            </div>
            <button onClick={copyCode} style={{ padding: '9px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13, border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(37,99,235,0.08)', color: '#93c5fd', cursor: 'pointer' }}>
              📋 Copy
            </button>
          </div>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 8 }}>
            Share this with friends. Both of you get <strong style={{ color: '#e2e8f0' }}>+1 session in each mode</strong> when they sign up.
          </div>
          <div style={{ marginTop: 6, fontSize: 12, color: '#64748b' }}>
            Referred: <strong style={{ color: '#e2e8f0' }}>{profile?.referredCount || 0}</strong> friend{(profile?.referredCount || 0) !== 1 ? 's' : ''} ·
            Earned: <strong style={{ color: '#4ade80' }}>{profile?.bonusSessionsEarned || 0}</strong> bonus session{(profile?.bonusSessionsEarned || 0) !== 1 ? 's' : ''}
          </div>
        </div>
      )}

      {/* Apply a code */}
      {!alreadyUsed && (
        <div>
          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>Have a friend's referral code?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={inputCode}
              onChange={e => setInputCode(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleApply()}
              placeholder="Enter 8-char code e.g. ABC12345"
              maxLength={10}
              style={{
                flex: 1, minWidth: 160, padding: '10px 14px', borderRadius: 10,
                border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(255,255,255,0.04)',
                color: '#f8fafc', outline: 'none', fontSize: 14, fontFamily: 'monospace', letterSpacing: 1
              }}
            />
            <button
              onClick={handleApply}
              disabled={busy || !inputCode.trim()}
              style={{
                padding: '10px 18px', borderRadius: 10, fontWeight: 800, fontSize: 13,
                border: 'none', background: 'linear-gradient(90deg,#2563eb,#7c3aed)', color: '#fff',
                cursor: busy ? 'not-allowed' : 'pointer', opacity: inputCode.trim() ? 1 : 0.5
              }}
            >
              {busy ? '...' : 'Apply'}
            </button>
          </div>
        </div>
      )}

      {alreadyUsed && (
        <div style={{ color: '#4ade80', fontSize: 13, marginTop: 4 }}>
          ✅ You already used a referral code — bonus sessions added!
        </div>
      )}

      {msg && (
        <div style={{ marginTop: 10, fontSize: 13, color: msg.startsWith('✅') ? '#4ade80' : '#fca5a5', fontWeight: 600 }}>
          {msg}
        </div>
      )}
    </div>
  )
}

// ─── Pro Gate wrapper ─────────────────────────────────
function ProGate({ children, label }) {
  return (
    <div style={{ position: 'relative' }}>
      {children}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 18,
        background: 'rgba(8,13,24,0.88)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)', zIndex: 5
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#e2e8f0', marginBottom: 6 }}>Pro only</div>
        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12, textAlign: 'center', maxWidth: 160, lineHeight: 1.5 }}>{label}</div>
        <Link href="/plans" style={{
          padding: '8px 16px', borderRadius: 10, fontWeight: 800, fontSize: 12,
          background: 'linear-gradient(90deg,#2563eb,#7c3aed)', color: '#fff', textDecoration: 'none'
        }}>
          Upgrade →
        </Link>
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────
export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser]       = useState(null)
  const [profile, setProfile] = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async u => {
      setUser(u || null)
      if (!u) { setProfile(null); setSessions([]); setLoading(false); return }
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
      } catch (e) { console.error(e) }
      finally { setLoading(false) }
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
  const isProUser  = isPro(profile)
  const isPaidUser = isPaid(profile)

  const streakDays   = profile?.streakDays ?? profile?.streak ?? 0
  const oneOnOneLeft = profile?.freeOneOnOneRemaining ?? 10
  const groupLeft    = profile?.freeGroupRemaining ?? 10
  const planLabel    = profile?.planLabel || 'Free'
  const totalStudySecs = profile?.totalStudySeconds ?? 0
  const shieldsLeft  = profile?.streakShieldsRemaining ?? 0
  const totalCompleted = profile?.sessionsCompleted ?? completedSessions
  const lowCredits   = !isPaidUser && (oneOnOneLeft <= 3 || groupLeft <= 3)

  // Session history: free = last 5, paid = last 20
  const visibleSessions = isPaidUser ? sessions.slice(0, 20) : sessions.slice(0, 5)
  const lockedCount = !isPaidUser && sessions.length > 5 ? sessions.length - 5 : 0

  return (
    <div style={page}>
      <div style={shell}>

        {/* Header */}
        <header style={header}>
          <div>
            <div style={brand}>Your Dashboard</div>
            <div style={sub}>Track progress, streaks, credits, and plan.</div>
          </div>
          <div style={row}>
            <Link href="/join" style={linkBtn}>Join session</Link>
            <Link href="/plans" style={linkBtn}>Plans</Link>
            <Link href="/leaderboard" style={linkBtn}>Leaderboard</Link>
            {user
              ? <button onClick={logout} style={buttonDanger}>Log out</button>
              : <button onClick={login} style={buttonBlue}>Sign in</button>
            }
          </div>
        </header>

        {/* Signed out */}
        {!user ? (
          <section style={heroCard}>
            <h1 style={title}>Sign in to see your streaks and credits.</h1>
            <p style={text}>Sessions, streak, credits, and subscription status — all here.</p>
            <button onClick={login} style={buttonBlue}>Sign in with Google</button>
          </section>
        ) : (
          <>
            {/* Low credits nudge */}
            {lowCredits && (
              <div style={{ marginBottom: 16, padding: '16px 20px', borderRadius: 18, background: 'linear-gradient(135deg,rgba(239,68,68,0.15),rgba(124,58,237,0.12))', border: '1px solid rgba(239,68,68,0.3)' }}>
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>⚠️ Almost out of free sessions!</div>
                <div style={{ color: '#fca5a5', marginBottom: 12, lineHeight: 1.6, fontSize: 14 }}>
                  {oneOnOneLeft <= 3 && <span>Only <strong>{oneOnOneLeft}</strong> 1-on-1 left. </span>}
                  {groupLeft <= 3 && <span>Only <strong>{groupLeft}</strong> group left. </span>}
                  Upgrade from ₹99/month for unlimited sessions.
                </div>
                <Link href="/plans" style={{ display: 'inline-block', padding: '10px 18px', borderRadius: 12, background: 'linear-gradient(90deg,#ef4444,#dc2626)', color: '#fff', fontWeight: 800, textDecoration: 'none', fontSize: 14 }}>
                  Upgrade now →
                </Link>
              </div>
            )}

            {/* Stats grid */}
            <section style={grid}>

              {/* Plan card */}
              <div style={cardDark}>
                <div style={smallLabel}>Current plan</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 10 }}>
                  {isPaidUser ? '⭐ ' : ''}{planLabel}
                </div>
                {isProUser && <div style={{ marginTop: 4, fontSize: 12, color: '#a78bfa', fontWeight: 700 }}>🏆 Pro member</div>}
                {!isPaidUser && (
                  <Link href="/plans" style={{ display: 'inline-block', marginTop: 12, padding: '8px 14px', borderRadius: 10, background: 'linear-gradient(90deg,#2563eb,#7c3aed)', color: '#fff', fontWeight: 800, textDecoration: 'none', fontSize: 13 }}>
                    Upgrade ↗
                  </Link>
                )}
              </div>

              {/* Streak — pro shows shield info */}
              {isProUser ? (
                <div style={cardDark}>
                  <div style={smallLabel}>Study streak</div>
                  <div style={{ marginTop: 10 }}>
                    <StreakDisplay days={streakDays} isProUser={true} />
                  </div>
                  {shieldsLeft > 0 && (
                    <div style={{ marginTop: 10, padding: '6px 12px', borderRadius: 10, background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)', fontSize: 12, color: '#a78bfa', fontWeight: 700 }}>
                      🛡️ {shieldsLeft} streak shield{shieldsLeft !== 1 ? 's' : ''} remaining
                    </div>
                  )}
                </div>
              ) : (
                <div style={cardDark}>
                  <div style={smallLabel}>Study streak</div>
                  <div style={{ marginTop: 10 }}>
                    <StreakDisplay days={streakDays} isProUser={false} />
                  </div>
                </div>
              )}

              {/* Sessions */}
              <div style={cardDark}>
                <div style={smallLabel}>Sessions completed</div>
                <div style={{ ...bigValue, color: totalCompleted > 0 ? '#34d399' : '#e5e7eb' }}>{totalCompleted}</div>
                <div style={muted}>Finished sessions</div>
              </div>

              {/* Total hours — PRO ONLY */}
              {isProUser ? (
                <div style={cardDark}>
                  <div style={smallLabel}>⏱️ Total hours studied</div>
                  <div style={{ ...bigValue, color: '#93c5fd' }}>{fmtHours(totalStudySecs)}</div>
                  <div style={muted}>All time across all sessions</div>
                </div>
              ) : (
                <ProGate label="Total hours tracked for Pro members">
                  <div style={cardDark}>
                    <div style={smallLabel}>⏱️ Total hours studied</div>
                    <div style={{ ...bigValue, color: '#93c5fd' }}>—</div>
                    <div style={muted}>Track your total study time</div>
                  </div>
                </ProGate>
              )}

              {/* Credits */}
              <div style={{ ...cardDark, gridColumn: 'span 2' }}>
                <div style={smallLabel}>Free session credits</div>
                <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
                  <CreditsBar remaining={oneOnOneLeft} total={10} label="1-on-1 sessions" />
                  <CreditsBar remaining={groupLeft}    total={10} label="Group sessions" />
                </div>
                {isPaidUser && <div style={{ marginTop: 12, color: '#34d399', fontWeight: 700, fontSize: 13 }}>✅ Paid plan active — unlimited sessions</div>}
                {!isPaidUser && (
                  <div style={{ marginTop: 10, color: '#64748b', fontSize: 12 }}>
                    Credits only deducted after the 2-minute grace period.
                  </div>
                )}
              </div>
            </section>

            {/* Referral section */}
            <ReferralSection uid={user.uid} profile={profile} />

            {/* Session history */}
            <section style={{ ...cardLight, marginTop: 14 }}>
              <div style={sectionHead}>
                <div>
                  <div style={sectionTitle}>
                    Session history
                    {!isPaidUser && (
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b', fontWeight: 400 }}>
                        (last 5 — upgrade for full)
                      </span>
                    )}
                  </div>
                  <div style={sectionSub}>Your recent study activity.</div>
                </div>
                <Link href="/join" style={buttonBlue}>Start new</Link>
              </div>

              {loading ? (
                <div style={muted}>Loading sessions...</div>
              ) : sessions.length === 0 ? (
                <div style={emptyBox}>No sessions yet. Join one and start building your streak 💪</div>
              ) : (
                <div style={sessionList}>
                  {visibleSessions.map(s => (
                    <div key={s.id} style={sessionCard}>
                      <div style={sessionTop}>
                        <strong>{s.exam || 'Exam'} · {s.subject || 'Subject'}</strong>
                        <span style={{ ...statusPill, background: s.status === 'finished' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)', color: s.status === 'finished' ? '#4ade80' : '#e2e8f0' }}>
                          {s.status === 'finished' ? '✅ Done' : s.status === 'active' ? '🟢 Live' : s.status}
                        </span>
                      </div>
                      <div style={sessionMeta}>Mode: {s.mode === 'one-on-one' ? '1-on-1' : 'Group'}</div>
                      <div style={sessionMeta}>{s.participants?.map(p => p.name).join(' · ') || '—'}</div>
                      {s.chapter && <div style={{ ...sessionMeta, color: '#93c5fd' }}>📖 {s.chapter}</div>}
                    </div>
                  ))}

                  {lockedCount > 0 && (
                    <div style={{ padding: 18, borderRadius: 14, textAlign: 'center', background: 'rgba(37,99,235,0.06)', border: '1px dashed rgba(96,165,250,0.3)' }}>
                      <div style={{ fontSize: 22, marginBottom: 8 }}>🔒</div>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>
                        {lockedCount} more session{lockedCount !== 1 ? 's' : ''} in your history
                      </div>
                      <div style={{ color: '#64748b', marginBottom: 14, fontSize: 14 }}>Upgrade to unlock full history.</div>
                      <Link href="/plans" style={{ padding: '10px 18px', borderRadius: 12, background: 'linear-gradient(90deg,#2563eb,#7c3aed)', color: '#fff', fontWeight: 800, textDecoration: 'none', fontSize: 14 }}>
                        Unlock full history →
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </section>

            {/* Promo cards */}
            <section style={promoGrid}>
              <Link href="/plans" style={promoCard}>
                <div style={promoTitle}>⭐ Upgrade</div>
                <div style={promoText}>Unlimited sessions, priority matching, full history. From ₹99/month.</div>
              </Link>
              <Link href="/join" style={promoCard}>
                <div style={promoTitle}>📚 Study now</div>
                <div style={promoText}>Jump into matchmaking and get paired in seconds.</div>
              </Link>
              <Link href="/leaderboard" style={promoCard}>
                <div style={promoTitle}>🏆 Leaderboard</div>
                <div style={promoText}>See the top students this week by sessions and streak.</div>
              </Link>
            </section>
          </>
        )}
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────
const page = {
  minHeight: '100vh',
  background: 'radial-gradient(circle at top left,rgba(37,99,235,0.14),transparent 32%),radial-gradient(circle at top right,rgba(124,58,237,0.12),transparent 26%),linear-gradient(180deg,#0f172a 0%,#111827 100%)',
  color: '#e5e7eb'
}
const shell       = { maxWidth: 1240, margin: '0 auto', padding: '28px 20px 48px' }
const header      = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }
const brand       = { fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em' }
const sub         = { color: '#94a3b8', marginTop: 4, fontSize: 14 }
const row         = { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }
const linkBtn     = { padding: '9px 14px', borderRadius: 12, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', textDecoration: 'none', fontWeight: 700, fontSize: 14 }
const buttonBlue  = { padding: '9px 14px', borderRadius: 12, border: 'none', background: 'linear-gradient(90deg,#2563eb,#7c3aed)', color: '#fff', fontWeight: 800, cursor: 'pointer', textDecoration: 'none', fontSize: 14 }
const buttonDanger= { padding: '9px 14px', borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14 }
const heroCard    = { padding: 24, borderRadius: 24, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.14)' }
const title       = { margin: 0, fontSize: 'clamp(28px,5vw,46px)', lineHeight: 1.1, fontWeight: 900 }
const text        = { marginTop: 14, color: '#cbd5e1', fontSize: 16, lineHeight: 1.7 }
const grid        = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginTop: 16 }
const cardDark    = { padding: 18, borderRadius: 18, background: 'rgba(15,23,42,0.88)', border: '1px solid rgba(148,163,184,0.12)', position: 'relative' }
const smallLabel  = { color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }
const bigValue    = { fontSize: 40, fontWeight: 900, marginTop: 10, lineHeight: 1 }
const muted       = { color: '#cbd5e1', marginTop: 6, lineHeight: 1.6, fontSize: 14 }
const cardLight   = { padding: 18, borderRadius: 22, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.14)' }
const sectionHead = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }
const sectionTitle= { fontWeight: 900, fontSize: 18 }
const sectionSub  = { color: '#94a3b8', marginTop: 4, fontSize: 13 }
const emptyBox    = { padding: 18, borderRadius: 14, background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.1)', color: '#cbd5e1', fontSize: 14 }
const sessionList = { display: 'grid', gap: 10 }
const sessionCard = { padding: 14, borderRadius: 14, background: 'rgba(15,23,42,0.82)', border: '1px solid rgba(148,163,184,0.1)' }
const sessionTop  = { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }
const sessionMeta = { color: '#cbd5e1', marginTop: 5, lineHeight: 1.5, fontSize: 13 }
const statusPill  = { padding: '3px 9px', borderRadius: 999, border: '1px solid rgba(148,163,184,0.1)', fontSize: 12, fontWeight: 600 }
const promoGrid   = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginTop: 14 }
const promoCard   = { display: 'block', padding: 16, borderRadius: 18, textDecoration: 'none', color: '#e2e8f0', background: 'rgba(15,23,42,0.82)', border: '1px solid rgba(148,163,184,0.1)' }
const promoTitle  = { fontWeight: 900, fontSize: 15 }
const promoText   = { marginTop: 6, color: '#94a3b8', lineHeight: 1.6, fontSize: 13 }
