"""
Step 3: Load transformed data into PostgreSQL.

Usage:
  python -m pipeline.load

Upsert logic: updates existing rows, inserts new ones.
"""
import sys
import psycopg2
import psycopg2.extras
import pandas as pd
from pathlib import Path
from datetime import datetime
from config import DATABASE_URL, PROCESSED_DIR, SEASON_LABEL


def get_connection():
    """Get a PostgreSQL connection."""
    if not DATABASE_URL:
        print('❌  DATABASE_URL not set in .env')
        sys.exit(1)

    conn = psycopg2.connect(DATABASE_URL, sslmode='disable')
    conn.autocommit = False
    return conn


def apply_schema(conn):
    """Apply the player profiles schema if tables don't exist."""
    schema_path = Path(__file__).resolve().parent.parent / 'sql' / 'player_profiles_schema.sql'
    if not schema_path.exists():
        print(f'⚠️  Schema file not found: {schema_path}')
        return

    with open(schema_path, 'r', encoding='utf-8') as f:
        sql = f.read()

    try:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()
        print('✅ Schema applied/verified')
    except Exception as e:
        conn.rollback()
        # Likely already exists
        print(f'   Schema: {e}')


def upsert_profiles(conn, profiles_df):
    """Upsert player profiles. Returns a map of (name, squad, league) → id."""
    profile_map = {}

    with conn.cursor() as cur:
        for _, row in profiles_df.iterrows():
            name = row['name']
            squad = row['squad']
            league = row['league']

            cur.execute("""
                INSERT INTO player_profiles (name, nation, position, squad, league, age, birth_year)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT (name, squad, league)
                DO UPDATE SET
                    nation = EXCLUDED.nation,
                    position = EXCLUDED.position,
                    age = EXCLUDED.age,
                    birth_year = EXCLUDED.birth_year,
                    updated_at = NOW()
                RETURNING id
            """, (
                name,
                row.get('nation') or None,
                row.get('position') or None,
                squad,
                league,
                int(row['age']) if pd.notna(row.get('age')) and row.get('age') else None,
                int(row['birth_year']) if pd.notna(row.get('birth_year')) and row.get('birth_year') else None,
            ))
            pid = cur.fetchone()[0]
            profile_map[(name, squad, league)] = pid

    conn.commit()
    print(f'✅ Upserted {len(profile_map)} player profiles')
    return profile_map


