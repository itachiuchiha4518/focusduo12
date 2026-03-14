'use client'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'

import { auth, googleProvider, db } from '../../lib/firebase'
import { signInWithPopup } from 'firebase/auth'

import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  serverTimestamp,
  runTransaction,
  query,
  where,
  onSnapshot
} from 'firebase/firestore'

/**
 * Robust matchmaking page:
 * - per-queue collections (queue_JEE_Physics_one-on-one)
 * - atomic transaction to remove partner and create session
 * - listener on sessions to redirect waiting user when matched
 * - automatic cleanup of user's queue doc on cancel/unload
 */

function cleanName(v){
  return String(v).replace(/[^a-zA-Z0-9_-]/g, '_')
}

function queueCollectionName(exam, subject, mode){
  return `queue_${cleanName(exam)}_${cleanName(subject)}_${cleanName(mode)}`
}

export default function JoinPage(){
  const router = useRouter()

  const [exam, setExam] = useState('JEE')
  const [subject, setSubject] = useState('Physics')
  const [mode, setMode] = useState('one-on-one')

  const [status, setStatus] = useState('idle') // idle | signing-in | searching | waiting | error
  const [queueDocId, setQueueDocId] = useState(null)
  const waitingRef = useRef(null) // holds unsubscribe for session listener

  const userRef = useRef(null)

  // ensure user is logged in
  async function ensureLogin(){
    if(auth.currentUser){
      userRef.current = auth.currentUser
      return auth.currentUser
    }
    const res = await signInWithPopup(auth, googleProvider)
    userRef.current = res.user
    return res.user
  }

  // Listen for sessions that include this user's UID (participantUids)
  function listenForSession(uid){
    // cleanup old listener
    if(waitingRef.current) {
      waitingRef.current()
      waitingRef.current = null
    }

    const q = query(collection(db,'sessions'), where('participantUids','array-contains', uid))
    const unsub = onSnapshot(q, snap => {
      for(const d of snap.docs){
        const data = d.data()
        if(data && data.status === 'active'){
          // redirect to session page
          waitingRef.current && waitingRef.current()
          waitingRef.current = null
          router.push(`/session/${d.id}`)
          return
        }
      }
    })

    waitingRef.current = unsub
  }

  // Main matchmaking: try to match someone already waiting (atomic) else add self to queue
  async function startMatchmaking(){
    setStatus('signing-in')

    let user
    try{
      user = await ensureLogin()
    }catch(err){
      console.error('sign-in failed', err)
      setStatus('error')
      alert('Sign-in failed')
      return
    }

    setStatus('searching')

    const uid = user.uid
    const displayName = user.displayName || user.email || 'Anonymous'

    // Listen for session creation for this user so if someone matches you get redirected
    listenForSession(uid)

    const colName = queueCollectionName(exam, subject, mode)
    const queueRef = collection(db, colName)

    try{
      // read snapshot (no composite index needed because per-queue collection)
      const snap = await getDocs(queueRef)

      // find first partner whose uid != current user
      const partnerDoc = snap.docs.find(d => {
        const data = d.data()
        return data && data.uid && data.uid !== uid
      })

      if(partnerDoc){
        // Attempt atomic transaction: verify partner still exists, delete partner doc, create session
        const partnerRef = doc(db, colName, partnerDoc.id)
        const sessionRef = doc(collection(db,'sessions')) // create ref with id now

        await runTransaction(db, async (tx) => {
          const partnerSnapshot = await tx.get(partnerRef)
          if(!partnerSnapshot.exists()){
            throw new Error('partner-vanished')
          }
          const partnerData = partnerSnapshot.data()

          // create session object
          const sessionObj = {
            exam,
            subject,
            mode,
            createdAt: serverTimestamp(),
            participants: [
              { uid, name: displayName },
              { uid: partnerData.uid, name: partnerData.name || 'Partner' }
            ],
            participantUids: [uid, partnerData.uid],
            status: 'active'
          }

          // delete partner queue doc and create session atomically
          tx.delete(partnerRef)
          tx.set(sessionRef, sessionObj)
        })

        // transaction committed successfully — redirect to session
        router.push(`/session/${sessionRef.id}`)
        return
      }

      // No partner found — add ourselves to queue
      const myDoc = await addDoc(queueRef, {
        uid,
        name: displayName,
        exam,
        subject,
        mode,
        createdAt: serverTimestamp()
      })

      setQueueDocId(myDoc.id)
      setStatus('waiting')

      // IMPORTANT: other users will match by deleting this doc transactionally;
      // our session listener (listenForSession) will redirect us when session is created.

    }catch(err){
      console.error('matchmaking error', err)
      setStatus('error')
      alert('Matchmaking failed. Check console.')
    }
  }

  // Cancel queue (remove our queue doc if present)
  async function cancelQueue(){
    if(!queueDocId) {
      setStatus('idle')
      return
    }
    try{
      const colName = queueCollectionName(exam, subject, mode)
      await deleteDoc(doc(db, colName, queueDocId))
    }catch(err){
      console.warn('cancel failed', err)
    }finally{
      setQueueDocId(null)
      setStatus('idle')
      if(waitingRef.current){
        waitingRef.current()
        waitingRef.current = null
      }
    }
  }

  // Cleanup on unmount or when user navigates away
  useEffect(() => {
    const onUnload = () => {
      if(queueDocId){
        const colName = queueCollectionName(exam, subject, mode)
        // best-effort synchronous cleanup (cannot await reliably)
        deleteDoc(doc(db, colName, queueDocId)).catch(()=>{})
      }
    }
    window.addEventListener('beforeunload', onUnload)

    return () => {
      window.removeEventListener('beforeunload', onUnload)
      if(queueDocId){
        const colName = queueCollectionName(exam, subject, mode)
        deleteDoc(doc(db, colName, queueDocId)).catch(()=>{})
      }
      if(waitingRef.current){
        waitingRef.current()
        waitingRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queueDocId, exam, subject, mode])

  return (
    <div style={{ maxWidth: 860, margin: '32px auto', padding: 20 }}>
      <h1 style={{ fontSize: 34, marginBottom: 6 }}>Join a study session</h1>
      <p style={{ color: '#666', marginTop: 0 }}>
        Pick exam, subject and mode. Matching is immediate and speed-first.
      </p>

      <div style={{ display: 'grid', gap: 12, maxWidth: 480 }}>
        <label>
          <div style={{ fontWeight: 600 }}>Exam</div>
          <select value={exam} onChange={e => setExam(e.target.value)} style={{ padding: 8, width: '100%', marginTop: 6 }}>
            <option>JEE</option>
            <option>NEET</option>
          </select>
        </label>

        <label>
          <div style={{ fontWeight: 600 }}>Subject</div>
          <select value={subject} onChange={e => setSubject(e.target.value)} style={{ padding: 8, width: '100%', marginTop: 6 }}>
            <option>Physics</option>
            <option>Chemistry</option>
            <option>Math</option>
            <option>Biology</option>
          </select>
        </label>

        <label>
          <div style={{ fontWeight: 600 }}>Mode</div>
          <select value={mode} onChange={e => setMode(e.target.value)} style={{ padding: 8, width: '100%', marginTop: 6 }}>
            <option value="one-on-one">1-on-1</option>
            <option value="group">Group (max 5)</option>
          </select>
        </label>

        <div style={{ marginTop: 4 }}>
          <button
            onClick={startMatchmaking}
            disabled={status === 'searching' || status === 'waiting' || status === 'signing-in'}
            style={{
              padding: '10px 18px',
              fontWeight: 700,
              background: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              cursor: 'pointer'
            }}
          >
            Start matchmaking
          </button>

          <button
            onClick={cancelQueue}
            style={{
              marginLeft: 10,
              padding: '10px 14px',
              borderRadius: 8,
              border: '1px solid #ddd',
              background: '#fff',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
        </div>

        <div style={{ marginTop: 12 }}>
          <strong>Status:</strong> <span style={{ textTransform: 'capitalize' }}>{status}</span>
          {status === 'waiting' && (
            <div style={{ marginTop: 8, color: '#444' }}>
              You are in queue for <strong>{exam} • {subject}</strong>. Waiting for a partner...
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
