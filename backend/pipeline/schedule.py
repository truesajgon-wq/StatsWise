"""
Weekly scheduler — refreshes player stats every Monday at 06:00 UTC.

Usage:
  python -m pipeline.schedule

Or run as a background service / cron job:
  # Linux crontab (every Monday 6am):
  0 6 * * 1 cd /path/to/backend && python -m pipeline.run

  # Windows Task Scheduler: run pipeline.run weekly
"""
import sys
import os
import time
import schedule

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from run import run_pipeline


def weekly_update():
    print(f'\n🔄 Weekly update triggered at {time.strftime("%Y-%m-%d %H:%M:%S")}')
    try:
        run_pipeline()
    except Exception as e:
        print(f'❌ Pipeline error: {e}')


if __name__ == '__main__':
    print('📅 BetWise Weekly Scheduler')
    print('   Runs every Monday at 06:00 UTC')
    print('   Press Ctrl+C to stop\n')

    # Schedule for Monday at 06:00
    schedule.every().monday.at('06:00').do(weekly_update)

    # Also run once immediately on start
    print('   Running initial sync...')
    weekly_update()

    # Keep running
    while True:
        schedule.run_pending()
        time.sleep(60)
