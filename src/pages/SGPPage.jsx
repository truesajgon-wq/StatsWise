import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { analyzeSGP } from '../data/sgpEngine.js'
import { useLang } from '../context/LangContext.jsx'
import { getAppToday } from '../utils/appDate.js'

const GROUP_META = {
  goals:       { label: 'Goals',   color: '#22c55e' },
  corners:     { label: 'Corners', color: '#f97316' },
  cards:       { label: 'Cards',   color: '#f59e0b' },
  fouls:       { label: 'Fouls',   color: '#ef4444' },
  shots:       { label: 'Shots',   color: '#a78bfa' },
  discipline:  { label: 'Cards/Fouls', color: '#f59e0b' }, // backward compat
}

const STYLE_META = {
  'high-tempo': { icon: '⚡', label: 'High Tempo', color: '#f97316' },
  physical:     { icon: '💪', label: 'Physical',   color: '#ef4444' },
  'wide-play':  { icon: '🚩', label: 'Wide Play',  color: '#38bdf8' },
  balanced:     { icon: '⚖️', label: 'Balanced',   color: '#94a3b8' },
}

function strengthColor(pct) {
  if (pct >= 50) return '#22c55e'
  if (pct >= 35) return '#f59e0b'
  return '#6b7280'
}

function TeamBadge({ team, size = 20 }) {
  const name = team?.name || '?'
  if (team?.logo) {
    return <img src={team.logo} alt={name} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
  }
  return (
    <div style={{ width: size, height: size, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.42, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
      {name[0]?.toUpperCase() || '?'}
    </div>
  )
}

function GroupBadge({ group }) {
  const meta = GROUP_META[group] || { label: group, color: '#94a3b8' }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 7px', borderRadius: 999, background: `${meta.color}18`, border: `1px solid ${meta.color}30`, color: meta.color, fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
      {meta.label}
    </span>
  )
}

function ProbBar({ prob }) {
  const pct = Math.round(prob * 100)
  const color = pct >= 70 ? '#22c55e' : pct >= 55 ? '#f59e0b' : '#6b7280'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, width: 80 }}>
      <div style={{ flex: 1, height: 3, borderRadius: 999, background: 'rgba(255,255,255,0.07)', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 999 }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 800, color, fontFamily: 'monospace', minWidth: 32, textAlign: 'right' }}>{pct}%</span>
    </div>
  )
}

