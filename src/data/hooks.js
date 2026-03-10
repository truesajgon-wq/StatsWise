import { useState, useEffect, useCallback } from 'react'
import {
  fetchFixturesByDate,
  fetchTeamHistory,
  fetchH2H,
  isMockMode,
} from './api.js'
import { ALL_FIXTURES } from './mockData.js'

const cache = new Map()

function cacheGet(key) { return cache.get(key) }
function cacheSet(key, value) { cache.set(key, value) }

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
    const cached = cacheGet(cacheKey)
    if (cached) {
      setFixtures(cached.data)
      setUsingMock(cached.mock)
      setLoading(false)
      return
    }

    if (!hasApiKey()) {
      const mockData = getMockFixturesForDate(dateStr)
      cacheSet(cacheKey, { data: mockData, mock: true })
      setFixtures(mockData)
      setUsingMock(true)
      setLoading(false)
      return
    }

    try {
      const data = await fetchFixturesByDate(dateStr)
      cacheSet(cacheKey, { data, mock: false })
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

export function useMatchHistory(fixture) {
  const [homeHistory, setHomeHistory] = useState([])
  const [awayHistory, setAwayHistory] = useState([])
  const [h2h, setH2H] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const homeId = fixture?.homeTeamId ?? fixture?.homeTeam?.id
  const awayId = fixture?.awayTeamId ?? fixture?.awayTeam?.id
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

    const cacheKey = `history-${homeId}-${awayId}`
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

    Promise.all([
      fetchTeamHistory(homeId, 10),
      fetchTeamHistory(awayId, 10),
      fetchH2H(homeId, awayId, 10),
    ])
      .then(([home, away, head]) => {
        const result = { homeHistory: home, awayHistory: away, h2h: head }
        cacheSet(cacheKey, result)
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
  }, [homeId, awayId, hasEmbeddedHistory, fixture])

  return { homeHistory, awayHistory, h2h, loading, error }
}

export function useEnrichedFixtures(fixtures, enabled = false, options = {}) {
  const [data, setData] = useState(fixtures || [])
  const [loading, setLoading] = useState(false)
  const includeH2H = options?.includeH2H === true
  const withStats = options?.withStats === true
  const maxFixtures = Number(options?.maxFixtures) > 0 ? Number(options.maxFixtures) : 24
  const historyCount = Number(options?.historyCount) > 0 ? Math.min(Number(options.historyCount), 20) : 10
  const h2hCount = Number(options?.h2hCount) > 0 ? Math.min(Number(options.h2hCount), 20) : 10

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
      const result = []
      let enrichedCount = 0

      const orderedFixtures = [...fixtures].sort((a, b) => {
        const aTop = a?.league?.top ? 0 : 1
        const bTop = b?.league?.top ? 0 : 1
        if (aTop !== bTop) return aTop - bTop
        const ad = new Date(a?.date || 0).getTime()
        const bd = new Date(b?.date || 0).getTime()
        return ad - bd
      })
      for (const fixture of orderedFixtures) {
        if (cancelled) return
        if (fixture.homeHistory?.length && fixture.awayHistory?.length) {
          result.push(fixture)
          continue
        }
        if (enrichedCount >= maxFixtures) {
          result.push(fixture)
          continue
        }

        const homeId = fixture?.homeTeamId ?? fixture?.homeTeam?.id
        const awayId = fixture?.awayTeamId ?? fixture?.awayTeam?.id
        if (!homeId || !awayId) {
          result.push(fixture)
          continue
        }

        const cacheKey = `fixture-enriched-${fixture.id}-${historyCount}-${h2hCount}-${withStats ? 1 : 0}-${includeH2H ? 1 : 0}`
        const cached = cacheGet(cacheKey)
        if (cached) {
          result.push({ ...fixture, ...cached })
          continue
        }

        const season = Number(fixture?.league?.season) || new Date().getFullYear()
        const league = Number(fixture?.league?.id) || undefined
        const homeKey = `team-history-${homeId}-${historyCount}`
        const awayKey = `team-history-${awayId}-${historyCount}`
        const h2hKey = `h2h-${homeId}-${awayId}-${season}-${league || 'all'}-${h2hCount}`

        const homeCached = cacheGet(homeKey)
        const awayCached = cacheGet(awayKey)
        const h2hCached = includeH2H ? cacheGet(h2hKey) : []

        const [homeRes, awayRes, h2hRes] = await Promise.allSettled([
          homeCached ? Promise.resolve(homeCached) : fetchTeamHistory(homeId, historyCount, { season, league, withStats }),
          awayCached ? Promise.resolve(awayCached) : fetchTeamHistory(awayId, historyCount, { season, league, withStats }),
          includeH2H
            ? (h2hCached?.length ? Promise.resolve(h2hCached) : fetchH2H(homeId, awayId, h2hCount, { season, league }))
            : Promise.resolve([]),
        ])

        const homeHistory = homeRes.status === 'fulfilled' ? homeRes.value : (fixture.homeHistory || [])
        const awayHistory = awayRes.status === 'fulfilled' ? awayRes.value : (fixture.awayHistory || [])
        const h2h = h2hRes.status === 'fulfilled' ? h2hRes.value : (fixture.h2h || [])

        if (homeRes.status === 'fulfilled') cacheSet(homeKey, homeHistory)
        if (awayRes.status === 'fulfilled') cacheSet(awayKey, awayHistory)
        if (includeH2H && h2hRes.status === 'fulfilled') cacheSet(h2hKey, h2h)

        const enriched = { homeHistory, awayHistory, h2h }
        cacheSet(cacheKey, enriched)
        enrichedCount += 1
        result.push({ ...fixture, ...enriched })
      }

      if (!cancelled) setData(result)
      if (!cancelled) setLoading(false)
    })()
      .catch(() => {
        if (!cancelled) setLoading(false)
      })

    return () => { cancelled = true }
  }, [fixtures, enabled, includeH2H, withStats, maxFixtures, historyCount, h2hCount])

  return { fixtures: data, loading }
}
