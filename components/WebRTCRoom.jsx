// components/WebRTCRoom.jsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { auth, db } from '../lib/firebase'
import {
  doc,
  collection,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot,
  runTransaction,
  deleteDoc
} from 'firebase/firestore'

/*
Robust WebRTC room (Firestore signaling).
Replace entire file. Do NOT mix with old partial code.

Behavior:
- Deterministic initiator based on session.participants (lowest uid string).
- If initiator not set, runs transaction to set it.
- If offer exists and you are NOT the author -> answer immediately.
- If there is stale signaling data, you can clear it manually (instructions below).
- Subscribes to candidates immediately (adds any remote candidates).
- Adds local tracks BEFORE creating offer/answer.
- Exposes a "Copy debug JSON" button to paste here if it still fails.
*/

export default function WebRTCRoom({ sessionId, session }) {
  const localVideo = useRef(null)
  const remoteVideo = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const unsubCands = useRef(null)
  const unsubOffer = useRef(null)
  const unsubAnswer = useRef(null)

  const [status, setStatus] = useState('idle')
  const [logs, setLogs] = useState([])
  const [joined, setJoined] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)

  const log = (m) => setLogs(s => [...s.slice(-80), `${new Date().toLocaleTimeString()} — ${m}`])

  useEffect(() => {
    return () => cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cleanup() {
    log('cleanup start')
    try { unsubCands.current && unsubCands.current(); unsubCands.current = null } catch(e){}
    try { unsubOffer.current && unsubOffer.current(); unsubOffer.current = null } catch(e){}
    try { unsubAnswer.current && unsubAnswer.current(); unsubAnswer.current = null } catch(e){}

    if (pcRef.current) {
      try { pcRef.current.getSenders().forEach(s => s.track && s.track.stop()) } catch(e){}
      try { pcRef.current.close() } catch(e){}
      pcRef.current = null
    }
    if (localStreamRef.current) {
      try { localStreamRef.current.getTracks().forEach(t => t.stop()) } catch(e){}
      localStreamRef.current = null
    }
    setJoined(false)
    setStatus('idle')
    log('cleanup done')
  }

  async function ensureInitiatorSet() {
    const sRef = doc(db, 'sessions', sessionId)
    try {
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(sRef)
        if (!snap.exists()) throw new Error('Session missing')
        const data = snap.data()
        if (data.initiatorUid) return
        const parts = (data.participants || []).map(p => p.uid).filter(Boolean).sort()
        const initiator = parts[0] || auth.currentUser?.uid || null
        tx.update(sRef, { initiatorUid: initiator })
        log('initiatorUid set -> ' + initiator)
      })
    } catch (e) {
      log('ensureInitiatorSet transaction failed: ' + e.message)
    }
  }

  async function publishCandidate(cand) {
    try {
      await addDoc(collection(db, 'sessions', sessionId, 'candidates'), {
        sender: auth.currentUser?.uid || null,
        candidate: cand.toJSON(),
        ts: Date.now()
      })
    } catch (e) {
      log('publishCandidate error ' + (e.message||e))
    }
  }

  // Copy debug JSON helper
  async function copyDebugJSON() {
    try {
      const sRef = doc(db, 'sessions', sessionId)
      const sSnap = await getDoc(sRef)
      const offerSnap = await getDoc(doc(db, 'sessions', sessionId, 'signaling', 'offer'))
      const answerSnap = await getDoc(doc(db, 'sessions', sessionId, 'signaling', 'answer'))
      const cSnap = await getDocs(query(collection(db, 'sessions', sessionId, 'candidates'), orderBy('ts', 'asc')))
      const dump = {
        session: sSnap.exists() ? sSnap.data() : null,
        offer: offerSnap.exists() ? offerSnap.data() : null,
        answer: answerSnap.exists() ? answerSnap.data() : null,
        candidates: cSnap.docs.map(d => d.data())
      }
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2))
      alert('Debug JSON copied. Paste here if you need help.')
    } catch (e) {
      alert('Failed to copy debug: ' + (e.message||e))
    }
  }

  async function joinMeeting() {
    if (!auth.currentUser) { alert('Sign in first'); return }
    if (joined) return
    setStatus('starting')
    try {
      await ensureInitiatorSet()
      const sRef = doc(db, 'sessions', sessionId)
      const sSnap = await getDoc(sRef)
      if (!sSnap.exists()) { alert('Session missing'); setStatus('error'); return }
      const sData = sSnap.data()
      const initiatorUid = sData.initiatorUid
      const myUid = auth.currentUser.uid
      const amInitiator = initiatorUid && myUid === initiatorUid
      log('role: ' + (amInitiator ? 'initiator' : 'answerer'))

      // get media
      setStatus('getting-media')
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280 }, audio: { echoCancellation: true, noiseSuppression: true } })
      } catch (e) {
        log('getUserMedia failed: ' + (e.message||e))
        alert('Please allow camera and microphone and retry.')
        setStatus('error-media')
        return
      }
      localStreamRef.current = stream
      if (localVideo.current) {
        localVideo.current.srcObject = stream
        localVideo.current.muted = true
        try { await localVideo.current.play().catch(()=>{}) } catch(e){}
      }

      // ICE servers (STUN only by default)
      const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]
      const pc = new RTCPeerConnection({ iceServers })
      pcRef.current = pc

      // remote stream
      const remoteStream = new MediaStream()
      if (remoteVideo.current) remoteVideo.current.srcObject = remoteStream
      pc.ontrack = (e) => {
        e.streams?.[0]?.getTracks().forEach(t => remoteStream.addTrack(t))
        setTimeout(()=>{ try { remoteVideo.current && remoteVideo.current.play().catch(()=>{}) } catch(e){} }, 120)
      }

      // add local tracks before SDP
      try { localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current)) } catch(e){ log('addTrack failed: '+(e.message||e)) }

      // candidates -> write to firestore
      pc.onicecandidate = (ev) => { if (ev.candidate) publishCandidate(ev.candidate) }

      // subscribe to remote candidates immediately
      unsubCands.current = onSnapshot(collection(db, 'sessions', sessionId, 'candidates'), snap => {
        snap.docChanges().forEach(async ch => {
          if (ch.type !== 'added') return
          const d = ch.doc.data()
          if (!d || d.sender === auth.currentUser?.uid) return
          try {
            await pc.addIceCandidate(new RTCIceCandidate(d.candidate))
            log('added remote candidate')
          } catch (err) {
            log('addIceCandidate error: ' + (err.message||err))
          }
        })
      }, err => log('candidates onSnapshot error: '+err.message))

      const offerRef = doc(db, 'sessions', sessionId, 'signaling', 'offer')
      const answerRef = doc(db, 'sessions', sessionId, 'signaling', 'answer')

      // Read offer once and act accordingly - this fixes stale-offer races:
      const offSnap = await getDoc(offerRef)
      if (offSnap.exists()) {
        const offData = offSnap.data()
        log('offer exists in DB (sender: ' + (offData.sender || 'unknown') + ')')
      }

      if (amInitiator) {
        // initiator path
        if (offSnap.exists()) {
          // if an offer exists written by someone else, treat ourselves as answerer.
          const od = offSnap.data()
          if (od.sender && od.sender !== myUid) {
            log('offer authored by other user -> produce answer (role corrected)')
            // act as answerer below
            await createAndWriteAnswer(pc, offerRef, answerRef)
          } else {
            log('offer already present and authored by me or unknown -> waiting for answer')
            // subscribe to answer doc
            unsubAnswer.current = onSnapshot(answerRef, async snap => {
              if (!snap.exists()) return
              const d = snap.data()
              if (!d?.sdp) return
              try {
                await pc.setRemoteDescription({ type: d.type || 'answer', sdp: d.sdp })
                setStatus('connected')
                log('applied answer (initiator)')
              } catch (e) { log('setRemoteDescription(answer) failed: '+(e.message||e)) }
            })
          }
        } else {
          // no offer -> create offer
          log('no existing offer -> creating offer (initiator)')
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          await setDoc(offerRef, { sdp: offer.sdp, type: offer.type, sender: myUid })
          log('offer written')
          unsubAnswer.current = onSnapshot(answerRef, async snap => {
            if (!snap.exists()) return
            const d = snap.data()
            if (!d?.sdp) return
            try {
              await pc.setRemoteDescription({ type: d.type || 'answer', sdp: d.sdp })
              setStatus('connected')
              log('applied answer (initiator)')
            } catch (e) { log('setRemoteDescription(answer) failed: '+(e.message||e)) }
          })
        }
      } else {
        // answerer path: if offer exists -> create answer immediately
        if (offSnap.exists()) {
          log('offer found -> creating answer (immediate)')
          await createAndWriteAnswer(pc, offerRef, answerRef)
        } else {
          // subscribe to offer doc and create answer when it appears
          log('waiting for offer')
          unsubOffer.current = onSnapshot(offerRef, async snap => {
            if (!snap.exists()) return
            log('offer appeared -> creating answer')
            try { await createAndWriteAnswer(pc, offerRef, answerRef) } catch (e) { log('createAnswer on offerSnapshot failed: '+(e.message||e)) }
          }, err => log('offer onSnapshot err: '+(err.message||err)))
        }
      }

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState
        log('pc.connectionState: ' + st)
        if (st === 'connected') setStatus('connected')
        if (st === 'failed' || st === 'disconnected') setStatus(st)
      }

      setJoined(true)
      setStatus('joined')
      log('join flow started — waiting for remote')
    } catch (e) {
      log('joinMeeting error: ' + (e.message||e))
      setStatus('error')
    }
  }

  async function createAndWriteAnswer(pc, offerRef, answerRef) {
    const myUid = auth.currentUser.uid
    // read offer one more time to get updated sdp
    const offSnap = await getDoc(offerRef)
    if (!offSnap.exists()) { log('createAnswer: offer missing'); return }
    const offerData = offSnap.data()
    try {
      await pc.setRemoteDescription({ type: offerData.type || 'offer', sdp: offerData.sdp })
      log('applied remote offer')
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      await setDoc(answerRef, { sdp: answer.sdp, type: answer.type, sender: myUid })
      log('wrote answer')
    } catch (e) {
      log('createAndWriteAnswer error: ' + (e.message||e))
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

  return (
    <div style={{padding:12}}>
      <div style={{display:'flex', gap:12}}>
        <div style={{width:180}}>
          <div style={{fontSize:12,color:'#bbb'}}>You</div>
          <video ref={localVideo} autoPlay playsInline muted style={{width:'100%',height:320, background:'#000', borderRadius:10}} />
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:12,color:'#bbb'}}>Partner</div>
          <video ref={remoteVideo} autoPlay playsInline style={{width:'100%',height:320, background:'#000', borderRadius:10}} />
        </div>
      </div>

      <div style={{marginTop:10, display:'flex', gap:8}}>
        <button onClick={toggleMic}>{micOn ? 'Mic Off' : 'Mic On'}</button>
        <button onClick={toggleCam}>{camOn ? 'Cam Off' : 'Cam On'}</button>
        {!joined ? <button onClick={joinMeeting}>Join meeting</button> : <button onClick={cleanup}>Leave</button>}
        <button onClick={copyDebugJSON}>Copy debug JSON</button>
      </div>

      <div style={{marginTop:8}}><strong>Status:</strong> {status}</div>

      <div style={{marginTop:10, maxHeight:220, overflow:'auto', background:'#111', color:'#fff', padding:8, borderRadius:8}}>
        {logs.length === 0 ? <div style={{color:'#ccc'}}>No logs yet</div> : logs.map((l,i)=><div key={i} style={{fontSize:12}}>{l}</div>)}
      </div>
    </div>
  )
}
