# Prescription Module Context

### PDF preview (2026-09-21)

- Transport update28/09 lát52: shared/pdf-preview.js dùng canonical fetch,
  không lấy token riêng từ local/sessionStorage. Cookie CSRF/identity và
  legacy Bearer do API transport giữ; HTML payload/QR/Blob lifecycle không đổi.

- Caller `PrescriptionPrintDocument.render()` phải await: HTML mẫu in hiện
  hữu gửi tới `POST /api/print/preview.pdf`, mở Blob PDF trong tab đã tạo khi
  click. Không print/afterprint/auto-close; Ctrl+P/Cmd+P do người dùng chọn.
- QR fetch same-origin rồi inline; thiếu QR bắt buộc phải báo lỗi. Barcode
  dùng JsBarcode nội bộ; không lưu draft hoặc thay đổi lượt khám.
- Worker dùng process riêng, chỉ đọc static và dữ liệu HTML nhận vào,
  không chạy JS client, không truy DB/API hoặc tải tài nguyên mạng ngoài.

## Lịch sử kê đơn theo lần nhập tại tủ thuốc (2026-09-21)

- Nút mở lịch sử dùng class `mm-receipt-history-button`: hover/focus-visible/
  active đồng bộ chữ trắng với gradient thương hiệu, không kế thừa chữ tối
  của các nút phụ modal nhập. Không animate màu chữ khi gradient đổi ngay.
- Thanh lọc dùng chung geometry cho input/select/button trong scope
  `receiptDispensingFilters`: min-height36px, padding6px10px, line-height,
  font và radius chung. Không dùng chiều cao cố định hoặc bỏ focus ring;
  select giữ padding phải dành cho mũi tên. Không sửa primitive toàn cục.
- UI sửa theo phản hồi thẩm mỹ: header dùng gradient thương hiệu chung,
  body/footer nền trắng, header bảng xám trung tính; không phủ kem modal.
  Theo yêu cầu user, bỏ khối tên thuốc/lô/ngày nhập phía trên thanh lọc
  cùng writer và CSS riêng; batch ID nội bộ vẫn lọc đúng lần nhập.
  Bệnh nhân là thông tin chính, ngày khám là dòng phụ; cấp/hoàn
  có cột Loại riêng, số lượng/tồn căn phải. Modal giới hạn 76rem, cuộn trong bảng;
  footer gọn và chỉ hiện nút phân trang khi có hơn một trang.
- Trong tab Lịch sử nhập, mỗi dòng có nút “Lịch sử kê đơn” mở modal riêng
  `receiptDispensingModal`; không chia đôi bảng hoặc mở chi tiết inline.
  Đóng modal giữ bộ lọc, trang và focus của danh sách nhập.
- Dùng GET `/api/medicine/statistics/ledger?batch_id=...`, lọc đúng ID
  `medicine_batches`, không gom theo chuỗi số lô vì nhiều lần nhập có thể
  cùng số lô. Quyền đọc và payload ledger hiện có được giữ nguyên.
- Modal đọc bệnh nhân/lượt khám, ngày khám, thời điểm cấp/hoàn, số lượng,
  người thực hiện, `balance_after` (tồn lần nhập) và `stock_balance_after`
  (tồn tổng thuốc) ngay sau giao dịch. Không lấy tồn hiện tại thay lịch sử.
- Tìm tên bệnh nhân (có/không dấu) qua `patient_search`, lọc `movement_type`
  (export/return/price_adjustment) ở backend trước phân trang; lọc hoàn gồm
  import cũ có note hoàn theo đơn. Bộ lọc chỉ trong batch đang mở, reset khi
  mở lô khác; response cũ không ghi đè. Tìm kiếm bằng Enter/nút Tìm kiếm,
  đổi Loại áp dụng ngay; Xóa lọc về trang đầu.
- Không hiển thị ID lượt khám/lần nhập. Cột Thay đổi kho giữ dấu quantity:
  âm là trừ, dương có dấu cộng, 0 là Không đổi. Thứ tự mới nhất trước được
  ghi rõ, ngày khám tách thời điểm thao tác.
- Dữ liệu cũ thiếu snapshot hiển thị “Chưa ghi nhận”, thiếu liên kết hiển thị
  “Chưa liên kết lượt khám”. Backend trả `stock_balance_inconsistent` khi
  cả hai snapshot có giá trị và tồn lô lớn hơn tổng; UI cảnh báo cần đối soát,
  không chỉnh số hoặc suy tồn. Không suy bệnh nhân
  từ ghi chú, không backfill hoặc cân lại tồn. Không thêm bảng, không đổi
  writer cấp/hoàn, không đưa lịch sử giao dịch trở lại ô thuốc màn bác sĩ.
- QA và giới hạn: `reports/receipt-dispensing-modal-2026-09-21/qa.md`.

## Cách dùng trên bản in/xem trước (2026-09-20)

- Theo yêu cầu user, `prescriptionFormUsage` chỉ hiển thị `usage.note` hoặc
  usage dạng text cũ; không dựng thêm câu từ schedule/route/medicine_days.
  Ghi chú đã được editor tự điền hoặc bác sĩ sửa là nguồn nội dung duy nhất.
- Ghi chú trống giữ placeholder của renderer; không fallback suy liều.
  Không đổi payload/save, số lượng hay logic tự điền ghi chú ở editor.
- QA:3 file test standard_form/screen/followup_print đạt; browser local8000
  đơn798362009001-H trên trang xác thực dùng renderer mẫu giấy hiển thị
  đúng một câu “Uống 2 viên buổi sáng, trong 30 ngày.”, số lượng60 viên.
  Không gửi lệnh in vật lý, không sửa đơn hoặc DB.

Tài liệu này là context ngắn cho workflow đơn thuốc. Đọc khi sửa đơn thuốc, mẫu in, QR verify, prescription public API, shared prescription template, hoặc prescription view model.

## Nhóm đơn theo loại trong bảng kê (2026-09-11)

- Layout cập nhật 2026-09-13: với table-layout fixed, đặt bề rộng tại ô
  header Lịch uống của hàng đầu (28% cho bốn buổi, 16% cho hai cột lần/ngày).
  Cột tên thuốc nhận phần còn lại; không đặt width chỉ ở td liều của tbody
  vì trình duyệt dùng hàng đầu để chia cột. Header/footer cho phép wrap.
  Body clinical sở hữu cuộn dọc, có gutter stable và khoảng phải 0.65rem
  cho scrollbar dạng overlay. Bảng vẫn cuộn ngang trong table-wrap.
- `prescription-row-renderer.js` là owner duy nhất của markup bảng kê. Bảng gom
  dòng theo loại tài liệu qua `PrescriptionTypeContract.toDocumentType`, thứ tự
  cố định `DOCUMENT_TYPES` = BASIC → H → N, mỗi nhóm có một hàng tiêu đề
  `doctor-prescription-table__group-row` kèm mã đơn riêng. STT đánh lại từ 1 ở
  mỗi nhóm. Thuốc TOXIC tồn đọng rơi về nhóm BASIC đúng theo hợp đồng in.
- Mã đơn theo loại lấy từ `STATE.prescriptionCodesByType`, truyền vào renderer
  qua `codesByType`. Nhóm chưa có mã hiển thị `Chưa cấp mã đơn`. Không suy mã
  từ display text và không tự sinh mã ở frontend.
- Thứ tự `STATE.prescriptionRows` không đổi; gom nhóm chỉ ở tầng hiển thị. Mọi
  handler vẫn tra dòng theo `data-prescription-row-id` (uid), không theo index,
  nên đổi thứ tự hiển thị không ảnh hưởng sửa/xóa/lưu. Hai `<tr>` mỗi thuốc
  (body + note) đều mang `data-prescription-type`.
- Colspan hàng nhóm tính bằng `getTableColumnCount(mode)`: 4 cột lịch uống + 6
  = 10, hoặc chế độ Liều/lần + Lần/ngày là 2 + 6 = 8. Sửa cột bảng phải sửa hàm
  này, không hardcode.
