// components/WebRTCRoom.jsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { db, auth } from '../lib/firebase'
import { doc, collection, setDoc, onSnapshot, addDoc, query, orderBy } from 'firebase/firestore'

export default function WebRTCRoom({ sessionId, session }) {
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const [joined, setJoined] = useState(false)
  const [isInitiator, setIsInitiator] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)

  useEffect(() => {
    return () => cleanup()
  }, [])

  async function cleanup() {
    try {
      if (pcRef.current) {
        pcRef.current.close()
        pcRef.current = null
      }
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
      }
    } catch (e) { console.warn(e) }
  }

  async function start() {
    if (!auth.currentUser) {
      alert('You must be signed-in')
      return
    }

    setJoined(true)
    const meUid = auth.currentUser.uid
    setIsInitiator(session.initiatorUid === meUid)

    // get local media
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
      localStreamRef.current = stream
      if (localVideoRef.current) localVideoRef.current.srcObject = stream
    } catch (e) {
      console.error('getUserMedia failed', e)
      alert('Camera / mic permission required')
      return
    }

    // create peer connection
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
    })
    pcRef.current = pc

    // add local tracks
    localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current))

    // when remote track arrives
    const remoteStream = new MediaStream()
    remoteVideoRef.current && (remoteVideoRef.current.srcObject = remoteStream)
    pc.ontrack = event => {
      event.streams[0].getTracks().forEach(t => remoteStream.addTrack(t))
    }

    // ICE candidates: add to Firestore
    pc.onicecandidate = async event => {
      if (!event.candidate) return
      try {
        await addDoc(collection(db, 'sessions', sessionId, 'candidates'), {
          sender: auth.currentUser.uid,
          candidate: event.candidate.toJSON()
        })
      } catch (e) { console.error(e) }
    }

    // listen for remote ICE candidates
    const candQuery = query(collection(db, 'sessions', sessionId, 'candidates'), orderBy('sender'))
    const unsubCand = onSnapshot(collection(db, 'sessions', sessionId, 'candidates'), snap => {
      snap.docChanges().forEach(change => {
        const d = change.doc.data()
        if (d.sender !== auth.currentUser.uid) {
          try {
            pc.addIceCandidate(new RTCIceCandidate(d.candidate))
          } catch (e) {
            console.warn('addIceCandidate', e)
          }
        }
      })
    })

    // signaling: single offer doc / answer doc (setDoc with fixed ids)
    const offerRef = doc(db, 'sessions', sessionId, 'signaling', 'offer')
    const answerRef = doc(db, 'sessions', sessionId, 'signaling', 'answer')

    // initiator creates offer
    if (isInitiator) {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      await setDoc(offerRef, { sdp: offer.sdp, type: offer.type, sender: auth.currentUser.uid })
      // wait for answer
      const unsubAnswer = onSnapshot(answerRef, async snap => {
        if (!snap.exists()) return
        const data = snap.data()
        const remoteDesc = { type: data.type, sdp: data.sdp }
        await pc.setRemoteDescription(remoteDesc)
      })
    } else {
      // non-initiator: wait for offer, then create answer
      const unsubOffer = onSnapshot(offerRef, async snap => {
        if (!snap.exists()) return
        const data = snap.data()
        const remoteDesc = { type: data.type, sdp: data.sdp }
        await pc.setRemoteDescription(remoteDesc)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        await setDoc(answerRef, { sdp: answer.sdp, type: answer.type, sender: auth.currentUser.uid })
      })
    }

    // set remote video ref update
    setTimeout(()=> {
      // attach remote video element srcObject already set
      if (remoteVideoRef.current && remoteVideoRef.current.srcObject) {
        remoteVideoRef.current.play().catch(()=>{})
      }
    }, 500)

    // update UI
    setJoined(true)
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

  return (
    <div>
      <div style={{display:'flex',gap:12, alignItems:'center'}}>
        <div>
          <video ref={localVideoRef} autoPlay muted playsInline style={{width:160, borderRadius:8, background:'#000'}} />
          <div style={{textAlign:'center', fontSize:12}}>You</div>
        </div>
        <div>
          <video ref={remoteVideoRef} autoPlay playsInline style={{width:320, borderRadius:8, background:'#000'}} />
          <div style={{textAlign:'center', fontSize:12}}>Partner</div>
        </div>
      </div>

      <div style={{marginTop:12, display:'flex', gap:8}}>
        <button onClick={toggleMic}>{micOn ? 'Mic Off' : 'Mic On'}</button>
        <button onClick={toggleCam}>{camOn ? 'Cam Off' : 'Cam On'}</button>
        {!joined ? <button onClick={start}>Join meeting</button> : <button onClick={cleanup} style={{background:'#ddd',color:'#000'}}>Leave</button>}
      </div>
    </div>
  )
}
