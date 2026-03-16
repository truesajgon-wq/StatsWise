-- ╔══════════════════════════════════════════════════════════════════════════════╗
-- ║  BetWise — Player Profiles & Season Stats Schema                           ║
-- ║  Extends the existing historical schema with Kaggle/FBref player data      ║
-- ╚══════════════════════════════════════════════════════════════════════════════╝

BEGIN;

-- ─── Player Profiles ─────────────────────────────────────────────────────────
-- Extended player info beyond the existing `players` table.
-- This stores aggregated, display-ready player data.
CREATE TABLE IF NOT EXISTS player_profiles (
  id            BIGSERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  nation        TEXT,
  position      TEXT,           -- FW, MF, DF, GK
  squad         TEXT NOT NULL,
  league        TEXT NOT NULL,  -- "Premier League", "La Liga", etc.
  age           SMALLINT,
  birth_year    SMALLINT,
  photo_url     TEXT,
  photo_local   TEXT,           -- local cached path
  -- Normalized name for dedup/matching
  name_normalized TEXT GENERATED ALWAYS AS (
    lower(regexp_replace(regexp_replace(name, '[^a-zA-Z0-9 ]', '', 'g'), '\s+', ' ', 'g'))
  ) STORED,
  squad_normalized TEXT GENERATED ALWAYS AS (
    lower(regexp_replace(regexp_replace(squad, '[^a-zA-Z0-9 ]', '', 'g'), '\s+', ' ', 'g'))
  ) STORED,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, squad, league)
);

-- ─── Player Season Stats ─────────────────────────────────────────────────────
-- One row per player per season. Updated weekly from Kaggle dataset.
CREATE TABLE IF NOT EXISTS player_season_stats (
  id              BIGSERIAL PRIMARY KEY,
  player_id       BIGINT NOT NULL REFERENCES player_profiles(id) ON DELETE CASCADE,
  season          TEXT NOT NULL,     -- "2025-2026"
  league          TEXT NOT NULL,

  -- Playing time
  matches_played  SMALLINT DEFAULT 0,
  starts          SMALLINT DEFAULT 0,
  minutes         INTEGER DEFAULT 0,
  nineties        NUMERIC(6,2) DEFAULT 0,   -- 90s played

  -- Goals & Assists
  goals           SMALLINT DEFAULT 0,
  assists         SMALLINT DEFAULT 0,
  goals_assists   SMALLINT DEFAULT 0,
  goals_minus_pk  SMALLINT DEFAULT 0,       -- non-penalty goals
  penalty_goals   SMALLINT DEFAULT 0,

  -- Expected
  xg              NUMERIC(8,2) DEFAULT 0,
  xag             NUMERIC(8,2) DEFAULT 0,
  npxg            NUMERIC(8,2) DEFAULT 0,

  -- Shooting
  shots_total     SMALLINT DEFAULT 0,
  shots_on_target SMALLINT DEFAULT 0,

  -- Passing & Creativity
  key_passes      SMALLINT DEFAULT 0,
  pass_completion NUMERIC(5,2),             -- percentage
  progressive_passes   SMALLINT DEFAULT 0,
  progressive_carries  SMALLINT DEFAULT 0,
  passes_into_penalty  SMALLINT DEFAULT 0,

  -- Defending
  tackles         SMALLINT DEFAULT 0,
  tackles_won     SMALLINT DEFAULT 0,
  interceptions   SMALLINT DEFAULT 0,
  blocks          SMALLINT DEFAULT 0,
  clearances      SMALLINT DEFAULT 0,
  recoveries      SMALLINT DEFAULT 0,

  -- Discipline
  yellow_cards    SMALLINT DEFAULT 0,
  red_cards       SMALLINT DEFAULT 0,
  fouls_committed SMALLINT DEFAULT 0,
  fouls_drawn     SMALLINT DEFAULT 0,
  penalties_won   SMALLINT DEFAULT 0,
  penalties_conceded SMALLINT DEFAULT 0,

  -- Possession
  touches         INTEGER DEFAULT 0,
  carries         INTEGER DEFAULT 0,
  progressive_runs SMALLINT DEFAULT 0,
  miscontrols     SMALLINT DEFAULT 0,
  dispossessed    SMALLINT DEFAULT 0,

  -- GK Stats (only for goalkeepers)
  gk_goals_against   SMALLINT,
  gk_saves            SMALLINT,
  gk_save_pct         NUMERIC(5,2),
  gk_clean_sheets     SMALLINT,
  gk_clean_sheet_pct  NUMERIC(5,2),

  -- Calculated per-90 stats (computed on insert/update)
  goals_per90         NUMERIC(6,3),
  assists_per90       NUMERIC(6,3),
  xg_per90            NUMERIC(6,3),
  xag_per90           NUMERIC(6,3),
  shots_per90         NUMERIC(6,3),
  key_passes_per90    NUMERIC(6,3),
  tackles_per90       NUMERIC(6,3),
  interceptions_per90 NUMERIC(6,3),

  -- BetWise performance score (0-100)
  performance_score   NUMERIC(5,2),

  -- Meta
  source          TEXT DEFAULT 'kaggle',    -- 'kaggle', 'api-football', 'manual'
  source_updated  TIMESTAMPTZ,              -- when the source data was last updated
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (player_id, season, league)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_player_profiles_squad ON player_profiles (squad);
CREATE INDEX IF NOT EXISTS idx_player_profiles_league ON player_profiles (league);
CREATE INDEX IF NOT EXISTS idx_player_profiles_position ON player_profiles (position);
CREATE INDEX IF NOT EXISTS idx_player_profiles_name_norm ON player_profiles (name_normalized);
CREATE INDEX IF NOT EXISTS idx_player_profiles_squad_norm ON player_profiles (squad_normalized);

CREATE INDEX IF NOT EXISTS idx_pss_player_id ON player_season_stats (player_id);
CREATE INDEX IF NOT EXISTS idx_pss_season ON player_season_stats (season);
CREATE INDEX IF NOT EXISTS idx_pss_league ON player_season_stats (league);
CREATE INDEX IF NOT EXISTS idx_pss_goals ON player_season_stats (goals DESC);
CREATE INDEX IF NOT EXISTS idx_pss_assists ON player_season_stats (assists DESC);
CREATE INDEX IF NOT EXISTS idx_pss_xg ON player_season_stats (xg DESC);
CREATE INDEX IF NOT EXISTS idx_pss_performance ON player_season_stats (performance_score DESC NULLS LAST);

-- ─── Trigger to auto-update updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_player_profiles_updated_at'
  ) THEN
    CREATE TRIGGER trg_player_profiles_updated_at
    BEFORE UPDATE ON player_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_pss_updated_at'
  ) THEN
    CREATE TRIGGER trg_pss_updated_at
    BEFORE UPDATE ON player_season_stats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END
$$;

COMMIT;
