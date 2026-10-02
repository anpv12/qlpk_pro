# QLPK Smoke Checks

## Code health toàn dự án (2026-09-29, lát71)

- [ ] `scripts/check_code_health.py` OK (≤600 dòng mỗi file app, 0 lỗi ESLint,
  không hàm complexity ≥20); `pytest tests/test_code_health.py
  tests/test_no_silent_except.py tests/test_production_session_config.py`.
- [ ] Sửa file có `// Parts …` hoặc `// Continued in …`: sửa trong part, giữ
  thứ tự nạp ở template/entry/loader; test đọc qua `tests/helpers/module-source.js`.
- [ ] Browser: 0 request ra ngoài (vendor tự host), 0 lỗi JS, icon/font hiển thị.
- [ ] Thêm `!important`/handler inline/CDN mới sẽ fail frontend contract.

## Tech debt theo màn (2026-09-28, lát67–70)

- [ ] Tủ thuốc: xem mục Clinic Medicine Inventory (lõi + 7 file
  `medicines/management-*.js`, nút “Xóa đã chọn” hiện khi tick).
- [ ] Lịch hẹn: `node --test tests/appointment_management_modules.test.js`
  đạt (thứ tự nạp slice, mọi `page.X`/`state.X` có nơi cài/khởi tạo). Thêm hàm
  mới vào slice phải liệt kê trong `Object.assign(page, …)`; state mới khai báo
  ở `Object.assign(state, …)` của entry. Browser: lịch tải, đổi view, tìm,
  lọc bác sĩ, mở sửa (dịch vụ/gói, loại khám, tóm tắt), thêm, kéo thả, đổi
  trạng thái/xóa có xác nhận, modal đồng bộ Google Calendar; 0 lỗi JS.
- [ ] Chỉ định: `node --test tests/order_management_modules.test.js
  tests/order_*.test.js` và `pytest tests/test_workflow_contracts.py` đạt.
  Browser: hai tab danh sách, mở chỉ định có kết quả khảo sát / chưa tạo link /
  ghi chú nhập tay / mẫu lỗi, lọc tên, chọn dòng, xóa có xác nhận; 0 lỗi JS.
- [ ] Thu ngân: `node --test tests/payment_waiting_modules.test.js` đạt.
  Browser: lọc trạng thái/tìm/phân trang, mở hóa đơn, nhập tiền, sửa/thêm/xóa
  dịch vụ, xác nhận hóa đơn, 4 luồng trả về có 2 bước xác nhận, in; 0 lỗi JS.

## Dữ liệu thật local, chỉ đọc (2026-09-28)

- [x] Luồng ghi trên BẢN SAO DB local (pg_dump → cụm PostgreSQL tạm /tmp, Google/
  email giả lập, đã xóa sau test): Doctor Lưu (loi_dan vào DB), Hoàn thành
  (WAITING_PAYMENT), Chuyển khám sang bác sĩ khác (doctor_id đổi, job hoàn tất
  ngay), Lễ tân sửa + Lưu (notes vào DB). 0 lỗi JS, 0 API lỗi.
- [x] Lỗi thật phát hiện và đã sửa: (1) modal Chuyển khám gọi `/users/` bị 403
  với bác sĩ (API quản trị) → danh sách người nhận trống; thêm
  `/users/transfer-recipients` chỉ trả id/tên/role người đang hoạt động.
  (2) job lịch treo mãi khi bác sĩ cũ/mới chưa nối Google → nay hoàn tất và
  ghi chú `old_calendar_disconnected`/`target_calendar_disconnected`, vẫn giữ
  liên kết lịch cũ để đối soát. 911 Python + 738 Node đạt.

- [x] Server QA riêng (cổng ngẫu nhiên) nối DB local ở chế độ READ ONLY cấp
  PostgreSQL; trình duyệt chặn mọi POST/PUT/DELETE. Phiên cookie cấp trong
  tiến trình QA cho doctor 24, TLG 26, staff, admin; đã dừng và xóa sau test.
- [x] Doctor: 197 thẻ chờ, đổi 2 ca đổi đúng bệnh nhân, đơn thuốc 8 dòng, modal
  lịch sử 4 lượt + 4 tab dữ liệu; TLG 26: 6 thẻ, mở ca đúng tên; Lễ tân: 20 thẻ,
  sửa 2 ca đổi đúng bệnh nhân/bác sĩ/dịch vụ; Calendar: lịch + modal đồng bộ
  hiện 1 lịch. 0 lỗi JS ngoài WebSocket (server QA không chạy Socket.IO), 0 API lỗi.
- [x] Realtime cookie: server cô lập có Socket.IO, đăng nhập form → socket kết nối
  bằng cookie + CSRF, không token storage; logout → socket ngắt.
- [ ] Chưa gọi Google Calendar thật (sẽ đổi lịch thật); chưa đăng nhập bằng mật
  khẩu thật trên 8000 (cần người dùng).

## Cookie session cutover (2026-09-28, lát65)

- [x] Gate token ownership; 909 Python + 738 Node; feedback/diff đạt.
- [x] Chrome 19 trang legacy qua transport; E2E cookie login/logout/redirect/
  CSRF/không Authorization/public page với Flask auth thật, DB mock.
- [ ] Đăng nhập tài khoản thật trên HTTPS production và dữ liệu thật; chưa pass
  visual/interactive QA thật.

## Calendar scope đóng (2026-09-28, lát64)

- [x] OAuth state/PKCE: thiếu/giả/khác trình duyệt/hết hạn/replay bị từ chối,
  logout/khóa tài khoản trước hoặc trong lúc đổi code không lưu kết nối;
  store phiên lỗi fail-closed; không phản chiếu lỗi. Real library S256 check.
- [x] Migration adopt/refuse; route chỉ drain job đã commit;189 Python +733 Node.
- [ ] Tài khoản Google thật, `alembic upgrade head` và worker trên môi trường
  vận hành là bước deploy của owner; chưa pass visual/interactive QA thật.

## Calendar API access (2026-09-28, lát63)

- [x]30 tests mới;155 Python +733 Node; feedback/diff đạt. Actor spoof/disabled,
  mixed forbidden/missing batch no Google calls, cancelled409, input/date400.
- [x] Read view-all/historicpsych giữ, không write bypass. Clinical sync own
  calendar only; staff broadcast; delete-all missing dates reject, own events
  only; validate-connections clinical chỉ own user. Auth HTTP401/400/403/200.
- [x] Isolated PG actual Lock: owner/status/active changes recheck; bulk delete
  chờ transfer commit không xóa lịch của owner mới. PG fixture đóng finally.
- [ ] UI bulk>100/error states/provider account thật chưa QA; full writer
  outbox/OAuth security/rollout còn mở. Chưa pass visual/interactive QA thật.

## Legacy Calendar mapping safety (2026-09-28, lát62)

- [x]25 tests mới;125 Python +733 Node. Strict verify phân biệt404/410/
  cancelled với network/auth/quota; giữ default boolean read-only contract.
- [x] Flask route + isolated PG: manual sync unknown không create/drop mapping;
  duplicate cùng ID không delete live provider event, khác ID chỉ remove
  mapping khi delete success. Update/cancel không mất mapping khi Google lỗi.
- [x] Delete-all disconnected/fake404 text giữ links; HTTP404/410 remove;
  quota429/403 rateLimitExceeded tối đa3 attempts. Feedback/diff gates đạt.
- [ ] Common writer outbox/locks, Calendar API access/status scope và Google
  thật chưa QA; chưa pass visual/interactive QA clinical thật.

## Calendar retry recovery (2026-09-28, lát61)

- [x]100 Python +733 Node;18 cases mới, Calendar tổng36. Missing404/410/
  cancelled khác network/auth/quota failures; default provider bool giữ nguyên.
- [x] Stateful remote fixture + isolated PG: delete Google rồi rollback DB,
  chuyển về owner cũ tự phục hồi; live target không tạo đôi; tombstone rotate
  persist trước dùng, commit rotation fail vẫn dùng ID cũ ở lần kế tiếp.
- [x] GET404 sau insert409 không tự suy đoán tombstone; lỗi không đổi ID.
- [ ] Google thật/rollout chưa kiểm; writer chung và completed-job reconciliation
  còn mở; chưa pass visual/interactive QA clinical thật.

## Calendar transfer outbox (2026-09-28, lát60)

- [x]18 tests mới, targeted82 Python +733 Node. Transaction rollback/commit
  failure không để job hoặc external call; uncommitted job không visible.
- [x] PostgreSQL thật cô lập: worker commit failure giữ durable job, retries
  cùng provider ID, delete failure giữ mapping, giữ staff event, missing
  connection/backoff/legacy NULL pending, chuyển tiếp/out-of-order/cancelled.
- [x] pg_stat_activity quan sát lock:2 workers không create đôi; transfer
  đang commit thì worker đợi và đọc owner mới. Migration upgrade/downgrade
  fixture, Alembic head duy nhất, feedback/static workflow gates đạt.
- [ ] Migration/consumer chưa rollout; Google network/account thật chưa QA;
  manual-sync/cancel/update writers chưa chung lock/outbox. Chưa pass
  visual/interactive QA clinical thật; không kết luận full Calendar pass.

## Transfer backend scope/batch (2026-09-28, lát59)

- [x]64 Python (27 transfer mới) +733 Node; malformed IDs/role/JSON, actor/target
  activity/role, current ownership, view-all không cấp write, mixed batch rollback.
- [x] PostgreSQL riêng: missing/deleted/not-confirmed/payment/duplicate exam
  reject toàn batch, mapping/no-op, unexpected exception rollback; HTTP status
  400/403/404/409, success count, chỉ committed changed IDs emit/notify.
- [x] pg_stat_activity quan sát row-lock wait:2 transfers cùng ca, target disable,
  examination PAID; đọc lại sau lock không overwrite state/ownership mới.
- [ ] Lát60 bỏ external Calendar precommit ở transfer; vẫn chưa audit lock
  order toàn workflows; chưa pass visual/interactive QA clinical thật.

## Transfer modal session (2026-09-28, lát58)

- [x]733 Node +17 Python workflow/globals; before-save/duplicate/close guards,
  stale patient/legacy/cookie revision, anonymous, incomplete success/count.
- [x] Chrome actual template/jQuery/Bootstrap + cookie: người nhận, POST CSRF/
  no Bearer, callback đúng; invalidation trong POST không callback/toast/POST lại.
  Browser/server đóng; feedback/diff-check đạt.
- [ ] API/DB fixture, chưa pass visual/interactive QA clinical thật; backend
  transfer actor/target permissions, atomic batch/concurrency chưa hoàn tất.

## Receptionist catalog session (2026-09-28, lát57)

- [x]733 Node +17 Python workflow/globals, feedback/diff-check đạt;15 tests
  legacy/cookie, latest response wins, stale JSON,401/503/network/non-array.
- [x] Chrome real cookie/source: doctor/service load, literal markup names,
  refresh giữ doctor selection,1 bộ listeners, focus giữ ID/typing clear,
  mouse+keyboard chọn dịch vụ, empty state. Browser/server QA đã đóng.
- [ ] API/DOM fixtures, chưa pass visual/interactive QA clinical thật/dense/
  sparse. Mounted cache invalidation và full cookie template cutover còn mở.

## Shared patient transport (2026-09-28, lát56)

- [x]718 Node +17 Python workflow/globals, feedback/diff-check đạt. Cookie/
  legacy relatives/modal/uploads/preview/download; multipart không ép header.
- [x] Upload stale JSON không success, modal session error không fallback;
  patient switch trong Blob/422 fallback không mở/download tệp cũ.
- [x] Chrome cookie thật/source: relatives có dòng, modal relatives read,
  2 upload paths CSRF/multipart, click file rendered→đổi patient chặn Blob cũ.
  Browser/server đã đóng; DB/API fixture, không dữ liệu vận hành.
- [ ] Chưa pass visual/interactive QA clinical thật/dense/sparse; template
  cookie binding và full workflow cutover vẫn mở.

## Medical-history session transport (2026-09-28, lát55)

- [x] Node cookie/legacy: ICD exact/suggestions, family, allergen read/create,
  upload JSON/FormData headers/CSRF; session invalidation rejects loaders.
- [x] Đổi bệnh nhân/session trong Blob không mở file cũ; upload lỗi trả muộn
  không toast hoặc xóa input mới.710 Node toàn bộ đạt.
- [x] Chrome actual ES module graph + real cookie/DB mock: ICD/gợi ý render,
  chọn supporter, upload multipart boundary+CSRF; stale Blob không mở tệp.
- [x]17 Python workflow/globals, feedback contract và diff-check đạt;
  Chrome/server QA đã đóng.
- [ ] Component/API fixture, không thay dense/sparse/interactive clinical
  dữ liệu thật: chưa pass visual/interactive QA. Full cookie rollout còn mở.

## Clinical session bootstrap (2026-09-28, lát54)

- [x] Ba page runtime chờ cookie bootstrap; stale legacy token không vượt gate;
  API POST có session/CSRF, không Bearer.401/503/changed không khởi tạo trang.
- [x]702 Node tests; legacy raw/Bearer/JSON/alias, logout session-only revoke,
  late response không xóa credential mới. Bootstrap order của TLG giữ nguyên.
- [x] Chrome cookie thật/DB mock: delayed bootstrap cả3 runtime, POST API
  fixture, same-origin iframe bootstrap, changed/503 fail closed.
- [x]62 Python session/workflow/globals/static; feedback contract/diff-check;
  Chrome header/password/realtime/logout và scoped IndexedDB cleanup hồi quy.
- [ ] Chưa pass visual/interactive QA clinical dữ liệu thật/dense states.
  Không đổi CSS/layout; không xác nhận mounted clinical UI clear khi invalidation,
  không bật cookie templates và không kết luận full cutover đã hoàn tất.

## Shortcut session lifecycle (2026-09-28, lát53)

- [x] No private Bearer; cookie doctor không dùng stale admin storage.
  Late response/logout/invalidation không kích hoạt cache phím tắt cũ.
- [x] Chrome source/form: mine-only, Ctrl+K, POST CSRF save; invalidate clear
  rows/inert form, programmatic submit và keyboard không tạo request/navigation.
- [ ] Synthetic session/API fixture, chưa pass visual/interactive QA clinical
  thật/dense/admin controls; cookie rollout còn mở. Rotation cần reload settings.

## Shared text expansion / PDF transport (2026-09-28, lát52)

- [x] Runtime + management không trùng loader; refresh cache đúng active API;
  pending load không phục hồi cache sau invalidation; đọc isLoaded không hủy load.
- [x] Chrome cookie thật/source+API fixtures: manager rows, refresh, Tab
  expansion, Excel authenticated download, PDF POST CSRF→Blob, cache clear.
- [x]681 Node +33 Python workflow/globals/PDF đạt; no DB writes, processes đóng.
- [ ] PDF viewer dùng stub, không xác nhận bản in lâm sàng; chưa pass visual/
  interactive QA clinical/dense state. Full cookie cutover vẫn còn mở.

## Shared catalog transport (2026-09-28, lát51)

- [x]5 loaders không tự đọc/gắn token; unit cả legacy/cookie giữ mapping,
  read auth và POST CSRF/body. ICD không gọi legacy callback; session lỗi throw.
- [x] Chrome cookie thật + components thật: nghề nghiệp/tỉnh/xã tải/chọn,
  tạo nghề nghiệp qua POST CSRF, ICD trả rows; không Bearer. API fixtures.
- [ ] Chưa pass visual/interactive QA clinical dữ liệu thật/dense states;
  không đổi HTML/CSS/component layout, không hoàn tất cookie cutover.

## Cookie login form (2026-09-28, lát50)

- [x] Shared action single-submit, revision stale không redirect/clear storage;
  error không fallback Bearer.401/429/503/lock-unavailable báo rõ, nút thử lại.
- [x] Chrome actual form/source + Flask mock DB:429 delay35/retry rồi HttpOnly
  cookie login thành công, chỉ1 auth request, không /check/me/Bearer/identity
  storage, /auth/session200. Screenshot error desktop đã xem.
- [ ] Chưa full cookie template cutover hoặc real clinical/iframe E2E; không
  coi login fixture là pass visual/interactive QA toàn bộ workflow.

## Workspace cookie access (2026-09-28, lát49)

- [x] Stale admin storage không vượt cookie permissions; đọc đúng owner tabs.
  openHref route bị cấm trả false; pending leave không ghi state dưới account mới.
- [x] Chrome source/CSS thật: allowed iframe mở, rotation cùng user giữ pane,
  invalidation ẩn/inert host, account mới không mở tab/ghi owner state cũ.
- [x] Header/password/logout/IndexedDB Chrome fixture regression vẫn đạt.
- [ ] Chưa pass visual/interactive QA clinical/dense workspace thật; iframe
  background session binding, page guards và full cookie cutover vẫn còn mở.

## Guarded response streams (2026-09-28, lát48)

- [x] Legacy/cookie: body ổn định, reader/BYOB, tee, async iterator, pipeTo,
  pipeThrough và new Response(body) không trả chunk đến muộn sau đổi phiên.
- [x] Chrome14 ca HTTP stream chậm thật:7 consumer types x2 session modes;
  no pageerror/late chunk. Identity giả lập, không dùng dữ liệu khám.
- [ ] Không thay QA clinical thật; cookie cutover, suspended-tab draft cleanup
  và kiểm thử hệ thống còn mở. Bytes đã giao không thể thu hồi.

## Cookie logout / draft cleanup (2026-09-28, lát47)

- [x] Shared mutation lock giữ tới callback cleanup xong; server lỗi không dọn.
- [x] Header await main/iframe pendingCleanup; false/rejection không redirect;
  retry không logout lần hai, anonymous revision guard giữ account mới an toàn.
- [x] Draft lấy cookie identity RAM, cleanup userId xác nhận; pending write của
  user cũ được chờ, user khác giữ nguyên. Write đổi revision kể cả cùng user
  không trở thành nháp hiện hành và bị xóa theo captureId.
