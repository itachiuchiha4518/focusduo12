'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { auth, db, googleProvider } from '../../lib/firebase'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore'
import { getEffectivePlanId, applyReferralCode } from '../../lib/subscriptions'

var BG     = '#F7F6F2'
var WHITE  = '#FFFFFF'
var BORDER = '#E4E2DC'
var TEXT   = '#1A1A18'
var TEXT2  = '#6B6860'
var TEXT3  = '#A8A59F'
var DARK   = '#1A1A18'

var ADMIN_UID = 'NIsbHB9RmXgR5vJEyv8CuV0ggD03'

function isPro(profile) {
  var id = getEffectivePlanId(profile)
  return id !== 'free' && id !== 'banned'
}

function fmtHours(secs) {
  if (!secs) return '0m'
  var h = Math.floor(secs / 3600)
  var m = Math.floor((secs % 3600) / 60)
  if (h === 0) return m + 'm'
  return h + 'h ' + m + 'm'
}

function CreditsBar({ remaining, total, label }) {
  var pct = Math.max(0, Math.min(100, (remaining / total) * 100))
  var col = pct > 50 ? '#166534' : pct > 20 ? '#92400E' : '#991B1B'
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: TEXT2 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color: col }}>{remaining} / {total}</span>
      </div>
      <div style={{ height: 5, borderRadius: 999, background: '#E4E2DC' }}>
        <div style={{ height: '100%', width: pct + '%', borderRadius: 999, background: DARK, transition: 'width 0.4s ease' }} />
      </div>
    </div>
  )
}

function ReferralSection({ uid, profile }) {
  var [inputCode, setInputCode] = useState('')
  var [msg, setMsg]             = useState('')
  var [busy, setBusy]           = useState(false)
  var myCode      = profile && profile.referralCode ? profile.referralCode : ''
  var alreadyUsed = profile && !!profile.referredBy
  var referred    = profile && profile.referredCount ? profile.referredCount : 0

  function copyCode() {
    navigator.clipboard.writeText(myCode)
      .then(function() { setMsg('Copied!'); setTimeout(function() { setMsg('') }, 2000) })
      .catch(function() { setMsg('Copy manually: ' + myCode) })
  }

  async function handleApply() {
    if (!inputCode.trim() || !uid) return
    setBusy(true); setMsg('')
    try {
      var result = await applyReferralCode(uid, inputCode.trim())
      if (result.success) setMsg('Done. Both of you got +1 session in each mode.')
      else if (result.reason === 'already-applied') setMsg('You already used a referral code.')
      else if (result.reason === 'self-referral') setMsg('You cannot use your own code.')
      else if (result.reason === 'invalid-code') setMsg('Invalid code.')
      else setMsg('Something went wrong.')
    } catch(e) { setMsg('Error. Try again.') }
    finally { setBusy(false) }
  }

  return (
    <div style={{ background: WHITE, border: '1px solid ' + BORDER, borderRadius: 10, padding: 22 }}>
      <p style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Referral</p>

      {myCode ? (
        <div style={{ marginBottom: 16 }}>
          <p style={{ fontSize: 13, color: TEXT2, marginBottom: 8 }}>Your code</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: TEXT, letterSpacing: 3, padding: '8px 14px', background: BG, border: '1px solid ' + BORDER, borderRadius: 8 }}>
              {myCode}
            </span>
            <button onClick={copyCode} style={{ padding: '8px 14px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid ' + BORDER, background: WHITE, color: TEXT2, cursor: 'pointer' }}>
              Copy
            </button>
          </div>
          <p style={{ fontSize: 12, color: TEXT3, marginTop: 8, lineHeight: 1.6 }}>
            {referred} friend{referred !== 1 ? 's' : ''} referred. Both get +1 session in each mode when they sign up.
          </p>
        </div>
      ) : null}

      {alreadyUsed ? (
        <p style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>You already applied a referral code.</p>
      ) : (
        <div>
          <p style={{ fontSize: 13, color: TEXT2, marginBottom: 8 }}>Apply a friend's code</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              value={inputCode}
              onChange={function(e) { setInputCode(e.target.value.toUpperCase()) }}
              onKeyDown={function(e) { if (e.key === 'Enter') handleApply() }}
              placeholder="e.g. ABC12345"
              maxLength={10}
              style={{ flex: 1, minWidth: 140, padding: '9px 12px', borderRadius: 8, border: '1px solid ' + BORDER, background: BG, color: TEXT, fontSize: 14, outline: 'none', fontFamily: 'monospace' }}
            />
            <button onClick={handleApply} disabled={busy || !inputCode.trim()} style={{ padding: '9px 16px', borderRadius: 8, fontWeight: 600, fontSize: 13, border: 'none', background: inputCode.trim() ? DARK : BORDER, color: inputCode.trim() ? WHITE : TEXT3, cursor: inputCode.trim() ? 'pointer' : 'not-allowed' }}>
              {busy ? '...' : 'Apply'}
            </button>
          </div>
        </div>
      )}

      {msg ? <p style={{ marginTop: 10, fontSize: 13, color: TEXT2 }}>{msg}</p> : null}
    </div>
  )
}

