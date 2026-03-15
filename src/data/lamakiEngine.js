// Lamaki (comeback) detection engine.
// A comeback bet is strongest when one side repeatedly wins from behind
// and/or the opponent repeatedly throws away leads.

function asNumber(value) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function perspectiveScores(match, isHomePerspective) {
  const directMy = asNumber(match?.myGoals)
  const directTheir = asNumber(match?.theirGoals)
  if (directMy !== null && directTheir !== null) return { my: directMy, their: directTheir }

  const homeGoals = asNumber(match?.homeGoals)
  const awayGoals = asNumber(match?.awayGoals)
  if (homeGoals === null || awayGoals === null) return { my: null, their: null }

  return isHomePerspective
    ? { my: homeGoals, their: awayGoals }
    : { my: awayGoals, their: homeGoals }
}

function perspectiveHalfTimeScores(match, isHomePerspective) {
  const directMy = asNumber(match?.myFirstHalfGoals)
  const directTheir = asNumber(match?.theirFirstHalfGoals)
  if (directMy !== null && directTheir !== null) return { my: directMy, their: directTheir }

  const homeHt = asNumber(match?.homeGoalsHt)
  const awayHt = asNumber(match?.awayGoalsHt)
  if (homeHt !== null && awayHt !== null) {
    return isHomePerspective
      ? { my: homeHt, their: awayHt }
      : { my: awayHt, their: homeHt }
  }

  return { my: null, their: null }
}

function classifySwing(match, isHomePerspective) {
  const ft = perspectiveScores(match, isHomePerspective)
  if (ft.my === null || ft.their === null) {
    return { comeback: false, collapse: false, certainty: 'none', exactComeback: false, wfb: false }
  }

  const ht = perspectiveHalfTimeScores(match, isHomePerspective)
  const won = ft.my > ft.their
  const lost = ft.my < ft.their

  if (ht.my !== null && ht.their !== null) {
    const exactComeback = won && ht.my < ht.their
    const wfb = exactComeback || (lost && ht.my > ht.their)
    return {
      comeback: exactComeback,
      collapse: lost && ht.my > ht.their,
      exactComeback,
      wfb,
      certainty: 'ht',
    }
  }

  const proxyComeback = won && ft.their >= 1
  const proxyWfb = proxyComeback || (lost && ft.my >= 1)
  return {
    // Proxy fallback when halftime split is unavailable.
    comeback: proxyComeback,
    collapse: lost && ft.my >= 1,
    exactComeback: false,
    wfb: proxyWfb,
    certainty: 'proxy',
  }
}

function isComeback(match, isHomePerspective) {
  return classifySwing(match, isHomePerspective).comeback
}

function isCollapse(match, isHomePerspective) {
  return classifySwing(match, isHomePerspective).collapse
}

// ---------------------------------------------------------------------------
// Calendar pattern detection — supports 1, 2 and 3-year cycles
// ---------------------------------------------------------------------------
function checkDatePatterns(history, today) {
  const todayMonth = today.getMonth()
  const todayDay = today.getDate()
  const todayYear = today.getFullYear()

  let sameDayLastYear = 0
  let sameMonth = 0
  let exactDateMinus2 = 0
  let exactDateMinus3 = 0

  for (const match of history) {
    if (!match?.date) continue
    const d = match.date instanceof Date ? match.date : new Date(match.date)
    if (Number.isNaN(d.getTime())) continue

    const matchMonth = d.getMonth()
    const matchDay = d.getDate()
    const matchYear = d.getFullYear()

    // 1-year cycle: same month, within ±3 days
    if (matchYear === todayYear - 1) {
      const dayDiff = Math.abs(matchDay - todayDay)
      if (matchMonth === todayMonth && dayDiff <= 3) sameDayLastYear += 1
    }

    // Same calendar month (any year)
    if (matchMonth === todayMonth) sameMonth += 1

    // 2-year cycle: exact date match
    if (matchYear === todayYear - 2 && matchMonth === todayMonth && matchDay === todayDay) {
      exactDateMinus2 += 1
    }

    // 3-year cycle: same month, within ±3 days
    if (matchYear === todayYear - 3) {
      const dayDiff = Math.abs(matchDay - todayDay)
      if (matchMonth === todayMonth && dayDiff <= 3) exactDateMinus3 += 1
    }
  }

  return { sameDayLastYear, sameMonth, exactDateMinus2, exactDateMinus3 }
}

