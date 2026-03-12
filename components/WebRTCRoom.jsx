'use client'
// components/WebRTCRoom.jsx
import { useEffect, useRef, useState } from 'react'
import { db, auth } from '../lib/firebase'
import {
  doc,
  collection,
  addDoc,
  onSnapshot,
  setDoc,
  getDoc,
  query,
  orderBy
} from 'firebase/firestore'

/*
 WebRTCRoom behavior:
 - Expects: props { sessionId, session, autoJoin }
 - If autoJoin === true (user clicked Start session), this component will immediately request getUserMedia
   and start the signaling flow. That user gesture allows autoplay of remote audio in modern browsers.
 - Handles mic/cam toggles robustly.
 - Attaches local tracks, listens for remote tracks.
 - Writes/reads ICE candidates to sessions/{id}/candidates.
 - Uses sessions/{id}/signaling/offer and /answer docs for SDP.
 - Provides clear status & logs for debugging.
*/

export default function WebRTCRoom({ sessionId, session, autoJoin = false }) {
  const localVideo = useRef(null)
  const remoteVideo = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const unsubCandidates = useRef(null)
  const unsubOffer = useRef(null)
  const unsubAnswer = useRef(null)
  const [status, setStatus] = useState('idle')
  const [logs, setLogs] = useState([])
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [joined, setJoined] = useState(false)

  function log(msg) { setLogs(s => { const out = [...s.slice(-60), `${new Date().toLocaleTimeString()}: ${msg}`]; return out }) }

  useEffect(() => {
    // If parent triggers autoJoin via user gesture, start immediately.
    if (autoJoin) {
      // small defer to allow state to settle
      setTimeout(() => {
        startCall().catch(e => {
          console.error('autoJoin startCall error', e)
          log('autoJoin failed: ' + (e.message || e))
        })
      }, 50)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoJoin])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [])

  async function cleanup() {
    try {
      if (unsubCandidates.current) { unsubCandidates.current(); unsubCandidates.current = null }
      if (unsubOffer.current) { unsubOffer.current(); unsubOffer.current = null }
      if (unsubAnswer.current) { unsubAnswer.current(); unsubAnswer.current = null }
    } catch (e) { /* ignore */ }

    try {
      if (pcRef.current) {
        try { pcRef.current.getSenders().forEach(s => s.track && s.track.stop()) } catch(e){}
        pcRef.current.close()
        pcRef.current = null
      }
    } catch (e) {}
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
      }
    } catch (e) {}
    setJoined(false)
    setStatus('idle')
    log('cleaned up')
  }

  async function startCall() {
    setStatus('getting-media')
    log('Requesting camera & mic permission')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: true, noiseSuppression: true } })
    } catch (e) {
      log('getUserMedia failed: ' + (e.message || e))
      alert('Camera / mic permission required. Allow camera and microphone and try again.')
      setStatus('error-media')
      throw e
    }

    // stop any previous streams
    if (localStreamRef.current) {
      try { localStreamRef.current.getTracks().forEach(t => t.stop()) } catch(e){}
    }
    localStreamRef.current = stream

    // show local preview (muted)
    if (localVideo.current) {
      try {
        localVideo.current.srcObject = stream
        localVideo.current.muted = true
        await localVideo.current.play().catch(()=>{})
      } catch (e) { /* non-critical */ }
    }

    // create peer connection
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    pcRef.current = pc

    // add tracks
    stream.getTracks().forEach(track => pc.addTrack(track, stream))

    // remote stream container
    const remoteStream = new MediaStream()
    if (remoteVideo.current) remoteVideo.current.srcObject = remoteStream

    pc.ontrack = (event) => {
      try {
        event.streams?.[0]?.getTracks().forEach(t => remoteStream.addTrack(t))
      } catch (e) {
        log('ontrack error: ' + (e.message || e))
      }
      // Try to play remote audio — this must follow a user gesture (autoJoin ensures it):
      setTimeout(() => {
        if (remoteVideo.current) {
          remoteVideo.current.muted = false
          remoteVideo.current.playsInline = true
          remoteVideo.current.play().catch(() => {
            // If browser still blocks autoplay audio, ask user to tap the page to enable audio.
            log('remote play blocked by browser; user gesture required to enable audio')
          })
        }
      }, 150)
    }

    // ice candidate: push to Firestore
    pc.onicecandidate = async (ev) => {
      if (!ev.candidate) return
      try {
        await addCandidate(ev.candidate)
      } catch (e) {
        log('failed to publish candidate: ' + (e.message || e))
      }
    }

    // subscribe to candidate collection and add to pc
    const candCol = collection(doc(collection(doc(db, 'sessions'), sessionId)), 'candidates') // fallback; we'll use direct path below
    // simpler direct collection ref:
    const candidatesRef = collection(db, 'sessions', sessionId, 'candidates')
    unsubCandidates.current = onSnapshot(candidatesRef, snap => {
      snap.docChanges().forEach(async change => {
        if (change.type !== 'added') return
        const d = change.doc.data()
        if (!d) return
        // ignore our own candidates
        if (d.sender === auth.currentUser?.uid) return
        try {
          await pc.addIceCandidate(new RTCIceCandidate(d.candidate))
        } catch (err) {
          log('addIceCandidate failed: ' + (err.message || err))
        }
      })
    }, (err) => {
      log('candidates onSnapshot error: ' + (err.message || err))
    })

    // signaling refs
    const offerRef = doc(db, 'sessions', sessionId, 'signaling', 'offer')
    const answerRef = doc(db, 'sessions', sessionId, 'signaling', 'answer')

    // decide caller or answerer: use session.initiatorUid (server creates session doc with initiatorUid)
    let isInitiator = false
    try {
      if (session && session.initiatorUid && auth.currentUser && session.initiatorUid === auth.currentUser.uid) isInitiator = true
    } catch (e) { /* ignore */ }

    if (isInitiator) {
      setStatus('creating-offer')
      log('acting as initiator — creating offer')
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      try {
        await setDoc(offerRef, { sdp: offer.sdp, type: offer.type, sender: auth.currentUser?.uid || null })
      } catch (e) {
        log('writing offer failed: ' + (e.message || e))
      }

      // listen for answer
      unsubAnswer.current = onSnapshot(answerRef, async snap => {
        if (!snap.exists()) return
        const data = snap.data()
        if (!data || !data.sdp) return
        try {
          await pc.setRemoteDescription({ type: data.type || 'answer', sdp: data.sdp })
          setStatus('connected')
          log('answer applied — connected')
        } catch (err) {
          log('setRemoteDescription(answer) failed: ' + (err.message || err))
        }
      }, (err) => log('answer onSnapshot error: ' + (err.message || err)))
    } else {
      // answerer
      setStatus('waiting-for-offer')
      log('acting as answerer — waiting for offer')
      unsubOffer.current = onSnapshot(offerRef, async snap => {
        if (!snap.exists()) return
        const data = snap.data()
        if (!data || !data.sdp) return
        try {
          await pc.setRemoteDescription({ type: data.type || 'offer', sdp: data.sdp })
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          await setDoc(answerRef, { sdp: answer.sdp, type: answer.type, sender: auth.currentUser?.uid || null })
          setStatus('connected')
          log('created answer and wrote answer doc')
        } catch (err) {
          log('handle offer error: ' + (err.message || err))
        }
      }, (err) => log('offer onSnapshot error: ' + (err.message || err)))
    }

    setJoined(true)
    setStatus('joined')
    log('call started; joined=true')
  } // end startCall

  // helper - publish ICE candidate as object
  async function addCandidate(candidate) {
    try {
      await addDoc(collection(db, 'sessions', sessionId, 'candidates'), {
        sender: auth.currentUser?.uid || null,
        candidate: candidate.toJSON(),
        ts: Date.now()
      })
    } catch (e) {
      console.error('addCandidate error', e)
    }
  }

  // UI actions
  async function handleJoinClick() {
    // user gesture click: call startCall
    try {
      await startCall()
    } catch (e) {
      console.error('startCall failed on button', e)
    }
  }

  function toggleMic() {
    const tracks = localStreamRef.current?.getAudioTracks() || []
    tracks.forEach(t => (t.enabled = !t.enabled))
    setMicOn(prev => !prev)
  }

  function toggleCam() {
    const tracks = localStreamRef.current?.getVideoTracks() || []
    tracks.forEach(t => (t.enabled = !t.enabled))
    setCamOn(prev => !prev)
  }

  async function handleLeave() {
    await cleanup()
  }

  return (
    <div>
      <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
        <div style={{width:160}}>
          <div style={{fontSize:12, color:'#999'}}>You</div>
          <video ref={localVideo} autoPlay playsInline muted style={{width:'100%', borderRadius:8, background:'#000'}} />
        </div>

        <div style={{flex:1}}>
          <div style={{fontSize:12, color:'#999'}}>Partner</div>
          <video ref={remoteVideo} autoPlay playsInline style={{width:'100%', height:320, borderRadius:8, background:'#000'}} />
        </div>
      </div>

      <div style={{marginTop:10, display:'flex', gap:8}}>
        <button onClick={toggleMic}>{micOn ? 'Mic Off' : 'Mic On'}</button>
        <button onClick={toggleCam}>{camOn ? 'Cam Off' : 'Cam On'}</button>

        {!joined ? (
          <button onClick={handleJoinClick}>Join meeting</button>
        ) : (
          <button onClick={handleLeave} style={{background:'#ddd', color:'#000'}}>Leave</button>
        )}
      </div>

      <div style={{marginTop:8}}>
        <strong>Status:</strong> {status}
      </div>

      <div style={{marginTop:10, background:'#fafafa', color:'#111', padding:8, borderRadius:8, maxHeight:180, overflow:'auto'}}>
        {logs.length === 0 ? <div style={{color:'#999'}}>No logs yet</div> : logs.map((l,i)=> <div key={i} style={{fontSize:12}}>{l}</div>)}
      </div>
    </div>
  )
      }
