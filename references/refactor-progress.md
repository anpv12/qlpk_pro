# QLPK Refactor Progress

Last updated: 2026-08-16.

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
| `app/static/js/doctor-examination/prescription-ui.js` | The only prescription state/lifecycle owner: medicine search, load/clear/save, print/reuse, events, and prescription draft snapshot. |
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
