import json
import re
from typing import Any, Dict, List, Optional

from app.utils.allergy_contract import format_allergy_entries

import requests

from app.core.config import settings


class UsageSuggestionError(Exception):
    """Ngoại lệ chung cho dịch vụ gợi ý cách dùng."""


TIME_ORDER = ["sáng", "trưa", "chiều", "tối"]
VALID_SCHEDULES = [
    "Sáng",
    "Trưa",
    "Chiều",
    "Tối",
    "Sáng, trưa",
    "Sáng, chiều",
    "Sáng, tối",
    "Trưa, chiều",
    "Trưa, tối",
    "Chiều, tối",
    "Sáng, trưa, chiều",
    "Sáng, trưa, tối",
    "Sáng, chiều, tối",
    "Trưa, chiều, tối",
    "Sáng, trưa, chiều, tối",
]
VALID_SCHEDULE_PROMPT = ", ".join(VALID_SCHEDULES)
BLOCKED_KEYWORDS = ["ngừng", "ngưng", "dừng", "không sử dụng", "cai"]
NOTE_CLEANUP_PHRASES = [
    "uống với nhiều nước",
    "uống thêm nhiều nước",
    "không uống rượu",
    "tránh rượu bia",
]


def _format_quantity_value(quantity: Any) -> Optional[str]:
    if quantity is None:
        return None
    try:
        value = float(quantity)
    except (TypeError, ValueError):
        return str(quantity).strip() or None

    if value.is_integer():
        return str(int(value))

    formatted = f"{value:.2f}".rstrip("0").rstrip(".")
    return formatted or None


def _build_dose_phrase(medicines: List[Dict[str, Any]]) -> Optional[str]:
    for medicine in medicines:
        quantity_str = _format_quantity_value(medicine.get("quantity"))
        unit = (medicine.get("unit") or "").strip()
        name = (medicine.get("name") or "").strip()

        if not quantity_str and not unit and not name:
            continue

        phrase_parts: List[str] = []
        if quantity_str:
            if unit:
                phrase_parts.append(f"{quantity_str} {unit.lower()}")
            else:
                phrase_parts.append(f"{quantity_str} liều")
        elif unit:
            phrase_parts.append(unit.lower())

        if name:
            phrase_parts.append(name)

        phrase = " ".join(part for part in phrase_parts if part).strip()
        if phrase:
            return phrase

    return None


def _extract_time_tokens(source: Optional[str]) -> List[str]:
    if not source:
        return []
    processed = (
        source.lower()
        .replace(" và ", ",")
        .replace("và", ",")
        .replace(";", ",")
    )
    tokens = re.findall(r"\b(sáng|trưa|chiều|tối)\b", processed, flags=re.IGNORECASE)
    return [token.lower() for token in tokens]


def _normalize_schedule_value(*sources: Optional[str]) -> Optional[str]:
    found_tokens: List[str] = []
    for source in sources:
        tokens = _extract_time_tokens(source)
        for token in tokens:
            if token not in found_tokens:
                found_tokens.append(token)

    ordered = [word for word in TIME_ORDER if word in found_tokens]
    if not ordered:
        return None
    return ", ".join(word.capitalize() for word in ordered)


