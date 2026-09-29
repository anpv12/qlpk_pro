# QLPK Refactor Progress

## Thống kê bốc thuốc theo thời gian — 27/09/2026

- Giữ lưu đơn=cấp thuốc. `ledger_report.py` thêm `view=medicines`, nhóm theo
  medicine ID, đếm distinct export operation, xuất/hoàn/ròng và tiền snapshot.
  Lô tách không nhân số lần; dữ liệu cũ thiếu operation/giá báo riêng, không backfill.
- `medicine-statistics.html/js`: tab bốc thuốc, Tháng này, bảng20 thuốc/trang,
  chọn tên lọc chi tiết theo ID, reset/late-response guard, phân biệt thiếu và0.
  Overview đơn hiện tại đổi nhãn “Lượt bốc” thành “Dòng thuốc trong đơn”.
- Test hiện hữu cập nhật fixture mock emit đã retire và payload shortage=None;
  không thay runtime lưu đơn/kho/giá, không migration, không commit.
- QA, bộ ca và giới hạn mobile/E2E: `references/medicine-dispensing-qa.md`.
- Kết quả cuối:133 Python rollback/unit +26 JS đạt; JS/Jinja syntax và diff-check
  các file chạm đạt. Desktop dữ liệu thật pass; mobile footer tràn ngoài phạm vi.

## Transfer modal surface — 27/09/2026

Sửa selector nền/bóng/bo góc từ `.transfer-modal` sang
`.modal-content.transfer-modal`, tránh tô trắng wrapper toàn màn hình.
Không đổi transfer API/state. Browser ca435: shell trong suốt, nội dung
giữ nền, backdrop đen opacity0.5, thấy màn khám phía sau; Hủy gỡ backdrop
và body modal-open sau animation.2 Node tests đạt; không request ghi.

## Doctor lịch tái khám tháng — 27/09/2026

Dịch vụ/Bác sĩ đã đổi sang autocompleteField chung (macro + core), single,
tìm không dấu; đổi chữ clear selection, chỉ xác nhận ID đã chọn; close/reset
clear dropdown, khóa khi loading/lịch khóa. QA chuột/phím/rỗng/mở lại draft,
desktop/mobile không cắt popup, không ghi DB. Chi tiết cùng QA doc bên dưới.

Popup chỉ còn lịch tháng, bỏ mini-calendar trùng chức năng; form gọn,
token chữ thống nhất, ResizeObserver giữ lưới vừa khung. Ngày nhiều lịch
dùng dialog4 mục/trang, không mở popover dài bị cắt. Sau phản hồi user,
đã hợp nhất presentation lịch hẹn/Doctor vào components/appointment-calendar
(JS+CSS): toolbar, Thứ Hai đầu tuần, thẻ lịch, status và màu bác sĩ.
API đọc bổ sung doctor_id/doctor_color và doctors[].calendar_color; giữ
scope quyền, save/draft.21 Node tests và Doctor contract
đạt;5 viewport với dữ liệu thật không cuộn/tràn; chọn/xác nhận/mở lại draft
đạt, không ghi DB. Computed styles8 nhóm trên cùng sự kiện thật ở hai
màn trùng nhau; lễ tân vẫn chuyển tuần/tháng và lọc bác sĩ.
Ngày dày18 lịch chỉ kiểm mô phỏng: chưa pass
visual/interactive QA với dữ liệu thật dày. Evidence và giới hạn:
`references/ui/re-examination-month-layout-qa.md`.

## Project health — đo toàn dự án (27/09/2026)

Phạm vi: 230 file Python, 219 JS (76.4k dòng), 78 CSS (38.8k dòng), 55 template
(33 trang), 417 route/57 blueprint, 30 alembic version. Script đo tại
`/tmp/qlpk-project-health/` (ESLint JSON, pyflakes, dup.py, css.py,
`pages-sweep.cjs` 33 trang, `psy-modal.cjs`). Kết quả chính:

- Runtime 33 trang (session admin, chặn ghi): 0 lỗi JS/console, 0 request fail.
  Bug xác nhận: TLG → modal Lịch sử → tab Dịch vụ ném
  `ReferenceError: prescriptionTabCache is not defined`
  (`patient-search-modal-dry.js`, file 2.393 dòng chỉ TLG nạp, còn 10 định
  danh chưa định nghĩa ở đâu: `toNumber`, `parseMedicineUsagePayload`,
  `parseFractionalQuantity`, `formatDoseAsFraction`,
  `buildUsageTimeSlotDescription`, `parseGlobalUsagePayload`,
  `prescriptionTabCache`, `servicesTabCache`, `syncMedicalHistoryToHiddenFields`).
- ESLint toàn JS: 199 error (197 `no-undef`: 47 global chéo file không khai
  báo, 16 không định nghĩa ở đâu; 1 `eval` `chi-tieu.js:111`; 1
  `no-func-assign` `chi-tieu.js:511`), 842 warning (unused-vars 324,
  complexity ≥15: 154 / ≥20: 61, max 158 `buildMedicalRecordHTML` bản dry;
  30 file >600 dòng, lớn nhất 2.393; `no-alert` 29). Dup 0.9% (54 đoạn/708
  dòng). Mã chết không được nạp: `app-shell/sidebar-renderer.js`,
  `components/dry-sidebar.css` (531 dòng, 180 `!important`).
- CSS toàn bộ: `!important` 651, id-selector 894 (appointment-management 272,
  medicine-management 149, prescription 100, personal-detail-modal 93), 1.199
  literal màu ngoài token ở 48 file, 64 z-index literal, 499 class không có
  trong DOM/JS. Trang Doctor (22 file) đã sạch từ lát trước.
- Python: pyflakes 163 ghi chú trong `app/` (119 import thừa, 20 biến không
  dùng, 18 key dict lặp cùng giá trị ở `app/api/patient.py:346-385`), 61
  `except … pass/continue`, 3 bare `except`, 12 `print(`; 0 f-string SQL, 0
  `debug=True`, 0 secret cứng. File >800 dòng: `medicine.py` 1.996,
  `dashboard.py` 1.481, `patient.py` 1.147, `service.py` 969, `calendar.py` 944.
- Bảo mật: 0 security header (CSP/X-Frame-Options/HSTS/X-Content-Type-Options/
  Referrer-Policy); JWT trong `localStorage` (120 chỗ đọc); 175/204 GET API
  trả 401 khi không token, 9 JSON public có chủ đích (survey public, địa chỉ
  VN, health); upload nhạy cảm không public, avatars public. CDN ngoài 185
  tag, 0 SRI, lệch phiên bản (bootstrap 5.3.2/5.3.0, jquery 3.7.1/3.6.0).
- A11y: 47 control không tên ở 4 trang (service-management 20,
  holiday-management 20, service-category 6, document-management 1); 15/33
  trang không có `h1`.
- Hiệu năng: trung bình 2,07 MB/55 request mỗi trang; index tải 2 avatar chưa
  resize (722 KB + 454 KB), login PNG 2,3 MB, `medicine-clinic-interior.png`
  1,9 MB; 4 asset không `?v=` (`flatpickr-vn.js` trên 9 trang, 3 CSS đơn thuốc/
  autocomplete).
- Test: Node 273 pass; pytest 337 pass / 3 fail sẵn ở HEAD
  (`test_workflow_contracts`: 4 `font-weight` + 3 `font-size` cứng, 2 chuỗi
  kỹ thuật ra UI ở `medicine-management.js`) / 288 skip cần PostgreSQL
  opt-in. Ước lượng theo tên file: 60% file api/modules và 34% file JS có test
  tham chiếu; 19 file JS >600 dòng chưa có test.

### Đã xử lý (lát 1, 27/09/2026) — working tree, chưa commit

Nguyên tắc: mỗi lát có gate đo lại (ESLint JSON, pyflakes, css.py, sweep 33
trang, parity computed-style so với snapshot CSS). Script tại
`/tmp/qlpk-project-health/`.

- Bug TLG: `psychologist-examination.html` nạp `modal-history-data-runtime.js`
  + `modal-history-print-controller.js` như Doctor; bridge TLG bỏ
  `dataRuntime:false/print:false` và các adapter dry; `showConfirmationDialog`
  dùng `QLPKConfirmationDialog.confirm`. Xóa `patient-search-modal-dry.js`
  (2.393 dòng) và `prescriptions/components/prescription-modal-print.js`
  (chỉ dry dùng). QA thật: modal TLG 5 tab render, bảng sinh hiệu 9 dòng,
  4 nút in, popup in mở "In toa thuốc"; 0 lỗi console (lỗi `Failed to fetch`
  chỉ do probe chặn POST preview PDF).
- Bảo mật: `app/core/security_headers.py` + `after_request` trong `main.py`
  (X-Content-Type-Options, X-Frame-Options SAMEORIGIN — shell dùng iframe cùng
  origin, Referrer-Policy, Permissions-Policy, CSP `frame-ancestors/base-uri/
  object-src`, HSTS khi HTTPS); cảnh báo critical khi SECRET_KEY còn giá trị
  mặc định; SRI `sha384` + `crossorigin` cho 167/167 tag CDN có thể hash
  (18 còn lại là Google Fonts/link ngoài); bootstrap 5.3.0→5.3.2, jquery
  3.6.0→3.7.1. Chưa làm: `script-src` (cần bỏ 117 `onclick` inline), JWT trong
  localStorage (đổi sang cookie HttpOnly là thay đổi kiến trúc, cần duyệt).
- Ảnh: `app/utils/image_optimizer.py` (Pillow, cạnh dài ≤512, EXIF, JPEG q85;
  từ chối tệp không phải ảnh) dùng trong `POST /users/<id>/avatar`;
  `scripts/optimize_uploaded_avatars.py` đã chạy: 30 avatar 9.137 KB → 815 KB,
  bản gốc ở `_archive/uploads-avatars-original-20260927/`; 2 PNG lớn → JPEG
  (login 2.312→243 KB, header 1.917→159 KB). Trang trung bình 2,07 MB → 0,99 MB.
- Mã chết: xóa `app-shell/sidebar-renderer.js`, `components/dry-sidebar.css`
  (531 dòng, 180 `!important`), `static/templates/dry-sidebar/`; `flatpickr-vn.js`
  có `?v=`; route `/static/css/<path>` stamp `?v=` vào `@import` tương đối
  (`stamp_css_imports`), 0 asset không version trên 33 trang.
- Test: 3 pytest fail sẵn đã xanh (font cứng → token `--qlpk-font-*`,
  `getUserFacingResponseMessage()` thay chuỗi kỹ thuật ở medicine-management,
  contract chỉ định cập nhật theo `renderCustomOrderNote`/`linkedTemplate`);
  thêm `test_security_headers.py`, `test_image_optimizer.py`, stamp CSS,
  `chi_tieu_formula.test.js`. Node 278 pass, pytest 332 pass/0 fail
  (`test_pdf_preview` cần Chromium ngoài sandbox), 14/14 contract + smoke.
- JS: `chi-tieu.js` bỏ `eval` (bộ tính số học riêng: + - * / % ngoặc, chia 0 → 0,
  mã lạ → 0) và bỏ gán đè `renderThuChiChart`. A11y: 47 nút icon-only có
  `aria-label` (service/holiday/category/document) → 0 control thiếu tên.
- CSS toàn dự án: 1.199 literal màu → token `--qlpk-palette-*`/`--qlpk-alpha-*`
  (268 token mới, byte-identical), bỏ qua `print/vat_invoice.css` (in không nạp
  token); parity 33 trang 52.959 node/0 diff. Còn 12 hex 8 ký tự (alpha) và
  giá trị `data-color` trong selector.

### Đã xử lý (lát 2, 27/09/2026) — ratchet + id-selector toàn dự án

- Ratchet trong `scripts/check_frontend_contract.py` (chạy bởi
  `smoke_health.py`/pytest): `css_important` ≤438, `css_id_selector` ≤4,
  `css_hard_color` ≤12, `html_inline_event_handlers` ≤71,
  `js_inline_event_handlers` ≤93 (`Metric.exclude` cho file token/in; CSS bỏ
  comment trước khi đếm). Mọi lát sau chỉ được hạ ngân sách.
- Id-selector 884 → 4: 95 id → class `qlpk-<kebab>` (mapping
  `/tmp/qlpk-project-health/id-class-mapping.json`; `sidebar-container` →
  `qlpk-shell-sidebar`, `qlpkWorkspaceNativePane` → class có sẵn
  `qlpk-workspace-pane--native`); 124 phần tử trong template/JS nhận thêm
  class, id giữ nguyên cho JS. 17 id không có phần tử nào → xóa rule chết
  (`prescription.css` 100 selector, `custom-animations.css`,
  `examination-workflow.css`, `admin-management-ui.css`). Chỗ mất specificity
  được bù bằng class thật của phần tử: `.modal.<cls>` cho 18 modal,
  `.form-control.qlpk-avatar-file`, `.card-wrap.qlpk-order-files-details`,
  `:is(.main-content, .qlpk-workspace-pane.qlpk-workspace-pane--native)`,
  `.appointment-fullscreen .appt-main .qlpk-calendar-view-container`,
  `.patient-search-modal__tab-content-area.qlpk-modal-content-area`. 4 còn lại
  là giá trị `[data-color="#…"]`, không phải id.
- Bỏ override legacy `#genderEditBtn/#occupationEditBtn/#idCardEditBtn` trong
  `examination-workflow.css` (chỉ TLG nạp): nút sửa giờ nằm trong ô nhập như
  Doctor/Lễ tân theo owner `patient-info-form.css` (ảnh
  `/tmp/qlpk-project-health/tlg-after.png`). Có chủ đích, không phải parity.
- Parity computed-style: baseline = CSS id-based trên cùng DOM
  (`/tmp/qlpk-css-before-ids`), 33 trang × (mặc định + hover + mở tới 20
  modal/trang), so multiset (tag+class+style): 245.063 mục, 0 diff
  (`/tmp/qlpk-project-health/css-parity-all.cjs`). Sweep 33 trang: 0 lỗi,
  0 request fail, 0 control thiếu tên, ~0,99 MB/trang.
- Sửa selector treo `.appointment-fullscreen #calendar,` (do thay đổi song
  song của người khác xóa rule `.fc` phía sau, khiến `overflow:auto !important`
  áp lên `#calendar`). Test Node cập nhật selector class (`medicine_import/
  supplier/reference_review`, `receptionist_appointment_time`); còn 1 fail
  `button_actions.test.js:59` do `stock-detail-badge` mất
  `data-qlpk-button="view"` trong thay đổi song song lúc 16:48 (không thuộc
  lát này).

### Đã xử lý (lát 3, 27/09/2026) — backend lint

- pyflakes `app/` + `main.py` 163 → 86: bỏ 66 import thừa trong 26 file
  `app/api/*` (chỉ import một dòng, không đụng file đang sửa song song:
  `medicine.py`, `medicine_batch.py`, `family_member.py`, prescriptions
  services), xóa 9 key dict lặp cùng giá trị ở `app/api/patient.py`
  (`GET /api/patients/<id>` vẫn trả đủ 39 khóa). 51/51 module `app.api` import
  được, pytest 332 pass. Còn lại: import model trong `main.py` (đăng ký ORM),
  `app/models`, `app/modules`, biến cục bộ không dùng.

### Đã xử lý (lát 4, 27/09/2026) — handler inline → listener ủy quyền

- Owner mới `app/static/js/shared/inline-actions.js` (nạp qua
  `partials/user-feedback-runtime.html` cho mọi trang): `data-qlpk-call="fn"`
  + `data-qlpk-args='[...]'` (JSON; `$this`/`$event`/`$value`),
  `data-qlpk-on="change"`, `data-qlpk-on-<event>="fn"` + `-args` cho nhiều
  sự kiện trên cùng phần tử (focus/blur → `focusin`/`focusout`),
  `data-qlpk-prevent`, `data-qlpk-stop` (dừng cả listener document sau nó),
  `data-qlpk-self` (thay `if (event.target === this)`); đường dẫn có dấu chấm
  giữ `this` là owner (`CustomModal.closeModal`). Test
  `tests/inline_actions.test.js` (3 ca).
- Chuyển 102 handler tự động + 10 sửa tay (document-management đóng modal,
  chi-tieu: `triggerImportFile`, `appendFormulaToken`, `scheduleCloseAc`,
  `showRawNumberCell`/`formatNumberCell`, `attrJson` an toàn cho JSON trong
  thuộc tính, `selectAc`/`updatePresetBtns` không đọc `onfocus`/`onclick`
  nữa mà dùng `data-ri`/`data-col`/`data-qlpk-args`); order-management truyền
  `criteriaName` qua JSON thay chuỗi nội suy. HTML inline 71 → 6, JS 93 → 16
  (ratchet ≤6/≤30; còn `medicine-management.*` và
  `re-examination-calendar.js` đang được sửa song song).
- QA: 19 trang, 214 ràng buộc resolve 100% hàm, 0 args lỗi, click smoke 0
  lỗi; chi-tieu sâu: tab, preset dropdown, overlay tự đóng, formula picker,
  ô số focus/blur/change (raw ↔ định dạng, cập nhật `rows`), autocomplete
  mở/đóng, multi-select giữ mở khi chọn/đóng khi click ngoài, sort, `selectAc`.
  Sweep 33 trang 0 lỗi. 70 hàm gọi qua dispatcher không hàm nào dùng `this`.
- Thay đổi song song của người khác lúc 17:04 làm
  `check_doctor_examination_contract` fail (`doctor-prescription.css` bỏ
  `flex: 1 1 0` của ô Số ngày) và `button_actions.test.js` fail — không thuộc
  các lát này.

### Đã xử lý (lát 5, 27/09/2026) — CSP report-only

- `security_headers.py` gửi thêm `Content-Security-Policy-Report-Only` với
  chính sách ứng viên (`script-src 'self'` + 4 CDN, `style-src` cho phép
  inline vì thư viện chèn style, `img-src data: blob:`, `connect-src ws:`,
  `frame-src blob:` cho preview PDF). Sweep 33 trang với listener
  `securitypolicyviolation` (probe chèn script inline → 1 vi phạm, chứng minh
  harness hoạt động): 0 vi phạm khi tải trang, chọn bệnh nhân Doctor và mở
  modal Lịch sử. Chưa bật cưỡng chế: còn 6 `onclick` ở
  `medicine-management.html` + 16 handler JS (`medicine-management.js`,
  `re-examination-calendar.js`) đang được sửa song song; khi 2 ratchet
  `*_inline_event_handlers` về 0 và sweep tương tác vẫn 0 vi phạm thì đổi
  header sang `Content-Security-Policy` (quyết định của user).

### Đã xử lý (lát 6–7, 27/09/2026) — backend lint, gate globals, mã chết, complexity

- Backend: 10 chỗ `except Exception: pass`/bare `except` rộng → log có ngữ
  cảnh (`google_calendar_service`, `models/medicine`, `vietnam_address`,
  `user` ×2, `doctor_busy_schedule`, `auth`, examinations/appointments
  services); 51 `except (ValueError|TypeError|StopIteration…): pass` còn lại
  là parse-or-ignore có chủ đích. pyflakes `app/`+`main.py` 163 → 54 (bỏ
  import stdlib/sqlalchemy thừa, biến cục bộ không dùng, giữ lời gọi
  validate `get_examination_by_id`/`get_create_examination_doctor`, f-string
  không placeholder). 109/109 module `app.*` import được. Còn lại: import
  model trong `main.py`/`__init__.py` (đăng ký ORM/re-export), file đang sửa
  song song.
- Gate mới `scripts/check_js_globals.py` (+ `scripts/eslint.health.config.mjs`,
  nối vào `smoke_health` mục `js_globals`, tự bỏ qua khi thiếu ESLint): mọi
  global mà script classic của một trang tham chiếu phải được script trên
  trang đó định nghĩa → 31 trang, 0 thiếu. `survey-template-create.js` dùng
  `window.surveyTemplateManager` thay `typeof` guard.
- Mã chết: xóa `permission-check.js` (221 dòng, complexity 22) + 29 thẻ
  script; đo trên 33 trang: 0 phần tử `a.nav-link[data-permission]`,
  `#logoutBtn`, `.sidebar-user`, `#submenu-*`; caller `window.checkPermissions`
  đều có guard; contract workspace-tabs/doctor cập nhật.
- Complexity ≥20: 57 → 48. `renderAppointmentCard` 23 → model + 2 variant
  (72 ca byte-identical), `buildMedicalRecordModel` 20 → tách trường theo vai
  (288 ca byte-identical), `buildHistoryRowHtml` 23 → flags/actions/classes
  (harness mới `/tmp/qlpk-project-health/mhl-fixtures.cjs`, 60 ca
  byte-identical), `loadCombinedAppointments` 31 → fetch/collect/publish
  (test mới `tests/examination_waiting_list_load.test.js`, 3 ca),
  `patient-history-modal.create` 29 → `resolveModalDependencies`/
  `createPrintController`/`unbindTriggers`/`bindConfiguredTriggers` (modal
  Doctor+TLG 5 tab + in vẫn đúng), `workspace-tabs.closeTab` 22 →
  `pickNextTab`/`confirmCloseTab`/`removeClosedPane`, `autocomplete-field`
  `position` 22 / `handleKeydown` 21 → `viewportBox`/`isClippedByScrollParent`/
  `moveActiveOption` (QA ICD: mũi tên, Enter chọn id, Escape đóng).
- Server 8000 của user đã tắt (không còn tiến trình lắng nghe); đã chạy lại
  `python3.11 main.py` trong phiên QA để kiểm tra; cần tắt sau khi xong.

### Tiếp tục lát 8–9 (27/09/2026) — chỉ định và shell Tâm lý gia

- Lát 8: `doctor-indications-form.readForm` tách đọc input, kiểm tra và chọn
  survey; test bao phủ tên/ngày/người thực hiện, survey đúng tên, sửa tên
  thành custom, cơ sở ngoài và payload không giữ người thực hiện nội bộ.
  Cập nhật hai kiểm tra source-string trong Doctor contract và workflow
  test theo helper mới, vẫn kiểm cả source và survey ID trong payload.
- Lát 9: bỏ các nhánh không còn caller trong `form-dom-utils.js` và
  `page-core-utils.js`, gồm populate/hydrate, Doctor reset/alias, save shell
  cũ và interaction shell. Tách bootstrap/loaders/adapters/auto-save nhưng
  giữ thứ tự thực thi và API còn dùng của trang Tâm lý gia. Dòng vật lý:
  939→651 và 1.035→674; cả hai dưới ngưỡng 600 dòng ESLint sau khi loại
  blank/comment, không phải dưới 600 dòng vật lý.
- Test mới `clinical_shell_utils.test.js`: 8/8 đạt; sửa so sánh object khác
  VM bằng shallow-copy, không nới assert. Có ca thiếu timer thật, guard khi
  đang chờ lấy lịch hẹn và response ca cũ trả sau khi đổi ca.
  Parity baseline 20/20 tại `/tmp/qlpk-project-health/shell-parity.cjs`.
- Đo sau lát 9: complexity ≥20 toàn JS 47→37; file >600 dòng theo ESLint
  29→27; hai file shell không có lint error nhưng còn sáu hàm complexity
  16–19. Toàn JS còn 107 `no-undef`; kiểm global trên 31 trang không thiếu.
- QA: Node toàn bộ 309 đạt/1 lỗi `button_actions` (stock badge); workflow
  pytest 14/14; toàn pytest (loại `test_pdf_preview.py`) 332 đạt/305 bỏ qua;
  smoke_health 10/10 nhóm đạt; `git diff --check` sạch.
  Doctor contract còn lỗi `flex: 1 1 0` ở ô ngày thuốc thuộc thay đổi khác;
  không sửa layout hay xóa kiểm tra đó trong lát này.
- Browser desktop: nạp ca thật từ GET vào queue kiểm thử, mở lịch sử có
  dữ liệu và xem ảnh; lần kiểm riêng shell không lỗi JS/console, không
  request ghi. Chứng cứ `/tmp/qlpk-project-health/shell-browser-latest.json`,
  `shell-tlg-populated.png`, `shell-tlg-history.png`. Chưa pass visual/
  interactive QA đầy đủ (mobile, queue dày, ghi/lưu thật chưa kiểm).
  Harness modal cũ thử in bị chặn POST PDF và báo fetch lỗi; không coi là
  pass in. Browser kiểm thử đã đóng; không dừng listener chưa rõ owner.

### Lát 10 (27/09/2026) — auto-save Tâm lý gia khi đổi ca

- Khi trace caller địa chỉ/form phát hiện page chỉ truyền `shouldSkip`
  lần đầu, chưa bật `recheckSkipBeforeSave`/`isCurrentAppointment` dù helper
  có sẵn. Test tái hiện: đổi ca trong lúc chờ có thể gửi giá trị cũ vào URL
  ca mới; response cũ báo trạng thái trên ca mới; chưa chọn ca không được
  chặn tại page. Đây là lỗi hành vi, ưu tiên trước cleanup complexity.
- `autoSavePatientField` giữ snapshot appointment/patient/contextToken,
  chặn khi chưa chọn ca/loading/context đổi và bật kiểm tra lại sau await.
  Response thành công hoặc lỗi của context cũ đều trả `stale`, không cập
  nhật indicator của ca mới. Token phân biệt cả A→B→A. Không đổi API/payload,
  không gọi fallback tìm lịch hẹn khi page chưa có ca. Địa chỉ chưa sửa.
- 5 test page-wrapper mới: 4 lỗi trước sửa, cả 5 đạt sau sửa; nhóm shell +
  workspace 14/14 đạt. Node toàn bộ 314 đạt/1 lỗi stock badge như trước;
  smoke_health 10/10 nhóm đạt, JS syntax/diff sạch. Không thêm lint error
  trong core; `no-undef` chéo file ở page vẫn được global gate kiểm.
- Browser với ca lấy từ GET: cùng ca lưu đúng URL/body bằng PUT được
  intercept/fulfill, đổi ca/loading/token đổi đều `skipped` không gửi PUT;
  0 pageerror, 0 ghi DB thật. Chứng cứ
  `/tmp/qlpk-project-health/autosave-browser.json`. Browser đã đóng.
  Không dùng kiểm tra này để khẳng định lưu DB end-to-end hoặc toàn bộ UI đạt.

### Lát 11 (27/09/2026) — thống nhất fallback địa chỉ legacy

- `address-hierarchy-utils.js` có ba bản fallback: modal bỏ qua quận query
  200 khi wards query 404, trong khi form chính xử lý được. Test mới tái hiện
  1 lỗi/12 trước sửa. Gom district/ward fetch vào
  `fetchDistrictsByProvinceCode`/`fetchWardsByDistrictCode`; form chính và
  modal đều gọi `callVietnamAddressAPI`. Giữ exact district name, NFC tên
  tỉnh, code/id từ backend; không đoán mã, không đổi endpoint ghi hay DOM.
- `tests/address_hierarchy_fallback.test.js`: 16/16, gồm direct success,
  một/hai tầng 404, 500 không fallback, mạng lỗi, không khớp tỉnh/quận,
  payload array/data và adapter. Node toàn bộ 330 đạt/1 lỗi stock badge;
  smoke_health 10/10, diff sạch, file địa chỉ không lint error.
- Browser chặn wards query bằng 404, dùng danh mục backend thật và endpoint
  code: status200/10 phường, 0 pageerror/0 ghi. Chứng cứ
  `/tmp/qlpk-project-health/address-browser.json`. Probe đầu cố đọc options
  thất bại vì `ward` hiện là INPUT, `modalWard` không tồn tại; probe sau chỉ
  xác nhận helper/API. Không pass visual/interactive QA dropdown legacy;
  cần trace caller để loại tiếp các nhánh select đã không còn dùng, không
  xem kiểm thử fixture như bằng chứng UI đang sống. Browser đã đóng.
- Complexity ≥20 giảm 37→35. File dài đo hiện tại 28, không phải 27:
  `page-core-utils.js` vượt ngưỡng sau guard stale-error ở lát 10. Không hạ
  chuẩn hoặc bỏ guard an toàn để làm đẹp số đo; cần tách theo owner tiếp.

### Lát 12 (27/09/2026) — chuỗi Lưu → Hoàn thành Tâm lý gia

- Tái hiện bằng test: save hành chính bỏ qua kết quả cập nhật appointment;
  complete chỉ chặn `error`, nên `patientError`/`skipped` vẫn gọi transition.
  Save workspace còn chấp nhận clinical error/support skipped và kết quả
  success có thay đổi mới. Không phải chỉ cảnh báo lint.
- Kiểm kết quả appointment, trả `appointmentError` và thông báo rõ patient
  đã lưu nhưng lịch hẹn chưa lưu. Page giữ snapshot ca/bệnh nhân/token và
  helper chặn bước tiếp theo/callback khi context đổi. Không tuyên bố giao
  dịch nguyên tử hoặc rollback request đã gửi; upload draft lỗi vẫn là nợ
  cần kiểm riêng, không coi toàn bộ luồng lưu là đã giải quyết.
- Workspace fail-closed: owner lưu bắt buộc, kết quả thành công rõ ràng;
  clinical/support phải lưu đầy đủ. `Promise.allSettled` giữ khóa cho đến
  mọi nhánh hoàn tất. Complete chỉ nhận `saved`, giữ khóa riêng, kiểm
  HTTP/ID trước transition và token trước/sau await. History không markSaved
  khi context/revision đổi. Không sửa backend/DB hoặc trạng thái thật.
- Nhóm shell/workspace39/39 đạt; toàn JS355 đạt/1 lỗi stock badge.
  Workflow pytest14/14, user-feedback contract và smoke_health10/10 đạt.
  Có ca dirty không section phải chặn và dirty lưu sạch vẫn hoàn thành được.
- Browser dùng helper/base-save thật với PUT intercept/fulfill: patient200,
  appointment500 → `appointmentError`; base skipped → `skipped`; không có
  transition request, 0 pageerror. JSON/ảnh:
  `/tmp/qlpk-project-health/save-failure-browser.json`,
  `save-failure-browser.png`. Ảnh bắt đầu animation toast, không dùng để
  kết luận visual QA đầy đủ. Browser đóng; chưa pass lưu DB end-to-end.
- Đo ESLint hiện tại: 36 hàm ≥20 (guard mới làm
  `runPatientDataInternalSave` lên26), 28 file dài. Ưu tiên chặn sai dữ liệu
  trước; cần tách save flow có test bảo vệ ở lượt tiếp, không bỏ guard để
  giảm số đo. Lỗi stock badge/Doctor flex contract vẫn chưa sửa.

### Lát 13 (27/09/2026) — giữ tài liệu nháp khi upload thất bại

- Phát hiện uploader trả false nhưng caller vẫn xóa toàn bộ queue/cache,
  rồi save core còn nuốt exception. Test tái hiện7 lỗi trước sửa (upload
  false/network, thành công một phần, thiếu File/uploader, file thêm trong
  lúc chờ, đổi context và save vẫn đi tiếp).
- `document-section-ui-utils`: upload snapshot queue; chỉ loại từng file
  sau `true`, lưu metadata phần còn lại. Dừng và throw khi không upload
  đủ; retry không lặp file đã thành công. Guard context đi xuyên
  page→adapter→uploader; không xóa queue ca mới sau request cũ. Không đổi
  endpoint/storage key, không lưu File binary vào sessionStorage.
- `runPatientDataInternalSave` không nuốt lỗi upload; dừng trước cập nhật
  appointment/callback. Tách `savePatientAppointmentStep` và
  `reportPatientSaveFailure` giữ payload/thứ tự/guard. Hàm chính26→≤15;
  toàn JS ≥20 từ36→35, file dài vẫn28. Không có lint error mới ở hai helper.
- Nhóm upload+shell+workspace47/47; toàn Node363 đạt/1 lỗi stock badge như
  trước; smoke_health10/10, user-feedback contract và diff sạch. Test browser
  dùng File thật trong bộ nhớ và adapter thật với fetch giả500→200:
  thất bại giữ1 draft, retry xóa đúng draft/cache, 0 pageerror/0 request ghi
  thật. `/tmp/qlpk-project-health/upload-browser.json`; browser đã đóng.
  Đây là kiểm adapter, chưa pass visual/interactive QA luồng chọn file/
  danh sách thật hoặc upload DB end-to-end. Request mất response sau server
  đã ghi vẫn có nguy cơ retry trùng; chưa có idempotency backend ở lát này.

### Lát 14 (27/09/2026) — gỡ personal-detail modal không còn caller

- Trace xác nhận file chỉ còn nạp ở Tâm lý gia; Doctor/Lễ tân không nạp.
  Trang TLG truyền `personalDetailOptions: { bindings: {} }`, không có DOM
  modal; ba nút giới tính/CCCD/nghề nghiệp do patient-info-form mở inline
  panels. Nháp địa chỉ ở page dùng address-draft adapter riêng. File chưa
  có thay đổi trước lát này; gỡ1.751 dòng và include/comment template cũ,
  không xóa CSS hay autocomplete class dùng chung.
- A/B browser cùng dữ liệu GET thật, có/không tải script: desktop1440 và
  mobile390, 46 field value/disabled và trạng thái panel giống nhau; ba nút
  mở/đóng hoạt động, không modal cũ/overflow/pageerror/request ghi. Ảnh và
  JSON `/tmp/qlpk-project-health/personal-retire-{with,without}-{1440,390}.png`,
  `personal-retire-parity.json`. Đã xem ảnh mobile không-module cũ.
- Test guard trong psychologist_workspace_runtime kiểm không nạp lại file,
  patient-info-form vẫn có và binding inline còn đúng. Node364 đạt/1 lỗi
  stock badge; smoke_health10/10 và diff sạch. ESLint ≥20 từ35→30,
  file dài28→27, errors107→91 (bỏ16 global reference từ mã chết).
- QA sau sửa lần đầu thiếu queue đang rỗng nên nav ẩn và timeout; không
  tính là pass. Chạy lại cùng queue-response từ GET thật:0 lỗi/0 ghi,
  không request/global modal cũ, ba nút inline hoạt động; chứng cứ
  `personal-retire-after.json`. Không kiểm ghi DB thật, không suy rộng QA hai viewport thành
  nghiệm thu toàn dự án. Các phiên browser đều đóng.

### Lát 15 (27/09/2026) — chặn lưu hồ sơ tải thiếu

- Tái hiện8 test lỗi: chưa chờ hành chính, loader trả false bị coi thành
  công, throw mở khóa sớm, lỗi ca cũ hiện trên ca mới và auto-save sau lỗi
  tải. Workspace dùng allSettled cho cả5 owner; false/rejection giữ
  loadFailed. Runtime save/complete và page base-save/auto-save cùng chặn.
  Thêm test hydrate ca cũ kết thúc lỗi khi ca mới còn tải; không đổi trạng
  thái/loading hoặc hiện toast của ca cũ. Không đổi schema/API/payload.
- Nhóm shell/workspace50/50; toàn Node373 đạt/1 lỗi stock badge tồn đọng;
  workflow pytest14/14; smoke_health10/10, feedback contract đạt. Doctor
  contract vẫn đỏ `medicine-days flex: 1 1 0`. ESLint29 hàm≥20,27 file dài,
  91 errors. Không sửa file thuốc/CSS đang có thay đổi khác trong lát này.
- Browser Chrome với dữ liệu appointment GET thật và queue intercept:
  giữ GET clinical pending → save/complete skipped; GET500 → loadFailed,
  save/complete/auto-save/base-save đều skipped; retry GET thật → loaded,
  loadFailed=false.0 pageerror,0 request ghi. Chứng cứ
  `/tmp/qlpk-project-health/load-gate-browser.json`; browser đã đóng.
  Đây là QA logic tải/lưu với lỗi mạng giả lập, chưa pass visual/interactive
  QA toàn quy trình hoặc ghi DB end-to-end; không khẳng định đã loại hết
  hydrate race trong component con. Mục tiêu tổng thể vẫn active.

### Lát 16 (27/09/2026) — không điền nhầm ca sau tải địa chỉ

- Trace shared intake: promise hành chính xong luôn gọi populate hỏi bệnh,
  kể cả đã clear/đổi ca hoặc trả false. Setter địa chỉ còn ghi code/hidden/
  ward sau await mà không kiểm context. Tái hiện5 lỗi trước sửa.
- Token riêng mỗi intake instance, clear/populate vô hiệu hóa callback cũ;
  giữ return payload đồng bộ cho caller Doctor, false cho stale/failure.
  Guard truyền qua patient-info xuống hierarchy và setter province/ward.
  Tách hierarchy theo3 bước để không tăng complexity lên27 sau thêm guard.
  Không sửa bố cục/schema/endpoint; không đảo thay đổi patient-info có sẵn.
-8 test mới đạt: A→B→A, clear, false, sync parity, rejection cũ/mới,
  instance độc lập và tỉnh/phường tải chậm. Toàn Node381 đạt/1 lỗi stock
  badge như trước; smoke10/10, feedback/diff sạch. Lint hai owner intake/
  hierarchy0 error; còn cảnh báo create83 dòng. Chưa đo lại toàn bộ số đo
  sau lần tách cuối, không dùng kết quả trung gian làm baseline mới.
- Browser dùng component thật trên trang Lễ tân, chèn await khi hydrate
  địa chỉ và dữ liệu giả chỉ trong DOM: đổi ca/xóa form → response cũ false,
  fullName/province/hidden/ward/mainReason đều còn giá trị mới.0 pageerror,
  0 request ghi; `/tmp/qlpk-project-health/intake-browser.json`. Kiểm lại
  browser load gate TLG vẫn đạt. Các phiên browser đều đã đóng.
- Giới hạn: chưa pass visual/interactive QA toàn workflow; ca browser là
  fixture trong DOM, không nghiệm thu dữ liệu DB. Còn audit caller Lễ tân
  sau populateSharedForms (hiện không dùng return false), dropdown loaders
  và ghi/đọc độc lập; không tuyên bố đã loại hết race trên cả3 trang.

### Lát 17 (27/09/2026) — page Lễ tân bỏ response tải cũ

- Tái hiện5 lỗi trước sửa: edit A trả sau B đổi ngược ID/form; copy cũ
  ghi đè edit mới; populate false vẫn gán appointment; lỗi tải không chặn
  save; lỗi request cũ hiện toast ca mới. Thêm token/loading/failed cấp
  page dùng chung edit/copy/reset, kiểm cả trước và sau populate.
- Chặn save và tự lưu địa chỉ khi tải chưa đủ; duplicate check bỏ kết quả
  nếu đã đổi context. Copy thành tạo lượt mới xóa currentAppointmentId.
  Medical data nền kiểm patient/token. Prefill lịch/dịch vụ ở helper riêng
  trong try: lỗi phải giữ failed, không mở lưu; reset vô hiệu hóa GET cũ.
-9 test lifecycle đạt (thêm reset/hydrate pending/medical nền/prefill retry),
  toàn Node390 đạt/1 lỗi stock badge; smoke10/10, feedback và diff sạch.
  ESLint toàn cây29 hàm≥20,27 file dài,91 errors. Không sửa hai gate thuốc/
  CSS còn tồn đọng hoặc DB; không commit.
- Browser trang Lễ tân thật, patient response fixture cùng ID với hai
  request về ngược thứ tự: giữ tên mới, old=false, copy mới appointment
  null; pending chặn save/address PUT.0 pageerror/0 request ghi, phiên
  browser đóng. Chứng cứ `receptionist-load-browser.json` trong
  `/tmp/qlpk-project-health/`. Đây là test lifecycle với API giả, chưa
  pass visual/interactive QA toàn workflow hoặc ghi DB end-to-end.
- Findings để tiếp tục: savePatientDataInternal Lễ tân vẫn đọc current ID
  sau await và uploader cũ xóa tất cả draft/nuốt lỗi (cùng loại đã sửa TLG).
  Cần snapshot context, chặn bước sau khi đổi ca, giữ file lỗi; vitals,
  attachments, relatives, dropdown còn async riêng. Không coi gate tải là
  đã khắc phục transaction lưu hoặc mọi race.

### Lát 18 (27/09/2026) — bảo vệ save Lễ tân và draft upload

- Test trước sửa tái hiện stale save và lời gọi lưu kép treo (1 fail/4
  cancelled do implementation cũ chờ thêm request). Sau sửa8 test mới đạt:
  stale patient/appointment/upload, bấm đôi, file thiếu, response thiếu ID,
  upload một phần/retry, tạo patient thành công nhưng appointment lỗi.
- Snapshot token/patient/appointment; khóa isSubmitting; bỏ verify GET
  không dùng. Validation trước patient write, kiểm ID response, giữ ID
  patient mới khi bước sau lỗi tránh tạo trùng lúc retry. Appointment save
  helper dùng snapshot, stale không toast/reset form mới. Không rollback
  patient/upload đã ghi; không thay backend hay schema.
- Gỡ loop upload nuốt lỗi/xóa toàn queue; dùng helper chung TLG và chuẩn
  hóa result attachment object thành bool. File lỗi/thiếu giữ lại, cache
  cập nhật từng thành công. Guard xuống uploader thật; nạp helper ở Lễ tân.
- Toàn Node398 đạt/1 stock badge fail; workflow14/14; smoke10/10,
  feedback/diff đạt. ESLint30 hàm≥20,27 file dài,91 errors; không tuyên bố
  metric giảm vì guard uploader làm tăng complexity. Browser page Lễ tân
  với File thật và mọi write fulfill giả: upload500 giữ1 draft/cache và
  không gửi appointment; retry upload200 xóa đúng draft rồi appointment500
  trả appointmentError, giữ ID.0 pageerror/0 write thật, browser đóng;
  `/tmp/qlpk-project-health/receptionist-save-browser.json`.
- Chưa pass visual/interactive QA toàn workflow hoặc DB end-to-end.
  Findings tiếp: `joint-exam-manager.savePendingList` nuốt lỗi từng row,
  xóa cả queue sau lỗi và reload khi context có thể đã đổi; page chỉ gọi
  với appointment mới nên retry bước này cũng cần sửa cùng owner. Còn
  attachment/vitals loaders stale, same-case edits giữa save, response mất
  sau commit/idempotency; hai gate thuốc/CSS và bảo mật chưa hoàn tất.

### Lát 19 (27/09/2026) — giữ pending người đi cùng và retry đúng lượt

- Trước sửa4 test fail/2 cancelled (lưu kép cũ giữ promise chờ). Manager
  nay xác nhận response success/data.id rồi loại từng draft; lỗi/network/
  response không xác nhận giữ phần còn lại. Token + appointment + guard
  page chặn stale; save lock chống bấm đôi. Dòng nhập chưa xác nhận chặn
  completion; không sửa/xóa/thêm pending khi đang lưu, kiểm cả sau reload.
- Page/orchestration trả result xuyên suốt, gọi pending save cả khi đã có
  appointment để retry; chỉ saved mới toast/reset. Copy/reset clear token/
  pending row, reload không render response ca cũ. Không sửa phần thay đổi
  confirmation/autocomplete có sẵn trong joint-exam-manager.
-8 test manager mới +1 test tích hợp page; toàn Node407 đạt/1 stock badge
  fail như trước, workflow14/14, smoke10/10, feedback/diff đạt. ESLint30
  hàm≥20,27 file dài,91 errors. Không đổi API/schema hoặc ghi dữ liệu thật.
- Browser trang Lễ tân thật, queue fixture và toàn bộ7 write được fulfill
  giả: A200/B500 → jointExamError, còn B, giữ appointment ID; retry PUT
  appointment và POST chỉ B → saved/reset. Chỉ1 POST tạo appointment,
  người đi cùng theo thứ tự A/B/B,0 pageerror/0 write thật. Browser đóng;
  `/tmp/qlpk-project-health/joint-save-browser.json`. Chưa pass visual/
  interactive QA với dữ liệu thật hoặc DB end-to-end.
- Còn CRUD trực tiếp người đi cùng (saveNew/update/delete), attachment/
  vitals loaders, same-case edits giữa save; lỗi mất response sau commit
  cần idempotency. Các gate thuốc/CSS, bảo mật và full QA vẫn chưa xong.

### Lát 20 (27/09/2026) — một owner tải tệp, bỏ sinh hiệu stale

-9 test tái hiện đều đỏ: attachments giữ dữ liệu cũ khi pending, response
  cũ cùng patient/same-patient refresh hoặc lỗi mạng ghi đè UI mới, restore
  cache làm mất File nháp; vitals cũ vẫn render sau request mới/reset.
- Gom loader documents TLG về owner controls đang dùng ở Lễ tân; WeakMap
  theo list + page token/patient kiểm sau mọi await/error. Clear dữ liệu
  cũ trước GET; restore metadata chỉ khi RAM chưa có nháp. Adapter truyền
  getter token/nháp đầy đủ. Vitals token theo document, reset vô hiệu hóa
  GET; page reset hints khi set patient. Không đổi layout/API/DB.
- Toàn Node416 đạt/1 stock badge fail, workflow14/14, smoke10/10,
  feedback/diff đạt. ESLint30 hàm≥20,26 file dài (giảm1 nhờ bỏ loader
  trùng),91 errors. Loader owner còn complexity17, không bỏ guard để né lint.
- Browser Lễ tân/TLG: danh sách clear trước load, newest success rồi old500
  không đổi rows/HTML; reset vitals khi pending không render response cũ.
 0 pageerror/0 write, `/tmp/qlpk-project-health/patient-read-browser.json`;
  kiểm lại TLG load-gate browser đạt. Hai lần script QA đầu hook sai adapter
  TLG gây TypeError trong evaluate, không tính pass; sửa hook pageCoreAdapter
  rồi chạy đủ hai màn đạt, browser đều đóng. Fixture/response giả chỉ chứng
  minh lifecycle, chưa pass visual/interactive QA toàn workflow/DB E2E.
- Còn upload trực tiếp/xóa tệp/CRUD người đi cùng, relative loader và
  dropdown async; same-case edits giữa save và idempotency; gate thuốc/CSS,
  bảo mật/full QA vẫn chưa hoàn tất.

### Lát 21 (27/09/2026) — đối chiếu hai gate đỏ với chuẩn hiện hành

- Không phải hai bug sản phẩm đã chứng minh: button-system có ngoại lệ
  user duyệt27/09 cho badge Lần nhập nâu/không data-qlpk-button; test cũ
  vẫn đòi view trung tính, mâu thuẫn medicine_toolbar_style. Ô ngày thuốc
  dùng3ch căn giữa (prescription_context_typography kiểm đúng), script
  Doctor cũ còn đòi flex1 và tìm inline-size0 bất kỳ trong cả CSS.
- Chỉ sửa kiểm tra, không sửa ngược JS/CSS người khác: badge phải giữ button,
  handler, accessible label và ngoại lệ đúng tài liệu; Doctor kiểm declaration
  theo đúng selector line/input/unit, có flex0/3ch/center/padding/height.
  Thêm Doctor contract vào pytest workflow để không bỏ sót gate độc lập.
- Toàn Node417/417 đạt, workflow15/15 (bao gồm Doctor gate), diff sạch.
  Mutation test trong bộ nhớ cố đổi flex, width hoặc justify đều bị gate
  mới bắt; không nới assertion để che lỗi. Số code-health không đổi.
- Browser dữ liệu GET thật, không intercept response nghiệp vụ: badge đầu
  có2 lần nhập, gradient nâu/chữ trắng, Enter mở lịch sử nhập đúng thuốc.
  Doctor chọn ca1101, input7/30/365 ở1440/390px giữ giá trị và nhóm số+ngày
  nằm trong khung96px, lệch tâm0.008px.0 pageerror/0 write; browser đóng.
  Chứng cứ `/tmp/qlpk-project-health/gate-reconcile-browser.json`,
  `gate-days-control-{1440,390}.png`, `gate-stock.png`. Đã xem ảnh crop mobile
  và modal sau animation. Ảnh full mobile đầu cuộn qua input không dùng
  làm bằng chứng control; đã chụp crop đúng vùng. Không lưu đơn/DB, chưa
  nghiệm thu mọi trạng thái dense/empty/khóa hoặc toàn workflow.
- Đính chính dashboard: hai gate thuốc/CSS đã giải quyết bằng đồng bộ
  chuẩn kiểm tra; còn race CRUD/upload/delete, same-case edits, bảo mật,
  idempotency và QA xuyên suốt. Mục tiêu tổng thể vẫn active.

### Lát 22 (27/09/2026) — bảo vệ upload/xóa tệp xuyên ba màn

-16 test đầu tái hiện15 lỗi: xóa sau đổi ca trong confirmation, response/error
  cũ toast/reload ca mới, listener giữ options render đầu, bấm đôi gửi lặp,
  nháp mới trùng ID bị xóa hoặc ID chuỗi không xóa được, upload thiếu guard.
- Owner controls cung cấp context guard patient/token; list options theo
  render kể cả rỗng, khóa action/ID và kiểm sau confirmation/response. Nháp
  xóa đúng object snapshot; adapter/page truyền guard. Batch nhiều file dừng
  sau đổi ca; uploader stale không callback/toast. Doctor bridge tăng token
  lúc clear. Không đổi layout/API/backend và không ghi dữ liệu thật.
- Browser phát hiện TLG gọi `options.fetch()` với receiver không hợp lệ,
  upload trả false trước request. Thêm test đỏ rồi gọi function fetch độc
  lập; giữ contract auth/payload. Không che lỗi bằng mock fetch luôn thành công.
-24 test mới, toàn Node441/441 đạt; workflow15/15, smoke10/10, feedback/diff
  được chạy lại. Browser ba trang: đổi ca trong xác nhận không DELETE;
  bấm đôi một request giả; response sau đổi ca không toast/reload; upload
  trả sau đổi ca không thêm tệp. Lễ tân dùng file input thật với hai File,
  chỉ POST file đầu (fulfill giả), file thứ hai dừng.0 pageerror/0 write thật;
  `/tmp/qlpk-project-health/document-actions-browser.json`, browser đóng.
- Script QA đầu chưa chờ route upload chính xác, rồi gọi TLG đang khóa;
  sửa đồng bộ harness/unlock riêng fixture, không tính các lượt lỗi là pass.
  TLG/Doctor không có file input ở DOM hiện hành: gọi adapter với File thật
  chỉ chứng minh lifecycle, không phải QA thao tác chọn file. List fixture
  và response giả chưa pass visual/interactive QA đầy đủ/dense/DB E2E.
- Đo ESLint:29 hàm complexity≥20,27 file dài (helper chung vượt600 khi thêm
  guards),91 errors. Không tuyên bố giảm nợ tổng vì test xanh. Còn CRUD
  người đi cùng/relative/dropdown, same-case edits, idempotency backend,
  bảo mật và QA xuyên suốt; mục tiêu tổng thể vẫn active.

### Lát 23 (27/09/2026) — an toàn CRUD người đi cùng

-19 test đầu đều đỏ: create/update/delete còn toast/reset/reload ca mới,
  bấm đôi gửi lặp, HTTP200 success:false vẫn báo thành công; sửa row không
  khóa input, GET list chồng và GET edit cũ vẫn tác động màn mới.
- Gom ghi trực tiếp về `mutateRelative`, snapshot appointment/page token/
  row; khóa ghi kép và pending-save đồng thời. Kiểm xác nhận, response và
  JSON; POST/PUT cần ID được xác nhận. Lỗi giữ dòng để retry, khôi phục đúng
  disabled từng input. Không đổi API/payload/backend hoặc layout.
- List clear trước GET và revision mới nhất thắng, không refresh mất dòng
  đang sửa cùng ca; ca mới vẫn load được trong lúc write cũ chờ. Edit scoped
  tbody, kiểm appointment từ payload, row mang guard để không PUT vào ca mới;
  GET edit không mở form trong lúc DELETE pending. Hai bootstrap truyền page
  token Doctor/TLG/Lễ tân, bao phủ A→B→A không chỉ so ID hiện tại.
-25 test mới; toàn Node466/466 đạt. Test load cũ sửa setup: dữ liệu ca mới
  phải đặt sau khi clear, vẫn kiểm response cũ không ghi đè; fixture confirm
  dùng JSON success đúng backend, không hạ assertion. Browser trên ba trang
  dùng manager thật/DOM row thật và response giả: khóa khi PUT, bấm đôi chỉ1
  request, lỗi giữ row, retry reload đúng1 lần; đổi ca trong confirm không
  DELETE; POST cũ không feedback/reload mới. Pending-save browser cũ cũng
  đạt: A thành công/B lỗi rồi retry chỉB, không POST lại appointment.
-0 pageerror/0 write thật, browser đóng. Artifact
  `/tmp/qlpk-project-health/joint-crud-browser.json`. Lượt QA đầu thử gán vào
  confirmation object frozen nên harness lỗi; đã thay object trong context
  QA rồi restore, không sửa owner production để phục vụ test.
- Workflow15/15, smoke10/10, feedback/diff đạt sau sửa cuối. ESLint32 hàm
  complexity≥20 (tăng3 do thêm guard),27 file dài,91 errors; không gọi là
  đã trả hết nợ code. Hạ complexity phải giữ đủ contract an toàn vừa thêm.
- Fixture/hidden modal không phải nghiệm thu UI thực tế: chưa pass visual/
  interactive QA dense/sparse, end-to-end DB/concurrency. Còn relative-table
  loader/CRUD riêng, dropdown, same-case edits của page save, idempotency,
  bảo mật và nợ code. Mục tiêu tổng thể chưa hoàn tất.

### Lát 24 (27/09/2026) — lifecycle người thân liên kết

-15 test ban đầu đều đỏ: reload không trả promise, response A cũ ghi đè
  sau A→B→A; clear giữ cache/pending row; create/link/delete stale còn
  toast/reset, bấm đôi gửi lặp, success:false vẫn báo xóa thành công;
  readOnly không chặn method gọi trực tiếp, realtime/refresh mất nội dung.
- `relative-table` giữ context/revision instance; clear data trước đọc,
  newest-only cả lỗi. `mutate` chung cho ghi, snapshot row/patient, khóa
  thao tác và controls; lỗi giữ row/disabled gốc, retry xác nhận mới clear.
  Update không dựng dữ liệu fallback khi response thiếu; link phải có IDs.
  Đang nhập thì không refresh DOM, realtime chỉ update cache để cancel dùng
  bản mới. Clear dispose dropdown; chọn autocomplete khi đang ghi bị chặn.
  Không đổi API/schema/layout; không ghi dữ liệu y tế thật.
-22 test mới, Node488/488 đạt. Browser ba trang mounted instance thật với
  DOM edit và response giả: PUT bấm đôi1 request/khóa input, lỗi giữ row,
  retry cập nhật đúng ID; create trả sau switch không thay list ca mới;
  switch trong confirmation không DELETE.0 pageerror/0 write, browser đóng;
  `/tmp/qlpk-project-health/relative-crud-browser.json`.
- Workflow15/15, smoke10/10, feedback/diff đạt sau sửa cuối. ESLint33 hàm
  complexity≥20,27 file dài,91 errors; tăng1 hàm vượt ngưỡng khi bổ sung
  guard, không coi kiểm thử xanh là đã hết nợ kỹ thuật.
- Fixture/DOM thao tác qua evaluate chưa thay visual/interactive QA thực tế
  dense/sparse, liên kết hai chiều trên DB, đọc-ghi xuyên workflow. Response
  mất sau commit vẫn cần idempotency. Same-case edits khi page save và các
  dropdown khác/bảo mật/nợ code/full QA vẫn còn; mục tiêu tổng thể active.

### Lát 25 (27/09/2026) — giữ nội dung nhập trong lúc lưu trang

- Test tái hiện: sửa form giữa patient/appointment/pending-companion save
  bị reset; file thêm sau upload bị bỏ; response appointment ID sai vẫn
  dùng để lưu người đi cùng. Duplicate-check HTTP lỗi/mạng lỗi/body thiếu
  boolean bị coi là không trùng, bấm đôi check lặp, modal dùng snapshot cũ.
- So `collectFormData` trước/sau và kiểm nháp file trước reset: còn thay
  đổi trả dirty, giữ form/ID đã xác nhận, cảnh báo bấm lưu lại. Retry PUT
  đúng patient/appointment, không POST tạo lần nữa. Appointment ID cần
  số nguyên dương và khớp ID đang sửa. Không đổi API/payload/schema/layout.
- Duplicate-check khóa riêng toàn lượt, kiểm HTTP/body; thiếu xác nhận
  chặn tạo. Sửa form lúc check không mở modal cũ/lưu snapshot cũ, context
  đổi thì bỏ feedback. Không tuyên bố uniqueness/idempotency backend.
-11 test mới, Node499/499 đạt. Browser Lễ tân với nhập input thật: chờ
  appointment POST giả, đổi tên rồi trả200 → dirty/giữ tên và IDs; lưu
  tiếp PUT với tên mới → saved/reset; chỉ1 POST patient và1 POST appointment.
  Re-run browser upload lỗi/retry và pending-companion lỗi/retry đều đạt.
 0 pageerror/0 write thật, browser đóng; artifact
  `/tmp/qlpk-project-health/receptionist-revision-browser.json`.
- Workflow15/15, smoke10/10, feedback/diff đạt. ESLint33 hàm≥20,27 file
  dài,91 errors, không đổi so lát24; chưa trả hết nợ code.
- Chưa pass visual/interactive QA toàn workflow hoặc DB E2E: response ghi
  giả, không kiểm mất mạng sau commit thật/concurrency nhiều tab. Collector
  guard không thay revision backend, không bảo vệ field ngoài collector.
  Còn dropdown async/bảo mật/idempotency/nợ code và full QA; goal active.

### Lát 26 (27/09/2026) — tài khoản khóa và xác minh token

- Audit thực tế: login/password auth, HTTP get_current_user/guards và
  socket lookup đều thiếu is_active; user soft-delete vẫn có thể dùng
  credential/token cũ. Decoder realtime bỏ verify_exp nếu config0, khác
  HTTP. Last-login DB exception không đảm bảo close. Login body sai kiểu
  có thể500 thay vì400.25 test đầu17 đỏ/8 đạt trên source cũ.
- Giữ Bearer contract, gom HTTP decode về owner services đang dùng cho
  realtime; luôn verify exp nếu có, subject chuỗi không rỗng. Chặn user
  inactive/NULL ở service/HTTP guards/socket connect, login không cấp token.
  Input JSON kiểm kiểu trước authenticate. Activity session rollback/close
  khi lỗi. Không sửa account/secret/env/DB, không restart hay migrate.
-43 auth tests isolated DB mocks +3 header tests +15 workflow =61 Python;
  Node499/499, smoke10/10, feedback/diff đạt. Flask client kiểm login active
  giữ token/permissions, admin boundary, malformed body, expired/signature,
  inactive và DB cleanup. Socket handler giả lập kiểm active join đúng
  rooms, inactive không presence/join. Không nhập main hoặc ghi DB thật.
  HTTP runtime read-only `/health`200, `/check/me` thiếu token401.
- Strict auth audit còn2 finding route public static JS/CSS stamped trong
  main chưa có allowlist; không phải2 endpoint hồ sơ mở được chứng minh.
  Giữ báo cáo `/tmp/qlpk-auth-contract.log`, chưa nới gate để báo xanh.
- Chưa thu hồi socket đã kết nối trước khi khóa, chưa HttpOnly/CSRF/CSP
  script enforce, secret/expiry rollout/rate limit và session revocation
  còn phải thiết kế/kiểm chứng. Token legacy không-exp vẫn tương thích.
  Không tuyên bố hệ thống đã an toàn toàn diện; goal tổng thể active.

### Lát 27 (27/09/2026) — ranh giới quản trị tài khoản/nhóm quyền

- Trace phát hiện user/group/user-group chỉ require_auth; user thường có
  thể gọi CRUD quản trị. Caller hiện tại gồm quản lý tài khoản, nhóm,
  phân quyền và shortcut admin; picker bác sĩ dùng route riêng.
- Owner chung `account_access.py`: actor active/quyền nhóm đọc DB; route
  quản trị map ql-taikhoan/ql-nhomquyen/ql-phanquyen, admin bypass. Quản lý
  được giao không sửa admin/tài khoản mạnh hơn hoặc cấp nhóm vượt quyền
  mình. Tạo/khóa, đổi role/phạm vi bệnh nhân/reset password chỉ admin,
  tránh chiếm tài khoản và role staff có full patient scope. Hồ sơ thường
  vẫn sửa được; self password/picker giữ nguyên. Avatar kiểm user/quyền
  trước ghi file; debug patient route dùng clinical scope chung.
- Replace nhóm kiểm toàn bộ ID/quyền trước delete, nhận string checkbox,
  gom trùng, thiếu key không ngầm clear; [] clear rõ ràng, lỗi rollback.
  Group PUT thiếu permissions giữ quyền hiện hành.
-126 tests mới HTTP Flask + DB mocks, chạy cùng auth43/header3/workflow15
  đạt187; Node499/499. Diff check đạt. Không import main, không ghi DB y tế
  hoặc tệp upload thật. Log `/tmp/qlpk-account-regression.log`,
  `/tmp/qlpk-account-node.log`. Dependency warnings9 chưa xử lý.
- Strict auth vẫn2 cảnh báo public static JS/CSS stamping; không nới gate.
  Chưa browser/interactive QA với nhóm quyền thật; chưa chứng minh transaction
  trên PostgreSQL hay giải quyết race thu hồi quyền. Realtime/revoke,
  token/CSRF/rate limit, backend idempotency và nợ code còn tiếp tục;
  không tuyên bố hoàn tất5 nhóm vấn đề hoặc goal tổng thể.

### Lát 28 (27/09/2026) — phòng realtime và thông báo đúng người nhận

- Trace socket cho join tùy ý page/workflow/entity; notification có dữ
  liệu bệnh nhân còn phát workflow operations, admin tự join mọi role.
  Owner `realtime/access.py` map permission từ navigation hiện hành;
  test đối chiếu menu. Subscribe kiểm token/active/role/quyền DB, không
  nhận phòng tự đặt/user/role/entity, replace rooms và leave phòng cũ.
- Notification có recipient chỉ gửi user đó; role notification không
  truyền sang admin. Không recipient không phát (reminder email không
  phải thông báo inbox cho mọi người). Giữ envelope/event_id/payload cho
  đúng recipient, không sửa clinical payload hoặc làm mất trigger reload.
- Catalog user/assignment đổi thì disconnect sockets user trước broadcast;
  group sửa/xóa thì disconnect mọi socket local để làm mới quyền. Self
  password cũng disconnect. Client reconnect một lần khi server disconnect,
  đọc token hiện hành và resync sau ack; stop/logout không reconnect.
-44 Python mới dùng Socket.IO test transport thật trong Flask app độc lập,
  DB/auth giả;4 Node lifecycle mới. Tổng231 Python và503 Node đạt; Chrome
  headless isolated kiểm reconnect→subscribe→resync→stop đạt. Không import
  main, không ghi DB/tệp y tế hoặc restart server chung. Feedback/diff đạt.
  Log `/tmp/qlpk-realtime-regression.log`, `/tmp/qlpk-realtime-node.log`.
- Chưa pass visual/interactive QA trên workspace/tài khoản thật. Revoke
  local phù hợp deployment một worker hiện hành, chưa Redis multiworker.
  Chưa hết hạn socket đang idle, token cũ vẫn có thể reconnect sau đổi
  password (cần token revocation). Clinical/catalog broad rooms vẫn còn
  payload vượt patient scope; cần xử lý owner delivery, không chỉ room
  allowlist. Goal tổng thể active; các mục lưu dữ liệu/nợ code vẫn còn.

### Lát 29 (27/09/2026) — realtime delivery theo scope bệnh nhân

- Room allowlist không đủ: clinical payload full_name/extra/data đi tất cả
  người trong workflow. Thêm owner delivery.py: kiểm current appointment,
  examination→appointment, batch tất cả ca hoặc patient_access chung.
  Assignment deleted/thiếu/conflict không cấp payload; ca đổi bác sĩ không
  dùng doctor_id từ event để quyết quyền. Staff/admin/full-scope giữ policy
  hiện hành, không tự thay nghiệp vụ patient access.
- Socket fanout riêng theo sid, dedupe nhiều rooms; reauth/quyền DB mỗi
  event, cache decision chỉ trong event theo token. Invalid/expired/locked
  disconnect trước nhận data. Token chỉ RAM map sid, dọn khi disconnect.
  Thiếu quyền bệnh nhân chỉ action changed cho refresh API; không ID/name/
  diagnosis. Quyền hợp lệ giữ ID điều phối, data family_member_updated để
  bảo toàn replaceMember. Other catalog/inventory events bỏ extra nhạy cảm.
-30 test Python mới (realtime suite74), tổng261 Python +503 Node đạt.
  Test transport Socket.IO Flask thật, DB/auth giả: bác sĩ đúng/khác,
  TLG legacy, chuyển ca, batch mixed, deleted/missing/conflict, attachments
  qua inventory room, scope revoke không subscribe, duplicate tabs, DB
  exception không broadcast hoặc biến save đã commit thành lỗi. Logs:
  `/tmp/qlpk-delivery-regression.log`, `/tmp/qlpk-delivery-node.log`.
- Không đổi JS/UI, không ghi DB/tệp y tế, không restart server chung.
  Chưa browser/E2E DB thực; chưa pass visual/interactive QA tổng. Fanout
  local phù hợp một worker hiện hành, chưa hỗ trợ Redis multiworker; mỗi
  token/event có DB lookup cần load-test. Token cũ sau đổi password,
  HttpOnly/CSRF/rate limit, write idempotency/concurrency, complexity/lint
  và nghiệm thu các workflow vẫn chưa hoàn tất; goal giữ active.

### Lát 30 (28/09/2026) — token mất hiệu lực sau đổi/reset mật khẩu

- Root cause: JWT chỉ sub/exp, đổi hash không ảnh hưởng token; disconnect
  không ngăn reconnect token cũ. Thêm credential_version HMAC-SHA256 opaque
  theo secret/domain/user.id/username/hash, issuer yêu cầu user; HTTP và
  socket compare với DB. Không lộ hash/plain password trong claims. Token
  legacy thiếu binding fail closed, cần login lại khi deploy; không migration.
- Self password input kiểm kiểu; row lock trước verify, token mới tạo trước
  commit và trả sau commit. Admin reset hash tự vô hiệu token cũ. Header
  nhận token mới trước stop/start socket, không reload workspace; guard
  double-submit và token snapshot tránh response cũ tái đăng nhập sau logout/
  ghi đè account khác. Commit success mà mất replacement báo đăng nhập lại
  đúng sự thật; network/mất response không tự retry mutation.
-32 Python mới +6 Node mới. Tổng293 Python +509 Node đạt;9 warnings dependency.
  HTTP test có token thật ký/verify, đổi hash DB giả, request token cũ401;
  socket test transport thật kiểm connection đã mở và reconnect token cũ
  đều bị chặn, replacement nhận được. Chrome isolated dùng template modal/
  owner JS thật + response giả kiểm nhập/submit/token/socket/form reset đạt.
  Không ghi DB/tài khoản/tệp y tế, không deploy/restart. Logs
  `/tmp/qlpk-token-regression.log`, `/tmp/qlpk-token-node.log`.
- Chưa pass visual/interactive QA tổng workspace thật; chưa chứng minh
  SELECT FOR UPDATE concurrent DB thực. Token expiry config0 vẫn giữ,
  chưa per-session revoke/logout server, HttpOnly/CSRF/rate limit, idempotency/
  write concurrency và nợ code. Rollout bắt buộc backend/frontend cùng bản,
  người dùng login lại một lần; docs ops/contracts/smoke đã ghi. Goal active.

### Lát 31 (28/09/2026) — giới hạn thử đăng nhập

- Login trước đây không giới hạn và mở DB trước validate. Thêm decorator
  login_throttle reserve account/IP trước handler:10 account/60 IP/300s
  mặc định, cả attempts đúng/sai, body sai tính IP. Casefold/strip chỉ cho
  bucket, không đổi username auth; không oracle account tồn tại. Blocked
  trả429/Retry-After, không kéo dài TTL hoặc consume budget khác.
- Redis Lua atomic check+reserve, URL riêng ưu tiên rồi REALTIME_REDIS_URL;
  lỗi store503 fail-closed không fallback. Không URL dùng RAM lock/monotonic
  tối đa10000 keys, không evict counter sống. Keys HMAC không raw identity.
  Pydantic giới hạn config hợp lệ. UI429 hiện thời gian chờ có kiểm giá trị,
  giữ input/nút enabled; pending submit không gửi đôi. Không sửa layout.
-18 Python mới +10 Node mới; tổng311 Python +519 Node đạt,9 warnings cũ.
  Concurrent30 attempts chỉ3 reservation theo config test; TTL/reset,
  capacity, Redis contract/outage, header spoof, pre-DB denial kiểm đạt.
  Chrome trang login thật, request auth bị intercept429 (0 login thật):
  hiện42 giây, enabled, không overflow desktop1280/mobile390. Không ghi
  DB/tài khoản/password/counters thật; browser đóng. Logs
  `/tmp/qlpk-throttle-regression.log`, `/tmp/qlpk-throttle-node.log`.
- Chưa Redis Lua E2E thật (không redis-server/docker CLI), chưa proxy-chain/
  NAT load-test. Compose Redis allkeys-lru có eviction caveat; docs yêu cầu
  dedicated noeviction cho hardening, chưa thay hạ tầng. Memory reset khi
  restart, không multiworker. Account budget có temporary lockout tradeoff.
  Chưa hoàn tất secret defaults/expiry/HttpOnly/CSRF, per-session logout,
  save idempotency/concurrency, nợ code và full QA; goal active.

### Lát 32 (28/09/2026) — kiểm chứng throttle trên Redis thật

- Khép khoảng trống Lua chưa chạy thật: tải Redis7.4.6 từ download.redis.io,
  đối chiếu SHA256 với redis/redis-hashes, build riêng `/tmp/qlpk-redis-build.*`.
  Không install global, không Docker/Redis đang vận hành, không đổi env/DB.
- Thêm test_login_throttle_redis.py: chọn binary qua QLPK_TEST_REDIS_SERVER
  hoặc PATH, không có thì skip rõ; fixture tự spawn process với Unix socket
  riêng, TCP0, persistence off, noeviction; close clients, terminate/wait
  và kill fallback đúng PID trong finally, xóa thư mục fixture riêng.
-10 tests Redis thật đạt:50 requests đồng thời chỉ3 reservations,24 clients
  cùng budget, IP/account denial không consume bucket khác/không gia hạn,
  TTL thực hết hạn, counter thiếuTTL được sửa, HTTP429 trước DB, process
  stopped/counter corrupt503 không memory fallback, xác minh TCP0/no disk.
  Log `/tmp/qlpk-real-redis-qa.log`; hồi quy tổng ở
  `/tmp/qlpk-redis-regression.log`:321 Python đạt,9 warnings dependency cũ;
  pgrep sau test không còn Redis QA. Code runtime không đổi trong lát này.
- Giới hạn còn: proxy-chain/NAT và Redis production eviction/restart chưa
  nghiệm thu. Các mục secret/expiry/HttpOnly/CSRF/session logout, write
  idempotency/concurrency, nợ code và full workflow QA vẫn mở; goal active.

### Lát 33 (28/09/2026) — cấu hình production fail-closed

- Trace: main chỉ warning secret mặc định sau init_database; config có
  SMTP password gắn sẵn, token default0 không hết hạn. Thêm owner
  security_config.py, main gọi trước import DB/routes; production phải
  secret riêng>=32 bytes/HS256/expiry1–1440. Issuer/decoder kiểm cùng gate;
  production JWT bắt buộc exp integer, expires_delta cap configured limit.
- Default SECRET_KEY và SENDER_PASSWORD rỗng, expiry480; không in credential
  cũ khi patch. Không sửa .env, rotate credentials thực, DB hay deploy.
  Có script check_security_config.py read-only không import main, không in
  secret, readiness độc lập DEBUG. Cuối lượt script PASS và DEBUG=True;
  default expiry đã đổi0→480 trong source, không sửa env và không kết luận
  production đã deploy.
-28 tests mới config/issuer/decoder/startup AST; targeted121 Python đạt.
  Hồi quy349 Python đạt/log `/tmp/qlpk-production-regression.log`;519 Node
  đạt/log `/tmp/qlpk-production-node.log`,9 warnings dependency cũ.
  Guard startup xác minh thứ tự AST, không
  import main để tránh init DB. Không đổi UI nên không browser QA mới.
- SMTP credential từng ở source cần owner thu hồi/rotate ngoài provider
  nếu đã dùng; xóa default không vô hiệu credential hay xóa Git history.
  DEBUG exception vẫn có token0 nếu cấu hình vậy; không tính production pass.
  HttpOnly/CSRF/session logout, write idempotency/concurrency, nợ code và
  toàn bộ workflow QA vẫn chưa hoàn tất; goal active.

### Nghiệm thu tổng 4 scope (28/09/2026) — đã đóng phần code

- Calendar (lát64), phiên cookie (lát65), Doctor 11 mục (lát66) đã đóng code.
- Test: 909 Python/324 skip opt-in DB-Redis + 738 Node; Doctor/frontend
  contract, smoke, JS globals, feedback, diff đạt; pyflakes app+main 0; Alembic
  một head `20260928_calendar_transfer_jobs`.
- Chrome quét 32 trang ở chế độ cookie (session/API giả lập, chặn ghi): 0 lỗi JS,
  0 Authorization, mọi request có session header, 0 ghi. Script /tmp/qlpk-final-sweep.cjs.
- ESLint toàn dự án (221 file): 86 error (chủ yếu no-undef global chéo file như
  CustomModal/XLSX; gate theo trang báo 0 thiếu), 29 hàm ≥20, 25 file >600 dòng.
  Đây là số đo tham chiếu, không phải tiêu chí 4 scope.
- Việc owner phải làm khi triển khai (chưa làm vì ghi DB/.env/deploy):
  `alembic upgrade head`; chạy `scripts/process_calendar_transfers.py --run --watch`;
  đặt SESSION_REDIS_URL/REALTIME_REDIS_URL (check_security_config đang FAIL
  mục này); HTTPS; mọi người đăng nhập lại. Chưa pass visual/interactive QA với
  tài khoản và dữ liệu thật.

### Lát 65 (28/09/2026) — ĐÓNG scope phiên đăng nhập: cutover cookie HttpOnly

- Đo lại: 31 file JS còn đọc token/tự gắn Authorization (≈165 chỗ); partial
  chưa nạp browser-session. Đã gỡ toàn bộ khỏi 27 file trang/tiện ích; chỉ còn
  owner phiên (api-transport, browser-session, session-bootstrap, login,
  header, realtime, workspace, listener storage, version-check). Gate mới
  `tests/session_token_ownership.test.js` chặn tái phát.
- api-transport: tự gắn jQuery transport khi jQuery nạp sau (setter một lần),
  thêm hasSession/sessionRevision/userSnapshot/currentUser; trang không đọc
  qlpk_user/token trực tiếp (dashboard, tài liệu, thuốc, lịch hẹn). Sửa lỗi
  reference-review gửi `Bearer null` (đọc key `token`).
- Cutover: partial nạp browser-session + actions + session-bootstrap; mọi trang
  dùng cookie HttpOnly + CSRF, xóa token cũ trong storage. Trang cần đăng nhập
  bị anonymous/expired → /login (top window); login/verify/patient-survey khai
  báo public. Trạng thái `changed` (tab khác đổi phiên) giữ khóa tới reload.
- Calendar sync UI chia lô 50 lịch/yêu cầu (backend giới hạn 100 từ lát63).
- QA: 909 Python/324 skip opt-in DB-Redis + 738 Node; feedback/diff đạt; sửa
  test ALL_PERMISSIONS stale sau khi chuyển owner. Chrome 19 trang legacy: mọi
  request có xác thực qua transport, 0 lỗi JS, 0 ghi. Chrome E2E Flask auth
  thật + DB mock: token cũ bị xóa, chưa đăng nhập → /login, đăng nhập form →
  cookie HttpOnly, không token storage; 26 request 0 Authorization, đủ cookie/
  session-id, POST fetch/jQuery có CSRF; logout xóa cookie; trang public ở lại.
  Scripts /tmp/qlpk-session-owner-pages.cjs, /tmp/qlpk-cookie-cutover-browser.cjs.
- Rollout: mọi người đăng nhập lại một lần; cần HTTPS hoặc localhost (Web
  Locks, cookie Secure) và Redis dùng chung. Dev server 8000 đang phục vụ
  working tree nên cũng yêu cầu đăng nhập lại. Chưa pass visual/interactive QA
  với tài khoản/dữ liệu thật. Giới hạn đã biết, không mở thêm: iframe ẩn vẫn
  chạy JS nền tới khi reload; phím tắt cần reload khi đổi phiên.

### Lát 64 (28/09/2026) — ĐÓNG scope Calendar

- OAuth: init tạo state ngẫu nhiên + PKCE S256, lưu trong Flask session
  (HttpOnly, ký) cùng user/jti/token digest/generation, hạn600s. Callback pop
  state trước mọi xử lý (dùng một lần), từ chối thiếu/giả/khác trình duyệt/
  hết hạn; kiểm user active + đúng phiên login còn hiệu lực trước và sau đổi
  code. Không phản chiếu error/exception vào URL, chỉ mã lỗi cố định.
- DB local (đọc-only): alembic_version=20260920_stock_balance_snapshot nhưng
  bảng transfer_jobs ĐÃ CÓ (DEBUG create_all), đúng schema,0 dòng. Migration
  sửa để adopt bảng đúng schema, từ chối bảng lệch; tránh lỗi "already exists".
- Transfer sau commit gọi drain ngay cho job vừa tạo (thread nền, lỗi không
  ảnh hưởng response); worker CLI vẫn là owner retry. Không cần chạy worker để
  đồng bộ lần đầu khi Google sẵn sàng.
- QA:189 Python/1 skip Redis binary +733 Node, feedback/diff đạt. Logs
  /tmp/qlpk-calendar-close-{python,node}.log. OAuth dùng thư viện thật kiểm
  state/code_challenge S256/code_verifier gửi đi (chặn trước network).
- Giới hạn đã biết, KHÔNG mở thêm: writer thủ công chưa gộp outbox; chưa kết
  nối tài khoản Google thật; chưa pass visual/interactive QA thật. Việc cần
  owner làm khi deploy: `alembic upgrade head` (chỉ ghi version, bảng/index đã
  có ở DB local) và chạy worker `scripts/process_calendar_transfers.py --run --watch`.

### Lát 63 (28/09/2026) — Calendar API quyền/batch/date và row locks

- Evidence: dashboard routes chỉ require_auth, lấy toàn bộ appointments/
  connections; sync cancelled vẫn create; delete-all thiếu dates quét toàn bộ.
  Thêm owner calendar_access.py và nối sync-status/verify/sync/delete-all/
  validate-connections. Actor reload DB active/role, User SHARE lock; input
  batch1..100 positive int32/dedup/sort và bounded ISO date range<=366 ngày.
- Read scope giữ clinical contract; writes chỉ admin/staff hoặc current
  doctor_id, không view-all/historicalpsych. Full batch validate trước Google;
  ordered appointments SHARE/UPDATE+reload. Cancelled409, forbidden403,
  missing/deleted404, malformed400. Clinical sync chỉ own Google; staff
  broadcast giữ nguyên. Delete-all bắt buộc dates, clinical chỉ own events
  trên current-owned appointments; connection validation chỉ own connection.
-30 tests mới; targeted155 Python +733 Node đạt,55 warnings legacy/dependency.
  Logs /tmp/qlpk-calendar-access-regression.log và /tmp/qlpk-calendar-access-node.log.
  Flask decorated HTTP401/400/403/200; mixed batch no provider calls; spoof
  role, view-all read-not-write, historicpsych, cancelled, oversized/malformed,
  own-vs-staff/calendar delete data scope. Four real PG Lock observations:
  reassignment, cancellation, actor disable và bulk-delete đợi transfer commit.
- Không schema/env/DB thật/restart/deploy. Chưa pass visual/interactive QA
  thật; UI bulk>100/error/partial messages cần theo contract mới. Chưa full
  writer outbox, OAuth callback/state/account identity, deadlines, rollout.
  Goal toàn5 nhóm vẫn mở, không gộp thành chỉCalendar/auth.

### Lát 62 (28/09/2026) — legacy Calendar không mất mapping vì lỗi mạng

- Rà toàn callers verify/update/delete: manual sync verify False đã xóa link
  rồi create, duplicate chỉ xóa DB gây orphan Google; update/cancel helper
  xóa link bất kể provider; delete-all thiếu token hoặc exception text chứa404
  cũng coi success. Đây là evidence mới ngoài transfer outbox.
- Thêm verify strict opt-in raise unknown; manual sync không xóa/tạo vì
  lỗi xác minh. Duplicate cùng eventID chỉ dedup DB, khác ID delete Google
  phải thành công. Helper update dùng confirmed-missing và chỉ bỏ mapping
  khi replacement create thành công; cancel delete=True mới xóa link.
- Delete-all giữ disconnected mapping, typed HttpError404/410 mới success;
  rate limit429/403 rateLimitExceeded retry tối đa3, lỗi khác không retry mù.
  Không đổi schema/response shape; failed_count/deleted_count phản ánh thật.
-25 tests mới, targeted125 Python +733 Node đạt,55 dependency/legacy warnings.
  Logs /tmp/qlpk-calendar-mapping-regression.log và /tmp/qlpk-calendar-mapping-node.log.
  Flask route trực tiếp + real isolated PG + provider mock kiểm mapping sau
  commit, duplicate same/different ID, missing/create fail, unknown owner,
  disconnected, fake404 text, HTTP404/410/503 và quota retry. Feedback/diff đạt.
- Chưa consolidated writer/outbox chung, chưa manual-create durable ID,
  chưa audit quyền/batch scope Calendar API, cancelled manual sync vẫn cần
  gate; kết nối lại Google account/monitoring và real UI/provider QA còn mở.
  Không DB thật/env/restart/deploy; chưa pass visual/interactive QA thật.
  Goal toàn5 nhóm tiếp tục, không coi green tests hẹp là completion tổng.

### Lát 61 (28/09/2026) — phục hồi Calendar mapping/tombstone khi thử lại

- Lượt60 có tiến bộ source/tests, nhưng audit tiếp phát hiện update False
  gộp missing với network: Google delete xong rồi DB rollback, chuyển về
  owner cũ thì mapping mất ở Google cứ pending mãi. Test mới dùng remote
  event set có trạng thái qua nhiều transactions, không chỉ assert call count.
- update_event opt-in report_missing None cho GET404/410/cancelled, False
  cho failure; callers mặc định giữ bool. Worker chỉ xóa confirmed-missing
  mapping; có target còn sống thì không tạo thêm. Upsert409+GET410/cancelled
  raise CalendarEventRetired; worker lưu replacement ID sau rollback savepoint
  và trước lần gọi kế tiếp. Timeout/403/503 hoặc409→404 không đổi ID.
-18 tests thêm (Calendar tổng36); targeted100 Python +733 Node đạt,55 warnings
  dependency/legacy. Logs /tmp/qlpk-calendar-recovery-regression.log và
  /tmp/qlpk-calendar-recovery-node.log. Có real isolated PG tests cho return
  owner sau remote-delete/DB-rollback, stale/live duplicate mappings, durable
  ID rotation và commit failure không dùng ID chưa lưu. Provider tests phân
  biệt404/410/cancelled với403/429/503/timeout; feedback/diff gate đạt.
- Không schema mới, không DB thật/env/restart/deploy; migration/consumer lát60
  vẫn chưa rollout. Provider mocked, chưa pass visual/interactive QA thật.
  Còn manual-sync/cancel/update/re-examination writer consolidation, reconnect
  account và completed-job reconcile/monitoring; goal toàn5 nhóm vẫn active.

### Lát 60 (28/09/2026) — durable Calendar transfer jobs, chưa rollout

- Đã xác minh lỗi: transfer gọi Google trước clinical commit; helper xóa
  mapping dù provider trảFalse, lấy first event nên có thể nhầm lịch staff.
  Không có outbox/consumer sẵn trong snapshot. Thay helper bằng enqueue cùng
  transaction, bao phủ doctor_id đổi sang cả bác sĩ và tâm lý gia.
- Model GoogleCalendarTransferJob + migration20260928_calendar_transfer_jobs;
  worker calendar_transfer.py khóa appointment→job, đọc current owner/status,
  stale job chỉ cleanup, giữ staff mapping, NULL owner giữ pending. Backoff
  persisted30s..3600s; lỗi không mất dấu retry. Provider insert409 chỉ patch
  khi private marker đúng, deterministic ID giữ qua mất response/DB commit.
- Consumer scripts/process_calendar_transfers.py đòi --run, --watch poll30s;
  không tự chạy request thread, không import main. Chưa migration/worker trên
  DB vận hành, không env/restart/deploy. Rollout prerequisite ghi ops doc.
-18 tests mới;82 Python +733 Node đạt,55 warnings dependency/legacy cũ. Logs
  /tmp/qlpk-calendar-transfer-regression.log và /tmp/qlpk-calendar-transfer-node.log.
  Real isolated PostgreSQL kiểm commit failure, invisible uncommitted job,
  delete failure/missing connection/backoff/unknown owner, out-of-order,
  cancelled/no prior mapping. Hai concurrency tests quan sát actual Lock,
  không chỉ sleep. Migration upgrade/downgrade trong fixture; Alembic unique
  head20260928_calendar_transfer_jobs. Feedback gate đạt; QA PG đã dừng.
- Chưa hoàn tất nhómCalendar: manual sync/cancel/update/re-examination writers
  vẫn legacy, không lock/outbox chung; reconnect account, manually removed
  events và monitoring/retention còn mở. Provider mocked, chưa pass
  visual/interactive QA clinical thật. Mục tiêu5 nhóm sức khỏe vẫn active;
  không thu hẹp thành auth hoặc coi lát60 là hoàn thành toàn dự án.

### Lát 59 (28/09/2026) — quyền backend và atomic validation chuyển khám

- transfer_service kiểm payload/ID/role, target active đúng role và actor DB
  hiện hành. User share-lock theo ID; chỉ admin/staff hoặc current doctor_id
  được chuyển. View-all và psychologist_id lịch sử không bypass write scope.
- Lock toàn batch appointments rồi active examinations theo ID; validate
  exists/not-deleted/CONFIRMED/đúng1 active exam/trạng thái trước mọi mutation.
  Thiếu một lượt hoặc ngoài quyền từ chối cả batch;400/403/404/409 rollback.
  JSON malformed400; no-op0 không emit/notify. Mapping/queue/no-op giữ nguyên.
- Isolated PostgreSQL tests chứng minh actor/target, malformed, mixed-batch,
  lifecycle/duplicate exam, role mapping, no-op, route HTTP và rollback khi
  lỗi giữa batch; observed pg_stat_activity lock wait cho2 chuyển cùng ca,
  target disable và exam sang PAID. Fixture DB riêng /tmp, không DATABASE_URL
  vận hành. Test queue legacy dùng QA actor tồn tại thay ID giả-1; không chạy
  bộ opt-in trên DB thật. Node toàn733 đạt; evidence /tmp/qlpk-transfer-access-*.
-64 Python transfer/access/workflow/globals đạt (55 warnings dependency cũ),
  trong đó27 transfer tests mới; feedback contract/diff-check đạt. PostgreSQL
  isolated processes đã stop trong fixture finally. Không browser QA mới vì
  thay backend, HTTP QA qua Flask với auth decorator và DB cô lập.
- Không UI changes mới hoặc browser clinical QA; chưa pass visual/interactive
  QA thật. Calendar sync helper vẫn external trước commit, DB atomic không
  chứng minh external atomicity/idempotency. Cross-workflow lock order chưa
  audit hết. Full auth cutover/clinical invalidation/production/code debt và
  toàn dự án vẫn chưa hoàn tất; không .env/restart/deploy/schema.

### Lát 58 (28/09/2026) — shared chuyển khám gắn phiên lúc mở

- TransferModal explicit installJQuery, bỏ3 Bearer headers. Gate capture cookie
  revision/legacy credential lúc open; check patient/phiên trước load/POST và
  sau response, không callback/toast/clear ca mới. Giữ save-before-transfer,
  duplicate/close guard. Response success/count phải xác nhận đủ batch; partial/
  no-op cảnh báo kiểm tra, không báo chuyển đủ hoặc tự replay.
-733 Node đạt (mở rộng doctor_transfer assertions cho stale patient/session,
  cookie/anonymous và incomplete response). Logs /tmp/qlpk-transfer-session-*
  và browser harness /tmp/qlpk-transfer-session-browser.cjs. Không DB thật/env/
  restart/deploy, không đổi CSS/template/API/backend.
-17 Python workflow/globals, feedback contract và diff-check đạt. Chrome modal/
  template/jQuery/Bootstrap thật + cookie/DB mock: recipients, POST exact payload
  CSRF/no Bearer, confirmed callback; invalidation giữa POST không callback/toast
  cũ, không gửi lại. Browser/server đã đóng. Fixtures không thay clinical QA.
- Phát hiện backend cần tiếp tục: transfer_service.py có row lock appointment
  nhưng chưa kiểm quyền actor/target trong service; route chỉ require_auth;
  loop skip missing/no-op, examination chưa lock rõ. Cần isolated tests quyền,
  target role/activity, all-or-nothing batch và concurrency trước sửa contract.
- Full cookie cutover/mounted invalidation/drafts, production, permissions và
  nợ code toàn dự án còn mở. Chưa pass visual/interactive QA clinical thật.

### Lát 57 (28/09/2026) — danh mục Lễ tân và autocomplete an toàn

- Catalog loaders dùng canonical fetch, bỏ token/Bearer gate và jQuery ajax.
  Timeout10s/latest-load-wins theo document/kind; array validation, lỗi false+
  toast không retry vô hạn. Doctor option.textContent chống HTML injection,
  refresh giữ ID còn hợp lệ. Wrapper page trả Promise cho callers/test.
- Service autocomplete chỉ1 bộ namespaced listeners, tải lại clear dropdown;
  tên/giá qua text nodes, typing clear hidden ID, focus chỉ lọc giữ ID. Không
  đổi endpoint/body/DB hoặc layout. Cookie templates chưa được bật.
-733 Node đạt (15 ca mới),17 Python workflow/globals đạt. Evidence logs
  /tmp/qlpk-receptionist-catalog-{node,python,browser}.log; browser harness
  cùng prefix .cjs. Không .env/DB thật/restart/deploy.
- Chrome cookie thật/source/DOM+API fixture: load bác sĩ/dịch vụ không Bearer,
  tên có markup không tạo element; doctor refresh giữ selection; service
  refresh chỉ1 handler, focus giữ ID/typing clear, chuột+keyboard chọn, empty
  state đúng. Browser/server đã đóng; feedback/diff-check đạt.
- Mounted page invalidation/cache, full cookie cutover, production gates,
  quyền/concurrency và nợ code toàn dự án còn mở. Chưa pass visual/interactive
  QA clinical thật/dense/sparse; không thu hẹp hoặc đánh dấu goal hoàn tất.

### Lát 56 (28/09/2026) — tệp/người thân/modal dùng transport chung

- Bỏ Bearer riêng ở relative-table, modal relatives data, receptionist và
  clinical upload/preview/download. Retire modal token/header exports và UI
  re-exports. Modal patient load session errors không fallback patient; upload
  JSON đổi phiên không bị nuốt thành success. API/schema không đổi.
- Document list truyền context guard lúc click qua receptionist/doctor/clinical
  adapters tới preview/download; check trước/sau headers/Blob và giữ guard qua
  doc/422 fallback. Late result không mở file/download/toast ca cũ.
-718 Node đạt (8 ca mới);17 Python workflow/globals đạt; feedback contract và
  diff-check đạt. Logs /tmp/qlpk-patient-transport-{node,python,browser}.log;
  browser script cùng prefix .cjs. Không DB thật/.env/restart/deploy.
- Chrome actual source/cookie thật: relative rows, modal relatives read,
  2 multipart uploads CSRF/no Bearer, click file rendered→patient switch chặn
  delayed Blob. API/DB fixtures, không thay clinical visual acceptance;
  browser/server QA đã đóng.
- Cookie full cutover, mounted page invalidation/drafts, production gates,
  permission/concurrency và code health toàn dự án vẫn mở; chưa hoàn tất goal.
  Chưa pass visual/interactive QA clinical thật/dense/sparse.

### Lát 55 (28/09/2026) — tiền sử và kế hoạch an toàn dùng transport chung

- Bỏ Bearer gate khiến cookie không tải ICD exact/gợi ý; context kiểm apiCall
  thay getAuthHeader, JSON headers chỉ Content-Type. Allergy/read/create và
  safety-plan family/file/upload/clear giữ endpoint/body; không auth riêng.
  Session errors ICD/family propagate thay empty-success. File kiểm lại
  patient/context sau Blob; upload return/error/finally không chạm input ca mới.
-710 Node đạt (8 ca mới cả legacy/cookie). Gate globals bắt import allergy
  còn gọi tên helper cũ trong lúc đổi; đã sửa đủ2 call sites và thêm coverage
  allergen read/create. Chrome ES module thật+cookie/DB mock: ICD exact, gợi ý
  render, supporter select, upload multipart/CSRF, stale patient Blob blocked.
  Logs /tmp/qlpk-history-session-{node,python,browser}.log; browser script cùng
  prefix .cjs. Không .env/DB thật/restart/deploy, không CSS/layout.
-17 Python workflow/globals đạt sau sửa import; feedback contract/diff-check
  đạt. Browser/server QA đã đóng. Không còn private Authorization/token gate
  trong4 owners history context/core/suggestions/safety-plan vừa chạm.
- Chưa pass visual/interactive QA clinical thật/dense/sparse; component/API
  browser fixture không thay nghiệm thu workflow. Cache/invalidation mounted
  clinical UI, auth callers còn lại/full cutover, production gates, quyền/
  concurrency và code health toàn dự án vẫn mở; goal chưa hoàn tất.

### Lát 54 (28/09/2026) — đồng bộ gate khởi tạo ba trang lâm sàng

- api-transport là owner ensureSession async + parser legacy raw/Bearer/JSON/
  aliases; cookie header helper trả null. Bỏ parser/Bearer riêng ở clinical,
  receptionist, doctor page runtimes; await tại Doctor startup/queue, Lễ tân
  startup và TLG shared bootstrap.401/expired redirect,503/changed dừng và báo
  reload, không dùng token storage để vượt cookie gate. Không đổi API/DB/UI layout.
- Header logout dùng canonical credential và dọn session aliases sau server
  confirmation/nháp; login success cũng dọn aliases. Test session-only revoke,
  failed logout giữ credential, stale logout không xóa credential mới.
-702 Node tests đạt;17 ca mới + cập nhật bootstrap order async. Chrome cookie
  thật/DB mock: bootstrap chậm cả3 runtime, POST CSRF/no Bearer, same-origin
  iframe bootstrap, changed/503 fail closed. Logs /tmp/qlpk-clinical-session-*
  và browser harness /tmp/qlpk-clinical-session-browser.cjs.
-62 Python session/workflow/globals/static tests đạt (9 warnings dependency);
  feedback contract và diff-check đạt. Chrome header regression xác nhận login/
  password/realtime/logout cookie và IndexedDB chỉ xóa nháp user đã logout.
  Browser/server QA đã đóng; không DB thật/.env/restart/deploy.
- Chưa pass visual/interactive QA clinical thật/sparse/dense; chưa chứng minh
  mounted forms clear/cancel khi invalidation. Templates vẫn chưa bind cookie,
  callers/iframe background/drafts và full cutover còn mở. Production gates,
  permissions/concurrency, nợ code và full project QA vẫn thuộc goal chưa xong.

### Lát 53 (28/09/2026) — phím tắt theo phiên hiện tại

- Bỏ shortcut token parser/Bearer riêng, giữ JSON apiCall qua transport chung.
  Cookie user/admin từ authenticated RAM, không stale admin localStorage.
  Refresh cache có sequence+identity guard, keyboard kiểm current revision.
  Logout/invalidation/storage credential events clear cache/rows; settings
  mount gắn revision, form inert và báo reload khi đổi; submit/delete/load
  kiểm trước/sau async để không dùng quyền/row của phiên cũ.
-685 Node +17 Python workflow/globals đạt;4 tests shortcut mới. Chrome thật
  source/form/CSS với synthetic session/API: stale admin→mine-only, Ctrl+K,
  POST CSRF save, invalidation clear/inert và programmatic submit/key không
  tạo side effect. Logs /tmp/qlpk-shortcut-session-{node,python,browser}.log.
  QA processes đóng; không DB/.env/restart/deploy, không thay CSS/layout.
- Chưa pass visual/interactive QA clinical/dense/admin controls thật. Cookie
  rotation cùng user cũng yêu cầu reload settings (fail closed), legacy identity
  vẫn storage tới full cutover. Page guards/iframe/callers còn lại và production/
  permission/concurrency/code debt vẫn mở; goal toàn dự án chưa hoàn tất.

### Lát 52 (28/09/2026) — gõ tắt/management/PDF chung transport

- Bỏ token riêng ở3 owners text-expansion, management và PDF preview.
  Management explicit installJQuery vì template không có utils; export GET
  qua guarded fetch/Blob download, không URL navigation thiếu auth.
- Runtime gõ tắt scope IIFE tránh management cùng tên loadTextExpansions
  ghi đè refresh. Load revision chặn response cũ; cookie revision/cache guard,
  logout/credential storage events clear. Chốt isLoaded không tăng revision
  khi đang load (browser polling đã phát hiện và regression bổ sung).
-681 Node +33 Python workflow/globals/PDF đạt, diff check đạt. Chrome real
  cookie/source với API fixtures: table rows, refresh, Tab expansion, Excel
  download và PDF POST CSRF/Blob, invalidation clear đạt. Fixture pagination
  ban đầu thiếu include đã sửa QA harness; không nới production contract.
  Logs /tmp/qlpk-shared-utilities-{node,python,browser}.log. QA processes đóng.
- Không đổi layout/schema/.env/restart/deploy/clinical DB. PDF viewer stub
  không chứng minh clinical print; chưa pass visual/interactive QA thật/dense.
  Cache same-tab legacy rotation còn giới hạn; cookie callers/guards/iframe
  cutover, nợ code/permission/concurrency/production vẫn thuộc goal active.

### Lát 51 (28/09/2026) — shared catalog loaders bỏ token riêng

-5 loaders base autocomplete/occupation/province/ward/ICD dùng canonical
  fetch, bỏ Authorization/storage token. ICD bỏ getAuthHeader/missing-token
  gate; session errors propagate. Read URLs/pagination/IDs/mapping, write
  JSON{name}/Content-Type giữ; không đổi patient data hoặc layout/component.
-676 Node +23 Python workflow/globals/ICD đạt,8 dependency warnings.4 tests
  mới kiểm7 calls ở cả legacy/cookie, POST CSRF, no auth callback, stale error.
  Chrome cookie thật/components thật+API fixtures: tải/chọn nghề/tỉnh/xã,
  POST nghề nghiệp và ICD read đạt; không Bearer, không ghi medical DB.
  Logs /tmp/qlpk-catalog-{node,python,browser}.log; QA processes đóng.
- Chưa pass visual/interactive QA clinical/dense data. Caller options
  getAuthHeader còn cần dọn ở adapters cũ, loader không gọi nữa. Các module
  khác/page guards/iframe và coordinated cookie cutover chưa hoàn tất;
  không bật templates cookie, không .env/restart/deploy. Goal tổng thể active.

### Lát 50 (28/09/2026) — form login nối shared cookie actions

- Login form cookie dùng actions.login, không AJAX auth song song; revision
  guard trước redirect/dọn legacy identity. User/permissions RAM quyết landing,
  không /check/me lần hai/token storage; error không fallback Bearer. Legacy
  đang sống giữ tới coordinated cutover. Renderer error chung, Retry-After
  safe1..3600 đi từ shared action tới UI; duplicate submit vẫn bị chặn.
-672 Node +56 Python auth/workflow/globals đạt,9 dependency warnings; diff
  check đạt.10 tests mới cookie login/throttle. Chrome source/form thật với
  Flask cookie/account mocked:429 retry delay→success redirect, HttpOnly,
  no Bearer/token storage/check-me, /auth/session200. Logs /tmp/qlpk-cookie-login-
  {node,python,browser}.log. Screenshot /tmp/qlpk-cookie-login-error.png đã xem;
  desktop error layout không overflow, không đổi CSS. QA server/browser đóng.
- Screenshot fixture không nạp icon stylesheet nên không xác nhận icon;
  không thay đổi icon/layout trong lát này. Chưa pass visual/interactive QA
  clinical E2E. Chưa bật cookie runtime partial: cần migrate remaining callers,
  page guards/iframe trước; không shim token, không DB/.env/restart/deploy.

### Lát 49 (28/09/2026) — workspace quyền/identity theo cookie owner

- Cookie shell đọc user/permissions từ authenticated RAM owner, không stale
  admin storage. openTab/openHref kiểm configured route permissions (đóng
  bypass fallback item). Async open/activate/close guard revision/legacy
  identity sau leave prompt, không ghi tab state dưới account mới.
- Init subscribe/bootstrap owner; terminal invalidation/account change khóa
  host hidden+inert và báo reload. Same-user rotation giữ active pane. Không
  đổi CSS/layout: frame host flex min-height0, pane absolute active display,
  native scroll/iframe100% giữ nguyên; chỉ khóa container owner, không patch child.
- Chrome source/CSS thật fixture shell: allowed iframe, deny admin storage,
  rotation, changed/account switch locking đạt. Existing real cookie/header/
  logout/IndexedDB fixture regression đạt. Logs /tmp/qlpk-workspace-session-
  {node,python,browser}.log và /tmp/qlpk-workspace-cookie-browser.log.
-662 Node tests +17 Python workflow/global checks đạt;4 workspace unit cases
  mới. Static smoke gồm syntax/frontend/global contracts đạt, diff check đạt.
- Chưa pass visual/interactive QA clinical/dense state; hidden/inert không
  dừng background iframe JS. Không bật cookie live templates trước coordinated
  iframe/page-guard/login/caller cutover. Không DB/.env/restart/deploy.

### Lát 48 (28/09/2026) — chặn response stream sau đổi phiên

- Shared API transport guard response.body ở native ReadableStream pull,
  kiểm trước/sau read; reader/BYOB/tee/iterator/pipeThrough giữ chốt. HWM0
  không wrapper prefetch; cancel xuống source, không buffer toàn file.
- Chrome phát hiện proxy stream bị new Response nhận sai dạng body, dù Node
  tests đạt. Đã chuyển sang native stream, overrides method trên instance;
  Chrome14 HTTP delayed-stream cases đạt (legacy/cookie x7 consumers), no
  pageerror/late payload. Chrome có thể chuyển source error thành TypeError
  khi .text() của new Response(body); đây là failure, không payload success.
-658 Node tests +17 Python workflow/global tests đạt; JS syntax/static/frontend
  contracts chạy qua smoke đạt, git diff --check đạt. Tests stream21 ca gồm
  EOF BYOB/cancel và normal consumption. Regression logs
  /tmp/qlpk-stream-{node,python,browser}.log. Không clinical
  data/.env/server restart/deploy; QA server random loopback và browser đóng.
  Chưa pass visual/interactive QA clinical; cookie cutover, đa tab nháp,
  quyền/concurrency, nợ code và production configuration vẫn còn trong goal.
- Không coi bytes đã giao trước đổi phiên là có thể thu hồi; pending network
  read chưa abort chủ động khi không có chunk tiếp theo. Không đổi API payload.

### Lát 47 (28/09/2026) — cookie logout và nháp đúng người dùng

- Bỏ cookie logout placeholder; actions.logout callback chạy dưới shared
  mutation Web Lock tới cleanup xong. Header gửi confirmation.userId cho
  main document/iframe, chờ mọi cleanup; false/rejection không redirect.
  Cleanup retry dưới lock không revoke lần hai; anonymous revision guard
  không cho cleanup cũ clear storage/redirect sau account switch.
- Doctor cookie identity chỉ từ owner RAM, không storage/context user cũ.
  Cleanup hủy context/timer, chờ pending writes đúng user rồi xóa records;
  không xóa user khác. Write hoàn tất sau đổi revision/identity (kể cả cùng
  user đăng nhập lại) bị loại và xóa có điều kiện captureId.
-637 Node +62 Python auth/workflow/static/cache đạt;9 dependency warnings.
  Hai workflow contracts ban đầu fail vì đổi removeItem sang loop; giữ xóa
  workspace keys tường minh, không nới validator. Targeted37 tests đạt.
  Chrome header/template/cookie/IndexedDB thật với mock account/DB/shell:
  password rotate/realtime, logout xóa nháp user7/giữ user8, redirect login,
  session401; không JWT storage/Bearer/pageerror. Processes đóng. Logs
  /tmp/qlpk-cookie-logout-{node,python,browser}.log; git diff --check đạt.
- Chưa chứng minh cleanup toàn cục với tab treo/invalidation trễ; pendingWrites
  chỉ trong runtime hiện tại, không hàng đợi đa tab. Không bật cookie live
  templates: login/guards/callers/iframe coordinated cutover còn mở. Không
  DB thật/.env/restart/deploy. Chưa pass visual/interactive QA clinical thật,
  không coi fixture shell là nghiệm thu. Goal toàn bộ vẫn active.

### Lát 46 (28/09/2026) — header reads/password qua phiên chung

- API transport expose session getter không tự bind; header cookie mode đọc
  identity RAM, không restore/persist qlpk_user/permissions. Profile/search/
  notifications bỏ Bearer riêng, qua transport; unknown/loading cho bootstrap,
  changed/unavailable/expired không fallback storage. Search/notifications
  không nuốt JSON/stale error thành empty success.
- Password form cookie dùng locked actions, không store JWT/restart socket cũ;
  header init bind realtime vào cùng owner để rotation tự thay socket. Legacy
  password/logout vẫn giữ hoạt động trong templates hiện tại chưa cutover.
- Cookie logout UI tạm fail closed với thông báo rõ, không clear nháp/local
  session mà chưa revoke cookie. Đây là việc CHƯA HOÀN TẤT, không release trạng
  thái này: next nối logout actions confirmation + draft cleanup đúng user
  (Doctor draft hiện lấy qlpk_user storage), sau đó mới bật cookie templates.
-628 Node +62 Python auth/workflow/static/cache đạt,9 dependency warnings;
  syntax/feedback/diff đạt. Chrome header source/template thật + cookie/backend
  DB mocked: tên tài khoản, search, notification empty, form đổi mật khẩu→
  rotation/realtime reconnect đạt; no Bearer/JWT/user storage/pageerror. Ảnh
  /tmp/qlpk-header-cookie-password.png đã xem; script QA thêm đủ token CSS/icon
  sau phát hiện fixture thiếu CSS gây transparent modal. QA processes đóng.
  Logs /tmp/qlpk-header-session-{node,python}.log và header-cookie-browser.log.
- Chưa pass visual/interactive QA clinical workspace thật/dense notifications;
  UI layout không đổi. Nút password header vẫn màu nâu có sẵn, cần về action
  token trong health scope sau; không tuyên bố visual QA hệ thống đạt. Không
  DB thật/.env/restart/deploy. Login/guards/callers/iframe/draft cutover còn mở.

### Lát 45 (28/09/2026) — nối cookie owner vào API transport

- useCookieSession tạo đúng một owner/actions bằng native fetch đã capture
  trước wrapper; không recursion hoặc Bearer cũ lọt bootstrap/login. Bind
  không tự gửi network, không token shim/storage migration. Cookie request
  đi owner.request cho cả fetch+jQuery, session ID+CSRF/no-store/same-origin.
- Guard response/body/clone theo revision owner thay storage token; anonymous/
  changed/expired không fallback Bearer. Direct login/logout/password mutate
  qua wrapper reject action_required; dùng locked actions. Static GET/HEAD
  không bootstrap session; external vẫn native không thêm credentials. Đây
  chưa phải policy block tuyệt đối direct native fetch/custom transport.
-621 Node+62 Python auth/workflow/static/cache đạt,9 warnings dependency;
  syntax/feedback/diff đạt. Chrome2 tab real cookie+CSRF/Flask DB mocked:
  fetch profile, jQuery global:false write, multipart, blob download, password
  rotation invalidate tab khác/chặn stale write, logout propagation đạt;
  không JWT storage/Authorization. Legacy real jQuery regression cũng đạt.
  Logs /tmp/qlpk-cookie-api-transport-{browser,python}.log,
  /tmp/qlpk-cookie-transport-node.log; QA processes đã đóng.
- Chưa gọi useCookieSession từ templates/login: coordinated cookie cutover
  còn login/header/page guards/callers/iframe/drafts. Không bật nửa chừng hoặc
  coi integration fixture là production. Không DB thật/.env/restart/deploy.
  Raw stream guard/clinical real data/CSP/idempotency/concurrency/code health
  vẫn mở; chưa pass visual/interactive QA workflow thật.

### Lát 44 (28/09/2026) — jQuery đi chung fetch transport

- Thay ajaxSend chỉ thêm token bằng jQuery ajaxTransport cùng origin, gọi
  fetch owner hiện hữu. Global:false vẫn auth+stale guard; chặn response cũ
  trước complete/converter/success. HTTP status/headers giữ để jQuery tự
  convert JSON và chạy error/complete/statusCode; không retry401.
- AbortController nối jqXHR.abort/timeout, bỏ late completion sau cancel;
  giữ method/body/form serialization/FormData, X-Requested-With, explicit
  headers, blob/arraybuffer/json/text xhr responseType và mimeType. External
  hoặc script/JSONP không dùng custom transport/không auto-auth. Không tìm
  caller async:false/custom xhr trong source; sync request fail closed rõ
  session.sync_unsupported, không lặng lẽ chuyển async.
-612 Node+23 Python workflow/static/cache gates đạt, syntax/feedback/diff đạt.
  Chrome jQuery thật: stale/global:false, invalid JSON parsererror, timeout,
  abort, blob download, multipart upload,2 origins/no leak/no replay đạt.
  Chrome4 templates/fixture API:9 GET auth+3 downloads,0 pageerror. QA đóng.
  Logs /tmp/qlpk-jquery-transport-{node,python,browser}.log và
  /tmp/qlpk-jquery-catalog-browser.log. Không DB thật/.env/restart/deploy.
- Vẫn Bearer/localStorage, cookie cutover chưa hoàn tất; next: nối session
  owner vào canonical transport và coordinated login/header/guards/callers.
  Raw readable stream và clinical UI clear/draft lifecycle chưa nghiệm thu.
  Chưa pass visual/interactive QA dữ liệu thật; không dùng fixture thay thế.

### Lát 43 (28/09/2026) — gom transport đang dùng thật, giảm caller token

- Tách wrapper khỏi utils sang shared/api-transport.js, nạp sớm qua partial
  chung của31 template. utils chỉ installJQuery idempotent; duplicate script
  không double-wrap. Không startup request/auto-login/retry401, giữ same-origin
  guard, Request/options/body/explicit headers, dọn plaintext login keys.
- Document/hoạt chất/dị nguyên/tương tác thuốc bỏ header/token riêng, dùng
  owner transport thật; document cũ chụp token lúc load nay lấy lúc gửi. JSON/
  blob/text/arrayBuffer/formData/bytes/clone qua Proxy giữ Response branding,
  chặn phản hồi đến muộn sau đổi token. External fetch không bọc/gắn credentials.
-604 Node +23 Python static/workflow/cache gates đạt; syntax/feedback/diff đạt.
  Chrome2 origins xác nhận6 requests/no leak external/no replay/body giữ.
  Chrome4 template thật, API fixture:9 GET có auth,3 file tải được,0 page errors;
  ảnh /tmp/qlpk-catalog-transport-*.png. QA server/browser đóng. Logs:
  /tmp/qlpk-canonical-transport-{node,python,browser}.log và
  /tmp/qlpk-catalog-transport-browser.log. Không DB thật/.env/restart/deploy.
- Chưa pass visual/interactive QA dữ liệu thật: browser fixture không nghiệm thu
  clinical/dense states. Transport vẫn Bearer/localStorage tới coordinated
  cookie cutover; chưa nối session owner vào fetch/jQuery/init/login/header/
  drafts/iframes. jQuery late response và raw readable stream chưa được guard
  như fetch body methods; không tuyên bố hết stale response toàn ứng dụng.

### Lát 42 (28/09/2026) — scope quản lý lượt khám và thống kê

- Rà cutover xác nhận250 token/header matches trong frontend; không bật login
  cookie nửa chừng. Phát hiện management query không dùng actor cho cả list/
  detail/status và stats bỏ date/is_active dù parse. Khép chung4 route trước.
- management_examination_query scope assignment từ Appointment không xóa,
  exam active, admin/staff/full scope; doctor/psychologist chỉ được phân công,
  role lạ/actor thiếu-inactive fail closed. Detail/write ngoài scope404; direct
  status khóa scoped row trước mutate. Không đổi enum/clinical transition khác.
- Stats bỏ auth-header decoder, nhận authenticated actor cả cookie/Bearer;
  chung date/doctor/search với list, grouped query, đủ key0 và loại PAID như cũ.
  List sort date+ID; invalid filter/body400, page/per_page dương/max100.
  DB acquisition lỗi trả JSON500, không che lỗi bằng unbound db finally.
-20 ca mới gồm PostgreSQL thật riêng9 ca và HTTP các role, ngày đầu/cuối,
  ca inactive/lịch xóa, search không dấu, same patient khác bác sĩ, psychologist
  legacy, pagination/status, không đọc/sửa ngoài scope, cookie actor; QA cluster
  tự đóng.463 Python+597 Node đạt;55 warnings (dependency/Query.get legacy),
  feedback/diff sạch. Logs /tmp/qlpk-management-scope-{regression,node}.log.
- Không DB thật/.env/restart/deploy, không sửa UI. Chưa pass visual/interactive
  QA workflow thật. Full frontend cookie cutover vẫn mở (login/header/page
  guards/jQuery/fetch/iframe/drafts/downloads); không tạo shim token. Clinical
  reassignment concurrency, idempotency/CSP/code health/production gate còn mở.

### Lát 41 (28/09/2026) — hồ sơ dùng chung quyền và socket gắn phiên

- /users/me requery active account trong DB session mở, dùng session_identity
  thay parser Group/UserGroup riêng; giữ avatar/phone/is_active/license_number,
  thêm no-store. Tài khoản mất/khóa sau auth bị401, malformed quyền fail closed.
- Realtime client hiện hữu thêm bindSession(owner): cookie auth chỉ CSRF,
  chưa authenticated không fallback token storage. Invalidation đóng socket;
  phiên mới mở socket mới, mọi callback cũ bị chặn trước dispatch/subscribe/
  reconnect. stop tường minh không tự bật lại khi owner đổi. Rebind bỏ listener
  owner trước. Legacy vẫn chạy tới cutover nhưng không nhận event sau đổi token;
  caller phải stop/start khi xoay token (header hiện đã làm).
-443 Python +597 Node đạt,9 dependency warnings; syntax/diff/feedback đạt.
  Chrome cookie+WebSocket thật với Flask/DB mocked: login→subscribe/resync,
  password rotate→socket cũ ngắt/socket mới resync, đọc profile, logout confirmed
  ngắt socket; storage trống, cookie hidden, không page errors. Server/browser
  QA đã đóng. Logs /tmp/qlpk-session-integration-{regression,all-node}.log và
  /tmp/qlpk-realtime-cookie-browser.log; scripts cùng prefix ở /tmp.
- bindSession đã kiểm với owner/actions thật nhưng template CHƯA gọi; không
  coi cookie frontend cutover xong. Tiếp tục login/header/template/54 callers,
  iframe/request/draft cleanup; examination stats auth/scope còn mở. Không
  ghi DB thật/.env/restart/deploy. Chưa pass visual/interactive QA workflow thật;
  CSP/concurrent clinical writes/idempotency/code health/production gate còn mở.

### Lát 40 (28/09/2026) — identity DTO và actions phiên xuyên tab

- session_identity.py canonical ALL_PERMISSIONS+session_user_payload tái dùng
  account_access parser; login/check/session/password cookie dùng chung. Bỏ2
  khối parse JSON permissions/log full permissions trùng trong auth.py. Query
  session/check active user khi DB mở; payload có tên/email/role/permissions.
  Frontend owner strict permissions, clone/freeze; không giữ raw access_token.
- browser-session-actions.js factory nối3 action vào owner, chưa template.
  Web Locks cùng tên across tabs; thiếu khóa fail closed. Rebootstrap trong
  lock rồi compare expected ID cho password/logout, queued old action không
  revoke account mới. Password400 giữ phiên, network/500 invalidate để xác minh;
  login error không tự retry. Logout success=true hoặc verified401 mới trả
  cleanup confirmation,503/malformed/stale không; consumer còn chịu dọn nháp.
-14 Node actions +4 Python permissions mới; toàn592 Node+440 Python đạt,
 9 dependency warnings. ESLint2 factories0 error/2 length warnings, bỏ complexity
  mới bằng tách validation thuần; không suppression. Feedback/diff-check đạt.
  Chrome2 tab+Web Locks thật/Flask DB mocked đạt login/quyền/password rotate,
  stale queued logout block rồi logout confirmed, cookie hidden/storage trống.
  Logs /tmp/qlpk-session-actions-{node,regression,browser}.log. QA processes đóng.
- Chưa cutover54 frontend callers/templates; không .env/DB/restart/deploy.
  Còn /users/me legacy permission serialization và examination stats direct
  auth header; init/load ordering/jQuery/request cancellation và draft cleanup
  phải nối đúng owner. Full HttpOnly/CSRF/CSP, clinical save concurrency,
  idempotency, code health/real workflow/production readiness vẫn mở.

### Lát 39 (28/09/2026) — owner phiên browser và chặn tab cũ

- Cookie chung tab làm cần ràng buộc identity ngoài CSRF. Thêm backend
  X-QLPK-Session-Id nếu có phải khớp JWT jti, GET cũng bị chặn khi lệch.
  Header chưa bắt buộc trong phase chuẩn bị; new owner luôn gửi. Không sửa
  cookie/store/schema, chưa làm full API mandatory-header contract.
- shared/browser-session.js factory chưa nạp template: RAM-only id/CSRF/user,
  single-flight bootstrap, strict payload, revision guard cả sau JSON parse,
  fail closed khi unknown/changed/unavailable. request không external/Bearer,
  copy init/preserve Request body, same-origin credentials/no-store/no replay.
  Network lỗi giữ identity nhưng block writes,401 expire; dispose dọn listeners.
  BroadcastChannel inject invalidation-only; không nhận identity/token từ tab.
-21 Node mới +2 Python cross-tab identity; toàn578 Node+436 Python đạt,
 9 dependency warnings. ESLint owner0 errors/1 warning factory>80lines, không
  thêm suppression. Feedback/diff-check đạt. Chrome2 tab+Flask DB giả thật:
  oldID403, cross-tab invalidate block, explicit bootstrap khôi phục đúng phiên,
  logout thông báo tab còn lại; storage trống, cookie hidden. Server/browser
  đã đóng, không ghi dữ liệu thật. Logs /tmp/qlpk-session-owner-{node,python}.log
  và /tmp/qlpk-session-owner-browser.log.
- Chưa cutover: factory chưa dùng bởi54 JS callers, login/header/rotation/
  logout/realtime vẫn cũ. Lần tới nối init/bootstrap và permissions DTO; phải
  giữ stale-session/iframe/nháp, không token giả và không chuyển từng page rồi
  báo đã bỏ localStorage. Backend non-guard stats auth_header vẫn cần loại.
  Full HttpOnly/CSRF/CSP, clinical concurrency/idempotency, real workflow QA
  và production config vẫn chưa hoàn tất; goal active.

### Lát 38 (28/09/2026) — nền cookie/CSRF server, chưa cutover frontend

- Inventory472 matches/258 lines/54 JS files có token/Authorization; source
  /tmp/qlpk-cookie-callers.txt. Không thể bật cookie riêng login rồi coi xong.
  HTTP auth guards, password/logout, socket đọc token trực tiếp cần owner chung.
- Thêm services/browser_sessions cookie extraction/CSRF HMAC/origin/lifecycle.
  Login opt-in X-QLPK-Session:cookie ký transport=cookie, JSON chỉ user/jti/
  CSRF, không JWT. Cookie HttpOnly/host-only/Lax/Path=/, prod Secure/__Host,
  dev riêng tên. require_auth/admin cookie priority + origin/CSRF trước writes;
  cookie JWT không replay qua Bearer. /auth/session no-store bootstrap.
- Password mode cookie rotate token+CSRF, logout revoke rồi clear; socket
  connect cookie cần Origin+auth.csrf_token. Bearer hiện hữu vẫn hoạt động tạm
  để không phá caller trước cutover; không có token giả trong localStorage.
-30 tests mới, hồi quy434 Python+557 Node đạt,9 dependency warnings cũ;
  feedback contract/diff-check đạt. Chrome thật với Flask local DB mocked:
  cookie invisible, no JWT JSON, missingCSRF403/valid200, rotate/oldCSRF403,
  logout200/session401. Socket.IO cookie transport subscribe/logout đạt.
  Logs /tmp/qlpk-cookie-regression.log, /tmp/qlpk-cookie-node.log,
  /tmp/qlpk-cookie-browser.log. Không DB thật/schema/.env/restart/deploy.
- Tiếp theo bắt buộc: frontend session owner non-secret id/CSRF+fetch/ajax;
  migrate login/header/password/logout/realtime và54 file callers (bao gồm
  page guard/download/print). Xóa token storage/aliases, session bootstrap
  trước load; cross-tab generation phải tránh late response và cleanup nhầm.
  Không rollout mixed backend/frontend hoặc legacy cookie-token shim.
- Backend direct-header ngoài guards còn examination_management stats chỉ
  dùng để log nhưng đang re-auth và catch lỗi; chuyển sang actor đã xác thực.
  Stats/list clinical scope/date hiện legacy global cần audit nghiệp vụ riêng,
  không vô tình đổi khi transport migration. HttpOnly chưa hoàn tất; clinical
  save idempotency/concurrency, CSP, full health/real QA và production config
  vẫn trong goal, chưa pass visual/interactive QA workspace thật.

### Lát 37 (28/09/2026) — auth transport không rò/chạy lại ngầm

- Trace utils.js thấy global fetch/ajaxSend tự gắn token cả external URL,
  bỏ Request.headers khi wrap, mutate init;401 replay cả POST và có thể dùng
  token tài khoản mới. autoLogin đọc plaintext legacy password; startup gọi
  refresh nhưng endpoint còn sai signature create_access_token thiếu user.
- Sửa owner utils: URL same-origin HTTP(S) guard theo baseURI/location, giữ
  explicit auth/Request headers/body, clone init; bỏ global retry/startup refresh
  và autoLogin. Remove legacy username/password storage keys, không đọc/gửi lại.
 4 callers lịch hẹn bỏ autoLogin, báo login lại; list reject unauthorized.
  Refresh endpoint vẫn require_auth nhưng410 login_required, không mint token.
-19 Node mới, toàn557 Node đạt; AST-isolated test refresh không import main,
  gate/workflow16 Python đạt; hồi quy bảo mật404 Python đạt,9 warnings cũ.
  Browser Chrome2 loopback servers random port
  xác nhận6 requests,2 external không auto-auth,3 unauthorized không replay,
  Request body nguyên, password key removed,0 page errors. Dùng dummy token,
  server/browser đóng finally; không DB/schema/.env/restart/deploy.
  Logs /tmp/qlpk-auth-transport-all.log, /tmp/qlpk-auth-transport-browser.log,
  /tmp/qlpk-auth-transport-python.log; full security regression ghi riêng
  /tmp/qlpk-transport-regression.log. Không layout change.
- Token còn localStorage; explicit header callers, HttpOnly/CSRF/CSP,
  clinical concurrency/idempotency/full workflow QA vẫn trong goal. Chưa pass
  visual/interactive QA phiên hết hạn trên workspace thực, không gọi hoàn tất.

### Lát 36 (28/09/2026) — đo lại và sửa lịch bận

- Đo mới ESLint ban đầu91 errors/747 warnings, tất cả error là no-undef;
  page gate31 trang báo0 unresolved nhưng có false negative: whitelist event
  che lỗi setQuickTime dùng event ngầm, click icon có thể active sai element.
  Không diễn giải91 là91 lỗi runtime. Sau sửa90 errors,747 warnings,
  JS34 hàm complexity>=20,27 file vượt600 dòng theo ESLint; chưa đo lại Python
  complexity/full project runtime. Logs /tmp/qlpk-health-fresh-eslint.json,
  /tmp/qlpk-health-fresh-globals.log và /tmp/qlpk-health-fresh-smoke.log.
- doctor-busy-schedule truyền $this cho5 preset, highlight chỉ đúng nhóm trong
  form, aria-pressed đồng bộ, manual change/reset bỏ selection cũ. Không đổi
  khung thời gian/layout/API. check_js_globals không miễn event và không để
  declaration khác scope vô tình hợp thức hóa implicit event;2 tests gate mới.
- Xác nhận3 HTML sinks dùng reason raw: gợi ý, bảng, modal xóa. Chuyển sang
  QLPKSharedUtils.escapeHtml có sẵn; giữ dữ liệu gốc/selection text. Gợi ý API
  lấy lý do từ nhiều bác sĩ nên đây không chỉ là rủi ro tự nhập của riêng user.
  Không sửa backend/model/DB, không render HTML từ lý do.
- QA12 Node mới (9 preset+3 content safety), toàn538 Node đạt;17 Python
  gate/workflow đạt, static smoke và diff-check đạt. Chrome1440/390 dùng
  page/assets thật, API fixture12 dòng rồi1 dòng payload HTML, click icon,
  Enter/Space, reset/manual change, suggestion và modal đều đạt;0 JS error,
  0 ghi mạng, không overflow. Browser process đã đóng, server chung giữ nguyên.
  /tmp/qlpk-busy-quick-browser.log; screenshots /tmp/qlpk-busy-quick-{1440,390}.png.
- Fixture không thay dữ liệu thật: chưa pass visual/interactive QA workflow
  đầy/thưa thật. API auth audit419 routes:354 protected,63 public approved,
  2 static JS/CSS stamped chưa allowlist; giữ warning, không nới gate.
  HttpOnly/CSRF/CSP, clinical concurrency/idempotency và full QA vẫn mở.

### Lát 35 (28/09/2026) — không hồi sinh phiên sau mở khóa

- Lát34 còn lỗi: active=False chỉ chặn tạm; True trở lại thì jti cũ còn hợp lệ.
  Sửa access_sessions bằng random account generation ký trong JWT và allowlist
  Redis/RAM; revoke account xóa generation. Key mất/evict/expired không accept,
  tạo generation mới không khôi phục cũ; orphan jti tự hết hạn, không raw token.
- Register compare generation + write jti + extend TTL atomic (Redis Lua/RAM
  lock), validate hai key atomic. Generation bounded24h/extend tới longest token.
  Login authenticate, user PUT/DELETE, self-password dùng row lock chung; revoke
  trước account mutation/commit. Nếu Redis lỗi503 rollback; DB lỗi sau revoke
  giữ thu hồi an toàn. Profile-only không revoke. Group permissions vẫn fresh DB.
- Self-password recheck token sau lock; boolean account API validate rõ. Login
  issuance store error503. Không đổi database schema/.env/UI, không restart/deploy.
- QA401 Python +526 Node đạt,9 dependency warnings cũ; feedback contract và
  diff-check đạt.32 ca mới lifecycle +1 password-lock recheck. Có Redis thật,
  PostgreSQL14 QA riêng, pg_stat_activity xác minh row-lock wait cả login-trước
  và disable-trước, RAM/Redis đều đạt. Không ghi DB/Redis đang vận hành.
  Logs /tmp/qlpk-generation-regression.log và /tmp/qlpk-generation-node.log.
- Rollout login lại tất cả token cũ; Redis standalone shared, không Cluster.
  Chưa pass visual/interactive QA khóa/mở khóa với Doctor/workspace thật.
  HttpOnly/CSRF/CSP, clinical-save idempotency/concurrency, fresh full code-health,
  browser workflow đầy/thưa và production Redis/SMTP rotation còn trong goal.

### Lát 34 (28/09/2026) — registry phiên và logout server

- Logout trước đây chỉ clear localStorage, token sao chép vẫn dùng được.
  Thêm access_sessions owner allowlist jti UUID→SHA256 token/TTL, đăng ký
  trước trả JWT; token_matches_user check registry sau credential binding.
  Redis SESSION_REDIS_URL ưu tiên REALTIME_REDIS_URL, production bắt buộc;
  DEBUG local memory bounded10000/lock. Mất/evict registry fail closed,
  không dùng denylist dễ resurrect sau restart. Store outage503 HTTP.
- POST /auth/logout revoke đúng session, disconnect đúng token sockets,
  khác login cùng user không ảnh hưởng. Old token thiếu jti/registry cần
  login lại. Registry lỗi không fallback JWT/memory, raw token không lưu Redis.
- Header async logout snapshot token/pending/timeout10s;200/401 mới clear
  và navigate,503/network giữ phiên+feedback, response cũ không clear user
  khác.6 legacy callers delegate owner header. Draft recovery bỏ click
  cleanup, chỉ confirmed event; header await cleanup native/iframe trước
  clear identity. Không đổi layout hoặc DB/schema, không .env/restart/deploy.
-19 Python mới (HTTP/sockets thật transport, DB giả, Redis riêng thật),
  7 Node mới; tổng368 Python +526 Node đạt,9 dependency warnings cũ.
  Hồi quy logs `/tmp/qlpk-session-regression.log`,
  `/tmp/qlpk-session-node.log`. Chrome isolated kiểm503 giữ session/không
  cleanup rồi200 clear/navigate đạt; không dùng account/Redis thật vận hành.
- Chưa pass visual/interactive QA workspace đầy/iframe thật và DB E2E.
  Redis URL/config deploy cần kiểm trước phát hành; gate phải FAIL nếu
  thiếu: check_security_config hiện FAIL do thiếu shared Redis URL ở local
  DEBUG. Không tự thêm URL hay bật DEBUG workaround. Session TTL dev0
  vẫn8h; HttpOnly/CSRF, write idempotency/concurrency/nợ code/full QA còn
  mở. Mục tiêu tổng thể active, không tuyên bố hệ thống production-ready.

Còn lại đo sau lát27 (lát28–34 chưa đo lại complexity): 33 hàm complexity ≥20, 27 file JS dài, CSS `!important`
438 theo contract, lint backend/global còn tồn đọng; hai gate thuốc/CSS đã đạt. JWT
HttpOnly/CSP enforce chưa triển khai; mục tiêu tổng thể vẫn active, chưa
commit. Lát tiếp phải xử lý theo caller/workflow và test, không chỉ hạ số đo.

Số liệu lịch sử sau lát 1 (không phải hiện tại): ESLint `no-undef`
109 (global chéo file của script classic: `CustomModal` 28, `XLSX` 24,
`apiCall` 12…, không thiếu thật trên trang nào), complexity ≥20: 57 hàm,
29 file >600 dòng, id-selector 891, `!important` 471, dup 0,9%, 117 `onclick`
inline, `personal-detail-modal-dry.js` (1.202 dòng, TLG), 61 `except…pass`,
pyflakes 163.

## Tech debt toàn dự án — 6 nhóm, 29/09/2026 (lát71)

Đo trước: 70 lỗi ESLint, 20 hàm complexity ≥20, 37 file >600 dòng (27 JS,
10 Python), 44 `except … pass`, 438 `!important`, 94 thẻ CDN, 13+ handler
inline, production gate FAIL (thiếu Redis session).
- ESLint: 70 → 0 lỗi (tham chiếu `window.X`, `/* global */` cho biến lexical
  của trang, `XLSX`/`Sortable`/`IDBKeyRange` vào globals thư viện).
- Complexity ≥20: 20 → 0 (tách helper, giữ thứ tự bước/await).
- File >600 dòng: 37 → 0; `scripts/check_code_health.py` + `tests/test_code_health.py`
  khóa ≤600 dòng, 0 lỗi ESLint, không hàm ≥20. Cách tách (đều kiểm đảo ngược
  bằng AST: hàm/câu lệnh khớp nguyên văn sau khi bỏ tiền tố):
  - IIFE → `<file>-parts/part-N.js` (hàm qua `moduleParts`, state qua
    `moduleState`); entry ghi `// Parts (nạp trước file này): …`.
  - Factory lớn (`doctor-indications-form`, `clinical-workspace-ui`,
    `prescription-ui`) → installer theo instance (`inst`/`outer`).
  - Classic script → file tiếp theo cùng scope trang; entry ghi
    `// Continued in (nạp ngay sau file này, cùng scope trang): …`.
  - Class (`JointExamManager`, `RelativeTable`, `DashboardManager`) → method
    gắn prototype ở `<file>-methods.js` (non-enumerable như method class).
  - Python API → `<module>_partN.py`, module gốc import lại ở cuối (đăng ký
    route, giữ tên cũ); `NotificationService` → mixin `_workflows` + `_helpers`.
  Template/`doctor-examination-entry.js`/loader động (`sidebar-dry-loader`,
  `app-header-loader`) nạp part trước entry. Test/gate đọc qua
  `tests/helpers/module-source.js`, `scripts/module_source.py`; patch module
  Python tách qua `tests/module_parts.py::setattr_all`.
- `except … pass`: 44 → 0, thay bằng log cảnh báo (hành vi giữ nguyên);
  `tests/test_no_silent_except.py` khóa. `next(db_gen, None)` bỏ try thừa.
- Handler inline: 18 (`onclick/onchange/oninput/onblur/onmousedown`) → 0, dùng
  `data-qlpk-call` (thêm `mousedown` vào `shared/inline-actions.js`); gate 0.
- CDN: 94 thẻ + 4 loader động + `@import` Google Fonts → 0; 20 file self-host ở
  `app/static/vendor/<lib>@<ver>/` (SRI khớp 100% bản CDN cũ) + font icon/Roboto
  + LICENSE. CSP Report-Only bỏ host CDN. Gate `html_external_assets`,
  `css_js_external_assets` = 0.
- `!important`: 438 → 94. Phân tích cascade trong Chrome trên DB thật chỉ đọc
  (30 trang × 1440/760 px, mở từng modal, :hover/:focus xét cả hai nhánh,
  phần tử dựng giả theo tổ hợp class có thật trong markup, hiểu cả shorthand
  dùng `var()`): 344 chỗ bỏ không đổi giá trị thắng cascade; kiểm lại khi bỏ
  đồng thời: 0 xung đột (vòng đầu bỏ sót shorthand `var()` → A/B phát hiện
  nền modal-header/badge đổi, đã hoàn nguyên và làm lại). 94 còn lại là
  override cần thiết hoặc selector động chưa kiểm chứng được. Gate khóa 94.
- Production: `docker-compose.yml` khai báo `SESSION_REDIS_URL` (cùng db 0 với
  realtime, không mất phiên khi deploy), app chờ Redis healthy;
  `check_security_config.py --compose docker-compose.yml` PASS,
  `tests/test_production_session_config.py`. Chạy local DEBUG vẫn báo thiếu
  Redis (không sửa `.env`).
- QA: 752 Node, 915 Python/324 skip opt-in; 16 gate (code health, feedback,
  Doctor, frontend, smoke, JS globals, brand, receptionist, workspace tabs +
  runtime, patient history, prescription stock/print, ICD, medical history,
  API auth, schema) đạt; `check_security_config --compose` PASS.
  A/B Chrome trên DB thật chỉ đọc giữa HEAD (worktree 02e01b2) và bản mới:
  30 trang × 2 khổ, 220 view (trang + từng modal) so DOM, box và 50 thuộc tính
  computed style; request GET/ghi; lỗi JS. Bản mới: 0 lỗi JS, 0 request ra
  ngoài. Khác biệt còn lại đều do nhịp tải: Lễ tân (khối “Chưa có người thân”
  hiện ngay vì bảng người thân khởi tạo trước reset form) và Chỉ tiêu (chiều
  cao biểu đồ Chart.js, bản mới chạy 2 lần cũng lệch nhau); làm chậm
  `/auth/session` 400–900 ms thì HEAD cho kết quả giống hệt bản mới. Tích hợp
  A/B (chặn ghi, so body request): Tủ thuốc, Lịch hẹn ×2, Thu ngân ×2, Chỉ định
  giống nhau (Lịch hẹn: số request verify-events khác 1 lần, chạy lại khớp).
  Đăng nhập thật `hienngvo` ở 8000: Doctor mở ca, tải lại giữ phiên, đăng xuất
  về login; 8 màn mở được, 0 request ngoài. Chưa kiểm: trạng thái hover/animation
  thực tế của 94 `!important` còn lại, luồng ghi thật (DB copy).

## Tech debt theo màn — Thu ngân, ĐÓNG 28/09/2026 (lát70)

- `payment-waiting.js` 1.966 dòng → lõi 323 dòng (state, helper, ready,
  bindEvents, `showCustomToast`) + classic script `payment-waiting/{list,
  detail,services,invoice,output}.js` (≤514 dòng), nạp đúng thứ tự cũ, chỉ
  khai báo top-level; cùng mẫu header global/exported và ESLint
  `sourceType: script` như Tủ thuốc/Chỉ định.
- 5 lỗi ESLint `CustomModal` → `window.CustomModal`. Complexity cao nhất 18
  (không có hàm ≥20 từ trước). Toàn dự án lỗi ESLint 75 → 70.
- Thêm `payment_waiting_modules.test.js` (thứ tự, ≤600 dòng, top-level, tên
  không trùng). Trước đó màn này không có test đọc nguồn.
- QA: 752 Node; JS globals 31 trang 0 unresolved; feedback/frontend contract
  đạt. A/B Chrome DB thật chỉ đọc (admin, chặn ghi) HEAD vs mới: danh sách,
  3 bộ lọc trạng thái, tìm, số dòng/trang, trang 2, mở 5 hóa đơn (dịch vụ,
  đơn thuốc, tổng tiền), nhập tiền/nút xóa, sửa/thêm/xóa dịch vụ, xác nhận
  hóa đơn thiếu tiền, 4 luồng trả về (lễ tân/bác sĩ/tâm lý gia/lịch hẹn) qua
  2 bước xác nhận, in hóa đơn/in danh sách, xuất bảng → DOM, GET, request ghi
  và số cửa sổ bật lên giống hệt (`/tmp/qlpk-pay-ab.cjs`, `-ab2.cjs`). Đăng
  nhập thật `hienngvo` ở 8000 mở được màn (10 dòng). Chưa kiểm nội dung trang
  in hóa đơn thật (bị chặn/ghi, cửa sổ in đóng ngay trong QA).

## Tech debt theo màn — Chỉ định, ĐÓNG 28/09/2026 (lát69)

- Phạm vi: JS màn `order-management.html` (`order-management.js`,
  `orders/order-status-utils.js`). `orders/order-selection-state-utils.js` và
  `order-autocomplete-utils.js` thuộc Doctor (shared), không nạp ở màn này nên
  không sửa (`loadSelectedOrdersFromServer` 22 vẫn còn).
- Complexity: `loadOrderSurvey` 52 → tách 5 bước; `checkSurveyStatusUpdate`
  23 → `applySurveyStatusUpdate`; `resolveSurveyAnswerText` 20 → helper id/
  nhãn/giá trị. Cao nhất còn 17.
- 6 lỗi ESLint: `QLPKIconSystem` → `window.QLPKIconSystem`,
  `updateLevelInputAlignment` → `window.updateLevelInputAlignment` (cùng đối
  tượng, vốn gán qua `window.`). Toàn dự án 81 → 75 lỗi.
- `order-management.js` 2.157 dòng → lõi + 7 slice (≤341 dòng), cùng mẫu
  classic script như Tủ thuốc (ESLint `sourceType: script`, header global/
  exported); `order_management_modules.test.js` khóa thứ tự, top-level và tên.
- QA: 749 Node; `test_workflow_contracts.py` 15 đạt; JS globals 31 trang 0
  unresolved; feedback/frontend/Doctor contract đạt. A/B Chrome DB thật chỉ
  đọc (admin, chặn ghi) HEAD vs mới: tab đang thực hiện/đã hoàn thành, mở 8
  chỉ định (kết quả GAD-7, chưa tạo link, ghi chú nhập tay, mẫu 404 → báo lỗi),
  lọc tên, chọn dòng, xóa có xác nhận → DOM giống hệt, GET và request ghi
  giống nhau (lần chạy đầu bản mới dư 2 GET poll trạng thái; chạy lại khớp
  53/53, do nhịp thời gian). Đăng nhập thật `hienngvo` ở 8000 mở được màn.
  Chưa kiểm: nhánh “chưa có lịch khám” (examination id qua API 404), upload/
  xóa file kết quả thật, lưu mức độ khảo sát.

## Tech debt theo màn — Lịch hẹn, ĐÓNG 28/09/2026 (lát68)

- `appointment-management.js` 2.253 dòng (một closure `$(function)` 1.686 dòng
  lint) → entry 374 dòng + 7 slice `appointment-management/page-*.js` (≤391
  dòng). Tách bằng script AST (espree + eslint-scope): 105 hàm chuyển sang
  slice theo khoảng dòng, 27 biến closure thành `page.state`, 262 tham chiếu
  đổi thành `state.X`/`page.X`; hàm cùng slice vẫn gọi trực tiếp. 30 câu lệnh
  bind/init giữ ở entry đúng thứ tự cũ. Kiểm đảo ngược (bỏ `state.`/`page.`):
  105/105 hàm và 30/30 câu lệnh khớp nguyên văn bản gốc. Không có hàm dùng
  `this`/`arguments` ở cấp closure nên đổi sang `page.fn()` không đổi ngữ cảnh.
- `populateEditForm` complexity 44 → 16 (tách điền bệnh nhân, dịch vụ/gói,
  loại khám, thời lượng; giữ thứ tự và bước `await` ICD). Cao nhất trên màn 17.
- 5 lỗi ESLint `CustomModal` không khai báo → `window.CustomModal` (cùng đối
  tượng global). Màn Lịch hẹn 0 lỗi ESLint; toàn dự án 86 → 81 lỗi.
- Test đọc nguồn (`auth_transport_safety`, `appointment_calendar_shared`) đọc
  entry + slice; thêm `appointment_management_modules.test.js`.
- QA: 746 Node; JS globals 31 trang 0 unresolved; feedback/frontend contract
  đạt. A/B Chrome trên DB thật chỉ đọc (admin, chặn ghi) giữa HEAD và bản mới:
  tháng/tuần/tháng trước, tìm kiếm, lọc bác sĩ, mở sửa 2 lịch hẹn (dịch vụ,
  loại khám, tóm tắt), lưu sửa, modal thêm (validation rỗng, chọn gói), đồng
  bộ Google Calendar, kéo thả event, đổi trạng thái có xác nhận, xóa có xác
  nhận → kết quả giống hệt, request ghi giống nhau và đều bị chặn
  (`/tmp/qlpk-appt-ab.cjs`, `/tmp/qlpk-appt-ab2.cjs`). Đăng nhập thật
  `hienngvo` ở 8000: lịch hiện 2 lịch hẹn, mở modal sửa đúng bệnh nhân/bác sĩ.
  Chưa kiểm: kéo giãn thời lượng event, xuất Excel (thư viện CDN).

## Tech debt theo màn — Quản lý thuốc, ĐÓNG 28/09/2026 (lát67)

Mục tiêu đang mở: Quản lý thuốc → Lịch hẹn → Chỉ định → Thu ngân; làm xong
màn nào đóng màn đó. Tiêu chí: JS của màn không còn hàm complexity ≥20, 0 lỗi
ESLint, file ≈≤600 dòng, không đổi hành vi, test/gate xanh, QA trình duyệt.
- Complexity: `populateMedicineForm` 32 và `updateStockQuantityHint` 23 tách
  helper; `reference-review.js` `controls` 34, `comparison` 24, `loadPreview`
  22 chuyển sang hàm tiêu đề/trạng thái/dòng so sánh. Cao nhất còn 19.
- `medicine-management.js` 2.837 dòng → lõi 281 dòng (helper, state, ready,
  bindEvents, `showCustomToast`) + 7 classic script `medicines/management-
  {list,form,stock,batch-import,suppliers,overview,import-ledger}.js`
  (≤469 dòng), nạp theo đúng thứ tự cũ. Các file chỉ khai báo top-level nên
  thứ tự nạp không đổi runtime; hàm vẫn là global cho `onclick` inline.
- Tham chiếu chéo khai báo bằng header `/* global */` (`: writable` khi gán) và
  `/* exported */`; ESLint health lint các file này ở `sourceType: script`.
  `check_js_globals.py` vẫn kiểm các tên trong `/* global */` phải có nơi định
  nghĩa trên trang. Gỡ 8 khai báo chết không còn ai gọi.
- Sửa lỗi có sẵn: nút “Xóa đã chọn” dùng `$.show()` nhưng `.mm-hidden` là
  `display:none !important` nên không bao giờ hiện; nay dùng `setElementVisible`.
- Test đọc nguồn dùng `tests/helpers/medicine-management-source.js` (ghép file
  theo thứ tự template); `medicine_management_modules.test.js` khóa thứ tự nạp,
  ≤600 dòng, chỉ khai báo top-level, không trùng tên, nút xóa hàng loạt.
- QA: 742 Node, 911 Python/324 skip opt-in; feedback, Doctor, frontend
  contract, smoke, JS globals (31 trang, 0 unresolved) đạt. ESLint màn Thuốc
  0 lỗi, cảnh báo ~66 → 22; toàn dự án lỗi giữ 86, cảnh báo 733 → 673.
  A/B Chrome trên DB thật chỉ đọc (admin, chặn mọi request ghi): bản HEAD và
  bản mới cho kết quả giống hệt ở danh sách/tìm/lọc thiếu giá/sắp xếp/trang 2,
  sửa 5 thuốc, thêm mới, chi tiết tồn, nhập kho + lịch sử, nhà cung cấp, liên
  kết DAV, lưu bị chặn hiện thông báo (`/tmp/qlpk-medicine-ab.cjs`). Phần gợi ý
  quy đổi tồn so 128 tổ hợp đầu vào cũ/mới: 0 khác. Xóa một thuốc và xóa hàng
  loạt gửi đúng DELETE (bị chặn). `hienngvo` (bác sĩ) không có quyền màn này
  nên không QA đăng nhập thật ở 8000 cho màn Thuốc.

## Doctor health — xử lý 11 mục, ĐÓNG 28/09/2026 (lát66)

Đo lại 28/09 trên 100 file JS mà Doctor nạp (template + ES module graph):
hàm complexity ≥20 từ 11 → 3; cả 3 là shared nằm ngoài scope từ đầu
(`medical-history-form.populate` 21, `modal-history-print-controller.printTarget`
20, `order-selection-state-utils.loadSelectedOrdersFromServer` 22, đều đã có ở
bản đo 27/09). Đã sửa 8 hàm vượt ngưỡng, gồm các hàm tăng do chính các lát
phiên/an toàn gần đây: `captureDraft` 28, joint-exam `load`/`edit` 30 và
`mutateRelative` 23, `uploadFile` 25, `relative-table.mutate` 20,
`setMainAddressWardValue` 22, `loadCopiedPatientWithAppointmentContext` 23.
`modal-patient-search-ui.js` 1.598 dòng tách thành `-dom.js` (DOM/render/bind),
`-state.js` (state/copy/flow) và `-ui.js` (adapter + public API); API giữ nguyên,
thứ tự nạp Doctor entry/TLG template/test được cập nhật.
QA: 909 Python/324 skip opt-in + 738 Node; Doctor contract, frontend contract,
smoke, JS globals, feedback, diff đạt. Chrome (8000, `/auth/session` + API giả
lập, chặn ghi): Doctor chọn ca → người đi cùng hiện dòng → sửa hiện đúng tên →
hủy trả dòng; modal lịch sử mở, tìm 2 bệnh nhân, chọn dòng 2; TLG nạp đủ API;
0 lỗi JS, 0 ghi (`/tmp/qlpk-doctor-close-browser.cjs`). Chưa pass
visual/interactive QA với dữ liệu thật.
Giới hạn ghi nhận, không làm tiếp: `prescription-ui.js` 1.296 và
`doctor-examination.js` 831 dòng vẫn vượt cảnh báo 600 dòng (một closure lớn,
không còn hàm ≥20); tách thêm là refactor rủi ro cao cho luồng kê đơn, không
thuộc tiêu chí mục 1.

Scope user đã duyệt là cả 11 mục của lần đo sau `1cd7147`, không phải chỉ
9 mục cleanup trước đó. Không đụng V2/cổng8001, không ghi dữ liệu QA.

| Mục | Trạng thái hiện tại (đo lại 27/09 trên working tree) |
| --- | --- |
| 1. Complexity Doctor-private | Tách save controller (`saveWorkspace` 55→<15 + `runWorkspaceSave` 24, `saveNow` 50→21, `completeNow` 26→<15), prescription UI (`savePrescription` 29→<15, `normalizePrescriptionRow` 25→18, `loadPrescription` 24→16), page (`renderPatientSurface` 28→18, `selectPatientCard` 28→23). 27/09 tiếp: `draft-recovery.js` 806→661 dòng (tách `draft-recovery-policy.js` 126 + `draft-recovery-store.js` 141), `applyDraft` 22→<15, `collectRestoreTargets` 21→<15, realtime `handler` 25→<15, `selectPatientCard` 23→18, prescription `create()` 22→<15 (ESLint bắt `registry` thiếu khi tách — đã sửa). Đo lại 27/09 bằng ESLint JSON còn 4 hàm ≥20 (báo cáo trước ghi 0 là sai): `runWorkspaceSave` 24→<15 (`getSupportReadinessFailures`/`isSkippedFor`/`getWorkspaceSuccessMessage`), `saveNow` 21→<15 (`assertSaveReady`/`assertDetailsSaveable`/`waitForDetailsLoad`/`saveSections`, giữ thứ tự loadFailed → buildSavePlan), `_verifyMedicalHistoryPopulate` 24→<15 (5 check trả về danh sách cảnh báo, parity 10 kịch bản), `handlePrescriptionInput` 20→<15 (bảng handler theo field, A/B browser 7 bước giống HEAD). Còn ≥20 trong Doctor-private: 0 (ESLint JSON 27/09); shared còn 14 hàm ≥20 ngoài scope |
| 2. Shared builders lớn | Tách theo phần tài liệu, HTML byte-identical qua fixture: `buildPrescriptionPreviewHTML` 68→19 và `buildPrescriptionScreenHTML` 34→<15 (259 ca), `buildMedicalRecordHTML` 65→<15 (`buildMedicalRecordModel` 20; 288 ca), `renderAppointmentCard` 57→23 (72 ca), `selectAppointmentPatientFlow` 41→<15 (4 test hành vi đạt trên cả bản cũ và mới). `modal-patient-search-ui.js` 1.641→1.605 dòng sau khi tách `components/modal-patient-search-data.js` (261 dòng: URL/fetch/payload adapters, registry `modalPatientSearchData`, không DOM); UI `throw` nếu thiếu data owner, nạp trước UI ở `doctor-examination-entry.js` và `psychologist-examination.html` |
| 3. Dialog/toast ngoài owner | Xong: relative/joint-exam dùng `QLPKConfirmationDialog.confirm`, TransferModal dùng `QLPKUserFeedback`; thiếu owner/library thì hủy thao tác |
| 4. HTML chưa escape | Commit `f6fb49d`: suggestions/allergy dùng escape helper chung; chưa phải kiểm toán XSS toàn trang |
| 5. Mã chết | Commit `ab829b0` + 27/09: bỏ 26 rule `card-header/modal-tabs/upload-area/document-item/search-result-item` không có DOM ở 3 trang khỏi `clinical-workflow.css`, bỏ 9 rule `#jointExamEditBtn:not(.receptionist-icon-action)` (nút luôn có class đó) |
| 6. DRY trùng lặp | Xong các cặp đã đo; đo lại: 7 cặp ≤10 dòng, 0.2% dòng trùng (trước 0.5%) |
| 7. CSS shared | Màu: 0 literal ngoài `color-tokens`/`feedback-tokens` trên 21/22 file trang Doctor (còn 4 fallback `doctor-prescription.css` do stock contract yêu cầu); 310 token `--qlpk-palette-*`/`--qlpk-alpha-*` + 5 `-rgb` sinh tự động, byte-identical với literal cũ. `!important`: 56→10 (còn: flatpickr trên modal, disabled-surface có ghi lý do, `vital-hidden/display-flex/block` là utility JS toggle, `.mb-4` override Bootstrap, 3 ở clinical-workflow sidebar cols). Id-selector `doctor-examination.css` 49→0, `patient-info-form.css` 18→0, `joint-exam-table.css` 21→0 (dùng class/`data-patient-field`); 27/09 tiếp: `inline-tien-su.css` 6→0 (`.medical-history-tabs`/`.medical-history-suggestion-box` có sẵn, thêm class `medical-history-table-wrap` cho 3 wrap bảng và `prev-risk-panel` cho panel nguy cơ lần trước trong `_inline_medical_history.html`), `clinical-workflow.css` `#sidebar-container.col-md-2` → `.qlpk-shell-sidebar.col-md-2` (class thêm vào 3 template Doctor/TLG/Lễ tân; loader vẫn bỏ `col-md-2` sau khi nạp) → 0 id-selector trên 22 file CSS trang Doctor; parity computed-style 55.119 node/0 diff gồm 7 trạng thái workbench Tiền sử; z-index 62 giá trị → 16 token `--qlpk-z-*` giữ nguyên thứ tự lớp |
| 8. Thiếu test module | 273 Node tests (+ `draft_recovery.test.js` 6 ca máy trạng thái nháp với store trong bộ nhớ) (+ save controller, patient-search-dropdown, component-dom-scope, history-tab-core, datepicker, relative confirmation, modal patient-search flow, clinical-workspace-ui: header/clear/section/dirty/Lưu) + 5 pytest cache/stamping. `re-examination-calendar.js` gắn FullCalendar CDN + `<dialog>` nên chỉ kiểm bằng browser (đã có trong QA 26/09: mở, chọn ngày, xác nhận); `draft-recovery.js` có 15 policy case + 6 test đơn vị |
| 9. Tải trang/cache | Xong phần cache: static `?v=` immutable, module ES được stamp version; quay lại Doctor chỉ HTML + API + 4 asset không version. Không bundle (cần build step, chưa duyệt) |
| 10. Backend lint/lỗi bị nuốt | Commit `3cf87ce`; 27/09: sửa 500 `/api/family-members/search` (đọc `Appointment.diagnosis` không tồn tại), bỏ import thừa. pyflakes 0 trên file đã sửa; `main.py` còn 10 ghi chú import model (giữ vì đăng ký ORM khi import) và `app/api/medicine.py` có thay đổi song song của người khác, không đụng |
| 11. Accessible names | Xong: probe 0 control thiếu tên ở các state đã đo |

QA 27/09 (working tree, chưa commit): 273 Node tests, pytest 321 đạt (3 fail
sẵn ở HEAD: `test_workflow_contracts`; `test_pdf_preview` cần Chromium ngoài
sandbox); Doctor/print/history-modal/receptionist/brand/stock/ICD/tabs
contracts đạt; smoke_health `--http` 30 route đạt. CSS parity: computed style
58 thuộc tính trên 36.869 node (Doctor 5 panel + modal lịch sử + tab sinh hiệu
bảng + tab dịch vụ + thêm người thân; Lễ tân danh sách + modal người đi cùng;
TLG) trước/sau = 0 khác biệt. Browser thật: queue card Doctor/Lễ tân (20 thẻ,
3 action, trạng thái, #index), tab đơn thuốc/bệnh án/bệnh án TLG render đúng
tiêu đề/mục/chữ ký, bản in MOH dựng được với QR. Phát hiện & sửa khi QA: bỏ
`!important` ở disabled-surface làm mất nền ô readonly (hoàn lại, ghi lý do);
đổi `#age`/`#doctorDecisionTreatmentTask` sang class làm lệch specificity (đã
neo theo owner `.doctor-clinical-workspace--doctor` và `[data-patient-field]`).
27/09: parity computed-style thêm `/verify/rx/<code>` (screen + media print) và
modal Toa thuốc/Bệnh án ở media print: 8.566 node/0 diff (`/tmp/qlpk-verify-print-parity.cjs`).
Chưa pass visual QA cho bản in thật ra PDF/máy in và các màn ngoài 3 trang trên. Evidence tạm: `/tmp/qlpk-css-parity.cjs`, `/tmp/qlpk-rx-fixtures.cjs`,
`/tmp/qlpk-mr-fixtures.cjs`, `/tmp/qlpk-card-fixtures.cjs`, `/tmp/qlpk-builders-qa.cjs`.
Còn lại của scope 11 mục: `modal-patient-search-ui.js` 1.605 dòng sau khi tách data owner (shared; `createPatientSearchModalFlowAdapter` 312 dòng, `loadCopiedPatientWithAppointmentContext` complexity 23 có sẵn từ HEAD, chưa tách);
`doctor-examination.js` 759 và `prescription-ui.js` 1.155 dòng vẫn trên ngưỡng 600 của ESLint
nhưng không còn hàm ≥20. Browser draft-flow thật đạt (`/tmp/qlpk-draft-qa.cjs`).

## Context chung đang tiếp tục — 22/09/2026

### Quy chuẩn nút đã duyệt và áp dụng — 23/09/2026

- Thay thế palette 5 màu của lần triển khai trước: chính #176B5B, phụ trắng
  trên header nâu / #F5F5F5 trên nền sáng, xác nhận nguy hiểm #B42332,
  disabled #E7E7E7/#747474. Không gradient nâu, viền trang trí hoặc shadow.
  Không dời nút khỏi header; geometry/layout/handler/DB giữ nguyên.
- Owner runtime `shared/color-tokens.css` + `shared/button-actions.css`.
  Role vẫn giữ nguyên; solid/soft phân mức nhấn, container khai báo
  `data-qlpk-button-surface="dark|light"`. Toàn bộ nút đã opt-in dùng chung
  palette mới; các control navigation, badge DAV, Bootstrap close giữ owner cũ.
- Doctor/TLG: Lưu/Chuyển khám là phụ, Hoàn thành chính; Đơn thuốc vẫn tại
  header Khám & xử trí. Lễ tân Tải lên phụ/Lưu chính; lịch hẹn Đồng bộ/Kết nối
  phụ/Thêm chính; tủ thuốc Nhập kho phụ/Thêm chính. Điều chỉnh các import và
  công cụ phụ của service/text-expansion/document/chi-tieu/lịch hẹn modal.
- Renderer icon text mặc định soft, explicit solid khi cần. CustomModal
  nhận role xác nhận nguy hiểm tường minh; callsite xóa chi tiêu/lịch hẹn
  dùng danger, không thay callback nghiệp vụ. Nút xóa dòng lịch bận soft.
- Quy chuẩn bắt buộc `references/ui/button-system.md`, được dẫn từ CONTEXT,
  rule, context-files, working-rules, checklist thiết kế và brand-theme.
  Tài liệu mới ưu tiên hơn hướng dẫn nâu/gradient/cam của các mục lịch sử.
- QA browser localhost:8000: lịch hẹn có 2 sự kiện; nút phụ trắng, Thêm xanh,
  border transparent/image none/shadow none; focus bàn phím trắng trên nền
  nâu. Lễ tân queue nhiều dòng, Tải lên trắng/Lưu xanh, row actions trung tính.
  Tủ thuốc49 mục, Thêm xanh/Nhập kho phụ; form Thêm thuốc mở/đóng không lưu,
  disabled Lưu đúng #E7E7E7/#747474. Không ghi dữ liệu hoặc đụng V2.
- Chưa pass visual/interactive QA toàn hệ thống: Admin không có lượt khám
  tại Doctor; không dùng DOM ẩn làm bằng chứng. TLG, mọi modal, mobile,
  held-active/loading và hover trực tiếp đầy đủ chưa kiểm. Màu chữ test đạt
  không đồng nghĩa xanh-trên-nâu đạt contrast ranh giới 3:1; xem contract.
- Static cuối: 203 Node tests đạt; brand guard33 trang đạt; node --check các
  JS đã sửa đạt. Browser console lịch hẹn không có error. Thử di chuyển trỏ
  qua drag không tạo :hover thật nên không tính là pass hover tương tác.

Đầu mối bàn giao chung của task Hành chính/Lễ tân và Tủ thuốc/Nhập kho/DAV.
Cập nhật trạng thái tại mục này, không ghi nhật ký từng phản hồi rải vào
module docs. Các mục theo ngày phía dưới là lịch sử hoặc công việc song
song; không tự coi quyết định cũ là hiện hành nếu mục này đã thay thế.
Đây không phải bản kiểm toán toàn ứng dụng hoặc toàn bộ lịch sử DB.

### Môi trường và phạm vi

- Repo `qlpk_pro`; ứng dụng và browser QA tại `http://localhost:8000`.
  Không đụng `qlpk_pro_v2`,8001,SSH/server .26 hoặc deploy.
- Các lượt QA UI gần đây chỉ đọc/xem trước; không lưu lịch hẹn, nhập kho,
  đổi DAV hay đối soát dữ liệu. Không đưa thông tin đăng nhập vào context.
- Repo có thay đổi song song. Không revert/ghi đè/commit ngoài scope.
  Số tồn trong ảnh có thể thay đổi do user/task khác; không dùng số QA
  để tự khôi phục DB. Mục “Bổ sung giá nhập còn thiếu” phía dưới là một
  công việc song song, không thuộc các sửa UI được tổng hợp ở đây.
- User yêu cầu sửa đúng vùng chỉ định, không tự đổi toàn màn hình.
  Nền primary là gradient thương hiệu; tránh phủ kem toàn modal và chữ
  tối trên nền nâu trong các trạng thái tương tác.
- Khi user yêu cầu HTML/mockup: giao kèm link đường dẫn tuyệt đối mở trực
  tiếp trong câu trả lời. Browser in-app chặn file:// và data:, nên không
  dùng nó để trình bày mockup; mockup nút hiện hành:
  `reports/button-palette-2026-09-25/palette.html`.

### Quyết định hiện hành

- Dọn nợ kỹ thuật màn Bác sĩ 25–26/09 (9 mục, commit `69c6c9c`…`ab3945a`):
  (1) liều thuốc một owner `PrescriptionDoseUtils`, bỏ bản sao ở model,
  template và `psychologist-examination/core-utils.js`; (2) tài sản dùng chung
  chỉ lấy qua registry, `platform-boundaries.js` nạp sớm; (3) hộp thoại chưa
  lưu dùng `confirmationDialog.choose()`; (4) CSS base đọc token
  `--qlpk-doctor-*`, gộp alias, toàn bộ màu cứng chuyển vào
  `shared/color-tokens.css` (trừ 2 fallback stock contract bắt buộc), gộp 3 rule
  trùng và bỏ khai báo bị ghi đè; (5) mã lịch hẹn Đơn thuốc lấy qua cùng getter
  với Dịch vụ; (6) contract check theo layout/markup hiện tại; (7) commit toàn
  bộ việc dở, `reports/` vào `.gitignore`; (8) ghim chart.js 4.5.1,
  flatpickr 4.6.13, sweetalert2 11.26.25, echarts 5.6.0 (file giống byte bản cũ),
  contract chặn URL jsDelivr không có x.y.z; (9) `getDocument`/`mergeConfig`/`createChangeTracker`/
  `createSectionChangeTracker` về `support-runtime.js` (kể cả Tiền sử, chi tiết
  Khám, substance fields; `support-runtime` nạp ngay sau component context), bỏ
  `createState` thừa, `prescription-ui.js` 1461→1229
  dòng (tách `prescriptionReExam`, `prescriptionMedicineSearch`), tài liệu 30
  file. Nợ còn lại có lý do ghi tại mục Known Debt của
  `references/doctor-examination-context.md` (mergeConfig/getDocument của
  component dùng chung với Lễ tân — ngoài scope; `@media` viewport là hợp đồng
  responsive đã ghi trong navigation map, không phải nợ; override trong rule
  nhóm là composition có chủ đích).
  QA: 229 Node tests; contract Doctor/stock/print/ICD/history/tabs/brand/
  Lễ tân/medical-history; draft recovery 15 ca, quantity 8 ca; headless Chrome
  so với commit trước: 0 lệch computed style ở Doctor, Tâm lý gia, verify (có
  4 viewport với ca dày 1101 và ca thưa 1977 dựng từ DB chỉ đọc), trạng thái UI
  và payload ghi giống hệt cho tái khám, lưu/sửa khi đang lưu, hộp thoại đổi
  bệnh nhân 3 nút, xóa chỉ định 2 nút, tìm thuốc; so thẳng `69c6c9c` → HEAD
  cũng khớp cho lịch tái khám (mở/chọn/xác nhận/payload lưu), tìm ICD, tài
  liệu đính kèm (danh sách + hộp thoại xóa) và đơn thật 30 viên của ca 1136. `check_frontend_contract` và
  `check_user_feedback_contract` vẫn fail trước và sau ở file ngoài màn Bác sĩ
  (medicine-management, feedback-tokens, user-management).
  QA thật 26/09 (HEAD `ff04b1b`, backend + DB thật localhost:8000, phiên
  admin, Chrome headless 1440×900 và 700×800): queue thật trống nên danh sách
  chờ được thay bằng payload `/api/appointments/{id}/edit` thật của ca 1101
  (dày) và 435 (thưa), mọi request khác đi API thật; đã kiểm chọn ca, 5 tab,
  tài liệu đính kèm, sửa số ngày, tìm thuốc (2 dòng tồn kho thật, chọn áp dụng
  đúng), tìm ICD, hộp thoại xóa chỉ định, hộp thoại đổi bệnh nhân 3 nút, lịch
  tái khám thật, tick chất gây nghiện → đổi bệnh nhân xóa đúng; ở 700 px nút
  chuyển pane hiện, chọn ca quay về pane chính, overflow 0 mọi tab; 0 lỗi
  trang/console/HTTP. Mọi request ghi bị chặn nên không ghi dữ liệu; vòng
  Lưu/Hoàn thành thật vẫn **chưa pass visual/interactive QA**. Trang Tâm lý
  cùng thiết lập: tải/5 tab/overflow 0/cờ dirty Tiền sử + Khám đúng; phát
  hiện khoảng trống có sẵn (giống `69c6c9c`, ngoài scope, không sửa): entry
  Tâm lý không nạp `medical-history-bridge.js` nên tick chất gây nghiện không
  được xóa khi đổi bệnh nhân và không vào payload lưu; trang này cũng không
  có hộp thoại chưa lưu khi đổi bệnh nhân.

- Đơn thuốc — mốc một dòng context25/09 (tiếp): user thấy editor1130px vẫn
  xuống2 dòng dù đủ chỗ. Đo harness CSS+markup thật (Chrome153, Roboto): ba
  nhóm cần997px (Đặt lịch/Chưa hẹn) đến1039px (Đổi lịch + badge dài nhất
  “Cần kiểm tra lịch”). Hạ mốc container≤72rem xuống≤66rem (1056px); dưới mốc
  vẫn2 dòng,≤38rem/≤26rem giữ nguyên. Không đổi nút/màu/font/template/JS/API.
  QA: harness1400–420px với ba trạng thái badge — một dòng khi editor>1056px,
  hai dòng khi≤1056px, không tràn;7 Node checks, brand guard, workspace tabs
  và diff check đạt; localhost8000 phục vụ CSS mới, không lỗi console. Queue
  trống nên **chưa pass visual/interactive QA** trên hồ sơ thật.
  `check_doctor_examination_contract.py` đã được cập nhật theo layout hiện tại
  (grid max-content + mốc 66/38/26rem) trong commit `f70ea5f` ngày 25/09 và
  đang pass.

- Đơn thuốc — bố cục context25/09: sửa tại overview grid (2 nhóm max-content
  + tái khám nhận phần còn lại), nhãn max-content thay cột0.48fr gây chồng
  chữ. Select9rem đủ nhãn Theo lần/ngày, ô số ngày6rem; control cùng owner
  min-block-size2.25rem, input bên trong khung số ngày không cộng thêm min-height.
  Tái khám flex-wrap, nhãn sát cụm giá trị, ngày giờ flex11–14rem; badge không
  ép cao bằng control. Container của editor≤66rem đưa cả nhóm tái khám xuống
  hàng,≤38rem mỗi nhóm một hàng,≤26rem nhãn trên control. Bỏ override viewport
  cũ riêng cho reexam. Giữ typography13px/tooltip/palette và JS/API/save.
  QA25/09:7 Node checks (context + screen + standard form), brand guard33
  trang, workspace tabs contract và diff check đạt. Browser localhost8000
  ERR_CONNECTION_REFUSED; curl xác nhận không kết nối được. **Chưa pass
  visual/interactive QA** đơn có dữ liệu, trạng thái khóa/chưa hẹn và responsive.
  Không khởi động server/DB, không thay dữ liệu hoặc đụng môi trườngV2.

- Đơn thuốc — typography vùng thông tin23/09: nhãn cách tính liều/số ngày/
  tái khám, đơn vị, nút và badge dùng font-size-base13px; input/select dùng
  control-font-size/weight/line-height chung (13px/500/1.45). Bỏ cỡ11/12px
  riêng ở chữ vùng này, không đổi chữ bảng thuốc hoặc token toàn hệ thống.
  Theo yêu cầu tiếp theo: lý do khóa lịch không còn là subtitle; title native
  trên badge trạng thái (hover “Không đến” để xem), cập nhật/xóa cùng status
  khi đổi bệnh nhân. ReExamHint chỉ giữ lỗi thật/cảnh báo thiếu ngày cần xử lý,
  không hiển thị lý do khóa; không đổi API/quyền khóa lịch hay save.
  QA:2 contract mới +2 bộ prescription screen/standard form đạt, brand guard
  và workspace tabs contract đạt. IAB8000 có phiên admin nhưng queue trống;
  tìm HS00289 chỉ mở modal lịch sử, chưa render đúng editor có lịch khóa như
  ảnh. Tooltip: thêm unit test chạy hàm sync thực, kiểm locked/error/clear
  không giữ tooltip hồ sơ cũ;5 kiểm tra gồm regression đạt, JS syntax đạt.
  IAB vẫn queue trống. **Chưa pass visual/interactive QA** hover trạng thái
  này trên hồ sơ thật. Không lưu hồ sơ.

- Login — làm rõ icon23/09: “dẹp” user chỉ hai hình người dùng/ổ khóa ở
  đầu input, không phải tỷ lệ nút/form. Đo ô chứa vuông không chứng minh hình
  vẽ bên trong cân đối. Đã thay đúng2 glyph bi-person/bi-lock bằng inline SVG
  viewBox24×24: thân người cao hơn, thân khóa rộng hơn, cùng nét1.75/currentColor.
  Giữ slot20px, không sửa CSS/bố cục/nút/input/auth. Icon mắt/mũi tên giữ nguyên.
  QA IAB8000 desktop1497×722 và mobile390×667 đã quan sát hình thật, nhập liệu,
  focus/toggle;8 Node tests đạt. Chưa xác nhận thẩm mỹ với user/Firefox.

- Login — cleanup23/09 thay các bản vá tỷ lệ trước: CSS mobile-first với
  hai breakpoint bố cục, không override kích thước control theo chiều cao.
  Trace owner: wrapper grid min100dvh → cột form flex → box/footer không co
  → form grid → input grid3 cột. Form/footer chung tối đa28rem; desktop55/45,
  mobile một cột, mobile thấp≤44rem ẩn ảnh trang trí. Không khóa overflow.
  Template bỏ Bootstrap form/alert utility và JS bundle không dùng;
  `.login-input-wrap` sở hữu viền/focus/kích thước thay `.form-control`.
  Icon nằm trong ô vuông20px (nút24px), line-height1, không absolute/translate
  hoặc flex-shrink. Bỏ fallback màu nút cũ; giữ semantic execute và palette chung.
  `login.js` cập nhật label/icon/aria-busy trên DOM sẵn có, không dựng lại HTML
  nút; spinner có reduced-motion, toggle có aria-pressed. Auth/API/token và
  điều hướng theo vai trò giữ nguyên. Input thực56px, nút61px; khác64.8px cũ
  do bỏ line-height icon thừa, không phải scale hay giảm padding theo viewport.
  Chỉ dọn login, không cleanup FE toàn app hoặc thay logic ghi nhớ đăng nhập.

- Token và áp dụng nút23/09 (side conversation, user đã duyệt tích hợp):
  `shared/color-tokens.css` + `shared/button-actions.css`, nạp qua brand partial.
  `data-qlpk-button`: execute/nâu, view/xanh, edit/cam, danger/đỏ, neutral/xám;
  variant solid/soft, hover/active/focus/disabled chung.346 khai báo tĩnh tại73
  file + renderer icon/queue/người đi cùng và DOM thuốc/phím tắt. Màu legacy
  loại trừ nút đã migrate, geometry giữ owner cũ; không đổi handler/API/DB.
  Bổ sung giá đã chuyển cam; badge trạng thái DAV/tab/phân trang giữ nguyên.
  Contract: `references/ui/brand-theme.md`.194 Node tests đạt, JS syntax đạt,
  brand guard33 trang đạt. Browser8000: kho49 thuốc, Zopinox2 lần nhập, badge
  cam mở/Hủy; focus Lịch sử trắng trên xanh với ring2px; hover Sửa ICD chữ/icon
  trắng trên cam; bảng Tài khoản/ICD có dữ liệu, form tài khoản Lưu/Hủy;
  form thêm thuốc disabled xám, không gradient/opacity. Lịch hẹn kiểm computed
  toolbar/form thêm; chưa kiểm form chỉnh sửa lịch có dữ liệu, screenshot
  form thêm bắt lúc transition nên không dùng để kết luận layout.
  Bác sĩ queue rỗng: chưa pass visual/interactive QA luồng khám có bệnh nhân;
  chưa QA đầy đủ mọi trang/modal, mobile, loading, held-active. Không ghi dữ
  liệu, không lưu giá/thuốc/tài khoản/lịch hẹn, không deploy/V2.

- Thông báo thiếu thuốc23/09: backend thêm `shortage` trong lỗi lưu đơn
  (tên/đơn vị, SL đang kê, tồn tổng, SL cần cấp thêm, khả dụng, SL đã cấp);
  không đổi kiểm kho/cấp hoàn/schema DB. Workspace giữ payload thay vì đè
  bằng thông báo chung. Toast hiện “Chưa lưu được đơn thuốc”, tên thuốc đậm,
  “Đang bốc …, tồn kho …” đỏ; hướng dẫn kiểm kho/bổ sung trước khi lưu.
  Nếu đơn đã cấp hoặc lô khả dụng thấp hơn tồn tổng thì nói rõ ở dòng phụ.
  Toast nhiều dòng,12 giây, có nút đóng; chuỗi dữ liệu luôn escape HTML.
  Lỗi đối soát/lô/response cũ giữ lý do backend, không giả thành thiếu SL.

- Lịch sử (đã thay bằng edit/cam trong bộ nút23/09): action **Bổ sung giá** dùng
  `badge mm-missing-price-badge`, nền đỏ semantic/chữ trắng, giữ màu khi
  hover/focus/active và có focus ring bàn phím. Vẫn là button mở form cũ;
  không dùng chung class primary/Lịch sử kê đơn, không đổi quyền hay giá.

| Khu vực | Đã triển khai | Phải giữ |
| --- | --- | --- |
| Font hành chính lễ tân | Theo doctor: text/label/meta/chip/section-title base13px; viewport48–96rem dùng sm12px. Bỏ scale fluid lễ tân. | Tiêu đề queue/intake lễ tân13px, không đổi doctor/layout/dữ liệu. Số đo fluid21/09 đã cũ. |
| Tồn kho | `stock_quantity` + đơn vị qua `getUnitDisplay`/`formatStockQuantity`, số vi-VN: `140,5 viên`, `100 gói`. | Không chia hộp/lọ hoặc thêm chữ “tồn”; giữ đỏ khi hết hàng, giữ quy đổi form nhập. |
| Lịch sử nhập | Cả9 tiêu đề center; giá trị Thuốc/Số lô left,7 cột còn lại center. | Độ rộng, cuộn, phân trang, dữ liệu và nút lịch sử không đổi. |
| Bảng Nhập kho | Center7 tiêu đề Tên thuốc→Thành tiền; tách tiêu đề Thành tiền khỏi rule right. | Các ô nhập và giá trị bên dưới không đổi căn lề. |
| Hover Nhập kho | Mọi `.btn-outline-primary` trong `#importBatchModal` dùng chữ/icon trắng trên gradient ở hover/focus-visible/active. Chỉ transition border/shadow, không transition chữ. | Bao gồm Chọn, Thêm thuốc, Hủy, Lịch sử kê đơn; secondary phân trang và disabled giữ nguyên. Không vá riêng một nút. |
| Modal DAV — layout | Grid hai khối1/2 stretch, bằng chiều cao theo nội dung khi cùng hàng; mobile vẫn xếp dọc. | Không fixed height; giữ tiêu đề modal/mục1/2/3, bảng đối chiếu và dấu khác biệt. |
| Modal DAV — chữ đã bỏ | Legend dưới bảng; ghi chú không đổi kho/lô/giá; gợi ý “Chọn đúng thuốc theo thông tin trên bao bì”; dòng đếm thay đổi. Preview link/change được phép không hiện dòng nhắc đối chiếu phía trên bảng. | Giữ lỗi tải/lưu, message chặn `can_apply`, hướng dẫn khi chưa chọn, cảnh báo DAV thiếu trường sẽ xóa giá trị hiện tại. `changedCount` vẫn phục vụ phân loại hành động. |

### Nền nghiệp vụ không được làm mất

- Mỗi batch ID là một lần nhập/tồn đầu; nhiều ID có thể cùng số lô.
  Lịch sử kê đơn mở modal riêng theo batch ID, không gom theo chuỗi số lô.
- `medicine_transactions.balance_after`: tồn lô/lần nhập sau giao dịch;
  `stock_balance_after`: tồn tổng tại thời điểm đó. Không dùng tồn hiện tại
  thay snapshot; dữ liệu thiếu hiển thị chưa ghi nhận, không tự backfill.
- Cảnh báo tồn lô lớn hơn tồn tổng do backend xét khi có cả hai snapshot;
  frontend không tự sửa dữ liệu. Cấp là âm/trừ, hoàn là dương/cộng.
- Modal lịch sử có tìm bệnh nhân/lọc loại/phân trang server, không hiện
  ID lượt khám. Doctor bỏ riêng disclosure “Tồn sau từng giao dịch”, vẫn
  giữ “Tồn tổng hiện tại”, tên lô và “Đã cấp”; dữ liệu truy vết không xóa.
- Lưu đơn là thời điểm cấp/hoàn theo contract hiện có. Các sửa UI này không
  đổi logic lưu, không chứng minh toàn nghiệp vụ thuốc đã hoàn chỉnh.
- Yêu cầu một lần bốc lấy từ một số lô trên bao bì được tài liệu nghiệp vụ
  ghi là chưa triển khai (FEFO có thể cấp nhiều số lô). Không xử lý ở chuỗi
  UI này; phải trace lại trước khi tuyên bố hệ thống đã đáp ứng.

### Code owner và test

| Phần | Đường dẫn trong repo |
| --- | --- |
| Typography | `app/static/css/pages/receptionist-new.css`, `app/static/css/pages/doctor-examination.css`, `app/static/css/shared/typography.css` |
| Intake chung | `app/static/css/components/patient-info-form.css`, `app/static/css/components/patient-visit-info-form.css` |
| Tủ thuốc/Nhập kho | `app/templates/medicine-management.html`, `app/static/css/pages/medicine-management.css`, `app/static/js/medicine-management.js` |
| Brand hover | `app/static/css/shared/bootstrap-brand.css`, `app/static/css/shared/color-tokens.css` |
| DAV | `app/static/js/medicines/reference-review.js`, backend `app/modules/medicines/services/reference_review.py`, `app/modules/medicines/services/catalog_service.py` |
| Regression | `tests/receptionist_appointment_time_layout.test.js`, `tests/medicine_stock_display.test.js`, `tests/medicine_warning_tooltip.test.js`, `tests/medicine_import_layout.test.js`, `tests/medicine_import_ledger.test.js`, `tests/medicine_reference_review.test.js` |

### QA có bằng chứng và giới hạn

- Login cleanup23/09:7 Node tests đạt (4 layout contract +3 UI/auth stub),
  JS syntax, brand guard33 trang và workspace tabs contract đạt. IAB thật
  localhost8000:1497×722 thường/đã điền/lỗi;1366×600,769×600,390×667,
  390×844,320×568 có lỗi xác thực thật từ tài khoản giả đều không cuộn trang.
  Đã nhìn ảnh và đo input56px/nút61px, icon20×20/24×24, pseudo-font đúng
  bootstrap-icons, line-height bằng cỡ icon và không transform ở trạng thái
  thường. Toggle/checkbox/Tab focus/lỗi hiện và nút phục hồi hoạt động;
  console không ghi error/warn.390×350 cho cuộn tự nhiên, không co control.
  Pass visual/interactive cho các trạng thái đã kiểm; loading/điều hướng
  thành công kiểm bằng unit stub, chưa QA đăng nhập thành công end-to-end,
  Firefox/zoom/bàn phím điện thoại thật. Không suy ra user đã chấp nhận thẩm mỹ.
  Thay thế kết quả login cũ ở mục này; không đổi phiên hoặc dữ liệu nghiệp vụ.

- Thông báo thiếu thuốc23/09:6 kiểm tra Node (gồm regression mặc định khám),
  3 Python không ghi DB và syntax đạt. Kiểm component riêng trên browser
  localhost1280px: nội dung đúng, chữ số đỏ RGB220/38/38, nhiều dòng không
  cắt, đóng được; đã xóa trang QA tạm. Phiên browser Admin có queue trống,
  **chưa pass visual/interactive QA** luồng lưu đơn thật, mobile/iframe.
  Không bấm lưu hồ sơ hay đổi tồn kho để tái tạo ảnh của user.

- Badge Bổ sung giá23/09: syntax JS và35 test layout+ledger đạt. Browser
  localhost8000 kiểm Zopinox2 lô và bảng tổng49 lô/5 trang (trang đầu);
  chữ trắng trên đỏ `rgb(220,38,38)`, hover/focus giữ màu, mở form và Hủy
  trả badge đúng; console không lỗi. Không lưu giá/nhập kho. Active kiểm
  bằng CSS regression, chưa kiểm giữ chuột hoặc mobile.

Tổng hợp từ các lượt trong task; không phải chạy lại ở lượt ghi tài liệu.
Không cộng test chồng lặp thành tổng “toàn hệ thống pass”.

| Phần | Đã kiểm | Chưa kiểm / không được kết luận |
| --- | --- | --- |
| Font | Form trống và Hà Kim Ngọc Hà;12px tại1280px,13px tại1920px; không tràn ngang panel;5 test đạt. | Doctor đối chiếu là form ẩn; chưa visual cạnh nhau hai lượt khám thật, chưa mobile/Firefox/zoom sau sửa. |
| Tồn kho | Danh sách10 thuốc, lọc Diazepam140,5 và0 viên; syntax+6 test đạt, test có gói. | Chưa visual thuốc đơn vị gói trong DB. |
| Căn lề lịch sử nhập | Dòng Zopinox:9 header center,2 giá trị left/7 center;15 test đạt. | Thử xóa search vẫn chỉ hiện1 dòng, chưa pass dense QA. |
| Header Nhập kho | Form mở thật,7 header center; ô số/giá trị giữ right;32 test layout+ledger đạt. | Chưa nhiều dòng đã điền dữ liệu. |
| Hover | Chọn/Thêm thuốc/Hủy thực tế chữ/icon trắng ngay; keyboard focus Chọn trắng;32 test đạt. | Active kiểm bằng CSS test, chưa giữ chuột; chưa rà toàn app. |
| DAV | Zopinox preview5 khác biệt; Diazepam preview3 khác biệt với bảng5 dòng. Hai dòng mới yêu cầu bỏ không còn. Hai khối Diazepam cùng khoảng140,3px; Giữ liên kết hiện tại về đúng dữ liệu cũ;18 test đạt. | Chưa mobile/chuỗi rất dài/mọi kích thước, không lưu đổi liên kết thật. |

- Console không có lỗi ở các bước kiểm cuối đã báo. Chỉ pass cho state
  đã kiểm, chưa pass visual/interactive QA toàn workflow.
- DAV163,7px là số đo lượt trước khi bỏ thêm gợi ý;140,3px là ca cuối.
  Cả hai không phải chiều cao cố định cần ghi vào CSS.
- Lỗi hover có3 nút tái hiện chắc chắn, không đồng nghĩa toàn app chỉ còn3.

### Cách tiếp tục

- Cập nhật quyết định, owner, QA và giới hạn trực tiếp tại đây; đánh dấu
  thay thế quyết định cũ. Không thêm nhật ký trùng vào từng module.
- `CONTEXT.md`, router và module chỉ dẫn đến mục chung này. Tài liệu dữ
  liệu/kiến trúc/nghiệp vụ chuyên sâu vẫn giữ vai trò riêng, không sao chép
  toàn bộ cây tài liệu vào một file.
- Các khoảng trống QA là thông tin bàn giao, không phải quyền tự sửa
  ngoài scope. Lượt hợp nhất context chỉ sửa tài liệu, không chạy ghi DB.

### Bổ sung giá nhập còn thiếu tại Tủ thuốc (2026-09-22)

- Thay KPI Lần nhập/tồn đầu bằng Thuốc thiếu giá nhập; click lọc toàn bộ,
  xóa search cũ, về trang1, click lại bỏ lọc. Đếm thuốc có bất kỳ lô NULL,
  kể cả hết tồn: local hiện27 thuốc, khác25 thuốc có lô thiếu giá còn tồn.
- Lịch sử nhập giữ modal/cột hiện hữu; NULL và có quyền menu mới hiện
  Bổ sung giá, form inline Lưu/Hủy; giá0 không thiếu. API kiểm quyền menu,
  khóa medicine→batch, chặn ghi đè, journal adjustment quantity0 nguyên tử.
- Không thêm bảng, không sửa tồn, giá bán hoặc snapshot giao dịch cũ.
- 51 Python rollback tests +17 JS tests đạt. Browser8000 dữ liệu thật:
  KPI/filter27, xóa keyword, Zopinox2 lô chỉ lô thiếu có nút, mở form/Hủy,
  screenshot ở viewport hiện tại; sửa form tràn ô rồi xem lại.
- Chưa pass visual/interactive QA trọn luồng: chưa lưu giá lên lô thật vì
  không có giá chứng từ được duyệt, chưa mobile/dense modal hoặc hai phiên
  đồng thời. Quyền non-admin, giá0, invalid, ghi đè và rollback đã test API.
  Không tạo giao dịch bổ sung giá thật; không chạm v2/SSH.

### In → tab PDF, không tự in (2026-09-21)

- Shared QLPKPdfPreview + endpoint authenticated + worker Chromium riêng;
  giữ mẫu in, đổi callers đơn thuốc, modal lịch sử, legacy và hóa đơn.
  Bỏ auto-print/auto-close và script render print cũ; assets PDF vendor local.
- Sửa binding print trong modal khi document được scope theo vùng bác sĩ.
-16 Python +4 Node PDF tests đạt; followup print và modal contract đạt.
  Browser localhost HS00293: cả4 nút toa/dịch vụ/BS/TLG đạt state ready,
  không console error. PDF fixture render kiểm A4/tiếng Việt và test2trang.
- Chưa pass visual/interactive QA toàn bộ: IAB không liệt kê tab popup PDF,
  chưa quan sát PDF hồ sơ thật/QR trong viewer, chưa thử Ctrl+P và hóa đơn
  tại màn thanh toán. Không ghi hồ sơ, không deploy/V2.

### Thu gọn đầu modal lịch sử lô (2026-09-21)

- Theo user, bỏ khối tên thuốc/lô/ngày nhập cùng JS/CSS riêng; không đổi
  lọc batch_id. 35 JS tests đạt; browser8000 kiểm5 dòng/lọc hoàn1 dòng,
  không còn khối hoặc khoảng trống, console không lỗi. Không sửa dữ liệu.

### Lịch sử khám: một vạch chọn; bỏ lịch sử riêng Chỉ định (2026-09-21)

- Bỏ vạch mặc định theo trạng thái khám; chỉ click mới có một vạch primary.
  Default preview, nhãn trạng thái và dữ liệu giữ nguyên. Bỏ UI và code
  lịch sử riêng của Tạo chỉ định shared Doctor/Tâm lý gia, giữ API/backend.
- Ba Node regression tests, indications date/realtime tests, JS syntax và
  patient-history modal contract đạt. Browser localhost8000 trên HS00293
  có hai lượt khám: mở không vạch, click qua lại đúng một vạch nâu, mở lại
  reset không vạch; preview có dữ liệu thật, console không lỗi.
- Chưa pass visual/interactive QA panel Chỉ định có dữ liệu vì hàng đợi
  khám trống; chỉ xác nhận markup nút cũ đã mất. Không tạo/sửa hồ sơ.

### Hover nút lịch sử lô (2026-09-21)

- Sửa scoped class nút mở lịch sử: gradient + chữ trắng cho hover/focus/
  active, không ảnh hưởng nút khác. 35 JS tests và brand guard đạt;
  browser thực tế hover/focus/click đạt, active được kiểm static.

### Loại primary nâu phẳng cũ toàn frontend (2026-09-21)

- User duyệt toàn bộ: token primary text/icon/viền/focus dùng brown800,
  header-start dùng109,61,39; loại RGB123,71,47 khỏi app source. Nền brand
  CSS owner dùng gradient header chung, Bootstrap layered background giữ
  tick; màu feedback/sinh hiệu/type/soft giữ nguyên. Không API/DB/V2.
-57 Python guard tests +17 Node theme/layout tests đạt; guard33 pages đạt.
  Browser lễ tân hồ sơ thật/modal người đi cùng rỗng, Abacavir edit desktop/
  mobile390, kho49 thuốc/select-all giữ tick; không màu cũ trong DOM đã quét.
- Chưa pass visual/interactive QA toàn bộ33 trang và mọi state: chưa đầy
  đủ modal có dữ liệu/hover/disabled/Firefox/zoom. Checkbox tái khám không
  đổi trạng thái khi click trong hồ sơ đã chọn; không sửa logic ngoài scope.
  Không bấm Lưu. Contract hiện hành: references/ui/brand-theme.md.

### Căn hàng control lọc lịch sử kê đơn (2026-09-21)

- Sửa CSS riêng thanh lọc: nút không còn thấp hơn input/select do btn-sm.
  34 JS tests đạt; browser localhost8000, Diazepam5 dòng/lọc hoàn1 dòng:
  bốn control cùng cao36px, cùng top/bottom, radius9px, font13px/500 tại1280.
  Không lỗi console, không đổi JS/API/dữ liệu; chưa kiểm mobile/zoom.

### Lịch sử lô: tìm kiếm và diễn giải biến động kho (2026-09-21)

- Modal tủ thuốc có tìm bệnh nhân/lọc Loại phía server, cột Loại riêng,
  signed quantity, bỏ ID nội bộ và phân biệt thiếu snapshot/thiếu liên kết.
  Cảnh báo tồn lô > tổng do backend trả; không sửa tồn hoặc backfill.
- 33 JS +18 PostgreSQL rollback tests đạt. Browser localhost8000 kiểm
  Diazepam LOT-17:5 dòng, cấp −60/hoàn +1, tìm không dấu Phạm Khôi,
  lọc kết hợp rỗng, xóa lọc, cuộn tới giao dịch cũ. Mobile và phân trang
  nhiều trang trên browser chưa QA; paging/filter có test tự động.
  Chi tiết `reports/receipt-dispensing-modal-2026-09-21/qa.md`.

### Header lễ tân và chiều cao intake dùng chung (2026-09-21)

- Đính chính và thay cách ép72px: dùng block-size:auto cho hai header lễ tân,
  shared spacing/line-height theo font, control tối thiểu2.2em nhưng không
  khóa chiều cao. Không còn công thức phụ thuộc token4.5rem trong page CSS.
  QA thật Hà Kim Ngọc Hà/Linh: hai header64.84px tại1440,68.02px tại1920,
  72.21px tại2560 sau render; giá trị tăng theo font thay vì khóa72px.
  1024/390 xuống hàng tự nhiên, không tràn header. Chọn dịch vụ Beck15 đạt.
  5 tests đạt, console không lỗi, không Lưu; chưa Firefox/browser zoom.
  Tên người khám dài vẫn có thể cắt ngang trong native select ở1440;
  không thay control hay mở rộng scope trong sửa chiều cao này.

- Header lễ tân giữ title/actions và schedule thành hai hàng từ container36rem;
  bỏ nhánh78rem ghép một hàng. Mobile vẫn xếp field dọc khi thiếu chỗ.
- Chuyển quy tắc căn đều hai card từ doctor CSS về patient-info-form CSS,
  chỉ bật khi intake có hai cột từ60rem. Sinh hiệu dùng grid-auto-rows theo
  số hàng thực tế, không fixed height hay JS đo kích thước.
- 4 Node regression tests và scoped diff check đạt. Browser localhost8000
  kiểm hồ sơ Hà Kim Ngọc Hà/Linh, dữ liệu hỏi bệnh dài, người khám tên dài và
  chọn dịch vụ Beck15 trên form, không Lưu. Hai card bằng chiều cao tại
  1440/1600/1920/2560;1024/390 xếp dọc tự nhiên, header không tràn ngang.
  Screenshot desktop/mobile, giờ18:45/14:00 đầy đủ; console không lỗi.
- Chưa pass visual/interactive QA hồi quy màn bác sĩ: admin không có lịch
  chờ khám, workspace chưa chọn lịch hẹn. Không tạo lượt/đổi quyền để vượt
  chặn. Chưa kiểm Firefox/browser zoom. Đã đóng tab QA và reset viewport;
  không đổi API, DB, clinical save hoặc môi trường V2.

### Snapshot tồn tổng theo giao dịch (2026-09-20)

- Đã thêm đúng một cột nullable `medicine_transactions.stock_balance_after`,
  migration cùng tên đã áp dụng trên `qlpk_db` sau backup0600. Không backfill,
  sửa tồn/dữ liệu cũ hoặc đụng V2. App8000 tự reload code qua dev reloader.
- Nhập/cấp/hoàn chia theo nguồn/đổi giá ghi tồn tổng tuần tự; tồn lô dùng
  `balance_after`. Editor/lịch sử/thống kê tách hiện tại khỏi lịch sử.
- 46 Python rollback +4 JS checks đạt; browser thống kê8000 kiểm thật12 dòng
  và lọc1 dòng. Đọc backend lượt1067/1101 trả tồn lô538/598, tồn tổng cũ null.
- Chưa pass visual/interactive QA editor/modal lịch sử đơn: admin queue trống,
  chức năng xem workspace lịch sử báo chưa có lượt khám hiện tại. Không sửa
  quyền/lượt khám để vượt chặn. Báo cáo `reports/stock-balance-snapshot-2026-09-20/qa.md`.

### Truy vết tiền thuốc theo lượt khám (2026-09-20)

- **QA admin bổ sung trên8000/qlpk_db:** user cấp đăng nhập admin; đổi giá
  bằng UI6.000→7.000→6.000; save qua API thật trên hai lượt QA1242/1410.
  Exidamin/LOT-08 vốn1.800 giữ riêng giá6.000/7.000; Diazepam/LOT-17 vốn
  2.500 bán8.500. Đổi giá đơn7.500 tạo quantity0/+1.000 và hoàn−7.500 nối
  export gốc. UI tổng34.500/9.700/24.800 đúng trước hoàn; cuối0/0/0,11
  movements giữ lại, tồn/giá về baseline. Không sửa code/V2/quyền/nhập lô.
  Chưa browser modal QA dưới admin (queue rỗng), chưa một thuốc chia hai
  lô trên local; kho cũ lệch tồn tổng/lô nên không ép QA bằng sửa số liệu.
  Chi tiết/bằng chứng và giới hạn tại `reports/medicine-visit-ledger-2026-09-20/qa-local-8000.md`.

- **QA ghi thật8000 đã thực hiện sau user cho phép:** hồ sơ QA có sẵn317,
  lượt1242; Exidamin7436/lô41 LOT-08, vốn1.800/bán6.000. UI Lưu cấp2 viên,
  lưu lặp, hoàn1, chặn9999 viên, reload, hoàn hết và lưu rỗng đều đạt;
  ledger3671–3673 giữ đủ snapshot/return origin, ròng0, tồn834/lô2490 về
  baseline. Thống kê thực12.000/3.600/8.400 rồi0/0/0. Giữ nhật ký QA.
  Chưa kiểm đổi giá vì doctor24 không có quyền Tủ thuốc; chưa ca hai lô.
  Không sửa code/quyền/danh mục/V2. Chi tiết `reports/medicine-visit-ledger-2026-09-20/qa-local-8000.md`.

- **Đính chính runtime đích theo user:8000/qlpk_pro/qlpk_db; V2/8001 là
  môi trường song song, không được thao tác.** Báo cáo V2 bên dưới là lần
  kiểm nhầm, không phải tiêu chí nghiệm thu bản mới. Đã khởi động8000 khi
  không có listener, health200/ledger401. Đọc thực lượt1101/913 đạt21/6
  giao dịch, phân trang/unknown values đạt. User đã đăng nhập8000; browser
  kiểm thống kê2698 dòng/54 trang theo01/01–20/09, tìm rỗng/Excel guard,
  lịch sử HS00085 ngày01/06 (5 giao dịch) và18/05 (8 giao dịch) đạt phần đọc.
  Đổi về HS00267 clear lịch sử đúng; không ghi đơn/tồn. Chưa QA Lưu cấp–hoàn
  và snapshot giá mới trên DB thật. Xem `reports/medicine-visit-ledger-2026-09-20/qa-local-8000.md`.

- **QA runtime người dùng hiện tại: CHƯA ĐẠT.** Listener 8001 PID56486 chạy
  `qlpk_pro_v2`, DB `qlpk_pro_v2_prod_20260908_195947`, không phải workspace
  này/`qlpk_db`. Ledger API 404; schema chỉ 9 cột cũ. Lượt thật1758 ngày
  08/09 có4 thuốc/680.000đ nhưng8 export không lô, price=0. Chỉ đọc/đối chiếu,
  chưa sửa runtime V2. Báo cáo `reports/medicine-visit-ledger-2026-09-20/qa-current-local.md`.
  PASS QA riêng dưới đây không được coi là PASS môi trường V2 hiện tại.

- QA bổ sung sau yêu cầu “QA đi”: đã pass thao tác cấp/hoàn/đổi giá bằng
  nút Lưu, hai lượt khám, hoàn hết còn lịch sử, modal 4/29 dòng ở 1600/1024,
  reload, thiếu kho không ghi một phần, thống kê 54 dòng/2 trang tổng đúng.
  Dùng app thật đăng nhập QA và DB schema-only riêng; không sửa bệnh án thật.
  55 Python +31 JS chạy lại đạt. Không cần sửa code ứng dụng.
  Báo cáo mới `reports/medicine-visit-ledger-2026-09-20/qa-interactive.md`
  thay trạng thái chưa QA toàn luồng của báo cáo triển khai ban đầu bên dưới.

- Scope user duyệt: Lưu là cấp/hoàn; không thêm bảng. Đã thêm đúng 5 cột
  vào `medicine_transactions`: appointment/operation/sale price/origin/amount delta.
- Snapshot từng lần nhập/lô/giá vốn/giá bán; hoàn nối dòng cấp gốc, đổi giá
  append dòng SL=0, lưu lặp không nhân đôi. Không suy giá/lô cho dữ liệu cũ.
- `ledger_service.py` tích hợp stock/save cùng transaction; `ledger_report.py`
  là nguồn báo cáo giao dịch theo ngày phát sinh. Lịch sử vẫn còn khi hoàn hết.
  UI đọc thêm bảng cấp/hoàn; thống kê có mục Giao dịch cấp/hoàn riêng, không
  trộn tổng đơn hiện tại/thực thu. Không sửa thanh toán hoặc deploy SSH.
- Migration local `20260920_medicine_visit_ledger` đã áp dụng sau pg_dump 0600;
  schema/Alembic/guard đạt. 55 Python +31 JS đạt; 8 ca concurrency/stock đạt
  và đã dọn dữ liệu QA. Browser headless không chạm màn hình người dùng:
  dữ liệu thật 50 dòng, trang 2, tìm kiếm rỗng, ẩn đúng cards đơn hiện tại.
- Chưa pass visual/interactive QA toàn luồng: chưa kiểm lưu mới/cấp–hoàn
  từ UI bác sĩ và modal lịch sử đủ giá ở trạng thái ít/nhiều dòng.
  Browser dùng harness read-only local, không phải phiên app đăng nhập đầy đủ.
- Giới hạn: dữ liệu cũ thiếu truy vết; tên/đơn vị còn đọc danh mục hiện tại;
  chưa xuất Excel sổ giao dịch; chưa đối soát thực thu. Quy tắc chỉ một số lô
  đã nêu ngày 12/09 chưa triển khai, giữ FEFO nhiều lô như trước.
- Báo cáo chi tiết: `reports/medicine-visit-ledger-2026-09-20/report.md`.

### Tủ thuốc dùng nền chủ đạo chuyển sắc của header (2026-09-19)

- User duyệt sửa Tủ thuốc theo đúng nền header Bác sĩ, không coi nâu
  phẳng là kiểu chủ đạo tương đương. Chuyển token nền header hiện hữu
  về color-tokens để Tủ thuốc dùng được mà không phụ thuộc CSS queue.
- CSS trang dùng nguồn chung cho nút chính, badge Lần nhập, trang/checkbox
  được chọn và header Nhập kho; giữ secondary, DAV/cảnh báo, nền bảng,
  bố cục, JS và dữ liệu. Bỏ background phẳng ở nút Lưu và hover của badge.
- QA: 32 JS tests toolbar/import/price/Doctor + 48 Python tests màu đạt;
  brand guard và diff check đạt. Browser mẫu cô lập nạp Bootstrap/CSS thật
  xác nhận cùng gradient123/71/47→75/39/25 cho primary, badge, phân trang,
  checkbox và header nhập; hover/active/disabled giữ chữ trắng, Hủy/DAV
  giữ vai trò. Nút giá bỏ palette riêng để không có chữ xanh trên nền nâu.
- Browser workflow thật chuyển về đăng nhập; không thao tác cửa sổ user
  hoặc luồng chính. **Chưa pass visual/interactive QA** với dữ liệu thật.
  FE contract tổng còn lỗi có sẵn `medicine-management.js:1089` chuyển
  thông báo thô ra UI; không sửa ngoài scope. Đã đóng tab/server QA riêng.

### Viền xanh cho badge DAV đã xác nhận (2026-09-19)

- User yêu cầu đổi viền badge trắng/chữ xanh đang nhận màu nâu. CSS trang
  dùng biến thể success cho màu viền thường và hover/focus, kể cả outline.
  Giữ nền trắng, badge Lần nhập và các trạng thái DAV khác; không sửa JS/API.
- 21 JS tests toolbar/reference-review và brand guard đạt; diff check đạt.
  Tab QA riêng bị chuyển tới đăng nhập, đã đóng, không thao tác cửa sổ của
  user/main thread. **Chưa pass visual/interactive QA** trên dữ liệu thật.

### Hai card khám không chồng viền nhấn lên tiêu đề màu (2026-09-19)

- User duyệt giữ nền tiêu đề Khám & xử trí / Khám chi tiết, bỏ riêng viền
  trái nhấn màu; bốn cạnh dùng viền trung tính mảnh của shared visit card.
- Owner: `patient-visit-info-form.css` thêm biến thể neutral-border;
  `doctor-clinical-workspace.html` chỉ chọn biến thể cho đúng hai card.
  Hành chính/Hỏi bệnh/Người thân/Tệp đính kèm, Lễ tân và Tâm lý gia giữ nguyên.
  Không đổi layout, token màu, JS, API hoặc lưu dữ liệu.
- QA: 9 JS tests viền/default/header/typography đạt; brand guard đạt.
  Đã nhận diện đúng Firefox `index.html` với workspace Bác sĩ có dữ liệu,
  nhưng native control theo cửa sổ active, đổi sang cửa sổ màn hình phụ
  khi user đang sử dụng. Dừng điều khiển để không làm gián đoạn user;
  browser nhúng riêng thiếu phiên đăng nhập. Chưa kiểm được hai card sau
  sửa trên dữ liệu thật: **chưa pass visual/interactive QA**.

### Màu chủ đạo thống nhất theo nâu sáng header (2026-09-19)

- User chốt màu chủ đạo là `#7b472f`, yêu cầu thay nâu đậm trên các khối
  và tuyên bố rõ trong source. Đã đặt một nguồn `--qlpk-brand-primary`
  cùng RGB123/71/47 ở color-tokens; primary, strong, Doctor, header-light
  cùng nguồn. CONTEXT, working-rules và brand-theme ghi quy ước hiện hành.
- Gỡ palette riêng ở Doctor, clinic-workspace, modal/toolbar Tủ thuốc.
  Rà và chuyển nền/viền nhấn của component chung, nút header, tab mobile,
  modal, lịch hẹn, chỉ định, Tủ thuốc, trang thống kê, lịch bận, khảo sát,
  đăng nhập và trang thông tin sang primary; không ghi mã màu riêng.
  Viền trái vẫn giữ nguyên độ dày. Không thay layout hoặc dữ liệu/save.
- Giữ header chuyển sắc như mẫu user chốt; điểm cuối tối không phải primary.
  Giữ palette chữ, màu nội dung, đường kẻ/bóng trung tính và màu nghiệp vụ.
  Sửa luôn việc dùng gradient làm màu chữ/viền trong lịch sử đơn thuốc:
  phần nền giữ gradient, chữ/viền nhấn dùng primary dạng màu đơn hợp lệ.
- Guard khóa nguồn/alias primary, cấm per-page override, chặn các token
  và literal nâu đậm cũ ở nền/viền/brand aliases; có ngoại lệ header/chữ/
  màu trạng thái. 48 Python tests màu + 137 JS tests đạt, brand guard đạt.
  Frontend contract tổng còn lỗi có sẵn ở medicine-management.js:1089
  (thông báo lỗi thô), không sửa ngoài scope.
- Browser cô lập nạp CSS thật/Bootstrap: viền Doctor/Lễ tân, nút toolbar,
  nút nhập kho, badge lần nhập, checkbox, tab chọn và mobile switch đều
  rgb(123,71,47). Header giữ gradient123/71/47 →75/39/25; chữ nội dung
  giữ53/40/33; semantic đỏ/xanh/vàng không bị primary thay thế. Màn390px
  có keyboard focus vòng primary, độ tương phản trắng/primary7.54:1.
  Fixture chỉ đối chiếu màu, không nghiệm thu layout của workflow thật.
- Mở localhost:8000/login.html bị từ chối kết nối, không khởi động lại app
  hay đụng Firefox. **Chưa pass visual/interactive QA** trên các màn có dữ
  liệu thật. Đã đóng tab fixture, reset viewport và dừng server18769;
  tab lỗi tự sinh bị browser policy chặn khi lấy handle để đóng.

### Kho thuốc: bỏ lớp tiêu đề che đầu dòng (2026-09-19)

- User duyệt sửa cả bảng nhà cung cấp và bảng nhập kho. Root cause:
  `.mm-sticky-head th` có bóng nền kéo xuống 8px và `::after` kéo thêm
  10px dưới ô, che phần trên hàng đầu. Bỏ cả hai lớp sơn tràn; chỉ giữ
  viền inset. Giữ sticky/top, màu, padding, chiều rộng cột và dữ liệu.
- Thêm regression test bảo vệ cả hai bảng dùng chung header, không có
  pseudo-element và không có bóng đổ ngoài ô. Kiểm đầu lượt: 19 Node tests
  và brand guard đạt. Kiểm cuối: 5/5 test nhà cung cấp/status đạt, 18/19
  khi ghép nhập kho; test palette nhập kho và brand guard không đạt do
  các khai báo màu đã đổi trong lúc làm. Lát này không sửa token màu;
  không can thiệp thay đổi đồng thời đó. Diff không lỗi whitespace.
- Đã chuẩn bị fixture đọc template/CSS/renderer thật, địa chỉ đúng mẫu
  user và các dòng thuốc giả để kiểm hàng đầu/cuộn. Browser ẩn hai lần
  không khởi tạo được webview, nên chưa quan sát fixture hoặc luồng thật.
  **Chưa pass visual/interactive QA**; không ghi database hoặc khởi động
  lại app. Server fixture đã dừng sau kiểm tra.

### Liên kết DAV: bỏ khối nhận diện bổ sung (2026-09-19)

- User duyệt bỏ khối “Thông tin nhận diện thuốc DAV đã chọn” bên dưới
  bảng. Xóa markup, helper render, reset DOM và CSS riêng của khối này;
  không để container rỗng. Giữ tìm/chọn, bảng so sánh, cảnh báo và lưu.
- Không đổi API, payload hoặc dữ liệu nguồn; thêm kiểm tra không còn
  selector/reference của khối đã bỏ. Toàn bộ 130 JS tests, syntax và
  diff check đạt. Tab browser riêng vẫn chuyển tới login, đã đóng:
  **chưa pass visual/interactive QA** trên phiên có dữ liệu thật.

### Liên kết DAV: trình bày theo thao tác ghép thuốc (2026-09-19)

- User duyệt tổ chức lại modal thành ba bước: thuốc cần ghép, tìm/chọn DAV,
  đối chiếu rồi liên kết. Hai khối đầu gọn cạnh nhau trên desktop, xếp dọc
  khi màn hẹp; giữ giới hạn chiều cao và một vùng cuộn ở thân modal.
- Thông tin thuốc trong kho lấy `current`; bảng thay đổi lấy `rows` từ API,
  không dùng snapshot lịch sử làm hiện trạng. Hiện số trường thay đổi và
  cảnh báo giá trị đang có sẽ bị để trống khi nguồn DAV thiếu trường đó.
- Trạng thái liên kết đang lưu tách khỏi ứng viên mới. Không thêm checkbox,
  không đổi endpoint/payload, quyền, quy tắc lưu, tồn kho, lô hoặc giá.
- QA: 11 test riêng cho review và toàn bộ 130 JS tests đạt; syntax/diff
  check đạt. Tab browser riêng chuyển tới login, đã đóng; không có phiên
  đăng nhập để kiểm dữ liệu thật và thao tác chọn/lưu: **chưa pass
  visual/interactive QA**. Không reload hoặc thao tác cửa sổ của user.

### Khôi phục viền trái Bác sĩ theo chuẩn chung (2026-09-19)

- Theo yêu cầu mới của user, thay thế quyết định bỏ dải viền ở mục cũ
  bên dưới: gỡ ngoại lệ viền mảnh Doctor và cấu hình riêng không còn
  sử dụng ở ba component chung. Sáu khung Bác sĩ dùng lại viền trái
  0.1875rem theo accent/primary chung như Lễ tân, không thêm mã màu.
- Không đổi layout, header, typography Khám chi tiết, JS hay dữ liệu.
  Cập nhật brand-theme và test để chặn tái xuất hiện ngoại lệ này.
- QA: 8 JS tests liên quan và brand guard đạt. Browser cô lập kiểm
  sáu khung Bác sĩ/bốn khung Lễ tân: viền trái đều 3px và màu primary
  rgb(75, 39, 25). Đã đóng tab và server tạm. Đây không phải màn có
  hồ sơ thật: **chưa pass visual/interactive QA** workflow đăng nhập.

### Nhà cung cấp: nhãn trạng thái một dòng (2026-09-19)

- Hiệu chỉnh theo phản hồi tiếp theo: bỏ min-width 10rem/8.5rem ở hai
  cột cuối; gộp cùng quy tắc co theo nội dung một dòng. Bỏ khóa 200px ở
  Tên/Địa chỉ để hai cột thông tin nhận phần dư của bảng. `width: 0` là
  gợi ý co trong table-auto; chiều rộng thực lấy từ nội dung, không phải
  một kích thước px/rem/percentage gán sẵn. Không đổi JS hoặc dữ liệu.
- QA hiệu chỉnh: 4 Node tests và brand guard đạt. Browser fixture dùng
  template/renderer/CSS thật ở 1920, 1200, 800, 390px; cả hai trạng thái
  không cắt chữ, nút cùng hàng. Với fixture này cột trạng thái/tác vụ
  tự tính 123.89/116.45px; bảng rỗng tự co về 68.37/46.94px theo tiêu đề.
  Không tràn ngang thân modal. Kiểm tra 35 dòng và chụp ảnh bảng có dữ
  liệu giả; lượt kiểm cuộn bị công cụ báo target unavailable, console
  có lỗi MutationObserver chưa xác định nguồn. Không coi là pass tương
  tác; **chưa pass visual/interactive QA** trên luồng thật. Các thông số
  min-width và kết quả QA bên dưới là lịch sử trước hiệu chỉnh này.

- User duyệt sửa nhãn trạng thái chung và độ rộng cột nhà cung cấp; không
  đổi API, giá trị trạng thái, luồng thêm/sửa/chọn hoặc dữ liệu database.
- `feedback-tokens.css` bỏ giới hạn chiều rộng theo ô, giữ nhãn một dòng
  và không co trong flex. Bảng nhà cung cấp dành tối thiểu 10rem cho trạng
  thái, 8.5rem cho tác vụ; căn giữa dọc, ba nút cùng hàng, cuộn trong bảng.
- Rà các nơi dùng chung: danh mục, lịch hẹn, thanh toán, khảo sát, hàng
  chờ. Hàng chờ còn quy tắc cắt nhãn riêng trong vùng tác vụ; không sửa
  layout đó trong lát nhà cung cấp và chưa nghiệm thu toàn bộ các màn này.
- QA: 22 Node tests đạt (nhà cung cấp, status chung, nhập kho và brand bác
  sĩ), JS syntax và brand check 33 trang đạt; diff không lỗi whitespace.
- Browser fixture dùng modal/renderer/CSS hiện hành: bảng rỗng, 4 dòng,
  35 dòng, 1200×850, 800×650, 390×844; hai nhãn cao 21.44px, chữ không
  bị cắt, ba nút cùng hàng. Cuộn tới dòng cuối và cuộn ngang màn hẹp đạt;
  không có console warning/error trong fixture. Không ghi dữ liệu.
- Phiên app chuyển sang màn bác sĩ sau khi mở Kho thuốc; chưa xác minh
  được modal nhà cung cấp với quyền/dữ liệu thật. **Chưa pass
  visual/interactive QA** của luồng thật và các màn dùng status chung.

### Bác sĩ: phân cấp chữ Khám chi tiết (2026-09-19)

- User duyệt nhãn trên/nội dung dưới cho toàn bộ 15 ô; bỏ 7 ngoại lệ
  nhãn ngang và các nhánh CSS cũ. Giữ hai cột desktop, một cột màn hình
  hẹp, Thần kinh toàn chiều rộng; không giãn hàng để lấp chiều cao.
- Tiêu đề nhóm đậm, nhãn vừa, nội dung regular với màu chữ đủ rõ.
  Không làm nhạt riêng “Không ghi nhận bất thường”, không suy diễn
  trạng thái lâm sàng từ chữ. Không đổi JS, mặc định, load/save hoặc API.
- Owner: doctor-examination.css và doctor-clinical-workspace.html;
  contract trình bày cập nhật trong doctor-examination-navigation.md.
  Parent vẫn là panel body cuộn → clinical grid → card theo nội dung →
  nhóm/ô; không thêm chiều cao cố định hay vùng cuộn mới.
- QA: 126 JS tests (gồm 3 kiểm tra trình bày mới) và 30 brand-source
  tests đạt; brand guard đạt. Browser fixture lấy markup/CSS thật:
  15 ô có chữ normal, regular 400/nhãn 500, nhãn nằm trên; 1280px hai
  cột, 390px một cột, không tràn ngang. Ô dài giữ đủ 3 dòng và cuộn được.
  Đây chỉ là kiểm tra kỹ thuật cô lập, không phải workflow có bệnh nhân
  thật: **chưa pass visual/interactive QA** trên màn hình đang đăng nhập.
  Đã đóng tab kiểm tra và dừng server tạm, không tác động cửa sổ Firefox.

### Tủ thuốc: sửa nghĩa hóa đơn và căn lề nhập kho (2026-09-19)

- User duyệt bỏ mã NK khỏi cột Chứng từ, trình bày Số hóa đơn thật và
  Ngày nhập riêng. UI không đọc `receipt_reference` nữa; invoice thiếu/rỗng
  hiển thị dấu gạch, không suy ra chứng từ hay lấy mã bản ghi thay thế.
- Bảng thành tám cột; loading/rỗng/lỗi cùng colspan8. Header và dữ liệu dùng
  cùng căn trái cho thuốc/lô/hóa đơn, giữa cho ngày, phải cho số lượng/giá;
  thống nhất padding/căn giữa theo chiều dọc và chữ số cùng bề rộng. Bảng
  rộng tối thiểu60rem và cuộn trong vùng bảng sẵn có; không đổi chiều cao modal.
- Bốn ô nhà cung cấp, số hóa đơn, ngày nhập, người thực hiện dùng chung cỡ
  chữ md/độ đậm regular/căn trái qua token form có sẵn. Không đổi giá trị,
  writer, quyền sửa, API hoặc dữ liệu; không sửa công việc màu của task chính.
- QA: 23 test tập trung + toàn bộ123 test JS đạt; JS syntax và HTTP asset/
  template đạt. Test ngăn mã NK quay lại khi invoice thiếu, xác nhận thứ tự
  tám cột và căn lề header/body. Browser riêng vẫn chuyển về đăng nhập, đã đóng:
  **chưa pass visual/interactive QA** với dữ liệu thật, tên/hóa đơn dài và
  màn hẹp. Không thao tác vào phiên làm việc đang mở của user.

### Bỏ dải viền nâu dọc ở các khung màn Bác sĩ (2026-09-19)

- User duyệt sau ảnh khoanh hai khối khám: lần dọn mã màu trước giữ nguyên
  giao diện nên chưa xử lý khác biệt giữa nền gradient và dải viền nâu đặc.
- Trace: shell cố định viewport → workspace/grid → section tự cuộn → lưới
  hai khối khám → shared visit card tự vẽ viền trái 0.1875rem. Không sửa
  chiều cao, grid hoặc scroll; chỉ cấu hình viền ở owner khung dùng chung.
- Thêm cấu hình viền đầu khung cho ba component owner; Doctor đặt viền
  0.0625rem cùng màu đường kẻ. Bao phủ sáu khối: Khám & xử trí, Khám chi tiết,
  Hành chính, Hỏi bệnh, Người thân, Tệp đính kèm. Màn khác giữ mặc định cũ.
  Hai tiêu đề khám tiếp tục dùng cùng gradient. Không đổi template/JS/API.
- QA: 120 JS và brand check đạt; localhost trả đúng bốn CSS mới. Browser
  kiểm mẫu sáu khung có viền trái/phải 1px cùng màu, hai header cùng gradient,
  đối chứng ngoài Doctor vẫn có dải trái 3px. Browser mở màn thật chuyển về
  login: **chưa pass visual/interactive QA** với hồ sơ thật, dữ liệu dài và
  chuyển mục. Đã đóng tab/server riêng, không reload Firefox của user.
- Ghi nhận ngoài phần khung đã duyệt: `doctor-prescription.css` còn dùng
  `--doctor-section-header-bg` cho một số chữ/viền trong lịch sử đơn thuốc.
  Alias này hiện là gradient; cần rà riêng trước khi khẳng định đồng bộ
  toàn bộ màn Bác sĩ. Chưa sửa phần lịch sử đơn trong lượt khung này.

### Đồng bộ chiều cao Ghi chú và Chi tiết lô (2026-09-19)

- Sửa riêng hàng support của modal Nhập kho: nhãn có cùng line-height và
  margin, cột căn đáy; hai ô chung height3.5rem/padding/line-height/scroll.
  Bỏ max-height riêng6rem/8rem, bỏ resize riêng của textarea. Không đổi
  header/footer, chiều cao modal, template, JS/API hoặc dữ liệu kho.
- 13 kiểm tra layout đạt, brand check đạt. Browser cô lập dùng markup thật
  và CSS hiện hành với dữ liệu mẫu rỗng/dài/nhãn xuống dòng/mobile: hai ô
  đều56px (root16px), desktop cùng top/bottom; dữ liệu dài không đẩy cao ô.
  Đã đóng tab và dừng server kiểm tra riêng, không đụng phiên user.
- Toàn bộ JS ở thời điểm kiểm:115/120 đạt;5 lỗi trong kiểm tra ledger do
  chờ7 cột nhưng renderer đang có8 cột, ngoài phạm vi hai ô và không sửa.
  **Chưa pass visual/interactive QA** toàn modal với dữ liệu thật.

### Tủ thuốc: bỏ phần mở rộng lịch sử giao dịch theo lô (2026-09-19)

- User duyệt bỏ lịch sử bốc/giao dịch khỏi Tủ thuốc, giữ lịch sử nhập và dữ
  liệu kho. Đã bỏ cột mũi tên, ba hàm mở/đóng/tải lịch sử, trạng thái dòng đang
  mở, yêu cầu `/api/medicine-transactions/` phía UI và CSS chỉ dành cho phần này.
- Bảng nhập còn bảy cột; dòng tải/rỗng/lỗi cùng bảy cột. Cả ba đường mở
  (tab Lịch sử nhập, Lần nhập, Xem hạn dùng) giữ chung một bảng, không thêm
  fallback hoặc giao diện lịch sử khác. Quét JS/template/CSS không còn dấu vết
  phần mở rộng hay lời gọi API giao dịch. Backend/API và dữ liệu không đổi.
- QA: 19 kiểm tra tập trung và toàn bộ 118 test JS đạt; JS syntax đạt.
  Localhost trả đúng JS/CSS mới và template bảng bảy cột. Test kiểm cả dữ liệu
  nhập/tồn/giá/chứng từ, lọc/phân trang, response cũ, tải/rỗng/lỗi và bấm dòng
  không tạo request lịch sử. Không sửa các thay đổi khác của task chính.
- Browser riêng chuyển về đăng nhập; đã đóng tab kiểm tra, không thao tác
  vào phiên Firefox của user. **Chưa pass visual/interactive QA** trên dữ liệu
  thật qua ba đường mở, với nhiều/ít lô và lọc/phân trang.

### Nhập kho dùng hết chiều cao khả dụng (2026-09-19)

- User duyệt modal gần sát đáy vùng làm việc, không tăng padding để lấp
  chỗ trống. Yêu cầu này thay cách ôm nội dung ít dòng của 2026-09-17.
- Chỉ chỉnh owner CSS nhập kho: dialog có height bằng viewport trừ1rem,
  content cao100%/min-height0. Bảng nhận phần cao còn lại; toolbar không co.
  Màn hẹp/thấp dùng body scroll và giữ kích thước nội dung bảng, không che
  hàng nhập hoặc footer. Header/footer/input/ghi chú không tăng padding.
- Cập nhật kiểm tra chiều cao và màn hẹp/thấp trong
  `tests/medicine_import_layout.test.js`: 12 kiểm tra đạt. Không đổi
  template, JS/API, dữ liệu nhập kho hoặc các thay đổi khác đang có.
- Chạy toàn bộ JS: 117/118 đạt; kiểm tra ledger còn lệch cột thông tin hóa
  đơn (`medicine_import_ledger.test.js:71`), ngoài phần CSS sửa trong lượt.
  Brand check và HTTP stylesheet mới đạt; không sửa logic ledger ở đây.
- Browser riêng bị chuyển về đăng nhập, đã đóng tab; không thao tác vào
  phiên đang làm việc của user. **Chưa pass visual/interactive QA** với
  ít/nhiều thuốc, tab lịch sử và viewport thấp bằng dữ liệu thật.

### Gom tiếp RGB và màu chuyển sắc, chặn các cách viết tương đương (2026-09-19)

- User yêu cầu xử lý hết phần sót của lượt gom màu trước: 40 màu nâu trong
  suốt ngoài palette, bộ số màu nâu ở Tủ thuốc và màu sáng của dải chuyển.
  Kiểm tra mở rộng còn bắt được bộ số màu hover cứng trong Bootstrap.
- Nâu chính có một nguồn kênh RGB, màu đặc và mọi alpha gọi lại nguồn này;
  nâu tương tác đậm cũng có nguồn kênh riêng, nâu sáng tiêu đề có nguồn
  palette riêng. 14 CSS được sửa; không thay sắc độ, alpha, selector, layout,
  API, dữ liệu hay màu cảnh báo. Những bậc nâu khác không thuộc lượt này.
- Guard quét CSS/HTML/JS/SVG trong `app`, bắt hex 6/8 ký tự, RGB/RGBA,
  HSL/HSLA, bộ số kênh và việc ghi đè nguồn palette. Thêm test cho cách viết
  phần trăm, alpha, fallback, từng loại tệp và màu trạng thái cần giữ nguyên.
- QA: 30 Python + 117 JS đạt, brand check đạt. Chuẩn hóa source trước/sau
  xác nhận 14 CSS giữ nguyên giá trị; localhost trả đúng cả 14 bản mới.
  Browser so sánh 26 mẫu màu ở nền/chữ/viền: tất cả giống trước sửa.
- Browser riêng vẫn chuyển về login khi mở màn Bác sĩ. Mẫu màu chỉ là QA
  kỹ thuật: **chưa pass visual/interactive QA** các trạng thái dữ liệu thật.
  Đã đóng tab/server kiểm tra riêng, không thao tác vào Firefox của user.
  Frontend contract còn lỗi thông báo xóa thuốc có sẵn ở
  `medicine-management.js:1089`; không sửa ngoài phạm vi.

### Gom mã nâu về một nguồn, không đổi thiết kế (2026-09-18)

- User duyệt dọn các định nghĩa màu lặp sau khi rà source. Phạm vi là
  mã `#4b2719`, không thay toàn bộ bảng màu hoặc chuyển nút sang gradient.
- Giữ định nghĩa duy nhất ở `--qlpk-brown-800`; chocolate gọi lại bậc này.
  Chuyển 69 lần viết mã lặp trong 20 tệp CSS thành tham chiếu, kể cả fallback.
  Nền, chữ, viền giữ nguyên vai trò và giá trị trước sửa; không đổi selector,
  bố cục, luồng khám, API hoặc dữ liệu. Không đụng các thay đổi khác có sẵn.
- Thêm guard vào `scripts/check_brand_theme.py`, 6 test Python kiểm nguồn
  màu và 3 test JS bảo vệ cách dùng nền/chữ/viền của màn Bác sĩ.
- QA: 6 Python + toàn bộ 117 JS đạt; brand check đạt; 20 asset HTTP khớp
  source mới và đối chiếu trước/sau chỉ khác tham chiếu mã màu. Frontend
  contract còn lỗi có sẵn ở thông báo xóa thuốc (`medicine-management.js:1089`),
  không phát sinh lỗi mới trong phạm vi màu.
- Browser riêng chuyển về đăng nhập; màu nền tảng được tính đúng thành
  `#4b2719`. Đã đóng tab kiểm tra, không reload phiên Firefox đang làm việc
  của user. **Chưa pass visual/interactive QA** cho màn Bác sĩ có dữ liệu thật
  và các màn khác dùng thành phần chung.

### Đồng bộ màu nền các khối tiêu đề màn Bác sĩ với thanh trên cùng (2026-09-18)

- Nguyên nhân: màn Bác sĩ tự ép hai mốc màu tạo dải chuyển (sáng/đậm) của
  thanh trên cùng về chung một màu đậm duy nhất, khiến mọi khối tiêu đề bên
  trong màn đó (danh sách chờ khám, thanh tên bệnh nhân, tiêu đề khối khám,
  tiêu đề dịch vụ, tiêu đề mục tiền sử) mất dải chuyển màu, nhìn lệch tông
  so với thanh trên cùng.
- Đã bỏ đúng phần ép màu đó để các khối trên tự lấy lại dải chuyển màu gốc,
  đồng bộ với thanh trên cùng. Những chỗ trước đó lỡ dùng chung mốc màu này
  làm màu chữ/viền (không phải làm nền) được trỏ về một màu nâu đặc riêng,
  để không bị vỡ khi mốc màu kia đổi thành dải chuyển. Áp dụng cho cả màn
  Bác sĩ và khối đơn thuốc dùng chung trang. Không đổi bố cục, JS hay dữ liệu.
- QA: 114 test JS + kiểm tra theme thương hiệu đạt, không thêm lỗi mới.
  Lỗi có sẵn ở handler xóa thuốc (`medicine-management.js`) vẫn còn, ngoài
  phạm vi. Chưa đăng nhập được để xem trực tiếp trên trình duyệt riêng:
  **chưa pass visual QA**, cần bạn xem lại trên phiên đang đăng nhập sẵn.

### Toolbar Tủ thuốc: khớp sắc nâu của Lần nhập (2026-09-18)

- User chốt bốn nút dùng đúng nền brown-600 (`#714E3D`) của badge Lần nhập,
  thay brown-500 trước đó. Scope token tại `.mm-toolbar-surface .btn-primary`;
  strong brown-800 và focus RGB113/78/61, chữ trắng; Bootstrap vẫn sở hữu
  các trạng thái hover/focus/active/disabled. Không đổi theme chung, layout,
  modal, logic hoặc dữ liệu. Cập nhật brand-theme theo màu thực tế.
- QA: 15 test toolbar/import layout, brand-theme và diff check đạt.
  Tab QA riêng vẫn chuyển tới login, đã đóng; chưa xác nhận màu computed
  và tương tác trên màn có dữ liệu: **chưa pass visual/interactive QA**.

### Đối chiếu DAV: bảng so sánh gọn, bỏ hai card kéo cao (2026-09-18)

- Theo phản hồi ảnh người dùng: thay hai danh sách nhãn/giá trị rời rạc
  bằng bảng ba cột, bốn trường chung căn cùng hàng; chỉ nhấn ô DAV khác
  biệt. Thông tin đăng ký bổ sung nằm bên dưới, không lặp dữ liệu.
- Bỏ height100% và flex-fill card. Dialog giới hạn viewport, content cao
  tự nhiên, body là owner cuộn duy nhất; header/footer không co. Dùng token
  nâu–trắng sẵn có, không sửa rule hoặc modal nhập kho.
- Renderer `medicines/reference-review.js` giữ dữ liệu ban đầu khi tìm lại,
  xóa nguồn DAV/legend cũ; đổi thuốc/đóng clear toàn bộ. Giữ request revision,
  can_apply, payload xác nhận và chặn đóng/lưu lặp như trước.
- QA: 65 test medicine JS đạt, JS syntax/brand-theme/diff check đạt; route
  trả HTTP200. Frontend contract còn lỗi cũ ở handler xóa thuốc, ngoài scope.
  Thử tab Firefox riêng nhưng bị chuyển login, đã đóng tab và giữ nguyên
  các tab người dùng. **Chưa pass visual/interactive QA** với dữ liệu thật,
  dữ liệu dài, chọn lại và màn hẹp. Đã cập nhật business map/smoke checklist.

### Toolbar Tủ thuốc: đồng bộ bốn nút nền nâu đậm (2026-09-18)

- Theo phạm vi người dùng đã duyệt: Thêm thuốc mới/Nhập kho/Xuất dữ liệu/Xem
  dùng chung `.btn-primary` của bootstrap-brand, chữ trắng, không làm nhạt
  hành động đang bật. Bỏ class secondary khỏi Nhập kho/Xem và CSS nút viền
  toolbar không còn dùng; giữ secondary cho Hủy trong modal. Không đổi
  JS/API, layout hoặc dữ liệu; không thêm override màu hoặc `!important`.
- QA: 14 test toolbar/import layout, brand-theme và diff check đạt.
  Frontend contract còn lỗi có sẵn tại handler xóa thuốc:
  `showCustomToast('error', xhr.responseJSON.user_message)`; ngoài scope.
  Tab browser riêng bị chuyển tới login do không có phiên đăng nhập, đã
  đóng tab. Chưa kiểm màn có dữ liệu, hover/focus/disabled và responsive:
  **chưa pass visual/interactive QA**.

### Nhập kho trở về tông thương hiệu, tăng phân cấp màu (2026-09-18)

- Người dùng không duyệt bản thử xanh–xám bên dưới. Đã thay token thử
  nghiệm bằng token nâu thương hiệu dùng chung, chỉ trong modal nhập kho.
- Header chocolate/chữ trắng, phụ đề nâu rất nhạt; nội dung gần trắng,
  bảng/ô nhập/ghi chú trắng, đầu bảng nâu150, tab chọn nhấn chocolate.
  Footer kem nhẹ, tiền và nút xác nhận chocolate; nút phụ trắng, đỏ chỉ
  dùng cho lỗi/bắt buộc/xóa. Không đổi layout, HTML/JS, API hay rule.
- QA: 24 test layout/ledger/expiry và brand-theme check đạt; diff check
  không lỗi. Browser vẫn chuyển sang màn bác sĩ trước khi mở modal;
  đã đóng tab kiểm tra. **Chưa pass visual/interactive QA** cho bản này.

### Thử bảng màu xanh–xám riêng modal nhập kho (2026-09-18)

- Theo yêu cầu thử nghiệm của người dùng: token màu được scope tại
  `#importBatchModal` trong `pages/medicine-management.css`, không đổi
  theme toàn ứng dụng, rule, HTML/JS, dữ liệu hoặc bố cục/cuộn hiện có.
- Nền xám sáng, khối trắng, tab chọn/nút xác nhận xanh, nút phụ trung tính,
  header bảng xanh rất nhạt; tiền màu cam, dấu bắt buộc/xóa màu đỏ. Chênh
  lệch giá dùng chữ xám thay vì đỏ để không bị hiểu nhầm là lỗi.
- QA: 24 test layout/ledger/expiry đạt, brand-theme check đạt, CSS HTTP 200.
  Frontend contract còn lỗi cũ `showCustomToast('error', xhr.responseJSON.user_message)`
  trong handler xóa thuốc, không sửa ngoài scope. Trình duyệt chuyển từ
  Tủ thuốc sang màn bác sĩ trước khi mở modal; đã đóng tab QA. Chưa kiểm
  trạng thái dữ liệu thưa/dày, hover/focus và responsive bằng trình duyệt:
  **chưa pass visual/interactive QA**. Đây không phải quy chuẩn màu mới.

### Sắp xếp theo hạn dùng và cảnh báo dashboard theo ngưỡng riêng từng thuốc (2026-09-17, tiếp)

- Sort dropdown "Ngày hết hạn": `get_medicines` trước đây không xử lý
  `sort_by=expiry_date` (rơi về mặc định updated_at). Thêm nhánh order theo
  subquery `MIN(MedicineBatch.expiry_date)` trên các lô còn tồn
  (`remaining_quantity > 0`) của từng thuốc, ascending nulls-last — thuốc
  sắp hết hạn nhất lên đầu, thuốc không còn lô nào xuống cuối.
- `/api/medicines/dashboard`: bỏ nhánh cảnh báo hết hạn theo ngưỡng cứng
  30 ngày trên từng batch (đếm cả lô đã hết `remaining_quantity=0`, và cả
  batch đã hết hạn bất kể còn lô hay không) và nhánh đọc field chết
  `medicine.expiry_date`. Thay bằng một nhánh duy nhất: với thuốc có đặt
  `expiry_warning_days`, lấy hạn dùng gần nhất trong các lô còn tồn của
  đúng thuốc đó, so với ngưỡng riêng của thuốc — khớp chính xác
  `is_expiring_soon` đã sửa trong `Medicine.to_dict()`. Nhóm batch theo
  `medicine_id` một lần bằng dict, không thêm N+1 query. Cảnh báo "lô sắp
  hết" (remaining ≤10% quantity nhập) giữ nguyên, không liên quan hạn dùng.
- QA: thêm 4 test (sort thuốc sắp hết hạn lên trước; dashboard loại lô đã
  hết dù sắp hết hạn; dashboard tính đúng theo ngưỡng riêng thuốc dù ngoài
  mốc 30 ngày cũ; không ngưỡng thì không cảnh báo dù đã hết hạn thật).
  200 Python rollback tests + auth/schema contract đạt.
- Chưa đụng tới: `medicine-statistics.js`/endpoint thống kê thuốc chọn
  "latest_batch" bằng `sorted(..., key=expiry_date, reverse=True)[0]` —
  đây là lô có hạn **xa nhất**, không lọc theo tồn còn lại, khác hẳn định
  nghĩa "gần hạn nhất trong lô còn tồn" vừa chuẩn hoá. Đây là màn/API khác,
  không phải field chết `expiry_date`, nên là một lỗi riêng — cần task và
  xác nhận scope riêng trước khi sửa, không tự gộp vào lần này.

### Modal Nhập kho: xổ 1 dòng chưa đạt, đổi sang 2 tab (2026-09-17)

- User chê phiên bản mục xổ ("Lịch sử nhập & lô") thiếu phân cấp thị giác,
  chưa đạt. Đổi sang bố cục 2 tab trong cùng `#importBatchModal`: tab
  "Nhập kho" (`#importOrderPane`, mặc định) và tab "Lịch sử nhập"
  (`#importLedgerPane`) — mỗi pane chiếm toàn bộ chiều cao khả dụng của
  modal-body (`display:flex;flex-direction:column;overflow:hidden`),
  không còn gated theo `min-width/min-height` như bản trước vì chỉ một
  pane hiển thị tại một thời điểm nên luôn an toàn để flex-fill, kể cả
  màn hẹp/thấp (không còn fallback cuộn cả `.modal-body`).
- JS: `toggleImportLedger`/`importLedgerToggle`/`importLedgerBody` thay
  bằng `switchImportTab('order'|'ledger')` cùng `#importTabOrder`/
  `#importTabLedger`/`#importOrderPane`/`#importLedgerPane`. `openImportLedger`
  gọi `switchImportTab('ledger')` thay vì mở xổ. `showImportBatchModal()`
  reset về tab Nhập kho khi mở form mới. Logic bảng lô/expand lịch sử lô
  giữ nguyên (không đổi).
- Cập nhật `tests/medicine_import_layout.test.js` (bỏ test collapse cũ,
  thêm test tab/flex-fill) và viết lại `tests/medicine_import_ledger.test.js`
  theo `switchImportTab`. 58 JS tests (medicine_*) đạt, frontend/brand
  contract đạt (1 cảnh báo `user_feedback_contract` ở dòng xử lý xóa
  thuốc — không liên quan, do luồng chỉnh sửa khác đang chạy song song).
  Browser thật: trang mở được nhưng phiên bị chuyển sang màn bác sĩ ngay
  khi bấm tiếp — lặp lại y hệt các lượt trước trong phiên này, không đổi
  quyền/token. **Chưa pass visual/interactive QA** cho chuyển tab, lọc/
  phân trang/expand lịch sử lô thật và mobile.

### Ngày hết hạn danh sách và cảnh báo sắp hết hạn dùng dữ liệu thật (2026-09-17)

- User hỏi cột "Ngày hết hạn" có tĩnh không: field `Medicine.expiry_date` là
  cột legacy không có writer nào từng ghi (form còn chặn tường minh sửa qua
  danh mục), nên luôn `-`. Hạn dùng thật nằm ở từng lô
  (`MedicineBatch.expiry_date`); `is_expiring_soon`/`days_to_expiry` trong
  `Medicine.to_dict()` cũng đọc field chết này nên badge "Sắp hết hạn" trên
  danh sách chưa từng hoạt động.
- Sửa `Medicine.to_dict()`: tính `nearest_expiry_date` từ lô còn tồn
  (`remaining_quantity > 0`) gần hạn nhất trong `self.batches`; `days_to_expiry`
  và `is_expiring_soon` tính theo mốc này thay vì `self.expiry_date`. Thêm
  field mới `nearest_expiry_date`, giữ nguyên `expiry_date` gốc (không đổi
  ý nghĩa field cũ, tránh vỡ chỗ khác lỡ còn đọc). List (`GET /medicines/`)
  và chi tiết (`GET /medicines/<id>`) dùng chung `to_dict()` nên tự động
  nhất quán, không thêm query (batches đã được load sẵn cho batch_count).
- Frontend: cột "Ngày hết hạn" đổi sang đọc `medicine.nearest_expiry_date`.
  Badge "Sắp hết hạn" (`getMedicineWarnings`) không cần sửa, tự đúng theo
  `is_expiring_soon` mới.
- Biết nhưng chưa sửa (ngoài phạm vi lần này): dropdown "Sắp xếp theo → Ngày
  hết hạn" gọi `sort_by=expiry_date` nhưng `get_medicines` không xử lý case
  này (rơi về mặc định updated_at); `/api/medicines/dashboard` và
  `medicine-statistics.js` vẫn tính cảnh báo/hiển thị riêng theo cách khác
  (dashboard đã dùng batch nhưng ngưỡng cứng 30 ngày, không theo
  `expiry_warning_days` từng thuốc). Cần task riêng nếu muốn đồng bộ.
- QA: thêm `tests/test_medicine_expiry_display.py` (5 case: không lô/lô hết
  bị loại/tính theo lô sớm nhất còn tồn/field cũ không ảnh hưởng/list đồng
  bộ với chi tiết). 118 Python rollback tests + schema/auth contract đạt.
  `node --check` JS đạt. Chưa pass visual QA trên trình duyệt thật.

### Cột Giá nhập trong bảng danh sách hiện giá lần gần nhất (2026-09-17)

- User báo cột "Giá nhập" luôn hiện chữ tĩnh "Theo lần nhập" thay vì giá
  trị thật. `GET /api/medicines/` chỉ trả `medicine.to_dict()`, không kèm
  giá nhập gần nhất; chỉ `GET /api/medicines/<id>` (trang chi tiết) có
  `latest_batch_pricing`.
- Sửa `get_medicines`: mỗi dòng thêm `latest_batch_pricing` (batch_id,
  batch_number, import_date, import_price) tính từ `medicine.batches` đã
  tải sẵn, cùng thứ tự ưu tiên với GET một thuốc (import_date → created_at
  → id, mới nhất trước) để hai nơi không lệch nhau; không thêm truy vấn
  DB mới vì `batches` vốn đã load để đếm `batch_count`.
- Frontend: cột "Giá nhập" đọc `medicine.latest_batch_pricing.import_price`,
  hiện `-` khi thuốc chưa có lô nào (khớp quy ước cột Ngày hết hạn cùng
  bảng). Không đổi cột Giá bán, Lần nhập, Tồn kho.
- QA: thêm 2 pytest ở `tests/test_medicine_latest_batch_prices.py` (list
  đúng giá lô mới nhất theo tie-break, và None khi chưa có lô). 114 Python
  rollback tests + auth/schema contract đạt. `node --check` JS đạt.
  Chưa pass visual QA trên trình duyệt thật.

### Xóa thuốc: frontend vẫn hiện toast chung chung (2026-09-17, tiếp)

- User báo toast vẫn "Lỗi xóa thuốc" dù backend đã trả message riêng.
  Nguyên nhân: `deleteMedicine()` trong `medicine-management.js` bỏ qua
  `xhr.responseJSON`, luôn hiện chuỗi cứng khi request lỗi (chỉ tách nhánh
  401). Sửa: backend trả thêm `user_message` (giống pattern `catalog_error`)
  cạnh `error` cho cả 2 nhánh 409; JS đọc `xhr.responseJSON.user_message`
  khi `status === 409` để hiện đúng lý do, giữ toast chung chỉ cho lỗi
  ngoài dự kiến (500/network).
- Test cập nhật: `tests/test_medicine_delete.py` assert thêm
  `body['user_message'] == body['error']` cho cả 2 case chặn. 21 Python
  rollback tests + `check_api_auth_contract.py` đạt. Không đổi payload
  thành công/luồng xóa khi hợp lệ.

### Gộp Chi tiết tồn kho + Lịch sử giao dịch vào modal Nhập kho (2026-09-17)

- User chốt phương án mockup (form nhập trên, "Lịch sử nhập & lô" xổ dưới
  giống pattern Cập nhật giá). Đã bỏ hẳn `stockDetailModal` và
  `transactionHistoryModal` khỏi `medicine-management.html`; thêm mục xổ
  `#importLedgerSection` trong `#importBatchModal` (toolbar tìm theo tên
  thuốc/số lô + lọc trạng thái, bảng lô, phân trang Trước/Sau). Bấm một
  dòng lô mở lịch sử giao dịch của đúng lô ngay dưới dòng đó (chỉ một
  dòng mở tại một thời điểm); không còn modal thứ ba.
- `showStockDetail(medicineId)`/`showMedicineExpiry()` giữ tên hàm cũ
  (owner cũ) nhưng nay mở `importBatchModal` qua `showInventoryOverlay`
  sẵn có rồi gọi `openImportLedger({medicineId, search: tên thuốc})`; nếu
  modal đang mở dở (đơn đang nhập) thì không reset form, chỉ mở/lọc panel.
  `showImportBatchModal()` đóng panel về trạng thái ban đầu khi mở form
  mới. Nhập kho xong vẫn đóng modal như luồng cũ, không tự giữ mở.
- Backend `GET /medicine-batches/` thêm tham số đọc `search` (join
  `Medicine`, dùng `normalized_contains` có sẵn) và `sort=recent`; không
  đổi ghi lô/tồn/giao dịch, không đổi FEFO mặc định cho các nơi gọi khác.
- Testing: viết mới `tests/medicine_import_ledger.test.js` (mở/lọc/phân
  trang/expand-collapse lịch sử lô, bỏ qua phản hồi cũ) và cập nhật
  `tests/medicine_expiry_view.test.js` theo kiến trúc mới (không còn kịch
  bản 3 lớp modal); thêm 2 test layout tĩnh vào
  `tests/medicine_import_layout.test.js`. Thêm `after()`/`nextElementSibling`
  (thuần bổ sung, không đổi hành vi cũ) vào `tests/helpers/autocomplete-dom.js`
  để test được thao tác mở/đóng dòng lịch sử lô như DOM thật.
- 57 JS tests (medicine_*) đạt, 103/103 toàn bộ suite đạt, `py_compile`,
  `check_frontend_contract`, `check_brand_theme`, `check_api_auth_contract`
  đạt. Browser thật: trang Kho thuốc mở được nhưng phiên bị chuyển sang
  màn bác sĩ ngay khi thao tác tiếp — môi trường lặp lại y hệt các lượt
  QA trước trong phiên này, không đổi quyền/token để vượt qua. **Chưa pass
  visual/interactive QA** cho mở/lọc/phân trang/expand-collapse thật,
  nhiều lô, và mobile.

### Xóa thuốc: chặn đúng lý do thật, bỏ chặn theo lịch sử giá (2026-09-17)

- User báo `3bstada` (0 tồn, 0 lần nhập) vẫn bị chặn xóa với lỗi chung chung
  "Thuốc có lịch sử giá cần được giữ lại để đối chiếu." Nguyên nhân: mọi
  thuốc đều tự sinh 1 dòng `medicine_price_history` ngay lúc tạo
  (`catalog_service.write_clinic_medicine` gọi `record_price` vô điều kiện),
  nên guard theo lịch sử giá chặn nhầm cả thuốc chưa từng dùng thật.
- Sửa `delete_medicine` (`app/api/medicine.py`): kiểm tra usage thật theo thứ
  tự — có trong `prescription_items` → 409 "đã được kê trong đơn thuốc,
  không thể xóa"; có trong `medicine_transactions` → 409 "đã có giao dịch
  nhập/xuất kho, không thể xóa" (mỗi lô nhập luôn kèm transaction `import`
  nên không cần check `medicine_batches` riêng). Hai lý do có message riêng,
  không còn 1 câu chung chung.
- Phát hiện thêm khi test: cột `medicine_price_history.medicine_id` có FK
  `ON DELETE RESTRICT` thật ở DB, nên chỉ bỏ guard app-level là chưa đủ —
  xóa thuốc "sạch" vẫn bị Postgres chặn nếu còn dòng lịch sử giá. Xử lý:
  trước khi xóa thuốc đã qua 2 check trên (nghĩa là chưa dùng thật), xóa
  luôn các dòng `medicine_price_history` của thuốc đó rồi mới xóa medicine.
  Thuốc đã dùng thật thì bị chặn từ 2 bước trên trước, lịch sử giá của nó
  không bao giờ bị đụng tới.
- Cập nhật test cũ `test_creation_records_initial_price_and_history_prevents_deletion`
  (tên/assert phản ánh rule cũ) thành
  `..._and_unused_medicine_can_still_be_deleted`, khớp rule mới. Thêm
  `tests/test_medicine_delete.py` (3 case: chỉ có lịch sử giá → xóa được;
  có trong đơn thuốc → 409 đúng message; có giao dịch kho → 409 đúng
  message). 112 Python rollback tests (`QLPK_RUN_DB_TESTS=1`) đạt,
  `check_api_auth_contract.py`/`check_schema_contract.py` đạt. Không đổi
  model/migration/JS — chỉ đổi logic Python trong route DELETE.
- 6 JS test fail hiện tại (`medicine_expiry_view.test.js`, lỗi
  `$(...).ready is not a function`) là do một phiên khác đang tái cấu trúc
  song song `medicine-management.js` (hàm `showInventoryOverlay`/
  `renderStockDetail` bị đổi vị trí/tên khi kiểm tra), không liên quan tới
  thay đổi backend này; không sửa vì ngoài phạm vi task và đang bị ghi đè
  bởi phiên khác.

### Gỡ hoàn toàn Nhập từ Excel (2026-09-17, side-thread)

- User chốt rõ: chỉ gỡ nhập thuốc từ Excel, giữ nguyên luồng xác nhận DAV
  cho thuốc cũ (reference-review) — không đụng tới nó.
- Đã xóa: nút `#importBtn` + modal `#importModal` trong
  `medicine-management.html`; handler và toàn bộ hàm phụ trợ
  (`exportTemplate`, `importMedicines`, `showMedicineImportResult`,
  `exportMedicineImportErrors`) trong `medicine-management.js`; route
  `GET /medicines/import-template` và `POST /medicines/import` trong
  `app/api/medicine.py`; xóa hẳn file service
  `app/modules/medicines/services/catalog_excel.py` (không còn nơi nào
  import). Không đụng `reference_catalog_export.py` (xuất danh mục DAV,
  tính năng khác) và không đụng `reference-review.js`/API liên kết DAV
  cho thuốc cũ.
- Test: gỡ helper `excel()` và 3 test phụ thuộc route Excel trong
  `tests/test_medicine_dav_link.py`, dọn import `Workbook`/`BytesIO`
  không còn dùng. `QLPK_RUN_DB_TESTS=1 pytest` 75 passed (dav_link +
  reference_review + dav_export_sync + dav_autocomplete_query);
  `node --check` JS sạch; `check_frontend_contract.py`,
  `check_brand_theme.py`, `check_api_auth_contract.py` đều OK
  (414 route, 0 route thiếu auth sau khi bớt 2 route).
- **Chưa pass visual/interactive QA**: chưa mở trình duyệt kiểm bố cục nút
  công cụ Tủ thuốc sau khi bớt nút Nhập từ Excel.

### Nút Xuất dữ liệu chỉ xuất danh sách thuốc (2026-09-17)

- User gạch chéo toàn bộ modal "XUẤT DỮ LIỆU" (báo cáo tồn kho, lịch sử giao
  dịch, báo cáo nhà cung cấp, mọi nút PDF), yêu cầu bỏ hẳn code/logic, chỉ
  còn xuất danh sách thuốc. Gỡ `#exportDataModal` khỏi
  `medicine-management.html`; `#exportDataBtn` gọi thẳng
  `exportMedicineListExcel()` (Excel danh sách thuốc), không qua modal chọn
  loại nữa.
- Backend `export_medicines_excel` bỏ tham số `type` và 3 nhánh
  stock_report/transactions/suppliers, chỉ còn nhánh danh sách thuốc. Xóa
  route `export_medicines_pdf` (luôn trả 501, không còn caller) và import
  `Supplier` không dùng nữa trong `app/api/medicine.py`.
  `showTransactionHistoryModal` vẫn giữ nguyên vì nút "Xem chi tiết lần
  nhập" trên từng dòng thuốc còn gọi trực tiếp, không qua modal đã xóa.
- QA: `py_compile app/api/medicine.py`, `node --check medicine-management.js`
  đạt; 47 JS tests liên quan tủ thuốc đạt; frontend/brand contract đạt; HTML
  tag-balance check qua toàn file. Chưa test thật nút Excel trên trình duyệt
  (không đổi payload/route còn lại nên rủi ro thấp) — **chưa pass visual/
  interactive QA**.

### Nhập kho: căn hàng Ghi chú/Chi tiết lô, padding gọn (2026-09-17)

- Vòng 3: đã audit — không có selector trùng trong CSS import modal (mỗi rule
  một nơi). Sửa tiếp theo góp ý: "viên" chuyển vào cùng dòng với ô Số lượng
  (JS bọc `.mm-import-qty` flex, bỏ display:block); ô bảng căn giữa dọc,
  bỏ padding-top bù ở Giá lần trước/Thành tiền. Header .5rem/1rem + title
  2xl; footer .375rem/1rem, tổng đơn nằm ngang một dòng, nút 2.25rem;
  khoảng cách giữa các khối .75rem. 8 layout tests, 47 JS tests đạt.
- Vòng 2 theo góp ý "vẫn lệch, padding cực lớn": bỏ ép `height:100dvh` trên
  dialog/content — modal chỉ `max-height`, ôm sát nội dung khi ít dòng nên
  hết dải trống lớn trước footer; nhiều dòng vẫn bung tối đa và bảng cuộn
  (`mm-import-list/table-scroll` đổi `flex:1 1 auto` để hoạt động với chiều
  cao auto). Hai cột Ghi chú/Chi tiết lô: cột flex column, textarea và hộp
  lô cùng `flex:1` + min-height nên mép trên/dưới bằng nhau; bỏ
  `align-items:start`. Media 45rem không đạt trên màn thấp thì body cuộn
  như cũ. Layout tests cập nhật theo contract mới (7 pass).
- Theo góp ý user: "Chi tiết giá trị theo lô" đổi sang cùng mẫu nhãn trên +
  hộp viền dưới như Ghi chú (`.mm-import-lot-list` mới nhận viền, breakdown
  cuộn trong8rem); hai cột support flex column nên mép trên/dưới thẳng hàng.
- Header modal .625rem/1rem, body .75rem/1rem, footer .5rem/1rem, tổng đơn
  hạ cỡ 2xl. Không đổi ID/JS tính tiền. 7 layout tests đạt (file test đang
  được một phiên khác cùng sửa — chỉ vá dòng, không ghi đè). Chưa pass
  visual QA trình duyệt.

### Modal xác nhận DAV có phân cấp màu (2026-09-17)

- Vòng 3 (user: vẫn scroll do padding/câu thừa): bỏ đoạn mô tả mở đầu, chỉ
  giữ nhãn "Tìm thuốc trong danh mục"; header thẻ chuyển 1 hàng (tiêu đề +
  mô tả baseline, wrap khi hẹp); giảm padding header/footer modal và
  status mt-3→mt-2. Không đổi hành vi.
- Vòng 2 (user báo "vẫn bị scroll, chưa đạt"): dialog/content chiếm
  `calc(100dvh - 1rem)` như supplier/nhập kho; desktop từ 48×45rem body
  flex overflow hidden, vùng so sánh flex chiếm phần còn lại, 2 thẻ cao
  bằng nhau và chỉ phần dl trong thẻ cuộn khi quá dài (quy cách nhiều
  biến thể). Màn hẹp/thấp giữ body cuộn. 6 tests đạt (thêm layout contract).
- User chê modal "Xác nhận thuốc từ DAV" một màu kem, thiếu phân cấp. Áp
  ngôn ngữ thẻ trắng của form thuốc: 2 cột thành `mm-review-card` trắng bo
  góc, header có thanh màu trái + mô tả (ban đầu brown-600, DAV tông xanh
  của form). Nhãn dt semibold brown-500; cột DAV rỗng hiện "Chưa chọn
  thuốc từ danh mục." bằng CSS :empty.
- JS `reference-review.js` so khớp Tên thuốc/Hoạt chất/Hàm lượng/Nước sản
  xuất (trim + không phân biệt hoa thường) và tô nền warning nhạt lên cả
  hai cột ở dòng khác nhau để đối chiếu nhanh. Không đổi luồng chọn/lưu,
  payload hoặc API.
- 5 JS tests reference-review đạt (thêm test tô khác biệt), frontend/brand
  contract đạt. **Chưa pass visual/interactive QA** — phiên browser vẫn tự
  chuyển về màn bác sĩ; cần user xem trạng thái đã liên kết/chưa chọn,
  hoạt chất dài và mobile.

### Form thuốc: giữ 2×2, cân nội dung từng ô (2026-09-17)

- Khoảng trống gốc do 2×2 ép hai ô cùng hàng cao bằng nhau trong khi nội
  dung lệch. Bản xếp dọc full-width bị user bác (dài, phải cuộn). Chốt:
  giữ 2×2 ở ≥64rem nhưng cân mỗi ô đúng 2 hàng field — cơ bản và giá &
  phân loại dùng 2 cột (Loại đơn thuốc hết full-width), quy cách giữ hàng
  số lượng + Quy cách, cảnh báo 3 cột + Ghi chú. Header section một dòng,
  icon 1.75rem; yêu cầu gọn một màn hình desktop, không cuộn, không filler.
- Chỉ CSS trang (`grid-template-areas`, container queries); template chỉ
  đổi class span pricing từ lượt trước; không đổi field/id/luồng lưu/JS.
- QA: 31+ JS tests, frontend/brand contract đạt. **Chưa pass visual/
  interactive QA**: cần kiểm đủ một màn hình không cuộn ở desktop thật,
  thêm/sửa thuốc, container hẹp/mobile và dropdown trong từng section.

### Khối DAV trên form thuốc có nhãn, gỡ ô trùng (2026-09-17)

- Vòng 2 theo phản hồi user ("Diazepam 5mg là gì", tiêu đề khó hiểu): bỏ
  phần tử tiêu đề trong khối (`davSelectionTitle` + CSS đã xóa); tiêu đề
  chuyển lên phụ đề header `medicineFlowGuide` với đúng câu user chốt
  "Thông tin đăng ký thuốc (Cục Quản lý Dược)" (thuốc cũ: "Thông tin thuốc
  gốc (chưa liên kết Cục Quản lý Dược)"; Đổi thuốc trả về câu hướng dẫn).
  Dòng tên có nhãn "Tên thuốc:", thêm dòng Hàm lượng ẩn khi đã nằm trong
  tên, Hoạt chất ẩn khi trùng hệt tên. 31 tests liên quan đạt; browser vẫn
  bị phiên bác sĩ tự chuyển trang sau khi trang kho render (badge cảnh báo
  đã thấy aria-label mới) — **chưa pass visual/interactive QA** modal thật.

- Theo đề xuất user duyệt: `renderIdentity` trong `clinic-catalog.js` render
  tên·hàm lượng nổi bật + dòng nhãn Hoạt chất/Dạng bào chế/Đóng gói/Nhà sản
  xuất/Nước sản xuất/SĐK; thêm tiêu đề `davSelectionTitle` "Thông tin thuốc
  từ DAV · Chỉ xem" (thuốc gốc chưa liên kết dùng "Thông tin thuốc gốc").
  Bỏ dòng Đường dùng trong tóm tắt vì đã có field Phương thức dùng.
- Template chuyển 4 ô readonly trùng (Tên thuốc, Hoạt chất, Nguồn gốc, Hàm
  lượng) thành input ẩn cùng id/name trong fieldset để giữ FormData, luồng
  chọn/đổi thuốc và price-editor đọc `medicine-name`; Loại đơn thuốc chiếm
  full hàng, cập nhật mô tả 2 section. CSS: grid tóm tắt auto-fit 16rem,
  nhãn semibold brown-500, tiêu đề uppercase nhỏ. Không đổi payload/API.
- 42 JS tests đạt (thêm 1 test tóm tắt nhãn + contract input ẩn), frontend/
  brand contract đạt. Browser: trang kho mở được nhưng khi thao tác phiên
  chuyển về màn bác sĩ; đã đóng tab, không đổi quyền/token. **Chưa pass
  visual/interactive QA** các trạng thái chọn DAV mới, sửa thuốc liên kết/
  gốc, hoạt chất dài và mobile.

### Thuốc mới từ DAV tự confirmed; bỏ checkbox đối chiếu (2026-09-17)

- User báo vô lý: thêm mới đã phải chọn DAV nhưng list vẫn đòi "Cần xác nhận
  DAV", và modal xác nhận còn checkbox chặn nút. Sửa gốc trong
  `catalog_service.write_clinic_medicine`: `creating` cũng ghi
  `reference_snapshot.human_review` với người tạo (áp dụng cả Excel vì cùng
  writer, luồng khép kín chỉ thêm từ DAV). Không backfill thuốc cũ: pending
  hiện có giữ nguyên, nguồn đổi vẫn ra `stale`.
- Modal Xác nhận thuốc từ DAV: gỡ `medicineReviewConfirmed` khỏi template,
  JS và CSS (`mm-review-confirmation`); nút Xác nhận liên kết enable theo
  `can_apply`, payload vẫn gửi `reference_link_confirmed: true` nên API
  contract và guard version/duplicate/source không đổi.
- QA: 67 Python rollback (`QLPK_RUN_DB_TESTS=1`, thêm assert thuốc mới
  confirmed + human_review) và42 JS đạt; frontend/brand contract đạt.
  **Chưa pass visual/interactive QA** trên trình duyệt (list badge sau tạo
  mới thật, modal không checkbox) — user tự kiểm hoặc yêu cầu QA sau.

### Tooltip cảnh báo thuốc phản hồi nhanh (2026-09-17)

- Chỉ sửa badge cảnh báo trong `medicine-management.js`: thay title native
  bằng nhãn accessible/focus bàn phím, Bootstrap Tooltip hover/focus trễ120ms,
  không animation; Escape đóng. Tooltip gắn vào body để tránh bảng cắt;
  dispose trước mỗi render, kể cả trang rỗng. Không đổi cảnh báo/nghiệp vụ,
  icon tác vụ khác hay layout modal đang được xử lý ở task chính.
- 3 tests tooltip và3 tests catalog save đạt; syntax/frontend contract đạt.
  Browser thử trang thật nhưng phiên hiện tại chuyển về màn bác sĩ, đã đóng
  tab. **Chưa pass visual/interactive QA** hover/focus/timing và đổi trang thật.

### Nâng cấp UI nhập kho sau phản hồi visual fail (2026-09-17)

- User chốt cả sửa lỗi full-height và nâng cấp UI gốc. Thay cách trình bày
  trong `medicine-management.html`, CSS trang và markup dòng của JS hiện có:
  header trái, grid thông tin đơn, bảng trắng có khung/toolbar riêng, cột tên
  thuốc26%, ô nhập căn trên và tiền căn phải. Giữ shell gần full-height,
  desktop cuộn riêng trong bảng; mobile/thấp giữ cuộn body và bảng ngang.
- Bỏ alert-info và footer căn giữa. Ghi chú/chi tiết lô chia2 cột trên
  desktop, tổng đơn duy nhất chuyển vào footer cùng Hủy/Xác nhận bên phải.
  Lô dài cuộn trong4.5rem, note giới hạn6rem trên desktop; thêm nhãn accessible
  cho field/nút xóa, reset lô có câu rỗng. Không đổi tính tiền, payload/API,
  chọn nhà cung cấp, lifecycle overlay hoặc ghi tồn.
- 38 JS tests đạt, gồm layout contract và regression20 dòng/2 lô/reset tổng;
  node syntax + frontend/brand checks đạt. Kiểm trên Firefox thật bằng tab
  nhân đôi phiên admin: mở được modal mới, nhìn được trạng thái1 dòng trống,
  vùng bảng trắng liền khung, tổng/footer mới. Không phát sinh giao dịch kho.
- **Chưa pass visual/interactive QA**: chưa kiểm dòng có thuốc/giá thật,
  nhiều dòng, thao tác chọn/thêm/xóa, dropdown/ngày và mobile. User chuyển
  Firefox sang công việc khác nên dừng thao tác; phiên iab localhost yêu cầu
  đăng nhập (127.0.0.1 đang role bác sĩ). Đã đóng2 tab QA tạo trong lượt và
  trả lại tab user đang dùng. Không đổi quyền/token hoặc sao chép phiên.
- Mục kéo cao phía dưới là lịch sử bản đầu đã bị user đánh giá visual fail;
  layout/owner hiện hành theo mục này và business-map.

### Modal nhập kho tận dụng chiều cao (2026-09-17)

- Theo scope user đã chốt: chỉ sửa HTML/CSS `#importBatchModal`, dialog cao
  `calc(100dvh - 1rem)`, content100%, body min-height0. Giữ header/footer
  không co; bỏ utility trừ cứng420px, thêm list/table flex chiếm phần còn lại
  trên desktop từ48rem rộng và45rem cao. Toolbar wrap, màn hẹp/thấp giữ
  body cuộn; bảng giữ min-width1100px và cuộn ngang hiện có.
- Chi tiết theo lô dài cuộn trong12dvh và textarea giới hạn6rem trên desktop
  để không chiếm hết vùng thuốc. Không đổi JS/API, tính tiền, ghi tồn hoặc
  overlay lifecycle; không phát sinh giao dịch nhập kho khi QA.
- 35 JS tests đạt (gồm3 static layout contracts mới), frontend/brand contract
  đạt. Browser local đã thử lại nhưng session bác sĩ chuyển khỏi trang kho;
  đã đóng tab QA, không đổi quyền/token. **Chưa pass visual/interactive QA**
  các trạng thái rỗng/ít/nhiều dòng thật, tổng nhiều lô, mobile và thao tác
  thêm/xóa/chọn thuốc/mở nhà cung cấp.

### Modal nhà cung cấp tận dụng chiều cao (2026-09-17)

- Theo yêu cầu user: `#supplierManagementModal .modal-dialog` cao
  `calc(100dvh - 1rem)`, content100%; header/footer không co. Bỏ utility
  chỉ dùng ở bảng này `mm-scroll-100vh-500` (trừ cứng500px).
- Desktop từ48rem rộng và45rem cao: body flex/min-height0/overflow hidden,
  form và toolbar không co, list/table flex chiếm phần còn lại, bảng cuộn.
  Màn hẹp/thấp giữ body cuộn tự nhiên; bộ lọc và nút form wrap, bảng rộng
  tối thiểu64rem cuộn ngang. Không đổi API/JS nghiệp vụ/modal khác.
- Thêm static layout contract và regression modal con đóng trả lại focus,
  scroll/dữ liệu form cha. 32 JS tests và frontend/brand contract đạt;
  HTTP local đã phục vụ CSS mới. Browser nền mở trang
  thật nhưng bị chuyển sang màn bác sĩ; không đổi quyền/token để vượt chặn.
  **Chưa pass visual/interactive QA** với ít/nhiều dòng thật và mobile.

### Sửa kẹt Lưu sau Cập nhật giá khi thêm thuốc (2026-09-16)

- `price-editor.js` đọc sai ID `name` thay vì `medicine-name`, ném lỗi sau
  khi đã đặt `opened=true`; `saveMedicine()` vì thế return im lặng. Sửa ID,
  đưa khởi tạo modal vào try/catch. Lỗi trước khi modal hiện sẽ gọi lifecycle
  `dismissed()`, mở lại nút Lưu và báo lỗi qua `medicineFormError`, giữ giá tạm.
  Không đổi API, DB, quy tắc giá hoặc layout/overlay owner.
- Fixture `medicine_price_editor.test.js` giới hạn ID theo template thật.
  Đã thấy 3 regression tests fail trước sửa; sau sửa 29 JS tests đạt (giá,
  lưu danh mục, DAV autocomplete, modal tồn/hạn dùng), JS syntax đạt.
- HTTP local8000 trả200 và asset đã chứa bản sửa. Đã thử browser trên trang
  thật nhưng phiên hiện tại tự chuyển sang màn bác sĩ trước khi thao tác.
  **Chưa pass visual/interactive QA** luồng thêm thuốc và lưu thật; không
  tạo thuốc/đổi giá trong DB, không sửa quyền hay phiên đăng nhập để vượt chặn.

### Thêm thuốc: bỏ checkbox xác nhận quy đổi DAV (2026-09-16)

- Theo yêu cầu user (ô "Tôi đã kiểm tra đơn vị dùng và quy đổi đóng gói từ
  DAV" bị coi là thừa, chặn lưu gây khó hiểu): form thêm mới không còn ô
  xác nhận, logic chặn lưu và auto-untick khi đổi đơn vị/quy đổi. Giữ hint
  mềm `davMappingHint` sau khi chọn thuốc ("Gợi ý từ DAV: 1 X = N Y…" hoặc
  nhắc kiểm tra khi quy cách đa biến thể/khoảng), không chặn lưu.
  `payload()` chỉ còn chặn: chưa chọn nguồn DAV, thiếu Nội/Ngoại khi DAV
  không có nước sản xuất. Backend `catalog_service`/`catalog_mapping` không
  đổi; checkbox `medicineReviewConfirmed` của luồng xác nhận liên kết DAV
  cho thuốc cũ giữ nguyên (khác luồng).
- Files: `clinic-catalog.js`, `medicine-management.html`,
  `tests/medicine_dav_autocomplete.test.js` (assertions + tên test theo
  hành vi mới, không còn nhắc confirmation).
- Cùng ngày, theo yêu cầu user: ô "Mã thuốc" (`medicine-internal_code`)
  disabled cứng, placeholder "Tự sinh khi lưu"; FormData bỏ input disabled
  nên form không gửi `internal_code`, backend tự sinh `MEDxxxxx` khi tạo và
  giữ mã cũ khi sửa (chỉ hiển thị). Import Excel với cột "Mã thuốc" giữ
  nguyên (backend không đổi).
- QA: node --check 2 owner JS; 15 JS dav_autocomplete + 3 catalog_save +
  6 dav_catalog_search; 28 pytest `test_dav_clinic_mapping` đạt. Không có
  server/DB local đang chạy nên **chưa pass visual/interactive QA** — user
  kiểm form thêm mới thật (chọn DAV → sửa đơn vị/quy đổi → Lưu không bị
  chặn bởi checkbox).

### Nhập kho từ form thuốc (2026-09-16)

- Thêm ô "Tồn kho" với nút Nhập kho trong section Quy cách đóng gói (button
  dạng form-control, owner .mm-field-action dùng chung với nút Xem hạn dùng,
  đã đổi tên từ .mm-expiry-action). Grid desktop 1.2fr + 4 cột + auto, nút
  nowrap; mobile 2 cột. Thuốc chưa lưu: nút khóa "Lưu thuốc trước"
  (clinic-catalog renderExpiryAction sở hữu trạng thái).
- Nút mở importBatchModal chồng lên form qua showInventoryOverlay, dòng đầu
  pre-chọn thuốc đang sửa (set input/hidden + onBatchMedicineSelect). Toolbar
  Nhập kho giữ luồng cũ (không pre-chọn, mở top-level). Sau nhập thành công
  từ form: đóng modal và editMedicine() nạp lại form từ server (chỉnh sửa
  chưa lưu trong form sẽ bị nạp lại). Không đổi API/payload import-order.
- QA: 79 JS tests, frontend/brand contract; browser CDP: pre-chọn đúng thuốc
  + giá lần trước, form inert khi chồng, confirm với $.ajax stub (không ghi
  DB, đã hậu kiểm 0 lô QA) → modal đóng + form nạp lại; thuốc mới nút khóa;
  toolbar giữ nguyên; desktop/mobile390 không tràn, console sạch. Chưa QA
  ghi lô thật qua browser — user kiểm khi nhập kho thật.

### Cập nhật giá bán và lịch sử (2026-09-15)

- Theo phản hồi "xanh hơi tối": --mm-medicine-green giảm pha brown-900 từ
  32% xuống 15% (≈ #1e7649, 5.6:1); badge Đang áp dụng, nút Cập nhật giá/
  Xác nhận, tên thuốc và section Giá cả & Phân loại sáng theo cùng token.
  Browser QA CDP chụp lại modal + section form, console sạch.
- Nâng cấp trình bày hộp thoại giá: Lịch sử giá thành section viền + nền
  surface như khối Thời gian, summary semibold nâu có chevron xoay, bỏ marker
  mặc định; bảng chỉ kẻ ngang brown-100, header brown-150 bo hai đầu band,
  3 cột giá nowrap; chênh lệch +xanh/−đỏ theo feedback tokens ở cả ô tổng và
  bảng; badge Đang áp dụng khi effective_to null; empty-state canh giữa muted;
  Xem thêm btn-sm tier-2 trong section. Chỉ đổi partial medicine-price-editor,
  price-editor.js và block mm-price CSS; không đổi API/payload/nút footer.
  79 JS tests + frontend/brand contract đạt. Browser QA CDP (Chrome headless,
  token QA): state rỗng thật, dense 8 dòng mock GET price (không ghi DB),
  chênh lệch ±, Xem thêm, mobile390, bảng cuộn trong wrapper, console sạch.
  Chưa QA luồng ghi giá thật (bấm Xác nhận) trên browser — user kiểm khi dùng.
- Hộp thoại giá thu gọn tối đa42rem, căn giữa theo chiều dọc; thêm tên thuốc
  từ medicine đang sửa hoặc DAV đã chọn. Grid riêng tách nhãn/value, ô giá
  cũ/chênh lệch cùng hàng với giá mới; màn nhỏ xếp một cột. Từ/Đến hiển thị
  trong khối riêng luôn thấy, lịch sử vẫn thu gọn/mở và cuộn độc lập.
  Giữ màu xanh nút; không đổi API/database. Chưa pass visual/interactive QA.

- Hộp thoại hiển thị Từ/Đến riêng: trước xác nhận ghi rõ thời điểm sẽ ghi
  nhận; sau lưu hiển thị timestamp server theo giờ Việt Nam, đến để Đang
  áp dụng. Không lấy giờ mở hộp thoại làm thời điểm hiệu lực. Nhập tiếp giá
  mới/reset phải bỏ timestamp lần trước; nhãn giá cũ/chênh lệch tách dòng.

- Theo phản hồi màu nút: Cập nhật giá dùng nền xanh nhạt, chữ/viền xanh
  đồng bộ khối Giá cả & Phân loại; hover/active/focus cùng tone. Giữ kích thước.
- Ô Đơn giá bán chỉ xem; theo phản hồi mới, nút Cập nhật giá mở hộp thoại
  riêng nằm ngoài form/grid thuốc, hiển thị giá cũ/mới/chênh lệch và lịch sử.
  Dùng showInventoryOverlay để khóa nền, khôi phục focus và giữ dữ liệu form.
  Header/footer cố định, body cuộn, bảng lịch sử cuộn ngang khi cần; mở giá
  không kéo cao hàng grid. 12 tests giá/overlay/save và frontend contract đạt.
  User tiếp tục QA; chưa pass visual/interactive QA.
- Bảng thuốc giữ giá hiện tại; bảng lịch sử trỏ thuốc một chiều. Server ghi Từ
  khi xác nhận, lần đổi tiếp theo đóng Đến. Có actor, kiểm stale/revision,
  row lock và transaction; không ghi log khi giá không đổi.
- PUT thông tin thuốc không đổi giá; tạo thuốc/Excel ghi giá khởi tạo.
  Không giả lập lịch sử cũ. Không sửa giá đơn đã lưu, lô hoặc tồn kho.
- Local migration20260915_medicine_price_history đã áp dụng sau backup.
  Hậu kiểm51 thuốc,48 lô,2744 giao dịch và877 dòng đơn giữ nguyên; lịch sử
  thật đang trống. Báo cáo: reports/medicine-price-history-2026-09-15/.
- 89 Python rollback +22 JS tests đạt; schema, Alembic strict, API auth
  và frontend contract đạt. User QA: chưa pass visual/interactive QA.

### Xem hạn dùng từ form thuốc (2026-09-15)

- Ô hạn dùng giữ kích thước form-control, đổi thành nút viền nâu nhẹ với
  biểu tượng lịch khi batch_count > 0; chưa có lô thì nút khóa “Chưa có lô”.
  Theo phản hồi tiếp theo, bỏ modal hạn dùng riêng và dùng lại stockDetailModal,
  API/renderer chi tiết lô hiện có. Giữ form mở phía dưới; không hide/reset form.
- showInventoryOverlay quản lý thứ tự lớp, inert/ARIA, khôi phục focus và cuộn
  khi đóng; hỗ trợ lịch sử giao dịch mở trên lô. Dùng focus trap của Bootstrap
  5.3.2 đã pin trên trang; cần kiểm tra lại khi nâng Bootstrap. Không tạo bản
  sao dữ liệu/lô hay thêm API. Luồng mở lô từ bảng vẫn giữ hành vi cũ.
- 4 tests overlay riêng, frontend contract, Jinja/DOM IDs và syntax đạt;
  bộ tests chung có lỗi kỳ vọng giá bán trong lúc task chính đổi owner giá,
  không sửa phần giá trong scope này.
  chưa pass visual/interactive QA. Không đổi backend hay dữ liệu thuốc.

### Phân biệt ô chỉ xem và ô nhập trên form thuốc (2026-09-15)

- Theo phản hồi mới nhất: đã bỏ hẳn hàng chú giải Có thể nhập/sửa, Chỉ xem,
  * Bắt buộc (HTML + CSS mm-field-legend gỡ sạch, không còn tham chiếu).
  Phân biệt chỉ còn bằng nền ô và dấu * tại label. Browser QA form mở
  thuốc thật: chú giải mất, layout liền mạch, console sạch.
- Giữ chain modal flex → body cuộn → fieldset/grid responsive. Trước đó đã
  bỏ toàn bộ badge Chỉ xem tại label để tránh xuống dòng/lệch ô; chỉ dùng
  nền trắng cho ô nhập, xám trung tính nhạt cho ô khóa, viền liền nhẹ.
  Không dùng nâu đậm/nét đứt hoặc giảm opacity làm khó đọc dữ liệu.
- CSS theo trạng thái native :disabled/[readonly], gồm cả fieldset đang
  khóa trước chọn DAV và khóa đơn vị/quy đổi khi có lô; tự cập nhật khi trạng
  thái đổi. Không sửa JS/payload/quyền nhập. Nhãn dài được xuống dòng.
- Frontend contract, Jinja và diff check đạt; chưa pass visual/interactive QA,
  user tiếp tục kiểm tra giao diện.

### Giá vốn theo lô, giá bán do người dùng nhập (2026-09-15, trước luồng cập nhật giá)

- User chốt lại: giữ bố cục Giá cả & Phân loại; chỉ giá vốn disabled/readonly.
  Đơn giá bán do người dùng nhập, lấy giá hiện tại medicine.unit_price khi sửa
  và gửi số unit_price qua writer hiện có. Reset thêm mới xóa giá cũ.
- GET medicine detail trả latest_batch_pricing; chọn import_date DESC,
  created_at DESC NULLS LAST, id DESC. Không lọc theo tồn/hạn dùng. Giá0
  giữ0; giá thiếu để trống, không lấy lô cũ hoặc giá danh mục thay thế.
- Lô chưa có cột giá bán; bỏ field sale_price rỗng trong latest_batch_pricing.
  Chưa có lô thì ô giá vốn ghi “Chưa nhập lô”; giá bán vẫn nhập được sau khi
  chọn DAV. Không gán giá bán từ lô, không đổi giá dữ liệu thật trong task.
- Kiểm tra latest receipt/API/DAV writer và17 JS tests; user nhận QA giao diện.
- User nhận QA giao diện; chưa pass visual/interactive QA.

### Dòng xác nhận liên kết DAV nổi bật (2026-09-15)

- Dòng checkbox trong modal xác nhận dùng nền kem, viền nâu, chữ đậm và
  ô chọn lớn hơn; giữ nội dung/ID/label và logic xác nhận. Nằm trong modal
  body cuộn hiện có, label co giãn/xuống dòng; header/footer giữ nguyên.
- Frontend contract, Jinja và diff check đạt. User nhận QA giao diện;
  chưa pass visual/interactive QA.

Last updated: 2026-09-15.

### Lưu cố định đường dùng suy ra trong danh mục DAV (2026-09-15)

- User xác nhận lưu kết quả vào DAV local. Migration
  `20260915_dav_stored_route` thêm suggested_route và suggested_route_rule_version;
  normalizer/upsert lưu, cập nhật hoặc xóa kết quả theo nguồn. Model/list/detail/
  autocomplete/clinic_defaults đọc giá trị đã lưu, không tính lại khi đọc.
  Giữ route/raw gốc và nhãn gợi ý; không đổi UI hay biến dữ liệu suy ra thành
  thông tin đã được DAV/nhân viên xác nhận. Các mục14/09 bên dưới là lịch sử.
- Đã backup custom dump15.771.422bytes (0600, pg_restore list kiểm tra),
  upgrade đúng revision và ghi15432/54752 dòng bằng
  `scripts/persist_dav_route_suggestions.py`;39320 còn trống. Journal verified:
  `reports/dav-stored-route-2026-09-15/journal.json`. Hash trước/sau xác nhận
  mọi field DAV ngoài2 cột mới (kể cả updated_at),51 medicines,48 lô,2744
  transactions và975 prescription_items toàn bảng không đổi.
- Writer mặc định read-only preview, apply yêu cầu backup/journal mới và
  fingerprint/count khớp; khóa DAV khi ghi, kiểm phạm vi và idempotency,
  hậu kiểm bằng session mới sau commit. Đã chạy thử toàn bộ bằng rollback.
- 143 Python tests đạt (141 rules/defaults/API/sync/identity và2 rollback
  persistence/sync); schema/Alembic strict/diff đạt. Kiểm reader với inference
  bị chặn vẫn trả FDG Tiêm từ DB. Không restart/deploy/sync upstream;
  không chạy browser QA trong task dữ liệu này.

### Tủ thuốc: người phụ trách xác nhận DAV (2026-09-14)

- Cập nhật theo yêu cầu kế tiếp: chấp nhận các mapping đã nỗ lực thực hiện.
  Hiện27 confirmed/24 unlinked; ghi mapping_acceptance vào26 snapshot còn
  pending. Thuốc7485 đã được user đổi sang DAV4461 và xác nhận trực tiếp,
  giữ nguyên toàn bộ. Metadata ghi nguồn yêu cầu Codex, không giả danh tài
  khoản hay ghi là đã kiểm tra hộp thuốc. Nút “Đã xác nhận DAV” màu xanh,
  vẫn mở xem/đổi. Backup, journal và post-commit verification trong
  `reports/dav-migration-2026-09-14/user-acceptance/`; tồn/giá/48 lô/2744
  giao dịch/877 dòng đơn không đổi.17 review tests + frontend contract đạt.
- Quyết định mới của user thay thế việc bỏ liên kết người dùng: không tiếp
  tục tự chọn sản phẩm bằng suy luận. 27 liên kết đã migrate chưa được người
  dùng duyệt; read model hiện pending, 24 thuốc chưa liên kết. Không ghi lại
  dữ liệu thật trong task này, không rollback liên kết cũ.
- `reference_review.py` + GET/POST `/api/medicines/<id>/reference-review`
  cung cấp preview, quyền admin/nhóm `ql-kho-thuoc` hoặc `ql-thuoc`, xác nhận
  rõ ràng và khóa/version/unique guards. Writer chung giữ tồn/lô/giá/quy đổi;
  chỉ luồng người duyệt được sửa liên kết khác hoạt chất/hàm lượng/dạng bào
  chế khi có lịch sử, sau cảnh báo và xác nhận. Migration mặc định vẫn chặn.
  Snapshot ghi human_review actor/time và lưu review cũ trong mapping_history.
- Theo yêu cầu tiếp theo của user, UI dùng bảng 10 cột: nút nằm ở cột
  “Liên kết DAV” trước “Tác vụ”, tách khỏi tên thuốc; giữ form cũ. Cột mới
  căn giữa, rộng tối thiểu 12rem; bảng 86rem nằm trong table-responsive cũ.
  Empty state colspan 10. Modal riêng dùng
  shared autocomplete, tìm tên/hoạt chất/SĐK, xem thông tin ban đầu và nguồn
  được chọn, checkbox trước lưu. Parent modal flex/max-height → body min-height
  0/scroll → hai cột tự xếp dọc ở màn nhỏ; dropdown dùng shared popover.
- 72 PostgreSQL rollback +20 JS tests đạt; frontend contract và syntax đạt.
  Không restart/deploy. **Chưa pass visual/interactive QA**: user nhận QA.

### Mở rộng gợi ý đường dùng từ dạng bào chế DAV (2026-09-14)

- User duyệt mở rộng và yêu cầu thống kê. Chỉ sửa owner `reference_route.py`:
  khớp toàn mô tả sau chuẩn hóa; nhận các cách diễn đạt pha thuốc, si rô,
  uống/tiêm/truyền, vị trí tiêm ghi rõ, dùng ngoài, mắt/tai/mũi, đặt/thụt,
  hít/qua da. Viên nhai/tan trong ruột/phân tán trong miệng có gợi ý uống;
  viên nén/nang/bao phim đơn thuần, nhiều đường dùng hoặc phần dư chưa hiểu
  vẫn để trống. Không lấy từ khóa đầu tiên để bỏ qua phần còn lại.
- PostgreSQL READ ONLY toàn54752:10151→15432 (18,54%→28,19%), thêm5281;
  39320 chưa có gợi ý, trong đó7674 thiếu dạng bào chế/placeholder,31646 có
  mô tả chưa khớp.439 dạng nguồn có gợi ý mới; không có nhóm regex xung đột
  trên dữ liệu hiện tại. Báo cáo/chi tiết dạng trước-sau:
  `reports/dav-route-coverage-2026-09-14/report.md` và `coverage.json`.
- 126 Python (bao gồm9 PostgreSQL/API read-only) +22 JS đạt. Kiểm tra cả
  Unicode/khoảng trắng, source priority, đường dùng phối hợp/phủ định, dung
  môi, phân biệt hít/uống và không thay raw. Không đổi UI, dữ liệu DAV/kho,
  không sync/restart/deploy; user tiếp tục QA, **chưa pass visual/interactive QA**.

### Đường dùng gợi ý tập trung tại lớp dữ liệu DAV (2026-09-14)

- User duyệt xử lý tại DAV. Owner mới `reference_route.py` dùng allowlist
  dạng bào chế khớp toàn chuỗi: uống, tiêm, truyền, nhỏ mắt/tai/mũi, xịt mũi,
  bôi da, đặt âm đạo/trực tràng, ngậm dưới lưỡi. Không đoán viên thường,
  dạng hỗn hợp hoặc vị trí tiêm. Bỏ bảng suy luận riêng trong clinic_defaults.
- Model to_dict và query projection trả suggested_route riêng route nguồn;
  autocomplete/form dùng chung helper. Tính khi đọc nên bản cũ và sync mới
  đều dùng được; không thêm cột DB, ghi đè raw/route hay đổi thuốc trong kho.
  Chi tiết DAV và summary form ghi Đường dùng (gợi ý), ưu tiên route thật.
  Export DAV vẫn xuất route gốc; không nhầm gợi ý thành dữ liệu cơ quan nguồn.
- UI giữ chain cũ: DAV modal-xl/scrollable → body → detail-grid label/value;
  chỉ thay nhãn/giá trị hàng đường dùng. Form giữ summary grid và input editable.
- Read-only toàn54752 nguồn:0 explicit route,10151 có gợi ý,44601 để trống.
  Đây là độ bao phủ quy tắc, không phải số đường dùng đã được xác minh lâm sàng.
- 61 Python helper/model/normalizer/defaults +9 PostgreSQL/API read-only
  +22 JS DAV detail/search/chọn/đổi/lưu đạt (92 tổng); frontend contract,
  JS/Python syntax và diff check đạt. **Chưa pass visual/interactive QA**;
  user nhận browser QA. Không restart/deploy/sync hay thay dữ liệu parent task.

### Thêm thuốc: gợi ý từng trường DAV, giữ quy cách gốc (2026-09-14)

- Theo thuốc FDG trong ảnh user: gợi ý Tiêm từ dạng bào chế rõ (editable),
  ml từ thể tích nguồn, đóng gói lọ độc lập với tỷ lệ; giữ khoảng15,8–16ml
  và để tỷ lệ trống. Nguồn có đường dùng riêng luôn ưu tiên và khóa như cũ.
- Owner `catalog_mapping.py` trả thêm suggested_administration_method;
  adapter `clinic-catalog.js` điền/clear cặp input, giữ khóa explicit route,
  xác nhận gợi ý đơn vị/đóng gói. Quy cách DAV hiện trong ô Quy cách hiện có,
  tách khỏi hidden conversion được lưu; bỏ placeholder10, không mặc định viên
  khi chưa chọn đơn vị. Không sửa backend writer hoặc dữ liệu kho.
- Layout: cùng modal/body/fieldset/section/ô Quy cách; source text wrap trong
  ô hiện có, không thêm card hoặc thay bố cục đã thu gọn. Long text vẫn cần QA.
- 28 Python defaults +16 JS chọn/đổi/lưu +8 PostgreSQL/API read-only đạt;
  frontend contract, syntax JS và diff check đạt. Lookup thực tế31940 trả
  đúng Tiêm/ml/lọ/null và nguyên văn Lọ15,8–16ml. User nhận browser QA:
  **chưa pass visual/interactive QA**. Không restart/deploy hoặc sync DAV.
- Nguồn đã kiểm: https://dichvucong.dav.gov.vn/congbothuoc/index;
  POST https://dichvucong.dav.gov.vn/api/services/app/soDangKy/GetAllPublicServerPaging.
  Form tìm trong bản DAV đã đồng bộ local, không gọi DAV mỗi lần gõ.

### Thu gọn modal thêm/sửa thuốc để giảm cuộn desktop (2026-09-14)

- User yêu cầu form không phải cuộn do padding lớn, giữ bố cục và phong cách.
  Chỉ sửa `pages/medicine-management.css`; giữ nguyên fields, DOM, JS/save/DAV.
- Trace: modal-dialog giới hạn viewport → modal-content/form flex → header
  và footer cố định → body auto overflow → nguồn DAV + fieldset grid → các
  nhóm và input. Giảm kích thước nội dung tại từng tầng, không che overflow.
- Thu gọn header/icon, padding nhóm, gap/label/input/footer; DAV thành3 cột
  từ64rem; bốn nhóm giữ2x2 từ64rem, field grid4 cột từ container28rem.
  Chữ nhập giữ14px theo token; viewport nhỏ/nội dung dài vẫn truy cập qua body.
- Frontend contract và diff check đạt. Môi trường không có CSS parser riêng.
  User nhận QA giao diện; **chưa pass
  visual/interactive QA**, chưa chứng nhận hết cuộn tại viewport thực tế.
  Cần kiểm edit thuốc Zopinox trong ảnh, thêm trước/sau chọn DAV, cảnh báo,
  tên/hãng dài và màn nhỏ; không sửa dữ liệu để QA.

### Rà lại mapping DAV theo tên + hoạt chất (2026-09-14)

Đã thực hiện tiếp đợt2 theo yêu cầu user: **27/51 linked,24 còn lại có note**.
Xem mục dưới đây; số10/41 trong phần rà ban đầu là lịch sử.

### Mapping DAV đợt2: 27/51 đã liên kết,24 có ghi chú (2026-09-14)

- Commit thêm17:7434,7436,7444,7446,7451,7454,7455,7456,7458,7460,7461,7462,
  7463,7472,7479,7482,7485. Giữ10 liên kết trước; không gộp/xóa thuốc.
- `catalog_service` bỏ guard so quy cách kho/DAV; writer nạp identity từ DAV
  kể cả trống, bỏ fallback identity cũ. Quy đổi kho vẫn giữ nguyên. Không
  nới public PUT hoặc bỏ guard duplicate/stale/source lỗi.
- `dav_reference_sync.correct_verified_dav_identity` sửa đúng2 nguồn
  source_id16739/16723 (Exidamin/Mebamrol) khi ID,SĐK,tên,cặp sai đều khớp.
  Căn cứ QĐ718/QĐ-QLD và SPM; raw giữ nguyên, sync sau không tái đưa lỗi cũ.
- Manifest ghi rõ alias/ưu tiên tên đầy đủ/bản đăng ký hiện hành. Mirtazapine
  7485 dùng thêm dữ kiệnẤn Độ chọn Torrent;7439 chưa chọn. Không xác nhận hãng
  từng lô cho các mapping suy luận tên; căn cứ từng cặp có trong report.
- 24 còn lại:6 nhiều ứng viên,5 nguồn chưa hợp lệ,12 chưa xác lập tên,
  1 Mebamrol tên100/25 mâu thuẫn, trùng nguồn đã dùng cho7455. Note từng dòng
  và bước tiếp: `reports/dav-migration-2026-09-14/stage-2/report.md`.
- Backup `/tmp/qlpk-before-dav-stage2-20260914-193425.dump` đã kiểm custom dump.
  70 tests đạt; schema đạt. Hậu kiểm27 links khớp nguồn; stock/prices/conversion/
  settings và48 lô/2744 giao dịch/877 dòng đơn giữ nguyên.24 chưa map và10
  liên kết trước không đổi. Một số nguồn cập nhật metadata thời gian đồng thời,
  raw chỉ đổi lastModificationTime; identity không đổi, verification ghi rõ.
- Không deploy/restart hay thay UI trong scope mapping; user tự QA,
  chưa pass visual/interactive QA cho phần hiển thị dữ liệu mới.

### Kết quả rà ban đầu trước đợt2 (lịch sử)

- User đính chính: tên thuốc + hoạt chất là khóa tìm nguồn; các trường danh
  mục lấy lại từ DAV. Khác hàm lượng/quy cách/hãng ở trường cũ không phải
  điều kiện loại mapping. Không mặc định yêu cầu hãng/SĐK cho toàn bộ41.
- Audit read-only trực tiếp local51 thuốc/54752 DAV: vẫn10 linked/41 unlinked.
  Trong41:7 ứng viên rõ,3 cần alias/chuẩn hóa tên,7 nhiều ứng viên/quy tắc tên,
  3 nguồn đảo trường,3 tên phù hợp nhưng hết hiệu lực,18 chưa xác lập khớp tên.
  Ví dụ bỏ sót trước: Sertralin50USP và Donepezil10mg có tên DAV tương ứng.
- Trong10 đã ghi:7 phù hợp khóa sau chuẩn hóa; SaVi Quetiapine25,Bigiko,
  Ridton có nhiều ứng viên và lần trước dùng thêm tiêu chí chọn. Chưa đổi link.
- Code hiện còn guard so quy cách ở reference_preview, fallback field cũ khi
  nguồn trống và UNIQUE nguồn cho mỗi dòng kho. Cần giải quyết chọn bản DAV
  ưu tiên, tên alias, nguồn lỗi, dòng kho trùng khóa trước migration tiếp.
- Report đủ51 dòng + JSON ứng viên/checks:
  `reports/dav-migration-2026-09-14/reaudit-name-ingredient.md`.
  Đọc lại toàn bộ thuốc/nguồn rà không đổi;48 lô,2744 giao dịch,877 dòng đơn
  thuộc51 thuốc giữ nguyên hash ban đầu. Không sửa app/UI hoặc ghi DB.
- Mục migration dưới đây là lịch sử theo tiêu chí cũ; lý do giữ41 trước đó
  đã được thay thế bằng phân loại trong report mới, chưa có migration bổ sung.

### Migration dữ liệu DAV local: 10/51, còn 41 cần xác minh (2026-09-14)

- User yêu cầu kiểm tra và migrate toàn bộ kho. Đã audit51 thuốc trên local
  `qlpk_db` (localhost:5432), đối chiếu54752 dòng nguồn. Áp dụng10 cặp có căn
  cứ tên biệt dược/hoạt chất/hàm lượng/quy cách, chưa thể ghép chắc chắn41.
- Các mã đã ghi:7447,7452,7453,7468,7469,7470,7474,7477,7478,7483.
  Còn lại thiếu hãng/SĐK, trùng bản đăng ký, tên sai, lệch quy cách/đơn vị,
  nguồn hết hiệu lực; Exidamin/Mebamrol bị đảo hoạt chất–hàm lượng ngay trong
  raw DAV. Không sửa nguồn, gộp thuốc hoặc thay bằng thuốc tương đương.
- Script mới `scripts/migrate_clinic_medicines_to_dav.py`: read-only mặc định,
  manifest pin database + hash đầy đủ thuốc/nguồn, guard nội bộ và version,
  một transaction, nhật ký before/after trước commit; từ chối manifest cũ.
- Backup `/tmp/qlpk-before-dav-data-migration-20260914-122453.dump`, 0600,
  đã kiểm pg_restore list. Report/manifest/audit/pending/journal/verification
  nằm ở `reports/dav-migration-2026-09-14/`. Không deploy hoặc đổi UI.
- Sau commit đã đọc lại:51 thuốc,10 linked/41 unlinked;41 bản chưa chọn giữ
  nguyên, tồn/giá/quy đổi giữ nguyên; hash48 lô,2744 giao dịch,877 dòng đơn
  không đổi. Nguồn DAV của10 thuốc không đổi. Schema contract đạt trước ghi;
  50 DAV/API/Excel +6 manifest/migration tests rollback đạt.
- Cần user cung cấp hãng/SĐK và xác nhận mâu thuẫn từng thuốc trong report
  để hoàn tất41. Đã hỏi bất đồng bộ; chưa nhận câu trả lời trong lượt này.

### Tủ thuốc: DAV bắt buộc, migration nội bộ (2026-09-14)

- Yêu cầu mới thay luồng liên kết thủ công trước đây: gỡ cột/bộ lọc nguồn,
  nút Liên kết/Liên kết lại, preview/footer và lifecycle mapping ở frontend.
  Thêm mới vẫn chọn DAV; sửa chỉ cấu hình phòng khám, không gửi nguồn.
- `catalog_service.write_clinic_medicine` mặc định chặn link/relink/unlink/
  refresh trên thuốc đã tồn tại. Chỉ caller Python nội bộ truyền keyword
  `allow_reference_mapping=True` mới dùng được guards/version/history cũ;
  HTTP kể cả admin hoặc JSON giả keyword không thể bật quyền này.
- POST/Excel đã dùng cùng writer bắt buộc nguồn DAV hợp lệ. Chỉ có một nơi
  tạo Medicine trong app. Không đổi schema, không migrate dữ liệu thật.
- Layout trace: main shell → toolbar surface/grid → ba field lọc;
  table surface → table-responsive → bảng chín cột → pager hiện có.
  Bỏ track nguồn của grid, giữ vùng cuộn/bố cục form/màu và trường còn lại.
- 50 Python rollback (API, Excel, migration nội bộ), 15 JS lifecycle/save,
  syntax và frontend contract đạt. **Chưa pass visual/interactive QA**;
  user tự kiểm bảng rỗng/có dữ liệu/dày, thêm/sửa và desktop/mobile.

### Căn lề bảng thuốc trong màn bác sĩ (2026-09-13)

- User duyệt căn giữa ngang toàn bộ tiêu đề cột và giá trị STT, lịch uống,
  đường dùng, số lượng, thành tiền; tên thuốc giữ căn trái.
- Chỉ sửa `doctor-prescription.css`: bổ sung căn giữa các chỗ còn lệch trái,
  giữ chiều rộng cột, scroll owner, ghi chú, nhóm đơn và thông tin dưới tên.
- Frontend contract, Doctor examination contract (15 draft recovery và
  8 quantity policy cases), diff check đạt. User tự QA trình duyệt:
  **chưa pass visual/interactive QA** cho thay đổi căn lề này.

### Tủ thuốc: tìm DAV bằng tên và đổi form theo ảnh user (2026-09-13)

- Sửa lỗi gõ Diropam trong Liên kết DAV không ra kết quả: bỏ nhánh gửi tên
  vào exact registration_number. Dùng search tên/hoạt chất/SĐK chung, vẫn
  gửi clinic_medicine_id để lấy preview. PUT lấy SĐK từ thuốc đã chọn,
  không lấy chuỗi đang gõ; giữ version/duplicate/quy cách/history guards.
  Tra DB read-only thực tế Diropam có2 kết quả: VD-14779-11, VD-34626-20.
- User tiếp tục yêu cầu đổi UI theo ảnh mới, thay yêu cầu giữ UI gốc trước.
  Đã triển khai header icon/tiêu đề trái/mô tả/lá trang trí; vùng tìm DAV
  riêng; bốn section với icon, subtitle và thanh màu; footer Lưu/Hủy.
  Bỏ nhấp nháy/scale/bóng đỏ cũ của Loại đơn thuốc. Giữ field IDs, readonly,
  khóa nguồn và lô, save/reset/preview; không đổi UI bên ngoài modal thuốc.
- Constraint chain: modal-dialog căn giữa và giới hạn viewport → form flex
  max100dvh−1rem → header/footer cố định, body min-height0 + cuộn → section
  grid basic/pricing và packaging/warnings. Dưới72rem xếp một cột; field
  grids theo container32rem. DAV dropdown vào flow để không cắt kết quả
  khi form Liên kết ngắn. Không chồng khung card trong card.
- Icon sections qua shared icon-system; dependency include rõ để không chờ
  header loader. Typography giữ token control/label14, title28. Text trên UI
  chỉ là hướng dẫn nghiệp vụ, không đưa field key hoặc lỗi thô ra giao diện.
- Kiểm code: 40 Python DAV/API rollback (gồm tìm tên/hoạt chất/SĐK rồi lưu),
  17 JS lifecycle/save/error đạt; syntax JS, Jinja, IDs, label targets,
  JS-to-DOM references, icon rendering và frontend/auth/feedback contracts đạt.
- **Chưa pass visual/interactive QA**: user tiếp tục nhận QA trình duyệt.
  Không mở browser, restart/deploy, migration hay sửa dữ liệu thật trong lượt.

### Sửa phân bổ cột và mép cuộn đơn thuốc (2026-09-13)

- User báo bảng/header đơn bất thường và duyệt xử lý. Sửa CSS owner:
  doctor-prescription.css chia Lịch uống28%/16% ngay hàng đầu bảng,
  tên thuốc nhận phần còn lại, header/footer wrap khi thiếu chỗ.
  doctor-examination.css dành gutter và10.4px (0.65rem) ở body clinical
  đang sở hữu cuộn; scrollbar overlay không phủ mã đơn/tổng tiền.
- Frontend contract và diff check đạt. Firefox tab QA mới, đơn thật ba
  thuốc BASIC/H: desktop header/bảng/footer căn cùng mép, ô liều gọn.
  Đo header clientWidth=scrollWidth=1376, body clientWidth=scrollWidth=1389,
  padding phải10.4px, gutter stable; console bộ lọc Lỗi không có entry.
- Mobile390×600 và390×844: header có đủ mã/trạng thái/nút khi wrap,
  bảng cuộn ngang bằng bàn phím độc lập, footer tổng tiền giữ trong khung.
  Không sửa/lưu dữ liệu đơn; khôi phục cấu hình responsive và đóng tab QA.
  Chưa kiểm trực quan chế độ hai cột lần/ngày hoặc mọi số lượng thuốc.

### Chuẩn autocomplete chung cho ICD và DAV field8 (2026-09-13)

- User duyệt tách lõi theo ICD và dùng chung với DAV. Owner mới:
  `components/autocomplete-field.js/.css` và macro `_autocomplete_field.html`;
  chuẩn dùng lại tại `references/ui/autocomplete-field.md`, có route/rule.
- ICD giữ adapter/public API và hook hiện hành; DAV chỉ cấu hình dữ liệu
  trong component Khám. Bỏ JS/CSS/DOM dropdown DAV riêng và stylesheet ICD
  cũ. Doctor, Lịch hẹn, Tâm lý đều load core trước adapter ICD.
- Chips/input cùng control, native popover nổi theo field, mở lên/xuống,
  cuộn tải tiếp; không còn panel DAV in-flow hay nút Xem thêm lớn. Core
  giữ debounce/abort/revision, keyboard/ARIA, reset/clear/destroy, guard
  readonly/history và chỉ một popup mở. Backend/data owner không đổi.
- QA tự động đạt: 4 ca core geometry/selection/dispose, 4 ca DAV selection/
  draft/patient switch/stale/error/pagination, ICD loader/pagination,
  doctor-detail-defaults và medical-history bootstrap. Jinja macro/escape,
  JS syntax, frontend contract, diff check đạt. HTTP 200 và nội dung asset
  localhost khớp checkout cho core JS/CSS và adapter ICD.
- Chưa pass visual/interactive QA: Firefox đang được user sử dụng, chuyển
  sang tab Codex riêng nhưng chưa có phiên đăng nhập. Đã đề nghị đăng nhập
  tài khoản bác sĩ; chưa có kết quả browser populated sau refactor này.
  Cần kiểm ICD/DAV desktop/mobile, popup không tăng card height/không bị
  clipping, mouse/keyboard/remove, modal/history và chuyển bệnh nhân.
- Autocomplete Tủ thuốc/địa chỉ/chỉ định chưa migrate. Mục DAV in-flow dưới
  đây là lịch sử trước refactor, không còn là contract UI hiện hành.

### Bác sĩ: Thuốc đang dùng autocomplete DAV (2026-09-13)

- Field8 thay textarea bằng tìm DAV/chọn nhiều/bỏ từng thuốc. Endpoint
  read-only hiện có, 12 dòng + Xem thêm, status=all; tên/hoạt chất/SĐK và
  nhà sản xuất giúp chọn. Component Khám giữ hidden JSON tên/hàm lượng,
  payload appointment không đổi; query không dirty/draft. Không ghi kho/đơn.
- Clear/render/restore hủy request/debounce và reset UI; generation/context
  token chặn response cũ. Loading/history view chặn mutation. Tên có dấu
  phẩy được giữ nguyên qua collect/render/restore. Tên legacy giữ lại.
- QA tự động:4 ca current-medications và doctor-detail-defaults đạt;
  frontend contract, JS syntax, diff check đạt. Firefox tab QA riêng, hồ sơ
  QA CLS: search Panadol12→15, chọn bằng phím, hai thuốc gồm tên/hàm lượng
  có dấu phẩy; mobile390 có chips và danh sách DAV thật. Đã sửa tiếp span
  dữ liệu bị CSS nhãn uppercase thành div, dùng font token thường.
- Chưa pass visual/interactive QA đầy đủ: Firefox chuyển sang trang khác
  trước khi kiểm lại chỉnh chữ cuối, bỏ thuốc và A→B→A bằng UI. Các ca này
  có unit test; chưa bấm Lưu thực vào hồ sơ và chưa kiểm server round-trip.
  Tab QA riêng có bản nháp chưa lưu trên hồ sơ QA CLS, cần bỏ khi tiếp tục;
  không đụng tab bác sĩ gốc của người dùng.

### Tủ thuốc: rõ luồng thêm/sửa, cho liên kết lại DAV, giữ UI gốc (2026-09-13)

- User duyệt sửa code, tự làm QA giao diện và yêu cầu giữ UI gốc. Giữ hai
  cột/bốn nhóm, màu/kích thước và các ô tồn chỉ đọc; không thiết kế lại form.
  Form thêm chỉ mở nhập sau khi chọn DAV, đổi lựa chọn xóa thông tin nguồn
  và gợi ý cũ. Tồn/giá vốn/hạn dùng chỉ ghi ở nhập lô; bỏ đọc hạn dùng cũ
  vào ô hiện tại. Đơn vị/quy đổi có tồn/lô/giao dịch bị khóa.
- Sửa chỉ ghi cấu hình phòng khám; tên/hoạt chất/hàm lượng/nước sản xuất
  giữ nguyên. Đường dùng/Nội-Ngoại có dữ liệu DAV cũng khóa; nguồn trống
  vẫn cho phòng khám nhập. Autocomplete không giữ hidden value cũ khi gõ lại.
- Nút Liên kết DAV/Liên kết lại DAV dùng cùng luồng đối chiếu SĐK, xem
  trước và xác nhận; hỗ trợ đổi nguồn hoặc cập nhật cùng nguồn. API kiểm
  version, trùng nguồn, quy cách và tương thích hoạt chất/hàm lượng/dạng
  bào chế khi có lịch sử kho; không nhận payload gộp sửa cấu hình với mapping.
  Giữ ID/giá/quy đổi/tồn/lô/đơn cũ, ghi mapping_history trong snapshot có sẵn.
- Chống submit lặp, chặn đóng lúc đang lưu và bỏ phản hồi của form cũ.
  Validation dùng nhãn nghiệp vụ và user_message; form không hiện exception,
  field key hay lỗi response thô. Không đổi schema/migration hoặc dữ liệu thật.
- Kiểm thử: 81 Python mapping/query/API/nhập lô (ghi thử rollback), 17 JS
  flow/save/race/error đạt. Python/JS/Jinja syntax, ID duy nhất, cấu trúc
  form hai cột/bốn nhóm và frontend/auth/feedback contracts đạt.
- **Chưa pass visual/interactive QA** theo yêu cầu user tự QA. Chưa commit,
  deploy hoặc restart server. Các mục Bổ sung thông tin bên dưới là lịch sử;
  quy tắc cấm đổi nguồn đã được thay bằng luồng liên kết lại có kiểm tra.

### Typography modal thêm/sửa thuốc (2026-09-13)

- Modal `medicineModal` cấu hình token control gốc và clinic cùng 14px/400;
  nhãn 14px/600. Quy cách kế thừa chữ control cả trống/có dữ liệu, bỏ lớp
  16px và nhấn đậm riêng. CSS chung nhận token weight/label, giữ mặc định
  của các màn khác. Token gốc cần cấu hình vì header nạp lại typography.css.
- QA: frontend contract và diff check đạt; Firefox computed style toàn bộ
  input/select/Quy cách 14px/400, nhãn 14px/600. Đã xem modal trống và chọn
  Panadol DAV thật, quy cách 1 hộp = 120 viên; hủy, không lưu thuốc thử.
- Mobile390 đã xem đầu/cuối modal, focus đưa trường cuối vào vùng cuộn.
  Chưa pass visual/interactive QA mobile: grid nhiều cột hiện có cắt nhãn
  Loại đơn thuốc và placeholder các ô hẹp; chưa đổi layout trong lát typography.

### Tách sửa thuốc và bổ sung thông tin DAV (2026-09-13)

- Sửa thuốc cũ không còn tìm DAV/checkbox liên kết. Bổ sung thông tin là
  hành động riêng: nhập đúng SĐK trên hộp → xem bảng trước/sau → cập nhật
  hoặc Hủy giữ nguyên. Chờ GET thuốc mới nhất xong mới mở đúng chế độ;
  callback tồn kho cũ không được ghi vào form đã reset/chuyển thuốc.
- Preview do backend sở hữu, cùng guard với writer: SĐK hiện tại/cũ khớp,
  version thuốc chưa đổi, quy cách rõ nghĩa không xung đột. Nguồn thiếu
  trường giữ giá trị cũ. Không đổi mã, giá, đơn vị/quy đổi, tồn/lô/lịch sử.
- Dữ liệu thật: Lupilopram 890110024223 có30 viên/hộp, kho Exidamin có50:
  preview và PUT chặn. DAV Exidamin 893110043900 có raw payload ghi
  hoatChatChinh=10mg, hamLuong=tên hoạt chất: chặn bổ sung từ nguồn này,
  hiện hướng dẫn báo quản lý, không tự đảo trường hoặc sửa dữ liệu nguồn.
- QA đạt51 Python (mapping/query/rollback) và11 JS (lifecycle async,
  debounce/stale/cache, mapping, cancel, payload, double-submit/retry).
  Frontend/auth contract, Jinja/Python/JS syntax và diff check đạt.
- Firefox Admin dữ liệu thật: Edit không tìm DAV; lookup SĐK rỗng/sai,
  preview50/30 và nguồn sai trường bị khóa; Hủy giữ tên và834 viên.
  Thêm Panadol vẫn map Nội/viên/hộp120, confirmation giữ nguyên.
  Mobile390×844/600: source dài, cảnh báo, footer; Tìm lại/chọn lại,
  cuộn thân tới cuối và cuộn ngang bảng bằng bàn phím, Hủy đều kiểm được.
  Đã tắt RDM, trả chiều cao844; không tạo server/tab mới, không lưu thật.
- Giới hạn: guard số lượng trong Hoạt chất là kiểm tra lỗi dữ liệu hiển
  nhiên của bước bổ sung; không chứng nhận chất lượng toàn bộ DAV hoặc
  tương đương thuốc. Không tự sửa nguồn hay liên kết thuốc hàng loạt.

### Mapping DAV vào form thêm thuốc (2026-09-13)

- User duyệt map đường dùng, quốc gia→Nội/Ngoại, dạng bào chế→gợi ý đơn vị,
  quy cách→đóng gói/số đơn vị. Owner backend `catalog_mapping.py`; lookup
  trả clinic_defaults, không đoán ở frontend. Không map loại đơn theo quốc gia.
- Form thêm điền cả input hiển thị/hidden; source summary hiển thị đủ dạng,
  quy cách, nhà sản xuất/SĐK. Xác nhận gắn với bộ unit/package/count hiện tại,
  đổi nguồn xóa gợi ý và lỗi cũ; legacy giữ cấu hình, không đụng tồn/lô.
- Sửa chuỗi quy đổi cũ ghép sai “Hộp N đơn vị đóng gói” thành
  “1 đơn vị đóng gói = N đơn vị dùng” tại writer. DB Nội/Ngoại NOT NULL:
  thiếu quốc gia yêu cầu chọn rõ, không mặc định thuốc Nội; không migration.
- QA: 48 Python test mapping/query/rollback integration và9 JS tests đạt;
  frontend contract, JS syntax/diff đạt. POST/GET thử được rollback.
- Firefox Admin desktop: Panadol VN→Nội, viên, hộp,120; browser chặn lưu
  trước xác nhận; đổi nguồn xóa mapping. Panadol Optizorb Ireland→Ngoại,
  hai quy cách giữ count trống. Mobile390: nguồn dài/checkbox hiển thị,
  Duphalac dung dịch/đa quy cách giữ unit/count trống, điền Ngoại đúng nguồn;
  xác nhận click được, End cuộn thân modal đến phần dưới. Chưa có đường
  dùng trong dữ liệu DAV hiện kiểm được: mapping route kiểm bằng test và
  rollback, không gọi đó là visual QA của route có dữ liệu. Không lưu thật.

### Hoàn tất lượt sửa và QA giao diện quản trị (2026-09-13)

- Đã tiếp tục QA thực trong Firefox Admin; các hạn chế click/modal/footer
  của snapshot bên dưới được kiểm tiếp, không còn coi thiếu phiên là blocker.
- Sửa ICD thiếu name nên validation không chạy và khóa nhầm ID submit;
  kiểm browser required/format sai, test pending/retry chống submit lặp.
- Sửa độ rộng bảng thuốc/DAV tại table-responsive; gỡ font16px riêng của
  bảng chi tiết lô, dùng token13. Tìm rỗng thuốc căn trái để không mất nhãn
  ngoài mobile viewport; thuốc/DAV đều kiểm lại empty/footer thật.
- Sửa parent flex Lịch bận, bảng/empty responsive, radius input Flatpickr
  có hidden sibling; badge Từ viết tắt một dòng. Đã reload state bị lỗi.
- Desktop/mobile đã kiểm các bảng dày/thưa, trang cuối, modal có dữ liệu,
  DASS21 tới câu cuối và tab Kết quả; gợi ý Lịch bận chọn/reset/cuộn ngang.
  Gói dịch vụ không còn launcher/dropdown; browser URL cũ về index.
- 13 test JS, frontend/brand/auth/workspace contract, Jinja/HTTP18 đạt.
  Chi tiết18 màn, bằng chứng và giới hạn: `reports/admin-ui-qa-2026-09-13.md`.
  Không chứng nhận CRUD/import/sync hoặc retry mạng browser chưa chạy.
  Cảnh báo tồn tổng/lô Escitalopram lệch−1656 được giữ, không chỉnh số kho.

### Ẩn Gói dịch vụ và QA mobile quản trị (2026-09-13)

Snapshot trước lượt hoàn tất bên trên; các mục chưa kiểm dưới đây là lịch sử.

- Theo yêu cầu user, gỡ Gói dịch vụ khỏi navigation và lựa chọn phím tắt;
  workspace loại tab đã lưu qua RETIRED_WORKSPACE_PATHS. URL cũ redirect
  302 về index. Giữ template/API/dữ liệu gói, không xóa nghiệp vụ.
  Firefox reload đã bỏ tab cũ; HTTP redirect và test workspace runtime đạt.
- Trace shell → filter-bar → form-select: hai shared CSS dùng background
  shorthand xóa SVG mũi tên Bootstrap. Đổi sang background-color tại owner;
  reload Tài khoản mobile xác nhận hai select có mũi tên.
- Trace card → header flex nowrap → search-box: danh mục/nhóm dịch vụ và
  Ngày lễ ép tiêu đề/placeholder. Cho header wrap, search full row dưới36rem
  tại shared admin UI. Cả ba màn đã xem lại mobile với dữ liệu thật.
- Trace table-responsive → di-table: các cột có width chiếm hết không gian,
  cột hậu quả bị ép khiến dòng cao khoảng150px. Table min-width62rem giữ
  chiều rộng đọc được trong wrapper cuộn; mobile reload dòng đã gọn lại.
- Đã nhìn phần đầu18 trang hiển thị ở390×844: ICD, Tài khoản, Nhóm quyền,
  Phân quyền, Hoạt chất, Dị nguyên, Tương tác, Từ viết tắt, Nhóm dịch vụ,
  Dịch vụ, Ngày lễ, Lịch bận, Phím tắt, Tài liệu, danh sách/editor khảo sát,
  Tủ thuốc và DAV. Đây không phải pass toàn trang: một số bảng/footer nằm
  dưới viewport; editor tạo mới và Tài liệu chưa chọn thư mục chỉ chứng minh
  bố cục ban đầu. Các state dữ liệu thật ở lượt trước vẫn ghi riêng bên dưới.
- Công cụ CUA đọc/navigate được nhưng click không kích hoạt, paste timeout;
  setValue không phát input nên không tính là search pass. Sau đó cửa sổ
  Firefox đang dùng thay đổi, dừng thao tác để không tác động tab cá nhân.
  Chưa pass visual/interactive QA toàn bộ18 trang: còn cuộn ngang/footer,
  modal/validation, thao tác và desktop sau các patch CSS vừa nêu. Không
  kết luận thiếu phiên/quyền; không ghi dữ liệu vận hành.
- Frontend/brand/workspace contract, API auth contract, AST main.py và
  git diff --check đạt sau thay đổi. Chưa commit/deploy.

### QA tiếp màn quản trị: xác minh điều kiện và lỗi runtime (2026-09-13)

- Tìm được phiên Admin hiện có trong Firefox container Cá nhân; không thiếu
  tài khoản, server hay dữ liệu. Nhận định thiếu phiên ở lượt trước là do
  mở cửa sổ dùng role khác; không yêu cầu user cấp thêm quyền.
- Sửa ALL_PERMISSIONS thiếu Dị nguyên/Tài liệu/Phím tắt làm menu redirect
  về Trang chủ. Reload header hydrate quyền mới, ba màn đã mở được thật.
- ICD: 12.218 dòng; trang2/cuối1222, tìm A00.0/không có kết quả, mở sửa rồi
  hủy đạt. Mobile390: select intrinsic width và cột nhóm bệnh bị ép quá nhỏ;
  sửa parent flex basis/min-width cùng table min-width60rem, gỡ shared680px
  ghi đè riêng ICD. Đã nhìn lại toolbar và chiều cao dòng bình thường.
- Tài khoản: template còn filter thuốc/ngày và thiếu form mà JS lắng nghe;
  thay bằng form tìm kiếm/vai trò thật, sửa flex ô tìm không bị ép nhỏ.
  Enter admin trả1/9, reset trả9, vai trò Bác sĩ trả3. Test đọc ID trong
  template thật để tránh mock che lỗi thiếu form. API chỉ trả active vẫn
  là giới hạn tra cứu tài khoản ngừng hoạt động, chưa đổi backend users.
- Hoạt chất/Dị nguyên: `.catalog-dict-hidden` bị gom nhầm với width cột;
  trả display:none cho input file, reload xác nhận không lộ nút native.
  Bỏ ký tự K thừa trong title Từ viết tắt.
- Editor khảo sát đọc thiếu alias options: DASS-21 thật có21 câu và4 đáp án
  mỗi câu nhưng UI tạo2 đáp án trống. Nối alias theo contract; mở lại thấy
  đủ nhãn/điểm0–3, giữ ID và dữ liệu nguồn. Không lưu/sửa điểm hay mẫu thật.
- Lịch bận: Tất cả không gửi status khiến backend dùng active và ẩn lịch
  sử. Gửi tường minh; endpoint cá nhân hỗ trợ all/cancelled lịch cũ, vẫn
  khóa owner. Bỏ lọc trạng thái bằng màu badge và listener trùng, thêm guard
  phản hồi cũ, giữ tìm kiếm sau tải; sửa empty colspan5.
  Firefox: Tất cả hiện3 lịch cũ, Đã hủy hiện2 và khóa sửa; active hiện rỗng
  đúng vì không còn lịch sắp tới. Không thiếu dữ liệu để kiểm bảng lịch sử.
- Đã nhìn các màn có dữ liệu: thuốc51, DAV54.752, hoạt chất1.001, dị nguyên115,
  tương tác11, tài khoản9, nhóm4, phân quyền9user/4nhóm, từ viết tắt6,
  nhóm dịch vụ3, dịch vụ287, ngày lễ38, khảo sát11, phím tắt2, tài liệu có
  thư mục rỗng và thư mục1file. Thuốc trang cuối51–51; khảo sát11–11.
  Editor độc lập đã mở trạng thái tạo mới; editor tích hợp đã đọc mẫu thật.
- Gói dịch vụ chỉ là placeholder “đang được hoàn thiện”; không có CRUD thật
  để pass QA. Chưa pass visual/interactive QA toàn bộ19 màn: còn ma trận
  responsive/modal/validation và tương tác ghi; không coi đọc19route là pass.
  Không tạo bản ghi thử trên dữ liệu vận hành, không commit/deploy.
- QA hồi quy:12 test JS,2 test Python (quyền menu và lịch bận SQLite độc lập),
  frontend/auth contract, cú pháp JS/Python, Jinja19 và diff whitespace đạt.

### DAV: gỡ dữ liệu kỹ thuật khỏi chi tiết thuốc (2026-09-13)

- Theo yêu cầu user, bỏ nút/collapse/pre xem raw payload, JS render/reset
  JSON và CSS raw-json-box. API detail chỉ trả serializer nghiệp vụ hiện có,
  không thêm raw_payload vào response. Dữ liệu gốc trong DB vẫn phục vụ
  đồng bộ và cờ rút số; không đổi schema/dữ liệu nguồn.
- Modal giữ cấu trúc dialog-scrollable → modal-body → detail-grid, kết thúc
  ở Trạng thái. Firefox đã reload và mở thuốc (18)F-FDG thật: đủ thông tin
  thuốc/SĐK/nhà sản xuất/ngày/trạng thái, không còn nút hay vùng dữ liệu thô.
- Kiểm read-only detail khớp serializer, không raw_payload, missing record
  vẫn None; JS syntax và frontend contract đạt.

### DAV: bỏ phạm vi đồng bộ, xuất Excel theo bộ lọc (2026-09-13)

- User yêu cầu thay selector Phạm vi đồng bộ bằng Xuất Excel. Đã bỏ
  syncScope/nhánh sample trong UI và max_pages trong API/service sync.
  Nút Đồng bộ DAV luôn đi hết các trang nguồn; không chạy sync thật trong QA.
- Layout đã trace: main shell → clinic workspace/content-wrap → surface →
  toolbar grid. Grid giữ search minmax(0,1fr), hiệu lực 10rem, hai nút auto;
  dưới 56.25rem xếp một cột. Table-responsive/pagination giữ owner cũ.
- GET `/api/medicine-reference-catalog/export/excel` có require_auth, nhận
  search/status, xuất mọi trang theo cùng query/order với danh mục. Service
  `reference_catalog_export.py` dùng openpyxl runtime có sẵn, yield_per500 và
  write-only; không tải raw payload hay thay dữ liệu. Nút chống bấm trùng,
  báo đang xuất, timeout120s/lỗi mở lại nút, thu hồi object URL sau tải.
- Mẫu 15 cột, Sơn Tâm Clinic nâu–kem theo palette ứng dụng; ngày xuất/bộ lọc,
  tiêu đề, hàng xen kẽ, wrap text/chiều cao theo nội dung, freeze D7, autofilter,
  số lượng thực ở cuối. Mã nguồn/SĐK là text (@), ngày là date dd/mm/yyyy;
  dữ liệu bên ngoài bắt đầu = được giữ nguyên dạng text.
- QA: 10 Python tests (DB read-only/export/sync giả lập) + 12 JS tests đạt;
  frontend và auth contract đạt. Export toàn bộ 54.752 dòng khoảng15.74s,
  6.9MB, đọc lại đủ dòng; thuốc/batch vẫn51/48.
- Firefox phiên thật: reload DAV, tìm tablet/Enter, xuất và lưu file rồi
  kiểm đủ1.239 dòng thay vì chỉ10 dòng hiện tại. Desktop và mobile390px đã
  nhìn nút/toolbar với dữ liệu thật; mobile thử SĐK ra1 dòng và query rỗng
  kết quả0. Đã đóng responsive và khôi phục search trống/48.829 mục.
- File cuối đã render và mở Microsoft Excel, không yêu cầu sửa file; kiểm
  K8 là Text và giá trị đầy đủ890110074426, bảng màu/filter/freeze hoạt động.
  Artifact renderer hiển thị numeric-looking text thành scientific notation,
  nhưng XML/openpyxl và Microsoft Excel xác nhận mã gốc nguyên vẹn.

### ICD/auth và chuẩn hóa control các màn quản trị (2026-09-13)

- Theo yêu cầu user, trace 19 màn quản trị đã opt-in: input/placeholder/font,
  radius, nút, modal và lỗi tải danh mục. Foundation clinic là owner control
  13px/radius 9px, modal/surface 14px, heading modal 18px; page/shared shell
  tiêu thụ token và giữ fallback ngoài scope. Không đổi workflow ghi dữ liệu.
- ICD dùng sai localStorage token và thiếu utils.js; Phân quyền cũng thiếu
  auth wrapper khi dùng jQuery AJAX. Nạp owner auth chung; ICD bỏ refresh
  riêng, thêm state loading/error/retry/empty đúng DOM, guard response cũ,
  sửa pager trang cuối và filter nhóm bệnh có label/submit thật.
- Dọn ICD CSS 5 cột cũ về geometry 6 cột; bỏ form/button/table/toast rule
  trùng, sửa parent header wrap và wrapper scroll ngang. Phân quyền bỏ
  radius/checkbox font riêng, Lịch bận sửa chữ trắng, thuốc bỏ hint italic12.
- Phân quyền: đọc GET array group_id, chọn user theo ID thay display name,
  guard response cũ, khóa save đến khi tải xong và nối tìm user. Nhóm quyền
  bỏ filter thuốc/ngày/status không thuộc Group, nối search mã/tên/mô tả
  vào pager. Tài khoản lọc search trên dataset API, chống response cũ và giữ
  lọc khi realtime. API /users/ vẫn chỉ trả active; tra cứu inactive cần
  lát backend riêng. Thêm3 test Phân quyền và2 test lọc admin đều đạt;
  không cấp/thu hồi quyền thật để QA.
- QA đạt: frontend contract, JS syntax, Jinja 19 trang, HTTP 19 route +63
  asset, diff whitespace; 4 test ICD (auth wrapper thật, retry/error, race,
  trang cuối) và bộ test pagination. ICD tải 12.218 mã trên Firefox thật.
- Trạng thái QA lượt này được cập nhật bởi mục “QA tiếp màn quản trị” phía
  trên: đã tìm đúng phiên Admin và kiểm dữ liệu/tương tác thực; không còn
  bị chặn do thiếu phiên. Toàn bộ ma trận19 màn vẫn chưa pass.

### Dọn typography và CSS các menu quản trị còn lại (2026-09-12)

- User duyệt triển khai audit: Nhóm quyền/Từ viết tắt/Tương tác thuốc/ICD/
  Lịch bận/Tài liệu và mẫu khảo sát. Badge, metadata và ngày trong bảng
  kế thừa base13px; ICD dùng span thay code/small, không đổi field dữ liệu.
  Tài liệu có font gốc ở table, cả nhãn Link liên kết kế thừa.
- Gom các block gợi ý Lịch bận trùng thành container cuộn ngang + item;
  JS đổi class chọn sang is-selected, giữ hành vi điền lý do. Gỡ rule bảng
  trùng với shared admin owner. Tài liệu bỏ custom-animations không dùng.
  Xóa CSS toast Tài khoản, CSS/DOM toast editor khảo sát không còn caller.
  Tổng giảm216 dòng nguồn, bỏ31 !important. Không đổi API, payload, lưu,
  lọc hoặc thuật toán phân trang; các màn loại trừ không bị sửa.
- QA: frontend contract, JS syntax ba renderer, Jinja parse, diff whitespace,
  kiểm CSS và đối chiếu call site API/phân trang đạt; test tương tác pagination
  hiện có đạt. Các selector gốc của nhóm quyền/gợi ý đã được gom.
- **Chưa pass visual/interactive QA dữ liệu thật:** browser Nhóm quyền rỗng,
  mở Lịch bận chuyển về Đăng nhập. Chưa kiểm được badge trên bảng thật,
  chọn gợi ý, trang2/cuối, dữ liệu thưa/dày và bố cục mobile sau sửa.

### Tủ thuốc: trace và dọn cascade CSS (2026-09-12)

- Trace template load order → app-header main shell → clinic workspace →
  toolbar/table/pagination; modal-dialog → content/form → body scroll.
  Nguyên nhân: stylesheet animation dùng cả cho bác sĩ có dropdown lặp,
  page tiếp tục ghi đè bằng ID/`!important`; footer, nút và modal có nhiều
  block cùng thuộc tính; CSS toast cũ không còn caller.
- Tách base dropdown sang `components/option-autocomplete.css`; Tủ thuốc
  nạp trực tiếp, legacy tiếp tục qua import của `custom-animations.css`.
  Gom owner modal/footer/badge/loại đơn, dùng primary Bootstrap brand,
  bỏ selector chết và ép chiều rộng cột trái với shell.
  CSS page giảm 1008→835 dòng, `!important` 31→1 (ẩn/hiện); không đổi
  JavaScript, ID, field name, handler, API hoặc dữ liệu trong lần dọn này.
- QA đạt: frontend contract, Jinja parse, đối chiếu thuộc tính chức năng
  template, dropdown item legacy giữ nguyên, CSS cân bằng và không còn
  selector gốc trùng trong page. Browser 1280×720: 12 thành phần có computed
  font/kích thước/padding/overflow trùng trước dọn; mở/chọn loại đơn Cơ bản
  rồi hủy đạt. Mobile390: document không tràn, dialog351px, body cuộn riêng.
- **Chưa pass visual/interactive QA đầy đủ:** phiên browser hết hạn, bảng
  không có dữ liệu thực để kiểm tên/badge/cảnh báo, phân trang và modal lô.
  Không dùng bảng rỗng để kết luận các trạng thái này đã đạt.

### DAV: index tìm không dấu và thứ tự gợi ý (2026-09-12)

- EXPLAIN trước sửa: count và page dùng Seq Scan; index cũ không khớp
  `lower(translate(...))`. User đã duyệt xử lý index.
- Backup `/tmp/qlpk-before-dav-search-index-20260912-213940.dump` (0600),
  upgrade local đến `20260912_dav_search_indexes`: 6 expression GIN/trigram
  cho tên, hoạt chất, SĐK, SĐK cũ, mã nguồn, nhà sản xuất; btree cho thứ tự
  name/registration_number/id. Concurrent build; giữ index cũ.
  Model khai báo cùng index; baseline tạo pg_trgm trước current metadata.
- Đo service list trên dữ liệu thật, 3 lần/từ khóa, median ms, có count,
  10 dòng/trang, không summary, chưa gồm HTTP/render/debounce:

  | Từ khóa | Trước | Sau |
  | --- | ---: | ---: |
  | Rỗng | 769.05 | 419.54 |
  | a | 736.56 | 364.41 |
  | 18 | 1758.79 | 887.92 |
  | tablet | 1838.94 | 54.14 |
  | escitalopram | 1860.75 | 5.40 |
  | thuốc | 1847.97 | 299.86 |
  | VN-5518-10 | 1872.54 | 3.90 |
  | zzzzkhongcothuoc | 1869.21 | 4.37 |

- Autocomplete 12 dòng, không COUNT: rỗng 4.31 ms, a 3.65 ms, 18 13.18 ms,
  tablet 33.05 ms, thuốc 181.60 ms. Từ khóa 1–2 ký tự trong full catalog
  còn COUNT quét bảng; không ép prefix/min-length làm đổi nghĩa contains.
- QA: 8 cặp total và IDs trang đầu khớp trước/sau; vẫn 51 thuốc, 48 lần nhập,
  54.752 DAV. Cả 7 index valid; EXPLAIN tablet count dùng 6 Bitmap Index Scan,
  first-page rỗng dùng idx_dav_name_order. Schema + Alembic strict đạt;
  migration offline SQL và model/frozen normalization khớp. 4 PostgreSQL/API
  read-only tests + 10 JS tests search/autocomplete đạt.
- **Chưa pass visual/interactive QA sau migration:** Firefox đang ở cửa sổ
  ngoài QLPK, không gián đoạn người dùng để reload/tìm/phân trang. Các số đo
  trên là backend, không được báo thành thời gian UI end-to-end.

### DAV: tìm kiếm chờ lâu, request chồng và bảng cũ (2026-09-12)

- User báo chưa pass chức năng. Đọc phiên Firefox thật: keyword tablet đã
  trả1239 mục, 10 dòng/trang, tên hàng đầu02 Tablet; ảnh trước đó chụp lúc
  đang chờ và bảng vẫn hiện dữ liệu cũ. Database read-only không có query
  blocked; query tablet2026ms, 18 là1957ms trước phần summary.
- Owner `medicines/reference-catalog.js`: AbortController hủy request cũ khi
  nhập/đổi bộ lọc/trang; cùng query đang chạy không gửi lại; Enter hủy debounce,
  về trang1. Bảng hiện Đang tìm, ẩn pagination cũ, nút báo bận; lỗi/timeout15s
  hiện thử lại và mở nút. Revision vẫn chặn phản hồi đến muộn.
- GET list thêm `include_summary=0` cho lọc/phân trang sau lần tải đầu; giữ
  total để phân trang chính xác, bỏ5 thống kê lặp. Sau sync/realtime DAV tải
  summary mới. Default API giữ summary; autocomplete mode không thay.
- QA: 3 tests DAV search (submit/Enter/dedupe, abort/stale, timeout/empty),
  4 tests PostgreSQL/API read-only và7 tests autocomplete/cache đạt; frontend
  contract/JS syntax đạt. API real-data tablet có kết quả, skip-summary chỉ3SQL.
- **Chưa pass visual/interactive QA sau bản sửa:** đã tìm được Firefox có
  đăng nhập; trước lúc reload kiểm lại, user chuyển sang cửa sổ khác nên dừng
  thao tác và đề nghị để lại tab DAV. Không thay token hay gián đoạn cửa sổ mới.

### Danh mục DAV: thanh tìm kiếm và cỡ chữ (2026-09-12)

- User phản ánh khó nhận biết tìm kiếm và font-size lộn xộn. Giữ input
  referenceSearch hiện có; thêm label, form role=search và nút Tìm kiếm.
  Submit/Enter về trang1; giữ lọc khi gõ350ms, hủy timer khi submit/load,
  vô hiệu phản hồi cũ ngay lúc nhập để không render kết quả từ khóa trước.
- CSS owner `medicines/reference-catalog.css`: bảng13px; metadata và badge
  kế thừa thay vì12px/Bootstrap75%; tên semibold. Control/nút content-wrap
  cùng font base13px. Header và summary giữ cấp bậc riêng theo chuẩn Tủ thuốc.
  Parent content-wrap → surface → toolbar grid bốn cột (search minmax0/1fr,
  hai bộ chọn và submit); dưới56.25rem xếp một cột. Table-responsive vẫn sở
  hữu cuộn ngang bảng; không đổi pagination/data/API.
- QA: frontend contract, JS syntax và Jinja parse đạt.
  **Chưa pass visual/interactive QA:** browser local chuyển về login.html,
  chưa xem được bảng thật, badge và tìm kiếm trên desktop/mobile sau sửa.

### Tủ thuốc: giảm độ trễ autocomplete DAV (2026-09-12)

- User duyệt bỏ xử lý thừa và lưu tạm gợi ý. GET danh mục nhận
  `mode=autocomplete`: bỏ COUNT tổng và 5 thống kê, chỉ SELECT field cần cho
  chọn/hiển thị, lấy per_page+1 để trả `has_more`. Client lấy 12 thuốc/lần.
  Mode mặc định vẫn trả total/total_pages/summary cho màn quản lý DAV.
  Query/filter chung giữ owner `reference_catalog_query.py`, API vẫn require_auth.
- `clinic-catalog.js` cache RAM theo query/page và token, TTL30 giây, tối đa
  20 trang. Focus lại dùng ngay cache; reset form/đổi token/inventory.changed
  xóa cache. Request lỗi hoặc bị hủy không được cache. Backend vẫn kiểm source
  version/duplicate khi lưu. Footer chỉ báo số thuốc đã tải và còn tải thêm,
  không cần đếm toàn bộ DAV. Không migration hoặc đổi dữ liệu thật.
- Đo read-only database local (một mẫu/query, không phải latency trình duyệt):
  cũ ô trống761ms + summary700ms, “para”2069ms + summary712ms;
  mới tương ứng294ms và1101ms. Kết quả 12 dòng, `has_more=true`.
- QA: 7 tests JS tương tác/cache đạt; 4 tests PostgreSQL/API read-only đạt,
  xác nhận lookup chỉ 2 query/no COUNT, field identity/version giữ nguyên,
  phân trang/rỗng, API mặc định và chặn thiếu auth. Frontend/JS/Python syntax đạt.
  **Chưa pass visual/interactive QA có dữ liệu thật:** browser local vẫn hết
  phiên; đã xác nhận focus mở dropdown và báo lỗi dễ đọc, chưa đo cache trong
  trình duyệt có đăng nhập. Không sửa phiên hoặc restart runtime chính.

### Tủ thuốc: autocomplete chọn DAV (2026-09-12)

- User duyệt thay tìm bằng nút và Trước/Sau trong form thuốc bằng autocomplete.
  Owner giữ tại `medicines/clinic-catalog.js`, template/CSS medicine-management.
  Focus ô trống tải trang đầu ngay, không yêu cầu nhập; gõ lọc debounce250ms,
  xóa hết chữ trả về danh sách đầu. Dropdown gợi ý tên/hàm lượng, hoạt chất,
  nhà sản xuất/SĐK và dạng/đóng gói. API GET hiện có, 12 dòng/lần, cuộn tải thêm.
- Combobox/listbox hỗ trợ ↑/↓/Enter, Escape đóng riêng dropdown; blur/Tab,
  đổi từ khóa, chọn và đóng modal hủy request/timer bằng revision/AbortController.
  Chọn hiển thị identity gọn cùng nút Đổi thuốc; đổi xóa lựa chọn và xác nhận
  trước đó, phục hồi identity cũ khi đang liên kết legacy. Thuốc đã linked khóa
  đổi nguồn như trước; không thay API, payload contract, tồn hoặc dữ liệu thật.
- Constraint chain: dialog/content giới hạn viewport → form flex column →
  modal-body cuộn, header/footer cố định → wrapper input relative → dropdown
  absolute phủ nội dung, danh sách cuộn riêng tối đa min(22rem,38dvh).
- QA: 6 tests tương tác Node đạt (focus rỗng/lọc/xóa, debounce/stale response, chọn/đổi, tải thêm,
  xác nhận legacy/linked lock, Escape/blur/error), JS syntax/frontend contract đạt.
  Browser local kiểm modal/lỗi hết phiên ở desktop1280 và mobile390; dropdown
  đúng dưới input, không tràn document; Escape không đóng cả modal.
  Kiểm bổ sung focus với value rỗng: aria-expanded=true, dropdown hiện và
  request thực được gửi; API vẫn báo hết phiên đăng nhập.
  **Chưa pass visual/interactive QA có dữ liệu thật:** phiên local hết hạn;
  đã đề nghị user đăng nhập lại để kiểm kết quả dày/ít/rỗng, chọn và cuộn trên
  desktop/mobile. Không tạo token hoặc thay dữ liệu để vượt QA.

### Tủ thuốc: sửa cỡ chữ không đồng nhất trong bảng (2026-09-12)

- User phát hiện tên thuốc, dữ liệu, giá nhập và lần nhập có cỡ chữ khác nhau.
  Nguyên nhân source: bảng base13, medicine-link md14, stock-detail-badge sm12,
  còn giá nhập bọc `.small` của Bootstrap. Lần đồng bộ trước chưa xử lý hết.
- Sửa đúng owner: tên thuốc và nhãn lần nhập kế thừa font-size13 từ bảng;
  giữ semibold để nhấn, nhãn lần nhập kế thừa line-height. Renderer giá nhập
  bỏ wrapper `.small`; xóa rule chết `#medicineTableBody .small` (tbody thật
  nằm trong `#medicineTable`, không có ID đó). Không đổi data/API, icon tác vụ
  hoặc cảnh báo nghiệp vụ.
- QA: JS syntax, frontend contract, scoped diff đạt; browser xác nhận
  stylesheet mới và th/td13px. Chain: main shell → native pane cuộn dọc →
  mm-table-surface → table-responsive cuộn ngang → table base13px.
  **Chưa pass visual/interactive QA dữ liệu thật:** runtime báo phiên đăng
  nhập hết hạn, chỉ có hàng rỗng; cần xem lại tên thuốc dài/badge với dữ liệu
  sau khi đăng nhập, không dùng empty state để kết luận UI hoàn tất.

### Bổ sung phần phân trang còn thiếu ở màn quản trị (2026-09-12)

- User chỉ ra lần đồng bộ giao diện trước bỏ sót phân trang. Đã bổ sung
  12 danh sách: Tài khoản, Nhóm quyền, Hoạt chất, Dị nguyên, DAV, Từ viết tắt,
  ICD, Mẫu khảo sát, Dịch vụ, Nhóm dịch vụ, Ngày lễ, Tương tác thuốc.
- Một owner HTML `partials/clinic-pagination.html`, JS
  `components/clinic-pagination.js`; màu phân trang Tủ thuốc chuyển nguyên
  sang `shared/clinic-workspace.css` để dùng chung. Mặc định 10, chọn
  10/20/50/100; khoảng `đầu–cuối / tổng mục`, rỗng `0–0 / 0 mục`; button
  disabled thật, aria-current, số trang có ellipsis khi danh mục lớn.
- Client adapter chia mảng đã lọc ở Tài khoản/Nhóm quyền/Dịch vụ/Nhóm dịch vụ/
  Ngày lễ/Tương tác; server adapter giữ API `page+limit`, `page+per_page`
  hoặc `skip+limit` hiện hữu ở sáu danh mục còn lại. Đổi số dòng/lọc về trang
  đầu, STT liên tục. Không đổi backend, quyền, payload ghi hoặc dữ liệu.
- Xóa renderer/footer cũ, gồm placeholder Tài khoản `10 of 2100 items`.
  Bảng Hoạt chất/Dị nguyên/Tương tác có wrapper cuộn ngang riêng; footer là
  sibling, không bị kéo ngang. Survey giữ footer flex-shrink:0 ngoài table
  scroll trong card viewport. Trang cấu hình/editor/tree không thêm phân trang.
- Static: 13 JS syntax, Jinja, frontend/brand contract và
  `node tests/clinic-pagination.test.js` đạt. Test tương tác kiểm danh sách
  51 dòng, trang cuối 1 dòng, đổi bốn số dòng, reset sau lọc, rỗng, khóa biên,
  aria-current và điều hướng danh mục 54.752 mục. Đây là unit QA, không thay
  cho visual QA dữ liệu thật.
- **Chưa pass visual/interactive QA:** phiên localhost hiện bị API từ chối
  xác thực. Đã yêu cầu user đăng nhập lại; không sửa/bỏ auth hoặc tạo dữ liệu
  để vượt QA. Chỉ kiểm được bố cục rỗng: footer Dịch vụ desktop; khảo sát
  mobile390 footer bottom817 trong viewport844, document không tràn ngang.
  Cần kiểm lại dữ liệu thật, chuyển trang/đổi size/lọc sau khi đăng nhập.

### DAV → Tủ thuốc, bỏ lựa chọn TPCN/y dụng cụ (2026-09-12)

- User chốt bỏ TPCN/y dụng cụ và triển khai kế hoạch chọn DAV trong màn
  Tủ thuốc hiện có. Form tìm/chọn nguồn đã đồng bộ, thông tin nhận diện
  readonly; bộ lọc/cột Nguồn DAV thay nhóm loại hàng. Không tạo màn mới.
- Backend `catalog_service.py` dùng chung cho POST/PUT và Excel. FK duy nhất
  ngăn tạo trùng cùng nguồn, snapshot giữ identity/actor/time và identity cũ
  khi xác minh legacy. UI gửi version nguồn để chặn chọn cũ sau khi DAV đổi.
  Không cho đổi/gỡ link, sửa tên/hàm lượng tự do, ghi tồn/giá vốn/hạn danh mục.
  Đơn vị/quy đổi đã có lô được khóa cả UI và API. Source cập nhật chỉ báo
  review_required, không viết lại thuốc nội bộ hoặc đơn lịch sử.
- `catalog_excel.py` thay importer cũ: mã nguồn DAV + cấu hình phòng khám,
  savepoint từng dòng; lỗi/trùng không rollback các dòng đã báo thành công.
  Mẫu mới có API auth download, generator và static template cùng owner.
  Xóa các lựa chọn/mapping SUPPLEMENT/EQUIPMENT trong runtime; loại cũ giữ
  dữ liệu, chặn nhập thêm trước khi liên kết DAV đã xác minh.
- DB local: backup `/tmp/qlpk-before-dav-link-20260912-165240.dump` (0600),
  áp dụng `20260912_medicine_dav_link` và `20260912_dav_prescription_text`.
  DAV có tên333/hàm lượng1225 ký tự nên mở rộng cột bản chụp trong đơn để
  không lỗi hoặc cắt thông tin nguồn. Không đổi thời điểm lưu đơn/trừ kho.
  Đồng bộ đủ 54.752 bản ghi DAV, 55 trang. Thuốc phòng khám vẫn51, lần nhập48,
  linked0; không tự ghép, gộp, đổi loại hoặc sửa tồn thật.
- Dữ liệu cần user đối chiếu: Citicolin 250 (cobergon), ID7476 đang phân loại
  cũ SUPPLEMENT, tồn56, có1 lần nhập và1 dòng đơn. Chưa chuyển loại.
  DAV source_id16739 Exidamin có hoạt chất=10mg, hàm lượng=Escitalopram…
  ngay trong raw payload; không tự đảo trường hoặc ghép thuốc cũ này.
- QA: 56 tests DAV/receipt/opening/audit pass, các write fixtures rollback;
  schema, Alembic strict, auth strict, frontend, prescription stock, JS,
  Python/Jinja và diff checks đạt. Browser desktop với51 thuốc và DAV thật:
  kết quả8 dòng/1982 kết quả, một kết quả, rỗng, chọn điền readonly, reset
  sau đóng form, mở thuốc cũ khóa đơn vị/tồn và submit chưa xác nhận bị chặn.
  Chưa pass visual/interactive QA đầy đủ: JWT hết hạn (401) khi chuyển kiểm
  mobile390; trạng thái mobile có dữ liệu và nút mở thuốc đã linked chưa được
  kiểm browser. Backend linked/duplicate/source-change paths có rollback tests.
  Đã khôi phục viewport và đóng tab QA riêng; không restart runtime chính.

### Đồng bộ 18 màn quản trị theo Tủ thuốc (2026-09-12)

- User yêu cầu lấy Tủ thuốc làm chuẩn; xác nhận chỉ các màn quản trị, không
  áp dụng trang đăng nhập/khảo sát bệnh nhân/pháp lý/tra cứu đơn. Loại trừ
  Lễ tân, Bác sĩ, Tâm lý gia, Lịch hẹn, Trang chủ, Thống kê, Thu chi, CLS,
  Hóa đơn. Allowlist được kiểm trong `scripts/check_brand_theme.py`.
- Đã sửa code 18 màn: DAV, Hoạt chất, Dị nguyên, Tương tác thuốc, Tài khoản,
  Nhóm phân quyền, Phân quyền, Từ viết tắt, Nhóm dịch vụ, Dịch vụ, Gói dịch vụ,
  Mẫu khảo sát, editor khảo sát, ICD, Ngày lễ, Lịch bận, Phím tắt, Tài liệu.
  Tủ thuốc cũng dùng foundation chung, giữ hình thức đã duyệt.
- `shared/clinic-workspace.css` sở hữu nền #f3ebdd, primary brown-500,
  strong brown-700, header ảnh có mask/fade, radius/shadow, summary nhãn trên
  số dưới. `admin-management-ui.css` giữ owner bảng/control/modal và bố cục
  admin; selector nhận cả native pane sau shell reparent và embedded main.
  Xóa owner CSS header/summary cũ đã thay; không đổi app-header/palette chung.
- Từ viết tắt bỏ 4 KPI lớn, đưa các ID hiện có vào toolbar; DAV đưa summary
  cạnh đồng bộ. Hoạt chất/Dị nguyên bỏ khung tổng. Tài liệu chia flex height
  cho header/panes; editor độc lập bỏ cột sidebar rỗng. Lịch bận bỏ control
  chữ trắng trên nền trắng. DAV empty text canh đầu để đọc được khi bảng rộng.
- Static đạt: frontend/brand/scope contracts, Jinja, đối chiếu nguyên ID và
  script trong 19 template, baseline 14 template loại trừ và shared shell/
  color/bootstrap/list CSS không thay. Không sửa API, save/load hoặc dữ liệu.
- Browser đã xem các màn truy cập được ở desktop1440; mobile390 kiểm Tủ
  thuốc, Tài khoản/modal mở-hủy, Hoạt chất, Từ viết tắt, Dịch vụ, DAV,
  Lịch bận/chọn nhanh/date picker, khảo sát. Dữ liệu thật: 51 thuốc,
  1001 hoạt chất (10/trang), 9 tài khoản, 4 nhóm quyền, 6 từ viết tắt,
  287 dịch vụ, 3 nhóm dịch vụ, 38 ngày lễ, 11 tương tác, 11 mẫu khảo sát.
  Khảo sát kiểm 11/10/1 dòng, lọc GAD/rỗng, editor DASS-21 có 21 câu hỏi,
  đổi tab kết quả, đóng không lưu. Tủ thuốc table y399.09 giữ nguyên;
  các viewport đã kiểm không tràn document; console kiểm không lỗi/warning.
  Sau khi runtime khởi động lại, DAV đã có 54.752 bản ghi; kiểm thêm bảng
  20 dòng thật trên mobile390 và lọc rỗng, thông báo rỗng đọc được ở đầu bảng.
  Frontend contract và JS syntax kiểm cuối đều đạt.
- **Chưa pass visual/interactive QA đầy đủ:** Tài liệu, Phím tắt và Dị nguyên
  bị chuyển về Trang chủ trong phiên hiện tại; Phân quyền, ICD chưa
  hiển thị bản ghi; Lịch bận chưa có bản ghi để kiểm bảng dày (form đã kiểm).
  Gói dịch vụ hiện là trang chưa triển khai chức năng. Không tạo dữ liệu giả,
  đổi quyền hoặc đồng bộ DAV chỉ để vượt QA. Cần kiểm lại các state này khi
  môi trường cung cấp quyền/dữ liệu tương ứng.

### Tủ thuốc: phân trang nâu–kem và số dòng/trang (2026-09-12)

- Footer danh sách thêm chọn 10/20/50/100, mặc định 10. Đổi số dòng về
  trang 1 và giữ bộ lọc; STT/khoảng hiển thị tính theo lựa chọn, rỗng là
  `0–0 / 0 mục`. Dùng `per_page` sẵn có của GET `/api/medicines/`, không
  đổi API/database. JS bỏ phản hồi tải danh sách đã lỗi thời bằng request token.
- Owner: template/JS/CSS `medicine-management`; cấu hình biến pagination
  Bootstrap ngay owner footer, thay nền disabled/focus/hover lạnh bằng kem.
  Nút trang dùng button, disabled thật và aria-current; số trang vẫn theo API.
  Footer nằm trong native pane cuộn dọc, bảng sở hữu cuộn ngang; footer flex
  xuống dòng ở màn nhỏ, không thêm vùng cuộn hay khung lồng.
- QA dữ liệu thật 51 mục: đủ 4 lựa chọn, trang 2 STT 21–40 ở mức 20,
  trang cuối 1 dòng, đổi kích thước về trang 1, lọc Diropam/không kết quả,
  desktop 1280/mobile 390, focus bàn phím và disabled. Không lỗi console;
  JS syntax, frontend contract và diff check đạt. Không thay dữ liệu thuốc.

### Tủ thuốc: gỡ kiểm kê thủ công và chốt nghĩa lô (2026-09-12)

- User yêu cầu bỏ toàn bộ kiểm kê và phân tích ranh giới danh mục/tồn/bốc.
  Gỡ nút, modal, handlers, dữ liệu nháp và sáu hàm JS kiểm kê; gỡ hai POST
  `/api/medicines/inventory-count`, `/api/medicine-batches/inventory-count`,
  service `adjust_batch`, parser riêng và CSS chỉ dùng cho modal đã bỏ.
  Dọn thông báo/redirect tới API cũ và test gọi service đã xóa.
- Giữ movement adjustment lịch sử và công cụ gán tồn đầu đã xác minh;
  không đổi tồn thật, không tự bù chênh, không sửa service lưu đơn/cấp thuốc.
  Tồn và giá vốn vẫn bị chặn sửa qua danh mục, số dư bị chặn sửa qua batch PUT.
- User đã chốt một thuốc bốc từ một số lô trên bao bì, được lấy nhiều lần
  nhập của cùng lô; phải giữ giá vốn từng lần nhập. Quy tắc chưa triển khai.
  Gap: DAV chưa liên kết danh mục nội bộ; hạn dùng danh mục và lô song song;
  đơn lưu đang trừ kho ngay, FEFO có thể qua nhiều số lô; SL đã bốc thống kê
  theo prescription_items; thanh toán không ghi nhận giao thuốc. Tồn tổng
  lệch tổng receipt hiện chưa bị chặn toàn bộ bằng kiểm tra equality.
- QA: 37 tests receipt/opening/audit đạt (DB fixtures rollback); frontend,
  API auth strict, prescription stock contracts, JS syntax và diff đạt.
  Flask app riêng nạp blueprint mới trả 404 cả hai API cũ, hook cấm SQL xác
  nhận không truy cập DB. Không còn tham chiếu kiểm kê/service cũ trong
  app/scripts/tests. Browser desktop1280 với 51 thuốc: toolbar không nút cũ,
  10 dòng, trang cuối1 dòng, lọc rỗng, chi tiết hai lần nhập và lịch sử theo
  NK mở được; console warn/error rỗng. Chưa kiểm lại mobile trong lát này.
  Quan sát ngoài scope: phân trang rỗng vẫn ghi `1-0 of 0 items`.

### Tủ thuốc: chỉ số gọn trong toolbar (2026-09-12)

- Theo vùng user khoanh đỏ, bỏ hàng 4 KPI lớn và chuyển chỉ số sang bên
  phải nhóm nút trong `.mm-toolbar-top`. Xóa CSS/markup thẻ, icon, grid KPI
  cũ; mỗi ID dashboard chỉ còn một owner, giữ nguyên updateDashboard/API.
- Sau phản hồi "đúng ý rồi nhưng hơi thô": nhãn 12px phía trên, số 14px
  semibold/tabular-nums màu brown-700 phía dưới; vạch ngăn mảnh brown-200,
  đệm ngang 1rem. Không khung/bóng/icon. Màu cảnh báo giữ semantic.
  Toolbar wrap khi thiếu ngang; mobile chỉ số thành grid 2 cột.
  Header/ảnh nền không đổi; bảng ở desktop1440 lên từ y479.88 tới399.09,
  giảm 80.8px. Chỉ sửa template/CSS page và tài liệu.
- QA frontend/brand contracts, Jinja parse/unique IDs, diff đạt. Browser
  desktop1280/1440 và mobile390 với 51 thuốc, 63.917.100đ, 6 cảnh báo,
  48 lần nhập: kiểm 10 dòng, trang cuối1 dòng, lọc rỗng; không KPI cũ trong
  DOM, chỉ số giữ số tổng khi lọc; console warning/error rỗng. Mobile2 cột,
  docW375 <=390, nhãn và giá trị đọc đủ. Không ghi dữ liệu.
- QA lần tinh chỉnh: frontend/brand contract, Jinja và unique IDs đạt;
  browser desktop1440 với 10 dòng, trang cuối 1 dòng, tìm kiếm rỗng và
  mobile390 với dữ liệu thật đạt. Cụm cao35.2px, bảng vẫn y399.09;
  mobile docW390 bằng viewport, không lỗi/warning console.

### Tủ thuốc: triển khai giao diện đã duyệt (2026-09-12)

- User: `ok sửa giao diện đi`. Đã áp dụng cream/white/brown/photo tại
  `medicine-management.css` và wrapper copy trong template. Giữ Roboto,
  thang typography, bốn KPI trắng, toolbar và bảng dữ liệu; không sửa API/JS/DB.
- Asset AI riêng: `app/static/assets/images/medicine-clinic-interior.png`,
  từ imagegen built-in, prompt tái tạo riêng góc phòng tư vấn của preview
  đã duyệt (ghế kem, bàn gỗ, cây, đèn, rèm; ảnh 3:1, không chữ/UI).
  Ảnh là decoration absolute ở tiêu đề, mask/fade và pointer-events none;
  mobile giảm opacity để chữ rõ. Không dùng ảnh mockup làm UI.
- Xóa hai khai báo nền cũ bị ghi đè; page có `--mm-page-bg: #f3ebdd`.
  `app-header.css` cho main/frame-host/embedded nhận `--qlpk-workspace-bg`
  với fallback cũ #fbf8f2; chỉ Tủ thuốc opt-in. Primary brown-500,
  heading/hover strong brown-700, giữ semantic warning/delete và header chung.
- QA: frontend/brand contracts, Jinja parse, diff whitespace và asset HTTP
  200 đạt. In-app browser trên app local hiện có: desktop 1440x900, embed
  1280x800, mobile 390x844; dữ liệu 51 thuốc/6 cảnh báo, 10 dòng, trang 6
  một dòng, tìm Diropam, lọc rỗng, mở/đóng modal tồn kho thật. Mobile bảng
  cuộn tới cột Sửa bằng Tab (scrollLeft 410.5), document 375 <= viewport390;
  console warning/error rỗng. Không bấm lưu hoặc thay đổi tồn kho.
- Ghi nhận sẵn có ngoài scope: nhãn pagination khi không có kết quả hiển
  thị `1-0 of 0 items`; chưa sửa logic pagination trong lát giao diện này.
- Đã reset viewport QA; để tab app cho user xem. Không dừng server :8000
  có sẵn và không thao tác tiếp Firefox khi user đang dùng.

### Tủ thuốc: gỡ Lập báo cáo (2026-09-12)

- Theo yêu cầu riêng của user, gỡ nút `reportBtn`, modal `reportsModal`,
  ba handler và tám hàm JS riêng của luồng báo cáo. Gỡ hai GET route
  `/api/medicines/reports/<report_type>` và nhánh `/export/excel`, cùng
  bốn helper báo cáo chỉ được hai route này sử dụng trong `app/api/medicine.py`.
- Rà sau xóa: bỏ import `timedelta` không còn dùng; không còn tham chiếu
  runtime tới nút/modal, các renderer/helper hoặc hai route đã gỡ.
- Giữ nút Xuất dữ liệu, export Excel/PDF chung, Thống kê thuốc, dashboard,
  tồn kho/giao dịch và CSS dùng chung. Không thay schema hoặc dữ liệu.
- QA: JS syntax, Python AST, Jinja parse, frontend contract, API auth strict,
  kiểm tham chiếu và diff whitespace đạt. Browser tab riêng bị
  `ERR_CONNECTION_REFUSED` tại localhost:8000: chưa pass visual/interactive QA.
  Chưa kiểm HTTP route đã bỏ; không khởi động/restart server của task chính.

### Tủ thuốc: hướng phân cấp theo poster Sơn Tâm (2026-09-12)

- User đưa poster tuyển thực tập sinh làm chuẩn phân cấp màu/hình ảnh:
  cần nền kem ấm, khối trắng tách rõ bằng bóng mềm, nâu làm điểm nhấn và
  ảnh nội thất phòng khám tạo không khí. Chỉ texture/bóng nắng là chưa đủ.
  Poster là tham chiếu thị giác, không đưa nội dung tuyển dụng vào app.
- Đã gen preview mới dùng poster làm style reference và preview UI trước
  làm edit target: ảnh nội thất phía trên bên phải, bốn KPI trắng, toolbar
  và bảng nền sạch. Bản cuối bỏ nút Lập báo cáo theo thay đổi source riêng
  đã ghi ở trên. Không sửa code app trong task preview này.
- Ảnh cuối: `/Users/mac/.codex/generated_images/01a094d2-80df-7f63-90bf-660025fec844/exec-a2299c1c-bc48-4cdf-96cc-ec95b39ac61f.png`.
  Hướng thị giác do user yêu cầu; bản preview mới chưa được user duyệt.
  Là ảnh AI mô phỏng, không phải code/runtime; chưa pass visual/interactive
  QA cho triển khai thực tế. Khi code phải quay lại owner và screenshot thật.

### Tủ thuốc: đã gen ảnh và preview dựa trên UI thật (2026-09-12)

- Công cụ imagegen đã hoạt động: tạo 3 background bóng nắng, linen và kính.
  User phản hồi phải gen dựa trên code thật và ráp vào UI để xem tổng thể.
- Đã đọc template/CSS, mở Tủ thuốc trong tab admin Firefox có dữ liệu thật
  (51 thuốc, 6 cảnh báo), dùng screenshot làm ảnh gốc cho imagegen dựng
  preview nền bóng nắng cùng UI. Không sửa CSS/template hoặc dữ liệu.
- Preview: `/Users/mac/.codex/generated_images/01a094d2-80df-7f63-90bf-660025fec844/exec-bd4dc51c-4446-43a3-b44d-8e5b8e61b759.png`.
  Đây là ảnh AI mô phỏng: có sai khác geometry so với screenshot gốc,
  không phải screenshot của bản tích hợp; chưa pass visual/interactive QA
  cho background trong app. Chưa có lựa chọn cuối từ user.
- Khi tiếp tục, trình bày nền trong ngữ cảnh UI thật; không chỉ đưa texture
  riêng. Nếu triển khai, trace lại cascade: block `.mm-main-content-shell`
  cuối CSS đang ghi đè nền `#f3ebdd` phía đầu bằng token page-bg.

### Tủ thuốc: bàn giao tạo ảnh nền, chưa code (2026-09-12)

- Yêu cầu đang làm: gen vài ảnh **background trang trí** để user chọn,
  sau đó mới bàn ráp vào màn Tủ thuốc. Không phải gen lại cả giao diện,
  thêm màu, đổi font/layout hay thay bảng/nút bằng ảnh. User nhấn mạnh
  "chưa code"; chỉ cho phép tạo preview. Trả lời tiếng Việt, ngắn, dễ hiểu.
- Giữ thiết kế đã chốt ở mục kế tiếp: nền ấm #f3ebdd, KPI trắng, nhấn nâu,
  Roboto và thang typography hiện tại. Không đưa lại KPI nền nâu đặc;
  user đã loại vì nhìn kỳ cục. Không mở rộng sang màn khác.
- Hướng ảnh để thử (chưa được user chọn): bóng nắng qua rèm trên nền kem,
  vân giấy/linen mịn, hoặc kính mờ nhẹ. Chỉ dùng tông kem–nâu hiện có;
  chi tiết ở mép, vùng giữa thoáng, không chữ/icon/UI trong asset. Không
  tự thay yêu cầu ảnh AI bằng CSS gradient/SVG/HTML khi công cụ lỗi.
- Lần thử mới nhất sau khi user đổi model trò chuyện: gọi `image_gen`
  tạo nền bóng nắng qua rèm 16:9; thất bại HTTP 400, `model_not_found`,
  thông báo `unknown provider for model gpt-image-2`. **Chưa tạo được ảnh
  AI mới, chưa tích hợp background, chưa QA giao diện có background.**
  Không kết luận đổi model trò chuyện sẽ sửa được công cụ tạo ảnh.
- Hội thoại mới: đọc skill imagegen rồi thử công cụ tạo ảnh nếu user muốn
  tiếp tục. Khi công cụ chạy được, tạo các phương án background riêng,
  hiển thị preview cho user chọn; không sửa app trước khi user duyệt rõ.
  Nếu vẫn lỗi, báo đúng lỗi; không giả nhận ảnh thay thế là ảnh AI.
- Theo bàn giao trước có preview tạm `/tmp/qlpk_bg_1.png` đến
  `/tmp/qlpk_bg_4.png` (mesh, bokeh, line-art, linen), nhưng không phải kết
  quả gen AI mới và chưa có lựa chọn cuối. Kiểm tra tồn tại trước khi dùng.
- Owner khi được phép ráp: `app/static/css/pages/medicine-management.css`
  và `app/templates/medicine-management.html`; giữ bảng dữ liệu nền phẳng.
  Sau tích hợp mới QA browser dữ liệu thật desktop/mobile, khả năng đọc,
  console và tương tác; không dùng QA cũ để chứng nhận background mới.
- Không revert/commit các thay đổi sẵn có. Server :8000 được ghi nhận đang
  chạy ở vòng trước; kiểm tra lại trạng thái nếu cần, không tự giả định.

### Tủ thuốc: chiều sâu + khung 3 vai trò màu, hero bị loại (2026-09-12)

- 4 vòng feedback trong ngày: (1) pastel 4 hue → chê mù màu; (2) thẻ trắng
  phẳng → chê nhợt nhạt; (3) mock 2 phương án, user duyệt A hero nâu; (4)
  thấy hero chạy thật lại chê "background nâu kì cục" → bỏ hero, chốt bốn
  thẻ trắng + nền ấm + bóng mềm + số lớn (tức phương án B). Khung giữ
  nguyên: 3 vai trò màu + semantic đứng ngoài + phân cấp bằng độ sáng và
  typography. Chi tiết ở `references/ui/brand-theme.md` mục "KPI thẻ trắng
  + chiều sâu màn Tủ thuốc". Bài học: mock duyệt trên ảnh không thay được
  cảm nhận trên app thật - thay đổi có tính "statement" nên QA cùng user
  sớm ngay trên màn chạy thật.
- Code: `medicine-management.css` + wrapper `mm-summary-text` trong template.
  Nền màn page-scoped #f3ebdd; KPI 2 dòng chip 42px số token 3xl, bốn thẻ
  trắng đồng đều; header bảng brown-150/chữ brown-700, hover row
  brown-50, tên thuốc chữ tối 14 semibold; gỡ ID selector ép màu nút, "Xem"
  và "Nhập kho" tier-2, nút chính bóng nhẹ, radius 9; badge lần nhập pill
  trắng một owner. Contract chặn hard font-size → phải dùng token.
- Audit typography theo yêu cầu user (2026-09-12): family Roboto đồng nhất
  toàn màn; thang chốt 28 title / 24 số KPI / 14 tên thuốc / 13 body / 12
  nhãn. Đã sửa: badge lần nhập dính 0.75em Bootstrap còn 9.75px → token sm
  12px; nút Xem 36px thấp hơn input 40px trong filter row → min-height 40
  (đo top/height bằng nhau sau fix); xóa block `.mm-page-heading` trùng
  (bản chết #333/28px); heading owner nâng 24 → token 4xl 28 để tách bậc
  với số KPI.
- QA: brand-theme + frontend contract + git diff --check đạt; browser
  embed=1 desktop 1440 + mobile 390 dữ liệu thật (51 thuốc, 6 cảnh báo),
  modal tồn kho, hover row, console sạch, docW 375 < 390. Server 8000 đang
  chạy (AUTO_CREATE_TABLES=false) để user xem. Chưa làm: các màn khác vẫn
  KPI/tint kiểu cũ; nền #f3ebdd chưa thành token chung - nếu user duyệt
  nhân rộng thì thêm bậc token rồi áp theo lát.

### Toa thuốc: khối ký tên theo cột chung (2026-09-11)

- Bỏ fit-content/margin auto của footer web, dùng cùng grid với thông tin
  bệnh nhân và số lượng; các dòng ký tên ở cột phải. Phản hồi tiếp theo của
  user: khung thẳng nhưng chữ căn giữa vẫn nhìn lệch. Đã căn trái nội dung.
  Mobile chuyển sang cột 1, không tạo implicit column gây tràn.
- Browser QA lại HS00267 bằng DOM Range: mép chữ đầu của cả bốn dòng
  ký tên bằng chính mép chữ Số lượng (971.46875px ở viewport kiểm tra).
  Lần kiểm trước đã xác nhận mốc khung bằng cột
  Giới tính/Số lượng; ở 390px không tràn ngang. Chỉ CSS web, mẫu in giữ nguyên.

### Toa thuốc: căn cột Số lượng với Giới tính/SĐT (2026-09-11)

- Thay flex space-between của medicine heading bằng grid dùng chung track/gap
  với thông tin bệnh nhân. Bù ordered-list indent để cùng mốc trái; giữ số thứ
  tự và không thêm đường kẻ. Mobile một cột, số lượng dưới tên thuốc.
- Browser QA HS00267/3 thuốc tại viewport 1280 và 1600: đo mốc trái cột phải
  bằng nhau ở cả ba thuốc và thông tin bệnh nhân. 390px một cột, không tràn
  ngang. Chỉ CSS web, không đổi dữ liệu hoặc mẫu in.

### Toa thuốc: bỏ đường kẻ giữa thuốc (2026-09-11)

- Bỏ border-bottom của `.rx-screen__medicines li`, giữ khoảng cách giữa các
  thuốc. Đã xem toa thật HS00267/3 thuốc trên trình duyệt: không còn đường
  kẻ; computed border 0px. Không đổi renderer hoặc CSS bản in.

### Toa thuốc: giao diện web riêng, giữ mẫu in (2026-09-10)

- Theo ảnh user, modal Toa thuốc dùng `buildPrescriptionScreenHTML`: logo,
  mã vạch hồ sơ, tiêu đề xanh, nhãn song ngữ, bệnh nhân hai cột và danh sách
  thuốc/lời dặn. CSS scoped `.rx-screen`, co một cột theo khung, scroll theo
  shell modal. Shared view-model/formatter; không đổi API hay dữ liệu khám.
- Renderer giấy `buildPrescriptionPreviewHTML`, print engine, CSS A4/H/N và
  public verify giữ nguyên. Đối chiếu HTML trước/sau byte-for-byte 12 ca
  BASIC/H/N × có/trống thuốc × print/verify đạt.
- QA: tests prescription_screen/standard_form/followup_print và frontend
  contracts đạt. CUA dữ liệu thật HS00267 (3 thuốc, chẩn đoán/lời dặn dài),
  HS00027 (toa trống), chuyển bệnh nhân, desktop 1600 và mobile 390px; không
  tràn ngang, barcode có render, không console error. DB QA chỉ đọc.


### Modal lịch sử: nhãn gọn và bố cục theo vùng bảng (2026-09-10)

- Phản hồi user: badge đậm, tròn và xuống dòng gây rối. Shared history row
  bỏ nhãn `Lịch sử` lặp, dùng chữ `Lượt hiện tại`; status giữ dữ liệu backend,
  bo nhẹ/font small-medium. User sửa hướng màu: giữ nền đặc/chữ trắng như
  trước, đổi xám thành nâu thương hiệu, giữ xanh dương/cam; chữ 12px,
  weight 500 và giảm padding. Không đổi nghiệp vụ hoặc mẫu in.
- CSS owner dùng một grid cho header/row; container hẹp chuyển chẩn đoán
  xuống hàng riêng, giữ trạng thái một dòng. Không đổi scroll owner.
- QA: frontend/shared history contracts, JS syntax, diff đạt; CUA với 4 và
  11 lượt thật ở desktop/mobile, đổi hồ sơ A→B→A, chọn lịch sử tải preview,
  không tràn ngang/console lỗi. Server QA chỉ đọc DB.

### Doctor: nút Chuyển khám dùng modal chung (2026-09-10)

- User chốt dùng modal chuyển hiện có. Header thêm `Chuyển khám`, ESM nạp
  shared modal qua registry/platform boundary. Không thêm endpoint/modal mới.
- Xác nhận mới lưu workspace dirty rồi chuyển; hủy giữ draft, lỗi lưu/chuyển
  giữ lượt. Khóa loading/history/save, chống gửi lặp và phản hồi người nhận
  stale. Thành công clear đúng context rồi reload queue, socket giữ luồng cũ.
- Mobile header chia grid 2 cột, không để nút cuối lẻ một bên.
- QA: frontend/Doctor/user-feedback contracts, syntax/diff và 3 Node suites
  transfer/detail defaults/realtime đạt. CUA kiểm full app trên PostgreSQL
  clone riêng: Ngô Hiển Đạt 1101 có nội dung dài và Phạm Khôi ít dữ liệu;
  desktop 1280x720, mobile 390x844; đủ ba nhóm, hủy giữ dirty không ghi DB,
  xác nhận lưu trước chuyển đúng người/status, API lỗi giữ modal và retry
  thành công, history disable và quay lại. Phiên Doctor thứ hai tự mất lượt
  đã chuyển qua socket. App chính giữ nguyên lượt 1101 và không có QA marker.
- Đã đóng hai tab QA, dừng server 8772 và xóa database clone. App local 8000
  được khởi động lại với `AUTO_CREATE_TABLES=false` để người dùng kiểm tra.

### Tủ thuốc: lần nhập, giá vốn và khóa tồn (2026-09-10)

- User duyệt xử lý Tủ thuốc và chặn cả BE/FE. Form danh mục disable tồn
  tổng/quy đổi/giá vốn; tên/thông tin thuốc và giá bán vẫn sửa. Catalog
  POST/PUT và Excel chặn giá vốn ngoài phiếu nhập. Metadata lô không còn
  sửa đè giá/ngày/thuốc/lô/nhà cung cấp/chứng từ; kiểm kê giữ đường riêng.
- Mỗi batch ID giữ một lần nhập/tồn đầu; số lô thực tế được lặp qua nhiều
  lần nhập khác giá nhưng cùng thuốc/lô phải cùng hạn. Giá và số lô mới bắt
  buộc, không tự tạo LOT hoặc biến blank thành 0. Khóa nút trong lúc gửi.
  Giá lần trước chỉ tham khảo, không tự điền; đơn vị theo thuốc. Ngày nhập
  đồng bộ datepicker, người thực hiện hiển thị tài khoản và bị khóa.
- Migration `20260910_inventory_receipts` đã áp dụng local sau backup.
  Snapshot `balance_after` và giá vốn ở movement mới; legacy giữ nguyên.
  Chi tiết theo lần nhập có giá trị, chứng từ, thiếu giá/chênh tổng/lô test;
  lịch sử lọc đúng ID, phân trang/nhảy trang, hiển thị số dư mới và unknown cũ.
- QA: 37 pytest (receipt API, stock/refund, opening lots, audit) đạt; DB tests
  rollback. Schema, Alembic strict, auth, frontend, prescription stock,
  syntax/diff gates đạt. Chrome headless full app kiểm dữ liệu thật, locked
  form, hai lần nhập giá 1.000/1.200 với tổng 220.000, empty, scoped/dense
  ledger, next/jump/filter, mobile không page overflow, không lỗi JS. CUA
  xác nhận bản cuối ngày nhập/người nhập/đơn vị và cuộn ngang phiếu nhập.
- App chính :8000 kiểm direct PUT tồn/giá vốn trả 400 và tồn QA giữ 200;
  API đọc hai lần nhập trả 220.000. Hai thuốc QA, hai dòng nhập/movement đã
  dọn; server/tab QA đóng, app chính giữ chạy.
- Audit sau dọn: 51 thuốc; 13 lệch tổng so với lô, 27 thuốc có lô thiếu giá,
  25 thuốc có lô kiểm thử, 1 không còn tồn lô hợp lệ. Các nhóm có thể trùng.
  Report `reports/inventory-receipts-20260910/`; không tự điều chỉnh dữ liệu
  cũ. Còn bước đối soát chứng từ và nối bốc thực tế/báo cáo/thanh toán.

### Đồng bộ badge và chữ trạng thái theo dấu tích liên hệ (2026-09-10)

- Đã đưa các renderer trạng thái về `.qlpk-status` trong
  `shared/feedback-tokens.css`; badge nền đặc/chữ trắng, xanh `#198754` cùng
  dấu tích liên hệ. Bridge Bootstrap và RGB text utility giữ màu semantic
  thống nhất. Gỡ CSS nền nhạt/geometry riêng tại các owner được chuyển đổi;
  màu lựa chọn hàng không ghi đè badge. Chi tiết phạm vi ở `ui/brand-theme.md`.
- Không đổi payload, save/load, trạng thái nghiệp vụ hay dữ liệu. Có một
  số badge lịch legacy đổi ánh xạ màu theo key (completed xanh, in_progress
  info); giữ nguyên key/nhãn/hành vi.
- QA trình duyệt 1280x720: ca thật Ngô Hiển Đạt có dấu tích liên hệ, tài liệu
  Đã lưu, đơn Đã lưu và hai dòng CLS Hoàn thành/Chuyển thực hiện đúng màu;
  đổi sang ca QA CLS rồi quay lại được. Thanh toán có cả chờ/đã thanh toán;
  mẫu khảo sát có ready/warning/neutral; danh mục Dịch vụ có badge active;
  Kho thuốc có cảnh báo đỏ/vàng; Thống kê thuốc có 53 dòng và cả ba trạng thái.
  CLS quản lý có tab đang thực hiện rỗng và 13 dòng hoàn thành. Ở 390x844,
  CLS không tràn document; bảng rộng cuộn trong `om-table-scroll`.
- Chưa pass visual/interactive QA toàn bộ: Tâm lý gia không có lịch hẹn;
  chưa xem indicator tự lưu và các trạng thái lỗi/đang lưu trên ca thật.
  Calendar đã mở được lịch và modal đồng bộ, chưa QA bảng sync có dữ liệu;
  phiên QA bật PostgreSQL read-only nên refresh token Calendar bị chặn.
  Không bấm lưu/thu tiền/đồng bộ Calendar hoặc tạo dữ liệu để QA.
- Máy chủ 8000 ban đầu ngừng chạy giữa QA; dùng phiên riêng đúng checkout
  với AUTO_CREATE_TABLES=false, DEBUG=false và PostgreSQL read-only.
  Đã dừng phiên máy chủ QA riêng sau kiểm tra.
  JS syntax, Jinja parse, test doctor_indications_form và frontend contract
  (gồm contrast palette) đạt; diff trong phạm vi sửa không lỗi whitespace.
  Whitespace ở medicine-management.js thuộc công việc khác không sửa.

### Cân lại bố cục giấy in sau phản hồi thẩm mỹ (2026-09-10)

- Bản trước chỉ đạt nhãn/nội dung, bị user đánh giá fail thẩm mỹ. Đã sửa
  owner chung: chữ 12pt, đệm khung 4mm, dòng điền tay co giãn cao 6mm,
  giãn nhóm và vùng ký 25mm. Lề A4 20/20/20/30mm giữ nguyên; khung/đệm
  tiếp tục đúng khi qua trang. Thuốc cuối/lời dặn/ký nằm trong một nhóm.
- Bỏ nối hàm lượng đã hiện đầy đủ; chỉ gộp số cuối với đơn vị nếu tên đúng
  bằng hoạt chất + số. Không thay schedule/ghi chú đã lưu hoặc dữ liệu DB.
- QA: syntax, Node standard-form/followup, frontend contract và diff đạt.
  Chrome PDF 6 ca/10 trang đã render xem toàn bộ: 1101 đúng ca ảnh một trang,
  H/N thật mỗi mẫu một trang, 442 sáu thuốc hai trang, thiếu dữ liệu/trẻ em
  một trang; N QA 24 thuốc bốn trang đủ số 1–24, thuốc cuối và ký cùng trang.
  Thay thế kết luận số trang/thẩm mỹ của lần QA cũ bên dưới; chưa in giấy thật.
  Output: output/pdf/don-thuoc-bo-cuc-moi-20260910.pdf.

### Nhãn in theo Word người dùng (2026-09-10)

- Theo yêu cầu chốt lại của người dùng, shared template thường/H/N dùng
  nguyên văn nhãn của Đơn H.docx, gồm CCCD/BHYT/địa chỉ/người đưa trẻ/người
  nhận và câu mang theo đơn. H bổ sung Đợt trống như Word; N giữ ba Đợt.
  Ghi chú trước đây “H không có Đợt” bên dưới là trạng thái trước lần sửa này.
- Không đổi API hoặc dữ liệu; ngày Đợt H/N vẫn để trống, không suy từ tái khám.
- QA: đối chiếu 7/7 nhãn/dòng với XML Word (không gồm số chú thích); Node
  standard-form/followup, frontend contract, syntax/diff đạt. Browser preview
  dữ liệu thật BASIC 6 thuốc, H và N; Chrome print preview BASIC/H hai trang
  đủ nhãn/Đợt/footer. Không có console error; DB kiểm thử chỉ đọc.

### Mẫu in thường/H/N theo TT26/2025 (2026-09-09)

- Shared template + prescription-standard-form.css dùng biểu mẫu Phụ lục
  I–III; A4 20/20/20/30mm, normal flow, QR 25mm và nhóm ký/liên hệ/người
  nhận tránh tách trang. N có ba Đợt và số lượng bằng chữ; H không có Đợt.
- Tuổi tháng/người đưa trẻ áp dụng dưới 72 tháng. BHYT/người nhận/ngày
  từng đợt N còn để trống do chưa có field riêng; không tự lấy CCCD người đi cùng.
- Public model thêm cân nặng/lời dặn/bệnh kèm theo. Bỏ barcode verify và
  không tự đóng popup tại afterprint để Chrome hoàn tất lưu PDF.
- QA: Node standard-form/followup, frontend gate; đơn thật BASIC/H/N,
  Doctor history, verify mobile; Chrome PDF sáu thuốc một trang A4 và N QA
  24 thuốc ba trang đủ thứ tự, footer/chữ ký không tách. DB chỉ đọc;
  không kiểm in vật lý, điều kiện cấp thuốc hoặc quy trình ba bản H/N.

### Badge nơi thực hiện sau tên chỉ định (2026-09-09)

- Chỉnh renderer current/history trong `doctor-indications-form.js` và CSS
  badge trong `doctor-indications.css`; loại nơi thực hiện không còn lặp ở
  cột người/cơ sở thực hiện. Không đổi API hoặc dữ liệu.
- JS syntax, `tests/doctor_indications_form.test.js` và frontend contract đạt.
- Browser localhost:8000: đã kiểm bảng rỗng và GAD-7 đã lưu có tên dài,
  badge Trong cơ sở ở cuối tên, performer riêng và nút sửa completed vẫn khóa.
  Chưa pass visual/interactive QA đầy đủ: chưa kiểm Ngoài cơ sở, lịch sử
  có dữ liệu, danh sách nhiều dòng và viewport hẹp; không tạo/sửa hồ sơ để QA.

### Khám chi tiết mặc định khi nhấn Lưu (2026-09-09)

- `clinical-detail-persistence.js` chuẩn bị `Không ghi nhận bất thường`
  cho 7 cơ quan + 8 field tâm thần trống/whitespace; giữ nội dung đã nhập.
  Component Khám bridge, action `save` bật `applyDetailDefaults`; controller
  chuẩn bị trước khi xét dirty. Không default ở load/background save,
  không đổi API/schema hoặc backfill hồ sơ cũ. Lỗi lưu giữ dirty/revision.
- Node `doctor_detail_defaults.test.js`, Doctor/frontend contracts, syntax
  và diff check đạt. Full app loopback/browser: A 15 ô trống lưu đủ default;
  B 2 ô có text + whitespace giữ 2 text, lưu 13 default; DB section API và
  reload đúng, A→B không lẫn giá trị. Bốn ô Khám & xử trí giữ blank.
  Ca QA riêng và server/tab kiểm thử đã được dọn.

### Doctor queue theo thời điểm chuyển + realtime (2026-09-09)

- Thay sort ID ở Doctor bằng `doctor_queue_entered_at DESC NULLS LAST, id
  DESC`. Backend ghi thời điểm vào hàng chờ qua transfer/status transition;
  migration `20260909_doctor_queue` đã áp dụng local sau pg_dump, có index
  và backfill từ thông báo đúng bác sĩ nhận. Legacy không có bằng chứng
  thời điểm chuyển giữ null/ID order. Không đổi sort của lễ tân/TLG.
- Doctor lấy status hợp nhất `doctor_queue` và đủ các trang; request version
  chống response cũ, lỗi tải không xóa danh sách đang có, giữ card đang chọn.
  Socket khử trùng envelope qua nhiều rooms; batch giữ cả document và queue
  event; reconnect subscribe xong tải bù queue/CLS/thông báo.
- Transfer lặp cùng người nhận/trạng thái không đổi thứ tự, không tạo thêm
  thông báo. CLS/survey chỉ refresh rows khi sạch; giữ input/draft và token
  context. Không đồng bộ ghi đè các field Khám/đơn thuốc đang nhập.
- QA đạt: 23 pytest queue/notification/CLS validation, hai Node suites
  realtime/indications, frontend contract, schema, Alembic strict, syntax,
  diff whitespace. Bộ workflow contract mở rộng: 32 pass/1 fail vì kiểm
  chuỗi UI cũ `Mẫu khảo sát lấy từ chỉ định đã chọn.` trong order-management;
  file này có thay đổi ngoài task, không sửa để làm xanh test.
- Browser dùng full app ở loopback 8769, hai tab Doctor, 197 ca sẵn có +
  hai ca QA riêng: A rồi B tự lên đầu ở cả hai tab; A ID thấp hơn chuyển lại
  sau B lên đầu; repeat B cập nhật 0/không thêm notification; reload giữ
  sort; bản nháp Bệnh sử và input CLS không mất; chỉ định tạo qua API từ
  phiên khác hiện qua socket; ngắt Engine.IO rồi đổi ca QA không phát event,
  reconnect tải bù đúng sort và giữ filter; kiểm dense/sparse/empty, selected
  card, không có console error. Hai ca + chỉ định/thông báo QA đã xóa, tab
  và server QA đã đóng. Backup/log trong `/tmp/qlpk-doctor-realtime-20260909`.

### Không in ngày tái khám đã hủy/xóa (2026-09-08)

- Backend trả `show_re_examination_date`; shared template và adapter
  preview/verify giữ cờ. Bản in không còn nhận ngày lịch đã hủy như lịch hẹn
  bình thường. Giữ nguyên lịch sử, snapshot, ngày trong đơn và logic lưu/kho.
- 49 test policy PostgreSQL rollback đạt, gồm 7 trường hợp visibility cho
  internal/print/public; Node renderer/Doctor merge/modal, syntax và frontend
  contract đạt. Ca thật 1012 (HS00245), 1104: dòng ngày hủy bị ẩn; ca 442 có
  6 thuốc/lịch chưa hủy vẫn hiện ngày. Chrome đã kiểm popup từ adapter Doctor
  và component in lịch sử, QR desktop/390px; QR tải đủ, gọi đến bước in,
  không lỗi JS; đã xem ảnh đơn ngắn/dày và mobile.
- QA dùng Flask blueprint thật + view model thật trên server loopback chỉ
  đọc DB, không import main hoặc ghi bệnh nhân. Adapter Doctor được cấp dữ
  liệu thật qua harness; chưa chạy lại thao tác chọn ca/nút in trong toàn màn
  Doctor, chưa kiểm máy in vật lý. Log/ảnh tại `/tmp/qlpk-followup-qa.tNIzQg`.

### Bảng thuốc nền trắng và rà màu các bảng (2026-09-08)

- Bật `.qlpk-data-tables` trên màn Thuốc: nền ô trắng, viền mảnh, số liệu chữ
  tối; bỏ màu cả hàng cảnh báo/lô/tổng báo cáo. Số lô thành button trắng có
  viền; kiểm kê dùng viền ô ghi chú lỗi và chênh lệch có dấu.
- QA browser dữ liệu thật 51 thuốc: 10 dòng/trang, trang cuối, tìm kiếm có/
  không có kết quả, hover/chọn, mở lô bằng Enter, kiểm kê thiếu ghi chú,
  desktop 1600px/mobile 390px và cuộn bảng tới tác vụ đạt. Không ghi tồn kho.
  JS syntax/frontend contract/diff check đạt; đã xem ảnh sau chuyển động modal.
- Rà 18 màn khác, đã sửa 8 bảng có dữ liệu kế thừa nền kem Bootstrap sau
  yêu cầu "xử lý toàn bộ"; sửa thêm Lịch bận, Chi tiêu và grid khảo sát.
  Bảng con thống kê, số loại và dòng tổng cũng dùng nền trắng/chữ trung tính.
- Browser kiểm dữ liệu thật 8 màn, 51 dòng tồn ở Thống kê thuốc, bảng thuốc
  con, nhóm Chi tiêu 26 khoản, bộ lọc rỗng và modal Dịch vụ/Tài khoản.
  GAD-7 preview chọn đáp án được; Dịch vụ/mobile 390px cuộn tới tác vụ.
  Không lỗi JavaScript, không ghi dữ liệu. Lịch bận chỉ có empty state,
  chưa pass visual QA có dữ liệu. Chi tiết owner và giới hạn QA:
  `../reports/table-color-audit-20260908.md`.

### Rà kỹ logic Mẫu khảo sát lần hai (2026-09-08)

- Sửa ngưỡng mất khi đổi toán tử và điều kiện trống bị thêm tự động; bảo toàn
  mẫu chỉ tính điểm. Bỏ qua câu tùy chọn được, mã đáp án số 0 hợp lệ.
- Không kết luận từ điểm 0 giả khi chưa có câu trả lời được tính điểm.
  Freeze snapshot cũ còn thiếu trước sửa mẫu; kiểm tên/payload nhất quán.
- 86 test Python, 3 bộ Node, frontend/auth strict đạt. Browser ghi thật từ
  tạo mẫu đến nộp và kết thúc đạt; sửa danh mục 2→99 không đổi điểm phiên cũ 2.
- Cập nhật tài liệu; nội dung CDI/HADS/Vanderbilt còn chờ xác định đúng phiên
  bản và nguồn đầy đủ, chưa seed hoặc suy diễn thang điểm. Báo cáo:
  `../reports/survey-template-review-20260908.md`.

### Khắc phục logic menu Mẫu khảo sát (2026-09-07)

- Chặn writer mẫu/tiêu chí theo quyền quản lý hiện tại; đồng bộ khả năng thao tác
  trong list/editor. Giữ luồng đọc mẫu phục vụ chỉ định.
- Điểm mặc định cột không tự ghi đè điểm hàng; áp cả cột có xác nhận.
  Ngưỡng trống giữ null và chặn lưu, phân biệt với điểm 0 thật.
- Thay Công khai giả định bằng nhãn cấu hình do backend trả; tách mẫu tài liệu
  với khảo sát online, bổ sung tải file và sửa metadata; sửa đường dẫn download.
- Đồng bộ trang backend trước khi dựng STT; 77 test hồi quy đạt.
- Chốt 08/09: sửa thêm ID điều kiện từ seed/API và clone cấu hình; test Node
  hồi quy đạt. Browser lưu mẫu/upload/edit/download/delete/phân trang đạt,
  đã xem list/editor desktop/mobile, không lỗi JS. QA soft-delete khỏi danh sách.
- Không suy diễn nội dung/điểm chuyên môn cho CDI/HADS/Vanderbilt còn thiếu.
  Chi tiết: `modules/surveys.md`, `../reports/survey-template-review-20260907.md`.

### Đồng bộ màu chủ đạo toàn ứng dụng (2026-09-07)

- Primary chung đổi từ teal sang chocolate; thêm Bootstrap brand adapter và
  partial dùng chung cho 33 template web. Admin, launcher, survey editor,
  lịch hẹn/lịch bận, thanh toán, thuốc, danh mục, tài liệu và các trang phụ
  dùng cùng token nâu–kem. Giữ màu cảnh báo/trạng thái/biểu đồ có ý nghĩa.
- Kiểm browser 31 route + trang đọc khảo sát, modal thuốc/tài khoản/chỉ định,
  phân trang/editor khảo sát, launcher desktop/mobile: không lỗi JS.
  ICD có 401 do key auth legacy, các trang trống/chưa chọn lượt khám chưa
  được xác nhận workflow có dữ liệu đầy đủ. Chi tiết ở `ui/brand-theme.md`.
- Thêm guard 33 include và alias/semantic palette, nối frontend contract;
  frontend contract và diff check đạt. Không sửa API/DB trong lát đổi màu.

### Đính chính nội dung chuyên môn trên ảnh đăng nhập (2026-09-07)

- Tham chiếu đúng là “Chuyên môn đồng hành” với ba nhãn Tâm thần học,
  Tâm lý lâm sàng, Tâm lý cộng đồng; thay đoạn slogan đã lấy nhầm.
- Danh sách pill tĩnh, desktop cùng hàng/mobile wrap; giữ form và ảnh sáng.
- Browser 1900/1024/390/320px không tràn ngang, đã xem desktop/320px;
  form smoke đạt, không lỗi JS. Đồng bộ `ui/login.md`, diff check đạt.

### Nội dung trên ảnh đăng nhập theo tham chiếu (2026-09-07)

- Đổi slogan thành “Không cần phải biết bắt đầu từ đâu.”, thêm dòng phụ
  “Hãy bắt đầu từ điều bạn đang thấy khó nói.”; giữ layout logo/text form.
- Browser 1900/1024/390/320px không tràn ngang, đã xem desktop/320px;
  form smoke đạt, không lỗi JS. Cập nhật `ui/login.md`, diff check đạt.

### Logo và cụm tiêu đề đăng nhập cùng hàng (2026-09-07)

- Gom logo và lời chào/tiêu đề/mô tả vào `.login-heading`: logo trái,
  text phải, flex căn giữa dọc. Co logo/cỡ tiêu đề theo màn hình, không
  tự chuyển logo thành hàng riêng; giữ đủ nội dung và ảnh không overlay.
- Browser 1900/1024/390/320px không tràn ngang; đã xem ảnh desktop/320px.
  Password toggle, checkbox và lỗi 401 mô phỏng đạt; không lỗi JS.
- Cập nhật `ui/login.md`; diff check phạm vi sửa đạt.

### Khôi phục lời chào và tiêu đề đăng nhập (2026-09-07)

- Sửa hiểu nhầm ở lượt trước: logo bổ sung phía trên, giữ nguyên hiển thị
  “Chào mừng trở lại”, “Đăng nhập” và dòng mô tả. Ảnh vẫn không overlay.
- Cập nhật quy tắc `ui/login.md`. Browser 1900/1024/390/320px không tràn
  ngang, đã xem ảnh desktop/mobile; toggle mật khẩu, checkbox, lỗi 401
  mô phỏng đạt và không lỗi JS. Diff check phạm vi sửa đạt.

### Chuyển logo vào form đăng nhập, bỏ overlay ảnh (2026-09-07)

- Tiếp tục yêu cầu đang dở: logo gốc chuyển từ góc ảnh sang vùng tiêu đề
  form; bỏ lời chào/heading lớn, giữ h1 cho trình đọc màn hình.
- Xóa overlay radial/linear toàn ảnh; slogan giữ vị trí dưới cùng, thêm
  bóng sát chữ. Không thay asset hoặc logic xác thực.
- Browser 1900/1024/390/320px: đúng một logo trong form, không overlay,
  không tràn ngang; đã xem ảnh desktop/mobile. Toggle mật khẩu, checkbox
  và lỗi 401 mô phỏng hoạt động, không gọi đăng nhập thật; không lỗi JS.
- Cập nhật `ui/login.md`; diff check phạm vi sửa đạt.

### File đính kèm trong sidebar chi tiết chỉ định (2026-09-06)

- Bỏ ô Ghi chú xử lý và autosave frontend, giữ dữ liệu ghi chú đã lưu.
- Chuyển file đính kèm vào cột trái dưới tiến trình; grid stretch và card
  flex giữ sidebar/workspace bằng chiều cao desktop. Mobile xếp dọc.
- Đổi danh sách file thành tên riêng một dòng và thông tin/nút bên dưới
  để phù hợp cột hẹp; giữ handler đính kèm, tải xuống và xóa.
- Browser đọc chỉ định GAD-7 thực tế (14 điểm): 1900/1366px hai cột chênh
  đáy 0px; 768/390px không tràn ngang. Nút đính kèm mở file chooser.
  Kiểm thêm tên file dài bằng dữ liệu mô phỏng chỉ trong DOM; không upload
  hay đổi dữ liệu bệnh nhân. Không lỗi JS hoặc request ghi trong lượt QA.
  Đã xem ảnh desktop/mobile và trạng thái có file; JS syntax/diff check đạt.

### Seed điểm khảo sát (2026-09-06)

- Đã seed 4 mẫu GAD-7/PHQ-9/GDS-30/Zung, 1 session trống; bảo toàn toàn bộ
  đáp án/điểm cũ. Backup và nguồn tại `modules/survey-scoring-seed.md`.
- 73 test đạt; browser 4 editor + GAD review đạt. Frontend contract toàn repo
  đang lỗi CSS calendar ngoài scope; JS syntax và diff check của scope đạt.
- Vanderbilt thiếu câu hỏi và phần ảnh hưởng: chờ người dùng chọn bản NICHQ
  cha mẹ hoặc bản phòng khám; không chỉ thêm điểm để vượt validation.

### Logo login hòa vào ảnh, bỏ hộp và tên cạnh logo (2026-09-06)

- Theo phản hồi mới, bỏ nền hộp đen/padding/bo góc của logo và xóa wordmark
  HTML bên cạnh. Chỉ giữ asset logo gốc trong suốt, cùng lề trái slogan;
  gradient radial mềm thuộc overlay ảnh giữ tương phản cho chữ nhỏ.
- Xóa selector wordmark dư ở cả desktop/mobile. Browser 1900/1024/390/320px
  xác nhận logo không nền hộp, không tràn ngang/lỗi JS; đã xem ảnh thật
  `/tmp/qlpk-login-soft-brand-1900.png`, `/tmp/qlpk-login-soft-brand-390.png`.
  Diff check đạt; không đổi form, auth handler hoặc các màn đang làm khác.

### Phân trang danh sách Mẫu khảo sát (2026-09-06)

- Sửa chiều cao card theo phần còn lại trong workspace; toolbar/phân trang
  luôn hiện, chỉ bảng cuộn. Bổ sung main-content cho URL trực tiếp dùng shell.
- Bỏ dòng rỗng bù per_page; giữ API và logic phân trang hiện hành.
- Browser QA 11 mẫu thật: trang 1/2, 25/100 dòng, tìm kiếm/empty, cuộn bảng,
  desktop/mobile, tab iframe từ Trang chủ và mở editor đạt; JS syntax,
  frontend contract, diff check đạt. Chi tiết tại `modules/surveys.md`.

### Khắc phục audit Mẫu khảo sát (2026-09-06)

- Đã sửa mất điểm ô grid, adapter mẫu cũ, validation, listener lặp, đóng chưa
  lưu, stale load và CSS ẩn dùng chung. Bỏ 5 route CRUD trùng.
- Nối result_config vào kết quả lưu khi nộp: tổng/trung bình/quy đổi tường minh,
  kết luận nhóm và lưu ý; cùng renderer kết luận cho patient/bác sĩ/CLS.
- Chuẩn hóa 11 mẫu và 1 snapshot phiên trống; đóng băng 1 response cũ trước
  khi đổi danh mục. Giữ đáp án/điểm đã nộp; backup 0600 và chạy lại không đổi.
- Browser QA thực tế template 386/order 706: grid 7/3 → trung bình 5, xem draft,
  nộp, reload, CLS đều đúng. Đã kiểm thêm cột/hàng, đóng chưa lưu, tải A/B chồng
  nhau, đổi loại câu, nhóm kết luận, payload quy đổi và mobile cuộn ngang.
- Tìm kiếm GAD đúng 1 mẫu; dòng trống bù chiều cao đã bỏ ở lần sửa phân trang
  phía trên. Frontend/auth contract đã đạt sau khi chỉnh toast.
- Bốn mẫu đã seed theo mục phía trên; Vanderbilt còn thiếu nội dung, không gán
  điểm suy đoán. Chi tiết và checklist: `references/modules/surveys.md`.
- Validation cuối: 62 test đạt; frontend/auth strict/syntax/compile/diff đạt.

### Giảm lặp thương hiệu và tăng độ rõ logo login (2026-09-06)

- Logo gốc được tăng kích thước và đặt trên nền tối riêng để chữ nhỏ
  SON TAM Clinic không chìm vào ảnh. Bỏ tên phòng khám dưới slogan và footer;
  chỉ giữ một cụm thương hiệu ở góc trên, footer gọn policy/hỗ trợ.
- Browser 1900/1024/390/320px: đúng asset logo, không tràn ngang/lỗi JS;
  đã xem ảnh desktop/mobile `/tmp/qlpk-login-brand-1900.png` và
  `/tmp/qlpk-login-brand-390.png`. Chỉ sửa presentation của login.
- Diff check login đạt. Frontend contract chung bị chặn bởi hai handler
  toast ngoài login: `order-management.js` truyền `error.message` và
  `survey-template-create.js` truyền `err.message` ra UI. Không sửa các file
  ngoài phạm vi vì đang có công việc khác; không kết luận toàn bộ gate đạt.

### Audit menu Mẫu khảo sát (2026-09-06)

- Trace và browser audit xác nhận module chưa đạt: mất điểm từng ô grid, cấu hình kết quả chưa nối scorer, load mẫu bất đồng bộ có thể trộn dữ liệu, listener thêm cột lặp, đóng mất thay đổi chưa lưu, thiếu CSS ẩn và lệch adapter/validation grid cũ.
- 5/12 mẫu tương tác đang hoạt động thiếu ID câu hỏi (22, 23, 24, 29, 31); GAD-7 preview tái hiện lỗi. Tạo link chưa chặn mẫu không hợp lệ; snapshot phiên cũ cần xử lý riêng.
- 16 kiểm thử scorer hiện có đạt; chưa bao phủ các lỗi editor/result_config trên. Lượt này chỉ audit, chặn request ghi trong browser, chưa sửa code hoặc mẫu thật.
- Bằng chứng, owner và phạm vi cần sửa: `reports/survey-template-audit-20260906.md`.


### Triển khai login phương án 2 vào trang thật (2026-09-06)

- Các PNG trước đó chỉ là mockup; lượt này đã thay `login.html` và CSS owner
  bằng bố cục ảnh 55% / form 45%, nền kem liền mạch, footer dưới form.
  Bỏ card nổi/danh sách tính năng. Logo dùng trực tiếp file gốc
  `app/static/assets/logo-sontam-clinic.png`, không dùng logo được AI vẽ lại.
- Ảnh nền minh họa sinh riêng tại `app/static/assets/login-clinic-interior.png`;
  logo, chữ và form là HTML thật. Mobile xếp hero ngắn trên form; không dùng
  ảnh mockup nguyên trang làm UI. Quên mật khẩu mở email hỗ trợ, hỗ trợ mở số
  điện thoại hiện hữu. Auth handler/payload/role redirect giữ `login.js` cũ.
- Browser tại `/login.html` đạt ở 1853/1440/1024/768/390/320px: ảnh/logo tải
  thành công, không tràn ngang/lỗi JS; required, hiện/ẩn mật khẩu, checkbox,
  loading và error state đạt. Error POST được chặn bằng browser fixture 401;
  không thử đăng nhập tài khoản thật. Frontend contract và diff check đạt.
  Ảnh thực tế `/tmp/qlpk-login-option2-desktop.png`,
  `/tmp/qlpk-login-option2-mobile.png`, `/tmp/qlpk-login-option2-error.png`.
  Contract UI: `references/ui/login.md`.

### Gom nút với tên chỉ định, chuyển trạng thái xuống nhãn khảo sát (2026-09-06)

- Tên chỉ định và các nút trên cùng hàng. Bỏ dropdown của chỉ định khảo sát;
  badge trạng thái cạnh Khảo sát/Kết quả khảo sát, dùng getStatusBadge và
  refresh cùng timeline. Chỉ định thường giữ control trạng thái hiện hành.
- Browser dữ liệu thật: các nút căn giữa với tên, badge Đã gửi khảo sát đúng
  chỗ; đổi sang completed/custom không giữ badge cũ. Mobile không tràn;
  không lỗi JS. Node syntax/frontend contract và diff check đạt.
  Ảnh `/tmp/qlpk-survey-heading.png`.

### QR cùng chiều cao tiến trình (2026-09-06)

- Khi QR nằm cạnh timeline, chiều cao hàng chỉ do timeline quyết định;
  QR chứa trong hàng bằng CSS containment/object-fit, giữ hình vuông.
  Bỏ caption để không kéo dài card. Khung hẹp vẫn xếp QR dưới timeline.
- Browser thật: timeline/khung QR cùng 161.0625px, cùng mép trên; QR đã
  thu nhỏ vẫn giải mã đúng URL. Mobile hiển thị bình thường, không tràn.
  Node syntax, frontend contract và diff check đạt.
  Ảnh `/tmp/qlpk-qr-matched-height.png`.

### Chuyển QR vào vùng tiến trình (2026-09-06)

- QR nằm bên phải timeline trong card Tiến trình chỉ định, đúng vị trí user
  khoanh; link giữ tại phần khảo sát. Container hẹp xếp QR dưới timeline.
- `renderOrderSurveyContent` cập nhật/clear cả nội dung lẫn QR để tránh lưu
  QR cũ khi đổi chỉ định hoặc khi không còn link có thể làm bài.
- Browser dữ liệu thật: QR đúng vị trí, không trùng; mobile không tràn;
  đổi sang chỉ định có kết quả xóa QR trước. Giải mã ảnh QR đã render ở
  kích thước 180px khớp URL. Node syntax/regression, frontend và diff check đạt.
  Ảnh `/tmp/qlpk-qr-in-progress.png`, `/tmp/qlpk-qr-in-progress-mobile.png`.

### Nhãn tạo link và QR tồn tại sau reload (2026-09-06)

- Nguyên nhân QR mất: generate trả QR nhưng GET status chỉ trả token; frontend
  dựa sessionStorage mới có QR. Một helper backend trả URL/QR cho cả hai API;
  bỏ cache frontend cũ. Nút Tạo/Tạo lại dựa URL thật, hướng dẫn/toast cùng tên.
- Giữ generate idempotent: không đổi token/hạn/nháp của phiên còn hiệu lực.
- 34 integration tests rollback đạt, gồm GET không cache, generate lại,
  đúng order và auth. Browser ca đang thực hiện thật: reload giữ URL/QR,
  nhãn có link đúng; nhãn chưa có link kiểm bằng state UI tạm, không ghi DB.
  OpenCV giải mã QR đúng URL; desktop/mobile đạt, không lỗi JS. Syntax,
  frontend contract, Node regression và diff check đạt. Không tạo lại phiên
  của bệnh nhân thật trong QA. Ảnh `/tmp/qlpk-qr-desktop.png`, `/tmp/qlpk-qr-mobile.png`.

### Giữ giao diện cũ, chỉ cấu trúc lại chi tiết CLS (2026-09-06)

- Phản hồi người dùng: giao diện cũ tốt, không chấp nhận đổi sang bảng phẳng
  và timeline ngang. Khôi phục nền kem/card trắng, tiến trình dọc và nhóm
  kết quả có thanh tiêu đề nâu, đáp án trái/điểm và mức độ phải.
- Một màn hình hai cột: bệnh nhân → tiến trình → ghi chú ở trái; khảo sát,
  kết quả → file ở phải. File/ghi chú hiện trực tiếp, không collapse. Giữ
  Roboto 13px, modal 96%, mobile một cột và toàn bộ lifecycle/API cũ.
- QA read-only trên dữ liệu thật: order 364 điểm 2/3/1, 365 kết thúc chưa
  nộp, 500 chỉ định thường. Các field/file hiện ngay; 1900/1440/1024/390 không
  tràn ngang/lỗi JS. Link kết quả mở đúng trang, nút đính kèm mở file picker;
  focus/blur ghi chú không đổi không tạo request ghi. Node regression điểm,
  syntax, frontend contract và diff check đạt.
  Ảnh `/tmp/qlpk-detail-restored-results.png`, `/tmp/qlpk-detail-restored-empty.png`.
- Bản bảng phẳng ở mục lịch sử dưới đây đã bị thay thế. Yêu cầu gộp/cấu trúc
  lại không đồng nghĩa cho phép thay phong cách của các thành phần đang tốt.

### Thiết kế lại bố cục chi tiết CLS sau phản hồi visual (2026-09-06)

- Bản gộp trước chỉ ghép các vùng, còn cột trống và khung lồng nhau. Thay bằng
  context gọn, tiến trình ngang, kết quả toàn chiều rộng có cột thẳng hàng;
  giữ phần file/ghi chú mở rộng ở cuối. Tên mẫu là văn bản, bỏ dropdown khóa.
- Sửa đúng template/CSS và renderer chi tiết; không đổi API, scoring, trạng
  thái hoặc thao tác. Desktop tối đa 90rem, không ép cao từng nhóm; mobile
  tiến trình 2×2 và mỗi nhóm kết quả có nhãn điểm/mức độ riêng.
- Browser dữ liệu thật: order 364 có điểm 2/3/1, order 11 có điểm 2/3/0,
  order 365 kết thúc chưa nộp, order 500 chỉ định thường. Mở link kết quả,
  mở phần file/ghi chú đạt; 1900/1440/1024/390 không tràn ngang, không lỗi JS.
  Lần này không tạo hoặc ghi thêm dữ liệu QA. Node regression, syntax,
  frontend contract và diff check đạt. Ảnh `/tmp/qlpk-detail-redesign-active.png`,
  `/tmp/qlpk-detail-redesign-390.png`, `/tmp/qlpk-detail-redesign-empty.png`.

### Gộp chi tiết chỉ định thành một màn hình (2026-09-06)

- Bỏ tab Thông tin/Khảo sát cùng event chuyển tab và điều kiện tải theo tab.
  Mở chi tiết tải ngay thông tin, tiến trình và khảo sát. Một vùng trạng thái
  và thao tác chung; file/ghi chú thu gọn khi trống, tự mở khi có dữ liệu.
  Giữ hai tab Đang thực hiện/Hoàn thành của danh sách, Roboto 13px và màu chung.
- Chặn response cũ khi đổi chỉ định, chỉ đăng ký một handler đóng modal;
  xử lý đóng/mở nhanh để sự kiện modal cũ không xóa nội dung chỉ định mới.
- QA browser thật trên ca tổng hợp 499 (khảo sát) và 500 (chỉ định thường):
  gửi link, mở Xem kết quả, lưu ghi chú rồi mở lại, upload/download đối chiếu
  đúng byte và xóa file QA, kết thúc khảo sát và lưu trạng thái chỉ định thường.
  Kiểm chuyển chỉ định khi API cũ trả chậm và đóng/mở liên tiếp ba lần đạt.
  File QA đã xóa; ghi chú chỉ lưu trên ca QA, không sửa đáp án bệnh nhân thật.
- Desktop 1440px và mobile 390px đạt, không tràn ngang hoặc lỗi JavaScript.
  Ảnh `/tmp/qlpk-unified-results.png`, `/tmp/qlpk-unified-results-mobile.png`.
  Node syntax, regression điểm khảo sát, frontend contract và diff check đạt.
  Không đổi backend, schema hay logic trạng thái trong lần gộp màn hình này.

### Xem kết quả ở cả ba thời điểm, gồm tiến độ live (2026-09-06)

- Nút có ở mọi chỉ định khảo sát. Cùng trang patient-survey chỉ xem hiển thị
  nháp đang làm, bài đã nộp hoặc phần đã lưu khi kết thúc/hết hạn. GET tự cập
  nhật mỗi 3 giây, giữ câu đang xem; phân biệt “chưa nộp” và bài chính thức.
- Thêm draft/snapshot trên SurveySession; autosave 500ms, token/ID/revision
  validation, cùng thứ tự khóa order/session với submit/finish. Draft không
  tạo response/điểm chính thức hoặc chuyển trạng thái Có kết quả. Lưu theo
  session tránh lẫn tiến độ giữa các link; bản nháp server phục hồi được trên
  thiết bị khác. Session snapshot dùng chung cho render và chấm bài cuối.
- Migration `20260906_survey_live_draft` đã áp dụng; backup
  `/tmp/qlpk-before-live-survey.dump`. Schema contract, Alembic strict và auth
  strict đạt (420 routes, 63 public trong allowlist, 0 thiếu auth).
- QA browser thật: order 364 live 1/4 → bác sĩ thấy 25%, giữ vị trí câu khi
  cập nhật → nộp đủ 4 câu, điểm A=2/B=3/C=1 → bác sĩ kết thúc; order 365
  kết thúc ở 1/4 vẫn xem nháp; order 366 rút hạn chỉ riêng ca QA, completed
  do expired, cả bác sĩ/bệnh nhân vẫn đọc 1/4, ghi muộn trả 410. Hai browser
  context độc lập, không lỗi JS; kiểm desktop 1440px/mobile 390px và phục hồi
  nháp bằng context bệnh nhân mới không có localStorage.
- Ảnh QA: `/tmp/qlpk-live-draft.png`, `/tmp/qlpk-live-closed-mobile.png`,
  `/tmp/qlpk-live-expired.png`. Tiến độ trước bản cập nhật chỉ ở trình duyệt
  bệnh nhân không thể được phục hồi từ server. Live chỉ hiện phần đã đồng bộ.
- 33 integration tests đạt, gồm HTTP draft/read permission, xung đột revision,
  trả lời một phần, snapshot, nộp/đóng/hết hạn và giữ dữ liệu. Node regression,
  syntax, frontend contract và diff check đạt. Không thay đổi đáp án thật;
  chỉ thêm 3 ca QA nêu trên. Credential và browser kiểm thử đã được dọn.

### Login đồng bộ tông nâu–kem (2026-09-06)

- `login.html` tải `shared/color-tokens.css`; `pages/login.css` dùng token
  brown/chocolate cho panel, footer, nút và link; page-bg/surface-warm cho nền,
  gold cho điểm nhấn. Checkbox checked/focus và focus bàn phím cùng tông nâu.
  Giữ Roboto, bố cục responsive và logic `login.js` hiện hành.
- Browser QA desktop 1916×932/mobile 390×844 đạt; không tràn ngang/lỗi JS,
  hiện/ẩn mật khẩu, checkbox và focus hoạt động. Thông báo lỗi kiểm bằng
  response 401 giả lập trong browser, không gửi thông tin đăng nhập tới server.
  Frontend contract và diff check đạt. Ảnh `/tmp/qlpk-login-tone-desktop.png`
  và `/tmp/qlpk-login-tone-mobile.png`.

### Xem kết quả dùng lại giao diện khảo sát (2026-09-06)

- Bỏ renderer/CSS `surveySavedAnswers` trong CLS. Nút Xem kết quả là link
  mở tab mới `/patient-survey.html?review_order_id=<id>`; dùng lại
  `renderSingleQuestion`, restore đáp án và điều hướng của patient-survey.
- API có quyền đọc đúng chỉ định trả snapshot bài đã nộp và thông tin bệnh
  nhân tối thiểu. Review khóa input, không gọi API ghi hay chạm bản nháp;
  hoạt động sau khi bác sĩ kết thúc hoặc hết hạn. Giữ thông báo rõ khi chưa
  đăng nhập, không có quyền hoặc chưa có bài nộp. Không thay logic trạng thái.
- Dùng chung helper hydrate đáp án cho patient/review, hỗ trợ ID 0, checkbox,
  text, date và grid; progress nhận ID 0 là đã trả lời. Cache JS dùng app_version.
- QA: 20 integration tests đạt (transaction rollback), gồm snapshot sau khi
  sửa mẫu, đọc sau doctor/expired closure, 401/403/404, không đổi điểm/đáp án.
  Browser desktop 1440px/mobile 390px đã bấm link CLS và đối chiếu đủ 4 đáp án
  ở order QA 10 (Có kết quả) và 111 (Hoàn thành), khóa input, không API ghi,
  không tràn ngang. Đã kiểm thiếu bài và chưa đăng nhập; không lỗi JS.
  Ảnh: `/tmp/qlpk-review-desktop.png`, `/tmp/qlpk-review-mobile.png`.
- Kiểm bổ sung link completed của bệnh nhân: đủ 4 đáp án được khôi phục.
  Browser fixture kiểm ID 0, checkbox, paragraph, date, grid và khóa input;
  Node regression, syntax, frontend contract và diff check đều đạt.

### Đồng bộ cỡ chữ CLS về 13px (2026-09-06)

- Dùng shared base token 13px cho nội dung bảng, bộ lọc, tab, nút và chữ
  nghiệp vụ trong modal; small 12px, tiêu đề modal 16px. Giữ font Roboto.
  Chỉ sửa CSS owner CLS; không đổi font toàn hệ thống hoặc logic/API.
- Frontend contract đạt. Browser QA xác nhận computed styles Roboto 13px
  cho bảng, bộ lọc, tab và nội dung modal; tiêu đề modal 16px. Desktop
  1914px và mobile 390px không tràn ngang trang, không có lỗi browser.
  Ảnh QA: `/tmp/qlpk-font13-table.png`, `/tmp/qlpk-font13-modal.png`,
  `/tmp/qlpk-font13-mobile.png`.

### Gộp tab trạng thái vào toolbar CLS (2026-09-06)

- Hai tab Đang thực hiện/Hoàn thành chuyển vào đầu toolbar, trước tìm tên,
  ngày và Làm mới. Search desktop giới hạn 30rem, toolbar mobile tự xuống
  hàng. Chỉ sửa template/CSS; giữ IDs, sự kiện và logic trạng thái/API.
- Parent chain: workspace native pane → card → toolbar flex-wrap; tab
  không có margin-bottom riêng; bảng cuộn trong om-table-scroll.
- Frontend contract đạt. Chrome QA 1914×1000: tabs/search/ngày/Làm mới cùng
  hàng, ô tìm rộng 480px; mobile 390×844: tabs đầu, search xuống hàng, body
  không tràn ngang. Lọc rỗng/có kết quả, chuyển tab và bàn phím đạt; errors=[].
  Ảnh: `/tmp/qlpk-toolbar-desktop.png`, `/tmp/qlpk-toolbar-mobile.png`.

### Bốn trạng thái, hai tab và kết thúc khảo sát (2026-09-05 — hiện hành)

- Contract mới: sent → survey_sent → has_result → completed; nộp bài chỉ
  tạo Có kết quả. Hết hạn 24 giờ hoặc bác sĩ/TLG/admin kết thúc có kiểm quyền
  mới Hoàn thành. Lưu result_at, survey_expires_at, completion_reason/completed_by.
- Bảng có hai tab Đang thực hiện/Hoàn thành, số lượng từ backend theo cùng
  quyền/tên/ngày; chống response cũ khi chuyển nhanh. Timeline phân biệt bước
  chưa có kết quả với bước đã xảy ra. Kết thúc không xóa đáp án/điểm.
- Migration closure đã áp dụng local sau backup; dữ liệu khảo sát cũ có kết
  quả được phân loại lại, HADS order 9 Hoàn thành do hết hạn nhưng giữ dữ liệu
  thiếu để rà soát. Cơ chế hạn là reconcile trước request, UI refresh đúng
  deadline; chưa có worker nền khi không có request.
- PostgreSQL regression: 76 passed; schema/frontend/auth contracts đạt
  (419 routes, 357 protected, 62 public, missing_auth=0). Alembic strict đạt
  head closure, 19 revisions; HTTP page checks đạt.
- Browser QA thực tế: order 111 nộp bốn câu, điểm 2–3–0, Có kết quả vẫn ở
  Đang thực hiện; bác sĩ bấm kết thúc chuyển Hoàn thành, xem lại đủ bốn lựa
  chọn. Order 112 kết thúc chưa tạo/nộp bài hiện Chưa có bài nộp. Order 113
  tạo link rồi rút hạn riêng ca QA còn 15 giây: bảng tự chuyển tab đúng hạn,
  ghi reason expired, link bệnh nhân không còn nộp được. Không rút hạn ca thật.
- Desktop 1512x982/mobile 390x844: hai tab/count/filter rỗng và có dữ liệu,
  bàn phím, chuyển nhanh, phân trang (hạ page size phiên QA còn 2), xem lại
  kết quả sau kết thúc đều đạt. Mobile bảng cuộn ngang trong vùng bảng;
  body không tràn ngang. Vòng cuối errors=[]; lỗi kết nối ở vòng sửa Python
  trước do dev reloader, không lấy làm vòng QA cuối.
- Phiên QA ban đầu chỉ có token nên thiếu qlpk_user/permissions mà login
  thực tế lưu, shell ẩn pane. Đã dựng lại đúng phiên đăng nhập để QA, không
  vá CSS shell. Không tuyên bố đã QA lại mọi grid/TLG trong lát này.
- Ảnh QA local: `/tmp/qlpk-closure-tabs-desktop.png`,
  `/tmp/qlpk-closure-tabs-mobile.png`, `/tmp/qlpk-closure-completed-info.png`,
  `/tmp/qlpk-closure-empty.png`, `/tmp/qlpk-closure-result.png`.

### Một trạng thái chỉ định + Xem kết quả (2026-09-05 — lịch sử, đã thay contract)

- Đã triển khai contract được chốt: Chuyển thực hiện → Đã gửi khảo sát →
  Hoàn thành; không có bước bác sĩ xác nhận hoặc trạng thái Có kết quả riêng.
  Bảng/filter/dropdown/timeline/Doctor/TLG dùng `chi_dinh.status`.
- Thêm liên kết order/session/response, snapshot bài mới, transaction nộp
  bài/chấm điểm/hoàn thành; chặn submit sai context, nộp sửa, hoàn thành giả,
  generate lại sau completed và form cũ ghi đè trạng thái.
- Xem kết quả theo order có auth/scope, hiển thị các lựa chọn đã lưu và
  không tạo session/write. Đóng/hết hạn link không làm hoàn thành chỉ định.
- Migration đã áp dụng trên local, có backup DB trước thay đổi; schema và
  Alembic strict đạt. Reconcile chỉ hoàn thành order 10; HADS order 9 còn
  thiếu dữ liệu nên không tự sửa hoặc hoàn thành.
- Full pytest với integration PostgreSQL rollback: 70 passed, 8 dependency
  warnings. Frontend contract đạt; HTTP 30 trang trả 200. Auth contract đạt: 418 routes, 355 protected, 63 allowed public,
  missing_auth=0; đây là gate khai báo auth, không thay cho audit bảo mật toàn hệ thống.
- Browser Chrome QA độc lập vì CUA không khởi tạo được Node sau chuyển
  checkout. Ca mới order 56/session 84/response 17 nộp đủ bốn câu: A=2,B=3,C=0;
  trạng thái cập nhật ngay trong modal, dropdown và timeline, bảng completed
  đúng. Review đánh dấu bốn lựa chọn; thao tác xem không có HTTP write.
  Review desktop 1512x982 và mobile 390x844 đã xem; không overflow ngang.
  Màn Doctor mở ca QA và hiển thị ba chỉ định completed đúng.
- Phiên browser cuối sau runtime ổn định không ghi lỗi JS/console CLS;
  lỗi connection refused trong vòng sửa trước đó do dev reloader đã được
  phân biệt, không lấy vòng có lỗi làm kết quả cuối. Timestamp mới hiển thị
  đúng UTC→VN; không backfill thời gian lịch sử.
- Chưa pass visual/interactive QA riêng mọi dạng grid/checkbox/linear-scale
  hoặc mọi luồng của TLG; lát này kiểm luồng trắc nghiệm bốn câu và component
  trạng thái dùng chung. Các case scorer có regression test riêng.

### Khôi phục TemplateNotFound sau chuyển checkout (2026-09-05)

- Người dùng phát hiện `/index.html` báo 500. HTTP tái hiện được;
  `app/templates/index.html` vẫn tồn tại, traceback giữ đường dẫn checkout
  cũ `Documents/Hoc/qlpk_pro` dù thư mục đã chuyển sang
  `Documents/Học/Product/qlpk_pro`.
- Thiếu sót QA lượt đổi màu: đã biết thư mục chuyển nhưng không kiểm tải
  mới trang chủ/runtime trước khi báo cáo. Bổ sung gate vô hiệu kết quả
  kiểm tải trang cũ khi runtime/checkout thay đổi vào smoke checklist.
- Dừng đúng Flask parent/reloader cũ và khởi động lại bằng interpreter
  Python 3.11 hiện hữu từ checkout mới, `AUTO_CREATE_TABLES=false`.
  Không sửa app code, template hay dữ liệu nghiệp vụ trong lần khôi phục.
- QA: 30 route HTML trả 200; 21 asset tham chiếu trang chủ/CLS/khảo sát đều
  tải 200. Browser mở mới `/index.html` hiển thị shell, tài khoản đăng nhập,
  tab Trang chủ và nội dung nhiệm vụ phòng khám; không còn traceback.
  Đây là kiểm khôi phục runtime, không mở rộng kết luận QA khảo sát ở dưới.
- Runtime localhost được giữ chạy để người dùng tiếp tục; log khôi phục
  nằm ở `/tmp/qlpk-runtime-recovery.log`.

### Đồng bộ màu màn bệnh nhân làm khảo sát (2026-09-05)

- Template tải color tokens chung; CSS page đổi header xanh, progress,
  selected answer, focus, nút tiếp/quay lại/nộp bài và preview/completion
  về nâu–kem. Màu trạng thái success/error vẫn theo feedback token.
- Không sửa JavaScript, lưu bài hoặc scorer. Frontend contract và diff
  checks đạt. Browser desktop trên mẫu QA 32 xác nhận nền/header, chưa
  chọn/đã chọn đáp án, nút disabled/enabled và chuyển câu. Không nộp bài.
- Chưa pass visual/interactive QA riêng cho completion/expired, mobile,
  grid. Tab QA trong in-app browser timeout khi mở native confirm “Bắt đầu
  lại”; API dialog/close không xử lý được. Đáp án QA tạm chưa xác nhận đã
  dọn; không ghi response/điểm lên server trong lát đổi màu.
- Cuối lượt làm việc thư mục dự án được chuyển từ `Documents/Hoc/qlpk_pro`
  sang `Documents/Học/Product/qlpk_pro`; đã kiểm tra thay đổi CSS/template
  còn nguyên và cập nhật tài liệu tại đường dẫn mới.

### Sửa điểm khảo sát và QA một ca xuyên suốt (2026-09-05)

- Đã xử lý nguyên nhân ở template editor, writer/scorer backend và reader
  CLS: giữ ID khi lưu mẫu, cấp ID thiếu tại backend, bỏ ID tạm ở patient UI;
  chấm theo ID và quy ước legacy zero-based; điểm thiếu hiển thị “Chưa tính
  được”. API không còn nuốt lỗi scorer thành `{}` rồi báo lưu thành công.
- Thêm guard bảo vệ ID của mẫu đã có kết quả; không cho cập nhật template
  làm mất liên kết câu trả lời. Không backfill mẫu HADS hoặc response cũ.
- Ca QA được giữ để người dùng kiểm lại: mẫu `QA CLS Điểm khảo sát 20260905`
  ID 32, patient code `QA-CLS-20260905` (ID 317), appointment 1242,
  examination 1129, order 10, response 7. Hồ sơ/lượt khám/chỉ định nền được
  tạo bằng ORM có nhãn QA; mẫu được tạo và lưu lại bằng editor thật. Link
  tạo từ CLS; bốn câu được chọn và nộp bằng giao diện bệnh nhân thật.
- Kỳ vọng và thực tế DB/UI: A=2, B=3, C=0; đủ bốn câu trả lời và session
  completed. Reload CLS, reload bài bệnh nhân và lưu lại template giữ đúng
  đáp án/điểm/ID. POST payload có mã lạ trả 400 và kiểm DB trước/sau xác
  nhận kết quả hợp lệ không bị ghi đè.
- Browser desktop 1280x720: xem được ba nhóm bằng cuộn modal, điểm 0 thật
  và điểm thiếu phân biệt rõ; console QA không ghi error/warn. Ca HADS cũ
  hiện Lo âu=0, Trầm cảm=“Chưa tính được”, không còn 0 mặc định.
- Giới hạn QA: chưa pass visual/interactive QA mọi dạng lưới/checkbox/
  thang tuyến tính; không ghi nhận mobile pass vì viewport override không
  thay đổi kích thước thực tế của phiên browser này. Phát hiện thêm giờ
  hoàn thành response lệch 7 giờ so với thời điểm nộp do writer datetime
  hiện hữu; để scope sửa timezone riêng, không sửa timestamp bệnh nhân cũ.
- Tests mới: `tests/test_survey_scoring.py`, `tests/order_survey_results.test.js`;
  full pytest 59 passed (8 dependency warnings), frontend contract và
  syntax/diff checks đạt.
  contract chi tiết tại `references/modules/orders.md` và `data-contracts.md`.

### Trace điểm khảo sát CLS (2026-09-05 — chưa sửa logic)

Mục trace bên dưới là lịch sử trước khi triển khai lát sửa/QA phía trên.

- Đối chiếu SELECT trong transaction read-only và chạy riêng hàm scorer
  không ghi DB: điểm 0 ở một nhóm là điểm thật; nhóm còn lại thiếu điểm do
  template thiếu ID câu hỏi, response dùng mã tạm frontend. CLS biến thiếu
  điểm thành 0 nên hiển thị gây hiểu nhầm dù câu trả lời vẫn được lưu.
- Phát hiện thêm lệch index đáp án 0-based ở frontend / 1-based ở backend.
  Recalculate hiện tại tái hiện điểm nhóm bị thiếu, không khắc phục được.
- Chưa sửa code, template, response hay điểm bệnh nhân. Root cause và
  hướng xử lý/QA được ghi tại `references/modules/orders.md`.

### Typography và nút Chỉ định CLS (2026-09-05)

- Tiếp nhận phản hồi chữ nhỏ và nút lệch màu sau lát đổi màu bên dưới.
  Template tải trực tiếp shared typography/color/icon assets cho cả iframe;
  dùng Roboto 16px cho nội dung/input/nút, 14px cho nhãn/metadata/tiêu đề
  cột, 18px cho tiêu đề modal. Quy mô chữ được scope trong `.om-page`.
- Chuyển nút chi tiết, xóa, tải file, sao chép link về hệ icon chung;
  nút gửi link/đính kèm/làm mới dùng màu nâu theo token. Giữ đỏ cho tác vụ
  nguy hiểm và màu ngữ nghĩa cho trạng thái. Giữ nguyên event selector,
  data ID, save/load và các sửa notification/survey có sẵn trong working tree.
- Sau khi trace shell -> iframe -> main -> card -> bảng, thêm vùng cuộn
  ngang sở hữu bảng tối thiểu 64rem. Modal chuyển một cột dưới 48rem,
  nhóm kết quả xếp dọc, header ghi chú được wrap. Lát này xử lý giới hạn
  mobile còn tồn tại ở lần đổi màu trước, không đổi API/schema.
- QA: `node --check app/static/js/order-management.js`, frontend contract,
  `git diff --check` đạt; pytest 43 passed (8 dependency deprecation warnings).
  Firefox xác nhận Roboto thực tế, nội dung/nút 16px và nhãn 14px;
  nút gửi link và header có computed background `rgb(75, 39, 25)`.
- Dữ liệu thật: danh sách một chỉ định, modal Thông tin và kết quả HADS
  đã kiểm trên desktop và mobile 390x844. Mobile Tab tới nút cuối bảng
  cuộn đúng sang cột tác vụ; Tab tới ô mức độ cuối cuộn đúng trong modal.
  Chỉ xem/focus, không ghi dữ liệu, upload, xóa hoặc gửi link.
- Chưa pass visual/interactive QA cho bảng nhiều dòng/phân trang, file có
  dữ liệu và các trạng thái không có mẫu thật. Console xuất hiện lỗi
  Socket.IO WebSocket khi reload; chưa xác nhận nguyên nhân, không báo
  console sạch. Đã đóng DevTools/responsive và trả về danh sách desktop.
- Contract cập nhật tại `references/modules/orders.md`.

### Chỉ định CLS dùng bảng màu chung (2026-09-05)

Đây là lát đổi màu trước phản hồi typography; giới hạn mobile bên dưới đã
được xử lý tiếp ở mục Typography và nút phía trên.

- Đổi presentation trong `app/static/css/pages/order-management.css` sang
  tông nâu–kem. Các biến `--om-*` lấy màu header và token nền/viền/chữ chung,
  áp vào bảng, toolbar, focus/hover, badge tổng, modal, tab và kết quả khảo sát.
  Giữ màu trạng thái theo ngữ nghĩa; timeline hoàn thành dùng success token.
- Không đổi HTML/JavaScript/API/schema, kích thước hoặc overflow. Các thay
  đổi notification/survey JavaScript đang có trong working tree được giữ nguyên.
- QA tĩnh: frontend contract và `git diff --check` đạt. Firefox xác nhận
  stylesheet được tải/parse (130 CSS rule); header bảng computed
  `rgb(75, 39, 25)`. Desktop với iframe `1920x580` khi DevTools mở có
  body/html scrollWidth bằng viewport, không overflow ngang.
- QA dữ liệu thật: danh sách một chỉ định, modal Thông tin, timeline hoàn
  thành, tab kết quả HADS, input tìm kiếm/focus và trạng thái không có kết
  quả hiển thị đúng tông màu. Không thao tác lưu/xóa/upload/gửi link.
  Console không có error; có một warning Firefox về forced layout trước
  khi trang tải đầy đủ, không ghi nhận là console hoàn toàn sạch.
- Chưa pass visual/interactive QA toàn màn: mobile `390x844` còn cắt cột
  tình trạng/tác vụ do bảng nằm dưới main `overflow-x: hidden`; chưa sửa
  layout trong scope đổi màu. Bảng nhiều dòng/phân trang, file có dữ liệu,
  hover dropzone và các trạng thái processing/completed của danh sách chưa
  được xác nhận đủ. Cần lát responsive riêng để xử lý chain bảng/main.
- Đã xóa chuỗi tìm kiếm QA, đóng DevTools/chế độ responsive và trả browser
  về danh sách ban đầu. Contract presentation cập nhật trong
  `references/modules/orders.md`.

### Clinical Order Notifications And Survey Result Flow (2026-09-01)

- POST đồng bộ chỉ định tạo notification in-app cho performer trong cơ sở
  khi có dòng mới hoặc đổi performer; dòng ngoài cơ sở bị bỏ qua. Service
  dùng `dedupe_key` theo sự kiện để retry không nhân bản thông báo.
- Hai đường cập nhật session (`update-status` và `update-status-by-token`)
  chỉ notify khi có chuyển trạng thái thật sang `completed`, gắn đúng
  performer theo template của response/session.
- Timeline quản lý chỉ định nhận trạng thái session thực tế nên ca HADS có
  session `completed` không còn đứng ở bước “Chưa gửi”. Endpoint public mẫu
  khảo sát trả `questions_by_criteria`; renderer kết quả dùng cả
  `updated_at` và `created_at`.
- QA tĩnh/unit và dry-run transaction đã kiểm tra target performer, không
  notify ngoài cơ sở và không duplicate. Browser QA ca HADS appointment
  `1101` hiển thị timeline hoàn thành và card điểm; console không lỗi/warn.

### Schema/Test Gate Cleanup (2026-09-01)

- Thêm một migration hậu kiểm `20260901_reconcile_doctor_legacy` để archive
  rồi loại bỏ 4 bảng Doctor legacy còn sót trong database đã được stamp ở
  revision cũ; không chạm bảng sống và không dùng `CASCADE`.
- Alembic online/offline lấy `DATABASE_URL` từ settings của ứng dụng, tránh
  chạy nhầm database do URL tĩnh trong `alembic.ini`.
- Thêm `pytest.ini` tối giản (`pythonpath = .`, `testpaths = tests`) để lệnh
  `pytest -q` chuẩn chạy được từ thư mục repo.
- Local DB đã backup trước khi migrate và nâng lên revision mới. Schema gate,
  Alembic strict và `pytest -q` đều đạt.

### Survey Result Template Ownership (2026-09-01)

- Tab Khảo sát trong màn quản lý chỉ định chỉ tải mẫu từ
  `chi_dinh.survey_template_id`; dropdown hiển thị đúng một option bị khóa ở
  cả trạng thái chưa có kết quả và đã có kết quả.
- Đã bỏ nhánh đổi mẫu/tự gửi link theo mẫu khác và lọc response theo template
  của chỉ định, tránh hiển thị hoặc gửi sai bài test. Không đổi API lưu chỉ
  định hay dữ liệu khảo sát.
- Browser QA với chỉ định HADS thật: request detail mẫu trả `200`, dropdown
  chỉ có HADS và `disabled=true`, console error/warn rỗng.

### Survey Editor Default Performer Placement (2026-09-01)

- Khối thông tin của editor mẫu khảo sát dùng grid responsive: tên mẫu ở bên
  trái, `Người thực hiện mặc định` ở góc phải cùng hàng, mô tả trải toàn bộ
  hàng dưới.
- Overlay `#surveyCreateOverlay` và route tạo độc lập dùng cùng quy tắc CSS;
  desktop giữ hai cột, mobile tự xếp một cột. Không đổi JavaScript, API,
  payload hoặc lifecycle tải/lưu performer.
- Browser QA với mẫu HADS: desktop dropdown nằm cùng hàng bên phải tên, chọn
  performer hoạt động; mobile `390x844` xếp dọc, body/html không tràn ngang,
  console error/warn rỗng. Cả overlay và route tạo độc lập đều đã kiểm.
- Static QA: frontend contract, smoke health, full pytest và `git diff --check`
  đều đạt.

### Clinical Indication Source Badge Removal (2026-09-01)

- Bảng `Trong lượt khám này` và `Lịch sử các lần trước` không còn hiển thị
  badge `Nhập text`/`Khảo sát` cạnh tên chỉ định; tên chỉ định được giữ gọn,
  dễ quét hơn.
- `source`, `survey_template_id`, edit/restore và payload save vẫn giữ nguyên
  ở runtime; chỉ bỏ presentation badge, không thay đổi phân biệt dữ liệu.
- Đã dọn CSS badge nguồn và thêm contract/test để ngăn badge quay lại.

### Unified Clinical Indication Input (2026-09-01)

- Form Chỉ định dùng chung cho Doctor và Tâm lý gia đã bỏ selector `Loại chỉ
  định` và hai radio `Nhập text`/`Khảo sát`; chỉ còn một input với gợi ý
  `Tìm khảo sát hoặc nhập tên`.
- Dropdown luôn tìm mẫu khảo sát. Chọn một mẫu sẽ gắn `survey_template_id` và
  giữ gợi ý người thực hiện mặc định; nội dung không chọn mẫu được lưu dạng
  `custom` chỉ với `order_name`. Backend và payload/lịch sử giữ nguyên;
  source chỉ còn là dữ liệu nội bộ, không hiển thị badge trong bảng.
- Đã bỏ branch source UI, config `allowedSources` và CSS picker cũ; lifecycle
  clear/load/save vẫn do `indicationsForm` sở hữu duy nhất.
- QA browser Doctor với ca thật: input không còn selector, mở dropdown có mẫu
  khảo sát, tìm `ZUNG` trả đúng mẫu, chọn mẫu đóng dropdown, gõ text tự do
  hiện trạng thái không có mẫu phù hợp nhưng vẫn giữ nội dung; không overflow
  ở `1280x720`, console error/warn rỗng. Không bấm Lưu và không ghi dữ liệu.
- Static QA: `node --check`, Doctor contract, frontend contract, smoke health,
  workflow tests và ICD tests đều đạt.

### Clinical Indication Catalog Removal (2026-08-31)

- Chỉ định hiện chỉ còn hai nguồn `custom` (nhập text) và `survey` (chọn mẫu
  khảo sát) ở cả Doctor và Tâm lý gia; không còn chọn từ danh mục.
- Đã bỏ màn quản trị/API/model/frontend catalog và quyền `ql-danhmuc-chidinh`.
- Migration `20260831_drop_order_catalog` archive dữ liệu trước khi drop
  `order_categories`, `order_items`, `chi_dinh.order_item_id` và
  `chi_dinh.group_path`; `20260831_drop_order_catalog_perm` dọn shortcut/quyền
  cũ. Lịch sử `chi_dinh.order_name`, khảo sát và file kết quả vẫn giữ nguyên.
- Workspace shell tự lọc route nghỉ `/order-catalog.html` khỏi tab đã lưu từ
  phiên cũ; không để tab “Danh mục chỉ định” quay lại dù navigation config đã
  bỏ mục này.
- `supportModulesUi.getSaveReadiness()` kiểm tra cờ canonical `surveyLoaded`,
  không còn phụ thuộc cờ `catalogLoaded` đã bị xóa; static Doctor contract đã
  được cập nhật để giữ hai nguồn dữ liệu nhưng chỉ render một input và ngăn
  runtime catalog.
- Browser QA 2026-08-31: launcher và workspace tabs không còn Danh mục chỉ định;
  Doctor/Tâm lý gia đều không còn control Catalog, còn phân biệt source chỉ
  tồn tại trong payload/bảng truy vết;
  console error/warn rỗng. Chưa mở được state populated/interactive của pane
  Doctor/Tâm lý gia trong phiên này vì session hiện tại là Admin và queue theo
  role không có ca; không tự đổi trạng thái hay tạo dữ liệu khám để test.
- QA follow-up 2026-09-01: form Chỉ định dùng một input, pane giữ chiều cao
  workspace và tự cuộn nội bộ khi mở Lịch sử, không tạo page overflow. Ca Bác
  sĩ có lịch sử thật đã kiểm bằng browser; chưa test role Tâm lý gia vì phiên
  đăng nhập chưa chuyển role.

### ICD Search Pagination And Indexing (2026-08-31)

- API `/api/icd/` giữ lọc/phân trang ở backend, bỏ `ORDER BY` khi `count()`,
  kiểm tra `skip/limit` và giới hạn page tối đa 1.000 dòng.
- Loader dùng chung có contract `loadICDPage`; autocomplete mặc định tải 100
  dòng (trống 30), giữ metadata `pagination` và có nút `Tải thêm`. Contract
  mảng `loadICDData` của các caller cũ vẫn ủy quyền từ loader, không cắt dữ liệu.
- Thêm migration `20260831_icd_search` với functional trigram indexes cho mã/
  tên ICD đã chuẩn hóa; local database đã nâng lên revision này.
- Regression: Node kiểm tra URL/page/load-more, Python kiểm tra tham số phân
  trang; API thật xác nhận trang 2 lấy được kết quả sau dòng 1.000.

### Unified Search Normalization (2026-08-30)

- Chuẩn hóa tìm kiếm dùng chung ở backend và frontend: không phân biệt hoa/
  thường, bỏ dấu tiếng Việt, và quy đổi `đ/Đ` thành `d`. Backend dùng
  `TRANSLATE + LOWER` qua `app/utils/search_normalization.py` để tương thích
  PostgreSQL collation `C`; frontend dùng
  `app/static/js/shared/search-normalization.js`.
- Đã áp dụng cho global search, bệnh nhân/lịch hẹn, ICD, chỉ định, mẫu khảo
  sát, danh mục thuốc/DAV, hoạt chất/dị nguyên, nhà cung cấp, giao dịch kho,
  thanh toán, quản lý khám, địa chỉ và các bộ lọc/autocomplete cục bộ (menu
  Ứng dụng, danh mục chỉ định, tương tác thuốc, chi tiêu, dịch vụ, địa chỉ,
  Tiền sử dị nguyên).
- Regression tests: `tests/test_search_normalization.py` và
  `tests/search_normalization.test.js`.
- QA: `scripts/check_frontend_contract.py`, `scripts/smoke_health.py`,
  `PYTHONPATH=. pytest -q` (15 passed), Node syntax và `git diff --check` đạt.
  Browser admin xác nhận `dat`/`Đạt` đồng nhất ở Global Search, Danh mục chỉ
  định, Lịch hẹn, Tương tác thuốc và autocomplete địa chỉ; console không có
  error/warn. Chi tiêu hiện không có dữ liệu và Tiền sử chưa có ca mở trong
  phiên QA nên hai state populated đó chưa được xác nhận bằng mắt.

### Doctor Medical History ICD Bootstrap Lifecycle (2026-08-30)

- Sửa lỗi ô ICD trong Tiền sử không xổ dropdown: `medical-history-form.js`
  không còn auto-init instance trước khi feature bridge đăng ký action; bridge
  Doctor gọi `init()` sau khi ICD bridge đã gắn `setupICDMultiSelect`.
- Giữ nguyên API, payload, CSS, macro và data owner. Hai mode `physHistory` và
  `famHistory` giờ tạo đúng component autocomplete, gửi `/api/icd/?search=...`
  và render option trong cùng lifecycle.
- Thêm regression test `tests/medical_history_icd_bootstrap.test.js` mô phỏng
  đúng thứ tự load để ngăn lỗi init sớm quay lại.
- QA: Node syntax/test, ICD/frontend contract, smoke health, workflow pytest
  và browser ca HS00267; gõ `f` trong Tiền sử hiển thị dropdown 532 option,
  request ICD trả `200`, không có runtime exception.

### Doctor Medical History ICD Single Frame (2026-08-30)

- Biến thể `doctor_flat` của Tiền sử không còn vẽ card border quanh
  `.medical-history-section`; section giữ header/divider, còn
  `.icd-input-container` là frame duy nhất của control ICD.
- Rule focus chung của Doctor loại trừ `[data-icd-autocomplete-input]`; trạng
  thái keyboard focus của ICD chỉ hiển thị qua `:focus-within` trên container,
  không còn outline xanh lồng bên trong.
- Không đổi macro Jinja, ID, API, payload, state, clear/load hoặc logic
  autocomplete. Input ICD vẫn là child borderless của container.
- Static contract, smoke health, full pytest, keyboard-focus cascade test và
  browser console smoke trên `qlpk_pro:8000` đạt. Computed style xác nhận
  section không còn full frame, input không còn outline, container còn một
  border/focus ring. Chưa có ca khám trong phiên browser hiện tại nên chưa
  pass visual/interactive QA với state populated/focus thật.

### Survey Indication Performer (2026-08-28; source selector superseded 2026-09-01)

- Mẫu khảo sát có thêm `default_performer_id` (FK tới `users`) và
  `default_performer_name` trong serializer/API. Màn quản lý mẫu khảo sát cho
  phép chọn người thực hiện mặc định khi tạo, sửa hoặc tải file; danh sách
  người khám được tải từ `/users/doctors`.
- Component Chỉ định dùng chung trước đây giữ selector nguồn; từ 2026-09-01
  selector đã bỏ và form dùng một input. Khi chọn mẫu khảo sát, component tự
  chọn performer mặc định nếu mẫu đã cấu hình; người dùng vẫn đổi được trước
  khi thêm/lưu. Text không chọn mẫu vẫn là `custom`.
- Browser QA lịch sử với tài khoản Tâm lý gia `duongnguyen` trên ca Võ Vương
  Cao Sáng: thêm draft Nhập text và Khảo sát, đổi performer, badge/bảng và
  reset form đều đúng; không bấm Lưu, không ghi dữ liệu thật. Bác sĩ
  `hienngvo` trên ca Ngô Hiển Đạt từng hiển thị đủ các nguồn trước khi selector
  được rút gọn. Màn quản lý mẫu hiển thị cột performer và hai form tạo/upload
  đều tải đủ danh sách người khám. Console error/warn rỗng.
- Môi trường hiện có 15 mẫu khảo sát nhưng cả 15 đều `default_performer_id =
  NULL`, nên chưa thể xác nhận bằng mắt state tự điền tên trong một mẫu đã cấu
  hình. Đây là việc cấu hình dữ liệu quản trị còn lại; không tự gán người vào
  mẫu hiện hữu trong QA.
- Static QA: `pytest -q tests/test_workflow_contracts.py` (11 passed), Node/
  Python syntax, frontend/Doctor contract, HTTP smoke, Alembic strict và API
  auth đều đạt. `check_schema_contract.py` còn báo 4 bảng legacy vật lý
  (`examination_diagnosis`, `examination_prescriptions`,
  `examination_records`, `medical_records`) ngoài metadata; không xóa trong
  lát tính năng này.

### Survey Editor Full-Width Overlay (2026-08-28)

- `#surveyCreateOverlay` trong màn quản lý mẫu khảo sát không còn chừa
  `16.666667%` cho cột danh sách; overlay editor phủ toàn bộ chiều rộng màn
  hình ở desktop và mobile.
- Giữ nguyên parent/child layout: overlay cố định theo viewport, còn
  `.sc-content` là owner scroll dọc của nội dung câu hỏi; không đổi field,
  API, save lifecycle hoặc dữ liệu mẫu.
- Browser QA trạng thái chỉnh sửa mẫu ZAI: overlay chạm `x=0` và mép phải,
  desktop `1280x720` và mobile `390x844` không có horizontal overflow; nội
  dung dài scroll trong `.sc-content`, tiêu đề/tabs/form vẫn hiển thị, console
  error/warn rỗng. Static frontend/smoke và `git diff --check` đạt.

### Source Cleanup And Runtime Map (2026-08-23)

- Đã audit và xóa 29 file dead không còn template link, import, route hoặc
  caller active: 22 JS helper trong `components/` và `orders/`, 2 JS legacy
  (`notes-attachment-chip.js`, `reexam-calendar.js`), 6 CSS legacy và 1
  template dry re-examination calendar. Tổng phần bỏ khỏi source khoảng
  333 KB/10.381 dòng.
- Không xóa các owner đang chạy: `patient-search-modal-dry.js`,
  `personal-detail-modal-dry.js`, `transfer-modal-dry.js`, patient-history
  bridges, 27 Doctor modules, backend compatibility wrappers, hoặc các thư
  mục archive/operational (`_archive/`, `backups/`, `uploads/`, `data/`,
  `tmp/`, `designs/`, `output/`).
- Orders frontend sau cleanup chỉ ghi nhận các helper đang được template load
  (`order-status-utils.js`, `order-selection-state-utils.js`,
  `order-autocomplete-utils.js`); catalog/tree/performer/print orchestration
  nằm ở page owner cho đến khi có contract/lifecycle dùng chung thực sự.
- `references/architecture-map.md` đã bổ sung active/dead/compatibility
  boundary và quy tắc không tạo micro-module nếu không có lifecycle riêng
  hoặc ít nhất hai workflow owner. `references/modules/orders.md` đã phân
  biệt owner active với các entry lịch sử đã nghỉ.
- QA sau cleanup: static caller/path scan không còn tham chiếu runtime; 202 JS
  active syntax pass; `pytest -q tests` 10 passed; frontend/Doctor/Lễ tân/
  patient-history contracts, HTTP smoke và `git diff --check` pass. Browser
  Doctor + tab Chỉ định với ca thật không có console warning/error, không
  overflow và không tải file retired. Browser Tâm lý gia/Lễ tân trong phiên
  hiện tại bị redirect vì tài khoản đang là role Bác sĩ; hai màn vẫn được
  kiểm qua static/template/HTTP contract, chưa kết luận visual riêng cho role
  đó.

### Psychologist Patient History Bridge Extraction (2026-08-23)

- Tách phần khởi tạo modal lịch sử bệnh nhân, global search actions, realtime
  bệnh án và copy-form adapter khỏi page orchestrator sang
  `app/static/js/psychologist-examination/patient-history-bridge.js`.
- `psychologist-examination.js` còn 469 dòng (trước lát này 547 dòng); page chỉ
  compose dependency/callback. Không đổi URL, payload, modal partial, global
  bridge tương thích hoặc data owner.
- `check_patient_history_modal_contract.py` đã nhận owner bridge canonical thay
  vì bắt page gọi factory trực tiếp, tránh checker cũ ngăn refactor đúng owner.
- QA: Node syntax, 8 pytest, frontend/smoke/Doctor/history/receptionist,
  schema/Alembic/auth và `git diff --check` đạt. Browser ca Võ Vương Cao Sáng
  mở Lịch sử thật, đổi sang Phạm Khôi rồi quay lại; modal hiển thị, dữ liệu
  không stale, desktop `1280x720` và mobile `390x844` không overflow, console
  error/warn rỗng.

### Psychologist Runtime Contract Tests (2026-08-22)

- `tests/test_workflow_contracts.py` là bộ regression test tự động đầu tiên cho
  lát workflow Tâm lý gia: kiểm tra smoke/frontend contracts, field map một
  owner, runtime load writer và không còn caller tới adapter đã xóa.
- `tests/psychologist_workspace_runtime.test.js` chạy bằng Node VM với component
  stub để kiểm chứng load/clear, context token chống response cũ và trạng thái
  stale khi đổi nhanh lượt khám; không gọi database hoặc ghi dữ liệu thật.
- `examDetailMedicalHistory` đã được map đúng vào
  `tam_ly_gia_kham_tien_su.medical_history`, đồng nhất với backend/detail-modal
  contract. Hai bridge đã xác nhận không còn caller (`loadPreviousVitals` và
  alias `uploadFile`) được gỡ khỏi orchestrator; các bridge có caller thật vẫn
  giữ nguyên.
- QA: `pytest -q tests/test_workflow_contracts.py` (8 passed), Node syntax,
  frontend/Doctor/medical-history/patient-history contracts, schema, Alembic,
  auth, HTTP smoke và `git diff --check` đều đạt. Browser kiểm ca Võ Vương Cao
  Sáng ↔ Phạm Khôi ở desktop `1280x720` và mobile `390x844`: load/clear không
  rò dữ liệu, accordion đúng, body/html không overflow, console error/warn rỗng.

### Clinical Workspace Viewport Bound (2026-08-22)

- Khung Khám Doctor/Tâm lý gia được giữ trong chiều cao viewport khả dụng ở
  mọi breakpoint. `doctor-clinical-layout` và `doctor-clinical-main` không còn
  scroll; khi nội dung nhiều, chỉ `doctor-workbench-panel__body--clinical` cuộn
  nội bộ. Mobile không còn chuyển clinical workspace sang document flow và
  grid main dùng `minmax(0, 1fr)` để không nở theo min-content.
- `psychologist-examination.html` nạp lại `examination-detail-modal.css`, là
  owner presentation của `autoSaveIndicator`; indicator fixed nên không tạo
  thêm overflow trang.
- Browser QA ca thật Võ Vương Cao Sáng ở `1280x720`, `1920x1080`, `768x1024`
  và `390x844`: form nằm trong viewport, body/html không overflow, scroll chỉ
  ở clinical body khi cần, screenshot desktop/mobile đúng bố cục, console
  error/warn rỗng. `check_frontend_contract.py`, `check_receptionist_fe_contract.py`,
  `smoke_health.py` và `git diff --check` đạt.

### Psychologist Clinical Responsive Accordion (2026-08-22)

- Hai nhóm `Khám & đánh giá tâm lý` và `Khám tâm thần` vẫn dùng nguyên field
  ID, section/payload và lifecycle hiện có; presentation chuyển sang một
  disclosure owner duy nhất trong `psychologist-clinical-workspace.html`.
- Desktop từ `64rem` mở đồng thời hai card bằng Grid `repeat(2,
  minmax(0, 1fr))`; tablet/mobile xếp một cột và chỉ mở một nhóm, không dùng
  JS đo kích thước. Field rows dùng `minmax(0, 1fr)`, textarea tự cuộn khi
  văn bản dài để không đẩy form hoặc tạo document overflow.
- Browser QA ca thật Võ Vương Cao Sáng tại `1783x822`, `1920x1080`,
  `1280x720`, `768x1024` và `390x844`: card desktop cân bằng, accordion
  chuyển nhóm đúng, mobile một cột không chồng label/input, nội dung dài chỉ
  cuộn trong textarea, body/html không overflow, đổi ca Võ Vương ↔ Phạm Khôi
  không rò dữ liệu, console error/warn rỗng. Jinja parse, Node syntax,
  frontend/receptionist/Doctor/medical-history/patient-history contracts,
  `smoke_health.py` và `git diff --check` đạt.

### Psychologist Patient Hero DOM Alignment (2026-08-22)

- `doctor-patient-hero__body` của Tâm lý gia đã dùng cùng thứ tự DOM với
  Doctor: `title-row` chứa tên bệnh nhân, mã hồ sơ và lượt khám. Không đưa
  các dữ liệu riêng của Doctor như chẩn đoán/đơn thuốc vào role TLG.
- Không đổi ID, API hoặc action buttons. Browser chọn ca Võ Vương Cao Sáng
  hiển thị đúng tên/mã/lượt khám, body/html không overflow và console
  error/warn rỗng; Jinja parse, frontend contract, HTTP smoke và diff check
  đạt.

### Psychologist Clinical Input Sizing (2026-08-21)

- Không thêm field hoặc nghiệp vụ mới. Vùng Khám Tâm lý gia giữ nguyên hai
  nhóm hiện có nhưng tăng chiều cao tối thiểu và khoảng cách cho textarea để
  ghi nhận nội dung dài dễ hơn; CSS được scope vào
  `#psychologistClinicalDecisionPanel`, không ảnh hưởng mật độ Doctor.
- Parent chain giữ nguyên: clinical panel → `doctor-workbench-panel__body`
  scroll nội bộ → clinical flow; không dùng JS đo pixel và không làm tràn
  toàn trang.
- Browser QA desktop `1280x720`: ô narrative 68px, ô trạng thái tâm thần
  56px, nội dung dài có scroll nội bộ, body không overflow, console sạch.
  Mobile `390x844`: body width bằng viewport, các field vẫn nhập được, console
  error/warn rỗng.

### Psychologist Legacy Branch Cleanup (2026-08-21)

- Tâm lý gia chỉ còn dùng `workspace-runtime.js` làm lifecycle owner cho
  Hành chính, Tiền sử, Khám, Dịch vụ và Chỉ định; đã gỡ khỏi template và
  orchestrator các modal/adapter legacy trùng lặp (duplicate patient, Hỏi
  bệnh, Khám chi tiết, Dịch vụ và order catalog cũ).
- Template chỉ còn nạp asset cần cho workspace mới và các tab lịch sử dùng
  chung; renderer tài liệu vẫn dùng owner Lễ tân/Doctor dùng chung. Không đổi
  API, payload, schema hoặc xóa dữ liệu bệnh nhân/tài liệu.
- Static QA: Node syntax, frontend/receptionist contracts, smoke health và
  `git diff --check` đạt. Browser QA desktop và mobile: chọn ca 1/4 tài liệu,
  đổi ca không giữ dữ liệu cũ, đủ 5 tab hoạt động, không còn bốn modal legacy,
  không overflow và console error/warn rỗng. Ca Võ Vương vẫn hiển thị giá trị
  `QA temporary value` đã tồn tại từ lần QA trước; không tự ý xóa dữ liệu đó.

### Psychologist Shared Clinical Workspace (2026-08-20)

- Tâm lý gia dùng cùng composition/shell với Bác sĩ: queue/main, patient
  intake, section rail, `doctor-workbench`, `doctor-workspace-stage` và các
  surface/token chung; chỉ vùng field nghiệp vụ nằm riêng tại
  `partials/psychologist-clinical-workspace.html`.
- Vùng Khám chỉ render field của Tâm lý gia và section `tam_ly_gia_*`: lý do
  khai thác, đánh giá/diễn tiến, triệu chứng-hành vi, nhận định, kế hoạch,
  khám tâm thần và ghi chú. Chẩn đoán ICD, khám cơ quan, thuốc và đơn thuốc
  của Bác sĩ không còn xuất hiện trên DOM TLG.
- `psychologist-component-config.js` là field/section map; `workspace-ui.js`
  sở hữu chuyển vùng, show/clear theo patient lifecycle. Các field tâm thần
  inline vẫn dùng autosave owner hiện tại và không đổi API/schema.
- Static QA: Jinja render/duplicate ID, Node syntax, frontend contract,
  smoke health, patient-history/medical-history contract đạt. Browser QA bằng
  tài khoản role Tâm lý gia đã kiểm empty/populated, header patient, chuyển
  bệnh nhân không giữ field cũ, rail Khám/Dịch vụ/Chỉ định, mở modal Chỉ định,
  viewport desktop và `390x844`; console sạch. Khi đổi ca trong QA đã phát
  hiện autosave của field thử nghiệm, cần dọn dữ liệu thử trước khi chốt pass
  workflow save/load.

### Psychologist Indications Shared Stylesheet (2026-08-21; unified input 2026-09-01)

- Tâm lý gia đã nạp `pages/doctor-indications.css`, đúng owner presentation
  của component Chỉ định dùng chung; không tạo CSS/logic riêng theo role.
- Browser QA ca thật đã kiểm Hành chính, Tiền sử, Khám, Dịch vụ và Chỉ định;
  mobile `390x844` không tràn trang, form Chỉ định tách hàng rõ, và lịch sử
  hoạt động, đổi ca không giữ dữ liệu ca trước. Từ 2026-09-01, form chỉ còn
  một input tìm khảo sát/nhập text; desktop `1280px` khớp wrapper, console
  error/warn rỗng.

### Psychologist–Doctor Visual Reconciliation (2026-08-21)

- Đối soát browser cùng viewport `1280x720` và `390x844` bằng ca thật, không
  chỉ contract: Hành chính, Tiền sử, Khám, Dịch vụ, Chỉ định, mở/đóng Lịch sử
  và đổi ca đều được kiểm tra.
- Tâm lý gia đã dùng cùng presentation queue Doctor (timeline card, không
  action legacy), header chỉ còn `Lịch sử/Lưu/Hoàn thành`; rail vẫn giữ đủ 5
  vùng nghiệp vụ. Không đổi API/payload hay field Khám riêng của TLG.
- Các selector màu legacy `#historyBtn/#orderBtn/#documentBtn/
  #completeExaminationBtn` trong `shared/examination-workflow.css` đã scope
  vào `.patient-header-actions`, tránh thắng palette Doctor workspace. Browser
  xác nhận hai role cùng màu nâu–kem, không overflow, console error/warn rỗng;
  đổi ca TLG không giữ dữ liệu ca trước.

### Doctor Indications Action Column Label (2026-08-20)

- Header cột thao tác của bảng Chỉ định hiện hiển thị rõ `Thao tác` ngay sau
  `Trạng thái`; giữ nguyên các nút Sửa/Xóa và không đổi dữ liệu hay payload.
- Browser QA xác nhận đủ 6 header, không overflow trang và console không có
  error/warn.

### Doctor Indications Desktop Table Fit (2026-08-20)

- Bảng Chỉ định desktop không còn ép `min-inline-size: 48rem` trong vùng chỉ
  còn khoảng 721px; bảng co theo parent và không hiện thanh scroll ngang.
- Sáu cột dùng tỉ lệ desktop đủ cho tên/nơi thực hiện xuống dòng và dành 12%
  cho cụm Sửa/Xóa. Viewport hẹp vẫn giữ table tối thiểu 44rem và scroll nội
  bộ để không làm chữ/cột bị ép quá mức.
- Browser QA desktop 1280px: table width khớp wrapper, `scrollWidth ===
  clientWidth`, không overflow trang. Mobile 390px: scroll nội bộ vẫn hoạt
  động, không overflow trang. Static frontend/Doctor/smoke HTTP và diff check
  đạt.

### Doctor Indications Three Sources (2026-08-20; superseded by unified input 2026-09-01)

- Lát lịch sử này từng có ba nguồn. Sau khi catalog bị loại, selector nguồn
  được rút gọn thành một input: dropdown chọn mẫu từ
  `/api/survey-templates-for-orders`, còn text không chọn mẫu không tạo ID
  survey. Bảng vẫn giữ badge nguồn, edit/clear nạp lại đúng nguồn, và global
  Doctor `Lưu` vẫn là writer duy nhất.
- Giữ nguyên `chi_dinh` schema/API; `order_name` được giới hạn 255 ký tự ở
  HTML và validation JS trước khi đưa vào state/payload.
- Static QA: Node syntax, Doctor contract, frontend contract, smoke health,
  HTTP smoke và `git diff --check` đạt. Browser QA ca thật `Ngô Hiển Đạt /
  HS00267` đã kiểm đủ catalog autocomplete, nhập text, khảo sát autocomplete,
  validation ngày/tên dài, edit/hủy sửa, badge/list và viewport 390px; console
  error/warn rỗng, không bấm Lưu hay ghi dữ liệu thật.

### Doctor Survey Dropdown Polish (2026-08-20)

- Dropdown Khảo sát trên màn Bác sĩ không còn render mô tả dài; vẫn giữ tên
  mẫu, icon và số câu hỏi để chọn nhanh.
- Presentation chuyển về palette nâu–kem của Doctor: nền item nhẹ, viền nhấn
  nâu, hover/active dễ phân biệt và không thay đổi API, dữ liệu hay luồng chọn.
- Shared autocomplete chỉ thêm option `showSurveyDescription`; các màn khác
  không truyền option nên vẫn giữ mô tả hiện có.
- Browser QA desktop/390px kiểm dropdown nhiều mẫu, chọn mẫu và console;
  không có error/warn, không ghi dữ liệu thật.

### Shared Admin Catalogue UI Shell (2026-08-20)

- Chuẩn hóa presentation cho 14 màn quản trị: Tài khoản, Phân quyền, Nhóm
  phân quyền, Từ viết tắt, Danh mục dịch vụ, Dịch vụ, Gói dịch vụ, Danh mục
  chỉ định, Mẫu khảo sát, ICD, Ngày lễ, Hoạt chất, Dị nguyên và Tương tác
  thuốc theo ngôn ngữ giao diện của Danh mục thuốc DAV/Tủ thuốc.
- Shared owner là `app/static/css/shared/admin-management-ui.css`, scope bằng
  `.qlpk-admin-page`; các template giữ nguyên ID, JS hook, endpoint, quyền,
  payload và lifecycle nghiệp vụ. Các màn Bác sĩ, Lễ tân, Tâm lý gia, Lịch
  hẹn, Thanh toán và Thống kê thuốc không nạp shell này.
- Chuẩn hóa page header, surface, toolbar/filter, button, table, badge, action,
  pagination, modal/form và responsive; thêm page header cho Hoạt chất, Dị
  nguyên và Tương tác thuốc. Không đổi logic/API/backend.
- Static QA: frontend contract, smoke health/HTTP, user feedback contract và
  `git diff --check` đạt. Browser QA với `?embed=1` kiểm populated/empty, dense
  table, modal, desktop/mobile; không có overflow ngang ngoài ý muốn. Route
  Danh mục dịch vụ vẫn có lỗi API `Error loading categories: Object` trong
  môi trường QA hiện tại, không phát sinh từ CSS shell và không được sửa trong
  lát UI này.

### Shared Admin Catalogue UI QA Follow-up (2026-08-20)

- Khóa baseline `.qlpk-admin-page` về Roboto, `13px`, line-height token; title
  quản trị giữ `24px` desktop và `20px` mobile, bảng/control/modal dùng cùng
  scale compact.
- Sửa Mẫu khảo sát để chiếm 100% workspace thay vì còn `83.33%`, thêm page
  header chuẩn và cho bảng dài scroll nội bộ; các bảng quản trị dài khác cũng
  giữ min-width đọc được trên mobile, không làm tràn toàn trang.
- Browser QA sau sửa: 14 màn desktop đều có Roboto và baseline `13px`, title
  `24px`; Mẫu khảo sát desktop full width, mobile title `20px`; Tài khoản,
  Danh mục chỉ định, Từ viết tắt và Mẫu khảo sát mobile không tràn ngang toàn
  trang, bảng scroll đúng vùng. Modal Tài khoản, Chỉ định, Khảo sát và Tương
  tác thuốc mở đúng màu teal, font Roboto, body scroll nội bộ.

### Service Catalog Auth Asset Fix (2026-08-20)

- `service-category.html` và `service-management.html` đã nạp
  `/static/js/utils.js` sau jQuery để shared `ajaxSend` gắn JWT cho các request
  jQuery.
- Trước sửa, `GET /service-categories/` và `GET /services/` trả `401` vì thiếu
  `Authorization`; sau sửa browser QA tải được 3 danh mục và 287 dịch vụ, không
  còn console error/warn. Không đổi API/backend/payload.

### Doctor Patient History Modal Actions (2026-08-16)

- Doctor no longer renders the patient-result eye. Selecting a patient row keeps
  the modal scoped to that patient's history; the history-row eye loads that
  row's `appointment_id` into the Doctor workspace through the canonical
  appointment loader and closes the modal only after the load succeeds. Delete
  remains disabled.
- The history eye does not copy or save data. A failed edit request or an
  appointment without `examination_info` leaves the current Doctor form intact
  and shows a short warning.
- No API, payload, database, save, or auto-save path changed.
- Static QA: Doctor contract, Patient History Modal contract, frontend contract,
  HTTP smoke, and Node syntax pass. Browser QA with real data `Ngô Hiển Đạt /
  HS00267` verified row-only selection, exact appointment switching for `990`,
  `1149`, and `1101`, modal-close-after-success, and no console error/warn.

### Doctor Prescription Single Stock Label (2026-08-16)

- Doctor prescription rows now render one `Tồn kho: N đơn vị` line for every
  in-clinic medicine, including rows with persisted batch allocation.
- Removed the old UI distinction between `Tồn kho` and `Tồn khả dụng`, including
  the second allocation label and per-lot remaining display. Batch allocation
  blocks still show lot number and dispensed quantity; backend stock limits,
  FEFO, API payloads, and transaction ownership are unchanged.
- Updated the Doctor prescription guard and workflow contracts so the retired
  presentation branch cannot return.

### Doctor Prescription Current Stock Visibility (2026-08-16)

- Dòng thuốc trong cơ sở hiển thị ngắn `Tồn kho: N đơn vị` ngay dưới tên thuốc;
  thuốc ngoài cơ sở không hiện dòng này. Tồn lấy từ `current_stock_quantity`
  của payload đọc đơn hoặc catalog thuốc sau khi chọn, và được cập nhật lại từ
  `aggregate_stock` sau save response.
- Khi sửa liều làm phân bổ lô thành stale, dòng tồn vẫn giữ nguyên; trạng thái
  `Cần lưu để cập nhật lô` chỉ còn là thông tin phụ. Không thêm cột bảng, không
  đổi payload lưu, transaction FEFO, API/schema hoặc owner kho.
- Static QA: Node syntax, frontend contract, `smoke_health.py --http` và
  renderer probe đạt. Browser QA ca thật `Ngô Hiển Đạt / HS00267` xác nhận
  Diropam/Escitalopram hiển thị tồn ở trạng thái đã lưu và đang sửa liều; console
  error/warn rỗng, không bấm Lưu.

### Doctor Draft Recovery Authoritative-DB Policy (2026-08-15)

- `draft-recovery.js` now classifies a device-local record from its stored
  `baseSnapshot`, current draft snapshot, and the fully loaded DB/API baseline:
  only an unchanged base is recoverable; a draft already equal to DB or based
  on older DB content is deleted silently. The old stale-draft warning/forced
  restore branch is removed.
- Global Doctor save now awaits draft rebasing after both a real write and a
  clean/no-change success. Failed save and page termination still retain the
  best-effort IndexedDB recovery copy. A partial multi-owner save performs one
  three-way rebase on next load so DB wins saved/conflicting values while only
  still-unsaved differences survive. Restore remains dirty and discard reloads
  canonical data. No endpoint, payload, database table, column, or migration changed.
- Added `check_doctor_draft_recovery_policy.js` with thirteen policy cases and
  wired it into the Doctor contract guard. Browser QA without server writes
  passed create/close/reopen, explicit restore, discard back to DB data, and
  clean/no-change save deleting the pending draft; console error/warn remained
  empty.

### Doctor Component Foundation Consolidation (2026-08-13)

- Doctor runtime có một registry graph duy nhất với `resolve/require`, context
  hiện hành (`doctorComponentContext.getCurrent/setCurrent`) và startup
  validation; page orchestrator không còn fallback sang các global state cũ để
  lấy loading hoặc patient id.
- Thêm `doctor-examination/platform-boundaries.js` làm adapter duy nhất cho
  các classic shared asset (icon, confirmation, ICD, order utils, prescription
  print/template). Component Doctor lấy dependency qua registry; các global
  còn lại chỉ giữ ở boundary bridge cần cho app-shell hoặc trang legacy.
- `patient-history-modal.js` là lifecycle owner duy nhất của modal Tìm kiếm
  bệnh nhân. Preview toa trong modal được tạo bằng dependency injection đầy
  đủ (`buildPrescriptionPreviewHTML` + `createBarcodesInElement`), nên không
  phụ thuộc helper global của modal legacy và không mất barcode khi render.
- `doctor-component-base.css` bổ sung contract chung cho scope, focus,
  disabled/loading/error/empty; color token Doctor được nâng lên semantic
  aliases dùng chung cho header, surface, feedback và shadow. Modal preview
  mobile xếp lại header mã đơn/clinic để không ép tên phòng khám thành từng
  ký tự ở viewport hẹp.
- Static guard mở rộng để khóa platform boundary và shared-modal contract;
  không đổi API, payload, DB schema hoặc migration.
- QA sau lát này: Node syntax + Python compile, Doctor contract, Patient History
  Modal contract, frontend contract, HTTP smoke đều pass. Browser dữ liệu thật
  `Ân/HS00073` đã kiểm đủ 5 tab, in Toa thuốc không lỗi, đổi `Ân -> Ngô Hiển
  Đạt -> Ân` không giữ dữ liệu cũ, Bệnh án BS desktop 2 cột 50/50 và mobile
  một cột không overflow, console error/warn rỗng. Native print dialog vẫn là
  capability ngoài in-app Browser và không được tuyên bố pass nếu chưa có
  Chrome/PDF preview độc lập.

### Shared ICD Autocomplete Markup Contract (2026-08-12)

- Gom sáu ICD field đang sống (Doctor Chẩn đoán/Bệnh kèm theo, Tiền sử Bản
  thân/Gia đình và appointment add/edit) về một skeleton Jinja duy nhất tại
  `templates/components/_icd_autocomplete.html`; `icd-autocomplete.js` vẫn là
  interaction owner, adapter workflow chỉ map state/payload/presentation.
- Hai ICD field Khám bỏ implicit `<label>` bao toàn bộ component. Label hiện
  đứng ngoài root và dùng `for` trỏ đúng input, nên khi đã có chip, click label
  hoặc vùng trống không còn kích hoạt nhầm nút xóa `×`. Wrapper trung gian
  `doctor-icd-field__control` và CSS chết tương ứng đã được bỏ.
- Thêm `scripts/check_icd_autocomplete_contract.py` vào frontend contract để
  chặn raw ICD skeleton ngoài macro hoặc macro bị đặt bên trong `<label>`.
- Static QA đạt: ICD markup contract ghi nhận đủ 6 instance dùng macro, Jinja
  render/DOM nesting đạt, frontend contract, Doctor contract và
  `smoke_health.py` đều pass.
- Browser QA dữ liệu thật đạt trên Doctor và Lịch hẹn: với `Ân / HS00073`,
  click label/vùng nhập không xóa chip Chẩn đoán hoặc Bệnh kèm theo, hai field
  cập nhật độc lập và chỉ nút `×` mới xóa; đổi qua `Ngô Hiển Đạt / HS00267`
  rồi quay lại nạp đúng ICD/Tiền sử của từng bệnh nhân. Modal thêm lịch hẹn dùng
  cùng skeleton, label focus đúng input; console không có warning/error. Dữ
  liệu thử đã được khôi phục/bỏ thay đổi và không bấm Lưu; API, payload và DB
  owner không đổi.

### Prescription Modal HTML Header And Title Alignment (2026-08-12)

- HTML preview trong modal lịch sử bỏ offset `40px` trên cụm mã và thu khoảng
  badge-barcode từ `20px` về nhịp gọn; logo/thông tin/cụm mã cùng căn đỉnh.
- Title Toa thuốc hai dòng dùng spacing `20px 0 45px` trên wrapper
  `.prescription-title-section`; Hóa đơn/Bệnh án một dòng dùng cùng spacing trên
  `.prescription-preview__title--document`, không tách `ĐƠN THUỐC` khỏi dòng
  `PRESCRIPTION`. CSS A4 không đổi.
- Static QA đạt: CSS contract, frontend contract và HTTP smoke. Browser ca thật
  `Ân / HS00073` xác nhận tab Toa thuốc và Dịch vụ render đúng alignment/spacing
  ở HTML modal; không phát sinh thao tác ghi dữ liệu.

### Shared Patient History Modal Base (2026-08-12)

- Tạo `components/patient-history-modal.js` làm public lifecycle owner
  `QLPKPatientHistoryModal` cho modal `Tìm kiếm bệnh nhân`: một instance gắn với
  `#patientSearchModal`, idempotent control/trigger/print binding, API
  `getOrCreate`, `open`, `openPatient`, `reset`, `close`, `getState`. Markup và
  CSS vẫn chỉ có một owner tại `partials/patient-search-modal.html` và
  `patient-search-modal.css`; contract là một modal trong mỗi document.
- Doctor và TLG không còn gọi `createWorkflowModalSearchContext()` trực tiếp.
  Doctor dùng default data runtime/print controller qua base và chỉ truyền
  status/current-patient callbacks. TLG dùng cùng base nhưng giữ adapter
  read/copy/delete/print legacy hiện tại bằng `dataRuntime: false`, `print:
  false`; `ClinicalPageCoreUtils` bind control thông qua instance base.
- Thêm `scripts/check_patient_history_modal_contract.py` và gắn vào frontend
  contract để chặn clone `#patientSearchModal`, include partial sai, page gọi
  low-level factory trực tiếp hoặc thiếu asset base. Hướng dẫn tích hợp màn hình
  mới nằm tại `references/ui/patient-history-modal.md`.
- Static/HTTP QA đạt: Node/Python syntax, runtime singleton probe, patient modal
  contract, frontend contract, `smoke_health.py` và `smoke_health.py --http`.
  Doctor contract chỉ còn lỗi nền ngoài lát này: `/static/js/realtime-client.js`
  vẫn là classic script.
- Browser QA dữ liệu thật đạt trên Doctor và TLG: mở/đóng/reopen modal; dense
  list; Doctor `Ân -> Ngô Hiển Đạt -> Ân`; TLG đổi patient/lượt khám; tên dài
  `Lâm Nguyễn Thịnh Hành` wrap trong cột, không đè ngày sinh, không overflow
  ngang. Cả hai page chỉ có một `#patientSearchModal`, tải đúng base asset và
  console không có error/warn mới; không kích hoạt action ghi/xóa/copy.

### Shared Prescription Print Document Component (2026-08-12)

- Tạo `prescriptions/components/prescription-print-document.js` và CSS cùng
  tên làm owner duy nhất cho page model BASIC/H/N, document shell A4, barcode,
  font/image readiness, loading/error window và lifecycle gọi print.
- Nút `In đơn` Doctor, `.tab-print-btn` Toa thuốc trong modal lịch sử Doctor và
  modal prescription legacy chỉ còn adapter dữ liệu. Modal Doctor dùng thẳng
  `paginationOptions` từ history renderer để dựng lại `renderContext=print`,
  không clone HTML `screen`; logic in Dịch vụ/Bệnh án không đổi.
- Cụm phải header A4 chỉ còn một CSS owner: margin đầu cụm bằng `0`, badge mã
  đơn thuốc ở trên, barcode + mã hồ sơ ở dưới; logo/thông tin/cụm mã cùng căn
  đỉnh. Gỡ override header đã chép tạm vào `prescription.css`.
- Static QA đạt: Node syntax, unit page-model, integration contract cho Doctor
  và modal, frontend contract, CSS/static/template/HTTP smoke; static assets và
  hai page Doctor/TLG trả `200`. Doctor contract còn lỗi nền ngoài lát này:
  `/static/js/realtime-client.js` vẫn là classic script.
- Browser ca thật `Ân / HS00073` tải đúng 1 thuốc, đúng mã đơn và nút in;
  console sạch. In-app Browser không expose `window.open`, Chrome kết nối không
  khả dụng và data document bị browser URL policy chặn, nên native print preview
  sau refactor hiện `chưa pass visual/interactive QA`.

### Prescription A4 Natural-Flow Layout Fix (2026-08-12)

- Root cause khoảng trắng lớn trong bản in đơn ngắn là tổ hợp
  `.prescription-preview--rx { min-height: 280mm; display: flex; }` và
  `.rx-signature-table { margin-top: auto; }`: chiều cao dư của A4 bị dồn toàn
  bộ vào giữa lời dặn và QR/chữ ký, không phải padding đầu trang.
- Canonical print CSS chuyển document sang block normal flow, `min-height: 0`,
  spacing QR/chữ ký cố định `0.5rem`; footer H/N dưới 18 tuổi trở về flow và
  chống tách trang. Boundary giữa các mẫu BASIC/H/N dùng `break-before` trên
  sibling page để Chrome không làm mất header khi mẫu trước kéo dài nhiều trang.
- Thêm `scripts/check_prescription_print_contract.py` và nối vào frontend
  contract để khóa A4, natural height, page boundary, signature spacing và
  footer dưới 18 tuổi.
- Static/HTTP QA đạt: prescription print contract, frontend contract, Doctor
  contract, `smoke_health.py --http`, Python compile, Node syntax và canonical
  CSS asset trả đúng rule mới.
- Chrome A4 PDF QA đạt với payload thật `Ân / HS00073` một thuốc, ca dày 10 thuốc
  qua hai trang và mẫu H dưới 18 tuổi: không còn khoảng trắng trước chữ ký,
  không mất header/phần đầu trang, QR/chữ ký/footer không chồng nhau. Nút
  `In đơn` trên Doctor ca thật hiển thị, enable và click không có console error/warn;
  native print dialog của in-app Browser vẫn không expose thành tab, nên phần
  document được xác thực bằng PDF render production thay vì ảnh trực tiếp của
  dialog.

### Doctor Patient History Modal Print Actions (2026-08-12)

- Root cause: Doctor ESM entry vẫn render bốn `.tab-print-btn` trong modal lịch
  sử nhưng không còn load/bind legacy `printModalTabContent`; click vì vậy
  không có action và không báo lỗi.
- Thêm `components/modal-history-print-controller.js` làm action owner duy
  nhất cho Doctor. Controller dùng lại `stateStore` và `historyTabRenderers`
  của modal, mở cửa sổ in đồng bộ ngay trong user click để tránh popup blocker,
  sau đó refresh đúng patient/lượt khám và dựng tài liệu bằng CSS nâu hiện tại.
  Không nạp lại `patient-search-modal-dry.js`, không thêm API, payload, save
  path hoặc database owner; Sinh hiệu tiếp tục không có action in.
- Static QA: Node syntax, `check_frontend_contract.py` và
  `smoke_health.py --http` đạt. `check_doctor_examination_contract.py` chỉ còn
  lỗi nền đã biết ngoài lát này: `/static/js/realtime-client.js` vẫn được kiểm
  là classic script.
- Browser QA dữ liệu thật `Ân / HS00073`: cả Toa thuốc, Dịch vụ, Bệnh án BS và
  Bệnh án TLG đều chạy lại đúng renderer/tài liệu, không có popup-blocked toast
  hoặc console error/warn. Đổi lượt hiện tại -> 02/11/2025 -> hiện tại và đổi
  `Ân -> Ngô Hiển Đạt -> Ân` giữ đúng patient/visit; đóng mở lại modal rồi in
  vẫn hoạt động, không bấm lưu hay tạo request ghi dữ liệu.
- Follow-up bố cục header A4: stylesheet modal từng đẩy toàn bộ
  `.prescription-code-section` xuống `40px`. Component in dùng chung hiện khóa
  lại constraint chỉ trong tài liệu in: logo/thông tin/cụm mã nằm cùng hàng,
  badge mã đơn thuốc ở đầu cụm phải, barcode và mã hồ sơ nằm bên dưới; palette
  nâu và modal trên màn hình không đổi.
- Follow-up QA sau khi đưa badge mã đơn lên đầu cụm: CSS contract, Node syntax,
  frontend contract và HTTP smoke đạt; static CSS và màn Doctor trả `200`.
  Click `In đơn` với dữ liệu thật `Ân / HS00073` hoàn tất, nút được enable lại,
  không có toast lỗi. In-app Browser không expose native print preview để chụp
  bản sau sửa, nên trạng thái hiện tại là `chưa pass visual/interactive QA` cho
  cửa sổ preview hệ thống; cần xác nhận lại bằng Chrome/native preview.

### Doctor Patient History Modal Five-Tab Runtime Cleanup (2026-08-11)

- Doctor dùng runtime dữ liệu riêng modal-history-data-runtime.js, gọi qua
  QLPKDoctorPageRuntime.apiCall với cache: no-store; mỗi lần chọn bệnh nhân
  hoặc lượt khám đều clear panel/cache và chặn response cũ bằng revision/token.
- Sửa cấu trúc HTML của partials/patient-search-modal.html: cả 5 pane
  Toa thuốc, Dịch vụ, Bệnh án BS, Bệnh án TLG, Sinh hiệu nằm đúng trong right
  column/tab content; trước đó hai pane cuối bị rơi ra ngoài, rộng 0px và chỉ
  hiển thị khoảng trắng.
- Chuẩn hóa medicine.usage khi dựng bệnh án: JSON/object/plain text đều được
  đưa về ghi chú đọc được, không in raw JSON; không đổi endpoint, payload hoặc
  dữ liệu lưu.
- Bệnh án BS giữ `KQ khám toàn thân` toàn hàng rồi trình bày `Các cơ quan` và
  `Khám tâm thần` thành hai cột bằng nhau trong modal và tài liệu in; hai tiêu
  đề cùng trục, nội dung tự wrap và chỉ xếp lại một cột dưới `600px`. Bệnh án
  TLG giữ cấu trúc một cột, không đổi dữ liệu/API.
- QA thật với Ân / HS00073: đủ 5 tab, đổi lượt hiện tại ↔ cũ, đồ thị/bảng sinh
  hiệu, bộ lọc 1 tuần/tất cả, và Ân -> Ngô Hiển Đạt -> Ân; desktop 1280x720
  không overflow ngang, console không có error/warn; follow-up bên dưới bổ sung
  kiểm tra responsive mobile cho bố cục Bệnh án BS.
- Follow-up QA bố cục Bệnh án BS: ở `1280x720`, HS00073 render hai cột cùng
  `284.34px`, tiêu đề lệch `0px` và không overflow; Ngô Hiển Đạt giữ cùng kết
  quả với dữ liệu khác. Ở `390x844`, hai nhóm xếp một cột, nội dung không tràn
  khỏi nhóm. Bệnh án TLG không có lưới mới; click In bệnh án BS hoàn tất, nút
  được enable lại và console error/warn rỗng.
- Static QA: Node syntax, check_frontend_contract.py, smoke_health.py --http
  đạt. check_doctor_examination_contract.py còn đúng lỗi nền ngoài lát này:
  /static/js/realtime-client.js vẫn được kiểm là classic script.

### Patient Search Modal Visual Hierarchy (2026-08-10)

- Modal `Tìm kiếm bệnh nhân` giữ nguyên data flow/API và hai vùng hiện tại,
  nhưng đã chuẩn hóa hierarchy: nền kem cho vùng chọn/lịch sử, nền trắng cho
  vùng làm việc, header bảng và tab active dùng nâu đậm với chữ trắng, empty
  state có icon/title/description rõ ràng, badge trạng thái dùng chữ nâu đọc
  được thay vì chữ trắng trên nền nhạt.
- Bỏ overflow ngang ngoài ý muốn của các dòng Bootstrap `.row` trong bảng kết
  quả. Ở viewport hẹp, parent row chuyển sang một cột không wrap ngang; body
  modal là scroll owner để vùng tab phải nằm dưới vùng lịch sử và vẫn truy cập
  được.
- Doctor history status map bổ sung nhãn `Tâm lý gia khám` cho status
  `PSYCHOLOGIST_EXAM`; không đổi status/API/DB.
- QA thật sau thay đổi: desktop `1280x720`, mobile `390x844`, state có dữ liệu,
  state tìm kiếm rỗng, mở/đóng modal, console sạch và không overflow ngang.
- Palette follow-up: modal dùng nền ấm nâu/mận sâu với accent cam san hô,
  vàng và hồng nhạt theo ngôn ngữ màu của khối Y tế; không dùng teal/xanh làm
  màu tương tác chính.
- Follow-up `2026-08-12`: bảng kết quả dùng contract cột `2-4-2-2-2`; chỉ ô
  họ tên được phép wrap và mọi cell có `min-width: 0`. Cách này giữ đủ họ tên
  thay vì cắt ellipsis, đồng thời không cho tên dài tràn sang ngày sinh.
- QA thật với `Lâm Nguyễn Thịnh Hành / HS00176`: desktop `1280x720` có mức
  chồng lấn tên/ngày sinh `0px`; truy vấn dày `Nguyễn` trả 85 dòng và tất cả
  đều `0px`; ở `390x844`, tên xuống dòng trong cột, card kết quả không overflow
  ngang và action `Xem lại` vẫn hiển thị/enable. Console error/warn rỗng.

### Doctor Examination History Search Action (2026-08-10)

- Đổi nhãn nút hoàn tất của Doctor từ `Hoàn thành khám` thành `Hoàn thành`.
- Thêm nút `Lịch sử` trong header `Khám & xử trí`; nút tái sử dụng modal
  `Tìm kiếm bệnh nhân` và tự prefill bệnh nhân đang thao tác, không tạo modal
  hoặc lifecycle lịch sử thứ hai.
- Lịch sử khám dùng API hiện có `/api/patients/{patient_id}/examinations`,
  ẩn thao tác sao chép/xóa trong context chỉ xem của Doctor; không đổi BE,
  DB, endpoint hoặc dữ liệu nghiệp vụ.
- Browser QA dữ liệu thật `Ngô Hiển Đạt / HS00267` và `Ân / HS00073`: mở đúng
  modal, tải đúng lịch sử, chọn dòng được, đổi bệnh nhân không giữ dữ liệu cũ,
  console không có warning/error ở viewport mặc định. In-app Browser không có
  capability đổi viewport nên chưa xác nhận responsive mobile riêng.

### Doctor Global Search History Action Bridge (2026-08-30)

- Doctor `patient-history-bridge.js` đăng ký `window.QLPKGlobalSearchActions` cho
  hai action từ header: `open_appointment` chọn trực tiếp lượt nếu appointment
  đang có trong queue; lượt lịch sử ngoài queue mở singleton modal lịch sử theo
  `patient_id`. Không đổi API, payload, URL action hoặc modal markup.
- `doctor-examination.js` truyền queue getter và `selectPatientCard` vào bridge;
  test Node kiểm đủ nhánh appointment trong queue, appointment lịch sử và
  action không hỗ trợ.
- Browser QA tại `/doctor-examination.html` với danh sách lịch sử có dữ liệu:
  bấm `Xem lịch sử` từ `qlpk-app-header__global-search-actions` mở đúng modal
  ngay trên Doctor, không đổi URL và console error/warning bằng `0`. Queue
  runtime lúc kiểm tra rỗng nên nhánh chọn appointment đang nằm trong queue
  chưa được browser-test với ca thật; đã được kiểm bằng test bridge.
- Static QA: `node --check` hai file Doctor, `node tests/doctor_patient_history_bridge.test.js`,
  `pytest -q tests/test_workflow_contracts.py`, các Doctor/modal/frontend
  contracts và `smoke_health.py` đều đạt.

### Doctor Prescription History Visibility (2026-08-10)

- `Lịch sử thuốc` ở `doctor-clinical-form-card__header` mặc định ẩn và chỉ hiện khi history loader có
  ít nhất một lượt kê chứa thuốc; ca rỗng, ca bị lọc chỉ còn appointment hiện
  tại, hoặc load fail không để lại action vô nghĩa.
- Điều kiện dùng chung `prescriptionHistoryUi.getVisits()`; không thêm API,
  fallback, state owner hoặc nhánh render thứ hai.

### Doctor Prescription History Header Action (2026-08-10)

- Đưa action mở lịch sử vào `doctor-clinical-form-card__header`, đứng cạnh
  action `Đơn thuốc`, đổi nhãn thành `Lịch sử thuốc`.
- Không tạo lifecycle thứ hai: `prescription-ui.js` vẫn giữ state/event owner;
  history presentation cập nhật toggle trên toàn document để action ngoài vùng
  Đơn thuốc vẫn phản ánh đúng `aria-expanded`.
- Không đổi endpoint, modal, API, database hoặc luồng `Áp dụng tất cả`.

### Doctor Medication History Large Modal (2026-08-10)

- Thay panel lịch sử thuốc hẹp bên phải bằng modal lớn cố định theo viewport tại
  `#doctorPrescriptionHistoryPanel`; không đổi nav, endpoint, schema, save path
  hoặc owner lịch sử khám.
- `prescription-history-ui.js` chỉ trình bày các lượt có đơn ở cột trái và chi
  tiết các dòng thuốc của lượt chọn ở cột phải. `prescription-ui.js` giữ state,
  clear, chọn lượt, đóng bằng nút/backdrop/Escape và áp dụng toàn bộ thuốc vào
  draft đơn hiện tại; không auto-save.
- Cách dùng JSONB được parse qua `prescription-model.js`, hiển thị thành câu
  đọc được thay vì in raw JSON. Modal dùng scroll nội bộ cho danh sách/bảng và
  stack danh sách trên viewport hẹp.
- QA thật với `Huỳnh Hoàng Ân / HS00030`: 5 lượt kê thuốc, chọn lượt 19/04/2026,
  bảng 2 thuốc, `Áp dụng tất cả` đưa đúng 2 dòng vào draft và trạng thái chuyển
  `Chưa lưu thay đổi`; không ghi dữ liệu DB. Empty state đã kiểm với Ân/HS00073
  và Ngô Hiển Đạt/HS00267; Escape/backdrop/đóng, đổi patient và console error /
  warning đều đạt.
- Static QA: Node syntax, `check_frontend_contract.py` và
  `smoke_health.py --http` đạt. `check_doctor_examination_contract.py` còn đúng
  một lỗi nền ngoài lát này: Doctor vẫn load `/static/js/realtime-client.js`
  dạng classic script.

### Doctor Prescription Quantity Without Required Days (2026-08-15)

- `prescription-model.js` dùng 1 ngày làm hệ số hiệu lực khi
  `medicine_days` đang trống, nên lịch uống vừa nhập cập nhật ngay số lượng,
  thành tiền dòng, tổng số lượng và tổng tiền; nhập `N` ngày nhân lại theo
  `N`, xóa ngày quay về kết quả 1 ngày.
- `prescription-ui.js` tách rõ lifecycle: load đơn hiện có, restore draft và
  reuse lịch sử có ngày trống giữ nguyên quantity đã lưu; chọn thuốc, sửa
  liều, đổi mode hoặc sửa ngày là tương tác chủ động và chuyển về công thức
  hiện hành. Không đổi payload, API, schema database hoặc logic kho.
- `scripts/check_doctor_prescription_quantity_policy.js` giữ 8 ca công thức;
  Doctor contract giữ guard đúng 4 điểm kích hoạt và guard bảo toàn dữ liệu
  legacy.
- Browser QA thật tại `doctor-examination.html`, viewport `1280×720`, ca
  `Ngô Hiển Đạt / HS00267`: lần tải đầu giữ đúng đơn legacy ngày trống
  `10 viên / 100.000 ₫`; sau tương tác, hai thuốc có liều ngày `1 + 5` cho
  `6 viên / 40.000 ₫`, nhập 7 ngày cho `42 viên / 280.000 ₫`, xóa ngày quay
  lại `6 viên / 40.000 ₫`; đổi qua/về hai mode cũng tính ngay. Console không
  có error/warning, document và prescription workspace không tràn ngang. Đã
  bỏ thay đổi QA, mở lại ca và xác nhận dữ liệu DB vẫn là đơn gốc.

### Doctor Prescription Whole Dispensing Quantity (2026-08-10)

- `prescription-model.js` dùng một helper làm tròn lên số lượng cấp thuốc sau
  khi tính tổng: `7,5 -> 8`, còn liều trong lịch vẫn giữ `1/2`, `1/3`.
- `prescription-ui.js` dùng số nguyên cho số lượng dòng, tổng số lượng, thành
  tiền và payload gửi lưu.
- Backend chuẩn hóa lại payload trước validate tồn kho, tính tổng đơn, trừ/hoàn
  tồn và tạo `prescription_items`; dữ liệu cũ không chạy migration tự động.
- QA unit đã kiểm `7,5 -> 8`, `7 -> 7`, liều `1/2` không bị làm tròn. Browser
  ca thật `Ân / HS00073` hiển thị `8 gói`, `56.000 ₫`, không lỗi console và
  không overflow ngang ở viewport `1280x720`; không ghi dữ liệu QA vào DB.

### Doctor Prescription Usage Note Generator (2026-08-10)

- `prescription-model.js` là owner duy nhất của cú pháp ghi chú tự sinh: theo
  buổi (`Uống 1/2 viên buổi sáng, ...`) hoặc theo lần/ngày (`Uống 1/2
  viên/lần, 2 lần/ngày, ...`). Formatter phân số dùng chung xử lý cả `1/2`
  và số thập phân nhập bằng dấu phẩy.
- `prescription-ui.js` tự đồng bộ ghi chú khi đổi liều, lịch uống, đường dùng,
  đơn vị, số ngày hoặc mode. Ghi chú bác sĩ sửa tay chuyển sang `manual` và
  không bị generator ghi đè; ghi chú legacy có text cũng được bảo toàn.
- `note_mode` chỉ nằm trong JSON `usage`; không đổi endpoint, schema, database,
  tồn kho hoặc payload quantity hiện tại. Các lời gọi đồng bộ ghi chú dư sau
  `syncPrescriptionRowQuantities()` đã được loại bỏ để giữ một lifecycle.
- QA: Node syntax, unit generator bằng formatter thật, frontend contract, HTTP
  smoke và browser ca thật `Ân / HS00073` đã kiểm các mode, số lượng và ghi chú
  manual. Không bấm lưu dữ liệu QA vào database.

### Doctor Prescription Derived Quantity (2026-08-10)

- `prescription-model.js` now owns the pure quantity formula: time-slot doses
  summed across Sáng/Trưa/Chiều/Tối, or `Liều mỗi lần × Lần/ngày`, then
  multiplied by `medicine_days`.
- `prescription-ui.js` recalculates row quantity, line totals, prescription
  total quantity, and grand total after load/restore/reuse, dose edits, mode
  changes, and treatment-day edits. `prescription-row-renderer.js` keeps the
  quantity field visible but readonly/calculated.
- The existing `quantity` payload, prescription item column, stock ledger, API,
  and database schema remain unchanged; new quantity values are whole dispensing
  units after ceiling normalization. Initial legacy load/restore/reuse with
  missing treatment days preserves persisted quantity; active edits use one day.
- Real browser QA with `Ân / HS00073`: `1 + 2 × 5 = 15 viên`, changing days to
  `10` produced `30 viên` and `210.000 ₫`; `Theo lần/ngày` with `0.5 × 2 × 10`
  produced `10 viên`. Patient switch `Ngô Hiển Đạt -> Ân` showed separate
  quantities without saving data.
- Static `node --check`, model calculation checks, frontend contract, and HTTP
  smoke passed. The broader Doctor contract still fails on the pre-existing
  classic `/static/js/realtime-client.js` asset check; it is outside this
  slice.

### Shared ICD Autocomplete Idempotent Selection (2026-08-09)

- Dropdown option clicks now use the shared `select(item)` contract: selecting
  an already selected ICD is idempotent and no longer removes its tag.
- Explicit tag `×` removal and programmatic `toggle(item)` behavior remain
  unchanged for workflows that intentionally need add/remove toggling.
- Doctor diagnosis and comorbidity fields use the shared component without
  field-local handlers; no API, payload, database, mapping, or patient-switch
  contract changed.
- Browser QA with real `Nguyễn Thị Ảnh / HS00135` and `Ngô Hiển Đạt /
  HS00267`: repeated focus/click and selecting `F06` again kept the diagnosis;
  temporary `F51` in Bệnh kèm theo stayed after selecting it again and was
  removed only through the tag action. Patient switch cleared/restored ICD
  state, no data was saved, and console error/warning count was zero.

### Doctor Realtime Waiting Queue Completion (2026-08-09)

- Root cause: Socket.IO handlers were registered before `socketio.init_app(app)`;
  the initialized server therefore had no active `connect`, subscribe, or
  disconnect handlers. `app/realtime/socket.py` now registers them on the
  initialized server with `on_event`.
- Doctor receives the real `appointment.changed` event through the shared
  `realtime-client.js` and `realtime-page-hooks.js`; the page listener in
  `doctor-examination.js` reloads the waiting queue without reloading the
  active clinical form.
- Real QA with `hienngvo / 123`: socket handshake, `qlpk:connected`, room
  `page:doctor-examination`, authenticated `PUT /api/appointments/1150`,
  server event delivery, and browser queue reload all passed. The PUT reused
  the existing note and only refreshed the appointment update timestamp.
- Static QA passed Python/Node syntax, frontend contract, and HTTP smoke. A
  headless Chrome session had a connected socket, received the target event,
  reloaded the appointment queue, and reported no console/runtime errors.

### Doctor Chỉ định FE-BE Completion Slice (2026-08-09)

- Thay shell UI-only bằng owner `app/static/js/components/doctor-indications-form.js`:
  load danh mục `order_items`, người thực hiện, rows hiện tại theo appointment,
  thêm/sửa/xóa local row, trạng thái, dirty revision, save và draft snapshot.
- Nối `indicationsForm` vào `supportModulesUi`; Doctor global `Lưu` là writer
  duy nhất cùng Đơn thuốc/Dịch vụ. Page orchestrator không còn bind/clear một
  owner Chỉ định thứ hai; patient switch dùng context token để chặn stale data.
- Thêm patient-scoped history `GET /api/chi-dinh/patient/<patient_id>` với
  `patient_access_error`, hỗ trợ loại current appointment; không suy diễn patient
  từ tên hiển thị. Không đổi schema/migration hay các endpoint upsert hiện có.
- Cập nhật draft recovery để dirty/restore/reveal target của rows Chỉ định và
  loại Chỉ định khỏi clinical form draft/dirty collector, tránh snapshot/save
  duplicate với support owner.
- QA tĩnh: Node/Python syntax, frontend contract, schema, Alembic strict, API
  auth contract và `smoke_health.py --http` đạt. Browser session IAB hiện không
  thực thi Doctor `type="module"`, Chrome backend không khả dụng; do đó
  visual/interactive QA dữ liệu thật và responsive vẫn `chưa pass`.

### Doctor Chỉ định Access Boundary + Load Result Cleanup (2026-08-09)

- `GET/POST /api/chi-dinh/appointment/<id>` hiện kiểm tra
  `appointment_access_error` trước khi đọc/ghi; không đổi URL, payload hoặc
  schema. Patient history tiếp tục dùng `patient_access_error`.
- `supportModulesUi.load()` trả kết quả thất bại khi một support owner load
  trả `false` hoặc reject, thay vì luôn báo thành công sau `Promise.allSettled`.
- Static và HTTP QA tiếp tục đạt; authenticated no-op POST trên ca thật không
  có rows trả `200` và không tạo chỉ định. IAB vẫn không chạy Doctor module,
  nên visual/interactive QA populated/responsive/A -> B -> A vẫn `chưa pass`.

### Doctor ESM Entry + Medical History Module Scope (2026-08-09)

- Doctor template chỉ còn một entry `app/static/js/doctor-examination-entry.js`
  dạng `type="module"`; entry import toàn bộ asset nội bộ theo dependency order
  cũ, không còn chuỗi script Doctor-private classic rải trong template.
- `medical-history-context.js` là owner action/context dùng chung cho feature
  Tiền sử. Core, workbench, allergy, risk, suggestions và safety plan đã chạy
  module scope thật; timer Risk được giữ trong Risk và giao tiếp qua action,
  không còn đọc biến global của Allergy.
- Giữ đúng các boundary `window` đã có chủ ý cho app-shell/shared widgets;
  đây không phải code giả hay fallback. Contract checker hiện bắt buộc một
  ESM entry và cấm asset Doctor-local quay lại classic script.
- Không thay đổi BE, DB, migration, Orders, endpoint, payload hoặc data owner.
- QA: Node syntax toàn bộ Doctor modules, Doctor/frontend/medical-history
  contracts, HTTP smoke, headless Chrome console và browser flow thật
  `HS00267 -> HS00289 -> HS00267` đạt; không phát sinh request ghi dữ liệu.

### Doctor Registry Boundary Completion (2026-08-09)

- Page orchestrator `app/static/js/doctor-examination.js` đã chuyển toàn bộ
  lookup module nội bộ sang `QLPKDoctorModuleRegistry`: workspace, history
  bridge, support facade, draft recovery, attachments, indications, config,
  support runtime và leave guard.
- `clinical-workspace-ui.js` lấy `workspaceSaveController` từ registry;
  `clinical-examination-form.js` lấy `supportRuntime` từ registry. Không còn
  internal global alias cho component/config/state owner; registry checker đã
  khóa mỗi module đúng một registration và đúng owner file.
- Giữ đúng các boundary cross-file có chủ ý: `QLPKDoctorPageRuntime`,
  `QLPKCurrentAppointment`, `QLPKPatientIntakeForm`,
  `QLPKDoctorWorkspaceLeaveGuard` (app-shell còn gọi trực tiếp), cùng các
  shared component globals. Không đổi API, payload, DB, Orders hay UI nghiệp vụ.
- QA tĩnh: Node syntax, Doctor registry contract, frontend contract và HTTP
  smoke đạt. Browser local QA bị Browser Use URL policy chặn `127.0.0.1`, nên
  trạng thái visual/interactive QA của lát boundary này là **chưa pass**.

### Attachment Confirmation + Doctor Module Boundary Slice (2026-08-09)

- Đã thêm `app/static/js/shared/confirmation-dialog.js` làm owner custom
  confirmation chung. Xóa tài liệu đã lưu và xóa tài liệu nháp ở Doctor/Lễ tân
  đều đi qua dialog SweetAlert có class `qlpk-confirm-dialog`; không còn gọi
  `window.confirm` và không còn nhánh tự cho phép xóa khi thiếu confirmer.
- Component `document-section-ui-utils.js` cũng fail-closed khi thiếu dialog;
  Psychologist tiếp tục truyền dialog hiện hữu của workflow, còn attachment
  legacy dùng owner chung.
- Các helper đơn thuốc thuần đã đăng ký qua
  `app/static/js/doctor-examination/module-registry.js`: `prescriptionModel`,
  `prescriptionRows`, `prescriptionHistory`. Alias `QLPKDoctor*` dư thừa đã bị
  loại bỏ; `supportRuntime` và `prescriptionForm` cũng đã chuyển vào registry,
  page/component chỉ giữ lookup qua registry.
- QA tĩnh và HTTP smoke đạt. Browser QA Doctor thật với
  `Ngô Hiển Đạt / HS00267`: dialog xóa file hiện đúng, không có JS dialog native,
  bấm `Hủy` giữ nguyên file và không tạo lỗi/DELETE; ca thật có đơn thuốc vẫn
  load được và A -> B -> A không giữ thuốc cũ. Chưa thực thi nút xác nhận xóa
  trên file seeded thật để tránh xóa dữ liệu người dùng trong môi trường QA.

### Doctor Examination Lifecycle Cleanup + QA (2026-08-09)

- `clinical-workspace-ui.js` now resets every scrollable owner under the Doctor
  workspace during `clear()`, so switching patients starts at the top of the
  active clinical surface instead of inheriting the previous patient's scroll
  position. No HTML, API, payload, database owner, or save behavior changed.
- Browser QA with real `Ngô Hiển Đạt / HS00267` and `Trần Ngọc Bảo Trân /
  HS00289`: scrolling to the real prescription area, switching A -> B reset
  the clinical scroll owner to `0`, cleared the previous medicine, and showed
  the new patient context; desktop `1280x720` had no page horizontal overflow
  and no console errors.
- Static QA after the cleanup passed `node --check`,
  `check_frontend_contract.py`, `smoke_health.py --http`,
  `check_schema_contract.py`, and strict Alembic contract. The available
  in-app browser cannot change viewport size, so populated mobile visual QA is
  still recorded as **chưa pass visual/interactive QA** rather than inferred
  from CSS.

### Doctor ICD Field UI Cleanup (2026-08-09)

- Đã bỏ hai button không tạo thêm hành vi nghiệp vụ `Thêm ICD` và `Thêm bệnh
  kèm`; autocomplete vẫn mở trực tiếp khi focus/nhập tại field.
- Xóa CSS và click handler chỉ phục vụ hai button, tránh để dead code sau khi
  UI đã chuyển sang interaction trực tiếp của shared ICD component.
- Chỉ giữ một border owner là `.icd-input-container`; input ICD loại khỏi rule
  `.form-control` chung để không còn hai đường viền chồng nhau.
- Browser QA với ICD thật `F39` và tìm/chọn `F51` đạt; không ghi thay đổi test
  vào DB. `check_frontend_contract.py` và `smoke_health.py --http` đạt.

### Doctor Examination FE-BE Integration QA (2026-08-09)

- Hoàn tất nối lại contract endpoint của Khám chi tiết và Dịch vụ sau khi
  component hoá: endpoint functions nhận object args đúng với engine gọi, nên
  không còn sinh URL `[object Object]`.
- Browser QA Doctor thật: ca `Ngô Hiển Đạt / HS00267` load `/edit`, chi tiết
  khám, ICD, đơn thuốc, lịch sử đơn thuốc và dịch vụ đều trả `200`; ca
  `Trần Ngọc Bảo Trân / HS00289` cũng trả `200`. Đổi A -> B -> A không giữ
  chẩn đoán/đơn thuốc hoặc alert 404 của bệnh nhân trước.
- Tương tác ICD thật: tìm `F51`, dropdown nằm ngay dưới field, chọn item cập
  nhật tag và hidden IDs; trạng thái test được bỏ trước khi kết thúc, không
  ghi dữ liệu lâm sàng vào DB.
- QA tĩnh: `node --check`, `check_frontend_contract.py`,
  `smoke_health.py --http`, `check_schema_contract.py` và
  `check_api_auth_contract.py` đạt.

### Config-Only Component Completion (2026-08-09)

- Hoàn tất owner công khai dùng chung cho các tab: registry keys
  `clinicalWorkspace`, `supportModulesUi`, `clinicalExaminationForm`,
  `servicesForm`, `indicationsForm` và shared `QLPKPatientIntakeForm` đều nhận
  `create({ config })`;
  Doctor chỉ lắp composition bằng `doctor-component-config.js`.
- Loại bỏ bốn alias runtime `QLPKDoctorClinicalWorkspace`,
  `QLPKDoctorSupportModulesUi`, `QLPKDoctorServicesForm` và
  `QLPKDoctorIndicationsForm`. Không còn caller runtime hoặc fallback old/new
  cho các owner này; selector, API, payload, DB và patient-switch lifecycle
  không đổi.
- Tài liệu owner đã được đồng bộ tại `doctor-examination-context.md`,
  `doctor-examination-data-inventory.md` và
  `doctor-examination-navigation.md`.
- QA cuối: static syntax, frontend contract, HTTP smoke, runtime alias scan và
  browser Doctor thật A -> B -> A ở desktop/mobile đạt.

### Config-Only Component Contract Slice (2026-08-09)

- Thêm `app/static/js/components/component-dom-scope.js` để component truy cập
  DOM theo root và map field, không đọc lan toàn document.
- `patient-info-form.js` và `patient-visit-info-form.js` có factory/config;
  `patient-intake-form.js` tạo child instances theo config thay vì dùng chung
  state DOM của page.
- `clinical-examination-form.js` nhận `mainFields`/`detailFields`; detail
  persistence nhận field map và endpoint map. `doctor-services-form.js` nhận
  DOM/endpoint config; Chỉ định có core trung tính và Doctor alias tương thích.
- Doctor mount config tập trung ở `components/doctor-component-config.js`;
  Doctor vẫn giữ API, payload, DB owner, UI và patient-switch lifecycle hiện
  tại. Đây là nền để màn Tâm lý gia dùng lại bằng config, nhưng chưa có nghĩa
  màn Tâm lý gia đã được migrate.
- QA sơ bộ: `node --check`, `check_frontend_contract.py`,
  `smoke_health.py --http` và contract test hai instance intake độc lập đạt;
  browser visual/interactive QA vẫn còn ở bước cuối.

### Shared Patient Intake Composition Slice (2026-08-09)

- Chuẩn hóa Hành chính thành một composition owner duy nhất:
  `app/static/js/components/patient-intake-form.js` điều phối `bind`, `clear`,
  `populate`, `collect` và `updatePregnancyControls` cho cả Doctor và Lễ tân.
- Doctor `clinical-workspace-ui.js`, Lễ tân `receptionist-new.js`,
  `form-data-utils.js` và `form-reset-utils.js` không còn gọi trực tiếp hai
  component field-level `patient-info-form`/`patient-visit-info-form`.
- Hai component field-level vẫn giữ trách nhiệm nội bộ về mapping DOM; không
  đổi selector, payload, endpoint, DB, data owner hoặc giao diện. Khác biệt
  giữa màn hình tiếp tục đi qua `patient_intake_config` trong Jinja partials.
- Thêm asset composition vào đúng thứ tự sau hai component nền ở cả hai màn.
  Scan runtime chỉ còn tham chiếu trực tiếp tới component con bên trong
  `patient-intake-form.js`.
- QA tĩnh đạt: `node --check` các file chạm,
  `check_frontend_contract.py`, `smoke_health.py --http`, static/template
  reference checks. In-app Browser render được HTML nhưng không thực thi page
  JavaScript trong session hiện tại, nên browser visual/interactive QA thật
  cho lifecycle Hành chính vẫn là **chưa pass**.

### Doctor Tab Base Contract Slice (2026-08-09)

- Chuẩn hóa contract kỹ thuật cho các base component còn lại: Tiền sử,
  Khám, Dịch vụ và Chỉ định đều có config tùy chọn, `bind`/`clear`/`collect`,
  `getConfig` và lifecycle domain riêng; không ép các tab dùng chung một state.
- Khám có `populate` alias cho hydrate local state; Dịch vụ có `populate`
  alias cho load theo appointment; Chỉ định có `populate` cho render UI-only.
  Các alias không đổi endpoint, payload hoặc hành vi hiện tại.
- Chỉ định chuyển về một singleton owner được tạo ngay trong component; page
  không còn tự dựng hoặc quản lý `.instance`. Tiền sử vẫn đi qua Doctor bridge,
  còn Dịch vụ vẫn đi qua support facade đúng ranh giới save của đơn thuốc và
  dịch vụ.
- Không phát hiện duplicate state/save/load owner hay fallback runtime mới.
  Các field-level component vẫn chỉ được gọi từ composition/owner component.

### Medical History Base Component Slice (2026-08-08)

- Added the shared `app/static/js/components/medical-history-form.js` as the
  sole Tiền sử UI/lifecycle owner. It owns the scoped root, action registry,
  event cleanup, context token, clear/populate/collect/save contract, dirty
  revision, draft restore, and destroy lifecycle.
- The existing ICD, workbench, allergy, risk, suggestions, bindings, and safety
  plan files are feature modules registered into that component; they no longer
  create the old `QLPKDoctorMedicalHistory` namespace or query the whole
  document for patient-specific fields.
- `medical-history-bridge.js` is now a Doctor adapter only. It normalizes the
  backend `medical_history` envelope and exposes the shared component through
  `QLPKDoctorMedicalHistoryBridge`; the JSONB `tag + text` payload and all API
  writers remain unchanged.
- Static syntax, frontend contract, medical-history data contract, and HTTP
  smoke checks pass. Browser visual/interactive QA is still pending in the
  current in-app browser because its local page surface exposes no JavaScript
  runtime (`fetch`/page scripts are not executed).

### Doctor Safety-Plan Patient Context + Upload QA Slice (2026-08-08)

- Root cause của lỗi `Vui lòng chọn bệnh nhân trước khi upload` là
  `safety-plan.js` đọc `#patientId`, trong khi Doctor không render hidden field
  này; ID canonical nằm ở page owner `doctor-examination.js`.
- `window.QLPKCurrentAppointment.getPatientId()` hiện là bridge duy nhất để
  safety plan lấy patient ID hiện tại. Upload, mở file, dựng link và stale
  response guard đều dùng cùng nguồn; fallback raw file path đã bị loại bỏ.
- Browser QA thật với `Trần Ngọc Bảo Trân / HS00289`: upload file mẫu đi đúng
  `/api/patients/309/safety-plan/upload`, UI dựng link
  `/api/patients/309/safety-plan/file`, không còn toast chọn bệnh nhân; đổi sang
  `HS00267` đổi link sang patient ID `287`, không giữ context cũ.
- Đã kiểm tra repair khi file test bị đưa ra khỏi storage: UI về trạng thái
  không có file và `patients.id=309` có `uploaded_file = null`. File mẫu được
  giữ tạm tại `/tmp/qlpk-qa-safety-plan-patient-309.pdf`, không để lại trong
  storage ứng dụng.
- `node --check`, `check_frontend_contract.py`, `smoke_health.py --http` đạt;
  console browser không có error/warning. Preview blob bị browser policy chặn,
  nên không coi bước mở preview là browser-pass.

### Doctor Draft Restore Navigation Slice (2026-08-08)

- `Khôi phục` giờ khôi phục dữ liệu vào đúng owner, tự mở root tab chứa thay
  đổi, kích hoạt đúng nhóm con của Tiền sử khi cần, cuộn trong scroll owner của
  section và focus field đầu tiên bị thay đổi.
- Tất cả field/row/panel đã khôi phục vẫn giữ marker chưa lưu; field đầu tiên
  có marker focus rõ hơn. Nhiều tab không bị mất marker khi tab đầu tiên được
  mở.
- Đã sửa thứ tự clear marker: clear trước khi gọi các module restore, tránh xóa
  marker do Tiền sử/đơn thuốc/dịch vụ vừa gắn.
- Browser QA dữ liệu thật `Ngô Hiển Đạt / HS00267`: Hành chính -> `mainReason`,
  Tiền sử -> `physHistorySearch`, Đơn thuốc ->
  `doctorPrescriptionUsageInstructions`, và draft nhiều tab; không lưu dữ liệu
  test vào PostgreSQL.

### Shared ICD Autocomplete + Appointment QA Slice (2026-08-08)

- Lễ tân add/edit và Doctor tiền sử dùng chung
  `app/static/js/components/icd-autocomplete.js` cùng
  `app/static/css/components/icd-autocomplete.css`; adapter chỉ map state và
  payload của từng workflow.
- Root cause của lỗi Lễ tân trả rỗng sau khi nhập ICD là
  `appointment-management.html` thiếu dependency
  `components/icd-data-loader.js`; component đã khởi tạo nhưng không có loader
  để gọi danh mục thật. Đã thêm script theo đúng thứ tự trước component.
- Browser QA với dữ liệu thật `F51` ở modal thêm và sửa đã pass: 9 kết quả,
  chọn/xóa tag, click ngoài, keyboard `ArrowDown -> Enter`, dropdown nằm dưới
  đúng root input với gap 4px, không lưu dữ liệu test và không có page overflow
  ở desktop. Mobile Appointment chưa đo được vì browser session hiện tại không
  có capability đổi viewport; không ghi nhận là đã pass mobile visual QA.
- Static `node --check`, `check_frontend_contract.py` và
  `smoke_health.py --http` đã pass. Không còn runtime class/namespace ICD cũ.

### Doctor Medical History Boundary + Access QA Update (2026-08-08)

- Browser QA used a fresh Doctor tab with real waiting-list data and the real
  session: `HS00267 -> HS00289 -> HS00267`. The populated A state showed four
  Bản thân items; B showed the empty history state; returning to A restored
  the same four items without B data. A temporary allergy row was added,
  edited, summarized, and removed without saving clinical data. An unsaved
  Bản thân note triggered the real leave guard; `Bỏ thay đổi` restored `abc`,
  and the database remained unchanged.
- Browser checks passed at the default `1280x720` viewport and explicit
  `390x844`: no page horizontal overflow, history content stayed inside its
  scroll owner, no visible dialog remained after cleanup, and console
  error/warning count was `0`.
- The real global `Lưu` path was tested immediately after editing the
  `Bản thân` note: the temporary value reached PostgreSQL without waiting for
  debounce, then was restored to the original canonical value `abc`; the
  save button did not become dirty again after completion.
- HTTP permission matrix passed for restricted Doctor `uyenle` and full-scope
  Doctor `hienngvo`: owned appointment/patient/examination/history/family/
  attachment routes returned `200`, out-of-scope routes returned `403`, and
  `can_view_all_patients=true` returned `200` for the same out-of-scope data.
  Global search also hid the out-of-scope patient's history for the restricted
  Doctor and returned it for the full-scope Doctor. The full-scope grant is
  intentionally preserved.
- `scripts/check_medical_history_contract.py` passed against PostgreSQL:
  allergies wrong type `0`, invalid shape `0`, physical-history wrong type
  `0`, substance-history wrong type `0`, F10-F19 physical-history overlap `0`.
  Schema parity passed with `extra_columns=0`, `missing_columns=0`; Alembic
  is at `20260808_clean_allergy_ph` with no unapplied heads or branches.
- Static baseline passed: all Doctor medical-history JS syntax checks,
  `check_frontend_contract.py`, `check_schema_contract.py`, strict Alembic
  contract, and `smoke_health.py --http`. The exact legacy namespace regex
  has no match in the nine Doctor history runtime files.
- `HS00294` has persisted canonical allergy data (`đậu phộng`, `nghi_ngo`),
  but its only appointments are `CONFIRMED` (`1119`) and `NO_SHOW` (`1120`),
  so its populated-allergy Doctor visual state was not opened. Directly
  loading appointment `1119` and selecting the global-search patient result
  did not hydrate a selected Doctor appointment in the current UI flow. That
  specific state remains `chưa pass visual/interactive QA`; no status or
  fixture was changed to hide the gap.

### Doctor Cleanup + Responsive QA Slice (2026-08-05)

- Removed the unused `has_valid_prescription_medicines` helper, its package
  export, and the unused internal-API result; prescription save behavior and
  payload contracts are unchanged.
- Fixed the shared patient address grid so its three fields can shrink inside
  the label/value layout instead of overflowing and being clipped by the card.
- Final QA passed static contracts, schema parity, HTTP smoke, real Doctor
  desktop/mobile layout, prescription 5-medicine + history state, and patient
  switch `Nguyễn Thị Ảnh -> Ngô Hiển Đạt -> Nguyễn Thị Ảnh`; no console
  warning/error or page horizontal overflow was observed.

### Doctor Legacy Contract Cleanup Slice (2026-08-05)

- Removed the unused `examinations.symptoms`, `examinations.prescription`, and
  `examinations.notes` columns; `examinations.main_symptoms` is now the only
  owner for `Triệu chứng chính`.
- Removed the unused `patients.main_symptoms` duplicate and the unowned
  `examination_diagnosis` table. Legacy values were archived in
  `legacy_database_archive` before schema changes: 186 non-empty examination
  symptom values, 51 patient-level symptom values, and 20 diagnosis rows.
- Removed Doctor-only `general_manifestations` and `notes` detail aliases from
  `bac_si_kham_kham_tam_than`; `Biểu hiện chung` is read/written only from
  `bac_si_kham_kham_tong_quat.bieu_hien_chung`.
- Removed section alias lookup from Doctor detail persistence and prescription
  print mapping. Runtime no longer reads `form_kham`, `examination_form`,
  `general_exam`, `general_examination`, `mental_exam`, `histories`, or
  `vital_signs` as fallback sections.
- Alembic is at `20260805_drop_doc_detail`; schema, migration graph, frontend,
  Python/JavaScript syntax, HTTP smoke, real Doctor A -> B -> A, history-panel,
  and console QA passed without saving clinical data.

### Doctor Symptom Field Mapping Slice (2026-08-04)

- Doctor/shared visit rendering reads `examinations.main_symptoms` only for
  `Triệu chứng chính`; the retired duplicate has been removed from the schema.
- `Biểu hiện chung` remains owned by
  `examination_details.bac_si_kham_kham_tong_quat.bieu_hien_chung`, rendered by
  `examGeneralPresentation`; it is not mapped from `main_symptoms`,
  `bieu_hien_ban_dau`, or `general_examination`.
- Static, HTTP, data-contract, and browser stale-data QA passed without saving.
  A populated `bieu_hien_chung` browser state was unavailable in the waiting
  queue because real appointment `92` is `WAITING_PAYMENT`; its canonical API
  payload was verified directly as `ăn mặc gọn`.

### Doctor Reason Ownership Slice (2026-08-04)

- Restored the Doctor Hành chính field `#mainReason` for the intake reason
  stored in `examinations.main_reason`.
- Renamed the Doctor Khám control to `#doctorClinicalReason` and mapped it to
  `bac_si_kham_form_kham.main_reason` through the existing detail-section
  persistence owner. It no longer travels through `PUT /api/appointments`.
- Kept `tam_ly_gia_kham_form_kham.main_reason` independent; no schema, API, or
  psychologist UI change was needed.
- Browser QA with real `HS00267` confirmed the two displayed values differ as
  stored, field editing does not cross-write, and switching to `HS00289` clears
  the previous patient's values. Desktop and `390x844` had no page overflow and
  no console error/warning.

### Doctor Patient Context Header Contrast Slice (2026-08-04)

- Header text no longer uses the muted alpha token: patient name, latest visit,
  diagnosis, and prescription summary render with the full light header text.
- `HS00267` uses a solid white badge with brown text at the same `14px` token as
  the patient name. No DOM, data, API, or prescription lifecycle changed.
- Browser QA passed at desktop and `390x844`: real Ngô Hiển Đạt data remained
  readable, the badge did not clip, page overflow stayed `0`, and console had
  no warning/error. Measured text contrast is `13.10:1`.

### Doctor Patient Context Header Slice (2026-08-04)

- Implemented the approved two-row header in
  `partials/doctor-clinical-workspace.html`: row one is patient name, hồ sơ
  code, and latest previous visit; row two is previous diagnosis and
  prescription summary. `Lưu` and `Hoàn thành khám` remain the existing real
  actions. Avatar, gender, age, service, status, and duplicate current-order
  metadata were removed from this header.
- `clinical-workspace-ui.js` owns header render/clear only. It reads the
  read-only snapshot exposed by `prescription-ui.js`; the prescription module
  remains the sole history/API/state owner. History uses the existing patient
  prescription-history endpoint, filters out the current/future visit, and
  summarizes real medicines without a fixture or second API.
- Browser QA with real data passed at desktop and `390x844`: Ngô Hiển Đạt
  (`HS00267`) showed the real previous visit `22/05/2026`, diagnosis `F39`, and
  no previous prescription; Nguyễn Thị Ảnh (`HS00135`) showed `28/03/2026`,
  diagnosis `F06`, and `Aripiprazole 5mg (Poziats) +5`; Trần Ngọc Bảo Trân
  (`HS00289`) showed the empty state and no stale previous data. Switching
  patients cleared the header before the next history settled, and the page
  had no horizontal overflow or console warning/error.
- Static QA passed: `check_frontend_contract.py`, both touched JS syntax checks,
  and `smoke_health.py --http`. No prescription or clinical data was saved.

### Doctor Indications UI Slice (2026-08-04)

- Added the fifth Doctor root section, `Chỉ định`, targeting
  `#doctorIndicationsPanel` through the existing `activateWorkspaceSection()`
  owner. Queue, patient header, shell, existing nav behavior, prescription,
  services, and backend/API owners were not changed.
- Added a dedicated UI-only partial and scoped stylesheet with the approved
  two-region layout: indication-entry controls on the left and an empty
  current-visit table on the right. Controls stay disabled and no indication
  fixture, catalog, history, load, save, or row lifecycle was introduced.
- Browser QA on real appointments `1101` and `1051` passed at the default
  desktop viewport and `390x844`: active/hidden/ARIA state, no console
  error/warn, no page horizontal overflow, internal table scrolling, vertical
  responsive stacking, and patient switch reset. Data/interactive QA remains
  pending until the backend/data owner exists.

### Doctor Prescription Usage Note Row Slice (2026-08-04)

- Moved the existing per-medicine `usageNote` input out of the medicine cell
  and into a second real table row beneath the dose/route/quantity/total row.
  The note row spans only the schedule plus route, quantity, and total columns;
  STT, medicine, and remove action remain row-spanned table cells.
- No API, payload, DOM id, state, save/load, history, print, nav, or
  patient-switch owner changed. The input keeps
  `data-prescription-field="usageNote"` and the same row UID contract.
- The note presentation is flat inside the existing table with no nested card
  or extra visual frame; desktop keeps the table layout and narrow viewports
  keep horizontal scrolling inside the table wrapper.

This is the compact handoff for active work. It records current runtime and
open decisions, not a chronological log of retired helper files.

### Doctor Clinical/Services/Indications Component Slice (2026-08-09)

- Tách state và lifecycle vùng Khám hiện tại khỏi
  `doctor-examination/clinical-workspace-ui.js` sang
  `components/clinical-examination-form.js`; component này sở hữu các field
  Khám, mapping `examination_details`, collect/clear, dirty section và draft
  snapshot. Workspace chỉ còn shell, điều hướng, patient-form composition và
  save transaction.
- Tách state/load/clear/save/render Dịch vụ sang
  `components/doctor-services-form.js`. `support-modules-ui.js` chỉ còn facade
  điều phối Đơn thuốc + Dịch vụ và kết quả global save; không còn giữ state
  danh mục hoặc row dịch vụ.
- Tách lifecycle presentation của Chỉ định sang
  `components/doctor-indications-form.js`. Đây vẫn là UI-only đúng contract:
  không fixture, catalog giả, API, save/load hoặc fallback; component chỉ
  reset/render count và giữ pane ở trạng thái rỗng cho tới khi backend owner
  được chấp thuận.
- Giữ nguyên template partial, selector/id, endpoint, payload, DB owner và
  patient-switch clear sequence. Không tạo UI/logic cũ-mới cùng render hoặc
  thêm nhánh fallback.
- Static QA: `node --check` toàn bộ JS liên quan, `python3
  scripts/check_frontend_contract.py`, `python3 scripts/smoke_health.py --http`
  và HTTP asset/load-order checks đều đạt.
- Browser QA phiên hiện tại bị Browser Use URL policy chặn điều hướng tới
  localhost sau khi tab cũ đang ở trang lỗi kết nối. Vì vậy chưa kết luận
  `pass visual/interactive QA`; cần chạy lại trên browser session có thể mở
  route thật để xác nhận state có dữ liệu, tab Dịch vụ và A -> B -> A.

### Doctor Prescription Row Structure Slice (2026-08-03)

- Prescription rows now use one direct table presentation for medicine, dose,
  route, quantity, total, and actions. `unit` and the existing per-item
  `usageNote` remain editable inside the medicine cell, matching the approved
  PNG hierarchy instead of consuming separate table columns.
- Removed the redundant `Liều dùng` group label from each row; `Sáng`, `Trưa`,
  `Chiều`, and `Tối` are the actual dose-column headers and now align directly
  with the other row fields.
- The medicine cell now reads as `Tên thuốc -> Hoạt chất/Dạng thuốc/Nguồn ->
  Ghi chú`, while route, quantity, total, and remove remain separate table
  columns. The table fits the current 980px desktop workspace without page or
  table-wrapper horizontal overflow; narrow viewports keep horizontal scroll
  inside the table wrapper to preserve every real field.
- Body-row cells now use a shared top baseline: the medicine name, four dose
  inputs, route, quantity, and total start together; the lower medicine-cell
  space remains the dedicated usage-note line instead of vertically centering
  the other fields in the row.
- The local `Đơn thuốc` jump action resolves the nearest ancestor that actually
  owns scroll (`.doctor-workbench-panel__body--clinical` on desktop and
  `#qlpkWorkspaceNativePane` in mobile document flow), so it does not move the
  whole page or create a blank lower viewport.
- No API, payload, DOM id, state, save/load, print, history, or patient-switch
  owner changed. Responsive container rules intentionally stack the same real
  fields when the history column narrows the editor.
- Browser QA used real appointments `1051` (5 medicines, 3 history entries)
  and `1101` (1 medicine) at desktop `1280x720` and viewport `390x844`; dense
  rows, history open, jump action, internal mobile table scroll, patient switch
  `1051 -> 1101 -> 1051`, no page overflow, and no console errors/warnings
  passed. No prescription data was saved during QA.

## Doctor Workspace: Current Runtime

| Owner | Active responsibility |
| --- | --- |
| `app/static/js/doctor-examination/page-runtime.js` | Canonical Doctor page auth/API/toast/date runtime; shared Doctor-loaded components use it before legacy global compatibility aliases. |
| `app/static/js/doctor-examination.js` | Page-level queue, patient selection, load token, clear/load orchestration, and module wiring. |
| `app/static/js/doctor-examination/clinical-workspace-ui.js` | Clinical render/collect, five root sections, dirty state, and form event ownership. |
| `app/static/js/doctor-examination/clinical-detail-persistence.js` | `examination_details` field map plus stale-safe detail load/save by section. |
| `app/static/js/doctor-examination/workspace-save-controller.js` | Global save transaction, leave dialog decision, draft fallback, and completion transition. |
| `app/static/js/doctor-examination/document-attachments-bridge.js` | Doctor-owned attachment state and adapter to shared document controls/list. |
| `app/static/js/doctor-examination/workspace-leave-guard.js` | Native unload and keyboard reload guard, delegating decisions to the workspace save owner. |
| `app/static/js/doctor-examination/medical-history-bridge.js` | Manual Tiền sử snapshot/dirty state; Doctor config is `autoSave: false`. |
| `app/static/js/doctor-examination/prescription-ui.js` | The only prescription state/lifecycle owner: load/clear/save, print/reuse, events, applying a searched medicine to a row, and prescription draft snapshot. |
| `app/static/js/doctor-examination/prescription-reexam-ui.js` | Pure re-exam lock/change/label rules for the badge and button (registry `prescriptionReExam`); no state/API/save owner. |
| `app/static/js/doctor-examination/prescription-medicine-search-ui.js` | Stock-medicine search dropdown: debounce, latest-query token, keyboard and positioning (registry `prescriptionMedicineSearch`); no prescription state/API/save owner. |
| `app/static/js/doctor-examination/prescription-model.js` | Pure prescription type, schedule/usage, payload, and date normalization; no DOM/API/state. |
| `app/static/js/doctor-examination/prescription-row-renderer.js` | Current medicine-row rendering and row-total presentation through callbacks; no state/API/save owner. |
| `app/static/js/doctor-examination/prescription-history-ui.js` | History-modal rendering/toggle presentation through callbacks; no state/API/save owner. |
| `app/static/js/doctor-examination/support-modules-ui.js` | Services and the single support save facade. |
| `app/static/js/doctor-examination/support-runtime.js` | Shared support DOM/API/format/token/draft helpers without domain state; registry key `supportRuntime` là owner nội bộ. |
| `app/static/js/doctor-examination/module-registry.js` | Registry IIFE duy nhất cho các helper nội bộ Doctor không cần export global riêng. |
| `app/static/js/doctor-examination/draft-recovery.js` | IndexedDB-only manual-save recovery. |

`app/templates/doctor-examination.html` loads the Doctor-private modules in
dependency order before the page orchestrator. Prescription presentation is
loaded separately from `doctor-examination.css` as
`app/static/css/pages/doctor-prescription.css`. The runtime contract is
maintained in `references/doctor-examination-context.md`; business/data/nav
details remain in the three Doctor workflow references.

## Completed Doctor Slices

### Doctor Prescription Summary Density Slice (2026-08-03)

- Prescription summary fields now use one horizontal `label | value` row inside
  the existing two-zone overview: usage/dose on the left, treatment days/
  re-examination on the right.
- Re-examination checkbox, date/time, auto-schedule action, and status share one
  value row on desktop; the mobile breakpoint stacks only when the available
  value width requires it. No field, DOM id, API, payload, or save/load owner
  changed.
- Corrected the mobile medication heading margin to match the reduced mobile
  container padding and corrected the focused history button contrast on the
  teal prescription header.
- Browser QA used appointment `1101` (1 medicine) and `1051` (5 medicines,
  3 history entries) at desktop `1280px` and mobile `390px`; stale note clearing,
  history open, no console warnings/errors, and no horizontal overflow passed.
- `python3 scripts/smoke_health.py --http` passed after the slice.

- Manual global `Lưu` is the transaction owner for main clinical data, scoped
  details, Tiền sử, prescription, and services. It has no artificial
  wait or success modal; clean owners do not write.
- Tiền sử Doctor autosave was removed. Changes are captured from current DOM
  on explicit global save; safety-plan upload/file repair remains explicit.
- Draft recovery is IndexedDB-only and DB-first: restore is explicit, remains
  dirty, and uses the red outline marker. No clinical draft is stored in
  `localStorage`.
- Doctor root navigation is Hành chính, Tiền sử, Khám, Dịch vụ. Đơn thuốc stays
  inline below the Khám cards, with one local `Đơn thuốc` jump action and the
  existing `Lịch sử thuốc` modal action in the Khám card header; Tài liệu đính kèm stays in Hành chính; Chỉ định
  is not mounted or loaded by Doctor; Khám chi tiết stays inline.
- Prescription v4 is now applied inside the existing owner: current order and
  prescription history share one responsive layout, medicine rows expose the
  existing `usageNote` field as a per-row detail surface, and history reads the
  existing patient prescription-history endpoint. No API/model/payload owner
  changed.
- Prescription v4 follow-up keeps the current prescription code visible in the
  order header, shortens the composer labels to the clinical terms used by the
  workflow, and leaves one full-history action instead of duplicate history
  entry points. The prescription table keeps `SL`, row-level usage/note, and
  the existing save/reuse/re-examination actions.
- Prescription root separation now uses one real `doctor-workspace-section` for
  `#doctorPrescriptionWorkspace`; the former `is-prescription-focus` CSS/JS
  presentation branch was removed. Doctor print now requires the shared
  prescription document template and clinic config; the duplicate lightweight
  print fallback was removed.
- Service workspace is a two-region, full-height desktop layout with internal
  catalog/selected-list scrolling, pagination, selected quantity/remove,
  centered Giá/SL columns, and a derived `Tổng dự tính` footer. Global `Lưu`
  persists services.
- Palette owner is `app/static/css/pages/doctor-examination.css`: cream frame
  `#D9D4CF`, primary text `#1F1A16`, brown context headers `#4B2719`, clinical
  headers `#0B665C`, interactive/service teal `#0B5F56`, and white text on
  teal headers. Prescription selectors now live in
  `app/static/css/pages/doctor-prescription.css` and consume the same tokens.

### Doctor Prescription Row Layout Fix (2026-08-03)

- Kept the active row-based prescription presentation in
  `app/static/css/pages/doctor-prescription.css`: no API, payload, DOM id,
  state, save/load, print, or patient-switch owner changed.
- Fixed one extra closing `</div>` in
  `app/templates/partials/doctor-clinical-workspace.html`. It had closed the
  prescription main pane early, placing the medication list and history aside
  outside their intended layout. The existing history owner then rejected the
  toggle because its layout parent was missing.
- Real browser QA in a fresh Doctor tab at `1280x720`: appointment `1051`
  rendered code `798362805006-C`, 5 medicines, 3 history entries; history
  opened as the second grid column. Appointment `1101` rendered code
  `798360806007-C`, 1 medicine, and no stale history after switching; the
  empty-history state also opened correctly.
- Desktop metrics show equal `clientWidth/scrollWidth` for the clinical scroll
  owner (`982px`) and medication list (`625px`); all five row children stay
  within row bounds, and total/actions do not overlap. Browser console had no
  `error` or `warn` entries.
- `python3 scripts/smoke_health.py --http` passed. The current in-app browser
  does not expose viewport emulation, so populated `390px` mobile visual QA
  remains **chưa pass visual/interactive QA** and is not claimed from CSS
  inspection alone.

### Doctor Prescription Frame Flattening Slice (2026-08-03)

- Removed the inner overview card border/radius/shadow, made the medication
  header flush with the prescription surface, and removed the white card feel
  from medicine rows and note rows. The outer prescription frame remains the
  single visual owner.
- No template, renderer, JS event, API, payload, data contract, save/load,
  print, or patient-switch behavior changed.
- Browser QA at `1280x720` passed for real appointments `1101` (1 medicine)
  and `1051` (5 medicines, 3 history entries). History opened, the empty
  history state opened, and switching `1051 -> 1101` cleared stale patient and
  prescription data.
- Post-change measurements: clinical scroll owner `clientWidth ==
  scrollWidth` (`982px`), medicine list `clientWidth == scrollWidth` (`660px`)
  with history open, all five row children remained within row bounds, and
  browser console had no `error` or `warn` entries.
- `python3 scripts/smoke_health.py --http` passed. Mobile populated visual QA
  remains **chưa pass visual/interactive QA** because the in-app browser has no
  viewport emulation.

## Doctor Cleanup 2026-07-29

- Reconciled documentation against the live asset list. The former long
  historical inventory named dozens of retired Doctor helper files and must
  not be used for runtime decisions.
- Removed the dead prescription `save` event branch: no rendered element owns
  `data-prescription-action="save"`.
- Removed verified-unused Doctor CSS selector families and responsive remnants.
- Service-header labels `Dịch vụ`, `Đã chọn`, `Giá`, and `SL` use white text on
  teal `#0B5F56`.
- `appointment_services` now has one backend selection/calculation owner at
  `app/modules/appointments/services/appointment_service_selection.py`.
  Doctor sync cannot set financial fields, finance overrides require
  `admin`/`staff`, paid/legacy-paid visits are immutable, and invoice summary
  uses the same quantity-aware formula.

## Doctor Cleanup 2026-08-02

- Split the active prescription owner out of `support-modules-ui.js` into
  `app/static/js/doctor-examination/prescription-ui.js`.
- Added `support-runtime.js` for shared API, DOM, formatting, token, and draft
  row helpers instead of copying those helpers into each domain module.
- Kept `QLPKDoctorSupportModulesUi` as the only compatibility facade consumed by
  the clinical workspace and draft recovery. It coordinates prescription and
  services but does not render or mutate prescription rows itself.
- Preserved all existing prescription endpoints, payload fields, DOM ids,
  navigation placement, patient-switch clear behavior, and global save phases.
- Clinical updates in `PUT /api/appointments/<id>` no longer swallow errors;
  an exception reaches the route rollback. Doctor support aggregation preserves
  `skipped` rather than reporting it as a successful write.
- Removed the hidden `#doctorSupportPanel` template branch, its history API
  load/render/modal handlers, and its unrendered Doctor-only CSS. Shared modal
  history assets remain because patient-search and psychologist screens still
  use them.
- Removed the unused prescription facade exports; `saveAll()` now calls the
  canonical `QLPKDoctorPrescriptionUi.save()` owner directly.
- Removed two unused `support-runtime.js` helpers (`formatDateText()` and the
  unused runtime `isLoading()` facade) after confirming there are no callers.
- Before the responsibility refactor, the scoped Doctor source count was
  **8,992 lines**: page orchestrator 719,
  Doctor-private modules 4,521, Doctor CSS 3,202, and main template plus
  clinical partial 550. Shared assets loaded by Doctor are excluded from this
  scoped total.

## Doctor Responsibility Slice 2026-08-02 (Current)

- Split the prescription closure without creating a second owner: model/date/
  usage normalization is in `prescription-model.js`, current row rendering is
  in `prescription-row-renderer.js`, and history rendering is in
  `prescription-history-ui.js`; `prescription-ui.js` remains the only state,
  event, load, save, dirty, and patient-switch owner.
- Moved the complete prescription CSS slice, including the shared search-cell
  selectors and responsive rules, to `doctor-prescription.css`. The main Doctor
  CSS no longer contains prescription selectors.
- Removed verified-unused prescription runtime imports. No endpoint, model,
  payload field, DOM id, nav entry, or global save phase changed.
- Before the page-runtime extraction, the direct Doctor scope was **9,154
  lines**: page orchestrator 474, Doctor-private JavaScript 4,917, Doctor shell
  CSS 2,130, prescription CSS 1,074, and Doctor templates/clinical partial 559.

## Doctor Page Runtime Cleanup 2026-08-02

- Extracted page auth-header normalization, API calls, login redirect, toast,
  and date display from `doctor-examination.js` into
  `doctor-examination/page-runtime.js`.
- `doctor-examination.js` is now **394 lines** and only owns queue,
  appointment selection, patient-switch clear/load orchestration, module
  wiring, and realtime refresh.
- `medical-history-bridge.js` now uses the page runtime directly instead of
  wrapping `window.getAuthHeader` and `window.QLPKCurrentAppointment.apiCall`.
- Doctor-loaded shared history, safety-plan, relatives, and joint-exam
  components prefer the canonical page runtime. Legacy global aliases remain
  only for non-Doctor callers that still require them.
- No API URL, payload field, DOM id, save phase, patient-switch order, or
  clinical data owner changed.
- The direct Doctor scope is now **9,171 lines**: page orchestrator 394,
  Doctor-private JavaScript 5,013, Doctor shell CSS 2,130, prescription CSS
  1,074, and Doctor templates/clinical partial 560. The net increase is 17
  lines because the page contract is now explicit instead of hidden inside the
  orchestrator.
- Related shared assets are now **2,841 lines** (`medical-history-core.js`
  2,054 and prescription document template 787), for **12,012 lines** in this
  narrow Doctor-related scope at that checkpoint.

## Doctor Source Ownership Cleanup 2026-08-02 (Current)

- Rewired `doctor-examination.html` to the live Doctor-owned medical-history
  modules. The retired `components/medical-history-core.js` and
  `components/safety-plan.js` paths are no longer referenced.
- Split the former medical-history runtime into explicit owners: core/history
  workbench (**897 lines**), allergy (**287**), risk (**434**), ICD suggestions
  (**302**), event bindings (**129**), and safety plan (**256**). The split
  medical-history support is **2,049 lines** before the bridge; it is no longer
  counted as one shared 2,046-line file.
- Removed Doctor-only auth/toast fallbacks from medical history and safety plan.
  They now require `page-runtime.js`, which is loaded first and owns auth,
  request, redirect, and toast behavior. Payload normalization fallbacks remain
  because they handle real backend/version variation, not fake data.
- Split the remaining history God surfaces into explicit modules:
  `medical-history-core.js` (**460**), `medical-history-workbench.js` (**445**),
  `medical-history-icd-bridge.js` (**439**), and lifecycle
  `medical-history-bridge.js` (**352**). The lifecycle bridge remains the only
  history clear/load/save/draft owner.
- Doctor ICD selection state is now owned by the internal ICD bridge contract;
  active Doctor modules no longer read or mutate `window.selectedICDs` directly.
- Current direct Doctor source inventory is **11,529 raw lines**: Doctor JS
  (**7,759**, including the 394-line orchestrator), Doctor CSS (**3,204**), and
  Doctor template/clinical partial (**566**). The route loads **18,858 local JS
  lines** total; **11,099** of those are shared/support assets and are not
  Doctor-workspace owners.
- No API URL, payload field, DOM id, save phase, navigation entry, or
  patient-switch clear contract changed in this cleanup slice.

## Doctor Presentation Cleanup 2026-08-02

- Removed 1,347 lines of unrendered prescription presentation CSS from
  `doctor-examination.css`: the retired workspace/composer/table/row families
  no longer coexist with the active editor/card/history owner.
- Renamed the active prescription list DOM id from
  `doctorPrescriptionTableBody` to `doctorPrescriptionList`; the list keeps
  `role="list"`, prescription state, load/save endpoints, and payload shape.
- No API, model, database, navigation, patient-switch, or save lifecycle owner
  changed. Earlier populated prescription QA used the real Doctor-owned case
  Ngô Hiển Đạt and prescription `798360806007-C`; the current cleanup browser
  session has an empty queue, so it does not replace that populated check.

## Prescription Runtime Cleanup 2026-08-01

- The shared prescription document template now exports the canonical
  `getClinicInfoConfig()` and `buildPrescriptionPreviewHTML()` helpers used by
  Doctor print and QR verification; no lightweight print renderer remains.
- Removed unused variables explicitly marked `UI ONLY (NO BACKEND)` from the
  shared prescription template.
- Removed the stale frontend `PKST1` facility-code configuration and code-generation
  comment. Prescription codes remain backend-owned in `save_service.py`.
- No fake medicine, appointment, history, or prescription dataset exists in the
  Doctor runtime. Empty-state labels and payload normalization are presentation
  states, not seeded data.

## Doctor Responsive Slice 2026-07-29

- Doctor switches from the queue/main split to a two-pane tab switch at
  `max-width: 63.99875rem`, keeping tablet portrait clinical content usable
  without changing the shared workflow component or data contract.
- At mobile widths, `#qlpkWorkspaceNativePane` owns vertical scrolling;
  Doctor uses its available block size, the empty surface fills that region,
  and the patient hero actions can wrap below the patient summary.
- Browser QA covered `1440x900`, `1280x720`, `1024x768`, `768x1024`,
  `600x900`, `390x844`, and `320x568`; pane switching and empty queue/main
  states had no page overflow or console warnings. A populated appointment is
  still required for final dense-form/table visual QA.

## Deliberately Deferred Doctor Debt

1. The Doctor orders surface is removed. The backend orders module and its other
   screen callers remain outside this cleanup scope.
2. Full `type="module"` migration đã hoàn tất ngày 2026-08-09 bằng một entry
   ESM duy nhất; bảy classic assets còn lại là shared/app-shell boundaries có
   chủ ý và được contract checker allowlist rõ ràng.

## Validation Status

- Recent static checks pass: `python3 scripts/check_frontend_contract.py` and
  `python3 scripts/smoke_health.py --http`.
- Cleanup validation additionally covers Python/JavaScript syntax and an
  isolated appointment-service contract check for catalog-price authority,
  financial snapshots, legacy finance `amount`, percentage validation, paid
  lock, and rejection of an attempted existing-row `service_id` reassignment.
- 2026-08-02 cleanup validation: all Doctor JavaScript syntax checks,
  `check_frontend_contract.py`, and `smoke_health.py --http` pass. Browser QA
  at `1280x720` confirms no `#doctorSupportPanel` or support-history DOM,
  exactly four root sections, the prescription/history/service owners still
  mounted, no document overflow, and no console error/warn.

- Current responsibility-slice validation: all Doctor JavaScript syntax checks,
  `check_frontend_contract.py`, CSS brace/static-reference checks, and
  `smoke_health.py --http` pass. Browser QA with the real Doctor account on
  appointment `1051` confirms the new CSS/JS assets load, code
  `798362805006-C`, all 5 medicine rows, 3 history entries, history toggle,
  desktop no-overflow, and A -> B (`1101`) -> A without stale prescription or
  patient data; browser console has no logs. Populated responsive QA below
  `1280x720` remains **chưa pass visual/interactive QA** because the available
  browser binding has no viewport emulation; prior empty-state responsive QA
  does not certify this dense populated state.

- Page-runtime cleanup validation: the Doctor-private JavaScript plus touched
  shared component syntax checks, `check_frontend_contract.py`,
  `smoke_health.py --http`, static asset order, and an isolated page-runtime
  contract test pass. The current in-app browser renders the shell but does not
  execute the injected Doctor scripts, and Chrome is unavailable in this
  environment; post-change browser regression is therefore **chưa pass
  visual/interactive QA** and is not claimed from static checks.

## Doctor Phase 3 QA - 2026-08-02

- Static QA passed on the current source: all touched Doctor JavaScript syntax
  checks, `python3 scripts/check_frontend_contract.py`, and
  `python3 scripts/smoke_health.py --http`.
- Real account QA used `hienngvo` (`DOCTOR`, user id `24`) on a fresh QA server
  instance; no fixture, password reset, or data mutation was used.
- Database/API evidence is valid for appointment `1051`: examination status
  `DOCTOR_EXAM`, prescription `530`, code `798362805006-C`, and 5 medicine
  items. `GET /api/appointments/1051/edit` and
  `GET /api/prescription/appointment/1051` both return `200`; the latter
  returns all 5 medicine rows.
- Browser populated QA now passes at `1280x720`: real card selection renders
  Nguyễn Thị Ảnh, prescription `798362805006-C`, all 5 medicines, and the
  persisted re-examination date `18/07/2026 20:38` with status `Đã tạo lịch`.
- The runtime fixes were root-level: guard the optional jQuery legacy binding
  in `medical-history-core.js`, and route the workspace age calculation through
  `QLPKDoctorSupportRuntime.calculateAge` instead of the removed global.
- History QA passes with 3 previous prescriptions; A -> B -> A passes without
  stale patient or prescription data; inline medicine editing stays in place;
  print opens the print window; no-change save returns `Không có thay đổi cần
  lưu.` without a write. No clinical values were mutated during QA.
- Populated desktop overflow passes at `1280x720`. The in-app Browser runtime
  does not expose viewport resizing, so populated `1024/768/390/320` visual
  QA remains **chưa pass** and must not be claimed from CSS inspection alone.

## Doctor Responsibility Refactor 2026-08-02

- Reduced `clinical-workspace-ui.js` from 1,211 to 771 lines. It no longer owns
  `examination_details` persistence, the global save transaction, completion,
  or the leave confirmation implementation.
- Added explicit owners for clinical detail persistence, the global workspace
  save/completion transaction, document attachments, and reload/leave guards.
- Kept the existing global contracts (`QLPKDoctorClinicalWorkspace`,
  `QLPKDoctorSupportModulesUi`, `QLPKDoctorPrescriptionUi`,
  `QLPKDoctorWorkspaceLeaveGuard`) and did not change API endpoints, payload
  fields, DOM ids, patient-switch clear order, or save phases.
- Reduced `doctor-examination.js` from 719 to 496 lines. It now coordinates
  queue, appointment load/clear, module initialization, and realtime refresh;
  attachment implementation and reload guard are outside the orchestrator.
- At that checkpoint prescription remained one cohesive state owner and was
  intentionally not split into multiple state owners; the current follow-up
  slice below separates only stateless helpers and keeps that owner intact.
- That checkpoint's scoped Doctor source count was **9,196 lines**. Including the shared
  medical-history core and shared prescription document template, the related
  source surface is **12,025 lines**. The total increased during this
  structural refactor because explicit module contracts add small adapters;
  the important reduction is in cross-domain ownership and God-file size, not
  an artificial deletion of required workflow behavior.

## Doctor Final QA - 2026-08-02

- Current direct Doctor source inventory is **11,529 raw lines**: Doctor JS
  **7,759** (7,365 private modules plus the 394-line orchestrator), Doctor CSS
  **3,204**, and Doctor template/clinical partial **566**. This is an inventory,
  not a claim that every line is business logic; shared assets loaded by the
  route are excluded from the Doctor owner count.
- Headless Chrome QA executed the real Doctor JavaScript with the real
  `hienngvo` Doctor account, without fixture data, password reset, or write
  actions. Appointment `1051` rendered Nguyễn Thị Ảnh, prescription
  `798362805006-C`, 5 medicine rows, and 3 history rows.
- Navigation QA opened Tiền sử and returned to Khám; prescription history
  opened in place with `aria-expanded` and the history panel state aligned.
  A -> B (`1101`) -> A restored the correct patient, prescription code, and
  medicine/history counts with no stale data.
- Populated responsive QA passed at desktop `1440x1013` and mobile `390x844`:
  document/body width matched the viewport, no horizontal overflow occurred,
  the clinical grid collapsed to one column on mobile, and the prescription
  controls/rows remained visible in the intended scroll surface. Screenshots
  were inspected for both clinical and prescription surfaces.
- Browser console and static asset checks reported no Doctor JavaScript errors
  or failed Doctor assets. This supersedes the earlier in-app-browser limitation
  note; the in-app browser still renders the shell without executing Doctor
  scripts, but headless Chrome provided the actual runtime QA.
- Draft recovery QA changed only a local clinical field, captured it to the
  temporary browser's IndexedDB, reloaded and reselected appointment `1051`,
  confirmed the recovery banner appeared after the DB-first surface loaded,
  then discarded the draft. The persisted clinical value remained unchanged.
- Service QA loaded 24 catalog rows on page `1 / 12`, added one unselected
  catalog service, removed that same pending row, and moved to page `2 / 12`.
  The selected-row count returned to its original value; no service save or
  financial mutation was issued.

## Doctor Medical History Event Cleanup - 2026-08-02

- Replaced the 53 inline `its*` / `sp*` handler declarations in the Doctor
  medical-history partial with `data-*` action contracts and one delegated event
  owner in `medical-history-bindings.js`.
- Added the internal `QLPKDoctorMedicalHistory` action/state namespace. The
  required public contracts remain unchanged: `QLPKDoctorMedicalHistoryIcd`,
  `QLPKDoctorMedicalHistoryBridge`, and `MedicalHistoryComponent`.
- Removed explicit `window.its*`, `window.sp*`, `window.itsIcdLookup`, and
  `window._spFamilyMembers` aliases from the Doctor scope. API endpoints,
  payloads, DOM ids, navigation, clear/load/save lifecycle, and data owners did
  not change.
- Static QA passed: all touched Doctor JavaScript `node --check`,
  `check_frontend_contract.py`, `smoke_health.py --http`, and the final scan for
  inline handlers/legacy aliases.
- Browser QA passed with the real Doctor session on appointment `1051`: tab
  navigation, family/allergy tabs, allergy row add/remove, substance and
  self-harm toggles, risk radio toggle/uncheck, ICD suggestion select/unselect,
  and A -> B (`1101`) -> A stale-data clearing. No console errors were recorded.
- Responsive QA passed at `1440x1013` and `390x844`: page/body width matched the
  viewport with no page-level horizontal overflow; inner navigation remains
  intentionally scrollable where the content exceeds mobile width.

## Doctor Prescription UI Slice - 2026-08-02

- Reworked only the prescription presentation inside the Khám tab: prescription
  header/code/status/actions, three-column clinical summary, medication cards,
  inline medicine note, re-examination fields, totals, and in-place history.
- The follow-up visual pass uses a read-first/edit-in-place presentation: summary
  values and saved medicine notes read as content by default, while existing
  inputs remain available on focus/edit. The palette is scoped to a restrained
  white, soft-teal, ink, and muted-line system instead of adding decorative
  color blocks; the prescription and medication section headers now consume the
  shared `var(--doctor-section-header-bg)` token for Doctor-wide color harmony.
- Medicine rows now prioritize medicine identity, dose slots, and route; quantity,
  line total, and edit/remove actions stay in a compact secondary rail without
  removing their fields or actions.
- Removed diagnosis from the prescription summary presentation and reduced the
  overview to two regions: common usage on the left and treatment/re-examination
  controls on the right. Diagnosis remains owned by the examination workflow.
- Finalized the two-region order: common usage plus dose calculation on the left;
  treatment duration plus re-examination on the right.
- Removed the unsupported empty stethoscope presentation; the remaining summary
  icons render from the loaded Bootstrap Icons set and were verified with real
  Doctor data.
- Kept the existing prescription state owner, API endpoints, payload fields,
  DOM ids, save/load lifecycle, print action, history reuse, and re-examination
  action. No prescription nav, modal, fixture data, or duplicate owner was
  introduced.
- Real Doctor QA on appointment `1051` rendered code `798362805006-C`, 5
  medicine rows, 3 previous prescriptions, the persisted diagnosis, and total
  quantity `105 viên`. Switching `1051 -> 1101 -> 1051` cleared and restored
  patient-specific prescription state without stale data.
- Fixed a real layout defect found during QA: when history opens, its 320px
  column reduces the main pane below the viewport breakpoint. The prescription
  card now uses a container query so medicine and dose fields reflow within the
  actual pane instead of overflowing underneath history; the prescription code
  also wraps instead of being hidden behind an ellipsis in the narrow header.
- Static QA passed after the final patch: `check_frontend_contract.py`,
  `smoke_health.py --http`, and all touched prescription `node --check` checks.
- Desktop visual/interactive QA passed at `1280` with history open, five real
  medicine rows, no page-level horizontal overflow, and no child overflow under
  the history column. Appointment `1101` confirmed an existing note renders as
  readable text and opens to a textarea only when edited.
  Mobile visual QA for this final patch was not re-run because the active
  in-app browser session cannot emulate a mobile viewport; do not claim a new
  mobile screenshot pass from CSS inspection alone.

## Doctor Medical History Contract Cleanup - 2026-08-05

- Chốt một response owner `medical_history.patient`, `medical_history.examination`
  và `medical_history.previous_examination`; Doctor runtime không còn đọc các
  top-level history alias hoặc nhánh risk trong clinical workspace.
- Chốt một save/clear owner là `QLPKDoctorMedicalHistoryBridge`; risk assessment
  không còn được ghép chuỗi `[TSH]`/`[ĐGN]` ở runtime.
- Chuẩn hóa `examinations.risk_assessment` thành JSONB canonical và chuẩn hóa
  patient history JSONB về array/object đúng loại.
- Dọn 26 nhóm duplicate trong `examination_details`, archive các row dư vào
  `legacy_database_archive`, rồi áp unique constraint
  `uq_examination_details_examination_section_field`.
- Migration đã chạy thành công ở local DB và head hiện tại là
  `20260805_norm_med_history`.
- Static/schema/API QA sau cleanup đạt; local API readback đã xác nhận ca có
  `physical_history` và ca có risk assessment structured đều trả đúng contract.
- Browser QA đã xác nhận Doctor chạy thật với dữ liệu DB: mở Tiền sử, chuyển
  đủ các nhóm Bản thân/Gia đình/Dị ứng/Dùng chất/Tự sát-Tự hại/Đánh giá nguy
  cơ/Kế hoạch an toàn, không có console warning/error và không có page overflow.
  Đã kiểm tra patient switch A -> B -> A, trạng thái Tiền sử được clear trước
  khi load và response cũ không ghi lại dữ liệu bệnh nhân trước. Desktop và
  viewport hẹp đã được kiểm tra trong cùng slice; không save dữ liệu lâm sàng
  trong QA.
- Residual debt ngoài scope vẫn giữ nguyên: `clinical-workspace-ui.js` và
  `doctor-examination.js` còn fallback identity `patient_info`/`patient` cho
  các payload ngoài medical-history contract. Phần `patients.allergies` đã
  được xử lý trong slice 2026-08-08 bên dưới, không còn là TEXT runtime.

## Doctor Medical History Allergy And Namespace Cleanup - 2026-08-08

- Chuẩn hóa `patients.allergies` thành JSONB array canonical
  `[{name, level, symptom}]`; runtime Doctor đọc/ghi trực tiếp mảng này.
- Migration `20260808_normalize_allergies` và `20260808_clean_allergy_ph` đã
  archive dữ liệu packed-text trước khi chuyển schema; placeholder rỗng được
  loại khỏi dữ liệu active.
- Doctor allergy bridge không còn parse packed string ở runtime. Text parser
  chỉ tồn tại tại boundary nhập liệu/import và các formatter read-only.
- Dọn toàn bộ namespace handler cũ `its*`/`sp*` trong vùng Tiền sử; đổi sang
  `medicalHistory*`/`safetyPlan*`, bỏ biến chết `_itsSerializing`, và giữ một
  lifecycle owner duy nhất là `QLPKDoctorMedicalHistoryBridge`.
- Thêm stale-response token guard cho Safety Plan upload/open/repair; response
  cũ không được phép cập nhật bệnh nhân mới.
- Static, schema, Alembic và data-contract QA đạt trước browser pass. Browser
  QA thực tế dùng ca `1101` (Ngô Hiển Đạt): Tiền sử hiển thị 3 mục Bản thân,
  kế hoạch an toàn và người hỗ trợ; chuyển `1101 -> 1051 -> 1101` clear/restore
  đúng, không có console warning/error và không ghi thay đổi QA vào DB. Bảng
  Dị ứng đã được kiểm tra thêm với thao tác thêm/sửa/xóa một dòng canonical;
  sau khi xóa, bảng và chip trở về rỗng.
- State browser có dữ liệu dị ứng đã lưu của `HS00294` chưa được mở trực tiếp vì
  các ca Doctor đang ở queue không chứa appointment hợp lệ của bệnh nhân đó;
  state này đã được kiểm bằng DB/API contract (`allergies` canonical) nhưng
  chưa pass visual/interactive QA riêng trên browser. Không dùng browser
  fixture hay tự đổi trạng thái appointment để che khoảng trống này.
- Bản nháp cục bộ đã được kiểm tra không ghi DB; trạng thái browser hiện được
  đóng sau QA.

## Doctor Medical History Advanced Visibility - 2026-08-08

- `physHistoryTextInput` vẫn là field canonical của `patients.physical_history`;
  chỉ CSS visibility được sửa để field hiện ở Bản thân và ẩn ở bốn pane nâng cao
  dùng chung personal (`Tiền sử dùng chất`, `Tự sát / Tự hại`, `Đánh giá nguy
  cơ`, `Kế hoạch an toàn`). Không đổi template, JS, payload, BE hoặc DB.
- Browser QA dữ liệu thật `Ngô Hiển Đạt / HS00267`: field hiển thị ở Bản thân,
  `display:none` và chiều cao `0` ở cả bốn pane nâng cao; giá trị `bbb` vẫn giữ,
  chỉ có một DOM node, không overflow ở desktop và viewport `390x844`, console
  không có warning/error.

## Doctor Safety Plan Wrapper Cleanup - 2026-08-08

- Loại bỏ lớp wrapper presentation `safetyPlanPanelWrap` khỏi template; action bar
  và field grid trở thành hai block trực tiếp của `medical-history-section-body`.
- Chuyển visibility owner sang hai block hiện có, xoá CSS nền/padding wrapper và
  cập nhật draft recovery về `.safety-plan-fields`; không đổi field, upload,
  save/load, API, BE hoặc DB.
- Browser QA với `Ngô Hiển Đạt / HS00267`: chuyển Kế hoạch an toàn ↔ Đánh giá
  nguy cơ ẩn/hiện đúng cả hai block, file status và các field vẫn render; desktop
  và viewport `390x844` không page overflow, console không có warning/error.

## Doctor Workspace Utility And Contract Cleanup - 2026-08-09

- Đóng nợ helper trùng trong `clinical-workspace-ui.js`: `textOf`, `hasValue`,
  `setText`, `setValue`, và `getValue` dùng owner chung tại
  `doctor-examination/support-runtime.js`. Workspace chỉ giữ resolver DOM theo
  root/config để không làm mất component scoping; không thêm fallback hoặc
  nhánh old/new song song.
- Shared runtime hỗ trợ `fallback`/`hideWhenEmpty` cho text và resolver tùy
  chọn cho component scoped; các caller cũ của đơn thuốc/dịch vụ giữ nguyên
  contract.
- Thêm `scripts/check_doctor_examination_contract.py` dạng read-only: khóa thứ
  tự asset, đủ 5 root section, canonical owner một lần, không có alias Doctor
  đã retired, và không có prescription row/render owner thứ hai trong facade.
- Static QA đạt: Node bundled `--check` toàn bộ Doctor JS và component Khám/
  Dịch vụ; Doctor contract; `check_frontend_contract.py`; `smoke_health.py
  --http`. Không sửa BE/DB và không ghi dữ liệu nghiệp vụ.
- Browser QA dữ liệu thật: `Ngô Hiển Đạt / HS00267` (2 dòng thuốc),
  `Trần Ngọc Bảo Trân / HS00289` (0 dòng), `Nguyễn Thị Ảnh / HS00135`
  (10 dòng thuốc, 3 đơn lịch sử). Lịch sử mở inline, A -> B -> A clear/restore
  đúng, page không overflow, bảng thuốc giữ scroll nội bộ, console warn/error
  rỗng.
- Responsive QA tại `390x844` đạt cho populated state: body width đúng
  viewport, không page-level overflow, prescription table scroll đúng owner;
  viewport override đã reset sau kiểm tra.

## Doctor Global Save Result Cleanup - 2026-08-09

- Chuẩn hóa global Doctor `Lưu`: kết quả nghiệp vụ chỉ còn `success` hoặc
  `error`; không còn trả `partial` cho người dùng.
- `saveAll()` của support modules chỉ coi module có `status=success` là thành
  công. `partial`, `skipped` và reject của module dirty đều trở thành lỗi có
  `label`, `reason` và hướng dẫn sửa.
- `workspace-save-controller.js` phát đúng một thông báo lỗi theo module,
  ví dụ: `Lưu thất bại ở Đơn thuốc: Thuốc "a" chưa được chọn từ danh sách
  thuốc trong kho. Hướng dẫn: Chọn thuốc từ danh sách trong kho hoặc bật Nhập
  ngoài cơ sở, rồi bấm Lưu lại.`
- Draft recovery vẫn được giữ như cơ chế cứu hộ IndexedDB nhưng chạy im lặng;
  không còn toast `Đã giữ bản nháp...` ghi đè hoặc làm người dùng hiểu nhầm là
  kết quả lưu.
- Đơn thuốc được pre-validate trước API: dòng thuốc trong cơ sở không có
  `medicine_id` phải chọn lại từ kho hoặc chuyển sang `Nhập ngoài cơ sở`.
  Lỗi tạo lịch tái khám cũng được báo là `error` và giữ đơn ở trạng thái cần
  lưu lại, thay vì gọi là lưu một phần.
- Static QA: `node --check` bốn file Doctor đã sửa, `check_frontend_contract.py`
  và `smoke_health.py --http` đạt. `check_doctor_examination_contract.py`
  vẫn còn một lỗi tồn tại ngoài lát này: `realtime-client.js` đang được load
  như classic script; không phải lỗi phát sinh từ thay đổi save.
- Browser QA dữ liệu thật với `Ân / HS00073`: nhập thuốc không hợp lệ `a` rồi
  bấm Lưu chỉ hiện một toast lỗi rõ module/nguyên nhân/cách sửa, không có toast
  draft; chọn lại `Gabapentine 300mg` từ kho thì đơn chuyển `Đã lưu`; bấm Lưu
  khi sạch hiện `Lưu thành công: không có thay đổi cần lưu.` Console không có
  log lỗi.

## Doctor Medicine Dropdown Interaction - 2026-08-09

- Đơn thuốc dùng một dropdown thuốc floating duy nhất tại `document.body`,
  `position: fixed`, không còn bị cắt bởi table/form overflow; input thuốc giữ
  `role=combobox`, `aria-expanded` và keyboard navigation.
- Browser QA dữ liệu thật với `Ân / HS00073`: focus mở đúng kết quả
  `Gabapentine 300mg`, click chọn đóng dropdown và đưa focus ra khỏi input;
  `ArrowDown` + `Enter` chọn đúng; `Escape` đóng đúng.
- Khi cuộn panel Khám, dropdown reposition theo input và tự lật lên khi phía
  dưới không đủ chỗ. Dropdown vẫn nằm ngoài table; page không có horizontal
  overflow ở viewport mặc định `1280x720` và viewport hẹp `800x700`.
- DOM cuối chỉ có một `#doctorMedicineDropdown`, parent là `BODY`,
  `position: fixed`, `z-index: 1200`; console không có warning/error.
- Không đổi table layout, field, API, payload, backend hoặc database; không lưu
  thay đổi thuốc nghiệp vụ trong QA.

## Doctor Medicine Dropdown Visual Cleanup - 2026-08-09

- Loại bỏ visual button mặc định của từng option: item full width, nền trong,
  border separator mảnh và một container listbox duy nhất; không còn các khối
  xám rời rạc hoặc khoảng trắng thừa bên phải.
- Tên thuốc và metadata được phân cấp một dòng, có ellipsis khi dài; hover,
  active và focus keyboard dùng nền kem/vạch nâu đồng bộ Doctor, không dùng
  opacity thấp.
- Dropdown floating nằm ngoài `.doctor-workspace`, nên CSS owner có token
  fallback cục bộ cho nền, text, line và accent; tránh rơi về style mặc định
  của trình duyệt khi render qua `document.body`.
- Browser QA dữ liệu thật với `Ân / HS00073`: kiểm tra 3 kết quả tìm `ser`,
  click/keyboard/Escape, viewport `800x700`, page không overflow và console
  không có warning/error. Thay đổi tạm trong QA đã được bỏ, dữ liệu trở lại
  `Gabapentine 300mg`, không lưu nghiệp vụ.

## Workspace Tabs Account Isolation And Native Close - 2026-08-12

- Workspace tab/active-tab storage chuyển sang contract version 2, giữ state theo
  `qlpk_user.id` (fallback username khi payload cũ chưa có id). Legacy global
  array/string bị bỏ qua để không rò tab giữa tài khoản.
- `workspace-tabs.js` lọc stored configured routes qua permission hiện tại trước
  khi render; `realtime-client.js` chỉ đọc danh sách đã lọc từ workspace shell,
  không còn parse raw localStorage thành owner thứ hai.
- Đóng tab native khi còn tab khác sẽ chạy leave guard cho native/active Doctor,
  chọn tab còn lại, lưu active state rồi điều hướng top-level sang href đó. Reload
  không còn khởi tạo lại route native vừa đóng. Khi chỉ còn một tab, UI không
  render nút X vô tác dụng.
- Login chọn landing theo vai trò/quyền (`doctor`, `psychologist`, `staff`) và ghi
  owner từ response login trước khi `/check/me` hoàn tất. Route có trong
  navigation config nhưng user không có quyền được chuyển về landing hợp lệ.
- Thêm `scripts/check_workspace_tabs_contract.py` và runtime VM check; frontend
  gate, Doctor contract và `smoke_health.py --http` đều đạt.
- Browser QA thật với tài khoản `Bs CKI. Nguyễn Võ Văn Hiến`: launcher không có
  Lễ tân; mở Lịch hẹn rồi đóng native Bác sĩ chuyển đúng top-level URL; reload
  chỉ còn Lịch hẹn; direct load Lễ tân quay về Bác sĩ, không sinh tab trái quyền;
  console warn/error rỗng. Không chọn bệnh nhân, không lưu dữ liệu nghiệp vụ.

## Prescription Verification QR Same-Origin And Fail-Closed Print - 2026-08-12

- Root cause của QR mất trên bản in: shared prescription template tải ảnh từ
  `api.qrserver.com`; browser/network/ad blocker có thể làm ảnh lỗi, trong khi
  `PrescriptionPrintDocument` resolve cả sự kiện `error` rồi vẫn gọi
  `window.print()` trong `finally`.
- `app/modules/prescriptions/api/public.py` sinh PNG QR cùng domain tại
  `GET /api/public/prescription/<code>/verification-qr.png` bằng thư viện
  `qrcode` hiện có. Endpoint xác nhận đơn tồn tại trước khi sinh, QR chỉ encode
  URL verify công khai và không gửi dữ liệu lâm sàng ra bên thứ ba.
- Shared template dùng endpoint nội bộ và đánh dấu QR là print asset bắt buộc.
  Print lifecycle kiểm `naturalWidth`, timeout 10 giây, chỉ gọi in ở success;
  lỗi QR đặt `data-print-ready="error"`, hiện cảnh báo và không tạo bản in thiếu
  mã xác thực. Doctor và modal lịch sử dùng chung owner nên nhận cùng fix.
- Static/API QA đạt: Python/Node syntax, prescription print contract, frontend
  contract, API auth contract, Doctor contract và `smoke_health.py --http`.
  Mã thật `798360908001-C` trả PNG `328x328`, mã giả trả `404`; OpenCV giải mã
  đúng `http://localhost:8000/verify/rx/798360908001-C`.
- Headless browser QA với dịch vụ `api.qrserver.com` bị map sang localhost vẫn
  render A4 PDF có QR; QR lấy từ trang PDF giải mã đúng URL verify. Lifecycle
  instrumented đạt cả success (`data-print-ready="true"`, gọi print) và failure
  (`data-print-ready="error"`, không gọi print). Browser QA tài khoản thật
  `Bs CKI. Nguyễn Võ Văn Hiến`, hồ sơ `Ân / HS00073`, xác nhận nút `In đơn`
  hiện diện, enabled và đi qua entry point dùng chung; không ghi dữ liệu nghiệp vụ.

## Prescription Modal QR Display Size - 2026-08-12

- Root cause QR HTML bị phóng lớn: endpoint cùng domain trả PNG 328x328 để giữ
  độ nét, nhưng `patient-search-modal.css` chưa sở hữu kích thước hiển thị cho
  `.rx-verify-qr-image`; dịch vụ QR cũ từng trả ảnh 130x130 nên che khuất thiếu
  sót CSS này.
- Modal giờ hiển thị QR ở `8.125rem` (130px với root mặc định), giữ tỷ lệ và tự
  co theo ô chứa. Không đổi endpoint, dữ liệu QR, shared template hoặc CSS A4.
  `check_patient_history_modal_contract.py` khóa selector scoped và ba thuộc
  tính kích thước để ngăn tái phát.
- Browser QA dữ liệu thật đạt với `Ân / HS00073` (1 thuốc), `Nguyễn Thị Ảnh /
  HS00135` (5 thuốc) và một history chưa có đơn: QR có natural size 328x328,
  display 130x130, không ảnh lỗi, document/modal không overflow ngang; trạng
  thái chưa có đơn không dựng QR. PDF A4 hồi quy vẫn đúng A4 và OpenCV giải mã
  QR về `http://localhost:8000/verify/rx/798360908001-C`.

## Doctor Production-Candidate QA - 2026-08-13

- Chạy lại static/contract/schema/Alembic gates: Doctor contract, patient-history
  modal contract, frontend contract, `smoke_health.py --http`, schema contract,
  Alembic strict và toàn bộ entry-import/syntax đều đạt. Không có automated
  test suite trong snapshot (`pytest -q` không phát hiện test).
- Browser QA dữ liệu thật với `Ân / HS00073`: chọn hồ sơ, mở modal lịch sử,
  chuyển đủ năm tab, kiểm tra Bệnh án BS chia hai cột, in tab Toa thuốc, chuyển
  `Ân -> Ngô Hiển Đạt -> Ân`; desktop `1280x720` và mobile `390x844` không có
  page/modal/grid overflow, console warning/error rỗng.
- Native Chrome extension không khả dụng trong môi trường agent; thay bằng
  Chrome headless thật + PDF render. Bản in dùng component `PrescriptionPrintDocument`
  đạt một trang A4 (`594.96 x 841.92 pt`), header/mã đơn/mã hồ sơ không chồng,
  QR natural `328x328` hiển thị đúng và OpenCV giải mã QR trong PDF về URL verify.
- QA bắt được CDN JsBarcode có thể không tải, khiến barcode biến mất nhưng bản
  in vẫn tiếp tục. Đã thêm fallback Code128B thuần trong print component; khi
  loại CDN, barcode `HS00073` vẫn sinh SVG `112` module và PDF vẫn có barcode,
  QR, chữ ký, không tạo trang thừa. Không đổi API/schema và không ghi dữ liệu
  nghiệp vụ trong QA.

## Doctor Re-examination Status Contract - 2026-08-14

- Sửa lỗi dùng `re_examination_appointment_id` như cờ xác nhận ở Doctor và
  prescription backend. ID chỉ biểu thị lịch con đã tồn tại; `SCHEDULED` vẫn
  chỉnh/hủy được, chỉ `CONFIRMED` khóa checkbox và datepicker.
- Công thức mặc định của `Đặt lịch` chuyển thành ngày local hiện tại cộng đúng
  số nguyên không âm `Số ngày điều trị`, giờ `09:00`; bỏ fallback `+7` khi giá
  trị bằng 0/trống/không hợp lệ. Helper tính ngày nằm ở `prescription-model.js`
  để có thể kiểm thử độc lập qua cuối tháng/năm.
- Save result tái khám trả explicit `status` cho create/update/cancel/confirmed;
  frontend giữ baseline đúng payload đã gửi để một thay đổi phát sinh trong lúc
  request chạy vẫn còn dirty. Local recovery chỉ bỏ qua control lịch khi trạng
  thái server là `CONFIRMED`, không bỏ qua mọi lịch có ID.
- QA đạt: helper thuần pass 8 case gồm `0`, `7`, qua tháng/năm và input không
  hợp lệ; backend fake-session pass `CONFIRMED` immutable, `SCHEDULED` update và
  cancel mà không gọi side effect thật. Browser dữ liệu thật kiểm appointment
  gốc `1150`/lịch con `1151` (`SCHEDULED`) và appointment gốc `850`/lịch con
  `1046` (`CONFIRMED`): trạng thái, màu, enabled/disabled, công thức `14/08 + 9
  = 23/08/2026 09:00`, invalid không fallback, recovery và mobile `390x844`
  đều đúng; console rỗng. Không bấm `Lưu`; draft QA đã xóa và DB đối chiếu cuối
  giữ nguyên status/date của hai lịch con.

## Next Safe Work

1. Validate service add/remove/quantity/pagination with a safe appointment in a
   separate behavior QA slice.
2. Replace native attachment confirmation through the shared dialog owner in a
   cross-screen slice.

## Prescription Inventory Single-Owner Cutover - 2026-08-14

- Chuyển `prescription_items` thành owner duy nhất của số lượng hiện đang lưu
  theo appointment; không đọc ledger để suy ra số lượng đơn hoặc tồn hiện hành.
  Ledger chỉ còn append-only movement.
- `save_service.py` sở hữu trọn transaction đơn chính: khóa một row appointment,
  đọc old items, gom payload mới theo `medicine_id`, gọi stock owner theo id tăng
  dần, thay header/items, append movement và commit/rollback toàn bộ. Không thêm
  revision table, idempotency table, Redis lock hay explicit lock chồng.
- Phương án thêm `medicine_transactions.appointment_id` đã được rollback và
  migration đã xóa trước khi bàn giao. Contract cuối không thêm bảng/cột/index:
  appointment được giới hạn bằng hai mẫu note sẵn có, còn `batch_id` sẵn có chỉ
  đúng lô. Không backfill note và không điều chỉnh tồn lịch sử.
- QA PostgreSQL session độc lập đạt bốn nhóm: delta tuần tự `0->5->5->7->3`,
  hai request cùng appointment, hai appointment tranh 10 viên và rollback đơn
  nhiều thuốc khi thuốc thứ hai thiếu. Dữ liệu QA đã cleanup; schema/Alembic và
  static owner guard đều đạt.

## Prescription Batch FEFO Dispensing - 2026-08-14

- Không thêm bảng, cột hoặc migration. Thêm code owner
  `app/modules/prescriptions/services/stock_service.py` dùng ba cấu trúc hiện
  hữu: số dư từng lô ở `medicine_batches.remaining_quantity`, tồn tổng ở
  `medicines.stock_quantity`, movement cấp/hoàn ở `medicine_transactions` với
  `batch_id` + hai mẫu note appointment hiện hữu.
- Save khóa appointment, medicine và batch theo thứ tự cố định; cấp các lô còn
  hạn theo FEFO, hoàn phần đã truy vết về đúng lô theo reverse-FEFO, và commit/
  rollback header, item, tổng kho, lô và movement như một đơn vị. Phần legacy
  không có lô được hoàn trực tiếp về tồn tổng bằng movement `batch_id=NULL`,
  không đoán lô và không backfill dữ liệu lịch sử.
- Tồn tổng không còn bị bắt bằng tổng lô vì dữ liệu cũ đã trừ tổng nhưng chưa
  trừ lô. Cấp mới lấy giới hạn thấp hơn giữa tồn tổng và tổng lô còn hạn; độ
  lệch được giữ nguyên, không tự cân kho và vẫn không thể cấp vượt một trong hai.
- API đọc/save trả allocation state. Doctor hiển thị trực tiếp mỗi lô đã cấp
  thành một block xanh riêng. Khi tồn tổng khớp tổng lô, block có số đã cấp/số
  còn lại; khi dữ liệu đang lệch, block chỉ hiện số đã cấp và toàn dòng chỉ hiện
  một `Tồn khả dụng` lấy theo số thấp hơn giữa tồn tổng và tổng lô còn hạn, nên
  số dư lô thô lớn hơn không còn bị hiểu nhầm là tồn dùng được. Không còn dòng tóm tắt
  `Đã cấp đủ • N lô` hoặc thao tác mở/thu gọn; trạng thái legacy, partially
  tracked hoặc inconsistent không hiện nhãn kỹ thuật thụ động. Màu cam chỉ dùng
  cho đơn mới hoặc phân bổ đầy đủ đang được sửa và chờ lưu; lỗi cấp/hoàn kho vẫn
  được save chặn và báo rõ. Toast save nói rõ tổng đã cấp/hoàn và số lô.
- QA PostgreSQL disposable đạt: delta lặp `0->5->5->7->3`, cùng appointment,
  hai appointment tranh cùng kho, rollback nhiều thuốc, loại lô hết hạn, hoàn
  legacy chỉ vào tồn tổng, chuỗi mixed legacy/có lô tăng-giảm-xóa, cho phép độ
  lệch tổng/lô nhưng vẫn chặn theo tồn thấp hơn, và case lô A `100` + lô B `500`
  cấp `400` thành `100 + 300` với tổng còn `200`. Static prescription/Doctor/
  frontend contracts và HTTP smoke đều đạt; dữ liệu QA đã cleanup.
- Browser QA thực tế ngày 2026-08-15 đạt trên ca hai lô: `400 -> 404` chỉ cấp
  thêm `4` từ lô B, chi tiết hiện `A: cấp 100/còn 0`, `B: cấp 304/còn 196`;
  save thiếu tồn `396` khi chỉ còn `196` bị chặn, báo rõ thiếu `200` và DB giữ
  nguyên đơn `404`/tồn `196`. Sửa liều cập nhật trạng thái lô theo tổng cùng
  `medicine_id` mà không render lại row hoặc làm mất focus; trạng thái đã cấp
  dùng xanh đậm, chờ lưu dùng cam đậm và không gây overflow ngang.
- Điều chỉnh UI ngày 2026-08-15: đơn legacy/partial/inconsistent không còn hiện
  nhãn kỹ thuật về truy vết lô; backend vẫn giữ nguyên allocation state và
  fail-closed khi save cần cấp/hoàn kho. Browser QA trên ca Ngô Hiển Đạt/
  Diropam xác nhận hàng thuốc cũ không còn batch-status phụ và không có lỗi
  runtime. Behavioral renderer QA xác nhận hai lô được render thành hai block
  trực tiếp, đơn mới/đơn đã cấp đang sửa vẫn hiện trạng thái chờ lưu, còn legacy
  đã sửa vẫn không sinh cảnh báo thụ động.
- Điều chỉnh trình bày dòng thuốc ngày 2026-08-15: bỏ metadata lặp `Dạng thuốc`
  và `Trong kho`; chỉ giữ nhãn ngoại lệ `Thuốc ngoài`. Đơn vị được đặt ngay
  trong ô `Số lượng`: chỉ đọc theo catalog cho thuốc trong kho và editable cho
  thuốc ngoài. Không đổi API, payload, database hoặc stock transaction owner.
- Điều chỉnh tính trung thực tồn kho ngày 2026-08-15: lỗi thiếu tồn và dòng thuốc
  chỉ công bố một `Tồn khả dụng = min(tồn tổng, tổng lô còn hạn)`. Khi tổng/lô
  lệch, block lô vẫn cho biết đúng số đã cấp nhưng không còn gọi số dư lô thô là
  `còn`; chỉ khi `inventory_consistent=true` mới hiện số còn lại của từng lô.
  Browser QA ca Ngô Hiển Đạt/Escitalopram xác nhận dữ liệu `834/2490` chỉ hiện
  `Tồn khả dụng: 834 viên`, không còn `2.490`; thử cấp thêm `990` báo thiếu
  `156` cùng hướng dẫn giảm số lượng hoặc bổ sung kho. Hoàn nguyên về liều cũ
  lưu thành công, không còn draft; đổi A -> B -> A không dính trạng thái lô,
  không overflow ngang và console không có warning/error. Static Doctor/
  prescription/frontend contracts, HTTP smoke và toàn bộ PostgreSQL disposable
  stock QA đều đạt; dữ liệu QA đã cleanup.

## Prescription Overview Simplification - 2026-08-15

- Bỏ control hiển thị `Cách dùng chung` khỏi Doctor; phần hướng dẫn riêng tiếp
  tục thuộc từng dòng thuốc. Giá trị `global_usage` cũ vẫn được load và ghi trả
  nguyên vẹn trong owner đơn thuốc nên thay đổi UI không tự xóa dữ liệu legacy.
  Trường đã nghỉ cũng bị loại khỏi snapshot/focus khôi phục; snapshot cũ chỉ có
  khác biệt ở trường này được xem là dư thừa.
- Overview đơn thuốc chỉ còn `Cách tính liều`, `Số ngày điều trị`, `Hẹn tái
  khám`: một hàng khi component rộng, reflow `2 + 1` dưới `60rem`, một cột dưới
  `38rem`. Layout dùng container query theo chiều rộng owner đơn thuốc, không
  phụ thuộc toàn bộ viewport và không đổi API, database hay logic kho.
- Static QA đạt Doctor/frontend/prescription-stock contracts, 15 case draft
  recovery và `smoke_health.py --http`. Browser QA dữ liệu thật Ngô Hiển Đạt/
  Diropam đạt ở `1280x720`, `1000x900`, `390x844`: đúng ba mode layout, không
  overflow ngang, control cũ không còn trong DOM, chuyển bệnh nhân không làm
  state cũ sống lại và console warning/error rỗng. Không bấm `Lưu` trong QA.

## Prescription Medicine Days Input - 2026-08-15

- Sửa owner CSS của `Số ngày điều trị`: input số co theo phần còn lại của dòng,
  chữ `ngày` giữ đúng vùng riêng và native spinner bị tắt trên Chromium/Safari/
  Firefox. Wrapper là owner focus duy nhất; outline accessibility chung không
  còn tạo viền kép trực tiếp trên input.
- Browser QA dữ liệu thật Ngô Hiển Đạt/Diropam đạt ở `1280x720`, `1000x900`,
  `390x844`: focus một lớp, không spinner, không chồng chữ hoặc overflow ngang.
  Nhập thử `14` cập nhật đúng ngày tái khám `29/08/2026 09:00` và tổng liều;
  sau đó dùng `Bỏ thay đổi`, xác nhận UI trở lại dữ liệu database và không để
  lại draft QA. Console warning/error rỗng; Doctor/frontend/HTTP smoke đạt.

## Doctor Indication Catalog Autocomplete - 2026-08-15

- Đổi riêng control `Tên chỉ định` từ native select sang order autocomplete
  dùng chung. Focus khi chưa nhập hiển thị tối đa 30 mục; màn Doctor opt-in tìm
  không dấu theo tên, mã và đường dẫn nhóm, đồng thời hỗ trợ chuột, phím mũi tên,
  Enter và Escape. Hành vi mặc định của các màn đang dùng helper chung không bị
  thay đổi.
- `doctor-indications-form.js` tiếp tục là owner duy nhất của lựa chọn: hidden
  ID chỉ được gán khi chọn một mục danh mục; sửa text sẽ xóa ID ngay; text tự do
  bị chặn khi thêm. Edit/cancel/reset/chuyển bệnh nhân đồng bộ cả text, ID và
  dropdown. Chỉ catalog active được gợi ý; row legacy inactive đã lưu vẫn đọc
  và sửa được theo dữ liệu row. Không đổi API, schema hoặc payload save.
- Static QA đạt Doctor/frontend contracts, JS/Python syntax, helper behavioral
  test và `smoke_health.py --http`. Browser QA dữ liệu thật Ngô Hiển Đạt tại
  `1280x720` đạt focus-empty, tìm không dấu, Enter, clear ID khi sửa text,
  Escape, add/edit/cancel/delete draft và chuyển bệnh nhân; không bấm `Lưu`,
  không để lại dữ liệu QA, không có console/page runtime error. Visual QA trong
  lượt này chỉ xác nhận tại viewport `1280x720`.
- Visual QA đã bác bỏ bản geometry mở rộng popover thành `537px`: nó vẫn là
  child `absolute` dưới chuỗi workspace `overflow`, nên vừa lấn sang bảng vừa
  bị cắt ở đáy. Bản đó đã được thay, không còn là contract được chấp nhận.
- Dropdown hiện là popover neo theo viewport, rộng đúng bằng input (`240px` tại
  viewport QA `1280x720`), đo phần trống để mở lên/xuống và cập nhật neo khi
  scroll/resize. Browser QA dữ liệu thật đạt state 30 mục cuộn nội bộ tới đáy
  viewport, một kết quả tự co, không có kết quả, Enter, Escape, click ngoài và
  chuyển `Ngô Hiển Đạt -> Trần Ngọc Bảo Trân -> Ngô Hiển Đạt`; text/ID/dropdown
  cũ đều được xóa, không bấm `Lưu` và không để lại dữ liệu QA.

## User Feedback Copy Audit - 2026-08-15

- Doctor không còn đổ chi tiết tính tồn/lô từ backend vào toast thiếu kho.
  Backend vẫn giữ số cần cấp, tồn khả dụng và số thiếu để kiểm tra transaction;
  UI chỉ hiện `Không đủ thuốc trong kho. Vui lòng kiểm tra số lượng đã kê và tồn
  kho.` cho cả thao tác Lưu và Hoàn thành.
- `workspace-save-controller.js` bỏ formatter `Lưu thất bại ở ... Hướng dẫn:
  ...`; lỗi một vùng dùng hai câu `vùng chưa lưu + việc cần làm`, còn lỗi nhiều
  vùng chỉ nêu tên các vùng cần kiểm tra. Trạng thái không có thay đổi dùng
  `Không có thay đổi cần lưu.`
- Static contract khóa câu thiếu kho và chặn hai mẫu formatter dài quay lại.
  Browser QA dữ liệu thật Ngô Hiển Đạt/Escitalopram tăng đơn lên `25.000` viên
  xác nhận request bị rollback và toast hiện đúng nguyên văn; reload trả số
  lượng database về `500`, không có bản nháp QA để xóa.
- Hoàn tất owner feedback chung `QLPKUserFeedback`: 32 template tương tác load
  cùng runtime/tokens; wrapper Doctor, lễ tân, lịch hẹn, thanh toán, kho, chỉ
  định và các danh mục chỉ còn ủy quyền. Toast DOM/CSS page-local không còn là
  renderer thứ hai.
- Backend bổ sung `code` ổn định vào mọi JSON error response mà không đổi field
  cũ; frontend map code/status hoặc dùng câu theo workflow, không đổ raw
  `detail/error/message`, exception, `server`, `module`, `appointment ID` hay
  `(manual save)` ra UI. Không dùng sanitizer/cắt chuỗi toàn cục.
- `scripts/check_user_feedback_contract.py` khóa runtime include, shared owner,
  API error code và raw technical value tại UI sink; check đã được nối vào
  frontend contract tổng.

## Doctor Patient History Bridge Slice - 2026-08-23

- Tách cấu hình/caller của modal Lịch sử bệnh nhân khỏi
  `doctor-examination.js` sang `app/static/js/doctor-examination/patient-history-bridge.js`;
  module đăng ký bằng `patientHistoryBridge` trong Doctor registry và trả lại
  đúng instance do `components/patient-history-modal.js` sở hữu.
- Orchestrator vẫn giữ `selectHistoryResult()`, `viewHistoryAppointment()`,
  `reset()`, `getState().medicalHistoryData` và mount lifecycle vì các phần này
  phụ thuộc load token/state của Doctor; nó chỉ truyền callback/state vào bridge,
  không còn gọi `.getOrCreate()` trực tiếp.
- Không đổi modal markup/CSS, API URL, payload, DB/schema, trigger
  `doctorClinicalHistoryButton`, status filter, copy/delete policy hoặc patient
  switch clear order.
- Thêm `tests/doctor_patient_history_bridge.test.js` và contract assertion để
  khóa dependency, trigger guard, callback `copyHistory` và one-owner caller.
- Static QA lát này: `node --check`, bridge lifecycle test, Patient History
  Modal contract và `pytest -q tests` đều đạt (`10 passed`). Browser QA Doctor
  sau lát tách này còn phải chạy lại với ca thật trước khi kết luận hoàn tất.

## Clinical Indication Integrity Slice - 2026-09-01

- Khóa scope theo appointment cho detail/update/delete/batch và file result;
  survey session nội bộ cũng kiểm tra từ `examination_id` về appointment.
- Đưa validation payload và pagination vào backend owner: status/location hợp
  lệ, tên/người thực hiện/ngày/cờ hoàn thành đúng kiểu, ID không được trỏ sang
  lượt khám khác; page lỗi trả `400`, không làm thay đổi dữ liệu.
- Giữ `ChiDinh.survey_template_id` làm nguồn template chuẩn: chỉ định nhập
  text không mở luồng survey, tab Khảo sát tự chọn và khóa đúng mẫu đã gắn;
  link chỉ tạo khi template active và thuộc lượt khám.
- File result mới được giới hạn PDF/JPG/PNG/DOC/DOCX, tối đa 25MB và đường dẫn
  lưu trữ an toàn; timeline custom không còn hiển thị các bước khảo sát giả.
- QA: `pytest -q` đạt 35 test, syntax/frontend/Doctor/auth/Alembic/smoke đạt;
  HTTP 401/403/400 và browser Doctor/Quản lý chỉ định đã kiểm tra, console
  warning/error rỗng. Không để lại session khảo sát test trong database.


### 2026-09-13 — Tủ thuốc: chuẩn hóa ô tìm DAV trong modal liên kết

- Theo yêu cầu user, ô DAV dùng chung của thêm/liên kết/liên kết lại đã chuyển
  sang macro + `QLPKAutocompleteField`, chế độ chọn một. Gỡ dropdown/listener/
  pagination/CSS hình học riêng khỏi `clinic-catalog.js` và medicine-management.
- Trace: modal-dialog giới hạn viewport → modal-content/form flex column →
  modal-body cuộn → source section → control. Popup nổi top layer dùng lõi
  chung, không tăng chiều cao modal; chi tiết nguồn và bảng đối chiếu vẫn
  hiển thị riêng sau lựa chọn. Backend preview/payload/xác nhận giữ nguyên.
- Adapter giữ cache 30 giây, 12 dòng/trang, invalidation form/auth/inventory,
  scope clinic_medicine_id và yêu cầu từ khóa trong liên kết. Core giữ chữ
  khi ghép IME và chỉ tìm/chọn sau commit.
- QA: 27 Node tests (core, ICD, field8, DAV Tủ thuốc, save) đạt; frontend
  contract và JS syntax đạt. Firefox thẻ QA riêng cùng container quản trị:
  Diropam 2 kết quả, tablet 12→24 khi cuộn, tìm rỗng, chọn bằng bàn phím,
  đổi lựa chọn khóa xác nhận; 390×600 popup mở trên, tên dài wrap và dòng
  phụ ellipsis, chọn bằng chuột/chạm mở preview. Form thêm focus rỗng tải
  danh mục và chọn mở khóa form. Đã hủy, đóng thẻ QA; không ghi dữ liệu
  thuốc thật. API write được kiểm bằng test, không xác nhận liên kết live.
