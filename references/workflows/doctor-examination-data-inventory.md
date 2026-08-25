# Doctor Examination Data Inventory

## Component Configuration Boundary (2026-08-09)

Doctor runtime dùng registry key `doctorComponentConfig` làm config composition duy
nhất cho root, field map, section map và endpoint map. Shared component chỉ
own lifecycle/render/collect; role/screen khác được tạo bằng `create({ config })`
và không copy Doctor orchestrator. Config không thay đổi data owner: các field
vẫn ghi đúng `patients`, `appointments`, `examinations` hoặc
`examination_details` theo inventory hiện tại.

Tài liệu này hoàn tất lớp kiến thức dữ liệu/component cho màn Bác sĩ. Dùng sau `references/workflows/doctor-examination-business-map.md` và trước mọi mockup/code UI cho màn bác sĩ.

Mục tiêu: mọi khối UI phải trace được tới dữ liệu thật, endpoint thật, component owner thật và lifecycle clear/save thật. Mỗi component base nhận config tùy chọn cho root/presentation, giữ một lifecycle owner và không để page gọi field-level implementation.

## Runtime Load Flow

Từ 2026-08-09, clinical workspace Doctor là runtime đang sống. Registry key
`clinicalWorkspace` render context, compose shared patient forms, điều hướng và
điều phối save; `clinicalExaminationForm` sở hữu field Khám và detail lifecycle;
`supportModulesUi` chỉ compose các support owner. `servicesForm` sở hữu
state/load/clear/save Dịch vụ; `indicationsForm` sở hữu catalog, appointment
rows, history, dirty/save và draft-row lifecycle của Chỉ định. Xem navigation contract đầy đủ tại
`doctor-examination-navigation.md`.

| Bước | Runtime owner | Endpoint/source | Ghi chú safety |
| --- | --- | --- | --- |
| Load danh sách chờ | `doctor-examination.js` + `ClinicalExaminationWaitingListUi` | `GET /api/appointments/` với `doctor=true`, status `doctor_exam/conclusion` | Danh sách chỉ để chọn appointment context |
| Chọn bệnh nhân/lịch hẹn | `selectPatientCard(appointmentId)` trong `doctor-examination.js` | appointment id từ waiting card | Tăng `state.loadToken`, set `isLoadingExaminationData=true`, clear surface trước khi fetch |
| Load chi tiết ca | `loadAppointmentDetail()` | `GET /api/appointments/<id>/edit` | Có `@require_auth`; payload là combined appointment/patient/examination + `patient_info`, `doctor_info`, `service_info`, `package_info`, `examination_info` |
| Render workspace khám | `registry.get('clinicalWorkspace').render()` | Payload chi tiết ca | Hiện patient header, patient/visit forms, clinical decision fields và section mặc định `doctorClinicalDecisionPanel` |
| Load module phụ trợ | `registry.get('supportModulesUi').load()` -> `registry.get('servicesForm').load()` và prescription owner | prescription/services/documents/history endpoints | Chạy sau render theo appointment/patient hiện tại; từng component/module giữ dirty state và save owner riêng |
| Check bản nháp phục hồi | `registry.get('draftRecovery').setContext()` | IndexedDB browser-local sau khi mọi load trên settle | Lấy snapshot DB đang render làm baseline; chỉ hiện lựa chọn khôi phục nếu record cùng user/appointment/patient, còn hạn 24 giờ và khác baseline |

## Component Ownership

| Component/vùng | File owner | Nhiệm vụ | Không được làm |
| --- | --- | --- | --- |
| Queue danh sách chờ | `partials/waiting-queue-header.html`, `waiting-queue-card-ui.js`, `examination-waiting-list-ui.js` | Chọn đúng appointment/patient | Không nhồi hồ sơ, ICD, đơn thuốc hoặc hỏi bệnh dài |
| Page orchestration | `doctor-examination.js` | load list, chọn ca, clear/render surface, bridge api/toast | Không chứa layout/detail UI phình lại thành god UI |
| Clinical workspace shell | `partials/doctor-clinical-workspace.html`, `doctor-examination/clinical-workspace-ui.js` | Renders context, composes shared forms, owns top-level section state, dirty aggregation and global save | Không own field-level Khám state/detail mapping hoặc support-module rows |
| Khám form component | `components/clinical-examination-form.js` | Owns Khám fields, clinical normalization, clear/collect, detail load/save delegation, dirty sections and draft snapshot | Không own patient forms, top-level navigation, prescription, services or indications |
| Top-level section navigation | `doctor-section-edge-nav` in partial + `activateWorkspaceSection()` | Switch Hành chính/Tiền sử/Khám/Dịch vụ/Chỉ định for the selected appointment | Navigation only changes presentation; module load/save remains owned by components; đơn thuốc nằm trong `Khám` |
| Generic examination-history modal + print actions | Markup: `partials/patient-search-modal.html`; public singleton/lifecycle: `components/patient-history-modal.js`; low-level flow: `components/modal-patient-search-ui.js`; default readers/print: `components/modal-history-data-runtime.js`, `components/modal-history-print-controller.js`; Doctor composition: `doctor-examination/patient-history-bridge.js` (registry `patientHistoryBridge`) receives callbacks from `doctor-examination.js`; prescription print shell owned by `prescriptions/components/prescription-print-document.js` + matching CSS | Read patient examinations and render/print Toa thuốc, Dịch vụ, Bệnh án BS, Bệnh án TLG from the selected patient/visit; Doctor hides the patient-result action column; clicking a history row only selects the visit and refreshes the modal tabs, while the history eye loads that row's `appointment_id` into the Doctor workspace through `selectHistoryResult()` and closes the modal only after a successful load; patient-result rows use the shared `2-4-2-2-2` column contract when that action is enabled and only the full-name cell may wrap; Bệnh án BS keeps KQ khám toàn thân full-width and renders Các cơ quan/Khám tâm thần in equal columns above the narrow breakpoint, while Bệnh án TLG remains one column. Base owns one context/control/trigger/print lifecycle per document; controller reuses its `stateStore`/`historyTabRenderers` and opens the loading window synchronously; Toa thuốc passes `paginationOptions` into the shared prescription print component, while non-prescription targets keep the generic document shell | Read-only history tabs and print remain read-only; the history eye is a Doctor workspace navigation action, not a copy/save action; pages must not clone markup or call `createWorkflowModalSearchContext()` directly; Doctor page must not call `getOrCreate()` directly; no delete action in Doctor, no duplicate legacy `patient-search-modal-dry.js` branch, stale patient/visit revision aborts the print, and Sinh hiệu has no print action. A history appointment without `examination_info` or a failed edit load must not clear the current Doctor form. Prescription A4/header/barcode has one owner in `PrescriptionPrintDocument`, never a controller-local override |
| Prescription history modal | `#doctorPrescriptionHistoryPanel` + `prescription-ui.js` `loadPrescriptionHistory()` + `prescription-history-ui.js` | Read `GET /api/prescription/patient/<patient_id>/history` after `Lịch sử thuốc` in the `doctor-clinical-form-card__header`; the action is hidden when no visit has medicines; only visits with medicines appear; `Áp dụng tất cả` copies all medicines from the selected visit into the current client draft until global save | Fixed large modal, left visit list/right prescription detail table; selected index and modal state clear with prescription context; token check blocks stale patient history; does not open or share the generic examination-history modal |
| Hành chính/sinh hiệu + hỏi bệnh | `patient-intake-form` mounted in doctor workspace | Shared patient admin, per-visit vitals, pregnancy controls, and intake fields | Page chỉ gọi `QLPKPatientIntakeForm`; hai field-level components không được làm lifecycle owner riêng |
| ICD/đơn thuốc/dịch vụ/chỉ định/tài liệu/lịch sử | ICD skeleton `templates/components/_icd_autocomplete.html` + shared `components/icd-autocomplete.js`; Khám component, `doctor-examination/prescription-ui.js`, `components/doctor-services-form.js`, `components/doctor-indications-form.js`, page attachment bridge, and medical-history bridge | Clinical decision and support modules for current appointment/patient | ICD label luôn đứng ngoài root và dùng `for`; adapter Khám/Tiền sử chỉ map state/payload. Chỉ định dùng order autocomplete chung cho hai nguồn catalog/survey; nguồn nhập text tắt autocomplete. `doctor-indications-form.js` sở hữu source, selected catalog/survey ID và row state; không gom row state vào `clinical-workspace-ui.js`; `supportModulesUi` chỉ compose lifecycle/save và không render/mutate rows trực tiếp |

