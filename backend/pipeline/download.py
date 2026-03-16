"""
Step 1: Download the Kaggle dataset.

Usage:
  python -m pipeline.download

Requires:
  - Kaggle API credentials in ~/.kaggle/kaggle.json
    OR environment variables KAGGLE_USERNAME + KAGGLE_KEY
"""
import os
import sys
from pathlib import Path
from config import KAGGLE_DATASET, DOWNLOAD_DIR, KAGGLE_LIGHT_FILE

def download_dataset():
    """Download the Kaggle dataset to DOWNLOAD_DIR."""
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)

    # Check for Kaggle credentials
    kaggle_json = Path.home() / '.kaggle' / 'kaggle.json'
    has_env = os.getenv('KAGGLE_USERNAME') and os.getenv('KAGGLE_KEY')

    if not kaggle_json.exists() and not has_env:
        print('❌  Kaggle credentials not found!')
        print('    Option A: Create ~/.kaggle/kaggle.json with your API token')
        print('             (Download from https://www.kaggle.com/settings → API → Create New Token)')
        print('    Option B: Set KAGGLE_USERNAME and KAGGLE_KEY environment variables')
        sys.exit(1)

    # Import kaggle after checking credentials (it errors on import if missing)
    from kaggle.api.kaggle_api_extended import KaggleApi

    print(f'📦 Downloading dataset: {KAGGLE_DATASET}')
    print(f'   Target: {DOWNLOAD_DIR}')

    api = KaggleApi()
    api.authenticate()

    api.dataset_download_files(
        KAGGLE_DATASET,
        path=str(DOWNLOAD_DIR),
        unzip=True,
        quiet=False
    )

    # Verify the light file exists
    light_path = DOWNLOAD_DIR / KAGGLE_LIGHT_FILE
    if light_path.exists():
        size_mb = light_path.stat().st_size / (1024 * 1024)
        print(f'✅ Downloaded: {KAGGLE_LIGHT_FILE} ({size_mb:.1f} MB)')
    else:
        # Try to find any CSV
        csvs = list(DOWNLOAD_DIR.glob('*.csv'))
        if csvs:
            print(f'⚠️  Expected {KAGGLE_LIGHT_FILE} not found, but found:')
            for f in csvs:
                print(f'    - {f.name} ({f.stat().st_size / (1024*1024):.1f} MB)')
        else:
            print('❌  No CSV files found after download!')
            sys.exit(1)

    return light_path


if __name__ == '__main__':
    download_dataset()
