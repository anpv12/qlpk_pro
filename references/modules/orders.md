# Orders Module Context

Tài liệu này là context ngắn cho workflow chỉ định cận lâm sàng/orders. Đọc khi sửa chỉ định theo appointment, màn quản lý chỉ định, danh mục chỉ định, upload/download file kết quả, hoặc API `/api/chi-dinh` và `/api/order-*`.

## Ownership

- `chi_dinh`: chỉ định theo appointment, người/đơn vị thực hiện, trạng thái xử lý, ghi chú điều dưỡng/bệnh nhân, ngày hẹn thực hiện và file kết quả.
- `order_categories`: cây danh mục chỉ định.
- `order_items`: item chỉ định trong danh mục, gồm mã, tên, performer, group parent và trạng thái active.
- `survey_templates`: có thể được tham chiếu khi chỉ định là khảo sát tâm lý.
- `appointments`, `patients`, `examinations`: chỉ được đọc để enrich response orders; không dùng orders để ghi đè dữ liệu khám/bệnh nhân.

Không lưu thông tin chẩn đoán, lời dặn hay dữ liệu khám chính vào `chi_dinh`. Diagnosis trong response đọc chỉ là display/enrichment từ appointment/examination.

## Module Island Hiện Tại

- `app/modules/orders/api/chi_dinh.py`: routes cho `/api/chi-dinh`, gồm list/detail/save theo appointment, update/delete, batch delete, upload/delete/download file kết quả.
- `app/modules/orders/api/catalog.py`: routes cho `/api/order-categories`, `/api/order-items`, `/api/survey-templates-for-orders`.
- `app/modules/orders/services/clinical_order_query.py`: owner cho query/filter/pagination của `GET /api/chi-dinh`.
- `app/modules/orders/services/clinical_order_mutation.py`: owner cho load/upsert/update/delete/batch delete chỉ định theo appointment.
- `app/modules/orders/services/result_file_service.py`: owner cho upload/delete/download file kết quả và metadata `result_files`.
- `app/modules/orders/services/catalog_query.py`: owner cho query đọc catalog: category tree, category list, order item list và survey templates cho orders.
- `app/modules/orders/services/catalog_mutation.py`: owner cho create/update/delete category và order item, gồm validate parent/group/default category.
- `app/modules/orders/view_models/clinical_order.py`: owner cho response shape đọc/list/detail của `chi_dinh`, gồm appointment/patient/doctor enrichment và diagnosis display contract.
- `app/modules/orders/view_models/catalog.py`: owner cho serializer cây danh mục, category row, order item/group path và survey template cho orders.
- `app/static/js/orders/order-status-utils.js`: shared frontend helper thuần cho nhãn và CSS class của trạng thái chỉ định ở màn bác sĩ/tâm lý gia.
- `app/static/js/orders/order-tree-utils.js`: shared frontend helper thuần cho build/sort cây danh mục chỉ định từ flat order items ở màn bác sĩ/tâm lý gia.
- `app/static/js/orders/order-catalog-state-utils.js`: shared frontend helper cho default expansion, toggle expanded category, rebuild index và sync selected orders theo catalog index ở màn bác sĩ/tâm lý gia.
- `app/static/js/orders/order-catalog-loader-utils.js`: shared frontend/API helper cho fetch và normalize dữ liệu catalog chỉ định + survey templates ở màn bác sĩ/tâm lý gia; orchestrator vẫn giữ state assignment, build tree, render và error/toast.
- `app/static/js/orders/order-selection-state-utils.js`: shared frontend helper thuần cho remove/clear/update status, upsert từ form submit, build payload save, merge trạng thái completed từ server, apply response save và map server orders về selected orders ở màn bác sĩ/tâm lý gia; orchestrator vẫn gán state, render, toast, gọi API save/load và gọi save/autosave.
- `app/static/js/orders/order-catalog-render-utils.js`: shared frontend helper cho render HTML node cây chỉ định, render node mẫu khảo sát, build HTML section cây danh mục, loading/error UI, đếm chỉ định con và event delegation click cây danh mục ở màn bác sĩ/tâm lý gia.
- `app/static/js/orders/order-form-ui-utils.js`: shared frontend helper cho UI form thêm chỉ định, gồm toggle trong/ngoài cơ sở, reset form, trạng thái nút submit, đọc/validate form submit, fill form từ autocomplete item, fill form từ catalog tree item, fill survey template và find+fill từ catalog tree selection ở màn bác sĩ/tâm lý gia.
- `app/static/js/orders/order-autocomplete-utils.js`: shared frontend helper cho search match, render HTML dropdown, keyboard navigation, hover active state và hide/reset autocomplete form chỉ định ở màn bác sĩ/tâm lý gia.
- `app/static/js/orders/order-performer-loader-utils.js`: shared frontend helper cho load danh sách người thực hiện trong cơ sở vào select form chỉ định ở màn bác sĩ/tâm lý gia.
- `app/static/js/orders/order-selected-table-ui-utils.js`: shared frontend helper cho render bảng chỉ định đã chọn và cập nhật CSS class dropdown trạng thái ở màn bác sĩ/tâm lý gia.
- `app/static/js/orders/order-performer-utils.js`: shared frontend helper thuần cho nhãn cơ sở thực hiện, tên người/cơ sở thực hiện và group selected orders theo performer ở màn bác sĩ/tâm lý gia.
- `app/static/js/orders/order-print-ui-utils.js`: shared frontend helper cho UI in phiếu chỉ định ở màn bác sĩ/tâm lý gia, chỉ render performer options, selected state, nút in và preview; không sở hữu API fetch, autosave, selected order state hay A4 print side effects.
- `app/api/chi_dinh.py`: wrapper tương thích cho import path cũ, không đặt logic mới ở đây.
- `app/api/order_catalog.py`: wrapper tương thích cho import path cũ, không đặt logic mới ở đây.
- `main.py`: register blueprint từ module path mới nhưng giữ nguyên URL prefix.