- [x] Chrome header/cookie/IndexedDB thật, mock DB/clinical shell: logout→user7
  records mất, user8 giữ, redirect login và /auth/session401. Processes đóng.
- [ ] Suspended tabs/delayed invalidation, cookie cutover toàn bộ và clinical
  data thật/dense states: chưa pass visual/interactive QA toàn workflow.

## Header cookie integration (2026-09-28, lát46)

- [x] Cookie header identity RAM, không stale storage/ghi qlpk_user; profile/
  search/notification không Bearer, blocked session không fallback, JSON stale
  propagate. Password actions không ghi token/restart old socket.
- [x] Chrome real header/template/cookie/DB mocked: profile/search/notification
  empty/form password rotation + realtime reconnect, không pageerror/storage
  JWT; đủ CSS/token/icon QA, ảnh đã xem. QA processes đóng.
- [x] Cookie logout actions + đúng-user draft cleanup nối ở lát47; xem các
  giới hạn đa tab/cutover phía trên. Chưa bật templates cookie.
- [ ] Clinical/full/dense UI và password button token còn mở; chưa pass
  visual/interactive QA workflow thật. Legacy regression vẫn đạt.

## Cookie API transport binding (2026-09-28, lát45)

- [x] Singleton owner/actions dùng native fetch: không recursion/startup
  request/Bearer bootstrap; stale storage không vượt anonymous cookie.
- [x] Fetch+jQuery ID+CSRF, late body/clone revision guard, direct auth mutate
  reject; locked login/password/logout hoạt động;401 expire/no replay.
- [x] Chrome2 tabs/cookie thật/DB mocked: profile, global:false write,
  multipart, blob; password rotation invalidate tab khác/chặn ghi phiên cũ,
  logout propagation, no JWT storage. Legacy regression cũng đạt; QA đóng.
- [ ] Coordinated template/caller/iframe/draft cutover và clinical real-data
  QA còn mở; chưa pass visual/interactive QA. Raw stream chưa có guard.

## jQuery canonical transport (2026-09-28, lát44)

- [x] Same-origin jQuery qua fetch owner, global:false vẫn auth; external/
  script/JSONP không auto-auth. Late response không success/responseText cũ.
- [x] Chrome real jQuery: error HTTP, malformed JSON parsererror, abort,
  timeout, multipart upload, blob download, no replay;4 catalog templates
  với fixture API9 GET auth/3 downloads/0 pageerror. QA processes đã đóng.
- [x] Unit responseType blob/arraybuffer/json/text, headers/status/body,
  abort suppress late completion; sync fail trước request, duplicate install.
- [ ] Cookie cutover/raw stream/clinical UI/draft lifecycle và dữ liệu thật
  còn mở; chưa pass visual/interactive QA toàn workflow.

## Canonical API transport (2026-09-28, lát43)

- [x] Shared partial nạp transport trước utils/callers; duplicate load và
  jQuery install không nhân wrapper. Bốn màn danh mục không tự gắn token.
- [x] Same-origin only, external base/URL/Request không gắn credential;
  headers/body/options giữ nguyên,401 không replay. Fetch/body parsing/clone
  stale sau đổi account reject; native Response getters vẫn chạy đúng.
- [x] Chrome4 templates/fixture API:9 GET authenticated,3 download,0 pageerror;
  Chrome2 origins6 requests kiểm no credential leak. QA processes đóng.
- [ ] Cookie frontend migration, jQuery stale response/raw stream và QA
  dữ liệu thật còn mở; chưa pass visual/interactive QA toàn workflow.

## Management examinations scope/filter (2026-09-28, lát42)

- [x] Isolated PostgreSQL9 ca: doctor chỉ assignment, psychologist cả legacy,
  admin/staff/full scope đầy đủ; role khác rỗng. Cùng patient không mở rộng scope.
- [x] Detail/status ca ngoài quyền/inactive/appointment xóa404, không emit/mutate;
  ca được phép đọc đúng, đổi trạng thái đúng; body/filter sai400 không500.
- [x] Stats/list cùng ngày/bác sĩ/search không dấu; inactive/deleted không tính,
  ngày cuối inclusive/ngày kế không lọt, PAID không badge, đủ key0 và status
  selection không giới hạn badge khác. Pagination bounds và full scope đúng.
- [x] Cookie stats dùng actor từ auth, không đòi Authorization header; DB lỗi
  response JSON500; absent/inactive actor scoped SQL false. QA cluster đóng.
- [ ] Browser workflow thật và reassignment/write concurrency toàn luồng:
  chưa pass visual/interactive QA; không coi HTTP fixture là nghiệm thu UI.

## Profile/session realtime binding (2026-09-28, lát41)

- [x] /users/me giữ profile extras, đọc quyền mới từ owner chung, no-store;
  account mất/khóa sau guard401; permission malformed fail closed.
- [x] Cookie bind không fallback legacy storage; invalidation đóng socket,
  old callbacks không subscribe/dispatch/reconnect hoặc làm bẩn event dedup.
  Rebind gỡ listener cũ; explicit stop không tự khởi động khi identity đổi.
- [x] Chrome cookie+WebSocket thật, DB mocked: login/subscribe/resync,
  password rotate/socket replacement, profile read, logout/disconnect;
  không token storage/page errors. QA processes đóng.
- [ ] Template/callers cutover và dữ liệu khám thật: chưa pass
  visual/interactive QA. Backend/frontend integration fixture không thay nghiệm thu.

## Cookie identity/actions integration preparation (2026-09-28)

- [x] Login/bootstrap/check/password rotate trả cùng quyền mới từ DB;
  malformed permission lists fail closed, admin list giữ nguyên.
- [x] Cookie login/password/logout actions dùng cùng Web Lock, duplicate
  local reject; thiếu locks reject trước network. Cookie payload strict RAM-only.
- [x] Logout chờ sau session switch không POST; outage503 không confirmed,
  response200 thiếu success hoặc stale JSON không clear identity/cho phép cleanup.
- [x] Password400 giữ phiên, ambiguous network/500 block tới reverify; không replay.
- [x] Chrome2 tabs với cookie/Web Locks thật, Flask DB mocked: login/quyền/
  password rotate/logout, queued logout account-switch reject, storage trống.
- [ ] Nối vào login/header/templates/socket/callers và real clinical draft/
  iframe QA. Chưa pass visual/interactive QA; không nới completion theo factories.

## Browser session owner preparation (2026-09-28)

- [x] Single-flight bootstrap; malformed payload fail closed, network failure
  giữ identity RAM nhưng block writes;401 anonymous/expired không retry.
- [x] Chặn late bootstrap/response/JSON parsing sau revision change; Request
  headers/body giữ, không mutate init, same-origin only, không Bearer.
- [x] GET có session ID, writes thêm CSRF, server reject ID lệch cookie;
  BroadcastChannel chỉ invalidation, không sync credentials/identity qua message.
- [x]2 Chrome tabs thật/Flask DB mocked: old ID403, invalidation block writes,
  bootstrap mới hoạt động, logout lan sang tab khác; storage trống/cookie hidden.
- [ ] Nối factory vào54 file callers, login/header/password/logout/socket/
  download/iframe; chưa pass visual/interactive QA workspace thật.
- Tests browser_session_client.test.js21 ca, test_browser_sessions.py32 ca;
  evidence /tmp/qlpk-session-owner-browser.log.

## Cookie/CSRF backend preparation (2026-09-28)

- [x] Cookie login same-origin; prod HTTP reject, Secure/HttpOnly/__Host/
  host-only/Path=/ đúng; JSON không JWT, Cache-Control no-store.
- [x] User/admin write thiếu/sai/phiên-khác CSRF403 trước handler; Origin
  null/external/khác scheme-port reject; cookie ưu tiên header, không bypass.
- [x] Cookie token không dùng Bearer; /auth/session bootstrap đúng phiên,
  password rotate đổi CSRF, logout revoke+clear, store lỗi503 giữ cookie.
- [x] Socket.IO test transport cookie+CSRF subscribe đạt/logout disconnect;
  sai Origin/CSRF reject. Chrome thật không đọc session qua document.cookie,
  missingCSRF403, valid200, oldCSRF403, logout200 rồi session401.
- [ ] Frontend54 file migration, hết phiên/multitab/iframe và browser workflow
  thật. Backend test pass KHÔNG chứng minh đã bỏ token khỏi localStorage.
- Tests test_browser_sessions.py (30 ca), /tmp/qlpk-cookie-browser.log.

## Auth transport / không replay401 (2026-09-28)

- [x] Shared fetch/jQuery chỉ tự thêm token cùng origin (khác port/protocol,
  subdomain, protocol-relative external, Request/URL external không tự thêm).
- [x] Fetch Request giữ headers/body; init không bị mutate, explicit auth giữ.
  POST401 một request, không login/refresh/retry ngầm, late401 không đổi user mới.
- [x] Không đọc plaintext credentials; dọn legacy keys khi load utils.
  Lịch hẹn không còn autoLogin caller. Authenticated refresh cũ410 không token.
- [x] Chrome +2 loopback HTTP servers thật:6 requests,2 external không auth,
 3 request401 không replay; dummy data/token, không server hay tài khoản thật.
- [ ] Full appointment/Doctor workspace khi hết phiên với nháp/dữ liệu thật;
  chưa pass visual/interactive QA. HttpOnly/CSRF/CSP vẫn cần làm.

## Lịch bận cá nhân: chọn nhanh/an toàn nội dung (2026-09-28)

- [x] Unit và browser fixture: click chữ/icon, Enter/Space chọn đúng nút;
  giữ5 khung giờ hiện tại, reset/manual datetime clear active/aria-pressed.
  Nút ngoài form không bị mất active. Datepicker và plain-input fallback đạt.
- [x] Lý do chứa img/onerror, svg/onload, dấu nháy/& chỉ là text ở bảng/gợi ý/
  modal xóa; chọn gợi ý giữ nguyên văn, không sinh DOM img/svg/chạy script.
- [x] Chrome1440/390 fixture12 dòng/1 dòng không overflow,0 JS errors/0 writes.
- [ ] Xác nhận lại bằng dữ liệu thực đầy/thưa và người dùng được phép;
  chưa pass visual/interactive QA workflow thật. Không tạo lịch test trong DB thật.

## Khóa/mở khóa tài khoản và phiên (2026-09-28)

- [x] Isolated RAM/Redis: revoke mọi phiên user, user khác không ảnh hưởng;
  mở khóa/new login không hồi sinh token cũ. Mất generation key fail closed.
- [x] Stale registration/race register-revoke reject old generation; account
  TTL không ngắn hơn phiên dài nhất; initialization concurrent một generation.
- [x] PUT/DELETE security fields revoke trước commit; profile-only giữ phiên;
  bool sai400, Redis lỗi503 không commit, DB lỗi không khôi phục phiên đã revoke.
- [x] PostgreSQL QA riêng: login trước disable và ngược lại chờ row lock thật;
  sau reenable token cũ vẫn bị từ chối. Chạy với RAM và Redis QA riêng.
- [x] HTTP/socket loader reject generation cũ; self-password revalidate sau lock.
- [ ] Browser quản trị khóa/mở khóa và phiên Doctor/iframe dữ liệu thật;
  chưa pass visual/interactive QA cho chuỗi này.
- Evidence: test_account_session_lifecycle.py; test_credential_token_revocation.py.

## Đăng xuất server (2026-09-28)

- [ ] Hai login cùng user có jti khác; logout1 chặn HTTP/socket token1,
  token2 vẫn hoạt động. Token replay/không registry/registry mất không accept.
- [ ] Redis unavailable503 trước handler, revoke lỗi không success; restart/
  eviction chỉ yêu cầu login lại, không resurrect token. Production cần Redis.
- [ ] Pending logout không gửi đôi;200/401 clear aliases/workspace,503 giữ
  phiên và nháp; response cũ không xóa account mới. Native+iframe dọn nháp
  chỉ sau confirmed event và hoàn tất trước xóa qlpk_user.
- Isolated tests: test_access_sessions.py (gồm Redis thật),
  logout_session_lifecycle.test.js. Cần bổ sung workspace/DB E2E thật.

## Cấu hình production (2026-09-28)

- [ ] `python3 scripts/check_security_config.py` đạt với cấu hình deploy,
  không in secret. Production từ chối khóa rỗng/default/ngắn, expiry0/quá
  1440, thuật toán ngoài HS256 trước DB imports/initialization.
- [ ] Issuer cap lifetime; decoder production chặn JWT không-exp/sai kiểu,
  HTTP/socket dùng cùng owner. DEBUG exception không tính production pass.
- [ ] Không secret/password SMTP mặc định trong config; credential từng
  xuất hiện trong source đã được owner thu hồi/rotate ngoài repo nếu dùng.
- Unit/source tests: `tests/test_production_security_config.py`. Không
  import main khi QA để tránh DB side effects; startup order kiểm bằng AST.

## Giới hạn đăng nhập (2026-09-28)

- [ ] Vượt account/IP budget trả429 trước DB/bcrypt, có Retry-After;
  đổi username không vượt IP và đổi IP không vượt account. Body sai tính IP.
- [ ] Requests song song không vượt reservation; blocked không gia hạn;
  hết TTL được thử lại. Login đúng không reset budget.
- [ ] Redis lỗi503, không fallback memory; kiểm Lua atomic/TTL thực trên
  Redis QA riêng, không ghi counters thật. Restart/eviction cần rollout plan.
- [ ] UI429 hiện thời gian chờ, giữ input, nút enabled; pending không gửi
  đôi. Desktop1280/mobile390 không tràn; không tự retry mật khẩu.
- Tests: `test_login_throttle.py`, `login_throttle_ui.test.js`. Browser
  mock429 không thay E2E Redis/backend/proxy thật.
- Isolated Redis thật: `test_login_throttle_redis.py`, binary chọn qua
  QLPK_TEST_REDIS_SERVER, fixture luôn tự spawn Unix socket riêng/port0.
  10 ca Redis7.4.6 đạt ở lát32; không xem đó là QA nginx/production config.

## Token sau đổi mật khẩu (2026-09-28)

- [ ] Login phát token có binding opaque, không password/hash; token cũ
  thiếu binding yêu cầu login lại theo kế hoạch rollout.
- [ ] Sau đổi/reset password, token trước đó bị401 ở HTTP và không mở/
  nhận sự kiện socket; token mới hợp lệ. Lỗi commit không trả replacement.
- [ ] Tự đổi password cập nhật token trước restart socket, không reload
  hay xóa form khám đang nhập; double-submit chỉ một request.
- [ ] Logout/đổi account khi request chờ: response cũ không ghi đè phiên
  hiện tại; thiếu replacement sau commit báo cần login lại bằng password mới.
- [ ] Kiểm đồng thời hai password changes trên DB QA riêng; không dùng DB
  y tế/tài khoản thật. SELECT FOR UPDATE có trong source, mock chưa chứng
  minh lock PostgreSQL thực. Isolated tests không thay E2E này.

## Quản trị tài khoản và nhóm quyền (2026-09-27)

- [ ] User thường gọi trực tiếp CRUD user/group/user-group phải403, không
  đọc/ghi domain hoặc tệp; actor vừa bị khóa/mất quyền cũng bị chặn.
- [ ] Admin tạo/khóa tài khoản; người có ql-taikhoan sửa hồ sơ thường nhưng
  không đổi role/quyền xem bệnh nhân/password hoặc sửa tài khoản admin.
- [ ] Quản lý nhóm/phân quyền không cấp quyền vượt quyền đang giữ; danh
  sách users/groups vẫn tải được cho ql-phanquyen, picker khám vẫn dùng được.
- [ ] Gán nhiều nhóm có một ID thiếu/sai không xóa phân quyền cũ; checkbox
  gửi string ID vẫn được nhận, trùng được gom, [] xóa có chủ ý.
- [ ] Upload avatar/license trái quyền hoặc user thiếu không ghi tệp;
  GET users/patients không vượt patient scope.
- Automated isolated HTTP coverage: `tests/test_account_access_safety.py`.
  Chưa thay thế browser QA với tài khoản quản lý thật và DB transaction thật.

## Bốc thuốc và thống kê theo thời gian (27/09/2026)

- Bộ testcase, lệnh chạy và giới hạn: `references/medicine-dispensing-qa.md`.
- [x] Đếm operation, nhiều lô, no-op, xuất thêm, hoàn, đổi giá, tháng chỉ hoàn/điều chỉnh.
- [x] Tổng toàn bộ bộ lọc trước phân trang; thuốc trùng tên khác ID; thiếu giá không thành0.
- [x] Browser dữ liệu thật41 thuốc/2735 giao dịch, chọn thuốc, tháng này, rỗng, phân trang.
- [x] Desktop1440/1024 không tràn ngang; dữ liệu ít/nhiều và interaction đã kiểm.
- [ ] Mobile390 toàn trang: footer chung tràn ngang, hai bảng mới cuộn trong vùng đúng.
- [ ] E2E thao tác ghi qua màn bác sĩ chưa chạy lại; API/service kiểm trong rollback.

## Truy vết cấp/hoàn theo lượt khám (2026-09-20)

- [x] Hai lượt cùng bệnh nhân giữ riêng receipt/cost/sale; đổi giá danh mục không đổi lịch sử.
- [x] Lưu lặp không thêm dòng; đổi giá ghi delta 0 SL; cấp thêm/hoàn một phần/hoàn hết giữ liên kết gốc.
- [x] Hoàn đúng lần nhập, cùng số lô khác giá vốn; dữ liệu cũ thiếu giá vẫn null.
- [x] Thiếu kho rollback; khóa lượt khám và kho vượt kiểm đồng thời.
- [x] Báo cáo lọc/phân trang, tổng toàn bộ bộ lọc, 401 thiếu auth/400 bộ lọc sai.
- [x] Browser riêng: dữ liệu thật 50 dòng/trang, trang 2, tìm kiếm rỗng.
- [x] QA 20/09 bổ sung: app thật + đăng nhập QA + DB riêng chỉ dữ liệu giả lập, cấp/hoàn/đổi giá qua Lưu màn bác sĩ; lịch sử sau hoàn hết, 4/29 dòng, desktop 1600 và 1024, reload, thiếu kho, thống kê 54 dòng/phân trang. Pass visual/interactive QA cho các ca này; chi tiết `reports/medicine-visit-ledger-2026-09-20/qa-interactive.md`.

