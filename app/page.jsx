'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { auth, googleProvider } from '../lib/firebase'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'

// ─── Load Google Fonts safely (avoids SSR hydration issues) ───
function useGoogleFonts() {
  useEffect(() => {
    if (document.getElementById('fd-fonts')) return
    const link = document.createElement('link')
    link.id = 'fd-fonts'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800;900&family=Plus+Jakarta+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap'
    document.head.appendChild(link)
  }, [])
}

// ─── Scroll-triggered fade in ──────────────────────────────────
function FadeIn({ children, delay = 0, up = 24, style = {} }) {
  const ref = useRef(null)
  const [on, setOn] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setOn(true); obs.disconnect() } },
      { threshold: 0.08 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return (
    <div
      ref={ref}
      style={{
        opacity: on ? 1 : 0,
        transform: on ? 'translateY(0px)' : 'translateY(' + up + 'px)',
        transition: 'opacity 0.8s cubic-bezier(.16,1,.3,1) ' + delay + 'ms, transform 0.8s cubic-bezier(.16,1,.3,1) ' + delay + 'ms',
        ...style
      }}
    >
      {children}
    </div>
  )
}

// ─── Animated counter ──────────────────────────────────────────
function Count({ to, prefix = '', suffix = '' }) {
  const [v, setV] = useState(0)
  const ref = useRef(null)
  const done = useRef(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !done.current) {
          done.current = true
          const start = performance.now()
          const dur = 1600
          const run = (now) => {
            const p = Math.min((now - start) / dur, 1)
            const ease = 1 - Math.pow(1 - p, 4)
            setV(Math.floor(ease * to))
            if (p < 1) requestAnimationFrame(run)
            else setV(to)
          }
          requestAnimationFrame(run)
        }
      },
      { threshold: 0.5 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [to])
  return <span ref={ref}>{prefix}{v}{suffix}</span>
}

