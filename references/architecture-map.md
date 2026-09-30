# QLPK Architecture Map

- Lát72: calendar_sync.py + GoogleCalendarSyncJob là outbox cho mọi writer
  Calendar tự động (appointment create/update/cancel/soft-delete, doctor change,
  re-examination, legacy examination create). `sync_calendar_for_appointment`
  giờ chỉ enqueue + commit + drain nền; không gọi Google trong request. Hard
  delete dùng `retire_calendar_events_before_hard_delete`. Manual dashboard
  sync/delete-all (calendar_event_sync) vẫn là writer đồng bộ có lock.

- Lát63: calendar_access.py sở hữu actor DB reload/share lock, batch ID/date
  parsing, read/write scope và Appointment lock. Calendar dashboard routes
  dùng owner chung, sync/delete serialized với transfer bằng appointment lock;
  đây chưa phải consolidation outbox mọi writer hoặc OAuth security audit.

- Lát62: GoogleCalendarService.verify_event strict opt-in phân biệt unknown
  với confirmed missing. Manual-sync strict verification và duplicate cleanup;
  side_effects update/cancel preserve failed mappings; delete-all kiểm typed
  HTTP status thay substring. Các writers này vẫn chưa cùng outbox/row-lock.

- Lát61: provider update có opt-in missing result (None khác False);
  transfer worker chỉ retire mapping khi Google xác nhận absence. Provider
  tombstone identity phát CalendarEventRetired; worker rollback savepoint,
  persist next ID/backoff rồi dùng ở attempt sau. Không rotate vì timeout.

- Lát60: transfer Calendar side effect là transactional enqueue qua
  calendar_transfer.py và GoogleCalendarTransferJob. Consumer CLI riêng chỉ
  đọc committed jobs, lock Appointment→Job, retry/backoff + deterministic
  provider event ID. Migration20260928_calendar_transfer_jobs mới ở source,
  chưa apply/launch worker vận hành. Chưa hợp nhất các Calendar writer khác.

- Lát59: transfer_service parse/prepare validate toàn batch trước mutate;
  User share locks (ordered), Appointment+Examination update locks (ordered)
  và reload kiểm current ownership/status. Route rollback validation và trả
  status_code từ exception, chỉ notify khi updated_count>0. No schema changes.
  Calendar precommit của lát59 đã thay bằng outbox ở lát60; DB rollback vẫn
  không thể rollback ngoại hệ thống, worker dùng idempotent retry/cleanup.

- Lát58: TransferModal explicit installJQuery canonical transport; không private
  Bearer. Modal capture cookie revision/legacy credential lúc open; gate xuyên
  recipient load, beforeTransfer và POST completion. Chỉ đủ updated_count mới
  hide/toast/callback; no-op/partial cảnh báo kiểm tra thay báo thành công chung.
  Giữ beforeTransfer/busy/duplicate-close guards, không đổi API/backend.

- Lát57: receptionist/catalog-loaders dùng canonical fetch, timeout10s và
  latest-load revision theo document/kind; không token gate/jQuery ajax/retry
  timer vô hạn. Doctors render option.textContent, giữ ID đang chọn nếu còn.
  Service autocomplete bind namespace thay handler cũ, tên/giá qua text nodes;
  typing clear hidden ID, focus không xóa ID. Không thay layout/API.

- Lát56: relative-table, modal-patient-search-data và2 upload helpers không
  gắn Bearer riêng; canonical transport giữ auth/CSRF. Retire modal token/header
  exports cùng UI re-exports. Document list truyền isCurrentContext qua3 page
  adapters tới preview/download (kể cả422 fallback); check trước/sau response/
  Blob. Upload JSON lỗi session không đổi thành success; modal patient load
  không dùng fallback khi session lỗi. Chưa bind cookie templates.

- Lát55: medical-history context yêu cầu pageRuntime.apiCall, không auth parser;
  getJsonHeaders chỉ Content-Type. ICD exact lookup/suggestions không token gate;
  allergy và safety-plan requests dùng canonical transport. Retire unused auth
  actions; session errors ở ICD/family loaders propagate thay dữ liệu rỗng.
  Safety-plan file recheck patient/context sau Blob; upload completion/error/
  input cleanup không tác động ca mới. Chưa full cookie template cutover.

- Lát54: api-transport sở hữu ensureSession async và getAuthHeader legacy;
  chuẩn hóa token raw/Bearer/JSON/alias tại một owner. Ba page runtime không
  tự đọc/gắn token; getAuthHeader trả null khi cookie đã bind. Doctor startup/
  queue, receptionist startup và psychologist bootstrap await gate. Bootstrap
  shared trả Promise, status sessionBlocked khi không xác minh được phiên.
  Header logout revoke đúng canonical credential và dọn sessionStorage aliases;
  login thành công dọn aliases cũ. Cookie templates chưa được bật.

- Lát53: shortcut-manager bỏ token parser/Bearer riêng; apiCall chỉ JSON
  headers, fetch canonical owner. Cookie user/admin từ RAM authenticated,
  legacy identity tạm giữ tới cutover. Cache phím tắt gắn revision; settings
  gắn identity lúc mount, invalidation clear rows/cache và inert form/reload.

- Lát52: text-expansion runtime được scope IIFE, không trùng global loader
  của màn management. Cache có load revision và cookie revision; invalidation/
  logout/credential storage change clear cache. Management installJQuery vào
  canonical transport, bỏ Bearer riêng; Excel export fetch→Blob download.
  PDF preview dùng canonical fetch POST, không đọc token/sessionStorage riêng.

