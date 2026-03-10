// ─── Łamak (Comeback) Pattern Detection Engine ───────────────────────────────
// A "łamak" is a match where a team wins from behind:
//   e.g. losing at HT 0:1, winning at FT 2:1
//   OR winning at HT 1:0, then losing at FT 1:2 (the OPPONENT is the łamak)
//
// We analyze fixture history to score the probability of a comeback occurring.

// ─── Helper: was this a comeback win for the perspective team? ────────────────
function isComeback(match, isHomePerspective) {
  const hg = match.homeGoals ?? 0
  const ag = match.awayGoals ?? 0
  const fhg = match.firstHalfGoals ?? 0

  // We only know total HT goals, not split — use available data
  // A comeback = team was behind at some point but won
  // Approximate: if result is W (win) but they conceded goals
  const myGoals    = isHomePerspective ? hg : ag
  const theirGoals = isHomePerspective ? ag : hg
  const won        = myGoals > theirGoals

  if (!won) return false
  // Proxy for "was behind": they conceded at least 1 goal and scored later
  return theirGoals >= 1
}

// ─── Helper: did the team blow a lead? (was winning, then lost) ───────────────
function isCollapse(match, isHomePerspective) {
  const hg = match.homeGoals ?? 0
  const ag = match.awayGoals ?? 0
  const myGoals    = isHomePerspective ? hg : ag
  const theirGoals = isHomePerspective ? ag : hg
  const lost       = myGoals < theirGoals

  if (!lost) return false
  // Proxy: they scored but still lost — they had a lead at some point
  return myGoals >= 1
}

// ─── Helper: check date patterns ─────────────────────────────────────────────
function checkDatePatterns(history, today) {
  const todayMonth = today.getMonth()
  const todayDay   = today.getDate()
  const todayYear  = today.getFullYear()

  let sameDayLastYear  = 0
  let sameMonth        = 0
  let exactDateMinus2  = 0

  for (const match of history) {
    if (!match.date) continue
    const d = match.date instanceof Date ? match.date : new Date(match.date)
    const matchMonth = d.getMonth()
    const matchDay   = d.getDate()
    const matchYear  = d.getFullYear()

    // Same calendar day ±3 days, last year
    if (matchYear === todayYear - 1) {
      const dayDiff = Math.abs(matchDay - todayDay)
      if (matchMonth === todayMonth && dayDiff <= 3) sameDayLastYear++
    }

    // Same month (any year)
    if (matchMonth === todayMonth) sameMonth++

    // Exact same day, 2 years ago
    if (matchYear === todayYear - 2 && matchMonth === todayMonth && matchDay === todayDay) {
      exactDateMinus2++
    }
  }

  return { sameDayLastYear, sameMonth, exactDateMinus2 }
}

// ─── Helper: triangle pattern check ──────────────────────────────────────────
// Look for a "triangle": A beats B, B beats C, C beats A (circular)
// Using opponent names in history — simplified version
function hasTrianglePattern(homeHistory, awayHistory) {
  if (!homeHistory?.length || !awayHistory?.length) return false

  const homeOpponents = new Set(
    homeHistory.filter(m => m.result === 'W').map(m => m.opponent?.toLowerCase())
  )
  const awayOpponents = new Set(
    awayHistory.filter(m => m.result === 'W').map(m => m.opponent?.toLowerCase())
  )

  // Check if away team has beaten opponents that home team also beat (shared victims)
  const sharedVictims = [...homeOpponents].filter(op => op && awayOpponents.has(op))
  return sharedVictims.length >= 2
}

