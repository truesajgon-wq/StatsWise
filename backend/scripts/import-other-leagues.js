/**
 * import-other-leagues.js
 *
 * Imports CSV files from the "Other leagues 2013-2026" folder.
 * Format: Country,League,Season,Date,Time,Home,Away,HG,AG,Res,...odds
 *
 * Usage:
 *   node backend/scripts/import-other-leagues.js "C:\Users\Anetka\Downloads\Historical Matches\Other leagues 2013-2026"
 *
 * - League code = filename base (e.g. POL, ARG, USA)
 * - Season "2025/2026" → label "2025-2026" (start=2025, end=2026)
 * - Season "2025" (single year, e.g. MLS) → label "2025-2026" (start=2025, end=2026)
 * - No half-time data, no team stats (shots/corners/cards) in this format
 */

import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import dotenv from 'dotenv'
import { parse } from 'csv-parse/sync'
import pg from 'pg'

dotenv.config()

const { Pool } = pg

// Map filename code → league metadata override
// If not listed, Country + League columns from the CSV are used directly.
const FILE_META_OVERRIDES = {
  POL: { tier: 1 },
  ARG: { tier: 1 },
  BRA: { tier: 1 },
  CHN: { tier: 1 },
  DNK: { tier: 1 },
  FIN: { tier: 1 },
  IRL: { tier: 1 },
  JPN: { tier: 1 },
  MEX: { tier: 1 },
  NOR: { tier: 1 },
  ROU: { tier: 1 },
  RUS: { tier: 1 },
  SWE: { tier: 1 },
  SWZ: { tier: 1 },
  USA: { tier: 1 },
  AUT: { tier: 1 },
}

