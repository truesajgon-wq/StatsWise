import { extractStatValue, getStatDef } from '../data/statsConfig.js'

function toNum(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value))
}

function firstNumber(...values) {
  for (const value of values) {
    const numeric = toNum(value)
    if (numeric != null) return numeric
  }
  return null
}

function average(values) {
  if (!values.length) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function stdDev(values, mean = average(values)) {
  if (!values.length) return 0
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length
  return Math.sqrt(variance)
}

function normalizeHalfAlt(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0.5
  const rounded = Math.round(n * 2) / 2
  return Number.isInteger(rounded) ? rounded + 0.5 : rounded
}

function isHit(value, alt, binary) {
  if (value == null) return false
  if (binary) return value === 1
  return value > alt
}

function extractOpponentStatValue(match, key, isHome = true) {
  if (!match) return null
  const hg = toNum(match.homeGoals)
  const ag = toNum(match.awayGoals)
  switch (key) {
    case 'matchResult':
      if (hg == null || ag == null) return null
      return isHome ? Number(hg < ag) : Number(ag < hg)
    case 'teamGoals':
      return isHome ? ag : hg
    case 'teamCorners':
      return firstNumber(
        isHome ? match.theirCorners : match.myCorners,
        isHome ? match.awayCorners : match.homeCorners,
      )
    case 'teamCards':
      return firstNumber(
        isHome ? match.theirCards : match.myCards,
        isHome ? match.awayCards : match.homeCards,
      )
    case 'teamShots':
      return firstNumber(
        isHome ? match.theirShotsOnTarget : match.myShotsOnTarget,
        isHome ? match.awayShotsOnTarget : match.homeShotsOnTarget,
      )
    case 'teamFirstHalfGoals':
      return firstNumber(
        isHome ? match.theirFirstHalfGoals : match.myFirstHalfGoals,
      )
    case 'teamSecondHalfGoals': {
      const secondHalf = toNum(match.secondHalfGoals)
      const firstHalfOpp = firstNumber(
        isHome ? match.theirFirstHalfGoals : match.myFirstHalfGoals,
      )
      const oppGoals = isHome ? ag : hg
      if (secondHalf != null && firstHalfOpp != null && oppGoals != null) {
        return Math.max(0, oppGoals - firstHalfOpp)
      }
      return null
    }
    case 'teamFouls':
      return firstNumber(
        isHome ? match.theirFouls : match.myFouls,
        isHome ? match.awayFouls : match.homeFouls,
      )
    default:
      return null
  }
}

function inferHistorySide(match, team) {
  if (!match || !team) return null
  const teamId = Number(team?.id)
  const homeId = Number(match?.homeTeam?.id ?? match?.homeTeamId)
  const awayId = Number(match?.awayTeam?.id ?? match?.awayTeamId)
  if (Number.isFinite(teamId) && teamId > 0) {
    if (teamId === homeId) return true
    if (teamId === awayId) return false
  }
  const teamName = String(team?.name || '').trim().toLowerCase()
  const homeName = String(match?.homeTeam?.name || '').trim().toLowerCase()
  const awayName = String(match?.awayTeam?.name || '').trim().toLowerCase()
  if (teamName && teamName === homeName) return true
  if (teamName && teamName === awayName) return false
  return null
}

function collectHistoryValues(history, statKey, isHome, perspective = 'for', team = null) {
  const values = []
  for (const match of history || []) {
    let resolvedIsHome = isHome
    if (team) {
      const inferred = inferHistorySide(match, team)
      if (inferred == null) continue
      resolvedIsHome = inferred
    }
    const value = perspective === 'against'
      ? extractOpponentStatValue(match, statKey, resolvedIsHome)
      : extractStatValue(match, statKey, resolvedIsHome, { raw: true })
    if (value != null) values.push(Number(value))
  }
  return values
}

function summarizeTrend(values, alt, binary) {
  const recent = values.slice(0, 15)
  const sample = recent.length
  if (!sample) {
    return {
      values: [],
      sample: 0,
      hits: 0,
      total: 0,
      rate: 0,
      l5: null,
      l10: null,
      l15: null,
      rawRate: 0,
      weightedRate: 0,
      smoothedRate: 0,
      streak: false,
      coldRun: false,
      averageValue: null,
      volatility: 1,
      consistency: 0.35,
      sampleStrength: 0,
    }
  }

  const rateFor = (slice) => {
    if (!slice.length) return null
    const hits = slice.filter(value => isHit(value, alt, binary)).length
    return hits / slice.length
  }

  const l5 = rateFor(recent.slice(0, 5))
  const l10 = rateFor(recent.slice(0, 10))
  const l15 = rateFor(recent.slice(0, 15))
  const rawHits = recent.filter(value => isHit(value, alt, binary)).length
  const rawRate = rawHits / sample
  const weights = recent.map((_, index) => Math.max(0.4, 1 - index * 0.055))
  const weightedHits = recent.reduce((sum, value, index) => sum + (isHit(value, alt, binary) ? weights[index] : 0), 0)
  const weightedTotal = weights.reduce((sum, value) => sum + value, 0)
  const weightedRate = weightedTotal ? weightedHits / weightedTotal : rawRate
  const prior = binary ? 0.5 : clamp01(weightedRate)
  const smoothedRate = ((weightedRate * sample) + (prior * 4)) / (sample + 4)
  const averageValue = average(recent)
  const spread = stdDev(recent, averageValue)
  const referenceScale = Math.max(1, Math.abs(averageValue), Math.abs(alt ?? 1), 1.5)
  const volatility = clamp01(spread / (referenceScale + 1.5))
  const consistency = clamp01(1 - (volatility * 0.85))
  const sampleStrength = clamp01(sample / 10)
  const streak = recent.slice(0, Math.min(3, sample)).length >= 3 && recent.slice(0, 3).every(value => isHit(value, alt, binary))
  const coldRun = recent.slice(0, Math.min(3, sample)).length >= 3 && recent.slice(0, 3).every(value => !isHit(value, alt, binary))

  return {
    values: recent,
    sample,
    hits: rawHits,
    total: sample,
    rate: smoothedRate,
    l5,
    l10,
    l15,
    rawRate,
    weightedRate,
    smoothedRate,
    streak,
    coldRun,
    averageValue,
    volatility,
    consistency,
    sampleStrength,
  }
}

function combineEvidence(components) {
  let weighted = 0
  let totalWeight = 0
  for (const component of components) {
    if (component?.value == null || component?.weight == null) continue
    weighted += component.value * component.weight
    totalWeight += component.weight
  }
  return totalWeight ? weighted / totalWeight : null
}

export function evaluateFixturePrediction(fixture, statKey, alt, options = {}) {
  const def = getStatDef(statKey)
  if (!def) return []
  const normalizedAlt = def.binary ? null : normalizeHalfAlt(alt)
  const sides = def.scope === 'team'
    ? [options?.isHome].filter(v => v != null)
    : [null]
  const targetSides = sides.length ? sides : (def.scope === 'team' ? [true, false] : [null])

  return targetSides.map((isHome) => {
    const team = isHome == null ? null : (isHome ? fixture?.homeTeam : fixture?.awayTeam)
    const opponent = isHome == null ? null : (isHome ? fixture?.awayTeam : fixture?.homeTeam)

    const ownHistory = isHome == null ? null : (isHome ? fixture?.homeHistory : fixture?.awayHistory)
    const opponentHistory = isHome == null ? null : (isHome ? fixture?.awayHistory : fixture?.homeHistory)

    const form = summarizeTrend(
      def.scope === 'team'
        ? collectHistoryValues(ownHistory, statKey, Boolean(isHome), 'for')
        : [
            ...collectHistoryValues(fixture?.homeHistory, statKey, true, 'for'),
            ...collectHistoryValues(fixture?.awayHistory, statKey, false, 'for'),
          ].slice(0, 15),
      normalizedAlt,
      def.binary,
    )

    const allowance = def.scope === 'team'
      ? summarizeTrend(
          collectHistoryValues(opponentHistory, statKey, !Boolean(isHome), 'against'),
          normalizedAlt,
          def.binary,
        )
      : null

    const h2hValues = def.scope === 'team'
      ? collectHistoryValues(fixture?.h2h, statKey, Boolean(isHome), 'for', team)
      : (fixture?.h2h || [])
        .map(match => extractStatValue(match, statKey, true, { raw: true }))
        .filter(value => value != null)
        .map(Number)
    const h2h = summarizeTrend(h2hValues, normalizedAlt, def.binary)

    const formComponent = form.smoothedRate
    const opponentComponent = allowance?.sample ? allowance.smoothedRate : null
    const h2hComponent = h2h.sample ? h2h.smoothedRate : null
    const recencyComponent = combineEvidence([
      { value: form.l5, weight: 0.55 },
      { value: form.l10, weight: 0.30 },
      { value: form.l15, weight: 0.15 },
    ]) ?? form.smoothedRate

    const baseRate = combineEvidence([
      { value: formComponent, weight: def.scope === 'team' ? 0.50 : 0.60 },
      { value: opponentComponent, weight: def.scope === 'team' ? 0.22 : 0 },
      { value: h2hComponent, weight: 0.14 },
      { value: recencyComponent, weight: 0.14 },
    ]) ?? form.smoothedRate

    const confidenceLift = (form.consistency - 0.5) * 0.10
    const sampleLift = ((form.sampleStrength - 0.5) * 0.08) + ((allowance?.sampleStrength ?? 0.5) - 0.5) * 0.03
    const streakLift = (form.streak ? 0.035 : 0) + (allowance?.streak ? 0.02 : 0) - (form.coldRun ? 0.03 : 0)
    const h2hLift = h2h.sample >= 3 ? (h2h.consistency - 0.5) * 0.04 : 0
    const combinedRate = clamp01((baseRate ?? 0) + confidenceLift + sampleLift + streakLift + h2hLift)

    return {
      fixture,
      statKey,
      alt: normalizedAlt,
      teamScope: def.scope === 'team',
      isHome,
      team,
      opponent,
      label: null,
      home: def.scope === 'team'
        ? (isHome ? form : allowance)
        : summarizeTrend(collectHistoryValues(fixture?.homeHistory, statKey, true, 'for'), normalizedAlt, def.binary),
      away: def.scope === 'team'
        ? (isHome ? allowance : form)
        : summarizeTrend(collectHistoryValues(fixture?.awayHistory, statKey, false, 'for'), normalizedAlt, def.binary),
      activeTeamData: form,
      opponentData: allowance,
      h2hData: h2h,
      rawRate: baseRate ?? 0,
      combinedRate,
      reasoning: {
        formRate: formComponent,
        opponentAllowanceRate: opponentComponent,
        h2hRate: h2hComponent,
        recencyRate: recencyComponent,
        sample: form.sample,
        opponentSample: allowance?.sample ?? 0,
        h2hSample: h2h.sample,
        consistency: form.consistency,
      },
    }
  }).filter(result => {
    if (result.teamScope) return result.activeTeamData.sample >= 5
    return (result.home.sample + result.away.sample) >= 10
  })
}

export function buildModelBreakdown(result) {
  return {
    l5: result?.activeTeamData?.l5 ?? null,
    l10: result?.activeTeamData?.l10 ?? null,
    l15: result?.activeTeamData?.l15 ?? null,
    h2h: result?.h2hData?.smoothedRate ?? null,
    opponent: result?.opponentData?.smoothedRate ?? null,
    consistency: result?.activeTeamData?.consistency ?? null,
    sample: result?.activeTeamData?.sample ?? 0,
  }
}