## Mapping Phase 5

- Cũ: `app/api/chi_dinh.py` -> Mới: `app/modules/orders/api/chi_dinh.py`.
- Cũ: `app/api/order_catalog.py` -> Mới: `app/modules/orders/api/catalog.py`.
- Serializer catalog tách từ `app/modules/orders/api/catalog.py` -> `app/modules/orders/view_models/catalog.py`.
- Response builder list/detail chỉ định tách từ `app/modules/orders/api/chi_dinh.py` -> `app/modules/orders/view_models/clinical_order.py`.
- Query/filter/pagination của `GET /api/chi-dinh` tách từ `app/modules/orders/api/chi_dinh.py` -> `app/modules/orders/services/clinical_order_query.py`.
- Load/upsert/update/delete/batch delete chỉ định tách từ `app/modules/orders/api/chi_dinh.py` -> `app/modules/orders/services/clinical_order_mutation.py`.
- Upload/delete/download file kết quả tách từ `app/modules/orders/api/chi_dinh.py` -> `app/modules/orders/services/result_file_service.py`.
- Query đọc catalog tách từ `app/modules/orders/api/catalog.py` -> `app/modules/orders/services/catalog_query.py`.
- Create/update/delete catalog tách từ `app/modules/orders/api/catalog.py` -> `app/modules/orders/services/catalog_mutation.py`.
- Serializer category row và survey template cho orders tách từ `app/modules/orders/api/catalog.py` -> `app/modules/orders/view_models/catalog.py`.
- URL giữ nguyên: `/api/chi-dinh/...`, `/api/order-categories...`, `/api/order-items...`, `/api/survey-templates-for-orders`.
- Frontend caller hiện giữ nguyên trong `doctor-examination.js`, `psychologist-examination.js`, `order-management.js`, `order-catalog.js`.

## Contract Cần Giữ

- `GET /api/chi-dinh/appointment/<appointment_id>` trả `{ chi_dinh: [...] }` cho màn bác sĩ/tâm lý gia và kiểm tra `appointment_access_error`.
- `POST /api/chi-dinh/appointment/<appointment_id>` kiểm tra `appointment_access_error`, sau đó upsert danh sách chỉ định và xóa item không còn trong payload như legacy.
- `GET /api/chi-dinh/patient/<patient_id>?exclude_appointment_id=<id>` trả lịch sử chỉ định theo bệnh nhân trong phạm vi quyền clinical access; không dùng filter tên để xác định patient.
- `GET /api/chi-dinh` trả list quản lý chỉ định với pagination và enrich appointment/patient/doctor.
- `GET /api/chi-dinh/<id>` trả detail chỉ định cùng appointment/patient/doctor.
- Upload/delete/download result files phải giữ nguyên đường dẫn và metadata `result_files`.
- Catalog APIs giữ `success`, `data`, tree/category/order item shape như trước.

