// components/Hero.jsx
export default function Hero() {
  return (
    <section className="hero container">
      <div className="hero-left">
        <div className="kicker">FocusDuo — Built for JEE & NEET</div>
        <h1 className="hero-title">Study together. <span className="primary">Stay consistent.</span></h1>
        <p className="hero-sub">Structured timed sessions, visible progress, and social accountability — designed to make studying habitual.</p>
        <div className="hero-ctas">
          <a href="/dashboard" className="btn-primary">Get started — it's free</a>
          <a href="#features" className="ghost-link">How it works</a>
        </div>
      </div>

      <div className="hero-right card">
        <div className="live-label">Live session • Physics • JEE</div>
        <div className="session-card">
          <div className="avatar">FD</div>
          <div className="session-info">
            <div className="session-title">Thermo Study Group</div>
            <div className="session-sub">5 participants • 20m left</div>
          </div>
          <div className="streak">14d streak</div>
        </div>
      </div>
    </section>
  )
}
