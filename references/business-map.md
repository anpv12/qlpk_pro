# QLPK Business Map

Tài liệu này là bản đồ nghiệp vụ cấp hệ thống. Đọc trước khi thiết kế hoặc sửa các màn vận hành như Lễ tân, Lịch hẹn, Bác sĩ, Tâm lý gia, Thanh toán, Đơn thuốc, Chỉ định. Mục tiêu là buộc mọi quyết định UI đi từ nghiệp vụ và dữ liệu thật, không đi từ cảm giác hoặc vài field rời rạc.

## Nguyên Tắc Gốc

- UI nghiệp vụ phải trả lời một công việc thật của một vai trò thật.
- Mỗi thông tin hiển thị phải có nguồn dữ liệu và owner rõ ràng.
- Frontend không đoán trạng thái, raw ID, lifecycle, chẩn đoán, hoặc ý nghĩa lâm sàng từ display text.
- Không lặp thông tin chỉ vì còn khoảng trống. Nếu một thông tin đã được dùng để chọn ngữ cảnh ở queue/header, vùng nội dung chỉ lặp lại khi nó giúp bác sĩ/lễ tân ra quyết định nhanh hơn.
- Không tạo field UI nếu field đó không có nguồn dữ liệu, owner lưu trữ, hoặc người dùng thật chịu trách nhiệm nhập.
- Màn hình vận hành không phải dashboard trang trí. Thứ tự đọc phải bám task: nhận biết ca đang xử lý, xem dữ liệu cần thiết, nhập dữ liệu mới, lưu/chuyển trạng thái.

## Vai Trò Và Mục Tiêu

| Vai trò | Mục tiêu chính | Dữ liệu tạo/cập nhật | Dữ liệu đọc/chuyển tiếp |
| --- | --- | --- | --- |
| Lễ tân | Tạo/cập nhật hồ sơ, lịch hẹn, thông tin hỏi bệnh ban đầu, sinh hiệu, tài liệu, người đi cùng | `patients`, `appointments`, `examinations` ban đầu, `appointment_relatives`, tài liệu | Lịch hẹn, hồ sơ bệnh nhân, lịch sử liên quan |
| Bác sĩ | Nhận ca khám, đọc dữ liệu lễ tân, khám hiện tại, chẩn đoán, kê đơn, chỉ định, dịch vụ, hoàn thành khám | `examinations`, `examination_details`, `prescriptions`, `chi_dinh`, dịch vụ gắn lượt khám, tài liệu | `patients`, `appointments`, dữ liệu hỏi bệnh/sinh hiệu từ lễ tân, lịch sử khám |
| Tâm lý gia | Nhận ca tâm lý, đọc dữ liệu nền, ghi nhận phiên tâm lý, đánh giá nguy cơ/diễn tiến, chuyển kết luận/thanh toán | `examinations`, `examination_details` nhóm TLG, chỉ định/dịch vụ/tài liệu nếu có | `patients`, `appointments`, dữ liệu hỏi bệnh, lịch sử |
| Thanh toán | Xác nhận dịch vụ/đơn/chỉ định, thu tiền, in hóa đơn | payment state, payment records | `appointments`, `examinations`, services, prescriptions, orders |
| Quản trị | Quản lý danh mục, người dùng, phân quyền, cấu hình | danh mục và cấu hình hệ thống | dữ liệu tổng hợp, audit |

## Dòng Nghiệp Vụ Chính

| Bước | Actor | Task | Owner dữ liệu chính | Điểm UI bắt buộc rõ |
| --- | --- | --- | --- | --- |
| 1. Tìm/tạo bệnh nhân | Lễ tân | Xác định đúng bệnh nhân và thông tin hành chính | `patients` | Không tạo bệnh nhân trùng nếu backend cảnh báo; thông tin định danh phải rõ |
| 2. Tạo lịch hẹn | Lễ tân/Lịch hẹn | Chọn ngày giờ, bác sĩ/TLG, dịch vụ/gói, loại lịch | `appointments` | Duration, service/package, người khám và trạng thái lịch phải rõ |
| 3. Hỏi bệnh ban đầu | Lễ tân | Ghi lý do khám, triệu chứng, diễn tiến, hành vi hiện tại, sinh hiệu, tài liệu | `examinations`, `examination_details`, documents | Đây là dữ liệu chuyển sang bác sĩ, không phải ghi chú trang trí |
| 4. Chuyển khám | Lễ tân | Đưa appointment vào danh sách bác sĩ/TLG | `appointments`, `examinations.status` | Danh sách chờ phải cho biết đúng ca nào đang chờ/đang khám |
| 5. Khám hiện tại | Bác sĩ/TLG | Đọc dữ liệu ban đầu, ghi nhận khám, chẩn đoán, kế hoạch | `examinations`, `examination_details` | Màn phải phân biệt dữ liệu lễ tân đã nhập và dữ liệu bác sĩ đang nhập |
| 6. Điều trị và chỉ định | Bác sĩ/TLG | Kê đơn, chỉ định CLS, dịch vụ đi kèm, tài liệu | `prescriptions`, `prescription_items`, `chi_dinh`, appointment services, documents | Các module này là nghiệp vụ phụ trợ nhưng có side effect thật |
| 7. Hoàn thành/chuyển thanh toán | Bác sĩ/TLG | Đổi trạng thái khám sau khi đã đủ dữ liệu | `examinations.status`, payment waiting | Nút hoàn thành là action trạng thái, không phải nút trang trí |
| 8. Thanh toán/in ấn | Thu ngân | Xác nhận chi phí, in chứng từ | payment, prescription/print view models | Web/in là chuẩn nghiệp vụ; mobile/verify là viewer |

