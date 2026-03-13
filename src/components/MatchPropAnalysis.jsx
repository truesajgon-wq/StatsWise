import { useEffect, useMemo, useState } from 'react'
import { formatAppDate } from '../utils/dateFormat.js'

const RANGE_OPTIONS = ['L5', 'L10', 'L15', 'H2H']

function formatDate(value, compact) {
  return formatAppDate(value, { compact })
}

function normalizeAltLine(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0.5
  const rounded = Math.round(n * 2) / 2
  const nonInteger = Number.isInteger(rounded) ? rounded + 0.5 : rounded
  return Math.max(0.5, nonInteger)
}

function chartMax(maxScale, altLine) {
  return Math.max(1, Number(maxScale || 0), Number(altLine || 0) + 1)
}

function ratioColors(pct) {
  if (pct >= 70) return { bg: 'rgba(34,197,94,0.14)', border: 'rgba(34,197,94,0.55)', text: '#4ade80' }
  if (pct >= 50) return { bg: 'rgba(148,163,184,0.14)', border: 'rgba(148,163,184,0.55)', text: '#cbd5e1' }
  return { bg: 'rgba(239,68,68,0.14)', border: 'rgba(239,68,68,0.55)', text: '#f87171' }
}

function outcomeColors(value) {
  if (value > 0) return { solid: '#22c55e', grad: 'linear-gradient(180deg,#86efac,#22c55e)', text: '#4ade80' }
  if (value < 0) return { solid: '#ef4444', grad: 'linear-gradient(180deg,#fda4af,#ef4444)', text: '#f87171' }
  return { solid: '#f59e0b', grad: 'linear-gradient(180deg,#fcd34d,#f59e0b)', text: '#fbbf24' }
}

function formatOutcomeScore(row) {
  const home = Number(row?.homeGoals)
  const away = Number(row?.awayGoals)
  if (Number.isFinite(home) && Number.isFinite(away)) return `${home}:${away}`
  const my = Number(row?.myGoals)
  const their = Number(row?.theirGoals)
  if (Number.isFinite(my) && Number.isFinite(their)) {
    return row?.isHome ? `${my}:${their}` : `${their}:${my}`
  }
  return '-'
}

function formatFullTimeResult(row) {
  const home = toNum(row?.homeGoals)
  const away = toNum(row?.awayGoals)
  if (home != null && away != null) return `${home}:${away}`
  const my = toNum(row?.myGoals)
  const their = toNum(row?.theirGoals)
  if (my != null && their != null) {
    return row?.isHome ? `${my}:${their}` : `${their}:${my}`
  }
  return '-'
}

function toNum(value) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function getRangeSummary(range, count) {
  if (range === 'H2H') return count === 1 ? '1 head-to-head match' : `${count} head-to-head matches`
  return count === 1 ? '1 recent match' : `${count} recent matches`
}

function formatFixtureContext(row) {
  return row?.isHome ? 'Home fixture' : 'Away fixture'
}

function orientedPair(row, isHome, myKey, theirKey) {
  const my = toNum(row?.[myKey])
  const their = toNum(row?.[theirKey])
  if (my == null && their == null) return null
  return isHome ? { home: my, away: their } : { home: their, away: my }
}

function buildFixtureStatsRows(row) {
  const isHome = Boolean(row?.isHome)
  const defs = [
    { label: 'Goals', myKey: 'myGoals', theirKey: 'theirGoals' },
    { label: '1st Half Goals', myKey: 'myFirstHalfGoals', theirKey: 'theirFirstHalfGoals' },
    { label: 'Corners', myKey: 'myCorners', theirKey: 'theirCorners' },
    { label: 'Cards', myKey: 'myCards', theirKey: 'theirCards' },
    { label: 'Total Shots', myKey: 'myShotsTotal', theirKey: 'theirShotsTotal' },
    { label: 'Shots on Target', myKey: 'myShotsOnTarget', theirKey: 'theirShotsOnTarget' },
    { label: 'Offsides', myKey: 'myOffsides', theirKey: 'theirOffsides' },
    { label: 'Fouls', myKey: 'myFouls', theirKey: 'theirFouls' },
  ]
  return defs
    .map(def => ({ label: def.label, pair: orientedPair(row, isHome, def.myKey, def.theirKey) }))
    .filter(item => item.pair && (item.pair.home != null || item.pair.away != null))
}

function TeamBadge({ name, logo, align = 'center' }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align, gap: 6, minWidth: 0 }}>
      {logo ? (
        <img src={logo} alt={name || 'Club'} width={50} height={50} style={{ width: 50, height: 50, objectFit: 'contain', display: 'block' }} />
      ) : (
        <div style={{ width: 50, height: 50, borderRadius: '50%', border: '1px solid var(--sw-border)', background: 'var(--sw-surface-1)', color: '#94a3b8', display: 'grid', placeItems: 'center', fontWeight: 800, fontSize: 14 }}>
          {(name || '?').slice(0, 2).toUpperCase()}
        </div>
      )}
      <div style={{ color: '#e2e8f0', fontSize: 14, fontWeight: 800, textAlign: align === 'flex-start' ? 'left' : align === 'flex-end' ? 'right' : 'center', overflowWrap: 'anywhere', lineHeight: 1.3, maxWidth: '100%' }}>
        {name || '-'}
      </div>
    </div>
  )
}

