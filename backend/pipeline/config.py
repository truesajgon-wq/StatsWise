"""
Pipeline configuration — reads from backend/.env
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from backend directory
BACKEND_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BACKEND_DIR / '.env')

# ─── Database ─────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv('DATABASE_URL', '')

# ─── Kaggle ───────────────────────────────────────────────────────────────────
# The dataset we pull from (current season)
KAGGLE_DATASET = 'hubertsidorowicz/football-players-stats-2025-2026'
KAGGLE_LIGHT_FILE = 'players_data_light-2025_2026.csv'
KAGGLE_FULL_FILE = 'players_data-2025_2026.csv'
SEASON_LABEL = '2025-2026'

# ─── Paths ────────────────────────────────────────────────────────────────────
PIPELINE_DIR = Path(__file__).resolve().parent
DATA_DIR = PIPELINE_DIR / 'data'
DOWNLOAD_DIR = DATA_DIR / 'raw'
PROCESSED_DIR = DATA_DIR / 'processed'
PHOTO_DIR = BACKEND_DIR / 'public' / 'player-photos'

# ─── Leagues we care about ────────────────────────────────────────────────────
LEAGUE_MAP = {
    'eng Premier League': 'Premier League',
    'es La Liga': 'La Liga',
    'de Bundesliga': 'Bundesliga',
    'it Serie A': 'Serie A',
    'fr Ligue 1': 'Ligue 1',
    # Fallback patterns
    'Premier League': 'Premier League',
    'La Liga': 'La Liga',
    'Bundesliga': 'Bundesliga',
    'Serie A': 'Serie A',
    'Ligue 1': 'Ligue 1',
}

# ─── Position mapping ─────────────────────────────────────────────────────────
POSITION_MAP = {
    'FW': 'Forward',
    'MF': 'Midfielder',
    'DF': 'Defender',
    'GK': 'Goalkeeper',
    'FW,MF': 'Forward',
    'MF,FW': 'Midfielder',
    'DF,MF': 'Defender',
    'MF,DF': 'Midfielder',
    'FW,DF': 'Forward',
    'DF,FW': 'Defender',
}