// ─── Auth Modal ────────────────────────────────────────────────
function AuthModal({ onClose, onDone }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  async function doSignIn() {
    setBusy(true)
    setErr('')
    try {
      await signInWithPopup(auth, googleProvider)
      onDone()
    } catch (e) {
      console.error(e)
      setErr('Sign in failed. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function onBg(e) {
    if (e.target === e.currentTarget) onClose()
  }

  return (
    <div
      onClick={onBg}
      style={{
        position: 'fixed', inset: 0, zIndex: 999,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(12px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '20px'
      }}
    >
      <div style={{
        width: '100%', maxWidth: 420,
        background: '#0D1421',
        border: '1px solid rgba(79,142,247,0.3)',
        borderRadius: 24, padding: '40px 32px',
        position: 'relative',
        boxShadow: '0 40px 80px rgba(0,0,0,0.6)'
      }}>
        {/* Close */}
        <button
          onClick={onClose}
          style={{
            position: 'absolute', top: 16, right: 16,
            width: 32, height: 32, borderRadius: 8,
            background: 'rgba(255,255,255,0.06)',
            border: 'none', color: '#64748B',
            cursor: 'pointer', fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}
        >
          ×
        </button>

        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 48, marginBottom: 14 }}>📚</div>
          <h2 style={{
            fontFamily: 'Outfit, sans-serif',
            fontSize: 26, fontWeight: 900,
            color: '#F1F5F9', margin: '0 0 10px'
          }}>
            Join FocusDuo
          </h2>
          <p style={{ color: '#64748B', fontSize: 15, lineHeight: 1.6, margin: 0 }}>
            Sign in with Google to get matched with a study partner. Free — no card needed.
          </p>
        </div>

        {/* Google button */}
        <button
          onClick={doSignIn}
          disabled={busy}
          style={{
            width: '100%', padding: '15px 20px',
            borderRadius: 14,
            border: '1px solid rgba(255,255,255,0.1)',
            background: busy ? 'rgba(255,255,255,0.03)' : 'rgba(255,255,255,0.07)',
            color: '#F1F5F9', fontWeight: 700, fontSize: 16,
            cursor: busy ? 'not-allowed' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
            transition: 'all 0.2s',
            fontFamily: 'Plus Jakarta Sans, sans-serif'
          }}
        >
          {!busy && (
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"/>
              <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
              <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
              <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z"/>
            </svg>
          )}
          {busy ? 'Signing in...' : 'Continue with Google'}
        </button>

        {err && (
          <div style={{
            marginTop: 12, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)',
            color: '#FCA5A5', fontSize: 13, textAlign: 'center'
          }}>
            {err}
          </div>
        )}

        <div style={{ marginTop: 20, textAlign: 'center', color: '#374151', fontSize: 12, fontWeight: 600 }}>
          ✅ Free &nbsp;·&nbsp; 🔒 Google secured &nbsp;·&nbsp; 📱 Works on mobile
        </div>
      </div>
    </div>
  )
}

// ─── Match demo card ───────────────────────────────────────────
const DEMO_NAMES = ['Arjun K.', 'Priya S.', 'Rahul M.', 'Sneha P.', 'Dev R.', 'Ananya T.']

function MatchCard({ user, openAuth }) {
  const router = useRouter()
  const [exam, setExam] = useState('JEE')
  const [subj, setSubj] = useState('Physics')
  const [phase, setPhase] = useState('idle')
  const [dots, setDots] = useState('.')
  const [partner, setPartner] = useState('')

  useEffect(() => {
    if (phase !== 'searching') return
    const di = setInterval(() => setDots(d => d.length >= 3 ? '.' : d + '.'), 400)
    const ti = setTimeout(() => {
      setPartner(DEMO_NAMES[Math.floor(Math.random() * DEMO_NAMES.length)])
      setPhase('matched')
    }, 2600)
    return () => { clearInterval(di); clearTimeout(ti) }
  }, [phase])

  useEffect(() => {
    if (phase !== 'matched') return
    const t = setTimeout(() => router.push('/join'), 1800)
    return () => clearTimeout(t)
  }, [phase, router])

  function start() {
    if (phase !== 'idle') return
    if (!user) { openAuth(); return }
    setPhase('searching')
  }

  const subjects = exam === 'NEET'
    ? ['Physics', 'Chemistry', 'Biology']
    : ['Physics', 'Chemistry', 'Math']

  return (
    <div style={{
      background: 'rgba(13,20,33,0.95)',
      border: '1px solid rgba(79,142,247,0.25)',
      borderRadius: 24, padding: 28,
      width: '100%', maxWidth: 390,
      backdropFilter: 'blur(16px)',
      boxShadow: '0 32px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.05)'
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 22 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%',
          background: '#10B981',
          boxShadow: '0 0 10px #10B981'
        }} />
        <span style={{
          fontSize: 11, fontWeight: 800, color: '#10B981',
          letterSpacing: 2, textTransform: 'uppercase',
          fontFamily: 'Outfit, sans-serif'
        }}>
          Live matchmaker
        </span>
      </div>

      {/* Exam tabs */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, fontFamily: 'Outfit, sans-serif' }}>Exam</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['JEE', 'NEET'].map(e => (
            <button
              key={e}
              onClick={() => { if (phase === 'idle') { setExam(e); setSubj('Physics') } }}
              style={{
                flex: 1, padding: '10px 0', borderRadius: 10,
                fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer',
                transition: 'all 0.2s',
                background: exam === e
                  ? 'linear-gradient(135deg, #4F8EF7, #8B5CF6)'
                  : 'rgba(255,255,255,0.05)',
                color: exam === e ? '#fff' : '#64748B',
                fontFamily: 'Outfit, sans-serif',
                boxShadow: exam === e ? '0 4px 16px rgba(79,142,247,0.4)' : 'none'
              }}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* Subject grid */}
      <div style={{ marginBottom: 22 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8, fontFamily: 'Outfit, sans-serif' }}>Subject</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {subjects.map(s => (
            <button
              key={s}
              onClick={() => { if (phase === 'idle') setSubj(s) }}
              style={{
                padding: '9px 4px', borderRadius: 10,
                fontWeight: 700, fontSize: 13, cursor: 'pointer',
                border: subj === s ? '1px solid rgba(79,142,247,0.6)' : '1px solid rgba(255,255,255,0.06)',
                background: subj === s ? 'rgba(79,142,247,0.12)' : 'rgba(255,255,255,0.04)',
                color: subj === s ? '#7CB9FF' : '#64748B',
                transition: 'all 0.15s',
                fontFamily: 'Outfit, sans-serif'
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Action */}
      {phase === 'idle' && (
        <button
          onClick={start}
          style={{
            width: '100%', padding: '15px 0', borderRadius: 14,
            fontWeight: 900, fontSize: 16, border: 'none', cursor: 'pointer',
            background: 'linear-gradient(135deg, #4F8EF7 0%, #8B5CF6 100%)',
            color: '#fff', letterSpacing: 0.3,
            boxShadow: '0 8px 28px rgba(79,142,247,0.45)',
            transition: 'transform 0.15s, box-shadow 0.15s',
            fontFamily: 'Outfit, sans-serif'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = '0 14px 36px rgba(79,142,247,0.55)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 8px 28px rgba(79,142,247,0.45)'
          }}
        >
          {user ? 'Find ' + exam + ' ' + subj + ' partner →' : '🔐 Sign in & match →'}
        </button>
      )}

      {phase === 'searching' && (
        <div style={{ textAlign: 'center', padding: '12px 0' }}>
          <div style={{
            width: 44, height: 44, margin: '0 auto 14px',
            border: '3px solid rgba(79,142,247,0.2)',
            borderTopColor: '#4F8EF7',
            borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <div style={{ color: '#7CB9FF', fontWeight: 700, fontSize: 15, marginBottom: 6, fontFamily: 'Outfit, sans-serif' }}>
            Searching{dots}
          </div>
          <div style={{ color: '#374151', fontSize: 13 }}>
            Finding your {exam} {subj} partner
          </div>
        </div>
      )}

      {phase === 'matched' && (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>🎉</div>
          <div style={{ color: '#10B981', fontWeight: 900, fontSize: 18, marginBottom: 6, fontFamily: 'Outfit, sans-serif' }}>
            Matched with {partner}!
          </div>
          <div style={{ color: '#374151', fontSize: 13 }}>Opening your session...</div>
        </div>
      )}

      {!user && phase === 'idle' && (
        <div style={{ marginTop: 12, textAlign: 'center', color: '#374151', fontSize: 12 }}>
          Free · Google sign in · No card needed
        </div>
      )}
    </div>
  )
}

// ─── Main page ─────────────────────────────────────────────────
export default function Page() {
  useGoogleFonts()

  const router = useRouter()
  const [user, setUser] = useState(null)
  const [ready, setReady] = useState(false)
  const [showAuth, setShowAuth] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => {
      setUser(u || null)
      setReady(true)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 48)
    window.addEventListener('scroll', fn, { passive: true })
    return () => window.removeEventListener('scroll', fn)
  }, [])

  const doSignOut = useCallback(() => signOut(auth), [])

  function openAuth() { setShowAuth(true) }
  function closeAuth() { setShowAuth(false) }
  function onAuthDone() { setShowAuth(false); router.push('/join') }
  function handleCTA() { user ? router.push('/join') : openAuth() }

  const css = `
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html{scroll-behavior:smooth}
    body{
      background:#080C14;
      color:#F1F5F9;
      font-family:'Plus Jakarta Sans',system-ui,sans-serif;
      overflow-x:hidden;
      -webkit-font-smoothing:antialiased;
    }
    a{color:inherit;text-decoration:none}
    button{font-family:inherit}

    @keyframes spin{to{transform:rotate(360deg)}}
    @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-14px)}}
    @keyframes glow-pulse{0%,100%{box-shadow:0 0 20px rgba(79,142,247,0.3)}50%{box-shadow:0 0 50px rgba(79,142,247,0.6),0 0 80px rgba(139,92,246,0.3)}}
    @keyframes slide-up{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
    @keyframes live-ring{0%{box-shadow:0 0 0 0 rgba(16,185,129,0.6)}70%{box-shadow:0 0 0 9px rgba(16,185,129,0)}100%{box-shadow:0 0 0 0 rgba(16,185,129,0)}}
    @keyframes shimmer{0%{opacity:0.5}50%{opacity:1}100%{opacity:0.5}}

    .float{animation:float 5s ease-in-out infinite}
    .live-dot{
      width:8px;height:8px;border-radius:50%;
      background:#10B981;display:inline-block;flex-shrink:0;
      animation:live-ring 2.5s ease-out infinite;
    }

    .nav-link{
      padding:7px 14px;border-radius:9px;
      color:#64748B;font-size:14px;font-weight:600;
      transition:color 0.2s,background 0.2s;
    }
    .nav-link:hover{color:#F1F5F9;background:rgba(255,255,255,0.06)}

    .btn-primary{
      display:inline-flex;align-items:center;gap:8px;
      padding:13px 28px;border-radius:13px;border:none;
      background:linear-gradient(135deg,#4F8EF7,#8B5CF6);
      color:#fff;font-weight:800;font-size:15px;cursor:pointer;
      transition:transform 0.2s,box-shadow 0.2s;
      white-space:nowrap;font-family:'Outfit',sans-serif;
      box-shadow:0 4px 20px rgba(79,142,247,0.35);
    }
    .btn-primary:hover{transform:translateY(-2px);box-shadow:0 10px 36px rgba(79,142,247,0.55)}

    .btn-ghost{
      display:inline-flex;align-items:center;gap:8px;
      padding:12px 24px;border-radius:13px;
      border:1px solid rgba(255,255,255,0.1);
      background:rgba(255,255,255,0.05);
      color:#CBD5E1;font-weight:700;font-size:15px;cursor:pointer;
      transition:all 0.2s;white-space:nowrap;
      font-family:'Plus Jakarta Sans',sans-serif;
    }
    .btn-ghost:hover{background:rgba(255,255,255,0.1);border-color:rgba(255,255,255,0.2);color:#F1F5F9}

    .btn-sm{padding:9px 18px;font-size:13px;border-radius:10px}

    .card{
      background:#0D1421;
      border:1px solid rgba(255,255,255,0.06);
      border-radius:20px;padding:26px;
      transition:transform 0.3s,border-color 0.3s,box-shadow 0.3s;
    }
    .card:hover{
      transform:translateY(-6px);
      border-color:rgba(79,142,247,0.28);
      box-shadow:0 28px 56px rgba(0,0,0,0.5);
    }

    .plan-card{
      background:#0D1421;
      border:1px solid rgba(255,255,255,0.07);
      border-radius:22px;padding:30px;
      transition:transform 0.3s,box-shadow 0.3s;
      display:flex;flex-direction:column;
    }
    .plan-card:hover{transform:translateY(-6px);box-shadow:0 32px 64px rgba(0,0,0,0.5)}

    .dot-grid{
      background-image:radial-gradient(rgba(79,142,247,0.15) 1px,transparent 1px);
      background-size:28px 28px;
    }

    .gradient-text{
      background:linear-gradient(135deg,#7CB9FF 0%,#A78BFA 50%,#34D399 100%);
      -webkit-background-clip:text;
      -webkit-text-fill-color:transparent;
      background-clip:text;
    }

    .display{
      font-family:'Outfit',sans-serif;
      font-size:clamp(44px,8.5vw,96px);
      font-weight:900;
      line-height:0.95;
      letter-spacing:-3px;
    }
    .h2{
      font-family:'Outfit',sans-serif;
      font-size:clamp(30px,4.5vw,56px);
      font-weight:900;
      line-height:1.05;
      letter-spacing:-1.5px;
    }
    .overline{
      font-family:'Outfit',sans-serif;
      font-size:11px;font-weight:800;
      letter-spacing:3px;text-transform:uppercase;
    }

    @media(max-width:768px){
      .hide-m{display:none!important}
      .col-m{flex-direction:column!important;align-items:stretch!important}
      .center-m{text-align:center!important}
      .full-m{width:100%!important;justify-content:center!important}
      .display{letter-spacing:-2px}
    }
  `

  const features = [
    { e: '📹', t: 'HD video call', d: 'Optimised for Jio, Airtel, Wi-Fi. Crystal clear on any phone in India.' },
    { e: '🔥', t: 'Streak system', d: 'Study every day and build your streak. Miss a day and it resets. Paid users get shields.' },
    { e: '🏆', t: 'Leaderboard', d: 'Weekly rankings by sessions and streak. Top students get a badge.' },
    { e: '⚡', t: 'Priority matching', d: 'Paid users skip the queue and get matched before free users, every time.' },
    { e: '📊', t: 'Session history', d: 'Full history for paid users. Free users see their last 5 sessions.' },
    { e: '🛡️', t: 'Safe & moderated', d: 'One-tap report after any session. Team reviews and bans within hours.' },
    { e: '🎯', t: 'Chapter selection', d: 'First 2 minutes to pick your chapter. Leave early — credit not deducted.' },
    { e: '🔗', t: 'Refer & earn', d: 'Refer a friend and both of you get bonus sessions added instantly.' },
  ]

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {showAuth && <AuthModal onClose={closeAuth} onDone={onAuthDone} />}

      {/* ── NAVBAR ─────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        height: 60, padding: '0 20px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        background: scrolled ? 'rgba(8,12,20,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(24px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.05)' : 'none',
        transition: 'all 0.35s'
      }}>
        {/* Logo */}
        <Link href="/" style={{ flexShrink: 0 }}>
          <span style={{ fontFamily: 'Outfit, sans-serif', fontSize: 22, fontWeight: 900, color: '#F1F5F9', letterSpacing: -0.5 }}>
            Focus<span className="gradient-text">Duo</span>
          </span>
        </Link>

        {/* Links */}
        <div className="hide-m" style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <Link href="/dashboard" className="nav-link">Dashboard</Link>
          <Link href="/plans" className="nav-link">Plans</Link>
          <Link href="/leaderboard" className="nav-link">Leaderboard</Link>
        </div>

        {/* Auth */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {!ready ? (
            <div style={{ width: 80, height: 34, borderRadius: 9, background: 'rgba(255,255,255,0.05)' }} />
          ) : user ? (
            <>
              <div className="hide-m" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {user.photoURL && (
                  <img
                    src={user.photoURL}
                    alt=""
                    style={{ width: 28, height: 28, borderRadius: '50%', border: '2px solid rgba(79,142,247,0.5)' }}
                  />
                )}
                <span style={{ fontSize: 13, color: '#94A3B8', maxWidth: 100, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(user.displayName || '').split(' ')[0] || 'You'}
                </span>
              </div>
              <Link href="/join" className="btn-primary btn-sm">Study now →</Link>
              <button onClick={doSignOut} className="btn-ghost btn-sm hide-m">Sign out</button>
            </>
          ) : (
            <>
              <button onClick={openAuth} className="btn-ghost btn-sm">Sign in</button>
              <button onClick={openAuth} className="btn-primary btn-sm">Sign up free →</button>
            </>
          )}
        </div>
      </nav>

      {/* ── HERO ───────────────────────────── */}
      <section className="dot-grid" style={{
        minHeight: '100vh',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '100px 24px 80px',
        position: 'relative', overflow: 'hidden'
      }}>
        {/* Ambient blobs */}
        <div style={{ position: 'absolute', top: '8%', left: '-8%', width: 700, height: 700, borderRadius: '50%', background: 'radial-gradient(circle, rgba(79,142,247,0.16) 0%, transparent 65%)', filter: 'blur(60px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '0%', right: '-10%', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.14) 0%, transparent 65%)', filter: 'blur(60px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '45%', left: '30%', width: 500, height: 300, background: 'radial-gradient(ellipse, rgba(16,185,129,0.06) 0%, transparent 70%)', filter: 'blur(40px)', pointerEvents: 'none' }} />

        <div style={{ maxWidth: 1120, width: '100%', position: 'relative', zIndex: 1 }}>

          {/* Live badge */}
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 36, animation: 'slide-up 0.5s ease both' }}>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 9,
              padding: '8px 20px', borderRadius: 999,
              border: '1px solid rgba(16,185,129,0.35)',
              background: 'rgba(16,185,129,0.08)',
              fontFamily: 'Outfit, sans-serif',
              fontSize: 13, fontWeight: 700, color: '#34D399'
            }}>
              <span className="live-dot" />
              Students studying right now · India 🇮🇳
            </div>
          </div>

          {/* Two columns */}
          <div style={{ display: 'flex', gap: 60, alignItems: 'center', flexWrap: 'wrap' }} className="col-m">

            {/* Left */}
            <div style={{ flex: '1 1 440px', animation: 'slide-up 0.6s ease 0.1s both' }}>
              <h1 className="display center-m">
                Stop studying<br />
                <span className="gradient-text">alone.</span>
              </h1>

              <p style={{
                fontSize: 'clamp(15px, 1.8vw, 18px)',
                color: '#64748B', lineHeight: 1.75, marginTop: 22, maxWidth: 460,
                fontFamily: 'Plus Jakarta Sans, sans-serif'
              }}>
                Get matched with a serious JEE or NEET student in under 30 seconds.
                Video call inside the site. Stay accountable. Actually get work done.
              </p>

              <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }} className="col-m">
                <button onClick={handleCTA} className="btn-primary" style={{ fontSize: 16, padding: '15px 32px' }}>
                  {user ? 'Start studying now →' : 'Get started free →'}
                </button>
                {!user && (
                  <button onClick={openAuth} className="btn-ghost">Sign in</button>
                )}
                {user && (
                  <Link href="/dashboard" className="btn-ghost">My dashboard</Link>
                )}
              </div>

              {/* Trust chips */}
              <div style={{ display: 'flex', gap: 8, marginTop: 26, flexWrap: 'wrap' }}>
                {['✅ 10 free sessions', '⚡ Matched in 30s', '🔒 Google sign in', '📱 Mobile ready'].map(t => (
                  <div key={t} style={{
                    padding: '5px 13px', borderRadius: 999, fontSize: 12, fontWeight: 600,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.07)',
                    color: '#374151'
                  }}>
                    {t}
                  </div>
                ))}
              </div>
            </div>

            {/* Right — match card */}
            <div className="float" style={{
              flex: '1 1 360px', display: 'flex', justifyContent: 'center',
              animation: 'slide-up 0.7s ease 0.2s both'
            }}>
              <MatchCard user={user} openAuth={openAuth} />
            </div>
          </div>
        </div>

        {/* Scroll indicator */}
        <div style={{
          position: 'absolute', bottom: 28, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
          opacity: 0.25, animation: 'float 3s ease-in-out infinite'
        }}>
          <div style={{ width: 1, height: 36, background: 'linear-gradient(to bottom, transparent, #64748B)' }} />
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 3, color: '#64748B', textTransform: 'uppercase', fontFamily: 'Outfit, sans-serif' }}>SCROLL</span>
        </div>
      </section>

      {/* ── STATS ──────────────────────────── */}
      <section style={{ padding: '60px 24px', borderTop: '1px solid rgba(255,255,255,0.05)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <FadeIn>
          <div style={{ maxWidth: 900, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 40, textAlign: 'center' }}>
            {[
              { p: '', n: 10, s: '+', l: 'Free sessions to start' },
              { p: '', n: 30, s: 's', l: 'Average match time' },
              { p: '₹', n: 99, s: '', l: 'Per month, unlimited' },
              { p: '', n: 4, s: '', l: 'Subjects covered' },
            ].map(({ p, n, s, l }) => (
              <div key={l}>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 'clamp(38px, 5vw, 64px)', fontWeight: 900, lineHeight: 1 }}>
                  <span className="gradient-text">
                    <Count to={n} prefix={p} suffix={s} />
                  </span>
                </div>
                <div style={{ color: '#374151', fontSize: 13, marginTop: 10, fontWeight: 600 }}>{l}</div>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ── HOW IT WORKS ───────────────────── */}
      <section style={{ padding: '100px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <p className="overline" style={{ color: '#4F8EF7', marginBottom: 14 }}>Simple as it gets</p>
            <h2 className="h2">How FocusDuo works</h2>
          </div>
        </FadeIn>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          {[
            { n: '01', e: '📚', t: 'Pick your subject', d: 'Choose your exam, subject, and mode — 1-on-1 or group. Takes 10 seconds.', delay: 0 },
            { n: '02', e: '⚡', t: 'Match in seconds', d: 'Paired with a serious student in the same subject. Usually under 30 seconds.', delay: 80 },
            { n: '03', e: '🎯', t: 'Set your chapter', d: 'First 2 minutes to agree on chapter. Leave early and no credit is used.', delay: 160 },
            { n: '04', e: '🔥', t: 'Build your streak', d: 'Complete sessions to build your streak. Climb the leaderboard every week.', delay: 240 },
          ].map(({ n, e, t, d, delay }) => (
            <FadeIn key={n} delay={delay}>
              <div className="card">
                <p className="overline" style={{ color: 'rgba(255,255,255,0.15)', marginBottom: 18 }}>{n}</p>
                <div style={{ fontSize: 36, marginBottom: 14 }}>{e}</div>
                <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 18, fontWeight: 800, marginBottom: 10, lineHeight: 1.2, color: '#F1F5F9' }}>{t}</h3>
                <p style={{ color: '#64748B', lineHeight: 1.75, fontSize: 14 }}>{d}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── VS DISCORD ─────────────────────── */}
      <section style={{ padding: '100px 24px', background: 'linear-gradient(180deg, transparent, rgba(79,142,247,0.04), transparent)' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <p className="overline" style={{ color: '#A78BFA', marginBottom: 14 }}>Honest comparison</p>
              <h2 className="h2">Why not Discord or Zoom?</h2>
              <p style={{ color: '#64748B', marginTop: 14, fontSize: 16, lineHeight: 1.75 }}>
                Those are free. But they have one problem FocusDuo actually solves.
              </p>
            </div>
          </FadeIn>
          <FadeIn delay={100}>
            <div style={{ background: '#0D1421', borderRadius: 22, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)', boxShadow: '0 32px 80px rgba(0,0,0,0.5)' }}>
              {/* Table header */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr', padding: '18px 28px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                <div style={{ textAlign: 'center', fontFamily: 'Outfit, sans-serif', fontWeight: 900, color: '#7CB9FF', fontSize: 15 }}>FocusDuo ✅</div>
                <div />
                <div style={{ textAlign: 'center', fontWeight: 700, color: '#374151', fontSize: 14 }}>Discord / Zoom</div>
              </div>
              {/* Rows */}
              <div style={{ padding: '6px 28px 20px' }}>
                {[
                  { f: 'Finding a partner', u: 'Auto-matched in 30s', t: 'Beg in a server', w: 'us' },
                  { f: 'Accountability', u: 'Timer + streak system', t: 'Nothing', w: 'us' },
                  { f: 'Distractions', u: 'Study-only space', t: 'Memes & gaming', w: 'us' },
                  { f: 'Cost', u: 'Free tier available', t: 'Free', w: 'them' },
                  { f: 'Mobile quality', u: 'Optimised for India', t: 'Heavy & laggy', w: 'us' },
                  { f: 'Reporting', u: 'One-tap report system', t: 'Nothing', w: 'us' },
                  { f: 'Session tracking', u: 'History + streaks', t: 'No tracking', w: 'us' },
                ].map(({ f, u, t, w }) => (
                  <div key={f} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 1fr', gap: 8, alignItems: 'center', padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                    <div style={{
                      padding: '8px 12px', borderRadius: 10, textAlign: 'center', fontWeight: 700, fontSize: 13,
                      background: w === 'us' ? 'rgba(16,185,129,0.1)' : 'rgba(255,255,255,0.03)',
                      color: w === 'us' ? '#34D399' : '#64748B',
                      border: w === 'us' ? '1px solid rgba(16,185,129,0.22)' : '1px solid transparent'
                    }}>{u}</div>
                    <div style={{ textAlign: 'center', color: '#1E2A3A', fontSize: 11, fontWeight: 700, fontFamily: 'Outfit, sans-serif' }}>{f}</div>
                    <div style={{ padding: '8px 12px', borderRadius: 10, textAlign: 'center', fontWeight: 700, fontSize: 13, background: 'rgba(255,255,255,0.03)', color: '#374151', border: '1px solid transparent' }}>{t}</div>
                  </div>
                ))}
              </div>
            </div>
          </FadeIn>
          <FadeIn delay={200}>
            <p style={{ textAlign: 'center', marginTop: 28, color: '#374151', fontSize: 15, lineHeight: 1.8 }}>
              Discord finds you a distraction.<br />
              <strong style={{ color: '#F1F5F9' }}>FocusDuo finds you a study partner.</strong>
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── FEATURES ───────────────────────── */}
      <section style={{ padding: '100px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <p className="overline" style={{ color: '#A78BFA', marginBottom: 14 }}>Everything you need</p>
            <h2 className="h2">Built for serious students</h2>
          </div>
        </FadeIn>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 14 }}>
          {features.map(({ e, t, d }, i) => (
            <FadeIn key={t} delay={i * 55}>
              <div className="card">
                <div style={{ fontSize: 34, marginBottom: 14 }}>{e}</div>
                <h3 style={{ fontFamily: 'Outfit, sans-serif', fontSize: 16, fontWeight: 800, marginBottom: 9, color: '#F1F5F9', lineHeight: 1.2 }}>{t}</h3>
                <p style={{ color: '#64748B', lineHeight: 1.75, fontSize: 14 }}>{d}</p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── PRICING ────────────────────────── */}
      <section style={{ padding: '100px 24px', background: 'rgba(13,20,33,0.7)' }}>
        <div style={{ maxWidth: 980, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <p className="overline" style={{ color: '#34D399', marginBottom: 14 }}>Honest pricing</p>
              <h2 className="h2">Start free. Upgrade when ready.</h2>
              <p style={{ color: '#64748B', marginTop: 14, fontSize: 16 }}>
                Pay via UPI. No card. No auto-charge. Ever.
              </p>
            </div>
          </FadeIn>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginBottom: 14 }}>

            {/* Free */}
            <FadeIn delay={0}>
              <div className="plan-card">
                <p className="overline" style={{ color: '#374151', marginBottom: 10 }}>Free forever</p>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 48, fontWeight: 900, marginBottom: 4, lineHeight: 1 }}>₹0</div>
                <p style={{ color: '#374151', fontSize: 14, marginBottom: 24 }}>No card ever</p>
                <div style={{ flex: 1 }}>
                  {['10 one-on-one sessions', '10 group sessions', '30 min per session', 'Streak tracking', 'Leaderboard access'].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#64748B', marginBottom: 10 }}>
                      <span style={{ color: '#34D399', flexShrink: 0, fontSize: 12 }}>✓</span>{f}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 24 }}>
                  <button onClick={handleCTA} className="btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 14 }}>
                    {user ? 'Go study →' : 'Start free →'}
                  </button>
                </div>
              </div>
            </FadeIn>

            {/* Plus — featured */}
            <FadeIn delay={80}>
              <div className="plan-card" style={{
                border: '1px solid rgba(79,142,247,0.5)',
                position: 'relative', overflow: 'hidden',
                animation: 'glow-pulse 4s ease-in-out infinite'
              }}>
                {/* Top stripe */}
                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg, #4F8EF7, #8B5CF6)' }} />
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                  <p className="overline" style={{ color: '#7CB9FF' }}>Plus</p>
                  <div style={{ padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800, background: 'linear-gradient(90deg, #4F8EF7, #8B5CF6)', color: '#fff' }}>
                    POPULAR
                  </div>
                </div>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 48, fontWeight: 900, marginBottom: 4, lineHeight: 1 }}>
                  <span className="gradient-text">₹99</span>
                </div>
                <p style={{ color: '#374151', fontSize: 14, marginBottom: 24 }}>per month · ₹199 for 3 months</p>
                <div style={{ flex: 1 }}>
                  {['Unlimited sessions', '60 min per session', '⚡ Priority matching queue', 'Full session history', '1 streak shield / month'].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#CBD5E1', marginBottom: 10 }}>
                      <span style={{ color: '#34D399', flexShrink: 0, fontSize: 12 }}>✓</span>{f}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 24 }}>
                  <Link href="/plans" className="btn-primary" style={{ width: '100%', justifyContent: 'center', fontSize: 14, display: 'flex' }}>
                    Upgrade for ₹99 →
                  </Link>
                </div>
              </div>
            </FadeIn>

            {/* Pro */}
            <FadeIn delay={160}>
              <div className="plan-card" style={{ border: '1px solid rgba(245,158,11,0.25)' }}>
                <p className="overline" style={{ color: '#F59E0B', marginBottom: 10 }}>Pro · Best value</p>
                <div style={{ fontFamily: 'Outfit, sans-serif', fontSize: 48, fontWeight: 900, marginBottom: 4, lineHeight: 1 }}>
                  <span style={{ background: 'linear-gradient(135deg, #F59E0B, #EF4444)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>₹699</span>
                </div>
                <p style={{ color: '#374151', fontSize: 14, marginBottom: 4 }}>per year · <s>₹1188</s></p>
                <p style={{ color: '#34D399', fontSize: 12, fontWeight: 700, marginBottom: 20 }}>Save ₹489 vs monthly</p>
                <div style={{ flex: 1 }}>
                  {['Everything in Plus', 'Unlimited session length', '3 streak shields / month', 'Pro badge on leaderboard', 'Early access to new features'].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: '#CBD5E1', marginBottom: 10 }}>
                      <span style={{ color: '#F59E0B', flexShrink: 0, fontSize: 12 }}>✓</span>{f}
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: 24 }}>
                  <Link href="/plans" className="btn-ghost" style={{ width: '100%', justifyContent: 'center', fontSize: 14, display: 'flex', borderColor: 'rgba(245,158,11,0.3)' }}>
                    Get yearly →
                  </Link>
                </div>
              </div>
            </FadeIn>
          </div>

          {/* Early bird */}
          <FadeIn delay={240}>
            <div style={{
              padding: '22px 28px', borderRadius: 18,
              background: 'linear-gradient(135deg, rgba(239,68,68,0.1), rgba(139,92,246,0.1))',
              border: '1px solid rgba(239,68,68,0.25)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16
            }}>
              <div>
                <p style={{ fontWeight: 900, fontSize: 16, marginBottom: 6, color: '#F1F5F9' }}>
                  🔥 Early Bird — <span className="gradient-text">₹199/year</span>
                  <span style={{ fontSize: 13, color: '#374151', fontWeight: 500 }}> · First 100 buyers only</span>
                </p>
                <p style={{ color: '#64748B', fontSize: 14 }}>Full Pro plan for ₹199. Locked in forever even when price increases.</p>
              </div>
              <Link href="/plans" className="btn-primary" style={{ background: 'linear-gradient(135deg, #EF4444, #8B5CF6)', whiteSpace: 'nowrap' }}>
                Claim ₹199 deal →
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── FINAL CTA ──────────────────────── */}
      <section style={{ padding: '100px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(ellipse at 50% 100%, rgba(79,142,247,0.1) 0%, transparent 65%)', pointerEvents: 'none' }} />
        <FadeIn>
          <div style={{ textAlign: 'center', maxWidth: 620, margin: '0 auto', position: 'relative' }}>
            <h2 className="h2">
              Your rank won't improve<br />
              <span className="gradient-text">studying alone.</span>
            </h2>
            <p style={{ color: '#64748B', fontSize: 18, lineHeight: 1.75, marginTop: 20, marginBottom: 36 }}>
              Every topper has an accountability partner.
              FocusDuo gives you one in 30 seconds. Free.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button onClick={handleCTA} className="btn-primary" style={{ fontSize: 17, padding: '16px 36px' }}>
                {user ? 'Start studying now →' : 'Get started free →'}
              </button>
              <Link href="/plans" className="btn-ghost" style={{ fontSize: 16 }}>See plans</Link>
            </div>
            <p style={{ color: '#1E2A3A', fontSize: 11, marginTop: 22, letterSpacing: 2.5, fontFamily: 'Outfit, sans-serif', fontWeight: 800, textTransform: 'uppercase' }}>
              JEE · NEET · Physics · Chemistry · Math · Biology
            </p>
          </div>
        </FadeIn>
      </section>

      {/* ── FOOTER ─────────────────────────── */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.05)', padding: '28px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
          <div style={{ fontFamily: 'Outfit, sans-serif', fontWeight: 900, fontSize: 18, color: '#F1F5F9' }}>
            Focus<span className="gradient-text">Duo</span>
          </div>
          <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
            {[['Dashboard', '/dashboard'], ['Plans', '/plans'], ['Join', '/join'], ['Leaderboard', '/leaderboard']].map(([l, h]) => (
              <Link key={l} href={h} style={{ color: '#374151', fontSize: 14, fontWeight: 500, transition: 'color 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#64748B' }}
                onMouseLeave={e => { e.currentTarget.style.color = '#374151' }}
              >
                {l}
              </Link>
            ))}
          </div>
          <p style={{ color: '#1E2A3A', fontSize: 12 }}>© 2025 FocusDuo · For JEE &amp; NEET students</p>
        </div>
      </footer>
    </>
  )
}
