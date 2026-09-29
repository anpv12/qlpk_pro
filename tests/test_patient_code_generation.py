"""Sinh mã hồ sơ HS: lấy số lớn nhất theo giá trị số, bỏ qua mã khác định dạng."""

from __future__ import annotations

from app.utils import patient_utils


class _Query:
    def __init__(self, db, entity):
        self.db, self.entity, self.code = db, entity, None

    def filter(self, criterion):
        right = getattr(criterion, 'right', None)
        self.code = getattr(right, 'value', None)
        return self

    def all(self):
        return [(code,) for code in self.db.codes]

    def first(self):
        return (1,) if self.code in self.db.codes else None


class _Db:
    def __init__(self, codes):
        self.codes = codes

    def query(self, entity):
        return _Query(self, entity)


def test_non_standard_code_does_not_break_sequence() -> None:
    db = _Db(['QA-CLS-20260905', 'HS00296', 'HS00295', 'BN00010', None])
    assert patient_utils.generate_patient_code(db) == 'HS00297'


def test_numeric_max_not_string_max() -> None:
    db = _Db(['HS99999', 'HS100000', 'HS00001'])
    assert patient_utils.generate_patient_code(db) == 'HS100001'


def test_empty_database_starts_at_one() -> None:
    assert patient_utils.generate_patient_code(_Db([])) == 'HS00001'
