'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { auth, db, googleProvider } from '../../lib/firebase'
import { signInWithPopup } from 'firebase/auth'
import {
  collection, doc, getDoc, getDocs, onSnapshot,
  runTransaction, serverTimestamp, setDoc, deleteDoc
} from 'firebase/firestore'
import { ensureUserProfile, getEffectivePlanId, remainingForMode } from '../../lib/subscriptions'
import { getLiveHoursStatus, normalizeLiveHours } from '../../lib/liveHours'

var bg     = '#F7F6F2'
var white  = '#FFFFFF'
var border = '#E4E2DC'
var text   = '#1A1A18'
var text2  = '#6B6860'
var text3  = '#A8A59F'
var dark   = '#1A1A18'

function clean(v) { return String(v || '').replace(/[^a-zA-Z0-9_-]/g, '_') }
function queueCol(exam, subject, mode) { return 'queue_' + clean(exam) + '_' + clean(subject) + '_' + clean(mode) }

export default function JoinPage() {
  var router = useRouter()
  var [exam, setExam]       = useState('JEE')
  var [subject, setSubject] = useState('Physics')
  var [mode, setMode]       = useState('one-on-one')
  var [status, setStatus]   = useState('idle')
  var [accountInfo, setAccountInfo] = useState(null)
  var [liveHours, setLiveHours]     = useState(null)
  var [waitlistCount, setWaitlistCount] = useState(0)

  var myQueueRef        = useRef(null)
  var queueListenerRef  = useRef(null)
  var ownDocListenerRef = useRef(null)
  var waitlistUnsubRef  = useRef(null)
  var matchingRef       = useRef(false)
  var redirectedRef     = useRef(false)
  var isPaidRef         = useRef(false)

  useEffect(function() {
    var unsub = onSnapshot(doc(db, 'siteConfig', 'liveHours'), function(snap) {
      setLiveHours(normalizeLiveHours(snap.exists() ? snap.data() : undefined))
    })
    return function() { unsub() }
  }, [])

  useEffect(function() {
    if (waitlistUnsubRef.current) { waitlistUnsubRef.current(); waitlistUnsubRef.current = null }
    var col = queueCol(exam, subject, mode)
    var unsub = onSnapshot(collection(db, col), function(snap) {
      setWaitlistCount(snap.docs.filter(function(d) { return !d.data().matched }).length)
    })
    waitlistUnsubRef.current = unsub
    return function() { unsub() }
  }, [exam, subject, mode])

  async function ensureLogin() {
    if (auth.currentUser) return auth.currentUser
    return (await signInWithPopup(auth, googleProvider)).user
  }

  function attachOwnDocListener(col, uid) {
    if (ownDocListenerRef.current) { ownDocListenerRef.current(); ownDocListenerRef.current = null }
    var ref = doc(db, col, uid)
    ownDocListenerRef.current = onSnapshot(ref, async function(snap) {
      if (!snap.exists()) return
      var data = snap.data()
      if (data && data.sessionId && !redirectedRef.current) {
        redirectedRef.current = true
        setStatus('matched')
        try { await deleteDoc(ref) } catch(e) {}
        if (queueListenerRef.current) { queueListenerRef.current(); queueListenerRef.current = null }
        router.push('/session/' + data.sessionId)
      }
    })
  }

  async function tryMatch(col, uid, name) {
    if (matchingRef.current || redirectedRef.current) return
    matchingRef.current = true
    try {
      var snap = await getDocs(collection(db, col))
      var candidates = snap.docs
        .filter(function(d) {
          var data = d.data()
          return data && data.uid && data.uid !== uid && !data.matched &&
            data.exam === exam && data.subject === subject && data.mode === mode
        })
        .sort(function(a, b) {
          var aPaid = a.data().isPaid ? 1 : 0
          var bPaid = b.data().isPaid ? 1 : 0
          if (bPaid !== aPaid) return bPaid - aPaid
          return (a.data().queuedAt || 0) - (b.data().queuedAt || 0)
        })

      if (!candidates[0]) { setStatus('waiting'); return }

      var partnerRef = doc(db, col, candidates[0].id)
      var myRef      = doc(db, col, uid)
      var sessionRef = doc(collection(db, 'sessions'))

      await runTransaction(db, async function(tx) {
        var mySnap    = await tx.get(myRef)
        var otherSnap = await tx.get(partnerRef)
        if (!mySnap.exists() || !otherSnap.exists()) throw new Error('queue-missing')
        var myData    = mySnap.data()
        var otherData = otherSnap.data()
        if (!myData || !otherData || myData.uid === otherData.uid) throw new Error('invalid')
        if (myData.matched || otherData.matched) throw new Error('already-matched')
        var initiatorUid = (myData.queuedAt||0) <= (otherData.queuedAt||0) ? myData.uid : otherData.uid
        tx.set(sessionRef, {
          exam, subject, mode, status: 'active', createdAt: serverTimestamp(),
          participantUids: [myData.uid, otherData.uid],
          participants: [
            { uid: myData.uid,    name: myData.name    || name      || 'Student' },
            { uid: otherData.uid, name: otherData.name  || 'Partner' }
          ],
          initiatorUid
        })
        tx.update(myRef,      { matched: true, sessionId: sessionRef.id })
        tx.update(partnerRef, { matched: true, sessionId: sessionRef.id })
      })
      setStatus('matched')
    } catch(e) { console.warn('match failed', e); setStatus('waiting') }
    finally { matchingRef.current = false }
  }

  async function startMatchmaking() {
    var liveStatus = getLiveHoursStatus(liveHours || {})
    if (!liveStatus.open) { alert(liveStatus.message || 'Sessions are closed right now.'); setStatus('closed'); return }
    setStatus('signing-in')
    var user
    try { user = await ensureLogin() }
    catch(e) { setStatus('error'); alert('Sign-in failed. Please try again.'); return }
    try {
      var profile = await ensureUserProfile(user)
      setAccountInfo(profile)
      if (profile && profile.accountStatus === 'banned') { alert('Your account is banned.'); setStatus('blocked'); return }
      var planId = getEffectivePlanId(profile)
      isPaidRef.current = planId !== 'free'
      if (planId === 'free' && remainingForMode(profile, mode) <= 0) {
        alert('No free sessions left for this mode. Upgrade to continue.')
        router.push('/plans')
        return
      }
    } catch(e) { console.warn('profile init failed', e) }

    var uid     = user.uid
    var name    = user.displayName || user.email || 'Student'
    var col     = queueCol(exam, subject, mode)
    var myRef   = doc(db, col, uid)
    myQueueRef.current = myRef; redirectedRef.current = false; matchingRef.current = false

    try {
      var existing = await getDoc(myRef)
      if (existing.exists()) {
        var d = existing.data()
        if (d && d.sessionId && d.matched) { router.push('/session/' + d.sessionId); return }
      }
      await setDoc(myRef, { uid, name, exam, subject, mode, matched: false, sessionId: null, queuedAt: Date.now(), createdAt: serverTimestamp(), isPaid: isPaidRef.current })
    } catch(e) { setStatus('error'); alert('Failed to join queue.'); return }

    attachOwnDocListener(col, uid)
    if (queueListenerRef.current) { queueListenerRef.current(); queueListenerRef.current = null }
    queueListenerRef.current = onSnapshot(collection(db, col), async function() {
      if (!redirectedRef.current) await tryMatch(col, uid, name)
    })
    setStatus('searching')
    await tryMatch(col, uid, name)
  }

  async function cancelQueue() {
    if (myQueueRef.current) try { await deleteDoc(myQueueRef.current) } catch(e) {}
    if (queueListenerRef.current) { queueListenerRef.current(); queueListenerRef.current = null }
    if (ownDocListenerRef.current) { ownDocListenerRef.current(); ownDocListenerRef.current = null }
    myQueueRef.current = null; matchingRef.current = false; redirectedRef.current = false
    setStatus('idle')
  }

  useEffect(function() {
    function onUnload() { if (myQueueRef.current) deleteDoc(myQueueRef.current).catch(function() {}) }
    window.addEventListener('beforeunload', onUnload)
    return function() {
      window.removeEventListener('beforeunload', onUnload)
      if (queueListenerRef.current) queueListenerRef.current()
      if (ownDocListenerRef.current) ownDocListenerRef.current()
      if (waitlistUnsubRef.current) waitlistUnsubRef.current()
      if (myQueueRef.current) deleteDoc(myQueueRef.current).catch(function() {})
    }
  }, [])

  var liveStatus  = getLiveHoursStatus(liveHours || {})
  var creditsLeft = accountInfo ? remainingForMode(accountInfo, mode) : null
  var lowCredits  = creditsLeft !== null && !isPaidRef.current && creditsLeft <= 3
  var isSearching = status === 'searching' || status === 'signing-in'

  var sel = {
    padding: '10px 12px', width: '100%', borderRadius: 8,
    border: '1px solid ' + border, fontSize: 15,
    background: white, color: text, outline: 'none',
    fontFamily: 'DM Sans, system-ui, sans-serif'
  }

  return (
    <div style={{ minHeight: '100vh', background: bg, fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      <div style={{ maxWidth: 520, margin: '0 auto', padding: '72px 24px 60px' }}>

        <Link href="/" style={{ fontSize: 13, color: text3, textDecoration: 'none', display: 'inline-block', marginBottom: 28, fontFamily: 'Lora, Georgia, serif', fontWeight: 600 }}>
          FocusDuo
        </Link>

        <h1 style={{ fontFamily: 'Lora, Georgia, serif', fontSize: 'clamp(24px,4vw,34px)', fontWeight: 600, color: text, marginBottom: 8, letterSpacing: '-0.02em', lineHeight: 1.1 }}>
          Find a study partner
        </h1>
        <p style={{ fontSize: 15, color: text2, lineHeight: 1.65, marginBottom: 32 }}>
          Pick your subject and get matched with a student studying the same thing.
        </p>

        {/* Live status */}
        <div style={{ marginBottom: 10, padding: '10px 14px', borderRadius: 8, border: '1px solid ' + border, background: white, fontSize: 13, color: liveStatus.open ? '#166534' : '#92400E' }}>
          {liveStatus.open ? 'Sessions are open now.' : (liveHours ? liveStatus.message : 'Checking session hours...')}
        </div>

        {/* Waitlist */}
        <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 8, border: '1px solid ' + border, background: white, fontSize: 13, color: text2 }}>
          {waitlistCount > 0
            ? waitlistCount + ' student' + (waitlistCount === 1 ? '' : 's') + ' waiting in ' + exam + ' ' + subject + ' now.'
            : 'No one in ' + exam + ' ' + subject + ' yet. Be the first.'}
        </div>

        {/* Low credits */}
        {lowCredits ? (
          <div style={{ marginBottom: 16, padding: '10px 14px', borderRadius: 8, border: '1px solid #FCA5A5', background: '#FEF2F2', fontSize: 13, color: '#991B1B' }}>
            {creditsLeft} session{creditsLeft === 1 ? '' : 's'} left.{' '}
            <Link href="/plans" style={{ color: '#991B1B', fontWeight: 700, textDecoration: 'underline' }}>Upgrade</Link>
          </div>
        ) : null}

        {/* Credits summary */}
        {accountInfo ? (
          <div style={{ marginBottom: 20, padding: '10px 14px', borderRadius: 8, border: '1px solid ' + border, background: white, fontSize: 13, color: text2, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, color: text }}>{accountInfo.planLabel || 'Free'}</span>
            <span>1-on-1: {accountInfo.freeOneOnOneRemaining !== undefined ? accountInfo.freeOneOnOneRemaining : 10} left</span>
            <span>Group: {accountInfo.freeGroupRemaining !== undefined ? accountInfo.freeGroupRemaining : 10} left</span>
            {isPaidRef.current ? <span style={{ color: '#166534', fontWeight: 600 }}>Priority active</span> : null}
          </div>
        ) : null}

        {/* Selectors */}
        <div style={{ display: 'grid', gap: 14, marginBottom: 20 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: text2, marginBottom: 6, display: 'block', letterSpacing: '0.02em' }}>Exam</label>
            <select value={exam} onChange={function(e) { setExam(e.target.value) }} disabled={isSearching} style={sel}>
              <option>JEE</option>
              <option>NEET</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: text2, marginBottom: 6, display: 'block', letterSpacing: '0.02em' }}>Subject</label>
            <select value={subject} onChange={function(e) { setSubject(e.target.value) }} disabled={isSearching} style={sel}>
              <option>Physics</option>
              <option>Chemistry</option>
              <option>Math</option>
              <option>Biology</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: 13, fontWeight: 600, color: text2, marginBottom: 6, display: 'block', letterSpacing: '0.02em' }}>Mode</label>
            <select value={mode} onChange={function(e) { setMode(e.target.value) }} disabled={isSearching} style={sel}>
              <option value="one-on-one">1-on-1</option>
              <option value="group">Group (up to 5)</option>
            </select>
          </div>

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              onClick={startMatchmaking}
              disabled={isSearching || !liveStatus.open}
              style={{
                flex: 1, padding: '12px 20px', fontWeight: 600, fontSize: 15,
                background: (!isSearching && liveStatus.open) ? dark : border,
                color: (!isSearching && liveStatus.open) ? white : text3,
                border: 'none', borderRadius: 8,
                cursor: (!isSearching && liveStatus.open) ? 'pointer' : 'not-allowed',
                fontFamily: 'DM Sans, system-ui, sans-serif', transition: 'background 0.15s'
              }}
            >
              {status === 'signing-in' ? 'Signing in...' : status === 'searching' ? 'Searching...' : 'Find a partner'}
            </button>
            <button
              onClick={cancelQueue}
              style={{ padding: '12px 16px', borderRadius: 8, fontWeight: 600, border: '1px solid ' + border, background: white, color: text2, cursor: 'pointer', fontSize: 14, fontFamily: 'DM Sans, system-ui, sans-serif' }}
            >
              Cancel
            </button>
          </div>
        </div>

        {/* Status */}
        <div style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid ' + border, background: white, fontSize: 14, color: text2, marginBottom: 14 }}>
          {status === 'idle'       && 'Ready. Select your options above and click find.'}
          {status === 'signing-in' && 'Signing in with Google...'}
          {status === 'searching'  && 'Searching for a match...'}
          {status === 'waiting'    && 'Waiting for a partner in ' + exam + ' ' + subject + '. You will be matched as soon as someone joins.'}
          {status === 'matched'    && 'Match found. Joining your session now...'}
          {status === 'error'      && 'Something went wrong. Please try again.'}
          {status === 'closed'     && 'Sessions are closed right now. Check back later.'}
          {status === 'blocked'    && 'Account blocked. Contact support.'}
        </div>

        {/* Free plan note */}
        {!accountInfo ? (
          <div style={{ padding: '12px 14px', borderRadius: 8, border: '1px solid ' + border, background: white, fontSize: 13, color: text2, lineHeight: 1.7 }}>
            Free plan: 10 one-on-one and 10 group sessions. First 2 minutes of every session are free to leave — no credit used. Sessions end at 30 minutes.{' '}
            <Link href="/plans" style={{ color: text, fontWeight: 600, textDecoration: 'underline' }}>See Pro plans</Link>
          </div>
        ) : null}
      </div>
    </div>
  )
                       }
