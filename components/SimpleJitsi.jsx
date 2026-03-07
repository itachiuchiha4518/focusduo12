// components/SimpleJitsi.jsx
'use client'

/*
  Minimal, self-contained iframe embed for meet.jit.si.
  No firebase imports. No window.* at module scope.
*/

export default function SimpleJitsi({ roomId, displayName }) {
  const domain = 'meet.jit.si'
  const roomName = `FocusDuo_${roomId}`
  const src = `https://${domain}/${encodeURIComponent(roomName)}#userInfo.displayName="${encodeURIComponent(displayName || 'Student')}"`

  return (
    <div style={{ width: '100%', height: 520, borderRadius: 10, overflow: 'hidden', background: '#000' }}>
      <iframe
        title={`SimpleJitsi ${roomName}`}
        src={src}
        style={{ width: '100%', height: '100%', border: 0 }}
        allow="camera; microphone; fullscreen; display-capture"
      />
    </div>
  )
}
