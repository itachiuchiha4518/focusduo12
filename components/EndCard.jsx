'use client'

import { useState } from 'react'
import { addDoc, collection, doc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db } from '../lib/firebase'
import Link from 'next/link'

var bg     = '#F7F6F2'
var white  = '#FFFFFF'
var border = '#E4E2DC'
var text   = '#1A1A18'
var text2  = '#6B6860'
var text3  = '#A8A59F'
var dark   = '#1A1A18'

var REASONS = [
  'Not studying / wasting time',
  'Abusive or offensive language',
  'Showing vulgar content on camera',
  'Harassment or bullying',
  'Disconnecting on purpose',
  'Fake profile',
  'Other',
]

function isPro(profile) {
  if (!profile) return false
  var id = profile.planId || 'free'
  return id === 'yearly_699' || id === 'first100_year_199' || id === 'monthly_99' || id === 'quarterly_199'
}

export default function EndCard({ sessionId, partnerUid, partnerName, sessionMeta, onStartNew, profile }) {
  // Tab: 'end' | 'report'
  var [tab, setTab]         = useState('end')
  var [selected, setSelected] = useState([])
  var [details, setDetails] = useState('')
  var [notes, setNotes]     = useState('')
  var [notesSaved, setNotesSaved] = useState(false)
  var [sending, setSending] = useState(false)
  var [savingNotes, setSavingNotes] = useState(false)
  var [reportDone, setReportDone] = useState('')

  var proUser = isPro(profile)

  function toggleReason(r) {
    setSelected(function(prev) {
      return prev.includes(r) ? prev.filter(function(x) { return x !== r }) : prev.concat([r])
    })
  }

  async function submitReport() {
    if (!auth.currentUser) return
    if (selected.length === 0 && !details.trim()) { alert('Select at least one reason.'); return }
    setSending(true)
    try {
      await addDoc(collection(db, 'reports'), {
        reporterUid:    auth.currentUser.uid,
        reporterName:   auth.currentUser.displayName || auth.currentUser.email || 'Anonymous',
        reportedUid:    partnerUid || null,
        reportedName:   partnerName || null,
        sessionId:      sessionId || null,
        sessionExam:    sessionMeta && sessionMeta.exam    ? sessionMeta.exam    : null,
        sessionSubject: sessionMeta && sessionMeta.subject ? sessionMeta.subject : null,
        sessionMode:    sessionMeta && sessionMeta.mode    ? sessionMeta.mode    : null,
        selectedReasons: selected,
        details:        details.trim(),
        status:         'open',
        createdAt:      serverTimestamp()
      })
      setReportDone('Report submitted. Our team will review it.')
      setSelected([])
      setDetails('')
    } catch(e) {
      console.error(e)
      alert('Failed to submit report. Please try again.')
    } finally { setSending(false) }
  }

  async function saveNotes() {
    if (!auth.currentUser || !sessionId || !notes.trim()) return
    setSavingNotes(true)
    try {
      await setDoc(
        doc(db, 'sessions', sessionId, 'notes', auth.currentUser.uid),
        { uid: auth.currentUser.uid, notes: notes.trim(), updatedAt: serverTimestamp() },
        { merge: true }
      )
      setNotesSaved(true)
    } catch(e) {
      console.error(e)
      alert('Failed to save notes.')
    } finally { setSavingNotes(false) }
  }

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: 'DM Sans, system-ui, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* Tab switcher */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 20, background: white, border: '1px solid ' + border, borderRadius: 9, padding: 3 }}>
          <button
            onClick={function() { setTab('end') }}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 7, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: tab === 'end' ? dark : 'transparent',
              color:      tab === 'end' ? white : text2,
              fontFamily: 'DM Sans, system-ui, sans-serif'
            }}
          >
            Session ended
          </button>
          <button
            onClick={function() { setTab('report') }}
            style={{
              flex: 1, padding: '8px 0', borderRadius: 7, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: 'pointer', transition: 'all 0.15s',
              background: tab === 'report' ? dark : 'transparent',
              color:      tab === 'report' ? white : text2,
              fontFamily: 'DM Sans, system-ui, sans-serif'
            }}
          >
            Report partner
          </button>
        </div>

        {/* ── END TAB ── */}
        {tab === 'end' ? (
          <div>
            <div style={{ background: white, border: '1px solid ' + border, borderRadius: 10, padding: 24, marginBottom: 12 }}>
              <h2 style={{ fontFamily: 'Lora, Georgia, serif', fontSize: 22, fontWeight: 600, color: text, marginBottom: 8, letterSpacing: '-0.01em' }}>
                Session complete
              </h2>
              <p style={{ fontSize: 14, color: text2, lineHeight: 1.65, marginBottom: 20 }}>
                You studied with <strong style={{ color: text }}>{partnerName || 'your partner'}</strong>
                {sessionMeta && sessionMeta.subject ? ' — ' + (sessionMeta.exam || '') + ' ' + sessionMeta.subject : ''}.
              </p>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <button
                  onClick={onStartNew}
                  style={{
                    padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                    background: dark, color: white, border: 'none', cursor: 'pointer',
                    fontFamily: 'DM Sans, system-ui, sans-serif'
                  }}
                >
                  Study again
                </button>
                <Link href="/dashboard" style={{
                  padding: '10px 18px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                  background: 'transparent', color: text, border: '1px solid ' + border,
                  cursor: 'pointer', textDecoration: 'none', display: 'inline-flex', alignItems: 'center'
                }}>
                  Dashboard
                </Link>
              </div>
            </div>

            {/* Upgrade nudge for free users */}
            {!proUser ? (
              <div style={{ background: white, border: '1px solid ' + border, borderRadius: 10, padding: 20, marginBottom: 12 }}>
                <p style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 6 }}>Want unlimited sessions?</p>
                <p style={{ fontSize: 13, color: text2, lineHeight: 1.65, marginBottom: 14 }}>
                  Pro gives you unlimited sessions with no time limit, priority matching, full session history, and session notes. From Rs 99 per month.
                </p>
                <Link href="/plans" style={{
                  display: 'inline-block', padding: '9px 18px', borderRadius: 8,
                  background: dark, color: white, fontWeight: 600, fontSize: 13,
                  textDecoration: 'none'
                }}>
                  See Pro plans
                </Link>
              </div>
            ) : null}

            {/* Session notes — Pro only */}
            {proUser ? (
              <div style={{ background: white, border: '1px solid ' + border, borderRadius: 10, padding: 20 }}>
                <p style={{ fontSize: 13, fontWeight: 600, color: text, marginBottom: 4 }}>Session notes</p>
                <p style={{ fontSize: 12, color: text3, marginBottom: 12, lineHeight: 1.6 }}>
                  Write what you covered, what to revise, anything you want to remember. Saved to your session history.
                </p>
                {notesSaved ? (
                  <p style={{ fontSize: 13, color: '#166534', fontWeight: 600 }}>Notes saved.</p>
                ) : (
                  <>
                    <textarea
                      value={notes}
                      onChange={function(e) { setNotes(e.target.value) }}
                      placeholder="e.g. Covered Newton's 3rd law, need to revise friction problems, formula for impulse..."
                      rows={4}
                      style={{
                        width: '100%', padding: '10px 12px', borderRadius: 8,
                        border: '1px solid ' + border, background: bg,
                        color: text, fontSize: 14, outline: 'none',
                        resize: 'vertical', fontFamily: 'DM Sans, system-ui, sans-serif',
                        lineHeight: 1.6, boxSizing: 'border-box', marginBottom: 10
                      }}
                    />
                    <button
                      onClick={saveNotes}
                      disabled={savingNotes || !notes.trim()}
                      style={{
                        padding: '9px 18px', borderRadius: 8, fontWeight: 600, fontSize: 13,
                        background: notes.trim() ? dark : border,
                        color: notes.trim() ? white : text3,
                        border: 'none', cursor: notes.trim() ? 'pointer' : 'not-allowed',
                        fontFamily: 'DM Sans, system-ui, sans-serif', transition: 'all 0.15s'
                      }}
                    >
                      {savingNotes ? 'Saving...' : 'Save notes'}
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
        ) : null}

        {/* ── REPORT TAB ── */}
        {tab === 'report' ? (
          <div style={{ background: white, border: '1px solid ' + border, borderRadius: 10, padding: 24 }}>
            <h2 style={{ fontFamily: 'Lora, Georgia, serif', fontSize: 20, fontWeight: 600, color: text, marginBottom: 8, letterSpacing: '-0.01em' }}>
              Report partner
            </h2>
            <p style={{ fontSize: 14, color: text2, lineHeight: 1.65, marginBottom: 20 }}>
              What happened with <strong style={{ color: text }}>{partnerName || 'your partner'}</strong>? Select all that apply.
            </p>

            {reportDone ? (
              <div style={{ padding: '14px', borderRadius: 8, background: bg, border: '1px solid ' + border, fontSize: 14, color: '#166534', fontWeight: 600, marginBottom: 16 }}>
                {reportDone}
              </div>
            ) : (
              <>
                {/* Reason chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                  {REASONS.map(function(r) {
                    var active = selected.includes(r)
                    return (
                      <button
                        key={r}
                        onClick={function() { toggleReason(r) }}
                        style={{
                          padding: '7px 14px', borderRadius: 999, fontSize: 13, fontWeight: 500,
                          border: '1px solid ' + (active ? dark : border),
                          background: active ? dark : white,
                          color: active ? white : text2,
                          cursor: 'pointer', transition: 'all 0.15s',
                          fontFamily: 'DM Sans, system-ui, sans-serif'
                        }}
                      >
                        {r}
                      </button>
                    )
                  })}
                </div>

                {/* Details */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 13, fontWeight: 600, color: text2, display: 'block', marginBottom: 6 }}>
                    Additional details <span style={{ color: text3, fontWeight: 400 }}>(optional)</span>
                  </label>
                  <textarea
                    value={details}
                    onChange={function(e) { setDetails(e.target.value) }}
                    placeholder="Describe what happened..."
                    rows={3}
                    style={{
                      width: '100%', padding: '10px 12px', borderRadius: 8,
                      border: '1px solid ' + border, background: bg,
                      color: text, fontSize: 14, outline: 'none',
                      resize: 'vertical', fontFamily: 'DM Sans, system-ui, sans-serif',
                      lineHeight: 1.6, boxSizing: 'border-box'
                    }}
                  />
                </div>

                <div style={{ display: 'flex', gap: 10 }}>
                  <button
                    onClick={function() { setTab('end') }}
                    style={{
                      padding: '10px 18px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                      background: 'transparent', color: text2, border: '1px solid ' + border,
                      cursor: 'pointer', fontFamily: 'DM Sans, system-ui, sans-serif'
                    }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={submitReport}
                    disabled={sending || (selected.length === 0 && !details.trim())}
                    style={{
                      padding: '10px 20px', borderRadius: 8, fontWeight: 600, fontSize: 14,
                      background: (selected.length > 0 || details.trim()) ? '#B91C1C' : border,
                      color: (selected.length > 0 || details.trim()) ? white : text3,
                      border: 'none',
                      cursor: (selected.length > 0 || details.trim()) ? 'pointer' : 'not-allowed',
                      fontFamily: 'DM Sans, system-ui, sans-serif', transition: 'all 0.15s'
                    }}
                  >
                    {sending ? 'Submitting...' : 'Submit report'}
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

      </div>
    </div>
  )
                          }
