# Giao diện đăng nhập Sơn Tâm

- Owner: `app/templates/login.html`, `app/static/css/pages/login.css`,
  `app/static/js/login.js`. Trạng thái/QA hiện hành ghi tập trung trong
  `references/refactor-progress.md`, mục context chung22/09.
- Bố cục phương án 2 được chọn: ảnh minh họa phòng khám bên trái, form trực
  tiếp trên nền kem bên phải. Desktop grid55/45; đến48rem một cột, chỉ có
  banner ảnh khi chiều cao hơn44rem. Wrapper min100dvh, form/footer không
  flex-shrink, tối đa28rem. Trang cuộn tự nhiên khi không đủ chỗ; footer nằm
  trong cột form, không fixed che nút. Responsive đổi bố cục/gap, không scale
  trang hoặc hạ kích thước control để ép vừa viewport.
- Logo dùng nguyên file `app/static/assets/logo-sontam-clinic.png`, giữ màu,
  không filter/vẽ lại/hộp nền. Theo yêu cầu ngày 2026-09-07, chuyển logo vào
  đầu form bên phải. Logo bên trái và cụm lời chào/tiêu đề/mô tả bên phải
  nằm cùng hàng, căn giữa theo chiều dọc qua `.login-heading`. Giữ đủ
  “Chào mừng trở lại”, h1 “Đăng nhập” và mô tả. Logo co theo chiều rộng
  form trên mobile, không tách thành hàng riêng. Không có logo trên ảnh.
- Nội dung trên ảnh: tiêu đề “Chuyên môn đồng hành” và ba nhãn
  “Tâm thần học”, “Tâm lý lâm sàng”, “Tâm lý cộng đồng”. Đây là phần
  tham chiếu người dùng chọn, không dùng đoạn “Không cần phải biết…”.
  Nhãn là danh sách tĩnh dạng pill, tự xuống dòng ở màn hẹp.
- Bỏ toàn bộ overlay phủ ảnh (radial và linear gradient). Giữ khối chuyên môn ở
  chân ảnh, chỉ dùng text-shadow sát chữ để đọc được trên ảnh sáng.
  `login-clinic-interior.png` là ảnh nội thất minh họa, không phải ảnh chụp
  cơ sở Sơn Tâm; không chứa chữ/logo. Footer chỉ policy/hỗ trợ.
- Màu/font dùng shared `color-tokens.css` và `typography.css`, Roboto và
  brown/chocolate/page-bg. Heading marketing dùng token display; form 16px.
- Input có owner `.login-input-wrap` (grid icon/input/toggle), không dùng
  Bootstrap form-control. Icon dùng ô vuông không co, line-height1 cả glyph;
  không absolute/translate. Nút giữ palette semantic execute từ shared CSS,
  geometry ở page CSS. Loading chỉ đổi label/icon/aria-busy trên DOM sẵn có,
  không thay HTML nút; giảm chuyển động theo prefers-reduced-motion.
- Hai icon đầu input (người dùng/ổ khóa) là inline SVG viewBox24×24, nét1.75
  currentColor trong slot20px; không dùng glyph bi-person/bi-lock. Kiểm hình
  vẽ thực tế, không lấy kích thước slot vuông làm tiêu chí duy nhất về tỷ lệ.
- Giữ ID/name của form để `login.js` xử lý auth như cũ. Password toggle có
  nhãn truy cập; input có label, autocomplete và required; lỗi có role alert.
  Không bổ sung lưu mật khẩu. Quên mật khẩu dẫn đến email hỗ trợ, không giả
  lập chức năng reset mật khẩu chưa có backend. Liên kết hỗ trợ dùng tel.
- QA khi sửa: asset thật/đúng logo, desktop và mobile không overflow, form
  rỗng/đã điền, focus, checkbox, hiện/ẩn mật khẩu, loading/error, footer và
  nội dung dài. Kiểm lỗi bằng tài khoản giả không tồn tại, không thử sai mật
  khẩu tài khoản thật; không đăng nhập đổi phiên người dùng chỉ để QA layout.
