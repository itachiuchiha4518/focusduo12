// app/layout.js
export const metadata = {
  title: 'FocusDuo (Safe)'
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head />
      <body style={{ fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, Arial', margin: 0, background: '#f7fafc' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 18 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <div style={{ width: 44, height: 44, borderRadius: 8, background: '#0b74ff', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>FD</div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 700 }}>FocusDuo</div>
                <div style={{ fontSize: 12, color: '#6b7280' }}>Safe mode</div>
              </div>
            </div>
            <div style={{ fontSize: 13, color: '#374151' }}>Temporary safe-mode (no external services)</div>
          </header>

          <main>{children}</main>

          <footer style={{ marginTop: 36, color: '#6b7280', fontSize: 13 }}>
            FocusDuo — safe-mode. Real-time features disabled until we re-enable them.
          </footer>
        </div>
      </body>
    </html>
  )
}
