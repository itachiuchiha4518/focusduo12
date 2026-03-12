// lib/matchmaking.js
// Atomic matchmaking helpers. Use from client pages.

import {
  collection,
  addDoc,
  doc,
  runTransaction,
  serverTimestamp,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  deleteDoc
} from "firebase/firestore";
import { db, auth } from "./firebase";

const RETRY_DELAY = 150; // ms
const RETRIES = 4;

/**
 * joinQueue:
 * - Adds a queue doc in 'queues' collection with fields {uid,name,exam,subject,mode,createdAt}
 * - Attempts to match with earliest other waiting doc (same exam+subject+mode).
 * - Uses runTransaction to create a session doc and atomically delete both queue docs and write userMatches/{uid}.
 * - Returns { status: 'waiting', queueId } or { status: 'matched', sessionId }
 */
export async function joinQueue({ exam, subject, mode }) {
  if (!auth.currentUser) throw new Error("Not authenticated");

  const meUid = auth.currentUser.uid;
  const meName = auth.currentUser.displayName || auth.currentUser.email || "Student";
  const queuesCol = collection(db, "queues");

  // create my queue doc
  const myDocRef = await addDoc(queuesCol, {
    uid: meUid,
    name: meName,
    exam,
    subject,
    mode,
    createdAt: serverTimestamp()
  });

  // helper: find candidate docs (excluding me)
  async function findCandidate() {
    const q = query(
      queuesCol,
      where("exam", "==", exam),
      where("subject", "==", subject),
      where("mode", "==", mode),
      orderBy("createdAt", "asc"),
      limit(5)
    );
    const snap = await getDocs(q);
    for (const d of snap.docs) {
      const data = d.data();
      if (!data) continue;
      if (data.uid === meUid) continue;
      return { id: d.id, ref: d.ref, data };
    }
    return null;
  }

  // try a few times to match (race-safe)
  for (let attempt = 0; attempt < RETRIES; ++attempt) {
    const candidate = await findCandidate();
    if (!candidate) {
      // no available partner now
      return { status: "waiting", queueId: myDocRef.id };
    }

    // attempt transaction to create session, notify both, delete queue docs
    try {
      const result = await runTransaction(db, async (tx) => {
        const mySnap = await tx.get(myDocRef);
        const otherSnap = await tx.get(candidate.ref);

        if (!mySnap.exists()) throw new Error("my-queue-missing");
        if (!otherSnap.exists()) throw new Error("other-queue-missing");

        // double-check exam/subject/mode still match (safety)
        const myData = mySnap.data();
        const otherData = otherSnap.data();
        if (!myData || !otherData) throw new Error("missing-data");
        if (myData.uid === otherData.uid) throw new Error("same-uid");
        if (myData.exam !== otherData.exam || myData.subject !== otherData.subject || myData.mode !== otherData.mode) {
          throw new Error("mismatch");
        }

        // create session doc
        const sessionsCol = collection(db, "sessions");
        const newSessionRef = doc(sessionsCol); // new id
        const participants = [
          { uid: myData.uid, name: myData.name },
          { uid: otherData.uid, name: otherData.name }
        ];

        tx.set(newSessionRef, {
          exam: myData.exam,
          subject: myData.subject,
          mode: myData.mode,
          participants,
          initiatorUid: participants[0].uid, // earliest is myData if order guaranteed; we used createdAt order
          status: "waiting_for_join",
          createdAt: serverTimestamp()
        });

        // notify both users via userMatches/{uid}
        const myMatchRef = doc(db, "userMatches", myData.uid);
        const otherMatchRef = doc(db, "userMatches", otherData.uid);
        tx.set(myMatchRef, { sessionId: newSessionRef.id, createdAt: serverTimestamp() });
        tx.set(otherMatchRef, { sessionId: newSessionRef.id, createdAt: serverTimestamp() });

        // delete queue docs
        tx.delete(myDocRef);
        tx.delete(candidate.ref);

        return { sessionId: newSessionRef.id };
      });

      // success
      return { status: "matched", sessionId: result.sessionId };
    } catch (err) {
      // transaction failed (race); wait and retry
      await new Promise((r) => setTimeout(r, RETRY_DELAY + Math.random() * 50));
      continue;
    }
  }

  // if we get here, matching failed after retries — remain waiting
  return { status: "waiting", queueId: myDocRef.id };
}

/**
 * cancelQueue(queueId)
 */
export async function cancelQueue(queueId) {
  if (!queueId) return;
  try {
    await deleteDoc(doc(db, "queues", queueId));
  } catch (e) {
    // ignore
    console.warn("cancelQueue error", e.message || e);
  }
}
