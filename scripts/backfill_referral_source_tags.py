#!/usr/bin/env python3
"""
Backfill nhom nguon gioi thieu tu patients.referral_source.

Mac dinh script chi dry-run va xuat CSV report, khong sua DB.

Vi du:
    python scripts/backfill_referral_source_tags.py
    python scripts/backfill_referral_source_tags.py --report scratch/referral_source_backfill.csv

Cap nhat DB that, chi khi da duyet report:
    python scripts/backfill_referral_source_tags.py --ensure-columns --apply --yes

Script nay giu nguyen patients.referral_source. Khi apply, no ghi:
    - patients.referral_source_tag: tag_key on dinh de thong ke
    - patients.referral_source_detail: text goc da nhap
"""

from __future__ import annotations

import argparse
import csv
import os
import re
import sys
import unicodedata
from collections import OrderedDict, defaultdict
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Iterable

try:
    import psycopg2
except ImportError as exc:
    raise SystemExit("psycopg2 chua duoc cai dat trong moi truong Python nay") from exc


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_REPORT = BASE_DIR / "scratch" / "referral_source_backfill_report.csv"

TAG_LABELS = OrderedDict([
    ("not_set", "Chưa có nguồn"),
    ("facebook", "Facebook"),
    ("website", "Website"),
    ("referral", "Người quen giới thiệu"),
    ("medpro", "Medpro"),
    ("walk_in", "Khách vãng lai"),
    ("other", "Khác"),
])

GROUP_KEYWORDS = OrderedDict([
    ("facebook", [
        "facebook", "fb", "group", "hội người trầm cảm", "trang cá nhân",
    ]),
    ("website", ["website", "web site", "trang web"]),
    ("referral", [
        "người quen", "người giới thiệu", "giới thiệu bởi", "bạn", "bạn bè",
        "chị", "anh", "chị dâu", "học trò", "liu may", "thu trang",
        "quỳnh nhi", "phong lưu", "lê đào anh khương",
    ]),
    ("medpro", ["medpro"]),
    ("walk_in", ["khách vãng lai", "vang lai", "walk in", "walk-in"]),
])

# Cac case hien co trong DB bi mo ho theo keyword. Exact override giup backfill dung
# hon ma van giu rule keyword chung cho data moi.
EXACT_OVERRIDES = {
    "duoc ban khuong giang vien tam ly truong nhan van gioi thieu": "referral",
    "duoc gioi thieu tu ban tam ly gia nguyen hoang viet": "referral",
    "co toi duoc chuyen vien le khuong tu van ben psyhub va duoc bao ghi chu chuyen vien le khuong gui ca sang chan doan va can thiep thuoc": "other",
    "anh hoang viet chuyen vien tu van tam ly": "referral",
    "hoc tro bs hien": "referral",
    "minh duoc ban han gioi thieu qua ban do co kham bac si hien a": "referral",
    "ten phong luu gioi thieu den bs hien": "referral",
    "ban hoc cung lop tu dai hoc khoa hoc xa hoi nhan van ho chi minh": "referral",
    "ban be sinh vien tam ly ussh": "referral",
    "chi nguyen thi thu van sv nam 3 khoa tam ly hoc cua ussh hcm": "referral",
    "duoc gioi thieu boi anh le dao anh khuong": "referral",
}


@dataclass
class PatientReferralRow:
    patient_id: int
    patient_code: str | None
    full_name: str | None
    phone: str | None
    raw_source: str | None
    visit_count: int


@dataclass
class ClassifiedReferral:
    patient_id: int
    patient_code: str
    full_name: str
    phone: str
    raw_source: str
    tag_key: str
    tag_label: str
    detail: str | None
    visit_count: int
    rule: str
    matched_keywords: list[str]
    other_matches: dict[str, list[str]]

    @property
    def is_ambiguous(self) -> bool:
        return bool(self.other_matches)


def read_env_database_url() -> str | None:
    env_value = os.environ.get("DATABASE_URL")
    if env_value:
        return env_value

    env_path = BASE_DIR / ".env"
    if not env_path.exists():
        return None

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        if key.strip() == "DATABASE_URL":
            return value.strip().strip('"').strip("'")
    return None


