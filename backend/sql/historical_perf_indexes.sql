BEGIN;

CREATE INDEX IF NOT EXISTS idx_fixtures_fixture_date ON fixtures (fixture_date DESC);
CREATE INDEX IF NOT EXISTS idx_fixtures_league_id_date ON fixtures (league_id, fixture_date DESC);
CREATE INDEX IF NOT EXISTS idx_fixtures_home_team_date ON fixtures (home_team_id, fixture_date DESC);
CREATE INDEX IF NOT EXISTS idx_fixtures_away_team_date ON fixtures (away_team_id, fixture_date DESC);

CREATE INDEX IF NOT EXISTS idx_fixture_stats_fixture_side ON fixture_stats (fixture_id, side);
CREATE INDEX IF NOT EXISTS idx_fixture_teams_team_date ON fixture_teams (team_id, fixture_date DESC);
CREATE INDEX IF NOT EXISTS idx_fixture_teams_h2h ON fixture_teams (team_id, opponent_team_id, fixture_date DESC);

COMMIT;
