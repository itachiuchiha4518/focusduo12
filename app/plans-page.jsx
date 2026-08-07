'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { auth, db, googleProvider } from '../../lib/firebase'
import { onAuthStateChanged, signInWithPopup } from 'firebase/auth'
import { collection, doc, getDoc, onSnapshot, orderBy, query } from 'firebase/firestore'
import { createSubscriptionRequest, getEffectivePlanId } from '../../lib/subscriptions'

var BG     = '#F7F6F2'
var WHITE  = '#FFFFFF'
var BORDER = '#E4E2DC'
var TEXT   = '#1A1A18'
var TEXT2  = '#6B6860'
var TEXT3  = '#A8A59F'
var DARK   = '#1A1A18'

var PLANS = [
  { id: 'monthly_99',         label: 'Monthly',  price: 99,  period: '/ month',    yearly: false, early: false },
  { id: 'quarterly_199',      label: '3 Months', price: 199, period: '/ 3 months', yearly: false, early: false },
  { id: 'yearly_699',         label: 'Yearly',   price: 699, period: '/ year',     yearly: true,  early: false },
  { id: 'first100_year_199',  label: 'Early buyer — 1 year', price: 199, period: '/ year', yearly: true, early: true },
]

var PRO_FEATURES = [
  'Unlimited sessions',
  'No session time limit',
  'Priority matching queue',
  'Full session history',
  '1 streak shield per month',
  'Create topic group rooms',
  'Session notes',
  'Session summary after each session',
  'Total study hours tracked',
  'Weekly study report',
  'Pro badge on leaderboard',
]

var FREE_FEATURES = [
  '10 one-on-one sessions',
  '10 group sessions',
  '30 minutes per session',
  'Streak tracking',
  'Leaderboard access',
  'Join topic group rooms',
]

var css = '\n' +
  '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; min-width: 0; }\n' +
  'html { overflow-x: clip; }\n' +
  'body { background: ' + BG + '; color: ' + TEXT + '; font-family: "DM Sans",system-ui,sans-serif; -webkit-font-smoothing: antialiased; overflow-x: clip; }\n' +
  'a { color: inherit; text-decoration: none; }\n' +
  'button { font-family: inherit; cursor: pointer; }\n' +
  '.wrap { width: 100%; max-width: 1060px; margin: 0 auto; padding: 0 20px; }\n' +
  '.plan-grid { display: grid; grid-template-columns: 1fr; gap: 2px; }\n' +
  '.compare-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 2px; }\n' +
  '.plan-btn { width: 100%; padding: 11px 0; border-radius: 8px; font-size: 14px; font-weight: 600; border: none; background: ' + DARK + '; color: #fff; cursor: pointer; transition: background 0.15s; font-family: inherit; }\n' +
  '.plan-btn:hover { background: #2D2D2B; }\n' +
  '.plan-btn:disabled { background: ' + BORDER + '; color: ' + TEXT3 + '; cursor: not-allowed; }\n' +
  '.plan-item { display: flex; align-items: baseline; gap: 10px; font-size: 14px; padding: 5px 0; }\n' +
  '.dash { color: ' + TEXT3 + '; font-size: 11px; flex-shrink: 0; }\n' +
  '@media (min-width: 640px) {\n' +
  '  .wrap { padding: 0 28px; }\n' +
  '  .plan-grid { grid-template-columns: repeat(2, 1fr); }\n' +
  '}\n' +
  '@media (min-width: 900px) {\n' +
  '  .plan-grid { grid-template-columns: repeat(4, 1fr); }\n' +
  '}\n'

