import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
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

function asNum(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
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

function fixtureOrderedScores(match, isHomeFallback = true) {
  const homeGoals = asNum(match?.homeGoals)
  const awayGoals = asNum(match?.awayGoals)
  if (homeGoals !== null && awayGoals !== null) return { home: homeGoals, away: awayGoals }

  const myGoals = asNum(match?.myGoals)
  const theirGoals = asNum(match?.theirGoals)
  if (myGoals === null || theirGoals === null) return { home: null, away: null }

  const isHome = typeof match?.isHome === 'boolean' ? match.isHome : isHomeFallback
  return isHome ? { home: myGoals, away: theirGoals } : { home: theirGoals, away: myGoals }
}

function fixtureOrderedHalfScores(match, isHomeFallback = true) {
  const homeGoalsHt = asNum(match?.homeGoalsHt)
  const awayGoalsHt = asNum(match?.awayGoalsHt)
  if (homeGoalsHt !== null && awayGoalsHt !== null) return { home: homeGoalsHt, away: awayGoalsHt }

  const myGoals = asNum(match?.myFirstHalfGoals)
  const theirGoals = asNum(match?.theirFirstHalfGoals)
  if (myGoals === null || theirGoals === null) return { home: null, away: null }

  const isHome = typeof match?.isHome === 'boolean' ? match.isHome : isHomeFallback
  return isHome ? { home: myGoals, away: theirGoals } : { home: theirGoals, away: myGoals }
}

function isComebackWin(match, isHomePerspective) {
  const ft = perspectiveScores(match, isHomePerspective)
  if (ft.my === null || ft.their === null || ft.my <= ft.their) return false
  const ht = perspectiveHalfScores(match, isHomePerspective)
  if (ht.my !== null && ht.their !== null) return ht.my < ht.their
  return ft.their >= 1
}

function mapComebackRows(history = [], isHomePerspective, ownTeamName = 'Team') {
  return history.filter(match => isComebackWin(match, isHomePerspective)).slice(0, 12).map(match => {
    const isHomeMatch = typeof match?.isHome === 'boolean' ? match.isHome : isHomePerspective
    const opponent = match?.opponent || 'Opponent'
    const fixtureName = isHomeMatch ? `${ownTeamName} vs ${opponent}` : `${opponent} vs ${ownTeamName}`
    const ft = fixtureOrderedScores(match, isHomePerspective)
    const ht = fixtureOrderedHalfScores(match, isHomePerspective)
    return {
      date: match?.date,
      opponent,
      fixtureName,
      isHome: isHomeMatch,
      ft: ft.home === null || ft.away === null ? '-' : `${ft.home}:${ft.away}`,
      ht: ht.home === null || ht.away === null ? '-' : `${ht.home}:${ht.away}`,
    }
  })
}

function formatPercent(value) {
  return `${Math.round((value || 0) * 100)}%`
}

function certaintyLabel(certainty) {
  if (certainty === 'ht') return 'Backed by halftime split'
  if (certainty === 'proxy') return 'Backed by full-time swing proxy'
  return 'Limited evidence'
}

function buildRecommendationReasons(result, t) {
  const {
    lamakType,
    hasTriangle,
    homeMeta = {},
    awayMeta = {},
    homePatterns = [],
    awayPatterns = [],
  } = result

  const reasons = []

  if (lamakType === 'home' || lamakType === 'both') {
    reasons.push(
      `${result.fixture?.homeTeam?.name} have ${homeMeta.exactComebackCount || homeMeta.comebackCount || 0} ${t('lamaki_one_two_two_one')} matches in ${homeMeta.sampleSize || 0} loaded games (${formatPercent(homeMeta.exactComebackRate || homeMeta.comebackRate)}).`,
    )
  }

  if (lamakType === 'away' || lamakType === 'both') {
    reasons.push(
      `${result.fixture?.awayTeam?.name} have ${awayMeta.exactComebackCount || awayMeta.comebackCount || 0} ${t('lamaki_one_two_two_one')} matches in ${awayMeta.sampleSize || 0} loaded games (${formatPercent(awayMeta.exactComebackRate || awayMeta.comebackRate)}).`,
    )
  }

  if ((lamakType === 'home' || lamakType === 'both') && (awayMeta.wfbCount || awayMeta.collapseCount)) {
    reasons.push(
      `${result.fixture?.awayTeam?.name} show ${awayMeta.wfbCount || awayMeta.collapseCount} ${t('lamaki_wfb')} patterns (${formatPercent(awayMeta.wfbRate || awayMeta.collapseRate)}), so they are more vulnerable after scoring first.`,
    )
  }

  if ((lamakType === 'away' || lamakType === 'both') && (homeMeta.wfbCount || homeMeta.collapseCount)) {
    reasons.push(
      `${result.fixture?.homeTeam?.name} show ${homeMeta.wfbCount || homeMeta.collapseCount} ${t('lamaki_wfb')} patterns (${formatPercent(homeMeta.wfbRate || homeMeta.collapseRate)}), so they are more vulnerable after scoring first.`,
    )
  }

  if (homeMeta.recentComebacks >= 2 || awayMeta.recentComebacks >= 2) {
    reasons.push(`Recent form still supports the pattern: at least one side has multiple ${t('lamaki_one_two_two_one')} results in the last 3 loaded matches.`)
  }

  if (hasTriangle) {
    reasons.push(`${t('lamaki_triangle')} is active, which adds overlap between both teams' winning patterns and raises comeback volatility.`)
  }

  const monthHits = (homeMeta.datePatterns?.sameMonth || 0) + (awayMeta.datePatterns?.sameMonth || 0)
  if (monthHits >= 3) {
    reasons.push(`Calendar pattern support is present too: ${monthHits} related matches landed in the same month window.`)
  }

  const patternCount = homePatterns.length + awayPatterns.length
  if (patternCount > 0) {
    reasons.push(`The engine found ${patternCount} supporting pattern tags across both teams, not just one isolated stat.`)
  }

  return reasons.slice(0, 5)
}

function LamakDetailsModal({ result, onClose, onOpenMatch }) {
  const { t } = useLang()
  if (!result || typeof document === 'undefined') return null

  const {
    fixture,
    homeScore,
    awayScore,
    combinedScore,
    probability,
    strength,
    lamakType,
    hasTriangle,
    homePatterns = [],
    awayPatterns = [],
    homeMeta = {},
    awayMeta = {},
  } = result

  const color = strengthColor(strength)
  const homeHistory = fixture?.homeHistory || []
  const awayHistory = fixture?.awayHistory || []
  const homeComebacks = mapComebackRows(homeHistory, true, fixture?.homeTeam?.name || 'Home')
  const awayComebacks = mapComebackRows(awayHistory, false, fixture?.awayTeam?.name || 'Away')
  const homeRate = homeHistory.length ? Math.round((homeComebacks.length / homeHistory.length) * 100) : 0
  const awayRate = awayHistory.length ? Math.round((awayComebacks.length / awayHistory.length) * 100) : 0
  const lamakTypeLabel = { home: t('lamaki_home'), away: t('lamaki_away'), both: t('lamaki_both') }[lamakType] || 'Mixed'
  const certainty =
    homeMeta.certainty === 'ht' || awayMeta.certainty === 'ht'
      ? 'ht'
      : homeMeta.certainty === 'proxy' || awayMeta.certainty === 'proxy'
        ? 'proxy'
        : 'none'
  const allPatterns = [...homePatterns.map(pattern => ({ ...pattern, side: 'home' })), ...awayPatterns.map(pattern => ({ ...pattern, side: 'away' }))]
  const recommendationReasons = buildRecommendationReasons(result, t)

  return createPortal(
    <div className="lamaki-modal-overlay" onClick={onClose}>
      <div className="lamaki-modal-shell" onClick={e => e.stopPropagation()}>
        <div className="lamaki-modal-header">
          <div className="lamaki-modal-headline">
            <div className="lamaki-modal-eyebrow">COMEBACK DETAILS</div>
            <div className="lamaki-modal-title">{fixture?.homeTeam?.name} vs {fixture?.awayTeam?.name}</div>
            <div className="lamaki-modal-subtitle">{fixture?.league?.name} · {fixture?.time || '-'} · {lamakTypeLabel}</div>
          </div>
          <div className="lamaki-modal-actions">
            <button
              onClick={() => onOpenMatch?.(result)}
              className="theme-button-secondary"
              style={{ minHeight: 38, padding: '0 12px', borderRadius: 10, cursor: 'pointer' }}
            >
              Open Match Details
            </button>
            <button
              onClick={onClose}
              className="theme-button-ghost"
              style={{ minHeight: 38, minWidth: 38, width: 38, padding: 0, borderRadius: 999, cursor: 'pointer' }}
              aria-label="Close comeback details"
            >
              X
            </button>
          </div>
        </div>

        <div className="lamaki-modal-content">
          <div className="lamaki-modal-summary">
            <div className="lamaki-metric-card">
              <div className="lamaki-metric-label">Probability</div>
              <div className="lamaki-metric-value" style={{ color }}>{probability}%</div>
            </div>
            <div className="lamaki-metric-card">
              <div className="lamaki-metric-label">Combined Score</div>
              <div className="lamaki-metric-value">{combinedScore}</div>
            </div>
            <div className="lamaki-metric-card">
              <div className="lamaki-metric-label">Home / Away Edge</div>
              <div className="lamaki-metric-value">{homeScore} / {awayScore}</div>
            </div>
            <div className="lamaki-metric-card">
              <div className="lamaki-metric-label">Pattern Type</div>
              <div className="lamaki-metric-value lamaki-metric-value-soft">{lamakTypeLabel}</div>
            </div>
            <div className="lamaki-metric-card">
              <div className="lamaki-metric-label">Data Confidence</div>
              <div className="lamaki-metric-value lamaki-metric-value-soft">{certaintyLabel(certainty)}</div>
            </div>
            <div className="lamaki-metric-card">
              <div className="lamaki-metric-label">Triangle Pattern</div>
              <div className="lamaki-metric-value lamaki-metric-value-soft" style={{ color: hasTriangle ? '#c4b5fd' : '#94a3b8' }}>{hasTriangle ? 'Active' : 'No'}</div>
            </div>
          </div>

          <div className="lamaki-rationale-grid">
            <section className="lamaki-panel-card">
              <div className="lamaki-section-title">Why this bet is proposed</div>
              <div className="lamaki-why-list">
                {recommendationReasons.map((reason, index) => (
                  <div key={index} className="lamaki-why-item">
                    <span className="lamaki-why-bullet">{index + 1}</span>
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </section>

            <section className="lamaki-panel-card">
              <div className="lamaki-section-title">Team swing profile</div>
              <div className="lamaki-team-signal-grid">
                <div className="lamaki-team-signal-card">
                  <div className="lamaki-team-signal-name">{fixture?.homeTeam?.name}</div>
                  <div className="lamaki-team-signal-line">{t('lamaki_one_two_two_one')}: <strong>{homeMeta.exactComebackCount || homeMeta.comebackCount || 0}/{homeMeta.sampleSize || 0}</strong> ({formatPercent(homeMeta.exactComebackRate || homeMeta.comebackRate)})</div>
                  <div className="lamaki-team-signal-line">{t('lamaki_wfb')}: <strong>{homeMeta.wfbCount || homeMeta.collapseCount || 0}</strong> ({formatPercent(homeMeta.wfbRate || homeMeta.collapseRate)})</div>
                  <div className="lamaki-team-signal-line">Recent {t('lamaki_one_two_two_one')}: <strong>{homeMeta.recentComebacks || 0}</strong> in last 3</div>
                </div>
                <div className="lamaki-team-signal-card">
                  <div className="lamaki-team-signal-name">{fixture?.awayTeam?.name}</div>
                  <div className="lamaki-team-signal-line">{t('lamaki_one_two_two_one')}: <strong>{awayMeta.exactComebackCount || awayMeta.comebackCount || 0}/{awayMeta.sampleSize || 0}</strong> ({formatPercent(awayMeta.exactComebackRate || awayMeta.comebackRate)})</div>
                  <div className="lamaki-team-signal-line">{t('lamaki_wfb')}: <strong>{awayMeta.wfbCount || awayMeta.collapseCount || 0}</strong> ({formatPercent(awayMeta.wfbRate || awayMeta.collapseRate)})</div>
                  <div className="lamaki-team-signal-line">Recent {t('lamaki_one_two_two_one')}: <strong>{awayMeta.recentComebacks || 0}</strong> in last 3</div>
                </div>
              </div>
            </section>
          </div>

          {allPatterns.length > 0 && (
            <div className="lamaki-pattern-strip">
              {allPatterns.map((pattern, index) => (
                <PatternTag key={`${pattern.type}-${index}`} label={patternLabel(pattern, t)} color={pattern.side === 'home' ? '#d1d5db' : '#a78bfa'} />
              ))}
            </div>
          )}

          <div className="lamaki-history-grid">
            <div className="lamaki-history-card">
              <div className="lamaki-history-head">{fixture?.homeTeam?.name} {t('lamaki_one_two_two_one')} matches ({homeComebacks.length}/{homeHistory.length}, {homeRate}%)</div>
              {homeComebacks.length ? homeComebacks.map((row, index) => (
                <div key={`h-${index}`} className="lamaki-history-row">
                  <div className="lamaki-history-date">{formatDate(row.date)}</div>
                  <div className="lamaki-history-opponent">{row.fixtureName}</div>
                  <div className="lamaki-history-split">HT {row.ht}</div>
                  <div className="lamaki-history-split lamaki-history-split-ft">FT {row.ft}</div>
                </div>
              )) : <div className="lamaki-history-empty">No comeback wins found in loaded history.</div>}
            </div>
            <div className="lamaki-history-card">
              <div className="lamaki-history-head lamaki-history-head-away">{fixture?.awayTeam?.name} {t('lamaki_one_two_two_one')} matches ({awayComebacks.length}/{awayHistory.length}, {awayRate}%)</div>
              {awayComebacks.length ? awayComebacks.map((row, index) => (
                <div key={`a-${index}`} className="lamaki-history-row">
                  <div className="lamaki-history-date">{formatDate(row.date)}</div>
                  <div className="lamaki-history-opponent">{row.fixtureName}</div>
                  <div className="lamaki-history-split">HT {row.ht}</div>
                  <div className="lamaki-history-split lamaki-history-split-ft">FT {row.ft}</div>
                </div>
              )) : <div className="lamaki-history-empty">No comeback wins found in loaded history.</div>}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function LamakCard({ result, onOpen }) {
  const { t } = useLang()
  const { fixture, homeScore, awayScore, combinedScore, probability, strength, lamakType, hasTriangle, homePatterns, awayPatterns } = result
  const color = strengthColor(strength)
  const lamakTypeLabel = { home: t('lamaki_home'), away: t('lamaki_away'), both: t('lamaki_both') }[lamakType] || ''
  const allPatterns = [...homePatterns.map(pattern => ({ ...pattern, side: 'home' })), ...awayPatterns.map(pattern => ({ ...pattern, side: 'away' }))]

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
          {allPatterns.slice(0, 6).map((pattern, index) => <PatternTag key={index} label={patternLabel(pattern, t)} color={pattern.side === 'home' ? '#d1d5db' : '#a78bfa'} />)}
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
    if (filter === 'mutual') return results.filter(result => result.lamakType === 'both')
    if (filter === 'sameMonth') {
      return results.filter(result =>
        [...(result.homePatterns || []), ...(result.awayPatterns || [])].some(pattern => pattern.type === 'calendar_month'),
      )
    }
    return results
  }, [results, filter])
  const strong = filteredResults.filter(result => result.strength === 'strong')
  const moderate = filteredResults.filter(result => result.strength === 'moderate')
  const weak = filteredResults.filter(result => result.strength === 'weak')

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
            ].map(button => {
              const active = filter === button.key
              return (
                <button
                  key={button.key}
                  type="button"
                  onClick={() => setFilter(button.key)}
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
                  {button.label}
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

      {loading && <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{[1, 2, 3].map(index => <div key={index} style={{ height: 120, borderRadius: 12, background: 'var(--sw-surface-1)', border: '1px solid var(--sw-border)', opacity: 0.6 }} />)}</div>}

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
              {strong.map((result, index) => <LamakCard key={`s-${index}`} result={result} onOpen={setSelected} />)}
            </>
          )}
          {moderate.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', letterSpacing: '0.1em', marginTop: 8, marginBottom: 2 }}>MODERATE ({moderate.length})</div>
              {moderate.map((result, index) => <LamakCard key={`m-${index}`} result={result} onOpen={setSelected} />)}
            </>
          )}
          {weak.length > 0 && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', letterSpacing: '0.1em', marginTop: 8, marginBottom: 2 }}>WEAK ({weak.length})</div>
              {weak.map((result, index) => <LamakCard key={`w-${index}`} result={result} onOpen={setSelected} />)}
            </>
          )}
        </div>
      )}

      {selected && (
        <LamakDetailsModal
          result={selected}
          onClose={() => setSelected(null)}
          onOpenMatch={item => {
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
