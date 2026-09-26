# QLPK Architecture Map

## Medicine price updates

- `app/models/medicine_price_history.py` owns audit intervals;
  `app/modules/medicines/services/price_history.py` owns price changes,
  server timestamps, stale-write checks and paginated history.
  `app/api/medicine.py` owns authenticated GET/POST price routes.
- `app/static/js/medicines/price-editor.js` and
  `app/templates/partials/medicine-price-editor.html` own the separate price dialog;
  `clinic-catalog.js` integrates create/edit/reset without resubmitting price
  on ordinary edits. showInventoryOverlay handles stacking/focus while the
  original medicine form remains mounted. Catalog writer records initial prices
  for POST/Excel.

## Shared autocomplete field

`components/autocomplete-field.js/.css` và template macro
`components/_autocomplete_field.html` sở hữu control/tags/popup và
lifecycle async dùng chung. ICD adapter giữ contract ID/mã; DAV field8
adapter trong `clinical-examination-form.js` giữ tên/hàm lượng. Nguồn dữ
liệu không tự render UI. Chuẩn: `references/ui/autocomplete-field.md`.

- Phân trang 12 danh sách quản trị: `partials/clinic-pagination.html` và
  `static/js/components/clinic-pagination.js` là renderer/control dùng chung;
  page JS giữ API/bộ lọc và chọn adapter client hoặc metadata server.
  Token pagination Tủ thuốc được dùng chung qua `shared/clinic-workspace.css`.

- Visual foundation cho Tủ thuốc và 18 màn quản trị opt-in:
  `app/static/css/shared/clinic-workspace.css` (nền/header/summary/tokens,
  input/select, placeholder, nút và typography modal).
  `shared/admin-management-ui.css` giữ bảng/layout admin và fallback control
  cho trang không opt-in;
  page CSS giữ workflow riêng. Phạm vi và ngoại lệ được kiểm tại
  `scripts/check_brand_theme.py`; xem `references/ui/brand-theme.md`.

## Runtime Shape

- Application type: Flask server-rendered web app.
- Backend: Flask, Flask-CORS, SQLAlchemy, PostgreSQL, Alembic, JWT auth.
- Frontend: Jinja templates under `app/templates`, static CSS/JS under `app/static`, Bootstrap, jQuery, Flatpickr, selected chart/print libraries.
- Deployment: Docker Compose with `postgres`, `app`, `nginx`, optional `redis`.
- Target organization is workflow/domain-first and is tracked in `so-do-to-chuc.md`. The current `app/` layout remains the runtime source of truth until individual slices are migrated and validated.

## Entry Points

- `main.py`: creates the Flask app, optionally initializes DB tables through `Base.metadata.create_all()` only when `AUTO_CREATE_TABLES`/`DEBUG` allows it, configures CORS/host checks, registers all blueprints, and defines page routes.
- `app/realtime/`: Socket.IO realtime layer. `socket.py` owns server init/auth/rooms/event envelope, `events.py` owns domain event helpers (`appointment/examination/patient/order/survey/payment/inventory/catalog/document/finance/busy_schedule/notification`), and `presence.py` tracks current socket-connected users for dashboard online state in the current single-worker eventlet deployment.
- `app/core/config.py`: Pydantic settings from `.env`.
- `app/core/database.py`: SQLAlchemy engine, `SessionLocal`, `Base`, `get_db()`.
- `app/models/__init__.py`: model registry. Every live model with `__tablename__` must be imported/exported here so `Base.metadata`, schema checks, and Alembic see the same table set.
- `alembic/env.py`: migration environment. The active Alembic graph is a single current-schema baseline revision (`20260704_legacy_db_cleanup`); legacy pre-baseline revisions are archived under `_archive/alembic-prebaseline-20260705/`. Use `scripts/check_alembic_contract.py --strict` before changing migration graph or applying production migrations.

## Backend Module Groups

