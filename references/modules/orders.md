# Orders Module Context

### Màn Quản lý chỉ định tách file (2026-09-28, lát69)

- `order-management.js` là lõi (config DASS, state, `apiCall`, dialog, bảng
  danh sách); phần còn lại là classic script `orders/order-management-{detail,
  survey,survey-results,files,actions,init,survey-level}.js`, nạp đúng thứ tự
  template, chỉ khai báo top-level; bootstrap `initializePage` ở slice cuối.
  Tham chiếu chéo khai báo bằng `/* global */`/`/* exported */`.
- `loadOrderSurvey` tách: `loadOrderSurveyForTemplate` → `resolveSurveyExaminationId`
  → `loadIndicationSurveyTemplates` → `loadSurveySessionStatus` →
  `loadExaminationSurveyResponses`; giữ thứ tự request và kiểm `isCurrent()`.
- Test đọc nguồn qua `tests/helpers/order-management-source.js` (JS) và
  `read_order_management()` (Python contract).

### Bỏ lịch sử riêng trong Tạo chỉ định (2026-09-21)

- Shared panel Doctor/Tâm lý gia chỉ còn chỉ định của lượt khám hiện tại.
  Đã bỏ nút Lịch sử, bảng riêng, fetch/cache/render và listener độc quyền
  trong `doctor-indications-form.js`; không thay đổi draft/save/realtime.
- Lịch sử khám chung và endpoint lịch sử chỉ định theo bệnh nhân vẫn giữ.

### Ghi chú kết quả chỉ định nhập tay (2026-09-10)

- `order-management.js` thay placeholder không có mẫu khảo sát bằng ô
  “Ghi chú kết quả” cho chỉ định không có `survey_template_id`.
- Đọc/ghi trường sẵn có `chi_dinh.note_nurse` qua GET/PUT chi tiết; tự lưu
  khi rời ô, có nút Lưu ghi chú để lưu/thử lại. Không ghi khi tải dữ liệu.
- Hàng đợi lưu giữ đúng thứ tự thay đổi và ID chỉ định; phản hồi cũ không
  cập nhật ca mới. Đổi trạng thái đợi lưu ghi chú thành công trước khi PUT.
- Không thêm ghi chú vào khảo sát; giữ file đính kèm và lifecycle hiện tại.
- QA: syntax/frontend contract và 4 ca Node (load/clear, lưu liên tiếp,
  lỗi/thử lại, đổi ca) đạt. Firefox desktop đã lưu trên chỉ định QA 500,
  đối chiếu PostgreSQL giữ tiếng Việt/xuống dòng; ghi chú kiểm thử đã dọn.
  Chưa pass visual/interactive QA đầy đủ trên ca thực và màn hình nhỏ.

### Badge nơi thực hiện trong workspace khám (2026-09-09)

- `doctor-indications-form.js` hiển thị `location_type` thành badge trung tính
  ngay sau tên chỉ định trong danh sách hiện tại. Cột Nơi thực
  hiện chỉ chứa người thực hiện hoặc tên cơ sở ngoài. Dùng shared
  `qlpk-feedback-token`; tên dài được xuống dòng, badge giữ nguyên cụm chữ.
- Đây là thay đổi presentation, không đổi payload hoặc lifecycle lưu.

Mẫu khảo sát và chấm điểm: xem `references/modules/surveys.md`. CLS lấy các
hàng grid/câu hỏi từ snapshot response để ghép đáp án; kết quả theo cấu hình
được lưu khi nộp. Trạng thái chỉ định vẫn dùng lifecycle 4 trạng thái hiện hành.

### Catalog Removal (2026-08-31)

- Nguồn `catalog` đã bị loại khỏi Doctor và Tâm lý gia; chỉ còn `custom` và
  `survey`.
- Màn quản trị/API/model catalog đã nghỉ. Migration
  `20260831_drop_order_catalog` archive dữ liệu rồi drop `order_categories`,
  `order_items`, `chi_dinh.order_item_id` và `chi_dinh.group_path`; migration
  `20260831_drop_order_catalog_perm` dọn quyền và shortcut cũ.
- `chi_dinh.order_name` là snapshot tên chỉ định; không suy ra catalog từ tên.

Tài liệu này là context ngắn cho workflow chỉ định cận lâm sàng/orders. Đọc khi sửa chỉ định theo appointment, màn quản lý chỉ định, upload/download file kết quả, hoặc API `/api/chi-dinh` và lookup mẫu khảo sát.

## Typography, màu và nút màn quản lý Chỉ định CLS (2026-09-05)

### Link khảo sát và QR (2026-09-06)

- Nút tạo link ghi “Tạo link khảo sát” khi chưa có URL, “Tạo lại link khảo
  sát” khi API trả link hiện tại. Đây là tạo/hiển thị link, không gửi tin nhắn.
- `_session_link_payload` trong API survey_sessions sinh cùng URL + QR cho
  POST generate và GET status. FE đọc cả hai từ GET hiện tại, bỏ cache
  `survey_session_order_*` để mở lại/đổi trình duyệt không mất QR hoặc lấy
  QR/link của phiên cũ. QR đặt bên phải tiến trình trong cột trái; khung hẹp tự xếp dưới
  timeline. Khi nằm cạnh nhau, timeline quyết định chiều cao hàng; QR fit
  trong đúng chiều cao đó bằng CSS, giữ tỉ lệ vuông, không caption kéo dài
  card và không đo/set chiều cao bằng JavaScript. Phần link ở cột phải. Render/reset survey đồng thời cập nhật hoặc
  xóa QR, không giữ QR của chỉ định cũ khi đổi/đóng/tải lỗi.
- Tạo lại giữ phiên còn hiệu lực, token/hạn/nháp theo contract generate cũ;
  không tự đổi token hoặc xóa bài đang làm. Có kết quả/hoàn thành vẫn khóa tạo.

### Chi tiết chỉ định một màn hình (2026-09-06)

- Bỏ tab Thông tin/Khảo sát, các tab-pane, Bootstrap tab listener và điều
  kiện tab active. `loadOrderDetail` gọi `loadOrderSurvey` ngay khi mở;
  realtime refresh nội dung trực tiếp. Hai tab trạng thái của bảng danh sách
  Đang thực hiện/Hoàn thành vẫn giữ nguyên.
- Giữ giao diện cũ theo yêu cầu người dùng: nền kem, card trắng, tiến trình
  dọc, từng nhóm kết quả có tiêu đề nâu và vùng đáp án/điểm/mức độ như trước.
  Chỉ cấu trúc lại khi bỏ tab: cột trái thông tin bệnh nhân → tiến trình →
  file đính kèm; cột phải khảo sát/kết quả. Hai cột stretch bằng chiều cao
  trên desktop; card file và card khảo sát giãn phần còn lại. Modal rộng
  96%, mobile xếp một cột theo nội dung, Roboto 13px.
