'use client'

import { useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const REASONS = [
  { id: 'abusive_language', label: 'Abusive language' },
  { id: 'toxic_behavior', label: 'Toxic behavior' },
  { id: 'vulgar_content', label: 'Vulgar content on video' },
  { id: 'harassment', label: 'Harassment / bullying' },
  { id: 'spam_misuse', label: 'Spam / misuse' }
]

function toggleInArray(arr, value) {
  return arr.includes(value) ? arr.filter(x => x !== value) : [...arr, value]
}

export default function EndCard({
  sessionId,
  partnerUid,
  partnerName,
  sessionMeta,
  onStartNew
}) {
  const [selected, setSelected] = useState([])
  const [details, setDetails] = useState('')
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState('')

  async function submitReport() {
    if (!auth.currentUser) {
      alert('Sign in first')
      return
    }

    if (selected.length === 0 && !details.trim()) {
      alert('Pick a reason or write a note')
      return
    }

    setSending(true)
    try {
      await addDoc(collection(db, 'reports'), {
        reporterUid: auth.currentUser.uid,
        reporterName: auth.currentUser.displayName || auth.currentUser.email || 'Anonymous',
        reportedUid: partnerUid || null,
        reportedName: partnerName || null,
        sessionId: sessionId || null,
        sessionExam: sessionMeta?.exam || null,
        sessionSubject: sessionMeta?.subject || null,
        sessionMode: sessionMeta?.mode || null,
        selectedReasons: selected,
        details: details.trim(),
        status: 'open',
        createdAt: serverTimestamp()
      })
      setSelected([])
      setDetails('')
      setDone('Report submitted.')
    } catch (e) {
      console.error(e)
      alert('Failed to submit report')
    } finally {
      setSending(false)
    }
  }

  return (
    <div
      style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 16,
        background: 'rgba(15,23,42,0.96)',
        border: '1px solid rgba(148,163,184,0.18)',
        color: '#e2e8f0'
      }}
    >
      <h3 style={{ marginTop: 0 }}>Session ended</h3>

      <div style={{ color: '#cbd5e1', marginBottom: 8 }}>
        Partner: <strong>{partnerName || 'Unknown'}</strong>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <button
          onClick={onStartNew}
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
          Start new session
        </button>
      </div>

      <div
        style={{
          padding: 14,
          borderRadius: 14,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(148,163,184,0.14)'
        }}
      >
        <div style={{ fontWeight: 800, marginBottom: 10 }}>Report user</div>

        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          {REASONS.map(reason => (
            <label
              key={reason.id}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                padding: '10px 12px',
                borderRadius: 10,
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(148,163,184,0.12)',
                cursor: 'pointer'
              }}
            >
              <input
                type="checkbox"
                checked={selected.includes(reason.id)}
                onChange={() => setSelected(prev => toggleInArray(prev, reason.id))}
              />
              <span>{reason.label}</span>
            </label>
          ))}
        </div>

        <textarea
          value={details}
          onChange={e => setDetails(e.target.value)}
          placeholder="Tell us what happened and why you want to report this user."
          style={{
            width: '100%',
            minHeight: 100,
            padding: 12,
            borderRadius: 12,
            border: '1px solid rgba(148,163,184,0.18)',
            background: 'rgba(255,255,255,0.05)',
            color: '#f8fafc',
            outline: 'none',
            resize: 'vertical',
            marginBottom: 12
          }}
        />

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            onClick={submitReport}
            disabled={sending}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              border: 'none',
              background: '#ef4444',
              color: '#fff',
              fontWeight: 800,
              cursor: 'pointer'
            }}
          >
            Submit report
          </button>

          <div style={{ alignSelf: 'center', color: '#93c5fd' }}>{done}</div>
        </div>
      </div>
    </div>
  )
}
