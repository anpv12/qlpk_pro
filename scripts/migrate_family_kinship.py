#!/usr/bin/env python3
"""
Chuẩn hoá dữ liệu người thân hiện có theo bảng mapping mới.

Chạy:
    python scripts/migrate_family_kinship.py
"""

import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from sqlalchemy.orm import joinedload

from app.core.database import SessionLocal
from app.models.family_member import FamilyMember
from app.services.kinship_service import (
    FALLBACK_KINSHIP,
    get_reverse_kinship,
    normalize_kinship,
)


def _get_reverse_member(session, member):
    return (
        session.query(FamilyMember)
        .filter(
            FamilyMember.patient_id == member.relative_patient_id,
            FamilyMember.relative_patient_id == member.patient_id,
        )
        .first()
    )


def migrate():
    session = SessionLocal()
    processed_pairs = set()
    normalized_count = 0
    updated_count = 0
    created_count = 0
    skipped_count = 0

    try:
        members = (
            session.query(FamilyMember)
            .filter(FamilyMember.relative_patient_id.isnot(None))
            .options(
                joinedload(FamilyMember.patient),
                joinedload(FamilyMember.relative_patient),
            )
            .all()
        )

        for member in members:
            if not member.patient or not member.relative_patient:
                skipped_count += 1
                continue

            pair_key = tuple(sorted((member.patient_id, member.relative_patient_id)))
            if pair_key in processed_pairs:
                continue
            processed_pairs.add(pair_key)

            forward = member
            reverse = _get_reverse_member(session, forward)

            normalized = normalize_kinship(forward.kinship, allow_ai=False) or FALLBACK_KINSHIP
            if forward.kinship != normalized:
                forward.kinship = normalized
                normalized_count += 1

            reverse_label = get_reverse_kinship(
                normalized,
                source_patient=forward.patient,
                target_patient=forward.relative_patient,
            )

            if reverse:
                if reverse.kinship != reverse_label:
                    reverse.kinship = reverse_label
                    updated_count += 1
            else:
                reverse = FamilyMember(
                    patient_id=forward.relative_patient_id,
                    relative_patient_id=forward.patient_id,
                    name=forward.patient.full_name,
                    kinship=reverse_label,
                    phone=forward.patient.phone,
                    examine_together=True,
                )
                session.add(reverse)
                created_count += 1

        session.commit()
        print(
            f"✅ Hoàn tất. Chuẩn hoá {normalized_count} bản ghi, cập nhật {updated_count} chiều ngược, "
            f"tạo mới {created_count} liên kết thiếu. Bỏ qua {skipped_count} bản ghi không đủ dữ liệu."
        )
    except Exception as exc:
        session.rollback()
        print(f"❌ Lỗi: {exc}")
        raise
    finally:
        session.close()


if __name__ == "__main__":
    migrate()
