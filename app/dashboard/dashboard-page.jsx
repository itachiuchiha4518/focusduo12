'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { auth, db, googleProvider } from '../../lib/firebase'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { getEffectivePlanId, applyReferralCode } from '../../lib/subscriptions'

// ─── Helpers ─────────────────────────────────────────
function isPro(profile) {
  const id = getEffectivePlanId(profile)
  return id === 'yearly_699' || id === 'first100_year_199' || id === 'pro'
}
function isPaid(profile) {
  return getEffectivePlanId(profile) !== 'free'
}
function fmtHours(seconds) {
  if (!seconds) return '0m'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h === 0) return m + 'm'
  return h + 'h ' + m + 'm'
}

// ─── Streak display ───────────────────────────────────
function StreakDisplay({ days, isProUser }) {
  const flames = Math.min(days, 7)
  const msg =
    days === 0 ? 'Start your streak today!' :
    days < 3   ? days + ' day' + (days > 1 ? 's' : '') + ' — keep going!' :
    days < 7   ? days + ' days — on a roll 🔥' :
    days < 14  ? days + ' days — serious student!' :
                 days + ' days — beast mode 🏆'

  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 26, letterSpacing: 2, minHeight: 32 }}>
        {days === 0 ? '💤' : Array.from({ length: flames }).map(function() { return '🔥' }).join('')}
      </div>
      <div style={{ fontSize: 40, fontWeight: 900, lineHeight: 1, marginTop: 6 }}>{days}</div>
      <div style={{ color: '#94a3b8', marginTop: 6, fontSize: 12, lineHeight: 1.5 }}>{msg}</div>
      {!isProUser && days > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#64748b' }}>
          🛡️{' '}
          <Link href="/plans" style={{ color: '#7c3aed', textDecoration: 'none', fontWeight: 700 }}>
            Upgrade for streak shields
          </Link>
        </div>
      )}
    </div>
  )
}