## Navigation Inventory

| Navigation surface | Trigger/target | State owner | Data effect | Clear/render behavior |
| --- | --- | --- | --- | --- |
| Top section nav | `.doctor-section-edge-nav__item` + `data-doctor-section-target` | `activateWorkspaceSection()` | Không đọc/ghi API khi click | `clear()` và `render()` đều trả về `doctorClinicalDecisionPanel` |
| Generic history modal/print | Trigger -> `#patientSearchModal` | Doctor trigger/configuration: `patientHistoryBridge`; canonical lifecycle: `QLPKPatientHistoryModal` singleton; optional `ModalHistoryPrintController` uses the instance `stateStore`/`historyTabRenderers` | Search/open/switch tab only reads GET-backed history; print refreshes the selected history and opens one document; never saves or mutates the active clinical form | Bridge creates one base instance per document; `getOrCreate`, controls, triggers and print binding are idempotent for the page-lifetime instance; reset invalidates stale patient/visit requests; every print validates patient ID, visit ID, selected index and context revision |
| Prescription history action | `[data-prescription-history-action="toggle"]` -> `doctorPrescriptionHistoryPanel` | `registry.get('prescriptionForm')` + `prescriptionHistory` presentation owner | Chỉ mở/đóng modal đã load; chọn lượt chỉ đổi detail; `Áp dụng tất cả` chỉ mutate current prescription draft, không auto-save | Patient clear đóng modal, resets selected visit and history dataset; backdrop, close button and Escape close it; history load/render giữ cùng prescription owner |
| Dịch vụ root entry | `.doctor-section-edge-nav__item` -> `doctorServicePanel` | `activateWorkspaceSection()` + `registry.get('servicesForm')` | Không fetch/save on click; component owns catalog/select; global Doctor Lưu owns save | `servicesForm.clear()` resets rows/catalog/request token before patient load; no prescription summary/action exists |
| Chỉ định root entry | `.doctor-section-edge-nav__item` -> `doctorIndicationsPanel` | `activateWorkspaceSection()` + `supportModulesUi` -> `indicationsForm` | Loads catalog/current appointment rows; global Doctor save owns the only write; history is an explicit patient-scoped read | `indicationsForm.clear()` invalidates context/history requests, resets rows/catalog/form, and prevents stale A data from rendering into B |

Navigation is presentation state, not a clinical-data owner. The authoritative appointment/patient selection remains the waiting queue and `doctor-examination.js` lifecycle.

## Field Inventory - Patient Header Context

| UI field/id | Hiển thị | Source runtime | Owner dữ liệu | Editable | Priority | Ghi chú thiết kế |
| --- | --- | --- | --- | --- | --- | --- |
| `doctorClinicalHeading` | Tên bệnh nhân | `patient_info.full_name`, fallback appointment | `patients` | Không trong header | Thấy ngay | Anchor chính của context. |
| `doctorPatientCode` | Mã hồ sơ | `patient_info.patient_code`, fallback appointment | `patients` | Không trong header | Thấy ngay | Không fallback về raw `patient.id`/`appointment.id`. |
| `doctorPatientLatestVisit` | Ngày lần khám gần nhất | `QLPKDoctorPrescriptionUi.getLatestPreviousVisitSnapshot()` từ lịch sử bệnh nhân | `appointments`/`examinations` | Không | Thấy ngay | Loại lượt khám hiện tại và lượt tương lai; empty hiển thị `Chưa có lần khám trước`. |
| `doctorPatientHistory` / `doctorPatientLastDiagnosis` | Chẩn đoán lần khám gần nhất | Cùng snapshot lịch sử; `record.diagnosis` | `examinations` | Không | Thấy ngay | Read-only, không suy luận từ text của ca hiện tại. |
| `doctorPatientLastPrescription` | Đơn thuốc lần khám gần nhất | Cùng snapshot lịch sử; `record.prescriptions[].medicines[].name` | `prescriptions`, `prescription_items` | Không | Thấy ngay | Tóm tắt tên thuốc thật; nhiều thuốc dùng dạng `Tên thuốc +N`. |

