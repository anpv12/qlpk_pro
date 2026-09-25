# QLPK Operations And Validation

## PDF preview runtime (2026-09-21)

- `POST /api/print/preview.pdf`: Bearer auth, HTML tối đa8MB, PDF inline/
  no-store; không lưu file hồ sơ. Worker process riêng tránh eventlet,
  tối đa2 jobs/process, timeout45s dọn process group.
- Local: cài requirements và `python3 -m playwright install chromium`.
  Dockerfile cài Chromium + OS dependencies. `QLPK_PDF_BROWSER_PATH` là
  tùy chọn executable tương thích. Không migration/đổi DB.
- Worker chỉ đọc static CSS/image/font nội bộ; network/file URL/API/client
  JS bị chặn. Vendor Bootstrap/Roboto/JsBarcode kèm license ở
  `app/static/vendor/pdf`; không dùng CDN trong lúc tạo PDF.
- Tests: `python3 -m pytest -q tests/test_pdf_preview.py` (pypdf để kiểm
  text/pages), `node --test tests/pdf_preview.test.js`,
  `node tests/prescription_followup_print.test.js`.

## Local Runtime Notes

- Visit ledger 2026-09-20: local migration `20260920_medicine_visit_ledger`
  applied after backup `reports/medicine-visit-ledger-2026-09-20/before-migration.dump`
  (0600). Exactly five columns, no new tables, no historical backfill. Apply
  migration before running code. No SSH/production deployment. Rollback-only
  tests: `QLPK_RUN_DB_TESTS=1 python3 -m pytest -q tests/test_prescription_visit_ledger.py`.

- Medicine price history2026-09-15: local Alembic revision
  `20260915_medicine_price_history` follows `20260915_dav_stored_route`.
  Apply migration before serving the new price/creation APIs. No data backfill.
  Backup and before/after evidence: `reports/medicine-price-history-2026-09-15/`.
  Tests are rollback-only (`QLPK_RUN_DB_TESTS=1`); user owns browser QA.
  No production deploy or runtime restart was performed for this change.

- Human DAV review (2026-09-14): no schema migration or bulk update is needed.
  Existing links without `reference_snapshot.human_review` read as pending.
  Use `QLPK_RUN_DB_TESTS=1 python3 -m pytest -q tests/test_medicine_reference_review.py tests/test_medicine_dav_link.py tests/test_dav_data_migration.py`
  for rollback validation; `node --test tests/medicine_reference_review.test.js tests/medicine_dav_autocomplete.test.js tests/medicine_catalog_save.test.js`
  covers frontend state. The user owns visual/interactive QA. Do not resume
  automated medicine-to-DAV selection from old migration manifests.

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

## Di chuyển thư mục dự án khi localhost đang chạy

- Flask/Jinja giữ đường dẫn root/template/static từ lúc khởi tạo. Di chuyển
  checkout đang chạy có thể làm request mới báo `TemplateNotFound` hoặc asset
  404, dù file vẫn tồn tại ở thư mục mới; tab đã mở trước đó không chứng minh
  runtime còn hợp lệ.
- Xác nhận listener bằng `lsof -nP -iTCP:8000 -sTCP:LISTEN`, truy PID/parent
  reloader và đối chiếu traceback với checkout hiện tại. Dừng đúng cặp tiến
  trình app/reloader rồi chạy lại từ checkout mới bằng interpreter đã dùng;
  không tạo symlink hoặc copy template để che đường dẫn cũ.
- Khi chỉ khôi phục runtime, dùng `AUTO_CREATE_TABLES=false` để startup không
  tự tạo bảng. Không chạy migration hoặc sửa dữ liệu vì lỗi đường dẫn.
- Sau restart, kiểm HTTP trang chủ, workflow bị ảnh hưởng và static assets;
  mở mới/reload browser để xác nhận HTML thực sự được render. Có thể dùng
  `scripts.smoke_health.check_http` để kiểm 30 route HTML mà không import app.
