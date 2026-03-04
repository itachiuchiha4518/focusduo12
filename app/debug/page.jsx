'use client'
import { useEffect, useState } from 'react'
import { auth, onAuthStateChanged, db, collection, getDocs, doc, getDoc } from '../../lib/firebase'
import Link from 'next/link'

export default function DebugPage(){
  const [user, setUser] = useState(null)
  const [queues, setQueues] = useState([])
  const [sessions, setSessions] = useState([])
  const [userDoc, setUserDoc] = useState(null)
  const [err, setErr] = useState(null)

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u || null)
    })
    return () => unsub && unsub()
  },[])

  async function load(){
    setErr(null)
    try {
      const qSnap = await getDocs(collection(db,'queues'))
      const sSnap = await getDocs(collection(db,'sessions'))
      const q = []; qSnap.forEach(d=>q.push({ id: d.id, ...d.data() }))
      const s = []; sSnap.forEach(d=>s.push({ id: d.id, ...d.data() }))
      setQueues(q); setSessions(s)
      if(user){
        const udoc = await getDoc(doc(db,'users',user.uid))
        if(udoc.exists()) setUserDoc(udoc.data())
        else setUserDoc(null)
      } else setUserDoc(null)
    } catch(e){
      console.error('debug load error', e)
      setErr(String(e.message || JSON.stringify(e)))
    }
  }

  useEffect(()=>{ load() }, [user])

  return (
    <div className="container mt-8">
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h2>Debug</h2>
        <Link href="/dashboard"><a className="btn small">Dashboard</a></Link>
      </div>

      <div style={{marginTop:12}} className="card p-4">
        <div><strong>Signed in user:</strong> {user ? `${user.displayName} • ${user.email} • uid: ${user.uid}` : 'not signed in'}</div>
        <div style={{marginTop:8}}><strong>User doc:</strong> <pre style={{whiteSpace:'pre-wrap'}}>{userDoc ? JSON.stringify(userDoc,null,2) : 'none'}</pre></div>
        <div style={{marginTop:8}}><strong>Queues ({queues.length}):</strong>
          <pre style={{whiteSpace:'pre-wrap'}}>{queues.length ? JSON.stringify(queues,null,2) : 'none'}</pre>
        </div>
        <div style={{marginTop:8}}><strong>Sessions ({sessions.length}):</strong>
          <pre style={{whiteSpace:'pre-wrap'}}>{sessions.length ? JSON.stringify(sessions,null,2) : 'none'}</pre>
        </div>
        {err && <div style={{marginTop:8,color:'#b91c1c'}}><strong>Debug error:</strong> {err}</div>}
        <div style={{marginTop:12}}><button onClick={load} className="btn">Refresh</button></div>
      </div>
    </div>
  )
}