function FixtureDetailsModal({ item, onClose }) {
  if (!item?.row) return null
  const row = item.row
  const isHome = Boolean(row?.isHome)
  const ownTeamName = item?.team?.name || 'Team'
  const ownTeamLogo = item?.team?.logo || null
  const oppName = row?.opponent || 'Opponent'
  const oppLogo = row?.opponentLogo || null

  const homeName = isHome ? ownTeamName : oppName
  const awayName = isHome ? oppName : ownTeamName
  const homeLogo = isHome ? ownTeamLogo : oppLogo
  const awayLogo = isHome ? oppLogo : ownTeamLogo

  const score = formatOutcomeScore(row)
  const outcome = row?.label || 'Draw'
  const outcomeColor = outcomeColors(Number(row?.value || 0)).text
  const statsRows = buildFixtureStatsRows(row)

  let dateLabel = '-'
  let timeLabel = '--:--'
  if (row?.date) {
    const d = new Date(row.date)
    if (!Number.isNaN(d.getTime())) {
      dateLabel = formatAppDate(d)
      timeLabel = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false })
    }
  }

  const leagueLabel = row?.league?.name
    ? `${row?.league?.country ? `${row.league.country} - ` : ''}${row.league.name}`
    : 'League'

  return (
    <div className="fixture-modal-overlay" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 120, background: 'rgba(2,6,23,0.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div className="fixture-modal-shell" onClick={e => e.stopPropagation()} style={{ width: 'min(920px, 100%)', maxHeight: '92vh', overflowY: 'auto', WebkitOverflowScrolling: 'touch', borderRadius: 14, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', boxShadow: '0 20px 60px rgba(2,6,23,0.7)' }}>
        <div className="fixture-modal-topbar" style={{ padding: '10px 14px', borderBottom: '1px solid var(--sw-border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', minWidth: 0, overflowWrap: 'anywhere' }}>{leagueLabel}</div>
          <div className="fixture-modal-actions" style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ minHeight: 44, padding: '0 12px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', color: '#94a3b8', cursor: 'pointer' }}>Close</button>
          </div>
        </div>

        <div className="fixture-modal-body" style={{ padding: 16 }}>
          <div className="fixture-modal-head-grid" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12, marginBottom: 14 }}>
            <TeamBadge name={homeName} logo={homeLogo} align="flex-end" />
            <div className="fixture-modal-score-box" style={{ textAlign: 'center', minWidth: 0 }}>
              <div style={{ fontSize: 28, fontWeight: 900, color: '#f8fafc', fontFamily: 'monospace', lineHeight: 1.05 }}>{score}</div>
              <div style={{ fontSize: 12, fontWeight: 800, color: outcomeColor, marginTop: 2 }}>{outcome}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4, overflowWrap: 'anywhere' }}>{dateLabel} - {timeLabel}</div>
            </div>
            <TeamBadge name={awayName} logo={awayLogo} align="flex-start" />
          </div>

          <div style={{ border: '1px solid var(--sw-border)', borderRadius: 10, overflow: 'hidden' }}>
            <div className="fixture-modal-stats-head" style={{ display: 'grid', gridTemplateColumns: '92px 1fr 92px', gap: 8, padding: '9px 10px', background: 'var(--sw-surface-1)', borderBottom: '1px solid var(--sw-border)' }}>
              <div style={{ color: '#e5e7eb', fontSize: 11, fontWeight: 800, textAlign: 'right' }}>HOME</div>
              <div style={{ color: '#64748b', fontSize: 11, fontWeight: 800, textAlign: 'center', letterSpacing: '0.06em' }}>MATCH STATS</div>
              <div style={{ color: '#c4b5fd', fontSize: 11, fontWeight: 800, textAlign: 'left' }}>AWAY</div>
            </div>
            {statsRows.length ? statsRows.map((itemRow, idx) => (
              <div key={itemRow.label} className="fixture-modal-stats-row" style={{ display: 'grid', gridTemplateColumns: '92px 1fr 92px', gap: 8, padding: '9px 10px', borderBottom: idx === statsRows.length - 1 ? 'none' : '1px solid #172133', background: idx % 2 ? '#0b1424' : 'transparent' }}>
                <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 800, textAlign: 'right' }}>{itemRow.pair.home ?? '-'}</div>
                <div style={{ color: '#94a3b8', fontSize: 12, textAlign: 'center' }}>{itemRow.label}</div>
                <div style={{ color: '#e2e8f0', fontSize: 13, fontWeight: 800, textAlign: 'left' }}>{itemRow.pair.away ?? '-'}</div>
              </div>
            )) : (
              <div style={{ padding: '12px 10px', color: '#64748b', fontSize: 12, textAlign: 'center' }}>No detailed stats stored for this fixture.</div>
            )}
          </div>
        </div>

        <div className="fixture-modal-footer" style={{ padding: '10px 14px', borderTop: '1px solid var(--sw-border)', display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ minHeight: 44, padding: '0 12px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', color: '#cbd5e1', fontWeight: 700, cursor: 'pointer' }}>
            Back to Match Details
          </button>
        </div>
      </div>
    </div>
  )
}

function TeamHeader({ team, title }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      {team?.logo ? (
        <img
          src={team.logo}
          alt={team?.name || 'Team'}
          width={42}
          height={42}
          style={{ width: 42, height: 42, objectFit: 'contain', display: 'block' }}
          loading="lazy"
        />
      ) : (
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: '50%',
            border: '1px solid var(--sw-border)',
            background: 'var(--sw-surface-1)',
            color: '#94a3b8',
            display: 'grid',
            placeItems: 'center',
            fontWeight: 800,
            fontSize: 14,
          }}
        >
          {(team?.name || '?').slice(0, 2).toUpperCase()}
        </div>
      )}
      <div style={{ color: '#cbd5e1', fontSize: 15, fontWeight: 800, textAlign: 'center', lineHeight: 1.3, overflowWrap: 'anywhere' }}>{title}</div>
    </div>
  )
}

