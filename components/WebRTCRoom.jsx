'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  addDoc, collection, doc, getDoc, onSnapshot,
  runTransaction, serverTimestamp, setDoc, updateDoc
} from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import Chat from './Chat'
import { consumeFreeCreditOnce, getFreeTimerState } from '../lib/sessionTiming'

// ─── Config ──────────────────────────────────────────
var ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
]
var FREE_SECS  = 30 * 60
var GRACE_SECS = 2 * 60
var NUDGE_SECS = 5 * 60

var DEFAULT_PROFILE = {
  planId: 'free', planLabel: 'Free', planStatus: 'active',
  accountStatus: 'active', freeOneOnOneRemaining: 10,
  freeGroupRemaining: 10, sessionsCompleted: 0, streakDays: 0
}

var REPORT_REASONS = [
  'Not studying / wasting time',
  'Inappropriate / abusive language',
  'Showing vulgar content on camera',
  'Harassment or bullying',
  'Disconnecting on purpose repeatedly',
  'Fake profile / impersonation',
  'Soliciting or spam',
  'Other',
]

// ─── Helpers ─────────────────────────────────────────
function getEffectivePlanId(p) {
  if (!p) return 'free'
  if (p.accountStatus === 'banned') return 'banned'
  if (p.planStatus === 'active' && p.planId && p.planId !== 'free') return p.planId
  return 'free'
}

function isProPlan(profile) {
  var id = getEffectivePlanId(profile)
  return id === 'yearly_699' || id === 'first100_year_199' || id === 'pro'
}

function sleep(ms) { return new Promise(function(r) { setTimeout(r, ms) }) }

