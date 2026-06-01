'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { auth, googleProvider } from '../lib/firebase'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'

function useFonts() {
  useEffect(function () {
    if (document.getElementById('fd-fonts')) return
    var link = document.createElement('link')
    link.id = 'fd-fonts'
    link.rel = 'stylesheet'
    link.href = 'https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,500;0,600;0,700;1,500&family=DM+Sans:wght@400;500;600&display=swap'
    document.head.appendChild(link)
  }, [])
}

function Reveal({ children, delay, style }) {
  var ref = useRef(null)
  var [on, setOn] = useState(false)
  var d = delay || 0

  useEffect(function () {
    var el = ref.current
    if (!el) return
    var obs = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) { setOn(true); obs.disconnect() }
    }, { threshold: 0.08 })
    obs.observe(el)
    return function () { obs.disconnect() }
  }, [])

  return (
    <div
      ref={ref}
      style={Object.assign({
        opacity: on ? 1 : 0,
        transform: on ? 'translateY(0)' : 'translateY(18px)',
        transition: 'opacity 0.55s ease ' + d + 'ms, transform 0.55s ease ' + d + 'ms'
      }, style || {})}
    >
      {children}
    </div>
  )
}

function AuthModal({ onClose, onDone }) {
  var [busy, setBusy] = useState(false)
  var [err, setErr]   = useState('')

  async function go() {
    setBusy(true); setErr('')
    try {
      await signInWithPopup(auth, googleProvider)
      onDone()
    } catch (e) {
      console.error(e)
      setErr('Sign in failed. Please try again.')
    } finally { setBusy(false) }
  }

  function onBg(e) { if (e.target === e.currentTarget) onClose() }

  return (
    <div onClick={onBg} style={{
      position: 'fixed', inset: 0, zIndex: 900,
      background: 'rgba(26,26,24,0.4)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24
    }}>
      <div style={{
        width: '100%', maxWidth: 400,
        background: '#FFFFFF', border: '1px solid #E4E2DC',
        borderRadius: 14, padding: '36px 32px',
        position: 'relative', boxShadow: '0 24px 64px rgba(26,26,24,0.14)'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 16, right: 16,
          width: 28, height: 28, borderRadius: 6,
          background: '#F5F3EE', border: 'none', color: '#878580',
          cursor: 'pointer', fontSize: 18, lineHeight: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>x</button>

        <h2 style={{ fontFamily: 'Lora, Georgia, serif', fontSize: 22, fontWeight: 600, color: '#1A1A18', marginBottom: 8 }}>
          Create your account
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.65, color: '#6B6860', marginBottom: 24 }}>
          Sign in with Google to start finding study partners. Free, no card needed.
        </p>

        <button onClick={go} disabled={busy} style={{
          width: '100%', padding: '13px 20px', borderRadius: 9,
          border: '1px solid #E4E2DC', background: busy ? '#F5F3EE' : '#FFFFFF',
          color: '#1A1A18', fontWeight: 600, fontSize: 15,
          cursor: busy ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          fontFamily: 'DM Sans, sans-serif', transition: 'background 0.15s'
        }}>
          <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z"/>
          </svg>
          {busy ? 'Signing in...' : 'Continue with Google'}
        </button>

        {err ? <p style={{ marginTop: 10, fontSize: 13, color: '#B45309', textAlign: 'center' }}>{err}</p> : null}
        <p style={{ marginTop: 16, fontSize: 12, color: '#A8A59F', textAlign: 'center' }}>
          We collect only your name and email. No card required.
        </p>
      </div>
    </div>
  )
}

