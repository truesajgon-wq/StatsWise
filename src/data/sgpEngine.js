// Same Game Parlay Engine v2
// Builds 2–5 leg parlays using the full prediction model (opponent-aware, H2H,
// recency-weighted) blended with raw historical hit rates for grounded scoring.
//
// Correlation groups — one leg per group maximum:
//   goals   → goals, btts, teamGoals, matchResult, all halves stats
//   corners → corners, teamCorners
//   cards   → cards, teamCards
//   fouls   → fouls, teamFouls
//   shots   → shots, teamShots

import { STATS_ORDER, extractStatValue, getHistorySummarySnapshot } from './statsConfig.js'
import { evaluateFixturePrediction, buildModelBreakdown } from '../utils/predictionModel.js'

// ─── Tuning constants ──────────────────────────────────────────────────────────

const MIN_SAMPLE      = 3     // Minimum data points per leg
const LEG_THRESHOLD   = 0.53  // Minimum blended leg score to qualify
const HONEST_FLOOR    = 0.40  // Absolute minimum raw hit rate (sanity check)
const COMBINED_MIN    = 0.12  // Minimum combined parlay probability to surface
const MAX_LEGS        = 5

// Scoring blend weights: model (opponent/H2H/recency aware) vs raw history
const MODEL_WEIGHT    = 0.62
const HONEST_WEIGHT   = 0.38

// Rising per-position thresholds (0-indexed). Top 2 always included.
const LEG_POSITION_THRESHOLDS = [0, 0, 0.56, 0.60, 0.65]

// Residual cross-stat correlation discounts on 3rd+ legs
const CORRELATION_DISCOUNTS = [1.0, 1.0, 0.97, 0.95, 0.93]

// Baseline combined probability per leg count (for value rating)
const BASELINE_COMBINED = { 2: 0.28, 3: 0.15, 4: 0.08, 5: 0.04 }

// ─── Correlation groups ────────────────────────────────────────────────────────

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

// ─── Sample & rate helpers ─────────────────────────────────────────────────────

function getSampleCount(candidate) {
  if (candidate.teamScope) return candidate.activeTeamData?.sample ?? 0
  return (candidate.home?.sample ?? 0) + (candidate.away?.sample ?? 0)
}