// ─── Score patterns for a single team perspective ────────────────────────────
function scoreTeam(history, isHomeInMatch, today) {
  if (!history || history.length === 0) return { score: 0, patterns: [] }

  const patterns = []
  let score = 0

  // 1. Comeback wins
  const comebacks = history.filter(m => isComeback(m, isHomeInMatch))
  const comebackRate = comebacks.length / history.length
  if (comebackRate >= 0.4) {
    score += 35
    patterns.push({ type: 'comeback', value: comebacks.length, rate: comebackRate })
  } else if (comebackRate >= 0.25) {
    score += 20
    patterns.push({ type: 'comeback', value: comebacks.length, rate: comebackRate })
  } else if (comebackRate >= 0.1) {
    score += 8
    patterns.push({ type: 'comeback', value: comebacks.length, rate: comebackRate })
  }

  // 2. Collapses (blowing leads)
  const collapses = history.filter(m => isCollapse(m, isHomeInMatch))
  const collapseRate = collapses.length / history.length
  if (collapseRate >= 0.35) {
    score += 25
    patterns.push({ type: 'collapse', value: collapses.length, rate: collapseRate })
  } else if (collapseRate >= 0.2) {
    score += 12
    patterns.push({ type: 'collapse', value: collapses.length, rate: collapseRate })
  }

  // 3. Both teams scoring in comeback matches (high drama)
  const bttsInComebacks = comebacks.filter(m => m.btts)
  if (bttsInComebacks.length >= 2) {
    score += 10
    patterns.push({ type: 'btts_comeback', value: bttsInComebacks.length })
  }

  // 4. High-scoring collapses (conceded 2+ while winning)
  const bigCollapses = history.filter(m => {
    const myGoals    = isHomeInMatch ? (m.homeGoals ?? 0) : (m.awayGoals ?? 0)
    const theirGoals = isHomeInMatch ? (m.awayGoals ?? 0) : (m.homeGoals ?? 0)
    return myGoals >= 1 && theirGoals >= myGoals + 1
  })
  if (bigCollapses.length >= 2) {
    score += 15
    patterns.push({ type: 'big_collapse', value: bigCollapses.length })
  }

  // 5. Date patterns (same day last year, etc.)
  const datePatterns = checkDatePatterns(history, today)
  if (datePatterns.exactDateMinus2 > 0) {
    score += 20
    patterns.push({ type: 'calendar_exact', value: datePatterns.exactDateMinus2 })
  }
  if (datePatterns.sameDayLastYear > 0) {
    score += 12
    patterns.push({ type: 'calendar_day_year', value: datePatterns.sameDayLastYear })
  }
  if (datePatterns.sameMonth >= 3) {
    score += 6
    patterns.push({ type: 'calendar_month', value: datePatterns.sameMonth })
  }

  // 6. Recent form — last 3 games
  const last3 = history.slice(0, 3)
  const last3Comebacks = last3.filter(m => isComeback(m, isHomeInMatch))
  if (last3Comebacks.length >= 2) {
    score += 20
    patterns.push({ type: 'recent_streak', value: last3Comebacks.length })
  }

  return { score: Math.min(score, 100), patterns }
}

// ─── Main engine: analyze a fixture ──────────────────────────────────────────
export function analyzeFixture(fixture, today = new Date()) {
  const homeHistory = fixture.homeHistory || []
  const awayHistory = fixture.awayHistory || []

  const homeAnalysis = scoreTeam(homeHistory, true, today)
  const awayAnalysis = scoreTeam(awayHistory, false, today)

  // Triangle bonus
  const triangleBonus = hasTrianglePattern(homeHistory, awayHistory) ? 15 : 0

  const combinedScore = Math.round(
    (homeAnalysis.score * 0.45) +
    (awayAnalysis.score * 0.45) +
    triangleBonus
  )

  const hasTriangle = triangleBonus > 0

  // Determine łamak type
  let lamakType = null
  if (homeAnalysis.score >= awayAnalysis.score + 20) lamakType = 'home'
  else if (awayAnalysis.score >= homeAnalysis.score + 20) lamakType = 'away'
  else if (combinedScore >= 30) lamakType = 'both'

  // Strength label
  let strength = null
  if (combinedScore >= 65) strength = 'strong'
  else if (combinedScore >= 40) strength = 'moderate'
  else if (combinedScore >= 25) strength = 'weak'

  // Probability estimate (sigmoid-like, 0–100%)
  const probability = Math.round(
    100 / (1 + Math.exp(-0.07 * (combinedScore - 45)))
  )

  return {
    fixture,
    homeScore:    homeAnalysis.score,
    awayScore:    awayAnalysis.score,
    combinedScore,
    probability,
    strength,
    lamakType,
    hasTriangle,
    homePatterns: homeAnalysis.patterns,
    awayPatterns: awayAnalysis.patterns,
    isLamak:      strength !== null,
  }
}

// ─── Analyze all fixtures for the day ────────────────────────────────────────
export function analyzeDayFixtures(fixtures, today = new Date()) {
  return fixtures
    .map(f => analyzeFixture(f, today))
    .filter(r => r.isLamak)
    .sort((a, b) => b.combinedScore - a.combinedScore)
}

// ─── Pattern label helpers ────────────────────────────────────────────────────
export function patternLabel(pattern, t) {
  switch (pattern.type) {
    case 'comeback':
      return `${t('lamaki_comeback')}: ${pattern.value}x (${Math.round(pattern.rate * 100)}%)`
    case 'collapse':
      return `${t('lamaki_ht_lead')}: ${pattern.value}x (${Math.round(pattern.rate * 100)}%)`
    case 'big_collapse':
      return `Big lead lost: ${pattern.value}x`
    case 'btts_comeback':
      return `Comeback with BTTS: ${pattern.value}x`
    case 'calendar_exact':
      return t('lamaki_exact_date')
    case 'calendar_day_year':
      return t('lamaki_same_day_year')
    case 'calendar_month':
      return `${t('lamaki_same_month')}: ${pattern.value}x`
    case 'recent_streak':
      return `Last 3 matches - comebacks: ${pattern.value}x`
    default:
      return pattern.type
  }
}

export function strengthColor(strength) {
  if (strength === 'strong')   return '#22c55e'
  if (strength === 'moderate') return '#f59e0b'
  return '#6b7280'
}

