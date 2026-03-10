import { useMemo } from 'react'
import { computeMatchPropValue, valueLabel, MATCH_PROP_STAT_OPTIONS } from '../data/matchPropStats'

function sortByDateDesc(items) {
  return [...(items || [])].sort((a, b) => new Date(b?.date || 0).getTime() - new Date(a?.date || 0).getTime())
}

function pickRange(items, range) {
  if (range === 'L5') return items.slice(0, 5)
  if (range === 'L10') return items.slice(0, 10)
  if (range === 'L15') return items.slice(0, 15)
  if (range === 'H2H') return items.slice(0, 15)
  return items.slice(0, 10)
}

export default function useMatchPropAnalysisData({
  leftHistory = [],
  rightHistory = [],
  leftH2H = [],
  rightH2H = [],
  statKey,
  range = 'L10',
}) {
  const statDef = useMemo(
    () => MATCH_PROP_STAT_OPTIONS.find(s => s.key === statKey) || MATCH_PROP_STAT_OPTIONS[0],
    [statKey]
  )

  const leftRaw = useMemo(
    () => pickRange(range === 'H2H' ? sortByDateDesc(leftH2H) : sortByDateDesc(leftHistory), range),
    [leftHistory, leftH2H, range]
  )
  const rightRaw = useMemo(
    () => pickRange(range === 'H2H' ? sortByDateDesc(rightH2H) : sortByDateDesc(rightHistory), range),
    [rightHistory, rightH2H, range]
  )

  const leftDataset = useMemo(
    () => [...leftRaw].reverse().map(match => ({
      ...match,
      fixtureId: match?.fixtureId || null,
      opponent: match?.opponent || 'Opponent',
      date: match?.date,
      value: computeMatchPropValue(match, statDef.key),
      isBoolean: Boolean(statDef.isBoolean),
      isOutcome: Boolean(statDef.isOutcome),
    })),
    [leftRaw, statDef]
  )

  const rightDataset = useMemo(
    () => [...rightRaw].reverse().map(match => ({
      ...match,
      fixtureId: match?.fixtureId || null,
      opponent: match?.opponent || 'Opponent',
      date: match?.date,
      value: computeMatchPropValue(match, statDef.key),
      isBoolean: Boolean(statDef.isBoolean),
      isOutcome: Boolean(statDef.isOutcome),
    })),
    [rightRaw, statDef]
  )

  const maxScale = useMemo(() => {
    const values = [...leftDataset, ...rightDataset].map(r => Number(r.value || 0))
    return statDef.isBoolean || statDef.isOutcome ? 1 : Math.max(1, ...values)
  }, [leftDataset, rightDataset, statDef])

  const left = useMemo(
    () => leftDataset.map(row => ({ ...row, label: valueLabel(Number(row.value), row.isBoolean, row.isOutcome) })),
    [leftDataset]
  )
  const right = useMemo(
    () => rightDataset.map(row => ({ ...row, label: valueLabel(Number(row.value), row.isBoolean, row.isOutcome) })),
    [rightDataset]
  )

  return { left, right, maxScale, statDef }
}
