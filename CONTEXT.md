# QLPK Context Harness

File nay la cua vao bat buoc cho AI. Giu ngan. Khong ghi nghiep vu dai o day.

## 1. Read First

Moi task doc 5 file dau tien, dung thu tu:

1. `CONTEXT.md`
2. `AGENTS.md`
3. `rule.md`
4. `references/ai-contract.md`
5. `references/context-files.md`

Sau do chi doc route task trong `references/context-files.md`.

## 2. Mandatory Output Flow

Moi task QLPK phai di qua flow nay:

1. `Task Gate` - loai task, co code khong, workflow/module, route, owner, scope, QA.
2. `Findings` - ket qua doc tai lieu/code/runtime, khong doan.
3. `Proposed Solution` - phuong an cu the de user chot.
4. `Scope To Confirm` - se lam gi, khong lam gi, can user chot gi.
5. `Develop` - chi lam khi duoc phe duyet ro.
6. `QA` - validate dung loai task, UI phai co visual/browser QA neu moi truong cho phep.
7. `Report` - bao cao that: da lam, da test, chua test.
8. `Update Knowledge` - cap nhat tai lieu owner neu co kien thuc moi.

Neu task chi hoi/bao cao, van phai co `Task Gate`, `Findings`, va ket luan ngan.

## 2.1 UI Accountability Gate

Truoc khi sua hoac chot UI, phai ghi ro ket qua nhin thay va cac state can
kiem. Trace layout tu parent den child, dac biet height, grid/flex, overflow,
scroll va pagination; khong duoc sua mot child roi doan parent se dung. Trang
thai hidden/empty khong bao gio du de ket luan visual QA dat. Khong goi UI la
hoan thanh neu chua kiem state co du lieu that, state day/thua, va thao tac
nguoi dung can dung; neu moi truong thieu state nay, phai bao `chua pass
visual/interactive QA`.

## 3. Stop Conditions

- Khong co `Task Gate` thi khong duoc ket luan hoac code.
- Khong co `Findings` thi khong duoc de xuat giai phap.
- Khong co `Proposed Solution` thi khong duoc xin chot scope.
- Khong co user approval ro thi khong duoc sua file/code/runtime.
- Khong co QA thi khong duoc bao `xong`, `pass`, `da on`.

## 4. Source Of Truth

- Nút hành động KHÔNG dùng màu nâu/gradient thương hiệu. Quy chuẩn bắt buộc:
  `references/ui/button-system.md`; chính xanh #176B5B, phụ trung tính,
  nguy hiểm đỏ, không viền trang trí/shadow. Giữ nguyên vị trí nút.

- "Màu chủ đạo" UI = gradient header chung; primary chữ/icon/viền lấy
  nâu cuối header qua `--qlpk-brand-primary` trong `shared/color-tokens.css`.
  Đã bỏ nâu phẳng cũ khỏi runtime. Không tự đặt lại màu ở từng trang. Đọc quy ước
  và ngoại lệ header/chữ/trạng thái trong `references/ui/brand-theme.md`.
- Kiểu nền chủ đạo theo mẫu user là nâu chuyển sắc header, dùng
  `--qlpk-workflow-context-header-bg` từ color-tokens. Tủ thuốc không dùng
  nâu phẳng thay thế; primary màu đơn dành cho chữ/viền/focus.
- Nghiep vu: `references/business-map.md` va workflow map.
- Du lieu/API: `references/data-contracts.md` va backend source.
- UI/UX: UI references, component owner, rendered browser.
- Man bac si: doctor context + doctor workflow map + doctor data inventory.
- Tien do/handoff: `references/refactor-progress.md`.
- Context chung Hanh chinh/Le tan/Tu thuoc/Nhap kho/DAV: doc muc
  "Context chung đang tiếp tục — 22/09/2026" trong file tren truoc ghi chu
  lich su; cap nhat tap trung tai do, khong ghi nhat ky le te.

### Tien do gan nhat (2026-09-15)

- Gia ban: o chi xem + nut Cap nhat gia, gia cu/moi/chenh lech va lich su.
  medicines giu gia hien tai; history FK mot chieu, server ghi Tu/Den. Local
  migration20260915_medicine_price_history da ap dung; khong backfill.
  89 Python +22 JS tests dat; user QA, chua pass visual/interactive QA.

- DAV: da luu15432 duong dung suy ra/54752 vao2 cot rieng (gia tri/version),
  giu route/raw goc. Sync ghi/cap nhat/xoa; API/form doc DB, khong tinh lai.
  Local migration `20260915_dav_stored_route` da ap dung, backup/verified
  journal trong `reports/dav-stored-route-2026-09-15/`.143 tests va schema/
  Alembic dat; kho/lo/giao dich/don khong doi. Chi tiet refactor-progress.

