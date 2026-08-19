"""Canonical contract helpers for patient drug-allergy history."""

from __future__ import annotations

from typing import Any


ALLERGY_LEVELS = frozenset({"", "nghi_ngo", "chac_chan"})
EMPTY_ALLERGY_LABELS = frozenset({"chưa ghi nhận", "không rõ", "không có", "không"})


class AllergyContractError(ValueError):
    """Raised when an allergy payload is not in the canonical array shape."""


def normalize_allergy_entries(value: Any) -> list[dict[str, str]]:
    """Validate and normalize the canonical ``[{name, level, symptom}]`` list."""
    if value is None or value == "":
        return []
    if not isinstance(value, list):
        raise AllergyContractError("allergies must be an array of allergy entries")

    normalized: list[dict[str, str]] = []
    for index, entry in enumerate(value):
        if not isinstance(entry, dict):
            raise AllergyContractError(f"allergies[{index}] must be an object")

        name = str(entry.get("name") or "").strip()
        if not name:
            continue
        if name.casefold() in EMPTY_ALLERGY_LABELS:
            continue

        level = str(entry.get("level") or "").strip().lower()
        if level not in ALLERGY_LEVELS:
            raise AllergyContractError(
                f"allergies[{index}].level must be nghi_ngo, chac_chan, or empty"
            )

        normalized.append({
            "name": name,
            "level": level,
            "symptom": str(entry.get("symptom") or "").strip(),
        })

    return normalized


def format_allergy_entries(entries: Any, separator: str = ", ") -> str:
    """Format canonical entries for read-only text such as print/export/prompt."""
    normalized = normalize_allergy_entries(entries)
    labels = {"nghi_ngo": "Nghi ngờ", "chac_chan": "Chắc chắn"}
    formatted: list[str] = []
    for entry in normalized:
        prefix = labels.get(entry["level"], "")
        text = f"{prefix}: {entry['name']}" if prefix else entry["name"]
        if entry["symptom"]:
            text = f"{text} - {entry['symptom']}"
        formatted.append(text)
    return separator.join(formatted)


def parse_text_allergy_input(value: Any) -> list[dict[str, str]]:
    """Parse an explicit text import/form boundary into the canonical array.

    This is used only at text-input/import boundaries. Runtime API responses and
    persisted values use ``normalize_allergy_entries`` directly.
    """
    if value is None or str(value).strip() == "":
        return []

    entries: list[dict[str, str]] = []
    for raw_entry in str(value).replace("\r\n", "\n").splitlines():
        for raw_part in raw_entry.split(";"):
            part = raw_part.strip()
            if not part:
                continue
            pieces = [piece.strip() for piece in part.split("|")]
            entries.append({
                "name": pieces[0],
                "level": pieces[1].lower() if len(pieces) > 1 else "",
                "symptom": "|".join(pieces[2:]).strip() if len(pieces) > 2 else "",
            })
    return normalize_allergy_entries(entries)
