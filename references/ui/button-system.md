# Quy chuẩn nút QLPK — bắt buộc

Ngoại lệ user duyệt27/09/2026: badge “Bổ sung giá” trong lịch sử nhập dùng
token nút đỏ/chữ trắng và cỡ chữ control chung, không dùng cỡ badge nhỏ.
Giữ role edit và handler bổ sung giá, không đổi thành hành động xóa.

Ngoại lệ user duyệt 27/09/2026: badge số lần nhập tại cột Lần nhập của
Tủ thuốc dùng nâu chủ đạo `--qlpk-workflow-context-header-bg`, chữ trắng,
không gắn data-qlpk-button trung tính. Giữ button/keyboard và showStockDetail;
chỉ ngoại lệ `.stock-detail-badge`, không đổi nút thao tác hoặc badge DAV.

Quyết định đã duyệt ngày 23/09/2026. Áp dụng khi thiết kế, tạo mới hoặc sửa
nút trong ứng dụng. Thay thế palette phân màu theo từng loại hành động và
mọi hướng dẫn cũ dùng gradient nâu cho nút. Không thay đổi màu thương hiệu,
badge trạng thái, tab, phân trang, lựa chọn autocomplete hoặc bản in.

## Owner duy nhất

- Token: `app/static/css/shared/color-tokens.css`, namespace `--qlpk-button-*`.
- Presentation và state: `app/static/css/shared/button-actions.css`.
- Load chung: `app/templates/partials/brand-theme.html`.
- Renderer dùng chung: `app/static/js/shared/icon-system.js` giữ role tường minh.
- Font, kích thước, vị trí, responsive do component hiện tại sở hữu.

Không thêm palette riêng trong CSS trang, inline style, JS hoặc mockup.
Không dùng `!important`, viền kép, shadow, gradient hay màu nâu cho nút.
Không di chuyển nút ra khỏi header để tránh xử lý tương phản.

## Màu và ưu tiên

| Loại | Bình thường | Hover | Active | Chữ |
| --- | --- | --- | --- | --- |
| Chính | #176B5B | #125547 | #0E4439 | #FFFFFF |
| Phụ trên nền nâu/tối | #FFFFFF | #F5F5F5 | #EBEBEB | #343B40 |
| Phụ trên nền trắng/sáng | #F5F5F5 | #EDEDED | #E3E3E3 | #343B40 |
| Xác nhận nguy hiểm | #B42332 | #991D2A | #801824 | #FFFFFF |
| Disabled | #E7E7E7 | Không đổi | Không đổi | #747474 |

Nút xóa tại dòng dữ liệu dùng nền phụ và chữ/icon đỏ #B42332; hover #FFF0F1,
active #FFE1E4. Chỉ xác nhận nguy hiểm mới dùng nền đỏ đậm. Hủy form không
phải hành động nguy hiểm. Chữ disabled theo mẫu đã duyệt không được tuyên bố
đạt AA 4.5:1; đây là control không tương tác, không hạ opacity thêm.

Một vùng thao tác chỉ có một hành động chính. Loại nghiệp vụ KHÔNG tự quyết
định màu: Lưu ở header bác sĩ là phụ, Lưu trong modal chỉnh sửa là chính.
Xem, sửa, in, xuất đều trung tính; không dùng xanh dương/cam/tím riêng.

## Cách khai báo bắt buộc

Giữ `data-qlpk-button="execute|view|edit|danger|neutral"` để mô tả hành động.
`data-qlpk-button-variant="solid|soft"` là mức nhấn:

- `execute + solid`: nút chính xanh.
- `execute + soft`, `view`, `edit`, `neutral`: nút phụ trung tính.
- `danger + soft`: mở thao tác nguy hiểm, chữ đỏ.
- `danger + solid`: xác nhận nguy hiểm, nền đỏ.
- Thiếu variant mặc định là phụ; khi viết mới luôn khai báo rõ.
- Không suy role/variant từ textContent, nhãn dịch hoặc tên bệnh nhân.

Khai báo nền ở đúng container chứa nút, không đặt trên toàn form nếu form
gồm cả header tối lẫn thân sáng. Thuộc tính này không đổi nền container:

```html
<header data-qlpk-button-surface="dark">
  <button type="button" data-qlpk-button="view" data-qlpk-button-variant="soft">Lịch sử</button>
  <button type="button" data-qlpk-button="execute" data-qlpk-button-variant="soft">Lưu</button>
  <button type="button" data-qlpk-button="execute" data-qlpk-button-variant="soft">Chuyển khám</button>
  <button type="button" data-qlpk-button="execute" data-qlpk-button-variant="solid">Hoàn thành</button>
</header>
<div data-qlpk-button-surface="light">
  <button type="button" data-qlpk-button="neutral" data-qlpk-button-variant="soft">Hủy</button>
  <button type="submit" data-qlpk-button="execute" data-qlpk-button-variant="solid">Lưu</button>
</div>
```

Mặc định nền sáng; container lồng dùng `light` để reset nếu nằm trong vùng
`dark`. Không tự dò màu bằng JS hoặc hardcode class màn hình trong owner chung.
Template/DOM renderer mới phải khai báo thuộc tính ngay lúc tạo nút.

`createIconTextButton` mặc định soft; truyền `buttonVariant: 'solid'` khi là
hành động chính. Modal xác nhận dùng chung nhận role tường minh ở tham số thứ
tư: `CustomModal.confirm(message, title, 'warning', 'danger')` cho xóa/hủy
nguy hiểm; không dò chữ “xóa” trong message để quyết định màu.

## Mapping được duyệt

| Cụm | Chính | Phụ |
| --- | --- | --- |
| Header bác sĩ/tâm lý gia | Hoàn thành | Lịch sử, Lưu, Chuyển khám |
| Header Khám & xử trí | Không bắt buộc | Đơn thuốc, lịch sử thuốc |
| Header lễ tân | Lưu | Tải lên, tra cứu |
| Toolbar lịch hẹn | Thêm lịch hẹn | Đồng bộ, kết nối, xuất |
| Toolbar tủ thuốc | Thêm thuốc mới | Nhập kho, xuất |
| Modal/form | Lưu/Xác nhận theo tác vụ | Hủy, đóng, thêm dòng, công cụ |

## Interaction và QA bắt buộc

- Border trong suốt để giữ geometry; không viền thường trực và không shadow.
- Focus chỉ dùng `:focus-visible`: trắng trên nền tối, #343B40 trên nền sáng,
  rộng 2px, cách 3px. Không xóa focus để làm đẹp.
- Icon kế thừa màu chữ. Hover phụ không biến thành nút chính.
- Disabled/aria-disabled không đổi màu khi hover/active; không sửa logic khóa.
- Loading giữ role/variant, giữ handler chặn bấm lặp của component.
- Kiểm browser thật: nền nâu và trắng, thường/hover/active/focus/disabled,
  normal/dense/sparse, viewport liên quan, icon và CSS ghi đè.
- Kiểm chữ với nền nút VÀ ranh giới với nền chứa. Xanh đậm trên nâu là mẫu
  người dùng duyệt; không suy rằng cặp nền này đạt WCAG 3:1 chỉ từ test chữ.
- Nút nhìn thấy trong trạng thái thật mới tính visual QA; hidden/fixture
  không chứng minh màn bệnh nhân hoạt động.
- Chạy `node --test tests/button_actions.test.js tests/button_color_tokens.test.js`.
- Không báo toàn hệ thống pass khi chưa kiểm các màn/modal/state còn lại.
