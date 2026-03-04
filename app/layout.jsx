// app/layout.jsx
import './globals.css'
import Header from '../components/Header'

export const metadata = {
  title: 'FocusDuo',
  description: 'Study together. Stay consistent.',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{children}</main>
      </body>
    </html>
  )
}
