/**
 * obstawiaj-z-glowa – API-Football Proxy Backend
 * ─────────────────────────────────────────────────
 * API Key setup:
 *   Create backend/.env and add:  API_FOOTBALL_KEY=your_key_here
 *
 * Run:  node server.js  (or: npm run dev for auto-restart)
 * Port: 3001 (Vite dev proxy: /api/* → here)
 */

import dotenv from 'dotenv'
import { dirname } from 'path'
import { fileURLToPath } from 'url'
import express from 'express'
import cors from 'cors'
import NodeCache from 'node-cache'
import fs from 'fs/promises'
import { existsSync } from 'fs'
import path from 'path'
import pg from 'pg'
import crypto from 'crypto'
import { createRemoteJWKSet, jwtVerify } from 'jose'
import {
  BILLING_PLANS,
  normalizePlan,
  inferCountry,
  paymentMethodsForCountry,
  accessPlanFromSubscription,
  applyCancelAtPeriodEnd,
} from './billingUtils.js'

// ─── Load .env ─────────────────────────────────────────────────────────────
const __dirname = dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: `${__dirname}/.env` })

function readArgValue(flag) {
  const index = process.argv.indexOf(flag)
  if (index === -1) return ''
  return process.argv[index + 1] || ''
}

const app  = express()
const argHost = readArgValue('--host')
const argPort = readArgValue('--port')
const HOST = argHost || process.env.HOST || '0.0.0.0'
const PORT = Number(argPort || process.env.PORT || 3001)
const IS_PRODUCTION = process.env.NODE_ENV === 'production'
const DATA_MODE = String(process.env.BACKEND_DATA_MODE || 'db').toLowerCase() // db | api
const STATIC_ROOT = path.join(__dirname, 'public')
const STATIC_PLAYER_DIR = path.join(STATIC_ROOT, 'player-photos')
const STATIC_TEAM_DIR = path.join(STATIC_ROOT, 'team-logos')

// ─── Config ───────────────────────────────────────────────────────────────────
const API_KEY  = process.env.API_FOOTBALL_KEY
const BASE_URL = 'https://v3.football.api-sports.io'
const ODDS_PROVIDER = String(process.env.ODDS_PROVIDER || 'theoddsapi').toLowerCase()
const ODDS_API_KEY = process.env.ODDS_API_KEY || ''
const ODDS_API_BASE_URL = (process.env.ODDS_API_BASE_URL || '').replace(/\/$/, '')
const ODDS_SPORT_KEY = process.env.ODDS_SPORT_KEY || 'soccer'
const ODDS_BOOKMAKERS = String(process.env.ODDS_BOOKMAKERS || 'bet365,superbet')
  .split(',')
  .map(x => x.trim().toLowerCase())
  .filter(Boolean)
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || ''
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || ''
const STRIPE_PRICE_PREMIUM_MONTHLY = process.env.STRIPE_PRICE_PREMIUM_MONTHLY || ''
const STRIPE_PRICE_PREMIUM_YEARLY = process.env.STRIPE_PRICE_PREMIUM_YEARLY || ''
const FRONTEND_URL = process.env.FRONTEND_URL || (IS_PRODUCTION ? '' : 'http://localhost:5173')
const SUPABASE_URL = String(process.env.SUPABASE_URL || '').trim().replace(/\/$/, '')
const MOCK_CHECKOUT_PREFIX = 'mock_cs_'
const ALLOW_MOCK_BILLING = ['1', 'true', 'yes', 'on'].includes(String(process.env.ALLOW_MOCK_BILLING || '').toLowerCase())
const BILLING_STORE_PATH = String(process.env.BILLING_STORE_PATH || 'billing-store.json').trim()
const BILLING_STORE_FILE = path.isAbsolute(BILLING_STORE_PATH)
  ? BILLING_STORE_PATH
  : path.join(__dirname, BILLING_STORE_PATH)
const NEWS_ARTICLE_HOST_ALLOWLIST = ['espn.com']
const SUPABASE_JWT_ISSUER = SUPABASE_URL ? `${SUPABASE_URL}/auth/v1` : ''
const supabaseJwks = SUPABASE_URL
  ? createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
  : null
const allowedCorsOrigins = new Set(
  String(process.env.FRONTEND_URL || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
)

function failStartup(message, details = '') {
  console.error(`\n${message}`)
  if (details) console.error(`${details}\n`)
  process.exit(1)
}

function isHttpUrl(value) {
  try {
    const url = new URL(String(value || ''))
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

if (!IS_PRODUCTION) {
  allowedCorsOrigins.add('http://localhost:5173')
  allowedCorsOrigins.add('http://127.0.0.1:5173')
}

if (DATA_MODE === 'api' && !API_KEY) {
  console.error('\n❌  API_FOOTBALL_KEY is not set!')
  console.error('    Create the file  backend/.env  with this content:')
  console.error('    API_FOOTBALL_KEY=your_key_here\n')
  process.exit(1)
}

const { Pool } = pg
if (DATA_MODE === 'db' && !process.env.DATABASE_URL) {
  console.error('\n❌  DATABASE_URL is not set!')
  console.error('    Set DATABASE_URL in backend/.env for PostgreSQL mode.\n')
  process.exit(1)
}
if (!FRONTEND_URL) {
  console.error('\nFRONTEND_URL is not set.')
  console.error('Set FRONTEND_URL in backend/.env for billing redirects and CORS.\n')
  process.exit(1)
}
if (!SUPABASE_URL) {
  console.error('\nSUPABASE_URL is not set.')
  console.error('Set SUPABASE_URL in backend/.env for authenticated billing endpoints.\n')
  process.exit(1)
}
if (!isHttpUrl(FRONTEND_URL)) {
  failStartup('FRONTEND_URL is invalid.', 'Use a full URL such as https://statswise.app')
}
if (!isHttpUrl(SUPABASE_URL)) {
  failStartup('SUPABASE_URL is invalid.', 'Use the full Supabase project URL such as https://your-project-ref.supabase.co')
}
if (IS_PRODUCTION && ALLOW_MOCK_BILLING) {
  failStartup('ALLOW_MOCK_BILLING must be false in production.', 'Disable mock billing before deploying production.')
}
if (isStripeConfigured()) {
  if (!STRIPE_PRICE_PREMIUM_MONTHLY || !STRIPE_PRICE_PREMIUM_YEARLY) {
    failStartup(
      'Stripe is partially configured.',
      'Set both STRIPE_PRICE_PREMIUM_MONTHLY and STRIPE_PRICE_PREMIUM_YEARLY when STRIPE_SECRET_KEY is present.'
    )
  }
  if (!STRIPE_WEBHOOK_SECRET) {
    failStartup(
      'STRIPE_WEBHOOK_SECRET is missing.',
      'Create a Stripe webhook endpoint for /api/billing/webhook/stripe and set its whsec_... secret.'
    )
  }
}
if (IS_PRODUCTION && !path.isAbsolute(BILLING_STORE_FILE)) {
  failStartup(
    'BILLING_STORE_PATH should be an absolute persistent path in production.',
    'Point BILLING_STORE_PATH at mounted persistent storage, for example /var/lib/statswise/billing-store.json'
  )
}
const dbPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSLMODE === 'require' ? { rejectUnauthorized: false } : false,
})

// ─── Cache (TTL seconds) ──────────────────────────────────────────────────────
// Tune these to balance freshness vs. API quota usage.
const cache = new NodeCache({
  stdTTL: 300,           // default 5 min
  checkperiod: 60,
  useClones: false,
})
const inFlight = new Map()
const TTL = {
  fixtures:    300,   // 5 min  – date fixtures list
  live:        30,    // 30 sec – live score/stats
  statistics:  120,   // 2 min
  events:      60,    // 1 min
  lineups:     600,   // 10 min (rarely changes mid-game)
  players:     300,   // 5 min
  squads:      3600,  // 60 min
  history:     900,   // 15 min
  h2h:        1800,   // 30 min
  odds:        180,   // 3 min
}

// ─── Middleware ───────────────────────────────────────────────────────────────
app.use(cors({
  origin(origin, callback) {
    if (!origin) return callback(null, true)
    if (allowedCorsOrigins.has(origin)) return callback(null, true)
    return callback(new Error('CORS origin not allowed'))
  },
}))
app.use(express.json({
  verify(req, _res, buf) {
    if (req.originalUrl === '/api/billing/webhook/stripe') {
      req.rawBody = buf.toString('utf8')
    }
  },
}))
app.use('/static', express.static(STATIC_ROOT))

// ─── Low-level API helper ─────────────────────────────────────────────────────
async function apiFetch(endpoint, params = {}, ttl = 300) {
  const url = new URL(`${BASE_URL}/${endpoint}`)
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v))
  })

  const cacheKey = url.toString()
  const cached   = cache.get(cacheKey)
  if (cached !== undefined) {
    return { data: cached, fromCache: true }
  }
  const inflightPromise = inFlight.get(cacheKey)
  if (inflightPromise) return inflightPromise

  const run = (async () => {
    const res = await fetch(url.toString(), {
      headers: {
        'x-rapidapi-key':  API_KEY,
        'x-rapidapi-host': 'v3.football.api-sports.io',
      },
    })

    if (!res.ok) {
      throw new Error(`API-Football ${res.status}: ${res.statusText}`)
    }

    const json = await res.json()

    if (json.errors && Object.keys(json.errors).length > 0) {
      throw new Error(Object.values(json.errors).join(', '))
    }

    cache.set(cacheKey, json.response, ttl)
    return { data: json.response, fromCache: false }
  })()
  inFlight.set(cacheKey, run)
  try {
    return await run
  } finally {
    inFlight.delete(cacheKey)
  }
}