- Authentication and permissions: `app/api/auth.py`, `app/services/auth.py`, `app/models/user.py`, `app/models/group.py`. Use `scripts/check_api_auth_contract.py` to audit public/private route boundaries before adding or changing API endpoints.
- Appointments and reception: `app/api/appointment.py`, appointment services under `app/modules/appointments/services/` for query/stats, create, update, import, export, confirm, re-examination, deletion/cancel, status transitions, transfer, side effects, and canonical appointment-service selection/financial calculation, appointment read/edit view models under `app/modules/appointments/view_models/`, compatibility wrappers under `app/services/appointment_*`, `app/static/js/appointment-management.js` with calendar render/event source/list/filter/conflict/patient-duplicate-warning/service-package/doctor-controls/edit-modal-ui/add-modal-ui/icd-multiselect/page-actions/status/legend/busy-schedule/panel/calendar connection/sync modal/runtime/table/status/date/filter/controls/page-interaction helpers under `app/static/js/appointment-management/`, `app/static/js/receptionist-new.js`, receptionist helpers under `app/static/js/receptionist/`. Module contexts: `references/modules/appointments.md`, `references/modules/receptionist.md`.
- Examinations: `app/api/examination.py`, `app/api/examination_details.py`, `app/api/examination_detail.py`, `app/api/examination_management.py`, read view models under `app/modules/examinations/view_models/`, services under `app/modules/examinations/services/` for create, details, lookup reads, management query, status transition, and hard delete cleanup, `app/models/examination.py`, `app/models/examination_detail.py`, `app/utils/examination_utils.py`, `app/static/js/doctor-examination.js`, `app/static/js/psychologist-examination.js`. Legacy progress-session and records/history route/service/model references are no longer part of the runtime. Module context: `references/modules/examinations.md`.
- Doctor examination: `app/static/js/doctor-examination.js` is the high-risk stateful page orchestrator for appointment/examination/detail/prescription/services APIs. Its active Doctor-private modules are listed in `references/doctor-examination-context.md`; prescription state remains owned only by `prescription-ui.js`, while `prescription-model.js`, `prescription-reexam-ui.js`, `prescription-medicine-search-ui.js`, `prescription-row-renderer.js`, and `prescription-history-ui.js` are stateless helpers; dose parsing/formatting belongs to the shared `prescriptions/shared/prescription-dose-utils.js`. Draft recovery is device-local IndexedDB only, canonical server data remains DB-first, and restore is explicit. Doctor persistence is a manual global-save transaction; do not infer that the Doctor screen uses the psychologist or legacy autosave policy. Shared components and shared order helpers remain separate owners. The reusable patient search/history modal lifecycle is owned by `components/patient-history-modal.js`, not by this page orchestrator.
- Psychologist examination: `app/static/js/psychologist-examination.js`, same `examination_details` storage with psychologist section mapping. Page-specific pure helpers now live under `app/static/js/psychologist-examination/` for core formatting/status helpers, while shared components/orders helpers handle the reusable shell behavior and the legacy orchestrator keeps wrapper/alias names for existing callers. Its patient search/history UI uses the same `QLPKPatientHistoryModal` instance and only supplies TLG-specific data/action adapters.
- Prescriptions: `app/modules/prescriptions/api/public.py`, `app/modules/prescriptions/api/internal.py`, `app/modules/prescriptions/services/read_service.py`, `app/modules/prescriptions/services/save_service.py`, `app/modules/prescriptions/services/re_examination_service.py`, `app/modules/prescriptions/view_models/public_prescription.py`, `app/modules/prescriptions/view_models/print_prescription.py`, `app/api/prescription.py` compatibility wrapper, `app/models/prescription.py`, verify/frontend print/modal preview/modal print/shared document assets under `app/static/js/prescriptions/` and `app/static/css/prescriptions/`, prescription UI bridge inside examination JS/templates. Module context: `references/modules/prescriptions.md`.
- Medicine/inventory: stock reads remain in `app/api/medicine.py`, models `medicine.py`, `medicine_batch.py`, `medicine_transaction.py`, and `medicine-management.js`; imports/opening registration belong to `app/modules/medicines/services/inventory_service.py` (manual count retired). `catalog_service.py` owns DAV-only clinic creation and settings updates; source mapping requires its trusted Python keyword `allow_reference_mapping=True`. `reference_review.py` owns authorized human preview/confirmation through `/api/medicines/<id>/reference-review`; `medicines/reference-review.js` owns the separate review modal and shared autocomplete adapter. User review was restored by the latest 2026-09-14 decision; previous automated links require human confirmation. `catalog_excel.py` shares the creation writer for Excel and its template. `medicines/clinic-catalog.js` owns DAV selection/reset for creation and locked source display for ordinary editing. The DAV screen/API (`medicine_reference_catalog.py`, `modules/medicines/api/reference_catalog.py`, `medicine-reference-catalog.html`, `medicines/reference-catalog.js`) still handles source sync/search/detail; its data links to clinic medicines by FK but never owns stock.
- Clinical orders: `app/modules/orders/api/chi_dinh.py`, `app/modules/orders/api/survey.py`, clinical query/mutation/result-file services under `app/modules/orders/services/`, view models under `app/modules/orders/view_models/`, compatibility wrapper `app/api/chi_dinh.py`, and `app/models/chi_dinh.py`. The retired order catalog API/model/tables were removed in the 2026-08-31 cleanup. Module context: `references/modules/orders.md`.
- Payment: `app/api/payment_waiting.py`, `app/templates/payment-waiting.html`, `app/static/js/payment-waiting.js`.
- Surveys: `app/api/survey_*`, `app/models/survey_*`, survey template/session/response screens. CRUD owner `survey_templates.py`; `survey_template_management.py` only public list/duplicate. Scoring/validation owner `app/utils/survey_scoring.py`; context `references/modules/surveys.md`.
- Supporting catalogs: ICD, active ingredients, allergens, services, packages, holidays, documents, addresses, busy schedules.

