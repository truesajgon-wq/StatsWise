import { useState, useMemo, useEffect, useCallback } from 'react'
import { fetchMatchDetails, fetchTopPlayers } from '../data/api.js'
import MatchPropAnalysis from '../components/MatchPropAnalysis.jsx'
import { buildFormationPitchSlots } from '../utils/pitchLayout.js'

// ─── Shared small components ────────────────────────────────────────────────────

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

// ─── Player Prop Analysis (last N games) ────────────────────────────────────────

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
    const playerTeamScore = Number.isFinite(Number(r?.playerTeamGoals)) ? Number(r.playerTeamGoals) : null
    const opponentScore = Number.isFinite(Number(r?.opponentGoals)) ? Number(r.opponentGoals) : null
    return {
      fixtureId: r.fixtureId || null,
      opponent: r.opponent,
      fixtureName: r.isHome ? `${playerTeam} vs ${r.opponent}` : `${r.opponent} vs ${playerTeam}`,
      date: r.date,
      isHome: Boolean(r.isHome),
      homeGoals: playerTeamScore != null && opponentScore != null ? (r.isHome ? playerTeamScore : opponentScore) : null,
      awayGoals: playerTeamScore != null && opponentScore != null ? (r.isHome ? opponentScore : playerTeamScore) : null,
      myGoals: playerTeamScore,
      theirGoals: opponentScore,
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

// ─── Generate fake game history (used when no real data available) ───────────

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
    const playerGoals = Number(g.goals || 0)
    const playerShotsOnTarget = Number(g.shotsOnTarget || 0)
    const teamBase = Math.max(Math.ceil(playerGoals), Math.round(playerShotsOnTarget / 2))
    const opponentBase = Math.max(0, Math.round(Math.random() * 3))
    g.playerTeamGoals = Math.max(0, Math.min(6, Math.round(teamBase + Math.round(Math.random() * 2))))
    g.opponentGoals = Math.max(0, Math.min(5, Math.round(opponentBase)))
    games.push(g)
  }
  return games
}

// ─── Player Profile (shows stats + prop analysis for one player) ─────────────

