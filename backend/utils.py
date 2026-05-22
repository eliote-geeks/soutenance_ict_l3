from datetime import datetime, timezone
from typing import Any


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def parse_dt(value: Any) -> datetime:
    if isinstance(value, str) and value:
        normalized = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized)
        except ValueError:
            pass
    return now_utc()


def normalize_text(value: Any, default: str = "unknown") -> str:
    if value is None:
        return default
    return str(value)


def alert_source_type(title: str | None) -> str:
    return "ml" if "ml network anomaly" in normalize_text(title, "").lower() else "heuristic"


def alert_signature(*parts: Any) -> str:
    raw = "|".join(normalize_text(part, "").strip().lower() for part in parts)
    return __import__("hashlib").sha256(raw.encode("utf-8")).hexdigest()[:16].upper()


def severity_weight(severity: str) -> int:
    return {
        "critical": 4,
        "high": 3,
        "medium": 2,
        "low": 1,
    }.get(str(severity or "").lower(), 1)


def percent_change(current: int | float, previous: int | float) -> str:
    if previous == 0:
        return "0.0" if current == 0 else "100.0"
    return f"{(((current - previous) / previous) * 100):.1f}"


def parse_es_timestamp(value: Any) -> str:
    if isinstance(value, str) and value:
        return value
    return iso(now_utc())
