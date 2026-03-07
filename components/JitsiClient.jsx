// components/JitsiClient.jsx
'use client'

import React, { useEffect, useRef, useState } from 'react'

/*
  Jitsi External API client component (full file).
  - Dynamically loads the external Jitsi script.
  - Creates a JitsiMeetExternalAPI instance with configOverwrite and interfaceConfigOverwrite.
  - Disables the prejoin page (prejoinPageEnabled: false).
  - Provides debug messages and a visible fallback if the Jitsi server blocks anonymous join (moderator required).
*/

export default function JitsiClient({ roomId = 'demo', displayName = 'Student', onApiReady = () => {} }) {
  const containerRef = useRef(null)
  const apiRef = useRef(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [joined, setJoined] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadAndStart() {
      try {
        // load script if not already loaded
        if (!window.JitsiMeetExternalAPI) {
          await new Promise((resolve, reject) => {
            const s = document.createElement('script')
            s.src = 'https://meet.jit.si/external_api.js'
            s.async = true
            s.onload = () => {
              resolve()
            }
            s.onerror = (e) => {
              reject(new Error('Failed to load Jitsi script'))
            }
            document.head.appendChild(s)
          })
        }

        if (!mounted) return

        if (!window.JitsiMeetExternalAPI) {
          throw new Error('Jitsi API not available after script load')
        }

        const domain = 'meet.jit.si'
        const roomName = `FocusDuo_${roomId}`

        const options = {
          roomName,
          parentNode: containerRef.current,
          userInfo: {
            displayName: displayName || 'Student'
          },
          configOverwrite: {
            prejoinPageEnabled: false,
            enableWelcomePage: false,
            disableDeepLinking: true,
            startWithAudioMuted: false,
            startWithVideoMuted: false,
            // If your Jitsi server requires moderators or tokens, this won't bypass it.
            // In that case the server admin must change server settings or you must self-host Jitsi.
          },
          interfaceConfigOverwrite: {
            // UI tweaks
            SHOW_JITSI_WATERMARK: false,
            SHOW_WATERMARK_FOR_GUESTS: false,
            SHOW_BRAND_WATERMARK: false
          }
        }

        // create the API
        apiRef.current = new window.JitsiMeetExternalAPI(domain, options)

        // attach listeners
        apiRef.current.addListener('videoConferenceJoined', (payload) => {
          console.log('Jitsi: joined', payload)
          setJoined(true)
        })
        apiRef.current.addListener('videoConferenceLeft', () => {
          console.log('Jitsi: left')
          setJoined(false)
        })
        apiRef.current.addListener('readyToClose', () => {
          console.log('Jitsi: readyToClose')
        })

        // pass API to parent (if needed)
        onApiReady(apiRef.current)

        if (mounted) {
          setLoading(false)
          setError(null)
        }
      } catch (err) {
        console.error('JitsiClient error:', err)
        if (mounted) {
          setError(err.message || String(err))
          setLoading(false)
        }
      }
    }

    loadAndStart()

    return () => {
      mounted = false
      try {
        if (apiRef.current) {
          apiRef.current.dispose()
          apiRef.current = null
        }
      } catch (e) {
        console.warn('Error disposing Jitsi API', e)
      }
    }
  }, [roomId, displayName, onApiReady])

  return (
    <div style={{ width: '100%', maxWidth: 980 }}>
      <div style={{ marginBottom: 10 }}>
        {loading && <div style={{ color: '#6b7280' }}>Loading video…</div>}
        {!loading && !error && !joined && <div style={{ color: '#6b7280' }}>Trying to join meeting…</div>}
        {error && (
          <div style={{ background: '#ffeeee', border: '1px solid #ffdddd', padding: 12, borderRadius: 8 }}>
            <strong style={{ color: '#9b111e' }}>Embed error:</strong>
            <div style={{ marginTop: 6, color: '#6b1212' }}>{String(error)}</div>
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => {
                  // quick retry: reload script by forcing a remount (reload page recommended)
                  window.location.reload()
                }}
                style={{ padding: '8px 12px', borderRadius: 8, background: '#0b74ff', color: '#fff', border: 0 }}
              >
                Reload page
              </button>
            </div>
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        style={{
          width: '100%',
          height: 560,
          borderRadius: 12,
          overflow: 'hidden',
          background: '#000',
          display: error ? 'none' : 'block'
        }}
      />

      <div style={{ marginTop: 12, color: '#6b7280', fontSize: 13 }}>
        <div>Room: <strong>{`FocusDuo_${roomId}`}</strong></div>
        <div style={{ marginTop: 6 }}>
          If you see a message about moderators / logging in, that means the Jitsi server (meet.jit.si or your instance) requires a moderator token or auth to start the conference.
        </div>
        <ul style={{ marginTop: 8 }}>
          <li>Allow camera & microphone for your browser.</li>
          <li>Use Chrome desktop for quickest debugging.</li>
          <li>If the server requires moderator authentication, you must either: use an instance without that restriction (meet.jit.si normally allows anonymous) or self-host Jitsi and disable the moderator-only start policy.</li>
        </ul>
      </div>
    </div>
  )
                        }
