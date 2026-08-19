# Examinations Module Context

Current contract note (2026-08-05): the older validation notes in this file
describe the pre-cleanup compatibility layer. Doctor runtime now uses only
canonical role-prefixed sections; legacy section aliases and Doctor mental
detail aliases were archived and removed by Alembic cleanup.

Tài liệu này là context ngắn cho workflow khám bệnh/examinations. Đọc khi sửa lượt khám, trạng thái khám, form khám bác sĩ/tâm lý gia, `examination_details`, modal khám chi tiết, diagnosis/ICD, lời dặn, chuyển thanh toán, hoặc các API `/examinations`, `/api/examination-*`.

## Ownership

- `examinations`: dữ liệu lâm sàng theo lượt khám, gồm trạng thái khám, ngày khám, bác sĩ, chẩn đoán ICD, bệnh kèm theo, kế hoạch điều trị, lời dặn, sinh hiệu, đánh giá nguy cơ và thông tin thanh toán gắn lượt khám.
- `examination_details`: dữ liệu form/modal linh hoạt theo `section` và `field_name`; dùng mapping trong `app/utils/examination_utils.py` để phân biệt bác sĩ và tâm lý gia.
- `examination_details` có unique contract trên `(examination_id, section, field_name)`; save phải cập nhật đúng một row, không tạo bản ghi lặp.
- `appointments`: dữ liệu hành chính/lịch hẹn; appointment API hiện vẫn là nguồn load combined appointment/patient/examination cho màn bác sĩ/tâm lý gia.
- `patients`: thông tin định danh và tiền sử nền; không lưu per-visit clinical state vào patient.
- `appointment_services`, `prescriptions`, `chi_dinh`, `survey_*`: có liên kết hiển thị hoặc side effect, nhưng không phải owner của dữ liệu khám chính.

Không dùng `appointment.notes` thay cho `examinations.loi_dan`. Không lưu diagnosis/lời dặn/sinh hiệu chính vào `examination_details` nếu field đã có owner trong `examinations`.

## Runtime Hiện Tại

- `app/modules/examinations/view_models/detail.py`: owner response shape cho `GET /api/examination-detail/<id>`.
- `app/modules/examinations/view_models/management.py`: owner status text và response shape cho list/detail quản lý lượt khám.
- `app/modules/examinations/services/details_service.py`: owner cho load/save/delete `examination_details`, section variants backward-compatible, save một field theo appointment, psychological section, modal save/load.
- `app/modules/examinations/services/management_query.py`: owner query/filter/pagination/detail read và stats badge cho màn quản lý lượt khám.
- `app/modules/examinations/services/status_transition.py`: owner transition trạng thái đơn giản cho `transfer-to-conclusion`, `transfer-to-payment`, `complete-psychologist-exam`, `confirm` và direct management status update.
- `app/modules/examinations/services/lookup_service.py`: owner lookup/read nhỏ cho `/doctors`, `/packages`, `/services` và `GET /examinations/appointment/<appointment_id>/id`.
- `app/modules/examinations/services/hard_delete_service.py`: owner hard delete cleanup cho `DELETE /examinations/<id>`; giữ nguyên raw SQL xóa dây chuyền, không dùng cho test dữ liệu thật.
- `app/modules/examinations/services/creation_service.py`: owner create flow legacy cho `POST /examinations`, gồm validate payload, upsert patient, tạo appointment/examination, family members và Google Calendar sync.
- `app/api/examination.py`: route HTTP mỏng cho tạo lượt khám legacy, lookup, chuyển trạng thái và hard delete.
- `app/api/examination_details.py`: route/auth/session/HTTP response cho `examination_details`; logic load/save chính đã gọi `details_service`, riêng endpoint info còn giữ read formatter tại route.
- `app/api/examination_detail.py`: detail hóa đơn/lượt khám, bridge finance-only cho dịch vụ gắn `appointment_services`, financial summary, prescription rows, export invoice. Dịch vụ phải dùng owner `app/modules/appointments/services/appointment_service_selection.py`; `admin`/`staff` mới override tài chính và payment lock chặn mọi mutation.
- `app/api/examination_management.py`: route/auth/session/HTTP response cho list/detail/stats và status update quản lý lượt khám; logic query/status đã gọi service trong module examinations.
- `app/utils/examination_utils.py`: owner hiện tại của section mapping và helper ICD display contract.
- `app/static/js/doctor-examination.js`: caller lớn nhất, có state/cache/auto-save và risk stale patient data.
- `app/static/js/psychologist-examination.js`: caller tương tự cho tâm lý gia.
- Records/history legacy route, service và serializer đã được loại khỏi runtime; không còn bảng/model owner tương ứng. Các ghi chú refactor cũ vẫn được giữ riêng để audit lịch sử.
- Standalone UI cũ `app/templates/examination-detail.html`, `app/static/js/examination-detail.js`, `app/static/css/pages/examination-detail.css` đã được archive ngày 2026-06-14 vì không còn caller runtime; workflow thanh toán/in hóa đơn hiện dùng `payment-waiting.html` và `/payment-waiting/invoice/<examination_id>`. Các API `/api/examination-detail/*` vẫn giữ vì `payment-waiting.js` đang dùng.

