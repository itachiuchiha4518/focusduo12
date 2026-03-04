// components/Header.jsx
'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { auth, provider, signInWithPopup, signOut, onAuthStateChanged } from '../lib/firebase'

export default function Header() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u) setUser(u)
      else setUser(null)
    })
    return () => unsub && unsub()
  }, [])

  async function handleSignIn() {
    try { await signInWithPopup(auth, provider) } catch(e){ console.error(e) }
  }
  async function handleSignOut() {
    try { await signOut(auth) } catch(e){ console.error(e) }
  }

  return (
    <header className="header container">
      <div className="brand">
        <Link href="/"><a className="brand-title">FocusDuo</a></Link>
        <div className="kicker">Study together. Stay consistent.</div>
      </div>

      <div>
        {user ? (
          <div className="nav-actions">
            <Link href="/dashboard"><a className="btn small">Dashboard</a></Link>
            <button onClick={handleSignOut} className="btn small">Sign out</button>
          </div>
        ) : (
          <button onClick={handleSignIn} className="btn">Continue with Google</button>
        )}
      </div>
    </header>
  )
}
