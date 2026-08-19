# Prescription Module Context

Tài liệu này là context ngắn cho workflow đơn thuốc. Đọc khi sửa đơn thuốc, mẫu in, QR verify, prescription public API, shared prescription template, hoặc prescription view model.

## Ownership

- `prescriptions`: header đơn thuốc, mã đơn, loại đơn, metadata cách tính liều/số ngày trong cột legacy `cach_dung`, ngày tái khám và tổng tiền.
- `prescription_items`: từng dòng thuốc và là owner duy nhất của số lượng hiện đang lưu/cấp theo appointment.
- `medicine_batches.remaining_quantity`: tồn hiện hành của từng lô; lô còn hạn được cấp theo FEFO.
- `medicines.stock_quantity`: tồn tổng hiện hành dùng bởi các màn kho khác. Cấp/hoàn có truy vết cập nhật cùng đúng delta với lô; hoàn phần đơn cũ không có lô chỉ cập nhật tồn tổng.
- `medicine_transactions`: lịch sử movement append-only. Dòng có truy vết dùng `batch_id` hiện hữu để chỉ đúng lô và hai mẫu `note` hiện hữu (`Xuất theo đơn thuốc - Lịch hẹn ID: ...` / `Hoàn lại tồn kho - Lịch hẹn ID: ...`) để giới hạn movement của đúng appointment. Hoàn phần legacy dùng đúng note hoàn với `batch_id=NULL`, ghi nhận biến động tồn tổng mà không đoán lô. Tổng movement theo appointment/lô chỉ dùng để trả lời lô nào còn đang cấp cho đơn, không thay `prescription_items` làm owner số lượng đơn hoặc `remaining_quantity` làm owner số dư lô. Không thêm cột liên kết mới.
- `examinations.diagnosis`: chẩn đoán raw theo ICD IDs trong flow mới.
- `appointment_relatives`: người đi cùng/người nhận thuốc cho footer đơn H/N.
- `patients`: thông tin định danh, liên hệ, ngày sinh, giới tính, địa chỉ.

## Module Island Hiện Tại

