# QA bốc thuốc và thống kê

## Quy tắc đã chốt

- Lưu đơn thuốc phòng khám là bốc thuốc; không thêm bước xác nhận cấp.
- Một thuốc, một lần lưu có xuất thêm: một lần bốc theo `operation_id`.
  Tách hai lô vẫn một lần; cùng thuốc xuất thêm ở lần lưu sau là lần mới.
  Lưu không đổi, chỉ sửa giá, hoàn một phần/toàn bộ không tăng số lần bốc.
- Lượt khám là số `appointment_id` khác nhau có giao dịch trong khoảng lọc,
  kể cả lượt chỉ hoàn/đổi giá. Không phải số lần bốc.
- Khoảng ngày dùng `medicine_transactions.created_at`, bao gồm đầu/cuối ngày.
  Thực cấp trong kỳ = xuất trong kỳ − hoàn trong kỳ; có thể âm khi hoàn đơn tháng trước.
- Tiền theo snapshot giao dịch, không nhân lại với giá danh mục hiện tại.
  Sửa giá trên đơn cũ ghi chênh lệch vào kỳ sửa, không viết lại kỳ trước.
- Thiếu mã lần lưu: không đoán số lần. Thiếu giá: không quy về 0.
  Tổng tiền/vốn chỉ là phần có dữ liệu; UI không hiển thị lãi đầy đủ khi còn dòng thiếu.
- Mỗi phiếu nhập là `batch_id` riêng dù trùng số lô, giá vốn có thể khác nhau.

## Bộ dữ liệu chuẩn để đối chiếu

Thuốc X: phiếu A 100 viên giá vốn 1.000đ; phiếu B 100 viên giá vốn 1.200đ;
cùng số lô, hạn còn hợp lệ. Giá bán ban đầu 2.000đ, tồn tổng 200 viên.
Tất cả dữ liệu tự động được tạo trong transaction rollback; không lưu đơn bệnh nhân thật.

| Mã | Thao tác | Kết quả cần thấy |
| --- | --- | --- |
| B01 | Lưu 10 viên | 1 lần bốc, xuất 10, tồn 190, tiền 20.000đ, vốn 10.000đ |
| B02 | Lưu lại y nguyên | Không giao dịch mới, không trừ thêm, vẫn 1 lần |
| B03 | Lưu 120 viên | A xuất 100 + B xuất 20; 1 lần, vốn 124.000đ, tiền 240.000đ |
| B04 | Tăng 120 lên 130 | Xuất thêm 10, số lần thành 2; không xuất lại 130 |
| B05 | Giảm 130 xuống 90 | Hoàn 40 về đúng phiếu/giao dịch gốc; không tăng số lần |
| B06 | Xóa hết thuốc | Hoàn hết, tồn phục hồi; tiền/vốn ròng 0; lịch sử vẫn còn |
| B07 | Cùng thuốc hai dòng, cùng giá | Gom số lượng, một lần bốc; không đếm dòng đơn |
| B08 | Cùng thuốc hai dòng, khác giá | Từ chối, không đổi đơn/kho/giao dịch |
| B09 | Thuốc mua ngoài | Không trừ kho, không đưa vào thống kê bốc tại phòng khám |
| B10 | Số lượng 7,5 | Chuẩn đang dùng làm tròn lên 8; đơn/kho/tiền cùng 8 |
| B11 | Số lượng âm, rỗng, NaN, vô cực, quá giới hạn | Từ chối trước sửa đơn/kho |
| L01 | Hai phiếu cùng số lô khác giá vốn | Truy vết riêng phiếu, không gộp giá nhập |
| L02 | Phiếu ID sau hết hạn sớm hơn | Xuất theo FEFO, không theo ID trước |
| L03 | Lô hết hạn và lô hết hạn hôm nay | Bỏ lô đã hết hạn; hôm nay còn được cấp theo quy tắc hiện tại |
| L04 | Có tồn tổng nhưng chưa có lô | Chặn, báo cần bổ sung lô; không tạo lô giả |
| L05 | Thiếu tồn khả dụng | Từ chối toàn bộ; đơn/kho/sổ không đổi |
| L06 | Đơn nhiều thuốc, thuốc thứ hai thiếu | Rollback cả xuất thuốc thứ nhất và mọi thay đổi đơn |
| L07 | Hai connection tranh khóa thuốc | Connection thứ hai bị chặn; không bỏ qua khóa |
| G01 | Đổi giá danh mục | Không đổi tiền/vốn của lần bốc cũ |
| G02 | 10 viên giá 4.000đ, lượt sau 10 giá 5.000đ | 2 lần, 20 viên, tổng 90.000đ |
| G03 | Chỉ đổi giá trên đơn đã lưu | Dòng điều chỉnh SL=0; tiền chênh lệch đúng, không tăng số lần |
| G04 | Vừa tăng/giảm số lượng vừa đổi giá | Tính lượng mới và điều chỉnh lượng còn lại, không cộng hai lần |
| G05 | Hoàn sau khi đã đổi giá | Trừ theo giá bán đã điều chỉnh, giữ giá vốn gốc |
| G06 | Giá nhập hoặc giá bán 0đ | Giá hợp lệ, không hiện thiếu giá |
| G07 | Thiếu giá nhập, bổ sung sau | Giao dịch cũ vẫn thiếu vốn; không tự backfill |
| G08 | Sửa giá nhập đã có / giá âm, NaN | Từ chối; không thay lịch sử |
| G09 | Hai người sửa giá / lỗi ghi lịch sử | Chặn snapshot cũ; rollback nếu ghi lịch sử thất bại |
| T01 | Xuất cuối tháng, sửa giá tháng sau | Tháng trước giữ nguyên; chênh lệch ở tháng sau |
| T02 | Tháng chỉ hoàn | 0 lần bốc mới; lượng/tiền ròng âm đúng |
| T03 | Tháng chỉ giảm giá | 0 lần, SL=0, vốn=0, tiền điều chỉnh âm |
| T04 | Nhiều lô, phân trang | Tổng tính toàn bộ bộ lọc, không chỉ trang đang xem |
| T05 | Hai thuốc trùng tên khác ID | Hai dòng riêng, đúng đơn vị và số lượng |
| T06 | Lọc thuốc, bác sĩ, loại, phiếu, ngày | Lọc trước tổng hợp/phân trang; không lẫn thuốc khác |
| T07 | Dữ liệu cũ thiếu liên kết hoặc mã lần lưu | Hiện số dòng chưa rõ; không bịa lượt khám/giá/số lần |
| T08 | Ngày không hợp lệ hoặc từ ngày sau đến ngày | API 400, UI báo lỗi và xóa số liệu cũ |
| T09 | Không đăng nhập | API 401 |
| U01 | Bấm Tháng này | Từ đầu tháng đến hôm nay, tải lại cả tổng hợp và chi tiết |
| U02 | Bấm tên thuốc → Tất cả thuốc | Chi tiết lọc đúng ID, bỏ lọc đúng; giữ bộ lọc thời gian |
| U03 | Đổi bộ lọc khi request cũ còn chạy | Kết quả cũ không ghi đè kết quả mới |
| U04 | Rỗng/lỗi mạng | Không giữ hàng cũ; khóa phân trang không hợp lệ |
| U05 | Nhiều trang / trang cuối | Đi trước/sau đúng; không lặp/gom nhầm thuốc |
| U06 | Tên thuốc chứa HTML | Hiện chữ, không thực thi mã |
| U07 | Desktop 1440/1024, mobile390 | Bảng cuộn đúng vùng, đọc được số liệu, không tràn do bảng |

