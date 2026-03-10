export const MATCH_PROP_STAT_OPTIONS = [
  { key: 'match_result', label: 'Match Result', isOutcome: true, defaultAlt: 0.5 },
  { key: 'total_match_goals', label: 'Total Match Goals', defaultAlt: 1.5 },
  { key: 'goals_for', label: 'Goals For', defaultAlt: 0.5 },
  { key: 'goals_against', label: 'Goals Against', defaultAlt: 0.5 },
  { key: 'first_half_goals', label: 'First Half Goals', defaultAlt: 0.5 },
  { key: 'second_half_goals', label: 'Second Half Goals', defaultAlt: 0.5 },
  { key: 'first_half_goals_for', label: 'First Half Goals For', defaultAlt: 0.5 },
  { key: 'first_half_goals_against', label: 'First Half Goals Against', defaultAlt: 0.5 },
  { key: 'goal_in_both_halves', label: 'Goal in both Halves', isBoolean: true },
  { key: 'both_teams_to_score', label: 'Both Teams to Score', isBoolean: true },
  { key: 'total_match_corners', label: 'Total Match Corners', defaultAlt: 7.5 },
  { key: 'corners_for', label: 'Corners For', defaultAlt: 2.5 },
  { key: 'corners_against', label: 'Corners Against', defaultAlt: 2.5 },
  { key: 'total_match_cards', label: 'Total Match Cards', defaultAlt: 2.5 },
  { key: 'cards_for', label: 'Cards For', defaultAlt: 0.5 },
  { key: 'cards_against', label: 'Cards Against', defaultAlt: 0.5 },
  { key: 'total_match_shots', label: 'Total Match Shots', defaultAlt: 7.5 },
  { key: 'total_shots_for', label: 'Total Shots For', defaultAlt: 1.5 },
  { key: 'total_shots_against', label: 'Total Shots Against', defaultAlt: 1.5 },
  { key: 'total_match_shots_on_target', label: 'Total Match Shots on Target', defaultAlt: 7.5 },
  { key: 'shot_on_target_for', label: 'Shot on Target For', defaultAlt: 1.5 },
  { key: 'shots_on_target_against', label: 'Shots on Target Against', defaultAlt: 1.5 },
  { key: 'total_match_offsides', label: 'Total Match Offsides', defaultAlt: 2.5 },
  { key: 'offsides_for', label: 'Offsides For', defaultAlt: 0.5 },
  { key: 'offsides_against', label: 'Offsides Against', defaultAlt: 0.5 },
  { key: 'total_match_fouls', label: 'Total Match Fouls', defaultAlt: 20.5 },
  { key: 'fouls_for', label: 'Fouls For', defaultAlt: 10.5 },
  { key: 'fouls_against', label: 'Fouls Against', defaultAlt: 10.5 },
]

export function computeMatchPropValue(match, statKey) {
  const goalsFor = Number(match?.myGoals || 0)
  const goalsAgainst = Number(match?.theirGoals || 0)
  const firstHalfGoals = Number(match?.firstHalfGoals || 0)
  const secondHalfGoals = Number(match?.secondHalfGoals || 0)
  const firstHalfGoalsFor = Number(match?.myFirstHalfGoals || 0)
  const firstHalfGoalsAgainst = Number(match?.theirFirstHalfGoals || 0)

  const cornersTotal = Number(match?.corners || 0)
  const cornersFor = Number(match?.myCorners || 0)
  const cornersAgainst = Number(match?.theirCorners || 0)

  const cardsTotal = Number(match?.cards || 0)
  const cardsFor = Number(match?.myCards || 0)
  const cardsAgainst = Number(match?.theirCards || 0)

  const shotsTotal = Number(match?.totalShots || 0)
  const shotsFor = Number(match?.myShotsTotal || 0)
  const shotsAgainst = Number(match?.theirShotsTotal || 0)

  const shotsOnTargetTotal = Number(match?.shotsOnTarget || 0)
  const shotsOnTargetFor = Number(match?.myShotsOnTarget || 0)
  const shotsOnTargetAgainst = Number(match?.theirShotsOnTarget || 0)

  const offsidesTotal = Number(match?.offsides || 0)
  const offsidesFor = Number(match?.myOffsides || 0)
  const offsidesAgainst = Number(match?.theirOffsides || 0)

  const foulsTotal = Number(match?.fouls || 0)
  const foulsFor = Number(match?.myFouls || 0)
  const foulsAgainst = Number(match?.theirFouls || 0)

  const map = {
    match_result: goalsFor > goalsAgainst ? 1 : goalsFor === goalsAgainst ? 0 : -1,
    total_match_goals: goalsFor + goalsAgainst,
    goals_for: goalsFor,
    goals_against: goalsAgainst,
    first_half_goals: firstHalfGoals,
    second_half_goals: secondHalfGoals,
    first_half_goals_for: firstHalfGoalsFor,
    first_half_goals_against: firstHalfGoalsAgainst,
    goal_in_both_halves: Number(firstHalfGoals > 0 && secondHalfGoals > 0),
    both_teams_to_score: Number(goalsFor > 0 && goalsAgainst > 0),
    total_match_corners: cornersTotal,
    corners_for: cornersFor,
    corners_against: cornersAgainst,
    total_match_cards: cardsTotal,
    cards_for: cardsFor,
    cards_against: cardsAgainst,
    total_match_shots: shotsTotal,
    total_shots_for: shotsFor,
    total_shots_against: shotsAgainst,
    total_match_shots_on_target: shotsOnTargetTotal,
    shot_on_target_for: shotsOnTargetFor,
    shots_on_target_against: shotsOnTargetAgainst,
    total_match_offsides: offsidesTotal,
    offsides_for: offsidesFor,
    offsides_against: offsidesAgainst,
    total_match_fouls: foulsTotal,
    fouls_for: foulsFor,
    fouls_against: foulsAgainst,
  }

  return Number(map[statKey] || 0)
}

export function valueLabel(value, isBoolean, isOutcome = false) {
  if (isOutcome) {
    if (value > 0) return 'Win'
    if (value < 0) return 'Loss'
    return 'Draw'
  }
  if (isBoolean) return value === 1 ? 'Yes' : 'No'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