- Lát51: autocomplete-base/occupation/province/ward và icd-data-loader không
  đọc token hoặc gắn Authorization riêng; window.fetch canonical transport
  sở hữu auth/CSRF/session guard. ICD không gọi legacy getAuthHeader callback;
  session errors propagate thay empty-success. Endpoint/mapping/pagination giữ.

- Lát50: login.js dùng transport.session.actions.login khi cookie mode đã
  bind; revision guard trước redirect, landing theo permissions RAM, không
  ghi token/user/permissions hay /check/me lần hai. Dọn legacy identity chỉ
  sau success còn current. Error renderer dùng chung legacy/cookie, actions
  chuyển Retry-After an toàn cho429. Templates chưa bật cookie tự động.

- Lát49: workspace-tabs lấy cookie user/permissions từ transport.session RAM,
  storage chỉ giữ tab layout theo owner, không credential/permission fallback.
  Async open/activate/close guard lại revision/legacy identity sau leave prompt.
  Init subscribe owner và bootstrap khi cần; đổi account/invalidate terminal
  khóa host hidden+inert, yêu cầu reload, không tiếp tục workspace account cũ.
  Same-user rotation giữ pane, không reset active tab. Chưa cutover templates.

- Lát48: API transport bảo vệ response.body bằng native ReadableStream với
  pull guard trước/sau await, không trả proxy stream cho WebIDL consumers.
  Reader/BYOB, tee, iterator và pipeThrough giữ session guard; pipeTo/new
  Response dùng native guarded source. Không prefetch wrapper (HWM0), không
  đọc toàn file vào RAM. Cookie cutover và draft cross-tab vẫn chưa hoàn tất.

- Lát47: cookie logout actions giữ Web Lock qua callback cleanup; header
  phát confirmation.userId cho main document và workspace iframes, chờ nháp
  dọn thành công trước clear storage/redirect. Retry cleanup không revoke lần
  hai, chỉ khi anonymous revision vẫn đúng. Doctor lấy identity RAM, chặn ghi
  hoàn tất sau đổi revision và chỉ xóa record khớp captureId. Đồng bộ mọi tab
  đang treo/invalidation trễ chưa được chứng minh; templates chưa cutover.

- Lát46: header reads/profile/search/notification dùng canonical transport,
  cookie identity từ transport.session.owner RAM thay localStorage. Cookie
  password dùng actions; realtime bind cùng owner. Legacy còn cho live mode
  tới cutover. Cookie logout/user-scoped cleanup được nối ở lát47;
  không bật cookie template trước hoàn tất coordinated cutover.

- Lát45: canonical API transport.useCookieSession tạo một browser-session
  owner/actions bằng nativeFetch capture trước wrapper, tránh recursion.
  fetch+jQuery cookie dùng owner.request rồi guard response/body/clone theo
  revision; không fallback token. Login/password/logout chỉ qua actions;
  static GET/HEAD không bootstrap. Hàm bind chưa gọi từ live templates: cần
  coordinated login/header/guards/callers/iframe/draft cutover, không shim.

- Lát44: API transport installJQuery dùng ajaxTransport cùng origin thay
  ajaxSend; jQuery đi qua fetch owner và stale-response guard, không là đường
  credential song song. Converters/callbacks/status do jQuery giữ; cancellation
  qua AbortController. External/script/JSONP không auto-auth; sync bị reject.
  Cookie owner chưa bind vào transport, raw stream guard còn mở.

- Lát43: shared/api-transport.js là fetch transport owner đang nạp thực tế từ
  partial user-feedback-runtime trước page scripts; utils.js chỉ installJQuery
  idempotent vào owner này, không còn wrapper thứ hai. Document management
  tự installJQuery vì không nạp utils. Bốn màn document/active-ingredient/
  allergen/drug-interaction bỏ tự đọc/gắn token. Hiện transport vẫn Bearer;
  cookie cutover chưa bật. Fetch response/body methods/clone chặn đổi token
  trong lúc chờ; stream body trực tiếp và jQuery late response còn cần migrate.

- Lát41: /users/me cũng dùng session_identity sau fresh active-user query,
  giữ profile extras và no-store. realtime-client.js bindSession(owner) nối
  browser-session hiện hữu, không tạo identity owner thứ hai. Cookie binding
  thay legacy token source tường minh và không fallback; socket callbacks
  gắn connection+revision, invalidation đóng connection, stop giữ ý định dừng.
  Chưa nối binding vào templates: coordinated frontend cutover vẫn còn mở.

- Lát40: services/session_identity.py giữ ALL_PERMISSIONS và session_user_payload
  cho login, /auth/session, /check/me và cookie password rotation. Membership
  đọc khi DB session mở; parser account_access loại malformed permission list,
  admin giữ danh sách cũ. /users/me profile legacy chưa hợp nhất.
  shared/browser-session-actions.js điều phối login/changePassword/logout qua
  owner và Web Locks cùng origin (không fallback RAM). Revalidate cookie dưới
  lock trước password/logout để thao tác chờ không dùng account mới. Logout
  chỉ trả confirmed khi server success=true hoặc bootstrap401, không dọn nháp.
  Hai factories vẫn chưa load vào template; không tuyên bố đã cutover54 callers.

