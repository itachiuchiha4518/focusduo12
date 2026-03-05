'use client'
import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { auth, onAuthStateChanged, db, collection, addDoc, query, where, getDocs, deleteDoc, doc, getDoc, updateDoc } from '../../lib/firebase'

export default function JoinPage(){
  const params = useSearchParams()
  const mode = params.get('mode') || ''           // 'one-on-one' or 'group'
  const exam = params.get('exam') || ''
  const subject = params.get('subject') || ''
  const router = useRouter()

  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('idle')
  const [errorMsg, setErrorMsg] = useState(null)
  const [queueId, setQueueId] = useState(null)
  const queueDocRef = useRef(null)
  const pollRef = useRef(null)
  const currentMonthKey = new Date().toISOString().slice(0,7) // YYYY-MM

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, u => {
      if (!u) router.push('/')
      else setUser(u)
    })
    return () => unsub && unsub()
  },[router])

  useEffect(()=>{
    if (!user || !mode || !exam || !subject) return
    startMatch()
    return () => {
      stopPolling()
      removeQueueDoc()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, mode, exam, subject])

  async function loadUserDoc(){
    try {
      const uSnap = await getDoc(doc(db,'users', user.uid))
      if (uSnap.exists()) return uSnap.data()
      return null
    } catch(e){ console.error('loadUserDoc', e); return null }
  }

  function planIsPro(plan){
    return plan && plan.toLowerCase() === 'pro'
  }

  async function checkFreeLimits(userDoc){
    // returns {ok: boolean, reason: string|null}
    const plan = userDoc?.plan || 'free'
    if (planIsPro(plan)) return { ok: true }
    // free user: check monthly usage
    const monthKey = currentMonthKey
    const mu = userDoc?.monthlyUsage || {}
    const m = mu[monthKey] || { oneOnOne: 0, group: 0 }
    if (mode === 'one-on-one') {
      if ((m.oneOnOne || 0) >= 10) return { ok: false, reason: 'Free plan limit reached: 10 one-on-one sessions per month. Upgrade to Pro.' }
    } else if (mode === 'group') {
      if ((m.group || 0) >= 20) return { ok: false, reason: 'Free plan limit reached: 20 group sessions per month. Upgrade to Pro.' }
    }
    return { ok: true }
  }

  async function createQueueDoc(plan){
    try {
      const qRef = await addDoc(collection(db, 'queues'), {
        uid: user.uid,
        exam,
        subject,
        mode,
        plan: plan || 'free',
        createdAt: new Date().toISOString()
      })
      queueDocRef.current = qRef
      setQueueId(qRef.id)
      return qRef
    } catch (e) {
      console.error('createQueueDoc error', e)
      setErrorMsg(String(e.message || JSON.stringify(e)))
      setStatus('error')
      return null
    }
  }

  async function removeQueueDoc(){
    try {
      if (queueDocRef.current) {
        await deleteDoc(doc(db, 'queues', queueDocRef.current.id))
        queueDocRef.current = null
        setQueueId(null)
      }
    } catch(e){ console.warn('removeQueueDoc failed', e) }
  }

  async function incrementUserUsage(uid, modeToInc){
    try {
      const uRef = doc(db,'users', uid)
      const uSnap = await getDoc(uRef)
      if (!uSnap.exists()) return
      const uData = uSnap.data()
      const mu = uData.monthlyUsage || {}
      const monthKey = currentMonthKey
      const m = mu[monthKey] || { oneOnOne: 0, group: 0 }
      if (modeToInc === 'one-on-one') m.oneOnOne = (m.oneOnOne || 0) + 1
      if (modeToInc === 'group') m.group = (m.group || 0) + 1
      mu[monthKey] = m
      await updateDoc(uRef, {
        monthlyUsage: mu,
        sessionsCompleted: (uData.sessionsCompleted || 0) + 1,
        totalHours: (uData.totalHours || 0) // totalHours not incremented here; can be updated post-session
      })
    } catch(e){
      console.warn('incrementUserUsage failed', e)
    }
  }

  async function checkForMatchAndCreateSession(plan){
    try {
      // Query earliest other queue with same exam, subject, mode, and same plan
      const q = query(
        collection(db, 'queues'),
        where('mode', '==', mode),
        where('exam', '==', exam),
        where('subject', '==', subject),
        where('plan', '==', plan)
      )
      const snap = await getDocs(q)
      let partner = null
      // find earliest other (first in list) - getDocs does not guarantee order, but generally returns inserts; safe-enough for MVP
      snap.forEach(s => {
        if (s.data().uid !== user.uid && !partner) partner = { id: s.id, ...s.data() }
      })

      if (partner) {
        // Create session doc
        const sessionRef = await addDoc(collection(db, 'sessions'), {
          participants: [user.uid, partner.uid],
          exam, subject, mode,
          plan,
          startTime: new Date().toISOString(),
          status: 'active'
        })

        // Remove partner queue + self queue
        try { if (partner.id) await deleteDoc(doc(db,'queues', partner.id)) } catch(e){ console.warn(e) }
        try { if (queueDocRef.current) await deleteDoc(doc(db,'queues', queueDocRef.current.id)) } catch(e){ console.warn(e) }

        // increment usage for both users
        await incrementUserUsage(user.uid, mode)
        await incrementUserUsage(partner.uid, mode)

        // stop polling and navigate to session
        stopPolling()
        router.push(`/session/${sessionRef.id}`)
        return true
      }

      return false
    } catch(e){
      console.error('checkForMatch error', e)
      setErrorMsg(String(e.message || JSON.stringify(e)))
      setStatus('error')
      return false
    }
  }

  function startPolling(plan){
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      if (status === 'error') return
      const matched = await checkForMatchAndCreateSession(plan)
      if (!matched) setStatus('waiting')
    }, 2000) // faster matching for priority
  }

  function stopPolling(){
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function startMatch(){
    setStatus('joining')
    setErrorMsg(null)
    const uDoc = await loadUserDoc()
    if (!uDoc) {
      setErrorMsg('User profile missing. Please try reloading or contact admin.')
      return setStatus('error')
    }
    const plan = uDoc.plan || 'free'
    // check free limits
    const limits = await checkFreeLimits(uDoc)
    if (!limits.ok) {
      setErrorMsg(limits.reason)
      return setStatus('error')
    }

    // create queue
    const qRef = await createQueueDoc(plan)
    if (!qRef) return
    setStatus('waiting')
    // immediately check for existing partner
    const matchedNow = await checkForMatchAndCreateSession(plan)
    if (matchedNow) return
    // otherwise poll
    startPolling(plan)
  }

  return (
    <div className="container mt-8">
      <div className="card p-4" style={{maxWidth:720}}>
        <h3 style={{marginBottom:8}}>Matchmaking</h3>
        <div>Mode: {mode} • Exam: {exam} • Subject: {subject}</div>
        <div style={{marginTop:8}}>Status: {status}</div>
        {queueId && <div style={{marginTop:8}}><strong>Queue doc id:</strong> {queueId}</div>}
        {errorMsg && <div style={{marginTop:8, color:'#b91c1c'}}><strong>Error:</strong> {errorMsg}</div>}
        <div style={{marginTop:12}}>
          <a href="/dashboard" className="btn">Back to dashboard</a>
          <button onClick={async ()=>{ stopPolling(); await removeQueueDoc(); router.push('/dashboard') }} className="btn small" style={{marginLeft:8}}>Cancel</button>
          <a href="/debug" style={{marginLeft:12}} className="btn small">Open debug</a>
        </div>
      </div>
    </div>
  )
}