- `app/modules/prescriptions/api/public.py`: public routes cho QR verify, gồm page/API dữ liệu và endpoint PNG sinh QR xác thực cùng domain; QR không phụ thuộc dịch vụ ảnh bên thứ ba.
- `app/modules/prescriptions/api/internal.py`: internal routes cho màn bác sĩ và prescription save/load/history; route đọc/history gọi service thay vì tự build payload.
- `app/modules/prescriptions/services/read_service.py`: owner cho payload đọc đơn theo appointment và lịch sử đơn thuốc theo patient.
- Contract đọc tái khám: `GET /api/prescription/appointment/<appointment_id>` trả `re_examination_date`, `re_examination_time`, `re_examination_service_id`, `re_examination_appointment_id`, `re_examination_status` từ appointment tái khám con còn active khi tồn tại, kể cả khi appointment gốc chưa có dòng prescription; `prescriptions.re_examination_date` chỉ là fallback legacy khi chưa có appointment con.
- Contract trạng thái lịch tái khám: `re_examination_appointment_id` chỉ cho biết lịch con đã tồn tại, không phải cờ khóa. Lịch `SCHEDULED` vẫn được sửa/hủy từ Doctor và save result trả explicit `status`; chỉ lịch `CONFIRMED` là bất biến, `POST /api/prescription/save` phải giữ nguyên ngày/giờ, trả `re_examination_sync_result.skipped=already_confirmed` + `status=CONFIRMED`, Doctor khóa checkbox/datepicker và bản nháp không được ghi đè hai control này.
- Contract tính ngày Doctor: khi bật `Đặt lịch`, ngày giờ mặc định được tính từ ngày local hiện tại cộng đúng số nguyên không âm ở `Số ngày điều trị`, giờ mặc định `09:00`; không fallback ngầm sang 7 ngày. Giá trị trống/không hợp lệ không tự sinh ngày và validation vẫn yêu cầu ngày trước khi lưu.
- Contract overview Doctor: không còn control `Cách dùng chung`; hướng dẫn từng thuốc thuộc `prescription_items.usage`. Ba control `Cách tính liều`, `Số ngày điều trị`, `Hẹn tái khám` nằm cùng một hàng khi prescription component đủ rộng, reflow thành hai hàng rồi một cột theo container. `prescriptions.cach_dung` vẫn giữ JSON `schedule_mode`/`medicine_days`; giá trị `global_usage` cũ được frontend bảo toàn khi save nhưng không còn tham gia draft/focus hoặc được nhập mới.
- Contract tính số lượng Doctor: `Số ngày điều trị` trống không chặn tính toán; các thao tác chủ động chọn thuốc, sửa liều, đổi cách tính hoặc xóa số ngày dùng hệ số 1 ngày để cập nhật ngay số lượng và thành tiền. Nhập `N` ngày sẽ tính lại theo `liều mỗi ngày × N`; xóa `N` quay về liều của 1 ngày. Riêng lần tải đơn cũ, khôi phục nháp hoặc áp dụng đơn lịch sử có `medicine_days` trống phải giữ `prescription_items.quantity` đã lưu, không tự biến đổi dữ liệu trước khi bác sĩ chỉnh công thức.
- `app/modules/prescriptions/services/save_service.py`: owner transaction của save path. Service khóa row `appointments`, đọc baseline duy nhất từ `prescription_items`, gom payload theo `medicine_id`, gọi batch stock owner theo thứ tự medicine id, tạo/update/xóa header/items rồi tự commit hoặc rollback toàn bộ. Route chỉ còn auth/parse, gọi service, emit event và chạy side effect tái khám sau commit.
- `app/modules/prescriptions/services/stock_service.py`: owner cấp/hoàn kho cho prescription. Service khóa `medicines` rồi các `medicine_batches` theo thứ tự ổn định; cấp mới bị giới hạn bởi cả tồn tổng và lô còn hạn, cấp lô theo FEFO, hoàn phần đã truy vết về đúng lô theo reverse-FEFO, hoàn phần legacy chỉ về tồn tổng, append movement bằng mẫu note appointment hiện hữu, và build allocation state cho API/UI.
- `app/modules/prescriptions/services/re_examination_service.py`: owner tạm thời cho side effects tái khám sau khi lưu đơn thuốc, gồm tạo/cập nhật/hủy appointment tái khám, examination liên quan, Google Calendar và reminder; giữ nguyên commit con và cách nuốt lỗi legacy.
- `app/modules/prescriptions/view_models/public_prescription.py`: view model public prescription verify.
- `app/modules/prescriptions/view_models/print_prescription.py`: internal view model cho print/preview đơn thuốc theo appointment, gom patient/history/examinationDetail/examinationDetailsBySection/prescriptionData/relatives bằng contract backend, trong đó diagnosis/benh_kem_theo là display text và `*_ids` giữ raw ICD IDs.
- `app/modules/prescriptions/public_api.py` và `app/modules/prescriptions/view_model.py`: wrapper tương thích cho import path cũ, không đặt logic mới ở đây.
- `app/api/prescription.py`: wrapper tương thích cho internal prescription API path cũ; `main.py` dùng module path mới.
- `app/templates/verify-prescription.html`: template verify hiện còn ở thư mục Jinja hiện tại để giữ path ổn định.
- `app/static/css/prescriptions/pages/verify-prescription.css`: CSS riêng của page QR verify, tách khỏi inline template.
- `app/static/js/prescriptions/pages/verify-prescription.js`: page bootstrap cho QR verify, chỉ fetch public API và gọi renderer dùng chung.
- `app/static/js/prescriptions/pages/doctor-prescription-print.js`: adapter dữ liệu in từ màn bác sĩ; nhận dependency từ `prescription-ui.js` qua factory để giữ appointment hiện tại và `prescriptionCodesByType` không bị global hóa, sau đó giao tài liệu cho component in dùng chung.
- `app/static/js/prescriptions/components/prescription-modal-preview.js`: preview/tab đơn thuốc trong modal lịch sử bệnh nhân; giữ expose `window.renderPrescriptionPage`, `window.setupPrescriptionTabPagination`, `window.PRESCRIPTION_PAGE_COLORS` và `_prescriptionTabPageIndex` cho caller cũ.
- `app/static/css/patient-search-modal.css`: owner presentation của document HTML trong modal; header logo/thông tin/cụm mã cùng căn đỉnh, badge và barcode dùng khoảng cách gọn. Title hai dòng của đơn thuốc đặt spacing trên `.prescription-title-section`, còn title đơn dòng hóa đơn/bệnh án đặt trên `.prescription-preview__title--document`, cùng contract hiển thị `20px 0 45px`. QR xác thực trong HTML modal hiển thị ở `8.125rem` (130px với root mặc định), giữ tỷ lệ và tự co theo ô chứa; kích thước PNG tự nhiên không được quyết định layout.
- `app/static/js/prescriptions/components/prescription-modal-print.js`: adapter dữ liệu in từ modal lịch sử legacy; đọc modal state qua `window.modalSelectedPatient`, `window.modalMedicalHistoryData`, `window.modalSelectedHistoryIndex`, giao tài liệu cho component in dùng chung và giữ expose `window.printModalPrescription` cho caller cũ.
- `app/static/js/prescriptions/components/prescription-print-document.js`: owner duy nhất của page model BASIC/H/N, print context, cửa sổ loading/error, document shell, asset A4, barcode, image/font readiness và lifecycle gọi `window.print()` cho mọi luồng in đơn thuốc. Popup loading, document và error đều điều hướng qua Blob URL cùng origin; không ghi lại `about:blank` bằng `document.open/write/close` sau async. QR xác thực là print asset bắt buộc: chỉ gọi in khi ảnh có `naturalWidth > 0`; nếu tải lỗi/hết timeout thì giữ cửa sổ ở trạng thái `data-print-ready="error"` và hiện cảnh báo, không in bản thiếu QR.
- `app/static/css/prescriptions/components/prescription-print-document.css`: owner duy nhất của layout A4 khi in đơn thuốc; logo/thông tin/cụm mã cùng hàng, badge mã đơn ở đầu cụm phải, barcode + mã hồ sơ nằm bên dưới. Nội dung dùng normal flow theo chiều cao thật, QR/chữ ký theo sát lời dặn bằng khoảng cách cố định, không ép `280mm` hoặc dùng `margin-top: auto`; trang BASIC/H/N sau trang đầu dùng `break-before`, footer dưới 18 tuổi nằm trong flow và chống tách trang. CSS preview modal và CSS form Doctor không được ghi đè layout này.
- `app/static/js/prescriptions/components/prescription-preview-scaler.js`: component scale document preview cho viewer mobile/verify.
- `app/static/js/prescriptions/shared/prescription-document-template.js`: document template dùng chung cho print/verify/preview; expose các helper global legacy như `buildPrescriptionPreviewHTML()` để giữ caller cũ hoạt động. Ảnh QR bản in dùng `GET /api/public/prescription/<code>/verification-qr.png` và được đánh dấu `data-required-print-asset="verification-qr"`.
- `scripts/check_prescription_print_contract.py`: guardrail cho A4 owner, normal-flow pagination, spacing QR/chữ ký, footer H/N dưới 18 tuổi, QR cùng domain và print readiness; được chạy trong `check_frontend_contract.py`.