- Lát39: shared/browser-session.js là factory QLPKBrowserSession.create,
  chưa được nạp vào template runtime. Session id/CSRF/user tối thiểu chỉ RAM;
  bootstrap single-flight, revision chặn late response và JSON body parse.
  request/requestJSON không wrap global fetch, không retry, không Bearer hoặc
  external URL, credentials same-origin/cache no-store. Request gửi
  X-QLPK-Session-Id cả GET, writes thêm CSRF; backend reject ID khác cookie.
  BroadcastChannel inject chỉ truyền invalidation, không token/user/CSRF;
  đổi tab/account block writes cho tới bootstrap tường minh. Consumer chịu
  trách nhiệm dispose/channel.close và chỉ replace khi response thuộc revision
  hiện tại. Login/password/logout UI vẫn cần nối, chưa cutover.

- Browser session backend (28/09, lát38): services/browser_sessions owner
  cookie extraction, CSRF HMAC riêng bound toàn token, exact origin và cookie
  response lifecycle. Login opt-in X-QLPK-Session:cookie ký transport=cookie,
  trả session_id/CSRF/user không JWT; production __Host-qlpk_session Secure,
  HttpOnly, SameSite=Lax, Path=/, không Domain. DEBUG tên riêng cho HTTP local.
  Cookie ưu tiên header; cookie-transport không replay qua Bearer/socket auth
  token. require_auth/admin kiểm origin và CSRF trước handler/activity writes;
  GET cũng same-origin để không cho cross-site đọc session info.
  /auth/session no-store bootstrap CSRF, không refresh/mint. Password rotation
  và logout cùng owner cookie; socket connect yêu cầu Origin + auth.csrf_token.
  Frontend CHƯA opt-in:54 JS files có token/auth matches cần migrate đồng bộ;
  không dùng localStorage token giả làm shim, không gọi HttpOnly rollout xong.

- Auth transport (28/09, lát37): utils.js tự gắn Bearer chỉ khi URL sau resolve
  bằng document.baseURI có origin HTTP(S) trùng window.location.origin. Fetch
  giữ Request headers/body/signal qua input gốc và init copy, không mutate init;
  explicit Authorization được giữ. jQuery ajaxSend cùng origin guard. Không có
  global ajaxError/fetch401 retry, startup auto-login hay đọc mật khẩu đã lưu.
  Dọn hai legacy storage keys qlpk_password/qlpk_username. Lịch hẹn4 callers bỏ
  autoLogin, báo lỗi xác thực; loadAppointmentsData reject unauthorized.
  /api/token/refresh cũ vẫn require_auth nhưng trả410 login_required, không mint.
  Bearer/localStorage chưa thay HttpOnly; các caller explicit headers vẫn cần
  review riêng, không tuyên bố wrapper ngăn được mọi đường rò token.

- Account session lifecycle (28/09, lát35): access_sessions giữ thêm
  user-id→generation ngẫu nhiên có TTL; JWT ký session_user_id/generation.
  Registry validate atomically cả jti và generation (Redis MGET/RAM lock),
  register Redis Lua compare-generation rồi SET NX và extend account TTL.
  Missing/expired account key luôn reject, tạo lại random không resurrect.
  Auth login, PUT/DELETE user và self-password cùng khóa row User; login
  giữ lock từ verify password qua register tới commit. Account API revoke
  generation trước sửa active/role/can_view_all_patients/password và commit;
  store lỗi503+rollback, commit lỗi chỉ logout an toàn, không khôi phục generation.
  Profile-only update giữ phiên; quyền nhóm vẫn đọc DB mỗi request/event,
  không ép login lại chỉ vì gán nhóm. Self-password revalidate token sau lock.
  Redis Cluster không hỗ trợ Lua hai key này; dùng shared standalone Redis.

## Auth safety (2026-09-27)

- Session registry (28/09, lát34): `services/access_sessions.py` owner
  allowlist jti→SHA256(token)/TTL; JWT issuance tạo UUID mới và register
  trước trả token. Token_matches_user kiểm credential binding + active
  registry nên logout/restart/eviction không làm token bị thu hồi sống lại.
  Redis URL SESSION_REDIS_URL hoặc REALTIME_REDIS_URL; production bắt buộc
  shared store, local DEBUG RAM bounded/lock. Store unavailable503 HTTP,
  không hiểu nhầm401 để xóa phiên. Token raw không lưu trong Redis.
- POST auth/logout thu hồi đúng jti, ngắt sockets dùng đúng token; phiên
  khác vẫn hoạt động. Header logout async owner chung cho legacy callers;
  chỉ clear storage/navigate sau success hoặc401, giữ nguyên khi503/network.
  Draft recovery chờ qlpk:logout:confirmed, không xóa khi click chưa xác nhận;
  header chờ cleanup promises trong native/iframe trước xóa user identity.
  Không sửa database/schema. Token đời trước registry cần login lại.
- Production guard (28/09, lát33): `core/security_config.py` kiểm khóa
  không default/không rỗng/tối thiểu32 bytes, HS256, expiry1–1440 phút.
  `main.py` gọi guard trước import database/API hoặc init_database. Issuer/
  decoder cũng kiểm để module standalone không bypass production policy.
  DEBUG giữ ngoại lệ phục vụ local; `scripts/check_security_config.py`
  vẫn báo production readiness độc lập DEBUG, không in giá trị secret.
