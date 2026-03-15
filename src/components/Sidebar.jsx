import { useEffect, useState, useMemo } from 'react'
import { TOP_LEAGUE_IDS } from '../data/api.js'
import { useLang } from '../context/LangContext.jsx'
import { STATS_ORDER, STAT_GROUPS, statViewKey } from '../data/statsConfig.js'
import { getValuePickConfidenceBadgeStyle } from '../utils/confidenceBadge.js'
import CountryFlag from './CountryFlag.jsx'

const PRIORITY_COUNTRY_ORDER = ['England', 'Spain', 'Italy', 'Germany', 'France', 'Poland', 'Portugal']
const PRIORITY_LEAGUE_ORDER = [2, 3, 39, 78, 140, 61, 135, 106, 94] // UCL, UEL, then top domestic leagues

function priorityCountryIndex(country) {
  const idx = PRIORITY_COUNTRY_ORDER.indexOf(String(country || '').trim())
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
}

function priorityLeagueIndex(leagueId) {
  const idx = PRIORITY_LEAGUE_ORDER.indexOf(Number(leagueId))
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
}

function priorityLeagueByName(leagueName = '', country = '') {
  const name = String(leagueName || '').toLowerCase()
  const c = String(country || '').toLowerCase()
  if (c === 'world' && name.includes('champions league')) return 0
  if (c === 'world' && name.includes('europa league')) return 1
  return Number.MAX_SAFE_INTEGER
}

function LeagueLogo({ src, alt, size = 16 }) {
  if (!src) return null
  return <img src={src} alt={alt} style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none' }} />
}

