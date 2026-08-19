# Doctor Examination Navigation

Last verified: 2026-08-16

This document is the runtime/navigation contract for the doctor clinical workspace. Read it with `doctor-examination-business-map.md` and `doctor-examination-data-inventory.md` before changing the workspace navigation, section layout, or support-module entry points.

## Scope And Boundary

The navigation here is internal to the selected doctor's clinical workspace. It is not the shared app header, sidebar, app launcher, or workspace-tab shell.

- It changes the visible workspace section; it does not navigate to another URL.
- It must not write clinical data, trigger autosave, or infer clinical state from its labels.
- Form changes mark the workspace dirty through field input/change handling. Navigation clicks only switch presentation state.
- A patient/appointment must be selected before the workspace is shown. The queue remains the owner for selecting that context.

## Patient Context Header

The selected workspace starts with one flat brown header owned by
`doctor-clinical-workspace.html` and `clinical-workspace-ui.js`. It has two
information rows: patient name + hồ sơ code + latest previous visit date, then
the previous diagnosis + prescription summary. The header retains only the
real `Lưu` and `Hoàn thành khám` actions; it does not render avatar, gender,
age, service, status, or duplicate current-prescription content.

`prescription-ui.js` remains the only history/prescription state owner. It
loads the existing patient prescription-history endpoint, excludes the
current/future visit, and exposes a read-only snapshot for the header. The
clinical workspace clears all header text before every patient load. Empty and
loading history are explicit states, not fixtures. At the narrow breakpoint,
the header becomes content-height and places the two actions on a compact
second action row; information remains two rows and the page has no horizontal
overflow.

## Runtime Owners

| Concern | Canonical owner | Responsibility |
| --- | --- | --- |
| Top-level section nav markup | `app/templates/partials/doctor-clinical-workspace.html` | Renders the five root-section links and their explicit target IDs. |
| Top-level section activation | `app/static/js/doctor-examination/clinical-workspace-ui.js` | `activateWorkspaceSection()` toggles section `hidden`, `.is-active`, `aria-hidden`, and nav `aria-current`. |
| Page lifecycle integration | `app/static/js/doctor-examination.js` | Clears workspace, medical-history, prescription, service, and attachment state before a new appointment, renders the clinical workspace, then loads the active modules for that appointment. |
| Local draft recovery | `app/static/js/doctor-examination/draft-recovery.js` | Keeps a device-local recovery copy only; it never replaces canonical server data without an explicit user action. |
| Navigation layout/responsive styling | `app/static/css/pages/doctor-examination.css` | Owns `.doctor-section-edge-nav`; do not add competing navigation CSS elsewhere. |

## Top-Level Navigation Matrix

| Label | Target section | Extra target | Business purpose |
| --- | --- | --- | --- |
| Hành chính | `#doctorReceptionistIntakePanel` | None | Read or edit the shared patient and intake context; it does not render duplicate Lý do khám or Biểu hiện chung controls on the doctor route. |
| Tiền sử | `#doctorHistoryPanel` | None | Open patient history, allergy, risk, substance-use, and safety-plan content. |
| Khám | `#doctorClinicalDecisionPanel` | `#doctorPrescriptionWorkspace` | Default workspace for the paired nine-field and inline-detail cards followed by the prescription workspace. |
| Dịch vụ | `#doctorServicePanel` | None | Read, add, edit, and explicitly save appointment services without mixing them into the prescription workspace. |
| Chỉ định | `#doctorIndicationsPanel` | `#doctorIndicationsHistory` | Tạo, sửa, xóa chỉ định của appointment; đọc danh mục/người thực hiện, xem lịch sử theo bệnh nhân và lưu qua Doctor global save. |

The top-level rail contains five root sections: Hành chính, Tiền sử, Khám, Dịch vụ, and Chỉ định. The Chỉ định pane is owned by `components/doctor-indications-form.js`; it loads the appointment rows and active catalog, keeps one dirty state, and is composed into `supportModulesUi` so Doctor global save remains the only save transaction. Its inline history reads the patient-scoped orders endpoint and excludes the current appointment. Tài liệu đính kèm remains in Hành chính and prescription history remains inside the prescription workspace; there is no nested support navigation.