## Order-survey lifecycle owner (2026-09-05)

`app/modules/orders/services/survey_lifecycle.py` is shared by link generation,
submission, order mutation and legacy reconciliation. It owns order status
transitions and the atomic answer/score/session/order submission transaction.
`app/static/js/orders/order-status-utils.js` owns shared display labels; CLS,
Doctor and psychologist consume the same statuses. Order-scoped result reads
live in the existing order blueprint; Xem kết quả opens the shared
`patient-survey.html?review_order_id=<id>` renderer in read-only mode.
`app/modules/orders/services/survey_draft.py` owns partial answer validation,
session snapshots and revision-based draft writes. Patient autosave uses
token-scoped `/api/survey-sessions/draft`; physician review polls the authorized
order result endpoint every three seconds until closure. Draft data belongs
to SurveySession, not SurveyResponse; only final submission creates a result.
CLS detail is a single view: `loadOrderDetail` loads survey content directly,
with no Bootstrap detail-tab state/listeners. Overview actions are owned by
`renderSurveyActions`; the list's two status tabs remain separate filters.
The same service owns result availability, manual finish and deadline expiry.
The order blueprint reconciles deadlines on workflow API requests; the query
service returns two-tab counts and the next expiry for a one-shot UI refresh.

## Frontend Structure

- Each operational page is a Jinja template with its own JS file.
- Shared user feedback is owned by `app/static/js/shared/user-feedback.js`, loaded through `app/templates/partials/user-feedback-runtime.html`, styled by `app/static/css/shared/feedback-tokens.css`, and guarded by `scripts/check_user_feedback_contract.py`. Page/workflow wrappers are adapters only; they do not own toast DOM or rendering.
- Common auth retry/header behavior lives in `app/static/js/utils.js`.
- Realtime frontend lives in `app/static/js/realtime-client.js` and `app/static/js/realtime-page-hooks.js`. The app header loader starts the websocket client for top-level workspace pages; workspace parent forwards realtime events into iframe tabs. Legacy standalone pages that do not mount the shared header, such as `chi-tieu.html`, include/start the realtime client directly. Pages register small reload hooks by event type and keep workflow state ownership local; doctor/TLG hooks refresh lists/side panels and avoid reloading the active clinical form.
- Shared header command surfaces live in `app/static/templates/app-header/header.html`, `app/static/js/app-header-loader.js`, and `app/static/css/components/app-header.css`. Header notification center uses backend inbox API `app/api/notification.py`, persistent notification creation/query logic in `app/services/notification_service.py`, and realtime delivery via `notification.changed` from `app/realtime/events.py`. Header global search uses `app/api/global_search.py` at `/api/global-search` and is patient-first: it returns a `patients` group and a `history` group for the selected patient, with backend-owned action metadata only on patient rows. Receptionist/admin use the explicit `Sao chép vào form` action; doctor/psychologist use the explicit `Xem lịch sử` action through `window.QLPKGlobalSearchActions`. Do not add page-local notification dropdowns or local patient search boxes.
- Menu permission filtering lives in `app/static/js/permission-check.js`.
- DRY sidebar template lives in `app/static/templates/dry-sidebar/sidebar.html` and is loaded by `sidebar-dry-loader.js`.
- Shared modal/components exist under `app/templates/partials`, `app/static/templates`, and `app/static/js/components`.

## Core Clinical Flow

1. Reception creates or updates a `Patient` and `Appointment`.
2. Confirmed appointments create or link an `Examination`.
3. Doctor/psychologist screens load an appointment, patient, examination, detail sections, prescriptions, services, and orders.
4. Doctor uses its explicit global manual-save transaction for `PUT /api/appointments/<id>`, scoped detail writes, and dirty support modules; psychologist persistence follows its own workflow contract.
5. Completed clinical work moves the examination toward payment via `/examinations/<id>/transfer-to-payment`.
6. Payment confirmation updates payment/examination state.

