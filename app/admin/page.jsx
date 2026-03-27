'use client'

import { useEffect, useMemo, useState } from 'react'
import { signInWithPopup, signOut, onAuthStateChanged } from 'firebase/auth'
import {
  collection, doc, getDoc, getDocs, onSnapshot,
  query, runTransaction, serverTimestamp,
  setDoc, updateDoc, where, orderBy, limit
} from 'firebase/firestore'
import { auth, db, googleProvider } from '../../lib/firebase'
import { PLAN_DEFS, getPlanDefinition } from '../../lib/subscriptions'
import { DEFAULT_LIVE_HOURS, normalizeLiveHours, getLiveHoursStatus } from '../../lib/liveHours'

const ADMIN_UID = 'NIsbHB9RmXgR5vJEyv8CuV0ggD03'

// ─────────────────────────────────────
// Styles
// ─────────────────────────────────────
const S = {
  page:  { padding: 20, maxWidth: 1500, margin: '0 auto', fontFamily: 'system-ui, sans-serif', background: '#f8fafc', minHeight: '100vh' },
  card:  { border: '1px solid #e5e7eb', borderRadius: 14, background: '#fff', padding: 18, marginBottom: 4 },
  list:  { maxHeight: 340, overflowY: 'auto', border: '1px solid #e5e7eb', borderRadius: 12, background: '#fff' },
  grid2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginTop: 16 },
  row:   { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  input: { padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', outline: 'none', fontSize: 14, width: '100%', boxSizing: 'border-box' },
  ta:    { padding: '10px 12px', borderRadius: 10, border: '1px solid #d1d5db', outline: 'none', resize: 'vertical', minHeight: 80, width: '100%', boxSizing: 'border-box', fontSize: 14 },
  blue:  { padding: '10px 16px', borderRadius: 10, border: 'none', background: '#2563eb', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14 },
  green: { padding: '10px 16px', borderRadius: 10, border: 'none', background: '#16a34a', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14 },
  gray:  { padding: '10px 16px', borderRadius: 10, border: '1px solid #d1d5db', background: '#fff', cursor: 'pointer', fontSize: 14 },
  warn:  { padding: '10px 16px', borderRadius: 10, border: 'none', background: '#f59e0b', color: '#111', fontWeight: 800, cursor: 'pointer', fontSize: 14 },
  ban:   { padding: '10px 16px', borderRadius: 10, border: 'none', background: '#dc2626', color: '#fff', fontWeight: 800, cursor: 'pointer', fontSize: 14 },
  chip:  { padding: '5px 10px', borderRadius: 999, background: '#f3f4f6', border: '1px solid #e5e7eb', fontSize: 12 },
  h2:    { fontSize: 20, fontWeight: 900, marginTop: 28, marginBottom: 14, color: '#0f172a' },
  label: { fontWeight: 700, fontSize: 13, marginBottom: 6, display: 'block', color: '#374151' }
}

function clonePlans() { return JSON.parse(JSON.stringify(PLAN_DEFS)) }
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
function byStatus(items, status) { return items.filter(i => (i.status || 'pending') === status) }
function statusBg(s) {
  if (s === 'open' || s === 'pending')    return '#fef3c7'
  if (s === 'warning-issued' || s === 'approved') return '#dbeafe'
  if (s === 'banned' || s === 'declined') return '#fee2e2'
  return '#e5e7eb'
}

// ─────────────────────────────────────
// Section List Component
// ─────────────────────────────────────
function SectionList({ title, items, selectedId, onSelect, emptyText, subtitle }) {
  return (
    <div style={S.card}>
      <h3 style={{ marginTop: 0, marginBottom: 4, fontSize: 16 }}>{title}</h3>
      {subtitle && <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 10 }}>{subtitle}</div>}
      <div style={S.list}>
        {items.length === 0
          ? <div style={{ padding: 14, color: '#6b7280', fontSize: 14 }}>{emptyText}</div>
          : items.map(item => (
            <button key={item.id} onClick={() => onSelect(item.id)} style={{
              width: '100%', textAlign: 'left', padding: 14, border: 'none',
              borderBottom: '1px solid #f1f5f9',
              background: item.id === selectedId ? '#eff6ff' : '#fff', cursor: 'pointer'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 14 }}>{item.name || item.reportedName || 'Anonymous'}</strong>
                <span style={{ fontSize: 11, padding: '3px 8px', borderRadius: 999, background: statusBg(item.status) }}>
                  {item.status || 'pending'}
                </span>
              </div>
              <div style={{ color: '#6b7280', marginTop: 4, fontSize: 13 }}>
                {item.planLabel || item.planId || item.reason || (item.selectedReasons || []).slice(0, 2).join(' • ') || '—'}
              </div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{fmt(item.createdAt)}</div>
            </button>
          ))
        }
      </div>
    </div>
  )
}