- Tu thuoc: user yeu cau nguoi phu trach tu xac nhan DAV; dung mapping tu
  dong. Nut tung thuoc mo tim ten/hoat chat/SDK, doi chieu ten ban dau va
  DAV, checkbox xac nhan, co the chon lai. Endpoint reference-review rieng
  kiem quyen kho, stale/duplicate/source va ghi actor/time. User sau do yeu
  cau chap nhan cac mapping cu: hien27 confirmed/24 unlinked. Ghi acceptance
  cho26 pending, giu1 link7485 da duoc user doi sang4461/xac nhan truc tiep.
  Journal: reports/dav-migration-2026-09-14/user-acceptance/.72 Python
  rollback +20 JS dat; user QA, chua pass visual/interactive QA.

- DAV local: da ghi them17, hien27/51 linked;24 con lai da note tung dong
  (6 nhieu ung vien,5 nguon chua hop le,12 chua xac lap ten,1 trung/ten mau
  thuan). Ten + hoat chat tim nguon, field danh muc lay DAV; bo so quy cach
  cu va fallback identity cu. Quy doi kho/ton/lo/gia/lich su giu nguyen.
  Sua dung2 nguon Exidamin/Mebamrol dao cot co chung cu, raw giu nguyen,
  normalization dong bo co guard cu the. Backup truoc ghi,70 tests va
  hau kiem27 links/48 lo/2744 giao dich/877 dong don dat; user tu QA UI.
  Report hien hanh: `reports/dav-migration-2026-09-14/stage-2/report.md`.

- Tu thuoc: quy trinh khep kin chi them tu DAV, ke ca Excel. PUT thuong van
  chan doi nguon; nguoi phu trach xac nhan qua luong rieng o muc tren.
  Giu form theo anh da duyet, sua cau hinh phong kham va nhap so luong qua
  lo. 50 Python +15 JS dat; user tu QA, chua pass visual/interactive QA.
  Doc muc "Tủ thuốc: DAV bắt buộc, migration nội bộ" trong refactor-progress.

- DAV da bo Pham vi dong bo; nut Dong bo DAV luon toan bo. Chi tiet thuoc
  da go nut/logic xem raw payload va truong tho trong API. Xuat Excel theo
  search/hieu luc, tat ca trang, mau nau-kem. QA Firefox desktop/mobile,
  tai file1239 dong, service full54752 dong va mo Microsoft Excel da kiem.
  Doc muc "DAV: bỏ phạm vi đồng bộ" trong `references/refactor-progress.md`.

- Tu thuoc da lien ket nguon DAV cho duong tao/Excel; thuoc cu can doi chieu.
  Form them moi da map duong dung/Noi-Ngoai, goi y don vi va quy doi ro
  tu DAV; xac nhan quy doi truoc luu, giu cau hinh thuoc cu. Chi tiet muc
  "Mapping DAV vào form thêm thuốc" trong `references/refactor-progress.md`.
  Form DAV autocomplete focus la xo, cuon tai them; lookup bo COUNT/summary,
  cache RAM30 giay. Local da co migration `20260912_dav_search_indexes`:
  tablet backend 1839→54ms, focus rong ~4ms; full-list keyword18 con ~888ms.
  QA backend/index dat; DAV list/search da kiem Firefox trong task export.
  Doc muc "DAV: index tìm không dấu" va "DAV → Tủ thuốc" trong
  `references/refactor-progress.md`.

- Da ap dung code giao dien Tu thuoc cho 18 man quan tri con lai theo
  allowlist; giu cac man user loai tru va trang ben ngoai. Foundation:
  `shared/clinic-workspace.css`. Da tim dung phien Firefox Admin va du lieu;
  Goi dich vu da an theo yeu cau user, con18 trang hien thi (gom Tu thuoc).
  Da kiem tiep desktop/mobile390, du lieu that, modal/huy, cuon/pager,
  ICD validation va URL Goi dich vu redirect. Ket qua tung man va gioi han
  CRUD/import/network QA: `reports/admin-ui-qa-2026-09-13.md`.

- Tu thuoc: user da duyet va da trien khai nen kem, khoi trang, nhan nau,
  anh noi that o tieu de. Da bo 4 the KPI lon, dua chi so gon vao ben phai
  hang nut toolbar, da tinh chinh nhan tren/so duoi va vach ngan manh.
  Chi tiet tai muc "Tủ thuốc: chỉ số gọn trong toolbar" trong
  `references/refactor-progress.md`. Cac muc "chua code" ben duoi la lich su.

## 5. Hard Rules

- Khong doc toan bo markdown mac dinh.
- Khong doan field/status/ID/owner tu display text.
- Khong tao UI/logic cu-moi song song neu da co owner.
- Khong chong CSS override de che sai owner/cascade.
- Khong de tai lieu thanh rac: thay doi kien thuc thi cap nhat dung owner.
