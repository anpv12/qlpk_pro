# Doctor Examination Business Map

Tài liệu này là nguồn sự thật nghiệp vụ cho màn Bác sĩ. Đọc trước khi thiết kế, sửa layout, refactor component, thay đổi load/save, hoặc tạo mockup cho `doctor-examination.html`, `doctor-examination.js`, `doctor-clinical-workspace.html`, `patient-intake-form`, `patient-info-form`, `patient-visit-info-form`, đơn thuốc, dịch vụ, tài liệu và các modal lịch sử. Module chỉ định/orders có context riêng và không còn là dependency của Doctor.

## Mục Tiêu Màn Bác Sĩ

Màn Bác sĩ không phải nơi nhập lại toàn bộ dữ liệu lễ tân. Đây là nơi bác sĩ:

1. Chọn đúng ca khám từ danh sách chờ.
2. Nhận biết nhanh bệnh nhân đang khám và lịch hẹn hiện tại.
3. Đọc dữ liệu lễ tân đã nhập: hành chính, sinh hiệu, hỏi bệnh ban đầu, tài liệu/người đi cùng nếu cần.
4. Ghi dữ liệu khám hiện tại: lý do/triệu chứng đã xác nhận, chẩn đoán ICD, bệnh kèm, kế hoạch điều trị, lời dặn, thuốc đang dùng, nguy cơ.
5. Thao tác nghiệp vụ phụ trợ: lịch sử, dịch vụ, tài liệu, in đơn, hoàn thành khám.
6. Chuyển trạng thái khám sau khi dữ liệu đủ.

## Actor, Task Và Nguồn Dữ Liệu

| Actor | Task trên màn | Dữ liệu đọc | Dữ liệu ghi |
| --- | --- | --- | --- |
| Bác sĩ | Chọn lịch hẹn đang chờ/đang khám | `GET /api/appointments/`, appointment response | selection state ở frontend |
| Bác sĩ | Xác nhận đúng bệnh nhân và đọc nhanh lần khám trước | Tên/mã từ payload ca hiện tại; ngày, chẩn đoán, đơn thuốc từ lịch sử ca trước | không ghi |
| Bác sĩ | Xem chi tiết hành chính/sinh hiệu | `patients`, `examinations` vitals | `patients` và vitals nếu form cho phép sửa |
| Bác sĩ | Xem/sửa hỏi bệnh hiện tại | `examinations.main_reason`, `main_symptoms`, detail section liên quan | `examinations`, `examination_details` |
| Bác sĩ | Chẩn đoán/kế hoạch/lời dặn | `examinations.diagnosis_ids`, `benh_kem_theo_ids`, display text | `examinations` |
| Bác sĩ | Thuốc đang dùng hiện tại | `examinations.current_medications` và/hoặc patient nền nếu load | `examinations.current_medications` |
| Bác sĩ | Đơn thuốc | prescription API theo appointment | `prescriptions`, `prescription_items` |
| Bác sĩ | Dịch vụ đi kèm | `GET|PUT /services/appointment/<id>` | `appointment_services` |
| Bác sĩ | Tài liệu/lịch sử | documents/history APIs | documents, records nếu user thêm |
| Bác sĩ | Hoàn thành khám | examination status transition | `examinations.status` |

## Cấu Trúc Runtime Hiện Tại

Từ 2026-08-09, `partials/doctor-clinical-workspace.html` là workspace khám đang sống. Nó có patient context header, section navigation, hành chính/hỏi bệnh, vùng chính Khám & xử trí với chín field theo thứ tự nghiệp vụ, vùng Khám chi tiết inline với 15 field cơ quan/tâm thần, đơn thuốc, tiền sử, tab Dịch vụ độc lập và tab Chỉ định data-backed. Hai card Khám & xử trí/Khám chi tiết là một grid cùng hàng; từ `64rem` chúng bằng chiều cao theo nội dung card chi tiết, còn Lý do khám/Bệnh sử đổi sang label trên textarea để phần dư thành vùng ghi nhận thực thay vì khoảng trống. Đơn thuốc là block full-width ngay bên dưới, tương ứng cấu trúc Hành chính có hai card đầu rồi Người thân liên kết. `components/clinical-examination-form.js` owns field render/clear/collect, ICD/current-medication normalization and detail lifecycle delegation; `doctor-examination/clinical-workspace-ui.js` owns the shell, patient-form composition, top-level navigation, dirty aggregation and save transaction. `clinical-detail-persistence.js` remains the canonical `examination_details` map/API implementation used by the Khám component. `prescription-ui.js` owns the only prescription state/render lifecycle and delegates pure normalization to `prescription-model.js` plus row/history presentation to stateless helpers. `components/doctor-services-form.js` owns Dịch vụ state/render/load/clear/save; `components/doctor-indications-form.js` owns Chỉ định catalog, appointment rows, history, dirty/save and draft-row restoration; `support-modules-ui.js` composes prescription + services + indications and exposes the support save facade. Tài liệu đính kèm do `document-attachments-bridge.js` và shared attachment components quản lý; `workspace-leave-guard.js` owns native reload/leave interception; `doctor-examination.js` vẫn là page orchestrator cho chọn ca, loading, clear, render và gọi các module phụ trợ.

