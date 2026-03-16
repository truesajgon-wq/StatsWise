"""
Seed test data — inserts 50 realistic players into the database for testing.
No Kaggle download needed. Run this to test the full stack immediately.

Usage:
  cd backend
  python pipeline/seed_test_data.py
"""
import sys
import os
import random
from datetime import datetime

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from config import DATABASE_URL, SEASON_LABEL
import psycopg2

# Realistic player data for top 5 leagues
PLAYERS = [
    # Premier League
    ('Erling Haaland', 'NO', 'Forward', 'Manchester City', 'Premier League', 24),
    ('Mohamed Salah', 'EG', 'Forward', 'Liverpool', 'Premier League', 32),
    ('Bukayo Saka', 'EN', 'Forward', 'Arsenal', 'Premier League', 22),
    ('Cole Palmer', 'EN', 'Midfielder', 'Chelsea', 'Premier League', 22),
    ('Bruno Fernandes', 'PT', 'Midfielder', 'Manchester Utd', 'Premier League', 31),
    ('Alexander Isak', 'SE', 'Forward', 'Newcastle Utd', 'Premier League', 25),
    ('Son Heung-min', 'KR', 'Forward', 'Tottenham', 'Premier League', 32),
    ('Ollie Watkins', 'EN', 'Forward', 'Aston Villa', 'Premier League', 28),
    ('Virgil van Dijk', 'NL', 'Defender', 'Liverpool', 'Premier League', 33),
    ('Martin Odegaard', 'NO', 'Midfielder', 'Arsenal', 'Premier League', 25),
    # La Liga
    ('Robert Lewandowski', 'PL', 'Forward', 'Barcelona', 'La Liga', 36),
    ('Vinicius Junior', 'BR', 'Forward', 'Real Madrid', 'La Liga', 24),
    ('Jude Bellingham', 'EN', 'Midfielder', 'Real Madrid', 'La Liga', 21),
    ('Lamine Yamal', 'ES', 'Forward', 'Barcelona', 'La Liga', 17),
    ('Antoine Griezmann', 'FR', 'Forward', 'Atletico Madrid', 'La Liga', 33),
    ('Pedri', 'ES', 'Midfielder', 'Barcelona', 'La Liga', 22),
    ('Federico Valverde', 'UY', 'Midfielder', 'Real Madrid', 'La Liga', 26),
    ('Raphinha', 'BR', 'Forward', 'Barcelona', 'La Liga', 28),
    ('Alexander Sorloth', 'NO', 'Forward', 'Atletico Madrid', 'La Liga', 29),
    ('Dani Carvajal', 'ES', 'Defender', 'Real Madrid', 'La Liga', 33),
    # Bundesliga
    ('Harry Kane', 'EN', 'Forward', 'Bayern Munich', 'Bundesliga', 31),
    ('Florian Wirtz', 'DE', 'Midfielder', 'Bayer Leverkusen', 'Bundesliga', 21),
    ('Jamal Musiala', 'DE', 'Midfielder', 'Bayern Munich', 'Bundesliga', 21),
    ('Serhou Guirassy', 'GN', 'Forward', 'Borussia Dortmund', 'Bundesliga', 28),
    ('Xavi Simons', 'NL', 'Midfielder', 'RB Leipzig', 'Bundesliga', 21),
    ('Leroy Sane', 'DE', 'Forward', 'Bayern Munich', 'Bundesliga', 28),
    ('Granit Xhaka', 'CH', 'Midfielder', 'Bayer Leverkusen', 'Bundesliga', 32),
    ('Jonathan Tah', 'DE', 'Defender', 'Bayer Leverkusen', 'Bundesliga', 28),
    ('Tim Kleindienst', 'DE', 'Forward', 'Borussia Mgladbach', 'Bundesliga', 29),
    ('Loïs Openda', 'BE', 'Forward', 'RB Leipzig', 'Bundesliga', 25),
    # Serie A
    ('Lautaro Martinez', 'AR', 'Forward', 'Inter', 'Serie A', 27),
    ('Victor Osimhen', 'NG', 'Forward', 'Napoli', 'Serie A', 25),
    ('Dusan Vlahovic', 'RS', 'Forward', 'Juventus', 'Serie A', 24),
    ('Rafael Leao', 'PT', 'Forward', 'AC Milan', 'Serie A', 25),
    ('Paulo Dybala', 'AR', 'Forward', 'Roma', 'Serie A', 31),
    ('Hakan Calhanoglu', 'TR', 'Midfielder', 'Inter', 'Serie A', 30),
    ('Nicolo Barella', 'IT', 'Midfielder', 'Inter', 'Serie A', 27),
    ('Federico Chiesa', 'IT', 'Forward', 'Roma', 'Serie A', 27),
    ('Khvicha Kvaratskhelia', 'GE', 'Forward', 'Napoli', 'Serie A', 23),
    ('Alessandro Bastoni', 'IT', 'Defender', 'Inter', 'Serie A', 25),
    # Ligue 1
    ('Kylian Mbappe', 'FR', 'Forward', 'PSG', 'Ligue 1', 26),
    ('Ousmane Dembele', 'FR', 'Forward', 'PSG', 'Ligue 1', 27),
    ('Bradley Barcola', 'FR', 'Forward', 'PSG', 'Ligue 1', 22),
    ('Jonathan David', 'CA', 'Forward', 'Lille', 'Ligue 1', 25),
    ('Alexandre Lacazette', 'FR', 'Forward', 'Lyon', 'Ligue 1', 33),
    ('Amine Harit', 'MA', 'Midfielder', 'Marseille', 'Ligue 1', 27),
    ('Goncalo Ramos', 'PT', 'Forward', 'PSG', 'Ligue 1', 23),
    ('Achraf Hakimi', 'MA', 'Defender', 'PSG', 'Ligue 1', 26),
    ('Vitinha', 'PT', 'Midfielder', 'PSG', 'Ligue 1', 24),
    ('Pierre-Emerick Aubameyang', 'GA', 'Forward', 'Marseille', 'Ligue 1', 35),
]