## Endpoint Map Cần Giữ

- `POST /examinations`: tạo patient/appointment/examination legacy. UI cũ `add-examination.html`/`add-examination.js` đã được archive ngày 2026-06-13 vì không còn link/menu/caller runtime; endpoint giữ lại để tương thích backend.
- `GET /examinations/appointment/<appointment_id>/id`: lấy examination id, sinh hiệu cơ bản và status theo appointment.
- `GET /api/examination-id/<appointment_id>`: endpoint song song có auth cho màn bác sĩ/tâm lý gia.
- `PUT /examinations/<examination_id>/transfer-to-conclusion`: chuyển tâm lý gia sang kết luận.
- `PUT /examinations/<examination_id>/transfer-to-payment`: chuyển bác sĩ/kết luận sang chờ thanh toán.
- `PUT /examinations/<examination_id>/complete-psychologist-exam`: hoàn tất khám tâm lý gia sang chờ thanh toán.
- `PUT /examinations/<examination_id>/confirm`: xác nhận hóa đơn, chuyển completed.
- `DELETE /examinations/<examination_id>`: hard delete có auth nội bộ, rủi ro cao vì xóa nhiều bảng liên quan.
- `GET|POST|DELETE /api/examination-details/<examination_id>`: load/save/delete details theo examination.
- `GET|POST /api/examination-details/<examination_id>/section/<section>`: load/save một section, có backward compatibility section cũ.
- `POST /api/examination-details`: save một field theo `appointment_id`, `section`, `field_name`, `field_value`.
- `POST /api/examination-details/modal-save`: lưu modal khám chi tiết theo appointment và sections.
- `GET /api/examination-details/modal-load/<appointment_id>`: load modal khám chi tiết theo appointment.
- `GET /api/examination-details/appointment/<appointment_id>` và `GET /api/examination-details/<examination_id>/info`: endpoint đọc phụ trợ cho modal/UI.
- `GET|PUT /api/examination-detail/<examination_id>`: detail hóa đơn/lượt khám và cập nhật legacy.
- `GET|POST|PUT|DELETE /api/examination-detail/<examination_id>/services...`: dịch vụ gắn appointment của lượt khám.
- `GET /api/examination-detail/<examination_id>/financial-summary`: tổng hợp tài chính từ `appointment_services`.
- `GET|PUT /api/examination-detail/<examination_id>/prescriptions`: prescription rows/status legacy.
- `GET /examinations`, `GET /examinations/<id>`, `PUT /examinations/<id>/status`, `GET /examinations/stats`: màn quản lý lượt khám.

## Contract Cần Giữ

