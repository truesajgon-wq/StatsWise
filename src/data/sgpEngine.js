// Same Game Parlay Engine
// Builds 2–5 leg parlays from one fixture, using every available stat dimension.
//
// Correlation groups — one leg per group maximum:
//   goals      → goals, btts, teamGoals, matchResult, all halves stats
//   corners    → corners, teamCorners
//   cards      → cards, teamCards              ← separate from fouls
//   fouls      → fouls, teamFouls              ← separate from cards
//   shots      → shots, teamShots
//
// BTTS safety: btts shares the `goals` group with teamGoals and goals, so a parlay
// will never combine BTTS with "home team to score" or "over 1.5 total goals".
// Those outcomes are either implied by or semantically redundant with BTTS.
// An additional explicit post-selection guard strips any such implied legs.

import { STATS_ORDER, extractStatValue, getHistorySummarySnapshot } from './statsConfig.js'
import { evaluateFixturePrediction, buildModelBreakdown } from '../utils/predictionModel.js'

// Minimum actual data points required for a leg to qualify
const MIN_SAMPLE = 2

// Minimum honest (last-N games) hit rate to qualify as a leg
const LEG_THRESHOLD = 0.50

// Minimum combined parlay probability to surface a result
const COMBINED_MIN = 0.18

// Rising thresholds for each leg position (0-indexed) — top 2 always included
const LEG_POSITION_THRESHOLDS = [0, 0, 0.58, 0.63, 0.68]

// One corr group per stat — prevents redundant legs in the same parlay
function getCorrGroup(statKey) {
  if (['goals', 'btts', 'teamGoals', 'firstHalfGoals', 'secondHalfGoals',
    'goalsInBothHalves', 'teamFirstHalfGoals', 'teamSecondHalfGoals',
    'matchResult'].includes(statKey)) return 'goals'
  if (['corners', 'teamCorners'].includes(statKey)) return 'corners'
  if (['cards', 'teamCards'].includes(statKey)) return 'cards'
  if (['fouls', 'teamFouls'].includes(statKey)) return 'fouls'
  if (['shots', 'teamShots'].includes(statKey)) return 'shots'
  return statKey
}

function clamp01(v) { return Math.max(0, Math.min(1, v)) }

// Returns the best honest hit rate from actual recent match history.
// Priority: l10 → l15 → smoothedRate. Returns null if data is insufficient.
function getHonestRate(candidate) {
  if (candidate.teamScope) {
    const data = candidate.activeTeamData
    if (!data || (data.sample ?? 0) < MIN_SAMPLE) return null
    return data.l10 ?? data.l15 ?? data.smoothedRate ?? null
  }
  // Match-scoped: average home and away honest rates
  const h = candidate.home
  const a = candidate.away
  if (!h && !a) return null
  const hs = h?.sample ?? 0
  const as_ = a?.sample ?? 0
  if (hs + as_ < MIN_SAMPLE) return null

  const hr = hs >= MIN_SAMPLE ? (h?.l10 ?? h?.l15 ?? h?.smoothedRate ?? null) : null
  const ar = as_ >= MIN_SAMPLE ? (a?.l10 ?? a?.l15 ?? a?.smoothedRate ?? null) : null

  if (hr == null && ar == null) {
    // Both sides have some data but below individual MIN_SAMPLE; blend smoothed rates
    const hSmooth = h?.smoothedRate
    const aSmooth = a?.smoothedRate
    if (hSmooth == null && aSmooth == null) return null
    if (hSmooth == null) return aSmooth
    if (aSmooth == null) return hSmooth
    return (hSmooth * hs + aSmooth * as_) / (hs + as_)
  }
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
  if (style === 'high-tempo' && ['goals', 'btts', 'shots', 'teamShots', 'firstHalfGoals', 'goalsInBothHalves', 'teamGoals', 'teamFirstHalfGoals'].includes(statKey)) return 0.03
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
  // For each stat × alt × side, compute honest rate, keep only ≥ LEG_THRESHOLD.
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

  // ---- Step 2: per correlation group, keep the single best candidate ----
  const bestPerGroup = {}
  for (const item of survivors) {
    const corrGroup = getCorrGroup(item.statKey)
    if (!bestPerGroup[corrGroup] || item.adjustedScore > bestPerGroup[corrGroup].adjustedScore) {
      bestPerGroup[corrGroup] = { ...item, corrGroup }
    }
  }

  // ---- Step 3: greedy leg selection — up to 5 legs, rising threshold per slot ----
  const sorted = Object.values(bestPerGroup).sort((a, b) => b.adjustedScore - a.adjustedScore)
  if (sorted.length < 2) return null

  const legs = []
  for (let i = 0; i < sorted.length; i++) {
    const posIdx = legs.length
    if (posIdx >= 5) break
    const minScore = Math.max(LEG_THRESHOLD, LEG_POSITION_THRESHOLDS[posIdx] ?? 0.68)
    if (sorted[i].adjustedScore >= minScore) {
      legs.push(sorted[i])
    }
  }

  if (legs.length < 2) return null

  // ---- Step 4: BTTS explicit exclusion ----
  // Belt-and-suspenders: the `goals` corr group already prevents this, but we strip
  // any leg that is semantically implied by BTTS being in the parlay.
  // BTTS means both teams scored ≥ 1, so:
  //   • teamGoals over 0.5 (either team) — implied
  //   • goals over 1.5 (total) — implied (both scored = minimum 2 goals)
  const hasBTTS = legs.some(l => l.statKey === 'btts')
  if (hasBTTS) {
    const filtered = legs.filter(l => {
      if (l.statKey === 'teamGoals' && (l.alt == null || Number(l.alt) <= 0.5)) return false
      if (l.statKey === 'goals' && (l.alt == null || Number(l.alt) <= 1.5)) return false
      return true
    })
    if (filtered.length >= 2) {
      legs.length = 0
      legs.push(...filtered)
    }
  }

  if (legs.length < 2) return null

  // ---- Step 5: combined probability with light correlation discounts ----
  let combinedProbability = 1
  for (let i = 0; i < legs.length; i++) {
    // Slight discount on 3rd+ legs to account for residual cross-stat correlation
    const discount = i <= 1 ? 1.0 : i === 2 ? 0.97 : i === 3 ? 0.95 : 0.93
    combinedProbability *= legs[i].honestRate * discount
  }
  combinedProbability = clamp01(combinedProbability)

  if (combinedProbability < COMBINED_MIN) return null

  // ---- Step 6: strength label ----
  let strength = 'weak'
  if (combinedProbability >= 0.50) strength = 'strong'
  else if (combinedProbability >= 0.35) strength = 'moderate'

  // ---- Step 7: build leg descriptors ----
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
  // Ranked highest combined probability first
  results.sort((a, b) => b.combinedProbability - a.combinedProbability)
  return results
}