// ─────────────────────────────────────
// Stat Card
// ─────────────────────────────────────
function StatCard({ label, value, sub, color }) {
  return (
    <div style={{ ...S.card, textAlign: 'center', padding: 16 }}>
      <div style={{ color: '#6b7280', fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 32, fontWeight: 900, color: color || '#0f172a', marginTop: 4 }}>{value}</div>
      {sub && <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{sub}</div>}
    </div>
  )
}

// ─────────────────────────────────────
// Main Admin Page
// ─────────────────────────────────────
export default function AdminPage() {
  const [user, setUser]                     = useState(null)
  const [reports, setReports]               = useState([])
  const [requests, setRequests]             = useState([])
  const [plans, setPlans]                   = useState(clonePlans())
  const [liveHours, setLiveHours]           = useState(DEFAULT_LIVE_HOURS)
  const [selectedReportId, setSelectedReportId]   = useState(null)
  const [selectedRequestId, setSelectedRequestId] = useState(null)
  const [selectedUser, setSelectedUser]     = useState(null)
  const [note, setNote]                     = useState('')
  const [busy, setBusy]                     = useState(false)
  const [msg, setMsg]                       = useState('')
  const [activeTab, setActiveTab]           = useState('requests') // requests | reports | users | plans | hours

  // User lookup state
  const [userQuery, setUserQuery]           = useState('')
  const [userResults, setUserResults]       = useState([])
  const [lookedUpUser, setLookedUpUser]     = useState(null)
  const [userSearchBusy, setUserSearchBusy] = useState(false)
  const [bonusOOO, setBonusOOO]             = useState(3)
  const [bonusGroup, setBonusGroup]         = useState(3)
  const [grantPlanId, setGrantPlanId]       = useState('monthly_99')

  // Stats state
  const [totalUsers, setTotalUsers]         = useState('—')
  const [paidUsers, setPaidUsers]           = useState('—')
  const [totalRevenue, setTotalRevenue]     = useState('—')

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setUser(u || null))
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'reports'), snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setReports(arr)
      setSelectedReportId(prev => prev && arr.some(r => r.id === prev) ? prev : arr[0]?.id || null)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'subscriptionRequests'), snap => {
      const arr = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
      setRequests(arr)
      setSelectedRequestId(prev => prev && arr.some(r => r.id === prev) ? prev : arr[0]?.id || null)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'plans'), snap => {
      const next = clonePlans()
      snap.docs.forEach(d => { next[d.id] = { ...(next[d.id] || {}), ...d.data(), id: d.id } })
      setPlans(next)
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'siteConfig', 'liveHours'), snap => {
      setLiveHours(snap.exists() ? normalizeLiveHours(snap.data()) : DEFAULT_LIVE_HOURS)
    })
    return () => unsub()
  }, [])

  // ── Stats loader ──
  useEffect(() => {
    if (!user || user.uid !== ADMIN_UID) return
    async function loadStats() {
      try {
        // Count approved requests for revenue
        const approvedSnap = await getDocs(query(collection(db, 'subscriptionRequests'), where('status', '==', 'approved')))
        let revenue = 0
        approvedSnap.docs.forEach(d => { revenue += Number(d.data().amount || 0) })
        setTotalRevenue(`₹${revenue}`)
        setPaidUsers(approvedSnap.docs.length)
      } catch {}
    }
    loadStats()
  }, [user])

  // ── User search ──
  async function searchUsers() {
    if (!userQuery.trim()) return
    setUserSearchBusy(true)
    try {
      const q = userQuery.trim().toLowerCase()
      // Search by email first
      const emailSnap = await getDocs(query(collection(db, 'users'), where('email', '>=', q), where('email', '<=', q + '\uf8ff'), limit(10)))
      const nameSnap  = await getDocs(query(collection(db, 'users'), where('name', '>=', userQuery.trim()), where('name', '<=', userQuery.trim() + '\uf8ff'), limit(10)))
      const combined  = new Map()
      ;[...emailSnap.docs, ...nameSnap.docs].forEach(d => combined.set(d.id, { id: d.id, ...d.data() }))
      setUserResults([...combined.values()])
    } catch (e) {
      console.error(e)
    } finally {
      setUserSearchBusy(false)
    }
  }

  async function loadUserById(uid) {
    try {
      const snap = await getDoc(doc(db, 'users', uid))
      if (snap.exists()) setLookedUpUser({ id: snap.id, ...snap.data() })
    } catch {}
  }

  // ── Grant bonus sessions manually ──
  async function grantBonusSessions() {
    if (!lookedUpUser) return
    setBusy(true)
    try {
      const ref = doc(db, 'users', lookedUpUser.id)
      const snap = await getDoc(ref)
      if (!snap.exists()) { alert('User not found'); return }
      const data = snap.data()
      await updateDoc(ref, {
        freeOneOnOneRemaining: (data.freeOneOnOneRemaining || 0) + Number(bonusOOO),
        freeGroupRemaining:    (data.freeGroupRemaining || 0)    + Number(bonusGroup),
        updatedAt: serverTimestamp()
      })
      setMsg(`✅ Added ${bonusOOO} 1-on-1 + ${bonusGroup} group sessions to ${lookedUpUser.name || lookedUpUser.email}`)
      await loadUserById(lookedUpUser.id)
    } catch (e) { alert('Failed: ' + e.message) }
    finally { setBusy(false) }
  }

  // ── Grant plan directly to user ──
  async function grantPlanToUser() {
    if (!lookedUpUser) return
    setBusy(true)
    try {
      const plan   = plans[grantPlanId] || getPlanDefinition(grantPlanId)
      const expiry = planExpiryFromPlanId(grantPlanId)
      await setDoc(doc(db, 'users', lookedUpUser.id), {
        planId:      grantPlanId,
        planLabel:   plan.label,
        planType:    'paid',
        planStatus:  'active',
        accountStatus: 'active',
        planExpiresAt: expiry,
        updatedAt:   serverTimestamp()
      }, { merge: true })
      setMsg(`✅ Plan ${plan.label} granted to ${lookedUpUser.name || lookedUpUser.email}`)
      await loadUserById(lookedUpUser.id)
    } catch (e) { alert('Failed: ' + e.message) }
    finally { setBusy(false) }
  }

  // ── Unban user ──
  async function unbanUser(uid) {
    if (!uid) return
    setBusy(true)
    try {
      await updateDoc(doc(db, 'users', uid), { accountStatus: 'active', updatedAt: serverTimestamp() })
      setMsg('✅ User unbanned')
      if (lookedUpUser?.id === uid) await loadUserById(uid)
    } catch (e) { alert('Failed: ' + e.message) }
    finally { setBusy(false) }
  }

  // ── Grant streak shield ──
  async function grantStreakShield(uid) {
    if (!uid) return
    setBusy(true)
    try {
      const snap = await getDoc(doc(db, 'users', uid))
      if (!snap.exists()) { alert('User not found'); return }
      const current = snap.data().streakShieldsRemaining || 0
      await updateDoc(doc(db, 'users', uid), { streakShieldsRemaining: current + 1, updatedAt: serverTimestamp() })
      setMsg('✅ Streak shield granted')
      if (lookedUpUser?.id === uid) await loadUserById(uid)
    } catch (e) { alert('Failed: ' + e.message) }
    finally { setBusy(false) }
  }

  // ── Report actions ──
  const selectedReport = useMemo(() => reports.find(r => r.id === selectedReportId) || null, [reports, selectedReportId])
  const selectedRequest = useMemo(() => requests.find(r => r.id === selectedRequestId) || null, [requests, selectedRequestId])

  useEffect(() => {
    async function load() {
      if (!selectedReport?.reportedUid) { setSelectedUser(null); return }
      const snap = await getDoc(doc(db, 'users', selectedReport.reportedUid))
      setSelectedUser(snap.exists() ? { id: snap.id, ...snap.data() } : { warningCount: 0, accountStatus: 'active' })
    }
    load()
  }, [selectedReport?.reportedUid])

  function flash(m) { setMsg(m); setTimeout(() => setMsg(''), 4000) }

  async function declineReport() {
    if (!selectedReport) return
    setBusy(true)
    try {
      await updateDoc(doc(db, 'reports', selectedReport.id), { status: 'declined', adminAction: 'decline', reviewedBy: ADMIN_UID, reviewedAt: serverTimestamp(), adminNote: note.trim() })
      flash('Report declined.'); setNote('')
    } catch (e) { alert('Failed: ' + e.message) } finally { setBusy(false) }
  }

  async function warnUser() {
    if (!selectedReport?.reportedUid) return
    setBusy(true)
    try {
      const userRef = doc(db, 'users', selectedReport.reportedUid)
      const snap    = await getDoc(userRef)
      const current = snap.exists() ? (snap.data().warningCount || 0) : 0
      const next    = current + 1
      await setDoc(userRef, { warningCount: next, accountStatus: 'active', lastWarningAt: serverTimestamp(), lastWarningReportId: selectedReport.id, lastWarningReason: selectedReport.selectedReasons || [] }, { merge: true })
      await updateDoc(doc(db, 'reports', selectedReport.id), { status: 'warning-issued', adminAction: 'warning', reviewedBy: ADMIN_UID, reviewedAt: serverTimestamp(), warningCountBefore: current, warningCountAfter: next, adminNote: note.trim() })
      flash(`Warning issued. User now has ${next} warning(s).`); setNote('')
      setSelectedUser(prev => prev ? { ...prev, warningCount: next } : prev)
    } catch (e) { alert('Failed: ' + e.message) } finally { setBusy(false) }
  }

  async function banUser() {
    if (!selectedReport?.reportedUid) return
    setBusy(true)
    try {
      const userRef = doc(db, 'users', selectedReport.reportedUid)
      const snap    = await getDoc(userRef)
      const current = snap.exists() ? (snap.data().warningCount || 0) : 0
      await setDoc(userRef, { accountStatus: 'banned', bannedAt: serverTimestamp(), bannedBy: ADMIN_UID, bannedReason: selectedReport.selectedReasons || [], bannedFromReportId: selectedReport.id }, { merge: true })
      await updateDoc(doc(db, 'reports', selectedReport.id), { status: 'banned', adminAction: 'ban', reviewedBy: ADMIN_UID, reviewedAt: serverTimestamp(), warningCountBefore: current, adminNote: note.trim() })
      flash('User banned.'); setNote('')
      setSelectedUser(prev => prev ? { ...prev, accountStatus: 'banned' } : prev)
    } catch (e) { alert('Failed: ' + e.message) } finally { setBusy(false) }
  }

  async function grantPlanAction() {
    if (!selectedRequest) return
    setBusy(true)
    try {
      const reqRef  = doc(db, 'subscriptionRequests', selectedRequest.id)
      const planId  = selectedRequest.planId
      const plan    = plans[planId] || getPlanDefinition(planId)
      const planRef = doc(db, 'plans', planId)
      const userRef = doc(db, 'users', selectedRequest.uid)
      const expiry  = planExpiryFromPlanId(planId)

      await runTransaction(db, async tx => {
        const reqSnap  = await tx.get(reqRef)
        if (!reqSnap.exists()) throw new Error('request-missing')
        if ((reqSnap.data().status || 'pending') !== 'pending') throw new Error('already-processed')

        const planSnap  = await tx.get(planRef)
        const livePlan  = planSnap.exists() ? planSnap.data() : plan

        if (livePlan.isSpecial || plan.isSpecial) {
          const sold  = Number(livePlan.salesCount || 0)
          const limit = Number(livePlan.salesLimit || 100)
          if (sold >= limit) throw new Error('special-plan-sold-out')
          tx.set(planRef, { salesCount: sold + 1, updatedAt: serverTimestamp() }, { merge: true })
        }

        tx.set(userRef, {
          uid:           selectedRequest.uid,
          name:          selectedRequest.name || '',
          email:         selectedRequest.email || '',
          planId,
          planLabel:     livePlan.label || plan.label || 'Paid plan',
          planType:      'paid',
          planStatus:    'active',
          accountStatus: 'active',
          planExpiresAt: expiry,
          updatedAt:     serverTimestamp()
        }, { merge: true })

        tx.set(reqRef, {
          status:         'approved',
          reviewedBy:     ADMIN_UID,
          reviewedAt:     serverTimestamp(),
          planGrantedAt:  serverTimestamp(),
          planExpiresAt:  expiry,
          adminNote:      note.trim()
        }, { merge: true })
      })

      flash('✅ Plan granted!'); setNote('')
    } catch (e) { alert('Failed: ' + e.message) } finally { setBusy(false) }
  }

  async function declineRequest() {
    if (!selectedRequest) return
    setBusy(true)
    try {
      await updateDoc(doc(db, 'subscriptionRequests', selectedRequest.id), { status: 'declined', reviewedBy: ADMIN_UID, reviewedAt: serverTimestamp(), adminNote: note.trim() })
      flash('Request declined.'); setNote('')
    } catch (e) { alert('Failed') } finally { setBusy(false) }
  }

  async function savePlan(planId) {
    setBusy(true)
    try {
      const plan = plans[planId] || getPlanDefinition(planId)
      await setDoc(doc(db, 'plans', planId), { ...plan, updatedAt: serverTimestamp() }, { merge: true })
      flash(`Saved ${plan.label || planId}.`)
    } catch (e) { alert('Failed') } finally { setBusy(false) }
  }

  async function saveLiveHours() {
    setBusy(true)
    try {
      await setDoc(doc(db, 'siteConfig', 'liveHours'), normalizeLiveHours(liveHours), { merge: true })
      flash('Live hours saved.')
    } catch (e) { alert('Failed') } finally { setBusy(false) }
  }

  // ── Auth gate ──
  if (!user) return (
    <div style={{ ...S.page, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 48, marginBottom: 16 }}>🔐</div>
        <h1>Admin Panel</h1>
        <button onClick={() => signInWithPopup(auth, googleProvider).catch(() => alert('Sign in failed'))} style={S.blue}>
          Sign in with Google
        </button>
      </div>
    </div>
  )

  if (user.uid !== ADMIN_UID) return (
    <div style={{ ...S.page, textAlign: 'center', paddingTop: 80 }}>
      <div style={{ fontSize: 48 }}>🚫</div>
      <h1>Not authorized</h1>
      <p style={{ color: '#6b7280' }}>This account does not have admin access.</p>
      <button onClick={() => signOut(auth)} style={S.gray}>Sign out</button>
    </div>
  )

  const liveStatus   = getLiveHoursStatus(liveHours)
  const reportNew    = byStatus(reports, 'open')
  const reqNew       = byStatus(requests, 'pending')
  const reqGranted   = byStatus(requests, 'approved')
  const reqDeclined  = byStatus(requests, 'declined')
  const reportWarned = byStatus(reports, 'warning-issued')
  const reportBanned = byStatus(reports, 'banned')

  const tabs = [
    { id: 'requests', label: `💳 Payments (${reqNew.length})` },
    { id: 'reports',  label: `🚨 Reports (${reportNew.length})` },
    { id: 'users',    label: '👤 Users' },
    { id: 'plans',    label: '📦 Plans & QR' },
    { id: 'hours',    label: '🕐 Live Hours' },
  ]

  return (
    <div style={S.page}>

      {/* TOP */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12, marginBottom: 20 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900 }}>⚙️ FocusDuo Admin</h1>
          <div style={{ color: '#6b7280', marginTop: 4, fontSize: 14 }}>Signed in as {user.email}</div>
        </div>
        <button onClick={() => signOut(auth)} style={S.gray}>Sign out</button>
      </div>

      {/* STATS ROW */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
        <StatCard label="Pending Payments" value={reqNew.length}    color={reqNew.length > 0 ? '#dc2626' : '#16a34a'} />
        <StatCard label="Total Revenue"    value={totalRevenue}     color="#2563eb" />
        <StatCard label="Paid Users"       value={paidUsers}        color="#7c3aed" />
        <StatCard label="Open Reports"     value={reportNew.length} color={reportNew.length > 0 ? '#f59e0b' : '#16a34a'} />
        <StatCard label="Live Status"      value={liveStatus.open ? '🟢 Open' : '🔴 Closed'} />
      </div>

      {/* Flash message */}
      {msg && (
        <div style={{ padding: '12px 16px', borderRadius: 12, background: '#ecfdf5', border: '1px solid #6ee7b7', color: '#065f46', fontWeight: 700, marginBottom: 16 }}>
          {msg}
        </div>
      )}

      {/* TABS */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)} style={{
            padding: '9px 16px', borderRadius: 10, fontWeight: 700, fontSize: 13, cursor: 'pointer',
            border: activeTab === t.id ? 'none' : '1px solid #e5e7eb',
            background: activeTab === t.id ? '#2563eb' : '#fff',
            color: activeTab === t.id ? '#fff' : '#374151'
          }}>{t.label}</button>
        ))}
      </div>

      {/* ─────── TAB: PAYMENTS ─────── */}
      {activeTab === 'requests' && (
        <>
          <div style={S.grid2}>
            <SectionList title={`Pending (${reqNew.length})`} items={reqNew} selectedId={selectedRequestId} onSelect={setSelectedRequestId} emptyText="No pending requests." subtitle="Needs your approval." />
            <SectionList title={`Approved (${reqGranted.length})`} items={reqGranted} selectedId={selectedRequestId} onSelect={setSelectedRequestId} emptyText="No approved requests." subtitle="Already granted." />
          </div>

          <div style={{ ...S.card, marginTop: 16 }}>
            {!selectedRequest
              ? <div style={{ color: '#6b7280' }}>Select a payment request from the list above.</div>
              : <>
                  <h2 style={{ marginTop: 0 }}>{selectedRequest.name || 'Anonymous'}</h2>
                  <div style={{ color: '#6b7280', marginBottom: 14 }}>{selectedRequest.email}</div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 10, marginBottom: 14 }}>
                    {[
                      ['Plan', selectedRequest.planLabel || selectedRequest.planId],
                      ['UTR / Transaction ID', selectedRequest.utr],
                      ['Amount', `₹${selectedRequest.amount ?? '—'}`],
                      ['Status', selectedRequest.status || 'pending'],
                      ['Submitted', fmt(selectedRequest.createdAt)],
                    ].map(([k, v]) => (
                      <div key={k} style={{ padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                        <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{k}</div>
                        <div style={{ fontWeight: 800, marginTop: 3 }}>{v || '—'}</div>
                      </div>
                    ))}
                  </div>

                  <label style={S.label}>Admin note (optional)</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Reason or note" style={{ ...S.ta, marginBottom: 14 }} />

                  <div style={S.row}>
                    <button onClick={grantPlanAction} disabled={busy || selectedRequest.status !== 'pending'} style={S.blue}>
                      ✅ Grant plan
                    </button>
                    <button onClick={declineRequest} disabled={busy || selectedRequest.status !== 'pending'} style={S.gray}>
                      ❌ Decline
                    </button>
                    {selectedRequest.status !== 'pending' && (
                      <span style={{ color: '#94a3b8', fontSize: 13 }}>Already {selectedRequest.status}</span>
                    )}
                  </div>
                </>
            }
          </div>

          <div style={S.grid2}>
            <SectionList title={`Declined (${reqDeclined.length})`} items={reqDeclined} selectedId={selectedRequestId} onSelect={setSelectedRequestId} emptyText="No declined requests." subtitle="" />
            <div />
          </div>
        </>
      )}

      {/* ─────── TAB: REPORTS ─────── */}
      {activeTab === 'reports' && (
        <>
          <div style={S.grid2}>
            <SectionList title={`New reports (${reportNew.length})`} items={reportNew} selectedId={selectedReportId} onSelect={setSelectedReportId} emptyText="No new reports." subtitle="Waiting for action." />
            <SectionList title={`Warned (${reportWarned.length})`} items={reportWarned} selectedId={selectedReportId} onSelect={setSelectedReportId} emptyText="No warned reports." subtitle="" />
          </div>

          <div style={{ ...S.card, marginTop: 16 }}>
            {!selectedReport
              ? <div style={{ color: '#6b7280' }}>Select a report from the list above.</div>
              : <>
                  <h2 style={{ marginTop: 0 }}>Report: {selectedReport.reportedName || 'Unknown user'}</h2>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
                    <div style={{ padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>REPORTER</div>
                      <div style={{ fontWeight: 700, marginTop: 3 }}>{selectedReport.reporterName || 'Anonymous'}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{selectedReport.reporterUid}</div>
                    </div>
                    <div style={{ padding: 12, borderRadius: 10, background: '#fef2f2', border: '1px solid #fecaca' }}>
                      <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>REPORTED</div>
                      <div style={{ fontWeight: 700, marginTop: 3 }}>{selectedReport.reportedName || 'Unknown'}</div>
                      <div style={{ fontSize: 12, color: '#94a3b8' }}>{selectedReport.reportedUid}</div>
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>Reasons</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {(selectedReport.selectedReasons || []).length > 0
                        ? selectedReport.selectedReasons.map(x => <span key={x} style={S.chip}>{x}</span>)
                        : <span style={{ color: '#94a3b8', fontSize: 13 }}>No reasons given.</span>
                      }
                    </div>
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <label style={S.label}>Details</label>
                    <div style={{ padding: 12, borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb', whiteSpace: 'pre-wrap', fontSize: 14 }}>
                      {selectedReport.details || 'No additional text.'}
                    </div>
                  </div>

                  {selectedUser && (
                    <div style={{ padding: 12, borderRadius: 10, background: '#fff7ed', border: '1px solid #fed7aa', marginBottom: 12 }}>
                      <strong>Reported user:</strong> {selectedUser.warningCount ?? 0} warning(s) •
                      Status: <strong>{selectedUser.accountStatus || 'active'}</strong>
                      {selectedUser.accountStatus === 'banned' && (
                        <button onClick={() => unbanUser(selectedReport.reportedUid)} style={{ ...S.green, marginLeft: 10, padding: '5px 12px', fontSize: 12 }}>Unban</button>
                      )}
                    </div>
                  )}

                  <label style={S.label}>Admin note</label>
                  <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="Optional note" style={{ ...S.ta, marginBottom: 14 }} />

                  <div style={S.row}>
                    <button onClick={declineReport} disabled={busy} style={S.gray}>Dismiss</button>
                    <button onClick={warnUser}      disabled={busy} style={S.warn}>⚠️ Warn user</button>
                    <button onClick={banUser}       disabled={busy} style={S.ban}>🚫 Ban user</button>
                  </div>
                </>
            }
          </div>

          <div style={S.grid2}>
            <SectionList title={`Banned (${reportBanned.length})`} items={reportBanned} selectedId={selectedReportId} onSelect={setSelectedReportId} emptyText="No banned reports." subtitle="" />
            <div />
          </div>
        </>
      )}

      {/* ─────── TAB: USER MANAGEMENT ─────── */}
      {activeTab === 'users' && (
        <div style={S.card}>
          <h2 style={{ marginTop: 0 }}>User lookup</h2>
          <p style={{ color: '#6b7280', fontSize: 14, marginBottom: 16 }}>
            Search by email or name. Then manually fix credits, grant plans, add streak shields, or unban.
          </p>

          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <input
              value={userQuery}
              onChange={e => setUserQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && searchUsers()}
              placeholder="Search by email or name..."
              style={{ ...S.input, flex: 1 }}
            />
            <button onClick={searchUsers} disabled={userSearchBusy} style={S.blue}>
              {userSearchBusy ? 'Searching...' : '🔍 Search'}
            </button>
          </div>

          {userResults.length > 0 && (
            <div style={{ ...S.list, marginBottom: 16, maxHeight: 200 }}>
              {userResults.map(u => (
                <button key={u.id} onClick={() => { setLookedUpUser(u); setUserResults([]) }} style={{
                  width: '100%', textAlign: 'left', padding: 12, border: 'none',
                  borderBottom: '1px solid #f1f5f9', background: '#fff', cursor: 'pointer'
                }}>
                  <div style={{ fontWeight: 700 }}>{u.name || 'No name'}</div>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{u.email} • {u.planLabel || 'Free'} • {u.accountStatus || 'active'}</div>
                </button>
              ))}
            </div>
          )}

          {lookedUpUser && (
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 14, padding: 18 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 16 }}>
                <div>
                  <div style={{ fontSize: 20, fontWeight: 900 }}>{lookedUpUser.name || 'No name'}</div>
                  <div style={{ color: '#6b7280', fontSize: 14 }}>{lookedUpUser.email}</div>
                  <div style={{ color: '#6b7280', fontSize: 13, marginTop: 2 }}>UID: {lookedUpUser.id}</div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {lookedUpUser.accountStatus === 'banned' && (
                    <button onClick={() => unbanUser(lookedUpUser.id)} style={S.green}>✅ Unban</button>
                  )}
                  <button onClick={() => setLookedUpUser(null)} style={S.gray}>Clear</button>
                </div>
              </div>

              {/* User stats grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px,1fr))', gap: 10, marginBottom: 20 }}>
                {[
                  ['Plan', lookedUpUser.planLabel || 'Free'],
                  ['Plan type', lookedUpUser.planType || 'free'],
                  ['Status', lookedUpUser.accountStatus || 'active'],
                  ['1-on-1 left', lookedUpUser.freeOneOnOneRemaining ?? '—'],
                  ['Group left', lookedUpUser.freeGroupRemaining ?? '—'],
                  ['Streak', `${lookedUpUser.streakDays ?? 0} days`],
                  ['Sessions done', lookedUpUser.sessionsCompleted ?? 0],
                  ['Warnings', lookedUpUser.warningCount ?? 0],
                  ['Shield left', lookedUpUser.streakShieldsRemaining ?? 0],
                  ['Referral code', lookedUpUser.referralCode || '—'],
                  ['Referred by', lookedUpUser.referredBy || 'None'],
                  ['Plan expires', fmt(lookedUpUser.planExpiresAt)],
                ].map(([k, v]) => (
                  <div key={k} style={{ padding: 10, borderRadius: 10, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                    <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase' }}>{k}</div>
                    <div style={{ fontWeight: 800, fontSize: 14, marginTop: 3 }}>{String(v)}</div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>

                {/* Bonus sessions */}
                <div style={{ padding: 14, borderRadius: 12, background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>➕ Add bonus sessions</div>
                  <label style={S.label}>1-on-1 sessions to add</label>
                  <input type="number" min={0} max={50} value={bonusOOO} onChange={e => setBonusOOO(e.target.value)} style={{ ...S.input, marginBottom: 10 }} />
                  <label style={S.label}>Group sessions to add</label>
                  <input type="number" min={0} max={50} value={bonusGroup} onChange={e => setBonusGroup(e.target.value)} style={{ ...S.input, marginBottom: 10 }} />
                  <button onClick={grantBonusSessions} disabled={busy} style={S.green}>Add sessions</button>
                </div>

                {/* Grant plan directly */}
                <div style={{ padding: 14, borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                  <div style={{ fontWeight: 800, marginBottom: 10 }}>⭐ Grant plan directly</div>
                  <label style={S.label}>Plan to grant</label>
                  <select value={grantPlanId} onChange={e => setGrantPlanId(e.target.value)} style={{ ...S.input, marginBottom: 10 }}>
                    {['monthly_99', 'quarterly_199', 'yearly_699', 'first100_year_199'].map(id => (
                      <option key={id} value={id}>{plans[id]?.label || id}</option>
                    ))}
                  </select>
                  <button onClick={grantPlanToUser} disabled={busy} style={S.blue}>Grant plan</button>
                  <div style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>
                    Use for manual transfers or free access grants.
                  </div>
                </div>

                {/* Streak shield */}
                <div style={{ padding: 14, borderRadius: 12, background: '#fefce8', border: '1px solid #fde68a' }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>🛡️ Grant streak shield</div>
                  <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 10 }}>Adds 1 streak shield to this user's account.</div>
                  <button onClick={() => grantStreakShield(lookedUpUser.id)} disabled={busy} style={S.warn}>Grant shield</button>
                </div>

                {/* Quick links */}
                <div style={{ padding: 14, borderRadius: 12, background: '#f8fafc', border: '1px solid #e5e7eb' }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>🔗 Quick actions</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {lookedUpUser.accountStatus !== 'banned'
                      ? <button onClick={() => { setActiveTab('reports'); }} style={S.gray}>Go to reports</button>
                      : <button onClick={() => unbanUser(lookedUpUser.id)} style={S.green}>✅ Unban user</button>
                    }
                    <button onClick={() => loadUserById(lookedUpUser.id)} style={S.gray}>🔄 Refresh data</button>
                  </div>
                </div>

              </div>
            </div>
          )}
        </div>
      )}

      {/* ─────── TAB: PLANS & QR ─────── */}
      {activeTab === 'plans' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px,1fr))', gap: 16 }}>
          {['monthly_99', 'quarterly_199', 'yearly_699', 'first100_year_199'].map(id => {
            const plan = plans[id] || getPlanDefinition(id)
            return (
              <div key={id} style={S.card}>
                <div style={{ fontWeight: 900, fontSize: 17 }}>{plan.label || id}</div>
                <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 14 }}>₹{plan.priceINR ?? 0} • {plan.durationDays ?? 0} days</div>

                <label style={S.label}>UPI ID</label>
                <input value={plan.upiId || ''} onChange={e => setPlans(prev => ({ ...prev, [id]: { ...(prev[id]||{}), upiId: e.target.value, id } }))} style={{ ...S.input, marginBottom: 12 }} placeholder="yourname@upi" />

                <label style={S.label}>QR display text</label>
                <textarea value={plan.qrText || ''} onChange={e => setPlans(prev => ({ ...prev, [id]: { ...(prev[id]||{}), qrText: e.target.value, id } }))} style={{ ...S.ta, marginBottom: 12 }} placeholder="Payment instructions..." />

                <label style={S.label}>Upload QR image</label>
                <input type="file" accept="image/*" onChange={e => {
                  const file = e.target.files?.[0]; if (!file) return
                  const reader = new FileReader()
                  reader.onload = async () => {
                    const dataUrl = String(reader.result || '')
                    setPlans(prev => ({ ...prev, [id]: { ...(prev[id]||{}), qrImageUrl: dataUrl, id } }))
                    await setDoc(doc(db, 'plans', id), { ...(plans[id] || getPlanDefinition(id)), qrImageUrl: dataUrl, updatedAt: serverTimestamp() }, { merge: true })
                    flash(`QR uploaded for ${id}.`)
                  }
                  reader.readAsDataURL(file)
                }} style={{ ...S.input, marginBottom: 12 }} />

                <label style={S.label}>QR image URL</label>
                <input value={plan.qrImageUrl || ''} onChange={e => setPlans(prev => ({ ...prev, [id]: { ...(prev[id]||{}), qrImageUrl: e.target.value, id } }))} style={{ ...S.input, marginBottom: 12 }} placeholder="https://..." />

                {plan.qrImageUrl && <img src={plan.qrImageUrl} alt="QR" style={{ width: '100%', borderRadius: 12, border: '1px solid #e5e7eb', marginBottom: 12 }} />}

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
                  <input type="checkbox" checked={plan.enabled !== false} onChange={e => setPlans(prev => ({ ...prev, [id]: { ...(prev[id]||{}), enabled: e.target.checked, id } }))} />
                  <span style={{ fontWeight: 700 }}>Plan enabled</span>
                </label>

                <button onClick={() => savePlan(id)} disabled={busy} style={S.blue}>Save plan</button>
              </div>
            )
          })}
        </div>
      )}

      {/* ─────── TAB: LIVE HOURS ─────── */}
      {activeTab === 'hours' && (
        <div style={S.card}>
          <h2 style={{ marginTop: 0 }}>Live hours</h2>
          <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: liveStatus.open ? '#ecfdf5' : '#fef3c7', border: '1px solid #e5e7eb', fontWeight: 700 }}>
            {liveStatus.open ? '🟢' : '🔴'} {liveStatus.label} — {liveStatus.message}
          </div>

          <div style={{ ...S.row, marginBottom: 16 }}>
            <button onClick={() => setLiveHours(prev => ({ ...normalizeLiveHours(prev), is247: true }))}  style={liveHours.is247 ? S.blue : S.gray}>🌐 24/7 mode</button>
            <button onClick={() => setLiveHours(prev => ({ ...normalizeLiveHours(prev), is247: false }))} style={!liveHours.is247 ? S.blue : S.gray}>🕐 Slot mode</button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, opacity: liveHours.is247 ? 0.4 : 1, marginBottom: 16 }}>
            {[0, 1].map(i => (
              <div key={i} style={{ padding: 14, border: '1px solid #e5e7eb', borderRadius: 12 }}>
                <div style={{ fontWeight: 800, marginBottom: 10 }}>Slot {i + 1}</div>
                <label style={S.label}>Start time</label>
                <input type="time" value={liveHours.slots?.[i]?.start || DEFAULT_LIVE_HOURS.slots[i].start}
                  onChange={e => setLiveHours(prev => { const next = normalizeLiveHours(prev); next.slots[i].start = e.target.value; return next })}
                  disabled={liveHours.is247} style={{ ...S.input, marginBottom: 12 }} />
                <label style={S.label}>End time</label>
                <input type="time" value={liveHours.slots?.[i]?.end || DEFAULT_LIVE_HOURS.slots[i].end}
                  onChange={e => setLiveHours(prev => { const next = normalizeLiveHours(prev); next.slots[i].end = e.target.value; return next })}
                  disabled={liveHours.is247} style={{ ...S.input }} />
              </div>
            ))}
          </div>

          <button onClick={saveLiveHours} disabled={busy} style={S.blue}>Save live hours</button>
        </div>
      )}

    </div>
  )
}
