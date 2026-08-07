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

function Reveal({ children, delay }) {
  var ref = useRef(null)
  var [on, setOn] = useState(false)
  useEffect(function () {
    var el = ref.current; if (!el) return
    var obs = new IntersectionObserver(function (e) {
      if (e[0].isIntersecting) { setOn(true); obs.disconnect() }
    }, { threshold: 0.07 })
    obs.observe(el)
    return function () { obs.disconnect() }
  }, [])
  return (
    <div ref={ref} style={{
      opacity: on ? 1 : 0,
      transform: on ? 'translateY(0)' : 'translateY(14px)',
      transition: 'opacity 0.5s ease ' + (delay || 0) + 'ms, transform 0.5s ease ' + (delay || 0) + 'ms'
    }}>
      {children}
    </div>
  )
}

function AuthModal({ onClose, onDone }) {
  var [busy, setBusy] = useState(false)
  var [err, setErr] = useState('')
  async function go() {
    setBusy(true); setErr('')
    try { await signInWithPopup(auth, googleProvider); onDone() }
    catch (e) { setErr('Sign in failed. Please try again.') }
    finally { setBusy(false) }
  }
  return (
    <div onClick={function (e) { if (e.target === e.currentTarget) onClose() }} style={{
      position: 'fixed', inset: 0, zIndex: 900, padding: 16,
      background: 'rgba(26,26,24,0.45)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      <div style={{
        width: '100%', maxWidth: 400, background: '#FFF',
        border: '1px solid #E4E2DC', borderRadius: 14,
        padding: '32px 24px', position: 'relative',
        boxShadow: '0 20px 60px rgba(26,26,24,0.14)'
      }}>
        <button onClick={onClose} style={{
          position: 'absolute', top: 14, right: 14, width: 28, height: 28,
          borderRadius: 6, background: '#F5F3EE', border: 'none',
          color: '#6B6860', cursor: 'pointer', fontSize: 18,
          display: 'flex', alignItems: 'center', justifyContent: 'center'
        }}>×</button>
        <h2 style={{ fontFamily: 'Lora,Georgia,serif', fontSize: 21, fontWeight: 600, color: '#1A1A18', margin: '0 0 8px' }}>
          Create your account
        </h2>
        <p style={{ fontSize: 14, lineHeight: 1.65, color: '#6B6860', margin: '0 0 22px' }}>
          Sign in with Google to start finding study partners. Free, no card needed.
        </p>
        <button onClick={go} disabled={busy} style={{
          width: '100%', padding: '13px 16px', borderRadius: 9,
          border: '1px solid #E4E2DC', background: busy ? '#F5F3EE' : '#FFF',
          color: '#1A1A18', fontWeight: 600, fontSize: 15, cursor: busy ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
          fontFamily: 'DM Sans,system-ui,sans-serif', boxSizing: 'border-box'
        }}>
          <svg width="18" height="18" viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
            <path fill="#FFC107" d="M43.6 20.1H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.7-.4-3.9z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 8 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2A12 12 0 0 1 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20.1H42V20H24v8h11.3a12 12 0 0 1-4.1 5.6l6.2 5.2C36.9 39.2 44 34 44 24c0-1.3-.1-2.7-.4-3.9z"/>
          </svg>
          {busy ? 'Signing in...' : 'Continue with Google'}
        </button>
        {err ? <p style={{ marginTop: 10, fontSize: 13, color: '#B45309', textAlign: 'center', marginBottom: 0 }}>{err}</p> : null}
        <p style={{ marginTop: 14, fontSize: 12, color: '#A8A59F', textAlign: 'center', marginBottom: 0 }}>
          We only collect your name and email. No card required.
        </p>
      </div>
    </div>
  )
}

