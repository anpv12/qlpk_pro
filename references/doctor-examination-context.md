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
- Mọi ICD autocomplete trong Doctor dùng skeleton Jinja duy nhất tại
  `app/templates/components/_icd_autocomplete.html`. Label nghiệp vụ phải đứng
  ngoài root và liên kết bằng `for`; không được bọc root/tag/input/nút xóa trong
  một implicit `<label>`. `icd-autocomplete.js` tiếp tục là owner interaction,
  còn Khám/Tiền sử chỉ cấu hình hydrate, serialize và class presentation.

Last reconciled with runtime: 2026-08-13.

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
Doctor-private modules in this order (shared assets between them are omitted):

1. `doctor-examination/module-registry.js`
2. `doctor-examination/page-runtime.js`
3. `components/component-dom-scope.js`
4. `components/doctor-component-config.js`
5. `components/medical-history-form.js`
6. `components/medical-history-substance-fields.js`
7. `doctor-examination/medical-history-icd-bridge.js`
8. `doctor-examination/medical-history-context.js`
9. `doctor-examination/medical-history-core.js`
10. `doctor-examination/medical-history-workbench.js`
11. `doctor-examination/medical-history-allergy.js`
12. `doctor-examination/medical-history-risk.js`
13. `doctor-examination/medical-history-suggestions.js`
14. `doctor-examination/medical-history-bindings.js`
15. `doctor-examination/safety-plan.js`
16. `doctor-examination/medical-history-bridge.js`
17. `doctor-examination/patient-history-bridge.js`
18. `doctor-examination/support-runtime.js`
19. `doctor-examination/prescription-model.js`
20. `doctor-examination/prescription-row-renderer.js`
21. `doctor-examination/prescription-history-ui.js`
22. `doctor-examination/prescription-ui.js`
23. `components/doctor-services-form.js`
24. `components/doctor-indications-form.js`
25. `doctor-examination/support-modules-ui.js`
26. `doctor-examination/clinical-detail-persistence.js`
27. `components/clinical-examination-form.js`
28. `doctor-examination/workspace-save-controller.js`
29. `doctor-examination/clinical-workspace-ui.js`
30. `doctor-examination/draft-recovery.js`
31. `doctor-examination/document-attachments-bridge.js`
32. `doctor-examination/workspace-leave-guard.js`
33. `doctor-examination/platform-boundaries.js`
34. `doctor-examination.js`

The route also loads shared components for queue cards, patient/intake forms,
medical-history controls, documents, ICD data, relatives, and modal shells.
Those components are supporting owners, not a second Doctor-workspace owner.

There are now twenty-seven live Doctor-private files under `app/static/js/doctor-examination/`
in this snapshot, plus shared component owners under
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
| Prescription state/lifecycle | `app/static/js/doctor-examination/prescription-ui.js` | The only prescription state, medicine search, load/clear/save, print, reuse, event binding, and draft snapshot owner. It delegates pure model and presentation helpers below; those helpers do not load/save or own state. |
| Prescription model | `app/static/js/doctor-examination/prescription-model.js` | Pure schedule/usage/type/date normalization, derived quantity calculation, and payload helpers; no DOM, API, or state. |
| Prescription row presentation | `app/static/js/doctor-examination/prescription-row-renderer.js` | Renders current medicine rows and updates row totals through callbacks; no API, save, or prescription state. |
| Prescription history presentation | `app/static/js/doctor-examination/prescription-history-ui.js` | Renders the dedicated large medication-history modal: prescription-bearing visits on the left, selected prescription tables on the right, and no API, save, or prescription state. It reuses the canonical prescription model to display JSONB usage as readable instructions. |
| Services form component | `app/static/js/components/doctor-services-form.js`, registry key `servicesForm` | Appointment-service state, catalog pagination, selected-row render, clear/load/save, dirty state, and draft snapshot. |
| Indications form component | `app/static/js/components/doctor-indications-form.js`, registry key `indicationsForm` | Data-backed Chỉ định pane lifecycle: catalog autocomplete with canonical `order_items.id`, performers, current appointment rows, patient history, edit/delete, dirty/save and draft restore. The shared order autocomplete provides focus/search/keyboard/dropdown behavior; this component remains the only selection and save owner. |
| Services and support save facade | `app/static/js/doctor-examination/support-modules-ui.js`, registry key `supportModulesUi` | Composes prescription + services owners and exposes the single support save facade; no service row/catalog state. |
| Shared support runtime | `app/static/js/doctor-examination/support-runtime.js` | Shared DOM, formatting, API, token, and draft-row helpers; no clinical or prescription state. |
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
| Chỉ định | `#doctorIndicationsPanel` | Data-backed indication entry; catalog, current appointment rows, history, edit/delete and global save. |

Tài liệu đính kèm remains inside the Hành chính surface, while prescription
history remains inside `#doctorPrescriptionWorkspace`; there is no separate
Doctor support panel. Chỉ định is mounted as a data-backed pane: it loads the
catalog, current appointment rows and patient-scoped history, while the global
Doctor save remains its only write transaction. A navigation click changes
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

`#doctorClinicalWorkspace .doctor-patient-hero` is a flat two-row patient
context header. Row one contains the patient name, `doctorPatientCode`, and
`doctorPatientLatestVisit`; row two contains `doctorPatientHistory` with the
most recent previous-visit diagnosis and prescription summary. The header keeps
the real `Lưu` and `Hoàn thành khám` actions in the same owner.

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

## Utility Cleanup Status

- The former Doctor workspace/helper utility duplication is closed in the
  2026-08-09 cleanup: `support-runtime.js` owns the shared text/value helpers,
  while `clinical-workspace-ui.js` supplies only its root-scoped element
  resolver. No fallback branch or second helper owner remains in the active
  Doctor runtime.

The dedicated read-only guard `scripts/check_doctor_examination_contract.py`
now locks the active script order, five root sections, canonical owner
assignments, retired aliases, and the single prescription owner.

The three remaining debt items above are intentionally cross-screen,
compatibility-sensitive, or out of scope for the current Khám cleanup.

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

## Required QA For Doctor Changes

At minimum, use static asset/reference checks and syntax checks. For a UI or
behavior change, also verify a real selected appointment: sparse and dense
data, the exact requested interaction, console cleanliness, no unwanted
overflow, and patient A -> B -> A without stale data. An empty queue or hidden
workspace verifies only asset loading, never visual or interaction completion.
