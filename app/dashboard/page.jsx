// app/dashboard/page.jsx  — OVERWRITE this file completely (or insert ensureUserDoc into your existing dashboard's auth handler)
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { auth, onAuthStateChanged, db, doc, getDoc, setDoc } from '../../lib/firebase'

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
      return { created: true }
    }
    return { created: false, data: uSnap.data() }
  } catch(e){
    console.warn('ensureUserDoc failed', e)
    return { error: e }
  }
}

export default function Dashboard(){
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [userDoc, setUserDoc] = useState(null)

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push('/')
        return
      }
      setUser(u)
      // ensure user document exists so the dashboard won't hang
      const res = await ensureUserDoc(u.uid, u)
      if (res.error) {
        console.error(res.error)
      } else if (res.created) {
        // newly created, set defaults
        setUserDoc({
          name: u.displayName || u.email,
          plan: 'free',
          sessionsCompleted: 0,
          totalStudyHours: 0,
          level: 'Beginner'
        })
      } else {
        setUserDoc(res.data)
      }
      setLoading(false)
    })
    return ()=> unsub && unsub()
  },[router])

  if (loading) return <div style={{padding:20}}>Loading dashboard...</div>

  return (
    <div style={{padding:20}}>
      <h2>Dashboard</h2>
      <div style={{marginTop:8}}>
        <div>Name: <strong>{userDoc?.name || user?.displayName || user?.email}</strong></div>
        <div>Plan: <strong>{userDoc?.plan || 'free'}</strong></div>
        <div>Current streak: <strong>{userDoc?.currentStreak ?? 0} days</strong></div>
        <div>Sessions completed: <strong>{userDoc?.sessionsCompleted ?? 0}</strong></div>
      </div>

      <div style={{marginTop:16}}>
        <a href="/join?mode=one-on-one&exam=jee&subject=physics" className="btn">Join 1-on-1 (Physics)</a>
        <a href="/join?mode=group&exam=jee&subject=physics" style={{marginLeft:8}} className="btn">Join Group</a>
      </div>
    </div>
  )
}