// Returns the best honest (raw) hit rate from recent match history.
// Priority: l10 → l15 → smoothedRate.
function getHonestRate(candidate) {
  if (candidate.teamScope) {
    const data = candidate.activeTeamData
    if (!data || (data.sample ?? 0) < MIN_SAMPLE) return null
    return data.l10 ?? data.l15 ?? data.smoothedRate ?? null
  }
  const h = candidate.home
  const a = candidate.away
  if (!h && !a) return null
  const hs = h?.sample ?? 0
  const as_ = a?.sample ?? 0
  if (hs + as_ < MIN_SAMPLE) return null

  const hr = hs >= 2 ? (h?.l10 ?? h?.l15 ?? h?.smoothedRate ?? null) : null
  const ar = as_ >= 2 ? (a?.l10 ?? a?.l15 ?? a?.smoothedRate ?? null) : null

  if (hr == null && ar == null) {
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

// ─── Blended leg score ─────────────────────────────────────────────────────────
// Blends the prediction model's combinedRate (which accounts for opponent
// strength, H2H, and recency) with the raw historical hit rate.

function computeLegScore(candidate) {
  const honestRate = getHonestRate(candidate)
  if (honestRate == null || honestRate < HONEST_FLOOR) return null

  const sampleCount = getSampleCount(candidate)
  if (sampleCount < MIN_SAMPLE) return null

  const modelRate = candidate.combinedRate
  if (modelRate == null || modelRate <= 0) return null

  return clamp01(modelRate * MODEL_WEIGHT + honestRate * HONEST_WEIGHT)
}

// ─── Style detection with intensity scaling ────────────────────────────────────

function computeStyleInfo(homeHistory, awayHistory) {
  const merged = [...(homeHistory || []), ...(awayHistory || [])]
  if (!merged.length) return { style: 'balanced', intensity: 0 }

  const avgGoals = merged.reduce((s, m) => s + extractStatValue(m, 'goals', true), 0) / merged.length

  const cornersVals = merged.map(m => extractStatValue(m, 'corners', true, { raw: true })).filter(v => v != null)
  const cardsVals   = merged.map(m => extractStatValue(m, 'cards',   true, { raw: true })).filter(v => v != null)
  const foulsVals   = merged.map(m => extractStatValue(m, 'fouls',   true, { raw: true })).filter(v => v != null)

  const avgCorners = cornersVals.length ? cornersVals.reduce((s, v) => s + v, 0) / cornersVals.length : null
  const avgCards   = cardsVals.length   ? cardsVals.reduce((s, v) => s + v, 0) / cardsVals.length : null
  const avgFouls   = foulsVals.length   ? foulsVals.reduce((s, v) => s + v, 0) / foulsVals.length : null

  const homeCornerRate = getHistorySummarySnapshot(homeHistory, 'corners', 9.5, true)?.rate ?? null
  const awayCornerRate = getHistorySummarySnapshot(awayHistory, 'corners', 9.5, false)?.rate ?? null
  const homeCardRate   = getHistorySummarySnapshot(homeHistory, 'cards', 3.5, true)?.rate ?? null
  const awayCardRate   = getHistorySummarySnapshot(awayHistory, 'cards', 3.5, false)?.rate ?? null

  // Physical: high cards or fouls
  if ((avgCards != null && avgCards >= 4.8) || (avgFouls != null && avgFouls >= 24)
      || homeCardRate >= 0.6 || awayCardRate >= 0.6) {
    const intensity = clamp01(Math.max(
      avgCards  != null ? (avgCards  - 4)  / 3  : 0,
      avgFouls != null ? (avgFouls - 20) / 10 : 0,
      homeCardRate >= 0.6 ? (homeCardRate - 0.5) * 2 : 0,
      awayCardRate >= 0.6 ? (awayCardRate - 0.5) * 2 : 0,
    ))
    return { style: 'physical', intensity }
  }

  // Wide play: high corners
  if ((avgCorners != null && avgCorners >= 10) || homeCornerRate >= 0.6 || awayCornerRate >= 0.6) {
    const intensity = clamp01(Math.max(
      avgCorners != null ? (avgCorners - 8) / 6 : 0,
      homeCornerRate >= 0.6 ? (homeCornerRate - 0.5) * 2 : 0,
      awayCornerRate >= 0.6 ? (awayCornerRate - 0.5) * 2 : 0,
    ))
    return { style: 'wide-play', intensity }
  }

  // High tempo: high goals
  if (avgGoals >= 2.8) {
    const intensity = clamp01((avgGoals - 2.5) / 2)
    return { style: 'high-tempo', intensity }
  }

  return { style: 'balanced', intensity: 0 }
}

const HIGH_TEMPO_STATS = new Set([
  'goals', 'btts', 'shots', 'teamShots', 'firstHalfGoals', 'secondHalfGoals',
  'goalsInBothHalves', 'teamGoals', 'teamFirstHalfGoals', 'teamSecondHalfGoals',
])
const PHYSICAL_STATS  = new Set(['cards', 'fouls', 'teamCards', 'teamFouls'])
const WIDE_PLAY_STATS = new Set(['corners', 'teamCorners'])

// Style boost now scales with match intensity (2 – 5 %)
function styleBoostFor(styleInfo, statKey) {
  const { style, intensity } = styleInfo
  const boost = 0.02 + intensity * 0.03

  if (style === 'high-tempo' && HIGH_TEMPO_STATS.has(statKey)) return boost
  if (style === 'physical'  && PHYSICAL_STATS.has(statKey))    return boost
  if (style === 'wide-play' && WIDE_PLAY_STATS.has(statKey))   return boost
  return 0
}

// ─── Formatting helpers ────────────────────────────────────────────────────────

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
  const hits  = (h?.hits ?? 0) + (a?.hits ?? 0)
  return { hits, total }
}

// ─── Value rating ──────────────────────────────────────────────────────────────
// Compares actual combined probability to the statistical baseline for the
// number of legs. A 3-leg parlay at 25% is far more impressive than a 2-leg
// at 25%.

function computeValueRating(combinedProbability, legCount) {
  const baseline = BASELINE_COMBINED[legCount] ?? 0.04
  const ratio = combinedProbability / baseline
  if (ratio >= 1.8) return 'exceptional'
  if (ratio >= 1.4) return 'great'
  if (ratio >= 1.1) return 'good'
  if (ratio >= 0.8) return 'fair'
  return 'low'
}

// ─── Main SGP builder ──────────────────────────────────────────────────────────

function buildSGP(fixture) {
  if (!fixture.homeHistory?.length || !fixture.awayHistory?.length) return null

  const styleInfo = computeStyleInfo(fixture.homeHistory, fixture.awayHistory)

  // ---- Step 1: collect qualifying candidates ----
  // For each stat × alt × side, compute blended leg score. Keep only those
  // above LEG_THRESHOLD. Per (statKey + side), keep only the best alt.
  const bestPerSide = {}

  for (const statDef of STATS_ORDER) {
    const { key: statKey, alts } = statDef
    for (const alt of alts) {
      const candidates = evaluateFixturePrediction(fixture, statKey, alt)
      for (const candidate of candidates) {
        const legScore = computeLegScore(candidate)
        if (legScore == null || legScore < LEG_THRESHOLD) continue

        const boost = styleBoostFor(styleInfo, statKey)
        const adjustedScore = clamp01(legScore + boost)
        const honestRate = getHonestRate(candidate)

        const sideKey = `${statKey}:${candidate.isHome ?? 'match'}`
        if (!bestPerSide[sideKey] || adjustedScore > bestPerSide[sideKey].adjustedScore) {
          bestPerSide[sideKey] = {
            candidate, statKey, alt: candidate.alt, adjustedScore,
            legScore, honestRate, modelRate: candidate.combinedRate, statDef,
          }
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

  // ---- Step 3: greedy leg selection — up to 5 legs, rising threshold ----
  const sorted = Object.values(bestPerGroup).sort((a, b) => b.adjustedScore - a.adjustedScore)
  if (sorted.length < 2) return null

  const legs = []
  for (let i = 0; i < sorted.length; i++) {
    const posIdx = legs.length
    if (posIdx >= MAX_LEGS) break
    const minScore = Math.max(LEG_THRESHOLD, LEG_POSITION_THRESHOLDS[posIdx] ?? 0.65)
    if (sorted[i].adjustedScore >= minScore) {
      legs.push(sorted[i])
    }
  }

  if (legs.length < 2) return null

  // ---- Step 4: BTTS explicit exclusion guard ----
  const hasBTTS = legs.some(l => l.statKey === 'btts')
  if (hasBTTS) {
    const filtered = legs.filter(l => {
      if (l.statKey === 'teamGoals' && (l.alt == null || Number(l.alt) <= 0.5)) return false
      if (l.statKey === 'goals'     && (l.alt == null || Number(l.alt) <= 1.5)) return false
      return true
    })
    if (filtered.length >= 2) {
      legs.length = 0
      legs.push(...filtered)
    }
  }

  if (legs.length < 2) return null

  // ---- Step 5: combined probability with correlation discounts ----
  let combinedProbability = 1
  for (let i = 0; i < legs.length; i++) {
    const discount = CORRELATION_DISCOUNTS[i] ?? 0.93
    combinedProbability *= legs[i].legScore * discount
  }
  combinedProbability = clamp01(combinedProbability)

  if (combinedProbability < COMBINED_MIN) return null

  // ---- Step 6: strength label ----
  let strength = 'weak'
  if (combinedProbability >= 0.50) strength = 'strong'
  else if (combinedProbability >= 0.35) strength = 'moderate'

  // ---- Step 7: value rating ----
  const valueRating = computeValueRating(combinedProbability, legs.length)

  // ---- Step 8: build leg descriptors ----
  const builtLegs = legs.map(item => {
    const { candidate, statKey, statDef, corrGroup, legScore, honestRate, modelRate } = item
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
      probability: legScore,       // blended score (primary display)
      modelRate,                   // prediction model rate (opponent-aware)
      honestRate,                  // raw historical hit rate
      breakdown: buildModelBreakdown(candidate),
      rawHits:  raw?.hits  ?? null,
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
    styleTag: styleInfo.style,
    styleIntensity: styleInfo.intensity,
    valueRating,
  }
}

// ─── Public API ────────────────────────────────────────────────────────────────

export function analyzeSGP(fixtures) {
  const results = []
  for (const fixture of fixtures || []) {
    if (!fixture.homeHistory?.length || !fixture.awayHistory?.length) continue
    const sgp = buildSGP(fixture)
    if (sgp) results.push(sgp)
  }
  // Ranked by value rating tier, then combined probability within each tier
  const VALUE_ORDER = { exceptional: 0, great: 1, good: 2, fair: 3, low: 4 }
  results.sort((a, b) => {
    const va = VALUE_ORDER[a.valueRating] ?? 4
    const vb = VALUE_ORDER[b.valueRating] ?? 4
    if (va !== vb) return va - vb
    return b.combinedProbability - a.combinedProbability
  })
  return results
}