// ---------------------------------------------------------------------------
// Triangle pattern — requires WFB/HT/FT events against shared opponents,
// not just any shared wins.
// ---------------------------------------------------------------------------
function hasTrianglePattern(homeHistory, awayHistory) {
  if (!homeHistory?.length || !awayHistory?.length) return false

  // Primary: both teams have swing events (comeback or collapse) against same opponent
  const homeSwingOpponents = new Set(
    homeHistory
      .filter(m => isComeback(m, true) || isCollapse(m, true))
      .map(m => m.opponent?.toLowerCase()),
  )
  const awaySwingOpponents = new Set(
    awayHistory
      .filter(m => isComeback(m, false) || isCollapse(m, false))
      .map(m => m.opponent?.toLowerCase()),
  )
  const sharedSwingOpponents = [...homeSwingOpponents].filter(
    opp => opp && awaySwingOpponents.has(opp),
  )
  if (sharedSwingOpponents.length >= 1) return true

  // Fallback: shared win victims (weaker signal)
  const homeWinOpponents = new Set(
    homeHistory.filter(m => m.result === 'W').map(m => m.opponent?.toLowerCase()),
  )
  const awayWinOpponents = new Set(
    awayHistory.filter(m => m.result === 'W').map(m => m.opponent?.toLowerCase()),
  )
  const sharedVictims = [...homeWinOpponents].filter(opp => opp && awayWinOpponents.has(opp))
  return sharedVictims.length >= 2
}

