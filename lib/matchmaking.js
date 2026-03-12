// lib/matchmaking.js
// Firestore modular SDK (v9+) helper for safe matchmaking.
// Replace entire file.

import {
  collection,
  addDoc,
  doc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore'
import { db, auth } from './firebase' // adjust path if your firebase export is elsewhere

// CONFIG: how many attempts to retry a transaction match when race occurs
const TRANSACTION_RETRIES = 3

/**
 * joinQueue
 * - Creates a queue doc under "queues" collection.
 * - Attempts to match immediately with the earliest waiting doc that
 *   has same exam+subject+mode.
 * - If match found: runs a transaction that verifies both queue docs are still unmatched,
 *   creates a session document, and deletes both queue docs atomically.
 *
 * Returns object:
 * { status: 'waiting', queueId }  OR
 * { status: 'matched', sessionId, partner } (partner contains uid + name)
 */
export async function joinQueue({ exam, subject, mode, displayName = null }) {
  if (!auth.currentUser) throw new Error('Not authenticated')
  const uid = auth.currentUser.uid
  const queuesCol = collection(db, 'queues')

  // create my queue doc
  const qDocRef = await addDoc(queuesCol, {
    uid,
    name: displayName || auth.currentUser.displayName || auth.currentUser.email || uid,
    exam,
    subject,
    mode,
    matched: false,
    ts: serverTimestamp()
  })

  // helper to attempt match; returns matched sessionId or null
  async function tryMatchOnce() {
    // query earliest unmatched queue doc with same exam/subject/mode and uid != me
    const q = query(
      queuesCol,
      where('exam', '==', exam),
      where('subject', '==', subject),
      where('mode', '==', mode),
      where('matched', '==', false),
      orderBy('ts', 'asc'),
      limit(5) // small limit is fine; we only need earliest available
    )

    const snap = await getDocs(q)
    let candidate = null
    for (const d of snap.docs) {
      const data = d.data()
      if (!data) continue
      if (data.uid === uid) continue
      candidate = { id: d.id, data }
      break
    }
    if (!candidate) return null // no candidate right now

    // attempt transaction to mark matched and create session
    const myRef = doc(db, 'queues', qDocRef.id)
    const otherRef = doc(db, 'queues', candidate.id)
    const sessionsCol = collection(db, 'sessions')

    try {
      const result = await runTransaction(db, async (tx) => {
        const mySnap = await tx.get(myRef)
        const otherSnap = await tx.get(otherRef)

        if (!mySnap.exists()) throw new Error('my queue doc missing (maybe removed)')
        if (!otherSnap.exists()) throw new Error('candidate doc missing (race)')

        const myData = mySnap.data()
        const otherData = otherSnap.data()
        // verify both unmatched
        if (myData.matched) throw new Error('my already matched')
        if (otherData.matched) throw new Error('other already matched')

        // create session doc
        const sessionDocRef = doc(sessionsCol) // new session id
        const sessionData = {
          exam,
          subject,
          mode,
          participants: [
            { uid: myData.uid, name: myData.name },
            { uid: otherData.uid, name: otherData.name }
          ],
          status: 'active',
          createdAt: serverTimestamp()
        }
        tx.set(sessionDocRef, sessionData)

        // mark both matched (optional) then delete queue docs to free them
        tx.update(myRef, { matched: true })
        tx.update(otherRef, { matched: true })

        // delete queue docs so they can't be matched again
        tx.delete(myRef)
        tx.delete(otherRef)

        return { sessionId: sessionDocRef.id, sessionData }
      })
      return result // contains sessionId and data
    } catch (err) {
      // transaction failed - return null so caller can retry
      console.warn('match transaction failed:', err.message || err)
      return null
    }
  }

  // Try a few times to match (race-safe)
  for (let attempt = 0; attempt < TRANSACTION_RETRIES; ++attempt) {
    const matched = await tryMatchOnce()
    if (matched) {
      return {
        status: 'matched',
        sessionId: matched.sessionId,
        partner: matched.sessionData.participants.find(p => p.uid !== uid)
      }
    }
    // otherwise wait a tiny bit and try again (allows other client to commit)
    await new Promise(res => setTimeout(res, 200 + Math.random() * 300))
  }

  // no match after retries -> waiting in queue
  return { status: 'waiting', queueId: qDocRef.id }
}

/**
 * cancelQueue(queueId)
 * - Deletes a queue doc if it exists.
 */
export async function cancelQueue(queueId) {
  if (!queueId) return
  try {
    await deleteDoc(doc(db, 'queues', queueId))
  } catch (e) {
    console.warn('cancelQueue failed', e.message || e)
  }
}

/**
 * admin/cleanup helper (optional)
 * Delete stale unmatched queues older than `olderThanMs`.
 */
export async function cleanupOldQueues(olderThanMs = 1000 * 60 * 30) {
  // NOT used by client by default; admin only
  const cutoff = Date.now() - olderThanMs
  const q = query(collection(db, 'queues'), orderBy('ts', 'asc'), limit(100))
  const snap = await getDocs(q)
  const deleted = []
  for (const d of snap.docs) {
    const data = d.data()
    const time = (data.ts && data.ts.toMillis && data.ts.toMillis()) || 0
    if (time && time < cutoff && !data.matched) {
      await deleteDoc(doc(db, 'queues', d.id))
      deleted.push(d.id)
    }
  }
  return deleted
    }
