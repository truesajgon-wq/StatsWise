"""
Step 2: Transform raw Kaggle CSV into clean, normalized DataFrames.

Usage:
  python -m pipeline.transform

Reads from:  pipeline/data/raw/
Writes to:   pipeline/data/processed/
"""
import pandas as pd
import numpy as np
import json
from pathlib import Path
from config import (
    DOWNLOAD_DIR, PROCESSED_DIR, KAGGLE_LIGHT_FILE, KAGGLE_FULL_FILE,
    LEAGUE_MAP, POSITION_MAP, SEASON_LABEL
)


def safe_int(val, default=0):
    """Convert to int, handling NaN/None."""
    try:
        if pd.isna(val):
            return default
        return int(float(val))
    except (ValueError, TypeError):
        return default


def safe_float(val, default=0.0):
    """Convert to float, handling NaN/None."""
    try:
        if pd.isna(val):
            return default
        return round(float(val), 3)
    except (ValueError, TypeError):
        return default


def normalize_league(comp):
    """Map FBref league string to our standard name."""
    if not comp or pd.isna(comp):
        return None
    comp = str(comp).strip()
    # Try exact match
    if comp in LEAGUE_MAP:
        return LEAGUE_MAP[comp]
    # Try partial match
    for key, value in LEAGUE_MAP.items():
        if key.lower() in comp.lower() or comp.lower() in key.lower():
            return value
    return None


def normalize_position(pos):
    """Map FBref position codes to readable names."""
    if not pos or pd.isna(pos):
        return 'Unknown'
    pos = str(pos).strip()
    return POSITION_MAP.get(pos, pos)


def compute_per90(total, nineties):
    """Compute per-90 stat. Returns None if insufficient minutes."""
    if not nineties or nineties < 1.0:
        return None
    return round(total / nineties, 3)


def compute_performance_score(row):
    """
    BetWise Performance Score (0-100).

    Blended metric that rewards:
    - Goal output (goals + assists per 90)
    - Expected output (xG + xAG per 90)
    - Creative impact (key passes + progressive actions per 90)
    - Defensive work (tackles + interceptions per 90)

    Weighted by position:
    - Attackers: goals/xG weighted heavier
    - Midfielders: creativity/progressive actions weighted heavier
    - Defenders: defensive metrics weighted heavier
    - Goalkeepers: separate calculation
    """
    n90 = safe_float(row.get('nineties', 0))
    if n90 < 2.0:
        return None  # Not enough playtime

    pos = str(row.get('position', '')).lower()
    goals = safe_int(row.get('goals', 0))
    assists = safe_int(row.get('assists', 0))
    xg = safe_float(row.get('xg', 0))
    xag = safe_float(row.get('xag', 0))
    kp = safe_int(row.get('key_passes', 0))
    prog_p = safe_int(row.get('progressive_passes', 0))
    prog_c = safe_int(row.get('progressive_carries', 0))
    tackles = safe_int(row.get('tackles', 0))
    interceptions = safe_int(row.get('interceptions', 0))
    recoveries = safe_int(row.get('recoveries', 0))

    # Per 90 values
    ga90 = (goals + assists) / n90
    xga90 = (xg + xag) / n90
    creative90 = (kp + prog_p * 0.3 + prog_c * 0.3) / n90
    defensive90 = (tackles + interceptions + recoveries * 0.3) / n90

    if 'goalkeeper' in pos:
        save_pct = safe_float(row.get('gk_save_pct', 0))
        cs_pct = safe_float(row.get('gk_clean_sheet_pct', 0))
        score = min(100, (save_pct * 0.5 + cs_pct * 0.4 + defensive90 * 2) * 1.0)
        return round(max(0, score), 2)

    if 'forward' in pos:
        weights = {'goal': 0.40, 'xg': 0.25, 'creative': 0.20, 'defense': 0.15}
    elif 'midfielder' in pos:
        weights = {'goal': 0.25, 'xg': 0.20, 'creative': 0.35, 'defense': 0.20}
    elif 'defender' in pos:
        weights = {'goal': 0.10, 'xg': 0.10, 'creative': 0.25, 'defense': 0.55}
    else:
        weights = {'goal': 0.25, 'xg': 0.20, 'creative': 0.30, 'defense': 0.25}

    # Scale each component to roughly 0-100 range
    goal_score = min(100, ga90 * 60)         # 1.5 G+A/90 ≈ 90
    xg_score = min(100, xga90 * 65)          # 1.5 xG+xA/90 ≈ 97
    creative_score = min(100, creative90 * 8) # 12 creative/90 ≈ 96
    defense_score = min(100, defensive90 * 8) # 12 def/90 ≈ 96

    score = (
        goal_score * weights['goal'] +
        xg_score * weights['xg'] +
        creative_score * weights['creative'] +
        defense_score * weights['defense']
    )
    return round(max(0, min(100, score)), 2)


