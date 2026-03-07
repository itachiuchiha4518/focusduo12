// components/WebRTCRoom.jsx
'use client'
import React, { useEffect, useRef, useState } from 'react'
import {
  doc, setDoc, getDoc, collection, addDoc, onSnapshot, getDocs, deleteDoc
} from 'firebase/firestore'
import { db } from '../lib/firebase'

export default function WebRTCRoom({ roomId = 'demo', displayName = 'Student' }) {
  const localVideoRef = useRef(null)
  const remoteVideoRef = useRef(null)
  const pcRef = useRef(null)
  const roomRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState(null)
  const [isCreator, setIsCreator] = useState(false)

  useEffect(() => {
    let mounted = true

    async function start() {
      setStatus('starting')

      try {
        const configuration = {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' }
            // add TURN server here if you need NAT traversal on restrictive networks
          ]
        }

        const pc = new RTCPeerConnection(configuration)
        pcRef.current = pc

        const localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true })
        if (!mounted) return
        localVideoRef.current.srcObject = localStream
        localVideoRef.current.muted = true

        localStream.getTracks().forEach(track => pc.addTrack(track, localStream))

        const remoteStream = new MediaStream()
        remoteVideoRef.current.srcObject = remoteStream
        pc.ontrack = (event) => {
          event.streams[0].getTracks().forEach(track => remoteStream.addTrack(track))
        }

        // ROOM document reference
        const roomsCol = 'webrtcRooms'
        const rRef = doc(db, roomsCol, roomId)
        roomRef.current = rRef

        const roomSnap = await getDoc(rRef)
        if (!roomSnap.exists()) {
          // ---- creator (caller) ----
          setIsCreator(true)
          await setDoc(rRef, { createdAt: new Date().toISOString(), createdBy: displayName || 'caller' })

          const callerCandidatesRef = collection(db, roomsCol, roomId, 'callerCandidates')
          const calleeCandidatesRef = collection(db, roomsCol, roomId, 'calleeCandidates')

          pc.onicecandidate = async (event) => {
            if (event.candidate) {
              try {
                await addDoc(callerCandidatesRef, event.candidate.toJSON())
              } catch (e) {
                console.warn('add caller candidate fail', e)
              }
            }
          }

          const offerDescription = await pc.createOffer()
          await pc.setLocalDescription(offerDescription)

          await setDoc(rRef, {
            offer: { type: offerDescription.type, sdp: offerDescription.sdp },
            createdAt: new Date().toISOString(),
            createdBy: displayName || 'caller'
          }, { merge: true })

          // listen for answer
          const unsubscribeRoom = onSnapshot(rRef, async (snapshot) => {
            const data = snapshot.data()
            if (!data) return
            if (data.answer && pc && !pc.remoteDescription) {
              const answerDesc = new RTCSessionDescription(data.answer)
              await pc.setRemoteDescription(answerDesc)
              setStatus('connected')
            }
          })

          // listen for callee candidates
          const calleeCandidatesColRef = collection(db, roomsCol, roomId, 'calleeCandidates')
          const unsubscribeCalleeCandidates = onSnapshot(calleeCandidatesColRef, (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
              if (change.type === 'added') {
                const cand = change.doc.data()
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(cand))
                } catch (e) {
                  console.warn('Error adding callee candidate', e)
                }
              }
            })
          })

          setStatus('waiting-for-answer')

          return () => {
            unsubscribeRoom && unsubscribeRoom()
            unsubscribeCalleeCandidates && unsubscribeCalleeCandidates()
          }
        } else {
          // ---- joiner (callee) ----
          setIsCreator(false)
          const callerCandidatesColRef = collection(db, roomsCol, roomId, 'callerCandidates')
          const calleeCandidatesColRef = collection(db, roomsCol, roomId, 'calleeCandidates')

          pc.onicecandidate = async (event) => {
            if (event.candidate) {
              try {
                await addDoc(calleeCandidatesColRef, event.candidate.toJSON())
              } catch (e) {
                console.warn('add callee candidate fail', e)
              }
            }
          }

          const data = roomSnap.data()
          const offer = data.offer
          if (!offer) throw new Error('Room has no offer.')

          await pc.setRemoteDescription(new RTCSessionDescription(offer))

          const answerDescription = await pc.createAnswer()
          await pc.setLocalDescription(answerDescription)

          await setDoc(rRef, { answer: { type: answerDescription.type, sdp: answerDescription.sdp } }, { merge: true })

          // listen for caller candidates
          const unsubscribeCallerCandidates = onSnapshot(callerCandidatesColRef, (snapshot) => {
            snapshot.docChanges().forEach(async (change) => {
              if (change.type === 'added') {
                const cand = change.doc.data()
                try {
                  await pc.addIceCandidate(new RTCIceCandidate(cand))
                } catch (e) {
                  console.warn('Error adding caller candidate', e)
                }
              }
            })
          })

          setStatus('connected')

          return () => {
            unsubscribeCallerCandidates && unsubscribeCallerCandidates()
          }
        }
      } catch (err) {
        console.error('WebRTC start error', err)
        setError(String(err?.message || err))
        setStatus('error')
      }
    }

    start()

    return () => {
      mounted = false
      try {
        if (pcRef.current) {
          pcRef.current.getSenders().forEach(s => { if (s.track) s.track.stop() })
          pcRef.current.close()
          pcRef.current = null
        }
      } catch (e) {}
    }
  }, [roomId, displayName])

  async function hangUp() {
    setStatus('ending')
    try {
      if (localVideoRef.current && localVideoRef.current.srcObject) {
        localVideoRef.current.srcObject.getTracks().forEach(t => t.stop())
      }
    } catch (e) {}

    try {
      if (roomRef.current) {
        const callerSnap = await getDocs(collection(db, 'webrtcRooms', roomId, 'callerCandidates'))
        const calleeSnap = await getDocs(collection(db, 'webrtcRooms', roomId, 'calleeCandidates'))
        for (const docSnap of callerSnap.docs) {
          await deleteDoc(doc(db, 'webrtcRooms', roomId, 'callerCandidates', docSnap.id))
        }
        for (const docSnap of calleeSnap.docs) {
          await deleteDoc(doc(db, 'webrtcRooms', roomId, 'calleeCandidates', docSnap.id))
        }
        await deleteDoc(roomRef.current)
      }
    } catch (e) {
      console.warn('Error cleaning up firestore', e)
    }

    try {
      if (pcRef.current) {
        pcRef.current.close()
        pcRef.current = null
      }
    } catch (e) {}

    setStatus('ended')
  }

  return (
    <div style={{ padding: 12 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ width: 160 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Local</div>
          <video ref={localVideoRef} autoPlay playsInline style={{ width: '100%', borderRadius: 8, background: '#000' }} />
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Remote</div>
          <video ref={remoteVideoRef} autoPlay playsInline style={{ width: '100%', height: 300, borderRadius: 8, background: '#000' }} />
        </div>
      </div>

      <div style={{ marginTop: 8 }}>
        <div>Status: <strong>{status}</strong> {isCreator ? '(room creator)' : '(joined)'}</div>
        {error && <div style={{ color: 'red', marginTop: 6 }}>{error}</div>}
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
        <button onClick={() => hangUp()} style={{ padding: '8px 12px', background: '#ef4444', color: '#fff', border: 0, borderRadius: 8 }}>Hang up</button>
      </div>
    </div>
  )
}