def normalize_text(value: str | None) -> str:
    if not value:
        return ""
    text = unicodedata.normalize("NFD", value.lower().strip())
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn")
    text = text.replace("đ", "d")
    text = re.sub(r"[^a-z0-9]+", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def keyword_hits(normalized_source: str, keywords: Iterable[str]) -> list[str]:
    hits = []
    padded_source = f" {normalized_source} "
    for keyword in keywords:
        normalized_keyword = normalize_text(keyword)
        if not normalized_keyword:
            continue
        if " " in normalized_keyword:
            matched = normalized_keyword in normalized_source
        else:
            matched = f" {normalized_keyword} " in padded_source
        if matched:
            hits.append(keyword)
    return hits


def classify_referral_source(raw_source: str | None) -> tuple[str, str, list[str], dict[str, list[str]]]:
    source = (raw_source or "").strip()
    if not source:
        return "not_set", "blank", [], {}

    normalized = normalize_text(source)
    matches = {
        group_key: hits
        for group_key, keywords in GROUP_KEYWORDS.items()
        if (hits := keyword_hits(normalized, keywords))
    }

    if normalized in EXACT_OVERRIDES:
        tag_key = EXACT_OVERRIDES[normalized]
        return tag_key, "exact_override", matches.get(tag_key, []), {
            key: value for key, value in matches.items() if key != tag_key
        }

    for group_key in GROUP_KEYWORDS.keys():
        if group_key in matches:
            return group_key, "keyword", matches[group_key], {
                key: value for key, value in matches.items() if key != group_key
            }

    return "other", "fallback", [], {}


def load_patients(conn, from_date: date, to_date: date) -> list[PatientReferralRow]:
    sql = """
        SELECT
            p.id,
            p.patient_code,
            p.full_name,
            p.phone,
            p.referral_source,
            COUNT(a.id) AS visit_count
        FROM patients p
        LEFT JOIN appointments a ON a.patient_id = p.id
          AND a.appointment_date >= %(from_date)s
          AND a.appointment_date < %(to_date_exclusive)s
          AND COALESCE(a.is_deleted, false) = false
          AND (a.status IS NULL OR a.status::text NOT IN ('CANCELLED', 'NO_SHOW'))
        GROUP BY p.id, p.patient_code, p.full_name, p.phone, p.referral_source
        ORDER BY visit_count DESC, p.full_name NULLS LAST, p.id
    """
    to_date_exclusive = to_date + timedelta(days=1)
    with conn.cursor() as cur:
        cur.execute(sql, {"from_date": from_date, "to_date_exclusive": to_date_exclusive})
        return [PatientReferralRow(*row) for row in cur.fetchall()]


def classify_rows(rows: Iterable[PatientReferralRow]) -> list[ClassifiedReferral]:
    result = []
    for row in rows:
        tag_key, rule, matched, other_matches = classify_referral_source(row.raw_source)
        raw_source = (row.raw_source or "").strip()
        result.append(ClassifiedReferral(
            patient_id=row.patient_id,
            patient_code=row.patient_code or "",
            full_name=row.full_name or "",
            phone=row.phone or "",
            raw_source=raw_source,
            tag_key=tag_key,
            tag_label=TAG_LABELS[tag_key],
            detail=raw_source or None,
            visit_count=int(row.visit_count or 0),
            rule=rule,
            matched_keywords=matched,
            other_matches=other_matches,
        ))
    return result


def write_report(path: Path, rows: list[ClassifiedReferral]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8-sig", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=[
            "patient_id",
            "patient_code",
            "full_name",
            "phone",
            "raw_referral_source",
            "tag_key",
            "tag_label",
            "referral_source_detail",
            "visit_count",
            "rule",
            "matched_keywords",
            "other_matches",
            "ambiguous",
        ])
        writer.writeheader()
        for row in rows:
            writer.writerow({
                "patient_id": row.patient_id,
                "patient_code": row.patient_code,
                "full_name": row.full_name,
                "phone": row.phone,
                "raw_referral_source": row.raw_source,
                "tag_key": row.tag_key,
                "tag_label": row.tag_label,
                "referral_source_detail": row.detail or "",
                "visit_count": row.visit_count,
                "rule": row.rule,
                "matched_keywords": ", ".join(row.matched_keywords),
                "other_matches": "; ".join(
                    f"{TAG_LABELS[key]}: {', '.join(values)}"
                    for key, values in row.other_matches.items()
                ),
                "ambiguous": "yes" if row.is_ambiguous else "no",
            })


