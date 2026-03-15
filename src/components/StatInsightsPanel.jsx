import { useEffect, useState } from 'react'
import { useLang } from '../context/LangContext.jsx'
import { extractStatValue, getStatDef, getHistorySummarySnapshot, hasStatValue } from '../data/statsConfig.js'

const MIN_RATE = 0.6

function normalizeHalfAlt(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return 0.5
  const rounded = Math.round(n * 2) / 2
  const halfAligned = Number.isInteger(rounded) ? rounded + 0.5 : rounded
  return Math.max(0.5, halfAligned)
}

function calcHits(history, statKey, alt, isHome) {
  if (!history?.length) return { hits: 0, total: 0, rate: 0 }
  const last10 = history
    .filter(match => hasStatValue(match, statKey, isHome))
    .slice(0, 10)
  if (!last10.length) {
    const summary = getHistorySummarySnapshot(history, statKey, alt, isHome)
    if (summary) {
      return {
        hits: summary.hits ?? Math.round((summary.total || 0) * summary.rate),
        total: summary.total || 0,
        rate: summary.rate || 0,
      }
    }
    return { hits: 0, total: 0, rate: 0 }
  }
  const def = getStatDef(statKey)
  const hits = last10.filter(m => {
    const v = extractStatValue(m, statKey, isHome)
    return def?.binary ? v === 1 : v > (alt ?? 0)
  }).length
  return { hits, total: last10.length, rate: hits / last10.length }
}

function rateColor(rate) {
  if (rate >= 0.8) return { bg: 'rgba(34,197,94,0.15)', border: 'rgba(34,197,94,0.35)', text: '#22c55e' }
  if (rate >= 0.6) return { bg: 'rgba(234,179,8,0.15)', border: 'rgba(234,179,8,0.35)', text: '#eab308' }
  return { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', text: '#ef4444' }
}

function PctBadge({ rate, hits, total }) {
  const c = rateColor(rate)
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, background: c.bg, border: `1px solid ${c.border}`, color: c.text, fontWeight: 700, fontSize: 12, whiteSpace: 'nowrap' }}>
      {hits}/{total} / {Math.round(rate * 100)}%
    </span>
  )
}

