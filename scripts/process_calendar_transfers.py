"""Process committed calendar transfer jobs without importing the web app."""
import argparse
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.modules.appointments.services.calendar_transfer import drain_calendar_transfers


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true', help='Allow database and Google Calendar writes')
    parser.add_argument('--watch', action='store_true', help='Poll every 30 seconds until interrupted')
    args = parser.parse_args()
    if not args.run:
        parser.error('--run is required; apply the calendar transfer migration before starting')
    while True:
        result = drain_calendar_transfers()
        print('Calendar transfer jobs: selected={selected}, completed={completed}'.format(**result), flush=True)
        if not args.watch:
            return 0 if result['selected'] == result['completed'] else 1
        time.sleep(30)


if __name__ == '__main__':
    raise SystemExit(main())
