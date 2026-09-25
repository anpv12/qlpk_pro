# QLPK Data Contracts

## Missing receipt import price (2026-09-22)

- GET `/api/medicines/?missing_import_price=true` selects distinct medicines
  having any receipt with NULL import_price, including exhausted receipts.
  Dashboard `missing_import_price_count` uses the same scope; zero is known.
- POST `/api/medicine-batches/<id>/import-price` accepts only import_price,
  finite 0..99999999.99 with at most two decimals. Active users with inventory
  menu permission (ql-kho-thuoc / ql-thuoc, or admin's all-menu access) may
  supplement; there is no new role restriction or separate permission.
- Locks medicine then receipt, checks NULL again, rejects existing prices
  with 409. Saves receipt price and an append-only adjustment of quantity 0
  in one transaction, with actor, timestamp, new price and explanatory note.
  Existing receipts, stock, catalog sale/import prices, prescription items
  and historical transaction cost snapshots are not rewritten. Ordinary
  receipt PUT continues to reject import_price. No schema change/backfill.
- UI: summary toggles missing-price filter and clears old search; receipt
  count opens existing history modal. Only authorized NULL-price rows offer
  an inline supplement form. Saving reloads list/dashboard/receipt history.

## Receipt dispensing history filters (2026-09-21)

- GET `/api/medicine/statistics/ledger` accepts `patient_search` (normalized
  patient name) and `movement_type` (export/return/price_adjustment), applied
  with batch_id before counting, aggregates and pagination. Unknown nonempty
  movement type returns 400. Return includes legacy import rows only when
  their note identifies a prescription refund; no inferred patient linkage.
- Each row adds boolean `stock_balance_inconsistent`: both saved balances
  exist and balance_after > stock_balance_after. This is a warning, not a
  reconciliation or replacement balance. Existing quantity signs, nulls and
  all database data are unchanged.

## Visit medication ledger (2026-09-20)

- Follow-up stock snapshot migration `20260920_stock_balance_snapshot` adds
  exactly one nullable `Numeric(10,2)` column: `stock_balance_after`. No table,
  default, backfill or stock reconciliation. `balance_after` remains the receipt
  balance; `stock_balance_after` is `medicines.stock_quantity` immediately after
  that individual movement, not the sum of batches or the end of the whole save.
- Import, verified opening (zero delta), dispense, split return and repricing
  write snapshots while inventory is locked. Returns split by origin advance
  both balances per row. Repricing snapshots current locked balances without
  changing quantities. Later movements never overwrite prior snapshots.
- Allocation read/save payload adds `stock_movements` per medicine for this
  appointment, ordered by timestamp/id. `aggregate_stock` and batch allocation
  `remaining_quantity` remain CURRENT values, never historical fallbacks.
  UI distinguishes current total from post-movement receipt/total balances;
  missing snapshots say `Chưa rõ`, zero remains zero. Old stock inconsistencies
  are preserved pending separately approved reconciliation.

- Approved cutover adds five nullable columns to `medicine_transactions` only:
  `appointment_id`, UUID `operation_id`, `sale_unit_price`,
  `original_transaction_id`, `sale_amount_delta`. No new table or legacy backfill.
- Save confirms dispensing/return atomically with prescription state. `price`
  is receipt unit cost, `sale_unit_price` is the submitted validated sale price.
  Same drug in one save must have one price; nonfinite/negative/fraction beyond
  2 decimal places is rejected. Catalog price changes do not rewrite evidence.
- `export`: negative stock quantity, positive sale delta. `return`: positive
  quantity, negative sale delta at the original export's last explicitly saved
  price; links original export. `price_adjustment`: zero quantity, amount delta
  on remaining units, links original export. All rows in one save share UUID.
  Reverse-FEFO returns retain receipt cost; within a receipt latest exports return
  first. Repricing happens after quantity changes. Identical saves add no rows.
- Appointment lock serializes saves; medicine/batch locks retain stock safety.
  Existing quantity-only legacy refunds still work, with unknown monetary fields;
  null is not zero. Legacy exact notes are read fallback only; never parsed to
  infer historical patient linkage or prices for financial reporting.
  Raw legacy `price` remains intact but is not asserted to be cost; the financial
  reader exposes `unit_cost_snapshot`/cost delta only for explicit new linkage.
- GET `/api/medicine/statistics/ledger` uses movement timestamp and signed
  snapshots. Paged rows and whole-filter aggregates are separate. Unknown totals
  remain null; incomplete row counts/warnings accompany partial sums. Margin
  includes only fully traced rows. This is recorded medication revenue, NOT
  actual cash collected or total clinic net income. Existing summary/export
  endpoints retain current-prescription semantics; ledger tab hides those cards
  and does not export a misleading current-prescription spreadsheet.
- Visit history adds `medicine_transactions`, including fully returned visits
  after prescription deletion, including linked visits without an examination.
  Medication name/unit/type are current catalog labels, NOT immutable snapshots;
  medicine ID, receipt ID, costs and monetary evidence are preserved.
- Full pharmacy scope (single manufacturer-lot selection, immutable name/unit
  snapshots, ledger Excel, actual collection reconciliation) is not claimed.

## Medicine sale-price history (2026-09-15)

- `medicines.unit_price` owns the current sale price. `medicine_price_history`
  has a medicine_id FK; medicines has no reverse price-history FK.
- History stores old_price (null only at creation), new_price, changed_by,
  effective_from and nullable effective_to. Amounts are Numeric(10,2).
  Server database clock sets From on successful confirmation. The next change
  closes the previous interval at exactly its own From; the open interval has
  no End. One open interval per medicine is enforced by a partial unique index.
- GET/POST `/api/medicines/<id>/price` requires an active admin or medicine
  management group. GET returns current_price, latest revision and history
  pages of20 (`before_id` cursor). POST accepts only new_price, expected_price,
  expected_revision; row lock and both expected values reject stale/ABA writes.
  Unchanged prices do not add history. Client dates are never accepted.
- Current-price update, closing the old interval and inserting the new entry
  commit together. Ordinary PUT rejects a changed unit_price; unchanged values
  remain tolerated for compatibility. Form edits omit unit_price entirely.
- Catalog POST and Excel creation record initial price through the same writer.
  Before creation the editor stages a price; history starts only when medicine
  creation succeeds. Existing medicines retain current prices; no invented
  baseline dates or backfilled intervals. The first change records old_price.
- Before creation, `price-editor.js` reads the DAV name from `medicine-name`.
  If initialization fails before the price dialog becomes visible, it releases
  the open/loading guard and reports the error in `medicineFormError`; the
  medicine form must not remain silently blocked. Staged prices are preserved.
- History is retained: deletion of a medicine with history returns409.
  Price updates do not rewrite receipts, stock or stored prescription prices.
  History describes configured prices; reports of actual sales must use saved
  transaction/prescription prices, not recalculate old sales at current price.

## Latest receipt prices in the medicine form (2026-09-15)

- GET `/api/medicines/<id>` adds `latest_batch_pricing`: null without receipts,
  otherwise batch_id/batch_number/import_date/import_price.
- Latest means import_date DESC, created_at DESC NULLS LAST, id DESC,
  independent of remaining stock/expiry. Zero cost is retained; missing cost
  stays null, with no fallback to earlier receipts or medicine.import_price.
- Sale price remains medicine.unit_price, but the form displays it read-only.
  The dedicated price workflow below owns updates; receipt pricing does not
  expose a fake/null sale_price. Receipt cost remains read-only.

## Admin navigation và bộ lọc Lịch bận (2026-09-13)

- `auth.ALL_PERMISSIONS` là danh sách quyền menu của Admin trong login,
  refresh và `/users/me`; phải bao phủ navigation.config.js. Bổ sung
  `ql-di-nguyen`, `ql-tailieu`, `ca-nhan-phimtat`; không đổi quyền nhóm hay
  bỏ qua auth ở frontend. Header hydrate `/users/me` cập nhật phiên hiện có.
- GET `/api/doctor-busy-schedules/my-busy-schedules`: mặc định `active` giữ
  lịch chưa kết thúc; `all` lấy mọi trạng thái/lịch sử, `cancelled` lấy lịch
  đã hủy kể cả quá khứ. Luôn giới hạn `doctor_id=current_user.id`; date range
  vẫn áp dụng. UI gửi status tường minh, backend sở hữu lọc trạng thái;
  không suy ra trạng thái từ màu badge. Không đổi lịch hẹn hay ghi lịch bận.

## Doctor queue arrival (2026-09-09)

- `appointments.doctor_queue_entered_at`: nullable timestamptz, backend owns
  writes; exposed read-only by AppointmentRead/to_dict. Transfer and status
  transition services share `appointments/services/doctor_queue.py`.
- Set when entering DOCTOR_EXAM/CONCLUSION or changing receiving doctor in
  those states. Repeat same recipient/state is a no-op; normal clinical
  saves do not bump queue arrival. Transfer locks appointment rows in ID
  order; API emits/creates notifications only for changed appointment IDs.
- `GET /api/appointments/?doctor=true&examination_status=doctor_queue`
  combines DOCTOR_EXAM + CONCLUSION before pagination and sorts arrival
  descending, null last, then ID descending. Doctor fetches all pages and
  preserves this ordering; no client inference from appointment date.
- Migration `20260909_doctor_queue` backfills only from recorded transfer
  notifications addressed to the appointment's current doctor. Legacy
  rows without such evidence retain null and ID order; updated_at is not
  a substitute for transfer time.
- Socket envelopes add stable `event_id` shared across all destination
  rooms for one emit. `realtime.resynced` is a client lifecycle event after
  subscribe acknowledgement, including initial connection/reconnection.

Use this file before changing models, endpoint payloads, serializers, save/load code, or frontend field mapping.

## Ownership By Table

Prescription public read model (2026-09-09): weight, loi_dan and benh_kem_theo
come from the linked examination; comorbidity ICD resolves to display text.
No persistent fields or save mutation. BHYT, confirmed medicine recipient
and N treatment periods have no dedicated source and remain blank on paper.

Survey editor/scoring contract (2026-09-06): `grid.rows[].scores` maps stable
column IDs to per-cell numeric scores; absent maps retain legacy column-score
behavior. Missing values are not zero. `result_config` is evaluated on submit
and frozen as `survey_responses.template_snapshot.result_summary`, exposed by
response/review/session DTOs. Raw `total_scores` stays a per-group sum. Details,
formula, validation, and legacy repair: `references/modules/surveys.md`.

Survey contract follow-up (2026-09-08): before a catalog update, freeze the
previous name/content on linked sessions/responses that lack a snapshot in the
same transaction. Existing snapshots and saved answers/scores stay unchanged.
No scored answers means `result_summary` score is null (including total and
conversion), not zero; an actual zero answer still scores zero. Optional
questions may be skipped, but submission needs at least one answer and every
required question must pass validation. Numeric answer ID 0 is valid. Result
conditions may be empty for score-only templates; an added condition must have
valid thresholds. Template names are trimmed, nonempty strings of at most 255
characters across create/update/upload/duplicate.

Survey catalog contract (2026-09-08): authenticated `GET /api/survey-templates`
owns the management list, including `can_manage` and clamped `pagination.page`.
Template DTOs expose `template_kind`, `readiness`, `readiness_label`,
`readiness_message`, and `can_start_survey`; these describe software configuration,
not clinical completeness. File-only templates are documents, not online forms.
All template/criteria writers check active admin or current group permission
`ql-mau-khaosat`; reads remain available to the clinical workflow. Editor-only
condition IDs are assigned when old/API configs omit them. Blank thresholds
stay null and are invalid; changing column defaults does not overwrite row scores.

### `icd`

Owns the active ICD catalog used by diagnosis and medical-history controls.

Rules:

- `GET /api/icd/` filters by `search` in the database and returns a stable
  `icd_code` order with `skip`, `limit` and `pagination` metadata. The API
  accepts `limit` from `1..1000`; invalid pagination values return `400`.
- Shared autocomplete uses pages of 100 results (30 for an empty query), keeps
  the metadata through `loadICDPage`, and loads the next page explicitly via
  `skip`. It must never hide a result by applying a frontend `.slice()` cap.
- `loadICDData` remains an array-compatible adapter for existing hydration
  callers; its data is produced by the same page loader and carries the page
  metadata without a second search implementation.
- Accent-insensitive substring search uses the normalized SQL expression and
  the `20260831_icd_search` PostgreSQL trigram indexes. Diagnosis/history save
  still stores IDs, not display labels.

### `patients`

Owns patient identity, contact, demographics, and lifetime/background information.

Key fields include `patient_code`, `full_name`, `phone`, `date_of_birth`, `gender`, address components, `occupation`, `marital_status`, `sexual_orientation`, `religion`, `ethnicity`, `nationality`, `education_level`, `emergency_contact`, `physical_history`, `family_history`, `substance_use_history`, `allergies`, `current_medication`, `safety_plan`.

Rules:

- `physical_history` and `family_history` are JSONB hybrid arrays such as `{type: "icd", id: 45}` and `{type: "text", value: "..."}`. `physical_history` must not contain F10-F19 substance-use ICDs; those belong only to `substance_use_history`.
- `substance_use_history` is lifetime/background patient data, not per-visit clinical detail. Its canonical keys are `<substance>_used` plus `<substance>_duration` when selected, for `tobacco`, `alcohol`, `cannabis`, `cocaine`, `stimulants`, `inhalants`, `sedatives`, `hallucinogens`, `opioids`, and `other_substance`.
- `app/utils/medical_history_contract.py` owns the physical-history boundary normalization. Patient create/update paths apply it before persistence; migration `20260805_sanitize_substance_history` archived and removed existing F10-F19 overlap. Runtime must not infer, duplicate, or fallback between the two fields. The Doctor bridge and risk module are the only active FE load/collect/save path for `substance_use_history`; the suggestion module must not synchronize the substance table.
- `referral_source` belongs to patient administrative/profile data and should render in the administrative patient form on receptionist, doctor, and psychologist screens, not inside the Hỏi bệnh modal. It preserves the entered/display source text for backward compatibility.
- `referral_source_tag` is the normalized statistics tag backfilled from `referral_source` for dashboard/export grouping. The only canonical tag keys are `not_set`, `facebook`, `website`, `referral`, `medpro`, `walk_in`, and `other`; do not introduce new source tags without product approval.
- `referral_source_detail` preserves the raw/detail source text when `referral_source_tag` is normalized. Do not overwrite or discard the original `referral_source` text during tag backfills.
- Referral source writes must update `referral_source`, `referral_source_tag`, and `referral_source_detail` together from the backend mapping. Dashboard/export reads `referral_source_tag` only and must not infer or fallback from display text.
- Do not move per-visit symptoms or clinical decisions back into `patients`.

### `appointments`

Owns scheduling and administrative visit information.

Key fields include `appointment_code`, `patient_id`, `doctor_id`, `psychologist_id`, `appointment_date`, `duration_minutes`, `status`, `appointment_category`, `appointment_type`, `service_id`, `package_id`, `target_type`, `target_name`, `notes`, soft-delete fields.

Rules:

- `appointment.notes` is administrative/general scheduling note text.
- Do not use `appointment.notes` as clinical advice or doctor instruction.
- Re-examination metadata must be consistent: any appointment with `original_appointment_id` is a `RE_EXAMINATION`, must keep the source `original_appointment_id`, and must carry a valid `service_id` or `package_id`. Backend create/update normalizes this contract from the original appointment when the frontend payload is incomplete. A `NEW` appointment must not keep stale generated re-examination notes or source IDs.
- A receptionist checkbox or user-facing “bệnh nhân tái khám” label is not enough to make an appointment a technical `RE_EXAMINATION`. Without `original_appointment_id`, save it as a normal `NEW` appointment so creating/editing a returning patient appointment does not require a source visit.

### `appointment_services`

Owns the selected accompanying service rows for one appointment, including the
catalog-derived service identity/name, unit price, quantity, duration, and
financial adjustments. The selected row is not a prescription row and must not
be inferred from its display label.

Rules:

- `GET /services/appointment/<appointment_id>` and `PUT /services/appointment/<appointment_id>/sync` are the canonical read/write contract for the selected rows.
- `app/modules/appointments/services/appointment_service_selection.py` is the one mutation/calculation owner for every `appointment_services` writer. The payment-facing legacy routes under `/api/examination-detail/<examination_id>/services` must call it, not recreate price or tax logic.
- A Doctor/reception sync selects catalog rows and may change only `quantity` and `note`: a new row receives the active catalog's name, price, and duration; an existing row keeps its persisted financial snapshot. Client `unit_price`, `price`, `amount`, discount, tax, duration, and display name are never a Doctor pricing authority.
- Finance overrides are available only to `admin` or `staff` through the finance-facing update flow. The server validates quantity as a positive integer, discount/tax within `0..100`, and derives `subtotal`, discount, VAT, and `total_amount` using `(unit_price * quantity - discount) + VAT after discount`.
- A selected row cannot be reassigned to a different `service_id`; remove it and add a new catalog row instead. A row cannot mutate once any linked examination has `payment_status=PAID` or legacy `status=PAID`.
- `GET /services/` without pagination query parameters keeps its legacy array response for existing catalog consumers.
- `GET /services/?page=<positive-int>&per_page=<positive-int>` is a paged catalog read: it returns `{ "services": [...], "pagination": { "page", "per_page", "total", "pages" } }`; server clamps `per_page` to `1..100` and clamps an out-of-range page to the final available page.
- Pagination is catalog presentation state only. It must not change appointment-service payloads, dirty/save ownership, or the patient-switch clear contract.

### `family_members` and `appointment_relatives`

`family_members` owns the patient-profile relationship row shown in the receptionist `Người thân liên kết` table. `appointment_relatives` owns the visit-specific companion row shown in `Người đi khám cùng` for one appointment.

Rules:

- When a companion row creates or links `appointment_relatives.family_member_id`, the shared identity/contact fields are owned by `family_members`: `name`, `kinship`, `id_number`, `phone`, and `emergency_contact`.
- Editing those shared fields from the `Người thân liên kết` table must update `family_members` and synchronize any linked `appointment_relatives` rows with the same `family_member_id`/`patient_id`.
- Do not let `family_members` and linked `appointment_relatives` become two independent truths for the same person. Visit-only fields stay on `appointment_relatives`; profile relationship fields stay on `family_members`.

### `examinations`

Owns per-visit clinical state and clinical data.

Key fields include `examination_code`, `appointment_id`, `patient_id`, `doctor_id`, `examination_date`, `examination_type`, `status`, `main_reason`, `main_symptoms`, `diagnosis`, `benh_kem_theo`, `treatment_plan`, `loi_dan`, `current_medications`, `risk_assessment`, vitals, payment fields.

Rules:

- `examinations.loi_dan` is clinical advice/instruction. Keep it separate from `appointment.notes`.
- `diagnosis` and `benh_kem_theo` are stored as ICD IDs in newer flows, with helper resolution for display.
- Read/display APIs must return display text in `diagnosis` / `benh_kem_theo` and raw ICD IDs in `diagnosis_ids` / `benh_kem_theo_ids` when the caller may need to reload ICD controls.
- Edit controls should prefer the `*_ids` fields and only parse display text as backward-compatible fallback.
- `risk_assessment` is per-visit and belongs here, not in `patients`.
- `risk_assessment` is stored as JSONB with one canonical shape:
  `{schema_version, suicide_history: [{code, note}], assessment: {ideation, plan, intent, self_harm, level}}`.
  Each assessment answer is `{value: "co"|"khong", note}`. Empty data is an empty object with the same schema version;
  the former `[TSH]`/`[ĐGN]` text is migration-only input, not a runtime contract.
- Vitals are per-visit and belong here.
- `examinations.main_symptoms` is the only per-visit owner for `Triệu chứng chính`. The retired `examinations.symptoms`, `examinations.prescription`, and `examinations.notes` columns were archived and removed by the Doctor cleanup migration; no runtime fallback may recreate or read them.
- `main_reason` is the intake reason reported by the patient/receptionist. It
  is not the same field as the doctor or psychologist's subsequently explored
  reason; those belong to their role-specific `examination_details` sections.

### `examination_details`

Owns flexible section/field/value data for examination forms and modals.

Rules:

- Always store details under the correct `section`.
- Use `app/utils/examination_utils.py` for old-to-new section mapping.
- Do not save canonical fields here when they have a dedicated owner. For example, `loi_dan` belongs in `examinations.loi_dan`, allergies belong in `patients.allergies`, and appointment notes belong in `appointments.notes`.

Common section names:

- Doctor form: `bac_si_kham_form_kham`.
- Psychologist form: `tam_ly_gia_kham_form_kham`.
- Doctor history: `bac_si_kham_tien_su`.
- Doctor general exam: `bac_si_kham_kham_tong_quat`.
- Doctor mental exam: `bac_si_kham_kham_tam_than`.
- Doctor lab tests: `bac_si_kham_xet_nghiem`.
- Psychologist equivalents use the `tam_ly_gia_...` prefix.

Reason ownership is intentionally role-specific:

- `examinations.main_reason`: intake reason from reception/patient statement.
- `examination_details.bac_si_kham_form_kham.main_reason`: reason uncovered by
  the doctor during the medical examination.
- `examination_details.tam_ly_gia_kham_form_kham.main_reason`: deeper reason
  uncovered by the psychologist.

Frontend screens must render and submit these controls independently. A Doctor
save must not send its role-specific reason through the appointment `main_reason`
payload, and a psychologist save must not overwrite the Doctor section.
- Only the canonical role-prefixed sections listed above are active. The retired unprefixed section aliases are not read, written, or inferred by runtime code.
- `(examination_id, section, field_name)` is unique. A detail save must upsert that exact owner row;
  duplicate rows are archived to `legacy_database_archive` before cleanup.

### Doctor appointment medical-history response

`GET /api/appointments/<id>` and the Doctor edit payload expose history through one
canonical `medical_history` object:

```json
{
  "patient": {
    "id": 1,
    "physical_history": [],
    "family_history": [],
    "allergies": [
      {"name": "đậu phộng", "level": "nghi_ngo", "symptom": ""}
    ],
    "substance_use_history": {},
    "safety_plan": {}
  },
  "examination": {"risk_assessment": {}},
  "previous_examination": {"risk_assessment": {}}
}
```

History is loaded, cleared, serialized, and saved by the shared
`QLPKMedicalHistoryForm`; `QLPKDoctorMedicalHistoryBridge` only adapts the
Doctor `medical_history` envelope and page lifecycle. The retired top-level history aliases and
history fields duplicated inside the generic `patient`/`examination` payload
are not part of the active Doctor contract.

### Clinic Medicine Inventory

DAV-linked clinic catalog (2026-09-12):

- Requested mapping policy, clarified 2026-09-14: select DAV by medicine
  name/brand + ingredient, then load catalog-owned fields from that source.
  Old strength/package/manufacturer field differences are not matching vetoes.
  Read-only re-audit is in `reports/dav-migration-2026-09-14/reaudit-name-ingredient.md`.
  Stage2 removes package-conflict vetoes and blank-source identity fallbacks.
  Clinic unit/conversion remains separate and unchanged. Local data is now
  27 linked/24 unlinked; applied evidence and pending actions are in
  `reports/dav-migration-2026-09-14/stage-2/report.md`. The earlier blanket
  requirement for manufacturer/registration evidence on all41 is superseded.

- Mapping defaults (2026-09-13): `catalog_mapping.clinic_defaults` owns
  DAV → clinic suggestions. Lookup now projects `route` and returns
  `clinic_defaults` (administration_method/is_imported/unit/packaging_unit/
  units_per_box). Vietnam/VN/VNM → domestic; known other country → imported;
  absent/unknown country stays blank in UI. Actual DB `is_imported` is NOT NULL:
  creation requires explicit boolean if the source cannot classify it.
  Creation uses source country and defaults a missing route when it fits the
  existing 50-character field; it never truncates the source route.
- Partial defaults (2026-09-14): `suggested_administration_method` is separate
  from DAV's explicit route. An exact, unambiguous dosage-form allowlist can
  suggest Tiêm/Uống/Truyền when route is absent; frontend fills both route
  inputs but keeps that suggestion editable. Existing source locks and
  migration settings continue to depend on the explicit route only.
  Outer packaging is suggested independently of conversion; liquid forms
  with explicit ml packaging suggest ml. Only a single-container, fixed
  positive integer volume supplies a ratio; ranges/fractions/nested liquid
  packaging leave it blank. No rounding, inferred injection site or stock write.
  FDG QLĐB1-H07-19: Tiêm (editable), ml, lọ, ratio blank; preserve the full
  source packaging `Lọ 15,8-16ml` beside the clinic conversion display.
  Reset/change/edit clear and reload that source text; it is not submitted as
  the clinic's packaging conversion. Placeholder10 was removed.
- Central DAV route owner (updated2026-09-15): `reference_route.suggest_reference_route`
  owns the dosage-form allowlist and full-description patterns. Sync and the
  backfill writer persist its result in `suggested_route` plus the internal
  `suggested_route_rule_version` (currently2026-09-14.2). Model serialization, list/detail/
  autocomplete return `suggested_route` separately from unchanged `route`;
  `clinic_defaults.suggested_administration_method` reads that stored value.
  Readers do not recompute it or silently fall back to inference. Sync updates
  or clears both derived columns when the dosage form/route changes. Explicit route
  suppresses suggestions. Ambiguous/mixed forms, plain tablets/capsules and
  unnamed injection sites are not guessed. DAV detail labels inferred values
  `Đường dùng (gợi ý)`; source summary does likewise. New-form suggestions
  remain editable; existing clinic medicines are not automatically rewritten.
  The DAV Excel export continues to export the original route field.
  `20260915_dav_stored_route` adds the nullable columns; local backfill stored
  15432 values, leaving39320 empty. Original route/raw and all clinic data
  remain unchanged. Backfill preserves updated_at and source/review snapshots;
  inference is not promoted to DAV authority or a human product confirmation.
  Evidence: `reports/dav-stored-route-2026-09-15/`.
- Expanded route suggestions (2026-09-14): full-match equivalent preparation
  wording after accent/case/whitespace normalization. Enteric, chewable and
  orally disintegrating forms suggest oral use; plain tablets/capsules/film
  coating alone remain unknown. Injection sites require explicit wording in
  the form. Distinguish eye drops/eye ointment, external/skin/transdermal use,
  suppositories/enemas and inhalation/oral use. Mixed routes, solvents and
  unrecognized suffixes are not reduced to the first recognized phrase;
  multiple matching route groups produce no suggestion. Read-only coverage:
  15432/54752 (28.19%), up5281 from10151;39320 remain without a suggestion,
  including7674 blank/placeholder forms. Form-level evidence is in
  `reports/dav-route-coverage-2026-09-14/`. This is rule coverage, not clinical
  validation or migration of clinic stock; source route/raw remain unchanged.
- Count conversion suggestions only accept whole, unambiguous patterns:
  e.g. Hộp 3 vỉ × 10 viên → unit viên, packaging_unit hộp, units_per_box30.
  Tablet/capsule forms suggest viên; miếng dán suggests miếng. Liquid partial
  defaults follow the rule above. Alternate package sizes/accessories/unknown
  formats still require confirmation of the missing conversion.
  Unit/ratio suggestions are applied only to new forms and require a UI
  confirmation tied to current unit/package/count values. Switching sources
  clears suggestions/confirmation/errors; internal migration preserves settings.
  Save/Excel keep explicit clinic units/ratios; backend never silently parses
  packaging into inventory quantities. Canonical clinic packaging text is
  `1 {packaging_unit} = {units_per_box} {unit}`, separate from DAV snapshot.
  DAV details now show original dosage form/packaging/manufacturer/SĐK in
  the selected-source summary. No schema or existing stock migration.
- `medicines.reference_catalog_id` is a nullable FK with a unique constraint:
  one clinic medicine per DAV reference. Legacy rows remain null until the
  implementation team migrates them; users cannot map these rows. Migration
  never merges medicines or silently assigns a second source to evade uniqueness.
  Reviewed aliases and tie-break evidence are explicit in each manifest;
  the 2026-09-14 stages applied10+17 links locally;24 remain with action notes.
- `scripts/migrate_clinic_medicines_to_dav.py` consumes explicit reviewed
  manifests; read-only by default. Database identity, full row fingerprints,
  source availability, registration, uniqueness, current version and writer
  guards must pass. Apply requires a verified database dump and a new private
  before/after journal. Clinic settings, all receipts/transactions/prescription
  rows are checked for preservation in the transaction and after commit.
- POST requires an active, non-expired, non-deleted, non-withdrawn DAV row.
  Backend copies name, active ingredient, strength and manufacturer country;
  caller-supplied conflicting identity is rejected. Clinic settings (unit,
  package conversion, price, internal code, prescription type, warnings) remain
  clinic-owned. `category_type` only accepts DRUG for new writes; the category
  selector/filter and the old Excel mappings were removed. Historical other
  categories remain unchanged; additional receipts are blocked until verified.
- PUT only edits clinic settings: it cannot rename identity, link, relink,
  unlink or refresh the source. `write_clinic_medicine` enforces this by default;
  `allow_reference_mapping=True` is a trusted Python-only keyword for internal
  migration or the dedicated authorized human-review endpoint, never a JSON
  option. Same unchanged reference ID is
  tolerated for older edit clients, but mapping confirmation fields are rejected.
- Internal migration (including refreshing the same DAV row) requires
  `reference_link_confirmed=true`, an exact current/old DAV registration number
  (`reference_registration_number`) and the medicine's preview timestamp
  (`reference_medicine_version`); relinking an existing source also requires
  `reference_version`. The writer rejects stale previews. Different source
  packaging does not block mapping; inventory unit/conversion stays unchanged.
  A quantity alone in the ingredient field is rejected as malformed source data.
  Blank DAV identity fields replace legacy values, matching the snapshot;
  the preview and writer use the same rules. Source route/unknown country
  classification only replace clinic settings when source data is known.
  It preserves medicine ID, stock, receipts, price, conversion and prescription
  snapshots. Known source route/country classification update with the source;
  missing route leaves the clinic setting intact. Mixed mapping/settings payloads
  are rejected. With stock/receipt/transaction history, conflicting or missing
  ingredient/strength/dosage-form values against the prior source block relinking.
  `reference_snapshot.mapping_history` records prior links/identities and actor/time.
  Exception: GET/POST `/api/medicines/<id>/reference-review` permits explicit
  human correction after inventory permission checks (active admin or group
  `ql-kho-thuoc`/`ql-thuoc`). POST requires all five preview/confirmation fields;
  human review can correct a prior clinical mismatch, but retains availability,
  malformed-source, registration, uniqueness and version guards. No clinic
  settings may be written in this request. `reference_snapshot.human_review`
  records reviewed_by/reviewed_at; history retains prior review metadata.
  Creating a medicine (form POST or Excel) also records `human_review` with
  the creator: the closed DAV-only flow already forces an explicit source
  choice, so new medicines are `confirmed` without a second review. The
  review UI has no acknowledgement checkbox (removed 2026-09-17); the single
  confirm button submits `reference_link_confirmed: true`, which stays a
  required API field.
  Explicit acceptance of prior migration results may instead be recorded as
  `reference_snapshot.mapping_acceptance` (accepted_at, request provenance,
  reference_catalog_id), without inventing an authenticated reviewer or a
  physical medicine inspection. This also yields confirmed while the source
  remains unchanged/available. Remapping archives this marker in mapping_history
  and drops it from the current snapshot. On 2026-09-14 the user requested this
  for prior mappings:26 pending accepted,1 already manually confirmed preserved.
  Read-only `reference_review_status` is unlinked/pending/confirmed/stale;
  existing migration snapshots without human_review are pending, with no bulk
  DB rewrite. Source identity/availability changes require fresh review. The
  preview shows the earliest pre-mapping identity from history for comparison.
  Source route and country classification are protected from ordinary edits when
  present in the selected snapshot. `catalog_locked_fields` communicates these
  locks; `conversion_locked` covers stock, receipts and transaction history.
  Catalog validation exposes business copy as `user_message`; the form must not
  render raw exception/error text from unexpected responses.
- `reference_snapshot.identity` retains the selected source values. DAV sync
  only changes the reference catalog. Responses expose `reference_status`
  (unlinked/linked/review_required), the selected identity and current source;
  upstream identity/status changes require review, never automatic rewriting.
- Form and Excel use `catalog_service.write_clinic_medicine`. Excel requires
  `Mã nguồn DAV` (DAV source_id) and `Đơn vị dùng`; only defined clinic setting
  columns are accepted. Unknown/free-name/stock/cost columns reject the file.
- `DELETE /api/medicines/<id>` (2026-09-17, fixed): blocks only on real usage,
  checked in order: `prescription_items.medicine_id` (đã kê đơn) then
  `medicine_transactions.medicine_id` (đã có giao dịch kho, bao gồm mọi lô
  nhập vì mỗi lô luôn kèm một transaction `import`). Each reason returns its
  own 409 message, not one generic string. A medicine with only a price
  history row (every medicine gets one automatically at creation via
  `record_price`) is not real usage; its `medicine_price_history` rows are
  deleted together with the medicine so the DB FK (`ON DELETE RESTRICT`)
  does not block a genuinely unused medicine. Used medicines keep their
  price history untouched because the earlier checks already blocked delete.
  Each row has a savepoint so a bad/duplicate row cannot roll back earlier
  successful rows while reporting them as imported. `catalog_excel` owns the
  workbook and the authenticated `/api/medicines/import-template` download.
- Form selection stays owned by `medicines/clinic-catalog.js`: debounced DAV
  autocomplete loads immediately on empty focus, filters on input using the
  existing paged GET, appends on scroll, and selects
  by source ID/version. Editing the search alone never creates a medicine.
  As of 2026-09-14 the user form has only create/edit modes. The source column,
  linked/unlinked filter, mapping preview, actions and save lifecycle are removed.
  Edit waits for the latest medicine GET, with stale load/stock callbacks
  invalidated. It never opens DAV search or sends source identity/reference fields.
  Changing a new selection clears its ID/defaults/confirmation. Blur/close/query
  changes invalidate requests; form lifecycle guards reject late save responses.
  Source preview/query helpers remain available for internal data reconciliation.
  The four-group form stays visible, disabled until a source is selected for
  creation. Stock/cost/expiry remain read-only; quantities enter through receipts.
  User subsequently authorized the supplied reference UI: header icon/title/copy,
  a separate DAV search surface, a two-by-two section grid with tinted headers,
  and footer actions. At narrow widths sections stack; field grids adapt to
  their own section width. Modal body owns scrolling under fixed header/footer.
  DAV autocomplete uses the shared autocomplete component and lifecycle.
- `GET /api/medicine-reference-catalog?mode=autocomplete` returns only
  `success/data/page/per_page/has_more`: no total count or catalog summary.
  It reads one extra row and projects identity/version/display fields only;
  default mode retains its full pagination/summary contract. Both share the
  same active/expiry/withdrawal/search filters and require authentication.
  The form caches at most 20 pages for 30 seconds in memory, scoped by token;
  reset and inventory events clear the cache. Save still validates the source
  version and uniqueness against the database.
- Default catalog list accepts `include_summary=0` to skip the five dashboard
  aggregates while keeping accurate total/page counts; `summary` is null in
  this mode. The DAV screen requests summary initially and after DAV sync or
  inventory notifications, then skips it while searching/paging. List requests
  are aborted on superseding input, deduplicated while pending, and time out
  after 15 seconds with an explicit retry state.
- Unit/package conversion cannot change after receipts exist. Catalog expiry
  writes are rejected; the legacy expiry field is displayed disabled.
- Migrations `20260912_medicine_dav_link` and `20260912_dav_prescription_text`
  preserve full DAV text (clinic name500, ingredient/strength Text; prescription
  name500/strength Text). No clinical stock/save event timing was changed.

- Retired 2026-09-12: the Tủ thuốc `Lập báo cáo` modal and its dedicated
  `GET /api/medicines/reports/<report_type>` and
  `GET /api/medicines/reports/<report_type>/export/excel` routes were removed.
  The separate `Xuất dữ liệu` Excel/PDF flow and medicine statistics APIs remain.
- Retired 2026-09-12: manual inventory count UI, both POST routes
  `/api/medicines/inventory-count` and `/api/medicine-batches/inventory-count`,
  and `adjust_batch` were removed. Historical adjustment movements and the
  verified opening-balance registration tool remain; no automatic balancing.

`medicines` is the clinic drug catalog. `medicine_batches.remaining_quantity`
owns each lot balance, while `medicines.stock_quantity` is a materialized
aggregate kept for existing readers.

Rules:

- Creating or editing a medicine never writes `stock_quantity`; a new catalog
  row starts at zero. Inventory enters only through a lot import.
- Creating a lot sets `quantity` and `remaining_quantity` to the imported
  quantity, locks the medicine aggregate, and appends one `import` movement
  with `batch_id` in the same transaction. Import-order rows are validated as
  one atomic request; invalid rows are not silently skipped. Inventory write
  quantities accept at most two decimal places, matching the aggregate and
  ledger precision.
- Lot `quantity` and `remaining_quantity` are not writable through the batch
  metadata `PUT`. There is no manual actual-quantity adjustment endpoint.
- Direct `POST /api/medicine-transactions/` is rejected. Movement rows are
  produced by lot import, verified opening-balance registration, or the
  prescription stock service. A receipt with movement history or a positive
  remaining balance cannot be deleted.
- Excel catalog import creates medicines at zero. Any positive stock column is
  rejected with a message directing the user to import a lot; this phase does
  not backfill or reconcile legacy rows whose aggregate and lot totals differ.
- `app/modules/medicines/services/inventory_service.py` is the canonical owner
  for lot import and verified opening-balance registration. Existing readers may continue to use
  `medicines.stock_quantity` until the later read-only reconciliation phase.

Receipt contract (2026-09-10):

- Each `medicine_batches.id` represents one receipt line / verified opening
  balance. `batch_number` is the manufacturer's lot, no longer globally unique.
  Repeated receipts of the same medicine/lot are separate rows with their own
  quantity, cost, date and invoice; the expiry must agree. Existing IDs and
  prescription movement links are preserved. `receipt_reference` (`NK-<id>`)
  identifies a line, not a supplier invoice or an entire multi-line order.
- `GET /api/medicine-batches/` optionally accepts `search` (matches medicine
  name or `batch_number`, joined via `Medicine`) and `sort=recent` (orders by
  `created_at`/`id` desc instead of the default FEFO `expiry_date`/
  `import_date`). Both are additive read filters for the merged "Lịch sử
  nhập & lô" panel in the clinic UI and do not change write paths, stock
  math, or the default FEFO order used by other callers.
- New imports require the actual lot number and a finite non-negative unit
  cost, at most two decimal places. An explicit zero is allowed; blank is not
  converted to zero. No automatic LOT number. Direct remaining-quantity input
  is rejected. Catalog POST/PUT and Excel cannot write `import_price`; historical
  catalog costs remain stored for legacy readers, not as new receipt costs.
- Batch metadata PUT rejects medicine/lot identity, import/expiry date, price,
  supplier and invoice fields, including unchanged values. Only notes remain
  editable there. Direct quantity changes are rejected.
- `medicine_transactions.balance_after` snapshots each future receipt balance
  after import, prescription export/refund, or verified opening registration.
  Legacy rows remain null. New prescription movements store the receipt's
  `import_price` as unit cost (null when missing); no historical repricing.
- Lot summary returns unit, distinct lots/receipt count, known stock value,
  missing-cost quantity, aggregate stock and its difference from receipt stock.
  Full `stock_value` is null when any remaining quantity lacks a price.
  Ledger GET supports exact `batch_id` and page/per_page (max 100), ordered by
  timestamp then ID. UI retains unknown legacy costs/balances as unknown.
- Local migration: `20260910_inventory_receipts`. Audit tool additionally
  writes `receipt-costs-to-verify.csv`; no automatic reconciliation/backfill.

Confirmed target rule (2026-09-12; dispensing implementation pending): each
medicine being dispensed must come from one manufacturer's lot. Multiple
receipt rows of that same medicine/lot may contribute, preserving their own
costs and movement links. This does not permit combining different physical
lots to satisfy a quantity. Current prescription-save FEFO can still cross
lots; no new dispensing entity or selected-lot validation has been implemented.

### Prescriptions

`prescriptions` owns prescription headers. `prescription_items` owns medicine rows. The database column remains numeric for legacy rows, but new dispensing quantities are whole units; dose fractions belong in the usage schedule JSON.

Rules:

- Keep prescription usage instructions in prescription tables, not in appointment notes.
- New prescription quantities are normalized with ceiling rounding before price calculation, stock validation, inventory ledger writes, and `prescription_items` creation. For example, `7.5` becomes `8`; `1/2` or `1/3` remains valid only in the dose schedule/usage note.
- In the active Doctor editor, blank `medicine_days` means an effective 1 day for derived quantity and line/overall amount calculation; entering `N` multiplies the daily dose by `N`, and clearing it returns to the one-day result. Initial load, draft restore, and history reuse with blank legacy `medicine_days` preserve persisted `prescription_items.quantity` until a user actively selects a medicine or changes dose, mode, or days. This is a frontend lifecycle contract only and does not change the save payload or database schema.
- When changing prescription UI, verify both save and reload paths.
- In-clinic prescription rows must use `prescription_items.medicine_id` / selected payload `medicine_id` as the stock identity. `medicine_name` is only the display/snapshot text stored on `prescription_items`; do not validate, deduct inventory, reload history, or group stock reports by exact medicine name.
- Old prescription items are historical snapshots. When applying an old prescription, any in-clinic row that has no usable current `medicine_id` or points to missing/deleted stock must be shown to the user for manual mapping to a current `medicines.id`; do not silently backfill or remap by name/active ingredient. Current-stock shortage is not a mapping failure: keep the existing `medicine_id` and let save/stock validation block or a dedicated replacement flow handle it.
- `prescription_items` is the only owner of the quantity currently saved/dispensed for an appointment. A save aggregates current in-clinic items by `medicine_id`, compares them with the normalized request, and processes the sorted union of old/new medicine ids. Do not reconstruct the prescribed quantity or inventory balance from `medicine_transactions`, transaction notes, or medicine names.
- `medicine_batches.remaining_quantity` owns the current balance of each lot. Prescription dispensing uses only positive, non-expired lots ordered by expiry date, import date, then id (FEFO). `medicines.stock_quantity` remains the aggregate inventory owner. A newly tracked issue/refund moves aggregate and exact lot balances together; the legacy-refund exception below moves only aggregate stock because no historical lot identity exists.
- `medicine_transactions` is append-only inventory movement. New rows use the approved visit ledger above; old rows retain exact-note fallback. This evidence never replaces `prescription_items` as saved quantity owner or `medicine_batches.remaining_quantity` as batch balance owner.
- Prescription save locks the stable `appointments` aggregate row before reading current items, then locks each affected `medicines` row and its `medicine_batches` in deterministic medicine/FEFO order. Headers/items, aggregate stock, lot balances, and movement rows commit or rollback together. Repeated identical saves have delta `0`; increases allocate only the extra quantity. A decrease refunds the tracked portion first to its exact lots in reverse-FEFO order, then refunds any remaining legacy portion only to aggregate stock. Concurrent saves for one appointment serialize and different appointments cannot oversell shared aggregate or valid-lot stock.
- Prescription save must not require aggregate stock to equal the sum of lot balances: old saves legitimately reduced only aggregate stock. For a new issue, usable quantity is the lower of aggregate stock and positive non-expired lot stock, so an existing difference is preserved and never reconciled silently. Negative aggregate/lot stock, missing tracked lots, invalid tracked allocations, or shortage must fail the entire save with a user-readable error.
- Legacy prescription quantities without batch-linked movements remain readable and an unchanged save is allowed. Decreasing or deleting them restores aggregate stock and writes an aggregate-only refund movement; it must not change or guess a lot. Mixed prescriptions refund their known tracked quantity to exact lots before restoring the legacy remainder only to aggregate stock. No historical backfill or inventory correction is part of this contract.
- Prescription read payload medicine rows expose nested `batch_allocation`; save returns `stock_updates` for movements made by that request plus `stock_allocation_states` for current persisted allocations. A complete allocation lists lot number, allocated quantity, expiry, current raw lot balance, `aggregate_stock`, `available_batch_stock`, and `inventory_consistent`. Doctor renders every allocated lot directly as its own always-visible block and shows one row-level `Tồn kho` value from the aggregate stock. The backend still limits new dispensing by the lower of aggregate stock and positive non-expired lot stock; that safety calculation is not rendered as a second stock label and no raw lot balance is shown as a separate availability value.
- `prescription_items.unit` remains the saved prescription-unit snapshot. In Doctor, an in-clinic row displays its catalog unit read-only beside calculated quantity; only an outside-clinic row may edit the unit there. `Trong kho` and `Dạng thuốc` are redundant presentation labels and are not rendered; only the `Thuốc ngoài` exception is labeled. This is a frontend presentation contract and adds no database field or API payload field.
- Inventory precision is intentionally 2 decimal places for `medicines.stock_quantity` and `medicine_transactions.quantity`. Do not change stock/ledger precision to match the 3-decimal prescription item quantity without an accepted inventory redesign.
- Manually typed outside-clinic medicines must be `is_external=true` and must not deduct clinic stock.
- Doctor follow-up creation defaults: appointment/examination doctor_id is the authenticated API user.id; service_id is resolved from the single active catalog service named Khám tổng quát, with its catalog duration. No inheritance from current visit services/doctor, no hardcoded service ID. Explicit `re_examination_selection` (doctor_id, service_id, package_id) may override defaults after server catalog/actor validation. Existing follow-up date-only edits preserve their actual doctor/service/package; explicit selection edits update appointment and linked examinations atomically. Empty medicines are allowed; no synthetic prescription header is required to create a follow-up.
- `GET /api/prescription/appointment/<appointment_id>` returns the most recently created linked RE_EXAMINATION child (created_at DESC, id DESC), including cancelled/soft-deleted history. Schedule datetime/status/version come from that appointment. `re_examination_snapshot` carries identity, datetime, status, updated_at version, editable, lock_reason and selection. Calendar GET supplies active services/doctors plus the default or persisted selection; save/read return the same selection contract. Only future SCHEDULED children are editable from Doctor; unchanged schedules remain no-ops regardless of lifecycle. Changed schedules require the loaded snapshot and server row-lock validation before prescription/stock writes. Prescription, stock, schedule and related examination commit together; Calendar/reminder run only after commit for actual schedule changes. Legacy prescription re_examination_date is display fallback, not evidence of an existing schedule. See references/modules/prescriptions.md for the complete policy.
- Prescription print and QR verification use the same prescription data but different presentation contexts. The web/print document layout is the source of truth: QR/mobile verification must keep the same 6/4 document columns and only adapt the viewer/chrome around the document.
- `show_re_examination_date` is a backend-owned document visibility flag in internal prescription/print payloads and public verification data. It is false when the latest linked follow-up is CANCELLED or soft-deleted; the shared document template hides the follow-up line even if a saved/draft date remains. Historical date/status/snapshot and save behavior are unchanged. With no linked follow-up, legacy prescription dates remain displayable. Preview/verify adapters must preserve this flag; the frontend must not infer cancellation from labels.
- Public QR verification payloads must return display-ready diagnosis text via ICD resolution and keep raw ICD IDs separately as `diagnosis_ids`. Include appointment relatives so H/N prescription footer fields can render from the same data as print.
- Prescription verification QR images are generated by the same-origin public endpoint `GET /api/public/prescription/<prescription_code>/verification-qr.png`. The encoded value is only the public `/verify/rx/<prescription_code>` URL; do not send patient or prescription clinical fields to a third-party QR service. Printing must fail closed when this required image is unavailable instead of producing a document without the verification QR.
- Internal prescription print/preview payload `GET /api/prescription/appointment/<appointment_id>/print-view-model` follows the same ICD rule: display text in `diagnosis` / `benh_kem_theo`, raw ICD IDs in `diagnosis_ids` / `benh_kem_theo_ids`.

### Medicine Reference Catalog

`medicine_reference_catalog` owns external/reference drug data synced from DAV. It is a prescribing/search reference only, not clinic inventory.

- Verified normalization exceptions (2026-09-14): `correct_verified_dav_identity`
  in `dav_reference_sync.py` corrects reversed ingredient/strength for source16739
  Exidamin/SĐK893110043900 (VD-28330-17), and source16723 Mebamrol/SĐK893110045400
  (VD-28332-17). Source ID, registration, name and BOTH malformed values must
  match. Evidence: DAV decision718/QĐ-QLD and SPM's product page. Raw payload
  is unchanged; unknown revisions never get a generic swap. Two current local
  source rows were corrected with journals before stage2 clinic migration.

- Detail GET returns normalized medicine fields only. As of 2026-09-13 it
  no longer returns raw_payload; no user-facing JSON viewer exists. The DB
  source payload remains internal to sync/remapping and registration flags.

- DAV export (2026-09-13): authenticated GET
  `/api/medicine-reference-catalog/export/excel?search=...&status=...` uses
  the same filter and stable ordering as the list, across all pages. Output
  is an XLSX attachment, no-store; literal identifiers/text, typed dates,
  no raw payload or clinic balances. It never calls sync or mutates records.
- Sync always traverses all source pages. The UI sample scope and service
  max_pages argument were removed; page_size controls batch size only.

- Search remains accent-insensitive contains across name, active_ingredient,
  registration_number, old_registration_number, source_id and manufacturer_name.
  Migration `20260912_dav_search_indexes` freezes the Vietnamese translate map
  used by `app/utils/search_normalization.py` in six GIN expression indexes.
  Changing that expression requires a new migration to rebuild its indexes.
  Stable pagination order is name, registration_number, id; the matching btree
  accelerates empty-focus autocomplete. Indexes do not change result/status
  semantics, payloads or clinic inventory data.

Rules:

- `medicine_reference_catalog` must not own stock, batches, clinic prices, stock transactions, or dispensing state.
- `medicines` remains the owner for clinic-stock medicines, inventory quantity, batch, expiry, and clinic sale/import prices.
- DAV sync uses the public registration source `https://dichvucong.dav.gov.vn/congbothuoc/index` via `soDangKy/GetAllPublicServerPaging` with an empty `SoDangKyThuoc` filter. Do not revert to the narrower non-prescription filter unless the product explicitly needs a separate OTC-only catalog.
- DAV sync writes only `medicine_reference_catalog` and stores the original source row in `raw_payload` for future remapping. DAV-specific flags such as `isDaRutSoDangKy` are source-registration status, not clinic inventory status.
- DAV identity is `source_id` from DAV, not `registration_number`. Registration numbers can repeat across current/expired/history rows, so sync must not upsert by registration number.
- Current DAV phase is catalog-only: do not add `prescription_items` columns or route stock deduction/prescription save through DAV reference rows until a dedicated prescribing integration phase is accepted.
- Do not infer clinic availability from DAV records. A DAV drug becomes clinic stock only through a separate inventory creation flow.

### Orders / Clinical Indications

`chi_dinh` owns per-appointment ordered items and result files. The indication
name is either free text or a reference to an active `survey_templates` row;
the retired order catalog tables no longer exist.

Rules:

- Preserve result-file upload/delete/download behavior.
- Keep selected-order frontend state in sync with server reload after modal open/save.
- `survey_templates.default_performer_id` is the optional default in-house
  performer for one survey/test. It references an active doctor or psychologist
  user; `created_by` remains the template creator and must not be used as the
  performer. Selecting a survey copies this ID into the appointment order's
  existing `chi_dinh.in_house_unit_id`; changing the template default does not
  rewrite existing orders.
- Doctor and Tâm lý gia indication forms expose one input. Selecting a result
  from its survey autocomplete stores `survey_template_id` and the copied
  display name; text that is not selected from the dropdown stores only
  `order_name` as `custom`. The backend still distinguishes the two sources
  from the payload, but the user is not asked to choose a source. No catalog ID
  or group path is accepted or persisted.

### Survey templates and responses

- `survey_templates.content` owns question IDs, option IDs, criteria and
  configured scores. `app/utils/survey_scoring.py` supplies missing IDs on
  template writes and preserves existing IDs; the editor must round-trip
  them. Patient UI must not invent timestamp-based `temp_*` question IDs.
- A template with saved responses cannot remove/replace existing question,
  option or grid identities. Legacy templates with missing IDs require an
  explicitly reviewed repair or a new template; normalization must not orphan
  historical answers. API conflict code: `SURVEY_TEMPLATE_IDENTITY_CONFLICT`.
- `survey_responses.responses` maps exact question IDs to selected option IDs
  (arrays only for checkbox questions). The backend derives `total_scores`
  from configured option scores, never trusts a client-provided score.
  Legacy options without IDs use zero-based indexes, matching patient UI.
- Missing score keys are unknown/unscored, not zero. CLS renders “Chưa tính
  được” for missing/non-numeric totals and preserves genuine numeric zero.
- Save/update/recalculate reject unresolved or ambiguous identities, missing
  required answers and invalid score configuration with HTTP 400
  `SURVEY_ANSWER_MISMATCH`; rollback preserves the existing response.
- The 2026-09-05 fix does not migrate or recalculate historical patient data.

### Canonical clinical-order lifecycle (2026-09-05)

- `chi_dinh.status` owns exactly `sent`, `survey_sent`, `has_result`, `completed`.
  `is_completed` must equal `status == completed` (database check).
  `survey_sent_at`, `survey_expires_at`, `result_at`, `completed_at` are aware
  timestamps. `completion_reason` is expired/doctor, `completed_by` is the
  authenticated actor for manual completion (null for expiry).
- `survey_sessions.order_id` and `survey_template_id` bind each link to one
  indication. `survey_responses.order_id`, unique nullable `session_id`,
  and `template_snapshot` bind immutable new submissions to the exact link.
  Nullable legacy links are intentional; never guess ambiguous backfills.
- Survey link presentation: authorized GET `/api/survey-sessions/<examination_id>/status?order_id=...`
  and POST generate both return `survey_url` and PNG data-URI `qr_code` from
  the same `_session_link_payload` helper. The encoded URL must match the
  visible link exactly for that session/patient/examination/template. No
  browser-only generation cache is required. A `not_started` response has
  neither field. Creating again reuses the active session under the rule below.
- `/api/survey-sessions/generate` requires `order_id`; reuse a still-active
  link for that order with a 24-hour deadline. has_result/completed reject generation.
- `/api/survey-responses/public` requires `session_token` and matching IDs;
  score/save/order has_result/session completed are atomic. Retried exact
  answers are idempotent; different answers cannot replace a completed
  response. Generic session status APIs cannot set completed independently.
- Order form sync preserves server lifecycle and rejects omitted sent or
  completed rows; client status snapshots cannot reopen or complete surveys.
  Custom indications can be completed through the existing order update API.
- `POST /api/chi-dinh/<id>/finish-survey` requires admin/doctor/psychologist
  and clinical/assigned access. The lifecycle service locks order before sessions,
  completes once, records doctor/expiry reason, and preserves submitted sessions.
  Token-only status APIs cannot close, complete or fake expiration.
- The order blueprint reconciles due deadlines before order/session/response
  API requests. Completion time is the deadline, not the later request time.
  There is no background scheduler in this slice. The list API returns
  `next_expiry_at`; the open CLS page schedules one refresh at that deadline.
- List `status_group=active|completed` filters canonical status; `group_counts`
  uses the same permission/name/date/location scope before status and pagination.
- `/api/chi-dinh/<id>/survey-result` returns the stored answer IDs and new
  submissions' template snapshot after checking clinical/assigned access.
  Before submission it returns the latest session draft, or empty answers
  with the linked template. `review_state=submitted|draft|empty`,
  `review_updated_at`, `can_live` (poll until order completion), and
  `total_scores=null` for drafts prevent partial work appearing as final scores.
  It also returns `patient: {full_name, phone}` from the response/session order.
  `/patient-survey.html?review_order_id=<id>` consumes this authenticated
  endpoint using the existing patient question renderer in read-only mode;
  it never depends on an active public session or loads a local draft.
  Reviewing a result never creates sessions or edits answers. The independent
  deadline reconciliation still runs before workflow requests if an order is due.
- `survey_sessions.draft_responses` stores partial answers separately from
  `survey_responses`. `draft_revision` provides optimistic concurrency;
  `draft_updated_at` is aware UTC. `template_snapshot` freezes the questionnaire
  at link generation and is used for patient rendering, draft validation and
  final scoring. Migration `20260906_survey_live_draft` freezes legacy sessions'
  currently available templates; it does not invent historical drafts.
  Public GET/PUT `/api/survey-sessions/draft` needs the exact secret session
  token; PUT also validates IDs, revision, active lifecycle and answer identities.
  Draft updates do not set `has_result`, create SurveyResponse or send completion
  notifications. Final closure preserves drafts; late writes return 410.
- Legacy `responses`/`total_scores` remain untouched. Reconciliation only
  sets has_result for fully resolved, score-matching active records. Historical timezone
  errors and absent template snapshots are not silently rewritten.

### Legacy Database Archive

`legacy_database_archive` stores archived values from schema cleanup migrations before legacy tables or columns are dropped.

Rules:

- Do not use this table as an active workflow data source.
- Do not delete it during cleanup unless the archived values have been exported and the retention decision is explicit.
- When dropping clinical, patient, appointment, prescription, or examination fields, archive non-empty values here first so production rollback/audit remains possible.

## Endpoint Contracts

- Mọi JSON response có HTTP status từ `400` trở lên nhận thêm field `code` ổn định từ `app/utils/api_error_contract.py`. Field cũ (`detail`, `error`, `message`, dữ liệu kiểm tra nghiệp vụ) vẫn được giữ để tương thích và chẩn đoán; frontend không được đưa trực tiếp các field này vào toast.
- Frontend dùng `code` hoặc HTTP status để chọn câu báo theo workflow. `code` là contract máy đọc, không phải nội dung hiển thị; câu báo cho người dùng phải ngắn, nêu thao tác thất bại và việc cần làm. Trường hợp không có mapping riêng phải dùng fallback an toàn từ `QLPKUserFeedback`, không dùng raw body/exception.
- `GET /api/appointments/<id>` returns the combined appointment/patient/examination shape used by examination screens.
- `GET /api/prescription/appointment/<appointment_id>/print-view-model` returns backend-owned prescription print/preview data for the document renderer.
- `PUT /api/appointments/<id>` can update appointment, patient, examination, and selected examination detail fields. Doctor global save sends the current Tiền sử snapshot through this endpoint: `physical_history`, `family_history`, `allergies`, `risk_assessment`, `substance_use_history`, and `safety_plan`. `risk_assessment` remains examination-owned; the other values remain patient-owned. `safety_plan` is merged with the stored object so its independently uploaded file path is retained. Treat this endpoint as high blast radius.
- `GET /api/examination-details/<examination_id>/section/<section>` loads detail fields for a section.
- `POST /api/examination-details` saves a single detail field by `appointment_id`, `section`, `field_name`, `field_value`.
- `POST /api/examination-details/modal-save` saves grouped modal sections.
- `GET /api/examination-details/modal-load/<appointment_id>` loads grouped modal detail data.
- `GET /services/` returns the active service catalog as a legacy array unless `page` or `per_page` is present; paged callers receive the explicit envelope described under `appointment_services`.

## Field Addition Checklist

When adding a field:

1. Decide the canonical owner table using this file.
2. Add or verify SQLAlchemy model field.
3. Add a migration if the table schema changes.
4. Update relevant API read formatter and write endpoint.
5. Update frontend load path.
6. Update frontend save path.
7. Update clear/reset logic if the field is patient-specific or appointment-specific UI state.
8. Verify switching patients cannot display stale data.
