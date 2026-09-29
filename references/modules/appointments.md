# Appointment Module Context

## Calendar dashboard access (2026-09-28, lát63)

- Owner `services/calendar_access.py`: actor reload từ DB, active role hợp lệ,
  User share lock. Không tin role/can_view_all từ detached actor truyền vào.
- sync-status/verify-events theo quyền đọc clinical (view-all/historical
  psychologist được đọc). sync chỉ admin/staff hoặc current doctor_id; view-all
  và psychologist_id lịch sử không cấp write. Toàn batch validate trước Google.
- sync/verify nhận1..100 IDs int hoặc ASCII digits, int32 dương, dedup/sort;
  malformed400, missing/deleted404, forbidden403, cancelled sync409. Lock
  appointments ordered, read SHARE/ write UPDATE, reload owner/status sau lock.
- doctor/psychologist sync chỉ lịch cá nhân; admin/staff vẫn broadcast bác sĩ
  và staff kết nối. validate-connections clinical chỉ sửa connection của mình.
- delete-all bắt buộc from_date/to_date ISO hợp lệ, inclusive <=366 ngày,
  end-exclusive ngày kế tiếp. Actor clinical chỉ current-owned appointments
  và events.user_id chính mình; admin/staff giữ scope toàn hệ thống. Lock
  appointments trước đọc events/provider; thiếu dates không xóa toàn DB.
- sync-status cũng dùng date bound. Response shape giữ nguyên; clinician sync
  có thể partial vì không ghi lịch staff. UI chunk >100/error/status messaging
  và real clinical browser acceptance chưa QA; không coi backend pass là UI pass.
- Chưa gom hết legacy writers vào outbox; callback OAuth/state và connection
  account identity, provider deadlines/monitoring/rollout vẫn cần kiểm riêng.

## Transfer session (2026-09-28, lát58)

Shared TransferModal dùng canonical jQuery transport, giữ cookie revision hoặc
legacy credential lúc mở. Đổi phiên/ca chặn recipient load/POST mới và callback
sau POST cũ; request đã gửi không rollback. Chỉ server success+count đủ batch
mới hide/toast/reload; no-op/partial count cảnh báo kiểm tra danh sách. Giữ
beforeTransfer save và khóa bấm đôi/close. Không đổi backend transfer contract.
Lát59 backend: đọc lại actor/recipient đang active từ DB, shared lock users
theo ID; admin/staff chuyển trong toàn hệ thống, doctor/psychologist chỉ ca
đang sở hữu qua appointment.doctor_id. can_view_all_patients chỉ quyền đọc,
psychologist_id lịch sử không cấp quyền chuyển sau khi đã bàn giao.
Recipient phải đúng doctor/PSYCHOLOGIST/staff. Batch tối đa100 IDs, chuẩn hóa
ID nguyên dương, khóa appointments rồi active examinations theo ID và kiểm
toàn bộ trước mutation. Missing/deleted404, ngoài quyền403, chưa confirmed/
thiếu hoặc nhiều active examination/trạng thái thanh toán hoặc kết thúc409;
payload/target400. Validation rollback cả batch; no-op0 không emit/notify.
Lát60 thay Google Calendar precommit bằng durable job cùng transaction khi
doctor_id đổi (cả doctor và psychologist). Không gọi Google trong transfer;
worker riêng đọc job đã commit. Xem rollout bắt buộc trong ops-and-validation.
Đây là eventual consistency, không phải atomic transaction xuyên Google/DB.

## Calendar transfer jobs (2026-09-28, lát60)

Lát62 mở rộng safety cho legacy writers (chưa chuyển toàn bộ sang outbox):
manual-sync verify strict phân biệt absent với network/auth/quota error;
error giữ mapping và không create. Duplicate cùng provider ID chỉ dedup DB;
khác provider ID phải delete Google thành công mới bỏ mapping. Update helper
chỉ recreate confirmed-missing, giữ mapping nếu create thất bại. Cancel helper
chỉ xóa mapping khi delete=True, unknown owner/disconnected giữ để đối soát.
Delete-all không coi thiếu token là thành công; chỉ HttpError.status404/410
được coi đã xóa, không parse mã trong arbitrary exception text;429 và
403 rateLimitExceeded retry tối đa3. Response count phản ánh số xóa xác nhận.
Đây chưa phải durable/idempotent tạo lịch cho manual-sync hoặc cancel outbox.

- Owner `services/calendar_transfer.py`; helper cũ chỉ enqueue, không tự commit.
  Job lưu appointment/old user/target user/event ID ngẫu nhiên cố định, không
  snapshot tên bệnh nhân hoặc nội dung khám. No-op không tạo job.
- Worker khóa appointment rồi job, kiểm current owner/status sau lock. Job cũ
  không tạo lịch cho người đã bàn giao; xóa cả deterministic event có thể đã
  được Google nhận nhưng response hoặc DB commit trước đó thất bại.
- Chỉ xóa mappings đúng old_user_id khi Google xác nhận delete; giữ lịch staff.
  user_id=NULL legacy không đoán owner, giữ pending để đối soát. Target chưa
  nối Google, delete/update/create lỗi đều giữ job và backoff30s..3600s.
- Create dùng event ID của job, insert409 kiểm private marker appointment/job
  trước patch; lỗi mạng không đổi ID. Lát61: existing target update opt-in
  report_missing=True trả None chỉ khi GET404/410 hoặc cancelled; False là
  lỗi chưa xác định, giữ mapping và không tạo mới. Bỏ mappings đã xác nhận
  mất; chỉ tạo khi không còn target event sống. Tránh retry kẹt khi delete
  Google đã thành công nhưng DB rollback rồi chuyển trở lại bác sĩ cũ.
  Nếu insert409 rồi GET410/cancelled, identity đã retired: rollback savepoint,
  lưu ID thay thế cùng retry state, lần chạy sau mới dùng. GET404 sau409 còn
  mơ hồ nên không đổi ID. Lỗi commit rotation không gửi ID chưa lưu lên Google.
  Google404/410 delete là idempotent success. Provider errors không lưu payload
  hoặc credential trong job.last_error.
- `scripts/process_calendar_transfers.py --run --watch` là consumer riêng,
  không tự khởi chạy trong web request. Schema + consumer phải rollout cùng
  source. Chưa chạy consumer/migration trên DB vận hành trong lát60.
- Phạm vi còn mở: manual sync/cancel/update/re-examination dùng writer cũ,
  chưa chia sẻ lock/outbox; orphan NULL owner, xóa thủ công sau job completed,
  reconnect Google account khác, job retention/monitoring và provider E2E thật.
  Không coi 18 tests mới là bằng chứng mọi calendar workflow đã đồng bộ đúng.

## Lịch bận cá nhân: preset và nội dung (2026-09-28)

