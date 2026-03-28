'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

// ── Animated counter ──────────────────────────────────
function Counter({ to, suffix = '', duration = 2000 }) {
  const [val, setVal] = useState(0)
  const ref = useRef(null)
  const started = useRef(false)

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !started.current) {
        started.current = true
        const start = performance.now()
        const tick = (now) => {
          const p = Math.min((now - start) / duration, 1)
          const ease = 1 - Math.pow(1 - p, 3)
          setVal(Math.floor(ease * to))
          if (p < 1) requestAnimationFrame(tick)
          else setVal(to)
        }
        requestAnimationFrame(tick)
      }
    }, { threshold: 0.5 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [to, duration])

  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>
}

// ── Fade-in on scroll ─────────────────────────────────
function FadeIn({ children, delay = 0, style = {} }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setVisible(true); obs.disconnect() }
    }, { threshold: 0.1 })
    if (ref.current) obs.observe(ref.current)
    return () => obs.disconnect()
  }, [])

  return (
    <div ref={ref} style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(32px)',
      transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
      ...style
    }}>
      {children}
    </div>
  )
}

// ── Matchmaking live demo ─────────────────────────────
const SUBJECTS = ['Physics', 'Chemistry', 'Math', 'Biology']
const EXAMS    = ['JEE', 'NEET']
const NAMES    = ['Arjun K.', 'Priya S.', 'Rahul M.', 'Sneha P.', 'Dev R.', 'Ananya T.']