The Chỉ định catalog menu is a viewport-anchored autocomplete popover, not a
fixed-height child list of the left form column. Its width must remain equal to
the input width. Its block size follows the usable viewport space and it opens
upward when that side has more room. The anchor is resynchronized while the
workspace scrolls or the viewport resizes, so parent workspace overflow must not
clip the menu. Only the popover owns overflow scrolling; opening it must not
stretch the form column or overlap the current-appointment table horizontally.

## Clinical Panel Content Contract

`#doctorClinicalDecisionPanel` is one clinical workspace, not a second navigation surface or a set of independently toggled task panels. Its DOM contains the paired clinical-card grid followed by `#doctorPrescriptionWorkspace`; the prescription panel is not a root navigation target.

1. `.doctor-clinical-flow__clinical-grid` contains `#doctorDecisionTreatmentTask`, one shared-paper card with this fixed numbered order: 1. Lý do khám, 2. Bệnh sử, 3. Biểu hiện chung, 4. KQ khám toàn thân, 5. Chẩn đoán (ICD-10), 6. Bệnh kèm theo, 7. Kết luận & Hướng Đ.trị, 8. Thuốc đang dùng, 9. Lời dặn; and `#doctorClinicalDetailPanel`, one shared-paper card only, without nested cards, nav, modal, or chapter line. The two card headers share the compact dark-green `#0b665c` surface and white title/icon treatment of `#doctorPrescriptionWorkspace`; their entry surfaces stay white. The detail card has two lightweight groups: Các cơ quan (Tuần hoàn, Tiêu hoá, Thận-tiết niệu-sinh dục, Cơ-xương-khớp, Tai-mũi-họng, Nội tiết-dinh dưỡng, Thần kinh) and Khám tâm thần (Ý thức định hướng, Tình cảm/cảm xúc, Tri giác, Tư duy, Hành vi tác phong, Tập trung-chú ý, Trí năng, Trí nhớ). Thần kinh spans the full detail-field row from `48rem`; retired mental aliases are archived and removed. All 24 editable controls in these two cards intentionally omit placeholders; group titles and add actions are teal while field labels and entered values share primary text color.
2. `#doctorPrescriptionWorkspace` is the full-width prescription workspace below the Khám cards, retaining its existing module owner and actions. Its history panel is hidden by default and opens from the `Xem lịch sử` button. The `Khám & xử trí` card exposes one local `Đơn thuốc` jump action with the current medicine-row count; it only scrolls to this existing workspace and does not create another nav, modal, or prescription lifecycle.

`components/clinical-examination-form.js` hydrates all 19 visible `examination_details` controls with `modal-load`, waits for that load before saving, then saves their values in three grouped section payloads alongside the canonical appointment update. It must not restore a summary renderer, a Khám chi tiết modal, or a second in-panel navigation owner. Retired Doctor mental aliases (`general_manifestations`, `notes`) are archived and removed; they are not submitted or preserved by a fallback.

## Prescription Visual Contract

`#doctorPrescriptionWorkspace` has one visual-frame owner: its outer panel.
The v4 prescription pattern keeps the existing prescription owner in the main
region and adds one history rail beside it. The main region contains a compact
header, one inline setup row, the medicine table with an optional per-row
`Cách dùng / ghi chú thuốc` detail row, and a right-aligned total footer. The
existing `#doctorPrescriptionUsageInstructions` bridge is visible as the
shared-use field in that setup row; it remains the same canonical field and
save path. The history rail renders the existing patient prescription-history
payload from `GET /api/prescription/patient/<patient_id>/history` and exposes
the current history actions without creating a second prescription lifecycle.
Existing IDs and prescription actions remain owned by
`prescription-ui.js`; this visual contract does not change medicine, print,
re-examination, or save behavior. Appointment services have their own root
section and are not a prescription summary or utility action.

## Section Alignment Contract

Hành chính is the shared vertical alignment baseline: its content begins at the
top of `doctor-clinical-layout`, whose block-start padding is zero. The
doctor-flat Tiền sử variant must not receive Bootstrap `mt-2`/`mb-2` utility
spacing, and `.doctor-workbench-panel__body--clinical` must retain zero padding.
This keeps Hành chính, Tiền sử, and Khám aligned without adding wrapper-specific
offsets; the cards themselves remain the visual-frame owners.

## Services And Document/History Support