- Config mặc định SECRET_KEY/SENDER_PASSWORD rỗng, expiry480 phút. Production
  yêu cầu exp integer trong JWT và issuer cap expires_delta theo cấu hình;
  không nhận token vô hạn. Secret/email credential thực phải inject ngoài
  source; xóa default không thu hồi secret đã lộ trong lịch sử Git.
- Login throttle (28/09, lát31): `core/login_throttle.py` giữ reservation
  theo IP/account trước DB/password verification. Redis Lua atomic khi có
  LOGIN_REDIS_URL hoặc REALTIME_REDIS_URL; không URL dùng memory bounded,
  lock/monotonic cho local single-process. Cấu hình có Redis mà lỗi trả503,
  không fallback memory làm mất bộ đếm. IP/account key HMAC, không ghi raw
  username/IP/password. Chi tiết ngưỡng và rollout ở data-contracts/ops.
- Credential-bound JWT (28/09, lát30): `services/auth.credential_binding`
  HMAC-SHA256 theo secret, domain separator, user ID/username/password hash;
  không đưa hash/plain password vào JWT. Issuer bắt buộc user và subject
  khớp. HTTP và socket lookup dùng token_matches_user để so binding với DB;
  decoder subject riêng không còn đủ để cấp quyền. Token thiếu binding
  bị từ chối, rollout yêu cầu đăng nhập lại một lần, không migration DB.
- Self password update khóa row trước kiểm mật khẩu hiện tại; tạo token
  replacement từ hash mới, chỉ trả sau commit. Header ghi token mới trước
  restart realtime, không reload workspace. Guard chặn double-submit và
  response thuộc phiên cũ không ghi đè token nếu user đã logout/đổi account.
  Admin reset dùng cùng hash owner nên token cũ tự vô hiệu. Không phải
  thu hồi từng phiên/logout-server; token non-expiring config vẫn giữ.
- `app/utils/account_access.py` là owner quyền quản trị cho API user/group/
  user_group. Guard sau require_auth đọc lại actor active và membership từ DB,
  không tin permissions phía client. Giữ session actor đến hết handler để
  relationship groups dùng được; session đóng trong finally.
- Quyền menu hiện có điều khiển đọc/sửa hồ sơ, nhóm và gán nhóm; mọi cấp
  quyền bị giới hạn bởi tập quyền actor. Tạo/khóa tài khoản, đổi role,
  can_view_all_patients và reset mật khẩu người khác dành cho admin vì role
  còn quyết định patient scope. Picker người khám và tự đổi mật khẩu không
  đi qua guard quản trị. Chi tiết endpoint ở data-contracts.
- `app/services/auth.py` giữ một decoder JWT chung cho HTTP user lookup
  trong `app/api/auth.py` và `app/realtime/socket.py`. Decoder không bỏ
  xác minh exp theo cấu hình phát token, không nhận subject rỗng/sai kiểu.
- Login và lookup user của HTTP/socket connect kiểm `is_active=True` trên
  DB; guards kiểm lại trước gọi handler. Last-login tracking dùng session
  riêng, rollback khi lỗi và close trong finally. Token transport vẫn
  Bearer/localStorage; chưa đổi sang HttpOnly/CSRF.
- Realtime `access.py` sở hữu page/workflow allowlist theo permission key
  của navigation.config; `socket.py` đọc quyền khi session DB còn mở và
  kiểm lại token/actor mỗi subscribe, thay tập room thay vì cộng dồn.
  Không cho client join entity/user/role room. Notification riêng chỉ đi
  user room, role notification chỉ đúng role; admin không tự vào role khác.
- `events.emit_catalog_changed` thu hồi socket trước phát catalog khi
  user/assignment đổi; group update/delete thu hồi mọi local socket để bỏ
  snapshot quyền cũ. Tự đổi password cũng thu hồi socket user. Client nối
  lại một lần khi server disconnect, dùng auth callback hiện hành, resync
  sau subscribe ack. Backend connect mới vẫn chặn inactive/invalid token.
  Áp dụng deployment một worker; chưa giải quyết revoke liên worker hoặc
  JWT cũ tái sử dụng sau đổi password, expiry khi socket nằm yên.
- `realtime/delivery.py` sở hữu payload projection và clinical scope tại
  thời điểm phát. Socket giữ token chỉ trong RAM theo sid, xóa khi disconnect;
  mỗi event gom candidate sid từ room, reauth/quyền DB, gửi riêng từng sid
  đúng một lần. Quyết định tái dùng trong cùng event cho các tab cùng token,
  không cache quyền giữa events. Lỗi lookup/scope không broadcast fallback.
- Appointment/examination/batch dùng assignment hiện hành; patient-only
  dùng clinical_access.patient_in_user_scope. Người ngoài scope chỉ nhận
  action changed để reload API đã phân quyền, không patient/visit IDs/data.
  Payload được phép giữ ID điều phối, bỏ tên/diagnosis/status và extra thừa;
  family_member_updated giữ data cho người có quyền để inline row không mất
  đồng bộ. Catalog/kho/tài liệu chung chỉ gửi metadata invalidation.
  Hiện một worker; delivery local này chưa hỗ trợ fanout liên worker Redis.

## Psychologist legacy page shell (2026-09-27)

