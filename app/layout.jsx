import './globals.css'

export const metadata = {
  title: 'FocusDuo',
  description: 'Study together, stay consistent'
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <main style={{maxWidth: 980, margin: '0 auto', padding: 20}}>
          {children}
        </main>
      </body>
    </html>
  )
}