export default function PlansPage() {
  var router = useRouter()
  var [user, setUser]         = useState(null)
  var [profile, setProfile]   = useState(null)
  var [siteConfig, setSiteConfig] = useState(null)
  var [selectedPlan, setSelectedPlan] = useState(null)
  var [utr, setUtr]           = useState('')
  var [submitting, setSubmitting] = useState(false)
  var [submitted, setSubmitted]   = useState(false)
  var [err, setErr]           = useState('')

  useEffect(function() {
    var unsub = onAuthStateChanged(auth, async function(u) {
      setUser(u || null)
      if (u) {
        try {
          var snap = await getDoc(doc(db, 'users', u.uid))
          if (snap.exists()) setProfile(snap.data())
        } catch(e) {}
      }
    })
    return function() { unsub() }
  }, [])

  useEffect(function() {
    var unsub = onSnapshot(doc(db, 'siteConfig', 'plans'), function(snap) {
      if (snap.exists()) setSiteConfig(snap.data())
    })
    return function() { unsub() }
  }, [])

  async function ensureLogin() {
    if (auth.currentUser) return auth.currentUser
    return (await signInWithPopup(auth, googleProvider)).user
  }

  async function handleSubmit(plan) {
    if (!utr.trim()) { setErr('Please enter your UPI transaction ID.'); return }
    setSubmitting(true); setErr('')
    try {
      var u = await ensureLogin()
      var upiId = siteConfig && siteConfig.upiId ? siteConfig.upiId : ''
      await createSubscriptionRequest({
        uid: u.uid, name: u.displayName || '', email: u.email || '',
        planId: plan.id, planLabel: plan.label,
        amount: plan.price, utr: utr.trim(),
        upiId: upiId
      })
      setSubmitted(true)
      setUtr('')
      setSelectedPlan(null)
    } catch(e) { setErr('Submission failed. Please try again.') }
    finally { setSubmitting(false) }
  }

  var currentPlanId = profile ? getEffectivePlanId(profile) : 'free'

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div style={{ minHeight: '100vh', background: BG }}>
        <div className="wrap" style={{ paddingTop: 40, paddingBottom: 60 }}>

          <Link href="/" style={{ fontSize: 13, color: TEXT3, fontFamily: 'Lora,Georgia,serif', fontWeight: 600, display: 'inline-block', marginBottom: 24 }}>FocusDuo</Link>

          <div style={{ marginBottom: 36 }}>
            <h1 style={{ fontFamily: 'Lora,Georgia,serif', fontSize: 'clamp(24px,4vw,36px)', fontWeight: 600, color: TEXT, letterSpacing: '-0.02em', marginBottom: 8 }}>
              Plans
            </h1>
            <p style={{ fontSize: 15, color: TEXT2, lineHeight: 1.65, maxWidth: 480 }}>
              Free to start. Upgrade when you are ready. Payment via UPI — no card, no automatic charge.
            </p>
          </div>

          {/* Success message */}
          {submitted ? (
            <div style={{ padding: '18px 22px', borderRadius: 10, border: '1px solid #BBF7D0', background: '#F0FDF4', marginBottom: 20 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: '#166534', marginBottom: 4 }}>Payment submitted.</p>
              <p style={{ fontSize: 13, color: '#166534', lineHeight: 1.65 }}>
                We will review your payment and activate your plan within 24 hours. Check your dashboard for updates.
              </p>
            </div>
          ) : null}

          {/* UPI instructions */}
          {siteConfig && siteConfig.upiId ? (
            <div style={{ marginBottom: 24, padding: '16px 20px', borderRadius: 10, border: '1px solid ' + BORDER, background: WHITE }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 10 }}>How to pay</p>
              <p style={{ fontSize: 14, color: TEXT2, lineHeight: 1.7, marginBottom: 6 }}>
                1. Open any UPI app (PhonePe, GPay, Paytm, or any bank app).
              </p>
              <p style={{ fontSize: 14, color: TEXT2, lineHeight: 1.7, marginBottom: 6 }}>
                2. Pay to UPI ID: <strong style={{ color: TEXT, fontFamily: 'monospace', fontSize: 15 }}>{siteConfig.upiId}</strong>
              </p>
              <p style={{ fontSize: 14, color: TEXT2, lineHeight: 1.7, marginBottom: 6 }}>
                3. Send exactly the plan amount shown below.
              </p>
              <p style={{ fontSize: 14, color: TEXT2, lineHeight: 1.7 }}>
                4. Copy the transaction ID and paste it in the form below after selecting your plan.
              </p>
              {siteConfig.qrImageUrl ? (
                <div style={{ marginTop: 14 }}>
                  <p style={{ fontSize: 13, color: TEXT3, marginBottom: 8 }}>Or scan QR code:</p>
                  <img src={siteConfig.qrImageUrl} alt="UPI QR" style={{ width: 140, height: 140, borderRadius: 8, border: '1px solid ' + BORDER }} />
                </div>
              ) : null}
            </div>
          ) : null}

          {/* Compare free vs pro */}
          <div className="compare-grid" style={{ marginBottom: 2 }}>
            <div style={{ background: BG, border: '1px solid ' + BORDER, borderRadius: 10, padding: 22 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>Free</p>
              <div style={{ fontFamily: 'Lora,Georgia,serif', fontSize: 32, fontWeight: 600, color: TEXT, lineHeight: 1, marginBottom: 4 }}>Rs 0</div>
              <p style={{ fontSize: 13, color: TEXT3, marginBottom: 20 }}>No card, no expiry</p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {FREE_FEATURES.map(function(f) {
                  return (
                    <div key={f} className="plan-item">
                      <span className="dash">—</span>
                      <span style={{ color: TEXT2 }}>{f}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <div style={{ background: WHITE, border: '2px solid ' + DARK, borderRadius: 10, padding: 22 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Pro</p>
                <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: DARK, color: WHITE, letterSpacing: '0.04em' }}>Popular</span>
              </div>
              <div style={{ fontFamily: 'Lora,Georgia,serif', fontSize: 32, fontWeight: 600, color: TEXT, lineHeight: 1, marginBottom: 4 }}>Rs 99</div>
              <p style={{ fontSize: 13, color: TEXT3, marginBottom: 20 }}>per month and up</p>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {PRO_FEATURES.map(function(f) {
                  return (
                    <div key={f} className="plan-item">
                      <span className="dash">—</span>
                      <span style={{ color: TEXT }}>{f}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Plan cards */}
          <div style={{ marginTop: 24, marginBottom: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>Choose a plan</p>
          </div>
          <div className="plan-grid">
            {PLANS.map(function(plan) {
              var isCurrent = currentPlanId === plan.id
              var isSelected = selectedPlan && selectedPlan.id === plan.id
              return (
                <div key={plan.id} style={{ background: isSelected ? WHITE : BG, border: '1px solid ' + (isSelected ? DARK : BORDER), borderRadius: 10, padding: 20, transition: 'border-color 0.15s, background 0.15s', cursor: 'pointer' }} onClick={function() { if (!isCurrent) setSelectedPlan(plan) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                    <p style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{plan.label}</p>
                    {plan.early ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3, background: DARK, color: WHITE, letterSpacing: '0.04em' }}>Limited</span> : null}
                    {isCurrent ? <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3, background: '#F0FDF4', color: '#166534', border: '1px solid #BBF7D0', letterSpacing: '0.04em' }}>Active</span> : null}
                  </div>
                  <div style={{ fontFamily: 'Lora,Georgia,serif', fontSize: 28, fontWeight: 600, color: TEXT, lineHeight: 1, marginBottom: 4 }}>
                    Rs {plan.price}
                  </div>
                  <p style={{ fontSize: 13, color: TEXT3, marginBottom: 16 }}>{plan.period}</p>
                  {plan.early ? <p style={{ fontSize: 12, color: TEXT2, lineHeight: 1.6, marginBottom: 16 }}>First 100 buyers only. Full Pro for a year at Rs 199. Price locked forever.</p> : null}
                  <button
                    className="plan-btn"
                    disabled={isCurrent}
                    onClick={function(e) { e.stopPropagation(); if (!isCurrent) setSelectedPlan(plan) }}
                    style={{ background: isCurrent ? BORDER : isSelected ? DARK : '#1A1A18', color: isCurrent ? TEXT3 : '#fff' }}
                  >
                    {isCurrent ? 'Current plan' : isSelected ? 'Selected' : 'Select'}
                  </button>
                </div>
              )
            })}
          </div>

          {/* Payment form */}
          {selectedPlan ? (
            <div style={{ marginTop: 16, background: WHITE, border: '1px solid ' + BORDER, borderRadius: 10, padding: 24 }}>
              <p style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 14 }}>
                Submit payment — {selectedPlan.label} (Rs {selectedPlan.price})
              </p>
              <p style={{ fontSize: 14, color: TEXT2, lineHeight: 1.65, marginBottom: 18 }}>
                Pay Rs {selectedPlan.price} to the UPI ID above, then paste your transaction ID here.
              </p>
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: TEXT2, display: 'block', marginBottom: 6 }}>
                  UPI Transaction ID
                </label>
                <input
                  value={utr}
                  onChange={function(e) { setUtr(e.target.value) }}
                  placeholder="e.g. 123456789012"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid ' + BORDER, background: BG, color: TEXT, fontSize: 14, outline: 'none', fontFamily: 'monospace' }}
                />
              </div>
              {err ? <p style={{ fontSize: 13, color: '#991B1B', marginBottom: 12 }}>{err}</p> : null}
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={function() { handleSubmit(selectedPlan) }}
                  disabled={submitting || !utr.trim()}
                  style={{ padding: '11px 24px', borderRadius: 8, fontWeight: 600, fontSize: 14, border: 'none', background: utr.trim() ? DARK : BORDER, color: utr.trim() ? WHITE : TEXT3, cursor: utr.trim() ? 'pointer' : 'not-allowed', transition: 'all 0.15s' }}
                >
                  {submitting ? 'Submitting...' : 'Submit payment'}
                </button>
                <button
                  onClick={function() { setSelectedPlan(null); setUtr(''); setErr('') }}
                  style={{ padding: '11px 18px', borderRadius: 8, fontWeight: 600, fontSize: 14, border: '1px solid ' + BORDER, background: 'transparent', color: TEXT2, cursor: 'pointer' }}
                >
                  Cancel
                </button>
              </div>
              <p style={{ marginTop: 14, fontSize: 12, color: TEXT3, lineHeight: 1.65 }}>
                We will verify your payment and activate your plan within 24 hours. No automatic charges ever.
              </p>
            </div>
          ) : null}

          {/* FAQ */}
          <div style={{ marginTop: 32, background: WHITE, border: '1px solid ' + BORDER, borderRadius: 10, padding: 24 }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 18 }}>Common questions</p>
            {[
              { q: 'Is the free plan actually free?', a: 'Yes. 10 one-on-one sessions and 10 group sessions, no card required, no expiry.' },
              { q: 'How does payment work?', a: 'You pay manually via UPI, submit your transaction ID, and we verify and activate within 24 hours. No automatic charges, ever.' },
              { q: 'Can I cancel anytime?', a: 'Yes. Paid plans run for their duration (monthly, 3 months, or yearly) and do not renew automatically.' },
              { q: 'What if my payment is not activated?', a: 'Contact us. We check every submission and will resolve it within 24 hours.' },
            ].map(function(item) {
              return (
                <div key={item.q} style={{ padding: '14px 0', borderBottom: '1px solid ' + BORDER }}>
                  <p style={{ fontSize: 14, fontWeight: 600, color: TEXT, marginBottom: 6 }}>{item.q}</p>
                  <p style={{ fontSize: 14, color: TEXT2, lineHeight: 1.65 }}>{item.a}</p>
                </div>
              )
            })}
          </div>

        </div>
      </div>
    </>
  )
}