var css = '\n' +
  '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; min-width: 0; }\n' +
  'html { overflow-x: clip; }\n' +
  'body { background: ' + BG + '; color: ' + TEXT + '; font-family: "DM Sans",system-ui,sans-serif; -webkit-font-smoothing: antialiased; overflow-x: clip; }\n' +
  'a { color: inherit; text-decoration: none; }\n' +
  'button { font-family: inherit; }\n' +
  '.wrap { width: 100%; max-width: 1060px; margin: 0 auto; padding: 0 20px; }\n' +
  '.stat-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; }\n' +
  '.stat-card { background: ' + WHITE + '; border: 1px solid ' + BORDER + '; border-radius: 10px; padding: 20px; }\n' +
  '.session-list { display: grid; gap: 2px; }\n' +
  '.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 9px 16px; border-radius: 8px; font-size: 13px; font-weight: 600; cursor: pointer; border: 1px solid ' + BORDER + '; background: ' + WHITE + '; color: ' + TEXT2 + '; text-decoration: none; transition: all 0.15s; white-space: nowrap; font-family: inherit; }\n' +
  '.btn:hover { border-color: #C8C5BC; color: ' + TEXT + '; }\n' +
  '.btn-dark { background: ' + DARK + '; color: #fff; border-color: ' + DARK + '; }\n' +
  '.btn-dark:hover { background: #2D2D2B; border-color: #2D2D2B; color: #fff; }\n' +
  '.btn-red { background: #991B1B; color: #fff; border-color: #991B1B; }\n' +
  '.btn-red:hover { background: #7F1D1D; }\n' +
  '@media (min-width: 640px) {\n' +
  '  .wrap { padding: 0 28px; }\n' +
  '  .stat-grid { grid-template-columns: repeat(4, 1fr); }\n' +
  '}\n'

