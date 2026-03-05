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
  getDoc,
  runTransaction
} from '../../lib/firebase'

const HOLD_MINUTES = 10 // how long to hold credits before expiry

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
      if (uSnap.exists()) return { id: uSnap.id, ...uSnap.data() }
      return null
    } catch(e){ console.error('loadUserDoc', e); return null }
  }

  function planIsPro(plan){
    return plan && plan.toLowerCase() === 'pro'
  }

  async function checkFreeLimits(userDoc){
    const plan = userDoc?.plan || 'free'
    if (planIsPro(plan)) return { ok: true }
    const mu = userDoc?.monthlyUsage || {}
    const m = mu[currentMonthKey] || { oneOnOne: 0, group: 0 }
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

  // ---------- FIXED: query without orderBy, then sort in JS ----------
  async function tryAtomicMatch(plan){
    try {
      // query all matching queues for same exam/subject/mode/plan (no orderBy)
      const q = query(
        collection(db, 'queues'),
        where('exam','==', exam),
        where('subject','==', subject),
        where('mode','==', mode),
        where('plan','==', plan)
      )

      const snap = await getDocs(q)
      const candidates = []
      snap.forEach(s => {
        const data = s.data()
        if (s.id && data && data.uid !== user.uid) {
          candidates.push({ id: s.id, data })
        }
      })

      if (candidates.length === 0) return false

      // sort by createdAt in JS (oldest first)
      candidates.sort((a,b) => {
        const ta = a.data.createdAt ? new Date(a.data.createdAt).getTime() : 0
        const tb = b.data.createdAt ? new Date(b.data.createdAt).getTime() : 0
        return ta - tb
      })

      // try up to first 10 candidates (list is already sorted)
      const limitCandidates = candidates.slice(0, 10)

      for (const partner of limitCandidates) {
        try {
          const sessionId = await runTransaction(db, async (t) => {
            const partnerRef = doc(db,'queues', partner.id)
            const partnerSnap = await t.get(partnerRef)
            if (!partnerSnap.exists()) throw new Error('partner-gone')
            if (partnerSnap.data().matched) throw new Error('partner-taken')

            if (!queueDocRef.current) throw new Error('self-missing')
            const selfRef = doc(db,'queues', queueDocRef.current.id)
            const selfSnap = await t.get(selfRef)
            if (!selfSnap.exists()) throw new Error('self-gone')

            // check both users' holds/limits
            const u1Ref = doc(db,'users', user.uid)
            const u2Ref = doc(db,'users', partnerSnap.data().uid)
            const u1Snap = await t.get(u1Ref)
            const u2Snap = await t.get(u2Ref)
            if (!u1Snap.exists() || !u2Snap.exists()) throw new Error('user-doc-missing')

            const u1 = u1Snap.data()
            const u2 = u2Snap.data()
            const monthKey = new Date().toISOString().slice(0,7)

            function willExceed(uData){
              const p = uData.plan || 'free'
              if (p.toLowerCase() === 'pro') return false
              const mu = uData.monthlyUsage || {}
              const m = mu[monthKey] || { oneOnOne:0, group:0 }
              const holds = uData.holds || {}
              const h = holds[monthKey] || { oneOnOne:0, group:0 }
              const current = mode === 'one-on-one' ? (m.oneOnOne || 0) + (h.oneOnOne || 0) : (m.group || 0) + (h.group || 0)
              if (mode === 'one-on-one' && current >= 10) return true
              if (mode === 'group' && current >= 20) return true
              return false
            }
            if (willExceed(u1) || willExceed(u2)) throw new Error('limit-exceeded')

            // create reserved session doc
            const sessionRef = doc(collection(db,'sessions'))
            const now = new Date()
            const holdExpiry = new Date(now.getTime() + HOLD_MINUTES * 60 * 1000).toISOString()
            t.set(sessionRef, {
              participants: [user.uid, partnerSnap.data().uid],
              exam, subject, mode,
              plan,
              startTime: now.toISOString(),
              status: 'reserved',
              reserved: true,
              reservedAt: now.toISOString(),
              holdExpiry,
              chargesFinalized: false,
              createdBy: user.uid
            })

            // delete both queue docs
            t.delete(partnerRef)
            t.delete(selfRef)

            // increment holds for both users
            const u1Hold = u1.holds || {}
            const u2Hold = u2.holds || {}
            const u1Month = u1Hold[monthKey] || { oneOnOne:0, group:0 }
            const u2Month = u2Hold[monthKey] || { oneOnOne:0, group:0 }
            if (mode === 'one-on-one') {
              u1Month.oneOnOne = (u1Month.oneOnOne || 0) + 1
              u2Month.oneOnOne = (u2Month.oneOnOne || 0) + 1
            } else {
              u1Month.group = (u1Month.group || 0) + 1
              u2Month.group = (u2Month.group || 0) + 1
            }
            u1Hold[monthKey] = u1Month
            u2Hold[monthKey] = u2Month
            t.update(u1Ref, { holds: u1Hold })
            t.update(u2Ref, { holds: u2Hold })

            return sessionRef.id
          })
          if (sessionId) {
            stopPolling()
            router.push(`/session/${sessionId}`)
            return true
          }
        } catch (txErr) {
          console.warn('transaction attempt failed', txErr)
          continue
        }
      }

      return false
    } catch(e){
      console.error('tryAtomicMatch error', e)
      setErrorMsg(String(e.message || JSON.stringify(e)))
      setStatus('error')
      return false
    }
  }
  // ---------- end tryAtomicMatch ----------

  function startPolling(plan){
    if (pollRef.current) return
    pollRef.current = setInterval(async () => {
      if (status === 'error') return
      const matched = await tryAtomicMatch(plan)
      if (!matched) setStatus('waiting')
    }, 2000)
  }

  function stopPolling(){
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
  }

  async function startMatch(){
    setStatus('joining')
    setErrorMsg(null)
    const uDoc = await loadUserDoc()
    if (!uDoc) { setErrorMsg('User profile missing. Please reload.'); return setStatus('error') }
    const plan = uDoc.plan || 'free'
    const limits = await checkFreeLimits(uDoc)
    if (!limits.ok) { setErrorMsg(limits.reason); return setStatus('error') }

    const qRef = await createQueueDoc(plan)
    if (!qRef) return
    setStatus('waiting')

    const matchedNow = await tryAtomicMatch(plan)
    if (matchedNow) return
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
