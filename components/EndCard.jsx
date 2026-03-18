import { useState } from 'react'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'

export default function EndCard({ sessionId, partnerUid, partnerName, onStartNew }) {
  const [reason, setReason] = useState('')
  const [reporting, setReporting] = useState(false)
  const [message, setMessage] = useState('')

  async function submitReport() {
    if (!auth.currentUser) return alert('Sign in first')
    if (!reason.trim()) return alert('Enter a reason')

    setReporting(true)
    try {
      await addDoc(collection(db, 'reports'), {
        reporterUid: auth.currentUser.uid,
        reportedUid: partnerUid || null,
        reportedName: partnerName || null,
        sessionId: sessionId || null,
        reason: reason.trim(),
        createdAt: serverTimestamp()
      })
      setReason('')
      setMessage('Report submitted.')
    } catch (err) {
      console.error(err)
      alert('Failed to submit report')
    } finally {
      setReporting(false)
    }
  }

  return (
    <div style={{ marginTop: 18, padding: 16, borderRadius: 12, border: '1px solid #e5e7eb', background: '#fff' }}>
      <h3 style={{ marginTop: 0 }}>Session ended</h3>

      <div style={{ marginBottom: 12 }}>
        <strong>Partner:</strong> {partnerName || 'Unknown'}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <button
          onClick={onStartNew}
          style={{ padding: '10px 14px', borderRadius: 8, background: '#2563eb', color: '#fff', border: 'none' }}
        >
          Start new session
        </button>
      </div>

      <div style={{ marginTop: 10 }}>
        <div style={{ fontWeight: 800 }}>Report user</div>
        <textarea
          value={reason}
          onChange={e => setReason(e.target.value)}
          placeholder="Reason for report"
          style={{ width: '100%', minHeight: 90, marginTop: 8, padding: 10, borderRadius: 8, border: '1px solid #ddd' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            onClick={submitReport}
            disabled={reporting}
            style={{ padding: '10px 14px', borderRadius: 8, background: '#ef4444', color: '#fff', border: 'none' }}
          >
            Submit report
          </button>
          <div style={{ alignSelf: 'center', color: '#666' }}>{message}</div>
        </div>
      </div>
    </div>
  )
}