- Diagnosis/benh kèm theo trong read/display APIs phải là text đã resolve ICD; raw IDs nằm ở `diagnosis_ids` / `benh_kem_theo_ids` khi caller có thể edit.
- Section mapping phải dùng `get_section_name()` và giữ backward compatibility với `form_kham`, `examination_form`, `general_exam`, `mental_exam`, `histories`, `lab_tests`.
- Save/load modal phải phân biệt `bac_si_kham_*` và `tam_ly_gia_kham_*` theo context examination.
- Auto-save từ màn bác sĩ/tâm lý gia không được ghi trong lúc `isLoadingExaminationData === true`.
- Empty/null từ backend phải clear UI, không giữ data bệnh nhân trước.
- Doctor medical history nhận đúng một `medical_history` response object; không đọc các top-level history alias đã retired.
- Chuyển trạng thái khám không được suy luận từ label frontend; backend enum `ExaminationStatus` là source of truth.
- Không tách write path trong `app/api/appointment.py` cùng lúc với move examinations nếu chưa có checklist riêng, vì endpoint đó ghi nhiều owner.

## Refactor Plan

1. Lát 6.1: chỉ lập context/map này và ghi nhận orders đã smoke test OK.
2. Lát 6.2: tạo `app/modules/examinations/` cho read/view-model trước, ưu tiên serializer/detail response và status text; giữ URL cũ bằng wrapper hoặc import module path mới. Trạng thái: đã thực hiện.
3. Lát 6.3: tách service cho `examination_details` section/modal load-save; giữ nguyên payload và section backward compatibility. Trạng thái: đã thực hiện.
4. Lát 6.4: tách query/list/stats của `examination_management.py` nếu cần, vì đây là read/query tương đối độc lập. Trạng thái: đã thực hiện.
5. Lát 6.5: tách status transition services cho các endpoint đổi trạng thái chính; hard delete và appointment write path để sau cùng. Trạng thái: đã thực hiện.
6. Lát 6.6: tách progress-session read/write service; hard delete và `PUT /api/appointments/<id>` vẫn để sau cùng. Trạng thái: đã thực hiện.
7. Lát 6.7: tách records read/write service; hard delete và appointment write vẫn để sau cùng. Trạng thái: đã thực hiện.
8. Lát 6.8: tách lookup/read nhỏ còn lại trong `app/api/examination.py`; hard delete và appointment write vẫn để sau cùng. Trạng thái: đã thực hiện.
9. Lát 6.9: tách hard delete service, không đổi behavior xóa và không test bằng dữ liệu thật. Trạng thái: đã thực hiện.
10. Lát 6.10: tách `POST /examinations` create-examination service; giữ URL/payload/response, mapping `phone_number` frontend sang `patients.phone` theo model hiện tại. Trạng thái: đã thực hiện.
11. Lát 6.11: lập checklist riêng trước khi đụng `PUT /api/appointments/<id>` vì endpoint này ghi appointments, patients, examinations và một phần details.

## Validation

Khi sửa workflow này, chạy checklist `Examinations And Details`, `Diagnosis ICD Contract`, `Doctor Examination Patient Switch`, `Backend Endpoint Refactor` trong `references/smoke-checks.md`.

Tối thiểu cho lát backend/module:

- `python3 -m py_compile app/api/examination.py app/api/examination_details.py app/api/examination_detail.py app/api/examination_management.py app/utils/examination_utils.py main.py`
- Không auth các endpoint đọc chính không được 500: `/api/examination-id/<appointment_id>`, `/api/examination-details/modal-load/<appointment_id>`, `/api/examination-detail/<examination_id>` tùy endpoint có yêu cầu auth/public legacy.
- Trong phiên đăng nhập: mở màn bác sĩ/tâm lý gia, chọn bệnh nhân, load form khám, mở modal khám chi tiết, lưu một field nhỏ nếu lát có đụng save path.
- Nếu đụng status: test đúng nút hoàn tất/chuyển thanh toán trên màn tương ứng và kiểm appointment/payment không lỗi dây chuyền.