function LegRow({ leg }) {
  const hitInfo = leg.rawHits != null && leg.rawTotal != null ? `${leg.rawHits}/${leg.rawTotal}` : null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(255,255,255,0.035)' }}>
      <div style={{ width: 5, height: 5, borderRadius: '50%', background: GROUP_META[leg.statGroup]?.color ?? '#94a3b8', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#e2e8f0' }}>
          {leg.teamName ? <span style={{ color: '#94a3b8', fontWeight: 500 }}>{leg.teamName} — </span> : null}
          {leg.label}
        </span>
        <span style={{ fontSize: 12, color: '#4b5563', marginLeft: 6 }}>{leg.threshold}</span>
        {hitInfo && <span style={{ fontSize: 10, color: '#374151', marginLeft: 8 }}>{hitInfo} games</span>}
      </div>
      <ProbBar prob={leg.probability} />
      <GroupBadge group={leg.statGroup} />
    </div>
  )
}

function SGPCard({ sgp, rank, onNavigate }) {
  const sc = strengthColor(Math.round(sgp.combinedProbability * 100))
  const styleMeta = STYLE_META[sgp.styleTag] || STYLE_META.balanced
  const f = sgp.fixture
  const pct = Math.round(sgp.combinedProbability * 100)

  return (
    <div style={{ background: 'var(--sw-surface-1)', border: `1px solid rgba(255,255,255,0.07)`, borderRadius: 14, overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
        <span style={{ fontSize: 11, fontWeight: 900, color: '#374151', fontFamily: 'monospace', flexShrink: 0, minWidth: 22 }}>#{rank}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontSize: 10, color: '#4b5563' }}>{sgp.legCount} legs</span>
            <span style={{ fontSize: 10, color: styleMeta.color, background: `${styleMeta.color}12`, border: `1px solid ${styleMeta.color}22`, borderRadius: 4, padding: '1px 6px' }}>{styleMeta.icon} {styleMeta.label}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TeamBadge team={f.homeTeam} size={20} />
            <span style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{f.homeTeam?.name}</span>
            <span style={{ fontSize: 11, color: '#374151' }}>vs</span>
            <span style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{f.awayTeam?.name}</span>
            <TeamBadge team={f.awayTeam} size={20} />
          </div>
          {(f.league?.name || f.time) && (
            <div style={{ fontSize: 11, color: '#374151', marginTop: 2 }}>
              {f.league?.name}{f.league?.name && f.time ? ' · ' : ''}{f.time}
            </div>
          )}
        </div>
        {/* SGP probability indicator */}
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 900, fontFamily: 'monospace', color: sc, lineHeight: 1 }}>{pct}%</div>
          <div style={{ fontSize: 9, color: '#374151', letterSpacing: '0.06em' }}>SGP</div>
        </div>
      </div>

      {/* Legs */}
      <div style={{ padding: '2px 14px 8px' }}>
        <div style={{ fontSize: 9, color: '#374151', fontWeight: 700, letterSpacing: '0.08em', padding: '7px 0 3px' }}>LEGS — last 10 games</div>
        {sgp.legs.map((leg, i) => <LegRow key={`${leg.statKey}:${leg.isHome ?? 'match'}:${i}`} leg={leg} />)}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '6px 14px 10px', borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        <button
          onClick={() => onNavigate(f.id)}
          style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid rgba(56,189,248,0.28)', background: 'rgba(56,189,248,0.07)', color: '#38bdf8', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
        >
          Open Match Details
        </button>
      </div>
    </div>
  )
}

export default function SGPPage({ fixtures = [], loading, searchQuery, onSearchChange }) {
  const { t } = useLang()
  const navigate = useNavigate()
  const [internalSearch, setInternalSearch] = useState('')

  const useExternalSearch = typeof searchQuery === 'string' && typeof onSearchChange === 'function'
  const search = useExternalSearch ? searchQuery : internalSearch
  const setSearchValue = useExternalSearch ? onSearchChange : setInternalSearch

  const sgpResults = useMemo(() => (!fixtures.length ? [] : analyzeSGP(fixtures, getAppToday())), [fixtures])

  const visibleResults = useMemo(() => {
    if (!search.trim()) return sgpResults
    const q = search.toLowerCase()
    return sgpResults.filter(r =>
      r.fixture?.homeTeam?.name?.toLowerCase().includes(q) ||
      r.fixture?.awayTeam?.name?.toLowerCase().includes(q) ||
      r.fixture?.league?.name?.toLowerCase().includes(q),
    )
  }, [sgpResults, search])

  const tr = (key, fallback) => { const v = t(key); return v === key ? fallback : v }

  return (
    <div style={{ padding: '20px' }}>
      {/* Header */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 22 }}>🔗</span>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#f1f5f9' }}>{tr('sgp_title', 'Same Game Parlay')}</h2>
          {sgpResults.length > 0 && (
            <span style={{ fontSize: 11, color: '#4b5563', marginLeft: 4 }}>{sgpResults.length} fixture{sgpResults.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: '#6b7280' }}>{tr('sgp_subtitle', 'Best multi-leg combinations backed by historical data')} · highest probability first</p>

        {!useExternalSearch && (
          <input
            type="text"
            value={search}
            onChange={e => setSearchValue(e.target.value)}
            placeholder="Search team / league..."
            style={{ width: '100%', maxWidth: 380, minHeight: 36, padding: '7px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.10)', background: 'var(--sw-surface-1)', color: '#f1f5f9', fontSize: 12, outline: 'none', boxSizing: 'border-box' }}
          />
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[1, 2, 3].map(i => (
            <div key={i} style={{ height: 180, borderRadius: 14, background: 'var(--sw-surface-1)', border: '1px solid var(--sw-border)', opacity: 0.5 }} />
          ))}
        </div>
      )}

      {/* Empty */}
      {!loading && visibleResults.length === 0 && (
        <div style={{ textAlign: 'center', padding: '60px 20px' }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🔗</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#6b7280', marginBottom: 6 }}>
            {search ? 'No matches found' : tr('sgp_none', 'No SGP signals for today')}
          </div>
          <div style={{ fontSize: 12, color: '#374151' }}>
            {tr('sgp_none_sub', 'Not enough historical data to build confident parlays.')}
          </div>
        </div>
      )}

      {/* List — sorted highest to lowest SGP probability */}
      {!loading && visibleResults.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {visibleResults.map((sgp, idx) => (
            <SGPCard
              key={sgp.fixture?.id ?? idx}
              sgp={sgp}
              rank={idx + 1}
              onNavigate={id => navigate(`/match/${id}`)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