function teamNameKey(value = '') {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function fixtureNameKey(home, away) {
  return `${teamNameKey(home)}__${teamNameKey(away)}`
}

function asArray(v) {
  return Array.isArray(v) ? v : []
}

function pickBookmakers(rawBookmakers = []) {
  if (!ODDS_BOOKMAKERS.length) return rawBookmakers
  return rawBookmakers.filter(book => {
    const key = String(book?.key || book?.id || book?.name || '').toLowerCase()
    const title = String(book?.title || book?.name || '').toLowerCase()
    return ODDS_BOOKMAKERS.some(target => key.includes(target) || title.includes(target))
  })
}

function readOutcomePrice(outcome) {
  const p = Number(outcome?.price ?? outcome?.odds ?? outcome?.decimal ?? outcome?.value)
  return Number.isFinite(p) && p > 1 ? p : null
}

function normalizeOutcomeName(name = '') {
  return String(name || '').toLowerCase().trim()
}

function normalizeBookmakerEvents(rawEvents = []) {
  const normalized = []
  for (const ev of asArray(rawEvents)) {
    const homeTeam = ev?.home_team || ev?.homeTeam || ev?.home || ev?.teams?.home || ev?.participants?.home
    const awayTeam = ev?.away_team || ev?.awayTeam || ev?.away || ev?.teams?.away || ev?.participants?.away
    if (!homeTeam || !awayTeam) continue

    const books = pickBookmakers(asArray(ev?.bookmakers || ev?.sites || ev?.operators || ev?.books))
    const eventMarkets = {
      h2h: { home: null, draw: null, away: null },
      totals: {},
      btts: { yes: null, no: null },
    }

    for (const book of books) {
      const bookName = book?.title || book?.name || book?.key || 'book'
      for (const m of asArray(book?.markets || book?.bets || book?.market || [])) {
        const marketKey = String(m?.key || m?.name || m?.market || '').toLowerCase()
        const outcomes = asArray(m?.outcomes || m?.selections || m?.prices)
        if (!outcomes.length) continue

        const isH2H = ['h2h', '1x2', 'match_result', 'full_time_result'].some(k => marketKey.includes(k))
        const isTotals = ['totals', 'over_under', 'total_goals', 'goals_over_under'].some(k => marketKey.includes(k))
        const isBTTS = ['btts', 'both_teams_to_score', 'both teams to score'].some(k => marketKey.includes(k))

        if (isH2H) {
          for (const out of outcomes) {
            const price = readOutcomePrice(out)
            if (!price) continue
            const n = normalizeOutcomeName(out?.name || out?.label)
            const isHome = n === normalizeOutcomeName(homeTeam) || n === 'home'
            const isAway = n === normalizeOutcomeName(awayTeam) || n === 'away'
            const isDraw = ['draw', 'tie', 'x'].includes(n)
            const slot = isHome ? 'home' : isAway ? 'away' : isDraw ? 'draw' : null
            if (!slot) continue
            if (!eventMarkets.h2h[slot] || price > eventMarkets.h2h[slot].price) {
              eventMarkets.h2h[slot] = { price, bookmaker: bookName }
            }
          }
        }

        if (isTotals) {
          for (const out of outcomes) {
            const price = readOutcomePrice(out)
            if (!price) continue
            const point = Number(out?.point ?? out?.line ?? out?.handicap ?? out?.total)
            if (!Number.isFinite(point)) continue
            const lineKey = String(Math.round(point * 10) / 10)
            if (!eventMarkets.totals[lineKey]) eventMarkets.totals[lineKey] = { over: null, under: null }
            const n = normalizeOutcomeName(out?.name || out?.label)
            const slot = n.startsWith('over') ? 'over' : n.startsWith('under') ? 'under' : null
            if (!slot) continue
            if (!eventMarkets.totals[lineKey][slot] || price > eventMarkets.totals[lineKey][slot].price) {
              eventMarkets.totals[lineKey][slot] = { price, bookmaker: bookName }
            }
          }
        }

        if (isBTTS) {
          for (const out of outcomes) {
            const price = readOutcomePrice(out)
            if (!price) continue
            const n = normalizeOutcomeName(out?.name || out?.label)
            const slot = ['yes', 'y', 'both teams to score - yes', 'btts yes'].includes(n)
              ? 'yes'
              : ['no', 'n', 'both teams to score - no', 'btts no'].includes(n)
                ? 'no'
                : null
            if (!slot) continue
            if (!eventMarkets.btts[slot] || price > eventMarkets.btts[slot].price) {
              eventMarkets.btts[slot] = { price, bookmaker: bookName }
            }
          }
        }
      }
    }

    normalized.push({
      fixtureKey: fixtureNameKey(homeTeam, awayTeam),
      homeTeam,
      awayTeam,
      commenceTime: ev?.commence_time || ev?.start_time || ev?.date || null,
      markets: eventMarkets,
    })
  }
  return normalized
}

async function fetchBookmakerOddsByDate(dateStr) {
  if (!ODDS_API_KEY) return []
  const cacheKey = `bookmakers-odds-${ODDS_PROVIDER}-${dateStr}-${ODDS_BOOKMAKERS.join(',')}`
  const cached = cache.get(cacheKey)
  if (cached !== undefined) return cached

  let events = []
  if (ODDS_PROVIDER === 'theoddsapi') {
    const from = `${dateStr}T00:00:00Z`
    const to = `${dateStr}T23:59:59Z`
    const url = new URL(`${ODDS_API_BASE_URL || 'https://api.the-odds-api.com/v4'}/sports/${ODDS_SPORT_KEY}/odds`)
    url.searchParams.set('apiKey', ODDS_API_KEY)
    url.searchParams.set('regions', 'eu')
    url.searchParams.set('markets', 'h2h,totals,btts')
    url.searchParams.set('oddsFormat', 'decimal')
    url.searchParams.set('dateFormat', 'iso')
    url.searchParams.set('commenceTimeFrom', from)
    url.searchParams.set('commenceTimeTo', to)
    if (ODDS_BOOKMAKERS.length) url.searchParams.set('bookmakers', ODDS_BOOKMAKERS.join(','))
    const res = await fetch(url.toString())
    if (!res.ok) throw new Error(`Odds provider HTTP ${res.status}`)
    events = await res.json()
  } else if (ODDS_PROVIDER === 'oddsapiio') {
    const url = new URL(`${ODDS_API_BASE_URL || 'https://api.odds-api.io/v3'}/odds`)
    url.searchParams.set('sport', ODDS_SPORT_KEY)
    url.searchParams.set('date', dateStr)
    if (ODDS_BOOKMAKERS.length) url.searchParams.set('bookmakers', ODDS_BOOKMAKERS.join(','))
    const res = await fetch(url.toString(), { headers: { 'x-api-key': ODDS_API_KEY } })
    if (!res.ok) throw new Error(`Odds provider HTTP ${res.status}`)
    const payload = await res.json()
    events = payload?.data || payload?.events || payload || []
  } else {
    throw new Error(`Unsupported ODDS_PROVIDER: ${ODDS_PROVIDER}`)
  }

  const normalized = normalizeBookmakerEvents(events)
  cache.set(cacheKey, normalized, TTL.odds)
  return normalized
}

function countryCurrency(country = 'Poland') {
  const map = {
    Poland: 'pln',
    Polska: 'pln',
    'United States': 'usd',
    'United Kingdom': 'gbp',
    Germany: 'eur',
    France: 'eur',
    Spain: 'eur',
    Italy: 'eur',
    Netherlands: 'eur',
    Ukraine: 'eur',
    Russia: 'eur',
    'Czech Republic': 'eur',
    Slovakia: 'eur',
    Hungary: 'eur',
    Romania: 'eur',
    Other: 'eur',
  }
  return map[country] || 'eur'
}

const FREE_PLAN_FALLBACK_SEASONS = [2024, 2023, 2022]

function isSeasonAccessError(err) {
  const msg = String(err?.message || '')
  return msg.toLowerCase().includes('free plans do not have access to this season')
}

async function fetchFixturesWithSeasonFallback(baseParams, ttl = TTL.history) {
  try {
    return await apiFetch('fixtures', baseParams, ttl)
  } catch (err) {
    if (!isSeasonAccessError(err)) throw err
    for (const season of FREE_PLAN_FALLBACK_SEASONS) {
      try {
        return await apiFetch('fixtures', { ...baseParams, season }, ttl)
      } catch (retryErr) {
        if (!isSeasonAccessError(retryErr)) throw retryErr
      }
    }
    throw err
  }
}

function convertFromPln(plnAmountMajor, currency) {
  const rates = { pln: 1, usd: 0.245, gbp: 0.195, eur: 0.228 }
  const rate = rates[currency] || rates.eur
  const converted = plnAmountMajor * rate
  return Math.max(1, Math.round(converted * 100))
}

function getPlanPriceCents(plan, currency) {
  const normalized = normalizePlan(plan)
  const monthlyPln = 34.99
  const yearlyPln = 314.91
  const plnAmount = normalized === BILLING_PLANS.PREMIUM_YEARLY ? yearlyPln : monthlyPln
  return convertFromPln(plnAmount, currency)
}

async function stripeFormPost(path, formData) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(formData),
  })
  const data = await res.json()
  if (!res.ok) {
    throw new Error(data?.error?.message || `Stripe error ${res.status}`)
  }
  return data
}

function isStripeConfigured() {
  if (!STRIPE_SECRET_KEY) return false
  if (!STRIPE_SECRET_KEY.startsWith('sk_')) return false
  if (STRIPE_SECRET_KEY.includes('replace_with_your_key')) return false
  return true
}

function canUseMockBilling() {
  return !isStripeConfigured() && ALLOW_MOCK_BILLING && !IS_PRODUCTION
}

async function loadBillingStore() {
  try {
    if (!existsSync(BILLING_STORE_FILE)) return { users: {}, sessions: {}, processedEvents: {} }
    const raw = await fs.readFile(BILLING_STORE_FILE, 'utf8')
    const parsed = JSON.parse(raw)
    return {
      users: parsed?.users || {},
      sessions: parsed?.sessions || {},
      processedEvents: parsed?.processedEvents || {},
    }
  } catch {
    return { users: {}, sessions: {}, processedEvents: {} }
  }
}

async function saveBillingStore(store) {
  await fs.writeFile(BILLING_STORE_FILE, JSON.stringify(store, null, 2), 'utf8')
}

function billingUserKey({ userId, email }) {
  if (userId) return `id:${String(userId).trim().toLowerCase()}`
  if (email) return `email:${String(email).trim().toLowerCase()}`
  return null
}

async function verifySupabaseToken(token) {
  if (!supabaseJwks || !SUPABASE_JWT_ISSUER) {
    throw new Error('Supabase auth is not configured on the backend.')
  }

  const { payload } = await jwtVerify(token, supabaseJwks, {
    issuer: SUPABASE_JWT_ISSUER,
    audience: 'authenticated',
  })

  return payload
}

async function requireAuth(req, res, next) {
  try {
    const authHeader = String(req.headers.authorization || '')
    if (!authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Missing bearer token.' })
    }

    const token = authHeader.slice(7).trim()
    if (!token) {
      return res.status(401).json({ success: false, error: 'Missing bearer token.' })
    }

    const claims = await verifySupabaseToken(token)
    req.auth = {
      userId: String(claims.sub || '').trim(),
      email: String(claims.email || '').trim().toLowerCase(),
      userMetadata: claims.user_metadata || {},
      appMetadata: claims.app_metadata || {},
    }

    if (!req.auth.userId) {
      return res.status(401).json({ success: false, error: 'Invalid auth token.' })
    }

    return next()
  } catch (err) {
    return res.status(401).json({ success: false, error: 'Invalid auth token.' })
  }
}

function normalizeUiPaymentMethod(method) {
  const raw = String(method || '').toLowerCase()
  if (raw === 'p24') return 'p24'
  if (raw === 'blik') return 'blik'
  if (raw === 'apple_pay' || raw === 'applepay') return 'apple_pay'
  if (raw === 'google_pay' || raw === 'googlepay') return 'google_pay'
  return 'stripe_card'
}

function stripePaymentTypesForCountry(country, selected) {
  const allowed = paymentMethodsForCountry(country)
  const method = allowed.includes(selected) ? selected : allowed[0]
  if (method === 'p24') return ['card', 'p24']
  if (method === 'blik') return ['card', 'blik']
  return ['card']
}

function safeExtFromUrl(url, fallback = '.jpg') {
  try {
    const ext = path.extname(new URL(url).pathname || '').toLowerCase()
    if (['.jpg', '.jpeg', '.png', '.webp', '.svg'].includes(ext)) return ext
    return fallback
  } catch {
    return fallback
  }
}

function sanitizeKey(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
    .slice(0, 80)
}

async function cacheRemoteImage(url, dirPath, publicPrefix, keyBase) {
  if (!url || !String(url).startsWith('http')) return null
  try {
    await fs.mkdir(dirPath, { recursive: true })
    const ext = safeExtFromUrl(url)
    const fileName = `${sanitizeKey(keyBase)}${ext}`
    const absPath = path.join(dirPath, fileName)
    const relPath = `${publicPrefix}/${fileName}`
    if (existsSync(absPath)) return relPath

    const res = await fetch(url)
    if (!res.ok) return null
    const arr = await res.arrayBuffer()
    await fs.writeFile(absPath, Buffer.from(arr))
    return relPath
  } catch {
    return null
  }
}

async function cachePlayersMedia(players = []) {
  const tasks = players.map(async p => {
    const teamLogoLocal = await cacheRemoteImage(
      p.teamLogo,
      STATIC_TEAM_DIR,
      '/static/team-logos',
      `team_${p.teamId || p.team}`
    )
    const photoLocal = await cacheRemoteImage(
      p.photo,
      STATIC_PLAYER_DIR,
      '/static/player-photos',
      `player_${p.id || `${p.teamId}_${p.name}`}`
    )
    return {
      ...p,
      photoLocal: photoLocal || null,
      teamLogoLocal: teamLogoLocal || null,
    }
  })
  return Promise.all(tasks)
}

const TOP_LEAGUE_CODES = new Set(['E0', 'D1', 'I1', 'F1', 'SP1', 'N1', 'P1', 'SC0', 'B1', 'T1', 'G1'])

function clampCount(value, fallback = 10, max = 20) {
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback
  return Math.min(parsed, max)
}

function toIsoDateTime(date, time) {
  let d = ''
  if (date instanceof Date) {
    d = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  } else {
    const raw = String(date || '').trim()
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
      d = raw.slice(0, 10)
    } else {
      const parsed = new Date(raw)
      d = Number.isNaN(parsed.getTime()) ? raw.slice(0, 10) : parsed.toISOString().slice(0, 10)
    }
  }

  let t = '00:00:00'
  if (time instanceof Date) {
    t = time.toISOString().slice(11, 19)
  } else {
    const raw = String(time || '').trim()
    if (/^\d{2}:\d{2}:\d{2}$/.test(raw)) t = raw
    else if (/^\d{2}:\d{2}$/.test(raw)) t = `${raw}:00`
    else if (raw) {
      const parsed = new Date(raw)
      if (!Number.isNaN(parsed.getTime())) t = parsed.toISOString().slice(11, 19)
    }
  }
  return `${d}T${t}Z`
}

const COUNTRY_CODE_MAP = new Map([
  ['england', 'GB'],
  ['scotland', 'GB'],
  ['wales', 'GB'],
  ['northern ireland', 'GB'],
  ['united kingdom', 'GB'],
  ['great britain', 'GB'],
  ['spain', 'ES'],
  ['germany', 'DE'],
  ['italy', 'IT'],
  ['france', 'FR'],
  ['poland', 'PL'],
  ['netherlands', 'NL'],
  ['holland', 'NL'],
  ['portugal', 'PT'],
  ['belgium', 'BE'],
  ['switzerland', 'CH'],
  ['austria', 'AT'],
  ['denmark', 'DK'],
  ['sweden', 'SE'],
  ['norway', 'NO'],
  ['finland', 'FI'],
  ['ireland', 'IE'],
  ['czech republic', 'CZ'],
  ['slovakia', 'SK'],
  ['hungary', 'HU'],
  ['romania', 'RO'],
  ['croatia', 'HR'],
  ['serbia', 'RS'],
  ['slovenia', 'SI'],
  ['greece', 'GR'],
  ['turkey', 'TR'],
  ['ukraine', 'UA'],
  ['russia', 'RU'],
  ['united states', 'US'],
  ['usa', 'US'],
  ['mexico', 'MX'],
  ['argentina', 'AR'],
  ['brazil', 'BR'],
  ['colombia', 'CO'],
  ['uruguay', 'UY'],
  ['chile', 'CL'],
  ['peru', 'PE'],
  ['ecuador', 'EC'],
  ['paraguay', 'PY'],
  ['bolivia', 'BO'],
  ['venezuela', 'VE'],
  ['japan', 'JP'],
  ['south korea', 'KR'],
  ['korea republic', 'KR'],
  ['china', 'CN'],
  ['saudi arabia', 'SA'],
  ['qatar', 'QA'],
  ['uae', 'AE'],
  ['united arab emirates', 'AE'],
  ['australia', 'AU'],
  ['new zealand', 'NZ'],
  ['world', 'WORLD'],
  ['europe', 'EU'],
  ['international', 'WORLD'],
])

function countryToCountryCode(country) {
  const normalized = String(country || '').trim().toLowerCase()
  if (!normalized) return ''
  return COUNTRY_CODE_MAP.get(normalized) || ''
}

function countryCodeToEmojiFlag(code) {
  if (code === 'WORLD') return '🌍'
  if (code === 'EU') return '🇪🇺'
  if (code === 'GB') return '🏴'
  if (!/^[A-Z]{2}$/.test(code)) return ''
  return [...code].map(char => String.fromCodePoint(127397 + char.charCodeAt(0))).join('')
}

