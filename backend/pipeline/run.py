"""
BetWise Player Stats Pipeline — Full ETL run.

Usage:
  cd backend
  python -m pipeline.run [--skip-download] [--skip-transform] [--skip-load]

Steps:
  1. Download dataset from Kaggle
  2. Transform CSV → clean DataFrames
  3. Load into PostgreSQL (upsert)
"""
import sys
import os
import time
import argparse

# Ensure we can import sibling modules
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from download import download_dataset
from transform import transform
from load import load


def run_pipeline(skip_download=False, skip_transform=False, skip_load=False):
    start = time.time()
    print('═' * 60)
    print('  BetWise Player Stats Pipeline')
    print('═' * 60)

    # Step 1: Download
    if not skip_download:
        print('\n─── Step 1: Download from Kaggle ───')
        download_dataset()
    else:
        print('\n─── Step 1: Download SKIPPED ───')

    # Step 2: Transform
    if not skip_transform:
        print('\n─── Step 2: Transform CSV data ───')
        profiles_df, stats_df = transform()
        if profiles_df is None:
            print('❌  Transform failed. Aborting.')
            sys.exit(1)
    else:
        print('\n─── Step 2: Transform SKIPPED ───')

    # Step 3: Load
    if not skip_load:
        print('\n─── Step 3: Load into PostgreSQL ───')
        load()
    else:
        print('\n─── Step 3: Load SKIPPED ───')

    elapsed = time.time() - start
    print(f'\n{'═' * 60}')
    print(f'  Pipeline complete in {elapsed:.1f}s')
    print(f'{'═' * 60}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='BetWise Player Stats ETL Pipeline')
    parser.add_argument('--skip-download', action='store_true', help='Skip Kaggle download')
    parser.add_argument('--skip-transform', action='store_true', help='Skip CSV transformation')
    parser.add_argument('--skip-load', action='store_true', help='Skip database load')
    args = parser.parse_args()

    run_pipeline(
        skip_download=args.skip_download,
        skip_transform=args.skip_transform,
        skip_load=args.skip_load,
    )