| Vùng | Owner runtime hiện tại | Vai trò nghiệp vụ |
| --- | --- | --- |
| Danh sách chờ khám | `partials/waiting-queue-header.html`, `waiting-queue-card-ui.js`, `examination-waiting-list-ui.js` | Chọn đúng appointment/patient context |
| Workspace khám | `partials/doctor-clinical-workspace.html`, `doctor-examination/clinical-workspace-ui.js` | Render context, form khám chính, section navigation và save payload chính |
| Đơn thuốc | `doctor-examination/prescription-ui.js` | Load/save/render đơn thuốc, tìm thuốc, lịch sử đơn, in và reuse; giữ prescription state |
| Module phụ trợ | `components/doctor-services-form.js`, `doctor-examination/support-modules-ui.js` | Component sở hữu state/load/save Dịch vụ; facade chỉ điều phối Dịch vụ + Đơn thuốc |
| Orchestrator | `doctor-examination.js` | Load/clear/state/patient switching and page-level lifecycle integration |

## Phân Tầng Thông Tin

### Tầng 0 - Navigation/Selection

Nguồn chọn ca: danh sách chờ bên trái. Sau khi đã chọn ca, section navigation trong `#doctorClinicalWorkspace` chỉ chuyển vùng làm việc của cùng appointment; nó không thay thế queue hoặc app workspace tabs.

Được hiển thị:
- Tên bệnh nhân.
- Appointment id hoặc số thứ tự nếu cần phân biệt.
- Ngày/giờ hẹn.
- Trạng thái/ưu tiên nếu backend trả rõ.

Không nên hiển thị:
- Toàn bộ lý do khám.
- Chẩn đoán hoặc quyết định lâm sàng.
- Thông tin đã thuộc workspace chính.

### Navigation Trong Workspace

| Entry | Đích | Lý do nghiệp vụ |
| --- | --- | --- |
| Hành chính | `doctorReceptionistIntakePanel` | Kiểm tra/sửa patient và intake context khi cần; không duplicate Lý do khám/Biểu hiện chung. |
| Khám | `doctorClinicalDecisionPanel` | Vùng mặc định có grid Khám & xử trí + Khám chi tiết, tiếp theo là block đơn thuốc inline; lịch sử đơn thuốc mở từ nút tại block này. |
| Tiền sử | `doctorHistoryPanel` | Xem tiền sử, dị ứng, nguy cơ và kế hoạch an toàn. |
| Dịch vụ | `doctorServicePanel` | Thêm/sửa/lưu dịch vụ đi kèm theo appointment; không thuộc Đơn thuốc. |
| Chỉ định | `doctorIndicationsPanel` | Tạo/sửa/xóa chỉ định theo appointment, chọn catalog/người thực hiện, xem lịch sử bệnh nhân và lưu qua Doctor global save. |
Dịch vụ là root section độc lập, dùng service-state owner nhưng không có summary/nút mở trong Đơn thuốc. Tài liệu đính kèm thuộc vùng Hành chính và dùng shared attachment components; lịch sử đơn thuốc thuộc `prescription-ui.js`. Khám chi tiết không là entry, pane hay modal; nó là card cùng grid với Khám & xử trí, dùng `examination_details` đúng section và không thay thế chín field quyết định lâm sàng. Đơn thuốc nằm full-width sau grid này, không thuộc riêng một trong hai card; lịch sử đơn thuốc mở dạng panel nội bộ.

### Tầng 1 - Patient Context Header

Mục tiêu: bác sĩ nhìn header là xác nhận đúng bệnh nhân và nắm được thông tin
liên tục lâm sàng quan trọng nhất trước khi nhập ca hiện tại.

Hiển thị thành hai dòng:

- Dòng 1: tên bệnh nhân, mã hồ sơ và ngày lần khám gần nhất.
- Dòng 2: chẩn đoán và đơn thuốc của lần khám gần nhất.

Tên/mã lấy từ payload ca đang chọn. Ngày, chẩn đoán và đơn thuốc lấy từ lịch
sử lượt khám thật của bệnh nhân; lượt khám hiện tại và các lượt tương lai bị
loại khỏi lựa chọn. Nếu không có lượt trước, hiển thị `Chưa có lần khám trước`.

