// lib/subscriptions.js
import {
  addDoc, collection, doc, getDoc, getDocs,
  runTransaction, serverTimestamp, setDoc, updateDoc,
  query, where, increment
} from 'firebase/firestore'
import { db } from './firebase'

// ─── Plan Definitions ────────────────────────────────
export const PLAN_DEFS = {
  free: {
    id: 'free', label: 'Free', priceINR: 0, durationDays: 0,
    unlimitedSessions: false, freeSessionsOneOnOne: 10, freeSessionsGroup: 10,
    enabled: true, description: '10 one-on-one + 10 group sessions',
    salesCount: 0, salesLimit: null, isSpecial: false
  },
  monthly_99: {
    id: 'monthly_99', label: '99 / month', priceINR: 99, durationDays: 30,
    unlimitedSessions: true, enabled: true, description: 'Unlimited sessions for 30 days',
    salesCount: 0, salesLimit: null, isSpecial: false
  },
  quarterly_199: {
    id: 'quarterly_199', label: '199 / 3 months', priceINR: 199, durationDays: 90,
    unlimitedSessions: true, enabled: true, description: 'Unlimited sessions for 90 days',
    salesCount: 0, salesLimit: null, isSpecial: false
  },
  yearly_699: {
    id: 'yearly_699', label: '699 / year', priceINR: 699, durationDays: 365,
    unlimitedSessions: true, enabled: true, description: 'Unlimited sessions for 1 year',
    salesCount: 0, salesLimit: null, isSpecial: false
  },
  first100_year_199: {
    id: 'first100_year_199', label: '199 / year (First 100)', priceINR: 199, durationDays: 365,
    unlimitedSessions: true, enabled: true, description: '1 year plan for first 100 buyers',
    salesCount: 0, salesLimit: 100, isSpecial: true
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
  return Number(profile?.[field] ?? 10)
}

// ─── User Profile ────────────────────────────────────
export async function ensureUserProfile(authUser) {
  if (!authUser) throw new Error('Missing auth user')
  const ref = doc(db, 'users', authUser.uid)
  const snap = await getDoc(ref)
  const currentCycle = getCycleKey()

  if (!snap.exists()) {
    const referralCode = authUser.uid.slice(0, 8).toUpperCase()
    const fresh = {
      uid: authUser.uid,
      name: authUser.displayName || authUser.email || 'Student',
      email: authUser.email || '',
      planId: 'free', planLabel: 'Free', planType: 'free',
      planStatus: 'active', accountStatus: 'active',
      planExpiresAt: null,
      freeOneOnOneRemaining: 10, freeGroupRemaining: 10,
      freeCycleKey: currentCycle,
      warningCount: 0, streakDays: 0, lastStudyDate: null,
      sessionsCompleted: 0, totalStudySeconds: 0,
      referralCode, referredBy: null, referralBonusGiven: false,
      referredCount: 0, bonusSessionsEarned: 0,
      streakShieldsRemaining: 0,
      createdAt: serverTimestamp(), updatedAt: serverTimestamp()
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

  // Backfill missing fields
  if (!data.referralCode) updates.referralCode = authUser.uid.slice(0, 8).toUpperCase()
  if (data.streakDays === undefined) updates.streakDays = 0
  if (data.lastStudyDate === undefined) updates.lastStudyDate = null
  if (data.sessionsCompleted === undefined) updates.sessionsCompleted = 0
  if (data.totalStudySeconds === undefined) updates.totalStudySeconds = 0
  if (data.warningCount === undefined) updates.warningCount = 0
  if (data.accountStatus === undefined) updates.accountStatus = 'active'
  if (data.planStatus === undefined) updates.planStatus = 'active'
  if (data.planId === undefined) updates.planId = 'free'
  if (data.planLabel === undefined) updates.planLabel = 'Free'
  if (data.planType === undefined) updates.planType = 'free'
  if (data.streakShieldsRemaining === undefined) updates.streakShieldsRemaining = 0

  const paidActive = isPaidActive(data)

  if (!paidActive) {
    if ((data.planType || 'free') === 'paid') {
      updates.planId = 'free'; updates.planLabel = 'Free'
      updates.planType = 'free'; updates.planStatus = 'active'
      updates.planExpiresAt = null
    }
    if (data.freeCycleKey !== currentCycle || data.freeOneOnOneRemaining === undefined || data.freeGroupRemaining === undefined) {
      updates.freeOneOnOneRemaining = 10
      updates.freeGroupRemaining = 10
      updates.freeCycleKey = currentCycle
    }
  }

  await setDoc(ref, updates, { merge: true })
  const fresh = await getDoc(ref)
  return fresh.data()
}

// ─── Streak System ───────────────────────────────────
// Also tracks totalStudySeconds for leaderboard hours display (pro only)
export async function incrementStreak(uid, sessionDurationSeconds = 0) {
  if (!uid) return 0
  const ref = doc(db, 'users', uid)

  return await runTransaction(db, async tx => {
    const snap = await tx.get(ref)
    if (!snap.exists()) return 0

    const data = snap.data()
    const today = new Date().toISOString().split('T')[0]
    const lastDate = data.lastStudyDate || null
    let newStreak = data.streakDays ?? 0
    const shields = data.streakShieldsRemaining ?? 0

    if (lastDate === today) {
      // Already studied today — just add study time
      tx.update(ref, {
        sessionsCompleted: increment(1),
        totalStudySeconds: increment(sessionDurationSeconds),
        updatedAt: serverTimestamp()
      })
      return newStreak
    }

    if (lastDate) {
      const last = new Date(lastDate)
      const now  = new Date(today)
      const diffDays = Math.round((now - last) / (1000 * 60 * 60 * 24))

      if (diffDays === 1) {
        newStreak = newStreak + 1
      } else if (diffDays === 2 && shields > 0) {
        // Streak shield absorbs a missed day
        newStreak = newStreak // keep streak
        tx.update(ref, { streakShieldsRemaining: shields - 1 })
      } else {
        newStreak = 1
      }
    } else {
      newStreak = 1
    }

    tx.update(ref, {
      streakDays: newStreak,
      lastStudyDate: today,
      sessionsCompleted: increment(1),
      totalStudySeconds: increment(sessionDurationSeconds),
      updatedAt: serverTimestamp()
    })

    return newStreak
  })
}

// ─── Referral System ─────────────────────────────────
// 1 referral = 1 bonus session in each mode for both people
export async function getReferralInfo(uid) {
  if (!uid) return null
  const snap = await getDoc(doc(db, 'users', uid))
  if (!snap.exists()) return null
  const data = snap.data()
  return {
    code: data.referralCode || uid.slice(0, 8).toUpperCase(),
    referredCount: data.referredCount || 0,
    bonusSessionsEarned: data.bonusSessionsEarned || 0
  }
}

export async function applyReferralCode(newUserUid, referralCode) {
  if (!newUserUid || !referralCode) return { success: false, reason: 'missing-args' }
  const code = referralCode.trim().toUpperCase()

  const q = query(collection(db, 'users'), where('referralCode', '==', code))
  const results = await getDocs(q)
  if (results.empty) return { success: false, reason: 'invalid-code' }

  const referrerDoc = results.docs[0]
  const referrerUid = referrerDoc.id
  if (referrerUid === newUserUid) return { success: false, reason: 'self-referral' }

  const newUserRef  = doc(db, 'users', newUserUid)
  const referrerRef = doc(db, 'users', referrerUid)

  return await runTransaction(db, async tx => {
    const newUserSnap  = await tx.get(newUserRef)
    const referrerSnap = await tx.get(referrerRef)
    if (!newUserSnap.exists()) return { success: false, reason: 'user-not-found' }
    if (!referrerSnap.exists()) return { success: false, reason: 'referrer-not-found' }

    const newUser  = newUserSnap.data()
    const referrer = referrerSnap.data()
    if (newUser.referredBy) return { success: false, reason: 'already-applied' }

    // 1 referral = 1 session in each mode for both people
    const BONUS = 1

    tx.update(newUserRef, {
      referredBy: referrerUid,
      referralBonusGiven: true,
      freeOneOnOneRemaining: (newUser.freeOneOnOneRemaining ?? 10) + BONUS,
      freeGroupRemaining: (newUser.freeGroupRemaining ?? 10) + BONUS,
      updatedAt: serverTimestamp()
    })

    tx.update(referrerRef, {
      freeOneOnOneRemaining: (referrer.freeOneOnOneRemaining ?? 0) + BONUS,
      freeGroupRemaining: (referrer.freeGroupRemaining ?? 0) + BONUS,
      referredCount: (referrer.referredCount || 0) + 1,
      bonusSessionsEarned: (referrer.bonusSessionsEarned || 0) + BONUS,
      updatedAt: serverTimestamp()
    })

    tx.set(doc(collection(db, 'referrals')), {
      referrerUid, newUserUid, code,
      bonusGiven: BONUS,
      createdAt: serverTimestamp()
    })

    return { success: true, bonus: BONUS }
  })
}

// ─── Credits ─────────────────────────────────────────
export async function consumeFreeCredit({ uid, mode, sessionId }) {
  if (!uid || !sessionId) throw new Error('Missing uid/sessionId')
  const userRef    = doc(db, 'users', uid)
  const billingRef = doc(db, 'sessions', sessionId, 'billing', uid)
  const field      = mode === 'group' ? 'freeGroupRemaining' : 'freeOneOnOneRemaining'

  await runTransaction(db, async tx => {
    const billingSnap = await tx.get(billingRef)
    if (billingSnap.exists()) return

    const userSnap = await tx.get(userRef)
    if (!userSnap.exists()) throw new Error('User profile missing')
    const user = userSnap.data()
    if (user.accountStatus === 'banned') throw new Error('User banned')

    if (isPaidActive(user)) {
      tx.set(billingRef, { uid, sessionId, mode, planType: user.planType || 'paid', charged: false, reason: 'paid-plan', createdAt: serverTimestamp() })
      return
    }

    const remaining = Number(user[field] ?? 10)
    if (remaining <= 0) throw new Error('No free credits left')

    tx.update(userRef, { [field]: remaining - 1, updatedAt: serverTimestamp() })
    tx.set(billingRef, { uid, sessionId, mode, charged: true, reason: 'free-credit-consumed', createdAt: serverTimestamp() })
  })
}

// ─── Subscription Request ─────────────────────────────
export async function createSubscriptionRequest({ uid, name, email, planId, planLabel, amount, utr, upiId, qrText, qrImageUrl }) {
  return addDoc(collection(db, 'subscriptionRequests'), {
    uid, name, email, planId, planLabel, amount, utr,
    upiId: upiId || '', qrText: qrText || '', qrImageUrl: qrImageUrl || '',
    status: 'pending', reviewedBy: null, reviewedAt: null, adminNote: '',
    createdAt: serverTimestamp()
  })
}

export function planEndsAtFromPlanId(planId) {
  const plan = getPlanDefinition(planId)
  if (!plan || !plan.durationDays) return null
  return new Date(Date.now() + plan.durationDays * 24 * 60 * 60 * 1000)
        }
                
