"""Canonical serialization for per-examination risk assessment data."""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any


RISK_SCHEMA_VERSION = 1


class RiskAssessmentContractError(ValueError):
    """Raised when a runtime risk payload is not the canonical object shape."""

_ASSESSMENT_FIELDS = (
    ("ideation", "Ý tưởng tự sát"),
    ("plan", "Kế hoạch tự sát"),
    ("intent", "Toàn tính tự sát"),
    ("self_harm", "Hành vi tự hại"),
)
_LEVEL_LABELS = {
    "thap": "Thấp",
    "trung_binh": "Trung bình",
    "cao": "Cao",
}
_LEVEL_VALUES = {label.lower(): value for value, label in _LEVEL_LABELS.items()}


def empty_risk_assessment() -> dict[str, Any]:
    return {
        "schema_version": RISK_SCHEMA_VERSION,
        "suicide_history": [],
        "assessment": {},
    }


def validate_risk_assessment(raw: Any) -> dict[str, Any]:
    """Validate runtime input without applying the forgiving legacy parser."""
    if raw is None or raw == "":
        return empty_risk_assessment()
    if not isinstance(raw, Mapping):
        raise RiskAssessmentContractError("risk_assessment must be an object")

    version = raw.get("schema_version", RISK_SCHEMA_VERSION)
    if version != RISK_SCHEMA_VERSION:
        raise RiskAssessmentContractError("risk_assessment.schema_version is invalid")

    suicide_history = raw.get("suicide_history", [])
    if not isinstance(suicide_history, list):
        raise RiskAssessmentContractError("risk_assessment.suicide_history must be an array")
    for index, item in enumerate(suicide_history):
        if not isinstance(item, Mapping) or not str(item.get("code") or "").strip():
            raise RiskAssessmentContractError(
                f"risk_assessment.suicide_history[{index}] must contain code"
            )
        if item.get("note") is not None and not isinstance(item.get("note"), str):
            raise RiskAssessmentContractError(
                f"risk_assessment.suicide_history[{index}].note must be text"
            )

    assessment = raw.get("assessment", {})
    if not isinstance(assessment, Mapping):
        raise RiskAssessmentContractError("risk_assessment.assessment must be an object")
    for key in ("ideation", "plan", "intent", "self_harm"):
        item = assessment.get(key)
        if item is None:
            continue
        if not isinstance(item, Mapping) or item.get("value") not in {"co", "khong"}:
            raise RiskAssessmentContractError(
                f"risk_assessment.assessment.{key}.value is invalid"
            )
        if item.get("note") is not None and not isinstance(item.get("note"), str):
            raise RiskAssessmentContractError(
                f"risk_assessment.assessment.{key}.note must be text"
            )
    if assessment.get("level") is not None and assessment.get("level") not in {"thap", "trung_binh", "cao"}:
        raise RiskAssessmentContractError("risk_assessment.assessment.level is invalid")
    return dict(raw)


def normalize_risk_assessment(raw: Any, *, allow_legacy: bool = False) -> dict[str, Any]:
    """Return the canonical risk shape; legacy parsing is migration-only."""
    if isinstance(raw, Mapping):
        suicide_history = []
        for item in raw.get("suicide_history", []):
            if not isinstance(item, Mapping):
                continue
            code = str(item.get("code") or item.get("icd_code") or "").strip()
            note = str(item.get("note") or "").strip()
            if code:
                suicide_history.append({"code": code, "note": note})

        assessment = {}
        raw_assessment = raw.get("assessment", {})
        if isinstance(raw_assessment, Mapping):
            for key, _label in _ASSESSMENT_FIELDS:
                value = raw_assessment.get(key)
                if isinstance(value, Mapping):
                    normalized_value = str(value.get("value") or "").strip().lower()
                    note = str(value.get("note") or "").strip()
                    if normalized_value in {"co", "khong", "yes", "no"}:
                        normalized_value = "co" if normalized_value in {"co", "yes"} else "khong"
                        assessment[key] = {"value": normalized_value, "note": note}
            level = str(raw_assessment.get("level") or "").strip().lower()
            if level in _LEVEL_LABELS:
                assessment["level"] = level

        result = {
            "schema_version": RISK_SCHEMA_VERSION,
            "suicide_history": suicide_history,
            "assessment": assessment,
        }
        legacy_text = str(raw.get("legacy_text") or "").strip()
        if allow_legacy and legacy_text:
            result["legacy_text"] = legacy_text
        return result

    if isinstance(raw, str) and raw.strip():
        return parse_legacy_risk_assessment(raw) if allow_legacy else empty_risk_assessment()

    return empty_risk_assessment()


def parse_legacy_risk_assessment(raw: str) -> dict[str, Any]:
    """Convert the former [TSH]/[ĐGN] display string before the DB type change."""
    value = str(raw or "").strip()
    result = empty_risk_assessment()
    if not value:
        return result

    tsh_match = re.search(r"\[TSH\]\s*(.*?)(?:;\s*\[ĐGN\]|$)", value, re.IGNORECASE | re.DOTALL)
    if tsh_match:
        for pair in tsh_match.group(1).strip().split(" | "):
            code, separator, note = pair.partition(": ")
            code = code.strip()
            if code:
                result["suicide_history"].append({"code": code, "note": note.strip() if separator else ""})

    dgn_match = re.search(r"\[ĐGN\]\s*(.+)$", value, re.IGNORECASE | re.DOTALL)
    if dgn_match:
        for part in dgn_match.group(1).strip().split(" | "):
            label, separator, rest = part.partition(": ")
            if not separator:
                continue
            label = label.strip()
            rest = rest.strip()
            if label == "Mức độ nguy cơ":
                result["assessment"]["level"] = _LEVEL_VALUES.get(rest.lower(), rest.lower())
                continue
            field = next((key for key, field_label in _ASSESSMENT_FIELDS if field_label == label), None)
            if not field:
                continue
            answer, separator, note = rest.partition(" – ")
            answer = answer.strip().lower()
            value_code = "co" if answer == "có" else "khong" if answer == "không" else ""
            if value_code:
                result["assessment"][field] = {
                    "value": value_code,
                    "note": note.strip() if separator else "",
                }

    if not result["suicide_history"] and not result["assessment"]:
        result["legacy_text"] = value
    return result


def format_risk_assessment(raw: Any) -> str:
    """Return readable text for exports/print views without making it the DB shape."""
    data = normalize_risk_assessment(raw)
    parts = []
    history_parts = [
        f"{item['code']}: {item['note']}" if item.get("note") else item["code"]
        for item in data.get("suicide_history", [])
        if item.get("code")
    ]
    if history_parts:
        parts.append("[TSH] " + " | ".join(history_parts))

    assessment_parts = []
    assessment = data.get("assessment", {})
    for key, label in _ASSESSMENT_FIELDS:
        item = assessment.get(key)
        if not isinstance(item, Mapping) or not item.get("value"):
            continue
        answer = "Có" if item["value"] == "co" else "Không"
        note = f" – {item['note']}" if item.get("note") else ""
        assessment_parts.append(f"{label}: {answer}{note}")
    if assessment.get("level"):
        assessment_parts.append(f"Mức độ nguy cơ: {_LEVEL_LABELS.get(assessment['level'], assessment['level'])}")
    if assessment_parts:
        parts.append("[ĐGN] " + " | ".join(assessment_parts))

    return "; ".join(parts)