def _build_prompt(payload: Dict[str, Any]) -> str:
    """Chuẩn hoá dữ liệu đầu vào thành prompt mô tả đầy đủ bối cảnh đơn thuốc."""
    patient = payload.get("patient") or {}
    diagnosis = payload.get("diagnosis") or {}
    medicines = payload.get("medicines") or []
    notes = payload.get("notes") or ""

    patient_lines = [
        f"Tên: {patient.get('full_name') or 'N/A'}",
        f"Tuổi: {patient.get('age') or 'N/A'}",
        f"Giới tính: {patient.get('gender') or 'N/A'}",
        f"Cân nặng: {patient.get('weight') or 'N/A'} kg",
        f"Chiều cao: {patient.get('height') or 'N/A'} cm",
        f"Dị ứng: {format_allergy_entries(patient.get('allergies') or []) or 'Không rõ'}",
    ]

    diagnosis_lines = [
        f"Chẩn đoán chính: {diagnosis.get('primary') or 'Không cung cấp'}",
        f"Triệu chứng chính: {diagnosis.get('symptoms') or 'Không cung cấp'}",
        f"Mục tiêu điều trị: {diagnosis.get('goal') or 'Không cung cấp'}",
    ]

    dose_phrase = _build_dose_phrase(medicines)

    medicine_lines = []
    for index, medicine in enumerate(medicines, start=1):
        line = [
            f"Thuốc {index}: {medicine.get('name') or 'Không tên'}",
            f"Liều mỗi lần: {medicine.get('dose') or 'N/A'}",
            f"Số lần trong ngày: {medicine.get('frequency') or 'N/A'}",
            f"Số ngày: {medicine.get('duration_days') or 'N/A'}",
            f"Đường dùng: {medicine.get('route') or 'Không rõ'}",
            f"Ghi chú: {medicine.get('note') or 'Không'}",
        ]
        quantity_str = _format_quantity_value(medicine.get("quantity"))
        unit = (medicine.get("unit") or "").strip()
        strength = (medicine.get("strength") or "").strip()
        if quantity_str:
            if unit:
                line.append(f"Số lượng mỗi lần: {quantity_str} {unit}")
            else:
                line.append(f"Số lượng mỗi lần: {quantity_str}")
        if strength:
            line.append(f"Hàm lượng: {strength}")
        medicine_lines.append(", ".join(line))

    prompt_sections = [
        "Bạn là bác sĩ lâm sàng, hãy đề xuất 2-3 phương án hướng dẫn sử dụng thuốc cho bệnh nhân, rõ ràng, an toàn.",
        "Thông tin bệnh nhân:",
        "; ".join(patient_lines),
        "Thông tin lâm sàng:",
        "; ".join(diagnosis_lines),
        "Đơn thuốc hiện tại:",
        " | ".join(medicine_lines) if medicine_lines else "Chưa cung cấp thuốc.",
    ]

    if notes:
        prompt_sections.append(f"Ghi chú bổ sung từ bác sĩ: {notes}")

    if dose_phrase:
        prompt_sections.append(
            f"Liều chuẩn mỗi lần dùng (để tham chiếu): {dose_phrase}. Không được khuyên ngừng thuốc."
        )

    prompt_sections.extend(
        [
            "Chỉ trả về JSON thuần (không kèm văn bản ngoài JSON). Cấu trúc mỗi gợi ý:",
            """[
  {
    "schedule": "Sáng, trưa, chiều, tối",
    "note": "Trước khi ăn 30 phút, uống với nhiều nước.",
    "meta": "Nhắc bệnh nhân theo dõi dạ dày.",
    "tags": ["4 lần/ngày", "Trước ăn"]
  }
]""",
            f"Trường schedule phải chọn đúng một giá trị trong danh sách sau: {VALID_SCHEDULE_PROMPT}.",
            "note mô tả ngắn gọn điều kiện dùng (trước ăn, trước ngủ, uống nhiều nước...). Không đưa ra lời khuyên dừng thuốc hay cai nghiện.",
        ]
    )

    return "\n".join(prompt_sections)


def _strip_code_fences(text: str) -> str:
    lines = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("```") and stripped.endswith("```"):
            continue
        if stripped.startswith("```") or stripped.endswith("```"):
            continue
        lines.append(line)
    return "\n".join(lines).strip()


def _try_load_json_candidates(content: str) -> Optional[Any]:
    candidates: List[str] = []
    stripped = content.strip()
    if stripped:
        candidates.append(stripped)
    without_fence = _strip_code_fences(stripped)
    if without_fence and without_fence != stripped:
        candidates.append(without_fence)

    bracket_match = re.search(r"\[[\s\S]+\]", stripped)
    if bracket_match:
        candidates.append(bracket_match.group(0))

    object_match = re.search(r"\{[\s\S]+\}", stripped)
    if object_match:
        candidates.append(object_match.group(0))

    for candidate in candidates:
        try:
            return json.loads(candidate)
        except json.JSONDecodeError:
            continue
    return None