## Đối chiếu thuốc DAV — bảng ba cột (2026-09-18)

- [ ] Modal cao theo nội dung; dữ liệu dài chỉ cuộn thân, footer vẫn thấy.
- [ ] Bốn trường chung nằm cùng hàng giữa Ban đầu/DAV; chỉ ô khác bên DAV
  được nhấn nhẹ. Trường thiếu ghi rõ, không suy ra hàm lượng từ tên thuốc.
- [ ] Chi tiết DAV bổ sung nằm dưới bảng, không lặp trường; đọc được tên
  nhà sản xuất/quy cách dài trên desktop và màn hẹp.
- [ ] Tìm/chọn lại bỏ dữ liệu DAV cũ; đổi thuốc/đóng bỏ mọi dữ liệu cũ;
  phản hồi chậm không ghi đè lựa chọn mới. Nút xác nhận theo can_apply.
- [ ] Kiểm trạng thái chưa liên kết, đã liên kết, không thể áp dụng, rỗng
  kết quả và dữ liệu dài. Không gửi xác nhận vào dữ liệu thật khi chỉ QA UI.

## Cập nhật giá thuốc (2026-09-15)

- [x] Server time, exact interval closure, decimals/zero/decreases/no-op,
  stale/ABA, rollback, initial creation, pagination and stock preservation.
- [x] Frontend difference, repeat submit, late response, staged create, errors;
  ordinary saves omit prices. 89 Python +22 JS tests đạt.
- [x] Schema/Alembic strict, API auth and frontend contracts.
- [x] Migration backup and after-comparison preserve current medicines,
  batches, transactions and prescription items. No old history invented.
- [ ] User kiểm tra thêm/sửa, Cập nhật giá, Hủy, tăng/giảm/0, lịch sử dài,
  hai phiên cùng sửa; màn rộng/hẹp và cuộn. Chưa pass visual/interactive QA.

## Mapping DAV đợt2 (2026-09-14)

- [x] Backup custom dump trước ghi;2 source corrections +17 clinic mappings
  commit với journal, manifest pin phiên dữ liệu và người thực hiện.
- [x] 70 tests: migration có lô/quy cách khác/field cũ khác, source blank nạp
  null, stale/duplicate/public mapping bị chặn; correction đúng2 source giữ
  raw, idempotent, không sửa source khác hoặc thay đổi nguồn không rõ.
- [x] Schema;27 links có identity/snapshot đúng DAV. Không đổi ID/settings/
  stock/prices/conversion của51 thuốc;48 lô,2744 giao dịch,877 dòng đơn giữ
  hash;24 chưa map và10 links cũ giữ nguyên.
- [x] Report/note24 dòng: `reports/dav-migration-2026-09-14/stage-2/report.md`.
- [ ] Xử lý tiếp24 theo note; không tự gộp các dòng kho trùng tên/nguồn.
- [ ] User QA hiển thị thêm/sửa sau mapping: chưa pass visual/interactive QA.

## Migration dữ liệu DAV local (2026-09-14)

- [x] Audit51 thuốc/54752 nguồn, manifest10 cặp duyệt riêng;41 thiếu căn cứ
  được ghi riêng tại `reports/dav-migration-2026-09-14/report.md`.
- [x] Backup custom dump được kiểm tra trước apply; fingerprint thuốc/nguồn
  và database phải khớp; bỏ trùng/mất evidence/actor sai/manifest cũ.
- [x] 6 manifest tests +50 DAV/API/Excel rollback đạt; schema contract đạt.
- [x] Đọc lại sau commit:10 linked/41 unlinked;48 lô,2744 giao dịch,877 dòng
  đơn không đổi, tất cả tồn/giá/quy đổi giữ nguyên.41 bản chưa ghép không đổi.
- [ ] Có hãng/SĐK hoặc xác nhận mâu thuẫn để hoàn tất41 thuốc còn lại.

## Người phụ trách xác nhận DAV (2026-09-14; thay thế việc bỏ liên kết người dùng)

- [ ] 2026-09-17: thuốc thêm mới từ DAV (form/Excel) hiện "Đã xác nhận DAV"
  ngay, không bị đòi xác nhận lại; thuốc cũ pending giữ nguyên trạng thái.
  Modal xác nhận không còn checkbox: chọn thuốc hợp lệ là nút Xác nhận bật;
  nguồn đổi/không hiệu lực vẫn khóa nút và báo lý do.
- [x] 72 Python rollback: review quyền kho, pending/confirmed/stale, checkbox,
  version/duplicate/source guards, sửa liên kết có lô và giữ nguyên dữ liệu lô.
- [x] 20 JS: search tên, chọn lại, stale response, hủy/đổi thuốc, double submit,
  form thêm/sửa cũ; frontend contract, Python/JS/Jinja syntax đạt.
- [x] DB đọc lại: 27 pending, 24 unlinked; không ghi xác nhận thay người dùng.
- [ ] User QA thuốc chưa liên kết/cần xác nhận/đã xác nhận; tìm tên, hoạt chất,
  SĐK, đổi nguồn, hủy, kiểm tra nhà sản xuất/hàm lượng, nguồn trùng/không hiệu
  lực, desktop/mobile và dropdown nhiều kết quả. Chưa pass visual/interactive QA.

## DAV bắt buộc, migration nội bộ (2026-09-14; lịch sử trước luồng xác nhận)

- [x] POST chặn thiếu/sai nguồn, nguồn ngoài DAV, hết hiệu lực, tên tự nhập,
  tồn/giá vốn; Excel không tạo được thuốc thiếu nguồn hoặc liên kết thuốc cũ.
- [x] PUT người dùng chặn link/relink/unlink/refresh, kể cả JSON giả quyền
  migration; vẫn sửa cấu hình phòng khám. 50 Python rollback +15 JS đạt.
- [x] Gỡ cột/bộ lọc nguồn và toàn bộ mapping UI; giữ form chọn DAV/thêm/sửa.
- [ ] User QA: bảng rỗng/có dữ liệu/dày, lọc/phân trang, desktop/mobile;
  thêm phải chọn DAV, sửa không có đổi nguồn, nhập số lượng từ lô.
- Chưa pass visual/interactive QA. Các mục liên kết người dùng ngày 2026-09-13
  bên dưới chỉ ghi lịch sử, đã được quy trình này thay thế.

## Form thuốc theo ảnh mới và tìm DAV bằng tên (2026-09-13)

- [x] Tìm tên/hoạt chất/SĐK lấy được preview; PUT nhận số đăng ký của lựa chọn.
  40 Python rollback đạt; read-only Diropam trả2 thuốc trên dữ liệu hiện có.
- [x] 17 JS race/save/error; syntax/Jinja, IDs/labels/DOM refs và contracts.
- [x] Code layout: header/footer ngoài vùng cuộn; bốn section theo ảnh,
  source dropdown tham gia flow; giữ readonly và field IDs.
- [ ] User QA: thêm/sửa có dữ liệu; chọn DAV/đổi thuốc; dropdown dài/ngắn;
  đơn vị/quy đổi, cảnh báo, footer và cuộn trên desktop/mobile.

## Thêm/sửa/liên kết lại DAV, giữ UI gốc (2026-09-13)

- [x] Code: chọn DAV mới mở nhập; đổi thuốc xóa nguồn/gợi ý cũ; không gửi tồn,
  giá vốn/hạn dùng qua form danh mục. Khóa nguồn ở UI/API, nguồn thiếu cho nhập.
- [x] Code/API rollback: đổi nguồn, cập nhật cùng nguồn, nguồn trùng/hết hiệu
  lực/version cũ/quy cách hoặc hoạt chất không khớp; giữ ID/giá/tồn/lô/lịch sử.
- [x] Code: chống submit lặp, response cũ, text lỗi kỹ thuật; 81 Python +17 JS.
- [x] Tĩnh: hai cột/bốn nhóm theo UI gốc, không ID trùng, syntax/contracts.
- [ ] User QA: thêm thuốc → lưu → nhập lô → kiểm số lượng; sửa phần được phép.
- Chưa pass visual/interactive QA; user nhận phần QA giao diện trong lượt này.

## Sửa thuốc / Bổ sung thông tin riêng (2026-09-13)

- [x] Sửa thuốc cũ lấy GET mới nhất, không mở tìm DAV hay checkbox liên kết.
- [x] Bổ sung chỉ mở sau GET thành công; response cũ bị bỏ qua.
- [x] SĐK khớp chính xác hiện tại/cũ; nhập tên/đoạn SĐK không tìm gần đúng.
- [x] Xem trước không điền đè form cũ; Hủy desktop/mobile giữ tên và tồn834.
- [x] Browser Lupilopram30 vs kho50 chặn; Exidamin nguồn ghi Hoạt chất10mg
  chặn với lý do rõ. Backend kiểm lại, không dựa riêng disabled button.
- [x] Mobile390×844/600: chọn/tìm lại, cuộn thân và cuộn ngang bảng, footer/Hủy.
- [x] New Panadol map Nội/viên/hộp120 như trước; không ghi thật qua browser.
- [x] 51 Python rollback/query/mapping +11 JS; syntax/Jinja/frontend/auth/diff.
- [x] PUT rollback kiểm thành công, lỗi SĐK/version/quy cách, giữ tồn/giá/
  lịch sử/hàm lượng khi nguồn trống. Pending/double-submit/retry bằng JS.


## Mapping DAV → thêm thuốc (2026-09-13)

- [x] Quy tắc đơn vị/quy đổi toàn chuỗi; nhiều quy cách/dung dịch không đoán.
- [x] Lookup route/defaults không thêm COUNT/raw payload, khớp full catalog.
- [x] POST/GET rollback: route, Nội/Ngoại, chuỗi quy đổi, giá và tồn0 đúng;
  thiếu quốc gia yêu cầu xác nhận boolean, legacy/trùng nguồn giữ guard.
- [x] Browser thật Panadol VN tự điền viên/hộp120/Nội; chưa xác nhận bị chặn;
  đổi nguồn xóa gợi ý. Ireland/đa quy cách → Ngoại/count trống.
- [x] Mobile390: source dài và checkbox đọc/nhấn được, modal-body cuộn.
- [x] 48 Python +9 JS; frontend contract/JS syntax/diff.
- [ ] Visual route có dữ liệu và ghi browser chưa chạy; dữ liệu DAV đang
  kiểm không có đường dùng. Route save/read được kiểm bằng rollback test.

## Kết quả QA tiếp và sửa hồi quy quản trị (2026-09-13)

Checklist hiện hành của lượt này; các section cùng ngày bên dưới giữ lịch
sử. Ma trận và giới hạn tại `reports/admin-ui-qa-2026-09-13.md`.

- [x] Desktop sau patch: Tài khoản, Tương tác, Nhóm dịch vụ, Dịch vụ, Ngày lễ.
- [x] Launcher/dropdown không có Gói dịch vụ; URL trực tiếp browser về index.
- [x] ICD đổi20 dòng/trang, tới cuối; mobile cuộn tác vụ, sửa/hủy, trang2;
  thêm required/định dạng sai hiện feedback. Pending submit/lỗi unlock test đạt.
- [x] Các bảng thật và footer/trang cuối: thuốc51, DAV48829 active, ICD12218,
  tài khoản9, hoạt chất1001, dị nguyên115, tương tác11, dịch vụ287, ngày lễ38.
- [x] Modal thuốc/DAV/nhóm/từ viết tắt populated; DASS21 mobile tới câu21,
  4 đáp án đúng điểm, đổi tab Kết quả và đóng không lưu.
- [x] Lịch bận3 lịch sử/active rỗng, parent filter wrap, góc input9px;
  chọn Sáng, chọn gợi ý Họp, cuộn ngang gợi ý và reset.
- [x] Thuốc/DAV tìm không khớp mobile: nhãn trống và footer0–0/0 nhìn thấy.
- [x] 13/13 JS tests; frontend/brand/auth/workspace contract; Jinja/HTTP18.
- [ ] CRUD/import/sync và giả lập lỗi mạng browser thật chưa chạy; không
  ghi dữ liệu vận hành chỉ để QA. Không đánh đồng test mock với browser QA.

## Ẩn Gói dịch vụ và QA mobile tiếp (2026-09-13)

- [x] Gỡ navigation/phím tắt; test workspace loại tab Gói dịch vụ đã lưu.
  Firefox reload không còn tab cũ; URL cũ HTTP302 về index.
- [x] Mobile390: Tài khoản có lại mũi tên select; Nhóm dịch vụ/Dịch vụ/
  Ngày lễ xuống dòng ô tìm hợp lý; Tương tác thuốc không bị ép dòng quá cao.
- [x] Đã quan sát phần đầu18 trang quản trị còn hiển thị. Không tính editor
  tạo mới, Tài liệu chưa chọn thư mục hoặc bảng dưới viewport là QA dữ liệu.
- [ ] Sau patch mới, kiểm desktop Tài khoản/Tương tác/Nhóm dịch vụ/Dịch vụ/
  Ngày lễ; kiểm launcher và URL redirect bằng browser, danh sách phím tắt.
- [ ] Tiếp tục cuộn dọc/ngang tới footer/cột tác vụ, modal và validation.
  CUA click không kích hoạt và paste timeout trong lượt này; sau đó Firefox
  chuyển cửa sổ đang dùng. Chưa pass visual/interactive QA toàn bộ18 trang.

## Control quản trị, ICD và Phân quyền (2026-09-13)

- [x] Frontend contract; test ICD/auth/error/race/pager, Phân quyền
  identity/load guard/search và bộ lọc danh sách đạt.
- [x] ICD tải dữ liệu thật 12.218 mã trên phiên Firefox quản trị sau sửa auth.
- [x] Đã tìm đúng Firefox container Cá nhân có Admin; server/quyền truy cập
  không còn là điều kiện thiếu. Sửa backend thiếu ba quyền menu; Dị nguyên,
  Tài liệu và Phím tắt đã mở thật sau hydrate `/users/me`.
- [x] ICD trang2/cuối1222, tìm A00.0 và query không có kết quả, mở sửa/hủy;
  mobile390 toolbar không tràn và dòng không bị ép cao. Chưa kiểm tương tác
  cuộn ngang/mobile footer, đổi page-size và retry mạng trên browser.
- [x] Phân quyền: chọn Admin và bác sĩ, quyền Bác sĩ hiện đúng, tìm tên có
  dấu đúng; save khóa trước khi tải. Nhóm quyền tìm BS/Enter ra1, reset.
- [x] Tài khoản form thật: Enter admin ra1, reset9, role Bác sĩ ra3; toolbar
  sau sửa flex đủ chỗ nhập. Hoạt chất/Dị nguyên không lộ native file input.
- [x] Thuốc trang cuối51–51/51 và khảo sát11–11/11; DASS tìm ra1, editor
  đọc đủ options cũ và điểm0–3 sau sửa, đóng không lưu.
- [x] Tài liệu chọn thư mục rỗng và thư mục1file; Phím tắt2 dòng, Ngày lễ38,
  nhóm dịch vụ3, dịch vụ287, tương tác11, từ viết tắt6 hiển thị dữ liệu thật.
- [x] Lịch bận Tất cả hiện3 lịch sử, Đã hủy hiện2 và khóa sửa; active rỗng
  vì không có lịch sắp tới. Test SQLite xác nhận lọc luôn giữ owner.
- [ ] Sau patch CSS cuối: 19 màn có field/button13px, placeholder không
  italic, radius control9/surface14, modal heading18; kiểm focus, disabled,
  is-invalid/is-valid, textarea, input group và select nhỏ.
- [ ] ICD còn: đổi số dòng, lọc nhóm, lỗi mạng/retry, modal thêm/hủy;
  wrapper scroll ngang và footer trên màn hẹp.
- [ ] Phân quyền: chọn user trùng tên theo ID, hiện quyền đã cấp; đổi user
  nhanh không giữ quyền cũ, không lưu khi đang tải/lỗi tải. Kiểm tìm user
  và nhóm. Không cấp/thu hồi quyền thật chỉ để QA.
- [ ] Nhóm quyền: tìm mã/tên/mô tả, Enter/Làm mới đổi dataset/pager đúng;
  không còn filter danh mục thuốc/ngày/status không thuộc model Group.
- [ ] Tài khoản: tìm tên/username/điện thoại, đổi lọc nhanh, realtime giữ
  lọc. API /users/ hiện chỉ trả active theo contract hiện hữu; chưa mở rộng
  backend để tra cứu inactive trong lượt UI này.
- **Chưa pass visual/interactive QA toàn bộ18 màn còn hiển thị**: còn ma trận
  modal, validation, responsive và save/load thực. Gói dịch vụ đã ẩn theo
  yêu cầu; API `/users/` chỉ trả active nên chưa kiểm được inactive.
  Đây là phần việc/giới hạn chức năng, không phải cần user cấp thêm phiên.

## Phân trang quản trị theo Tủ thuốc (2026-09-12)

- [ ] Chạy `node tests/clinic-pagination.test.js` và frontend contract.
- [ ] 12 danh sách trong `CLINIC_PAGINATION_PAGES` có đúng một footer/renderer.
  Mặc định 10, đổi 20/50/100 về trang đầu, giữ bộ lọc và STT đúng.
- [ ] Dữ liệu thật: chuyển trang 2/trang cuối, lọc ít dòng/rỗng; tổng và khoảng
  khớp dữ liệu, disabled không gửi request và trang hiện tại có aria-current.
- [ ] Kiểm danh mục lớn nhiều nghìn trang và đổi bộ lọc nhanh, không để phản
  hồi cũ thay bảng mới. Không dùng dữ liệu giả để kết luận visual QA.
