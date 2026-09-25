# Mẫu khảo sát — cấu hình, phát hành và tính kết quả

Cập nhật 2026-09-08. Menu quản lý dùng `survey-template-management.html`,
`survey-template-management.js`; editor dùng `survey-template-create.js` cùng
`survey-result-config.js`. `.sc-hidden` thuộc component CSS chung
`survey-template-utils.css`, được nạp ở cả editor độc lập và menu quản lý.

## Danh sách và phân trang

- List quản lý gọi `/api/survey-templates?page=...&per_page=...` có xác thực, mặc định 10;
  hỗ trợ 10/20/50/100 và tìm kiếm, trở về trang 1 khi đổi bộ lọc/số dòng.
  JS và dropdown cùng mặc định 10; 11 mẫu chia thành 10/1 dòng.
  Footer dùng `partials/clinic-pagination.html` và `components/clinic-pagination.js`;
  page owner giữ request/revision, footer nhận metadata backend và nằm ngoài vùng cuộn bảng.
- Backend giới hạn trang theo số bản ghi hiện tại; frontend nhận `pagination.page`
  trước khi dựng bảng/STT, kể cả khi xóa bản ghi cuối trang.
- Cột Cấu hình dùng `readiness` từ backend: Có cấu hình kết quả, Chỉ tính điểm,
  Cần cấu hình hoặc Tài liệu. Đây là kiểm tra cấu trúc/cấu hình phần mềm,
  không xác nhận nội dung chuyên môn đầy đủ; không còn suy diễn `is_public`.
- `main-content` tích hợp shell khi mở URL trực tiếp. Trong native pane hoặc
  iframe, `.stm-list-workspace` nhận chiều cao khả dụng, chia flex cho tiêu đề
  và `.stm-card`; card không được dùng `min-height` theo viewport riêng.
- CSS bố cục admin nằm trong phần survey của `shared/admin-management-ui.css`.
  `.stm-table-wrap` cuộn nội dung; toolbar và phân trang không co, luôn nhìn
  thấy trong khung. Bảng cao theo dữ liệu; không chèn dòng rỗng để đủ per_page.
- Browser QA 06/09/2026: 11 mẫu thật, trang 1 có 10/trang 2 có 1; đổi 25/100,
  tìm GAD và không có kết quả, cuộn đến dòng cuối ở 1366×768; desktop 1904×925
  và mobile 390×844. Đã kiểm URL trực tiếp, iframe từ Trang chủ, mở editor;
  phân trang nằm trong viewport, không lỗi JS. Syntax/frontend contract đạt.

## Owner và hợp đồng

- CRUD/upload/download: `app/api/survey_templates.py`. Đã loại 5 route CRUD
  trùng trong `survey_template_management.py`; file này còn public list và duplicate.
- `app/utils/survey_template_policy.py` quản lý quyền: admin đang hoạt động hoặc
  thành viên nhóm có `ql-mau-khaosat` mới được thêm/sửa/xóa/upload/duplicate mẫu
  và thay đổi tiêu chí. Kiểm lại quyền hiện tại tại API, không chỉ ẩn nút UI.
  `/api/survey-templates/access` cho editor và `can_manage` trong list đồng bộ UI.
- Mẫu chỉ có file là Tài liệu: nút tải xuống dùng API có xác thực; sửa thông tin
  dùng modal metadata, không mở editor câu hỏi. Upload không tự chuyển tài liệu
  thành bài khảo sát online. Đường dẫn tải file được chuyển thành đường dẫn tuyệt đối.
- `survey_templates.content` giữ ID câu hỏi, hàng, cột, đáp án; không dùng vị trí
  làm ID. `normalize_survey_content` bổ sung ID thiếu, đọc alias cấu trúc cũ,
  không tự đặt điểm. Không âm thầm chuyển loại câu hỏi chưa hỗ trợ sang trắc nghiệm.
- Grid: `columns[].score` là điểm mặc định khi thêm hàng; `rows[].scores` là map
  `{column_id: number}` cho điểm từng ô. Khi map có mặt, scorer dùng map đó.
  Map chưa có (mẫu cũ) mới dùng điểm cột. `score_enabled=false` bỏ tính điểm,
  vẫn kiểm tra đáp án được chọn có thuộc câu hỏi hay không.
- Sửa điểm mặc định cột không ghi đè điểm từng ô. Nút Áp điểm cho cả cột
  yêu cầu xác nhận trước khi thay tất cả ô; hủy giữ điểm cũ. Cột mới để trống
  điểm để người cấu hình nhập rõ ràng.
- Editor lấy tên cột `label` hoặc alias `text`; tiêu chí hàng nhận tiêu chí cha
  khi mẫu cũ chưa có. Thiếu điểm được hiển thị trống, không biến thành 0.
- Editor đọc `answers` hoặc alias cũ `options` (sửa 13/09/2026). Giữ ID,
  text, score/value sẵn có; không tạo hai đáp án trống khi mẫu cũ có options.
  DASS-21 thật đã mở lại đủ bốn đáp án 0–3; không lưu thay đổi dữ liệu mẫu.
