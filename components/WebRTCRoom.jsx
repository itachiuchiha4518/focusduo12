'use client'

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

const DEFAULT_PROFILE = {
  planId: 'free',
  planLabel: 'Free',
  planStatus: 'active',
  accountStatus: 'active',
  freeOneOnOneRemaining: 10,
  freeGroupRemaining: 10,
  sessionsCompleted: 0,
  streakDays: 0
}

function getEffectivePlanId(profile) {
  if (!profile) return 'free'
  if (profile.accountStatus === 'banned') return 'banned'
  if (profile.planStatus === 'active' && profile.planId) return profile.planId
  return 'free'
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
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
  const seenCandidatesRef = useRef(new Set())

  const timerRef = useRef(null)
  const reconnectLockRef = useRef(false)
  const reconnectAttemptsRef = useRef(0)
  const autoJoinAttemptRef = useRef(false)
  const currentUidRef = useRef(null)

  const lastOfferSdpRef = useRef('')
  const lastAnswerSdpRef = useRef('')
  const cleanupLockRef = useRef(false)

  const [sessionDoc, setSessionDoc] = useState(sessionProp || null)
  const [profile, setProfile] = useState(null)
  const [status, setStatus] = useState('idle')
  const [joined, setJoined] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [cameraFacing, setCameraFacing] = useState('user')
  const [sessionEnded, setSessionEnded] = useState(false)
  const [showEndCard, setShowEndCard] = useState(false)
  const [tick, setTick] = useState(Date.now())
  const [creditConsumed, setCreditConsumed] = useState(false)
  const [joinBusy, setJoinBusy] = useState(false)

  const partner = useMemo(() => {
    const selfUid = currentUidRef.current
    const parts = sessionDoc?.participants || []
    return parts.find(p => p.uid !== selfUid) || null
  }, [sessionDoc])

  const planId = getEffectivePlanId(profile)
  const isFree = planId === 'free'
  const timerState = isFree ? getFreeTimerState(sessionDoc) : null

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

      if (!u) {
        setProfile(null)
        return
      }

      try {
        const ref = doc(db, 'users', u.uid)
        const snap = await getDoc(ref)

        if (!snap.exists()) {
          const base = {
            ...DEFAULT_PROFILE,
            uid: u.uid,
            name: u.displayName || '',
            email: u.email || '',
            updatedAt: serverTimestamp()
          }
          await setDoc(ref, base, { merge: true })
          setProfile(base)
          return
        }

        const data = { ...DEFAULT_PROFILE, id: snap.id, ...snap.data() }
        setProfile(data)
      } catch (e) {
        console.warn(e)
      }
    })

    const ref = doc(db, 'sessions', sessionId)
    const unsubSession = onSnapshot(ref, snap => {
      if (!snap.exists()) return
      const data = { id: snap.id, ...snap.data() }
      setSessionDoc(data)

      if (data.status === 'finished') {
        setSessionEnded(true)
        setShowEndCard(true)
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

  useEffect(() => {
    if (!auth.currentUser?.uid) return
    if (!sessionId) return

    const billingRef = doc(db, 'sessions', sessionId, 'billing', auth.currentUser.uid)
    const unsubBilling = onSnapshot(billingRef, snap => {
      setCreditConsumed(Boolean(snap.exists() && snap.data()?.consumed))
    })

    return () => unsubBilling()
  }, [sessionId])

  useEffect(() => {
    const uid = currentUidRef.current
    if (!uid || !sessionDoc || joined || sessionEnded || joinBusy) return
    if (sessionDoc.status !== 'active' && sessionDoc.status !== 'matching') return

    const participants = sessionDoc.participants || []
    const isParticipant =
      participants.some(p => p.uid === uid) ||
      sessionDoc.initiatorUid === uid

    if (!isParticipant) return
    if (autoJoinAttemptRef.current) return

    autoJoinAttemptRef.current = true
    const t = setTimeout(() => {
      joinMeeting().catch(() => {
        autoJoinAttemptRef.current = false
      })
    }, 450)

    return () => clearTimeout(t)
  }, [sessionDoc, joined, sessionEnded, joinBusy])

  useEffect(() => {
    if (!sessionDoc || !isFree || creditConsumed) return
    if (!timerState?.gracePassed) return

    consumeFreeCreditOnce({
      db,
      sessionId,
      uid: auth.currentUser?.uid,
      mode: sessionDoc.mode,
      userRef: doc(db, 'users', auth.currentUser.uid)
    })
      .then(result => {
        if (result?.consumed) {
          setCreditConsumed(true)
        }
      })
      .catch(err => {
        console.warn('credit deduction failed', err)
      })
  }, [sessionDoc, isFree, timerState?.gracePassed, creditConsumed, sessionId])

  useEffect(() => {
    if (!sessionDoc || !isFree) return
    if (!timerState?.finished) return
    if (sessionDoc.status === 'finished') return

    endSession(true)
  }, [sessionDoc, isFree, timerState?.finished])

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

      if (!data.startedAt) {
        patch.startedAt = serverTimestamp()
      }

      if (data.status !== 'active') {
        patch.status = 'active'
      }

      if (Object.keys(patch).length > 0) {
        tx.set(ref, patch, { merge: true })
      }
    })
  }

  async function publishCandidate(candidate) {
    await addDoc(collection(db, 'sessions', sessionId, 'candidates'), {
      sender: currentUidRef.current || null,
      candidate: candidate.toJSON(),
      ts: Date.now()
    })
  }

  async function createLocalStream(facingMode = 'user') {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: { ideal: true },
          noiseSuppression: { ideal: true },
          autoGainControl: { ideal: true },
          channelCount: 1,
          sampleRate: 48000
        },
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 1280, min: 960 },
          height: { ideal: 720, min: 540 },
          frameRate: { ideal: 24, max: 30 }
        }
      })
    } catch {
      return navigator.mediaDevices.getUserMedia({
        audio: true,
        video: {
          facingMode: { ideal: facingMode },
          width: { ideal: 960 },
          height: { ideal: 540 },
          frameRate: { ideal: 24, max: 24 }
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

  async function boostSenderQuality(pc) {
    try {
      const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video')
      if (videoSender?.track) {
        const params = videoSender.getParameters?.() || {}
        params.degradationPreference = 'maintain-resolution'
        params.encodings = [
          {
            maxBitrate: 1800000,
            maxFramerate: 24
          }
        ]
        await videoSender.setParameters(params)
      }

      const audioSender = pc.getSenders().find(s => s.track && s.track.kind === 'audio')
      if (audioSender?.track) {
        const params = audioSender.getParameters?.() || {}
        params.encodings = [
          {
            maxBitrate: 64000
          }
        ]
        await audioSender.setParameters(params).catch(() => {})
      }
    } catch (e) {
      console.warn('quality boost failed', e)
    }
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
    await boostSenderQuality(pc)
  }

  async function setupSignaling(pc, selfUid) {
    const initiatorUid = sessionDoc?.initiatorUid || sessionDoc?.participants?.[0]?.uid || selfUid
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
      answerUnsubRef.current = onSnapshot(answerRef, async snap => {
        if (!snap.exists()) return
        const data = snap.data()
        if (!data?.sdp) return
        if (data.sdp === lastAnswerSdpRef.current) return

        try {
          await pc.setRemoteDescription({ type: 'answer', sdp: data.sdp })
          lastAnswerSdpRef.current = data.sdp
        } catch {}
      })
    } else {
      offerUnsubRef.current = onSnapshot(offerRef, async snap => {
        if (!snap.exists()) return
        const data = snap.data()
        if (!data?.sdp) return
        if (data.sdp === lastOfferSdpRef.current) return

        try {
          await pc.setRemoteDescription({ type: 'offer', sdp: data.sdp })
          lastOfferSdpRef.current = data.sdp

          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          await setDoc(
            answerRef,
            {
              type: answer.type,
              sdp: answer.sdp,
              sender: selfUid,
              createdAt: serverTimestamp()
            },
            { merge: true }
          )
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
      await pc.setLocalDescription(offer)

      lastOfferSdpRef.current = offer.sdp || ''
      await setDoc(
        doc(db, 'sessions', sessionId, 'signaling', 'offer'),
        {
          type: offer.type,
          sdp: offer.sdp,
          sender: currentUidRef.current || null,
          iceRestart: true,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      )
    } catch (e) {
      console.warn('restart failed', e)
    } finally {
      setTimeout(() => {
        reconnectLockRef.current = false
      }, 3000)
    }
  }

  async function joinMeeting() {
    if (!auth.currentUser) {
      alert('Sign in first')
      return
    }

    if (joined) return
    if (sessionDoc?.status === 'finished') {
      setShowEndCard(true)
      return
    }

    setJoinBusy(true)
    try {
      setStatus('getting-media')
      await ensureSessionStartedAt()

      const stream = await createLocalStream(cameraFacing)
      localStreamRef.current = stream

      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) videoTrack.contentHint = 'detail'

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
      await boostSenderQuality(pc)

      pc.onicecandidate = ev => {
        if (ev.candidate) publishCandidate(ev.candidate)
      }

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
          if (reconnectAttemptsRef.current < 3) {
            reconnectAttemptsRef.current += 1
            restartConnection(state).catch(() => {})
          } else {
            setStatus(state)
          }
        }
      }

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState
        if (state === 'connected') {
          reconnectLockRef.current = false
          reconnectAttemptsRef.current = 0
          setStatus('connected')
        }
        if (state === 'failed' || state === 'disconnected') {
          setStatus(`reconnecting (${state})`)
        }
      }

      await setupSignaling(pc, auth.currentUser.uid)

      const selfUid = auth.currentUser.uid
      const initiatorUid = sessionDoc?.initiatorUid || sessionDoc?.participants?.[0]?.uid || selfUid
      const amInitiator = initiatorUid === selfUid

      if (amInitiator) {
        const offer = await pc.createOffer()
        await pc.setLocalDescription(offer)
        lastOfferSdpRef.current = offer.sdp || ''
        await setDoc(
          doc(db, 'sessions', sessionId, 'signaling', 'offer'),
          {
            type: offer.type,
            sdp: offer.sdp,
            sender: selfUid,
            createdAt: serverTimestamp()
          },
          { merge: true }
        )
      }

      setJoined(true)
      setSessionEnded(false)
      setShowEndCard(false)
      setStatus('connected')
      autoJoinAttemptRef.current = true
    } catch (e) {
      console.error(e)
      autoJoinAttemptRef.current = false
      alert('Unable to start video. Check camera and mic permissions.')
      setStatus('error')
    } finally {
      setJoinBusy(false)
    }
        }function toggleMic() {
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
        video: {
          facingMode: { ideal: nextFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
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
        status: 'finished',
        endedAt: serverTimestamp(),
        endedByTimer: !!fromTimer
      })
    } catch (e) {
      console.warn(e)
    }

    setSessionEnded(true)
    setShowEndCard(true)
    await cleanup()
  }

  async function leaveSession() {
    await endSession(false)
  }

  const sessionMeta = {
    exam: sessionDoc?.exam || null,
    subject: sessionDoc?.subject || null,
    mode: sessionDoc?.mode || null
  }

  const elapsed = sessionDoc?.startedAt?.toMillis
    ? Math.floor((tick - sessionDoc.startedAt.toMillis()) / 1000)
    : 0

  const setupLeft = isFree ? Math.max(0, 120 - elapsed) : 0
  const sessionLeft = isFree ? Math.max(0, 1800 - elapsed) : 0

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
                  maxWidth: 320,
                  height: 260,
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
                  minHeight: 260,
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
              <button onClick={joinMeeting} disabled={joinBusy}>Join meeting</button>
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

          <div style={{
            marginTop: 14,
            padding: 14,
            borderRadius: 14,
            background: 'rgba(15,23,42,0.95)',
            border: '1px solid rgba(148,163,184,0.18)',
            color: '#e2e8f0'
          }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>
              {isFree ? 'Free session timer' : 'Unlimited session timer'}
            </div>

            {isFree ? (
              <>
                <div style={{ marginBottom: 6 }}>
                  <strong>2-minute setup:</strong> {setupLeft}s
                </div>
                <div style={{ color: '#cbd5e1', marginBottom: 10 }}>
                  Choose the chapter now. Leave within 2 minutes and your credit will not be used.
                </div>

                <div style={{ marginBottom: 6 }}>
                  <strong>30-minute session:</strong> {sessionLeft}s
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
