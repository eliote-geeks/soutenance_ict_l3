"""
utils.py
--------
Shared pure helper functions used across all ai_engine modules.
No imports from other project modules — only stdlib and third-party.
"""

from datetime import datetime, timezone
from typing import Any


def now_utc() -> datetime:
    """Return the current UTC datetime (timezone-aware)."""
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    """Convert a datetime to an ISO 8601 string in UTC."""
    return dt.astimezone(timezone.utc).isoformat()


def parse_dt(value: Any) -> datetime:
    """
    Safely parse a datetime string into a timezone-aware datetime.
    Falls back to now_utc() if the value is missing or unparseable.
    """
    if isinstance(value, str) and value:
        normalized = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized)
        except ValueError:
            pass
    return now_utc()