## Ghi chú cách dùng thuốc

- `app/static/js/doctor-examination/prescription-model.js` sở hữu generator
  `buildMedicineUsageNote()` và hai mode lịch dùng: theo buổi hoặc theo
  lần/ngày.
- `app/static/js/doctor-examination/prescription-ui.js` gọi generator khi
  thay đổi liều, số ngày, đường dùng, đơn vị hoặc mode; `usageNoteMode` bảo vệ
  ghi chú bác sĩ nhập tay khỏi bị ghi đè.
- `prescription_items.usage` vẫn là JSONB hiện hữu. `note_mode` chỉ là khóa bổ
  sung trong JSON để phân biệt `generated`/`manual`; không tạo field DB mới và
  không thay đổi contract lưu đơn thuốc.
- Ghi chú legacy có text nhưng chưa có `note_mode` được coi là `manual` để
  bảo toàn dữ liệu; việc tái sinh hàng loạt legacy note là migration riêng,
  chưa thực hiện.
- Số lượng cấp thuốc mới luôn là số nguyên làm tròn lên trước khi tính tiền,
  kiểm tồn, trừ tồn và ghi `prescription_items`; liều lẻ chỉ tồn tại trong
  lịch dùng/ghi chú. Các đơn cũ có số lẻ không bị migration tự động.