- [ ] Desktop/mobile: footer ngoài vùng cuộn ngang; khảo sát footer vẫn trong
  viewport, bảng cuộn riêng; Tủ thuốc giữ kiểu đã duyệt, màn loại trừ không đổi.

## Màn quản trị theo chuẩn Tủ thuốc (2026-09-12)

- [ ] Nhóm quyền/Từ viết tắt/Tương tác thuốc/ICD/Lịch bận/Tài liệu/mẫu khảo
  sát: đo font trên dòng thật, cả tên/ngày/metadata/badge đều base13px;
  kiểm cả Link liên kết trong Tài liệu. Icon và tiêu đề có cấp riêng.
- [ ] Lịch bận: gợi ý cuộn ngang trong container, click điền lý do và chuyển
  is-selected đúng; không lưu bản ghi khi chỉ kiểm giao diện. Tài khoản/editor
  khảo sát chỉ có feedback runtime, không xuất hiện toast local thứ hai.
- [ ] `check_frontend_contract.py` kiểm opt-in allowlist; các màn loại trừ
  không tải `clinic-workspace.css`, không có `.qlpk-clinic-page`.
- [ ] Tủ thuốc giữ 4 số tổng đúng, bảng vẫn sát toolbar. Từ viết tắt và DAV
  dùng các ID/API cũ, summary không đổi theo bộ lọc nếu API trả tổng toàn kho.
- [ ] Kiểm desktop/mobile với dữ liệu thật, bảng dày/thưa/rỗng; tiêu đề/ảnh
  không che nút, nhãn/số không cắt, bảng ngang có thể đến cột tác vụ.
- [ ] Kiểm cả native pane và embedded main; survey list giữ phân trang trong
  viewport, editor mở mẫu thật/đổi tab/đóng, Tài liệu chọn thư mục và cuộn pane.
- [ ] Mở/hủy modal và date picker; không gửi save hoặc tạo bản ghi chỉ để QA.
  Màn bị redirect, chỉ có placeholder hoặc chưa có dữ liệu không được coi là
  đã pass visual/interactive QA đầy đủ.

## Nhãn lịch sử khám dùng chung (2026-09-10)

- Kiểm bảng 4 và nhiều lượt, chẩn đoán dài; badge trạng thái nền màu đặc,
  chữ trắng 12px/medium, không dùng xám, một
  dòng, không đè cột bên cạnh. Cột ngày chỉ đánh dấu lượt hiện tại/hôm nay,
  không lặp trạng thái khám hoặc `Lịch sử`.
- Ở container hẹp, chẩn đoán xuống dòng riêng; ngày/trạng thái/thao tác
  còn rõ. Header/row căn cùng cột trên desktop, không tràn ở mobile.
- Đổi bệnh nhân A→B→A và chọn lượt khác: nhãn current theo appointment
  context, trạng thái theo backend, preview vẫn tải đúng lượt.

## Doctor chuyển khám qua modal chung (2026-09-10)

- Nút header `Chuyển khám` mở đúng một `#transferModal`, đủ nhóm Bác sĩ,
  Tâm lý gia, Lễ tân và danh sách người nhận tương ứng.
- Mở/hủy giữ nội dung đang nhập, không gửi save/transfer. Xác nhận lưu các
  phần dirty trước POST chuyển; lỗi lưu hoặc context đổi phải chặn POST.
- Khi đang lưu/chuyển: chặn bấm lặp, đổi người nhận và đóng modal. Lỗi API
  giữ lượt và lựa chọn, mở lại controls để thử lại; không báo thành công.
- Lượt chưa tải đủ hoặc đang xem lịch sử không được chuyển. Quay lại lượt
  hiện tại khôi phục trạng thái nút đúng.
- Chuyển thành công clear ca hiện tại và tải lại queue; phiên khác tự
  cập nhật socket. Kiểm người nhận/trạng thái trong DB, không suy từ toast.
- Kiểm header populated ở desktop/mobile, modal nhóm ít/nhiều người,
  không cắt nút/tràn ngang. Caller cũ không truyền hook vẫn hoạt động.
- Automated: `node tests/doctor_transfer.test.js`,
  `node tests/doctor_detail_defaults.test.js`, `node tests/doctor_realtime.test.js`.

## Doctor queue realtime (2026-09-09)

- Chuyển A rồi B tới cùng bác sĩ: cả hai phiên Doctor tự có B ở đầu, không
  F5; mở A và nhập Bệnh sử trước khi chuyển B, A/draft/selected card còn đúng.
- Chuyển A sang bác sĩ khác rồi về: A có ID thấp hơn vẫn lên đầu, hàng chờ
  bác sĩ cũ bỏ A; reload giữ thứ tự. Gửi lặp cùng transfer: updated_count=0,
  timestamp và số thông báo không tăng.
- Xác nhận DOCTOR_EXAM + CONCLUSION chung pagination, đủ hơn 50 ca; tìm
  bệnh nhân ở trang sau, lọc ít ca/trống, xóa filter về đủ danh sách. Không
  đảo thứ tự khi sửa field khám hoặc khi API cũ trả chậm.
- Ngắt socket, đổi dữ liệu QA trong thời gian mất kết nối; reconnect tự tải
  bù danh sách và thông báo. Giữ filter/ca hiện tại, không reload toàn form.
- Tạo/cập nhật CLS hoặc hoàn thành survey ở phiên khác: chỉ định hiện tại
  refresh khi sạch; lúc dirty/editing thì báo cập nhật và chờ lưu/kết thúc
  sửa, không mất input; đổi bệnh nhân trong lúc fetch không lẫn rows.
- Automated: `QLPK_RUN_DB_TESTS=1 python -m pytest -q tests/test_doctor_queue.py
  tests/test_workflow_notifications.py tests/test_clinical_order_validation.py`,
  `node tests/doctor_realtime.test.js`, `node tests/doctor_indications_form.test.js`.

### Bảng dữ liệu nền trắng (2026-09-08)

- [ ] Bảng Thuốc, các bảng admin, Thống kê thuốc và Lịch bận: ô trắng/viền
  mảnh khi không hover; badge trạng thái vẫn phân biệt được.
- [ ] Thống kê thuốc: mở nhóm bác sĩ/thuốc con; tổng chữ tối, số loại trắng
  có viền; tab tồn/lịch sử không mất bộ lọc.
- [ ] Chi tiêu: tab Chi tiết/Tất cả, mở nhóm có dữ liệu; tổng/STT/loại chi
  trắng, khoản lớn chỉ đánh dấu STT; không sửa ô autosave trong QA màu.
- [ ] Mẫu khảo sát/Hoạt chất/Dị nguyên/Tương tác thuốc: kiểm viền admin chung
  không phá bảng; tìm rỗng rồi tải lại; modal Dịch vụ/Tài khoản mở/đóng.
- [ ] GAD-7 preview có 7 hàng trắng và chọn đáp án được; mobile cuộn bảng
  ngang, không tràn trang. Empty state không thay cho QA dữ liệu thật.

## Survey template editor regression (2026-09-06)

- [ ] Seed điểm: chạy `tests/test_survey_scoring_seed.py`; GDS đủ 30 mục,
  GDS/Zung đảo chiều đúng; GAD không cộng câu phụ, PHQ lưu ý mục 9 không đổi
  thành tổng grid khi mở/lưu tab kết quả. Seed chạy lại không ghi đè dữ liệu.
- [ ] Danh sách: mặc định 25 dòng, 11 mẫu nằm chung một trang; chọn 10 thì có
  2 trang. Mở URL trực tiếp và tab từ Trang chủ; phân trang luôn trong
  viewport. Trang 1/2, đổi 10/25/100, tìm kiếm có/không có kết quả; bảng dài
  cuộn riêng, trang ít dữ liệu không thêm dòng rỗng. Kiểm desktop nhỏ/mobile.
- [ ] Tải A chậm → mở B → chỉ tên/câu hỏi/đích lưu của B; không lưu khi đang tải.
- [ ] Thêm cột hai lần: 4→5→6; thêm hàng một lần chỉ tăng một; đổi loại câu
  rồi trở lại không mất giá trị hoặc mất sự kiện.
- [ ] Nhập điểm cột 1, điểm ô 7/3 → lưu → tải lại vẫn 7/3, không thành 0/1.
- [ ] Tiêu chí hàng đủ thì lưu grid được, không yêu cầu tiêu chí cha đang ẩn.
- [ ] Quay lại/Escape khi chưa lưu: hủy xác nhận giữ nội dung.
- [ ] Tab kết quả: chuyển nhóm/tab không mất kết luận/lưu ý; tổng/trung bình/
  quy đổi dùng đúng cấu hình; hệ số quy đổi chưa nhập phải bị chặn.
- [ ] Mẫu thiếu điểm: editor nêu lỗi, tạo link bị chặn; link cũ dừng loading
  và báo cần cấu hình. Snapshot có đáp án không bị đổi theo danh mục.
- [ ] Hai context browser: draft xuất hiện ở bác sĩ, chưa có kết quả cuối;
  nộp 7/3 → tổng nhóm 7/3, trung bình 5, kết luận/lưu ý đúng; reload giữ đáp án.
- [ ] CLS đọc đúng đáp án grid từ snapshot; kiểm desktop, editor mobile cuộn
  bảng ngang đến được các cột cuối; console không lỗi.
- [ ] Chạy `tests/test_survey_template_contract.py`, `tests/test_survey_scoring.py`
  và `QLPK_RUN_DB_TESTS=1 ... tests/test_order_survey_lifecycle.py`.

## Unified order status and result review

- [ ] Tạo chỉ định: bảng/dropdown/timeline đều Chuyển thực hiện.
- [ ] Tạo link đúng order -> Đã gửi khảo sát; bấm lại không tạo session trùng
  còn hiệu lực. Cùng lượt có nhiều chỉ định/mẫu phải độc lập.
- [ ] Nộp bài hợp lệ -> session completed, order Có kết quả; vẫn ở tab Đang
  thực hiện. Bảng/modal/Doctor/TLG đúng qua realtime và sau reload.
- [ ] Bác sĩ Kết thúc khảo sát khi có/chưa có bài -> tab Hoàn thành; lý do và
  thời gian đúng, kết quả cũ còn nguyên, không nhận bài mới. Gọi lại không đổi mốc.
- [ ] Hết hạn trước/sau nộp bài -> Hoàn thành ở đúng mốc hạn; tab tự cập nhật,
  session đã nộp vẫn đọc được. Không báo có kết quả nếu chưa có bài.
- [ ] Hai tab đếm toàn bộ cùng phạm vi quyền/tên/ngày trước phân trang;
  chọn tab giữ bộ lọc, reset trang, thao tác nhanh không bị response cũ ghi đè.
  Kiểm tab bằng chuột/bàn phím, desktop/mobile và trạng thái rỗng.
- [ ] Sai token/patient/examination/template, thiếu đáp án bắt buộc, mã sai,
  link đóng/hết hạn không ghi kết quả mới. Chỉ định hết hạn vẫn completed.
- [ ] Nộp trùng cùng đáp án không tạo response/notification trùng; sửa đáp án
  sau nộp bị chặn. Không thể dùng API đổi session status để giả hoàn thành.
- [ ] Xem kết quả chỉ GET, hiện từng đáp án đã chọn (kể cả điểm 0), không tạo
  link mới; người không có quyền không đọc được kết quả của chỉ định khác.
- [ ] Nút Xem kết quả mở `patient-survey.html?review_order_id=<id>` trong tab
  mới, dùng chung UI người điền; không còn khối đáp án riêng trong CLS.
  Đối chiếu từng câu với bài đã lưu, kể cả khi mẫu đã thay đổi/hết hạn/đã kết
  thúc. Input khóa, không Bắt đầu lại/Nộp bài, không API ghi hoặc đụng bản nháp.
  Mobile không bị điều hướng che đáp án. Thiếu quyền hiện thông báo; chưa có
  bài nộp vẫn xem phần đang làm hoặc mẫu trống ở chế độ chỉ đọc.
- [ ] Live: mở đồng thời bệnh nhân/bác sĩ bằng hai browser context độc lập.
  0 câu → hiển thị chưa có câu trả lời; chọn 1 câu → autosave, bác sĩ tự thấy
  phần đã chọn và tiến độ đúng sau tối đa khoảng 3 giây. Không tạo kết quả
  chính thức hoặc đổi Có kết quả khi chỉ lưu nháp; không nhảy câu đang xem.
- [ ] Reload link ở context bệnh nhân mới khôi phục nháp server. Nộp thành
  công hiện bài đã nộp; kết thúc/hết hạn khi chưa nộp vẫn giữ nháp, khóa ghi.
  PUT revision cũ khác nội dung trả 409; sai token/IDs/mã đáp án bị từ chối;
  PUT sau nộp/kết thúc trả 410. Mất mạng phải báo chưa đồng bộ, không báo đã lưu.
- [ ] Form Doctor/TLG mở trước khi nộp bài không ghi đè trạng thái mới hoặc
  âm thầm xóa row đã gửi/hoàn thành; không đổi template đã gửi.
- [ ] Chưa có link: “Tạo link khảo sát”; có link: “Tạo lại link khảo sát”.
  QR và URL cùng xuất hiện sau tạo và khi reload/browser mới không cache.
  Giải mã QR khớp chính xác URL; tạo lại giữ session còn hiệu lực/nháp/hạn,
  không lấy QR/link cache của chỉ định khác. QR nằm cạnh timeline trong
  card tiến trình, link ở phần khảo sát; card hẹp xếp QR dưới timeline.
  Đổi chỉ định/đóng modal/tải lỗi phải clear QR cũ. Kiểm QR và link trên mobile.
- [ ] Chi tiết không còn tab Thông tin/Khảo sát; mở là tải đủ patient,
  timeline, khảo sát. Trạng thái và nhóm nút chỉ xuất hiện một lần.
  Nút cùng hàng tên chỉ định; badge sát nhãn Khảo sát/Kết quả khảo sát.
  Survey không có dropdown; chỉ định thường vẫn đổi trạng thái được.
  Chỉ định thường không hiện nút khảo sát. Kiểm có/chưa có kết quả, file
  hiện trực tiếp trên desktop/mobile. Chỉ định nhập tay có ô Ghi chú kết quả
  lưu `note_nurse` khi rời ô hoặc bấm Lưu ghi chú; mở lại giữ nội dung,
  xóa trắng lưu được, lỗi lưu giữ bản nháp để thử lại. Đổi trạng thái phải
  đợi lưu ghi chú; đổi ca không nhận phản hồi/nội dung từ ca trước.
  Khảo sát không có ô ghi chú này.
- [ ] Bố cục giữ phong cách cũ: nền kem/card trắng, trái bệnh nhân/tiến trình
  dọc/file đính kèm, phải khảo sát/kết quả. Hai cột bằng chiều cao desktop,
  mobile xếp dọc tự nhiên; tên file dài vẫn dễ đọc, tải/xóa/chọn file hoạt động.
  Nhóm kết quả tiêu đề nâu, đáp án
  bên trái và điểm/mức độ bên phải; mobile xếp dọc. Không đổi thành bảng
  phẳng hoặc timeline ngang. Kiểm nhóm nhiều/ít câu, điểm 0 thật và chưa nộp.
- [ ] Đóng modal giữ filter; mở lại nhiều lần không nhân listener/autosave.
  Đổi order trong lúc API chậm hoặc animation đóng chưa xong không kẹt
  loading, không để sự kiện đóng/response cũ xóa hoặc ghi context mới.
- [ ] Kiểm desktop/mobile phần review dài; chờ tab/animation kết thúc rồi
  chụp ảnh, không lấy DOM hidden hoặc ảnh giữa transition làm bằng chứng.
- [ ] `QLPK_RUN_DB_TESTS=1 python -m pytest -q tests/test_order_survey_lifecycle.py`
  chạy các integration test PostgreSQL trong transaction rollback; chỉ
  bật trên DB local đã migrate. Test thường không bật flag sẽ skip nhóm này.

## Survey score identity regression

- [ ] Tạo mẫu qua editor có câu điểm 0 và khác 0, hai câu cùng nhóm; lưu,
  mở lại, lưu lại và xác nhận question/answer IDs không đổi.
- [ ] Tạo ca QA riêng, chỉ định đúng mẫu, tạo link, làm và nộp bài qua màn
  bệnh nhân. Đối chiếu từng đáp án, tổng nhóm ở DB/API/CLS, rồi reload.
- [ ] Điểm 0 thật giữ 0; thiếu key điểm phải hiện “Chưa tính được”. Không
  lấy bài cũ có điểm thay cho bài mới thiếu điểm của cùng mẫu.
- [ ] Mã đáp án/câu hỏi lạ hoặc trùng, câu bắt buộc bỏ trống, cấu hình điểm
  thiếu phải trả lỗi 400 và không ghi đè bài hợp lệ đã lưu.
- [ ] Mẫu đã có kết quả không được thay/xóa ID làm mất liên kết response;
  legacy thiếu ID không được tự đổi mã/cập nhật điểm khi đọc.
- [ ] Chạy `pytest -q tests/test_survey_scoring.py`; các dạng grid/checkbox/
  linear-scale cần browser QA riêng trước khi tuyên bố toàn bộ survey pass.

Tài liệu này chứa các checklist kiểm chứng nhanh sau mỗi thay đổi. Không thay thế test tự động, nhưng là tiêu chuẩn tối thiểu để tránh lỗi dây chuyền trong lúc hệ thống chưa có test suite đầy đủ.

## Nguyên Tắc

