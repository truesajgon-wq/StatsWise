// Global Statistics Configuration
// Single source of truth. Every component imports from here.
// To add a new stat: one entry in STATS_ORDER. Everything else is automatic.

export function extractStatValue(match, key, isHome = true) {
  if (!match) return 0
  const hg = match.homeGoals ?? 0
  const ag = match.awayGoals ?? 0
  const myG = isHome ? hg : ag
  const oppG = isHome ? ag : hg

  switch (key) {
    case 'matchResult':         return myG > oppG ? 1 : 0
    case 'goals':               return hg + ag
    case 'teamGoals':           return myG
    case 'btts':                return (match.btts != null ? match.btts : (hg > 0 && ag > 0)) ? 1 : 0
    case 'corners':             return match.corners ?? 0
    case 'teamCorners':         return match.teamCorners ?? (match.corners != null ? Math.round(match.corners / 2) : 0)
    case 'cards':               return match.cards ?? 0
    case 'teamCards':           return match.teamCards ?? (match.cards != null ? Math.round(match.cards / 2) : 0)
    case 'shots':               return match.shots ?? match.shotsOnTarget ?? 0
    case 'teamShots':           return match.teamShots ?? (match.shots != null ? Math.round(match.shots / 2) : 0)
    case 'firstHalfGoals':      return match.firstHalfGoals ?? 0
    case 'secondHalfGoals':     return match.secondHalfGoals ?? 0
    case 'teamFirstHalfGoals': {
      if (match.teamFirstHalfGoals != null) return match.teamFirstHalfGoals
      if (match.firstHalfGoals != null) {
        return isHome
          ? Math.min(myG, match.firstHalfGoals)
          : Math.max(0, match.firstHalfGoals - Math.min(myG, match.firstHalfGoals))
      }
      return 0
    }
    case 'teamSecondHalfGoals': {
      if (match.teamSecondHalfGoals != null) return match.teamSecondHalfGoals
      if (match.secondHalfGoals != null) {
        return isHome
          ? Math.min(myG, match.secondHalfGoals)
          : Math.max(0, match.secondHalfGoals - Math.min(myG, match.secondHalfGoals))
      }
      return 0
    }
    case 'goalsInBothHalves':   return (match.bothHalvesGoals != null ? match.bothHalvesGoals : ((match.firstHalfGoals ?? 0) > 0 && (match.secondHalfGoals ?? 0) > 0)) ? 1 : 0
    case 'fouls':               return match.fouls ?? 0
    case 'teamFouls':           return match.teamFouls ?? (match.fouls != null ? Math.round(match.fouls / 2) : 0)
    default:                    return 0
  }
}

