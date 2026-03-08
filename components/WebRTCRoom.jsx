// components/WebRTCRoom.jsx
'use client'

import React, { useEffect, useRef, useState } from 'react'
import {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  onSnapshot,
  getDocs,
  deleteDoc
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { auth } from '../lib/firebase'
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth'

/*
  WebRTC 1-on-1 room with:
  - Sign-in guard to avoid Firestore permission errors on desktop
  - Mic + Camera toggles
  - Audio constraints (echoCancellation, noiseSuppression)
  - Attempt to set audio maxBitrate (best-effort)
  - Clear status & error messages

  Usage:
    <WebRTCRoom roomId="demo" displayName="Your name" />
*/

const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

export default function WebRTCRoom({ roomId = 'demo', displayName = 'Student' }) {
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef = useRef(null)
  const roomRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle, starting, waiting, connected, error, ended
  const [error, setError] = useState(null)
  const [isCreator, setIsCreator] = useState(false)
  const [user, setUser] = useState(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const localStreamRef = useRef(null)

  // auth listener: set user state
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u)
    })
    return () => unsub()
  }, [])

  // helper: sign in with Google popup
  const signIn = async () => {
    try {
      setStatus('signing-in')
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      setStatus('signed-in')
    } catch (e) {
      console.error('signIn error', e)
      setError('Sign-in failed: ' + (e.message || e))
      setStatus('error')
    }
  }

  // request local media with better audio constraints
  async function getLocalMedia() {
    // audio constraints with echo cancellation + noise suppression
    const constraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        sampleRate: 48000
      },
      video: true
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      // store
      localStreamRef.current = stream
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.muted = true
      }
      return stream
    } catch (e) {
      throw new Error('Could not access camera/microphone: ' + (e.message || e))
    }
  }

  // Toggle audio
  function toggleMute() {
    const s = localStreamRef.current
    if (!s) return
    const a = s.getAudioTracks()[0]
    if (!a) return
    a.enabled = !a.enabled
    setMuted(!a.enabled)
  }

  // Toggle camera
  function toggleCamera() {
    const s = localStreamRef.current
    if (!s) return
    const v = s.getVideoTracks()[0]
    if (!v) return
    v.enabled = !v.enabled
    setCameraOff(!v.enabled)
  }

  // start / join flow
  useEffect(() => {
    let mounted = true
    let unsubRoom = null
    let unsubCandidates = null

    async function start() {
      setError(null)
      setStatus('starting')

      try {
        // require authentication if your Firestore rules require it
        if (!auth.currentUser) {
          setError('You must sign in (Google) on this device to use the call. Click Sign in above.')
          setStatus('requires-auth')
          return
        }

        // get media
        const localStream = await getLocalMedia()
        if (!mounted) return

        // create RTCPeerConnection
        const pc = new RTCPeerConnection(ICE_CONFIG)
        pcRef.current = pc

        // attach local tracks
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream))

        // prepare remote stream
        const remoteStream = new MediaStream()
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
        pc.ontrack = event => {
          event.streams[0].getTracks().forEach(t => remoteStream.addTrack(t))
        }

        // add connection state logging
        pc.onconnectionstatechange = () => {
          console.log('pc connectionState', pc.connectionState)
        }

        // prepare firestore room refs
        const roomsCol = 'webrtcRooms'
        const rRef = doc(db, roomsCol, roomId)
        roomRef.current = rRef

        const rSnap = await getDoc(rRef)
        if (!rSnap.exists()) {
          // creator
          setIsCreator(true)

          // create doc
          await setDoc(rRef, { createdAt: new Date().toISOString(), createdBy: displayName || (auth.currentUser?.email || 'caller') })

          const callerCandidatesRef = collection(db, roomsCol, roomId, 'callerCandidates')
          const calleeCandidatesRef = collection(db, roomsCol, roomId, 'calleeCandidates')

          // onicecandidate -> callerCandidates
          pc.onicecandidate = async (event) => {
            if (event.candidate) {
              try { await addDoc(callerCandidatesRef, event.candidate.toJSON()) } catch (e) { console.warn('add caller candidate failed', e) }
            }
          }

          // create offer
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)

          // write offer
          await setDoc(rRef, { offer: { type: offer.type, sdp: offer.sdp }, createdAt: new Date().toISOString(), createdBy: displayName || (auth.currentUser?.email || 'caller') }, { merge: true })

          setStatus('waiting')

          // wait for answer
          unsubRoom = onSnapshot(rRef, async (snap) => {
            const data = snap.data()
            if (!data) return
            if (data.answer && pc && !pc.remoteDescription) {
              await pc.setRemoteDescription({ type: data.answer.type, sdp: data.answer.sdp })
              // connection established
              setStatus('connected')
              trySetAudioBitrate(pc)
            }
          })

          // listen callee candidates
          unsubCandidates = onSnapshot(collection(db, roomsCol, roomId, 'calleeCandidates'), (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
              if (change.type === 'added') {
                const cand = change.doc.data()
                try { await pc.addIceCandidate(cand) } catch (e) { console.warn('addIceCandidate (creator) failed', e) }
              }
            })
          })

        } else {
          // callee
          setIsCreator(false)

          const callerCandidatesCol = collection(db, roomsCol, roomId, 'callerCandidates')
          const calleeCandidatesCol = collection(db, roomsCol, roomId, 'calleeCandidates')

          // collect local ICE -> calleeCandidates
          pc.onicecandidate = async (event) => {
            if (event.candidate) {
              try { await addDoc(calleeCandidatesCol, event.candidate.toJSON()) } catch (e) { console.warn('add callee candidate failed', e) }
            }
          }

          // read offer
          const data = rSnap.data()
          const offer = data.offer
          if (!offer) throw new Error('Room has no offer (stale?). Try again.')

          await pc.setRemoteDescription({ type: offer.type, sdp: offer.sdp })

          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)

          await setDoc(rRef, { answer: { type: answer.type, sdp: answer.sdp }, answeredAt: new Date().toISOString() }, { merge: true })

          // listen for caller ICE
          unsubCandidates = onSnapshot(callerCandidatesCol, (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
              if (change.type === 'added') {
                const cand = change.doc.data()
                try { await pc.addIceCandidate(cand) } catch (e) { console.warn('addIceCandidate (callee) failed', e) }
              }
            })
          })

          setStatus('connected')
          trySetAudioBitrate(pc)
        }

      } catch (err) {
        console.error('start error', err)
        const msg = (err?.message || String(err))
        setError(msg)
        setStatus('error')
      }
    }

    // only start when user is authenticated (or your rules allow unauthenticated writes)
    if (auth.currentUser) {
      start()
    } else {
      // don't start automatically — prompt user to sign in
      setStatus('requires-auth')
      setError('Sign in required on this device to use voice/video (click Sign in).')
    }

    return () => {
      mounted = false
      try {
        if (pcRef.current) {
          pcRef.current.getSenders().forEach(s => { if (s.track) s.track.stop() })
          pcRef.current.close()
          pcRef.current = null
        }
      } catch (e) {}
      try { unsubRoom && unsubRoom(); unsubCandidates && unsubCandidates() } catch (e) {}
    }
  }, [roomId, displayName])

  // Attempt to set audio bitrate parameter (best-effort)
  async function trySetAudioBitrate(pc) {
    try {
      const sender = pc.getSenders().find(s => s.track && s.track.kind === 'audio')
      if (sender && sender.getParameters && sender.setParameters) {
        const params = sender.getParameters()
        params.encodings = params.encodings || [{}]
        // set a reasonable audio bitrate (64kbps); browsers may ignore
        params.encodings[0].maxBitrate = 64000
        await sender.setParameters(params)
        console.log('Audio bitrate param set (best-effort).')
      }
    } catch (e) {
      console.warn('Could not set audio bitrate', e)
    }
  }

  // Hang up & cleanup firestore (creator responsible)
  async function hangUp() {
    setStatus('ending')
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
      }
    } catch (e) {}

    try {
      if (roomRef.current) {
        const roomsCol = 'webrtcRooms'
        // delete callerCandidates
        const callerSnap = await getDocs(collection(db, roomsCol, roomId, 'callerCandidates'))
        for (const d of callerSnap.docs) await deleteDoc(doc(db, roomsCol, roomId, 'callerCandidates', d.id))
        // delete calleeCandidates
        const calleeSnap = await getDocs(collection(db, roomsCol, roomId, 'calleeCandidates'))
        for (const d of calleeSnap.docs) await deleteDoc(doc(db, roomsCol, roomId, 'calleeCandidates', d.id))
        // delete room doc
        await deleteDoc(roomRef.current)
      }
    } catch (e) {
      console.warn('cleanup firestore error', e)
    }

    try {
      if (pcRef.current) {
        pcRef.current.close()
        pcRef.current = null
      }
    } catch (e) {}

    setStatus('ended')
  }

  // UI: if user not signed in, show sign-in button
  const authArea = (
    <div style={{ marginBottom: 12 }}>
      {user ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ fontSize: 13 }}>Signed in as <strong>{user.displayName || user.email}</strong></div>
          <button onClick={() => auth.signOut()} style={{ padding: '6px 10px' }}>Sign out</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={signIn} style={{ padding: '8px 10px', background: '#0b74ff', color: '#fff', border: 0, borderRadius: 8 }}>
            Sign in with Google (required)
          </button>
          <div style={{ color: '#6b7280', fontSize: 13 }}>Sign in on this device to allow signaling (Firestore writes).</div>
        </div>
      )}
    </div>
  )

  return (
    <div style={{ padding: 12 }}>
      <div style={{ marginBottom: 10 }}>{authArea}</div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 160 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>You</div>
          <video ref={localVideoRef} autoPlay playsInline style={{ width: '100%', borderRadius: 8, background: '#000' }} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Partner</div>
          <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: 300, borderRadius: 8, background: '#000' }} />
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <div>Status: <strong>{status}</strong> {isCreator ? '(creator)' : '(joined)'}</div>
        {error && <div style={{ color: 'red', marginTop: 6 }}>{error}</div>}
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
        <button onClick={toggleMute} style={{ padding: '8px 10px' }}>{muted ? 'Unmute' : 'Mute'}</button>
        <button onClick={toggleCamera} style={{ padding: '8px 10px' }}>{cameraOff ? 'Camera On' : 'Camera Off'}</button>
        <button onClick={hangUp} style={{ padding: '8px 10px', background: '#ef4444', color: '#fff', border: 0 }}>Hang up</button>
      </div>

      <div style={{ marginTop: 10, color: '#6b7280', fontSize: 13 }}>
        Tips: if voice is low or cuts out - try a wired headset or allow the browser to use the mic (check OS microphone permissions). If users still have poor voice, your network may need a TURN server (we'll add one later if needed).
      </div>
    </div>
  )
        }
