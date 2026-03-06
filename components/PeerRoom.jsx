// components/PeerRoom.jsx
'use client'

import { useEffect, useRef, useState } from 'react'
import {
  db,
  collection,
  doc,
  addDoc,
  deleteDoc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc
} from '../lib/firebase' // exact import path for components folder

// STUN config
const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

/*
  PeerRoom props:
    - sessionId: the session document id (string)
    - localName: display name
    - userUid: current user's uid
    - isInitiator: boolean — true for the user who created the session
*/

export default function PeerRoom({ sessionId, localName, userUid, isInitiator }) {
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)

  const [status, setStatus] = useState('initial') // initial, waiting, connecting, connected, error
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  // Firestore paths
  const webrtcDocRef = doc(db, 'webrtc', sessionId)
  const callerCandidatesCol = collection(db, 'webrtc', sessionId, 'callerCandidates')
  const calleeCandidatesCol = collection(db, 'webrtc', sessionId, 'calleeCandidates')

  async function addCandidateToFirestore(colRef, candidate) {
    try {
      if (!candidate) return
      await addDoc(colRef, { candidate })
    } catch (e) {
      console.warn('addCandidate failed', e)
    }
  }

  async function createLocalStream() {
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      localStreamRef.current = s
      if (localVideoRef.current) localVideoRef.current.srcObject = s
      return s
    } catch (e) {
      throw new Error('Could not get camera/mic: ' + (e.message || e))
    }
  }

  async function startAsCaller() {
    setStatus('connecting')
    try {
      const localStream = await createLocalStream()

      const pc = new RTCPeerConnection(ICE_CONFIG)
      pcRef.current = pc

      localStream.getTracks().forEach(track => pc.addTrack(track, localStream))

      pc.ontrack = event => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0]
      }

      pc.onicecandidate = event => {
        if (event.candidate) {
          addCandidateToFirestore(callerCandidatesCol, event.candidate.toJSON())
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // write offer
      await setDoc(webrtcDocRef, {
        offer: { type: offer.type, sdp: offer.sdp },
        initiator: userUid,
        createdAt: Date.now()
      })

      // listen for answer
      const unsubAnswer = onSnapshot(webrtcDocRef, async snap => {
        const data = snap.data()
        if (data && data.answer && pcRef.current && !pcRef.current.remoteDescription) {
          const answerDesc = { type: data.answer.type, sdp: data.answer.sdp }
          await pcRef.current.setRemoteDescription(answerDesc)
          setStatus('connected')
        }
      })

      // listen for callee candidates
      const unsubCalleeCandidates = onSnapshot(calleeCandidatesCol, snap => {
        snap.docChanges().forEach(async change => {
          if (change.type === 'added') {
            const c = change.doc.data().candidate
            try { await pcRef.current.addIceCandidate(c) } catch (e) { console.warn('addIceCandidate caller', e) }
          }
        })
      })

      return () => { unsubAnswer(); unsubCalleeCandidates() }
    } catch (e) {
      console.error('startAsCaller error', e)
      setErrorMsg(String(e.message || e))
      setStatus('error')
    }
  }

  async function startAsCallee() {
    setStatus('connecting')
    try {
      const docSnap = await getDoc(webrtcDocRef)
      if (!docSnap.exists()) throw new Error('Offer not found yet')
      const data = docSnap.data()
      if (!data.offer) throw new Error('Offer missing')

      const pc = new RTCPeerConnection(ICE_CONFIG)
      pcRef.current = pc

      const localStream = await createLocalStream()
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream))
      if (localVideoRef.current) localVideoRef.current.srcObject = localStream

      pc.ontrack = event => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0]
      }

      pc.onicecandidate = event => {
        if (event.candidate) addCandidateToFirestore(calleeCandidatesCol, event.candidate.toJSON())
      }

      const offer = { type: data.offer.type, sdp: data.offer.sdp }
      await pc.setRemoteDescription(offer)

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      await setDoc(webrtcDocRef, { answer: { type: answer.type, sdp: answer.sdp }, responder: userUid }, { merge: true })

      const unsubCallerCandidates = onSnapshot(callerCandidatesCol, snap => {
        snap.docChanges().forEach(async change => {
          if (change.type === 'added') {
            const c = change.doc.data().candidate
            try { await pcRef.current.addIceCandidate(c) } catch (e) { console.warn('addIceCandidate callee', e) }
          }
        })
      })

      setStatus('connected')
      return () => { unsubCallerCandidates() }
    } catch (e) {
      console.error('startAsCallee error', e)
      setErrorMsg(String(e.message || e))
      setStatus('error')
    }
  }

  async function cleanupFirestore() {
    try {
      // delete candidates and main doc - best effort
      const callerDocs = await getDocs(callerCandidatesCol)
      for (const d of callerDocs.docs) await deleteDoc(doc(db, callerCandidatesCol.path + '/' + d.id))

      const calleeDocs = await getDocs(calleeCandidatesCol)
      for (const d of calleeDocs.docs) await deleteDoc(doc(db, calleeCandidatesCol.path + '/' + d.id))

      await deleteDoc(webrtcDocRef)
    } catch (e) {
      console.warn('cleanupFirestore', e)
    }
  }

  useEffect(() => {
    let unsubCleanup = null
    let unsubCleanup2 = null

    (async () => {
      setStatus('waiting')
      if (isInitiator) {
        unsubCleanup = await startAsCaller()
      } else {
        // watch the doc for an offer then run callee flow
        const unsubOfferWatcher = onSnapshot(webrtcDocRef, async snap => {
          const data = snap.data()
          if (!data || !data.offer) return
          if (!pcRef.current) {
            unsubCleanup2 = await startAsCallee()
          }
        })
        unsubCleanup = () => { unsubOfferWatcher(); if (unsubCleanup2) unsubCleanup2() }
      }
    })()

    return () => {
      try {
        if (pcRef.current) {
          pcRef.current.getSenders().forEach(sender => { try { if (sender.track) sender.track.stop() } catch (e) {} })
          pcRef.current.close()
          pcRef.current = null
        }
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(t => { try { t.stop() } catch (e) {} })
          localStreamRef.current = null
        }
        if (unsubCleanup) unsubCleanup()
      } catch (e) { console.warn('peer cleanup error', e) }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleMute = () => {
    if (!localStreamRef.current) return
    const audioTrack = localStreamRef.current.getAudioTracks()[0]
    if (audioTrack) {
      audioTrack.enabled = !audioTrack.enabled
      setMuted(!audioTrack.enabled)
    }
  }
  const toggleCamera = () => {
    if (!localStreamRef.current) return
    const videoTrack = localStreamRef.current.getVideoTracks()[0]
    if (videoTrack) {
      videoTrack.enabled = !videoTrack.enabled
      setCameraOff(!videoTrack.enabled)
    }
  }

  const leaveCall = async () => {
    try {
      if (pcRef.current) pcRef.current.close()
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => { try { t.stop() } catch (e) {} })
      }
      await cleanupFirestore()
      setStatus('initial')
    } catch (e) {
      console.warn('leaveCall', e)
    }
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
        <div>
          <div style={{ fontSize: 12, color: '#444' }}>You</div>
          <video ref={localVideoRef} autoPlay muted playsInline style={{ width: 120, height: 90, background: '#000', borderRadius: 8 }} />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#444' }}>Partner</div>
          <video ref={remoteVideoRef} autoPlay playsInline style={{ width: 240, height: 180, background: '#000', borderRadius: 8 }} />
        </div>
      </div>

      <div style={{ marginBottom: 8 }}>Status: <strong>{status}</strong> {errorMsg && <span style={{ color: 'red' }}> • {errorMsg}</span>}</div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={toggleMute} style={{ padding: '8px 10px' }}>{muted ? 'Unmute' : 'Mute'}</button>
        <button onClick={toggleCamera} style={{ padding: '8px 10px' }}>{cameraOff ? 'Camera On' : 'Camera Off'}</button>
        <button onClick={leaveCall} style={{ padding: '8px 10px', background: '#ef4444', color: '#fff' }}>Leave</button>
      </div>
    </div>
  )
            }
