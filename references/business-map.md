# QLPK Business Map

## Tủ thuốc — bỏ lịch sử giao dịch dưới từng lô (2026-09-19)

- Tab Lịch sử nhập hiển thị tám cột: Thuốc, Số lô, Hạn dùng, SL nhập,
  Còn lại, Đơn giá, Số hóa đơn, Ngày nhập. Không còn mũi tên hoặc bảng giao
  dịch xổ dưới lô. Số hóa đơn đọc `invoice_number`, trống hiển thị dấu gạch;
  Ngày nhập đọc `import_date`. Không trình bày mã NK tự sinh như chứng từ.
- Tiêu đề và giá trị cùng căn trái cho tên/mã/hóa đơn, giữa cho ngày,
  phải cho số lượng/giá. Bốn ô thông tin đầu form giữ nguyên nguồn dữ liệu,
  cùng cỡ chữ/độ đậm và căn trái; không cho sửa người thực hiện từ giao diện.
- Nhập kho → Lịch sử nhập, nút Lần nhập trong danh sách thuốc và Xem hạn dùng
  trong form thuốc tiếp tục dùng chung bảng này; giữ tìm kiếm, lọc và phân trang.
- Tủ thuốc không gọi API lịch sử giao dịch để trình bày chi tiết lô nữa.
  Chỉ bỏ giao diện và logic đọc tương ứng, không xóa giao dịch, lịch sử nhập,
  số tồn hoặc thay đổi cách cấp/hoàn thuốc. Owner: `medicine-management.html`,
  `medicine-management.js`, `pages/medicine-management.css`.

## Đối chiếu thuốc DAV — trình bày 2026-09-19

Người phụ trách kho liên kết thuốc theo ba bước: nhận diện thuốc trong kho,
tìm/chọn thuốc tương ứng trên DAV, kiểm tra thay đổi rồi lưu liên kết.
Hai khối đầu đặt cạnh nhau trên desktop, xếp dọc trên mobile. Thông tin thuốc
cần ghép đọc `current`, không dùng snapshot lịch sử để mô tả hiện trạng.
Bảng đối chiếu Đang lưu trong kho / Sau khi liên kết DAV đọc `rows` từ API,
bao gồm đường dùng và Nội/Ngoại khi server trả thêm; chỉ ô thay đổi được nhấn.
Thông báo tổng số khác biệt và cảnh báo trường đang có sẽ bị để trống nếu
DAV thiếu giá trị. Theo yêu cầu người dùng, không còn khối nhận diện DAV
bên dưới bảng (số đăng ký, dạng bào chế, nhà sản xuất, quy cách); gỡ cả phần
render/reset và CSS riêng. Dữ liệu nguồn và tìm kiếm vẫn giữ nguyên.
Trạng thái liên kết đã lưu tách riêng khỏi
thuốc đang chọn; chọn ứng viên khác không mô tả ứng viên đó là đã xác nhận.
Owner: template/CSS Tủ thuốc và `medicines/reference-review.js`. Dữ liệu vẫn
từ API reference-review; không đổi payload xác nhận, kho, lô hoặc giá.
Modal cao theo nội dung, giới hạn viewport và cuộn thân khi cần; không còn
hai card kéo đầy chiều cao. Khi tìm lại, xóa dữ liệu DAV cũ nhưng giữ thông
tin hiện tại; đóng/đổi thuốc xóa toàn bộ bản đối chiếu.

Tài liệu này là bản đồ nghiệp vụ cấp hệ thống. Đọc trước khi thiết kế hoặc sửa các màn vận hành như Lễ tân, Lịch hẹn, Bác sĩ, Tâm lý gia, Thanh toán, Đơn thuốc, Chỉ định. Mục tiêu là buộc mọi quyết định UI đi từ nghiệp vụ và dữ liệu thật, không đi từ cảm giác hoặc vài field rời rạc.

## Chỉ định khảo sát — trạng thái hiện hành 2026-09-05

Tạo chỉ định → Chuyển thực hiện; tạo link → Đã gửi khảo sát; bệnh nhân nộp,
lưu đáp án và tính điểm thành công → Có kết quả. Hết hạn khảo sát hoặc bác sĩ
bấm Kết thúc khảo sát → Hoàn thành, kể cả khi chưa có bài nộp. Lưu lý do kết
thúc; giữ nguyên kết quả đã có. “Xem kết quả” chỉ đọc, không chuyển trạng thái.
Một trạng thái backend dùng chung cho bảng và tiến trình. Bảng có hai tab:
Đang thực hiện (mọi trạng thái trừ completed, mặc định) và Hoàn thành.
Chỉ định không phải khảo sát giữ luồng Chuyển thực hiện → Hoàn thành.


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