function fmt(secs) {
  var s = Math.max(0, Math.floor(secs))
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

function fmtDuration(secs) {
  var s = Math.max(0, secs)
  var h = Math.floor(s / 3600)
  var m = Math.floor((s % 3600) / 60)
  if (h > 0) return h + 'h ' + m + 'm'
  if (m < 1) return 'less than 1 min'
  return m + ' min' + (m !== 1 ? 's' : '')
}

function tColor(s) {
  if (s <= 60) return '#ef4444'
  if (s <= NUDGE_SECS) return '#f59e0b'
  return '#4ade80'
}

function preferVP9(sdp) {
  try {
    var lines = sdp.split('\r\n')
    var vp9 = lines.find(function(l) { return /a=rtpmap:\d+ VP9/.test(l) })
    var pt = vp9 && vp9.match(/a=rtpmap:(\d+) VP9/) ? vp9.match(/a=rtpmap:(\d+) VP9/)[1] : null
    if (!pt) return sdp
    return lines.map(function(l) {
      if (!l.startsWith('m=video')) return l
      var p = l.split(' ')
      return p.slice(0, 3).concat([pt]).concat(p.slice(3).filter(function(x) { return x !== pt })).join(' ')
    }).join('\r\n')
  } catch(e) { return sdp }
}

// ─────────────────────────────────────────────────────
// POST-SESSION SCREEN 1: Session Summary (Pro only)
// ─────────────────────────────────────────────────────
function SessionSummary({ sessionDoc, durationSecs, partner, onContinue }) {
  var exam    = sessionDoc && sessionDoc.exam ? sessionDoc.exam : ''
  var subject = sessionDoc && sessionDoc.subject ? sessionDoc.subject : ''
  var mode    = sessionDoc && sessionDoc.mode === 'one-on-one' ? '1-on-1' : 'Group'
  var chapter = sessionDoc && sessionDoc.chapter ? sessionDoc.chapter : null
  var durationText = fmtDuration(durationSecs)

  var motivation =
    durationSecs >= 25 * 60 ? 'Full session completed! Outstanding focus. 🔥' :
    durationSecs >= 15 * 60 ? 'Solid session. Keep building that habit!' :
    'Good start — every session counts!'

  return (
    <div style={{
      minHeight: '100dvh', background: '#080d18',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        width: '100%', maxWidth: 440, background: '#0f172a',
        border: '1px solid rgba(139,92,246,0.3)', borderRadius: 24,
        padding: 28, color: '#e2e8f0'
      }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 44, marginBottom: 10 }}>📊</div>
          <div style={{ fontSize: 11, fontWeight: 800, color: '#a78bfa', letterSpacing: 2, textTransform: 'uppercase', marginBottom: 6 }}>
            Pro · Session Summary
          </div>
          <h2 style={{ margin: 0, fontWeight: 900, fontSize: 22 }}>
            {exam} {subject}
          </h2>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 16 }}>
          {[
            { icon: '⏱️', label: 'Duration',  value: durationText },
            { icon: '👤', label: 'Partner',   value: partner && partner.name ? partner.name : 'Unknown' },
            { icon: '📚', label: 'Subject',   value: subject || '—' },
            { icon: '🎯', label: 'Mode',      value: mode },
          ].map(function(item) {
            return (
              <div key={item.label} style={{
                padding: '14px 16px', borderRadius: 14,
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(148,163,184,0.1)'
              }}>
                <div style={{ fontSize: 20, marginBottom: 6 }}>{item.icon}</div>
                <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  {item.label}
                </div>
                <div style={{ fontWeight: 800, fontSize: 15, marginTop: 3 }}>{item.value}</div>
              </div>
            )
          })}
        </div>

        {/* Chapter */}
        {chapter ? (
          <div style={{
            padding: '12px 16px', borderRadius: 14, marginBottom: 14,
            background: 'rgba(37,99,235,0.1)', border: '1px solid rgba(96,165,250,0.2)'
          }}>
            <div style={{ fontSize: 10, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>
              Chapter covered
            </div>
            <div style={{ fontWeight: 700, color: '#93c5fd' }}>{chapter}</div>
          </div>
        ) : null}

        {/* Motivation */}
        <div style={{
          padding: '14px 16px', borderRadius: 14, marginBottom: 20,
          background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 22, marginBottom: 6 }}>🔥</div>
          <div style={{ fontWeight: 700, color: '#4ade80', fontSize: 14 }}>{motivation}</div>
        </div>

        <button onClick={onContinue} style={{
          width: '100%', padding: '14px 0', borderRadius: 14, fontWeight: 900,
          fontSize: 15, border: 'none',
          background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
          color: '#fff', cursor: 'pointer'
        }}>
          Rate your partner →
        </button>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// POST-SESSION SCREEN 2: Rating + Report link
// ─────────────────────────────────────────────────────
function RatingScreen({ partner, sessionId, selfUid, onDone, onReport }) {
  var [rating, setRating]   = useState(0)
  var [hovered, setHovered] = useState(0)
  var [comment, setComment] = useState('')
  var [busy, setBusy]       = useState(false)
  var [submitted, setSubmitted] = useState(false)

  async function submit() {
    setBusy(true)
    try {
      if (rating > 0 && partner && partner.uid && selfUid) {
        await addDoc(collection(db, 'ratings'), {
          sessionId: sessionId,
          raterUid: selfUid,
          ratedUid: partner.uid,
          rating: rating,
          comment: comment.trim(),
          createdAt: serverTimestamp()
        })
        // Update rated user's average
        await runTransaction(db, async function(tx) {
          var snap = await tx.get(doc(db, 'users', partner.uid))
          if (!snap.exists()) return
          var d     = snap.data()
          var count = (d.ratingCount || 0) + 1
          var avg   = ((d.ratingAvg || 0) * (count - 1) + rating) / count
          tx.update(doc(db, 'users', partner.uid), {
            ratingCount: count,
            ratingAvg: Math.round(avg * 10) / 10,
            updatedAt: serverTimestamp()
          })
        })
      }
    } catch(e) { console.warn('rating submit failed', e) }
    finally { setBusy(false) }
    setSubmitted(true)
    setTimeout(onDone, 800)
  }

  if (submitted) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#080d18', fontFamily: 'system-ui, sans-serif'
      }}>
        <div style={{ textAlign: 'center', color: '#4ade80', fontWeight: 900, fontSize: 18 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          Thanks for rating!
        </div>
      </div>
    )
  }

  return (
    <div style={{
      minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, background: '#080d18', fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        width: '100%', maxWidth: 400, padding: 28, borderRadius: 24, textAlign: 'center',
        background: '#0f172a', border: '1px solid rgba(148,163,184,0.15)', color: '#e2e8f0'
      }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>⭐</div>
        <h2 style={{ margin: '0 0 6px', fontWeight: 900 }}>Rate your session</h2>
        <p style={{ color: '#64748b', fontSize: 14, marginBottom: 22 }}>
          How was studying with{' '}
          <strong style={{ color: '#e2e8f0' }}>
            {partner && partner.name ? partner.name : 'your partner'}
          </strong>?
        </p>

        {/* Stars */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
          {[1, 2, 3, 4, 5].map(function(s) {
            return (
              <button
                key={s}
                onClick={function() { setRating(s) }}
                onMouseEnter={function() { setHovered(s) }}
                onMouseLeave={function() { setHovered(0) }}
                style={{
                  fontSize: 42, background: 'none', border: 'none', cursor: 'pointer',
                  color: s <= (hovered || rating) ? '#fbbf24' : '#1e293b',
                  transform: s <= (hovered || rating) ? 'scale(1.2)' : 'scale(1)',
                  transition: 'all 0.1s', padding: 2
                }}
              >
                ★
              </button>
            )
          })}
        </div>

        {/* Comment box — shows after star selected */}
        {rating > 0 ? (
          <div style={{ marginBottom: 18 }}>
            <input
              value={comment}
              onChange={function(e) { setComment(e.target.value) }}
              placeholder={rating >= 4 ? 'What did they do well? (optional)' : 'What could be better? (optional)'}
              style={{
                width: '100%', padding: '11px 14px', borderRadius: 12, fontSize: 14,
                border: '1px solid rgba(148,163,184,0.15)',
                background: 'rgba(255,255,255,0.04)', color: '#f8fafc',
                outline: 'none', boxSizing: 'border-box'
              }}
            />
          </div>
        ) : null}

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 16 }}>
          <button
            onClick={onDone}
            style={{
              padding: '11px 18px', borderRadius: 12, fontWeight: 700, cursor: 'pointer',
              border: '1px solid rgba(148,163,184,0.15)',
              background: 'transparent', color: '#64748b', fontSize: 14
            }}
          >
            Skip
          </button>
          <button
            onClick={submit}
            disabled={busy}
            style={{
              padding: '11px 28px', borderRadius: 12, fontWeight: 900, cursor: 'pointer',
              border: 'none', background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
              color: '#fff', fontSize: 14, opacity: busy ? 0.7 : 1
            }}
          >
            {busy ? 'Saving...' : 'Submit →'}
          </button>
        </div>

        {/* Report button — full width, clearly visible */}
        {partner && partner.uid ? (
          <button
            onClick={onReport}
            style={{
              width: '100%', padding: '11px 0', borderRadius: 12, fontWeight: 700,
              cursor: 'pointer', fontSize: 14,
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.3)',
              color: '#ef4444', transition: 'all 0.2s'
            }}
          >
            🚨 Report this partner
          </button>
        ) : null}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// POST-SESSION SCREEN 3: Report
// ─────────────────────────────────────────────────────
function ReportScreen({ partner, sessionId, reporterUid, reporterName, onDone }) {
  var [selected, setSelected] = useState([])
  var [details, setDetails]   = useState('')
  var [busy, setBusy]         = useState(false)
  var [submitted, setSubmitted] = useState(false)

  function toggle(reason) {
    setSelected(function(prev) {
      if (prev.includes(reason)) return prev.filter(function(r) { return r !== reason })
      return prev.concat([reason])
    })
  }

  async function submit() {
    if (selected.length === 0) { onDone(); return }
    setBusy(true)
    try {
      await addDoc(collection(db, 'reports'), {
        sessionId: sessionId,
        reporterUid: reporterUid || null,
        reporterName: reporterName || 'Anonymous',
        reportedUid: partner && partner.uid ? partner.uid : null,
        reportedName: partner && partner.name ? partner.name : 'Unknown',
        selectedReasons: selected,
        details: details.trim(),
        status: 'open',
        createdAt: serverTimestamp()
      })
      setSubmitted(true)
      setTimeout(onDone, 1600)
    } catch(e) {
      console.warn('report failed', e)
      onDone()
    } finally { setBusy(false) }
  }

  return (
    <div style={{
      minHeight: '100dvh', background: '#080d18',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        width: '100%', maxWidth: 460, background: '#0f172a',
        border: '1px solid rgba(239,68,68,0.2)', borderRadius: 24,
        padding: 28, color: '#e2e8f0'
      }}>

        {submitted ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
            <div style={{ fontWeight: 900, fontSize: 18, color: '#4ade80', marginBottom: 6 }}>
              Report submitted
            </div>
            <div style={{ color: '#64748b', fontSize: 14 }}>
              Our team will review it and take action.
            </div>
          </div>
        ) : (
          <div>
            <div style={{ textAlign: 'center', marginBottom: 22 }}>
              <div style={{ fontSize: 36, marginBottom: 10 }}>🚨</div>
              <h2 style={{ margin: 0, fontWeight: 900, fontSize: 20 }}>Report partner</h2>
              <p style={{ color: '#64748b', fontSize: 14, marginTop: 8 }}>
                What happened with{' '}
                <strong style={{ color: '#e2e8f0' }}>
                  {partner && partner.name ? partner.name : 'your partner'}
                </strong>?
                <br />
                <span style={{ fontSize: 12 }}>Select all that apply.</span>
              </p>
            </div>

            {/* Reason chips */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {REPORT_REASONS.map(function(reason) {
                  var isSelected = selected.includes(reason)
                  return (
                    <button
                      key={reason}
                      onClick={function() { toggle(reason) }}
                      style={{
                        padding: '9px 16px', borderRadius: 999, fontWeight: 600, fontSize: 13,
                        cursor: 'pointer', border: 'none', transition: 'all 0.15s',
                        background: isSelected ? '#ef4444' : 'rgba(255,255,255,0.07)',
                        color: isSelected ? '#fff' : '#94a3b8',
                        boxShadow: isSelected ? '0 4px 12px rgba(239,68,68,0.35)' : 'none'
                      }}
                    >
                      {isSelected ? '✓ ' : ''}{reason}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Optional details */}
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 8, color: '#94a3b8' }}>
                Additional details{' '}
                <span style={{ color: '#475569', fontWeight: 400 }}>(optional)</span>
              </div>
              <textarea
                value={details}
                onChange={function(e) { setDetails(e.target.value) }}
                placeholder="Describe what happened in more detail..."
                rows={3}
                style={{
                  width: '100%', padding: '11px 14px', borderRadius: 12, fontSize: 14,
                  border: '1px solid rgba(148,163,184,0.15)',
                  background: 'rgba(255,255,255,0.04)', color: '#f8fafc',
                  outline: 'none', resize: 'vertical', boxSizing: 'border-box',
                  fontFamily: 'system-ui, sans-serif'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={onDone}
                style={{
                  flex: 1, padding: '12px 0', borderRadius: 12, fontWeight: 700,
                  cursor: 'pointer', border: '1px solid rgba(148,163,184,0.15)',
                  background: 'transparent', color: '#64748b', fontSize: 14
                }}
              >
                Cancel
              </button>
              <button
                onClick={submit}
                disabled={busy || selected.length === 0}
                style={{
                  flex: 2, padding: '12px 0', borderRadius: 12, fontWeight: 900,
                  cursor: selected.length === 0 ? 'not-allowed' : 'pointer',
                  border: 'none',
                  background: selected.length > 0 ? '#ef4444' : '#374151',
                  color: '#fff', fontSize: 14,
                  transition: 'background 0.2s', opacity: busy ? 0.7 : 1
                }}
              >
                {busy ? 'Submitting...' : 'Submit report (' + selected.length + ')'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// POST-SESSION SCREEN 4: End Card
// ─────────────────────────────────────────────────────
function EndScreen({ sessionDoc, partner }) {
  var isPaid = sessionDoc && sessionDoc.participantPlanType === 'paid'
  return (
    <div style={{
      minHeight: '100dvh', background: '#080d18',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{
        width: '100%', maxWidth: 440, padding: 32, borderRadius: 24, textAlign: 'center',
        background: 'linear-gradient(135deg, #0f172a, #1e1b4b)',
        border: '1px solid rgba(148,163,184,0.15)', color: '#e2e8f0'
      }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
        <h2 style={{ margin: '0 0 8px', fontSize: 24, fontWeight: 900 }}>Session complete!</h2>
        <p style={{ color: '#94a3b8', marginBottom: 24, lineHeight: 1.6 }}>
          {sessionDoc && sessionDoc.exam ? sessionDoc.exam : ''}{' '}
          {sessionDoc && sessionDoc.subject ? '· ' + sessionDoc.subject : ''}{' '}
          — great work staying focused.
        </p>

        {/* Upgrade CTA */}
        <div style={{
          padding: 18, borderRadius: 16, marginBottom: 20,
          background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(96,165,250,0.25)'
        }}>
          <div style={{ fontWeight: 900, marginBottom: 6 }}>⭐ Want unlimited sessions?</div>
          <div style={{ color: '#94a3b8', fontSize: 14, marginBottom: 14, lineHeight: 1.6 }}>
            No time limits. Priority matching. Full session history.
            Starting at just ₹99/month.
          </div>
          <a href="/plans" style={{
            display: 'inline-block', padding: '11px 22px', borderRadius: 12,
            background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
            color: '#fff', fontWeight: 800, textDecoration: 'none', fontSize: 14
          }}>
            Upgrade now — ₹99 →
          </a>
        </div>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <a href="/join" style={{
            padding: '11px 20px', borderRadius: 12,
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(148,163,184,0.15)',
            color: '#e2e8f0', fontWeight: 700, textDecoration: 'none', fontSize: 14
          }}>
            Study again
          </a>
          <a href="/dashboard" style={{
            padding: '11px 20px', borderRadius: 12,
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(148,163,184,0.15)',
            color: '#e2e8f0', fontWeight: 700, textDecoration: 'none', fontSize: 14
          }}>
            Dashboard
          </a>
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────
// Helper sub-components
// ─────────────────────────────────────────────────────
function ConnDot({ status }) {
  var ok   = status === 'connected'
  var warn = status === 'reconnecting'
  var col  = ok ? '#4ade80' : warn ? '#f59e0b' : '#94a3b8'
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#94a3b8' }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: col, display: 'inline-block',
        boxShadow: ok ? '0 0 6px ' + col : 'none'
      }} />
      {ok ? 'Connected' : warn ? 'Reconnecting…' : 'Connecting…'}
    </span>
  )
}

function CtrlBtn({ icon, label, onClick, danger }) {
  var [pressed, setPressed] = useState(false)
  return (
    <button
      onClick={onClick}
      onPointerDown={function() { setPressed(true) }}
      onPointerUp={function() { setPressed(false) }}
      onPointerLeave={function() { setPressed(false) }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
        padding: '10px 16px', borderRadius: 16, border: 'none', cursor: 'pointer',
        background: danger ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.12)',
        color: '#fff', transition: 'all 0.12s',
        transform: pressed ? 'scale(0.92)' : 'scale(1)',
        backdropFilter: 'blur(6px)', outline: 'none', minWidth: 56
      }}
    >
      <span style={{ fontSize: 22 }}>{icon}</span>
      <span style={{ fontSize: 10, fontWeight: 700, color: danger ? '#fca5a5' : '#94a3b8' }}>
        {label}
      </span>
    </button>
  )
}

// ─────────────────────────────────────────────────────
// MAIN WebRTCRoom component
// ─────────────────────────────────────────────────────
export default function WebRTCRoom({ sessionId, session: sessionProp }) {
  var localVideoRef   = useRef(null)
  var remoteVideoRef  = useRef(null)
  var pcRef           = useRef(null)
  var localStreamRef  = useRef(null)
  var remoteStreamRef = useRef(null)
  var offerUnsubRef      = useRef(null)
  var answerUnsubRef     = useRef(null)
  var candidatesUnsubRef = useRef(null)
  var seenCandRef        = useRef(new Set())
  var timerRef           = useRef(null)
  var reconnLockRef      = useRef(false)
  var reconnAttemptsRef  = useRef(0)
  var autoJoinRef        = useRef(false)
  var currentUidRef      = useRef(null)
  var lastOfferRef       = useRef('')
  var lastAnswerRef      = useRef('')
  var cleanupLockRef     = useRef(false)
  var nudgeShownRef      = useRef(false)
  var sessionStartMsRef  = useRef(null)

  var [sessionDoc, setSessionDoc]   = useState(sessionProp || null)
  var [profile, setProfile]         = useState(null)
  var [status, setStatus]           = useState('idle')
  var [joined, setJoined]           = useState(false)
  var [micOn, setMicOn]             = useState(true)
  var [camOn, setCamOn]             = useState(true)
  var [facing, setFacing]           = useState('user')
  var [remoteReady, setRemoteReady] = useState(false)
  var [chapterDone, setChapterDone] = useState(false)
  var [chapter, setChapter]         = useState('')
  var [tick, setTick]               = useState(Date.now())
  var [creditConsumed, setCreditConsumed] = useState(false)
  var [joinBusy, setJoinBusy]       = useState(false)
  var [showNudge, setShowNudge]     = useState(false)
  var [nudgeDismissed, setNudgeDismissed] = useState(false)
  var [sessionDuration, setSessionDuration] = useState(0)

  // Controls which post-session screen shows
  // 'live' | 'summary' | 'rating' | 'report' | 'end'
  var [screen, setScreen] = useState('live')

  var partner = useMemo(function() {
    var uid = currentUidRef.current
    var parts = sessionDoc && sessionDoc.participants ? sessionDoc.participants : []
    return parts.find(function(p) { return p.uid !== uid }) || null
  }, [sessionDoc, tick])

  var isFree    = getEffectivePlanId(profile) === 'free'
  var isProUser = isProPlan(profile)

  var timerState = isFree ? getFreeTimerState(sessionDoc) : null
  var elapsed  = sessionDoc && sessionDoc.startedAt && sessionDoc.startedAt.toMillis
    ? Math.floor((tick - sessionDoc.startedAt.toMillis()) / 1000) : 0
  var setupLeft = Math.max(0, GRACE_SECS - elapsed)
  var sessLeft  = isFree ? Math.max(0, FREE_SECS - elapsed) : null
  var inGrace   = isFree && elapsed < GRACE_SECS && !chapterDone
  var timerPct  = sessLeft !== null ? (sessLeft / FREE_SECS) * 100 : 100

  // Nudge trigger
  useEffect(function() {
    if (isFree && sessLeft !== null && sessLeft <= NUDGE_SECS && !nudgeShownRef.current && !nudgeDismissed) {
      nudgeShownRef.current = true
      setShowNudge(true)
    }
  }, [sessLeft, isFree, nudgeDismissed])

  // Main setup
  useEffect(function() {
    reconnLockRef.current = false
    reconnAttemptsRef.current = 0
    autoJoinRef.current = false
    lastOfferRef.current = ''
    lastAnswerRef.current = ''
    cleanupLockRef.current = false
    setCreditConsumed(false)
    setScreen('live')
    setJoined(false)
    setStatus('idle')

    var unsubAuth = auth.onAuthStateChanged(async function(u) {
      currentUidRef.current = u ? u.uid : null
      if (!u) { setProfile(null); return }
      try {
        var snap = await getDoc(doc(db, 'users', u.uid))
        if (!snap.exists()) {
          var base = Object.assign({}, DEFAULT_PROFILE, {
            uid: u.uid, name: u.displayName || '',
            email: u.email || '', updatedAt: serverTimestamp()
          })
          await setDoc(doc(db, 'users', u.uid), base, { merge: true })
          setProfile(base)
          return
        }
        setProfile(Object.assign({}, DEFAULT_PROFILE, { id: snap.id }, snap.data()))
      } catch(e) { console.warn(e) }
    })

    var unsubSession = onSnapshot(doc(db, 'sessions', sessionId), function(snap) {
      if (!snap.exists()) return
      var data = Object.assign({ id: snap.id }, snap.data())
      setSessionDoc(data)
      if (data.status === 'finished' && screen === 'live') {
        // Calculate how long the session ran
        var startMs = sessionStartMsRef.current ||
          (data.startedAt && data.startedAt.toMillis ? data.startedAt.toMillis() : Date.now())
        setSessionDuration(Math.floor((Date.now() - startMs) / 1000))
        cleanup()
        // Route to correct first post-session screen
        if (isProUser) {
          setScreen('summary')
        } else {
          setScreen('rating')
        }
      }
    })

    timerRef.current = setInterval(function() { setTick(Date.now()) }, 1000)

    return function() {
      unsubAuth()
      unsubSession()
      clearInterval(timerRef.current)
      cleanup()
    }
  }, [sessionId])

  // Billing listener
  useEffect(function() {
    if (!auth.currentUser || !auth.currentUser.uid) return
    var uid = auth.currentUser.uid
    var unsub = onSnapshot(doc(db, 'sessions', sessionId, 'billing', uid), function(snap) {
      setCreditConsumed(Boolean(snap.exists() && snap.data() && snap.data().consumed))
    })
    return function() { unsub() }
  }, [sessionId])

  // Auto-join
  useEffect(function() {
    var uid = currentUidRef.current
    if (!uid || !sessionDoc || joined || screen !== 'live' || joinBusy) return
    if (sessionDoc.status !== 'active' && sessionDoc.status !== 'matching') return
    var parts = sessionDoc.participants || []
    if (!parts.some(function(p) { return p.uid === uid }) && sessionDoc.initiatorUid !== uid) return
    if (autoJoinRef.current) return
    autoJoinRef.current = true
    var t = setTimeout(function() {
      joinMeeting().catch(function() { autoJoinRef.current = false })
    }, 450)
    return function() { clearTimeout(t) }
  }, [sessionDoc, joined, screen, joinBusy])

  // Credit deduction
  useEffect(function() {
    if (!sessionDoc || !isFree || creditConsumed || !timerState || !timerState.gracePassed) return
    if (!auth.currentUser) return
    consumeFreeCreditOnce({
      db: db,
      sessionId: sessionId,
      uid: auth.currentUser.uid,
      mode: sessionDoc.mode,
      userRef: doc(db, 'users', auth.currentUser.uid)
    }).then(function(r) {
      if (r && r.consumed) setCreditConsumed(true)
    }).catch(function(e) { console.warn(e) })
  }, [sessionDoc, isFree, timerState && timerState.gracePassed, creditConsumed, sessionId])

  // Timer expiry
  useEffect(function() {
    if (!sessionDoc || !isFree || !timerState || !timerState.finished) return
    if (sessionDoc.status === 'finished') return
    endSession(true)
  }, [sessionDoc, isFree, timerState && timerState.finished])

  async function cleanup() {
    if (cleanupLockRef.current) return
    cleanupLockRef.current = true
    try { if (offerUnsubRef.current) offerUnsubRef.current() } catch(e) {}
    try { if (answerUnsubRef.current) answerUnsubRef.current() } catch(e) {}
    try { if (candidatesUnsubRef.current) candidatesUnsubRef.current() } catch(e) {}
    offerUnsubRef.current = null
    answerUnsubRef.current = null
    candidatesUnsubRef.current = null
    seenCandRef.current = new Set()
    try {
      if (pcRef.current) {
        pcRef.current.oniceconnectionstatechange = null
        pcRef.current.ontrack = null
        pcRef.current.onicecandidate = null
        pcRef.current.close()
        pcRef.current = null
      }
    } catch(e) {}
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(function(t) { t.stop() })
        localStreamRef.current = null
      }
    } catch(e) {}
    try {
      if (remoteStreamRef.current) {
        remoteStreamRef.current.getTracks().forEach(function(t) { t.stop() })
        remoteStreamRef.current = null
      }
    } catch(e) {}
    setJoined(false)
    cleanupLockRef.current = false
  }

  async function ensureStartedAt() {
    await runTransaction(db, async function(tx) {
      var snap = await tx.get(doc(db, 'sessions', sessionId))
      if (!snap.exists()) throw new Error('session-missing')
      var patch = {}
      if (!snap.data().startedAt) patch.startedAt = serverTimestamp()
      if (snap.data().status !== 'active') patch.status = 'active'
      if (Object.keys(patch).length > 0) tx.set(doc(db, 'sessions', sessionId), patch, { merge: true })
    })
  }

  async function publishCand(c) {
    await addDoc(collection(db, 'sessions', sessionId, 'candidates'), {
      sender: currentUidRef.current,
      candidate: c.toJSON(),
      ts: Date.now()
    })
  }

  async function getStream(facingMode) {
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, sampleRate: 48000 },
        video: { facingMode: { ideal: facingMode }, width: { ideal: 1280, min: 640 }, height: { ideal: 720, min: 360 }, frameRate: { ideal: 30, max: 30 } }
      })
    } catch(e) {
      return navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: { ideal: facingMode } } })
    }
  }

  async function boostQuality(pc) {
    try {
      var vs = pc.getSenders().find(function(s) { return s.track && s.track.kind === 'video' })
      if (vs) {
        var p = vs.getParameters ? vs.getParameters() : {}
        if (!p.encodings) p.encodings = [{}]
        p.encodings[0].maxBitrate = 2500000
        p.encodings[0].maxFramerate = 30
        p.degradationPreference = 'maintain-resolution'
        await vs.setParameters(p).catch(function() {})
      }
      var as = pc.getSenders().find(function(s) { return s.track && s.track.kind === 'audio' })
      if (as) {
        var ap = as.getParameters ? as.getParameters() : {}
        if (!ap.encodings) ap.encodings = [{}]
        ap.encodings[0].maxBitrate = 64000
        await as.setParameters(ap).catch(function() {})
      }
    } catch(e) {}
  }

  async function setupSignaling(pc, selfUid) {
    var initUid = sessionDoc && sessionDoc.initiatorUid ? sessionDoc.initiatorUid :
      (sessionDoc && sessionDoc.participants && sessionDoc.participants[0] ? sessionDoc.participants[0].uid : selfUid)
    var amInit = initUid === selfUid
    var offerRef  = doc(db, 'sessions', sessionId, 'signaling', 'offer')
    var answerRef = doc(db, 'sessions', sessionId, 'signaling', 'answer')

    candidatesUnsubRef.current = onSnapshot(collection(db, 'sessions', sessionId, 'candidates'), function(snap) {
      snap.docChanges().forEach(async function(ch) {
        if (ch.type !== 'added' || seenCandRef.current.has(ch.doc.id)) return
        seenCandRef.current.add(ch.doc.id)
        var d = ch.doc.data()
        if (!d || d.sender === selfUid) return
        try { await pc.addIceCandidate(new RTCIceCandidate(d.candidate)) } catch(e) {}
      })
    })

    if (amInit) {
      answerUnsubRef.current = onSnapshot(answerRef, async function(snap) {
        if (!snap.exists()) return
        var d = snap.data()
        if (!d || !d.sdp || d.sdp === lastAnswerRef.current) return
        try { await pc.setRemoteDescription({ type: 'answer', sdp: d.sdp }); lastAnswerRef.current = d.sdp } catch(e) {}
      })
    } else {
      offerUnsubRef.current = onSnapshot(offerRef, async function(snap) {
        if (!snap.exists()) return
        var d = snap.data()
        if (!d || !d.sdp || d.sdp === lastOfferRef.current) return
        try {
          await pc.setRemoteDescription({ type: 'offer', sdp: d.sdp })
          lastOfferRef.current = d.sdp
          var ans = await pc.createAnswer()
          ans.sdp = preferVP9(ans.sdp)
          await pc.setLocalDescription(ans)
          await setDoc(answerRef, { type: ans.type, sdp: ans.sdp, sender: selfUid, createdAt: serverTimestamp() }, { merge: true })
        } catch(e) {}
      })
    }
  }

  async function joinMeeting() {
    if (!auth.currentUser || joined || (sessionDoc && sessionDoc.status === 'finished')) return
    setJoinBusy(true)
    try {
      setStatus('getting-media')
      await ensureStartedAt()
      sessionStartMsRef.current = Date.now()

      var stream = await getStream(facing)
      localStreamRef.current = stream
      var vt = stream.getVideoTracks()[0]
      if (vt) vt.contentHint = 'detail'

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
        localVideoRef.current.muted = true
        localVideoRef.current.playsInline = true
        await localVideoRef.current.play().catch(function() {})
      }

      var pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
      pcRef.current = pc
      var remote = new MediaStream()
      remoteStreamRef.current = remote

      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = remote
        remoteVideoRef.current.playsInline = true
      }

      pc.ontrack = function(ev) {
        var track = ev.track
        if (track && !remote.getTracks().some(function(t) { return t.id === track.id })) {
          remote.addTrack(track)
        }
        setRemoteReady(true)
        if (remoteVideoRef.current) remoteVideoRef.current.play().catch(function() {})
      }

      stream.getTracks().forEach(function(t) { pc.addTrack(t, stream) })
      await boostQuality(pc)

      pc.onicecandidate = function(ev) { if (ev.candidate) publishCand(ev.candidate) }
      pc.oniceconnectionstatechange = function() {
        var st = pc.iceConnectionState
        if (st === 'connected' || st === 'completed') {
          reconnLockRef.current = false
          reconnAttemptsRef.current = 0
          setStatus('connected')
        }
        if (st === 'disconnected' || st === 'failed') {
          setStatus('reconnecting')
          if (reconnAttemptsRef.current < 4) {
            reconnAttemptsRef.current++
            restartConn().catch(function() {})
          }
        }
      }

      await setupSignaling(pc, auth.currentUser.uid)
      var selfUid = auth.currentUser.uid
      var initUid = sessionDoc && sessionDoc.initiatorUid ? sessionDoc.initiatorUid :
        (sessionDoc && sessionDoc.participants && sessionDoc.participants[0] ? sessionDoc.participants[0].uid : selfUid)

      if (initUid === selfUid) {
        var offer = await pc.createOffer()
        offer.sdp = preferVP9(offer.sdp)
        await pc.setLocalDescription(offer)
        lastOfferRef.current = offer.sdp
        await setDoc(doc(db, 'sessions', sessionId, 'signaling', 'offer'), {
          type: offer.type, sdp: offer.sdp, sender: selfUid, createdAt: serverTimestamp()
        }, { merge: true })
      }

      setJoined(true)
      setStatus('connected')
    } catch(e) {
      console.error(e)
      autoJoinRef.current = false
      alert('Camera/mic access failed. Please allow permissions and reload.')
      setStatus('error')
    } finally { setJoinBusy(false) }
  }

  async function restartConn() {
    var pc = pcRef.current
    if (!pc || reconnLockRef.current || (sessionDoc && sessionDoc.status === 'finished')) return
    reconnLockRef.current = true
    try {
      if (pc.restartIce) pc.restartIce()
      await sleep(250)
      var offer = await pc.createOffer({ iceRestart: true })
      offer.sdp = preferVP9(offer.sdp)
      await pc.setLocalDescription(offer)
      lastOfferRef.current = offer.sdp
      await setDoc(doc(db, 'sessions', sessionId, 'signaling', 'offer'), {
        type: offer.type, sdp: offer.sdp,
        sender: currentUidRef.current, iceRestart: true, updatedAt: serverTimestamp()
      }, { merge: true })
    } catch(e) {} finally { setTimeout(function() { reconnLockRef.current = false }, 3000) }
  }

  function toggleMic() {
    if (localStreamRef.current) localStreamRef.current.getAudioTracks().forEach(function(t) { t.enabled = !t.enabled })
    setMicOn(function(v) { return !v })
  }
  function toggleCam() {
    if (localStreamRef.current) localStreamRef.current.getVideoTracks().forEach(function(t) { t.enabled = !t.enabled })
    setCamOn(function(v) { return !v })
  }
  async function switchCam() {
    var next = facing === 'user' ? 'environment' : 'user'
    try {
      var stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: next }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      var track = stream.getVideoTracks()[0]
      if (!track) return
      track.contentHint = 'detail'
      var sender = pcRef.current && pcRef.current.getSenders().find(function(s) { return s.track && s.track.kind === 'video' })
      if (sender) await sender.replaceTrack(track)
      var audio = localStreamRef.current ? localStreamRef.current.getAudioTracks() : []
      if (localStreamRef.current) localStreamRef.current.getVideoTracks().forEach(function(t) { t.stop() })
      var ns = new MediaStream(audio.concat([track]))
      localStreamRef.current = ns
      if (localVideoRef.current) { localVideoRef.current.srcObject = ns; await localVideoRef.current.play().catch(function() {}) }
      setFacing(next)
    } catch(e) { alert('Could not switch camera.') }
  }

  async function endSession(fromTimer) {
    try {
      await updateDoc(doc(db, 'sessions', sessionId), {
        status: 'finished',
        endedAt: serverTimestamp(),
        endedByTimer: !!fromTimer
      })
    } catch(e) {}
    var startMs = sessionStartMsRef.current ||
      (sessionDoc && sessionDoc.startedAt && sessionDoc.startedAt.toMillis ? sessionDoc.startedAt.toMillis() : Date.now())
    setSessionDuration(Math.floor((Date.now() - startMs) / 1000))
    await cleanup()
    if (isProUser) {
      setScreen('summary')
    } else {
      setScreen('rating')
    }
  }

  // ── Post-session routing ──────────────────────────
  if (screen === 'summary') {
    return (
      <SessionSummary
        sessionDoc={sessionDoc}
        durationSecs={sessionDuration}
        partner={partner}
        onContinue={function() { setScreen('rating') }}
      />
    )
  }

  if (screen === 'rating') {
    return (
      <RatingScreen
        partner={partner}
        sessionId={sessionId}
        selfUid={currentUidRef.current}
        onDone={function() { setScreen('end') }}
        onReport={function() { setScreen('report') }}
      />
    )
  }

  if (screen === 'report') {
    return (
      <ReportScreen
        partner={partner}
        sessionId={sessionId}
        reporterUid={currentUidRef.current}
        reporterName={auth.currentUser ? auth.currentUser.displayName : ''}
        onDone={function() { setScreen('end') }}
      />
    )
  }

  if (screen === 'end') {
    return <EndScreen sessionDoc={sessionDoc} partner={partner} />
  }

  // ── LIVE VIDEO ROOM ───────────────────────────────
  return (
    <div style={{
      fontFamily: 'system-ui, sans-serif', background: '#080d18',
      display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden'
    }}>

      {/* Top bar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '8px 14px', background: 'rgba(8,13,24,0.98)',
        borderBottom: '1px solid rgba(148,163,184,0.08)',
        flexShrink: 0, minHeight: 44, gap: 8
      }}>
        <div>
          <div style={{ fontWeight: 800, color: '#e2e8f0', fontSize: 14 }}>
            {sessionDoc && sessionDoc.exam ? sessionDoc.exam : ''}{' '}
            {sessionDoc && sessionDoc.subject ? '· ' + sessionDoc.subject : ''}
          </div>
          <ConnDot status={status} />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {!isFree ? (
            <span style={{
              padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: 'rgba(251,191,36,0.1)', color: '#fbbf24',
              border: '1px solid rgba(251,191,36,0.2)'
            }}>⭐ Unlimited</span>
          ) : null}
          {isProUser ? (
            <span style={{
              padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
              background: 'rgba(139,92,246,0.1)', color: '#a78bfa',
              border: '1px solid rgba(139,92,246,0.2)'
            }}>🏆 Pro</span>
          ) : null}
        </div>
      </div>

      {/* Chapter selection banner */}
      {joined && inGrace && isFree ? (
        <div style={{ background: '#0f172a', borderBottom: '2px solid #2563eb', padding: '12px 16px', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>
            📖 What are you studying? —{' '}
            <span style={{ color: setupLeft <= 30 ? '#ef4444' : '#4ade80', fontWeight: 900 }}>
              {fmt(setupLeft)}
            </span>{' '}left ·{' '}
            <span style={{ color: '#4ade80' }}>Leave now = free, no credit used</span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              value={chapter}
              onChange={function(e) { setChapter(e.target.value) }}
              onKeyDown={function(e) {
                if (e.key === 'Enter' && chapter.trim()) {
                  setChapterDone(true)
                  updateDoc(doc(db, 'sessions', sessionId), { chapter: chapter.trim() }).catch(function() {})
                }
              }}
              placeholder="e.g. Newton's Laws, Organic Chemistry..."
              style={{
                flex: 1, minWidth: 160, padding: '9px 12px', borderRadius: 10, fontSize: 14,
                border: '1px solid rgba(148,163,184,0.2)', background: 'rgba(255,255,255,0.07)',
                color: '#f8fafc', outline: 'none'
              }}
            />
            <button
              onClick={function() { endSession(false) }}
              style={{
                padding: '9px 14px', borderRadius: 10, fontWeight: 700, fontSize: 13,
                border: '1px solid rgba(148,163,184,0.15)', background: 'rgba(255,255,255,0.05)',
                color: '#94a3b8', cursor: 'pointer'
              }}
            >
              Leave
            </button>
            <button
              onClick={function() {
                setChapterDone(true)
                if (chapter.trim()) updateDoc(doc(db, 'sessions', sessionId), { chapter: chapter.trim() }).catch(function() {})
              }}
              style={{
                padding: '9px 18px', borderRadius: 10, fontWeight: 900, fontSize: 13,
                border: 'none', background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
                color: '#fff', cursor: 'pointer'
              }}
            >
              Start →
            </button>
          </div>
        </div>
      ) : null}

      {/* Upgrade nudge */}
      {showNudge && !nudgeDismissed && isFree ? (
        <div style={{
          padding: '8px 14px', background: 'rgba(239,68,68,0.16)',
          borderBottom: '1px solid rgba(239,68,68,0.25)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          gap: 8, flexShrink: 0, flexWrap: 'wrap'
        }}>
          <span style={{ color: '#fca5a5', fontWeight: 800, fontSize: 13 }}>
            ⏰ 5 min left!{' '}
            <span style={{ color: '#94a3b8', fontWeight: 400 }}>Upgrade to study without limits.</span>
          </span>
          <div style={{ display: 'flex', gap: 6 }}>
            <a href="/plans" style={{
              padding: '6px 12px', borderRadius: 8, fontWeight: 800, fontSize: 12,
              background: '#ef4444', color: '#fff', textDecoration: 'none'
            }}>₹99 →</a>
            <button
              onClick={function() { setNudgeDismissed(true) }}
              style={{
                padding: '6px 9px', borderRadius: 8,
                border: '1px solid rgba(148,163,184,0.15)',
                background: 'transparent', color: '#64748b', cursor: 'pointer', fontSize: 12
              }}
            >✕</button>
          </div>
        </div>
      ) : null}

      {/* VIDEO — big, takes most of screen */}
      <div style={{
        position: 'relative', background: '#000', flexShrink: 0,
        height: isFree ? '62dvh' : '72dvh', minHeight: '62dvh'
      }}>

        {/* Remote video — always mounted */}
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', background: '#000' }}
        />

        {/* Waiting overlay */}
        {!remoteReady && status !== 'idle' ? (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', background: 'rgba(8,13,24,0.92)'
          }}>
            <div style={{ fontSize: 52, marginBottom: 14 }}>⏳</div>
            <div style={{ color: '#e2e8f0', fontWeight: 800, fontSize: 17 }}>Waiting for partner...</div>
            <div style={{ color: '#64748b', fontSize: 13, marginTop: 6 }}>Usually a few seconds</div>
          </div>
        ) : null}

        {/* Reconnecting overlay */}
        {status === 'reconnecting' ? (
          <div style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center', background: 'rgba(8,13,24,0.7)'
          }}>
            <div style={{ fontSize: 44, marginBottom: 10 }}>🔄</div>
            <div style={{ color: '#f59e0b', fontWeight: 800 }}>Reconnecting...</div>
          </div>
        ) : null}

        {/* Partner name tag */}
        {partner && partner.name && remoteReady ? (
          <div style={{
            position: 'absolute', top: 12, left: 12,
            padding: '4px 12px', borderRadius: 999,
            background: 'rgba(0,0,0,0.6)', color: '#fff',
            fontSize: 12, fontWeight: 700, backdropFilter: 'blur(6px)'
          }}>
            {partner.name} 🟢
          </div>
        ) : null}

        {/* Local PIP — always mounted, stays in DOM */}
        <div style={{
          position: 'absolute', bottom: 76, right: 10,
          width: 88, height: 118, borderRadius: 12, overflow: 'hidden',
          border: '2px solid rgba(255,255,255,0.18)', background: '#111',
          zIndex: 10, boxShadow: '0 4px 16px rgba(0,0,0,0.6)'
        }}>
          <video
            ref={localVideoRef}
            autoPlay playsInline muted
            style={{
              width: '100%', height: '100%', objectFit: 'cover',
              transform: facing === 'user' ? 'scaleX(-1)' : 'none'
            }}
          />
          {!camOn ? (
            <div style={{
              position: 'absolute', inset: 0, background: '#111',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24
            }}>🚫</div>
          ) : null}
          <div style={{
            position: 'absolute', bottom: 3, left: 0, right: 0,
            textAlign: 'center', fontSize: 9, color: 'rgba(255,255,255,0.5)', fontWeight: 700
          }}>YOU</div>
        </div>

        {/* Floating controls */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0,
          padding: '14px 16px',
          background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, transparent 100%)',
          display: 'flex', justifyContent: 'center', gap: 10, zIndex: 20
        }}>
          <CtrlBtn icon={micOn ? '🎤' : '🔇'} label={micOn ? 'Mute' : 'Unmute'} onClick={toggleMic} danger={!micOn} />
          <CtrlBtn icon={camOn ? '📷' : '🚫'} label={camOn ? 'Cam off' : 'Cam on'} onClick={toggleCam} danger={!camOn} />
          <CtrlBtn icon="🔄" label="Flip" onClick={switchCam} danger={false} />
          <CtrlBtn icon="📵" label="End" onClick={function() { endSession(false) }} danger={true} />
        </div>
      </div>

      {/* Timer strip — below video */}
      {isFree && sessLeft !== null ? (
        <div style={{
          background: '#0d1525', borderTop: '1px solid rgba(148,163,184,0.08)',
          padding: '10px 16px', flexShrink: 0
        }}>
          <div style={{ height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.07)', marginBottom: 8, overflow: 'hidden' }}>
            <div style={{
              height: '100%', borderRadius: 999, width: timerPct + '%',
              background: tColor(sessLeft), transition: 'width 1s linear, background 0.5s'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ color: '#374151', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {inGrace ? 'Setup (leave = free)' : 'Time remaining'}
              </div>
              <div style={{
                fontSize: 28, fontWeight: 900, letterSpacing: 2,
                color: tColor(sessLeft), fontVariantNumeric: 'tabular-nums', lineHeight: 1.1
              }}>
                {fmt(sessLeft)}
              </div>
              {sessLeft <= 60 && sessLeft > 0 ? (
                <div style={{ color: '#ef4444', fontSize: 11, fontWeight: 700 }}>🔴 Ending now!</div>
              ) : null}
            </div>
            <a href="/plans" style={{
              padding: '9px 14px', borderRadius: 12, fontWeight: 800, fontSize: 12,
              background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
              color: '#fff', textDecoration: 'none', textAlign: 'center', lineHeight: 1.4
            }}>
              Upgrade<br />
              <span style={{ fontSize: 10, opacity: 0.8, fontWeight: 500 }}>No limits</span>
            </a>
          </div>
        </div>
      ) : null}

      {/* Paid status bar */}
      {!isFree ? (
        <div style={{
          padding: '7px 16px', background: '#0d1525',
          borderTop: '1px solid rgba(148,163,184,0.06)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0
        }}>
          <ConnDot status={status} />
          <span style={{ fontSize: 12, color: '#4ade80', fontWeight: 700 }}>⭐ No time limit</span>
        </div>
      ) : null}

      {/* Chat */}
      <div style={{
        flex: 1, background: '#0a0f1e',
        borderTop: '1px solid rgba(148,163,184,0.06)',
        overflowY: 'auto', minHeight: 0
      }}>
        <Chat sessionId={sessionId} />
      </div>
    </div>
  )
}
