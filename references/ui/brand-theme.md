# Màu chủ đạo QLPK

## Quy chuẩn nút hiện hành (2026-09-23)

Bắt buộc đọc [button-system.md](button-system.md) trước thiết kế hoặc sửa nút.
Owner duy nhất: `shared/button-actions.css` và token `--qlpk-button-*`.
Nút chính xanh #176B5B; phụ trắng trên header nâu, xám nhẹ trên nền trắng;
nguy hiểm đỏ; không gradient, viền trang trí hoặc shadow. Role nghiệp vụ giữ
nguyên nhưng không còn mỗi role một màu. Solid/soft phân mức nhấn; container
khai báo data-qlpk-button-surface="dark|light". Không dời nút khỏi header.

Quy chuẩn này THAY THẾ mọi hướng dẫn màu NÚT cũ phía dưới (nâu/gradient,
xanh xem/cam sửa, viền/bóng riêng). Header, tab, badge và dữ liệu giữ nguyên.
Bổ sung giá dùng role edit với hình thức phụ trung tính, không còn cam/đỏ.
Regression: tests/button_actions.test.js và tests/button_color_tokens.test.js.
Giới hạn QA ghi tập trung tại references/refactor-progress.md.

## Quy ước hiện hành toàn ứng dụng (2026-09-21)

- User yêu cầu bỏ hoàn toàn primary cũ `#7b472f`, cả text/icon/viền/trạng
  thái tương tác, không chỉ modal. Mục này thay thế quy ước19/09 bên dưới.
- Source duy nhất `shared/color-tokens.css`: primary RGB alias brown800
  (75,39,25); header-start RGB109,61,39 từ nâu header có sẵn. Nền dùng
  `--qlpk-workflow-context-header-bg`, chuyển sắc #6d3d27 → #4b2719.
- Text/icon/viền/focus/accent-color dùng `--qlpk-color-primary` dạng màu đơn
  của đầu cuối header. Không truyền gradient vào thuộc tính nhận color.
- Nền primary, modal header, hover/active/disabled, selected/tab/pagination
  chuyển về nguồn gradient chung. Bootstrap giữ màu nền dự phòng và lớp
  ảnh gradient; checkbox/switch giữ ảnh dấu tick/nút gạt ở lớp trên.
- Không thay màu success/warning/error, sinh hiệu, loại đơn, nguồn giới thiệu,
  nền trung tính/soft hay ảnh đăng nhập. Native accent dùng màu đơn vì không
  nhận gradient. Bản in màu riêng giữ nguyên; không thay dữ liệu/API/save.
- Guard kiểm33 template, chặn raw màu cũ và token override, gradient sai
  property/private primary gradient;57 Python +17 Node tests đạt.
- Browser8000: modal người đi cùng của hồ sơ thật (danh sách đi cùng rỗng),
  sửa Abacavir có dữ liệu desktop/mobile390, kho49 thuốc và select-all/tick.
  Các DOM đã quét không còn RGB123,71,47. Chưa pass visual/interactive QA
  toàn33 trang/mọi modal/hover/disabled/Firefox/zoom; chưa modal người đi cùng
  có hàng dữ liệu. Không Lưu, không đổi DB/V2.

## Modal lịch sử kê đơn tại tủ thuốc (2026-09-21)

- Theo phản hồi user, không phủ nền kem toàn bộ modal mới. Riêng
  `receiptDispensingModal` dùng nền trắng `--qlpk-color-surface`, header
  `--qlpk-workflow-context-header-bg`, header bảng xám trung tính và chữ tối.
- Màu chủ đạo tạo điểm nhấn, không thay cho phân cấp thông tin. QA cần xem
  tỷ lệ modal, độ rõ chữ và vai trò màu trên dữ liệu thật, không chỉ kiểm
  token đúng hoặc không chồng chữ. Không đổi palette các màn khác theo đó.

## Palette mở rộng và thang z-index (27/09/2026)

- Mọi màu literal của CSS dùng chung trên trang Bác sĩ/Lễ tân/TLG đã chuyển
  thành token trong `shared/color-tokens.css`: `--qlpk-palette-<họ màu>-<L%>`
  (thêm hậu tố `-a/-b` khi trùng bậc sáng) và `--qlpk-alpha-<họ>-<L%>-<alpha%>`;
  màu trùng token có sẵn thì dùng token cũ. Giá trị giữ nguyên byte, không
  đổi giao diện (computed style parity 0 khác biệt trên 3 trang). Đây là
  bảng màu tham chiếu, không phải quyết định thương hiệu mới; khi thiết kế
  vẫn dùng semantic/brand token trước.
- Thang lớp `--qlpk-z-base … --qlpk-z-top` (16 mức) thay số cứng; dropdown
  legacy người thân dùng `--qlpk-z-legacy-floating`, lịch/tooltip dùng
  `--qlpk-z-top`. Thêm lớp mới phải chọn trong thang, không đặt số riêng.

## Một kiểu nền chủ đạo; Tủ thuốc dùng đúng mẫu header (2026-09-19)

- User làm rõ: cùng mã nâu gốc nhưng nền phẳng không phải cùng kiểu màu
  chủ đạo. Mẫu chuẩn là nền nâu chuyển sắc của header Bác sĩ, không phải
  một biến thể nâu phẳng riêng cho Tủ thuốc.
