from types import SimpleNamespace
from unittest.mock import patch

from app.modules.orders.view_models import clinical_order


def test_resolve_diagnosis_reads_the_current_examination_owner():
    appointment = SimpleNamespace(
        examinations=[
            SimpleNamespace(id=4, is_active=True, diagnosis=[101, 102]),
        ]
    )

    with patch.object(
        clinical_order,
        "build_icd_display_contract",
        return_value={"text": "A - Test", "ids": [101, 102]},
    ) as resolve:
        result = clinical_order._resolve_diagnosis(object(), appointment)

    assert result == ("A - Test", [101, 102])
    resolve.assert_called_once_with(resolve.call_args.args[0], [101, 102])


def test_resolve_diagnosis_without_an_examination_returns_empty_contract():
    assert clinical_order._resolve_diagnosis(object(), SimpleNamespace(examinations=[])) == (
        None,
        [],
    )
