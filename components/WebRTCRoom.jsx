'use client'
// components/WebRTCRoom.jsx
import React, { useEffect, useRef, useState } from 'react'
import { doc, collection, getDoc, addDoc, onSnapshot, setDoc } from 'firebase/firestore'
import { db, auth } from '../lib/firebase'

const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

function toJson(candidate) {
  if (!candidate) return null
  return { candidate: candidate.candidate, sdpMid: candidate.sdpMid, sdpMLineIndex: candidate.sdpMLineIndex }
}
function fromJson(j) {
  if (!j || !j.candidate) return null
  return new RTCIceCandidate({ candidate: j.candidate, sdpMid: j.sdpMid, sdpMLineIndex: j.sdpMLineIndex })
}

export default function WebRTCRoom({ sessionId }) {
  const localRef = useRef(null)
  const remoteRef = useRef(null)
  const pcRef = useRef(null)
  const unsubCandidatesRef = useRef(null)
  const unsubAnswerRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [logs, setLogs] = useState([])

  function log(msg) { setLogs(l => [...l.slice(-40), `${new Date().toLocaleTimeString()}: ${msg}`]) }

  useEffect(() => {
    let mounted = true
    async function start() {
      setStatus('starting')
      log('starting webrtc for session ' + sessionId)
      try {
        const user = auth.currentUser
        if (!user) throw new Error('Not signed in on this device')

        const sRef = doc(db, 'sessions', sessionId)
        const sSnap = await getDoc(sRef)
        if (!sSnap.exists()) throw new Error('Session not found: ' + sessionId)

        const localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: true })
        if (!mounted) { localStream.getTracks().forEach(t=>t.stop()); return }

        if (localRef.current) {
          localRef.current.srcObject = localStream
          localRef.current.muted = true
        }

        const pc = new RTCPeerConnection(ICE_CONFIG)
        pcRef.current = pc

        localStream.getTracks().forEach(track => pc.addTrack(track, localStream))

        const remoteStream = new MediaStream()
        if (remoteRef.current) remoteRef.current.srcObject = remoteStream
        pc.ontrack = ev => { ev.streams?.[0]?.getTracks().forEach(t => remoteStream.addTrack(t)) }

        // signalling refs
        const signalsRoot = doc(db, 'sessions', sessionId)
        const signalsCol = collection(signalsRoot, 'signals')
        const offerDoc = doc(signalsCol, 'offer')
        const answerDoc = doc(signalsCol, 'answer')
        const candidatesCol = collection(signalsCol, 'candidates')

        pc.onicecandidate = async (evt) => {
          if (!evt.candidate) return
          try { await addDoc(candidatesCol, { from: user.uid, candidate: toJson(evt.candidate), ts: Date.now() }) }
          catch(e){ log('publish candidate failed: ' + (e.message||e)) }
        }

        unsubCandidatesRef.current = onSnapshot(candidatesCol, snap => {
          snap.docChanges().forEach(async change => {
            if (change.type !== 'added') return
            const d = change.doc.data()
            if (!d || d.from === user.uid) return
            const c = fromJson(d.candidate)
            if (c) {
              try { await pc.addIceCandidate(c) } catch(e){ log('addIceCandidate failed: ' + (e.message||e)) }
            }
          })
        }, err => log('candidates onSnapshot err: ' + (err.message||err)))

        const offSnap = await getDoc(offerDoc)
        if (!offSnap.exists()) {
          // caller
          log('acting as caller')
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)
          await setDoc(offerDoc, { from: user.uid, type: offer.type, sdp: offer.sdp, ts: Date.now() })
          setStatus('waiting-for-answer')

          unsubAnswerRef.current = onSnapshot(answerDoc, async snap => {
            if (!snap.exists()) return
            const d = snap.data()
            if (!d || !d.sdp) return
            try {
              await pc.setRemoteDescription({ type: d.type || 'answer', sdp: d.sdp })
              setStatus('connected')
              log('answer received and remote description set')
            } catch (e) {
              log('setRemoteDescription (caller) failed: ' + (e.message||e))
            }
          })
        } else {
          // answerer
          log('acting as answerer')
          const od = offSnap.data()
          if (!od || !od.sdp) throw new Error('Offer invalid')
          await pc.setRemoteDescription({ type: od.type || 'offer', sdp: od.sdp })
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          await setDoc(answerDoc, { from: user.uid, type: answer.type, sdp: answer.sdp, ts: Date.now() })
          setStatus('connected')
          log('wrote answer')
        }
      } catch (err) {
        const msg = err.message || String(err)
        setError(msg)
        setStatus('error')
        log('start error: ' + msg)
      }
    }

    start()

    return () => {
      mounted = false
      try { unsubCandidatesRef.current && unsubCandidatesRef.current() } catch(e){}
      try { unsubAnswerRef.current && unsubAnswerRef.current() } catch(e){}
      try { pcRef.current && pcRef.current.close() } catch(e){}
    }
  }, [sessionId])

  return (
    <div>
      <div style={{ display:'flex', gap:12 }}>
        <div style={{ width:160 }}>
          <div style={{ fontSize:12, color:'#666' }}>You</div>
          <video ref={localRef} autoPlay playsInline style={{ width:'100%', borderRadius:8, background:'#000' }} />
        </div>
        <div style={{ flex:1 }}>
          <div style={{ fontSize:12, color:'#666' }}>Partner</div>
          <video ref={remoteRef} autoPlay playsInline style={{ width:'100%', height:320, borderRadius:8, background:'#000' }} />
        </div>
      </div>

      <div style={{ marginTop:8 }}>
        <div>Status: <strong>{status}</strong></div>
        {error && <div style={{ color:'red', marginTop:8 }}>{error}</div>}
      </div>

      <div style={{ marginTop:10 }}>
        <div style={{ fontSize:13, color:'#666' }}>Logs:</div>
        <div style={{ background:'#fafafa', border:'1px solid #eee', padding:8, borderRadius:6, maxHeight:200, overflow:'auto' }}>
          {logs.length === 0 ? <div style={{ color:'#999' }}>No logs yet</div> : logs.map((l,i)=> <div key={i} style={{ fontSize:12 }}>{l}</div>)}
        </div>
      </div>
    </div>
  )
}
