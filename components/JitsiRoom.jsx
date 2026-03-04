// components/JitsiRoom.jsx
'use client'
import { useEffect, useRef, useState } from 'react'

export default function JitsiRoom({ roomId, displayName }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!roomId || !containerRef.current) return
    let mounted = true
    setStatus('loading')
    setError(null)

    // Load external_api.js if not already loaded
    function loadScript() {
      return new Promise((resolve, reject) => {
        if (window.JitsiMeetExternalAPI) return resolve(window.JitsiMeetExternalAPI)
        const existing = document.getElementById('jitsi-external-api')
        if (existing) {
          existing.addEventListener('load', () => {
            if (window.JitsiMeetExternalAPI) resolve(window.JitsiMeetExternalAPI)
            else reject(new Error('Jitsi script loaded but API not available'))
          })
          existing.addEventListener('error', () => reject(new Error('Failed to load jitsi script')))
          return
        }
        const script = document.createElement('script')
        script.id = 'jitsi-external-api'
        script.src = 'https://meet.jit.si/external_api.js'
        script.async = true
        script.onload = () => {
          if (window.JitsiMeetExternalAPI) resolve(window.JitsiMeetExternalAPI)
          else reject(new Error('Jitsi API not found on window after load'))
        }
        script.onerror = () => reject(new Error('Failed to load jitsi external_api.js'))
        document.head.appendChild(script)
      })
    }

    async function startJitsi() {
      try {
        const Jitsi = await loadScript()
        if (!mounted) return
        const domain = 'meet.jit.si'
        const options = {
          roomName: `FocusDuo_${roomId}`,
          parentNode: containerRef.current,
          userInfo: { displayName: displayName || 'Student' },
          configOverwrite: {
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            disableDeepLinking: true
          },
          interfaceConfigOverwrite: {
            // minimal interface
            TOOLBAR_BUTTONS: [
              'microphone', 'camera', 'chat', 'tileview', 'hangup'
            ]
          }
        }

        // dispose previous if any
        if (apiRef.current) {
          try { apiRef.current.dispose() } catch(e){}
          apiRef.current = null
        }

        apiRef.current = new Jitsi(domain, options)

        apiRef.current.addEventListener('videoConferenceJoined', () => {
          if (!mounted) return
          setStatus('ready')
        })
        apiRef.current.addEventListener('readyToClose', () => {
          // session end
          if (!mounted) return
          setStatus('ended')
        })

      } catch (e) {
        console.error('Jitsi start error', e)
        setError(String(e.message || e))
        setStatus('error')
      }
    }

    startJitsi()

    return () => {
      mounted = false
      try {
        if (apiRef.current) {
          apiRef.current.dispose()
          apiRef.current = null
        }
      } catch (e) {
        console.warn('error disposing jitsi', e)
      }
      if (containerRef.current) containerRef.current.innerHTML = ''
    }
  }, [roomId, displayName])

  return (
    <div>
      <div style={{marginBottom:8}}>
        {status === 'loading' && <div style={{color:'#374151'}}>Loading video…</div>}
        {status === 'ready' && <div style={{color:'#10b981'}}>Video running</div>}
        {status === 'ended' && <div style={{color:'#64748b'}}>Session ended</div>}
        {status === 'error' && <div style={{color:'#ef4444'}}>Video error: {error || 'Unknown'}</div>}
      </div>

      <div ref={containerRef} style={{width:'100%', height: '640px', borderRadius:8, overflow:'hidden', background:'#000'}} />

      {status === 'error' && (
        <div style={{marginTop:10}}>
          <div className="muted">Quick checks</div>
          <ul style={{marginTop:6}}>
            <li>Open <a href="https://meet.jit.si" target="_blank" rel="noreferrer">meet.jit.si</a> on the same browser. Does it load and ask camera permission?</li>
            <li>Try switching networks (mobile data vs Wi-Fi) — some networks block Jitsi.</li>
            <li>Allow Camera & Microphone in the browser (browser prompt). If you blocked, go into site settings and re-enable.</li>
            <li>If on iOS Safari, try Chrome (iOS Safari sometimes blocks embedded web RTC in iframes). Use desktop Chrome if possible for a test.</li>
          </ul>
        </div>
      )}
    </div>
  )
}
