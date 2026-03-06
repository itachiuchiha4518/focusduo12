// components/JitsiRoom.jsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { collection, addDoc } from '../lib/firebase' // for reporting (if you want)

export default function JitsiRoom({ roomId, displayName, sessionId }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const scriptRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [embedError, setEmbedError] = useState(null)
  const [joined, setJoined] = useState(false)
  const [participants, setParticipants] = useState(0)
  const domain = 'meet.jit.si'
  const roomName = `FocusDuo_${roomId}`
  const browserUrl = `https://${domain}/${encodeURIComponent(roomName)}#userInfo.displayName="${encodeURIComponent(displayName || 'Student')}"`

  function ensureScript() {
    return new Promise((resolve, reject) => {
      if (window.JitsiMeetExternalAPI) return resolve(true)
      if (scriptRef.current) {
        scriptRef.current.addEventListener('load', () => resolve(true))
        scriptRef.current.addEventListener('error', () => reject(new Error('script-load-failed')))
        return
      }
      const s = document.createElement('script')
      s.src = 'https://meet.jit.si/external_api.js'
      s.async = true
      s.onload = () => resolve(true)
      s.onerror = () => reject(new Error('script-load-failed'))
      document.head.appendChild(s)
      scriptRef.current = s
    })
  }

  async function mountJitsi() {
    setLoading(true)
    setEmbedError(null)

    try {
      await ensureScript()
    } catch (e) {
      setEmbedError('Failed to load Jitsi script')
      setLoading(false)
      return
    }

    try {
      if (apiRef.current && apiRef.current.dispose) {
        apiRef.current.dispose()
        apiRef.current = null
      }
    } catch (e) { /* ignore */ }

    if (!containerRef.current) {
      setEmbedError('Mount container missing')
      setLoading(false)
      return
    }

    try {
      const options = {
        roomName,
        parentNode: containerRef.current,
        userInfo: { displayName: displayName || 'Student' },
        configOverwrite: {
          prejoinPageEnabled: false,
          startWithAudioMuted: false,
          startWithVideoMuted: true,
          disableDeepLinking: true,
          enableUserRolesBasedOnToken: false
        },
        interfaceConfigOverwrite: {
          MOBILE_APP_PROMO: false,
          TOOLBAR_BUTTONS: [
            'microphone', 'camera', 'chat', 'tileview', 'fullscreen', 'hangup'
          ]
        }
      }

      apiRef.current = new window.JitsiMeetExternalAPI(domain, options)

      apiRef.current.addEventListener('videoConferenceJoined', ev => {
        console.log('[Jitsi] joined', ev)
        setJoined(true)
        setLoading(false)
      })

      apiRef.current.addEventListener('videoConferenceLeft', () => {
        setJoined(false)
      })

      apiRef.current.addEventListener('participantJoined', () => {
        try { const count = apiRef.current.getNumberOfParticipants(); setParticipants(count) } catch (e) {}
      })

      apiRef.current.addEventListener('participantLeft', () => {
        try { const count = apiRef.current.getNumberOfParticipants(); setParticipants(count) } catch (e) {}
      })

      // fallback timeout
      const failTimeout = setTimeout(() => {
        if (!joined) {
          setEmbedError('Embed appears stuck. Use "Open in browser".')
          setLoading(false)
        }
      }, 12000)

      return () => clearTimeout(failTimeout)
    } catch (err) {
      console.error('[Jitsi] instantiate error', err)
      setEmbedError('Failed to create Jitsi instance: ' + (err.message || err))
      setLoading(false)
    }
  }

  useEffect(() => {
    mountJitsi()
    return () => {
      try { if (apiRef.current && apiRef.current.dispose) apiRef.current.dispose() } catch (e) {}
      apiRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, displayName])

  async function reportSession(reason = 'manual-report') {
    try {
      await addDoc(collection('reports'), {
        sessionId: sessionId || roomId,
        reason,
        at: new Date().toISOString()
      })
      alert('Report submitted.')
    } catch (e) {
      console.warn('report failed', e)
      alert('Could not submit report (client-only). Contact admin.')
    }
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: '#444' }}>{loading ? 'Loading video...' : (embedError ? 'Embed error' : 'Video')}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={browserUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '7px 10px', background: '#2563eb', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 13 }}>
            Open in browser
          </a>
          <button onClick={() => { try { if (apiRef.current && apiRef.current.dispose) apiRef.current.dispose(); apiRef.current = null } catch (e) {} setEmbedError(null); setLoading(true); mountJitsi() }} style={{ padding: '6px 10px', borderRadius: 6 }}>Reload embed</button>
          <button onClick={() => reportSession('stuck-embed')} style={{ padding: '6px 10px', borderRadius: 6, background: '#ef4444', color: '#fff' }}>Report</button>
        </div>
      </div>

      <div ref={containerRef} style={{ width: '100%', height: 520, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
        {embedError && (
          <div style={{ color: '#fff', padding: 18 }}>
            <div style={{ marginBottom: 12 }}>{embedError}</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>Click "Open in browser" to join the meeting full-page.</div>
            <div style={{ height: 12 }} />
            <iframe title={`Jitsi ${roomName}`} src={`https://${domain}/${encodeURIComponent(roomName)}#userInfo.displayName="${encodeURIComponent(displayName || 'Student')}"`} style={{ width: '100%', height: 420, border: 0 }} allow="camera; microphone; fullscreen; display-capture" />
          </div>
        )}
      </div>

      <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
        Participants: {participants} • Joined: {joined ? 'yes' : 'no'}
      </div>
    </div>
  )
}
