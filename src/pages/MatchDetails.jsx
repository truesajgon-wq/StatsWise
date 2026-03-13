import { useEffect, useMemo, useState } from 'react'
import { useParams, useNavigate, useSearchParams } from 'react-router-dom'
import { useLang } from '../context/LangContext'
import { useAuth } from '../context/AuthContext.jsx'
import useMatchDetails from '../hooks/useMatchDetails'
import { extractStatValue, hasStatValue, STATS_ORDER, getStatDef, STAT_GROUPS } from '../data/statsConfig'
import MatchDetailsSwimlane from '../components/MatchDetailsSwimlane'
import PlayerStatsPage from './PlayerStatsPage.jsx'
import { fetchFixturesByDate } from '../data/api.js'
import { formatAppDate } from '../utils/dateFormat.js'
import StatsWiseWordmark from '../components/StatsWiseWordmark.jsx'
import UserDashboard from '../components/UserDashboard.jsx'

const FINISHED_STATUSES = new Set(['FT', 'AET', 'PEN'])
const FALLBACK_FORMATION = '4-3-3'

// ─────────────────────────────────────────────────────────────────────────────
// SHARED PRIMITIVES
// ─────────────────────────────────────────────────────────────────────────────

function TeamLogo({ src, name, size = 48 }) {
  const [failed, setFailed] = useState(false)
  if (!src || failed) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%',
        background: 'var(--sw-border)', border: '2px solid #374151',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.34), fontWeight: 900, color: '#6b7280', flexShrink: 0,
      }}>
        {(name || '?').slice(0, 2).toUpperCase()}
      </div>
    )
  }
  return <img src={src} alt={name} width={size} height={size} style={{ objectFit: 'contain', display: 'block', flexShrink: 0 }} onError={() => setFailed(true)} />
}

function Spinner({ text = 'Loading...' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 20px', gap: 12 }}>
      <div style={{ width: 32, height: 32, border: '3px solid var(--sw-border)', borderTop: '3px solid #f97316', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <span style={{ fontSize: 12, color: '#4b5563' }}>{text}</span>
    </div>
  )
}

function EmptyState({ icon = '\u{1F4ED}', text = 'No data available.' }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: '#4b5563' }}>
      <div style={{ fontSize: 36, marginBottom: 10 }}>{icon}</div>
      <p style={{ fontSize: 13, margin: 0, lineHeight: 1.6 }}>{text}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 1 — MATCH STATISTICS
// ─────────────────────────────────────────────────────────────────────────────

function StatBar({ label, home, away }) {
  const h = Number(home) || 0
  const a = Number(away) || 0
  const hp = Math.round(h / (h + a || 1) * 100)
  return (
    <div className="match-stat-bar" style={{ marginBottom: 14 }}>
      <div className="match-stat-bar-head" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5, gap: 8 }}>
        <span style={{ fontWeight: 800, color: '#d1d5db', fontSize: 13, minWidth: 'clamp(22px, 9vw, 30px)' }}>{home ?? '-'}</span>
        <span className="match-stat-bar-label" style={{ color: '#6b7280', fontSize: 11, flex: 1, textAlign: 'center', overflowWrap: 'anywhere', lineHeight: 1.25 }}>{label}</span>
        <span style={{ fontWeight: 800, color: '#9ca3af', fontSize: 13, minWidth: 'clamp(22px, 9vw, 30px)', textAlign: 'right' }}>{away ?? '-'}</span>
      </div>
      <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${hp}%`, background: 'linear-gradient(90deg,#4b5563,#f97316)', transition: 'width .4s' }} />
        <div style={{ flex: 1, background: 'linear-gradient(90deg,#6b7280,#9ca3af)' }} />
      </div>
    </div>
  )
}

function StatisticsPanel({ statistics, fixture }) {
  if (!statistics) return <EmptyState icon={'\u{1F4CA}'} text={fixture?.status === 'NS' ? 'Statistics appear after kick-off.' : 'No statistics available.'} />
  const { home, away } = statistics
  const statRows = [
    ['Shots on Target', home.shots, away.shots],
    ['Total Shots', home.shotsTotal, away.shotsTotal],
    ['Corners', home.corners, away.corners],
    ['Fouls', home.fouls, away.fouls],
    ['Offsides', home.offsides, away.offsides],
    ['Yellow Cards', home.yellowCards, away.yellowCards],
    ['Red Cards', home.redCards, away.redCards],
  ]
  if (fixture?.status !== 'FT' && fixture?.status !== 'AET' && fixture?.status !== 'PEN') {
    statRows.unshift(['Possession (%)', home.possession, away.possession])
    statRows.push(['Saves', home.saves, away.saves], ['Passes', home.passes, away.passes])
  }
  return (
    <div style={{ padding: '16px 16px 20px' }}>
      <div className="match-stat-header" style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, fontSize: 12, fontWeight: 800, gap: 10, flexWrap: 'wrap' }}>
        <span style={{ color: '#d1d5db', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflowWrap: 'anywhere' }}>
          {home.teamLogo && <img src={home.teamLogo} alt="" width={16} height={16} style={{ objectFit:'contain' }} />}
          {home.teamName}
        </span>
        <span style={{ color: '#9ca3af', display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, overflowWrap: 'anywhere' }}>
          {away.teamName}
          {away.teamLogo && <img src={away.teamLogo} alt="" width={16} height={16} style={{ objectFit:'contain' }} />}
        </span>
      </div>
      {statRows.map(([label, h, a]) => <StatBar key={label} label={label} home={h} away={a} />)}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 2 — EVENTS
// ─────────────────────────────────────────────────────────────────────────────

function evStyle(type, detail) {
  if (type === 'Goal') return detail === 'Own Goal' ? { icon: '\u26BD', color: '#ef4444' } : detail === 'Penalty' ? { icon: '\u26BD', color: '#f59e0b' } : { icon: '\u26BD', color: '#22c55e' }
  if (type === 'Card') return detail?.includes('Yellow') ? { icon: '\u{1F7E8}', color: '#f59e0b' } : { icon: '\u{1F7E5}', color: '#ef4444' }
  if (type === 'subst') return { icon: '\u{1F504}', color: '#d1d5db' }
  if (type === 'Var') return { icon: '\u{1F4FA}', color: '#9ca3af' }
  return { icon: '\u2022', color: '#6b7280' }
}

function normalizeMatchEvents(events = []) {
  return (events || [])
    .filter((ev) => {
      const type = String(ev?.type || '').toLowerCase()
      return type === 'goal' || type === 'card'
    })
    .map((ev) => {
      const type = String(ev?.type || '').toLowerCase()
      const detail = String(ev?.detail || '')
      const detailLower = detail.toLowerCase()
      const isGoal = type === 'goal'
      const isCard = type === 'card'
      return {
        ...ev,
        isGoal,
        isCard,
        isOwnGoal: isGoal && detailLower.includes('own'),
        isPenalty: isGoal && detailLower.includes('penalty'),
        isMissedPenalty: isGoal && detailLower.includes('missed'),
        isYellow: isCard && detailLower.includes('yellow'),
        isRed: isCard && detailLower.includes('red'),
      }
    })
}

function EventsPanel({ events, fixture }) {
  const notableEvents = normalizeMatchEvents(events)
  if (!notableEvents.length) return <EmptyState icon={'\u26BD'} text={fixture?.status === 'NS' ? 'Events appear at kick-off.' : 'No goals or cards recorded.'} />
  const homeId = fixture?.homeTeamId ?? fixture?.homeTeam?.id
  const first  = notableEvents.filter(e => e.time <= 45)
  const second = notableEvents.filter(e => e.time > 45)
  const Div = ({ label }) => (
    <div style={{ padding:'5px 16px', background:'var(--sw-bg)', display:'flex', alignItems:'center', gap:8 }}>
      <div style={{ flex:1, height:1, background:'var(--sw-border)' }} />
      <span style={{ fontSize:9, color:'#374151', fontWeight:800, letterSpacing:'.1em' }}>{label}</span>
      <div style={{ flex:1, height:1, background:'var(--sw-border)' }} />
    </div>
  )
  const Row = ({ ev }) => {
    const isHome = ev.team?.id === homeId
    const { icon, color } = evStyle(ev.type, ev.detail)
    const eventTitle = ev.isGoal
      ? (ev.isOwnGoal ? 'Own Goal' : ev.isPenalty ? 'Penalty Goal' : ev.isMissedPenalty ? 'Missed Penalty' : 'Goal')
      : (ev.isRed ? 'Red Card' : 'Yellow Card')
    const detailText = ev.isGoal
      ? [ev.assist?.name ? `Assist: ${ev.assist.name}` : null, ev.detail && !ev.isPenalty && !ev.isOwnGoal ? ev.detail : null].filter(Boolean).join(' • ')
      : (ev.detail || '')
    return (
      <div style={{ display:'flex', alignItems:'flex-start', gap:10, padding:'10px 16px', borderBottom:'1px solid var(--sw-border)', flexDirection: isHome ? 'row' : 'row-reverse' }}>
        <span style={{ fontSize:11, fontWeight:800, color:'#6b7280', fontFamily:'monospace', width:34, textAlign:'center', flexShrink:0, paddingTop:3 }}>
          {ev.time}{ev.timeExtra ? `+${ev.timeExtra}` : ''}'
        </span>
        <div style={{ width:30, height:30, borderRadius:'50%', background:`${color}18`, border:`1.5px solid ${color}40`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, flexShrink:0 }}>{icon}</div>
        <div style={{ flex:1, textAlign: isHome ? 'left' : 'right', minWidth:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent: isHome ? 'flex-start' : 'flex-end', flexWrap:'wrap' }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#e5e7eb', lineHeight:1.35, wordBreak:'break-word' }}>{ev.player?.name || 'Unknown Player'}</div>
            <span style={{ fontSize:10, fontWeight:800, color, background:`${color}14`, border:`1px solid ${color}33`, borderRadius:999, padding:'2px 7px' }}>{eventTitle}</span>
          </div>
          {detailText && <div style={{ fontSize:11, color:'#94a3b8', marginTop:3, lineHeight:1.35 }}>{detailText}</div>}
        </div>
      </div>
    )
  }
  return (
    <div>
      {first.length  > 0 && <><Div label="FIRST HALF"  />{first.map((ev,i) => <Row key={i} ev={ev}/>)}</>}
      {second.length > 0 && <><Div label="SECOND HALF" />{second.map((ev,i) => <Row key={i} ev={ev}/>)}</>}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 3 — LINEUPS  (shirt icons, matches uploaded screenshot exactly)
// ─────────────────────────────────────────────────────────────────────────────

// SVG shirt that looks like the screenshot (with number inside)
function Shirt({ primary, numColor, number, size = 36 }) {
  const n = Number(size)
  return (
    <svg width={n} height={Math.round(n * 1.15)} viewBox="0 0 40 46" fill="none"
      style={{ display:'block', filter:'drop-shadow(0 1px 2px rgba(0,0,0,0.4))' }}>
      {/* Body */}
      <path d="M13 5 L1 14 L7 18 L7 44 L33 44 L33 18 L39 14 L27 5 C24 9 16 9 13 5Z" fill={primary} />
      {/* Collar shadow */}
      <path d="M13 5 C16 10 24 10 27 5 C24 2 16 2 13 5Z" fill="rgba(0,0,0,0.18)" />
      {/* Number */}
      {number != null && (
        <text x="20" y="30" textAnchor="middle" dominantBaseline="middle"
          fontSize={Number(number) >= 10 ? "11" : "13"} fontWeight="900"
          fontFamily="system-ui,sans-serif" fill={numColor} style={{ userSelect:'none' }}>
          {number}
        </text>
      )}
    </svg>
  )
}

function resolveShirtColors(teamLineup, isGk) {
  const c = teamLineup?.team?.colors
  const src = c ? (isGk ? c.goalkeeper : c.player) : null
  if (src?.primary) return { primary: `#${src.primary}`, numColor: src.number ? `#${src.number}` : '#fff' }
  return null
}

