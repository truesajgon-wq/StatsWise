-- Billing: user subscriptions and trials
-- Persists across deploys (replaces ephemeral billing-store.json)

CREATE TABLE IF NOT EXISTS billing_users (
  key             TEXT PRIMARY KEY,           -- 'id:<userId>' or 'email:<email>'
  user_id         TEXT,
  email           TEXT,
  country         TEXT,
  plan            TEXT NOT NULL DEFAULT 'free',
  -- subscription (nullable JSON-ish columns)
  sub_provider        TEXT,
  sub_status          TEXT,
  sub_plan            TEXT,
  sub_period_end      TIMESTAMPTZ,
  sub_cancel_at_end   BOOLEAN DEFAULT false,
  -- trial
  trial_started_at    TIMESTAMPTZ,
  trial_ends_at       TIMESTAMPTZ,
  trial_used          BOOLEAN DEFAULT false,
  -- meta
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_sessions (
  session_id      TEXT PRIMARY KEY,
  data            JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS billing_processed_events (
  event_id        TEXT PRIMARY KEY,
  processed_at    TIMESTAMPTZ DEFAULT NOW()
);