- Bỏ ô Ghi chú xử lý và listener autosave khỏi modal; bảo toàn dữ liệu
  `note_nurse` đã lưu ở backend. File hiển thị trực tiếp trong sidebar;
  danh sách dùng tên file ở dòng riêng, loại/ngày tải/nút tải-xóa bên dưới
  để không ép tên file vào cột bảng hẹp. Giữ handler chọn/kéo thả/tải/xóa.
- Không tự chuyển kết quả sang bảng phẳng, đổi timeline ngang, thu gọn các
  khối hay thay phong cách khi yêu cầu chỉ là gộp/cấu trúc lại màn hình.
- Hàng đầu khảo sát: tên chỉ định bên trái, các nút cùng hàng bên phải.
  Bỏ dropdown trạng thái của khảo sát; badge dùng chung nằm ngay cạnh nhãn
  “Khảo sát”/“Kết quả khảo sát” phía dưới, cập nhật cùng timeline. Chỉ định
  thường vẫn giữ control đổi trạng thái riêng. Màn hẹp cho nút xuống hàng.
- `renderSurveyActions` là owner duy nhất cho Tạo/Tạo lại link, Xem kết quả và Kết thúc.
  Không lặp trạng thái/ngày chỉ định trong phần khảo sát. Chỉ định thường
  vẫn có file và trạng thái, không có thao tác khảo sát.
- Request version chặn response cũ khi đổi/đóng order. Modal chỉ gắn một
  listener đóng; khi mở order tiếp theo trong lúc animation đóng chưa xong,
  chờ hidden và không cho sự kiện đóng cũ xóa context mới. Load mức độ khảo
  sát kiểm order trước khi điền để tránh dữ liệu cũ lẫn vào màn mới.

- `app/static/css/pages/order-management.css` là owner presentation của danh
  sách và modal chi tiết. Các biến `--om-*` tham chiếu bảng màu chung:
  `--om-brand` lấy `--qlpk-header-bg`, nền/viền/chữ lấy `--qlpk-color-*`
  với fallback tương ứng để trang nhúng vẫn hiển thị đúng khi token chưa tải.
- Tiêu đề bảng/modal/nhóm kết quả, tab active, focus input, badge tổng số,
  hover dòng và dropzone dùng tông nâu–kem chung. Không dùng lại xanh ngọc
  hardcode cho các điểm nhấn thương hiệu của màn này.
- Badge trạng thái vẫn phân biệt info/warning/success, tác vụ xóa vẫn đỏ;
  dấu timeline hoàn thành lấy `--qlpk-feedback-success`. Không đổi trạng thái
  nghiệp vụ theo màu hoặc nhãn hiển thị.
- Template phải tải trực tiếp `shared/typography.css`, `shared/color-tokens.css`,
  `shared/icon-tokens.css` và `shared/icon-system.js`: trang iframe `?embed=1`
  không được phụ thuộc vào loader header của trang cha để nhận font/token.
  Dùng Roboto từ shared typography; nội dung, input và nút 16px; nhãn,
  metadata, badge và tiêu đề cột 14px; tiêu đề modal 18px. Không thu nhỏ chữ
  để ép vừa bảng hoặc modal. Các cỡ chữ lấy token, không tạo font family riêng.
- Nút có chữ dùng `qlpk-icon-text-button` với `om-button`; tác vụ bảng/file
  dùng `QLPKIconSystem.renderActionButton`, giữ nguyên selector/data ID cho
  handler. Phạm vi `.om-page` đổi token view/edit/download về nâu; delete
  giữ danger. Làm mới dùng nền trắng/viền nâu, gửi link và đính kèm dùng
  primary nâu. Không để `btn-primary` Bootstrap kéo nút trở lại màu xanh.
- Chuỗi layout hiện hành: workspace shell/iframe -> main full-width ->
  card-wrap -> toolbar flex-wrap + `om-table-scroll` + footer. Main giữ
  `overflow-x: hidden`; wrapper bảng sở hữu cuộn ngang, bảng rộng tối thiểu
  64rem và vùng cuộn có tên truy cập/focus bàn phím. Modal dialog 96%, body
  cuộn dọc, grid chi tiết dùng minmax 1:3; dưới 48rem chuyển một cột, các
  khối kết quả cũng xếp dọc để chữ lớn không bị cắt.
- QA 2026-09-05: Firefox đã kiểm dữ liệu thật một chỉ định, modal Thông tin
  và kết quả HADS trên desktop/mobile `390x844`. Computed font Roboto,
  body/ô bảng/nút 16px, nhãn/tiêu đề cột 14px; header/nút primary
  `rgb(75, 39, 25)`. Mobile đã cuộn tới tác vụ cuối bảng bằng focus bàn phím
  và tới ô điểm cuối modal. Chưa pass visual/interactive QA cho bảng nhiều
  dòng/phân trang, file có dữ liệu và các trạng thái chưa có mẫu thật.
  Console có lỗi kết nối Socket.IO, chưa thể coi toàn màn console sạch.
  Chi tiết QA nằm ở `references/refactor-progress.md`.

## Liên kết câu trả lời và điểm khảo sát (2026-09-05)

- Trace read-only trên một response HADS thật xác nhận dữ liệu `responses`
  có câu trả lời nhưng `total_scores` thiếu một nhóm. Template chứa câu hỏi
  và đáp án có ID rỗng; `patient-survey.js` tạo question ID `temp_*` gắn
  timestamp chỉ ở frontend. Backend scorer tìm ID của template nên bỏ qua
  câu trả lời dưới mã tạm; dữ liệu trả lời vẫn tồn tại trong database.
- Đã sửa: `app/utils/survey_scoring.py` là owner normalize ID khi ghi mẫu
  và tính điểm cho mọi writer/recalculate trong `survey_responses.py`.
  ID có sẵn được giữ; ID thiếu được cấp khi tạo/lưu template, không cấp
  ngẫu nhiên ở màn bệnh nhân. Editor giữ ID trong DOM và payload khi lưu lại.
- Scorer ưu tiên khớp ID chính xác. Đáp án legacy không có ID chỉ được đọc
  bằng index bắt đầu từ 0, đúng với writer frontend. Không đoán điểm từ
  nhãn đáp án. Mã lạ/trùng, điểm chưa cấu hình hoặc câu bắt buộc bỏ trống
  phải bị từ chối; không lưu tổng điểm một phần và báo thành công.
- API trả `400 SURVEY_ANSWER_MISMATCH` và rollback khi không chấm được;
  dữ liệu hợp lệ đã lưu phải được giữ nguyên. Template đã có response phải
  giữ các ID hiện hữu, trả `SURVEY_TEMPLATE_IDENTITY_CONFLICT` nếu thay đổi
  làm mất liên kết. Template legacy thiếu ID và đã có kết quả cần xử lý dữ
  liệu có đối chiếu hoặc tạo mẫu mới, không tự đổi mã khi đọc.
