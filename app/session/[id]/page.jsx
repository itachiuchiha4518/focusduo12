'use client'

import { useEffect, useRef, useState } from 'react'
import { doc, onSnapshot, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../../../lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import WebRTCRoom from '../../../components/WebRTCRoom'
import Link from 'next/link'
import { getEffectivePlanId, incrementStreak, toMillis } from '../../../lib/subscriptions'

// ─── Constants ────────────────────────────────────────
const FREE_SESSION_SECONDS = 30 * 60   // 30 minutes
const NUDGE_AT_SECONDS     = 5 * 60    // show nudge when 5 min left
const GRACE_SECONDS        = 2 * 60    // first 2 min = free leave, no credit used

// ─── Helpers ─────────────────────────────────────────
function formatTime(secs) {
  const m = Math.floor(Math.max(0, secs) / 60)
  const s = Math.max(0, secs) % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

function timerColor(secs) {
  if (secs <= 60)           return '#ef4444'   // red — last minute
  if (secs <= NUDGE_AT_SECONDS) return '#f59e0b'  // amber — nudge zone
  return '#4ade80'                              // green — plenty of time
}

// ─── Session End Card ─────────────────────────────────
function SessionEndCard({ session, streakDays }) {
  return (
    <div style={{
      minHeight: '80vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        maxWidth: 440, width: '100%', padding: 32, borderRadius: 24, textAlign: 'center',
        background: 'linear-gradient(135deg, #0f172a, #1e1b4b)',
        border: '1px solid rgba(148,163,184,0.2)', color: '#e2e8f0'
      }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>🎉</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 26, fontWeight: 900 }}>Session complete!</h2>
        <p style={{ color: '#94a3b8', marginBottom: 20, lineHeight: 1.6 }}>
          {session.exam} • {session.subject} — great work staying focused.
        </p>

        {streakDays > 0 && (
          <div style={{
            padding: '12px 16px', borderRadius: 14, marginBottom: 20,
            background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)'
          }}>
            <span style={{ fontSize: 22 }}>{'🔥'.repeat(Math.min(streakDays, 5))}</span>
            <div style={{ fontWeight: 800, marginTop: 6 }}>
              {streakDays} day streak — keep it going!
            </div>
          </div>
        )}

        {/* Upgrade CTA on session end — perfect moment, they just felt the value */}
        <div style={{
          padding: 18, borderRadius: 16, marginBottom: 20,
          background: 'rgba(37,99,235,0.14)', border: '1px solid rgba(96,165,250,0.3)'
        }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>⭐ Want unlimited sessions?</div>
          <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 14, lineHeight: 1.6 }}>
            No time limits. Priority matching. Full session history. Starting at just ₹99/month — less than a cup of chai.
          </div>
          <Link href="/plans" style={{
            display: 'inline-block', padding: '11px 22px', borderRadius: 12,
            background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
            color: '#fff', fontWeight: 800, textDecoration: 'none', fontSize: 15
          }}>
            Upgrade now — ₹99 →
          </Link>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/join" style={{
            padding: '11px 20px', borderRadius: 12,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(148,163,184,0.2)',
            color: '#e2e8f0', fontWeight: 700, textDecoration: 'none'
          }}>
            Study again
          </Link>
          <Link href="/dashboard" style={{
            padding: '11px 20px', borderRadius: 12,
            background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(148,163,184,0.2)',
            color: '#e2e8f0', fontWeight: 700, textDecoration: 'none'
          }}>
            Dashboard
          </Link>
        </div>
      </div>
    </div>
  )
}