`#doctorServicePanel` is a top-level workspace section with exactly one visual
frame owned by direct child `.doctor-service-workspace--split`, not the generic
workbench panel. It contains two regions: `Dịch vụ` and `Đã chọn`. On desktop
they are two equal columns from `64rem`; narrow viewports retain the same order
in one column. `Dịch vụ` loads one server-owned catalog page at a time through
`GET /services/?page=<n>&per_page=24`. With these query parameters the endpoint
returns `{ services, pagination }`; callers without them retain the legacy array
response. The Doctor catalog list has a responsive internal scroll area
(`clamp(13.5rem, 32dvh, 22rem)`) and a compact pager with `Trước`, direct page
selection, and `Sau` below it. Direct selection is mandatory because a
sequential `1 / N` pager does not scale when the catalog has many pages. The
scroll belongs only to the catalog list, contains scroll chaining, and does not
make the workspace frame or page scroll unnecessarily. From `64rem`,
`#doctorServicePanel`, `.doctor-service-workspace--split`, and both service
regions deliberately stretch to the available doctor workspace height. Each
region uses a fixed header plus one flexible content row; the catalog pager is
fixed at the bottom of its content while the catalog and selected-service lists
own their internal scrolling. This prevents the catalog from stopping after a
small capped strip while preserving document flow below `64rem`, where both
regions stack without cutting the selection column. Selecting a row adds
the catalog service once, with its canonical default price/duration and quantity
`1`; an already selected catalog row remains visible but disabled so it cannot
be duplicated. Both regions use
a compact `#0B5F56` heading with vertically centered white text. The header
fills its region to the single teal-tinted region divider; list content keeps
one shared inline gutter beneath it. `Đã chọn` is a list, not a table/card:
each row shows the service name, the read-only catalog-derived price, an
editable quantity, and a remove action. Its fixed lightweight footer shows
`Tổng dự tính`; it is not a second card, table, or save action. There is no
explicit service save button, draft form, search, or duration/note editor. The
global Doctor `Lưu` action remains the explicit save owner for dirty services.
The quantity control suppresses native increment/decrement spinners but remains
a keyboard-editable numeric input. From `64rem`, the shared selected header/row
grid reserves responsive columns for price and quantity rather than allowing
the service-name column to consume their reading space; the narrow layout keeps
the compact column formula to avoid overflow. Header labels `Giá` and `SL`, row
prices, and the estimated-total value are centered in their respective columns.
The total is a read-only preview computed from the current `STATE.services` by
the backend-equivalent formula `unit price × quantity`, then discount and tax;
it updates immediately when a row is added, removed, or its quantity changes.
The canonical amount remains the backend value returned after global save.
Data lifecycle remains in
`components/doctor-services-form.js`: `STATE.services`, paged
`STATE.serviceCatalog`,
`STATE.serviceCatalogPagination`, `GET /services/appointment/<id>`, the paged
catalog endpoint, and `PUT /services/appointment/<id>/sync`. A dedicated
catalog request token ignores an older page response after page/context changes;
the catalog page and metadata reset on patient switch. Service controls are
excluded from main clinical dirty tracking because the support-module dirty
state is the canonical leave/save owner.

Documents remain owned by the page attachment bridge and are shown in Hành
chính. Prescription history is loaded and applied only by `prescription-ui.js`;
the Doctor route does not load, render, search, or save appointment orders.

The prescription workspace must not render a service count, a service action,
or an alternate service view. The workspace does not expose a Khám chi tiết
pane; the 15 organ/mental inputs remain inline within tab Khám and do not
delete or replace other persisted detail sections.

## Lifecycle And Safety Contract

