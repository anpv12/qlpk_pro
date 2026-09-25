# Patient History Modal Base

`Tìm kiếm bệnh nhân` là shared, page-lifetime component. Mọi màn hình dùng modal
này phải reuse cùng markup và lifecycle; không dựng lại một modal có HTML/ID
tương tự.

## Owners

Vạch trái của dòng lịch sử chỉ xuất hiện sau khi người dùng click chọn:
`modal-history-item-user-selected` dùng màu primary chung. Mỗi danh sách chỉ
có một vạch; click dòng khác chuyển vạch sang dòng đó. Preview vẫn được chọn
mặc định như trước, nhưng `modal-history-item-active` không tự tạo vạch.
Render lại danh sách/xóa context sẽ bỏ dấu chọn này. Trạng thái Đang khám và
Lượt hiện tại giữ nhãn/nền hiện có, không sở hữu border-left riêng.

- Markup duy nhất: `app/templates/partials/patient-search-modal.html`.
- Layout duy nhất: `app/static/css/patient-search-modal.css`.
- Low-level search/history primitives: `app/static/js/components/modal-patient-search-ui.js`.
- History row renderer: `app/static/js/components/modal-medical-history-list-ui.js`.
- Public lifecycle base: `app/static/js/components/patient-history-modal.js`, global
  `window.QLPKPatientHistoryModal`.
- Optional default readers/renderers: `modal-history-data-runtime.js`.
- Optional print actions: `modal-history-print-controller.js`.
- Guardrail: `scripts/check_patient_history_modal_contract.py`.

Trong tab Toa thuốc, `prescription-modal-preview.js` gọi
`buildPrescriptionScreenHTML()` trong shared `prescription-document-template.js`.
CSS web riêng `prescriptions/components/prescription-screen.css` được import bởi
`patient-search-modal.css`: thẻ trắng, logo/mã vạch hồ sơ, tiêu đề xanh và nhãn
song ngữ theo mẫu user ngày 10/09/2026. Thông tin bệnh nhân 2 cột, co thành 1
cột theo chiều rộng khung; không có kích thước A4 hoặc lề vật lý trên web.
Danh sách thuốc dùng khoảng cách để phân tách, không kẻ ngang giữa các thuốc
(theo phản hồi user 11/09/2026). Cột Số lượng và cột Giới tính/SĐT dùng chung
`--rx-screen-columns`/`--rx-screen-column-gap`, căn trái cùng mốc. Heading
thuốc bù indent của ordered list để grid không bị lệch 1.5rem; tên thuốc vẫn
chừa chỗ cho số thứ tự. Ở container ≤34rem, cả hai về một cột và Số lượng
nằm ngay dưới tên thuốc. Khối ký tên cũng dùng grid này: tất cả dòng ngày,
chức danh, ký tên và tên bác sĩ nằm trong cột phải, căn trái cả chữ bên
trong theo mốc Số lượng (không chỉ căn khung); mobile chuyển sang cột 1. Không dùng fit-content/margin auto để tự
đẩy khối ký tên sang phải.
Chuỗi constraint: modal body → row/column → right-inner → tab-content/pane/card
(flex, min-height 0) → tab-body-scroll (scroll owner) → modalContentArea (inline
size container) → rx-screen (width 100%, normal flow). Trên mobile, modal body
cuộn và hai cột lịch sử/nội dung xếp dọc theo shell hiện có.

Web và giấy dùng chung view-model cùng formatter tên thuốc/liều dùng; dữ liệu
backend, lifecycle tải/xóa và chính sách tái khám giữ nguyên. Trường BHYT để
trống vì Patient hiện chưa có field canonical. Tuổi tính tại ngày lượt khám.
Nút In gọi `PrescriptionPrintDocument` → `buildPrescriptionPreviewHTML()`
và CSS mẫu Bộ Y tế → `QLPKPdfPreview` để mở PDF thật trong tab mới;
không tự in/tự đóng, người dùng dùng Ctrl+P/Cmd+P. Không clone DOM `.rx-screen`.
Public verify vẫn dùng mẫu
`buildPrescriptionPreviewHTML()` hiện tại. Không đưa CSS web vào print document.

Modal dùng fixed DOM IDs nên contract là tối đa một instance trong một document.
Nhiều workflow/page được reuse cùng component, không phải nhiều bản modal trong
cùng một page.

## Public API

