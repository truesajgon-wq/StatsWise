import { useState, useMemo, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../context/LangContext.jsx'
import { predictScores } from '../data/correctScoreEngine.js'
import { getAppToday } from '../utils/appDate.js'

const RC = { H: '#d1d5db', D: '#f59e0b', A: '#a78bfa' }
const RL = { H: 'Home Win', D: 'Draw', A: 'Away Win' }

function TeamBadge({ team, size = 18 }) {
  const name = team?.name || '?'
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  if (team?.logo) {
    return (
      <img
        src={team.logo} alt={name} width={size} height={size}
        style={{ objectFit: 'contain', flexShrink: 0, display: 'block' }}
        onError={e => { e.target.style.display = 'none' }}
      />
    )
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%',
      background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.28)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: Math.round(size * 0.36), fontWeight: 900, color: '#f97316',
      flexShrink: 0, letterSpacing: -0.5, userSelect: 'none',
    }}>
      {initials}
    </div>
  )
}

function SkeletonPill({ width }) {
  return (
    <div style={{
      width, height: 42, borderRadius: 999, flexShrink: 0,
      background: 'linear-gradient(90deg,#181a1f 25%,#1f2229 50%,#181a1f 75%)',
      backgroundSize: '300% 100%',
      animation: 'cs-shimmer 1.5s infinite linear',
    }} />
  )
}