- Chỉ chạy checklist đúng phạm vi workflow đang sửa.
- Ưu tiên kiểm contract dữ liệu trước UI.
- Với UI, kiểm browser console và trạng thái hiển thị thực tế là bắt buộc. Browser QA do agent tự mở và tự kiểm mặc định, có thể dùng Chrome, in-app browser, Playwright/headless browser hoặc công cụ browser local tương đương khi môi trường cho phép. Static checks chỉ chứng minh code hợp lệ, không chứng minh giao diện đúng.
- Trước khi gọi UI là đạt, lập state matrix cho chính thay đổi: empty, populated, dense/long khi có list/table, breakpoint liên quan và mọi interaction đã đổi. Hidden/empty/fixture không có control thật không được tính là visual QA đạt.
- Với layout có grid/flex, split pane, scroll hoặc pagination: kiểm chain parent -> section -> child để xác nhận owner chiều cao/overflow; kiểm không có blank panel, scrollbar sai vùng, clipping hay page-level overflow. Pagination phải kiểm được với tổng trang thực tế, không chỉ trang đầu.
- QA UI phải được thực hiện với tư duy độc lập/công tâm: tự cố tìm lỗi layout, màu, chữ, khoảng cách, overflow, clipping, z-index, backdrop, loading/disabled state, responsive, asset 404, console error và nhánh UI cũ/chồng chéo. Không tự xác nhận pass nếu chưa nhìn thấy màn hình thật sau thay đổi.
- Nếu user yêu cầu bỏ qua browser test hoặc chưa chạy được browser/visual QA, ghi rõ `chưa pass visual QA` trong báo cáo. Không được dùng các câu như `đã ổn`, `xong UI`, hoặc `pass` chỉ dựa trên terminal validation.
- Với dữ liệu y tế, kiểm stale data khi đổi bệnh nhân nếu workflow có patient-specific state.
- Nếu checklist phát hiện contract mới, cập nhật `references/data-contracts.md` hoặc module doc tương ứng.

## Runtime sau di chuyển checkout hoặc restart

- [ ] Đối chiếu checkout hiện tại với đường dẫn trong traceback/runtime;
  nếu checkout vừa chuyển, restart đúng app và parent reloader từ vị trí mới.
- [ ] Kiểm HTTP `/index.html`, route workflow vừa sửa và CSS/JS tham chiếu:
  HTML 200 đúng nội dung, asset 200; không có TemplateNotFound/404/500.
- [ ] Mở mới hoặc reload trang chủ và workflow trên browser. Không dùng tab
  cũ còn DOM/cache làm bằng chứng runtime hiện tại hoạt động.
- [ ] Nếu runtime/checkout đổi sau QA, kết quả kiểm tải trang trước đó hết
  hiệu lực; chạy lại kiểm tra này trước khi báo hoàn tất.

## UI Browser QA Gate

### Bộ nút chung

- [ ] Đọc `references/ui/button-system.md`; không dùng palette riêng/gradient nâu.
- [ ] Header bác sĩ giữ nguyên vị trí: Lịch sử/Lưu/Chuyển khám phụ, Hoàn thành chính; Đơn thuốc phụ trên header.
- [ ] Nút phụ trắng trên nền tối, xám nhẹ trên nền trắng; khai báo surface tại container đúng vùng.
- [ ] Không viền trang trí/shadow; focus bàn phím rõ trên cả hai nền; hover phụ không thành nút chính.
- [ ] Xóa tại dòng chữ đỏ; xác nhận nguy hiểm nền đỏ; disabled không đổi màu khi tương tác.
- [ ] Chạy tests/button_actions.test.js và tests/button_color_tokens.test.js; không dùng kết quả test thay visual QA.

Áp dụng cho mọi thay đổi HTML/CSS/JS có ảnh hưởng giao diện, kể cả thay đổi nhỏ như font-size, padding, màu, icon, modal, dropdown, calendar, table hoặc shell.

- [ ] Mở đúng màn hình/route bị ảnh hưởng trong browser.
- [ ] Console không có error mới; network/static asset không có 404/failed mới.
- [ ] Component vừa sửa hiển thị đúng yêu cầu bằng mắt thường, không chỉ đúng computed CSS.
- [ ] Không có text bị cắt, đè, wrap sai, quá nhỏ/nhạt, hoặc lệch hàng.
- [ ] Không có overflow ngang ngoài ý muốn; scroll nằm đúng vùng.
- [ ] Không có backdrop/z-index/layer che nội dung hoặc popup.
- [ ] Không có layout jump bất thường khi hover/focus/click/open/close nếu component có tương tác.
- [ ] Kiểm ít nhất viewport hiện tại của user; với thay đổi responsive/mobile-first, kiểm thêm mobile/tablet/desktop liên quan.
- [ ] Với Flatpickr/FullCalendar/Bootstrap modal/dropdown/SweetAlert/autocomplete/table render, không thay đổi layout cell/grid/position nếu chưa visual QA sau patch.
- [ ] Lưu hoặc mô tả rõ bằng chứng QA trong báo cáo: route đã mở, viewport đã xem, console status, và điểm visual đã kiểm.

## Workspace Shell And Header

Áp dụng khi sửa app header, app launcher, workspace tabs, `sidebar-dry-loader.js`, `app-header-loader.js`, hoặc bất kỳ màn nào bị bọc bởi workspace shell.

- [ ] Direct load `/receptionist-new.html` với active workspace tab scoped của chính user đang là `index-html` vẫn active tab `Lễ tân`, hiển thị native pane và không trắng màn hình.
- [ ] Khi top-level URL là `/index.html` nhưng active workspace tab scoped của chính user đang là `Lễ tân`, bấm F5 vẫn khôi phục tab `Lễ tân` thay vì ép về `Trang chủ`.
- [ ] Direct load `/doctor-examination.html` hoặc `/psychologist-examination.html` với active tab cũ khác URL vẫn active đúng tab native của URL hiện tại.
- [ ] `#qlpkWorkspaceNativePane` có `data-tab-id` trùng tab native của URL hiện tại và có class `is-active` sau reload top-level.
- [ ] Tab iframe đã mở vẫn giữ state khi bấm chuyển qua lại trong cùng page load, không reload iframe không cần thiết.
- [ ] Workspace state được tách theo `qlpk_user.id`; đổi tài khoản không được kế thừa tab/active tab của tài khoản trước.
- [ ] Tab thuộc route đã bị rút quyền không được render và không được realtime subscription đọc lại.
- [ ] Đóng tab native khi còn tab khác phải chuyển top-level URL sang tab còn lại; F5 sau đó không được sinh lại tab vừa đóng.
- [ ] User truy cập trực tiếp một route có trong navigation config nhưng không có quyền phải được đưa về landing route hợp lệ theo vai trò, không tạo native tab trái quyền.
- [ ] Nếu tab iframe không tạo được pane active, shell fallback về native pane thay vì để toàn bộ vùng nội dung blank.
- [ ] Embedded page có `?embed=1` hoặc chạy trong iframe không mount header/app launcher lồng nhau.
- [ ] Logout vẫn xóa `qlpk_workspace_tabs` và `qlpk_workspace_active_tab`.

## Frontend Contract Gate

Áp dụng cho mọi thay đổi HTML/CSS/JS hoặc shared FE token/component.

- [ ] `python3 scripts/check_frontend_contract.py` đạt.
- [ ] Với thay đổi màn Doctor, `python3 scripts/check_doctor_examination_contract.py` đạt.
- [ ] `python3 scripts/smoke_health.py` đạt; smoke này đã gọi frontend contract gate.
- [ ] Các hạng mục đã sạch vẫn bằng 0: inline style trong template, `console.log`, JS `setAttribute('style')`, hardcoded `font-weight` CSS.
- [ ] Các hạng mục legacy chỉ được giảm hoặc giữ nguyên: raw Bootstrap action class, `!important`, `px`, hardcoded `font-size`, jQuery `.css()`, `.style.cssText`.
- [ ] Không tăng baseline trong `scripts/check_frontend_contract.py` để né lỗi. Nếu bắt buộc phải tăng, ghi rõ lý do nghiệp vụ và yêu cầu user duyệt như một khoản nợ kỹ thuật mới.

## User Feedback Contract

Áp dụng khi sửa toast, cảnh báo thao tác, xử lý lỗi API hoặc template tương tác.

- [ ] `python3 scripts/check_user_feedback_contract.py` đạt; template tương tác load `partials/user-feedback-runtime.html` và không có page-local toast container cũ.
- [ ] Thành công dùng màu `success`; dữ liệu chưa lưu/cần chú ý dùng `warning`; lỗi thao tác dùng `error`.
- [ ] Validation nêu đúng field/việc cần sửa và không gửi request khi chưa hợp lệ.
- [ ] HTTP `401` hiển thị `Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.`; màn login dùng riêng `Tên đăng nhập hoặc mật khẩu không đúng.` cho thông tin đăng nhập sai.
- [ ] Mất mạng hiển thị `Không thể kết nối. Vui lòng kiểm tra mạng và thử lại.`; lỗi `5xx` hiển thị câu theo workflow hoặc fallback `Không thể xử lý lúc này. Vui lòng thử lại.`
- [ ] Toast không chứa raw `detail/error/message`, stack/SQL, HTTP status, `server`, `module`, `component`, `appointment ID`, tiền tố `Lỗi:` hoặc đoạn `Hướng dẫn:` dài.
- [ ] Browser QA ít nhất một success và một validation/error trên đúng màn bị sửa; kiểm màu/icon, vị trí, wrap, auto-dismiss, console và network/static asset.

## Backend Schema Contract Gate

Áp dụng khi sửa SQLAlchemy model, migration, schema cleanup, `app/models/__init__.py`, hoặc logic startup/migration.

- [ ] Không đụng row dữ liệu nghiệp vụ nếu scope chỉ là kiến trúc schema/model/migration.
- [ ] `python3 scripts/check_schema_contract.py` đạt.
- [ ] `python3 scripts/check_alembic_contract.py --strict` đạt.
- [ ] Mọi model sống có `__tablename__` đều được import/export trong `app/models/__init__.py`.
- [ ] Bảng kỹ thuật ngoài metadata phải nằm trong allowlist rõ ràng, mặc định chỉ có `alembic_version`.
- [ ] Nếu drop table/column, đã backup DB trước và archive non-empty legacy values vào `legacy_database_archive`.
- [ ] Legacy migrations trước baseline 2026-07-05 vẫn nằm trong `_archive/alembic-prebaseline-20260705/` và không quay lại active `alembic/versions`.

## API Auth Boundary Gate

Áp dụng khi sửa API route, blueprint registration, public survey/QR endpoint, hoặc endpoint đọc/ghi dữ liệu bệnh nhân/lịch hẹn/khám/thanh toán/kho.

- [ ] `python3 scripts/check_api_auth_contract.py` chạy được.
- [ ] Route public mới phải có lý do rõ và được thêm vào allowlist trong script.
- [ ] Route nội bộ đọc/ghi dữ liệu y tế/quản trị phải có `@require_auth` hoặc `@require_admin`.
- [ ] Không khóa hàng loạt route trong cùng một lát nếu chưa trace caller frontend/API tương ứng.
- [ ] `python3 scripts/check_api_auth_contract.py --strict` chỉ được dùng làm gate bắt buộc sau khi missing-auth backlog đã được xử lý theo từng workflow slice.

## Realtime Socket

Áp dụng khi sửa `app/realtime/*`, `realtime-client.js`, `realtime-page-hooks.js`, hoặc các API/màn hình phát/nhận event socket.

- [ ] User thường không join admin/finance/entity/user khác; rooms malformed
  không crash; đóng tab/thu hồi permission thì phòng cũ được leave.
- [ ] Notification cá nhân chỉ đúng user, không lộ qua operations/global
  hoặc admin kế thừa role. Email reminder không tăng inbox toàn hệ thống.
- [ ] Khóa user/đổi nhóm disconnect mọi socket user; đổi group disconnect
  local sockets và reauth/resubscribe. Logout/stop không tự reconnect.
- [ ] Kiểm riêng patient scope của clinical payload; pass room allowlist
  không đủ kết luận mọi dữ liệu realtime đã được phân quyền đúng.
- [ ] Bác sĩ khác chỉ nhận anonymous changed, không patient/visit IDs,
  tên/chẩn đoán hoặc family data; người được phân công nhận ID điều phối.
- [ ] Chuyển bác sĩ/xóa ca vẫn refresh hàng đợi cũ; attachment qua room kho
  không lộ bệnh nhân; scope đổi áp dụng trước event kế tiếp không cần subscribe.
- [ ] Nhiều tab/rooms không nhân event; lỗi DB/socket recipient lookup không
  broadcast fallback hoặc làm request save đã commit báo lỗi giả.
- Isolated tests: `test_realtime_access_safety.py`,
  `realtime_session_lifecycle.test.js`; không thay E2E DB/browser thực.

- [ ] `/static/vendor/socket.io/socket.io.min.js` trả Socket.IO client script khi server đang chạy; không dùng `/socket.io/socket.io.js` như static asset vì đó là Engine.IO endpoint.
- [ ] Socket connect bằng JWT hợp lệ và server trả `qlpk:connected`.
- [ ] Top-level workspace page tự start realtime client qua `app-header-loader.js`; embedded iframe không mount header lồng nhưng vẫn nhận event do parent forward.
- [ ] Parent socket đã subscribe room của các workspace tab/iframe đang mở; mở một admin/kho tab trong iframe vẫn nhận event dù URL top-level đang ở trang khác.
- [ ] Tạo/sửa lịch hẹn ở một tab làm dashboard, lịch hẹn, lễ tân, bác sĩ/TLG liên quan refresh danh sách mà không reload browser tab.
- [ ] Lưu chỉ định/kết quả chỉ định làm order-management và màn khám liên quan refresh danh sách/trạng thái.
- [ ] Tạo/nộp/kết thúc/hết hạn khảo sát làm modal và bảng cập nhật qua `survey.changed`/`order.changed`; deadline dùng refresh một lần tại next_expiry_at, không polling 3 giây.
- [ ] Xác nhận thanh toán hoặc trả trạng thái examination làm payment-waiting, lễ tân, bác sĩ/TLG liên quan cập nhật.
- [ ] Tạo/sửa bệnh nhân, thân nhân hoặc người nhà đi kèm làm lễ tân/bác sĩ/TLG liên quan cập nhật qua `patient.changed` nhưng không ghi đè form khám đang nhập.
- [ ] Lưu đơn thuốc có thay đổi tồn kho làm medicine-management và medicine-statistics cập nhật qua `inventory.changed`.
- [ ] Tạo/sửa/xóa service/package/user/ICD/survey template/text expansion hoặc danh mục cá nhân làm các màn liên quan refresh qua `catalog.changed`.
- [ ] Tạo/sửa/xóa lịch bận làm appointment-management và doctor-busy-schedule cập nhật.
- [ ] Upload/link/xóa tài liệu hoặc folder làm document-management cập nhật qua `document.changed`.
- [ ] Tạo/sửa/xóa khoản chi hoặc cấu hình cột thu chi làm `chi-tieu.html` cập nhật qua `finance.changed`; nếu đang nhập trong ô bảng thì reload phải chờ blur để không mất focus.
- [ ] `rg "startSurveyPolling|stopSurveyPolling|surveyPolling|POLLING|polling" app/static/js app/api app/modules app/realtime` không còn polling dữ liệu nghiệp vụ; các `setInterval` còn lại nếu có phải là loader/tooltip kỹ thuật.

## Prescription Print And Verify

- [ ] Tab Toa thuốc trên web dùng `.rx-screen`: logo/mã hồ sơ, tiêu đề xanh,
  nhãn song ngữ, thông tin hai cột ở khung rộng/một cột ở khung hẹp. Kiểm toa
  trống, nhiều thuốc/lời dặn dài, đổi bệnh nhân xóa nội dung cũ, barcode mới.
- [ ] In thường/H/N vẫn dùng `.moh-form` qua `PrescriptionPrintDocument`,
  không clone `.rx-screen` hay load `prescription-screen.css`; public verify
  giữ mẫu cũ. Chạy `node tests/prescription_screen.test.js` để khóa boundary.


Áp dụng khi sửa đơn thuốc, mẫu in, QR verify, shared prescription template, prescription public API, hoặc prescription view model.

### Endpoint Checks

- [ ] `GET /api/public/prescription/<code>` trả `200 application/json` với mã hợp lệ.
- [ ] Mã không tồn tại trả `404 application/json`.
- [ ] `diagnosis` là text display đã resolve ICD.
- [ ] Raw ICD IDs nằm ở `diagnosis_ids`.
- [ ] `relatives` có dữ liệu khi appointment có người đi cùng.
- [ ] Medicine rows có `name`, `generic_name`, `quantity`, `unit`, `usage`.
- [ ] Trên Doctor, để trống `Số ngày điều trị` rồi sửa lịch uống phải tính ngay số lượng của 1 ngày, thành tiền từng dòng, tổng số lượng và tổng tiền; không giữ 0 chỉ vì ngày trống.
- [ ] Nhập `Số ngày điều trị=N` phải nhân lại toàn bộ số lượng/tổng tiền theo `N`; xóa `N` phải quay về kết quả 1 ngày. Đơn legacy có ngày trống vẫn giữ quantity đã lưu ở lần tải/khôi phục/áp dụng đầu tiên cho tới khi bác sĩ chủ động sửa công thức.
- [ ] Public API không yêu cầu auth vì QR verify là public by design.
- [ ] `GET /api/public/prescription/<code>/verification-qr.png` trả `200 image/png` với mã hợp lệ và QR giải mã về đúng URL `/verify/rx/<code>`.
- [ ] QR endpoint trả `404` với mã đơn không tồn tại và không tạo QR cho đơn orphan.

### Verify Page Checks

- [ ] `GET /verify/rx/<code>` trả `200 text/html`.
- [ ] Page title là trang xác thực đơn thuốc.
- [ ] `.prescription-preview` có `data-render-context="verify"`.
- [ ] `.prescription-preview--verify` tồn tại.
- [ ] Không hiển thị block QR nội bộ hoặc chữ ký bác sĩ của bản in nếu verify context đang yêu cầu ẩn.
- [ ] Diagnosis không hiển thị raw ID như `2659`.
- [ ] Liên hệ/người đưa trẻ dùng dữ liệu lượt khám; người nhận thuốc để trống khi chưa xác nhận riêng.
- [ ] Chỗ trống chỉ dùng khi không có dữ liệu; không tự tạo giá trị lâm sàng.

