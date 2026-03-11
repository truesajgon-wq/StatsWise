import { useEffect, useMemo, useState } from 'react'
import { extractStatValue, getStatDef, hasStatValue, STAT_GROUPS } from '../data/statsConfig.js'
import { useLang } from '../context/LangContext.jsx'

// â”€â”€â”€ Prediction Engine â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function formatAltValue(v) {
  return Number(v).toFixed(1)
}

function normalizeHalfAlt(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0.5
  const rounded = Math.round(n * 2) / 2
  const halfAligned = Number.isInteger(rounded) ? rounded + 0.5 : rounded
  return Math.max(0.5, halfAligned)
}

function expandHalfAltSteps(values) {
  const numeric = [...new Set(values.map(normalizeHalfAlt))]
    .sort((a, b) => a - b)
  if (numeric.length <= 1) return numeric
  const min = numeric[0]
  const max = numeric[numeric.length - 1]
  const expanded = []
  for (let v = min; v <= max + 0.0001; v += 1) {
    expanded.push(normalizeHalfAlt(Number(v.toFixed(1))))
  }
  return [...new Set(expanded)].sort((a, b) => a - b)
}

function centeredHalfAltWindow(anchor, maxVisible = 5) {
  const center = normalizeHalfAlt(anchor)
  const half = Math.floor(maxVisible / 2)
  const start = Math.max(0.5, normalizeHalfAlt(center - half))
  const window = []
  for (let i = 0; i < maxVisible; i++) {
    window.push(normalizeHalfAlt(start + i))
  }
  return window
}

function calcHits(history, statKey, alt, isHome) {
  if (!history?.length) return { hits: 0, total: 0, rate: 0, values: [] }
  const last10 = history
    .filter(match => hasStatValue(match, statKey, isHome))
    .slice(0, 10)
  if (!last10.length) return { hits: 0, total: 0, rate: 0, values: [] }
  const def    = getStatDef(statKey)
  const values = last10.map(m => extractStatValue(m, statKey, isHome))
  const hits   = values.filter(v => def?.binary ? v === 1 : (alt !== null && v > alt)).length
  return { hits, total: last10.length, rate: last10.length ? hits / last10.length : 0, values }
}

function checkStreak(history, statKey, alt, isHome, n = 3) {
  if (!history?.length) return false
  const def  = getStatDef(statKey)
  const last = history.filter(match => hasStatValue(match, statKey, isHome)).slice(0, n)
  if (last.length < n) return false
  return last.every(m => {
    const v = extractStatValue(m, statKey, isHome)
    return def?.binary ? v === 1 : (alt !== null && v > alt)
  })
}

/**
 * Build a fully clear, unambiguous prediction label for team-scope stats.
 * E.g. "Arsenal (Home) - Over 1.5 Shots on Target"
 */
function buildTeamLabel(fixture, statDef, alt, isHome) {
  const team = isHome ? fixture.homeTeam?.name : fixture.awayTeam?.name
  const side = isHome ? 'Home' : 'Away'
  if (statDef.key === 'matchResult') return `${team} (${side}) - To Win`
  if (statDef.binary) return `${team} (${side}) - ${statDef.label}`
  return `${team} (${side}) - Over ${alt} ${statDef.label}`
}

/**
 * Build an unambiguous match-scope label.
 * E.g. "Over 2.5 Total Match Goals"
 */
function buildMatchLabel(statDef, alt) {
  if (statDef.key === 'matchResult') return 'Match Result - Win'
  if (statDef.binary) return `${statDef.label} - Yes`
  return `Over ${alt} ${statDef.label}`
}

