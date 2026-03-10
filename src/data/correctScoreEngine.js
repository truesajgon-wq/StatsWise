// Correct Score Prediction Engine
// Deterministic model using weighted historical form + Poisson + empirical correction.

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
  // More weight to recent games (index 0 is newest)
  return Array.from({ length: n }, (_, i) => Math.pow(0.86, i))
}

function weightedAvg(values) {
  if (!values.length) return 0
  const w = recentWeights(values.length)
  const num = values.reduce((s, v, i) => s + v * w[i], 0)
  const den = w.reduce((s, x) => s + x, 0)
  return den > 0 ? num / den : 0
}

function getMyGoals(match, isHomeTeam) {
  return isHomeTeam ? Number(match?.homeGoals || 0) : Number(match?.awayGoals || 0)
}

function getOppGoals(match, isHomeTeam) {
  return isHomeTeam ? Number(match?.awayGoals || 0) : Number(match?.homeGoals || 0)
}

function scoreKey(h, a) {
  return `${h}:${a}`
}

function countScoreFreq(matches, isHomeTeamPerspective) {
  const freq = {}
  matches.forEach(m => {
    const h = isHomeTeamPerspective ? getMyGoals(m, true) : getOppGoals(m, false)
    const a = isHomeTeamPerspective ? getOppGoals(m, true) : getMyGoals(m, false)
    const key = scoreKey(h, a)
    freq[key] = (freq[key] || 0) + 1
  })
  return freq
}

function estimateTeamStrength(history, isHomeTeam) {
  const base = history.slice(0, 12)
  if (!base.length) return { scored: 1.25, conceded: 1.25, cleanRate: 0.2, failRate: 0.25 }

  const scored = weightedAvg(base.map(m => getMyGoals(m, isHomeTeam)))
  const conceded = weightedAvg(base.map(m => getOppGoals(m, isHomeTeam)))
  const cleanRate = base.filter(m => getOppGoals(m, isHomeTeam) === 0).length / base.length
  const failRate = base.filter(m => getMyGoals(m, isHomeTeam) === 0).length / base.length

  return {
    scored: clamp(scored, 0.2, 3.6),
    conceded: clamp(conceded, 0.2, 3.6),
    cleanRate,
    failRate,
  }
}

function normalizeProbs(rows, targetTotal = 88) {
  const total = rows.reduce((s, r) => s + r.probability, 0)
  if (total <= 0) return rows
  return rows.map(r => ({ ...r, probability: (r.probability / total) * targetTotal }))
}

export function predictScores(homeHistory, awayHistory, h2h = []) {
  const home = estimateTeamStrength(homeHistory, true)
  const away = estimateTeamStrength(awayHistory, false)

  const h2hSlice = (h2h || []).slice(0, 10)
  const h2hHomeGoals = h2hSlice.length
    ? weightedAvg(h2hSlice.map(m => Number(m?.homeGoals || 0)))
    : null
  const h2hAwayGoals = h2hSlice.length
    ? weightedAvg(h2hSlice.map(m => Number(m?.awayGoals || 0)))
    : null

  // Form blend (home attack vs away concede, away attack vs home concede)
  let lambdaHome = home.scored * 0.53 + away.conceded * 0.35 + 0.12
  let lambdaAway = away.scored * 0.50 + home.conceded * 0.33 + 0.10

  // H2H correction, limited impact
  if (h2hHomeGoals !== null) lambdaHome = lambdaHome * 0.85 + h2hHomeGoals * 0.15
  if (h2hAwayGoals !== null) lambdaAway = lambdaAway * 0.85 + h2hAwayGoals * 0.15

  // Goal suppression / clean-sheet effects
  lambdaHome *= 1 - (away.cleanRate * 0.08) + (home.failRate * -0.04)
  lambdaAway *= 1 - (home.cleanRate * 0.08) + (away.failRate * -0.04)

  lambdaHome = clamp(lambdaHome, 0.25, 3.8)
  lambdaAway = clamp(lambdaAway, 0.25, 3.8)

  const maxGoals = 6
  const rows = []
  for (let h = 0; h <= maxGoals; h++) {
    for (let a = 0; a <= maxGoals; a++) {
      let p = poisson(h, lambdaHome) * poisson(a, lambdaAway) * 100
      if (p < 0.12) continue
      rows.push({
        score: scoreKey(h, a),
        homeGoals: h,
        awayGoals: a,
        probability: p,
        result: h > a ? 'H' : h < a ? 'A' : 'D',
      })
    }
  }

  // Empirical correction from historical exact scores
  const homeFreq = countScoreFreq(homeHistory.slice(0, 15), true)
  const awayFreq = countScoreFreq(awayHistory.slice(0, 15), false)
  const h2hFreq = countScoreFreq(h2hSlice, true)

  rows.forEach(r => {
    const hf = homeFreq[r.score] || 0
    const af = awayFreq[r.score] || 0
    const hh = h2hFreq[r.score] || 0
    const bonus = hf * 0.25 + af * 0.25 + hh * 0.7
    const lowScoreBoost = (r.homeGoals <= 2 && r.awayGoals <= 2) ? 1.04 : 0.97
    r.historicalHits = hf + af + hh
    r.probability = clamp((r.probability + bonus) * lowScoreBoost, 0, 40)
  })

  rows.sort((a, b) => b.probability - a.probability)
  const top = normalizeProbs(rows.slice(0, 12), 88).sort((a, b) => b.probability - a.probability)

  const homeWinProb = top.filter(r => r.result === 'H').reduce((s, r) => s + r.probability, 0)
  const drawProb = top.filter(r => r.result === 'D').reduce((s, r) => s + r.probability, 0)
  const awayWinProb = top.filter(r => r.result === 'A').reduce((s, r) => s + r.probability, 0)

  return {
    scores: top,
    lambdaHome: Number(lambdaHome.toFixed(2)),
    lambdaAway: Number(lambdaAway.toFixed(2)),
    homeWinProb: Math.round(homeWinProb),
    drawProb: Math.round(drawProb),
    awayWinProb: Math.round(awayWinProb),
  }
}