1. `doctor-examination.js` sets the patient-loading guard and clears patient-specific surfaces before loading a new appointment.
2. It calls `registry.get('clinicalWorkspace').clear()`, medical-history clear, and `registry.get('supportModulesUi').clear()`; the workspace clear increments `contextToken`, hides the workspace, resets the default section to `#doctorClinicalDecisionPanel`, and clears visible form state.
3. After the appointment payload arrives, `registry.get('clinicalWorkspace').render()` shows the workspace, populates the shared patient/visit forms and clinical fields, clears then asynchronously hydrates Bệnh sử, KQ khám toàn thân, seven organ fields, and eight mental-exam fields with an appointment-scoped context token, and activates the default clinical section. The page then calls `registry.get('supportModulesUi').load()` for prescription, services, and history data.
4. A navigation click only changes section/pane visibility and accessibility state. It does not send a request or call a save function.
5. The header actions `Lưu` and `Hoàn thành khám` share the same compact white action surface with black text/icons against the dark patient-context header. `Lưu` calls `registry.get('clinicalWorkspace').saveWorkspace()`: it reuses `saveNow()` for appointment-owned fields and the 19 visible details, merges an immediate Tiền sử DOM snapshot into the canonical appointment update, then saves only dirty prescription/service modules via `registry.get('supportModulesUi').saveAll()`. `registry.get('servicesForm')` is the service state/load/clear/save owner behind that facade. Tiền sử is configured with `autoSave: false`; `registry.get('medicalHistoryBridge')` is the only history save/clear owner. File upload and safety-plan-file repair remain explicit file actions. It skips while `isLoadingExaminationData` is true. The section endpoint replaces only the canonical named fields.
6. `hasUnsavedChanges()` aggregates the main workspace revision, support-module dirty state, and manual medical-history revision. Before a patient switch, `doctor-examination.js` calls `resolveUnsavedChanges()` before clearing any patient surface. Before a top workspace tab is switched or closed, `workspace-tabs.js` calls the optional doctor leave hook in the native pane or iframe. The themed in-app dialog offers `Lưu và tiếp tục`, `Bỏ thay đổi`, and `Ở lại`; discard reloads the current appointment from server before a workspace-tab leave, while the following patient load replaces the current surface on a patient switch. Keyboard F5/Ctrl+R/Cmd+R is intercepted by the same dialog owner with only `Lưu và tải lại` and `Tải lại trang`; the latter captures IndexedDB before one intentional reload bypasses `beforeunload`. Browser toolbar reload, address/back navigation, and tab/window close use the native unsaved-data warning.
7. After the canonical appointment, detail, history, and support loads settle, `registry.get('draftRecovery')` records that complete rendered state as the baseline. A matching IndexedDB record is recoverable only when its stored `baseSnapshot` still equals that fully loaded canonical state and its current snapshot contains unsaved differences; only then does the compact banner offer `Khôi phục` or `Bỏ bản nháp`. If DB already equals the draft, or DB has changed since the draft baseline, the obsolete local record is deleted silently. It must never auto-apply a draft over server data. The draft is device/browser-local (not cross-device), scoped by logged-in user and appointment and validated again against patient ID; its TTL is 24 hours. It stores clinical controls, prescription/services state, and medical-history state, but no clinical data is written to `localStorage`.
8. Input/change/click activity queues the local recovery snapshot after a 250 ms quiet period. A failed global `Lưu` attempts an immediate capture. If a multi-owner save wrote some owners before another failed, that failed-save record is rebased once on the next canonical load: DB wins fields already saved or changed elsewhere, while differences still absent from DB remain recoverable under the new baseline. Later captures in the same failed-save session retain this mode until a successful save or context reset. This protects normal reload, offline save failure, and later reopening on the same device after a capture has completed; it cannot guarantee recovery if the browser/device terminates before the browser has time to persist the change.
9. `Khôi phục` explicitly applies the snapshot and keeps all restored differences dirty. Changed clinical controls receive `.is-draft-restored`; changed prescription/service rows and the restored history panel receive the same semantic marker. The banner states that this remains unsaved until the global `Lưu` succeeds. `Bỏ bản nháp` deletes the local record and, if it was already restored, reloads canonical data. Every successful global save, including a clean/no-change result, waits for the current local record to be deleted before completing. Expired, mismatched, redundant, superseded, discarded, and best-effort logout records are cleaned up.
10. Restoration after a saved/discarded context continues to mean canonical server reload through `GET /api/appointments/<id>/edit`, detail `modal-load`, and support-module loads. The recovery layer is a separate, explicit fallback and is never the canonical reader.
11. Stale responses are invalidated by the workspace/support context tokens, including the recovery context token. No navigation or support pane may reveal data from the prior patient after a switch.
12. The eye action in the shared patient history modal opens the selected historical appointment across the existing Doctor workspace owners for viewing. It keeps the selected current appointment as the return target, marks the workspace read-only, disables save/mutation controls, keeps section navigation and history selection available, and restores the current appointment through `Về lượt hiện tại`. History view does not create a save context or write any data.

## Responsive And Accessibility Contract

