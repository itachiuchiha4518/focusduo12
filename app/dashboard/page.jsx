// app/dashboard/page.jsx — OVERWRITE
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

  // UI exam/subject lists (you can expand later)
  const EXAMS = ['jee','neet']
  const SUBJECTS = {
    jee: ['physics','chemistry','math'],
    neet: ['physics','chemistry','biology']
  }

  const [exam, setExam] = useState('jee')
  const [subject, setSubject] = useState('physics')
  const [mode, setMode] = useState('one-on-one') // or 'group'

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.push('/')
        return
      }
      setUser(u)
      const res = await ensureUserDoc(u.uid, u)
      if (res && res.data) setUserDoc(res.data)
      setLoading(false)
    })
    return ()=> unsub && unsub()
  },[router])

  if (loading) return <div style={{padding:20}}>Loading dashboard...</div>

  return (
    <div style={{padding:20}}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <div>
          <h1 style={{margin:0}}>FocusDuo</h1>
          <div className="muted">Study together. Stay consistent.</div>
        </div>
        <div style={{textAlign:'right'}}>
          <div>{userDoc?.name || user?.displayName || user?.email}</div>
          <div style={{fontSize:12}}>Plan: {userDoc?.plan || 'free'}</div>
        </div>
      </div>

      <div style={{marginTop:20}}>
        <h3>Start a session</h3>
        <div style={{display:'flex', gap:12, alignItems:'center', flexWrap:'wrap'}}>
          <div>
            <label>Exam</label><br/>
            <select value={exam} onChange={e=>{ setExam(e.target.value); setSubject(SUBJECTS[e.target.value][0]) }}>
              {EXAMS.map(x => <option key={x} value={x}>{x.toUpperCase()}</option>)}
            </select>
          </div>

          <div>
            <label>Subject</label><br/>
            <select value={subject} onChange={e=>setSubject(e.target.value)}>
              {(SUBJECTS[exam] || []).map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>

          <div>
            <label>Mode</label><br/>
            <select value={mode} onChange={e=>setMode(e.target.value)}>
              <option value="one-on-one">1-on-1</option>
              <option value="group">Group</option>
            </select>
          </div>

          <div>
            <br/>
            {/* Navigate to join with normalized values (lowercase) */}
            <button className="btn-primary" onClick={()=> router.push(`/join?mode=${encodeURIComponent(mode)}&exam=${encodeURIComponent(exam)}&subject=${encodeURIComponent(subject)}`)}>
              Join {mode === 'one-on-one' ? '1-on-1' : 'Group'}
            </button>
          </div>
        </div>
      </div>

      <div style={{marginTop:28}}>
        <h4>Your stats</h4>
        <div>Current streak: <strong>{userDoc?.currentStreak ?? 0}</strong></div>
        <div>Sessions completed: <strong>{userDoc?.sessionsCompleted ?? 0}</strong></div>
      </div>
    </div>
  )
}