// ─── Main Session Page ────────────────────────────────
export default function SessionPage({ params }) {
  const sessionId = params.id

  const [session, setSession]       = useState(null)
  const [loading, setLoading]       = useState(true)
  const [currentUser, setCurrentUser] = useState(null)
  const [isPaid, setIsPaid]         = useState(false)
  const [streakDays, setStreakDays]  = useState(0)

  // Timer state
  const [secondsLeft, setSecondsLeft] = useState(FREE_SESSION_SECONDS)
  const [timerStarted, setTimerStarted] = useState(false)
  const [sessionEnded, setSessionEnded] = useState(false)
  const [showNudge, setShowNudge]     = useState(false)
  const [nudgeDismissed, setNudgeDismissed] = useState(false)

  const timerRef       = useRef(null)
  const streakDoneRef  = useRef(false)

  // ── Auth listener ──────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async user => {
      setCurrentUser(user || null)
      if (user) {
        try {
          const { getDoc, doc: firestoreDoc } = await import('firebase/firestore')
          const snap = await getDoc(firestoreDoc(db, 'users', user.uid))
          if (snap.exists()) {
            const profile = snap.data()
            setIsPaid(getEffectivePlanId(profile) !== 'free')
            setStreakDays(profile.streakDays ?? profile.streak ?? 0)
          }
        } catch {}
      }
    })
    return () => unsub()
  }, [])

  // ── Session listener ───────────────────────────────
  useEffect(() => {
    const ref = doc(db, 'sessions', sessionId)
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) {
        setSession(null)
        setLoading(false)
        return
      }
      const data = { id: snap.id, ...snap.data() }
      setSession(data)
      setLoading(false)

      // If session is marked finished by WebRTC room, show end card
      if (data.status === 'finished') {
        clearInterval(timerRef.current)
        setSessionEnded(true)
        handleSessionComplete(data)
      }
    })
    return () => unsub()
  }, [sessionId])

  // ── Start timer once session + user loaded ─────────
  useEffect(() => {
    if (!session || !currentUser || timerStarted) return
    if (session.status === 'finished') return

    // Calculate elapsed time from session creation
    const startMs = toMillis(session.createdAt)
    if (startMs) {
      const elapsedSecs = Math.floor((Date.now() - startMs) / 1000)
      const remaining = Math.max(0, FREE_SESSION_SECONDS - elapsedSecs)
      setSecondsLeft(remaining)
      if (remaining === 0) { setSessionEnded(true); return }
    }

    setTimerStarted(true)

    timerRef.current = setInterval(() => {
      setSecondsLeft(prev => {
        const next = prev - 1

        // Show nudge at 5 min left (only once, not dismissed)
        if (next === NUDGE_AT_SECONDS) setShowNudge(true)

        // Timer expired for free users
        if (next <= 0) {
          clearInterval(timerRef.current)
          if (!isPaid) {
            setSessionEnded(true)
            endSession()
          }
          return 0
        }

        return next
      })
    }, 1000)

    return () => clearInterval(timerRef.current)
  }, [session, currentUser, timerStarted, isPaid])

  async function endSession() {
    try {
      await updateDoc(doc(db, 'sessions', sessionId), {
        status: 'finished',
        endedAt: serverTimestamp(),
        endReason: 'timer-expired'
      })
    } catch {}
    handleSessionComplete(session)
  }

  async function handleSessionComplete(s) {
    if (streakDoneRef.current || !currentUser) return
    streakDoneRef.current = true

    // Only count streak if session ran longer than grace period
    const startMs = toMillis(s?.createdAt)
    if (startMs && (Date.now() - startMs) < GRACE_SECONDS * 1000) return

    try {
      const newStreak = await incrementStreak(currentUser.uid)
      setStreakDays(newStreak)
    } catch (e) {
      console.warn('streak update failed', e)
    }
  }

  // ── In-session warning check ───────────────────────
  const inGracePeriod = timerStarted && (FREE_SESSION_SECONDS - secondsLeft) < GRACE_SECONDS

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui,sans-serif', color: '#64748b' }}>
      Loading session…
    </div>
  )

  if (!session) return (
    <div style={{ padding: 40, textAlign: 'center', fontFamily: 'system-ui,sans-serif' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
      <div style={{ color: '#64748b', marginBottom: 20 }}>Session not found or already ended.</div>
      <Link href="/join" style={{ padding: '10px 20px', background: '#2563eb', color: '#fff', borderRadius: 10, textDecoration: 'none', fontWeight: 700 }}>
        Start a new session
      </Link>
    </div>
  )

  // Show end card when session is done
  if (sessionEnded) return <SessionEndCard session={session} streakDays={streakDays} />

  const names = (session.participants || []).map(p => p.name).join(' • ')

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: 16, fontFamily: 'system-ui,sans-serif' }}>

      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 10, marginBottom: 14
      }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 18 }}>
            {session.exam} • {session.subject}
          </div>
          <div style={{ color: '#64748b', fontSize: 13, marginTop: 2 }}>{names}</div>
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>

          {/* ⏱️ TIMER — only shown to free users */}
          {!isPaid && timerStarted && (
            <div style={{
              padding: '8px 14px', borderRadius: 12, fontWeight: 900, fontSize: 18,
              background: secondsLeft <= NUDGE_AT_SECONDS ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.1)',
              border: `2px solid ${timerColor(secondsLeft)}`,
              color: timerColor(secondsLeft),
              minWidth: 80, textAlign: 'center', letterSpacing: 1
            }}>
              ⏱️ {formatTime(secondsLeft)}
            </div>
          )}

          {/* Paid users see unlimited badge */}
          {isPaid && (
            <div style={{
              padding: '8px 14px', borderRadius: 12, fontWeight: 700, fontSize: 13,
              background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24'
            }}>
              ⭐ Unlimited
            </div>
          )}

          {inGracePeriod && (
            <div style={{
              padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 700,
              background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80'
            }}>
              Leave now — credit not used
            </div>
          )}

          <Link href="/">
            <button style={{
              padding: '8px 14px', borderRadius: 10, border: '1px solid #e5e7eb',
              background: '#fff', cursor: 'pointer', fontWeight: 600, fontSize: 13
            }}>
              Home
            </button>
          </Link>
        </div>
      </div>

      {/* ── UPGRADE NUDGE BANNER — appears at 5 min left ── */}
      {showNudge && !nudgeDismissed && !isPaid && (
        <div style={{
          marginBottom: 14, padding: '14px 18px', borderRadius: 14,
          background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(124,58,237,0.12))',
          border: '1px solid rgba(239,68,68,0.4)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap'
        }}>
          <div>
            <div style={{ fontWeight: 900, fontSize: 15, color: '#fca5a5' }}>
              ⏰ 5 minutes left — your session is ending soon!
            </div>
            <div style={{ color: '#cbd5e1', fontSize: 13, marginTop: 4 }}>
              Upgrade for ₹99/month and never get cut off again.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Link href="/plans" style={{
              padding: '8px 16px', borderRadius: 10,
              background: 'linear-gradient(90deg,#ef4444,#dc2626)',
              color: '#fff', fontWeight: 800, textDecoration: 'none', fontSize: 13, whiteSpace: 'nowrap'
            }}>
              Upgrade ₹99 →
            </Link>
            <button onClick={() => setNudgeDismissed(true)} style={{
              padding: '8px 12px', borderRadius: 10, border: '1px solid rgba(148,163,184,0.3)',
              background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 13
            }}>
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── LAST MINUTE ALERT — more urgent ── */}
      {!isPaid && timerStarted && secondsLeft <= 60 && secondsLeft > 0 && (
        <div style={{
          marginBottom: 14, padding: '14px 18px', borderRadius: 14,
          background: 'rgba(239,68,68,0.2)', border: '2px solid #ef4444',
          textAlign: 'center', fontWeight: 900, color: '#fca5a5', fontSize: 16
        }}>
          🔴 Less than 1 minute left! Session ending...{' '}
          <Link href="/plans" style={{ color: '#fff', textDecoration: 'underline' }}>Upgrade now</Link>
        </div>
      )}

      {/* ── Session status ── */}
      <div style={{
        marginBottom: 14, padding: '10px 14px', borderRadius: 12,
        background: '#f8fafc', border: '1px solid #e5e7eb', fontSize: 13,
        display: 'flex', gap: 16, flexWrap: 'wrap'
      }}>
        <span>Mode: <strong>{session.mode === 'one-on-one' ? '1-on-1' : 'Group'}</strong></span>
        <span>Status: <strong style={{ color: session.status === 'active' ? '#16a34a' : '#64748b' }}>{session.status}</strong></span>
        {inGracePeriod && <span style={{ color: '#16a34a', fontWeight: 700 }}>⏳ Grace period — free to leave</span>}
      </div>

      {/* ── WebRTC Video Room ── */}
      <div style={{ marginTop: 8 }}>
        <WebRTCRoom sessionId={sessionId} session={session} />
      </div>
    </div>
  )
}
  