function parseGrid(g) {
  const p = (g || '1:1').split(':').map(Number)
  return { col: p[0] || 1, row: p[1] || 1 }
}

function groupByPitchRow(players = []) {
  const rows = {}
  players.forEach(player => {
    const { row } = parseGrid(player?.grid)
    ;(rows[row] = rows[row] || []).push(player)
  })
  return Object.entries(rows)
    .sort(([a], [b]) => +a - +b)
    .map(([, rowPlayers]) => rowPlayers.sort((a, b) => parseGrid(a?.grid).col - parseGrid(b?.grid).col))
}

function formationLineCounts(teamData) {
  const parsed = String(teamData?.formation || '')
    .split('-')
    .map(Number)
    .filter(value => Number.isFinite(value) && value > 0)
  if (parsed.length && parsed.reduce((sum, value) => sum + value, 1) === 11) return [1, ...parsed]

  const groupedRows = groupByPitchRow(teamData?.startXI || [])
  if (groupedRows.length) return groupedRows.map(row => row.length)

  const starters = Array.isArray(teamData?.startXI) ? teamData.startXI : []
  return starters.length === 11 ? [1, 4, 3, 3] : [Math.max(1, starters.length)]
}

function orderStarters(teamData) {
  return [...(teamData?.startXI || [])].sort((a, b) => {
    const aGrid = parseGrid(a?.grid)
    const bGrid = parseGrid(b?.grid)
    if (aGrid.row !== bGrid.row) return aGrid.row - bGrid.row
    return aGrid.col - bGrid.col
  })
}

function buildPitchSlots(teamData, reverse = false) {
  const starters = orderStarters(teamData).slice(0, 11)
  if (!starters.length) return []

  let lineCounts = formationLineCounts(teamData)
  if (lineCounts.reduce((sum, value) => sum + value, 0) !== starters.length) {
    lineCounts = groupByPitchRow(starters).map(row => row.length)
  }

  let cursor = 0
  const totalLines = lineCounts.length
  return lineCounts.flatMap((count, lineIndex) => {
    const linePlayers = starters.slice(cursor, cursor + count)
    cursor += count
    const ratio = totalLines === 1 ? 0.5 : lineIndex / (totalLines - 1)
    const x = reverse ? (86 - ratio * 72) : (14 + ratio * 72)
    return linePlayers.map((player, slotIndex) => {
      const spread = count === 1 ? 0 : count === 2 ? 24 : count === 3 ? 40 : count === 4 ? 54 : 62
      const startY = 50 - (spread / 2)
      const y = count === 1 ? 50 : (startY + (slotIndex / Math.max(1, count - 1)) * spread)
      return { player, x, y }
    })
  })
}

function PlayerToken({ player, primary, numColor, compact = false }) {
  const parts = (player.name || '').trim().split(' ')
  const label = parts.length > 1 ? parts[parts.length - 1].slice(0, 10) : (player.name || '').slice(0, 10)
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:compact ? 1 : 2, userSelect:'none', width: compact ? 42 : 54 }}>
      <Shirt primary={primary} numColor={numColor} number={player.number} size={compact ? 24 : 32} />
      <span style={{
        fontSize: compact ? 8 : 9, fontWeight: 700, color: '#f0fdf4', textAlign:'center',
        maxWidth: '100%', lineHeight: 1.1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
        textShadow: '0 1px 3px rgba(0,0,0,0.8)',
      }}>{label}</span>
    </div>
  )
}

function PitchSide({ teamData, defaultPrimary, defaultNumColor, reverseColumns = false, compact = false }) {
  if (!teamData?.startXI?.length) return null
  const slots = buildPitchSlots(teamData, reverseColumns)
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0, minHeight: 0 }}>
      {slots.map(({ player, x, y }, index) => {
        const isGk = player.pos === 'G'
        const api = resolveShirtColors(teamData, isGk)
        return (
          <div
            key={`${player.id || player.name || index}-${index}`}
            style={{
              position: 'absolute',
              left: `${x}%`,
              top: `${y}%`,
              transform: 'translate(-50%, -50%)',
              display: 'grid',
              placeItems: 'center',
              pointerEvents: 'none',
            }}
          >
            <PlayerToken
              player={player}
              primary={api?.primary || defaultPrimary}
              numColor={api?.numColor || defaultNumColor}
              compact={compact}
            />
          </div>
        )
      })}
    </div>
  )
}

