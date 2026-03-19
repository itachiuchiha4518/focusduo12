'use client'

import { useEffect, useMemo, useState } from 'react'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
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
    const unsub = onAuthStateChanged(auth, u => setUser(u || null))
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'reports'), snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setReports(arr)
      setSelectedReportId(prev => (prev && arr.some(r => r.id === prev) ? prev : arr[0]?.id || null))
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'subscriptionRequests'), snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      setRequests(arr)
      setSelectedRequestId(prev => (prev && arr.some(r => r.id === prev) ? prev : arr[0]?.id || null))
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

  useEffect(() => {
    async function loadUser() {
      if (!selectedReport?.reportedUid) {
        setSelectedUser(null)
        return
      }
      const snap = await getDoc(doc(db, 'users', selectedReport.reportedUid))
      setSelectedUser(snap.exists() ? { id: snap.id, ...snap.data() } : { warningCount: 0, accountStatus: 'active' })
    }
    loadUser()
  }, [selectedReport?.reportedUid])

  async function login() {
    await signInWithPopup(auth, googleProvider)
  }

  async function logout() {
    await signOut(auth)
  }

  async function declineReport() {
    if (!selectedReport) return
    setBusy(true)
    try {
      await updateDoc(doc(db, 'reports', selectedReport.id), {
        status: 'declined',
        adminAction: 'decline',
        reviewedBy: ADMIN_UID,
        reviewedAt: serverTimestamp(),
        adminNote: note.trim() || ''
      })
      setMsg('Report declined.')
      setNote('')
    } catch (e) {
      console.error(e)
      alert('Failed to decline report')
    } finally {
      setBusy(false)
    }
  }

  async function warnUser() {
    if (!selectedReport?.reportedUid) return
    setBusy(true)
    try {
      const userRef = doc(db, 'users', selectedReport.reportedUid)
      const snap = await getDoc(userRef)
      const current = snap.exists() ? (snap.data().warningCount || 0) : 0
      const next = current + 1

      await setDoc(userRef, {
        warningCount: next,
        accountStatus: 'active',
        lastWarningAt: serverTimestamp(),
        lastWarningReportId: selectedReport.id,
        lastWarningReason: selectedReport.selectedReasons || [],
        lastWarningDetails: selectedReport.details || ''
      }, { merge: true })

      await updateDoc(doc(db, 'reports', selectedReport.id), {
        status: 'warning-issued',
        adminAction: 'warning',
        reviewedBy: ADMIN_UID,
        reviewedAt: serverTimestamp(),
        warningCountBefore: current,
        warningCountAfter: next,
        adminNote: note.trim() || ''
      })

      setMsg(`Warning issued. User now has ${next} warning(s).`)
      setNote('')
      setSelectedUser(prev => prev ? { ...prev, warningCount: next, accountStatus: 'active' } : prev)
    } catch (e) {
      console.error(e)
      alert('Failed to warn user')
    } finally {
      setBusy(false)
    }
  }

  async function banUser() {
    if (!selectedReport?.reportedUid) return
    setBusy(true)
    try {
      const userRef = doc(db, 'users', selectedReport.reportedUid)
      const snap = await getDoc(userRef)
      const current = snap.exists() ? (snap.data().warningCount || 0) : 0

      await setDoc(userRef, {
        warningCount: current,
        accountStatus: 'banned',
        bannedAt: serverTimestamp(),
        bannedBy: ADMIN_UID,
        bannedReason: selectedReport.selectedReasons || [],
        bannedDetails: selectedReport.details || '',
        bannedFromReportId: selectedReport.id
      }, { merge: true })

      await updateDoc(doc(db, 'reports', selectedReport.id), {
        status: 'banned',
        adminAction: 'ban',
        reviewedBy: ADMIN_UID,
        reviewedAt: serverTimestamp(),
        warningCountBefore: current,
        adminNote: note.trim() || ''
      })

      setMsg('User banned.')
      setNote('')
      setSelectedUser(prev => prev ? { ...prev, warningCount: current, accountStatus: 'banned' } : prev)
    } catch (e) {
      console.error(e)
      alert('Failed to ban user')
    } finally {
      setBusy(false)
    }
  }

  async function savePlan(planId) {
    setBusy(true)
    try {
      const plan = plans[planId] || getPlanDefinition(planId)
      await setDoc(doc(db, 'plans', planId), { ...plan, updatedAt: serverTimestamp() }, { merge: true })
      setMsg(`Saved ${plan.label || planId}.`)
    } catch (e) {
      console.error(e)
      alert('Failed to save plan')
    } finally {
      setBusy(false)
    }
  }

  async function uploadQrImage(planId, file) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = async () => {
      const dataUrl = String(reader.result || '')
      setPlans(prev => ({
        ...prev,
        [planId]: { ...(prev[planId] || {}), qrImageUrl: dataUrl, id: planId }
      }))
      await setDoc(doc(db, 'plans', planId), {
        ...(plans[planId] || getPlanDefinition(planId)),
        qrImageUrl: dataUrl,
        updatedAt: serverTimestamp()
      }, { merge: true })
      setMsg(`QR uploaded for ${planId}.`)
    }
    reader.readAsDataURL(file)
  }

  const stats = useMemo(() => ({
    reports: reports.length,
    openReports: reports.filter(r => r.status === 'open').length,
    requests: requests.length,
    pendingRequests: requests.filter(r => r.status === 'pending').length
  }), [reports, requests])

  if (!user) {
    return (
      <div style={styles.page}>
        <h1>Admin Panel</h1>
        <button onClick={login} style={styles.blue}>Sign in with Google</button>
      </div>
    )
  }

  if (user.uid !== ADMIN_UID) {
    return (
      <div style={styles.page}>
        <h1>Admin Panel</h1>
        <p>You are signed in but not authorized.</p>
        <button onClick={logout} style={styles.gray}>Sign out</button>
      </div>
    )
}
  return (
    <div style={styles.page}>
      <div style={styles.topRow}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Admin Panel</h1>
          <div style={{ color: '#6b7280' }}>Reports, warnings, bans, subscription requests, and plan QR settings.</div>
        </div>
        <button onClick={logout} style={styles.gray}>Sign out</button>
      </div>

      <div style={styles.row}>
        <div style={styles.box}><div style={{ color: '#6b7280' }}>Total reports</div><div style={{ fontSize: 28, fontWeight: 800 }}>{stats.reports}</div></div>
        <div style={styles.box}><div style={{ color: '#6b7280' }}>Open reports</div><div style={{ fontSize: 28, fontWeight: 800 }}>{stats.openReports}</div></div>
        <div style={styles.box}><div style={{ color: '#6b7280' }}>Total requests</div><div style={{ fontSize: 28, fontWeight: 800 }}>{stats.requests}</div></div>
        <div style={styles.box}><div style={{ color: '#6b7280' }}>Pending requests</div><div style={{ fontSize: 28, fontWeight: 800 }}>{stats.pendingRequests}</div></div>
      </div>

      <div style={styles.grid2}>
        <div style={styles.box}>
          <h2 style={{ marginTop: 0 }}>Reports</h2>
          <div style={styles.list}>
            {reports.length === 0 ? (
              <div style={{ padding: 14, color: '#6b7280' }}>No reports yet.</div>
            ) : reports.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedReportId(r.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: 14,
                  border: 'none',
                  borderBottom: '1px solid #e5e7eb',
                  background: r.id === selectedReportId ? '#eff6ff' : '#fff',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{r.reportedName || 'Unknown user'}</strong>
                  <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 999, background: r.status === 'open' ? '#fef3c7' : r.status === 'banned' ? '#fee2e2' : r.status === 'warning-issued' ? '#dbeafe' : '#e5e7eb' }}>
                    {r.status || 'open'}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>
                  {(r.selectedReasons || []).slice(0, 2).join(' • ') || 'No preset reason'}
                </div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>{fmt(r.createdAt)}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={styles.box}>
          {!selectedReport ? (
            <div style={{ color: '#6b7280' }}>Select a report.</div>
          ) : (
            <>
              <h2 style={{ marginTop: 0 }}>{selectedReport.reportedName || 'Reported user'}</h2>
              <div style={{ color: '#6b7280' }}>Session: {selectedReport.sessionId || '—'}</div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Reasons</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(selectedReport.selectedReasons || []).length > 0
                    ? selectedReport.selectedReasons.map(x => <span key={x} style={styles.chip}>{x}</span>)
                    : <span style={{ color: '#6b7280' }}>No preset reasons.</span>}
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Explanation</div>
                <div style={{ padding: 14, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f9fafb', whiteSpace: 'pre-wrap' }}>
                  {selectedReport.details || 'No additional text.'}
                </div>
              </div>

              <div style={styles.row}>
                <div style={{ padding: 14, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f9fafb', flex: 1 }}>
                  <div style={{ color: '#6b7280', fontSize: 13 }}>Reporter</div>
                  <div style={{ fontWeight: 700 }}>{selectedReport.reporterName || 'Anonymous'}</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{selectedReport.reporterUid || '—'}</div>
                </div>
                <div style={{ padding: 14, borderRadius: 12, border: '1px solid #e5e7eb', background: '#f9fafb', flex: 1 }}>
                  <div style={{ color: '#6b7280', fontSize: 13 }}>Reported user</div>
                  <div style={{ fontWeight: 700 }}>{selectedReport.reportedName || 'Unknown'}</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{selectedReport.reportedUid || '—'}</div>
                </div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Admin note</div>
                <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note" style={styles.ta} />
              </div>

              {selectedUser && (
                <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: '#fff7ed', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 800 }}>Warnings before action: {selectedUser.warningCount ?? 0}</div>
                  <div style={{ color: '#6b7280' }}>Use this before deciding warning or ban.</div>
                </div>
              )}

              <div style={styles.row}>
                <button onClick={declineReport} disabled={busy} style={styles.gray}>Decline</button>
                <button onClick={warnUser} disabled={busy} style={styles.warn}>Send warning</button>
                <button onClick={banUser} disabled={busy} style={styles.ban}>Ban user</button>
                <div style={{ alignSelf: 'center', color: '#2563eb', fontWeight: 600 }}>{msg}</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={styles.grid2}>
        <div style={styles.box}>
          <h2 style={{ marginTop: 0 }}>Subscription requests</h2>
          <div style={styles.list}>
            {requests.length === 0 ? (
              <div style={{ padding: 14, color: '#6b7280' }}>No subscription requests yet.</div>
            ) : requests.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedRequestId(r.id)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: 14,
                  border: 'none',
                  borderBottom: '1px solid #e5e7eb',
                  background: r.id === selectedRequestId ? '#eff6ff' : '#fff',
                  cursor: 'pointer'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                  <strong>{r.name || 'Anonymous'}</strong>
                  <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 999, background: r.status === 'pending' ? '#fef3c7' : r.status === 'approved' ? '#dcfce7' : '#fee2e2' }}>
                    {r.status || 'pending'}
                  </span>
                </div>
                <div style={{ color: '#6b7280', marginTop: 6 }}>{r.planLabel || r.planId || 'Plan'}</div>
                <div style={{ marginTop: 4, fontSize: 13, color: '#0f172a' }}>UTR: {r.utr || '—'}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>{fmt(r.createdAt)}</div>
              </button>
            ))}
          </div>
        </div>

        <div style={styles.box}>
          {!selectedRequest ? (
            <div style={{ color: '#6b7280' }}>Select a request.</div>
          ) : (
            <>
              <h2 style={{ marginTop: 0 }}>{selectedRequest.name || 'Anonymous'}</h2>
              <div style={{ color: '#6b7280' }}>{selectedRequest.email || '—'}</div>
              <div style={{ marginTop: 12 }}>
                <div><strong>Plan:</strong> {selectedRequest.planLabel || selectedRequest.planId || '—'}</div>
                <div style={{ marginTop: 6 }}><strong>UTR:</strong> {selectedRequest.utr || '—'}</div>
                <div style={{ marginTop: 6 }}><strong>Amount:</strong> ₹{selectedRequest.amount ?? '—'}</div>
                <div style={{ marginTop: 6 }}><strong>Status:</strong> {selectedRequest.status || 'pending'}</div>
              </div>

              <div style={{ marginTop: 12 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Admin note</div>
                <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Reason for approval / decline" style={styles.ta} />
              </div>

              <div style={styles.row}>
                <button onClick={grantPlan} disabled={busy} style={styles.blue}>Grant plan</button>
                <button onClick={declineRequest} disabled={busy} style={styles.gray}>Decline req</button>
                <div style={{ alignSelf: 'center', color: '#2563eb', fontWeight: 600 }}>{msg}</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ marginTop: 18 }}>
        <h2>Plan QR settings</h2>
        <div style={styles.gridPlans}>
          {['monthly_99', 'quarterly_199', 'yearly_699', 'first100_year_199'].map(id => {
            const plan = plans[id] || getPlanDefinition(id)
            return (
              <div key={id} style={styles.box}>
                <div style={{ fontWeight: 800, fontSize: 18 }}>{plan.label || id}</div>
                <div style={{ color: '#6b7280' }}>₹{plan.priceINR ?? 0} • {plan.durationDays ?? 0} days</div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>UPI ID</div>
                  <input
                    value={plan.upiId || ''}
                    onChange={e => setPlans(prev => ({ ...prev, [id]: { ...(prev[id] || {}), upiId: e.target.value, id } }))}
                    style={styles.input}
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>QR text</div>
                  <textarea
                    value={plan.qrText || ''}
                    onChange={e => setPlans(prev => ({ ...prev, [id]: { ...(prev[id] || {}), qrText: e.target.value, id } }))}
                    style={{ ...styles.input, minHeight: 70, resize: 'vertical' }}
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>QR image upload</div>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => uploadQrImage(id, e.target.files?.[0] || null)}
                    style={styles.input}
                  />
                </div>

                <div style={{ marginTop: 12 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>QR image URL / data</div>
                  <input
                    value={plan.qrImageUrl || ''}
                    onChange={e => setPlans(prev => ({ ...prev, [id]: { ...(prev[id] || {}), qrImageUrl: e.target.value, id } }))}
                    style={styles.input}
                  />
                </div>

                {plan.qrImageUrl ? (
                  <img
                    src={plan.qrImageUrl}
                    alt="QR"
                    style={{ width: '100%', marginTop: 12, borderRadius: 12, border: '1px solid #e5e7eb' }}
                  />
                ) : null}

                <div style={{ marginTop: 12 }}>
                  <label>
                    <input
                      type="checkbox"
                      checked={plan.enabled !== false}
                      onChange={e => setPlans(prev => ({ ...prev, [id]: { ...(prev[id] || {}), enabled: e.target.checked, id } }))}
                    />{' '}
                    Enabled
                  </label>
                </div>

                <div style={{ marginTop: 12 }}>
                  <button onClick={() => savePlan(id)} disabled={busy} style={styles.blue}>Save plan</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
                      }
