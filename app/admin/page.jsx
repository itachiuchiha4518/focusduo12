'use client'

import { useEffect, useMemo, useState } from 'react'
import { signInWithPopup, signOut } from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  increment,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc
} from 'firebase/firestore'
import { auth, db, googleProvider } from '../../lib/firebase'

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

export default function AdminPage() {
  const [user, setUser] = useState(null)
  const [reports, setReports] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [selectedUserMeta, setSelectedUserMeta] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [adminNote, setAdminNote] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(u => setUser(u || null))
    return () => unsub()
  }, [])

  useEffect(() => {
    if (!user || user.uid !== ADMIN_UID) {
      setReports([])
      setLoading(false)
      return
    }

    const unsub = onSnapshot(collection(db, 'reports'), snap => {
      const arr = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => tsValue(b.createdAt) - tsValue(a.createdAt))

      setReports(arr)
      setLoading(false)

      setSelectedId(prev => {
        if (prev && arr.some(r => r.id === prev)) return prev
        return arr[0]?.id || null
      })
    })

    return () => unsub()
  }, [user])

  const selectedReport = useMemo(
    () => reports.find(r => r.id === selectedId) || null,
    [reports, selectedId]
  )

  useEffect(() => {
    async function loadUserMeta() {
      if (!selectedReport?.reportedUid) {
        setSelectedUserMeta(null)
        return
      }

      const snap = await getDoc(doc(db, 'users', selectedReport.reportedUid))
      if (!snap.exists()) {
        setSelectedUserMeta({
          warningCount: 0,
          accountStatus: 'active'
        })
        return
      }

      setSelectedUserMeta({
        id: snap.id,
        ...snap.data()
      })
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
      setSelectedUserMeta(prev => prev ? { ...prev, warningCount: nextWarnings, accountStatus: 'active' } : prev)
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
      setSelectedUserMeta(prev => prev ? { ...prev, warningCount: currentWarnings, accountStatus: 'banned' } : prev)
    } catch (err) {
      console.error(err)
      alert('Failed to ban user')
    } finally {
      setBusy(false)
    }
  }

  const counts = useMemo(() => {
    const total = reports.length
    const open = reports.filter(r => r.status === 'open').length
    const warned = reports.filter(r => r.status === 'warning-issued').length
    const banned = reports.filter(r => r.status === 'banned').length
    return { total, open, warned, banned }
  }, [reports])

  if (!user) {
    return (
      <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <h1>Admin Panel</h1>
        <button
          onClick={login}
          style={{ padding: '10px 14px', borderRadius: 10, background: '#2563eb', color: '#fff', border: 'none' }}
        >
          Sign in with Google
        </button>
      </div>
    )
  }

  if (user.uid !== ADMIN_UID) {
    return (
      <div style={{ padding: 24, maxWidth: 960, margin: '0 auto' }}>
        <h1>Admin Panel</h1>
        <p>You are signed in but not authorized.</p>
        <button
          onClick={logout}
          style={{ padding: '10px 14px', borderRadius: 10, background: '#f3f4f6', border: '1px solid #ddd' }}
        >
          Sign out
        </button>
      </div>
    )
  }

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ marginBottom: 6 }}>Admin Panel</h1>
          <div style={{ color: '#666' }}>Reports, warnings, bans, and review actions.</div>
        </div>

        <button
          onClick={logout}
          style={{ padding: '10px 14px', borderRadius: 10, background: '#f3f4f6', border: '1px solid #ddd' }}
        >
          Sign out
        </button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 18 }}>
        <div style={{ padding: 14, borderRadius: 12, background: '#fff', border: '1px solid #e5e7eb', minWidth: 160 }}>
          <div style={{ color: '#6b7280' }}>Total reports</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{counts.total}</div>
        </div>
        <div style={{ padding: 14, borderRadius: 12, background: '#fff', border: '1px solid #e5e7eb', minWidth: 160 }}>
          <div style={{ color: '#6b7280' }}>Open</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{counts.open}</div>
        </div>
        <div style={{ padding: 14, borderRadius: 12, background: '#fff', border: '1px solid #e5e7eb', minWidth: 160 }}>
          <div style={{ color: '#6b7280' }}>Warnings</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{counts.warned}</div>
        </div>
        <div style={{ padding: 14, borderRadius: 12, background: '#fff', border: '1px solid #e5e7eb', minWidth: 160 }}>
          <div style={{ color: '#6b7280' }}>Banned</div>
          <div style={{ fontSize: 28, fontWeight: 800 }}>{counts.banned}</div>
        </div>
      </div>

      {loading ? (
        <div style={{ marginTop: 18 }}>Loading reports…</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '360px 1fr', gap: 16, marginTop: 18, alignItems: 'start' }}>
          <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, background: '#fff', overflow: 'hidden' }}>
            <div style={{ padding: 14, borderBottom: '1px solid #e5e7eb', fontWeight: 800 }}>
              Reports
            </div>

            <div style={{ maxHeight: '72vh', overflowY: 'auto' }}>
              {reports.length === 0 ? (
                <div style={{ padding: 14, color: '#6b7280' }}>No reports yet.</div>
              ) : (
                reports.map(report => {
                  const active = report.id === selectedId
                  return (
                    <button
                      key={report.id}
                      onClick={() => setSelectedId(report.id)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        padding: 14,
                        border: 'none',
                        borderBottom: '1px solid #f1f5f9',
                        background: active ? '#eff6ff' : '#fff',
                        cursor: 'pointer'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <strong style={{ display: 'block' }}>{report.reportedName || 'Unknown user'}</strong>
                        <span
                          style={{
                            fontSize: 12,
                            padding: '4px 8px',
                            borderRadius: 999,
                            background:
                              report.status === 'open' ? '#fef3c7' :
                              report.status === 'banned' ? '#fee2e2' :
                              report.status === 'warning-issued' ? '#dbeafe' :
                              '#e5e7eb'
                          }}
                        >
                          {report.status || 'open'}
                        </span>
                      </div>

                      <div style={{ fontSize: 13, color: '#6b7280', marginTop: 6 }}>
                        {report.selectedReasons?.slice(0, 2).join(' • ') || 'No preset reason'}
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

          <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, background: '#fff', padding: 18, minHeight: '72vh' }}>
            {!selectedReport ? (
              <div style={{ color: '#6b7280' }}>Select a report to view details.</div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                  <div>
                    <h2 style={{ marginTop: 0, marginBottom: 8 }}>
                      {selectedReport.reportedName || 'Reported user'}
                    </h2>
                    <div style={{ color: '#6b7280' }}>Session: {selectedReport.sessionId || '—'}</div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: '#111827' }}>
                      Warnings: {selectedUserMeta?.warningCount ?? 0}
                    </div>
                    <div style={{ color: selectedUserMeta?.accountStatus === 'banned' ? '#b91c1c' : '#6b7280' }}>
                      Account status: {selectedUserMeta?.accountStatus || 'active'}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>Reported reasons</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {(selectedReport.selectedReasons || []).length > 0 ? (
                      selectedReport.selectedReasons.map(r => (
                        <span
                          key={r}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 999,
                            background: '#f3f4f6',
                            border: '1px solid #e5e7eb',
                            fontSize: 13
                          }}
                        >
                          {r}
                        </span>
                      ))
                    ) : (
                      <span style={{ color: '#6b7280' }}>No preset reasons selected.</span>
                    )}
                  </div>
                </div>

                <div style={{ marginTop: 14 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>User explanation</div>
                  <div style={{
                    padding: 14,
                    borderRadius: 12,
                    border: '1px solid #e5e7eb',
                    background: '#f9fafb',
                    whiteSpace: 'pre-wrap'
                  }}>
                    {selectedReport.details || 'No additional text.'}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
                  <div style={{ padding: 14, borderRadius: 12, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
                    <div style={{ color: '#6b7280', fontSize: 13 }}>Reporter</div>
                    <div style={{ fontWeight: 700 }}>{selectedReport.reporterName || 'Anonymous'}</div>
                    <div style={{ fontSize: 13, color: '#6b7280' }}>{selectedReport.reporterUid || '—'}</div>
                  </div>

                  <div style={{ padding: 14, borderRadius: 12, background: '#f9fafb', border: '1px solid #e5e7eb' }}>
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
                    style={{
                      width: '100%',
                      minHeight: 90,
                      borderRadius: 12,
                      border: '1px solid #d1d5db',
                      padding: 12,
                      resize: 'vertical'
                    }}
                  />
                </div>

                {selectedUserMeta && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: 14,
                      borderRadius: 12,
                      background: selectedUserMeta.warningCount >= 2 ? '#fff7ed' : '#eff6ff',
                      border: '1px solid #e5e7eb'
                    }}
                  >
                    <div style={{ fontWeight: 800 }}>
                      Current warnings before action: {selectedUserMeta.warningCount ?? 0}
                    </div>
                    <div style={{ color: '#6b7280', marginTop: 4 }}>
                      Useful for deciding whether to warn again or ban immediately.
                    </div>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 16 }}>
                  <button
                    onClick={declineReport}
                    disabled={busy}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: '1px solid #d1d5db',
                      background: '#fff',
                      cursor: 'pointer'
                    }}
                  >
                    Decline
                  </button>

                  <button
                    onClick={warnUser}
                    disabled={busy}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: 'none',
                      background: '#f59e0b',
                      color: '#111827',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Send warning
                  </button>

                  <button
                    onClick={banUser}
                    disabled={busy}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 10,
                      border: 'none',
                      background: '#dc2626',
                      color: '#fff',
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Ban user
                  </button>

                  <div style={{ alignSelf: 'center', color: '#2563eb', fontWeight: 600 }}>
                    {message}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
        }
