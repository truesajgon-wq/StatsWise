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

function checkDatePatterns(history, today) {
  const todayMonth = today.getMonth()
  const todayDay = today.getDate()
  const todayYear = today.getFullYear()

  let sameDayLastYear = 0
  let sameMonth = 0
  let exactDateMinus2 = 0

  for (const match of history) {
    if (!match?.date) continue
    const d = match.date instanceof Date ? match.date : new Date(match.date)
    if (Number.isNaN(d.getTime())) continue

    const matchMonth = d.getMonth()
    const matchDay = d.getDate()
    const matchYear = d.getFullYear()

    if (matchYear === todayYear - 1) {
      const dayDiff = Math.abs(matchDay - todayDay)
      if (matchMonth === todayMonth && dayDiff <= 3) sameDayLastYear += 1
    }

    if (matchMonth === todayMonth) sameMonth += 1

    if (matchYear === todayYear - 2 && matchMonth === todayMonth && matchDay === todayDay) {
      exactDateMinus2 += 1
    }
  }

  return { sameDayLastYear, sameMonth, exactDateMinus2 }
}

function hasTrianglePattern(homeHistory, awayHistory) {
  if (!homeHistory?.length || !awayHistory?.length) return false

  const homeOpponents = new Set(
    homeHistory.filter(m => m.result === 'W').map(m => m.opponent?.toLowerCase()),
  )
  const awayOpponents = new Set(
    awayHistory.filter(m => m.result === 'W').map(m => m.opponent?.toLowerCase()),
  )

  const sharedVictims = [...homeOpponents].filter(opponent => opponent && awayOpponents.has(opponent))
  return sharedVictims.length >= 2
}

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
        datePatterns: { sameDayLastYear: 0, sameMonth: 0, exactDateMinus2: 0 },
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
  }

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

export function analyzeFixture(fixture, today = new Date()) {
  const homeHistory = fixture.homeHistory || []
  const awayHistory = fixture.awayHistory || []

  const homeAnalysis = scoreTeam(homeHistory, true, today)
  const awayAnalysis = scoreTeam(awayHistory, false, today)
  const hasTriangle = hasTrianglePattern(homeHistory, awayHistory)
  const homeLaneSupport =
    (homeAnalysis.meta.exactComebackCount || homeAnalysis.meta.comebackCount || 0) +
    (awayAnalysis.meta.wfbCount || awayAnalysis.meta.collapseCount || 0)
  const awayLaneSupport =
    (awayAnalysis.meta.exactComebackCount || awayAnalysis.meta.comebackCount || 0) +
    (homeAnalysis.meta.wfbCount || homeAnalysis.meta.collapseCount || 0)
  const hasAnySwingEvidence = homeLaneSupport > 0 || awayLaneSupport > 0
  const triangleBonus = hasTriangle && hasAnySwingEvidence ? 15 : 0

  const combinedScore = Math.round(
    (homeAnalysis.score * 0.45) +
    (awayAnalysis.score * 0.45) +
    triangleBonus,
  )

  const homeLaneScore =
    homeAnalysis.score +
    Math.round((awayAnalysis.meta.wfbRate || awayAnalysis.meta.collapseRate || 0) * 100 * 0.35)
  const awayLaneScore =
    awayAnalysis.score +
    Math.round((homeAnalysis.meta.wfbRate || homeAnalysis.meta.collapseRate || 0) * 100 * 0.35)

  let lamakType = null
  if (homeLaneSupport > 0 && homeLaneScore >= awayLaneScore + 12) lamakType = 'home'
  else if (awayLaneSupport > 0 && awayLaneScore >= homeLaneScore + 12) lamakType = 'away'
  else if (homeLaneSupport > 0 && awayLaneSupport > 0 && combinedScore >= 30) lamakType = 'both'

  let strength = null
  if (combinedScore >= 65) strength = 'strong'
  else if (combinedScore >= 40) strength = 'moderate'
  else if (combinedScore >= 25) strength = 'weak'

  const probability = Math.round(
    100 / (1 + Math.exp(-0.07 * (combinedScore - 45))),
  )

  return {
    fixture,
    homeScore: homeAnalysis.score,
    awayScore: awayAnalysis.score,
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
    isLamak: strength !== null && lamakType !== null && hasAnySwingEvidence,
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
      return `${t('lamaki_one_two_two_one')}: ${pattern.value}x (${Math.round(pattern.rate * 100)}%)`
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
