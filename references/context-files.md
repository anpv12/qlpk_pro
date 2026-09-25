# QLPK Context File Map

Router tai lieu theo task. Doc dung route, khong doc ca `references/` theo mac dinh.

## Always Start

Moi task doc 5 file dau tien:

1. `CONTEXT.md`
2. `AGENTS.md`
3. `rule.md`
4. `references/ai-contract.md`
5. `references/context-files.md`

Sau do chon route duoi day.

Tiep tuc chuoi Hanh chinh/Le tan/Tu thuoc/Nhap kho/DAV: doc muc
"Context chung đang tiếp tục — 22/09/2026" trong `references/refactor-progress.md`
de nam quyet dinh hien hanh, owner va QA. Khong ghi nhat ky trung o module.

## Route Theo Task

Mọi task thiết kế, mockup hoặc sửa nút phải đọc `references/ui/button-system.md`.
Quy chuẩn này ưu tiên hơn các ghi chú lịch sử về màu nút trong brand-theme.

| Task | Doc bat buoc | Khi nao doc them |
| --- | --- | --- |
| Hoi/bao cao nhanh, khong sua file | Code/tai lieu lien quan truc tiep | `references/refactor-progress.md` neu hoi tinh hinh/handoff |
| Trace loi UI/logic, chua code | `references/qlpk-working-rules.md`, code owner lien quan | UI workflow thi doc them UI route; data/save thi doc data route |
| UI mockup/thiet ke workflow | `references/business-map.md`, `references/ui/information-architecture.md`, `references/ui/design-from-data-checklist.md` | Workflow co file rieng thi doc workflow map/inventory |
| Sua UI code | UI mockup route + `references/qlpk-working-rules.md`, `references/ui/brand-theme.md`, code owner, CSS/token/component owner | `references/smoke-checks.md` truoc final validation |
| Data/API/save/load/database | `references/data-contracts.md`, `references/architecture-map.md`, code backend writer/reader | Module doc neu workflow thuoc module da tach |
| Refactor/folder/module owner | `so-do-to-chuc.md`, `references/architecture-map.md`, `references/refactor-progress.md` | Module doc lien quan |
| Chay app/smoke/browser QA | `references/ops-and-validation.md`, `references/smoke-checks.md` | Workflow-specific checklist neu co |
| Tiep tuc viec dang lam tu hoi thoai truoc | `references/refactor-progress.md` | Route cua workflow dang lam |

## Route Theo Workflow/Module

| Vung | Doc bat buoc |
| --- | --- |
| Autocomplete field / search-select / chips | `references/ui/autocomplete-field.md`, workflow doc của màn hình đang tích hợp |
| Man bac si / `doctor-examination` | `references/doctor-examination-context.md`, `references/workflows/doctor-examination-business-map.md`, `references/workflows/doctor-examination-data-inventory.md`, `references/workflows/doctor-examination-navigation.md` |
| Modal tìm kiếm/lịch sử bệnh nhân dùng chung | `references/ui/patient-history-modal.md`, workflow doc của màn hình đang tích hợp |
| Le tan / tiep nhan | `references/modules/receptionist.md`, `references/business-map.md`; neu doi save/load thi them `references/data-contracts.md` |
| Don thuoc | `references/modules/prescriptions.md`, `references/data-contracts.md` neu doi payload/save |
| Chi dinh/orders | `references/modules/orders.md`, `references/data-contracts.md` neu doi payload/save |
| Mẫu khảo sát/editor/chấm điểm | `references/modules/surveys.md`, `references/data-contracts.md`; thêm orders nếu đổi phiên/chỉ định |
| Lich hen/appointments | `references/modules/appointments.md`, `references/data-contracts.md` neu doi payload/save |
| Examinations/details/history/status | `references/modules/examinations.md`, `references/data-contracts.md` |

## Task A Protocol

Khi user bao mot task cu the, AI phai co output theo thu tu:

1. `Task Gate`
2. `Findings`
3. `Proposed Solution`
4. `Scope To Confirm`
5. `QA Plan`
6. `Develop` neu duoc phe duyet
7. `QA Result`
8. `Knowledge Update` neu can

Vi du: user noi "dropdown tinh/phuong bi loi o le tan va bac si".

- Workflow: shared patient admin/address controls.
- Doc: UI route + receptionist/doctor route neu ca hai man dung chung + data route neu save/load bi anh huong.
- Code: shared patient-info component/address bridge, khong sua rieng tung man bang override.
- Proposed Solution: sua owner chung hoac config chung; khong patch rieng le tan/bac si bang override.

## Update Policy

- Tai lieu harness (`CONTEXT.md`, file nay, `ai-contract.md`) chi ghi rule/doc routing, khong ghi chi tiet UI dai.
- Tai lieu workflow/module ghi nghiep vu, field, endpoint, owner, lifecycle.
- `references/refactor-progress.md` ghi tien do, handoff, viec da lam/chua lam.
- Khi phat hien loi lap lai, cap nhat rule/checklist de AI sau khong lap lai.
- Neu mot tai lieu moi tro thanh bat buoc, phai link tu file nay va tu `rule.md`/`AGENTS.md` neu can.
