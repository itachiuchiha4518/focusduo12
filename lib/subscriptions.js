// lib/subscriptions.js
import { addDoc, collection, doc, getDoc, runTransaction, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from './firebase'

export const PLAN_DEFS = {
  free: {
    id: 'free',
    label: 'Free',
    priceINR: 0,
    durationDays: 0,
    unlimitedSessions: false,
    freeSessionsOneOnOne: 10,
    freeSessionsGroup: 10,
    enabled: true,
    description: '10 one-on-one sessions + 10 group sessions',
    salesCount: 0,
    salesLimit: null,
    isSpecial: false
  },
  monthly_99: {
    id: 'monthly_99',
    label: '99 / month',
    priceINR: 99,
    durationDays: 30,
    unlimitedSessions: true,
    enabled: true,
    description: 'Unlimited sessions for 30 days',
    salesCount: 0,
    salesLimit: null,
    isSpecial: false
  },
  quarterly_199: {
    id: 'quarterly_199',
    label: '199 / 3 months',
    priceINR: 199,
    durationDays: 90,
    unlimitedSessions: true,
    enabled: true,
    description: 'Unlimited sessions for 90 days',
    salesCount: 0,
    salesLimit: null,
    isSpecial: false
  },
  yearly_699: {
    id: 'yearly_699',
    label: '699 / year',
    priceINR: 699,
    durationDays: 365,
    unlimitedSessions: true,
    enabled: true,
    description: 'Unlimited sessions for 1 year',
    salesCount: 0,
    salesLimit: null,
    isSpecial: false
  },
  first100_year_199: {
    id: 'first100_year_199',
    label: '199 / year (First 100 buyers)',
    priceINR: 199,
    durationDays: 365,
    unlimitedSessions: true,
    enabled: true,
    description: '1 year plan for the first 100 buyers only',
    salesCount: 0,
    salesLimit: 100,
    isSpecial: true
  }
}

export function getPlanDefinition(planId) {
  return PLAN_DEFS[planId] || PLAN_DEFS.free
}

export function getCycleKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export function toMillis(value) {
  if (!value) return 0
  if (typeof value.toMillis === 'function') return value.toMillis()
  if (typeof value.seconds === 'number') return value.seconds * 1000
  if (value instanceof Date) return value.getTime()
  return 0
}

export function isPaidActive(profile) {
  if (!profile) return false
  if (profile.accountStatus === 'banned') return false
  if ((profile.planType || 'free') !== 'paid') return false
  if (profile.planStatus && profile.planStatus !== 'active') return false
  const expires = toMillis(profile.planExpiresAt)
  if (expires && expires <= Date.now()) return false
  return true
}

export function getEffectivePlanId(profile) {
  if (!profile) return 'free'
  if (profile.accountStatus === 'banned') return 'banned'
  return isPaidActive(profile) ? (profile.planId || 'paid') : 'free'
}

export function remainingForMode(profile, mode) {
  if (getEffectivePlanId(profile) !== 'free') return Infinity
  const field = mode === 'group' ? 'freeGroupRemaining' : 'freeOneOnOneRemaining'
  return Number(profile?.[field] ?? getPlanDefinition('free')[field])
}

export async function ensureUserProfile(authUser) {
  if (!authUser) throw new Error('Missing auth user')

  const ref = doc(db, 'users', authUser.uid)
  const snap = await getDoc(ref)
  const currentCycle = getCycleKey()

  if (!snap.exists()) {
    const fresh = {
      uid: authUser.uid,
      name: authUser.displayName || authUser.email || 'Student',
      email: authUser.email || '',
      planId: 'free',
      planLabel: 'Free',
      planType: 'free',
      planStatus: 'active',
      accountStatus: 'active',
      planExpiresAt: null,
      freeOneOnOneRemaining: 10,
      freeGroupRemaining: 10,
      freeCycleKey: currentCycle,
      warningCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    }
    await setDoc(ref, fresh)
    const again = await getDoc(ref)
    return again.data()
  }

  const data = snap.data()
  const updates = {
    name: authUser.displayName || data.name || 'Student',
    email: authUser.email || data.email || '',
    updatedAt: serverTimestamp()
  }

  if (data.warningCount === undefined) updates.warningCount = 0
  if (data.accountStatus === undefined) updates.accountStatus = 'active'
  if (data.planStatus === undefined) updates.planStatus = 'active'
  if (data.planId === undefined) updates.planId = 'free'
  if (data.planLabel === undefined) updates.planLabel = 'Free'
  if (data.planType === undefined) updates.planType = 'free'

  const paidActive = isPaidActive(data)

  if (!paidActive) {
    if ((data.planType || 'free') === 'paid') {
      updates.planId = 'free'
      updates.planLabel = 'Free'
      updates.planType = 'free'
      updates.planStatus = 'active'
      updates.planExpiresAt = null
    }

    if (
      data.freeCycleKey !== currentCycle ||
      data.freeOneOnOneRemaining === undefined ||
      data.freeGroupRemaining === undefined
    ) {
      updates.freeOneOnOneRemaining = 10
      updates.freeGroupRemaining = 10
      updates.freeCycleKey = currentCycle
    }
  }

  await setDoc(ref, updates, { merge: true })
  const fresh = await getDoc(ref)
  return fresh.data()
}

export async function consumeFreeCredit({ uid, mode, sessionId }) {
  if (!uid || !sessionId) throw new Error('Missing uid/sessionId')

  const userRef = doc(db, 'users', uid)
  const billingRef = doc(db, 'sessions', sessionId, 'billing', uid)
  const field = mode === 'group' ? 'freeGroupRemaining' : 'freeOneOnOneRemaining'

  await runTransaction(db, async tx => {
    const billingSnap = await tx.get(billingRef)
    if (billingSnap.exists()) return

    const userSnap = await tx.get(userRef)
    if (!userSnap.exists()) throw new Error('User profile missing')

    const user = userSnap.data()
    if (user.accountStatus === 'banned') throw new Error('User banned')

    if (isPaidActive(user)) {
      tx.set(billingRef, {
        uid,
        sessionId,
        mode,
        planType: user.planType || 'paid',
        charged: false,
        reason: 'paid-plan',
        createdAt: serverTimestamp()
      })
      return
    }

    const remaining = Number(user[field] ?? 10)
    if (remaining <= 0) throw new Error('No free credits left')

    tx.update(userRef, {
      [field]: remaining - 1,
      updatedAt: serverTimestamp()
    })

    tx.set(billingRef, {
      uid,
      sessionId,
      mode,
      charged: true,
      reason: 'free-credit-consumed',
      createdAt: serverTimestamp()
    })
  })
}

export async function createSubscriptionRequest({
  uid,
  name,
  email,
  planId,
  planLabel,
  amount,
  utr,
  upiId,
  qrText,
  qrImageUrl
}) {
  return addDoc(collection(db, 'subscriptionRequests'), {
    uid,
    name,
    email,
    planId,
    planLabel,
    amount,
    utr,
    upiId: upiId || '',
    qrText: qrText || '',
    qrImageUrl: qrImageUrl || '',
    status: 'pending',
    reviewedBy: null,
    reviewedAt: null,
    adminNote: '',
    createdAt: serverTimestamp()
  })
}

export function planEndsAtFromPlanId(planId) {
  const plan = getPlanDefinition(planId)
  if (!plan || !plan.durationDays) return null
  return new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000)
            }