function LeagueTree({ leaguesByCountry, activeLeague, onLeagueSelect }) {
  const [openCountries, setOpenCountries] = useState({})
  const entries = Object.entries(leaguesByCountry)
  if (entries.length === 0) return <div style={{ padding: '12px 16px', fontSize: 12, color: '#4b5563', textAlign: 'center' }}>-</div>

  return (
    <div>
      {entries.map(([country, { flag, countryCode, leagues }]) => {
        const isOpen = openCountries[country]
        const hasActive = leagues.some(l => l.id === activeLeague)
        return (
          <div key={country}>
            <button
              onClick={() => setOpenCountries(p => ({ ...p, [country]: !p[country] }))}
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px 9px 14px', background: hasActive ? 'rgba(249,115,22,0.07)' : 'transparent', border: 'none', borderBottom: '1px solid var(--sw-border)', color: hasActive ? '#e5e7eb' : '#9ca3af', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: hasActive ? 700 : 500 }}
            >
              <CountryFlag flag={flag} country={country} countryCode={countryCode} alt={country} size={14} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{country}</span>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', color: '#4b5563' }}><path d="M3 1.5L6.5 5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>

            {isOpen && leagues.map(league => {
              const isActive = activeLeague === league.id
              return (
                <button
                  key={league.id}
                  onClick={() => onLeagueSelect(league.id)}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '7px 10px 7px 28px', background: isActive ? 'rgba(249,115,22,0.12)' : 'rgba(0,0,0,0.18)', border: 'none', borderLeft: isActive ? '3px solid #f97316' : '3px solid transparent', borderBottom: '1px solid var(--sw-surface-1)', color: isActive ? '#d1d5db' : '#6b7280', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontWeight: isActive ? 700 : 400 }}
                >
                  <LeagueLogo src={league.logo} alt={league.name} size={15} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{league.name}</span>
                  {league.top && <span style={{ fontSize: 9, color: '#eab308', border: '1px solid rgba(234,179,8,0.3)', borderRadius: 3, padding: '0px 4px', flexShrink: 0 }}>TOP</span>}
                </button>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

const STATIC_NAV = [
  { key: 'mecze', icon: '\u{1F4C5}', labelKey: 'nav_mecze', labelFallback: 'Schedule' },
  { key: 'ligi', icon: '\u{1F3C6}', labelKey: 'nav_ligi', labelFallback: 'Leagues' },
  { key: 'lamaki', icon: '\u{21A9}\u{FE0F}', labelKey: 'nav_lamaki', labelFallback: 'Comeback Bets', accentColor: '#a78bfa', accentBg: 'rgba(167,139,250,0.1)', premium: true },
  { key: 'correct_score', icon: '\u{1F3AF}', labelKey: 'nav_correct_score', labelFallback: 'Correct Score', accentColor: '#22c55e', accentBg: 'rgba(34,197,94,0.1)', premium: true },
  { key: 'sgp', icon: '\u{1F517}', labelKey: 'nav_sgp', labelFallback: 'Same Game Parlay', accentColor: '#38bdf8', accentBg: 'rgba(56,189,248,0.1)', premium: true },
  { key: 'player_stats', icon: '\u{1F465}', labelKey: 'nav_player_stats', labelFallback: 'Player Statistics', accentColor: '#d1d5db', accentBg: 'rgba(209,213,219,0.1)' },
]

export default function Sidebar({ activeView, onViewChange, activeLeague, onLeagueSelect, fixtures = [], mobileOpen = false, onRequestClose, mobileInsights = null }) {
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768)
  const [insightsTab, setInsightsTab] = useState('tips')
  const [leaguesExpanded, setLeaguesExpanded] = useState(() => activeView === 'ligi')
  const { t } = useLang()
  const statAnalysisLabel = 'STATISTICAL ANALYSIS'

  useEffect(() => {
    const media = window.matchMedia('(max-width: 768px)')
    const apply = () => setIsMobile(media.matches)
    apply()
    if (media.addEventListener) {
      media.addEventListener('change', apply)
      return () => media.removeEventListener('change', apply)
    }
    media.addListener(apply)
    return () => media.removeListener(apply)
  }, [])

  useEffect(() => {
    if (!isMobile || !mobileOpen) return
    const nextTab = mobileInsights?.initialTab
    if (nextTab === 'tips' || nextTab === 'news') {
      setInsightsTab(nextTab)
    }
  }, [isMobile, mobileOpen, mobileInsights?.initialTab])

  const leaguesByCountry = useMemo(() => {
    const map = {}
    fixtures.forEach(f => {
      const league = f?.league
      if (!league?.id) return
      const { id, name, country, flag, countryCode, logo } = league
      const top = TOP_LEAGUE_IDS.has(id)
      const safeCountry = country || 'Unknown'
      if (!map[safeCountry]) map[safeCountry] = { flag, countryCode, leagues: [] }
      if (!map[safeCountry].leagues.find(l => l.id === id)) map[safeCountry].leagues.push({ id, name: name || `League ${id}`, flag, countryCode, logo, top })
    })
    Object.values(map).forEach(({ leagues }) => leagues.sort((a, b) => {
      const ap = priorityLeagueIndex(a.id)
      const bp = priorityLeagueIndex(b.id)
      if (ap !== bp) return ap - bp
      const an = priorityLeagueByName(a.name, a.country)
      const bn = priorityLeagueByName(b.name, b.country)
      if (an !== bn) return an - bn
      if (a.top && !b.top) return -1
      if (!a.top && b.top) return 1
      return a.name.localeCompare(b.name)
    }))
    const sorted = Object.entries(map).sort(([countryA, a], [countryB, b]) => {
      const aHasPriorityLeague = a.leagues.some(l => priorityLeagueIndex(l.id) !== Number.MAX_SAFE_INTEGER)
      const bHasPriorityLeague = b.leagues.some(l => priorityLeagueIndex(l.id) !== Number.MAX_SAFE_INTEGER)
      if (aHasPriorityLeague !== bHasPriorityLeague) return aHasPriorityLeague ? -1 : 1
      const aNamePriority = Math.min(...a.leagues.map(l => priorityLeagueByName(l.name, l.country)))
      const bNamePriority = Math.min(...b.leagues.map(l => priorityLeagueByName(l.name, l.country)))
      if (aNamePriority !== bNamePriority) return aNamePriority - bNamePriority
      const ca = priorityCountryIndex(countryA)
      const cb = priorityCountryIndex(countryB)
      if (ca !== cb) return ca - cb
      const aHasTop = a.leagues.some(l => l.top)
      const bHasTop = b.leagues.some(l => l.top)
      if (aHasTop !== bHasTop) return aHasTop ? -1 : 1
      return countryA.localeCompare(countryB)
    })
    return Object.fromEntries(sorted)
  }, [fixtures])

  function handleItemClick(key) {
    if (key === 'ligi') {
      setLeaguesExpanded(prev => !prev)
      return
    }
    onViewChange(key)
  }

  const isLigiActive = leaguesExpanded

  const NavBtn = ({ itemKey, icon, label, accentColor = '#f97316', accentBg = 'rgba(249,115,22,0.1)', premium = false, children }) => {
    const isActive = activeView === itemKey
    return (
      <button
        onClick={() => handleItemClick(itemKey)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: isMobile ? '12px 16px' : '9px 16px', justifyContent: 'flex-start', width: '100%', background: isActive ? accentBg : 'none', border: 'none', borderLeft: isActive ? `3px solid ${accentColor}` : '3px solid transparent', borderBottom: '1px solid var(--sw-border)', color: isActive ? accentColor : '#6b7280', cursor: 'pointer', whiteSpace: 'nowrap', fontSize: 13, fontWeight: isActive ? 700 : 400, textAlign: 'left' }}
      >
        <span style={{ fontSize: 18, minWidth: 22, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
        <>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{label}</span>
          {children}
          {premium && <span style={{ fontSize: 9, color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 3, padding: '1px 5px' }}>PLAN</span>}
        </>
      </button>
    )
  }

  return (
    <aside className="app-sidebar" style={{ width: isMobile ? '100vw' : 300, background: 'var(--sw-surface-0)', borderRight: '1px solid var(--sw-border)', minHeight: isMobile ? '100dvh' : '100vh', height: isMobile ? '100dvh' : '100vh', overflow: 'hidden', flexShrink: 0, transition: 'width 0.25s cubic-bezier(0.4,0,0.2,1), transform 0.2s ease', display: 'flex', flexDirection: 'column', position: 'fixed', top: 0, left: 0, zIndex: 60, transform: mobileOpen ? 'translateX(0)' : 'translateX(-100%)', paddingBottom: isMobile ? 'env(safe-area-inset-bottom, 0px)' : 0 }}>
      {isMobile && (
        <button className="sidebar-close-button" onClick={() => onRequestClose?.()} title="Close navigation" style={{ position: 'absolute', top: 12, left: 12, width: 44, height: 44, background: 'var(--sw-surface-1)', border: '1px solid var(--sw-border)', borderRadius: 10, color: '#9ca3af', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 900, zIndex: 12 }}>
          {'\u2715'}
        </button>
      )}

      <div style={{ height: isMobile ? 64 : 46, borderBottom: '1px solid var(--sw-border)', display: 'flex', alignItems: 'center', paddingLeft: isMobile ? 64 : 16, paddingRight: 16, justifyContent: 'space-between', flexShrink: 0, overflow: 'hidden', background: 'linear-gradient(90deg, rgba(255,122,0,0.05) 0%, transparent 100%)' }}>
        <span style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,122,0,0.55)', letterSpacing: '0.14em', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>StatsWise</span>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: 'rgba(255,122,0,0.4)', boxShadow: '0 0 6px rgba(255,122,0,0.5)' }} />
      </div>

      <div style={{ overflowY: 'auto', flex: 1, paddingTop: 4, paddingBottom: isMobile ? 14 : 0 }}>
        {STATIC_NAV.map(item => (
          <div key={item.key}>
            <NavBtn itemKey={item.key} icon={item.icon} label={t(item.labelKey) === item.labelKey ? item.labelFallback : t(item.labelKey)} accentColor={item.accentColor} accentBg={item.accentBg} premium={item.premium}>
              {item.key === 'ligi' && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" style={{ flexShrink: 0, transition: 'transform 0.2s', transform: isLigiActive ? 'rotate(90deg)' : 'rotate(0deg)', color: '#4b5563' }}><path d="M3 1.5L6.5 5L3 8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
            </NavBtn>
            {item.key === 'ligi' && isLigiActive && (
              <div style={{ background: 'var(--sw-surface-0)', borderBottom: '1px solid var(--sw-border)' }}>
                <LeagueTree leaguesByCountry={leaguesByCountry} activeLeague={activeLeague} onLeagueSelect={onLeagueSelect} />
              </div>
            )}
          </div>
        ))}

        <div style={{ padding: isMobile ? '12px 14px 6px' : '9px 14px 5px', display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, transparent, var(--sw-border))' }} />
          <span style={{ fontSize: 8.5, color: 'rgba(255,122,0,0.45)', fontWeight: 800, letterSpacing: '0.14em', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{statAnalysisLabel}</span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, var(--sw-border), transparent)' }} />
        </div>

        {STATS_ORDER.filter(stat => !stat.hiddenFromSidebar).map(stat => {
          const viewKey = statViewKey(stat.key)
          const color = STAT_GROUPS[stat.group]?.color || '#f97316'
          return (
            <NavBtn
              key={stat.key}
              itemKey={viewKey}
              icon={stat.icon}
              label={stat.shortLabel}
              accentColor={color}
              accentBg={`${color}16`}
            />
          )
        })}

        {isMobile && mobileInsights && (
          <div style={{ marginTop: 8, borderTop: '1px solid var(--sw-border)', paddingTop: 8 }}>
            <div style={{ padding: '8px 14px 6px', fontSize: 9, color: 'var(--sw-muted)', fontWeight: 700, letterSpacing: '0.1em' }}>INSIGHTS</div>
            <div style={{ padding: '0 10px 8px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              <button onClick={() => setInsightsTab('tips')} style={{ minHeight: 34, borderRadius: 8, border: insightsTab === 'tips' ? '1px solid rgba(34,197,94,0.45)' : '1px solid #243244', background: insightsTab === 'tips' ? 'rgba(34,197,94,0.12)' : 'var(--sw-surface-1)', color: insightsTab === 'tips' ? '#86efac' : '#9ca3af', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>Top 5</button>
              <button onClick={() => setInsightsTab('news')} style={{ minHeight: 34, borderRadius: 8, border: insightsTab === 'news' ? '1px solid rgba(255,74,31,0.45)' : '1px solid #243244', background: insightsTab === 'news' ? 'rgba(255,74,31,0.16)' : 'var(--sw-surface-1)', color: insightsTab === 'news' ? '#fdba74' : '#9ca3af', fontWeight: 700, fontSize: 11, cursor: 'pointer' }}>News</button>
            </div>
            {insightsTab === 'tips' && (
              <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {mobileInsights?.tipsLoading && <div style={{ border: '1px solid var(--sw-border)', borderRadius: 8, padding: '8px 9px', color: '#64748b', fontSize: 11 }}>Loading tips...</div>}
                {!mobileInsights?.tipsLoading && (mobileInsights?.tips || []).slice(0, 5).map((tip, idx) => (
                  <button key={`${tip.fixtureId}-${tip.statKey}-${idx}`} onClick={() => mobileInsights?.onTipSelect?.(tip)} style={{ border: '1px solid var(--sw-border)', borderRadius: 8, padding: '8px 9px', background: 'var(--sw-surface-0)', textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                      <span style={{ fontSize: 10, fontWeight: 800, color: '#f8fafc' }}>#{idx + 1} PICK</span>
                      <span style={{ fontSize: 10, fontWeight: 800, padding: '2px 6px', borderRadius: 999, ...getValuePickConfidenceBadgeStyle(tip.confidence) }}>{tip.confidence}%</span>
                    </div>
                    <div style={{ fontSize: 11, color: '#cbd5e1', fontWeight: 700, marginBottom: 2 }}>{tip.bet}</div>
                    <div style={{ fontSize: 10, color: '#64748b', lineHeight: 1.3 }}>{tip.match}</div>
                  </button>
                ))}
              </div>
            )}
            {insightsTab === 'news' && (
              <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {mobileInsights?.newsLoading && <div style={{ border: '1px solid var(--sw-border)', borderRadius: 8, padding: '8px 9px', color: '#64748b', fontSize: 11 }}>Loading news...</div>}
                {!mobileInsights?.newsLoading && (mobileInsights?.news || []).slice(0, 6).map((item, idx) => (
                  <button key={`${item.url || idx}-${idx}`} onClick={() => mobileInsights?.onNewsSelect?.(item)} style={{ border: '1px solid var(--sw-border)', borderRadius: 8, padding: '8px 9px', background: 'var(--sw-surface-0)', textAlign: 'left', cursor: 'pointer' }}>
                    <div style={{ fontSize: 10, color: '#cbd5e1', fontWeight: 700, marginBottom: 3 }}>{item.source || 'NEWS'}</div>
                    <div style={{ fontSize: 11, color: '#e2e8f0', fontWeight: 700, lineHeight: 1.35 }}>{item.title}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </aside>
  )
}


