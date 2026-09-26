# Doctor Examination Context

## Config-Driven Component Contract (2026-08-09)

- `app/static/js/components/doctor-component-config.js` là cấu hình composition
  của Doctor; registry module `doctorComponentConfig`, `clinicalWorkspace`,
  `supportModulesUi` và page orchestrator không tự rải field map/endpoint map
  khi mount component.
- `patient-intake-form`, `clinical-examination-form`, `doctor-services-form`
  và `doctor-indications-form` đều tạo instance bằng `create({ config })`;
  field DOM được scope theo root, còn Khám/Dịch vụ nhận map field/section/
  endpoint từ config.
- `clinical-detail-persistence.js` là persistence engine trung tính; Doctor
  chỉ dùng bộ `bac_si_*` fields mặc định. API, payload, DB owner và selector
  Doctor hiện tại không đổi.
- Tiền sử hỗ trợ registry nhiều root bằng `getOrCreate({ rootId })`; bridge
  Doctor lấy instance theo config history, không dựa vào một singleton DOM
  cứng duy nhất. Feature modules hiện tại vẫn đăng ký qua bridge Doctor.
- Endpoint function trong các config component nhận một object args thống nhất:
  `clinical-detail-persistence` dùng `{ appointmentId }` hoặc
  `{ examinationId, section }`, còn `doctor-services-form` dùng `{ appointmentId }`
  hoặc `{ page, perPage }`. Không truyền trực tiếp cả object context vào URL.
- Hai ICD control trong Khám dùng `icd-input-container` làm frame/border owner
  duy nhất; input bên trong không tự vẽ border và không có action button phụ.
- Ở biến thể doctor-flat của Tiền sử, `icd-input-container` cũng là frame owner
  duy nhất của ô ICD. `.medical-history-section` chỉ giữ cấu trúc section/header,
  không vẽ thêm card border quanh control.
- Mọi ICD autocomplete trong Doctor dùng skeleton Jinja duy nhất tại
  `app/templates/components/_icd_autocomplete.html`. Label nghiệp vụ phải đứng
  ngoài root và liên kết bằng `for`; không được bọc root/tag/input/nút xóa trong
  một implicit `<label>`. `icd-autocomplete.js` tiếp tục là owner interaction,
  phân trang và tải thêm kết quả; loader dùng chung giữ metadata `pagination`
  của API, không cắt mảng kết quả ở FE. Khám/Tiền sử chỉ cấu hình hydrate,
  serialize và class presentation.
- `components/medical-history-form.js` chỉ tạo instance bootstrap; không tự gọi
  `init()` khi các feature bridge chưa đăng ký. `medical-history-bridge.js` là
  owner gọi `init()` sau `medical-history-icd-bridge.js`, để các action ICD của
  Bản thân/Gia đình được gắn trước khi người dùng nhập.

Last reconciled with runtime: 2026-09-26.

## Component foundation and migration boundary (2026-08-13)

- `doctor-examination/module-registry.js` là owner dependency graph của Doctor;
  module bắt buộc dùng `require`, module tùy chọn dùng `get/resolve`, và
  `validateGraph()` phải pass sau khi entry import hoàn tất.
- `doctor-examination/component-context.js` giữ context hiện hành của page;
  mọi component mới nhận `document`, `runtime`, `registry`, `config`, `state`
  qua context thay vì đọc global state patient/loading.
- `doctor-examination/platform-boundaries.js` là seam duy nhất đăng ký các
  classic shared asset vào registry. Global bridge ở app-shell/legacy chỉ là
  tương thích có chủ đích, không phải owner thứ hai.
- `components/patient-history-modal.js` là lifecycle owner duy nhất của modal
  `#patientSearchModal`; `patient-modal-contract.js` chỉ là public delegator.
  `doctor-examination/patient-history-bridge.js` là composition owner của
  Doctor: nhận callback/state từ page và cấu hình shared modal; page không gọi
  `getOrCreate()` trực tiếp. Không thêm modal instance thứ hai.
  Preview toa của modal phải được tạo với template và barcode helper qua
  registry, không gọi `setupPrescriptionTabPagination` global của dry helper.
- `components/doctor-component-base.css` là owner cho geometry/state/focus
  contract dùng chung; palette Doctor lấy từ semantic aliases trong
  `shared/color-tokens.css`. Page CSS chỉ map alias theo ngữ cảnh.

Read this before changing `app/templates/doctor-examination.html`,
`app/templates/partials/doctor-clinical-workspace.html`,
`app/static/js/doctor-examination.js`, or a Doctor clinical-workspace module.
Also read:

- `references/workflows/doctor-examination-business-map.md` for actor/task
  intent.
- `references/workflows/doctor-examination-data-inventory.md` for field,
  API, and persistence ownership.
- `references/workflows/doctor-examination-navigation.md` for navigation and
  responsive layout contracts.