- Ngày điều trị trống có hiệu lực tính toán là 1 ngày cho thao tác đang nhập,
  nên số lượng/tổng tiền không được đứng ở 0 chỉ vì chưa nhập số ngày. Guard
  bảo toàn số lượng cũ chỉ áp dụng ở lần load/restore/reuse ban đầu; ngay khi
  bác sĩ chọn thuốc, sửa liều, đổi mode hoặc sửa số ngày thì công thức hiện
  hành trở thành owner của số lượng hiển thị.
- Cutover tồn kho dùng `prescription_items` hiện hữu làm baseline đã phản ánh
  trong `medicines.stock_quantity`; không tự điều chỉnh tồn hoặc backfill
  `appointment_id` cho audit cũ. Đơn legacy phòng khám thiếu `medicine_id` bị
  chặn lưu và yêu cầu map lại, tuyệt đối không đoán theo tên.
- Cutover theo lô không backfill hoặc suy đoán lô cho đơn cũ. Save không đổi số
  lượng (`delta = 0`) vẫn được phép. Khi giảm/xóa, phần có movement gắn lô được
  hoàn đúng lô theo reverse-FEFO; phần legacy còn lại chỉ cộng vào tồn tổng và
  ghi movement hoàn với `batch_id=NULL`, tuyệt đối không tự chọn một lô.
- Không bắt tồn tổng phải bằng tổng `remaining_quantity` theo lô vì đơn cũ có
  thể đã trừ tồn tổng mà chưa trừ lô. Cấp mới chỉ được lấy tối đa bằng giá trị
  nhỏ hơn giữa tồn tổng và tổng lô còn hạn, nhờ đó giữ nguyên độ lệch lịch sử,
  không tự đối soát và vẫn không thể cấp vượt kho.
- `GET /api/prescription/appointment/<id>` gắn `batch_allocation` vào từng thuốc;
  save response trả `stock_updates` (movement của lần lưu) và
  `stock_allocation_states` (phân bổ hiện hành). Doctor hiển thị trực tiếp mỗi
  lô đã cấp thành một block xanh riêng gồm số lô và số đã cấp. Số còn lại của
  Doctor luôn hiển thị đúng một dòng `Tồn kho` lấy từ tồn tổng dưới mỗi thuốc
  trong kho. Block lô chỉ hiển thị số lô và số đã cấp; không có dòng tồn thứ hai,
  không có dòng tóm tắt `Đã cấp đủ`, nút mở/thu gọn hoặc nhãn kỹ thuật cho đơn
  cũ/không truy vết đủ. Màu cam chỉ báo thay đổi của đơn mới hoặc đơn đã truy
  vết đang chờ lưu. Backend vẫn giữ chi tiết kiểm tồn để đối soát, nhưng Doctor
  không đổ chi tiết kỹ thuật vào toast; lỗi thiếu tồn chỉ hiện
  `Không đủ thuốc trong kho. Vui lòng kiểm tra số lượng đã kê và tồn kho.`
- Dòng thuốc trong cơ sở luôn hiển thị ngắn `Tồn kho: N đơn vị` từ
  `current_stock_quantity`/catalog stock; thuốc ngoài cơ sở không hiển thị tồn.
  Dòng tồn không bị thay bằng trạng thái chờ cập nhật phân bổ lô khi bác sĩ sửa
  liều.
