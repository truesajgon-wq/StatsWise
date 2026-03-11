import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeDayFixtures, patternLabel, strengthColor } from '../data/lamakiEngine.js'
import { useLang } from '../context/LangContext.jsx'
import { formatAppDate } from '../utils/dateFormat.js'
import { getAppToday } from '../utils/appDate.js'

function ScoreRing({ score, color, size = 64 }) {
  const r = (size / 2) - 6
  const circ = 2 * Math.PI * r
  const filled = (score / 100) * circ
  return (
    <svg width={size} height={size} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sw-border)" strokeWidth={5} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={5}
        strokeDasharray={`${filled} ${circ}`}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x={size / 2} y={size / 2 + 1} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={size < 60 ? 11 : 14} fontWeight="800" fontFamily="monospace">
        {score}
      </text>
    </svg>
  )
}

function PatternTag({ label, icon, color = 'var(--sw-muted)', bg = 'rgba(255,255,255,0.04)' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 12, background: bg, border: `1px solid ${color}30`, color, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>
      {icon && <span>{icon}</span>}
      {label}
    </span>
  )
}

function TeamBadge({ team, size = 28 }) {
  const name = team?.name || '?'
  if (team?.logo) {
    return <img src={team.logo} alt={name} style={{ width: size, height: size, objectFit: 'contain' }} onError={e => { e.target.style.display = 'none' }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: team?.color || 'var(--sw-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.4, fontWeight: 800, color: '#fff' }}>
      {name[0]?.toUpperCase() || '?'}
    </div>
  )
}

function formatDate(value) {
  return formatAppDate(value)
}

function asNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function perspectiveScores(match, isHomePerspective) {
  const my = asNum(match?.myGoals)
  const their = asNum(match?.theirGoals)
  if (my !== null && their !== null) return { my, their }
  const hg = asNum(match?.homeGoals)
  const ag = asNum(match?.awayGoals)
  if (hg !== null && ag !== null) return isHomePerspective ? { my: hg, their: ag } : { my: ag, their: hg }
  return { my: null, their: null }
}

function perspectiveHalfScores(match, isHomePerspective) {
  const my = asNum(match?.myFirstHalfGoals)
  const their = asNum(match?.theirFirstHalfGoals)
  if (my !== null && their !== null) return { my, their }
  const hg = asNum(match?.homeGoalsHt)
  const ag = asNum(match?.awayGoalsHt)
  if (hg !== null && ag !== null) return isHomePerspective ? { my: hg, their: ag } : { my: ag, their: hg }
  return { my: null, their: null }
}

function isComebackWin(match, isHomePerspective) {
  const ft = perspectiveScores(match, isHomePerspective)
  if (ft.my === null || ft.their === null || ft.my <= ft.their) return false
  const ht = perspectiveHalfScores(match, isHomePerspective)
  if (ht.my !== null && ht.their !== null) return ht.my < ht.their
  return ft.their >= 1
}

function mapComebackRows(history = [], isHomePerspective) {
  return history.filter(m => isComebackWin(m, isHomePerspective)).slice(0, 12).map(m => {
    const ft = perspectiveScores(m, isHomePerspective)
    const ht = perspectiveHalfScores(m, isHomePerspective)
    return {
      date: m?.date,
      opponent: m?.opponent || 'Opponent',
      ft: ft.my === null || ft.their === null ? '-' : `${ft.my}:${ft.their}`,
      ht: ht.my === null || ht.their === null ? '-' : `${ht.my}:${ht.their}`,
    }
  })
}

function LamakDetailsModal({ result, onClose, onOpenMatch }) {
  const { t } = useLang()
  if (!result) return null
  const { fixture, homeScore, awayScore, combinedScore, probability, strength, lamakType, hasTriangle, homePatterns, awayPatterns } = result
  const color = strengthColor(strength)
  const homeHistory = fixture?.homeHistory || []
  const awayHistory = fixture?.awayHistory || []
  const homeComebacks = mapComebackRows(homeHistory, true)
  const awayComebacks = mapComebackRows(awayHistory, false)
  const homeRate = homeHistory.length ? Math.round((homeComebacks.length / homeHistory.length) * 100) : 0
  const awayRate = awayHistory.length ? Math.round((awayComebacks.length / awayHistory.length) * 100) : 0
  const lamakTypeLabel = { home: t('lamaki_home'), away: t('lamaki_away'), both: t('lamaki_both') }[lamakType] || 'Mixed'
  const allPatterns = [...homePatterns.map(p => ({ ...p, side: 'home' })), ...awayPatterns.map(p => ({ ...p, side: 'away' }))]

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 130, background: 'rgba(2,6,23,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 'min(980px, 100%)', maxHeight: '92vh', overflowY: 'auto', borderRadius: 14, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', boxShadow: '0 20px 60px rgba(2,6,23,0.7)' }}>
        <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--sw-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>COMEBACK DETAILS</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => onOpenMatch?.(result)} style={{ minHeight: 30, padding: '0 10px', borderRadius: 8, border: '1px solid rgba(209,213,219,0.4)', background: 'rgba(209,213,219,0.12)', color: '#e5e7eb', cursor: 'pointer' }}>Open Match Details</button>
            <button onClick={onClose} style={{ minHeight: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-1)', color: '#94a3b8', cursor: 'pointer' }}>Close</button>
          </div>
        </div>
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ border: `1px solid ${color}55`, borderRadius: 12, padding: 12, background: 'rgba(15,23,42,0.7)' }}>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#f1f5f9' }}>{fixture?.homeTeam?.name} vs {fixture?.awayTeam?.name}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>{fixture?.league?.name} - {fixture?.time || '-'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginTop: 10 }}>
              <div style={{ border: '1px solid var(--sw-border)', borderRadius: 8, padding: '8px 10px' }}><div style={{ fontSize: 10, color: '#64748b' }}>Probability</div><div style={{ fontSize: 18, fontWeight: 900, color }}>{probability}%</div></div>
              <div style={{ border: '1px solid var(--sw-border)', borderRadius: 8, padding: '8px 10px' }}><div style={{ fontSize: 10, color: '#64748b' }}>Combined Score</div><div style={{ fontSize: 18, fontWeight: 900, color: '#e2e8f0' }}>{combinedScore}</div></div>
              <div style={{ border: '1px solid var(--sw-border)', borderRadius: 8, padding: '8px 10px' }}><div style={{ fontSize: 10, color: '#64748b' }}>Home/Away Scores</div><div style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0' }}>{homeScore} / {awayScore}</div></div>
              <div style={{ border: '1px solid var(--sw-border)', borderRadius: 8, padding: '8px 10px' }}><div style={{ fontSize: 10, color: '#64748b' }}>Comeback Type</div><div style={{ fontSize: 14, fontWeight: 800, color: '#e5e7eb' }}>{lamakTypeLabel}</div></div>
              <div style={{ border: '1px solid var(--sw-border)', borderRadius: 8, padding: '8px 10px' }}><div style={{ fontSize: 10, color: '#64748b' }}>Triangle Pattern</div><div style={{ fontSize: 14, fontWeight: 800, color: hasTriangle ? '#a78bfa' : '#64748b' }}>{hasTriangle ? 'Yes' : 'No'}</div></div>
            </div>
          </div>
          {allPatterns.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {allPatterns.map((p, i) => <PatternTag key={`${p.type}-${i}`} label={patternLabel(p, t)} color={p.side === 'home' ? '#d1d5db' : '#a78bfa'} />)}
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 10 }}>
            <div style={{ border: '1px solid var(--sw-border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 10px', background: 'var(--sw-surface-0)', borderBottom: '1px solid var(--sw-border)', fontSize: 12, fontWeight: 800, color: '#e5e7eb' }}>{fixture?.homeTeam?.name} Comeback Wins ({homeComebacks.length}/{homeHistory.length}, {homeRate}%)</div>
              {homeComebacks.length ? homeComebacks.map((r, idx) => (
                <div key={`h-${idx}`} style={{ display: 'grid', gridTemplateColumns: '84px 1fr 76px 76px', gap: 8, padding: '8px 10px', borderBottom: idx === homeComebacks.length - 1 ? 'none' : '1px solid #172133', background: idx % 2 ? '#0b1424' : 'transparent' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatDate(r.date)}</div>
                  <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 700 }}>{r.opponent}</div>
                  <div style={{ fontSize: 11, color: '#e5e7eb' }}>HT {r.ht}</div>
                  <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>FT {r.ft}</div>
                </div>
              )) : <div style={{ padding: '10px', fontSize: 12, color: '#64748b' }}>No comeback wins found in loaded history.</div>}
            </div>
            <div style={{ border: '1px solid var(--sw-border)', borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '8px 10px', background: 'var(--sw-surface-0)', borderBottom: '1px solid var(--sw-border)', fontSize: 12, fontWeight: 800, color: '#c4b5fd' }}>{fixture?.awayTeam?.name} Comeback Wins ({awayComebacks.length}/{awayHistory.length}, {awayRate}%)</div>
              {awayComebacks.length ? awayComebacks.map((r, idx) => (
                <div key={`a-${idx}`} style={{ display: 'grid', gridTemplateColumns: '84px 1fr 76px 76px', gap: 8, padding: '8px 10px', borderBottom: idx === awayComebacks.length - 1 ? 'none' : '1px solid #172133', background: idx % 2 ? '#0b1424' : 'transparent' }}>
                  <div style={{ fontSize: 11, color: '#94a3b8' }}>{formatDate(r.date)}</div>
                  <div style={{ fontSize: 12, color: '#e2e8f0', fontWeight: 700 }}>{r.opponent}</div>
                  <div style={{ fontSize: 11, color: '#c4b5fd' }}>HT {r.ht}</div>
                  <div style={{ fontSize: 11, color: '#22c55e', fontWeight: 700 }}>FT {r.ft}</div>
                </div>
              )) : <div style={{ padding: '10px', fontSize: 12, color: '#64748b' }}>No comeback wins found in loaded history.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function LamakCard({ result, onOpen }) {
  const { t } = useLang()
  const { fixture, homeScore, awayScore, combinedScore, probability, strength, lamakType, hasTriangle, homePatterns, awayPatterns } = result
  const color = strengthColor(strength)
  const lamakTypeLabel = { home: t('lamaki_home'), away: t('lamaki_away'), both: t('lamaki_both') }[lamakType] || ''
  const allPatterns = [...homePatterns.map(p => ({ ...p, side: 'home' })), ...awayPatterns.map(p => ({ ...p, side: 'away' }))]

  return (
    <button type="button" onClick={() => onOpen?.(result)} className="lamaki-card" style={{ background: 'var(--sw-surface-1)', border: `1px solid ${color}40`, borderLeft: `3px solid ${color}`, borderRadius: 12, padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12, width: '100%', cursor: 'pointer', textAlign: 'left' }}>
      <div className="lamaki-card-top" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ScoreRing score={combinedScore} color={color} size={60} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10, color: '#4b5563', fontWeight: 600, letterSpacing: '0.06em', marginBottom: 5 }}>{fixture.league?.name} - {fixture.time}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <TeamBadge team={fixture.homeTeam} size={20} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fixture.homeTeam?.name}</span>
            <span style={{ fontSize: 11, color: '#4b5563', flexShrink: 0 }}>vs</span>
            <TeamBadge team={fixture.awayTeam} size={20} />
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fixture.awayTeam?.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
            <PatternTag label={strength === 'strong' ? t('lamaki_strong') : strength === 'moderate' ? t('lamaki_moderate') : t('lamaki_weak')} icon={strength === 'strong' ? 'FIRE' : strength === 'moderate' ? 'HOT' : 'INFO'} color={color} bg={`${color}18`} />
            {lamakType && <PatternTag label={lamakTypeLabel} icon="CB" color="#d1d5db" bg="rgba(249,115,22,0.08)" />}
            {hasTriangle && <PatternTag label={t('lamaki_triangle')} icon="TRI" color="#a78bfa" bg="rgba(167,139,250,0.08)" />}
            <PatternTag label="Click for full breakdown" color="#e5e7eb" bg="rgba(249,115,22,0.08)" />
          </div>
        </div>
        <div style={{ textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 22, fontWeight: 900, color, lineHeight: 1 }}>{probability}%</div>
          <div style={{ fontSize: 9, color: '#4b5563', letterSpacing: '0.06em', marginTop: 2 }}>{t('lamaki_prob').toUpperCase()}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b7280', marginBottom: 3 }}><span>{fixture.homeTeam?.name?.split(' ')[0]}</span><span>{homeScore}</span></div>
          <div style={{ height: 4, background: 'var(--sw-border)', borderRadius: 2, overflow: 'hidden' }}><div style={{ width: `${homeScore}%`, height: '100%', background: lamakType === 'home' ? color : 'var(--sw-border)', borderRadius: 2 }} /></div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#6b7280', marginBottom: 3 }}><span>{fixture.awayTeam?.name?.split(' ')[0]}</span><span>{awayScore}</span></div>
          <div style={{ height: 4, background: 'var(--sw-border)', borderRadius: 2, overflow: 'hidden' }}><div style={{ width: `${awayScore}%`, height: '100%', background: lamakType === 'away' ? color : 'var(--sw-border)', borderRadius: 2 }} /></div>
        </div>
      </div>

      {allPatterns.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {allPatterns.slice(0, 6).map((p, i) => <PatternTag key={i} label={patternLabel(p, t)} color={p.side === 'home' ? '#d1d5db' : '#a78bfa'} />)}
        </div>
      )}
    </button>
  )
}

