// components/WebRTCRoom.jsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { auth, db } from '../lib/firebase'
import {
  doc,
  collection,
  addDoc,
  onSnapshot,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  runTransaction
} from 'firebase/firestore'

/*
Drop-in WebRTC room (Firestore signaling).
- Deterministic initiator: picks lowest uid from session.participants (stable).
- If session.initiatorUid missing, tries to set it via transaction (safe).
- Subscribes to candidates immediately, ignores own candidates.
- Adds tracks BEFORE SDP creation.
- Uses optional TURN via NEXT_PUBLIC_TURN_URL / USER / PASS.
- Provides "Copy debug JSON" for exact Firestore state.
Usage: <WebRTCRoom sessionId={id} session={session} />
IMPORTANT: Both participants must click "Join meeting" (user gesture).
*/

export default function WebRTCRoom({ sessionId, session }) {
  const localRef = useRef(null)
  const remoteRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const unsubCandidatesRef = useRef(null)
  const unsubOfferRef = useRef(null)
  const unsubAnswerRef = useRef(null)

  const [status, setStatus] = useState('idle')
  const [logs, setLogs] = useState([])
  const [joined, setJoined] = useState(false)
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)

  // TURN config from env (optional). Set in Vercel: NEXT_PUBLIC_TURN_URL, NEXT_PUBLIC_TURN_USER, NEXT_PUBLIC_TURN_PASS
  const TURN_URL = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_URL : undefined
  const TURN_USER = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_USER : undefined
  const TURN_PASS = typeof window !== 'undefined' ? process.env.NEXT_PUBLIC_TURN_PASS : undefined

  function log(msg) {
    const t = new Date().toLocaleTimeString()
    setLogs(s => [...s.slice(-80), `${t} — ${msg}`])
    console.debug('WebRTCRoom:', msg)
  }

  useEffect(() => {
    return () => { cleanup() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cleanup() {
    log('cleanup: stopping tracks and closing pc')
    try { unsubCandidatesRef.current && unsubCandidatesRef.current(); unsubCandidatesRef.current = null } catch(e){}
    try { unsubOfferRef.current && unsubOfferRef.current(); unsubOfferRef.current = null } catch(e){}
    try { unsubAnswerRef.current && unsubAnswerRef.current(); unsubAnswerRef.current = null } catch(e){}
    try {
      if (pcRef.current) {
        try { pcRef.current.getSenders().forEach(s => s.track && s.track.stop()) } catch(e){}
        pcRef.current.close()
        pcRef.current = null
      }
    } catch(e){}
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(t => t.stop())
        localStreamRef.current = null
      }
    } catch(e){}
    setJoined(false)
    setStatus('idle')
    log('cleanup complete')
  }

  // publish ICE candidate to Firestore
  async function publishCandidate(candidate) {
    try {
      await addDoc(collection(db, 'sessions', sessionId, 'candidates'), {
        sender: auth.currentUser?.uid || null,
        candidate: candidate.toJSON(),
        ts: Date.now()
      })
    } catch (e) {
      log('publishCandidate error: ' + (e.message || e))
    }
  }

  // deterministic initiator: lowest uid string among participants
  function computeInitiatorFromParticipants(participants = []) {
    if (!Array.isArray(participants) || participants.length === 0) return null
    const uids = participants.map(p => p.uid).filter(Boolean).sort()
    return uids[0] || null
  }

  // ensure session.initiatorUid is set atomically to deterministic value
  async function ensureInitiatorSet() {
    try {
      const sRef = doc(db, 'sessions', sessionId)
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(sRef)
        if (!snap.exists()) throw new Error('session missing')
        const data = snap.data()
        if (data.initiatorUid) return
        const initiator = computeInitiatorFromParticipants(data.participants)
        if (!initiator) {
          // fallback: set current user as initiator
          const me = auth.currentUser?.uid || null
          tx.update(sRef, { initiatorUid: me })
          log('initiatorUid set to current user (fallback)')
        } else {
          tx.update(sRef, { initiatorUid: initiator })
          log('initiatorUid set via participants order: ' + initiator)
        }
      })
    } catch (e) {
      log('ensureInitiatorSet transaction failed: ' + (e.message || e))
    }
  }

  // Main: called by user gesture (Join meeting button)
  async function joinMeeting() {
    if (!auth.currentUser) { alert('Sign in first'); return }
    if (joined) return
    setStatus('starting')
    try {
      // ensure initiator field exists
      await ensureInitiatorSet()

      // get fresh session doc (to read initiator consistently)
      const sSnap = await getDoc(doc(db, 'sessions', sessionId))
      if (!sSnap.exists()) { alert('Session missing'); return }
      const sData = sSnap.data()
      const initiatorUid = sData.initiatorUid
      const myUid = auth.currentUser?.uid
      const amInitiator = initiatorUid && myUid === initiatorUid

      setStatus('getting-media')
      log('requesting camera & microphone (user gesture)')
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280 }, audio: { echoCancellation: true, noiseSuppression: true } })
      } catch (e) {
        log('getUserMedia failed: ' + (e.message || e))
        alert('Camera / mic permission required. Allow and retry.')
        setStatus('error-media')
        return
      }
      localStreamRef.current = stream
      if (localRef.current) {
        localRef.current.srcObject = stream
        localRef.current.muted = true
        try { await localRef.current.play().catch(()=>{}) } catch(e){}
      }

      // build ICE servers list (include TURN if provided)
      const iceServers = [{ urls: 'stun:stun.l.google.com:19302' }]
      if (TURN_URL && TURN_USER && TURN_PASS) {
        iceServers.push({ urls: TURN_URL, username: TURN_USER, credential: TURN_PASS })
        log('TURN configured from env')
      } else {
        log('no TURN configured — may fail under strict NATs')
      }

      const pc = new RTCPeerConnection({ iceServers })
      pcRef.current = pc

      // remote stream setup
      const remoteStream = new MediaStream()
      if (remoteRef.current) remoteRef.current.srcObject = remoteStream
      pc.ontrack = (ev) => {
        try { ev.streams?.[0]?.getTracks().forEach(t => remoteStream.addTrack(t)) } catch(e){}
        setTimeout(() => {
          try {
            if (remoteRef.current) { remoteRef.current.muted = false; remoteRef.current.playsInline = true; remoteRef.current.play().catch(()=>log('remote.play blocked')) }
          } catch(e){}
        }, 120)
      }

      // add local tracks BEFORE creating offer/answer
      try { localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current)) } catch(e){ log('addTrack failed: '+(e.message||e)) }

      // candidate handling
      pc.onicecandidate = ev => { if (ev.candidate) publishCandidate(ev.candidate) }

      // subscribe to remote candidates immediately
      unsubCandidatesRef.current = onSnapshot(collection(db, 'sessions', sessionId, 'candidates'), snap => {
        snap.docChanges().forEach(async ch => {
          if (ch.type !== 'added') return
          const d = ch.doc.data()
          if (!d || d.sender === auth.currentUser?.uid) return
          try {
            await pc.addIceCandidate(new RTCIceCandidate(d.candidate))
            log('added remote candidate')
          } catch (err) {
            log('addIceCandidate error: ' + (err.message || err))
          }
        })
      }, err => log('candidates onSnapshot error: '+(err.message||err)))

      // signaling refs
      const offerRef = doc(db, 'sessions', sessionId, 'signaling', 'offer')
      const answerRef = doc(db, 'sessions', sessionId, 'signaling', 'answer')

      if (amInitiator) {
        log('acting as initiator')
        // check if offer exists; if exists, wait for answer instead
        const offSnap = await getDoc(offerRef)
        if (offSnap.exists()) {
          log('offer already present; waiting for answer')
          unsubAnswerRef.current = onSnapshot(answerRef, async snap => {
            if (!snap.exists()) return
            const d = snap.data()
            if (!d?.sdp) return
            try {
              await pc.setRemoteDescription({ type: d.type || 'answer', sdp: d.sdp })
              setStatus('connected')
              log('applied answer (initiator)')
            } catch (e) { log('setRemoteDescription(answer) failed: '+(e.message||e)) }
          })
        } else {
          setStatus('creating-offer')
          try {
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
                log('applied answer (initiator)')
              } catch (e) { log('setRemoteDescription(answer) failed: '+(e.message||e)) }
            })
          } catch (e) { log('createOffer/writeOffer failed: '+(e.message||e)) }
        }
      } else {
        // answerer flow: wait for offer then create answer
        log('acting as answerer (waiting for offer)')
        unsubOfferRef.current = onSnapshot(offerRef, async snap => {
          if (!snap.exists()) return
          const d = snap.data()
          if (!d?.sdp) return
          try {
            await pc.setRemoteDescription({ type: d.type || 'offer', sdp: d.sdp })
            log('applied offer (answerer)')
            const answer = await pc.createAnswer()
            await pc.setLocalDescription(answer)
            await setDoc(answerRef, { sdp: answer.sdp, type: answer.type, sender: myUid })
            setStatus('connected')
            log('created & wrote answer (answerer)')
          } catch (e) { log('answerer flow failed: '+(e.message||e)) }
        }, err => log('offer onSnapshot err: '+(err.message||err)))
      }

      // connection state changes
      pc.onconnectionstatechange = () => {
        const cs = pc.connectionState
        log('pc.connectionState: ' + cs)
        if (cs === 'connected') setStatus('connected')
        if (cs === 'failed' || cs === 'disconnected') setStatus(cs)
      }

      setJoined(true)
      setStatus('joined')
      log('join flow started — waiting for remote')
    } catch (e) {
      log('joinMeeting top-level error: ' + (e.message || e))
      setStatus('error')
    }
  } // end joinMeeting

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

  async function dumpDebugJSON() {
    try {
      const sRef = doc(db, 'sessions', sessionId)
      const sSnap = await getDoc(sRef)
      const sessionJson = sSnap.exists() ? sSnap.data() : null
      const offerSnap = await getDoc(doc(db, 'sessions', sessionId, 'signaling', 'offer'))
      const answerSnap = await getDoc(doc(db, 'sessions', sessionId, 'signaling', 'answer'))
      const candSnap = await getDocs(query(collection(db, 'sessions', sessionId, 'candidates'), orderBy('ts', 'asc')))
      const candidates = candSnap.docs.map(d => d.data())
      const dump = { session: sessionJson, offer: offerSnap.exists() ? offerSnap.data() : null, answer: answerSnap.exists() ? answerSnap.data() : null, candidates }
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2))
      alert('Debug JSON copied to clipboard — paste here if you need help.')
    } catch (e) {
      alert('Failed to copy debug JSON: ' + (e.message || e))
    }
  }

  return (
    <div>
      <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
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
        {!joined ? <button onClick={joinMeeting}>Join meeting</button> : <button onClick={cleanup} style={{background:'#ddd', color:'#000'}}>Leave</button>}
        <button onClick={dumpDebugJSON} style={{background:'#222', color:'#fff'}}>Copy debug JSON</button>
      </div>

      <div style={{marginTop:8}}><strong>Status:</strong> {status}</div>

      <div style={{marginTop:10, background:'#fafafa', color:'#111', padding:8, borderRadius:8, maxHeight:220, overflow:'auto'}}>
        {logs.length === 0 ? <div style={{color:'#999'}}>No logs yet</div> : logs.map((l,i) => <div key={i} style={{fontSize:12}}>{l}</div>)}
      </div>
    </div>
  )
}