Validation thực tế 2026-05-30: đã trace các API/model/frontend caller chính và tạo context Phase 6.1; chưa đổi runtime behavior.

Validation thực tế 2026-05-30: hoàn tất Phase 6.2 read/view-model. Tạo module island `app/modules/examinations/` và tách response builder cho `GET /api/examination-detail/<id>` sang `view_models/detail.py`; tách response builder list/detail quản lý lượt khám và status text sang `view_models/management.py`. Route cũ vẫn giữ URL/payload; chưa đổi save path, status transition hay `app/api/appointment.py`. Syntax check các file liên quan đã qua; import check view models và legacy `get_status_text()` đã qua; endpoint smoke không auth `/examinations?page=1&per_page=1` và `/examinations/stats` trả `200 application/json`, `/api/examination-detail/1` trả `404 application/json` thay vì 500 trong dữ liệu hiện tại.

Validation thực tế 2026-05-30: hoàn tất Phase 6.3 details service. Tách `app/modules/examinations/services/details_service.py` cho `GET|POST|DELETE /api/examination-details/<id>`, `GET|POST /api/examination-details/<id>/section/<section>`, `GET|POST /api/examination-details/psychological/<id>`, `GET /api/examination-id/<appointment_id>`, `POST /api/examination-details`, `POST /api/examination-details/modal-save`, `GET /api/examination-details/modal-load/<appointment_id>` và `GET /api/examination-details/appointment/<appointment_id>`. Giữ nguyên URL/payload/message chính; giữ backward-compatible section variants, `form_kham`, section cũ, migration deletes cho `danh_gia_ban_dau`, `trieu_chung_va_hanh_vi_hien_tai`, `dien_tien_trong_phien_kham`; giữ legacy commit sớm `main_reason` trong modal-save. `app/api/examination_details.py` giảm còn route mỏng hơn, chưa đụng frontend, status transition, hard delete hoặc `app/api/appointment.py`. Syntax/import check đã qua; không-auth smoke `/api/examination-id/1`, `/api/examination-details/1/section/bac_si_kham_form_kham`, `/api/examination-details/modal-load/1`, `/api/examination-details/appointment/1` đều trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-30: hoàn tất Phase 6.4 management query service. Tách `app/modules/examinations/services/management_query.py` cho `GET /examinations`, `GET /examinations/<id>` và `GET /examinations/stats`; giữ `PUT /examinations/<id>/status` tại route vì là write path trạng thái. `app/api/examination_management.py` giảm còn 105 dòng, service mới 121 dòng. Giữ nguyên URL/payload và behavior stats legacy: filter ngày được parse/validate nhưng badge count vẫn đếm tổng theo trạng thái, loại `PAID`. Syntax/import check đã qua; endpoint smoke sau đó xác nhận `/examinations?page=1&per_page=1` và `/examinations/stats` trả `200 application/json`.

Validation thực tế 2026-05-30: hoàn tất Phase 6.5 status transition service. Tách `app/modules/examinations/services/status_transition.py` cho `PUT /examinations/<id>/transfer-to-conclusion`, `PUT /examinations/<id>/transfer-to-payment`, `PUT /examinations/<id>/complete-psychologist-exam`, `PUT /examinations/<id>/confirm` và `PUT /examinations/<id>/status`. Route giữ nguyên URL/status code/message/payload; service giữ điều kiện trạng thái cũ, set `updated_at` ở các transition vốn đã set trước đó và không set `updated_at` cho direct management status update để giữ behavior cũ. `app/api/examination_management.py` giảm còn 89 dòng. Chưa đụng hard delete, progress-session hoặc `PUT /api/appointments/<id>`. Syntax/import check đã qua; endpoint smoke đạt: `/examinations?page=1&per_page=1` và `/examinations/stats` trả `200 application/json`, `/examinations/1` trả `404 application/json` theo dữ liệu hiện tại, các route status transition với id không tồn tại trả `404 application/json`, không phát sinh 500.

