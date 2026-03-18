'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { doc, getDoc, updateDoc, collection, addDoc, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import Chat from './Chat'
import EndCard from './EndCard'
import { useRouter } from 'next/navigation'

export default function WebRTCRoom({ sessionId, session: sessionProp }) {
  const router = useRouter()
  const localRef = useRef(null)
  const remoteRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const offerUnsubRef = useRef(null)
  const answerUnsubRef = useRef(null)
  const candidatesUnsubRef = useRef(null)
  const [session, setSession] = useState(sessionProp || null)
  const [status, setStatus] = useState('idle')
  const [joined, setJoined] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [ended, setEnded] = useState(false)

  const partner = useMemo(() => {
    const self = auth.currentUser?.uid
    const parts = session?.participants || []
    return parts.find(p => p.uid !== self) || null
  }, [session])

  useEffect(() => {
    let mounted = true

    async function loadSession() {
      const snap = await getDoc(doc(db, 'sessions', sessionId))
      if (!mounted) return
      if (snap.exists()) {
        setSession({ id: snap.id, ...snap.data() })
      }
    }

    if (!session) loadSession()

    return () => {
      mounted = false
      cleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  async function cleanup() {
    try {
      offerUnsubRef.current?.()
      answerUnsubRef.current?.()
      candidatesUnsubRef.current?.()
    } catch {}

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
  }

  async function publishCandidate(candidate) {
    await addDoc(collection(db, 'sessions', sessionId, 'candidates'), {
      sender: auth.currentUser?.uid || null,
      candidate: candidate.toJSON(),
      ts: Date.now()
    })
  }

  async function startCall() {
    if (!auth.currentUser) return alert('Sign in first')

    setStatus('getting-media')
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: true
    })

    localStreamRef.current = stream
    if (localRef.current) {
      localRef.current.srcObject = stream
      localRef.current.muted = true
      await localRef.current.play().catch(() => {})
    }

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })
    pcRef.current = pc

    const remoteStream = new MediaStream()
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream

    pc.ontrack = event => {
      event.streams[0]?.getTracks().forEach(track => remoteStream.addTrack(track))
      setTimeout(() => {
        remoteRef.current?.play().catch(() => {})
      }, 50)
    }

    stream.getTracks().forEach(track => pc.addTrack(track, stream))

    pc.onicecandidate = ev => {
      if (ev.candidate) publishCandidate(ev.candidate)
    }

    const sRef = doc(db, 'sessions', sessionId)
    const snap = await getDoc(sRef)
    const data = snap.exists() ? snap.data() : {}
    const myUid = auth.currentUser.uid
    const initiatorUid = data?.initiatorUid || data?.participants?.[0]?.uid
    const amInitiator = initiatorUid === myUid

    const offerRef = doc(db, 'sessions', sessionId, 'signaling', 'offer')
    const answerRef = doc(db, 'sessions', sessionId, 'signaling', 'answer')
    const candCol = collection(db, 'sessions', sessionId, 'candidates')

    candidatesUnsubRef.current = onSnapshot(candCol, snap2 => {
      snap2.docChanges().forEach(async ch => {
        if (ch.type !== 'added') return
        const d = ch.doc.data()
        if (!d || d.sender === myUid) return
        try {
          await pc.addIceCandidate(new RTCIceCandidate(d.candidate))
        } catch {}
      })
    })

    if (amInitiator) {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await updateDoc(sRef, { status: 'active' })
      await addDoc(collection(db, 'sessions', sessionId, 'signaling'), {
        type: 'offer',
        sdp: offer.sdp,
        sender: myUid,
        createdAt: serverTimestamp()
      })
      offerUnsubRef.current = onSnapshot(offerRef, () => {})
      answerUnsubRef.current = onSnapshot(answerRef, async snap2 => {
        if (!snap2.exists()) return
        const d = snap2.data()
        if (!d?.sdp) return
        try {
          await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp })
        } catch {}
      })
    } else {
      offerUnsubRef.current = onSnapshot(offerRef, async snap2 => {
        if (!snap2.exists()) return
        const d = snap2.data()
        if (!d?.sdp) return
        try {
          await pc.setRemoteDescription({ type: 'offer', sdp: d.sdp })
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          await addDoc(collection(db, 'sessions', sessionId, 'signaling'), {
            type: 'answer',
            sdp: answer.sdp,
            sender: myUid,
            createdAt: serverTimestamp()
          })
        } catch {}
      })
    }

    setJoined(true)
    setStatus('joined')
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

  async function endSession() {
    try {
      await updateDoc(doc(db, 'sessions', sessionId), {
        status: 'finished',
        endedAt: serverTimestamp()
      })
    } catch {}
    setEnded(true)
    setStatus('finished')
    await cleanup()
  }

  async function startNewSession() {
    router.push('/join')
  }

  const sessionEnded = ended || session?.status === 'finished'

  return (
    <div style={{ padding: 14 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ minWidth: 180 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>You</div>
          <video
            ref={localRef}
            autoPlay
            playsInline
            muted
            style={{ width: '100%', maxWidth: 280, height: 240, background: '#000', borderRadius: 10 }}
          />
        </div>

        <div style={{ minWidth: 180, flex: 1 }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Partner{partner?.name ? ` • ${partner.name}` : ''}</div>
          <video
            ref={remoteRef}
            autoPlay
            playsInline
            style={{ width: '100%', minHeight: 240, background: '#000', borderRadius: 10 }}
          />
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button onClick={toggleMic}>{micOn ? 'Mic Off' : 'Mic On'}</button>
        <button onClick={toggleCam}>{camOn ? 'Cam Off' : 'Cam On'}</button>
        {!joined ? (
          <button onClick={startCall}>Join meeting</button>
        ) : (
          <button onClick={cleanup}>Leave</button>
        )}
        <button onClick={endSession} style={{ background: '#ef4444', color: '#fff' }}>
          End session
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <strong>Status:</strong> {status}
      </div>

      <div style={{ marginTop: 16 }}>
        <Chat sessionId={sessionId} />
      </div>

      {sessionEnded && (
        <div style={{ marginTop: 18 }}>
          <EndCard
            sessionId={sessionId}
            partnerUid={partner?.uid || null}
            partnerName={partner?.name || 'Partner'}
            onStartNew={startNewSession}
          />
        </div>
      )}
    </div>
  )
}
