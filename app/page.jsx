// app/page.jsx
import Link from 'next/link'
import React from 'react'
import './globals.css'

export default function Landing() {
  return (
    <div className="container">
      <nav className="nav" aria-label="main">
        <a className="brand" href="/">
          <div className="logo" aria-hidden="true">FD</div>
          <div>
            <div style={{fontWeight:800, color:'#fff'}}>FocusDuo</div>
            <div style={{fontSize:12, color:'var(--muted)'}}>Study together. Stay consistent.</div>
          </div>
        </a>

        <div className="nav-links">
          <a href="/join">Join</a>
          <a href="/dashboard">Dashboard</a>
          <a href="#features">Features</a>
          <a className="cta-small" href="/join">Get started</a>
        </div>
      </nav>

      <header className="hero">
        <div>
          <div className="kicker">For JEE &amp; NEET students</div>
          <h1 className="h-title">Study with accountability — focus in sessions that actually work.</h1>
          <p className="h-sub">
            Structured, distraction-free study sessions with live social accountability, streaks and progress tracking.
            Match instantly with peers in the same exam & subject — start studying now.
          </p>

          <div className="h-cta" role="region" aria-label="calls to action">
            <Link href="/join"><button className="btn-primary">Start studying — join session</button></Link>
            <a href="/dashboard"><button className="btn-ghost">Open dashboard</button></a>
          </div>

          <div style={{marginTop:18, display:'flex', gap:12, alignItems:'center'}}>
            <div style={{display:'flex', gap:8}}>
              <div style={{fontSize:14, fontWeight:700}}>🔥 Current streak</div>
              <div style={{color:'var(--muted)', fontSize:14}}>Visible progress • Levels • Badges</div>
            </div>
          </div>
        </div>

        <div className="mockup" aria-hidden="true">
          <div className="study-card card-1">
            <div className="card-title">60 min Pomodoro</div>
            <div className="card-sub">Physics — Problem set</div>
          </div>

          <div className="study-card card-2">
            <div className="card-title">Group session</div>
            <div className="card-sub">Max 5 students • Calm mode</div>
          </div>

          <div className="study-card card-3">
            <div className="card-title">1-on-1 match</div>
            <div className="card-sub">Same exam • Same subject</div>
          </div>

          <div className="mock-screen" role="img" aria-label="live study preview">
            <div style={{display:'flex', alignItems:'center', gap:12}}>
              <div style={{width:64, height:64, borderRadius:10, background:'linear-gradient(90deg,#8e7bff,#5bd6ff)', display:'grid', placeItems:'center', fontWeight:800}}>JD</div>
              <div style={{textAlign:'left'}}>
                <div style={{fontWeight:700}}>Joined: Riya</div>
                <div style={{color:'var(--muted)', fontSize:13}}>Physics • 60m</div>
              </div>
            </div>

            <div style={{height:10}} />

            <div className="mock-timer">
              <div className="pulse" aria-hidden="true"></div>
              <div style={{fontWeight:800}}>00:31:12</div>
              <div style={{color:'var(--muted)'}}> • Focus mode</div>
            </div>
          </div>
        </div>
      </header>

      <section id="features" style={{marginTop:40}}>
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
          <h3 style={{margin:0}}>Why FocusDuo</h3>
          <div style={{color:'var(--muted)'}}>Built for exam study — minimal, reliable, focused.</div>
        </div>

        <div className="features" style={{marginTop:18}}>
          <div className="feature">
            <h4>Instant matchmaking</h4>
            <p>Same exam, same subject — matched in seconds. Deterministic queues, no random pairing.</p>
          </div>
          <div className="feature">
            <h4>Distraction-free sessions</h4>
            <p>Minimal UI, visible timer, and camera/mic controls so students focus, not scroll.</p>
          </div>
          <div className="feature">
            <h4>Progress & retention</h4>
            <p>Streaks, total hours, levels — all visible to encourage consistent daily study.</p>
          </div>
        </div>
      </section>

      <section style={{marginTop:40}}>
        <div className="card" style={{display:'flex', gap:20, alignItems:'center', justifyContent:'space-between'}}>
          <div>
            <div style={{fontWeight:800, fontSize:20}}>Ready to stop procrastinating?</div>
            <div style={{color:'var(--muted)'}}>Join a session now and start building momentum.</div>
          </div>

          <div style={{display:'flex', gap:10}}>
            <Link href="/join"><button className="btn-primary">Join a session — free</button></Link>
            <a href="/dashboard"><button className="btn-ghost">Explore dashboard</button></a>
          </div>
        </div>
      </section>

      <footer className="footer" style={{marginTop:40}}>
        <div className="copy">© {new Date().getFullYear()} FocusDuo — Built for focus</div>
        <div style={{display:'flex', gap:12}}>
          <a href="#" style={{color:'var(--muted)'}}>Privacy</a>
          <a href="#" style={{color:'var(--muted)'}}>Terms</a>
        </div>
      </footer>
    </div>
  )
}