- Đơn vị thuốc nằm ngay trong ô `Số lượng`. Thuốc trong kho dùng đơn vị từ
  catalog và chỉ đọc; thuốc ngoài cho phép sửa đơn vị tại chính ô này. Doctor
  không lặp lại `Dạng thuốc` hay nhãn mặc định `Trong kho`; chỉ hiện ngoại lệ
  `Thuốc ngoài` trong metadata của dòng thuốc ngoài cơ sở. Payload và owner dữ
  liệu `prescription_items.unit` không đổi.

## Mapping Phase 5

- Cũ: `app/modules/prescriptions/public_api.py` -> Mới: `app/modules/prescriptions/api/public.py`.
- Cũ: `app/modules/prescriptions/view_model.py` -> Mới: `app/modules/prescriptions/view_models/public_prescription.py`.
- Cũ: `app/api/prescription.py` -> Mới: `app/modules/prescriptions/api/internal.py`.
- Đọc/history tách từ `app/modules/prescriptions/api/internal.py` -> `app/modules/prescriptions/services/read_service.py`.
- Save helper/header sync/stock transaction/prescription item creation tách từ `app/modules/prescriptions/api/internal.py` -> `app/modules/prescriptions/services/save_service.py`.
- Side effects tái khám sau khi lưu đơn tách từ `app/modules/prescriptions/api/internal.py` -> `app/modules/prescriptions/services/re_examination_service.py`.
- Print/preview view model nội bộ thêm tại `app/modules/prescriptions/view_models/print_prescription.py`, endpoint mới `GET /api/prescription/appointment/<appointment_id>/print-view-model`.
- Orchestration in đơn thuốc từ form bác sĩ tách từ `app/static/js/doctor-examination.js` -> `app/static/js/prescriptions/pages/doctor-prescription-print.js`; `doctor-examination.js` chỉ giữ bridge `preparePrescriptionDataForPrint()` và `printMainPrescription()` cho caller cũ.
- Preview/tab đơn thuốc trong modal lịch sử tách từ `app/static/js/patient-search-modal-dry.js` -> `app/static/js/prescriptions/components/prescription-modal-preview.js`; `patient-search-modal-dry.js` chỉ giữ bridge `renderPrescriptionPage()` và `setupPrescriptionTabPagination()` cho caller cũ.
- Orchestration in đơn thuốc từ modal lịch sử tách từ `app/static/js/patient-search-modal-dry.js` -> `app/static/js/prescriptions/components/prescription-modal-print.js`; `patient-search-modal-dry.js` chỉ giữ bridge `printModalPrescription()` cho caller lexical cũ trong `printModalTabContent()`.
- Shared document template dời từ `app/static/js/shared-prescription-template.js` -> `app/static/js/prescriptions/shared/prescription-document-template.js`; template include runtime đã cập nhật ở verify, doctor và psychologist screens.
- URL page/data giữ nguyên: `GET /verify/rx/<prescription_code>` và `GET /api/public/prescription/<prescription_code>`.
- URL QR ảnh cùng domain: `GET /api/public/prescription/<prescription_code>/verification-qr.png`.
- URL internal giữ nguyên dưới prefix `/api/prescription/...`.
- Template verify vẫn giữ ở `app/templates/verify-prescription.html`; CSS/JS page verify, orchestration doctor print và shared document template đã tách sang `app/static/.../prescriptions/...`.

Smoke thực tế 2026-05-30: user đã test lưu đơn/tái khám sau khi tách `re_examination_service.py` và xác nhận hoạt động đúng.

Smoke thực tế 2026-05-30: user đã test lát print/preview view model nội bộ và xác nhận đạt.

Smoke thực tế 2026-05-30: user đã test lát tách frontend verify CSS/JS/component và xác nhận ổn.

Ghi chú triển khai 2026-05-30: tách orchestration in đơn thuốc từ màn bác sĩ sang `app/static/js/prescriptions/pages/doctor-prescription-print.js`. `doctor-examination.js` vẫn giữ wrapper tên hàm cũ để nút `printPrescriptionBtn` và caller legacy không đổi; load order trong `doctor-examination.html` đặt file mới sau `patient-search-modal-dry.js` và trước `doctor-examination.js`.

