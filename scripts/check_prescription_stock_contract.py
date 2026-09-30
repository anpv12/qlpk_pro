#!/usr/bin/env python3
"""Static guardrail for the single-owner prescription inventory contract."""

from pathlib import Path
import sys

import sys as _sys
_sys.path.insert(0, str(__import__("pathlib").Path(__file__).resolve().parent))
from module_source import read_source  # noqa: E402


ROOT = Path(__file__).resolve().parents[1]
SAVE_SERVICE = ROOT / "app/modules/prescriptions/services/save_service.py"
STOCK_SERVICE = ROOT / "app/modules/prescriptions/services/stock_service.py"
READ_SERVICE = ROOT / "app/modules/prescriptions/services/read_service.py"
INTERNAL_API = ROOT / "app/modules/prescriptions/api/internal.py"
TRANSACTION_MODEL = ROOT / "app/models/medicine_transaction.py"
FORBIDDEN_SCHEMA_MIGRATION = ROOT / "alembic/versions/20260814_link_prescription_stock_transactions.py"
PRESCRIPTION_UI = ROOT / "app/static/js/doctor-examination/prescription-ui.js"
ROW_RENDERER = ROOT / "app/static/js/doctor-examination/prescription-row-renderer.js"
SUPPORT_MODULES = ROOT / "app/static/js/doctor-examination/support-modules-ui.js"
SAVE_CONTROLLER = ROOT / "app/static/js/doctor-examination/workspace-save-controller.js"
PRESCRIPTION_CSS = ROOT / "app/static/css/pages/doctor-prescription.css"
SMOKE_CHECKS = ROOT / "references/smoke-checks.md"


def _require(source, needle, label, errors):
    if needle not in source:
        errors.append(f"missing {label}: {needle}")


