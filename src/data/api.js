import {
  buildMockMatchDetails,
  getMockFixturesByDate,
  getMockTeamHistory,
  getMockH2H,
} from './mockMatchDetails.js'
import { getAppTodayIso } from '../utils/appDate.js'

const API_BASE = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') || ''
const USE_MOCK_DATA = ['1', 'true', 'yes', 'on'].includes(
  String(import.meta.env.VITE_USE_MOCK_DATA || '').toLowerCase()
)
let accessTokenGetter = null

export function isMockMode() {
  return USE_MOCK_DATA
}

export function setApiAccessTokenGetter(getter) {
  accessTokenGetter = typeof getter === 'function' ? getter : null
}

async function buildAuthHeaders() {
  if (!accessTokenGetter) return {}
  const token = await accessTokenGetter()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiFetch(path, query = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin)
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  })

  const headers = await buildAuthHeaders()
  const res = await fetch(url.toString(), { headers })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(body.error || `HTTP ${res.status}`)
  }

  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Unknown API error')
  return json.data
}

async function apiPost(path, body = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin)
  const authHeaders = await buildAuthHeaders()
  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const payload = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error(payload.error || `HTTP ${res.status}`)
  }
  const json = await res.json()
  if (!json.success) throw new Error(json.error || 'Unknown API error')
  return json.data
}

export const TOP_LEAGUE_IDS = new Set([39, 140, 78, 135, 61, 106, 88, 94, 2, 3])

export async function fetchFixturesByDate(dateStr) {
  if (USE_MOCK_DATA) return getMockFixturesByDate(dateStr)

  const data = await apiFetch(`/api/matches/${dateStr}`)
  return data.sort((a, b) => {
    const aTop = TOP_LEAGUE_IDS.has(a.league.id) ? 0 : 1
    const bTop = TOP_LEAGUE_IDS.has(b.league.id) ? 0 : 1
    return aTop - bTop
  })
}

export async function fetchTeamHistory(teamId, count = 10, options = {}) {
  if (USE_MOCK_DATA) return getMockTeamHistory(Number(teamId), count)
  const { season, league, leagueName, country, teamName, withStats } = options || {}
  return apiFetch(`/api/teams/${teamId}/last-matches`, {
    count,
    season,
    league,
    leagueName,
    country,
    teamName,
    stats: withStats ? 1 : 0,
  })
}

export async function fetchH2H(homeTeamId, awayTeamId, count = 10, options = {}) {
  if (USE_MOCK_DATA) return getMockH2H(Number(homeTeamId), Number(awayTeamId), count)
  const { season, league, leagueName, country, homeTeamName, awayTeamName } = options || {}
  return apiFetch(`/api/head-to-head/${homeTeamId}/${awayTeamId}`, { count, season, league, leagueName, country, homeTeamName, awayTeamName })
}

export async function fetchFixtureStats(fixtureId, isLive = false) {
  if (USE_MOCK_DATA) return buildMockMatchDetails(fixtureId).statistics
  return apiFetch(`/api/match/${fixtureId}/statistics`, { live: isLive })
}

export async function fetchFixtureEvents(fixtureId, isLive = false) {
  if (USE_MOCK_DATA) return buildMockMatchDetails(fixtureId).events
  return apiFetch(`/api/match/${fixtureId}/events`, { live: isLive })
}

export async function fetchFixtureLineups(fixtureId) {
  if (USE_MOCK_DATA) return buildMockMatchDetails(fixtureId).lineups
  return apiFetch(`/api/match/${fixtureId}/lineups`)
}

export async function fetchMatchDetails(fixtureId, options = {}) {
  if (USE_MOCK_DATA) return buildMockMatchDetails(fixtureId)
  const { date } = options || {}
  const resolvedDate = date || getAppTodayIso()
  return apiFetch(`/api/match/${fixtureId}/details`, { date: resolvedDate })
}

export async function fetchHistoricalStats(fixtureId, options = {}) {
  if (USE_MOCK_DATA) {
    const details = buildMockMatchDetails(fixtureId)
    return {
      homeHistory: details.homeHistory,
      awayHistory: details.awayHistory,
      h2h: details.h2h,
    }
  }
  const { date } = options || {}
  const resolvedDate = date || getAppTodayIso()
  return apiFetch(`/api/match/${fixtureId}/historical-stats`, { date: resolvedDate })
}

export async function searchPlayersApi(search) {
  return apiFetch('/api/players/search', { q: search })
}

export async function fetchTopPlayers(options = {}) {
  const params = {}
  if (options.search) params.search = options.search
  if (options.league) params.league = options.league
  if (options.sort) params.sort = options.sort
  if (options.limit) params.limit = options.limit
  return apiFetch('/api/players/top', params)
}

export async function fetchCountries() {
  return apiFetch('/api/countries')
}

export async function fetchLeagues() {
  return apiFetch('/api/leagues')
}

export async function fetchLeagueTeams(leagueId) {
  return apiFetch(`/api/leagues/${leagueId}/teams`)
}

