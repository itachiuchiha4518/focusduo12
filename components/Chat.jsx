import { useEffect, useRef, useState } from 'react'
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const BAD_WORDS = [
  'asshole', 'bastard', 'bitch', 'bullshit', 'crap', 'dick', 'douche', 'fuck',
  'fucker', 'fucking', 'fuk', 'shit', 'shitty', 'slut', 'whore',
  'bc', 'mc', 'chod', 'chodu', 'chutiya', 'madarchod', 'bhenchod', 'gandu',
  'gaand', 'lund', 'randi', 'saala', 'sala', 'harami'
]

function censor(text) {
  if (!text) return text
  let out = text
  for (const w of BAD_WORDS) {
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi')
    out = out.replace(re, m => '*'.repeat(m.length))
  }
  return out
}

export default function Chat({ sessionId }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const listRef = useRef(null)

  useEffect(() => {
    if (!sessionId) return
    const q = query(collection(db, 'sessions', sessionId, 'messages'), orderBy('createdAt', 'asc'))
    const unsub = onSnapshot(q, snap => {
      setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() })))
      setTimeout(() => {
        if (listRef.current) {
          listRef.current.scrollTop = listRef.current.scrollHeight
        }
      }, 40)
    })
    return () => unsub()
  }, [sessionId])

  async function send(e) {
    e?.preventDefault()
    if (!text.trim() || !auth.currentUser) return

    setSending(true)
    try {
      const filtered = censor(text.trim())
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
    <div style={{ border: '1px solid #e5e7eb', borderRadius: 12, padding: 12, background: '#fff' }}>
      <div style={{ fontWeight: 800, marginBottom: 10 }}>Chat</div>

      <div ref={listRef} style={{ maxHeight: 260, overflowY: 'auto', background: '#fafafa', borderRadius: 8, padding: 10 }}>
        {messages.length === 0 && <div style={{ color: '#666' }}>No messages yet.</div>}
        {messages.map(m => (
          <div key={m.id} style={{ marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{m.senderName}</div>
            <div style={{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: 8, marginTop: 4 }}>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.textFiltered}</div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={send} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Type a message"
          style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #ddd' }}
        />
        <button
          type="submit"
          disabled={sending}
          style={{ padding: '10px 14px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none' }}
        >
          Send
        </button>
      </form>
    </div>
  )
}
