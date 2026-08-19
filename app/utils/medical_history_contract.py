"""Canonical patient medical-history boundaries."""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from app.models.icd import ICD


_SUBSTANCE_ICD_PATTERN = re.compile(r"^F1[0-9](?:\.|$)", re.IGNORECASE)

SUBSTANCE_IDS = (
    "tobacco", "alcohol", "cannabis", "cocaine", "stimulants",
    "inhalants", "sedatives", "hallucinogens", "opioids", "other_substance",
)
SUBSTANCE_KEYS = frozenset(
    key
    for substance in SUBSTANCE_IDS
    for key in (f"{substance}_used", f"{substance}_duration")
)


class MedicalHistoryContractError(ValueError):
    """Raised when a patient/examination history payload has a wrong shape."""


def is_substance_icd_code(value: object) -> bool:
    """Return whether an ICD code belongs to the F10-F19 substance category."""
    return bool(_SUBSTANCE_ICD_PATTERN.match(str(value or "").strip()))


def normalize_physical_history(db, value: object) -> list:
    """Keep substance-use ICDs out of the patient physical-history field.

    Substance-use history is stored separately in ``patients.substance_use_history``.
    Unknown/non-ICD entries are preserved so this boundary cleanup does not erase
    older text or future history entry shapes.
    """
    if value is None or value == "":
        return []
    if not isinstance(value, list):
        raise MedicalHistoryContractError("physical_history must be an array")

    icd_ids = {
        int(item["id"])
        for item in value
        if isinstance(item, dict)
        and item.get("type") == "icd"
        and str(item.get("id", "")).isdigit()
    }
    icd_codes: dict[int, str] = {}
    if icd_ids:
        icd_codes = {
            int(icd.id): str(icd.icd_code or "")
            for icd in db.query(ICD).filter(ICD.id.in_(icd_ids), ICD.is_deleted == False).all()
        }

    normalized = normalize_history_entries(value, "physical_history")
    filtered = []
    for item in normalized:
        if item.get("type") != "icd":
            filtered.append(item)
            continue

        code = item.get("icd_code")
        item_id = item.get("id")
        if not code and str(item_id).isdigit():
            code = icd_codes.get(int(item_id))
        if is_substance_icd_code(code):
            continue
        filtered.append(item)
    return filtered


def normalize_history_entries(value: Any, field_name: str) -> list[dict[str, Any]]:
    """Validate the shared ICD/text array used by physical and family history."""
    if value is None or value == "":
        return []
    if not isinstance(value, list):
        raise MedicalHistoryContractError(f"{field_name} must be an array")

    normalized: list[dict[str, Any]] = []
    for index, entry in enumerate(value):
        if not isinstance(entry, Mapping):
            raise MedicalHistoryContractError(f"{field_name}[{index}] must be an object")

        entry_type = str(entry.get("type") or "").strip().lower()
        if entry_type == "icd":
            raw_id = entry.get("id")
            try:
                item_id = int(raw_id)
            except (TypeError, ValueError):
                item_id = 0
            if item_id <= 0:
                raise MedicalHistoryContractError(f"{field_name}[{index}].id must be a positive integer")
            normalized.append({"type": "icd", "id": item_id})
        elif entry_type == "text":
            text_value = str(entry.get("value") or "").strip()
            if text_value:
                normalized.append({"type": "text", "value": text_value})
        else:
            raise MedicalHistoryContractError(
                f"{field_name}[{index}].type must be icd or text"
            )
    return normalized


def normalize_family_history(value: Any) -> list[dict[str, Any]]:
    return normalize_history_entries(value, "family_history")


def normalize_substance_use_history(value: Any) -> dict[str, Any]:
    """Validate the canonical 10-substance object without dropping user data."""
    if value is None or value == "":
        return {}
    if not isinstance(value, Mapping):
        raise MedicalHistoryContractError("substance_use_history must be an object")

    normalized: dict[str, Any] = {}
    for key, raw_value in value.items():
        key = str(key)
        if key not in SUBSTANCE_KEYS:
            raise MedicalHistoryContractError(
                f"substance_use_history.{key} is not a supported field"
            )
        if key.endswith("_used"):
            if not isinstance(raw_value, bool):
                raise MedicalHistoryContractError(
                    f"substance_use_history.{key} must be boolean"
                )
            normalized[key] = raw_value
        else:
            if raw_value is None:
                normalized[key] = ""
            elif not isinstance(raw_value, str):
                raise MedicalHistoryContractError(
                    f"substance_use_history.{key} must be text"
                )
            else:
                normalized[key] = raw_value.strip()
    return normalized


def normalize_safety_plan(value: Any) -> dict[str, Any]:
    """Validate the patient safety-plan object while preserving its raw fields."""
    if value is None or value == "":
        return {}
    if not isinstance(value, Mapping):
        raise MedicalHistoryContractError("safety_plan must be an object")

    normalized = dict(value)
    for key in ("nhan_dien", "cach_ung_pho", "dong_luc_song"):
        if key in normalized and normalized[key] is not None and not isinstance(normalized[key], str):
            raise MedicalHistoryContractError(f"safety_plan.{key} must be text")
        if key in normalized and isinstance(normalized[key], str):
            normalized[key] = normalized[key].strip()

    if "uploaded_file" in normalized:
        uploaded_file = normalized["uploaded_file"]
        if uploaded_file is not None and (
            not isinstance(uploaded_file, str)
            or not uploaded_file.startswith("/uploads/safety_plans/")
        ):
            raise MedicalHistoryContractError(
                "safety_plan.uploaded_file must be a safety-plan upload path or null"
            )

    supporters = normalized.get("nguoi_ho_tro")
    if supporters is not None:
        if not isinstance(supporters, list) or len(supporters) > 3:
            raise MedicalHistoryContractError("safety_plan.nguoi_ho_tro must contain at most 3 items")
        seen_orders = set()
        for index, supporter in enumerate(supporters):
            if not isinstance(supporter, Mapping):
                raise MedicalHistoryContractError(f"safety_plan.nguoi_ho_tro[{index}] must be an object")
            try:
                order = int(supporter.get("order"))
                member_id = int(supporter.get("member_id"))
            except (TypeError, ValueError):
                raise MedicalHistoryContractError(
                    f"safety_plan.nguoi_ho_tro[{index}] has invalid order/member_id"
                ) from None
            if order not in {1, 2, 3} or order in seen_orders or member_id <= 0:
                raise MedicalHistoryContractError(
                    f"safety_plan.nguoi_ho_tro[{index}] has invalid order/member_id"
                )
            seen_orders.add(order)
            for text_key in ("name", "phone"):
                if text_key in supporter and supporter[text_key] is not None and not isinstance(supporter[text_key], str):
                    raise MedicalHistoryContractError(
                        f"safety_plan.nguoi_ho_tro[{index}].{text_key} must be text"
                    )
    return normalized
