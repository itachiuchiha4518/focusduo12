// app/layout.jsx
import './globals.css'

export const metadata = {
  title: 'FocusDuo',
  description: 'Study together. Stay consistent.'
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <header style={{padding:12, borderBottom:'1px solid #eee'}}>
          <div style={{maxWidth:1000, margin:'0 auto', display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div style={{fontWeight:700, color:'#0d47a1', fontSize:20}}>FocusDuo</div>
            <nav>
              <a href="/" style={{marginRight:12}}>Home</a>
              <a href="/join" style={{marginRight:12}}>Join</a>
              <a href="/dashboard">Dashboard</a>
            </nav>
          </div>
        </header>
        <main style={{maxWidth:1000, margin:'18px auto'}}>{children}</main>
      </body>
    </html>
  )
}
