// Same Game Parlay Engine
// Builds the highest-confidence, statistically justified 2–4 leg parlay
// from a single fixture. Correlated stats (same group) are never combined.
//
// Qualification and displayed probability use the ACTUAL last-10-games hit rate
// (l10 → l15 → smoothedRate), NOT the blended model prediction.
//
// Correlation groups — one leg per group maximum:
//   goals      → ALL goal-related stats including matchResult
//                (teamGoals, goals, btts, firstHalfGoals, secondHalfGoals,
//                 goalsInBothHalves, teamFirstHalfGoals, teamSecondHalfGoals, matchResult)
//   corners    → corners, teamCorners
//   discipline → cards, fouls, teamCards, teamFouls
//   shots      → shots, teamShots
//
// Every goal-related stat — including home/away team goals and match result —
// shares ONE group. This ensures a parlay never has two legs that are
// variations of the same event (e.g. "home scores" + "away scores" + "over 1.5"
// is essentially BTTS written three ways). A valid SGP must combine genuinely
// different statistical dimensions: e.g. goals + corners + cards.

import { STATS_ORDER, extractStatValue, getHistorySummarySnapshot } from './statsConfig.js'
import { evaluateFixturePrediction, buildModelBreakdown } from '../utils/predictionModel.js'

// Minimum actual data points required for a leg to qualify
const MIN_SAMPLE = 3

// Minimum individual leg hit rate (last-10-games) to qualify
const LEG_THRESHOLD = 0.55

// Returns the correlation group key for a candidate.
// All goal/result stats share one group regardless of side.
function getCorrGroup(statKey) {
  if (['goals', 'btts', 'teamGoals', 'firstHalfGoals', 'secondHalfGoals',
       'goalsInBothHalves', 'teamFirstHalfGoals', 'teamSecondHalfGoals',
       'matchResult'].includes(statKey)) return 'goals'
  if (['corners', 'teamCorners'].includes(statKey)) return 'corners'
  if (['cards', 'fouls', 'teamCards', 'teamFouls'].includes(statKey)) return 'discipline'
  if (['shots', 'teamShots'].includes(statKey)) return 'shots'
  return statKey
}

function clamp01(v) { return Math.max(0, Math.min(1, v)) }

// Extract the honest last-N hit rate from a candidate.
// Prefers l10, falls back to l15, then smoothedRate.
// Returns null when there is insufficient actual data.
function getHonestRate(candidate) {
  if (candidate.teamScope) {
    const data = candidate.activeTeamData
    if (!data || (data.sample ?? 0) < MIN_SAMPLE) return null
    return data.l10 ?? data.l15 ?? data.smoothedRate ?? null
  }
  // Match-scoped: average home and away
  const h = candidate.home
  const a = candidate.away
  if (!h && !a) return null
  const hs = h?.sample ?? 0
  const as_ = a?.sample ?? 0
  if (hs + as_ < MIN_SAMPLE * 2) return null
  const hr = h?.l10 ?? h?.l15 ?? h?.smoothedRate ?? null
  const ar = a?.l10 ?? a?.l15 ?? a?.smoothedRate ?? null
  if (hr == null && ar == null) return null
  if (hr == null) return ar
  if (ar == null) return hr
  return (hr + ar) / 2
}

function styleTag(homeHistory, awayHistory) {
  const merged = [...(homeHistory || []), ...(awayHistory || [])]
  if (!merged.length) return 'balanced'
  const avgGoals = merged.reduce((s, m) => s + extractStatValue(m, 'goals', true), 0) / merged.length
  const cornersValues = merged.map(m => extractStatValue(m, 'corners', true, { raw: true })).filter(v => v != null)
  const cardsValues = merged.map(m => extractStatValue(m, 'cards', true, { raw: true })).filter(v => v != null)
  const foulsValues = merged.map(m => extractStatValue(m, 'fouls', true, { raw: true })).filter(v => v != null)
  const avgCorners = cornersValues.length ? cornersValues.reduce((s, v) => s + v, 0) / cornersValues.length : null
  const avgCards = cardsValues.length ? cardsValues.reduce((s, v) => s + v, 0) / cardsValues.length : null
  const avgFouls = foulsValues.length ? foulsValues.reduce((s, v) => s + v, 0) / foulsValues.length : null
  const homeCornerRate = getHistorySummarySnapshot(homeHistory, 'corners', 9.5, true)?.rate ?? null
  const awayCornerRate = getHistorySummarySnapshot(awayHistory, 'corners', 9.5, false)?.rate ?? null
  const homeCardRate = getHistorySummarySnapshot(homeHistory, 'cards', 3.5, true)?.rate ?? null
  const awayCardRate = getHistorySummarySnapshot(awayHistory, 'cards', 3.5, false)?.rate ?? null
  if ((avgCards != null && avgCards >= 4.8) || (avgFouls != null && avgFouls >= 24) || homeCardRate >= 0.6 || awayCardRate >= 0.6) return 'physical'
  if ((avgCorners != null && avgCorners >= 10) || homeCornerRate >= 0.6 || awayCornerRate >= 0.6) return 'wide-play'
  if (avgGoals >= 2.8) return 'high-tempo'
  return 'balanced'
}