// ─── Credits progress bar ─────────────────────────────
function CreditsBar({ remaining, total, label }) {
  var pct = Math.max(0, Math.min(100, (remaining / total) * 100))
  var col = pct > 50 ? '#22c55e' : pct > 20 ? '#f59e0b' : '#ef4444'
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

// ─── Referral section ─────────────────────────────────
function ReferralSection({ uid, profile }) {
  const [inputCode, setInputCode] = useState('')
  const [msg, setMsg]             = useState('')
  const [busy, setBusy]           = useState(false)

  var myCode      = profile && profile.referralCode ? profile.referralCode : ''
  var alreadyUsed = profile && !!profile.referredBy
  var referredCount = profile && profile.referredCount ? profile.referredCount : 0
  var bonusEarned   = profile && profile.bonusSessionsEarned ? profile.bonusSessionsEarned : 0

  async function handleApply() {
    if (!inputCode.trim() || !uid) return
    setBusy(true)
    setMsg('')
    try {
      var result = await applyReferralCode(uid, inputCode.trim())
      if (result.success) {
        setMsg('✅ Code applied! You both got +1 session in each mode.')
        setInputCode('')
      } else if (result.reason === 'already-applied') {
        setMsg('You have already used a referral code.')
      } else if (result.reason === 'self-referral') {
        setMsg('You cannot use your own referral code.')
      } else if (result.reason === 'invalid-code') {
        setMsg('Invalid code. Check spelling and try again.')
      } else {
        setMsg('Something went wrong. Please try again.')
      }
    } catch (e) {
      setMsg('Error: ' + (e.message || 'Please try again.'))
    } finally {
      setBusy(false)
    }
  }

  function copyCode() {
    if (!myCode) return
    navigator.clipboard.writeText(myCode)
      .then(function() { setMsg('Copied!') })
      .catch(function() { setMsg('Copy failed — copy it manually.') })
    setTimeout(function() { setMsg('') }, 2000)
  }

  return (
    <div style={cardDark}>
      <div style={smallLabel}>🔗 Referral</div>

      {myCode ? (
        <div style={{ marginTop: 14, marginBottom: 16 }}>
          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>Your referral code</div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{
              padding: '10px 18px', borderRadius: 12, fontWeight: 900, fontSize: 20,
              background: 'rgba(37,99,235,0.1)', border: '2px dashed rgba(96,165,250,0.35)',
              color: '#93c5fd', letterSpacing: 4, fontFamily: 'monospace'
            }}>
              {myCode}
            </div>
            <button onClick={copyCode} style={{
              padding: '9px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13,
              border: '1px solid rgba(96,165,250,0.3)', background: 'rgba(37,99,235,0.08)',
              color: '#93c5fd', cursor: 'pointer'
            }}>
              📋 Copy
            </button>
          </div>
          <div style={{ color: '#64748b', fontSize: 12, marginTop: 10, lineHeight: 1.7 }}>
            Share this with friends. When they sign up with your code, both of you get{' '}
            <strong style={{ color: '#e2e8f0' }}>+1 session in each mode</strong> instantly.
          </div>
          <div style={{ marginTop: 6, fontSize: 13, color: '#64748b' }}>
            Referred:{' '}
            <strong style={{ color: '#e2e8f0' }}>{referredCount}</strong> friend{referredCount !== 1 ? 's' : ''}{' '}
            · Earned:{' '}
            <strong style={{ color: '#4ade80' }}>{bonusEarned}</strong> bonus session{bonusEarned !== 1 ? 's' : ''}
          </div>
        </div>
      ) : null}

      {alreadyUsed ? (
        <div style={{ color: '#4ade80', fontSize: 13, marginTop: 4, fontWeight: 600 }}>
          ✅ You already used a referral code — bonus sessions added!
        </div>
      ) : (
        <div>
          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 8 }}>Have a friend's referral code?</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={inputCode}
              onChange={function(e) { setInputCode(e.target.value.toUpperCase()) }}
              onKeyDown={function(e) { if (e.key === 'Enter') handleApply() }}
              placeholder="e.g. ABC12345"
              maxLength={10}
              style={{
                flex: 1, minWidth: 160, padding: '10px 14px', borderRadius: 10,
                border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(255,255,255,0.04)',
                color: '#f8fafc', outline: 'none', fontSize: 14,
                fontFamily: 'monospace', letterSpacing: 1
              }}
            />
            <button
              onClick={handleApply}
              disabled={busy || !inputCode.trim()}
              style={{
                padding: '10px 18px', borderRadius: 10, fontWeight: 800, fontSize: 13,
                border: 'none', background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
                color: '#fff', cursor: busy ? 'not-allowed' : 'pointer',
                opacity: inputCode.trim() ? 1 : 0.5
              }}
            >
              {busy ? '...' : 'Apply'}
            </button>
          </div>
        </div>
      )}

      {msg ? (
        <div style={{
          marginTop: 10, fontSize: 13, fontWeight: 600,
          color: msg.startsWith('✅') || msg === 'Copied!' ? '#4ade80' : '#fca5a5'
        }}>
          {msg}
        </div>
      ) : null}
    </div>
  )
}

// ─── Pro gate overlay ─────────────────────────────────
function ProGate({ children, label }) {
  return (
    <div style={{ position: 'relative' }}>
      {children}
      <div style={{
        position: 'absolute', inset: 0, borderRadius: 18,
        background: 'rgba(8,13,24,0.88)',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        backdropFilter: 'blur(4px)', zIndex: 5
      }}>
        <div style={{ fontSize: 28, marginBottom: 8 }}>🔒</div>
        <div style={{ fontWeight: 800, fontSize: 14, color: '#e2e8f0', marginBottom: 6 }}>Pro only</div>
        <div style={{ color: '#64748b', fontSize: 12, marginBottom: 12, textAlign: 'center', maxWidth: 160, lineHeight: 1.5 }}>
          {label}
        </div>
        <Link href="/plans" style={{
          padding: '8px 16px', borderRadius: 10, fontWeight: 800, fontSize: 12,
          background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
          color: '#fff', textDecoration: 'none'
        }}>
          Upgrade →
        </Link>
      </div>
    </div>
  )
}