function leagueFlagInfo(country, explicitFlag = '') {
  const countryCode = countryToCountryCode(country)
  return {
    countryCode,
    flag: explicitFlag || countryCodeToEmojiFlag(countryCode) || '',
  }
}

function statsBlock(teamId, teamName, stats = {}) {
  return {
    team: { id: teamId, name: teamName, logo: null },
    statistics: [
      { type: 'Shots on Goal', value: stats.shots_on_target ?? 0 },
      { type: 'Total Shots', value: stats.shots ?? 0 },
      { type: 'Corner Kicks', value: stats.corners ?? 0 },
      { type: 'Fouls', value: stats.fouls_committed ?? 0 },
      { type: 'Yellow Cards', value: stats.yellow_cards ?? 0 },
      { type: 'Red Cards', value: stats.red_cards ?? 0 },
      { type: 'Offsides', value: stats.offsides ?? 0 },
      { type: 'Ball Possession', value: 0 },
      { type: 'Total passes', value: 0 },
      { type: 'Passes accurate', value: 0 },
      { type: 'Goalkeeper Saves', value: 0 },
      { type: 'Blocked Shots', value: 0 },
      { type: 'expected_goals', value: 0 },
    ],
  }
}

function fixtureRowToApiShape(row) {
  const isScheduledCsvFixture = row.source_file === 'fixtures.csv'
  const status = isScheduledCsvFixture
    ? { short: 'NS', elapsed: null }
    : { short: 'FT', elapsed: 90 }
  const leagueFlag = leagueFlagInfo(row.league_country)

  return {
    fixture: {
      id: row.id,
      date: toIsoDateTime(row.fixture_date, row.kickoff_time),
      referee: row.referee,
      status,
      venue: { name: null },
    },
    league: {
      id: row.league_id,
      name: row.league_name,
      country: row.league_country,
      season: row.season_start_year,
      flag: leagueFlag.flag || null,
      countryCode: leagueFlag.countryCode || null,
      logo: null,
    },
    teams: {
      home: { id: row.home_team_id, name: row.home_team_name, logo: null },
      away: { id: row.away_team_id, name: row.away_team_name, logo: null },
    },
    goals: {
      home: isScheduledCsvFixture ? null : row.home_goals_ft,
      away: isScheduledCsvFixture ? null : row.away_goals_ft,
    },
    score: {
      halftime: {
        home: isScheduledCsvFixture ? null : (row.home_goals_ht ?? 0),
        away: isScheduledCsvFixture ? null : (row.away_goals_ht ?? 0),
      },
    },
    statistics: [
      statsBlock(row.home_team_id, row.home_team_name, {
        shots: row.hs_shots,
        shots_on_target: row.hs_shots_on_target,
        corners: row.hs_corners,
        fouls_committed: row.hs_fouls_committed,
        offsides: row.hs_offsides,
        yellow_cards: row.hs_yellow_cards,
        red_cards: row.hs_red_cards,
      }),
      statsBlock(row.away_team_id, row.away_team_name, {
        shots: row.as_shots,
        shots_on_target: row.as_shots_on_target,
        corners: row.as_corners,
        fouls_committed: row.as_fouls_committed,
        offsides: row.as_offsides,
        yellow_cards: row.as_yellow_cards,
        red_cards: row.as_red_cards,
      }),
    ],
  }
}

// Placeholder for Redis: replace this in-process cache with distributed cache lookups.
async function dbQueryCached(key, sql, params = [], ttlSeconds = 120) {
  const cached = cache.get(key)
  if (cached !== undefined) return cached
  const result = await dbPool.query(sql, params)
  cache.set(key, result.rows, ttlSeconds)
  return result.rows
}

const FIXTURE_SELECT = `
  SELECT
    f.id,
    f.source_file,
    f.fixture_date,
    f.kickoff_time,
    f.referee,
    f.home_goals_ft,
    f.away_goals_ft,
    f.home_goals_ht,
    f.away_goals_ht,
    l.id AS league_id,
    l.code AS league_code,
    l.name AS league_name,
    l.country AS league_country,
    s.start_year AS season_start_year,
    ht.id AS home_team_id,
    ht.name AS home_team_name,
    at.id AS away_team_id,
    at.name AS away_team_name,
    hs.shots AS hs_shots,
    hs.shots_on_target AS hs_shots_on_target,
    hs.corners AS hs_corners,
    hs.fouls_committed AS hs_fouls_committed,
    hs.offsides AS hs_offsides,
    hs.yellow_cards AS hs_yellow_cards,
    hs.red_cards AS hs_red_cards,
    aws.shots AS as_shots,
    aws.shots_on_target AS as_shots_on_target,
    aws.corners AS as_corners,
    aws.fouls_committed AS as_fouls_committed,
    aws.offsides AS as_offsides,
    aws.yellow_cards AS as_yellow_cards,
    aws.red_cards AS as_red_cards
  FROM fixtures f
  JOIN leagues l ON l.id = f.league_id
  JOIN seasons s ON s.id = f.season_id
  JOIN teams ht ON ht.id = f.home_team_id
  JOIN teams at ON at.id = f.away_team_id
  LEFT JOIN fixture_stats hs ON hs.fixture_id = f.id AND hs.side = 'H'
  LEFT JOIN fixture_stats aws ON aws.fixture_id = f.id AND aws.side = 'A'
`

async function getFixtureRowById(fixtureId) {
  const sql = `${FIXTURE_SELECT} WHERE f.id = $1 LIMIT 1`
  const rows = await dbQueryCached(`db:fixture:${fixtureId}`, sql, [fixtureId], 120)
  return rows[0] || null
}

async function getTeamHistoryRows(teamId, count, { homeOnly = false, awayOnly = false, season, league } = {}) {
  const filters = ['(f.home_team_id = $1 OR f.away_team_id = $1)']
  filters.push(`COALESCE(f.source_file, '') <> 'fixtures.csv'`)
  const params = [teamId]
  let idx = 2
  if (homeOnly) filters.push('f.home_team_id = $1')
  if (awayOnly) filters.push('f.away_team_id = $1')
  if (Number.isFinite(season)) {
    filters.push(`(s.start_year = $${idx} OR s.end_year = $${idx})`)
    params.push(season)
    idx += 1
  }
  if (Number.isFinite(league)) {
    filters.push(`l.id = $${idx}`)
    params.push(league)
    idx += 1
  }
  params.push(count)
  const limitParam = `$${idx}`

  const sql = `
    ${FIXTURE_SELECT}
    WHERE ${filters.join(' AND ')}
    ORDER BY f.fixture_date DESC, f.kickoff_time DESC NULLS LAST, f.id DESC
    LIMIT ${limitParam}
  `
  const cacheKey = `db:teamHistory:${teamId}:${count}:${homeOnly ? 1 : 0}:${awayOnly ? 1 : 0}:${season || ''}:${league || ''}`
  return dbQueryCached(cacheKey, sql, params, 90)
}

async function getH2HRows(teamA, teamB, count, { season, league } = {}) {
  const params = [teamA, teamB]
  const filters = ['((f.home_team_id = $1 AND f.away_team_id = $2) OR (f.home_team_id = $2 AND f.away_team_id = $1))']
  filters.push(`COALESCE(f.source_file, '') <> 'fixtures.csv'`)
  let idx = 3
  if (Number.isFinite(season)) {
    filters.push(`(s.start_year = $${idx} OR s.end_year = $${idx})`)
    params.push(season)
    idx += 1
  }
  if (Number.isFinite(league)) {
    filters.push(`l.id = $${idx}`)
    params.push(league)
    idx += 1
  }
  params.push(count)
  const limitParam = `$${idx}`

  const sql = `
    ${FIXTURE_SELECT}
    WHERE ${filters.join(' AND ')}
    ORDER BY f.fixture_date DESC, f.kickoff_time DESC NULLS LAST, f.id DESC
    LIMIT ${limitParam}
  `
  const cacheKey = `db:h2h:${teamA}:${teamB}:${count}:${season || ''}:${league || ''}`
  return dbQueryCached(cacheKey, sql, params, 120)
}

