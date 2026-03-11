import { useEffect, useState, useCallback } from 'react'
import { fetchMatchDetails } from '../data/api.js'

/**
 * useMatchDetails – fetches all data for a single fixture in one backend call.
 * Returns: { data, loading, error, refetch }
 *
 * data shape:
 *   { fixture, statistics, events, lineups, homeHistory, awayHistory, h2h }
 */
export default function useMatchDetails(id, options = {}) {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const result = await fetchMatchDetails(id, options)
      setData(result)
    } catch (err) {
      console.error('[useMatchDetails]', err)
      setError(err.message || 'Failed to load match details')
    } finally {
      setLoading(false)
    }
  }, [id, options])

  useEffect(() => { load() }, [load])

  // Auto-refresh live matches every 30 s
  useEffect(() => {
    if (!data?.fixture?.isLive) return
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [data?.fixture?.isLive, load])

  return { data, loading, error, refetch: load }
}
