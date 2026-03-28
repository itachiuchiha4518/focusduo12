'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { auth, googleProvider } from '../../lib/firebase'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'

// ─────────────────────────────────────
// Scroll-triggered fade in
// ─────────────────────────────────────
function FadeIn({ children, delay = 0, y = 28 }) {
  const ref = useRef(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setOn(true); obs.disconnect() }
    }, { threshold: 0.08 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])
  return (
    <div ref={ref} style={{
      opacity: on ? 1 : 0,
      transform: on ? 'none' : `translateY(${y}px)`,
      transition: `opacity 0.75s cubic-bezier(.16,1,.3,1) ${delay}ms, transform 0.75s cubic-bezier(.16,1,.3,1) ${delay}ms`
    }}>
      {children}
    </div>
  )
}

// ─────────────────────────────────────
// Animated number counter
// ─────────────────────────────────────
function Count({ to, suffix = '' }) {
  const [v, setV] = useState(0)
  const ref = useRef(null)
  const started = useRef(false)
  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true
        const t0 = performance.now()
        const dur = 1800
        const tick = now => {
          const p = Math.min((now - t0) / dur, 1)
          const ease = 1 - Math.pow(1 - p, 3)
          setV(Math.floor(ease * to))
          if (p < 1) requestAnimationFrame(tick)
          else setV(to)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.5 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [to])
  return <span ref={ref}>{v}{suffix}</span>
}