- Above `86.24875rem`, the top navigation is a vertical edge rail beside the clinical stage. It uses intrinsic height and must not scroll internally.
- At or below `86.24875rem`, it becomes a horizontal, overflow-x scrollable row below the main clinical stage; labels return to normal horizontal writing.
- Detail-field groups use two equal columns from `48rem` and one column below that breakpoint; Thần kinh spans both desktop columns. Normal detail fields place their primary-text labels above their full-width textarea within that half-column, preventing the shared horizontal label/input rule from constricting clinical text entry. Their textarea has `padding-inline-start: 0`, so the label and entered text start on one vertical reading axis; the end padding remains for the resize control. All 15 detail controls deliberately omit a `placeholder`: the visible label is the only field cue and an empty entry surface remains blank. Both cards share the compact dark-green header/white title-icon treatment of the prescription workspace; their white entry surfaces retain teal strong for group titles, teal for add actions and focus, teal for the fixed numbered `1.`–`9.` decision labels, primary text for normal field labels and entered values, and two matching teal tints for dividers and entry underlines. The desktop root-rail uses the same teal family: active uses the primary teal, inactive uses a readable muted teal, and hover/focus uses the strong teal. Short labels with the explicit `doctor-clinical-detail-field--inline` modifier (`Tuần hoàn`, `Tiêu hoá`, `Thần kinh`, `Tri giác`, `Tư duy`, `Trí nhớ`, `Trí năng`) are the deliberate exception: their non-wrapping text label and textarea share one responsive row through `max-content minmax(0, 1fr)`. Every free-text control in both cards is a semantic textarea with an initial/minimum height of `1.65rem` and native vertical resizing for multiline entry; ICD diagnosis controls remain the shared autocomplete component. The label margin block-start and textarea padding block-start consume the same `--doctor-clinical-detail-entry-block-start` token so every inline label begins on the textarea's first text line. From `64rem`, the paired cards stretch to the taller content-driven card height; the form rows remain content-sized rather than distributing residual height into textareas. There is no JS-measured or fixed card height. Below `64rem`, the paired Khám grid becomes one column and keeps the document order Khám & xử trí, Khám chi tiết, then the full-width prescription block. At or below `47.99875rem`, the workspace returns to document flow rather than forcing a fixed-height panel.
- Active links/buttons must expose `.is-active` and `aria-current="true"`; inactive sections/panes must be hidden and receive `aria-hidden="true"` where the top-level section owner manages it.
- Preserve the explicit `aria-controls`/target ID relationship. Do not replace labels with icon-only controls unless an accessible name remains and visual QA confirms the clinical meaning is obvious.

## Current Slice And QA State

The active doctor UI slice keeps five root sections in
`doctor-section-edge-nav`: Hành chính, Tiền sử, Khám, Dịch vụ, and Chỉ định. The
prescription workspace is inline below Khám and its history panel is opened by
the local `Xem lịch sử` action. Chỉ định is mounted as a separate data-backed
pane with current appointment rows, catalog selection, edit/delete actions,
inline patient history, and one global-save owner. Documents remain in Hành
chính and prescription history remains inside Đơn thuốc.

QA cập nhật 2026-08-16 cho icon mắt lịch sử: browser với bệnh nhân Ngô Hiển Đạt xác nhận lượt lịch sử `1101` hiển thị đủ Khám, Tiền sử, Hành chính, Đơn thuốc, Dịch vụ và Chỉ định trên workspace; lượt `990` vẫn giữ ca đang chọn `1101` làm đích quay lại. Khi xem lịch sử, các input/button/select/textarea/fieldset đều bị khóa, nút Lưu/Hoàn thành bị vô hiệu hóa, nút Lịch sử và điều hướng vùng vẫn hoạt động. Nút Về lượt hiện tại nạp lại đúng ca đang khám. Console rỗng, `node --check`, `check_frontend_contract.py` và `smoke_health.py` pass.

QA cập nhật 2026-08-03 cho cấu trúc thuốc điều trị: table thật trên appointment
`1051` hiển thị đủ 5 dòng; `unit` và `usageNote` nằm trong ô thuốc theo đúng
hierarchy PNG, còn lịch uống, đường dùng, số lượng, thành tiền và xóa là các
cột nghiệp vụ riêng. Table `995px` vừa workspace desktop `995px`; ở `390x844`,
table `928px` vẫn scroll ngang trong `.doctor-prescription-table-wrap` và page
không tràn ngang. Action `Đơn thuốc` tìm scroll owner thực tế theo breakpoint,
không còn kéo cả page. `Xem lịch sử` mở đúng 3 đơn, patient switch
`1051 -> 1101 -> 1051` không rò dữ liệu, console error/warn rỗng. Không bấm
`Lưu` trong QA.