export default function Page() {
  useFonts()
  var router = useRouter()
  var [user, setUser]         = useState(null)
  var [ready, setReady]       = useState(false)
  var [showAuth, setShowAuth] = useState(false)
  var [scrolled, setScrolled] = useState(false)

  useEffect(function () {
    var u = onAuthStateChanged(auth, function (u) { setUser(u || null); setReady(true) })
    return function () { u() }
  }, [])
  useEffect(function () {
    function fn() { setScrolled(window.scrollY > 48) }
    window.addEventListener('scroll', fn, { passive: true })
    return function () { window.removeEventListener('scroll', fn) }
  }, [])

  function handleCTA() { user ? router.push('/join') : setShowAuth(true) }
  function onAuthDone() { setShowAuth(false); router.push('/join') }

  var css = '\n' +
  /* ── Reset & base ─────────────────────────── */
  '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; min-width: 0; }\n' +
  'html { overflow-x: clip; -webkit-text-size-adjust: 100%; scroll-behavior: smooth; }\n' +
  'body { background: #F7F6F2; color: #1A1A18; font-family: "DM Sans",system-ui,-apple-system,sans-serif; -webkit-font-smoothing: antialiased; overflow-x: clip; line-height: 1.6; }\n' +
  'a { color: inherit; text-decoration: none; }\n' +
  'button { font-family: inherit; }\n' +

  /* ── Layout ───────────────────────────────── */
  '.wrap { width: 100%; max-width: 1060px; margin: 0 auto; padding: 0 20px; }\n' +
  '.section { padding: 64px 0; border-top: 1px solid #E4E2DC; }\n' +

  /* ── Nav ──────────────────────────────────── */
  '.nav { position: fixed; top: 0; left: 0; right: 0; z-index: 500; height: 56px; transition: background 0.25s, border-color 0.25s; }\n' +
  '.nav-inner { display: flex; align-items: center; justify-content: space-between; height: 56px; gap: 10px; }\n' +
  '.nav-logo { font-family: "Lora",Georgia,serif; font-size: 17px; font-weight: 600; color: #1A1A18; flex-shrink: 0; }\n' +
  '.nav-mid { display: flex; gap: 2px; align-items: center; }\n' +
  '.nav-link { font-size: 14px; color: #6B6860; font-weight: 500; padding: 6px 10px; border-radius: 6px; transition: color 0.15s; white-space: nowrap; }\n' +
  '.nav-link:hover { color: #1A1A18; }\n' +
  '.nav-right { display: flex; gap: 8px; align-items: center; flex-shrink: 0; }\n' +

  /* ── Buttons ──────────────────────────────── */
  '.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: none; border-radius: 8px; font-family: "DM Sans",system-ui,sans-serif; font-weight: 600; cursor: pointer; transition: background 0.15s, border-color 0.15s; white-space: nowrap; text-decoration: none; line-height: 1; }\n' +
  '.btn-dark { background: #1A1A18; color: #fff; }\n' +
  '.btn-dark:hover { background: #2D2D2B; }\n' +
  '.btn-ghost { background: transparent; color: #1A1A18; border: 1px solid #E4E2DC; }\n' +
  '.btn-ghost:hover { border-color: #C8C5BC; background: #FFF; }\n' +
  '.btn-lg { padding: 12px 24px; font-size: 15px; }\n' +
  '.btn-sm { padding: 8px 16px; font-size: 13px; border-radius: 7px; }\n' +
  '.dash-btn { display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border-radius: 7px; font-size: 13px; font-weight: 600; color: #6B6860; border: 1px solid #E4E2DC; background: #FFF; cursor: pointer; transition: all 0.15s; white-space: nowrap; text-decoration: none; }\n' +
  '.dash-btn:hover { color: #1A1A18; border-color: #C8C5BC; }\n' +

  /* ── Cards ────────────────────────────────── */
  '.card { background: #FFF; border: 1px solid #E4E2DC; border-radius: 10px; padding: 22px; transition: box-shadow 0.2s; }\n' +
  '.card:hover { box-shadow: 0 6px 24px rgba(26,26,24,0.07); }\n' +
  '.card-bg { background: #F7F6F2; border: 1px solid #E4E2DC; border-radius: 10px; padding: 22px; }\n' +
  '.card-featured { background: #FFF; border: 2px solid #1A1A18; border-radius: 10px; padding: 22px; }\n' +

  /* ── Typography ───────────────────────────── */
  '.t-label { font-size: 11px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: #A8A59F; }\n' +
  '.t-display { font-family: "Lora",Georgia,serif; font-size: clamp(30px,6vw,64px); font-weight: 600; line-height: 1.08; letter-spacing: -0.025em; color: #1A1A18; }\n' +
  '.t-h2 { font-family: "Lora",Georgia,serif; font-size: clamp(22px,3.5vw,38px); font-weight: 600; line-height: 1.18; letter-spacing: -0.015em; color: #1A1A18; }\n' +
  '.t-h3 { font-family: "Lora",Georgia,serif; font-size: clamp(15px,1.8vw,19px); font-weight: 600; line-height: 1.3; color: #1A1A18; }\n' +
  '.t-body { font-size: 15px; line-height: 1.72; color: #6B6860; }\n' +
  '.t-body-lg { font-size: clamp(15px,1.8vw,17px); line-height: 1.72; color: #6B6860; }\n' +
  '.t-stat { font-family: "Lora",Georgia,serif; font-size: clamp(26px,4.5vw,46px); font-weight: 600; line-height: 1; color: #1A1A18; }\n' +
  '.t-step-n { font-family: "Lora",Georgia,serif; font-size: 32px; font-weight: 600; color: #E4E2DC; line-height: 1; margin-bottom: 14px; }\n' +
  '.t-price { font-family: "Lora",Georgia,serif; font-size: 36px; font-weight: 600; line-height: 1; color: #1A1A18; }\n' +

  /* ── Stats grid: 2-col mobile → 4-col desktop ─ */
  '.stats-grid { display: grid; grid-template-columns: 1fr 1fr; }\n' +
  '.stats-cell { padding: 32px 20px; border-right: 1px solid #E4E2DC; border-bottom: 1px solid #E4E2DC; }\n' +

  /* ── Feature grid ─────────────────────────── */
  '.feat-grid { display: grid; grid-template-columns: 1fr; gap: 2px; }\n' +

  /* ── Plan grid ────────────────────────────── */
  '.plan-grid { display: grid; grid-template-columns: 1fr; gap: 2px; }\n' +

  /* ── Step grid ────────────────────────────── */
  '.step-grid { display: grid; grid-template-columns: 1fr; gap: 2px; }\n' +

  /* ── Comparison ───────────────────────────── */
  '.comp-table { display: none; }\n' +
  '.comp-simple { display: block; }\n' +
  '.comp-layout { display: flex; flex-direction: column; gap: 32px; }\n' +

  /* ── Flex helpers ─────────────────────────── */
  '.flex-row { display: flex; gap: 10px; flex-wrap: wrap; }\n' +

  /* ── Mobile hide ──────────────────────────── */
  '.hide-mobile { display: none !important; }\n' +

  /* ── Plan item ────────────────────────────── */
  '.plan-item { display: flex; align-items: baseline; gap: 10px; font-size: 14px; }\n' +
  '.plan-dash { color: #A8A59F; font-size: 11px; flex-shrink: 0; }\n' +

  /* ── Desktop breakpoint ───────────────────── */
  '@media (min-width: 680px) {\n' +
  '  .wrap { padding: 0 28px; }\n' +
  '  .section { padding: 72px 0; }\n' +
  '  .hide-mobile { display: flex !important; }\n' +
  '  .stats-grid { grid-template-columns: repeat(4, 1fr); }\n' +
  '  .stats-cell { border-bottom: none; }\n' +
  '  .feat-grid { grid-template-columns: repeat(2, 1fr); }\n' +
  '  .plan-grid { grid-template-columns: repeat(3, 1fr); }\n' +
  '  .step-grid { grid-template-columns: repeat(4, 1fr); }\n' +
  '  .comp-table { display: block; }\n' +
  '  .comp-simple { display: none; }\n' +
  '  .comp-layout { flex-direction: row; gap: 60px; }\n' +
  '  .nav-mid { display: flex; }\n' +
  '}\n' +
  '@media (max-width: 679px) {\n' +
  '  .nav-mid { display: none; }\n' +
  '  .card, .card-bg, .card-featured { padding: 18px; }\n' +
  '  .btn-lg { padding: 12px 20px; font-size: 14px; }\n' +
  '}\n' +
  '@media (min-width: 900px) {\n' +
  '  .feat-grid { grid-template-columns: repeat(4, 1fr); }\n' +
  '}\n'

  var compRows = [
    { f: 'Finding a partner',  a: 'Automatic in under 30 seconds',    b: 'Manual — need to know someone already' },
    { f: 'Distractions',       a: 'Study-only environment',            b: 'Memes, games, other channels nearby' },
    { f: 'Accountability',     a: 'Timer, streak, session history',    b: 'None built in' },
    { f: 'Session tracking',   a: 'Full history with streaks',         b: 'No tracking at all' },
    { f: 'Reporting',          a: 'One tap report after every session', b: 'Usually nothing' },
  ]
  var features = [
    { t: 'Automatic matching',  d: 'Pick a subject and the system pairs you with another student. No need to know anyone in advance.' },
    { t: 'Video call in browser', d: 'Works on Jio, Airtel, and Wi-Fi. No app download. Tested on Android and iOS.' },
    { t: 'Streak tracking',     d: 'Complete a session daily to build a streak. Pro users get one shield per month to protect it.' },
    { t: 'Leaderboard',         d: 'Weekly rankings by sessions and streak length. Open to every user.' },
    { t: 'Session history',     d: 'Every session is logged. Free users see last 5. Pro users see everything.' },
    { t: 'Report system',       d: 'Rate and optionally report your partner after every session. Reviewed by admin.' },
    { t: 'Grace period',        d: 'First two minutes of each session are free to leave. No credit deducted.' },
    { t: 'Session notes',       d: 'Pro users can write notes after each session. Saved permanently in their history.' },
  ]
  var freeItems  = ['10 one-on-one sessions', '10 group sessions', '30 minutes per session', 'Streak tracking', 'Leaderboard access', 'Join topic group rooms']
  var proItems   = ['Unlimited sessions', 'No session time limit', 'Priority matching', 'Full session history', '1 streak shield per month', 'Create topic group rooms', 'Session notes', 'Session summary', 'Total hours tracked', 'Weekly study report', 'Pro badge on leaderboard']

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />

      {showAuth ? <AuthModal onClose={function () { setShowAuth(false) }} onDone={onAuthDone} /> : null}

      {/* ── NAV ─────────────────────────────────── */}
      <nav className="nav" style={{
        background: scrolled ? 'rgba(247,246,242,0.96)' : 'transparent',
        borderBottom: '1px solid ' + (scrolled ? '#E4E2DC' : 'transparent'),
        backdropFilter: scrolled ? 'blur(12px)' : 'none'
      }}>
        <div className="wrap">
          <div className="nav-inner">
            <Link href="/" className="nav-logo">FocusDuo</Link>

            {/* Center links — desktop only */}
            <div className="nav-mid">
              <Link href="/plans" className="nav-link">Plans</Link>
              <Link href="/leaderboard" className="nav-link">Leaderboard</Link>
            </div>

            {/* Right auth area */}
            <div className="nav-right">
              {!ready ? (
                <div style={{ width: 64, height: 32, borderRadius: 7, background: '#E4E2DC' }} />
              ) : user ? (
                <>
                  {/* Dashboard — always visible when logged in */}
                  <Link href="/dashboard" className="dash-btn">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                      <rect x="3" y="3" width="7" height="7" rx="1"/>
                      <rect x="14" y="3" width="7" height="7" rx="1"/>
                      <rect x="14" y="14" width="7" height="7" rx="1"/>
                      <rect x="3" y="14" width="7" height="7" rx="1"/>
                    </svg>
                    <span>Dashboard</span>
                  </Link>
                  <Link href="/join" className="btn btn-dark btn-sm">Start studying</Link>
                </>
              ) : (
                <>
                  <button onClick={function () { setShowAuth(true) }} className="btn btn-ghost btn-sm hide-mobile" style={{ display: 'none' }}>Sign in</button>
                  <button onClick={function () { setShowAuth(true) }} className="btn btn-dark btn-sm">Get started</button>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* ── HERO ────────────────────────────────── */}
      <section style={{ paddingTop: 112, paddingBottom: 72, background: '#F7F6F2' }}>
        <div className="wrap">
          <Reveal delay={0}>
            <p className="t-label" style={{ marginBottom: 18 }}>For JEE and NEET students in India</p>
          </Reveal>
          <Reveal delay={70}>
            <h1 className="t-display" style={{ marginBottom: 20, maxWidth: 660 }}>
              A study partner,<br />found in 30 seconds.
            </h1>
          </Reveal>
          <Reveal delay={140}>
            <p className="t-body-lg" style={{ maxWidth: 480, marginBottom: 30 }}>
              Pick your subject, get matched with a real student studying the same thing, and study together on a video call — directly in the browser. No app, no Discord server, no Zoom link.
            </p>
          </Reveal>
          <Reveal delay={200}>
            <div className="flex-row" style={{ marginBottom: 18 }}>
              <button onClick={handleCTA} className="btn btn-dark btn-lg">
                {user ? 'Start studying' : 'Get started free'}
              </button>
              <Link href="/plans" className="btn btn-ghost btn-lg">See plans</Link>
            </div>
          </Reveal>
          <Reveal delay={240}>
            <p style={{ fontSize: 13, color: '#A8A59F' }}>10 free sessions included. No card required.</p>
          </Reveal>
        </div>
      </section>

      {/* ── STATS ───────────────────────────────── */}
      <section style={{ borderTop: '1px solid #E4E2DC', background: '#FFF' }}>
        <div className="wrap">
          <div className="stats-grid">
            {[
              { n: '30s',   l: 'Average match time' },
              { n: '10',    l: 'Free sessions included' },
              { n: '4',     l: 'Subjects covered' },
              { n: 'Rs 99', l: 'Per month, unlimited' },
            ].map(function (s, i) {
              return (
                <Reveal key={s.l} delay={i * 50}>
                  <div className="stats-cell">
                    <div className="t-stat" style={{ marginBottom: 6 }}>{s.n}</div>
                    <p style={{ fontSize: 13, color: '#A8A59F', lineHeight: 1.4 }}>{s.l}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ────────────────────────── */}
      <section className="section" style={{ background: '#F7F6F2' }}>
        <div className="wrap">
          <Reveal>
            <p className="t-label" style={{ marginBottom: 10 }}>How it works</p>
            <h2 className="t-h2" style={{ marginBottom: 40, maxWidth: 420 }}>Four steps from opening the site to studying.</h2>
          </Reveal>
          <div className="step-grid">
            {[
              { n: '01', t: 'Pick your subject',  d: 'Select your exam, subject, and mode — one-on-one or group.' },
              { n: '02', t: 'Get matched',          d: 'The system finds another student on the same subject. Usually under 30 seconds.' },
              { n: '03', t: 'Set your chapter',     d: 'First two minutes to agree on what you are covering. Leave in this window and no credit is used.' },
              { n: '04', t: 'Study together',       d: 'Video call opens in the browser. No app, no download, no link sharing needed.' },
            ].map(function (s, i) {
              return (
                <Reveal key={s.n} delay={i * 65}>
                  <div className="card" style={{ height: '100%' }}>
                    <div className="t-step-n">{s.n}</div>
                    <h3 className="t-h3" style={{ marginBottom: 9 }}>{s.t}</h3>
                    <p className="t-body" style={{ fontSize: 14 }}>{s.d}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── COMPARISON ──────────────────────────── */}
      <section className="section" style={{ background: '#FFF' }}>
        <div className="wrap">
          <div className="comp-layout">

            {/* Left text */}
            <Reveal>
              <div style={{ maxWidth: 380, flexShrink: 0 }}>
                <p className="t-label" style={{ marginBottom: 12 }}>The difference</p>
                <h2 className="t-h2" style={{ marginBottom: 18 }}>Why not Discord or Zoom?</h2>
                <p className="t-body" style={{ marginBottom: 14 }}>
                  Both are free and students already use them. The problem is neither was built for studying with a stranger.
                </p>
                <p className="t-body">
                  On Discord you need to find the right server and hope someone is free. On Zoom you need a link and someone to send it. FocusDuo removes that step — pick your subject and the system finds someone for you.
                </p>
              </div>
            </Reveal>

            {/* Desktop table */}
            <Reveal delay={80}>
              <div className="comp-table" style={{ flex: 1 }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, paddingBottom: 10, borderBottom: '1px solid #E4E2DC' }}>
                  <span style={{ fontSize: 11, color: '#A8A59F' }}> </span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#1A1A18' }}>FocusDuo</span>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#A8A59F' }}>Discord / Zoom</span>
                </div>
                {compRows.map(function (row) {
                  return (
                    <div key={row.f} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, padding: '11px 0', borderBottom: '1px solid #E4E2DC', alignItems: 'start' }}>
                      <span style={{ fontSize: 12, color: '#A8A59F', lineHeight: 1.5 }}>{row.f}</span>
                      <span style={{ fontSize: 13, fontWeight: 600, color: '#1A1A18', lineHeight: 1.5 }}>{row.a}</span>
                      <span style={{ fontSize: 13, color: '#A8A59F', lineHeight: 1.5 }}>{row.b}</span>
                    </div>
                  )
                })}
              </div>
            </Reveal>

            {/* Mobile simple list */}
            <Reveal delay={80}>
              <div className="comp-simple">
                <div style={{ marginTop: 8 }}>
                  {compRows.map(function (row) {
                    return (
                      <div key={row.f} style={{ padding: '12px 0', borderBottom: '1px solid #E4E2DC' }}>
                        <p style={{ fontSize: 11, color: '#A8A59F', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600, marginBottom: 5 }}>{row.f}</p>
                        <p style={{ fontSize: 14, fontWeight: 600, color: '#1A1A18', marginBottom: 3 }}>{row.a}</p>
                        <p style={{ fontSize: 13, color: '#A8A59F' }}>vs. {row.b}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            </Reveal>

          </div>
        </div>
      </section>

      {/* ── FEATURES ────────────────────────────── */}
      <section className="section" style={{ background: '#F7F6F2' }}>
        <div className="wrap">
          <Reveal>
            <p className="t-label" style={{ marginBottom: 10 }}>Features</p>
            <h2 className="t-h2" style={{ marginBottom: 40, maxWidth: 360 }}>Built for JEE and NEET students.</h2>
          </Reveal>
          <div className="feat-grid">
            {features.map(function (f, i) {
              return (
                <Reveal key={f.t} delay={i * 40}>
                  <div className="card" style={{ height: '100%' }}>
                    <h3 className="t-h3" style={{ marginBottom: 9, fontSize: 15 }}>{f.t}</h3>
                    <p className="t-body" style={{ fontSize: 14 }}>{f.d}</p>
                  </div>
                </Reveal>
              )
            })}
          </div>
        </div>
      </section>

      {/* ── PRICING ─────────────────────────────── */}
      <section className="section" style={{ background: '#FFF' }}>
        <div className="wrap">
          <Reveal>
            <p className="t-label" style={{ marginBottom: 10 }}>Pricing</p>
            <h2 className="t-h2" style={{ marginBottom: 10, maxWidth: 360 }}>Free to start. Pay when ready.</h2>
            <p className="t-body" style={{ marginBottom: 40 }}>Payment via UPI. No card. No automatic charge.</p>
          </Reveal>
          <div className="plan-grid">

            {/* Free */}
            <Reveal delay={0}>
              <div className="card-bg" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <p className="t-label" style={{ marginBottom: 14 }}>Free</p>
                <div className="t-price" style={{ marginBottom: 5 }}>Rs 0</div>
                <p style={{ fontSize: 13, color: '#A8A59F', marginBottom: 22 }}>No card, no expiry</p>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                  {freeItems.map(function (item) {
                    return (
                      <div key={item} className="plan-item">
                        <span className="plan-dash">—</span>
                        <span style={{ color: '#6B6860', fontSize: 14 }}>{item}</span>
                      </div>
                    )
                  })}
                </div>
                <button onClick={handleCTA} className="btn btn-ghost" style={{ width: '100%', padding: '10px 0', fontSize: 14 }}>
                  {user ? 'Go to app' : 'Start free'}
                </button>
              </div>
            </Reveal>

            {/* Pro */}
            <Reveal delay={80}>
              <div className="card-featured" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <p className="t-label">Pro</p>
                  <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 4, background: '#1A1A18', color: '#FFF', letterSpacing: '0.04em' }}>Popular</span>
                </div>
                <div className="t-price" style={{ marginBottom: 5 }}>Rs 99</div>
                <p style={{ fontSize: 13, color: '#A8A59F', marginBottom: 22 }}>per month · Rs 199 / 3 months · Rs 699 / year</p>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                  {proItems.map(function (item) {
                    return (
                      <div key={item} className="plan-item">
                        <span className="plan-dash">—</span>
                        <span style={{ color: '#1A1A18', fontSize: 14 }}>{item}</span>
                      </div>
                    )
                  })}
                </div>
                <Link href="/plans" className="btn btn-dark" style={{ width: '100%', padding: '10px 0', fontSize: 14, display: 'flex' }}>
                  Get Pro
                </Link>
              </div>
            </Reveal>

            {/* Early buyer */}
            <Reveal delay={160}>
              <div className="card-bg" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <p className="t-label" style={{ marginBottom: 14 }}>Early buyer</p>
                <div className="t-price" style={{ marginBottom: 5 }}>Rs 199</div>
                <p style={{ fontSize: 13, color: '#A8A59F', marginBottom: 10 }}>for a full year</p>
                <p style={{ fontSize: 13, color: '#6B6860', lineHeight: 1.65, marginBottom: 22 }}>
                  First 100 buyers only. Full Pro access at Rs 199 — price stays the same even when it goes up for others.
                </p>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 22 }}>
                  {['Everything in Pro', 'Price locked forever', 'Limited to 100 buyers'].map(function (item) {
                    return (
                      <div key={item} className="plan-item">
                        <span className="plan-dash">—</span>
                        <span style={{ color: '#6B6860', fontSize: 14 }}>{item}</span>
                      </div>
                    )
                  })}
                </div>
                <Link href="/plans" className="btn btn-ghost" style={{ width: '100%', padding: '10px 0', fontSize: 14, display: 'flex' }}>
                  Claim offer
                </Link>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* ── FINAL CTA ───────────────────────────── */}
      <section className="section" style={{ background: '#F7F6F2' }}>
        <div className="wrap">
          <Reveal>
            <div style={{ maxWidth: 500 }}>
              <h2 className="t-h2" style={{ marginBottom: 16 }}>Studying alone is harder than it needs to be.</h2>
              <p className="t-body-lg" style={{ marginBottom: 28 }}>
                Every session on FocusDuo is with a real student, studying the same subject, at the same time as you. It costs nothing to try.
              </p>
              <div className="flex-row">
                <button onClick={handleCTA} className="btn btn-dark btn-lg">
                  {user ? 'Go to app' : 'Get started free'}
                </button>
                <Link href="/plans" className="btn btn-ghost btn-lg">View plans</Link>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FOOTER ──────────────────────────────── */}
      <div style={{ borderTop: '1px solid #E4E2DC', background: '#FFF' }}>
        <div className="wrap">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 14, padding: '26px 0' }}>
            <span style={{ fontFamily: 'Lora,Georgia,serif', fontWeight: 600, fontSize: 16, color: '#1A1A18' }}>FocusDuo</span>
            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
              {[['Dashboard','/dashboard'],['Plans','/plans'],['Join','/join'],['Leaderboard','/leaderboard'],['Privacy','/privacy']].map(function (item) {
                return (
                  <Link key={item[0]} href={item[1]} style={{ fontSize: 13, color: '#A8A59F', transition: 'color 0.15s' }}
                    onMouseEnter={function (e) { e.currentTarget.style.color = '#6B6860' }}
                    onMouseLeave={function (e) { e.currentTarget.style.color = '#A8A59F' }}
                  >{item[0]}</Link>
                )
              })}
            </div>
            <span style={{ fontSize: 12, color: '#A8A59F' }}>JEE · NEET · India</span>
          </div>
        </div>
      </div>
    </>
  )
}