### Layout Checks

- [ ] Thường/H/N dùng chung khung đen trắng theo Phụ lục I–III TT26/2025; đúng thứ tự mã đơn, đơn vị, bệnh nhân, chẩn đoán, thuốc, lời dặn, ký, liên hệ.
- [ ] Nhãn chung và câu cuối đơn khớp nguyên văn Đơn H.docx theo yêu cầu 10/09/2026; H có dòng Đợt trống như Word, N giữ ba dòng Đợt và số lượng bằng chữ; số lượng <10 ghi 0 đầu.
- [ ] Trẻ dưới 72 tháng có tuổi tháng/cân nặng/người đưa trẻ; người từ đủ 72 tháng không tự điền người đưa trẻ. Dòng người nhận H/N luôn có, không tự lấy CCCD người đi cùng.
- [ ] BHYT/người nhận/ngày đợt H/N chưa có nguồn riêng để trống, không suy từ ngày tái khám.
- [ ] Preview/print cùng stylesheet prescription-standard-form.css, QR 25mm giữ tỷ lệ; không còn logo/quảng bá/song ngữ/barcode hồ sơ.
- [ ] Modal đơn thật ngắn/dày và chưa có đơn: không tràn ngang, không giữ nội dung lượt cũ.
- [ ] Verify mobile 390px scale cả giấy, không đổi cấu trúc biểu mẫu.
- [ ] Chrome PDF: ca 1101 như ảnh người dùng một trang A4; đơn dài đủ dòng đúng thứ tự, không trang trống/chỉ có chữ ký; thuốc cuối đi cùng lời dặn/ký/liên hệ/người nhận khi nhóm vừa một trang.
- [ ] Đệm trong khung 4mm, chữ 12pt, vùng ký 25mm; dòng điền tay 6mm co giãn theo chiều ngang, không còn chuỗi dấu chấm ngắn cho BHYT/người đưa trẻ/người nhận; tuổi tháng không bị cắt hoặc chồng cân nặng.
- [ ] Sau afterprint giữ cửa sổ để hoàn tất lưu PDF.
- [ ] Chạy node tests/prescription_standard_form.test.js và node tests/prescription_followup_print.test.js.

### Print Safety Checks

- [ ] Lịch tái khám mới nhất CANCELLED hoặc xóa mềm: `show_re_examination_date=false`; print bác sĩ, lịch sử, preview và QR không hiện dòng ngày hẹn dù payload còn ngày. Lịch chưa hủy và ngày legacy không có lịch con vẫn hiện; ngày/status/snapshot lịch sử không bị sửa. Chạy `node tests/prescription_followup_print.test.js` và test policy tái khám PostgreSQL rollback.
- [ ] Luồng in A4 từ màn bác sĩ vẫn dùng default print context.
- [ ] Nút `In đơn` ở Doctor và `.tab-print-btn` trong modal lịch sử cùng đi qua `PrescriptionPrintDocument`; controller chỉ chuẩn bị dữ liệu, không clone screen preview hoặc tự sở hữu CSS/barcode/window lifecycle.
- [ ] Popup loading, document và error dùng Blob URL cùng origin; không gọi `document.open/write/close` để ghi lại `about:blank` sau async.
- [ ] Doctor/lịch sử cho cùng thứ tự BASIC/H/N, mã đơn, thuốc và bố cục mẫu Bộ Y tế.
- [ ] Bản in không bị inherit CSS verify/mobile.
- [ ] QR/chữ ký của bản in vẫn hiện theo default nếu không truyền flag ẩn.
- [ ] QR bản in chỉ tải từ endpoint cùng domain; source/template không còn tham chiếu `api.qrserver.com` hoặc dịch vụ QR bên thứ ba.
- [ ] QR được đánh dấu là print asset bắt buộc. Ảnh hợp lệ (`naturalWidth > 0`) mới cho gọi `window.print()`; ảnh lỗi/timeout đặt `data-print-ready="error"`, hiện cảnh báo và không gọi in.
- [ ] Đơn ngắn không ép `.prescription-preview--rx` cao gần trọn A4 và không dùng `margin-top: auto` để ghim QR/chữ ký xuống đáy; QR/chữ ký theo sát lời dặn bằng khoảng cách cố định.
- [ ] Đơn dài phân trang bằng normal flow, không mất header/phần đầu tài liệu; mỗi mẫu BASIC/H/N sau mẫu đầu bắt đầu ở trang mới bằng `break-before`.
- [ ] Nhóm ký/liên hệ/người nhận H/N trong normal flow, không absolute hay chồng nội dung.
- [ ] Không đổi shared template theo cách làm caller cũ phải truyền thêm param bắt buộc.

### Save And Stock Checks

- [ ] Thuốc trong kho được chọn từ combobox lưu/trừ kho theo `medicine_id`, không lookup bằng exact `medicine_name`.
- [ ] Thuốc nhập tay ngoài phòng khám có `is_external=true` và không trừ kho.
- [ ] Nếu một dòng thuốc phòng khám không có `medicine_id`, API trả lỗi yêu cầu chọn thuốc từ kho thay vì tự đoán theo tên.
- [ ] Lưu lại đơn theo các ca không đổi, tăng số lượng, giảm số lượng, xóa thuốc, đổi thuốc A -> B, đổi trong kho -> ngoài kho đều tạo đúng delta xuất/hoàn kho.
- [ ] `prescription_items` là baseline duy nhất của tổng số lượng đơn hiện tại; không suy tổng đơn từ ledger. Phân bổ lô hiện hành chỉ cộng movement có `batch_id` và đúng hai mẫu note appointment sẵn có; không thêm bảng/cột/index hoặc suy lô cho dữ liệu cũ.
- [ ] Hai request đồng thời cho cùng appointment được serialize bằng row lock: tồn cuối, item và movement lô luôn phản ánh đúng payload được xử lý cuối.
- [ ] Hai appointment đồng thời lấy cùng thuốc không oversell: medicine/batch được khóa theo thứ tự cố định; request thiếu tồn còn hạn rollback cả header/items/movement.
- [ ] Đơn nhiều thuốc có một thuốc thiếu tồn rollback cả các update thuốc đã chạy trước đó; không để tồn, item hoặc audit dở dang.
- [ ] Cấp thuốc chỉ dùng lô còn hạn theo FEFO; ví dụ lô A `100`, lô B `500`, đơn `400` phải cấp `100 + 300`, tồn từng lô `0 + 200` và tồn tổng `200`.
- [ ] Save không đổi số lượng không trừ lần hai; tăng chỉ cấp phần chênh lệch. Giảm/xóa hoàn phần đã truy vết về đúng lô theo reverse-FEFO, còn phần đơn cũ không có lô chỉ cộng lại tồn tổng và ghi movement `batch_id=NULL`, không đoán lô.
- [ ] Tồn tổng lệch tổng lô do dữ liệu cũ không chặn save và không bị tự cân bằng. Cấp mới bị giới hạn bởi giá trị nhỏ hơn giữa tồn tổng và tổng lô còn hạn; thiếu một trong hai phải rollback toàn request.
- [ ] Đơn pha trộn legacy + có lô: giảm trước phần có lô, sau đó mới hoàn phần legacy vào tồn tổng; xóa hết đưa net movement của appointment về đúng số lượng hiện còn cấp mà không làm sai số dư lô.
- [ ] Thiếu tồn vẫn được backend kiểm tra bằng giới hạn thấp hơn giữa tồn tổng và tổng lô còn hạn và rollback toàn request. Doctor chỉ hiện một thông báo ngắn: `Không đủ thuốc trong kho. Vui lòng kiểm tra số lượng đã kê và tồn kho.`; không đổ số dư lô, số thiếu hoặc chuỗi hướng dẫn kỹ thuật vào toast.
- [ ] Doctor hiển thị trực tiếp mỗi lô đã cấp thành một block xanh luôn mở, có số lô và số đã cấp; hai lô phải thành hai block, không có dòng tồn thứ hai, dòng `Đã cấp đủ • N lô` hoặc nút mở/thu gọn. Mọi thuốc trong kho đều hiện đúng một `Tồn kho: N đơn vị`; khi sửa tổng theo cùng `medicine_id`, dòng tồn vẫn giữ nguyên và trạng thái chuyển cam `Cần lưu để cập nhật lô` ngay mà không làm mất focus.
- [ ] Đơn vị nằm trong ô `Số lượng`: thuốc trong kho hiển thị đơn vị catalog dạng chỉ đọc, thuốc ngoài sửa được đơn vị; không còn metadata `Dạng thuốc`/`Trong kho`, chỉ dòng ngoài cơ sở có nhãn `Thuốc ngoài`. Lưu và tải lại vẫn giữ nguyên payload `unit`/`is_external` hiện hữu.
- [ ] Bật `Đặt lịch` với `Số ngày điều trị=N` tự sinh đúng ngày local hiện tại `+ N` lúc `09:00`, kể cả qua cuối tháng/năm; không còn fallback `+7`, còn giá trị trống/không hợp lệ không tự sinh ngày.
- [ ] Sau khi `Lưu` tạo lịch tái khám, backend trả `status=SCHEDULED`; UI hiển thị xanh `Đã tạo lịch` nhưng checkbox/datepicker vẫn editable cả ngay sau save và sau reload.
- [ ] Sửa ngày/giờ của lịch `SCHEDULED` rồi lưu cập nhật đúng appointment con hiện có; bỏ chọn rồi lưu hủy lịch `SCHEDULED`, không tạo appointment con trùng.
- [ ] Khi appointment tái khám chuyển `CONFIRMED`, UI hiển thị xanh `Đã xác nhận`, khóa checkbox/datepicker ngay sau load; khôi phục bản nháp không ghi đè hoặc focus vào hai control này.
- [ ] Gửi payload cũ/giả ngày giờ tới `POST /api/prescription/save` không đổi hoặc hủy lịch `CONFIRMED`; backend trả `already_confirmed`, `status=CONFIRMED` và giữ nguyên appointment con.

### Suggested Commands

```bash
python3 -m py_compile main.py
python3 scripts/check_prescription_stock_contract.py
python3 scripts/qa_prescription_stock_concurrency.py --run
node --check app/static/js/prescriptions/shared/prescription-document-template.js app/static/js/prescriptions/pages/doctor-prescription-print.js app/static/js/prescriptions/components/prescription-modal-preview.js app/static/js/prescriptions/components/prescription-modal-print.js app/static/js/prescriptions/components/prescription-print-document.js
curl -sS -I http://localhost:8000/verify/rx/<code>
curl -sS http://localhost:8000/api/public/prescription/<code> | python3 -m json.tool
curl -sS -D - -o /tmp/prescription-verification-qr.png http://localhost:8000/api/public/prescription/<code>/verification-qr.png
```

## Diagnosis ICD Contract

Áp dụng khi sửa diagnosis, ICD autocomplete, history, prescription, examination detail, hoặc appointment formatter.

- [ ] API edit/control trả raw IDs ở field có hậu tố `_ids` hoặc contract tương đương.
- [ ] API display/read-only trả diagnosis text đã resolve.
- [ ] Dữ liệu cũ dạng string vẫn hiển thị được.
- [ ] Không có màn đọc/print/history hiển thị raw numeric ID thay vì ICD text.
- [ ] Frontend không tự đoán display text từ raw IDs nếu backend có thể trả text.
- [ ] Search/filter theo chẩn đoán không gọi text function trực tiếp trên JSONB ICD IDs; resolve qua ICD catalog hoặc filter theo IDs.
- [ ] Từ khóa có hơn một page (`pagination.has_next=true`) hiển thị `Tải thêm`; FE
  gửi `skip` page tiếp theo và không cắt mảng kết quả bằng `.slice()`.

## Doctor Examination Patient Switch

Áp dụng khi sửa `doctor-examination.js`, `doctor-examination.html`, medical history component, prescription section, ICD section, orders, services, allergies, hoặc auto-save.

- [ ] `isLoadingExaminationData = true` trước khi clear/load.
- [ ] Clear DOM fields và JavaScript state/caches.
- [ ] Clear selected ICD arrays: diagnosis, bệnh kèm theo, history nếu liên quan.
- [ ] Clear prescription timers/loading state khi đổi bệnh nhân.
- [ ] Clear order/service selected state nếu block đó được load theo bệnh nhân/lượt khám.
- [ ] Dirty/snapshot handlers skip hoặc suppress trong lúc loading.
- [ ] Empty/null từ backend làm UI trống, không giữ dữ liệu bệnh nhân trước.
- [ ] `referralSource` ở form hành chính bác sĩ/tâm lý gia load từ `patients.referral_source`, 6 badge nguồn giới thiệu có icon + palette vibrant y tế nằm cùng một hàng với input, badge chuẩn gồm `Khách vãng lai` fill/khóa input đúng, badge `Khác` mở input tự nhập, auto-save vào patient field, và không bị clear khi mở/đóng modal Hỏi bệnh.
- [ ] Sau khi load xong mới tắt loading guard.
- [ ] Đổi nhanh A -> B -> A không để response cũ ghi lại diagnosis, đơn thuốc, chỉ định, dịch vụ, dị ứng, tiền sử, thuốc đang dùng.
- [ ] Đổi bệnh nhân khi còn timer UI hoặc snapshot cục bộ không được tạo request ghi dữ liệu cũ vào ca mới.
- [ ] Browser console không có error mới sau khi chọn ít nhất 2 bệnh nhân liên tiếp.

## Doctor Draft Recovery

Áp dụng khi sửa `draft-recovery.js`, global Doctor `Lưu`, leave guard, hoặc các
snapshot owner clinical/support/medical history.

- [ ] Với một appointment có dữ liệu DB, nhập thay đổi nhưng không bấm `Lưu`, đợi nháp được ghi, rồi reload: giá trị DB vẫn hiện trước; banner mới hiện `Khôi phục`/`Bỏ bản nháp`.
- [ ] `Khôi phục` đưa lại đúng giá trị bản nháp, đánh dấu rõ các field/dòng/panel khác DB, và global `Lưu` vẫn báo dữ liệu chưa lưu. Field/dòng/panel đã khôi phục phải có outline đỏ semantic, pulse ba lần rồi giữ viền tĩnh; không phát sinh cờ/icon/rail/badge text, wrapper/card, padding phụ, cắt chữ, hay tràn ngang. Với `prefers-reduced-motion`, outline vẫn hiện nhưng không pulse.
- [ ] Sau global `Lưu` thành công, banner và mọi marker biến mất; reload lại vẫn lấy DB và không còn đề nghị bản nháp.
- [ ] Sửa Tiền sử rồi bấm `Lưu` ngay (dị ứng, nguy cơ, dùng chất hoặc kế hoạch an toàn): request `PUT /api/appointments/<id>` phải mang snapshot giá trị hiện tại, không đợi debounce 400/500/550ms, không phát sinh autosave request Tiền sử thứ hai, và file kế hoạch an toàn đã upload vẫn còn sau reload.
- [ ] `Bỏ bản nháp` xóa lựa chọn; nếu đang ở trạng thái khôi phục thì UI quay lại dữ liệu DB chuẩn.
- [ ] Mô phỏng lỗi lưu/offline trong scope test an toàn xác nhận có thông báo bản nháp cục bộ; không ghi clinical data vào `localStorage`.
- [ ] Đổi nhanh A -> B -> A xác nhận không hiện/khôi phục nháp của ca hoặc bệnh nhân khác; record sai user/patient/hết hạn bị bỏ.
- [ ] Đổi bệnh nhân hoặc đổi/đóng workspace tab khi đang dirty phải mở `qlpk-confirm-dialog` với Lưu và tiếp tục/Bỏ thay đổi/Ở lại; không được hiện `window.confirm` hay dialog `beforeunload` của browser. F5/Ctrl+R/Cmd+R khi dirty phải mở cùng modal với Lưu và tải lại/Tải lại trang; Tải lại trang phải capture IndexedDB, reload vào DB-first, rồi mới hiện `Khôi phục`, không native dialog thứ hai. Toolbar reload, browser back/address navigation và đóng tab/cửa sổ vẫn có thể hiện dialog native vì browser bắt buộc sở hữu luồng này.
- [ ] Thay đổi chỉ thuốc rồi F5/Khôi phục không được focus hoặc mở dropdown ICD; thay đổi ICD rồi F5/Khôi phục phải đồng bộ lại hidden id và chip hiển thị, không giữ query text cũ.
- [ ] Khi Khôi phục có thay đổi đơn thuốc, focus phải vào ô tên thuốc (`data-prescription-field="name"`), không vào ô ghi chú (`usageNote`); marker khôi phục chỉ gắn trên dòng thuốc, không đếm dòng ghi chú trùng `data-prescription-row-id`.
- [ ] Khi load hoặc save lại ca có chẩn đoán ICD, mỗi mục chỉ xuất hiện dưới dạng `.icd-autocomplete__tag`; ô query text của multi-select phải rỗng, không lặp cùng tên bệnh cạnh chip.
- [ ] Khi bản nháp có `baseSnapshot` khác baseline API hiện tại, banner phải ở trạng thái cảnh báo và `Khôi phục` phải yêu cầu xác nhận stale-data; hủy cảnh báo không được áp dụng bản nháp.
- [ ] Capture đang chờ IndexedDB rồi bấm `Bỏ bản nháp`, đổi bệnh nhân, hoặc rebase sau save không được ghi lại bản nháp cũ sau khi thao tác kết thúc.
- [ ] Kiểm desktop và viewport hẹp: banner wrap gọn, không che action/header, không tạo overflow ngang hoặc scrollbar sai vùng.

## Doctor Manual Save Transaction

Áp dụng khi sửa global Doctor `Lưu`, `saveNow()`, `saveWorkspace()`, hoặc save
owner của đơn thuốc/chỉ định/dịch vụ.