doctor-busy-schedule.js/template truyền $this qua inline-actions cho5 nút
chọn nhanh, không phụ thuộc window.event. Active/aria-pressed chỉ trong form;
manual datetime change và form reset clear lựa chọn, không đổi giờ/payload.
Reason render ở gợi ý, bảng và modal xóa dùng QLPKSharedUtils.escapeHtml từ
utils.js; nội dung lưu vẫn nguyên văn, gợi ý chọn bằng text(), không HTML.
Tests busy_schedule_quick_time.test.js và busy_schedule_content_safety.test.js;
Chrome1440/390 API fixture đạt, chưa pass visual/interactive QA dữ liệu thật.

## Shared calendar owner (2026-09-27)

`components/appointment-calendar.js` thay `appointment-management/calendar-event-content-utils.js`:
hai màn lịch hẹn và tái khám gọi `QLPKAppointmentCalendar.create`, dùng CSS
`components/appointment-calendar.css`. Chung toolbar, Thứ Hai đầu tuần,
font, grid, thẻ trạng thái, doctor dot và status counts. Lịch hẹn truyền
callbacks CRUD/filter/drag riêng và giữ tuần/tháng; Doctor monthOnly với
callback chọn draft. Doctor legend dùng cùng resolver màu theo ID/DB;
thiếu màu dùng neutral, không gán theo thứ tự danh sách. CSS tháng/event
cũ đã bỏ khỏi appointment-management.css; CSS tuần/ngày lễ giữ riêng.
QA đối chiếu và giới hạn: `references/ui/re-examination-month-layout-qa.md`.

Tài liệu này là context ngắn cho workflow lịch hẹn/tiếp nhận. Đọc khi sửa appointment list, appointment response shape, trạng thái lịch hẹn, hoặc khi chuẩn hóa tiếp `app/api/appointment.py`.

## Ownership

- `appointments`: dữ liệu đặt lịch và hành chính của lượt đến, gồm ngày giờ, bác sĩ/tâm lý gia, dịch vụ/gói, trạng thái, loại lịch, ghi chú hành chính.
- `patients`: thông tin định danh và nền của bệnh nhân được liên kết với lịch hẹn.
- `examinations`: dữ liệu khám theo lượt, trạng thái khám, sinh hiệu, chẩn đoán, đánh giá nguy cơ và lời dặn.
- `examination_details`: các field form/modal linh hoạt theo đúng `section`.

Không dùng `appointment.notes` thay cho `examinations.loi_dan`. Không để frontend tự suy luận trạng thái khám từ nhãn hiển thị.

Lưu ý cập nhật 2026-08-05: các đoạn validation lịch sử bên dưới từng ghi việc
đồng bộ `examinations.symptoms` hoặc map section alias cũ; chúng đã được thay
thế bởi migration Doctor cleanup. Runtime hiện chỉ dùng `main_symptoms` và
section canonical, không khôi phục các cột/alias đã xoá.

## Module Island Hiện Tại

- `app/modules/appointments/services/query_service.py`: owner cho query/filter/pagination của `GET /api/appointments/` và stats đọc của `GET /api/appointments/stats`, bao gồm filter theo role, ngày, người khám, bệnh nhân, trạng thái và màn gọi.
- `app/modules/appointments/services/confirmation_service.py`: owner mutation của `PUT /api/appointments/<id>/confirm`, gồm validate appointment tồn tại/status `SCHEDULED`, đổi appointment sang `CONFIRMED` và tạo `examinations` legacy status `WAITING_TRANSFER`.
- `app/modules/appointments/services/deletion_service.py`: owner lifecycle guard và mutation xóa lịch hẹn, gồm soft cancel `/<id>/cancel` và hard-delete legacy `/<id>/hard-delete`; route giữ force flag, commit/rollback, calendar sync coordination và HTTP response cũ.
- `app/modules/appointments/services/export_service.py`: owner query và build workbook Excel cho `POST /api/appointments/export`; route giữ auth/session/send_file/error response cũ.
- `app/modules/appointments/services/import_service.py`: owner batch import cho `POST /api/appointments/import`, gồm validate row, tìm/tạo patient theo phone hoặc name+DOB, tạo appointment import và gom lỗi từng dòng; route giữ session/commit cuối batch/HTTP response cũ.
- `app/modules/appointments/services/re_examination_service.py`: owner tạo/tìm/hủy lịch tái khám, gồm direct API `POST /api/appointments/re-examination` và các helper compatibility đang được prescription flow gọi.
- `app/modules/appointments/services/creation_service.py`: owner write path chính của `POST /api/appointments/`, gồm resolve/tạo/cập nhật patient, confirmation khi đổi tên bệnh nhân trùng, validate duplicate slot, tạo appointment, tạo examination ban đầu và gọi side effects qua callback route.
- `app/modules/appointments/services/status_transition_service.py`: owner mutation của các endpoint trạng thái nhỏ `back-to-appointment`, `return-to-doctor`, `return-to-receptionist`; route giữ auth/session/HTTP response, service giữ lookup và đổi/xóa dữ liệu legacy.
- `app/modules/appointments/services/update_service.py`: owner helper nhỏ cho `PUT /api/appointments/<id>` phần appointment admin fields, patient-owned fields, examination clinical fields, selected examination details, build địa chỉ từ province/district/ward/address_detail, và tạo examination khi confirm appointment/chưa có lượt khám.
- `app/modules/appointments/services/appointment_service_selection.py`: owner chung cho resolve catalog, paid lock, role finance override và công thức tiền của `appointment_services`. Các route Doctor/reception và payment legacy phải đi qua owner này; không đặt công thức giá/chiết khấu/thuế riêng ở route.
- `app/modules/appointments/services/transfer_service.py`: owner mutation của `POST /api/appointments/transfer`, gồm validate payload, map role sang trạng thái khám mới, cập nhật bác sĩ/tâm lý gia trên appointment/examination, và gọi calendar side effect khi chuyển sang bác sĩ khác.
- `app/modules/appointments/services/side_effects.py`: owner side effects appointment, gồm implementation sync Google Calendar chung, calendar create cho tái khám legacy, calendar sync khi transfer sang bác sĩ khác, orchestration sau update appointment đã commit, chọn calendar action theo trạng thái/đổi bác sĩ, và schedule reminder async 24h cho create/update/tái khám.
- `app/modules/appointments/view_models/appointment_response.py`: owner cho response shape legacy của appointment API, bao gồm patient payload, doctor payload, examination payload, diagnosis display text và raw `*_ids`.
- `app/modules/appointments/view_models/appointment_edit.py`: owner cho response shape của edit modal `GET /api/appointments/<id>/edit`, gồm `patient_info`, `doctor_info`, `service_info`, `package_info` và `examination_info` mở rộng.
- `app/services/appointment_query_service.py`: wrapper tương thích cho import path cũ, không đặt logic mới ở đây.
- `app/services/appointment_view_model_service.py`: wrapper tương thích cho import path cũ, không đặt logic mới ở đây.
- `app/utils/appointment_helpers.py`: giữ parser ngày và wrapper `format_appointment_response()` cho caller legacy; formatter thật nằm trong module appointments.
- `app/api/appointment.py`: vẫn là route/controller trung tâm, giữ URL cũ và write path cũ. File này có blast radius cao vì có thể ghi `appointments`, `patients`, `examinations` và một số `examination_details`.
- `app/static/js/appointment-management.js`: legacy orchestrator của màn quản lý lịch hẹn. Helper hiện có trong `app/static/js/appointment-management/` gồm status/filter/conflict/duplicate warning, service-package, doctor controls/legend, add/edit modal UI, ICD multiselect, page actions/interactions, FullCalendar event content/source/date, busy schedule, Google Calendar connection/sync table/status/date/filter/controls/modal/runtime, feedback và mini-calendar bootstrap. Từ 28/09/2026 (lát68) orchestrator chỉ còn khởi tạo `page.state` và các binding/init theo thứ tự cũ; toàn bộ hàm của closure cũ nằm trong 7 slice `appointment-management/page-{data,view,calendar,edit-modal,editor,add-modal,busy-sync}.js`, cài vào `window.AppointmentManagementPage` (hàm) và `page.state` (state dùng chung), nạp ngay trước `appointment-management.js`. Slice không tự bind sự kiện; `tests/appointment_management_modules.test.js` khóa thứ tự nạp, ≤600 dòng và mọi `page.X`/`state.X` đều có nơi cài/khởi tạo.