Tủ thuốc (2026-09-10): người quản lý tạo danh mục ở tồn 0, rồi nhập kho theo
từng dòng thuốc–lô–ngày–giá–chứng từ. Cùng lô nhập nhiều lần khác giá giữ riêng
từng lần. Form danh mục vẫn sửa thông tin thuốc/giá bán nhưng các ô tồn và
giá vốn bị disable; backend cũng từ chối hai nhóm field này. Đã gỡ UI/API
kiểm kê thủ công ngày 2026-09-12; giữ lịch sử điều chỉnh cũ. Chi tiết tồn mở danh sách từng lần nhập/tồn đầu với
giá, chứng từ, chênh lệch tổng và thiếu giá; nút Lịch sử lọc đúng lần nhập,
có phân trang/nhảy trang và tồn sau giao dịch mới. Thiếu giá/lô kiểm thử
phải đối soát chứng từ, không tự sửa tồn hoặc gán giá. Thanh toán và báo cáo
SL bán tổng hợp theo thuốc chưa trở thành nghiệp vụ quyết toán theo lô.

Modal quản lý nhà cung cấp (2026-09-17) giữ luồng thêm/sửa/chọn hiện có,
không thay dữ liệu/API. Owner layout ở `medicine-management.html` và CSS
cùng trang: dialog cao theo viewport khả dụng, header/footer cố định;
desktop đủ cao dành phần thân còn lại cho bảng cuộn. Màn hẹp/thấp cuộn
toàn thân modal để form vẫn thao tác được; bảng chỉ cuộn ngang khi cần.

Form thêm/sửa thuốc (2026-09-17, user chốt): desktop ≥64rem giữ lưới 2×2
(cơ bản|giá & phân loại / quy cách|cảnh báo) và phải gọn trong một màn hình
không cuộn. Cân bằng bằng nội dung: mỗi ô đúng 2 hàng field (cơ bản 2×2,
giá & phân loại 2×2, quy cách = hàng số lượng + Quy cách, cảnh báo = 3 ô +
Ghi chú), header section một dòng; không chèn filler để giãn. Màn hẹp xếp
dọc theo trình tự nhập liệu. Owner layout: `medicine-management.html` +
CSS trang, JS không sở hữu layout.

Modal nhập kho theo đơn hàng (2026-09-17) cùng owner template/CSS trang:
dialog cao theo viewport khả dụng, header/footer giữ ngoài vùng cuộn. UI
đã thay bản kéo cao đơn thuần sau phản hồi visual fail: header trái, nhóm
thông tin đơn hàng dạng grid, vùng bảng trắng có toolbar/khung riêng kéo
hết phần còn lại trên desktop đủ cao. Tên thuốc ưu tiên chiều rộng, ô nhập
căn đầu dòng, số lượng/giá/thành tiền căn phải; nút xóa nhẹ và có nhãn.
Ghi chú và chi tiết lô nằm cạnh nhau phía dưới; chi tiết lô dài cuộn trong
4.5rem. Tổng đơn có một owner `batchTotalValue` ở footer cùng Hủy/Xác nhận,
bỏ alert xanh cũ. Màn hẹp/thấp cuộn thân modal, bảng giữ cuộn ngang; mobile
các nhóm xếp dọc. Không đổi API, chọn nhà cung cấp, tính tiền hoặc ghi kho.
JS chỉ đổi markup dòng/nhãn và câu rỗng khi reset, giữ ID/class nghiệp vụ.

Gộp "Chi tiết tồn kho" + "Lịch sử giao dịch" vào modal Nhập kho (2026-09-17):
theo yêu cầu user gộp 2 màn thành 1 màn tinh gọn, đã bỏ hẳn 2 modal cũ
`stockDetailModal`/`transactionHistoryModal`. Bản đầu dùng mục xổ 1 dòng
bị user chê "chưa đạt, thiếu phân cấp thị giác" nên đổi sang **2 tab**
trong cùng modal: tab "Nhập kho" (mặc định, y nguyên form đơn hàng) và
tab "Lịch sử nhập" (toolbar tìm theo tên thuốc/số lô + lọc trạng thái, bảng
lô, phân trang, chiếm toàn bộ chiều cao pane). Bấm một dòng lô mở lịch sử
giao dịch của đúng lô đó ngay bên dưới dòng (chỉ một dòng mở tại một thời
điểm), không mở modal thứ ba. Nút "x lần nhập" trong bảng danh mục và nút
"Xem hạn dùng" trong form thuốc đều mở modal Nhập kho và chuyển sang tab
Lịch sử nhập đã lọc theo đúng thuốc; nếu modal đang mở dở (đang nhập đơn
khác) thì không reset form, chỉ chuyển/lọc tab. Nhập kho xong vẫn đóng
modal như cũ (không tự động giữ mở). API `GET /medicine-batches/` thêm
tham số đọc `search` (tên thuốc/số lô) và `sort=recent`; không đổi cách
ghi lô, tính tồn hay giao dịch.