export function runPredictionEngine(fixtures, statKey, alts, minRate = 0.6) {
  const def = getStatDef(statKey)
  if (!def) return []
  const results = []
  const isTeamScope = def.scope === 'team'

  fixtures.forEach(f => {
    alts.forEach(alt => {
      if (isTeamScope) {
        // Evaluate home and away SEPARATELY for team-scope stats
        ;[true, false].forEach(isHome => {
          const teamData = calcHits(isHome ? f.homeHistory : f.awayHistory, statKey, alt, isHome)
          if (teamData.total === 0) return
          if (teamData.rate < minRate) return

          const streak = checkStreak(isHome ? f.homeHistory : f.awayHistory, statKey, alt, isHome)
          const score  = Math.min(teamData.rate + (streak ? 0.06 : 0), 1)

          results.push({
            id:           `${f.id}-${statKey}-${alt}-${isHome ? 'h' : 'a'}`,
            fixture:      f,
            statKey,
            alt,
            isHome,
            home:         isHome ? teamData : { hits:0, total:0, rate:0, values:[] },
            away:         !isHome ? teamData : { hits:0, total:0, rate:0, values:[] },
            combinedRate: score,
            rawRate:      teamData.rate,
            homeStreak:   isHome && streak,
            awayStreak:   !isHome && streak,
            teamScope:    true,
            activeTeamData: teamData,
            label:        buildTeamLabel(f, def, alt, isHome),
          })
        })
      } else {
        // Match-scope stats: evaluate both teams together
        const home = calcHits(f.homeHistory, statKey, alt, true)
        const away = calcHits(f.awayHistory, statKey, alt, false)
        if (home.total === 0 && away.total === 0) return

        const combined    = (home.rate + away.rate) / 2
        if (combined < minRate) return

        const homeStreak  = checkStreak(f.homeHistory, statKey, alt, true)
        const awayStreak  = checkStreak(f.awayHistory, statKey, alt, false)
        const streakBonus = (homeStreak ? 0.04 : 0) + (awayStreak ? 0.04 : 0)
        const score       = Math.min(combined + streakBonus, 1)

        results.push({
          id:           `${f.id}-${statKey}-${alt}`,
          fixture:      f,
          statKey,
          alt,
          isHome:       null,
          home,
          away,
          combinedRate: score,
          rawRate:      combined,
          homeStreak,
          awayStreak,
          teamScope:    false,
          label:        buildMatchLabel(def, alt),
        })
      }
    })
  })

  return results.sort((a, b) => b.combinedRate - a.combinedRate)
}

// â”€â”€â”€ Confidence styling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function getTier(rate) {
  if (rate > 0.9) return { label:'90%+', color:'#f59e0b', glow:'rgba(245,158,11,0.26)', bg:'rgba(245,158,11,0.10)', border:'rgba(245,158,11,0.34)' }
  if (rate > 0.6) return { label:'60%+', color:'#f59e0b', glow:'rgba(245,158,11,0.18)', bg:'rgba(245,158,11,0.07)', border:'rgba(245,158,11,0.28)' }
  return { label:'<=60%', color:'#22c55e', glow:'rgba(34,197,94,0.18)', bg:'rgba(34,197,94,0.07)', border:'rgba(34,197,94,0.28)' }
}

// â”€â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function ConfidenceBar({ rate, color }) {
  const tier = getTier(rate)
  const c    = color || tier.color
  return (
    <div style={{ height: 5, background: 'var(--sw-border)', borderRadius: 3, overflow: 'hidden', flex: 1 }}>
      <div style={{ width: `${rate * 100}%`, height: '100%', background: c, borderRadius: 3, transition: 'width 0.6s ease', boxShadow: rate >= 0.7 ? `0 0 6px ${c}88` : 'none' }} />
    </div>
  )
}

function MiniSparkline({ values, alt, binary, color }) {
  if (!values?.length || values.length < 2) return null
  const max = Math.max(...values, alt ?? 1, 1)
  const w   = 56, h = 24
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - (v / max) * h
    return `${x},${y}`
  }).join(' ')

  return (
    <svg width={w} height={h} style={{ flexShrink:0 }}>
      {alt !== null && (
        <line x1={0} y1={h - (alt / max) * h} x2={w} y2={h - (alt / max) * h}
          stroke='#f59e0b' strokeWidth={1} strokeDasharray='3,2' opacity={0.6} />
      )}
      <polyline points={pts} fill='none' stroke={color} strokeWidth={1.5} strokeLinejoin='round' />
      {values.map((v, i) => {
        const x = (i / (values.length - 1)) * w
        const y = h - (v / max) * h
        const hit = binary ? v === 1 : (alt !== null && v > alt)
        return <circle key={i} cx={x} cy={y} r={2.2} fill={hit ? color : 'var(--sw-muted)'} />
      })}
    </svg>
  )
}