- `--qlpk-workflow-context-header-bg` có một owner tại `shared/color-tokens.css`,
  chuyển nguyên công thức từ `waiting-queue-card.css`; header Bác sĩ và
  queue không đổi hình thức. Tủ thuốc dùng trực tiếp nguồn nền này cho
  nút primary (kể cả hover/active/disabled), badge Lần nhập, trang được chọn,
  checkbox được chọn và header Nhập kho. Checkbox giữ lớp icon tick ở trên.
- Nút Cập nhật/Xác nhận giá là action primary, không phải trạng thái thành
  công: bỏ palette nút xanh riêng để kế thừa nền chủ đạo và chữ trắng chung.
- `--qlpk-color-primary` vẫn là giá trị màu đơn cho chữ/viền/focus; không
  đưa gradient vào các thuộc tính chỉ nhận màu. Nút Hủy/secondary, nền kem
  của bảng, chữ dữ liệu và trạng thái DAV/cảnh báo không đổi.
- Quy ước này thay thế diễn giải cũ rằng nền nút nâu phẳng ở Tủ thuốc đã
  đồng bộ chỉ vì dùng đúng mã primary. Không tự mở rộng sửa các màn khác.

## Viền badge xác nhận DAV (2026-09-19)

- Badge DAV đã xác nhận giữ nền trắng/chữ xanh; viền thường dùng success RGB
  alpha 0.4, hover/focus dùng success dạng màu đơn, gồm cả outline bàn phím.
- Owner `medicine-management.css`: `.mm-reference-button.text-success` cấu hình
  hai biến màu viền cho badge chung. Badge Lần nhập và DAV chưa xác nhận giữ
  nguyên; không thay dữ liệu, hành vi mở đối chiếu hoặc token brand toàn cục.

## Quy ước hiện hành: màu chủ đạo là nâu sáng header (2026-09-19)

- User chốt **“màu chủ đạo” = `#7b472f`**, không phải nâu đậm ở viền trái
  trước đây. Quy ước này thay thế mọi mô tả primary/chocolate/brown-600
  cũ trong lịch sử tài liệu.
- Owner duy nhất: `app/static/css/shared/color-tokens.css` khai báo
  `--qlpk-brand-primary-rgb: 123, 71, 47` và `--qlpk-brand-primary`.
  UI gọi `--qlpk-color-primary`; focus dùng primary RGB. Các alias strong,
  Doctor và header-light cùng trỏ về nguồn này, không tự pha một nâu đậm.
- Nền nút, viền nhấn, tab đang chọn và điểm nhấn dùng primary chung.
  Không được ghi đè primary ở trang, modal, toolbar hoặc component con.
  Đã bỏ các ngoại lệ của Doctor, nền quản trị và Tủ thuốc.
- **Ngoại lệ có chủ đích:** giữ hình thức chuyển sắc của header hiện tại,
  gồm điểm cuối nâu đậm. `brown-800`/chocolate còn là màu chữ hoặc nguyên
  liệu nền chuyển sắc, không còn là màu chủ đạo của khối/nút/viền.
  Chữ dữ liệu, viền trung tính/bóng mờ, nền kem, màu loại đơn, sinh hiệu
  và trạng thái cảnh báo/thành công/lỗi không đổi theo brand.
- Không dùng biến nền chuyển sắc làm màu chữ, viền hoặc bóng. Các chỗ
  dùng sai trong lịch sử đơn thuốc đã chuyển sang primary dạng màu đơn.
- Chặn lệch pha bằng `scripts/check_brand_theme.py`: kiểm nguồn duy nhất,
  cấm khai báo đè các alias primary, cấm dùng lại nâu đậm cho nền/viền nhấn
  và alias brand. Test bảo vệ cả các khai báo cùng dòng, mobile switch và
  ngoại lệ header. Chữ trắng trên primary đạt tương phản **7.54:1**.
- QA lượt đổi màu: 48 Python tests màu + 137 JS tests đạt; brand guard đạt.
  Browser fixture1280/390 xác nhận viền Doctor/Lễ tân và nút/selected/
  focus/checkbox cùng primary; header gradient và chữ/semantic giữ vai trò.
  Không coi fixture là nghiệm thu workflow thật: localhost8000 từ chối
  kết nối, **chưa pass visual/interactive QA** trên các màn có dữ liệu thật.
  Frontend contract tổng còn lỗi thông báo Tủ thuốc có sẵn, ngoài scope.

## Viền trái dùng chung giữa Bác sĩ và Lễ tân (2026-09-19)

- Hành chính, Hỏi bệnh, Người thân và Tệp đính kèm giữ viền trái
  0.1875rem màu chủ đạo chung như Lễ tân.
- Khám & xử trí và Khám chi tiết đã có nền tiêu đề nâu chuyển sắc, nên
  dùng biến thể `qlpk-patient-visit-card--neutral-border`: cả bốn cạnh là
  viền trung tính 0.0625rem, không thêm viền trái nhấn màu. Template Doctor
  chọn biến thể; `patient-visit-info-form.css` là owner duy nhất của viền.
  Không đổi nền tiêu đề, card Tâm lý gia hoặc card mặc định dùng chung.
- Owner chung: `patient-info-form.css`, `patient-visit-info-form.css` và
  `patient-intake-support-sections.css` trực tiếp giữ viền nhấn chung.
  Đã gỡ ngoại lệ Doctor và cấu hình `--qlpk-intake-card-start-border`
  không còn cần thiết. Màu lấy từ accent chung, quy về màu primary;
  không khai báo mã màu riêng. Không đổi vùng cuộn hoặc dữ liệu.
