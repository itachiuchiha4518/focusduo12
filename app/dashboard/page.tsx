// app/dashboard/page.tsx
'use client'
import { useState, useEffect } from 'react'
import { auth, db, doc, getDoc, updateDoc } from '../../lib/firebase'
import { useRouter, useSearchParams } from 'next/navigation'

export default function DashboardPage(){
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [exam, setExam] = useState('JEE')
  const [subject, setSubject] = useState('Physics')
  const router = useRouter()

  useEffect(()=>{
    const unsub = auth.onAuthStateChanged(async (u)=>{
      if(!u) router.push('/')
      else {
        setUser(u)
        const snap = await getDoc(doc(db,'users', u.uid))
        if(snap.exists()){
          const d = snap.data()
          setProfile(d)
          if(d.exam) setExam(d.exam)
          if(d.subjects?.[0]) setSubject(d.subjects[0])
        }
      }
    })
    return () => unsub()
  },[])

  async function saveProfile(){
    if(!user) return
    await updateDoc(doc(db,'users', user.uid), { exam, subjects: [subject] })
    const snap = await getDoc(doc(db,'users', user.uid))
    if(snap.exists()) setProfile(snap.data())
  }

  function join(mode: 'one-on-one'|'group'){
    router.push(`/join?mode=${mode}&exam=${encodeURIComponent(exam)}&subject=${encodeURIComponent(subject)}`)
  }

  if(!profile) return <div className="container p-6">Loading...</div>

  return (
    <div className="container mt-8">
      <div className="bg-white p-6 rounded shadow flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">{profile.name}</div>
          <div className="text-sm text-slate-500">{profile.email}</div>
        </div>
        <div className="text-right">
          <div className="text-sm">🔥 Current streak: {profile.currentStreak || 0}</div>
          <div className="text-sm">Total hours: {profile.totalHours || 0}</div>
          <div className="text-sm">Level: {profile.level || 'Beginner'}</div>
          <div className="mt-2">Plan: {profile.plan}</div>
        </div>
      </div>

      <div className="mt-6 bg-white p-6 rounded shadow">
        <h3 className="font-semibold">Select exam & subject</h3>
        <div className="mt-3 flex gap-3">
          <select value={exam} onChange={(e)=>setExam(e.target.value)} className="p-2 border rounded">
            <option>JEE</option>
            <option>NEET</option>
          </select>
          <select value={subject} onChange={(e)=>setSubject(e.target.value)} className="p-2 border rounded">
            {exam==='JEE' ? (<><option>Physics</option><option>Chemistry</option><option>Math</option></>) : (<><option>Physics</option><option>Chemistry</option><option>Biology</option></>)}
          </select>
          <button onClick={saveProfile} className="px-3 py-1 bg-blue-600 text-white rounded">Save</button>
        </div>

        <div className="mt-6 flex gap-4">
          <button onClick={()=>join('one-on-one')} className="px-4 py-2 bg-white border rounded">Join 1-on-1</button>
          <button onClick={()=>join('group')} className="px-4 py-2 bg-white border rounded">Join group</button>
        </div>
      </div>
    </div>
  )
}
