// Correct Score Prediction Engine
// Deterministic model using weighted historical form + Poisson + empirical correction.
// H2H weight is adaptive (scales with sample size), home advantage is explicit,
// draw tendency boosts X:X lines, calendar cycles amplify recurring H2H scorelines.
//
// All history entries use myGoals/theirGoals (perspective-corrected) + isHome flag.
// homeGoals/awayGoals are the raw match values (used only for canonical scoreline reconstruction).

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function poisson(k, lambda) {
  if (lambda <= 0) return k === 0 ? 1 : 0
  let p = Math.exp(-lambda)
  for (let i = 0; i < k; i++) p *= lambda / (i + 1)
  return Math.max(p, 0)
}

function recentWeights(n) {
  return Array.from({ length: n }, (_, i) => Math.pow(0.86, i))
}

function weightedAvg(values) {
  if (!values.length) return 0
  const w = recentWeights(values.length)
  const num = values.reduce((s, v, i) => s + v * w[i], 0)
  const den = w.reduce((s, x) => s + x, 0)
  return den > 0 ? num / den : 0
}

function scoreKey(h, a) {
  return `${h}:${a}`
}

// Resolve the perspective-corrected goals from a history/H2H entry.
// myGoals = what THIS team scored; theirGoals = what the opponent scored.
// Falls back to homeGoals/awayGoals with isHome disambiguation if needed.
function resolveGoals(match) {
  const myG = match?.myGoals != null ? Number(match.myGoals) : null
  const theirG = match?.theirGoals != null ? Number(match.theirGoals) : null
  if (myG !== null && theirG !== null && Number.isFinite(myG) && Number.isFinite(theirG)) {
    return { my: myG, their: theirG }
  }
  // Fallback: reconstruct from raw home/away goals + isHome flag
  const hg = Number(match?.homeGoals || 0)
  const ag = Number(match?.awayGoals || 0)
  const isHome = typeof match?.isHome === 'boolean' ? match.isHome : true
  return isHome ? { my: hg, their: ag } : { my: ag, their: hg }
}

// Canonical home:away scoreline for a historical match, regardless of which
// team we are tracking. Uses isHome to orient home/away correctly.
function canonicalScore(match) {
  const { my, their } = resolveGoals(match)
  const teamIsHome = typeof match?.isHome === 'boolean' ? match.isHome : true
  return { h: teamIsHome ? my : their, a: teamIsHome ? their : my }
}

// Count how many times each home:away scoreline appeared across a set of matches.
function countScoreFreq(matches) {
  const freq = {}
  matches.forEach(m => {
    const { h, a } = canonicalScore(m)
    const key = scoreKey(h, a)
    freq[key] = (freq[key] || 0) + 1
  })
  return freq
}

function estimateTeamStrength(history, isHomeTeam) {
  const base = history.slice(0, 12)
  if (!base.length) {
    return { scored: 1.25, conceded: 1.25, cleanRate: 0.2, failRate: 0.25, drawRate: 0.25 }
  }
  // Always use perspective-corrected myGoals/theirGoals
  const scored    = weightedAvg(base.map(m => resolveGoals(m).my))
  const conceded  = weightedAvg(base.map(m => resolveGoals(m).their))
  const cleanRate = base.filter(m => resolveGoals(m).their === 0).length / base.length
  const failRate  = base.filter(m => resolveGoals(m).my    === 0).length / base.length
  const drawRate  = base.filter(m => {
    const g = resolveGoals(m)
    return g.my === g.their
  }).length / base.length

  void isHomeTeam // kept for call-site symmetry; perspective already in myGoals
  return {
    scored:    clamp(scored,   0.2, 3.6),
    conceded:  clamp(conceded, 0.2, 3.6),
    cleanRate,
    failRate,
    drawRate,
  }
}

function normalizeProbs(rows, targetTotal = 88) {
  const total = rows.reduce((s, r) => s + r.probability, 0)
  if (total <= 0) return rows
  return rows.map(r => ({ ...r, probability: (r.probability / total) * targetTotal }))
}

// ---------------------------------------------------------------------------
// Calendar pattern detection for H2H scorelines.
// Returns a map of score key → accumulated calendar weight.
// Weights: same-month (1), 1-year cycle ±3d (3), 2-year exact (4), 3-year ±3d (3).
// ---------------------------------------------------------------------------
function calendarScoreHits(h2hHistory, today) {
  const hits = {}
  const todayMonth = today.getMonth()
  const todayDay   = today.getDate()
  const todayYear  = today.getFullYear()

  for (const match of h2hHistory) {
    if (!match?.date) continue
    const d = match.date instanceof Date ? match.date : new Date(match.date)
    if (Number.isNaN(d.getTime())) continue

    const matchMonth = d.getMonth()
    const matchDay   = d.getDate()
    const matchYear  = d.getFullYear()
    const yearsAgo   = todayYear - matchYear
    const dayDiff    = Math.abs(matchDay - todayDay)
    const sameMonth  = matchMonth === todayMonth

    let weight = 0
    if      (yearsAgo === 1 && sameMonth && dayDiff <= 3)              weight = 3  // 1-year cycle
    else if (yearsAgo === 2 && sameMonth && matchDay === todayDay)     weight = 4  // 2-year exact
    else if (yearsAgo === 3 && sameMonth && dayDiff <= 3)              weight = 3  // 3-year cycle
    else if (sameMonth)                                                weight = 1  // same calendar month

    if (weight > 0) {
      const { h, a } = canonicalScore(match)
      const key = scoreKey(h, a)
      hits[key] = (hits[key] || 0) + weight
    }
  }
  return hits
}

