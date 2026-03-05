'use client'
import { useEffect, useState } from 'react'
import { collection, addDoc, query, orderBy, onSnapshot } from '../lib/firebase'

export default function Chat({ sessionId, user }) {
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')

  useEffect(()=>{
    if(!sessionId) return
    const q = query(collection(window.__firebase_db, `sessions/${sessionId}/messages`), orderBy('createdAt','asc'))
    const unsub = onSnapshot(q, snap => {
      const arr = []
      snap.forEach(d => arr.push({ id: d.id, ...d.data() }))
      setMessages(arr)
    })
    return () => unsub()
  }, [sessionId])

  async function send(){
    if (!text.trim()) return
    try {
      await addDoc(collection(window.__firebase_db, `sessions/${sessionId}/messages`), {
        uid: user.uid,
        text: text.trim(),
        createdAt: new Date().toISOString()
      })
      setText('')
    } catch(e){ console.error('chat send', e) }
  }

  return (
    <div className="card p-3" style={{maxHeight:300, overflow:'auto'}}>
      <div style={{height:220, overflowY:'auto'}}>
        {messages.map(m => <div key={m.id} style={{marginBottom:6}}><strong className="muted">{m.uid === user.uid ? 'You' : m.uid}:</strong> {m.text}</div>)}
      </div>
      <div style={{display:'flex', marginTop:8}}>
        <input value={text} onChange={(e)=>setText(e.target.value)} style={{flex:1, padding:8, borderRadius:6}} placeholder="Type a message"/>
        <button onClick={send} className="btn small" style={{marginLeft:8}}>Send</button>
      </div>
    </div>
  )
}
