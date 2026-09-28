# Autocomplete field dùng chung

- Auth adapter (28/09, lát51): ICD loader dùng shared API transport qua
  window.fetch; không đọc token hoặc gọi getAuthHeader của consumer. Giữ
  pagination/ids/query/signal; session error propagate để không báo rỗng giả.
  Legacy occupation/province/ward/base loaders cũng bỏ Bearer riêng; đây là
  thống nhất transport, chưa phải thay presentation legacy bằng component mới.

Khi yêu cầu “autocomplete field”, mặc định dùng component dưới đây. Nguồn
dữ liệu khác nhau cấu hình bằng adapter, không viết riêng dropdown/chips/
keyboard handler hoặc CSS hình học cho từng nguồn.

## Owner

- JS: `app/static/js/components/autocomplete-field.js` — `QLPKAutocompleteField`.
- Template: `app/templates/components/_autocomplete_field.html` — `render_autocomplete_field`.
- CSS: `app/static/css/components/autocomplete-field.css`, dùng font/màu token.
- ICD: `icd-autocomplete.js` và `_icd_autocomplete.html` là adapter giữ API,
  ID/hook và format mã–tên bệnh của caller hiện hành.
- DAV field8 Bác sĩ: adapter trong `clinical-examination-form.js`, endpoint
  qua `doctor-component-config.js`.
- DAV Tủ thuốc (thêm/liên kết/liên kết lại): adapter `medicines/clinic-catalog.js`,
  chế độ chọn một. Popup dùng macro/CSS/lõi chung; chọn xong hiện thông tin
  nguồn và preview riêng. Đổi thuốc clear selection và khóa xác nhận; chỉ
  nút Xác nhận liên kết mới ghi dữ liệu. Giữ cache 30 giây, 12 dòng/trang,
  scope `clinic_medicine_id` khi lấy preview; liên kết yêu cầu từ khóa.
- Người thân/người đi khám cùng (relative-table, joint-exam-manager) vẫn dùng
  dropdown legacy nhưng đã có một owner chung
  `components/patient-search-dropdown.js` (token stale, vị trí nổi, bàn phím,
  click ngoài, render kết quả); caller chỉ cung cấp fetch và fill. Chuyển sang
  lõi chung ở trên là scope riêng, chưa duyệt.
- Các autocomplete danh mục nhỏ ở Tủ thuốc, địa chỉ, chỉ định chưa chuyển.
  Không coi lõi chung là đã migrate toàn bộ sản phẩm.

## Hình thức và tương tác

Thẻ đã chọn và input cùng một control. Thẻ có nút bỏ; tên dài wrap trong
bề rộng field. Label nằm ngoài; placeholder cùng font token giá trị nhập.
Dropdown nổi, không chiếm chiều cao form. DOM vẫn thuộc root field; native
Popover đưa riêng popup vào top layer tránh panel overflow cắt. JS chỉ
tính tọa độ/bề rộng/khoảng trống popup, không sửa chiều cao form/card.
Popup mở lên khi phía dưới thiếu chỗ, bám field khi cuộn/resize và đóng
khi control ra khỏi vùng cuộn.

Focus mở gợi ý; gõ có debounce. ↑/↓ chọn dòng, Enter thêm, Escape/Tab/blur/
click ngoài đóng. Khi đang ghép chữ bằng IME không gửi query/chọn bằng Enter;
commit chữ mới tìm. Chỉ mở một field mỗi lần. Cuộn gần cuối hoặc ↓ qua dòng
cuối tải tiếp, không có nút Xem thêm lớn. Tên kết quả tối đa hai dòng,
thông tin phụ một dòng, title giữ đầy đủ nội dung. Có loading/rỗng/lỗi/thử lại.

## Adapter và lifecycle

Popup lịch tái khám Doctor: Dịch vụ/Bác sĩ dùng macro và lõi chung, single
selection, adapter trong `re-examination-calendar.js`; lọc không dấu trên
catalog trả về cùng API lịch, không cho chọn mục disabled. Gõ khác nhãn
đã chọn clear ID và khóa xác nhận đến khi chọn kết quả. Hydrate silent,
đóng popup clear selection/query/request; schedule locked khóa cả hai ô.
Không đổi payload service_id/package_id/doctor_id hoặc save owner.

Adapter cung cấp `getKey/getLabel/getDescription/loadOptions/isEnabled/onChange`,
page size; không tự render/bind UI. `loadOptions(query, {skip, limit, signal})`
trả `{data, pagination: {per_page, has_next}}`; adapter đổi page/skip và
map payload API, throw khi lỗi để hiện thử lại.

Core sở hữu selection, open/close, active option, phân trang, request
revision, AbortController, debounce, listener cleanup. Close/reset/destroy
vô hiệu hóa kết quả cũ. `setSelected` mặc định silent để hydrate; onChange
cập nhật data owner workflow. Disabled/readonly/history không tìm/chọn/bỏ.

ICD vẫn lưu ID/mã theo caller. DAV field8 lưu JSON list tên/hàm lượng
vào `examinations.current_medications`, giữ tên legacy và dấu phẩy trong
tên đã chọn. Query transient không lưu/draft. Clear/render/restore của
component Khám reset lõi chung. Không thay hợp đồng backend hoặc ghi kho.

## QA

- `node --test tests/autocomplete-field.test.js tests/icd-pagination.test.js tests/doctor_current_medications.test.js`.
- `python3 scripts/check_frontend_contract.py`: một macro owner, wrapper ICD.
- Browser có dữ liệu thật ICD/DAV: nhiều lựa chọn, tên dài, tìm/rỗng,
  mouse/keyboard/remove, đóng/đổi bệnh nhân; desktop/mobile; popup không
  làm tăng chiều cao card và không bị cắt trong panel/modal.
- Chưa kiểm browser không được kết luận pass visual/interactive QA.