Validation thực tế 2026-05-30: hoàn tất Phase 6.6 progress-session service. Tách `app/modules/examinations/services/progress_session.py` cho `GET|POST /examinations/<id>/progress-session`. Giữ nguyên response shape, message, status code và data ownership: section `dien_tien_va_phien_kham` replace toàn bộ trong `examination_details`, `weight/height/bmi` ghi trực tiếp vào `examinations`, blank special field không tự clear giá trị cũ giống behavior trước. Chưa đụng frontend, hard delete hoặc `PUT /api/appointments/<id>`. Syntax/import check đã qua; endpoint smoke đạt: id không tồn tại cho GET/POST progress-session trả `404 application/json`, id hiện có `993` trả `200 application/json` cho progress-session và detail management, không phát sinh 500.

Validation thực tế 2026-05-30: hoàn tất Phase 6.7 records/history service. Tách `app/modules/examinations/services/records_service.py` cho `GET|POST|PUT|DELETE /examination-records/<examination_id>...` và `app/modules/examinations/view_models/records.py` cho serializer. Route giữ nguyên URL runtime `/examination-records/...`, auth decorator, payload/message cũ và behavior legacy khi enum/data không hợp lệ. Không đụng frontend, hard delete hoặc `PUT /api/appointments/<id>`. Syntax/import check đã qua; service read trực tiếp examination `993` trả `success=True,total=0`, missing examination raise đúng exception; endpoint không-auth `/examination-records/993` và `/examination-records/993/1` trả `401 application/json`.

Validation thực tế 2026-05-31: hoàn tất Phase 6.8 lookup/read service. Tách `app/modules/examinations/services/lookup_service.py` cho `/doctors`, `/packages`, `/services` và `GET /examinations/appointment/<appointment_id>/id`. Giữ URL/payload/error message cũ; chưa đụng create examination, hard delete hoặc `PUT /api/appointments/<id>`. Syntax/import check toàn nhóm examinations đã qua; lookup appointment của examination `993` trả `examination_id=993`, `appointment_id=1014`, `status=WAITING_TRANSFER`; missing appointment raise đúng exception; packages/services lookup trực tiếp chạy được. Endpoint curl chưa xác nhận vì không có server lắng nghe ở `localhost:8000` lúc kiểm.

Validation thực tế 2026-05-31: hoàn tất Phase 6.9 hard delete service. Tách `app/modules/examinations/services/hard_delete_service.py` cho `DELETE /examinations/<id>`. Route giữ URL, auth decorator, status code, message và lỗi cũ; service giữ nguyên thứ tự raw SQL xóa survey, details, records, prescriptions, orders, appointment services, diagnosis, relatives, notifications, medical records, Google Calendar events và appointment nếu không còn examination nào. Không chạy xóa dữ liệu thật; validation chỉ kiểm syntax/import và id không tồn tại raise `HardDeleteExaminationNotFound`.

Validation thực tế 2026-05-31: hoàn tất Phase 6.10 create service. Tách `app/modules/examinations/services/creation_service.py` cho `POST /examinations`; route cũ chỉ giữ session/HTTP/error response. Service giữ validation message chính, duplicate appointment check 5 phút, tạo appointment status `CONFIRMED`, examination status `WAITING_TRANSFER`, family members và Google Calendar sync legacy. Đã sửa mapping nội bộ theo model hiện tại: frontend gửi `phone_number`, backend ghi/lookup bằng `patients.phone`; các field không tồn tại trên `Patient` không còn truyền vào constructor. Syntax check toàn nhóm examinations đã qua; import check services đã qua; validation service cho body rỗng, thiếu service/gói và lowercase `service` đều trả đúng lỗi; endpoint smoke `POST /examinations` với body `{}` trả `400 application/json` và không tạo dữ liệu thật.
