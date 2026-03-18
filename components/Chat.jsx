import React, { useEffect, useRef, useState } from 'react'
import { collection, addDoc, query, orderBy, onSnapshot, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase' // adjust path if needed

// --- PROFANITY FILTER ---
// This is a starter list. Add words you want to block to the arrays.
// Words are replaced with asterisks. This runs client-side (pre-send).
const ENGLISH_BAD = [
  'asshole','bastard','bitch','bollocks','crap','damn','darn','dick','douche',
  'fuck','fucking','fucker','shit','shitty','slut','whore'
]
const HINDI_BAD = [
  'bhosdi', 'chod', 'chodu', 'bhenchod', 'madarchod', 'randi', 'randiwal', 'gandu'
]

// escape for regex
function esc(s){ return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }

function buildFilterRegex(words){
  if(!words || !words.length) return null
  const pattern = words.map(w => `(?:${esc(w)})`).join('|')
  // word boundary-ish: include unicode boundary via lookarounds
  return new RegExp(`\\b(${pattern})\\b`, 'gi')
}

const EN_REGEX = buildFilterRegex(ENGLISH_BAD)
const HI_REGEX = buildFilterRegex(HINDI_BAD)

// censor function: replaces found words with same-length asterisks
function censorText(text){
  if(!text) return text
  let out = text
  if(EN_REGEX) out = out.replace(EN_REGEX, m => '*'.repeat(m.length))
  if(HI_REGEX) out = out.replace(HI_REGEX, m => '*'.repeat(m.length))
  return out
}

// Chat component (full file)
export default function Chat({ sessionId, sessionOwnerUid }) {
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
      // scroll to bottom
      setTimeout(()=> listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }), 50)
    })
    return () => unsub()
  }, [sessionId])

  async function handleSend(e) {
    e?.preventDefault()
    if (!text?.trim() || !sessionId || !auth.currentUser) return
    const cur = auth.currentUser
    const raw = text.trim()
    const filtered = censorText(raw)

    setSending(true)
    try {
      await addDoc(collection(db, 'sessions', sessionId, 'messages'), {
        senderUid: cur.uid,
        senderName: cur.displayName || cur.email || 'Anonymous',
        textFiltered: filtered,
        // do NOT store original raw text (we're censoring proactively).
        createdAt: serverTimestamp()
      })
      setText('')
    } catch (err) {
      console.error('send message failed', err)
      alert('Failed to send message')
    } finally {
      setSending(false)
    }
  }

  return (
    <div style={{ borderRadius: 12, border: '1px solid #e6e6e6', padding: 12, maxWidth: 760 }}>
      <div style={{ marginBottom: 8, fontWeight: 700 }}>Session chat</div>

      <div ref={listRef} style={{ maxHeight: 260, overflowY: 'auto', padding: 6, background: '#fafafa', borderRadius: 8 }}>
        {messages.length === 0 && <div style={{ color: '#666' }}>No messages yet — be the first to say hi.</div>}
        {messages.map(m => (
          <div key={m.id} style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, color: '#333', fontWeight: 700 }}>{m.senderName}</div>
            <div style={{ background: '#fff', padding: 8, borderRadius: 6, marginTop: 4 }}>
              <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.textFiltered}</div>
              <div style={{ fontSize: 11, color: '#999', marginTop: 6 }}>{m.createdAt?.toDate ? m.createdAt.toDate().toLocaleTimeString() : ''}</div>
            </div>
          </div>
        ))}
      </div>

      <form onSubmit={handleSend} style={{ display: 'flex', gap: 8, marginTop: 10 }}>
        <input
          value={text}
          onChange={e=> setText(e.target.value)}
          placeholder="Type a message (no abusive words)."
          style={{ flex: 1, padding: 10, borderRadius: 8, border: '1px solid #ddd' }}
        />
        <button type="submit" disabled={sending} style={{ padding: '10px 14px', borderRadius: 8, background: '#2563eb', color:'#fff', border: 'none' }}>
          Send
        </button>
      </form>
    </div>
  )
}
