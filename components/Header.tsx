// components/Header.tsx
'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { auth, provider, signInWithPopup, firebaseSignOut } from '../lib/firebase'

export default function Header() {
  const [user, setUser] = useState<any>(null)

  useEffect(()=>{
    const unsub = auth.onAuthStateChanged(u => setUser(u))
    return () => unsub()
  },[])

  async function signIn(){
    try { await signInWithPopup(auth, provider) } catch(e){ console.error(e) }
  }
  async function signOut(){
    try { await firebaseSignOut(auth) } catch(e){ console.error(e) }
  }

  return (
    <header className="header container flex items-center justify-between py-4">
      <div>
        <Link href="/"><a className="text-2xl font-semibold">FocusDuo</a></Link>
        <div className="text-sm text-slate-500">Study together. Stay consistent.</div>
      </div>

      <div>
        {user ? (
          <div className="flex items-center gap-3">
            <Link href="/dashboard"><a className="px-3 py-1 bg-white rounded shadow">Dashboard</a></Link>
            <button onClick={signOut} className="px-3 py-1">Sign out</button>
          </div>
        ) : (
          <button onClick={signIn} className="px-3 py-1 bg-white rounded shadow">Continue with Google</button>
        )}
      </div>
    </header>
  )
}
