// components/WebRTCRoom.jsx
'use client'
import React, { useEffect, useRef, useState } from 'react'
import {
  doc,
  setDoc,
  getDoc,
  collection,
  addDoc,
  onSnapshot,
  getDocs,
  deleteDoc
} from 'firebase/firestore'
import { db } from '../lib/firebase'

// Simple STUN only (free). If many users fail to connect, we will add TURN later.
const ICE_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }

/*
  Usage:
    <WebRTCRoom roomId="demo" displayName="You" />
  - First user to open roomId becomes caller (creates offer)
  - Second user joins and becomes callee (reads offer, writes answer)
  - Signaling stored under collection 'webrtcRooms' -> doc roomId
    with subcollections callerCandidates and calleeCandidates
*/

export default function WebRTCRoom({ roomId = 'demo', displayName = 'Student' }) {
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef = useRef(null)
  const roomRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle, starting, waiting, connected, error, ended
  const [error, setError] = useState(null)
  const [isCreator, setIsCreator] = useState(false)

  useEffect(() => {
    let mounted = true
    let unsubRoom = null
    let unsubCandidates = null

    async function start() {
      setStatus('starting')
      try {
        // get local media
        const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (!mounted) return
        localVideoRef.current.srcObject = localStream
        localVideoRef.current.muted = true

        // create RTCPeerConnection
        const pc = new RTCPeerConnection(ICE_CONFIG)
        pcRef.current = pc

        // add local tracks
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream))

        // set up remote track container
        const remoteStream = new MediaStream()
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
        pc.ontrack = event => {
          event.streams[0].getTracks().forEach(t => remoteStream.addTrack(t))
        }

        // get room doc ref
        const roomsCol = 'webrtcRooms'
        const rRef = doc(db, roomsCol, roomId)
        roomRef.current = rRef

        const rSnap = await getDoc(rRef)
        if (!rSnap.exists()) {
          // ----- creator flow -----
          setIsCreator(true)

          // create doc
          await setDoc(rRef, {
            createdAt: new Date().toISOString(),
            createdBy: displayName || 'caller'
          })

          const callerCandidatesRef = collection(db, roomsCol, roomId, 'callerCandidates')
          const calleeCandidatesRef = collection(db, roomsCol, roomId, 'calleeCandidates')

          // collect ICE and push to callerCandidates
          pc.onicecandidate = async (event) => {
            if (event.candidate) {
              try { await addDoc(callerCandidatesRef, event.candidate.toJSON()) } catch (e) { console.warn('caller candidate push failed', e) }
            }
          }

          // create offer
          const offer = await pc.createOffer()
          await pc.setLocalDescription(offer)

          // write offer to Firestore
          await setDoc(rRef, { offer: { type: offer.type, sdp: offer.sdp }, createdAt: new Date().toISOString(), createdBy: displayName || 'caller' }, { merge: true })

          setStatus('waiting')

          // listen for answer
          unsubRoom = onSnapshot(rRef, async (snap) => {
            const data = snap.data()
            if (!data) return
            if (data.answer && pc && !pc.remoteDescription) {
              const answerDesc = { type: data.answer.type, sdp: data.answer.sdp }
              await pc.setRemoteDescription(answerDesc)
              setStatus('connected')
            }
          })

          // listen for callee ICE
          unsubCandidates = onSnapshot(collection(db, roomsCol, roomId, 'calleeCandidates'), (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
              if (change.type === 'added') {
                const c = change.doc.data()
                try { await pc.addIceCandidate(c) } catch (e) { console.warn('addIceCandidate (creator) failed', e) }
              }
            })
          })

        } else {
          // ----- callee flow -----
          setIsCreator(false)

          const callerCandidatesRef = collection(db, roomsCol, roomId, 'callerCandidates')
          const calleeCandidatesRef = collection(db, roomsCol, roomId, 'calleeCandidates')

          // collect ICE and push to calleeCandidates
          pc.onicecandidate = async (event) => {
            if (event.candidate) {
              try { await addDoc(calleeCandidatesRef, event.candidate.toJSON()) } catch (e) { console.warn('callee candidate push failed', e) }
            }
          }

          // read offer
          const data = rSnap.data()
          const offer = data.offer
          if (!offer) throw new Error('Offer missing in room. Try again.')

          await pc.setRemoteDescription({ type: offer.type, sdp: offer.sdp })

          // create and set answer
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)

          await setDoc(rRef, { answer: { type: answer.type, sdp: answer.sdp }, answeredAt: new Date().toISOString() }, { merge: true })

          // listen for caller ICE candidates
          unsubCandidates = onSnapshot(callerCandidatesRef, (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
              if (change.type === 'added') {
                const c = change.doc.data()
                try { await pc.addIceCandidate(c) } catch (e) { console.warn('addIceCandidate (callee) failed', e) }
              }
            })
          })

          setStatus('connected')
        }

      } catch (err) {
        console.error('WebRTC start error', err)
        setError(String(err?.message || err))
        setStatus('error')
      }
    }

    start()

    // cleanup on unmount
    return () => {
      mounted = false
      try {
        if (pcRef.current) {
          pcRef.current.getSenders().forEach(s => { if (s.track) s.track.stop() })
          pcRef.current.close()
          pcRef.current = null
        }
      } catch (e) { /* ignore */ }
      try { unsubRoom && unsubRoom(); unsubCandidates && unsubCandidates() } catch (e) {}
    }
  }, [roomId, displayName])

  // hangup and cleanup firestore (creator should call hangup)
  async function hangUp() {
    setStatus('ending')

    try {
      if (localVideoRef.current && localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject.getTracks().forEach(t => t.stop())
      }
    } catch (e) { /* ignore */ }

    try {
      if (roomRef.current) {
        const roomsCol = 'webrtcRooms'
        // delete callerCandidates
        const callerSnap = await getDocs(collection(db, roomsCol, roomId, 'callerCandidates'))
        for (const d of callerSnap.docs) await deleteDoc(doc(db, roomsCol, roomId, 'callerCandidates', d.id))
        // delete calleeCandidates
        const calleeSnap = await getDocs(collection(db, roomsCol, roomId, 'calleeCandidates'))
        for (const d of calleeSnap.docs) await deleteDoc(doc(db, roomsCol, roomId, 'calleeCandidates', d.id))
        // delete room doc
        await deleteDoc(roomRef.current)
      }
    } catch (e) {
      console.warn('cleanup firestore failed', e)
    }

    try {
      if (pcRef.current) { pcRef.current.close(); pcRef.current = null }
    } catch (e) { /* ignore */ }

    setStatus('ended')
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 160 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>You</div>
          <video ref={localVideoRef} autoPlay playsInline style={{ width: '100%', borderRadius: 8, background: '#000' }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Partner</div>
          <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: 300, borderRadius: 8, background: '#000' }} />
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <div>Status: <strong>{status}</strong> {isCreator ? '(creator)' : '(joined)'}</div>
        {error && <div style={{ color: 'red', marginTop: 6 }}>{error}</div>}
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
        <button onClick={hangUp} style={{ padding: '8px 12px', background: '#ef4444', color: '#fff', border: 0, borderRadius: 8 }}>Hang up</button>
      </div>
    </div>
  )
            }
