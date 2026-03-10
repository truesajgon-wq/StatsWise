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

function parseDate(value) {
  if (!value) return null
  const raw = String(value).trim()
  const parts = raw.split('/')
  if (parts.length !== 3) return null

  const [dd, mm, yyyy] = parts
  const day = Number.parseInt(dd, 10)
  const month = Number.parseInt(mm, 10)
  const yearRaw = Number.parseInt(yyyy, 10)
  const year = yyyy.length === 2 ? (yearRaw >= 70 ? 1900 + yearRaw : 2000 + yearRaw) : yearRaw
  if (!day || !month || !year) return null

  const date = new Date(Date.UTC(year, month - 1, day))
  if (Number.isNaN(date.getTime())) return null
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`
}

function parseTime(value) {
  if (!value) return null
  const raw = String(value).trim()
  if (!/^\d{1,2}:\d{2}$/.test(raw)) return null
  const [h, m] = raw.split(':').map(v => Number.parseInt(v, 10))
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`
}

function getSeasonLabel(dateIso) {
  const [yearStr, monthStr] = String(dateIso).split('-')
  const year = Number.parseInt(yearStr, 10)
  const month = Number.parseInt(monthStr, 10)
  if (month >= 7) return `${year}-${year + 1}`
  return `${year - 1}-${year}`
}

function getLeagueMeta(code) {
  return LEAGUE_CODE_MAP[code] || { name: code, country: 'Unknown', tier: null }
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
  const key = String(teamName || '').trim()
  if (!key) return null
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
  const id = result.rows[0].id
  cache.set(key, id)
  return id
}

async function upsertScheduledFixture(client, payload) {
  await client.query(
    `
      INSERT INTO fixtures (
        league_id, season_id, source_division_code, source_file, fixture_date, kickoff_time,
        home_team_id, away_team_id, home_goals_ft, away_goals_ft, result_ft,
        home_goals_ht, away_goals_ht, result_ht, referee, attendance, status
      )
      VALUES (
        $1, $2, $3, $4, $5, $6,
        $7, $8, 0, 0, 'D',
        NULL, NULL, NULL, $9, NULL, 'finished'
      )
      ON CONFLICT (league_id, season_id, fixture_date, home_team_id, away_team_id)
      DO UPDATE SET
        source_file = EXCLUDED.source_file,
        kickoff_time = COALESCE(EXCLUDED.kickoff_time, fixtures.kickoff_time),
        referee = COALESCE(EXCLUDED.referee, fixtures.referee),
        updated_at = NOW()
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
      payload.referee,
    ]
  )
}

async function importFixturesCsv() {
  const csvPathArg = process.argv[2]
  if (!csvPathArg) {
    throw new Error('Usage: npm run import:fixtures -- "C:\\path\\to\\fixtures.csv"')
  }
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required in backend/.env')
  }

  const csvPath = path.resolve(csvPathArg)
  const content = await fs.readFile(csvPath, 'utf8')
  const records = parse(content, {
    columns: true,
    skip_empty_lines: true,
    bom: true,
    relax_column_count: true,
    trim: true,
  })

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
  })
  const client = await pool.connect()
  const teamCache = new Map()
  const seasonCache = new Map()
  const leagueCache = new Map()

  let imported = 0
  let skipped = 0
  const sourceFile = path.basename(csvPath)

  try {
    await client.query('BEGIN')
    for (const row of records) {
      const divisionCode = String(row.Div || '').trim().toUpperCase()
      const fixtureDate = parseDate(row.Date)
      const kickoffTime = parseTime(row.Time)
      const homeTeam = String(row.HomeTeam || '').trim()
      const awayTeam = String(row.AwayTeam || '').trim()

      if (!divisionCode || !fixtureDate || !homeTeam || !awayTeam) {
        skipped += 1
        continue
      }

      const seasonLabel = getSeasonLabel(fixtureDate)
      const seasonId = seasonCache.has(seasonLabel)
        ? seasonCache.get(seasonLabel)
        : await upsertSeason(client, seasonLabel)
      seasonCache.set(seasonLabel, seasonId)

      const leagueId = leagueCache.has(divisionCode)
        ? leagueCache.get(divisionCode)
        : await upsertLeague(client, divisionCode)
      leagueCache.set(divisionCode, leagueId)

      const homeTeamId = await upsertTeam(client, homeTeam, teamCache)
      const awayTeamId = await upsertTeam(client, awayTeam, teamCache)
      if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) {
        skipped += 1
        continue
      }

      await upsertScheduledFixture(client, {
        leagueId,
        seasonId,
        divisionCode,
        sourceFile,
        fixtureDate,
        kickoffTime,
        homeTeamId,
        awayTeamId,
        referee: row.Referee?.trim() || null,
      })
      imported += 1
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
    await pool.end()
  }

  console.log(`Imported/updated fixtures: ${imported}`)
  console.log(`Skipped rows: ${skipped}`)
}

importFixturesCsv().catch(err => {
  console.error(err.message)
  process.exit(1)
})