- `references/data-contracts.md` before changing a payload, API, model, or
  canonical data owner.

## Runtime Boundary

The Doctor route is a stateful clinical workflow, not a generic form. A stale
DOM value, array, timer, or async response can expose patient A data while
patient B is selected.

`app/templates/doctor-examination.html` loads one Doctor ESM entry:
`app/static/js/doctor-examination-entry.js`. The entry imports these active
Doctor-private modules in this order (shared assets between them are omitted,
except that every shared asset, including
`prescriptions/shared/prescription-dose-utils.js` before
`prescription-document-template.js`, is imported before
`platform-boundaries.js`):

1. `doctor-examination/module-registry.js`
2. `doctor-examination/page-runtime.js`
3. `components/component-dom-scope.js`
4. `doctor-examination/component-context.js`
5. `components/doctor-component-config.js`
6. `doctor-examination/platform-boundaries.js`
7. `components/medical-history-form.js`
8. `components/medical-history-substance-fields.js`
9. `doctor-examination/medical-history-icd-bridge.js`
10. `doctor-examination/medical-history-context.js`
11. `doctor-examination/medical-history-core.js`
12. `doctor-examination/medical-history-workbench.js`
13. `doctor-examination/medical-history-allergy.js`
14. `doctor-examination/medical-history-risk.js`
15. `doctor-examination/medical-history-suggestions.js`
16. `doctor-examination/medical-history-bindings.js`
17. `doctor-examination/safety-plan.js`
18. `doctor-examination/medical-history-bridge.js`
19. `doctor-examination/patient-history-bridge.js`
20. `doctor-examination/support-runtime.js`
21. `doctor-examination/prescription-model.js`
22. `doctor-examination/prescription-reexam-ui.js`
23. `doctor-examination/prescription-medicine-search-ui.js`
24. `doctor-examination/prescription-row-renderer.js`
25. `doctor-examination/prescription-history-ui.js`
26. `doctor-examination/prescription-ui.js`
27. `components/doctor-services-form.js`
28. `components/doctor-indications-form.js`
29. `doctor-examination/support-modules-ui.js`
30. `doctor-examination/clinical-detail-persistence.js`
31. `components/clinical-examination-form.js`
32. `doctor-examination/workspace-save-controller.js`
33. `doctor-examination/clinical-workspace-ui.js`
34. `doctor-examination/draft-recovery.js`
35. `doctor-examination/document-attachments-bridge.js`
36. `doctor-examination/workspace-leave-guard.js`
37. `doctor-examination.js`

`platform-boundaries.js` registers the shared classic assets
(`confirmationDialog`, order utils, attachment utils/list/controls, ICD owners,
transfer modal, print adapter) before any Doctor feature module runs, so Doctor
modules read them with `registry.require(...)` only; a `registry.get() ||
window.*` fallback or a direct `window.<shared asset>`/`Swal` read is rejected by
`scripts/check_doctor_examination_contract.py`.

The route also loads shared components for queue cards, patient/intake forms,
medical-history controls, documents, ICD data, relatives, and modal shells.
Those components are supporting owners, not a second Doctor-workspace owner.

There are now thirty live Doctor-private files under `app/static/js/doctor-examination/`
in this snapshot. Twenty-nine are imported by the entry; `re-examination-calendar.js`
is imported only by `prescription-ui.js` through a static ESM import. Shared component owners live under
`app/static/js/components/` and the page orchestrator `doctor-examination.js`. Do not add
script tags or documentation references for retired
`prescription-*`, `patient-switch-*`, or `examination-data-load-*` helper
files unless a separately approved runtime slice reintroduces them.

## Active Owners