export default function LamakiPage({ fixtures = [], loading }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [selected, setSelected] = useState(null)
  const [filter, setFilter] = useState('all')
  const results = useMemo(() => (!fixtures.length ? [] : analyzeDayFixtures(fixtures, getAppToday())), [fixtures])
  const filteredResults = useMemo(() => {
    if (filter === 'mutual') return results.filter(r => r.lamakType === 'both')
    if (filter === 'sameMonth') {
      return results.filter(r =>
        [...(r.homePatterns || []), ...(r.awayPatterns || [])].some(p => p.type === 'calendar_month')
      )
    }
    return results
  }, [results, filter])
  const strong = filteredResults.filter(r => r.strength === 'strong')
  const moderate = filteredResults.filter(r => r.strength === 'moderate')
  const weak = filteredResults.filter(r => r.strength === 'weak')

  return (
    <div className="lamaki-page" style={{ padding: '20px' }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <span style={{ fontSize: 28 }}>↩</span>
          <div>
            <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#f1f5f9' }}>{t('lamaki_title')}</h2>
            <p style={{ margin: 0, fontSize: 13, color: '#6b7280', marginTop: 2 }}>{t('lamaki_subtitle')}</p>
          </div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { key: 'all', label: 'All' },
              { key: 'mutual', label: 'Mutual' },
              { key: 'sameMonth', label: 'Same Month' },
            ].map(btn => {
              const active = filter === btn.key
              return (
                <button
                  key={btn.key}
                  type="button"
                  onClick={() => setFilter(btn.key)}
                  style={{
                    padding: '6px 10px',
                    borderRadius: 8,
                    border: `1px solid ${active ? '#d1d5db' : 'var(--sw-border)'}`,
                    background: active ? 'rgba(209,213,219,0.15)' : 'var(--sw-surface-1)',
                    color: active ? '#e5e7eb' : '#94a3b8',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {btn.label}
                </button>
              )
            })}
          </div>
        </div>
        <div className="lamaki-legend" style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginTop: 10 }}>
          {[{ label: t('lamaki_strong'), color: '#22c55e', count: strong.length }, { label: t('lamaki_moderate'), color: '#f59e0b', count: moderate.length }, { label: t('lamaki_weak'), color: '#6b7280', count: weak.length }].map(({ label, color, count }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: color }} />
              <span style={{ color: '#9ca3af' }}>{label}</span>
              <span style={{ color, fontWeight: 700, fontSize: 13 }}>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {loading && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[1, 2, 3].map(i => <div key={i} style={{ height: 120, borderRadius: 12, background: 'var(--sw-surface-1)', border: '1px solid var(--sw-border)', opacity: 0.6 }} />)}</div>}

      {!loading && filteredResults.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#4b5563' }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>↩</div>
          <div style={{ fontSize: 18, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>{t('lamaki_none')}</div>
          <div style={{ fontSize: 13 }}>{t('lamaki_none_sub')}</div>
        </div>
      )}

      {!loading && filteredResults.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {strong.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', letterSpacing: '0.1em', marginTop: 4, marginBottom: 2 }}>STRONG ({strong.length})</div>
              {strong.map((r, i) => <LamakCard key={`s-${i}`} result={r} onOpen={setSelected} />)}
            </>
          )}
          {moderate.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.1em', marginTop: 8, marginBottom: 2 }}>MODERATE ({moderate.length})</div>
              {moderate.map((r, i) => <LamakCard key={`m-${i}`} result={r} onOpen={setSelected} />)}
            </>
          )}
          {weak.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.1em', marginTop: 8, marginBottom: 2 }}>WEAK ({weak.length})</div>
              {weak.map((r, i) => <LamakCard key={`w-${i}`} result={r} onOpen={setSelected} />)}
            </>
          )}
        </div>
      )}

      {selected && (
        <LamakDetailsModal
          result={selected}
          onClose={() => setSelected(null)}
          onOpenMatch={(item) => {
            const fixtureId = item?.fixture?.id
            if (!fixtureId) return
            navigate(`/match/${fixtureId}?stat=comeback`)
          }}
        />
      )}
    </div>
  )
}

export { strengthColor }


