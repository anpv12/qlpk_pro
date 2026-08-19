# QLPK Operations And Validation

## Local Runtime Notes

- The app is a Flask application with PostgreSQL. `main.py` initializes database tables when imported.
- Docker Compose defines `postgres`, `app`, `nginx`, and `redis` services.
- `docker-compose.yml` builds the app from the repository root and runs Gunicorn against `main:app`.
- In this snapshot, `Dockerfile` expects `requirements.txt` at the repository root, but only `backups/requirements.txt` was discovered. Fix or verify this before relying on a fresh Docker build.
- `.env`, credentials, token files, SQL dumps, uploads, and backups exist in the workspace. Treat them as sensitive local state.

## Running And Importing

- Prefer targeted module checks over importing `main.py` when the database may not be available.
- If a check must import the Flask app, expect DB connection attempts and host/config side effects.
- `main.py` only calls `Base.metadata.create_all()` when `AUTO_CREATE_TABLES=true`, or when `AUTO_CREATE_TABLES` is unset and `DEBUG=true`. Production should leave `AUTO_CREATE_TABLES=false` or unset with `DEBUG=false`, run Alembic migrations before app startup, and use `AUTO_CREATE_TABLES=true` only as a deliberate temporary compatibility override.
- Use the existing `run_server.sh` or Docker Compose only after checking the environment and ports.

## Runtime File Storage

- Runtime/user-generated files are centralized under `QLPK_UPLOAD_ROOT`; local default is root `uploads/`.
- Production should set `QLPK_UPLOAD_ROOT` to a mounted data volume, for example `/var/lib/qlpk/uploads` or `/app/uploads` inside Docker with `QLPK_UPLOAD_HOST_PATH` pointing outside the code checkout.
- Do not copy local `uploads/` when deploying code. Copy code/static assets separately from runtime data to avoid overwriting production files.
- Docker production upload volumes must be writable by the app user. If the app runs as uid `1000` and `/app/uploads` or `/app/uploads/attachments` is owned by `root:root` with mode `755`, uploads/deletes can fail; fix the host volume ownership with `chown -R 1000:1000 <upload-root>`.
- Public direct serving is limited to upload categories that were already public/static-like: `avatars`, `license_certificates`, `templates`, and `downloads`.
- Clinical files under `attachments`, `chi_dinh_results`, and `safety_plans` stay behind their existing API routes and must not be exposed through a generic static file rule.

## Operational Scripts

- `setup_pg_backup_final.sh` is an operations script for configuring daily PostgreSQL backups from the Docker container `qlpk_postgres` to Google Drive through `rclone`. It writes the installed backup script to `/opt/backup_postgres_gdrive.sh`, logs to `/var/log/pg_backup.log`, and configures cron. Treat it as deploy/ops tooling, not application runtime code.
- Do not run `setup_pg_backup_final.sh` casually in local development: it mutates host cron, writes under `/opt`, and immediately runs a backup test. Only use it on an intended production/ops host after verifying container name, database name, rclone remote, and retention settings.
- `scripts/migrate_attachment_files_to_upload_root.py` reconciles existing `attachments` DB rows with physical files under `QLPK_UPLOAD_ROOT/attachments`. It does not update DB rows. Default run is dry-run: `python3 scripts/migrate_attachment_files_to_upload_root.py --dry-run`. Apply with safe copy mode: `python3 scripts/migrate_attachment_files_to_upload_root.py --apply`. For production set the real upload root first, for example `QLPK_UPLOAD_ROOT=/app/uploads python3 scripts/migrate_attachment_files_to_upload_root.py --dry-run`; add `--source-root /old/uploads` when files still live outside the current checkout/upload root. Use `--move` only after a clean dry-run, because copy mode is safer for production recovery.
- `scripts/check_schema_contract.py` is the read-only DB/model gate. It imports `app.models`, compares SQLAlchemy metadata with live PostgreSQL tables/columns, and verifies every `app/models/*.py` table is registered in `app/models/__init__.py`. It must pass before and after schema or model changes.
- `scripts/check_alembic_contract.py` is the read-only Alembic graph audit. The active graph was reset to a single current-schema baseline on 2026-07-05, so `--strict` is expected to pass.
- `scripts/check_api_auth_contract.py` is the read-only route auth audit. Default mode is advisory and reports internal routes missing `require_auth`/`require_admin`; use `--strict` only after the public allowlist is approved and missing-auth routes are fixed by workflow slice.

