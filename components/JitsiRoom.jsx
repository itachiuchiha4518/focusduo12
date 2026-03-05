// components/JitsiRoom.jsx   (OVERWRITE THIS FILE)
'use client'
import { useEffect, useRef, useState } from 'react'

/*
  Simple, resilient Jitsi embed component.
  - roomId: the session id (passed from /session/[id]/page.jsx)
  - displayName: name to show for the user
  Behavior:
  - tries to use window.JitsiMeetExternalAPI(domain, options)
  - if that fails, renders an iframe fallback to meet.jit.si/<room>
  - always shows "Open in browser" button that opens the same room in a new tab
*/

export default function JitsiRoom({ roomId, displayName }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [embedFailed, setEmbedFailed] = useState(false)
  const domain = 'meet.jit.si'

  // room name deterministic so two matched users land in same room
  const roomName = `FocusDuo_${roomId}`

  useEffect(() => {
    setLoading(true)
    setEmbedFailed(false)

    // Wait a tick for DOM
    const mount = async () => {
      // remove any existing children
      if (containerRef.current) {
        containerRef.current.innerHTML = ''
      }

      // if Jitsi external API not loaded, try to create an iframe fallback after a short delay
      if (typeof window === 'undefined') {
        setEmbedFailed(true)
        setLoading(false)
        return
      }

      const createJitsi = () => {
        try {
          // if External API exists, instantiate it
          if (window.JitsiMeetExternalAPI) {
            const options = {
              roomName,
              parentNode: containerRef.current,
              userInfo: {
                displayName: displayName || 'Student'
              },
              configOverwrite: {
                startWithAudioMuted: false,
                startWithVideoMuted: true,
                disableInviteFunctions: true,
                enableWelcomePage: false,
                disableDeepLinking: false
              },
              interfaceConfigOverwrite: {
                // reduce extra UI, keep essentials
                TOOLBAR_BUTTONS: [
                  'microphone', 'camera', 'chat', 'tileview', 'fullscreen', 'hangup'
                ],
                MOBILE_APP_PROMO: false
              }
            }

            // create and remember api
            apiRef.current = new window.JitsiMeetExternalAPI(domain, options)

            // basic event listeners (useful for debugging)
            apiRef.current.addEventListener('videoConferenceJoined', () => {
              console.log('[Jitsi] joined conference', roomName)
              setLoading(false)
            })
            apiRef.current.addEventListener('videoConferenceLeft', () => {
              console.log('[Jitsi] left conference', roomName)
            })
            apiRef.current.addEventListener('readyToClose', () => {
              console.log('[Jitsi] readyToClose')
            })

            // listen for participant role changes (moderator events) — optional
            apiRef.current.addEventListener('participantRoleChanged', (ev) => {
              console.log('[Jitsi] role changed', ev)
            })

            // success return
            return true
          } else {
            // external API missing — will fallback to iframe
            console.warn('[Jitsi] External API not found on window')
            return false
          }
        } catch (err) {
          console.error('[Jitsi] external API error', err)
          return false
        }
      }

      const ok = createJitsi()
      if (!ok) {
        // fallback: show iframe
        setEmbedFailed(true)
        setLoading(false)
        return
      }

      // If API instantiated but still stuck on lobby message, we can't fix server moderation
      // Provide open-in-browser fallback button for user
      setLoading(false)
    }

    mount()

    return () => {
      // cleanup the Jitsi instance when component unmounts
      try {
        if (apiRef.current && apiRef.current.dispose) {
          apiRef.current.dispose()
          apiRef.current = null
        }
      } catch (e) {
        console.warn('[Jitsi] cleanup error', e)
      }
    }
  }, [roomId, displayName, roomName])

  // url to open in browser (safe fallback)
  const browserUrl = `https://${domain}/${encodeURIComponent(roomName)}#userInfo.displayName="${encodeURIComponent(displayName || 'Student')}"`

  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <div style={{ fontSize: 13, color: '#444' }}>{loading ? 'Loading video...' : 'Video'}</div>
        <a
          href={browserUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: '#2563eb',
            color: 'white',
            padding: '6px 10px',
            borderRadius: 6,
            textDecoration: 'none',
            fontSize: 14
          }}
        >
          Open in browser
        </a>
      </div>

      <div ref={containerRef} style={{ width: '100%', height: 520, borderRadius: 10, overflow: 'hidden', background: '#000' }}>
        {/* Jitsi External API will mount into this div. If embedFailed, render iframe fallback below. */}
        {embedFailed && (
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', background: '#000' }}>
            <div style={{ marginBottom: 12 }}>Embedded meeting unavailable — open in browser instead.</div>
            <a href={browserUrl} target="_blank" rel="noopener noreferrer" style={{ background: '#10b981', color: '#fff', padding: '10px 14px', borderRadius: 8, textDecoration: 'none' }}>
              Open meeting in browser
            </a>
            {/* also provide a plain iframe fallback (less reliable for mobile) */}
            <div style={{ width: '100%', height: '100%', marginTop: 14 }}>
              <iframe
                title={`Jitsi ${roomName}`}
                src={browserUrl}
                style={{ width: '100%', height: '100%', border: 0 }}
                allow="camera; microphone; fullscreen; display-capture"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