```js
const patientHistoryModal = window.QLPKPatientHistoryModal.getOrCreate({
  document,
  apiCall,
  showToast,
  contextOptions: {
    getCurrentPatientData: () => currentPatient,
    getCurrentAppointmentId: () => currentAppointmentId
  }
});

patientHistoryModal.bindTrigger('historyButton', { prefillCurrent: true });
patientHistoryModal.open({ prefillCurrent: false });
patientHistoryModal.openPatient(patientId);
patientHistoryModal.reset();
patientHistoryModal.close();
```

Base còn expose `context` cho adapter legacy có thời hạn, `dataRuntime`,
`printController`, `bindControls()` và `getState()`. `getOrCreate()` luôn trả
cùng instance gắn với `#patientSearchModal`, vì vậy bind control/print/trigger
không được lặp khi một page initializer chạy lại.

Component không có `destroy()` giả: listener hiện tại là page-lifetime. Khi đổi
bệnh nhân phải gọi `reset()` trước khi dữ liệu mới render; browser navigation sẽ
thu hồi document và toàn bộ listener.

## Cách tích hợp màn hình mới

1. Include đúng một lần `{% include 'partials/patient-search-modal.html' %}` và
   load `patient-search-modal.css`; không copy markup.
2. Load `ModalFunctionTabsUi`, `ModalPatientSearchUi` và
   `ModalMedicalHistoryListUi` trước `patient-history-modal.js`.
3. Nếu dùng default five-tab readers/print, load data runtime và print controller
   trước base. Nếu workflow có renderer/print riêng, truyền adapter và đặt
   `dataRuntime: false` hoặc `print: false` rõ ràng.
4. Gọi `QLPKPatientHistoryModal.getOrCreate()` đúng một lần, chỉ truyền callback
   nghiệp vụ theo role/workflow. Không gọi
   `createWorkflowModalSearchContext()` từ page script.
5. Trước khi hoàn tất, chạy contract, frontend contract và browser QA với empty,
   dữ liệu dài/dày, đổi bệnh nhân A -> B -> A, mở/đóng lại, chuyển tab và các
   interaction được bật trên màn hình đó.

Nếu workflow bật tab Toa thuốc, browser QA phải kiểm thêm QR ở đơn ngắn và đơn
dày: ảnh tải thành công, hiển thị 130x130, không làm document/modal tràn ngang;
history chưa có đơn không được dựng QR giả.

Base này là read-only history/search shell. Việc mở một bệnh nhân/lượt khám,
copy dữ liệu vào form hoặc xóa lượt khám chỉ tồn tại khi adapter của workflow
truyền action và quyền tương ứng; base không tự tạo API ghi, save owner hoặc
suy luận quyền từ text hiển thị.

### Search visibility contract

Danh sách `Tìm kiếm bệnh nhân` chỉ trả hồ sơ có ít nhất một appointment
`CONFIRMED` và `is_deleted = false`. Các hồ sơ chỉ có appointment
`SCHEDULED`, `CANCELLED`, `NO_SHOW` hoặc đã xóa mềm không xuất hiện; lịch
`CONFIRMED` gần nhất mới được dùng cho `last_appointment`.

## Nhãn và bố cục lịch sử (2026-09-10)

- Cột ngày chỉ có nhãn chữ nhỏ `Lượt hiện tại` khi appointment trùng context
  đang khám, hoặc `Hôm nay` theo ngày. Không lặp pill `Lịch sử`/`Đang khám`
  dưới mỗi ngày. Trạng thái lâm sàng vẫn lấy từ `exam.status` ở cột trạng thái.
- Badge trạng thái dùng primitive `qlpk-status`, map biến trong CSS owner
  của modal: nền màu đặc, chữ trắng, bo góc 0.3rem, font small (12px) và
  medium, padding 0.2rem 0.45rem. Theo phản hồi user, giữ màu trạng thái rõ:
  đang khám xanh dương; chờ thanh toán amber; màu mặc định/chờ chuyển khám
  dùng nâu thương hiệu thay xám. Không dùng lại nền xám hoặc chữ lớn/đậm.
  Không thay palette trạng thái ở màn khác.
- Header và row cùng grid: ngày 9rem, chẩn đoán co giãn, trạng thái 8.5rem,
  thao tác 4.5rem. History section là inline-size container. Khi rộng tối đa
  36rem, ẩn header và chuyển chẩn đoán xuống hàng riêng; ngày, trạng thái,
  thao tác giữ hàng đầu. Scroll vẫn thuộc scroll-body hiện có.
- Browser QA với Ngô Hiển Đạt (4 lượt) và Nguyễn Duy Bách (11 lượt, chẩn đoán
  dài), đổi A→B→A, chọn lượt, ở 1600x900 và 390x844: badge một dòng, không
  chồng/tràn ngang, console sạch. QA kết nối DB bằng transaction chỉ đọc.