function parseIntOrNull(value) {
  if (value === undefined || value === null || String(value).trim() === '') return null
  const parsed = Number.parseInt(String(value).trim(), 10)
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

/**
 * Normalizes season string to {label, startYear, endYear}.
 * "2025/2026" → { label: "2025-2026", startYear: 2025, endYear: 2026 }
 * "2025"      → { label: "2025-2026", startYear: 2025, endYear: 2026 }
 */
function normalizeSeason(raw) {
  if (!raw) return null
  const s = String(raw).trim()

  // Slash format: 2025/2026
  if (s.includes('/')) {
    const [a, b] = s.split('/').map(Number)
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null
    return { label: `${a}-${b}`, startYear: a, endYear: b }
  }

  // Single year format: 2025
  const y = Number(s)
  if (!Number.isFinite(y) || y < 1900 || y > 2100) return null
  return { label: `${y}-${y + 1}`, startYear: y, endYear: y + 1 }
}

function inferResultForSide(ftResult, side) {
  if (ftResult === 'D') return 'D'
  if (side === 'H') return ftResult === 'H' ? 'W' : 'L'
  return ftResult === 'A' ? 'W' : 'L'
}

async function upsertLeague(client, code, name, country, tier) {
  const result = await client.query(
    `
      INSERT INTO leagues (code, name, country, tier)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (code)
      DO UPDATE SET name = EXCLUDED.name, country = EXCLUDED.country, tier = EXCLUDED.tier
      RETURNING id
    `,
    [code, name, country, tier ?? null]
  )
  return result.rows[0].id
}

async function upsertSeason(client, { label, startYear, endYear }) {
  const result = await client.query(
    `
      INSERT INTO seasons (label, start_year, end_year)
      VALUES ($1, $2, $3)
      ON CONFLICT (label)
      DO UPDATE SET start_year = EXCLUDED.start_year, end_year = EXCLUDED.end_year
      RETURNING id
    `,
    [label, startYear, endYear]
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
      null, // home_goals_ht — not available in this format
      null, // away_goals_ht
      null, // result_ht
      null, // referee
      null, // attendance
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

function printProgress(current, total, label) {
  const pct = total > 0 ? Math.floor((current / total) * 100) : 0
  const filled = Math.floor(pct / 5)
  const bar = '█'.repeat(filled) + '░'.repeat(20 - filled)
  process.stdout.write(`\r  [${bar}] ${pct}%  ${current}/${total} rows  ${label}          `)
}

async function importOtherLeagues() {
  const dataDir = process.argv[2] || process.env.OTHER_LEAGUES_DIR
  if (!dataDir) {
    throw new Error(
      'Provide the "Other leagues 2013-2026" folder path as first argument or OTHER_LEAGUES_DIR env var.\n' +
      'Example: node backend/scripts/import-other-leagues.js "C:\\Users\\Anetka\\Downloads\\Historical Matches\\Other leagues 2013-2026"'
    )
  }

  const absoluteDir = path.resolve(dataDir)
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
  })

  const todayUtc = new Date()
  todayUtc.setUTCHours(23, 59, 59, 999)

  const stats = {
    files: 0,
    rowsRead: 0,
    rowsImported: 0,
    rowsSkipped: 0,
  }

  const entries = await fs.readdir(absoluteDir, { withFileTypes: true })
  const csvFiles = entries
    .filter(e => e.isFile() && e.name.toLowerCase().endsWith('.csv'))
    .map(e => e.name)
    .sort()

  if (csvFiles.length === 0) {
    console.log('No CSV files found in', absoluteDir)
    await pool.end()
    return
  }

  // Pre-scan for total row count
  console.log('Scanning files...')
  let totalRows = 0
  const fileList = []
  for (const csvFileName of csvFiles) {
    const csvPath = path.join(absoluteDir, csvFileName)
    const content = await fs.readFile(csvPath, 'utf8')
    const records = parse(content, { columns: true, skip_empty_lines: true, bom: true, relax_column_count: true, trim: true })
    fileList.push({ csvFileName, records })
    totalRows += records.length
  }
  console.log(`Found ${fileList.length} file(s), ${totalRows} rows total.\n`)

  let processedRows = 0

  const client = await pool.connect()
  const teamCache = new Map()
  const seasonCache = new Map()  // season label → id
  const leagueCache = new Map()  // league code → id

  try {
    for (const { csvFileName, records } of fileList) {
      const divisionCode = path.basename(csvFileName, '.csv').toUpperCase()
      const sourceFile = csvFileName

      stats.files += 1
      stats.rowsRead += records.length

      let leagueId = leagueCache.get(divisionCode) ?? null
      const metaOverride = FILE_META_OVERRIDES[divisionCode] || {}

      await client.query('BEGIN')
      for (const row of records) {
        // Read columns — support both capitalizations
        const countryName = (row.Country || '').trim()
        const leagueName = (row.League || '').trim()
        const seasonRaw = (row.Season || '').trim()
        const dateRaw = (row.Date || '').trim()
        const timeRaw = (row.Time || '').trim()
        const homeTeamName = (row.Home || '').trim()
        const awayTeamName = (row.Away || '').trim()
        const homeGoalsFT = parseIntOrNull(row.HG)
        const awayGoalsFT = parseIntOrNull(row.AG)
        const resultFT = (row.Res || '').trim().toUpperCase()

        processedRows++
        printProgress(processedRows, totalRows, divisionCode)

        // Skip incomplete rows
        if (!homeTeamName || !awayTeamName) { stats.rowsSkipped++; continue }
        if (homeGoalsFT === null || awayGoalsFT === null) { stats.rowsSkipped++; continue }
        if (!['H', 'D', 'A'].includes(resultFT)) { stats.rowsSkipped++; continue }

        const fixtureDate = parseDate(dateRaw)
        if (!fixtureDate || fixtureDate > todayUtc) { stats.rowsSkipped++; continue }

        const season = normalizeSeason(seasonRaw)
        if (!season) { stats.rowsSkipped++; continue }

        // Upsert league once per file (use first row for country/league name)
        if (!leagueId) {
          leagueId = await upsertLeague(
            client,
            divisionCode,
            leagueName || divisionCode,
            countryName || divisionCode,
            metaOverride.tier ?? null
          )
          leagueCache.set(divisionCode, leagueId)
        }

        // Upsert season (cached)
        let seasonId = seasonCache.get(season.label)
        if (!seasonId) {
          seasonId = await upsertSeason(client, season)
          seasonCache.set(season.label, seasonId)
        }

        const homeTeamId = await upsertTeam(client, homeTeamName, teamCache)
        const awayTeamId = await upsertTeam(client, awayTeamName, teamCache)
        const kickoffTime = parseTime(timeRaw)

        const fixtureId = await upsertFixture(client, {
          leagueId,
          seasonId,
          divisionCode,
          sourceFile,
          fixtureDate: fixtureDate.toISOString().slice(0, 10),
          kickoffTime,
          homeTeamId,
          awayTeamId,
          homeGoalsFT,
          awayGoalsFT,
          resultFT,
        })

        await upsertFixtureTeams(client, {
          fixtureId,
          leagueId,
          seasonId,
          fixtureDate: fixtureDate.toISOString().slice(0, 10),
          homeTeamId,
          awayTeamId,
          homeGoalsFT,
          awayGoalsFT,
          resultFT,
        })

        stats.rowsImported++
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
  console.log('Other leagues import completed:')
  console.log(`  Files processed : ${stats.files}`)
  console.log(`  Rows read       : ${stats.rowsRead}`)
  console.log(`  Rows imported   : ${stats.rowsImported}`)
  console.log(`  Rows skipped    : ${stats.rowsSkipped}`)
}

importOtherLeagues().catch(error => {
  console.error('Import failed:', error)
  process.exit(1)
})