function FormationPitch({ home, away }) {
  const [compact, setCompact] = useState(() => window.innerWidth <= 640)

  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth <= 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  if (!home?.startXI?.length || !away?.startXI?.length) return null

  const pitchMinHeight = compact ? 220 : 320
  const centerCircle = compact ? 60 : 84
  const outerInset = compact ? 10 : 14
  const boxOuterWidth = compact ? 68 : 86
  const boxInnerWidth = compact ? 26 : 34
  const goalWidth = compact ? 6 : 8

  return (
    <div style={{
      position:'relative', margin:0,
      background:'linear-gradient(180deg,#256b2e 0%,#2e8c38 25%,#256b2e 50%,#2e8c38 75%,#256b2e 100%)',
      borderRadius:8, overflow:'hidden',
      aspectRatio: compact ? '16 / 11' : '16 / 10',
      minHeight:pitchMinHeight,
    }}>
      <div style={{ position:'absolute', inset:0, pointerEvents:'none',
        background: compact
          ? 'repeating-linear-gradient(90deg,transparent,transparent 28px,rgba(0,0,0,0.06) 28px,rgba(0,0,0,0.06) 56px)'
          : 'repeating-linear-gradient(90deg,transparent,transparent 42px,rgba(0,0,0,0.06) 42px,rgba(0,0,0,0.06) 84px)' }} />

      <svg style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none' }}
        viewBox="0 0 560 350" preserveAspectRatio="none">
        <g stroke="rgba(255,255,255,0.5)" strokeWidth="1.5" fill="none">
          <rect x={outerInset} y={18} width={560 - outerInset * 2} height="314" />
          <line x1="280" y1="18" x2="280" y2="332" />
          <circle cx="280" cy="175" r={centerCircle / 2} />
          <circle cx="280" cy="175" r="2" fill="rgba(255,255,255,0.5)" />
          <rect x={outerInset} y="92" width={boxOuterWidth} height="166" />
          <rect x={outerInset} y="128" width={boxInnerWidth} height="94" />
          <rect x={outerInset - goalWidth} y="145" width={goalWidth} height="60" strokeWidth="1" />
          <rect x={560 - outerInset - boxOuterWidth} y="92" width={boxOuterWidth} height="166" />
          <rect x={560 - outerInset - boxInnerWidth} y="128" width={boxInnerWidth} height="94" />
          <rect x={560 - outerInset} y="145" width={goalWidth} height="60" strokeWidth="1" />
          <circle cx={outerInset + 60} cy="175" r="2.5" fill="rgba(255,255,255,0.5)" />
          <circle cx={560 - outerInset - 60} cy="175" r="2.5" fill="rgba(255,255,255,0.5)" />
          <path d={`${outerInset} 32 A14 14 0 0 1 ${outerInset + 14} 18`} />
          <path d={`${560 - outerInset - 14} 18 A14 14 0 0 1 ${560 - outerInset} 32`} />
          <path d={`${outerInset} 318 A14 14 0 0 0 ${outerInset + 14} 332`} />
          <path d={`${560 - outerInset - 14} 332 A14 14 0 0 0 ${560 - outerInset} 318`} />
        </g>
      </svg>

      <div style={{ position:'absolute', top:compact ? 8 : 8, left:compact ? 8 : 12, zIndex:10, fontSize:compact ? 9 : 10.5, fontWeight:800,
        color:'rgba(255,255,255,0.9)', background:'rgba(0,0,0,0.35)', borderRadius:4, padding:compact ? '2px 6px' : '2px 7px', maxWidth: compact ? '42%' : 'none', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
        {home?.formation}
      </div>
      <div style={{ position:'absolute', top:compact ? 8 : 8, right:compact ? 8 : 12, zIndex:10, fontSize:compact ? 9 : 10.5, fontWeight:800,
        color:'rgba(255,255,255,0.9)', background:'rgba(0,0,0,0.35)', borderRadius:4, padding:compact ? '2px 6px' : '2px 7px', maxWidth: compact ? '42%' : 'none', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
        {away?.formation}
      </div>

      <div style={{ position:'relative', zIndex:5, display:'flex', alignItems:'stretch', height:'100%', padding: compact ? '38px 10px 12px' : '46px 16px 18px' }}>
        <PitchSide teamData={home} defaultPrimary="#1d6b3f" defaultNumColor="#fff" reverseColumns={false} compact={compact} />
        <div style={{ width:compact ? 6 : 12, flexShrink:0 }} />
        <PitchSide teamData={away} defaultPrimary="#d97706" defaultNumColor="#fff" reverseColumns={true} compact={compact} />
      </div>
    </div>
  )
}

function PlayerList({ players, title, accent }) {
  if (!players?.length) return null
  return (
    <div>
      <div style={{ fontSize:9.5, color:accent, fontWeight:800, letterSpacing:'.08em', marginBottom:5, paddingLeft:2 }}>{title}</div>
      {players.map((p, i) => (
        <div key={i} style={{ display:'flex', alignItems:'center', gap:6, padding:'4px 6px',
          borderRadius:4, background: i%2===0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
          <span style={{ fontFamily:'monospace', fontSize:10, color:'#374151', width:18, textAlign:'right', flexShrink:0 }}>{p.number}</span>
          <span style={{ fontSize:11, color:'#d1d5db', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
          <span style={{ fontSize:9.5, color:'#4b5563', fontWeight:700, flexShrink:0 }}>{p.pos}</span>
        </div>
      ))}
    </div>
  )
}

function LineupsPanel({ lineups, fixture }) {
  const [view, setView] = useState('pitch')
  if (!lineups?.length) return <EmptyState icon={'\u{1F455}'} text={fixture?.status === 'NS' ? 'Lineups released ~60 min before kick-off.' : 'No lineup data.'} />
  const home = lineups[0], away = lineups[1]

  return (
    <div>
      {/* Header */}
      <div className="lineups-panel-header" style={{ display:'flex', alignItems:'center', padding:'8px 12px 6px', gap:8, background:'var(--sw-bg)', borderBottom:'1px solid var(--sw-border)' }}>
        <div className="lineups-panel-team lineups-panel-team-home" style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:5 }}>
          {home?.team?.logo && <img src={home.team.logo} alt="" width={18} height={18} style={{ objectFit:'contain', flexShrink:0 }} />}
          <div style={{ minWidth: 0 }}><span style={{ fontSize:11, fontWeight:800, color:'#d1d5db', overflowWrap: 'anywhere' }}>{home?.team?.name}</span><span style={{ fontSize:10, color:'#374151', marginLeft:5 }}>{home?.formation}</span></div>
        </div>
        <div className="lineups-panel-toggle" style={{ display:'flex', background:'var(--sw-border)', borderRadius:5, overflow:'hidden', flexShrink:0 }}>
          {[['pitch', '\u26BD'], ['list', '\u2630']].map(([v,ic]) => (
            <button key={v} onClick={() => setView(v)} style={{ minHeight: 36, padding:'4px 10px', background: view===v ? '#1e3a5f' : 'none', border:'none', color: view===v ? '#d1d5db' : '#4b5563', fontSize:11, cursor:'pointer', fontWeight: view===v ? 700 : 400 }}>{ic}</button>
          ))}
        </div>
        <div className="lineups-panel-team lineups-panel-team-away" style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:5, justifyContent:'flex-end' }}>
          <div style={{ textAlign:'right', minWidth: 0 }}><span style={{ fontSize:11, fontWeight:800, color:'#9ca3af', overflowWrap: 'anywhere' }}>{away?.team?.name}</span><span style={{ fontSize:10, color:'#374151', marginLeft:5 }}>{away?.formation}</span></div>
          {away?.team?.logo && <img src={away.team.logo} alt="" width={18} height={18} style={{ objectFit:'contain', flexShrink:0 }} />}
        </div>
      </div>

      {view === 'pitch' && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 12px', background: 'var(--sw-surface-0)' }}>
          <div style={{ width: '100%', maxWidth: 560 }}>
            <FormationPitch home={home} away={away} />
          </div>
        </div>
      )}

      {/* Substitutes / list */}
      <div className="lineups-panel-lists" style={{ display:'grid', gridTemplateColumns:'1fr 1fr', borderTop:'1px solid var(--sw-border)' }}>
        <div className="lineups-panel-list-card" style={{ padding:'10px 8px 12px 12px', borderRight:'1px solid var(--sw-border)' }}>
          {view === 'list'
            ? <><PlayerList players={home?.startXI} title="STARTING XI" accent="#d1d5db" /><div style={{ marginTop:8 }}><PlayerList players={home?.substitutes} title="BENCH" accent="#4b5563" /></div></>
            : <PlayerList players={home?.substitutes} title="SUBSTITUTES" accent="#d1d5db" />}
          {home?.coach?.name && <div style={{ marginTop:6, fontSize:10, color:'#374151' }}>{'\u{1F9D1}\u200D\u{1F4BC}'} {home.coach.name}</div>}
        </div>
        <div className="lineups-panel-list-card" style={{ padding:'10px 12px 12px 8px' }}>
          {view === 'list'
            ? <><PlayerList players={away?.startXI} title="STARTING XI" accent="#9ca3af" /><div style={{ marginTop:8 }}><PlayerList players={away?.substitutes} title="BENCH" accent="#4b5563" /></div></>
            : <PlayerList players={away?.substitutes} title="SUBSTITUTES" accent="#9ca3af" />}
          {away?.coach?.name && <div style={{ marginTop:6, fontSize:10, color:'#374151' }}>{'\u{1F9D1}\u200D\u{1F4BC}'} {away.coach.name}</div>}
        </div>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 4 — H2H
// ─────────────────────────────────────────────────────────────────────────────

function historyRangeCount(range) {
  if (range === 'L5') return 5
  if (range === 'L10') return 10
  return 15
}

function buildFixtureLabel(match, teamName) {
  const ownTeam = teamName || 'Team'
  const opponent = match?.opponent || 'Opponent'
  return match?.isHome ? `${ownTeam} vs ${opponent}` : `${opponent} vs ${ownTeam}`
}

function H2HRow({ match, teamName, compact = false }) {
  const rc = match.result === 'W' ? '#22c55e' : match.result === 'L' ? '#ef4444' : '#f59e0b'
  let ds = '-'
  try { ds = new Date(match.date).toLocaleDateString('en-GB', { day:'2-digit', month:'2-digit', year:'2-digit' }) } catch {}
  const fixtureLabel = buildFixtureLabel(match, teamName)
  const venueLabel = match.isHome ? 'Home fixture' : 'Away fixture'
  const goalsLabel = match.goals != null ? `${match.goals} total goals` : 'Goal total n/a'
  const cornersLabel = match.corners > 0 ? `${match.corners} corners` : 'Corners n/a'
  return (
    <div
      style={{
        padding: compact ? '12px' : '15px 18px',
        borderBottom:'1px solid rgba(255,255,255,0.05)',
        background: compact ? 'transparent' : 'rgba(255,255,255,0.02)',
        display:'grid',
        gap:12,
      }}
    >
      <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:0 }}>
        <span style={{ width:24, height:24, borderRadius:'50%', background:`${rc}18`, border:`1.5px solid ${rc}`, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, color:rc, fontSize:10, flexShrink:0 }}>{match.result}</span>
        <span style={{ fontSize:9, fontWeight:800, padding:'3px 6px', borderRadius:999, background: match.isHome ? 'rgba(255,122,0,0.12)' : 'rgba(148,163,184,0.12)', color: match.isHome ? '#ffb36b' : '#cbd5e1', flexShrink:0 }}>{match.isHome ? 'HOME' : 'AWAY'}</span>
        <span style={{ color:'#64748b', fontSize:10, marginLeft:'auto', flexShrink:0 }}>{ds}</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns: compact ? '1fr' : 'minmax(0,1.45fr) minmax(180px, auto)', gap:12, alignItems:'center' }}>
        <div style={{ display:'flex', alignItems:'flex-start', gap:10, minWidth:0 }}>
          {match.opponentLogo && <img src={match.opponentLogo} alt="" width={22} height={22} style={{ objectFit:'contain', flexShrink:0, opacity:0.9, marginTop: 2 }} />}
          <div style={{ minWidth:0 }}>
            <div style={{ color:'#f8fafc', fontSize:13, fontWeight:800, lineHeight:1.35, wordBreak:'break-word' }}>{fixtureLabel}</div>
            <div style={{ color:'#64748b', fontSize:10, marginTop:3, textTransform:'uppercase', letterSpacing:'0.06em' }}>{venueLabel}</div>
            <div style={{ color:'#94a3b8', fontSize:11, marginTop:4 }}>{goalsLabel}</div>
          </div>
        </div>
        <div style={{ display:'grid', gap:6, justifyItems: compact ? 'start' : 'end', flexShrink:0 }}>
          <div style={{ fontFamily:'monospace', fontWeight:900, color:'#f8fafc', fontSize:compact ? 15 : 16 }}>{match.homeGoals}-{match.awayGoals}</div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap', justifyContent: compact ? 'flex-start' : 'flex-end' }}>
            <span style={{ fontSize:10, color:'#94a3b8', padding:'4px 8px', borderRadius:999, background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.06)' }}>{cornersLabel}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function H2HSummary({ matches, homeTeam, awayTeam, compact = false }) {
  if (!matches?.length) return null
  const hw = matches.filter(m => m.result === 'W').length
  const d  = matches.filter(m => m.result === 'D').length
  const aw = matches.filter(m => m.result === 'L').length
  const avg = (matches.reduce((s,m) => s+(m.goals||0), 0) / matches.length).toFixed(1)
  const total = Math.max(matches.length, 1)
  const summaryCards = [
    { label: `${homeTeam?.name || 'Home'} wins`, value: hw, color: '#22c55e' },
    { label: 'Draws', value: d, color: '#f59e0b' },
    { label: `${awayTeam?.name || 'Away'} wins`, value: aw, color: '#94a3b8' },
  ]

  return (
    <div style={{ padding:compact ? '12px' : '14px 16px', background:'linear-gradient(180deg, rgba(16,17,20,0.98), rgba(12,13,15,0.98))', borderBottom:'1px solid var(--sw-border)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, marginBottom:12, flexWrap:'wrap' }}>
        <div>
          <div style={{ fontSize:11, color:'#ffb36b', fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase' }}>Last {matches.length} meetings</div>
          <div style={{ color:'#94a3b8', fontSize:12, marginTop:4 }}>Average total goals: <span style={{ color:'#f8fafc', fontWeight:800 }}>{avg}</span></div>
        </div>
        <div style={{ color:'#64748b', fontSize:11 }}>Most recent results first</div>
      </div>
      <div style={{ display:'grid', gridTemplateColumns: compact ? '1fr' : 'repeat(3, minmax(0, 1fr))', gap:10 }}>
        {summaryCards.map(card => (
          <div key={card.label} style={{ border:'1px solid rgba(255,255,255,0.06)', borderRadius:12, padding:'12px 14px', background:'rgba(255,255,255,0.02)' }}>
            <div style={{ color:'#94a3b8', fontSize:11, marginBottom:8, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{card.label}</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
              <span style={{ color:'#f8fafc', fontWeight:900, fontSize:18 }}>{card.value}</span>
              <span style={{ color:card.color, fontSize:11, fontWeight:700 }}>{Math.round((card.value / total) * 100)}%</span>
            </div>
            <div style={{ color:'#64748b', fontSize:10, marginTop:4 }}>{card.value} of {total} matches</div>
            <div style={{ marginTop:10, height:6, borderRadius:999, background:'rgba(255,255,255,0.05)', overflow:'hidden' }}>
              <div style={{ width:`${(card.value / total) * 100}%`, height:'100%', background:card.color, borderRadius:999 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function FormBadges({ matches, label, compact = false }) {
  if (!matches?.length) return null
  const wins = matches.filter(m => m.result==='W').length
  const draws = matches.filter(m => m.result==='D').length
  const losses = matches.filter(m => m.result==='L').length
  const total = Math.max(matches.length, 1)
  return (
    <div style={{ display:'grid', gap:12, padding:compact ? '12px' : '14px 16px', background:'rgba(255,255,255,0.02)', borderBottom:'1px solid var(--sw-border)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, flexWrap:'wrap' }}>
        <span style={{ fontSize:11, color:'#ffb36b', fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase' }}>{label} form</span>
        <span style={{ color:'#64748b', fontSize:11 }}>Last {matches.length} matches</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${Math.max(matches.length, 1)}, minmax(${compact ? 28 : 34}px, 1fr))`, gap:8, alignItems:'center' }}>
        {matches.map((m,i) => {
          const rc = m.result==='W' ? '#22c55e' : m.result==='L' ? '#ef4444' : '#f59e0b'
          return <span key={i} title={buildFixtureLabel(m, label)} style={{ minWidth:compact ? 28 : 34, height:compact ? 28 : 34, borderRadius:999, background:`${rc}1a`, border:`1px solid ${rc}55`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:900, color:rc }}>{m.result}</span>
        })}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3, minmax(0, 1fr))', gap:8 }}>
        {[{ label:'Wins', value:wins, color:'#22c55e' }, { label:'Draws', value:draws, color:'#f59e0b' }, { label:'Losses', value:losses, color:'#ef4444' }].map(item => (
          <div key={item.label} style={{ padding:'10px 12px', borderRadius:10, border:'1px solid rgba(255,255,255,0.06)', background:'rgba(255,255,255,0.015)' }}>
            <div style={{ color:'#94a3b8', fontSize:10, marginBottom:6 }}>{item.label}</div>
            <div style={{ display:'flex', alignItems:'baseline', gap:8 }}>
              <div style={{ color:item.color, fontWeight:900, fontSize:16 }}>{item.value}</div>
              <div style={{ color:'#64748b', fontSize:10 }}>{Math.round((item.value / total) * 100)}%</div>
            </div>
            <div style={{ marginTop:8, height:6, borderRadius:999, background:'rgba(255,255,255,0.05)', overflow:'hidden' }}>
              <div style={{ width:`${(item.value / total) * 100}%`, height:'100%', background:item.color, borderRadius:999 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function H2HPanel({ h2h, homeHistory, awayHistory, fixture }) {
  const [sub, setSub] = useState('h2h')
  const [range, setRange] = useState('L10')
  const [compact, setCompact] = useState(() => window.innerWidth <= 640)

  useEffect(() => {
    const onResize = () => setCompact(window.innerWidth <= 640)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const tabs = [
    { key:'h2h',  label:'H2H' },
    { key:'home', label: fixture?.homeTeam?.name || 'Home' },
    { key:'away', label: fixture?.awayTeam?.name || 'Away' },
  ]
  const activeAll = sub==='h2h' ? h2h : sub==='home' ? homeHistory : awayHistory
  const visibleCount = historyRangeCount(range)
  const active = (activeAll || []).slice(0, visibleCount)
  const teamLabel = sub === 'away' ? (fixture?.awayTeam?.name || 'Away') : (fixture?.homeTeam?.name || 'Home')
  const rangeOptions = ['L5', 'L10', 'L15']

  return (
    <div>
      <div style={{ display:'flex', background:'var(--sw-bg)', borderBottom:'1px solid var(--sw-border)' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setSub(t.key)} style={{
            flex:1, padding:compact ? '10px 4px' : '9px 4px', background:'none', border:'none',
            borderBottom: sub===t.key ? '2px solid #f97316' : '2px solid transparent',
            color: sub===t.key ? '#d1d5db' : '#6b7280',
            fontSize:compact ? 10 : 11, fontWeight: sub===t.key ? 800 : 500, cursor:'pointer',
            overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
          }}>{t.label}</button>
        ))}
      </div>

      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:12, padding: compact ? '10px 12px' : '12px 16px', borderBottom:'1px solid var(--sw-border)', background:'rgba(255,255,255,0.015)', flexWrap:'wrap' }}>
        <div style={{ color:'#94a3b8', fontSize:11 }}>
          Showing <span style={{ color:'#f8fafc', fontWeight:800 }}>{active.length}</span> matches for <span style={{ color:'#ffb36b', fontWeight:800 }}>{range}</span>
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {rangeOptions.map(option => (
            <button
              key={option}
              type="button"
              onClick={() => setRange(option)}
              style={{
                minHeight: 32,
                padding: '0 12px',
                borderRadius: 999,
                border: `1px solid ${range === option ? 'rgba(249,115,22,0.45)' : 'rgba(255,255,255,0.08)'}`,
                background: range === option ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.02)',
                color: range === option ? '#ffb36b' : '#94a3b8',
                fontSize: 11,
                fontWeight: 800,
                cursor: 'pointer',
              }}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {sub==='h2h' && active.length>0     && <H2HSummary matches={active} homeTeam={fixture?.homeTeam} awayTeam={fixture?.awayTeam} compact={compact} />}
      {sub==='home' && active.length>0 && <FormBadges matches={active} label={fixture?.homeTeam?.name || 'Home'} compact={compact} />}
      {sub==='away' && active.length>0  && <FormBadges matches={active} label={fixture?.awayTeam?.name || 'Away'} compact={compact} />}

      {active?.length>0
        ? active.map((m,i) => <H2HRow key={`${m?.date || 'row'}-${i}`} match={m} teamName={teamLabel} compact={compact} />)
        : <EmptyState icon={'\u{1F50D}'} text="No historical data available." />}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// TAB 5 — HISTORICAL STATS (all 15 betting measures, adjustable ALT lines)
// ─────────────────────────────────────────────────────────────────────────────

function rc(rate) {
  if (rate>=0.8) return { bg:'rgba(34,197,94,0.10)',  br:'rgba(34,197,94,0.28)',  tx:'#22c55e' }
  if (rate>=0.6) return { bg:'rgba(234,179,8,0.10)',  br:'rgba(234,179,8,0.28)',  tx:'#eab308' }
  return               { bg:'rgba(239,68,68,0.08)',   br:'rgba(239,68,68,0.22)',  tx:'#ef4444' }
}

function calcHits(history, statKey, alt, isHome) {
  if (!history?.length) return { hits:0, total:0, rate:0, avg:0, values:[] }
  const last10 = history.filter(match => hasStatValue(match, statKey, isHome)).slice(0,10)
  if (!last10.length) return { hits:0, total:0, rate:0, avg:0, values:[] }
  const def = getStatDef(statKey)
  const values = last10.map(m => extractStatValue(m, statKey, isHome))
  const hits = values.filter(v => def?.binary ? v===1 : v>(alt ?? 0)).length
  const avg  = values.reduce((s,v)=>s+v,0) / (values.length||1)
  return { hits, total:last10.length, rate: last10.length ? hits/last10.length : 0, avg: Math.round(avg*10)/10, values }
}

function SparkBars({ values, alt, binary }) {
  const max = binary ? 1 : Math.max(...values, (alt||0)+1, 1)
  const altPct = binary ? null : Math.min((alt/max)*100, 95)
  return (
    <div style={{ position:'relative', height:26, display:'flex', alignItems:'flex-end', gap:2, marginTop:5 }}>
      {altPct!=null && <div style={{ position:'absolute', left:0, right:0, bottom:`${altPct}%`, borderTop:'1.5px dashed rgba(245,158,11,0.5)', pointerEvents:'none' }} />}
      {values.map((v,i) => (
        <div key={i} style={{ flex:1, height:`${binary ? 100 : Math.max((v/max)*100,5)}%`, minHeight:3,
          background: (binary ? v===1 : v>(alt ?? 0)) ? '#22c55e' : '#ef4444',
          borderRadius:'1px 1px 0 0', opacity:0.88 }} />
      ))}
    </div>
  )
}

function StatRow({ statDef, homeHistory, awayHistory, alt, onAltChange }) {
  const { key, icon, shortLabel, binary, scope } = statDef
  const isTeam = scope === 'team'
  const hd = calcHits(homeHistory, key, alt, true)
  const ad = calcHits(awayHistory, key, alt, false)
  const avg = (hd.rate + ad.rate) / 2
  const c   = rc(avg)

  const Pill = ({ d }) => {
    const cl = rc(d.rate)
    return <span style={{ display:'inline-flex', alignItems:'center', gap:3, padding:'2px 6px', borderRadius:20, background:cl.bg, border:`1px solid ${cl.br}`, color:cl.tx, fontWeight:800, fontSize:10.5, whiteSpace:'nowrap' }}>{d.hits}/{d.total} - {Math.round(d.rate*100)}%</span>
  }

  return (
    <div style={{ background:'var(--sw-surface-0)', border:`1px solid ${avg>=0.6 ? c.br : 'var(--sw-border)'}`, borderRadius:8, overflow:'hidden', marginBottom:7 }}>
      <div style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 10px', background:'var(--sw-bg)', borderBottom:'1px solid var(--sw-border)' }}>
        <span style={{ fontSize:13, flexShrink:0 }}>{icon}</span>
        <span style={{ flex:1, fontSize:11.5, fontWeight:700, color:'#e5e7eb' }}>{shortLabel}</span>
        {!binary && (
          <div style={{ display:'flex', alignItems:'center', background:'var(--sw-border)', borderRadius:4, overflow:'hidden' }}>
            <button onClick={() => onAltChange(key, Math.max(0, Math.round((alt-0.5)*2)/2))} style={{ width:22, height:22, background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:14 }}>-</button>
            <span style={{ fontSize:11, fontWeight:800, color:'#f59e0b', minWidth:30, textAlign:'center' }}>{alt}</span>
            <button onClick={() => onAltChange(key, Math.round((alt+0.5)*2)/2)} style={{ width:22, height:22, background:'none', border:'none', color:'#6b7280', cursor:'pointer', fontSize:14 }}>+</button>
          </div>
        )}
        <span style={{ padding:'2px 7px', borderRadius:20, fontSize:11, fontWeight:800, background:c.bg, border:`1px solid ${c.br}`, color:c.tx }}>{Math.round(avg*100)}%</span>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr' }}>
        {[{isHome:true, d:hd},{isHome:false, d:ad}].map(({isHome, d}) => (
          <div key={String(isHome)} style={{ padding:'6px 8px', borderRight: isHome ? '1px solid var(--sw-border)' : 'none' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <span style={{ fontSize:10, color: isHome ? '#d1d5db' : '#9ca3af', fontWeight:700 }}>{isHome ? 'Home' : 'Away'}{isTeam ? (isHome ? ' H' : ' A') : ''}</span>
              {!binary && <span style={{ fontSize:9, color:'#4b5563' }}>avg {d.avg}</span>}
            </div>
            <Pill d={d} />
            {d.values.length>0 && <SparkBars values={d.values} alt={alt} binary={binary} />}
          </div>
        ))}
      </div>
    </div>
  )
}

function HistoricalStatsPanel({ homeHistory, awayHistory, fixture }) {
  const defaultAlts = useMemo(() => {
    const m = {}
    STATS_ORDER.forEach(s => { m[s.key] = s.binary ? null : (s.defaultAlt ?? 2.5) })
    return m
  }, [])
  const [alts, setAlts] = useState(defaultAlts)
  const [grp, setGrp]   = useState('all')

  if (!homeHistory?.length && !awayHistory?.length) return <EmptyState icon={'\u{1F4C8}'} text="Historical stats load once team history is available." />

  const groups  = ['all', ...Object.keys(STAT_GROUPS)]
  const visible = grp==='all' ? STATS_ORDER : STATS_ORDER.filter(s => s.group===grp)

  return (
    <div style={{ padding:'10px 11px 20px' }}>
      {/* Group filter pills */}
      <div style={{ display:'flex', gap:5, flexWrap:'wrap', marginBottom:11 }}>
        {groups.map(g => {
          const gd = STAT_GROUPS[g]
          const active = grp===g
          return (
            <button key={g} onClick={() => setGrp(g)} style={{
              padding:'3px 9px', borderRadius:20,
              border:`1px solid ${active ? (gd?.color||'#f97316') : 'var(--sw-border)'}`,
              background: active ? `${gd?.color||'#f97316'}14` : 'transparent',
              color: active ? (gd?.color||'#d1d5db') : '#4b5563',
              fontSize:10.5, fontWeight: active?800:500, cursor:'pointer',
            }}>{gd ? `${gd.icon} ${gd.label}` : 'All'}</button>
          )
        })}
      </div>
      {/* Team headers */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', marginBottom:8 }}>
        <div style={{ display:'flex', alignItems:'center', gap:5, paddingLeft:8 }}>
          {fixture?.homeTeam?.logo && <img src={fixture.homeTeam.logo} alt="" width={16} height={16} style={{ objectFit:'contain' }} />}
          <span style={{ fontSize:10.5, fontWeight:800, color:'#d1d5db', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fixture?.homeTeam?.name}</span>
          <span style={{ fontSize:9, color:'#374151' }}>({homeHistory?.length||0})</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:5, paddingRight:8 }}>
          <span style={{ fontSize:9, color:'#374151' }}>({awayHistory?.length||0})</span>
          <span style={{ fontSize:10.5, fontWeight:800, color:'#9ca3af', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fixture?.awayTeam?.name}</span>
          {fixture?.awayTeam?.logo && <img src={fixture.awayTeam.logo} alt="" width={16} height={16} style={{ objectFit:'contain' }} />}
        </div>
      </div>
      {visible.map(stat => (
        <StatRow key={stat.key} statDef={stat}
          homeHistory={homeHistory||[]} awayHistory={awayHistory||[]}
          alt={alts[stat.key]}
          onAltChange={(k,v) => setAlts(prev => ({...prev, [k]:v}))} />
      ))}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// SCORE CARD
// ─────────────────────────────────────────────────────────────────────────────

function SectionCard({ title, children }) {
  return (
    <section style={{ margin: '8px 12px 0', border: '1px solid var(--sw-border)', borderRadius: 10, overflow: 'hidden', background: 'var(--sw-bg)' }}>
      <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--sw-border)', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 800, color: '#94a3b8' }}>
        {title}
      </div>
      {children}
    </section>
  )
}

function FinishedOverviewPanel({ fixture, statistics, events, lineups }) {
  return (
    <div style={{ paddingBottom: 14 }}>
      <SectionCard title="Match Statistics">
        <StatisticsPanel statistics={statistics} fixture={fixture} />
      </SectionCard>
      <SectionCard title="Goals & Cards">
        <EventsPanel events={events} fixture={fixture} />
      </SectionCard>
      <SectionCard title="Lineups">
        <LineupsPanel lineups={lineups} fixture={fixture} />
      </SectionCard>
    </div>
  )
}

function LiveCenterPanel({ fixture, statistics, events, homeHistory, awayHistory, h2h, initialStatKey }) {
  return (
    <div style={{ paddingBottom: 14 }}>
      <SectionCard title="Live Statistics">
        <StatisticsPanel statistics={statistics} fixture={fixture} />
      </SectionCard>
      <SectionCard title="Live Events">
        <EventsPanel events={events} fixture={fixture} />
      </SectionCard>
      <SectionCard title="Live Prop Analysis">
        <MatchDetailsSwimlane
          homeHistory={homeHistory}
          awayHistory={awayHistory}
          h2h={h2h}
          fixture={fixture}
          initialStatKey={initialStatKey}
        />
      </SectionCard>
    </div>
  )
}

function ScoreCard({ fixture, t, lang }) {
  const isNS = fixture.status==='NS', isLive = fixture.isLive, isFT = FINISHED_STATUSES.has(fixture.status)
  return (
    <div style={{ padding:'18px 12px', background:'var(--sw-surface-0)', borderBottom:'1px solid var(--sw-border)' }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', maxWidth:500, margin:'0 auto', gap:8 }}>
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6, minWidth:0, padding:'0 4px' }}>
          <TeamLogo src={fixture.homeTeam?.logo} name={fixture.homeTeam?.name} size={50} />
          <span style={{ fontSize:12, fontWeight:800, textAlign:'center', color:'#e5e7eb', lineHeight:1.2, maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fixture.homeTeam?.name}</span>
        </div>
        <div style={{ textAlign:'center', flexShrink:0, padding:'0 8px' }}>
          {isNS ? (
            <><div style={{ fontSize:22, fontWeight:800, color:'#4b5563', letterSpacing:1 }}>{fixture.time}</div>
            <div style={{ fontSize:10, color:'#374151', marginTop:3 }}>{formatAppDate(fixture.date, { compactOnMobile: true })}</div></>
          ) : (
            <><div style={{ fontSize:36, fontWeight:900, fontFamily:'monospace', letterSpacing:2, color: isLive ? '#ef4444' : '#f1f5f9' }}>
              {fixture.homeGoals ?? '-'}<span style={{ color:'#374151', margin:'0 1px' }}>-</span>{fixture.awayGoals ?? '-'}
            </div>
            {fixture.htHome!=null && fixture.htAway!=null && <div style={{ fontSize:10, color:'#4b5563', marginTop:1 }}>HT {fixture.htHome}-{fixture.htAway}</div>}
            <div style={{ marginTop:3 }}>
              {isLive && <span style={{ fontSize:11, fontWeight:800, color:'#ef4444', background:'rgba(239,68,68,0.12)', borderRadius:4, padding:'2px 6px' }}>{fixture.elapsed}'</span>}
              {isFT && <span style={{ fontSize:11, fontWeight:700, color:'#22c55e' }}>{t('md_full_time')}</span>}
            </div></>
          )}
        </div>
        <div style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:6, minWidth:0, padding:'0 4px' }}>
          <TeamLogo src={fixture.awayTeam?.logo} name={fixture.awayTeam?.name} size={50} />
          <span style={{ fontSize:12, fontWeight:800, textAlign:'center', color:'#e5e7eb', lineHeight:1.2, maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{fixture.awayTeam?.name}</span>
        </div>
      </div>
    </div>
  )
}

function initialsFromUser(user = {}) {
  const source = String(user?.name || user?.nickname || '?').trim()
  if (!source) return '??'
  const parts = source.split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase()
  return source.slice(0, 2).toUpperCase()
}

function avatarPalette(seed = '') {
  const hues = [8, 22, 38, 156, 196, 218, 262, 286, 336]
  let hash = 0
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) % 100000
  const hue = hues[hash % hues.length]
  return {
    bg: `linear-gradient(135deg, hsl(${hue} 72% 36%), hsl(${(hue + 24) % 360} 78% 48%))`,
    border: `hsl(${hue} 55% 62%)`,
  }
}

function posCodeFromPlayer(player = {}) {
  const raw = String(player?.posCode || player?.pos || player?.position || '').toLowerCase()
  if (raw.startsWith('g')) return 'G'
  if (raw.startsWith('d')) return 'D'
  if (raw.startsWith('m')) return 'M'
  if (raw.startsWith('f') || raw.startsWith('a') || raw.includes('wing') || raw.includes('striker')) return 'F'
  return 'M'
}

function normalizeName(name = '', idx = 0, teamName = 'Team') {
  const n = String(name || '').trim()
  if (n) return n
  return `${teamName} Player ${idx + 1}`
}

function formationGrid(index) {
  const preset = [
    '1:1',
    '1:2', '2:2', '3:2', '4:2',
    '1:3', '2:3', '3:3',
    '1:4', '2:4', '3:4',
  ]
  return preset[index] || `${(index % 4) + 1}:${Math.floor(index / 4) + 1}`
}

function buildTeamFallbackLineup(team = {}, squad = []) {
  const teamName = team?.name || 'Team'
  const teamId = Number(team?.id || 0)
  const byPos = { G: [], D: [], M: [], F: [] }
  ;(squad || []).forEach((p, idx) => {
    const code = posCodeFromPlayer(p)
    byPos[code].push({ ...p, _idx: idx })
  })

  const starters = []
  const take = (arr, n) => {
    const out = arr.splice(0, n)
    out.forEach(p => starters.push(p))
  }
  take(byPos.G, 1)
  take(byPos.D, 4)
  take(byPos.M, 3)
  take(byPos.F, 3)

  const leftovers = [...byPos.G, ...byPos.D, ...byPos.M, ...byPos.F]
  while (starters.length < 11 && leftovers.length) starters.push(leftovers.shift())
  while (starters.length < 11) starters.push({ name: `${teamName} Player ${starters.length + 1}`, id: `${teamId}-x-${starters.length + 1}` })

  const usedKeys = new Set(starters.map(p => `${p.id || ''}-${p.name || ''}`.toLowerCase()))
  const bench = (squad || [])
    .filter(p => !usedKeys.has(`${p.id || ''}-${p.name || ''}`.toLowerCase()))
    .slice(0, 9)

  const mappedStarters = starters.slice(0, 11).map((p, idx) => ({
    id: Number(p.id) || Number(`${teamId}${idx + 1}`),
    name: normalizeName(p.name, idx, teamName),
    number: Number(p.number) || (idx + 1),
    pos: idx === 0 ? 'G' : posCodeFromPlayer(p),
    grid: formationGrid(idx),
  }))
  const mappedBench = bench.map((p, idx) => ({
    id: Number(p.id) || Number(`${teamId}${idx + 21}`),
    name: normalizeName(p.name, idx + 11, teamName),
    number: Number(p.number) || (idx + 12),
    pos: posCodeFromPlayer(p),
    grid: null,
  }))

  return {
    team: {
      id: teamId,
      name: teamName,
      logo: team?.logo || null,
      colors: team?.colors || null,
    },
    formation: FALLBACK_FORMATION,
    startXI: mappedStarters,
    substitutes: mappedBench,
    coach: { name: team?.coach || '' },
  }
}

function buildFallbackLineups(fixture, squadPlayers = []) {
  if (!fixture?.homeTeam && !fixture?.awayTeam) return []
  const homeTeamId = Number(fixture?.homeTeam?.id || fixture?.homeTeamId || 0)
  const awayTeamId = Number(fixture?.awayTeam?.id || fixture?.awayTeamId || 0)
  const homeSquad = squadPlayers.filter(p => Number(p?.teamId || 0) === homeTeamId)
  const awaySquad = squadPlayers.filter(p => Number(p?.teamId || 0) === awayTeamId)
  return [
    buildTeamFallbackLineup(fixture?.homeTeam || { id: homeTeamId, name: 'Home' }, homeSquad),
    buildTeamFallbackLineup(fixture?.awayTeam || { id: awayTeamId, name: 'Away' }, awaySquad),
  ]
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────────────────────────────────────

export default function MatchDetails() {
  const { id }           = useParams()
  const navigate         = useNavigate()
  const [searchParams]   = useSearchParams()
  const { t, lang } = useLang()
  const { user } = useAuth()
  const detailsRequest = useMemo(() => ({
    date: searchParams.get('date') || undefined,
  }), [searchParams])
  const { data, loading, error, refetch } = useMatchDetails(id, detailsRequest)
  const [detailsView, setDetailsView] = useState('match')
  const [todayFixtures, setTodayFixtures] = useState([])
  const [dashboardOpen, setDashboardOpen] = useState(false)

  function openUserProfile() {
    if (typeof window !== 'undefined' && window.innerWidth <= 768) {
      navigate('/account')
      return
    }
    setDashboardOpen(true)
  }

  const groupedTodayFixtures = useMemo(() => {
    const map = new Map()
    todayFixtures.forEach(f => {
      const country = f?.league?.country || 'Unknown Country'
      const league = f?.league?.name || 'Unknown League'
      const key = `${country} - ${league}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(f)
    })
    return Array.from(map.entries())
  }, [todayFixtures])
  const returnDateFromQuery = searchParams.get('date') || ''
  const fallbackHomeHref = returnDateFromQuery ? `/?date=${returnDateFromQuery}` : '/'

  const formatFixtureTime = (f) => {
    if (f?.time && String(f.time).trim()) return String(f.time).trim()
    const dt = new Date(f?.date || '')
    if (Number.isNaN(dt.getTime())) return '--:--'
    return dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
  }
  useEffect(() => {
    let cancelled = false
    const baseDate = data?.fixture?.date ? new Date(data.fixture.date) : new Date()
    const y = baseDate.getFullYear()
    const m = String(baseDate.getMonth() + 1).padStart(2, '0')
    const d = String(baseDate.getDate()).padStart(2, '0')
    const dateStr = `${y}-${m}-${d}`
    ;(async () => {
      try {
        const list = await fetchFixturesByDate(dateStr)
        if (!cancelled) setTodayFixtures(Array.isArray(list) ? list : [])
      } catch {
        if (!cancelled) setTodayFixtures([])
      }
    })()
    return () => {
      cancelled = true
    }
  }, [data?.fixture?.date])

  const effectiveLineups = useMemo(() => {
    const liveLineups = Array.isArray(data?.lineups) ? data.lineups : []
    if (liveLineups.length) return liveLineups
    const squadPlayers = Array.isArray(data?.squadPlayers) ? data.squadPlayers : []
    return buildFallbackLineups(data?.fixture, squadPlayers)
  }, [data?.lineups, data?.fixture, data?.squadPlayers])

  const fixturePlayers = useMemo(() => {
    const lineups = effectiveLineups
    const apiPlayers = Array.isArray(data?.players) ? data.players : []
    const squadPlayers = Array.isArray(data?.squadPlayers) ? data.squadPlayers : []
    if (!lineups?.length && !apiPlayers.length && !squadPlayers.length) return []

    const list = []
    const pLabel = { G: 'Goalkeeper', D: 'Defender', M: 'Midfielder', F: 'Forward' }
    const hash = (str = '') => str.split('').reduce((s, ch) => s + ch.charCodeAt(0), 0)
    const statFromSeed = (seed, min, max) => min + (seed % (max - min + 1))

    const lineupIndex = new Map()
    ;(lineups || []).forEach(teamBlock => {
      const teamId = teamBlock?.team?.id || 0
      ;[...(teamBlock?.startXI || []), ...(teamBlock?.substitutes || [])].forEach(p => {
        lineupIndex.set(`${teamId}-${p.id || ''}`.toLowerCase(), p)
        lineupIndex.set(`${teamId}-${p.name || ''}`.toLowerCase(), p)
      })
    })

    if (apiPlayers.length) {
      apiPlayers.forEach(p => {
        if (!p?.name) return
        const teamId = p.teamId || 0
        const linked = lineupIndex.get(`${teamId}-${p.id || ''}`.toLowerCase()) || lineupIndex.get(`${teamId}-${p.name || ''}`.toLowerCase())
        list.push({
          ...p,
          number: p.number ?? linked?.number ?? null,
          grid: p.grid || linked?.grid || null,
          posCode: p.posCode || linked?.pos || null,
          position: p.position || pLabel[linked?.pos] || 'Player',
          stats: {
            goals: Number(p?.stats?.goals) || 0,
            assists: Number(p?.stats?.assists) || 0,
            shots: Number(p?.stats?.shots) || 0,
            shotsOnTarget: Number(p?.stats?.shotsOnTarget) || 0,
            foulsCommitted: Number(p?.stats?.foulsCommitted) || 0,
            foulsDrawn: Number(p?.stats?.foulsDrawn) || 0,
            offsides: Number(p?.stats?.offsides) || 0,
            yellowCards: Number(p?.stats?.yellowCards) || 0,
            redCards: Number(p?.stats?.redCards) || 0,
            rating: Number(p?.stats?.rating) || 0,
          },
        })
      })
    }

    const squadIndex = new Map()
    squadPlayers.forEach(p => {
      const keyById = `${p.teamId || 0}-${p.id || ''}`.toLowerCase()
      const keyByName = `${p.teamId || 0}-${p.name || ''}`.toLowerCase()
      squadIndex.set(keyById, p)
      squadIndex.set(keyByName, p)
    })
    const apiIdentity = new Set(
      list.flatMap(p => [
        `${p.teamId || 0}-${p.id || ''}`.toLowerCase(),
        `${p.teamId || 0}-${p.name || ''}`.toLowerCase(),
      ])
    )

    ;(lineups || []).forEach(teamBlock => {
      const teamName = teamBlock?.team?.name || ''
      const teamId = teamBlock?.team?.id || 0
      const addPlayer = (p, isBench = false) => {
        if (!p?.name) return
        const seed = hash(`${p.name}-${teamId}-${p.number || 0}`)
        if (apiPlayers.length && (apiIdentity.has(`${teamId}-${p.id || ''}`.toLowerCase()) || apiIdentity.has(`${teamId}-${p.name || ''}`.toLowerCase()))) return
        const squad = squadIndex.get(`${teamId}-${p.id || ''}`.toLowerCase()) || squadIndex.get(`${teamId}-${p.name || ''}`.toLowerCase())
        list.push({
          id: Number(p.id) || seed,
          name: p.name,
          team: teamName,
          teamId,
          number: p.number ?? null,
          grid: p.grid || null,
          posCode: p.pos || null,
          position: pLabel[p.pos] || 'Player',
          nationality: squad?.nationality || '-',
          age: squad?.age || null,
          photo: squad?.photoLocal || squad?.photo || null,
          stats: {
            goals: statFromSeed(seed, 0, isBench ? 8 : 16),
            assists: statFromSeed(seed + 3, 0, isBench ? 6 : 12),
            shots: statFromSeed(seed + 5, 8, isBench ? 45 : 90),
            shotsOnTarget: statFromSeed(seed + 7, 2, isBench ? 24 : 46),
            foulsCommitted: statFromSeed(seed + 11, 4, 42),
            foulsDrawn: statFromSeed(seed + 13, 4, 52),
            offsides: statFromSeed(seed + 17, 0, 16),
            yellowCards: statFromSeed(seed + 19, 0, 8),
            redCards: statFromSeed(seed + 23, 0, 2),
            rating: Number((6 + ((seed % 220) / 100)).toFixed(2)),
          },
        })
      }
      ;(teamBlock?.startXI || []).forEach(p => addPlayer(p, false))
      ;(teamBlock?.substitutes || []).forEach(p => addPlayer(p, true))
    })

    const seen = new Set()
    const normalized = list.filter(p => {
      const key = `${p.teamId}-${p.id || p.name}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).map(p => {
      const squad = squadIndex.get(`${p.teamId || 0}-${p.id || ''}`.toLowerCase()) || squadIndex.get(`${p.teamId || 0}-${p.name || ''}`.toLowerCase())
      return {
        ...p,
        photo: p.photoLocal || p.photo || squad?.photoLocal || squad?.photo || null,
        nationality: p.nationality && p.nationality !== '-' ? p.nationality : (squad?.nationality || '-'),
        age: p.age || squad?.age || null,
      }
    })
    const extraSquad = squadPlayers
      .filter(sp => !seen.has(`${sp.teamId}-${sp.id || sp.name}`))
      .map(sp => ({
        id: sp.id || `${sp.teamId}-${sp.name}`,
        name: sp.name,
        team: sp.team,
        teamId: sp.teamId,
        number: sp.number ?? null,
        grid: null,
        posCode: sp.posCode || null,
        position: sp.position || 'Player',
        nationality: sp.nationality || '-',
        age: sp.age || null,
        photo: sp.photoLocal || sp.photo || null,
        stats: {
          goals: 0,
          assists: 0,
          shots: 0,
          shotsOnTarget: 0,
          foulsCommitted: 0,
          foulsDrawn: 0,
          offsides: 0,
          yellowCards: 0,
          redCards: 0,
          rating: 0,
        },
      }))
    return normalized.concat(extraSquad)
  }, [effectiveLineups, data?.players, data?.squadPlayers])

  if (loading) return (
    <div style={{ background:'var(--sw-bg)', minHeight:'100vh', display:'flex', flexDirection:'column' }}>
      <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--sw-border)', display:'flex', background:'var(--sw-surface-0)' }}>
        <button onClick={() => navigate(fallbackHomeHref)} style={{ background:'none', border:'1px solid #374151', borderRadius:6, color:'#9ca3af', cursor:'pointer', padding:'5px 10px', fontSize:13 }}>Back</button>
      </div>
      <Spinner text={t('md_loading')} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (error) return (
    <div style={{ background:'var(--sw-bg)', minHeight:'100vh', padding:40, textAlign:'center' }}>
      <div style={{ fontSize:40, marginBottom:12 }}>!</div>
      <p style={{ color:'#ef4444', marginBottom:12, fontSize:14 }}>{error}</p>
      <button onClick={refetch} style={{ color:'#d1d5db', background:'none', border:'1px solid #374151', borderRadius:6, cursor:'pointer', padding:'8px 16px', fontSize:13 }}>Retry</button>
      <br />
      <button onClick={() => navigate(fallbackHomeHref)} style={{ marginTop:10, color:'#6b7280', background:'none', border:'none', cursor:'pointer', fontSize:13 }}>Back</button>
    </div>
  )

  const fixture = data?.fixture || null
  const statistics = data?.statistics || null
  const events = data?.events || []
  const lineups = effectiveLineups || []
  const homeHistory = data?.homeHistory || []
  const awayHistory = data?.awayHistory || []
  const h2h = data?.h2h || []
  const statFromQuery = searchParams.get('stat') || undefined
  const returnDate = searchParams.get('date') || String(fixture?.date || '').slice(0, 10)
  const homeHref = returnDate ? `/?date=${returnDate}` : '/'
  const matchTabLabel = 'Match Stats'
  const playerTabLabel = 'Player Statistics'
  const isFinished = FINISHED_STATUSES.has(fixture?.status)
  const isLiveMatch = Boolean(fixture?.isLive)

  if (!data) return null

  return (
    <div className="match-details-page" style={{ background:'var(--sw-bg)', minHeight:'100vh', color:'#f1f5f9', display:'flex', flexDirection:'column' }}>
      <style>{`
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.5}}
        @media (max-width: 768px) {
          .match-details-topbar { padding: 8px 10px !important; }
          .match-details-fixture-select { padding: 8px 10px !important; }
          .match-details-tabs { display: grid !important; grid-template-columns: 1fr 1fr; gap: 6px !important; }
          .match-details-tabs > button { min-width: 0 !important; width: 100%; padding: 8px 10px !important; }
          .match-details-content { padding-bottom: 6px; }
        }
      `}</style>

      {/* Top bar */}
      <div className="match-details-topbar" style={{ padding:'9px 12px', borderBottom:'1px solid var(--sw-border)', display:'flex', alignItems:'center', gap:10, background:'var(--sw-surface-0)', flexShrink:0 }}>
        <button onClick={() => navigate(homeHref)} style={{ background:'none', border:'1px solid #374151', borderRadius:6, color:'#9ca3af', cursor:'pointer', padding:'4px 10px', fontSize:13, flexShrink:0 }}>Back</button>
        {fixture.isLive && <span style={{ fontSize:11, fontWeight:800, color:'#ef4444', background:'rgba(239,68,68,0.15)', borderRadius:4, padding:'2px 7px', animation:'blink 1.5s infinite' }}>LIVE {fixture.elapsed}'</span>}
        <div style={{ flex:1, display:'flex', justifyContent:'center' }}>
          <button
            onClick={() => navigate(homeHref)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, transform: 'scale(0.55)', transformOrigin: 'center' }}
            aria-label="Go to home page"
          >
            <StatsWiseWordmark compact />
          </button>
        </div>
        {user ? (
          <button
            type="button"
            onClick={openUserProfile}
            aria-label="Open user profile"
            style={{ width: 42, height: 42, borderRadius: '999px', border: 'none', padding: 0, cursor: 'pointer', background: 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0 }}
          >
            <span
              style={{
                width: 40,
                height: 40,
                borderRadius: '999px',
                background: avatarPalette(`${user?.name || ''}-${user?.nickname || ''}`).bg,
                border: `2px solid ${avatarPalette(`${user?.name || ''}-${user?.nickname || ''}`).border}`,
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 900,
                fontSize: 14,
                letterSpacing: '0.02em',
              }}
            >
              {initialsFromUser(user)}
            </span>
          </button>
        ) : <div style={{ width: 48, flexShrink: 0 }} />}
      </div>
      {dashboardOpen && <UserDashboard onClose={() => setDashboardOpen(false)} />}

      <div className="match-details-fixture-select" style={{ padding:'8px 12px', borderBottom:'1px solid var(--sw-border)', background:'var(--sw-bg)', flexShrink:0, display:'flex', justifyContent:'center' }}>
        <select
          value={String(fixture?.id || id || '')}
          onChange={(e) => {
            const nextId = e.target.value
            if (!nextId || String(nextId) === String(fixture?.id || id || '')) return
            const nextParams = new URLSearchParams(searchParams)
            const query = nextParams.toString()
            navigate(`/match/${nextId}${query ? `?${query}` : ''}`)
          }}
          style={{
            width: 'min(100%, 560px)',
            padding: '8px 12px',
            borderRadius: 10,
            border: '1px solid var(--sw-border)',
            background: 'var(--sw-surface-0)',
            color: '#e2e8f0',
            fontSize: 13,
            fontWeight: 700,
            outline: 'none',
            textAlign: 'center',
          }}
        >
          {groupedTodayFixtures.map(([leagueLabel, fixtures]) => (
            <optgroup key={leagueLabel} label={leagueLabel}>
              {fixtures.map(f => (
                <option key={f.id} value={String(f.id)}>
                  {`${formatFixtureTime(f)} | ${(f?.homeTeam?.name || 'Home')} vs ${(f?.awayTeam?.name || 'Away')}`}
                </option>
              ))}
            </optgroup>
          ))}
          {!todayFixtures.length && (
            <option value={String(fixture?.id || id || '')}>
              {`${formatFixtureTime(fixture)} | ${(fixture?.homeTeam?.name || 'Home')} vs ${(fixture?.awayTeam?.name || 'Away')}`}
            </option>
          )}
        </select>
      </div>

      <ScoreCard fixture={fixture} t={t} lang={lang} />

      <div className="match-details-content" style={{ flex: 1, background: 'var(--sw-surface-0)', overflowY: 'auto' }}>
        <div className="match-details-tabs" style={{ padding: '10px 12px 0', display: 'flex', justifyContent: 'center', gap: 8, flexWrap: 'wrap' }}>
          <button
            onClick={() => setDetailsView('match')}
            style={{
              minWidth: 160,
              padding: '8px 14px',
              borderRadius: 8,
              border: detailsView === 'match' ? '1px solid #f97316' : '1px solid var(--sw-border)',
              background: detailsView === 'match' ? 'rgba(249,115,22,0.15)' : 'var(--sw-bg)',
              color: detailsView === 'match' ? '#d1d5db' : '#9ca3af',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {matchTabLabel}
          </button>
          <button
            onClick={() => setDetailsView('players')}
            style={{
              minWidth: 160,
              padding: '8px 14px',
              borderRadius: 8,
              border: detailsView === 'players' ? '1px solid #f97316' : '1px solid var(--sw-border)',
              background: detailsView === 'players' ? 'rgba(249,115,22,0.15)' : 'var(--sw-bg)',
              color: detailsView === 'players' ? '#d1d5db' : '#9ca3af',
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
            }}
          >
            {playerTabLabel}
          </button>
        </div>

        {detailsView === 'match' && isFinished && (
          <>
            <FinishedOverviewPanel
              fixture={fixture}
              statistics={statistics}
              events={events}
              lineups={lineups}
            />
            <SectionCard title="Head To Head And Team Form">
              <H2HPanel h2h={h2h} homeHistory={homeHistory} awayHistory={awayHistory} fixture={fixture} />
            </SectionCard>
            <SectionCard title="Historical Stats">
              <HistoricalStatsPanel homeHistory={homeHistory} awayHistory={awayHistory} fixture={fixture} />
            </SectionCard>
          </>
        )}
        {detailsView === 'match' && isLiveMatch && (
          <>
            <LiveCenterPanel
              fixture={fixture}
              statistics={statistics}
              events={events}
              homeHistory={homeHistory}
              awayHistory={awayHistory}
              h2h={h2h}
              initialStatKey={statFromQuery}
            />
            <SectionCard title="Head To Head And Team Form">
              <H2HPanel h2h={h2h} homeHistory={homeHistory} awayHistory={awayHistory} fixture={fixture} />
            </SectionCard>
            <SectionCard title="Historical Stats">
              <HistoricalStatsPanel homeHistory={homeHistory} awayHistory={awayHistory} fixture={fixture} />
            </SectionCard>
          </>
        )}
        {detailsView === 'match' && !isFinished && !isLiveMatch && (
          <>
            <SectionCard title="Lineups">
              <LineupsPanel lineups={lineups} fixture={fixture} />
            </SectionCard>
            <MatchDetailsSwimlane
              homeHistory={homeHistory}
              awayHistory={awayHistory}
              h2h={h2h}
              fixture={fixture}
              initialStatKey={statFromQuery}
            />
            <SectionCard title="Head To Head And Team Form">
              <H2HPanel h2h={h2h} homeHistory={homeHistory} awayHistory={awayHistory} fixture={fixture} />
            </SectionCard>
          </>
        )}
        {detailsView === 'players' && (
          <div style={{ padding: '10px 0 0' }}>
            <PlayerStatsPage
              players={fixturePlayers}
              lineups={lineups || []}
              title={`${fixture?.homeTeam?.name || 'Home'} vs ${fixture?.awayTeam?.name || 'Away'} - ${playerTabLabel}`}
            />
          </div>
        )}
      </div>
    </div>
  )
}