// ─── Main page ────────────────────────────────────────
export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser]         = useState(null)
  const [profile, setProfile]   = useState(null)
  const [sessions, setSessions] = useState([])
  const [loading, setLoading]   = useState(true)

  useEffect(function() {
    var unsub = onAuthStateChanged(auth, async function(u) {
      setUser(u || null)
      if (!u) {
        setProfile(null)
        setSessions([])
        setLoading(false)
        return
      }
      try {
        setLoading(true)
        var pSnap = await getDoc(doc(db, 'users', u.uid))
        setProfile(pSnap.exists() ? pSnap.data() : null)
        var q = query(collection(db, 'sessions'), where('participantUids', 'array-contains', u.uid))
        var sSnap = await getDocs(q)
        var items = sSnap.docs.map(function(d) {
          return Object.assign({ id: d.id }, d.data())
        }).sort(function(a, b) {
          var at = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0
          var bt = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0
          return bt - at
        })
        setSessions(items)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    })
    return function() { unsub() }
  }, [])

  async function login() {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (e) {
      console.error(e)
      alert('Google sign in failed. Please try again.')
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

  var completedSessions = useMemo(function() {
    return sessions.filter(function(s) { return s.status === 'finished' }).length
  }, [sessions])

  var isProUser  = isPro(profile)
  var isPaidUser = isPaid(profile)

  var streakDays     = profile ? (profile.streakDays || profile.streak || 0) : 0
  var oneOnOneLeft   = profile ? (profile.freeOneOnOneRemaining !== undefined ? profile.freeOneOnOneRemaining : 10) : 10
  var groupLeft      = profile ? (profile.freeGroupRemaining !== undefined ? profile.freeGroupRemaining : 10) : 10
  var planLabel      = profile ? (profile.planLabel || 'Free') : 'Free'
  var totalStudySecs = profile ? (profile.totalStudySeconds || 0) : 0
  var shieldsLeft    = profile ? (profile.streakShieldsRemaining || 0) : 0
  var totalCompleted = profile ? (profile.sessionsCompleted || completedSessions) : completedSessions
  var lowCredits     = !isPaidUser && (oneOnOneLeft <= 3 || groupLeft <= 3)

  var visibleSessions = isPaidUser ? sessions.slice(0, 20) : sessions.slice(0, 5)
  var lockedCount     = !isPaidUser && sessions.length > 5 ? sessions.length - 5 : 0

  // ─── Render ───────────────────────────────────────
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
            {user && user.uid === 'NIsbHB9RmXgR5vJEyv8CuV0ggD03' ? (
              <Link href="/admin" style={Object.assign({}, linkBtn, {
                background: 'rgba(251,191,36,0.1)',
                border: '1px solid rgba(251,191,36,0.35)',
                color: '#fbbf24',
                fontWeight: 800
              })}>
                ⚙️ Admin
              </Link>
            ) : null}
            {user
              ? <button onClick={logout} style={buttonDanger}>Log out</button>
              : <button onClick={login} style={buttonBlue}>Sign in</button>
            }
          </div>
        </header>

        {/* Signed out state */}
        {!user ? (
          <section style={heroCard}>
            <h1 style={title}>Sign in to see your streaks and credits.</h1>
            <p style={textStyle}>Sessions, streak, credits, and subscription status — all here.</p>
            <button onClick={login} style={buttonBlue}>Sign in with Google</button>
          </section>
        ) : (
          <div>
            {/* Low credits nudge */}
            {lowCredits ? (
              <div style={{
                marginBottom: 16, padding: '16px 20px', borderRadius: 18,
                background: 'linear-gradient(135deg,rgba(239,68,68,0.15),rgba(124,58,237,0.12))',
                border: '1px solid rgba(239,68,68,0.3)'
              }}>
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 6 }}>
                  ⚠️ Almost out of free sessions!
                </div>
                <div style={{ color: '#fca5a5', marginBottom: 12, lineHeight: 1.6, fontSize: 14 }}>
                  {oneOnOneLeft <= 3 ? 'Only ' + oneOnOneLeft + ' 1-on-1 left. ' : ''}
                  {groupLeft <= 3 ? 'Only ' + groupLeft + ' group left. ' : ''}
                  Upgrade from ₹99/month for unlimited sessions.
                </div>
                <Link href="/plans" style={{
                  display: 'inline-block', padding: '10px 18px', borderRadius: 12,
                  background: 'linear-gradient(90deg,#ef4444,#dc2626)',
                  color: '#fff', fontWeight: 800, textDecoration: 'none', fontSize: 14
                }}>
                  Upgrade now →
                </Link>
              </div>
            ) : null}

            {/* Stats grid */}
            <section style={grid}>

              {/* Plan */}
              <div style={cardDark}>
                <div style={smallLabel}>Current plan</div>
                <div style={{ fontSize: 22, fontWeight: 900, marginTop: 10 }}>
                  {isPaidUser ? '⭐ ' : ''}{planLabel}
                </div>
                {isProUser ? (
                  <div style={{ marginTop: 4, fontSize: 12, color: '#a78bfa', fontWeight: 700 }}>
                    🏆 Pro member
                  </div>
                ) : null}
                {!isPaidUser ? (
                  <Link href="/plans" style={{
                    display: 'inline-block', marginTop: 12, padding: '8px 14px', borderRadius: 10,
                    background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
                    color: '#fff', fontWeight: 800, textDecoration: 'none', fontSize: 13
                  }}>
                    Upgrade ↗
                  </Link>
                ) : null}
              </div>

              {/* Streak */}
              <div style={cardDark}>
                <div style={smallLabel}>Study streak</div>
                <div style={{ marginTop: 10 }}>
                  <StreakDisplay days={streakDays} isProUser={isProUser} />
                </div>
                {isProUser && shieldsLeft > 0 ? (
                  <div style={{
                    marginTop: 10, padding: '6px 12px', borderRadius: 10,
                    background: 'rgba(124,58,237,0.1)', border: '1px solid rgba(124,58,237,0.25)',
                    fontSize: 12, color: '#a78bfa', fontWeight: 700
                  }}>
                    🛡️ {shieldsLeft} streak shield{shieldsLeft !== 1 ? 's' : ''} remaining
                  </div>
                ) : null}
              </div>

              {/* Sessions completed */}
              <div style={cardDark}>
                <div style={smallLabel}>Sessions completed</div>
                <div style={Object.assign({}, bigValue, { color: totalCompleted > 0 ? '#34d399' : '#e5e7eb' })}>
                  {totalCompleted}
                </div>
                <div style={muted}>Finished sessions</div>
              </div>

              {/* Total hours — Pro only */}
              {isProUser ? (
                <div style={cardDark}>
                  <div style={smallLabel}>⏱️ Total hours studied</div>
                  <div style={Object.assign({}, bigValue, { color: '#93c5fd' })}>
                    {fmtHours(totalStudySecs)}
                  </div>
                  <div style={muted}>All time across all sessions</div>
                </div>
              ) : (
                <ProGate label="Total study hours tracked for Pro members">
                  <div style={cardDark}>
                    <div style={smallLabel}>⏱️ Total hours studied</div>
                    <div style={Object.assign({}, bigValue, { color: '#93c5fd' })}>—</div>
                    <div style={muted}>Track your total study time</div>
                  </div>
                </ProGate>
              )}

              {/* Credits */}
              <div style={Object.assign({}, cardDark, { gridColumn: 'span 2' })}>
                <div style={smallLabel}>Free session credits</div>
                <div style={{ marginTop: 14, display: 'grid', gap: 14 }}>
                  <CreditsBar remaining={oneOnOneLeft} total={10} label="1-on-1 sessions" />
                  <CreditsBar remaining={groupLeft}    total={10} label="Group sessions" />
                </div>
                {isPaidUser ? (
                  <div style={{ marginTop: 12, color: '#34d399', fontWeight: 700, fontSize: 13 }}>
                    ✅ Paid plan active — unlimited sessions
                  </div>
                ) : (
                  <div style={{ marginTop: 10, color: '#64748b', fontSize: 12 }}>
                    Credits are only used after the 2-minute grace period.
                  </div>
                )}
              </div>
            </section>

            {/* Referral section */}
            <div style={{ marginTop: 14 }}>
              <ReferralSection uid={user.uid} profile={profile} />
            </div>

            {/* Session history */}
            <section style={Object.assign({}, cardLight, { marginTop: 14 })}>
              <div style={sectionHead}>
                <div>
                  <div style={sectionTitle}>
                    Session history
                    {!isPaidUser ? (
                      <span style={{ marginLeft: 8, fontSize: 12, color: '#64748b', fontWeight: 400 }}>
                        (last 5 — upgrade for full)
                      </span>
                    ) : null}
                  </div>
                  <div style={sectionSub}>Your recent study activity.</div>
                </div>
                <Link href="/join" style={buttonBlue}>Start new</Link>
              </div>

              {loading ? (
                <div style={muted}>Loading sessions...</div>
              ) : sessions.length === 0 ? (
                <div style={emptyBox}>
                  No sessions yet. Join one and start building your streak 💪
                </div>
              ) : (
                <div style={sessionList}>
                  {visibleSessions.map(function(s) {
                    return (
                      <div key={s.id} style={sessionCard}>
                        <div style={sessionTop}>
                          <strong>{s.exam || 'Exam'} · {s.subject || 'Subject'}</strong>
                          <span style={Object.assign({}, statusPill, {
                            background: s.status === 'finished' ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)',
                            color: s.status === 'finished' ? '#4ade80' : '#e2e8f0'
                          })}>
                            {s.status === 'finished' ? '✅ Done' : s.status === 'active' ? '🟢 Live' : s.status}
                          </span>
                        </div>
                        <div style={sessionMeta}>
                          Mode: {s.mode === 'one-on-one' ? '1-on-1' : 'Group'}
                        </div>
                        <div style={sessionMeta}>
                          {s.participants ? s.participants.map(function(p) { return p.name }).join(' · ') : '—'}
                        </div>
                        {s.chapter ? (
                          <div style={Object.assign({}, sessionMeta, { color: '#93c5fd' })}>
                            📖 {s.chapter}
                          </div>
                        ) : null}
                      </div>
                    )
                  })}

                  {lockedCount > 0 ? (
                    <div style={{
                      padding: 18, borderRadius: 14, textAlign: 'center',
                      background: 'rgba(37,99,235,0.06)',
                      border: '1px dashed rgba(96,165,250,0.3)'
                    }}>
                      <div style={{ fontSize: 22, marginBottom: 8 }}>🔒</div>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>
                        {lockedCount} more session{lockedCount !== 1 ? 's' : ''} in your history
                      </div>
                      <div style={{ color: '#64748b', marginBottom: 14, fontSize: 14 }}>
                        Upgrade to unlock your full session history.
                      </div>
                      <Link href="/plans" style={{
                        padding: '10px 18px', borderRadius: 12,
                        background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
                        color: '#fff', fontWeight: 800, textDecoration: 'none', fontSize: 14
                      }}>
                        Unlock full history →
                      </Link>
                    </div>
                  ) : null}
                </div>
              )}
            </section>

            {/* Promo cards */}
            <section style={promoGrid}>
              <Link href="/plans" style={promoCard}>
                <div style={promoTitle}>⭐ Upgrade</div>
                <div style={promoText}>
                  Unlimited sessions, priority matching, full history. From ₹99/month.
                </div>
              </Link>
              <Link href="/join" style={promoCard}>
                <div style={promoTitle}>📚 Study now</div>
                <div style={promoText}>
                  Jump into matchmaking and get paired in seconds.
                </div>
              </Link>
              <Link href="/leaderboard" style={promoCard}>
                <div style={promoTitle}>🏆 Leaderboard</div>
                <div style={promoText}>
                  See the top students this week by sessions and streak.
                </div>
              </Link>
            </section>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Styles ───────────────────────────────────────────
var page = {
  minHeight: '100vh',
  background: 'radial-gradient(circle at top left,rgba(37,99,235,0.14),transparent 32%),radial-gradient(circle at top right,rgba(124,58,237,0.12),transparent 26%),linear-gradient(180deg,#0f172a 0%,#111827 100%)',
  color: '#e5e7eb'
}
var shell        = { maxWidth: 1240, margin: '0 auto', padding: '28px 20px 48px' }
var header       = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginBottom: 20 }
var brand        = { fontSize: 28, fontWeight: 900, letterSpacing: '-0.03em' }
var sub          = { color: '#94a3b8', marginTop: 4, fontSize: 14 }
var row          = { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }
var linkBtn      = { padding: '9px 14px', borderRadius: 12, border: '1px solid rgba(148,163,184,0.18)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', textDecoration: 'none', fontWeight: 700, fontSize: 14 }
var buttonBlue   = { padding: '9px 14px', borderRadius: 12, border: 'none', background: 'linear-gradient(90deg,#2563eb,#7c3aed)', color: '#fff', fontWeight: 800, cursor: 'pointer', textDecoration: 'none', fontSize: 14 }
var buttonDanger = { padding: '9px 14px', borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14 }
var heroCard     = { padding: 24, borderRadius: 24, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.14)' }
var title        = { margin: 0, fontSize: 'clamp(28px,5vw,46px)', lineHeight: 1.1, fontWeight: 900 }
var textStyle    = { marginTop: 14, color: '#cbd5e1', fontSize: 16, lineHeight: 1.7 }
var grid         = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, marginTop: 16 }
var cardDark     = { padding: 18, borderRadius: 18, background: 'rgba(15,23,42,0.88)', border: '1px solid rgba(148,163,184,0.12)', position: 'relative' }
var smallLabel   = { color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }
var bigValue     = { fontSize: 40, fontWeight: 900, marginTop: 10, lineHeight: 1 }
var muted        = { color: '#cbd5e1', marginTop: 6, lineHeight: 1.6, fontSize: 14 }
var cardLight    = { padding: 18, borderRadius: 22, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.14)' }
var sectionHead  = { display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }
var sectionTitle = { fontWeight: 900, fontSize: 18 }
var sectionSub   = { color: '#94a3b8', marginTop: 4, fontSize: 13 }
var emptyBox     = { padding: 18, borderRadius: 14, background: 'rgba(15,23,42,0.8)', border: '1px solid rgba(148,163,184,0.1)', color: '#cbd5e1', fontSize: 14 }
var sessionList  = { display: 'grid', gap: 10 }
var sessionCard  = { padding: 14, borderRadius: 14, background: 'rgba(15,23,42,0.82)', border: '1px solid rgba(148,163,184,0.1)' }
var sessionTop   = { display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }
var sessionMeta  = { color: '#cbd5e1', marginTop: 5, lineHeight: 1.5, fontSize: 13 }
var statusPill   = { padding: '3px 9px', borderRadius: 999, border: '1px solid rgba(148,163,184,0.1)', fontSize: 12, fontWeight: 600 }
var promoGrid    = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10, marginTop: 14 }
var promoCard    = { display: 'block', padding: 16, borderRadius: 18, textDecoration: 'none', color: '#e2e8f0', background: 'rgba(15,23,42,0.82)', border: '1px solid rgba(148,163,184,0.1)' }
var promoTitle   = { fontWeight: 900, fontSize: 15 }
var promoText    = { marginTop: 6, color: '#94a3b8', lineHeight: 1.6, fontSize: 13 }
