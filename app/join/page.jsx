// app/join/page.jsx  (OVERWRITE)
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
  runTransaction
} from '../../lib/firebase'

export default function JoinPage(){
  const params = useSearchParams()
  // normalize incoming values to lowercase trimmed strings
  const mode = (params.get('mode') || 'one-on-one').trim().toLowerCase()
  const exam = (params.get('exam') || 'jee').trim().toLowerCase()
  const subject = (params.get('subject') || 'physics').trim().toLowerCase()
  const router = useRouter()

  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState(null)
  const queueRef = useRef(null)

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, u => {
      if (!u) router.push('/') 
      else setUser(u)
    })
    return () => unsub && unsub()
  },[router])

  async function createQueue(){
    setStatus('creating-queue')
    setErrorMsg(null)
    try {
      // store normalized values (lowercase)
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
      setStatus('idle')
      router.push('/dashboard')
    } catch(e){
      console.error('cancelQueue', e)
      setErrorMsg(String(e.message || e))
      setStatus('error')
    }
  }

  // single-queue FIFO with normalized fields
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

            // read user docs (reads first)
            const u1Ref = doc(db,'users', partnerData.uid)
            const u2Ref = doc(db,'users', user.uid)
            await t.get(u1Ref)
            await t.get(u2Ref)

            // create session doc with participantNames
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
            // go to session page
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
