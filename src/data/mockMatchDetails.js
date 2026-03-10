import { ALL_FIXTURES } from './mockData.js'

const TEAM_IDS = new Map()

function keyForTeam(team) {
  return String(team?.name || team?.short || 'team').toLowerCase()
}

function teamId(team) {
  const key = keyForTeam(team)
  if (!TEAM_IDS.has(key)) TEAM_IDS.set(key, TEAM_IDS.size + 1001)
  return TEAM_IDS.get(key)
}

function seeded(seed) {
  const x = Math.sin(seed) * 10000
  return x - Math.floor(x)
}

function toDateOnly(value) {
  try {
    return new Date(value).toISOString().split('T')[0]
  } catch {
    return ''
  }
}

export function getMockFixturesByDate(dateStr) {
  return ALL_FIXTURES
    .filter(f => toDateOnly(f.date) === dateStr)
    .map(f => mapFixture(f))
}

export function getMockFixtureById(fixtureId) {
  const n = Number(fixtureId)
  return ALL_FIXTURES.find(f => Number(f.id) === n) || null
}

function mapFixture(f) {
  const hId = teamId(f.homeTeam)
  const aId = teamId(f.awayTeam)
  return {
    id: f.id,
    league: {
      id: f.league.id,
      name: f.league.name,
      country: f.league.country,
      flag: f.league.flag,
      logo: null,
      top: Boolean(f.league.top),
    },
    homeTeam: {
      id: hId,
      name: f.homeTeam.name,
      short: f.homeTeam.short,
      logo: f.homeTeam.logo || null,
    },
    awayTeam: {
      id: aId,
      name: f.awayTeam.name,
      short: f.awayTeam.short,
      logo: f.awayTeam.logo || null,
    },
    homeTeamId: hId,
    awayTeamId: aId,
    date: (f.date instanceof Date ? f.date : new Date(f.date)).toISOString(),
    time: f.time,
    status: f.status === 'LIVE' ? '1H' : f.status,
    isLive: Boolean(f.isLive),
    homeGoals: f.homeGoals ?? null,
    awayGoals: f.awayGoals ?? null,
    elapsed: f.elapsed ?? null,
    htHome: Math.floor((f.homeGoals || 0) / 2),
    htAway: Math.floor((f.awayGoals || 0) / 2),
    venue: `${f.homeTeam.name} Stadium`,
    referee: 'Mock Referee',
  }
}

function normalizeHistory(history = [], fixture) {
  return history.map((m, idx) => {
    const homeGoals = Number(m.homeGoals) || 0
    const awayGoals = Number(m.awayGoals) || 0
    const isHome = Boolean(m.isHome)
    const myGoals = m.myGoals != null ? Number(m.myGoals) : (isHome ? homeGoals : awayGoals)
    const theirGoals = m.theirGoals != null ? Number(m.theirGoals) : (isHome ? awayGoals : homeGoals)
    const result = m.result || (myGoals > theirGoals ? 'W' : myGoals < theirGoals ? 'L' : 'D')

    return {
      fixtureId: m.fixtureId ?? Number(`${fixture.id}${idx + 1}`),
      date: m.date || new Date().toISOString(),
      opponent: m.opponent || 'Opponent',
      opponentLogo: m.opponentLogo || null,
      opponentId: m.opponentId || 0,
      isHome,
      homeGoals,
      awayGoals,
      myGoals,
      theirGoals,
      goals: m.goals ?? (homeGoals + awayGoals),
      btts: m.btts ?? (homeGoals > 0 && awayGoals > 0),
      result,
      corners: Number(m.corners) || 0,
      fouls: Number(m.fouls) || 0,
      cards: Number(m.cards) || 0,
      offsides: Number(m.offsides) || 0,
      shots: Number(m.shots) || 0,
      firstHalfGoals: Number(m.firstHalfGoals) || 0,
      secondHalfGoals: Number(m.secondHalfGoals) || 0,
      bothHalvesGoals: Boolean(m.bothHalvesGoals),
      league: m.league || { id: fixture.league.id, name: fixture.league.name, logo: null },
    }
  })
}

function normalizeH2H(h2h = [], fixture) {
  return h2h.map((m, idx) => {
    const homeGoals = Number(m.homeGoals) || 0
    const awayGoals = Number(m.awayGoals) || 0
    const isHome = m.homeTeamName === fixture.homeTeam.name
    const opponent = isHome ? m.awayTeamName : m.homeTeamName
    const result = homeGoals === awayGoals
      ? 'D'
      : (isHome ? homeGoals > awayGoals : awayGoals > homeGoals) ? 'W' : 'L'

    return {
      fixtureId: Number(`${fixture.id}9${idx + 1}`),
      date: m.date || new Date().toISOString(),
      opponent: opponent || 'Opponent',
      opponentLogo: null,
      opponentId: 0,
      isHome,
      homeGoals,
      awayGoals,
      myGoals: isHome ? homeGoals : awayGoals,
      theirGoals: isHome ? awayGoals : homeGoals,
      goals: m.goals ?? (homeGoals + awayGoals),
      btts: m.btts ?? (homeGoals > 0 && awayGoals > 0),
      result,
      corners: Number(m.corners) || 0,
      fouls: Number(m.fouls) || 0,
      cards: Number(m.cards) || 0,
      offsides: Number(m.offsides) || 0,
      shots: Number(m.shots) || 0,
      firstHalfGoals: Number(m.firstHalfGoals) || 0,
      secondHalfGoals: Number(m.secondHalfGoals) || 0,
      bothHalvesGoals: Number(m.firstHalfGoals) > 0 && Number(m.secondHalfGoals) > 0,
      league: { id: fixture.league.id, name: fixture.league.name, logo: null },
    }
  })
}