### Shared ICD Autocomplete Contract

- Template Lễ tân phải load `app/static/js/components/icd-data-loader.js` trước
  `app/static/js/components/icd-autocomplete.js`; thiếu loader sẽ tạo UI nhưng
  luôn trả danh sách ICD rỗng mà không tạo lỗi console rõ ràng.
- `app/static/js/components/icd-autocomplete.js` là owner chung của DOM,
  dropdown positioning, loading/empty state, keyboard, click-outside và tag.
  `app/static/js/appointment-management/icd-multiselect-utils.js` chỉ là adapter
  add/edit, không được dựng renderer hoặc positioning riêng.
- `app/templates/components/_icd_autocomplete.html` là skeleton Jinja duy nhất
  cho mọi ICD field. Add/edit modal chỉ truyền ID/class/placeholder; label phải
  đứng ngoài root và liên kết input bằng `for`, không được bọc tag và nút xóa
  trong implicit `<label>`.

## Mapping Phase 5

- Cũ: `app/services/appointment_query_service.py` -> Mới: `app/modules/appointments/services/query_service.py`.
- Cũ: `app/services/appointment_view_model_service.py` -> Mới: `app/modules/appointments/view_models/appointment_response.py`.
- Runtime route `app/api/appointment.py` import `get_appointment_list()` từ module path mới.
- Runtime helper `app/utils/appointment_helpers.py` import `build_appointment_response()` từ module path mới.
- URL giữ nguyên: `GET /api/appointments/`, `GET /api/appointments/<id>`, `GET /api/appointments/<id>/edit`, `GET /api/appointments/stats`, `POST /api/appointments/export`, `POST /api/appointments/`, `PUT /api/appointments/<id>`, `PUT /api/appointments/<id>/confirm`, `PUT /api/appointments/<id>/back-to-appointment`, `PUT /api/appointments/<id>/return-to-doctor`, `PUT /api/appointments/<id>/return-to-receptionist`, `DELETE|POST /api/appointments/<id>/cancel`, `DELETE /api/appointments/<id>/hard-delete`, `POST /api/appointments/transfer`.

## Contract Cần Giữ

- `GET /api/appointments/` vẫn trả list appointment và pagination như trước.
- `GET /api/appointments/stats` vẫn trả stats theo trạng thái examination cho receptionist/doctor/psychologist screen; giữ cả legacy behavior hiện tại là danh sách status có `COMPLETED` lặp, nên bucket `completed` vẫn cộng như cũ.
- `GET /api/appointments/<id>` vẫn trả combined appointment/patient/examination shape cho màn bác sĩ, tâm lý gia và lễ tân.
- `GET /api/appointments/<id>/edit` vẫn trả payload mở rộng cho modal sửa lịch trong appointment-management, gồm các block legacy `patient_info`, `doctor_info`, `service_info`, `package_info`, `examination_info`; lỗi không tìm thấy vẫn là `{'error': 'Không tìm thấy lịch hẹn'}`.
- `POST /api/appointments/` giữ create appointment legacy: patient cũ theo CCCD/phone/name+DOB, confirmation khi tên bệnh nhân đổi, duplicate slot trong khoảng 5 phút, auto duration theo service, create examination ban đầu cho receptionist-new và response `format_appointment_response()` như cũ.
- `POST /api/appointments/import` giữ import batch legacy: body `data`, lỗi từng dòng được gom trong `errors`, không có data trả `400 {'detail': 'No data provided for import.'}`, commit một lần cuối batch.
- `POST /api/appointments/re-examination` giữ payload bắt buộc `original_appointment_id`, `examination_type`, `package_service_id`, `doctor_id`, `re_examination_date`, `re_examination_time`; tạo appointment tái khám, calendar/reminder và examination `WAITING_TRANSFER` như cũ.
- `POST /api/appointments/export` vẫn trả file Excel `lich_hen_<YYYYMMDD>.xlsx` với header/cột/style cũ, filter `doctor_id` và `role_filter` cũ, và lỗi server dạng `{'detail': 'Có lỗi xảy ra khi xuất dữ liệu: ...'}`.
- Diagnosis/benh kèm theo trong response đọc phải là display text, raw ICD nằm ở `diagnosis_ids` / `benh_kem_theo_ids`.
- `PUT /api/appointments/<id>/confirm` giữ behavior legacy: route không có `require_auth`, chỉ appointment `SCHEDULED` mới confirm được, tạo một `Examination` mới với `WAITING_TRANSFER`, và trả response `appointment`/`examination` như cũ.
- `PUT /api/appointments/<id>/back-to-appointment` giữ behavior legacy: có `require_auth`, xóa các `examinations` liên kết rồi set appointment về `SCHEDULED`, trả message cũ và `new_status: SCHEDULED`.
- `PUT /api/appointments/<id>/return-to-doctor` giữ behavior legacy: có `require_auth`, chỉ lấy examination đang `PSYCHOLOGIST_EXAM`/`CONCLUSION`/`COMPLETED`, set về `DOCTOR_EXAM`, trả message cũ.
- `PUT /api/appointments/<id>/return-to-receptionist` giữ behavior legacy: có `require_auth`, chỉ lấy examination đang `DOCTOR_EXAM`/`PSYCHOLOGIST_EXAM`/`CONCLUSION`/`COMPLETED`, set về `WAITING_TRANSFER`, trả message cũ.
- `DELETE|POST /api/appointments/<id>/cancel` giữ lifecycle guard legacy: không tìm thấy trả `404 {'detail': 'Không tìm thấy lịch hẹn'}`; examination `WAITING_PAYMENT`/`PAID`/`COMPLETED` trả `400` kèm `blocked: true`; examination `DOCTOR_EXAM`/`PSYCHOLOGIST_EXAM`/`CONCLUSION` trả `409 requires_force` nếu chưa gửi force; khi được phép thì set `appointments.is_deleted=True`, `deleted_at`, `status=CANCELLED`, set mọi examination liên quan `is_active=False`, commit rồi sync calendar delete.
- `DELETE /api/appointments/<id>/hard-delete` giữ behavior legacy nguy hiểm: có `require_auth`, sync calendar delete trước rồi `db.delete(appointment)`, thành công trả status `204` như cũ. Không mở rộng sử dụng endpoint này nếu không có yêu cầu quản trị rõ ràng.
- `PUT /api/appointments/<id>` đã tách helper patient-owned fields, appointment admin fields, examination clinical fields, selected examination details và side effects calendar/reminder sau commit. Route vẫn giữ wrapper `sync_calendar_for_appointment(...)` để các caller legacy create/delete/tái khám không đổi tên hàm, nhưng implementation thật nằm trong module service.
- Lỗi khi áp clinical/detail field trong `PUT /api/appointments/<id>` phải bubble về route để transaction rollback và trả lỗi; không được log rồi tiếp tục commit phần dữ liệu còn lại.
- Dòng `appointment_services` mới lấy identity/price/duration từ catalog ở server; Doctor/reception chỉ đổi selection, số lượng và ghi chú. `admin`/`staff` mới được override giá/chiết khấu/thuế qua finance flow; mọi thay đổi bị chặn sau khi thanh toán.
- `POST /api/appointments/transfer` giữ URL/payload/status/message cũ; mutation chính nằm trong `transfer_service.py`, route chỉ giữ auth/session/commit/rollback/HTTP response.
- Side effect `_mark_expired_scheduled_appointments_no_show()` hiện vẫn chạy trong list query và commit đổi lịch quá hạn sang `NO_SHOW`; chưa thay đổi hành vi này.