- CLS dùng response mới nhất thuộc template đã chỉ định, không chọn bài cũ
  chỉ vì bài đó có điểm. Nhóm thiếu key điểm hiện “Chưa tính được”; điểm 0
  có thật vẫn hiện 0. Câu trả lời ghép đúng question ID; bỏ tìm gần đúng
  theo tiền tố nhóm và bỏ suy diễn đáp án theo nhãn DASS khi không khớp.
- QA qua giao diện: mẫu 32, hồ sơ `QA-CLS-20260905`, appointment 1242,
  examination 1129, chỉ định 10, response 7. Tạo mẫu bốn câu trên editor,
  tạo link từ CLS, tự trả lời/nộp qua màn bệnh nhân: nhóm A = 0+2 = 2,
  nhóm B = 3, nhóm C = 0. DB và CLS khớp sau reload và lưu lại mẫu.
  Thử payload mã lạ qua HTTP trả 400, không đổi response đã lưu.
- Chưa backfill câu trả lời/điểm của bệnh nhân cũ. QA này xác nhận luồng
  trắc nghiệm bốn câu trên desktop; chưa pass visual/interactive QA riêng
  cho mọi dạng lưới/checkbox/thang tuyến tính. Các nhánh scorer liên quan
  có unit test; không coi unit test là browser QA của các dạng đó.

## Màu màn bệnh nhân làm khảo sát (2026-09-05)

- `patient-survey.html` tải `shared/color-tokens.css` trước CSS page.
  `pages/patient-survey.css` ánh xạ brand/ink/background về chocolate,
  brown, cream và border/text chung; không giữ bảng màu xanh riêng.
- Header, progress, đáp án checked/focus, nút tiếp/quay lại/nộp bài và
  preview/completion dùng nâu–kem. Success/error/warning giữ feedback token
  theo ngữ nghĩa. Nút disabled dùng nền kem/chữ muted rõ thay cho opacity thấp.
- Layout giữ nguyên: container max-width -> hero grid -> progress flex ->
  survey-content/card -> actions sticky; grid câu hỏi sở hữu cuộn ngang.
  Không đổi câu hỏi, payload, phiên khảo sát hoặc cách chấm điểm.
- Browser QA desktop trên mẫu QA 32: trạng thái chưa chọn, checked, nút
  disabled/enabled và chuyển câu đạt; chưa pass visual/interactive QA
  riêng cho completion/expired, mobile và câu hỏi lưới của lát đổi màu này.

## Trace sau hoàn thành khảo sát (2026-09-05 — chưa sửa)

- Ca QA order 10 / examination 1129 / template 32: DB xác nhận response 7
  có bốn đáp án, tổng nhóm A=4, B=0, C=1 sau lần bệnh nhân làm lại; session
  59 và 60 đều `completed`, nhưng `chi_dinh.status=sent`,
  `is_completed=false`. Đây là hai nguồn trạng thái chưa được nối lifecycle,
  không phải badge dùng cache hoặc câu trả lời chưa lưu.
- `renderSurveyResultsUI` trong `order-management.js` chỉ render nút
  `sendSurveyLinkBtnResults`; handler gọi generate để tạo session `pending`
  mới. Không có action xem bài đã nộp theo response ID. Không dùng generate
  như action xem kết quả.
- Writer `survey_responses.py` lưu đáp án/điểm; patient JS gọi riêng endpoint
  update-status để hoàn thành session; endpoint session chỉ cập nhật session
  và phát notification/event. Không owner nào ở luồng submit cập nhật order.
- Response hiện được upsert theo patient/examination/template, không có
  session_id/order_id; session cũng chưa lưu template_id/order_id. Endpoint
  trạng thái lấy session mới nhất của examination. Cần giải quyết liên kết
  này trước khi tự chuyển trạng thái chỉ định, đặc biệt lượt có nhiều mẫu.
- Phương án cần xác định nghiệp vụ: action xem bài đã nộp read-only, hiển thị
  câu hỏi/đáp án chọn từ response đã lưu; phân biệt bệnh nhân đã nộp với bác
  sĩ xác nhận hoàn tất chỉ định. Nếu cần bác sĩ duyệt, bổ sung trạng thái
  “Có kết quả” thay vì để `sent`; nếu nộp bài đồng nghĩa hoàn tất, backend
  phải cập nhật đúng order sau lưu thành công. Chưa triển khai phương án.
- QA lần tới phải kiểm submit -> danh sách/filter -> mở bài đã nộp -> reload,
  xem bài không phát sinh write/session mới, và không cập nhật chỉ định khác.

## Trạng thái chỉ định thống nhất (2026-09-05 — đã triển khai)

Contract hiện hành đã được người dùng chốt lại: Có kết quả khi nộp bài;
Hoàn thành khi hết hạn hoặc bác sĩ kết thúc. Các phần trace cũ không còn
định nghĩa trạng thái hiện hành.

- Chỉ có `sent` = Chuyển thực hiện, `survey_sent` = Đã gửi khảo sát,
  `has_result` = Có kết quả, `completed` = Hoàn thành. `chi_dinh.status` là nguồn duy nhất cho bảng,
  filter, dropdown, phần khảo sát và timeline. `is_completed` được suy ra
  và có DB constraint đồng nhất với `status`.
- `services/survey_lifecycle.py` sở hữu chuyển trạng thái. Tạo chỉ định luôn
  `sent`; generate link theo `order_id` chuyển `survey_sent`; POST nộp bài
  dùng session token, kiểm đúng patient/examination/template/order, chấm
  điểm, lưu response và cập nhật session completed + order has_result trong
  cùng transaction. Hoàn thành do hết hạn hoặc bác sĩ bấm Kết thúc khảo sát.
  Chỉ định custom giữ Chuyển thực hiện → Hoàn thành.
- Session lưu `order_id`, `survey_template_id`; response lưu `order_id`,
  `session_id` (unique khi có), `template_snapshot`. Bài mới không upsert
  đè bài cũ theo patient/examination/template. Submit cùng session và cùng
  đáp án trả lại kết quả đã lưu; đáp án khác sau nộp bị chặn.
- Session pending/in_progress/expired/closed chỉ quản lý hiệu lực link;
  không dùng chúng làm bộ trạng thái chỉ định thứ hai trên UI. Hạn 24 giờ
  được ghi vào `chi_dinh.survey_expires_at`. Generate lặp dùng lại link còn
  hiệu lực; chỉ định Có kết quả/Hoàn thành không tạo lại link hoặc hạ trạng thái.
- `POST /api/chi-dinh/<id>/finish-survey` kiểm quyền bác sĩ/TLG/admin và phạm
  vi lượt khám/người được giao. Ghi completed_at, completion_reason=doctor,
  completed_by. Hết hạn ghi reason=expired tại mốc hạn; giữ bài đã nộp.
  Không có bài vẫn được kết thúc nhưng không được tạo điểm/kết quả giả.