function MobileFixtureRow({ row, statLabel, isOutcome, altLine, onSelect }) {
  const over = Number(row?.value || 0) > Number(altLine || 0)
  const valueText = isOutcome ? formatOutcomeScore(row) : (row?.label || '-')
  const fullTimeResult = formatFullTimeResult(row)
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        width: '100%',
        textAlign: 'left',
        border: '1px solid var(--sw-border)',
        background: 'var(--sw-surface-1)',
        borderRadius: 10,
        padding: '10px 11px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        cursor: 'pointer',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'center', gap: 8, width: '100%' }}>
        <span style={{ fontSize: 11, color: '#94a3b8' }}>{formatDate(row?.date)}</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#e2e8f0', textAlign: 'center', lineHeight: 1.35 }}>{row?.fixtureName || '-'}</div>
      <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center' }}>
        FT: <span style={{ color: '#f8fafc', fontWeight: 800 }}>{fullTimeResult}</span>
      </div>
      <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
        {statLabel}: <span style={{ color: '#e2e8f0', fontWeight: 700 }}>{valueText}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 2, width: '100%' }}>
        <span
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: isOutcome ? outcomeColors(Number(row?.value || 0)).text : (over ? '#4ade80' : '#f87171'),
          }}
        >
          {isOutcome ? (row?.label || '-') : `${over ? 'Over' : 'Under'} ${Number(altLine || 0).toFixed(1)}`}
        </span>
      </div>
    </button>
  )
}

