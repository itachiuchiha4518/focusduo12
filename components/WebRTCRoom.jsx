'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { addDoc, collection, doc, getDoc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import Chat from './Chat'
import EndCard from './EndCard'
import {
  consumeFreeCredit,
  ensureUserProfile,
  getEffectivePlanId,
  remainingForMode
} from '../lib/subscriptions'

function formatClock(totalSeconds) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${String(m).padStart(2, '0')}:${String(r).padStart(2, '0')}`
}

export default function WebRTCRoom({ sessionId, session: sessionProp }) {
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)

  const offerUnsubRef = useRef(null)
  const answerUnsubRef = useRef(null)
  const candidatesUnsubRef = useRef(null)
  const connectedRef = useRef(false)
  const seenCandidatesRef = useRef(new Set())

  const joinStartedAtRef = useRef(0)
  const graceTimeoutRef = useRef(null)
  const autoEndTimeoutRef = useRef(null)
  const billingDoneRef = useRef(false)
  const intervalRef = useRef(null)

  const [session, setSession] = useState(sessionProp || null)
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [joined, setJoined] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [cameraFacing, setCameraFacing] = useState('user')
  const [sessionEnded, setSessionEnded] = useState(false)
  const [nowTick, setNowTick] = useState(Date.now())

  const partner = useMemo(() => {
    const selfUid = auth.currentUser?.uid
    const parts = session?.participants || []
    return parts.find(p => p.uid !== selfUid) || null
  }, [session])

  const effectivePlanId = getEffectivePlanId(profile)
  const isFree = effectivePlanId === 'free'
  const joinedSeconds = joined ? Math.floor((nowTick - joinStartedAtRef.current) / 1000) : 0
  const graceLeft = isFree ? Math.max(0, 120 - joinedSeconds) : 0
  const freeSessionLeft = isFree ? Math.max(0, 1800 - joinedSeconds) : 0

  useEffect(() => {
    let mounted = true

    const unsubscribeAuth = auth.onAuthStateChanged(async u => {
      if (!u) {
        if (mounted) setProfile(null)
        return
      }
      try {
        const p = await ensureUserProfile(u)
        if (mounted) setProfile(p)
      } catch (err) {
        console.warn(err)
      }
    })

    async function loadSession() {
      const snap = await getDoc(doc(db, 'sessions', sessionId))
      if (!mounted) return
      if (snap.exists()) {
        setSession({ id: snap.id, ...snap.data() })
        if (snap.data()?.status === 'finished') setSessionEnded(true)
      }
    }

    loadSession()

    const unsub = onSnapshot(doc(db, 'sessions', sessionId), snap => {
      if (!snap.exists()) return
      const data = { id: snap.id, ...snap.data() }
      setSession(data)
      setSessionEnded(data.status === 'finished')
    })

    intervalRef.current = setInterval(() => setNowTick(Date.now()), 1000)

    return () => {
      mounted = false
      unsubscribeAuth()
      unsub()
      if (intervalRef.current) clearInterval(intervalRef.current)
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  async function cleanup() {
    try { offerUnsubRef.current?.() } catch {}
    try { answerUnsubRef.current?.() } catch {}
    try { candidatesUnsubRef.current?.() } catch {}

    offerUnsubRef.current = null
    answerUnsubRef.current = null
    candidatesUnsubRef.current = null
    connectedRef.current = false
    seenCandidatesRef.current = new Set()

    if (graceTimeoutRef.current) {
      clearTimeout(graceTimeoutRef.current)
      graceTimeoutRef.current = null
    }
    if (autoEndTimeoutRef.current) {
      clearTimeout(autoEndTimeoutRef.current)
      autoEndTimeoutRef.current = null
    }

    try {
      if (pcRef.current) {
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
  }

  async function publishCandidate(candidate) {
    await addDoc(collection(db, 'sessions', sessionId, 'candidates'), {
      sender: auth.currentUser?.uid || null,
      candidate: candidate.toJSON(),
      ts: Date.now()
    })
  }

  async function createLocalStream(facingMode = 'user') {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: { facingMode: { ideal: facingMode } }
    })
  }

  async function attachLocalPreview(stream) {
    if (!localVideoRef.current) return
    localVideoRef.current.srcObject = stream
    localVideoRef.current.muted = true
    await localVideoRef.current.play().catch(() => {})
  }

  async function replaceCameraTrack(newVideoTrack) {
    const pc = pcRef.current
    if (!pc || !newVideoTrack) return

    const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video')
    if (videoSender) {
      await videoSender.replaceTrack(newVideoTrack)
    }

    const audioTracks = localStreamRef.current?.getAudioTracks?.() || []
    const currentVideoTracks = localStreamRef.current?.getVideoTracks?.() || []
    currentVideoTracks.forEach(t => t.stop())

    const composed = new MediaStream([...audioTracks, newVideoTrack])
    localStreamRef.current = composed

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = composed
      localVideoRef.current.muted = true
      await localVideoRef.current.play().catch(() => {})
    }
  }

  async function finalizeFreeCreditIfNeeded() {
    if (!isFree) return
    if (billingDoneRef.current) return
    if (!auth.currentUser) return
    if (joinedSeconds < 120) return

    try {
      await consumeFreeCredit({
        uid: auth.currentUser.uid,
        mode: session?.mode || 'one-on-one',
        sessionId
      })
      billingDoneRef.current = true
    } catch (err) {
      console.warn('free credit consume failed', err)
    }
  }

  async function joinMeeting() {
    if (!auth.currentUser) {
      alert('Sign in first')
      return
    }

    if (joined) return

    try {
      setStatus('getting-media')

      const stream = await createLocalStream(cameraFacing)
      localStreamRef.current = stream
      await attachLocalPreview(stream)

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
      })
      pcRef.current = pc

      const remoteStream = new MediaStream()
      remoteStreamRef.current = remoteStream
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream

      pc.ontrack = event => {
        const [streamFromPeer] = event.streams
        if (streamFromPeer) {
          streamFromPeer.getTracks().forEach(track => {
            if (!remoteStream.getTracks().some(t => t.id === track.id)) {
              remoteStream.addTrack(track)
            }
          })
        }
        setTimeout(() => {
          remoteVideoRef.current?.play().catch(() => {})
        }, 75)
      }

      stream.getTracks().forEach(track => pc.addTrack(track, stream))

      pc.onicecandidate = ev => {
        if (ev.candidate) publishCandidate(ev.candidate)
      }

      const selfUid = auth.currentUser.uid
      const initiatorUid = session?.initiatorUid || session?.participants?.[0]?.uid || selfUid
      const amInitiator = initiatorUid === selfUid

      const offerRef = doc(db, 'sessions', sessionId, 'signaling', 'offer')
      const answerRef = doc(db, 'sessions', sessionId, 'signaling', 'answer')
      const candCol = collection(db, 'sessions', sessionId, 'candidates')

      candidatesUnsubRef.current = onSnapshot(candCol, snap => {
        snap.docChanges().forEach(async change => {
          if (change.type !== 'added') return
          if (seenCandidatesRef.current.has(change.doc.id)) return
          seenCandidatesRef.current.add(change.doc.id)

          const data = change.doc.data()
          if (!data || data.sender === selfUid) return
          try {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
          } catch {}
        })
      })

      if (amInitiator) {
        const existingOffer = await getDoc(offerRef)
        if (!existingOffer.exists()) {
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          await setDoc(offerRef, {
            type: offer.type,
            sdp: offer.sdp,
            sender: selfUid,
            createdAt: serverTimestamp()
          })
        }

        answerUnsubRef.current = onSnapshot(answerRef, async snap => {
          if (!snap.exists()) return
          const data = snap.data()
          if (!data?.sdp) return
          try {
            await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
          } catch {}
        })
      } else {
        offerUnsubRef.current = onSnapshot(offerRef, async snap => {
          if (!snap.exists()) return
          const data = snap.data()
          if (!data?.sdp) return
          try {
            await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            await setDoc(answerRef, {
              type: answer.type,
              sdp: answer.sdp,
              sender: selfUid,
              createdAt: serverTimestamp()
            })
          } catch {}
        })
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') {
          connectedRef.current = true
          setStatus('connected')
        }
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          setStatus(pc.connectionState)
        }
      }

      joinStartedAtRef.current = Date.now()
      setNowTick(Date.now())

      if (isFree) {
        if (graceTimeoutRef.current) clearTimeout(graceTimeoutRef.current)
        if (autoEndTimeoutRef.current) clearTimeout(autoEndTimeoutRef.current)

        graceTimeoutRef.current = setTimeout(async () => {
          await finalizeFreeCreditIfNeeded()
        }, 120000)

        autoEndTimeoutRef.current = setTimeout(async () => {
          await endSession(true)
        }, 1800000)
      }

      setJoined(true)
      setStatus('joined')
    } catch (err) {
      console.error(err)
      alert('Unable to start video. Check camera and mic permissions.')
      setStatus('error')
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
      const newVideoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing } },
        audio: false
      })

      const newVideoTrack = newVideoStream.getVideoTracks()[0]
      if (!newVideoTrack) return

      await replaceCameraTrack(newVideoTrack)
      setCameraFacing(nextFacing)
    } catch (err) {
      console.error(err)
      alert('Could not switch camera on this device.')
    }
  }

  async function leaveSession() {
    await finalizeFreeCreditIfNeeded()
    await cleanup()
  }

  async function endSession(fromTimer = false) {
    await finalizeFreeCreditIfNeeded()
    try {
      await setDoc(
        doc(db, 'sessions', sessionId),
        {
          status: 'finished',
          endedAt: serverTimestamp(),
          endedByTimer: !!fromTimer
        },
        { merge: true }
      )
    } catch {}

    setSessionEnded(true)
    await cleanup()
  }

  function startNewSession() {
    window.location.href = '/join'
  }

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 180 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: '#e2e8f0' }}>You</div>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              width: '100%',
              maxWidth: 280,
              height: 240,
              background: '#000',
              borderRadius: 12,
              objectFit: 'cover'
            }}
          />
        </div>

        <div style={{ minWidth: 180, flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: '#e2e8f0' }}>
            Partner{partner?.name ? ` • ${partner.name}` : ''}
          </div>
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            style={{
              width: '100%',
              minHeight: 240,
              background: '#000',
              borderRadius: 12,
              objectFit: 'cover'
            }}
          />
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={toggleMic}>{micOn ? 'Mic Off' : 'Mic On'}</button>
        <button onClick={toggleCam}>{camOn ? 'Cam Off' : 'Cam On'}</button>
        <button onClick={switchCamera}>Switch camera</button>
        {!joined ? (
          <button onClick={joinMeeting}>Join meeting</button>
        ) : (
          <button onClick={leaveSession}>Leave</button>
        )}
        <button onClick={endSession} style={{ background: '#ef4444', color: '#fff' }}>
          End session
        </button>
      </div>

      <div style={{ marginTop: 10, color: '#cbd5e1' }}>
        <strong>Status:</strong> {status}
      </div>

      <div
        style={{
          marginTop: 14,
          padding: 14,
          borderRadius: 14,
          background: 'rgba(15,23,42,0.95)',
          border: '1px solid rgba(148,163,184,0.18)',
          color: '#e2e8f0'
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 8 }}>
          {isFree ? 'Free session timer' : 'Unlimited session timer'}
        </div>

        {isFree ? (
          <>
            <div style={{ marginBottom: 6 }}>
              <strong>2-minute setup:</strong> {formatClock(graceLeft)}
            </div>
            <div style={{ color: '#cbd5e1', marginBottom: 10 }}>
              Use these 2 minutes to choose the chapter. Leave now and your credit will not be used.
            </div>

            <div style={{ marginBottom: 6 }}>
              <strong>30-minute session:</strong> {formatClock(freeSessionLeft)}
            </div>
            <div style={{ color: '#cbd5e1' }}>
              When this timer ends, the session finishes automatically.
            </div>
          </>
        ) : (
          <div style={{ color: '#cbd5e1' }}>
            Unlimited time. Stay as long as you want.
          </div>
        )}
      </div>

      {sessionEnded && (
        <div
          style={{
            marginTop: 16,
            padding: 16,
            borderRadius: 14,
            background: 'rgba(15,23,42,0.95)',
            border: '1px solid rgba(148,163,184,0.22)',
            color: '#e2e8f0'
          }}
        >
          <h3 style={{ marginTop: 0 }}>Session ended</h3>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={startNewSession}>Start new session</button>
          </div>
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Chat sessionId={sessionId} />
      </div>
    </div>
  )
    }
