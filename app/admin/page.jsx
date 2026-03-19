'use client'

import { useEffect, useMemo, useState } from 'react'
import { signInWithPopup, signOut } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore'
import { auth, db, googleProvider } from '../../lib/firebase'
import { PLAN_DEFS, getPlanDefinition } from '../../lib/subscriptions'

const ADMIN_UID = 'NIsbHB9RmXgR5vJEyv8CuV0ggD03'

const styles = {
  page: { padding: 24, maxWidth: 1500, margin: '0 auto', fontFamily: 'system-ui, sans-serif' },
  topRow: { display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 18 },
  gridPlans: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14, marginTop: 18 },
  box: { border: '1px solid #e5e7eb', borderRadius: 14, background: '#fff', padding: 16 },
  list: { maxHeight: 520, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap' },
  input: { width: '100%', padding: 10, borderRadius: 10, border: '1px solid #d1d5db', outline: 'none' },
  ta: { width: '100%', minHeight: 90, padding: 10, borderRadius: 10, border: '1px solid #d1d5db', outline: 'none', resize: 'vertical' },
  blue: { padding: '10px 14px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 800, cursor: 'pointer' },
  gray: { padding: '10px 14px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer' },
  warn: { padding: '10px 14px', borderRadius: 10, border: 'none', background: '#f59e0b', color: '#111827', fontWeight: 800, cursor: 'pointer' },
  ban: { padding: '10px 14px', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 800, cursor: 'pointer' },
  chip: { padding: '6px 10px', borderRadius: 999, background: '#f3f4f6', border: '1px solid #e5e7eb', fontSize: 13 }
}

function clonePlans() {
  return JSON.parse(JSON.stringify(PLAN_DEFS))
}

function ts(v) {
  if (!v) return 0
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (typeof v.seconds === 'number') return v.seconds * 1000
  return 0
}

function fmt(v) {
  if (!v) return '—'
  try {
    if (typeof v.toDate === 'function') return v.toDate().toLocaleString()
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000).toLocaleString()
  } catch {}
  return '—'
}

function planExpiryFromPlanId(planId) {
  const plan = getPlanDefinition(planId)
  const days = Number(plan.durationDays || 0)
  if (!days) return null
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000)
}

export default function AdminPage() {
  const [user, setUser] = useState(null)
  const [reports, setReports] = useState([])
  const [requests, setRequests] = useState([])
  const [plans, setPlans] = useState(clonePlans())
  const [selectedReportId, setSelectedReportId] = useState(null)
  const [selectedRequestId, setSelectedRequestId] = useState(null)
  const [selectedUser, setSelectedUser] = useState(null)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => setUser(u || null))
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'reports'), snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setReports(arr)
      setSelectedReportId(arr[0]?.id || null)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'subscriptionRequests'), snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setRequests(arr)
      setSelectedRequestId(arr[0]?.id || null)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'plans'), snap => {
      const next = clonePlans()
      snap.docs.forEach(d => {
        next[d.id] = { ...(next[d.id] || {}), ...d.data(), id: d.id }
      })
      setPlans(next)
    })
    return () => unsub()
  }, [])

  const selectedReport = reports.find(r => r.id === selectedReportId)
  const selectedRequest = requests.find(r => r.id === selectedRequestId)

  async function login() {
    await signInWithPopup(auth, googleProvider)
  }

  async function logout() {
    await signOut(auth)
  }

  async function declineReport() {
    await updateDoc(doc(db, 'reports', selectedReport.id), { status: 'declined' })
  }

  async function warnUser() {
    const userRef = doc(db, 'users', selectedReport.reportedUid)
    const snap = await getDoc(userRef)
    const count = snap.exists() ? (snap.data().warningCount || 0) : 0
    await setDoc(userRef, { warningCount: count + 1 }, { merge: true })
    await updateDoc(doc(db, 'reports', selectedReport.id), { status: 'warning-issued' })
  }

  async function banUser() {
    await setDoc(doc(db, 'users', selectedReport.reportedUid), { accountStatus: 'banned' }, { merge: true })
    await updateDoc(doc(db, 'reports', selectedReport.id), { status: 'banned' })
  }

  async function savePlan(id) {
    await setDoc(doc(db, 'plans', id), plans[id], { merge: true })
  }

  async function grantPlan() {
    const req = selectedRequest
    const expiry = planExpiryFromPlanId(req.planId)
    await setDoc(doc(db, 'users', req.uid), {
      planId: req.planId,
      planExpiresAt: expiry
    }, { merge: true })

    await updateDoc(doc(db, 'subscriptionRequests', req.id), {
      status: 'approved'
    })
  }

  async function declineRequest() {
    await updateDoc(doc(db, 'subscriptionRequests', selectedRequest.id), {
      status: 'declined'
    })
  }

  if (!user) {
    return <button onClick={login}>Login</button>
  }

  if (user.uid !== ADMIN_UID) {
    return <div>Not allowed</div>
  }

  return (
    <div style={styles.page}><h1>Admin Panel</h1>

      <div style={styles.grid2}>
        <div>
          <h2>Reports</h2>
          {reports.map(r => (
            <div key={r.id} onClick={() => setSelectedReportId(r.id)}>
              {r.reportedName}
            </div>
          ))}
        </div>

        <div>
          {selectedReport && (
            <>
              <h2>{selectedReport.reportedName}</h2>

              <textarea value={note} onChange={e => setNote(e.target.value)} />

              <button onClick={declineReport}>Decline</button>
              <button onClick={warnUser}>Warn</button>
              <button onClick={banUser}>Ban</button>
            </>
          )}
        </div>
      </div>

      <div style={styles.grid2}>
        <div>
          <h2>Requests</h2>
          {requests.map(r => (
            <div key={r.id} onClick={() => setSelectedRequestId(r.id)}>
              {r.name}
            </div>
          ))}
        </div>

        <div>
          {selectedRequest && (
            <>
              <h2>{selectedRequest.name}</h2>
              <div>Plan: {selectedRequest.planId}</div>
              <div>UTR: {selectedRequest.utr}</div>

              <button onClick={grantPlan}>Grant</button>
              <button onClick={declineRequest}>Decline</button>
            </>
          )}
        </div>
      </div>

      <h2>Plans</h2>
      {Object.keys(plans).map(id => (
        <div key={id}>
          <input
            value={plans[id].upiId || ''}
            onChange={e =>
              setPlans(prev => ({
                ...prev,
                [id]: { ...prev[id], upiId: e.target.value }
              }))
            }
          />
          <button onClick={() => savePlan(id)}>Save</button>
        </div>
      ))}
    </div>
  )
}
