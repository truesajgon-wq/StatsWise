import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import Sidebar from '../components/Sidebar.jsx'
import DayBar from '../components/DayBar.jsx'
import FixtureRow from '../components/FixtureRow.jsx'
import StatInsightsPanel from '../components/StatInsightsPanel.jsx'
import UserDashboard from '../components/UserDashboard.jsx'
import LamakiPage from './LamakiPage.jsx'
import PlayerStatsPage from './PlayerStatsPage.jsx'
import CorrectScorePage from './CorrectScorePage.jsx'
import { useFixturesByDate, useEnrichedFixtures } from '../data/hooks.js'
import { fetchEspnNews, fetchNewsArticle } from '../data/api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { useLang } from '../context/LangContext.jsx'
import PremiumGate from '../components/PremiumGate.jsx'
import AppFooter from '../components/AppFooter.jsx'
import StatPredictionPage from './StatPredictionPage.jsx'
import { SIDEBAR_KEY_MAP, viewKeyToStat, extractStatValue, getStatDef } from '../data/statsConfig.js'
import StatsWiseWordmark from '../components/StatsWiseWordmark.jsx'
import { getAppToday } from '../utils/appDate.js'

function toDateStr(d) { return d.toISOString().split('T')[0] }

const STAT_KEY_MAP = SIDEBAR_KEY_MAP
const CONTENT_MAX_WIDTH = 640
const DESKTOP_SIDEBAR_WIDTH = 300
const DESKTOP_BASE_CENTER_SHIFT = -(DESKTOP_SIDEBAR_WIDTH / 2)
const FAVORITE_FIXTURES_STORAGE_KEY = 'statswise.favoriteFixtures.v1'
const PRIORITY_COUNTRY_ORDER = ['England', 'Spain', 'Italy', 'Germany', 'France', 'Poland', 'Portugal']
const PRIORITY_LEAGUE_ORDER = [
  2,   // UEFA Champions League
  3,   // UEFA Europa League
  39,  // Premier League
  78,  // Bundesliga
  140, // La Liga
  61,  // Ligue 1
  135, // Serie A
  106, // Ekstraklasa
  94,  // Primeira Liga
]

function leaguePriorityIndex(leagueId) {
  const idx = PRIORITY_LEAGUE_ORDER.indexOf(Number(leagueId))
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
}

function countryPriorityIndex(country) {
  const idx = PRIORITY_COUNTRY_ORDER.indexOf(String(country || '').trim())
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx
}

function leaguePriorityByName(leagueName = '', country = '') {
  const name = String(leagueName || '').toLowerCase()
  const c = String(country || '').toLowerCase()
  if (c === 'world' && name.includes('champions league')) return 0
  if (c === 'world' && name.includes('europa league')) return 1
  return Number.MAX_SAFE_INTEGER
}

function localizedLabel(statKey, t) {
  const labels = {
    goals: t('nav_goals'),
    teamGoals: t('nav_teamGoals'),
    btts: t('nav_btts'),
    corners: t('nav_corners'),
    fouls: t('nav_fouls'),
    cards: t('nav_cards'),
  }
  return labels[statKey] || (getStatDef(statKey)?.shortLabel ?? statKey)
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n))
}