function statAverage(list, field, fallback = 0) {
  if (!list.length) return fallback
  const sum = list.reduce((acc, item) => acc + (Number(item[field]) || 0), 0)
  return Math.round(sum / list.length)
}

function buildStatistics(fixture, homeHistory, awayHistory) {
  const seed = Number(fixture.id) || 1
  const hPos = 44 + Math.round(seeded(seed + 1) * 16)
  const aPos = 100 - hPos
  const homeShotsOn = Math.max(2, statAverage(homeHistory, 'shots', 8) - 2)
  const awayShotsOn = Math.max(1, statAverage(awayHistory, 'shots', 7) - 3)

  return {
    home: {
      teamId: fixture.homeTeam.id,
      teamName: fixture.homeTeam.name,
      teamLogo: fixture.homeTeam.logo || null,
      shots: homeShotsOn,
      shotsTotal: homeShotsOn + 4,
      corners: Math.max(2, statAverage(homeHistory, 'corners', 10) - 5),
      fouls: Math.max(4, statAverage(homeHistory, 'fouls', 22) - 10),
      yellowCards: Math.max(0, statAverage(homeHistory, 'cards', 4) - 1),
      redCards: seeded(seed + 2) > 0.88 ? 1 : 0,
      offsides: Math.max(0, statAverage(homeHistory, 'offsides', 4) - 1),
      possession: hPos,
      passes: 410 + Math.round(seeded(seed + 3) * 140),
      passAccuracy: 82 + Math.round(seeded(seed + 4) * 9),
      saves: 1 + Math.round(seeded(seed + 5) * 3),
      blocks: 1 + Math.round(seeded(seed + 6) * 4),
      xg: Math.round((1.1 + seeded(seed + 7) * 1.8) * 100) / 100,
    },
    away: {
      teamId: fixture.awayTeam.id,
      teamName: fixture.awayTeam.name,
      teamLogo: fixture.awayTeam.logo || null,
      shots: awayShotsOn,
      shotsTotal: awayShotsOn + 3,
      corners: Math.max(1, statAverage(awayHistory, 'corners', 9) - 5),
      fouls: Math.max(5, statAverage(awayHistory, 'fouls', 21) - 10),
      yellowCards: Math.max(0, statAverage(awayHistory, 'cards', 4) - 1),
      redCards: seeded(seed + 8) > 0.9 ? 1 : 0,
      offsides: Math.max(0, statAverage(awayHistory, 'offsides', 4) - 1),
      possession: aPos,
      passes: 380 + Math.round(seeded(seed + 9) * 130),
      passAccuracy: 80 + Math.round(seeded(seed + 10) * 8),
      saves: 1 + Math.round(seeded(seed + 11) * 3),
      blocks: 1 + Math.round(seeded(seed + 12) * 4),
      xg: Math.round((0.8 + seeded(seed + 13) * 1.7) * 100) / 100,
    },
  }
}

function buildEvents(fixture) {
  const homeGoals = Math.max(0, Number(fixture.homeGoals) || 0)
  const awayGoals = Math.max(0, Number(fixture.awayGoals) || 0)
  const events = []

  for (let i = 0; i < homeGoals; i += 1) {
    events.push({
      time: 18 + i * 17,
      timeExtra: null,
      team: { id: fixture.homeTeam.id, name: fixture.homeTeam.name, logo: fixture.homeTeam.logo || null },
      player: { id: 10 + i, name: `${fixture.homeTeam.short || 'H'} Forward ${i + 1}` },
      assist: i % 2 === 0 ? { id: 50 + i, name: `${fixture.homeTeam.short || 'H'} Assist ${i + 1}` } : null,
      type: 'Goal',
      detail: i % 3 === 0 ? 'Normal Goal' : 'Penalty',
      comments: null,
    })
  }

  for (let i = 0; i < awayGoals; i += 1) {
    events.push({
      time: 26 + i * 19,
      timeExtra: null,
      team: { id: fixture.awayTeam.id, name: fixture.awayTeam.name, logo: fixture.awayTeam.logo || null },
      player: { id: 90 + i, name: `${fixture.awayTeam.short || 'A'} Forward ${i + 1}` },
      assist: null,
      type: 'Goal',
      detail: 'Normal Goal',
      comments: null,
    })
  }

  events.push({
    time: 52,
    timeExtra: null,
    team: { id: fixture.homeTeam.id, name: fixture.homeTeam.name, logo: fixture.homeTeam.logo || null },
    player: { id: 501, name: `${fixture.homeTeam.short || 'H'} Midfielder` },
    assist: null,
    type: 'Card',
    detail: 'Yellow Card',
    comments: null,
  })
  events.push({
    time: 71,
    timeExtra: null,
    team: { id: fixture.awayTeam.id, name: fixture.awayTeam.name, logo: fixture.awayTeam.logo || null },
    player: { id: 601, name: `${fixture.awayTeam.short || 'A'} Substitute` },
    assist: null,
    type: 'subst',
    detail: 'Substitution 1',
    comments: null,
  })

  return events.sort((a, b) => (a.time || 0) - (b.time || 0))
}