## Important Couplings

- `app/modules/appointments/services/query_service.py` owns `GET /api/appointments/` list query/filter/pagination behavior and `GET /api/appointments/stats` read stats while the route keeps the legacy URL/auth/response wrapper.
- `app/modules/appointments/view_models/appointment_response.py` shapes appointment API response data consumed by several frontend pages; `app/services/appointment_*` and `app/utils/appointment_helpers.py` keep legacy wrapper imports.
- `app/api/appointment.py` updates `appointments`, `patients`, `examinations`, and selected `examination_details` fields through appointment module services; create appointment lives in `creation_service.py`; batch import lives in `import_service.py`; re-examination direct API and prescription helpers live in `re_examination_service.py`; deletion/cancel lifecycle lives in `deletion_service.py`; status transition mutations live in `status_transition_service.py`; calendar sync, calendar create for legacy re-examination flows, transfer-to-doctor calendar sync, update side-effect orchestration, and appointment reminder scheduling now live in `side_effects.py`, while the route keeps a thin compatibility wrapper for legacy calendar callers.
- Receptionist frontend helpers: `appointment-submit.js`, `service-package-selection.js`, `appointment-prefill.js`, `appointment-date-highlight.js`, `appointment-list-controls.js`, `page-session-bootstrap.js`, `page-core-utils.js`, `formatters.js`, document attachment helpers, medical info helpers, profile autocomplete, duplicate patient modal, ICD legacy multiselect, queue/print, form data/reset/bootstrap/input/save controls, personal-detail controls, patient populate/address/vitals/history, catalog loaders, relatives table, and joint-exam orchestration. `app/static/js/receptionist-new.js` remains the legacy orchestrator and keeps global UI behavior.
- Receptionist quick patient search cleanup: old `app/static/js/receptionist/patient-search.js` and the left-side quick-search DOM were removed from runtime on 2026-06-16. Do not restore a local patient search panel; patient lookup/copy now goes through shared `qlpkGlobalSearchInput` and the receptionist `QLPKGlobalSearchActions` bridge in `app/static/js/receptionist-new.js`.
- `app/utils/examination_utils.py` maps old generic sections to doctor/psychologist-specific section names.
- `doctor-examination.js` has stateful caches, load tokens, and patient-switch lifecycle; stale state bugs usually originate there.

## Organization Direction

- Move toward domain/workflow-first structure gradually: prescriptions, appointments, examinations, orders, payments, surveys.
- Start with module islands and view models/services before moving templates/static assets.
- Keep old URLs and template paths stable until a workflow-specific smoke check proves the move is safe.
- Do not treat the target tree as a command to move everything at once; it is a migration roadmap.

## Runtime Boundary And Cleanup (2026-08-23)

- Active frontend entrypoints remain the Jinja page templates and their page
  orchestrators: `doctor-examination.js`, `psychologist-examination.js`,
  `receptionist-new.js`, `order-management.js`, and the explicitly loaded
  shared components listed by each template. The active orders frontend
  boundary is intentionally small: status, selection-state, and autocomplete
  helpers are loaded where needed; catalog/tree/performer/print orchestration
  stays with the page owners until a separate contract justifies extraction.
- Retired dead code removed after caller/static-reference audit on 2026-08-23:
  the unused component/order helper cluster under
  `app/static/js/components/` and `app/static/js/orders/`, the legacy
  `notes-attachment-chip.js` and `reexam-calendar.js`, their unused CSS, the
  old global `style.css`, and the detached dry re-examination-calendar
  template. These files had no active template link, import, route, or runtime
  caller; historical notes may still mention them as former owners.
- Compatibility wrappers are not dead code. Keep the appointment service
  wrappers, prescription public/view-model wrappers, and old orders API
  wrappers until their import-path migration has a dedicated contract and
  smoke check. They delegate to the canonical module owners and must not gain
  new logic.
- `_archive/`, `backups/`, `uploads/`, `data/`, `tmp/`, `designs/`, and
  `output/` are retained intentionally as operational/archive boundaries;
  cleanup does not delete them. The same applies to the currently loaded
  Doctor module set and shared patient-history bridges.
- New extraction rule: create a helper/module only when it has a distinct
  lifecycle or contract owner, or is consumed by at least two active workflow
  owners. A small function that has one caller stays next to that caller;
  every extracted module must be listed in this map and in its workflow module
  context. Do not keep a compatibility wrapper for a file that has no active
  caller.
