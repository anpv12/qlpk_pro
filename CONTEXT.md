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

- Nghiep vu: `references/business-map.md` va workflow map.
- Du lieu/API: `references/data-contracts.md` va backend source.
- UI/UX: UI references, component owner, rendered browser.
- Man bac si: doctor context + doctor workflow map + doctor data inventory.
- Tien do/handoff: `references/refactor-progress.md`.

## 5. Hard Rules

- Khong doc toan bo markdown mac dinh.
- Khong doan field/status/ID/owner tu display text.
- Khong tao UI/logic cu-moi song song neu da co owner.
- Khong chong CSS override de che sai owner/cascade.
- Khong de tai lieu thanh rac: thay doi kien thuc thi cap nhat dung owner.