export const STATS_ORDER = [
  { key:'matchResult',         label:'Match Result',               shortLabel:'Match Result',      icon:'🏁', group:'goals',   defaultAlt:null, alts:[null],               binary:true,  scope:'team',   description:'Team to win the match (W/L form)' },
  { key:'goals',               label:'Total Match Goals',          shortLabel:'Match Goals',       icon:'⚽', group:'goals',   defaultAlt:1.5,  alts:[1.5,2.5,3.5,4.5],  binary:false, scope:'match',  description:'Combined goals scored by both teams' },
  { key:'teamGoals',           label:'Team Goals per 90',          shortLabel:'Team Goals',        icon:'🥅', group:'goals',   defaultAlt:0.5,  alts:[0.5,1.5,2.5],       binary:false, scope:'team',   description:'Goals scored by each team individually' },
  { key:'btts',                label:'Both Teams To Score',        shortLabel:'BTTS',              icon:'↔️', group:'goals',   defaultAlt:null, alts:[null],               binary:true,  scope:'binary', description:'Whether both teams scored at least once' },
  { key:'corners',             label:'Total Match Corners',        shortLabel:'Match Corners',     icon:'🚩', group:'corners', defaultAlt:7.5,  alts:[7.5,9.5,11.5,13.5], binary:false, scope:'match',  description:'Total corners awarded to both teams' },
  { key:'teamCorners',         label:'Team Corners per 90',        shortLabel:'Team Corners',      icon:'📐', group:'corners', defaultAlt:2.5,  alts:[2.5,3.5,4.5,5.5],   binary:false, scope:'team',   description:'Corners earned by each team individually' },
  { key:'cards',               label:'Total Match Cards',          shortLabel:'Match Cards',       icon:'🟨', group:'cards',   defaultAlt:2.5,  alts:[2.5,3.5,4.5,5.5],   binary:false, scope:'match',  description:'Total yellow and red cards shown' },
  { key:'teamCards',           label:'Team Cards per 90',          shortLabel:'Team Cards',        icon:'🟥', group:'cards',   defaultAlt:0.5,  alts:[0.5,1.5,2.5],       binary:false, scope:'team',   description:'Cards shown to each team individually' },
  { key:'shots',               label:'Total Shots on Target',      shortLabel:'Shots on Target',   icon:'🎯', group:'shots',   defaultAlt:7.5,  alts:[3.5,5.5,7.5,9.5],   binary:false, scope:'match',  description:'Combined shots on target both teams' },
  { key:'teamShots',           label:'Team Shots on Target',       shortLabel:'Team Shots on Target', icon:'📍', group:'shots', defaultAlt:1.5,  alts:[1.5,2.5,3.5,4.5], binary:false, scope:'team', description:'Shots on target by each team' },
  { key:'firstHalfGoals',      label:'Total First Half Goals',     shortLabel:'1st Half Goals',    icon:'⏱️', group:'halves',  defaultAlt:0.5,  alts:[0.5,1.5,2.5],       binary:false, scope:'match',  description:'Goals scored before half time' },
  { key:'teamFirstHalfGoals',  label:'Team Goals in First Half',   shortLabel:'Team 1st Half',     icon:'1H', group:'halves', defaultAlt:0.5,  alts:[0.5,1.5],           binary:false, scope:'team',   description:'First half goals by each team', hiddenFromSidebar:true },
  { key:'secondHalfGoals',     label:'Total Second Half Goals',    shortLabel:'2nd Half Goals',    icon:'⏲️', group:'halves', defaultAlt:0.5,  alts:[0.5,1.5,2.5],       binary:false, scope:'match',  description:'Goals scored in the second half' },
  { key:'teamSecondHalfGoals', label:'Team Goals in Second Half',  shortLabel:'Team 2nd Half',     icon:'2H', group:'halves', defaultAlt:0.5,  alts:[0.5,1.5],           binary:false, scope:'team',   description:'Second half goals by each team', hiddenFromSidebar:true },
  { key:'goalsInBothHalves',   label:'Goals in Both Halves',       shortLabel:'Both Halves Goals', icon:'🔁', group:'halves', defaultAlt:null, alts:[null],               binary:true,  scope:'binary', description:'At least one goal in each half' },
  { key:'fouls',               label:'Total Match Fouls',          shortLabel:'Match Fouls',       icon:'🧤', group:'fouls',   defaultAlt:20.5, alts:[17.5,20.5,23.5,26.5], binary:false, scope:'match',  description:'Total fouls committed by both teams' },
  { key:'teamFouls',           label:'Team Fouls per 90',          shortLabel:'Team Fouls',        icon:'⚠️', group:'fouls',   defaultAlt:10.5, alts:[8.5,10.5,12.5],      binary:false, scope:'team',   description:'Fouls committed by each team' },
]

export function getStatDef(key) { return STATS_ORDER.find(s => s.key === key) }
export function statViewKey(key) { return 'stat:' + key }
export function viewKeyToStat(viewKey) { return viewKey?.startsWith('stat:') ? viewKey.slice(5) : null }

export const ALL_STAT_OPTIONS = STATS_ORDER

export const STAT_GROUPS = {
  goals:   { label:'Goals',   icon:'⚽', color:'#22c55e', accentBg:'rgba(34,197,94,0.08)' },
  corners: { label:'Corners', icon:'🚩', color:'#f97316', accentBg:'rgba(249,115,22,0.08)' },
  cards:   { label:'Cards',   icon:'🟨', color:'#f59e0b', accentBg:'rgba(245,158,11,0.08)' },
  shots:   { label:'Shots',   icon:'🎯', color:'#a78bfa', accentBg:'rgba(167,139,250,0.08)' },
  halves:  { label:'Halves',  icon:'⏱️', color:'#d1d5db', accentBg:'rgba(209,213,219,0.08)' },
  fouls:   { label:'Fouls',   icon:'⚠️', color:'#ef4444', accentBg:'rgba(239,68,68,0.08)' },
}

export const SIDEBAR_STAT_KEYS = ['goals', 'btts', 'corners', 'fouls', 'cards', 'teamGoals']
export const SIDEBAR_KEY_MAP = Object.fromEntries(SIDEBAR_STAT_KEYS.map(k => [k, k]))
export const COMPARE_STAT_OPTIONS = STATS_ORDER.filter(s => ['goals', 'teamGoals', 'btts', 'corners', 'teamCorners', 'cards', 'shots', 'firstHalfGoals', 'secondHalfGoals', 'fouls'].includes(s.key))
export const LAST_N_STAT_OPTIONS = STATS_ORDER

