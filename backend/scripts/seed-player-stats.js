/**
 * seed-player-stats.js
 * ────────────────────
 * Fetches ~30 top players from API-Football (top scorers + top assists across
 * top 5 European leagues) with full season stats and profile photos.
 *
 * Outputs: backend/data/player-stats-seed.json
 *
 * Usage:  node backend/scripts/seed-player-stats.js
 *
 * Requires API_FOOTBALL_KEY in backend/.env
 */

import dotenv from 'dotenv'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs/promises'
import { existsSync, mkdirSync } from 'fs'

const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: join(__dirname, '..', '.env') })

const API_KEY = process.env.API_FOOTBALL_KEY
const BASE_URL = 'https://v3.football.api-sports.io'
const OUTPUT_DIR = join(__dirname, '..', 'data')
const OUTPUT_FILE = join(OUTPUT_DIR, 'player-stats-seed.json')
const PHOTO_DIR = join(__dirname, '..', 'public', 'player-photos')

if (!API_KEY) {
  console.error('❌  API_FOOTBALL_KEY not set in backend/.env')
  process.exit(1)
}

// Top 5 leagues (API-Football IDs) — 2025/2026 season
const LEAGUES = [
  { id: 39, name: 'Premier League', country: 'England' },
  { id: 140, name: 'La Liga', country: 'Spain' },
  { id: 78, name: 'Bundesliga', country: 'Germany' },
  { id: 135, name: 'Serie A', country: 'Italy' },
  { id: 61, name: 'Ligue 1', country: 'France' },
]

const SEASON = 2025 // current season

