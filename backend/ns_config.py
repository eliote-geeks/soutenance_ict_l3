import hashlib
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")


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


def allowed_origins() -> list[str]:
    configured = [origin.strip() for origin in os.environ.get("CORS_ORIGINS", "").split(",") if origin.strip()]
    defaults = ["http://localhost:3000", "http://127.0.0.1:3000"]
    origins: list[str] = []
    for origin in [*configured, *defaults]:
        if origin not in origins:
            origins.append(origin)
    return origins


def alert_source_type(title: str | None) -> str:
    return "ml" if "ml network anomaly" in normalize_text(title, "").lower() else "heuristic"


def alert_signature(*parts: Any) -> str:
    raw = "|".join(normalize_text(part, "").strip().lower() for part in parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16].upper()


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


START_TIME = now_utc()
ELASTICSEARCH_URL = os.environ.get("ELASTICSEARCH_URL", "").rstrip("/")
ELASTICSEARCH_USERNAME = os.environ.get("ELASTICSEARCH_USERNAME")
ELASTICSEARCH_PASSWORD = os.environ.get("ELASTICSEARCH_PASSWORD")
ELASTICSEARCH_API_KEY = os.environ.get("ELASTICSEARCH_API_KEY")
ELASTICSEARCH_VERIFY_TLS = os.environ.get("ELASTICSEARCH_VERIFY_TLS", "true").lower() == "true"
FILEBEAT_INDEX = os.environ.get("FILEBEAT_INDEX", "filebeat-*")
PACKETBEAT_INDEX = os.environ.get("PACKETBEAT_INDEX", "packetbeat-*")
METRICBEAT_INDEX = os.environ.get("METRICBEAT_INDEX", ".ds-metricbeat-*")
AI_ALERTS_INDEX = os.environ.get("AI_ALERTS_INDEX", "ai-alerts-*")
AI_SERVICE_URL = os.environ.get("AI_SERVICE_URL", "").rstrip("/")
INGEST_AI_ALERTS_INDEX = os.environ.get("INGEST_AI_ALERTS_INDEX", "ai-alerts-manual")
PROFILES_INDEX = os.environ.get("PROFILES_INDEX", "netsentinel-profiles")
ASSETS_INDEX = os.environ.get("ASSETS_INDEX", "netsentinel-assets")
PROFILE_ASSETS_INDEX = os.environ.get("PROFILE_ASSETS_INDEX", "netsentinel-profile-assets")
AGENT_TOKENS_INDEX = os.environ.get("AGENT_TOKENS_INDEX", "netsentinel-agent-enrollment-tokens")
AGENT_INSTANCES_INDEX = os.environ.get("AGENT_INSTANCES_INDEX", "netsentinel-agent-instances")
ADMIN_API_SECRET = os.environ.get("ADMIN_API_SECRET", "netsentinel-admin-dev-secret")
NETSENTINEL_API_URL = os.environ.get("NETSENTINEL_API_URL", "http://127.0.0.1:8010").rstrip("/")
AGENT_ELASTIC_API_KEY = os.environ.get("AGENT_ELASTIC_API_KEY")
ALLOW_AGENT_BASIC_AUTH = os.environ.get("ALLOW_AGENT_BASIC_AUTH", "false").lower() == "true"