Header contract: các field trên được render thành hai dòng phẳng trong
`.doctor-patient-hero`. Avatar, giới, tuổi, dịch vụ, trạng thái và metadata
appointment không còn là field header. `prescription-ui.js` vẫn là owner duy
nhất của state/lịch sử đơn thuốc; `clinical-workspace-ui.js` chỉ đọc snapshot
và trình bày nó. Khi đổi bệnh nhân, cả DOM text lẫn snapshot history phải được
clear trước khi load ca mới.

Visibility contract: `doctorClinicalDecisionPanel` does not use a read-only summary for reason, symptoms, general examination, or medication. Doctor Hành chính renders the intake-owned `mainReason` and `mainSymptoms` fields; the Khám card renders the role-specific `doctorClinicalReason` and the separate `bieu_hien_chung` detail field. These controls must not share an ID or data owner. This presentation change does not alter the persisted data contract or the patient-switch clear/load flow.

Layout contract: the paired desktop grid is `#doctorDecisionTreatmentTask` plus `#doctorClinicalDetailPanel`, followed by the full-width `#doctorPrescriptionWorkspace` inside `#doctorClinicalDecisionPanel`; the prescription history panel is hidden until its local toggle is used. From `64rem`, the paired cards stretch to the taller content-driven card height without a JS-measured or fixed card height; all free-text fields start at `1.65rem` and remain vertically resizable textareas for multiline entry. The two detail-field groups use an equal two-column grid from `48rem` and a single column below that breakpoint; Thần kinh spans both columns. Each detail field renders its label above a full-width textarea within its half-column, rather than inheriting the horizontal label/input layout; the redundant chapter line is not rendered. ICD diagnosis controls remain the canonical autocomplete component. This moves no data owner, event binding, clear function, or save path.

## Field Inventory - Hành Chính Và Sinh Hiệu

Owner component: `QLPKPatientInfoForm`.

| UI field/id | Label | Source runtime | Owner hiện tại | Editable | Save path hiện tại | Ghi chú thiết kế |
| --- | --- | --- | --- | --- | --- | --- |
| `patientId` | hidden patient id | `patient_info.id` hoặc `patient_id` | `patients` | Không trực tiếp | N/A | Context id |
| `fullName` | Họ tên | `patient_info.full_name` | `patients.full_name` | Có nếu form cho phép | `PUT /api/appointments/<id>` patient update | Cần rõ đây là hồ sơ, không phải thông tin khám |
| `gender` | Giới tính | `patient_info.gender` | `patients.gender` | Có | `PUT /api/appointments/<id>` | Summary dùng read-only text |
| `dateOfBirth` / `age` | Ngày sinh/tuổi | `patient_info.date_of_birth`; tuổi tính FE | `patients.date_of_birth`; age display | Có ngày sinh, tuổi display | `PUT /api/appointments/<id>` cho ngày sinh | Không lưu age như input độc lập |
| `phoneNumber` | Điện thoại | `patient_info.phone` | `patients.phone` | Có | `PUT /api/appointments/<id>` | Dùng để liên hệ, không chiếm workspace chính |
| `idCard` | CMT/CCCD | `patient_info.id_number` | `patients.id_number` | Có | `PUT /api/appointments/<id>` | Metadata hành chính |
| `nickname` | Tên thường gọi | `patient_info.nickname` | `patients.nickname` | Có | `PUT /api/appointments/<id>` | Detail/collapse |
| `maritalStatus` | Hôn nhân | `patient_info.marital_status` | `patients.marital_status` | Có | `PUT /api/appointments/<id>` | Detail/collapse |
| `occupation` | Nghề nghiệp | `patient_info.occupation` | `patients.occupation` | Có | `PUT /api/appointments/<id>` | Detail/collapse |
| `sexualOrientation` | Xu hướng tính dục | `patient_info.sexual_orientation` | `patients.sexual_orientation` | Có | `PUT /api/appointments/<id>` | Chỉ show khi cần; không đưa summary |
| `nationality`, `religion`, `ethnicity`, `educationLevel` | hồ sơ cá nhân mở rộng | runtime form shared; payload support từ update service | `patients` | Có nếu visible | `PUT /api/appointments/<id>` | Detail-only |
| `addressDetail`, `province`, `ward`, `address` | Địa chỉ | `patient_info.address_detail/province/ward/address` | `patients` | Có | `PUT /api/appointments/<id>` | Detail/collapse |
| `breathing`, `pulse`, `bloodPressure`, `temperature`, `weight`, `height`, `bmi` | Sinh hiệu | `examination_info`/`examination` vitals | `examinations` | Có nếu form cho phép | `PUT /api/appointments/<id>` examination vitals | Per-visit, không phải patient profile |
| `prev*` hints | Sinh hiệu gần nhất | Helper/lịch sử nếu được load | `examinations` history | Không | N/A | Chỉ là hint, không submit chính |

## Field Inventory - Hỏi Bệnh Hiện Tại

Owner component: `QLPKPatientVisitInfoForm` hydrates/collects the intake visit fields; registry key `clinicalExaminationForm` owns the doctor-specific reason and clinical fields.

