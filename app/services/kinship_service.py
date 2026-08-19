import json
import unicodedata
from pathlib import Path
from typing import Dict, Optional

import requests

from app.core.config import settings

FALLBACK_KINSHIP = "Khác"

DEFAULT_KINSHIP_VALUES = [
    "Cha",
    "Mẹ",
    "Cha dượng",
    "Mẹ kế",
    "Vợ",
    "Chồng",
    "Vợ cũ",
    "Chồng cũ",
    "Con trai",
    "Con gái",
    "Con trai riêng",
    "Con gái riêng",
    "Con trai nuôi",
    "Con gái nuôi",
    "Anh trai",
    "Em trai",
    "Chị gái",
    "Em gái",
    "Anh trai cùng cha khác mẹ",
    "Em trai cùng cha khác mẹ",
    "Anh trai cùng mẹ khác cha",
    "Em trai cùng mẹ khác cha",
    "Chị gái cùng cha khác mẹ",
    "Em gái cùng cha khác mẹ",
    "Chị gái cùng mẹ khác cha",
    "Em gái cùng mẹ khác cha",
    "Bạn",
    "Bạn thân",
    "Đồng nghiệp",
    "Hàng xóm",
    FALLBACK_KINSHIP,
]

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
KINSHIP_DATA_FILE = DATA_DIR / "kinship_mapping.json"


def _normalize_key(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value or "")
    stripped = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return " ".join(stripped.lower().split())


def _load_kinship_data():
    try:
        with KINSHIP_DATA_FILE.open("r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, list) and data:
                return data
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    return [
        {"kinship": value, "reverse_options": [FALLBACK_KINSHIP], "notes": ""}
        for value in DEFAULT_KINSHIP_VALUES
    ]


_KINSHIP_RAW = _load_kinship_data()
KINSHIP_DATA: Dict[str, Dict[str, Optional[str]]] = {
    item.get("kinship"): item for item in _KINSHIP_RAW if item.get("kinship")
}
KINSHIP_VALUES = list(KINSHIP_DATA.keys()) or DEFAULT_KINSHIP_VALUES[:]
if FALLBACK_KINSHIP not in KINSHIP_VALUES:
    KINSHIP_VALUES.append(FALLBACK_KINSHIP)


KINSHIP_LOOKUP = {_normalize_key(item): item for item in KINSHIP_VALUES}

_AI_CACHE: Dict[str, Optional[str]] = {}

GENDER_KEYWORDS = {
    "male": ["trai", "chồng", "cha", "anh", "dượng", "ông"],
    "female": ["gái", "vợ", "mẹ", "chị", "dì", "bà", "kế"]
}


def _gender_code(patient) -> Optional[str]:
    if not patient or not getattr(patient, "gender", None):
        return None
    gender_value = patient.gender.strip().lower()
    if gender_value in {"male", "nam", "m"}:
        return "male"
    if gender_value in {"female", "nu", "nữ", "f"}:
        return "female"
    return None


def normalize_kinship(value: Optional[str], allow_ai: bool = True) -> Optional[str]:
    if not value:
        return None
    key = _normalize_key(value)
    if key in KINSHIP_LOOKUP:
        return KINSHIP_LOOKUP[key]
    cached = _AI_CACHE.get(key)
    if cached is not None:
        return cached
    if allow_ai:
        ai_value = _call_ai_normalizer(value)
        _AI_CACHE[key] = ai_value
        if ai_value:
            return ai_value
    _AI_CACHE[key] = None
    return None


def get_reverse_kinship(
    kinship: str,
    source_patient,
    target_patient,
) -> str:
    entry = KINSHIP_DATA.get(kinship)
    if not entry:
        return FALLBACK_KINSHIP
    options = entry.get("reverse_options") or []
    selected = _select_reverse_option(options, source_patient)
    return selected or FALLBACK_KINSHIP


def _select_reverse_option(options, source_patient) -> Optional[str]:
    if not options:
        return None
    if len(options) == 1:
        return options[0]
    gender = _gender_code(source_patient)
    if gender:
        preferred = _match_option_by_gender(options, gender)
        if preferred:
            return preferred
    return options[0]


def _normalize_for_match(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value or "")
    stripped = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return stripped.lower()


def _match_option_by_gender(options, gender: str) -> Optional[str]:
    normalized_options = {option: _normalize_for_match(option) for option in options}
    keywords = GENDER_KEYWORDS.get(gender, [])
    for keyword in keywords:
        for original, normalized in normalized_options.items():
            if keyword in normalized:
                return original
    return None


def _call_ai_normalizer(raw_value: str) -> Optional[str]:
    if not (
        settings.KINSHIP_AI_API_URL
        and settings.KINSHIP_AI_API_KEY
        and settings.KINSHIP_AI_MODEL
    ):
        return None

    prompt = (
        "Bạn là trợ lý chuẩn hoá quan hệ gia đình. "
        "Danh sách quan hệ hợp lệ là: "
        + ", ".join(KINSHIP_VALUES)
        + ".\n"
        "Hãy chọn duy nhất một giá trị phù hợp nhất với cụm được cung cấp. "
        "Nếu không chắc, trả về 'Khác'. "
        "Chỉ trả về JSON với dạng: {\"normalized\": \"<giá trị>\"}.\n"
        f"Cụm đầu vào: {raw_value}"
    )

    payload = {
        "model": settings.KINSHIP_AI_MODEL,
        "messages": [
            {"role": "system", "content": "Bạn hỗ trợ chuẩn hoá quan hệ gia đình."},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.1,
        "max_tokens": 100,
    }

    headers = {
        "Authorization": f"Bearer {settings.KINSHIP_AI_API_KEY}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(
            settings.KINSHIP_AI_API_URL,
            headers=headers,
            json=payload,
            timeout=settings.KINSHIP_AI_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
        content = _extract_message_content(response.json())
        if not content:
            return None
        data = json.loads(content)
        normalized = data.get("normalized")
        if not isinstance(normalized, str):
            return None
        key = _normalize_key(normalized)
        return KINSHIP_LOOKUP.get(key)
    except (requests.RequestException, ValueError, json.JSONDecodeError):
        return None


def _extract_message_content(payload: Dict) -> Optional[str]:
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    message = choices[0].get("message") or {}
    content = message.get("content")
    if not isinstance(content, str):
        return None
    content = content.strip()
    if content.startswith("```"):
        content = content.strip("`")
    return content or None
