import { useEffect, useMemo, useState } from 'react'
import MatchPropAnalysis from './MatchPropAnalysis'
import { MATCH_PROP_STAT_OPTIONS } from '../data/matchPropStats'
import useMatchPropAnalysisData from '../hooks/useMatchPropAnalysisData'

const TIP_STAT_TO_MATCH_PROP = {
  goals: 'total_match_goals',
  teamGoals: 'goals_for',
  btts: 'both_teams_to_score',
  corners: 'total_match_corners',
  cards: 'total_match_cards',
  shots: 'total_match_shots_on_target',
  fouls: 'total_match_fouls',
  firstHalfGoals: 'first_half_goals',
  goalsInBothHalves: 'goal_in_both_halves',
}

function resolveInitialStatKey(statKey) {
  if (!statKey) return null
  if (MATCH_PROP_STAT_OPTIONS.some(s => s.key === statKey)) return statKey
  const mapped = TIP_STAT_TO_MATCH_PROP[statKey]
  if (mapped && MATCH_PROP_STAT_OPTIONS.some(s => s.key === mapped)) return mapped
  return null
}

function normalizeAlt(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0.5
  const rounded = Math.round(n * 2) / 2
  const nonInteger = Number.isInteger(rounded) ? rounded + 0.5 : rounded
  return Math.max(0.5, nonInteger)
}

function median(values = []) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 0) return (sorted[mid - 1] + sorted[mid]) / 2
  return sorted[mid]
}

function average(values = []) {
  if (!values.length) return 0
  return values.reduce((s, n) => s + n, 0) / values.length
}

function variance(values = [], avg) {
  if (!values.length) return 0
  const m = Number.isFinite(avg) ? avg : average(values)
  return values.reduce((s, n) => s + Math.pow(n - m, 2), 0) / values.length
}

function invertResult(result) {
  if (result === 'W') return 'L'
  if (result === 'L') return 'W'
  return result || 'D'
}

function flipPerspective(match, opponentTeam) {
  const m = { ...(match || {}) }
  const swapPairs = [
    ['myGoals', 'theirGoals'],
    ['myFirstHalfGoals', 'theirFirstHalfGoals'],
    ['myCorners', 'theirCorners'],
    ['myCards', 'theirCards'],
    ['myShotsTotal', 'theirShotsTotal'],
    ['myShotsOnTarget', 'theirShotsOnTarget'],
    ['myOffsides', 'theirOffsides'],
    ['myFouls', 'theirFouls'],
  ]

  swapPairs.forEach(([a, b]) => {
    const av = m[a]
    m[a] = m[b]
    m[b] = av
  })

  m.isHome = !Boolean(match?.isHome)
  m.result = invertResult(match?.result)
  m.opponent = opponentTeam?.name || match?.opponent || 'Opponent'
  m.opponentId = Number(opponentTeam?.id || 0) || match?.opponentId
  if (opponentTeam?.logo) m.opponentLogo = opponentTeam.logo
  return m
}