- Sự cố 2026-09-05: checkout chuyển từ `Documents/Hoc/qlpk_pro` sang
  `Documents/Học/Product/qlpk_pro`, runtime cũ trả 500 ở `/index.html`.
  Restart bằng `/opt/homebrew/bin/python3.11 main.py` từ checkout mới đã
  khôi phục 30 route HTML và 21 asset tham chiếu bởi trang chủ/CLS/khảo sát.

## Deploy trạng thái chỉ định thống nhất

- Live survey thêm migration `20260906_survey_live_draft` sau closure; local
  đã áp dụng ngày 2026-09-06, backup trước thay đổi tại
  `/tmp/qlpk-before-live-survey.dump` (0600). Deploy phải nâng DB trước code
  đọc các cột draft/snapshot. Giữ `AUTO_CREATE_TABLES=false`.
- Browser QA dùng hai context độc lập (bệnh nhân không có JWT, bác sĩ có JWT):
  chọn đáp án → autosave → bác sĩ thấy trong khoảng 3 giây; reload bệnh nhân
  từ context mới phục hồi từ server; nộp bài/chủ động kết thúc/hết hạn giữ đúng
  dữ liệu. Không mô tả polling 3 giây là cập nhật tức thì; mất mạng chỉ phần
  đã được đồng bộ mới xuất hiện ở màn bác sĩ.

- Backup DB trước migration. Chuỗi hiện hành thêm `20260905_order_survey_closure`
  sau `20260905_order_survey_lifecycle`. Local backup mới:
  `/tmp/qlpk-before-survey-closure.dump` (0600).
- Chạy `python -m alembic -c alembic/alembic.ini upgrade head` trước khi chạy
  code dùng cột mới; giữ `AUTO_CREATE_TABLES=false`.
- Chạy `python scripts/reconcile_survey_order_status.py` để xem kế hoạch;
  chỉ chạy thêm `--apply` sau khi đối chiếu report. Record `review` không
  được tự biến thành has_result hoặc tự thay câu trả lời/điểm. Hết hạn vẫn
  kết thúc chỉ định, không có nghĩa bài cũ đã đầy đủ/hợp lệ.
- Sau migration: schema contract, Alembic strict, frontend/auth contracts,
  pytest, HTTP pages và browser QA workflow. Kiểm riêng nộp bài → Có kết quả,
  bác sĩ kết thúc hoặc hết hạn → Hoàn thành, có/không có bài nộp.
- Migration mới đổi survey completed cũ có response liên kết về has_result,
  giữ điểm/đáp án, lấy hạn từ session mới nhất rồi kết thúc các hạn đã qua.
  Không gia hạn link cũ. Các bài đã hết hạn chuyển tab Hoàn thành.
- Hết hạn được ghi nhận trước API workflow; khi không có request, DB không có
  worker nền ghi đúng từng giây. Trang CLS đang mở tự gọi lại ở mốc hạn backend.

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

- DAV stage2 (2026-09-14): now27/51 linked (17 new),24 pending with per-row
  actions. `reports/dav-migration-2026-09-14/stage-2/` holds backup metadata,
  source-corrections journal, manifest, migration journal, before/after and
  verification. Backup `/tmp/qlpk-before-dav-stage2-20260914-193425.dump`
  verified by pg_restore list before writes. Corrected only2 source rows using
  explicit normalizer exceptions; raw preserved. All51 clinic stock/settings,
  48 batches/2744 transactions/877 linked prescription items unchanged.
  Some source metadata refreshed during execution; verification separates
  timestamp-only raw changes from clinical/source identity changes. 70 tests
  and schema checks passed. Previous10/41 note below is stage1 history.

- DAV data 2026-09-14: local `qlpk_db` đã migrate10/51 thuốc;41 còn thiếu
  căn cứ, chi tiết `reports/dav-migration-2026-09-14/report.md`.
  Backup `/tmp/qlpk-before-dav-data-migration-20260914-122453.dump` (0600,
  custom dump, đã kiểm pg_restore list). Script
  `scripts/migrate_clinic_medicines_to_dav.py <manifest>` chỉ kiểm tra;
  `--apply --actor-id <admin> --database-backup <dump> --journal <new-json>`
  ghi qua writer nội bộ, pin hash/version, bảo toàn kho/lô/đơn và một transaction.
  Manifest đã áp dụng không dùng lại để ghi đè. `migration-journal.json`
  được tạo trước commit; `verification.json` là kết quả đọc lại sau commit.
  Không restore toàn DB để hủy một mapping khi đã phát sinh dữ liệu mới;
  cần đối chiếu nhật ký before/after và trạng thái hiện tại trước phục hồi.

