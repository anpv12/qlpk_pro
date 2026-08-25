# Patient History Modal Base

`Tìm kiếm bệnh nhân` là shared, page-lifetime component. Mọi màn hình dùng modal
này phải reuse cùng markup và lifecycle; không dựng lại một modal có HTML/ID
tương tự.

## Owners

- Markup duy nhất: `app/templates/partials/patient-search-modal.html`.
- Layout duy nhất: `app/static/css/patient-search-modal.css`.
- Low-level search/history primitives: `app/static/js/components/modal-patient-search-ui.js`.
- Public lifecycle base: `app/static/js/components/patient-history-modal.js`, global
  `window.QLPKPatientHistoryModal`.
- Optional default readers/renderers: `modal-history-data-runtime.js`.
- Optional print actions: `modal-history-print-controller.js`.
- Guardrail: `scripts/check_patient_history_modal_contract.py`.

Trong tab Toa thuốc, `patient-search-modal.css` sở hữu kích thước hiển thị của
`.rx-verify-qr-image`: QR là `8.125rem` (130px ở root mặc định), giữ tỷ lệ và
tự co tối đa theo ô chứa. Độ phân giải tự nhiên của PNG có thể lớn hơn để ảnh
nét, nhưng không được phép quyết định kích thước layout HTML của modal.

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

Trong bảng lịch sử, badge `Chờ thanh toán` (`WAITING_PAYMENT`) dùng semantic
feedback success màu xanh lá; `Đang khám` vẫn dùng màu xanh dương và các trạng
thái lịch sử khác giữ màu trung tính.