Smoke thực tế 2026-05-30: user đã test luồng in đơn thuốc bác sĩ sau khi tách `doctor-prescription-print.js` và xác nhận có vẻ ổn.

Ghi chú triển khai 2026-05-30: dời shared document template sang `app/static/js/prescriptions/shared/prescription-document-template.js`; chỉ đổi static path, không đổi logic render hoặc tên helper global legacy.

Validation thực tế 2026-05-30: static asset shared mới trả `200`, verify page/màn bác sĩ/màn tâm lý render `200` và HTML runtime đều trỏ sang path mới; public prescription API mã `798362405010-N` trả diagnosis text và `diagnosis_ids` đúng contract.

Ghi chú triển khai 2026-05-30: tách `printModalPrescription()` sang `app/static/js/prescriptions/components/prescription-modal-print.js`; `patient-search-modal-dry.js` giữ bridge để `printModalTabContent('prescription-content')` không đổi.

Validation thực tế 2026-05-30: `node --check` qua cho component modal print mới và các JS prescription/doctor/psychologist liên quan; static asset `/static/js/prescriptions/components/prescription-modal-print.js` trả `200`; doctor/psychologist/verify pages render `200`; HTML runtime load component modal print sau `patient-search-modal-dry.js` và trước page script.

Smoke thực tế 2026-05-30: user đã test lát `prescription-modal-print.js` và xác nhận in đơn từ modal lịch sử ổn.

Ghi chú triển khai 2026-05-30: tách preview/tab đơn thuốc trong modal lịch sử sang `app/static/js/prescriptions/components/prescription-modal-preview.js`; `patient-search-modal-dry.js` giữ bridge cho `renderPrescriptionPage()` và `setupPrescriptionTabPagination()`.

Validation thực tế 2026-05-30: `node --check` qua cho component modal preview mới và các JS prescription/doctor/psychologist liên quan; static asset `/static/js/prescriptions/components/prescription-modal-preview.js` trả `200`; doctor/psychologist/verify pages render `200`; HTML runtime load modal preview sau `patient-search-modal-dry.js` và trước modal print/page script; public prescription API mã `798362405010-N` vẫn trả diagnosis text và `diagnosis_ids` đúng contract.

Smoke thực tế 2026-05-30: user đã test lát `prescription-modal-preview.js`; preview tab đơn thuốc và luồng liên quan hoạt động như trước, xác nhận code mới đang được load qua `printModalPrescriptionFromComponent` và `renderPrescriptionPageFromComponent`.

Ghi chú triển khai 2026-08-12: chuẩn hóa `PrescriptionPrintDocument` làm owner in đơn thuốc dùng chung. Nút `In đơn` trên Doctor, `.tab-print-btn` trong modal lịch sử Doctor và modal đơn thuốc legacy đều chỉ còn là adapter dữ liệu; không còn tự dựng print window, tự gắn barcode hoặc giữ stylesheet A4 riêng. Modal lịch sử Doctor dựng lại tài liệu bằng `paginationOptions` ở `renderContext="print"`, không clone HTML preview màn hình. Logic dữ liệu hiện tại/chưa lưu của Doctor và dữ liệu lịch sử đã lưu vẫn tách đúng boundary.

## Frontend Boundary Còn Lại

- `app/static/js/patient-search-modal-dry.js` vẫn giữ bridge cho prescription để tương thích với caller cũ, nhưng implementation chính của document template, verify page, doctor print, modal print và modal preview đã thuộc `app/static/js/prescriptions/`.
- Chưa nên tách các fetch helper như `fetchPatientDetailForPrescription`, `fetchExaminationDetailForPrescription`, `fetchPrescriptionDataForAppointment` trong một lát nhỏ vì chúng đang phục vụ cả đơn thuốc, dịch vụ và bệnh án.
- Chưa nên tách usage/schedule formatter khỏi doctor/psychologist ngay nếu chưa đi theo một lát riêng có kiểm tra prescription form, vì nhóm helper này đang dính trực tiếp tới nhập đơn thuốc, preview lịch sử và shared document template.
- Lát tiếp theo nên chuyển sang đánh giá module island tiếp theo hoặc một contract backend rõ ràng, thay vì tiếp tục bóc frontend prescription khi phần còn lại đã bắt đầu cross-cutting.

