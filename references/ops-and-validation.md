# QLPK Operations And Validation

## Cookie session cutover (2026-09-28, lát65)

- Frontend bật cookie HttpOnly trên mọi trang qua partial user-feedback-runtime.
  Deploy cùng backend hiện tại; người dùng đăng nhập lại một lần (token cũ bị
  xóa). Yêu cầu HTTPS (ProxyFix + X-Forwarded-Proto đã có) hoặc localhost;
  truy cập http qua IP LAN sẽ bị chặn đăng nhập vì thiếu Web Locks/cookie Secure.
- Production cần SESSION_REDIS_URL/REALTIME_REDIS_URL dùng chung mọi worker; docker-compose đã khai báo cả hai (redis db 0) và app chờ Redis healthy. Kiểm: `python scripts/check_security_config.py --compose docker-compose.yml`.
- Thư viện frontend tự host ở `app/static/vendor/<lib>@<ver>/` (không CDN); nâng version phải thay file + SRI/LICENSE và cập nhật template.
- Trang public khai báo `{% set qlpk_public_page = true %}` trước include partial.

## Calendar transfer consumer (2026-09-28, lát60)

- 28/09 user duyệt giữ bảng: DB local `qlpk_db` đã `alembic upgrade head` →
  `20260928_calendar_transfer_jobs` (adopt bảng do DEBUG create_all tạo, đúng
  schema, 0 dòng). Worker `--run` chạy thử: selected=0, completed=0, exit 0.
  Không để worker `--watch` chạy nền trên máy local; production cần supervisor.

- Lát72 (29/09/2026) Calendar sync outbox: tạo/sửa/hủy/đổi bác sĩ/tái khám
  và tạo lượt khám chỉ ghi `google_calendar_sync_jobs` trong transaction (gộp
  job pending cùng lịch hẹn); worker `calendar_sync.py` đọc trạng thái hiện tại,
  retry/backoff, event ID tất định. Xóa cứng gỡ event ngay rồi xóa mapping.
  Migration `20260929_calendar_sync_jobs`; cùng CLI
  `python scripts/process_calendar_transfers.py --run --watch` (chạy cả transfer
  và sync). Manual sync/delete-all trên dashboard vẫn đồng bộ tức thì (có lock,
  strict verify) vì người dùng cần kết quả ngay.
- Mapping của chủ lịch đã ngắt kết nối (DB local 441 dòng, đều là lịch quá khứ)
  được giữ có chủ đích để kết nối lại không tạo trùng. Xem:
  `python scripts/report_calendar_mappings.py`; xóa có chủ đích:
  `--purge-past --run` (đã thử trên bản sao, CHƯA chạy DB thật).

- Lát64: migration adopt bảng đã tạo bởi DEBUG create_all nếu đúng cột và
  unique event_id, bổ sung index thiếu; bảng lệch schema thì dừng. Transfer
  drain ngay sau commit; worker vẫn bắt buộc cho retry. OAuth cần Flask
  SECRET_KEY ổn định giữa init và callback (cùng mọi worker).

- Lát63 Calendar API giới hạn100 IDs/request và date range tối đa366 ngày,
  delete-all thiếu dates400. Không truncate. Doctor chỉ mutate own calendar;
  bulk UI >100 cần QA/chunk có kiểm soát trước rollout. Backend locks giữ
  qua provider calls nên còn cần timeout/worker consolidation; chưa SLA.

- Lát62 legacy API không còn xóa link vì mất kết nối. Giữ pending mappings
  đồng nghĩa cần retry/đối soát, không có automatic retry mới cho cancel/manual
  sync. Không gọi việc sửa safety này là rollout đầy đủ transactional outbox.

- Deployment prerequisite mới: migration `20260928_calendar_transfer_jobs`
  và supervised consumer `python scripts/process_calendar_transfers.py --run --watch`.
  Chỉ owner vận hành được rollout sau chốt; CHƯA apply/restart/deploy hoặc chạy
  consumer bằng operational DB trong lượt này. Không sửa .env/main/bootstrap.
