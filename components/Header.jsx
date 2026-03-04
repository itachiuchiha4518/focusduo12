// components/Header.jsx
'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { auth, provider, signInWithPopup, signOut, onAuthStateChanged } from '../lib/firebase'

const ADMIN_UID = 'NIsbHB9RmXgR5vJEyv8CuV0ggD03'

export default function Header() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u || null))
    return () => unsub && unsub()
  }, [])

  async function handleSignIn() { try { await signInWithPopup(auth, provider) } catch(e){ console.error(e) } }
  async function handleSignOut() { try { await signOut(auth) } catch(e){ console.error(e) } }

  return (
    <header className="header container" style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
      <div>
        <Link href="/"><a className="brand-title">FocusDuo</a></Link>
        <div className="kicker">Study together. Stay consistent.</div>
      </div>

      <div style={{display:'flex', alignItems:'center', gap:12}}>
        {user ? (
          <>
            <div style={{textAlign:'right', fontSize:13, color:'#334155'}}>
              <div style={{fontWeight:600}}>{user.displayName}</div>
              <div style={{color:'#64748b'}}>{user.email}</div>
              <div style={{color:'#475569', fontSize:12, marginTop:6}}>uid: <span style={{fontFamily:'monospace'}}>{user.uid}</span></div>
            </div>

            <div style={{display:'flex', alignItems:'center', gap:8}}>
              <Link href="/dashboard"><a className="btn small">Dashboard</a></Link>
              {user.uid === ADMIN_UID && <Link href="/admin"><a className="btn small">Admin</a></Link>}
              <button onClick={handleSignOut} className="btn small">Sign out</button>
            </div>
          </>
        ) : (
          <button onClick={handleSignIn} className="btn">Continue with Google</button>
        )}
      </div>
    </header>
  )
}