| UI field/id | Label | Source runtime | Owner hiện tại | Editable | Save path hiện tại | Data-contract note |
| --- | --- | --- | --- | --- | --- | --- |
| `mainReason` | Lý do chính đến khám | `examination.main_reason`, fallback `examination.ly_do_toi_kham` | `examinations.main_reason` | Có | `PUT /api/appointments/<id>` | Intake do bệnh nhân khai báo tại lễ tân; Doctor hiển thị lại trong Hành chính. Không dùng làm lý do bác sĩ khai thác. |
| `mainSymptoms` | Triệu chứng chính | `examination.main_symptoms` | `examinations.main_symptoms`; `symptoms` chỉ là cột legacy trùng nghĩa và không phải nguồn render UI | Có | `PUT /api/appointments/<id>` | Intake field; hiển thị trong khối Hỏi bệnh của Doctor và Lễ tân. Không đọc từ `patients.main_symptoms`, `bieu_hien_ban_dau`, `examination.symptoms`, hoặc dùng cho Biểu hiện chung của bác sĩ. |
| `problemStartTime` | Thời gian bắt đầu vấn đề | `patient_info.problem_start_time` | Runtime hiện tại: `patients.problem_start_time` | Có | `PUT /api/appointments/<id>` patient update field | Nghiệp vụ giống visit data; không tự đổi owner khi thiết kế |
| `severityLevel` | Mức độ nghiêm trọng | `patient_info.severity_level` | Runtime hiện tại: `patients.severity_level`; queue cũng dùng `severity_level` | Có | `PUT /api/appointments/<id>` patient update field | Nếu muốn chuyển per-visit cần phase contract riêng |
| `symptomProgression` | Diễn biến triệu chứng | `patient_info.symptom_progression` | Runtime hiện tại: `patients.symptom_progression` | Có | `PUT /api/appointments/<id>` patient update field | Không tự chuyển vào `examination_details` nếu chưa có migration/contract |
| `currentBehavior` | Hành vi hiện tại | `patient_info.current_behavior`, fallback `notable_behavior`, `examination.notable_behavior` | Runtime hiện tại: `patients.current_behavior` và detail fallback `notableBehavior` | Có | `PUT /api/appointments/<id>` patient update + detail fallback nếu payload có `notable_behavior` | Đây là field dễ gây nhầm giữa patient-level và visit-level |
| `notes` | Ghi chú hành chính | `appointment.notes`; current doctor workspace mounts the shared visit form with `patient_visit_show_admin=true` | `appointments.notes` | Có | `PUT /api/appointments/<id>` through main workspace collect | Không dùng làm lời dặn; `loi_dan` vẫn thuộc examination. |
| `referralSource` | Nguồn giới thiệu | `patient_info.referral_source`, fallback appointment; current doctor workspace renders the shared referral control | `patients.referral_source` | Có | `PUT /api/appointments/<id>` through main workspace collect | Patient-level field, không suy luận từ label/badge. |

## Field Inventory - Tab Khám

Owner component: `doctor-clinical-workspace.html` + `clinical-workspace-ui.js`.

| UI field/id | Label | Source runtime | Owner dữ liệu | Editable | Save path | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| `doctorClinicalReason` | Lý do khám | `GET /api/examination-details/modal-load/<appointment_id>` -> `bac_si_kham_form_kham.main_reason` | `examination_details` | Có | `POST /api/examination-details/<examination_id>/section/bac_si_kham_form_kham` trong `saveNow()` | Vị trí 1; lý do bác sĩ khai thác độc lập với intake `mainReason` và lý do của tâm lý gia. |
| `examDetailMedicalHistory` | Bệnh sử | `GET /api/examination-details/modal-load/<appointment_id>` -> `bac_si_kham_tien_su.medical_history` | `examination_details` | Có | `POST /api/examination-details/<examination_id>/section/bac_si_kham_tien_su` trong `saveNow()` | Vị trí 2; clear trước load, context token chặn response cũ. |
| `examGeneralPresentation` | Biểu hiện chung | `GET /api/examination-details/modal-load/<appointment_id>` -> `bac_si_kham_kham_tong_quat.bieu_hien_chung` | `examination_details` | Có | `POST /api/examination-details/<examination_id>/section/bac_si_kham_kham_tong_quat` trong `saveNow()` | Vị trí 3; field bác sĩ độc lập với `mainSymptoms` ở Hỏi bệnh. |
| `examDetailGeneralExamination` | KQ khám toàn thân | `GET /api/examination-details/modal-load/<appointment_id>` -> `bac_si_kham_kham_tong_quat.general_examination` | `examination_details` | Có | `POST /api/examination-details/<examination_id>/section/bac_si_kham_kham_tong_quat` trong `saveNow()` | Vị trí 4; clear trước load, context token chặn response cũ. |
| `diagnosisTags`, `diagnosisIds`, `diagnosisSearch`, `diagnosis` | Chẩn đoán ICD-10 | `examination.diagnosis_ids` + display `diagnosis` | `examinations.diagnosis` stores raw ICD IDs/newer flow; display contract resolves text | Có | `PUT /api/appointments/<id>`; search `/api/icd/` | Edit ưu tiên IDs; textarea chỉ fallback |
| `benhKemTheoTags`, `benhKemTheoIds`, `benhKemTheoSearch`, `benhKemTheo` | Bệnh kèm theo | `examination.benh_kem_theo_ids` + display | `examinations.benh_kem_theo` | Có | `PUT /api/appointments/<id>`; search `/api/icd/` | Không trộn với diagnosis chính |
| `treatmentPlan` | Kết luận & Hướng Đ.trị | `examination.treatment_plan`, fallback `ke_hoach_can_thiep` | `examinations.treatment_plan` | Có | `PUT /api/appointments/<id>` | Vị trí 7; main clinical decision. |
| `currentMedications` | Thuốc đang dùng | `examination.current_medications`, fallback `patient.current_medication` | `examinations.current_medications` | Có | `PUT /api/appointments/<id>` | Vị trí 8; plain-text input được chuẩn hóa thành JSON list, không phải đơn thuốc kê mới. |
| `examinationNotes` | Lời dặn | `examination.loi_dan` | `examinations.loi_dan` | Có | `PUT /api/appointments/<id>` | Vị trí 9; không dùng `appointment.notes`. |

