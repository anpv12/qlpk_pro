"""Report Google Calendar mappings whose owner has no active connection (read-only by default).

These mappings cannot be updated or removed on Google while the owner is disconnected.
They are kept on purpose: if the owner reconnects the same Google account, manual sync
verifies the stored event ID and reuses it instead of creating a duplicate.

--purge-past --run deletes only mappings of *past* appointments whose owner has no
connection at all (the remote events, if any, stay on that Google calendar untouched).
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text  # noqa: E402

from app.core.database import SessionLocal  # noqa: E402

REPORT = text("""
    select e.user_id, u.role, count(*) as total,
           count(*) filter (where a.appointment_date < now()) as past,
           case when c.id is null then 'no_connection' else 'inactive_connection' end as state
    from google_calendar_events e
    join appointments a on a.id = e.appointment_id
    left join users u on u.id = e.user_id
    left join google_calendar_connections c on c.user_id = e.user_id
    where e.user_id is not null and (c.id is null or c.is_active is not true)
    group by e.user_id, u.role, state
    order by total desc
""")
PURGE = text("""
    delete from google_calendar_events e
    using appointments a
    where a.id = e.appointment_id and a.appointment_date < now() and e.user_id is not null
      and not exists (select 1 from google_calendar_connections c where c.user_id = e.user_id)
""")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--purge-past', action='store_true', help='Delete past mappings of owners with no connection')
    parser.add_argument('--run', action='store_true', help='Required together with --purge-past to write')
    args = parser.parse_args()
    if args.purge_past and not args.run:
        parser.error('--purge-past only previews without --run')
    with SessionLocal() as db:
        rows = db.execute(REPORT).all()
        for row in rows:
            print(f'user={row.user_id} role={row.role} state={row.state} mappings={row.total} past={row.past}')
        print(f'owners={len(rows)} mappings={sum(row.total for row in rows)} past={sum(row.past for row in rows)}')
        if args.purge_past:
            deleted = db.execute(PURGE).rowcount
            db.commit()
            print(f'deleted={deleted}')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
