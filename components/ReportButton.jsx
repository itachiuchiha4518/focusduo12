'use client'
import { useState } from 'react'
import { collection, addDoc } from '../lib/firebase'

export default function ReportButton({ sessionId, reportedUid, reporterUid, reasonFallback }) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')

  async function submit() {
    try {
      await addDoc(collection(window.__firebase_db, 'reports'), {
        sessionId,
        reportedUid,
        reporterUid,
        reason: text || reasonFallback || 'No reason provided',
        createdAt: new Date().toISOString(),
        status: 'open'
      })
      alert('Report submitted')
      setText(''); setOpen(false)
    } catch (e) { console.error('report', e); alert('Report failed') }
  }

  return (
    <div style={{display:'inline-block'}}>
      <button className="btn small" onClick={()=>setOpen(!open)}>Report</button>
      {open && (
        <div style={{marginTop:8}}>
          <textarea value={text} onChange={(e)=>setText(e.target.value)} style={{width:300, height:100}} placeholder="Describe issue"/>
          <div style={{marginTop:6}}>
            <button className="btn small" onClick={submit}>Submit report</button>
          </div>
        </div>
      )}
    </div>
  )
}