Quy tắc bốc thuốc user chốt 2026-09-12: một thuốc được bốc từ một số lô trên
bao bì, có thể lấy từ nhiều lần nhập của cùng lô đó. Tồn lô cộng các lần nhập;
giá vốn và lịch sử vẫn theo từng lần nhập. Chưa triển khai quy tắc này:
Lưu đơn hiện trừ/hoàn kho ngay, FEFO có thể đi qua nhiều số lô.
Tủ thuốc chọn thuốc từ DAV đã đồng bộ trong form thêm mới;
FK duy nhất nối thuốc nội bộ tới nguồn DAV. Không thêm màn danh mục mới.
Tên/hoạt chất/hàm lượng/nguồn gốc khóa theo nguồn được chọn; phòng khám đặt
đơn vị/quy đổi/giá bán. Quy trình chốt 2026-09-14: người dùng chỉ thêm thuốc
từ DAV, không có tính năng liên kết hoặc liên kết lại, cột/bộ lọc Nguồn DAV.
Sửa thuốc chỉ sửa cấu hình phòng khám; API cũng chặn đổi/xóa/cập nhật liên kết.
Đối chiếu và migrate thuốc cũ do đội triển khai thực hiện nội bộ, giữ
mã/giá/quy đổi/tồn/lịch sử, chặn quy cách rõ ràng không khớp và nguồn ghi
nhầm số lượng vào Hoạt chất; không tự đoán hoặc sửa dữ liệu nguồn. Bỏ lựa chọn
TPCN/y dụng cụ; không xóa hoặc tự đổi loại các bản ghi cũ. Excel cũng chỉ
tạo thuốc bằng mã nguồn DAV, dùng chung bộ kiểm tra với form. Thanh toán không phải sự kiện
xác nhận giao thuốc. Không tự xử lý tồn lệch bằng nhập số thực tế.

Luồng thêm/sửa: phần thông tin chỉ mở nhập sau khi
chọn DAV. User sau đó duyệt ảnh UI mới: bốn nhóm có header/icon/thanh màu,
hai hàng trên desktop, xếp dọc khi hẹp; không đổi quyền sửa theo nguồn.
Khối nguồn trên form (2026-09-17) là owner hiển thị duy nhất của danh tính
thuốc. Tiêu đề nằm ở phụ đề header modal (`medicineFlowGuide`): user chốt
"Thông tin đăng ký thuốc (Cục Quản lý Dược)" khi đã chọn/liên kết nguồn,
"Thông tin thuốc gốc (chưa liên kết Cục Quản lý Dược)" cho thuốc cũ, câu
hướng dẫn chọn danh mục khi chưa chọn. Khối chỉ còn các dòng có nhãn:
Tên thuốc (đậm), Hàm lượng (ẩn nếu đã nằm trong tên), Hoạt chất (ẩn nếu
trùng hệt tên), Dạng bào chế, Đóng gói, Nhà sản xuất, Nước sản xuất, SĐK.
Tên thuốc, hoạt chất, nguồn gốc và hàm lượng không còn ô hiển thị lặp lại
bên dưới; form giữ input ẩn cùng tên field để lưu/đổi thuốc như cũ, payload
vẫn loại identity phía client/API.
Đường dùng và Nội/Ngoại có nguồn
DAV thì khóa ở cả form và API; nguồn thiếu cho phép phòng khám bổ sung.
Migration nội bộ xem trước cả thay đổi đường dùng/Nội-Ngoại, không gộp sửa
giá hoặc quy đổi. Thuốc đã có tồn/lô/giao dịch không được đổi sang nguồn khác
hoạt chất/hàm lượng/dạng bào chế. Ghi lại lịch sử liên kết, giữ mã thuốc,
giá, quy đổi, tồn/lô và lịch sử đơn. Không đưa tên trường hoặc lỗi kỹ thuật
ra thông báo của form. User nhận QA giao diện; kiểm thử code dùng rollback.

Mapping thêm mới 2026-09-13: chọn DAV gợi ý đường dùng, Nội/Ngoại, đơn vị
dùng và quy đổi đóng gói rõ nghĩa. Người dùng xác nhận đơn vị/quy đổi trước
khi lưu, chỉnh tay khi nguồn không đủ/đa quy cách. Thông tin nguồn gốc được
hiển thị để đối chiếu; không suy loại đơn BASIC/H/N từ quốc gia. Thuốc cũ
đã có cấu hình/lô không bị áp lại gợi ý; giá/lô/tồn/lịch sử giữ owner hiện có.

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