export async function fetchTeamPlayers(teamId) {
  return apiFetch(`/api/teams/${teamId}/players`)
}

export async function fetchChoiStartingLineup(matchId) {
  return apiFetch(`/api/choistats/starting-lineup/${matchId}`)
}

export async function fetchChoiMatchPlayers(matchId, options = {}) {
  const { clflc = 'abc', isOverall = true } = options || {}
  return apiFetch(`/api/choistats/match/${matchId}/players`, { clflc, isOverall })
}

export async function fetchChoiPlayerStreaks(playerId, options = {}) {
  const { clflc = 'abc' } = options || {}
  return apiFetch(`/api/choistats/player-streaks/${playerId}`, { clflc })
}

export async function fetchChoiPlayerQuickStats(a, b, c, d, options = {}) {
  const { clflc = 'abc' } = options || {}
  return apiFetch(`/api/choistats/player-quick-stats/${a}/${b}/${c}/${d}`, { clflc })
}

export async function fetchEspnNews(limit = 8) {
  if (USE_MOCK_DATA) {
    const now = Date.now()
    const sample = [
      {
        source: 'ESPN',
        title: 'Title race tightens as top clubs prepare for midweek fixtures',
        blurb: 'A look at how recent form and injuries are shaping the final stretch in Europe.',
        url: 'https://www.espn.com/soccer/',
        image: 'https://picsum.photos/seed/espn1/480/260',
        publishedAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
      },
      {
        source: 'ESPN',
        title: 'Manager update: key tactical changes after weekend results',
        blurb: 'Press conference notes and tactical adjustments expected in the next round.',
        url: 'https://www.espn.com/soccer/',
        image: 'https://picsum.photos/seed/espn2/480/260',
        publishedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      },
      {
        source: 'ESPN',
        title: 'Injury watch: latest squad news before big clashes',
        blurb: 'Probable starters and expected absences from major leagues this week.',
        url: 'https://www.espn.com/soccer/',
        image: 'https://picsum.photos/seed/espn3/480/260',
        publishedAt: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
      },
      {
        source: 'ESPN',
        title: 'Transfer notebook: shortlist targets and contract updates',
        blurb: 'Clubs continue planning for the next window with several names linked.',
        url: 'https://www.espn.com/soccer/',
        image: 'https://picsum.photos/seed/espn4/480/260',
        publishedAt: new Date(now - 7 * 60 * 60 * 1000).toISOString(),
      },
      {
        source: 'ESPN',
        title: 'Weekend review: five standout performances',
        blurb: 'Who impressed most and what it means for upcoming fixtures.',
        url: 'https://www.espn.com/soccer/',
        image: 'https://picsum.photos/seed/espn5/480/260',
        publishedAt: new Date(now - 11 * 60 * 60 * 1000).toISOString(),
      },
      {
        source: 'ESPN',
        title: 'Set-piece trends that are deciding close games',
        blurb: 'Data breakdown of corners, free kicks and high-impact moments.',
        url: 'https://www.espn.com/soccer/',
        image: 'https://picsum.photos/seed/espn6/480/260',
        publishedAt: new Date(now - 14 * 60 * 60 * 1000).toISOString(),
      },
      {
        source: 'ESPN',
        title: 'Champions League preview: likely matchups and key duels',
        blurb: 'Early tactical preview for the next set of European ties.',
        url: 'https://www.espn.com/soccer/',
        image: 'https://picsum.photos/seed/espn7/480/260',
        publishedAt: new Date(now - 18 * 60 * 60 * 1000).toISOString(),
      },
      {
        source: 'ESPN',
        title: 'Promotion battle heats up in second divisions',
        blurb: 'A scan of teams with momentum in tight promotion races.',
        url: 'https://www.espn.com/soccer/',
        image: 'https://picsum.photos/seed/espn8/480/260',
        publishedAt: new Date(now - 22 * 60 * 60 * 1000).toISOString(),
      },
    ]
    return sample.slice(0, Math.max(1, limit))
  }
  return apiFetch('/api/news/espn-football', { limit })
}

export async function fetchNewsArticle(url) {
  return apiFetch('/api/news/article', { url })
}

export async function createCheckoutSession({ plan, country, paymentMethod, email }) {
  return apiPost('/api/payments/checkout', { plan, country, paymentMethod, email })
}

export async function fetchCheckoutStatus(sessionId) {
  return apiFetch(`/api/payments/checkout-status/${encodeURIComponent(sessionId)}`)
}

export async function fetchBillingSubscription({ country, locale } = {}) {
  return apiFetch('/api/billing/subscription', { country, locale })
}

export async function createBillingCheckoutSession({ plan, country, locale, paymentMethod }) {
  return apiPost('/api/billing/checkout-session', { plan, country, locale, paymentMethod })
}

export async function cancelBillingSubscription() {
  return apiPost('/api/billing/cancel')
}

export async function startBillingTrial() {
  return apiPost('/api/billing/start-trial')
}

export async function fetchBillingCheckoutStatus(sessionId) {
  return apiFetch(`/api/billing/checkout-status/${encodeURIComponent(sessionId)}`)
}
