import process from 'node:process'
import dotenv from 'dotenv'
import pg from 'pg'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
dotenv.config({ path: path.join(__dirname, '..', '.env') })

const { Pool } = pg

const API_KEY = process.env.API_FOOTBALL_KEY
const DATABASE_URL = process.env.DATABASE_URL
const BASE_URL = 'https://v3.football.api-sports.io'
const TZ = 'Europe/Warsaw'
const ENABLE_HISTORY_BACKFILL = String(process.env.IMPORT_TEAM_HISTORY || '').trim() === '1'
const ENABLE_FIXTURE_STATS = String(process.env.IMPORT_FIXTURE_STATS || '').trim() === '1'
const MAX_FIXTURES_PER_DATE = Number(process.env.IMPORT_MAX_FIXTURES_PER_DATE || 30)
const MAX_PLAYER_FIXTURES_PER_DATE = Number(process.env.IMPORT_MAX_PLAYER_FIXTURES_PER_DATE || 5)

const TOP_LEAGUE_IDS = [39, 140, 78, 135, 61, 106, 88, 94, 2, 3]
const FINISHED_SHORT = new Set(['FT', 'AET', 'PEN'])

if (!API_KEY) throw new Error('API_FOOTBALL_KEY missing in backend/.env')
if (!DATABASE_URL) throw new Error('DATABASE_URL missing in backend/.env')

function dateISO(d = new Date()) {
  return d.toISOString().slice(0, 10)
}

function seasonForDate(d = new Date()) {
  const year = d.getUTCFullYear()
  const month = d.getUTCMonth() + 1
  return month >= 7 ? year : year - 1
}

function seasonLabel(startYear) {
  const y = Number(startYear)
  return `${y}-${y + 1}`
}