| Concern | Canonical owner | Responsibility |
| --- | --- | --- |
| Doctor page runtime | `app/static/js/doctor-examination/page-runtime.js` | Canonical page auth header, API caller, login redirect, toast, and date display formatter. Shared Doctor-loaded components use this runtime first; legacy global aliases remain only as compatibility bridges. |
| Page selection/load/clear | `app/static/js/doctor-examination.js` | Queue loading, selected appointment state, load token, page-level clear/load sequence, module initialization, realtime refresh, and the canonical `QLPKCurrentAppointment.getPatientId()` bridge for patient-level modules. |
| Doctor patient-history composition | `app/static/js/doctor-examination/patient-history-bridge.js`, registry key `patientHistoryBridge` | Configures the shared patient-history modal with Doctor status/current-patient callbacks, copy-history action, and trigger guard; returns the canonical modal instance to the page. It does not own appointment loading or history data. |
| Main clinical workspace shell | `app/static/js/doctor-examination/clinical-workspace-ui.js`, registry key `clinicalWorkspace` | Context render, shared-form composition, top-level section activation, dirty aggregation, and global save wiring. |
| Clinical detail persistence | `app/static/js/doctor-examination/clinical-detail-persistence.js` | `examination_details` field map, stale-safe hydration, and section saves. |
| Clinical examination form component | `app/static/js/components/clinical-examination-form.js` | Khám field render/collect/clear, ICD/current-medication normalization, detail dirty sections, detail load/save delegation, and draft snapshot. |
| Shared patient intake composition | `app/static/js/components/patient-intake-form.js` | Single Doctor/Lễ tân lifecycle for patient admin, visit intake, vitals, pregnancy controls, clear, populate, and collect; delegates to the two field-level components. |
| Workspace save/completion | `app/static/js/doctor-examination/workspace-save-controller.js` | Main/detail/support save transaction, draft fallback, leave decision, and examination completion. |
| Document attachments | `app/static/js/doctor-examination/document-attachments-bridge.js` | Doctor attachment state plus shared attachment controls/list adapter. |
| Leave/reload guard | `app/static/js/doctor-examination/workspace-leave-guard.js` | `beforeunload`, keyboard reload, and app-shell leave delegation. |
| Medical history ICD bridge | `app/static/js/doctor-examination/medical-history-icd-bridge.js` | ICD search, selection, hydration lookup, tag rendering, and the explicit internal contract consumed by the lifecycle bridge. |
| Medical history module context | `app/static/js/doctor-examination/medical-history-context.js` | Module-scoped component/runtime lookup, action dispatch, auth headers, ICD lookup access, debug logging, and shared visibility helper; no second registry or domain state. |
| Medical history core | `app/static/js/doctor-examination/medical-history-core.js` | History serialization, chips, change emission, and core actions; shared visibility is provided by the module context. |
| Medical history workbench | `app/static/js/doctor-examination/medical-history-workbench.js` | History workbench summary, target activation, tabs, filters, and workbench event wiring. |
| Medical history base component | `app/static/js/components/medical-history-form.js` | Scoped root, action registry, event lifecycle, clear/populate/collect/save contract, dirty revision, context token, and destroy. |
| Medical history bridge | `app/static/js/doctor-examination/medical-history-bridge.js` | Doctor adapter only: normalize the backend `medical_history` envelope and expose the base component to the page save/patient-switch lifecycle. |
| Prescription state/lifecycle | `app/static/js/doctor-examination/prescription-ui.js` | The only prescription state, load/clear/save, print, reuse, event binding, and draft snapshot owner. It delegates pure model, re-exam status, medicine-search and presentation helpers below; those helpers do not load/save or own prescription state. Dirty/revision uses `supportRuntime.createChangeTracker`; the appointment id comes from `supportRuntime.getCurrentAppointmentId(state)` like Services/Indications. |
| Shared dose math | `app/static/js/prescriptions/shared/prescription-dose-utils.js`, global `window.PrescriptionDoseUtils` | The only parser/formatter for doses, schedules and usage JSON (`parseDose`, `formatDose`, `normalizeSchedule`, `parseUsage`, usage/note modes). Loaded by Doctor, Psychologist and the public verify page before `prescription-document-template.js`; the template's legacy globals and `prescription-model.js` only delegate. |
| Re-examination status | `app/static/js/doctor-examination/prescription-reexam-ui.js`, registry key `prescriptionReExam` | Pure lock/change/label rules for the re-exam badge and button (`isLocked`, `hasChanges`, `describe`, `renderStatus`, `renderButton`); reads the prescription state passed in, never loads, saves or owns it. |
| Medicine search dropdown | `app/static/js/doctor-examination/prescription-medicine-search-ui.js`, registry key `prescriptionMedicineSearch` | Floating stock-medicine dropdown: debounced search, latest-query-wins token, keyboard navigation, positioning and option lookup. Applying a medicine to a row, quantity recalculation and dirty marking stay in `prescription-ui.js`. |
| Confirmation dialogs | `app/static/js/shared/confirmation-dialog.js`, registry key `confirmationDialog` | Shared SweetAlert wrapper: `confirm()` for two-button decisions (for example deleting an indication) and `choose()` returning `confirm`/`deny`/`cancel` for the three-button unsaved-changes decision in `workspace-save-controller.js`. |
| Prescription model | `app/static/js/doctor-examination/prescription-model.js` | Pure schedule/usage/type/date normalization, derived quantity calculation, and payload helpers; no DOM, API, or state. |
| Prescription row presentation | `app/static/js/doctor-examination/prescription-row-renderer.js` | Renders current medicine rows and updates row totals through callbacks; no API, save, or prescription state. |
| Prescription history presentation | `app/static/js/doctor-examination/prescription-history-ui.js` | Renders the dedicated large medication-history modal: prescription-bearing visits on the left, selected prescription tables on the right, and no API, save, or prescription state. It reuses the canonical prescription model to display JSONB usage as readable instructions. |
| Re-examination calendar | `app/static/js/doctor-examination/re-examination-calendar.js` | Selection-only modal imported by `prescription-ui.js`. It lazy-loads pinned FullCalendar 5.11.3, reads the calendar API through the injected `requestJson`, and returns the chosen slot through `onConfirm`; patient context, draft, and save stay in `prescription-ui.js`. |
| Services form component | `app/static/js/components/doctor-services-form.js`, registry key `servicesForm` | Appointment-service state, catalog pagination, selected-row render, clear/load/save, dirty state, and draft snapshot. |
| Indications form component | `app/static/js/components/doctor-indications-form.js`, registry key `indicationsForm` | Data-backed Chỉ định pane lifecycle: free-text/survey selection, performers, current appointment rows, patient history, edit/delete, dirty/save and draft restore. The shared autocomplete is survey-only; this component remains the only selection and save owner. |
| Services and support save facade | `app/static/js/doctor-examination/support-modules-ui.js`, registry key `supportModulesUi` | Composes prescription + services owners and exposes the single support save facade; no service row/catalog state. |
| Shared support runtime | `app/static/js/doctor-examination/support-runtime.js` | Shared DOM, formatting, API, token, and draft-row helpers plus `getDocument`, `getScopedDocument` (root-scoped document through `componentDomScope`), `mergeConfig(defaults, config, nestedKeys)` and `createChangeTracker(state, { revisionKey, dirtyKey })`; no clinical or prescription state. |
| Component context | `app/static/js/doctor-examination/component-context.js`, registry key `doctorComponentContext` | Page context (`create`, `setCurrent`, `getCurrent`, `clearCurrent`) with scoped document, mount lifecycle and events; one `createStateBridge` wraps either the supplied state object or a copy of `initialState` (the separate `createState` copy was removed). |
| Device-local recovery | `app/static/js/doctor-examination/draft-recovery.js` | IndexedDB baseline/snapshot comparison, explicit restore/discard, and restored-value markers. |
| Workspace markup | `app/templates/partials/doctor-clinical-workspace.html` | Patient context header, five root sections, inline prescription, service region, and the data-backed indication pane. |
| Doctor shell/workspace presentation | `app/static/css/pages/doctor-examination.css` | Scoped Doctor palette, responsive rail, workspace layout, clinical/service presentation, and recovery markers. |
| Prescription presentation | `app/static/css/pages/doctor-prescription.css` | Prescription editor, medicine rows, history panel, search-cell controls, and their responsive rules. |

