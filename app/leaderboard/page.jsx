'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { db } from '../../lib/firebase'
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore'

var BG     = '#F7F6F2'
var WHITE  = '#FFFFFF'
var BORDER = '#E4E2DC'
var TEXT   = '#1A1A18'
var TEXT2  = '#6B6860'
var TEXT3  = '#A8A59F'
var DARK   = '#1A1A18'

var css = '\n' +
  '*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; min-width: 0; }\n' +
  'html { overflow-x: clip; }\n' +
  'body { background: ' + BG + '; color: ' + TEXT + '; font-family: "DM Sans",system-ui,sans-serif; -webkit-font-smoothing: antialiased; overflow-x: clip; }\n' +
  'a { color: inherit; text-decoration: none; }\n' +
  '.wrap { width: 100%; max-width: 1060px; margin: 0 auto; padding: 0 20px; }\n' +
  '.tabs { display: flex; gap: 2px; background: ' + WHITE + '; border: 1px solid ' + BORDER + '; border-radius: 9px; padding: 3px; margin-bottom: 20px; }\n' +
  '.tab { flex: 1; padding: 8px 0; border-radius: 7px; font-size: 14px; font-weight: 600; border: none; cursor: pointer; transition: all 0.15s; font-family: inherit; }\n' +
  '.tab-active { background: ' + DARK + '; color: #fff; }\n' +
  '.tab-inactive { background: transparent; color: ' + TEXT2 + '; }\n' +
  '.row { display: grid; grid-template-columns: 32px 1fr auto; gap: 14px; align-items: center; padding: 14px 0; border-bottom: 1px solid ' + BORDER + '; }\n' +
  '@media (min-width: 640px) { .wrap { padding: 0 28px; } }\n'

export default function LeaderboardPage() {
  var [tab, setTab]         = useState('sessions')
  var [users, setUsers]     = useState([])
  var [loading, setLoading] = useState(true)

  useEffect(function() {
    async function load() {
      setLoading(true)
      try {
        var field = tab === 'sessions' ? 'sessionsCompleted' : 'streakDays'
        var q = query(collection(db, 'users'), orderBy(field, 'desc'), limit(50))
        var snap = await getDocs(q)
        var list = snap.docs.map(function(d) { return Object.assign({ id: d.id }, d.data()) })
          .filter(function(u) { return u.accountStatus !== 'banned' && ((tab === 'sessions' ? u.sessionsCompleted : u.streakDays) || 0) > 0 })
        setUsers(list)
      } catch(e) { console.error(e) }
      finally { setLoading(false) }
    }
    load()
  }, [tab])

  function isPro(u) {
    var id = u.planId || 'free'
    return id !== 'free'
  }

  function rankLabel(i) {
    if (i === 0) return '1st'
    if (i === 1) return '2nd'
    if (i === 2) return '3rd'
    return (i + 1) + 'th'
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <div style={{ minHeight: '100vh', background: BG }}>
        <div className="wrap" style={{ paddingTop: 40, paddingBottom: 60 }}>

          <Link href="/" style={{ fontSize: 13, color: TEXT3, fontFamily: 'Lora,Georgia,serif', fontWeight: 600, display: 'inline-block', marginBottom: 24 }}>FocusDuo</Link>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 28 }}>
            <div>
              <h1 style={{ fontFamily: 'Lora,Georgia,serif', fontSize: 'clamp(22px,4vw,32px)', fontWeight: 600, color: TEXT, letterSpacing: '-0.02em', marginBottom: 6 }}>
                Leaderboard
              </h1>
              <p style={{ fontSize: 14, color: TEXT2 }}>Updated weekly. Open to all students.</p>
            </div>
            <Link href="/join" style={{ display: 'inline-flex', alignItems: 'center', padding: '9px 16px', borderRadius: 8, fontSize: 13, fontWeight: 600, background: DARK, color: WHITE, textDecoration: 'none' }}>
              Start studying
            </Link>
          </div>

          {/* Tabs */}
          <div className="tabs">
            <button className={'tab ' + (tab === 'sessions' ? 'tab-active' : 'tab-inactive')} onClick={function() { setTab('sessions') }}>
              By sessions
            </button>
            <button className={'tab ' + (tab === 'streak' ? 'tab-active' : 'tab-inactive')} onClick={function() { setTab('streak') }}>
              By streak
            </button>
          </div>

          {/* Table */}
          <div style={{ background: WHITE, border: '1px solid ' + BORDER, borderRadius: 10, padding: '4px 20px' }}>
            {/* Header */}
            <div className="row" style={{ paddingTop: 10, paddingBottom: 10, borderBottom: '1px solid ' + BORDER }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>#</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Student</span>
              <span style={{ fontSize: 11, fontWeight: 600, color: TEXT3, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{tab === 'sessions' ? 'Sessions' : 'Streak'}</span>
            </div>

            {loading ? (
              <div style={{ padding: '28px 0', textAlign: 'center' }}>
                <p style={{ fontSize: 14, color: TEXT3 }}>Loading...</p>
              </div>
            ) : users.length === 0 ? (
              <div style={{ padding: '32px 0', textAlign: 'center' }}>
                <p style={{ fontSize: 15, color: TEXT2, marginBottom: 6 }}>No entries yet.</p>
                <p style={{ fontSize: 13, color: TEXT3 }}>Complete a session to appear here.</p>
              </div>
            ) : (
              users.map(function(u, i) {
                var val = tab === 'sessions' ? (u.sessionsCompleted || 0) : (u.streakDays || 0)
                var isTop3 = i < 3
                return (
                  <div key={u.id} className="row">
                    <span style={{ fontSize: isTop3 ? 14 : 13, fontWeight: isTop3 ? 700 : 500, color: isTop3 ? TEXT : TEXT3, fontFamily: 'Lora,Georgia,serif' }}>
                      {rankLabel(i)}
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      {u.photoURL ? (
                        <img src={u.photoURL} alt="" style={{ width: 28, height: 28, borderRadius: '50%', border: '1px solid ' + BORDER, flexShrink: 0 }} />
                      ) : (
                        <div style={{ width: 28, height: 28, borderRadius: '50%', background: BG, border: '1px solid ' + BORDER, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: TEXT2 }}>
                          {(u.name || '?')[0].toUpperCase()}
                        </div>
                      )}
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: TEXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.name || 'Student'}
                          {isPro(u) ? <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 3, background: DARK, color: WHITE, letterSpacing: '0.04em' }}>PRO</span> : null}
                        </p>
                      </div>
                    </div>
                    <span style={{ fontFamily: 'Lora,Georgia,serif', fontSize: isTop3 ? 18 : 15, fontWeight: 600, color: TEXT, textAlign: 'right' }}>
                      {val}{tab === 'streak' ? 'd' : ''}
                    </span>
                  </div>
                )
              })
            )}
          </div>

          {/* Footer note */}
          <p style={{ marginTop: 16, fontSize: 12, color: TEXT3, lineHeight: 1.6 }}>
            Leaderboard is open to all users. Pro badge shown next to Pro members.
          </p>
        </div>
      </div>
    </>
  )
}