- QA lịch sử trước khi thêm biến thể viền trung tính: 8 kiểm tra JS liên quan và brand guard đạt. Browser kiểm mẫu
  sáu khung Doctor và bốn khung Lễ tân đều có viền trái 3px màu
  rgb(75, 39, 25) trước lượt đổi primary nêu trên. Mẫu không thay thế hồ sơ thật:
  **chưa pass visual/interactive QA** trên workflow đang đăng nhập.

Cập nhật 2026-09-08: giữ nhận diện nâu–kem, vùng dữ liệu bảng ưu tiên trắng.

## Chiều cao modal Nhập kho (2026-09-19)

- Hàng Ghi chú/Chi tiết lô dùng chung chiều cao ô3.5rem, padding
  .375rem/.625rem và line-height thường; cả hai cuộn nội dung dài bên trong.
  Nhãn dùng cùng margin/line-height; hai cột căn đáy để mép ô vẫn thẳng
  khi một nhãn xuống dòng. Bỏ giới hạn riêng6rem/8rem và không cho kéo
  riêng textarea, tránh tái lệch chiều cao. Mobile xếp dọc, giữ cùng độ cao ô.
- Kiểm tra riêng bằng markup thật/CSS hiện hành và dữ liệu mẫu: rỗng,
  20 lô/ghi chú dài, nhãn xuống dòng, mobile; hai ô đều56px tại root16px,
  mép trên/dưới trùng nhau trên desktop. Đây không thay thế kiểm tra
  toàn modal với dữ liệu thật: **chưa pass visual/interactive QA** tích hợp.

- Theo yêu cầu mới, modal Nhập kho dùng hết chiều cao khả dụng, chừa mép
  trên/dưới .5rem; không còn ôm nội dung ít dòng như phương án 2026-09-17.
  Owner là `#importBatchModal` trong `pages/medicine-management.css`:
  dialog cao `calc(100dvh - 1rem)`, content cao100% và min-height0. Khi
  ở tab nhúng, viewport là khung nội dung dưới thanh ứng dụng.
- Desktop: header/tab/footer giữ chiều cao tự nhiên; body và pane truyền
  phần cao còn lại cho bảng thuốc hoặc bảng lịch sử. Không tăng padding,
  chiều cao hàng thuốc, ô nhập hoặc hai vùng ghi chú/chi tiết lô.
- Màn hẹp dưới48rem hoặc thấp dưới45rem: cuộn thân modal, không co bảng
  đến mất hàng nhập. Header/footer ở ngoài vùng cuộn, vẫn tiếp cận nút
  xác nhận. Không thay HTML, JS, tính tiền hoặc writer nhập kho.
- Đã kiểm tra tự động layout; browser riêng yêu cầu đăng nhập nên
  **chưa pass visual/interactive QA** với đơn ít/nhiều thuốc và lịch sử thật.

## Lịch sử gom mã nâu trước khi đổi primary (2026-09-19)

- Owner là `shared/color-tokens.css`. Nâu thương hiệu `#4b2719` lấy từ
  `--qlpk-brown-800-rgb: 75, 39, 25`; `--qlpk-brown-800` dựng màu bằng
  `rgb(var(--qlpk-brown-800-rgb))`, chocolate gọi lại bậc này. Nền/viền/bóng
  trong suốt dùng `rgba(var(--qlpk-brown-800-rgb), alpha)`, giữ nguyên alpha.
  Không khai báo thêm một bản hex hoặc bộ số RGB tương đương ở thành phần.
- Nâu sáng đầu dải chuyển có một nguồn `--qlpk-color-header-light`;
  nâu đậm tương tác có một nguồn kênh `--qlpk-color-primary-strong-rgb`.
  App header, hàng chờ, lễ tân và Bootstrap chỉ gọi lại các nguồn này.
- Lượt 18/09 đã gom 69 lần viết hex lặp nhưng chưa bao phủ RGB. Lượt 19/09
  xử lý cả 47 màu trong suốt (40 ngoài palette), bộ số màu ở Tủ thuốc,
  năm lần ghi mã nâu sáng, và bộ số màu hover còn cứng trong Bootstrap.
  Giữ các tên màu theo vai trò hiện có, không gom nền, chữ, viền và trạng
  thái vào một biến nền.
- Đây là dọn nguồn màu, không phải thay thiết kế: nền nâu đặc của nút đang
  chọn vẫn là nâu đặc; nền chuyển sắc của tiêu đề vẫn là chuyển sắc. Không
  đổi màu cảnh báo, thành công, lỗi hoặc các bậc nâu khác.
- `scripts/check_brand_theme.py` quét CSS, HTML, JS và SVG trong `app`:
  bắt mã hex 6/8 ký tự, RGB/RGBA, HSL/HSLA, bộ số kênh màu và khai báo đè
  nguồn chung; bỏ qua chú thích. Bảo vệ ba sắc nâu nêu trên, không cấm các
  sắc độ hoặc màu trạng thái khác. Test riêng bảo vệ việc không dùng nền
  chuyển sắc làm màu chữ/viền màn Bác sĩ.
- QA 19/09: 30 Python + 117 JS đạt; theme đạt. Đối chiếu source và HTTP của
  14 stylesheet xác nhận giữ nguyên giá trị; 26 mẫu trên browser cho kết quả
  trước/sau giống nhau ở nền, chữ và viền. Đây là kiểm tra kỹ thuật, không
  thay thế dữ liệu thật. Browser riêng vẫn về đăng nhập khi mở màn Bác sĩ:
  **chưa pass visual/interactive QA** trên các trạng thái nghiệp vụ thật.

