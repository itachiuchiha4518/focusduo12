// components/WebRTCRoom.jsx
'use client'
import React, { useEffect, useRef, useState } from 'react'
import { doc, collection, setDoc, getDoc, addDoc, onSnapshot, deleteDoc } from 'firebase/firestore'
import { db, auth } from '../lib/firebase' // adjust path if needed

const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

function iceToJson(c) {
  return c ? { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex } : null
}
function jsonToIce(j) {
  if (!j || !j.candidate) return null
  return new RTCIceCandidate({ candidate: j.candidate, sdpMid: j.sdpMid, sdpMLineIndex: j.sdpMLineIndex })
}

export default function WebRTCRoom({ sessionId, displayName = 'Student' }) {
  const localRef = useRef(null)
  const remoteRef = useRef(null)
  const pcRef = useRef(null)
  const unsubCandidatesRef = useRef(null)
  const unsubAnswerRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [logs, setLogs] = useState([])

  function log(msg) {
    setLogs(l => [...l.slice(-40), `${new Date().toLocaleTimeString()}: ${msg}`])
  }

  useEffect(() => {
    let mounted = true
    async function start() {
      setError(null)
      setStatus('starting')
      log('Starting WebRTC for session ' + sessionId)

      try {
        // get auth user
        const user = auth.currentUser
        if (!user) throw new Error('User not signed in on this device')

        // check session doc exists
        const sRef = doc(db, 'sessions', sessionId)
        const sSnap = await getDoc(sRef)
        if (!sSnap.exists()) throw new Error('Session not found or removed: ' + sessionId)

        // getUserMedia
        let localStream
        try {
          localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: true })
        } catch (e) {
          throw new Error('Camera/mic access denied: ' + (e.message || e))
        }

        if (!mounted) {
          localStream.getTracks().forEach(t => t.stop())
          return
        }

        // show local preview
        if (localRef.current) {
          localRef.current.srcObject = localStream
          localRef.current.muted = true
        }

        const pc = new RTCPeerConnection(ICE_CONFIG)
        pcRef.current = pc

        // attach local tracks
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream))

        // remote stream
        const remoteStream = new MediaStream()
        if (remoteRef.current) remoteRef.current.srcObject = remoteStream
        pc.ontrack = ev => {
          try {
            ev.streams && ev.streams[0] && ev.streams[0].getTracks().forEach(t => remoteStream.addTrack(t))
          } catch (e) { log('ontrack error: ' + e.message) }
        }

        // Firestore refs for signalling
        const signalsRoot = doc(db, 'sessions', sessionId)
        const signalsCol = collection(signalsRoot, 'signals')
        const offerDoc = doc(signalsCol, 'offer')
        const answerDoc = doc(signalsCol, 'answer')
        const candidatesCol = collection(signalsCol, 'candidates')

        // publish ICE candidates
        pc.onicecandidate = async (event) => {
          if (!event.candidate) return
          try {
            await addDoc(candidatesCol, { from: user.uid, candidate: iceToJson(event.candidate), ts: Date.now() })
          } catch (e) { log('Failed publish candidate: ' + e.message) }
        }

        // listen remote candidates
        unsubCandidatesRef.current = onSnapshot(candidatesCol, snapshot => {
          snapshot.docChanges().forEach(async change => {
            if (change.type !== 'added') return
            const data = change.doc.data()
            if (!data || data.from === user.uid) return
            const c = jsonToIce(data.candidate)
            if (c) {
              try { await pc.addIceCandidate(c) } catch (e) { log('addIceCandidate failed: ' + (e.message || e)) }
            }
          })
        }, err => log('candidates onSnapshot error: ' + (err.message || err)))

        // decide caller or answerer
        const offSnap = await getDoc(offerDoc)
        if (!offSnap.exists()) {
          // caller
          log('No offer exists → acting as caller')
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
              log('Answer received; remote description set')
            } catch (e) {
              log('setRemoteDescription (caller) failed: ' + (e.message || e))
            }
          })
        } else {
          // answerer
          log('Offer exists → acting as answerer')
          const offData = offSnap.data()
          if (!offData || !offData.sdp) throw new Error('Offer invalid')

          await pc.setRemoteDescription({ type: offData.type || 'offer', sdp: offData.sdp })
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          await setDoc(answerDoc, { from: user.uid, type: answer.type, sdp: answer.sdp, ts: Date.now() })
          setStatus('connected')
          log('Answered offer and wrote answer')
        }

      } catch (err) {
        const m = err.message || String(err)
        setError(m)
        setStatus('error')
        log('Start failed: ' + m)
      }
    }

    start()

    return () => {
      mounted = false
      try { unsubCandidatesRef.current && unsubCandidatesRef.current() } catch(e){}
      try { unsubAnswerRef.current && unsubAnswerRef.current() } catch(e){}
      try { pcRef.current && pcRef.current.close() } catch(e){}
      // local tracks will be stopped by caller component when leaving
    }
  }, [sessionId])

  return (
    <div>
      <div style={{ display: 'flex', gap: 12 }}>
        <div style={{ width: 160 }}>
          <div style={{ fontSize: 12, color: '#666' }}>You</div>
          <video ref={localRef} autoPlay playsInline style={{ width: '100%', borderRadius: 8, background: '#000' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#666' }}>Partner</div>
          <video ref={remoteRef} autoPlay playsInline style={{ width: '100%', height: 320, borderRadius: 8, background: '#000' }} />
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <div>Status: <strong>{status}</strong></div>
        {error && <div style={{ color: 'red', marginTop: 8 }}>{error}</div>}
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 13, color: '#666' }}>Logs (visible):</div>
        <div style={{ background: '#fafafa', border: '1px solid #eee', padding: 8, borderRadius: 6, maxHeight: 180, overflow: 'auto' }}>
          {logs.length === 0 ? <div style={{ color: '#999' }}>No logs yet</div> : logs.map((l,i)=> <div key={i} style={{ fontSize: 12 }}>{l}</div>)}
        </div>
      </div>
    </div>
  )
}
