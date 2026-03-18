'use client'

import { useEffect, useRef, useState } from 'react'
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const BAD_WORDS_EN = [
  'asshole', 'bastard', 'bitch', 'bullshit', 'crap', 'damn', 'dick', 'douche',
  'fuck', 'fucker', 'fucking', 'shit', 'shitty', 'slut', 'whore'
]

const BAD_WORDS_HI = [
  'bc', 'mc', 'chod', 'chodu', 'chutiya', 'chutia', 'madarchod', 'bhenchod',
  'gandu', 'gaand', 'lund', 'randi', 'harami', 'saala', 'sala'
]

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function censorText(text) {
  if (!text) return text
  let output = text

  const allWords = [...BAD_WORDS_EN, ...BAD_WORDS_HI]
  for (const word of allWords) {
    const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi')
    output = output.replace(re, matched => '*'.repeat(matched.length))
  }

  return output
}

export default function Chat({ sessionId }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef(null)

  useEffect(() => {
    if (!sessionId) return

    const msgsRef = collection(db, 'sessions', sessionId, 'messages')
    const q = query(msgsRef, orderBy('createdAt', 'asc'))

    const unsub = onSnapshot(q, snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setMessages(arr)

      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight
        }
      }, 40)
    })

    return () => unsub()
  }, [sessionId])

  async function sendMessage(e) {
    e?.preventDefault()
    if (!auth.currentUser || !text.trim()) return

    setSending(true)
    try {
      const filtered = censorText(text.trim())

      await addDoc(collection(db, 'sessions', sessionId, 'messages'), {
        senderUid: auth.currentUser.uid,
        senderName: auth.currentUser.displayName || auth.currentUser.email || 'Anonymous',
        textFiltered: filtered,
        createdAt: serverTimestamp()
      })

      setText('')
    } catch (err) {
      console.error(err)
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      style={{
        borderRadius: 14,
        border: '1px solid rgba(148,163,184,0.28)',
        background: 'linear-gradient(180deg, rgba(15,23,42,0.96), rgba(17,24,39,0.96))',
        color: '#e5e7eb',
        padding: 14
      }}
    >
      <div style={{ fontWeight: 800, marginBottom: 10, color: '#f8fafc' }}>Chat</div>

      <div
        ref={listRef}
        style={{
          maxHeight: 280,
          overflowY: 'auto',
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(148,163,184,0.14)',
          borderRadius: 12,
          padding: 10
        }}
      >
        {messages.length === 0 && (
          <div style={{ color: '#94a3b8' }}>No messages yet.</div>
        )}

        {messages.map(m => {
          const mine = auth.currentUser?.uid && m.senderUid === auth.currentUser.uid
          return (
            <div key={m.id} style={{ marginBottom: 10, display: 'flex', justifyContent: mine ? 'flex-end' : 'flex-start' }}>
              <div
                style={{
                  maxWidth: '86%',
                  borderRadius: 14,
                  padding: 10,
                  background: mine ? 'rgba(59,130,246,0.22)' : 'rgba(255,255,255,0.07)',
                  border: mine ? '1px solid rgba(59,130,246,0.35)' : '1px solid rgba(148,163,184,0.14)',
                  color: '#f8fafc'
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: mine ? '#bfdbfe' : '#cbd5e1' }}>
                  {m.senderName}
                </div>
                <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', marginTop: 4, lineHeight: 1.5 }}>
                  {m.textFiltered}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <form onSubmit={sendMessage} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type a message"
          style={{
            flex: 1,
            padding: 12,
            borderRadius: 10,
            border: '1px solid rgba(148,163,184,0.22)',
            background: 'rgba(255,255,255,0.05)',
            color: '#f8fafc',
            outline: 'none'
          }}
        />
        <button
          type="submit"
          disabled={sending}
          style={{
            padding: '12px 16px',
            borderRadius: 10,
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            fontWeight: 700,
            cursor: 'pointer'
          }}
        >
          Send
        </button>
      </form>
    </div>
  )
}
