// app/session/[id]/page.jsx
'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { db, doc, getDoc, setDoc, collection, runTransaction } from '../../../lib/firebase'
import { auth, onAuthStateChanged } from '../../../lib/firebase'
const JitsiRoom = dynamic(() => import('../../../components/JitsiRoom'), { ssr: false })

export default function SessionPage(){
  const router = useRouter()
  const pathname = usePathname()
  const id = pathname?.split('/').pop() || ''
  const [session, setSession] = useState(null)
  const [user, setUser] = useState(null)
  const [joined, setJoined] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(()=>{
    const unsub = onAuthStateChanged(auth, u => setUser(u || null))
    return () => unsub && unsub()
  },[])

  useEffect(()=>{
    if (!id) return
    let mounted = true
    const load = async () => {
      try {
        const snap = await getDoc(doc(db,'sessions', id))
        if (snap.exists()) {
          if (mounted) setSession(snap.data())
        } else {
          setError('Session not found')
        }
      } catch(e){
        console.error('load session', e)
        setError(String(e.message || e))
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    // realtime updates would be nicer — add onSnapshot later if you want
    return ()=> { mounted = false }
  },[id])

  // Start meeting: transaction that flips status -> 'active' and records presence for this user
  async function startMeeting(){
    setError(null)
    if (!user) return alert('Sign in required')
    try {
      await runTransaction(db, async (t) => {
        const sRef = doc(db,'sessions', id)
        const sSnap = await t.get(sRef)
        if (!sSnap.exists()) throw new Error('session-missing')
        const sData = sSnap.data()

        // if session already active, just record presence
        if (sData.status === 'active') {
          const presRef = doc(collection(db, `sessions/${id}/presence`))
          t.set(presRef, { uid: user.uid, joinedAt: new Date().toISOString() })
          return
        }

        // if matched -> set active and create presence
        if (sData.status === 'matched') {
          t.update(sRef, { status: 'active', startedAt: new Date().toISOString() })
          const presRef = doc(collection(db, `sessions/${id}/presence`))
          t.set(presRef, { uid: user.uid, joinedAt: new Date().toISOString() })
          return
        }

        throw new Error('invalid-session-state')
      })

      // reload session and set joined
      const sSnap2 = await getDoc(doc(db,'sessions', id))
      if (sSnap2.exists()) setSession(sSnap2.data())
      setJoined(true)
    } catch(e){
      console.error('startMeeting error', e)
      setError(String(e.message || e))
      alert('Failed to start meeting: ' + (e.message || e))
    }
  }

  if (loading) return <div style={{padding:20}}>Loading session...</div>
  if (error) return <div style={{padding:20, color:'red'}}>Error: {error}</div>
  if (!session) return <div style={{padding:20}}>Session data missing</div>

  const partnerNames = (session.participantNames || []).filter(n => n && n !== (user?.displayName || user?.email) )
  const partnerLabel = partnerNames.length ? partnerNames.join(', ') : (session.participantNames && session.participantNames.length ? session.participantNames[0] : 'Partner')

  return (
    <div style={{padding:20}}>
      <div style={{marginBottom:12}}>
        <h2>Session</h2>
        <div>{session.exam} • {session.subject}</div>
        <div style={{marginTop:8}}>Participants: {session.participants?.length || 1}</div>
        <div style={{marginTop:8}}>Matched with: <strong>{partnerLabel}</strong></div>
        <div style={{marginTop:8}}>Session status: <strong>{session.status}</strong></div>
      </div>

      {!joined ? (
        <div style={{marginTop:12}}>
          <div style={{marginBottom:8}}>Press <strong>Start meeting</strong> to enter the video room. Video will only load after you start.</div>
          <button onClick={startMeeting} className="btn-primary">Start meeting</button>
        </div>
      ) : (
        <div style={{marginTop:12}}>
          <div style={{marginBottom:8}}>You joined. Jitsi is below.</div>
        </div>
      )}

      <div style={{marginTop:18}}>
        {/* only load jitsi UI after joined to avoid pre-start video */}
        {joined && (
          <div style={{height:600}}>
            <JitsiRoom roomId={id} displayName={user?.displayName || user?.email || 'Student'} />
          </div>
        )}
        {!joined && <div style={{padding:20, background:'#fafafa', borderRadius:8}}>Waiting to join video... (click Start meeting)</div>}
      </div>

      <div style={{marginTop:18}}>
        <a href="/dashboard">Back to dashboard</a>
      </div>
    </div>
  )
}