## Thang nâu và xám ấm (2026-09-12)

- Owner: `app/static/css/shared/color-tokens.css`. Thang `--qlpk-brown-50`
  ... `--qlpk-brown-900` sinh bằng CIELAB: L* trải đều 97.6 -> 12.4, hue chuyển
  dần 80deg (kem) -> 47deg (chocolate). `--qlpk-brown-800` **chính là**
  `#4b2719` của thang màu; không phải primary hiện hành. Không đổi các bậc
  palette để tránh đổi màu chữ dữ liệu và điểm cuối header ngoài chủ đích.
- Lý do tồn tại: palette cũ có 6 nền dồn trong L* 95.5-100 (mắt không phân biệt
  nổi) rồi nhảy thẳng xuống L* 25 — khoảng L* 25-70 hoàn toàn trống. Đó là gốc
  của cảm giác "tệp màu": giao diện chỉ có kem rất nhạt hoặc nâu rất đậm, không
  có tầng giữa để xếp thứ bậc. Thang này lấp đúng khoảng đó.
- Quy tắc dùng: phân cấp lấy từ **độ sáng**, không mở hue mới. Bậc 400 trở lên
  (3.28:1) chỉ dùng cho UI/icon; bậc 500 trở lên (5.01:1) mới được dùng cho chữ
  thường. Bậc 300 trở xuống chỉ trang trí và viền.
- `--qlpk-warm-gray: #675f5c` thay `#566366` cho `--qlpk-color-text-muted` và
  `--qlpk-color-muted`. Màu cũ có hue 191deg, lệch 150deg khỏi hệ nâu-kem nên
  chữ phụ trên nền kem bị lệch tông. Màu mới giữ đúng L*41 nên tương phản không
  đổi: 6.23:1 trên trắng, bằng đúng màu cũ. Một số file page còn giá trị dự
  phòng `var(--qlpk-color-text-muted, #566366)`; đó là fallback chết vì token
  luôn được nạp, chưa dọn.
- **Không dùng `--qlpk-workflow-context-header-bg` làm token màu.** Biến đó là
  linear-gradient; đưa vào `color-mix()` hoặc `border: solid` sẽ hỏng im lặng.

## Phân tầng app launcher (2026-09-12)

- Owner: `app/static/css/components/app-header.css`. Ba nhóm nhận ba tier qua
  `--qlpk-launcher-tier-ink` và `--qlpk-launcher-tier-chip`:
  `--operations` (nâu 800 / chip 200), `--inventory` (nâu 700 / chip pha gold
  30%), `--admin` (nâu 500 / chip 150). Định danh nhóm bằng sắc độ và một điểm
  gold, không mở hue mới cho từng nhóm.
- Ô icon bỏ khối gradient đặc màu trắng-trên-nâu. Gradient cũ đi từ `#4b2719`
  sang `#5a301f` — chênh 4.8 điểm L*, mắt không thấy, nên nó chỉ là khối nâu
  phẳng và là phần nặng nhất màn hình dù chỉ mang thông tin trang trí. Nay là
  nền tint nhạt + glyph màu tier, trả trọng số thị giác về cho nhãn chức năng.
- Chấm tròn trước tiêu đề nhóm và màu tiêu đề cũng dùng `tier-ink`, trước đây
  cả ba nhóm dùng chung một gradient nên không phân biệt được nhóm.
- QA 2026-09-12: tương phản glyph/chip đo trên trình duyệt lần lượt 8.64 /
  7.52 / 3.94 — giảm dần đúng ý đồ và đều đạt ngưỡng 3:1 cho UI. Chip nổi trên
  ô 1.49 / 1.35 / 1.25. Không lỗi console ở launcher và màn Thống kê thuốc.
- Chưa làm: KPI card, header bảng và icon ở các màn còn lại vẫn dùng khối nâu
  đặc kiểu cũ. Thang màu đã sẵn sàng nhưng chưa áp cho chúng.

## Màn quản trị dùng chuẩn Tủ thuốc (2026-09-12)

- Riêng bảng DAV, owner `medicines/reference-catalog.css` dùng base13 cho
  dữ liệu, metadata và badge; tên thuốc nhấn semibold. Control/nút trong
  content-wrap cũng base13; tiêu đề và summary giữ phân cấp đã chốt.

- Opt-in bằng body `.qlpk-clinic-page` và một link `shared/clinic-workspace.css`.
  Foundation sở hữu `.qlpk-clinic-header`, `.qlpk-clinic-title`, subtitle và
  `.qlpk-clinic-summary*`. Các trang compose trực tiếp, không sao chép ảnh/CSS
  header vào từng page. `shared/admin-management-ui.css` tiếp tục sở hữu
  bảng, surface và control admin; page-private CSS giữ workflow riêng.
- Áp dụng: Tủ thuốc + 18 màn quản trị nêu tại `refactor-progress.md`.
  Allowlist nguồn nằm trong `scripts/check_brand_theme.py`; không tự mở rộng
  sang Lễ tân/Bác sĩ/TLG/Lịch hẹn/Trang chủ/Thống kê/Thu chi/CLS/Hóa đơn hoặc
  trang bên ngoài. Palette `:root` và navigation shell không bị đổi trong
  lần đồng bộ này; page config truyền `--qlpk-workspace-bg` vào shell.
- Header là natural flow, ảnh absolute không bắt sự kiện; nền kem, surface
  trắng radius0.875rem, bóng nhẹ; primary/strong nay kế thừa màu chung,
  không còn đặt riêng brown-500/brown-700.
  Bảng header brown-150/700, ô trắng, đường kẻ brown-100; trạng thái nghiệp vụ
  giữ semantic. Số tổng gọn nhãn12/số14, mobile2 cột; không đưa KPI lớn trở lại.