function PredictionCard({ pred, statDef, rank, accentColor, t, onOpen }) {
  const f    = pred.fixture
  const tier = getTier(pred.combinedRate)

  // Which team rows to display
  const teamRows = pred.teamScope
    ? pred.isHome
      ? [{ label:`${f.homeTeam?.name} (Home)`, data: pred.home }]
      : [{ label:`${f.awayTeam?.name} (Away)`, data: pred.away }]
    : [
        { label:`${f.homeTeam?.name} (Home)`, data: pred.home },
        { label:`${f.awayTeam?.name} (Away)`, data: pred.away },
      ]

  const streakText = (pred.homeStreak && pred.awayStreak)
    ? t('stat_streak_both')
    : pred.homeStreak
    ? `${f.homeTeam?.name} ${t('stat_streak')}`
    : pred.awayStreak
    ? `${f.awayTeam?.name} ${t('stat_streak')}`
    : null

  return (
    <button
      type="button"
      onClick={() => onOpen?.(pred)}
      className="stat-prediction-card"
      style={{
      padding: '14px 16px',
      borderRadius: 12,
      background: tier.bg,
      border: `1px solid ${tier.border}`,
      borderLeft: `4px solid ${tier.color}`,
      width: '100%',
      textAlign: 'left',
      cursor: 'pointer',
    }}>
      {/* Header row */}
      <div style={{ display:'flex', alignItems:'flex-start', gap:10, flexWrap:'wrap', marginBottom:10 }}>
        <span style={{ fontSize:11, color:'#4b5563', fontWeight:700, paddingTop:2, minWidth:24 }}>#{rank}</span>
        <div style={{ flex:1, minWidth:140 }}>
          <div style={{ fontSize:11, color:'#4b5563', marginBottom:2 }}>{f.league?.name} - {f.time}</div>
          <div style={{ fontSize:13, fontWeight:800, color:'#f1f5f9' }}>
            {f.homeTeam?.name} <span style={{ color:'var(--sw-muted)', fontWeight:400 }}>vs</span> {f.awayTeam?.name}
          </div>
          {/* Unambiguous prediction label */}
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:5, flexWrap:'wrap' }}>
            <span style={{ fontSize:12, fontWeight:800, color: accentColor, background:`${accentColor}15`, border:`1px solid ${accentColor}30`, borderRadius:6, padding:'2px 9px', lineHeight:1.5 }}>
              {pred.label}
            </span>
            {streakText && (
              <span style={{ fontSize:10, color:'#22c55e', background:'rgba(34,197,94,0.12)', border:'1px solid rgba(34,197,94,0.25)', borderRadius:4, padding:'1px 6px', fontWeight:700 }}>
                Hot streak: {streakText}
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign:'right', flexShrink:0 }}>
          <div style={{ fontSize:26, fontWeight:900, color:tier.color, lineHeight:1, textShadow: tier.glow !== 'none' ? `0 0 16px ${tier.glow}` : 'none' }}>
            {Math.round(pred.combinedRate * 100)}%
          </div>
          <div style={{ fontSize:10, color:tier.color, fontWeight:700, marginTop:2 }}>{tier.label}</div>
        </div>
      </div>

      {/* Team rows */}
      <div style={{ display:'grid', gridTemplateColumns: teamRows.length === 1 ? '1fr' : 'repeat(auto-fit, minmax(160px, 1fr))', gap:8 }}>
        {teamRows.map(({ label, data }) => (
          <div key={label} style={{ display:'flex', flexDirection:'column', gap:4 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:11, color:'#6b7280', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:120 }}>{label}</span>
              <ConfidenceBar rate={data.rate} color={accentColor} />
              <span style={{ fontSize:11, fontWeight:700, color:getTier(data.rate).color, whiteSpace:'nowrap' }}>{data.hits}/{data.total}</span>
            </div>
            {data.values?.length > 1 && (
              <div style={{ display:'flex', justifyContent:'flex-end' }}>
                <MiniSparkline values={data.values} alt={pred.alt} binary={statDef.binary} color={accentColor} />
              </div>
            )}
          </div>
        ))}
      </div>
    </button>
  )
}

