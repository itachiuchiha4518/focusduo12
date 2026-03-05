// app/join/page.jsx  — OVERWRITE this file completely
'use client'
import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import {
  auth,
  onAuthStateChanged,
  db,
  collection,
  addDoc,
  query,
  where,
  getDocs,
  deleteDoc,
  doc,
  runTransaction,
  onSnapshot,
  getDoc,
  setDoc
} from '../../lib/firebase'

// Helper: ensure minimal user doc exists (so new signups won't stall dashboard)
async function ensureUserDoc(uid, userMeta){
  try {
    const uRef = doc(db,'users', uid)
    const uSnap = await getDoc(uRef)
    if (!uSnap.exists()){
      await setDoc(uRef, {
        name: userMeta.displayName || userMeta.email || 'Student',
        email: userMeta.email || '',
        plan: 'free',
        totalStudyHours: 0,
        sessionsCompleted: 0,
        currentStreak: 0,
        commitmentScore: 0,
        level: 'Beginner',
        accountStatus: 'active',
        monthlyUsage: {},
        holds: {}
      })
    }
  } catch(e){
    console.warn('ensureUserDoc failed', e)
  }
}

export default function JoinPage(){
  const params = useSearchParams()
  const rawMode = params.get('mode') || 'one-on-one'
  const rawExam = params.get('exam') || 'jee'
  const rawSubject = params.get('subject') || 'physics'
  // normalize
  const mode = rawMode.trim().toLowerCase()
  const exam = rawExam.trim().toLowerCase()
  const subject = rawSubject.trim().toLowerCase()

  const router = useRouter()
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState(null)
  const queueRef = useRef(null)
  const sessionListenerRef = useRef(null)

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) router.push('/')
      else {
        setUser(u)
        // ensure user doc exists so dashboard doesn't hang on new users
        await ensureUserDoc(u.uid, u)
      }
    })
    return () => unsub && unsub()
  },[router])

  useEffect(()=>{
    // cleanup on unmount
    return ()=> {
      if (sessionListenerRef.current) sessionListenerRef.current()
    }
  },[])

  async function createQueue(){
    setStatus('creating-queue')
    setErrorMsg(null)
    try {
      // create queue with normalized fields
      const qRef = await addDoc(collection(db,'queues'), {
        uid: user.uid,
        name: user.displayName || user.email || 'Student',
        exam,
        subject,
        mode,
        createdAt: new Date().toISOString()
      })
      queueRef.current = qRef
      setStatus('queued')

      // realtime listen for any session that has this user as participant
      const sQ = query(collection(db,'sessions'), where('participants','array-contains', user.uid))
      sessionListenerRef.current = onSnapshot(sQ, (snap) => {
        snap.forEach(d => {
          const data = d.data()
          if (!data) return
          if (data.status === 'matched' || data.status === 'active' ) {
            // redirect to session for the first matching doc
            window.location.href = `/session/${d.id}`
          }
        })
      })

      // immediately attempt match (fast)
      await tryMatch()
    } catch(e){
      console.error('createQueue error', e)
      setErrorMsg(String(e.message || e))
      setStatus('error')
    }
  }

  async function cancelQueue(){
    setStatus('cancelling')
    try {
      if (queueRef.current) {
        await deleteDoc(doc(db,'queues', queueRef.current.id))
        queueRef.current = null
      }
      if (sessionListenerRef.current) { sessionListenerRef.current(); sessionListenerRef.current = null }
      setStatus('idle')
      router.push('/dashboard')
    } catch(e){
      console.error('cancelQueue', e)
      setErrorMsg(String(e.message || e))
      setStatus('error')
    }
  }

  // FIFO single queue match — normalized strings used (lowercase)
  async function tryMatch(){
    setStatus('matching')
    try {
      const q = query(collection(db,'queues'),
        where('exam','==', exam),
        where('subject','==', subject),
        where('mode','==', mode)
      )
      const snap = await getDocs(q)
      const candidates = []
      snap.forEach(s => {
        const d = s.data()
        if (s.id && d && d.uid !== user.uid) candidates.push({ id: s.id, data: d })
      })

      if (candidates.length === 0) {
        setStatus('waiting')
        return false
      }

      // oldest-first in JS
      candidates.sort((a,b)=> {
        const ta = a.data.createdAt ? new Date(a.data.createdAt).getTime() : 0
        const tb = b.data.createdAt ? new Date(b.data.createdAt).getTime() : 0
        return ta - tb
      })

      for (const partner of candidates.slice(0,10)) {
        try {
          const sessionId = await runTransaction(db, async (t) => {
            const partnerRef = doc(db,'queues', partner.id)
            const partnerSnap = await t.get(partnerRef)
            if (!partnerSnap.exists()) throw new Error('partner-gone')
            const partnerData = partnerSnap.data()
            if (!queueRef.current) throw new Error('self-missing')
            const selfRef = doc(db,'queues', queueRef.current.id)
            const selfSnap = await t.get(selfRef)
            if (!selfSnap.exists()) throw new Error('self-gone')

            // read both users before writes
            const u1Ref = doc(db,'users', partnerData.uid)
            const u2Ref = doc(db,'users', user.uid)
            await t.get(u1Ref)
            await t.get(u2Ref)

            // create session with both participant names
            const sessionRef = doc(collection(db,'sessions'))
            t.set(sessionRef, {
              participants: [ partnerData.uid, user.uid ],
              participantNames: [ partnerData.name || partnerData.uid, user.displayName || user.email || user.uid ],
              exam,
              subject,
              mode,
              createdAt: new Date().toISOString(),
              status: 'matched'
            })

            // delete both queue docs
            t.delete(partnerRef)
            t.delete(selfRef)

            return sessionRef.id
          })

          if (sessionId) {
            setStatus('matched')
            queueRef.current = null
            // redirect initiator — other client has session listener and will redirect too
            window.location.href = `/session/${sessionId}`
            return true
          }
        } catch(txErr){
          console.warn('transaction failed for candidate', partner.id, txErr)
          continue
        }
      }

      setStatus('waiting')
      return false
    } catch(e){
      console.error('tryMatch error', e)
      setErrorMsg(String(e.message || e))
      setStatus('error')
      return false
    }
  }

  return (
    <div style={{padding:20}}>
      <h2>Matchmaking</h2>
      <div>Mode: {mode} • Exam: {exam.toUpperCase()} • Subject: {subject.toUpperCase()}</div>
      <div style={{marginTop:12}}>
        <div>Status: <strong>{status}</strong></div>
        {errorMsg && <div style={{color:'red', marginTop:8}}>Error: {errorMsg}</div>}
      </div>

      <div style={{marginTop:16}}>
        {status === 'idle' && <button onClick={createQueue} className="btn">Join queue</button>}
        {(status === 'queued' || status === 'waiting' || status === 'matching') && <button onClick={cancelQueue} className="btn small">Cancel</button>}
      </div>

      <div style={{marginTop:18}}>
        <a href="/dashboard" className="muted">Back to dashboard</a>
      </div>
    </div>
  )
          }
