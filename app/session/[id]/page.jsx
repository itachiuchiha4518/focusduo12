'use client'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function SessionPage({ params }) {
  const id = params.id
  const [status, setStatus] = useState('initializing')

  useEffect(() => {
    // placeholder: later we will connect to Firestore to get real session status
    setTimeout(()=> setStatus('active'), 800)
  }, [])

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
        <h2>Session — {id}</h2>
        <div><Link href="/dashboard"><button>Back to dashboard</button></Link></div>
      </div>

      <p>Mode: one-on-one</p>
      <p>Session status: <strong style={{color: status === 'active' ? 'green' : '#444'}}>{status}</strong></p>

      <div style={{marginTop:16}}>
        <div style={{width:'100%',height:420, borderRadius:16, overflow:'hidden', background:'#111', color:'#fff', display:'flex',alignItems:'center',justifyContent:'center'}}>
          {/* This is a placeholder area for the video embed. We'll replace with actual WebRTC/Jitsi embed after baseline is stable. */}
          <div style={{textAlign:'center',padding:20}}>
            <div style={{fontSize:20,fontWeight:700}}>Video placeholder</div>
            <div style={{marginTop:8,fontSize:13,opacity:0.9}}>Video UI will appear here</div>
          </div>
        </div>

        <div style={{marginTop:12}}>
          <button>Join meeting</button>
          <button style={{marginLeft:10, background:'#eee', color:'#111'}}>Fullscreen</button>
        </div>
      </div>
    </div>
  )
}
