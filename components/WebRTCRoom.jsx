'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDoc,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import Chat from './Chat'
import EndCard from './EndCard'
import { ensureUserProfile, getEffectivePlanId } from '../lib/subscriptions'

export default function WebRTCRoom({ sessionId, session: sessionProp }) {
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const remoteStreamRef = useRef(null)

  const offerUnsubRef = useRef(null)
  const answerUnsubRef = useRef(null)
  const candidatesUnsubRef = useRef(null)
  const seenCandidatesRef = useRef(new Set())
  const timerRef = useRef(null)
  const graceTimerRef = useRef(null)
  const autoEndTimerRef = useRef(null)

  const [session, setSession] = useState(sessionProp || null)
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [joined, setJoined] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [cameraFacing, setCameraFacing] = useState('user')
  const [sessionEnded, setSessionEnded] = useState(false)
  const [showEndCard, setShowEndCard] = useState(false)
  const [tick, setTick] = useState(Date.now())
  const [joinedAt, setJoinedAt] = useState(0)
  const [creditConsumed, setCreditConsumed] = useState(false)

  const partner = useMemo(() => {
    const selfUid = auth.currentUser?.uid
    const parts = session?.participants || []
    return parts.find(p => p.uid !== selfUid) || null
  }, [session])

  const isFree = getEffectivePlanId(profile) === 'free'
  const elapsed = joinedAt ? Math.floor((tick - joinedAt) / 1000) : 0
  const graceLeft = Math.max(0, 120 - elapsed)
  const freeLeft = Math.max(0, 1800 - elapsed)

  useEffect(() => {
    let mounted = true

    const unsubAuth = auth.onAuthStateChanged(async u => {
      if (!u) {
        if (mounted) setProfile(null)
        return
      }
      try {
        const p = await ensureUserProfile(u)
        if (mounted) setProfile(p)
      } catch (e) {
        console.warn(e)
      }
    })

    const ref = doc(db, 'sessions', sessionId)
    const unsub = onSnapshot(ref, snap => {
      if (!snap.exists()) return
      const data = { id: snap.id, ...snap.data() }
      setSession(data)
      if (data.status === 'finished') {
        setSessionEnded(true)
        setShowEndCard(true)
      }
    })

    timerRef.current = setInterval(() => setTick(Date.now()), 1000)

    return () => {
      mounted = false
      unsubAuth()
      unsub()
      if (timerRef.current) clearInterval(timerRef.current)
      cleanup()
    }
  }, [sessionId])

  async function cleanup() {
    try { offerUnsubRef.current?.() } catch {}
    try { answerUnsubRef.current?.() } catch {}
    try { candidatesUnsubRef.current?.() } catch {}

    offerUnsubRef.current = null
    answerUnsubRef.current = null
    candidatesUnsubRef.current = null
    seenCandidatesRef.current = new Set()

    if (graceTimerRef.current) clearTimeout(graceTimerRef.current)
    if (autoEndTimerRef.current) clearTimeout(autoEndTimerRef.current)

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

  async function replaceCameraTrack(newTrack) {
    const pc = pcRef.current
    if (!pc || !newTrack) return

    const sender = pc.getSenders().find(s => s.track && s.track.kind === 'video')
    if (sender) await sender.replaceTrack(newTrack)

    const audioTracks = localStreamRef.current?.getAudioTracks?.() || []
    const videoTracks = localStreamRef.current?.getVideoTracks?.() || []
    videoTracks.forEach(t => t.stop())

    const newStream = new MediaStream([...audioTracks, newTrack])
    localStreamRef.current = newStream
    await attachLocalPreview(newStream)
  }

  async function maybeConsumeCredit() {
    if (!isFree || creditConsumed || !auth.currentUser) return
    if (elapsed < 120) return

    try {
      const billingRef = doc(db, 'sessions', sessionId, 'billing', auth.currentUser.uid)
      await setDoc(billingRef, {
        uid: auth.currentUser.uid,
        sessionId,
        charged: true,
        createdAt: serverTimestamp()
      }, { merge: true })
      setCreditConsumed(true)
    } catch (e) {
      console.warn(e)
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
        const [peerStream] = event.streams
        if (peerStream) {
          peerStream.getTracks().forEach(track => {
            if (!remoteStream.getTracks().some(t => t.id === track.id)) {
              remoteStream.addTrack(track)
            }
          })
        }
        setTimeout(() => remoteVideoRef.current?.play().catch(() => {}), 50)
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
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        await setDoc(offerRef, {
          type: offer.type,
          sdp: offer.sdp,
          sender: selfUid,
          createdAt: serverTimestamp()
        }, { merge: true })

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
            }, { merge: true })
          } catch {}
        })
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'connected') setStatus('connected')
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') setStatus(pc.connectionState)
      }

      setJoined(true)
      setJoinedAt(Date.now())
      setTick(Date.now())
      setShowEndCard(false)

      if (isFree) {
        graceTimerRef.current = setTimeout(() => {
          maybeConsumeCredit()
        }, 120000)

        autoEndTimerRef.current = setTimeout(async () => {
          await endSession(true)
        }, 1800000)
      }
    } catch (e) {
      console.error(e)
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
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: nextFacing } },
        audio: false
      })
      const track = stream.getVideoTracks()[0]
      if (!track) return
      await replaceCameraTrack(track)
      setCameraFacing(nextFacing)
    } catch (e) {
      console.error(e)
      alert('Could not switch camera on this device.')
    }
  }

  async function leaveSession() {
    setShowEndCard(true)
    await maybeConsumeCredit()
    await cleanup()
  }

  async function endSession(fromTimer = false) {
    await maybeConsumeCredit()
    try {
      await setDoc(doc(db, 'sessions', sessionId), {
        status: 'finished',
        endedAt: serverTimestamp(),
        endedByTimer: !!fromTimer
      }, { merge: true })
    } catch {}
    setSessionEnded(true)
    setShowEndCard(true)
    await cleanup()
  }

  const sessionMeta = {
    exam: session?.exam || null,
    subject: session?.subject || null,
    mode: session?.mode || null
  }

  return (
    <div style={{ padding: 14 }}>
      {!showEndCard ? (
        <>
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
            <button onClick={() => endSession(false)} style={{ background: '#ef4444', color: '#fff' }}>
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
                  <strong>2-minute setup:</strong> {Math.max(0, graceLeft)}s
                </div>
                <div style={{ color: '#cbd5e1', marginBottom: 10 }}>
                  Choose the chapter now. Leave within 2 minutes and your credit will not be used.
                </div>

                <div style={{ marginBottom: 6 }}>
                  <strong>30-minute session:</strong> {Math.max(0, freeLeft)}s
                </div>
                <div style={{ color: '#cbd5e1' }}>
                  When this timer ends, the session finishes automatically.
                </div>
              </>
            ) : (
              <div style={{ color: '#cbd5e1' }}>Unlimited time. Stay as long as you want.</div>
            )}
          </div>

          <div style={{ marginTop: 16 }}>
            <Chat sessionId={sessionId} />
          </div>
        </>
      ) : (
        <EndCard
          sessionId={sessionId}
          partnerUid={partner?.uid || null}
          partnerName={partner?.name || 'Partner'}
          sessionMeta={sessionMeta}
          onStartNew={() => {
            window.location.href = '/join'
          }}
        />
      )}

      {sessionEnded && !showEndCard ? (
        <EndCard
          sessionId={sessionId}
          partnerUid={partner?.uid || null}
          partnerName={partner?.name || 'Partner'}
          sessionMeta={sessionMeta}
          onStartNew={() => {
            window.location.href = '/join'
          }}
        />
      ) : null}
    </div>
  )
        }
