# QLPK Operating Rules

Always answer the user in Vietnamese.

This file is the rule entry point. The project context entry point is `CONTEXT.md`.

Do not load every markdown file by default. Start from the context harness, then route to the minimal required references.

## Context Harness

Read these 5 files first, in order:

1. `CONTEXT.md` - compact project entrypoint.
2. `AGENTS.md` - agent load order and repo context.
3. `rule.md` - this rule entry point.
4. `references/ai-contract.md` - AI flow, roles, approval gate, source-of-truth rules, update policy.
5. `references/context-files.md` - task router for which references to read next.

After these five files, read only the route required by the current task.

Before any analysis or code action, state the Task Gate: task type, whether code changes are needed, workflow/module, route, code owner, scope, and QA expected.

Before asking the user to approve work, include Findings, Proposed Solution, Scope To Confirm, and QA Plan.

## Reference Sources

- `references/ui/button-system.md` — bắt buộc cho mọi thiết kế/sửa nút; dùng owner token/CSS chung, không tự phối màu hoặc viền riêng.

- `AGENTS.md` - agent entry point and load order.
- `references/refactor-progress.md` - compact handoff dashboard for ongoing refactor scope, current progress, next steps, and validation status.
- `so-do-to-chuc.md` - controlled organization roadmap, target structure, phased backlog, and double-check protocol.
- `references/qlpk-working-rules.md` - collaboration, edit, UI, and source-of-truth rules.
- `references/business-map.md` - system business workflow map; required before designing or changing workflow UI.
- `references/architecture-map.md` - repository map and module responsibilities.
- `references/data-contracts.md` - database/API/frontend ownership of fields.
- `references/ui/information-architecture.md` - rules for turning business/data maps into UI structure.
- `references/ui/design-from-data-checklist.md` - mandatory checklist before UI mockups or UI code.
- `references/doctor-examination-context.md` - mandatory rules for the doctor examination screen.
- `references/ops-and-validation.md` - local run, Docker, migration, and validation notes.
- `references/smoke-checks.md` - workflow-specific checklists for careful double-checks after changes.

## Core Rules

