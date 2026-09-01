"""Shared Vietnamese search normalization for API and local query owners.

PostgreSQL in the clinic runs with the ``C`` collation.  Its ``lower``/``ILIKE``
operations fold ASCII case but do not fold Vietnamese Unicode characters such
as ``Đ``/``đ``.  Keep the normalization contract in one place and translate
Vietnamese letters to their ASCII search key before applying a SQL predicate.
"""

from __future__ import annotations

import unicodedata

from sqlalchemy import func


# Include precomposed lowercase and uppercase Vietnamese characters.  The
# target string is deliberately ASCII so PostgreSQL's C-collation lower()
# remains deterministic after translation.
VIETNAMESE_SEARCH_FROM = (
    "àáảãạăắằẳẵặâấầẩẫậ"
    "èéẻẽẹêếềểễệ"
    "ìíỉĩị"
    "òóỏõọôốồổỗộơớờởỡợ"
    "ùúủũụưứừửữự"
    "ỳýỷỹỵđ"
)
VIETNAMESE_SEARCH_TO = (
    "aaaaaaaaaaaaaaaaa"
    "eeeeeeeeeee"
    "iiiii"
    "ooooooooooooooooo"
    "uuuuuuuuuuu"
    "yyyyyd"
)
VIETNAMESE_SEARCH_FROM += VIETNAMESE_SEARCH_FROM.upper()
VIETNAMESE_SEARCH_TO += VIETNAMESE_SEARCH_TO.upper()


def normalize_search_text(value) -> str:
    """Return the canonical case- and accent-insensitive search key."""

    if value is None:
        return ""

    text = unicodedata.normalize("NFKD", str(value)).casefold()
    text = "".join(char for char in text if not unicodedata.combining(char))
    return text.replace("đ", "d").strip()


def normalized_text_expression(column):
    """Build a SQL expression with the same key as ``normalize_search_text``."""

    return func.lower(func.translate(
        column,
        VIETNAMESE_SEARCH_FROM,
        VIETNAMESE_SEARCH_TO,
    ))


def normalized_contains(column, value):
    """Return a safe SQLAlchemy contains predicate for a user search value."""

    normalized = normalize_search_text(value)
    return normalized_text_expression(column).contains(normalized, autoescape=True)


__all__ = [
    "VIETNAMESE_SEARCH_FROM",
    "VIETNAMESE_SEARCH_TO",
    "normalize_search_text",
    "normalized_text_expression",
    "normalized_contains",
]