`doctor-examination.js` intentionally stays the page orchestrator. Do not
create a parallel `select/load/save` route in a helper or template event.

The Hành chính surface is composed by `QLPKPatientIntakeForm`. Doctor and Lễ tân
may configure the shared Jinja partials independently, but their runtime callers
must use this composition owner; `QLPKPatientInfoForm` and
`QLPKPatientVisitInfoForm` are implementation details and are not page-level
lifecycle owners.

The remaining Doctor tab owners follow the same component contract boundary:
each factory accepts an optional config, exposes `bind`, `clear`, `collect`,
`getConfig`, and its domain-specific data lifecycle, while the page only calls
the registry owner. The current owner keys are `medicalHistoryBridge`,
`clinicalExaminationForm`, `servicesForm`, and `indicationsForm`; composition is
provided by `clinicalWorkspace` and `supportModulesUi`. Internal Doctor
globals and old/new aliases are retired. The only intentionally retained
Doctor global compatibility boundary is `QLPKDoctorWorkspaceLeaveGuard`, which
the shared app-shell consumes; `QLPKDoctorPageRuntime`, `QLPKCurrentAppointment`,
and shared component globals remain explicit cross-file contracts.

## Workspace Contract

The root navigation is exactly:

| Label | Target | Purpose |
| --- | --- | --- |
| Hành chính | `#doctorReceptionistIntakePanel` | Patient and receptionist intake context. |
| Tiền sử | `#doctorHistoryPanel` | Personal/family history, allergies, risk, substance use, safety plan. |
| Khám | `#doctorClinicalDecisionPanel` | Default clinical task surface. |
| Dịch vụ | `#doctorServicePanel` | Appointment services only. |
| Chỉ định | `#doctorIndicationsPanel` | Data-backed indication entry; Doctor và Tâm lý gia dùng một input để chọn mẫu Khảo sát hoặc nhập text tự do, với current appointment rows, history, edit/delete và global save. |

Tài liệu đính kèm remains inside the Hành chính surface, while prescription
history remains inside `#doctorPrescriptionWorkspace`; there is no separate
Doctor support panel. Chỉ định is mounted as a data-backed pane: both Doctor
and Tâm lý gia load survey templates, current appointment rows, performers and
patient-scoped history, while the global save remains its only write
transaction. A navigation click changes
presentation and ARIA state only: it must not write, clear the appointment, or
infer clinical state from its label.