## Validation

Khi sửa workflow này, chạy checklist `Backend Endpoint Refactor` và `Folder Move Checks` trong `references/smoke-checks.md`.

Tối thiểu:

- `python3 -m py_compile app/modules/appointments/services/query_service.py app/modules/appointments/view_models/appointment_response.py app/modules/appointments/services/__init__.py app/modules/appointments/view_models/__init__.py app/services/appointment_query_service.py app/services/appointment_view_model_service.py app/utils/appointment_helpers.py app/api/appointment.py`
- `GET /api/appointments/` trong phiên chưa đăng nhập không được 500; thường sẽ trả lỗi auth/redirect tùy middleware.
- Trong phiên đăng nhập, kiểm list lịch hẹn và mở chi tiết một appointment từ màn lễ tân/bác sĩ/tâm lý gia nếu lát có đổi behavior.

Validation thực tế 2026-05-30: syntax check các file appointments mới/wrapper/API đã qua; `GET /api/appointments/` không kèm auth trả `401 application/json` với lỗi thiếu Authorization header, không phát sinh 500. Import check xác nhận `app/api/appointment.py` đang dùng `get_appointment_list` từ `app.modules.appointments.services.query_service`, và wrapper cũ cũng resolve về module path mới.

Smoke thực tế 2026-05-30: user đã test cơ bản workflow appointments sau khi tách module island và xác nhận ổn.

Validation thực tế 2026-05-31: tách helper patient update của `PUT /api/appointments/<id>` sang `app/modules/appointments/services/update_service.py`. Route vẫn giữ URL/status/response và các write path còn lại. Helper nhận các field patient legacy, map `phone_number` sang `patients.phone`, bỏ qua field không thuộc model như `breathing/main_reason` thay vì tạo transient attribute không persist, và giữ behavior build lại `address` khi có address components. Syntax check appointments module/API/wrapper đã qua; import check service đã qua; unit-style service check xác nhận update `full_name`, `phone`, `date_of_birth`, build full address và không set `breathing`; endpoint không-auth `PUT /api/appointments/0` trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-31: tách helper appointment admin update của `PUT /api/appointments/<id>` vào `app/modules/appointments/services/update_service.py`. Service mới xử lý parse `appointment_date`, sync `examinations.examination_date/patient_id` khi đổi ngày hoặc patient, normalize `status/appointment_type`, validate chặn status legacy, validate bằng `AppointmentUpdate`, cập nhật service duration, clear/set `notes`, và tạo examination khi status chuyển `CONFIRMED` mà chưa có lượt khám. Route giữ URL/status/response, giữ calendar/reminder ở route qua result `doctor_changed` và `appointment_date_updated`. Syntax check appointments module/API/wrapper đã qua; import check đã qua; unit-style service check xác nhận uppercase status/type, clear notes, detect doctor change và invalid date raise lỗi; endpoint không-auth `PUT /api/appointments/0` trả `401 application/json`, không phát sinh 500. Có cảnh báo Pydantic `orm_mode` cũ khi import schema, là cảnh báo tồn tại sẵn, không phát sinh từ lát này.

Validation thực tế 2026-05-31: tách helper examination clinical update của `PUT /api/appointments/<id>` vào `app/modules/appointments/services/update_service.py`. Service mới xử lý tạo examination khi chưa có dữ liệu khám, cập nhật `main_reason`, `main_symptoms` kèm legacy `symptoms`, `diagnosis`, `benh_kem_theo`, `treatment_plan`, `loi_dan`, `current_medications`, `risk_assessment` và sinh hiệu. Route giữ `examination` trả về để phần `examination_details` phía sau chạy như cũ. Syntax check appointments module/API/wrapper đã qua; import check đã qua; unit-style service check xác nhận `main_symptoms` sync sang `symptoms`, sinh hiệu numeric được ép float, giá trị numeric xấu bị bỏ qua như legacy, `blood_pressure` giữ text và flush đúng; endpoint không-auth `PUT /api/appointments/0` trả `401 application/json`, không phát sinh 500. Cảnh báo Pydantic `orm_mode` vẫn là cảnh báo tồn tại sẵn.