## Ranh Giới Data Owner

| Owner | Ý nghĩa nghiệp vụ | Không được dùng để |
| --- | --- | --- |
| `patients` | Định danh, liên hệ, nhân khẩu học, tiền sử nền, dị ứng, thuốc đang dùng nền | Lưu triệu chứng/lời dặn/chẩn đoán của một lượt khám |
| `appointments` | Ngày giờ, người khám, service/package, trạng thái lịch, ghi chú hành chính | Lưu lời dặn bác sĩ hoặc quyết định lâm sàng |
| `examinations` | Dữ liệu lâm sàng theo lượt: lý do, triệu chứng, sinh hiệu, ICD, kế hoạch, lời dặn, nguy cơ, trạng thái khám | Lưu thông tin nền lâu dài của bệnh nhân |
| `examination_details` | Section/form/modal linh hoạt theo bác sĩ/TLG | Lưu field đã có owner canonical như `loi_dan`, dị ứng, notes lịch hẹn |
| `prescriptions` / `prescription_items` | Đơn thuốc và dòng thuốc | Suy ra tồn kho từ tên thuốc tự gõ |
| `chi_dinh` | Chỉ định lâm sàng và file kết quả | Trộn với dịch vụ hoặc đơn thuốc |
| `appointment_relatives` | Người đi khám cùng theo một lịch hẹn | Làm nguồn sự thật duy nhất cho quan hệ hồ sơ lâu dài |
| `family_members` | Quan hệ người thân trong hồ sơ bệnh nhân | Ghi dữ liệu chỉ tồn tại trong một lượt đi khám |

## Quy Tắc Thiết Kế Từ Nghiệp Vụ

Trước khi vẽ hoặc sửa UI, phải trả lời được:

1. Actor đang làm task gì?
2. Task này tạo mới, đọc, cập nhật, hay chuyển trạng thái dữ liệu nào?
3. Dữ liệu nằm ở bảng/API/component nào?
4. Dữ liệu này do ai nhập: lễ tân, bác sĩ, TLG, hệ thống, hay backend?
5. Dữ liệu có cần thấy ngay không, hay chỉ mở rộng/modal?
6. Dữ liệu có đang bị lặp ở queue/header/sidebar không?
7. Khi đổi bệnh nhân/lịch hẹn, block nào phải clear DOM và JS state?
8. Component có owner chung chưa, hay đang copy một bản giống nhau?

Nếu không trả lời được 8 câu trên, chưa được thiết kế hoặc code UI.

## Anti-Patterns Cần Chặn

- Vẽ UI bằng danh sách field rời rạc lấy từ database.
- Dùng badge/chip cho mọi thứ làm thông tin trông như nút.
- Đưa cảnh báo, ICD, đơn thuốc, lịch hẹn, mã bệnh nhân vào summary nếu không giúp task chính.
- Tạo hai component nhìn giống nhau nhưng khác HTML/CSS/JS owner.
- Dùng CSS override để vá một layout mà chưa hiểu component owner.
- Dùng display text để quyết định trạng thái hoặc quyền thao tác.
- Giữ hai nhánh UI cũ/mới cùng render hoặc cùng mutate state.

## Tài Liệu Liên Quan

- `references/data-contracts.md`: owner dữ liệu canonical.
- `references/architecture-map.md`: runtime/module map.
- `references/modules/receptionist.md`: nghiệp vụ và data entry của lễ tân.
- `references/modules/examinations.md`: nghiệp vụ lượt khám.
- `references/modules/appointments.md`: nghiệp vụ lịch hẹn và appointment API.
- `references/workflows/doctor-examination-business-map.md`: workflow map chi tiết cho màn bác sĩ.
- `references/workflows/doctor-examination-data-inventory.md`: field/source/component/lifecycle inventory của màn bác sĩ.
- `references/ui/information-architecture.md`: quy tắc chuyển business/data map thành UI.
- `references/ui/design-from-data-checklist.md`: checklist bắt buộc trước khi mockup/code UI.
