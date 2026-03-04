// app/dashboard/page.jsx
'use client'
import { useEffect, useState } from 'react'
import { auth, onAuthStateChanged, db, doc, getDoc, setDoc, updateDoc } from '../../lib/firebase'
import { useRouter } from 'next/navigation'

export default function DashboardPage(){
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [exam, setExam] = useState('JEE')
  const [subject, setSubject] = useState('Physics')
  const router = useRouter()

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
          subjects: []
        }
        if(!snap.exists()){
          await setDoc(userRef, base)
          setProfile(base)
        } else {
          const data = snap.data()
          setProfile({ ...base, ...data })
        }
      }
    })
    return () => unsub && unsub()
  },[])

  async function saveProfile(){
    if(!user) return
    await updateDoc(doc(db,'users', user.uid), { exam, subjects: [subject] })
    const snap = await getDoc(doc(db,'users', user.uid))
    if(snap.exists()) setProfile(snap.data())
  }

  function join(mode){
    router.push(`/join?mode=${mode}&exam=${encodeURIComponent(exam)}&subject=${encodeURIComponent(subject)}`)
  }

  if(!profile) return <div className="container p-6">Loading...</div>

  return (
    <div className="container mt-8">
      <div className="card p-4" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <div style={{fontSize:18, fontWeight:600}}>{profile.name}</div>
          <div className="muted">{profile.email}</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div>🔥 Current streak: {profile.currentStreak || 0}</div>
          <div>Total hours: {profile.totalHours || 0}</div>
          <div>Level: {profile.level || 'Beginner'}</div>
          <div>Plan: {profile.plan}</div>
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

        <div style={{marginTop:12, display:'flex', gap:8}}>
          <button onClick={()=>join('one-on-one')} className="btn">Join 1-on-1</button>
          <button onClick={()=>join('group')} className="btn">Join group</button>
        </div>
      </div>
    </div>
  )
}
