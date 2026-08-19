# QLPK Architecture Map

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
- Doctor examination: `app/static/js/doctor-examination.js` is the high-risk stateful page orchestrator for appointment/examination/detail/prescription/services APIs. Its active Doctor-private modules are listed in `references/doctor-examination-context.md`; prescription state remains owned only by `prescription-ui.js`, while `prescription-model.js`, `prescription-row-renderer.js`, and `prescription-history-ui.js` are stateless helpers. Draft recovery is device-local IndexedDB only, canonical server data remains DB-first, and restore is explicit. Doctor persistence is a manual global-save transaction; do not infer that the Doctor screen uses the psychologist or legacy autosave policy. Shared components and shared order helpers remain separate owners. The reusable patient search/history modal lifecycle is owned by `components/patient-history-modal.js`, not by this page orchestrator.
- Psychologist examination: `app/static/js/psychologist-examination.js`, same `examination_details` storage with psychologist section mapping. Page-specific pure helpers now live under `app/static/js/psychologist-examination/` for core formatting/status helpers, while shared components/orders helpers handle the reusable shell behavior and the legacy orchestrator keeps wrapper/alias names for existing callers. Its patient search/history UI uses the same `QLPKPatientHistoryModal` instance and only supplies TLG-specific data/action adapters.
- Prescriptions: `app/modules/prescriptions/api/public.py`, `app/modules/prescriptions/api/internal.py`, `app/modules/prescriptions/services/read_service.py`, `app/modules/prescriptions/services/save_service.py`, `app/modules/prescriptions/services/re_examination_service.py`, `app/modules/prescriptions/view_models/public_prescription.py`, `app/modules/prescriptions/view_models/print_prescription.py`, `app/api/prescription.py` compatibility wrapper, `app/models/prescription.py`, verify/frontend print/modal preview/modal print/shared document assets under `app/static/js/prescriptions/` and `app/static/css/prescriptions/`, prescription UI bridge inside examination JS/templates. Module context: `references/modules/prescriptions.md`.
- Medicine/inventory: clinic stock lives in `app/api/medicine.py`, `app/models/medicine.py`, `medicine_batch.py`, `medicine_transaction.py`, and related management JS. External DAV/reference drugs live separately in `app/models/medicine_reference_catalog.py`, `app/modules/medicines/api/reference_catalog.py`, services under `app/modules/medicines/services/`, page `app/templates/medicine-reference-catalog.html`, CSS `app/static/css/medicines/reference-catalog.css`, and JS `app/static/js/medicines/reference-catalog.js`; this catalog is search/sync/detail only and does not own stock.
- Clinical orders: `app/modules/orders/api/chi_dinh.py`, `app/modules/orders/api/catalog.py`, query/mutation/file/catalog services under `app/modules/orders/services/`, view models under `app/modules/orders/view_models/`, compatibility wrappers under `app/api/chi_dinh.py` and `app/api/order_catalog.py`, `app/models/chi_dinh.py`, `app/models/order_category.py`. Module context: `references/modules/orders.md`.
- Payment: `app/api/payment_waiting.py`, `app/templates/payment-waiting.html`, `app/static/js/payment-waiting.js`.
- Surveys: `app/api/survey_*`, `app/models/survey_*`, survey template/session/response screens.
- Supporting catalogs: ICD, active ingredients, allergens, services, packages, holidays, documents, addresses, busy schedules.

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