- [ ] Click `Lưu` đổi ngay thành spinner + `Đang lưu...`, cập nhật live status và khóa cả `Lưu`/`Hoàn thành khám` tới khi main, detail và support writers kết thúc; các field khám vẫn nhập được.
- [ ] Trong header đơn thuốc, trạng thái hành động thành công (`Đã lưu`, `Đã tạo lịch`) hiển thị xanh lá tương phản; trạng thái chờ/chưa hoàn tất (`Chưa lưu`, `Đang lưu`, `Cần ngày`) hiển thị cam; lỗi thật vẫn hiển thị đỏ và trạng thái chưa phát sinh hành động vẫn trung tính.
- [ ] Double-click `Lưu` trong cùng transaction chỉ tạo một lượt writer cho mỗi owner; không có độ trễ giả hoặc modal thành công chặn thao tác.
- [ ] Nhấn `Lưu` khi 15 ô Các cơ quan/Khám tâm thần trống hoặc whitespace: điền và lưu `Không ghi nhận bất thường`; giữ ô đã nhập và không mặc định 4 ô Lý do khám/Bệnh sử/KQ khám toàn thân/Biểu hiện chung. Reload giữ dữ liệu; mở ca mới vẫn trống trước khi nhấn Lưu.
- [ ] Không có thay đổi ở clinical/history/support và không có ô Khám chi tiết cần điền mặc định thì không gửi HTTP write và feedback nói rõ không có thay đổi cần lưu.
- [ ] Chỉ `POST` các section dirty (kể cả section vừa được điền mặc định); main `PUT` không chạy nếu main/Tiền sử sạch. Load/error/background save không tự điền mặc định; lỗi lưu giữ dirty. Chạy `node tests/doctor_detail_defaults.test.js`.
- [ ] Sửa một clinical/detail/prescription/order/service field khi request tương ứng đang bay: response cũ không ghi đè UI mới, dirty còn tồn tại và feedback yêu cầu lưu lại.
- [ ] Mô phỏng lỗi từng prescription/order/service: feedback nêu đúng module lỗi, module đó vẫn dirty, không có toast thành công tổng; IndexedDB recovery được capture best-effort, không tự retry POST/PUT.
- [ ] `Hoàn thành khám` chỉ chuyển trạng thái khi transaction save trả `success`; partial/error phải giữ ca ở trạng thái hiện tại.

## Doctor Clinical Workspace Navigation

Áp dụng khi sửa `doctor-clinical-workspace.html`, `clinical-workspace-ui.js`, `support-modules-ui.js`, `doctor-examination.css`, hoặc owner navigation liên quan.

- [ ] Chọn một appointment hợp lệ hiển thị `#doctorClinicalWorkspace`; nav mặc định active `Khám` và chỉ `#doctorClinicalDecisionPanel` là top-level section đang hiện.
- [ ] Hành chính, Tiền sử, Khám, Dịch vụ và Chỉ định lần lượt mở đúng `#doctorReceptionistIntakePanel`, `#doctorHistoryPanel`, `#doctorClinicalDecisionPanel`, `#doctorServicePanel`, `#doctorIndicationsPanel`.
- [ ] Rail root có đúng năm mục Hành chính, Tiền sử, Khám, Dịch vụ và Chỉ định; đơn thuốc nằm inline dưới Khám và lịch sử đơn thuốc mở bằng nút local; không có support nav hoặc pane lặp lại.
- [ ] Trong Khám, action local `Đơn thuốc` hiển thị cùng vùng `Khám & xử trí`, số thuốc lấy từ state đã load, và click cuộn tới `#doctorPrescriptionWorkspace` trong cùng scroll container; không mở modal hay đổi root nav.
- [ ] Tài liệu đính kèm vẫn nằm trong Hành chính; Chỉ định là root pane độc lập, không tạo support nav hoặc save path thứ hai.
- [ ] Tab Chỉ định có ca đang chọn tải mẫu khảo sát, người thực hiện và rows từ API thật; ca không có rows hiển thị empty state nhưng input chung không còn disabled sau khi load thành công.
- [ ] Input Chỉ định luôn gợi ý mẫu khảo sát; chọn một gợi ý lưu `survey_template_id`, còn nhập text không chọn gợi ý lưu `order_name` tự do.
- [ ] Thêm, sửa và xóa row chỉ làm dirty state local; Doctor global `Lưu` gửi đúng một `POST /api/chi-dinh/appointment/<id>` và reload giữ đúng rows.
- [ ] Nút `Lịch sử` gọi patient-scoped endpoint, loại current appointment, hiển thị rows lịch sử và không query theo display name.
- [ ] Link/button active có `.is-active` và `aria-current="true"`; section/pane inactive bị hidden, top-level section có `aria-hidden="true"`.
- [ ] Click navigation không gửi request save, không kích auto-save, không clear field đang nhập và không đổi appointment context.
- [ ] Đổi A -> B -> A reset về section Khám, không hiển thị pane/data/history của bệnh nhân trước và không để stale response đổi active state.
- [ ] Desktop rộng hơn `86.24875rem` hiển thị rail dọc dễ đọc; tại và dưới breakpoint này nav thành hàng ngang scroll được, không clip label hoặc tạo horizontal overflow cho cả trang.
- [ ] Rail desktop có ba menu block cùng nhịp, label dọc nhỏ/mảnh và căn giữa trong block; nội dung không kéo cell theo độ dài chữ, rail không có cap height hoặc scrollbar dọc.
- [ ] Browser console không có error mới khi chuyển năm root nav, mở/đóng lịch sử đơn thuốc, rồi hoàn thành luồng chọn ít nhất hai bệnh nhân.

## Examinations And Details

Áp dụng khi sửa `app/api/examination*.py`, `app/utils/examination_utils.py`, form khám bác sĩ/tâm lý gia, modal khám chi tiết, chuyển trạng thái khám, hoặc response detail lượt khám.

- [ ] `pytest -q tests/test_workflow_contracts.py` đạt; test Node lifecycle của
  Tâm lý gia phải kiểm load/clear và response stale khi đổi nhanh ca.
- [ ] `GET /api/examination-id/<appointment_id>` trả đúng `examination_id`, `appointment_id`, `status` trong phiên đăng nhập.
- [ ] `GET /api/examination-details/<examination_id>/section/<section>` trả đúng field của section bác sĩ hoặc tâm lý gia, không trộn section cũ/sai context.
- [ ] `POST /api/examination-details` chỉ ghi field được gửi, không xóa nhầm toàn bộ section khi caller chỉ auto-save một field.
- [ ] `POST /api/examination-details/modal-save` lưu đúng `main_reason` vào `examinations` và các field linh hoạt vào `examination_details`.
- [ ] `GET /api/examination-details/modal-load/<appointment_id>` load lại đúng dữ liệu vừa lưu, empty/null không giữ dữ liệu bệnh nhân trước.
- [ ] `GET /api/examination-detail/<examination_id>` trả diagnosis/benh kèm theo dạng text và raw IDs ở `diagnosis_ids` / `benh_kem_theo_ids`.
- [ ] Nút hoàn tất/chuyển thanh toán chỉ đổi sang trạng thái hợp lệ theo `ExaminationStatus`.
- [ ] Màn bác sĩ/tâm lý gia load, đổi bệnh nhân, mở modal khám chi tiết và lưu một field nhỏ không phát sinh console error.
- [ ] Không chạm `PUT /api/appointments/<id>` cùng lúc nếu lát refactor chỉ nhằm `examination_details` hoặc read/view-model.

## Receptionist Intake

Áp dụng khi sửa `receptionist-new.html`, `receptionist-new.js`, helper trong `app/static/js/receptionist/`, form tạo lịch, tìm/tạo bệnh nhân, dịch vụ/gói, người đi khám cùng, hoặc submit appointment từ lễ tân.

- [ ] `receptionist-new.html` load đủ static assets, không 404 file JS mới.
- [ ] Browser console không có error mới khi mở màn lễ tân.
- [ ] Khi không có token, màn lễ tân redirect về login; khi có token, API calls vẫn gửi `Authorization` và toast thao tác vẫn hiển thị đúng.
- [ ] Ngày hiển thị trong tài liệu nháp, bảng người thân và modal người đi khám cùng vẫn theo format `dd/mm/yyyy`.
- [ ] Reload trang phải clear draft hỏi bệnh/tài liệu/địa chỉ cũ; datalist quan hệ người đi khám cùng vẫn được tạo.
- [ ] Tab trạng thái danh sách lịch đổi active tab và reload đúng danh sách.
- [ ] Bảng danh sách tiếp nhận render đúng STT, ngày giờ, bác sĩ, trạng thái và các nút sửa/chuyển khám/hủy lịch; badge count trạng thái vẫn cập nhật đúng.
- [ ] `python3 scripts/check_receptionist_fe_contract.py` đạt; không có quick-search/modal/hidden-control cũ, ICD legacy hoặc raw Bootstrap action button quay lại trong scope lễ tân.
- [ ] Các action lặp trong danh sách chờ, tài liệu đính kèm và người thân liên kết dùng semantic icon action (`QLPKIconSystem.createActionButton()` / `.qlpk-icon-action--*`), không dùng lại `btn-outline-primary`, `btn-outline-danger` hoặc `btn-success` để tô màu action.
- [ ] Bộ lọc danh sách chờ theo tên bệnh nhân, bác sĩ/TLG và ngày hẹn vẫn reload đúng danh sách; nút làm mới reset cả filter UI và state.
- [ ] Nút phân trang, chọn số dòng/trang và nút refresh danh sách lịch vẫn hoạt động đúng.
- [ ] Màn lễ tân không còn render vùng tìm bệnh nhân riêng bên trái, không còn asset `receptionist/patient-search.js`, và không còn controls local `patientSearch/searchPatientBtn/selectPatientBtn/clearSearchBtn`.
- [ ] `qlpkGlobalSearchInput` trên header vẫn hiển thị như entry tìm kiếm chung; không tạo lại search box riêng trong nội dung lễ tân.
- [ ] Dropdown bác sĩ, autocomplete dịch vụ và dropdown gói khám vẫn load đúng dữ liệu; chọn dịch vụ/gói không đổi `service_id`/`package_id` gửi khi lưu.
- [ ] Click chọn/copy một bệnh nhân cũ vẫn populate form đúng dữ liệu cơ bản: họ tên, ngày sinh/tuổi, giới tính, SĐT, CCCD, nickname, nhân khẩu học, nghề nghiệp, tình trạng hôn nhân, xu hướng tính dục và thai kỳ nếu có.
- [ ] Autocomplete hồ sơ cá nhân nếu dùng vẫn filter/chọn/sync hidden đúng cho quốc tịch, tôn giáo, dân tộc, học vấn, nghề nghiệp và xu hướng tính dục.
- [ ] Ô tuổi nhập tay chỉ nhận số, tự bỏ ký tự chữ/ký tự đặc biệt và tối đa 3 chữ số.
- [ ] Đổi ngày sinh tự tính lại tuổi; đổi cân nặng/chiều cao tự tính lại BMI; trong modal cá nhân, đổi ngày dự sinh vẫn tự tính số tuần thai và sync hidden `soTuanThai`.
- [ ] Các nút sửa nhanh thông tin cá nhân mở đúng modal/section: địa chỉ, nghề nghiệp, giới tính và CCCD/định danh.
- [ ] Trong modal thông tin cá nhân, focus ô xu hướng tính dục vẫn mở rộng modal đủ để thấy autocomplete và đóng modal reset lại layout.
- [ ] Trong modal thông tin cá nhân, đổi giới tính và checkbox mang thai vẫn enable/disable ngày dự sinh/số tuần thai đúng; khi không mang thai hoặc không phải nữ thì hidden `soTuanThai` được clear.
- [ ] Địa chỉ main form vẫn load được tỉnh/phường; đổi địa chỉ/tỉnh/phường vẫn cập nhật `addressSummary` đúng thứ tự chi tiết, phường, quận, tỉnh.
- [ ] Địa chỉ bệnh nhân cũ vẫn fill đúng vào ô địa chỉ hiển thị và các hidden field `addressDetail`, `province`, `district`, `ward`, `addressSummary` sau khi chọn/copy.
- [ ] Sinh hiệu khi edit lịch hẹn ưu tiên dữ liệu lượt khám gần nhất khi có; fallback từ patient chỉ điền field đang trống và không ghi đè sinh hiệu examination.
- [ ] Khi edit lịch hẹn cũ có lịch gần nhất, bác sĩ, dịch vụ hiện có, ghi chú hành chính và checkbox tái khám vẫn prefill đúng.
- [ ] `referralSource` hiển thị ở form hành chính, 6 badge nguồn giới thiệu có icon + palette vibrant y tế nằm cùng một hàng với input, badge chuẩn gồm `Khách vãng lai` fill/khóa input đúng, badge `Khác` mở input tự nhập, populate/save theo `patients.referral_source`, và không còn nằm trong modal Hỏi bệnh.
- [ ] Block hỏi bệnh visible trong form chính load đúng `mainReason`/`mainSymptoms` từ examination gần nhất và các field patient-owned `problemStartTime`, `symptomProgression`, `currentBehavior`, `severityLevel`.
- [ ] Header tiếp nhận lễ tân không còn nút `Hỏi bệnh`/`Tài liệu`; block hỏi bệnh và block tài liệu hiển thị trực tiếp trong form chính, chip tệp trong ghi chú vẫn đưa người dùng tới block tài liệu visible và không mở modal hỏi bệnh riêng.
- [ ] Vùng làm việc lễ tân cao bằng phần màn hình còn lại; `Tiếp nhận bệnh nhân` và `Danh sách chờ chuyển khám` cùng cao 100% vùng này, nội dung dài scroll trong đúng cột/body của nó và không kéo page thành khoảng trắng dài.
- [ ] Block tài liệu visible vẫn load size hint, mở file picker từ nút upload, drag/drop nếu dùng, validate loại/dung lượng file đúng message, upload file server khi đã có patient, render đúng empty/server/draft list, hiển thị đúng icon/dung lượng file, preview/download tài liệu server và download/xóa tài liệu nháp vẫn hoạt động.
- [ ] Nhập trong block hỏi bệnh visible vẫn giữ draft trong cùng page load; sau reset form hoặc reload không bị dính draft bệnh nhân cũ.
- [ ] Hint sinh hiệu gần nhất dưới các ô `prev*` reset khi đổi bệnh nhân và chỉ hiện giá trị hợp lệ từ lịch sử examinations.
- [ ] Bảng người thân liên kết load đúng theo bệnh nhân sau edit lịch; ngày khám cùng sync theo appointment khi đang edit appointment cũ.
- [ ] Bảng người thân liên kết khởi tạo được ngay khi mở trang, không báo lỗi nếu component load chậm.
- [ ] Modal người đi khám cùng mở được, load đúng danh sách theo appointment hiện tại, cleanup row đang pending khi đóng modal.
- [ ] JointExamManager khởi tạo sau khi mở trang; tạo lịch mới vẫn lưu được pending người đi khám cùng.
- [ ] Tạo lịch mới với bệnh nhân mới gọi đúng flow lưu patient rồi `POST /api/appointments/`.
- [ ] Nếu backend báo bệnh nhân trùng, modal bệnh nhân trùng vẫn render danh sách, chọn thẻ bật nút cập nhật, và nút Tạo mới/Cập nhật tiếp tục đúng luồng lưu không kiểm tra trùng lần nữa.
- [ ] Cập nhật lịch hiện có gọi `PUT /api/appointments/<id>` và giữ `patient_id` đúng.
- [ ] Bấm nút lưu chỉ chạy một lần trong lúc nút đang disabled và nút được bật lại sau timeout legacy.
- [ ] Thiếu bác sĩ/dịch vụ/gói hiển thị toast validation đúng, không gửi appointment API.
- [ ] Autocomplete dịch vụ mở được, chọn dịch vụ fill đúng hidden `serviceTypeId`.
- [ ] Duplicate appointment từ backend vẫn highlight ngày/giờ hẹn, hiện câu báo ngắn theo workflow (không show raw detail), rồi tự gỡ highlight khi đổi ngày hoặc giờ.
- [ ] Checkbox tái khám gửi `appointment_category=RE_EXAMINATION` và `original_appointment_id` khi có.
- [ ] Bỏ check checkbox tái khám phải clear nguồn `originalAppointmentId`, sau đó lưu không gửi nhầm `original_appointment_id` cũ.
- [ ] Dịch vụ gửi `appointment_type=SERVICE` + `service_id`; gói gửi `appointment_type=PACKAGE` + `package_id`.
- [ ] Người đi khám cùng/pending joint exam vẫn được lưu sau khi tạo appointment mới.
- [ ] Màn lễ tân không còn hidden controls giả cho in/số thứ tự hàng đợi (`printQueueBtn`, `nextQueueBtn`, `currentQueueNumber`, `waitingCount`, `printPreview`) và không còn include `receptionist/queue-print-controls.js`.
- [ ] Lưu thành công ở màn lễ tân không reload browser tab; form quay về trạng thái tạo mới, danh sách chờ refresh tại chỗ, tab workspace hiện tại vẫn giữ nguyên, danh sách order theo `appointments.updated_at` từ database và chỉ một lịch vừa sửa mới nhất có nhãn `Vừa cập nhật`.

## Doctor current medications DAV (2026-09-13)

- [ ] ICD/DAV dùng cùng control chips/input; popup mở không tăng chiều cao
  card, không bị panel cắt; tự mở lên/xuống, desktop/mobile. Chuẩn:
  `references/ui/autocomplete-field.md`.
- [ ] Field8 focus/tìm tên, hoạt chất, SĐK; 12 kết quả, cuộn tải tiếp; rỗng/lỗi/
  thử lại; ↑/↓/Enter, Escape/Tab/blur đóng. Không dirty chỉ vì gõ tìm.
- [ ] Chọn nhiều/bỏ từng thuốc, tên/hàm lượng chứa dấu phẩy giữ một entry;
  dữ liệu cũ ngoài DAV vẫn load, draft restore đúng. Không ghi đơn kê mới/kho.
