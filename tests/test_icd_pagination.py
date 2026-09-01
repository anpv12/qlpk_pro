"""Regression tests for the ICD API pagination boundary."""

import pytest
from flask import Flask

from app.api.icd import _parse_pagination_params


@pytest.fixture()
def request_app() -> Flask:
    return Flask(__name__)


def test_pagination_defaults_and_valid_values(request_app: Flask) -> None:
    with request_app.test_request_context('/api/icd/'):
        assert _parse_pagination_params() == (0, 100)

    with request_app.test_request_context('/api/icd/?skip=1000&limit=250'):
        assert _parse_pagination_params() == (1000, 250)


@pytest.mark.parametrize(
    'query_string',
    [
        'skip=-1',
        'limit=0',
        'limit=1001',
        'skip=abc',
        'limit=abc',
    ],
)
def test_pagination_rejects_invalid_values(request_app: Flask, query_string: str) -> None:
    with request_app.test_request_context(f'/api/icd/?{query_string}'):
        with pytest.raises(ValueError):
            _parse_pagination_params()