- Service xử lý hạn trước mỗi request order/session/response; trang CLS
  hẹn một lần refresh theo next_expiry_at backend. Chưa có scheduler nền;
  khi không ai gọi API, việc lưu trạng thái hết hạn chờ request kế tiếp.
- Hai tab Đang thực hiện (mặc định, status != completed) và Hoàn thành.
  Query trả group_counts theo cùng quyền/tên/ngày, trước phân trang và lọc
  trạng thái. Bỏ dropdown và ô tổng trùng lặp. Đổi tab giữ tên/ngày.
  Bố cục 2026-09-06: hai tab nằm đầu cùng toolbar, trước ô tìm bệnh nhân,
  ngày và Làm mới. Desktop ô tìm tối đa 30rem, nhóm bộ lọc căn phải; từ
  viewport nhỏ hơn 64rem ô tìm xuống hàng, toolbar tự wrap. Không còn
  hàng tab riêng; vùng cuộn ngang bảng và logic lọc giữ nguyên.
  Typography đã đồng bộ lại theo yêu cầu 2026-09-06: Roboto, chữ nghiệp vụ
  13px (`--qlpk-font-size-base`) cho bảng/tab/bộ lọc/nút/modal; small 12px,
  tiêu đề modal 16px. Không còn thang chữ chính 16px riêng của CLS. Không
  sửa typography của app header hoặc các màn khác.
  Footer có Trước/Sau và nhập số trang khi có nhiều trang; thứ tự theo
  created_at DESC, id DESC để không đảo các row cùng thời điểm tạo.
- Form bác sĩ/TLG không sở hữu trạng thái của row đã lưu; backend giữ trạng
  thái hiện hành khi nhận snapshot form cũ và chặn bỏ row đã gửi/hoàn thành.
  Template đã gửi không được đổi; component khóa sửa row đã gửi/hoàn thành.
- `GET /api/chi-dinh/<id>/survey-result` có auth và kiểm quyền appointment
  hoặc người được giao chỉ định. Nút “Xem kết quả” mở tab mới tại
  `/patient-survey.html?review_order_id=<id>`, dùng lại renderer và điều hướng
  từng câu của giao diện người điền. Không còn khối `surveySavedAnswers` ở CLS.
  Trang review lấy cấu trúc, đáp án và tên/điện thoại bệnh nhân từ API có auth
  trên; không dùng token link làm bài, không gọi generate/update session/submit,
  không đọc/ghi bản nháp localStorage. Các input bị khóa và lựa chọn đã lưu
  được đánh dấu; không có Bắt đầu lại/Nộp bài. Điều hướng nằm dưới câu hỏi,
  không sticky che đáp án trên mobile. Không đăng nhập/không có quyền phải
  hiện thông báo. Chưa có câu trả lời vẫn xem được mẫu khóa input với tiến độ 0%.
  Review hoạt động cả lúc đang làm, Có kết quả và Hoàn thành; đang mở tự GET
  mỗi 3 giây, giữ câu bác sĩ đang xem, dừng khi chỉ định Hoàn thành.
  Bài mới đọc cấu trúc đã cố định theo session; bài cũ chưa có snapshot đọc mẫu gốc
  hiện hữu, không tuyên bố có lịch sử mẫu bất biến cho dữ liệu trước migration.
- Tiến độ live (2026-09-06): `survey_sessions` sở hữu `draft_responses`,
  `draft_revision`, `draft_updated_at`, `template_snapshot`. Chọn/gõ đáp án
  autosave sau 500ms; trạng thái lưu hiện ở đầu bài. Mất mạng giữ bản nháp
  theo session trong trình duyệt và thử lại; bác sĩ chỉ thấy phần đã đồng bộ.
  `GET/PUT /api/survey-sessions/draft` được bảo vệ bằng token bí mật của đúng
  phiên; PUT kiểm patient/examination/template, mã đáp án và revision, khóa
  order trước session giống submit/finish. Revision cũ khác nội dung trả 409;
  nộp/đóng/hết hạn trả 410. Không chấm điểm chính thức hoặc chuyển Có kết quả
  vì lưu nháp. Nộp bài dùng snapshot của session để tính điểm và lưu response.
  Sau đóng/hết hạn giữ phần nháp đã lưu, hiện “Đã kết thúc — chưa nộp bài”.
  UI người điền cũng phục hồi từ server, khóa toàn bộ câu sau nộp/đóng/hết hạn.
  Không thể khôi phục tiến độ cũ chỉ nằm trong trình duyệt trước bản cập nhật.
- Timeline dùng bốn mốc: `created_at`, `survey_sent_at`, `result_at`, `completed_at`.
  Bước Có kết quả chưa xảy ra không được tô xanh khi kết thúc chưa nộp bài.
  Response mới ghi timestamp aware UTC; session API xuất UTC có Z, patient
  UI chuyển sang Asia/Ho_Chi_Minh đúng một lần. Không backfill giờ lịch sử.
- Migration `20260905_order_survey_lifecycle` bổ sung FK/index/check/unique,
  chỉ liên kết dữ liệu cũ khi duy nhất, chuyển draft/processing cũ về sent
  rồi nhận diện survey_sent qua session liên kết. Không sửa đáp án/điểm cũ.
  `scripts/reconcile_survey_order_status.py` audit mặc định; `--apply` chỉ
  ghi Có kết quả cho bài có đủ mã/câu trả lời và điểm đã lưu khớp scorer.
- Migration `20260905_order_survey_closure` thêm mốc hạn/kết quả/lý do/người
  kết thúc. Survey completed cũ có response liên kết được đổi về has_result;
  chỉ định quá hạn được completed với reason expired. Đáp án/điểm không đổi.
- Local: order 10 / response 7 đủ điều kiện Có kết quả; order 9 / response 6
  HADS thiếu dữ liệu vẫn giữ nguyên bài cũ, hiện Hoàn thành do đã hết hạn,
  không phải do được xác nhận kết quả hợp lệ. Ca QA cũ order 56 / session 84 /
  response 17: A=2,B=3,C=0, giữ kết quả sau chuyển lifecycle.
  Ca QA 11 cũng được giữ; phiên này tạo trước lát sửa timezone nên giờ bắt
  đầu lịch sử của nó không được dùng làm bằng chứng cho writer mới.

## Ownership

- `chi_dinh`: chỉ định theo appointment, người/đơn vị thực hiện, trạng thái xử lý, ghi chú điều dưỡng/bệnh nhân, ngày hẹn thực hiện và file kết quả.
- `survey_templates`: có thể được tham chiếu khi chỉ định là khảo sát tâm lý;
  `default_performer_id` là người thực hiện mặc định tùy chọn của bài test.
- `appointments`, `patients`, `examinations`: chỉ được đọc để enrich response orders; không dùng orders để ghi đè dữ liệu khám/bệnh nhân.