## Field Inventory - Vùng Khám Chi Tiết

Owner component: `components/clinical-examination-form.js` trong vùng hai `#doctorClinicalDecisionPanel`; lifecycle được compose bởi registry key `clinicalWorkspace`.

| UI field/id | Label | Source runtime | Owner dữ liệu | Editable | Save path | Ghi chú |
| --- | --- | --- | --- | --- | --- | --- |
| `examGeneralCirculation` | Tuần hoàn | `modal-load` -> `bac_si_kham_kham_tong_quat.circulation` | `examination_details` | Có | section `bac_si_kham_kham_tong_quat` | Nhóm Các cơ quan. |
| `examGeneralDigestive` | Tiêu hoá | `modal-load` -> `bac_si_kham_kham_tong_quat.digestive` | `examination_details` | Có | section `bac_si_kham_kham_tong_quat` | Nhóm Các cơ quan. |
| `examGeneralRenalUroGenital` | Thận-tiết niệu-sinh dục | `modal-load` -> `bac_si_kham_kham_tong_quat.renal_urogenital` | `examination_details` | Có | section `bac_si_kham_kham_tong_quat` | Nhóm Các cơ quan. |
| `examGeneralMusculoskeletal` | Cơ-xương-khớp | `modal-load` -> `bac_si_kham_kham_tong_quat.musculoskeletal` | `examination_details` | Có | section `bac_si_kham_kham_tong_quat` | Nhóm Các cơ quan. |
| `examGeneralENT` | Tai-mũi-họng | `modal-load` -> `bac_si_kham_kham_tong_quat.ent` | `examination_details` | Có | section `bac_si_kham_kham_tong_quat` | Nhóm Các cơ quan. |
| `examGeneralEndocrineNutritionOthers` | Nội tiết-dinh dưỡng | `modal-load` -> `bac_si_kham_kham_tong_quat.endocrine_nutrition_others` | `examination_details` | Có | section `bac_si_kham_kham_tong_quat` | Nhóm Các cơ quan. |
| `examGeneralMental` | Thần kinh | `modal-load` -> `bac_si_kham_kham_tong_quat.neurological` | `examination_details` | Có | section `bac_si_kham_kham_tong_quat` | ID legacy giữ nguyên; full row từ `48rem`, không đổi sang field mới. |
| `examMentalOrientation` | Ý thức định hướng | `modal-load` -> `bac_si_kham_kham_tam_than.orientation` | `examination_details` | Có | section `bac_si_kham_kham_tam_than` | Nhóm Khám tâm thần. |
| `examMentalEmotions` | Tình cảm, cảm xúc | `modal-load` -> `bac_si_kham_kham_tam_than.emotions` | `examination_details` | Có | section `bac_si_kham_kham_tam_than` | Nhóm Khám tâm thần. |
| `examMentalPerception` | Tri giác | `modal-load` -> `bac_si_kham_kham_tam_than.perception` | `examination_details` | Có | section `bac_si_kham_kham_tam_than` | Nhóm Khám tâm thần. |
| `examMentalThought` | Tư duy | `modal-load` -> `bac_si_kham_kham_tam_than.thought` | `examination_details` | Có | section `bac_si_kham_kham_tam_than` | Nhóm Khám tâm thần. |
| `examMentalBehavior` | Hành vi tác phong | `modal-load` -> `bac_si_kham_kham_tam_than.behavior` | `examination_details` | Có | section `bac_si_kham_kham_tam_than` | Nhóm Khám tâm thần. |
| `examMentalAttention` | Tập trung - chú ý | `modal-load` -> `bac_si_kham_kham_tam_than.attention` | `examination_details` | Có | section `bac_si_kham_kham_tam_than` | Nhóm Khám tâm thần. |
| `examMentalIntelligence` | Trí năng | `modal-load` -> `bac_si_kham_kham_tam_than.intelligence` | `examination_details` | Có | section `bac_si_kham_kham_tam_than` | Nhóm Khám tâm thần. |
| `examMentalMemory` | Trí nhớ | `modal-load` -> `bac_si_kham_kham_tam_than.memory` | `examination_details` | Có | section `bac_si_kham_kham_tam_than` | Nhóm Khám tâm thần. |

Visibility exclusion: retired Doctor-only `bac_si_kham_kham_tam_than.general_manifestations` and `notes` values were archived and removed. They are not mounted, hydrated, cleared, submitted, or used as fallbacks.

## Field Inventory - Tiền Sử

Owner component: `components/_inline_medical_history.html` + `components/medical-history-form.js`, with Doctor feature modules
`doctor-examination/medical-history-icd-bridge.js`, `medical-history-core.js`,
`medical-history-workbench.js`, `medical-history-allergy.js`,
`medical-history-risk.js`, `medical-history-suggestions.js`,
`medical-history-bindings.js`, and `safety-plan.js`. The Doctor bridge
`doctor-examination/medical-history-bridge.js` is an adapter only; it does not
own a second history lifecycle.

| UI field/id | Label | Source runtime | Owner dữ liệu | Editable | Save path | Clear owner |
| --- | --- | --- | --- | --- | --- | --- |
| `physHistoryTags`, `physHistoryTextInput`, `patientPhysicalHistory` | Bản thân | `medical_history.patient.physical_history` | `patients.physical_history` | Có | `PUT /api/appointments/<id>` field `physical_history` | `registry.get('medicalHistoryBridge').clear()` |
| `famHistoryTags`, `famHistoryTextInput`, `patientFamilyHistory` | Gia đình | `medical_history.patient.family_history` | `patients.family_history` | Có | `PUT /api/appointments/<id>` field `family_history` | `registry.get('medicalHistoryBridge').clear()` |
| `drugAllergyBody`, `drugAllergyChips` | Dị ứng thuốc | `medical_history.patient.allergies` | `patients.allergies` | Có | `PUT /api/appointments/<id>` field `allergies` | `registry.get('medicalHistoryBridge').clear()` |
| `riskAssessWrap` | Đánh giá nguy cơ | `medical_history.examination.risk_assessment` | `examinations.risk_assessment` | Có | `PUT /api/appointments/<id>` field `risk_assessment` | `registry.get('medicalHistoryBridge').clear()` |
| `substanceTableWrap` | Tiền sử dụng chất | `medical_history.patient.substance_use_history` | `patients.substance_use_history` | Có | Global `Lưu` -> `PUT /api/appointments/<id>` field `substance_use_history` | `registry.get('medicalHistoryBridge').clear()` |
| `safetyPlanPanelWrap` | Kế hoạch an toàn | `medical_history.patient.safety_plan` | `patients.safety_plan` | Có | `PUT /api/appointments/<id>` field `safety_plan`; upload/file repair remains an explicit file action | `registry.get('medicalHistoryBridge').clear()` |

