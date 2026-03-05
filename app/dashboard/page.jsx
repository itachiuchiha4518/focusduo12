'use client'
import { useEffect, useState } from 'react'
import { auth, onAuthStateChanged, db, doc, getDoc, updateDoc, collection, addDoc } from '../../lib/firebase'
import { useRouter } from 'next/navigation'

const UPI_ID = 'focusduo@upi' // replace with your actual UPI id
const FIRST_100_PLAN_KEY = 'first100' // special option user can choose

export default function DashboardPage(){
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [exam, setExam] = useState('JEE')
  const [subject, setSubject] = useState('Physics')
  const [loading, setLoading] = useState(true)
  const [txnId, setTxnId] = useState('')
  const [planChoice, setPlanChoice] = useState('pro-month') // 'pro-month' | 'pro-3' | 'pro-12' | 'first100'
  const router = useRouter()
  const monthKey = new Date().toISOString().slice(0,7)

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async (u)=>{
      if(!u) router.push('/')
      else {
        setUser(u)
        const userRef = doc(db, 'users', u.uid)
        const snap = await getDoc(userRef)
        const base = {
          uid: u.uid,
          name: u.displayName || '',
          email: u.email || '',
          totalHours: 0,
          sessionsCompleted: 0,
          currentStreak: 0,
          commitmentScore: 0,
          level: 'Beginner',
          plan: 'free',
          accountStatus: 'active',
          exam: null,
          subjects: [],
          monthlyUsage: {}
        }
        if(!snap.exists()){
          await setDoc(userRef, base)
          setProfile(base)
        } else {
          setProfile({ ...base, ...snap.data() })
        }
      }
      setLoading(false)
    })
    return () => unsub && unsub()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[])

  async function saveProfile(){
    if(!user) return
    await updateDoc(doc(db,'users', user.uid), { exam, subjects: [subject] })
    const snap = await getDoc(doc(db,'users', user.uid))
    if(snap.exists()) setProfile(snap.data())
  }

  function remainingFree(){
    if(!profile) return { oneOnOne:10, group:20 }
    if ((profile.plan || 'free').toLowerCase() === 'pro') return { oneOnOne: Infinity, group: Infinity }
    const mu = profile.monthlyUsage || {}
    const m = mu[monthKey] || { oneOnOne: 0, group: 0 }
    return { oneOnOne: Math.max(0, 10 - (m.oneOnOne || 0)), group: Math.max(0, 20 - (m.group || 0)) }
  }

  async function submitPayment(){
    if(!user) return alert('Sign in first')
    if(!txnId) return alert('Enter transaction id / UTR')
    try{
      await addDoc(collection(db,'payments'), {
        uid: user.uid,
        planType: planChoice,
        transactionId: txnId,
        status: 'pending',
        createdAt: new Date().toISOString()
      })
      alert('Payment submitted. Admin will verify and approve shortly.')
      setTxnId('')
    } catch(e){
      console.error('submitPayment', e)
      alert('Failed to submit payment: ' + (e.message || e))
    }
  }

  if(loading) return <div className="container p-6">Loading...</div>

  return (
    <div className="container mt-8">
      <div className="card p-4" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <div style={{fontSize:18, fontWeight:600}}>{profile?.name}</div>
          <div className="muted">{profile?.email}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div>🔥 Current streak: {profile?.currentStreak || 0}</div>
          <div>Total hours: {profile?.totalHours || 0}</div>
          <div>Level: {profile?.level || 'Beginner'}</div>
          <div>Plan: {profile?.plan}</div>
        </div>
      </div>

      <div className="card mt-6 p-4">
        <h3>Select exam & subject</h3>
        <div className="form-row">
          <select value={exam} onChange={(e)=>setExam(e.target.value)}>
            <option>JEE</option><option>NEET</option>
          </select>
          <select value={subject} onChange={(e)=>setSubject(e.target.value)}>
            {exam==='JEE' ? (<><option>Physics</option><option>Chemistry</option><option>Math</option></>) : (<><option>Physics</option><option>Chemistry</option><option>Biology</option></>)}
          </select>
          <button onClick={saveProfile} className="btn">Save</button>
        </div>

        <div style={{marginTop:12}}>
          <div style={{marginBottom:8}}>Free plan remaining: 1-on-1 = {remainingFree().oneOnOne}, group = {remainingFree().group}</div>
          <div style={{display:'flex', gap:8}}>
            <a href={`/join?mode=one-on-one&exam=${encodeURIComponent(exam)}&subject=${encodeURIComponent(subject)}`} className="btn">Join 1-on-1</a>
            <a href={`/join?mode=group&exam=${encodeURIComponent(exam)}&subject=${encodeURIComponent(subject)}`} className="btn">Join group</a>
          </div>
        </div>
      </div>

      <div className="card mt-6 p-4">
        <h3>Upgrade to Pro (manual UPI payment)</h3>
        <div style={{marginTop:8}}>UPI ID: <strong>{UPI_ID}</strong></div>
        <div style={{marginTop:8}}>
          <label>
            Choose plan:
            <select value={planChoice} onChange={(e)=>setPlanChoice(e.target.value)} style={{marginLeft:8}}>
              <option value="pro-month">₹99 — 1 month</option>
              <option value="pro-3">₹199 — 3 months</option>
              <option value="pro-12">₹699 — 12 months</option>
              <option value={FIRST_100_PLAN_KEY}>Special: First 100 users — ₹99 for 12 months</option>
            </select>
          </label>
        </div>
        <div style={{marginTop:8}}>
          <label>Enter transaction id / UTR:
            <input value={txnId} onChange={(e)=>setTxnId(e.target.value)} style={{marginLeft:8, padding:6, borderRadius:6, border:'1px solid #e6e8f0'}} />
          </label>
        </div>
        <div style={{marginTop:10}}>
          <button onClick={submitPayment} className="btn-primary">Submit payment for verification</button>
        </div>
      </div>
    </div>
  )
}