- Màu: owner token ở `shared/color-tokens.css` (`--qlpk-rx-basic/h/n`, khai báo tại `:root`;
  từ 26/09 không còn khai báo trong `doctor-prescription.css`).
  BASIC dùng nâu thương hiệu `--qlpk-color-chocolate`, H tím `#7e57c2`, N cam
  `#f4511e`; nền nhóm là color-mix 7% trên trắng, thanh accent viền trái.
  Dropdown tìm thuốc trong `doctor-examination.css` trỏ về đúng token này.
  **Không dùng `--qlpk-workflow-context-header-bg` cho token màu**: biến đó là
  linear-gradient, đưa vào `color-mix` hoặc `border` sẽ hỏng im lặng (nền mất,
  viền về 0) mà không báo lỗi console.
- QA 2026-09-11: renderer test phủ BASIC/H/N lẫn lộn (thứ tự vào N,BASIC,H,N ra
  đúng BASIC→H→N; STT 1 / 1 / 1,2), một nhóm, hai nhóm, ba nhóm, bảng rỗng,
  chế độ Liều/lần colspan 8, thiếu mã đơn, và thuốc TOXIC. Browser ca 1101 dữ
  liệu thật: 2 dải nhóm đúng nhãn và đúng mã C/H, computed style đúng nâu và
  tím, không lỗi console. Chưa QA browser nhóm N vì kho không còn thuốc N.

## Contract loại đơn thuốc và chính sách TOXIC (2026-09-11)

- Owner duy nhất: `app/static/js/prescriptions/shared/prescription-type-contract.js`
  (`window.PrescriptionTypeContract`). Trước đó có 3 bản `normalizePrescriptionType`
  rời nhau cho cùng một khái niệm. Không tự viết lại hàm phân loại ở nơi khác.
- Hai khái niệm tách bạch: `normalizeCatalogType` trả loại thuốc trong danh mục
  (`BASIC/H/N/TOXIC`), còn `toDocumentType` trả loại **tài liệu in** (`BASIC/H/N`,
  TOXIC quy về BASIC). Trang in phải dùng `toDocumentType`; model/danh mục dùng
  `normalizeCatalogType`. Nhãn hiển thị lấy từ `getLabel`/`getShortLabel`.
- Consumer: `prescription-model.js`, `prescription-history-ui.js`,
  `prescription-print-document.js`. Mỗi consumer throw nếu thiếu contract; phải
  nạp contract trước chúng trong `doctor-examination-entry.js` và trong
  `psychologist-examination.html`. Sandbox test/VM cũng phải nạp file này trước.
- Hai nhánh dựng trang in là **cố ý**, không phải fallback thừa:
  `buildGroupedPageModels` dùng nhóm backend cho dữ liệu đã lưu (in từ modal
  lịch sử); `buildFlatPageModels` gom lại ở FE cho màn bác sĩ vì luồng đó in
  đúng bảng đang mở gồm sửa chưa lưu (`doctor-prescription-print.js` đặt
  `preferGroupedPrescriptions: false`). Không xóa nhánh flat.
- TOXIC bị chặn tại nguồn ghi: API tạo/sửa thuốc và import Excel chỉ nhận
  `BASIC/H/N`; template Excel bỏ lựa chọn "Thuốc độc". Lý do: vòng lặp lưu đơn
  `save_service.build_prescriptions_by_type` chỉ duyệt `['BASIC','H','N']`, nên
  thuốc TOXIC từng có nguy cơ bị bỏ im lặng khi kê. Từ 26/09, save service
  còn chặn loại chưa hỗ trợ trước xóa dòng/trừ kho, trả 400
  `prescription.invalid_input`, không tự chuyển TOXIC thành BASIC. Các `type_map` xuất Excel/PDF vẫn giữ
  nhãn TOXIC để hiển thị dữ liệu cũ. Muốn dùng thuốc độc thật thì phải bổ sung
  loại đơn thứ tư đầy đủ (mã đơn, mẫu in, vòng lặp lưu), không nới riêng validate.
- QA 2026-09-11: 15 case đối chiếu contract khớp 100% hành vi cũ của cả hai bản
  normalize; `check_prescription_print_contract`, `check_doctor_examination_contract`,
  `check_prescription_stock_contract`, `check_frontend_contract`, `check_api_auth_contract`
  và 17 test JS đạt. API trả 400 cho `prescription_type=TOXIC`, vẫn nhận H.
  Browser màn bác sĩ ca 1101: đơn 3 thuốc load đúng, chip H trong dropdown không
  hồi quy, không lỗi console, không ghi dữ liệu. Chưa QA browser màn tâm lý.

## Dropdown dịch vụ/bác sĩ tái khám (2026-09-07)

- API calendar trả `services`, `doctors`, `selection` từ danh mục thật. Lịch
  mới mặc định Khám tổng quát + actor; lịch cũ dùng đúng lựa chọn đã lưu.
  Không đổi phạm vi xem danh sách lịch khi đổi dropdown bác sĩ.
- Modal chỉ trả ngày giờ + selection vào draft. Đóng bỏ thay đổi; chuyển
  tháng giữ lựa chọn; đổi bệnh nhân reset draft. Recovery lưu selection;
  chỉ đổi dropdown cũng đánh dấu chưa lưu. Footer nhắc Lưu màn khám giữ lại.
- Save nhận `re_examination_selection: {doctor_id, service_id, package_id}`;
  snapshot/read/save-result cùng trả selection. So sánh ý định gồm ngày giờ
  và lựa chọn, giữ no-op của editor cũ chưa thay đổi, chặn snapshot cũ khi sửa.
  Backend kiểm bác sĩ active (doctor/psychologist hoặc actor), dịch vụ active;
  gói cũ được giữ nhưng không cho chọn gói mới qua dropdown dịch vụ.
- Bỏ các dòng phụ thống kê/phạm vi quyền xem/hướng dẫn click lịch. Chi tiết
  lịch hẹn vẫn hiện khi bấm sự kiện. Token typography và màu dùng chung.
- QA: 42 test policy PostgreSQL rollback đạt, gồm create/read/retry,
  selection-only update, dữ liệu sai/inactive, stale snapshot và khóa lịch.
  Browser dữ liệu thật kiểm default, đổi lựa chọn/tháng, đóng/xác nhận/mở lại,
  chuyển hai bệnh nhân và desktop/mobile; không lỗi JS, không ghi lịch thật.

### Số tuần của lịch nhỏ

- Flatpickr dựng 42 ô nhưng modal chỉ hiện các tuần có ngày thuộc tháng
  đang xem. `onDayCreate` tính đầu tuần kế tiếp sau cuối tháng theo locale;
  các ngày vượt mốc này dùng `hidden`, CSS chỉ scope trong modal tái khám.
  Không ẩn toàn bộ ngày ngoài tháng; vẫn chọn được ngày giao tháng.
- Browser đạt tháng 9/2026 (35 ô, hết 04/10), 2/2027 (28 ô), 3/2026 (42 ô),
  2/2024 nhuận và 12/2026 qua năm mới. Đổi tháng qua lại cập nhật đúng;
  chọn 04/10 từ tháng 9 cập nhật ngày và chuyển lịch sang tháng 10. Không lỗi JS.

## Typography modal lịch tái khám (2026-09-07)

- Owner: `app/static/css/components/re-examination-calendar.css`. Font-family,
  font-size, font-weight và line-height dùng token `shared/typography.css`;
  tiêu đề modal dùng md, nội dung/nhãn/ngày lịch dùng base, chú thích dùng sm.
  Không khai báo literal px trong CSS component; kích thước bố cục dùng rem,
  em, phần trăm và fr. Màu modal dùng token doctor nâu–kem, trạng thái dùng
  feedback token; không giữ palette xanh riêng trong FullCalendar/Flatpickr.
- Sidebar desktop 20rem; ô ngày/giờ chia 3:2, màn rất hẹp xếp dọc. Lịch nhỏ
  giữ font base, tháng/năm cùng hàng; mobile ẩn calendar inline do Flatpickr
  sinh ra. Body mobile dùng block và cuộn để sidebar/lịch chính không chồng.