- CLI không `--run` từ chối ghi; `--run` chạy1 batch tối đa100 due jobs, exit1
  nếu batch còn failed; `--watch` poll30s. Không import main. Supervisor phải
  restart process khi lỗi DB. Pending jobs giữ qua process restart.
- Backoff30s tăng tối đa3600s; inactive/missing Google connection hoặc legacy
  event owner NULL không báo success. Cần monitoring pending/last_error và
  quy trình đối soát trước rollout; chưa có admin UI/retention trong lát này.
- Lát61 bổ sung last_error `event_identity_retired`: ID mới đã lưu nhưng chưa
  gửi; attempt sau dùng ID đó. Không cần migration bổ sung. Các job completed
  không tự dò Google sau này; xóa thủ công sau completion cần reconcile riêng.
- Google upsert mới có HTTP timeout15s; delete/update/credential refresh còn
  dùng service chung hiện hữu. Không gọi đây là bounded end-to-end SLA.
- Test fixtures PostgreSQL initdb/socket riêng, provider mocked; migration
  upgrade/downgrade chỉ chạy trong fixture. Tests không import main hoặc ghi
  DB thật, pg processes đóng cuối test. Chưa Google account/network E2E thật.

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

## Static cache policy (2026-09-26)

- HTML stays `no-cache, no-store`. Static responses requested with `?v=<app_version>`
  get `Cache-Control: public, max-age=31536000, immutable`; without `v` Flask keeps
  `no-cache` + ETag. `app_version` is the process start time in production and the
  newest static/template mtime in DEBUG, so every deploy or local edit changes the URLs.
- `/static/js/<file>.js?v=` is served by `versioned_static_js` in `main.py`: relative
  `import`/`export` specifiers get the same `?v=` so ES module graphs are cacheable.
  Unsafe or missing versions fall back to the normal static handler; traversal returns 404.
- Tests: `python3 -m pytest -q tests/test_static_cache_policy.py tests/test_static_module_stamping.py`.
  Browser check: revisit `doctor-examination.html`; only HTML/API and unversioned
  assets should hit the server.

## Local Runtime Notes

- Lát40 factories mới cần Web Locks (navigator.locks) để tuần tự hóa response
  Set-Cookie giữa các tab cùng origin; không có thì fail closed trước mutation,
  không memory lock fallback. HTTPS/localhost secure context là prerequisite.
  Cookie mutation còn phải đi qua cùng owner khi cutover; direct fetch cũ không
  được coi là được Web Locks bảo vệ. Không timeout rồi nhả lock sớm trong khi
  response cookie có thể còn tới. Browser QA2 tabs dùng Flask/mock DB, không
  data thật: /tmp/qlpk-session-actions-browser.log. Chưa template cutover.

- Lát39 chỉ thêm factory browser-session, chưa nạp template hoặc chuyển
  login/header sang cookie. Không tự thêm shim qlpk_token, không đổi .env/DB/
  restart/deploy. /tmp/qlpk-session-owner-browser.cjs dùng2 tab Chrome chung
  cookie jar, Flask loopback với account/DB mocked; xác minh tab cũ ID403,
  invalidation block write, rebootstrap/new cookie hoạt động, logout lan sang
  tab khác, localStorage/sessionStorage trống. Channels/browser/server đóng.

- Lát38 CHƯA rollout HttpOnly frontend. Backend opt-in cookie đã có nhưng
  login.js/header/utils/realtime và54 JS files liên quan token vẫn luồng Bearer.
  Không bật riêng login.js trước các caller/guards/storage/logout cùng đổi;
  không lưu dummy token trong localStorage để giả tương thích. Production
  cookie yêu cầu HTTPS/Secure/__Host; DEBUG cookie tên khác, không dùng DEBUG
  để né production. Cần kiểm proxy host/scheme và iframe same-origin trước
  cutover. Không sửa .env/schema/restart/deploy trong lát38.
  Browser evidence /tmp/qlpk-cookie-browser.cjs + server.py chạy Flask thật
  loopback port ngẫu nhiên với DB/account mocked, RAM registry riêng; cookie
  thật được Chrome kiểm HttpOnly, CSRF, password rotate/logout. Không account
  hoặc database vận hành; processes đóng finally. Không thay clinical E2E.