def main():
    service = read_source(SAVE_SERVICE)
    stock = read_source(STOCK_SERVICE)
    read_service = read_source(READ_SERVICE)
    api = read_source(INTERNAL_API)
    model = read_source(TRANSACTION_MODEL)
    prescription_ui = read_source(PRESCRIPTION_UI)
    row_renderer = read_source(ROW_RENDERER)
    support_modules = read_source(SUPPORT_MODULES)
    save_controller = read_source(SAVE_CONTROLLER)
    prescription_css = read_source(PRESCRIPTION_CSS)
    smoke_checks = read_source(SMOKE_CHECKS)
    errors = []

    forbidden = (
        "collect_stock_totals_from_transactions",
        "has_prescription_stock_transactions",
        "apply_stock_transactions",
        "validate_prescription_stock",
        "update(Medicine)",
        ".returning(Medicine.stock_quantity)",
    )
    for needle in forbidden:
        if needle in service or needle in stock or needle in api:
            errors.append(f"retired ledger/state branch returned: {needle}")
    if FORBIDDEN_SCHEMA_MIGRATION.exists():
        errors.append("prescription stock must not add a schema migration")
    for column in ('appointment_id', 'operation_id', 'sale_unit_price', 'original_transaction_id', 'sale_amount_delta'):
        _require(model, column + ' = Column(', 'approved visit ledger field', errors)
    if "Audit mới có `appointment_id`" in smoke_checks:
        errors.append("stock smoke checklist still requires the rejected appointment_id column")

    required_service = (
        ("PrescriptionItem.quantity", "prescription_items quantity owner"),
        (".with_for_update()", "appointment aggregate lock"),
        ("apply_prescription_batch_stock_deltas(", "batch stock owner delegation"),
        ("build_prescription_batch_allocation_states(", "saved allocation response"),
        ("def save_prescription_transaction(", "transaction owner"),
        ("db.commit()", "service commit"),
        ("db.rollback()", "service rollback"),
    )
    for needle, label in required_service:
        _require(service, needle, label, errors)

    required_stock = (
        ("batch.remaining_quantity", "batch balance owner"),
        ("MedicineBatch.expiry_date.asc()", "FEFO expiry ordering"),
        ("MedicineBatch.import_date.asc()", "FEFO import-date tie break"),
        (".with_for_update()", "medicine and batch row locks"),
        ("batch_id=batch.id", "movement batch linkage"),
        ("prescription_stock_movement_notes(appointment_id)", "existing appointment note linkage"),
        ("visit_ledger_filter(appointment_id)", "explicit visit linkage with legacy fallback"),
        ("available_to_dispense = min(aggregate_stock, available_batch_stock)", "aggregate and valid-batch shortage guard"),
        ("tồn khả dụng {format_quantity(available_to_dispense)}", "single effective availability shortage message"),
        ("tracked_refund_quantity = min(refund_quantity, allocated_total)", "tracked refund split"),
        ("legacy_refund_quantity = refund_quantity - tracked_refund_quantity", "legacy refund split"),
        ("batch_id=None", "aggregate-only legacy refund movement"),
        ("aggregate_stock < ZERO_QUANTITY", "negative aggregate guard"),
        ("batch_allocation_status", "allocation read status"),
    )
    for needle, label in required_stock:
        _require(stock, needle, label, errors)

    forbidden_stock = (
        ("_inventory_quantity(aggregate_stock) != _inventory_quantity(batch_total)", "blanket aggregate/batch equality guard"),
        ("allocated_total < refund_quantity", "legacy refund blocker"),
        ("không tự đoán lô để hoàn", "legacy refund blocker message"),
    )
    for needle, label in forbidden_stock:
        if needle in stock:
            errors.append(f"retired {label} returned: {needle}")

    _require(api, "save_prescription_transaction(", "thin API orchestration", errors)
    _require(api, "'stock_allocation_states': stock_allocation_states", "allocation API response", errors)
    _require(read_service, "'batch_allocation': batch_allocation_states.get", "allocation reload response", errors)
    _require(model, "batch_id = Column(", "transaction batch model field", errors)
    _require(model, "'batch_id': self.batch_id", "transaction batch serializer field", errors)
    _require(prescription_ui, "applyStockAllocationStates", "Doctor allocation state sync", errors)
    _require(prescription_ui, "updateBatchAllocationDisplays", "Doctor pending allocation refresh", errors)
    _require(prescription_ui, "Đã lưu đơn và cấp đủ", "Doctor dispensing success feedback", errors)
    _require(prescription_ui, "inventoryMessage: buildInventorySaveMessage(data)", "prescription success message result", errors)
    _require(support_modules, "successMessages", "support save feedback propagation", errors)
    _require(save_controller, "supportResult.successMessages[0]", "workspace save feedback display", errors)
    _require(row_renderer, 'class="doctor-prescription-batch"', "always-visible Doctor batch block", errors)
    _require(row_renderer, "function updateBatchAllocation", "targeted batch status renderer", errors)
    _require(row_renderer, "if (!state) return '';", "no allocation state renders no batch block", errors)
    _require(
        row_renderer,
        "if (status !== 'allocated' || !allocations.length) return '';",
        "allocated-only batch detail guard hides passive states",
        errors,
    )
    _require(row_renderer, "Cần lưu để cập nhật lô", "pending allocation feedback", errors)
    _require(row_renderer, "Đã cấp ${escapeHtml(formatAllocationQuantity(allocation.quantity))}", "allocated quantity per lot", errors)
    _require(row_renderer, "Tồn tổng hiện tại: <strong>", "single current stock display label", errors)
    _require(row_renderer, 'class="doctor-prescription-table__quantity-unit-input"', "external unit editor beside quantity", errors)
    _require(row_renderer, "row.isExternal", "unit editor source guard", errors)
    for retired_stock_ui in (
        "getEffectiveAvailableStock",
        "inventoryConsistent",
        "Tồn khả dụng:",
        "doctor-prescription-batches__available",
        " · còn ",
    ):
        if retired_stock_ui in row_renderer or retired_stock_ui in prescription_css:
            errors.append(f"retired stock presentation returned: {retired_stock_ui}")
    for forbidden_ui in (
        'data-prescription-row-action="toggle-batches"',
        "Đã cấp đủ •",
        "Dạng thuốc:",
        ">Trong kho<",
    ):
        if forbidden_ui in row_renderer:
            errors.append(f"retired Doctor prescription UI returned: {forbidden_ui}")
    for forbidden_label in (
        "Đơn cũ chưa truy vết lô",
        "Đã truy vết ",
        "Dấu vết lô cần đối soát",
    ):
        if forbidden_label in row_renderer:
            errors.append(f"passive legacy batch label returned: {forbidden_label}")
    _require(prescription_css, "color: var(--qlpk-feedback-warning);", "pending allocation warning color", errors)
    _require(prescription_css, "color: var(--qlpk-feedback-success);", "allocated success color", errors)
    _require(prescription_css, "border-inline-start: 0.18rem solid var(--qlpk-feedback-success);", "per-lot success marker", errors)
    _require(
        save_controller,
        "Không đủ thuốc trong kho. Vui lòng kiểm tra số lượng đã kê và tồn kho.",
        "concise Doctor shortage feedback",
        errors,
    )
    if "Giảm số lượng thuốc hoặc bổ sung tồn kho, rồi bấm Lưu lại." in save_controller:
        errors.append("retired verbose Doctor shortage guidance returned")
    for verbose_feedback in ("Hướng dẫn:", "Lưu thất bại ở"):
        if verbose_feedback in save_controller:
            errors.append(f"verbose Doctor feedback formatter returned: {verbose_feedback}")

    if errors:
        print("[FAIL] prescription_stock_contract")
        for error in errors:
            print(f"  - {error}")
        return 1

    print("[OK] prescription_stock_contract")
    return 0


if __name__ == "__main__":
    sys.exit(main())