- Tải tài liệu Lễ tân/TLG dùng một owner
  `receptionist/document-attachment-controls.js`; wrapper trong
  `components/document-section-ui-utils.js` chỉ delegate với adapter state.
  Guard theo DOM list, patient và page context; hai template đã nạp controls
  trước document-section/page. Không tái tạo loader song song ở từng màn.

- `personal-detail-modal-dry.js` đã gỡ cùng include cuối tại Tâm lý gia.
  Hành chính hiện dùng `patient-intake-form` → `patient-info-form` và ba
  inline panels; `personalDetailOptions.bindings` rỗng ngăn binding modal
  cũ. Các ghi chú lịch sử về `PersonalDetailModalDRY` không còn là runtime.
  Nháp địa chỉ hiện do `components/address-draft-utils.js` và page adapter
  xử lý; không khôi phục global modal chỉ để giữ tương thích không caller.

- `components/form-dom-utils.js` và `components/page-core-utils.js` hiện chỉ
  được template `psychologist-examination.html` nạp; API còn sống là
  `ClinicalFormDomUtils`/`ClinicalPageCoreUtils`. Alias `DoctorExamination*`
  và các nhánh populate/save/interaction không còn caller đã được gỡ.
- Bootstrap giữ thứ tự token → initializePage → relatives/print → waiting
  list/pagination → initializeForm → form controls. Form shell giữ reset →
  đăng ký tác vụ hoãn → sidebar/loaders → adapters; không đổi endpoint/payload.
- `tests/clinical_shell_utils.test.js` kiểm API mà page còn gọi, thứ tự bind,
  thiếu dependency, loading guard và response auto-save sau khi đổi ca.
  Đây không phải xác nhận toàn bộ luồng lưu thật; browser QA không ghi DB.
- Page `autoSavePatientField` là owner snapshot appointment/patient/token;
  bật recheck sau await và stale-response guard của core. Không suy lịch
  hẹn tự động khi page chưa chọn ca; contextToken lấy từ workspace runtime.
- `components/address-hierarchy-utils.js` giữ API địa chỉ legacy; các loader
  form/modal dùng chung `callVietnamAddressAPI` và fallback tên→mã lấy từ
  backend khi query trả404. `tests/address_hierarchy_fallback.test.js` kiểm
  helper, không chứng minh select legacy còn render: page hiện có `ward`
  dạng input và không có `modalWard` trong trạng thái đã kiểm 27/09.

## Medicine price updates

- `app/models/medicine_price_history.py` owns audit intervals;
  `app/modules/medicines/services/price_history.py` owns price changes,
  server timestamps, stale-write checks and paginated history.
  `app/api/medicine.py` owns authenticated GET/POST price routes.
- `app/static/js/medicines/price-editor.js` and
  `app/templates/partials/medicine-price-editor.html` own the separate price dialog;
  `clinic-catalog.js` integrates create/edit/reset without resubmitting price
  on ordinary edits. showInventoryOverlay handles stacking/focus while the
  original medicine form remains mounted. Catalog writer records initial prices
  for POST/Excel.

## Shared autocomplete field

`components/autocomplete-field.js/.css` và template macro
`components/_autocomplete_field.html` sở hữu control/tags/popup và
lifecycle async dùng chung. ICD adapter giữ contract ID/mã; DAV field8
adapter trong `clinical-examination-form.js` giữ tên/hàm lượng. Nguồn dữ
liệu không tự render UI. Chuẩn: `references/ui/autocomplete-field.md`.

- Phân trang 12 danh sách quản trị: `partials/clinic-pagination.html` và
  `static/js/components/clinic-pagination.js` là renderer/control dùng chung;
  page JS giữ API/bộ lọc và chọn adapter client hoặc metadata server.
  Token pagination Tủ thuốc được dùng chung qua `shared/clinic-workspace.css`.

- Visual foundation cho Tủ thuốc và 18 màn quản trị opt-in:
  `app/static/css/shared/clinic-workspace.css` (nền/header/summary/tokens,
  input/select, placeholder, nút và typography modal).
  `shared/admin-management-ui.css` giữ bảng/layout admin và fallback control
  cho trang không opt-in;
  page CSS giữ workflow riêng. Phạm vi và ngoại lệ được kiểm tại
  `scripts/check_brand_theme.py`; xem `references/ui/brand-theme.md`.

## Runtime Shape

- Application type: Flask server-rendered web app.
- Backend: Flask, Flask-CORS, SQLAlchemy, PostgreSQL, Alembic, JWT auth.
- Frontend: Jinja templates under `app/templates`, static CSS/JS under `app/static`, Bootstrap, jQuery, Flatpickr, selected chart/print libraries.
- Deployment: Docker Compose with `postgres`, `app`, `nginx`, optional `redis`.
- Target organization is workflow/domain-first and is tracked in `so-do-to-chuc.md`. The current `app/` layout remains the runtime source of truth until individual slices are migrated and validated.

## Entry Points