// Non-linear H2H score bonus — repeated exact scorelines get strongly amplified.
function h2hScoreBonus(count) {
  if (count <= 0) return 0
  if (count >= 3) return count * 2.8
  if (count >= 2) return count * 2.0
  return count * 1.2
}

export function predictScores(homeHistory, awayHistory, h2h = [], today = new Date()) {
  const home = estimateTeamStrength(homeHistory, true)
  const away = estimateTeamStrength(awayHistory, false)

  // Use ALL H2H history — older meetings are still relevant for correct score
  const h2hAll   = h2h || []
  const h2hCount = h2hAll.length

  // H2H goal averages use myGoals (home team's perspective = home team's scored) / theirGoals
  const h2hHomeGoals = h2hCount
    ? weightedAvg(h2hAll.map(m => resolveGoals(m).my))
    : null
  const h2hAwayGoals = h2hCount
    ? weightedAvg(h2hAll.map(m => resolveGoals(m).their))
    : null

  // Adaptive H2H weight on lambda — scales with available data
  const h2hLambdaWeight =
    h2hCount >= 5 ? 0.40 :
    h2hCount >= 3 ? 0.28 :
    h2hCount >= 1 ? 0.15 : 0
  const formWeight = 1 - h2hLambdaWeight

  // Form blend (home attack vs away defence, away attack vs home defence)
  let lambdaHome = (home.scored * 0.53 + away.conceded * 0.35 + 0.12) * formWeight
  let lambdaAway = (away.scored * 0.50 + home.conceded * 0.33 + 0.10) * formWeight

  // H2H lambda contribution
  if (h2hHomeGoals !== null) lambdaHome += h2hHomeGoals * h2hLambdaWeight
  if (h2hAwayGoals !== null) lambdaAway += h2hAwayGoals * h2hLambdaWeight

  // Explicit home advantage
  lambdaHome *= 1.07
  lambdaAway *= 0.94

  // Goal suppression / clean-sheet effects
  lambdaHome *= 1 - (away.cleanRate * 0.08) + (home.failRate * -0.04)
  lambdaAway *= 1 - (home.cleanRate * 0.08) + (away.failRate * -0.04)

  lambdaHome = clamp(lambdaHome, 0.25, 3.8)
  lambdaAway = clamp(lambdaAway, 0.25, 3.8)

  // Draw tendency signal — combined draw rate from both teams' recent form
  const drawTendency = clamp((home.drawRate + away.drawRate) / 2, 0, 0.6)

  const maxGoals = 6
  const rows = []
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      let p = poisson(h, lambdaHome) * poisson(a, lambdaAway) * 100

      // Draw tendency boost for X:X scorelines
      if (h === a && drawTendency > 0.25) {
        p *= 1 + (drawTendency - 0.25) * 0.6
      }

      if (p < 0.12) continue
      rows.push({
        score:     scoreKey(h, a),
        homeGoals: h,
        awayGoals: a,
        probability: p,
        result: h > a ? 'H' : h < a ? 'A' : 'D',
      })
    }
  }

  // Empirical correction from historical exact scores (canonical home:away scorelines)
  const homeFreq = countScoreFreq(homeHistory.slice(0, 15))
  const awayFreq = countScoreFreq(awayHistory.slice(0, 15))
  const h2hFreq  = countScoreFreq(h2hAll)

  // Calendar-weighted H2H score hits
  const calHits = calendarScoreHits(h2hAll, today)

  rows.forEach(r => {
    const hf = homeFreq[r.score] || 0
    const af = awayFreq[r.score] || 0
    const hh = h2hFreq[r.score] || 0
    const ch = calHits[r.score]  || 0

    const bonus =
      hf * 0.25 +
      af * 0.25 +
      h2hScoreBonus(hh) +   // non-linear H2H exact-score pull
      ch * 0.8              // calendar cycle bonus

    const lowScoreBoost = (r.homeGoals <= 2 && r.awayGoals <= 2) ? 1.04 : 0.97
    r.historicalHits = hf + af + hh
    r.probability = clamp((r.probability + bonus) * lowScoreBoost, 0, 40)
  })

  rows.sort((a, b) => b.probability - a.probability)
  const top = normalizeProbs(rows.slice(0, 12), 88).sort((a, b) => b.probability - a.probability)

  const homeWinProb = top.filter(r => r.result === 'H').reduce((s, r) => s + r.probability, 0)
  const drawProb    = top.filter(r => r.result === 'D').reduce((s, r) => s + r.probability, 0)
  const awayWinProb = top.filter(r => r.result === 'A').reduce((s, r) => s + r.probability, 0)

  return {
    scores: top,
    lambdaHome:   Number(lambdaHome.toFixed(2)),
    lambdaAway:   Number(lambdaAway.toFixed(2)),
    homeWinProb:  Math.round(homeWinProb),
    drawProb:     Math.round(drawProb),
    awayWinProb:  Math.round(awayWinProb),
  }
}