Chỉ định vẫn có hai nguồn dữ liệu: `custom` nhập tên tự do (chỉ lưu
`order_name`) và `survey` chọn từ `/api/survey-templates-for-orders` (lưu
`survey_template_id`). Form Doctor/Tâm lý gia không yêu cầu chọn loại: chỉ có
một ô nhập duy nhất. Nếu người dùng chọn một mẫu trong gợi ý thì payload là
`survey`; nếu chỉ gõ nội dung thì payload là `custom`. Mọi nguồn dùng
`order_name` làm tên hiển thị; tên này không vượt quá 255 ký tự theo schema.
Không còn nguồn catalog, bảng catalog, hay cột liên kết catalog.

Không lưu thông tin chẩn đoán, lời dặn hay dữ liệu khám chính vào `chi_dinh`. Diagnosis trong response đọc chỉ là display/enrichment từ appointment/examination.

## Module Island Hiện Tại

- `app/modules/orders/api/chi_dinh.py`: routes cho `/api/chi-dinh`, gồm list/detail/save theo appointment, update/delete, batch delete, upload/delete/download file kết quả.
- `app/modules/orders/api/survey.py`: route `/api/survey-templates-for-orders`.
- `app/modules/orders/services/clinical_order_query.py`: owner cho query/filter/pagination của `GET /api/chi-dinh`.
- `app/modules/orders/services/clinical_order_mutation.py`: owner cho load/upsert/update/delete/batch delete chỉ định theo appointment.
- `app/modules/orders/services/result_file_service.py`: owner cho upload/delete/download file kết quả và metadata `result_files`.
- `app/modules/orders/view_models/clinical_order.py`: owner cho response shape đọc/list/detail của `chi_dinh`, gồm appointment/patient/doctor enrichment, diagnosis display contract và shape mẫu khảo sát.
- `app/static/js/orders/order-status-utils.js`: shared frontend helper thuần cho nhãn và CSS class của trạng thái chỉ định ở màn bác sĩ/tâm lý gia.
- `app/static/js/orders/order-selection-state-utils.js`: shared frontend helper thuần cho remove/clear/update status, upsert từ form submit, build payload save, merge trạng thái completed từ server, apply response save và map server orders về selected orders ở màn bác sĩ/tâm lý gia; orchestrator vẫn gán state, render, toast, gọi API save/load và gọi save/autosave.
- `app/static/js/orders/order-autocomplete-utils.js`: shared frontend helper cho search match, render HTML dropdown, keyboard navigation, hover active state và hide/reset autocomplete form chỉ định ở màn bác sĩ/tâm lý gia.

Luồng nguồn chỉ định hiện tại: Doctor và Tâm lý gia dùng một ô nhập chung.
Autocomplete luôn gợi ý mẫu `survey`; chọn mẫu sẽ gắn
`survey_template_id` và gợi ý performer từ `default_performer_id` trả về bởi
`/api/survey-templates-for-orders`. Nếu không chọn gợi ý, nội dung được lưu
là `custom`. Performer vẫn là ID trong payload `chi_dinh` và người dùng có
thể đổi trước khi lưu.

Ở bảng chỉ định của Doctor/Tâm lý gia, tên chỉ định được hiển thị trực tiếp
không kèm badge nguồn `Nhập text`/`Khảo sát` để giữ bảng gọn. `source` vẫn được
giữ trong runtime/payload để edit, restore và backend phân biệt dữ liệu.

Tab Khảo sát của màn quản lý chỉ định cũng dùng `chi_dinh.survey_template_id`
làm nguồn mẫu duy nhất. Nó chỉ hiển thị mẫu đã gắn ở dạng read-only; không cho
đổi sang mẫu khác từ tab này và chỉ lọc kết quả thuộc đúng template đó.
- `app/api/chi_dinh.py`: wrapper tương thích cho import path cũ, không đặt logic mới ở đây.
- `main.py`: register blueprint từ module path mới nhưng giữ nguyên URL prefix.

## Mapping Phase 5

- Cũ: `app/api/chi_dinh.py` -> Mới: `app/modules/orders/api/chi_dinh.py`.
- Response builder list/detail chỉ định tách từ `app/modules/orders/api/chi_dinh.py` -> `app/modules/orders/view_models/clinical_order.py`.
- Query/filter/pagination của `GET /api/chi-dinh` tách từ `app/modules/orders/api/chi_dinh.py` -> `app/modules/orders/services/clinical_order_query.py`.
- Load/upsert/update/delete/batch delete chỉ định tách từ `app/modules/orders/api/chi_dinh.py` -> `app/modules/orders/services/clinical_order_mutation.py`.
- Upload/delete/download file kết quả tách từ `app/modules/orders/api/chi_dinh.py` -> `app/modules/orders/services/result_file_service.py`.
- Lookup mẫu khảo sát cho orders nằm tại `app/modules/orders/api/survey.py` và dùng chung query/view-model owner.
- URL giữ nguyên cho workflow còn dùng: `/api/chi-dinh/...`, `/api/survey-templates-for-orders`.
- Màn quản trị catalog, các route `/api/order-categories` và `/api/order-items`, cùng model/service/view-model catalog đã được loại bỏ.

## Contract Cần Giữ

- `GET /api/chi-dinh/appointment/<appointment_id>` trả `{ chi_dinh: [...] }` cho màn bác sĩ/tâm lý gia và kiểm tra `appointment_access_error`.
- `POST /api/chi-dinh/appointment/<appointment_id>` kiểm tra `appointment_access_error`, sau đó upsert danh sách chỉ định và xóa item không còn trong payload như legacy.
- `GET /api/chi-dinh/patient/<patient_id>?exclude_appointment_id=<id>` trả lịch sử chỉ định theo bệnh nhân trong phạm vi quyền clinical access; không dùng filter tên để xác định patient.
- `GET /api/chi-dinh` trả list quản lý chỉ định với pagination và enrich appointment/patient/doctor.
- `GET /api/chi-dinh/<id>` trả detail chỉ định cùng appointment/patient/doctor.
- Upload/delete/download result files phải giữ nguyên đường dẫn và metadata `result_files`.
- `GET /api/survey-templates-for-orders` giữ envelope `success`, `data`, `total`.

Contract bổ sung sau đợt siết logic 2026-09-01:

- Mọi route chỉ định theo `chi_dinh_id` (detail/update/delete/batch và file kết
  quả) phải kiểm tra `appointment_access_error`; route khảo sát nội bộ phải
  kiểm tra scope từ `examination_id` về appointment.
- Backend chỉ nhận `status` thuộc `draft/sent/processing/completed`, vị trí
  `in/out`, tên chỉ định không rỗng và tối đa 255 ký tự, người thực hiện đang
  hoạt động đúng vai trò, ngày hợp lệ và cờ hoàn thành dạng boolean. Payload
  sai trả `400`, không làm thay đổi dữ liệu.