- QA trình duyệt trên API lịch thực tế: 1900/1366/768/390/320, font tính ra
  đúng 14/13/12, không tràn ngang hoặc lỗi JS. Đây là QA presentation và
  đọc lịch; không tạo/sửa lịch hoặc kiểm chứng luồng lưu trong lượt này.

## Thiếu lô và gán tồn hiện hữu (2026-09-06)

- Lỗi cấp mới khi thuốc có tồn tổng nhưng không có lô trả
  `inventory.batch_missing`; lô còn số lượng nhưng toàn bộ lô sử dụng được đã
  hết hạn trả `inventory.batch_expired`. API trả detail có tên thuốc và hướng
  xử lý. Shared feedback và workspace save controller giữ detail này; không
  thay bằng thông báo thiếu tồn chung. `inventory.insufficient` vẫn dùng cho
  thiếu số lượng thông thường. Không nới điều kiện cấp thuốc theo lô.
- `inventory_service.plan_existing_stock_batches` và
  `register_existing_stock_batches` là owner gán tồn ban đầu chưa có lô.
  Chỉ nhận thuốc chưa có lô, expected_stock bằng tồn hiện tại và tổng số lượng
  các lô xác nhận bằng đúng tồn đó. Bắt buộc số lô, ngày nhập, hạn dùng và nguồn
  đối chiếu; không tự lấy hạn dùng danh mục hoặc tạo số lô ngẫu nhiên.
- Quantity/remaining_quantity của lô mới là số dư mở đầu đã xác nhận ở thời
  điểm chuyển đổi, không phải tuyên bố về số lượng nhập lịch sử. Không đổi tồn
  tổng. Mỗi lô có movement adjustment delta 0 kèm nguồn và số lượng gán trong
  note để giữ lịch sử mà không làm tăng tổng nhập. Lô hết hạn vẫn bị chặn cấp.
- Entry point local: `scripts/register_existing_medicine_stock.py <manifest>`
  mặc định chỉ validate trong transaction READ ONLY. `--apply` cần actor-id
  quản trị viên và file `--backup` mới để giữ plan trước/sau; khóa thuốc theo
  thứ tự ID, validate tất cả, commit/rollback toàn bộ. Lần chạy lại bị chặn vì
  thuốc đã có lô. Đây là công cụ đối soát local, chưa thêm nút vào màn kho.
- Không dùng công cụ này để tự xử lý thuốc đã có lô nhưng lệch tồn; các case
  đó cần đối soát chứng từ; UI/API kiểm kê thủ công đã gỡ ngày 2026-09-12,
  không tự bù chênh lệch. Báo cáo và manifest còn thiếu dữ liệu nằm tại
  `reports/inventory-lot-audit-20260906/`. Không tự lưu lại đơn bệnh nhân.
- QA: 13 tests PostgreSQL rollback cho gán tồn/cấp 6 viên, không tăng tồn hai
  lần, nguồn thiếu, số lượng lệch, lặp, nhiều lô, hết hạn và error API; 5 audit
  tests đạt. Browser kiểm chuỗi response -> shared feedback -> workspace save
  toast với response lỗi mô phỏng trên màn bác sĩ có dữ liệu ca 1101; mọi
  request ghi bị chặn trong browser QA. Không gọi lưu đơn thật, không sửa kho
  thật. Frontend syntax, prescription stock và user feedback contracts đạt.

## Seed kiểm thử local đã áp dụng (2026-09-06)

Theo yêu cầu explicit của người dùng, 25 thuốc tồn dương thiếu lô đã được gán lô `SEED-LOCAL-20260906-<id>`, giữ nguyên tồn tổng và ghi movement delta 0. Đây là ngoại lệ seed kiểm thử được yêu cầu riêng: số lô là giả lập; 23 hạn dùng giả lập một năm, 2 hạn dùng lấy từ danh mục chưa đối chiếu chứng từ. Không dùng dữ liệu seed như lô thực tế hoặc tự mở rộng quy tắc này cho nhập kho. Service vẫn không tự sinh giá trị mặc định.

Đã sao lưu database, kiểm chứng cấp thêm 6 viên Mirtazapine mã 7485 trong transaction rollback: tồn/lô 1460 → 1454 → rollback về 1460. Hai thuốc cũ không bị trừ thêm; đơn 1101 chưa được lưu lại. Còn 13 mã lệch tồn (gồm 1 mã chỉ còn lô hết hạn) cần đối soát riêng. Chi tiết: `reports/inventory-local-seed-20260906-131835/README.md`.

## Ownership

Context chung các sửa UI22/09 (Tủ thuốc/Nhập kho/DAV, QA và giới hạn)
đã hợp nhất tại mục “Context chung đang tiếp tục — 22/09/2026” trong
`references/refactor-progress.md`. Không ghi nhật ký từng phản hồi ở đây.

Chốt UI21/09: bỏ riêng disclosure “Tồn sau từng giao dịch” trong ô thuốc
màn kê đơn. Giữ nguyên “Tồn tổng hiện tại”, tên lô và “Đã cấp”. Snapshot,
API, giao dịch kho và bảng lịch sử/thống kê không đổi.

Follow-up 20/09: thêm một cột nullable `stock_balance_after` sau 5 cột truy vết
đã có; không thêm bảng/backfill/đối soát. `balance_after` = tồn của lần nhập/lô
ngay sau giao dịch; cột mới = tồn tổng ngay sau giao dịch. Đọc/Lưu trả
`batch_allocation.stock_movements` / `stock_allocation_states[].stock_movements`.
Editor tách “Tồn tổng hiện tại” và chi tiết “Tồn sau từng giao dịch”; lịch sử
đơn và thống kê có hai cột tồn lịch sử. Thiếu snapshot hiển thị “Chưa rõ”.
QA và giới hạn UI: `reports/stock-balance-snapshot-2026-09-20/qa.md`.

Từ 2026-09-10, mỗi batch ID là một lần nhập/tồn đầu riêng, nên nhiều ID có
thể cùng số lô. FEFO vẫn hạn dùng → ngày nhập → ID; hoàn trả đúng ID đã cấp.
Giao dịch mới ghi giá vốn từ lần nhập và `balance_after`; thiếu giá giữ null,
không ghi 0 mặc định. Không tính lại giá vốn hoặc tồn sau cho movement cũ.
Việc Lưu đơn vẫn là thời điểm xuất kho; chưa bổ sung bước xác nhận bốc thuốc
thực tế hoặc nối thanh toán trong lát Tủ thuốc này.

User chốt ngày 2026-09-12: một thuốc bốc từ một số lô trên bao bì, có thể
gồm nhiều lần nhập của cùng lô, giữ giá vốn từng lần nhập. Đây là yêu cầu
đích chưa triển khai: FEFO hiện vẫn có thể cấp từ nhiều số lô khi lưu đơn.

- `prescriptions`: header đơn thuốc, mã đơn, loại đơn, metadata cách tính liều/số ngày trong cột legacy `cach_dung`, ngày tái khám và tổng tiền.
- `prescription_items`: từng dòng thuốc và là owner duy nhất của số lượng hiện đang lưu/cấp theo appointment.
- `medicine_batches.remaining_quantity`: tồn hiện hành của từng lô; lô còn hạn được cấp theo FEFO.
- `medicines.stock_quantity`: tồn tổng hiện hành dùng bởi các màn kho khác. Cấp/hoàn có truy vết cập nhật cùng đúng delta với lô; hoàn phần đơn cũ không có lô chỉ cập nhật tồn tổng.
- Nhập lô/gán tồn đầu đã xác minh thuộc owner `app/modules/medicines/services/inventory_service.py`; đường kiểm kê thủ công đã gỡ. Không sửa `medicines.stock_quantity` trực tiếp từ danh mục hoặc ledger API.
- `medicine_transactions`: append-only; từ 2026-09-20 thêm đúng 5 cột theo mục Visit medication ledger trong `references/data-contracts.md`, không thêm bảng. `ledger_service.py` ghi snapshot cấp/hoàn/đổi giá cùng transaction Lưu; `ledger_report.py` đọc thống kê tiền theo ngày giao dịch. Dòng mới nối appointment trực tiếp; note chính xác chỉ fallback cho dòng cũ. Không suy giá/lô cũ, không thay owner số lượng đơn/tồn lô. Hoàn hết vẫn đọc lịch sử được; đơn giá khác nhau trên hai dòng cùng thuốc trong một lần lưu bị từ chối.
- `examinations.diagnosis`: chẩn đoán raw theo ICD IDs trong flow mới.
- `appointment_relatives`: người đi cùng lượt khám và liên hệ/người đưa trẻ; không xác nhận ai nhận thuốc.
- `patients`: thông tin định danh, liên hệ, ngày sinh, giới tính, địa chỉ.

