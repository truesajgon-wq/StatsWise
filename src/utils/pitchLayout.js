const SAFE_TOP = 20
const SAFE_BOTTOM = 80
const HOME_GOALKEEPER_X = 10
const HOME_OUTFIELD_START_X = 24
const HOME_OUTFIELD_END_X = 44

function normalizeToken(value = '') {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

export function parsePitchGrid(grid) {
  const [col, row] = String(grid || '1:1').split(':').map(Number)
  return {
    col: Number.isFinite(col) && col > 0 ? col : 1,
    row: Number.isFinite(row) && row > 0 ? row : 1,
  }
}

function sortByGrid(a, b) {
  const aGrid = parsePitchGrid(a?.grid)
  const bGrid = parsePitchGrid(b?.grid)
  if (aGrid.row !== bGrid.row) return aGrid.row - bGrid.row
  return aGrid.col - bGrid.col
}

function isGoalkeeper(player) {
  const raw = normalizeToken(player?.position || player?.posCode || player?.pos)
  return raw === 'g' || raw === 'gk' || raw.includes('goalkeeper')
}

function parseFormationLines(formation, playerCount) {
  const parsed = String(formation || '')
    .split('-')
    .map(Number)
    .filter((value) => Number.isFinite(value) && value > 0)

  if (parsed.length && parsed.reduce((sum, value) => sum + value, 1) === playerCount) {
    return [1, ...parsed]
  }

  return []
}

function groupedPitchRows(players = []) {
  const rows = new Map()
  players.forEach((player) => {
    const { row } = parsePitchGrid(player?.grid)
    if (!rows.has(row)) rows.set(row, [])
    rows.get(row).push(player)
  })

  return [...rows.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, rowPlayers]) => rowPlayers.sort(sortByGrid))
}

function buildFormationGroups(players = [], formation) {
  const ordered = [...players].sort(sortByGrid)
  if (!ordered.length) return []

  const explicitLines = parseFormationLines(formation, ordered.length)
  if (explicitLines.length) {
    const groups = []
    let cursor = 0
    explicitLines.forEach((count) => {
      groups.push(ordered.slice(cursor, cursor + count))
      cursor += count
    })
    if (cursor === ordered.length) return groups.filter((group) => group.length)
  }

  const rows = groupedPitchRows(ordered)
  if (rows.length) return rows

  return [ordered]
}

function lineSortWeight(player, fallbackIndex) {
  const raw = normalizeToken(player?.position || player?.posCode || player?.pos)
  const grid = parsePitchGrid(player?.grid)

  if (/\b(lb|lwb|lw|lm|lcm|ldm|lf|ls|aml|ml)\b/.test(raw) || raw.includes('left')) return 0
  if (/\b(cb|dm|cm|am|cam|cdm|cf|st|ss|c)\b/.test(raw) || raw.includes('center') || raw.includes('centre')) return 1
  if (/\b(rb|rwb|rw|rm|rcm|rdm|rf|rs|amr|mr)\b/.test(raw) || raw.includes('right')) return 2
  if (Number.isFinite(grid.col)) return grid.col
  return fallbackIndex
}

function sortPlayersWithinLine(players = []) {
  return [...players]
    .map((player, index) => ({ player, index, grid: parsePitchGrid(player?.grid) }))
    .sort((a, b) => {
      const weightA = lineSortWeight(a.player, a.index)
      const weightB = lineSortWeight(b.player, b.index)
      if (weightA !== weightB) return weightA - weightB
      if (a.grid.col !== b.grid.col) return a.grid.col - b.grid.col
      return a.index - b.index
    })
    .map(({ player }) => player)
}

function distributeEvenly(count, start, end) {
  if (count <= 0) return []
  if (count === 1) return [(start + end) / 2]

  return Array.from({ length: count }, (_, index) => (
    start + (index / (count - 1)) * (end - start)
  ))
}

function mirrorX(x, side) {
  return side === 'away' ? 100 - x : x
}

export function buildFormationPitchSlots(players = [], { formation, side = 'home' } = {}) {
  const lines = buildFormationGroups(players, formation)
  if (!lines.length) return []

  const goalkeeper = lines[0]?.length === 1 && isGoalkeeper(lines[0][0]) ? lines[0][0] : null
  const outfieldLines = goalkeeper ? lines.slice(1) : lines
  const outfieldDepths = distributeEvenly(outfieldLines.length, HOME_OUTFIELD_START_X, HOME_OUTFIELD_END_X)

  const slots = []

  if (goalkeeper) {
    slots.push({
      item: goalkeeper,
      x: mirrorX(HOME_GOALKEEPER_X, side),
      y: 50,
    })
  }

  outfieldLines.forEach((linePlayers, lineIndex) => {
    const sortedPlayers = sortPlayersWithinLine(linePlayers)
    const yPositions = distributeEvenly(sortedPlayers.length, SAFE_TOP, SAFE_BOTTOM)
    const x = mirrorX(outfieldDepths[lineIndex] ?? HOME_OUTFIELD_START_X, side)

    sortedPlayers.forEach((item, playerIndex) => {
      slots.push({
        item,
        x,
        y: yPositions[playerIndex] ?? 50,
      })
    })
  })

  return slots
}
