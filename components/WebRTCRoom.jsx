use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import Chat from './Chat'
import EndCard from './EndCard'
import { consumeFreeCreditOnce, getFreeTimerState } from '../lib/sessionTiming'

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Constants
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const DEFAULT_PROFILE = {
  planId: 'free', planLabel: 'Free', planStatus: 'active',
  accountStatus: 'active', freeOneOnOneRemaining: 10,
  freeGroupRemaining: 10, sessionsCompleted: 0, streakDays: 0
}

// Multiple STUN servers = much better connectivity, especially on Indian mobile networks
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
]

const FREE_SESSION_SECS = 30 * 60
const GRACE_SECS        = 2 * 60
const NUDGE_AT_SECS     = 5 * 60

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function getEffectivePlanId(profile) {
  if (!profile) return 'free'
  if (profile.accountStatus === 'banned') return 'banned'
  if (profile.planStatus === 'active' && profile.planId) return profile.planId
  return 'free'
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

function formatTime(secs) {
  const s = Math.max(0, Math.floor(secs))
  const m = Math.floor(s / 60)
  const ss = s % 60
  return `${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`
}

function timerColor(secs) {
  if (secs <= 60)          return '#ef4444'
  if (secs <= NUDGE_AT_SECS) return '#f59e0b'
  return '#4ade80'
}

// Prefer VP9 for better quality at lower bandwidth (common on Indian mobile)
function preferVP9(sdp) {
  try {
    const lines = sdp.split('\r\n')
    const vp9Line = lines.find(l => l.includes('VP9'))
    if (!vp9Line) return sdp
    const pt = vp9Line.match(/a=rtpmap:(\d+) VP9/)?.[1]
    if (!pt) return sdp
    return lines.map(l => {
      if (l.startsWith('m=video')) {
        const parts = l.split(' ')
        const rest = parts.slice(3).filter(p => p !== pt)
        return [...parts.slice(0, 3), pt, ...rest].join(' ')
      }
      return l
    }).join('\r\n')
  } catch {
    return sdp
  }
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Chapter Selection Screen (grace period UI)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ChapterScreen({ session, secondsLeft, onLeave, onReady }) {
  const [chapter, setChapter] = useState('')

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 30, display: 'flex',
      alignItems: 'center', justifyContent: 'center',
      background: 'rgba(10,15,30,0.97)', borderRadius: 18, padding: 24
    }}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>ðŸ“–</div>
        <h2 style={{ margin: '0 0 6px', color: '#e2e8f0', fontWeight: 900 }}>Chapter selection</h2>
        <p style={{ color: '#94a3b8', marginBottom: 20, lineHeight: 1.6, fontSize: 14 }}>
          Tell your partner what you're studying today. You have{' '}
          <strong style={{ color: '#4ade80' }}>{formatTime(secondsLeft)}</strong> to decide.
          Leave now and your credit won't be used.
        </p>

        <div style={{
          padding: '10px 16px', borderRadius: 12, marginBottom: 16,
          background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)',
          color: '#4ade80', fontWeight: 700, fontSize: 13
        }}>
          âœ… You can leave now â€” free, no credit used
        </div>

        <div style={{ marginBottom: 16, textAlign: 'left' }}>
          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 6, fontWeight: 600 }}>
            Subject: <strong style={{ color: '#e2e8f0' }}>{session?.exam} â€¢ {session?.subject}</strong>
          </div>
          <input
            value={chapter}
            onChange={e => setChapter(e.target.value)}
            placeholder="e.g. Newton's Laws, Thermodynamics, Organic..."
            style={{
              width: '100%', padding: '11px 14px', borderRadius: 12,
              border: '1px solid rgba(148,163,184,0.25)',
              background: 'rgba(255,255,255,0.07)', color: '#f8fafc',
              fontSize: 15, outline: 'none', boxSizing: 'border-box'
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onLeave} style={{
            flex: 1, padding: '12px 0', borderRadius: 12, fontWeight: 700,
            border: '1px solid rgba(148,163,184,0.2)',
            background: 'rgba(255,255,255,0.05)', color: '#e2e8f0', cursor: 'pointer'
          }}>
            Leave (free)
          </button>
          <button onClick={() => onReady(chapter)} style={{
            flex: 2, padding: '12px 0', borderRadius: 12, fontWeight: 800,
            border: 'none',
            background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
            color: '#fff', cursor: 'pointer', fontSize: 15
          }}>
            Start studying â†’
          </button>
        </div>
      </div>
    </div>
  )
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Partner Rating (shows in EndCard flow)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function submitRating({ sessionId, raterUid, ratedUid, rating, comment }) {
  if (!sessionId || !raterUid || !ratedUid || !rating) return
  try {
    await addDoc(collection(db, 'ratings'), {
      sessionId, raterUid, ratedUid, rating,
      comment: comment || '',
      createdAt: serverTimestamp()
    })
    // Update rated user's average rating
    const userRef = doc(db, 'users', ratedUid)
    await runTransaction(db, async tx => {
      const snap = await tx.get(userRef)
      if (!snap.exists()) return
      const data = snap.data()
      const count = (data.ratingCount || 0) + 1
      const avg   = ((data.ratingAvg || 0) * (count - 1) + rating) / count
      tx.update(userRef, {
        ratingCount: count,
        ratingAvg: Math.round(avg * 10) / 10,
        updatedAt: serverTimestamp()
      })
    })
  } catch (e) {
    console.warn('rating failed', e)
  }
}

