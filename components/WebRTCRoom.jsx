'use client'
import { useEffect, useRef, useState } from 'react'
import { db, auth } from '../lib/firebase'
import { collection, addDoc, query, orderBy, onSnapshot, doc, setDoc, updateDoc, getDoc, serverTimestamp } from 'firebase/firestore'

export default function WebRTCRoom({ sessionId, session }){
  const localRef = useRef(null)
  const remoteRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const [joined, setJoined] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [status, setStatus] = useState('idle')

  useEffect(()=>{
    return () => cleanup()
  },[])

  async function cleanup(){
    try {
      if (pcRef.current) {
        pcRef.current.close()
        pcRef.current = null
      }
      if (localStreamRef.current){
        localStreamRef.current.getTracks().forEach(t=>t.stop())
        localStreamRef.current = null
      }
    } catch(e){ console.warn(e) }
    setJoined(false)
  }

  async function joinMeeting(){
    if (!auth.currentUser) { alert('Sign in first'); return }
    setStatus('getting-media')
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: true, video: true })
      localStreamRef.current = s
      if (localRef.current) localRef.current.srcObject = s
    } catch(e){
      console.error('getUserMedia failed', e)
      alert('Camera or mic permission required')
      setStatus('error-media')
      return
    }

    // Build peer connection
    const pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] })
    pcRef.current = pc
    const remoteStream = new MediaStream()
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream

    pc.ontrack = e => {
      e.streams[0].getTracks().forEach(t => remoteStream.addTrack(t))
    }

    // add local tracks
    localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current))

    // ICE candidate handling: write to Firestore
    pc.onicecandidate = async ev => {
      if (!ev.candidate) return
      try {
        await addDoc(collection(db, 'sessions', sessionId, 'candidates'), {
          sender: auth.currentUser.uid,
          candidate: ev.candidate.toJSON()
        })
      } catch(e){ console.warn(e) }
    }

    // Listen for remote candidates
    const candCol = collection(db, 'sessions', sessionId, 'candidates')
    const unsubCand = onSnapshot(candCol, snap => {
      snap.docChanges().forEach(change => {
        const d = change.doc.data()
        if (!d) return
        if (d.sender === auth.currentUser.uid) return
        try {
          pc.addIceCandidate(new RTCIceCandidate(d.candidate))
        } catch(e) { console.warn('addIceCandidate failed', e) }
      })
    })

    // Signaling via two docs: 'offer' and 'answer' under signaling subcollection
    const signalingOfferRef = doc(db, 'sessions', sessionId, 'signaling', 'offer')
    const signalingAnswerRef = doc(db, 'sessions', sessionId, 'signaling', 'answer')

    // If first to call join: createOffer, else wait for offer and answer
    // Determine initiator by session.initiatorUid presence:
    const myUid = auth.currentUser.uid
    const isInitiator = session?.initiatorUid === myUid

    if (isInitiator){
      setStatus('creating-offer')
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await setDoc(signalingOfferRef, { sdp: offer.sdp, type: offer.type, sender: myUid })

      // listen for answer
      const unsubAnswer = onSnapshot(signalingAnswerRef, async snap => {
        if (!snap.exists()) return
        const data = snap.data()
        try {
          await pc.setRemoteDescription({ type: data.type, sdp: data.sdp })
        } catch(e){ console.warn('setRemoteDescription answer fail', e) }
      })
    } else {
      // non-initiator: wait for offer, then create answer
      setStatus('waiting-offer')
      const unsubOffer = onSnapshot(signalingOfferRef, async snap => {
        if (!snap.exists()) return
        const data = snap.data()
        try {
          await pc.setRemoteDescription({ type: data.type, sdp: data.sdp })
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          await setDoc(signalingAnswerRef, { sdp: answer.sdp, type: answer.type, sender: myUid })
        } catch(e){ console.warn('handle offer failed', e) }
      })
    }

    // mark session started (first client to join)
    try {
      const sessionRef = doc(db, 'sessions', sessionId)
      const snap = await getDoc(sessionRef)
      if (snap.exists() && !snap.data().startedAt) {
        await updateDoc(sessionRef, { startedAt: serverTimestamp(), status: 'active' })
      } else {
        // if already started, just ensure status active
        await updateDoc(sessionRef, { status: 'active' })
      }
    } catch(e){ console.warn('failed to set startedAt', e) }

    setJoined(true)
    setStatus('joined')
  }

  function toggleMic(){
    const tracks = localStreamRef.current?.getAudioTracks() || []
    tracks.forEach(t => t.enabled = !t.enabled)
    setMicOn(prev => !prev)
  }

  function toggleCam(){
    const tracks = localStreamRef.current?.getVideoTracks() || []
    tracks.forEach(t => t.enabled = !t.enabled)
    setCamOn(prev => !prev)
  }

  return (
    <div>
      <div style={{display:'flex', gap:12}}>
        <div>
          <video ref={localRef} autoPlay muted playsInline style={{width:160, height:120, background:'#000', borderRadius:8}} />
          <div style={{fontSize:12, textAlign:'center'}}>You</div>
        </div>
        <div>
          <video ref={remoteRef} autoPlay playsInline style={{width:360, height:240, background:'#000', borderRadius:8}} />
          <div style={{fontSize:12, textAlign:'center'}}>Partner</div>
        </div>
      </div>

      <div style={{marginTop:12, display:'flex', gap:8}}>
        <button onClick={toggleMic}>{micOn ? 'Mic Off' : 'Mic On'}</button>
        <button onClick={toggleCam}>{camOn ? 'Cam Off' : 'Cam On'}</button>
        {!joined ? <button onClick={joinMeeting}>Join meeting</button> : <button onClick={cleanup} style={{background:'#ddd'}}>Leave</button>}
      </div>

      <div style={{marginTop:8}}><strong>Status:</strong> {status}</div>
    </div>
  )
}