export default function StatInsightsPanel({ fixtures, statKey, onFixtureClick }) {
  const { t } = useLang()
  const def = getStatDef(statKey) || {}
  const [alt, setAlt] = useState(normalizeHalfAlt(def.defaultAlt ?? 2.5))
  const isBinary = def.binary

  useEffect(() => {
    if (isBinary) return
    setAlt(normalizeHalfAlt(def.defaultAlt ?? 2.5))
  }, [statKey, isBinary, def.defaultAlt])

  if (!fixtures || fixtures.length === 0) {
    return (
      <div style={{ textAlign: 'center', color: '#4b5563', padding: '60px 20px' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>+</div>
        <p style={{ fontSize: 15 }}>No matches to analyse today</p>
      </div>
    )
  }

  const scored = fixtures
    .map(f => {
      const home = calcHits(f.homeHistory, statKey, alt, true)
      const away = calcHits(f.awayHistory, statKey, alt, false)
      const combinedRate = (home.rate + away.rate) / 2
      return { fixture: f, home, away, combinedRate }
    })
    .filter(r => r.combinedRate >= MIN_RATE)
    .sort((a, b) => b.combinedRate - a.combinedRate)

  const statLabel = def.label || t(def.labelKey) || statKey

  return (
    <div className="stat-insights-panel">
      {/* Header + ALT adjuster */}
      <div style={{ marginBottom: 16 }}>
        <div className="stat-insights-head" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 4 }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
              {def.icon} {statLabel}
            </h2>
            <p style={{ fontSize: 12, color: '#6b7280', margin: '4px 0 0' }}>
              At least {Math.round(MIN_RATE * 100)}% hit rate in last 10 games
              {!isBinary && ` / Over ${alt.toFixed(1)}`}
            </p>
          </div>

          {!isBinary && (
            <div className="stat-insights-alt-controls" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: 12, color: '#6b7280', fontWeight: 600 }}>ALT Line</span>
              <div style={{ display: 'flex', alignItems: 'center', background: 'var(--sw-surface-1)', border: '1px solid var(--sw-muted)', borderRadius: 8, overflow: 'hidden' }}>
                <button onClick={() => setAlt(v => normalizeHalfAlt(v - 1))} style={{ width: 44, height: 44, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, fontWeight: 700 }}>-</button>
                <span style={{ minWidth: 52, textAlign: 'center', fontSize: 15, fontWeight: 900, color: '#f59e0b', borderLeft: '1px solid var(--sw-border)', borderRight: '1px solid var(--sw-border)', lineHeight: '44px' }}>{alt.toFixed(1)}</span>
                <button onClick={() => setAlt(v => normalizeHalfAlt(v + 1))} style={{ width: 44, height: 44, background: 'none', border: 'none', color: '#9ca3af', cursor: 'pointer', fontSize: 18, fontWeight: 700 }}>+</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Legend */}
      <div className="stat-insights-legend" style={{ display: 'flex', gap: 16, marginBottom: 16, padding: '10px 14px', background: 'var(--sw-surface-2)', borderRadius: 8, border: '1px solid var(--sw-border)', flexWrap: 'wrap' }}>
        {[{ label: '80-100%', color: '#22c55e' }, { label: '60-79%', color: '#eab308' }].map(l => (
          <span key={l.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9ca3af' }}>
            <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color, display: 'inline-block' }} />
            {l.label}
          </span>
        ))}
        <span style={{ fontSize: 12, color: '#4b5563', marginLeft: 'auto' }}>{scored.length} / {fixtures.length} matches</span>
      </div>

      {scored.length === 0 ? (
        <div style={{ textAlign: 'center', color: '#4b5563', padding: '60px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>!</div>
          <p style={{ fontSize: 15 }}>No matches meet the 60% threshold</p>
          <p style={{ fontSize: 13, marginTop: 6, color: 'var(--sw-muted)' }}>
            {!isBinary ? `Try adjusting the ALT line from ${alt.toFixed(1)}` : 'No matches meet the 60% threshold for this stat'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {scored.map(({ fixture: f, home, away, combinedRate }, idx) => {
            const topColor = rateColor(combinedRate)
            return (
              <button
                key={f.id}
                onClick={() => onFixtureClick(f)}
                style={{ width: '100%', background: 'var(--sw-surface-2)', border: `1px solid ${idx === 0 ? topColor.border : 'var(--sw-border)'}`, borderRadius: 10, padding: '14px 16px', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s' }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249,115,22,0.07)'; e.currentTarget.style.borderColor = '#f97316' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--sw-surface-2)'; e.currentTarget.style.borderColor = idx === 0 ? topColor.border : 'var(--sw-border)' }}
              >
                <div className="stat-insights-card-head" style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                  <span style={{ fontSize: 11, color: '#4b5563', fontWeight: 700, minWidth: 20 }}>#{idx + 1}</span>
                  <span style={{ fontSize: 11, color: '#6b7280', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {f.league?.country} / {f.league?.name}
                  </span>
                  <span style={{ padding: '3px 10px', borderRadius: 20, background: topColor.bg, border: `1px solid ${topColor.border}`, color: topColor.text, fontWeight: 900, fontSize: 13, whiteSpace: 'nowrap' }}>
                    {Math.round(combinedRate * 100)}%
                  </span>
                </div>

                <div className="stat-insights-vs-grid" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ textAlign: 'right' }}>
                    {f.homeTeam?.logo && <img src={f.homeTeam.logo} alt="" style={{ width: 24, height: 24, objectFit: 'contain', display: 'inline-block', marginBottom: 4 }} />}
                    <div className="stat-insights-team-name" style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{f.homeTeam?.name}</div>
                  </div>
                  <div style={{ textAlign: 'center', color: 'var(--sw-muted)', fontWeight: 900, fontSize: 16 }}>vs</div>
                  <div>
                    {f.awayTeam?.logo && <img src={f.awayTeam.logo} alt="" style={{ width: 24, height: 24, objectFit: 'contain', display: 'inline-block', marginBottom: 4 }} />}
                    <div className="stat-insights-team-name" style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9' }}>{f.awayTeam?.name}</div>
                  </div>
                </div>

                <div className="stat-insights-team-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {[{ label: `Home: ${f.homeTeam?.name}`, data: home }, { label: `Away: ${f.awayTeam?.name}`, data: away }].map(({ label, data }) => (
                    <div key={label} style={{ padding: '8px 10px', background: 'var(--sw-surface-1)', borderRadius: 6, border: '1px solid var(--sw-border)' }}>
                      <div style={{ fontSize: 10, color: '#6b7280', marginBottom: 4, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <PctBadge rate={data.rate} hits={data.hits} total={data.total} />
                        <div style={{ flex: 1, height: 4, background: 'var(--sw-border)', borderRadius: 2, overflow: 'hidden' }}>
                          <div style={{ width: `${data.rate * 100}%`, height: '100%', background: rateColor(data.rate).text, borderRadius: 2 }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ marginTop: 10, fontSize: 11, color: '#4b5563', textAlign: 'right' }}>
                  {f.status === 'FT' ? 'Finished' : `Kick-off ${f.time}`}
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}


