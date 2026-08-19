# QLPK AI Contract

Day la hop dong lam viec cua AI trong QLPK. Muc tieu: task nao cung co gate, co findings, co solution, co scope, co QA.

## 1. Task Gate

Moi task phai mo bang gate ngan:

- Loai task:
- Co sua file/code/runtime khong:
- Workflow/module:
- Tai lieu route:
- Code owner can trace:
- Scope du kien:
- QA expected:
- Can user chot gi:

Neu gate thieu thong tin quan trong, AI phai hoi ro hoac noi `chua xac dinh`, khong ket luan va khong code.

## 2. Task Types

- `answer`: tra loi/bao cao, khong sua file.
- `trace`: doc code/runtime tim nguyen nhan, chua code.
- `ui-design`: thiet ke/mockup, chua code.
- `ui-code`: sua HTML/CSS/JS/render UI.
- `data-api`: sua model/API/payload/save/load/database owner.
- `refactor`: tach module, doi owner, doi folder, xoa nhanh cu.
- `validation`: smoke/browser/contract QA.

## 3. Required Flow

1. `Receive` - doc dung yeu cau moi nhat va lenh `chua code`/`lam di`.
2. `Classify` - gan task type.
3. `Route` - doc 5 file harness dau tien, roi doc route task.
4. `Inspect` - doc code/runtime owner that.
5. `Findings` - neu van de/nguyen nhan dua tren evidence.
6. `Proposed Solution` - dua phuong an cu the de chot.
7. `Scope To Confirm` - phan se lam, phan khong dung toi, rui ro.
8. `Develop` - chi lam khi user da phe duyet ro.
9. `QA` - validate dung loai task.
10. `Report` - bao cao that.
11. `Update Knowledge` - cap nhat tai lieu owner neu co kien thuc moi.

## 4. Mandatory Output Blocks

Voi task co kha nang dan den code, response truoc khi code phai co:

- `Task Gate`
- `Findings`
- `Proposed Solution`
- `Scope To Confirm`
- `QA Plan`

Voi task user da noi `lam di` sau khi da chot scope, AI van phai tu kiem gate noi bo, roi dev trong dung scope.

## 5. Proposed Solution Contract

Phuong an de chot phai noi ro:

- Se sua owner/file nao.
- Khong sua owner/file nao.
- Cach lam cu the.
- Vi sao cach nay dung hon cach khac.
- Rui ro neu co.
- Ket qua nhin thay sau khi xong.
- Tieu chi QA/pass.

Khong duoc chi neu van de roi xin `ok`.

## 6. Approval Gate

- User noi `chua code`, `png truoc`, `bao cao truoc`, `dung`: khong sua file.
- Co sua file/code/runtime: phai chot scope truoc, tru khi user da noi `lam di`/`trien khai` sau mot scope ro.
- Neu scope chua ro: hoi lai, khong tu mo rong.

## 7. Source Of Truth

- Business: business map/workflow map.
- Data/API: `data-contracts.md` va backend source.
- UI: component owner, shared tokens/components, rendered browser.
- Safety: clear/reset owner, autosave guard, stale async token.

Display text khong phai source of truth.

## 8. One Owner Rule

- Mot UI/component co mot owner render.
- Mot field co mot canonical data owner.
- Mot lifecycle load/clear/save co mot duong chinh.
- Khong giu old/new song song neu ca hai cung render/save/mutate.
- Khong them fallback A/B lam mo source of truth.

## 9. UI Accountability Gate

Ap dung cho moi task `ui-design`, `ui-code`, hoac sua presentation cua mot
workflow dang song. Day la gate chan "lam cho chay" nhung khong dung giao dien.

Truoc khi develop, phai ghi bang chung cu the:

1. **Visual acceptance:** ket qua nhin thay, task nguoi dung hoan thanh, va
   state phai kiem (toi thieu empty, normal/co du lieu, dense/dai neu co
   list/table, va interaction moi them hay sua).
2. **Layout constraint chain:** owner cua shell/parent, section, grid/flex,
   child content, va scroll/pagination. Phai biet block nao quyet dinh
   height/width, block nao scroll, va overflow bi chan o dau truoc khi sua CSS.
3. **Interaction acceptance:** control phan trang, scroll, add/remove, input,
   modal, hoac action bi anh huong phai duoc danh gia theo so luong/du lieu
   thuc te. "Co nut" hoac "khong loi console" khong phai acceptance du.

Quy tac dung:

- Khong sua rieng child de chua loi height, blank space, clipping, scrollbar,
  overflow, hay alignment khi parent constraint chua duoc trace.
- Khong xep nhieu patch CSS, `!important`, hay fallback presentation de che ket
  qua sai. Dung lai, truy lai owner va de xuat mot sua doi theo dung chain.
- Trang thai hidden, empty, seed qua it, hoac fixture khong co interaction chi
  xac nhan asset/DOM; khong bao gio du de pass visual QA.
- Neu thieu du lieu/quyen/moi truong de test mot state bat buoc, report dung
  ten state chua test la `chua pass visual/interactive QA`; khong dung tu
  `xong`, `dat`, hay `production-ready`.

## 10. QA Contract

- UI-facing: static checks + browser/visual QA theo `UI Accountability Gate` neu moi truong cho phep.
- Data/API: trace writer/reader + smoke/http lien quan.
- Refactor: mapping cu -> moi + check URL/payload/behavior.
- Process QA: response phai co gate, findings, solution, scope, QA plan truoc khi code.
- Khong bao `xong` neu QA chua pass; noi ro `chua pass visual QA` neu khong test duoc UI.

## 11. Knowledge Update

Cap nhat dung tai lieu owner khi:

- Doi route/task flow: `CONTEXT.md`, `ai-contract.md`, `context-files.md`.
- Doi workflow/UI/data owner: business map, data inventory, data contracts.
- Doi module/refactor: module doc va `refactor-progress.md`.
- Loi lap lai: them rule/checklist chan loi tai nguon.