function PlayerProfile({ player }) {
  const s = player.stats || {}
  const teamName = player.team || player.squad || ''
  const nationality = player.nationality || player.nation || ''
  const gameHistory = useMemo(() => generateGameHistory(s), [player.id])
  const gamesPlayed = Number(s.appearances || s.games || s.played || s.matches || 1) || 1

  const v = (key) => Number(s[key] || 0)
  const seasonStats = [
    { label: 'Goals', value: v('goals'), max: Math.max(v('goals'), 4) },
    { label: 'Assists', value: v('assists'), max: Math.max(v('assists'), 4) },
    { label: 'Shots', value: v('shots') || v('shotsTotal'), max: Math.max(v('shots') || v('shotsTotal'), 10) },
    { label: 'Shots on Target', value: v('shotsOnTarget'), max: Math.max(v('shotsOnTarget'), 6) },
    { label: 'Key Passes', value: v('keyPasses'), max: Math.max(v('keyPasses'), 10) },
    { label: 'xG', value: Number(s.xg || 0).toFixed(1), max: Math.max(Number(s.xg || 0), 4) },
    { label: 'xAG', value: Number(s.xag || 0).toFixed(1), max: Math.max(Number(s.xag || 0), 4) },
    { label: 'Tackles', value: v('tackles'), max: Math.max(v('tackles'), 10) },
    { label: 'Interceptions', value: v('interceptions'), max: Math.max(v('interceptions'), 10) },
    { label: 'Fouls Committed', value: v('foulsCommitted'), max: Math.max(v('foulsCommitted'), 6) },
    { label: 'Fouls Drawn', value: v('foulsDrawn'), max: Math.max(v('foulsDrawn'), 6) },
    { label: 'Cards', value: v('yellowCards') + v('redCards'), max: Math.max(v('yellowCards') + v('redCards'), 4) },
  ]

  const perfScore = Number(s.performanceScore || s.performance_score || 0)
  const rating = Number(s.rating || 0) || (perfScore ? perfScore / 10 : 0)

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
          <div style={{ fontSize: 13, color: 'var(--sw-muted)', marginTop: 2 }}>{teamName}{player.position ? ` - ${player.position}` : ''}{nationality ? ` - ${nationality}` : ''}</div>
          {player.league && <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{player.league}{s.appearances ? ` · ${s.appearances} apps · ${s.minutes || 0} min` : ''}</div>}
        </div>
        {rating > 0 && <RatingRing rating={Math.min(10, Math.round(rating * 10) / 10)} />}
      </div>

      {perfScore > 0 && (
        <div style={{ width: 'min(100%, 920px)', padding: '14px 20px', background: 'var(--sw-surface-0)', borderRadius: 12, border: '1px solid var(--sw-border)', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ fontSize: 11, color: 'var(--sw-muted)', fontWeight: 700, letterSpacing: '0.08em' }}>BETWISE SCORE</div>
          <div style={{ flex: 1, height: 8, background: 'var(--sw-surface-2)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(perfScore, 100)}%`, height: '100%', background: perfScore >= 60 ? '#22c55e' : perfScore >= 40 ? '#f59e0b' : '#ef4444', borderRadius: 4 }} />
          </div>
          <div style={{ fontSize: 16, fontWeight: 900, color: perfScore >= 60 ? '#22c55e' : perfScore >= 40 ? '#f59e0b' : '#ef4444' }}>{perfScore.toFixed(1)}</div>
        </div>
      )}

      {s.goalsPer90 != null && (
        <div style={{ width: 'min(100%, 920px)', padding: '14px 20px', background: 'var(--sw-surface-0)', borderRadius: 12, border: '1px solid var(--sw-border)' }}>
          <div style={{ fontSize: 11, color: 'var(--sw-muted)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 10 }}>PER 90 MINUTES</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {[
              { label: 'Goals', val: s.goalsPer90 },
              { label: 'Assists', val: s.assistsPer90 },
              { label: 'xG', val: s.xgPer90 },
              { label: 'xAG', val: s.xagPer90 },
              { label: 'Shots', val: s.shotsPer90 },
              { label: 'Key Passes', val: s.keyPassesPer90 },
              { label: 'Tackles', val: s.tacklesPer90 },
              { label: 'Int', val: s.interceptionsPer90 },
            ].filter(x => x.val != null).map(({ label, val }) => (
              <div key={label} style={{ padding: '6px 12px', background: 'var(--sw-surface-2)', borderRadius: 8, textAlign: 'center', minWidth: 70 }}>
                <div style={{ fontSize: 15, fontWeight: 900, color: '#f8fafc' }}>{Number(val).toFixed(2)}</div>
                <div style={{ fontSize: 10, color: '#6b7280', fontWeight: 600 }}>{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ width: 'min(100%, 920px)' }}>
        <LastNSection gameHistory={gameHistory} playerName={player.name} playerTeam={teamName} />
      </div>

      <div className="player-profile-season" style={{ width: 'min(100%, 920px)', padding: '20px', background: 'var(--sw-surface-0)', borderRadius: 14, border: '1px solid var(--sw-border)', boxSizing: 'border-box' }}>
        <div style={{ fontSize: 11, color: 'var(--sw-muted)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 16 }}>MATCH STATS</div>
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

// ─── Pitch visualization components ──────────────────────────────────────────

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
        width: compact ? 36 : 52,
        height: compact ? 28 : 36,
        cursor: 'pointer',
        position: 'relative',
        display: 'block',
        overflow: 'visible',
      }}
    >
      <svg
        width={compact ? '24' : '32'}
        height={compact ? '28' : '36'}
        viewBox="0 0 40 46"
        fill="none"
        style={{
          display: 'block',
          margin: '0 auto',
          filter: active ? 'drop-shadow(0 0 4px rgba(209,213,219,0.9))' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.35))',
        }}
      >
        <path d="M13 5 L1 14 L7 18 L7 44 L33 44 L33 18 L39 14 L27 5 C24 9 16 9 13 5Z" fill={active ? '#f97316' : 'var(--sw-surface-0)'} stroke={active ? '#e5e7eb' : 'rgba(255,255,255,0.55)'} strokeWidth="1.3" />
        <path d="M13 5 C16 10 24 10 27 5 C24 2 16 2 13 5Z" fill="rgba(0,0,0,0.18)" />
        <text x="20" y="29" textAnchor="middle" dominantBaseline="middle" fontSize={compact ? (Number(item.number) >= 10 ? '10' : '11') : (Number(item.number) >= 10 ? '11' : '13')} fontWeight="900" fill="#f8fafc">
          {item.number || '-'}
        </text>
      </svg>
      <div style={{
        position: 'absolute',
        top: '100%',
        left: '50%',
        transform: 'translateX(-50%)',
        marginTop: compact ? 1 : 2,
        fontSize: compact ? 8 : 9.5,
        fontWeight: 700,
        lineHeight: 1.1,
        width: compact ? 44 : 64,
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        textAlign: 'center',
        pointerEvents: 'none',
      }}>{last}</div>
    </button>
  )
}

function playerIdentity(item) {
  return `${item.teamId || 't'}-${item.id || 'id'}-${item.number || 'n'}-${item.name || ''}`
}

function PitchLayer({ slots, selectedId, onSelect, compact = false }) {
  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {slots.map(({ item, x, y }) => (
        <div
          key={`${item.teamId}-${item.name}-${item.number || ''}`}
          style={{
            position: 'absolute',
            left: `${x}%`,
            top: `${y}%`,
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'auto',
          }}
        >
          <PlayerNode
            item={item}
            active={selectedId === playerIdentity(item)}
            onClick={() => onSelect(item)}
            compact={compact}
          />
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
    const linked = byId || byName
    const fallback = {
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
        rating: 0,
      },
      isHome,
    }
    return linked
      ? {
          ...fallback,
          ...linked,
          id: linked.id ?? fallback.id,
          teamId: linked.teamId ?? fallback.teamId,
          team: linked.team || fallback.team,
          name: linked.name || fallback.name,
          number: linked.number ?? fallback.number,
          position: linked.position || linked.pos || fallback.position,
          grid: linked.grid || fallback.grid,
          isHome,
        }
      : fallback
  })

  const filteredBySearch = (item) => !search.trim() || item.name.toLowerCase().includes(search.toLowerCase())
  const homePlayers = useMemo(() => mapStart(home, true), [home, allByName])
  const awayPlayers = useMemo(() => mapStart(away, false), [away, allByName])
  const homeSlots = useMemo(() => buildFormationPitchSlots(homePlayers, { formation: home?.formation, side: 'home' }).filter(({ item }) => filteredBySearch(item)), [homePlayers, home?.formation, search])
  const awaySlots = useMemo(() => buildFormationPitchSlots(awayPlayers, { formation: away?.formation, side: 'away' }).filter(({ item }) => filteredBySearch(item)), [awayPlayers, away?.formation, search])

  const selectedIdentity = selected ? playerIdentity(selected) : null

  const onPick = (item) => {
    const found = allByName.get(String(item.id)) || allByName.get(`${item.teamId}-${item.name}`.toLowerCase())
    onSelect(found || item)
  }

  if (!homeSlots.length && !awaySlots.length) return null

  const pitchMinHeight = isCompact ? 244 : 336
  const centerCircle = isCompact ? 60 : 82
  const boxWidth = isCompact ? 24 : 34
  const sixYardWidth = isCompact ? 10 : 13

  return (
      <div className="player-pitch-selector" style={{ padding: isCompact ? '8px' : '14px', background: 'var(--sw-surface-0)', borderRadius: 14, border: '1px solid var(--sw-border)', marginBottom: 16 }}>
      <div style={{ fontSize: 12, color: 'var(--sw-muted)', fontWeight: 800, letterSpacing: '0.08em', marginBottom: 10 }}>FORMATION PITCH</div>
      <div className="player-pitch-wrap" style={{ maxWidth: 560, margin: '0 auto' }}>
      <div className="player-pitch-surface" style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', background: 'linear-gradient(180deg,#256b2e 0%,#2e8c38 25%,#256b2e 50%,#2e8c38 75%,#256b2e 100%)', border: '1px solid rgba(255,255,255,0.35)', aspectRatio: isCompact ? '16 / 11' : '16 / 10', minHeight: pitchMinHeight }}>
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

        <div style={{ position: 'relative', minHeight: pitchMinHeight }}>
          <PitchLayer
            slots={homeSlots}
            selectedId={selectedIdentity}
            onSelect={onPick}
            compact={isCompact}
          />
          <PitchLayer
            slots={awaySlots}
            selectedId={selectedIdentity}
            onSelect={onPick}
            compact={isCompact}
          />
        </div>
      </div>
      </div>
      <div style={{ marginTop: 8, fontSize: 11, color: 'var(--sw-muted)', textAlign: isCompact ? 'center' : 'left' }}>Tap or click a player on the pitch to analyze detailed player statistics.</div>
    </div>
  )
}

// ─── Player list card (for ranked list or sub list) ──────────────────────────

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

// ─── Shared dropdown styles ──────────────────────────────────────────────────

const CHEVRON_SVG = `url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%2394a3b8' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")`

const DROPDOWN_LABEL = {
  position: 'absolute', top: -7, left: 10, fontSize: 9, fontWeight: 700, color: '#64748b',
  background: 'var(--sw-surface-0)', padding: '0 4px', letterSpacing: '0.06em', textTransform: 'uppercase', zIndex: 1,
}

const DROPDOWN_SELECT = {
  width: '100%', padding: '9px 30px 9px 12px', borderRadius: 10, border: '1px solid var(--sw-border)',
  background: 'var(--sw-surface-1)', color: '#e2e8f0', fontSize: 13, fontWeight: 600, appearance: 'none',
  cursor: 'pointer', outline: 'none', backgroundImage: CHEVRON_SVG, backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 12px center',
}

// ─── Stat ranking options ────────────────────────────────────────────────────

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
  const s = player?.stats || player || {}
  if (statKey === 'cards') return Number(s.yellowCards || s.yellow_cards || 0) + Number(s.redCards || s.red_cards || 0)
  if (statKey === 'shotsOnTarget') return Number(s.shotsOnTarget || s.shots_on_target || 0)
  if (statKey === 'foulsCommitted') return Number(s.foulsCommitted || s.fouls_committed || 0)
  if (statKey === 'foulsDrawn') return Number(s.foulsDrawn || s.fouls_drawn || 0)
  if (statKey === 'rating') return Number(s.rating || 0) || (Number(s.performanceScore || s.performance_score || 0) / 10)
  return Number(s?.[statKey] || 0)
}

// ─── Fixture selector dropdown ───────────────────────────────────────────────

function FixtureSelector({ fixtures, selectedId, onSelect, loading }) {
  if (loading) {
    return (
      <div style={{ padding: '14px 16px', background: 'var(--sw-surface-0)', borderRadius: 12, border: '1px solid var(--sw-border)', marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: 'var(--sw-muted)', fontWeight: 700 }}>Loading fixtures...</div>
      </div>
    )
  }

  if (!fixtures?.length) {
    return (
      <div style={{ padding: '14px 16px', background: 'var(--sw-surface-0)', borderRadius: 12, border: '1px solid var(--sw-border)', marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#6b7280' }}>No fixtures available for today.</div>
      </div>
    )
  }

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, color: 'var(--sw-muted)', fontWeight: 700, letterSpacing: '0.08em', marginBottom: 8 }}>SELECT FIXTURE</div>
      <select
        value={selectedId || ''}
        onChange={e => onSelect(e.target.value ? Number(e.target.value) : null)}
        style={{
          width: '100%',
          maxWidth: 520,
          padding: '10px 14px',
          borderRadius: 10,
          border: '1px solid var(--sw-border)',
          background: 'var(--sw-surface-1)',
          color: '#f1f5f9',
          fontSize: 13,
          fontWeight: 600,
          outline: 'none',
          cursor: 'pointer',
          boxSizing: 'border-box',
        }}
      >
        <option value="">-- Choose a match --</option>
        {fixtures.map(f => {
          const homeName = f.homeTeam?.name || f.home || '?'
          const awayName = f.awayTeam?.name || f.away || '?'
          const time = f.time || ''
          const league = f.league?.name || ''
          return (
            <option key={f.id} value={f.id}>
              {homeName} vs {awayName}{time ? ` (${time})` : ''}{league ? ` — ${league}` : ''}
            </option>
          )
        })}
      </select>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

const detailsCache = new Map()

export default function PlayerStatsPage({ players = null, lineups = null, fixtures = null, fixturesLoading = false, title = 'Player Statistics', searchQuery, onSearchChange }) {
  const [internalSearch, setInternalSearch] = useState('')
  const [selected, setSelected] = useState(null)
  const [activeStat, setActiveStat] = useState('goals')
  const [visibleCount, setVisibleCount] = useState(10)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)

  // Fixture-mode from MatchDetails (players array passed directly)
  const isDirectFixtureMode = Array.isArray(players)
  // Global mode with fixture selector (fixtures array from HomePage)
  const isFixtureSelectorMode = !isDirectFixtureMode && Array.isArray(fixtures)

  const [activeTab, setActiveTab] = useState('fixtures') // 'fixtures' | 'topPlayers'
  const [selectedFixtureId, setSelectedFixtureId] = useState(null)
  const [matchData, setMatchData] = useState(null)
  const [matchLoading, setMatchLoading] = useState(false)
  const [matchError, setMatchError] = useState(null)

  // Top players from seed data
  const [topPlayers, setTopPlayers] = useState([])
  const [topPlayersLoading, setTopPlayersLoading] = useState(false)
  const [topLeagueFilter, setTopLeagueFilter] = useState('')

  const isNarrowRankList = viewportWidth <= 480
  const useExternalSearch = typeof searchQuery === 'string' && typeof onSearchChange === 'function'
  const search = useExternalSearch ? searchQuery : internalSearch
  const setSearchValue = useExternalSearch ? onSearchChange : setInternalSearch

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Fetch top players when tab is active (or when search triggers it)
  useEffect(() => {
    if (isDirectFixtureMode) return
    // Fetch when on topPlayers tab, or when search has 2+ chars (we switch tab automatically)
    const isSearching = search.trim().length >= 2
    if (activeTab !== 'topPlayers' && !isSearching) return
    let cancelled = false
    setTopPlayersLoading(true)

    const searchParam = isSearching ? search.trim() : undefined
    fetchTopPlayers({ search: searchParam, sort: activeStat === 'cards' ? 'yellowCards' : activeStat, league: topLeagueFilter, limit: 50 })
      .then(data => {
        if (cancelled) return
        const list = Array.isArray(data) ? data : []
        setTopPlayers(list)
        // Auto-select if search narrows to exactly 1 result
        if (isSearching && list.length === 1) {
          setSelected(list[0])
        }
      })
      .catch(() => {
        if (!cancelled) setTopPlayers([])
      })
      .finally(() => {
        if (!cancelled) setTopPlayersLoading(false)
      })

    return () => { cancelled = true }
  }, [activeTab, activeStat, topLeagueFilter, isDirectFixtureMode, search])

  // Auto-switch to Top Players tab when user types in the search bar
  useEffect(() => {
    if (isDirectFixtureMode || !isFixtureSelectorMode) return
    if (search.trim().length >= 2) {
      setActiveTab('topPlayers')
    }
  }, [search, isDirectFixtureMode, isFixtureSelectorMode])

  // Fetch match details when a fixture is selected in selector mode
  useEffect(() => {
    if (!selectedFixtureId) {
      setMatchData(null)
      return
    }

    const cached = detailsCache.get(selectedFixtureId)
    if (cached) {
      setMatchData(cached)
      return
    }

    let cancelled = false
    setMatchLoading(true)
    setMatchError(null)

    fetchMatchDetails(selectedFixtureId)
      .then(result => {
        if (cancelled) return
        detailsCache.set(selectedFixtureId, result)
        setMatchData(result)
      })
      .catch(err => {
        if (cancelled) return
        console.warn('[PlayerStats] Failed to load match details:', err.message)
        setMatchError(err.message || 'Failed to load match details')
      })
      .finally(() => {
        if (!cancelled) setMatchLoading(false)
      })

    return () => { cancelled = true }
  }, [selectedFixtureId])

  // Reset selected player when fixture changes
  useEffect(() => {
    setSelected(null)
  }, [selectedFixtureId])

  // Derive players and lineups from match data in selector mode
  const selectorPlayers = useMemo(() => {
    if (!matchData) return []
    // Combine fixture players and squad players, preferring fixture players (which have match stats)
    const fixtPlayers = matchData.players || []
    const squadPlayers = matchData.squadPlayers || []
    if (fixtPlayers.length > 0) return fixtPlayers
    return squadPlayers
  }, [matchData])

  const selectorLineups = useMemo(() => {
    return matchData?.lineups || []
  }, [matchData])

  // Which player list and lineups to use
  const activePlayers = isDirectFixtureMode ? players : selectorPlayers
  const activeLineups = isDirectFixtureMode ? lineups : selectorLineups

  const results = useMemo(() => {
    const list = activePlayers || []
    if (!search.trim()) return list
    const q = search.toLowerCase()
    return list.filter(p => (p.name || '').toLowerCase().includes(q) || (p.team || '').toLowerCase().includes(q) || (p.position || '').toLowerCase().includes(q))
  }, [activePlayers, search])

  useEffect(() => {
    if (!selected) return
    // Don't clear selection on the Top Players tab — those players aren't in fixture results
    if (activeTab === 'topPlayers') return
    if (results.find(r => r.id === selected.id)) return
    setSelected(null)
  }, [results, selected, activeTab])

  useEffect(() => {
    setVisibleCount(10)
  }, [activeStat, search])

  // ─── Direct fixture mode (from MatchDetails tab) ────────────────────────
  if (isDirectFixtureMode) {
    return (
      <div className="player-stats-page fixture-mode" style={{ padding: '16px 18px 20px', overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ marginBottom: 10, fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>{title}</div>
        {!useExternalSearch && <div style={{ marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Search fixture player..."
            value={search}
            onChange={e => setSearchValue(e.target.value)}
            style={{ width: '100%', maxWidth: 420, padding: '8px 12px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-1)', color: '#f1f5f9', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
          />
        </div>}

        <FixturePitchSelector lineups={lineups || []} players={results} selected={selected} onSelect={setSelected} search={search} />

        {selected ? (
          <PlayerProfile player={selected} />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#4b5563', padding: '26px 12px' }}>
            <div style={{ width: 'min(100%, 520px)', padding: '18px 20px', borderRadius: 14, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', textAlign: 'center' }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>Select a player to analyze</div>
              <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6, color: '#6b7280' }}>Choose a player from the pitch above to open player statistics, recent form, and prop analysis.</div>
            </div>
          </div>
        )}
      </div>
    )
  }

  // ─── Fixture selector mode (from sidebar / HomePage) ────────────────────
  if (isFixtureSelectorMode) {
    const hasPlayers = selectorPlayers.length > 0

    const TAB_STYLE = (active) => ({
      flex: 1,
      padding: '9px 16px',
      borderRadius: 10,
      border: active ? '1px solid rgba(255,74,31,0.5)' : '1px solid var(--sw-border)',
      background: active ? 'rgba(255,74,31,0.16)' : 'var(--sw-surface-1)',
      color: active ? '#fdba74' : '#9ca3af',
      fontWeight: 700,
      fontSize: 13,
      cursor: 'pointer',
      textAlign: 'center',
    })

    const LEAGUE_OPTIONS = [
      { value: '', label: 'All Leagues' },
      { value: 'Premier League', label: 'Premier League' },
      { value: 'La Liga', label: 'La Liga' },
      { value: 'Bundesliga', label: 'Bundesliga' },
      { value: 'Serie A', label: 'Serie A' },
      { value: 'Ligue 1', label: 'Ligue 1' },
    ]

    return (
      <div className="player-stats-page selector-mode" style={{ padding: '16px 18px 20px', overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ marginBottom: 10, fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>{title}</div>

        {/* Tab toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button type="button" onClick={() => setActiveTab('fixtures')} style={TAB_STYLE(activeTab === 'fixtures')}>Today's Fixtures</button>
          <button type="button" onClick={() => setActiveTab('topPlayers')} style={TAB_STYLE(activeTab === 'topPlayers')}>Top Players</button>
        </div>

        {/* ─── Top Players tab ─── */}
        {activeTab === 'topPlayers' && (() => {
          const activeLabel = STAT_RANK_OPTIONS.find(s => s.key === activeStat)?.label || activeStat
          const ranked = [...topPlayers].sort((a, b) => getRankStatValue(b, activeStat) - getRankStatValue(a, activeStat))

          return (
            <>
              {/* Filter row — 3 uniform dropdowns */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                <div style={{ position: 'relative' }}>
                  <label style={DROPDOWN_LABEL}>League</label>
                  <select value={topLeagueFilter} onChange={e => setTopLeagueFilter(e.target.value)} style={DROPDOWN_SELECT}>
                    {LEAGUE_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                  </select>
                </div>
                <div style={{ position: 'relative' }}>
                  <label style={DROPDOWN_LABEL}>Sort by</label>
                  <select value={activeStat} onChange={e => setActiveStat(e.target.value)} style={DROPDOWN_SELECT}>
                    {STAT_RANK_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
                  </select>
                </div>
                <div style={{ position: 'relative' }}>
                  <label style={DROPDOWN_LABEL}>Player</label>
                  <select
                    value={selected?.id || ''}
                    onChange={e => {
                      const p = ranked.find(x => String(x.id) === e.target.value)
                      setSelected(p || null)
                    }}
                    style={DROPDOWN_SELECT}
                  >
                    <option value="">Select a player...</option>
                    {ranked.map((p, idx) => {
                      const stat = getRankStatValue(p, activeStat)
                      const statStr = Number.isInteger(stat) ? stat : stat.toFixed(1)
                      return <option key={p.id || idx} value={p.id}>#{idx + 1} {p.name} — {statStr} {activeLabel}</option>
                    })}
                  </select>
                </div>
              </div>

              {topPlayersLoading && (
                <div style={{ padding: '30px 12px', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>Loading top players...</div>
                </div>
              )}

              {!topPlayersLoading && topPlayers.length === 0 && (
                <div style={{ padding: '24px 16px', background: 'var(--sw-surface-0)', borderRadius: 12, border: '1px solid var(--sw-border)', textAlign: 'center' }}>
                  <div style={{ fontSize: 13, color: '#6b7280' }}>{search.trim().length >= 2 ? `No players found for "${search.trim()}"` : 'No player data available yet.'}</div>
                </div>
              )}

              {!topPlayersLoading && !selected && topPlayers.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '30px 12px' }}>
                  <div style={{ width: 'min(100%, 520px)', padding: '20px', borderRadius: 14, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>Select a player</div>
                    <div style={{ fontSize: 13, marginTop: 6, color: '#6b7280', lineHeight: 1.5 }}>
                      {search.trim().length >= 2
                        ? <>{ranked.length} player{ranked.length !== 1 ? 's' : ''} found for "<strong style={{ color: '#f8fafc' }}>{search.trim()}</strong>". Pick one from the dropdown above.</>
                        : <>{ranked.length} players ranked by <strong style={{ color: '#f8fafc' }}>{activeLabel}</strong>{topLeagueFilter ? ` in ${topLeagueFilter}` : ''}. Pick one from the dropdown above.</>
                      }
                    </div>
                  </div>
                </div>
              )}

              {selected && <PlayerProfile player={selected} />}
            </>
          )
        })()}

        {/* ─── Fixtures tab ─── */}
        {activeTab === 'fixtures' && (
          <>
            <FixtureSelector
              fixtures={fixtures}
              selectedId={selectedFixtureId}
              onSelect={setSelectedFixtureId}
              loading={fixturesLoading}
            />

            {!selectedFixtureId && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#4b5563', padding: '40px 12px' }}>
                <div style={{ width: 'min(100%, 520px)', padding: '24px 20px', borderRadius: 14, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', textAlign: 'center' }}>
                  <div style={{ fontSize: 28, marginBottom: 12 }}>&#9917;</div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>Player Statistics</div>
                  <div style={{ fontSize: 13, marginTop: 8, lineHeight: 1.6, color: '#6b7280' }}>Select a fixture above to view player stats, formation pitch, and individual prop analysis.</div>
                </div>
              </div>
            )}

            {selectedFixtureId && matchLoading && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 12px' }}>
            <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>Loading player data...</div>
          </div>
        )}

        {selectedFixtureId && matchError && !matchLoading && (
          <div style={{ padding: '20px 16px', background: 'rgba(239,68,68,0.08)', borderRadius: 12, border: '1px solid rgba(239,68,68,0.3)', marginBottom: 16 }}>
            <div style={{ fontSize: 13, color: '#ef4444', fontWeight: 600 }}>Failed to load player data: {matchError}</div>
          </div>
        )}

        {selectedFixtureId && !matchLoading && !matchError && !hasPlayers && (
          <div style={{ padding: '20px 16px', background: 'var(--sw-surface-0)', borderRadius: 12, border: '1px solid var(--sw-border)', textAlign: 'center' }}>
            <div style={{ fontSize: 13, color: '#6b7280' }}>No player data available for this fixture. Player stats are typically available for live or completed matches.</div>
          </div>
        )}

        {selectedFixtureId && !matchLoading && hasPlayers && (() => {
          const fixtureRanked = [...results].sort((a, b) => getRankStatValue(b, activeStat) - getRankStatValue(a, activeStat))
          const activeLabel = STAT_RANK_OPTIONS.find(s => s.key === activeStat)?.label || activeStat

          return (
            <>
              {selectorLineups.length > 0 && (
                <FixturePitchSelector lineups={selectorLineups} players={results} selected={selected} onSelect={setSelected} search={search} />
              )}

              {/* Sort + Player dropdowns */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 16 }}>
                <div style={{ position: 'relative' }}>
                  <label style={DROPDOWN_LABEL}>Sort by</label>
                  <select value={activeStat} onChange={e => setActiveStat(e.target.value)} style={DROPDOWN_SELECT}>
                    {STAT_RANK_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
                  </select>
                </div>
                <div style={{ position: 'relative' }}>
                  <label style={DROPDOWN_LABEL}>Player</label>
                  <select
                    value={selected ? playerIdentity(selected) : ''}
                    onChange={e => {
                      const p = fixtureRanked.find(x => playerIdentity(x) === e.target.value)
                      setSelected(p || null)
                    }}
                    style={DROPDOWN_SELECT}
                  >
                    <option value="">Select a player...</option>
                    {fixtureRanked.map((p, idx) => {
                      const stat = getRankStatValue(p, activeStat)
                      const statStr = Number.isInteger(stat) ? stat : stat.toFixed(1)
                      return <option key={playerIdentity(p)} value={playerIdentity(p)}>#{idx + 1} {p.name} — {statStr} {activeLabel}</option>
                    })}
                  </select>
                </div>
              </div>

              {!selected && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 12px' }}>
                  <div style={{ width: 'min(100%, 520px)', padding: '18px 20px', borderRadius: 14, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', textAlign: 'center' }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>Select a player</div>
                    <div style={{ fontSize: 13, marginTop: 6, color: '#6b7280', lineHeight: 1.5 }}>Choose a player from the dropdown or pitch above to view their statistics.</div>
                  </div>
                </div>
              )}

              {selected && <PlayerProfile player={selected} />}
            </>
          )
        })()}
          </>
        )}
      </div>
    )
  }

  // ─── Fallback: no fixtures, no players (should not normally happen) ──────
  return (
    <div className="player-stats-page" style={{ padding: '16px 18px 20px' }}>
      <div style={{ marginBottom: 10, fontSize: 16, fontWeight: 800, color: '#f1f5f9' }}>{title}</div>
      <div style={{ padding: '24px 16px', background: 'var(--sw-surface-0)', borderRadius: 12, border: '1px solid var(--sw-border)', textAlign: 'center' }}>
        <div style={{ fontSize: 13, color: '#6b7280' }}>No fixture data available. Player statistics will appear when fixtures are loaded.</div>
      </div>
    </div>
  )
}