## Validation

Khi sửa workflow này, chạy checklist `Backend Endpoint Refactor` và `Folder Move Checks` trong `references/smoke-checks.md`.

Tối thiểu:

- `python3 -m py_compile app/modules/orders/api/chi_dinh.py app/modules/orders/api/catalog.py app/modules/orders/services/clinical_order_query.py app/modules/orders/services/clinical_order_mutation.py app/modules/orders/services/result_file_service.py app/modules/orders/services/catalog_query.py app/modules/orders/services/catalog_mutation.py app/modules/orders/services/__init__.py app/modules/orders/view_models/clinical_order.py app/modules/orders/view_models/catalog.py app/modules/orders/view_models/__init__.py app/modules/orders/api/__init__.py app/modules/orders/__init__.py app/api/chi_dinh.py app/api/order_catalog.py main.py`
- Không auth: `GET /api/chi-dinh` và `GET /api/order-items` không được 500; thường trả lỗi auth/redirect tùy middleware.
- Trong phiên đăng nhập: mở màn bác sĩ/tâm lý gia có block chỉ định, load danh mục chỉ định, lưu một danh sách chỉ định nháp/thật nếu cần smoke write path.
- Trong màn quản lý chỉ định: list/detail/update trạng thái và upload/download/delete file kết quả nếu lát có đụng result files.

Validation thực tế 2026-05-30: syntax check các file orders module/wrapper/main đã qua; `GET /api/chi-dinh` và `GET /api/order-items?include_inactive=true` không kèm auth trả `401 application/json`, không phát sinh 500. Import check xác nhận wrapper cũ `app/api/chi_dinh.py` và `app/api/order_catalog.py` đang trỏ cùng blueprint object với module path mới.

Validation thực tế 2026-05-30: sau khi tách `view_models/clinical_order.py` và `view_models/catalog.py`, syntax check đã qua; import check xác nhận routes đang dùng builder/serializer từ module view-model mới; `GET /api/chi-dinh` và `GET /api/order-items?include_inactive=true` không kèm auth vẫn trả `401 application/json`, không phát sinh 500.

Smoke thực tế 2026-05-30: user đã test lát orders view-model/catalog serializer và xác nhận ổn.

Validation thực tế 2026-05-30: sau khi tách `services/clinical_order_query.py`, syntax check đã qua; import check xác nhận route `GET /api/chi-dinh` dùng query service từ module services; `GET /api/chi-dinh` và `GET /api/order-items?include_inactive=true` không kèm auth vẫn trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-30: sau khi tách `services/catalog_query.py`, syntax check đã qua; import check xác nhận catalog routes dùng query service và serializer mới; không auth các endpoint `/api/order-items?include_inactive=true`, `/api/order-categories`, `/api/order-categories/tree`, `/api/survey-templates-for-orders` đều trả `401 application/json`, không phát sinh 500.

Validation thực tế 2026-05-30: hoàn tất backend orders service island. `app/modules/orders/api/chi_dinh.py` chỉ còn route/auth/session/HTTP response và gọi `clinical_order_query`, `clinical_order_mutation`, `result_file_service`, `view_models/clinical_order`. `app/modules/orders/api/catalog.py` chỉ còn route/auth/session/HTTP response và gọi `catalog_query`, `catalog_mutation`, `view_models/catalog`. Syntax check toàn bộ orders module/wrapper/main đã qua; import check xác nhận wrapper cũ trỏ cùng blueprint object; không auth các endpoint `/api/chi-dinh`, `/api/order-items?include_inactive=true`, `/api/order-categories`, `/api/order-categories/tree`, `/api/survey-templates-for-orders` đều trả `401 application/json`, không phát sinh 500.

Smoke thực tế 2026-05-30: user đã test workflow orders/chỉ định sau khi hoàn tất service island và xác nhận OK.

Validation thực tế 2026-06-04: tách shared frontend helper `app/static/js/orders/order-print-ui-utils.js` cho UI in phiếu chỉ định dùng chung ở màn bác sĩ và tâm lý gia. Helper chỉ render performer options, selected state, print button state và preview group theo ngày/cơ sở; không đổi selected orders state, order catalog API, autosave/lưu chỉ định, fetch dữ liệu in hoặc A4 print side effects. Syntax check `order-print-ui-utils.js`, `doctor-examination.js`, `psychologist-examination.js` đã qua; unit-style check Node VM đã qua; static/template check xác nhận cả hai màn load shared helper trước orchestrator chính.