export default function MatchDetailsSwimlane({
  fixture,
  homeHistory = [],
  awayHistory = [],
  h2h = [],
  initialStatKey,
  initialAlt,
}) {
  const [range, setRange] = useState('L10')
  const [venueFilter, setVenueFilter] = useState('all')
  const resolvedInitialStatKey = resolveInitialStatKey(initialStatKey)
  const [statKey, setStatKey] = useState(
    resolvedInitialStatKey || MATCH_PROP_STAT_OPTIONS[0].key
  )
  const [userAdjustedAltByStat, setUserAdjustedAltByStat] = useState(() => {
    if (resolvedInitialStatKey && initialAlt != null && Number.isFinite(Number(initialAlt))) {
      return { [resolvedInitialStatKey]: true }
    }
    return {}
  })

  useEffect(() => {
    if (!resolvedInitialStatKey) return
    setStatKey(resolvedInitialStatKey)
  }, [resolvedInitialStatKey])

  const filteredHomeHistory = useMemo(() => {
    if (venueFilter === 'venue') return homeHistory.filter(match => match?.isHome)
    return homeHistory
  }, [homeHistory, venueFilter])

  const filteredAwayHistory = useMemo(() => {
    if (venueFilter === 'venue') return awayHistory.filter(match => !match?.isHome)
    return awayHistory
  }, [awayHistory, venueFilter])

  const homeTeamId = Number(fixture?.homeTeam?.id || fixture?.homeTeamId || 0)
  const awayTeamId = Number(fixture?.awayTeam?.id || fixture?.awayTeamId || 0)

  const homeH2H = useMemo(
    () => (h2h?.length ? h2h : filteredHomeHistory.filter(m => Number(m?.opponentId) === awayTeamId)).slice(0, 15),
    [h2h, filteredHomeHistory, awayTeamId]
  )
  const awayH2H = useMemo(
    () => (
      h2h?.length
        ? h2h.map(m => flipPerspective(m, fixture?.homeTeam))
        : filteredAwayHistory.filter(m => Number(m?.opponentId) === homeTeamId)
    ).slice(0, 15),
    [h2h, filteredAwayHistory, homeTeamId, fixture?.homeTeam]
  )

  const { left, right, maxScale, statDef } = useMatchPropAnalysisData({
    leftHistory: filteredHomeHistory,
    rightHistory: filteredAwayHistory,
    leftH2H: homeH2H,
    rightH2H: awayH2H,
    statKey,
    range,
  })

  const [altByStat, setAltByStat] = useState(() => {
    if (resolvedInitialStatKey && initialAlt != null && Number.isFinite(Number(initialAlt))) {
      return { [resolvedInitialStatKey]: normalizeAlt(Number(initialAlt)) }
    }
    return {}
  })
  const computedAlt = useMemo(() => {
    if (statDef?.isBoolean) return 0.5
    const all = [...left, ...right].map(r => Number(r.value || 0)).filter(n => Number.isFinite(n))
    if (!all.length) return 0.5
    const med = median(all)
    const avg = average(all)
    const vari = variance(all, avg)
    const highVariance = vari > Math.max(1, avg * 0.75)
    return normalizeAlt(highVariance ? avg : med)
  }, [left, right, statDef])
  const defaultAlt = useMemo(() => {
    if (statDef?.isBoolean || statDef?.isOutcome) return 0.5
    const configured = Number(statDef?.defaultAlt)
    if (Number.isFinite(configured)) return normalizeAlt(configured)
    return computedAlt
  }, [statDef, computedAlt])
  const currentAlt = normalizeAlt(altByStat[statKey] ?? defaultAlt)

  useEffect(() => {
    if (userAdjustedAltByStat[statKey]) return
    setAltByStat(prev => ({ ...prev, [statKey]: defaultAlt }))
  }, [defaultAlt, statKey, userAdjustedAltByStat])

  const hitRate = useMemo(() => {
    const all = [...left, ...right]
    if (!all.length) return 0
    const hits = all.filter(r => Number(r.value || 0) > currentAlt).length
    return Math.round((hits / all.length) * 100)
  }, [left, right, currentAlt])

  const decorate = (rows, teamName) => rows.map(r => {
    const fixtureName = r?.isHome ? `${teamName} vs ${r.opponent}` : `${r.opponent} vs ${teamName}`
    const isOver = Number(r.value) > currentAlt
    return {
      ...r,
      fixtureName,
      isOver,
    }
  })
  const leftRows = decorate(left, fixture?.homeTeam?.name || 'Home')
  const rightRows = decorate(right, fixture?.awayTeam?.name || 'Away')

  if (!filteredHomeHistory?.length && !filteredAwayHistory?.length) {
    return (
      <div style={{ padding: '24px 16px', color: '#7284aa', textAlign: 'center' }}>
        No historical fixtures available for this filter yet.
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '10px 12px 0', flexWrap: 'wrap' }}>
        {[
          { key: 'all', label: 'All' },
          { key: 'venue', label: 'Home / Away' },
        ].map(option => (
          <button
            key={option.key}
            type="button"
            onClick={() => setVenueFilter(option.key)}
            style={{
              minHeight: 34,
              padding: '0 12px',
              borderRadius: 999,
              border: `1px solid ${venueFilter === option.key ? 'rgba(249,115,22,0.45)' : 'rgba(255,255,255,0.08)'}`,
              background: venueFilter === option.key ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.02)',
              color: venueFilter === option.key ? '#ffb36b' : '#94a3b8',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <MatchPropAnalysis
        title="Match Prop Analysis"
        statOptions={MATCH_PROP_STAT_OPTIONS}
        statKey={statKey}
        onStatChange={(key) => setStatKey(key)}
        range={range}
        onRangeChange={(next) => {
          setRange(next)
        }}
        altLine={currentAlt}
        onAltChange={(next) => {
          setAltByStat(prev => ({ ...prev, [statKey]: normalizeAlt(next) }))
          setUserAdjustedAltByStat(prev => ({ ...prev, [statKey]: true }))
        }}
        hitRate={hitRate}
        leftTeam={fixture?.homeTeam}
        rightTeam={fixture?.awayTeam}
        leftTitle={`${fixture?.homeTeam?.name || 'Home'} Prop Analysis`}
        rightTitle={`${fixture?.awayTeam?.name || 'Away'} Prop Analysis`}
        leftDataset={leftRows}
        rightDataset={rightRows}
        maxScale={Math.max(maxScale, currentAlt + 1)}
        upcomingLabel={fixture?.date ? new Date(fixture.date).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }) : 'Upcoming'}
        mobileControlsMode="inline"
      />
    </div>
  )
}
