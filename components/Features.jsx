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
      <div className="features-head" style={{textAlign:'center'}}>
        <div className="kicker">Why FocusDuo</div>
        <h2 className="features-title">Built to make studying habitual</h2>
      </div>
      <div className="features-grid" style={{marginTop:18}}>
        {features.map(f=>(
          <div key={f.t} className="feature card" style={{padding:14}}>
            <div style={{color:'#64748b', fontSize:13}}>{f.t}</div>
            <div style={{marginTop:8}}>{f.d}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