def generate_stats(pos):
    """Generate realistic season stats based on position."""
    is_fw = pos == 'Forward'
    is_mf = pos == 'Midfielder'
    is_df = pos == 'Defender'

    mp = random.randint(18, 30)
    starts = random.randint(max(10, mp - 8), mp)
    minutes = starts * random.randint(75, 90) + (mp - starts) * random.randint(10, 30)
    n90 = round(minutes / 90, 2)

    goals = random.randint(8, 22) if is_fw else random.randint(3, 10) if is_mf else random.randint(0, 4)
    assists = random.randint(2, 10) if is_fw else random.randint(4, 14) if is_mf else random.randint(1, 5)
    xg = round(goals * random.uniform(0.7, 1.2), 2)
    xag = round(assists * random.uniform(0.6, 1.1), 2)
    npxg = round(xg * random.uniform(0.75, 0.95), 2)

    shots = random.randint(30, 80) if is_fw else random.randint(15, 45) if is_mf else random.randint(5, 20)
    sot = int(shots * random.uniform(0.3, 0.5))
    kp = random.randint(10, 40) if is_mf else random.randint(5, 25)
    prog_p = random.randint(30, 120) if is_mf else random.randint(15, 60)
    prog_c = random.randint(20, 80) if is_fw else random.randint(15, 60)

    tackles = random.randint(5, 25) if is_fw else random.randint(20, 60) if is_mf else random.randint(40, 90)
    tackles_won = int(tackles * random.uniform(0.5, 0.75))
    interceptions = random.randint(5, 20) if is_fw else random.randint(10, 35) if is_mf else random.randint(20, 50)
    blocks = random.randint(2, 10) if is_fw else random.randint(5, 20) if is_mf else random.randint(10, 35)
    recoveries = random.randint(20, 60) if is_df else random.randint(15, 45)

    yellow = random.randint(1, 8)
    red = 1 if random.random() < 0.1 else 0

    touches = random.randint(600, 1800)
    carries = random.randint(200, 800)

    # Per 90
    g90 = round(goals / max(n90, 1), 3)
    a90 = round(assists / max(n90, 1), 3)
    xg90 = round(xg / max(n90, 1), 3)
    xag90 = round(xag / max(n90, 1), 3)
    sh90 = round(shots / max(n90, 1), 3)
    kp90 = round(kp / max(n90, 1), 3)
    tkl90 = round(tackles / max(n90, 1), 3)
    int90 = round(interceptions / max(n90, 1), 3)

    # Performance score
    ga_rate = (goals + assists) / max(n90, 1)
    creative_rate = (kp + prog_p * 0.3 + prog_c * 0.3) / max(n90, 1)
    def_rate = (tackles + interceptions + recoveries * 0.3) / max(n90, 1)

    if is_fw:
        score = min(100, ga_rate * 24 + creative_rate * 1.6 + def_rate * 1.2)
    elif is_mf:
        score = min(100, ga_rate * 15 + creative_rate * 2.8 + def_rate * 1.6)
    else:
        score = min(100, ga_rate * 6 + creative_rate * 2.0 + def_rate * 4.4)

    return {
        'matches_played': mp, 'starts': starts, 'minutes': minutes, 'nineties': n90,
        'goals': goals, 'assists': assists, 'goals_assists': goals + assists,
        'goals_minus_pk': max(0, goals - random.randint(0, min(3, goals))),
        'penalty_goals': random.randint(0, min(3, goals)),
        'xg': xg, 'xag': xag, 'npxg': npxg,
        'shots_total': shots, 'shots_on_target': sot,
        'key_passes': kp, 'pass_completion': round(random.uniform(72, 92), 1),
        'progressive_passes': prog_p, 'progressive_carries': prog_c,
        'passes_into_penalty': random.randint(3, 25),
        'tackles': tackles, 'tackles_won': tackles_won,
        'interceptions': interceptions, 'blocks': blocks,
        'clearances': random.randint(5, 50) if is_df else random.randint(1, 15),
        'recoveries': recoveries,
        'yellow_cards': yellow, 'red_cards': red,
        'fouls_committed': random.randint(10, 40), 'fouls_drawn': random.randint(8, 35),
        'penalties_won': random.randint(0, 3), 'penalties_conceded': random.randint(0, 2),
        'touches': touches, 'carries': carries,
        'progressive_runs': random.randint(10, 50),
        'miscontrols': random.randint(10, 40), 'dispossessed': random.randint(5, 25),
        'goals_per90': g90, 'assists_per90': a90,
        'xg_per90': xg90, 'xag_per90': xag90,
        'shots_per90': sh90, 'key_passes_per90': kp90,
        'tackles_per90': tkl90, 'interceptions_per90': int90,
        'performance_score': round(max(0, min(100, score)), 2),
    }