Validation thực tế 2026-05-31: tách selected `examination_details` trong `PUT /api/appointments/<id>` vào `app/modules/appointments/services/update_service.py`. Service mới giữ danh sách field legacy `trieu_chung_va_hanh_vi_hien_tai`, `nhan_dinh_chung`, `ke_hoach_can_thiep`, mapping section `examination_form` sang section bác sĩ/tâm lý gia qua `get_section_name()`, xóa biến thể section cũ `form_kham`/`examination_form`, xóa field cũ `diagnosis` khi migrate sang `trieu_chung_va_hanh_vi_hien_tai`, và lưu `notable_behavior` ở `patient_info/notableBehavior`. Route giữ URL/status/response và calendar/reminder ở chỗ cũ. Syntax check appointments module/API/wrapper đã qua; import check đã qua; unit-style service check xác nhận tạo detail ở `bac_si_kham_form_kham`, giữ empty string, lưu `patient_info/notableBehavior`, delete path được gọi; endpoint không-auth `PUT /api/appointments/0` trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-31: tách orchestration side effects sau `PUT /api/appointments/<id>` sang `app/modules/appointments/services/side_effects.py`. Route sau commit chỉ gọi `apply_appointment_update_side_effects(...)`; service giữ thứ tự legacy: appointment `CANCELLED` thì calendar `delete`, đổi bác sĩ thì `delete` rồi `create`, còn lại `update`; nếu đổi `appointment_date` thì schedule reminder async 24h. Chưa move implementation `sync_calendar_for_appointment()` khỏi `app/api/appointment.py` để không đổi behavior các luồng create/delete/re-examination khác trong cùng lát. Syntax check và service branch check đã qua; endpoint không-auth `PUT /api/appointments/0` vẫn trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-31: move implementation `sync_calendar_for_appointment()` khỏi `app/api/appointment.py` sang `app/modules/appointments/services/side_effects.py`. Route giữ wrapper cùng tên để caller legacy trong create/update/delete vẫn gọi như cũ; service nhận `logger_override` để log giữ ngữ cảnh route. `app/api/appointment.py` giảm còn 2093 dòng. Syntax/import check đã qua; wrapper check xác nhận route gọi module service; endpoint không-auth `PUT /api/appointments/0` vẫn trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-31: tách helper schedule reminder async 24h sang `app/modules/appointments/services/side_effects.py`. `create_appointment` và `create_re_examination` trong route gọi `schedule_appointment_reminder(...)`; update path giữ wrapper `schedule_appointment_update_reminder(...)` để log message cũ không đổi. Route không còn import `threading`. Syntax/import check đã qua; spy check xác nhận service tạo daemon thread và wrapper route dùng đúng service; endpoint không-auth `PUT /api/appointments/0` vẫn trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-31: tách 2 block Google Calendar create cho tái khám trong `app/api/appointment.py` sang `sync_re_examination_calendar_on_create()` ở `app/modules/appointments/services/side_effects.py`. Giữ behavior legacy: tạo event bác sĩ trước và commit, lấy tất cả lễ tân có calendar connection, tạo event từng lễ tân và commit từng event, lỗi từng lễ tân không fail toàn bộ, lỗi ngoài vẫn log và cố commit. Luồng tái khám trực tiếp và tái khám từ đơn thuốc truyền message riêng để giữ log cũ. `app/api/appointment.py` giảm còn 1968 dòng. Syntax/import check đã qua; endpoint không-auth `PUT /api/appointments/0` vẫn trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-31: tách Google Calendar side effect khi `POST /api/appointments/transfer` chuyển appointment sang bác sĩ khác vào `sync_transferred_appointment_calendar()` trong `app/modules/appointments/services/side_effects.py`. Route giữ nguyên URL/payload/status/message và vẫn không fail transfer nếu Google Calendar lỗi. Behavior legacy được giữ: lấy event đầu tiên theo appointment, thử xóa bằng connection bác sĩ cũ nếu active, xóa record DB khi xóa được nhánh cũ, rồi tạo event cho bác sĩ mới nếu có active connection. `app/api/appointment.py` giảm còn 1930 dòng. Syntax/import check đã qua; helper no-op khi bác sĩ không đổi đã qua; endpoint không-auth `POST /api/appointments/transfer` trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-31: tách mutation chính của `POST /api/appointments/transfer` sang `app/modules/appointments/services/transfer_service.py`. Service giữ validation message cũ, role/status mapping cũ, update `appointment.doctor_id/psychologist_id`, update `examination.doctor_id/status`, và gọi `sync_transferred_appointment_calendar()` khi chuyển sang bác sĩ khác. Route giữ commit/rollback và response cũ. `app/api/appointment.py` giảm còn 1833 dòng. Syntax check đã qua; unit-style check cho status mapping và validation lỗi đã qua; endpoint không-auth `POST /api/appointments/transfer` vẫn trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-31: tách stats đọc của `GET /api/appointments/stats` sang `get_appointment_stats()` trong `app/modules/appointments/services/query_service.py`. Route giữ URL/auth/session/HTTP response; service giữ role filter doctor/psychologist và legacy status aggregation, bao gồm `COMPLETED` lặp như trước. `app/api/appointment.py` giảm còn 1785 dòng. Syntax check đã qua; direct service check cho doctor/psychologist/receptionist/no-flag đã qua; endpoint không-auth `GET /api/appointments/stats` trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-31: tách response builder của `GET /api/appointments/<id>/edit` sang `app/modules/appointments/view_models/appointment_edit.py`. Route giữ URL, HTTP status và error payload cũ; view model dùng `build_appointment_response()` làm nền rồi bổ sung các block edit modal legacy. `app/api/appointment.py` giảm còn 1656 dòng. Syntax check đã qua; direct view-model check với appointment `998` trả đủ `patient_info/doctor_info/service_info/package_info/examination_info`; missing id raise đúng `AppointmentEditNotFound`; endpoint thật `/api/appointments/998/edit` trả `200 application/json` và `/api/appointments/0/edit` trả `404 {'error': 'Không tìm thấy lịch hẹn'}`.

Validation thực tế 2026-05-31: tách mutation của `PUT /api/appointments/<id>/confirm` sang `app/modules/appointments/services/confirmation_service.py`. Service giữ behavior legacy: confirm chỉ khi appointment đang `SCHEDULED`, set appointment `CONFIRMED`, tạo examination code `LK%Y%m%d%H%M%S`, status `WAITING_TRANSFER`, service/package theo appointment. Route giữ response payload/status code cũ và vẫn không thêm auth. `app/api/appointment.py` giảm còn 1634 dòng. Syntax check đã qua; service rollback test với appointment `803` đã qua; endpoint `/api/appointments/0/confirm` trả 404 và `/api/appointments/998/confirm` trả 400 đúng message cũ.

Validation thực tế 2026-05-31: tách nhóm appointment status transitions sang `app/modules/appointments/services/status_transition_service.py`, gồm `back-to-appointment`, `return-to-doctor`, `return-to-receptionist`. Route giữ `require_auth`, URL, message, status code và response payload cũ; service giữ logic xóa examination khi quay về `SCHEDULED`, trả examination về `DOCTOR_EXAM`, hoặc trả về `WAITING_TRANSFER`. `app/api/appointment.py` giảm còn 1594 dòng. Syntax check đã qua; service rollback-only check với dữ liệu thật đạt cho missing appointment, return-to-doctor, return-to-receptionist và back-to-appointment; endpoint không-auth cho 3 route trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-31: tách appointment deletion/cancel lifecycle sang `app/modules/appointments/services/deletion_service.py`. Service giữ guard theo trạng thái examination, soft cancel appointment, deactivate examinations và hard-delete legacy; route giữ force flag, commit/rollback, sync calendar delete sau soft-cancel commit và trước hard-delete như cũ. `app/api/appointment.py` giảm còn 1563 dòng. Syntax check đã qua; service rollback-only check với dữ liệu thật đạt cho missing soft/hard delete, blocked `WAITING_PAYMENT`, requires-force `DOCTOR_EXAM`, force soft cancel và hard-delete không commit; endpoint không-auth `DELETE|POST /api/appointments/0/cancel` và `DELETE /api/appointments/0/hard-delete` đều trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-31: tách appointment Excel export sang `app/modules/appointments/services/export_service.py`. Service giữ query filter `doctor_id`/`role_filter`, style/header/column widths, ICD physical history text, risk assessment, service/package và filename legacy; route chỉ còn auth/session/service call/`send_file`/error response. `app/api/appointment.py` giảm còn 1368 dòng. Syntax check đã qua; direct service check build workbook thật với DB hiện tại tạo `lich_hen_20260531.xlsx` dung lượng 140486 bytes; import check module service đã qua; endpoint không-auth `POST /api/appointments/export` trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-31: tách batch import sang `app/modules/appointments/services/import_service.py`. Service giữ validate row, warning DOB xấu, tìm/tạo patient, tạo appointment import và gom `errors`; route giữ URL không auth legacy, session và commit cuối batch. Syntax check đã qua; service check đạt cho no data, missing patient row và valid row rollback-only; endpoint `POST /api/appointments/import` body rỗng trả `400 application/json` đúng detail cũ.

