# QLPK Agent Context

This repository is the QLPK clinic-management application. Agents working here must treat the codebase as a production medical workflow system, not a generic demo app.

## Load Order

1. Read `CONTEXT.md` first. It is the compact project context harness.
2. This file (`AGENTS.md`) defines the agent-facing load order and non-negotiables.
3. Read `rule.md`.
4. Read `references/ai-contract.md`.
5. Read `references/context-files.md`.
6. Use `references/context-files.md` to choose the minimum task-specific references. Do not read the entire `references/` tree by default.
7. Read `references/refactor-progress.md` when continuing ongoing refactor work or starting from a handoff-heavy conversation.
8. Read `so-do-to-chuc.md` before restructuring folders, extracting modules/services/view models, or changing workflow contracts.
9. Read `references/qlpk-working-rules.md` before coding, reviewing, or changing behavior.
10. Read `references/business-map.md`, `references/ui/information-architecture.md`, and `references/ui/design-from-data-checklist.md` before designing, mocking, or changing workflow UI.
11. Read `references/architecture-map.md` when locating modules or tracing flows.
12. Read `references/data-contracts.md` before changing models, APIs, database fields, payloads, or save/load logic.
13. Read the screen workflow map under `references/workflows/` when one exists.
14. Read `references/doctor-examination-context.md`, `references/workflows/doctor-examination-business-map.md`, and `references/workflows/doctor-examination-data-inventory.md` before touching or designing `doctor-examination.html`, `doctor-examination.js`, or medical-history/clinical workspace components.
15. Read `references/ops-and-validation.md` before running the app, changing Docker/migrations, or deciding validation steps.
16. Read `references/smoke-checks.md` before final validation of a touched workflow.

## Non-Negotiables

- Always answer the user in Vietnamese.
- Inspect existing code before editing. Prefer `rg` / `rg --files` for discovery.
- Classify the task first, then read the route from `references/context-files.md`. Do not load unrelated docs.
- Before any analysis or code, emit the Task Gate from `references/ai-contract.md`.
- Follow the flow in `references/ai-contract.md`: receive, classify, route, inspect, findings, proposed solution, confirm scope, develop, QA, report, update knowledge.
- Before changing a UI layout, trace the rendered constraint chain from parent shell through section/grid/flex to the scrolling or paginated child. A child-only CSS patch is prohibited when its parent sizing/overflow contract is not known.
- A hidden, empty, or fixture-only UI state can verify asset loading but can never pass visual QA. Completion requires the real affected states, including dense/sparse data and the requested interaction; otherwise report `chưa pass visual/interactive QA`.
- Before asking the user to approve work, provide a concrete `Proposed Solution`, `Scope To Confirm`, and `QA Plan`.
- Do not revert or delete changes you did not make.
- Keep edits scoped to the requested behavior and the local patterns already in use.
- Evolve structure by vertical workflow slices; do not perform broad folder moves without a contract and validation checklist.
- Preserve backend-owned data contracts. Do not make the frontend infer clinical state from display text.
- Design workflow UI from business/data maps first: actor, task, source data, owner table/API, component owner, and clear/save lifecycle must be known before mockup or code.
- For patient-specific UI, clear stale data before loading a new patient.
- For auto-save, never write while patient/examination data is still loading.

## Project Shape

- Backend: Flask, SQLAlchemy, PostgreSQL, Alembic.
- Frontend: Jinja templates (shared page macros in `app/templates/partials/`), Bootstrap, plain JavaScript ES modules (no jQuery).
- Entry point: `main.py` initializes the app, creates DB tables, and registers blueprints.
- Main workflow files: `app/api/appointment.py`, `app/api/examination*.py`, `app/static/js/doctor-examination.js`, `app/static/js/receptionist-new.js`, `app/static/js/psychologist-examination.js`.
- Target organization and phased backlog live in `so-do-to-chuc.md`; treat it as the roadmap for gradual domain/workflow-first structure.

## Validation Baseline

- There is no discovered automated test suite in this snapshot.
- Use syntax checks, targeted imports where safe, local endpoint tracing, static reference checks, smoke scripts, and targeted HTTP checks.
- UI/browser verification is agent-led by default for UI-facing changes. After static checks, agents may open Chrome, the in-app browser, Playwright/headless browser sessions, or equivalent browser tooling to inspect the affected screen, console, network/static assets, layout, overflow, responsive behavior, and the exact component touched. Do not leave browser validation sessions or dev servers running unnecessarily after the check. If the user explicitly asks to skip browser testing, report `chưa pass visual QA` instead of claiming the UI is complete.
- Use `references/smoke-checks.md` as the workflow-specific validation checklist.
- Be careful importing `main.py`: it attempts database initialization at import time.
