'use client'
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

export default function WebRTCRoom({ sessionId, session }) {
  const localRef = useRef(null)
  const remoteRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const unsubCandRef = useRef(null)
  const unsubOfferRef = useRef(null)
  const unsubAnswerRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [logs, setLogs] = useState([])
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [joined, setJoined] = useState(false)

  function log(msg) {
    setLogs(s => [...s.slice(-60), `${new Date().toLocaleTimeString()}: ${msg}`])
  }

  useEffect(() => {
    return () => cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cleanup() {
    try { if (unsubCandRef.current) { unsubCandRef.current(); unsubCandRef.current = null } } catch(e){}
    try { if (unsubOfferRef.current) { unsubOfferRef.current(); unsubOfferRef.current = null } } catch(e){}
    try { if (unsubAnswerRef.current) { unsubAnswerRef.current(); unsubAnswerRef.current = null } } catch(e){}
    try { if (pcRef.current) { pcRef.current.close(); pcRef.current = null } } catch(e){}
    try { if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t=>t.stop()); localStreamRef.current = null } } catch(e){}
    setJoined(false)
    setStatus('idle')
    log('cleaned up')
  }

  async function start() {
    setStatus('getting-media')
    log('user gesture: requesting getUserMedia')
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation:true, noiseSuppression:true } })
    } catch (e) {
      log('getUserMedia failed: ' + (e.message || e))
      alert('Please allow camera and microphone and try again.')
      setStatus('error-media')
      return
    }
    localStreamRef.current = stream
    if (localRef.current) {
      localRef.current.srcObject = stream
      localRef.current.muted = true
      try { await localRef.current.play().catch(()=>{}) } catch(e){}
    }

    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    pcRef.current = pc
    const remoteStream = new MediaStream()
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream
    pc.ontrack = e => {
      try {
        e.streams?.[0]?.getTracks().forEach(t => remoteStream.addTrack(t))
      } catch(e) { log('ontrack error: '+(e.message||e)) }
      // try to play remote audio - this call follows user gesture
      setTimeout(() => {
        try {
          if (remoteRef.current) {
            remoteRef.current.muted = false
            remoteRef.current.playsInline = true
            remoteRef.current.play().catch(()=>{ log('remote play blocked') })
          }
        } catch(e){}
      }, 120)
    }

    // add tracks BEFORE offer
    try { localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current)) } catch(e){ log('addTrack error: '+(e.message||e)) }

    // publish ICE candidates
    pc.onicecandidate = async ev => {
      if (!ev.candidate) return
      try {
        await addDoc(collection(db, 'sessions', sessionId, 'candidates'), {
          sender: auth.currentUser?.uid || null,
          candidate: ev.candidate.toJSON(),
          ts: Date.now()
        })
      } catch (e) { log('publish candidate failed: '+(e.message||e)) }
    }

    // subscribe to candidates (both sides)
    unsubCandRef.current = onSnapshot(collection(db, 'sessions', sessionId, 'candidates'), snap => {
      snap.docChanges().forEach(async ch => {
        if (ch.type !== 'added') return
        const data = ch.doc.data()
        if (!data) return
        if (data.sender === auth.currentUser?.uid) return
        try {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate))
          log('added remote candidate')
        } catch (e) {
          log('addIceCandidate failed: ' + (e.message||e))
        }
      })
    }, err => log('candidates onSnapshot error: '+(err.message||err)))

    // determine role from session.initiatorUid
    const myUid = auth.currentUser?.uid
    const initiatorUid = session?.initiatorUid
    const amInitiator = !!initiatorUid && myUid === initiatorUid

    // signaling refs
    const offerRef = doc(db, 'sessions', sessionId, 'signaling', 'offer')
    const answerRef = doc(db, 'sessions', sessionId, 'signaling', 'answer')

    if (amInitiator) {
      log('role: initiator (will create offer)')
      // check if an offer already exists (race safety)
      const offSnap = await getDoc(offerRef)
      if (offSnap.exists()) {
        log('offer already exists; listening for answer instead (safety)')
        unsubAnswerRef.current = onSnapshot(answerRef, async snap => {
          if (!snap.exists()) return
          const d = snap.data()
          if (!d?.sdp) return
          try {
            await pc.setRemoteDescription({ type: d.type || 'answer', sdp: d.sdp })
            setStatus('connected')
            log('applied answer (initiator)')
          } catch (e) { log('setRemoteDescription(answer) failed: ' + (e.message||e)) }
        })
      } else {
        try {
          setStatus('creating-offer')
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          await setDoc(offerRef, { sdp: offer.sdp, type: offer.type, sender: myUid })
          log('offer written')
          unsubAnswerRef.current = onSnapshot(answerRef, async snap => {
            if (!snap.exists()) return
            const d = snap.data()
            if (!d?.sdp) return
            try {
              await pc.setRemoteDescription({ type: d.type || 'answer', sdp: d.sdp })
              setStatus('connected')
              log('answer applied (initiator)')
            } catch (e) { log('setRemoteDescription(answer) failed: ' + (e.message||e)) }
          })
        } catch (e) {
          log('initiator flow failed: ' + (e.message||e))
        }
      }
    } else {
      // answerer
      log('role: answerer (waiting for offer)')
      unsubOfferRef.current = onSnapshot(offerRef, async snap => {
        if (!snap.exists()) return
        const d = snap.data()
        if (!d?.sdp) return
        try {
          await pc.setRemoteDescription({ type: d.type || 'offer', sdp: d.sdp })
          log('offer applied (answerer)')
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          await setDoc(answerRef, { sdp: answer.sdp, type: answer.type, sender: myUid })
          setStatus('connected')
          log('answer written (answerer)')
        } catch (e) {
          log('answerer flow failed: ' + (e.message||e))
        }
      }, err => log('offer onSnapshot err: '+(err.message||err)))
    }

    setJoined(true)
    setStatus('joined')
    log('joined; waiting for remote tracks/candidates')
  } // end start

  // UI helpers
  function toggleMic() {
    const tracks = localStreamRef.current?.getAudioTracks() || []
    tracks.forEach(t => t.enabled = !t.enabled)
    setMicOn(prev => !prev)
  }
  function toggleCam() {
    const tracks = localStreamRef.current?.getVideoTracks() || []
    tracks.forEach(t => t.enabled = !t.enabled)
    setCamOn(prev => !prev)
  }

  async function leave() {
    await cleanup()
  }

  return (
    <div>
      <div style={{display:'flex', gap:12}}>
        <div style={{width:160}}>
          <div style={{fontSize:12, color:'#666'}}>You</div>
          <video ref={localRef} autoPlay playsInline muted style={{width:'100%', borderRadius:8, background:'#000'}} />
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:12, color:'#666'}}>Partner</div>
          <video ref={remoteRef} autoPlay playsInline style={{width:'100%', height:320, borderRadius:8, background:'#000'}} />
        </div>
      </div>

      <div style={{marginTop:10, display:'flex', gap:8}}>
        <button onClick={toggleMic}>{micOn ? 'Mic Off' : 'Mic On'}</button>
        <button onClick={toggleCam}>{camOn ? 'Cam Off' : 'Cam On'}</button>
        {!joined ? <button onClick={start}>Join meeting</button> : <button onClick={leave} style={{background:'#ddd', color:'#000'}}>Leave</button>}
      </div>

      <div style={{marginTop:8}}><strong>Status:</strong> {status}</div>

      <div style={{marginTop:10, background:'#fafafa', color:'#111', padding:8, borderRadius:8, maxHeight:180, overflow:'auto'}}>
        {logs.length === 0 ? <div style={{color:'#999'}}>No logs yet</div> : logs.map((l,i) => <div key={i} style={{fontSize:12}}>{l}</div>)}
      </div>
    </div>
  )
  }
