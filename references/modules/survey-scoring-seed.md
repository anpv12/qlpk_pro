# Seed cấu hình khảo sát — 06/09/2026

## Đã áp dụng

| Mẫu local | Cấu hình |
| --- | --- |
| 22 GAD-7 | 7 mục bắt buộc, mỗi mục 0–3; tổng 0–21; ngưỡng 5/10/15. Câu ảnh hưởng sinh hoạt giữ điểm 0. Chuẩn hóa nhãn tần suất. |
| 26 PHQ-9 | 9 mục bắt buộc, mỗi mục 0–3; tổng 0–27; ngưỡng 5/10/15/20. Lưu ý mục 9 khi điểm ≥1, không dùng tổng grid kích hoạt. |
| 28 GDS | Bổ sung mục 30 “Tôi thấy đầu óc mình vẫn minh mẫn như trước đây”. Đủ GDS-30; Không tính 1 ở mục 1/5/7/9/15/19/21/27/29/30, còn lại Đúng tính 1. Tổng 0–30, ngưỡng 10/20. |
| 30 Zung SAS/ZAI | 20 mục bắt buộc; 1–4 điểm, đảo chiều 5/9/13/17/19. Tổng thô 20–80; chỉ số = tổng ×1,25, phạm vi 25–100. Chỉ dùng ngưỡng sàng lọc chỉ số 45. |

Nguồn đối chiếu:

- GAD/PHQ: [hướng dẫn tác giả, bản lưu tại UAB](https://www.uab.edu/medicine/pcp-sci/images/SCIMS/PHQ-9_Instruction_Manual.pdf), trang 3/5/6.
- GDS: [bản dài và khóa điểm tại Stanford](https://web.stanford.edu/~yesavage/GDS.english.long.html).
  Giữ bản dịch sẵn có; mục 30 bổ sung được dịch từ câu tương ứng, không khẳng
  định đây là một bản dịch tiếng Việt đã được thẩm định riêng.
- Zung: [khóa đảo chiều và quy đổi](https://pmc.ncbi.nlm.nih.gov/articles/PMC9792673/);
  [nghiên cứu đối chiếu ngưỡng Zung, phân biệt điểm thô/chỉ số](https://pmc.ncbi.nlm.nih.gov/articles/PMC5591521/).
  Không áp thang phân mức từ nghiên cứu quần thể khác vào mẫu này.

Kết luận là mức sàng lọc, không tự chẩn đoán hay đề xuất điều trị.

## Vanderbilt chưa seed

Cập nhật rà soát 08/09/2026: chưa áp seed bổ sung cho CDI/HADS/Vanderbilt.
CDI hiện chỉ có 1 câu, HADS 2 câu; không có bộ tiếng Việt đầy đủ trong repo.
Cần xác định phiên bản và nguồn được phòng khám sử dụng trước khi bổ sung.
CDI-2 có nhiều dạng và số mục khác nhau, không lấy số mục của CDI-2 để tự
sửa bản mang tên CDI. HADS có quản lý quyền sử dụng/bản dịch. Nguồn đối chiếu:
[CDI-2 MHS](https://storefront.mhs.com/collections/cdi-2),
[HADS Mapi](https://eprovide.mapi-trust.org/instruments/hospital-anxiety-and-depression-scale).
Vanderbilt cần chọn bản cha mẹ/giáo viên và lần đầu/theo dõi; thông tin phiên
bản tại [NICHQ](https://nichq.org/downloadable/nichq-vanderbilt-assessment-scales/).
Engine cấu hình hiện tại chỉ tổng/trung bình/quy đổi và ngưỡng theo nhóm,
chưa có quy tắc đếm triệu chứng kết hợp điều kiện ảnh hưởng chức năng; không
seed kết luận Vanderbilt bằng tổng điểm thay thế.

Mẫu 25 có nhóm 9/9/8/13/2 mục; bản cha mẹ ban đầu cần 9/9/8/14/7 mục triệu
chứng và 8 mục ảnh hưởng. Có câu bị gộp và câu bị cắt “Sợ thử…”. Chỉ thêm
điểm sẽ khiến mẫu thiếu nội dung có vẻ hợp lệ. Chờ người dùng chọn bổ sung
bản cha mẹ NICHQ hoặc cung cấp bản phòng khám. Không bỏ validation.

Nguồn: [NICHQ Vanderbilt và hướng dẫn](https://nichq.org/wp-content/uploads/2024/09/NICHQ-Vanderbilt-Assessment-Scales.pdf).
Điểm triệu chứng 0–3 khác điểm ảnh hưởng 1–5; kết luận cần đếm số triệu chứng
kết hợp ảnh hưởng, không thể thay bằng tổng điểm nhóm đơn thuần.

## Thực thi và bảo toàn

- `scripts/seed_survey_scoring.py` mặc định dry-run. Bản sửa local theo ID,
  tên và hash nội dung đã đối chiếu; sai bản gốc phải dừng, không ghi đè.
- Đã áp dụng `--apply --backup /tmp/qlpk-before-scoring-seed-20260906.json`.
  Backup tạo độc quyền mode 0600 trước khi ghi, lưu content/snapshot cũ.
- 4 template và 1 phiên GAD-7 trống được cập nhật; không đổi token/hạn/trạng
  thái. Phiên có đáp án/đã đóng/hết hạn giữ cấu trúc cũ. Bài cũ thiếu snapshot
  được đóng băng nội dung trước khi sửa danh mục, không tính lại điểm.
- Hash toàn bộ đáp án/tổng điểm/snapshot response trước và sau giống nhau.
  Chạy lại dry-run: 0 thay đổi. Marker `scoring_seed` lưu revision/nguồn,
  không ghi đè cấu hình bác sĩ sửa sau seed.
- `tests/fixtures/survey_seed_legacy.json` chỉ chứa mẫu gốc, không có dữ liệu
  bệnh nhân; dùng kiểm tra khóa điểm và chặn áp seed lên bản khác.

## QA

- 73 test scoring/seed/template/lifecycle đạt: điểm biên, ngưỡng, khóa đảo,
  GAD câu phụ không cộng điểm, PHQ lưu ý riêng mục 9, Zung chỉ số 43,75/45.
- Browser: 4 editor tải đủ điểm/kết quả; PHQ chọn đúng mục 9, collectConfig
  giữ ID. `survey-result-config.js` thêm hàng grid vào danh sách chọn để
  editor không âm thầm đổi lưu ý từ hàng về câu cha.
- GAD review mở được 7 mục + câu phụ; không nhập/nộp bài cho bệnh nhân thật.
  Không JS error. JS syntax/diff check đạt.
- Frontend contract toàn repo lỗi tại CSS ngoài phạm vi seed:
  `re-examination-calendar.css` có font-size/font-weight cứng. Không sửa
  phần việc đang được chỉnh ở task khác.