Ô chọn thuốc trong kho là combobox, không phải ô text tự do: khi focus, danh sách
thuốc mặc định được mở ngay cả khi chưa nhập; nhập tiếp sẽ lọc danh sách. Chọn
thuốc vẫn là bước thiết lập `medicine_id` cho payload, còn dòng thuốc ngoài cơ
sở giữ hành vi nhập tự do.

“Hẹn tái khám” chỉ còn một control nghiệp vụ là checkbox `Đặt lịch`: khi bật,
ngày tự tính từ ngày hiện tại cộng đúng `Số ngày điều trị` và người dùng vẫn có
thể chỉnh lại ngày giờ. Lịch con `SCHEDULED` giữ trạng thái `Đã tạo lịch` nhưng
vẫn editable; chỉ `re_examination_status=CONFIRMED` đổi sang `Đã xác nhận` và
khóa checkbox/datepicker. Không còn nút tính ngày riêng hoặc fallback ngầm 7
ngày vì trùng/sai với cơ chế tự động này.

QA cập nhật 2026-08-02 cho vùng đơn thuốc: sửa clinical body dùng các hàng
`max-content` để nội dung đơn thuốc không còn co về `2px` trong parent cố định;
history rail chuyển theo chiều rộng container thực của clinical stage; composer
tablet xếp lại hai cột và bảng giữ scroll nội bộ. Browser với ca thật Ngô Hiển
Đạt/đơn `798360806007-C` pass ở `1280x720`, `768x1024` và `390x844`; nút đi
đến đơn thuốc và `Xem lịch sử` hoạt động, mã đơn/thuốc/cách dùng/ghi chú/tổng
tiền hiển thị đúng, không có document overflow, console không có error/warn,
và đổi A -> B -> A không rò dữ liệu. `node --check` và
`check_frontend_contract.py` pass.

QA cập nhật 2026-07-26: Jinja parse, `node --check` cho
`clinical-workspace-ui.js` và `support-modules-ui.js`,
`check_frontend_contract.py`, và `smoke_health.py --http` pass. Browser route
không có appointment xác nhận đủ bốn rail target, panel Dịch vụ có hai heading
và các nhãn cột `Giá`/`SL`, header đã dùng cùng lưới responsive như selected
row, không còn summary/action dịch vụ trong Đơn thuốc hoặc support-service
pane, không tràn ngang và console rỗng. Workspace bị hidden do queue local
rỗng, nên chưa pass visual/interactive QA với ca khám thật, selected row có
giá/số lượng/xóa, lưu hoặc chuyển A -> B -> A.

QA follow-up Dịch vụ 2026-07-26: desktop panel Dịch vụ đã nối lại full-height
chain từ `doctor-workbench`; catalog nạp 24 mục/trang và pager vẫn có select
trang trực tiếp. `node --check support-modules-ui.js`,
`check_frontend_contract.py`, `smoke_health.py --http` đạt; browser xác nhận
panel/workspace/catalog đều `block-size: 100%`, catalog và selected list là các
scroll owner nội bộ, catalog không còn `max-block-size` và console không có
warning/error. Browser local không có ca khám/authenticated service catalog,
nên chưa pass visual/interactive QA với danh sách thật, scroll, chọn trang,
thêm/xóa, đổi số lượng và lưu.

### Design Exploration Snapshot (2026-07-24)

The visual comparison pack is kept in `tmp/doctor-nav-options/`. Its
editable source is `render-options.mjs`; `README.md` indexes all options and
states the shared constraints. `contact-sheet.png` contains options 01-05 and
`contact-sheet-2.png` contains options 06-15.

- The comparison pack predates the current navigation IA and is not runtime
  truth for the root-rail item count.
- The selected desktop direction is a four-link vertical rail with a compact
  responsive inter-item gap of `clamp(0.125rem, 0.2dvh, 0.2rem)`. Its full visual
  labels are written vertically: Hành chính, Tiền sử, Khám, Dịch vụ. The rendered
  `strong` inherits zero letter spacing (`0`) so the full Vietnamese label
  stays inside its compact block rather than
  overflowing at either end. Every link retains the same
  full destination name in `title` and `aria-label`.
- Each item is one repeated responsive menu block through `block-size`
  `clamp(4.125rem, 6.25dvh, 4.25rem)`. This controls the cell rather than the overall
  rail height. The inner label uses intrinsic block size and cannot stretch to
  the rail width, so all four menu blocks keep the same rhythm.