Validation thực tế 2026-05-31: tách re-examination API/helpers sang `app/modules/appointments/services/re_examination_service.py`. Direct API giữ required fields/error status tiếng Anh cũ; helper prescription giữ tuple `(appointment, error)` và message tiếng Việt cũ; calendar/reminder/examination tái khám đi qua side effects service hiện có. Syntax check đã qua; validation check đạt cho missing required và missing original appointment; endpoint không-auth `POST /api/appointments/re-examination` trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-31: tách create appointment chính sang `app/modules/appointments/services/creation_service.py`. Route `POST /api/appointments/` chỉ còn auth/session/service call/format response/error mapping; service giữ patient resolution, confirmation payload, duplicate slot, Pydantic validation, service duration, create appointment, create initial examination và side-effect callbacks. `app/api/appointment.py` sau dọn import còn 559 dòng. Syntax check đã qua; validation check đạt cho missing full_name, missing patient_id, existing-patient confirmation và duplicate slot; endpoint không-auth `POST /api/appointments/` trả `401 application/json`, không phát sinh 500. Một bản ghi validation tạo nhầm đã được khoanh vùng theo ID mới nhất và xóa lại ngay, không để dữ liệu test tồn tại.

Lịch sử bugfix 2026-05-31: nút `Đặt lịch` trong `doctor-examination` > `Danh sách thuốc & cách dùng` từng có thể gửi giờ tái khám đúng phút hiện tại khi chọn ngày hôm nay. Lát cũ đã xử lý bằng `app/static/js/reexam-calendar.js`; file này và CSS/template dry tương ứng được retire trong cleanup 2026-08-23. Runtime hiện tại dùng owner tái khám trong `app/static/js/doctor-examination/prescription-ui.js` cùng backend `app/modules/appointments/services/re_examination_service.py`; contract ngày/giờ và chặn lịch quá khứ vẫn phải giữ nguyên.

Validation thực tế 2026-06-11: bắt đầu refactor frontend `appointment-management.js` bằng lát render lịch ngày/tuần. Tạo `app/static/js/appointment-management/calendar-render-utils.js` để gom build HTML table, filter event theo slot 15 phút, avatar bác sĩ, nhãn Khám mới/Tái khám và tooltip. Template load helper trước `appointment-management.js`; không đổi endpoint/payload/filter/CRUD/sync calendar. Syntax check helper + orchestrator đã qua; Node VM behavior check đạt cho slot filter, event HTML và HTML ngày/tuần. Localhost `/appointment-management.html` trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-11: tách tiếp render bảng danh sách lịch hẹn của `appointment-management.js` sang `app/static/js/appointment-management/list-render-utils.js`. Helper mới gom sort theo ngày hẹn, paging, empty state, status dropdown/confirmed badge, action buttons và text loại hẹn. Template load helper trước orchestrator; không đổi endpoint/payload/filter/CRUD/status API/sync calendar. Syntax check helper + orchestrator đã qua; Node VM behavior check đạt cho empty state, phân trang, currentPage clamp, row tái khám và status UI. Localhost `/appointment-management.html` trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-11: tách popup cảnh báo xung đột từ `appointment-management.js` sang `app/static/js/appointment-management/conflict-warning-utils.js`. Helper mới gom resolve tên bác sĩ, normalize time range, build message theo `busy_schedule`/`appointment`/fallback và render popup `.conflict-popup-overlay`; wrapper `showConflictWarning(...)` trong orchestrator vẫn giữ nguyên caller. Không đổi endpoint `/api/check-doctor-availability`, payload availability, drag/drop, create/edit appointment hoặc CSS popup. Syntax check helper + orchestrator đã qua; Node VM behavior check đạt cho các message và popup binding. Localhost `/appointment-management.html` trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-11: tách helper format/status thuần từ `appointment-management.js` sang `app/static/js/appointment-management/status-format-utils.js`. Helper mới gom format ngày/giờ, status text, badge class, pastel style và icon mapping; orchestrator giữ wrapper tên cũ để caller hiện tại không đổi. Không đổi endpoint/payload/render/status update/edit modal/sync calendar. Syntax check helper + orchestrator đã qua; Node VM behavior check đạt cho status mapping và fallback. Localhost `/appointment-management.html` trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-11: tách helper filter/statistics từ `appointment-management.js` sang `app/static/js/appointment-management/filter-utils.js`. Helper gom filter theo bác sĩ/TLG, role group, status/type/date/search và count status badge; orchestrator giữ state và chỉ gọi helper trong `updateViewAppointments()`/`updateStats()`. Giữ nguyên behavior legacy của stats là không áp `statusFilter` và không áp role group. Không đổi endpoint/payload/filter events/render/CRUD/status API/sync calendar. Syntax check helper + orchestrator đã qua; Node VM behavior check đạt cho các nhánh filter và count badge. Localhost `/appointment-management.html` trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-11: tách helper legend bác sĩ/TLG từ `appointment-management.js` sang `app/static/js/appointment-management/doctor-legend-utils.js`. Helper gom fallback color, render item legend, phân nhóm `PSYCHOLOGIST`, clone section tránh duplicate listener và click section để toggle `selectedRoleFilter`; orchestrator giữ wrapper `buildDoctorLegend()` và state. Không đổi endpoint/payload/dropdown bác sĩ/filter/render/CRUD/status API/sync calendar. Syntax check helper + orchestrator đã qua; Node VM behavior check đạt cho render nhóm, fallback color, click Bác sĩ/TLG, clear `#doctorFilter` và gọi `refreshView()`.

Validation thực tế 2026-06-11: tách helper render nội dung event FullCalendar từ `appointment-management.js` sang `app/static/js/appointment-management/calendar-event-content-utils.js`. Helper gom HTML ngày lễ, event compact, dot màu bác sĩ và fallback màu legacy; orchestrator giữ cấu hình FullCalendar và truyền `doctors`. Không đổi endpoint/payload/drag-drop/resize/click event/filter/render/CRUD/status API/sync calendar. Syntax check helper + orchestrator đã qua; Node VM behavior check đạt cho holiday HTML, dot màu custom, fallback strict `doctorId`, và event không có bác sĩ.