## Public Verify Contract

- URL page giữ nguyên: `GET /verify/rx/<prescription_code>`.
- URL API giữ nguyên: `GET /api/public/prescription/<prescription_code>`.
- URL ảnh QR: `GET /api/public/prescription/<prescription_code>/verification-qr.png`; trả PNG chỉ chứa URL verify công khai, không nhúng dữ liệu bệnh nhân vào QR.
- API public không yêu cầu auth vì QR verify là public by design.
- `diagnosis` là display text đã resolve ICD.
- `diagnosis_ids` giữ raw ICD IDs.
- `relatives` phải trả danh sách người đi cùng nếu appointment có dữ liệu.
- Không trả raw ICD ID làm text hiển thị.

## Render Context Contract

- Web/in là document layout chuẩn.
- Verify/mobile là viewer, không được phá layout document.
- Cặp cột patient/medicine giữ 6/4 trên verify mobile.
- Verify có thể ẩn QR nội bộ/chữ ký của bản in bằng options, nhưng không đổi cấu trúc mẫu.
- HTML modal và A4 có CSS owner riêng: modal giới hạn `.rx-verify-qr-image` ở `8.125rem`; bản in tiếp tục dùng kích thước A4 của `prescription-print-document.css`. Không sửa độ phân giải ảnh nguồn để chữa layout.
- Shared template phải giữ default tương thích với caller cũ.
- `buildPrescriptionDocumentViewModel()` trong shared template là lớp normalize frontend cuối cùng: không để raw numeric ICD ID hiển thị thành chẩn đoán nếu backend/caller đưa nhầm raw value.
- Page verify không được tự render mẫu đơn lớn; chỉ fetch public API, gọi `buildPrescriptionPreviewHTML()` và dùng `prescription-preview-scaler.js` để scale viewer.

## Validation

Khi sửa workflow này, chạy checklist `Prescription Print And Verify` trong `references/smoke-checks.md`.

Tối thiểu:

- `python3 -m py_compile main.py app/modules/prescriptions/api/public.py app/modules/prescriptions/api/internal.py app/modules/prescriptions/services/read_service.py app/modules/prescriptions/services/save_service.py app/modules/prescriptions/services/stock_service.py app/modules/prescriptions/services/re_examination_service.py app/modules/prescriptions/view_models/public_prescription.py app/modules/prescriptions/view_models/print_prescription.py app/modules/prescriptions/public_api.py app/modules/prescriptions/view_model.py app/api/prescription.py`
- `python3 scripts/check_prescription_stock_contract.py`
- `python3 scripts/qa_prescription_stock_concurrency.py --run` trên DB QA/local: script tạo dữ liệu tạm, dùng session PostgreSQL độc lập cho race condition và luôn cleanup trong `finally`.
- `node --check app/static/js/doctor-examination/prescription-row-renderer.js app/static/js/doctor-examination/prescription-ui.js app/static/js/doctor-examination/support-modules-ui.js app/static/js/doctor-examination/workspace-save-controller.js`
- `node --check app/static/js/prescriptions/shared/prescription-document-template.js app/static/js/patient-search-modal-dry.js app/static/js/doctor-examination.js app/static/js/psychologist-examination.js app/static/js/prescriptions/pages/verify-prescription.js app/static/js/prescriptions/pages/doctor-prescription-print.js app/static/js/prescriptions/components/prescription-modal-preview.js app/static/js/prescriptions/components/prescription-modal-print.js app/static/js/prescriptions/components/prescription-print-document.js app/static/js/prescriptions/components/prescription-preview-scaler.js`
- `GET /api/public/prescription/<code>` hợp lệ và mã không tồn tại.
- `GET /api/public/prescription/<code>/verification-qr.png` trả `200 image/png` với mã hợp lệ, giải mã về đúng `/verify/rx/<code>`; mã không tồn tại trả `404`.
- Browser modal Toa thuốc với đơn ngắn, đơn dày và history chưa có đơn: QR hợp lệ hiển thị 130x130 dù PNG tự nhiên lớn hơn; không có ảnh lỗi hoặc overflow ngang; trạng thái chưa có đơn không dựng QR.
- `GET /verify/rx/<code>` trong browser, kiểm console và mobile viewport nếu đụng layout.
- Static assets verify mới trả `200`: `/static/css/prescriptions/pages/verify-prescription.css`, `/static/js/prescriptions/pages/verify-prescription.js`, `/static/js/prescriptions/components/prescription-preview-scaler.js`.
- Static asset doctor print mới trả `200`: `/static/js/prescriptions/pages/doctor-prescription-print.js`.
- Static asset modal preview mới trả `200`: `/static/js/prescriptions/components/prescription-modal-preview.js`.
- Static asset modal print mới trả `200`: `/static/js/prescriptions/components/prescription-modal-print.js`.
- Static assets print document dùng chung trả `200`: `/static/js/prescriptions/components/prescription-print-document.js`, `/static/css/prescriptions/components/prescription-print-document.css`.
- Static asset shared document template mới trả `200`: `/static/js/prescriptions/shared/prescription-document-template.js`.
- `GET /api/prescription/appointment/<appointment_id>/print-view-model` trong phiên đăng nhập trả diagnosis display text và `diagnosis_ids` raw IDs.