- Layout chain: shell flex viewport → native pane/embedded main → page.
  Danh mục cuộn dọc trong native pane, bảng cuộn ngang tại table-responsive.
  Survey list giữ flex header/card/table-scroll/pagination; Tài liệu giữ flex
  header/two panes, từng pane scroll; editor giữ header/tabs/content-scroll.
  Selector surface admin phải nhận native pane sau khi shell chuyển DOM.
- Phân trang quản trị (bổ sung 2026-09-12): footer dùng
  `partials/clinic-pagination.html` + `components/clinic-pagination.js`.
  Foundation chung nhận nguyên token pagination của Tủ thuốc, gồm hover,
  focus và disabled nâu–kem. Mặc định 10, các lựa chọn 10/20/50/100;
  nhãn số dòng, khoảng đang hiển thị và nút điều hướng luôn có cả khi rỗng.
  Một frame cho vùng bảng; footer nằm ngoài phần cuộn ngang, xuống dòng
  trên mobile. Không giữ renderer hoặc CSS pagination page-local song song.
  Allowlist 12 danh sách ở `CLINIC_PAGINATION_PAGES`; trang editor/tree/cấu
  hình không được gắn footer danh sách một cách máy móc.

Các màn quản trị đã dọn typography sau audit 2026-09-12:
Nhóm quyền, Từ viết tắt, Tương tác thuốc, ICD, Lịch bận, Tài liệu và danh
sách mẫu khảo sát. Font dữ liệu bảng là base13px; badge/metadata kế thừa
ô cha, không dùng `small` hoặc `code` để thu nhỏ cả một cột. Tiêu đề,
icon và hướng dẫn ngoài bảng giữ phân cấp riêng. Tài liệu sở hữu cỡ gốc
tại `.table-custom`, cả header/cell/nhãn link kế thừa.

Gợi ý lý do Lịch bận: `.busy-reason-suggestions` sở hữu cuộn ngang,
`.suggestion-badge` sở hữu hình thức, `.is-selected` biểu diễn lựa chọn;
không ghép utility màu Bootstrap rồi ghi đè bằng nhiều ID/`!important`.
Tài liệu không tải `custom-animations.css`. Toast của Tài khoản và editor
khảo sát chỉ dùng feedback runtime; CSS/DOM toast cũ đã được gỡ.

## Tủ thuốc: nền ảnh và chỉ số gọn trong toolbar (2026-09-12)

- Đã triển khai sau user duyệt preview poster: title band có ảnh nội thất
  `assets/images/medicine-clinic-interior.jpg` (JPEG 159 KB thay PNG 1,9 MB, 27/09), mask từ trái và fade đáy;
  photo absolute/pointer-events none không quyết định chiều cao. Copy giữ
  natural flow; dưới 56.25rem giảm photo opacity còn 0.22 để chữ đọc rõ.
  Primary page dùng brown-500, strong brown-700; semantic giữ nguyên.
- Nền có một owner `--qlpk-workspace-bg: #f3ebdd` tại foundation chung, truyền
  màu này tới shell. `components/app-header.css` nhận biến ở main,
  frame-host và embedded main với fallback #fbf8f2, tránh shell ghi đè nền
  page. Không đổi palette chung hoặc màu header của các màn khác.
- Header/summary/radius/shadow: `shared/clinic-workspace.css`; bảng và
  nghiệp vụ thuốc: `pages/medicine-management.css`. Giữ nền kem,
  toolbar/bảng trắng và bóng mềm. User đã bỏ cả 4 thẻ KPI lớn: chỉ số giờ
  ở `.mm-toolbar-summary`, bên phải nhóm nút trong `.mm-toolbar-top`;
  không khung, icon hoặc bóng riêng. Giữ các ID dashboard và API gốc.
- Nhãn sm12px phía trên; số md14px/semibold, tabular-nums và brown-700
  phía dưới, không truncate. Giữa nhóm có vạch mảnh brown-200, khoảng đệm
  ngang 1rem; mobile chỉ ngăn giữa hai cột. Riêng số cảnh báo theo
  `--qlpk-feedback-warning`.
  Toolbar flex wrap theo nội dung, mobile chỉ số xếp2 cột dưới nhóm nút.
  Không đưa lại hàng KPI chiếm chiều cao phía trên bộ lọc.
- Bảng: header `--qlpk-brown-150` chữ brown-700, bo góc hai đầu band; ô dữ
  liệu trắng, kẻ dòng brown-100, hover brown-50; toàn bộ chữ dữ liệu dùng
  base13px, tên thuốc cùng cỡ nhưng semibold, hover mới ra màu primary.
  Nhãn lần nhập kế thừa font-size/line-height của ô; giá nhập không dùng
  Bootstrap `small`. Badge lần nhập pill trắng viền
  brown-200 (một owner tại `.stock-detail-badge`).
- Sau trace CSS 2026-09-12: Tủ thuốc nạp trực tiếp
  `components/option-autocomplete.css`, không nạp `custom-animations.css`
  chứa style bác sĩ/hover nút không thuộc workflow. Các màn legacy vẫn nhận
  dropdown qua import của file cũ. Page chỉ cấu hình shadow/z-index dropdown;
  modifier floating chỉ sở hữu vị trí. Không nhân bản paint của component.
