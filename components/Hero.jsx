// components/Hero.jsx
export default function Hero() {
  return (
    <section className="hero container">
      <div className="hero-left">
        <div className="kicker">FocusDuo — Built for JEE & NEET</div>
        <h1 className="hero-title">Study together. <span className="primary">Stay consistent.</span></h1>
        <p className="hero-sub">Structured timed sessions, visible progress, and social accountability — designed to make studying habitual.</p>
        <div className="hero-ctas" style={{marginTop:14}}>
          <a href="/dashboard" className="btn-primary">Get started — it's free</a>
        </div>
      </div>

      <div className="hero-right card">
        <div className="live-label">Live session • Physics • JEE</div>
        <div className="session-card">
          <div className="avatar">FD</div>
          <div>
            <div style={{fontWeight:600}}>Thermo Study Group</div>
            <div className="muted" style={{fontSize:13}}>5 participants • 20m left</div>
          </div>
          <div style={{marginLeft:'auto', color:'var(--primary)', fontWeight:700}}>14d streak</div>
        </div>
      </div>
    </section>
  )
}
