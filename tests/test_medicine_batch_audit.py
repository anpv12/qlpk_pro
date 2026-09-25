from datetime import date
from decimal import Decimal

from scripts.audit_medicine_batches import classify_stock


def batch(quantity, expiry=date(2028, 1, 1)):
    return {'remaining_quantity': quantity, 'expiry_date': expiry, 'batch_number': 'KNOWN-LOT'}


def test_positive_catalog_stock_without_lots_is_not_dispensable():
    result = classify_stock('1460', [], date(2026, 9, 6))
    assert result['cases'] == ['missing_batches']
    assert result['available_to_dispense'] == 0
    assert result['aggregate_stock'] == 1460


def test_expired_stock_and_legacy_difference_are_separate_cases():
    result = classify_stock('717', [batch('1000', date(2026, 7, 31))], date(2026, 9, 6))
    assert set(result['cases']) == {'aggregate_batch_mismatch', 'no_valid_batch_stock'}
    assert result['available_to_dispense'] == 0


def test_available_stock_uses_smaller_balance_without_reconciling():
    assert classify_stock('836', [batch('2492')], date(2026, 9, 6))['available_to_dispense'] == 836
    result = classify_stock('1153', [batch('1000')], date(2026, 9, 6))
    assert result['aggregate_minus_batches'] == 153
    assert result['available_to_dispense'] == 1000


def test_empty_catalog_is_valid_and_negative_stock_is_flagged():
    assert classify_stock(0, [], date(2026, 9, 6))['cases'] == []
    assert 'negative_balance' in classify_stock(-1, [batch(-1)], date(2026, 9, 6))['cases']


def test_expiry_day_and_fractional_legacy_balance_are_preserved():
    result = classify_stock('719.50', [batch('719.50', date(2026, 9, 6))], date(2026, 9, 6))
    assert result['available_to_dispense'] == Decimal('719.50')
    assert result['cases'] == []


def test_missing_cost_zero_cost_and_synthetic_lots_are_separate_review_cases():
    lots = [{**batch(5), 'import_price': None}, {**batch(3), 'import_price': 0},
            {**batch(2), 'import_price': 1200, 'batch_number': 'SEED-LOCAL-TEST'}]
    result = classify_stock(10, lots, date(2026, 9, 10))
    assert set(result['cases']) == {'missing_import_cost', 'zero_import_cost_review', 'synthetic_batch'}