function LiveDemo() {
  const [phase, setPhase]     = useState('idle')   // idle | searching | matched
  const [subject, setSubject] = useState('Physics')
  const [exam, setExam]       = useState('JEE')
  const [partner, setPartner] = useState(null)
  const [dots, setDots]       = useState('')

  useEffect(() => {
    if (phase !== 'searching') return
    const di = setInterval(() => setDots(d => d.length >= 3 ? '' : d + '.'), 400)
    const ti = setTimeout(() => {
      setPartner(NAMES[Math.floor(Math.random() * NAMES.length)])
      setPhase('matched')
    }, 2800)
    return () => { clearInterval(di); clearTimeout(ti) }
  }, [phase])

  function start() {
    if (phase === 'searching') return
    setPhase('searching'); setPartner(null)
  }

  function reset() { setPhase('idle'); setPartner(null); setDots('') }

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)',
      border: '1px solid rgba(99,179,237,0.2)',
      borderRadius: 20, padding: 24, maxWidth: 420, width: '100%'
    }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: '#63b3ed', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 16 }}>
        Live demo — try it
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ color: '#718096', fontSize: 11, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase' }}>Exam</div>
          <div style={{ display: 'flex', gap: 6 }}>
            {EXAMS.map(e => (
              <button key={e} onClick={() => { if (phase === 'idle') setExam(e) }} style={{
                flex: 1, padding: '8px 4px', borderRadius: 8, fontWeight: 700, fontSize: 13,
                border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                background: exam === e ? 'linear-gradient(90deg,#3182ce,#6b46c1)' : 'rgba(255,255,255,0.06)',
                color: exam === e ? '#fff' : '#a0aec0'
              }}>{e}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ color: '#718096', fontSize: 11, fontWeight: 700, marginBottom: 5, textTransform: 'uppercase' }}>Subject</div>
          <select value={subject} onChange={e => { if (phase === 'idle') setSubject(e.target.value) }} style={{
            width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(99,179,237,0.2)',
            background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 13, outline: 'none'
          }}>
            {SUBJECTS.map(s => <option key={s} value={s} style={{ background: '#1a202c' }}>{s}</option>)}
          </select>
        </div>
      </div>

      {phase === 'idle' && (
        <button onClick={start} style={{
          width: '100%', padding: '13px 0', borderRadius: 12, fontWeight: 900, fontSize: 15,
          border: 'none', background: 'linear-gradient(90deg,#3182ce,#6b46c1)', color: '#fff',
          cursor: 'pointer', letterSpacing: 0.5
        }}>
          Find a study partner →
        </button>
      )}

      {phase === 'searching' && (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: 28, marginBottom: 8, animation: 'spin 1s linear infinite', display: 'inline-block' }}>🔍</div>
          <div style={{ color: '#63b3ed', fontWeight: 700, fontSize: 15 }}>
            Searching for a {exam} {subject} partner{dots}
          </div>
          <div style={{ color: '#718096', fontSize: 13, marginTop: 4 }}>Usually takes under 30 seconds</div>
        </div>
      )}

      {phase === 'matched' && partner && (
        <div style={{ textAlign: 'center', padding: '8px 0' }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>🎉</div>
          <div style={{ color: '#68d391', fontWeight: 900, fontSize: 17, marginBottom: 4 }}>
            Matched with {partner}!
          </div>
          <div style={{ color: '#718096', fontSize: 13, marginBottom: 14 }}>
            {exam} • {subject} • Starting video call...
          </div>
          <button onClick={reset} style={{
            padding: '10px 24px', borderRadius: 10, fontWeight: 800, fontSize: 13,
            border: '1px solid rgba(99,179,237,0.3)', background: 'transparent', color: '#63b3ed', cursor: 'pointer'
          }}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

// ── VS Card comparison ────────────────────────────────
function VSRow({ label, us, them, win }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
      <div style={{
        padding: '8px 14px', borderRadius: 10, textAlign: 'center', fontWeight: 700, fontSize: 13,
        background: win === 'us' ? 'rgba(104,211,145,0.12)' : 'rgba(255,255,255,0.04)',
        color: win === 'us' ? '#68d391' : '#718096',
        border: win === 'us' ? '1px solid rgba(104,211,145,0.25)' : '1px solid transparent'
      }}>{us}</div>
      <div style={{ textAlign: 'center', color: '#4a5568', fontSize: 12, fontWeight: 700, minWidth: 90 }}>{label}</div>
      <div style={{
        padding: '8px 14px', borderRadius: 10, textAlign: 'center', fontWeight: 700, fontSize: 13,
        background: win === 'them' ? 'rgba(104,211,145,0.12)' : 'rgba(255,255,255,0.04)',
        color: win === 'them' ? '#68d391' : '#718096',
        border: win === 'them' ? '1px solid rgba(104,211,145,0.25)' : '1px solid transparent'
      }}>{them}</div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────
export default function HomePage() {
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800;900&family=DM+Sans:wght@400;500;600;700&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        :root {
          --blue:   #3182ce;
          --violet: #6b46c1;
          --green:  #68d391;
          --bg:     #0d1117;
          --surface:#161b22;
          --border: rgba(255,255,255,0.08);
          --text:   #e2e8f0;
          --muted:  #718096;
        }

        html { scroll-behavior: smooth; }

        body {
          background: var(--bg);
          color: var(--text);
          font-family: 'DM Sans', system-ui, sans-serif;
          overflow-x: hidden;
        }

        .hero-title {
          font-family: 'Syne', sans-serif;
          font-size: clamp(36px, 7vw, 82px);
          font-weight: 900;
          line-height: 1.0;
          letter-spacing: -2px;
        }

        .section-title {
          font-family: 'Syne', sans-serif;
          font-size: clamp(28px, 4vw, 52px);
          font-weight: 900;
          line-height: 1.1;
          letter-spacing: -1px;
        }

        .gradient-text {
          background: linear-gradient(135deg, #63b3ed 0%, #b794f4 50%, #68d391 100%);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }

        .glow-btn {
          position: relative;
          padding: 15px 32px;
          border-radius: 14px;
          border: none;
          background: linear-gradient(90deg, var(--blue), var(--violet));
          color: #fff;
          font-weight: 800;
          font-size: 16px;
          cursor: pointer;
          transition: transform 0.2s, box-shadow 0.2s;
          text-decoration: none;
          display: inline-block;
          font-family: 'DM Sans', sans-serif;
        }
        .glow-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 0 32px rgba(99,130,237,0.5);
        }

        .ghost-btn {
          padding: 14px 28px;
          border-radius: 14px;
          border: 1px solid rgba(255,255,255,0.15);
          background: rgba(255,255,255,0.05);
          color: #e2e8f0;
          font-weight: 700;
          font-size: 16px;
          cursor: pointer;
          transition: all 0.2s;
          text-decoration: none;
          display: inline-block;
          font-family: 'DM Sans', sans-serif;
        }
        .ghost-btn:hover {
          background: rgba(255,255,255,0.1);
          border-color: rgba(255,255,255,0.3);
        }

        .feature-card {
          padding: 28px;
          border-radius: 20px;
          background: var(--surface);
          border: 1px solid var(--border);
          transition: transform 0.25s, border-color 0.25s, box-shadow 0.25s;
        }
        .feature-card:hover {
          transform: translateY(-4px);
          border-color: rgba(99,130,237,0.35);
          box-shadow: 0 20px 40px rgba(0,0,0,0.3);
        }

        .plan-card {
          padding: 28px;
          border-radius: 22px;
          background: var(--surface);
          border: 1px solid var(--border);
          transition: transform 0.25s, box-shadow 0.25s;
        }
        .plan-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 24px 48px rgba(0,0,0,0.35);
        }

        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50%       { transform: translateY(-10px); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes pulse-ring {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(1.8); opacity: 0; }
        }
        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .float { animation: float 4s ease-in-out infinite; }
        .float-delay { animation: float 4s ease-in-out 1.5s infinite; }

        .live-dot {
          display: inline-block;
          width: 8px; height: 8px;
          border-radius: 50%;
          background: var(--green);
          position: relative;
          animation: blink 2s ease-in-out infinite;
        }
        .live-dot::after {
          content: '';
          position: absolute;
          inset: -4px;
          border-radius: 50%;
          border: 2px solid var(--green);
          animation: pulse-ring 2s ease-out infinite;
        }

        .grid-bg {
          background-image: 
            linear-gradient(rgba(99,130,237,0.06) 1px, transparent 1px),
            linear-gradient(90deg, rgba(99,130,237,0.06) 1px, transparent 1px);
          background-size: 60px 60px;
        }

        .noise {
          position: fixed;
          inset: 0;
          pointer-events: none;
          z-index: 0;
          opacity: 0.025;
          background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E");
        }

        /* Responsive */
        @media (max-width: 768px) {
          .hero-title { letter-spacing: -1px; }
          .hide-mobile { display: none !important; }
          .stack-mobile { flex-direction: column !important; }
          .full-mobile { width: 100% !important; }
          .center-mobile { text-align: center !important; align-items: center !important; }
        }

        @media (min-width: 769px) {
          .hide-desktop { display: none !important; }
        }
      `}</style>

      <div className="noise" />

      {/* ── NAV ─────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        padding: '0 24px',
        background: scrolled ? 'rgba(13,17,23,0.92)' : 'transparent',
        backdropFilter: scrolled ? 'blur(20px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
        transition: 'all 0.3s',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        height: 64
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 22, fontFamily: 'Syne, sans-serif', fontWeight: 900, letterSpacing: -0.5 }}>
            Focus<span className="gradient-text">Duo</span>
          </span>
          <span className="live-dot" style={{ marginLeft: 4 }} />
          <span style={{ fontSize: 11, color: 'var(--green)', fontWeight: 700 }}>LIVE</span>
        </div>

        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Link href="/plans" className="ghost-btn hide-mobile" style={{ padding: '9px 18px', fontSize: 14 }}>
            Plans
          </Link>
          <Link href="/join" className="glow-btn" style={{ padding: '9px 20px', fontSize: 14 }}>
            Start studying →
          </Link>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────── */}
      <section className="grid-bg" style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '100px 24px 80px', position: 'relative', overflow: 'hidden'
      }}>
        {/* Ambient blobs */}
        <div style={{
          position: 'absolute', top: '15%', left: '10%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(49,130,206,0.15) 0%, transparent 70%)',
          pointerEvents: 'none', filter: 'blur(40px)'
        }} />
        <div style={{
          position: 'absolute', bottom: '10%', right: '8%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(107,70,193,0.15) 0%, transparent 70%)',
          pointerEvents: 'none', filter: 'blur(40px)'
        }} />

        <div style={{ maxWidth: 1100, width: '100%', position: 'relative', zIndex: 1 }}>
          {/* Badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '7px 16px', borderRadius: 999,
            border: '1px solid rgba(99,179,237,0.3)',
            background: 'rgba(99,179,237,0.08)',
            marginBottom: 28,
            animation: 'slide-up 0.6s ease both'
          }}>
            <span className="live-dot" />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#63b3ed' }}>
              Built for JEE &amp; NEET students
            </span>
          </div>

          <div style={{ display: 'flex', gap: 48, alignItems: 'center', flexWrap: 'wrap' }}>

            {/* Left — headline */}
            <div style={{ flex: '1 1 480px', animation: 'slide-up 0.7s ease 0.1s both' }}>
              <h1 className="hero-title">
                Stop studying<br />
                <span className="gradient-text">alone.</span>
              </h1>
              <p style={{
                fontSize: 'clamp(16px, 2vw, 20px)', color: 'var(--muted)',
                lineHeight: 1.7, marginTop: 20, maxWidth: 520
              }}>
                Get matched with a serious JEE or NEET partner in under 30 seconds.
                Video call, stay accountable, and actually get work done.
                No Discord servers. No Zoom links. Just study.
              </p>

              <div style={{ display: 'flex', gap: 12, marginTop: 32, flexWrap: 'wrap' }}>
                <Link href="/join" className="glow-btn">
                  Find a partner now →
                </Link>
                <Link href="/plans" className="ghost-btn">
                  View plans
                </Link>
              </div>

              {/* Trust chips */}
              <div style={{ display: 'flex', gap: 10, marginTop: 28, flexWrap: 'wrap' }}>
                {[
                  '✅ Free to start',
                  '⚡ Matched in 30s',
                  '🔒 Safe & moderated',
                  '📱 Works on mobile'
                ].map(t => (
                  <div key={t} style={{
                    padding: '6px 14px', borderRadius: 999, fontSize: 13, fontWeight: 600,
                    background: 'rgba(255,255,255,0.05)', border: '1px solid var(--border)', color: 'var(--muted)'
                  }}>{t}</div>
                ))}
              </div>
            </div>

            {/* Right — live demo */}
            <div className="float" style={{ flex: '1 1 360px', display: 'flex', justifyContent: 'center', animation: 'slide-up 0.7s ease 0.25s both' }}>
              <LiveDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ── STATS ─────────────────────────────────────── */}
      <section style={{ padding: '64px 24px', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>
        <FadeIn>
          <div style={{
            maxWidth: 900, margin: '0 auto',
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 32, textAlign: 'center'
          }}>
            {[
              { n: 10, suffix: '+', label: 'Free sessions to start' },
              { n: 30, suffix: 's', label: 'Average match time' },
              { n: 99, suffix: '₹', label: 'Per month, unlimited' },
              { n: 4, suffix: '', label: 'Subjects covered' },
            ].map(({ n, suffix, label }) => (
              <div key={label}>
                <div style={{
                  fontFamily: 'Syne, sans-serif', fontSize: 'clamp(36px,5vw,56px)',
                  fontWeight: 900, lineHeight: 1
                }}>
                  <span className="gradient-text">
                    <Counter to={n} suffix={suffix === '₹' ? '' : suffix} />
                    {suffix === '₹' && '₹'}
                  </span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 14, marginTop: 8 }}>{label}</div>
              </div>
            ))}
          </div>
        </FadeIn>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────── */}
      <section style={{ padding: '96px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ color: '#63b3ed', fontWeight: 700, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
              Simple as it gets
            </div>
            <h2 className="section-title">How FocusDuo works</h2>
          </div>
        </FadeIn>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
          {[
            {
              n: '01', icon: '📚', title: 'Pick your subject',
              desc: 'Choose your exam (JEE or NEET), subject, and whether you want 1-on-1 or a group session.',
              delay: 0
            },
            {
              n: '02', icon: '⚡', title: 'Get matched instantly',
              desc: 'Our system pairs you with another serious student in the same subject — usually under 30 seconds.',
              delay: 100
            },
            {
              n: '03', icon: '🎯', title: 'Set your chapter',
              desc: 'In the first 2 minutes, tell your partner what chapter you\'re covering. Leave early and you won\'t lose a credit.',
              delay: 200
            },
            {
              n: '04', icon: '🔥', title: 'Study and build streaks',
              desc: 'Complete sessions to build your streak. The leaderboard shows the top studiers every week.',
              delay: 300
            },
          ].map(({ n, icon, title, desc, delay }) => (
            <FadeIn key={n} delay={delay}>
              <div className="feature-card" style={{ height: '100%' }}>
                <div style={{
                  fontFamily: 'Syne, sans-serif', fontSize: 11, fontWeight: 900,
                  color: '#4a5568', letterSpacing: 2, marginBottom: 16
                }}>{n}</div>
                <div style={{ fontSize: 36, marginBottom: 14 }}>{icon}</div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, marginBottom: 10 }}>{title}</div>
                <div style={{ color: 'var(--muted)', lineHeight: 1.7, fontSize: 15 }}>{desc}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── VS DISCORD ────────────────────────────────── */}
      <section style={{
        padding: '96px 24px',
        background: 'linear-gradient(180deg, transparent, rgba(49,130,206,0.04), transparent)'
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 48 }}>
              <h2 className="section-title">
                Why not just use<br />
                <span className="gradient-text">Discord or Zoom?</span>
              </h2>
              <p style={{ color: 'var(--muted)', marginTop: 16, fontSize: 16, lineHeight: 1.7 }}>
                Honest answer — those are free. But they have a problem FocusDuo solves.
              </p>
            </div>
          </FadeIn>

          <FadeIn delay={100}>
            <div style={{
              background: 'var(--surface)', borderRadius: 20, overflow: 'hidden',
              border: '1px solid var(--border)'
            }}>
              {/* Header */}
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr auto 1fr',
                gap: 10, padding: '16px 24px',
                background: 'rgba(255,255,255,0.03)',
                borderBottom: '1px solid var(--border)'
              }}>
                <div style={{ textAlign: 'center', fontWeight: 900, color: '#63b3ed', fontFamily: 'Syne, sans-serif' }}>
                  FocusDuo ✅
                </div>
                <div style={{ textAlign: 'center', color: '#4a5568', fontSize: 12, fontWeight: 700 }}> </div>
                <div style={{ textAlign: 'center', fontWeight: 700, color: 'var(--muted)' }}>
                  Discord / Zoom
                </div>
              </div>

              {/* Rows */}
              <div style={{ padding: '8px 24px 16px' }}>
                {[
                  { label: 'Finding a partner', us: 'Auto-matched in 30s', them: 'Beg in a server', win: 'us' },
                  { label: 'Staying focused', us: 'Study-only space', them: 'Memes & distractions', win: 'us' },
                  { label: 'Accountability', us: 'Timer + streak system', them: 'Nothing', win: 'us' },
                  { label: 'Cost', us: 'Free tier available', them: 'Free', win: 'them' },
                  { label: 'Mobile quality', us: 'Optimised for India', them: 'Heavy, laggy', win: 'us' },
                  { label: 'Report bad actors', us: 'Built-in system', them: 'Nothing', win: 'us' },
                  { label: 'Session history', us: 'Tracked & saved', them: 'No tracking', win: 'us' },
                ].map(row => <VSRow key={row.label} {...row} />)}
              </div>
            </div>
          </FadeIn>

          <FadeIn delay={200}>
            <p style={{ textAlign: 'center', color: 'var(--muted)', marginTop: 24, fontSize: 14, lineHeight: 1.7 }}>
              Discord finds you a distraction.<br />
              <strong style={{ color: 'var(--text)' }}>FocusDuo finds you a study partner.</strong>
            </p>
          </FadeIn>
        </div>
      </section>

      {/* ── FEATURES ─────────────────────────────────── */}
      <section style={{ padding: '96px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 64 }}>
            <div style={{ color: '#b794f4', fontWeight: 700, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
              Everything you need
            </div>
            <h2 className="section-title">Built for serious students</h2>
          </div>
        </FadeIn>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
          {[
            { icon: '📹', title: 'Real video call', desc: 'HD video and crystal-clear audio, optimised for Indian networks. Works on Jio, Airtel, Wi-Fi.', delay: 0 },
            { icon: '🔥', title: 'Streak system', desc: 'Study every day and build your streak. Miss a day and it resets. Paid users get streak shields.', delay: 60 },
            { icon: '🏆', title: 'Weekly leaderboard', desc: 'Compete with students across India. Top studiers by sessions and streak get ranked publicly.', delay: 120 },
            { icon: '⚡', title: 'Priority matching', desc: 'Paid users skip to the front of the queue and get matched before free users.', delay: 180 },
            { icon: '📊', title: 'Session history', desc: 'Track every session, partner, and subject. Free users see last 5. Paid users see everything.', delay: 240 },
            { icon: '🛡️', title: 'Safe & moderated', desc: 'Report bad partners with one tap. Our admin team reviews and bans violators within hours.', delay: 300 },
            { icon: '🎯', title: 'Chapter selection', desc: 'The first 2 minutes are for choosing your chapter. Leave early and your credit is not used.', delay: 360 },
            { icon: '🔗', title: 'Referral rewards', desc: 'Refer a friend and both of you get bonus sessions added instantly.', delay: 420 },
          ].map(({ icon, title, desc, delay }) => (
            <FadeIn key={title} delay={delay}>
              <div className="feature-card">
                <div style={{ fontSize: 32, marginBottom: 14 }}>{icon}</div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 17, fontWeight: 800, marginBottom: 8 }}>{title}</div>
                <div style={{ color: 'var(--muted)', lineHeight: 1.7, fontSize: 14 }}>{desc}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── PRICING ──────────────────────────────────── */}
      <section style={{ padding: '96px 24px', background: 'rgba(255,255,255,0.015)' }}>
        <div style={{ maxWidth: 900, margin: '0 auto' }}>
          <FadeIn>
            <div style={{ textAlign: 'center', marginBottom: 56 }}>
              <div style={{ color: '#68d391', fontWeight: 700, fontSize: 13, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12 }}>
                Honest pricing
              </div>
              <h2 className="section-title">Start free. Upgrade when ready.</h2>
              <p style={{ color: 'var(--muted)', marginTop: 14, fontSize: 16 }}>
                No auto-charge. No card required. Pay via UPI when you're ready.
              </p>
            </div>
          </FadeIn>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>

            {/* Free */}
            <FadeIn delay={0}>
              <div className="plan-card">
                <div style={{ color: 'var(--muted)', fontWeight: 700, marginBottom: 6, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Free forever</div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 40, fontWeight: 900, marginBottom: 4 }}>₹0</div>
                <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>No card needed</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                  {['10 one-on-one sessions', '10 group sessions', '30 min per session', 'Streak tracking', 'Leaderboard access'].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--muted)' }}>
                      <span style={{ color: '#68d391', fontSize: 12 }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                <Link href="/join" className="ghost-btn full-mobile" style={{ display: 'block', textAlign: 'center', fontSize: 14 }}>
                  Start for free →
                </Link>
              </div>
            </FadeIn>

            {/* Monthly */}
            <FadeIn delay={100}>
              <div className="plan-card" style={{ border: '1px solid rgba(99,130,237,0.4)', position: 'relative', overflow: 'hidden' }}>
                <div style={{
                  position: 'absolute', top: 16, right: 16,
                  padding: '4px 12px', borderRadius: 999, fontSize: 11, fontWeight: 800,
                  background: 'linear-gradient(90deg,#3182ce,#6b46c1)', color: '#fff'
                }}>
                  POPULAR
                </div>
                <div style={{ color: '#63b3ed', fontWeight: 700, marginBottom: 6, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Plus</div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 40, fontWeight: 900, marginBottom: 4 }}>
                  <span className="gradient-text">₹99</span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 20 }}>per month</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                  {['Unlimited sessions', '60 min per session', '⚡ Priority queue', 'Full session history', '1 streak shield/month'].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--text)' }}>
                      <span style={{ color: '#68d391', fontSize: 12 }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                <Link href="/plans" className="glow-btn full-mobile" style={{ display: 'block', textAlign: 'center', fontSize: 14 }}>
                  Upgrade for ₹99 →
                </Link>
              </div>
            </FadeIn>

            {/* Yearly */}
            <FadeIn delay={200}>
              <div className="plan-card" style={{ border: '1px solid rgba(251,191,36,0.25)' }}>
                <div style={{ color: '#f6e05e', fontWeight: 700, marginBottom: 6, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 }}>Pro — Best value</div>
                <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 40, fontWeight: 900, marginBottom: 4 }}>
                  <span style={{ background: 'linear-gradient(135deg,#f6e05e,#f59e0b)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>₹699</span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 4 }}>per year · <s>₹1188</s></div>
                <div style={{ color: '#68d391', fontSize: 12, fontWeight: 700, marginBottom: 16 }}>Save ₹489 vs monthly</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
                  {['Everything in Plus', 'Unlimited session length', '3 streak shields/month', 'Pro badge on leaderboard', 'Early access to features'].map(f => (
                    <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: 'var(--text)' }}>
                      <span style={{ color: '#f6e05e', fontSize: 12 }}>✓</span> {f}
                    </div>
                  ))}
                </div>
                <Link href="/plans" className="ghost-btn full-mobile" style={{ display: 'block', textAlign: 'center', fontSize: 14, borderColor: 'rgba(251,191,36,0.3)' }}>
                  Get yearly →
                </Link>
              </div>
            </FadeIn>

          </div>

          {/* Early bird */}
          <FadeIn delay={300}>
            <div style={{
              marginTop: 20, padding: '20px 24px', borderRadius: 16,
              background: 'linear-gradient(90deg,rgba(239,68,68,0.1),rgba(107,70,193,0.1))',
              border: '1px solid rgba(239,68,68,0.25)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16
            }}>
              <div>
                <div style={{ fontWeight: 900, fontSize: 16, marginBottom: 4 }}>
                  🔥 Early Bird — ₹199/year <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 400 }}>First 100 buyers only</span>
                </div>
                <div style={{ color: 'var(--muted)', fontSize: 14 }}>
                  Full Pro plan for ₹199 — locked in forever even when price goes up.
                </div>
              </div>
              <Link href="/plans" className="glow-btn" style={{ padding: '11px 24px', fontSize: 14, background: 'linear-gradient(90deg,#ef4444,#6b46c1)', whiteSpace: 'nowrap' }}>
                Claim ₹199 deal →
              </Link>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* ── TESTIMONIALS / SOCIAL PROOF ──────────────── */}
      <section style={{ padding: '96px 24px', maxWidth: 900, margin: '0 auto' }}>
        <FadeIn>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 className="section-title">Made for the grind</h2>
            <p style={{ color: 'var(--muted)', marginTop: 12, fontSize: 16 }}>
              JEE and NEET students studying smarter together.
            </p>
          </div>
        </FadeIn>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          {[
            { q: '"I couldn\'t focus alone. With FocusDuo I actually sit for 2 hours straight because my partner is watching."', name: 'JEE aspirant, Delhi', delay: 0 },
            { q: '"Better than any Discord study server I\'ve tried. No memes, no distractions, just someone studying with you."', name: 'NEET student, Mumbai', delay: 100 },
            { q: '"The streak system is addictive. I haven\'t missed a day in 3 weeks because I don\'t want to lose my streak."', name: 'JEE aspirant, Bangalore', delay: 200 },
          ].map(({ q, name, delay }) => (
            <FadeIn key={name} delay={delay}>
              <div className="feature-card">
                <div style={{ color: '#63b3ed', fontSize: 28, marginBottom: 12, fontFamily: 'Georgia, serif' }}>"</div>
                <p style={{ color: 'var(--muted)', lineHeight: 1.8, fontSize: 15, fontStyle: 'italic', marginBottom: 16 }}>{q.replace(/^"|"$/g, '')}</p>
                <div style={{ color: 'var(--text)', fontWeight: 700, fontSize: 13 }}>— {name}</div>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────── */}
      <section style={{ padding: '96px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', inset: 0,
          background: 'radial-gradient(ellipse at center, rgba(49,130,206,0.12) 0%, transparent 70%)',
          pointerEvents: 'none'
        }} />
        <FadeIn>
          <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto', position: 'relative' }}>
            <h2 className="section-title">
              Your rank won't improve<br />
              <span className="gradient-text">studying alone.</span>
            </h2>
            <p style={{ color: 'var(--muted)', fontSize: 17, lineHeight: 1.7, marginTop: 20, marginBottom: 36 }}>
              Every topper has a study partner. FocusDuo gives you one in 30 seconds.
              Free to start. No card needed.
            </p>
            <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link href="/join" className="glow-btn" style={{ fontSize: 17, padding: '16px 36px' }}>
                Start studying free →
              </Link>
              <Link href="/plans" className="ghost-btn" style={{ fontSize: 16, padding: '15px 28px' }}>
                See plans
              </Link>
            </div>
            <div style={{ color: 'var(--muted)', fontSize: 13, marginTop: 20 }}>
              JEE • NEET • Physics • Chemistry • Math • Biology
            </div>
          </div>
        </FadeIn>
      </section>

      {/* ── FOOTER ───────────────────────────────────── */}
      <footer style={{
        borderTop: '1px solid var(--border)',
        padding: '32px 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        flexWrap: 'wrap', gap: 16, maxWidth: 1100, margin: '0 auto'
      }}>
        <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 900, fontSize: 18 }}>
          Focus<span className="gradient-text">Duo</span>
        </div>
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {[
            { label: 'Dashboard', href: '/dashboard' },
            { label: 'Plans',     href: '/plans' },
            { label: 'Join',      href: '/join' },
            { label: 'Leaderboard', href: '/leaderboard' },
          ].map(({ label, href }) => (
            <Link key={label} href={href} style={{ color: 'var(--muted)', textDecoration: 'none', fontSize: 14, fontWeight: 500, transition: 'color 0.2s' }}
              onMouseEnter={e => e.target.style.color = '#e2e8f0'}
              onMouseLeave={e => e.target.style.color = 'var(--muted)'}
            >{label}</Link>
          ))}
        </div>
        <div style={{ color: 'var(--muted)', fontSize: 13 }}>
          © 2025 FocusDuo · Made for JEE &amp; NEET students
        </div>
      </footer>

    </>
  )
}