- Follow `references/context-files.md` to choose task-specific context. Do not read or cite unrelated references just to appear thorough.
- Do not skip the Task Gate. No gate means no code, no analysis conclusion, and no scope confirmation.
- Follow the AI flow in `references/ai-contract.md`: receive, classify, route, inspect, findings, proposed solution, confirm scope, develop, QA, report, update knowledge.
- UI work must also pass the `UI Accountability Gate` in `references/ai-contract.md`: trace parent-to-child layout constraints and visually verify the required populated/interacted states. Hidden or empty UI is never evidence that a layout is correct.
- Do not request approval with only a problem statement. A concrete Proposed Solution is mandatory before scope confirmation.
- Before changing code/files for any user request, first state a short, concrete understanding of the request and the intended scope, then wait for explicit approval such as `ok`, `làm đi`, `triển khai`, or equivalent. Do not code immediately from the first instruction unless the user has already approved after that understanding summary.
- Read the relevant reference before coding, reviewing, tracing, changing UI, changing backend, changing database logic, or interpreting a vague request.
- Before designing, mocking, or changing workflow UI, read `references/business-map.md`, `references/ui/information-architecture.md`, and `references/ui/design-from-data-checklist.md`. For screen-specific work, also read the workflow map under `references/workflows/` when one exists.
- Read `so-do-to-chuc.md` before restructuring folders, moving files, extracting services/view models, or changing a workflow contract.
- Read `references/refactor-progress.md` before continuing refactor from a new conversation so the current scope, done work, and next safe step are clear.
- Treat clinical workflow data as backend-owned. The frontend renders and submits explicit fields; it must not infer lifecycle or clinical state from display labels.
- UI design must start from actor/task, workflow step, data owner, source API/component, and clear/save ownership. Do not create UI from isolated database fields or guessed medical/admin labels.
- Refactor by vertical workflow slices. Do not move files broadly just to make the tree look cleaner.
- Use `references/smoke-checks.md` to validate the affected workflow before reporting done.
- UI QA is mandatory for every UI-facing change. After static/code checks pass, open browser verification yourself and inspect the affected screen before reporting completion; browser testing is agent-led by default and may use Chrome, the in-app browser, Playwright/headless browser tooling, or an equivalent local browser path. Act as an independent QA reviewer: verify console errors, actual rendered layout, visual alignment, font/spacing/color tokens, overflow/clipping, responsive behavior for relevant viewports, and the exact component touched. Do not report a UI task as done until both static validation and browser/visual QA pass. If the user explicitly asks to skip browser testing, or browser QA cannot be performed because the app/server/auth/environment is unavailable, clearly report `chưa pass visual QA` and do not claim the UI is complete. Do not leave browser validation sessions running unnecessarily.
- Shared UI primitives must stay DRY: header, sidebar/navigation, workspace shell, common controls, shared modals, tokens, and repeated layout patterns are implemented once in their shared owner, then reused/configured by pages. Do not copy shared HTML/CSS/JS into many templates.
- Do not solve frontend problems by blindly stacking overrides, heavier selectors, or `!important`. Inspect the actual owner, cascade, DOM contract, token source, and runtime state first; make a grounded judgment from code evidence before changing CSS/HTML/JS.
- UI/component logic must have one correct owner and one active lifecycle. Do not keep old/new branches or fallback paths running together when both can render, open, save, or mutate state; async responses must be invalidated before they can update stale UI.
- When a change reveals overlapping old/new branches, duplicated owners, or conflicting fallback paths, stop and collapse to one branch in the same safe slice. If removing a branch is risky or may change production behavior, report the exact risk and ask the user to decide; do not add another patch layer, runtime workaround, or competing branch on top of the conflict.
- Receptionist layout contract: on the Le tan screen, the receptionist workspace is a viewport-height panel. `Tiep nhan benh nhan` is 100% of that panel height by default, and `Danh sach cho chuyen kham` matches it. Long content must scroll inside its own column/body, not by stretching the whole page row. Do not implement this with JS-measured pixel heights or let the left queue pull the right intake into a long blank panel.
- Tuyet doi khong boc khung lung tung: do not create nested visual frames by stacking border/card/wrapper layers around each other. Each visual region must have one clear frame owner only; if an inner component is already a block/card/table container, do not wrap it in another bordered card just for styling. Use spacing, headings, dividers, background contrast, or semantic controls inside the existing owner instead.
- UI text must use readable contrast. Do not use pale/low-contrast colors for labels, empty states, buttons, dropdown actions, badges, or metadata; muted text still has to be clearly legible on the actual background.
- Workspace shell must keep the active workspace tab aligned with the top-level URL on direct load/reload; do not let stale `qlpk_workspace_active_tab` hide the native page pane.
- Keep patient-level, appointment-level, examination-level, and `examination_details` data separate.
- Do not use one field as a shortcut for another. In particular, keep `appointment.notes` separate from `examinations.loi_dan`.
- Before touching `doctor-examination.html`, `doctor-examination.js`, or `app/static/js/components/medical-history-core.js`, read `references/doctor-examination-context.md`.
- Before designing or changing the doctor examination UI, read `references/workflows/doctor-examination-business-map.md` and `references/workflows/doctor-examination-data-inventory.md` in addition to the doctor context file.

## Doctor Examination Critical Rule

When adding or changing any patient-specific UI block, field, table, chip list, counter, cache, or auto-save trigger on the doctor examination screen:

1. Clear it when switching patients in `selectPatientCard`.
2. Put the clear logic in the correct owner function or create a dedicated clear function.
3. Reset JavaScript state, not only DOM values.
4. Skip all auto-save while `isLoadingExaminationData === true`.

Failure here can leak patient A data into patient B's chart.