- DAV search 2026-09-12: local đã upgrade `20260912_dav_search_indexes` sau
  backup `/tmp/qlpk-before-dav-search-index-20260912-213940.dump` (0600).
  Sáu expression trigram và một ordered btree tạo CONCURRENTLY trong
  autocommit block; retry sửa index invalid do build bị ngắt. Không bọc
  migration này trong transaction ngoài. Cần quyền tạo pg_trgm nếu môi trường
  chưa có extension; baseline cũng tạo extension trước current model metadata.
  Downgrade chỉ gỡ 7 index thuộc migration, giữ extension và index cũ.
  Sau upgrade kiểm indisvalid, schema contract, Alembic strict và EXPLAIN;
  từ khóa 1–2 ký tự vẫn có thể cần Seq Scan cho COUNT chính xác.

- DAV clinic link 2026-09-12: backup local
  `/tmp/qlpk-before-dav-link-20260912-165240.dump` (0600) trước migrations
  `20260912_medicine_dav_link` và `20260912_dav_prescription_text`.
  FK/unique source linkage and wider text only; no stock/clinical row backfill.
  Đã đồng bộ đủ 54.752 bản ghi nguồn DAV (55 trang); không tự tạo thuốc phòng khám.
  Deploy migration trước code model mới. Mẫu Excel cũ bị chặn; tải mẫu DAV mới
  từ Tủ thuốc. Các thuốc legacy phải được người dùng đối chiếu trước khi nối nguồn.

- Tủ thuốc 2026-09-10: migration `20260910_inventory_receipts` bỏ unique toàn
  cục của số lô và thêm `medicine_transactions.balance_after` nullable. Local
  đã backup `/tmp/qlpk-before-inventory-receipts-20260910.dump` (0600) trước
  upgrade. Deploy DB trước code; không suy số dư/giá lịch sử. Downgrade sẽ
  từ chối nếu đã có nhiều lần nhập trùng số lô để bảo toàn dữ liệu.

- Alembic files live under `alembic/versions`.
- DAV stored routes2026-09-15: upgrade `20260915_dav_stored_route` before
  deploying model/readers. Run `python scripts/persist_dav_route_suggestions.py`
  for a read-only preview after schema upgrade; apply with the returned
  `--expected-fingerprint`, `--expected-updates`, a verified PostgreSQL custom
  `--database-backup` and new `--journal`. Finish backfill before switching
  readers to stored values. Local stored15432/54752 with rule2026-09-14.2;
  journal/report in `reports/dav-stored-route-2026-09-15/`. Backup:
  `/tmp/qlpk-before-dav-stored-route-20260915-083242.dump` (0600).
  The writer preserves all other DAV fields and clinic tables. A prepared or
  not_confirmed journal after interruption requires read-only reconciliation;
  do not blindly reapply. Future sync stores/clears suggestions from current
  source; rule changes require a fresh reviewed backfill of existing rows.
- SQL one-off helpers may exist under `scripts/`; the old root `migrations/` SQL folder was archived to `_archive/cleanup-20260613/root/migrations/` during the 2026-06-13 cleanup.
- When adding a persistent model field, add a migration or clearly explain why no migration is needed.
- Keep SQLAlchemy model, migration, serializer, frontend load, and frontend save in sync.
- `alembic/env.py` lấy URL từ `app.core.config.settings`, vì vậy lệnh
  `alembic -c alembic/alembic.ini upgrade head` dùng đúng `DATABASE_URL` của
  môi trường hiện tại; không dùng URL mẫu trong file ini để suy ra database.
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
