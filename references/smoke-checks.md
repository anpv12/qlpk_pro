# QLPK Smoke Checks

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

## UI Browser QA Gate

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

- [ ] `/static/vendor/socket.io/socket.io.min.js` trả Socket.IO client script khi server đang chạy; không dùng `/socket.io/socket.io.js` như static asset vì đó là Engine.IO endpoint.
- [ ] Socket connect bằng JWT hợp lệ và server trả `qlpk:connected`.
- [ ] Top-level workspace page tự start realtime client qua `app-header-loader.js`; embedded iframe không mount header lồng nhưng vẫn nhận event do parent forward.
- [ ] Parent socket đã subscribe room của các workspace tab/iframe đang mở; mở một admin/kho tab trong iframe vẫn nhận event dù URL top-level đang ở trang khác.
- [ ] Tạo/sửa lịch hẹn ở một tab làm dashboard, lịch hẹn, lễ tân, bác sĩ/TLG liên quan refresh danh sách mà không reload browser tab.
- [ ] Lưu chỉ định/kết quả chỉ định làm order-management và màn khám liên quan refresh danh sách/trạng thái.
- [ ] Tạo/hoàn thành/đóng/hết hạn khảo sát làm tab Khảo sát trong modal chỉ định cập nhật qua `survey.changed`, không còn polling 3 giây.
- [ ] Xác nhận thanh toán hoặc trả trạng thái examination làm payment-waiting, lễ tân, bác sĩ/TLG liên quan cập nhật.
- [ ] Tạo/sửa bệnh nhân, thân nhân hoặc người nhà đi kèm làm lễ tân/bác sĩ/TLG liên quan cập nhật qua `patient.changed` nhưng không ghi đè form khám đang nhập.
- [ ] Lưu đơn thuốc có thay đổi tồn kho làm medicine-management và medicine-statistics cập nhật qua `inventory.changed`.
- [ ] Tạo/sửa/xóa service/package/user/ICD/survey template/text expansion hoặc danh mục cá nhân làm các màn liên quan refresh qua `catalog.changed`.
- [ ] Tạo/sửa/xóa lịch bận làm appointment-management và doctor-busy-schedule cập nhật.
- [ ] Upload/link/xóa tài liệu hoặc folder làm document-management cập nhật qua `document.changed`.
- [ ] Tạo/sửa/xóa khoản chi hoặc cấu hình cột thu chi làm `chi-tieu.html` cập nhật qua `finance.changed`; nếu đang nhập trong ô bảng thì reload phải chờ blur để không mất focus.
- [ ] `rg "startSurveyPolling|stopSurveyPolling|surveyPolling|POLLING|polling" app/static/js app/api app/modules app/realtime` không còn polling dữ liệu nghiệp vụ; các `setInterval` còn lại nếu có phải là loader/tooltip kỹ thuật.

## Prescription Print And Verify

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
- [ ] Footer H/N fill phone, tên người đưa đi khám, CCCD người nhận thuốc khi có dữ liệu.
- [ ] Footer không còn chuỗi dấu chấm dài khi dữ liệu tồn tại.

### Layout Checks

- [ ] Web/desktop verify giữ cùng document layout với mẫu web/in.
- [ ] HTML modal Toa thuốc giữ logo/thông tin/cụm mã cùng căn đỉnh; `.prescription-code-section` không còn offset `40px`, badge không tạo khoảng trống `20px` trước barcode.
- [ ] HTML modal dùng spacing tiêu đề `20px 0 45px`: áp trên `.prescription-title-section` cho Toa thuốc hai dòng và trên `.prescription-preview__title--document` cho Hóa đơn/Bệnh án một dòng; không cộng dồn margin cũ.
- [ ] HTML modal giới hạn `.rx-verify-qr-image` ở `8.125rem` (130px với root mặc định), `max-inline-size: 100%` và giữ tỷ lệ; PNG nguồn độ phân giải cao không được phóng layout theo kích thước tự nhiên.
- [ ] Browser QA modal với đơn ngắn, đơn dày và history chưa có đơn: QR hợp lệ tải được, document/modal không tràn ngang; trạng thái chưa có đơn không dựng QR giả.
- [ ] Mobile verify giữ cặp cột 6/4, không stack dọc patient/medicine rows.
- [ ] Mobile chỉ scale hoặc viewer-fit document, không phá cấu trúc tài liệu.
- [ ] `.rx-patient-grid` là `flex-direction: row`.
- [ ] `.rx-med-row` là `flex-direction: row`.
- [ ] Document visual fit trong viewport mobile, không làm header bị bóp chữ thành cột hẹp.

### Print Safety Checks