// ---------------------------------------------------------------------------
// Per-team scoring
// ---------------------------------------------------------------------------
function scoreTeam(history, isHomeInMatch, today) {
  if (!history || history.length === 0) {
    return {
      score: 0,
      patterns: [],
      meta: {
        sampleSize: 0,
        comebackCount: 0,
        collapseCount: 0,
        exactComebackCount: 0,
        wfbCount: 0,
        comebackRate: 0,
        collapseRate: 0,
        exactComebackRate: 0,
        wfbRate: 0,
        recentComebacks: 0,
        recentCollapses: 0,
        datePatterns: { sameDayLastYear: 0, sameMonth: 0, exactDateMinus2: 0, exactDateMinus3: 0 },
        certainty: 'none',
      },
    }
  }

  const patterns = []
  let score = 0
  const swingMeta = history.map(match => classifySwing(match, isHomeInMatch))
  const certainty =
    swingMeta.some(item => item.certainty === 'ht')
      ? 'ht'
      : swingMeta.some(item => item.certainty === 'proxy')
        ? 'proxy'
        : 'none'

  const comebacks = history.filter((match, index) => swingMeta[index].comeback)
  const exactComebacks = history.filter((match, index) => swingMeta[index].exactComeback)
  const comebackRate = comebacks.length / history.length
  const exactComebackRate = exactComebacks.length / history.length
  const directSwingEvidence = exactComebacks.length
  if (comebackRate >= 0.4) {
    score += 35
    patterns.push({ type: 'one_two_two_one', value: exactComebacks.length || comebacks.length, rate: exactComebackRate || comebackRate, exact: exactComebacks.length > 0 })
  } else if (comebackRate >= 0.25) {
    score += 20
    patterns.push({ type: 'one_two_two_one', value: exactComebacks.length || comebacks.length, rate: exactComebackRate || comebackRate, exact: exactComebacks.length > 0 })
  } else if (comebackRate >= 0.1) {
    score += 8
    patterns.push({ type: 'one_two_two_one', value: exactComebacks.length || comebacks.length, rate: exactComebackRate || comebackRate, exact: exactComebacks.length > 0 })
  } else if (comebacks.length > 0) {
    score += 4
    patterns.push({ type: 'one_two_two_one', value: exactComebacks.length || comebacks.length, rate: exactComebackRate || comebackRate, exact: exactComebacks.length > 0 })
  }

  const collapses = history.filter((match, index) => swingMeta[index].collapse)
  const wfbMatches = history.filter((match, index) => swingMeta[index].wfb)
  const collapseRate = collapses.length / history.length
  const wfbRate = wfbMatches.length / history.length
  const collapseEvidence = wfbMatches.length
  if (collapseRate >= 0.35) {
    score += 25
    patterns.push({ type: 'wfb', value: wfbMatches.length || collapses.length, rate: wfbRate || collapseRate, exact: wfbMatches.length > 0 })
  } else if (collapseRate >= 0.2) {
    score += 12
    patterns.push({ type: 'wfb', value: wfbMatches.length || collapses.length, rate: wfbRate || collapseRate, exact: wfbMatches.length > 0 })
  } else if (wfbMatches.length > 0 || collapses.length > 0) {
    score += 6
    patterns.push({ type: 'wfb', value: wfbMatches.length || collapses.length, rate: wfbRate || collapseRate, exact: wfbMatches.length > 0 })
  }

  if (directSwingEvidence > 0) score += Math.min(10, directSwingEvidence * 4)
  if (collapseEvidence > 0) score += Math.min(8, collapseEvidence * 3)

  const bttsInComebacks = comebacks.filter(match => match.btts)
  if (directSwingEvidence > 0 && bttsInComebacks.length >= 2) {
    score += 10
    patterns.push({ type: 'btts_comeback', value: bttsInComebacks.length })
  }

  const bigCollapses = history.filter(match => {
    const myGoals = isHomeInMatch ? (match.homeGoals ?? 0) : (match.awayGoals ?? 0)
    const theirGoals = isHomeInMatch ? (match.awayGoals ?? 0) : (match.homeGoals ?? 0)
    return myGoals >= 1 && theirGoals >= myGoals + 1
  })
  if (collapseEvidence > 0 && bigCollapses.length >= 2) {
    score += 15
    patterns.push({ type: 'big_collapse', value: bigCollapses.length })
  }

  const datePatterns = checkDatePatterns(history, today)
  if ((directSwingEvidence > 0 || collapseEvidence > 0) && datePatterns.exactDateMinus2 > 0) {
    score += 20
    patterns.push({ type: 'calendar_exact', value: datePatterns.exactDateMinus2 })
  }
  if ((directSwingEvidence > 0 || collapseEvidence > 0) && datePatterns.sameDayLastYear > 0) {
    score += 12
    patterns.push({ type: 'calendar_day_year', value: datePatterns.sameDayLastYear })
  }
  if ((directSwingEvidence > 0 || collapseEvidence > 0) && datePatterns.sameMonth >= 3) {
    score += 6
    patterns.push({ type: 'calendar_month', value: datePatterns.sameMonth })
  }
  if ((directSwingEvidence > 0 || collapseEvidence > 0) && datePatterns.exactDateMinus3 > 0) {
    score += 10
    patterns.push({ type: 'calendar_3year', value: datePatterns.exactDateMinus3 })
  }

  const last3SwingMeta = swingMeta.slice(0, 3)
  const last3Comebacks = last3SwingMeta.filter(item => item.comeback).length
  if (last3Comebacks >= 2) {
    score += 20
    patterns.push({ type: 'recent_streak', value: last3Comebacks })
  }

  const last5SwingMeta = swingMeta.slice(0, 5)
  const recentCollapses = last5SwingMeta.filter(item => item.collapse).length

  const sampleFactor = Math.min(history.length / 10, 1)
  score = Math.round(score * (0.82 + sampleFactor * 0.18))

  return {
    score: Math.min(score, 100),
    patterns,
    meta: {
      sampleSize: history.length,
      comebackCount: comebacks.length,
      collapseCount: collapses.length,
      exactComebackCount: exactComebacks.length,
      wfbCount: wfbMatches.length,
      comebackRate,
      collapseRate,
      exactComebackRate,
      wfbRate,
      directSwingEvidence,
      collapseEvidence,
      recentComebacks: last3Comebacks,
      recentCollapses,
      datePatterns,
      certainty,
    },
  }
}