- Phân trang `GET /api/chi-dinh` yêu cầu số nguyên dương và giới hạn
  `per_page` tối đa 100; page vượt tổng được quy về page cuối.
- `ChiDinh.survey_template_id` là nguồn mẫu khảo sát chuẩn. Chỉ định nhập text
  không mở luồng gửi khảo sát; link khảo sát chỉ được tạo từ template active
  đã gắn vào chính lượt khám và phản hồi status trả lại `template_id`.
- File kết quả mới chỉ nhận PDF/JPG/PNG/DOC/DOCX, tối đa 25MB; tên lưu trữ và
  đường dẫn luôn được chuẩn hóa, không cho phép path traversal.
- `chi_dinh.is_completed` luôn nhất quán với `status == completed`. PUT cập
  nhật `status` đồng bộ cờ hoàn thành; caller legacy chỉ gửi
  `is_completed=true` được chuyển sang `completed`, còn bỏ hoàn thành bằng
  cờ riêng trên bản ghi đã hoàn thành bị từ chối rõ ràng.

Notification và kết quả khảo sát (2026-09-01):

- Khi POST đồng bộ chỉ định, chỉ người thực hiện trong cơ sở mới nhận
  notification `clinical_order_assigned` (dòng mới) hoặc
  `clinical_order_reassigned` (đổi người). Chỉ định ngoài cơ sở không tạo
  notification; payload có `order_id`, `appointment_id`, `performer_id` và
  khóa chống gửi lặp.
- Khi `survey_session` chuyển thật sang `completed`, người thực hiện của
  chỉ định khảo sát nhận notification `survey_completed` một lần cho mỗi
  session. Trạng thái `chi_dinh` không bị frontend suy diễn hoặc tự đổi theo
  nhãn; timeline quản lý chỉ định đọc session status để phản ánh đúng tiến độ.
- Endpoint public chi tiết mẫu khảo sát trả thêm `questions_by_criteria`.
  Tab Khảo sát dùng field này và fallback `created_at` của response để hiển
  thị kết quả ngay cả khi `updated_at` rỗng.

Validation thực tế 2026-09-01: sửa dropdown rỗng để chỉ hiển thị thông báo mà
không chặn pointer lên radio bên dưới; chuẩn hóa ngày appointment/dòng edit về
`YYYY-MM-DD` trước khi gán vào input date. Regression test Python/Node, smoke
HTTP, frontend/Doctor/API/Alembic contracts và browser QA Doctor desktop/mobile
đã qua; browser không phát sinh console error/warn.

## Validation

Khi sửa workflow này, chạy checklist `Backend Endpoint Refactor` và `Folder Move Checks` trong `references/smoke-checks.md`.

Tối thiểu:

- `python3 -m py_compile app/modules/orders/api/chi_dinh.py app/modules/orders/api/survey.py app/modules/orders/services/clinical_order_query.py app/modules/orders/services/clinical_order_mutation.py app/modules/orders/services/result_file_service.py app/modules/orders/services/__init__.py app/modules/orders/view_models/clinical_order.py app/modules/orders/view_models/__init__.py app/modules/orders/api/__init__.py app/modules/orders/__init__.py app/api/chi_dinh.py main.py`
- Không auth: `GET /api/chi-dinh` và `GET /api/survey-templates-for-orders` không được 500; thường trả lỗi auth/redirect tùy middleware.
- Trong phiên đăng nhập: mở màn bác sĩ/tâm lý gia có block chỉ định với một ô nhập, tìm/chọn mẫu khảo sát hoặc gõ text tự do, kiểm tra performer/ngày và lưu một danh sách chỉ định nháp/thật nếu cần smoke write path.
- Trong màn quản lý chỉ định: list/detail/update trạng thái và upload/download/delete file kết quả nếu lát có đụng result files.

Validation thực tế 2026-05-30: syntax check các file orders module/wrapper/main đã qua; `GET /api/chi-dinh` và `GET /api/order-items?include_inactive=true` không kèm auth trả `401 application/json`, không phát sinh 500. Import check xác nhận wrapper cũ `app/api/chi_dinh.py` và `app/api/order_catalog.py` đang trỏ cùng blueprint object với module path mới.

Validation thực tế 2026-05-30: sau khi tách `view_models/clinical_order.py` và `view_models/catalog.py`, syntax check đã qua; import check xác nhận routes đang dùng builder/serializer từ module view-model mới; `GET /api/chi-dinh` và `GET /api/order-items?include_inactive=true` không kèm auth vẫn trả `401 application/json`, không phát sinh 500.

Smoke thực tế 2026-05-30: user đã test lát orders view-model/catalog serializer và xác nhận ổn.

Validation thực tế 2026-05-30: sau khi tách `services/clinical_order_query.py`, syntax check đã qua; import check xác nhận route `GET /api/chi-dinh` dùng query service từ module services; `GET /api/chi-dinh` và `GET /api/order-items?include_inactive=true` không kèm auth vẫn trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-30: sau khi tách `services/catalog_query.py`, syntax check đã qua; import check xác nhận catalog routes dùng query service và serializer mới; không auth các endpoint `/api/order-items?include_inactive=true`, `/api/order-categories`, `/api/order-categories/tree`, `/api/survey-templates-for-orders` đều trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-30: hoàn tất backend orders service island. `app/modules/orders/api/chi_dinh.py` chỉ còn route/auth/session/HTTP response và gọi `clinical_order_query`, `clinical_order_mutation`, `result_file_service`, `view_models/clinical_order`. `app/modules/orders/api/catalog.py` chỉ còn route/auth/session/HTTP response và gọi `catalog_query`, `catalog_mutation`, `view_models/catalog`. Syntax check toàn bộ orders module/wrapper/main đã qua; import check xác nhận wrapper cũ trỏ cùng blueprint object; không auth các endpoint `/api/chi-dinh`, `/api/order-items?include_inactive=true`, `/api/order-categories`, `/api/order-categories/tree`, `/api/survey-templates-for-orders` đều trả `401 application/json`, không phát sinh 500.

Smoke thực tế 2026-05-30: user đã test workflow orders/chỉ định sau khi hoàn tất service island và xác nhận OK.

Validation thực tế 2026-06-04: tách shared frontend helper `app/static/js/orders/order-print-ui-utils.js` cho UI in phiếu chỉ định dùng chung ở màn bác sĩ và tâm lý gia. Helper chỉ render performer options, selected state, print button state và preview group theo ngày/cơ sở; không đổi selected orders state, order catalog API, autosave/lưu chỉ định, fetch dữ liệu in hoặc A4 print side effects. Syntax check `order-print-ui-utils.js`, `doctor-examination.js`, `psychologist-examination.js` đã qua; unit-style check Node VM đã qua; static/template check xác nhận cả hai màn load shared helper trước orchestrator chính.