### Tiền sử dùng chất - boundary contract

- `substanceTableWrap` is patient-level and is serialized as one object with the
  ten canonical IDs `tobacco`, `alcohol`, `cannabis`, `cocaine`, `stimulants`,
  `inhalants`, `sedatives`, `hallucinogens`, `opioids`, and `other_substance`.
  Each ID emits `<id>_used`; a checked row may also emit `<id>_duration`.
- `medical-history-risk.js` collects the table through
  `ClinicalExaminationDetailModalUtils.collectSubstanceUseData()` and emits the
  `substance_use_history` snapshot. `medical-history-bridge.js` is the Doctor
  load/save/clear lifecycle owner. `medical-history-suggestions.js` does not
  read or synchronize the substance table.
- `physical_history` is a separate ICD/text array. F10-F19 entries are not a
  valid physical-history representation; backend normalization and the
  `20260805_sanitize_substance_history` migration enforce this boundary and
  preserve removed legacy values in `legacy_database_archive`.
- Patient switching must clear both surfaces before the next payload hydrates.
  No display-text parsing or old-field fallback may merge the two histories.

## Current Workspace Context And Risk Boundary

The former `renderQuickOverview()` and `doctorRisk*` / `doctorQuick*` DOM contract is not present in the current workspace. Do not restore it from this historical inventory or build keyword-based clinical warning badges from free text.

| UI surface | Source runtime | Owner dữ liệu | Design boundary |
| --- | --- | --- | --- |
| Patient header + visit summaries | `registry.get('clinicalWorkspace').render()` | `patients`, `appointments`, `examinations` as listed above | Context/read-only presentation only; it does not determine workflow state. |
| Risk assessment | Inline medical-history component + `registry.get('medicalHistoryBridge')` | `examinations.risk_assessment` | Use the structured persisted field and its existing component. Do not replace it with a frontend keyword heuristic or a display-string parser. |
| Allergy/history/safety-plan | Inline medical-history component + doctor bridge | Patient-level history/allergy/safety-plan owners and examination risk owner | The history section is the owner; top navigation only reveals it. |
| Prescription/service state | `prescription-ui.js` and `components/doctor-services-form.js` | Respective prescription/service owner | Rendered lists/tables are not source of truth and must clear on patient switch; services have no mirrored prescription summary. Prescription overview exposes only Cách tính liều, Số ngày điều trị and Hẹn tái khám; the three controls share one row when the component is wide and reflow by component width. General usage is no longer editable UI, while its legacy stored value remains losslessly preserved by the prescription owner. |

## Module Inventory

| Module | Load endpoint | Save/action endpoint | Owner dữ liệu | Clear owner |
| --- | --- | --- | --- | --- |
| Đơn thuốc | `GET /api/prescription/appointment/<appointment_id>` | `POST /api/prescription/save`; print `GET /api/prescription/appointment/<id>/print-view-model` | `prescriptions`, `prescription_items`; `prescription_items.unit` là snapshot đơn vị đã lưu, còn catalog `medicines.unit` cấp đơn vị chỉ đọc cho thuốc trong kho | `prescription-ui.js` `clear()` resets `STATE.prescriptionRows` and renders the empty list. Mọi dòng thuốc trong cơ sở hiển thị đúng một nhãn `Tồn kho: N đơn vị` dưới tên thuốc từ `current_stock_quantity`/catalog stock; thuốc ngoài không hiện. Đơn vị đặt ngay cạnh số lượng: thuốc trong kho chỉ đọc, thuốc ngoài editable và có nhãn ngoại lệ `Thuốc ngoài`; không hiện `Dạng thuốc`/`Trong kho`. Mỗi `batch_allocation` được render trực tiếp thành một block riêng với số lô và số đã cấp, không thu gọn và không thêm nhãn tồn thứ hai. |
| Tìm thuốc | `GET /api/medicines/` | selected medicine id in prescription payload | `medicines` for clinic stock | Focus vào ô tên thuốc trong kho mở danh sách mặc định; nhập tiếp sẽ lọc theo từ khóa; thuốc ngoài cơ sở không dùng catalog. `medicineSearchCache`, token/dropdown clear |
| Tương tác thuốc | N/A | `POST /api/drug-interactions/check` | drug interaction service | `clearInteractionResults()` |
| Dịch vụ đi kèm | `GET /services/appointment/<id>`, catalog Doctor `GET /services/?page=<n>&per_page=24` | `PUT /services/appointment/<id>/sync` | `appointment_services` | Registry key `servicesForm` owns `STATE.services`, `STATE.serviceCatalog`, catalog page/pagination, request token, render and clear; catalog price is read-only, quantity is the only inline editable selected-row field. Doctor payload only selects rows, quantity, and note: server resolves a new row from catalog and preserves an existing financial snapshot. `Tổng dự tính` is read-only UI derived from current service state by the canonical backend discount/tax formula and updates before save; the backend response remains canonical after sync. A paid or legacy-paid examination is immutable. Unparameterized `GET /services/` remains the legacy array contract for other callers. |
| Chỉ định theo appointment | `GET /api/chi-dinh/appointment/<id>`, catalog `GET /api/order-items?include_inactive=true`, survey `GET /api/survey-templates-for-orders`, performer `GET /users/doctors` | `POST /api/chi-dinh/appointment/<id>` qua `supportModulesUi.saveAll()`; history `GET /api/chi-dinh/patient/<patient_id>?exclude_appointment_id=<id>` | `chi_dinh`, `order_items` và `survey_templates` | `indicationsForm` owns nguồn `catalog`/`custom`/`survey`, selected IDs, rows, edit/delete, status display, dirty state, context token and draft snapshot; `custom` chỉ lưu `order_name`, còn `catalog` lưu `order_item_id` và `survey` lưu `survey_template_id`. Tên chỉ định bị giới hạn 255 ký tự. Backend upsert sync xóa các dòng bị loại khỏi payload. History endpoint kiểm tra patient scope trước khi đọc. |
| Tài liệu | `GET /attachments/patients/<patient_id>/attachments` | upload `/attachments/upload`, download `/attachments/<id>/download`, delete `DELETE /attachments/<id>` | attachments/documents | `STATE.documents=[]`, `renderDocuments()` |
| Lịch sử đơn thuốc | `GET /api/prescription/patient/<patient_id>/history` | `Áp dụng tất cả` copies selected medicines into current prescription draft; global Doctor `Lưu` remains the only writer | `prescriptions`, `prescription_items` read history + current prescription write | `prescription-ui.js` resets history dataset, selected visit and modal state; this is separate from examination-history UI |
| Hoàn thành khám | N/A | Saves main form, prescription, services, then `PUT /examinations/<examination_id>/transfer-to-payment` | `examinations.status` + payment queue | afterComplete callback reloads list/surface |