function RatingCard({ partner, sessionId, selfUid, onDone }) {
  const [rating, setRating] = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [done, setDone] = useState(false)

  async function submit() {
    if (!rating) { onDone(); return }
    await submitRating({ sessionId, raterUid: selfUid, ratedUid: partner?.uid, rating, comment })
    setDone(true)
    setTimeout(onDone, 1200)
  }

  if (done) return (
    <div style={{ textAlign: 'center', padding: 20, color: '#4ade80', fontWeight: 700 }}>
      âœ… Rating submitted! Thanks.
    </div>
  )

  return (
    <div style={{
      padding: 24, borderRadius: 20, textAlign: 'center',
      background: 'rgba(15,23,42,0.95)', border: '1px solid rgba(148,163,184,0.18)', color: '#e2e8f0'
    }}>
      <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 6 }}>
        Rate your study partner
      </div>
      <div style={{ color: '#94a3b8', marginBottom: 16, fontSize: 14 }}>
        How was your session with <strong>{partner?.name || 'your partner'}</strong>?
      </div>

      {/* Star rating */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
        {[1, 2, 3, 4, 5].map(star => (
          <button key={star}
            onClick={() => setRating(star)}
            onMouseEnter={() => setHovered(star)}
            onMouseLeave={() => setHovered(0)}
            style={{
              fontSize: 32, background: 'none', border: 'none', cursor: 'pointer',
              color: star <= (hovered || rating) ? '#fbbf24' : '#374151',
              transition: 'color 0.1s'
            }}>
            â˜…
          </button>
        ))}
      </div>

      {rating > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: '#94a3b8', fontSize: 13, marginBottom: 6 }}>
            {rating >= 4 ? 'ðŸ˜Š What did they do well?' : 'ðŸ¤” What could be better?'} (optional)
          </div>
          <input
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder="Quick note..."
            style={{
              width: '100%', padding: '10px 14px', borderRadius: 10,
              border: '1px solid rgba(148,163,184,0.2)',
              background: 'rgba(255,255,255,0.05)', color: '#f8fafc',
              fontSize: 14, outline: 'none', boxSizing: 'border-box'
            }}
          />
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
        <button onClick={onDone} style={{
          padding: '10px 18px', borderRadius: 10, fontWeight: 700, cursor: 'pointer',
          border: '1px solid rgba(148,163,184,0.2)', background: 'transparent', color: '#94a3b8'
        }}>
          Skip
        </button>
        <button onClick={submit} style={{
          padding: '10px 24px', borderRadius: 10, fontWeight: 800, cursor: 'pointer',
          border: 'none', background: 'linear-gradient(90deg,#2563eb,#7c3aed)', color: '#fff'
        }}>
          Submit rating
        </button>
      </div>
    </div>
  )
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Connection Status Dot
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ConnectionDot({ status }) {
  const connected = status === 'connected'
  const reconnecting = status?.includes('reconnecting')
  const color = connected ? '#4ade80' : reconnecting ? '#f59e0b' : '#ef4444'
  const label = connected ? 'Connected' : reconnecting ? 'Reconnecting...' : status

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#94a3b8' }}>
      <div style={{
        width: 8, height: 8, borderRadius: '50%', background: color,
        boxShadow: connected ? `0 0 6px ${color}` : 'none'
      }} />
      {label}
    </div>
  )
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Main WebRTCRoom Component
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function WebRTCRoom({ sessionId, session: sessionProp }) {
  const localVideoRef  = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef          = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)

  const offerUnsubRef      = useRef(null)
  const answerUnsubRef     = useRef(null)
  const candidatesUnsubRef = useRef(null)
  const seenCandidatesRef  = useRef(new Set())
  const timerRef           = useRef(null)
  const reconnectLockRef   = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const autoJoinAttemptRef = useRef(false)
  const currentUidRef      = useRef(null)
  const lastOfferSdpRef    = useRef('')
  const lastAnswerSdpRef   = useRef('')
  const cleanupLockRef     = useRef(false)
  const nudgeShownRef      = useRef(false)

  const [sessionDoc, setSessionDoc]   = useState(sessionProp || null)
  const [profile, setProfile]         = useState(null)
  const [status, setStatus]           = useState('idle')
  const [joined, setJoined]           = useState(false)
  const [micOn, setMicOn]             = useState(true)
  const [camOn, setCamOn]             = useState(true)
  const [cameraFacing, setCameraFacing] = useState('user')
  const [sessionEnded, setSessionEnded] = useState(false)
  const [showEndCard, setShowEndCard] = useState(false)
  const [showRating, setShowRating]   = useState(false)
  const [tick, setTick]               = useState(Date.now())
  const [creditConsumed, setCreditConsumed] = useState(false)
  const [joinBusy, setJoinBusy]       = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [controlsTimeout, setControlsTimeout] = useState(null)
  const [gracePassed, setGracePassed] = useState(false)
  const [chapterReady, setChapterReady] = useState(false)
  const [showNudge, setShowNudge]     = useState(false)
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const [remoteConnected, setRemoteConnected] = useState(false)

  const partner = useMemo(() => {
    const selfUid = currentUidRef.current
    const parts = sessionDoc?.participants || []
    return parts.find(p => p.uid !== selfUid) || null
  }, [sessionDoc, tick])

  const planId = getEffectivePlanId(profile)
  const isFree = planId === 'free'
  const timerState = isFree ? getFreeTimerState(sessionDoc) : null

  // Derived timer values
  const elapsed      = sessionDoc?.startedAt?.toMillis ? Math.floor((tick - sessionDoc.startedAt.toMillis()) / 1000) : 0
  const setupLeft    = isFree ? Math.max(0, GRACE_SECS - elapsed) : 0
  const sessionLeft  = isFree ? Math.max(0, FREE_SESSION_SECS - elapsed) : null
  const inGrace      = isFree && elapsed < GRACE_SECS
  const pct          = sessionLeft !== null ? Math.max(0, (sessionLeft / FREE_SESSION_SECS) * 100) : 100

  // Show nudge at 5 min
  useEffect(() => {
    if (isFree && sessionLeft !== null && sessionLeft <= NUDGE_AT_SECS && !nudgeShownRef.current && !nudgeDismissed) {
      nudgeShownRef.current = true
      setShowNudge(true)
    }
  }, [sessionLeft, isFree, nudgeDismissed])

  // â”€â”€ Auth â”€â”€
  useEffect(() => {
    reconnectAttemptsRef.current = 0
    reconnectLockRef.current = false
    autoJoinAttemptRef.current = false
    lastOfferSdpRef.current = ''
    lastAnswerSdpRef.current = ''
    cleanupLockRef.current = false
    setCreditConsumed(false)
    setShowEndCard(false)
    setSessionEnded(false)
    setJoined(false)
    setStatus('idle')

    const unsubAuth = auth.onAuthStateChanged(async u => {
      currentUidRef.current = u?.uid || null
      if (!u) { setProfile(null); return }
      try {
        const ref = doc(db, 'users', u.uid)
        const snap = await getDoc(ref)
        if (!snap.exists()) {
          const base = { ...DEFAULT_PROFILE, uid: u.uid, name: u.displayName || '', email: u.email || '', updatedAt: serverTimestamp() }
          await setDoc(ref, base, { merge: true })
          setProfile(base)
          return
        }
        setProfile({ ...DEFAULT_PROFILE, id: snap.id, ...snap.data() })
      } catch (e) { console.warn(e) }
    })

    const ref = doc(db, 'sessions', sessionId)
    const unsubSession = onSnapshot(ref, snap => {
      if (!snap.exists()) return
      const data = { id: snap.id, ...snap.data() }
      setSessionDoc(data)
      if (data.status === 'finished') {
        setSessionEnded(true)
        // Show rating first, then end card
        setShowRating(true)
        cleanup()
      }
    })

    timerRef.current = setInterval(() => setTick(Date.now()), 1000)

    return () => {
      unsubAuth()
      unsubSession()
      if (timerRef.current) clearInterval(timerRef.current)
      cleanup()
    }
  }, [sessionId])

  // â”€â”€ Billing â”€â”€
  useEffect(() => {
    if (!auth.currentUser?.uid) return
    const billingRef = doc(db, 'sessions', sessionId, 'billing', auth.currentUser.uid)
    const unsub = onSnapshot(billingRef, snap => {
      setCreditConsumed(Boolean(snap.exists() && snap.data()?.consumed))
    })
    return () => unsub()
  }, [sessionId])

  // â”€â”€ Auto join â”€â”€
  useEffect(() => {
    const uid = currentUidRef.current
    if (!uid || !sessionDoc || joined || sessionEnded || joinBusy) return
    if (sessionDoc.status !== 'active' && sessionDoc.status !== 'matching') return
    const participants = sessionDoc.participants || []
    const isParticipant = participants.some(p => p.uid === uid) || sessionDoc.initiatorUid === uid
    if (!isParticipant || autoJoinAttemptRef.current) return
    autoJoinAttemptRef.current = true
    const t = setTimeout(() => { joinMeeting().catch(() => { autoJoinAttemptRef.current = false }) }, 450)
    return () => clearTimeout(t)
  }, [sessionDoc, joined, sessionEnded, joinBusy])

  // â”€â”€ Credit deduction â”€â”€
  useEffect(() => {
    if (!sessionDoc || !isFree || creditConsumed) return
    if (!timerState?.gracePassed) return
    consumeFreeCreditOnce({ db, sessionId, uid: auth.currentUser?.uid, mode: sessionDoc.mode, userRef: doc(db, 'users', auth.currentUser.uid) })
      .then(result => { if (result?.consumed) setCreditConsumed(true) })
      .catch(err => console.warn('credit deduction failed', err))
  }, [sessionDoc, isFree, timerState?.gracePassed, creditConsumed, sessionId])

  // â”€â”€ Timer expiry â”€â”€
  useEffect(() => {
    if (!sessionDoc || !isFree) return
    if (!timerState?.finished) return
    if (sessionDoc.status === 'finished') return
    endSession(true)
  }, [sessionDoc, isFree, timerState?.finished])

  // â”€â”€ Grace period tracking â”€â”€
  useEffect(() => {
    if (!inGrace && !gracePassed) setGracePassed(true)
  }, [inGrace])

  // â”€â”€ Hide controls after 4s inactivity â”€â”€
  function flashControls() {
    setShowControls(true)
    if (controlsTimeout) clearTimeout(controlsTimeout)
    const t = setTimeout(() => setShowControls(false), 4000)
    setControlsTimeout(t)
  }

  async function cleanup() {
    if (cleanupLockRef.current) return
    cleanupLockRef.current = true
    try { offerUnsubRef.current?.() } catch {}
    try { answerUnsubRef.current?.() } catch {}
    try { candidatesUnsubRef.current?.() } catch {}
    offerUnsubRef.current = null
    answerUnsubRef.current = null
    candidatesUnsubRef.current = null
    seenCandidatesRef.current = new Set()
    try {
      if (pcRef.current) {
        pcRef.current.oniceconnectionstatechange = null
        pcRef.current.onconnectionstatechange = null
        pcRef.current.ontrack = null
        pcRef.current.onicecandidate = null
        pcRef.current.close()
        pcRef.current = null
      }
    } catch {}
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
      }
    } catch {}
    try {
      if (remoteStreamRef.current) {
        remoteStreamRef.current.getTracks().forEach(t => t.stop())
        remoteStreamRef.current = null
      }
    } catch {}
    setJoined(false)
    cleanupLockRef.current = false
          }
  
  async function ensureSessionStartedAt() {
    const ref = doc(db, 'sessions', sessionId)
    await runTransaction(db, async tx => {
      const snap = await tx.get(ref)
      if (!snap.exists()) throw new Error('session-missing')
      const data = snap.data() || {}
      const patch = {}
      if (!data.startedAt) patch.startedAt = serverTimestamp()
      if (data.status !== 'active') patch.status = 'active'
      if (Object.keys(patch).length > 0) tx.set(ref, patch, { merge: true })
    })
  }

  async function publishCandidate(candidate) {
    await addDoc(collection(db, 'sessions', sessionId, 'candidates'), {
      sender: currentUidRef.current || null,
      candidate: candidate.toJSON(),
      ts: Date.now()
    })
  }

  // â”€â”€ Improved media constraints â”€â”€
  async function createLocalStream(facingMode = 'user') {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl:  { ideal: true },
          channelCount: 1,
          sampleRate: 48000,
          sampleSize: 16
        },
        video: {
          facingMode: { ideal: facingMode },
          width:     { ideal: 1280, min: 640 },
          height:    { ideal: 720,  min: 360 },
          frameRate: { ideal: 30,   max: 30  }
        }
      })
    } catch {
      // Fallback for restricted devices
      return navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 640 }, height: { ideal: 360 }
        }
      })
    }
  }

  async function attachLocalPreview(stream) {
    if (!localVideoRef.current) return
    localVideoRef.current.srcObject = stream
    localVideoRef.current.muted = true
    localVideoRef.current.playsInline = true
    await localVideoRef.current.play().catch(() => {})
  }

  // â”€â”€ Higher bitrate sender â”€â”€
  async function boostSenderQuality(pc) {
    try {
      const videoSender = pc.getSenders().find(s => s.track?.kind === 'video')
      if (videoSender) {
        const params = videoSender.getParameters?.() || {}
        if (!params.encodings) params.encodings = [{}]
        params.encodings[0].maxBitrate         = 2500000   // 2.5 mbps (was 1.8)
        params.encodings[0].maxFramerate        = 30
        params.degradationPreference           = 'maintain-resolution'
        await videoSender.setParameters(params).catch(() => {})
      }
      const audioSender = pc.getSenders().find(s => s.track?.kind === 'audio')
      if (audioSender) {
        const params = audioSender.getParameters?.() || {}
        if (!params.encodings) params.encodings = [{}]
        params.encodings[0].maxBitrate = 64000
        await audioSender.setParameters(params).catch(() => {})
      }
    } catch (e) { console.warn('quality boost failed', e) }
  }

  async function replaceCameraTrack(newTrack) {
    const pc = pcRef.current
    if (!pc || !newTrack) return
    const sender = pc.getSenders().find(s => s.track?.kind === 'video')
    if (sender) await sender.replaceTrack(newTrack)
    const audioTracks = localStreamRef.current?.getAudioTracks?.() || []
    const videoTracks = localStreamRef.current?.getVideoTracks?.() || []
    videoTracks.forEach(t => t.stop())
    const newStream = new MediaStream([...audioTracks, newTrack])
    localStreamRef.current = newStream
    await attachLocalPreview(newStream)
    await boostSenderQuality(pc)
  }

  async function setupSignaling(pc, selfUid) {
    const initiatorUid = sessionDoc?.initiatorUid || sessionDoc?.participants?.[0]?.uid || selfUid
    const amInitiator  = initiatorUid === selfUid

    const offerRef  = doc(db, 'sessions', sessionId, 'signaling', 'offer')
    const answerRef = doc(db, 'sessions', sessionId, 'signaling', 'answer')
    const candCol   = collection(db, 'sessions', sessionId, 'candidates')

    candidatesUnsubRef.current = onSnapshot(candCol, snap => {
      snap.docChanges().forEach(async change => {
        if (change.type !== 'added') return
        if (seenCandidatesRef.current.has(change.doc.id)) return
        seenCandidatesRef.current.add(change.doc.id)
        const data = change.doc.data()
        if (!data || data.sender === selfUid) return
        try { await pc.addIceCandidate(new RTCIceCandidate(data.candidate)) } catch {}
      })
    })

    if (amInitiator) {
      answerUnsubRef.current = onSnapshot(answerRef, async snap => {
        if (!snap.exists()) return
        const data = snap.data()
        if (!data?.sdp || data.sdp === lastAnswerSdpRef.current) return
        try { await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp }); lastAnswerSdpRef.current = data.sdp } catch {}
      })
    } else {
      offerUnsubRef.current = onSnapshot(offerRef, async snap => {
        if (!snap.exists()) return
        const data = snap.data()
        if (!data?.sdp || data.sdp === lastOfferSdpRef.current) return
        try {
          await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
          lastOfferSdpRef.current = data.sdp
          const answer = await pc.createAnswer()
          // Apply VP9 preference for better quality
          answer.sdp = preferVP9(answer.sdp)
          await pc.setLocalDescription(answer)
          await setDoc(answerRef, { type: answer.type, sdp: answer.sdp, sender: selfUid, createdAt: serverTimestamp() }, { merge: true })
        } catch {}
      })
    }
  }

  async function restartConnection(reason = 'network') {
    const pc = pcRef.current
    if (!pc || reconnectLockRef.current) return
    if (!sessionDoc || sessionDoc.status === 'finished') return
    reconnectLockRef.current = true
    setStatus(`reconnecting (${reason})`)
    try {
      pc.restartIce?.()
      await sleep(250)
      const offer = await pc.createOffer({ iceRestart: true })
      offer.sdp = preferVP9(offer.sdp)
      await pc.setLocalDescription(offer)
      lastOfferSdpRef.current = offer.sdp || ''
      await setDoc(doc(db, 'sessions', sessionId, 'signaling', 'offer'), {
        type: offer.type, sdp: offer.sdp,
        sender: currentUidRef.current || null,
        iceRestart: true, updatedAt: serverTimestamp()
      }, { merge: true })
    } catch (e) { console.warn('restart failed', e) }
    finally { setTimeout(() => { reconnectLockRef.current = false }, 3000) }
  }

  async function joinMeeting() {
    if (!auth.currentUser) { alert('Sign in first'); return }
    if (joined) return
    if (sessionDoc?.status === 'finished') { setShowRating(true); return }

    setJoinBusy(true)
    try {
      setStatus('getting-media')
      await ensureSessionStartedAt()

      const stream = await createLocalStream(cameraFacing)
      localStreamRef.current = stream

      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) videoTrack.contentHint = 'detail'
      await attachLocalPreview(stream)

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc

      const remoteStream = new MediaStream()
      remoteStreamRef.current = remoteStream
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream

      pc.ontrack = event => {
        const [peerStream] = event.streams
        if (peerStream) {
          peerStream.getTracks().forEach(track => {
            if (!remoteStream.getTracks().some(t => t.id === track.id)) remoteStream.addTrack(track)
          })
        }
        setRemoteConnected(true)
        setTimeout(() => remoteVideoRef.current?.play().catch(() => {}), 50)
      }

      stream.getTracks().forEach(track => pc.addTrack(track, stream))
      await boostSenderQuality(pc)

      pc.onicecandidate = ev => { if (ev.candidate) publishCandidate(ev.candidate) }

      pc.oniceconnectionstatechange = () => {
        const state = pc.iceConnectionState
        if (state === 'connected' || state === 'completed') {
          reconnectLockRef.current = false
          reconnectAttemptsRef.current = 0
          setStatus('connected')
          return
        }
        if (state === 'disconnected' || state === 'failed') {
          setStatus(`reconnecting (${state})`)
          if (reconnectAttemptsRef.current < 4) {
            reconnectAttemptsRef.current += 1
            restartConnection(state).catch(() => {})
          } else {
            setStatus(state)
          }
        }
      }

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        if (state === 'connected') { reconnectLockRef.current = false; reconnectAttemptsRef.current = 0; setStatus('connected') }
        if (state === 'failed' || state === 'disconnected') setStatus(`reconnecting (${state})`)
      }

      await setupSignaling(pc, auth.currentUser.uid)

      const selfUid = auth.currentUser.uid
      const initiatorUid = sessionDoc?.initiatorUid || sessionDoc?.participants?.[0]?.uid || selfUid
      const amInitiator  = initiatorUid === selfUid

      if (amInitiator) {
        const offer = await pc.createOffer()
        // Prefer VP9 codec for better quality at lower bandwidth
        offer.sdp = preferVP9(offer.sdp)
        await pc.setLocalDescription(offer)
        lastOfferSdpRef.current = offer.sdp || ''
        await setDoc(doc(db, 'sessions', sessionId, 'signaling', 'offer'), {
          type: offer.type, sdp: offer.sdp, sender: selfUid, createdAt: serverTimestamp()
        }, { merge: true })
      }

      setJoined(true)
      setSessionEnded(false)
      setShowEndCard(false)
      setStatus('connected')
      autoJoinAttemptRef.current = true
    } catch (e) {
      console.error(e)
      autoJoinAttemptRef.current = false
      alert('Unable to start video. Please allow camera and microphone access.')
      setStatus('error')
    } finally {
      setJoinBusy(false)
    }
  }

  function toggleMic() {
    const tracks = localStreamRef.current?.getAudioTracks() || []
    tracks.forEach(t => (t.enabled = !t.enabled))
    setMicOn(v => !v)
  }

  function toggleCam() {
    const tracks = localStreamRef.current?.getVideoTracks() || []
    tracks.forEach(t => (t.enabled = !t.enabled))
    setCamOn(v => !v)
  }

  async function switchCamera() {
    const nextFacing = cameraFacing === 'user' ? 'environment' : 'user'
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      })
      const track = stream.getVideoTracks()[0]
      if (!track) return
      track.contentHint = 'detail'
      await replaceCameraTrack(track)
      setCameraFacing(nextFacing)
    } catch (e) {
      console.error(e)
      alert('Could not switch camera on this device.')
    }
  }

  async function endSession(fromTimer = false) {
    try {
      await updateDoc(doc(db, 'sessions', sessionId), {
        status: 'finished', endedAt: serverTimestamp(), endedByTimer: !!fromTimer
      })
    } catch (e) { console.warn(e) }
    setSessionEnded(true)
    setShowRating(true)
    await cleanup()
  }

  // â”€â”€ Show rating before end card â”€â”€
  if (showRating && !showEndCard) {
    return (
      <div style={{ padding: 14, maxWidth: 480, margin: '0 auto' }}>
        <RatingCard
          partner={partner}
          sessionId={sessionId}
          selfUid={currentUidRef.current}
          onDone={() => { setShowRating(false); setShowEndCard(true) }}
        />
      </div>
    )
  }

  if (showEndCard) {
    return (
      <div style={{ padding: 14 }}>
        <EndCard
          sessionId={sessionId}
          partnerUid={partner?.uid || null}
          partnerName={partner?.name || 'Partner'}
          sessionMeta={{ exam: sessionDoc?.exam, subject: sessionDoc?.subject, mode: sessionDoc?.mode }}
          onStartNew={() => { window.location.href = '/join' }}
        />
      </div>
    )
  }

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Main Video UI
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <div
      style={{ fontFamily: 'system-ui, sans-serif' }}
      onMouseMove={flashControls}
      onTouchStart={flashControls}
    >

      {/* â”€â”€ UPGRADE NUDGE BANNER â”€â”€ */}
      {showNudge && !nudgeDismissed && isFree && (
        <div style={{
          marginBottom: 10, padding: '12px 16px', borderRadius: 12,
          background: 'linear-gradient(135deg,rgba(239,68,68,0.15),rgba(124,58,237,0.12))',
          border: '1px solid rgba(239,68,68,0.4)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap'
        }}>
          <div>
            <div style={{ fontWeight: 900, color: '#fca5a5', fontSize: 14 }}>â° 5 minutes left!</div>
            <div style={{ color: '#cbd5e1', fontSize: 12, marginTop: 2 }}>Upgrade for â‚¹99 and never get cut off again.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <a href="/plans" style={{
              padding: '7px 14px', borderRadius: 9, fontWeight: 800, fontSize: 13,
              background: 'linear-gradient(90deg,#ef4444,#dc2626)',
              color: '#fff', textDecoration: 'none'
            }}>Upgrade â‚¹99 â†’</a>
            <button onClick={() => setNudgeDismissed(true)} style={{
              padding: '7px 10px', borderRadius: 9, border: '1px solid rgba(148,163,184,0.3)',
              background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 12
            }}>âœ•</button>
          </div>
        </div>
      )}

      {/* â”€â”€ Last minute alert â”€â”€ */}
      {isFree && sessionLeft !== null && sessionLeft <= 60 && sessionLeft > 0 && (
        <div style={{
          marginBottom: 10, padding: '12px 16px', borderRadius: 12,
          background: 'rgba(239,68,68,0.2)', border: '2px solid #ef4444',
          textAlign: 'center', fontWeight: 900, color: '#fca5a5'
        }}>
          ðŸ”´ Less than 1 minute left!{' '}
          <a href="/plans" style={{ color: '#fff', textDecoration: 'underline' }}>Upgrade now</a>
        </div>
      )}

      {/* â”€â”€ VIDEO AREA â”€â”€ */}
      <div style={{
        position: 'relative', borderRadius: 18, overflow: 'hidden',
        background: '#0a0f1e',
        aspectRatio: '16/9',
        maxHeight: isFullscreen ? '100vh' : 520
      }}>

        {/* Remote video â€” main, fills container */}
        <video
          ref={remoteVideoRef}
          autoPlay playsInline
          style={{
            width: '100%', height: '100%', objectFit: 'cover',
            background: '#0a0f1e', display: 'block'
          }}
        />

        {/* Partner name overlay */}
        {partner?.name && (
          <div style={{
            position: 'absolute', top: 12, left: 12,
            padding: '5px 12px', borderRadius: 999,
            background: 'rgba(0,0,0,0.6)', color: '#fff',
            fontSize: 13, fontWeight: 700, backdropFilter: 'blur(4px)'
          }}>
            {partner.name}
            {remoteConnected ? ' ðŸŸ¢' : ' â³'}
          </div>
        )}

        {/* Waiting for partner overlay */}
        {!remoteConnected && status !== 'idle' && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(10,15,30,0.85)'
          }}>
            <div style={{ fontSize: 36, marginBottom: 12 }}>â³</div>
            <div style={{ color: '#94a3b8', fontWeight: 700 }}>Waiting for partner to connect...</div>
            <div style={{ color: '#64748b', fontSize: 13, marginTop: 6 }}>This usually takes a few seconds</div>
          </div>
        )}

        {/* Connection issue overlay */}
        {status?.includes('reconnecting') && (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(10,15,30,0.7)'
          }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>ðŸ”„</div>
            <div style={{ color: '#f59e0b', fontWeight: 700 }}>Reconnecting...</div>
            <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>Weak network detected. Hang tight.</div>
          </div>
        )}

        {/* Local video â€” small corner pip */}
        <div style={{
          position: 'absolute', bottom: 70, right: 12,
          width: 100, height: 75, borderRadius: 12,
          overflow: 'hidden', border: '2px solid rgba(255,255,255,0.15)',
          background: '#000', zIndex: 10
        }}>
          <video
            ref={localVideoRef}
            autoPlay playsInline muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: cameraFacing === 'user' ? 'scaleX(-1)' : 'none' }}
          />
          {!camOn && (
            <div style={{
              position: 'absolute', inset: 0, display: 'flex', alignItems: 'center',
              justifyContent: 'center', background: '#111', color: '#94a3b8', fontSize: 22
            }}>
              ðŸ“·
            </div>
          )}
        </div>

        {/* â”€â”€ CHAPTER SELECTION SCREEN (grace period) â”€â”€ */}
        {joined && inGrace && !chapterReady && (
          <ChapterScreen
            session={sessionDoc}
            secondsLeft={setupLeft}
            onLeave={() => endSession(false)}
            onReady={chapter => {
              setChapterReady(true)
              // Optionally save chapter to session doc
              if (chapter) {
                updateDoc(doc(db, 'sessions', sessionId), { chapter }).catch(() => {})
              }
            }}
          />
        )}
       
        {/* â”€â”€ TIMER BAR (free users) â”€â”€ */}
        {isFree && joined && chapterReady && sessionLeft !== null && (
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: 'rgba(255,255,255,0.1)', zIndex: 20 }}>
            <div style={{
              height: '100%', width: `${pct}%`,
              background: timerColor(sessionLeft),
              transition: 'width 1s linear, background 0.5s'
            }} />
          </div>
        )}

        {/* â”€â”€ TIMER DISPLAY â”€â”€ */}
        {isFree && joined && chapterReady && sessionLeft !== null && (
          <div style={{
            position: 'absolute', top: 16, right: 12, zIndex: 20,
            padding: '6px 12px', borderRadius: 10, fontWeight: 900, fontSize: 16,
            background: 'rgba(0,0,0,0.65)', color: timerColor(sessionLeft),
            letterSpacing: 1, backdropFilter: 'blur(4px)'
          }}>
            â± {formatTime(sessionLeft)}
          </div>
        )}

        {/* â”€â”€ FLOATING CONTROLS â”€â”€ */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
          padding: '12px 16px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
          display: 'flex', justifyContent: 'center', gap: 10, flexWrap: 'wrap',
          opacity: showControls ? 1 : 0, transition: 'opacity 0.3s'
        }}>
          {/* Mic */}
          <button onClick={toggleMic} title={micOn ? 'Mute' : 'Unmute'} style={ctrlBtn(micOn ? '#374151' : '#ef4444')}>
            {micOn ? 'ðŸŽ¤' : 'ðŸ”‡'}
          </button>

          {/* Camera */}
          <button onClick={toggleCam} title={camOn ? 'Turn off camera' : 'Turn on camera'} style={ctrlBtn(camOn ? '#374151' : '#ef4444')}>
            {camOn ? 'ðŸ“·' : 'ðŸš«'}
          </button>

          {/* Switch camera */}
          <button onClick={switchCamera} title="Switch camera" style={ctrlBtn('#374151')}>
            ðŸ”„
          </button>

          {/* Connection status */}
          <div style={{
            padding: '0 12px', borderRadius: 12, background: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center'
          }}>
            <ConnectionDot status={status} />
          </div>

          {/* Fullscreen */}
          <button onClick={() => setIsFullscreen(v => !v)} title="Toggle fullscreen" style={ctrlBtn('#374151')}>
            {isFullscreen ? 'âŠ¡' : 'â›¶'}
          </button>

          {/* End */}
          <button onClick={() => endSession(false)} style={ctrlBtn('#ef4444')}>
            ðŸ“µ End
          </button>
        </div>
      </div>

      {/* â”€â”€ BELOW VIDEO: Status + Grace bar â”€â”€ */}
      <div style={{ marginTop: 10, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <ConnectionDot status={status} />
        {isFree && inGrace && (
          <div style={{
            padding: '5px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700,
            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80'
          }}>
            âœ… Grace period â€” leave now, no credit used ({formatTime(setupLeft)})
          </div>
        )}
        {!isFree && (
          <div style={{
            padding: '5px 12px', borderRadius: 999, fontSize: 13, fontWeight: 700,
            background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)', color: '#fbbf24'
          }}>
            â­ Unlimited session â€” no time limit
          </div>
        )}
      </div>

      {/* â”€â”€ CHAT â”€â”€ */}
      <div style={{ marginTop: 14 }}>
        <Chat sessionId={sessionId} />
      </div>
    </div>
  )
}

// â”€â”€â”€ Control button style helper â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function ctrlBtn(bg) {
  return {
    width: 48, height: 48, borderRadius: '50%', border: 'none',
    background: bg, color: '#fff', fontSize: 20,
    cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', fontStyle: 'normal',
    transition: 'background 0.15s, transform 0.1s',
    flexShrink: 0
  }
                       }
                       