Validation thực tế 2026-06-04: nâng performer grouping frontend sang shared `app/static/js/orders/order-performer-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `getOrderFacilityLabel`, `getOrderPerformerName`, `groupOrdersByPerformer`; không đổi selected order state, API, payload hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: nâng order catalog tree frontend sang shared `app/static/js/orders/order-tree-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `buildOrderTreeStructure`, `sortOrderTreeNodes`; không đổi API danh mục, selected order state, autosave/lưu chỉ định, payload hoặc endpoint. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách order status frontend sang shared `app/static/js/orders/order-status-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `getOrderStatusConfig`; không đổi status values `draft/sent/completed`, CSS class, selected order state, API, payload hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách order catalog state frontend sang shared `app/static/js/orders/order-catalog-state-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `ensureOrderCatalogDefaultExpansion`, `rebuildOrderCatalogIndex`, `syncSelectedOrdersWithIndex`; không đổi render cây, selected order state shape, API, payload hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách order catalog render frontend sang shared `app/static/js/orders/order-catalog-render-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `renderOrderNode`, `countDescendantOrders`; không đổi survey template section, loading/empty state, selected order state shape, API, payload hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách order form UI frontend sang shared `app/static/js/orders/order-form-ui-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `updateOrderFormNewLocationFields`, `resetOrderFormNew`, `updateOrderFormSubmitButton`; không đổi submit/save logic, survey-template handling, selected order state shape, API, payload hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách selected orders table frontend sang shared `app/static/js/orders/order-selected-table-ui-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `renderSelectedOrders`, `updateOrderStatusDropdownClasses`; không đổi event edit/delete/status, selected order state shape, API, payload, autosave hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách order performer loader frontend sang shared `app/static/js/orders/order-performer-loader-utils.js`. Bác sĩ và tâm lý gia đều giữ wrapper tên hàm cũ `loadOrderPerformers`; không đổi endpoint `/users/doctors`, submit/save logic, selected order state shape, API orders, payload, autosave hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách order autocomplete frontend sang shared `app/static/js/orders/order-autocomplete-utils.js`. Bác sĩ và tâm lý gia vẫn giữ event click/keyboard/fill form trong orchestrator; helper chỉ build match và render dropdown HTML. Không đổi selected order state shape, API orders, payload, autosave hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order form UI frontend helper `app/static/js/orders/order-form-ui-utils.js` để dùng chung fill form từ catalog item sau khi click autocomplete. Bác sĩ và tâm lý gia vẫn giữ event click/keyboard, survey selection và submit/save trong orchestrator. Không đổi selected order state shape, API orders, payload, autosave hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order form UI frontend helper `app/static/js/orders/order-form-ui-utils.js` để dùng chung fill form từ catalog tree item sau khi click cây danh mục. Bác sĩ và tâm lý gia vẫn giữ tree click shell và submit/save trong orchestrator. Không đổi selected order state shape, API orders, payload, autosave hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order autocomplete frontend helper `app/static/js/orders/order-autocomplete-utils.js` để dùng chung keyboard navigation ArrowUp/ArrowDown/Enter/Escape cho dropdown autocomplete. Bác sĩ và tâm lý gia vẫn giữ click/fill/survey handling trong orchestrator. Không đổi selected order state shape, API orders, payload, autosave hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order autocomplete frontend helper `app/static/js/orders/order-autocomplete-utils.js` để dùng chung hover active state và hide/reset dropdown autocomplete. Bác sĩ và tâm lý gia vẫn giữ click/fill/survey handling trong orchestrator. Không đổi selected order state shape, API orders, payload, autosave hoặc print side effects. Syntax/static check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order autocomplete frontend helper `app/static/js/orders/order-autocomplete-utils.js` để dùng chung click-outside/blur-dismiss dropdown và focus lại input khi edit chỉ định. Bác sĩ và tâm lý gia vẫn giữ click/fill/survey handling trong orchestrator. Không đổi selected order state shape, API orders, payload, autosave hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order form UI helper `app/static/js/orders/order-form-ui-utils.js` để dùng chung fill form khi edit một chỉ định đã chọn. Bác sĩ và tâm lý gia vẫn giữ kiểm tra khóa sửa, `editingOrderId`, submit/save/autosave và selected order state trong orchestrator. Không đổi API orders, payload hoặc print side effects; giữ khác biệt cũ về cách set người thực hiện trong cơ sở của từng màn. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order autocomplete frontend helper `app/static/js/orders/order-autocomplete-utils.js` để dùng chung input/focus/keydown binding và debounce search cho autocomplete chỉ định. Bác sĩ và tâm lý gia vẫn giữ click/fill/survey handling trong orchestrator. Không đổi selected order state shape, API orders, payload, autosave hoặc print side effects; giữ khác biệt cũ về kết quả khi focus input rỗng của từng màn. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order autocomplete frontend helper `app/static/js/orders/order-autocomplete-utils.js` để dùng chung event shell khi click item autocomplete. Helper chỉ đọc `data-survey-id`/`data-order-id` và gọi callback; bác sĩ và tâm lý gia vẫn giữ add survey, fill form, hide dropdown, selected order state, submit/save/autosave trong orchestrator. Không đổi API orders, payload hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order autocomplete frontend helper `app/static/js/orders/order-autocomplete-utils.js` để dùng chung render dropdown autocomplete, gồm render HTML, show/hide khi rỗng, bind hover và bind click shell. Bác sĩ và tâm lý gia vẫn truyền callback riêng cho survey/order nên selected order state, submit/save/autosave, API orders và payload không đổi. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng order autocomplete frontend helper `app/static/js/orders/order-autocomplete-utils.js` để dùng chung setup autocomplete form, gồm DOM lookup, selectedIndex UI, search theo getter state hiện hành, render/search/input/dismiss binding và callback chọn survey/order. Bác sĩ và tâm lý gia vẫn giữ add survey, fill form, selected order state, submit/save/autosave trong orchestrator. Không đổi API orders, payload hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng selected orders table helper `app/static/js/orders/order-selected-table-ui-utils.js` để dùng chung render section chỉ định đã chọn, gồm render bảng, refresh preview phiếu in và update class dropdown trạng thái khi có row. Bác sĩ và tâm lý gia vẫn giữ state mutation, edit/delete/status events, submit/save/autosave trong orchestrator. Không đổi API orders, payload hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: tách selected orders state transform sang shared helper thuần `app/static/js/orders/order-selection-state-utils.js`. Helper chỉ trả kết quả remove, clear và update status kèm lock check cho trạng thái hoàn thành trong cơ sở; bác sĩ và tâm lý gia vẫn giữ state assignment, render UI, toast, submit/save/autosave trong orchestrator. Không đổi selected order state shape, API orders, payload hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng selected orders table helper `app/static/js/orders/order-selected-table-ui-utils.js` để dùng chung event delegation của bảng chỉ định đã chọn: edit/delete/status change, restore UI khi status bị khóa, cập nhật class và `data-current-status` tức thì. Bác sĩ và tâm lý gia vẫn giữ state mutation, toast, submit/save/autosave trong orchestrator. Không đổi selected order state shape, API orders, payload hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng catalog render helper `app/static/js/orders/order-catalog-render-utils.js` để dùng chung event delegation của cây danh mục: survey template, toggle category, click category row và click order item. Bác sĩ và tâm lý gia vẫn giữ add survey, toggle expanded state, add selected order, render và autosave trong orchestrator. Không đổi selected order state shape, API orders, payload hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng catalog render helper `app/static/js/orders/order-catalog-render-utils.js` để dùng chung render node mẫu khảo sát. Helper giữ biến thể `doctor`/`psychologist` để không đổi markup cũ, trong đó tâm lý gia vẫn hiển thị pricing qua `formatCurrency`. Bác sĩ và tâm lý gia vẫn giữ add survey, selected order state, submit/save/autosave trong orchestrator. Không đổi API orders, payload hoặc print side effects. Syntax/static/template check và unit-style check Node VM đã qua.

Validation thực tế 2026-06-04: mở rộng catalog render helper `app/static/js/orders/order-catalog-render-utils.js` để dùng chung build HTML section survey + cây danh mục. Helper chỉ nhận arrays và callback render node; bác sĩ/tâm lý gia vẫn giữ loading/empty DOM, default expansion, add survey, selected order state, submit/save/autosave trong orchestrator. Khác biệt cũ được giữ bằng option `showOrderItemsHeaderWhenSurveys` chỉ bật ở tâm lý gia. Syntax check, template load-order check và unit-style check Node VM đã qua; HTTP static check chưa chạy vì `localhost:8000` không lắng nghe.

Validation thực tế 2026-06-04: mở rộng catalog render helper `app/static/js/orders/order-catalog-render-utils.js` để dùng chung DOM shell render cây danh mục/loading/empty bằng `renderOrderCatalogTreeSection()`. Helper chỉ ẩn loading, show/hide empty placeholder, gọi callback default expansion và set HTML; bác sĩ/tâm lý gia vẫn giữ fetch catalog, expanded-node state, add survey, selected order state, submit/save/autosave trong orchestrator. Syntax check, template load-order check và unit-style check Node VM đã qua; HTTP static check chưa chạy vì `localhost:8000` không lắng nghe.

Validation thực tế 2026-06-04: thêm catalog loader helper `app/static/js/orders/order-catalog-loader-utils.js` để dùng chung fetch song song `/api/order-items?include_inactive=true` và `/api/survey-templates-for-orders`, normalize `{ items, surveyTemplates }`, và giữ behavior survey endpoint lỗi thì survey list rỗng. Bác sĩ/tâm lý gia vẫn giữ state assignment, build tree, rebuild index, render, error toast và autosave/save trong orchestrator. Syntax check, template load-order check và unit-style check Node VM đã qua; HTTP static check chưa chạy vì `localhost:8000` không lắng nghe.

Validation thực tế 2026-06-04: mở rộng catalog render helper `app/static/js/orders/order-catalog-render-utils.js` để dùng chung loading/error UI của cây danh mục gồm lấy DOM elements, show loading, hide loading và render lỗi. Bác sĩ/tâm lý gia vẫn giữ fetch catalog, state assignment, build tree, rebuild index, render, error toast và autosave/save trong orchestrator. Syntax check, template load-order check và unit-style check Node VM đã qua; HTTP static check chưa chạy vì `localhost:8000` không lắng nghe.

Validation thực tế 2026-06-04: hoàn tất cụm helper an toàn còn lại của frontend orders: `toggleOrderCategoryNode()` vào `order-catalog-state-utils.js`, `applySurveyTemplateToForm()` và `applyOrderCatalogTreeSelection()` vào `order-form-ui-utils.js`. Bác sĩ/tâm lý gia vẫn giữ selected order state assignment, submit/save/autosave, payload `/api/chi-dinh`, load orders từ server, error toast và A4 print orchestration trong orchestrator. Syntax check, template load-order check và unit-style check Node VM đã qua; HTTP static check chưa chạy vì `localhost:8000` không lắng nghe.

Validation thực tế 2026-06-04: đóng frontend helper phase cho orders ở lát 8.44. `order-form-ui-utils.js` nhận thêm `collectOrderFormSubmission()` để dùng chung đọc DOM, validate tên/ngày, resolve người thực hiện trong cơ sở và nhận diện survey template của tâm lý gia. `order-selection-state-utils.js` nhận thêm helper thuần cho upsert selected order từ form, build payload save, merge trạng thái completed từ server, apply response save và map dữ liệu load từ server. Bác sĩ/tâm lý gia vẫn giữ API call save/load, debounce autosave, toast, state assignment chính và A4 print orchestration trong orchestrator; endpoint `/api/chi-dinh/appointment/<id>` và selected order state shape không đổi. Syntax check toàn bộ JS orders + hai orchestrator đã qua; unit-style Node VM check cho helper form/state/payload/load đã qua; HTTP static/browser check chưa chạy vì `localhost:8000` không lắng nghe.

## Next Refactor Steps

1. Smoke test trong phiên đăng nhập: bác sĩ/tâm lý load và lưu chỉ định theo appointment.
2. Smoke test màn quản lý chỉ định: list/detail/update trạng thái, batch delete nếu đang dùng.
3. Smoke test file kết quả: upload/delete/download một file nhỏ.
4. Smoke test danh mục chỉ định: load tree/list, tạo/sửa/xóa category hoặc order item test nếu môi trường dữ liệu cho phép.
5. Không tách frontend/static orders tiếp nếu chưa có contract riêng cho save/load/A4 print orchestration; backend orders island hiện đã đủ mỏng để làm nền cho lát sau.