Visibility contract: there is no separate Doctor support workspace beyond the explicit Dịch vụ and Chỉ định root panes. Tab Khám mounts one inline vùng Khám chi tiết beside its primary form on desktop and below it on narrow screens; tab Dịch vụ mounts `#doctorServicePanel` as the service UI; tab Chỉ định mounts `#doctorIndicationsPanel` as a data-backed pane with current rows, three source choices, inline history and no second save path. Documents remain in Hành chính and prescription history remains inside the prescription workspace. The workspace loads all 19 visible `examination_details` controls (doctor reason, Bệnh sử, KQ khám toàn thân, Biểu hiện chung, 7 cơ quan, and 8 tâm thần) through `modal-load`, then saves only the listed fields through three section-specific endpoints. It does not restore a modal, prescription service summary, hidden support panel, or second services view; retired Doctor mental aliases are archived and not presented.

## Save Payload - Khám Chính

`registry.get('clinicalWorkspace').collect()` sends this payload to `PUT /api/appointments/<appointment_id>`:

```json
{
  "main_reason": "...",
  "main_symptoms": "...",
  "problem_start_time": "...",
  "symptom_progression": "...",
  "current_behavior": "...",
  "severity_level": "...",
  "diagnosis": ["icd-id"],
  "benh_kem_theo": ["icd-id"],
  "treatment_plan": "...",
  "loi_dan": "...",
  "current_medications": "[...]"
}
```

`main_reason` trong payload trên chỉ là lý do intake của `#mainReason` ở vùng
Hành chính. `doctorClinicalReason` không nằm trong payload chính; nó được gửi
riêng theo section `bac_si_kham_form_kham` để không ghi đè `examinations.main_reason`.

Backend route `app/api/appointment.py:update_appointment()` fans this into:

- appointment admin fields when present.
- patient fields through `apply_patient_updates_from_appointment_payload()`.
- examination fields through `apply_examination_clinical_updates_from_appointment_payload()`.
- selected details through `apply_examination_detail_updates_from_appointment_payload()`.

Design implication: this endpoint is high blast radius. Do not add UI fields to the save payload without assigning canonical owner and checking update service.

The same `saveNow()` then groups the detail controls by section and sends three field-scoped requests:

```json
POST /api/examination-details/<examination_id>/section/bac_si_kham_tien_su
{ "medical_history": "..." }

POST /api/examination-details/<examination_id>/section/bac_si_kham_kham_tong_quat
{
  "general_examination": "...",
  "bieu_hien_chung": "...",
  "circulation": "...",
  "digestive": "...",
  "renal_urogenital": "...",
  "musculoskeletal": "...",
  "ent": "...",
  "endocrine_nutrition_others": "...",
  "neurological": "..."
}

POST /api/examination-details/<examination_id>/section/bac_si_kham_kham_tam_than
{
  "orientation": "...",
  "emotions": "...",
  "perception": "...",
  "thought": "...",
  "behavior": "...",
  "memory": "...",
  "intelligence": "...",
  "attention": "..."
}
```

Before either save begins, `saveNow()` waits for any in-flight detail load. The section endpoint replaces only the named canonical fields.

## Manual Save And Leave Guard

`doctor-clinical-workspace.html` exposes one header `Lưu` action. Its owner is
`registry.get('clinicalWorkspace').saveWorkspace()`, not a parallel payload path:

1. A single transaction has visible phases `main -> details -> support`; header
   `Lưu` immediately changes to `Đang lưu...`, announces the active phase,
   and locks both header actions until all selected writers settle. Inputs remain
   editable, and success has no blocking modal or artificial wait.
2. `saveNow()` sends canonical `PUT /api/appointments/<appointment_id>` only
   when main clinical state or the immediate Tiền sử snapshot is dirty. It then
   posts only changed detail sections; a no-change global save sends no HTTP
   write and reports that there is nothing to save.
3. `registry.get('supportModulesUi').saveAll({ onlyDirty: true })` saves only dirty
   prescription and service state and returns outcome by module. Each
   module captures a revision before its request; if the user edits it while
   the request is in flight, the response must not overwrite the newer UI or
   clear its dirty flag.
4. A failed support module produces a partial result naming that module; an
   overall failure captures the existing IndexedDB recovery snapshot without
   claiming every owner was saved. Do not auto-retry a POST/PUT.
5. Do not run a second Tiền sử writer: the former autosave adapter, safety-plan
   flush, substance-use flush, and fixed debounce wait are removed from this flow.

