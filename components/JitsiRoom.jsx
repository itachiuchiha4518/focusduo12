// components/JitsiRoom.jsx
'use client'
import { useEffect, useRef, useState } from 'react'

export default function JitsiRoom({ roomId, displayName }) {
  const ref = useRef(null)
  const [status, setStatus] = useState('idle') // idle | loading | ready | error
  const [errorMsg, setErrorMsg] = useState(null)

  useEffect(() => {
    if (!roomId || !ref.current) return
    setStatus('loading')
    setErrorMsg(null)

    const domain = 'meet.jit.si'
    const roomName = `FocusDuo_${roomId}`

    // Build iframe
    const iframe = document.createElement('iframe')
    iframe.src = `https://${domain}/${roomName}#userInfo.displayName="${encodeURIComponent(displayName || 'Student')}"`;
    iframe.allow = 'camera; microphone; fullscreen; display-capture; autoplay'
    iframe.allowFullscreen = true
    iframe.style.width = '100%'
    iframe.style.height = '640px'
    iframe.style.border = '0'
    iframe.referrerPolicy = 'no-referrer-when-downgrade'

    // Clear previous content and append
    ref.current.innerHTML = ''
    ref.current.appendChild(iframe)

    // Wait for iframe to load (best-effort)
    const onLoad = () => {
      setStatus('ready')
      // console.log('Jitsi iframe loaded')
    }
    const onError = (e) => {
      setStatus('error')
      setErrorMsg('Unable to load video. Try again or check camera permissions.')
      console.error('Jitsi iframe error', e)
    }

    iframe.addEventListener('load', onLoad)
    iframe.addEventListener('error', onError)

    // Failsafe: if still not ready in 12s, show helpful error
    const timeout = setTimeout(() => {
      if (status !== 'ready') {
        setStatus('error')
        setErrorMsg('Video failed to load. If you are on a restricted network (school/ISP), Jitsi may be blocked.')
      }
    }, 12000)

    return () => {
      clearTimeout(timeout)
      try {
        iframe.removeEventListener('load', onLoad)
        iframe.removeEventListener('error', onError)
      } catch(e){}
      if (ref.current) ref.current.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, displayName])

  return (
    <div>
      <div style={{marginBottom:8}}>
        {status === 'loading' && <div style={{color:'#374151'}}>Loading video…</div>}
        {status === 'ready' && <div style={{color:'#10b981'}}>Video ready</div>}
        {status === 'error' && <div style={{color:'#ef4444'}}>Video error: {errorMsg || 'Unknown'}</div>}
      </div>
      <div ref={ref} style={{borderRadius:8, overflow:'hidden', background:'#000'}} />
      {status === 'error' && (
        <div style={{marginTop:10}}>
          <div className="muted">Troubleshooting:</div>
          <ul style={{marginTop:6}}>
            <li>Try a different network (mobile data vs Wi-Fi).</li>
            <li>Ensure camera/microphone permissions are allowed for the browser.</li>
            <li>Open <code>https://meet.jit.si</code> directly — if that also fails, Jitsi is blocked.</li>
          </ul>
        </div>
      )}
    </div>
  )
}
