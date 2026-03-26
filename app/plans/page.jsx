'use client'

import { useEffect, useMemo, useState } from 'react'
import { auth, googleProvider, db } from '../../lib/firebase'
import { signInWithPopup, signOut } from 'firebase/auth'
import { collection, onSnapshot } from 'firebase/firestore'
import {
  PLAN_DEFS,
  createSubscriptionRequest,
  ensureUserProfile,
  getEffectivePlanId,
  remainingForMode,
  getPlanDefinition
} from '../../lib/subscriptions'

function clonePlanDefs() {
  return JSON.parse(JSON.stringify(PLAN_DEFS))
}

// ————————————————————————————————————————
// Free vs Paid Comparison Table
// ————————————————————————————————————————
function ComparisonTable() {
  const rows = [
    { feature: '1-on-1 sessions',      free: '10 total',     paid: 'Unlimited' },
    { feature: 'Group sessions',        free: '10 total',     paid: 'Unlimited' },
    { feature: 'Session length',        free: '30 min max',   paid: '30 min max' },
    { feature: 'Queue priority',        free: 'Normal queue', paid: '⚡ Matched first' },
    { feature: 'Session history',       free: 'Last 5 only',  paid: '✅ Full history' },
    { feature: 'Streak tracking',       free: '✅',           paid: '✅' },
    { feature: 'Video + chat',          free: '✅',           paid: '✅' },
    { feature: 'Report bad partners',   free: '✅',           paid: '✅' },
  ]

  return (
    <div style={{ overflowX: 'auto', marginBottom: 28 }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse',
        background: 'rgba(15,23,42,0.86)',
        border: '1px solid rgba(148,163,184,0.16)',
        borderRadius: 18, overflow: 'hidden'
      }}>
        <thead>
          <tr style={{ background: 'rgba(37,99,235,0.12)' }}>
            <th style={th}>Feature</th>
            <th style={{ ...th, color: '#94a3b8' }}>🆓 Free</th>
            <th style={{ ...th, color: '#fbbf24' }}>⭐ Paid</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ borderTop: '1px solid rgba(148,163,184,0.1)' }}>
              <td style={td}>{row.feature}</td>
              <td style={{ ...td, color: '#94a3b8', textAlign: 'center' }}>{row.free}</td>
              <td style={{ ...td, color: '#4ade80', textAlign: 'center', fontWeight: 700 }}>{row.paid}</td>
            </tr>
          ))}
          <tr style={{ borderTop: '1px solid rgba(148,163,184,0.1)', background: 'rgba(37,99,235,0.08)' }}>
            <td style={td}><strong>Price</strong></td>
            <td style={{ ...td, color: '#94a3b8', textAlign: 'center' }}>₹0 forever</td>
            <td style={{ ...td, color: '#fbbf24', textAlign: 'center', fontWeight: 900 }}>From ₹99/month</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

const th = {
  padding: '14px 18px', textAlign: 'center', fontWeight: 900,
  fontSize: 15, color: '#e2e8f0'
}
const td = {
  padding: '12px 18px', color: '#e2e8f0', fontSize: 14
}

