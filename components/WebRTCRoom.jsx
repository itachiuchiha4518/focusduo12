'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDoc, collection, doc, getDoc, onSnapshot,
  runTransaction, serverTimestamp, setDoc, updateDoc
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import Chat from './Chat'
import EndCard from './EndCard'
import { consumeFreeCreditOnce, getFreeTimerState } from '../lib/sessionTiming'

// ─────────────────────────────────────
// Config
// ─────────────────────────────────────
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
]
const FREE_SECS  = 30 * 60
const GRACE_SECS = 2 * 60
const NUDGE_SECS = 5 * 60

const DEFAULT_PROFILE = {
  planId: 'free', planLabel: 'Free', planStatus: 'active',
  accountStatus: 'active', freeOneOnOneRemaining: 10,
  freeGroupRemaining: 10, sessionsCompleted: 0, streakDays: 0
}

function getEffectivePlanId(p) {
  if (!p) return 'free'
  if (p.accountStatus === 'banned') return 'banned'
  if (p.planStatus === 'active' && p.planId) return p.planId
  return 'free'
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }
function fmt(secs) {
  const s = Math.max(0, Math.floor(secs))
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`
}
function tColor(s) {
  if (s <= 60) return '#ef4444'
  if (s <= NUDGE_SECS) return '#f59e0b'
  return '#4ade80'
}
function preferVP9(sdp) {
  try {
    const lines = sdp.split('\r\n')
    const vp9   = lines.find(l => /a=rtpmap:\d+ VP9/.test(l))
    const pt    = vp9?.match(/a=rtpmap:(\d+) VP9/)?.[1]
    if (!pt) return sdp
    return lines.map(l => {
      if (!l.startsWith('m=video')) return l
      const p = l.split(' ')
      return [...p.slice(0, 3), pt, ...p.slice(3).filter(x => x !== pt)].join(' ')
    }).join('\r\n')
  } catch { return sdp }
}

// ─────────────────────────────────────
// Chapter Selection — full separate screen
// ─────────────────────────────────────
function ChapterScreen({ session, secondsLeft, onLeave, onReady }) {
  const [chapter, setChapter] = useState('')
  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: '#080d18', padding: '24px 20px', fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{ width: '100%', maxWidth: 420, padding: 28, borderRadius: 24, background: '#0f172a', border: '1px solid rgba(148,163,184,0.18)', color: '#e2e8f0' }}>
        <div style={{ textAlign: 'center', marginBottom: 20 }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>📖</div>
          <h2 style={{ margin: 0, fontWeight: 900, fontSize: 22 }}>What are you studying?</h2>
          <p style={{ color: '#94a3b8', marginTop: 8, lineHeight: 1.6, fontSize: 14 }}>
            Tell your partner your chapter. You have{' '}
            <strong style={{ color: secondsLeft <= 30 ? '#ef4444' : '#4ade80', fontSize: 17 }}>{fmt(secondsLeft)}</strong> to decide.
          </p>
        </div>

        <div style={{ padding: '10px 14px', borderRadius: 12, marginBottom: 16, background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(96,165,250,0.2)', fontSize: 14, color: '#93c5fd', fontWeight: 700, textAlign: 'center' }}>
          {session?.exam} • {session?.subject}
        </div>

        <input
          value={chapter}
          onChange={e => setChapter(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && onReady(chapter)}
          placeholder="e.g. Newton's Laws, Organic Chemistry, Limits..."
          autoFocus
          style={{ width: '100%', padding: '13px 14px', borderRadius: 12, fontSize: 15, border: '1px solid rgba(148,163,184,0.25)', background: 'rgba(255,255,255,0.07)', color: '#f8fafc', outline: 'none', boxSizing: 'border-box', marginBottom: 12 }}
        />

        <div style={{ padding: '10px 14px', borderRadius: 12, marginBottom: 16, background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', fontSize: 13, color: '#4ade80', textAlign: 'center', fontWeight: 600 }}>
          ✅ Leave now — your credit will NOT be used
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onLeave} style={{ flex: 1, padding: '13px 0', borderRadius: 12, fontWeight: 700, fontSize: 14, border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', cursor: 'pointer' }}>
            Leave (free)
          </button>
          <button onClick={() => onReady(chapter)} style={{ flex: 2, padding: '13px 0', borderRadius: 12, fontWeight: 900, fontSize: 15, border: 'none', background: 'linear-gradient(90deg,#2563eb,#7c3aed)', color: '#fff', cursor: 'pointer' }}>
            Start studying →
          </button>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────
// Partner Rating
// ─────────────────────────────────────
async function submitRating({ sessionId, raterUid, ratedUid, rating, comment }) {
  if (!sessionId || !raterUid || !ratedUid || !rating) return
  try {
    await addDoc(collection(db, 'ratings'), { sessionId, raterUid, ratedUid, rating, comment: comment || '', createdAt: serverTimestamp() })
    await runTransaction(db, async tx => {
      const snap = await tx.get(doc(db, 'users', ratedUid))
      if (!snap.exists()) return
      const d = snap.data()
      const count = (d.ratingCount || 0) + 1
      const avg   = ((d.ratingAvg || 0) * (count - 1) + rating) / count
      tx.update(doc(db, 'users', ratedUid), { ratingCount: count, ratingAvg: Math.round(avg * 10) / 10, updatedAt: serverTimestamp() })
    })
  } catch (e) { console.warn('rating failed', e) }
}

function RatingCard({ partner, sessionId, selfUid, onDone }) {
  const [rating, setRating]   = useState(0)
  const [hovered, setHovered] = useState(0)
  const [comment, setComment] = useState('')
  const [done, setDone]       = useState(false)

  async function submit() {
    if (!rating) { onDone(); return }
    await submitRating({ sessionId, raterUid: selfUid, ratedUid: partner?.uid, rating, comment })
    setDone(true); setTimeout(onDone, 1000)
  }

  if (done) return <div style={{ padding: 40, textAlign: 'center', color: '#4ade80', fontWeight: 800, fontSize: 18, fontFamily: 'system-ui, sans-serif' }}>✅ Rating saved!</div>

  return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: '#080d18', fontFamily: 'system-ui, sans-serif' }}>
      <div style={{ width: '100%', maxWidth: 400, padding: 28, borderRadius: 24, textAlign: 'center', background: '#0f172a', border: '1px solid rgba(148,163,184,0.18)', color: '#e2e8f0' }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>⭐</div>
        <h2 style={{ margin: '0 0 6px', fontWeight: 900 }}>Rate your session</h2>
        <p style={{ color: '#94a3b8', fontSize: 14, marginBottom: 20 }}>How was studying with <strong>{partner?.name || 'your partner'}</strong>?</p>
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 18 }}>
          {[1,2,3,4,5].map(s => (
            <button key={s} onClick={() => setRating(s)} onMouseEnter={() => setHovered(s)} onMouseLeave={() => setHovered(0)}
              style={{ fontSize: 40, background: 'none', border: 'none', cursor: 'pointer', color: s <= (hovered||rating) ? '#fbbf24' : '#1e293b', transition: 'transform 0.1s', transform: s <= (hovered||rating) ? 'scale(1.2)' : 'scale(1)' }}>★</button>
          ))}
        </div>
        {rating > 0 && (
          <input value={comment} onChange={e => setComment(e.target.value)}
            placeholder={rating >= 4 ? 'What did they do well? (optional)' : 'What could be better? (optional)'}
            style={{ width: '100%', padding: '11px 14px', borderRadius: 12, fontSize: 14, border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(255,255,255,0.05)', color: '#f8fafc', outline: 'none', boxSizing: 'border-box', marginBottom: 16 }}
          />
        )}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={onDone} style={{ padding: '11px 20px', borderRadius: 12, fontWeight: 700, cursor: 'pointer', border: '1px solid rgba(148,163,184,0.2)', background: 'transparent', color: '#94a3b8' }}>Skip</button>
          <button onClick={submit} style={{ padding: '11px 24px', borderRadius: 12, fontWeight: 900, cursor: 'pointer', border: 'none', background: 'linear-gradient(90deg,#2563eb,#7c3aed)', color: '#fff' }}>Submit →</button>
        </div>
      </div>
    </div>
  )
}

function ConnDot({ status }) {
  const ok   = status === 'connected'
  const warn = status === 'reconnecting'
  const col  = ok ? '#4ade80' : warn ? '#f59e0b' : '#94a3b8'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#94a3b8' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: col, display: 'inline-block', boxShadow: ok ? `0 0 5px ${col}` : 'none' }} />
      {ok ? 'Connected' : warn ? 'Reconnecting…' : 'Connecting…'}
    </span>
  )
}

// ─────────────────────────────────────
// Control Button
// ─────────────────────────────────────
function CtrlBtn({ icon, label, onClick, danger }) {
  const [pressed, setPressed] = useState(false)
  return (
    <button onClick={onClick}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      title={label}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '10px 16px', borderRadius: 16, border: 'none', cursor: 'pointer',
        background: danger ? 'rgba(239,68,68,0.22)' : 'rgba(255,255,255,0.1)',
        color: '#fff', transition: 'all 0.12s',
        transform: pressed ? 'scale(0.92)' : 'scale(1)',
        backdropFilter: 'blur(6px)',
        outline: 'none'
      }}>
      <span style={{ fontSize: 24 }}>{icon}</span>
      <span style={{ fontSize: 11, fontWeight: 700, color: danger ? '#fca5a5' : '#94a3b8' }}>{label}</span>
    </button>
  )
}

// ─────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────
export default function WebRTCRoom({ sessionId, session: sessionProp }) {
  const localVideoRef   = useRef(null)
  const remoteVideoRef  = useRef(null)
  const pcRef           = useRef(null)
  const localStreamRef  = useRef(null)
  const remoteStreamRef = useRef(null)
  const offerUnsubRef      = useRef(null)
  const answerUnsubRef     = useRef(null)
  const candidatesUnsubRef = useRef(null)
  const seenCandRef        = useRef(new Set())
  const timerRef           = useRef(null)
  const reconnLockRef      = useRef(false)
  const reconnAttemptsRef  = useRef(0)
  const autoJoinRef        = useRef(false)
  const currentUidRef      = useRef(null)
  const lastOfferRef       = useRef('')
  const lastAnswerRef      = useRef('')
  const cleanupLockRef     = useRef(false)
  const nudgeShownRef      = useRef(false)

  const [sessionDoc, setSessionDoc]     = useState(sessionProp || null)
  const [profile, setProfile]           = useState(null)
  const [status, setStatus]             = useState('idle')
  const [joined, setJoined]             = useState(false)
  const [micOn, setMicOn]               = useState(true)
  const [camOn, setCamOn]               = useState(true)
  const [facing, setFacing]             = useState('user')
  const [sessionEnded, setSessionEnded] = useState(false)
  const [showRating, setShowRating]     = useState(false)
  const [showEndCard, setShowEndCard]   = useState(false)
  const [tick, setTick]                 = useState(Date.now())
  const [creditConsumed, setCreditConsumed] = useState(false)
  const [joinBusy, setJoinBusy]         = useState(false)
  const [remoteReady, setRemoteReady]   = useState(false)
  const [chapterDone, setChapterDone]   = useState(false)
  const [showNudge, setShowNudge]       = useState(false)
  const [nudgeDismissed, setNudgeDismissed] = useState(false)

  const partner = useMemo(() => {
    const uid = currentUidRef.current
    return (sessionDoc?.participants || []).find(p => p.uid !== uid) || null
  }, [sessionDoc, tick])

  const isFree   = getEffectivePlanId(profile) === 'free'
  const timerState = isFree ? getFreeTimerState(sessionDoc) : null
  const elapsed  = sessionDoc?.startedAt?.toMillis ? Math.floor((tick - sessionDoc.startedAt.toMillis()) / 1000) : 0
  const setupLeft = Math.max(0, GRACE_SECS - elapsed)
  const sessLeft  = isFree ? Math.max(0, FREE_SECS - elapsed) : null
  const inGrace   = isFree && elapsed < GRACE_SECS && !chapterDone
  const timerPct  = sessLeft !== null ? (sessLeft / FREE_SECS) * 100 : 100

  useEffect(() => {
    if (isFree && sessLeft !== null && sessLeft <= NUDGE_SECS && !nudgeShownRef.current && !nudgeDismissed) {
      nudgeShownRef.current = true; setShowNudge(true)
    }
  }, [sessLeft, isFree, nudgeDismissed])

  useEffect(() => {
    reconnLockRef.current = false; reconnAttemptsRef.current = 0; autoJoinRef.current = false
    lastOfferRef.current = ''; lastAnswerRef.current = ''; cleanupLockRef.current = false
    setCreditConsumed(false); setShowEndCard(false); setSessionEnded(false); setJoined(false); setStatus('idle')

    const unsubAuth = auth.onAuthStateChanged(async u => {
      currentUidRef.current = u?.uid || null
      if (!u) { setProfile(null); return }
      try {
        const snap = await getDoc(doc(db, 'users', u.uid))
        if (!snap.exists()) {
          const base = { ...DEFAULT_PROFILE, uid: u.uid, name: u.displayName || '', email: u.email || '', updatedAt: serverTimestamp() }
          await setDoc(doc(db, 'users', u.uid), base, { merge: true }); setProfile(base); return
        }
        setProfile({ ...DEFAULT_PROFILE, id: snap.id, ...snap.data() })
      } catch (e) { console.warn(e) }
    })

    const unsubSession = onSnapshot(doc(db, 'sessions', sessionId), snap => {
      if (!snap.exists()) return
      const data = { id: snap.id, ...snap.data() }
      setSessionDoc(data)
      if (data.status === 'finished') { setSessionEnded(true); setShowRating(true); cleanup() }
    })

    timerRef.current = setInterval(() => setTick(Date.now()), 1000)
    return () => { unsubAuth(); unsubSession(); clearInterval(timerRef.current); cleanup() }
  }, [sessionId])

  useEffect(() => {
    if (!auth.currentUser?.uid) return
    const unsub = onSnapshot(doc(db, 'sessions', sessionId, 'billing', auth.currentUser.uid), snap => {
      setCreditConsumed(Boolean(snap.exists() && snap.data()?.consumed))
    })
    return () => unsub()
  }, [sessionId])

  useEffect(() => {
    const uid = currentUidRef.current
    if (!uid || !sessionDoc || joined || sessionEnded || joinBusy) return
    if (sessionDoc.status !== 'active' && sessionDoc.status !== 'matching') return
    const parts = sessionDoc.participants || []
    if (!parts.some(p => p.uid === uid) && sessionDoc.initiatorUid !== uid) return
    if (autoJoinRef.current) return
    autoJoinRef.current = true
    const t = setTimeout(() => joinMeeting().catch(() => { autoJoinRef.current = false }), 450)
    return () => clearTimeout(t)
  }, [sessionDoc, joined, sessionEnded, joinBusy])

  useEffect(() => {
    if (!sessionDoc || !isFree || creditConsumed || !timerState?.gracePassed) return
    consumeFreeCreditOnce({ db, sessionId, uid: auth.currentUser?.uid, mode: sessionDoc.mode, userRef: doc(db, 'users', auth.currentUser.uid) })
      .then(r => { if (r?.consumed) setCreditConsumed(true) })
      .catch(e => console.warn(e))
  }, [sessionDoc, isFree, timerState?.gracePassed, creditConsumed, sessionId])

  useEffect(() => {
    if (!sessionDoc || !isFree || !timerState?.finished || sessionDoc.status === 'finished') return
    endSession(true)
  }, [sessionDoc, isFree, timerState?.finished])

  async function cleanup() {
    if (cleanupLockRef.current) return
    cleanupLockRef.current = true
    try { offerUnsubRef.current?.() } catch {}
    try { answerUnsubRef.current?.() } catch {}
    try { candidatesUnsubRef.current?.() } catch {}
    offerUnsubRef.current = answerUnsubRef.current = candidatesUnsubRef.current = null
    seenCandRef.current = new Set()
    try { if (pcRef.current) { pcRef.current.oniceconnectionstatechange = null; pcRef.current.ontrack = null; pcRef.current.onicecandidate = null; pcRef.current.close(); pcRef.current = null } } catch {}
    try { if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t => t.stop()); localStreamRef.current = null } } catch {}
    try { if (remoteStreamRef.current) { remoteStreamRef.current.getTracks().forEach(t => t.stop()); remoteStreamRef.current = null } } catch {}
    setJoined(false); cleanupLockRef.current = false
  }

  async function ensureStartedAt() {
    await runTransaction(db, async tx => {
      const snap = await tx.get(doc(db, 'sessions', sessionId))
      if (!snap.exists()) throw new Error('session-missing')
      const patch = {}
      if (!snap.data().startedAt) patch.startedAt = serverTimestamp()
      if (snap.data().status !== 'active') patch.status = 'active'
      if (Object.keys(patch).length) tx.set(doc(db, 'sessions', sessionId), patch, { merge: true })
    })
  }

  async function publishCand(c) {
    await addDoc(collection(db, 'sessions', sessionId, 'candidates'), { sender: currentUidRef.current, candidate: c.toJSON(), ts: Date.now() })
  }

  async function getStream(facingMode = 'user') {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 360 }, frameRate: { ideal: 30, max: 30 } }
      })
    } catch {
      return navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: { ideal: facingMode } } })
    }
  }

  async function boostQuality(pc) {
    try {
      const vs = pc.getSenders().find(s => s.track?.kind === 'video')
      if (vs) { const p = vs.getParameters?.() || {}; if (!p.encodings) p.encodings = [{}]; p.encodings[0].maxBitrate = 2500000; p.encodings[0].maxFramerate = 30; p.degradationPreference = 'maintain-resolution'; await vs.setParameters(p).catch(() => {}) }
      const as = pc.getSenders().find(s => s.track?.kind === 'audio')
      if (as) { const p = as.getParameters?.() || {}; if (!p.encodings) p.encodings = [{}]; p.encodings[0].maxBitrate = 64000; await as.setParameters(p).catch(() => {}) }
    } catch {}
  }

  async function setupSignaling(pc, selfUid) {
    const initUid  = sessionDoc?.initiatorUid || sessionDoc?.participants?.[0]?.uid || selfUid
    const amInit   = initUid === selfUid
    const offerRef  = doc(db, 'sessions', sessionId, 'signaling', 'offer')
    const answerRef = doc(db, 'sessions', sessionId, 'signaling', 'answer')

    candidatesUnsubRef.current = onSnapshot(collection(db, 'sessions', sessionId, 'candidates'), snap => {
      snap.docChanges().forEach(async ch => {
        if (ch.type !== 'added' || seenCandRef.current.has(ch.doc.id)) return
        seenCandRef.current.add(ch.doc.id)
        const d = ch.doc.data()
        if (!d || d.sender === selfUid) return
        try { await pc.addIceCandidate(new RTCIceCandidate(d.candidate)) } catch {}
      })
    })

    if (amInit) {
      answerUnsubRef.current = onSnapshot(answerRef, async snap => {
        if (!snap.exists()) return
        const d = snap.data()
        if (!d?.sdp || d.sdp === lastAnswerRef.current) return
        try { await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp }); lastAnswerRef.current = d.sdp } catch {}
      })
    } else {
      offerUnsubRef.current = onSnapshot(offerRef, async snap => {
        if (!snap.exists()) return
        const d = snap.data()
        if (!d?.sdp || d.sdp === lastOfferRef.current) return
        try {
          await pc.setRemoteDescription({ type: 'offer', sdp: d.sdp }); lastOfferRef.current = d.sdp
          const ans = await pc.createAnswer(); ans.sdp = preferVP9(ans.sdp)
          await pc.setLocalDescription(ans)
          await setDoc(answerRef, { type: ans.type, sdp: ans.sdp, sender: selfUid, createdAt: serverTimestamp() }, { merge: true })
        } catch {}
      })
    }
  }

  async function joinMeeting() {
    if (!auth.currentUser || joined || sessionDoc?.status === 'finished') return
    setJoinBusy(true)
    try {
      setStatus('getting-media')
      await ensureStartedAt()
      const stream = await getStream(facing)
      localStreamRef.current = stream
      const vt = stream.getVideoTracks()[0]
      if (vt) vt.contentHint = 'detail'
      if (localVideoRef.current) { localVideoRef.current.srcObject = stream; localVideoRef.current.muted = true; localVideoRef.current.playsInline = true; await localVideoRef.current.play().catch(() => {}) }

      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc
      const remote = new MediaStream()
      remoteStreamRef.current = remote
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remote

      pc.ontrack = ev => {
        const [ps] = ev.streams
        if (ps) ps.getTracks().forEach(t => { if (!remote.getTracks().some(x => x.id === t.id)) remote.addTrack(t) })
        setRemoteReady(true)
        setTimeout(() => remoteVideoRef.current?.play().catch(() => {}), 50)
      }

      stream.getTracks().forEach(t => pc.addTrack(t, stream))
      await boostQuality(pc)
      pc.onicecandidate = ev => { if (ev.candidate) publishCand(ev.candidate) }
      pc.oniceconnectionstatechange = () => {
        const st = pc.iceConnectionState
        if (st === 'connected' || st === 'completed') { reconnLockRef.current = false; reconnAttemptsRef.current = 0; setStatus('connected') }
        if (st === 'disconnected' || st === 'failed') {
          setStatus('reconnecting')
          if (reconnAttemptsRef.current < 4) { reconnAttemptsRef.current++; restartConn().catch(() => {}) }
        }
      }

      await setupSignaling(pc, auth.currentUser.uid)
      const selfUid = auth.currentUser.uid
      const initUid = sessionDoc?.initiatorUid || sessionDoc?.participants?.[0]?.uid || selfUid
      if (initUid === selfUid) {
        const offer = await pc.createOffer(); offer.sdp = preferVP9(offer.sdp)
        await pc.setLocalDescription(offer); lastOfferRef.current = offer.sdp
        await setDoc(doc(db, 'sessions', sessionId, 'signaling', 'offer'), { type: offer.type, sdp: offer.sdp, sender: selfUid, createdAt: serverTimestamp() }, { merge: true })
      }
      setJoined(true); setStatus('connected')
    } catch (e) {
      console.error(e); autoJoinRef.current = false
      alert('Camera/mic access failed. Please allow permissions and reload.')
      setStatus('error')
    } finally { setJoinBusy(false) }
  }

  async function restartConn() {
    const pc = pcRef.current
    if (!pc || reconnLockRef.current || sessionDoc?.status === 'finished') return
    reconnLockRef.current = true
    try {
      pc.restartIce?.(); await sleep(250)
      const offer = await pc.createOffer({ iceRestart: true }); offer.sdp = preferVP9(offer.sdp)
      await pc.setLocalDescription(offer); lastOfferRef.current = offer.sdp
      await setDoc(doc(db, 'sessions', sessionId, 'signaling', 'offer'), { type: offer.type, sdp: offer.sdp, sender: currentUidRef.current, iceRestart: true, updatedAt: serverTimestamp() }, { merge: true })
    } catch {} finally { setTimeout(() => { reconnLockRef.current = false }, 3000) }
  }

  function toggleMic() { localStreamRef.current?.getAudioTracks().forEach(t => (t.enabled = !t.enabled)); setMicOn(v => !v) }
  function toggleCam() { localStreamRef.current?.getVideoTracks().forEach(t => (t.enabled = !t.enabled)); setCamOn(v => !v) }

  async function switchCam() {
    const next = facing === 'user' ? 'environment' : 'user'
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: next }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      const track  = stream.getVideoTracks()[0]
      if (!track) return
      track.contentHint = 'detail'
      const sender = pcRef.current?.getSenders().find(s => s.track?.kind === 'video')
      if (sender) await sender.replaceTrack(track)
      const audio = localStreamRef.current?.getAudioTracks() || []
      localStreamRef.current?.getVideoTracks().forEach(t => t.stop())
      const ns = new MediaStream([...audio, track])
      localStreamRef.current = ns
      if (localVideoRef.current) { localVideoRef.current.srcObject = ns; await localVideoRef.current.play().catch(() => {}) }
      setFacing(next)
    } catch { alert('Could not switch camera.') }
  }

  async function endSession(fromTimer = false) {
    try { await updateDoc(doc(db, 'sessions', sessionId), { status: 'finished', endedAt: serverTimestamp(), endedByTimer: !!fromTimer }) } catch {}
    setSessionEnded(true); setShowRating(true); await cleanup()
  }

  // ── Render phases ──

  // Phase 0: Chapter selection (grace + free + not dismissed)
  if (joined && inGrace && isFree) {
    return (
      <ChapterScreen
        session={sessionDoc}
        secondsLeft={setupLeft}
        onLeave={() => endSession(false)}
        onReady={chapter => {
          setChapterDone(true)
          if (chapter) updateDoc(doc(db, 'sessions', sessionId), { chapter }).catch(() => {})
        }}
      />
    )
  }

  // Phase 1: Rating
  if (showRating && !showEndCard) {
    return <RatingCard partner={partner} sessionId={sessionId} selfUid={currentUidRef.current} onDone={() => { setShowRating(false); setShowEndCard(true) }} />
  }

  // Phase 2: End card
  if (showEndCard) {
    return (
      <div style={{ padding: 16 }}>
        <EndCard sessionId={sessionId} partnerUid={partner?.uid || null} partnerName={partner?.name || 'Partner'} sessionMeta={{ exam: sessionDoc?.exam, subject: sessionDoc?.subject, mode: sessionDoc?.mode }} onStartNew={() => { window.location.href = '/join' }} />
      </div>
    )
  }

  // ─────────────────────────────────────
  // Phase 3: MAIN VIDEO ROOM
  // Layout: TopBar → Video (big, flex-1) → Timer (below) → Chat
  // ─────────────────────────────────────
  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', background: '#080d18', display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden' }}>

      {/* TOP BAR — minimal, thin */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 14px', background: 'rgba(8,13,24,0.98)', borderBottom: '1px solid rgba(148,163,184,0.1)', flexShrink: 0, gap: 8 }}>
        <div>
          <div style={{ fontWeight: 800, color: '#e2e8f0', fontSize: 13 }}>{sessionDoc?.exam} • {sessionDoc?.subject}</div>
          <ConnDot status={status} />
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {!isFree && <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'rgba(251,191,36,0.12)', color: '#fbbf24', border: '1px solid rgba(251,191,36,0.25)' }}>⭐ Unlimited</span>}
          {isFree && inGrace && <span style={{ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'rgba(34,197,94,0.12)', color: '#4ade80', border: '1px solid rgba(34,197,94,0.25)' }}>Free to leave</span>}
        </div>
      </div>

      {/* UPGRADE NUDGE */}
      {showNudge && !nudgeDismissed && isFree && (
        <div style={{ padding: '8px 14px', background: 'rgba(239,68,68,0.16)', borderBottom: '1px solid rgba(239,68,68,0.3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
          <span style={{ color: '#fca5a5', fontWeight: 800, fontSize: 13 }}>⏰ 5 min left! <span style={{ color: '#cbd5e1', fontWeight: 400 }}>Upgrade to never get cut off.</span></span>
          <div style={{ display: 'flex', gap: 6 }}>
            <a href="/plans" style={{ padding: '6px 12px', borderRadius: 8, fontWeight: 800, fontSize: 12, background: '#ef4444', color: '#fff', textDecoration: 'none' }}>₹99 →</a>
            <button onClick={() => setNudgeDismissed(true)} style={{ padding: '6px 9px', borderRadius: 8, border: '1px solid rgba(148,163,184,0.2)', background: 'transparent', color: '#94a3b8', cursor: 'pointer', fontSize: 12 }}>✕</button>
          </div>
        </div>
      )}

      {/* VIDEO — takes all remaining space */}
      <div style={{ flex: 1, position: 'relative', background: '#000', minHeight: 0 }}>

        {/* REMOTE — full size main video */}
        <video ref={remoteVideoRef} autoPlay playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#000' }}
        />

        {/* Waiting overlay */}
        {!remoteReady && status !== 'idle' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,13,24,0.92)' }}>
            <div style={{ fontSize: 48, marginBottom: 14 }}>⏳</div>
            <div style={{ color: '#e2e8f0', fontWeight: 800, fontSize: 17 }}>Waiting for partner...</div>
            <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 6 }}>Usually takes a few seconds</div>
          </div>
        )}

        {/* Reconnecting overlay */}
        {status === 'reconnecting' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'rgba(8,13,24,0.75)' }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>🔄</div>
            <div style={{ color: '#f59e0b', fontWeight: 800, fontSize: 16 }}>Reconnecting...</div>
            <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 4 }}>Weak network — hang tight</div>
          </div>
        )}

        {/* Partner name */}
        {partner?.name && remoteReady && (
          <div style={{ position: 'absolute', top: 10, left: 10, padding: '4px 12px', borderRadius: 999, background: 'rgba(0,0,0,0.6)', color: '#fff', fontSize: 12, fontWeight: 700, backdropFilter: 'blur(6px)' }}>
            {partner.name} 🟢
          </div>
        )}

        {/* LOCAL PIP — bottom right, small but visible */}
        <div style={{ position: 'absolute', bottom: 80, right: 10, width: 88, height: 118, borderRadius: 12, overflow: 'hidden', border: '2px solid rgba(255,255,255,0.18)', background: '#111', zIndex: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.6)' }}>
          <video ref={localVideoRef} autoPlay playsInline muted
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: facing === 'user' ? 'scaleX(-1)' : 'none' }}
          />
          {!camOn && (
            <div style={{ position: 'absolute', inset: 0, background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>🚫</div>
          )}
          <div style={{ position: 'absolute', bottom: 3, left: 0, right: 0, textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.6)', fontWeight: 700, letterSpacing: 0.5 }}>YOU</div>
        </div>

        {/* CONTROLS — floating at bottom of video */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '16px', background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)', display: 'flex', justifyContent: 'center', gap: 10, zIndex: 20 }}>
          <CtrlBtn icon={micOn ? '🎤' : '🔇'} label={micOn ? 'Mute' : 'Unmute'} onClick={toggleMic} danger={!micOn} />
          <CtrlBtn icon={camOn ? '📷' : '🚫'} label={camOn ? 'Cam off' : 'Cam on'} onClick={toggleCam} danger={!camOn} />
          <CtrlBtn icon="🔄" label="Flip" onClick={switchCam} />
          <CtrlBtn icon="📵" label="End" onClick={() => endSession(false)} danger />
        </div>
      </div>

      {/* TIMER — completely below video, its own section, big and readable */}
      {isFree && sessLeft !== null && (
        <div style={{ background: '#0d1525', borderTop: '1px solid rgba(148,163,184,0.1)', padding: '12px 16px', flexShrink: 0 }}>
          {/* Progress bar */}
          <div style={{ height: 5, borderRadius: 999, background: 'rgba(255,255,255,0.08)', marginBottom: 10, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 999, width: `${timerPct}%`, background: tColor(sessLeft), transition: 'width 1s linear, background 0.5s' }} />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 600, marginBottom: 2, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {inGrace ? 'Setup time' : 'Time remaining'}
              </div>
              <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: 3, color: tColor(sessLeft), fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
                {fmt(sessLeft)}
              </div>
              {sessLeft <= 60 && sessLeft > 0 && (
                <div style={{ color: '#ef4444', fontSize: 12, fontWeight: 700, marginTop: 4 }}>🔴 Ending in less than 1 minute!</div>
              )}
            </div>
            <a href="/plans" style={{ padding: '10px 14px', borderRadius: 12, fontWeight: 800, fontSize: 12, background: 'linear-gradient(90deg,#2563eb,#7c3aed)', color: '#fff', textDecoration: 'none', textAlign: 'center', lineHeight: 1.4 }}>
              Upgrade<br /><span style={{ fontSize: 10, opacity: 0.8, fontWeight: 500 }}>No limits</span>
            </a>
          </div>
        </div>
      )}

      {/* Paid: simple bottom bar */}
      {!isFree && (
        <div style={{ padding: '8px 16px', background: '#0d1525', borderTop: '1px solid rgba(148,163,184,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
          <ConnDot status={status} />
          <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 700 }}>⭐ No time limit</span>
        </div>
      )}

      {/* CHAT */}
      <div style={{ background: '#0a0f1e', borderTop: '1px solid rgba(148,163,184,0.08)', flexShrink: 0, maxHeight: '30vh', overflowY: 'auto' }}>
        <Chat sessionId={sessionId} />
      </div>
    </div>
  )
}
