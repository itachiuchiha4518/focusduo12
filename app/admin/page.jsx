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
import { PLAN_DEFS, getPlanDefinition, planEndsAtFromPlanId } from '../../lib/subscriptions'

const ADMIN_UID = 'NIsbHB9RmXgR5vJEyv8CuV0ggD03'

function tsValue(v) {
  if (!v) return 0
  if (typeof v.toMillis === 'function') return v.toMillis()
  if (typeof v.seconds === 'number') return v.seconds * 1000
  return 0
}

function fmtDate(v) {
  if (!v) return '—'
  try {
    if (typeof v.toDate === 'function') return v.toDate().toLocaleString()
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000).toLocaleString()
  } catch {}
  return '—'
}

function clonePlans() {
  return JSON.parse(JSON.stringify(PLAN_DEFS))
}

export default function AdminPage() {
  const [user, setUser] = useState(null)
  const [reports, setReports] = useState([])
  const [requests, setRequests] = useState([])
  const [plans, setPlans] = useState(clonePlans())
  const [selectedReportId, setSelectedReportId] = useState(null)
  const [selectedRequestId, setSelectedRequestId] = useState(null)
  const [selectedUserMeta, setSelectedUserMeta] = useState(null)
  const [adminNote, setAdminNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => setUser(u || null))
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'reports'), snap => {
      const arr = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => tsValue(b.createdAt) - tsValue(a.createdAt))

      setReports(arr)
      setSelectedReportId(prev => {
        if (prev && arr.some(r => r.id === prev)) return prev
        return arr[0]?.id || null
      })
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'subscriptionRequests'), snap => {
      const arr = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => tsValue(b.createdAt) - tsValue(a.createdAt))

      setRequests(arr)
      setSelectedRequestId(prev => {
        if (prev && arr.some(r => r.id === prev)) return prev
        return arr[0]?.id || null
      })
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'plans'), snap => {
      const next = clonePlans()
      snap.docs.forEach(d => {
        next[d.id] = {
          ...(next[d.id] || {}),
          ...d.data(),
          id: d.id
        }
      })
      setPlans(next)
    })
    return () => unsub()
  }, [])

  const selectedReport = useMemo(
    () => reports.find(r => r.id === selectedReportId) || null,
    [reports, selectedReportId]
  )

  const selectedRequest = useMemo(
    () => requests.find(r => r.id === selectedRequestId) || null,
    [requests, selectedRequestId]
  )

  useEffect(() => {
    async function loadUserMeta() {
      if (!selectedReport?.reportedUid) {
        setSelectedUserMeta(null)
        return
      }

      const snap = await getDoc(doc(db, 'users', selectedReport.reportedUid))
      setSelectedUserMeta(
        snap.exists()
          ? { id: snap.id, ...snap.data() }
          : { warningCount: 0, accountStatus: 'active' }
      )
    }

    loadUserMeta()
  }, [selectedReport?.reportedUid])

  async function login() {
    try {
      setMessage('')
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      console.error(err)
      alert('Admin sign in failed')
    }
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
        adminNote: adminNote.trim() || ''
      })
      setMessage('Report declined.')
      setAdminNote('')
    } catch (err) {
      console.error(err)
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
      const userSnap = await getDoc(userRef)
      const currentWarnings = userSnap.exists() ? (userSnap.data().warningCount || 0) : 0
      const nextWarnings = currentWarnings + 1

      await setDoc(
        userRef,
        {
          warningCount: nextWarnings,
          accountStatus: 'active',
          lastWarningAt: serverTimestamp(),
          lastWarningReportId: selectedReport.id,
          lastWarningReason: selectedReport.selectedReasons || [],
          lastWarningDetails: selectedReport.details || ''
        },
        { merge: true }
      )

      await updateDoc(doc(db, 'reports', selectedReport.id), {
        status: 'warning-issued',
        adminAction: 'warning',
        reviewedBy: ADMIN_UID,
        reviewedAt: serverTimestamp(),
        warningCountBefore: currentWarnings,
        warningCountAfter: nextWarnings,
        adminNote: adminNote.trim() || ''
      })

      setMessage(`Warning sent. User now has ${nextWarnings} warning(s).`)
      setAdminNote('')
      setSelectedUserMeta(prev =>
        prev ? { ...prev, warningCount: nextWarnings, accountStatus: 'active' } : prev
      )
    } catch (err) {
      console.error(err)
      alert('Failed to send warning')
    } finally {
      setBusy(false)
    }
  }

  async function banUser() {
    if (!selectedReport?.reportedUid) return
    setBusy(true)
    try {
      const userRef = doc(db, 'users', selectedReport.reportedUid)
      const userSnap = await getDoc(userRef)
      const currentWarnings = userSnap.exists() ? (userSnap.data().warningCount || 0) : 0

      await setDoc(
        userRef,
        {
          warningCount: currentWarnings,
          accountStatus: 'banned',
          bannedAt: serverTimestamp(),
          bannedBy: ADMIN_UID,
          bannedReason: selectedReport.selectedReasons || [],
          bannedDetails: selectedReport.details || '',
          bannedFromReportId: selectedReport.id
        },
        { merge: true }
      )

      await updateDoc(doc(db, 'reports', selectedReport.id), {
        status: 'banned',
        adminAction: 'ban',
        reviewedBy: ADMIN_UID,
        reviewedAt: serverTimestamp(),
        warningCountBefore: currentWarnings,
        adminNote: adminNote.trim() || ''
      })

      setMessage('User banned.')
      setAdminNote('')
      setSelectedUserMeta(prev =>
        prev ? { ...prev, warningCount: currentWarnings, accountStatus: 'banned' } : prev
      )
    } catch (err) {
      console.error(err)
      alert('Failed to ban user')
    } finally {
      setBusy(false)
    }
  }

  async function savePlan(planId) {
    setBusy(true)
    try {
      const plan = plans[planId] || getPlanDefinition(planId)
      await setDoc(
        doc(db, 'plans', planId),
        {
          ...plan,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      )
      setMessage(`Saved ${plan.label}`)
    } catch (err) {
      console.error(err)
      alert('Failed to save plan')
    } finally {
      setBusy(false)
    }
  }

  async function grantRequest() {
    if (!selectedRequest) return
    setBusy(true)
    try {
      const reqRef = doc(db, 'subscriptionRequests', selectedRequest.id)
      const planId = selectedRequest.planId
      const plan = plans[planId] || getPlanDefinition(planId)
      const planRef = doc(db, 'plans', planId)
      const userRef = doc(db, 'users', selectedRequest.uid)

      await runTransaction(db, async tx => {
        const reqSnap = await tx.get(reqRef)
        if (!reqSnap.exists()) throw new Error('request-missing')

        const currentReq = reqSnap.data()
        if (currentReq.status !== 'pending') throw new Error('request-not-pending')

        const planSnap = await tx.get(planRef)
        const livePlan = planSnap.exists() ? planSnap.data() : plan

        if ((livePlan.isSpecial || plan.isSpecial)) {
          const limit = Number(livePlan.salesLimit || plan.salesLimit || 100)
          const sold = Number(livePlan.salesCount || plan.salesCount || 0)
          if (sold >= limit) {
            throw new Error('special-plan-sold-out')
          }
          tx.set(planRef, { salesCount: sold + 1, updatedAt: serverTimestamp() }, { merge: true })
        }

        const expiry = planEndsAtFromPlanId(planId)

        tx.set(
          userRef,
          {
            uid: selectedRequest.uid,
            name: selectedRequest.name || '',
            email: selectedRequest.email || '',
            planId,
            planLabel: livePlan.label || plan.label,
            planType: 'paid',
            planStatus: 'active',
            accountStatus: 'active',
            planExpiresAt: expiry,
            updatedAt: serverTimestamp()
          },
          { merge: true }
        )

        tx.set(
          reqRef,
          {
            status: 'approved',
            reviewedBy: ADMIN_UID,
            reviewedAt: serverTimestamp(),
            planGrantedAt: serverTimestamp(),
            planExpiresAt: expiry,
            adminNote: adminNote.trim() || ''
          },
          { merge: true }
        )
      })

      setMessage('Plan granted.')
      setAdminNote('')
    } catch (err) {
      console.error(err)
      alert(`Failed to grant plan: ${err.message || err}`)
    } finally {
      setBusy(false)
    }
  }

  async function declineRequest() {
    if (!selectedRequest) return
    setBusy(true)
    try {
      await updateDoc(doc(db, 'subscriptionRequests', selectedRequest.id), {
        status: 'declined',
        reviewedBy: ADMIN_UID,
        reviewedAt: serverTimestamp(),
        adminNote: adminNote.trim() || ''
      })
      setMessage('Request declined.')
      setAdminNote('')
    } catch (err) {
      console.error(err)
      alert('Failed to decline request')
    } finally {
      setBusy(false)
    }
  }

  const counts = useMemo(() => {
    return {
      totalReports: reports.length,
      openReports: reports.filter(r => r.status === 'open').length,
      totalRequests: requests.length,
      pendingRequests: requests.filter(r => r.status === 'pending').length
    }
  }, [reports, requests])

  if (!user) {
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <h1>Admin Panel</h1>
        <button onClick={login} style={btnBlue}>Sign in with Google</button>
      </div>
    )
  }

  if (user.uid !== ADMIN_UID) {
    return (
      <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
        <h1>Admin Panel</h1>
        <p>You are signed in but not authorized.</p>
        <button onClick={logout} style={btnGhost}>Sign out</button>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1500, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Admin Panel</h1>
          <div style={{ color: '#6b7280' }}>Reports, warnings, bans, subscription requests, and plan QR settings.</div>
        </div>

        <button onClick={logout} style={btnGhost}>Sign out</button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
        <div style={statCard}>
          <div style={{ color: '#6b7280' }}>Total reports</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{counts.totalReports}</div>
        </div>
        <div style={statCard}>
          <div style={{ color: '#6b7280' }}>Open reports</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{counts.openReports}</div>
        </div>
        <div style={statCard}>
          <div style={{ color: '#6b7280' }}>Total requests</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{counts.totalRequests}</div>
        </div>
        <div style={statCard}>
          <div style={{ color: '#6b7280' }}>Pending requests</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{counts.pendingRequests}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginTop: 18 }}>
        <div style={panel}>
          <h2 style={{ marginTop: 0 }}>Reports</h2>
          <div style={scrollList}>
            {reports.length === 0 ? (
              <div style={{ color: '#6b7280' }}>No reports yet.</div>
            ) : (
              reports.map(report => {
                const active = report.id === selectedReportId
                return (
                  <button
                    key={report.id}
                    onClick={() => setSelectedReportId(report.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: 14,
                      border: 'none',
                      borderBottom: '1px solid #e5e7eb',
                      background: active ? '#eff6ff' : '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{report.reportedName || 'Unknown user'}</strong>
                      <span style={{
                        fontSize: 12,
                        padding: '4px 8px',
                        borderRadius: 999,
                        background:
                          report.status === 'open' ? '#fef3c7' :
                          report.status === 'banned' ? '#fee2e2' :
                          report.status === 'warning-issued' ? '#dbeafe' :
                          '#e5e7eb'
                      }}>
                        {report.status || 'open'}
                      </span>
                    </div>
                    <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>
                      {(report.selectedReasons || []).slice(0, 2).join(' • ') || 'No preset reason'}
                    </div>
                    <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                      {fmtDate(report.createdAt)}
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div style={panel}>
          {!selectedReport ? (
            <div style={{ color: '#6b7280' }}>Select a report to view details.</div>
          ) : (
            <>
              <h2 style={{ marginTop: 0 }}>{selectedReport.reportedName || 'Reported user'}</h2>
              <div style={{ color: '#6b7280' }}>Session: {selectedReport.sessionId || '—'}</div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Reasons</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(selectedReport.selectedReasons || []).length > 0 ? (
                    selectedReport.selectedReasons.map(r => (
                      <span key={r} style={chip}>{r}</span>
                    ))
                  ) : (
                    <span style={{ color: '#6b7280' }}>No preset reasons selected.</span>
                  )}
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Explanation</div>
                <div style={boxMuted}>
                  {selectedReport.details || 'No additional text.'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                <div style={boxMuted}>
                  <div style={{ color: '#6b7280', fontSize: 13 }}>Reporter</div>
                  <div style={{ fontWeight: 700 }}>{selectedReport.reporterName || 'Anonymous'}</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{selectedReport.reporterUid || '—'}</div>
                </div>
                <div style={boxMuted}>
                  <div style={{ color: '#6b7280', fontSize: 13 }}>Reported user</div>
                  <div style={{ fontWeight: 700 }}>{selectedReport.reportedName || 'Unknown'}</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{selectedReport.reportedUid || '—'}</div>
                </div>
              </div>

              <div style={{ marginTop: 14 }}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Admin note</div>
                <textarea
                  value={adminNote}
                  onChange={e => setAdminNote(e.target.value)}
                  placeholder="Optional note before taking action"
                  style={textarea}
                />
              </div>

              {selectedUserMeta && (
                <div style={{ ...boxMuted, marginTop: 14, background: '#fff7ed' }}>
                  <div style={{ fontWeight: 800 }}>Warnings before action: {selectedUserMeta.warningCount ?? 0}</div>
                  <div style={{ color: '#6b7280', marginTop: 4 }}>
                    Use this before deciding warning or ban.
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                <button onClick={declineReport} disabled={busy} style={btnGhostDark}>Decline</button>
                <button onClick={warnUser} disabled={busy} style={btnWarn}>Send warning</button>
                <button onClick={banUser} disabled={busy} style={btnBan}>Ban user</button>
                <div style={{ alignSelf: 'center', color: '#2563eb', fontWeight: 600 }}>{message}</div>
              </div>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 18, marginTop: 22 }}>
        <div style={panel}>
          <h2 style={{ marginTop: 0 }}>Subscription requests</h2>
          <div style={scrollList}>
            {requests.length === 0 ? (
              <div style={{ color: '#6b7280' }}>No subscription requests yet.</div>
            ) : (
              requests.map(req => {
                const active = req.id === selectedRequestId
                return (
                  <button
                    key={req.id}
                    onClick={() => setSelectedRequestId(req.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      padding: 14,
                      border: 'none',
                      borderBottom: '1px solid #e5e7eb',
                      background: active ? '#eff6ff' : '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <strong>{req.name || 'Anonymous'}</strong>
                      <span style={{
                        fontSize: 12,
                        padding: '4px 8px',
                        borderRadius: 999,
                        background:
                          req.status === 'pending' ? '#fef3c7' :
                          req.status === 'approved' ? '#dcfce7' :
                          '#fee2e2'
                      }}>
                        {req.status || 'pending'}
                      </span>
                    </div>
                    <div style={{ color: '#6b7280', marginTop: 6 }}>
                      {req.planLabel || re
