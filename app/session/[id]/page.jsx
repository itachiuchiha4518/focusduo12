'use client'
import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { db, doc, getDoc, updateDoc, setDoc, collection, runTransaction } from '../../../lib/firebase'
import { auth, onAuthStateChanged } from '../../../lib/firebase'
const JitsiRoom = dynamic(() => import('../../../components/JitsiRoom'), { ssr: false })

export default function SessionPage(){
  const pathname = usePathname()
  const id = pathname.split('/').pop() || ''
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [joined, setJoined] = useState(false)

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, u => setUser(u || null))
    return () => unsub && unsub()
  },[])

  useEffect(()=>{
    if(!id) return
    let mounted = true
    const load = async ()=>{
      try {
        const snap = await getDoc(doc(db,'sessions', id))
        if (snap.exists()) {
          if(mounted) setSession(snap.data())
        } else {
          await setDoc(doc(db,'sessions', id), { participants: [], exam: null, subject: null, mode: 'one-on-one', startTime: new Date().toISOString(), status: 'reserved', reserved: true, holdExpiry: new Date(new Date().getTime() + 10*60000).toISOString() })
          const newSnap = await getDoc(doc(db,'sessions', id))
          if (newSnap.exists() && mounted) setSession(newSnap.data())
        }
      } catch(e){
        console.error('load session error', e)
      } finally {
        if(mounted) setLoading(false)
      }
    }
    load()
    return ()=> { mounted = false }
  },[id])

  // mark presence - when a user joins we finalize charges (move holds -> monthlyUsage) atomically
  async function markJoinedAndFinalize(){
    if(!user) return alert('Sign in first')
    try {
      await runTransaction(db, async (t) => {
        const sRef = doc(db,'sessions', id)
        const sSnap = await t.get(sRef)
        if (!sSnap.exists()) throw new Error('session-missing')
        const sData = sSnap.data()
        // if charges already finalized do nothing, just record presence
        if (!sData.chargesFinalized) {
          // ensure hold hasn't expired
          const now = new Date()
          if (sData.holdExpiry && new Date(sData.holdExpiry) < now) {
            // hold expired — release holds and set session.status to 'expired'
            t.update(sRef, { status: 'expired', reserved: false })
            // release holds for participants
            for (const uid of (sData.participants || [])) {
              const uRef = doc(db,'users', uid)
              const uSnap = await t.get(uRef)
              if (!uSnap.exists()) continue
              const uData = uSnap.data() || {}
              const holds = uData.holds || {}
              const monthKey = new Date().toISOString().slice(0,7)
              const h = holds[monthKey] || { oneOnOne:0, group:0 }
              if (sData.mode === 'one-on-one') h.oneOnOne = Math.max(0, (h.oneOnOne || 0) - 1)
              else h.group = Math.max(0, (h.group || 0) - 1)
              holds[monthKey] = h
              t.update(uRef, { holds })
            }
            throw new Error('hold-expired')
          }

          // finalize: move holds -> monthlyUsage and increment sessionsCompleted
          const monthKey = new Date().toISOString().slice(0,7)
          for (const uid of (sData.participants || [])) {
            const uRef = doc(db,'users', uid)
            const uSnap = await t.get(uRef)
            if (!uSnap.exists()) continue
            const uData = uSnap.data() || {}
            const holds = uData.holds || {}
            const mu = uData.monthlyUsage || {}
            const h = (holds[monthKey] || { oneOnOne:0, group:0 })
            const m = (mu[monthKey] || { oneOnOne:0, group:0 })
            if (sData.mode === 'one-on-one') {
              m.oneOnOne = (m.oneOnOne || 0) + (h.oneOnOne || 0)
              h.oneOnOne = 0
            } else {
              m.group = (m.group || 0) + (h.group || 0)
              h.group = 0
            }
            mu[monthKey] = m
            holds[monthKey] = h
            t.update(uRef, {
              monthlyUsage: mu,
              holds,
              sessionsCompleted: (uData.sessionsCompleted || 0) + 1
            })
          }

          t.update(sRef, { chargesFinalized: true, reserved: false, status: 'active', startedAt: new Date().toISOString() })
        }

        // write presence doc for the user
        const presRef = doc(collection(db, `sessions/${id}/presence`))
        t.set(presRef, { uid: user.uid, joinedAt: new Date().toISOString() })
      })

      setJoined(true)
      // reload session
      const sSnap = await getDoc(doc(db,'sessions', id))
      if (sSnap.exists()) setSession(sSnap.data())
    } catch(e){
      console.error('markJoinedAndFinalize', e)
      if ((String(e.message||'')).includes('hold-expired')) {
        alert('This session hold expired before anyone joined. Please join again or requeue.')
        router.push('/dashboard')
      } else {
        alert('Failed to join session: ' + (e.message || e))
      }
    }
  }

  function goFullScreen(){
    const el = document.querySelector('[data-jitsi-container]')
    if (!el) {
      const c = document.querySelector('.jitsi-container')
      if (c && c.requestFullscreen) c.requestFullscreen()
      return
    }
    if (el.requestFullscreen) el.requestFullscreen()
  }

  if(!id) return <div className="container p-6">Invalid session id</div>

  return (
    <div className="container mt-6">
      <div className="card p-4" style={{display:'flex', justifyContent:'space-between'}}>
        <div>
          <div style={{fontSize:16, fontWeight:700}}>Session</div>
          <div className="muted">{session?.exam || '—'} • {session?.subject || '—'}</div>
        </div>
        <div className="muted">Participants: {session?.participants?.length || 1}</div>
      </div>

      <div style={{marginTop:12}} className="card p-4">
        <div style={{marginBottom:8}}>
          {!joined ? (
            <div>
              <div className="muted">Click <strong>Join meeting</strong> to enter the room and finalize your session credits.</div>
              <div style={{marginTop:8}}>
                <button onClick={markJoinedAndFinalize} className="btn-primary">Join meeting</button>
                <button onClick={goFullScreen} className="btn small" style={{marginLeft:8}}>Fullscreen</button>
              </div>
            </div>
          ) : (
            <div style={{marginBottom:8}}>
              <div style={{color:'#10b981'}}>You have joined the session. Use Jitsi to study. Press "End session" when finished (no automatic deduction now).</div>
              <div style={{marginTop:8}}>
                <button onClick={goFullScreen} className="btn small">Fullscreen</button>
              </div>
            </div>
          )}
        </div>

        <div className="jitsi-container" data-jitsi-container style={{marginTop:12}}>
          <JitsiRoom roomId={id} displayName={user?.displayName || 'Student'} />
        </div>
      </div>
    </div>
  )
    }
