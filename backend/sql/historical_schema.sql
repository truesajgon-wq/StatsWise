BEGIN;

CREATE TABLE IF NOT EXISTS leagues (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  country TEXT NOT NULL,
  tier SMALLINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seasons (
  id BIGSERIAL PRIMARY KEY,
  label TEXT NOT NULL UNIQUE,
  start_year SMALLINT NOT NULL,
  end_year SMALLINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_year = start_year + 1)
);

CREATE TABLE IF NOT EXISTS teams (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  normalized_name TEXT GENERATED ALWAYS AS (lower(regexp_replace(name, '\s+', ' ', 'g'))) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fixtures (
  id BIGSERIAL PRIMARY KEY,
  league_id BIGINT NOT NULL REFERENCES leagues(id),
  season_id BIGINT NOT NULL REFERENCES seasons(id),
  source_division_code TEXT NOT NULL,
  source_file TEXT NOT NULL,
  fixture_date DATE NOT NULL,
  kickoff_time TIME,
  home_team_id BIGINT NOT NULL REFERENCES teams(id),
  away_team_id BIGINT NOT NULL REFERENCES teams(id),
  home_goals_ft SMALLINT NOT NULL,
  away_goals_ft SMALLINT NOT NULL,
  result_ft CHAR(1) NOT NULL CHECK (result_ft IN ('H', 'D', 'A')),
  home_goals_ht SMALLINT,
  away_goals_ht SMALLINT,
  result_ht CHAR(1) CHECK (result_ht IN ('H', 'D', 'A')),
  referee TEXT,
  attendance INTEGER,
  status TEXT NOT NULL DEFAULT 'finished' CHECK (status IN ('finished')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (home_team_id <> away_team_id),
  UNIQUE (league_id, season_id, fixture_date, home_team_id, away_team_id)
);

CREATE TABLE IF NOT EXISTS fixture_teams (
  fixture_id BIGINT NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  team_id BIGINT NOT NULL REFERENCES teams(id),
  opponent_team_id BIGINT NOT NULL REFERENCES teams(id),
  league_id BIGINT NOT NULL REFERENCES leagues(id),
  season_id BIGINT NOT NULL REFERENCES seasons(id),
  fixture_date DATE NOT NULL,
  side CHAR(1) NOT NULL CHECK (side IN ('H', 'A')),
  goals_for SMALLINT NOT NULL,
  goals_against SMALLINT NOT NULL,
  result CHAR(1) NOT NULL CHECK (result IN ('W', 'D', 'L')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (fixture_id, side),
  UNIQUE (fixture_id, team_id)
);

CREATE TABLE IF NOT EXISTS fixture_stats (
  id BIGSERIAL PRIMARY KEY,
  fixture_id BIGINT NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  team_id BIGINT NOT NULL REFERENCES teams(id),
  side CHAR(1) NOT NULL CHECK (side IN ('H', 'A')),
  shots SMALLINT,
  shots_on_target SMALLINT,
  hit_woodwork SMALLINT,
  corners SMALLINT,
  fouls_committed SMALLINT,
  free_kicks_conceded SMALLINT,
  offsides SMALLINT,
  yellow_cards SMALLINT,
  red_cards SMALLINT,
  booking_points SMALLINT,
  extra_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fixture_id, side),
  UNIQUE (fixture_id, team_id)
);

CREATE TABLE IF NOT EXISTS players (
  id BIGSERIAL PRIMARY KEY,
  team_id BIGINT REFERENCES teams(id),
  full_name TEXT NOT NULL,
  position TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, full_name)
);

CREATE TABLE IF NOT EXISTS player_stats (
  id BIGSERIAL PRIMARY KEY,
  fixture_id BIGINT NOT NULL REFERENCES fixtures(id) ON DELETE CASCADE,
  player_id BIGINT NOT NULL REFERENCES players(id),
  team_id BIGINT REFERENCES teams(id),
  minutes_played SMALLINT,
  goals SMALLINT,
  assists SMALLINT,
  shots SMALLINT,
  shots_on_target SMALLINT,
  yellow_cards SMALLINT,
  red_cards SMALLINT,
  xg NUMERIC(8,4),
  xa NUMERIC(8,4),
  extra_stats JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (fixture_id, player_id)
);

CREATE INDEX IF NOT EXISTS idx_fixtures_date ON fixtures (fixture_date DESC);
CREATE INDEX IF NOT EXISTS idx_fixtures_league_date ON fixtures (league_id, fixture_date DESC);
CREATE INDEX IF NOT EXISTS idx_fixtures_home_team_date ON fixtures (home_team_id, fixture_date DESC);
CREATE INDEX IF NOT EXISTS idx_fixtures_away_team_date ON fixtures (away_team_id, fixture_date DESC);

CREATE INDEX IF NOT EXISTS idx_fixture_teams_team_date ON fixture_teams (team_id, fixture_date DESC);
CREATE INDEX IF NOT EXISTS idx_fixture_teams_league_date ON fixture_teams (league_id, fixture_date DESC);
CREATE INDEX IF NOT EXISTS idx_fixture_teams_h2h ON fixture_teams (team_id, opponent_team_id, fixture_date DESC);

CREATE INDEX IF NOT EXISTS idx_fixture_stats_team_id ON fixture_stats (team_id);
CREATE INDEX IF NOT EXISTS idx_players_team_id ON players (team_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_fixture_id ON player_stats (fixture_id);
CREATE INDEX IF NOT EXISTS idx_player_stats_player_id ON player_stats (player_id);

COMMIT;