async function apiFetch(endpoint, params = {}, attempt = 0) {
  const url = new URL(`${BASE_URL}/${endpoint}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
  })
  const res = await fetch(url.toString(), {
    headers: {
      'x-rapidapi-key': API_KEY,
      'x-rapidapi-host': 'v3.football.api-sports.io',
    },
  })
  if (res.status === 429 && attempt < 3) {
    const waitMs = 65000
    await new Promise(resolve => setTimeout(resolve, waitMs))
    return apiFetch(endpoint, params, attempt + 1)
  }
  if (!res.ok) throw new Error(`API ${endpoint} failed: ${res.status} ${res.statusText}`)
  const json = await res.json()
  if (json?.errors && Object.keys(json.errors).length) {
    const errText = Object.values(json.errors).join(', ')
    if (/too many requests/i.test(errText) && attempt < 3) {
      const waitMs = 65000
      await new Promise(resolve => setTimeout(resolve, waitMs))
      return apiFetch(endpoint, params, attempt + 1)
    }
    throw new Error(`API ${endpoint} error: ${errText}`)
  }
  return Array.isArray(json?.response) ? json.response : []
}

function resultFT(home, away) {
  if (home > away) return 'H'
  if (away > home) return 'A'
  return 'D'
}

function resultForSide(ft, side) {
  if (ft === 'D') return 'D'
  if (side === 'H') return ft === 'H' ? 'W' : 'L'
  return ft === 'A' ? 'W' : 'L'
}

function normalizeStatValue(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim()
  if (!s) return null
  if (s.endsWith('%')) {
    const n = Number.parseFloat(s.slice(0, -1))
    return Number.isFinite(n) ? n : null
  }
  const n = Number.parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function pickStat(statList, key) {
  const row = (statList || []).find(s => String(s?.type || '').toLowerCase() === key.toLowerCase())
  return normalizeStatValue(row?.value)
}

function toInt(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  return Math.trunc(n)
}

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

async function upsertLeague(client, apiLeague) {
  const code = `API-${apiLeague.id}`
  const q = await client.query(
    `
      INSERT INTO leagues (code, name, country, tier)
      VALUES ($1, $2, $3, NULL)
      ON CONFLICT (code)
      DO UPDATE SET name = EXCLUDED.name, country = EXCLUDED.country
      RETURNING id
    `,
    [code, apiLeague.name || code, apiLeague.country || 'Unknown']
  )
  return q.rows[0].id
}

async function upsertSeason(client, startYear) {
  const label = seasonLabel(startYear)
  const q = await client.query(
    `
      INSERT INTO seasons (label, start_year, end_year)
      VALUES ($1, $2, $3)
      ON CONFLICT (label)
      DO UPDATE SET start_year = EXCLUDED.start_year, end_year = EXCLUDED.end_year
      RETURNING id
    `,
    [label, startYear, startYear + 1]
  )
  return q.rows[0].id
}

async function upsertTeam(client, name) {
  const q = await client.query(
    `
      INSERT INTO teams (name)
      VALUES ($1)
      ON CONFLICT (name)
      DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `,
    [String(name || '').trim()]
  )
  return q.rows[0].id
}

async function upsertFixtureCore(client, payload) {
  const q = await client.query(
    `
      INSERT INTO fixtures (
        league_id, season_id, source_division_code, source_file, fixture_date, kickoff_time,
        home_team_id, away_team_id, home_goals_ft, away_goals_ft, result_ft,
        home_goals_ht, away_goals_ht, result_ht, referee, attendance, status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, NULL, 'finished'
      )
      ON CONFLICT (league_id, season_id, fixture_date, home_team_id, away_team_id)
      DO UPDATE SET
        source_file = EXCLUDED.source_file,
        kickoff_time = COALESCE(EXCLUDED.kickoff_time, fixtures.kickoff_time),
        home_goals_ft = EXCLUDED.home_goals_ft,
        away_goals_ft = EXCLUDED.away_goals_ft,
        result_ft = EXCLUDED.result_ft,
        home_goals_ht = EXCLUDED.home_goals_ht,
        away_goals_ht = EXCLUDED.away_goals_ht,
        result_ht = EXCLUDED.result_ht,
        referee = COALESCE(EXCLUDED.referee, fixtures.referee),
        updated_at = NOW()
      RETURNING id
    `,
    [
      payload.leagueId,
      payload.seasonId,
      payload.sourceDivisionCode,
      payload.sourceFile,
      payload.fixtureDate,
      payload.kickoffTime,
      payload.homeTeamId,
      payload.awayTeamId,
      payload.homeGoals,
      payload.awayGoals,
      payload.ftResult,
      payload.homeGoalsHt,
      payload.awayGoalsHt,
      payload.htResult,
      payload.referee,
    ]
  )
  return q.rows[0].id
}

async function upsertFixtureTeams(client, fixtureId, leagueId, seasonId, fixtureDate, homeTeamId, awayTeamId, homeGoals, awayGoals, ftResult) {
  await client.query(
    `
      INSERT INTO fixture_teams (
        fixture_id, team_id, opponent_team_id, league_id, season_id, fixture_date, side, goals_for, goals_against, result
      )
      VALUES
        ($1, $2, $3, $4, $5, $6, 'H', $7, $8, $9),
        ($1, $3, $2, $4, $5, $6, 'A', $8, $7, $10)
      ON CONFLICT (fixture_id, side)
      DO UPDATE SET
        team_id = EXCLUDED.team_id,
        opponent_team_id = EXCLUDED.opponent_team_id,
        league_id = EXCLUDED.league_id,
        season_id = EXCLUDED.season_id,
        fixture_date = EXCLUDED.fixture_date,
        goals_for = EXCLUDED.goals_for,
        goals_against = EXCLUDED.goals_against,
        result = EXCLUDED.result
    `,
    [fixtureId, homeTeamId, awayTeamId, leagueId, seasonId, fixtureDate, homeGoals, awayGoals, resultForSide(ftResult, 'H'), resultForSide(ftResult, 'A')]
  )
}

async function upsertFixtureStats(client, fixtureId, homeTeamId, awayTeamId, statsPayload) {
  if (!Array.isArray(statsPayload) || !statsPayload.length) return
  const homeStats = statsPayload.find(s => Number(s?.team?.id) === Number(homeTeamId))?.statistics || []
  const awayStats = statsPayload.find(s => Number(s?.team?.id) === Number(awayTeamId))?.statistics || []

  const insert = async (side, teamId, stats) => {
    await client.query(
      `
        INSERT INTO fixture_stats (
          fixture_id, team_id, side, shots, shots_on_target, corners, fouls_committed, offsides, yellow_cards, red_cards, extra_stats
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, '{}'::jsonb)
        ON CONFLICT (fixture_id, side)
        DO UPDATE SET
          team_id = EXCLUDED.team_id,
          shots = EXCLUDED.shots,
          shots_on_target = EXCLUDED.shots_on_target,
          corners = EXCLUDED.corners,
          fouls_committed = EXCLUDED.fouls_committed,
          offsides = EXCLUDED.offsides,
          yellow_cards = EXCLUDED.yellow_cards,
          red_cards = EXCLUDED.red_cards
      `,
      [
        fixtureId,
        teamId,
        side,
        pickStat(stats, 'Total Shots'),
        pickStat(stats, 'Shots on Goal'),
        pickStat(stats, 'Corner Kicks'),
        pickStat(stats, 'Fouls'),
        pickStat(stats, 'Offsides'),
        pickStat(stats, 'Yellow Cards'),
        pickStat(stats, 'Red Cards'),
      ]
    )
  }

  await insert('H', homeTeamId, homeStats)
  await insert('A', awayTeamId, awayStats)
}

async function upsertPlayer(client, teamId, fullName, position) {
  const q = await client.query(
    `
      INSERT INTO players (team_id, full_name, position)
      VALUES ($1, $2, $3)
      ON CONFLICT (team_id, full_name)
      DO UPDATE SET position = COALESCE(EXCLUDED.position, players.position)
      RETURNING id
    `,
    [teamId, fullName, position]
  )
  return q.rows[0].id
}

async function upsertPlayerStat(client, payload) {
  await client.query(
    `
      INSERT INTO player_stats (
        fixture_id, player_id, team_id, minutes_played, goals, assists, shots, shots_on_target,
        yellow_cards, red_cards, xg, xa, extra_stats
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
      ON CONFLICT (fixture_id, player_id)
      DO UPDATE SET
        team_id = EXCLUDED.team_id,
        minutes_played = EXCLUDED.minutes_played,
        goals = EXCLUDED.goals,
        assists = EXCLUDED.assists,
        shots = EXCLUDED.shots,
        shots_on_target = EXCLUDED.shots_on_target,
        yellow_cards = EXCLUDED.yellow_cards,
        red_cards = EXCLUDED.red_cards,
        xg = EXCLUDED.xg,
        xa = EXCLUDED.xa,
        extra_stats = EXCLUDED.extra_stats
    `,
    [
      payload.fixtureId,
      payload.playerId,
      payload.teamId,
      payload.minutesPlayed,
      payload.goals,
      payload.assists,
      payload.shots,
      payload.shotsOnTarget,
      payload.yellowCards,
      payload.redCards,
      payload.xg,
      payload.xa,
      JSON.stringify(payload.extraStats || {}),
    ]
  )
}

async function upsertFixturePlayers(client, fixtureId, teamIdByApiId, playersPayload) {
  if (!Array.isArray(playersPayload) || !playersPayload.length) return 0
  let inserted = 0

  for (const teamBlock of playersPayload) {
    const apiTeamId = Number(teamBlock?.team?.id)
    const localTeamId = teamIdByApiId.get(apiTeamId)
    if (!localTeamId) continue

    for (const row of teamBlock?.players || []) {
      const player = row?.player || {}
      const stats = row?.statistics?.[0] || {}
      const games = stats?.games || {}
      const goals = stats?.goals || {}
      const shots = stats?.shots || {}
      const cards = stats?.cards || {}
      const passes = stats?.passes || {}
      const tackles = stats?.tackles || {}
      const dribbles = stats?.dribbles || {}
      const duels = stats?.duels || {}
      const fouls = stats?.fouls || {}
      const penalties = stats?.penalty || {}

      const fullName = String(player?.name || '').trim()
      if (!fullName) continue
      const position = String(games?.position || player?.position || '').trim() || null

      const playerId = await upsertPlayer(client, localTeamId, fullName, position)
      await upsertPlayerStat(client, {
        fixtureId,
        playerId,
        teamId: localTeamId,
        minutesPlayed: toInt(games?.minutes),
        goals: toInt(goals?.total),
        assists: toInt(goals?.assists),
        shots: toInt(shots?.total),
        shotsOnTarget: toInt(shots?.on),
        yellowCards: toInt(cards?.yellow),
        redCards: toInt(cards?.red),
        xg: toNum(stats?.expected?.goals),
        xa: toNum(stats?.expected?.assists),
        extraStats: {
          api_player_id: toInt(player?.id),
          age: toInt(player?.age),
          number: toInt(games?.number),
          rating: toNum(games?.rating),
          captain: Boolean(games?.captain),
          offsides: toInt(stats?.offsides),
          fouls_drawn: toInt(fouls?.drawn),
          fouls_committed: toInt(fouls?.committed),
          passes_total: toInt(passes?.total),
          passes_key: toInt(passes?.key),
          passes_accuracy: toInt(passes?.accuracy),
          tackles_total: toInt(tackles?.total),
          tackles_blocks: toInt(tackles?.blocks),
          tackles_interceptions: toInt(tackles?.interceptions),
          duels_total: toInt(duels?.total),
          duels_won: toInt(duels?.won),
          dribbles_attempts: toInt(dribbles?.attempts),
          dribbles_success: toInt(dribbles?.success),
          dribbles_past: toInt(dribbles?.past),
          penalties_won: toInt(penalties?.won),
          penalties_committed: toInt(penalties?.commited),
          penalties_scored: toInt(penalties?.scored),
          penalties_missed: toInt(penalties?.missed),
          penalties_saved: toInt(penalties?.saved),
        },
      })
      inserted += 1
    }
  }

  return inserted
}

function extractCore(apiFixture) {
  const league = apiFixture?.league || {}
  const fixture = apiFixture?.fixture || {}
  const teams = apiFixture?.teams || {}
  const goals = apiFixture?.goals || {}
  const score = apiFixture?.score || {}
  const date = String(fixture.date || '').slice(0, 10)
  const time = String(fixture.date || '').slice(11, 19) || null
  const homeGoals = Number.isFinite(Number(goals.home)) ? Number(goals.home) : 0
  const awayGoals = Number.isFinite(Number(goals.away)) ? Number(goals.away) : 0
  const homeHt = Number.isFinite(Number(score?.halftime?.home)) ? Number(score.halftime.home) : null
  const awayHt = Number.isFinite(Number(score?.halftime?.away)) ? Number(score.halftime.away) : null
  const ft = resultFT(homeGoals, awayGoals)
  const ht = homeHt == null || awayHt == null ? null : resultFT(homeHt, awayHt)
  const statusShort = String(fixture?.status?.short || '').toUpperCase()
  const isFinished = FINISHED_SHORT.has(statusShort)
  return {
    apiFixtureId: Number(fixture.id),
    apiLeague: { id: Number(league.id), name: league.name, country: league.country, season: Number(league.season) },
    homeName: teams?.home?.name,
    awayName: teams?.away?.name,
    fixtureDate: date,
    kickoffTime: time,
    referee: fixture?.referee || null,
    homeGoals,
    awayGoals,
    homeGoalsHt: homeHt,
    awayGoalsHt: awayHt,
    ftResult: ft,
    htResult: ht,
    isFinished,
  }
}

async function upsertFromApiFixture(client, apiFixture, { sourceFileFinished = 'api-current-season', sourceFileScheduled = 'fixtures.csv' } = {}) {
  const core = extractCore(apiFixture)
  if (!core.fixtureDate || !core.homeName || !core.awayName) return null
  if (!Number.isFinite(core.apiLeague.id) || !Number.isFinite(core.apiLeague.season)) return null

  const leagueId = await upsertLeague(client, core.apiLeague)
  const seasonId = await upsertSeason(client, core.apiLeague.season)
  const homeTeamId = await upsertTeam(client, core.homeName)
  const awayTeamId = await upsertTeam(client, core.awayName)
  if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) return null

  const fixtureId = await upsertFixtureCore(client, {
    leagueId,
    seasonId,
    sourceDivisionCode: `API-${core.apiLeague.id}`,
    sourceFile: core.isFinished ? sourceFileFinished : sourceFileScheduled,
    fixtureDate: core.fixtureDate,
    kickoffTime: core.kickoffTime,
    homeTeamId,
    awayTeamId,
    homeGoals: core.homeGoals,
    awayGoals: core.awayGoals,
    ftResult: core.ftResult,
    homeGoalsHt: core.homeGoalsHt,
    awayGoalsHt: core.awayGoalsHt,
    htResult: core.htResult,
    referee: core.referee,
  })

  let playerRows = 0
  if (core.isFinished) {
    await upsertFixtureTeams(
      client,
      fixtureId,
      leagueId,
      seasonId,
      core.fixtureDate,
      homeTeamId,
      awayTeamId,
      core.homeGoals,
      core.awayGoals,
      core.ftResult
    )
    if (ENABLE_FIXTURE_STATS) {
      try {
        const stats = await apiFetch('fixtures/statistics', { fixture: core.apiFixtureId })
        await upsertFixtureStats(client, fixtureId, homeTeamId, awayTeamId, stats)
      } catch {
        // Keep fixture/team rows even if per-fixture stats are unavailable.
      }
    }
  }

  return {
    fixtureId,
    apiFixtureId: core.apiFixtureId,
    playerRows,
    homeTeamId,
    awayTeamId,
    homeTeamApiId: Number(apiFixture?.teams?.home?.id),
    awayTeamApiId: Number(apiFixture?.teams?.away?.id),
  }
}

async function importCurrentSeason() {
  const targetDate = process.argv[2] || dateISO(new Date())
  const seasonArg = process.argv[3]
  const season = seasonArg ? Number(seasonArg) : null
  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
  })
  const client = await pool.connect()

  const seenFixtureApiIds = new Set()
  const teamApiIds = new Set()
  let totalPlayerRows = 0
  let playerFixtureCalls = 0

  try {
    await client.query('BEGIN')

    // Free API plans can restrict current seasons when filtering by league+season.
    // Date-only pulls still work and are enough for day-based testing data.
    const todayFixtures = await apiFetch('fixtures', { date: targetDate, timezone: TZ })
    for (const f of todayFixtures.slice(0, Number.isFinite(MAX_FIXTURES_PER_DATE) ? MAX_FIXTURES_PER_DATE : 30)) {
      const row = await upsertFromApiFixture(client, f)
      if (!row) continue
      seenFixtureApiIds.add(row.apiFixtureId)
      if (Number.isFinite(row.homeTeamApiId)) teamApiIds.add(row.homeTeamApiId)
      if (Number.isFinite(row.awayTeamApiId)) teamApiIds.add(row.awayTeamApiId)

      const statusShort = String(f?.fixture?.status?.short || '').toUpperCase()
      if (FINISHED_SHORT.has(statusShort) && playerFixtureCalls < MAX_PLAYER_FIXTURES_PER_DATE) {
        try {
          const players = await apiFetch('fixtures/players', { fixture: row.apiFixtureId })
          const teamIdByApiId = new Map([
            [Number(f?.teams?.home?.id), row.homeTeamId],
            [Number(f?.teams?.away?.id), row.awayTeamId],
          ])
          totalPlayerRows += await upsertFixturePlayers(client, row.fixtureId, teamIdByApiId, players)
          playerFixtureCalls += 1
        } catch {
          // Keep fixture rows if player payload is unavailable or rate-limited.
        }
      }
    }

    if (ENABLE_HISTORY_BACKFILL) {
      for (const teamId of teamApiIds) {
        const history = await apiFetch('fixtures', {
          team: teamId,
          season: Number.isFinite(season) ? season : undefined,
          status: 'FT',
          timezone: TZ,
        })
        const ordered = history
          .filter(f => FINISHED_SHORT.has(String(f?.fixture?.status?.short || '').toUpperCase()))
          .sort((a, b) => new Date(b?.fixture?.date || 0).getTime() - new Date(a?.fixture?.date || 0).getTime())
          .slice(0, 20)
        for (const f of ordered) {
          const apiFixtureId = Number(f?.fixture?.id)
          if (seenFixtureApiIds.has(apiFixtureId)) continue
          const row = await upsertFromApiFixture(client, f)
          if (!row) continue
          seenFixtureApiIds.add(row.apiFixtureId)
        }
      }
    }

    await client.query('COMMIT')
    console.log(`Imported date: ${targetDate}`)
    console.log(`Season filter: ${Number.isFinite(season) ? season : 'none (API default)'}`)
    console.log(`Unique fixtures upserted: ${seenFixtureApiIds.size}`)
    console.log(`Teams discovered: ${teamApiIds.size}`)
    console.log(`History backfill enabled: ${ENABLE_HISTORY_BACKFILL ? 'yes' : 'no'}`)
    console.log(`Fixture stats enabled: ${ENABLE_FIXTURE_STATS ? 'yes' : 'no'}`)
    console.log(`Fixtures processed on date: ${Math.min(todayFixtures.length, Number.isFinite(MAX_FIXTURES_PER_DATE) ? MAX_FIXTURES_PER_DATE : 30)}`)
    console.log(`Fixture player payloads fetched: ${playerFixtureCalls}`)
    console.log(`Player stat rows upserted: ${totalPlayerRows}`)
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }
}

importCurrentSeason().catch(err => {
  console.error(err?.message || err)
  process.exit(1)
})
