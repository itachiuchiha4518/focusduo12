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

  const selectedPlan = plans[selectedPlanId] || getPlanDefinition(selectedPlanId)
  const effectivePlanId = getEffectivePlanId(profile)

  async function login() {
    try {
      await signInWithPopup(auth, googleProvider)
    } catch (err) {
      console.error(err)
      alert('Google sign in failed')
    }
  }

  async function logout() {
    try {
      await signOut(auth)
    } catch (err) {
      console.error(err)
    }
  }

  async function submitRequest() {
    if (!user) {
      await login()
      return
    }

    if (!utr.trim()) {
      alert('Enter the UTR or transaction ID')
      return
    }

    const plan = selectedPlan
    if (!plan || plan.enabled === false) {
      alert('This plan is not available')
      return
    }

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
      setMessage('Request submitted. Admin will review it.')
      setUtr('')
    } catch (err) {
      console.error(err)
      alert('Failed to submit request')
    } finally {
      setSubmitting(false)
    }
  }

  const paidPlans = ['monthly_99', 'quarterly_199', 'yearly_699', 'first100_year_199']
    .map(id => plans[id] || PLAN_DEFS[id])

  return (
    <div style={{ maxWidth: 1240, margin: '0 auto', padding: 24, color: '#e2e8f0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <h1 style={{ marginBottom: 8 }}>Plans & Subscriptions</h1>
          <div style={{ color: '#94a3b8' }}>Manual payment via QR and UTR. No gateway yet.</div>
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {!user ? (
            <button onClick={login} style={btnBlue}>Sign in with Google</button>
          ) : (
            <>
              <div style={pill}>
                Signed in as {user.displayName || user.email}
              </div>
              <button onClick={logout} style={btnGhost}>Log out</button>
            </>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: 18, marginTop: 22 }}>
        <div style={cardDark}>
          <h2 style={{ marginTop: 0 }}>Pick a plan</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 14 }}>
            {paidPlans.map(plan => {
              const soldOut = plan.isSpecial && Number(plan.salesCount || 0) >= Number(plan.salesLimit || 100)
              const active = selectedPlanId === plan.id
              return (
                <button
                  key={plan.id}
                  onClick={() => setSelectedPlanId(plan.id)}
                  style={{
                    textAlign: 'left',
                    padding: 16,
                    borderRadius: 16,
                    border: active ? '1px solid #60a5fa' : '1px solid rgba(148,163,184,0.18)',
                    background: active ? 'rgba(37,99,235,0.14)' : 'rgba(255,255,255,0.04)',
                    color: '#e2e8f0',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: 18 }}>{plan.label}</div>
                    {soldOut && (
                      <div style={{ fontSize: 12, color: '#fda4af' }}>Sold out</div>
                    )}
                  </div>
                  <div style={{ marginTop: 8, color: '#cbd5e1' }}>₹{plan.priceINR}</div>
                  <div style={{ marginTop: 8, color: '#94a3b8', lineHeight: 1.6 }}>
                    {plan.description}
                  </div>
                  <div style={{ marginTop: 10, fontSize: 13, color: '#bfdbfe' }}>
                    {plan.unlimitedSessions ? 'Unlimited sessions' : 'Limited sessions'}
                  </div>
                  {plan.isSpecial && (
                    <div style={{ marginTop: 8, fontSize: 13, color: '#fde68a' }}>
                      {Number(plan.salesCount || 0)} / {Number(plan.salesLimit || 100)} sold
                    </div>
                  )}
                </button>
              )
            })}
          </div>

          <div style={{ marginTop: 18, padding: 16, borderRadius: 16, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.16)' }}>
            <div style={{ fontWeight: 800, marginBottom: 10 }}>Payment details</div>
            <div style={{ display: 'grid', gap: 10 }}>
              <div><strong>UPI ID:</strong> {selectedPlan.upiId || 'Not set yet by admin'}</div>
              <div><strong>QR text:</strong> {selectedPlan.qrText || 'Not set yet by admin'}</div>
              {selectedPlan.qrImageUrl ? (
                <img
                  src={selectedPlan.qrImageUrl}
                  alt="QR"
                  style={{ width: 220, borderRadius: 12, border: '1px solid rgba(148,163,184,0.18)' }}
                />
              ) : null}
              <div style={{ color: '#94a3b8' }}>
                Pay the exact amount shown in the selected plan, then submit your UTR or transaction ID.
              </div>
            </div>
          </div>
        </div>

        <div style={cardDark}>
          <h2 style={{ marginTop: 0 }}>Submit payment</h2>

          {user ? (
            <>
              <div style={{ marginBottom: 14, color: '#cbd5e1', lineHeight: 1.6 }}>
                Current plan: <strong>{profile?.planLabel || 'Free'}</strong><br />
                Status: <strong>{profile?.accountStatus || 'active'}</strong><br />
                Free one-on-one left: <strong>{remainingForMode(profile, 'one-on-one')}</strong><br />
                Free group left: <strong>{remainingForMode(profile, 'group')}</strong>
              </div>

              <label style={labelStyle}>
                Selected plan
                <select
                  value={selectedPlanId}
                  onChange={e => setSelectedPlanId(e.target.value)}
                  style={inputStyle}
                >
                  {paidPlans.map(plan => (
                    <option key={plan.id} value={plan.id}>
                      {plan.label}
                    </option>
                  ))}
                </select>
              </label>

              <label style={labelStyle}>
                UTR / Transaction ID
                <input
                  value={utr}
                  onChange={e => setUtr(e.target.value)}
                  placeholder="Enter UTR or transaction ID"
                  style={inputStyle}
                />
              </label>

              <button onClick={submitRequest} disabled={submitting} style={btnBlueBlock}>
                Submit request
              </button>

              <div style={{ marginTop: 12, color: '#93c5fd' }}>{message}</div>

              <div style={{ marginTop: 18, padding: 14, borderRadius: 14, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.16)' }}>
                <div style={{ fontWeight: 800, marginBottom: 6 }}>Free plan rules</div>
                <div style={{ color: '#cbd5e1', lineHeight: 1.7 }}>
                  • 10 one-on-one sessions<br />
                  • 10 group sessions<br />
                  • First 2 minutes are for chapter selection<br />
                  • Leave within 2 minutes and your credit will not be used<br />
                  • Free sessions end automatically after 30 minutes
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: '#94a3b8', lineHeight: 1.8 }}>
              Sign in first to submit a subscription request.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const cardDark = {
  padding: 18,
  borderRadius: 18,
  background: 'rgba(15,23,42,0.86)',
  border: '1px solid rgba(148,163,184,0.16)',
  boxShadow: '0 20px 50px rgba(0,0,0,0.2)'
}
const btnBlue = {
  padding: '10px 14px',
  borderRadius: 10,
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer'
}
const btnBlueBlock = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 12,
  border: 'none',
  background: '#2563eb',
  color: '#fff',
  fontWeight: 800,
  cursor: 'pointer',
  marginTop: 4
}
const btnGhost = {
  padding: '10px 14px',
  borderRadius: 10,
  border: '1px solid rgba(148,163,184,0.22)',
  background: 'rgba(255,255,255,0.04)',
  color: '#e2e8f0',
  fontWeight: 800,
  cursor: 'pointer'
}
const pill = {
  padding: '10px 14px',
  borderRadius: 999,
  background: 'rgba(255,255,255,0.06)',
  border: '1px solid rgba(148,163,184,0.18)',
  color: '#e2e8f0'
}
const labelStyle = {
  display: 'grid',
  gap: 8,
  marginBottom: 14,
  color: '#e2e8f0',
  fontWeight: 700
}
const inputStyle = {
  padding: 12,
  borderRadius: 12,
  border: '1px solid rgba(148,163,184,0.22)',
  background: 'rgba(255,255,255,0.05)',
  color: '#f8fafc',
  outline: 'none'
                      }