- The desktop inline footprint is
  `clamp(1.75rem, 2vw, 2rem)`. This is the rail width, not its height; the
  compact inner vertical label uses the shared `--qlpk-font-size-xs` token and
  medium weight. The rail has intrinsic height for all four links: it must not
  use `max-block-size`, an
  internal scrollbar, or hidden overflow, because those cut labels and consume
  the rail's narrow width.
- The selected implementation retains explicit accessible names and a visible
  keyboard focus outline. The active link uses only its background; no
  decorative inset marker consumes the rail's visual space. Removing CĐ from
  Doctor does not remove the backend orders module or its other screen callers.
- These PNGs are design artifacts, not runtime visual QA. The authenticated
  doctor-session check below remains required after implementation.

Before reporting a navigation change complete, validate:

1. Each top-level link opens its intended Hành chính, Tiền sử, Khám, or Dịch vụ presentation; the prescription workspace is inside Khám and support content must not be rendered in this rail.
2. The default clinical section is restored after render and after switching between at least two patients.
3. Navigation alone makes no save request and does not clear unsaved form data.
4. Desktop edge-rail and narrow horizontal-row layouts have no clipping, accidental page overflow, or unreadable labels.
5. Browser console is clean for the selected appointment flow.

QA ngày 2026-07-25: sau patch zero tracking và tăng nhịp block, `python3
scripts/check_frontend_contract.py`, `python3 scripts/smoke_health.py --http`
và `node --check app/static/js/doctor-examination/clinical-workspace-ui.js`
đều pass. At `2048x1080`, browser confirms desktop column direction, a
`67.5px` item block, no rail scrollbar, no active pseudo-element, no page
horizontal overflow, and no console error/warn. Route thật chưa có appointment
trong danh sách chờ nên workspace đang ẩn; chưa pass visual QA đầy đủ cho label
trong ca khám thật và bước đổi giữa hai bệnh nhân.

QA cập nhật 2026-07-25 cho flow Khám: đã bỏ dead `syncClinicalTaskPanels()`
và selector `.doctor-clinical-task-panel` sau khi template chuyển sang flow
dọc. `node --check app/static/js/doctor-examination/clinical-workspace-ui.js`,
`python3 scripts/check_frontend_contract.py` và `python3 scripts/smoke_health.py
--http` pass. Browser route thật xác nhận ba rail target, ba clinical section
và không còn task panel; console không có error/warn. Danh sách chờ vẫn rỗng,
vì vậy visual QA với một appointment thật và kiểm thử A -> B -> A vẫn chưa pass.

QA cập nhật 2026-07-25 cho card Khám: summary markup/renderer/CSS đều không còn;
browser xác nhận `#doctorDecisionTreatmentTask` còn bốn control (chẩn đoán, bệnh
kèm, hướng điều trị, lời dặn), card dùng left accent frame và field chỉ còn
underline, không có page horizontal overflow hay console error/warn. Do danh sách
chờ rỗng, đây mới là structural browser QA; visual QA với dữ liệu thật và A -> B
-> A vẫn chưa pass.

QA cập nhật 2026-08-09 cho lát full FE-BE Chỉ định: component
`indicationsForm` đã sở hữu catalog, performer, appointment rows, history,
dirty/save và draft recovery; `supportModulesUi` compose component này cùng
Đơn thuốc/Dịch vụ. Backend thêm `GET /api/chi-dinh/patient/<patient_id>` với
patient-scope check. Static/schema/auth/HTTP smoke đạt. Browser session hiện tại
chỉ render HTML nhưng không thực thi entry `type="module"`, Chrome backend cũng
không khả dụng; vì vậy visual/interactive QA với dữ liệu thật, responsive và
luồng A -> B -> A vẫn là **chưa pass** và không được coi là hoàn tất.

QA cập nhật 2026-07-26 cho presentation đơn thuốc: tại `1280x720`, browser
xác nhận header đã dùng nhịp compact, footer chỉ còn tổng tiền căn phải và không
còn textarea/label `Ghi chú đơn`; hidden usage field vẫn tồn tại. Không có
horizontal overflow hoặc console error. Danh sách chờ rỗng nên chưa visual QA
với dữ liệu đơn thuốc thật hoặc kiểm thử đổi bệnh nhân.