// â”€â”€â”€ Filter bar â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function FilterBar({ minRate, setMinRate, activeAlt, setActiveAlt, alts, isBinary, count, t, onAltStep }) {
  return (
    <div className="stat-prediction-filter-bar" style={{ padding:'12px 16px', background:'var(--sw-surface-1)', borderRadius:12, border:'1px solid var(--sw-border)', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
        <span style={{ fontSize:11, color:'#6b7280', fontWeight:600, whiteSpace:'nowrap' }}>{t('pred_min_confidence')}:</span>
        <div style={{ display:'flex', gap:4, flexWrap:'wrap' }}>
          {[0.5,0.6,0.7,0.8,0.9].map(v => {
            const tier = getTier(v)
            return (
              <button key={v} onClick={() => setMinRate(v)}
                style={{ padding:'4px 10px', borderRadius:6, border:'1px solid', borderColor: minRate===v ? tier.color : 'var(--sw-muted)', background: minRate===v ? tier.bg : 'none', color: minRate===v ? tier.color : '#6b7280', fontSize:11, fontWeight:700, cursor:'pointer', transition:'all 0.12s' }}>
                {Math.round(v*100)}%
              </button>
            )
          })}
        </div>
      </div>

      {!isBinary && alts.length > 1 && (
        <>
          <div style={{ width:1, height:20, background:'var(--sw-border)', flexShrink:0 }} />
          <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
            <span style={{ fontSize:11, color:'#6b7280', fontWeight:600, whiteSpace:'nowrap' }}>{t('alt_line')}:</span>
            <div style={{ display:'flex', gap:4, flexWrap:'nowrap', overflowX:'auto', scrollbarWidth:'none' }}>
              <button onClick={() => setActiveAlt(null)}
                style={{ padding:'4px 10px', borderRadius:6, border:'1px solid', borderColor: activeAlt===null ? '#d1d5db' : 'var(--sw-muted)', background: activeAlt===null ? 'rgba(209,213,219,0.12)' : 'none', color: activeAlt===null ? '#d1d5db' : '#6b7280', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                {t('filter_all')}
              </button>
              {alts.map(v => (
                <button key={v} onClick={() => setActiveAlt(v)}
                  style={{ padding:'4px 10px', borderRadius:6, border:'1px solid', borderColor: activeAlt===v ? '#f59e0b' : 'var(--sw-muted)', background: activeAlt===v ? 'rgba(245,158,11,0.12)' : 'none', color: activeAlt===v ? '#f59e0b' : '#6b7280', fontSize:11, fontWeight:700, cursor:'pointer', transition:'all 0.12s' }}>
                  {formatAltValue(v)}
                </button>
              ))}
              <div style={{ display:'flex', alignItems:'center', gap:4, marginLeft:6, flexShrink:0 }}>
                <button onClick={() => onAltStep(-1)} style={{ width:24, height:24, borderRadius:6, border:'1px solid var(--sw-muted)', background:'none', color:'#9ca3af', fontSize:14, fontWeight:800, cursor:'pointer' }}>-</button>
                <button onClick={() => onAltStep(1)} style={{ width:24, height:24, borderRadius:6, border:'1px solid var(--sw-muted)', background:'none', color:'#9ca3af', fontSize:14, fontWeight:800, cursor:'pointer' }}>+</button>
              </div>
            </div>
          </div>
        </>
      )}

      <span style={{ marginLeft:'auto', fontSize:11, color:'#4b5563', fontWeight:600, whiteSpace:'nowrap' }}>
        {count} {t('matches')}
      </span>
    </div>
  )
}

// â”€â”€â”€ Stat summary header â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function StatSummary({ statDef, predictions, fixtures, accentColor, t }) {
  const avgRate = predictions.length ? predictions.reduce((s, p) => s + p.rawRate, 0) / predictions.length : 0
  const topPred = predictions[0]

  return (
    <div className="stat-prediction-summary" style={{ padding:'16px', background:'var(--sw-surface-2)', borderRadius:12, border:'1px solid var(--sw-border)', display:'flex', gap:16, flexWrap:'wrap', alignItems:'flex-start' }}>
      <div className="stat-prediction-summary-head" style={{ display:'flex', alignItems:'center', gap:12, flex:1, minWidth:200 }}>
        <div style={{ width:52, height:52, borderRadius:12, background:`${accentColor}18`, border:`1.5px solid ${accentColor}44`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:26, flexShrink:0 }}>
          {statDef.icon}
        </div>
        <div>
          <div style={{ fontSize:18, fontWeight:900, color:'#f1f5f9', lineHeight:1.2 }}>{statDef.label}</div>
          <div style={{ fontSize:12, color:'#6b7280', marginTop:3 }}>{statDef.description}</div>
        </div>
      </div>
      <div className="stat-prediction-summary-metrics" style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
        {[
          { label: t('stat_fixtures_analysed'), value: fixtures.length },
          { label: t('stat_qualifying_bets'),   value: predictions.length },
          { label: t('stat_avg_hit_rate'),       value: predictions.length ? `${Math.round(avgRate*100)}%` : '-' },
          { label: t('stat_top_confidence'),     value: topPred ? `${Math.round(topPred.combinedRate*100)}%` : '-', color: topPred ? getTier(topPred.combinedRate).color : '#4b5563' },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ textAlign:'center', minWidth:70 }}>
            <div style={{ fontSize:20, fontWeight:900, color: color||'#f1f5f9' }}>{value}</div>
            <div style={{ fontSize:10, color:'#4b5563', fontWeight:600, marginTop:2 }}>{label.toUpperCase()}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// â”€â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function StatPredictionPage({ statKey, fixtures = [], loading, onPredictionClick }) {
  const { t } = useLang()
  const statDef     = getStatDef(statKey)
  const groupDef    = statDef ? STAT_GROUPS[statDef.group] : null
  const accentColor = groupDef?.color ?? '#d1d5db'

  const [minRate,   setMinRate]   = useState(0.6)
  const [activeAlt, setActiveAlt] = useState(null)
  const [customAlt, setCustomAlt] = useState(null)
  const statKeysToRun = useMemo(() => {
    if (statKey === 'firstHalfGoals') return ['firstHalfGoals', 'teamFirstHalfGoals']
    if (statKey === 'secondHalfGoals') return ['secondHalfGoals', 'teamSecondHalfGoals']
    return [statKey]
  }, [statKey])
  const defaultAltForPage = useMemo(() => {
    const primary = getStatDef(statKey)
    if (primary && !primary.binary && primary.defaultAlt !== null && primary.defaultAlt !== undefined) {
      return normalizeHalfAlt(primary.defaultAlt)
    }
    const firstNumeric = statKeysToRun
      .map(key => getStatDef(key))
      .find(def => def && !def.binary && def.defaultAlt !== null && def.defaultAlt !== undefined)
    return firstNumeric ? normalizeHalfAlt(firstNumeric.defaultAlt) : null
  }, [statKey, statKeysToRun])
  const altAnchor = activeAlt ?? customAlt ?? defaultAltForPage ?? statDef?.defaultAlt ?? 0.5

  const altsToRun = useMemo(() => {
    const base = new Set()
    statKeysToRun.forEach(key => {
      const def = getStatDef(key)
      ;(def?.alts ?? [def?.defaultAlt ?? 2.5]).forEach(v => {
        if (v === null) {
          base.add(v)
          return
        }
        base.add(normalizeHalfAlt(v))
      })
    })
    if (customAlt !== null) base.add(normalizeHalfAlt(customAlt))
    if (!statKeysToRun.every(key => getStatDef(key)?.binary)) {
      centeredHalfAltWindow(altAnchor, 5).forEach(v => base.add(v))
    }
    const list = [...base]
      .filter(v => v !== null || statKeysToRun.some(key => getStatDef(key)?.binary))
      .sort((a, b) => Number(a) - Number(b))
    if (!list.length) return [null]
    if (list.every(v => v === null)) return [null]
    const numeric = list.filter(v => v !== null)
    const expandedNumeric = expandHalfAltSteps(numeric)
    if (list.includes(null)) return [null, ...expandedNumeric]
    return expandedNumeric
  }, [statKeysToRun, customAlt, altAnchor])

  useEffect(() => {
    setCustomAlt(null)
    setActiveAlt(defaultAltForPage)
  }, [statKey, defaultAltForPage])

  function handleAltStep(delta) {
    if (statKeysToRun.every(key => getStatDef(key)?.binary)) return
    const current = activeAlt ?? customAlt ?? (altsToRun[0] ?? statDef?.defaultAlt ?? 2.5)
    const next = normalizeHalfAlt(Number(current) + delta)
    setCustomAlt(next)
    setActiveAlt(next)
  }

  const predictions = useMemo(() => {
    return statKeysToRun
      .flatMap(key => runPredictionEngine(fixtures, key, altsToRun, minRate))
      .sort((a, b) => b.combinedRate - a.combinedRate)
  }, [fixtures, statKeysToRun, altsToRun, minRate])

  const filtered = useMemo(
    () => activeAlt === null ? predictions : predictions.filter(p => p.alt === activeAlt),
    [predictions, activeAlt]
  )

  useEffect(() => {
    const fixturesWithHistory = fixtures.filter(f => f.homeHistory?.length || f.awayHistory?.length).length
    if (!fixtures.length || !fixturesWithHistory || predictions.length) return
    console.info(`[predictions] no qualifying predictions for ${statKeysToRun.join(',')} across ${fixturesWithHistory} enriched fixtures`)
  }, [fixtures, predictions, statKeysToRun])

  const visibleAlts = useMemo(() => {
    if (statKeysToRun.every(key => getStatDef(key)?.binary)) return altsToRun
    return centeredHalfAltWindow(altAnchor, 5)
  }, [altsToRun, altAnchor, statKeysToRun])

  const displayPreds = filtered.slice(0, 40)

  if (!statDef) {
    return (
      <div style={{ padding:40, textAlign:'center', color:'#ef4444' }}>
        {t('stat_unknown')}: {statKey}
      </div>
    )
  }

  return (
    <div className="stat-prediction-page" style={{ padding:'16px', display:'flex', flexDirection:'column', gap:14, maxWidth:860, margin:'0 auto', width:'100%', boxSizing:'border-box' }}>

      <StatSummary statDef={statDef} predictions={predictions} fixtures={fixtures} accentColor={accentColor} t={t} />

      <FilterBar
        minRate={minRate} setMinRate={setMinRate}
        activeAlt={activeAlt} setActiveAlt={setActiveAlt}
        alts={visibleAlts} isBinary={statKeysToRun.every(key => getStatDef(key)?.binary)}
        count={displayPreds.length} t={t}
        onAltStep={handleAltStep}
      />

      <div className="stat-prediction-note" style={{ padding:'10px 14px', borderRadius:8, background:'rgba(249,115,22,0.05)', border:'1px solid rgba(249,115,22,0.15)', fontSize:11, color:'#6b7280', lineHeight:1.6 }}>
        {t('stat_algo_note_pre')} <strong style={{ color: accentColor }}>{statDef.label}</strong>{t('stat_algo_note_post')}
      </div>

      {loading && (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <style>{`@keyframes pulse{0%,100%{opacity:0.6}50%{opacity:1}}`}</style>
          {[0,1,2,3].map(i => (
            <div key={i} style={{ height:110, borderRadius:12, background:'var(--sw-surface-1)', border:'1px solid var(--sw-border)', animation:'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      )}

      {!loading && fixtures.length === 0 && (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'#4b5563' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>{'\u{1F4C6}'}</div>
          <div style={{ fontSize:15, fontWeight:600, color:'#6b7280' }}>{t('stat_no_fixtures')}</div>
          <div style={{ fontSize:13, marginTop:6 }}>{t('stat_try_other_day')}</div>
        </div>
      )}

      {!loading && fixtures.length > 0 && displayPreds.length === 0 && (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'#4b5563' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>{'\u{1F50D}'}</div>
          <div style={{ fontSize:15, fontWeight:600, color:'#6b7280' }}>{t('pred_no_results')}</div>
          <div style={{ fontSize:13, marginTop:6 }}>{t('pred_try_lower')}</div>
          <button onClick={() => setMinRate(0.5)}
            style={{ marginTop:16, padding:'8px 20px', borderRadius:8, border:'none', background:'rgba(249,115,22,0.15)', color:'#d1d5db', fontWeight:700, fontSize:13, cursor:'pointer' }}>
            {t('stat_lower_to_50')}
          </button>
        </div>
      )}

      {!loading && displayPreds.length > 0 && (
        <div className="stat-prediction-list" style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {displayPreds.map((pred, idx) => (
            <PredictionCard key={pred.id} pred={pred} statDef={statDef} rank={idx+1} accentColor={accentColor} t={t} onOpen={onPredictionClick} />
          ))}
        </div>
      )}

    </div>
  )
}




