import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { parse } from 'csv-parse/sync'
import pg from 'pg'

dotenv.config()

const { Pool } = pg

const LEAGUE_CODE_MAP = {
  E0: { name: 'Premier League', country: 'England', tier: 1 },
  E1: { name: 'Championship', country: 'England', tier: 2 },
  E2: { name: 'League One', country: 'England', tier: 3 },
  E3: { name: 'League Two', country: 'England', tier: 4 },
  EC: { name: 'Conference', country: 'England', tier: 5 },
  SC0: { name: 'Premiership', country: 'Scotland', tier: 1 },
  SC1: { name: 'Championship', country: 'Scotland', tier: 2 },
  SC2: { name: 'League One', country: 'Scotland', tier: 3 },
  SC3: { name: 'League Two', country: 'Scotland', tier: 4 },
  D1: { name: 'Bundesliga', country: 'Germany', tier: 1 },
  D2: { name: '2. Bundesliga', country: 'Germany', tier: 2 },
  I1: { name: 'Serie A', country: 'Italy', tier: 1 },
  I2: { name: 'Serie B', country: 'Italy', tier: 2 },
  F1: { name: 'Ligue 1', country: 'France', tier: 1 },
  F2: { name: 'Ligue 2', country: 'France', tier: 2 },
  SP1: { name: 'La Liga', country: 'Spain', tier: 1 },
  SP2: { name: 'Segunda Division', country: 'Spain', tier: 2 },
  N1: { name: 'Eredivisie', country: 'Netherlands', tier: 1 },
  P1: { name: 'Primeira Liga', country: 'Portugal', tier: 1 },
  B1: { name: 'Jupiler Pro League', country: 'Belgium', tier: 1 },
  G1: { name: 'Super League Greece', country: 'Greece', tier: 1 },
  T1: { name: 'Super Lig', country: 'Turkey', tier: 1 },
}

const BASE_COLUMN_MAP = {
  Div: 'division_code',
  Date: 'fixture_date',
  Time: 'kickoff_time',
  HomeTeam: 'home_team',
  AwayTeam: 'away_team',
  FTHG: 'home_goals_ft',
  FTAG: 'away_goals_ft',
  FTR: 'result_ft',
  HTHG: 'home_goals_ht',
  HTAG: 'away_goals_ht',
  HTR: 'result_ht',
  Attendance: 'attendance',
  Referee: 'referee',
}

const TEAM_STAT_MAP = {
  HS: { side: 'H', key: 'shots' },
  AS: { side: 'A', key: 'shots' },
  HST: { side: 'H', key: 'shots_on_target' },
  AST: { side: 'A', key: 'shots_on_target' },
  HHW: { side: 'H', key: 'hit_woodwork' },
  AHW: { side: 'A', key: 'hit_woodwork' },
  HC: { side: 'H', key: 'corners' },
  AC: { side: 'A', key: 'corners' },
  HF: { side: 'H', key: 'fouls_committed' },
  AF: { side: 'A', key: 'fouls_committed' },
  HFKC: { side: 'H', key: 'free_kicks_conceded' },
  AFKC: { side: 'A', key: 'free_kicks_conceded' },
  HO: { side: 'H', key: 'offsides' },
  AO: { side: 'A', key: 'offsides' },
  HY: { side: 'H', key: 'yellow_cards' },
  AY: { side: 'A', key: 'yellow_cards' },
  HR: { side: 'H', key: 'red_cards' },
  AR: { side: 'A', key: 'red_cards' },
  HBP: { side: 'H', key: 'booking_points' },
  ABP: { side: 'A', key: 'booking_points' },
}

const NON_ODDS_COLUMNS = new Set([...Object.keys(BASE_COLUMN_MAP), ...Object.keys(TEAM_STAT_MAP)])

function normalizeKey(input) {
  return input.trim().replace(/\s+/g, '')
}

