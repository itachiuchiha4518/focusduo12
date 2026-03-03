// app/layout.tsx
import './globals.css'
import { ReactNode } from 'react'
import Header from '../components/Header'

export const metadata = {
  title: 'FocusDuo',
  description: 'Study together. Stay consistent.'
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Header />
        <main>{children}</main>
      </body>
    </html>
  )
}