## Chạy lại tự động

```sh
QLPK_RUN_DB_TESTS=1 python3 -m pytest -q \
  tests/test_prescription_visit_ledger.py tests/test_existing_stock_lots.py \
  tests/test_inventory_receipts.py tests/test_medicine_price_history.py \
  tests/test_missing_import_price.py tests/test_prescription_save_safety.py \
  tests/test_prescription_shortage_payload.py
node --test tests/medicine_dispensing_statistics.test.js \
  tests/prescription_visit_ledger.test.js tests/medicine_import_ledger.test.js
```

Các test PostgreSQL dùng local `qlpk_db`, rollback; không chạy trên production.
Không import `main.py`, không khởi động/dừng server hiện có.
Test khóa kiểm cơ chế khóa hai connection, không phải stress test đa người dùng.

## Kết quả QA 27/09/2026

- **133 test Python +26 test JavaScript đạt**, không skip. Jinja/JS syntax và
  diff whitespace của các file sửa đạt;8 warning deprecation thư viện Python.
- Browser chỉ GET/HEAD trên port8000, chặn socket/realtime và mọi request ghi.
- Dữ liệu thật: tháng hiện tại5 thuốc/26 giao dịch; khoảng dài41 thuốc/2735 giao dịch.
  Đã đi trang tổng hợp1→2→3→2, chi tiết trang2, chọn riêng Zopinox, bỏ chọn,
  tìm kiếm không kết quả, nút Tháng này; không lỗi JavaScript.
- Desktop1440 và1024: bảng có dữ liệu, không tràn ngang trang; đạt visual/interactive QA
  cho phần thống kê thay đổi. Không thực hiện lưu/cấp thuốc thật qua trình duyệt.
- Mobile390: hai bảng cuộn ngang đúng vùng; footer dùng chung vẫn tràn ngang
  (`.contact/.help-link` tới435px). Không sửa footer ngoài phạm vi;
  **chưa pass visual QA toàn trang mobile**.
- Lưu đơn/cấp/hoàn/đổi giá được kiểm qua service/API rollback; chưa chạy lại
  end-to-end các thao tác ghi trên màn bác sĩ trong đợt này.
- Chưa triển khai xuất Excel sổ giao dịch; tab hiện có vẫn chặn xuất sai nguồn.
