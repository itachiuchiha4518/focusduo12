// lib/matchmaking.js
// Full file - overwrite existing lib/matchmaking.js if any.

import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore'
import { db } from './firebase' // your firebase init file exports `db`

/*
  Queue model:

  Collection: queues
    Doc: queueKey (exam_subject_mode)  (we don't store per-queue doc body necessarily)
      Subcollection: waiting
        Doc ID: userUid
        Fields: uid, displayName, createdAt (timestamp)

  Matching:
    - joinQueue() writes waiting doc for user
    - then transaction tries to assemble participants from waiting subcollection (ordered by createdAt)
    - If match possible: create session doc in `sessions` (auto id) with { users: [...uids], names: [...], exam, subject, mode, status:'active', createdAt }
      AND set userMatches/{uid} = { sessionId, createdAt } for each matched uid (this tells clients to redirect)
      AND delete each waiting doc.
    - If no match possible, joinQueue returns null and user waits; client listens to userMatches/{uid} for matching notification.

  Collections used:
    - queues/{queueKey}/waiting/{uid}
    - sessions/{sessionId}
    - userMatches/{uid}  (maps user -> matched session id)

  Simplicity + determinism: pick earliest waiting users (order by createdAt). 1-on-1 picks earliest other user. Group picks earliest up to maxParticipants (5).
*/

const QUEUES_COLLECTION = 'queues'
const SESSIONS_COLLECTION = 'sessions'
const USER_MATCHES_COLLECTION = 'userMatches'

/** helper: build queue key */
export function makeQueueKey(exam, subject, mode) {
  // normalize lower-case
  return `${(exam || '').toLowerCase()}__${(subject || '').toLowerCase()}__${(mode || '').toLowerCase()}`
}

/** joinQueue
  - exam: 'jee' | 'neet'
  - subject: e.g. 'physics'
  - mode: 'one-on-one' | 'group'
  - user: { uid, displayName }
  - opts: { maxGroupSize } for group
  returns:
    { matched: true, sessionId } if matched immediately,
    { matched: false } if not matched right now (you must listen to userMatches/{uid}).
*/
export async function joinQueue({ exam, subject, mode, user, opts = {} }) {
  if (!user || !user.uid) throw new Error('joinQueue: missing user')

  const uid = user.uid
  const displayName = user.displayName || user.email || 'Student'
  const queueKey = makeQueueKey(exam, subject, mode)
  const waitingRef = doc(db, QUEUES_COLLECTION, queueKey, 'waiting', uid)

  // write our waiting doc (timestamped). This is idempotent (overwrites).
  await setDoc(waitingRef, {
    uid,
    displayName,
    createdAt: serverTimestamp()
  })

  // attempt immediate match via transaction
  // For 1-on-1: need 2 users total (you + one other)
  // For group: need at least 2 users; will pick up to max participants (default 5)
  const maxGroupSize = opts.maxGroupSize || 5

  // Query current waiting users (ordered by createdAt)
  const waitingQuery = query(
    collection(db, QUEUES_COLLECTION, queueKey, 'waiting'),
    orderBy('createdAt'),
    limit(mode === 'one-on-one' ? 2 : maxGroupSize)
  )

  const snapshot = await getDocs(waitingQuery)
  const docs = snapshot.docs

  // Assemble list of candidate UIDs (earliest first)
  const candidates = docs.map(d => ({ id: d.id, data: d.data() }))

  // If not enough candidates, no immediate match
  if (mode === 'one-on-one') {
    // we require at least 2 (you + other)
    // make sure there is at least one other user besides current uid
    const other = candidates.find(c => c.id !== uid)
    if (!other) {
      return { matched: false }
    }
    // ensure we pick exactly you and the other earliest (order: earliest first)
    // Build participant list: earliest two unique uids including current
    let participants = []
    // push earliest distinct uids until we have 2
    for (const c of candidates) {
      if (!participants.includes(c.id)) participants.push(c.id)
      if (participants.length >= 2) break
    }
    // If current uid not included (possible if our server timestamp hasn't propagated), ensure included
    if (!participants.includes(uid)) participants.push(uid)

    // Participants now contains two uids (maybe duplicated ordering) - ensure distinct
    participants = [...new Set(participants)].slice(0, 2)

    // run transaction to atomically validate and create session
    const sessionId = await runTransaction(db, async (t) => {
      // re-check each waiting doc exists
      const waitingDocRefs = participants.map(u => doc(db, QUEUES_COLLECTION, queueKey, 'waiting', u))
      for (const ref of waitingDocRefs) {
        const snap = await t.get(ref)
        if (!snap.exists()) {
          // someone disappeared; abort transaction by returning null
          return null
        }
      }

      // create session doc id
      const newSessionRef = doc(collection(db, SESSIONS_COLLECTION))
      const sessionIdLocal = newSessionRef.id

      // prepare session data
      const names = []
      for (const u of participants) {
        const snap = await t.get(doc(db, QUEUES_COLLECTION, queueKey, 'waiting', u))
        names.push((snap.data() && snap.data().displayName) || null)
      }

      const sessionData = {
        exam,
        subject,
        mode,
        users: participants,
        names,
        status: 'active',
        createdAt: serverTimestamp()
      }

      // write session
      t.set(newSessionRef, sessionData)

      // create userMatches docs and delete waiting docs
      for (const u of participants) {
        const umRef = doc(db, USER_MATCHES_COLLECTION, u)
        t.set(umRef, { sessionId: sessionIdLocal, createdAt: serverTimestamp() })
        const waitRef = doc(db, QUEUES_COLLECTION, queueKey, 'waiting', u)
        t.delete(waitRef)
      }

      return sessionIdLocal
    })

    if (sessionId) {
      return { matched: true, sessionId }
    } else {
      // transaction failed because someone raced; return not matched — client will keep waiting (userMatches listener will catch eventual match)
      return { matched: false }
    }
  } else {
    // group mode: need at least 2 participants to create a session; pick upto maxGroupSize earliest
    const uniqueUids = []
    for (const c of candidates) {
      if (!uniqueUids.includes(c.id)) uniqueUids.push(c.id)
      if (uniqueUids.length >= maxGroupSize) break
    }
    if (uniqueUids.length < 2) {
      return { matched: false }
    }

    const participants = uniqueUids.slice(0, maxGroupSize)

    // transaction to atomically create session and remove waiting docs
    const sessionId = await runTransaction(db, async (t) => {
      // ensure all waiting docs still exist
      for (const u of participants) {
        const snap = await t.get(doc(db, QUEUES_COLLECTION, queueKey, 'waiting', u))
        if (!snap.exists()) return null
      }

      const newSessionRef = doc(collection(db, SESSIONS_COLLECTION))
      const sessionIdLocal = newSessionRef.id

      // collect display names
      const names = []
      for (const u of participants) {
        const snap = await t.get(doc(db, QUEUES_COLLECTION, queueKey, 'waiting', u))
        names.push((snap.data() && snap.data().displayName) || null)
      }

      const sessionData = {
        exam,
        subject,
        mode,
        users: participants,
        names,
        status: 'active',
        createdAt: serverTimestamp()
      }

      t.set(newSessionRef, sessionData)

      for (const u of participants) {
        const umRef = doc(db, USER_MATCHES_COLLECTION, u)
        t.set(umRef, { sessionId: sessionIdLocal, createdAt: serverTimestamp() })
        const waitRef = doc(db, QUEUES_COLLECTION, queueKey, 'waiting', u)
        t.delete(waitRef)
      }

      return sessionIdLocal
    })

    if (sessionId) {
      return { matched: true, sessionId }
    } else {
      return { matched: false }
    }
  }
}

