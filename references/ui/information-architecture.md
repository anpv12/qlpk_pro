# QLPK UI Information Architecture

Tài liệu này quy định cách biến nghiệp vụ và dữ liệu thật thành UI. Dùng trước khi thiết kế/mocking/sửa layout cho mọi màn vận hành.

## Mục Tiêu

- UI phải thể hiện đúng workflow, không chỉ sắp field cho đẹp.
- Mỗi vùng UI phải có một mục đích nghiệp vụ.
- Mỗi thông tin trong UI phải trace được về owner dữ liệu.
- Component dùng chung phải có một owner; màn riêng chỉ compose/configure.
- Thiết kế phải giảm nhận thức thừa: không lặp, không bọc khung lung tung, không giấu dữ liệu chính sai chỗ.

## Quy Trình Thiết Kế Bắt Buộc

### 1. Xác Định Task

Trả lời:
- Actor là ai?
- User đang ở bước nào trong workflow?
- Task chính trong 30 giây đầu là gì?
- Task nào là phụ trợ?
- Kết quả sau thao tác là dữ liệu mới, trạng thái mới, hay chỉ xem?

### 2. Lập Data Inventory

Mỗi field cần có:

| Thuộc tính | Câu hỏi |
| --- | --- |
| Label nghiệp vụ | Người dùng gọi nó là gì? |
| Owner | `patients`, `appointments`, `examinations`, `examination_details`, `prescriptions`, `chi_dinh`, hay domain khác? |
| Source API | Endpoint/load path nào trả về? |
| Save API | Endpoint nào ghi lại nếu editable? |
| Editable | Ai được sửa? Khi nào disable? |
| Clear owner | Khi đổi context, function nào clear? |
| Priority | Thấy ngay, mở rộng, modal, hay không show? |

Không có đủ các thông tin này thì chưa được đưa field vào thiết kế final.

### 3. Phân Tầng Thông Tin

| Tầng | Vai trò | Ví dụ |
| --- | --- | --- |
| Context | Giúp biết đang xử lý đối tượng nào | bệnh nhân đang chọn, ngày giờ, dịch vụ |
| Primary work | Nơi user nhập/đọc nội dung chính của task | hỏi bệnh, chẩn đoán, kế hoạch |
| Decision | Thông tin giúp ra quyết định hoặc chuyển trạng thái | ICD, nguy cơ, hoàn thành khám |
| Support | Module phụ trợ có side effect | đơn thuốc, chỉ định, tài liệu, lịch sử |
| Detail | Dữ liệu cần khi kiểm tra sâu | hành chính, địa chỉ, người thân, nền bệnh |

Nguyên tắc: thông tin nào càng liên quan đến task hiện tại thì càng gần vùng thao tác chính. Thông tin định danh chỉ đủ để tránh nhầm context, không được lấn vùng làm việc.

### 4. Chọn Component Owner

Trước khi tạo HTML/CSS mới, kiểm tra:

- Có component shared đang làm việc tương tự không?
- Màn khác có cùng component không?
- Nếu giống lễ tân/TLG thì dùng chung và truyền mode/config.
- Nếu khác nghiệp vụ thật, tạo component mới nhưng ghi rõ owner.
- Không tạo hai component nhìn giống nhau bằng CSS riêng khác nhau.

### 5. Thiết Kế Layout

Layout phải đi từ nhóm nghiệp vụ, không đi từ pixel:

- Chia vùng theo task: selection, context, work, support.
- Dùng grid/flex theo tỉ lệ và content constraints, không hard-code để vừa một màn hình riêng.
- Desktop nhỏ như 1512px vẫn là desktop/tablet lớn, không được coi là mobile chỉ vì thiếu chỗ.
- Khi không đủ ngang, ưu tiên giảm mật độ/nhóm lại theo nghiệp vụ, không ép chồng text/nút.
- Scroll phải nằm ở vùng nội dung đúng owner, không chiếm không gian vô lý trong panel.

### 6. Kiểm Tra Trùng Lặp

Một thông tin bị coi là lặp thừa nếu:

- Đã là label chính của queue/card đang chọn.
- Đã nằm trên summary/header cùng màn.
- Không giúp quyết định gì ở vị trí mới.
- Là metadata như ID nhưng được phóng thành nội dung chính.

Lặp được chấp nhận nếu:

- Giúp chống nhầm bệnh nhân khi nhập liệu nguy cơ cao.
- Là anchor ngắn của vùng collapse/detail.
- Có action liên quan ngay bên cạnh.

## Pattern Chuẩn Cho Màn Nghiệp Vụ

### Selection Pane

Mục tiêu: chọn đúng entity đang xử lý.

Nên có:
- Tên chính.
- Một hoặc hai metadata phân biệt.
- Trạng thái hoặc thời gian nếu task phụ thuộc nó.

Không nên:
- Đổ toàn bộ hồ sơ vào card.
- Render nhiều action giống workspace chính.

### Context Summary

Mục tiêu: xác nhận đúng context.

Nên ngắn, đọc trong 1-2 dòng. Không dùng nó làm nơi chứa tất cả cảnh báo, hồ sơ, đơn thuốc, hoặc ICD.

### Primary Work Area

Mục tiêu: user làm việc chính.

Nên có:
- Label nghiệp vụ rõ.
- Field/edit surface đủ rộng.
- Dữ liệu đã có từ bước trước ở đúng nơi đọc/sửa.
- Nút action chỉ khi action nằm trong task chính.

Không nên:
- Dấu nội dung chính trong modal/collapse nếu user luôn cần đọc.
- Chia nhỏ thành nhiều card rời khiến đọc bị đứt.

### Support Rail/Panel

Mục tiêu: cho module phụ trợ hoặc thông tin phụ nhưng có giá trị.

Nên có:
- Trạng thái tóm tắt.
- Action mở module.
- Dữ liệu thật có side effect.

Không nên:
- Biến thành bảng màu/badge trang trí.
- Lặp lại action bar chính.

### Detail Collapse/Modal

Mục tiêu: thông tin ít dùng hơn nhưng cần kiểm tra.

Nên dùng cho:
- Hành chính dài.
- Người thân.
- Lịch sử.
- Tài liệu/phụ trợ.

Không dùng cho:
- Nội dung hỏi bệnh chính nếu bác sĩ cần đọc ngay.
- Dữ liệu đang cần nhập trong task chính.

## Quy Tắc Màu Và Trọng Tâm

- Màu phải có nghĩa: thành công, cảnh báo, lỗi, thông tin, trạng thái.
- Không dùng pastel mờ cho text/action quan trọng.
- Không dùng badge màu cho mọi thông tin; badge chỉ dùng khi thông tin là status/tag ngắn.
- Button action phải rõ và có contrast; action nguy hiểm/cứu nguy không được chìm.
- Màu thương hiệu/header không tự động áp vào mọi vùng nội dung.

## Quy Tắc Component Và CSS

- Một visual region chỉ có một frame owner.
- Không bọc card trong card nếu chỉ để tạo cảm giác có khối.
- Không vá layout bằng `!important` hoặc selector nặng nếu chưa xác định owner.
- Không dùng inline style cho layout nghiệp vụ.
- Typography dùng shared token, không thêm hệ font/size riêng khi chưa có lý do.
- Với component shared, sửa ở owner chung; không tạo bản doctor-only nếu lễ tân/TLG cần giống hệt.

## Template Đặc Tả UI Block

Khi đề xuất một block UI mới, phải ghi rõ:

```text
Tên block:
Actor/task:
Nguồn dữ liệu:
Owner lưu:
Editable/read-only:
Tần suất dùng:
Priority: thấy ngay / mở rộng / modal / không show
Component owner:
Clear/reset owner:
Không được lặp với:
Acceptance UI:
Acceptance data:
```

Nếu một block không điền được template này, chưa đủ điều kiện để đưa vào thiết kế final.

## Áp Dụng Cho Mockup

Mockup phải bám:

- Field thật từ business/data map.
- Thứ tự đọc thật của task.
- Component owner thật hoặc component target rõ.
- Không tạo field mới chỉ để nhìn đầy.
- Không dùng lorem ipsum cho dữ liệu nghiệp vụ khi dự án đã có data contract.
- Không tạo 20 option bằng cách chỉ thay màu/card. Option phải khác về cấu trúc nghiệp vụ hoặc thứ tự ưu tiên thông tin.

## Tài Liệu Liên Quan

- `references/business-map.md`
- `references/ui/design-from-data-checklist.md`
- `references/data-contracts.md`
- `references/architecture-map.md`
- `references/workflows/doctor-examination-business-map.md`
