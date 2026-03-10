// ─── LEAGUES ───────────────────────────────────────────────────────────────
export const LEAGUES = [
  { id: 1, name: 'Premier League',  country: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', top: true },
  { id: 2, name: 'La Liga',         country: 'Spain',   flag: '🇪🇸', top: true },
  { id: 3, name: 'Bundesliga',      country: 'Germany', flag: '🇩🇪', top: true },
  { id: 4, name: 'Serie A',         country: 'Italy',   flag: '🇮🇹', top: true },
  { id: 5, name: 'Ligue 1',         country: 'France',  flag: '🇫🇷', top: true },
  { id: 6, name: 'Ekstraklasa',     country: 'Poland',  flag: '🇵🇱', top: false },
  { id: 7, name: 'Eredivisie',      country: 'Netherlands', flag: '🇳🇱', top: false },
  { id: 8, name: 'Primeira Liga',   country: 'Portugal',flag: '🇵🇹', top: false },
]

export const TEAMS = {
  arsenal:      { name: 'Arsenal',        short: 'ARS', color: '#EF0107' },
  chelsea:      { name: 'Chelsea',        short: 'CHE', color: '#034694' },
  manutd:       { name: 'Man United',     short: 'MNU', color: '#DA291C' },
  mancity:      { name: 'Man City',       short: 'MCI', color: '#6CABDD' },
  liverpool:    { name: 'Liverpool',      short: 'LIV', color: '#C8102E' },
  tottenham:    { name: 'Tottenham',      short: 'TOT', color: '#132257' },
  westham:      { name: 'West Ham',       short: 'WHU', color: '#7A263A' },
  newcastle:    { name: 'Newcastle',      short: 'NEW', color: '#241F20' },
  barca:        { name: 'Barcelona',      short: 'BAR', color: '#A50044' },
  realmadrid:   { name: 'Real Madrid',    short: 'RMA', color: '#FEBE10' },
  atletico:     { name: 'Atlético',       short: 'ATM', color: '#CE3524' },
  sevilla:      { name: 'Sevilla',        short: 'SEV', color: '#D4AF37' },
  villarreal:   { name: 'Villarreal',     short: 'VIL', color: '#FFD700' },
  bayernmunich: { name: 'Bayern Munich',  short: 'BAY', color: '#DC052D' },
  dortmund:     { name: 'Dortmund',       short: 'BVB', color: '#FDE100' },
  leverkusen:   { name: 'Leverkusen',     short: 'LEV', color: '#E32221' },
  schalke:      { name: 'Schalke',        short: 'S04', color: '#004D9D' },
  juventus:     { name: 'Juventus',       short: 'JUV', color: '#000000' },
  milan:        { name: 'AC Milan',       short: 'MIL', color: '#FB090B' },
  inter:        { name: 'Inter Milan',    short: 'INT', color: '#010E80' },
  roma:         { name: 'AS Roma',        short: 'ROM', color: '#8B1A1A' },
  psg:          { name: 'PSG',            short: 'PSG', color: '#004170' },
  monaco:       { name: 'Monaco',         short: 'MON', color: '#CE1126' },
  lyon:         { name: 'Lyon',           short: 'LYO', color: '#1E2D78' },
  legia:        { name: 'Legia Warsaw',   short: 'LEG', color: '#006B3F' },
  lech:         { name: 'Lech Poznań',    short: 'LEC', color: '#0047AB' },
  ajax:         { name: 'Ajax',           short: 'AJX', color: '#CC0000' },
  psv:          { name: 'PSV',            short: 'PSV', color: '#CC0000' },
  benfica:      { name: 'Benfica',        short: 'BEN', color: '#CC0000' },
  porto:        { name: 'Porto',          short: 'POR', color: '#003DA5' },
}

function genHistory(teamKey) {
  const opponents = Object.keys(TEAMS).filter(k => k !== teamKey)
  return Array.from({ length: 20 }, (_, i) => {
    const opp    = opponents[i % opponents.length]
    const hg     = Math.floor(Math.random() * 4)
    const ag     = Math.floor(Math.random() * 4)
    const isHome = i % 2 === 0
    const myGoals    = isHome ? hg : ag
    const theirGoals = isHome ? ag : hg
    const result = myGoals > theirGoals ? 'W' : myGoals < theirGoals ? 'L' : 'D'
    const fhg = Math.floor(Math.random() * Math.max(1, hg + ag))
    const shg = (hg + ag) - fhg
    const d = new Date()
    d.setDate(d.getDate() - (i * 7 + Math.floor(Math.random() * 4)))
    return {
      date:            d.toISOString(),
      opponent:        TEAMS[opp].name,
      isHome,
      homeGoals:       hg,
      awayGoals:       ag,
      goals:           hg + ag,
      btts:            hg > 0 && ag > 0,
      corners:         Math.floor(Math.random() * 8) + 4,
      fouls:           Math.floor(Math.random() * 12) + 8,
      cards:           Math.floor(Math.random() * 5),
      offsides:        Math.floor(Math.random() * 6),
      shots:           Math.floor(Math.random() * 8) + 2,
      firstHalfGoals:  fhg,
      secondHalfGoals: shg,
      bothHalvesGoals: fhg > 0 && shg > 0,
      result,
      myGoals,
    }
  })
}

// Generate H2H specifically between two teams
function genH2H(homeKey, awayKey) {
  return Array.from({ length: 10 }, (_, i) => {
    const hg = Math.floor(Math.random() * 4)
    const ag = Math.floor(Math.random() * 4)
    const isHomeGame = i % 2 === 0  // alternate home/away
    const actualHome = isHomeGame ? TEAMS[homeKey] : TEAMS[awayKey]
    const actualAway = isHomeGame ? TEAMS[awayKey] : TEAMS[homeKey]
    const fhg = Math.floor(Math.random() * Math.max(1, hg + ag))
    const shg = (hg + ag) - fhg
    const d = new Date()
    d.setDate(d.getDate() - (i * 30 + Math.floor(Math.random() * 14)))
    const homeWin = hg > ag
    const awayWin = ag > hg
    return {
      date:            d.toISOString(),
      homeTeamName:    actualHome.name,
      awayTeamName:    actualAway.name,
      homeGoals:       hg,
      awayGoals:       ag,
      corners:         Math.floor(Math.random() * 8) + 6,
      fouls:           Math.floor(Math.random() * 14) + 10,
      cards:           Math.floor(Math.random() * 6),
      shots:           Math.floor(Math.random() * 10) + 4,
      offsides:        Math.floor(Math.random() * 6) + 1,
      firstHalfGoals:  fhg,
      secondHalfGoals: shg,
      btts:            hg > 0 && ag > 0,
      goals:           hg + ag,
      result:          homeWin ? 'H' : awayWin ? 'A' : 'D',
    }
  })
}

const TEMPLATES = [
  { league: 0, home: 'arsenal',      away: 'chelsea',      dayOffset: 0 },
  { league: 0, home: 'mancity',      away: 'liverpool',    dayOffset: 0 },
  { league: 0, home: 'manutd',       away: 'tottenham',    dayOffset: 0 },
  { league: 0, home: 'westham',      away: 'newcastle',    dayOffset: 1 },
  { league: 1, home: 'barca',        away: 'realmadrid',   dayOffset: 0 },
  { league: 1, home: 'atletico',     away: 'sevilla',      dayOffset: 1 },
  { league: 1, home: 'villarreal',   away: 'barca',        dayOffset: 2 },
  { league: 2, home: 'bayernmunich', away: 'dortmund',     dayOffset: 0 },
  { league: 2, home: 'leverkusen',   away: 'schalke',      dayOffset: 1 },
  { league: 3, home: 'juventus',     away: 'milan',        dayOffset: 0 },
  { league: 3, home: 'inter',        away: 'roma',         dayOffset: 1 },
  { league: 4, home: 'psg',          away: 'monaco',       dayOffset: 0 },
  { league: 4, home: 'lyon',         away: 'psg',          dayOffset: 2 },
  { league: 5, home: 'legia',        away: 'lech',         dayOffset: 1 },
  { league: 6, home: 'ajax',         away: 'psv',          dayOffset: 0 },
  { league: 7, home: 'benfica',      away: 'porto',        dayOffset: 2 },
  { league: 0, home: 'arsenal',      away: 'mancity',      dayOffset: 3 },
  { league: 1, home: 'realmadrid',   away: 'atletico',     dayOffset: 3 },
  { league: 2, home: 'dortmund',     away: 'leverkusen',   dayOffset: 3 },
  { league: 3, home: 'milan',        away: 'inter',        dayOffset: 4 },
  { league: 4, home: 'monaco',       away: 'lyon',         dayOffset: 4 },
]

const TIMES = ['13:00','14:00','15:00','15:30','16:00','17:00','18:30','19:00','20:00','20:45','21:00']

function generateFixtures() {
  const today = new Date()
  return TEMPLATES.map((t, idx) => {
    const league = LEAGUES[t.league]
    const hTeam  = TEAMS[t.home]
    const aTeam  = TEAMS[t.away]
    const d = new Date(today)
    d.setDate(d.getDate() + t.dayOffset)
    const hGoals = Math.floor(Math.random() * 4)
    const aGoals = Math.floor(Math.random() * 4)
    const status = t.dayOffset === 0 && idx < 3 ? 'FT' : t.dayOffset === 0 && idx === 3 ? 'LIVE' : 'NS'
    const isLive = status === 'LIVE'
    return {
      id:          idx + 1,
      league,
      homeTeam:    hTeam,
      awayTeam:    aTeam,
      homeTeamKey: t.home,
      awayTeamKey: t.away,
      date:        d,
      time:        TIMES[idx % TIMES.length],
      homeGoals:   isLive ? 1 : hGoals,
      awayGoals:   isLive ? 0 : aGoals,
      status,
      isLive,
      elapsed:     isLive ? 67 : null,
      homeHistory: genHistory(t.home),
      awayHistory: genHistory(t.away),
      h2h:         genH2H(t.home, t.away),
      altLines: {
        goals:           2.5,
        corners:         9.5,
        fouls:           20.5,
        cards:           3.5,
        offsides:        3.5,
        shots:           5.5,
        firstHalfGoals:  1.5,
        secondHalfGoals: 1.5,
      },
    }
  })
}

export const ALL_FIXTURES = generateFixtures()

export const STATS = [
  { key: 'matchResult',     label: 'Match Result',           type: 'result'  },
  { key: 'btts',            label: 'Both Teams To Score',    type: 'binary'  },
  { key: 'goals',           label: 'Total Match Goals',      type: 'numeric', alt: 'goals'           },
  { key: 'corners',         label: 'Total Match Corners',    type: 'numeric', alt: 'corners'         },
  { key: 'fouls',           label: 'Total Match Fouls',      type: 'numeric', alt: 'fouls'           },
  { key: 'cards',           label: 'Total Match Cards',      type: 'numeric', alt: 'cards'           },
  { key: 'teamGoalsFor',    label: 'Team Goals For',         type: 'numeric', alt: 'goals'           },
  { key: 'firstHalfGoals',  label: 'First Half Goals',       type: 'numeric', alt: 'firstHalfGoals'  },
  { key: 'secondHalfGoals', label: 'Second Half Goals',      type: 'numeric', alt: 'secondHalfGoals' },
  { key: 'bothHalvesGoals', label: 'Both Halves Goals',      type: 'binary'  },
  { key: 'shots',           label: 'Match Shots on Target',  type: 'numeric', alt: 'shots'           },
  { key: 'shotsFor',        label: 'Shots on Target For',    type: 'numeric', alt: 'shots'           },
  { key: 'offsides',        label: 'Match Offsides',         type: 'numeric', alt: 'offsides'        },
  { key: 'offsideFor',      label: 'Offsides For',           type: 'numeric', alt: 'offsides'        },
]

export function getStatValue(match, statKey, isHome) {
  switch (statKey) {
    case 'goals':           return match.goals
    case 'btts':            return match.btts
    case 'corners':         return match.corners
    case 'fouls':           return match.fouls
    case 'cards':           return match.cards
    case 'offsides':        return match.offsides
    case 'shots':           return match.shots
    case 'firstHalfGoals':  return match.firstHalfGoals
    case 'secondHalfGoals': return match.secondHalfGoals
    case 'teamGoalsFor':    return isHome ? match.homeGoals : match.awayGoals
    case 'shotsFor':        return Math.floor(match.shots / 2)
    case 'offsideFor':      return Math.floor(match.offsides / 2)
    case 'bothHalvesGoals': return match.bothHalvesGoals
    default:                return match.goals
  }
}