function StatDropdown({ statOptions, statKey, onStatChange, mobile, onOpenChange }) {
  const [open, setOpen] = useState(false)
  const selected = useMemo(
    () => statOptions.find(s => s.key === statKey) || statOptions[0] || { label: 'Select stat' },
    [statOptions, statKey]
  )

  useEffect(() => {
    onOpenChange?.(open)
  }, [open, onOpenChange])

  return (
    <div style={{ position: 'relative', width: mobile ? '100%' : 'auto' }}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        style={{
          minHeight: 44,
          borderRadius: 10,
          border: '1px solid var(--sw-border)',
          background: 'var(--sw-surface-1)',
          color: '#e2e8f0',
          fontSize: 13,
          fontWeight: 700,
          padding: '10px 12px',
          minWidth: mobile ? '100%' : 260,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          cursor: 'pointer',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selected.label}</span>
        <span style={{ color: '#94a3b8' }}>{open ? '^' : 'v'}</span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 'auto',
            width: mobile ? '100%' : 360,
            maxWidth: '100%',
            maxHeight: 340,
            borderRadius: 12,
            border: '1px solid var(--sw-border)',
            background: 'var(--sw-surface-0)',
            boxShadow: '0 20px 50px rgba(2,6,23,0.75)',
            overflow: 'hidden',
            zIndex: 220,
          }}
        >
          <div style={{ overflowY: 'auto', maxHeight: 320 }}>
            {statOptions.map(item => (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  onStatChange?.(item.key)
                  setOpen(false)
                }}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  minHeight: 42,
                  padding: '0 12px',
                  border: 'none',
                  borderBottom: '1px solid #10192a',
                  background: item.key === statKey ? 'rgba(249,115,22,0.12)' : 'transparent',
                  color: item.key === statKey ? '#e5e7eb' : '#d1d5db',
                  cursor: 'pointer',
                  fontSize: 13,
                  fontWeight: item.key === statKey ? 700 : 500,
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ChartPanel({
  team,
  title,
  dataset,
  statLabel,
  isOutcome,
  altLine,
  maxScale,
  upcomingLabel,
  isMobile,
  onSelectRow,
  singlePanel = false,
  rangeLabel = 'L10',
  viewportWidth = 1024,
}) {
  const [hovered, setHovered] = useState(null)
  const rows = useMemo(() => [...(dataset || [])], [dataset])
  const tableRows = useMemo(() => [...rows].reverse(), [rows])
  const scale = chartMax(maxScale, altLine)
  const altPct = Math.min(95, (Number(altLine || 0) / scale) * 100)
  const isCompactMobile = isMobile && viewportWidth <= 480
  const isTinyMobile = isMobile && viewportWidth <= 360

  const summary = useMemo(() => {
    if (isOutcome) {
      const wins = rows.filter(r => Number(r.value || 0) > 0).length
      const draws = rows.filter(r => Number(r.value || 0) === 0).length
      const losses = rows.filter(r => Number(r.value || 0) < 0).length
      const winPct = rows.length ? Math.round((wins / rows.length) * 100) : 0
      return {
        badgePct: `${winPct}%`,
        badgeRaw: `W${wins} D${draws} L${losses}`,
        colors: ratioColors(winPct),
      }
    }
    const hits = rows.reduce((acc, row) => acc + (Number(row.value || 0) > Number(altLine || 0) ? 1 : 0), 0)
    const pct = rows.length ? Math.round((hits / rows.length) * 100) : 0
    return {
      badgePct: `${pct}%`,
      badgeRaw: `${hits}/${rows.length || 0}`,
      colors: ratioColors(pct),
    }
  }, [rows, altLine, isOutcome])

  const compactBars = rows.length > (isCompactMobile ? 8 : 10)
  const veryCompactBars = rows.length > (isCompactMobile ? 12 : 14)
  const chartGap = isTinyMobile ? 2 : veryCompactBars ? 3 : compactBars ? 4 : isCompactMobile ? 5 : 8
  const isSingleDesktop = Boolean(singlePanel && !isMobile)
  const plotHeight = isTinyMobile ? 118 : isCompactMobile ? 132 : isMobile ? 148 : 176
  const labelHeight = isMobile ? 0 : 24
  const barItemGap = labelHeight > 0 ? (compactBars ? 4 : 6) : 0
  const chartContentHeight = plotHeight + labelHeight + barItemGap
  const lineBottomPx = Math.max(0, labelHeight + barItemGap + (altPct / 100) * plotHeight - 1)
  const averageValue = useMemo(() => {
    if (!rows.length) return null
    if (isOutcome) {
      const wins = rows.filter(r => Number(r.value || 0) > 0).length
      return `${Math.round((wins / rows.length) * 100)}% wins`
    }
    const total = rows.reduce((acc, row) => acc + Number(row.value || 0), 0)
    return (total / rows.length).toFixed(1)
  }, [rows, isOutcome])
  const chartContent = (
    <div
      className="match-prop-chart-scroll"
      style={{
        overflowX: 'hidden',
        overflowY: 'hidden',
        paddingBottom: 6,
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: '100%',
          minWidth: 0,
          display: 'grid',
          gap: chartGap,
          alignItems: 'stretch',
          height: chartContentHeight,
          gridTemplateColumns: rows.length ? `repeat(${rows.length}, minmax(0, 1fr))` : '1fr',
          padding: isMobile ? '6px 4px 4px' : '8px 0 6px',
          borderBottom: '1px solid rgba(148,163,184,0.2)',
          borderLeft: '1px solid rgba(148,163,184,0.15)',
          borderRight: '1px solid rgba(148,163,184,0.15)',
          borderRadius: 8,
          overflow: 'hidden',
          background: 'linear-gradient(180deg, rgba(51,65,85,0.08), rgba(15,23,42,0.1))',
        }}
      >
        {!isOutcome && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: `${lineBottomPx}px`,
              borderTop: '3px dashed rgba(245,158,11,0.9)',
              boxShadow: '0 0 8px rgba(245,158,11,0.45)',
              zIndex: 3,
              pointerEvents: 'none',
            }}
          />
        )}
        {rows.map((row, idx) => {
          const over = Number(row.value || 0) > Number(altLine || 0)
          const rawValue = Number(row.value || 0)
          const outcomeColor = outcomeColors(rawValue)
          const pct = isOutcome
            ? (rawValue > 0 ? 88 : rawValue < 0 ? 58 : 74)
            : Math.max(0, (rawValue / scale) * 100)
          return (
            <button
              key={`${row.fixtureId || 'f'}-${idx}`}
              type="button"
              onMouseEnter={e => {
                setHovered({ row, x: e.currentTarget.offsetLeft + (e.currentTarget.clientWidth / 2), y: e.currentTarget.offsetTop + 8 })
              }}
              onMouseMove={e => {
                setHovered({ row, x: e.currentTarget.offsetLeft + (e.currentTarget.clientWidth / 2), y: e.currentTarget.offsetTop + 8 })
              }}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelectRow?.({ row, team, title })}
              style={{
                border: 'none',
                background: 'transparent',
                padding: 0,
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'flex-end',
                gap: barItemGap,
                minHeight: chartContentHeight,
                minWidth: 0,
              }}
            >
              <div style={{ height: plotHeight, width: '100%', display: 'flex', alignItems: 'flex-end', minHeight: 0, overflow: 'hidden' }}>
                <div
                  style={{
                    width: '100%',
                    height: `${pct}%`,
                    borderRadius: isTinyMobile ? 4 : 7,
                    boxSizing: 'border-box',
                    background: isOutcome
                      ? outcomeColor.grad
                      : over
                        ? 'linear-gradient(180deg,#86efac,#34d399)'
                        : 'linear-gradient(180deg,#fda4af,#f87171)',
                    border: '1px solid rgba(255,255,255,0.05)',
                    minHeight: isTinyMobile ? 6 : 4,
                    opacity: 0.93,
                    transition: 'all .2s ease',
                  }}
                />
              </div>
              <div style={{ height: labelHeight, fontSize: compactBars ? 10 : 11, color: '#94a3b8', textAlign: 'center', lineHeight: 1.2 }}>
                {!isMobile ? (row.date ? formatDate(row.date).slice(0, compactBars ? 5 : 6) : 'Next') : ''}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
  const tableContent = isMobile ? (
    <div style={{ display: 'grid', gap: 8 }}>
      {tableRows.map((row, idx) => (
        <MobileFixtureRow
          key={`${row.fixtureId || idx}-mobile`}
          row={row}
          statLabel={statLabel}
          isOutcome={isOutcome}
          altLine={altLine}
          onSelect={() => onSelectRow?.({ row, team, title })}
        />
      ))}
    </div>
  ) : (
    <div style={{ overflowX: 'auto' }}>
      <table className="match-prop-table" style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, minWidth: isMobile ? '100%' : 540 }}>
        <thead>
          <tr style={{ color: '#64748b', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            <th className="mpt-col-date" style={{ textAlign: 'left', padding: '8px 8px' }}>Date</th>
            <th className="mpt-col-ft" style={{ textAlign: 'left', padding: '8px 8px' }}>Full Time Result</th>
            <th className="mpt-col-fixture" style={{ textAlign: 'left', padding: '8px 8px' }}>Fixture</th>
            <th className="mpt-col-stat" style={{ textAlign: 'left', padding: '8px 8px' }}>Stat</th>
            <th className="mpt-col-value" style={{ textAlign: 'center', padding: '8px 8px' }}>Value</th>
            <th className="mpt-col-ou" style={{ textAlign: 'center', padding: '8px 8px' }}>{isOutcome ? 'Outcome' : (isMobile ? 'O/U' : 'Over/Under')}</th>
          </tr>
        </thead>
        <tbody>
          {tableRows.map((row, idx) => {
            const over = Number(row.value || 0) > Number(altLine || 0)
            return (
              <tr
                key={`${row.fixtureId || idx}-row`}
                onClick={() => onSelectRow?.({ row, team, title })}
                style={{
                  borderTop: '1px solid var(--sw-border)',
                  cursor: 'pointer',
                  background: 'transparent',
                }}
              >
                <td className="mpt-col-date" style={{ padding: '10px 8px', color: '#cbd5e1', fontSize: 12 }}>{formatDate(row.date, isMobile)}</td>
                <td className="mpt-col-ft" style={{ padding: '10px 8px', color: '#e2e8f0', fontSize: 12, fontWeight: 700 }}>{formatFullTimeResult(row)}</td>
                <td className="mpt-col-fixture" style={{ padding: '10px 8px', color: '#dbe7f8', fontSize: 12, fontWeight: 700 }}>
                  <div style={{ display: 'grid', gap: 3 }}>
                    <span style={{ whiteSpace: 'normal', lineHeight: 1.35 }}>{row.fixtureName || '-'}</span>
                    <span style={{ color: '#64748b', fontSize: 10, fontWeight: 600 }}>
                      {formatFixtureContext(row)} · FT {formatFullTimeResult(row)}
                    </span>
                  </div>
                </td>
                <td className="mpt-col-stat" style={{ padding: '10px 8px', color: '#93a8c4', fontSize: 12 }}>{statLabel}</td>
                <td className="mpt-col-value" style={{ padding: '10px 8px', color: '#e2e8f0', fontSize: 12, textAlign: 'center' }}>{isOutcome ? formatOutcomeScore(row) : (row.label || '-')}</td>
                <td className="mpt-col-ou" style={{ padding: '10px 8px', fontSize: 12, textAlign: 'center' }}>
                  {isOutcome ? (
                    <span style={{ color: outcomeColors(Number(row.value || 0)).text, fontWeight: 700 }}>{row.label || '-'}</span>
                  ) : (
                    <span style={{ color: over ? '#4ade80' : '#f87171', fontWeight: 700 }}>
                      {over ? 'Over' : 'Under'} {Number(altLine || 0).toFixed(1)}
                    </span>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )

  return (
    <div style={{ background: 'var(--sw-surface-0)', border: '1px solid var(--sw-border)', borderRadius: 14, padding: isTinyMobile ? 8 : isCompactMobile ? 10 : 12, width: '100%', minWidth: 0, overflow: 'hidden' }}>
      <TeamHeader team={team} title={title} />

      {!isOutcome && (
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'center' }}>
          <div style={{ fontSize: 11, color: '#fbbf24', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 20, padding: '4px 9px', background: 'rgba(245,158,11,0.12)', textAlign: 'center' }}>
            Alt line {Number(altLine || 0).toFixed(1)}
          </div>
        </div>
      )}

      <div style={{ position: 'relative', marginBottom: 10, paddingTop: isMobile ? 0 : 44 }}>
        <div
          className="match-prop-summary-badges"
          style={{
            position: isMobile ? 'static' : 'absolute',
            top: 6,
            right: 6,
            zIndex: 8,
            display: 'flex',
            gap: 6,
            flexWrap: isMobile ? 'wrap' : 'nowrap',
            justifyContent: isMobile ? 'center' : 'flex-end',
            maxWidth: isMobile ? '100%' : 'none',
            marginBottom: isMobile ? 10 : 0,
          }}
        >
          {!isOutcome && (
            <div
              style={{
                minHeight: 28,
                padding: '0 9px',
                borderRadius: 9,
                border: `1px solid ${summary.colors.border}`,
                background: summary.colors.bg,
                color: summary.colors.text,
                fontSize: 12,
                fontWeight: 800,
                display: 'grid',
                placeItems: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {summary.badgePct}
            </div>
          )}
          <div
            style={{
              minHeight: 28,
              padding: '0 9px',
              borderRadius: 9,
              border: '1px solid var(--sw-border)',
              background: 'var(--sw-surface-1)',
              color: '#cbd5e1',
              fontSize: 12,
              fontWeight: 800,
              display: 'grid',
              placeItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            {summary.badgeRaw}
          </div>
        </div>

        {chartContent}

        <div
          style={{
            marginTop: 12,
            display: 'grid',
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))',
            gap: 8,
          }}
        >
          <div style={{ border: '1px solid var(--sw-border)', borderRadius: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{rangeLabel}</div>
            <div style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 800, marginTop: 4 }}>{getRangeSummary(rangeLabel, rows.length)}</div>
          </div>
          <div style={{ border: '1px solid var(--sw-border)', borderRadius: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{isOutcome ? 'Win trend' : 'Average value'}</div>
            <div style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 800, marginTop: 4 }}>
              {averageValue == null ? '-' : (isOutcome ? averageValue : `${averageValue} ${statLabel.toLowerCase()}`)}
            </div>
          </div>
          <div style={{ border: '1px solid var(--sw-border)', borderRadius: 10, padding: '10px 12px', background: 'rgba(255,255,255,0.02)' }}>
            <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Upcoming fixture</div>
            <div style={{ color: '#e5e7eb', fontSize: 13, fontWeight: 800, marginTop: 4 }}>{upcomingLabel || 'Upcoming'}</div>
          </div>
        </div>

        {!isMobile && hovered?.row && (
          <div
            style={{
              position: 'absolute',
              left: Math.max(6, hovered.x - 112),
              top: Math.max(54, hovered.y - 66),
              zIndex: 12,
              width: 224,
              border: '1px solid var(--sw-border)',
              borderRadius: 10,
              background: 'rgba(9,14,24,0.97)',
              color: '#e2e8f0',
              padding: '8px 9px',
              fontSize: 12,
              pointerEvents: 'none',
              boxShadow: '0 12px 30px rgba(2,6,23,0.6)',
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 2, lineHeight: 1.35 }}>{hovered.row.fixtureName || hovered.row.opponent || '-'}</div>
            <div style={{ color: '#94a3b8', marginBottom: 2 }}>{formatDate(hovered.row.date)}</div>
            <div style={{ color: '#64748b', marginBottom: 4 }}>{formatFixtureContext(hovered.row)}</div>
            <div style={{ color: '#cbd5e1' }}>
              {statLabel}: <span style={{ color: '#f8fafc', fontWeight: 700 }}>{hovered.row.label}</span>
            </div>
            {isOutcome ? (
              <div style={{ color: outcomeColors(Number(hovered.row.value || 0)).text }}>Result trend: {hovered.row.label}</div>
            ) : (
              <div style={{ color: Number(hovered.row.value || 0) > Number(altLine || 0) ? '#4ade80' : '#f87171' }}>
                {Number(hovered.row.value || 0) > Number(altLine || 0) ? 'Over' : 'Under'} {Number(altLine || 0).toFixed(1)}
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`.match-prop-chart-scroll::-webkit-scrollbar{display:none}`}</style>

      {tableContent}
      <style>{`
        @media (max-width: 900px) {
          .match-prop-table { table-layout: fixed; min-width: 100% !important; }
          .match-prop-table th, .match-prop-table td { font-size: 11px !important; padding: 8px 6px !important; }
          .match-prop-table .mpt-col-stat, .match-prop-table .mpt-col-ft { display: none; }
          .match-prop-table .mpt-col-date { width: 20%; }
          .match-prop-table td.mpt-col-date, .match-prop-table th.mpt-col-date { white-space: nowrap; }
          .match-prop-table .mpt-col-fixture { width: 50%; white-space: normal; overflow: visible; text-overflow: initial; vertical-align: top; }
          .match-prop-table .mpt-col-value { width: 10%; text-align: center; }
          .match-prop-table th.mpt-col-value,
          .match-prop-table td.mpt-col-value {
            text-align: center !important;
            padding-left: 0 !important;
            padding-right: 0 !important;
          }
          .match-prop-table .mpt-col-ou { width: 20%; white-space: nowrap; text-align: center; }
        }
      `}</style>
    </div>
  )
}

export default function MatchPropAnalysis({
  title = 'Match Prop Analysis',
  statOptions = [],
  statKey,
  onStatChange,
  range = 'L10',
  onRangeChange,
  altLine = 0.5,
  onAltChange,
  hitRate = 0,
  leftTeam,
  rightTeam,
  leftTitle = 'Home Team Prop Analysis',
  rightTitle = 'Away Team Prop Analysis',
  leftDataset = [],
  rightDataset = [],
  singlePanel = false,
  maxScale = 1,
  upcomingLabel = 'Upcoming',
  mobileControlsMode = 'fixed',
}) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 900)
  const [isDockMobile, setIsDockMobile] = useState(() => window.innerWidth <= 768)
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [selectedFixture, setSelectedFixture] = useState(null)
  const [statDropdownOpen, setStatDropdownOpen] = useState(false)

  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth)
      setIsMobile(window.innerWidth <= 900)
      setIsDockMobile(window.innerWidth <= 768)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const selectedStat = useMemo(
    () => statOptions.find(s => s.key === statKey) || statOptions[0] || { label: 'Stat' },
    [statOptions, statKey]
  )
  const isOutcomeStat = Boolean(selectedStat?.isOutcome)
  const singlePanelMobile = Boolean(singlePanel && isMobile)
  const useStickyMobileControls = Boolean(isMobile && (singlePanelMobile || mobileControlsMode === 'sticky'))
  const useInlineMobileControls = Boolean(isMobile && mobileControlsMode === 'inline')
  const useFixedMobileControls = Boolean(isMobile && !useStickyMobileControls && !useInlineMobileControls)
  const duplicateInlinePerTeam = Boolean(useInlineMobileControls && !singlePanel)

  const stepAlt = (delta) => {
    const next = normalizeAltLine(Number(altLine || 0.5) + delta)
    onAltChange?.(next)
  }

  const renderInlineControlsStack = (keyPrefix) => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 2 }}>
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, flexWrap: 'wrap', width: 'min(100%, 980px)' }}>
          <div style={{ width: '100%' }}>
            <StatDropdown statOptions={statOptions} statKey={statKey} onStatChange={onStatChange} mobile onOpenChange={setStatDropdownOpen} />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
            {RANGE_OPTIONS.map(item => {
              const active = range === item
              return (
                <button
                  key={`${keyPrefix}-${item}`}
                  type="button"
                  onClick={() => onRangeChange?.(item)}
                  style={{
                    minHeight: 44,
                    minWidth: 58,
                    padding: '0 14px',
                    borderRadius: 999,
                    border: '1px solid var(--sw-border)',
                    background: active ? 'linear-gradient(180deg, rgba(251,191,36,0.22), rgba(245,158,11,0.18))' : 'transparent',
                    color: active ? '#fcd34d' : '#94a3b8',
                    fontSize: 13,
                    fontWeight: active ? 800 : 700,
                    cursor: 'pointer',
                    transition: 'all .25s ease',
                    boxShadow: active ? '0 0 12px rgba(245,158,11,0.25)' : 'none',
                  }}
                >
                  {item}
                </button>
              )
            })}
          </div>
        </div>
      </div>
      <div
        style={{
          border: '1px solid #22314b',
          borderRadius: 12,
          background: 'rgba(9,14,24,0.98)',
          padding: '8px 10px',
        }}
      >
        <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Selected stat</div>
        <div style={{ color: '#dbe5f5', fontSize: 12, fontWeight: 700, marginTop: 2, marginBottom: 8 }}>{selectedStat.label}</div>
        <div
          className="match-prop-inline-alt-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '44px 72px 44px',
            justifyContent: 'center',
            alignItems: 'center',
            gap: 8,
            width: 'fit-content',
            maxWidth: '100%',
            margin: '0 auto',
          }}
        >
          <button
            type="button"
            onClick={() => stepAlt(-1)}
            disabled={isOutcomeStat}
            style={{
              width: 44,
              minWidth: 44,
              maxWidth: 44,
              height: 44,
              minHeight: 44,
              maxHeight: 44,
              borderRadius: 10,
              border: '1px solid var(--sw-border)',
              background: 'var(--sw-surface-0)',
              color: '#e2e8f0',
              fontSize: 20,
              cursor: isOutcomeStat ? 'not-allowed' : 'pointer',
              opacity: isOutcomeStat ? 0.45 : 1,
              padding: 0,
              justifySelf: 'center',
              boxSizing: 'border-box',
            }}
          >
            -
          </button>
          <div
            style={{
              width: 72,
              minWidth: 72,
              maxWidth: 72,
              height: 44,
              minHeight: 44,
              maxHeight: 44,
              borderRadius: 10,
              border: '1px solid rgba(245,158,11,0.45)',
              background: 'rgba(245,158,11,0.11)',
              color: '#fbbf24',
              fontWeight: 900,
              fontSize: 18,
              display: 'grid',
              placeItems: 'center',
              justifySelf: 'center',
              boxSizing: 'border-box',
            }}
          >
            {isOutcomeStat ? '-' : Number(altLine || 0).toFixed(1)}
          </div>
          <button
            type="button"
            onClick={() => stepAlt(1)}
            disabled={isOutcomeStat}
            style={{
              width: 44,
              minWidth: 44,
              maxWidth: 44,
              height: 44,
              minHeight: 44,
              maxHeight: 44,
              borderRadius: 10,
              border: '1px solid var(--sw-border)',
              background: 'var(--sw-surface-0)',
              color: '#e2e8f0',
              fontSize: 20,
              cursor: isOutcomeStat ? 'not-allowed' : 'pointer',
              opacity: isOutcomeStat ? 0.45 : 1,
              padding: 0,
              justifySelf: 'center',
              boxSizing: 'border-box',
            }}
          >
            +
          </button>
        </div>
      </div>
    </div>
  )

  return (
    <section className={`match-prop-analysis${useFixedMobileControls ? ' mobile-controls-fixed' : ''}`} style={{ padding: (useStickyMobileControls || useInlineMobileControls) ? (isMobile ? '8px 0 12px' : '10px 0 12px') : (isDockMobile ? '10px 6px calc(104px + env(safe-area-inset-bottom, 0px))' : isMobile ? '10px 6px 20px' : '14px 12px 80px') }}>
      <div style={{ textAlign: 'center', marginBottom: 10 }}>
        <h2 style={{ margin: 0, color: '#f1f5f9', fontSize: isMobile ? 18 : 26, fontWeight: 900, lineHeight: 1.15 }}>{title}</h2>
      </div>

      {!duplicateInlinePerTeam && <div className="match-prop-top-controls" style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: isMobile ? 8 : 10, flexWrap: 'wrap', width: 'min(100%, 980px)' }}>
          <div style={{ width: isMobile ? '100%' : 'auto' }}>
            <StatDropdown statOptions={statOptions} statKey={statKey} onStatChange={onStatChange} mobile={isMobile} onOpenChange={setStatDropdownOpen} />
          </div>
          <div className="match-prop-range-row" style={{ display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap' }}>
            {RANGE_OPTIONS.map(item => {
              const active = range === item
              return (
                <button
                  className="match-prop-range-pill"
                  key={item}
                  type="button"
                  onClick={() => onRangeChange?.(item)}
                  style={{
                    minHeight: 44,
                    minWidth: isMobile ? 56 : 60,
                    padding: isMobile ? '0 12px' : '0 14px',
                    borderRadius: 999,
                    border: '1px solid var(--sw-border)',
                    background: active ? 'linear-gradient(180deg, rgba(251,191,36,0.22), rgba(245,158,11,0.18))' : 'transparent',
                    color: active ? '#fcd34d' : '#94a3b8',
                    fontSize: isMobile ? 12 : 13,
                    fontWeight: active ? 800 : 700,
                    cursor: 'pointer',
                    transition: 'all .25s ease',
                    boxShadow: active ? '0 0 12px rgba(245,158,11,0.25)' : 'none',
                  }}
                >
                  {item}
                </button>
              )
            })}
          </div>
          {!isMobile && !isOutcomeStat && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button type="button" onClick={() => stepAlt(-1)} style={{ minWidth: 44, minHeight: 44, borderRadius: 10, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', color: '#e2e8f0', cursor: 'pointer', fontSize: 20 }}>-</button>
              <div style={{ minWidth: 70, minHeight: 44, borderRadius: 10, border: '1px solid rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.11)', color: '#fbbf24', fontSize: 15, fontWeight: 900, display: 'grid', placeItems: 'center' }}>
                {Number(altLine || 0).toFixed(1)}
              </div>
              <button type="button" onClick={() => stepAlt(1)} style={{ minWidth: 44, minHeight: 44, borderRadius: 10, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', color: '#e2e8f0', cursor: 'pointer', fontSize: 20 }}>+</button>
            </div>
          )}
        </div>
      </div>}

      {useInlineMobileControls && !duplicateInlinePerTeam && renderInlineControlsStack('single')}

      {isMobile && !useInlineMobileControls && !statDropdownOpen && (
        <div
          className="match-prop-mobile-controls"
          style={{
            position: useStickyMobileControls ? 'sticky' : 'fixed',
            top: 'auto',
            left: useStickyMobileControls ? 'auto' : 0,
            right: useStickyMobileControls ? 'auto' : 0,
            bottom: 0,
            zIndex: 70,
            background: 'rgba(9,14,24,0.98)',
            border: '1px solid #22314b',
            borderRadius: '12px 12px 0 0',
            boxShadow: '0 -8px 24px rgba(2,6,23,0.45)',
            backdropFilter: 'blur(8px)',
            padding: '8px 10px calc(8px + env(safe-area-inset-bottom, 0px))',
            marginBottom: useStickyMobileControls ? 6 : 0,
            marginTop: useStickyMobileControls ? 8 : 0,
          }}
        >
          <div className="match-prop-mobile-controls-grid" style={{ display: 'grid', gridTemplateColumns: '1fr auto auto auto', alignItems: 'center', gap: 8 }}>
            <div className="mp-mobile-stat" style={{ minWidth: 0 }}>
              <div style={{ color: '#64748b', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em' }}>Selected stat</div>
              <div style={{ color: '#dbe5f5', fontSize: 12, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedStat.label}</div>
            </div>
            <button
              className="mp-mobile-minus"
              type="button"
              onClick={() => stepAlt(-1)}
              disabled={isOutcomeStat}
              style={{ minWidth: 44, minHeight: 44, borderRadius: 10, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', color: '#e2e8f0', fontSize: 20, cursor: isOutcomeStat ? 'not-allowed' : 'pointer', opacity: isOutcomeStat ? 0.45 : 1 }}
            >
              -
            </button>
            <div className="mp-mobile-value" style={{ minWidth: 56, minHeight: 44, borderRadius: 10, border: '1px solid rgba(245,158,11,0.45)', background: 'rgba(245,158,11,0.11)', color: '#fbbf24', fontWeight: 900, fontSize: 14, display: 'grid', placeItems: 'center' }}>
              {isOutcomeStat ? '-' : Number(altLine || 0).toFixed(1)}
            </div>
            <button
              className="mp-mobile-plus"
              type="button"
              onClick={() => stepAlt(1)}
              disabled={isOutcomeStat}
              style={{ minWidth: 44, minHeight: 44, borderRadius: 10, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-0)', color: '#e2e8f0', fontSize: 20, cursor: isOutcomeStat ? 'not-allowed' : 'pointer', opacity: isOutcomeStat ? 0.45 : 1 }}
            >
              +
            </button>
          </div>
        </div>
      )}

      <div className="match-prop-panels-grid" style={{ display: 'grid', gridTemplateColumns: isMobile || singlePanel ? '1fr' : '1fr 1fr', gap: isMobile ? 10 : 12, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {duplicateInlinePerTeam && renderInlineControlsStack('left')}
          <ChartPanel
            team={leftTeam}
            title={leftTitle}
            dataset={leftDataset}
            statLabel={selectedStat.label}
            isOutcome={isOutcomeStat}
            altLine={altLine}
            maxScale={maxScale}
            upcomingLabel={upcomingLabel}
            isMobile={isMobile}
            onSelectRow={(payload) => setSelectedFixture(payload)}
            singlePanel={singlePanel}
            rangeLabel={range}
            viewportWidth={viewportWidth}
          />
        </div>
        {!singlePanel && (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {duplicateInlinePerTeam && renderInlineControlsStack('right')}
            <ChartPanel
              team={rightTeam}
              title={rightTitle}
              dataset={rightDataset}
              statLabel={selectedStat.label}
              isOutcome={isOutcomeStat}
              altLine={altLine}
              maxScale={maxScale}
            upcomingLabel={upcomingLabel}
            isMobile={isMobile}
            onSelectRow={(payload) => setSelectedFixture(payload)}
            rangeLabel={range}
            viewportWidth={viewportWidth}
          />
          </div>
        )}
      </div>

      {selectedFixture && <FixtureDetailsModal item={selectedFixture} onClose={() => setSelectedFixture(null)} />}
    </section>
  )
}


