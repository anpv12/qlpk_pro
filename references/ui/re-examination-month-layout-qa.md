# Lịch tái khám tháng — QA 2026-09-27

Theo yêu cầu mới: bỏ eventClick/showEventDetail; bấm thẻ lịch không mở
chi tiết và không đổi ngày đang chọn. Danh sách +N lịch chỉ có dòng chữ,
giữ phân trang; chọn ô ngày trống vẫn hoạt động. Browser dữ liệu thật
đã kiểm,8 layout tests đạt, không ghi DB.

## Dịch vụ/Bác sĩ autocomplete

Hai field dùng macro `_autocomplete_field.html` và registry autocompleteField,
single mode; local adapter lọc không dấu và phân trang catalog hiện có.
QA dữ liệu thật: gõ không dấu, chọn chuột/ArrowDown/Enter, rỗng, Escape,
khóa xác nhận khi chưa chọn, xác nhận draft và mở lại giữ ID/nhãn.
Desktop1440×900/mobile390×844: dropdown top-layer không bị cắt, popup
không tăng chiều cao/cuộn. Không ghi DB. Owner payload/save không đổi.

- Scope sau đối chiếu: lịch Doctor và lịch hẹn dùng chung component
  `components/appointment-calendar.js` và CSS cùng tên; form/save riêng.
- Renderer cũ `appointment-management/calendar-event-content-utils.js`
  đã chuyển sang shared owner, không còn hai bản vẽ event/toolbar/màu.
- API đọc thêm doctor_id/doctor_color và doctors[].calendar_color từ User;
  không đổi quyền xem, bộ lọc dữ liệu, endpoint hoặc payload lưu.
- QA cùng tháng10/2026, cùng lịch hẹn thật: computed styles thẻ, chữ,
  chấm bác sĩ, nút, header cột, tiêu đề, số ngày và trạng thái trùng nhau.
  Hai màn bắt đầu Thứ Hai. Lễ tân giữ tuần/tháng và lọc bác sĩ;
  Doctor không có nút tuần.21 Node tests + Doctor contract đạt.
- Python syntax đạt;49 test PostgreSQL trong re-examination policy bị skip
  vì không bật QLPK_RUN_DB_TESTS; không coi là backend suite đã pass.
  HTTP thật xác nhận doctor_id/doctor_color có mặt và đúng màu hiển thị.
  Diff-check các file trong scope sạch; toàn repo còn whitespace ở
  prescription.css thuộc thay đổi song song, không sửa trong lát này.
- Owner: `app/static/js/doctor-examination/re-examination-calendar.js`,
  `app/static/css/components/re-examination-calendar.css`.
- Chain: dialog theo viewport → header/footer cố định → body phần còn lại
  → form/lịch grid → FullCalendar height100%; ResizeObserver theo khung lịch.
- Thực tế: ca435 cho phép chọn, xác nhận và mở lại draft; ca1101 giữ khóa.
  Đã kiểm ngày có2 lịch thật, chi tiết, Escape, đổi ngày/giờ và tháng.
- Viewport: 1440×900, 1366×768, 1024×600, 768×1024, 390×844, không có
  scroll hoặc tràn khung popup/form/lịch trong các state đã kiểm.
- Mô phỏng: 18 lịch/ngày, 4 mục/trang, đến trang cuối, mở chi tiết/quay lại;
  tháng4/5/6 hàng. Không tạo dữ liệu QA trong DB.
- Browser: không có pageerror, không phát sinh request ghi; phiên đã đóng.
- Giới hạn: chưa pass visual/interactive QA với ngày dày dữ liệu thật;
  chưa kiểm lưu xuống DB, cực hạn chiều cao/zoom hoặc nhãn dài bất thường.
- Regression: `tests/reexamination_calendar_layout.test.js` cùng
  `tests/prescription_reexam_ui.test.js`, `tests/prescription_context_typography.test.js`,
  `tests/appointment_calendar_shared.test.js`.