function formationRows(formation) {
  const parsed = String(formation || '4-3-3').split('-').map(Number).filter(Boolean)
  return [1, ...parsed]
}

function buildStartXI(short, formation) {
  const rows = formationRows(formation)
  const startXI = []
  rows.forEach((count, rowIndex) => {
    for (let i = 1; i <= count; i += 1) {
      startXI.push({
        id: Number(`${rowIndex + 1}${i}`),
        name: `${short} Player ${rowIndex + 1}${i}`,
        number: rowIndex === 0 ? 1 : rowIndex * 3 + i + 1,
        pos: rowIndex === 0 ? 'G' : rowIndex === 1 ? 'D' : rowIndex === rows.length - 1 ? 'F' : 'M',
        grid: `${i}:${rowIndex + 1}`,
      })
    }
  })
  return startXI.slice(0, 11)
}

function buildBench(short) {
  return Array.from({ length: 8 }, (_, idx) => ({
    id: 200 + idx,
    name: `${short} Bench ${idx + 1}`,
    number: 20 + idx,
    pos: idx < 1 ? 'G' : idx < 4 ? 'D' : idx < 6 ? 'M' : 'F',
    grid: null,
  }))
}

function buildLineups(fixture) {
  const seed = Number(fixture.id) || 1
  const formations = ['4-3-3', '4-2-3-1', '3-5-2', '4-4-2']
  const homeFormation = formations[Math.floor(seeded(seed + 20) * formations.length)]
  const awayFormation = formations[Math.floor(seeded(seed + 30) * formations.length)]

  return [
    {
      team: {
        id: fixture.homeTeam.id,
        name: fixture.homeTeam.name,
        logo: fixture.homeTeam.logo || null,
        colors: null,
      },
      coach: { id: 1, name: `${fixture.homeTeam.name} Coach`, photo: null },
      formation: homeFormation,
      startXI: buildStartXI(fixture.homeTeam.short || 'HOME', homeFormation),
      substitutes: buildBench(fixture.homeTeam.short || 'HOME'),
    },
    {
      team: {
        id: fixture.awayTeam.id,
        name: fixture.awayTeam.name,
        logo: fixture.awayTeam.logo || null,
        colors: null,
      },
      coach: { id: 2, name: `${fixture.awayTeam.name} Coach`, photo: null },
      formation: awayFormation,
      startXI: buildStartXI(fixture.awayTeam.short || 'AWAY', awayFormation),
      substitutes: buildBench(fixture.awayTeam.short || 'AWAY'),
    },
  ]
}

export function buildMockMatchDetails(fixtureId) {
  const baseFixture = getMockFixtureById(fixtureId) || ALL_FIXTURES[0]
  if (!baseFixture) throw new Error('Mock match not found')

  const fixture = mapFixture(baseFixture)
  const homeHistory = normalizeHistory(baseFixture.homeHistory || [], fixture)
  const awayHistory = normalizeHistory(baseFixture.awayHistory || [], fixture)
  const h2h = normalizeH2H(baseFixture.h2h || [], fixture)

  return {
    fixture,
    statistics: buildStatistics(fixture, homeHistory, awayHistory),
    events: buildEvents(fixture),
    lineups: buildLineups(fixture),
    homeHistory,
    awayHistory,
    h2h,
  }
}

export function getMockTeamHistory(teamId, count = 10) {
  const fixture = ALL_FIXTURES.find(f => teamId === teamIdForFixture(f, true) || teamId === teamIdForFixture(f, false))
  if (!fixture) return []

  const isHomeTeam = teamId === teamIdForFixture(fixture, true)
  const details = buildMockMatchDetails(fixture.id)
  const list = isHomeTeam ? details.homeHistory : details.awayHistory
  return list.slice(0, Math.max(1, count))
}

function teamIdForFixture(fixture, isHome) {
  return isHome ? teamId(fixture.homeTeam) : teamId(fixture.awayTeam)
}

export function getMockH2H(team1, team2, count = 10) {
  const fixture = ALL_FIXTURES.find(f => {
    const hId = teamIdForFixture(f, true)
    const aId = teamIdForFixture(f, false)
    return (hId === team1 && aId === team2) || (hId === team2 && aId === team1)
  })
  if (!fixture) return []

  return buildMockMatchDetails(fixture.id).h2h.slice(0, Math.max(1, count))
}