- Save/publish dùng `validate_survey_content`. Mẫu thiếu ID/nội dung/đáp án/
  điểm hoặc cấu hình kết quả sai bị từ chối với thông báo cụ thể.

## Cấu hình kết quả

- `result_config.scoring_method`: `total` hoặc `by_group`.
- `calculation_type`: `sum`, `average`, `scale_conversion`. Trung bình chia
  tổng điểm cho số câu/hàng có trả lời được tính điểm; không tính hàng tắt điểm.
- Quy đổi là công thức được cấu hình tường minh:
  `Tổng điểm * conversion.factor + conversion.offset`. Không tự suy ra thang
  lâm sàng từ tên mẫu hay field `score_conversion` cũ.
- `conditions`: khoảng bao gồm hai đầu hoặc các phép >, >=, <, <=, =;
  mọi điều kiện khớp được trả về, gồm `conclusion`, `note`.
- Ngưỡng điều kiện/lưu ý bỏ trống giữ `null`, bị chặn lưu tại FE và BE;
  chỉ giá trị 0 được nhập tường minh mới được lưu thành điểm 0.
- Editor cấp ID cho điều kiện/lưu ý từ dữ liệu cũ/API thiếu ID và chuẩn hóa
  ID trùng; nếu không, sửa ô có thể không cập nhật cấu hình. Cấu hình được
  clone sâu khi mở, không làm thay đổi snapshot nguồn trước khi lưu.
- `by_group` tính tổng từng nhóm và áp `group_configs[group].conditions`.
- `special_alerts` so điểm câu/hàng được trả lời với threshold; câu cha grid
  dùng tổng các hàng của grid. Câu chưa trả lời không được xem là điểm 0.
- `total_scores` vẫn là tổng điểm thô theo nhóm để tương thích dữ liệu hiện có.
  Kết quả theo cấu hình do backend tính khi nộp, lưu tại
  `survey_responses.template_snapshot.result_summary`; DTO trả `result_summary`.
  Không tính lại bài cũ theo cấu hình danh mục vừa thay đổi.
- Patient và bác sĩ dùng cùng renderer câu hỏi; phần kết luận/điểm theo cấu hình
  dùng component `shared/survey-result-summary.js` + CSS tương ứng. Bản nháp
  chưa hiện kết quả cuối. CLS dùng câu hỏi phân nhóm từ snapshot bài đã nộp,
  bao gồm hàng grid, để ghép đúng đáp án.

## Cấu trúc cũ và phiên đang tồn tại

- `scripts/repair_survey_template_structure.py` mặc định chỉ lập kế hoạch.
  `--apply --backup <file>` yêu cầu tạo bản sao khôi phục mới, mode 0600.
- Local đã chuẩn hóa 11 mẫu, cập nhật 1 snapshot phiên chưa có đáp án và đóng
  băng cấu trúc cho 1 response cũ chưa có snapshot; không sửa đáp án/điểm đã nộp.
  Bản sao: `/tmp/qlpk-survey-template-structure-before-20260906.json`.
  Chạy lại kế hoạch trả 0 thay đổi.
- Phiên có draft/bài nộp giữ snapshot. Tạo lại link chỉ thay snapshot lỗi nếu
  phiên chưa có đáp án và mẫu mới đã hợp lệ; giữ token, ID phiên và hạn cũ.
- Đã seed GAD-7/PHQ-9/GDS-30/ZAI theo nguồn đối chiếu ngày 06/09/2026;
  chi tiết, backup và QA tại `survey-scoring-seed.md`. Còn Vanderbilt thiếu
  cả nội dung, chờ chọn bản đầy đủ trước khi seed.
  Đây không phải điểm 0. Cần cấu hình có căn cứ trước khi phát hành. Chi tiết
  câu/hàng/điểm thiếu chỉ hiển thị trong editor quản lý mẫu. API tạo link và
  toast CLS báo: “Mẫu khảo sát chưa đủ cấu hình điểm. Vui lòng kiểm tra lại.”
  FE ánh xạ mã `SURVEY_TEMPLATE_INVALID`, không hiển thị
  nguyên văn lỗi cấu hình từ API. Link cũ không treo loading khi mẫu chưa sẵn sàng.
- Hồi quy thông báo 06/09/2026: 3 case API tạo link đạt; browser nhận thử
  payload lỗi chứa chi tiết câu/hàng nhưng toast chỉ hiện hướng dẫn thân thiện.
  JS syntax, frontend contract và diff check đạt.

## Các điểm hồi quy bắt buộc

- Tải A chậm, chuyển B: response A không được cập nhật DOM/state B; khóa lưu
  khi tải. Đóng hoặc mở lại tăng revision. Không mở/đóng bình thường khi đang lưu.
