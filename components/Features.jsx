// components/Features.jsx
export default function Features(){
  const features = [
    {t:'Structured Sessions', d:'Start focused sessions with visible timers and clear goals.'},
    {t:'Social Accountability', d:'Match with students of same exam & subject. Visible streaks keep you consistent.'},
    {t:'Retention Systems', d:'Streaks, commitment score, and levels for positive reinforcement.'},
    {t:'Manual UPI Payments', d:'Users submit txn IDs; admin verifies via admin panel.'}
  ]
  return (
    <section id="features" className="features container">
      <div className="features-head">
        <div className="kicker">Why FocusDuo</div>
        <h2 className="features-title">Built to make studying habitual</h2>
      </div>
      <div className="features-grid">
        {features.map(f=>(
          <div key={f.t} className="feature card">
            <div className="feature-title">{f.t}</div>
            <div className="feature-desc">{f.d}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