- Modal rộng dùng `.mm-dialog-wide` (90% như giá trị computed trước dọn);
  modal-content/body/header/footer sở hữu flex và scroll. Shell dùng contract
  của app-header, không ép lại cột Bootstrap 83.33%. Footer, badge lần nhập
  và nhãn loại đơn có một block gốc; primary dùng Bootstrap brand, utility
  page chỉ giữ kích thước. Toast thuộc feedback runtime, không còn CSS local.
- Toolbar Tủ thuốc (2026-09-18): "Thêm thuốc mới", "Nhập kho", "Xuất dữ
  liệu" và "Xem" dùng chung `.btn-primary` của bootstrap-brand. Cập nhật
  19/09: bỏ palette riêng tại `.mm-toolbar-surface .btn-primary`; nút và
  nền "Lần nhập" cùng dùng primary toàn hệ thống, chữ trắng; trạng thái Bootstrap
  tiếp tục do owner chung quản lý. Không làm
  nhạt nút đang hoạt động hoặc dùng ID selector ép màu. Đã bỏ CSS nút viền
  toolbar; `.mm-action-secondary` chỉ còn dùng cho nút Hủy trong modal.
  Giữ radius nút 9 và bóng nhẹ của nhóm hành động, không đổi layout/logic.
- Input lọc nền trắng đặt tại page owner (không đổi `--bs-body-bg`); badge
  lần nhập nền primary/chữ trắng. Typography dùng token, không hard font-size.
- QA chỉ số gọn: desktop1280/1440 và mobile390, 51 thuốc thật, đủ/ít/rỗng
  sau lọc; bốn ID cập nhật đúng, console sạch, docW375 <390 không tràn.

## Owner và thứ tự nạp

- `app/static/css/shared/color-tokens.css`: bảng màu chuẩn. Primary và
  hover/active trỏ về brand-primary `#7b472f`; nền trang `#fbf8f2`, nền
  chọn `#f8f1e9`, card trắng, chữ `#352821`, viền `#e8dfd6`.
- `app/static/css/shared/bootstrap-brand.css`: ánh xạ Bootstrap button, link,
  pagination, tab, accordion, progress, focus, checkbox/radio sang token chuẩn.
- `app/templates/partials/brand-theme.html`: một include duy nhất trên mỗi
  trang web, sau CSS vendor/Bootstrap và trước CSS component/page. Hiện 33
  template gốc dùng include này; không chèn thêm color-tokens riêng ở page.
- Admin shell, management list, icon actions, app header/launcher sử dụng
  primary chung. CSS trang chỉ sở hữu chi tiết riêng của workflow, không định
  nghĩa một primary xanh/teal mới. Tên alias legacy có chữ blue không đồng
  nghĩa giá trị được phép khác primary chung.

## Phạm vi màu

- Tiêu đề, nút thao tác thường, liên kết, tab đang chọn, focus, phân trang,
  nhãn phân quyền, nền/viền card và bảng dùng nâu–kem.
- Giữ màu có ý nghĩa dữ liệu: thành công/cảnh báo/lỗi, trạng thái nghiệp vụ,
  mức độ nguy cơ lâm sàng, phân biệt chuỗi biểu đồ và màu lịch theo người
  thực hiện. Màu picker của bác sĩ là dữ liệu do người dùng chọn.
- Không biến cảnh báo hoặc thao tác xóa/kết thúc thành nút nâu. Không dùng
  xanh/vàng chỉ để trang trí tiêu đề giá cả, nhãn quyền hoặc nút xuất Excel.
- Quy tắc bảng dữ liệu đã chốt 08/09: ô dữ liệu nền trắng, chữ tối trung tính,
  viền mảnh; tiêu đề nền kem nhạt. Giá/số lượng/số lô không có nền màu trang
  trí. Cảnh báo nằm ở icon/nhãn/ô cần sửa, không nhuộm cả hàng. Chỉ hover hoặc
  chọn hàng dùng nền nhẹ; giữ màu chữ/nhãn có nghĩa như hết tồn và chênh lệch.
- Owner dùng lại: `.qlpk-data-tables` trong `shared/bootstrap-brand.css` đặt
  riêng biến Bootstrap table, viền ô và trạng thái hover/chọn. Checkbox chọn
  hàng dùng `.qlpk-row-select`. Đã bật ở Thuốc, Dịch vụ, Nhóm dịch vụ,
  Nhóm tài khoản, Tài khoản, Ngày lễ, Viết tắt, Phím tắt, Lịch bận bác sĩ,
  Thống kê thuốc và Chi tiêu, bao gồm bảng Bootstrap trong modal.
  Không đổi `--bs-body-bg` toàn ứng dụng
  hoặc sửa từng trang bằng selector nặng/`!important`.
- Màn Thuốc đã bỏ row warning/danger/info khỏi danh sách/lô/tổng báo cáo;
  số lô là button trắng viền mảnh có thể mở bằng bàn phím.
- Bảng admin dùng viền ô chung trong `admin-management-ui.css`. Bảng custom
  Chi tiêu và grid khảo sát giữ owner CSS riêng: dữ liệu trắng, header kem;
  Chi tiêu chỉ đánh dấu khoản lớn ở STT, không tô dòng hoặc ô loại chi.
  Thống kê thuốc có số loại trắng viền mảnh và tổng số liệu chữ trung tính.
- Lát đồng bộ màu không đổi cấu trúc màn hình, typography, nội dung, API,
  chấm điểm, dữ liệu bệnh nhân hay hợp đồng in. Login giữ bố cục và nội dung
  đã chốt trong `login.md`.

