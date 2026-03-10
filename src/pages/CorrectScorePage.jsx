import { useState, useMemo, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLang } from '../context/LangContext.jsx'
import { predictScores } from '../data/correctScoreEngine.js'

function TeamBadge({ team, size = 18 }) {
  const name = team?.name || '?'
  const color = team?.color || '#f97316'
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()

  if (!team?.logo) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: `${color}28`,
          border: `2px solid ${color}60`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * 0.34),
          fontWeight: 900,
          color,
          flexShrink: 0,
          letterSpacing: -0.5,
          userSelect: 'none',
        }}
      >
        {initials}
      </div>
    )
  }

  return (
    <img
      src={team.logo}
      alt={name}
      width={size}
      height={size}
      style={{ objectFit: 'contain', flexShrink: 0, display: 'block' }}
    />
  )
}

function ResultPill({ label, prob, color, bg }) {
  return (
    <div style={{ minWidth: 0, textAlign: 'center', padding: '12px 10px', borderRadius: 12, background: bg, border: `1px solid ${color}30`, minHeight: 88, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ fontSize: 20, fontWeight: 900, color }}>{prob}%</div>
      <div style={{ fontSize: 11, color: 'var(--sw-muted)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
    </div>
  )
}

function ScoreGrid({ scores }) {
  const top3 = scores.slice(0, 3)
  const rest = scores.slice(3)
  const colors = { H: '#d1d5db', D: '#f59e0b', A: '#a78bfa' }
  const scoreFontSize = 18
  const probFontSize = 12

  return (
    <div>
      <div className="cs-score-grid-top" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginBottom: 12 }}>
        {top3.map((s, i) => {
          const color = colors[s.result]
          return (
            <div key={s.score} style={{ minHeight: 124, padding: '14px 12px', borderRadius: 12, background: i === 0 ? `${color}18` : 'var(--sw-surface-0)', border: `${i === 0 ? 2 : 1}px solid ${i === 0 ? color : 'var(--sw-border)'}`, textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
              {i === 0 ? (
                <div style={{ position: 'absolute', top: 14, left: 0, right: 0, fontSize: 10, color, fontWeight: 700, letterSpacing: '0.06em', textAlign: 'center' }}>
                  Favorite
                </div>
              ) : null}
              <div style={{ fontSize: scoreFontSize, fontWeight: 900, color: i === 0 ? color : '#9ca3af', fontFamily: 'monospace', lineHeight: 1, textAlign: 'center' }}>{s.score}</div>
              <div style={{ fontSize: probFontSize, fontWeight: 800, color: i === 0 ? color : 'var(--sw-muted)', marginTop: 10, lineHeight: 1, textAlign: 'center' }}>{s.probability.toFixed(1)}%</div>
            </div>
          )
        })}
      </div>

      {rest.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(108px, 1fr))', gap: 10 }}>
          {rest.map(s => (
            <div key={s.score} style={{ minHeight: 96, padding: '10px 8px', borderRadius: 10, background: 'var(--sw-surface-0)', border: '1px solid var(--sw-border)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ fontSize: scoreFontSize, fontWeight: 900, color: '#9ca3af', fontFamily: 'monospace', lineHeight: 1, textAlign: 'center' }}>{s.score}</div>
              <div style={{ fontSize: probFontSize, fontWeight: 800, color: colors[s.result], marginTop: 10, lineHeight: 1, textAlign: 'center' }}>{s.probability.toFixed(1)}%</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FixtureCard({ fixture, onClick, selected, topProb }) {
  const { homeTeam, awayTeam, league, time, isLive, elapsed, homeGoals, awayGoals, status } = fixture
  return (
    <button onClick={() => onClick(fixture)} style={{ width: '100%', padding: '12px 14px', background: selected ? 'rgba(255,122,0,0.12)' : 'var(--sw-surface-0)', border: `1px solid ${selected ? 'var(--sw-accent)' : 'var(--sw-border)'}`, borderRadius: 14, cursor: 'pointer', textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <span style={{ fontSize: 10, color: 'var(--sw-muted)', fontWeight: 700, lineHeight: 1.3 }}>
          {league?.name}{time ? ` • ${time}` : ''}
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, color: '#22c55e', background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', borderRadius: 999, padding: '2px 6px', flexShrink: 0 }}>
          Top {topProb.toFixed(1)}%
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.25 }}>{homeTeam?.name}</span>
        {(isLive || status === 'FT') ? (
          <span style={{ fontSize: 13, fontWeight: 900, color: isLive ? '#ef4444' : '#22c55e', fontFamily: 'monospace', flexShrink: 0 }}>{homeGoals}-{awayGoals}</span>
        ) : (
          <span style={{ fontSize: 11, color: '#64748b', flexShrink: 0, minWidth: 18, textAlign: 'center' }}>vs</span>
        )}
        <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', minWidth: 0, whiteSpace: 'normal', overflowWrap: 'anywhere', lineHeight: 1.25, textAlign: 'right' }}>{awayTeam?.name}</span>
      </div>
      {!isLive && status === 'FT' && <div style={{ marginTop: 8, fontSize: 10, color: '#22c55e', fontWeight: 700 }}>Finished</div>}
    </button>
  )
}

function CorrectScoreDetailsModal({ fixture, prediction, onClose, onOpenMatch }) {
  if (!fixture || !prediction) return null
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 140, background: 'rgba(2,6,23,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(920px, 100%)', maxHeight: '92vh', overflowY: 'auto', borderRadius: 14, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', boxShadow: '0 20px 60px rgba(2,6,23,0.7)' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--sw-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Correct Score Insights</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={() => onOpenMatch?.(fixture)} style={{ minHeight: 30, padding: '0 10px', borderRadius: 8, border: '1px solid rgba(209,213,219,0.4)', background: 'rgba(209,213,219,0.12)', color: '#e5e7eb', cursor: 'pointer' }}>Open Match Details</button>
            <button onClick={onClose} style={{ minHeight: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', color: '#94a3b8', cursor: 'pointer' }}>Close</button>
          </div>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ padding: '14px 16px', background: 'var(--sw-surface-1)', borderRadius: 10, border: '1px solid var(--sw-border)' }}>
            <div style={{ fontSize: 11, color: 'var(--sw-muted)', marginBottom: 8 }}>{fixture.league?.name} - {fixture.time}</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#f1f5f9' }}>{fixture.homeTeam?.name} vs {fixture.awayTeam?.name}</div>
          </div>
          <div className="cs-outcome-row" style={{ display: 'flex', gap: 10 }}>
            <ResultPill label={fixture.homeTeam?.name?.split(' ')[0]} prob={prediction.homeWinProb} color="#d1d5db" bg="rgba(209,213,219,0.08)" />
            <ResultPill label="Draw" prob={prediction.drawProb} color="#f59e0b" bg="rgba(245,158,11,0.08)" />
            <ResultPill label={fixture.awayTeam?.name?.split(' ')[0]} prob={prediction.awayWinProb} color="#a78bfa" bg="rgba(167,139,250,0.08)" />
          </div>
          <div style={{ padding: '16px', background: 'var(--sw-surface-1)', borderRadius: 12, border: '1px solid var(--sw-border)' }}>
            <div style={{ fontSize: 12, fontWeight: 800, color: '#f1f5f9', marginBottom: 10 }}>Top Correct Score Projections</div>
            <ScoreGrid scores={prediction.scores} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default function CorrectScorePage({ fixtures = [], loading }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [selected, setSelected] = useState(null)
  const [modalFixture, setModalFixture] = useState(null)
  const [search, setSearch] = useState('')

  const tx = {
    search: 'Search team / league...',
    loading: 'Loading...',
    noResults: 'No results',
    noMatches: 'No matches for this day',
    pick: 'Select a match to see prediction',
    projections: 'Score Projections',
    draw: 'Draw',
    analysisBase: 'Analysis base',
  }

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
        const p = predictScores(f.homeHistory || [], f.awayHistory || [], f.h2h || [])
        const top = p?.scores?.[0]?.probability ?? 0
        return { fixture: f, prediction: p, topProb: top }
      })
      .sort((a, b) => b.topProb - a.topProb)
  }, [filteredFixtures])

  const topRankedFixtures = useMemo(() => rankedFixtures.slice(0, 10), [rankedFixtures])

  const selectedPrediction = useMemo(() => {
    if (!selected) return null
    return topRankedFixtures.find(x => x.fixture.id === selected.id)?.prediction
      || predictScores(selected.homeHistory || [], selected.awayHistory || [], selected.h2h || [])
  }, [selected, topRankedFixtures])

  const modalPrediction = useMemo(() => {
    if (!modalFixture) return null
    return topRankedFixtures.find(x => x.fixture.id === modalFixture.id)?.prediction
      || predictScores(modalFixture.homeHistory || [], modalFixture.awayHistory || [], modalFixture.h2h || [])
  }, [modalFixture, topRankedFixtures])

  useEffect(() => {
    if (!topRankedFixtures.length) {
      if (selected) setSelected(null)
      if (modalFixture) setModalFixture(null)
      return
    }
    const stillVisible = selected && topRankedFixtures.some(x => x.fixture.id === selected.id)
    if (!stillVisible) setSelected(topRankedFixtures[0].fixture)

    const modalStillVisible = modalFixture && topRankedFixtures.some(x => x.fixture.id === modalFixture.id)
    if (modalFixture && !modalStillVisible) setModalFixture(null)
  }, [topRankedFixtures, selected, modalFixture])

  return (
    <div className="cs-root" style={{ display: 'flex', gap: 16, height: '100%', minHeight: 0, padding: 16, alignItems: 'stretch' }}>
      <style>{`
        .cs-panel {
          border: 1px solid var(--sw-border);
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(24,25,28,0.96), rgba(17,18,20,0.98));
        }

        .cs-stack {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        @media (max-width: 980px) {
          .cs-root { flex-direction: column !important; height: auto !important; padding: 12px !important; gap: 12px !important; }
          .cs-left { width: 100% !important; max-height: none !important; }
          .cs-right { width: 100% !important; padding: 0 !important; overflow: visible !important; }
          .cs-right-inner { width: 100% !important; max-width: 100% !important; }
          .cs-stack { gap: 12px !important; }
          .cs-summary-grid { grid-template-columns: 1fr !important; }
          .cs-action-row { flex-direction: column !important; }
          .cs-action-row > button { width: 100%; }
          .cs-selected-row { grid-template-columns: 1fr !important; }
          .cs-selected-score { justify-self: start !important; }
        }
        @media (max-width: 620px) {
          .cs-root { padding: 10px !important; }
          .cs-left-header,
          .cs-detail-card,
          .cs-score-panel,
          .cs-note-card,
          .cs-select-card { padding-left: 12px !important; padding-right: 12px !important; }
          .cs-outcome-row { flex-direction: column !important; }
          .cs-score-grid-top { grid-template-columns: 1fr !important; }
          .cs-score-panel { padding: 14px !important; }
        }
      `}</style>

      <div className="cs-left cs-panel" style={{ width: 340, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>
        <div className="cs-left-header" style={{ padding: '14px', borderBottom: '1px solid var(--sw-border)' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9', marginBottom: 8 }}>{'\u{1F3AF}'} {t('correct_score')}</div>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: 13, color: 'var(--sw-muted)' }}>{'\u{1F50D}'}</span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={tx.search} style={{ width: '100%', padding: '8px 10px 8px 30px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-bg)', color: '#f1f5f9', fontSize: 12, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          {loading && <div style={{ color: '#d1d5db', fontSize: 13, padding: '20px', textAlign: 'center' }}>{tx.loading}</div>}
          <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!loading && filteredFixtures.length === 0 && (
              <div style={{ color: 'var(--sw-muted)', fontSize: 13, padding: '40px 20px', textAlign: 'center' }}>{search ? tx.noResults : tx.noMatches}</div>
            )}
            {!loading && filteredFixtures.length > 10 && (
              <div style={{ color: 'var(--sw-muted)', fontSize: 11, padding: '0 4px 4px', textAlign: 'center' }}>
                Showing top 10 fixtures by highest correct score probability
              </div>
            )}
            {topRankedFixtures.map(({ fixture: f, topProb }) => (
              <FixtureCard
                key={f.id}
                fixture={f}
                onClick={(fixture) => { setSelected(fixture) }}
                selected={selected?.id === f.id}
                topProb={topProb}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="cs-right" style={{ flex: 1, overflowY: 'auto', padding: '4px 0', minWidth: 0 }}>
        {!selected && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--sw-muted)', paddingTop: 80 }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{'\u{1F4CA}'}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{tx.pick}</div>
          </div>
        )}

        {selected && selectedPrediction && (
          <div className="cs-right-inner cs-stack" style={{ width: 'min(100%, 980px)', margin: '0 auto' }}>
            <div className="cs-select-card cs-panel" style={{ padding: '12px 14px' }}>
              <div style={{ fontSize: 11, color: 'var(--sw-muted)', marginBottom: 6, fontWeight: 700 }}>Select fixture (top 10 highest-probability matches)</div>
              <select
                value={selected?.id != null ? String(selected.id) : ''}
                onChange={e => {
                  const id = e.target.value
                  const found = rankedFixtures.find(x => String(x.fixture.id) === id)?.fixture
                  if (found) setSelected(found)
                }}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-bg)', color: '#f1f5f9', fontSize: 12, outline: 'none' }}
              >
                {rankedFixtures.map(({ fixture: f, topProb }) => (
                  <option key={f.id} value={String(f.id)}>
                    {f.homeTeam?.name} vs {f.awayTeam?.name} - Top {topProb.toFixed(1)}%
                  </option>
                ))}
              </select>
            </div>

            <div className="cs-detail-card cs-panel" style={{ padding: '16px 20px' }}>
              <div style={{ fontSize: 11, color: 'var(--sw-muted)', marginBottom: 8 }}>{selected.league?.name}{selected.time ? ` • ${selected.time}` : ''}</div>
              <div className="cs-selected-row" style={{ display: 'grid', gridTemplateColumns: '32px minmax(0,1fr) 42px', alignItems: 'center', gap: 12 }}>
                <div className="cs-selected-score" style={{ width: 64, textAlign: 'center', justifySelf: 'center' }}>
                  <span style={{ fontSize: 15, fontWeight: 800, color: selected.status === 'FT' ? '#22c55e' : selected.isLive ? '#f97316' : '#94a3b8', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {selected.isLive ? `${selected.elapsed || ''}'` : selected.status === 'FT' ? 'FT' : ''}
                  </span>
                </div>
                <div style={{ minWidth: 0, display: 'grid', gridTemplateRows: '1fr 1fr', gap: 10, marginLeft: -44 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <TeamBadge team={selected.homeTeam} size={20} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2, textAlign: 'left' }}>{selected.homeTeam?.name}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <TeamBadge team={selected.awayTeam} size={20} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', lineHeight: 1.2, textAlign: 'left' }}>{selected.awayTeam?.name}</span>
                  </div>
                </div>
                <div style={{ textAlign: 'center', minWidth: 42 }}>
                  {(selected.isLive || selected.status === 'FT') ? (
                    <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 10 }}>
                      <span style={{ fontSize: 20, fontWeight: 900, color: '#f8fafc', lineHeight: 1 }}>{selected.homeGoals ?? '-'}</span>
                      <span style={{ fontSize: 20, fontWeight: 900, color: '#f8fafc', lineHeight: 1 }}>{selected.awayGoals ?? '-'}</span>
                    </div>
                  ) : null}
                </div>
              </div>
              <div style={{ marginTop: 10 }}>
                <div className="cs-action-row" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    onClick={() => setModalFixture(selected)}
                    style={{ minHeight: 34, padding: '0 12px', borderRadius: 8, border: '1px solid var(--sw-border-strong)', background: 'rgba(255,122,0,0.12)', color: '#f5f5f5', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Quick View
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/match/${selected.id}?stat=correctScore`)}
                    style={{ minHeight: 34, padding: '0 12px', borderRadius: 8, border: '1px solid rgba(209,213,219,0.4)', background: 'rgba(209,213,219,0.12)', color: '#e5e7eb', fontWeight: 700, cursor: 'pointer' }}
                  >
                    Open Match Details
                  </button>
                </div>
              </div>
            </div>

            <div className="cs-note-card" style={{ padding: '10px 14px', borderRadius: 12, background: 'rgba(255,122,0,0.08)', border: '1px solid rgba(255,122,0,0.22)', fontSize: 12, color: '#d1d5db', lineHeight: 1.5 }}>{'\u26A0\uFE0F'} {t('cs_disclaimer')}</div>

            <div className="cs-outcome-row cs-summary-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 10 }}>
              <ResultPill label={selected.homeTeam?.name?.split(' ')[0]} prob={selectedPrediction.homeWinProb} color="#d1d5db" bg="rgba(209,213,219,0.08)" />
              <ResultPill label={tx.draw} prob={selectedPrediction.drawProb} color="#f59e0b" bg="rgba(245,158,11,0.08)" />
              <ResultPill label={selected.awayTeam?.name?.split(' ')[0]} prob={selectedPrediction.awayWinProb} color="#a78bfa" bg="rgba(167,139,250,0.08)" />
            </div>

            <div className="cs-score-panel cs-panel" style={{ padding: '20px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', marginBottom: 14 }}>{'\u{1F522}'} {tx.projections}</div>
              <ScoreGrid scores={selectedPrediction.scores} />
            </div>

            <div className="cs-panel" style={{ padding: '14px 16px', fontSize: 12, color: 'var(--sw-muted)', lineHeight: 1.5 }}>
              <span style={{ color: '#64748b' }}>{tx.analysisBase}: </span>
              {selected.homeHistory?.length || 0} / {selected.awayHistory?.length || 0} / {selected.h2h?.length || 0} H2H
            </div>
          </div>
        )}
      </div>

      {modalFixture && modalPrediction && (
        <CorrectScoreDetailsModal
          fixture={modalFixture}
          prediction={modalPrediction}
          onClose={() => setModalFixture(null)}
          onOpenMatch={(fixture) => {
            if (!fixture?.id) return
            navigate(`/match/${fixture.id}?stat=correctScore`)
          }}
        />
      )}
    </div>
  )
}