- `main.py`: creates the Flask app, optionally initializes DB tables through `Base.metadata.create_all()` only when `AUTO_CREATE_TABLES`/`DEBUG` allows it, configures CORS/host checks, registers all blueprints, and defines page routes.
- `app/realtime/`: Socket.IO realtime layer. `socket.py` owns server init/auth/rooms/event envelope, `events.py` owns domain event helpers (`appointment/examination/patient/order/survey/payment/inventory/catalog/document/finance/busy_schedule/notification`), and `presence.py` tracks current socket-connected users for dashboard online state in the current single-worker eventlet deployment.
- `app/core/config.py`: Pydantic settings from `.env`.
- `app/core/database.py`: SQLAlchemy engine, `SessionLocal`, `Base`, `get_db()`.
- `app/models/__init__.py`: model registry. Every live model with `__tablename__` must be imported/exported here so `Base.metadata`, schema checks, and Alembic see the same table set.
- `alembic/env.py`: migration environment. The active Alembic graph is a single current-schema baseline revision (`20260704_legacy_db_cleanup`); legacy pre-baseline revisions are archived under `_archive/alembic-prebaseline-20260705/`. Use `scripts/check_alembic_contract.py --strict` before changing migration graph or applying production migrations.

## Backend Module Groups

- Authentication and permissions: `app/api/auth.py`, `app/services/auth.py`, `app/models/user.py`, `app/models/group.py`. Use `scripts/check_api_auth_contract.py` to audit public/private route boundaries before adding or changing API endpoints.
- Appointments and reception: `app/api/appointment.py`, appointment services under `app/modules/appointments/services/` for query/stats, create, update, import, export, confirm, re-examination, deletion/cancel, status transitions, transfer, side effects, and canonical appointment-service selection/financial calculation, appointment read/edit view models under `app/modules/appointments/view_models/`, compatibility wrappers under `app/services/appointment_*`, `app/static/js/appointment-management.js` (entry: initialises `page.state`, runs bindings in the original order) plus page slices `appointment-management/page-{data,view,calendar,edit-modal,editor,add-modal,busy-sync}.js` that install the former closure functions on `window.AppointmentManagementPage`, with calendar render/event source/list/filter/conflict/patient-duplicate-warning/service-package/doctor-controls/edit-modal-ui/add-modal-ui/icd-multiselect/page-actions/status/legend/busy-schedule/panel/calendar connection/sync modal/runtime/table/status/date/filter/controls/page-interaction helpers under `app/static/js/appointment-management/`, `app/static/js/receptionist-new.js`, receptionist helpers under `app/static/js/receptionist/`. Module contexts: `references/modules/appointments.md`, `references/modules/receptionist.md`.
- Examinations: `app/api/examination.py`, `app/api/examination_details.py`, `app/api/examination_detail.py`, `app/api/examination_management.py`, read view models under `app/modules/examinations/view_models/`, services under `app/modules/examinations/services/` for create, details, lookup reads, management query, status transition, and hard delete cleanup, `app/models/examination.py`, `app/models/examination_detail.py`, `app/utils/examination_utils.py`, `app/static/js/doctor-examination.js`, `app/static/js/psychologist-examination.js`. Legacy progress-session and records/history route/service/model references are no longer part of the runtime. Module context: `references/modules/examinations.md`.
- Doctor examination: `app/static/js/doctor-examination.js` is the high-risk stateful page orchestrator for appointment/examination/detail/prescription/services APIs. Its active Doctor-private modules are listed in `references/doctor-examination-context.md`; prescription state remains owned only by `prescription-ui.js`, while `prescription-model.js`, `prescription-reexam-ui.js`, `prescription-medicine-search-ui.js`, `prescription-row-renderer.js`, and `prescription-history-ui.js` are stateless helpers; dose parsing/formatting belongs to the shared `prescriptions/shared/prescription-dose-utils.js`. Draft recovery is device-local IndexedDB only, canonical server data remains DB-first, and restore is explicit. Doctor persistence is a manual global-save transaction; do not infer that the Doctor screen uses the psychologist or legacy autosave policy. Shared components and shared order helpers remain separate owners. The reusable patient search/history modal lifecycle is owned by `components/patient-history-modal.js`, not by this page orchestrator.
- Psychologist examination: `app/static/js/psychologist-examination.js`, same `examination_details` storage with psychologist section mapping. Page-specific pure helpers now live under `app/static/js/psychologist-examination/` for core formatting/status helpers, while shared components/orders helpers handle the reusable shell behavior and the legacy orchestrator keeps wrapper/alias names for existing callers. Its patient search/history UI uses the same `QLPKPatientHistoryModal` instance and only supplies TLG-specific data/action adapters.
- Static delivery: `app/core/http_cache.py` marks `/static/...?v=` responses immutable; `app/core/static_modules.py` plus the `/static/js/<path>` route in `main.py` stamp relative ES module imports with the requested version so the Doctor/Psychologist module graphs cache until `app_version` changes. Shared legacy dropdown owner for relative/joint-exam patient search: `app/static/js/components/patient-search-dropdown.js`; shared history-tab prologue: `app/static/js/components/history-tab-core.js`.
- Prescriptions: `app/modules/prescriptions/api/public.py`, `app/modules/prescriptions/api/internal.py`, `app/modules/prescriptions/services/read_service.py`, `app/modules/prescriptions/services/save_service.py`, `app/modules/prescriptions/services/re_examination_service.py`, `app/modules/prescriptions/view_models/public_prescription.py`, `app/modules/prescriptions/view_models/print_prescription.py`, `app/models/prescription.py`, verify/frontend print/modal preview/modal print/shared document assets under `app/static/js/prescriptions/` and `app/static/css/prescriptions/`, prescription UI bridge inside examination JS/templates. Module context: `references/modules/prescriptions.md`.
- Medicine/inventory: stock reads remain in `app/api/medicine.py`, models `medicine.py`, `medicine_batch.py`, `medicine_transaction.py`, and `medicine-management.js` (shared core) plus classic slices `medicines/management-{list,form,stock,batch-import,suppliers,overview,import-ledger}.js` loaded in that order; imports/opening registration belong to `app/modules/medicines/services/inventory_service.py` (manual count retired). `catalog_service.py` owns DAV-only clinic creation and settings updates; source mapping requires its trusted Python keyword `allow_reference_mapping=True`. `reference_review.py` owns authorized human preview/confirmation through `/api/medicines/<id>/reference-review`; `medicines/reference-review.js` owns the separate review modal and shared autocomplete adapter. User review was restored by the latest 2026-09-14 decision; previous automated links require human confirmation. `catalog_excel.py` shares the creation writer for Excel and its template. `medicines/clinic-catalog.js` owns DAV selection/reset for creation and locked source display for ordinary editing. The DAV screen/API (`medicine_reference_catalog.py`, `modules/medicines/api/reference_catalog.py`, `medicine-reference-catalog.html`, `medicines/reference-catalog.js`) still handles source sync/search/detail; its data links to clinic medicines by FK but never owns stock.
- Clinical orders: `app/modules/orders/api/chi_dinh.py`, `app/modules/orders/api/survey.py`, clinical query/mutation/result-file services under `app/modules/orders/services/`, view models under `app/modules/orders/view_models/`, compatibility wrapper `app/api/chi_dinh.py`, and `app/models/chi_dinh.py`. The retired order catalog API/model/tables were removed in the 2026-08-31 cleanup. Module context: `references/modules/orders.md`.
- Payment: `app/api/payment_waiting.py`, `app/templates/payment-waiting.html`, `app/static/js/payment-waiting.js` (core: state, helpers, ready/bindEvents, toast) plus classic slices `payment-waiting/{list,detail,services,invoice,output}.js` loaded in that order.
- Surveys: `app/api/survey_*`, `app/models/survey_*`, survey template/session/response screens. CRUD owner `survey_templates.py`; `survey_template_management.py` only public list/duplicate. Scoring/validation owner `app/utils/survey_scoring.py`; context `references/modules/surveys.md`.
- Supporting catalogs: ICD, active ingredients, allergens, services, packages, holidays, documents, addresses, busy schedules.