Validation thực tế 2026-06-11: tách helper ngày giờ calendar từ `appointment-management.js` sang `app/static/js/appointment-management/calendar-date-utils.js`. Helper gom `getWeekDates`, `getCalendarDateRange` và `toLocalISOString`; orchestrator giữ wrapper tên cũ để view tuần, reload theo date range và drag/drop update không đổi. Không đổi endpoint/payload/FullCalendar config/CRUD/status API/sync calendar. Syntax check helper + orchestrator đã qua; Node VM behavior check đạt cho week dates, range `toISOString()` legacy và ISO local.

Validation thực tế 2026-06-11: tách helper thuần lịch bận từ `appointment-management.js` sang `app/static/js/appointment-management/busy-schedule-utils.js`. Helper gom mapping lý do, kiểm tra đang bận, bận tương lai và lọc lịch bận chưa kết thúc; orchestrator giữ wrapper tên cũ cho panel avatar, tooltip và popup. Không đổi endpoint `/api/doctor-busy-schedules?status=active`, payload, busy schedule panel, drag/drop availability, calendar sync hoặc appointment CRUD. Syntax check helper + orchestrator đã qua; Node VM behavior check đạt cho mapping lý do, current/future/past và active filter.

Validation thực tế 2026-06-11: tách helper build FullCalendar event source từ `appointment-management.js` sang `app/static/js/appointment-management/calendar-event-source-utils.js`. Helper gom event appointment hiện hành, event appointment legacy, holiday event hiện hành/legacy và tooltip legacy; orchestrator giữ load data, add event source, busy doctors panel và realtime busy schedules. Giữ nguyên behavior hiện tại: holiday events được build nhưng không add vào `allEvents`, busy schedules không hiện trên calendar mà nằm ở panel riêng. Không đổi endpoint/payload/drag-drop/resize/click event/CRUD/status API/sync calendar. Syntax check helper + orchestrator đã qua; Node VM behavior check đạt cho id event, title tái khám, extendedProps, tooltip status icon/text và holiday field current/legacy.

Validation thực tế 2026-06-11: tách render panel/popup lịch bận từ `appointment-management.js` sang `app/static/js/appointment-management/busy-schedule-panel-utils.js`. Helper gom build map lịch bận theo bác sĩ, presentation avatar đang bận/bận tương lai/rảnh, HTML panel, tooltip text legacy và popup lịch bận theo bác sĩ; orchestrator giữ state `currentBusySchedules`, load user, realtime refresh và overlay append/remove. Không đổi endpoint `/api/doctor-busy-schedules?status=active`, `/users`, payload, calendar events, drag/drop availability, appointment CRUD hoặc sync calendar. Syntax check helper + orchestrator đã qua; Node VM behavior check đạt cho panel rỗng, avatar có/không ảnh, badge count, trạng thái hiện tại/tương lai/rảnh và popup rỗng/có lịch.

Validation thực tế 2026-06-11: tách render bảng modal đồng bộ Google Calendar từ `appointment-management.js` sang `app/static/js/appointment-management/calendar-sync-table-utils.js`. Helper gom badge text, empty state, group theo ngày, header ngày, status badge, action button và row HTML; orchestrator giữ API load/verify/sync, binding nút sync đơn lẻ, checkbox, counters sau verify, filter và collapse ngày. Không đổi endpoint calendar, payload hoặc sync behavior. Syntax check helper + orchestrator đã qua; Node VM behavior check đạt cho empty state, group theo ngày, synced/missing/chưa kết nối và fallback `date_key/datetime`.

Validation thực tế 2026-06-11: tách icon/trạng thái modal đồng bộ Google Calendar từ `appointment-management.js` sang `app/static/js/appointment-management/calendar-sync-status-utils.js`. Helper gom HTML icon verify events, HTML icon sync result, row status và button state cho nhánh verify/sync; orchestrator giữ AJAX verify/sync, DOM update, counters và toast lỗi. Không đổi endpoint calendar, payload, class/button text legacy hoặc row status mapping. Syntax check helper + orchestrator đã qua; Node VM behavior check đạt cho verify subtle badges, sync solid badges, `full/partial/error`, button state và row status.

Validation thực tế 2026-06-11: tách date preset và filter/collapse của modal đồng bộ Google Calendar từ `appointment-management.js` sang `app/static/js/appointment-management/calendar-sync-date-utils.js` và `app/static/js/appointment-management/calendar-sync-filter-utils.js`. Helper date gom tuần hiện tại, preset hôm nay/tuần/tháng, format `dd/mm/yyyy` và convert API `yyyy-mm-dd`; helper filter gom search/status row filter, header count và collapse nhóm ngày. Orchestrator giữ AJAX load/delete/sync/verify, button state, counter và toast. Không đổi endpoint calendar, payload hoặc row status mapping. Syntax check toàn bộ JS đã qua; Node VM behavior check đạt cho date range, parse date, search/status filter. Localhost `/appointment-management.html` vẫn trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-11: tách controls phụ trợ của modal đồng bộ Google Calendar từ `appointment-management.js` sang `app/static/js/appointment-management/calendar-sync-controls-utils.js`. Helper gom loading/error row, lấy ID missing/selected/synced, chọn checkbox visible, set bulk/action button state và cập nhật badge counter sau verify/sync. Orchestrator vẫn giữ AJAX `/api/calendar/sync-status`, `/api/calendar/verify-events`, `/api/calendar/sync`, `/api/calendar/delete-all`, toast và xử lý kết quả backend. Không đổi endpoint calendar, payload, message toast hoặc row status mapping. Syntax check toàn bộ JS đã qua; Node VM behavior check đạt cho loading/error HTML, synced IDs, badge text và apply button state.