- [ ] Luồng in A4 từ màn bác sĩ vẫn dùng default print context.
- [ ] Nút `In đơn` ở Doctor và `.tab-print-btn` trong modal lịch sử cùng đi qua `PrescriptionPrintDocument`; controller chỉ chuẩn bị dữ liệu, không clone screen preview hoặc tự sở hữu CSS/barcode/window lifecycle.
- [ ] Popup loading, document và error dùng Blob URL cùng origin; không gọi `document.open/write/close` để ghi lại `about:blank` sau async.
- [ ] Với cùng một đơn, hai entry point cho cùng thứ tự trang BASIC/H/N và cùng header: logo/thông tin/cụm mã thẳng hàng trên, badge mã đơn nằm đầu cụm phải, barcode + mã hồ sơ nằm bên dưới; không còn `margin-top: 40px` ở cụm mã bản in.
- [ ] Bản in không bị inherit CSS verify/mobile.
- [ ] QR/chữ ký của bản in vẫn hiện theo default nếu không truyền flag ẩn.
- [ ] QR bản in chỉ tải từ endpoint cùng domain; source/template không còn tham chiếu `api.qrserver.com` hoặc dịch vụ QR bên thứ ba.
- [ ] QR được đánh dấu là print asset bắt buộc. Ảnh hợp lệ (`naturalWidth > 0`) mới cho gọi `window.print()`; ảnh lỗi/timeout đặt `data-print-ready="error"`, hiện cảnh báo và không gọi in.
- [ ] Đơn ngắn không ép `.prescription-preview--rx` cao gần trọn A4 và không dùng `margin-top: auto` để ghim QR/chữ ký xuống đáy; QR/chữ ký theo sát lời dặn bằng khoảng cách cố định.
- [ ] Đơn dài phân trang bằng normal flow, không mất header/phần đầu tài liệu; mỗi mẫu BASIC/H/N sau mẫu đầu bắt đầu ở trang mới bằng `break-before`.
- [ ] Footer H/N dưới 18 tuổi nằm trong flow, không dùng absolute positioning, không chồng QR/chữ ký và không bị tách giữa hai trang.
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
- [ ] Không có thay đổi ở clinical/history/support thì không gửi HTTP write và feedback nói rõ không có thay đổi cần lưu.
- [ ] Sửa chỉ một vùng Khám chi tiết chỉ `POST` section của vùng đó; main `PUT` không chạy nếu main/Tiền sử sạch.
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
- [ ] Các action lặp trong danh sách chờ, tài liệu đính kèm và người thân liên kết dùng semantic icon action (`QLPKIconSystem.renderActionButton()` / `.qlpk-icon-action--*`), không dùng lại `btn-outline-primary`, `btn-outline-danger` hoặc `btn-success` để tô màu action.
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

## Clinic Medicine Inventory

Áp dụng khi sửa danh mục thuốc, nhập lô, kiểm kê, lịch sử giao dịch hoặc
prescription stock integration.

- [ ] Tạo thuốc mới luôn trả `stock_quantity=0`; payload có field tồn trực
  tiếp bị từ chối.
- [ ] `PUT /api/medicines/<id>` có `stock_quantity` bị từ chối; form danh mục
  hiển thị tồn read-only và không gửi field này.
- [ ] Tạo lô đặt `remaining_quantity=quantity`, khóa aggregate và tạo đúng một
  movement `import` có `batch_id` trong cùng transaction.
- [ ] Import-order nhiều dòng validate toàn bộ trước khi ghi; một dòng lỗi
  rollback toàn request, không silently skip.
- [ ] Kiểm kê hiển thị từng lô; chênh lệch cần lý do và cập nhật lô, aggregate,
  movement `adjustment` cùng transaction.
- [ ] PUT số dư lô, POST ledger trực tiếp và xóa lô đã có movement đều bị chặn.
- [ ] Excel catalog không bơm tồn trực tiếp; cột tồn dương bị bỏ qua kèm hướng
  dẫn nhập lô.
- [ ] Lịch sử giao dịch lọc được theo tên thuốc và số lô; movement import/
  adjustment hiển thị đúng loại, lô, người thực hiện và ghi chú.

## Medicine Reference Catalog

Áp dụng khi sửa danh mục thuốc DAV, API đồng bộ DAV, model `medicine_reference_catalog`, hoặc màn `medicine-reference-catalog.html`.

- [ ] `GET /medicine-reference-catalog.html` trả `200 text/html` và load đủ CSS/JS riêng của màn DAV.
- [ ] Không có token thì list/detail/sync API trả `401 application/json`, không public nhầm danh mục quản trị.
- [ ] Search theo tên thuốc, hoạt chất, số đăng ký hoặc nhà sản xuất trả đúng dữ liệu đã sync.
- [ ] Bộ lọc đang hiệu lực/hết hạn/tất cả trả đúng số liệu summary và danh sách.
- [ ] Nút chi tiết mở modal, hiển thị field đã normalize và raw payload DAV.
- [ ] Đồng bộ scope test 1000 dòng chạy được, không trả raw SQL/error stack ra UI.
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
