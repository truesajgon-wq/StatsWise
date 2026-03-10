// ─── Mock player data for demo mode ──────────────────────────────────────────
// When API key not configured, this provides sample players for testing

export const MOCK_PLAYERS = [
  {
    id: 1, name: 'Erling Haaland', team: 'Man City', teamId: 4,
    photo: null, position: 'Forward', nationality: 'Norway', age: 23,
    stats: { goals: 27, assists: 5, shots: 89, shotsOnTarget: 52, foulsCommitted: 18, foulsDrawn: 41, offsides: 31, yellowCards: 1, redCards: 0, rating: 7.92 }
  },
  {
    id: 2, name: 'Mohamed Salah', team: 'Liverpool', teamId: 5,
    photo: null, position: 'Forward', nationality: 'Egypt', age: 31,
    stats: { goals: 19, assists: 12, shots: 76, shotsOnTarget: 44, foulsCommitted: 14, foulsDrawn: 35, offsides: 8, yellowCards: 0, redCards: 0, rating: 7.71 }
  },
  {
    id: 3, name: 'Bukayo Saka', team: 'Arsenal', teamId: 1,
    photo: null, position: 'Midfielder', nationality: 'England', age: 22,
    stats: { goals: 14, assists: 9, shots: 68, shotsOnTarget: 31, foulsCommitted: 22, foulsDrawn: 55, offsides: 4, yellowCards: 2, redCards: 0, rating: 7.58 }
  },
  {
    id: 4, name: 'Vinicius Jr', team: 'Real Madrid', teamId: 4,
    photo: null, position: 'Forward', nationality: 'Brazil', age: 23,
    stats: { goals: 21, assists: 8, shots: 94, shotsOnTarget: 41, foulsCommitted: 28, foulsDrawn: 72, offsides: 14, yellowCards: 5, redCards: 0, rating: 7.84 }
  },
  {
    id: 5, name: 'Kylian Mbappé', team: 'Real Madrid', teamId: 4,
    photo: null, position: 'Forward', nationality: 'France', age: 25,
    stats: { goals: 24, assists: 7, shots: 101, shotsOnTarget: 58, foulsCommitted: 16, foulsDrawn: 38, offsides: 22, yellowCards: 1, redCards: 0, rating: 7.88 }
  },
  {
    id: 6, name: 'Rodri', team: 'Man City', teamId: 4,
    photo: null, position: 'Midfielder', nationality: 'Spain', age: 27,
    stats: { goals: 8, assists: 6, shots: 42, shotsOnTarget: 18, foulsCommitted: 45, foulsDrawn: 28, offsides: 1, yellowCards: 8, redCards: 0, rating: 7.77 }
  },
  {
    id: 7, name: 'Trent Alexander-Arnold', team: 'Liverpool', teamId: 5,
    photo: null, position: 'Defender', nationality: 'England', age: 25,
    stats: { goals: 3, assists: 14, shots: 28, shotsOnTarget: 12, foulsCommitted: 19, foulsDrawn: 22, offsides: 1, yellowCards: 3, redCards: 0, rating: 7.44 }
  },
  {
    id: 8, name: 'Harry Kane', team: 'Bayern Munich', teamId: 8,
    photo: null, position: 'Forward', nationality: 'England', age: 30,
    stats: { goals: 33, assists: 10, shots: 110, shotsOnTarget: 64, foulsCommitted: 21, foulsDrawn: 44, offsides: 12, yellowCards: 2, redCards: 0, rating: 8.01 }
  },
  {
    id: 9, name: 'Lionel Messi', team: 'Inter Miami', teamId: 99,
    photo: null, position: 'Forward', nationality: 'Argentina', age: 36,
    stats: { goals: 11, assists: 16, shots: 58, shotsOnTarget: 32, foulsCommitted: 9, foulsDrawn: 41, offsides: 3, yellowCards: 1, redCards: 0, rating: 7.62 }
  },
  {
    id: 10, name: 'Pedri', team: 'Barcelona', teamId: 3,
    photo: null, position: 'Midfielder', nationality: 'Spain', age: 21,
    stats: { goals: 6, assists: 9, shots: 44, shotsOnTarget: 19, foulsCommitted: 28, foulsDrawn: 34, offsides: 2, yellowCards: 7, redCards: 0, rating: 7.45 }
  },
]

export function searchPlayers(query) {
  if (!query || query.length < 2) return MOCK_PLAYERS
  const q = query.toLowerCase()
  return MOCK_PLAYERS.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.team.toLowerCase().includes(q) ||
    p.nationality.toLowerCase().includes(q)
  )
}