// ---------------------------------------------------------------------------
// H2H scoring — analyses comeback/collapse patterns between these two specific
// teams. H2H entries are mapped from the home team's perspective.
// ---------------------------------------------------------------------------
function scoreH2H(h2hHistory) {
  const empty = {
    score: 0,
    homeTeamComebacks: 0,
    awayTeamComebacks: 0,
    homeTeamComebackRate: 0,
    awayTeamComebackRate: 0,
    totalSwings: 0,
    dominantSide: 'none',
    certainty: 'none',
    sampleSize: 0,
  }
  if (!h2hHistory?.length) return empty

  // H2H matches are mapped from the HOME team's perspective (isHome reflects
  // whether the current home team was playing at home in that H2H meeting).
  // comeback = home team was trailing at HT and won FT (home team came from behind)
  // collapse = home team was leading at HT and lost FT (away team came from behind)
  const swingMeta = h2hHistory.map(match => classifySwing(match, true))

  const homeTeamComebacks = swingMeta.filter(s => s.comeback).length
  const awayTeamComebacks = swingMeta.filter(s => s.collapse).length
  const totalSwings = homeTeamComebacks + awayTeamComebacks
  const n = h2hHistory.length
  const homeTeamComebackRate = homeTeamComebacks / n
  const awayTeamComebackRate = awayTeamComebacks / n
  const maxRate = Math.max(homeTeamComebackRate, awayTeamComebackRate)

  const certainty = swingMeta.some(s => s.certainty === 'ht')
    ? 'ht'
    : swingMeta.some(s => s.certainty === 'proxy')
      ? 'proxy'
      : 'none'

  let score = 0

  // Rate-based component
  if (maxRate >= 0.5) score += 45
  else if (maxRate >= 0.35) score += 30
  else if (maxRate >= 0.2) score += 18
  else if (totalSwings > 0) score += 8

  // Raw count bonus — each confirmed swing in H2H is highly significant
  if (totalSwings >= 4) score += 20
  else if (totalSwings >= 3) score += 14
  else if (totalSwings >= 2) score += 8
  else if (totalSwings >= 1) score += 4

  // Both sides have swung — volatile H2H matchup
  if (homeTeamComebacks > 0 && awayTeamComebacks > 0) score += 12

  // Scale by sample size (full confidence at 6+ H2H matches)
  const sampleFactor = Math.min(n / 6, 1)
  score = Math.round(score * (0.70 + sampleFactor * 0.30))

  // Which side dominates the H2H comeback angle
  let dominantSide = 'none'
  if (homeTeamComebacks > 0 && awayTeamComebacks > 0) dominantSide = 'both'
  else if (homeTeamComebacks > awayTeamComebacks) dominantSide = 'home'
  else if (awayTeamComebacks > homeTeamComebacks) dominantSide = 'away'

  return {
    score: Math.min(score, 100),
    homeTeamComebacks,
    awayTeamComebacks,
    homeTeamComebackRate,
    awayTeamComebackRate,
    totalSwings,
    dominantSide,
    certainty,
    sampleSize: n,
  }
}