- Lát37 auth transport rollout: deploy utils.js và appointment-management.js
  cùng backend retire /api/token/refresh (410). Không còn refresh/auto-login
  từ mật khẩu localStorage;401 caller báo đăng nhập lại, wrapper không retry
  thao tác ghi. Người còn legacy keys sẽ được remove khi nạp utils. Không
  migrate cookies/.env/schema, không restart/deploy trong QA. Browser test
  /tmp/qlpk-auth-transport-browser.cjs dùng2 HTTP server loopback random port,
  dummy token, jQuery thật/Chrome; kiểm same/external origin, Request POST body,
 401 không replay và dọn password; cả server/browser đóng finally.

- Account generation rollout (28/09/2026, lát35): backend đồng bộ, token cũ
  thiếu session_generation/session_user_id yêu cầu login lại. Không rolling
  mix verifier cũ/mới. Redis standalone dùng chung mọi worker; không Redis
  Cluster (Lua register dùng hai key). Không sửa .env/schema/restart/deploy.
  Đổi active/role/quyền xem hoặc reset password logout mọi phiên tài khoản;
  thất bại DB sau revoke cũng có thể cần login lại. Profile-only không logout.
  Redis failure phải503+rollback, không báo lưu tài khoản thành công.
  Test `tests/test_account_session_lifecycle.py` tự init PostgreSQL riêng
  dưới /tmp, Unix socket/listen_addresses rỗng, chỉ tạo bảng users QA, không
  dùng DATABASE_URL thật; cuối test stop riêng cluster và xóa temp. Cần initdb/
  pg_ctl trong PATH, thiếu thì skip rõ. Redis fixture tự spawn độc lập như lát32.
  Đã kiểm row-lock wait thật qua pg_stat_activity ở cả hai thứ tự login/disable;
  không đồng nghĩa pass clinical-save concurrency hoặc toàn bộ browser workflow.

- Session registry rollout (28/09/2026): backend/frontend cùng bản, mọi
  user cần login lại vì token cũ chưa đăng ký jti. Production cần
  SESSION_REDIS_URL hoặc REALTIME_REDIS_URL và Redis sẵn sàng; gate không
  cho memory ở production. DEBUG memory restart sẽ logout tất cả local
  sessions; Redis mất/evict keys cũng logout, không mở cửa token cũ.
  Registry chỉ jti+SHA256 token+TTL, không lưu raw token/password. Theo dõi
  Redis availability vì lookup failure503 cho protected API; không dùng
  workaround bật DEBUG/fallback JWT. Không sửa .env/restart/deploy ở lát34.
  Trước deploy lưu nháp và báo người dùng login lại. Header logout fail
  thì chưa rời phiên, phải retry; mất response sau revoke retry401 sẽ clear.

- Production gate rollout (28/09/2026): chạy
  `python3 scripts/check_security_config.py` trước deploy. Bắt buộc khóa
  riêng ngẫu nhiên ít nhất32 bytes, HS256, ACCESS_TOKEN_EXPIRE_MINUTES từ1
  đến1440 (default480). DEBUG=False sẽ dừng trước DB/API nếu sai; không
  bật DEBUG để né gate. Decoder production yêu cầu exp integer, token dev
  không-exp không chuyển sang production được. Issuer cap lifetime.
  SECRET_KEY/SENDER_PASSWORD mặc định rỗng, cấp qua secret manager/env;
  không in vào log hoặc commit. SMTP credential đã từng gắn trong source
  cần chủ vận hành thu hồi/rotate ở provider nếu từng dùng, xóa default
  không xóa Git history/không vô hiệu credential. Lát33 không sửa .env,
  không rotate secret thực hoặc restart/deploy. JWT rotation làm hết mọi
  phiên; phối hợp thời điểm login lại và giữ nháp trước deploy.