- [ ] A→B→A xóa query/chips/kết quả; response cũ không mở lại; loading và
  history view không sửa được. Lưu/tải lại giữ JSON list hiện hành.
- [ ] `node --test tests/doctor_current_medications.test.js`; xem desktop/
  mobile390 có dữ liệu thật, tên dài, scroll list/body và remove; không dùng
  workspace hidden hoặc empty-only để kết luận đạt.

## Clinic Medicine Inventory

Áp dụng khi sửa danh mục thuốc, nhập lô, lịch sử giao dịch hoặc
prescription stock integration.

- [ ] JS màn Tủ thuốc là lõi `medicine-management.js` + 7 file
  `medicines/management-*.js` nạp đúng thứ tự template; thêm file mới phải
  cập nhật header `/* global */`/`/* exported */`, chạy
  `node --test tests/medicine_management_modules.test.js` và
  `scripts/check_js_globals.py` (0 unresolved). Tick một dòng phải hiện nút
  “Xóa đã chọn”, bỏ tick thì ẩn.

- [ ] Tooltip icon cảnh báo thuốc: hover/focus hiện sau120ms, không hiện
  thêm tooltip native; Tab đọc được nhãn, Escape đóng. Đổi trang/tìm kiếm
  kể cả kết quả rỗng không để tooltip cũ/timer tồn tại. Kiểm icon ở hàng
  đầu/cuối bảng và khi cuộn ngang không bị khung bảng cắt.

- [ ] Khối nguồn form thuốc: phụ đề header đổi đúng theo trạng thái — hướng
  dẫn chọn danh mục, "Thông tin đăng ký thuốc (Cục Quản lý Dược)" sau khi
  chọn/khi sửa thuốc liên kết, "Thông tin thuốc gốc (chưa liên kết...)" cho
  thuốc cũ. Các dòng có nhãn Tên thuốc/Hàm lượng/Hoạt chất/...; Hàm lượng ẩn
  khi đã nằm trong tên, Hoạt chất ẩn khi trùng hệt tên (vd Diazepam 5mg).
  Không còn ô Tên thuốc/Hoạt chất/Nguồn gốc/Hàm lượng trùng bên dưới; Đổi
  thuốc trả phụ đề về hướng dẫn; lưu thuốc mới vẫn gửi đủ identity.

- [ ] Modal nhập kho: rỗng/ít dòng vẫn gần đầy chiều cao khả dụng; desktop
  đủ cao giữ thông tin đơn hàng và nút Xác nhận/Hủy, bảng nhiều thuốc cuộn
  đến dòng cuối. Nhiều lô không đẩy mất bảng/nút; ghi chú dài vẫn đọc/sửa
  được. Màn hẹp/thấp cuộn thân và cuộn ngang đủ cột; kiểm thêm/xóa dòng,
  dropdown chọn thuốc/ngày và mở/đóng nhà cung cấp giữ dữ liệu đơn hàng.
  QA layout không bấm xác nhận ghi tồn thật.

- [ ] Panel "Lịch sử nhập & lô" trong modal Nhập kho: đóng mặc định; mở
  bằng nút "x lần nhập" ở danh mục và "Xem hạn dùng" trong form thuốc đều
  vào đúng modal này, tự lọc theo tên thuốc. Đổi từ khoá/trạng thái gọi
  lại đúng trang1; phân trang Trước/Sau hoạt động. Bấm một dòng lô mở
  lịch sử giao dịch ngay dưới dòng đó; bấm dòng khác đóng dòng cũ, chỉ
  một dòng mở tại một thời điểm. Không còn modal Chi tiết tồn kho/Lịch sử
  giao dịch riêng; mở khi modal Nhập kho đang có đơn dở không được xoá
  dữ liệu đang nhập.

- [ ] UI nhập kho bản nâng cấp: vùng bảng trắng có khung/toolbar liền mạch
  kể cả ít dòng; header trái, không còn khối tổng xanh. Ô nhập thẳng hàng,
  tên thuốc đủ rộng, tiền căn phải; ghi chú/chi tiết lô không đẩy mất bảng.
  Footer chỉ có một tổng đơn, cập nhật đúng sau thêm/xóa/đổi số lượng/giá;
  nút Hủy/Xác nhận ở phải, không cắt trên mobile. Đối chiếu số tổng/lô với
  dữ liệu nhập nháp và kiểm dropdown/date picker không bị vùng cuộn cắt.

- [ ] Modal nhà cung cấp: ít dòng vẫn gần đầy chiều cao khả dụng; desktop
  đủ cao giữ form/tìm kiếm/header/footer, danh sách dài cuộn riêng đến dòng
  cuối. Màn hẹp hoặc thấp cuộn phần thân, không cắt form/nút, bộ lọc xuống
  dòng và bảng cuộn ngang. Kiểm trạng thái rỗng, ít/nhiều dòng, sửa/reset,
  tìm/lọc và Đóng trở về modal cha không mất dữ liệu đang nhập.

- [ ] Thêm mới từ DAV → Cập nhật giá phải hiện đúng tên từ `medicine-name`;
  xác nhận giá chỉ điền giá tạm, đóng bảng giá và mở lại nút Lưu thông tin.
  Lưu danh mục gửi giá khởi tạo; chưa có ID thì không gọi API lịch sử giá.
  Nếu lỗi trước khi mở bảng giá: hiện lỗi trên form, bỏ trạng thái đang mở/
  đang tải, giữ giá đã nhập và cho thử lại. Fixture JS lấy ID từ template
  thật, không tự tạo phần tử cho ID sai (`name`).

- [x] DAV đường dùng lưu DB15/09:15432 giá trị và version,39320 trống;
  reader không gọi inference, route gốc ưu tiên. Upsert đổi dạng bào chế hoặc
  có route nguồn phải cập nhật/xóa gợi ý; backfill chạy lại không đổi, sai
  fingerprint bị chặn. Đã kiểm rollback và hậu kiểm commit; mọi field nguồn
  ngoài2 cột mới cùng medicines/lô/giao dịch/dòng đơn được bảo toàn.

- [ ] DAV chi tiết và form thêm thuốc dùng cùng gợi ý đường dùng: dạng rõ
  có nhãn Đường dùng (gợi ý), người dùng sửa được; route nguồn có dữ liệu thì
  ưu tiên/khóa. Dạng mơ hồ để trống; đổi thuốc không giữ gợi ý của thuốc trước.
  Kiểm biến thể mở rộng: Thuốc bột uống/Si rô → Uống; Dung dịch truyền
  tĩnh mạch → Truyền tĩnh mạch; Viên nang chứa bột để hít → Hít; Thuốc mỡ
  tra mắt → Tra mắt. Viên nén bao phim, nhỏ mắt/tai hoặc tiêm và uống để
  trống; không tự biến đường dùng gợi ý thành thông tin DAV đã xác minh.

- [ ] Chọn FDG QLĐB1-H07-19: gợi ý Tiêm editable, ml/lọ, số đơn vị trống;
  Quy cách giữ khoảng15,8–16ml. Đổi thuốc/reset xóa gợi ý và source text cũ;
  chọn thuốc có đường dùng riêng thì ưu tiên/khóa đúng. Không mặc định10 hoặc
  làm tròn thể tích để tính tồn; xác nhận lại sau khi sửa đơn vị/quy đổi.

- [ ] Modal thuốc sau thu gọn14/09: desktop thường thấy đủ4 nhóm và Lưu/Hủy
  không cuộn; kiểm Zopinox như ảnh user, thêm trước/sau chọn DAV và checkbox
  quy đổi. Chuỗi DAV dài/cảnh báo/mobile vẫn đọc và thao tác được, không cắt
  nội dung; user nhận visual QA, chưa được đánh dấu đạt bằng static checks.

- [ ] Form thuốc disable tồn tổng/tồn quy đổi/giá vốn; tên/hoạt chất/hàm lượng
  lấy từ DAV và readonly; giá bán editable. Direct POST/PUT có tồn/giá vốn bị chặn;
  Excel có giá vốn bị từ chối dòng, không ghi giá vào danh mục.
- [ ] Nhập cùng thuốc/lô 100 × 1.000 và 100 × 1.200 giữ hai ID, giá trị
  220.000; không sửa đè. Cùng lô khác hạn dùng bị chặn. Bỏ trống số lô/giá,
  NaN/Infinity/âm hoặc gửi remaining_quantity đều bị chặn.
- [ ] Xuất 120 theo FEFO cùng hạn/ngày: 100 từ lần đầu, 20 từ lần sau;
  hoàn 30 về 20 lần sau + 10 lần đầu. Giá vốn/tồn sau đúng từng movement.
- [ ] PUT metadata giá/ngày/lô/chứng từ của lần nhập bị 409; PUT số lượng
  bị chặn. Không backfill snapshot/giá cho lịch sử cũ.
- [ ] Chi tiết tồn phân biệt từng lần nhập, giá, chứng từ, giá trị tồn;
  thiếu giá không thành 0; có cảnh báo chênh tổng và lô kiểm thử. Kiểm dữ liệu
  thật, hai lần nhập khác giá, empty và lịch sử nhiều trang/nhảy trang/mobile.
- [ ] `QLPK_RUN_DB_TESTS=1 python -m pytest -q tests/test_inventory_receipts.py
  tests/test_existing_stock_lots.py tests/test_medicine_batch_audit.py` rollback
  toàn bộ dữ liệu test; schema/Alembic/auth/frontend/prescription stock gates.

- [ ] Bảng thuốc và modal lô có ô trắng, viền mảnh; trạng thái cảnh
  báo không tô cả hàng. Giá/tồn/số lô không có nền trang trí. Hover/chọn hàng
  vẫn phân biệt; số lô mở được bằng Enter, kết quả lọc rỗng có colspan 10.
- [ ] Không còn nút/modal Kiểm kê kho hoặc handler của chúng. Kiểm 10 dòng,
  trang cuối ít dòng, mobile cuộn ngang tới cột tác vụ.
- [ ] Tạo thuốc mới luôn trả `stock_quantity=0`; payload có field tồn trực
  tiếp bị từ chối.
- [ ] Không còn chọn TPCN/y dụng cụ. API từ chối category khác DRUG; loại cũ
  vẫn giữ dữ liệu, không được nhập thêm trước khi đối chiếu DAV.
- [ ] Thêm thuốc chỉ qua chọn DAV hoặc Excel mã nguồn DAV; tạo thủ công,
  nguồn hết hiệu lực/đã rút số, sửa identity và tạo trùng đều bị chặn.
- [ ] Autocomplete DAV xổ/tải ngay khi focus ô trống; gõ để lọc, xóa hết chữ
  trả về danh sách đầu; kiểm dữ liệu thật, cuộn tải thêm,
  một kết quả/rỗng; ↑/↓/Enter chọn, Escape đóng gợi ý, blur/Tab đóng;
  Đổi thuốc xóa lựa chọn cũ và xác nhận legacy, không đổi nguồn đã linked;
  chọn điền đúng field readonly, đóng/mở lại clear hết selection/result;
  response cũ không mở lại modal. Kiểm desktop/mobile và scroll/footer.
- [ ] Lookup DAV dùng `mode=autocomplete`, 12 dòng + has_more, không đếm tổng/
  thống kê. Focus lại trong 30 giây không fetch; quá hạn, reset form, đổi token
  hoặc inventory.changed tải mới. API mặc định vẫn có total/summary. Chạy
  `node --test tests/medicine_dav_autocomplete.test.js` và opt-in read-only
  `QLPK_RUN_DB_TESTS=1 python -m pytest -q tests/test_dav_autocomplete_query.py`.
- [ ] Thuốc cũ hiện Chưa liên kết; liên kết cần xác nhận, giữ ID/tồn/lịch sử.
  Thuốc đã liên kết không đổi nguồn; DAV thay đổi chỉ báo cần đối chiếu.
- [ ] Mẫu Excel mới tải được; dòng sai/trùng không làm mất các dòng hợp lệ;
  `tests/test_medicine_dav_link.py` cùng bộ receipt/opening/audit chạy rollback.
- [ ] `PUT /api/medicines/<id>` có `stock_quantity` bị từ chối; form danh mục
  hiển thị tồn read-only và không gửi field này.
- [ ] Tạo lô đặt `remaining_quantity=quantity`, khóa aggregate và tạo đúng một
  movement `import` có `batch_id` trong cùng transaction.
- [ ] Import-order nhiều dòng validate toàn bộ trước khi ghi; một dòng lỗi
  rollback toàn request, không silently skip.
- [ ] POST `/api/medicines/inventory-count` và
  `/api/medicine-batches/inventory-count` trả 404 trên app nạp code mới;
  không còn service `adjust_batch`. Movement điều chỉnh cũ vẫn đọc được.
- [ ] PUT số dư lô, POST ledger trực tiếp và xóa lô đã có movement đều bị chặn.
- [ ] Excel catalog không bơm tồn trực tiếp; cột tồn dương bị bỏ qua kèm hướng
  dẫn nhập lô.
- [ ] Lịch sử giao dịch lọc được theo tên thuốc và số lô; movement import/
  adjustment hiển thị đúng loại, lô, người thực hiện và ghi chú.

## Medicine Reference Catalog

Áp dụng khi sửa danh mục thuốc DAV, API đồng bộ DAV, model `medicine_reference_catalog`, hoặc màn `medicine-reference-catalog.html`.

- [ ] Sau migration search index: 7 idx_dav_* valid; EXPLAIN count tablet
  dùng expression trigram, trang đầu rỗng dùng ordered btree. Đo riêng list
  có count và autocomplete; thử rỗng, 1–2 ký tự, tên/hoạt chất, tiếng Việt,
  SĐK và không có kết quả. So total/IDs/thứ tự trước-sau; không lấy thời gian
  service làm thời gian end-to-end UI. Schema và Alembic strict phải đạt.
- [ ] Nhập tablet/18, Enter/nút tìm về trang1; trong lúc chờ không hiện bảng
  của từ khóa cũ. Gõ đổi từ khóa hủy request trước; submit nhiều lần không gửi
  trùng. Kiểm timeout/thử lại, lọc rỗng, phân trang theo tổng đã lọc; summary
  giữ nguyên khi tìm nhưng tải lại sau sync. Chạy `node --test tests/dav_catalog_search.test.js`.
- [ ] `GET /medicine-reference-catalog.html` trả `200 text/html` và load đủ CSS/JS riêng của màn DAV.
- [ ] Không có token thì list/detail/sync API trả `401 application/json`, không public nhầm danh mục quản trị.
- [ ] Search theo tên thuốc, hoạt chất, số đăng ký hoặc nhà sản xuất trả đúng dữ liệu đã sync.
- [ ] Bộ lọc đang hiệu lực/hết hạn/tất cả trả đúng số liệu summary và danh sách.
- [ ] Nút chi tiết mở modal, hiển thị thông tin thuốc đã chuẩn hóa; không có
  nút/vùng JSON kỹ thuật, response detail không chứa raw_payload. Kiểm tên,
  hoạt chất, SĐK, nhà sản xuất, ngày và trạng thái vẫn đúng.
- [ ] Không còn Phạm vi đồng bộ/sample cap. Kiểm service bằng nguồn giả lập
  nhiều trang: đi hết nguồn và commit, không dừng ở trang đầu.
- [ ] Xuất Excel theo search/hiệu lực, gồm toàn bộ trang; thử0/1/nhiều dòng
  và toàn bộ nguồn. Kiểm download thật, chống bấm trùng, lỗi mở lại nút,
  auth401, màu nâu–kem, freeze/filter, text SĐK/mã DAV (giữ số0 đầu), ngày
  dd/mm/yyyy và chuỗi dài. Chạy tests/test_dav_export_sync.py cùng các tests
  DAV read-only/JS; mở file trong Excel để kiểm mã không bị scientific notation.
- [ ] Đồng bộ toàn bộ upsert vào `medicine_reference_catalog`, không ghi sang `medicines`, batch, tồn kho hoặc giao dịch kho.
- [ ] Các cột DAV có chuỗi dài như hàm lượng, dạng bào chế, đường dùng, tiêu chuẩn và tuổi thọ đủ rộng để không bị truncation.

## Backend Endpoint Refactor

Áp dụng khi tách service/view model hoặc chuyển route sang blueprint/module mới.

- [ ] URL public/private cũ vẫn hoạt động nếu chưa có kế hoạch breaking change.
- [ ] HTTP status và content type giữ nguyên.
- [ ] Response shape giữ nguyên ngoài field đã ghi trong contract.
- [ ] DB session đóng trong `finally` hoặc theo helper hiện có.
- [ ] Không import `main.py` chỉ để test helper nếu có thể test module nhỏ hơn.
- [ ] Syntax check các file backend đã sửa.

## Folder Move Checks

Áp dụng khi move template, JS, CSS, API module, service, hoặc docs.

- [ ] Có mapping cũ sang mới trong commit/report hoặc module doc.
- [ ] Import path Python đã cập nhật.
- [ ] Template path Flask/Jinja đã cập nhật.
- [ ] Static asset URL/cache version vẫn đúng.
- [ ] Browser load page liên quan không lỗi 404 asset.
- [ ] Không move file unrelated trong cùng bước.

### Dropdown lịch tái khám (2026-09-07)

- [ ] Lịch mới chọn sẵn Khám tổng quát và actor; lịch cũ giữ dịch vụ/bác sĩ.
- [ ] Đổi dropdown rồi đổi tháng/tuần vẫn giữ lựa chọn; Đóng không đổi draft,
  Xác nhận giữ draft; Lưu rồi tải lại đúng lựa chọn, không tạo thêm lịch.
- [ ] Chỉ đổi bác sĩ/dịch vụ vẫn đánh dấu chưa lưu; recovery giữ selection;
  chuyển bệnh nhân reset. Lịch đã khóa không thể đổi qua UI hoặc API.
- [ ] Không còn ba dòng phụ dưới thống kê; chi tiết sự kiện chỉ hiện khi bấm.
  Header/nút/lịch nhỏ/ngày được chọn dùng theme chung, không palette xanh riêng.
