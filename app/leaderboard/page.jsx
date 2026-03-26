'use client'

import { useEffect, useState } from 'react'
import { collection, getDocs, orderBy, query, limit } from 'firebase/firestore'
import { auth, db } from '../../lib/firebase'
import { onAuthStateChanged } from 'firebase/auth'
import Link from 'next/link'

// Medal for top 3
function medal(rank) {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return `#${rank}`
}

function flameBar(streak) {
  const count = Math.min(streak, 7)
  return Array.from({ length: count }).map(() => '🔥').join('') || '—'
}

export default function LeaderboardPage() {
  const [users, setUsers]         = useState([])
  const [loading, setLoading]     = useState(true)
  const [currentUid, setCurrentUid] = useState(null)
  const [tab, setTab]             = useState('sessions')   // 'sessions' | 'streak'

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, u => setCurrentUid(u?.uid || null))
    return () => unsub()
  }, [])

  useEffect(() => {
    async function load() {
      setLoading(true)
      try {
        const field = tab === 'sessions' ? 'sessionsCompleted' : 'streakDays'
        const q = query(
          collection(db, 'users'),
          orderBy(field, 'desc'),
          limit(50)
        )
        const snap = await getDocs(q)
        const rows = snap.docs
          .map(d => ({ uid: d.id, ...d.data() }))
          .filter(u => u.accountStatus !== 'banned')
          .filter(u => (tab === 'sessions' ? u.sessionsCompleted > 0 : u.streakDays > 0))
        setUsers(rows)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [tab])

  const isUserInTop = users.some(u => u.uid === currentUid)
  const userRank    = users.findIndex(u => u.uid === currentUid) + 1

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #0f172a 0%, #111827 100%)',
      color: '#e2e8f0', fontFamily: 'system-ui, sans-serif'
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '32px 20px 60px' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, marginBottom: 8 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 30, fontWeight: 900 }}>🏆 Leaderboard</h1>
            <div style={{ color: '#94a3b8', marginTop: 6, fontSize: 14 }}>
              Top FocusDuo students — updated live
            </div>
          </div>
          <Link href="/dashboard" style={{
            padding: '9px 16px', borderRadius: 10,
            border: '1px solid rgba(148,163,184,0.2)',
            background: 'rgba(255,255,255,0.04)',
            color: '#e2e8f0', textDecoration: 'none', fontWeight: 700, fontSize: 14
          }}>
            My Dashboard
          </Link>
        </div>

        {/* Referral hook — subtle CTA to share */}
        <div style={{
          marginBottom: 20, padding: '12px 16px', borderRadius: 14,
          background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(96,165,250,0.2)',
          fontSize: 14, color: '#93c5fd'
        }}>
          📣 Share FocusDuo with your JEE/NEET friends — refer them and both of you get <strong>3 bonus sessions free.</strong>{' '}
          <Link href="/dashboard" style={{ color: '#60a5fa', fontWeight: 700 }}>Get your referral code →</Link>
        </div>

        {/* Tab selector */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          {['sessions', 'streak'].map(t => (
            <button key={t} onClick={() => setTab(t)} style={{
              padding: '9px 18px', borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: 'pointer',
              border: tab === t ? 'none' : '1px solid rgba(148,163,184,0.2)',
              background: tab === t ? 'linear-gradient(90deg,#2563eb,#7c3aed)' : 'rgba(255,255,255,0.04)',
              color: '#fff'
            }}>
              {t === 'sessions' ? '📚 Most sessions' : '🔥 Longest streak'}
            </button>
          ))}
        </div>

        {/* Current user's rank highlight */}
        {!loading && currentUid && isUserInTop && (
          <div style={{
            marginBottom: 14, padding: '12px 16px', borderRadius: 12,
            background: 'rgba(251,191,36,0.1)', border: '1px solid rgba(251,191,36,0.3)',
            fontWeight: 700, color: '#fbbf24', fontSize: 14
          }}>
            ⭐ You are ranked <strong>#{userRank}</strong> — keep going!
          </div>
        )}

        {!loading && currentUid && !isUserInTop && (
          <div style={{
            marginBottom: 14, padding: '12px 16px', borderRadius: 12,
            background: 'rgba(148,163,184,0.08)', border: '1px solid rgba(148,163,184,0.18)',
            fontSize: 14, color: '#94a3b8'
          }}>
            Complete a session to appear on the leaderboard 💪
          </div>
        )}

        {/* Leaderboard list */}
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#64748b' }}>Loading leaderboard…</div>
        ) : users.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: 40, borderRadius: 18,
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.16)'
          }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
            <div style={{ color: '#94a3b8', marginBottom: 16 }}>No one on the board yet — be the first!</div>
            <Link href="/join" style={{
              padding: '10px 20px', borderRadius: 10,
              background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
              color: '#fff', fontWeight: 800, textDecoration: 'none'
            }}>
              Start studying now
            </Link>
          </div>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {users.map((u, i) => {
              const rank      = i + 1
              const isMe      = u.uid === currentUid
              const isPaid    = u.planType === 'paid'
              const sessions  = u.sessionsCompleted || 0
              const streak    = u.streakDays || 0
              const name      = u.name || 'Student'

              return (
                <div key={u.uid} style={{
                  padding: '14px 18px', borderRadius: 16,
                  background: isMe
                    ? 'rgba(251,191,36,0.1)'
                    : rank <= 3
                    ? 'rgba(37,99,235,0.1)'
                    : 'rgba(15,23,42,0.82)',
                  border: isMe
                    ? '2px solid rgba(251,191,36,0.4)'
                    : rank <= 3
                    ? '1px solid rgba(96,165,250,0.25)'
                    : '1px solid rgba(148,163,184,0.12)',
                  display: 'flex', alignItems: 'center', gap: 14
                }}>

                  {/* Rank */}
                  <div style={{
                    fontSize: rank <= 3 ? 24 : 16,
                    fontWeight: 900, minWidth: 36, textAlign: 'center',
                    color: rank === 1 ? '#fbbf24' : rank === 2 ? '#cbd5e1' : rank === 3 ? '#f97316' : '#64748b'
                  }}>
                    {medal(rank)}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>
                      {name}
                      {isMe && <span style={{ marginLeft: 8, fontSize: 12, color: '#fbbf24', fontWeight: 700 }}>(You)</span>}
                      {isPaid && <span style={{ marginLeft: 6, fontSize: 11, color: '#fbbf24' }}>⭐</span>}
                    </div>
                    <div style={{ color: '#94a3b8', fontSize: 13, marginTop: 3 }}>
                      {tab === 'sessions'
                        ? `${sessions} session${sessions === 1 ? '' : 's'} completed`
                        : `${flameBar(streak)} ${streak} day streak`
                      }
                    </div>
                  </div>

                  {/* Score */}
                  <div style={{
                    fontWeight: 900, fontSize: 20,
                    color: rank === 1 ? '#fbbf24' : '#e2e8f0'
                  }}>
                    {tab === 'sessions' ? sessions : streak}
                    <div style={{ fontSize: 11, color: '#64748b', fontWeight: 400, textAlign: 'right' }}>
                      {tab === 'sessions' ? 'sessions' : 'days'}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Bottom CTA */}
        <div style={{
          marginTop: 24, padding: 20, borderRadius: 18, textAlign: 'center',
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(148,163,184,0.14)'
        }}>
          <div style={{ fontWeight: 900, marginBottom: 8 }}>Want to climb the leaderboard?</div>
          <div style={{ color: '#94a3b8', marginBottom: 16, fontSize: 14 }}>
            Upgrade to get priority matching, unlimited sessions, and get more study time in every day.
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link href="/plans" style={{
              padding: '10px 20px', borderRadius: 10,
              background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
              color: '#fff', fontWeight: 800, textDecoration: 'none', fontSize: 14
            }}>
              Upgrade — from ₹99 →
            </Link>
            <Link href="/join" style={{
              padding: '10px 20px', borderRadius: 10,
              border: '1px solid rgba(148,163,184,0.2)',
              background: 'rgba(255,255,255,0.04)',
              color: '#e2e8f0', fontWeight: 700, textDecoration: 'none', fontSize: 14
            }}>
              Study now
            </Link>
          </div>
        </div>

      </div>
    </div>
  )
}
  
