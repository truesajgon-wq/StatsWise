import { useEffect, useState } from 'react'

function TeamBadge({ team, size = 30 }) {
  const [imgFailed, setImgFailed] = useState(false)
  const name = team?.name || '?'
  const color = team?.color || '#f97316'
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
  const logo = team?.logo

  if (!logo || imgFailed) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: `${color}28`,
          border: `2px solid ${color}60`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: Math.round(size * 0.34),
          fontWeight: 900,
          color,
          flexShrink: 0,
          letterSpacing: -0.5,
          userSelect: 'none',
        }}
      >
        {initials}
      </div>
    )
  }

  return (
    <img
      src={logo}
      alt={name}
      width={size}
      height={size}
      style={{ objectFit: 'contain', flexShrink: 0, display: 'block' }}
      onError={() => setImgFailed(true)}
    />
  )
}

function nameStyle(isMobile, align) {
  return {
    fontSize: isMobile ? 12 : 13,
    fontWeight: isMobile ? 700 : 600,
    color: '#e5e7eb',
    textAlign: isMobile ? 'center' : align,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.15,
    display: 'block',
    maxWidth: '100%',
  }
}

export default function FixtureRow({ fixture, onClick, even, isFavorite = false, onToggleFavorite }) {
  const { homeTeam, awayTeam, homeGoals, awayGoals, time, status } = fixture
  const isLive = fixture.isLive || status === 'LIVE'
  const isFT = status === 'FT'
  const showScore = isLive || isFT
  const statusLabel = isLive ? `${fixture.elapsed || ''}'` : isFT ? 'FT' : (time || '--:--')
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const isMobile = viewportWidth <= 768
  const isCompactPhone = viewportWidth <= 390
  const rowColumns = isCompactPhone
    ? '44px minmax(0,1fr) 30px 44px'
    : isMobile
      ? '52px minmax(0,1fr) 34px 44px'
      : '56px minmax(0,1fr) 34px 44px'

  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <div
      className="fixture-row"
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick?.(e)
        }
      }}
      style={{
        width: '100%',
        display: 'grid',
        gridTemplateColumns: rowColumns,
        alignItems: 'center',
        gap: isCompactPhone ? 6 : isMobile ? 8 : 10,
        padding: isCompactPhone ? '10px 8px' : isMobile ? '10px 10px' : '10px 12px',
        background: 'var(--sw-surface-0)',
        border: '1px solid var(--sw-border)',
        borderLeft: isLive ? '3px solid #f97316' : '1px solid var(--sw-border)',
        borderRadius: 10,
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'background 0.12s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = 'var(--sw-surface-1)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = 'var(--sw-surface-0)'
      }}
    >
      <div className="fixture-row-time" style={{ width: isCompactPhone ? 44 : isMobile ? 52 : 56, flexShrink: 0, textAlign: 'center', justifySelf: 'center' }}>
        {isLive ? (
          <div style={{ fontSize: isCompactPhone ? 12 : isMobile ? 13 : 14, fontWeight: 900, color: '#f97316', fontFamily: 'monospace' }}>{statusLabel}</div>
        ) : (
          <span style={{ fontSize: isCompactPhone ? 12 : isMobile ? 13 : 14, fontWeight: 800, color: isFT ? '#22c55e' : '#94a3b8', fontFamily: 'monospace' }}>
            {statusLabel}
          </span>
        )}
      </div>

      <div style={{ minWidth: 0, display: 'grid', gridTemplateRows: '1fr 1fr', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <TeamBadge team={homeTeam} size={isMobile ? 16 : 18} />
          <span style={{ ...nameStyle(isMobile, 'left'), textAlign: 'left', fontSize: isCompactPhone ? 11.5 : isMobile ? 12 : 13 }}>{homeTeam.name}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <TeamBadge team={awayTeam} size={isMobile ? 16 : 18} />
          <span style={{ ...nameStyle(isMobile, 'left'), textAlign: 'left', fontSize: isCompactPhone ? 11.5 : isMobile ? 12 : 13 }}>{awayTeam.name}</span>
        </div>
      </div>

      <div className="fixture-row-score" style={{ textAlign: 'center', minWidth: isCompactPhone ? 30 : isMobile ? 34 : 34 }}>
        {showScore ? (
          <div style={{ display: 'grid', gridTemplateRows: '1fr 1fr', gap: 8 }}>
            <span style={{ fontSize: isCompactPhone ? 16 : isMobile ? 18 : 20, fontWeight: 900, color: '#f8fafc', lineHeight: 1 }}>{homeGoals ?? '-'}</span>
            <span style={{ fontSize: isCompactPhone ? 16 : isMobile ? 18 : 20, fontWeight: 900, color: '#f8fafc', lineHeight: 1 }}>{awayGoals ?? '-'}</span>
          </div>
        ) : (
          <span style={{ fontSize: 14, fontWeight: 700, color: '#4b5563' }}>-</span>
        )}
      </div>

      <button
        className="fixture-row-favorite"
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onToggleFavorite?.(fixture)
        }}
        aria-label={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
        style={{
          width: 44,
          minWidth: 44,
          maxWidth: 44,
          height: 44,
          minHeight: 44,
          maxHeight: 44,
          borderRadius: 9999,
          border: '1px solid var(--sw-border)',
          background: 'transparent',
          color: isFavorite ? '#f59e0b' : '#64748b',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          fontSize: 16,
          lineHeight: 1,
          padding: 0,
          appearance: 'none',
          WebkitAppearance: 'none',
        }}
      >
        {isFavorite ? '\u2605' : '\u2606'}
      </button>
    </div>
  )
}
