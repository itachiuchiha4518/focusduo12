import Link from 'next/link'

export default function Home() {
  return (
    <div>
      <header style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:24}}>
        <h1 style={{margin:0}}>FocusDuo</h1>
        <div>
          <Link href="/dashboard"><button>Dashboard</button></Link>
        </div>
      </header>

      <section style={{padding:20, borderRadius:12, background:'#f6fbff', boxShadow:'0 6px 18px rgba(10,20,50,0.06)'}}>
        <h2>Study with accountability</h2>
        <p>Structured sessions • Streaks • Minimal UI</p>
        <p style={{marginTop:18}}>
          <Link href="/join"><button style={{padding:'10px 18px'}}>Join a study session</button></Link>
        </p>
      </section>
    </div>
  )
}
