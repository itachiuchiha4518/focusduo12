'use client'

import { useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

const REPORT_REASONS = [
  { id: 'abusive_language', label: 'Abusive language' },
  { id: 'toxic_behavior', label: 'Toxic / disrespectful behavior' },
  { id: 'vulgar_video', label: 'Vulgar or inappropriate content on video' },
  { id: 'harassment', label: 'Harassment / bullying' },
  { id: 'spam_misuse', label: 'Spam / misuse of the session' }
]

export default function EndCard({
  sessionId,
  partnerUid,
  partnerName,
  onStartNew,
  sessionMeta = null
}) {
  const [selectedReasons, setSelectedReasons] = useState([])
  const [details, setDetails] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  function toggleReason(id) {
    setSelectedReasons(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function submitReport() {
    if (!auth.currentUser) {
      alert('Sign in first')
      return
    }

    if (selectedReasons.length === 0 && !details.trim()) {
      alert('Pick at least one reason or write a description')
      return
    }

    setSubmitting(true)
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
        selectedReasons,
        details: details.trim(),
        status: 'open',
        createdAt: serverTimestamp()
      })

      setSelectedReasons([])
      setDetails('')
      setMessage('Report submitted. Admin will review it.')
    } catch (err) {
      console.error(err)
      alert('Failed to submit report')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      style={{
        marginTop: 18,
        padding: 18,
        borderRadius: 16,
        border: '1px solid rgba(148,163,184,0.22)',
        background: 'linear-gradient(180deg, rgba(15,23,42,0.98), rgba(17,24,39,0.98))',
        color: '#e5e7eb'
      }}
    >
      <h3 style={{ marginTop: 0, color: '#f8fafc' }}>Session ended</h3>

      <div style={{ marginBottom: 10, color: '#cbd5e1' }}>
        <strong>Partner:</strong> {partnerName || 'Unknown'}
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          onClick={onStartNew}
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: '#2563eb',
            color: '#fff',
            border: 'none',
            fontWeight: 700,
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
        <div style={{ fontWeight: 800, marginBottom: 10, color: '#f8fafc' }}>
          Report user
        </div>

        <div style={{ display: 'grid', gap: 8, marginBottom: 14 }}>
          {REPORT_REASONS.map(reason => (
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
                checked={selectedReasons.includes(reason.id)}
                onChange={() => toggleReason(reason.id)}
              />
              <span>{reason.label}</span>
            </label>
          ))}
        </div>

        <textarea
          value={details}
          onChange={e => setDetails(e.target.value)}
          placeholder="Tell us what happened and why they should be warned or banned."
          style={{
            width: '100%',
            minHeight: 110,
            padding: 12,
            borderRadius: 12,
            border: '1px solid rgba(148,163,184,0.18)',
            background: 'rgba(255,255,255,0.05)',
            color: '#f8fafc',
            outline: 'none',
            resize: 'vertical'
          }}
        />

        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <button
            onClick={submitReport}
            disabled={submitting}
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: '#ef4444',
              color: '#fff',
              border: 'none',
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Submit report
          </button>

          <div style={{ alignSelf: 'center', color: '#94a3b8' }}>{message}</div>
        </div>
      </div>
    </div>
  )
}