Validation thực tế 2026-06-04: nâng performer grouping frontend sang shared `app/static/js/orders/order-performer-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `getOrderFacilityLabel`, `getOrderPerformerName`, `groupOrdersByPerformer`; không đổi selected order state, API, payload hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: nâng order catalog tree frontend sang shared `app/static/js/orders/order-tree-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `buildOrderTreeStructure`, `sortOrderTreeNodes`; không đổi API danh mục, selected order state, autosave/lưu chỉ định, payload hoặc endpoint. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách order status frontend sang shared `app/static/js/orders/order-status-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `getOrderStatusConfig`; không đổi status values `draft/sent/completed`, CSS class, selected order state, API, payload hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách order catalog state frontend sang shared `app/static/js/orders/order-catalog-state-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `ensureOrderCatalogDefaultExpansion`, `rebuildOrderCatalogIndex`, `syncSelectedOrdersWithIndex`; không đổi render cây, selected order state shape, API, payload hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách order catalog render frontend sang shared `app/static/js/orders/order-catalog-render-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `renderOrderNode`, `countDescendantOrders`; không đổi survey template section, loading/empty state, selected order state shape, API, payload hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách order form UI frontend sang shared `app/static/js/orders/order-form-ui-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `updateOrderFormNewLocationFields`, `resetOrderFormNew`, `updateOrderFormSubmitButton`; không đổi submit/save logic, survey-template handling, selected order state shape, API, payload hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách selected orders table frontend sang shared `app/static/js/orders/order-selected-table-ui-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `renderSelectedOrders`, `updateOrderStatusDropdownClasses`; không đổi event edit/delete/status, selected order state shape, API, payload, autosave hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách order performer loader frontend sang shared `app/static/js/orders/order-performer-loader-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `loadOrderPerformers`; không đổi endpoint `/users/doctors`, submit/save logic, selected order state shape, API orders, payload, autosave hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách order autocomplete frontend sang shared `app/static/js/orders/order-autocomplete-utils.js`. Bác sĩ và tâm lý gia vẫn giữ event click/keyboard/fill form trong orchestrator; helper chỉ build match và render dropdown HTML. Không đổi selected order state shape, API orders, payload, autosave hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order form UI frontend helper `app/static/js/orders/order-form-ui-utils.js` để dùng chung fill form từ catalog item sau khi click autocomplete. Bác sĩ và tâm lý gia vẫn giữ event click/keyboard, survey selection và submit/save trong orchestrator. Không đổi selected order state shape, API orders, payload, autosave hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order form UI frontend helper `app/static/js/orders/order-form-ui-utils.js` để dùng chung fill form từ catalog tree item sau khi click cây danh mục. Bác sĩ và tâm lý gia vẫn giữ tree click shell và submit/save trong orchestrator. Không đổi selected order state shape, API orders, payload, autosave hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order autocomplete frontend helper `app/static/js/orders/order-autocomplete-utils.js` để dùng chung keyboard navigation ArrowUp/ArrowDown/Enter/Escape cho dropdown autocomplete. Bác sĩ và tâm lý gia vẫn giữ click/fill/survey handling trong orchestrator. Không đổi selected order state shape, API orders, payload, autosave hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order autocomplete frontend helper `app/static/js/orders/order-autocomplete-utils.js` để dùng chung hover active state và hide/reset dropdown autocomplete. Bác sĩ và tâm lý gia vẫn giữ click/fill/survey handling trong orchestrator. Không đổi selected order state shape, API orders, payload, autosave hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order autocomplete frontend helper `app/static/js/orders/order-autocomplete-utils.js` để dùng chung click-outside/blur-dismiss dropdown và focus lại input khi edit chỉ định. Bác sĩ và tâm lý gia vẫn giữ click/fill/survey handling trong orchestrator. Không đổi selected order state shape, API orders, payload, autosave hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order form UI helper `app/static/js/orders/order-form-ui-utils.js` để dùng chung fill form khi edit một chỉ định đã chọn. Bác sĩ và tâm lý gia vẫn giữ kiểm tra khóa sửa, `editingOrderId`, submit/save/autosave và selected order state trong orchestrator. Không đổi API orders, payload hoặc print side effects; giữ khác biệt cũ về cách set người thực hiện trong cơ sở của từng màn. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order autocomplete frontend helper `app/static/js/orders/order-autocomplete-utils.js` để dùng chung input/focus/keydown binding và debounce search cho autocomplete chỉ định. Bác sĩ và tâm lý gia vẫn giữ click/fill/survey handling trong orchestrator. Không đổi selected order state shape, API orders, payload, autosave hoặc print side effects; giữ khác biệt cũ về kết quả khi focus input rỗng của từng màn. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order autocomplete frontend helper `app/static/js/orders/order-autocomplete-utils.js` để dùng chung event shell khi click item autocomplete. Helper chỉ đọc `data-survey-id`/`data-order-id` và gọi callback; bác sĩ và tâm lý gia vẫn giữ add survey, fill form, hide dropdown, selected order state, submit/save/autosave trong orchestrator. Không đổi API orders, payload hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order autocomplete frontend helper `app/static/js/orders/order-autocomplete-utils.js` để dùng chung render dropdown autocomplete, gồm render HTML, show/hide khi rỗng, bind hover và bind click shell. Bác sĩ và tâm lý gia vẫn truyền callback riêng cho survey/order nên selected order state, submit/save/autosave, API orders và payload không đổi. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order autocomplete frontend helper `app/static/js/orders/order-autocomplete-utils.js` để dùng chung setup autocomplete form, gồm DOM lookup, selectedIndex UI, search theo getter state hiện hành, render/search/input/dismiss binding và callback chọn survey/order. Bác sĩ và tâm lý gia vẫn giữ add survey, fill form, selected order state, submit/save/autosave trong orchestrator. Không đổi API orders, payload hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng selected orders table helper `app/static/js/orders/order-selected-table-ui-utils.js` để dùng chung render section chỉ định đã chọn, gồm render bảng, refresh preview phiếu in và update class dropdown trạng thái khi có row. Bác sĩ và tâm lý gia vẫn giữ state mutation, edit/delete/status events, submit/save/autosave trong orchestrator. Không đổi API orders, payload hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách selected orders state transform sang shared helper thuần `app/static/js/orders/order-selection-state-utils.js`. Helper chỉ trả kết quả remove, clear và update status kèm lock check cho trạng thái hoàn thành trong cơ sở; bác sĩ và tâm lý gia vẫn giữ state assignment, render UI, toast, submit/save/autosave trong orchestrator. Không đổi selected order state shape, API orders, payload hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng selected orders table helper `app/static/js/orders/order-selected-table-ui-utils.js` để dùng chung event delegation của bảng chỉ định đã chọn: edit/delete/status change, restore UI khi status bị khóa, cập nhật class và `data-current-status` tức thì. Bác sĩ và tâm lý gia vẫn giữ state mutation, toast, submit/save/autosave trong orchestrator. Không đổi selected order state shape, API orders, payload hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng catalog render helper `app/static/js/orders/order-catalog-render-utils.js` để dùng chung event delegation của cây danh mục: survey template, toggle category, click category row và click order item. Bác sĩ và tâm lý gia vẫn giữ add survey, toggle expanded state, add selected order, render và autosave trong orchestrator. Không đổi selected order state shape, API orders, payload hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng catalog render helper `app/static/js/orders/order-catalog-render-utils.js` để dùng chung render node mẫu khảo sát. Helper giữ biến thể `doctor`/`psychologist` để không đổi markup cũ, trong đó tâm lý gia vẫn hiển thị pricing qua `formatCurrency`. Bác sĩ và tâm lý gia vẫn giữ add survey, selected order state, submit/save/autosave trong orchestrator. Không đổi API orders, payload hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng catalog render helper `app/static/js/orders/order-catalog-render-utils.js` để dùng chung build HTML section survey + cây danh mục. Helper chỉ nhận arrays và callback render node; bác sĩ/tâm lý gia vẫn giữ loading/empty DOM, default expansion, add survey, selected order state, submit/save/autosave trong orchestrator. Khác biệt cũ được giữ bằng option `showOrderItemsHeaderWhenSurveys` chỉ bật ở tâm lý gia. Syntax check, template load-order check và unit-style check Node VM đã qua; HTTP static check chưa chạy vì `localhost:8000` không lắng nghe.