function normalizeLookupLabel(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function buildTeamAliasCandidates(teamName) {
  const aliases = new Set()
  const base = normalizeLookupLabel(teamName)
  if (!base) return []
  aliases.add(base)

  const trimmedWords = base
    .split(' ')
    .filter(Boolean)
    .filter(word => !['fc', 'cf', 'sc', 'afc', 'ac', 'club', 'de', 'cd'].includes(word))
    .join(' ')
    .trim()
  if (trimmedWords) aliases.add(trimmedWords)

  const withoutUnited = trimmedWords.replace(/\bunited\b/g, '').replace(/\s+/g, ' ').trim()
  if (withoutUnited) aliases.add(withoutUnited)

  const abbreviatedManchester = trimmedWords.replace(/\bmanchester\b/g, 'man').replace(/\s+/g, ' ').trim()
  if (abbreviatedManchester) aliases.add(abbreviatedManchester)

  const abbreviatedManchesterNoUnited = abbreviatedManchester.replace(/\bunited\b/g, '').replace(/\s+/g, ' ').trim()
  if (abbreviatedManchesterNoUnited) aliases.add(abbreviatedManchesterNoUnited)

  return [...aliases].filter(Boolean)
}

function scoreCanonicalTeamCandidate(teamName, aliases = [], fixtureCount = 0, countryMatch = 0) {
  const normalizedName = normalizeLookupLabel(teamName)
  if (!normalizedName) return -1

  let score = 0
  for (const alias of aliases) {
    if (!alias) continue
    if (normalizedName === alias) score = Math.max(score, 1000 - Math.abs(normalizedName.length - alias.length))
    else if (normalizedName.includes(alias)) score = Math.max(score, 820 - Math.abs(normalizedName.length - alias.length))
    else if (alias.includes(normalizedName)) score = Math.max(score, 760 - Math.abs(normalizedName.length - alias.length))
    else {
      const aliasTokens = alias.split(' ').filter(Boolean)
      const nameTokens = normalizedName.split(' ').filter(Boolean)
      const overlap = aliasTokens.filter(token => nameTokens.includes(token)).length
      if (overlap > 0) score = Math.max(score, 620 + overlap * 40 - Math.abs(nameTokens.length - aliasTokens.length) * 10)
    }
  }

  if (countryMatch) score += 80
  score += Math.min(Number(fixtureCount) || 0, 400)
  return score
}

async function resolveCanonicalLeagueId(leagueId, leagueName, country) {
  if (!leagueName || !country) return leagueId
  const sql = `
    SELECT
      l.id,
      COUNT(DISTINCT f.id)::int AS fixture_count
    FROM leagues l
    LEFT JOIN fixtures f ON f.league_id = l.id
      AND COALESCE(f.source_file, '') <> 'fixtures.csv'
    WHERE lower(l.name) = lower($1)
      AND lower(COALESCE(l.country, '')) = lower($2)
    GROUP BY l.id
    ORDER BY
      CASE WHEN l.id = $3 THEN 0 ELSE 1 END,
      COUNT(DISTINCT f.id) DESC,
      l.id ASC
    LIMIT 1
  `
  const rows = await dbQueryCached(`db:canonicalLeague:${leagueId}:${leagueName}:${country}`, sql, [leagueName, country, Number(leagueId) || -1], 300)
  const best = [...(rows || [])].sort((a, b) => {
    const aCount = Number(a.fixture_count || 0)
    const bCount = Number(b.fixture_count || 0)
    const aIsRequested = Number(a.id) === Number(leagueId)
    const bIsRequested = Number(b.id) === Number(leagueId)
    if (aCount > 0 || bCount > 0) {
      if (aCount !== bCount) return bCount - aCount
      if (aIsRequested !== bIsRequested) return aIsRequested ? -1 : 1
      return Number(a.id || 0) - Number(b.id || 0)
    }
    if (aIsRequested !== bIsRequested) return aIsRequested ? -1 : 1
    return Number(a.id || 0) - Number(b.id || 0)
  })[0]
  return Number(best?.id) || leagueId
}

async function resolveCanonicalTeamId(teamId, teamName, leagueCountry) {
  const aliases = buildTeamAliasCandidates(teamName)
  if (!aliases.length) return teamId
  const likePatterns = aliases.map(alias => `%${alias}%`)
  const sql = `
    SELECT
      t.id,
      t.name,
      COUNT(DISTINCT f.id)::int AS fixture_count,
      MAX(CASE WHEN lower(COALESCE(l.country, '')) = lower($2) THEN 1 ELSE 0 END)::int AS country_match
    FROM teams t
    LEFT JOIN fixtures f ON (f.home_team_id = t.id OR f.away_team_id = t.id)
      AND COALESCE(f.source_file, '') <> 'fixtures.csv'
    LEFT JOIN leagues l ON l.id = f.league_id
    WHERE lower(t.name) = ANY($1::text[])
      OR EXISTS (
        SELECT 1
        FROM unnest($3::text[]) AS pattern
        WHERE lower(t.name) LIKE pattern
      )
    GROUP BY t.id, t.name
    ORDER BY COUNT(DISTINCT f.id) DESC, length(t.name) ASC, t.id ASC
    LIMIT 40
  `
  const rows = await dbQueryCached(`db:canonicalTeam:${teamId}:${aliases.join('|')}:${leagueCountry || ''}`, sql, [aliases, leagueCountry || '', likePatterns], 300)
  const best = [...(rows || [])]
    .map(row => {
      const sameId = Number(row.id) === Number(teamId)
      const baseScore = scoreCanonicalTeamCandidate(row.name, aliases, row.fixture_count, row.country_match)
      return {
        ...row,
        matchScore: sameId && baseScore > 0 ? baseScore + 500 : baseScore,
        sameId,
      }
    })
    .sort((a, b) => {
      const aCount = Number(a.fixture_count || 0)
      const bCount = Number(b.fixture_count || 0)
      if (aCount > 0 || bCount > 0) {
        if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore
        if (Number(a.country_match || 0) !== Number(b.country_match || 0)) return Number(b.country_match || 0) - Number(a.country_match || 0)
        if (aCount !== bCount) return bCount - aCount
        if (a.sameId !== b.sameId) return a.sameId ? -1 : 1
        return Number(a.id || 0) - Number(b.id || 0)
      }
      if (a.matchScore !== b.matchScore) return b.matchScore - a.matchScore
      if (Number(a.country_match || 0) !== Number(b.country_match || 0)) return Number(b.country_match || 0) - Number(a.country_match || 0)
      if (aCount !== bCount) return bCount - aCount
      if (a.sameId !== b.sameId) return a.sameId ? -1 : 1
      return Number(a.id || 0) - Number(b.id || 0)
    })
    .find(row => Number(row.matchScore || 0) > 0)
  return Number(best?.id) || teamId
}

async function resolveCanonicalFixtureContext(row) {
  if (!row) return null
  const leagueCountry = row.league_country || ''
  const [homeTeamId, awayTeamId, leagueId] = await Promise.all([
    resolveCanonicalTeamId(row.home_team_id, row.home_team_name, leagueCountry),
    resolveCanonicalTeamId(row.away_team_id, row.away_team_name, leagueCountry),
    resolveCanonicalLeagueId(row.league_id, row.league_name, leagueCountry),
  ])
  return {
    homeTeamId,
    awayTeamId,
    leagueId,
    season: row.season_start_year,
  }
}

function mergeHistoryRows(rowSets, count, excludeFixtureId) {
  const byId = new Map()
  for (const rows of rowSets) {
    for (const row of rows || []) {
      if (!row || row.id === excludeFixtureId) continue
      if (!byId.has(row.id)) byId.set(row.id, row)
    }
  }
  return [...byId.values()]
    .sort((a, b) => {
      const aDate = new Date(toIsoDateTime(a.fixture_date, a.kickoff_time || '00:00:00')).getTime()
      const bDate = new Date(toIsoDateTime(b.fixture_date, b.kickoff_time || '00:00:00')).getTime()
      if (aDate !== bDate) return bDate - aDate
      return Number(b.id || 0) - Number(a.id || 0)
    })
    .slice(0, count)
}

async function getTeamHistoryRowsWithFallback(teamId, count, options = {}) {
  const { excludeFixtureId, homeOnly = false, awayOnly = false, season, league } = options
  const attempts = []
  const seen = new Set()

  function pushAttempt(nextSeason, nextLeague) {
    const key = `${nextSeason || ''}:${nextLeague || ''}:${homeOnly ? 1 : 0}:${awayOnly ? 1 : 0}`
    if (seen.has(key)) return
    seen.add(key)
    attempts.push({ season: nextSeason, league: nextLeague, homeOnly, awayOnly })
  }

  pushAttempt(season, league)
  if (Number.isFinite(season)) pushAttempt(season, undefined)
  if (Number.isFinite(league)) pushAttempt(undefined, league)
  pushAttempt(undefined, undefined)

  const results = []
  for (const attempt of attempts) {
    const rows = await getTeamHistoryRows(teamId, count + 5, attempt)
    results.push(rows)
    const merged = mergeHistoryRows(results, count, excludeFixtureId)
    if (merged.length >= count) return merged
  }

  return mergeHistoryRows(results, count, excludeFixtureId)
}

async function getH2HRowsWithFallback(teamA, teamB, count, options = {}) {
  const { excludeFixtureId, season, league } = options
  const attempts = []
  const seen = new Set()

  function pushAttempt(nextSeason, nextLeague) {
    const key = `${nextSeason || ''}:${nextLeague || ''}`
    if (seen.has(key)) return
    seen.add(key)
    attempts.push({ season: nextSeason, league: nextLeague })
  }

  pushAttempt(season, league)
  if (Number.isFinite(season)) pushAttempt(season, undefined)
  if (Number.isFinite(league)) pushAttempt(undefined, league)
  pushAttempt(undefined, undefined)

  const results = []
  for (const attempt of attempts) {
    const rows = await getH2HRows(teamA, teamB, count + 5, attempt)
    results.push(rows)
    const merged = mergeHistoryRows(results, count, excludeFixtureId)
    if (merged.length >= count) return merged
  }

  return mergeHistoryRows(results, count, excludeFixtureId)
}

async function getStandings(leagueId, season) {
  const params = [leagueId]
  const filters = ['ft.league_id = $1']
  let idx = 2
  if (Number.isFinite(season)) {
    filters.push(`(s.start_year = $${idx} OR s.end_year = $${idx})`)
    params.push(season)
  }

  const sql = `
    SELECT
      t.id AS team_id,
      t.name AS team_name,
      SUM(CASE WHEN ft.result = 'W' THEN 3 WHEN ft.result = 'D' THEN 1 ELSE 0 END)::int AS points,
      COUNT(*)::int AS played,
      SUM(CASE WHEN ft.result = 'W' THEN 1 ELSE 0 END)::int AS won,
      SUM(CASE WHEN ft.result = 'D' THEN 1 ELSE 0 END)::int AS drawn,
      SUM(CASE WHEN ft.result = 'L' THEN 1 ELSE 0 END)::int AS lost,
      SUM(ft.goals_for)::int AS goals_for,
      SUM(ft.goals_against)::int AS goals_against,
      (SUM(ft.goals_for) - SUM(ft.goals_against))::int AS goal_diff
    FROM fixture_teams ft
    JOIN seasons s ON s.id = ft.season_id
    JOIN teams t ON t.id = ft.team_id
    WHERE ${filters.join(' AND ')}
    GROUP BY t.id, t.name
    ORDER BY points DESC, goal_diff DESC, goals_for DESC, team_name ASC
  `
  const cacheKey = `db:standings:${leagueId}:${season || ''}`
  return dbQueryCached(cacheKey, sql, params, 300)
}

function toMappedFixture(row) {
  const raw = fixtureRowToApiShape(row)
  const mapped = mapFixture(raw)
  mapped.league.top = TOP_LEAGUE_CODES.has(row.league_code)
  return mapped
}

// ─── Routes ───────────────────────────────────────────────────────────────────

/**
 * GET /api/matches/:date
 * Fetch all fixtures for a given date (YYYY-MM-DD).
 */
app.get('/api/matches/:date', async (req, res) => {
  const { date } = req.params
  const tz = req.query.tz || 'Europe/Warsaw'
  try {
    if (DATA_MODE === 'db') {
      const sql = `
        ${FIXTURE_SELECT}
        WHERE f.fixture_date = $1
        ORDER BY f.kickoff_time ASC NULLS LAST, f.id ASC
      `
      const rows = await dbQueryCached(`db:matches:${date}`, sql, [date], 120)
      return res.json({ success: true, fromCache: false, data: rows.map(toMappedFixture) })
    }

    const { data, fromCache } = await apiFetch(
      'fixtures',
      { date, timezone: tz },
      TTL.fixtures,
    )
    res.json({ success: true, fromCache, data: data.map(mapFixture) })
  } catch (err) {
    console.error('[/api/matches]', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET /api/match/:id/statistics
 * Home + away stats for a finished / live fixture.
 */
app.get('/api/match/:id/statistics', async (req, res) => {
  const { id } = req.params
  const isLive  = req.query.live === 'true'
  try {
    if (DATA_MODE === 'db') {
      const row = await getFixtureRowById(Number(id))
      if (!row) return res.status(404).json({ success: false, error: 'Match not found' })
      const mapped = mapStatistics(fixtureRowToApiShape(row).statistics)
      return res.json({ success: true, fromCache: false, data: mapped })
    }

    const { data, fromCache } = await apiFetch(
      'fixtures/statistics',
      { fixture: id },
      isLive ? TTL.live : TTL.statistics,
    )
    res.json({ success: true, fromCache, data: mapStatistics(data) })
  } catch (err) {
    console.error('[/api/match/statistics]', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET /api/match/:id/events
 * Goals, cards, substitutions timeline.
 */
app.get('/api/match/:id/events', async (req, res) => {
  const { id } = req.params
  const isLive  = req.query.live === 'true'
  try {
    if (DATA_MODE === 'db') {
      return res.json({ success: true, fromCache: false, data: [] })
    }

    const { data, fromCache } = await apiFetch(
      'fixtures/events',
      { fixture: id },
      isLive ? TTL.live : TTL.events,
    )
    res.json({ success: true, fromCache, data: data.map(mapEvent) })
  } catch (err) {
    console.error('[/api/match/events]', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET /api/match/:id/lineups
 * Starting XI + bench + coach for both teams.
 */
app.get('/api/match/:id/lineups', async (req, res) => {
  const { id } = req.params
  try {
    if (DATA_MODE === 'db') {
      return res.json({ success: true, fromCache: false, data: [] })
    }

    const { data, fromCache } = await apiFetch(
      'fixtures/lineups',
      { fixture: id },
      TTL.lineups,
    )
    res.json({ success: true, fromCache, data: data.map(mapLineup) })
  } catch (err) {
    console.error('[/api/match/lineups]', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET /api/match/:id/players
 * Player stats for this fixture (both teams).
 */
app.get('/api/match/:id/players', async (req, res) => {
  const { id } = req.params
  try {
    if (DATA_MODE === 'db') {
      return res.json({ success: true, fromCache: false, data: [] })
    }

    const { data, fromCache } = await apiFetch(
      'fixtures/players',
      { fixture: id },
      TTL.players,
    )
    res.json({ success: true, fromCache, data: mapFixturePlayers(data) })
  } catch (err) {
    console.error('[/api/match/players]', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET /api/teams/:id/last-matches?count=10
 * Last N fixtures for a team (history entries).
 */
app.get('/api/teams/:id/last-matches', async (req, res) => {
  const { id }    = req.params
  const count     = Math.min(Number(req.query.count) || 10, 30)
  const season    = Number(req.query.season) || undefined
  const league    = Number(req.query.league) || undefined
  const withStats = String(req.query.stats || '').toLowerCase() === '1' || String(req.query.stats || '').toLowerCase() === 'true'
  try {
    if (DATA_MODE === 'db') {
      const teamId = Number(id)
      if (!Number.isFinite(teamId)) return res.status(400).json({ success: false, error: 'Invalid team id' })
      const seasonFilter = Number.isFinite(season) ? season : undefined
      const fixtureLeagueCountry = String(req.query.country || '').trim()
      const fixtureLeagueName = String(req.query.leagueName || '').trim()
      const canonicalLeagueId = await resolveCanonicalLeagueId(league, fixtureLeagueName, fixtureLeagueCountry)
      const canonicalTeamId = await resolveCanonicalTeamId(teamId, String(req.query.teamName || '').trim() || String(id), fixtureLeagueCountry)
      const rows = await getTeamHistoryRowsWithFallback(canonicalTeamId || teamId, count, { season: seasonFilter, league: canonicalLeagueId || league })
      const data = rows.map(row => {
        const fixture = fixtureRowToApiShape(row)
        if (!withStats) delete fixture.statistics
        return mapHistoryEntry(fixture, canonicalTeamId || teamId)
      })
      return res.json({ success: true, fromCache: false, data })
    }

    const params = { team: id, season, timezone: 'Europe/Warsaw' }
    if (league) params.league = league
    const { data, fromCache } = await fetchFixturesWithSeasonFallback(params, TTL.history)
    const normalized = (data || [])
      .filter(f => ['FT', 'AET', 'PEN'].includes(f?.fixture?.status?.short))
      .sort((a, b) => new Date(b?.fixture?.date || 0).getTime() - new Date(a?.fixture?.date || 0).getTime())
      .slice(0, count)
    let payload = normalized
    if (withStats) {
      const enriched = await Promise.allSettled(
        normalized.map(async f => {
          try {
            const { data: statsData } = await apiFetch('fixtures/statistics', { fixture: f.fixture.id }, TTL.statistics)
            return { ...f, statistics: statsData }
          } catch {
            return f
          }
        })
      )
      payload = enriched.filter(r => r.status === 'fulfilled').map(r => r.value)
    }

    res.json({
      success: true,
      fromCache,
      data: payload.map(f => mapHistoryEntry(f, Number(id))),
    })
  } catch (err) {
    console.error('[/api/teams/last-matches]', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET /api/head-to-head/:team1/:team2?count=10
 * Head-to-head history between two teams.
 */
app.get('/api/head-to-head/:team1/:team2', async (req, res) => {
  const { team1, team2 } = req.params
  const count = Math.min(Number(req.query.count) || 10, 20)
  const season = Number(req.query.season) || undefined
  const league = Number(req.query.league) || undefined
  try {
    if (DATA_MODE === 'db') {
      const teamA = Number(team1)
      const teamB = Number(team2)
      if (!Number.isFinite(teamA) || !Number.isFinite(teamB)) {
        return res.status(400).json({ success: false, error: 'Invalid team id' })
      }
      const country = String(req.query.country || '').trim()
      const leagueName = String(req.query.leagueName || '').trim()
      const homeTeamName = String(req.query.homeTeamName || '').trim()
      const awayTeamName = String(req.query.awayTeamName || '').trim()
      const canonicalLeagueId = await resolveCanonicalLeagueId(league, leagueName, country)
      const canonicalTeamA = await resolveCanonicalTeamId(teamA, homeTeamName || team1, country)
      const canonicalTeamB = await resolveCanonicalTeamId(teamB, awayTeamName || team2, country)
      const rows = await getH2HRowsWithFallback(canonicalTeamA || teamA, canonicalTeamB || teamB, count, { season, league: canonicalLeagueId || league })
      const data = rows.map(row => mapHistoryEntry(fixtureRowToApiShape(row), canonicalTeamA || teamA))
      return res.json({ success: true, fromCache: false, data })
    }

    const { data, fromCache } = await apiFetch(
      'fixtures/headtohead',
      { h2h: `${team1}-${team2}` },
      TTL.h2h,
    )
    const normalized = (data || [])
      .filter(f => !season || Number(f?.league?.season) === season)
      .filter(f => !league || Number(f?.league?.id) === league)
      .sort((a, b) => new Date(b?.fixture?.date || 0).getTime() - new Date(a?.fixture?.date || 0).getTime())
      .slice(0, count)
    res.json({
      success: true,
      fromCache,
      data: normalized.map(f => mapHistoryEntry(f, Number(team1))),
    })
  } catch (err) {
    console.error('[/api/head-to-head]', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET /api/match/:id/details
 * All data for a match in a single round-trip (fixture + stats + events + lineups).
 */
app.get('/api/match/:id/details', async (req, res) => {
  const { id } = req.params
  try {
    if (DATA_MODE === 'db') {
      const fixtureId = Number(id)
      if (!Number.isFinite(fixtureId)) return res.status(400).json({ success: false, error: 'Invalid fixture id' })
      const row = await getFixtureRowById(fixtureId)
      if (!row) return res.status(404).json({ success: false, error: 'Match not found' })

      const fixture = fixtureRowToApiShape(row)
      const mappedFixture = toMappedFixture(row)
      const context = await resolveCanonicalFixtureContext(row)
      const homeId = context?.homeTeamId || row.home_team_id
      const awayId = context?.awayTeamId || row.away_team_id
      const season = context?.season || row.season_start_year
      const leagueId = context?.leagueId || row.league_id

      const [homeHistoryRows, awayHistoryRows, h2hRows] = await Promise.all([
        getTeamHistoryRowsWithFallback(homeId, 20, { season, league: leagueId, excludeFixtureId: fixtureId }),
        getTeamHistoryRowsWithFallback(awayId, 20, { season, league: leagueId, excludeFixtureId: fixtureId }),
        getH2HRowsWithFallback(homeId, awayId, 15, { season, league: leagueId, excludeFixtureId: fixtureId }),
      ])

      const homeHistory = homeHistoryRows
        .slice(0, 15)
        .map(r => mapHistoryEntry(fixtureRowToApiShape(r), homeId))

      const awayHistory = awayHistoryRows
        .slice(0, 15)
        .map(r => mapHistoryEntry(fixtureRowToApiShape(r), awayId))

      const h2h = h2hRows
        .slice(0, 15)
        .map(r => mapHistoryEntry(fixtureRowToApiShape(r), homeId))

      return res.json({
        success: true,
        data: {
          fixture: mappedFixture,
          statistics: mapStatistics(fixture.statistics),
          events: [],
          lineups: [],
          players: [],
          squadPlayers: [],
          homeHistory,
          awayHistory,
          h2h,
        },
      })
    }

    const fallbackDate = String(req.query.date || '').trim()

    const [fixtureRes, statsRes, eventsRes, lineupsRes, playersRes] = await Promise.allSettled([
      apiFetch('fixtures',            { id },         TTL.fixtures),
      apiFetch('fixtures/statistics', { fixture: id }, TTL.statistics),
      apiFetch('fixtures/events',     { fixture: id }, TTL.events),
      apiFetch('fixtures/lineups',    { fixture: id }, TTL.lineups),
      apiFetch('fixtures/players',    { fixture: id }, TTL.players),
    ])

    let fixture = fixtureRes.value?.data?.[0]
    if (!fixture && /^\d{4}-\d{2}-\d{2}$/.test(fallbackDate)) {
      const fallbackFixturesRes = await apiFetch(
        'fixtures',
        { date: fallbackDate, timezone: 'Europe/Warsaw' },
        TTL.fixtures,
      )
      fixture = (fallbackFixturesRes?.data ?? []).find(item => String(item?.fixture?.id || '') === String(id))
    }
    if (!fixture) {
      return res.status(404).json({ success: false, error: 'Match not found' })
    }

    const homeId = fixture.teams.home.id
    const awayId = fixture.teams.away.id
    const season = Number(fixture?.league?.season) || new Date().getFullYear()
    const leagueId = Number(fixture?.league?.id) || undefined
    const [homeSquadRes, awaySquadRes] = await Promise.allSettled([
      apiFetch('players/squads', { team: homeId }, TTL.squads),
      apiFetch('players/squads', { team: awayId }, TTL.squads),
    ])
    const squadPlayersRaw = [
      ...mapSquadPlayers(homeSquadRes.value?.data ?? [], homeId, fixture?.teams?.home?.name || ''),
      ...mapSquadPlayers(awaySquadRes.value?.data ?? [], awayId, fixture?.teams?.away?.name || ''),
    ]
    const mappedFixturePlayers = mapFixturePlayers(playersRes.value?.data ?? [])
    const [players, squadPlayers] = await Promise.all([
      cachePlayersMedia(mappedFixturePlayers),
      cachePlayersMedia(squadPlayersRaw),
    ])

    // Fetch raw team history + h2h
    const homeParams = { team: homeId, season, timezone: 'Europe/Warsaw' }
    const awayParams = { team: awayId, season, timezone: 'Europe/Warsaw' }
    if (leagueId) {
      homeParams.league = leagueId
      awayParams.league = leagueId
    }
    const [homeHistRes, awayHistRes, h2hRes] = await Promise.allSettled([
      fetchFixturesWithSeasonFallback(homeParams, TTL.history),
      fetchFixturesWithSeasonFallback(awayParams, TTL.history),
      apiFetch('fixtures/headtohead', { h2h: `${homeId}-${awayId}` }, TTL.h2h),
    ])

    // Helper: enrich a list of fixtures with per-fixture statistics
    async function enrichWithStats(fixtures, teamId) {
      const results = await Promise.allSettled(
        (fixtures || []).map(async f => {
          try {
            const { data: sd } = await apiFetch('fixtures/statistics', { fixture: f.fixture.id }, TTL.statistics)
            return { ...f, statistics: sd }
          } catch { return f }
        })
      )
      return results
        .filter(r => r.status === 'fulfilled')
        .map(r => mapHistoryEntry(r.value, teamId))
    }

    const [homeHistory, awayHistory, h2h] = await Promise.all([
      enrichWithStats(
        (homeHistRes.value?.data ?? [])
          .filter(f => ['FT', 'AET', 'PEN'].includes(f?.fixture?.status?.short))
          .sort((a, b) => new Date(b?.fixture?.date || 0).getTime() - new Date(a?.fixture?.date || 0).getTime())
          .slice(0, 15),
        homeId
      ),
      enrichWithStats(
        (awayHistRes.value?.data ?? [])
          .filter(f => ['FT', 'AET', 'PEN'].includes(f?.fixture?.status?.short))
          .sort((a, b) => new Date(b?.fixture?.date || 0).getTime() - new Date(a?.fixture?.date || 0).getTime())
          .slice(0, 15),
        awayId
      ),
      Promise.resolve(
        (h2hRes.value?.data ?? [])
          .filter(f => !leagueId || Number(f?.league?.id) === leagueId)
          .filter(f => Number(f?.league?.season) === season)
          .sort((a, b) => new Date(b?.fixture?.date || 0).getTime() - new Date(a?.fixture?.date || 0).getTime())
          .slice(0, 15)
          .map(f => mapHistoryEntry(f, homeId))
      ),
    ])

    res.json({
      success: true,
      data: {
        fixture:    mapFixture(fixture),
        statistics: mapStatistics(statsRes.value?.data ?? []),
        events:     (eventsRes.value?.data ?? []).map(mapEvent),
        lineups:    (lineupsRes.value?.data ?? []).map(mapLineup),
        players,
        squadPlayers,
        homeHistory,
        awayHistory,
        h2h,
      },
    })
  } catch (err) {
    console.error('[/api/match/details]', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET /api/match/:id/historical-stats
 * Returns home + away last-10 history with all stat measures pre-computed,
 * ready for the Historical Stats tab in the frontend.
 * Also returns basic H2H data.
 */
app.get('/api/match/:id/historical-stats', async (req, res) => {
  const { id } = req.params
  try {
    if (DATA_MODE === 'db') {
      const fixtureId = Number(id)
      if (!Number.isFinite(fixtureId)) return res.status(400).json({ success: false, error: 'Invalid fixture id' })
      const row = await getFixtureRowById(fixtureId)
      if (!row) return res.status(404).json({ success: false, error: 'Match not found' })

      const context = await resolveCanonicalFixtureContext(row)
      const homeId = context?.homeTeamId || row.home_team_id
      const awayId = context?.awayTeamId || row.away_team_id
      const season = context?.season || row.season_start_year
      const leagueId = context?.leagueId || row.league_id

      const [homeHistoryRows, awayHistoryRows, h2hRows] = await Promise.all([
        getTeamHistoryRowsWithFallback(homeId, 20, { season, league: leagueId, excludeFixtureId: fixtureId }),
        getTeamHistoryRowsWithFallback(awayId, 20, { season, league: leagueId, excludeFixtureId: fixtureId }),
        getH2HRowsWithFallback(homeId, awayId, 15, { season, league: leagueId, excludeFixtureId: fixtureId }),
      ])

      const homeHistory = homeHistoryRows
        .slice(0, 15)
        .map(r => mapHistoryEntry(fixtureRowToApiShape(r), homeId))

      const awayHistory = awayHistoryRows
        .slice(0, 15)
        .map(r => mapHistoryEntry(fixtureRowToApiShape(r), awayId))

      const h2h = h2hRows
        .slice(0, 15)
        .map(r => mapHistoryEntry(fixtureRowToApiShape(r), homeId))

      return res.json({ success: true, data: { homeHistory, awayHistory, h2h } })
    }

    // First get the fixture to learn team IDs
    const { data: fixtureData } = await apiFetch('fixtures', { id }, TTL.fixtures)
    const fixture = fixtureData?.[0]
    if (!fixture) return res.status(404).json({ success: false, error: 'Match not found' })

    const homeId = fixture.teams.home.id
    const awayId = fixture.teams.away.id
    const season = Number(fixture?.league?.season) || new Date().getFullYear()
    const leagueId = Number(fixture?.league?.id) || undefined
    const homeParams = { team: homeId, season, timezone: 'Europe/Warsaw' }
    const awayParams = { team: awayId, season, timezone: 'Europe/Warsaw' }
    if (leagueId) {
      homeParams.league = leagueId
      awayParams.league = leagueId
    }

    const [homeRes, awayRes, h2hRes] = await Promise.allSettled([
      fetchFixturesWithSeasonFallback(homeParams, TTL.history),
      fetchFixturesWithSeasonFallback(awayParams, TTL.history),
      apiFetch('fixtures/headtohead', { h2h: `${homeId}-${awayId}` }, TTL.h2h),
    ])

    // For each history fixture, try to enrich with statistics (uses per-fixture cache)
    async function enrichHistory(fixtures, teamId) {
      const enriched = await Promise.allSettled(
        (fixtures || []).map(async f => {
          try {
            const { data: statsData } = await apiFetch(
              'fixtures/statistics',
              { fixture: f.fixture.id },
              TTL.statistics
            )
            return { ...f, statistics: statsData }
          } catch {
            return f // stats not available for this fixture
          }
        })
      )
      return enriched
        .filter(r => r.status === 'fulfilled')
        .map(r => mapHistoryEntry(r.value, teamId))
    }

    const [homeHistory, awayHistory, h2h] = await Promise.all([
      enrichHistory(
        (homeRes.value?.data ?? [])
          .filter(f => ['FT', 'AET', 'PEN'].includes(f?.fixture?.status?.short))
          .sort((a, b) => new Date(b?.fixture?.date || 0).getTime() - new Date(a?.fixture?.date || 0).getTime())
          .slice(0, 15),
        homeId
      ),
      enrichHistory(
        (awayRes.value?.data ?? [])
          .filter(f => ['FT', 'AET', 'PEN'].includes(f?.fixture?.status?.short))
          .sort((a, b) => new Date(b?.fixture?.date || 0).getTime() - new Date(a?.fixture?.date || 0).getTime())
          .slice(0, 15),
        awayId
      ),
      Promise.resolve(
        (h2hRes.value?.data ?? [])
          .filter(f => !leagueId || Number(f?.league?.id) === leagueId)
          .filter(f => Number(f?.league?.season) === season)
          .sort((a, b) => new Date(b?.fixture?.date || 0).getTime() - new Date(a?.fixture?.date || 0).getTime())
          .slice(0, 15)
          .map(f => mapHistoryEntry(f, homeId))
      ),
    ])

    res.json({
      success: true,
      data: { homeHistory, awayHistory, h2h },
    })
  } catch (err) {
    console.error('[/api/match/historical-stats]', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

/** GET /api/health – liveness check */
app.get('/fixtures/:id', async (req, res) => {
  try {
    const fixtureId = Number(req.params.id)
    if (!Number.isFinite(fixtureId)) return res.status(400).json({ success: false, error: 'Invalid fixture id' })
    const row = await getFixtureRowById(fixtureId)
    if (!row) return res.status(404).json({ success: false, error: 'Match not found' })

    const fixture = fixtureRowToApiShape(row)
    const context = await resolveCanonicalFixtureContext(row)
    const homeId = context?.homeTeamId || row.home_team_id
    const awayId = context?.awayTeamId || row.away_team_id
    const season = context?.season || row.season_start_year
    const leagueId = context?.leagueId || row.league_id
    const [homeHistoryRows, awayHistoryRows, h2hRows] = await Promise.all([
      getTeamHistoryRowsWithFallback(homeId, 20, { season, league: leagueId, excludeFixtureId: fixtureId }),
      getTeamHistoryRowsWithFallback(awayId, 20, { season, league: leagueId, excludeFixtureId: fixtureId }),
      getH2HRowsWithFallback(homeId, awayId, 15, { season, league: leagueId, excludeFixtureId: fixtureId }),
    ])

    const homeHistory = homeHistoryRows.slice(0, 15).map(r => mapHistoryEntry(fixtureRowToApiShape(r), homeId))
    const awayHistory = awayHistoryRows.slice(0, 15).map(r => mapHistoryEntry(fixtureRowToApiShape(r), awayId))
    const h2h = h2hRows.slice(0, 15).map(r => mapHistoryEntry(fixtureRowToApiShape(r), homeId))

    return res.json({
      success: true,
      data: {
        fixture: toMappedFixture(row),
        statistics: mapStatistics(fixture.statistics),
        events: [],
        lineups: [],
        players: [],
        squadPlayers: [],
        homeHistory,
        awayHistory,
        h2h,
      },
    })
  } catch (err) {
    console.error('[/fixtures/:id]', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/team/:id/last/:count', async (req, res) => {
  try {
    const teamId = Number(req.params.id)
    const count = clampCount(req.params.count, 10, 20)
    if (!Number.isFinite(teamId)) return res.status(400).json({ success: false, error: 'Invalid team id' })
    const rows = await getTeamHistoryRowsWithFallback(teamId, count)
    return res.json({ success: true, data: rows.map(row => mapHistoryEntry(fixtureRowToApiShape(row), teamId)) })
  } catch (err) {
    console.error('[/team/:id/last/:count]', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/team/:id/home-last/:count', async (req, res) => {
  try {
    const teamId = Number(req.params.id)
    const count = clampCount(req.params.count, 10, 20)
    if (!Number.isFinite(teamId)) return res.status(400).json({ success: false, error: 'Invalid team id' })
    const rows = await getTeamHistoryRowsWithFallback(teamId, count, { homeOnly: true })
    return res.json({ success: true, data: rows.map(row => mapHistoryEntry(fixtureRowToApiShape(row), teamId)) })
  } catch (err) {
    console.error('[/team/:id/home-last/:count]', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/team/:id/away-last/:count', async (req, res) => {
  try {
    const teamId = Number(req.params.id)
    const count = clampCount(req.params.count, 10, 20)
    if (!Number.isFinite(teamId)) return res.status(400).json({ success: false, error: 'Invalid team id' })
    const rows = await getTeamHistoryRowsWithFallback(teamId, count, { awayOnly: true })
    return res.json({ success: true, data: rows.map(row => mapHistoryEntry(fixtureRowToApiShape(row), teamId)) })
  } catch (err) {
    console.error('[/team/:id/away-last/:count]', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/h2h/:teamA/:teamB', async (req, res) => {
  try {
    const teamA = Number(req.params.teamA)
    const teamB = Number(req.params.teamB)
    const count = clampCount(req.query.count || 10, 10, 20)
    if (!Number.isFinite(teamA) || !Number.isFinite(teamB)) return res.status(400).json({ success: false, error: 'Invalid team ids' })
    const rows = await getH2HRowsWithFallback(teamA, teamB, count)
    return res.json({ success: true, data: rows.map(row => mapHistoryEntry(fixtureRowToApiShape(row), teamA)) })
  } catch (err) {
    console.error('[/h2h/:teamA/:teamB]', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/league/:id/standings', async (req, res) => {
  try {
    const leagueId = Number(req.params.id)
    const season = req.query.season ? Number(req.query.season) : undefined
    if (!Number.isFinite(leagueId)) return res.status(400).json({ success: false, error: 'Invalid league id' })
    const table = await getStandings(leagueId, season)
    return res.json({
      success: true,
      data: table.map((row, idx) => ({
        rank: idx + 1,
        teamId: row.team_id,
        team: row.team_name,
        points: row.points,
        played: row.played,
        won: row.won,
        drawn: row.drawn,
        lost: row.lost,
        goalsFor: row.goals_for,
        goalsAgainst: row.goals_against,
        goalDiff: row.goal_diff,
      })),
    })
  } catch (err) {
    console.error('[/league/:id/standings]', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/news/espn-football', async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 8, 1), 20)
  const feedUrls = [
    'https://www.espn.com/espn/rss/soccer/news',
    'https://www.espn.com/espn/rss/news',
  ]

  try {
    let items = []
    for (const feedUrl of feedUrls) {
      try {
        const response = await fetch(feedUrl)
        if (!response.ok) continue
        const xml = await response.text()
        items = parseRssItems(xml)
        if (items.length > 0) break
      } catch {
        // Try next URL
      }
    }

    const filtered = items
      .filter(i => /soccer|football|premier league|champions league|la liga|serie a|bundesliga|ligue 1/i.test(`${i.title} ${i.description}`))
      .slice(0, limit)
      .map(i => ({
        source: 'ESPN',
        title: i.title,
        blurb: i.description,
        url: i.link?.startsWith('http') ? i.link : '',
        image: i.image || null,
        publishedAt: i.pubDate || null,
      }))

    res.json({ success: true, data: filtered })
  } catch (err) {
    console.error('[/api/news/espn-football]', err.message)
    res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/news/article', async (req, res) => {
  try {
    const rawUrl = String(req.query.url || '').trim()
    if (!rawUrl) return res.status(400).json({ success: false, error: 'Missing url query param' })

    let parsedUrl
    try {
      parsedUrl = new URL(rawUrl)
    } catch {
      return res.status(400).json({ success: false, error: 'Invalid URL' })
    }

    if (!/^https?:$/.test(parsedUrl.protocol)) {
      return res.status(400).json({ success: false, error: 'Unsupported URL protocol' })
    }
    if (!isAllowedNewsArticleHost(parsedUrl.hostname)) {
      return res.status(400).json({ success: false, error: 'Unsupported article host' })
    }

    const response = await fetch(parsedUrl.toString(), {
      headers: {
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        accept: 'text/html,application/xhtml+xml',
      },
    })
    if (!response.ok) {
      return res.status(502).json({ success: false, error: `Article fetch failed (${response.status})` })
    }

    const html = await response.text()
    const article = parseArticlePage(html, parsedUrl.toString())
    return res.json({ success: true, data: article })
  } catch (err) {
    console.error('[/api/news/article]', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/billing/subscription', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId
    const email = req.auth.email
    const explicitCountry = String(req.query.country || '').trim()
    const locale = String(req.query.locale || '').trim()
    const profileCountry = String(req.auth.userMetadata?.country || '').trim()
    const key = billingUserKey({ userId, email })
    const store = await loadBillingStore()
    const record = store.users[key] || {
      user_id: userId || null,
      email: email || null,
      country: inferCountry({ explicitCountry, profileCountry, locale }),
      plan: BILLING_PLANS.FREE,
      subscription: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    const effectiveCountry = inferCountry({
      explicitCountry,
      profileCountry: record.country || profileCountry,
      locale,
    })
    const subscription = record.subscription || null
    const accessPlan = accessPlanFromSubscription(subscription) || BILLING_PLANS.FREE
    const payload = {
      plan: accessPlan,
      country: effectiveCountry,
      payment_methods: paymentMethodsForCountry(effectiveCountry),
      subscription: subscription
        ? {
            provider: subscription.provider || 'stripe',
            status: subscription.status || 'inactive',
            cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
            current_period_end: subscription.current_period_end || null,
          }
        : {
            provider: 'stripe',
            status: 'inactive',
            cancel_at_period_end: false,
            current_period_end: null,
          },
    }
    if (!store.users[key]) {
      store.users[key] = { ...record, country: effectiveCountry }
      await saveBillingStore(store)
    }
    return res.json({ success: true, data: payload })
  } catch (err) {
    console.error('[/api/billing/subscription]', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/billing/checkout-session', requireAuth, async (req, res) => {
  try {
    const body = req.body || {}
    const userId = req.auth.userId
    const email = req.auth.email
    const key = billingUserKey({ userId, email })
    if (!key) return res.status(400).json({ success: false, error: 'Missing authenticated user.' })

    const plan = normalizePlan(body.plan)
    if (plan === BILLING_PLANS.FREE) {
      return res.status(400).json({ success: false, error: 'Free plan does not require checkout.' })
    }

    const store = await loadBillingStore()
    const record = store.users[key] || {
      user_id: userId || null,
      email: email || null,
      country: null,
      plan: BILLING_PLANS.FREE,
      subscription: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }

    const country = inferCountry({
      explicitCountry: body.country,
      profileCountry: record.country || req.auth.userMetadata?.country,
      locale: body.locale,
    })
    const stripePaymentTypes = ['card']
    const currency = countryCurrency(country)
    const successUrl = `${FRONTEND_URL}/subscription?payment=success&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${FRONTEND_URL}/subscription?payment=cancel`

    if (canUseMockBilling()) {
      const id = `${MOCK_CHECKOUT_PREFIX}${Date.now()}`
      const now = Date.now()
      const periodEnd = new Date(now + 30 * 24 * 60 * 60 * 1000).toISOString()
      store.sessions[id] = {
        id,
        user_key: key,
        plan,
        country,
        status: 'paid',
        created_at: new Date().toISOString(),
      }
      store.users[key] = {
        ...record,
        country,
        plan,
        subscription: {
          provider: 'stripe',
          status: 'active',
          plan,
          current_period_end: periodEnd,
          cancel_at_period_end: false,
        },
        updated_at: new Date().toISOString(),
      }
      await saveBillingStore(store)
      return res.json({
        success: true,
        data: { id, url: `${FRONTEND_URL}/subscription?payment=success&session_id=${id}` },
      })
    }
    if (!isStripeConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Stripe billing is not configured. Set Stripe keys or enable ALLOW_MOCK_BILLING for local development.',
      })
    }

    const metadata = {
      userId: userId || '',
      email: email || '',
      planId: plan,
      country,
    }
    const payload = {
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      ...(email ? { customer_email: email } : {}),
      'payment_method_types[0]': 'card',
      ...Object.entries(metadata).reduce((acc, [k, v]) => {
        acc[`metadata[${k}]`] = String(v || '')
        return acc
      }, {}),
    }
    const priceId = plan === BILLING_PLANS.PREMIUM_YEARLY ? STRIPE_PRICE_PREMIUM_YEARLY : STRIPE_PRICE_PREMIUM_MONTHLY
    if (priceId) {
      payload['line_items[0][price]'] = priceId
      payload['line_items[0][quantity]'] = '1'
    } else {
      const amount = getPlanPriceCents(plan, currency)
      payload['line_items[0][quantity]'] = '1'
      payload['line_items[0][price_data][currency]'] = currency
      payload['line_items[0][price_data][unit_amount]'] = String(amount)
      payload['line_items[0][price_data][recurring][interval]'] = plan === BILLING_PLANS.PREMIUM_YEARLY ? 'year' : 'month'
      payload['line_items[0][price_data][product_data][name]'] = plan === BILLING_PLANS.PREMIUM_YEARLY ? 'Stats Wise Premium Yearly' : 'Stats Wise Premium Monthly'
    }

    const session = await stripeFormPost('checkout/sessions', payload)
    store.sessions[session.id] = {
      id: session.id,
      user_key: key,
      plan,
      country,
      status: 'pending',
      created_at: new Date().toISOString(),
    }
    store.users[key] = { ...record, country, updated_at: new Date().toISOString() }
    await saveBillingStore(store)
    return res.json({ success: true, data: { id: session.id, url: session.url } })
  } catch (err) {
    console.error('[/api/billing/checkout-session]', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/billing/cancel', requireAuth, async (req, res) => {
  try {
    const userId = req.auth.userId
    const email = req.auth.email
    const key = billingUserKey({ userId, email })
    if (!key) return res.status(400).json({ success: false, error: 'Missing authenticated user.' })

    const store = await loadBillingStore()
    const record = store.users[key]
    if (!record?.subscription) return res.status(404).json({ success: false, error: 'No active subscription found.' })

    if (isStripeConfigured() && record.subscription.stripe_subscription_id) {
      try {
        await stripeFormPost(`subscriptions/${record.subscription.stripe_subscription_id}`, {
          cancel_at_period_end: 'true',
        })
      } catch (e) {
        console.error('[stripe cancel_at_period_end]', e.message)
      }
    }

    record.subscription = applyCancelAtPeriodEnd(record.subscription)
    record.updated_at = new Date().toISOString()
    store.users[key] = record
    await saveBillingStore(store)
    return res.json({
      success: true,
      data: {
        status: record.subscription.status,
        cancel_at_period_end: true,
        current_period_end: record.subscription.current_period_end || null,
      },
    })
  } catch (err) {
    console.error('[/api/billing/cancel]', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

app.post('/api/billing/webhook/stripe', async (req, res) => {
  try {
    if (!STRIPE_WEBHOOK_SECRET) {
      return res.status(503).json({ success: false, error: 'Stripe webhook secret is not configured.' })
    }

    const signatureHeader = req.headers['stripe-signature']
    if (!verifyStripeWebhookSignature(req.rawBody, signatureHeader, STRIPE_WEBHOOK_SECRET)) {
      return res.status(400).json({ success: false, error: 'Invalid Stripe signature.' })
    }

    const event = req.body || {}
    const eventId = String(event.id || '')
    const eventType = String(event.type || '')
    const obj = event?.data?.object || {}
    const store = await loadBillingStore()
    if (eventId && store.processedEvents[eventId]) {
      return res.json({ success: true, data: { idempotent: true } })
    }

    const md = obj?.metadata || {}
    const key = billingUserKey({ userId: md.userId, email: md.email })
    if (key) {
      const record = store.users[key] || {
        user_id: md.userId || null,
        email: md.email || null,
        country: md.country || 'Other',
        plan: BILLING_PLANS.FREE,
        subscription: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      const mapStatus = (s) => {
        if (s === 'active' || s === 'canceled' || s === 'past_due' || s === 'incomplete') return s
        return 'active'
      }
      if (eventType === 'checkout.session.completed' || eventType === 'customer.subscription.created' || eventType === 'customer.subscription.updated') {
        const plan = normalizePlan(md.planId || record.subscription?.plan || BILLING_PLANS.PREMIUM_MONTHLY)
        const periodEndTs = obj.current_period_end ? Number(obj.current_period_end) * 1000 : Date.now() + 30 * 24 * 60 * 60 * 1000
        record.plan = plan
        record.subscription = {
          provider: 'stripe',
          stripe_subscription_id: obj.subscription || obj.id || record.subscription?.stripe_subscription_id || null,
          status: mapStatus(obj.status),
          plan,
          current_period_end: new Date(periodEndTs).toISOString(),
          cancel_at_period_end: Boolean(obj.cancel_at_period_end),
        }
      } else if (eventType === 'customer.subscription.deleted') {
        record.subscription = {
          ...(record.subscription || {}),
          provider: 'stripe',
          status: 'canceled',
          cancel_at_period_end: true,
        }
      } else if (eventType === 'invoice.payment_failed') {
        record.subscription = {
          ...(record.subscription || {}),
          provider: 'stripe',
          status: 'past_due',
        }
      }
      record.updated_at = new Date().toISOString()
      store.users[key] = record
    }
    if (eventId) store.processedEvents[eventId] = new Date().toISOString()
    await saveBillingStore(store)
    return res.json({ success: true })
  } catch (err) {
    console.error('[/api/billing/webhook/stripe]', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/billing/checkout-status/:sessionId', requireAuth, async (req, res) => {
  try {
    const sessionId = String(req.params.sessionId || '')
    if (!sessionId) return res.status(400).json({ success: false, error: 'Missing session id.' })
    const store = await loadBillingStore()
    const sessionRecord = store.sessions[sessionId]
    const expectedUserKey = billingUserKey({ userId: req.auth.userId, email: req.auth.email })

    if (sessionRecord?.user_key && sessionRecord.user_key !== expectedUserKey) {
      return res.status(403).json({ success: false, error: 'Forbidden.' })
    }

    if (sessionId.startsWith(MOCK_CHECKOUT_PREFIX) && !sessionRecord) {
      return res.status(404).json({ success: false, error: 'Checkout session not found.' })
    }

    if (sessionRecord?.status === 'paid' || sessionId.startsWith(MOCK_CHECKOUT_PREFIX)) {
      return res.json({ success: true, data: { id: sessionId, paid: true } })
    }

    if (canUseMockBilling()) {
      return res.json({ success: true, data: { id: sessionId, paid: false } })
    }

    if (!isStripeConfigured()) {
      return res.status(503).json({ success: false, error: 'Stripe billing is not configured on backend.' })
    }
    const session = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    }).then(async r => {
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error?.message || `Stripe error ${r.status}`)
      return data
    })
    const paid = session.payment_status === 'paid' || session.status === 'complete'
    if (sessionRecord) {
      sessionRecord.status = paid ? 'paid' : sessionRecord.status
      store.sessions[sessionId] = sessionRecord
      await saveBillingStore(store)
    }
    return res.json({ success: true, data: { id: sessionId, paid, status: session.status } })
  } catch (err) {
    console.error('[/api/billing/checkout-status]', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * POST /api/payments/checkout
 * body: { plan: 'monthly'|'yearly', country, paymentMethod: 'p24'|'blik'|'stripe'|'applepay'|'googlepay', email }
 */
app.post('/api/payments/checkout', async (req, res) => {
  try {
    const {
      plan = 'monthly',
      country = 'Poland',
      paymentMethod,
      email = '',
    } = req.body || {}

    const normalizedPlan = plan === 'yearly' ? 'yearly' : 'monthly'
    const currency = countryCurrency(country)
    const selectedMethod = paymentMethod || 'stripe'
    const stripeMethod = selectedMethod === 'apple_pay' ? 'card' : 'card'

    const amount = getPlanPriceCents(normalizedPlan, currency)
    const successUrl = `${FRONTEND_URL}/subscription?payment=success&plan=${encodeURIComponent(normalizedPlan)}&session_id={CHECKOUT_SESSION_ID}`
    const cancelUrl = `${FRONTEND_URL}/subscription?payment=cancel`

    if (canUseMockBilling()) {
      const mockId = `${MOCK_CHECKOUT_PREFIX}${Date.now()}`
      const mockUrl = `${FRONTEND_URL}/subscription?payment=success&plan=${encodeURIComponent(normalizedPlan)}&session_id=${mockId}`
      return res.json({
        success: true,
        data: {
          id: mockId,
          url: mockUrl,
          provider: 'mock',
          note: 'Stripe key is not configured. Mock checkout was used for local testing.',
        },
      })
    }
    if (!isStripeConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Stripe payments are not configured on backend. Set Stripe keys or enable ALLOW_MOCK_BILLING for local development.',
      })
    }

    const payload = {
      mode: 'payment',
      'payment_method_types[0]': stripeMethod,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': currency,
      'line_items[0][price_data][product_data][name]': normalizedPlan === 'yearly' ? 'BetWise Premium Yearly' : 'BetWise Premium Monthly',
      'line_items[0][price_data][unit_amount]': String(amount),
      success_url: successUrl,
      cancel_url: cancelUrl,
      'metadata[plan]': normalizedPlan,
      'metadata[country]': country,
      'metadata[payment_method]': selectedMethod,
    }
    if (email) payload.customer_email = email

    const session = await stripeFormPost('checkout/sessions', payload)

    return res.json({
      success: true,
      data: {
        id: session.id,
        url: session.url,
        provider: stripeMethod === 'card' ? 'stripe' : stripeMethod,
      },
    })
  } catch (err) {
    console.error('[/api/payments/checkout]', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

/**
 * GET /api/payments/checkout-status/:sessionId
 */
app.get('/api/payments/checkout-status/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params

    if (sessionId.startsWith(MOCK_CHECKOUT_PREFIX)) {
      if (!canUseMockBilling()) {
        return res.status(404).json({ success: false, error: 'Checkout session not found.' })
      }
      return res.json({
        success: true,
        data: {
          id: sessionId,
          paid: true,
          paymentStatus: 'paid',
          metadata: { mode: 'mock' },
        },
      })
    }

    if (!isStripeConfigured()) {
      return res.status(503).json({ success: false, error: 'Stripe is not configured on backend.' })
    }
    const session = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
    }).then(async r => {
      const data = await r.json()
      if (!r.ok) throw new Error(data?.error?.message || `Stripe error ${r.status}`)
      return data
    })

    const paid = session.payment_status === 'paid'
    return res.json({
      success: true,
      data: {
        id: session.id,
        paid,
        paymentStatus: session.payment_status,
        metadata: session.metadata || {},
      },
    })
  } catch (err) {
    console.error('[/api/payments/checkout-status]', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/odds/bookmakers', async (req, res) => {
  try {
    const dateRaw = String(req.query.date || '').trim()
    const dateStr = /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
      ? dateRaw
      : new Date().toISOString().slice(0, 10)

    const data = await fetchBookmakerOddsByDate(dateStr)
    return res.json({
      success: true,
      data: {
        date: dateStr,
        provider: ODDS_PROVIDER,
        bookmakers: ODDS_BOOKMAKERS,
        events: data,
      },
    })
  } catch (err) {
    console.error('[/api/odds/bookmakers]', err.message)
    return res.status(500).json({ success: false, error: err.message })
  }
})

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() })
})

// ─── Mappers ──────────────────────────────────────────────────────────────────

const TOP_LEAGUE_IDS = new Set([39,140,78,135,61,106,88,94,2,3])

function mapFixture(f) {
  const homeGoals = f.goals?.home ?? null
  const awayGoals = f.goals?.away ?? null
  const status    = f.fixture.status.short
  const isLive    = ['1H','HT','2H','ET','BT','P'].includes(status)
  const leagueFlag = leagueFlagInfo(f.league.country, f.league.flag)

  return {
    id: f.fixture.id,
    league: {
      id:      f.league.id,
      name:    f.league.name,
      country: f.league.country,
      season:  f.league.season,
      flag:    leagueFlag.flag || null,
      countryCode: leagueFlag.countryCode || null,
      logo:    f.league.logo,
      top:     TOP_LEAGUE_IDS.has(f.league.id),
    },
    homeTeam: {
      id:    f.teams.home.id,
      name:  f.teams.home.name,
      short: f.teams.home.name.substring(0,3).toUpperCase(),
      logo:  f.teams.home.logo,
    },
    awayTeam: {
      id:    f.teams.away.id,
      name:  f.teams.away.name,
      short: f.teams.away.name.substring(0,3).toUpperCase(),
      logo:  f.teams.away.logo,
    },
    homeTeamId: f.teams.home.id,
    awayTeamId: f.teams.away.id,
    date:       f.fixture.date,
    time:       new Date(f.fixture.date).toLocaleTimeString('pl-PL', {
                  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw',
                }),
    status,
    isLive,
    homeGoals,
    awayGoals,
    elapsed:    f.fixture.status.elapsed,
    htHome:     f.score?.halftime?.home ?? null,
    htAway:     f.score?.halftime?.away ?? null,
    venue:      f.fixture.venue?.name,
    referee:    f.fixture.referee,
  }
}

function mapStatistics(raw = []) {
  if (!raw || raw.length < 2) return null
  const get = (teamStats, type) => {
    const entry = teamStats.statistics?.find(s => s.type === type)
    return Number(entry?.value) || 0
  }
  const parse = (ts) => ({
    teamId:       ts.team?.id,
    teamName:     ts.team?.name,
    teamLogo:     ts.team?.logo,
    shots:        get(ts, 'Shots on Goal'),
    shotsTotal:   get(ts, 'Total Shots'),
    corners:      get(ts, 'Corner Kicks'),
    fouls:        get(ts, 'Fouls'),
    yellowCards:  get(ts, 'Yellow Cards'),
    redCards:     get(ts, 'Red Cards'),
    offsides:     get(ts, 'Offsides'),
    possession:   get(ts, 'Ball Possession'),
    passes:       get(ts, 'Total passes'),
    passAccuracy: get(ts, 'Passes accurate'),
    saves:        get(ts, 'Goalkeeper Saves'),
    blocks:       get(ts, 'Blocked Shots'),
    xg:           get(ts, 'expected_goals'),
  })
  return { home: parse(raw[0]), away: parse(raw[1]) }
}

function mapEvent(e) {
  return {
    time:      e.time?.elapsed,
    timeExtra: e.time?.extra,
    team: {
      id:   e.team?.id,
      name: e.team?.name,
      logo: e.team?.logo,
    },
    player: {
      id:   e.player?.id,
      name: e.player?.name,
    },
    assist: e.assist?.name ? { id: e.assist.id, name: e.assist.name } : null,
    type:   e.type,    // 'Goal', 'Card', 'subst', 'Var'
    detail: e.detail,  // 'Normal Goal', 'Yellow Card', etc.
    comments: e.comments,
  }
}

function mapLineup(l) {
  return {
    team: {
      id:     l.team?.id,
      name:   l.team?.name,
      logo:   l.team?.logo,
      colors: l.team?.colors,
    },
    coach:      { id: l.coach?.id, name: l.coach?.name, photo: l.coach?.photo },
    formation:  l.formation,
    startXI:    (l.startXI || []).map(p => mapPlayer(p.player)),
    substitutes: (l.substitutes || []).map(p => mapPlayer(p.player)),
  }
}

function mapPlayer(p) {
  return {
    id:     p?.id,
    name:   p?.name,
    number: p?.number,
    pos:    p?.pos,
    grid:   p?.grid,
  }
}

function mapFixturePlayers(raw = []) {
  if (!Array.isArray(raw)) return []
  const rows = []
  raw.forEach(teamBlock => {
    const team = teamBlock?.team || {}
    ;(teamBlock?.players || []).forEach(entry => {
      const p = entry?.player || {}
      const s = entry?.statistics?.[0] || {}
      const games = s?.games || {}
      const shots = s?.shots || {}
      const goals = s?.goals || {}
      const fouls = s?.fouls || {}
      const cards = s?.cards || {}

      rows.push({
        id: p?.id ?? null,
        name: p?.name ?? '',
        team: team?.name ?? '',
        teamId: team?.id ?? null,
        teamLogo: team?.logo ?? null,
        number: games?.number ?? null,
        grid: null,
        posCode: games?.position ?? null,
        position: games?.position ?? 'Player',
        nationality: p?.nationality ?? '-',
        age: p?.age ?? null,
        photo: p?.photo ?? null,
        stats: {
          goals: Number(goals?.total) || 0,
          assists: Number(goals?.assists) || 0,
          shots: Number(shots?.total) || 0,
          shotsOnTarget: Number(shots?.on) || 0,
          foulsCommitted: Number(fouls?.committed) || 0,
          foulsDrawn: Number(fouls?.drawn) || 0,
          offsides: Number(s?.offsides) || 0,
          yellowCards: Number(cards?.yellow) || 0,
          redCards: Number(cards?.red) || 0,
          rating: Number(s?.games?.rating) || 0,
        },
      })
    })
  })
  return rows
}

function mapSquadPlayers(raw = [], fallbackTeamId = null, fallbackTeamName = '') {
  if (!Array.isArray(raw)) return []
  const rows = []
  raw.forEach(block => {
    const team = block?.team || {}
    ;(block?.players || []).forEach(p => {
      rows.push({
        id: p?.id ?? null,
        name: p?.name ?? '',
        team: team?.name || fallbackTeamName || '',
        teamId: team?.id || fallbackTeamId,
        teamLogo: team?.logo || null,
        number: p?.number ?? null,
        posCode: p?.position || null,
        position: p?.position || 'Player',
        age: p?.age ?? null,
        nationality: p?.nationality || '-',
        photo: p?.photo || null,
      })
    })
  })
  return rows
}

function mapHistoryEntry(f, perspectiveTeamId) {
  const isHome     = Number(f.teams.home.id) === Number(perspectiveTeamId)
  const hg         = f.goals?.home ?? 0
  const ag         = f.goals?.away ?? 0
  const myGoals    = isHome ? hg : ag
  const theirGoals = isHome ? ag : hg
  const result     = myGoals > theirGoals ? 'W' : myGoals < theirGoals ? 'L' : 'D'

  const stats = f.statistics ?? []
  const get   = (idx, type) => {
    const entry = stats[idx]?.statistics?.find(s => s.type === type)
    return Number(entry?.value) || 0
  }

  const htHome = f.score?.halftime?.home ?? 0
  const htAway = f.score?.halftime?.away ?? 0
  const fhg    = htHome + htAway
  const shg    = Math.max(0, (hg + ag) - fhg)

  const homeCorners = get(0,'Corner Kicks')
  const awayCorners = get(1,'Corner Kicks')
  const homeFouls = get(0,'Fouls')
  const awayFouls = get(1,'Fouls')
  const homeOffsides = get(0,'Offsides')
  const awayOffsides = get(1,'Offsides')
  const homeShotsTotal = get(0,'Total Shots')
  const awayShotsTotal = get(1,'Total Shots')
  const homeShotsOnTarget = get(0,'Shots on Goal')
  const awayShotsOnTarget = get(1,'Shots on Goal')
  const homeCards = get(0,'Yellow Cards') + get(0,'Red Cards')
  const awayCards = get(1,'Yellow Cards') + get(1,'Red Cards')

  const myCorners = isHome ? homeCorners : awayCorners
  const theirCorners = isHome ? awayCorners : homeCorners
  const myFouls = isHome ? homeFouls : awayFouls
  const theirFouls = isHome ? awayFouls : homeFouls
  const myOffsides = isHome ? homeOffsides : awayOffsides
  const theirOffsides = isHome ? awayOffsides : homeOffsides
  const myShotsTotal = isHome ? homeShotsTotal : awayShotsTotal
  const theirShotsTotal = isHome ? awayShotsTotal : homeShotsTotal
  const myShotsOnTarget = isHome ? homeShotsOnTarget : awayShotsOnTarget
  const theirShotsOnTarget = isHome ? awayShotsOnTarget : homeShotsOnTarget
  const myCards = isHome ? homeCards : awayCards
  const theirCards = isHome ? awayCards : homeCards
  const myFirstHalfGoals = isHome ? htHome : htAway
  const theirFirstHalfGoals = isHome ? htAway : htHome

  return {
    fixtureId:       f.fixture.id,
    date:            f.fixture.date,
    opponent:        isHome ? f.teams.away.name : f.teams.home.name,
    opponentLogo:    isHome ? f.teams.away.logo : f.teams.home.logo,
    opponentId:      isHome ? f.teams.away.id   : f.teams.home.id,
    isHome,
    homeGoals:       hg,
    awayGoals:       ag,
    myGoals,
    theirGoals,
    goals:           hg + ag,
    btts:            hg > 0 && ag > 0,
    result,
    corners:         get(0,'Corner Kicks')  + get(1,'Corner Kicks'),
    fouls:           get(0,'Fouls')         + get(1,'Fouls'),
    cards:           get(0,'Yellow Cards')  + get(1,'Yellow Cards') + get(0,'Red Cards') + get(1,'Red Cards'),
    offsides:        get(0,'Offsides')      + get(1,'Offsides'),
    shots:           get(0,'Shots on Goal') + get(1,'Shots on Goal'),
    totalShots:      homeShotsTotal + awayShotsTotal,
    shotsOnTarget:   homeShotsOnTarget + awayShotsOnTarget,
    myCorners,
    theirCorners,
    myCards,
    theirCards,
    myFouls,
    theirFouls,
    myOffsides,
    theirOffsides,
    myShotsTotal,
    theirShotsTotal,
    myShotsOnTarget,
    theirShotsOnTarget,
    firstHalfGoals:  fhg,
    secondHalfGoals: shg,
    myFirstHalfGoals,
    theirFirstHalfGoals,
    bothHalvesGoals: fhg > 0 && shg > 0,
    league: { id: f.league.id, name: f.league.name, logo: f.league.logo },
  }
}

// ─── Start ────────────────────────────────────────────────────────────────────
function stripHtml(value = '') {
  return value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

function decodeXml(value = '') {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

function getTag(block, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const match = block.match(regex)
  return match ? stripHtml(decodeXml(match[1])) : ''
}

function parseRssItems(xml = '') {
  const blocks = xml.match(/<item[\s\S]*?<\/item>/gi) || []
  return blocks.map(block => ({
    title: getTag(block, 'title'),
    link: getTag(block, 'link'),
    description: getTag(block, 'description'),
    pubDate: getTag(block, 'pubDate'),
    image: getRssImage(block),
  }))
}

function getTagRaw(block, tag) {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i')
  const match = block.match(regex)
  return match ? decodeXml(match[1]).trim() : ''
}

function getMetaContent(html, key, attr = 'property') {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(`<meta[^>]*${attr}=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i')
  const match = html.match(regex)
  return match ? decodeXml(match[1]).trim() : ''
}

function getRssImage(itemBlock = '') {
  const fromMediaThumb = itemBlock.match(/<media:thumbnail[^>]*url=["']([^"']+)["'][^>]*\/?>/i)?.[1]
  if (fromMediaThumb) return decodeXml(fromMediaThumb)

  const fromMediaContent = itemBlock.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*\/?>/i)?.[1]
  if (fromMediaContent) return decodeXml(fromMediaContent)

  const fromEnclosure = itemBlock.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*\/?>/i)?.[1]
  if (fromEnclosure) return decodeXml(fromEnclosure)

  const descriptionRaw = getTagRaw(itemBlock, 'description')
  const fromDescImg = descriptionRaw.match(/<img[^>]*src=["']([^"']+)["'][^>]*>/i)?.[1]
  if (fromDescImg) return decodeXml(fromDescImg)

  return null
}

function normalizedParagraphsFromHtml(html = '') {
  const paragraphMatches = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
  return paragraphMatches
    .map(m => stripHtml(m[1] || ''))
    .map(v => decodeXml(v))
    .map(v => stripVideoPromoText(v))
    .map(v => v.replace(/\s+/g, ' ').trim())
    .filter(v => v.length > 40)
    .filter(v => isReadableText(v))
    .filter((v, idx, arr) => arr.indexOf(v) === idx)
}

function normalizedParagraphsFromSegment(htmlSegment = '') {
  return normalizedParagraphsFromHtml(htmlSegment).filter(v => !isLikelyNewsNoise(v))
}

function isLikelyNewsNoise(value = '') {
  const v = String(value || '').toLowerCase()
  if (!v) return true
  if (/where to watch|summary\s+report\s+commentary|statistics\s+line-?ups?\s+videos|facebook\s+messenger\s+twitter\s+email/.test(v)) return true
  if (/search\s+[a-z0-9].*v\s+[a-z0-9]/.test(v)) return true
  if (/agg\.\s*\d+-\d+/.test(v)) return true
  if (/^play\s+/.test(v)) return true
  if (/\(\d{1,2}:\d{2}(?::\d{2})?\)/.test(v)) return true
  return false
}

function stripVideoPromoText(value = '') {
  let v = String(value || '')
  v = v.replace(/^play\s+[^.?!]*\(\d{1,2}:\d{2}(?::\d{2})?\)\s*/i, '')
  v = v.replace(/^[^.?!]*\breact to\b[^.?!]*[.?!]\s*/i, '')
  v = v.replace(/\(\d{1,2}:\d{2}(?::\d{2})?\)/g, '')
  v = v.replace(/\s+/g, ' ').trim()
  return v
}

function parseJsonSafe(value = '') {
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

function collectJsonLdBodies(node, acc = []) {
  if (!node) return acc
  if (Array.isArray(node)) {
    node.forEach(item => collectJsonLdBodies(item, acc))
    return acc
  }
  if (typeof node !== 'object') return acc

  const candidates = [node.articleBody, node.description, node.text]
  candidates.forEach(v => {
    if (typeof v === 'string' && v.trim().length > 80) acc.push(v.trim())
  })

  Object.values(node).forEach(v => collectJsonLdBodies(v, acc))
  return acc
}

function getArticleBodyFromJsonLd(html = '') {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
  const bodies = []
  for (const match of scripts) {
    const raw = (match[1] || '').trim()
    if (!raw) continue
    const parsed = parseJsonSafe(raw)
    if (!parsed) continue
    collectJsonLdBodies(parsed, bodies)
  }

  const cleaned = bodies
    .map(v => stripHtml(v))
    .map(v => decodeXml(v))
    .map(v => v.replace(/\s+/g, ' ').trim())
    .filter(v => isReadableText(v))
    .filter((v, idx, arr) => arr.indexOf(v) === idx)
    .sort((a, b) => b.length - a.length)

  return cleaned[0] || ''
}

function isReadableText(value = '') {
  const v = String(value || '').replace(/\s+/g, ' ').trim()
  if (v.length < 60) return false
  if (/[{}<>]/.test(v)) return false
  if (/(window\.|document\.|function\s*\(|=>|__dataLayer|<script|var\s+[A-Za-z_$])/i.test(v)) return false

  const alpha = (v.match(/[A-Za-z]/g) || []).length
  const spaces = (v.match(/\s/g) || []).length
  const chars = v.length
  const readableRatio = (alpha + spaces) / chars
  if (readableRatio < 0.65) return false

  return true
}

function firstSentences(text = '', count = 2) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim()
  if (!normalized) return ''
  const matches = normalized.match(/[^.!?]+[.!?]+(?:["')\]]+)?/g) || []
  const picked = matches.slice(0, count).map(s => s.trim()).filter(Boolean)
  if (picked.length >= 1) return picked.join(' ')
  return normalized
}

function parseArticlePage(html = '', url = '') {
  const hostname = new URL(url).hostname.toLowerCase()
  const titleFromOg = getMetaContent(html, 'og:title')
  const titleFromTag = stripHtml(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '')
  const blurbFromOg = getMetaContent(html, 'og:description')
  const blurbFromMeta = getMetaContent(html, 'description', 'name')
  const image = getMetaContent(html, 'og:image') || null

  const articleBlock = html.match(/<article[\s\S]*?<\/article>/i)?.[0] || html
  const articleParagraphs = normalizedParagraphsFromSegment(articleBlock)
  const pageParagraphs = normalizedParagraphsFromSegment(html)

  let espnParagraphs = []
  if (hostname.includes('espn.com')) {
    const bodyIdx = html.indexOf('Story__Body')
    if (bodyIdx >= 0) {
      const storyWindow = html.slice(bodyIdx, bodyIdx + 90000)
      espnParagraphs = normalizedParagraphsFromSegment(storyWindow)
    }
  }

  const prioritized = espnParagraphs.length >= 2
    ? espnParagraphs
    : (articleParagraphs.length >= 3 ? articleParagraphs : pageParagraphs)
  const paragraphs = prioritized.slice(0, 80)
  const paragraphContent = paragraphs.join('\n\n')

  const jsonLdBody = getArticleBodyFromJsonLd(html)
  const fallbackBlurb = blurbFromOg || blurbFromMeta || ''

  let content = paragraphContent
  if (jsonLdBody.length > content.length) content = jsonLdBody
  if (content.length < 220 && fallbackBlurb.length > content.length) content = fallbackBlurb
  if (!isReadableText(content) && fallbackBlurb.length >= 40) content = fallbackBlurb
  if (content.length > 12000) content = content.slice(0, 12000).trim()
  content = firstSentences(content, 2)

  return {
    source: new URL(url).hostname.replace(/^www\./, ''),
    url,
    title: titleFromOg || titleFromTag || '',
    blurb: fallbackBlurb,
    image,
    content,
    paragraphs,
  }
}

function isAllowedNewsArticleHost(hostname = '') {
  const normalized = String(hostname || '').trim().toLowerCase()
  return NEWS_ARTICLE_HOST_ALLOWLIST.some(allowed => normalized === allowed || normalized.endsWith(`.${allowed}`))
}

function verifyStripeWebhookSignature(rawBody, signatureHeader, secret) {
  if (!rawBody || !signatureHeader || !secret) return false

  const parts = String(signatureHeader)
    .split(',')
    .map(part => part.trim())
    .filter(Boolean)
  const timestamp = parts.find(part => part.startsWith('t='))?.slice(2)
  const signatures = parts
    .filter(part => part.startsWith('v1='))
    .map(part => part.slice(3))
    .filter(Boolean)

  if (!timestamp || signatures.length === 0) return false

  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp))
  if (!Number.isFinite(ageSeconds) || ageSeconds > 300) return false

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`, 'utf8')
    .digest('hex')

  return signatures.some(signature => {
    try {
      return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))
    } catch {
      return false
    }
  })
}

const server = app.listen(PORT, HOST, () => {
  console.log(`Backend running on http://${HOST}:${PORT}`)
})
server.on('error', (error) => {
  if (error?.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use on host ${HOST}.`)
    process.exit(1)
  }

  throw error
})