def print_summary(rows: list[ClassifiedReferral], from_date: date, to_date: date) -> None:
    grouped = defaultdict(lambda: {"patients": 0, "visits": 0, "raw_values": set()})
    for row in rows:
        item = grouped[row.tag_key]
        item["patients"] += 1
        item["visits"] += row.visit_count
        if row.raw_source:
            item["raw_values"].add(row.raw_source)

    print(f"Khoang thong ke luot kham: {from_date.isoformat()} -> {to_date.isoformat()}")
    print(f"Tong benh nhan: {len(rows)}")
    print("\nSUMMARY")
    print(f"{'tag_key':<24} {'label':<38} {'patients':>8} {'visits':>8} {'raw':>5}")
    for tag_key, label in TAG_LABELS.items():
        item = grouped[tag_key]
        print(f"{tag_key:<24} {label:<38} {item['patients']:>8} {item['visits']:>8} {len(item['raw_values']):>5}")

    ambiguous = [row for row in rows if row.is_ambiguous]
    if ambiguous:
        print("\nAMBIGUOUS ROWS")
        for row in ambiguous:
            other = "; ".join(
                f"{TAG_LABELS[key]}={', '.join(values)}"
                for key, values in row.other_matches.items()
            )
            print(f"- patient_id={row.patient_id}, chosen={row.tag_label}, rule={row.rule}, other=[{other}], raw={row.raw_source}")


def table_has_columns(conn, columns: Iterable[str]) -> dict[str, bool]:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_name = 'patients'
              AND column_name = ANY(%s)
        """, (list(columns),))
        found = {row[0] for row in cur.fetchall()}
    return {column: column in found for column in columns}


def ensure_columns(conn) -> None:
    with conn.cursor() as cur:
        cur.execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS referral_source_tag VARCHAR(64)")
        cur.execute("ALTER TABLE patients ADD COLUMN IF NOT EXISTS referral_source_detail TEXT")
    conn.commit()


def apply_backfill(conn, rows: list[ClassifiedReferral]) -> int:
    with conn.cursor() as cur:
        for row in rows:
            cur.execute("""
                UPDATE patients
                SET referral_source_tag = %s,
                    referral_source_detail = %s
                WHERE id = %s
            """, (row.tag_key, row.detail, row.patient_id))
    conn.commit()
    return len(rows)


def parse_args() -> argparse.Namespace:
    today = date.today()
    parser = argparse.ArgumentParser(description="Backfill referral source tag/detail cho patients")
    parser.add_argument("--database-url", default=read_env_database_url(), help="PostgreSQL DATABASE_URL")
    parser.add_argument("--from-date", default=date(today.year, 1, 1).isoformat(), help="Ngay bat dau tinh visit_count, YYYY-MM-DD")
    parser.add_argument("--to-date", default=today.isoformat(), help="Ngay ket thuc tinh visit_count, YYYY-MM-DD")
    parser.add_argument("--report", default=str(DEFAULT_REPORT), help="Duong dan CSV report")
    parser.add_argument("--apply", action="store_true", help="Cap nhat patients.referral_source_tag/detail")
    parser.add_argument("--ensure-columns", action="store_true", help="Tu them 2 cot referral_source_tag/detail neu chua co")
    parser.add_argument("--yes", action="store_true", help="Xac nhan ghi DB khi dung --apply")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    if not args.database_url:
        print("Khong tim thay DATABASE_URL. Truyen --database-url hoac khai bao trong .env", file=sys.stderr)
        return 2

    from_date = datetime.strptime(args.from_date, "%Y-%m-%d").date()
    to_date = datetime.strptime(args.to_date, "%Y-%m-%d").date()
    report_path = Path(args.report)

    conn = psycopg2.connect(args.database_url)
    try:
        rows = classify_rows(load_patients(conn, from_date, to_date))
        write_report(report_path, rows)
        print_summary(rows, from_date, to_date)
        print(f"\nReport CSV: {report_path}")

        if not args.apply:
            print("\nDRY-RUN: chua cap nhat DB. Dung --apply --yes de ghi DB sau khi duyet report.")
            return 0

        if not args.yes:
            print("\nDa bat --apply nhung thieu --yes. Khong cap nhat DB.", file=sys.stderr)
            return 2

        if args.ensure_columns:
            ensure_columns(conn)

        required = table_has_columns(conn, ["referral_source_tag", "referral_source_detail"])
        missing = [column for column, exists in required.items() if not exists]
        if missing:
            print(
                "\nThieu cot trong patients: " + ", ".join(missing) +
                ". Chay lai voi --ensure-columns neu muon script tu them cot.",
                file=sys.stderr,
            )
            return 2

        updated = apply_backfill(conn, rows)
        print(f"\nDa cap nhat {updated} benh nhan vao referral_source_tag/referral_source_detail.")
        return 0
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    raise SystemExit(main())
