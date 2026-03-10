# Historical Data Import Runbook

## 1) Prerequisites
- PostgreSQL database available via `DATABASE_URL`.
- Historical ZIP extracted so you have a folder like:
  - `C:\Users\Anetka\Downloads\Historical Matches\2017-2018\...csv`
  - `C:\Users\Anetka\Downloads\notes.txt`
- Backend dependencies installed:
  - `cd backend`
  - `npm install`

## 2) Create Schema
Run:

```bash
psql "$DATABASE_URL" -f sql/historical_schema.sql
```

## 3) Import Historical CSV Files
Run:

```bash
npm run import:historical -- "C:\Users\Anetka\Downloads\Historical Matches"
```

Or set env and run:

```bash
set HISTORICAL_DATA_DIR=C:\Users\Anetka\Downloads\Historical Matches
npm run import:historical
```

## 4) Safety Rules Enforced by Importer
- Imports only finished matches (`FTHG`, `FTAG`, `FTR` must be present).
- Skips future/live rows (fixture date in the future).
- Removes betting odds columns dynamically and never persists them.
- Uses UPSERT logic and unique keys to avoid duplicate records.
- Imports 2025-2026 season rows only when they are already finished.

## 5) Post-Import Validation
```sql
SELECT COUNT(*) AS fixture_count FROM fixtures;
SELECT COUNT(*) AS fixture_stats_count FROM fixture_stats;
SELECT MIN(fixture_date), MAX(fixture_date) FROM fixtures;
SELECT season_id, COUNT(*) FROM fixtures GROUP BY season_id ORDER BY season_id;
```

## 6) Performance Notes
- Existing indexes support:
  - last N matches by team/date (`fixture_teams(team_id, fixture_date DESC)`),
  - league/date filtering (`fixtures(league_id, fixture_date DESC)`),
  - H2H (`fixture_teams(team_id, opponent_team_id, fixture_date DESC)`).
- For very large growth, partition `fixtures` by season or date range.
- Run `VACUUM (ANALYZE)` after large imports.