Unsaved state is the union of the main form revision, the two support-module
dirty flags, and the Tiền sử manual revision. `selectPatientCard()` asks
before `clearPatientSurface()` can erase the current appointment. The shared
workspace shell asks before switching or closing a doctor tab. `Lưu và tiếp tục`
persists the same server owners; `Bỏ thay đổi` either lets the subsequent patient
load replace the current surface or reloads the current appointment from the
server before a workspace-tab leave; `Ở lại` changes nothing. Full browser
reload/close uses the browser-native warning. No clinical draft is written to
`localStorage` because the workstation can be shared.

## Local Draft Recovery

`app/static/js/doctor-examination/draft-recovery.js` is the only recovery-copy
owner. It uses IndexedDB database `qlpk_doctor_draft_recovery`, store
`clinical_drafts`; the record key is `doctor-clinical:<userId>:<appointmentId>`
and the record also validates `patientId`. This is an on-device fallback only,
not a server draft or a replacement for the DB/API read model.

- The stored payload holds `baseSnapshot`, current `snapshot`, timestamps and
  schema version. Snapshot owners are `clinicalWorkspace`, `supportModulesUi`,
  and `medicalHistoryBridge`; runtime
  row UIDs are removed before comparison/persistence.
- Database data always renders first. The recovery banner appears only after
  the complete current appointment surface has loaded, the stored
  `baseSnapshot` still equals that database baseline, and the current snapshot
  contains unsaved differences. If DB already equals the draft or differs from
  its `baseSnapshot`, the local record is obsolete and is deleted silently.
  A draft is never restored automatically.
- `Khôi phục` keeps the workspace dirty, annotates restored controls/rows/panel,
  and requires the existing global `Lưu` path. `Bỏ bản nháp` deletes the local
  record; after a restore it reloads canonical appointment data.
- Global save success, including the clean/no-change success path, awaits
  `rebaseAfterSave()` to delete the local record and clear annotations. A global
  save failure attempts `captureNow()` so a network failure can still leave a
  local recovery option. A failed multi-owner save is tagged locally so its next
  load can rebase once: values already present in DB are dropped from recovery,
  DB wins conflicts, and only changes still absent from DB remain in the draft.
  Expired/mismatched records are deleted; logout triggers best-effort cleanup
  for the active user.
- Local snapshots are queued after a 250 ms quiet period. They improve recovery
  from reload/crash before a manual save, but browser termination before
  IndexedDB completes cannot be guaranteed by frontend code.

## Clear/Reset Inventory

| State/DOM | Clear owner | Notes |
| --- | --- | --- |
| Selected surface class/id | `doctor-examination.js:clearPatientSurface()` | Runs before loading new appointment |
| Admin collapse visibility | `clearPatientSurface()` | Collapses detail section and hides admin panel |
| Patient admin form | `QLPKPatientInfoForm.clear()` | Clears patient DOM fields and vitals/hints |
| Visit info form | `QLPKPatientVisitInfoForm.clear()` | Clears main reason/symptoms/problem/severity/current behavior |
| Clinical workspace state token | `registry.get('clinicalWorkspace').clear()` | Increments `contextToken`, invalidates stale async responses |
| Main clinical/detail fields | `registry.get('clinicalExaminationForm').clear()` via `clinicalWorkspace.clear()` | Clears all nine main tab Khám fields, 19 inline detail controls, and current meds. |
| Detail load state | `registry.get('clinicalWorkspace').clear()` | Invalidates the detail promise with `contextToken`; a stale `modal-load` response cannot populate the new patient. |
| ICD chips/search/dropdown | `registry.get('clinicalExaminationForm').clear()` via `clinicalWorkspace.clear()` | Clears arrays and hidden ID values |
| Timers | `clearAllTimers()` | Main save, prescription, service, ICD search, medicine search |
| Prescription rows | `STATE.prescriptionRows=[]` | Render empty prescription list and quick count; the DOM contract is `#doctorPrescriptionList` with `role="list"` |
| Services/catalog | `registry.get('servicesForm').clear()` resets `STATE.services=[]`, catalog page/pagination and invalidates the catalog request token | Render empty selected-service list and catalog pager; an in-flight page response cannot render into the next appointment |
| Documents | `STATE.documents=[]` | Render empty document list |
| History | `renderHistory({history: []})` | Clears dataset payload |
| Modals | `closeAllModals()` | Prevent stale modal context |
| Complete action state | `syncCompleteActionState()` | Disabled if no exam or wrong status |

## Known Contract Friction

These are knowledge items, not change requests:

1. `problem_start_time`, `symptom_progression`, `current_behavior`, and `severity_level` are shown in the visit form but runtime owner is currently `patients` through update service. They behave like visit/intake data, so any redesign or schema cleanup must be a dedicated contract phase.
2. The former `doctorRiskSelfHarm` and `doctorRiskDelusion` keyword heuristics are not current runtime. Do not restore them or treat free-text matching as an authoritative medical decision without backend structured fields.
3. `doctorSummaryVisitContext` currently appends fixed text `Đang khám`. If UI needs exact status, use backend `examination_status_text`/`examination.status`.
4. `GET /api/appointments/<id>/edit` returns a broad legacy payload including many examination detail aliases. UI should use canonical fields first and avoid reviving legacy aliases unless required.
5. `PUT /api/appointments/<id>` writes multiple owners. Any new UI field must be checked against `update_service.py` before adding to payload.
6. Attachments load by `patient_id` but upload sends `appointment_id`; UI should communicate this carefully if showing documents as patient-level vs appointment-level.

## Design-Ready Knowledge Summary

The doctor screen is now documented enough to design responsibly if the design process follows:

1. Use `doctor-examination-business-map.md` for task hierarchy.
2. Use this inventory for exact field/source/owner/component.
3. Use `data-contracts.md` before changing owner or payload.
4. Use `information-architecture.md` for what is visible vs collapsed vs modal.
5. Use `design-from-data-checklist.md` before mockup and before code.

If a proposed design introduces a field or module not found here, it must first be added to a data/API/component contract before UI work.