function timeAgo(isoLike) {
  const dt = new Date(isoLike || '')
  if (Number.isNaN(dt.getTime())) return ''
  const diffMs = Date.now() - dt.getTime()
  const h = Math.floor(diffMs / (1000 * 60 * 60))
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
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

function safeRate(list, statKey, alt, def, isHome) {
  if (!Array.isArray(list) || !list.length) return null
  const vals = list.map(m => extractStatValue(m, statKey, isHome))
  if (!vals.length) return null
  const hits = vals.filter(v => (def?.binary ? v === 1 : v > alt)).length
  return hits / vals.length
}

function weightedRate(list, statKey, alt, def, isHome) {
  const windows = [
    { size: 5, weight: 0.5 },
    { size: 10, weight: 0.3 },
    { size: 15, weight: 0.2 },
  ]
  let sum = 0
  let weightSum = 0
  const rates = { l5: null, l10: null, l15: null }
  for (const w of windows) {
    const sample = list.slice(0, w.size)
    const rate = safeRate(sample, statKey, alt, def, isHome)
    if (rate == null) continue
    sum += rate * w.weight
    weightSum += w.weight
    if (w.size === 5) rates.l5 = rate
    if (w.size === 10) rates.l10 = rate
    if (w.size === 15) rates.l15 = rate
  }
  return {
    score: weightSum ? sum / weightSum : null,
    ...rates,
  }
}

function styleTag(homeHistory, awayHistory) {
  const merged = [...(homeHistory || []), ...(awayHistory || [])]
  if (!merged.length) return 'balanced'
  const avgGoals = merged.reduce((s, m) => s + extractStatValue(m, 'goals', true), 0) / merged.length
  const avgCorners = merged.reduce((s, m) => s + extractStatValue(m, 'corners', true), 0) / merged.length
  const avgCards = merged.reduce((s, m) => s + extractStatValue(m, 'cards', true), 0) / merged.length
  const avgFouls = merged.reduce((s, m) => s + extractStatValue(m, 'fouls', true), 0) / merged.length
  if (avgCards >= 4.8 || avgFouls >= 24) return 'physical'
  if (avgCorners >= 10) return 'wide-play'
  if (avgGoals >= 2.8) return 'high-tempo'
  return 'balanced'
}

function fallbackTips(fixtures, t, count = 5) {
  return (fixtures || []).slice(0, count).map((fixture, idx) => ({
    fixtureId: fixture.id,
    statKey: 'goals',
    confidence: 55,
    match: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
    bet: `${localizedLabel('goals', t)} - Over 1.5`,
    why: 'Fallback tip: not enough historical form/H2H data yet.',
    breakdown: { l5: null, l10: null, l15: null, h2h: null, style: 'unknown' },
    fallback: true,
    rankScore: 0.55 - idx * 0.01,
  }))
}

function tipConfidenceBadgeStyle(confidence) {
  if (confidence <= 60) {
    return {
      color: '#22c55e',
      background: 'rgba(34,197,94,0.10)',
      border: '1px solid rgba(34,197,94,0.30)',
    }
  }

  return {
    color: '#ffb36b',
    background: 'rgba(255,122,0,0.12)',
    border: '1px solid rgba(255,122,0,0.30)',
  }
}

function buildTips(fixtures, t) {
  const statPool = ['teamGoals', 'goals', 'btts', 'corners', 'cards', 'shots', 'fouls', 'firstHalfGoals', 'goalsInBothHalves']
  const ready = (fixtures || []).filter(f => f.homeHistory?.length && f.awayHistory?.length)
  const tips = []

  for (const fixture of ready) {
    let best = null
    for (const statKey of statPool) {
      const def = getStatDef(statKey)
      const alt = def?.defaultAlt ?? 0
      if (!def) continue

      const homeTrend = weightedRate(fixture.homeHistory, statKey, alt, def, true)
      const awayTrend = weightedRate(fixture.awayHistory, statKey, alt, def, false)
      if (homeTrend.score == null || awayTrend.score == null) continue

      const h2hRate = safeRate(fixture.h2h?.slice(0, 15) || [], statKey, alt, def, true)
      const formScore = (homeTrend.score + awayTrend.score) / 2
      const h2hScore = h2hRate == null ? formScore : h2hRate
      const l5Boost = ((homeTrend.l5 ?? homeTrend.score) + (awayTrend.l5 ?? awayTrend.score)) / 2
      const style = styleTag(fixture.homeHistory, fixture.awayHistory)
      const styleBoost = style === 'high-tempo' && ['goals', 'btts', 'shots', 'firstHalfGoals', 'goalsInBothHalves'].includes(statKey)
        ? 0.04
        : style === 'physical' && ['cards', 'fouls'].includes(statKey)
          ? 0.04
          : style === 'wide-play' && statKey === 'corners'
            ? 0.04
            : 0

      const combined = clamp01((formScore * 0.64) + (h2hScore * 0.26) + (l5Boost * 0.10) + styleBoost)
      if (!best || combined > best.score) {
        best = {
          statKey,
          alt,
          score: combined,
          def,
          style,
          h2hRate,
          l5: l5Boost,
          l10: (homeTrend.l10 == null || awayTrend.l10 == null) ? null : (homeTrend.l10 + awayTrend.l10) / 2,
          l15: (homeTrend.l15 == null || awayTrend.l15 == null) ? null : (homeTrend.l15 + awayTrend.l15) / 2,
        }
      }
    }

    if (!best) continue
    const confidence = Math.max(55, Math.min(95, Math.round(best.score * 100)))
    const thresholdText = best.def?.binary ? 'YES' : `Over ${best.alt}`
    tips.push({
      fixtureId: fixture.id,
      statKey: best.statKey,
      confidence,
      match: `${fixture.homeTeam.name} vs ${fixture.awayTeam.name}`,
      bet: `${localizedLabel(best.statKey, t)} - ${thresholdText}`,
      why: `L5 ${(best.l5 ?? 0) * 100 | 0}% | L10 ${best.l10 == null ? '-' : `${(best.l10 * 100) | 0}%`} | L15 ${best.l15 == null ? '-' : `${(best.l15 * 100) | 0}%`} | H2H ${best.h2hRate == null ? '-' : `${(best.h2hRate * 100) | 0}%`} | Style: ${best.style}`,
      breakdown: {
        l5: best.l5,
        l10: best.l10,
        l15: best.l15,
        h2h: best.h2hRate,
        style: best.style,
      },
      fallback: false,
      rankScore: best.score,
    })
  }

  const ranked = tips.sort((a, b) => b.rankScore - a.rankScore).slice(0, 5)
  if (ranked.length) return ranked
  return fallbackTips(fixtures, t, 5)
}

export default function HomePage() {
  const navigate = useNavigate()
  const [dayOffset, setDayOffset] = useState(0)
  const [search, setSearch] = useState('')
  const [activeView, setActiveView] = useState('mecze')
  const [activeLeague, setActiveLeague] = useState(null)
  const [dashboardOpen, setDashboardOpen] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [insightPred, setInsightPred] = useState(null)
  const [panelTab, setPanelTab] = useState('tips')
  const [newsItems, setNewsItems] = useState([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [selectedNews, setSelectedNews] = useState(null)
  const [newsModalLoading, setNewsModalLoading] = useState(false)
  const [favoriteFixtureIds, setFavoriteFixtureIds] = useState(() => {
    try {
      const raw = localStorage.getItem(FAVORITE_FIXTURES_STORAGE_KEY)
      const parsed = raw ? JSON.parse(raw) : []
      return Array.isArray(parsed) ? parsed.map(v => String(v)) : []
    } catch {
      return []
    }
  })
  const { user, isSubscribed } = useAuth()
  const { t } = useLang()

  function handleLogoHomeClick() {
    setActiveLeague(null)
    setActiveView('mecze')
    setSidebarOpen(false)
    navigate('/')
  }

  useEffect(() => {
    document.body.style.overflow = sidebarOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [sidebarOpen])

  useEffect(() => {
    localStorage.setItem(FAVORITE_FIXTURES_STORAGE_KEY, JSON.stringify(favoriteFixtureIds))
  }, [favoriteFixtureIds])

  const dayIdx = 3
  const today = getAppToday()
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today)
    d.setDate(d.getDate() + dayOffset + (i - dayIdx))
    return d
  })

  const selectedDateStr = toDateStr(days[dayIdx])
  const { fixtures, loading, error, usingMock, refetch } = useFixturesByDate(selectedDateStr)

  function handleLeagueSelect(id) {
    setActiveLeague(p => (p === id ? null : id))
    setActiveView('mecze')
  }

function handleViewChange(key) {
    if (key !== 'ligi' && key !== 'mecze') setActiveLeague(null)
    setActiveView(key)
  }

  const isScheduleView = activeView === 'mecze' || activeView === 'ligi'
  const isLamakiView = activeView === 'lamaki'
  const isPlayerStatsView = activeView === 'player_stats'
  const isCorrectScore = activeView === 'correct_score'
  const activeStatKey = viewKeyToStat(activeView)
  const isStatPage = Boolean(activeStatKey)
  const isSpecialView = isLamakiView || isPlayerStatsView || isCorrectScore || isStatPage
  const isStatView = !isScheduleView && !isSpecialView && STAT_KEY_MAP[activeView]
  const tipsInPanelView = false
  const desktopCenterShift = DESKTOP_BASE_CENTER_SHIFT
  const rightPanelVisible = true
  const fixturesDesktopCenterShift = rightPanelVisible ? 10 : DESKTOP_BASE_CENTER_SHIFT

  const shouldEnrich = isLamakiView || isCorrectScore || isStatPage
  const enrichOptions = useMemo(() => {
    if (isCorrectScore) return { includeH2H: true, withStats: false, maxFixtures: 10 }
    if (isStatPage) return { includeH2H: false, withStats: true, maxFixtures: 10 }
    if (isLamakiView) return { includeH2H: false, withStats: false, maxFixtures: 10 }
    return { includeH2H: false, withStats: false, maxFixtures: 0 }
  }, [isCorrectScore, isLamakiView, isStatPage])
  const { fixtures: enrichedFixtures, loading: enrichingLoading } = useEnrichedFixtures(fixtures, shouldEnrich, enrichOptions)
  const analyticsLoading = loading || enrichingLoading

  useEffect(() => {
    let cancelled = false
    setNewsLoading(true)
    fetchEspnNews(8)
      .then(rows => {
        if (!cancelled) setNewsItems(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (!cancelled) setNewsItems([])
      })
      .finally(() => {
        if (!cancelled) setNewsLoading(false)
      })
    return () => { cancelled = true }
  }, [selectedDateStr])

  const filtered = useMemo(() => (fixtures || []).filter(f => {
    const ml = activeLeague ? f.league.id === activeLeague : true
    const ss = search.toLowerCase()
    const ms = !search || f.homeTeam.name.toLowerCase().includes(ss) || f.awayTeam.name.toLowerCase().includes(ss)
    return ml && ms
  }), [fixtures, search, activeLeague])
  const favoriteFixtureIdSet = useMemo(() => new Set(favoriteFixtureIds), [favoriteFixtureIds])
  const favoriteFixtures = useMemo(
    () => filtered
      .filter(f => favoriteFixtureIdSet.has(String(f?.id)))
      .sort((a, b) => {
        const at = new Date(a?.date || 0).getTime()
        const bt = new Date(b?.date || 0).getTime()
        if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt
        return Number(a?.id || 0) - Number(b?.id || 0)
      }),
    [filtered, favoriteFixtureIdSet],
  )

  const { fixtures: panelTipFixtures, loading: panelTipLoading } = useEnrichedFixtures(filtered, isScheduleView || isStatView, {
    includeH2H: true,
    withStats: false,
    maxFixtures: 16,
    historyCount: 15,
    h2hCount: 10,
  })
  const panelTips = useMemo(() => buildTips(panelTipFixtures, t), [panelTipFixtures, t])

  const groups = useMemo(() => {
    const map = {}
    filtered.forEach(f => {
      if (favoriteFixtureIdSet.has(String(f?.id))) return
      const k = f.league.id
      if (!map[k]) map[k] = { league: f.league, fixtures: [] }
      map[k].fixtures.push(f)
    })
    Object.values(map).forEach(group => {
      group.fixtures.sort((a, b) => {
        const at = new Date(a?.date || 0).getTime()
        const bt = new Date(b?.date || 0).getTime()
        if (Number.isFinite(at) && Number.isFinite(bt) && at !== bt) return at - bt
        return Number(a?.id || 0) - Number(b?.id || 0)
      })
    })
    return Object.values(map).sort((a, b) => {
      const ap = leaguePriorityIndex(a?.league?.id)
      const bp = leaguePriorityIndex(b?.league?.id)
      if (ap !== bp) return ap - bp
      const an = leaguePriorityByName(a?.league?.name, a?.league?.country)
      const bn = leaguePriorityByName(b?.league?.name, b?.league?.country)
      if (an !== bn) return an - bn
      const ac = countryPriorityIndex(a?.league?.country)
      const bc = countryPriorityIndex(b?.league?.country)
      if (ac !== bc) return ac - bc
      if (a.league.top && !b.league.top) return -1
      if (!a.league.top && b.league.top) return 1
      const byCountry = String(a?.league?.country || '').localeCompare(String(b?.league?.country || ''))
      if (byCountry !== 0) return byCountry
      return String(a?.league?.name || '').localeCompare(String(b?.league?.name || ''))
    })
  }, [filtered, favoriteFixtureIdSet])

  function handleFixtureClick(fixture) {
    const fixtureDate = String(fixture?.date || '').slice(0, 10)
    navigate(`/match/${fixture.id}${fixtureDate ? `?date=${fixtureDate}` : ''}`)
  }

  function toggleFavoriteFixture(fixtureId) {
    const id = String(fixtureId)
    setFavoriteFixtureIds(prev => (
      prev.includes(id)
        ? prev.filter(v => v !== id)
        : [id, ...prev]
    ))
  }

  function handleTipClick(tip) {
    navigate(`/match/${tip.fixtureId}?stat=${encodeURIComponent(tip.statKey)}`)
  }

  function handleDaySelect(idx) {
    setDayOffset(prev => prev + (idx - dayIdx))
  }

  function handlePrevDay() {
    setDayOffset(prev => prev - 1)
  }

  function handleNextDay() {
    setDayOffset(prev => prev + 1)
  }

  const searchPlaceholder = 'Search team...'
  const noMatchesText = 'No matches on this day'
  const clearFiltersText = 'Clear filters'
  const ui = {
        leagueFilter: 'League filter:',
        errorLoading: 'Error loading',
        premium: 'Premium',
  }

  const activeLeagueInfo = activeLeague ? fixtures.find(f => f.league.id === activeLeague)?.league : null

  async function openNewsModal(item) {
    if (!item) return
    setSelectedNews(item)
    if (item?.image) return
    if (!item?.url) return
    setNewsModalLoading(true)
    try {
      const details = await fetchNewsArticle(item.url)
      const fallbackImage = details?.image || details?.leadImage || null
      const merged = {
        ...item,
        image: item.image || fallbackImage || null,
        blurb: item.blurb || details?.description || details?.excerpt || item.blurb,
      }
      setSelectedNews(merged)
    } catch {
      // Keep feed preview if article parsing fails.
    } finally {
      setNewsModalLoading(false)
    }
  }

  return (
    <div
      className="theme-page"
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        position: 'relative',
        '--desktop-center-shift': `${desktopCenterShift}px`,
        '--desktop-fixtures-shift': `${fixturesDesktopCenterShift}px`,
      }}
    >
      <style>{`
        @media (max-width: 768px) {
          .mobile-menu-btn { display: flex !important; }
          .hide-mobile { display: none !important; }
          .app-sidebar { position: fixed !important; top: 0 !important; left: 0 !important; z-index: 90 !important; }
          aside.news-panel-aside { display: none !important; }
          .home-header {
            display: grid !important;
            grid-template-columns: 40px 1fr auto !important;
            align-items: center !important;
            gap: 8px !important;
            min-height: 56px !important;
            padding: 10px 12px !important;
          }
          .home-search-wrap { display: none !important; }
          .home-header-spacer { display: none !important; }
          .home-controls { margin-left: 0 !important; gap: 8px !important; justify-content: flex-end !important; grid-column: 3 !important; justify-self: end !important; width: auto !important; min-width: 48px !important; }
          .home-brand-mobile { display: flex !important; align-items: center; justify-content: center; gap: 6px; min-width: 0; }
          .home-brand-mobile .statswise-wordmark { transform: scale(0.58); transform-origin: center; }
          .desktop-count { display: none !important; }
          .desktop-refresh { display: none !important; }
          .mobile-compact-user .user-welcome { display: none !important; }
          .mobile-compact-user .user-name { font-size: 11px !important; max-width: 90px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
          .mobile-compact-user { display: flex !important; }
          .premium-btn { display: none !important; }
          .mobile-floating-user {
            position: fixed !important;
            top: 8px !important;
            right: 10px !important;
            z-index: 85 !important;
            background: none;
            border: none;
            cursor: pointer;
            padding: 0;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .mobile-floating-user { display: none !important; }
          .mobile-floating-user img, .mobile-floating-user .avatar-fallback { width: 44px !important; height: 44px !important; border-radius: 999px !important; }
          .desktop-global-center-shift { transform: none !important; }
          .fixture-group-card {
            margin-bottom: 12px !important;
            border: none !important;
            background: transparent !important;
            overflow: visible !important;
          }
          .fixture-group-header {
            padding: 8px 6px 6px !important;
            background: transparent !important;
            border: none !important;
            border-bottom: none !important;
          }
          .fixture-group-top-badge { display: none !important; }
          .fixture-mobile-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
          }
        }
        @media (min-width: 769px) {
          .mobile-menu-btn { display: none !important; }
          .sidebar-overlay { display: none !important; }
          .app-sidebar { position: static !important; transform: none !important; z-index: auto !important; }
          .sidebar-shell { position: static !important; }
          .home-header-centered { position: relative; }
          .home-search-wrap {
            position: absolute;
            left: 50%;
            transform: translateX(calc(-50% + var(--desktop-center-shift, 0px)));
            width: min(640px, calc(100% - 32px));
            padding: 0 !important;
          }
          .home-search-inner { max-width: none !important; }
          .desktop-global-center-shift { transform: translateX(var(--desktop-fixtures-shift, 0px)); }
          .home-controls {
            position: absolute !important;
            right: 14px !important;
            top: 50% !important;
            transform: translateY(-50%);
          }
          .mobile-floating-user { display: none !important; }
        }
      `}</style>

      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {sidebarOpen && (
          <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 49 }} />
        )}

        <div className="sidebar-shell" style={{ flexShrink: 0, position: 'relative', zIndex: 50 }}>
          <Sidebar
            activeView={activeView}
            onViewChange={key => { handleViewChange(key); setSidebarOpen(false) }}
            activeLeague={activeLeague}
            onLeagueSelect={id => { handleLeagueSelect(id); setSidebarOpen(false) }}
            fixtures={fixtures}
            mobileOpen={sidebarOpen}
            onRequestClose={() => setSidebarOpen(false)}
            mobileInsights={{
              tips: panelTips,
              tipsLoading: panelTipLoading,
              news: newsItems,
              newsLoading,
              onTipSelect: (tip) => { handleTipClick(tip); setSidebarOpen(false) },
              onNewsSelect: (news) => { openNewsModal(news); setSidebarOpen(false) },
            }}
          />
        </div>

        <main style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', minWidth: 0 }}>
        <header className="home-header home-header-centered theme-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', flexShrink: 0, minHeight: 52 }}>
          <button className="mobile-menu-btn" onClick={() => setSidebarOpen(o => !o)} style={{ display: 'none', background: 'var(--sw-surface-1)', border: '1px solid var(--sw-border)', borderRadius: 14, color: '#c8d2e2', cursor: 'pointer', width: 40, height: 40, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ width: 14, height: 2, borderRadius: 2, background: '#c8d2e2', display: 'block' }} />
              <span style={{ width: 14, height: 2, borderRadius: 2, background: '#c8d2e2', display: 'block' }} />
            </span>
          </button>

          <button
            className="home-brand-mobile"
            onClick={handleLogoHomeClick}
            style={{ display: 'none', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            aria-label="Go to home page"
          >
            <StatsWiseWordmark compact />
          </button>

          {isScheduleView ? (
            <div className="home-search-wrap" style={{ flex: 1, display: 'flex', justifyContent: 'center', padding: 0 }}>
              <div className="home-search-inner" style={{ position: 'relative', width: '100%', maxWidth: CONTENT_MAX_WIDTH }}>
                <input
                  type="text"
                  placeholder={searchPlaceholder}
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  style={{ width: '100%', padding: '8px 34px 8px 12px', borderRadius: 9, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-1)', color: 'var(--sw-text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
                {search && <button onClick={() => setSearch('')} style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: '#6b7280', background: 'none', border: 'none', cursor: 'pointer', fontSize: 14 }}>x</button>}
              </div>
            </div>
          ) : <div className="home-header-spacer" style={{ flex: 1 }} />}

          <div className="home-controls" style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button
              className="hide-mobile"
              onClick={handleLogoHomeClick}
              style={{ display: 'flex', alignItems: 'center', gap: 6, whiteSpace: 'nowrap', flexShrink: 0, marginRight: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              aria-label="Go to home page"
            >
              <StatsWiseWordmark color="#f8fafc" />
            </button>
            {!user && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  onClick={() => navigate('/login')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, minWidth: 80, padding: '6px 12px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-2)', cursor: 'pointer', textAlign: 'center' }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#f8fafc', lineHeight: 1, whiteSpace: 'nowrap' }}>{t('login')}</span>
                </button>
                <button
                  onClick={() => navigate('/login?mode=register')}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minWidth: 82, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(249,115,22,0.55)', background: 'rgba(249,115,22,0.14)', cursor: 'pointer', textAlign: 'center' }}
                >
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fdba74', lineHeight: 1, whiteSpace: 'nowrap' }}>Signup</span>
                </button>
              </div>
            )}

            {user && !isSubscribed() && (
              <button className="premium-btn" onClick={() => navigate('/subscription')} style={{ padding: '5px 10px', borderRadius: 6, border: 'none', background: 'linear-gradient(135deg,#f59e0b,#eab308)', color: '#000', fontWeight: 800, fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                {ui.premium}
              </button>
            )}

            {user && (
              <button className="mobile-compact-user" onClick={() => setDashboardOpen(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 7 }}>
                <div
                  className="avatar-fallback"
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: '999px',
                    background: avatarPalette(`${user?.name || ''}-${user?.nickname || ''}`).bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 900,
                    color: '#fff',
                    border: `2px solid ${avatarPalette(`${user?.name || ''}-${user?.nickname || ''}`).border}`,
                    flexShrink: 0,
                    letterSpacing: '0.02em',
                  }}
                >
                  {initialsFromUser(user)}
                </div>
              </button>
            )}
          </div>

          {dashboardOpen && <UserDashboard onClose={() => setDashboardOpen(false)} />}
        </header>

        {(isScheduleView || isStatView || isLamakiView || isStatPage) && (
          <DayBar
            days={days}
            selectedIdx={dayIdx}
            onSelect={handleDaySelect}
            onPrev={handlePrevDay}
            onNext={handleNextDay}
            maxWidth={CONTENT_MAX_WIDTH}
            centerShiftDesktop={desktopCenterShift}
          />
        )}

        {isScheduleView && activeLeagueInfo && (
          <div style={{ padding: '8px 20px', borderBottom: '1px solid var(--sw-border)', background: 'rgba(8,9,11,0.96)', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, color: '#6b7280' }}>{ui.leagueFilter}</span>
            <span style={{ fontSize: 12, color: '#f8fafc', fontWeight: 700, background: 'rgba(255,74,31,0.14)', border: '1px solid rgba(255,74,31,0.35)', borderRadius: 999, padding: '3px 10px' }}>{activeLeagueInfo.name} - {activeLeagueInfo.country}</span>
            <button onClick={() => setActiveLeague(null)} style={{ fontSize: 12, color: '#9ca3af', background: 'none', border: '1px solid var(--sw-muted)', borderRadius: 999, padding: '3px 10px', cursor: 'pointer' }}>{clearFiltersText}</button>
          </div>
        )}

        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>
          <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
            {isLamakiView && (
              <div className="home-mobile-shell" style={{ padding: '16px 20px' }}>
                <div className="desktop-global-center-shift" style={{ maxWidth: CONTENT_MAX_WIDTH, margin: '0 auto' }}>
                  <PremiumGate featureName={t('lamaki_title')}><LamakiPage fixtures={enrichedFixtures} loading={analyticsLoading} /></PremiumGate>
                </div>
              </div>
            )}
            {isPlayerStatsView && (
              <div className="home-mobile-shell" style={{ padding: '16px 20px' }}>
                <div className="desktop-global-center-shift" style={{ maxWidth: CONTENT_MAX_WIDTH, margin: '0 auto' }}>
                  <PlayerStatsPage title="Player Rankings" />
                </div>
              </div>
            )}
            {isCorrectScore && (
              <div className="home-mobile-shell" style={{ padding: '16px 20px' }}>
                <div className="desktop-global-center-shift" style={{ maxWidth: CONTENT_MAX_WIDTH, margin: '0 auto' }}>
                  <PremiumGate featureName={t('correct_score')}><CorrectScorePage fixtures={enrichedFixtures} loading={analyticsLoading} /></PremiumGate>
                </div>
              </div>
            )}
            {isStatPage && (
              <div className="home-mobile-shell" style={{ padding: '16px 20px' }}>
                <div className="desktop-global-center-shift" style={{ maxWidth: CONTENT_MAX_WIDTH, margin: '0 auto' }}>
                  <StatPredictionPage
                    statKey={activeStatKey}
                    fixtures={enrichedFixtures}
                    loading={analyticsLoading}
                    onPredictionClick={(pred) => setInsightPred(pred)}
                  />
                </div>
              </div>
            )}

            {!isSpecialView && (
              <div style={{ padding: '16px 20px' }}>
                <div className="desktop-global-center-shift" style={{ maxWidth: CONTENT_MAX_WIDTH, margin: '0 auto' }}>
                  {error && (
                    <div style={{ padding: '14px 16px', background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', borderRadius: 10, marginBottom: 16 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#ef4444' }}>{ui.errorLoading}</div>
                      <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{error}</div>
                      <button onClick={refetch} style={{ marginTop: 8, fontSize: 12, color: '#f97316', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>{t('retry')}</button>
                    </div>
                  )}

                  {usingMock && !loading && (
                    <div style={{ padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 8, marginBottom: 16, fontSize: 12, color: '#d97706' }}>
                      <strong>{t('demo_title')}</strong> - {t('demo_desc')} <code style={{ background: 'rgba(0,0,0,0.2)', padding: '1px 5px', borderRadius: 3 }}>.env</code>{t('demo_desc2')}
                    </div>
                  )}

                  {loading && !error && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid var(--sw-border)' }}>
                          <div style={{ height: 44, background: 'var(--sw-surface-2)' }} />
                          {[0, 1, 2].map(j => (
                            <div key={j} style={{ height: 52, background: j % 2 === 0 ? 'var(--sw-surface-1)' : '#151c28', borderBottom: '1px solid var(--sw-bg)' }} />
                          ))}
                        </div>
                      ))}
                    </div>
                  )}

                  {!loading && !error && isScheduleView && (
                    <>
                      {groups.length === 0 && favoriteFixtures.length === 0 ? (
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', paddingTop: 80, color: '#4b5563' }}>
                          <p style={{ fontSize: 15 }}>{noMatchesText}</p>
                          {(search || activeLeague) && (
                            <button onClick={() => { setSearch(''); setActiveLeague(null) }} style={{ marginTop: 12, color: '#f97316', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}>
                              {clearFiltersText}
                            </button>
                          )}
                        </div>
                      ) : (
                        <>
                          {!!favoriteFixtures.length && (
                            <div className="fixture-group-card" style={{ marginBottom: 16, borderRadius: 10, overflow: 'hidden', border: '1px solid rgba(245,158,11,0.45)' }}>
                              <div className="fixture-group-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'rgba(245,158,11,0.12)', borderBottom: '1px solid rgba(245,158,11,0.35)' }}>
                                <span style={{ fontSize: 16 }}>{'\u2605'}</span>
                                <span style={{ fontWeight: 800, fontSize: 13, color: '#fef3c7', letterSpacing: '0.02em' }}>Favorites</span>
                                <span style={{ marginLeft: 'auto', fontSize: 11, color: '#fcd34d' }}>{favoriteFixtures.length} match{favoriteFixtures.length > 1 ? 'es' : ''}</span>
                              </div>
                              <div className="fixture-mobile-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
                                {favoriteFixtures.map((f, fi) => (
                                  <FixtureRow
                                    key={`fav-${f.id}`}
                                    fixture={f}
                                    even={fi % 2 === 0}
                                    isFavorite={favoriteFixtureIdSet.has(String(f.id))}
                                    onToggleFavorite={() => toggleFavoriteFixture(f.id)}
                                    onClick={() => handleFixtureClick(f)}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                          {groups.map(({ league, fixtures: lf }) => (
                          <div key={league.id} className="fixture-group-card" style={{ marginBottom: 20, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--sw-border)' }}>
                            <div className="fixture-group-header" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', background: 'var(--sw-surface-2)', borderBottom: '1px solid var(--sw-border)' }}>
                              {league.flag?.startsWith('http')
                                ? <img src={league.flag} alt={league.country} style={{ width: 22, height: 16, objectFit: 'cover', borderRadius: 2 }} />
                                : <span style={{ fontSize: 18 }}>{league.flag}</span>
                              }
                              {league.logo && <img src={league.logo} alt={league.name} style={{ width: 20, height: 20, objectFit: 'contain' }} />}
                              <span style={{ fontWeight: 700, fontSize: 13, color: '#f1f5f9' }}>{league.name}</span>
                              <span style={{ color: '#6b7280', fontSize: 12 }}> - {league.country}</span>
                              {league.top && <span className="fixture-group-top-badge" style={{ marginLeft: 'auto', fontSize: 10, fontWeight: 800, background: 'rgba(234,179,8,0.12)', color: '#eab308', border: '1px solid rgba(234,179,8,0.25)', borderRadius: 4, padding: '1px 7px', letterSpacing: 1 }}>TOP</span>}
                            </div>
                            <div className="fixture-mobile-list" style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 8 }}>
                              {lf.map((f, fi) => (
                                <FixtureRow
                                  key={f.id}
                                  fixture={f}
                                  even={fi % 2 === 0}
                                  isFavorite={favoriteFixtureIdSet.has(String(f.id))}
                                  onToggleFavorite={() => toggleFavoriteFixture(f.id)}
                                  onClick={() => handleFixtureClick(f)}
                                />
                              ))}
                            </div>
                          </div>
                          ))}
                        </>
                      )}
                    </>
                  )}

                  {!loading && !error && isStatView && (
                    <StatInsightsPanel fixtures={enrichedFixtures} statKey={STAT_KEY_MAP[activeView]} onFixtureClick={handleFixtureClick} />
                  )}
                </div>
              </div>
            )}
          </div>
          {rightPanelVisible && (
            <aside className="news-panel-aside" style={{ width: 320, flexShrink: 0, borderLeft: '1px solid var(--sw-border)', background: 'linear-gradient(180deg, #111214 0%, #08090b 100%)', overflowY: 'auto' }}>
              <div style={{ position: 'sticky', top: 0, zIndex: 5, borderBottom: '1px solid var(--sw-border)', background: 'rgba(17,22,31,0.95)', backdropFilter: 'blur(6px)' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, padding: 10 }}>
                  <button onClick={() => setPanelTab('tips')} style={{ minHeight: 36, borderRadius: 10, border: panelTab === 'tips' ? '1px solid var(--sw-border-strong)' : '1px solid var(--sw-border)', background: panelTab === 'tips' ? 'rgba(255,122,0,0.12)' : 'var(--sw-surface-1)', color: panelTab === 'tips' ? '#f5f5f5' : '#9ca3af', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Top 5 Bets</button>
                  <button onClick={() => setPanelTab('news')} style={{ minHeight: 36, borderRadius: 10, border: panelTab === 'news' ? '1px solid var(--sw-border-strong)' : '1px solid var(--sw-border)', background: panelTab === 'news' ? 'rgba(255,122,0,0.12)' : 'var(--sw-surface-1)', color: panelTab === 'news' ? '#f5f5f5' : '#9ca3af', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>News</button>
                </div>
              </div>

              {panelTab === 'tips' && (
                <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {panelTipLoading && (
                    <div style={{ border: '1px solid var(--sw-border)', borderRadius: 10, padding: '12px 10px', color: '#64748b', fontSize: 12 }}>Building top picks...</div>
                  )}
                  {!panelTipLoading && panelTips.map((tip, idx) => {
                    const hot = idx === 0
                    const confidenceBadge = tipConfidenceBadgeStyle(tip.confidence)
                    return (
                      <button
                        key={`${tip.fixtureId}-${tip.statKey}`}
                        onClick={() => handleTipClick(tip)}
                        style={{ textAlign: 'left', border: hot ? '1px solid var(--sw-border-strong)' : '1px solid var(--sw-border)', borderRadius: 12, background: hot ? 'linear-gradient(90deg, rgba(255,122,0,0.18), rgba(17,18,20,1) 34%)' : 'var(--sw-surface-0)', padding: 10, cursor: 'pointer' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 900, color: hot ? '#ffb36b' : '#e5e7eb', letterSpacing: '0.08em' }}>#{idx + 1} VALUE PICK</span>
                          <span style={{ fontSize: 11, fontWeight: 900, borderRadius: 999, padding: '2px 8px', ...confidenceBadge }}>{tip.confidence}%</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>{tip.match}</div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#f8fafc', marginBottom: 6 }}>{tip.bet}</div>
                        <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.35 }}>{tip.why}</div>
                      </button>
                    )
                  })}
                  {!panelTipLoading && !panelTips.length && (
                    <div style={{ border: '1px solid var(--sw-border)', borderRadius: 10, padding: '12px 10px', color: '#64748b', fontSize: 12 }}>No tips available for this day yet.</div>
                  )}
                </div>
              )}

              {panelTab === 'news' && (
                <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {newsLoading && <div style={{ border: '1px solid var(--sw-border)', borderRadius: 10, padding: '12px 10px', color: '#64748b', fontSize: 12 }}>Loading news...</div>}
                  {!newsLoading && newsItems.map((n, idx) => (
                    <button
                      key={`${n.url || idx}-${idx}`}
                      onClick={() => openNewsModal(n)}
                      style={{ textDecoration: 'none', border: '1px solid var(--sw-border)', borderRadius: 12, background: 'var(--sw-panel-gradient)', overflow: 'hidden', cursor: 'pointer', padding: 0, textAlign: 'left' }}
                    >
                      {n.image && (
                        <div style={{ width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', background: 'var(--sw-surface-0)' }}>
                          <img src={n.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
                        </div>
                      )}
                      <div style={{ padding: 10 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
                          <span style={{ fontSize: 10, fontWeight: 800, color: '#d1d5db', letterSpacing: '0.08em' }}>{n.source || 'NEWS'}</span>
                          <span style={{ fontSize: 10, color: '#6b7280' }}>{timeAgo(n.publishedAt)}</span>
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 800, color: '#f1f5f9', lineHeight: 1.35, marginBottom: 4 }}>{n.title}</div>
                        {n.blurb && <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.35 }}>{n.blurb}</div>}
                      </div>
                    </button>
                  ))}
                  {!newsLoading && !newsItems.length && (
                    <div style={{ border: '1px solid var(--sw-border)', borderRadius: 10, padding: '12px 10px', color: '#64748b', fontSize: 12 }}>No news available.</div>
                  )}
                </div>
              )}
            </aside>
          )}
        </div>
        </main>
      </div>
      
      {insightPred && (
        <div className="theme-overlay" onClick={() => setInsightPred(null)} style={{ position: 'fixed', inset: 0, zIndex: 140, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div className="theme-card" onClick={e => e.stopPropagation()} style={{ width: 'min(860px, 100%)', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(2,6,23,0.7)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--sw-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Stat Insights</div>
              <button onClick={() => setInsightPred(null)} style={{ minHeight: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-1)', color: '#94a3b8', cursor: 'pointer' }}>Close</button>
            </div>
            <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 900, color: '#f1f5f9' }}>{insightPred?.fixture?.homeTeam?.name} vs {insightPred?.fixture?.awayTeam?.name}</div>
              <div style={{ fontSize: 12, color: '#64748b' }}>{insightPred?.fixture?.league?.name} - {insightPred?.fixture?.time}</div>
              <div style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 800 }}>{insightPred?.label}</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 8 }}>
                <div style={{ padding: '10px 12px', border: '1px solid var(--sw-border)', borderRadius: 10 }}><div style={{ fontSize: 10, color: '#64748b' }}>Combined Confidence</div><div style={{ fontSize: 22, fontWeight: 900, color: '#22c55e' }}>{Math.round((insightPred?.combinedRate || 0) * 100)}%</div></div>
                <div style={{ padding: '10px 12px', border: '1px solid var(--sw-border)', borderRadius: 10 }}><div style={{ fontSize: 10, color: '#64748b' }}>Home Hit Rate</div><div style={{ fontSize: 22, fontWeight: 900, color: '#d1d5db' }}>{Math.round((insightPred?.home?.rate || 0) * 100)}%</div></div>
                <div style={{ padding: '10px 12px', border: '1px solid var(--sw-border)', borderRadius: 10 }}><div style={{ fontSize: 10, color: '#64748b' }}>Away Hit Rate</div><div style={{ fontSize: 22, fontWeight: 900, color: '#a78bfa' }}>{Math.round((insightPred?.away?.rate || 0) * 100)}%</div></div>
                <div style={{ padding: '10px 12px', border: '1px solid var(--sw-border)', borderRadius: 10 }}><div style={{ fontSize: 10, color: '#64748b' }}>Line</div><div style={{ fontSize: 22, fontWeight: 900, color: '#f59e0b' }}>{insightPred?.alt == null ? 'N/A' : Number(insightPred.alt).toFixed(1)}</div></div>
              </div>
              <div>
                <button
                  onClick={() => {
                    const fixtureId = insightPred?.fixture?.id
                    if (!fixtureId) return
                    navigate(`/match/${fixtureId}?stat=${encodeURIComponent(insightPred?.statKey || activeStatKey || '')}`)
                  }}
                  style={{ minHeight: 34, padding: '0 12px', borderRadius: 8, border: '1px solid rgba(209,213,219,0.4)', background: 'rgba(209,213,219,0.12)', color: '#e5e7eb', fontWeight: 700, cursor: 'pointer' }}
                >
                  Open Full Match Details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {selectedNews && (
        <div className="theme-overlay" onClick={() => setSelectedNews(null)} style={{ position: 'fixed', inset: 0, zIndex: 145, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 14 }}>
          <div className="theme-card" onClick={e => e.stopPropagation()} style={{ width: 'min(780px, 100%)', maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 60px rgba(2,6,23,0.7)' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--sw-surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{selectedNews?.source || 'News'}</div>
              <button onClick={() => setSelectedNews(null)} style={{ minHeight: 30, padding: '0 10px', borderRadius: 8, border: '1px solid var(--sw-border)', background: 'var(--sw-surface-1)', color: '#94a3b8', cursor: 'pointer' }}>Close</button>
            </div>
            {selectedNews?.image && (
              <div style={{ width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', background: 'var(--sw-surface-0)' }}>
                <img src={selectedNews.image} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center', display: 'block' }} />
              </div>
            )}
            <div style={{ padding: 16 }}>
              <div style={{ fontSize: 18, fontWeight: 900, color: '#f1f5f9', lineHeight: 1.3, marginBottom: 8 }}>{selectedNews?.title}</div>
              <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>{timeAgo(selectedNews?.publishedAt)}</div>
              {newsModalLoading && <div style={{ fontSize: 12, color: '#64748b', marginBottom: 10 }}>Loading article details...</div>}
              <div style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.5, marginBottom: 14 }}>{selectedNews?.blurb || 'Open the full article for complete details.'}</div>
              <a href={selectedNews?.url || '#'} target="_blank" rel="noreferrer" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minHeight: 36, padding: '0 12px', borderRadius: 8, border: '1px solid rgba(209,213,219,0.4)', background: 'rgba(209,213,219,0.12)', color: '#e5e7eb', fontWeight: 700, textDecoration: 'none' }}>
                Open Article
              </a>
            </div>
          </div>
        </div>
      )}
      <AppFooter />
    </div>
  )
}