## Order-survey lifecycle owner (2026-09-05)

`app/modules/orders/services/survey_lifecycle.py` is shared by link generation,
submission, order mutation and legacy reconciliation. It owns order status
transitions and the atomic answer/score/session/order submission transaction.
`app/static/js/orders/order-status-utils.js` owns shared display labels; CLS,
Doctor and psychologist consume the same statuses. Order-scoped result reads
live in the existing order blueprint; Xem kết quả opens the shared
`patient-survey.html?review_order_id=<id>` renderer in read-only mode.
`app/modules/orders/services/survey_draft.py` owns partial answer validation,
session snapshots and revision-based draft writes. Patient autosave uses
token-scoped `/api/survey-sessions/draft`; physician review polls the authorized
order result endpoint every three seconds until closure. Draft data belongs
to SurveySession, not SurveyResponse; only final submission creates a result.
CLS detail is a single view: `loadOrderDetail` loads survey content directly,
with no Bootstrap detail-tab state/listeners. Overview actions are owned by
`renderSurveyActions`; the list's two status tabs remain separate filters.
The same service owns result availability, manual finish and deadline expiry.
The order blueprint reconciles deadlines on workflow API requests; the query
service returns two-tab counts and the next expiry for a one-shot UI refresh.

## Frontend Structure

- Each operational page is a Jinja template with its own JS file.
- Shared user feedback is owned by `app/static/js/shared/user-feedback.js`, loaded through `app/templates/partials/user-feedback-runtime.html`, styled by `app/static/css/shared/feedback-tokens.css`, and guarded by `scripts/check_user_feedback_contract.py`. Page/workflow wrappers are adapters only; they do not own toast DOM or rendering.
- Common auth retry/header behavior lives in `app/static/js/utils.js`.
- Realtime frontend lives in `app/static/js/realtime-client.js` and `app/static/js/realtime-page-hooks.js`. The app header loader starts the websocket client for top-level workspace pages; workspace parent forwards realtime events into iframe tabs. Legacy standalone pages that do not mount the shared header, such as `chi-tieu.html`, include/start the realtime client directly. Pages register small reload hooks by event type and keep workflow state ownership local; doctor/TLG hooks refresh lists/side panels and avoid reloading the active clinical form.
- Shared header command surfaces live in `app/static/templates/app-header/header.html`, `app/static/js/app-header-loader.js`, and `app/static/css/components/app-header.css`. Header notification center uses backend inbox API `app/api/notification.py`, persistent notification creation/query logic in `app/services/notification_service.py`, and realtime delivery via `notification.changed` from `app/realtime/events.py`. Header global search uses `app/api/global_search.py` at `/api/global-search` and is patient-first: it returns a `patients` group and a `history` group for the selected patient, with backend-owned action metadata only on patient rows. Receptionist/admin use the explicit `Sao chép vào form` action; doctor/psychologist use the explicit `Xem lịch sử` action through `window.QLPKGlobalSearchActions`. Do not add page-local notification dropdowns or local patient search boxes.
- Menu permission filtering lives in the app shell (`app/static/js/app-header-loader.js` → `QLPKWorkspaceShell.renderLauncher()` from `qlpk_permissions`); the legacy `permission-check.js` (sidebar `data-permission` menus) was removed on 27/09/2026 because no page still renders those selectors.
- DRY sidebar template lives in `app/static/templates/dry-sidebar/sidebar.html` and is loaded by `sidebar-dry-loader.js`.
- Shared modal/components exist under `app/templates/partials`, `app/static/templates`, and `app/static/js/components`.

