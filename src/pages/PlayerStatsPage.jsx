import { useState, useMemo, useEffect } from 'react'
import { searchPlayers } from '../data/mockPlayerData.js'
import MatchPropAnalysis from '../components/MatchPropAnalysis.jsx'

function RatingRing({ rating }) {
  const r = 28
  const circ = 2 * Math.PI * r
  const fill = ((rating / 10) * 100 / 100) * circ
  const color = rating >= 7.5 ? '#22c55e' : rating >= 6.5 ? '#f59e0b' : '#ef4444'
  return (
    <svg width={72} height={72}>
      <circle cx={36} cy={36} r={r} fill="none" stroke="var(--sw-border)" strokeWidth={6} />
      <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6} strokeDasharray={`${fill} ${circ}`} strokeLinecap="round" transform="rotate(-90 36 36)" />
      <text x={36} y={37} textAnchor="middle" dominantBaseline="middle" fill={color} fontSize={14} fontWeight={800}>{rating}</text>
    </svg>
  )
}

function SeasonBar({ label, value, max, avgPerGame }) {
  const pct = Math.min((value / Math.max(max, 1)) * 100, 100)
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: '#9ca3af', fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 900, color: '#f1f5f9' }}>{value}</span>
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, marginBottom: 6 }}>
        {avgPerGame.toFixed(2)} / per 90
      </div>
      <div style={{ height: 8, background: 'var(--sw-surface-2)', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg, #f97316, #d1d5db)', borderRadius: 4 }} />
      </div>
    </div>
  )
}

function LastNSection({ gameHistory, playerName, playerTeam }) {
  const [range, setRange] = useState('L10')
  const [statKey, setStatKey] = useState('shots')
  const [altByStat, setAltByStat] = useState({})
  const statOptions = [
    { key: 'shots', label: 'Shots' },
    { key: 'shotsOnTarget', label: 'Shots on target' },
    { key: 'goals', label: 'Goals' },
    { key: 'assists', label: 'Assists' },
    { key: 'foulsCommitted', label: 'Fouls committed' },
    { key: 'foulsDrawn', label: 'Fouls drawn' },
    { key: 'offsides', label: 'Offsides' },
    { key: 'cards', label: 'Cards' },
  ]

  const pick = (arr) => {
    if (range === 'L5') return arr.slice(0, 5)
    if (range === 'L15') return arr.slice(0, 15)
    return arr.slice(0, 10)
  }
  const selectedGames = pick(gameHistory)
  const allVals = selectedGames.map(r => Number(r?.[statKey] || 0))
  const computedAlt = (allVals.length ? Math.floor(allVals.reduce((a, b) => a + b, 0) / allVals.length) : 0) + 0.5
  const alt = Number(altByStat[statKey] ?? computedAlt)
  const max = Math.max(1, ...allVals, alt + 1)
  const mapRow = (r) => {
    const value = Number(r?.[statKey] || 0)
    return {
      fixtureId: r.fixtureId || null,
      opponent: r.opponent,
      fixtureName: r.isHome ? `${playerTeam} vs ${r.opponent}` : `${r.opponent} vs ${playerTeam}`,
      date: r.date,
      value,
      label: Number.isInteger(value) ? String(value) : value.toFixed(1),
      isOver: value > alt,
      isBoolean: false,
    }
  }

  return (
    <MatchPropAnalysis
      title="Player Prop Analysis"
      leftTitle={`${playerName} Prop Analysis`}
      statOptions={statOptions}
      statKey={statKey}
      onStatChange={setStatKey}
      range={range}
      onRangeChange={setRange}
      altLine={alt}
      onAltChange={(next) => {
        const normalized = Math.floor(Math.max(0, Number(next) || 0)) + 0.5
        setAltByStat(prev => ({ ...prev, [statKey]: normalized }))
      }}
      leftDataset={selectedGames.map(mapRow)}
      singlePanel
      maxScale={max}
      upcomingLabel="Next"
    />
  )
}

