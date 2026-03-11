// app/page.jsx
export default function Home() {
  return (
    <div style={{padding:20}}>
      <h1 style={{marginTop:6}}>FocusDuo — Study together</h1>
      <p style={{color:'#555'}}>Structured study sessions with social accountability. Join a session or go to dashboard.</p>

      <div style={{display:'flex', gap:12, marginTop:20}}>
        <a href="/join"><button>Join a session</button></a>
        <a href="/dashboard"><button style={{background:'#444'}}>Dashboard</button></a>
      </div>

      <section style={{marginTop:30}}>
        <div className="card">
          <h3>How it works</h3>
          <ol>
            <li>Sign in with Google</li>
            <li>Choose exam, subject and mode (1-on-1 or group)</li>
            <li>Join the queue — you will be matched instantly when another user is waiting in same queue</li>
            <li>When matched, start the session — video will run through WebRTC inside our page</li>
          </ol>
        </div>
      </section>
    </div>
  )
}