QA trước slice bỏ Ghi chú 2026-07-26 cho hai vùng Khám: Jinja parse, `node --check
app/static/js/doctor-examination/clinical-workspace-ui.js`, `python3
scripts/check_frontend_contract.py` và `python3 scripts/smoke_health.py --http`
đều pass. Browser tại `1280x720` xác nhận 16 detail control ID ở thời điểm đó xuất hiện đúng
một lần, `#doctorClinicalDetailPanel` xuất hiện đúng một lần, desktop CSS dùng
hai cột và không có page horizontal overflow hoặc console error/warn. Tại
`768x900`, media query đưa flow về một cột mà vẫn không tràn ngang. Danh sách
chờ rỗng nên chưa pass visual QA với panel hiển thị, hydrate/save dữ liệu thật
hoặc chuyển A -> B -> A.

QA cập nhật 2026-07-26 cho hierarchy Khám giống Hành chính (trước slice gộp
đơn thuốc): browser tại `1280x720` xác nhận `#doctorDecisionTreatmentTask` và
`#doctorClinicalDetailPanel` cùng thuộc `.doctor-clinical-flow__clinical-grid`,
`#doctorPrescriptionWorkspace` là root workspace sibling của panel Khám,
không tràn ngang và không có console error/warn. Tại `768x900`, grid về một cột
và tab Thuốc chuyển sang workspace đơn thuốc riêng. Jinja parse,
`node --check app/static/js/doctor-examination/clinical-workspace-ui.js`,
`python3 scripts/check_frontend_contract.py` và `python3 scripts/smoke_health.py
--http` đều pass. Danh sách chờ rỗng nên panel thực tế đang hidden: chưa pass
visual QA với ca khám hiển thị, hydrate/save dữ liệu thật hoặc A -> B -> A.

QA trước slice bỏ Ghi chú 2026-07-26 cho mật độ Khám chi tiết: template không còn
`.doctor-clinical-detail-panel__chapter`. Browser tại `1280x720` xác nhận đúng
hai nhóm field, lần lượt 7 và 9 control, đều dùng hai cột bằng nhau; tại
`390x844` cả hai quay về một cột. Không có page horizontal overflow hoặc
console error/warn. Jinja parse, `python3 scripts/check_frontend_contract.py`
và `python3 scripts/smoke_health.py --http` đều pass. Danh sách chờ rỗng nên
panel vẫn hidden; chưa pass visual QA với field có dữ liệu thật.

QA cập nhật 2026-07-26 cho chỗ nhập Khám chi tiết: browser tại `1280x720`
xác nhận card chi tiết dùng tỷ lệ outer `0.95fr / 1.05fr`, từng detail field
dùng một cột nội bộ, label có margin-block-start bằng 0 và textarea `width:
100%`; không còn horizontal `label | input` ở trong nửa cột. Tại `390x844`,
group field vẫn một cột và không page horizontal overflow; console error/warn
rỗng. `check_frontend_contract.py` và `smoke_health.py --http` pass. Danh sách
chờ rỗng nên vẫn chưa visual QA với nội dung lâm sàng thật.

QA cập nhật 2026-07-26 cho equal-height Khám: Jinja parse, `node --check
app/static/js/doctor-examination/clinical-workspace-ui.js`,
`check_frontend_contract.py` và `smoke_health.py --http` pass. Browser tại
`1280x720` xác nhận detail card còn 15 field cơ quan/tâm thần, không còn
`examMentalNotes`, paired grid là `align-items: stretch` và Lý do khám/Bệnh sử
nhận `block-size: 100%`. Tại `768x900`, Thần kinh span đủ hai cột; tại
`390x844`, cả paired grid/detail field về một cột. Không có page horizontal
overflow hoặc console error/warn. Danh sách chờ vẫn rỗng nên đây là structural
browser QA; chưa pass visual QA với một ca khám thật, save/load và A -> B -> A.

QA cập nhật 2026-07-26 cho narrative writing surface: browser tại `1280x720`
xác nhận Lý do khám/Bệnh sử override đúng shared horizontal paper-field thành
single column `label -> textarea`; textarea nhận `block-size: 100%`, do đó phần
chiều cao dư là input thực thay vì khoảng trắng. `768x900` vẫn là form ngang
shared và `390x844` một cột; không horizontal overflow hoặc console error/warn.
Danh sách chờ rỗng khiến workspace hidden, nên chưa pass visual QA với dữ liệu
lâm sàng thật.