def find_csv():
    """Find the best CSV file to process."""
    # Prefer light file, fall back to full
    light = DOWNLOAD_DIR / KAGGLE_LIGHT_FILE
    if light.exists():
        return light

    full = DOWNLOAD_DIR / KAGGLE_FULL_FILE
    if full.exists():
        return full

    # Try any CSV
    csvs = sorted(DOWNLOAD_DIR.glob('*.csv'), key=lambda p: p.stat().st_size, reverse=True)
    if csvs:
        return csvs[0]

    return None


def transform():
    """Transform raw CSV into clean player profiles + season stats."""
    csv_path = find_csv()
    if not csv_path:
        print('❌  No CSV found in data/raw/. Run download first.')
        return None, None

    print(f'📊 Reading: {csv_path.name}')
    df = pd.read_csv(csv_path, low_memory=False)
    print(f'   {len(df)} rows, {len(df.columns)} columns')
    print(f'   Columns: {list(df.columns[:20])}...')

    # ─── Normalize league names ───────────────────────────────────────────
    if 'Comp' in df.columns:
        df['league'] = df['Comp'].apply(normalize_league)
    elif 'comp' in df.columns:
        df['league'] = df['comp'].apply(normalize_league)
    else:
        print('❌  No "Comp" column found. Available columns:', list(df.columns))
        return None, None

    # Filter to known leagues only
    df = df[df['league'].notna()].copy()
    print(f'   {len(df)} players in top 5 leagues')

    # ─── Detect column names (FBref naming varies) ────────────────────────
    def col(candidates, default=None):
        """Find first matching column name."""
        for c in candidates:
            if c in df.columns:
                return c
            # Try case-insensitive
            for actual in df.columns:
                if actual.lower() == c.lower():
                    return actual
        return default

    c_player = col(['Player', 'player'])
    c_nation = col(['Nation', 'nation'])
    c_pos = col(['Pos', 'pos'])
    c_squad = col(['Squad', 'squad'])
    c_age = col(['Age', 'age'])
    c_born = col(['Born', 'born'])
    c_mp = col(['MP', 'mp', 'matches_played'])
    c_starts = col(['Starts', 'starts'])
    c_min = col(['Min', 'min', 'minutes'])
    c_90s = col(['90s', 'nineties'])
    c_gls = col(['Gls', 'gls', 'goals'])
    c_ast = col(['Ast', 'ast', 'assists'])
    c_ga = col(['G+A', 'g+a', 'goals_assists'])
    c_gpk = col(['G-PK', 'g-pk', 'goals_minus_pk'])
    c_xg = col(['xG', 'xg'])
    c_xag = col(['xAG', 'xag'])
    c_npxg = col(['npxG', 'npxg'])
    c_tkl = col(['Tkl', 'tkl', 'tackles'])
    c_tklw = col(['TklW', 'tklw', 'tackles_won'])
    c_int = col(['Int', 'int', 'interceptions'])
    c_blocks = col(['Blocks', 'blocks'])
    c_clr = col(['Clr', 'clr', 'clearances'])
    c_recov = col(['Recov', 'recov', 'recoveries'])
    c_crdy = col(['CrdY', 'crdy', 'yellow_cards'])
    c_crdr = col(['CrdR', 'crdr', 'red_cards'])
    c_kp = col(['KP', 'kp', 'key_passes'])
    c_prgp = col(['PrgP', 'prgp', 'progressive_passes'])
    c_prgc = col(['PrgC', 'prgc', 'progressive_carries'])
    c_touches = col(['Touches', 'touches'])
    c_carries = col(['Carries', 'carries'])
    c_prgr = col(['PrgR', 'prgr', 'progressive_runs'])
    c_mis = col(['Mis', 'mis', 'miscontrols'])
    c_dis = col(['Dis', 'dis', 'dispossessed'])
    c_ppa = col(['PPA', 'ppa', 'passes_into_penalty'])
    c_pkwon = col(['PKwon', 'pkwon', 'penalties_won'])
    c_pkcon = col(['PKcon', 'pkcon', 'penalties_conceded'])
    c_fls = col(['Fls', 'fls', 'fouls_committed'])
    c_fld = col(['Fld', 'fld', 'fouls_drawn'])
    c_cmp_pct = col(['Cmp%', 'cmp%', 'Cmp%_stats_passing', 'pass_completion'])

    # Shooting columns (may be prefixed)
    c_sh = col(['Sh', 'sh', 'shots', 'Sh_stats_shooting'])
    c_sot = col(['SoT', 'sot', 'shots_on_target', 'SoT_stats_shooting'])

    # GK columns
    c_ga_gk = col(['GA', 'ga', 'goals_against'])
    c_saves = col(['Saves', 'saves'])
    c_save_pct = col(['Save%', 'save%', 'save_pct'])
    c_cs = col(['CS', 'cs', 'clean_sheets'])
    c_cs_pct = col(['CS%', 'cs%', 'clean_sheet_pct'])

    if not c_player or not c_squad:
        print('❌  Cannot find Player/Squad columns. Available:', list(df.columns))
        return None, None

    print(f'   Key columns mapped: Player={c_player}, Squad={c_squad}, Goals={c_gls}, xG={c_xg}')

    # ─── Build profiles ──────────────────────────────────────────────────
    profiles = []
    stats_rows = []

    for _, row in df.iterrows():
        name = str(row.get(c_player, '')).strip()
        if not name:
            continue

        squad = str(row.get(c_squad, '')).strip()
        league = row['league']
        nation = str(row.get(c_nation, '')).strip() if c_nation else ''
        # Clean nation (FBref uses codes like "eng ENG" or "ENG")
        if nation and ' ' in nation:
            nation = nation.split()[-1]

        pos_raw = str(row.get(c_pos, '')).strip() if c_pos else ''
        position = normalize_position(pos_raw)

        age = safe_int(row.get(c_age)) if c_age else None
        birth_year = safe_int(row.get(c_born)) if c_born else None

        profile = {
            'name': name,
            'nation': nation or None,
            'position': position,
            'squad': squad,
            'league': league,
            'age': age if age and age > 0 else None,
            'birth_year': birth_year if birth_year and birth_year > 1970 else None,
        }
        profiles.append(profile)

        # ─── Season stats for this player ──────────────────────────────
        nineties = safe_float(row.get(c_90s)) if c_90s else 0
        goals = safe_int(row.get(c_gls)) if c_gls else 0
        assists = safe_int(row.get(c_ast)) if c_ast else 0
        xg = safe_float(row.get(c_xg)) if c_xg else 0
        xag = safe_float(row.get(c_xag)) if c_xag else 0
        tackles = safe_int(row.get(c_tkl)) if c_tkl else 0
        interceptions = safe_int(row.get(c_int)) if c_int else 0
        key_passes = safe_int(row.get(c_kp)) if c_kp else 0
        shots_total = safe_int(row.get(c_sh)) if c_sh else 0

        stat = {
            'player_name': name,
            'player_squad': squad,
            'player_league': league,
            'season': SEASON_LABEL,
            'league': league,
            'matches_played': safe_int(row.get(c_mp)) if c_mp else 0,
            'starts': safe_int(row.get(c_starts)) if c_starts else 0,
            'minutes': safe_int(row.get(c_min)) if c_min else 0,
            'nineties': nineties,
            'goals': goals,
            'assists': assists,
            'goals_assists': safe_int(row.get(c_ga)) if c_ga else goals + assists,
            'goals_minus_pk': safe_int(row.get(c_gpk)) if c_gpk else 0,
            'penalty_goals': max(0, goals - (safe_int(row.get(c_gpk)) if c_gpk else goals)),
            'xg': xg,
            'xag': xag,
            'npxg': safe_float(row.get(c_npxg)) if c_npxg else 0,
            'shots_total': shots_total,
            'shots_on_target': safe_int(row.get(c_sot)) if c_sot else 0,
            'key_passes': key_passes,
            'pass_completion': safe_float(row.get(c_cmp_pct)) if c_cmp_pct else None,
            'progressive_passes': safe_int(row.get(c_prgp)) if c_prgp else 0,
            'progressive_carries': safe_int(row.get(c_prgc)) if c_prgc else 0,
            'passes_into_penalty': safe_int(row.get(c_ppa)) if c_ppa else 0,
            'tackles': tackles,
            'tackles_won': safe_int(row.get(c_tklw)) if c_tklw else 0,
            'interceptions': interceptions,
            'blocks': safe_int(row.get(c_blocks)) if c_blocks else 0,
            'clearances': safe_int(row.get(c_clr)) if c_clr else 0,
            'recoveries': safe_int(row.get(c_recov)) if c_recov else 0,
            'yellow_cards': safe_int(row.get(c_crdy)) if c_crdy else 0,
            'red_cards': safe_int(row.get(c_crdr)) if c_crdr else 0,
            'fouls_committed': safe_int(row.get(c_fls)) if c_fls else 0,
            'fouls_drawn': safe_int(row.get(c_fld)) if c_fld else 0,
            'penalties_won': safe_int(row.get(c_pkwon)) if c_pkwon else 0,
            'penalties_conceded': safe_int(row.get(c_pkcon)) if c_pkcon else 0,
            'touches': safe_int(row.get(c_touches)) if c_touches else 0,
            'carries': safe_int(row.get(c_carries)) if c_carries else 0,
            'progressive_runs': safe_int(row.get(c_prgr)) if c_prgr else 0,
            'miscontrols': safe_int(row.get(c_mis)) if c_mis else 0,
            'dispossessed': safe_int(row.get(c_dis)) if c_dis else 0,
            'gk_goals_against': safe_int(row.get(c_ga_gk)) if c_ga_gk and 'goalkeeper' in position.lower() else None,
            'gk_saves': safe_int(row.get(c_saves)) if c_saves and 'goalkeeper' in position.lower() else None,
            'gk_save_pct': safe_float(row.get(c_save_pct)) if c_save_pct and 'goalkeeper' in position.lower() else None,
            'gk_clean_sheets': safe_int(row.get(c_cs)) if c_cs and 'goalkeeper' in position.lower() else None,
            'gk_clean_sheet_pct': safe_float(row.get(c_cs_pct)) if c_cs_pct and 'goalkeeper' in position.lower() else None,
            'position': position,  # for performance score calc
        }

        # Computed per-90 stats
        stat['goals_per90'] = compute_per90(goals, nineties)
        stat['assists_per90'] = compute_per90(assists, nineties)
        stat['xg_per90'] = compute_per90(xg, nineties)
        stat['xag_per90'] = compute_per90(xag, nineties)
        stat['shots_per90'] = compute_per90(shots_total, nineties)
        stat['key_passes_per90'] = compute_per90(key_passes, nineties)
        stat['tackles_per90'] = compute_per90(tackles, nineties)
        stat['interceptions_per90'] = compute_per90(interceptions, nineties)

        # Performance score
        stat['performance_score'] = compute_performance_score(stat)

        stats_rows.append(stat)

    profiles_df = pd.DataFrame(profiles)
    stats_df = pd.DataFrame(stats_rows)

    # Deduplicate (same player may appear multiple times)
    profiles_df = profiles_df.drop_duplicates(subset=['name', 'squad', 'league'])
    stats_df = stats_df.drop_duplicates(subset=['player_name', 'player_squad', 'player_league', 'season'])

    # Save processed data
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)
    profiles_df.to_csv(PROCESSED_DIR / 'profiles.csv', index=False)
    stats_df.to_csv(PROCESSED_DIR / 'season_stats.csv', index=False)

    print(f'✅ Transformed: {len(profiles_df)} player profiles, {len(stats_df)} stat rows')
    print(f'   Leagues: {profiles_df["league"].value_counts().to_dict()}')
    print(f'   Saved to: {PROCESSED_DIR}')

    return profiles_df, stats_df


if __name__ == '__main__':
    transform()