## Kiểm tra

### Tiêu đề cố định bảng Kho thuốc (2026-09-19)

- `.mm-sticky-head` dùng chung cho bảng nhà cung cấp và bảng thuốc nhập.
  Header chỉ vẽ nền/viền trong ô; không có bóng đổ xuống dòng dưới hoặc
  pseudo-element kéo nền ra ngoài ô. Giữ sticky top zero trong vùng cuộn
  hiện có, không tăng padding hàng đầu để né lớp che. Nội dung nhiều dòng
  ngay dưới header phải đọc đủ từ đầu, kể cả địa chỉ nhà cung cấp.

### Badge và chữ trạng thái (2026-09-10)

- Bổ sung 2026-09-19: nhãn trạng thái ngắn giữ một dòng và không co khi
  nằm trong flex; bỏ giới hạn chiều rộng theo ô gây bóp nền nhãn. Không
  cắt chữ hoặc giảm cỡ chữ để nhét vào cột. Bảng nhà cung cấp để trạng
  thái/tác vụ co theo nội dung không xuống dòng, không áp min-width bằng
  px/rem; Tên và Địa chỉ dùng chiều rộng tự động để nhận phần dư. Width
  zero là gợi ý co cột trong thuật toán table-auto, nội dung quyết định
  chiều rộng thực; không phải ô rộng zero. Căn giữa dọc và giữ cuộn ngang
  trong vùng bảng ở màn hẹp. Không đổi giá trị trạng thái.
- `shared/feedback-tokens.css` sở hữu `.qlpk-status`: nền semantic đặc,
  chữ trắng, bo pill, cỡ chữ base 13px và đệm theo em. Thành công dùng
  `#198754`, cùng màu dấu tích Liên hệ khẩn cấp; info `#2563eb`, warning
  `#b45309`, error `#dc2626`, critical `#991b1b`, neutral `#475569`.
- Component/page chỉ ánh xạ state class hoặc `data-status` hiện hữu sang
  `--qlpk-status-color`; không tự vẽ lại badge. Các modifier dùng chung là
  `qlpk-status--success|info|warning|error|critical|neutral`. Metadata như nơi
  thực hiện vẫn dùng `qlpk-feedback-token` trung tính; không dùng token đó
  như một renderer trạng thái nền nhạt song song.
- Badge Bootstrap semantic được bridge ở cùng owner, kể cả legacy
  `text-dark`/`bg-opacity-*`. Hai `!important` chỉ để thắng utility Bootstrap.
  `bootstrap-brand.css` ánh xạ RGB của các utility chữ sau khi vendor nạp.
- Áp dụng cho tài liệu hành chính, đơn thuốc/hẹn tái khám, CLS trong workspace
  và màn quản lý, hàng chờ, lịch sử bệnh nhân, thanh toán, mẫu khảo sát,
  dashboard, đồng bộ Calendar, trạng thái lịch trong modal, thống kê tồn kho,
  viết tắt và các danh mục dùng badge Bootstrap.
- Không đổi trạng thái/API, màu theo bác sĩ trên lịch, mức nguy cơ lâm sàng,
  biểu đồ hoặc mẫu in. Metadata không được suy thành trạng thái nghiệp vụ.
  Chữ hint trên nền trắng dùng token
  semantic đậm, không dùng màu xanh sáng dành cho tiêu đề Doctor nền tối.
- `check_brand_theme.py` kiểm thêm contrast tối thiểu 4.5:1 giữa trắng và cả
  sáu màu semantic. Visual QA phải xem nhãn có dữ liệu, nhãn dài, nền tối,
  selected row và bảng scroll; đổi token không tự đồng nghĩa mọi state đã QA.

- `python3 scripts/check_brand_theme.py` kiểm include 33 trang, alias primary,
  admin/icon và giữ màu semantic. Được gọi bởi frontend contract tổng.
- `python3 scripts/check_frontend_contract.py` và `git diff --check`.
- Browser cần xem màn có dữ liệu, modal mở, tab/hover/focus/selected và menu
  mobile. Không lấy số DOM row ẩn làm bằng chứng workflow đã được kiểm tra.
- Màn legacy không được launcher nhận diện có thể bị shell đưa về trang chủ.
  Kiểm đúng nội dung trang bằng `?embed=1` khi QA CSS phần nội dung; cách này
  không chứng minh đường dẫn top-level/shell đã đúng.

## Kết quả đợt 2026-09-07

- Quét 31 route web và trang đọc kết quả khảo sát GAD-7 trên trình duyệt,
  không có lỗi JavaScript. Xem lại các trang phím tắt/dị nguyên/tài liệu ở
  chế độ embed để xác nhận đúng nội dung thay vì trang chủ của shell.
- Kiểm trên dữ liệu hiện có: danh sách khảo sát, thuốc, dịch vụ, tài khoản,
  nhóm quyền, dị nguyên, lịch hẹn, thanh toán, chi tiết chỉ định và bài đã nộp.
- Phân trang khảo sát 10→trang 2→25, tìm kiếm rỗng, editor câu hỏi/kết quả,
  modal sửa thuốc/tài khoản và launcher desktop/mobile đã kiểm. Các bước
  tương tác chặn request ghi; không lưu thay đổi dữ liệu để kiểm màu.
- Các màn bác sĩ/tâm lý gia trong lượt quét chưa chọn lượt khám; chưa kết
  luận QA đầy đủ form lâm sàng. Danh mục DAV, gói dịch vụ và một số danh sách
  đang trống/placeholder; trang xác minh đơn thuốc chỉ được kiểm include.