The Khám surface has one paired clinical grid followed by the inline prescription
workspace. Prescription state is owned by `prescription-ui.js`; the support
facade only coordinates its save/load/clear lifecycle with services and history;
the presentation is no longer a separate root navigation section:

- `#doctorDecisionTreatmentTask`: nine numbered clinical decision fields.
- `#doctorClinicalDetailPanel`: seven organ fields and eight mental-exam
  fields; `Thần kinh` spans the two-column detail grid on desktop.
- `#doctorPrescriptionWorkspace`: full-width prescription workspace below the
  paired Khám cards. Its history panel opens only from the `Xem lịch sử` action.

The retired Doctor-only `bac_si_kham_kham_tam_than.general_manifestations` and
`notes` values were archived and removed. They are not mounted, hydrated,
cleared, submitted, or used as fallbacks; the workspace keeps only the
canonical eight mental-exam fields.

## Patient Context Header Contract

Từ 2026-09-10, header có nút `Chuyển khám` mở `TransferModal` dùng chung
(`transfer-modal-dry.js`, `static/templates/transfer-modal.html`). Registry
`transferModal` được nạp qua platform boundary; Doctor không tạo modal riêng.
Page orchestrator giữ appointment/load token, cung cấp `isCurrent` và
`beforeTransfer` cho modal. Mở/hủy modal không ghi; xác nhận mới gọi
`clinicalWorkspace.saveWorkspace({ silent: true })`, chỉ POST chuyển khi lưu
đủ và context còn đúng. Không áp dụng default Khám chi tiết của nút Lưu.
Không cho chuyển lúc loading/load failed/xem lịch sử/đang lưu. Thành công
clear lượt đang chọn và tải lại queue; endpoint hiện có phát socket cho các
phiên khác. Modal chung khóa thao tác/đóng khi đang lưu-chuyển, chặn gửi lặp
và bỏ qua phản hồi người nhận từ phiên/nhóm cũ. Lỗi giữ modal để thử lại.
Header hẹp dùng grid tự chia cột (2 cột ở 390px), chiều cao theo nội dung;
vùng khám vẫn giữ scroll owner hiện có.

`#doctorClinicalWorkspace .doctor-patient-hero` is a flat two-row patient
context header. Row one contains the patient name, `doctorPatientCode`, and
`doctorPatientLatestVisit`; row two contains `doctorPatientHistory` with the
most recent previous-visit diagnosis and prescription summary. The header keeps
the real `Lưu`, `Chuyển khám` and `Hoàn thành khám` actions in the same owner.

The header intentionally does not render avatar, gender, age, service, status,
or a duplicate appointment summary. The name/code come from the selected
appointment payload. Previous-visit data is read-only from the existing
prescription history state exposed by
`registry.get('prescriptionForm').getLatestPreviousVisitSnapshot()`, which reads the
existing patient-history endpoint and excludes the current/future visit. No
new endpoint, fixture, display-text inference, or duplicate prescription state
is allowed.

When history is loading, the first row says `Đang tải lịch sử...`; when no
eligible previous visit exists it says `Chưa có lần khám trước`. Clearing a
patient clears the code, date, diagnosis, prescription summary, and hides the
history row before the next patient is rendered. On narrow viewports the header
becomes content-height, keeps the two information rows, and moves the two real
actions to a separate compact row without page overflow.

The Service section has one visual frame: direct child
`.doctor-service-workspace--split`. It owns a paginated catalog on the left
and selected appointment services on the right. Catalog list and selected list
are their own scroll owners on desktop; the global Doctor save action persists
dirty services. The UI preview `Tổng dự tính` is derived locally, while the
backend sync response remains canonical.

Doctor service sync owns selection, quantity, and note only. The server
resolves every new row from the active catalog; it ignores client-provided
price, discount, tax, duration, and display name, preserves an existing
financial snapshot, and rejects an attempt to swap `service_id` on an existing
row. Payment lock is server-owned and covers both `payment_status=PAID` and
legacy `status=PAID`.

## Data And Save Contract

Canonical field mappings belong in
`references/workflows/doctor-examination-data-inventory.md`. High-level
boundaries are:

- Patient identity and long-lived history: `patients`.
- Appointment/intake context: `appointments`.
- Current clinical decision fields and status: `examinations`.
- Flexible detail sections: `examination_details`.
- Medicines and appointment services: their respective support modules and
  APIs. The orders backend remains available to its own screens but is not a
  Doctor workspace dependency.

Doctor persistence is manual. Header `Lưu` calls only
`registry.get('clinicalWorkspace').saveWorkspace()` and executes one visible
transaction:

1. Save dirty main clinical data plus the immediate Tiền sử snapshot through
   `PUT /api/appointments/<appointment_id>`.
2. Save only dirty detail sections through their scoped section endpoints.
3. Save only dirty prescription and services through
   `registry.get('supportModulesUi').saveAll({ onlyDirty: true })`.