Không đưa vào header: avatar, giới, tuổi, dịch vụ, trạng thái, danh sách triệu
chứng dài, hoặc một bản sao khác của đơn thuốc hiện tại. Các thông tin đó hoặc
đã có ở queue/form chi tiết hoặc không phục vụ quyết định nhanh ở context header.

### Tầng 2 - Chi Tiết Hành Chính

Mục tiêu: mở ra khi cần kiểm tra/sửa hồ sơ, không chiếm màn chính mặc định.

Nguồn/owner:
- `patients`: họ tên, ngày sinh, giới tính, phone, địa chỉ, nghề nghiệp, nguồn giới thiệu, dị ứng nền, tiền sử nền.
- `examinations`: sinh hiệu hiện tại nếu form dùng chung hiển thị.

Runtime owner:
- `app/static/js/components/patient-intake-form.js` là composition/lifecycle owner.
- `partials/patient-info-form.html` và `partials/patient-visit-info-form.html` là các partial con dùng chung.
- Không copy HTML lễ tân sang bác sĩ; khác biệt màn hình đi qua config partial.
- `layout_mode='receptionist'` hiện là presentation variant dùng chung cho Doctor/Lễ tân; không được suy ra đây là hai component hay hai lifecycle khác nhau.

### Tầng 3 - Hỏi Bệnh Và Khám Hiện Tại

Mục tiêu: vùng làm việc chính cho ca hiện tại.

Nguồn/owner:
- `examinations.main_reason`: lý do khám.
- `examinations.main_symptoms`: triệu chứng chính.
- `examination_details.bac_si_kham_tien_su.medical_history` và `bac_si_kham_kham_tong_quat.general_examination` cho Bệnh sử/KQ khám toàn thân ở vùng một.
- `examination_details.bac_si_kham_kham_tong_quat` cho `Biểu hiện chung` và bảy nhận xét cơ quan; `bac_si_kham_kham_tam_than` cho tám nhận xét tâm thần ở vùng hai. Các alias Doctor cũ `general_manifestations` và `notes` đã được archive rồi xoá, không còn là một phần của contract.
- `examinations.risk_assessment`: nguy cơ theo lượt khám, JSONB canonical gồm
  `suicide_history` và `assessment`; load/save đi qua `medical_history`,
  `QLPKMedicalHistoryForm` và adapter `QLPKDoctorMedicalHistoryBridge`.

Thông tin cần ưu tiên:
- Lý do chính đến khám.
- Triệu chứng/diễn tiến/hành vi hiện tại.
- Mức độ hoặc thời điểm bắt đầu nếu có trong form.
- Vấn đề bác sĩ cần xác nhận trước khi chẩn đoán.

Không nên:
- Dấu dữ liệu hỏi bệnh trong modal nếu đây là dữ liệu chính của ca.
- Biến toàn bộ thành chip/badge làm mất khả năng đọc.

### Tầng 4 - Quyết Định Lâm Sàng

Mục tiêu: bác sĩ nhập kết luận và hướng xử trí.

Owner:
- `examinations.diagnosis` và `diagnosis_ids`.
- `examinations.benh_kem_theo` và `benh_kem_theo_ids`.
- `examinations.treatment_plan`.
- `examinations.loi_dan`.
- `examinations.current_medications`.

Quy tắc:
- Edit control ưu tiên raw IDs, không parse display text nếu có `*_ids`.
- `loi_dan` không được lưu vào `appointment.notes`.
- `appointment.notes` là ghi chú hành chính.

### Tầng 5 - Module Phụ Trợ Có Side Effect

Bao gồm:
- Lịch sử.
- Dịch vụ.
- Tài liệu.
- Đơn thuốc/in đơn.
- Hoàn thành khám.

Quy tắc:
- Các module này là action thật, không phải decoration.
- Action phải rõ trạng thái, không chìm màu.
- Không render hai owner cho cùng module.
- Sau lưu/load phải clear khi đổi bệnh nhân.

## Dữ Liệu Từ Lễ Tân Sang Bác Sĩ

| Dữ liệu lễ tân nhập | Owner | Bác sĩ dùng để | UI nên đặt ở |
| --- | --- | --- | --- |
| Họ tên, giới, ngày sinh, phone, địa chỉ | `patients` | Định danh và kiểm tra hồ sơ | Summary ngắn + chi tiết collapse |
| Ngày/giờ hẹn, bác sĩ, dịch vụ/gói, trạng thái | `appointments` | Biết đúng ca đang khám | Queue/header/summary ngắn |
| Lý do khám | `examinations.main_reason` | Bắt đầu hỏi bệnh | Vùng khám hiện tại |
| Triệu chứng chính | `examinations.main_symptoms` | Xác nhận triệu chứng | Vùng khám hiện tại |
| Diễn tiến/hành vi hiện tại nếu có | `examination_details` hoặc mapped fields | Đánh giá ca hiện tại | Vùng khám hiện tại, không giấu sâu |
| Sinh hiệu | `examinations` | Tham khảo lâm sàng | Chi tiết hành chính hoặc tổng quan phụ |
| Tài liệu đính kèm | documents | Xem bằng chứng/hồ sơ | Action tài liệu hoặc vùng phụ |
| Người đi khám cùng | `appointment_relatives` | Liên hệ/ngữ cảnh khám | Chi tiết, không chen vào summary chính |