export default function DashboardPage() {
  var router = useRouter()
  var [user, setUser]         = useState(null)
  var [profile, setProfile]   = useState(null)
  var [sessions, setSessions] = useState([])
  var [loading, setLoading]   = useState(true)

  useEffect(function() {
    var unsub = onAuthStateChanged(auth, async function(u) {
      setUser(u || null)
      if (!u) { setProfile(null); setSessions([]); setLoading(false); return }
      try {
        setLoading(true)
        var pSnap = await getDoc(doc(db, 'users', u.uid))
        setProfile(pSnap.exists() ? pSnap.data() : null)
        var q = query(collection(db, 'sessions'), where('participantUids', 'array-contains', u.uid))
        var sSnap = await getDocs(q)
        var items = sSnap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()) })
          .sort(function(a, b) {
            var at = a.createdAt && a.createdAt.toMillis ? a.createdAt.toMillis() : 0
            var bt = b.createdAt && b.createdAt.toMillis ? b.createdAt.toMillis() : 0
            return bt - at
          })
        setSessions(items)
      } catch(e) { console.error(e) }
      finally { setLoading(false) }
    })
    return function() { unsub() }
  }, [])

  async function login() {
    try { await signInWithPopup(auth, googleProvider) }
    catch(e) { alert('Sign in failed.') }
  }

  async function logout() {
    try { await signOut(auth); router.push('/') }
    catch(e) {}
  }

  var proUser      = isPro(profile)
  var streakDays   = profile ? (profile.streakDays || 0) : 0
  var oneOnOneLeft = profile ? (profile.freeOneOnOneRemaining !== undefined ? profile.freeOneOnOneRemaining : 10) : 10
  var groupLeft    = profile ? (profile.freeGroupRemaining !== undefined ? profile.freeGroupRemaining : 10) : 10
  var planLabel    = profile ? (profile.planLabel || 'Free') : 'Free'
  var totalSecs    = profile ? (profile.totalStudySeconds || 0) : 0
  var shieldsLeft  = profile ? (profile.streakShieldsRemaining || 0) : 0
  var totalDone    = profile ? (profile.sessionsCompleted || sessions.filter(function(s) { return s.status === 'finished' }).length) : 0
  var lowCredits   = !proUser && (oneOnOneLeft <= 3 || groupLeft <= 3)
  var visibleSessions = proUser ? sessions.slice(0, 20) : sessions.slice(0, 5)
  var lockedCount     = !proUser && sessions.length > 5 ? sessions.length - 5 : 0
  var isAdmin         = user && user.uid === ADMIN_UID

  function streakMsg() {
    if (streakDays === 0) return 'Start your streak today.'
    if (streakDays < 3)  return streakDays + ' day' + (streakDays > 1 ? 's' : '') + ' — keep going.'
    if (streakDays < 7)  return streakDays + ' days — building momentum.'
    if (streakDays < 14) return streakDays + ' days — great consistency.'
    return streakDays + ' days — exceptional.'
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div style={{ minHeight: '100vh', background: BG }}>
        <div className="wrap" style={{ paddingTop: 40, paddingBottom: 60 }}>

          {/* Header */}
          <div style={{ marginBottom: 28 }}>
            <Link href="/" style={{ fontSize: 13, color: TEXT3, fontFamily: 'Lora,Georgia,serif', fontWeight: 600, display: 'inline-block', marginBottom: 20 }}>FocusDuo</Link>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h1 style={{ fontFamily: 'Lora,Georgia,serif', fontSize: 'clamp(22px,4vw,32px)', fontWeight: 600, color: TEXT, letterSpacing: '-0.02em', marginBottom: 4 }}>
                  Dashboard
                </h1>
                {user ? <p style={{ fontSize: 14, color: TEXT2 }}>{user.displayName || user.email || 'Your account'}</p> : null}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <Link href="/join" className="btn btn-dark">Start studying</Link>
                <Link href="/plans" className="btn">Plans</Link>
                <Link href="/leaderboard" className="btn">Leaderboard</Link>
                {isAdmin ? (
                  <Link href="/admin" style={{ padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, border: '1px solid ' + BORDER, background: WHITE, color: '#92400E', cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    Admin
                  </Link>
                ) : null}
                {user
                  ? <button onClick={logout} className="btn btn-red">Sign out</button>
                  : <button onClick={login} className="btn btn-dark">Sign in</button>
                }
              </div>
            </div>
          </div>

          {!user ? (
            <div style={{ background: WHITE, border: '1px solid ' + BORDER, borderRadius: 10, padding: 28, marginBottom: 20 }}>
              <h2 style={{ fontFamily: 'Lora,Georgia,serif', fontSize: 22, fontWeight: 600, color: TEXT, marginBottom: 10 }}>Sign in to see your progress.</h2>
              <p style={{ fontSize: 15, color: TEXT2, lineHeight: 1.65, marginBottom: 20 }}>Sessions, streak, credits, and plan — all here.</p>
              <button onClick={login} className="btn btn-dark">Sign in with Google</button>
            </div>
          ) : (
            <div>
              {/* Low credits warning */}
              {lowCredits ? (
                <div style={{ marginBottom: 16, padding: '14px 18px', borderRadius: 9, border: '1px solid #FCA5A5', background: '#FEF2F2' }}>
                  <p style={{ fontWeight: 600, fontSize: 14, color: '#991B1B', marginBottom: 4 }}>Almost out of free sessions.</p>
                  <p style={{ fontSize: 13, color: '#991B1B', lineHeight: 1.6 }}>
                    {oneOnOneLeft <= 3 ? oneOnOneLeft + ' 1-on-1 left. ' : ''}
                    {groupLeft <= 3 ? groupLeft + ' group left. ' : ''}
                    <Link href="/plans" style={{ fontWeight: 700, textDecoration: 'underline', color: '#991B1B' }}>Upgrade from Rs 99/month</Link>
                  </p>
                </div>
              ) : null}

              {/* Stats grid */}
              <div className="stat-grid" style={{ marginBottom: 2 }}>

                {/* Plan */}
                <div className="stat-card">
                  <p style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Plan</p>
                  <p style={{ fontFamily: 'Lora,Georgia,serif', fontSize: 'clamp(16px,2.5vw,22px)', fontWeight: 600, color: TEXT, marginBottom: 6 }}>{planLabel}</p>
                  {proUser ? <p style={{ fontSize: 12, color: TEXT2 }}>Pro active</p> : (
                    <Link href="/plans" style={{ fontSize: 13, fontWeight: 600, color: TEXT, textDecoration: 'underline' }}>Upgrade</Link>
                  )}
                </div>

                {/* Streak */}
                <div className="stat-card">
                  <p style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Streak</p>
                  <p style={{ fontFamily: 'Lora,Georgia,serif', fontSize: 'clamp(28px,5vw,44px)', fontWeight: 600, color: TEXT, lineHeight: 1, marginBottom: 8 }}>{streakDays}</p>
                  <p style={{ fontSize: 12, color: TEXT2, lineHeight: 1.5 }}>{streakMsg()}</p>
                  {proUser && shieldsLeft > 0 ? (
                    <p style={{ fontSize: 12, color: TEXT3, marginTop: 6 }}>{shieldsLeft} shield{shieldsLeft !== 1 ? 's' : ''} remaining</p>
                  ) : null}
                </div>

                {/* Sessions */}
                <div className="stat-card">
                  <p style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Sessions</p>
                  <p style={{ fontFamily: 'Lora,Georgia,serif', fontSize: 'clamp(28px,5vw,44px)', fontWeight: 600, color: TEXT, lineHeight: 1, marginBottom: 8 }}>{totalDone}</p>
                  <p style={{ fontSize: 12, color: TEXT2 }}>Completed</p>
                </div>

                {/* Hours — Pro only */}
                <div className="stat-card" style={{ position: 'relative' }}>
                  <p style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 12 }}>Hours studied</p>
                  {proUser ? (
                    <>
                      <p style={{ fontFamily: 'Lora,Georgia,serif', fontSize: 'clamp(22px,4vw,36px)', fontWeight: 600, color: TEXT, lineHeight: 1, marginBottom: 8 }}>{fmtHours(totalSecs)}</p>
                      <p style={{ fontSize: 12, color: TEXT2 }}>All time</p>
                    </>
                  ) : (
                    <div style={{ filter: 'blur(3px)', pointerEvents: 'none', userSelect: 'none' }}>
                      <p style={{ fontFamily: 'Lora,Georgia,serif', fontSize: 36, fontWeight: 600, color: TEXT, lineHeight: 1, marginBottom: 8 }}>—</p>
                    </div>
                  )}
                  {!proUser ? (
                    <div style={{ position: 'absolute', inset: 0, borderRadius: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                      <p style={{ fontSize: 12, color: TEXT3, fontWeight: 600 }}>Pro only</p>
                      <Link href="/plans" style={{ fontSize: 12, color: TEXT, fontWeight: 700, textDecoration: 'underline' }}>Upgrade</Link>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* Credits */}
              <div style={{ background: WHITE, border: '1px solid ' + BORDER, borderRadius: 10, padding: 22, marginTop: 2, marginBottom: 2 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 16 }}>Session credits</p>
                {proUser ? (
                  <p style={{ fontSize: 14, color: TEXT2 }}>Pro plan active — unlimited sessions.</p>
                ) : (
                  <>
                    <CreditsBar remaining={oneOnOneLeft} total={10} label="1-on-1 sessions" />
                    <CreditsBar remaining={groupLeft}    total={10} label="Group sessions" />
                    <p style={{ fontSize: 12, color: TEXT3, lineHeight: 1.6 }}>Credits are only deducted after the 2-minute grace period.</p>
                  </>
                )}
              </div>

              {/* Referral */}
              <div style={{ marginTop: 2, marginBottom: 2 }}>
                <ReferralSection uid={user.uid} profile={profile} />
              </div>

              {/* Session history */}
              <div style={{ background: WHITE, border: '1px solid ' + BORDER, borderRadius: 10, padding: 22, marginTop: 2 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, gap: 10, flexWrap: 'wrap' }}>
                  <div>
                    <p style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>Session history</p>
                    {!proUser ? <p style={{ fontSize: 12, color: TEXT3 }}>Showing last 5 — upgrade for full history</p> : null}
                  </div>
                  <Link href="/join" className="btn btn-dark" style={{ fontSize: 13 }}>New session</Link>
                </div>

                {loading ? (
                  <p style={{ fontSize: 14, color: TEXT3 }}>Loading...</p>
                ) : sessions.length === 0 ? (
                  <p style={{ fontSize: 14, color: TEXT2, lineHeight: 1.65 }}>No sessions yet. Start one to build your streak.</p>
                ) : (
                  <div className="session-list">
                    {visibleSessions.map(function(s) {
                      return (
                        <div key={s.id} style={{ padding: '14px 0', borderBottom: '1px solid ' + BORDER }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, flexWrap: 'wrap' }}>
                            <div>
                              <p style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 3 }}>{s.exam || ''} {s.subject || 'Session'}</p>
                              <p style={{ fontSize: 13, color: TEXT2 }}>{s.mode === 'one-on-one' ? '1-on-1' : 'Group'} · {s.participants ? s.participants.map(function(p) { return p.name }).join(', ') : '—'}</p>
                              {s.chapter ? <p style={{ fontSize: 12, color: TEXT3, marginTop: 3 }}>{s.chapter}</p> : null}
                            </div>
                            <span style={{ fontSize: 12, fontWeight: 600, color: s.status === 'finished' ? '#166534' : TEXT2, background: s.status === 'finished' ? '#F0FDF4' : BG, border: '1px solid ' + (s.status === 'finished' ? '#BBF7D0' : BORDER), padding: '3px 9px', borderRadius: 999, flexShrink: 0 }}>
                              {s.status === 'finished' ? 'Done' : s.status === 'active' ? 'Live' : s.status}
                            </span>
                          </div>
                        </div>
                      )
                    })}

                    {lockedCount > 0 ? (
                      <div style={{ padding: '18px 0', textAlign: 'center' }}>
                        <p style={{ fontSize: 14, color: TEXT2, marginBottom: 10 }}>{lockedCount} more session{lockedCount !== 1 ? 's' : ''} in your history.</p>
                        <Link href="/plans" className="btn btn-dark" style={{ fontSize: 13 }}>Unlock full history</Link>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