export default function Page() {
  useFonts()

  var router    = useRouter()
  var [user, setUser]         = useState(null)
  var [ready, setReady]       = useState(false)
  var [showAuth, setShowAuth] = useState(false)
  var [scrolled, setScrolled] = useState(false)

  useEffect(function () {
    var u = onAuthStateChanged(auth, function (u) { setUser(u || null); setReady(true) })
    return function () { u() }
  }, [])

  useEffect(function () {
    function fn() { setScrolled(window.scrollY > 52) }
    window.addEventListener('scroll', fn, { passive: true })
    return function () { window.removeEventListener('scroll', fn) }
  }, [])

  function openAuth() { setShowAuth(true) }
  function closeAuth() { setShowAuth(false) }
  function onAuthDone() { setShowAuth(false); router.push('/join') }
  function handleCTA() { user ? router.push('/join') : openAuth() }

  // ── Design tokens ──────────────────────────────────
  // Warm off-white background, near-black text, stone borders
  // One accent: dark charcoal for buttons
  // No gradients. No glassmorphism. No purple.
  var bg      = '#F7F6F2'
  var white   = '#FFFFFF'
  var border  = '#E4E2DC'
  var text    = '#1A1A18'
  var text2   = '#6B6860'
  var text3   = '#A8A59F'
  var dark    = '#1A1A18'

  var css = [
    '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}',
    'html{scroll-behavior:smooth}',
    'body{background:' + bg + ';color:' + text + ';font-family:"DM Sans",system-ui,sans-serif;-webkit-font-smoothing:antialiased;overflow-x:hidden;line-height:1.6}',
    'a{color:inherit;text-decoration:none}',
    'button{font-family:inherit;cursor:pointer}',

    // Typography scale
    '.d1{font-family:"Lora",Georgia,serif;font-size:clamp(36px,5.2vw,68px);font-weight:600;line-height:1.08;letter-spacing:-0.025em;color:' + text + '}',
    '.d1 em{font-style:italic;font-weight:500}',
    '.h2{font-family:"Lora",Georgia,serif;font-size:clamp(24px,3.2vw,40px);font-weight:600;line-height:1.18;letter-spacing:-0.015em;color:' + text + '}',
    '.h3{font-family:"Lora",Georgia,serif;font-size:clamp(17px,1.8vw,21px);font-weight:600;line-height:1.3;color:' + text + '}',
    '.body{font-size:15px;line-height:1.72;color:' + text2 + '}',
    '.body-lg{font-size:17px;line-height:1.72;color:' + text2 + '}',
    '.caption{font-size:12px;line-height:1.6;color:' + text3 + ';letter-spacing:0.06em;text-transform:uppercase;font-weight:600}',
    '.mono{font-family:"Lora",Georgia,serif;font-size:clamp(32px,4vw,52px);font-weight:600;line-height:1;color:' + text + '}',

    // Layout
    '.wrap{max-width:1060px;margin:0 auto;padding:0 28px}',
    '.section{padding:72px 0;border-top:1px solid ' + border + '}',

    // Nav
    '.nav{position:fixed;top:0;left:0;right:0;z-index:500;height:56px;transition:background 0.25s,border-color 0.25s}',
    '.nav-in{display:flex;align-items:center;justify-content:space-between;height:100%;gap:16px}',
    '.nav-link{font-size:14px;color:' + text2 + ';font-weight:500;padding:6px 10px;border-radius:6px;transition:color 0.15s}',
    '.nav-link:hover{color:' + text + '}',

    // Buttons
    '.btn{display:inline-flex;align-items:center;gap:8px;padding:11px 22px;border-radius:8px;font-weight:600;font-size:14px;transition:all 0.15s;white-space:nowrap;border:none;font-family:"DM Sans",sans-serif;text-decoration:none}',
    '.btn-dark{background:' + dark + ';color:#FFFFFF}',
    '.btn-dark:hover{background:#2D2D2B}',
    '.btn-ghost{background:transparent;color:' + text + ';border:1px solid ' + border + '}',
    '.btn-ghost:hover{border-color:#C8C5BC;background:' + white + '}',
    '.btn-sm{padding:8px 16px;font-size:13px}',

    // Cards
    '.card{background:' + white + ';border:1px solid ' + border + ';border-radius:10px;padding:24px;transition:box-shadow 0.2s}',
    '.card:hover{box-shadow:0 6px 24px rgba(26,26,24,0.07)}',

    // Table row
    '.tr{display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;padding:12px 0;border-bottom:1px solid ' + border + ';align-items:start}',
    '.tr:last-child{border-bottom:none}',

    // Steps
    '.step-n{font-family:"Lora",Georgia,serif;font-size:36px;font-weight:600;color:' + border + ';line-height:1;margin-bottom:14px}',

    // Plan card featured
    '.plan-feature{border-color:' + text + ';box-shadow:0 0 0 1px ' + text + '}',

    // Responsive
    '@media(max-width:760px){',
    '  .hide-m{display:none!important}',
    '  .col-m{flex-direction:column!important;align-items:stretch!important}',
    '  .section{padding:52px 0}',
    '  .wrap{padding:0 20px}',
    '  .tr{grid-template-columns:1fr 1fr}',
    '}',
  ].join('\n')

  var features = [
    { t: 'HD video call',           d: 'Works on Jio, Airtel, and most Wi-Fi connections. No app to download. Runs entirely in your browser.' },
    { t: 'Automatic matching',      d: 'Pick your exam and subject. The system finds another student studying the same thing, usually in under 30 seconds.' },
    { t: 'Streak tracking',         d: 'Every session you complete extends your streak. Break it and it resets to one. Paid users get shields that absorb a missed day.' },
    { t: 'Leaderboard',             d: 'Weekly rankings by sessions completed and streak length. Resets every Monday.' },
    { t: 'Session history',         d: 'Every session is logged with the subject, partner, and duration. Free users see the last five. Paid users see everything.' },
    { t: 'Report and rating',       d: 'After every session you rate your partner and optionally report inappropriate behaviour. Reports are reviewed by the admin.' },
    { t: 'Grace period',            d: 'The first two minutes of each session are free. Leave within that window and no credit is deducted from your account.' },
    { t: 'Referral sessions',       d: 'Share your referral code. When someone signs up using it, both accounts receive one bonus session in each mode.' },
  ]

  var plans = [
    {
      label: 'Free', price: 'Rs 0', sub: 'No card, no expiry',
      featured: false,
      items: ['10 one-on-one sessions', '10 group sessions', '30 minutes per session', 'Streak tracking', 'Leaderboard access'],
      cta: user ? 'Go to app' : 'Start free', href: null
    },
    {
      label: 'Plus', price: 'Rs 99', sub: 'per month, or Rs 199 for 3 months',
      featured: true,
      items: ['Unlimited sessions', '60 minutes per session', 'Priority matching queue', 'Full session history', '1 streak shield per month'],
      cta: 'Get Plus', href: '/plans'
    },
    {
      label: 'Pro', price: 'Rs 699', sub: 'per year — saves Rs 489 vs monthly',
      featured: false,
      items: ['Everything in Plus', 'Unlimited session length', '3 streak shields per month', 'Session summary after each session', 'Total study hours tracked', 'Pro badge on leaderboard'],
      cta: 'Get Pro', href: '/plans'
    },
  ]

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {showAuth ? <AuthModal onClose={closeAuth} onDone={onAuthDone} /> : null}

      {/* NAV */}
      <nav className="nav" style={{ background: scrolled ? 'rgba(247,246,242,0.96)' : 'transparent', borderBottom: scrolled ? '1px solid ' + border : '1px solid transparent', backdropFilter: scrolled ? 'blur(10px)' : 'none' }}>
        <div className="wrap">
          <div className="nav-in">
            <Link href="/" style={{ fontFamily: 'Lora, Georgia, serif', fontSize: 17, fontWeight: 600, color: text, letterSpacing: '-0.01em' }}>
              FocusDuo
            </Link>

            <div className="hide-m" style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
              <Link href="/dashboard" className="nav-link">Dashboard</Link>
              <Link href="/plans" className="nav-link">Plans</Link>
              <Link href="/leaderboard" className="nav-link">Leaderboard</Link>
            </div>

            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {!ready ? (
                <div style={{ width: 76, height: 32, borderRadius: 7, background: border }} />
              ) : user ? (
                <>
                  <div className="hide-m" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {user.photoURL ? <img src={user.photoURL} alt="" style={{ width: 24, height: 24, borderRadius: '50%', border: '1px solid ' + border }} /> : null}
                    <span style={{ fontSize: 13, color: text2, maxWidth: 90, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {(user.displayName || '').split(' ')[0] || 'You'}
                    </span>
                  </div>
                  <Link href="/join" className="btn btn-dark btn-sm">Start studying</Link>
                  <button onClick={function() { signOut(auth) }} className="btn btn-ghost btn-sm hide-m">Sign out</button>
                </>
              ) : (
                <>
                  <button onClick={openAuth} className="btn btn-ghost btn-sm">Sign in</button>
                  <button onClick={openAuth} className="btn btn-dark btn-sm">Get started</button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section style={{ paddingTop: 128, paddingBottom: 80, background: bg }}>
        <div className="wrap">
          <Reveal delay={0}>
            <p className="caption" style={{ marginBottom: 22, color: text3 }}>For JEE and NEET students in India</p>
          </Reveal>

          <Reveal delay={70}>
            <h1 className="d1" style={{ marginBottom: 24, maxWidth: 680 }}>
              A study partner,<br />found in 30 seconds.
            </h1>
          </Reveal>

          <Reveal delay={140}>
            <p className="body-lg" style={{ maxWidth: 500, marginBottom: 36 }}>
              Pick your subject, get matched with a real student studying the same thing, and study together on a video call — directly in the browser.
            </p>
          </Reveal>

          <Reveal delay={200}>
            <div className="col-m" style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
              <button onClick={handleCTA} className="btn btn-dark" style={{ fontSize: 15, padding: '12px 26px' }}>
                {user ? 'Start studying' : 'Get started free'}
              </button>
              <Link href="/plans" className="btn btn-ghost" style={{ fontSize: 15, padding: '12px 22px' }}>
                See plans
              </Link>
            </div>
          </Reveal>

          <Reveal delay={250}>
            <p style={{ fontSize: 13, color: text3 }}>
              10 free sessions included. No card required.
            </p>
          </Reveal>
        </div>
      </section>

      {/* STATS */}
      <section className="section" style={{ background: white }}>
        <div className="wrap">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 0 }}>
            {[
              { n: '30s',    l: 'Average match time' },
              { n: '10',     l: 'Free sessions to start' },
              { n: '4',      l: 'Subjects covered' },
              { n: 'Rs 99',  l: 'Per month unlimited' },
            ].map(function (s, i) {
              return (
                <Reveal key={s.l} delay={i * 55}>
                  <div style={{ padding: '8px 0 8px ' + (i === 0 ? '0' : '32px'), borderLeft: i > 0 ? '1px solid ' + border : 'none' }}>
                    <div className="mono" style={{ marginBottom: 8 }}>{s.n}</div>
                    <p style={{ fontSize: 13, color: text3 }}>{s.l}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="section" style={{ background: bg }}>
        <div className="wrap">
          <Reveal>
            <p className="caption" style={{ marginBottom: 10 }}>How it works</p>
            <h2 className="h2" style={{ marginBottom: 48, maxWidth: 440 }}>Four steps from the homepage to studying.</h2>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 2 }}>
            {[
              { n: '01', t: 'Pick your subject',  d: 'Select your exam, subject, and whether you want a one-on-one or a group session.' },
              { n: '02', t: 'Get matched',         d: 'The system pairs you with another student on the same subject. Usually under 30 seconds.' },
              { n: '03', t: 'Set your chapter',    d: 'The first two minutes are for agreeing on what chapter you are covering. Leave in this window and your session credit is not used.' },
              { n: '04', t: 'Study together',      d: 'Video call opens inside the site. Both students study on camera. Session ends at 30 minutes for free users.' },
            ].map(function (step, i) {
              return (
                <Reveal key={step.n} delay={i * 70}>
                  <div className="card" style={{ background: white, height: '100%' }}>
                    <div className="step-n">{step.n}</div>
                    <h3 className="h3" style={{ marginBottom: 10 }}>{step.t}</h3>
                    <p className="body" style={{ fontSize: 14 }}>{step.d}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* COMPARISON */}
      <section className="section" style={{ background: white }}>
        <div className="wrap">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: 72, alignItems: 'start' }} className="col-m">
            <Reveal>
              <div>
                <p className="caption" style={{ marginBottom: 12 }}>The difference</p>
                <h2 className="h2" style={{ marginBottom: 20 }}>Why not Discord or Zoom?</h2>
                <p className="body" style={{ marginBottom: 16 }}>
                  Both are free and students already use them. The problem is neither was built for studying with a stranger.
                </p>
                <p className="body" style={{ marginBottom: 16 }}>
                  On Discord you need to find the right server and hope someone is available. On Zoom you need a link and someone to share it with. Both require knowing someone already.
                </p>
                <p className="body">
                  FocusDuo removes that step. You pick your subject and the system finds someone for you.
                </p>
              </div>
            </Reveal>

            <Reveal delay={80}>
              <div>
                <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr', gap: 12, paddingBottom: 10, borderBottom: '1px solid ' + border }}>
                  <span className="caption" style={{ paddingBottom: 0 }}> </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: text }}>FocusDuo</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: text3 }}>Discord / Zoom</span>
                </div>
                {[
                  { f: 'Finding a partner',    a: 'Automatic in 30 seconds',      b: 'Manual, need to know someone' },
                  { f: 'Distractions',         a: 'Study-only environment',        b: 'Memes, games, notifications' },
                  { f: 'Accountability',       a: 'Timer, streak, history',        b: 'None built in' },
                  { f: 'Reporting',            a: 'One tap after every session',   b: 'Usually nothing' },
                  { f: 'Session tracking',     a: 'Full history with streaks',     b: 'No tracking' },
                ].map(function (row) {
                  return (
                    <div key={row.f} style={{ display: 'grid', gridTemplateColumns: '130px 1fr 1fr', gap: 12, padding: '11px 0', borderBottom: '1px solid ' + border, alignItems: 'start' }}>
                      <span style={{ fontSize: 12, color: text3 }}>{row.f}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: text, lineHeight: 1.5 }}>{row.a}</span>
                      <span style={{ fontSize: 13, color: text3, lineHeight: 1.5 }}>{row.b}</span>
                    </div>
                  )
                })}
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="section" style={{ background: bg }}>
        <div className="wrap">
          <Reveal>
            <p className="caption" style={{ marginBottom: 10 }}>Features</p>
            <h2 className="h2" style={{ marginBottom: 48, maxWidth: 380 }}>Built for JEE and NEET students.</h2>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 2 }}>
            {features.map(function (f, i) {
              return (
                <Reveal key={f.t} delay={i * 45}>
                  <div className="card" style={{ background: white, height: '100%' }}>
                    <h3 className="h3" style={{ marginBottom: 10, fontSize: 16 }}>{f.t}</h3>
                    <p className="body" style={{ fontSize: 14 }}>{f.d}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section className="section" style={{ background: white }}>
        <div className="wrap">
          <Reveal>
            <p className="caption" style={{ marginBottom: 10 }}>Pricing</p>
            <h2 className="h2" style={{ marginBottom: 10, maxWidth: 380 }}>Free to start. Pay when ready.</h2>
            <p className="body" style={{ marginBottom: 48 }}>Payment via UPI. No card. No automatic charge ever.</p>
          </Reveal>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 2 }}>
            {plans.map(function (plan, i) {
              return (
                <Reveal key={plan.label} delay={i * 70}>
                  <div
                    className={'card' + (plan.featured ? ' plan-feature' : '')}
                    style={{ background: plan.featured ? white : bg, display: 'flex', flexDirection: 'column', height: '100%' }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                      <p className="caption">{plan.label}</p>
                      {plan.featured ? (
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 4, background: text, color: white, letterSpacing: '0.04em' }}>
                          Popular
                        </span>
                      ) : null}
                    </div>

                    <div style={{ fontFamily: 'Lora, Georgia, serif', fontSize: 38, fontWeight: 600, lineHeight: 1, color: text, marginBottom: 6 }}>
                      {plan.price}
                    </div>
                    <p style={{ fontSize: 13, color: text3, marginBottom: 24 }}>{plan.sub}</p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 9, marginBottom: 28, flex: 1 }}>
                      {plan.items.map(function (item) {
                        return (
                          <div key={item} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontSize: 14, color: plan.featured ? text : text2 }}>
                            <span style={{ color: text3, fontSize: 11, flexShrink: 0 }}>—</span>
                            {item}
                          </div>
                        )
                      })}
                    </div>

                    {plan.href ? (
                      <Link href={plan.href} className={'btn ' + (plan.featured ? 'btn-dark' : 'btn-ghost')} style={{ justifyContent: 'center', display: 'flex', fontSize: 14 }}>
                        {plan.cta}
                      </Link>
                    ) : (
                      <button onClick={handleCTA} className="btn btn-ghost" style={{ justifyContent: 'center', fontSize: 14 }}>
                        {plan.cta}
                      </button>
                    )}
                  </div>
                </Reveal>
              )
            })}
          </div>

          <Reveal delay={180}>
            <div style={{ marginTop: 14, padding: '16px 22px', borderRadius: 9, border: '1px solid ' + border, background: bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <div>
                <span style={{ fontSize: 14, fontWeight: 600, color: text }}>Early buyer — Rs 199 for a full year.</span>
                <span style={{ fontSize: 14, color: text2, marginLeft: 8 }}>First 100 buyers. Full Pro access.</span>
              </div>
              <Link href="/plans" className="btn btn-dark btn-sm">Claim offer</Link>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="section" style={{ background: bg }}>
        <div className="wrap">
          <Reveal>
            <div style={{ maxWidth: 520 }}>
              <h2 className="h2" style={{ marginBottom: 18 }}>Studying alone is harder than it needs to be.</h2>
              <p className="body-lg" style={{ marginBottom: 32 }}>
                Every session on FocusDuo is with a real student, studying the same subject, at the same time as you.
                It costs nothing to try.
              </p>
              <div className="col-m" style={{ display: 'flex', gap: 10 }}>
                <button onClick={handleCTA} className="btn btn-dark" style={{ fontSize: 15, padding: '12px 26px' }}>
                  {user ? 'Go to app' : 'Get started free'}
                </button>
                <Link href="/plans" className="btn btn-ghost" style={{ fontSize: 15, padding: '12px 22px' }}>
                  View plans
                </Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* FOOTER */}
      <div style={{ borderTop: '1px solid ' + border, background: white }}>
        <div className="wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, padding: '28px 0' }}>
            <span style={{ fontFamily: 'Lora, Georgia, serif', fontWeight: 600, fontSize: 16, color: text }}>FocusDuo</span>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[['Dashboard','/dashboard'],['Plans','/plans'],['Join','/join'],['Leaderboard','/leaderboard'],['Privacy','/privacy']].map(function (item) {
                return (
                  <Link key={item[0]} href={item[1]} style={{ fontSize: 13, color: text3, transition: 'color 0.15s' }}
                    onMouseEnter={function (e) { e.currentTarget.style.color = text2 }}
                    onMouseLeave={function (e) { e.currentTarget.style.color = text3 }}
                  >
                    {item[0]}
                  </Link>
                )
              })}
            </div>
            <span style={{ fontSize: 12, color: text3 }}>JEE · NEET · India</span>
          </div>
        </div>
      </div>
    </>
  )
                }
                      
