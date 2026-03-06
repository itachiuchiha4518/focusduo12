'use client'
import { useEffect, useRef, useState } from 'react'
import { doc, collection, addDoc } from '../lib/firebase' // for report logging

// OVERWRITE THIS FILE EXACTLY
export default function JitsiRoom({ roomId, displayName, sessionId }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const scriptRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [embedError, setEmbedError] = useState(null)
  const [joined, setJoined] = useState(false)
  const [participants, setParticipants] = useState(0)
  const domain = 'meet.jit.si'                        // <<— critical: explicitly use meet.jit.si
  const roomName = `FocusDuo_${roomId}`               // deterministic room name

  // Build browser URL fallback
  const browserUrl = `https://${domain}/${encodeURIComponent(roomName)}#userInfo.displayName="${encodeURIComponent(displayName || 'Student')}"`

  // Load external_api.js if needed
  function ensureScript() {
    return new Promise((resolve, reject) => {
      if (window.JitsiMeetExternalAPI) return resolve(true)
      // avoid creating multiple tags
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

  // instantiate Jitsi External API
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

    // cleanup any previous instance
    try {
      if (apiRef.current && apiRef.current.dispose) {
        apiRef.current.dispose()
        apiRef.current = null
      }
    } catch (e) {
      console.warn('cleanup error', e)
    }

    // guard
    if (!containerRef.current) {
      setEmbedError('Mount container missing')
      setLoading(false)
      return
    }

    try {
      // Options: disable the prejoin page (go directly to meeting),
      // disable deep linking, set displayName
      const options = {
        roomName,
        parentNode: containerRef.current,
        userInfo: { displayName: displayName || 'Student' },
        configOverwrite: {
          prejoinPageEnabled: false,
          startWithAudioMuted: false,
          startWithVideoMuted: true,
          disableDeepLinking: true,
          enableUserRolesBasedOnToken: false // try to avoid token role behavior
        },
        interfaceConfigOverwrite: {
          MOBILE_APP_PROMO: false,
          // limit toolbar to essentials
          TOOLBAR_BUTTONS: [
            'microphone', 'camera', 'chat', 'tileview', 'fullscreen', 'hangup'
          ]
        }
      }

      apiRef.current = new window.JitsiMeetExternalAPI(domain, options)

      // events
      apiRef.current.addEventListener('videoConferenceJoined', (ev) => {
        console.log('[Jitsi] videoConferenceJoined', ev)
        setJoined(true)
        setLoading(false)
      })

      apiRef.current.addEventListener('videoConferenceLeft', () => {
        console.log('[Jitsi] videoConferenceLeft')
        setJoined(false)
      })

      apiRef.current.addEventListener('participantJoined', (ev) => {
        console.log('[Jitsi] participantJoined', ev)
        // ev.memberCount might be present; otherwise query participants via getParticipantsInfo
        try {
          const info = apiRef.current.getNumberOfParticipants()
          setParticipants(info || 1)
        } catch (e) {
          setParticipants(prev => prev + 1)
        }
      })

      apiRef.current.addEventListener('participantLeft', (ev) => {
        console.log('[Jitsi] participantLeft', ev)
        try {
          const info = apiRef.current.getNumberOfParticipants()
          setParticipants(info || Math.max(0, participants - 1))
        } catch (e) {
          setParticipants(prev => Math.max(0, prev - 1))
        }
      })

      // small timeout: if after X seconds we still don't join, surface fallback
      const failTimeout = setTimeout(async () => {
        if (!joined) {
          // check participants count via API (if available)
          let count = 0
          try { count = apiRef.current.getNumberOfParticipants() } catch(e){ /* ignore */ }
          console.warn('[Jitsi] join timeout — participants:', count)
          setEmbedError('Embed appears stuck. Try "Reload embed" or "Open in browser" below.')
          setLoading(false)
        }
      }, 12000) // 12s

      // clear timeout if join event fires
      const offJoin = () => { clearTimeout(failTimeout) }

      return () => {
        offJoin()
      }
    } catch (err) {
      console.error('[Jitsi] instantiate error', err)
      setEmbedError('Failed to create Jitsi instance: ' + (err.message || err))
      setLoading(false)
    }
  }

  // mount on initial render
  useEffect(() => {
    mountJitsi()
    // cleanup on unmount
    return () => {
      try {
        if (apiRef.current && apiRef.current.dispose) apiRef.current.dispose()
        apiRef.current = null
      } catch (e) { /* ignore */ }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId, displayName])

  // custom "Report" action (writes a doc to Firestore) — optional
  async function reportSession(reason = 'manual-report') {
    try {
      // add minimal report doc for admin review
      await addDoc(collection(window.firebaseDB || { /* fallback */ }, 'reports'), {
        sessionId: sessionId || roomId,
        reason,
        at: new Date().toISOString()
      })
      alert('Report submitted. Admin will review.')
    } catch (e) {
      console.warn('report failed', e)
      alert('Could not submit report from this device (client-only). Please contact admin.')
    }
  }

  return (
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <div style={{ fontSize: 14, color: '#333' }}>{loading ? 'Loading video...' : (embedError ? 'Embed error' : 'Video')}</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <a href={browserUrl} target="_blank" rel="noopener noreferrer" style={{ padding: '7px 10px', background: '#2563eb', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 13 }}>
            Open in browser
          </a>
          <button onClick={() => { // reload embed
            try {
              if (apiRef.current && apiRef.current.dispose) apiRef.current.dispose()
              apiRef.current = null
            } catch (e) { /* ignore */ }
            setEmbedError(null); setLoading(true); mountJitsi()
          }} style={{ padding: '6px 10px', borderRadius: 6 }}>Reload embed</button>
          <button onClick={() => reportSession('stuck-embed')} style={{ padding: '6px 10px', borderRadius: 6, background: '#ef4444', color: '#fff' }}>Report</button>
        </div>
      </div>

      <div ref={containerRef} style={{ width: '100%', height: 520, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
        {/* Jitsi will mount here. If embedError, show message and fallback iframe */}
        {embedError && (
          <div style={{ color: '#fff', padding: 18 }}>
            <div style={{ marginBottom: 12 }}>{embedError}</div>
            <div style={{ fontSize: 13, opacity: 0.9 }}>If the embed keeps showing the moderator/waiting screen, click "Open in browser". That opens the same meeting in a full tab which bypasses embed quirks on mobile.</div>
            <div style={{ height: 12 }} />
            <iframe title={`Jitsi ${roomName}`} src={browserUrl} style={{ width: '100%', height: 420, border: 0 }} allow="camera; microphone; fullscreen; display-capture" />
          </div>
        )}
      </div>
      <div style={{ marginTop: 8, fontSize: 13, color: '#666' }}>
        Participants: {participants} • Joined: {joined ? 'yes' : 'no'}
      </div>
    </div>
  )
      }