function toSnakeCase(text) {
  return text
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function parseIntOrNull(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const parsed = Number.parseInt(String(value).trim(), 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseFloatOrNull(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const parsed = Number.parseFloat(String(value).trim())
  return Number.isFinite(parsed) ? parsed : null
}

function parseDate(value) {
  if (!value) return null
  const raw = String(value).trim()
  const parts = raw.split('/')
  if (parts.length !== 3) return null

  const [dd, mm, yy] = parts
  const day = Number.parseInt(dd, 10)
  const month = Number.parseInt(mm, 10)
  const yearRaw = Number.parseInt(yy, 10)
  const year = yy.length === 2 ? (yearRaw >= 70 ? 1900 + yearRaw : 2000 + yearRaw) : yearRaw

  if (!day || !month || !year) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (Number.isNaN(date.getTime())) return null
  return date
}

function parseTime(value) {
  if (!value) return null
  const raw = String(value).trim()
  if (!/^\d{1,2}:\d{2}$/.test(raw)) return null
  const [h, m] = raw.split(':').map(v => Number.parseInt(v, 10))
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

function isOddsColumn(columnName, notesMap) {
  const col = normalizeKey(columnName)
  if (NON_ODDS_COLUMNS.has(col)) return false
  const description = notesMap.get(col) || ''
  if (/odds/i.test(description)) return true

  if (/[<>]/.test(col)) return true
  if (/^(AH|AHh|AHCh)$/i.test(col)) return true
  if (/^(Max|Avg|Bb)/i.test(col)) return true
  if (/^(B365|BWH|BWD|BWA|BW|WH|IW|IWH|IWD|IWA|PS|PH|PD|PA|PC|PCA|LB|GB|SB|SJ|SY|SO|BS|VC|VCH|VCD|VCA|BF|BFD|BFE|BMGM|BV|CL|1XB)/i.test(col)) return true
  if (/^[A-Z0-9]+C(H|D|A)$/.test(col)) return true
  if (/AH(H|A)$/.test(col) || /AHA$/.test(col)) return true

  return false
}

function getLeagueMeta(code) {
  return LEAGUE_CODE_MAP[code] || { name: code, country: 'Unknown', tier: null }
}

async function readNotesMap(dataRoot) {
  const candidates = [
    path.join(dataRoot, 'notes.txt'),
    path.join(path.dirname(dataRoot), 'notes.txt'),
  ]

  let contents = null
  for (const candidate of candidates) {
    try {
      contents = await fs.readFile(candidate, 'utf8')
      break
    } catch {
      // ignore
    }
  }

  if (!contents) return new Map()

  const mapping = new Map()
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || !trimmed.includes('=')) continue
    const [left, ...rest] = trimmed.split('=')
    const key = normalizeKey(left)
    const value = rest.join('=').trim()
    if (!key || !value) continue
    mapping.set(key, value)
  }
  return mapping
}

async function listSeasonFolders(rootDir) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true })
  return entries
    .filter(entry => entry.isDirectory() && /^\d{4}-\d{4}$/.test(entry.name))
    .map(entry => entry.name)
    .sort()
}

async function listCsvFiles(seasonDir) {
  const entries = await fs.readdir(seasonDir, { withFileTypes: true })
  return entries
    .filter(entry => entry.isFile() && entry.name.toLowerCase().endsWith('.csv'))
    .map(entry => entry.name)
    .sort()
}

function inferResultForSide(ftResult, side) {
  if (ftResult === 'D') return 'D'
  if (side === 'H') return ftResult === 'H' ? 'W' : 'L'
  return ftResult === 'A' ? 'W' : 'L'
}

async function upsertLeague(client, code) {
  const meta = getLeagueMeta(code)
  const result = await client.query(
    `
      INSERT INTO leagues (code, name, country, tier)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (code)
      DO UPDATE SET name = EXCLUDED.name, country = EXCLUDED.country, tier = EXCLUDED.tier
      RETURNING id
    `,
    [code, meta.name, meta.country, meta.tier]
  )
  return result.rows[0].id
}

async function upsertSeason(client, seasonLabel) {
  const [start, end] = seasonLabel.split('-').map(Number)
  const result = await client.query(
    `
      INSERT INTO seasons (label, start_year, end_year)
      VALUES ($1, $2, $3)
      ON CONFLICT (label)
      DO UPDATE SET start_year = EXCLUDED.start_year, end_year = EXCLUDED.end_year
      RETURNING id
    `,
    [seasonLabel, start, end]
  )
  return result.rows[0].id
}

async function upsertTeam(client, teamName, cache) {
  const key = teamName.trim()
  if (cache.has(key)) return cache.get(key)

  const result = await client.query(
    `
      INSERT INTO teams (name)
      VALUES ($1)
      ON CONFLICT (name)
      DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `,
    [key]
  )
  const teamId = result.rows[0].id
  cache.set(key, teamId)
  return teamId
}

