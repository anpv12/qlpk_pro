from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.modules.prescriptions.services import stock_service


@pytest.mark.parametrize('previous,stock,available', [
    ('0', '140.5', '140.5'), ('50', '140.5', '60'),
])
def test_shortage_reports_order_stock_and_additional_quantity(monkeypatch, previous, stock, available):
    medicine = SimpleNamespace(stock_quantity=Decimal(stock))
    batch = SimpleNamespace(id=1, batch_number='LOT', remaining_quantity=Decimal(available),
                            expiry_date=date.today() + timedelta(days=10))
    monkeypatch.setattr(stock_service, '_lock_inventory', lambda *args: (medicine, [batch]))
    monkeypatch.setattr(stock_service, '_load_net_batch_allocations', lambda *args: ({}, {}))
    with pytest.raises(stock_service.PrescriptionStockValidationError) as caught:
        stock_service.apply_prescription_batch_stock_deltas(
            None, user_id=1, appointment_id=1,
            new_totals_by_medicine={1: {'medicine_name': 'Diazepam 5mg', 'total_in_clinic_qty': '150'}},
            old_totals_by_medicine={1: previous}, medicine_catalog={1: {'unit': 'viên'}})
    payload = caught.value.shortage
    assert payload['medicine_name'] == 'Diazepam 5mg'
    assert Decimal(payload['requested_quantity']) == 150
    assert Decimal(payload['stock_quantity']) == Decimal(stock)
    assert Decimal(payload['available_quantity']) == Decimal(available)
    assert Decimal(payload['additional_quantity']) == 150 - Decimal(previous)
    assert Decimal(payload['previous_quantity']) == Decimal(previous)
    assert medicine.stock_quantity == Decimal(stock)
    assert batch.remaining_quantity == Decimal(available)


def test_other_inventory_errors_do_not_pretend_to_be_quantity_shortages():
    error = stock_service.PrescriptionStockValidationError(['Cần đối soát kho'])
    assert error.shortage is None
    assert error.errors == ['Cần đối soát kho']