- Login throttle rollout (28/09/2026): LOGIN_REDIS_URL tùy chọn ưu tiên,
  fallback cấu hình REALTIME_REDIS_URL hiện có; không có cả hai dùng RAM
  một process. LOGIN_ACCOUNT_ATTEMPTS=10, LOGIN_IP_ATTEMPTS=60,
  LOGIN_WINDOW_SECONDS=300 mặc định, đều bắt buộc dương. Tune theo NAT và
  số nhân viên; không dùng memory khi nhiều workers. Redis lỗi trả503
  login, không mở cửa auth; theo dõi availability/latency store.
  Compose Redis hiện allkeys-lru có thể evict counters: production nên
  dùng store riêng noeviction; chưa đổi Docker/Redis runtime ở lát này.
  Port app không được expose trực tiếp khi ProxyFix tin forwarded headers;
  kiểm chuỗi nginx/proxy đáng tin trước rollout. Lua Redis thật đã kiểm
  trong lát32 bằng Redis7.4.6 QA tự build ở /tmp, checksum SHA256 đối chiếu
  redis/redis-hashes; không cài global hoặc sửa service hiện hành.
  Chạy lại: `QLPK_TEST_REDIS_SERVER=/absolute/path/redis-server python3 -m
  pytest -q tests/test_login_throttle_redis.py`. Fixture tự spawn Redis
  Unix socket riêng, TCP port0, không persistence, noeviction, finally
  terminate/wait/kill riêng PID nếu cần, không nhận URL Redis bên ngoài.
  Không có binary thì skip rõ, không gọi mock là integration pass.
  Đã kiểm Lua concurrency/multi-client/TTL/429/outage/corrupt counter;
  chưa kiểm chuỗi nginx/proxy hay Redis production eviction. Không deploy.

- Credential-bound JWT rollout (28/09/2026): triển khai services/auth,
  API auth/user, socket và app-header-loader đồng bộ. Token cũ không có
  credential_version sẽ401, cần đăng nhập lại bằng mật khẩu hiện có;
  không thay password/secret/schema và không backfill. Tất cả worker phải
  dùng cùng phiên bản, không rolling mix issuer/verifier cũ/mới. Token mới
  bị vô hiệu sau reset mật khẩu; self change trả token thay thế. Kiểm user
  thật chỉ khi có phạm vi QA cho phép, không reset password để thử nghiệm.
  Tests isolated: test_credential_token_revocation.py và
  password_session_rotation.test.js. Công việc này chưa deploy/restart.

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
- `scripts/check_code_health.py` (khóa bởi `tests/test_code_health.py`): mọi file app ≤500 dòng; ESLint (`scripts/eslint.health.config.mjs`) 0 lỗi, 0 cảnh báo ngoài metric, complexity ≤15, mọi hàm ≤80 dòng; mọi hàm Python trong `app/` ≤80 dòng code và McCabe ≤10 (đếm như ruff C901, không cần cài ruff); không `except Exception` nuốt lỗi (phải log traceback hoặc raise; route JSON dùng `api_error_boundary`); file Python/JS/template ≤500 dòng. Mọi file CSS trong `app/static/css` ≤500 dòng: file lớn tách theo chủ đề vào thư mục cùng tên, file gốc chỉ giữ danh sách `@import url('./<stem>/<topic>.css')` theo đúng thứ tự cascade; script/test đọc nội dung CSS qua `scripts/module_source.py` (`read_source`) hoặc `tests/helpers/css-source.js` (`readCssSource`). Số `window.X` global không vượt `MAX_WINDOW_GLOBALS` (ratchet, hạ khi gỡ bớt).
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

Test suites: `python3 -m pytest -q tests` (Python) and `node --test tests/*.test.js` (frontend modules).
Database tests run inside an outer transaction that is rolled back. `tests/conftest.py` turns them on when
`DATABASE_URL` points at a local PostgreSQL that answers (the user allows the local `qlpk_db`, 2026-10-03);
`QLPK_RUN_DB_TESTS=0` skips them, `QLPK_RUN_DB_TESTS=1` forces them. While they run, a real `COMMIT` on the app
engine is refused before it reaches the database and fails that test, so the suite cannot change local data —
patch every `get_db` the request touches (split modules: `tests/module_parts.py` `setattr_all`, plus
`app.api.auth.get_db`, which `require_auth` uses for `last_login`) with a savepoint session.

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