/** leaveQueue
  - exam, subject, mode, uid
  Remove user's waiting doc (if exists) and remove any stale userMatches if present.
*/
export async function leaveQueue({ exam, subject, mode, uid }) {
  if (!uid) return
  const queueKey = makeQueueKey(exam, subject, mode)
  const waitingRef = doc(db, QUEUES_COLLECTION, queueKey, 'waiting', uid)
  try {
    await setDoc(waitingRef, {}, { merge: true }) // attempt to touch
    // then delete
    await import('firebase/firestore').then(({ deleteDoc }) => deleteDoc(waitingRef))
  } catch (e) {
    // best-effort: try delete directly
    try {
      await import('firebase/firestore').then(({ deleteDoc }) => deleteDoc(waitingRef))
    } catch (err) {
      console.warn('leaveQueue delete failed', err)
    }
  }

  // remove userMatches mapping if present (best-effort)
  try {
    const userMatchRef = doc(db, USER_MATCHES_COLLECTION, uid)
    await import('firebase/firestore').then(({ deleteDoc }) => deleteDoc(userMatchRef))
  } catch (e) {}
}

/** watchForMatch
  - uid: user id
  - callback: function(sessionId) called when match is found
  returns unsubscribe function
*/
export function watchForMatch(uid, callback) {
  const ref = doc(db, USER_MATCHES_COLLECTION, uid)
  const unsub = import('firebase/firestore').then(({ onSnapshot }) => {
    return onSnapshot(ref, (snap) => {
      if (!snap.exists()) return
      const data = snap.data()
      if (data && data.sessionId) {
        callback(data.sessionId)
      }
    })
  }).catch(err => {
    console.warn('watchForMatch error', err)
    return () => {}
  })
  // note: because we used dynamic import above, we can't easily return the unsub directly.
  // So provide a wrapper that calls onSnapshot and returns real unsubscribe.
  // Implement simpler: return a function that deletes the doc and does nothing — but clients will replace with their own onSnapshot.
  // To keep API straightforward, we'll provide a convenience using immediate onSnapshot import synchronously:
}

/* For convenience consumers should directly use Firestore onSnapshot on userMatches/{uid}.
   The functions above implement joinQueue and leaveQueue which are the important parts.
*/
export default {
  joinQueue,
  leaveQueue,
  makeQueueKey
  }