## Module Island Hiện Tại

- `app/modules/prescriptions/api/public.py`: public routes cho QR verify, gồm page/API dữ liệu và endpoint PNG sinh QR xác thực cùng domain; QR không phụ thuộc dịch vụ ảnh bên thứ ba.
- `app/modules/prescriptions/api/internal.py`: internal routes cho màn bác sĩ và prescription save/load/history; route đọc/history gọi service thay vì tự build payload.
- `app/modules/prescriptions/services/read_service.py`: owner cho payload đọc đơn theo appointment và lịch sử đơn thuốc theo patient.
- Contract đọc tái khám: dùng lịch con theo `original_appointment_id` + `RE_EXAMINATION`, chọn theo `created_at DESC, id DESC`, không theo ngày hẹn có thể sửa. Giữ cả `CANCELLED`/soft-delete để không nhầm lịch đã hủy thành chưa có lịch. `prescriptions.re_examination_date` chỉ là ngày legacy, không chứng minh đã có appointment. Reader/save trả `re_examination_snapshot`: appointment_id, datetime, status, version (updated_at), editable, lock_reason và selection (doctor_id, service_id, package_id).
- Contract quyền sửa: chỉ `SCHEDULED`, chưa soft-delete, và giờ hẹn đang lưu > giờ hiện tại mới được sửa/hủy tại Doctor. `CONFIRMED`, `NO_SHOW`, `CANCELLED`, hoặc lịch đến/quá giờ đều khóa. Giữ nguyên lịch vẫn được lưu thuốc, không kiểm tra lại ngày tương lai hay gọi Calendar/reminder. Thay đổi lịch phải có snapshot đã tải; backend đối chiếu identity/version/status hiện tại. Lịch thay đổi ở nơi khác trả 409 kèm snapshot mới; UI báo tại vùng tái khám. Request lặp có cùng kết quả lịch là no-op.
- Mặc định tạo lịch mới (chốt 06/09/2026): bác sĩ mặc định lấy từ `user.id` đã xác thực ở API, không kế thừa bác sĩ lượt cũ. Từ 07/09, dropdown cho phép đổi qua `re_examination_selection` sau khi backend kiểm danh mục/bác sĩ đang hoạt động; trường doctor_id/service_id rời ngoài contract này vẫn không được dùng. Dịch vụ là đúng một dòng `services` đang hoạt động có tên Khám tổng quát (so sánh trim/case-insensitive); lấy ID và thời lượng thực từ danh mục, không hardcode ID. Thiếu/trùng dịch vụ mặc định thì trả lỗi tại vùng tái khám trước khi ghi. Không tự seed danh mục hoặc lấy dịch vụ đầu tiên của lượt hiện tại.
- Mặc định trên chỉ áp dụng khi `action=create`. Khi chỉ sửa ngày giờ lịch đã có, giữ nguyên bác sĩ, dịch vụ/gói của appointment và examination hiện hữu; khi chủ động đổi dropdown, cập nhật cả hai trong cùng transaction; không yêu cầu danh mục mặc định còn hoạt động để sửa lịch cũ. Đơn thuốc trống vẫn tạo lịch/examination bình thường, không tạo prescription header giả.
- Nút Lưu chung vẫn lưu thuốc và lịch. Frontend gửi ngày giờ + snapshot; không tự dời lịch đã có khi đổi số ngày điều trị. Khóa checkbox/datepicker theo policy, bảo toàn status thật (không đổi thành ERROR), clear snapshot/error khi chuyển bệnh nhân. Lịch chưa có được tạo khi người dùng thay đổi chọn đặt lịch/ngày giờ; ngày legacy giữ nguyên không tự sinh lịch mới.

- Contract tính ngày Doctor: khi bật `Đặt lịch`, ngày giờ mặc định được tính từ ngày local hiện tại cộng đúng số nguyên không âm ở `Số ngày điều trị`, giờ mặc định `09:00`; không fallback ngầm sang 7 ngày. Giá trị trống/không hợp lệ không tự sinh ngày và validation vẫn yêu cầu ngày trước khi lưu.
- Contract overview Doctor: không còn control `Cách dùng chung`; hướng dẫn từng thuốc thuộc `prescription_items.usage`. Ba control `Cách tính liều`, `Số ngày điều trị`, `Hẹn tái khám` nằm cùng một hàng khi prescription component đủ rộng, reflow thành hai hàng rồi một cột theo container. `prescriptions.cach_dung` vẫn giữ JSON `schedule_mode`/`medicine_days`; giá trị `global_usage` cũ được frontend bảo toàn khi save nhưng không còn tham gia draft/focus hoặc được nhập mới.
- Contract tính số lượng Doctor: `Số ngày điều trị` trống không chặn tính toán; các thao tác chủ động chọn thuốc, sửa liều, đổi cách tính hoặc xóa số ngày dùng hệ số 1 ngày để cập nhật ngay số lượng và thành tiền. Nhập `N` ngày sẽ tính lại theo `liều mỗi ngày × N`; xóa `N` quay về liều của 1 ngày. Riêng lần tải đơn cũ, khôi phục nháp hoặc áp dụng đơn lịch sử có `medicine_days` trống phải giữ `prescription_items.quantity` đã lưu, không tự biến đổi dữ liệu trước khi bác sĩ chỉnh công thức.
- `app/modules/prescriptions/services/save_service.py`: owner transaction của save path. Service khóa row `appointments`, đọc baseline duy nhất từ `prescription_items`, gom payload theo `medicine_id`, gọi batch stock owner theo thứ tự medicine id, tạo/update/xóa header/items rồi tự commit hoặc rollback toàn bộ. Route auth/parse, gọi plan tái khám khóa appointment gốc + lịch con, validate trước khi ghi đơn; save service ghi đơn/kho/lịch/examination trong cùng transaction. Chỉ realtime/Calendar/reminder chạy sau commit.
- `app/modules/prescriptions/services/stock_service.py`: owner cấp/hoàn kho cho prescription. Service khóa `medicines` rồi các `medicine_batches` theo thứ tự ổn định; cấp mới bị giới hạn bởi cả tồn tổng và lô còn hạn, cấp lô theo FEFO, hoàn phần đã truy vết về đúng lô theo reverse-FEFO, hoàn phần legacy chỉ về tồn tổng, append movement bằng mẫu note appointment hiện hữu, và build allocation state cho API/UI.
- `app/modules/prescriptions/services/re_examination_service.py`: owner policy đọc/plan/apply lịch tái khám của Doctor. `plan_re_examination` khóa gốc và lịch con, xác định unchanged/create/update/cancel; `apply_re_examination_plan` chỉ flush. `save_service` commit/rollback đơn, kho, lô, movement, lịch và examination cùng nhau. Hàm `sync_re_examination_after_prescription_save` chỉ còn integrations sau commit, gọi owner Calendar dùng chung; unchanged bỏ qua toàn bộ. Các màn đặt lịch khác giữ workflow riêng, không thay đổi API của Lễ tân trong đợt này.
- `app/modules/prescriptions/view_models/public_prescription.py`: view model public prescription verify.
- `app/modules/prescriptions/view_models/print_prescription.py`: internal view model cho print/preview đơn thuốc theo appointment, gom patient/history/examinationDetail/examinationDetailsBySection/prescriptionData/relatives bằng contract backend, trong đó diagnosis/benh_kem_theo là display text và `*_ids` giữ raw ICD IDs.
- `app/modules/prescriptions/public_api.py` và `app/modules/prescriptions/view_model.py`: wrapper tương thích cho import path cũ, không đặt logic mới ở đây.
- Shim `app/api/prescription.py` đã xóa ngày26/09/2026 vì không còn importer; `main.py` đăng ký internal API trực tiếp từ module path mới.
- `app/templates/verify-prescription.html`: template verify hiện còn ở thư mục Jinja hiện tại để giữ path ổn định.
- `app/static/css/prescriptions/pages/verify-prescription.css`: CSS riêng của page QR verify, tách khỏi inline template.
- `app/static/js/prescriptions/pages/verify-prescription.js`: page bootstrap cho QR verify, chỉ fetch public API và gọi renderer dùng chung.
- `app/static/js/prescriptions/pages/doctor-prescription-print.js`: adapter dữ liệu in từ màn bác sĩ; nhận dependency từ `prescription-ui.js` qua factory để giữ appointment hiện tại và `prescriptionCodesByType` không bị global hóa, sau đó giao tài liệu cho component in dùng chung.
- `app/static/js/prescriptions/components/prescription-modal-preview.js`: preview/tab đơn thuốc trong modal lịch sử bệnh nhân; giữ expose `window.renderPrescriptionPage`, `window.setupPrescriptionTabPagination`, `window.PRESCRIPTION_PAGE_COLORS` và `_prescriptionTabPageIndex` cho caller cũ.
- `app/static/css/patient-search-modal.css`: owner modal/scroll và tài liệu khác; import prescription-standard-form.css cho đơn thuốc, không sở hữu lại layout giấy.
- `app/static/js/prescriptions/components/prescription-modal-print.js`: adapter dữ liệu in từ modal lịch sử legacy; đọc modal state qua `window.modalSelectedPatient`, `window.modalMedicalHistoryData`, `window.modalSelectedHistoryIndex`, giao tài liệu cho component in dùng chung và giữ expose `window.printModalPrescription` cho caller cũ.
- `app/static/js/prescriptions/components/prescription-print-document.js`: owner dựng HTML mẫu giấy theo nhóm BASIC/H/N; `render()` async gọi QLPKPdfPreview tạo PDF. Worker đợi font/ảnh, render barcode local và từ chối PDF khi thiếu QR bắt buộc. Không tự in hoặc tự đóng tab.
- `app/static/css/prescriptions/components/prescription-print-document.css`: shell A4, lề trên/phải/dưới 20mm, trái 30mm; loại đơn sau bắt đầu trang mới. Layout giấy do prescription-standard-form.css sở hữu: Times New Roman 12pt, khung đen trắng với đệm 4mm, QR 25mm; nội dung normal flow, nhóm thuốc cuối/lời dặn/ký/liên hệ/người nhận tránh tách trang.
- `app/static/js/prescriptions/components/prescription-preview-scaler.js`: component scale document preview cho viewer mobile/verify.
- `app/static/js/prescriptions/shared/prescription-document-template.js`: sở hữu shared view-model/formatter cùng hai renderer: `buildPrescriptionPreviewHTML()` cho giấy/public verify và `buildPrescriptionScreenHTML()` cho tab Toa thuốc trên web. Modal gọi renderer web qua registry; print controller giữ renderer giấy. CSS web riêng `prescription-screen.css` không được load vào tài liệu in. Ảnh QR bản in dùng `GET /api/public/prescription/<code>/verification-qr.png` và được đánh dấu `data-required-print-asset="verification-qr"`.
- `scripts/check_prescription_print_contract.py`: kiểm A4, stylesheet dùng chung, normal flow, footer, QR cùng domain và readiness. Không tự đóng popup tại afterprint vì Chrome còn mở hộp thoại lưu PDF.

