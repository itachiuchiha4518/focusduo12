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
  runTransaction,
  query,
  orderBy,
  getDocs
} from 'firebase/firestore'

/**
 * Robust WebRTC room using Firestore signaling.
 *
 * Key fixes in this version:
 * - Deterministic initiator: uses session.initiatorUid, and if absent sets it atomically via transaction.
 * - Avoids double-offer: checks for existing offer before creating one.
 * - Subscribes to candidate collection early and ignores own candidates.
 * - Attaches local tracks BEFORE creating offer/answer.
 * - Uses user gesture (button click) to request getUserMedia to avoid autoplay blocking.
 * - Logs events into an on-screen log panel for quick debugging.
 *
 * Usage: <WebRTCRoom sessionId={id} session={session} />
 *
 * Important: both peers should click "Join meeting" (user gesture) to allow mic/audio autoplay.
 * If peers fail to connect but signaling looks correct, NAT/TURN may be required.
 */

export default function WebRTCRoom({ sessionId, session }) {
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef = useRef(null)
  const localStreamRef = useRef(null)
  const unsubCandidatesRef = useRef(null)
  const unsubOfferRef = useRef(null)
  const unsubAnswerRef = useRef(null)

  const [status, setStatus] = useState('idle')
  const [logs, setLogs] = useState([])
  const [micOn, setMicOn] = useState(true)
  const [camOn, setCamOn] = useState(true)
  const [joined, setJoined] = useState(false)

  function log(msg) {
    const time = new Date().toLocaleTimeString()
    setLogs(l => [...l.slice(-80), `${time}: ${msg}`])
    console.debug('WebRTCRoom:', msg)
  }

  useEffect(() => {
    // cleanup on unmount
    return () => cleanup()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cleanup() {
    log('cleanup initiated')
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
    log('cleanup done')
  }

  // helper: publish ICE candidate
  async function publishCandidate(candidate) {
    try {
      await addDoc(collection(db, 'sessions', sessionId, 'candidates'), {
        sender: auth.currentUser?.uid || null,
        candidate: candidate.toJSON(),
        ts: Date.now()
      })
    } catch (e) {
      log('publishCandidate failed: ' + (e.message || e))
    }
  }

  // Public action: user clicks Join meeting (must be a direct user gesture)
  async function joinMeeting() {
    if (!auth.currentUser) { alert('Sign in first'); return }
    if (joined) return
    setStatus('starting')
    try {
      // 1) ensure session has initiatorUid set deterministically
      await ensureInitiatorSet()

      // 2) get media (user gesture here)
      setStatus('getting-media')
      log('requesting camera & mic')
      let stream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280 }, audio: { echoCancellation: true, noiseSuppression: true } })
      } catch (e) {
        log('getUserMedia failed: ' + (e.message || e))
        alert('Camera / microphone access is required. Allow camera and mic and retry.')
        setStatus('error-media')
        return
      }
      localStreamRef.current = stream
      if (localVideoRef.current) {
        try { localVideoRef.current.srcObject = stream; localVideoRef.current.muted = true; await localVideoRef.current.play().catch(()=>{}) } catch(e){}
      }

      // 3) create RTCPeerConnection and attach tracks BEFORE SDP
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
        // If you get TURN credentials later, add them here:
        // iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'turn:TURN_HOST', username: 'user', credential: 'pass' }]
      })
      pcRef.current = pc

      // remote stream
      const remoteStream = new MediaStream()
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
      pc.ontrack = (ev) => {
        try { ev.streams?.[0]?.getTracks().forEach(t => remoteStream.addTrack(t)) } catch (e) { log('ontrack error: '+(e.message||e)) }
        // try to play remote audio (this call follows user gesture -> allowable)
        setTimeout(() => {
          try {
            if (remoteVideoRef.current) {
              remoteVideoRef.current.muted = false
              remoteVideoRef.current.playsInline = true
              remoteVideoRef.current.play().catch(() => log('remote play blocked'))
            }
          } catch(e){}
        }, 120)
      }

      // add local tracks
      try { localStreamRef.current.getTracks().forEach(track => pc.addTrack(track, localStreamRef.current)) } catch(e){ log('addTrack failed: '+(e.message||e)) }

      // wire ICE candidate emission
      pc.onicecandidate = ev => {
        if (!ev.candidate) return
        publishCandidate(ev.candidate)
      }

      // observe candidates collection
      unsubCandidatesRef.current = onSnapshot(collection(db, 'sessions', sessionId, 'candidates'), snapshot => {
        snapshot.docChanges().forEach(async change => {
          if (change.type !== 'added') return
          const docData = change.doc.data()
          if (!docData) return
          if (docData.sender === auth.currentUser?.uid) return
          try {
            await pc.addIceCandidate(new RTCIceCandidate(docData.candidate))
            log('added remote ICE candidate')
          } catch (e) {
            log('addIceCandidate error: ' + (e.message || e))
          }
        })
      }, err => {
        log('candidates onSnapshot error: '+(err.message||err))
      })

      // signaling docs
      const offerRef = doc(db, 'sessions', sessionId, 'signaling', 'offer')
      const answerRef = doc(db, 'sessions', sessionId, 'signaling', 'answer')

      // determine role safely from session.initiatorUid (should exist)
      const myUid = auth.currentUser?.uid
      let initiatorUid = session?.initiatorUid
      if (!initiatorUid) {
        // session might be stale — attempt to set initiator atomically
        try {
          await runTransaction(db, async (tx) => {
            const sref = doc(db, 'sessions', sessionId)
            const sSnap = await tx.get(sref)
            if (!sSnap.exists()) throw new Error('session missing')
            const sdata = sSnap.data()
            if (!sdata.initiatorUid) {
              tx.update(sref, { initiatorUid: myUid })
              initiatorUid = myUid
            } else {
              initiatorUid = sdata.initiatorUid
            }
          })
        } catch (e) {
          log('ensure initiator transaction failed: '+(e.message||e))
          // continue; we'll read fresh below
          const sSnap2 = await getDoc(doc(db,'sessions',sessionId))
          initiatorUid = sSnap2.exists() ? sSnap2.data().initiatorUid : null
        }
      }

      const amInitiator = !!initiatorUid && initiatorUid === myUid
      log('role determined: ' + (amInitiator ? 'initiator' : 'answerer') + ' (initiatorUid=' + initiatorUid + ')')

      if (amInitiator) {
        // create offer if none exists
        const offSnap = await getDoc(offerRef)
        if (offSnap.exists()) {
          log('offer already exists — listening for answer')
          unsubAnswerRef.current = onSnapshot(answerRef, async snap => {
            if (!snap.exists()) return
            const d = snap.data()
            if (!d?.sdp) return
            try {
              await pc.setRemoteDescription({ type: d.type || 'answer', sdp: d.sdp })
              setStatus('connected')
              log('applied remote answer (initiator)')
            } catch (e) { log('setRemoteDescription(answer) failed: ' + (e.message||e)) }
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
                log('applied remote answer (initiator)')
              } catch (e) { log('setRemoteDescription(answer) failed: ' + (e.message||e)) }
            })
          } catch(e){
            log('createOffer or writeOffer failed: '+(e.message||e))
          }
        }
      } else {
        // answerer: wait for offer then create answer
        setStatus('waiting-offer')
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
            log('answer created and written (answerer)')
          } catch (e) {
            log('handle offer failed: ' + (e.message||e))
          }
        }, err => log('offer onSnapshot error: '+(err.message||err)))
      }

      // connection state handler
      pc.onconnectionstatechange = () => {
        const s = pc.connectionState
        log('pc.connectionState: '+s)
        if (s === 'connected') setStatus('connected')
        if (s === 'failed' || s === 'disconnected') setStatus(s)
      }

      setJoined(true)
      setStatus('joined')
      log('join flow complete — waiting for remote')
    } catch (e) {
      log('joinMeeting top-level error: ' + (e.message || e))
      setStatus('error')
    }
  } // end joinMeeting

  async function ensureInitiatorSet() {
    try {
      // quick check
      const sRef = doc(db, 'sessions', sessionId)
      const sSnap = await getDoc(sRef)
      if (!sSnap.exists()) throw new Error('session missing')
      const sdata = sSnap.data()
      if (sdata.initiatorUid) return
      // set initiator to current user atomically if still missing
      await runTransaction(db, async (tx) => {
        const snap = await tx.get(sRef)
        if (!snap.exists()) throw new Error('session missing inside tx')
        const data = snap.data()
        if (!data.initiatorUid) {
          tx.update(sRef, { initiatorUid: auth.currentUser?.uid || null })
          log('initiatorUid set via transaction')
        } else {
          log('initiatorUid already set in transaction')
        }
      })
    } catch (e) {
      log('ensureInitiatorSet failed: ' + (e.message || e))
    }
  }

  // UI controls
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

  // debug helper: dump session + signaling to clipboard (so you can paste here)
  async function dumpDebugInfo() {
    try {
      const sRef = doc(db, 'sessions', sessionId)
      const sSnap = await getDoc(sRef)
      const sessionJson = sSnap.exists() ? sSnap.data() : null
      const offerSnap = await getDoc(doc(db, 'sessions', sessionId, 'signaling', 'offer'))
      const answerSnap = await getDoc(doc(db, 'sessions', sessionId, 'signaling', 'answer'))
      const candidatesSnap = await getDocs(query(collection(db, 'sessions', sessionId, 'candidates'), orderBy('ts', 'asc')))
      const candidates = candidatesSnap.docs.map(d => d.data())
      const dump = { session: sessionJson, offer: offerSnap.exists() ? offerSnap.data() : null, answer: answerSnap.exists() ? answerSnap.data() : null, candidates }
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2))
      alert('Debug JSON copied to clipboard — paste it to me if you need help.')
    } catch (e) {
      alert('Failed to copy debug info: ' + (e.message || e))
    }
  }

  return (
    <div>
      <div style={{display:'flex', gap:12, alignItems:'flex-start'}}>
        <div style={{width:160}}>
          <div style={{fontSize:12, color:'#666'}}>You</div>
          <video ref={localVideoRef} autoPlay playsInline muted style={{width:'100%', borderRadius:8, background:'#000'}} />
        </div>

        <div style={{flex:1}}>
          <div style={{fontSize:12, color:'#666'}}>Partner</div>
          <video ref={remoteVideoRef} autoPlay playsInline style={{width:'100%', height:320, borderRadius:8, background:'#000'}} />
        </div>
      </div>

      <div style={{marginTop:10, display:'flex', gap:8}}>
        <button onClick={toggleMic}>{micOn ? 'Mic Off' : 'Mic On'}</button>
        <button onClick={toggleCam}>{camOn ? 'Cam Off' : 'Cam On'}</button>
        {!joined ? <button onClick={joinMeeting}>Join meeting</button> : <button onClick={cleanup} style={{background:'#ddd',color:'#000'}}>Leave</button>}
        <button onClick={dumpDebugInfo} style={{background:'#222', color:'#fff'}}>Copy debug JSON</button>
      </div>

      <div style={{marginTop:8}}>
        <strong>Status:</strong> {status}
      </div>

      <div style={{marginTop:10, background:'#fafafa', color:'#111', padding:8, borderRadius:8, maxHeight:180, overflow:'auto'}}>
        {logs.length === 0 ? <div style={{color:'#999'}}>No logs yet</div> : logs.map((l,i) => <div key={i} style={{fontSize:12}}>{l}</div>)}
      </div>
    </div>
  )
        }
