// components/WebRTCRoom.jsx
'use client'
import { useEffect, useRef, useState } from "react";
import { auth, db } from "../lib/firebase";
import {
  doc,
  collection,
  addDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  orderBy,
  onSnapshot
} from "firebase/firestore";

/*
 WebRTCRoom
 - props: sessionId, session
 - deterministic initiator: session.initiatorUid (set at session creation)
 - if missing, will fallback to first participant and attempt safe set (but creation sets it)
 - both users must click "Join meeting" (user gesture) to allow getUserMedia + autoplay
*/

export default function WebRTCRoom({ sessionId, session }) {
  const localRef = useRef(null);
  const remoteRef = useRef(null);
  const pcRef = useRef(null);
  const localStreamRef = useRef(null);
  const unsubCands = useRef(null);
  const unsubOffer = useRef(null);
  const unsubAnswer = useRef(null);

  const [status, setStatus] = useState("idle");
  const [logs, setLogs] = useState([]);
  const [joined, setJoined] = useState(false);
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);

  function log(m) {
    const time = new Date().toLocaleTimeString();
    setLogs((s) => [...s.slice(-80), `${time} — ${m}`]);
    console.debug("WebRTCRoom:", m);
  }

  useEffect(() => {
    return () => cleanup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function cleanup() {
    log("cleanup");
    try { unsubCands.current && unsubCands.current(); unsubCands.current = null } catch(e){}
    try { unsubOffer.current && unsubOffer.current(); unsubOffer.current = null } catch(e){}
    try { unsubAnswer.current && unsubAnswer.current(); unsubAnswer.current = null } catch(e){}
    try { if (pcRef.current) { pcRef.current.getSenders().forEach(s=>s.track&&s.track.stop()); pcRef.current.close(); pcRef.current=null } } catch(e){}
    try { if (localStreamRef.current) { localStreamRef.current.getTracks().forEach(t=>t.stop()); localStreamRef.current=null } } catch(e){}
    setJoined(false);
    setStatus("idle");
  }

  async function publishCandidate(candidate) {
    try {
      await addDoc(collection(db, "sessions", sessionId, "candidates"), {
        candidate: candidate.toJSON(),
        sender: auth.currentUser?.uid || null,
        ts: Date.now()
      });
    } catch (e) {
      log("publishCandidate failed: " + (e.message || e));
    }
  }

  async function joinMeeting() {
    if (!auth.currentUser) { alert("Sign in first"); return; }
    if (joined) return;
    setStatus("starting");
    try {
      setStatus("getting-media");
      log("requesting media (user gesture)");
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: { echoCancellation: true, noiseSuppression: true } });
      localStreamRef.current = stream;
      if (localRef.current) { localRef.current.srcObject = stream; localRef.current.muted = true; try{ await localRef.current.play().catch(()=>{}) } catch(e){} }

      // create pc
      const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
      pcRef.current = pc;

      // attach local tracks BEFORE sdp
      try { localStreamRef.current.getTracks().forEach(t => pc.addTrack(t, localStreamRef.current)) } catch(e){ log("addTrack error: " + (e.message||e)) }

      // remote stream
      const remoteStream = new MediaStream();
      if (remoteRef.current) remoteRef.current.srcObject = remoteStream;
      pc.ontrack = (e) => {
        try { e.streams?.[0]?.getTracks().forEach(t => remoteStream.addTrack(t)) } catch(e){}
        setTimeout(() => {
          try { if (remoteRef.current) { remoteRef.current.muted = false; remoteRef.current.playsInline = true; remoteRef.current.play().catch(()=>log("remote play blocked")) } } catch(e){}
        }, 120);
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) publishCandidate(ev.candidate);
      };

      unsubCands.current = onSnapshot(collection(db, "sessions", sessionId, "candidates"), (snap) => {
        snap.docChanges().forEach(async (ch) => {
          if (ch.type !== "added") return;
          const d = ch.doc.data();
          if (!d) return;
          if (d.sender === auth.currentUser?.uid) return;
          try { await pc.addIceCandidate(new RTCIceCandidate(d.candidate)); log("added remote candidate"); } catch(e){ log("addIceCandidate failed: "+(e.message||e)) }
        });
      }, (err) => log("candidates snapshot err: " + (err.message||err)));

      const offerRef = doc(db, "sessions", sessionId, "signaling", "offer");
      const answerRef = doc(db, "sessions", sessionId, "signaling", "answer");

      // determine role from session.initiatorUid
      const myUid = auth.currentUser.uid;
      const initiatorUid = session?.initiatorUid || (session?.participants?.[0]?.uid || null);
      const amInitiator = initiatorUid && initiatorUid === myUid;
      log("role: " + (amInitiator ? "initiator" : "answerer"));

      // if we are initiator: create offer if none exists; else wait for answer
      const offSnap = await getDoc(offerRef);
      if (amInitiator) {
        if (offSnap.exists()) {
          const od = offSnap.data();
          if (od.sender && od.sender !== myUid) {
            // someone else wrote offer — become answerer
            log("offer authored by other — switching to answerer");
            await createAndWriteAnswer(pc, offerRef, answerRef);
          } else {
            log("offer present (authored by me) or unknown — waiting for answer");
            unsubAnswer.current = onSnapshot(answerRef, async (snap) => {
              if (!snap.exists()) return;
              const d = snap.data(); if (!d?.sdp) return;
              try { await pc.setRemoteDescription({ type: d.type || "answer", sdp: d.sdp }); setStatus("connected"); log("applied remote answer"); } catch(e){ log("setRemoteDescription failed: "+(e.message||e)) }
            });
          }
        } else {
          log("creating offer (initiator)");
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await setDoc(offerRef, { sdp: offer.sdp, type: offer.type, sender: myUid });
          log("offer written");
          unsubAnswer.current = onSnapshot(answerRef, async (snap) => {
            if (!snap.exists()) return;
            const d = snap.data(); if (!d?.sdp) return;
            try { await pc.setRemoteDescription({ type: d.type || "answer", sdp: d.sdp }); setStatus("connected"); log("answer applied"); } catch(e){ log("apply answer failed: "+(e.message||e)) }
          });
        }
      } else {
        // answerer path
        if (offSnap.exists()) {
          log("offer exists -> creating answer immediately");
          await createAndWriteAnswer(pc, offerRef, answerRef);
        } else {
          log("waiting for offer");
          unsubOffer.current = onSnapshot(offerRef, async (snap) => {
            if (!snap.exists()) return;
            log("offer appeared -> creating answer");
            try { await createAndWriteAnswer(pc, offerRef, answerRef); } catch (e) { log("createAnswer failed: " + (e.message || e)); }
          }, (err) => log("offer snapshot err: "+(err.message||err)));
        }
      }

      pc.onconnectionstatechange = () => {
        const st = pc.connectionState;
        log("pc.connectionState: " + st);
        if (st === "connected") setStatus("connected");
        if (st === "failed" || st === "disconnected") setStatus(st);
      };

      setJoined(true);
      setStatus("joined");
      log("join flow started");
    } catch (e) {
      log("joinMeeting error: " + (e.message || e));
      setStatus("error");
    }
  }

  async function createAndWriteAnswer(pc, offerRef, answerRef) {
    const myUid = auth.currentUser.uid;
    const offSnap = await getDoc(offerRef);
    if (!offSnap.exists()) { log("offer missing for createAnswer"); return; }
    const offerData = offSnap.data();
    try {
      await pc.setRemoteDescription({ type: offerData.type || "offer", sdp: offerData.sdp });
      log("applied remote offer");
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await setDoc(answerRef, { sdp: answer.sdp, type: answer.type, sender: myUid });
      log("wrote answer");
    } catch (e) {
      log("createAndWriteAnswer error: " + (e.message || e));
    }
  }

  function toggleMic() {
    const tracks = localStreamRef.current?.getAudioTracks() || [];
    tracks.forEach((t) => (t.enabled = !t.enabled));
    setMicOn((v) => !v);
  }
  function toggleCam() {
    const tracks = localStreamRef.current?.getVideoTracks() || [];
    tracks.forEach((t) => (t.enabled = !t.enabled));
    setCamOn((v) => !v);
  }

  async function copyDebugJSON() {
    try {
      const sRef = doc(db, "sessions", sessionId);
      const sSnap = await getDoc(sRef);
      const offerSnap = await getDoc(doc(db, "sessions", sessionId, "signaling", "offer"));
      const answerSnap = await getDoc(doc(db, "sessions", sessionId, "signaling", "answer"));
      const candSnap = await getDocs(query(collection(db, "sessions", sessionId, "candidates"), orderBy("ts", "asc")));
      const dump = {
        session: sSnap.exists() ? sSnap.data() : null,
        offer: offerSnap.exists() ? offerSnap.data() : null,
        answer: answerSnap.exists() ? answerSnap.data() : null,
        candidates: candSnap.docs.map((d) => d.data())
      };
      await navigator.clipboard.writeText(JSON.stringify(dump, null, 2));
      alert("Debug JSON copied to clipboard.");
    } catch (e) {
      alert("Failed to copy debug JSON: " + (e.message || e));
    }
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12 }}>
        <div style={{ width: 160 }}>
          <div style={{ fontSize: 12, color: "#666" }}>You</div>
          <video ref={localRef} autoPlay playsInline muted style={{ width: "100%", height: 240, background: "#000", borderRadius: 8 }} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 12, color: "#666" }}>Partner</div>
          <video ref={remoteRef} autoPlay playsInline style={{ width: "100%", height: 240, background: "#000", borderRadius: 8 }} />
        </div>
      </div>

      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button onClick={toggleMic}>{micOn ? "Mic Off" : "Mic On"}</button>
        <button onClick={toggleCam}>{camOn ? "Cam Off" : "Cam On"}</button>
        {!joined ? <button onClick={joinMeeting}>Join meeting</button> : <button onClick={cleanup}>Leave</button>}
        <button onClick={copyDebugJSON} style={{ background: "#222", color: "#fff" }}>Copy debug JSON</button>
      </div>

      <div style={{ marginTop: 8 }}><strong>Status:</strong> {status}</div>

      <div style={{ marginTop: 10, maxHeight: 220, overflow: "auto", background: "#111", color: "#fff", padding: 8, borderRadius: 8 }}>
        {logs.length === 0 ? <div style={{ color: "#ccc" }}>No logs yet</div> : logs.map((l, i) => <div key={i} style={{ fontSize: 12 }}>{l}</div>)}
      </div>
    </div>
  );
        }