Validation thực tế 2026-06-04: mở rộng catalog render helper `app/static/js/orders/order-catalog-render-utils.js` để dùng chung DOM shell render cây danh mục/loading/empty bằng `renderOrderCatalogTreeSection()`. Helper chỉ ẩn loading, show/hide empty placeholder, gọi callback default expansion và set HTML; bác sĩ/tâm lý gia vẫn giữ fetch catalog, expanded-node state, add survey, selected order state, submit/save/autosave trong orchestrator. Syntax check, template load-order check và unit-style check Node VM đã qua; HTTP static check chưa chạy vì `localhost:8000` không lắng nghe.

Validation thực tế 2026-06-04: thêm catalog loader helper `app/static/js/orders/order-catalog-loader-utils.js` để dùng chung fetch song song `/api/order-items?include_inactive=true` và `/api/survey-templates-for-orders`, normalize `{ items, surveyTemplates }`, và giữ behavior survey endpoint lỗi thì survey list rỗng. Bác sĩ/tâm lý gia vẫn giữ state assignment, build tree, rebuild index, render, error toast và autosave/save trong orchestrator. Syntax check, template load-order check và unit-style check Node VM đã qua; HTTP static check chưa chạy vì `localhost:8000` không lắng nghe.

Validation thực tế 2026-06-04: mở rộng catalog render helper `app/static/js/orders/order-catalog-render-utils.js` để dùng chung loading/error UI của cây danh mục gồm lấy DOM elements, show loading, hide loading và render lỗi. Bác sĩ/tâm lý gia vẫn giữ fetch catalog, state assignment, build tree, rebuild index, render, error toast và autosave/save trong orchestrator. Syntax check, template load-order check và unit-style check Node VM đã qua; HTTP static check chưa chạy vì `localhost:8000` không lắng nghe.

Validation thực tế 2026-06-04: hoàn tất cụm helper an toàn còn lại của frontend orders: `toggleOrderCategoryNode()` vào `order-catalog-state-utils.js`, `applySurveyTemplateToForm()` và `applyOrderCatalogTreeSelection()` vào `order-form-ui-utils.js`. Bác sĩ/tâm lý gia vẫn giữ selected order state assignment, submit/save/autosave, payload `/api/chi-dinh`, load orders từ server, error toast và A4 print orchestration trong orchestrator. Syntax check, template load-order check và unit-style check Node VM đã qua; HTTP static check chưa chạy vì `localhost:8000` không lắng nghe.

Validation thực tế 2026-06-04: đóng frontend helper phase cho orders ở lát 8.44. `order-form-ui-utils.js` nhận thêm `collectOrderFormSubmission()` để dùng chung đọc DOM, validate tên/ngày, resolve người thực hiện trong cơ sở và nhận diện survey template của tâm lý gia. `order-selection-state-utils.js` nhận thêm helper thuần cho upsert selected order từ form, build payload save, merge trạng thái completed từ server, apply response save và map dữ liệu load từ server. Bác sĩ/tâm lý gia vẫn giữ API call save/load, debounce autosave, toast, state assignment chính và A4 print orchestration trong orchestrator; endpoint `/api/chi-dinh/appointment/<id>` và selected order state shape không đổi. Syntax check toàn bộ JS orders + hai orchestrator đã qua; unit-style Node VM check cho helper form/state/payload/load đã qua; HTTP static/browser check chưa chạy vì `localhost:8000` không lắng nghe.

Validation thực tế 2026-08-30: sửa response view-model của `GET /api/chi-dinh` và `GET /api/chi-dinh/<id>` để đọc chẩn đoán từ examination hiện hành qua `current_examination()`, đúng owner `examinations.diagnosis`, thay vì truy cập thuộc tính không tồn tại trên `Appointment`. Với dữ liệu admin hiện tại, list trạng thái `sent` trả HTTP 200 và 2 dòng, detail chỉ định 7 trả HTTP 200; browser QA xác nhận danh sách, filter, modal Thông tin và tab Khảo sát hoạt động, không còn lỗi console. Thêm regression test cho serializer; 13 workflow tests, syntax, frontend contract, smoke health, auth contract, user-feedback contract và `git diff --check` đều đạt.

Validation thực tế 2026-09-01: bổ sung access scope cho route theo ID và survey
session nội bộ, validation payload/phân trang, liên kết template khảo sát với
chỉ định, trạng thái `processing`, timeline custom, và giới hạn/bảo vệ file kết
quả. `pytest -q` đạt 35 test; syntax, frontend contract, Doctor contract, auth
contract, Alembic strict, smoke health và browser QA Doctor/Quản lý chỉ định
đều đạt. Không tạo/sửa/xóa chỉ định hoặc upload file thật trong QA; các session
khảo sát tạm phục vụ kiểm tra đã được dọn khỏi database.

## Next Refactor Steps

1. Smoke test trong phiên đăng nhập: bác sĩ/tâm lý load và lưu chỉ định theo appointment.
2. Smoke test màn quản lý chỉ định: list/detail/update trạng thái, batch delete nếu đang dùng.
3. Smoke test file kết quả: upload/delete/download một file nhỏ.
4. Smoke test chỉ định: tạo/sửa/xóa một dòng bằng input chung (chọn mẫu khảo sát hoặc nhập text tự do) nếu môi trường dữ liệu cho phép.
5. Không tách frontend/static orders tiếp nếu chưa có contract riêng cho save/load/A4 print orchestration; backend orders island hiện đã đủ mỏng để làm nền cho lát sau.
