/**
 * football-data.org API v4 adapter
 *
 * Translates football-data.org responses into the same shape the frontend expects
 * (matching the API-Football / db format used throughout the app).
 *
 * Free tier: 10 requests/min, covers top European leagues.
 * Auth: X-Auth-Token header.
 *
 * Docs: https://docs.football-data.org/general/v4/index.html
 */

const BASE = 'https://api.football-data.org/v4'

// football-data.org competition codes → our internal league IDs & names
const COMP_MAP = {
  PL:  { id: 39,  name: 'Premier League',   country: 'England' },
  PD:  { id: 140, name: 'La Liga',          country: 'Spain' },
  BL1: { id: 78,  name: 'Bundesliga',       country: 'Germany' },
  SA:  { id: 135, name: 'Serie A',          country: 'Italy' },
  FL1: { id: 61,  name: 'Ligue 1',          country: 'France' },
  ELC: { id: 40,  name: 'Championship',     country: 'England' },
  PPL: { id: 94,  name: 'Primeira Liga',    country: 'Portugal' },
  DED: { id: 88,  name: 'Eredivisie',       country: 'Netherlands' },
  CL:  { id: 2,   name: 'Champions League', country: 'World' },
  EC:  { id: 3,   name: 'Europa League',    country: 'World' },
}

// Free tier competitions (as of 2024/2025)
const FREE_COMPS = ['PL', 'BL1', 'SA', 'PD', 'FL1', 'ELC', 'PPL', 'DED', 'CL', 'EC']

// Match status mapping: football-data.org → our short codes
const STATUS_MAP = {
  SCHEDULED: 'NS',
  TIMED: 'NS',
  IN_PLAY: '2H',
  PAUSED: 'HT',
  EXTRA_TIME: 'ET',
  PENALTY_SHOOTOUT: 'P',
  FINISHED: 'FT',
  SUSPENDED: 'SUSP',
  POSTPONED: 'PST',
  CANCELLED: 'CANC',
  AWARDED: 'AWD',
}

class FootballDataOrg {
  constructor(apiKey, cacheInstance = null) {
    this.apiKey = apiKey
    this.cache = cacheInstance
  }

  async _fetch(path, ttl = 300) {
    const url = `${BASE}${path}`

    // Check cache
    if (this.cache) {
      const cached = this.cache.get(`fdo:${url}`)
      if (cached !== undefined) return cached
    }

    const res = await fetch(url, {
      headers: { 'X-Auth-Token': this.apiKey },
    })

    if (res.status === 429) {
      throw new Error('football-data.org rate limit exceeded (10 req/min on free tier)')
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(`football-data.org ${res.status}: ${body.slice(0, 200)}`)
    }

    const json = await res.json()
    if (this.cache) this.cache.set(`fdo:${url}`, json, ttl)
    return json
  }

  // ─── Matches by date ──────────────────────────────────────────────────

  async getMatchesByDate(dateStr) {
    // dateStr = 'YYYY-MM-DD'
    const comps = FREE_COMPS.join(',')
    const json = await this._fetch(
      `/matches?dateFrom=${dateStr}&dateTo=${dateStr}&competitions=${comps}`,
      300
    )
    return (json.matches || []).map(m => this._mapMatch(m))
  }

  // ─── Single match ─────────────────────────────────────────────────────

  async getMatch(matchId) {
    const json = await this._fetch(`/matches/${matchId}`, 120)
    return this._mapMatch(json)
  }

  // ─── Head to head ─────────────────────────────────────────────────────

  async getH2H(matchId, limit = 10) {
    const json = await this._fetch(`/matches/${matchId}/head2head?limit=${limit}`, 1800)
    return (json.matches || []).map(m => this._mapMatch(m))
  }

  // ─── Team matches ─────────────────────────────────────────────────────

  async getTeamMatches(teamId, { status = 'FINISHED', limit = 10 } = {}) {
    const json = await this._fetch(
      `/teams/${teamId}/matches?status=${status}&limit=${limit}`,
      900
    )
    return (json.matches || []).map(m => this._mapMatch(m))
  }

  // ─── Competition standings ────────────────────────────────────────────

