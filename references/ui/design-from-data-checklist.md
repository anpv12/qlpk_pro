# Design From Data Checklist

Dùng checklist này trước khi tạo mockup, sửa HTML/CSS/JS, hoặc đánh giá UI nghiệp vụ. Nếu thiếu câu trả lời, chưa được báo thiết kế là đúng.

## Checklist Tổng Quát

### A. Nghiệp vụ

- [ ] Đã xác định actor chính của màn/vùng UI.
- [ ] Đã xác định task chính.
- [ ] Đã xác định task phụ.
- [ ] Đã biết bước này nằm ở đâu trong workflow tổng.
- [ ] Đã biết kết quả sau thao tác là đọc, ghi, hay chuyển trạng thái.

### B. Dữ liệu

- [ ] Mỗi field hiển thị có owner dữ liệu rõ.
- [ ] Mỗi field editable có save path rõ.
- [ ] Mỗi field read-only có load path rõ.
- [ ] Không có field tự nghĩ ra ngoài schema/API/runtime.
- [ ] Không dùng display text để suy luận trạng thái hoặc lifecycle.
- [ ] Không trộn `appointment.notes` với `examinations.loi_dan`.
- [ ] ICD edit ưu tiên raw IDs như `diagnosis_ids`, `benh_kem_theo_ids`.

### C. Ưu tiên thông tin

- [ ] Đã chia thông tin thành thấy ngay / mở rộng / modal / không show.
- [ ] Thông tin chính của task không bị giấu trong modal.
- [ ] Thông tin hành chính dài không chiếm workspace chính nếu không phải task chính.
- [ ] Không lặp dữ liệu đã có ở queue/header trừ khi có lý do chống nhầm hoặc action liên quan.
- [ ] Metadata như ID không bị phóng thành nội dung chính nếu bác sĩ/lễ tân không quyết định dựa vào nó.

### D. Component

- [ ] Đã kiểm tra có component shared tồn tại chưa.
- [ ] Nếu giống component màn khác, dùng chung owner thay vì copy.
- [ ] Nếu tạo component mới, đã ghi owner rõ.
- [ ] Không giữ UI cũ và UI mới cùng render cùng dữ liệu.
- [ ] Không tạo CSS page-local để làm một component shared trông khác vô tình.

### E. State Và Safety

- [ ] Có clear/reset owner cho DOM.
- [ ] Có clear/reset owner cho JS state/cache.
- [ ] Có stale token hoặc guard cho async response.
- [ ] Auto-save không chạy khi đang load.
- [ ] Khi đổi bệnh nhân/lịch hẹn, không còn dữ liệu ca trước.

### F. Layout Và Visual

- [ ] Layout đi từ nhóm nghiệp vụ, không đi từ pixel cứng.
- [ ] Desktop/tablet/mobile có cấu trúc responsive hợp lý.
- [ ] Không horizontal overflow.
- [ ] Text/nút không chồng lên nhau.
- [ ] Action quan trọng có contrast rõ.
- [ ] Không bọc khung/card lồng nhau vô nghĩa.
- [ ] Không dùng màu nhạt khiến trạng thái/action khó đọc.

## Checklist Riêng Màn Bác Sĩ

### Context

- [ ] Queue chỉ dùng để chọn ca khám, không nhồi hồ sơ dài.
- [ ] Summary chỉ xác nhận ca đang khám: ngày/giờ, tên, giới/tuổi, dịch vụ/trạng thái nếu cần.
- [ ] Summary không biến thành dashboard cảnh báo hoặc bảng badge.
- [ ] Mã NB/appointment id chỉ là metadata phụ, không phải nội dung trung tâm.

### Dữ liệu lễ tân chuyển sang

- [ ] Hỏi bệnh ban đầu của lễ tân hiển thị ở vùng bác sĩ dễ đọc.
- [ ] Lý do khám và triệu chứng không bị giấu sâu nếu bác sĩ cần đọc ngay.
- [ ] Sinh hiệu/hành chính dùng component `patient-info-form` hoặc component shared đúng mode.
- [ ] Tài liệu/người đi cùng nằm ở vùng chi tiết hoặc module phụ trợ, không chen vào summary nếu không cần.

### Dữ liệu bác sĩ nhập

- [ ] ICD chẩn đoán dùng raw IDs khi edit.
- [ ] Bệnh kèm theo phân biệt với chẩn đoán chính.
- [ ] Kế hoạch điều trị và lời dặn lưu đúng `examinations`.
- [ ] Thuốc đang dùng trong lượt khám không trộn với đơn thuốc.
- [ ] Đơn thuốc/chỉ định/dịch vụ/tài liệu có module owner riêng.

### Action

- [ ] Lịch sử, Chỉ định, Dịch vụ, Tài liệu, In đơn, Hoàn thành không có hai owner UI khác nhau.
- [ ] Hoàn thành khám là action trạng thái, không chỉ là button trang trí.
- [ ] Action bar không bị lặp lại ở side panel với style khác nếu không có lý do rõ.

### Patient Switching

- [ ] Summary clear khi chưa chọn bệnh nhân.
- [ ] Form hành chính clear.
- [ ] Hỏi bệnh clear.
- [ ] ICD chips clear.
- [ ] Thuốc đang dùng clear.
- [ ] Đơn thuốc/chỉ định/dịch vụ/tài liệu/lịch sử cache clear.
- [ ] Modal state clear.
- [ ] Async load cũ không được render vào bệnh nhân mới.

## Checklist Trước Khi Mockup

- [ ] Đã đọc `references/business-map.md`.
- [ ] Đã đọc workflow map của màn tương ứng.
- [ ] Đã đọc data/component inventory của màn tương ứng nếu có.
- [ ] Đã đọc `references/data-contracts.md`.
- [ ] Đã rà template/component runtime thật.
- [ ] Đã lập danh sách field sẽ dùng và owner của từng field.
- [ ] Đã gạch bỏ field không có nguồn thật.
- [ ] Đã xác định component nào dùng chung.
- [ ] Đã xác định thông tin nào không được lặp.
- [ ] Đã xác định viewport/responsive target theo cấu trúc, không theo một màn hình cá nhân.

## Checklist Trước Khi Code UI

- [ ] Có mockup/IA đã được duyệt.
- [ ] Có danh sách file owner cần sửa.
- [ ] Có kế hoạch xóa/collapse UI cũ nếu bị thay thế.
- [ ] Không thêm nhánh legacy/new song song.
- [ ] Có static validation plan.
- [ ] Có browser/visual QA plan.
- [ ] Có smoke workflow sau khi sửa.

## Mẫu Báo Cáo Khi Đề Xuất UI

```text
Actor/task:
Nguồn dữ liệu:
Field dùng:
Field loại bỏ:
Component dùng chung:
Component mới:
Thông tin thấy ngay:
Thông tin mở rộng:
Thông tin modal:
State cần clear:
Rủi ro:
Acceptance:
```

Không dùng các câu như "nhìn đẹp hơn", "mượt hơn", "hiện đại hơn" nếu không kèm tiêu chí nghiệp vụ/data cụ thể.