def _normalize_suggestions(raw_suggestions: Any) -> List[Dict[str, Any]]:
    suggestions: List[Any] = []
    if isinstance(raw_suggestions, dict):
        if "suggestions" in raw_suggestions:
            suggestions = raw_suggestions["suggestions"]
        else:
            suggestions = [raw_suggestions]
    elif isinstance(raw_suggestions, list):
        suggestions = raw_suggestions

    normalized: List[Dict[str, Any]] = []
    for item in suggestions:
        if isinstance(item, dict):
            text = (item.get("text") or "").strip()
            meta = (item.get("meta") or "").strip()
            tags = item.get("tags") or []
            note = (item.get("note") or item.get("notes") or "").strip()
            schedule = (item.get("schedule") or item.get("time") or "").strip()
        else:
            text = str(item).strip()
            meta = ""
            tags = []
            note = ""
            schedule = ""

        if not (text or meta or note or schedule):
            continue

        if not isinstance(tags, list):
            tags = [str(tags)]

        normalized.append(
            {
                "text": text,
                "meta": meta,
                "tags": [str(tag).strip() for tag in tags if str(tag).strip()],
                "note": note,
                "schedule": schedule,
            }
        )

    return normalized


def _fallback_from_plain_text(content: str) -> List[Dict[str, Any]]:
    if not content:
        return []

    text = _strip_code_fences(content)
    text = re.sub(r"^[-•\d.\s]+", "", text, flags=re.MULTILINE).strip()
    if not text:
        return []

    sentences = re.split(r"[\n\r]+", text)
    sentences = [sentence.strip(" -•") for sentence in sentences if sentence.strip()]
    if not sentences:
        sentences = [text]

    limited = sentences[:3]
    fallback: List[Dict[str, Any]] = []
    for idx, sentence in enumerate(limited):
        fallback.append(
            {
                "text": sentence,
                "meta": "AI gợi ý tổng quát" if idx == 0 else "",
                "tags": [],
                "note": "",
                "schedule": "",
            }
        )
    return fallback


def _parse_openai_response(content: str) -> List[Dict[str, Any]]:
    """Cố gắng parse nội dung trả về dạng JSON hoặc danh sách gợi ý."""
    raw = _try_load_json_candidates(content)
    normalized = _normalize_suggestions(raw) if raw is not None else []

    if normalized:
        return normalized

    return _fallback_from_plain_text(content)


def _resolve_route_instruction(medicines: List[Dict[str, Any]]) -> str:
    for medicine in medicines:
        route = (medicine.get("route") or "").strip()
        if route:
            return route
    return "Uống"


def _sanitize_usage_note(note: str) -> str:
    text = (note or "").strip()
    if not text:
        return ""

    def _cleanup_phrase(match: re.Match) -> str:
        return ""

    cleaned = text
    for phrase in NOTE_CLEANUP_PHRASES:
        pattern = rf"(,?\s*){re.escape(phrase)}\.?"
        cleaned = re.sub(pattern, _cleanup_phrase, cleaned, flags=re.IGNORECASE)

    cleaned = re.sub(r"\s+", " ", cleaned).strip(" ,.")
    return cleaned


def _compose_usage_text(medicine: Dict[str, Any], fallback_route: str, schedule: str, note: str) -> str:
    parts: List[str] = []

    route = (medicine.get("route") or "").strip() or fallback_route or "Uống"
    quantity = _format_quantity_value(medicine.get("quantity"))
    unit = (medicine.get("unit") or "").strip()
    name = (medicine.get("name") or "").strip()
    strength = (medicine.get("strength") or "").strip()

    parts.append(route)

    if quantity and unit:
        parts.append(f"{quantity} {unit.lower()}")
    elif quantity:
        parts.append(quantity)
    elif unit:
        parts.append(unit.lower())

    if name:
        parts.append(name)

    if strength and strength.lower() not in name.lower():
        parts.append(strength)

    schedule = schedule.strip()
    if schedule:
        parts.append(schedule.lower())

    if note:
        parts.append(note.strip())

    sentence = " ".join(part for part in parts if part).strip()
    if not sentence.endswith("."):
        sentence += "."
    return sentence


