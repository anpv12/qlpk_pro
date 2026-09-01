"""Regression tests for the shared case/accent-insensitive search contract."""

from sqlalchemy import column

from app.utils.search_normalization import (
    normalize_search_text,
    normalized_contains,
)


def test_normalize_search_text_handles_vietnamese_case_and_accents() -> None:
    assert normalize_search_text("Đạt") == "dat"
    assert normalize_search_text("đạt") == "dat"
    assert normalize_search_text("ĐẠT") == "dat"
    assert normalize_search_text("  đạt  ") == "dat"


def test_normalized_contains_uses_translated_sql_expression() -> None:
    expression = str(normalized_contains(column("full_name"), "đạt"))
    assert "translate" in expression.lower()
    assert "lower" in expression.lower()