export function analyzeFixture(fixture, today = new Date()) {
  const homeHistory = fixture.homeHistory || []
  const awayHistory = fixture.awayHistory || []
  const h2h = fixture.h2h || []

  const homeAnalysis = scoreTeam(homeHistory, true, today)
  const awayAnalysis = scoreTeam(awayHistory, false, today)
  const h2hAnalysis = scoreH2H(h2h)
  const hasTriangle = hasTrianglePattern(homeHistory, awayHistory)

  // Lane support: how many events back each side's comeback angle,
  // including direct H2H evidence.
  const homeLaneSupport =
    (homeAnalysis.meta.exactComebackCount || homeAnalysis.meta.comebackCount || 0) +
    (awayAnalysis.meta.wfbCount || awayAnalysis.meta.collapseCount || 0) +
    h2hAnalysis.homeTeamComebacks

  const awayLaneSupport =
    (awayAnalysis.meta.exactComebackCount || awayAnalysis.meta.comebackCount || 0) +
    (homeAnalysis.meta.wfbCount || homeAnalysis.meta.collapseCount || 0) +
    h2hAnalysis.awayTeamComebacks

  const hasAnySwingEvidence = homeLaneSupport > 0 || awayLaneSupport > 0
  const triangleBonus = hasTriangle && hasAnySwingEvidence ? 15 : 0

  // Combined score: home 30% + away 30% + H2H 25% + triangle bonus
  const combinedScore = Math.round(
    (homeAnalysis.score * 0.30) +
    (awayAnalysis.score * 0.30) +
    (h2hAnalysis.score * 0.25) +
    triangleBonus,
  )

  // Per-lane scores include the opponent's collapse tendency and H2H evidence
  const h2hHomeLaneBonus = Math.round(h2hAnalysis.homeTeamComebackRate * 100 * 0.5)
  const h2hAwayLaneBonus = Math.round(h2hAnalysis.awayTeamComebackRate * 100 * 0.5)

  const homeLaneScore =
    homeAnalysis.score +
    Math.round((awayAnalysis.meta.wfbRate || awayAnalysis.meta.collapseRate || 0) * 100 * 0.35) +
    h2hHomeLaneBonus

  const awayLaneScore =
    awayAnalysis.score +
    Math.round((homeAnalysis.meta.wfbRate || homeAnalysis.meta.collapseRate || 0) * 100 * 0.35) +
    h2hAwayLaneBonus

  let lamakType = null
  if (homeLaneSupport > 0 && awayLaneSupport > 0 && combinedScore >= 18 && Math.abs(homeLaneScore - awayLaneScore) <= 8) {
    lamakType = 'both'
  } else if (homeLaneSupport > 0 && (homeLaneScore >= awayLaneScore + 8 || awayLaneSupport === 0) && homeLaneScore >= 12) {
    lamakType = 'home'
  } else if (awayLaneSupport > 0 && (awayLaneScore >= homeLaneScore + 8 || homeLaneSupport === 0) && awayLaneScore >= 12) {
    lamakType = 'away'
  } else if (homeLaneSupport > 0 && awayLaneSupport > 0 && combinedScore >= 14) {
    lamakType = homeLaneScore >= awayLaneScore ? 'home' : 'away'
  }

  let strength = null
  if (combinedScore >= 55) strength = 'strong'
  else if (combinedScore >= 32) strength = 'moderate'
  else if (combinedScore >= 18) strength = 'weak'

  const probability = Math.round(
    100 / (1 + Math.exp(-0.08 * (combinedScore - 28))),
  )

  return {
    fixture,
    homeScore: homeAnalysis.score,
    awayScore: awayAnalysis.score,
    h2hScore: h2hAnalysis.score,
    combinedScore,
    probability,
    strength,
    lamakType,
    hasTriangle,
    homeLaneSupport,
    awayLaneSupport,
    homeLaneScore,
    awayLaneScore,
    homePatterns: homeAnalysis.patterns,
    awayPatterns: awayAnalysis.patterns,
    homeMeta: homeAnalysis.meta,
    awayMeta: awayAnalysis.meta,
    h2hMeta: h2hAnalysis,
    isLamak: strength !== null && lamakType !== null && hasAnySwingEvidence && combinedScore >= 18,
  }
}

export function analyzeDayFixtures(fixtures, today = new Date()) {
  return fixtures
    .map(fixture => analyzeFixture(fixture, today))
    .filter(result => result.isLamak)
    .sort((a, b) => b.combinedScore - a.combinedScore)
}

export function patternLabel(pattern, t) {
  switch (pattern.type) {
    case 'one_two_two_one':
      return `HT/FT: ${pattern.value}x (${Math.round(pattern.rate * 100)}%)`
    case 'wfb':
      return `${t('lamaki_wfb')}: ${pattern.value}x (${Math.round(pattern.rate * 100)}%)`
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
    case 'calendar_3year':
      return `3-year cycle match: ${pattern.value}x`
    case 'recent_streak':
      return `Last 3 matches - comebacks: ${pattern.value}x`
    default:
      return pattern.type
  }
}

export function strengthColor(strength) {
  if (strength === 'strong') return '#22c55e'
  if (strength === 'moderate') return '#f59e0b'
  return '#6b7280'
}