async function upsertFixture(client, payload) {
  const result = await client.query(
    `
      INSERT INTO fixtures (
        league_id, season_id, source_division_code, source_file, fixture_date, kickoff_time,
        home_team_id, away_team_id, home_goals_ft, away_goals_ft, result_ft,
        home_goals_ht, away_goals_ht, result_ht, referee, attendance, status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, $9, $10, $11,
        $12, $13, $14, $15, $16, 'finished'
      )
      ON CONFLICT (league_id, season_id, fixture_date, home_team_id, away_team_id)
      DO UPDATE SET
        source_file = EXCLUDED.source_file,
        kickoff_time = EXCLUDED.kickoff_time,
        home_goals_ft = EXCLUDED.home_goals_ft,
        away_goals_ft = EXCLUDED.away_goals_ft,
        result_ft = EXCLUDED.result_ft,
        home_goals_ht = EXCLUDED.home_goals_ht,
        away_goals_ht = EXCLUDED.away_goals_ht,
        result_ht = EXCLUDED.result_ht,
        referee = EXCLUDED.referee,
        attendance = EXCLUDED.attendance,
        updated_at = NOW()
      RETURNING id
    `,
    [
      payload.leagueId,
      payload.seasonId,
      payload.divisionCode,
      payload.sourceFile,
      payload.fixtureDate,
      payload.kickoffTime,
      payload.homeTeamId,
      payload.awayTeamId,
      payload.homeGoalsFT,
      payload.awayGoalsFT,
      payload.resultFT,
      payload.homeGoalsHT,
      payload.awayGoalsHT,
      payload.resultHT,
      payload.referee,
      payload.attendance,
    ]
  )
  return result.rows[0].id
}