def upsert_season_stats(conn, stats_df, profile_map):
    """Upsert player season stats."""
    inserted = 0
    updated = 0
    skipped = 0
    now = datetime.utcnow()

    with conn.cursor() as cur:
        for _, row in stats_df.iterrows():
            key = (row['player_name'], row['player_squad'], row['player_league'])
            player_id = profile_map.get(key)
            if not player_id:
                skipped += 1
                continue

            season = row.get('season', SEASON_LABEL)
            league = row.get('league', row['player_league'])

            # Build values dict
            vals = {
                'player_id': player_id,
                'season': season,
                'league': league,
                'matches_played': _int(row, 'matches_played'),
                'starts': _int(row, 'starts'),
                'minutes': _int(row, 'minutes'),
                'nineties': _float(row, 'nineties'),
                'goals': _int(row, 'goals'),
                'assists': _int(row, 'assists'),
                'goals_assists': _int(row, 'goals_assists'),
                'goals_minus_pk': _int(row, 'goals_minus_pk'),
                'penalty_goals': _int(row, 'penalty_goals'),
                'xg': _float(row, 'xg'),
                'xag': _float(row, 'xag'),
                'npxg': _float(row, 'npxg'),
                'shots_total': _int(row, 'shots_total'),
                'shots_on_target': _int(row, 'shots_on_target'),
                'key_passes': _int(row, 'key_passes'),
                'pass_completion': _float_or_none(row, 'pass_completion'),
                'progressive_passes': _int(row, 'progressive_passes'),
                'progressive_carries': _int(row, 'progressive_carries'),
                'passes_into_penalty': _int(row, 'passes_into_penalty'),
                'tackles': _int(row, 'tackles'),
                'tackles_won': _int(row, 'tackles_won'),
                'interceptions': _int(row, 'interceptions'),
                'blocks': _int(row, 'blocks'),
                'clearances': _int(row, 'clearances'),
                'recoveries': _int(row, 'recoveries'),
                'yellow_cards': _int(row, 'yellow_cards'),
                'red_cards': _int(row, 'red_cards'),
                'fouls_committed': _int(row, 'fouls_committed'),
                'fouls_drawn': _int(row, 'fouls_drawn'),
                'penalties_won': _int(row, 'penalties_won'),
                'penalties_conceded': _int(row, 'penalties_conceded'),
                'touches': _int(row, 'touches'),
                'carries': _int(row, 'carries'),
                'progressive_runs': _int(row, 'progressive_runs'),
                'miscontrols': _int(row, 'miscontrols'),
                'dispossessed': _int(row, 'dispossessed'),
                'gk_goals_against': _int_or_none(row, 'gk_goals_against'),
                'gk_saves': _int_or_none(row, 'gk_saves'),
                'gk_save_pct': _float_or_none(row, 'gk_save_pct'),
                'gk_clean_sheets': _int_or_none(row, 'gk_clean_sheets'),
                'gk_clean_sheet_pct': _float_or_none(row, 'gk_clean_sheet_pct'),
                'goals_per90': _float_or_none(row, 'goals_per90'),
                'assists_per90': _float_or_none(row, 'assists_per90'),
                'xg_per90': _float_or_none(row, 'xg_per90'),
                'xag_per90': _float_or_none(row, 'xag_per90'),
                'shots_per90': _float_or_none(row, 'shots_per90'),
                'key_passes_per90': _float_or_none(row, 'key_passes_per90'),
                'tackles_per90': _float_or_none(row, 'tackles_per90'),
                'interceptions_per90': _float_or_none(row, 'interceptions_per90'),
                'performance_score': _float_or_none(row, 'performance_score'),
                'source': 'kaggle',
                'source_updated': now,
            }

            columns = list(vals.keys())
            values = [vals[c] for c in columns]
            placeholders = ', '.join(['%s'] * len(columns))
            col_names = ', '.join(columns)

            # Build upsert SET clause (skip player_id, season, league)
            update_cols = [c for c in columns if c not in ('player_id', 'season', 'league')]
            set_clause = ', '.join([f'{c} = EXCLUDED.{c}' for c in update_cols])

            sql = f"""
                INSERT INTO player_season_stats ({col_names})
                VALUES ({placeholders})
                ON CONFLICT (player_id, season, league)
                DO UPDATE SET {set_clause}, updated_at = NOW()
            """

            cur.execute(sql, values)
            if cur.rowcount == 1:
                inserted += 1
            else:
                updated += 1

    conn.commit()
    print(f'✅ Season stats: {inserted} inserted, {updated} updated, {skipped} skipped')


def _int(row, key, default=0):
    val = row.get(key)
    try:
        if pd.isna(val):
            return default
        return int(float(val))
    except (ValueError, TypeError):
        return default


def _float(row, key, default=0.0):
    val = row.get(key)
    try:
        if pd.isna(val):
            return default
        return round(float(val), 3)
    except (ValueError, TypeError):
        return default


def _int_or_none(row, key):
    val = row.get(key)
    try:
        if val is None or pd.isna(val):
            return None
        return int(float(val))
    except (ValueError, TypeError):
        return None


def _float_or_none(row, key):
    val = row.get(key)
    try:
        if val is None or pd.isna(val):
            return None
        return round(float(val), 3)
    except (ValueError, TypeError):
        return None


def load():
    """Load processed CSV files into PostgreSQL."""
    profiles_path = PROCESSED_DIR / 'profiles.csv'
    stats_path = PROCESSED_DIR / 'season_stats.csv'

    if not profiles_path.exists() or not stats_path.exists():
        print('❌  Processed files not found. Run transform first.')
        return

    print(f'📦 Loading processed data into PostgreSQL...')
    profiles_df = pd.read_csv(profiles_path)
    stats_df = pd.read_csv(stats_path)

    conn = get_connection()
    try:
        apply_schema(conn)
        profile_map = upsert_profiles(conn, profiles_df)
        upsert_season_stats(conn, stats_df, profile_map)
    finally:
        conn.close()

    print(f'✅ Load complete!')


if __name__ == '__main__':
    load()
