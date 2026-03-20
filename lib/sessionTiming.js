import { doc, runTransaction, serverTimestamp } from 'firebase/firestore'

export const FREE_SETUP_SECONDS = 120
export const FREE_SESSION_SECONDS = 1800

export function getSessionElapsedSeconds(session) {
  const startedAt = session?.startedAt?.toMillis?.() || 0
  if (!startedAt) return 0
  return Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
}

export function getFreeTimerState(session) {
  const elapsed = getSessionElapsedSeconds(session)
  return {
    setupLeft: Math.max(0, FREE_SETUP_SECONDS - elapsed),
    sessionLeft: Math.max(0, FREE_SESSION_SECONDS - elapsed),
    gracePassed: elapsed >= FREE_SETUP_SECONDS,
    finished: elapsed >= FREE_SESSION_SECONDS
  }
}

export async function consumeFreeCreditOnce({
  db,
  sessionId,
  uid,
  mode,
  userRef
}) {
  const billingRef = doc(db, 'sessions', sessionId, 'billing', uid)

  return runTransaction(db, async tx => {
    const billingSnap = await tx.get(billingRef)
    if (billingSnap.exists() && billingSnap.data()?.consumed) {
      return { consumed: false }
    }

    const userSnap = await tx.get(userRef)
    if (!userSnap.exists()) throw new Error('user-not-found')

    const userData = userSnap.data() || {}
    const key = mode === 'group' ? 'freeGroupRemaining' : 'freeOneOnOneRemaining'
    const current = Number(userData[key] || 0)

    if (current <= 0) {
      throw new Error('no-free-credits')
    }

    tx.set(
      billingRef,
      {
        uid,
        sessionId,
        mode,
        consumed: true,
        consumedAt: serverTimestamp()
      },
      { merge: true }
    )

    tx.update(userRef, {
      [key]: current - 1,
      lastCreditUsedAt: serverTimestamp()
    })

    return { consumed: true }
  })
}