## Mẫu Bộ Y tế (2026-09-09)

- Chuẩn: Phụ lục I/II/III, Thông tư 26/2025/TT-BYT, PDF chính thức
  https://datafiles.chinhphu.vn/cpp/files/vbpq/2025/7/26-byt.pdf, trang 12–14.
  Cập nhật 10/09/2026 theo yêu cầu người dùng: nhãn hiển thị lấy nguyên văn
  `Đơn H.docx` (Căn cước công dân, Số thẻ bảo hiểm y tế (nếu có), Địa chỉ
  liên hệ, Tên bố hoặc mẹ của trẻ hoặc người đưa trẻ đến khám bệnh, chữa bệnh,
  Căn cước công dân của người nhận thuốc; câu “Khám lại xin mang theo đơn này.”).
  H có dòng Đợt trống như Word; N giữ ba dòng Đợt. Vì vậy không mô tả bản này
  là bản sao nguyên văn phụ lục chính thức. Số chú thích không thuộc nhãn in.
- Giữ mã đơn/QR, nhãn tiếng Việt; bỏ logo/quảng bá/song ngữ/barcode hồ sơ.
  Không in tiêu đề phụ lục hoặc phần hướng dẫn điền mẫu của văn bản pháp quy.
- Trẻ dưới 72 tháng tính tuổi tháng tại ngày khám, in cân nặng/người đưa trẻ.
  Dòng người nhận H/N độc lập tuổi; không suy người đi cùng là người nhận.
- BHYT, người nhận thuốc và khoảng ngày từng đợt H/N chưa có nguồn lưu riêng:
  để trống trên giấy, không suy ngày từ tái khám hay cập nhật dữ liệu.
  Kiểm điều kiện thuốc/cấp ba bản H/N/cam kết N không thuộc lát mẫu giấy này.
- Số lượng <10 có 0 đầu; N thêm số lượng bằng chữ. Giữ quantity/schedule,
  route/ghi chú/medicine_days đã lưu; thiếu schedule không tự sinh liều.
- Public view model thêm weight, loi_dan, benh_kem_theo từ examination;
  verify dùng cùng template, vẫn ẩn QR/chữ ký theo contract public hiện hữu.
- Chain: modal flex/min-height:0 → tab-body-scroll → content → tài liệu;
  verify viewer 800px → scaler; print A4 → pages 160mm → form → thuốc →
  nhóm ký/liên hệ/người nhận. Không ép chiều cao toàn trang hay ghim footer.
- Cập nhật bố cục 10/09: field trống dùng dòng kẻ chấm co giãn cao 6mm;
  cân nặng có vùng viết riêng, BHYT/người đưa trẻ/người nhận dùng hết bề ngang
  còn lại; chữ ký dành 25mm. Không thay nhãn Word hay giá trị đã lưu.
  Hàm lượng đầy đủ đã có trong tên không nối lại; chỉ gộp số cuối với đơn vị
  khi tên đúng bằng hoạt chất + số đó. Giữ nguyên mọi ghi chú cách dùng.
- QA bố cục 10/09: Node standard-form/followup, frontend gate; Chrome PDF
  ca ảnh 1101 một trang, H/N thật mỗi mẫu một trang; ca 442 sáu thuốc hai
  trang; N QA 24 thuốc bốn trang, đủ thứ tự và thuốc cuối cùng trang với ký.
  Đã render/đọc toàn bộ 10 trang của 6 ca; DB QA chỉ đọc. Không ép đơn dài
  về một trang bằng cách giảm chữ hay rút ngắn nội dung.

## Ghi chú cách dùng thuốc

- `app/static/js/prescriptions/shared/prescription-dose-utils.js`
  (`window.PrescriptionDoseUtils`) là owner duy nhất parse/format liều, lịch
  dùng và JSON `usage` (`parseDose`, `formatDose`, `normalizeSchedule`,
  `parseUsage`, usage/note modes). Doctor, Tâm lý gia và trang verify QR đều
  nạp file này trước `prescription-document-template.js`; các global cũ của
  template (`parseFractionalQuantity`, `formatDoseAsFraction`,
  `normalizeScheduleData`, `parseMedicineUsagePayload`) chỉ ủy quyền với mode
  mặc định lần/ngày, và `patient-search-modal-dry.js` lấy `USAGE_MODES` từ đây.
- `app/static/js/doctor-examination/prescription-model.js` sở hữu generator
  `buildMedicineUsageNote()` và hai mode lịch dùng: theo buổi hoặc theo
  lần/ngày; phần parse liều/lịch dùng ủy quyền cho `PrescriptionDoseUtils`.