// ─────────────────────────────────────
// Sign In Modal
// ─────────────────────────────────────
function AuthModal({ onClose, onSuccess }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr]   = useState('')

  async function handleGoogle() {
    setBusy(true); setErr('')
    try {
      await signInWithPopup(auth, googleProvider)
      onSuccess()
    } catch (e) {
      setErr('Sign in failed. Please try again.')
      console.error(e)
    } finally { setBusy(false) }
  }

  // Close on backdrop click
  function onBackdrop(e) { if (e.target === e.currentTarget) onClose() }

  return (
    <div onClick={onBackdrop} style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
      animation: 'fadeIn .2s ease'
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#13192a',
        border: '1px solid rgba(99,179,237,0.25)',
        borderRadius: 24, padding: 36,
        animation: 'slideUp .3s cubic-bezier(.16,1,.3,1)',
        position: 'relative'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(255,255,255,0.07)', border: 'none',
          borderRadius: 8, color: '#94a3b8', cursor: 'pointer',
          width: 32, height: 32, fontSize: 18, display: 'flex',
          alignItems: 'center', justifyContent: 'center'
        }}>×</button>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
          <h2 style={{ fontFamily: 'Syne, sans-serif', fontSize: 24, fontWeight: 900, color: '#e2e8f0', margin: 0, marginBottom: 8 }}>
            Join FocusDuo
          </h2>
          <p style={{ color: '#718096', fontSize: 14, lineHeight: 1.6, margin: 0 }}>
            Sign in with Google to start matching with study partners. Free — no card needed.
          </p>
        </div>

        {/* Google sign in button */}
        <button onClick={handleGoogle} disabled={busy} style={{
          width: '100%', padding: '14px 20px', borderRadius: 14,
          border: '1px solid rgba(255,255,255,0.12)',
          background: busy ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.08)',
          color: '#e2e8f0', fontWeight: 700, fontSize: 15,
          cursor: busy ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          transition: 'all 0.2s', fontFamily: 'DM Sans, sans-serif'
        }}>
          {/* Google SVG */}
          {!busy && (
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"/>
              <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
              <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238A11.91 11.91 0 0 1 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"/>
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303a12.04 12.04 0 0 1-4.087 5.571l.003-.002 6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"/>
            </svg>
          )}
          {busy ? '⏳ Signing in...' : 'Continue with Google'}
        </button>

        {err && (
          <div style={{ marginTop: 12, padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', fontSize: 13, textAlign: 'center' }}>
            {err}
          </div>
        )}

        <div style={{ marginTop: 20, textAlign: 'center' }}>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            {['✅ Free to start', '🔒 Google secured', '📱 Works on mobile'].map(t => (
              <span key={t} style={{ fontSize: 12, color: '#4a5568', fontWeight: 600 }}>{t}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────
// Matchmaking demo — works for both
// logged in (redirects) and logged out (shows modal)
// ─────────────────────────────────────
const NAMES = ['Arjun K.', 'Priya S.', 'Rahul M.', 'Sneha P.', 'Dev R.', 'Ananya T.']

function MatchCard({ user, onOpenAuth }) {
  const router  = useRouter()
  const [exam, setExam]     = useState('JEE')
  const [subj, setSubj]     = useState('Physics')
  const [phase, setPhase]   = useState('idle')
  const [dots, setDots]     = useState('')
  const [partner, setPartner] = useState('')

  useEffect(() => {
    if (phase !== 'searching') return
    const di = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 380)
    const ti = setTimeout(() => {
      setPartner(NAMES[Math.floor(Math.random() * NAMES.length)])
      setPhase('matched')
    }, 2400)
    return () => { clearInterval(di); clearTimeout(ti) }
  }, [phase])

  useEffect(() => {
    if (phase !== 'matched') return
    const t = setTimeout(() => router.push('/join'), 1600)
    return () => clearTimeout(t)
  }, [phase, router])

  function start() {
    if (phase !== 'idle') return
    if (!user) { onOpenAuth(); return }
    setPhase('searching')
  }

  function reset() { setPhase('idle'); setPartner(''); setDots('') }

  return (
    <div style={{
      background: 'rgba(19,25,42,0.9)',
      border: '1px solid rgba(99,179,237,0.22)',
      borderRadius: 22, padding: 26, width: '100%', maxWidth: 400,
      backdropFilter: 'blur(12px)',
      boxShadow: '0 24px 64px rgba(0,0,0,0.4)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#68d391', boxShadow: '0 0 8px #68d391', animation: 'pulse 2s infinite' }} />
        <span style={{ fontSize: 12, fontWeight: 700, color: '#68d391', letterSpacing: 1, textTransform: 'uppercase' }}>Live matchmaker</span>
      </div>

      {/* Exam selector */}
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#4a5568', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Exam</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['JEE', 'NEET'].map(e => (
            <button key={e} onClick={() => phase === 'idle' && setExam(e)} style={{
              flex: 1, padding: '10px 0', borderRadius: 10, fontWeight: 800, fontSize: 14,
              border: 'none', cursor: 'pointer', transition: 'all 0.2s',
              background: exam === e
                ? 'linear-gradient(135deg,#3182ce,#6b46c1)'
                : 'rgba(255,255,255,0.06)',
              color: exam === e ? '#fff' : '#718096',
              boxShadow: exam === e ? '0 4px 14px rgba(49,130,206,0.35)' : 'none'
            }}>{e}</button>
          ))}
        </div>
      </div>

      {/* Subject selector */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#4a5568', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 8 }}>Subject</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {['Physics', 'Chemistry', 'Math', 'Biology'].map(s => (
            <button key={s} onClick={() => phase === 'idle' && setSubj(s)} style={{
              padding: '9px 0', borderRadius: 10, fontWeight: 700, fontSize: 13,
              border: `1px solid ${subj === s ? 'rgba(99,179,237,0.5)' : 'rgba(255,255,255,0.07)'}`,
              background: subj === s ? 'rgba(99,179,237,0.12)' : 'rgba(255,255,255,0.04)',
              color: subj === s ? '#63b3ed' : '#718096', cursor: 'pointer', transition: 'all 0.15s'
            }}>{s}</button>
          ))}
        </div>
      </div>

      {/* Action area */}
      {phase === 'idle' && (
        <button onClick={start} style={{
          width: '100%', padding: '15px 0', borderRadius: 14, fontWeight: 900, fontSize: 16,
          border: 'none', cursor: 'pointer', letterSpacing: 0.3,
          background: 'linear-gradient(135deg, #3182ce 0%, #6b46c1 100%)',
          color: '#fff', boxShadow: '0 8px 24px rgba(49,130,206,0.4)',
          transition: 'transform 0.15s, box-shadow 0.15s',
          fontFamily: 'DM Sans, sans-serif'
        }}
          onMouseEnter={e => { e.target.style.transform = 'translateY(-2px)'; e.target.style.boxShadow = '0 12px 32px rgba(49,130,206,0.5)' }}
          onMouseLeave={e => { e.target.style.transform = 'none'; e.target.style.boxShadow = '0 8px 24px rgba(49,130,206,0.4)' }}
        >
          {user ? `Find ${exam} ${subj} partner →` : '🔐 Sign in & start →'}
        </button>
      )}

      {phase === 'searching' && (
        <div style={{ textAlign: 'center', padding: '10px 0' }}>
          <div style={{ width: 48, height: 48, margin: '0 auto 14px', borderRadius: '50%', border: '3px solid transparent', borderTopColor: '#63b3ed', animation: 'spin 0.8s linear infinite' }} />
          <div style={{ color: '#63b3ed', fontWeight: 700, fontSize: 15, marginBottom: 6 }}>
            Searching{dots}
          </div>
          <div style={{ color: '#4a5568', fontSize: 13 }}>Finding you a {exam} {subj} partner</div>
        </div>
      )}

      {phase === 'matched' && (
        <div style={{ textAlign: 'center', padding: '8px 0', animation: 'slideUp 0.4s ease' }}>
          <div style={{ fontSize: 42, marginBottom: 10 }}>🎉</div>
          <div style={{ color: '#68d391', fontWeight: 900, fontSize: 18, marginBottom: 6 }}>
            Matched with {partner}!
          </div>
          <div style={{ color: '#718096', fontSize: 13 }}>Opening your session...</div>
        </div>
      )}

      {!user && phase === 'idle' && (
        <div style={{ marginTop: 12, textAlign: 'center' }}>
          <span style={{ fontSize: 12, color: '#4a5568' }}>Free · Google sign in · No card needed</span>
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────
export default function HomePage() {
  const router = useRouter()
  const [user, setUser]         = useState(null)
  const [authReady, setReady]   = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => { setUser(u || null); setReady(true) })
    return () => unsub()
  }, [])

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 50)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const handleSignOut = useCallback(() => signOut(auth), [])

  function openAuth() { setShowAuth(true) }

  function onAuthSuccess() {
    setShowAuth(false)
    router.push('/join')
  }

  function handleCTA() {
    if (user) router.push('/join')
    else setShowAuth(true)
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap');

        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html{scroll-behavior:smooth}
        body{
          background:#0a0e1a;
          color:#e2e8f0;
          font-family:'DM Sans',system-ui,sans-serif;
          overflow-x:hidden;
          -webkit-font-smoothing:antialiased;
        }

        :root{
          --blue:#3182ce; --violet:#6b46c1; --green:#68d391;
          --bg:#0a0e1a; --surface:#0f1628; --border:rgba(255,255,255,0.07);
          --muted:#718096; --text:#e2e8f0;
        }

        /* Typography */
        .display{
          font-family:'Syne',sans-serif;
          font-size:clamp(42px,8vw,90px);
          font-weight:900;
          line-height:.97;
          letter-spacing:-3px;
        }
        .h2{
          font-family:'Syne',sans-serif;
          font-size:clamp(30px,4.5vw,56px);
          font-weight:900;
          line-height:1.08;
          letter-spacing:-1.5px;
        }
        .label{
          font-size:11px;
          font-weight:800;
          letter-spacing:2.5px;
          text-transform:uppercase;
        }
        .gtext{
          background:linear-gradient(135deg,#63b3ed 0%,#b794f4 55%,#68d391 100%);
          -webkit-background-clip:text;
          -webkit-text-fill-color:transparent;
          background-clip:text;
        }

        /* Buttons */
        .btn-primary{
          display:inline-flex;align-items:center;gap:8px;
          padding:14px 30px;border-radius:14px;border:none;
          background:linear-gradient(135deg,#3182ce,#6b46c1);
          color:#fff;font-weight:800;font-size:15px;cursor:pointer;
          transition:transform .2s,box-shadow .2s;
          text-decoration:none;font-family:'DM Sans',sans-serif;
          box-shadow:0 4px 20px rgba(49,130,206,.3);
          white-space:nowrap;
        }
        .btn-primary:hover{transform:translateY(-2px);box-shadow:0 8px 32px rgba(49,130,206,.5)}
        .btn-ghost{
          display:inline-flex;align-items:center;gap:8px;
          padding:13px 26px;border-radius:14px;
          border:1px solid rgba(255,255,255,0.12);
          background:rgba(255,255,255,0.05);
          color:#e2e8f0;font-weight:700;font-size:15px;cursor:pointer;
          transition:all .2s;text-decoration:none;
          font-family:'DM Sans',sans-serif;white-space:nowrap;
        }
        .btn-ghost:hover{background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.25)}
        .btn-sm{padding:9px 18px;font-size:13px;border-radius:10px}

        /* Cards */
        .card{
          background:var(--surface);
          border:1px solid var(--border);
          border-radius:20px;padding:26px;
          transition:transform .25s,border-color .25s,box-shadow .25s;
        }
        .card:hover{
          transform:translateY(-5px);
          border-color:rgba(99,130,237,.3);
          box-shadow:0 24px 48px rgba(0,0,0,.4);
        }

        /* Grid dot bg */
        .dotgrid{
          background-image:radial-gradient(rgba(99,179,237,.18) 1px,transparent 1px);
          background-size:32px 32px;
        }

        /* Animations */
        @keyframes fadeIn{from{opacity:0}to{opacity:1}}
        @keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.6;transform:scale(1.3)}}
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(49,130,206,.3)}50%{box-shadow:0 0 40px rgba(107,70,193,.5)}}

        .float{animation:float 5s ease-in-out infinite}
        .glow{animation:glow 3s ease-in-out infinite}

        /* Live indicator */
        .live{display:inline-flex;align-items:center;gap:6px}
        .live::before{
          content:'';width:7px;height:7px;border-radius:50%;
          background:#68d391;display:block;
          box-shadow:0 0 0 0 rgba(104,211,145,.6);
          animation:liveRing 2s ease-out infinite;
        }
        @keyframes liveRing{
          0%{box-shadow:0 0 0 0 rgba(104,211,145,.6)}
          70%{box-shadow:0 0 0 8px rgba(104,211,145,0)}
          100%{box-shadow:0 0 0 0 rgba(104,211,145,0)}
        }

        /* Responsive */
        @media(max-width:768px){
          .hide-m{display:none!important}
          .col-m{flex-direction:column!important;align-items:stretch!important}
          .center-m{text-align:center!important}
          .display{letter-spacing:-2px}
        }
      `}</style>

      {/* Auth modal */}
      {showAuth && (
        <AuthModal onClose={() => setShowAuth(false)} onSuccess={onAuthSuccess} />
      )}

      {/* ── NAVBAR ─────────────────────────────────── */}
      <nav style={{
        position:'fixed', top:0, left:0, right:0, zIndex:200,
        height:60, padding:'0 20px',
        display:'flex', alignItems:'center', justifyContent:'space-between', gap:12,
        background: scrolled ? 'rgba(10,14,26,0.95)' : 'transparent',
        backdropFilter: scrolled ? 'blur(24px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
        transition:'all 0.3s'
      }}>
        {/* Logo */}
        <Link href="/" style={{ textDecoration:'none', flexShrink:0 }}>
          <span style={{ fontFamily:'Syne,sans-serif', fontSize:22, fontWeight:900, color:'#e2e8f0', letterSpacing:-0.5 }}>
            Focus<span className="gtext">Duo</span>
          </span>
        </Link>

        {/* Center links */}
        <div className="hide-m" style={{ display:'flex', gap:4, alignItems:'center' }}>
          {[['Dashboard','/dashboard'],['Plans','/plans'],['Leaderboard','/leaderboard']].map(([l,h]) => (
            <Link key={l} href={h} style={{ padding:'7px 14px', borderRadius:10, color:'#718096', textDecoration:'none', fontSize:14, fontWeight:600, transition:'color .2s' }}
              onMouseEnter={e=>e.target.style.color='#e2e8f0'}
              onMouseLeave={e=>e.target.style.color='#718096'}
            >{l}</Link>
          ))}
        </div>

        {/* Auth area */}
        <div style={{ display:'flex', gap:8, alignItems:'center', flexShrink:0 }}>
          {!authReady ? (
            <div style={{ width:72, height:34, borderRadius:10, background:'rgba(255,255,255,0.06)', animation:'pulse 1.5s infinite' }} />
          ) : user ? (
            <>
              <div className="hide-m" style={{ display:'flex', alignItems:'center', gap:8 }}>
                {user.photoURL && <img src={user.photoURL} alt="" style={{ width:28, height:28, borderRadius:'50%', border:'2px solid rgba(99,179,237,.4)' }} />}
                <span style={{ fontSize:13, color:'#94a3b8', maxWidth:100, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {user.displayName?.split(' ')[0] || 'You'}
                </span>
              </div>
              <Link href="/join" className="btn-primary btn-sm">Study now →</Link>
              <button onClick={handleSignOut} className="btn-ghost btn-sm hide-m">Sign out</button>
            </>
          ) : (
            <>
              <button onClick={openAuth} className="btn-ghost btn-sm">Sign in</button>
              <button onClick={openAuth} className="btn-primary btn-sm">Sign up free →</button>
            </>
          )}
        </div>
      </nav>

      {/* ── HERO ───────────────────────────────────── */}
      <section className="dotgrid" style={{
        minHeight:'100vh', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        padding:'100px 24px 80px', position:'relative', overflow:'hidden'
      }}>
        {/* Ambient gradients */}
        <div style={{ position:'absolute', top:'10%', left:'-5%', width:600, height:600, borderRadius:'50%', background:'radial-gradient(circle,rgba(49,130,206,.18) 0%,transparent 65%)', filter:'blur(50px)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:'5%', right:'-5%', width:500, height:500, borderRadius:'50%', background:'radial-gradient(circle,rgba(107,70,193,.16) 0%,transparent 65%)', filter:'blur(50px)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', top:'50%', left:'50%', transform:'translate(-50%,-50%)', width:800, height:300, background:'radial-gradient(ellipse,rgba(49,130,206,.08) 0%,transparent 70%)', filter:'blur(30px)', pointerEvents:'none' }} />

        <div style={{ maxWidth:1120, width:'100%', position:'relative', zIndex:1 }}>

          {/* Badge */}
          <div style={{ display:'flex', justifyContent:'center', marginBottom:32, animation:'slideUp 0.5s ease both' }}>
            <div className="live" style={{
              padding:'7px 18px', borderRadius:999,
              border:'1px solid rgba(104,211,145,.3)',
              background:'rgba(104,211,145,.07)',
              fontSize:13, fontWeight:700, color:'#68d391'
            }}>
              Students studying right now · India
            </div>
          </div>

          {/* Main layout */}
          <div style={{ display:'flex', gap:56, alignItems:'center', flexWrap:'wrap' }} className="col-m">

            {/* Left — text */}
            <div style={{ flex:'1 1 440px', animation:'slideUp 0.6s ease 0.1s both' }}>
              <h1 className="display center-m">
                Stop studying<br />
                <span className="gtext">alone.</span>
              </h1>

              <p style={{ fontSize:'clamp(15px,1.8vw,18px)', color:'#718096', lineHeight:1.75, marginTop:22, maxWidth:480 }}>
                Get matched with a serious JEE or NEET student in under 30 seconds.
                Video call, stay accountable, actually finish what you planned.
              </p>

              {/* CTA row */}
              <div style={{ display:'flex', gap:12, marginTop:32, flexWrap:'wrap' }} className="col-m">
                <button onClick={handleCTA} className="btn-primary" style={{ fontSize:16, padding:'15px 32px' }}>
                  {user ? 'Start studying now →' : 'Get started free →'}
                </button>
                {!user && (
                  <button onClick={openAuth} className="btn-ghost" style={{ fontSize:15 }}>
                    Sign in
                  </button>
                )}
                {user && (
                  <Link href="/dashboard" className="btn-ghost">
                    My dashboard
                  </Link>
                )}
              </div>

              {/* Chips */}
              <div style={{ display:'flex', gap:8, marginTop:24, flexWrap:'wrap' }}>
                {['✅ 10 free sessions', '⚡ Matched in 30s', '🔒 Google sign in', '📱 Mobile ready'].map(t => (
                  <div key={t} style={{ padding:'5px 13px', borderRadius:999, fontSize:12, fontWeight:600, background:'rgba(255,255,255,0.05)', border:'1px solid rgba(255,255,255,0.08)', color:'#4a5568' }}>
                    {t}
                  </div>
                ))}
              </div>
            </div>

            {/* Right — match card */}
            <div className="float" style={{ flex:'1 1 360px', display:'flex', justifyContent:'center', animation:'slideUp 0.6s ease 0.2s both' }}>
              <MatchCard user={user} onOpenAuth={openAuth} />
            </div>
          </div>
        </div>

        {/* Scroll hint */}
        <div style={{ position:'absolute', bottom:32, left:'50%', transform:'translateX(-50%)', display:'flex', flexDirection:'column', alignItems:'center', gap:6, opacity:0.3, animation:'float 3s ease-in-out infinite' }}>
          <div style={{ width:1, height:40, background:'linear-gradient(to bottom,transparent,#718096)' }} />
          <span style={{ fontSize:10, fontWeight:700, letterSpacing:2, color:'#718096', textTransform:'uppercase' }}>Scroll</span>
        </div>
      </section>

      {/* ── STATS ──────────────────────────────────── */}
      <section style={{ padding:'64px 24px', borderTop:'1px solid var(--border)', borderBottom:'1px solid var(--border)' }}>
        <FadeIn>
          <div style={{ maxWidth:900, margin:'0 auto', display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:40, textAlign:'center' }}>
            {[
              { n:10,  s:'+',  l:'Free sessions' },
              { n:30,  s:'s',  l:'To get matched' },
              { n:99,  s:'₹',  l:'Per month only' },
              { n:4,   s:'',   l:'Subjects covered' },
            ].map(({ n, s, l }) => (
              <div key={l}>
                <div style={{ fontFamily:'Syne,sans-serif', fontSize:'clamp(36px,5vw,60px)', fontWeight:900, lineHeight:1 }}>
                  <span className="gtext">
                    {s === '₹' ? '₹' : ''}<Count to={n} suffix={s === '₹' ? '' : s} />
                  </span>
                </div>
                <div style={{ color:'#4a5568', fontSize:14, marginTop:10, fontWeight:600 }}>{l}</div>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ── HOW IT WORKS ───────────────────────────── */}
      <section style={{ padding:'100px 24px', maxWidth:1100, margin:'0 auto' }}>
        <FadeIn>
          <div style={{ textAlign:'center', marginBottom:60 }}>
            <div className="label" style={{ color:'#63b3ed', marginBottom:14 }}>Simple as it gets</div>
            <h2 className="h2">How it works</h2>
          </div>
        </FadeIn>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(240px,1fr))', gap:16 }}>
          {[
            { n:'01', e:'📚', t:'Pick your subject',      d:'Choose exam, subject, and mode — 1-on-1 or group.', delay:0 },
            { n:'02', e:'⚡', t:'Match in seconds',        d:'Paired with a serious student in the same subject — under 30 seconds.', delay:80 },
            { n:'03', e:'🎯', t:'Set your chapter',        d:'First 2 minutes to agree on chapter. Leave early = credit not used.', delay:160 },
            { n:'04', e:'🔥', t:'Study & build streaks',   d:'Complete sessions to build your streak and climb the leaderboard.', delay:240 },
          ].map(({ n, e, t, d, delay }) => (
            <FadeIn key={n} delay={delay}>
              <div className="card">
                <div className="label" style={{ color:'rgba(255,255,255,0.2)', marginBottom:18 }}>{n}</div>
                <div style={{ fontSize:36, marginBottom:14 }}>{e}</div>
                <div style={{ fontFamily:'Syne,sans-serif', fontSize:18, fontWeight:800, marginBottom:10, lineHeight:1.2 }}>{t}</div>
                <div style={{ color:'#718096', lineHeight:1.75, fontSize:14 }}>{d}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── VS SECTION ─────────────────────────────── */}
      <section style={{ padding:'100px 24px', background:'linear-gradient(180deg,transparent,rgba(49,130,206,0.04),transparent)' }}>
        <div style={{ maxWidth:760, margin:'0 auto' }}>
          <FadeIn>
            <div style={{ textAlign:'center', marginBottom:48 }}>
              <div className="label" style={{ color:'#b794f4', marginBottom:14 }}>Honest comparison</div>
              <h2 className="h2">Why not Discord or Zoom?</h2>
              <p style={{ color:'#718096', marginTop:14, fontSize:16, lineHeight:1.75 }}>
                Those are free. But they have one problem FocusDuo actually solves.
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={100}>
            <div style={{ background:'var(--surface)', borderRadius:22, overflow:'hidden', border:'1px solid var(--border)', boxShadow:'0 24px 64px rgba(0,0,0,.5)' }}>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 1fr', padding:'18px 28px', background:'rgba(255,255,255,.02)', borderBottom:'1px solid var(--border)' }}>
                <div style={{ textAlign:'center', fontFamily:'Syne,sans-serif', fontWeight:900, color:'#63b3ed', fontSize:15 }}>FocusDuo ✅</div>
                <div />
                <div style={{ textAlign:'center', fontWeight:700, color:'#4a5568', fontSize:14 }}>Discord / Zoom</div>
              </div>
              <div style={{ padding:'4px 28px 20px' }}>
                {[
                  { f:'Finding a partner', us:'Auto-matched in 30s',   them:'Beg in a server',        w:'us' },
                  { f:'Accountability',    us:'Timer + streak system',  them:'None',                   w:'us' },
                  { f:'Distractions',      us:'Study-only space',       them:'Memes & gaming channels',w:'us' },
                  { f:'Cost',              us:'Free tier available',    them:'Free',                   w:'them' },
                  { f:'Mobile quality',    us:'Optimised for India',    them:'Heavy & laggy',          w:'us' },
                  { f:'Report bad actors', us:'One-tap system',         them:'Nothing',                w:'us' },
                  { f:'Session tracking',  us:'History + streaks',      them:'No tracking',            w:'us' },
                ].map(({ f, us, them, w }) => (
                  <div key={f} style={{ display:'grid', gridTemplateColumns:'1fr 100px 1fr', gap:8, alignItems:'center', padding:'10px 0', borderBottom:'1px solid rgba(255,255,255,0.04)' }}>
                    <div style={{ padding:'8px 14px', borderRadius:10, textAlign:'center', fontWeight:700, fontSize:13, background: w==='us' ? 'rgba(104,211,145,.1)' : 'rgba(255,255,255,.04)', color: w==='us' ? '#68d391' : '#718096', border: w==='us' ? '1px solid rgba(104,211,145,.22)' : '1px solid transparent' }}>{us}</div>
                    <div style={{ textAlign:'center', color:'#2d3748', fontSize:11, fontWeight:700 }}>{f}</div>
                    <div style={{ padding:'8px 14px', borderRadius:10, textAlign:'center', fontWeight:700, fontSize:13, background:'rgba(255,255,255,.04)', color:'#718096', border:'1px solid transparent' }}>{them}</div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={200}>
            <div style={{ textAlign:'center', marginTop:28, color:'#4a5568', fontSize:15, lineHeight:1.8 }}>
              Discord finds you a distraction.<br />
              <strong style={{ color:'#e2e8f0' }}>FocusDuo finds you a study partner.</strong>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────── */}
      <section style={{ padding:'100px 24px', maxWidth:1100, margin:'0 auto' }}>
        <FadeIn>
          <div style={{ textAlign:'center', marginBottom:60 }}>
            <div className="label" style={{ color:'#b794f4', marginBottom:14 }}>Everything you need</div>
            <h2 className="h2">Built for serious students</h2>
          </div>
        </FadeIn>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:14 }}>
          {[
            { e:'📹', t:'HD video call',          d:'Optimised for Jio, Airtel, Wi-Fi. Clear video on any phone.', delay:0 },
            { e:'🔥', t:'Streak system',           d:'Study every day to build your streak. Paid users get shields.', delay:60 },
            { e:'🏆', t:'Weekly leaderboard',      d:'Top students by sessions and streaks ranked publicly every week.', delay:120 },
            { e:'⚡', t:'Priority matching',        d:'Paid users skip the queue. Get matched before free users every time.', delay:180 },
            { e:'📊', t:'Session history',         d:'Full history for paid users. Free users see last 5.', delay:240 },
            { e:'🛡️', t:'Safe & moderated',        d:'One-tap report. Team reviews and bans within hours.', delay:300 },
            { e:'🎯', t:'Chapter selection',       d:'2 min to pick your chapter. Leave early = no credit charged.', delay:360 },
            { e:'🔗', t:'Referral rewards',        d:'Refer a friend — both get bonus sessions immediately.', delay:420 },
          ].map(({ e, t, d, delay }) => (
            <FadeIn key={t} delay={delay}>
              <div className="card">
                <div style={{ fontSize:34, marginBottom:14 }}>{e}</div>
                <div style={{ fontFamily:'Syne,sans-serif', fontSize:16, fontWeight:800, marginBottom:8, lineHeight:1.2 }}>{t}</div>
                <div style={{ color:'#718096', lineHeight:1.75, fontSize:14 }}>{d}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── PRICING ────────────────────────────────── */}
      <section style={{ padding:'100px 24px', background:'rgba(15,22,40,0.6)' }}>
        <div style={{ maxWidth:960, margin:'0 auto' }}>
          <FadeIn>
            <div style={{ textAlign:'center', marginBottom:56 }}>
              <div className="label" style={{ color:'#68d391', marginBottom:14 }}>Honest pricing</div>
              <h2 className="h2">Start free. Upgrade when ready.</h2>
              <p style={{ color:'#718096', marginTop:14, fontSize:16 }}>
                Pay via UPI. No card. No auto-charge. Ever.
              </p>
            </div>
          </FadeIn>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:14, marginBottom:16 }}>

            {/* Free */}
            <FadeIn delay={0}>
              <div className="card">
                <div className="label" style={{ color:'#4a5568', marginBottom:8 }}>Free forever</div>
                <div style={{ fontFamily:'Syne,sans-serif', fontSize:44, fontWeight:900, marginBottom:4 }}>₹0</div>
                <div style={{ color:'#4a5568', fontSize:14, marginBottom:20 }}>No card ever</div>
                {['10 one-on-one sessions','10 group sessions','30 min per session','Streak tracking','Leaderboard access'].map(f => (
                  <div key={f} style={{ display:'flex', alignItems:'center', gap:10, fontSize:14, color:'#718096', marginBottom:9 }}>
                    <span style={{ color:'#68d391', fontSize:12, flexShrink:0 }}>✓</span>{f}
                  </div>
                ))}
                <div style={{ marginTop:20 }}>
                  <button onClick={handleCTA} className="btn-ghost" style={{ width:'100%', justifyContent:'center', fontSize:14 }}>
                    {user ? 'Go study →' : 'Start free →'}
                  </button>
                </div>
              </div>
            </FadeIn>

            {/* Plus */}
            <FadeIn delay={80}>
              <div className="card glow" style={{ border:'1px solid rgba(99,130,237,0.45)', position:'relative', overflow:'hidden' }}>
                <div style={{ position:'absolute', top:0, left:0, right:0, height:3, background:'linear-gradient(90deg,#3182ce,#6b46c1)' }} />
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:8 }}>
                  <div className="label" style={{ color:'#63b3ed' }}>Plus</div>
                  <div style={{ padding:'4px 12px', borderRadius:999, fontSize:11, fontWeight:800, background:'linear-gradient(90deg,#3182ce,#6b46c1)', color:'#fff' }}>POPULAR</div>
                </div>
                <div style={{ fontFamily:'Syne,sans-serif', fontSize:44, fontWeight:900, marginBottom:4 }}>
                  <span className="gtext">₹99</span>
                </div>
                <div style={{ color:'#4a5568', fontSize:14, marginBottom:20 }}>per month · ₹199 for 3 months</div>
                {['Unlimited sessions','60 min per session','⚡ Priority matching queue','Full session history','1 streak shield / month'].map(f => (
                  <div key={f} style={{ display:'flex', alignItems:'center', gap:10, fontSize:14, color:'#e2e8f0', marginBottom:9 }}>
                    <span style={{ color:'#68d391', fontSize:12, flexShrink:0 }}>✓</span>{f}
                  </div>
                ))}
                <div style={{ marginTop:20 }}>
                  <Link href="/plans" className="btn-primary" style={{ width:'100%', justifyContent:'center', fontSize:14, display:'flex' }}>
                    Upgrade for ₹99 →
                  </Link>
                </div>
              </div>
            </FadeIn>

            {/* Pro */}
            <FadeIn delay={160}>
              <div className="card" style={{ border:'1px solid rgba(246,224,94,0.25)' }}>
                <div className="label" style={{ color:'#f6e05e', marginBottom:8 }}>Pro · Best value</div>
                <div style={{ fontFamily:'Syne,sans-serif', fontSize:44, fontWeight:900, marginBottom:4 }}>
                  <span style={{ background:'linear-gradient(135deg,#f6e05e,#ed8936)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', backgroundClip:'text' }}>₹699</span>
                </div>
                <div style={{ color:'#4a5568', fontSize:14, marginBottom:4 }}>per year · <s>₹1188</s></div>
                <div style={{ color:'#68d391', fontSize:12, fontWeight:700, marginBottom:20 }}>Save ₹489 vs monthly</div>
                {['Everything in Plus','Unlimited session length','3 streak shields / month','Pro badge on leaderboard','Early feature access'].map(f => (
                  <div key={f} style={{ display:'flex', alignItems:'center', gap:10, fontSize:14, color:'#e2e8f0', marginBottom:9 }}>
                    <span style={{ color:'#f6e05e', fontSize:12, flexShrink:0 }}>✓</span>{f}
                  </div>
                ))}
                <div style={{ marginTop:20 }}>
                  <Link href="/plans" className="btn-ghost" style={{ width:'100%', justifyContent:'center', fontSize:14, display:'flex', borderColor:'rgba(246,224,94,.25)' }}>
                    Get yearly →
                  </Link>
                </div>
              </div>
            </FadeIn>
          </div>

          {/* Early bird */}
          <FadeIn delay={240}>
            <div style={{
              padding:'20px 26px', borderRadius:18,
              background:'linear-gradient(135deg,rgba(239,68,68,.1),rgba(107,70,193,.1))',
              border:'1px solid rgba(239,68,68,.25)',
              display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:14
            }}>
              <div>
                <div style={{ fontWeight:900, fontSize:16, marginBottom:5 }}>
                  🔥 Early Bird — <span className="gtext">₹199/year</span>
                  <span style={{ fontSize:13, color:'#4a5568', fontWeight:500 }}> · First 100 buyers only</span>
                </div>
                <div style={{ color:'#718096', fontSize:14 }}>Full Pro plan at ₹199. Price locked in forever even when it goes up.</div>
              </div>
              <Link href="/plans" className="btn-primary" style={{ background:'linear-gradient(135deg,#ef4444,#6b46c1)', whiteSpace:'nowrap' }}>
                Claim ₹199 deal →
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FINAL CTA ──────────────────────────────── */}
      <section style={{ padding:'100px 24px', position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', inset:0, background:'radial-gradient(ellipse at 50% 100%,rgba(49,130,206,.12) 0%,transparent 65%)', pointerEvents:'none' }} />
        <FadeIn>
          <div style={{ textAlign:'center', maxWidth:620, margin:'0 auto', position:'relative' }}>
            <h2 className="h2">
              Your rank won't improve<br />
              <span className="gtext">studying alone.</span>
            </h2>
            <p style={{ color:'#718096', fontSize:18, lineHeight:1.75, marginTop:20, marginBottom:36 }}>
              Every topper has an accountability partner.
              FocusDuo gives you one in 30 seconds. Free.
            </p>
            <div style={{ display:'flex', gap:12, justifyContent:'center', flexWrap:'wrap' }}>
              <button onClick={handleCTA} className="btn-primary" style={{ fontSize:17, padding:'16px 36px' }}>
                {user ? 'Start studying now →' : 'Get started free →'}
              </button>
              <Link href="/plans" className="btn-ghost" style={{ fontSize:16 }}>See plans</Link>
            </div>
            <div style={{ color:'#2d3748', fontSize:12, marginTop:20, letterSpacing:2 }}>
              JEE · NEET · PHYSICS · CHEMISTRY · MATH · BIOLOGY
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── FOOTER ─────────────────────────────────── */}
      <footer style={{ borderTop:'1px solid var(--border)', padding:'28px 24px' }}>
        <div style={{ maxWidth:1100, margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:16 }}>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:900, fontSize:18 }}>
            Focus<span className="gtext">Duo</span>
          </div>
          <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
            {[['Dashboard','/dashboard'],['Plans','/plans'],['Join','/join'],['Leaderboard','/leaderboard']].map(([l,h]) => (
              <Link key={l} href={h} style={{ color:'#4a5568', textDecoration:'none', fontSize:14, fontWeight:500 }}>{l}</Link>
            ))}
          </div>
          <div style={{ color:'#2d3748', fontSize:12 }}>© 2025 FocusDuo · For JEE &amp; NEET students</div>
        </div>
      </footer>
    </>
  )
}