def _enrich_suggestions(payload: Dict[str, Any], suggestions: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    medicines = payload.get("medicines") or []
    fallback_schedule = "Sáng, trưa, chiều"
    route_instruction = _resolve_route_instruction(medicines)

    enriched: List[Dict[str, Any]] = []
    for item in suggestions:
        raw_text = item.get("text", "")
        note = item.get("note", "")
        meta = item.get("meta", "")
        schedule = _normalize_schedule_value(
            item.get("schedule"),
            raw_text,
            note,
            meta,
        )

        if not schedule:
            schedule = fallback_schedule

        content_for_filter = " ".join([raw_text, note, meta]).lower()
        if any(keyword in content_for_filter for keyword in BLOCKED_KEYWORDS):
            continue

        tags = item.get("tags") or []
        if not isinstance(tags, list):
            tags = [str(tags)]
        tags = [str(tag).strip() for tag in tags if str(tag).strip()]
        if schedule and schedule not in tags:
            tags = [schedule] + tags

        sanitized_note = _sanitize_usage_note(note or meta)

        target_medicines = medicines if medicines else [{}]
        sentences: List[str] = []
        for med in target_medicines:
            sentences.append(_compose_usage_text(med, route_instruction, schedule, sanitized_note))

        text_content = "\n".join(sentences)

        enriched.append(
            {
                "text": text_content,
                "meta": meta or note,
                "tags": tags,
                "schedule": schedule,
            }
        )

    return enriched


def _default_headers(api_key: Optional[str]) -> Dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def request_usage_suggestions(payload: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Gọi dịch vụ AI để lấy gợi ý cách dùng."""
    url = settings.USAGE_AI_API_URL
    if not url:
        raise UsageSuggestionError("Chưa cấu hình USAGE_AI_API_URL.")

    prompt = _build_prompt(payload)
    model = settings.USAGE_AI_MODEL or "gpt-4o-mini"

    body = payload.get("raw_request")
    if not body:
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": "Bạn là trợ lý y khoa hỗ trợ bác sĩ kê đơn an toàn."},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.2,
        }

    try:
        response = requests.post(
            url,
            headers=_default_headers(settings.USAGE_AI_API_KEY),
            json=body,
            timeout=settings.USAGE_AI_TIMEOUT_SECONDS,
        )
    except requests.RequestException as exc:
        raise UsageSuggestionError(f"Lỗi kết nối tới dịch vụ AI: {exc}") from exc

    if response.status_code >= 400:
        raise UsageSuggestionError(
            f"Dịch vụ AI trả về lỗi {response.status_code}: {response.text}"
        )

    data: Any
    try:
        data = response.json()
    except ValueError as exc:
        raise UsageSuggestionError("Không parse được JSON từ phản hồi AI.") from exc

    # Hỗ trợ các cấu trúc phản hồi phổ biến
    if isinstance(data, dict):
        if "suggestions" in data:
            suggestions = data["suggestions"]
        elif "choices" in data:
            content = ""
            choices = data.get("choices") or []
            for choice in choices:
                message = choice.get("message") if isinstance(choice, dict) else None
                if message and isinstance(message, dict):
                    part = message.get("content") or ""
                    if part:
                        content += part
            suggestions = _parse_openai_response(content)
        else:
            suggestions = []
    elif isinstance(data, list):
        suggestions = data
    else:
        suggestions = []

    normalized = _normalize_suggestions(suggestions)
    if not normalized:
        if isinstance(suggestions, str):
            normalized = _parse_openai_response(suggestions)
        elif suggestions:
            try:
                normalized = _parse_openai_response(json.dumps(suggestions, ensure_ascii=False))
            except (TypeError, ValueError):
                normalized = []

    if not normalized:
        raise UsageSuggestionError("Dịch vụ AI không trả về gợi ý hợp lệ.")

    enriched = _enrich_suggestions(payload, normalized)
    if not enriched:
        raise UsageSuggestionError("Không tạo được gợi ý phù hợp từ dữ liệu AI.")

    return enriched