async function apiFetch(endpoint, params = {}) {
  const url = new URL(`${BASE_URL}/${endpoint}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  })

  console.log(`  → ${url.pathname}${url.search}`)

  const res = await fetch(url.toString(), {
    headers: {
      'x-apisports-key': API_KEY,
    },
  })

  if (!res.ok) throw new Error(`API-Football ${res.status}: ${res.statusText}`)
  const json = await res.json()

  // Log remaining API calls
  const remaining = res.headers.get('x-ratelimit-requests-remaining')
  if (remaining) console.log(`    (API calls remaining: ${remaining})`)

  if (json.errors && Object.keys(json.errors).length > 0) {
    throw new Error(Object.values(json.errors).join(', '))
  }

  return json.response || []
}

async function downloadPhoto(url, playerId) {
  if (!url) return null
  try {
    if (!existsSync(PHOTO_DIR)) mkdirSync(PHOTO_DIR, { recursive: true })

    const ext = url.includes('.png') ? '.png' : '.jpg'
    const filename = `player_${playerId}${ext}`
    const filepath = join(PHOTO_DIR, filename)

    // Skip if already downloaded
    if (existsSync(filepath)) {
      return `/static/player-photos/${filename}`
    }

    const res = await fetch(url)
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    await fs.writeFile(filepath, buffer)
    return `/static/player-photos/${filename}`
  } catch (err) {
    console.warn(`    ⚠ Photo download failed for player ${playerId}: ${err.message}`)
    return null
  }
}

function mapPlayerStats(entry) {
  const player = entry.player || {}
  const stats = entry.statistics?.[0] || {}
  const team = stats.team || {}
  const games = stats.games || {}
  const goals = stats.goals || {}
  const shots = stats.shots || {}
  const passes = stats.passes || {}
  const tackles = stats.tackles || {}
  const duels = stats.duels || {}
  const dribbles = stats.dribbles || {}
  const fouls = stats.fouls || {}
  const cards = stats.cards || {}
  const penalty = stats.penalty || {}

  return {
    id: player.id,
    name: player.name,
    firstname: player.firstname,
    lastname: player.lastname,
    age: player.age,
    nationality: player.nationality,
    height: player.height,
    weight: player.weight,
    photo: player.photo,
    photoLocal: null, // filled after download

    team: team.name,
    teamId: team.id,
    teamLogo: team.logo,

    league: stats.league?.name,
    leagueId: stats.league?.id,
    leagueCountry: stats.league?.country,
    season: stats.league?.season,

    position: games.position,
    appearances: Number(games.appearences) || 0, // API typo: "appearences"
    lineups: Number(games.lineups) || 0,
    minutesPlayed: Number(games.minutes) || 0,
    rating: games.rating ? parseFloat(Number(games.rating).toFixed(2)) : null,

    stats: {
      goals: Number(goals.total) || 0,
      assists: Number(goals.assists) || 0,
      shots: Number(shots.total) || 0,
      shotsOnTarget: Number(shots.on) || 0,
      passes: Number(passes.total) || 0,
      keyPasses: Number(passes.key) || 0,
      passAccuracy: passes.accuracy ? Number(passes.accuracy) : null,
      tackles: Number(tackles.total) || 0,
      interceptions: Number(tackles.interceptions) || 0,
      duelsTotal: Number(duels.total) || 0,
      duelsWon: Number(duels.won) || 0,
      dribblesAttempted: Number(dribbles.attempts) || 0,
      dribblesSucceeded: Number(dribbles.success) || 0,
      foulsCommitted: Number(fouls.committed) || 0,
      foulsDrawn: Number(fouls.drawn) || 0,
      yellowCards: Number(cards.yellow) || 0,
      redCards: Number(cards.red) || 0,
      penaltyScored: Number(penalty.scored) || 0,
      penaltyMissed: Number(penalty.missed) || 0,
    },
  }
}

async function fetchTopPlayers() {
  const seen = new Map() // playerId → mapped player

  // Fetch top scorers from each league (top 5 per league)
  console.log('\n📊 Fetching top scorers...')
  for (const league of LEAGUES) {
    console.log(`\n  ${league.name} (${league.country}):`)
    try {
      const data = await apiFetch('players/topscorers', { league: league.id, season: SEASON })
      const top = data.slice(0, 5)
      for (const entry of top) {
        const p = mapPlayerStats(entry)
        if (p.id && !seen.has(p.id)) {
          seen.set(p.id, p)
          console.log(`    ✓ ${p.name} (${p.team}) — ${p.stats.goals}G ${p.stats.assists}A`)
        }
      }
    } catch (err) {
      console.warn(`    ⚠ Failed: ${err.message}`)
    }
    // Respect rate limits
    await sleep(1200)
  }

  // Fetch top assists from each league (top 3 per league, skip duplicates)
  console.log('\n🎯 Fetching top assists...')
  for (const league of LEAGUES) {
    console.log(`\n  ${league.name} (${league.country}):`)
    try {
      const data = await apiFetch('players/topassists', { league: league.id, season: SEASON })
      const top = data.slice(0, 5)
      for (const entry of top) {
        const p = mapPlayerStats(entry)
        if (p.id && !seen.has(p.id)) {
          seen.set(p.id, p)
          console.log(`    ✓ ${p.name} (${p.team}) — ${p.stats.goals}G ${p.stats.assists}A`)
        }
      }
    } catch (err) {
      console.warn(`    ⚠ Failed: ${err.message}`)
    }
    await sleep(1200)
  }

  // If we still need more, fetch top-rated from remaining leagues
  if (seen.size < 30) {
    console.log(`\n⭐ Fetching more players to reach 30 (currently ${seen.size})...`)
    for (const league of LEAGUES) {
      if (seen.size >= 30) break
      try {
        const data = await apiFetch('players/topscorers', { league: league.id, season: SEASON })
        for (const entry of data.slice(5, 10)) {
          if (seen.size >= 30) break
          const p = mapPlayerStats(entry)
          if (p.id && !seen.has(p.id)) {
            seen.set(p.id, p)
            console.log(`    ✓ ${p.name} (${p.team}) — ${p.stats.goals}G ${p.stats.assists}A`)
          }
        }
      } catch (err) {
        console.warn(`    ⚠ Failed: ${err.message}`)
      }
      await sleep(1200)
    }
  }

  return [...seen.values()]
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  console.log('🏈 BetWise Player Stats Seed')
  console.log(`   Season: ${SEASON}`)
  console.log(`   Leagues: ${LEAGUES.map(l => l.name).join(', ')}`)
  console.log(`   Output: ${OUTPUT_FILE}`)

  const players = await fetchTopPlayers()
  console.log(`\n📸 Downloading ${players.length} player photos...`)

  for (const p of players) {
    const localPath = await downloadPhoto(p.photo, p.id)
    if (localPath) p.photoLocal = localPath
  }

  // Sort by goals desc
  players.sort((a, b) => b.stats.goals - a.stats.goals)

  // Ensure output directory exists
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true })

  await fs.writeFile(OUTPUT_FILE, JSON.stringify({ season: SEASON, fetchedAt: new Date().toISOString(), count: players.length, players }, null, 2))

  console.log(`\n✅ Saved ${players.length} players to ${OUTPUT_FILE}`)
  console.log(`   Photos saved to ${PHOTO_DIR}`)

  // Summary
  console.log('\n📋 Summary:')
  const byLeague = {}
  players.forEach(p => {
    byLeague[p.league] = (byLeague[p.league] || 0) + 1
  })
  Object.entries(byLeague).forEach(([league, count]) => {
    console.log(`   ${league}: ${count} players`)
  })
}

main().catch(err => {
  console.error('❌ Fatal error:', err)
  process.exit(1)
})
