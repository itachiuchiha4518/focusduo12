// lib/matchmaking.js
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  limit,
  runTransaction,
  serverTimestamp
} from 'firebase/firestore'
import { db } from './firebase'

const QUEUES = 'queues'
const SESSIONS = 'sessions'
const USER_MATCHES = 'userMatches'

export function makeQueueKey(exam, subject, mode) {
  return `${(exam||'').toLowerCase()}__${(subject||'').toLowerCase()}__${(mode||'').toLowerCase()}`
}

export async function joinQueue({ exam, subject, mode, user, maxGroupSize = 5 }) {
  if (!user || !user.uid) throw new Error('user required')
  const uid = user.uid
  const displayName = user.displayName || user.email || 'Student'
  const queueKey = makeQueueKey(exam, subject, mode)
  const waitingRef = doc(db, QUEUES, queueKey, 'waiting', uid)

  // write waiting doc
  await setDoc(waitingRef, { uid, displayName, exam, subject, mode, createdAt: serverTimestamp() })

  // attempt immediate deterministic match
  const waitingCol = collection(db, QUEUES, queueKey, 'waiting')
  const q = query(waitingCol, orderBy('createdAt'), limit(mode === 'one-on-one' ? 2 : maxGroupSize))
  const snap = await getDocs(q)
  const docs = snap.docs
  const candidates = docs.map(d => ({ id: d.id, data: d.data() }))

  if (mode === 'one-on-one') {
    // find other user
    const other = candidates.find(c => c.id !== uid)
    if (!other) return { matched: false }
    // pick earliest two
    let participants = []
    for (const c of candidates) {
      if (!participants.includes(c.id)) participants.push(c.id)
      if (participants.length >= 2) break
    }
    if (!participants.includes(uid)) participants.push(uid)
    participants = [...new Set(participants)].slice(0,2)

    const sessionId = await runTransaction(db, async (t) => {
      // re-check waiting docs
      for (const u of participants) {
        const wRef = doc(db, QUEUES, queueKey, 'waiting', u)
        const wSnap = await t.get(wRef)
        if (!wSnap.exists()) return null
      }
      // create session
      const newSessionRef = doc(collection(db, SESSIONS))
      const nId = newSessionRef.id
      const names = []
      for (const u of participants) {
        const snap = await t.get(doc(db, QUEUES, queueKey, 'waiting', u))
        names.push((snap.data() && snap.data().displayName) || null)
      }
      const sessionData = { exam, subject, mode, users: participants, names, status: 'active', createdAt: serverTimestamp() }
      t.set(newSessionRef, sessionData)
      // write userMatches and delete waiting docs
      for (const u of participants) {
        t.set(doc(db, USER_MATCHES, u), { sessionId: nId, createdAt: serverTimestamp() })
        t.delete(doc(db, QUEUES, queueKey, 'waiting', u))
      }
      return nId
    })
    if (sessionId) return { matched: true, sessionId }
    return { matched: false }
  } else {
    // group
    const uniqueUids = []
    for (const c of candidates) {
      if (!uniqueUids.includes(c.id)) uniqueUids.push(c.id)
      if (uniqueUids.length >= maxGroupSize) break
    }
    if (uniqueUids.length < 2) return { matched: false }

    const participants = uniqueUids.slice(0, maxGroupSize)
    const sessionId = await runTransaction(db, async (t) => {
      for (const u of participants) {
        const snap = await t.get(doc(db, QUEUES, queueKey, 'waiting', u))
        if (!snap.exists()) return null
      }
      const newSessionRef = doc(collection(db, SESSIONS))
      const nId = newSessionRef.id
      const names = []
      for (const u of participants) {
        const snap = await t.get(doc(db, QUEUES, queueKey, 'waiting', u))
        names.push((snap.data() && snap.data().displayName) || null)
      }
      const sessionData = { exam, subject, mode, users: participants, names, status: 'active', createdAt: serverTimestamp() }
      t.set(newSessionRef, sessionData)
      for (const u of participants) {
        t.set(doc(db, USER_MATCHES, u), { sessionId: nId, createdAt: serverTimestamp() })
        t.delete(doc(db, QUEUES, queueKey, 'waiting', u))
      }
      return nId
    })
    if (sessionId) return { matched: true, sessionId }
    return { matched: false }
  }
}

export async function leaveQueue({ exam, subject, mode, uid }) {
  if (!uid) return
  const queueKey = makeQueueKey(exam, subject, mode)
  const waitRef = doc(db, QUEUES, queueKey, 'waiting', uid)
  try { await import('firebase/firestore').then(({ deleteDoc }) => deleteDoc(waitRef)) } catch (e) {}
  try { await import('firebase/firestore').then(({ deleteDoc }) => deleteDoc(doc(db, USER_MATCHES, uid))) } catch (e) {}
}