Validation thực tế 2026-06-11: tách kết nối/trạng thái Google Calendar từ `appointment-management.js` sang `app/static/js/appointment-management/calendar-connection-utils.js`. Helper gom status badge, nút kết nối/ngắt kết nối, AJAX `/api/calendar/status`, `/api/calendar/connect/google/init`, `/api/calendar/disconnect` và xử lý query `calendar_connected/calendar_error`; orchestrator giữ wrapper `loadCalendarStatus()` và callback init modal sync. Không đổi endpoint, header token, redirect login, redirect URL Google, alert/toast message hoặc thứ tự load status/init modal. Syntax check toàn bộ JS đã qua; Node VM behavior check đạt cho connected badge và query event mapping. Localhost `/appointment-management.html` vẫn trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-11: tách binding tương tác cuối trang của appointment-management sang `app/static/js/appointment-management/page-interactions-utils.js`. Helper gom search bệnh nhân trên calendar, nút clear search, ESC xóa search/đóng trang khi không có modal và click header ngày trong bảng sync; orchestrator chỉ truyền `refreshView()` và setter `searchKeyword`. Không đổi filter data, route đóng trang, modal behavior, sync row collapse hoặc API. Syntax check toàn bộ JS đã qua; Node VM behavior check đạt cho debounce search, clear search và callback refresh. Localhost `/appointment-management.html` vẫn trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-11: tách binding modal Đồng bộ Google Calendar từ `appointment-management.js` sang `app/static/js/appointment-management/calendar-sync-modal-utils.js`. Helper gom init Flatpickr, preset ngày, search/status filter, refresh, select all, sync missing/selected, xóa tất cả Google Calendar events và auto-load khi modal mở; orchestrator truyền callback hiện có `loadSyncData`, `syncAppointments`, `filterSyncTable`, `validateCalendarConnections`. Không đổi endpoint calendar, payload delete-all, confirm text, toast message, date preset, filter debounce hoặc thứ tự validate/load modal. Syntax check toàn bộ JS đã qua; Node VM behavior check đạt cho refresh reset ngày/filter và status filter callback. Localhost `/appointment-management.html` vẫn trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-12: tách runtime AJAX/render/filter của modal Đồng bộ Google Calendar từ `appointment-management.js` sang `app/static/js/appointment-management/calendar-sync-runtime-utils.js`. Helper gom validate connections, load sync status, render bảng sync qua table helper, verify events, sync appointments, cập nhật counter/badge/button và filter bảng; orchestrator giữ wrapper callback cũ cho modal helper. Không đổi endpoint `/api/calendar/validate-connections`, `/api/calendar/sync-status`, `/api/calendar/verify-events`, `/api/calendar/sync`, header token, payload `{ appointment_ids }`, toast message hoặc row status mapping. Syntax check toàn bộ JS đã qua; Node VM behavior check đạt cho message validate, nhánh thiếu token, filter bảng và update badge. Localhost `/appointment-management.html` vẫn trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-12: tách popup cảnh báo bệnh nhân trùng khi thêm lịch hẹn từ `appointment-management.js` sang `app/static/js/appointment-management/patient-duplicate-warning-utils.js`. Helper gom build bảng so sánh field bệnh nhân, danh sách lịch hẹn cũ, HTML overlay và binding Hủy/Xác nhận; orchestrator giữ callback confirm để set `confirm_update_patient`, kiểm tra lịch bận và gửi lại `POST /api/`. Không đổi endpoint, payload tạo lịch, toast, timeout, conflict warning hoặc reload sau khi thêm lịch thành công. Syntax check toàn bộ JS đã qua; Node VM behavior check đạt cho format ngày, highlight field thay đổi, status lịch cũ và nút confirm popup. Localhost `/appointment-management.html` vẫn trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-12: tách controls dịch vụ/gói từ `appointment-management.js` sang `app/static/js/appointment-management/service-package-controls-utils.js`. Helper gom populate service select legacy, autocomplete dịch vụ add/edit, format giá, cập nhật giá add/edit và populate package select add/edit; orchestrator giữ state `services/packages`, các API load và façade tên cũ. Không đổi endpoint `/services/`, `/services/<id>`, `/packages/`, payload tạo/sửa lịch, hidden `service_id/package_id`, option text, message lỗi load dữ liệu hoặc event `serviceSelected`. Syntax check toàn bộ JS đã qua; Node VM behavior check đạt cho format giá, populate service select và populate package select. Localhost `/appointment-management.html` vẫn trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-12: tách controls dropdown bác sĩ từ `appointment-management.js` sang `app/static/js/appointment-management/doctor-controls-utils.js`. Helper gom populate dropdown filter/modal/add/edit bác sĩ và lock filter theo role bác sĩ/TLG; orchestrator giữ API `/users/doctors`, `/users/me`, retry auth, localStorage user, state và legend. Không đổi endpoint, option text, role lock behavior, trigger `change` hoặc message lỗi load/auth. Syntax check toàn bộ JS đã qua; Node VM behavior check đạt cho populate select và lock/unlock filter theo role. Localhost `/appointment-management.html` vẫn trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-12: tách UI modal sửa lịch từ `appointment-management.js` sang `app/static/js/appointment-management/edit-modal-ui-utils.js`. Helper gom field error UI, status flag, summary và binding validation trong edit modal; orchestrator giữ submit payload/API, ICD, status update, conflict check và handler legacy còn lại. Không đổi endpoint, payload sửa lịch, toast validation, required field rule hoặc event submit hiện tại. Syntax check toàn bộ JS đã qua; Node VM behavior check đạt cho field error, status flag và validation required/submit callback. Localhost `/appointment-management.html` vẫn trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-12: tách action phụ export/breadcrumb/reminder từ `appointment-management.js` sang `app/static/js/appointment-management/page-actions-utils.js`. Helper gom load XLSX CDN legacy, export Excel `/api/export`, breadcrumb và reminder `/notifications/create-reminder/<appointment_id>`; orchestrator giữ wrapper/global tên cũ cho template. Không đổi endpoint, header token export, payload export/reminder, toast/confirm text hoặc behavior email background legacy. Syntax check toàn bộ JS đã qua; Node VM behavior check đạt cho payload export, breadcrumb, SMS/email và schedule reminder. Localhost `/appointment-management.html` vẫn trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-12: tách UI/helper của modal thêm lịch hẹn sang `app/static/js/appointment-management/add-modal-ui-utils.js`. Helper gom validate field add modal, validator email/phone, set ngày/giờ mặc định khi mở modal, reset add form, toggle dịch vụ/gói, autofill duration và build payload form trước submit; `appointment-management.js` vẫn giữ `submitAppointmentForm()`, endpoint `POST /api/`, kiểm tra lịch bận, cảnh báo bệnh nhân trùng và wrapper/global mở modal cũ. Không đổi endpoint, payload tạo lịch, hidden service/package id, ICD add form hoặc toast/error flow. Syntax check toàn bộ JS đã qua; Node VM behavior check đạt cho validator, required field invalid class, toggle service/package, autofill duration, payload bệnh nhân mới và payload bệnh nhân đã chọn. Localhost `/appointment-management.html` vẫn trả `Empty reply/000`, nên chưa browser check.

Validation thực tế 2026-06-12: tách ICD multiselect add/edit sang `app/static/js/appointment-management/icd-multiselect-utils.js`. Helper sở hữu state `add/edit`, load `/api/icd/`, render dropdown, render tag đã chọn, toggle/remove, set từ chuỗi `Mã - Tên bệnh`, clear và format chuỗi submit; `appointment-management.js` giữ wrapper tên cũ `loadICDData`, `setupICDMultiSelect`, `getSelectedICDsString`, `setSelectedICDsFromString`, `clearSelectedICDs` cho caller add/edit hiện tại. Không đổi endpoint, header token, format `physical_history`, add/edit payload hoặc selector DOM ICD. Syntax check toàn bộ JS đã qua; Node VM behavior check đạt cho URL/header `/api/icd/`, set từ chuỗi, clear selection và render option cơ bản. Localhost `/appointment-management.html` vẫn trả `Empty reply/000`, nên chưa browser check.

## Next Refactor Steps

1. Appointment backend service island hiện đã phủ các endpoint lớn: list/stats/read/edit, create, update, import, export, confirm, transition, re-examination, transfer và delete/cancel.
2. Bước tiếp theo nên là frontend receptionist theo component nhỏ có caller rõ, hoặc chuyển sang module domain kế tiếp; không move cả `receptionist-new.js` nếu chưa có contract/smoke checklist cụ thể.
3. Khi đổi response shape, cập nhật `references/data-contracts.md` và smoke checklist cùng lúc.
