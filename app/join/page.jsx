// app/join/page.jsx
'use client'
import { useEffect, useRef, useState } from "react";
import { auth, googleProvider } from "../../lib/firebase";
import { signInWithPopup } from "firebase/auth";
import { joinQueue, cancelQueue } from "../../lib/matchmaking";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../../lib/firebase";
import { useRouter } from "next/navigation";

export default function JoinPage() {
  const router = useRouter();
  const [exam, setExam] = useState("JEE");
  const [subject, setSubject] = useState("Physics");
  const [mode, setMode] = useState("one-on-one");
  const [status, setStatus] = useState("idle");
  const queueIdRef = useRef(null);
  const userMatchUnsub = useRef(null);

  useEffect(() => {
    function cleanupOnUnload() {
      if (queueIdRef.current) {
        // best-effort cancel; not guaranteed on mobile browsers
        cancelQueue(queueIdRef.current);
        queueIdRef.current = null;
      }
    }
    window.addEventListener("beforeunload", cleanupOnUnload);
    return () => {
      window.removeEventListener("beforeunload", cleanupOnUnload);
      if (userMatchUnsub.current) userMatchUnsub.current();
    };
  }, []);

  async function ensureSignedIn() {
    if (auth.currentUser) return auth.currentUser;
    const res = await signInWithPopup(auth, googleProvider);
    return res.user;
  }

  async function startMatchmaking() {
    try {
      setStatus("authenticating");
      await ensureSignedIn();
      setStatus("joining-queue");

      // subscribe to userMatches/{uid} to detect when matched
      const uid = auth.currentUser.uid;
      const userMatchesRef = doc(db, "userMatches", uid);
      userMatchUnsub.current = onSnapshot(userMatchesRef, (snap) => {
        if (!snap.exists()) return;
        const data = snap.data();
        if (data?.sessionId) {
          // matched
          setStatus("matched");
          // cleanup local listener
          if (userMatchUnsub.current) userMatchUnsub.current();
          queueIdRef.current = null;
          router.push(`/session/${data.sessionId}`);
        }
      });

      // call joinQueue
      const res = await joinQueue({ exam, subject, mode });
      if (res.status === "waiting") {
        queueIdRef.current = res.queueId;
        setStatus("waiting");
      } else if (res.status === "matched") {
        setStatus("matched");
        router.push(`/session/${res.sessionId}`);
      } else {
        setStatus("waiting");
      }
    } catch (e) {
      console.error(e);
      setStatus("error");
      alert("Failed to join queue: " + (e.message || e));
    }
  }

  async function cancel() {
    setStatus("cancelling");
    if (queueIdRef.current) {
      await cancelQueue(queueIdRef.current);
      queueIdRef.current = null;
    }
    if (userMatchUnsub.current) userMatchUnsub.current();
    setStatus("idle");
  }

  return (
    <div style={{ padding: 20, maxWidth: 680 }}>
      <h1>Join a study session</h1>

      <div style={{ marginTop: 12 }}>
        <label>Exam</label>
        <select value={exam} onChange={(e) => setExam(e.target.value)}>
          <option>JEE</option>
          <option>NEET</option>
        </select>
      </div>

      <div style={{ marginTop: 8 }}>
        <label>Subject</label>
        <select value={subject} onChange={(e) => setSubject(e.target.value)}>
          <option>Physics</option>
          <option>Chemistry</option>
          <option>Math</option>
          <option>Biology</option>
        </select>
      </div>

      <div style={{ marginTop: 8 }}>
        <label>Mode</label>
        <select value={mode} onChange={(e) => setMode(e.target.value)}>
          <option value="one-on-one">1-on-1</option>
          <option value="group">Group (max 5)</option>
        </select>
      </div>

      <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
        <button onClick={startMatchmaking} disabled={status === "joining-queue" || status === "waiting"}>
          Start matchmaking
        </button>
        <button onClick={cancel} style={{ background: "#eee", color: "#000" }}>
          Cancel
        </button>
      </div>

      <div style={{ marginTop: 12 }}>
        <strong>Status:</strong> {status}
      </div>
    </div>
  );
}