## Migrations

- Alembic files live under `alembic/versions`.
- SQL one-off helpers may exist under `scripts/`; the old root `migrations/` SQL folder was archived to `_archive/cleanup-20260613/root/migrations/` during the 2026-06-13 cleanup.
- When adding a persistent model field, add a migration or clearly explain why no migration is needed.
- Keep SQLAlchemy model, migration, serializer, frontend load, and frontend save in sync.
- Destructive schema cleanup must be preceded by a database backup and must archive non-empty legacy values into `legacy_database_archive` before dropping tables or columns.
- Model registry is part of the schema contract: every live model with `__tablename__` must be imported/exported through `app/models/__init__.py` so `Base.metadata` and Alembic see the same schema.
- The legacy multi-head Alembic graph was archived to `_archive/alembic-prebaseline-20260705/` on 2026-07-05. The active graph now has one baseline revision, `20260704_legacy_db_cleanup`, backed by the current SQLAlchemy model registry. Existing databases already stamped at this revision do not need schema-changing SQL for the baseline; fresh databases can use `alembic upgrade head` to create the current schema.

## Validation Strategy

There is no discovered test suite in this repository snapshot.

Use `references/smoke-checks.md` for workflow-specific validation checklists.

Default validation has two layers:

1. Static/terminal validation for all touched code.
2. Mandatory browser/visual QA for every UI-facing change.

For UI work, do not stop at syntax, contract, or HTTP checks. Open the affected screen in a browser, inspect console/network/static asset errors, and visually verify the actual component that changed before reporting completion. Browser QA is agent-led by default and may use Chrome, the in-app browser, Playwright/headless browser tooling, or an equivalent local browser path when available. Browser QA is required for HTML/CSS/JS changes that affect layout, rendering, interaction, modals, dropdowns, calendars, tables, forms, notifications, shared shell/header/tabs, or any third-party widget.

Use the smallest validation that proves the change:

- Python syntax: `python -m py_compile <files>` for edited backend files.
- JavaScript syntax: use available local tooling such as `node --check` or source inspection; for UI-facing JS, browser console checks are mandatory before completion.
- Endpoint logic: trace request payloads and response shapes through the exact route touched.
- API auth boundary: run `python3 scripts/check_api_auth_contract.py` after adding or changing API routes; default warnings must be reviewed, not ignored.
- UI behavior: validate code ownership, CSS/JS syntax, static references, targeted HTTP responses, browser console, rendered layout, visual alignment, responsive behavior, overflow/clipping, z-index/backdrops, and the exact interaction/component touched.
- Doctor screen: verify patient switch, stale-data clearing, and auto-save guards through code/static checks; if the touched change affects UI/rendering, also perform browser/visual QA before completion.
- Database changes: verify migration upgrade path or at least generated SQL/model consistency.
- Schema/model architecture: run `python3 scripts/check_schema_contract.py`; for migration graph visibility run `python3 scripts/check_alembic_contract.py` and document warnings if present.

If the user explicitly asks to skip browser testing, or browser QA cannot be completed because the server is down, authentication/session data is unavailable, required seed data is missing, or browser tooling fails, report the blocker explicitly as `chưa pass visual QA`. Do not claim the UI is done or visually correct from terminal checks alone. Do not leave browser validation sessions running unnecessarily.

## Known Risk Areas

- Many endpoints print or log debug output. Avoid adding more noisy debug logs unless needed temporarily.
- Some routes are public by design; do not add auth blindly without checking callers.
- Some APIs have backward-compatible aliases and legacy field names. Preserve compatibility unless explicitly removing legacy behavior.
- The project is not currently in a Git repository at this path, so do not rely on `git status` for change tracking.
