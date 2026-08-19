#!/usr/bin/env python3
"""Check the Doctor patient medical-history ownership boundary."""

from __future__ import annotations

import sys
import re
from pathlib import Path

from sqlalchemy import text


ROOT = Path(__file__).resolve().parents[1]
SUGGESTIONS_FILE = ROOT / "app/static/js/doctor-examination/medical-history-suggestions.js"
RISK_FILE = ROOT / "app/static/js/doctor-examination/medical-history-risk.js"
BRIDGE_FILE = ROOT / "app/static/js/doctor-examination/medical-history-bridge.js"
HISTORY_RUNTIME_FILES = [
    ROOT / "app/static/js/doctor-examination/medical-history-allergy.js",
    ROOT / "app/static/js/doctor-examination/medical-history-bindings.js",
    ROOT / "app/static/js/doctor-examination/medical-history-bridge.js",
    ROOT / "app/static/js/doctor-examination/medical-history-core.js",
    ROOT / "app/static/js/doctor-examination/medical-history-icd-bridge.js",
    ROOT / "app/static/js/doctor-examination/medical-history-risk.js",
    ROOT / "app/static/js/doctor-examination/medical-history-suggestions.js",
    ROOT / "app/static/js/doctor-examination/medical-history-workbench.js",
    ROOT / "app/static/js/doctor-examination/safety-plan.js",
]


def _check_frontend() -> list[str]:
    errors = []
    suggestions = SUGGESTIONS_FILE.read_text(encoding="utf-8")
    risk = RISK_FILE.read_text(encoding="utf-8")
    bridge = BRIDGE_FILE.read_text(encoding="utf-8")

    if "substanceTableWrap" in suggestions:
        errors.append(
            "medical-history-suggestions.js still owns or synchronizes the substance table"
        )
    if "substance_use_history" not in risk:
        errors.append("medical-history-risk.js does not emit substance_use_history")
    if "substance_use_history" not in bridge:
        errors.append("medical-history-bridge.js does not load/save substance_use_history")
    legacy_namespace = re.compile(
        r"\b(?:its|sp)(?=[A-Z_-])"
        r"|\bITS_[A-Z_]+\b"
        r"|\b[A-Za-z0-9_]*Its[A-Za-z0-9_]*\b"
        r"|_its[A-Za-z0-9_]*"
    )
    for path in HISTORY_RUNTIME_FILES:
        if legacy_namespace.search(path.read_text(encoding="utf-8")):
            errors.append(f"legacy history namespace remains in {path.relative_to(ROOT)}")
    return errors


def _check_database() -> tuple[dict[str, int], list[dict]]:
    sys.path.insert(0, str(ROOT))
    from app.core.database import engine

    queries = {
        "allergies_wrong_type": """
            SELECT count(*)
            FROM patients
            WHERE allergies IS NULL
               OR jsonb_typeof(allergies) <> 'array'
        """,
        "allergies_invalid_shape": """
            SELECT count(*)
            FROM patients AS p
            CROSS JOIN LATERAL jsonb_array_elements(
                CASE
                    WHEN jsonb_typeof(p.allergies) = 'array' THEN p.allergies
                    ELSE '[]'::jsonb
                END
            ) AS items(item)
            WHERE jsonb_typeof(items.item) <> 'object'
               OR NULLIF(btrim(items.item->>'name'), '') IS NULL
               OR COALESCE(items.item->>'level', '') NOT IN ('', 'nghi_ngo', 'chac_chan')
               OR NOT (items.item ? 'symptom')
               OR jsonb_typeof(items.item->'symptom') <> 'string'
        """,
        "physical_history_wrong_type": """
            SELECT count(*)
            FROM patients
            WHERE physical_history IS NULL
               OR jsonb_typeof(physical_history) <> 'array'
        """,
        "substance_history_wrong_type": """
            SELECT count(*)
            FROM patients
            WHERE substance_use_history IS NULL
               OR jsonb_typeof(substance_use_history) <> 'object'
        """,
        "physical_history_substance_category": """
            SELECT count(*)
            FROM patients AS p
            CROSS JOIN LATERAL jsonb_array_elements(
                CASE
                    WHEN jsonb_typeof(p.physical_history) = 'array' THEN p.physical_history
                    ELSE '[]'::jsonb
                END
            ) AS items(item)
            JOIN icd ON icd.id = CASE
                WHEN items.item->>'id' ~ '^[0-9]+$' THEN (items.item->>'id')::integer
                ELSE NULL
            END
            WHERE items.item->>'type' = 'icd'
              AND icd.icd_code ~ '^F1[0-9](\\.|$)'
        """,
        "substance_history_overlap": """
            WITH substance_map(icd_prefix, usage_key) AS (VALUES
                ('F10','alcohol_used'), ('F11','opioids_used'),
                ('F12','cannabis_used'), ('F13','sedatives_used'),
                ('F14','cocaine_used'), ('F15','stimulants_used'),
                ('F16','hallucinogens_used'), ('F17','tobacco_used'),
                ('F18','inhalants_used'), ('F19','other_substance_used')
            )
            SELECT count(*)
            FROM patients AS p
            CROSS JOIN LATERAL jsonb_array_elements(
                CASE
                    WHEN jsonb_typeof(p.physical_history) = 'array' THEN p.physical_history
                    ELSE '[]'::jsonb
                END
            ) AS items(item)
            JOIN icd ON icd.id = CASE
                WHEN items.item->>'id' ~ '^[0-9]+$' THEN (items.item->>'id')::integer
                ELSE NULL
            END
            JOIN substance_map ON icd.icd_code LIKE substance_map.icd_prefix || '%'
            WHERE items.item->>'type' = 'icd'
              AND p.substance_use_history->>substance_map.usage_key = 'true'
        """,
    }
    with engine.connect() as connection:
        counts = {
            name: int(connection.execute(text(query)).scalar_one())
            for name, query in queries.items()
        }
        samples = connection.execute(
            text(
                """
                SELECT p.id, p.patient_code, icd.icd_code
                FROM patients AS p
                CROSS JOIN LATERAL jsonb_array_elements(
                    CASE
                        WHEN jsonb_typeof(p.physical_history) = 'array' THEN p.physical_history
                        ELSE '[]'::jsonb
                    END
                ) AS items(item)
                JOIN icd ON icd.id = CASE
                    WHEN items.item->>'id' ~ '^[0-9]+$' THEN (items.item->>'id')::integer
                    ELSE NULL
                END
                WHERE items.item->>'type' = 'icd'
                  AND icd.icd_code ~ '^F1[0-9](\\.|$)'
                ORDER BY p.id, icd.icd_code
                LIMIT 10
                """
            )
        ).mappings().all()
    return counts, [dict(row) for row in samples]


def main() -> int:
    errors = _check_frontend()
    counts, samples = _check_database()
    failed_counts = {
        name: count
        for name, count in counts.items()
        if count
    }
    ok = not errors and not failed_counts

    print(f"[{'OK' if ok else 'FAIL'}] medical_history_contract")
    for name, count in counts.items():
        print(f"  {name}={count}")
    if errors:
        print("  frontend_errors:")
        for error in errors:
            print(f"    - {error}")
    if samples:
        print("  forbidden_samples:")
        for sample in samples:
            print(f"    - {sample}")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())
