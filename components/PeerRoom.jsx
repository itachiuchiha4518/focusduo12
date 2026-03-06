// components/PeerRoom.jsx
'use client'
import { useEffect, useRef, useState } from 'react'
import {
  db,
  collection,
  doc,
  setDoc,
  onSnapshot,
  addDoc,
  deleteDoc,
  getDoc,
  query,
  getDocs
} from '../lib/firebase'

// Minimal STUN config (works for most users)
const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

/*
  PeerRoom props:
    - sessionId: the session document id (string) — must be same for both peers
    - localName: display name
    - userUid: current user's uid
    - isInitiator: boolean — true for the user who "created" the session (you can set by participant order)
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

  // firestore paths
  const webrtcDocRef = doc(db, 'webrtc', sessionId) // main doc with offer/answer
  const callerCandidatesCol = collection(db, 'webrtc', sessionId, 'callerCandidates')
  const calleeCandidatesCol = collection(db, 'webrtc', sessionId, 'calleeCandidates')

  // helper: add ICE candidate to firestore subcollection
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

  // callers creates offer
  async function startAsCaller() {
    setStatus('connecting')
    try {
      const localStream = await createLocalStream()

      const pc = new RTCPeerConnection(ICE_CONFIG)
      pcRef.current = pc

      // add local tracks
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream))

      // on remote track
      pc.ontrack = (event) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0]
      }

      // collect local ICE and write to callerCandidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addCandidateToFirestore(callerCandidatesCol, event.candidate.toJSON())
        }
      }

      // create offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // write offer to Firestore
      await setDoc(webrtcDocRef, {
        offer: {
          type: offer.type,
          sdp: offer.sdp
        },
        initiator: userUid,
        createdAt: Date.now()
      })

      // listen for answer
      const unsubAnswer = onSnapshot(webrtcDocRef, async (snap) => {
        const data = snap.data()
        if (!data) return
        if (data.answer && pcRef.current && !pcRef.current.remoteDescription) {
          const answerDesc = { type: data.answer.type, sdp: data.answer.sdp }
          await pcRef.current.setRemoteDescription(answerDesc)
          setStatus('connected')
        }
      })

      // listen for callee ICE candidates and add them
      const unsubCalleeCandidates = onSnapshot(calleeCandidatesCol, (snap) => {
        snap.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const c = change.doc.data().candidate
            try { await pcRef.current.addIceCandidate(c) } catch (e) { console.warn('addIceCandidate caller', e) }
          }
        })
      })

      // cleanup: we return function to unsubscribe when leaving
      return () => {
        unsubAnswer()
        unsubCalleeCandidates()
      }
    } catch (e) {
      console.error('startAsCaller error', e)
      setErrorMsg(String(e.message || e))
      setStatus('error')
    }
  }

  // callee responds to offer and creates answer
  async function startAsCallee() {
    setStatus('connecting')
    try {
      const docSnap = await getDoc(webrtcDocRef)
      if (!docSnap.exists()) {
        throw new Error('Offer not found yet')
      }
      const data = docSnap.data()
      if (!data.offer) throw new Error('Offer missing in doc')

      const pc = new RTCPeerConnection(ICE_CONFIG)
      pcRef.current = pc

      const localStream = await createLocalStream()
      localStream.getTracks().forEach(track => pc.addTrack(track, localStream))
      if (localVideoRef.current) localVideoRef.current.srcObject = localStream

      // remote track
      pc.ontrack = (event) => {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = event.streams[0]
      }

      // collect local ICE -> calleeCandidates
      pc.onicecandidate = (event) => {
        if (event.candidate) {
          addCandidateToFirestore(calleeCandidatesCol, event.candidate.toJSON())
        }
      }

      // set remote description to offer
      const offer = { type: data.offer.type, sdp: data.offer.sdp }
      await pc.setRemoteDescription(offer)

      // create answer
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      // write answer into doc (merge)
      await setDoc(webrtcDocRef, { answer: { type: answer.type, sdp: answer.sdp }, responder: userUid }, { merge: true })

      // listen for caller ICE candidates
      const unsubCallerCandidates = onSnapshot(callerCandidatesCol, (snap) => {
        snap.docChanges().forEach(async (change) => {
          if (change.type === 'added') {
            const c = change.doc.data().candidate
            try { await pcRef.current.addIceCandidate(c) } catch (e) { console.warn('addIceCandidate callee', e) }
          }
        })
      })

      setStatus('connected')
      // return unsubscribe function
      return () => {
        unsubCallerCandidates()
      }
    } catch (e) {
      console.error('startAsCallee error', e)
      setErrorMsg(String(e.message || e))
      setStatus('error')
    }
  }

  async function cleanupFirestore() {
    // attempt to remove the webrtc doc and candidate docs (best effort)
    try {
      // delete candidate docs (callerCandidates & calleeCandidates)
      const cCols = [callerCandidatesCol, calleeCandidatesCol]
      for (const colRef of cCols) {
        const snap = await getDocs(colRef)
        for (const d of snap.docs) {
          try { await deleteDoc(doc(colRef.firestore, colRef.path + '/' + d.id)) } catch (e) { /* ignore */ }
        }
      }
      // delete main doc
      await deleteDoc(webrtcDocRef)
    } catch (e) {
      // ignore cleanup errors; not fatal
      console.warn('cleanupFirestore', e)
    }
  }

  // start flow when component mounts
  useEffect(() => {
    let unsubCleanup = null
    let unsubCleanup2 = null

    (async () => {
      setStatus('waiting')
      // If initiator: create offer and wait for answer
      if (isInitiator) {
        unsubCleanup = await startAsCaller()
      } else {
        // If callee: wait for the offer to appear (onSnapshot)
        const unsubOfferWatcher = onSnapshot(webrtcDocRef, async (snap) => {
          const data = snap.data()
          if (!data || !data.offer) return
          // if we haven't already created pc, start callee flow
          if (!pcRef.current) {
            unsubCleanup2 = await startAsCallee()
          }
        })
        // store for cleanup
        unsubCleanup = () => { unsubOfferWatcher(); if (unsubCleanup2) unsubCleanup2() }
      }
    })()

    // cleanup on unmount
    return () => {
      try {
        if (pcRef.current) {
          pcRef.current.getSenders().forEach(sender => {
            try { if (sender.track) sender.track.stop() } catch (e) {}
          })
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

  // UI controls
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
      await cleanupFirestore() // best-effort
      setStatus('initial')
    } catch (e) {
      console.warn('leaveCall', e)
    }
  }

  return (
    <div style={{padding:12}}>
      <div style={{display:'flex', gap:12, marginBottom:8}}>
        <div>
          <div style={{fontSize:12, color:'#444'}}>You</div>
          <video ref={localVideoRef} autoPlay muted playsInline style={{width:120, height:90, background:'#000', borderRadius:8}} />
        </div>
        <div>
          <div style={{fontSize:12, color:'#444'}}>Partner</div>
          <video ref={remoteVideoRef} autoPlay playsInline style={{width:240, height:180, background:'#000', borderRadius:8}} />
        </div>
      </div>

      <div style={{marginBottom:8}}>Status: <strong>{status}</strong> {errorMsg && <span style={{color:'red'}}> • {errorMsg}</span>}</div>

      <div style={{display:'flex', gap:8}}>
        <button onClick={toggleMute} style={{padding:'8px 10px'}}>{muted ? 'Unmute' : 'Mute'}</button>
        <button onClick={toggleCamera} style={{padding:'8px 10px'}}>{cameraOff ? 'Camera On' : 'Camera Off'}</button>
        <button onClick={leaveCall} style={{padding:'8px 10px', background:'#ef4444', color:'#fff'}}>Leave</button>
      </div>
    </div>
  )
        }