- Màn Bác sĩ tách hai owner thuần khỏi `prescription-ui.js`:
  `prescription-reexam-ui.js` (registry `prescriptionReExam`: quy tắc khóa,
  thay đổi và nhãn badge/nút tái khám) và
  `prescription-medicine-search-ui.js` (registry `prescriptionMedicineSearch`:
  dropdown tìm thuốc trong kho, debounce, phím mũi tên, vị trí). State, lưu và
  áp thuốc vào dòng vẫn chỉ thuộc `prescription-ui.js`.
- `app/static/js/doctor-examination/prescription-ui.js` gọi generator khi
  thay đổi liều, số ngày, đường dùng, đơn vị hoặc mode; `usageNoteMode` bảo vệ
  ghi chú bác sĩ nhập tay khỏi bị ghi đè.
- `prescription_items.usage` vẫn là JSONB hiện hữu. `note_mode` chỉ là khóa bổ
  sung trong JSON để phân biệt `generated`/`manual`; không tạo field DB mới và
  không thay đổi contract lưu đơn thuốc.
- Ghi chú legacy có text nhưng chưa có `note_mode` được coi là `manual` để
  bảo toàn dữ liệu; việc tái sinh hàng loạt legacy note là migration riêng,
  chưa thực hiện.
- Số lượng cấp thuốc mới luôn là số nguyên làm tròn lên trước khi tính tiền,
  kiểm tồn, trừ tồn và ghi `prescription_items`; liều lẻ chỉ tồn tại trong
  lịch dùng/ghi chú. Các đơn cũ có số lẻ không bị migration tự động.
- Ngày điều trị trống có hiệu lực tính toán là 1 ngày cho thao tác đang nhập,
  nên số lượng/tổng tiền không được đứng ở 0 chỉ vì chưa nhập số ngày. Guard
  bảo toàn số lượng cũ chỉ áp dụng ở lần load/restore/reuse ban đầu; ngay khi
  bác sĩ chọn thuốc, sửa liều, đổi mode hoặc sửa số ngày thì công thức hiện
  hành trở thành owner của số lượng hiển thị.
- Cutover tồn kho dùng `prescription_items` hiện hữu làm baseline đã phản ánh
  trong `medicines.stock_quantity`; không tự điều chỉnh tồn hoặc backfill
  `appointment_id` cho audit cũ. Đơn legacy phòng khám thiếu `medicine_id` bị
  chặn lưu và yêu cầu map lại, tuyệt đối không đoán theo tên.
- Cutover theo lô không backfill hoặc suy đoán lô cho đơn cũ. Save không đổi số
  lượng (`delta = 0`) vẫn được phép. Khi giảm/xóa, phần có movement gắn lô được
  hoàn đúng lô theo reverse-FEFO; phần legacy còn lại chỉ cộng vào tồn tổng và
  ghi movement hoàn với `batch_id=NULL`, tuyệt đối không tự chọn một lô.
- Không bắt tồn tổng phải bằng tổng `remaining_quantity` theo lô vì đơn cũ có
  thể đã trừ tồn tổng mà chưa trừ lô. Cấp mới chỉ được lấy tối đa bằng giá trị
  nhỏ hơn giữa tồn tổng và tổng lô còn hạn, nhờ đó giữ nguyên độ lệch lịch sử,
  không tự đối soát và vẫn không thể cấp vượt kho.
- `GET /api/prescription/appointment/<id>` gắn `batch_allocation` vào từng thuốc;
  save response trả `stock_updates` (movement của lần lưu) và
  `stock_allocation_states` (phân bổ hiện hành). Doctor hiển thị trực tiếp mỗi
  lô đã cấp thành một block xanh riêng gồm số lô và số đã cấp. Số còn lại của
  Doctor luôn hiển thị đúng một dòng `Tồn kho` lấy từ tồn tổng dưới mỗi thuốc
  trong kho. Block lô chỉ hiển thị số lô và số đã cấp; không có dòng tồn thứ hai,
  không có dòng tóm tắt `Đã cấp đủ`, nút mở/thu gọn hoặc nhãn kỹ thuật cho đơn
  cũ/không truy vết đủ. Màu cam chỉ báo thay đổi của đơn mới hoặc đơn đã truy
  vết đang chờ lưu. Backend vẫn giữ chi tiết kiểm tồn để đối soát, nhưng Doctor
  không đổ chi tiết kỹ thuật vào toast; lỗi thiếu tồn chỉ hiện
  `Không đủ thuốc trong kho. Vui lòng kiểm tra số lượng đã kê và tồn kho.`
- Dòng thuốc trong cơ sở luôn hiển thị ngắn `Tồn kho: N đơn vị` từ
  `current_stock_quantity`/catalog stock; thuốc ngoài cơ sở không hiển thị tồn.
  Dòng tồn không bị thay bằng trạng thái chờ cập nhật phân bổ lô khi bác sĩ sửa
  liều.
- Đơn vị thuốc nằm ngay trong ô `Số lượng`. Thuốc trong kho dùng đơn vị từ
  catalog và chỉ đọc; thuốc ngoài cho phép sửa đơn vị tại chính ô này. Doctor
  không lặp lại `Dạng thuốc` hay nhãn mặc định `Trong kho`; chỉ hiện ngoại lệ
  `Thuốc ngoài` trong metadata của dòng thuốc ngoài cơ sở. Payload và owner dữ
  liệu `prescription_items.unit` không đổi.

## Mapping Phase 5

- Cũ: `app/modules/prescriptions/public_api.py` -> Mới: `app/modules/prescriptions/api/public.py`.
- Cũ: `app/modules/prescriptions/view_model.py` -> Mới: `app/modules/prescriptions/view_models/public_prescription.py`.
- Cũ: `app/api/prescription.py` -> Mới: `app/modules/prescriptions/api/internal.py`.
- Đọc/history tách từ `app/modules/prescriptions/api/internal.py` -> `app/modules/prescriptions/services/read_service.py`.
- Save helper/header sync/stock transaction/prescription item creation tách từ `app/modules/prescriptions/api/internal.py` -> `app/modules/prescriptions/services/save_service.py`.
- Side effects tái khám sau khi lưu đơn tách từ `app/modules/prescriptions/api/internal.py` -> `app/modules/prescriptions/services/re_examination_service.py`.
- Print/preview view model nội bộ thêm tại `app/modules/prescriptions/view_models/print_prescription.py`, endpoint mới `GET /api/prescription/appointment/<appointment_id>/print-view-model`.
- Orchestration in đơn thuốc từ form bác sĩ tách từ `app/static/js/doctor-examination.js` -> `app/static/js/prescriptions/pages/doctor-prescription-print.js`; `doctor-examination.js` chỉ giữ bridge `preparePrescriptionDataForPrint()` và `printMainPrescription()` cho caller cũ.
- Preview/tab đơn thuốc trong modal lịch sử tách từ `app/static/js/patient-search-modal-dry.js` -> `app/static/js/prescriptions/components/prescription-modal-preview.js`; `patient-search-modal-dry.js` chỉ giữ bridge `renderPrescriptionPage()` và `setupPrescriptionTabPagination()` cho caller cũ.
- Orchestration in đơn thuốc từ modal lịch sử tách từ `app/static/js/patient-search-modal-dry.js` -> `app/static/js/prescriptions/components/prescription-modal-print.js`; `patient-search-modal-dry.js` chỉ giữ bridge `printModalPrescription()` cho caller lexical cũ trong `printModalTabContent()`.
- Shared document template dời từ `app/static/js/shared-prescription-template.js` -> `app/static/js/prescriptions/shared/prescription-document-template.js`; template include runtime đã cập nhật ở verify, doctor và psychologist screens.
- URL page/data giữ nguyên: `GET /verify/rx/<prescription_code>` và `GET /api/public/prescription/<prescription_code>`.
- URL QR ảnh cùng domain: `GET /api/public/prescription/<prescription_code>/verification-qr.png`.
- URL internal giữ nguyên dưới prefix `/api/prescription/...`.
- Template verify vẫn giữ ở `app/templates/verify-prescription.html`; CSS/JS page verify, orchestration doctor print và shared document template đã tách sang `app/static/.../prescriptions/...`.