Support save results preserve `success`, `partial`, `error`, and `skipped`.
`skipped` is not a successful writer: a loading/in-flight module is surfaced as
partial so the global save never claims every selected owner was persisted.

The save action changes immediately to `Đang lưu...`, locks header actions for
the transaction, keeps fields editable, and does not show a synthetic delay or
success modal. A no-change action must not issue a write. A newer edit made
while a writer is in flight remains dirty for the next manual save.

Tiền sử has no Doctor autosave writer. `autoSave: false`; the lifecycle bridge
is the only history save/clear owner. File upload and safety-plan-file repair
remain explicit file actions.

## Patient Switch And Dirty Safety

Từ 2026-09-13, field8 Thuốc đang dùng là autocomplete chọn nhiều từ DAV,
được sở hữu trực tiếp bởi `clinical-examination-form.js`; endpoint cấu hình
trong `doctor-component-config.js`. UI/lifecycle dùng `QLPKAutocompleteField`
chung với ICD theo `references/ui/autocomplete-field.md`. Tìm tên/hoạt chất/
SĐK, 12 dòng mỗi lần, cuộn tải tiếp; status=all cho cả thuốc từ nguồn cũ.
Không ghi DAV ID vào hợp đồng hiện hành: `currentMedications` giữ JSON list
tên kèm hàm lượng, giữ các tên legacy. Render và draft không biến tên chứa
dấu phẩy thành nhiều thuốc. Query là transient, không dirty/serialize/draft.
Đổi ca, render, restore, Escape/Tab/blur đóng và vô hiệu hóa request cũ;
loading/history view chặn tìm/chọn/bỏ. Chips và input chung control; dropdown
nổi trong native popover, không làm giãn form; panel body giữ cuộn vùng khám.
Không autosave.

Before loading another appointment, the page must set the loading guard and
clear both DOM and JavaScript state. The existing clear sequence covers:

- Workspace context token, clinical fields, detail-load promise, selected ICDs,
  and current medications.
- Medical-history controls and manual history revision.
- Prescription rows/search state, service selections/catalog page/request
  token, documents, history datasets, and modal context.
- Timers and active patient/appointment/examination IDs.

All new patient-specific fields, chip lists, counters, caches, and async
requests must be added to the correct clear owner in the same slice. A stale
response must fail its context/load-token check before mutating the surface.

Dirty state is the union of main/detail revision, manual history revision, and
support-module dirty flags. Application-controlled patient/workspace leaves use
the themed `qlpk-confirm-dialog`; browser-owned toolbar reload, address/back,
and tab/window close may still use native `beforeunload`.

## Local Draft Recovery

`draft-recovery.js` is the only recovery-copy owner. It stores a 24-hour,
user/appointment/patient-scoped record in IndexedDB
`qlpk_doctor_draft_recovery/clinical_drafts`; it never writes clinical data to
`localStorage` and never replaces DB data automatically.

The normal order is DB/API first, then baseline capture, then an explicit
`Khôi phục` or `Bỏ bản nháp` choice. Restore remains dirty and marks changed
controls, rows, or panels with a semantic red outline that pulses three times
then remains visible. After restore, the recovery owner activates the first
affected root tab, opens the affected Medical History workbench target when
needed, scrolls the section's own scroll owner to the first affected field,
and focuses it; markers on affected fields in other tabs remain until save or
discard. Successful global save removes the local draft and every marker. A
failed save attempts a best-effort capture; it does not retry writes. If that
attempt saved only some owners before another owner failed, the next load
rebases the recovery copy once: DB values win for saved/conflicting fields and
only differences still absent from DB remain recoverable.

ICD autocomplete query text is transient UI state and is not a recovery value;
draft comparison and restore use the hidden ICD id controls, then rehydrate the
selected chips. A capture carries a generation token so a late IndexedDB write
cannot resurrect a draft after discard, rebase, or patient-context change. Each
record also keeps its baseline snapshot. Only a record whose baseline still
matches the fully loaded DB/API surface is recoverable. If the current DB/API
surface already equals the draft, or has changed since that baseline, the
record is obsolete and is deleted silently; canonical DB data stays on screen.

## Known Debt, Not Yet Approved For Cleanup

- The Doctor orders surface is intentionally removed. The backend orders module
  and its shared screens remain outside this Doctor cleanup scope.
- Document deletion no longer uses native `window.confirm`; it goes through the
  shared custom confirmation owner. Native `beforeunload` remains only for the
  browser-owned reload/close warning, which is a separate browser contract.
- The ESM entry conversion is complete. Seven classic assets remain only as
  intentional shared/app-shell boundaries and are allowlisted by the Doctor
  contract checker; Doctor-private assets must not be added back as classic
  script tags.