export default function CorrectScorePage({ fixtures = [], loading, searchQuery, onSearchChange }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const today = getAppToday()

  const [selected, setSelected] = useState(null)
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef(null)
  const [internalSearch, setInternalSearch] = useState('')
  const useExternalSearch = typeof searchQuery === 'string' && typeof onSearchChange === 'function'
  const search = useExternalSearch ? searchQuery : internalSearch
  const setSearchValue = useExternalSearch ? onSearchChange : setInternalSearch

  const filteredFixtures = useMemo(() => {
    if (!search.trim()) return fixtures
    const q = search.toLowerCase()
    return fixtures.filter(f =>
      f.homeTeam?.name?.toLowerCase().includes(q) ||
      f.awayTeam?.name?.toLowerCase().includes(q) ||
      f.league?.name?.toLowerCase().includes(q)
    )
  }, [fixtures, search])

  const rankedFixtures = useMemo(() => {
    return filteredFixtures
      .map(f => {
        const p = predictScores(f.homeHistory || [], f.awayHistory || [], f.h2h || [], today)
        const top = p?.scores?.[0]?.probability ?? 0
        return { fixture: f, prediction: p, topProb: top }
      })
      .sort((a, b) => b.topProb - a.topProb)
  }, [filteredFixtures])

  // Show all ranked fixtures in the pill rail — no artificial 10-cap
  const selectedPrediction = useMemo(() => {
    if (!selected) return null
    return rankedFixtures.find(x => x.fixture.id === selected.id)?.prediction
      || predictScores(selected.homeHistory || [], selected.awayHistory || [], selected.h2h || [], today)
  }, [selected, rankedFixtures])

  useEffect(() => {
    if (!rankedFixtures.length) {
      if (selected) setSelected(null)
      return
    }
    const stillVisible = selected && rankedFixtures.some(x => x.fixture.id === selected.id)
    if (!stillVisible) setSelected(rankedFixtures[0].fixture)
  }, [rankedFixtures, selected])

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!dropdownOpen) return
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [dropdownOpen])

  const topScore    = selectedPrediction?.scores?.[0]
  const topColor    = topScore ? RC[topScore.result] : '#f97316'
  const restScores  = selectedPrediction?.scores?.slice(1) || []
  const maxProb     = topScore?.probability || 1

  return (
    <div style={{ minHeight: '100%', padding: '20px 16px 40px', boxSizing: 'border-box', fontFamily: 'system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <style>{`
        @keyframes cs-shimmer {
          0%   { background-position: 100% 0 }
          100% { background-position: -200% 0 }
        }
        .cs-sel-trigger {
          width: 100%; display: flex; align-items: center; gap: 10px;
          padding: 11px 14px; border-radius: 12px;
          border: 1px solid rgba(255,255,255,0.09);
          background: #111318; cursor: pointer;
          transition: border-color 0.14s, background 0.14s;
          text-align: left; min-height: 48px;
        }
        .cs-sel-trigger:hover { border-color: rgba(249,115,22,0.4); background: rgba(249,115,22,0.06); }
        .cs-sel-trigger.open  { border-color: rgba(249,115,22,0.55); background: rgba(249,115,22,0.08); border-bottom-left-radius: 0; border-bottom-right-radius: 0; }

        .cs-dropdown-panel {
          position: absolute; left: 0; right: 0; top: 100%;
          background: #13151b;
          border: 1px solid rgba(249,115,22,0.4);
          border-top: none;
          border-bottom-left-radius: 12px; border-bottom-right-radius: 12px;
          max-height: 380px; overflow-y: auto;
          z-index: 50;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.08) transparent;
        }
        .cs-dropdown-panel::-webkit-scrollbar { width: 4px; }
        .cs-dropdown-panel::-webkit-scrollbar-track { background: transparent; }
        .cs-dropdown-panel::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }

        .cs-drop-row {
          width: 100%; display: flex; align-items: center; gap: 10px;
          padding: 10px 14px; border: none; border-bottom: 1px solid rgba(255,255,255,0.04);
          background: transparent; cursor: pointer; text-align: left;
          transition: background 0.12s;
        }
        .cs-drop-row:last-child { border-bottom: none; }
        .cs-drop-row:hover { background: rgba(249,115,22,0.07); }
        .cs-drop-row.active { background: rgba(249,115,22,0.11); }

        .cs-score-card {
          background: #0f1117; border: 1px solid rgba(255,255,255,0.07);
          border-radius: 13px; padding: 14px 13px 12px;
          position: relative; overflow: hidden;
          transition: border-color 0.14s, transform 0.14s;
          cursor: default;
        }
        .cs-score-card:hover { border-color: rgba(255,255,255,0.13); transform: translateY(-1px); }

        .cs-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0,1fr));
          gap: 9px;
        }
        @media (max-width: 560px) {
          .cs-grid { grid-template-columns: repeat(2, minmax(0,1fr)); }
        }

        .cs-outcome-row {
          display: flex; gap: 9px;
        }
        @media (max-width: 440px) {
          .cs-outcome-row { gap: 7px; }
        }
      `}</style>

      <div>

        {/* ── Page header ── */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: '#374151', letterSpacing: '0.12em', marginBottom: 3 }}>STATSWISE</div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#f1f5f9', letterSpacing: '-0.25px' }}>
              {t('correct_score')}
            </h2>
          </div>
          {!useExternalSearch && (
            <input
              value={search}
              onChange={e => setSearchValue(e.target.value)}
              placeholder="Search team or league…"
              style={{
                padding: '8px 12px', borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.07)',
                background: '#111318', color: '#f1f5f9',
                fontSize: 12, outline: 'none', width: 200,
              }}
            />
          )}
        </div>

        {/* ── Fixture selector dropdown ── */}
        <div ref={dropdownRef} style={{ position: 'relative', marginBottom: 18 }}>
          {loading ? (
            <div style={{ height: 48, borderRadius: 12, background: 'linear-gradient(90deg,#181a1f 25%,#1f2229 50%,#181a1f 75%)', backgroundSize: '300% 100%', animation: 'cs-shimmer 1.5s infinite linear' }} />
          ) : (
            <>
              {/* Trigger button — shows selected fixture */}
              <button
                type="button"
                className={`cs-sel-trigger${dropdownOpen ? ' open' : ''}`}
                onClick={() => setDropdownOpen(v => !v)}
                disabled={rankedFixtures.length === 0}
              >
                {selected ? (
                  <>
                    <TeamBadge team={selected.homeTeam} size={18} />
                    <span style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {selected.homeTeam?.name} <span style={{ color: '#374151', fontWeight: 500 }}>vs</span> {selected.awayTeam?.name}
                    </span>
                    <TeamBadge team={selected.awayTeam} size={18} />
                    {topScore && (
                      <span style={{ fontSize: 11, fontWeight: 800, color: topColor, background: `${topColor}14`, border: `1px solid ${topColor}30`, borderRadius: 999, padding: '2px 9px', flexShrink: 0, fontFamily: 'monospace' }}>
                        {topScore.score} · {topScore.probability.toFixed(1)}%
                      </span>
                    )}
                  </>
                ) : (
                  <span style={{ fontSize: 13, color: '#4b5563' }}>Select a fixture…</span>
                )}
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0, marginLeft: 2, transition: 'transform 0.18s', transform: dropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                  <path d="M3 5l4 4 4-4" stroke="#4b5563" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {/* Dropdown panel — all ranked fixtures */}
              {dropdownOpen && rankedFixtures.length > 0 && (
                <div className="cs-dropdown-panel">
                  {rankedFixtures.map(({ fixture: f, prediction: p, topProb }, idx) => {
                    const ts = p?.scores?.[0]
                    const tc = ts ? RC[ts.result] : '#94a3b8'
                    const isActive = selected?.id === f.id
                    return (
                      <button
                        key={f.id}
                        type="button"
                        className={`cs-drop-row${isActive ? ' active' : ''}`}
                        onClick={() => { setSelected(f); setDropdownOpen(false) }}
                      >
                        {/* Rank */}
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#374151', minWidth: 18, textAlign: 'right', flexShrink: 0 }}>
                          {idx + 1}
                        </span>
                        {/* Logos */}
                        <TeamBadge team={f.homeTeam} size={16} />
                        {/* Teams */}
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 700, color: isActive ? '#f1f5f9' : '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.homeTeam?.name} <span style={{ color: '#374151', fontWeight: 400 }}>vs</span> {f.awayTeam?.name}
                        </span>
                        <TeamBadge team={f.awayTeam} size={16} />
                        {/* League + time */}
                        <span style={{ fontSize: 10, color: '#374151', flexShrink: 0, maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {f.league?.name}
                        </span>
                        {/* Top predicted score */}
                        {ts && (
                          <span style={{ fontSize: 11, fontWeight: 900, color: tc, background: `${tc}12`, border: `1px solid ${tc}28`, borderRadius: 7, padding: '2px 8px', fontFamily: 'monospace', flexShrink: 0 }}>
                            {ts.score}
                          </span>
                        )}
                        {/* Top probability */}
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', flexShrink: 0, minWidth: 38, textAlign: 'right' }}>
                          {topProb.toFixed(1)}%
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Empty state ── */}
        {!loading && rankedFixtures.length === 0 && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: '#374151' }}>
            <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.35 }}>⚽</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#4b5563', marginBottom: 6 }}>No fixtures found</div>
            <div style={{ fontSize: 12 }}>{search ? 'Try a different search.' : 'No matches loaded for today.'}</div>
          </div>
        )}

        {/* ── Prediction card ── */}
        {selected && selectedPrediction && topScore && (
          <div style={{ background: '#111318', border: '1px solid rgba(255,255,255,0.07)', borderRadius: 18, overflow: 'hidden' }}>

            {/* Match bar */}
            <div style={{
              padding: '12px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: 10, flexWrap: 'wrap',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0, flexWrap: 'wrap' }}>
                <TeamBadge team={selected.homeTeam} size={20} />
                <span style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9', overflowWrap: 'anywhere' }}>
                  {selected.homeTeam?.name}
                </span>
                <span style={{ fontSize: 10, color: '#374151', fontWeight: 600, padding: '2px 8px', background: 'rgba(255,255,255,0.04)', borderRadius: 6 }}>
                  vs
                </span>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9', overflowWrap: 'anywhere' }}>
                  {selected.awayTeam?.name}
                </span>
                <TeamBadge team={selected.awayTeam} size={20} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 11, color: '#4b5563', fontWeight: 600 }}>
                  {selected.league?.name}{selected.time ? ` · ${selected.time}` : ''}
                </span>
                <button
                  type="button"
                  onClick={() => navigate(`/match/${selected.id}?stat=correctScore`)}
                  style={{
                    padding: '6px 11px', borderRadius: 8,
                    border: '1px solid rgba(209,213,219,0.22)',
                    background: 'rgba(209,213,219,0.07)',
                    color: '#94a3b8', fontSize: 11, fontWeight: 700,
                    cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Match Details ↗
                </button>
              </div>
            </div>

            {/* ── HERO ── */}
            <div style={{
              position: 'relative', textAlign: 'center',
              padding: '44px 24px 36px',
              background: `radial-gradient(ellipse 55% 55% at 50% 100%, ${topColor}0e 0%, transparent 72%)`,
              borderBottom: '1px solid rgba(255,255,255,0.05)',
            }}>
              {/* Result label */}
              <div style={{
                fontSize: 10, fontWeight: 800, color: topColor, letterSpacing: '0.14em',
                marginBottom: 12, opacity: 0.75,
              }}>
                {RL[topScore.result]?.toUpperCase()} · TOP PICK
              </div>

              {/* Big scoreline */}
              <div style={{
                fontSize: 'clamp(72px, 15vw, 128px)',
                fontWeight: 700, lineHeight: 1,
                fontFamily: '"Courier New", Courier, monospace',
                letterSpacing: '-2px', color: topColor,
                textShadow: `0 0 80px ${topColor}28, 0 0 30px ${topColor}18`,
              }}>
                {topScore.score}
              </div>

              {/* Probability */}
              <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 7 }}>
                <span style={{
                  fontSize: 30, fontWeight: 900, color: topColor,
                  fontFamily: '"Courier New", Courier, monospace', lineHeight: 1,
                }}>
                  {topScore.probability.toFixed(1)}%
                </span>
                <span style={{ fontSize: 12, color: '#4b5563', fontWeight: 600 }}>probability</span>
              </div>

              {/* H2H badge */}
              {topScore.historicalHits > 0 && (
                <div style={{ marginTop: 12 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, color: '#f59e0b',
                    background: 'rgba(245,158,11,0.1)',
                    border: '1px solid rgba(245,158,11,0.25)',
                    borderRadius: 999, padding: '4px 12px',
                  }}>
                    ⬤ {topScore.historicalHits}× in H2H / history
                  </span>
                </div>
              )}
            </div>

            <div style={{ padding: '20px 18px 22px' }}>

              {/* ── Outcome split ── */}
              <div className="cs-outcome-row" style={{ marginBottom: 20 }}>
                {[
                  { label: selected.homeTeam?.name?.split(' ')[0] || 'Home', prob: selectedPrediction.homeWinProb, color: '#d1d5db', border: 'rgba(209,213,219,0.18)', bg: 'rgba(209,213,219,0.05)' },
                  { label: 'Draw',                                             prob: selectedPrediction.drawProb,    color: '#f59e0b', border: 'rgba(245,158,11,0.22)',  bg: 'rgba(245,158,11,0.05)'  },
                  { label: selected.awayTeam?.name?.split(' ')[0] || 'Away',  prob: selectedPrediction.awayWinProb, color: '#a78bfa', border: 'rgba(167,139,250,0.22)', bg: 'rgba(167,139,250,0.05)' },
                ].map(({ label, prob, color, border, bg }) => (
                  <div
                    key={label}
                    style={{
                      flex: 1, minWidth: 0, textAlign: 'center',
                      padding: '14px 10px', borderRadius: 13,
                      background: bg, border: `1px solid ${border}`,
                    }}
                  >
                    <div style={{
                      fontSize: 'clamp(18px,4vw,26px)', fontWeight: 900, color,
                      fontFamily: '"Courier New", Courier, monospace', lineHeight: 1,
                    }}>
                      {prob}%
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 5, overflowWrap: 'anywhere', lineHeight: 1.3 }}>
                      {label}
                    </div>
                  </div>
                ))}
              </div>

              {/* ── Other scorelines grid ── */}
              {restScores.length > 0 && (
                <div style={{ marginBottom: 18 }}>
                  <div style={{ fontSize: 10, fontWeight: 800, color: '#374151', letterSpacing: '0.1em', marginBottom: 10 }}>
                    OTHER LIKELY SCORELINES
                  </div>
                  <div className="cs-grid">
                    {restScores.map(s => {
                      const col = RC[s.result]
                      const barPct = (s.probability / maxProb) * 100
                      return (
                        <div key={s.score} className="cs-score-card">
                          {/* Left accent bar */}
                          <div style={{
                            position: 'absolute', top: 0, left: 0, bottom: 0, width: 2,
                            background: col, opacity: 0.4,
                            borderRadius: '13px 0 0 13px',
                          }} />
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 4, marginBottom: 5 }}>
                            <span style={{
                              fontSize: 20, fontWeight: 700, color: '#e2e8f0', lineHeight: 1,
                              fontFamily: '"Courier New", Courier, monospace',
                            }}>
                              {s.score}
                            </span>
                            {s.historicalHits > 0 && (
                              <span style={{
                                fontSize: 9, fontWeight: 800, color: '#f59e0b',
                                background: 'rgba(245,158,11,0.09)',
                                border: '1px solid rgba(245,158,11,0.22)',
                                borderRadius: 4, padding: '1px 5px', flexShrink: 0,
                              }}>
                                H2H
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 13, fontWeight: 800, color: col }}>{s.probability.toFixed(1)}%</div>
                          <div style={{ height: 2, background: 'rgba(255,255,255,0.05)', borderRadius: 2, marginTop: 8, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', width: `${barPct}%`, background: col, borderRadius: 2,
                              transition: 'width 0.5s cubic-bezier(0.22,1,0.36,1)',
                            }} />
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* ── Lambda strip ── */}
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                padding: '9px 13px', borderRadius: 9,
                background: 'rgba(255,255,255,0.02)',
                border: '1px solid rgba(255,255,255,0.05)',
                marginBottom: 12,
              }}>
                <span style={{ fontSize: 11, color: '#374151', fontWeight: 600 }}>Expected goals</span>
                <span style={{ fontSize: 10, color: '#1f2937' }}>—</span>
                <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                  Home&nbsp;<strong style={{ color: '#d1d5db' }}>{selectedPrediction.lambdaHome}</strong>
                </span>
                <span style={{ fontSize: 10, color: '#1f2937' }}>·</span>
                <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>
                  Away&nbsp;<strong style={{ color: '#a78bfa' }}>{selectedPrediction.lambdaAway}</strong>
                </span>
                <span style={{ fontSize: 10, color: '#1f2937', margin: '0 2px' }}>·</span>
                <span style={{ fontSize: 10, color: '#374151' }}>
                  {selected.homeHistory?.length || 0}/{selected.awayHistory?.length || 0} form · {selected.h2h?.length || 0} H2H
                </span>
              </div>

              {/* ── Disclaimer ── */}
              <div style={{
                fontSize: 11, color: '#374151', lineHeight: 1.55,
                padding: '8px 12px', borderRadius: 9,
                background: 'rgba(249,115,22,0.04)',
                border: '1px solid rgba(249,115,22,0.1)',
              }}>
                ⚠ {t('cs_disclaimer')}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