function generateGameHistory(stats, n = 20) {
  const games = []
  const keys = ['shots', 'shotsOnTarget', 'goals', 'assists', 'foulsCommitted', 'foulsDrawn', 'offsides', 'cards']
  const opponents = ['Arsenal', 'Chelsea', 'Tottenham', 'Liverpool', 'Newcastle', 'Brighton', 'Leeds', 'Everton', 'West Ham', 'Aston Villa']
  const now = new Date()
  for (let i = 0; i < n; i++) {
    const g = {}
    keys.forEach(k => {
      const season = k === 'cards' ? ((stats.yellowCards || 0) + (stats.redCards || 0)) : (stats[k] ?? 0)
      const perGame = season / 34
      g[k] = Math.max(0, Math.round((perGame * (0.4 + Math.random() * 1.2)) * 2) / 2)
    })
    const d = new Date(now)
    d.setDate(now.getDate() - (i + 1) * 7)
    g.date = d.toISOString()
    g.opponent = opponents[i % opponents.length]
    g.fixtureId = null
    g.isHome = i % 2 === 0
    games.push(g)
  }
  return games
}

function PlayerProfile({ player }) {
  const s = player.stats
  const gameHistory = useMemo(() => generateGameHistory(s), [player.id])
  const gamesPlayed = Number(s.appearances || s.games || s.played || s.matches || 34) || 34

  const seasonStats = [
    { label: 'Shots', value: s.shots, max: 120 },
    { label: 'Shots on Target', value: s.shotsOnTarget, max: 80 },
    { label: 'Goals', value: s.goals, max: 40 },
    { label: 'Assists', value: s.assists, max: 25 },
    { label: 'Fouls Committed', value: s.foulsCommitted, max: 80 },
    { label: 'Fouls Drawn', value: s.foulsDrawn, max: 80 },
    { label: 'Offsides', value: s.offsides, max: 35 },
    { label: 'Cards', value: (s.yellowCards || 0) + (s.redCards || 0), max: 20 },
  ]

  return (
    <div className="player-profile" style={{ display: 'flex', flexDirection: 'column', gap: 20, alignItems: 'center' }}>
      <div className="player-profile-header" style={{ width: 'min(100%, 920px)', padding: '20px', background: 'var(--sw-surface-0)', borderRadius: 14, border: '1px solid var(--sw-border)', display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap', boxSizing: 'border-box' }}>
        {player.photo ? (
          <img src={player.photo} alt={player.name} style={{ width: 72, height: 72, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--sw-border)', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'linear-gradient(135deg, #f97316, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, fontWeight: 900, color: '#fff', flexShrink: 0 }}>{player.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 20, fontWeight: 900, color: '#f1f5f9' }}>{player.name}</div>
          <div style={{ fontSize: 13, color: 'var(--sw-muted)', marginTop: 2 }}>{player.team} - {player.position} - {player.nationality}</div>
        </div>
        <RatingRing rating={s.rating} />
      </div>

      <div style={{ width: 'min(100%, 920px)' }}>
        <LastNSection gameHistory={gameHistory} playerName={player.name} playerTeam={player.team} />
      </div>

      <div className="player-profile-season" style={{ width: 'min(100%, 920px)', padding: '20px', background: 'var(--sw-surface-0)', borderRadius: 14, border: '1px solid var(--sw-border)', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 11, color: 'var(--sw-muted)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 16 }}>SEASON STATS</div>
        {seasonStats.map(({ label, value, max }) => (
          <SeasonBar
            key={label}
            label={label}
            value={value}
            max={max}
            avgPerGame={Number(value || 0) / Math.max(1, gamesPlayed)}
          />
        ))}
      </div>
    </div>
  )
}

function parseGrid(g) {
  const p = String(g || '1:1').split(':').map(Number)
  return { col: p[0] || 1, row: p[1] || 1 }
}

function groupByRow(players) {
  const rows = {}
  players.forEach(p => {
    const { row } = parseGrid(p.grid)
    ;(rows[row] = rows[row] || []).push(p)
  })
  return Object.entries(rows)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([, ps]) => ps.sort((a, b) => parseGrid(a.grid).col - parseGrid(b.grid).col))
}

function PlayerNode({ item, active, onClick, compact = false }) {
  const last = String(item.name || '').split(' ').slice(-1)[0]
  return (
    <button
      onClick={onClick}
      style={{
        border: 'none',
        background: 'transparent',
        color: '#f8fafc',
        padding: '0',
        minWidth: compact ? 36 : 52,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: compact ? 1 : 2,
      }}
    >
      <svg
        width={compact ? '24' : '32'}
        height={compact ? '28' : '36'}
        viewBox="0 0 40 46"
        fill="none"
        style={{ filter: active ? 'drop-shadow(0 0 4px rgba(209,213,219,0.9))' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))' }}
      >
        <path d="M13 5 L1 14 L7 18 L7 44 L33 44 L33 18 L39 14 L27 5 C24 9 16 9 13 5Z" fill={active ? '#f97316' : 'var(--sw-surface-0)'} stroke={active ? '#e5e7eb' : 'rgba(255,255,255,0.55)'} strokeWidth="1.3" />
        <path d="M13 5 C16 10 24 10 27 5 C24 2 16 2 13 5Z" fill="rgba(0,0,0,0.18)" />
        <text x="20" y="29" textAnchor="middle" dominantBaseline="middle" fontSize={compact ? (Number(item.number) >= 10 ? '10' : '11') : (Number(item.number) >= 10 ? '11' : '13')} fontWeight="900" fill="#f8fafc">
          {item.number || '-'}
        </text>
      </svg>
      <div style={{ fontSize: compact ? 8 : 9.5, fontWeight: 700, lineHeight: 1.1, maxWidth: compact ? 44 : 64, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', textAlign: 'center' }}>{last}</div>
    </button>
  )
}

function playerIdentity(item) {
  return `${item.teamId || 't'}-${item.id || 'id'}-${item.number || 'n'}-${item.name || ''}`
}

function TeamSide({ rows, selectedId, onSelect, side = 'left', compact = false }) {
  const ordered = side === 'right' ? [...rows].reverse() : rows
  return (
    <div style={{ display: 'flex', flex: 1, minWidth: 0, padding: compact ? '18px 6px 8px' : '22px 10px 10px', gap: compact ? 3 : 6, justifyContent: 'space-evenly' }}>
      {ordered.map((row, idx) => (
        <div key={idx} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-evenly', alignItems: 'center', minWidth: 0, flex: 1, gap: compact ? 3 : 5 }}>
          {row.map(item => (
            <PlayerNode
              key={`${item.teamId}-${item.name}-${item.number || ''}`}
              item={item}
              active={selectedId === playerIdentity(item)}
              onClick={() => onSelect(item)}
              compact={compact}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

function FixturePitchSelector({ lineups = [], players = [], selected, onSelect, search }) {
  const [isCompact, setIsCompact] = useState(() => window.innerWidth <= 640)
  const home = lineups[0]
  const away = lineups[1]

  useEffect(() => {
    const onResize = () => setIsCompact(window.innerWidth <= 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const allByName = useMemo(() => {
    const map = new Map()
    players.forEach(p => {
      map.set(`${p.teamId}-${p.name}`.toLowerCase(), p)
      map.set(String(p.id), p)
    })
    return map
  }, [players])

  const mapStart = (teamBlock, isHome) => (teamBlock?.startXI || []).map(p => {
    const byId = allByName.get(String(p.id))
    const byName = allByName.get(`${teamBlock?.team?.id || 0}-${p.name}`.toLowerCase())
    return byId || byName || {
      id: Number(p.id) || `${teamBlock?.team?.id || 0}-${p.name}`,
      teamId: teamBlock?.team?.id || 0,
      team: teamBlock?.team?.name || '',
      name: p.name,
      number: p.number,
      position: p.pos || 'Player',
      nationality: '-',
      grid: p.grid,
      stats: {
        shots: 0,
        shotsOnTarget: 0,
        goals: 0,
        assists: 0,
        foulsCommitted: 0,
        foulsDrawn: 0,
        offsides: 0,
        yellowCards: 0,
        redCards: 0,
        rating: 6,
      },
      isHome,
    }
  })

  const homeRows = useMemo(() => groupByRow(mapStart(home, true)), [home, allByName])
  const awayRows = useMemo(() => groupByRow(mapStart(away, false)), [away, allByName])
  const filteredBySearch = (item) => !search.trim() || item.name.toLowerCase().includes(search.toLowerCase())

  const selectedIdentity = selected ? playerIdentity(selected) : null

  const onPick = (item) => {
    const found = allByName.get(String(item.id)) || allByName.get(`${item.teamId}-${item.name}`.toLowerCase())
    onSelect(found || item)
  }

  if (!homeRows.length && !awayRows.length) return null

  const pitchMinHeight = isCompact ? 220 : 320
  const centerCircle = isCompact ? 60 : 82
  const boxWidth = isCompact ? 24 : 34
  const sixYardWidth = isCompact ? 10 : 13

  return (
      <div className="player-pitch-selector" style={{ padding: isCompact ? '10px' : '14px', background: 'var(--sw-surface-0)', borderRadius: 14, border: '1px solid var(--sw-border)', marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--sw-muted)', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 10 }}>FORMATION PITCH</div>
      <div className="player-pitch-wrap" style={{ maxWidth: 560, margin: '0 auto' }}>
      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(180deg,#256b2e 0%,#2e8c38 25%,#256b2e 50%,#2e8c38 75%,#256b2e 100%)', border: '1px solid rgba(255,255,255,0.35)', aspectRatio: isCompact ? '16 / 11' : '16 / 10', minHeight: pitchMinHeight }}>
        <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', background: isCompact ? 'repeating-linear-gradient(90deg,transparent,transparent 28px,rgba(0,0,0,0.06) 28px,rgba(0,0,0,0.06) 56px)' : 'repeating-linear-gradient(90deg,transparent,transparent 42px,rgba(0,0,0,0.06) 42px,rgba(0,0,0,0.06) 84px)' }} />

        {/* Pitch markings */}
        <div style={{ position: 'absolute', inset: isCompact ? 6 : 8, border: '1px solid rgba(255,255,255,0.55)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: isCompact ? 6 : 8, bottom: isCompact ? 6 : 8, left: '50%', borderLeft: '1px solid rgba(255,255,255,0.6)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: centerCircle, height: centerCircle, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.6)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.8)', pointerEvents: 'none' }} />

        {/* Goal lines and boxes */}
        <div style={{ position: 'absolute', top: '28%', bottom: '28%', left: isCompact ? 6 : 8, width: 1, background: 'rgba(255,255,255,0.65)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', top: '28%', bottom: '28%', right: isCompact ? 6 : 8, width: 1, background: 'rgba(255,255,255,0.65)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: isCompact ? 6 : 8, top: '36%', width: boxWidth, height: '28%', border: '1px solid rgba(255,255,255,0.6)', borderLeft: 'none', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: isCompact ? 6 : 8, top: '36%', width: boxWidth, height: '28%', border: '1px solid rgba(255,255,255,0.6)', borderRight: 'none', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', left: isCompact ? 7 : 9, top: '43%', width: sixYardWidth, height: '14%', border: '1px solid rgba(255,255,255,0.6)', borderLeft: 'none', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: isCompact ? 7 : 9, top: '43%', width: sixYardWidth, height: '14%', border: '1px solid rgba(255,255,255,0.6)', borderRight: 'none', pointerEvents: 'none' }} />

        {/* Goals */}
        <div style={{ position: 'absolute', left: isCompact ? -7 : -9, top: '44%', width: isCompact ? 7 : 9, height: '12%', border: '1px solid rgba(255,255,255,0.65)', borderRight: 'none', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', right: isCompact ? -7 : -9, top: '44%', width: isCompact ? 7 : 9, height: '12%', border: '1px solid rgba(255,255,255,0.65)', borderLeft: 'none', pointerEvents: 'none' }} />

        {/* Corner flags */}
        <div style={{ position: 'absolute', left: 7, top: 7, width: 6, height: 6, borderRadius: '50%', background: '#facc15', boxShadow: '0 0 0 1px rgba(0,0,0,0.2)' }} />
        <div style={{ position: 'absolute', right: 7, top: 7, width: 6, height: 6, borderRadius: '50%', background: '#facc15', boxShadow: '0 0 0 1px rgba(0,0,0,0.2)' }} />
        <div style={{ position: 'absolute', left: 7, bottom: 7, width: 6, height: 6, borderRadius: '50%', background: '#facc15', boxShadow: '0 0 0 1px rgba(0,0,0,0.2)' }} />
        <div style={{ position: 'absolute', right: 7, bottom: 7, width: 6, height: 6, borderRadius: '50%', background: '#facc15', boxShadow: '0 0 0 1px rgba(0,0,0,0.2)' }} />

        {/* Formation labels */}
        <div style={{ position: 'absolute', top: isCompact ? 8 : 10, left: isCompact ? 8 : 12, zIndex: 4, fontSize: isCompact ? 9 : 11, fontWeight: 800, color: '#f8fafc', background: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: isCompact ? '2px 6px' : '3px 8px', maxWidth: isCompact ? '42%' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {home?.team?.name || 'Home'} {home?.formation ? `(${home.formation})` : ''}
        </div>
        <div style={{ position: 'absolute', top: isCompact ? 8 : 10, right: isCompact ? 8 : 12, zIndex: 4, fontSize: isCompact ? 9 : 11, fontWeight: 800, color: '#f8fafc', background: 'rgba(0,0,0,0.35)', borderRadius: 6, padding: isCompact ? '2px 6px' : '3px 8px', maxWidth: isCompact ? '42%' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {away?.team?.name || 'Away'} {away?.formation ? `(${away.formation})` : ''}
        </div>

        <div style={{ position: 'relative', minHeight: pitchMinHeight, display: 'flex' }}>
          <TeamSide
            side="left"
            rows={homeRows.map(r => r.filter(filteredBySearch))}
            selectedId={selectedIdentity}
            onSelect={onPick}
            compact={isCompact}
          />
          <TeamSide
            side="right"
            rows={awayRows.map(r => r.filter(filteredBySearch))}
            selectedId={selectedIdentity}
            onSelect={onPick}
            compact={isCompact}
          />
        </div>
      </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--sw-muted)' }}>Click a player on the pitch to open detailed stats.</div>
    </div>
  )
}

function PlayerCard({ player, onSelect, selected }) {
  const s = player.stats
  return (
    <button onClick={() => onSelect(player)} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: selected ? 'rgba(249,115,22,0.12)' : 'var(--sw-surface-0)', border: `1px solid ${selected ? '#f97316' : 'var(--sw-border)'}`, borderRadius: 10, cursor: 'pointer', textAlign: 'left' }}>
      {player.photo ? (
        <img src={player.photo} alt={player.name} style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--sw-border)', flexShrink: 0 }} />
      ) : (
        <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg, #f97316, #7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: '#fff', flexShrink: 0 }}>{player.name.split(' ').map(w => w[0]).join('').slice(0, 2)}</div>
      )}
      <div style={{ minWidth: 0, flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</div>
        <div style={{ fontSize: 11, color: 'var(--sw-muted)' }}>{player.team} - {player.position}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: '#22c55e' }}>{s.goals}G</div>
        <div style={{ fontSize: 11, color: '#6b7280' }}>{s.assists}A</div>
      </div>
    </button>
  )
}

const STAT_RANK_OPTIONS = [
  { key: 'goals', label: 'Goals' },
  { key: 'assists', label: 'Assists' },
  { key: 'shots', label: 'Shots' },
  { key: 'shotsOnTarget', label: 'Shots on Target' },
  { key: 'foulsCommitted', label: 'Fouls Committed' },
  { key: 'foulsDrawn', label: 'Fouls Drawn' },
  { key: 'offsides', label: 'Offsides' },
  { key: 'cards', label: 'Cards' },
  { key: 'rating', label: 'Rating' },
]

function getRankStatValue(player, statKey) {
  const s = player?.stats || {}
  if (statKey === 'cards') return Number(s.yellowCards || 0) + Number(s.redCards || 0)
  return Number(s?.[statKey] || 0)
}

export default function PlayerStatsPage({ players = null, lineups = null, title = 'Player Statistics' }) {
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [activeStat, setActiveStat] = useState('goals')
  const [visibleCount, setVisibleCount] = useState(10)
  const isFixtureMode = Array.isArray(players)

  const results = useMemo(() => {
    if (!isFixtureMode) return searchPlayers(search)
    const list = players || []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.team || '').toLowerCase().includes(q) || (p.position || '').toLowerCase().includes(q))
  }, [isFixtureMode, players, search])

  useEffect(() => {
    if (!selected || results.find(r => r.id === selected.id)) return
    setSelected(null)
  }, [results, selected])

  useEffect(() => {
    setVisibleCount(10)
  }, [activeStat, search])

  if (isFixtureMode) {
    return (
      <div className="player-stats-page fixture-mode" style={{ padding: '16px 18px 20px', overflowY: 'auto' }}>
        <div style={{ marginBottom: 10, fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>{title}</div>
        <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Search fixture player..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', maxWidth: 420, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-1)', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>

        <FixturePitchSelector lineups={lineups || []} players={results} selected={selected} onSelect={setSelected} search={search} />

        {selected ? (
          <PlayerProfile player={selected} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#4b5563', padding: '26px 12px' }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--sw-muted)' }}>Select a player to view stats</div>
            <div style={{ fontSize: 13, marginTop: 6 }}>Click a player on the formation pitch above.</div>
          </div>
        )}
      </div>
    )
  }

  const ranked = [...results].sort((a, b) => getRankStatValue(b, activeStat) - getRankStatValue(a, activeStat))
  const activeLabel = STAT_RANK_OPTIONS.find(s => s.key === activeStat)?.label || activeStat
  const shown = ranked.slice(0, visibleCount)

  return (
    <div className="player-stats-page" style={{ padding: '16px 18px 20px', overflowY: 'auto' }}>
      <div style={{ marginBottom: 10, fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>{title}</div>
      <div style={{ marginBottom: 12 }}>
        <input
          type="text"
          placeholder="Search player..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', maxWidth: 420, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-1)', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {STAT_RANK_OPTIONS.map(opt => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setActiveStat(opt.key)}
            style={{
              minHeight: 34,
              padding: '0 12px',
              borderRadius: 999,
              border: activeStat === opt.key ? '1px solid rgba(255,74,31,0.5)' : '1px solid var(--sw-border)',
              background: activeStat === opt.key ? 'rgba(255,74,31,0.16)' : 'var(--sw-surface-1)',
              color: activeStat === opt.key ? '#fdba74' : '#9ca3af',
              fontWeight: 700,
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 12, fontSize: 12, color: '#94a3b8' }}>
        Top players by <strong style={{ color: '#f8fafc' }}>{activeLabel}</strong>. Season totals + per game averages shown.
      </div>

      <div style={{ border: '1px solid var(--sw-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--sw-surface-0)', marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '52px minmax(0,1fr) 86px 76px', padding: '10px 12px', borderBottom: '1px solid var(--sw-border)', color: '#64748b', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <div>#</div>
          <div>Player</div>
          <div>Total</div>
          <div>Per Game</div>
        </div>
        {shown.map((p, idx) => {
          const total = getRankStatValue(p, activeStat)
          const games = Number(p?.stats?.appearances || p?.stats?.games || 34) || 34
          const perGame = total / Math.max(1, games)
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p)}
              style={{ width: '100%', display: 'grid', gridTemplateColumns: '52px minmax(0,1fr) 86px 76px', padding: '10px 12px', border: 'none', borderBottom: idx === shown.length - 1 ? 'none' : '1px solid #1d2939', background: selected?.id === p.id ? 'rgba(255,74,31,0.13)' : 'transparent', color: '#dbe7f8', textAlign: 'left', cursor: 'pointer' }}
            >
              <div style={{ fontWeight: 900, color: idx < 3 ? '#f97316' : '#93a4be' }}>#{idx + 1}</div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                <div style={{ fontSize: 11, color: '#6b7280' }}>{p.team} - {p.position}</div>
              </div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#f8fafc' }}>{Number.isInteger(total) ? total : total.toFixed(2)}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>{perGame.toFixed(2)}</div>
            </button>
          )
        })}
        {!shown.length && <div style={{ textAlign: 'center', color: '#4b5563', padding: '20px 10px', fontSize: 13 }}>No players found</div>}
      </div>

      {ranked.length > visibleCount && (
        <div style={{ marginBottom: 14 }}>
          <button
            type="button"
            onClick={() => setVisibleCount(v => v + 10)}
            style={{ minHeight: 36, padding: '0 12px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-1)', color: '#cbd5e1', fontWeight: 700, cursor: 'pointer' }}
          >
            Show 10 More Players
          </button>
        </div>
      )}

      {selected && <PlayerProfile player={selected} />}
    </div>
  )
}