// ————————————————————————————————————————
// Main Plans Page
// ————————————————————————————————————————
export default function PlansPage() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [plans, setPlans] = useState(clonePlanDefs())
  const [selectedPlanId, setSelectedPlanId] = useState('monthly_99')
  const [utr, setUtr] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async u => {
      setUser(u || null)
      if (u) {
        try {
          const p = await ensureUserProfile(u)
          setProfile(p)
        } catch {
          setProfile(null)
        }
      } else {
        setProfile(null)
      }
    })
    return () => unsub()
  }, [])

  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'plans'), snap => {
      const next = clonePlanDefs()
      snap.docs.forEach(d => {
        next[d.id] = { ...(next[d.id] || {}), ...d.data(), id: d.id }
      })
      setPlans(next)
    })
    return () => unsub()
  }, [])

  const selectedPlan = plans[selectedPlanId] || getPlanDefinition(selectedPlanId)
  const effectivePlanId = getEffectivePlanId(profile)
  const isPaid = profile ? effectivePlanId !== 'free' : false

  async function login() {
    try { await signInWithPopup(auth, googleProvider) }
    catch (err) { console.error(err); alert('Google sign in failed') }
  }

  async function logout() {
    try { await signOut(auth) }
    catch (err) { console.error(err) }
  }

  async function submitRequest() {
    if (!user) { await login(); return }

    if (!utr.trim()) { alert('Enter the UTR or transaction ID'); return }

    const plan = selectedPlan
    if (!plan || plan.enabled === false) { alert('This plan is not available'); return }

    if (plan.isSpecial && Number(plan.salesCount || 0) >= Number(plan.salesLimit || 100)) {
      alert('Special offer sold out')
      return
    }

    setSubmitting(true)
    setMessage('')
    try {
      await createSubscriptionRequest({
        uid: user.uid,
        name: user.displayName || user.email || 'Student',
        email: user.email || '',
        planId: plan.id,
        planLabel: plan.label,
        amount: Number(plan.priceINR || 0),
        utr: utr.trim(),
        upiId: plan.upiId || '',
        qrText: plan.qrText || '',
        qrImageUrl: plan.qrImageUrl || ''
      })
      setMessage('✅ Request submitted! Admin will review and activate your plan within 24 hours.')
      setUtr('')
    } catch (err) {
      console.error(err)
      alert('Failed to submit request. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const paidPlans = ['monthly_99', 'quarterly_199', 'yearly_699', 'first100_year_199']
    .map(id => plans[id] || PLAN_DEFS[id])

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: 24, color: '#e2e8f0', fontFamily: 'system-ui,sans-serif' }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 900 }}>Plans & Subscriptions</h1>
          <div style={{ color: '#94a3b8', marginTop: 6 }}>
            Manual payment via UPI. Pay → submit UTR → admin activates within 24h.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {!user
            ? <button onClick={login} style={btnBlue}>Sign in with Google</button>
            : <>
                <div style={pill}>👤 {user.displayName || user.email}</div>
                <button onClick={logout} style={btnGhost}>Log out</button>
              </>
          }
        </div>
      </div>

      {/* ── COMPARISON TABLE ── */}
      <div style={cardDark}>
        <h2 style={{ margin: '0 0 18px 0', fontSize: 20, fontWeight: 900 }}>
          What do you get with paid?
        </h2>
        <ComparisonTable />

        {isPaid && (
          <div style={{
            padding: '12px 16px', borderRadius: 12,
            background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.3)',
            fontWeight: 700, color: '#4ade80'
          }}>
            ✅ You are on the <strong>{profile?.planLabel}</strong> plan. Enjoy unlimited sessions!
          </div>
        )}
      </div>

      {/* ── Plan selector + Payment ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 18, marginTop: 18 }}>

        {/* Plan cards */}
        <div style={cardDark}>
          <h2 style={{ marginTop: 0, marginBottom: 16 }}>Pick a plan</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            {paidPlans.map(plan => {
              const soldOut = plan.isSpecial && Number(plan.salesCount || 0) >= Number(plan.salesLimit || 100)
              const active = selectedPlanId === plan.id
              const hasAnySales = Number(plan.salesCount || 0) > 0
              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  style={{
                    textAlign: 'left', padding: 18, borderRadius: 16,
                    border: active ? '2px solid #60a5fa' : '1px solid rgba(148,163,184,0.18)',
                    background: active ? 'rgba(37,99,235,0.16)' : 'rgba(255,255,255,0.04)',
                    color: '#e2e8f0', cursor: 'pointer', position: 'relative'
                  }}
                >
                  {plan.isSpecial && !soldOut && (
                    <div style={{
                      position: 'absolute', top: -10, right: 12,
                      background: '#f59e0b', color: '#000', fontSize: 11,
                      fontWeight: 900, padding: '3px 10px', borderRadius: 999
                    }}>
                      🔥 EARLY BIRD
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 17 }}>{plan.label}</div>
                    {soldOut && <div style={{ fontSize: 12, color: '#fda4af', fontWeight: 700 }}>Sold out</div>}
                  </div>
                  <div style={{ marginTop: 8, fontSize: 22, fontWeight: 900, color: '#fbbf24' }}>
                    ₹{plan.priceINR}
                  </div>
                  <div style={{ marginTop: 6, color: '#94a3b8', lineHeight: 1.6, fontSize: 14 }}>
                    {plan.description}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 13, color: '#4ade80', fontWeight: 700 }}>
                    ✅ Unlimited sessions
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: '#60a5fa', fontWeight: 700 }}>
                    ⚡ Priority matching
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: '#a78bfa', fontWeight: 700 }}>
                    📊 Full session history
                  </div>
                  {plan.isSpecial && hasAnySales && (
                    <div style={{ marginTop: 10, fontSize: 13, color: '#fde68a' }}>
                      {Number(plan.salesCount || 0)} / {Number(plan.salesLimit || 100)} claimed
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          {/* Payment details */}
          <div style={{ marginTop: 18, padding: 18, borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.16)' }}>
            <div style={{ fontWeight: 800, marginBottom: 12 }}>💳 Payment details</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div><strong>UPI ID:</strong> <span style={{ color: selectedPlan.upiId ? '#4ade80' : '#f87171' }}>{selectedPlan.upiId || 'Not set yet — check back soon'}</span></div>
              {selectedPlan.qrText && <div><strong>QR:</strong> {selectedPlan.qrText}</div>}
              {selectedPlan.qrImageUrl
                ? <img src={selectedPlan.qrImageUrl} alt="Payment QR" style={{ width: 200, borderRadius: 12, border: '1px solid rgba(148,163,184,0.18)', marginTop: 6 }} />
                : null
              }
              <div style={{ color: '#94a3b8', lineHeight: 1.7, fontSize: 14 }}>
                Pay the exact amount for your selected plan, then submit your UTR or transaction ID below. Your plan will be activated within 24 hours.
              </div>
            </div>
          </div>
        </div>

        {/* Submit payment */}
        <div style={cardDark}>
          <h2 style={{ marginTop: 0 }}>Submit payment</h2>

          {user ? (
            <>
              <div style={{ marginBottom: 16, padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.12)', lineHeight: 1.8, fontSize: 14 }}>
                <div>Plan: <strong style={{ color: isPaid ? '#4ade80' : '#e2e8f0' }}>{profile?.planLabel || 'Free'}</strong></div>
                <div>Account: <strong>{profile?.accountStatus || 'active'}</strong></div>
                <div>1-on-1 left: <strong>{remainingForMode(profile, 'one-on-one')}</strong></div>
                <div>Group left: <strong>{remainingForMode(profile, 'group')}</strong></div>
              </div>

              <label style={labelStyle}>
                Selected plan
                <select value={selectedPlanId} onChange={e => setSelectedPlanId(e.target.value)} style={inputStyle}>
                  {paidPlans.map(plan => (
                    <option key={plan.id} value={plan.id}>{plan.label} — ₹{plan.priceINR}</option>
                  ))}
                </select>
              </label>

              <label style={labelStyle}>
                UTR / Transaction ID
                <input
                  value={utr}
                  onChange={e => setUtr(e.target.value)}
                  placeholder="Enter your UTR or transaction ID"
                  style={inputStyle}
                />
              </label>

              <button onClick={submitRequest} disabled={submitting} style={{
                ...btnBlueBlock,
                opacity: submitting ? 0.7 : 1,
                cursor: submitting ? 'not-allowed' : 'pointer'
              }}>
                {submitting ? '⏳ Submitting...' : 'Submit payment request'}
              </button>

              {message && (
                <div style={{ marginTop: 12, padding: 12, borderRadius: 10, background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80', fontSize: 14 }}>
                  {message}
                </div>
              )}

              {/* Free plan rules */}
              <div style={{ marginTop: 18, padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.16)' }}>
                <div style={{ fontWeight: 800, marginBottom: 8 }}>🆓 Free plan rules</div>
                <div style={{ color: '#cbd5e1', lineHeight: 1.8, fontSize: 13 }}>
                  • 10 one-on-one sessions total<br />
                  • 10 group sessions total<br />
                  • First 2 minutes are for chapter selection<br />
                  • Leave within 2 minutes — credit not used<br />
                  • Free sessions end after 30 minutes automatically
                </div>
              </div>
            </>
          ) : (
            <div>
              <div style={{ color: '#94a3b8', lineHeight: 1.8, marginBottom: 16 }}>
                Sign in first to submit your payment request and activate your plan.
              </div>
              <button onClick={login} style={btnBlue}>Sign in with Google</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ——— Styles ———

const cardDark = {
  padding: 20, borderRadius: 18,
  background: 'rgba(15,23,42,0.86)',
  border: '1px solid rgba(148,163,184,0.16)',
  boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
}
const btnBlue = {
  padding: '10px 16px', borderRadius: 10, border: 'none',
  background: '#2563eb', color: '#fff', fontWeight: 800, cursor: 'pointer'
}
const btnBlueBlock = {
  width: '100%', padding: '13px 14px', borderRadius: 12, border: 'none',
  background: 'linear-gradient(90deg,#2563eb,#7c3aed)', color: '#fff',
  fontWeight: 800, cursor: 'pointer', marginTop: 4, fontSize: 15
}
const btnGhost = {
  padding: '10px 14px', borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.22)',
  background: 'rgba(255,255,255,0.04)', color: '#e2e8f0', fontWeight: 800, cursor: 'pointer'
}
const pill = {
  padding: '10px 14px', borderRadius: 999,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(148,163,184,0.18)', color: '#e2e8f0', fontSize: 14
}
const labelStyle = { display: 'grid', gap: 8, marginBottom: 14, color: '#e2e8f0', fontWeight: 700, fontSize: 14 }
const inputStyle = {
  padding: '11px 14px', borderRadius: 12,
  border: '1px solid rgba(148,163,184,0.22)',
  background: 'rgba(255,255,255,0.05)', color: '#f8fafc', outline: 'none', fontSize: 14
        }
                    