def seed():
    conn = psycopg2.connect(DATABASE_URL, sslmode='disable')
    now = datetime.utcnow()

    try:
        with conn.cursor() as cur:
            for (name, nation, pos, squad, league, age) in PLAYERS:
                # Upsert profile
                cur.execute("""
                    INSERT INTO player_profiles (name, nation, position, squad, league, age, birth_year)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (name, squad, league)
                    DO UPDATE SET nation=EXCLUDED.nation, position=EXCLUDED.position, age=EXCLUDED.age, updated_at=NOW()
                    RETURNING id
                """, (name, nation, pos, squad, league, age, 2026 - age))
                pid = cur.fetchone()[0]

                # Generate and insert stats
                stats = generate_stats(pos)
                stat_cols = list(stats.keys())
                vals = [stats[c] for c in stat_cols]

                all_cols = ['player_id', 'season', 'league', 'source', 'source_updated'] + stat_cols
                all_vals = [pid, SEASON_LABEL, league, 'test-seed', now] + vals
                placeholders = ', '.join(['%s'] * len(all_vals))
                col_str = ', '.join(all_cols)
                update_parts = ', '.join([f'{c}=EXCLUDED.{c}' for c in stat_cols + ['source', 'source_updated']])

                cur.execute(f"""
                    INSERT INTO player_season_stats ({col_str})
                    VALUES ({placeholders})
                    ON CONFLICT (player_id, season, league)
                    DO UPDATE SET {update_parts}, updated_at=NOW()
                """, all_vals)

        conn.commit()
        print(f'Seeded {len(PLAYERS)} players with season stats')
    finally:
        conn.close()


if __name__ == '__main__':
    seed()