- ICD tải danh sách/nhóm trả 401: `icd-management.js` đọc localStorage `token`,
  trong khi login ghi `qlpk_token`; refresh cũng 401. Đây là vấn đề auth có
  sẵn tại lượt kiểm 2026-09-07; đã sửa trong lượt 2026-09-13 bên dưới.

## Chuẩn control quản trị và sửa ICD (2026-09-13)

- Scope vẫn là 19 trang opt-in trong `check_brand_theme.py`, gồm Tủ thuốc;
  giữ các màn lâm sàng/tài chính/trang chủ/lịch hẹn và trang public ngoài scope.
- `clinic-workspace.css` sở hữu chữ ô nhập/nút 13px, placeholder kế thừa cỡ
  chữ, regular, không nghiêng, màu text-muted; radius control 9px, surface/modal
  14px, tiêu đề modal 18px. Global search trên app header giữ owner riêng.
  Các field tùy chỉnh dùng cùng token; shared shell giữ fallback cho consumer
  ngoài scope. Không ép trạng thái validation bằng selector nặng.
- Bỏ utility rounded cạnh tranh với control, bỏ placeholder thuốc 12px italic,
  sửa ô tìm Lịch bận chữ trắng trên nền sáng. Phân quyền bỏ bo 18px và nhãn
  checkbox 18px riêng; panel dùng token chung.
- ICD page CSS chỉ giữ geometry 6 cột và trạng thái import. Đã bỏ gradient
  xanh, button/form/toast/table chrome trùng shared owner, width cột kiểu cũ
  5 cột và overflow hidden. Header cho filter wrap; bảng cuộn ngang trong
  wrapper, phân trang là sibling ngoài vùng cuộn.
- ICD và Phân quyền nạp utils.js để dùng auth chung. ICD bỏ token legacy,
  refresh/retry riêng; hiển thị riêng loading/error/retry/empty, chống response
  cũ, ẩn pager khi lỗi và lùi trang hợp lệ khi trang cuối hết dữ liệu.
- Phân quyền chọn bằng ID và đọc đúng array group_id, khóa lưu trong lúc
  tải/lỗi tải, chống phản hồi cũ, nối search người dùng. Nhóm quyền chỉ
  hiển thị filter mã/tên/mô tả có trong Group; Tài khoản lọc tìm trên dataset
  API. Placeholder mô tả đúng trường tìm ở các màn này và Lịch bận.
- QA: frontend contract, Jinja 19 template, HTTP 19 route/63 asset, JS syntax,
  4 test ICD và bộ test pagination đạt. Phiên quản trị Firefox đã tải thực
  12.218 ICD sau sửa auth. Lượt kiểm tiếp13/09 đã tìm đúng Firefox Admin:
  ICD trang2/cuối/tìm/rỗng/modal sửa đạt; mobile390 sửa select intrinsic width
  cùng table min-width60rem để cột nhóm không bị ép quá hẹp. Bỏ riêng ICD
  khỏi shared min-width680px, giữ owner cuộn ngang và footer sibling.
- Tài khoản sửa form/role filter thực trong template, flex search co giãn;
  Hoạt chất/Dị nguyên khôi phục display:none cho file input bị gom nhầm.
  Có dữ liệu thật ở các danh sách đã mở; chi tiết tại smoke-checks.
  **Chưa pass visual/interactive QA toàn bộ18 màn còn hiển thị** vì chưa chạy
  hết ma trận modal/validation/responsive. Gói dịch vụ đã ẩn theo yêu cầu;
  template vẫn trong allowlist19 để giữ style nếu khôi phục. Không còn coi
  thiếu phiên Admin là điều kiện chặn QA.
- QA mobile tiếp: shared filter-bar dùng background-color để giữ SVG select
  Bootstrap; catalog/service card header wrap và search chiếm dòng dưới36rem.
  Tương tác thuốc có table min-width62rem trong wrapper cuộn, tránh ép cột
  hậu quả thành dòng rất cao. Đã nhìn lại các state có dữ liệu ở390px;
  snapshot lúc đó còn desktop/cuộn/modal; đã kiểm tiếp ở lượt hoàn tất dưới.

## Hoàn tất lượt QA giao diện quản trị 13/09/2026

- Kết quả hiện hành: `reports/admin-ui-qa-2026-09-13.md`. Đã kiểm desktop
  sau patch và mobile390 bằng dữ liệu thật, footer/trang cuối, modal có dữ
  liệu, validation ICD, DASS21 dài, gợi ý Lịch bận, launcher/URL đã ẩn.
- Table owner thuốc/DAV giữ min-width74rem trong wrapper cuộn; bảng lô
  min-width66rem và chữ token13, bỏ lớp16px riêng. Footer vẫn là sibling.
  Nhãn tìm rỗng thuốc căn trái để đọc được trong mobile viewport.
- Lịch bận sửa parent header/filter flex-wrap trước khi sửa table geometry;
  trạng thái một hàng colspan dùng table-layout fixed/min-width0.
- Input-group Flatpickr chỉ sửa góc field hiển thị/first addon trong admin,
  do sibling hidden kích hoạt reset Bootstrap. Không phủ radius mọi child.
- Badge Từ viết tắt giữ một dòng và min-width cột trạng thái8rem.
- Giới hạn QA ghi/import/network và cảnh báo dữ liệu tồn kho được ghi riêng
  trong báo cáo; không kết luận mọi nghiệp vụ đã pass từ kiểm tra giao diện.