## Dữ Liệu Bác Sĩ Tạo

| Dữ liệu | Owner | UI owner nên là |
| --- | --- | --- |
| Chẩn đoán ICD | `examinations.diagnosis`, `diagnosis_ids` | ICD token field trong workspace khám |
| Bệnh kèm theo | `examinations.benh_kem_theo`, `benh_kem_theo_ids` | ICD token field trong workspace khám |
| Kết luận/hướng điều trị | `examinations.treatment_plan` | Textarea chính |
| Lời dặn | `examinations.loi_dan` | Textarea chính |
| Thuốc đang dùng trong lượt khám | `examinations.current_medications` | Token/tag input hiện tại |
| Khám chi tiết cơ quan/tâm thần | `examination_details` section bác sĩ | Vùng Khám chi tiết inline; field mapping cụ thể nằm trong data inventory |
| Đơn thuốc | `prescriptions`, `prescription_items` | Module đơn thuốc |
| Dịch vụ đi kèm | appointment services | Module dịch vụ |
| Hoàn thành khám | `examinations.status` | Action trạng thái backend-owned |

## Quy Tắc Không Lặp Thông Tin

- Queue đã dùng để chọn bệnh nhân: không cần lặp appointment id lớn trong workspace nếu không phục vụ task.
- Summary đã có ngày/giờ: vùng nội dung không cần một khối lịch lớn nữa.
- Patient header chỉ là context liên tục gồm tên/mã, lần khám gần nhất, chẩn đoán
  và đơn thuốc cũ, cùng hai action thật `Lưu`/`Hoàn thành khám`; section
  navigation là owner mở vùng khám. Dịch vụ chỉ mở từ tab root cùng tên, còn
  action đơn thuốc/tài liệu chỉ tồn tại trong module hoặc navigation owner tương
  ứng, không tạo một nhóm nút song song ở header/side panel.
- Chi tiết hành chính đã có form collapse: summary không biến thành danh sách hành chính dài.
- Hỏi bệnh là nội dung khám, không nên bị đẩy thành cảnh báo phụ.

## Quy Tắc Clear/Load Khi Đổi Bệnh Nhân

Bất kỳ thiết kế mới nào thêm patient-specific UI phải có owner clear:

- DOM value, text, chip list, table rows.
- JS arrays/caches/counters.
- Timers, queued local-recovery capture, and any future delayed writer.
- Modal state/history selected row.
- Prescription/service/document cache.

Doctor hiện lưu thủ công; không được khôi phục autosave Tiền sử hoặc thêm writer nền song song. Nếu một delayed writer được đề xuất ở scope khác, nó phải bỏ qua khi `isLoadingExaminationData === true` và kiểm appointment id hiện tại trước khi ghi.

## Câu Hỏi Bắt Buộc Trước Khi Thiết Kế Màn Bác Sĩ

1. Bác sĩ đang cần đọc gì trước khi nhập?
2. Dữ liệu đó do lễ tân nhập hay backend sinh?
3. Dữ liệu đó có đang ở queue/header không?
4. Bác sĩ cần sửa dữ liệu này hay chỉ xem?
5. Nếu sửa, endpoint và owner save là gì?
6. Nếu đổi bệnh nhân, owner clear nằm ở đâu?
7. Component này dùng chung với lễ tân/TLG được không?
8. Có đang tạo UI song song với component cũ không?

Nếu chưa trả lời được, không được code hoặc tạo mockup final.

## Tài Liệu Và Code Cần Đối Chiếu

- `references/business-map.md`
- `references/workflows/doctor-examination-data-inventory.md`
- `references/data-contracts.md`
- `references/modules/receptionist.md`
- `references/modules/examinations.md`
- `references/modules/appointments.md`
- `references/doctor-examination-context.md`
- `app/templates/doctor-examination.html`
- `app/templates/partials/doctor-clinical-workspace.html`
- `app/templates/partials/patient-info-form.html`
- `app/templates/partials/patient-visit-info-form.html`
- `app/static/js/doctor-examination.js`
- `app/static/js/doctor-examination/clinical-workspace-ui.js`