Smoke thực tế 2026-05-30: user đã test lưu đơn/tái khám sau khi tách `re_examination_service.py` và xác nhận hoạt động đúng.

Smoke thực tế 2026-05-30: user đã test lát print/preview view model nội bộ và xác nhận đạt.

Smoke thực tế 2026-05-30: user đã test lát tách frontend verify CSS/JS/component và xác nhận ổn.

Ghi chú triển khai 2026-05-30: tách orchestration in đơn thuốc từ màn bác sĩ sang `app/static/js/prescriptions/pages/doctor-prescription-print.js`. `doctor-examination.js` vẫn giữ wrapper tên hàm cũ để nút `printPrescriptionBtn` và caller legacy không đổi; load order trong `doctor-examination.html` đặt file mới sau `patient-search-modal-dry.js` và trước `doctor-examination.js`.

Smoke thực tế 2026-05-30: user đã test luồng in đơn thuốc bác sĩ sau khi tách `doctor-prescription-print.js` và xác nhận có vẻ ổn.

Ghi chú triển khai 2026-05-30: dời shared document template sang `app/static/js/prescriptions/shared/prescription-document-template.js`; chỉ đổi static path, không đổi logic render hoặc tên helper global legacy.

Validation thực tế 2026-05-30: static asset shared mới trả `200`, verify page/màn bác sĩ/màn tâm lý render `200` và HTML runtime đều trỏ sang path mới; public prescription API mã `798362405010-N` trả diagnosis text và `diagnosis_ids` đúng contract.

Ghi chú triển khai 2026-05-30: tách `printModalPrescription()` sang `app/static/js/prescriptions/components/prescription-modal-print.js`; `patient-search-modal-dry.js` giữ bridge để `printModalTabContent('prescription-content')` không đổi.

Validation thực tế 2026-05-30: `node --check` qua cho component modal print mới và các JS prescription/doctor/psychologist liên quan; static asset `/static/js/prescriptions/components/prescription-modal-print.js` trả `200`; doctor/psychologist/verify pages render `200`; HTML runtime load component modal print sau `patient-search-modal-dry.js` và trước page script.

Smoke thực tế 2026-05-30: user đã test lát `prescription-modal-print.js` và xác nhận in đơn từ modal lịch sử ổn.

Ghi chú triển khai 2026-05-30: tách preview/tab đơn thuốc trong modal lịch sử sang `app/static/js/prescriptions/components/prescription-modal-preview.js`; `patient-search-modal-dry.js` giữ bridge cho `renderPrescriptionPage()` và `setupPrescriptionTabPagination()`.

Validation thực tế 2026-05-30: `node --check` qua cho component modal preview mới và các JS prescription/doctor/psychologist liên quan; static asset `/static/js/prescriptions/components/prescription-modal-preview.js` trả `200`; doctor/psychologist/verify pages render `200`; HTML runtime load modal preview sau `patient-search-modal-dry.js` và trước modal print/page script; public prescription API mã `798362405010-N` vẫn trả diagnosis text và `diagnosis_ids` đúng contract.

Smoke thực tế 2026-05-30: user đã test lát `prescription-modal-preview.js`; preview tab đơn thuốc và luồng liên quan hoạt động như trước, xác nhận code mới đang được load qua `printModalPrescriptionFromComponent` và `renderPrescriptionPageFromComponent`.

Ghi chú triển khai 2026-08-12: chuẩn hóa `PrescriptionPrintDocument` làm owner in đơn thuốc dùng chung. Nút `In đơn` trên Doctor, `.tab-print-btn` trong modal lịch sử Doctor và modal đơn thuốc legacy đều chỉ còn là adapter dữ liệu; không còn tự dựng print window, tự gắn barcode hoặc giữ stylesheet A4 riêng. Modal lịch sử Doctor dựng lại tài liệu bằng `paginationOptions` ở `renderContext="print"`, không clone HTML preview màn hình. Logic dữ liệu hiện tại/chưa lưu của Doctor và dữ liệu lịch sử đã lưu vẫn tách đúng boundary.

## Frontend Boundary Còn Lại

- `app/static/js/patient-search-modal-dry.js` vẫn giữ bridge cho prescription để tương thích với caller cũ, nhưng implementation chính của document template, verify page, doctor print, modal print và modal preview đã thuộc `app/static/js/prescriptions/`.
- Chưa nên tách các fetch helper như `fetchPatientDetailForPrescription`, `fetchExaminationDetailForPrescription`, `fetchPrescriptionDataForAppointment` trong một lát nhỏ vì chúng đang phục vụ cả đơn thuốc, dịch vụ và bệnh án.
- Chưa nên tách usage/schedule formatter khỏi doctor/psychologist ngay nếu chưa đi theo một lát riêng có kiểm tra prescription form, vì nhóm helper này đang dính trực tiếp tới nhập đơn thuốc, preview lịch sử và shared document template.
- Lát tiếp theo nên chuyển sang đánh giá module island tiếp theo hoặc một contract backend rõ ràng, thay vì tiếp tục bóc frontend prescription khi phần còn lại đã bắt đầu cross-cutting.

## Public Verify Contract

- URL page giữ nguyên: `GET /verify/rx/<prescription_code>`.
- URL API giữ nguyên: `GET /api/public/prescription/<prescription_code>`.
- URL ảnh QR: `GET /api/public/prescription/<prescription_code>/verification-qr.png`; trả PNG chỉ chứa URL verify công khai, không nhúng dữ liệu bệnh nhân vào QR.
- API public không yêu cầu auth vì QR verify là public by design.
- `diagnosis` là display text đã resolve ICD.
- `diagnosis_ids` giữ raw ICD IDs.
- `relatives` phải trả danh sách người đi cùng nếu appointment có dữ liệu.
- Không trả raw ICD ID làm text hiển thị.

## Render Context Contract

- Từ 08/09/2026, `show_re_examination_date` do backend tính qua
  `show_re_examination_date_on_prescription`: false khi lịch con mới nhất đã
  CANCELLED hoặc xóa mềm. Template dùng chung ẩn dòng Tái khám ngày trong
  print/preview/verify; adapter modal/verify giữ cờ, Doctor giữ cờ từ payload
  backend khi ghép thuốc/ngày đang nhập. Ngày lịch sử, snapshot và logic lưu
  vẫn giữ nguyên; không có lịch con thì ngày legacy vẫn được hiển thị.
- Web/in là document layout chuẩn.
- Verify/mobile là viewer, không được phá layout document.
- Verify mobile scale toàn bộ biểu mẫu Bộ Y tế; không đổi thứ tự field hoặc các cột tên thuốc/số lượng.
- Verify có thể ẩn QR nội bộ/chữ ký của bản in bằng options, nhưng không đổi cấu trúc mẫu.
- Từ 09/09/2026, HTML modal và A4 dùng chung prescription-standard-form.css, QR 25mm; prescription-print-document.css chỉ giữ shell/lề A4. Không sửa độ phân giải ảnh nguồn để chữa layout.
- Shared template phải giữ default tương thích với caller cũ.
- `buildPrescriptionDocumentViewModel()` trong shared template là lớp normalize frontend cuối cùng: không để raw numeric ICD ID hiển thị thành chẩn đoán nếu backend/caller đưa nhầm raw value.
- Page verify không được tự render mẫu đơn lớn; chỉ fetch public API, gọi `buildPrescriptionPreviewHTML()` và dùng `prescription-preview-scaler.js` để scale viewer.

## Validation

Khi sửa workflow này, chạy checklist `Prescription Print And Verify` trong `references/smoke-checks.md`.

Tối thiểu:

- `python3 -m py_compile main.py app/modules/prescriptions/api/public.py app/modules/prescriptions/api/internal.py app/modules/prescriptions/services/read_service.py app/modules/prescriptions/services/save_service.py app/modules/prescriptions/services/stock_service.py app/modules/prescriptions/services/re_examination_service.py app/modules/prescriptions/view_models/public_prescription.py app/modules/prescriptions/view_models/print_prescription.py app/modules/prescriptions/public_api.py app/modules/prescriptions/view_model.py`
- `python3 scripts/check_prescription_stock_contract.py`
- `python3 scripts/qa_prescription_stock_concurrency.py --run` trên DB QA/local: script tạo dữ liệu tạm, dùng session PostgreSQL độc lập cho race condition và luôn cleanup trong `finally`.
- `node --check app/static/js/doctor-examination/prescription-row-renderer.js app/static/js/doctor-examination/prescription-ui.js app/static/js/doctor-examination/support-modules-ui.js app/static/js/doctor-examination/workspace-save-controller.js`
- `node --check app/static/js/prescriptions/shared/prescription-document-template.js app/static/js/patient-search-modal-dry.js app/static/js/doctor-examination.js app/static/js/psychologist-examination.js app/static/js/prescriptions/pages/verify-prescription.js app/static/js/prescriptions/pages/doctor-prescription-print.js app/static/js/prescriptions/components/prescription-modal-preview.js app/static/js/prescriptions/components/prescription-modal-print.js app/static/js/prescriptions/components/prescription-print-document.js app/static/js/prescriptions/components/prescription-preview-scaler.js`
- `GET /api/public/prescription/<code>` hợp lệ và mã không tồn tại.
- `GET /api/public/prescription/<code>/verification-qr.png` trả `200 image/png` với mã hợp lệ, giải mã về đúng `/verify/rx/<code>`; mã không tồn tại trả `404`.
- Browser modal Toa thuốc với đơn ngắn, đơn dày và history chưa có đơn: QR hợp lệ hiển thị 130x130 dù PNG tự nhiên lớn hơn; không có ảnh lỗi hoặc overflow ngang; trạng thái chưa có đơn không dựng QR.
- `GET /verify/rx/<code>` trong browser, kiểm console và mobile viewport nếu đụng layout.
- Static assets verify mới trả `200`: `/static/css/prescriptions/pages/verify-prescription.css`, `/static/js/prescriptions/pages/verify-prescription.js`, `/static/js/prescriptions/components/prescription-preview-scaler.js`.
- Static asset doctor print mới trả `200`: `/static/js/prescriptions/pages/doctor-prescription-print.js`.
- Static asset modal preview mới trả `200`: `/static/js/prescriptions/components/prescription-modal-preview.js`.
- Static asset modal print mới trả `200`: `/static/js/prescriptions/components/prescription-modal-print.js`.
- Static assets print document dùng chung trả `200`: `/static/js/prescriptions/components/prescription-print-document.js`, `/static/css/prescriptions/components/prescription-print-document.css`.
- Static asset shared document template mới trả `200`: `/static/js/prescriptions/shared/prescription-document-template.js`.
- `GET /api/prescription/appointment/<appointment_id>/print-view-model` trong phiên đăng nhập trả diagnosis display text và `diagnosis_ids` raw IDs.

Lịch sử bugfix 2026-05-31: appointment gốc có lịch tái khám con nhưng chưa có prescription header từng làm block “Hẹn tái khám” không populate lại trong màn bác sĩ. `read_service.py` trả lịch tái khám active từ `appointments.original_appointment_id` trước, fallback về `prescriptions.re_examination_date` khi chưa có appointment con; trước đây `doctor-examination.js` và `reexam-calendar.js` cùng giữ metadata dịch vụ. `reexam-calendar.js` đã retire trong cleanup 2026-08-23; runtime hiện tại đọc/ghi metadata qua `app/static/js/doctor-examination/prescription-ui.js` và backend prescription/appointment services. Kiểm trực tiếp với appointment `998`/lịch con `1016` và chuỗi `872 -> 974` đã xác nhận contract fallback/populate lịch tái khám.

Bugfix thực tế 2026-06-03: lưu đơn thuốc từ màn bác sĩ không còn định danh thuốc trong kho bằng exact `medicine_name`. Save path ưu tiên `medicine_id` đã chọn từ combobox để validate tồn kho, gom delta và tạo stock transaction; `medicine_name` chỉ là snapshot hiển thị trong `prescription_items`.

Bugfix thực tế 2026-06-07: chuẩn hóa identity thuốc phòng khám theo `prescription_items.medicine_id`. Save tạo prescription item kèm `medicine_id`; read/history/public payload đọc medicine metadata bằng id. Khi áp dụng đơn cũ, item phòng khám thiếu id hoặc trỏ tới thuốc kho hiện đã inactive/hết tồn/không đủ tồn sẽ được copy thành dòng cần chọn thuốc kho hiện tại, không autosave/trừ kho cho đến khi user chọn `medicines.id` mới từ autocomplete. Các thống kê tồn kho/lịch sử kê thuốc chính đã đổi group/filter theo `medicine_id`; `medicine_name` chỉ còn làm label hiển thị hoặc search text. Script DB cần chạy: `scripts/add_medicine_id_to_prescription_items.sql`.

## Next Refactor Steps

1. Từ 06/09/2026, commit boundary bao gồm đơn/kho/lịch tái khám/examination. Chỉ Calendar/reminder/realtime ở ngoài transaction; không biến lỗi giao lịch bên ngoài thành lỗi lưu đơn đã commit.
2. Khi đủ smoke checks, cân nhắc gom template/static prescription vào thư mục con rõ nghĩa.
3. Nếu đổi API shape, cập nhật `references/data-contracts.md` và checklist liên quan cùng lúc.

## QA khóa và lưu tái khám — 06/09/2026

- `tests/test_prescription_re_examination_policy.py`: API thực trong PostgreSQL outer rollback; trạng thái/giờ hẹn, lịch không đổi, sửa/hủy có điều kiện, tạo và retry, conflict snapshot, giữ lịch hủy, thứ tự identity, ngày legacy, rollback toàn bộ khi ghi lịch lỗi; kiểm khóa parent/child bằng hai connection. Cùng `tests/test_existing_stock_lots.py`: 38 tests đạt.
- Browser ca thật 1101/lịch 1149 NO_SHOW: ngày 17/08/2026 09:00 hiển thị đúng, controls khóa, đổi số ngày thuốc không dời lịch. Nút Lưu header chạy API blueprint thật qua bridge localhost với transaction rollback, thành công. Không ghi lại đơn hoặc lịch bệnh nhân. Các trạng thái CONFIRMED/CANCELLED/SCHEDULED quá giờ/tương lai được kiểm interaction bằng fixture trên editor có dữ liệu; API dùng dữ liệu PostgreSQL rollback tương ứng. Ngày mới quá khứ bị chặn tại chỗ trước request. Đã kiểm clear snapshot/error và chuyển sang bệnh nhân khác, đối chiếu snapshot mới với API đọc; không lẫn dữ liệu lịch. Không gửi Calendar/email trong QA.
- Đã bỏ keyword legacy `Examination.symptoms` khỏi nhánh tạo tái khám; model hiện tại không còn field này. Trước đây nhánh này có thể tạo lịch xong rồi lỗi tạo examination; nay cùng transaction và có test tạo mới.

## QA mặc định lịch tái khám mới — 06/09/2026

42 tests API/PostgreSQL rollback đạt (policy tái khám + lô thuốc). Bổ sung trường hợp không kê thuốc, lượt hiện tại không có dịch vụ/gói, user thực hiện khác bác sĩ lượt gốc, payload cố ghi đè bác sĩ/dịch vụ không được dùng; appointment và examination mới đều lấy actor xác thực + Khám tổng quát. Kiểm danh mục thiếu/trùng bị chặn atomically và sửa lịch cũ vẫn giữ bác sĩ/dịch vụ khi mặc định đã ngừng hoạt động. Không sửa dữ liệu lịch bệnh nhân để áp dụng mặc định hồi tố.

Browser QA ca 1242: 0 thuốc, bấm Lưu header thành công qua API blueprint trong outer rollback; không tạo đơn giả, lịch đã có giữ nguyên bác sĩ/dịch vụ/ngày giờ, không có lỗi JavaScript. Các kiểm thử tạo lịch mới dùng fixture PostgreSQL rollback; ca 1242 đã có lịch khi kiểm lại nên không thay/xóa lịch đó để thử tạo mới.