  async getStandings(compCode) {
    const json = await this._fetch(`/competitions/${compCode}/standings`, 3600)
    return json.standings || []
  }

  // ─── Competition top scorers ──────────────────────────────────────────

  async getTopScorers(compCode, limit = 20) {
    const json = await this._fetch(`/competitions/${compCode}/scorers?limit=${limit}`, 3600)
    return (json.scorers || []).map(s => ({
      player: {
        id: s.player?.id,
        name: s.player?.name,
        nationality: s.player?.nationality,
        position: s.player?.position,
        dateOfBirth: s.player?.dateOfBirth,
      },
      team: {
        id: s.team?.id,
        name: s.team?.name,
        crest: s.team?.crest,
      },
      goals: s.goals || 0,
      assists: s.assists || 0,
      penalties: s.penalties || 0,
      playedMatches: s.playedMatches || 0,
    }))
  }

  // ─── Team details (squad) ─────────────────────────────────────────────

  async getTeam(teamId) {
    const json = await this._fetch(`/teams/${teamId}`, 3600)
    return {
      id: json.id,
      name: json.name,
      shortName: json.shortName,
      tla: json.tla,
      crest: json.crest,
      venue: json.venue,
      founded: json.founded,
      coach: json.coach ? { id: json.coach.id, name: json.coach.name } : null,
      squad: (json.squad || []).map(p => ({
        id: p.id,
        name: p.name,
        position: p.position,
        nationality: p.nationality,
        dateOfBirth: p.dateOfBirth,
      })),
    }
  }

  // ─── Competitions list ────────────────────────────────────────────────

  async getCompetitions() {
    const json = await this._fetch('/competitions', 86400)
    return (json.competitions || []).map(c => ({
      id: c.id,
      code: c.code,
      name: c.name,
      country: c.area?.name,
      emblem: c.emblem,
      type: c.type,
    }))
  }

  // ─── Internal: map a football-data.org match → our fixture shape ──────

  _mapMatch(m) {
    const comp = COMP_MAP[m.competition?.code] || {
      id: m.competition?.id || 0,
      name: m.competition?.name || 'Unknown',
      country: m.area?.name || '',
    }

    const status = STATUS_MAP[m.status] || m.status || 'NS'
    const isLive = ['1H', 'HT', '2H', 'ET', 'P'].includes(status)
    const date = m.utcDate || null
    const homeGoals = m.score?.fullTime?.home ?? null
    const awayGoals = m.score?.fullTime?.away ?? null
    const htHome = m.score?.halfTime?.home ?? null
    const htAway = m.score?.halfTime?.away ?? null

    return {
      id: m.id,
      league: {
        id: comp.id,
        name: comp.name,
        country: comp.country,
        season: m.season?.startDate ? Number(m.season.startDate.slice(0, 4)) : null,
        flag: null,
        countryCode: null,
        logo: m.competition?.emblem || null,
        top: [39, 140, 78, 135, 61].includes(comp.id),
      },
      homeTeam: {
        id: m.homeTeam?.id,
        name: m.homeTeam?.name || '-',
        short: (m.homeTeam?.tla || m.homeTeam?.name?.substring(0, 3) || '').toUpperCase(),
        logo: m.homeTeam?.crest || null,
      },
      awayTeam: {
        id: m.awayTeam?.id,
        name: m.awayTeam?.name || '-',
        short: (m.awayTeam?.tla || m.awayTeam?.name?.substring(0, 3) || '').toUpperCase(),
        logo: m.awayTeam?.crest || null,
      },
      homeTeamId: m.homeTeam?.id,
      awayTeamId: m.awayTeam?.id,
      date,
      time: date
        ? new Date(date).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' })
        : null,
      status,
      isLive,
      homeGoals,
      awayGoals,
      elapsed: null, // not available in football-data.org free tier
      htHome,
      htAway,
      venue: m.venue || null,
      referee: m.referees?.[0]?.name || null,
      // Extra fields from football-data.org
      matchday: m.matchday || null,
      stage: m.stage || null,
    }
  }
}

export { FootballDataOrg, COMP_MAP, FREE_COMPS }