- `mergeConfig` copies that intentionally stay local:
  `clinical-examination-form.js` replaces `mainFields`/`detailFields` wholesale
  (not a nested shallow merge), and `patient-intake-form.js`,
  `patient-info-form.js`, `patient-visit-info-form.js` are shared with Lễ tân,
  where `supportRuntime` is not loaded. Doctor-only components use
  `supportRuntime.mergeConfig`.
- `getDocument` helpers in shared `components/*` files (form/DOM utils,
  patient forms, workflow two-pane, waiting list) run on pages without
  `supportRuntime`, and `medical-history-substance-fields.js` loads before
  `support-runtime.js`. Doctor-private modules, `clinical-examination-form.js`,
  `doctor-services-form.js` and `doctor-indications-form.js` delegate to
  `supportRuntime.getDocument/getScopedDocument`; `component-context.js` keeps
  its own scoped variant because it owns the scope factory.
- Change tracking not on `createChangeTracker`: `medical-history-form.js` loads
  before `support-runtime.js` in the entry and also settles a second
  `recoveryDirty` flag; clinical detail sections keep a per-section revision map
  (`detailRevisions`) rather than one counter. Prescription, Services,
  Indications, the workspace main fields, the clinical form main fields and the
  save controller use the tracker, and the contract checker rejects manual
  `*Revision`/`*Dirty` writes in those files.
- CSS viewport `@media` rules that remain: page shell/two-pane and rail
  breakpoints (48/64/86.25/96rem) are page-level by design; component-level
  rules (service catalog and indications at 64rem, prescription editor/history
  modal at 48/68rem, medicine meta at 25rem, psychologist clinical grid) are
  candidates for container queries. Converting them changes behaviour because
  container width differs from viewport width, so it needs a separate slice
  with visual QA on real patients at several widths.
- 10 overridden declarations in `doctor-examination.css` and 9 in
  `doctor-prescription.css` sit in grouped selector rules where a later, more
  specific rule overrides one member; the grouped declaration still applies to
  the other members, so they are intentional composition, not dead code.
- `doctor-prescription.css` keeps the literal fallbacks in
  `var(--qlpk-feedback-warning, #c2410c)` and
  `var(--qlpk-feedback-success, #15803d)` because
  `scripts/check_prescription_stock_contract.py` requires those exact strings.
  Every other Doctor CSS colour comes from `shared/color-tokens.css`, which the
  Doctor contract checker enforces.

## Utility Cleanup Status

- The former Doctor workspace/helper utility duplication is closed in the
  2026-08-09 cleanup: `support-runtime.js` owns the shared text/value helpers,
  while `clinical-workspace-ui.js` supplies only its root-scoped element
  resolver. No fallback branch or second helper owner remains in the active
  Doctor runtime.

The dedicated read-only guard `scripts/check_doctor_examination_contract.py`
now locks the active script order, five root sections, canonical owner
assignments, retired aliases, and the single prescription owner.

The remaining debt items above are intentionally cross-screen,
compatibility-sensitive, or out of scope for the current Khám cleanup.

## Cleanup Record 2026-09-26

- Dose math has one owner (`PrescriptionDoseUtils`). The duplicate helpers in
  `prescription-model.js`, the template and `psychologist-examination/core-utils.js`
  were removed or turned into delegates; parity over 980 stored usages × 3
  modes gave identical quantity, note and payload.
- Shared assets reach Doctor modules only through the registry
  (`platform-boundaries.js` loads early); the unsaved-changes dialog uses
  `confirmationDialog.choose()` instead of calling SweetAlert directly.
- Prescription reads the appointment id through the same runtime getter as
  Services/Indications.
- `prescription-ui.js` went from 1461 to 1229 lines: re-exam status and the
  medicine-search dropdown moved into their own owners; unused
  `getReExaminationStatus`/`normalizeReExaminationDateTime` wrappers, the unused
  `invalid` re-exam state and its CSS selector were removed.
- Revision/dirty bookkeeping for Prescription, Services, Indications and the
  main clinical fields uses one `createChangeTracker`; the write-only
  `state.revision` counter in the clinical form was removed.
- CSS: the component base reads `--qlpk-doctor-*` tokens directly, alias
  variables were folded into canonical names, all remaining literal colours
  moved into `shared/color-tokens.css` (including the `--qlpk-rx-*` prescription
  class colours and Doctor shadow/backdrop tokens), three duplicate rules were
  merged and fully overridden declarations removed.
- Contract checks match the current layout and stock markup. CDN URLs are
  pinned to full versions (chart.js 4.5.1, flatpickr 4.6.13, sweetalert2
  11.26.25, echarts 5.6.0; the pinned files are byte-identical to what the
  loose URLs served on 25–26/09), and the Doctor contract rejects a new
  jsDelivr URL without an x.y.z version in any template.
