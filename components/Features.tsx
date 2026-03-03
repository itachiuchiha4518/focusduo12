// components/Features.tsx
export default function Features(){
  const features = [
    {t:'Structured Sessions', d:'Start focused sessions with visible timers and clear goals.'},
    {t:'Social Accountability', d:'Match with students of same exam & subject. Visible streaks keep you consistent.'},
    {t:'Retention Systems', d:'Streaks, commitment score, and levels for positive reinforcement.'},
    {t:'Manual UPI Payments', d:'Users submit txn IDs; admin verifies via admin panel.'}
  ]
  return (
    <section id="features" className="container mt-16">
      <div className="text-center">
        <div className="kicker">Why FocusDuo</div>
        <h2 className="text-2xl md:text-3xl font-bold mt-2">Built to make studying habitual</h2>
      </div>
      <div className="grid md:grid-cols-4 gap-6 mt-8">
        {features.map(f=>(
          <div key={f.t} className="p-5 rounded-lg bg-white shadow-card">
            <div className="text-sm text-slate-500">{f.t}</div>
            <div className="mt-2 text-sm text-slate-700">{f.d}</div>
          </div>
        ))}
      </div>
    </section>
  )
}