- Quay lại và Escape phải xác nhận khi còn thay đổi chưa lưu.
- Thêm cột/hàng nhiều lần chỉ thêm đúng một mục mỗi lần; đổi loại câu rồi đổi
  lại giữ giá trị đã nhập trong các phần editor.
- Điểm 0, điểm từng ô khác điểm cột, số thập phân, đổi thứ tự hàng/cột, tổng/
  trung bình/quy đổi, kết luận nhóm và lưu ý đều cần kiểm tra theo payload thật.
- Kết quả browser QA: template 386, order 706, bệnh nhân QA 317. Chọn 7 và 3
  → nhóm 7/3, trung bình 5, kết luận và lưu ý đúng; reload chỉ đọc; order Có kết quả.
- Audit trước đó và trạng thái khắc phục: `reports/survey-template-audit-20260906.md`.
- Validation cuối: 62 test scoring/template/lifecycle đạt; frontend contract,
  API auth strict, JS syntax, Python compile và diff check đạt. Browser đã xem
  ảnh desktop, grid dài GAD-7, kết quả CLS và editor mobile 390px cuộn ngang.

## QA khắc phục menu 08/09/2026

### Rà soát bổ sung 08/09

- Mẫu chỉ tính điểm được giữ `conditions: []`; mở cấu hình kết quả hoặc xóa
  điều kiện cuối không tự tạo ngưỡng trống khiến không lưu được. Đổi toán tử
  giữ giá trị đang nhập; browser kiểm thêm đổi tab giữ ngưỡng và kết luận.
- Bệnh nhân được bỏ qua câu không bắt buộc; câu bắt buộc/grid vẫn kiểm đủ.
  Mã đáp án số 0 là đáp án hợp lệ. Nộp bài vẫn cần ít nhất một câu trả lời.
- Nếu chưa trả lời mục nào có tính điểm, kết quả tổng/trung bình/quy đổi là
  `null`, không sinh kết luận từ điểm 0 giả. Đáp án 0 thật vẫn tính bình thường.
- API sửa mẫu đóng băng tên/nội dung cũ cho session/response thiếu snapshot
  trong cùng transaction; không thay snapshot đã có, đáp án hay điểm cũ.
- Tên mẫu phải là chuỗi, trim trước kiểm trùng, không trống và tối đa 255 ký tự;
  create/update/upload/duplicate dùng chung kiểm tra tên. Payload sai trả 400.
- 86 test Python đạt; ba bộ Node result-config/patient-validation/order-results
  đạt. Frontend contract và API auth strict đạt (417 route, thiếu auth: 0).
- Browser ghi thật trên dữ liệu QA: tạo mẫu → sửa/lưu → tạo link → đổi điểm
  danh mục từ 2 thành 99 → bệnh nhân chọn 2, bỏ câu tùy chọn, nộp → kết quả
  vẫn 2, chỉ định Có kết quả → reload chỉ đọc → kết thúc. Không lỗi JS.
  Đã xem ảnh kết quả; chỉ định/phiên/bài nộp QA được dọn, mẫu QA được ẩn.
- Chưa bổ sung nội dung lâm sàng CDI/HADS/Vanderbilt: thiếu phiên bản và bộ
  câu hỏi đầy đủ. Nhãn sẵn sàng cấu hình không chứng nhận đủ nội dung chuyên
  môn. Chi tiết giới hạn và nguồn: `../../reports/survey-template-review-20260908.md`.

### Lượt QA trước

- 77 test Python đạt (bao gồm 4 test catalog HTTP dùng PostgreSQL rollback).
  `node tests/survey_result_config.test.js` đạt: ID cũ/thiếu/trùng, clone dữ liệu,
  sửa kết luận, phân biệt ngưỡng trống và điểm 0.
- Browser tạo mẫu QA qua API rồi sửa/lưu trên editor: đổi mặc định cột giữ ô 7,
  hủy áp toàn cột giữ ô cũ, xác nhận áp đổi ô, lưu/reload giữ điểm riêng.
  Ngưỡng trống không gửi PUT; nhập 0 lưu được đúng một request.
- Tài liệu QA được tải lên bằng UI, tải xuống đúng tên file, sửa metadata không
  yêu cầu chọn lại file, xóa khỏi danh sách. Các bản ghi QA được soft-delete,
  không xóa mẫu lâm sàng hay thay đáp án bệnh nhân.
- Kiểm danh sách có dữ liệu, 10/25 dòng, trang 2 bắt đầu STT 11, trang backend
  được thu về 1, UI thiếu quyền ẩn nút sửa/xóa/thêm/upload. Hai ca cuối dùng
  response mô phỏng trong browser; API thật được kiểm trong bộ test rollback.
- Đã xem list/editor desktop 1600px, list/editor mobile 390px, grid GAD-7 thật
  và cột mới để trống điểm. Không lỗi JavaScript; frontend contract, API auth
  strict và diff check đạt. Dữ liệu GAD-7 chỉ mở để kiểm UI, không lưu thay đổi.
