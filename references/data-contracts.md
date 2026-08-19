# QLPK Data Contracts

Use this file before changing models, endpoint payloads, serializers, save/load code, or frontend field mapping.

## Ownership By Table

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
- `medicine_transactions` is append-only inventory movement. No prescription-specific column is added. Tracked movements use existing `batch_id` plus an exact existing note contract (`Xuất theo đơn thuốc - Lịch hẹn ID: <id>` / `Hoàn lại tồn kho - Lịch hẹn ID: <id>`); code constructs the two expected notes from the known appointment id and never parses arbitrary note text. A transition refund for an old untracked prescription uses the exact refund note with `batch_id=NULL`, recording the aggregate-only refund without inventing a lot. Net quantity for the exact notes per non-null batch answers which lots are still allocated to the prescription. It does not replace `prescription_items` as current prescribed-quantity owner or `medicine_batches.remaining_quantity` as lot-balance owner.
- Prescription save locks the stable `appointments` aggregate row before reading current items, then locks each affected `medicines` row and its `medicine_batches` in deterministic medicine/FEFO order. Headers/items, aggregate stock, lot balances, and movement rows commit or rollback together. Repeated identical saves have delta `0`; increases allocate only the extra quantity. A decrease refunds the tracked portion first to its exact lots in reverse-FEFO order, then refunds any remaining legacy portion only to aggregate stock. Concurrent saves for one appointment serialize and different appointments cannot oversell shared aggregate or valid-lot stock.
- Prescription save must not require aggregate stock to equal the sum of lot balances: old saves legitimately reduced only aggregate stock. For a new issue, usable quantity is the lower of aggregate stock and positive non-expired lot stock, so an existing difference is preserved and never reconciled silently. Negative aggregate/lot stock, missing tracked lots, invalid tracked allocations, or shortage must fail the entire save with a user-readable error.
- Legacy prescription quantities without batch-linked movements remain readable and an unchanged save is allowed. Decreasing or deleting them restores aggregate stock and writes an aggregate-only refund movement; it must not change or guess a lot. Mixed prescriptions refund their known tracked quantity to exact lots before restoring the legacy remainder only to aggregate stock. No historical backfill or inventory correction is part of this contract.
- Prescription read payload medicine rows expose nested `batch_allocation`; save returns `stock_updates` for movements made by that request plus `stock_allocation_states` for current persisted allocations. A complete allocation lists lot number, allocated quantity, expiry, current raw lot balance, `aggregate_stock`, `available_batch_stock`, and `inventory_consistent`. Doctor renders every allocated lot directly as its own always-visible block and shows one row-level `Tồn kho` value from the aggregate stock. The backend still limits new dispensing by the lower of aggregate stock and positive non-expired lot stock; that safety calculation is not rendered as a second stock label and no raw lot balance is shown as a separate availability value.
- `prescription_items.unit` remains the saved prescription-unit snapshot. In Doctor, an in-clinic row displays its catalog unit read-only beside calculated quantity; only an outside-clinic row may edit the unit there. `Trong kho` and `Dạng thuốc` are redundant presentation labels and are not rendered; only the `Thuốc ngoài` exception is labeled. This is a frontend presentation contract and adds no database field or API payload field.
- Inventory precision is intentionally 2 decimal places for `medicines.stock_quantity` and `medicine_transactions.quantity`. Do not change stock/ledger precision to match the 3-decimal prescription item quantity without an accepted inventory redesign.
- Manually typed outside-clinic medicines must be `is_external=true` and must not deduct clinic stock.
- `GET /api/prescription/appointment/<appointment_id>` must return linked re-examination schedule fields from the active child `appointments.original_appointment_id` record when it exists, even if the original appointment has no prescription header yet. The actual scheduled date/time comes from `appointments.appointment_date`; prescription header `re_examination_date` is a legacy fallback.
- Prescription print and QR verification use the same prescription data but different presentation contexts. The web/print document layout is the source of truth: QR/mobile verification must keep the same 6/4 document columns and only adapt the viewer/chrome around the document.
- Public QR verification payloads must return display-ready diagnosis text via ICD resolution and keep raw ICD IDs separately as `diagnosis_ids`. Include appointment relatives so H/N prescription footer fields can render from the same data as print.
- Prescription verification QR images are generated by the same-origin public endpoint `GET /api/public/prescription/<prescription_code>/verification-qr.png`. The encoded value is only the public `/verify/rx/<prescription_code>` URL; do not send patient or prescription clinical fields to a third-party QR service. Printing must fail closed when this required image is unavailable instead of producing a document without the verification QR.
- Internal prescription print/preview payload `GET /api/prescription/appointment/<appointment_id>/print-view-model` follows the same ICD rule: display text in `diagnosis` / `benh_kem_theo`, raw ICD IDs in `diagnosis_ids` / `benh_kem_theo_ids`.

### Medicine Reference Catalog

`medicine_reference_catalog` owns external/reference drug data synced from DAV. It is a prescribing/search reference only, not clinic inventory.

Rules:

- `medicine_reference_catalog` must not own stock, batches, clinic prices, stock transactions, or dispensing state.
- `medicines` remains the owner for clinic-stock medicines, inventory quantity, batch, expiry, and clinic sale/import prices.
- DAV sync uses the public registration source `https://dichvucong.dav.gov.vn/congbothuoc/index` via `soDangKy/GetAllPublicServerPaging` with an empty `SoDangKyThuoc` filter. Do not revert to the narrower non-prescription filter unless the product explicitly needs a separate OTC-only catalog.
- DAV sync writes only `medicine_reference_catalog` and stores the original source row in `raw_payload` for future remapping. DAV-specific flags such as `isDaRutSoDangKy` are source-registration status, not clinic inventory status.
- DAV identity is `source_id` from DAV, not `registration_number`. Registration numbers can repeat across current/expired/history rows, so sync must not upsert by registration number.
- Current DAV phase is catalog-only: do not add `prescription_items` columns or route stock deduction/prescription save through DAV reference rows until a dedicated prescribing integration phase is accepted.
- Do not infer clinic availability from DAV records. A DAV drug becomes clinic stock only through a separate inventory creation flow.

### Orders / Clinical Indications

`chi_dinh` owns per-appointment ordered items and result files. Order catalog data lives in `order_categories` / `order_items`.

Rules:

- Preserve result-file upload/delete/download behavior.
- Keep selected-order frontend state in sync with server reload after modal open/save.

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