- QA evidence: Node tests, Doctor/prescription/print/ICD/history/tabs/brand
  contract scripts, draft-recovery and quantity policies; headless Chrome
  parity against the previous commit for the Doctor, Psychologist and verify
  pages (0 computed-style diffs, including four viewports with a real dense
  appointment), and identical UI state and write payloads for the re-exam,
  save/race, patient-switch dialog and medicine-search scenarios. The real
  patient queue on localhost was empty, so this is **chưa pass
  visual/interactive QA** on live patients.

## Cleanup Record 2026-07-29

- Verified that retired Doctor helper assets are not imported by the current
  template.
- Removed the unrendered `data-prescription-action="save"` click branch.
- Removed six CSS selector families with no template or JavaScript caller:
  clinical eyebrow, support grid, generic two-column form grid, clinical detail
  action, danger-lite workspace button, and their responsive remnants.
- Replaced obsolete historical runtime inventories with this active owner map.

## Cleanup Record 2026-08-02

- Extracted prescription state/render/load/save/history/print from
  `support-modules-ui.js` into `prescription-ui.js`.
- Moved shared support helpers into `support-runtime.js`; no API, payload, DOM
  field, navigation, or backend owner changed.
- `support-modules-ui.js` now owns only the single `saveAll()` facade for
  prescription + services. `components/doctor-services-form.js` owns service
  state/render/load/save; the facade no longer owns service rows or catalog
  state. It also no longer renders prescription rows, binds prescription
  events, or loads the retired hidden support-history panel.

## Prescription Responsibility Refactor 2026-08-02

- Kept `prescription-ui.js` as the only state/lifecycle owner and split its
  internal responsibilities into `prescription-model.js`,
  `prescription-row-renderer.js`, and `prescription-history-ui.js`.
- The new modules are dependency-loaded before `prescription-ui.js` and expose
  no load/save/public workflow owner. API endpoints, payload fields, DOM ids,
  patient-switch clearing, dirty revision, and global save phases are unchanged.
- Moved the complete prescription presentation slice into
  `doctor-prescription.css`; `doctor-examination.css` no longer owns a
  prescription selector.
- Removed unused prescription runtime imports and retained defensive parse/API
  error handling only; no fake data or presentation fallback branch was added.

## Doctor queue realtime (2026-09-09)

- `appointments.doctor_queue_entered_at` là thời điểm vào hàng chờ bác sĩ,
  do `appointments/services/doctor_queue.py` ghi khi chuyển bác sĩ hoặc đổi
  sang DOCTOR_EXAM/CONCLUSION. Sửa nội dung khám không đổi thứ tự.
- Queue dùng status hợp nhất `doctor_queue`, lấy đủ các trang và giữ thứ tự
  backend. Card đang chọn và bộ lọc tìm kiếm giữ nguyên khi nhận socket;
  không tự mở ca mới, không tải lại form Khám/đơn thuốc đang nhập.
- `realtime-client.js` khử envelope trùng bằng `event_id`; sau mỗi lần kết
  nối và nhận xác nhận subscribe, phát `realtime.resynced` để Doctor tải bù
  queue/CLS và header tải bù thông báo. Hook Doctor dùng batch để document
  event không nuốt appointment event; response queue cũ không được render.
- Order/survey event gọi `indicationsForm.refreshCurrent()`: chỉ cập nhật
  rows của đúng context khi không dirty/saving/editing; giữ nguyên ô nhập.
  Nếu đang sửa thì báo có cập nhật và chờ lưu/kết thúc sửa. Load, clear,
  request revision ngăn response của ca cũ ghi vào ca mới.
- Đây là cập nhật queue và chỉ định; không phải đồng bộ toàn bộ field
  lâm sàng/đơn thuốc giữa nhiều người sửa cùng lúc.

## Required QA For Doctor Changes

Khi nhấn nút `Lưu`, `clinicalDetails.prepareEmptyDefaults()` điền đúng
`Không ghi nhận bất thường` cho ô trống/whitespace thuộc 7 cơ quan và 8
field tâm thần. `clinicalExaminationForm` gọi owner này sau guard load;
save controller lấy dirty sections sau khi chuẩn bị giá trị mặc định và
dùng section API hiện có. Nội dung đã nhập giữ nguyên; 4 field Lý do khám,
Bệnh sử, KQ khám toàn thân, Biểu hiện chung không được mặc định. Giá trị
mặc định không chạy khi load, đổi bệnh nhân, background save hoặc chỉ
collect draft. Scope này chỉ bật qua action `save` với `applyDetailDefaults`.
Lưu lỗi giữ dirty để retry; không có cập nhật hàng loạt dữ liệu lịch sử.

At minimum, use static asset/reference checks and syntax checks. For a UI or
behavior change, also verify a real selected appointment: sparse and dense
data, the exact requested interaction, console cleanliness, no unwanted
overflow, and patient A -> B -> A without stale data. An empty queue or hidden
workspace verifies only asset loading, never visual or interaction completion.