## Core Clinical Flow

1. Reception creates or updates a `Patient` and `Appointment`.
2. Confirmed appointments create or link an `Examination`.
3. Doctor/psychologist screens load an appointment, patient, examination, detail sections, prescriptions, services, and orders.
4. Doctor uses its explicit global manual-save transaction for `PUT /api/appointments/<id>`, scoped detail writes, and dirty support modules; psychologist persistence follows its own workflow contract.
5. Completed clinical work moves the examination toward payment via `/examinations/<id>/transfer-to-payment`.
6. Payment confirmation updates payment/examination state.

## Important Couplings

- `app/modules/appointments/services/query_service.py` owns `GET /api/appointments/` list query/filter/pagination behavior and `GET /api/appointments/stats` read stats while the route keeps the legacy URL/auth/response wrapper.
- `app/modules/appointments/view_models/appointment_response.py` shapes appointment API response data consumed by several frontend pages; `app/services/appointment_*` and `app/utils/appointment_helpers.py` keep legacy wrapper imports.
- `app/api/appointment.py` updates `appointments`, `patients`, `examinations`, and selected `examination_details` fields through appointment module services; create appointment lives in `creation_service.py`; batch import lives in `import_service.py`; re-examination direct API and prescription helpers live in `re_examination_service.py`; deletion/cancel lifecycle lives in `deletion_service.py`; status transition mutations live in `status_transition_service.py`; calendar sync, calendar create for legacy re-examination flows, transfer-to-doctor calendar sync, update side-effect orchestration, and appointment reminder scheduling now live in `side_effects.py`, while the route keeps a thin compatibility wrapper for legacy calendar callers.
- Receptionist frontend helpers: `appointment-submit.js`, `service-package-selection.js`, `appointment-prefill.js`, `appointment-date-highlight.js`, `appointment-list-controls.js`, `page-session-bootstrap.js`, `page-core-utils.js`, `formatters.js`, document attachment helpers, medical info helpers, profile autocomplete, duplicate patient modal, ICD legacy multiselect, queue/print, form data/reset/bootstrap/input/save controls, personal-detail controls, patient populate/address/vitals/history, catalog loaders, relatives table, and joint-exam orchestration. `app/static/js/receptionist-new.js` remains the legacy orchestrator and keeps global UI behavior.
- Receptionist quick patient search cleanup: old `app/static/js/receptionist/patient-search.js` and the left-side quick-search DOM were removed from runtime on 2026-06-16. Do not restore a local patient search panel; patient lookup/copy now goes through shared `qlpkGlobalSearchInput` and the receptionist `QLPKGlobalSearchActions` bridge in `app/static/js/receptionist-new.js`.
- `app/utils/examination_utils.py` maps old generic sections to doctor/psychologist-specific section names.
- `doctor-examination.js` has stateful caches, load tokens, and patient-switch lifecycle; stale state bugs usually originate there.

## Organization Direction

- Move toward domain/workflow-first structure gradually: prescriptions, appointments, examinations, orders, payments, surveys.
- Start with module islands and view models/services before moving templates/static assets.
- Keep old URLs and template paths stable until a workflow-specific smoke check proves the move is safe.
- Do not treat the target tree as a command to move everything at once; it is a migration roadmap.

## Runtime Boundary And Cleanup (2026-08-23)

- Active frontend entrypoints remain the Jinja page templates and their page
  orchestrators: `doctor-examination.js`, `psychologist-examination.js`,
  `receptionist-new.js`, `order-management.js`, and the explicitly loaded
  shared components listed by each template. The active orders frontend
  boundary is intentionally small: status, selection-state, and autocomplete
  helpers are loaded where needed; catalog/tree/performer/print orchestration
  stays with the page owners until a separate contract justifies extraction.
- Retired dead code removed after caller/static-reference audit on 2026-08-23:
  the unused component/order helper cluster under
  `app/static/js/components/` and `app/static/js/orders/`, the legacy
  `notes-attachment-chip.js` and `reexam-calendar.js`, their unused CSS, the
  old global `style.css`, and the detached dry re-examination-calendar
  template. These files had no active template link, import, route, or runtime
  caller; historical notes may still mention them as former owners.
- Compatibility wrappers are not dead code. Keep the appointment service
  wrappers, prescription public/view-model wrappers, and old orders API
  wrappers until their import-path migration has a dedicated contract and
  smoke check. They delegate to the canonical module owners and must not gain
  new logic.
- `_archive/`, `backups/`, `uploads/`, `data/`, `tmp/`, `designs/`, and
  `output/` are retained intentionally as operational/archive boundaries;
  cleanup does not delete them. The same applies to the currently loaded
  Doctor module set and shared patient-history bridges.
- New extraction rule: create a helper/module only when it has a distinct
  lifecycle or contract owner, or is consumed by at least two active workflow
  owners. A small function that has one caller stays next to that caller;
  every extracted module must be listed in this map and in its workflow module
  context. Do not keep a compatibility wrapper for a file that has no active
  caller.
