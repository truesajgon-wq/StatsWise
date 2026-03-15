import { useEffect, useState } from 'react'

function TeamLogo({ team, size = 22 }) {
  const [imgFailed, setImgFailed] = useState(false)
  const name = team?.name || '?'
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const logo = team?.logo

  if (!logo || imgFailed) {
    return (
      <div style={{
        width: size, height: size, borderRadius: 3,
        background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.25)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: Math.round(size * 0.38), fontWeight: 800, color: '#f97316',
        flexShrink: 0, letterSpacing: -0.5, userSelect: 'none',
      }}>
        {initials}
      </div>
    )
  }

  return (
    <img src={logo} alt={name} width={size} height={size}
      style={{ objectFit: 'contain', flexShrink: 0, display: 'block' }}
      onError={() => setImgFailed(true)}
    />
  )
}

/* Pulsing live dot */
function LiveDot() {
  return (
    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: '#22c55e', flexShrink: 0, boxShadow: '0 0 0 0 rgba(34,197,94,0.4)', animation: 'livePulse 1.6s ease-in-out infinite' }} />
  )
}

export default function FixtureRow({ fixture, onClick, even, isFavorite = false, onToggleFavorite }) {
  const { homeTeam, awayTeam, homeGoals, awayGoals, time, status } = fixture
  const isLive = fixture.isLive || status === 'LIVE'
  const isFT = status === 'FT'
  const showScore = isLive || isFT
  const statusLabel = isLive ? `${fixture.elapsed || ''}'` : isFT ? 'FT' : (time || '--:--')

  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const isMobile = viewportWidth <= 768
  const isCompact = viewportWidth <= 440

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  /* ── Column layout: [status] [home →] [score] [← away] [star] ── */
  const statusW = isCompact ? 40 : 52
  const scoreW = isCompact ? 48 : 56
  const starW = 36
  const gridCols = `${statusW}px 1fr ${scoreW}px 1fr ${starW}px`

  const teamNameStyle = {
    fontSize: isCompact ? 11 : isMobile ? 12 : 13,
    fontWeight: 600,
    color: '#dae3ef',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.2,
  }

  return (
    <div
      className="fixture-row"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(e) } }}
      style={{
        width: '100%',
        display: 'grid',
        gridTemplateColumns: gridCols,
        alignItems: 'center',
        gap: isCompact ? 4 : 8,
        padding: isCompact ? '9px 8px' : isMobile ? '10px 10px' : '10px 12px',
        background: isLive ? 'rgba(249,115,22,0.04)' : 'transparent',
        borderBottom: 'var(--row-separator)',
        borderLeft: isLive ? '2px solid #f97316' : '2px solid transparent',
        cursor: 'pointer',
        transition: 'background 0.14s ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
      onMouseLeave={e => { e.currentTarget.style.background = isLive ? 'rgba(249,115,22,0.04)' : 'transparent' }}
    >

      {/* Status / Time column */}
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        {isLive ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
            <LiveDot />
            <span style={{ fontSize: isCompact ? 10 : 11, fontWeight: 800, color: '#22c55e', fontFamily: 'monospace', lineHeight: 1 }}>{statusLabel}</span>
          </div>
        ) : (
          <span style={{ fontSize: isCompact ? 10.5 : 11.5, fontWeight: isFT ? 700 : 600, color: isFT ? '#22c55e' : '#8fa3bc', fontFamily: 'monospace' }}>
            {statusLabel}
          </span>
        )}
      </div>

      {/* Home team — right-aligned (logo right of name) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: isCompact ? 5 : 7, minWidth: 0, overflow: 'hidden' }}>
        <span style={{ ...teamNameStyle, textAlign: 'right' }}>{homeTeam.name}</span>
        <TeamLogo team={homeTeam} size={isCompact ? 18 : isMobile ? 20 : 22} />
      </div>

      {/* Score */}
      <div style={{ textAlign: 'center', flexShrink: 0 }}>
        {showScore ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
            <span style={{ fontSize: isCompact ? 14 : isMobile ? 15 : 16, fontWeight: 800, color: '#f0f4f8', minWidth: isCompact ? 14 : 16, textAlign: 'right', lineHeight: 1 }}>{homeGoals ?? '-'}</span>
            <span style={{ fontSize: isCompact ? 11 : 12, color: '#4d6080', fontWeight: 700, lineHeight: 1 }}>:</span>
            <span style={{ fontSize: isCompact ? 14 : isMobile ? 15 : 16, fontWeight: 800, color: '#f0f4f8', minWidth: isCompact ? 14 : 16, textAlign: 'left', lineHeight: 1 }}>{awayGoals ?? '-'}</span>
          </div>
        ) : (
          <span style={{ fontSize: 11, fontWeight: 600, color: '#3d526e' }}>vs</span>
        )}
      </div>

      {/* Away team — left-aligned (logo left of name) */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: isCompact ? 5 : 7, minWidth: 0, overflow: 'hidden' }}>
        <TeamLogo team={awayTeam} size={isCompact ? 18 : isMobile ? 20 : 22} />
        <span style={{ ...teamNameStyle, textAlign: 'left' }}>{awayTeam.name}</span>
      </div>

      {/* Favourite star */}
      <button
        className="fixture-row-favorite"
        type="button"
        onClick={e => { e.stopPropagation(); onToggleFavorite?.(fixture) }}
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        style={{
          width: starW, height: 36, borderRadius: 6,
          border: '1px solid transparent',
          background: 'transparent',
          color: isFavorite ? '#f59e0b' : '#3d526e',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0,
          transition: 'color 0.15s ease, border-color 0.15s ease',
        }}
        onMouseEnter={e => { if (!isFavorite) e.currentTarget.style.color = '#94a3b8' }}
        onMouseLeave={e => { if (!isFavorite) e.currentTarget.style.color = '#3d526e' }}
      >
        {isFavorite ? '★' : '☆'}
      </button>
    </div>
  )
}
