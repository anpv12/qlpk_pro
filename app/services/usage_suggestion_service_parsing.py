"""usage_suggestion_service helpers split out by topic (parsing); re-exported by app.services.usage_suggestion_service."""

import json
import re
from typing import Any, Dict, List, Optional


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