async function upsertFixtureTeams(client, payload) {
  const rows = [
    {
      fixtureId: payload.fixtureId,
      teamId: payload.homeTeamId,
      opponentTeamId: payload.awayTeamId,
      side: 'H',
      goalsFor: payload.homeGoalsFT,
      goalsAgainst: payload.awayGoalsFT,
      result: inferResultForSide(payload.resultFT, 'H'),
    },
    {
      fixtureId: payload.fixtureId,
      teamId: payload.awayTeamId,
      opponentTeamId: payload.homeTeamId,
      side: 'A',
      goalsFor: payload.awayGoalsFT,
      goalsAgainst: payload.homeGoalsFT,
      result: inferResultForSide(payload.resultFT, 'A'),
    },
  ]

  for (const row of rows) {
    await client.query(
      `
        INSERT INTO fixture_teams (
          fixture_id, team_id, opponent_team_id, league_id, season_id, fixture_date,
          side, goals_for, goals_against, result
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
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
      [
        row.fixtureId,
        row.teamId,
        row.opponentTeamId,
        payload.leagueId,
        payload.seasonId,
        payload.fixtureDate,
        row.side,
        row.goalsFor,
        row.goalsAgainst,
        row.result,
      ]
    )
  }
}

async function upsertFixtureStats(client, fixtureId, homeTeamId, awayTeamId, homeStats, awayStats) {
  const rows = [
    { fixtureId, teamId: homeTeamId, side: 'H', stats: homeStats },
    { fixtureId, teamId: awayTeamId, side: 'A', stats: awayStats },
  ]

  for (const row of rows) {
    await client.query(
      `
        INSERT INTO fixture_stats (
          fixture_id, team_id, side,
          shots, shots_on_target, hit_woodwork, corners, fouls_committed,
          free_kicks_conceded, offsides, yellow_cards, red_cards, booking_points,
          extra_stats
        )
        VALUES (
          $1, $2, $3,
          $4, $5, $6, $7, $8,
          $9, $10, $11, $12, $13,
          $14::jsonb
        )
        ON CONFLICT (fixture_id, side)
        DO UPDATE SET
          team_id = EXCLUDED.team_id,
          shots = EXCLUDED.shots,
          shots_on_target = EXCLUDED.shots_on_target,
          hit_woodwork = EXCLUDED.hit_woodwork,
          corners = EXCLUDED.corners,
          fouls_committed = EXCLUDED.fouls_committed,
          free_kicks_conceded = EXCLUDED.free_kicks_conceded,
          offsides = EXCLUDED.offsides,
          yellow_cards = EXCLUDED.yellow_cards,
          red_cards = EXCLUDED.red_cards,
          booking_points = EXCLUDED.booking_points,
          extra_stats = EXCLUDED.extra_stats
      `,
      [
        row.fixtureId,
        row.teamId,
        row.side,
        row.stats.shots ?? null,
        row.stats.shots_on_target ?? null,
        row.stats.hit_woodwork ?? null,
        row.stats.corners ?? null,
        row.stats.fouls_committed ?? null,
        row.stats.free_kicks_conceded ?? null,
        row.stats.offsides ?? null,
        row.stats.yellow_cards ?? null,
        row.stats.red_cards ?? null,
        row.stats.booking_points ?? null,
        JSON.stringify(row.stats.extra_stats || {}),
      ]
    )
  }
}

function pickFinishedOnly(row, todayUtc) {
  const homeGoalsFT = parseIntOrNull(row.FTHG)
  const awayGoalsFT = parseIntOrNull(row.FTAG)
  const resultFT = (row.FTR || '').trim().toUpperCase()
  const fixtureDate = parseDate(row.Date)

  if (!fixtureDate) return null
  if (fixtureDate > todayUtc) return null
  if (homeGoalsFT === null || awayGoalsFT === null) return null
  if (!['H', 'D', 'A'].includes(resultFT)) return null

  return {
    fixtureDate,
    homeGoalsFT,
    awayGoalsFT,
    resultFT,
  }
}

function buildTeamStats(row, notesMap, removedOddsColumns) {
  const homeStats = { extra_stats: {} }
  const awayStats = { extra_stats: {} }

  for (const [rawKey, rawValue] of Object.entries(row)) {
    const key = normalizeKey(rawKey)
    if (!key) continue

    if (isOddsColumn(key, notesMap)) {
      removedOddsColumns.add(key)
      continue
    }

    if (TEAM_STAT_MAP[key]) {
      const meta = TEAM_STAT_MAP[key]
      const value = parseIntOrNull(rawValue)
      if (meta.side === 'H') homeStats[meta.key] = value
      if (meta.side === 'A') awayStats[meta.key] = value
      continue
    }

    if (NON_ODDS_COLUMNS.has(key)) continue
    if (rawValue === undefined || rawValue === null || String(rawValue).trim() === '') continue

    const description = notesMap.get(key) || key
    const canonical = toSnakeCase(description)

    if (key.startsWith('H')) {
      homeStats.extra_stats[canonical] = parseFloatOrNull(rawValue) ?? String(rawValue).trim()
    } else if (key.startsWith('A')) {
      awayStats.extra_stats[canonical] = parseFloatOrNull(rawValue) ?? String(rawValue).trim()
    } else {
      homeStats.extra_stats[canonical] = parseFloatOrNull(rawValue) ?? String(rawValue).trim()
      awayStats.extra_stats[canonical] = parseFloatOrNull(rawValue) ?? String(rawValue).trim()
    }
  }

  return { homeStats, awayStats }
}

function printProgress(current, total, label) {
  const pct = total > 0 ? Math.floor((current / total) * 100) : 0
  const filled = Math.floor(pct / 5)
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled)
  process.stdout.write(`\r  [${bar}] ${pct}%  ${current}/${total} rows  ${label}          `)
}

async function importHistoricalMatches() {
  const dataRoot = process.argv[2] || process.env.HISTORICAL_DATA_DIR
  if (!dataRoot) {
    throw new Error('Provide extracted Historical Matches path as first argument or HISTORICAL_DATA_DIR env var.')
  }

  const absoluteRoot = path.resolve(dataRoot)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
  })

  const notesMap = await readNotesMap(absoluteRoot)
  const seasonFolders = await listSeasonFolders(absoluteRoot)
  const todayUtc = new Date()
  todayUtc.setUTCHours(23, 59, 59, 999)

  // Pre-scan to get total row count for accurate progress
  console.log('Scanning files...')
  let totalRows = 0
  const fileList = []
  for (const seasonLabel of seasonFolders) {
    const seasonPath = path.join(absoluteRoot, seasonLabel)
    const csvFiles = await listCsvFiles(seasonPath)
    for (const csvFileName of csvFiles) {
      const csvPath = path.join(seasonPath, csvFileName)
      const content = await fs.readFile(csvPath, 'utf8')
      const records = parse(content, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true })
      fileList.push({ seasonLabel, csvFileName, csvPath, records })
      totalRows += records.length
    }
  }
  console.log(`Found ${fileList.length} file(s), ${totalRows} rows total.\n`)

  const stats = {
    files: 0,
    rowsRead: 0,
    rowsImported: 0,
    rowsSkippedUnfinishedOrFuture: 0,
    oddsColumnsRemoved: new Set(),
  }

  const client = await pool.connect()
  const teamCache = new Map()

  try {
    for (const { seasonLabel, csvFileName, records } of fileList) {
      const seasonId = await upsertSeason(client, seasonLabel)
      const divisionCode = path.basename(csvFileName, '.csv').toUpperCase()
      const leagueId = await upsertLeague(client, divisionCode)
      const sourceFile = path.join(seasonLabel, csvFileName).replaceAll('\\', '/')

      stats.files += 1
      stats.rowsRead += records.length

      await client.query('BEGIN')
      for (const row of records) {
        printProgress(stats.rowsRead - records.length + stats.rowsImported + stats.rowsSkippedUnfinishedOrFuture + 1, totalRows, `${divisionCode}`)

        const valid = pickFinishedOnly(row, todayUtc)
        if (!valid) {
          stats.rowsSkippedUnfinishedOrFuture += 1
          continue
        }

        const homeTeamName = (row.HomeTeam || '').trim()
        const awayTeamName = (row.AwayTeam || '').trim()
        if (!homeTeamName || !awayTeamName) {
          stats.rowsSkippedUnfinishedOrFuture += 1
          continue
        }

        const homeTeamId = await upsertTeam(client, homeTeamName, teamCache)
        const awayTeamId = await upsertTeam(client, awayTeamName, teamCache)
        const kickoffTime = parseTime(row.Time)
        const attendance = parseIntOrNull(row.Attendance)
        const homeGoalsHT = parseIntOrNull(row.HTHG)
        const awayGoalsHT = parseIntOrNull(row.HTAG)
        const resultHT = row.HTR && ['H', 'D', 'A'].includes(row.HTR) ? row.HTR : null
        const referee = row.Referee && row.Referee.trim() ? row.Referee.trim() : null

        const fixtureId = await upsertFixture(client, {
          leagueId,
          seasonId,
          divisionCode,
          sourceFile,
          fixtureDate: valid.fixtureDate.toISOString().slice(0, 10),
          kickoffTime,
          homeTeamId,
          awayTeamId,
          homeGoalsFT: valid.homeGoalsFT,
          awayGoalsFT: valid.awayGoalsFT,
          resultFT: valid.resultFT,
          homeGoalsHT,
          awayGoalsHT,
          resultHT,
          referee,
          attendance,
        })

        await upsertFixtureTeams(client, {
          fixtureId,
          leagueId,
          seasonId,
          fixtureDate: valid.fixtureDate.toISOString().slice(0, 10),
          homeTeamId,
          awayTeamId,
          homeGoalsFT: valid.homeGoalsFT,
          awayGoalsFT: valid.awayGoalsFT,
          resultFT: valid.resultFT,
        })

        const { homeStats, awayStats } = buildTeamStats(row, notesMap, stats.oddsColumnsRemoved)
        await upsertFixtureStats(client, fixtureId, homeTeamId, awayTeamId, homeStats, awayStats)

        stats.rowsImported += 1
      }
      await client.query('COMMIT')
    }
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
    await pool.end()
  }

  process.stdout.write('\n\n')
  console.log('Historical import completed:')
  console.log(`  Files processed: ${stats.files}`)
  console.log(`  Rows read: ${stats.rowsRead}`)
  console.log(`  Rows imported (finished only): ${stats.rowsImported}`)
  console.log(`  Rows skipped (future/live/incomplete): ${stats.rowsSkippedUnfinishedOrFuture}`)
  console.log(`  Distinct odds columns removed: ${stats.oddsColumnsRemoved.size}`)
  if (stats.oddsColumnsRemoved.size > 0) {
    console.log(`  Odds columns sample: ${Array.from(stats.oddsColumnsRemoved).sort().slice(0, 30).join(', ')}`)
  }
}

importHistoricalMatches().catch(error => {
  console.error('Import failed:', error)
  process.exit(1)
})