function styleBoostFor(style, statKey) {
  if (style === 'high-tempo' && ['goals', 'btts', 'shots', 'firstHalfGoals', 'goalsInBothHalves', 'teamGoals', 'teamFirstHalfGoals'].includes(statKey)) return 0.03
  if (style === 'physical' && ['cards', 'fouls', 'teamCards', 'teamFouls'].includes(statKey)) return 0.03
  if (style === 'wide-play' && ['corners', 'teamCorners'].includes(statKey)) return 0.03
  return 0
}

function formatThreshold(def, alt) {
  if (def.binary) return 'YES'
  return `Over ${alt}`
}

function rawHitStats(candidate) {
  if (candidate.teamScope) {
    const d = candidate.activeTeamData
    if (!d) return null
    const total = d.sample ?? 0
    const hits = d.hits ?? Math.round((d.rawRate ?? 0) * total)
    return { hits, total }
  }
  const h = candidate.home
  const a = candidate.away
  const total = (h?.sample ?? 0) + (a?.sample ?? 0)
  const hits = (h?.hits ?? 0) + (a?.hits ?? 0)
  return { hits, total }
}

function buildSGP(fixture) {
  if (!fixture.homeHistory?.length || !fixture.awayHistory?.length) return null

  const tag = styleTag(fixture.homeHistory, fixture.awayHistory)

  // ---- Step 1: collect qualifying candidates ----
  // For each stat × alt × side: compute honest rate, keep only ≥ LEG_THRESHOLD.
  // Per (statKey + side), keep only the alt with the highest honest rate.
  const bestPerSide = {}

  for (const statDef of STATS_ORDER) {
    const { key: statKey, alts } = statDef
    for (const alt of alts) {
      const candidates = evaluateFixturePrediction(fixture, statKey, alt)
      for (const candidate of candidates) {
        const honestRate = getHonestRate(candidate)
        if (honestRate == null || honestRate < LEG_THRESHOLD) continue
        const boost = styleBoostFor(tag, statKey)
        const adjustedScore = clamp01(honestRate + boost)
        const sideKey = `${statKey}:${candidate.isHome ?? 'match'}`
        if (!bestPerSide[sideKey] || adjustedScore > bestPerSide[sideKey].adjustedScore) {
          bestPerSide[sideKey] = { candidate, statKey, alt: candidate.alt, adjustedScore, honestRate, statDef }
        }
      }
    }
  }

  const survivors = Object.values(bestPerSide)
  if (survivors.length < 2) return null

  // ---- Step 2: per correlation group, keep best candidate ----
  const bestPerGroup = {}
  for (const item of survivors) {
    const corrGroup = getCorrGroup(item.statKey)
    if (!bestPerGroup[corrGroup] || item.adjustedScore > bestPerGroup[corrGroup].adjustedScore) {
      bestPerGroup[corrGroup] = { ...item, corrGroup }
    }
  }

  // ---- Step 3: greedy leg selection ----
  const sorted = Object.values(bestPerGroup).sort((a, b) => b.adjustedScore - a.adjustedScore)
  if (sorted.length < 2) return null

  const legs = []
  for (let i = 0; i < sorted.length; i++) {
    const item = sorted[i]
    if (i === 0 || i === 1) {
      legs.push(item)
    } else if (i === 2 && item.adjustedScore >= 0.62) {
      legs.push(item)
    } else if (i === 3 && item.adjustedScore >= 0.68) {
      legs.push(item)
    }
    if (legs.length >= 4) break
  }

  if (legs.length < 2) return null

  // ---- Step 4: combined probability using honest rates ----
  let combinedProbability = 1
  for (let i = 0; i < legs.length; i++) {
    const discount = i <= 1 ? 1.0 : i === 2 ? 0.97 : 0.95
    combinedProbability *= legs[i].honestRate * discount
  }
  combinedProbability = clamp01(combinedProbability)

  // ---- Step 5: strength label (informational only — all parlays are shown) ----
  let strength = 'weak'
  if (combinedProbability >= 0.50) strength = 'strong'
  else if (combinedProbability >= 0.35) strength = 'moderate'

  // ---- Step 6: build leg descriptors ----
  const builtLegs = legs.map(item => {
    const { candidate, statKey, statDef, corrGroup, honestRate } = item
    const alt = candidate.alt
    const isHome = candidate.isHome
    const teamScope = candidate.teamScope
    const raw = rawHitStats(candidate)

    let teamName = null
    if (teamScope && isHome != null) {
      teamName = isHome ? fixture.homeTeam?.name : fixture.awayTeam?.name
    }

    return {
      statKey,
      alt,
      isHome,
      teamScope,
      teamName,
      label: statDef.shortLabel,
      threshold: formatThreshold(statDef, alt),
      probability: honestRate,
      breakdown: buildModelBreakdown(candidate),
      rawHits: raw?.hits ?? null,
      rawTotal: raw?.total ?? null,
      statGroup: corrGroup,
    }
  })

  return {
    fixture,
    legs: builtLegs,
    combinedProbability,
    legCount: builtLegs.length,
    strength,
    styleTag: tag,
  }
}

export function analyzeSGP(fixtures) {
  const results = []
  for (const fixture of fixtures || []) {
    if (!fixture.homeHistory?.length || !fixture.awayHistory?.length) continue
    const sgp = buildSGP(fixture)
    if (sgp) results.push(sgp)
  }
  results.sort((a, b) => b.combinedProbability - a.combinedProbability)
  return results
}
