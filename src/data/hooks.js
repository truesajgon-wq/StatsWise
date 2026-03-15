import { useState, useEffect, useCallback } from 'react'
import {
  fetchFixturesByDate,
  fetchTeamHistory,
  fetchH2H,
  isMockMode,
} from './api.js'
import { ALL_FIXTURES } from './mockData.js'

// ─── In-memory session cache ──────────────────────────────────────────────────
const cache = new Map()

function cacheGet(key) {
  return cache.get(key) // undefined if missing
}

function cacheSet(key, value) {
  // Never store empty arrays — allows the next request to retry the API
  if (Array.isArray(value) && value.length === 0) return
  cache.set(key, value)
}

function hasApiKey() {
  return !isMockMode()
}

function getMockFixturesForDate(dateStr) {
  const target = new Date(dateStr)
  const targetDay = target.toISOString().split('T')[0]
  return ALL_FIXTURES.filter(f => {
    const fDay = f.date instanceof Date
      ? f.date.toISOString().split('T')[0]
      : new Date(f.date).toISOString().split('T')[0]
    return fDay === targetDay
  })
}

// ─── Concurrency-limited parallel execution ───────────────────────────────────
async function runWithConcurrency(tasks, concurrency = 8) {
  const results = new Array(tasks.length)
  let idx = 0

  async function worker() {
    while (idx < tasks.length) {
      const i = idx++
      try {
        results[i] = { status: 'fulfilled', value: await tasks[i]() }
      } catch (err) {
        results[i] = { status: 'rejected', reason: err }
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker())
  )
  return results
}

// ─── useFixturesByDate ────────────────────────────────────────────────────────
export function useFixturesByDate(dateStr) {
  const [fixtures, setFixtures] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [usingMock, setUsingMock] = useState(false)

  const load = useCallback(async () => {
    if (!dateStr) return
    setLoading(true)
    setError(null)

    const cacheKey = `fixtures-${dateStr}`
    const cached = cache.get(cacheKey) // bypass empty-drop guard for fixture lists
    if (cached) {
      setFixtures(cached.data)
      setUsingMock(cached.mock)
      setLoading(false)
      return
    }

    if (!hasApiKey()) {
      const mockData = getMockFixturesForDate(dateStr)
      cache.set(cacheKey, { data: mockData, mock: true })
      setFixtures(mockData)
      setUsingMock(true)
      setLoading(false)
      return
    }

    try {
      const data = await fetchFixturesByDate(dateStr)
      cache.set(cacheKey, { data, mock: false })
      setFixtures(data)
      setUsingMock(false)
    } catch (err) {
      console.warn('API fetch failed:', err.message)
      setFixtures([])
      setUsingMock(false)
      setError(err.message || 'Failed to fetch fixtures from API')
    } finally {
      setLoading(false)
    }
  }, [dateStr])

  useEffect(() => { load() }, [load])

  // Mock live-score ticker
  useEffect(() => {
    if (!usingMock) return
    const interval = setInterval(() => {
      setFixtures(prev => {
        const hasLive = prev.some(f => f.isLive)
        if (!hasLive) return prev
        return prev.map(f => {
          if (!f.isLive) return f
          const newElapsed = Math.min((f.elapsed || 67) + 1, 90)
          const goalEvent = Math.random() < 0.08
          const homeScores = goalEvent && Math.random() > 0.5
          const awayScores = goalEvent && !homeScores
          return {
            ...f,
            elapsed: newElapsed,
            homeGoals: f.homeGoals + (homeScores ? 1 : 0),
            awayGoals: f.awayGoals + (awayScores ? 1 : 0),
            status: newElapsed >= 90 ? 'FT' : 'LIVE',
            isLive: newElapsed < 90,
          }
        })
      })
    }, 30000)
    return () => clearInterval(interval)
  }, [usingMock])

  return { fixtures, loading, error, usingMock, refetch: load }
}

// ─── useMatchHistory ──────────────────────────────────────────────────────────
// Used on the MatchDetails page. Requests 20 matches so venue filtering
// (home/away) leaves ~10 per direction for meaningful stats.
export function useMatchHistory(fixture) {
  const [homeHistory, setHomeHistory] = useState([])
  const [awayHistory, setAwayHistory] = useState([])
  const [h2h, setH2H] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const homeId       = fixture?.homeTeamId ?? fixture?.homeTeam?.id
  const awayId       = fixture?.awayTeamId ?? fixture?.awayTeam?.id
  const season       = Number(fixture?.league?.season) || new Date().getFullYear()
  const league       = Number(fixture?.league?.id) || undefined
  const leagueName   = String(fixture?.league?.name   || '').trim()
  const country      = String(fixture?.league?.country || '').trim()
  const homeTeamName = String(fixture?.homeTeam?.name  || '').trim()
  const awayTeamName = String(fixture?.awayTeam?.name  || '').trim()

  // Use embedded history only in mock mode (it won't have API data)
  const hasEmbeddedHistory = !!(fixture?.homeHistory?.length && fixture?.awayHistory?.length)

  useEffect(() => {
    if (!fixture) return

    if (hasEmbeddedHistory && !hasApiKey()) {
      setHomeHistory(fixture.homeHistory)
      setAwayHistory(fixture.awayHistory)
      setH2H(fixture.h2h ?? [])
      setLoading(false)
      return
    }

    if (!homeId || !awayId) return

    const cacheKey = `match-history-v3-${homeId}-${awayId}-${season}-${league || 'all'}-${leagueName}-${country}`
    const cached = cacheGet(cacheKey)
    if (cached) {
      setHomeHistory(cached.homeHistory)
      setAwayHistory(cached.awayHistory)
      setH2H(cached.h2h)
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)

    // 30 matches per team so venue filtering gives ~15 per direction (enough for L15 range)
    Promise.all([
      fetchTeamHistory(homeId, 30, { season, league, leagueName, country, teamName: homeTeamName }),
      fetchTeamHistory(awayId, 30, { season, league, leagueName, country, teamName: awayTeamName }),
      fetchH2H(homeId, awayId, 15, { season, league, leagueName, country, homeTeamName, awayTeamName }),
    ])
      .then(([home, away, head]) => {
        const result = { homeHistory: home, awayHistory: away, h2h: head }
        if (home.length > 0 || away.length > 0) {
          cacheSet(cacheKey, result)
        }
        setHomeHistory(home)
        setAwayHistory(away)
        setH2H(head)
      })
      .catch(err => {
        console.warn('useMatchHistory API failed:', err.message)
        if (isMockMode() && fixture?.homeHistory) {
          setHomeHistory(fixture.homeHistory)
          setAwayHistory(fixture.awayHistory ?? [])
          setH2H(fixture.h2h ?? [])
        } else {
          setError(err.message)
        }
      })
      .finally(() => setLoading(false))
  }, [homeId, awayId, hasEmbeddedHistory, fixture, season, league, leagueName, country, homeTeamName, awayTeamName])

  return { homeHistory, awayHistory, h2h, loading, error }
}

// ─── useEnrichedFixtures ──────────────────────────────────────────────────────
// Bulk-enriches a fixture list with history + H2H.
// Key improvements vs previous version:
//  • Parallel fetching (concurrency=8) instead of sequential
//  • Empty results never cached → retried on next load
//  • maxFixtures default raised to 200 (effectively unlimited for normal days)
//  • Results returned in original fixture order (not sorted order)
export function useEnrichedFixtures(fixtures, enabled = false, options = {}) {
  const [data, setData]       = useState(fixtures || [])
  const [loading, setLoading] = useState(false)

  const includeH2H   = options?.includeH2H === true
  const withStats    = options?.withStats   === true
  const maxFixtures  = Number(options?.maxFixtures) > 0 ? Number(options.maxFixtures) : 200
  const historyCount = Number(options?.historyCount) > 0 ? Number(options.historyCount) : 20
  const h2hCount     = Number(options?.h2hCount)     > 0 ? Number(options.h2hCount)     : 10

  // Keep data in sync with fixtures list (shows raw fixtures while enrichment runs)
  useEffect(() => {
    setData(fixtures || [])
  }, [fixtures])

  useEffect(() => {
    let cancelled = false
    if (!enabled || !fixtures?.length) return

    const needsEnrich = fixtures.some(f => !f.homeHistory?.length || !f.awayHistory?.length)
    if (!needsEnrich) return

    setLoading(true)

    ;(async () => {
      // Sort for priority: top-league fixtures get enriched first
      const prioritised = [...fixtures].sort((a, b) => {
        const aTop = a?.league?.top ? 0 : 1
        const bTop = b?.league?.top ? 0 : 1
        if (aTop !== bTop) return aTop - bTop
        return new Date(a?.date || 0).getTime() - new Date(b?.date || 0).getTime()
      })

      // Build a map of result by fixture id (start with originals)
      const resultMap = new Map(fixtures.map(f => [f.id, f]))

      // Collect fixtures that need API enrichment
      const toFetch = []
      for (const fixture of prioritised) {
        // Already has embedded history
        if (fixture.homeHistory?.length && fixture.awayHistory?.length) continue

        const homeId = fixture?.homeTeamId ?? fixture?.homeTeam?.id
        const awayId = fixture?.awayTeamId ?? fixture?.awayTeam?.id
        if (!homeId || !awayId) continue

        const leagueName = String(fixture?.league?.name   || '').trim()
        const country    = String(fixture?.league?.country || '').trim()
        const fixtureKey = `fixture-enriched-v3-${fixture.id}-${historyCount}-${h2hCount}-${withStats ? 1 : 0}-${includeH2H ? 1 : 0}`

        const fixtureCached = cacheGet(fixtureKey)
        if (fixtureCached) {
          resultMap.set(fixture.id, { ...fixture, ...fixtureCached })
          continue
        }

        toFetch.push({ fixture, fixtureKey, homeId, awayId, leagueName, country })
      }

      // Apply any fixture-level cache hits immediately so UI updates fast
      if (!cancelled) setData(fixtures.map(f => resultMap.get(f.id) || f))

      // Cap and build parallel fetch tasks
      const capped = toFetch.slice(0, maxFixtures)

      const tasks = capped.map(({ fixture, fixtureKey, homeId, awayId, leagueName, country }) => async () => {
        if (cancelled) return

        const season       = Number(fixture?.league?.season) || new Date().getFullYear()
        const league       = Number(fixture?.league?.id)     || undefined
        const homeTeamName = String(fixture?.homeTeam?.name  || '').trim()
        const awayTeamName = String(fixture?.awayTeam?.name  || '').trim()

        const homeKey = `team-history-v3-${homeId}-${historyCount}-${league || 'all'}-${leagueName}-${country}-${withStats ? 1 : 0}`
        const awayKey = `team-history-v3-${awayId}-${historyCount}-${league || 'all'}-${leagueName}-${country}-${withStats ? 1 : 0}`
        const h2hKey  = `h2h-v3-${homeId}-${awayId}-${season}-${league || 'all'}-${leagueName}-${country}-${h2hCount}`

        const homeCached = cacheGet(homeKey)   // undefined = not cached / was empty
        const awayCached = cacheGet(awayKey)
        const h2hCached  = includeH2H ? cacheGet(h2hKey) : null

        const [homeRes, awayRes, h2hRes] = await Promise.allSettled([
          homeCached != null
            ? Promise.resolve(homeCached)
            : fetchTeamHistory(homeId, historyCount, { season, league, leagueName, country, teamName: homeTeamName, withStats }),
          awayCached != null
            ? Promise.resolve(awayCached)
            : fetchTeamHistory(awayId, historyCount, { season, league, leagueName, country, teamName: awayTeamName, withStats }),
          includeH2H
            ? (h2hCached?.length ? Promise.resolve(h2hCached) : fetchH2H(homeId, awayId, h2hCount, { season, league, leagueName, country, homeTeamName, awayTeamName }))
            : Promise.resolve([]),
        ])

        const homeHistory = homeRes.status === 'fulfilled' ? (homeRes.value || []) : (fixture.homeHistory || [])
        const awayHistory = awayRes.status === 'fulfilled' ? (awayRes.value || []) : (fixture.awayHistory || [])
        const h2h         = h2hRes.status  === 'fulfilled' ? (h2hRes.value  || []) : (fixture.h2h        || [])

        // Only cache non-empty results so empty responses are retried next time
        if (homeRes.status === 'fulfilled' && homeHistory.length > 0) cacheSet(homeKey, homeHistory)
        if (awayRes.status === 'fulfilled' && awayHistory.length > 0) cacheSet(awayKey, awayHistory)
        if (includeH2H && h2hRes.status === 'fulfilled' && h2h.length > 0) cacheSet(h2hKey, h2h)

        const enriched = { homeHistory, awayHistory, h2h }
        if (homeHistory.length > 0 || awayHistory.length > 0) cacheSet(fixtureKey, enriched)

        if (!cancelled) resultMap.set(fixture.id, { ...fixture, ...enriched })
      })

      // Run all tasks in parallel with a concurrency limit
      await runWithConcurrency(tasks, 8)

      if (!cancelled) {
        // Reconstruct in original fixture order
        setData(fixtures.map(f => resultMap.get(f.id) || f))
        setLoading(false)
      }
    })().catch(() => {
      if (!cancelled) setLoading(false)
    })

    return () => { cancelled = true }
  }, [fixtures, enabled, includeH2H, withStats, maxFixtures, historyCount, h2hCount])

  return { fixtures: data, loading }
}