Bugfix thực tế 2026-05-31: appointment gốc có lịch tái khám con nhưng chưa có prescription header từng làm block “Hẹn tái khám” không populate lại trong màn bác sĩ. `read_service.py` giờ trả lịch tái khám active từ `appointments.original_appointment_id` trước, fallback về `prescriptions.re_examination_date` khi chưa có appointment con; `doctor-examination.js` và `reexam-calendar.js` giữ thêm `re_examination_service_id` để mở lại modal đúng dịch vụ. Kiểm trực tiếp trước smoke test với appointment `998` của Phạm Khôi đã trả lịch con `1016`; sau khi user thao tác lại và lịch con `1016` bị cancel/soft-delete, payload `998` trả null đúng contract vì không còn lịch active. Validation hiện dùng thêm chuỗi appointment `872 -> 974` còn active để chứng minh fallback/populate lịch tái khám vẫn hoạt động; user đã smoke test và xác nhận UI hoạt động đúng.

Bugfix thực tế 2026-06-03: lưu đơn thuốc từ màn bác sĩ không còn định danh thuốc trong kho bằng exact `medicine_name`. Save path ưu tiên `medicine_id` đã chọn từ combobox để validate tồn kho, gom delta và tạo stock transaction; `medicine_name` chỉ là snapshot hiển thị trong `prescription_items`.

Bugfix thực tế 2026-06-07: chuẩn hóa identity thuốc phòng khám theo `prescription_items.medicine_id`. Save tạo prescription item kèm `medicine_id`; read/history/public payload đọc medicine metadata bằng id. Khi áp dụng đơn cũ, item phòng khám thiếu id hoặc trỏ tới thuốc kho hiện đã inactive/hết tồn/không đủ tồn sẽ được copy thành dòng cần chọn thuốc kho hiện tại, không autosave/trừ kho cho đến khi user chọn `medicines.id` mới từ autocomplete. Các thống kê tồn kho/lịch sử kê thuốc chính đã đổi group/filter theo `medicine_id`; `medicine_name` chỉ còn làm label hiển thị hoặc search text. Script DB cần chạy: `scripts/add_medicine_id_to_prescription_items.sql`.

## Next Refactor Steps

1. Commit boundary của đơn chính đã thuộc `save_service`; side effect tái khám vẫn cố ý chạy sau commit và trả kết quả riêng, chưa nhập vào transaction tồn kho.
2. Khi đủ smoke checks, cân nhắc gom template/static prescription vào thư mục con rõ nghĩa.
3. Nếu đổi API shape, cập nhật `references/data-contracts.md` và checklist liên quan cùng lúc.
