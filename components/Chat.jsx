'use client'

import { useEffect, useRef, useState } from 'react'
import { addDoc, collection, onSnapshot, query, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import { censorMessage } from '../lib/textModeration'

function stamp(v) {
  if (!v) return ''
  try {
    if (typeof v.toDate === 'function') return v.toDate().toLocaleTimeString()
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000).toLocaleTimeString()
  } catch {}
  return ''
}

export default function Chat({ sessionId }) {
  const [messages, setMessages] = useState([])
  const [value, setValue] = useState('')
  const [sending, setSending] = useState(false)
  const [info, setInfo] = useState('')
  const bottomRef = useRef(null)

  useEffect(() => {
    if (!sessionId) return

    const q = query(collection(db, 'sessions', sessionId, 'messages'))
    const unsub = onSnapshot(q, snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      arr.sort((a, b) => {
        const at = a.createdAt?.toMillis?.() || 0
        const bt = b.createdAt?.toMillis?.() || 0
        return at - bt
      })
      setMessages(arr)
    })

    return () => unsub()
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send() {
    const user = auth.currentUser
    if (!user || !sessionId) return

    const raw = value.trim()
    if (!raw) return

    const result = censorMessage(raw)

    setSending(true)
    try {
      await addDoc(collection(db, 'sessions', sessionId, 'messages'), {
        uid: user.uid,
        name: user.displayName || user.email || 'Anonymous',
        text: result.text,
        blocked: result.blocked,
        createdAt: serverTimestamp()
      })

      setInfo(result.blocked ? 'Message was masked because it contained blocked language.' : '')
      setValue('')
    } catch (e) {
      console.error(e)
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div style={{
      border: '1px solid rgba(148,163,184,0.18)',
      borderRadius: 16,
      overflow: 'hidden',
      background: '#0f172a',
      color: '#e2e8f0'
    }}>
      <div style={{
        padding: 12,
        borderBottom: '1px solid rgba(148,163,184,0.14)',
        fontWeight: 800
      }}>
        Chat
      </div>

      <div style={{
        maxHeight: 280,
        overflowY: 'auto',
        padding: 12,
        display: 'grid',
        gap: 10,
        background: '#111827'
      }}>
        {messages.length === 0 ? (
          <div style={{ color: '#94a3b8' }}>No messages yet.</div>
        ) : (
          messages.map(msg => {
            const mine = auth.currentUser?.uid === msg.uid
            return (
              <div key={msg.id} style={{ display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
                <div style={{
                  maxWidth: '80%',
                  padding: '10px 12px',
                  borderRadius: 14,
                  background: mine ? '#1d4ed8' : '#1f2937',
                  border: '1px solid rgba(148,163,184,0.12)'
                }}>
                  <div style={{ fontSize: 12, opacity: 0.8, marginBottom: 4 }}>
                    {msg.name || 'Anonymous'} • {stamp(msg.createdAt)}
                  </div>
                  <div>{msg.blocked ? 'Message removed' : msg.text}</div>
                </div>
              </div>
            )
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{ padding: 12, borderTop: '1px solid rgba(148,163,184,0.14)', background: '#0f172a' }}>
        <textarea
          value={value}
          onChange={e => setValue(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Type a message"
          style={{
            width: '100%',
            minHeight: 72,
            resize: 'vertical',
            padding: 10,
            borderRadius: 12,
            border: '1px solid rgba(148,163,184,0.18)',
            background: '#111827',
            color: '#f8fafc',
            outline: 'none',
            marginBottom: 10
          }}
        />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={send}
            disabled={sending}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: 'none',
              background: '#2563eb',
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Send
          </button>

          <div style={{ alignSelf: 'center', color: '#93c5fd' }}>{info}</div>
        </div>
      </div>
    </div>
  )
}
