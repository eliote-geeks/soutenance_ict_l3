import os
from pathlib import Path

from dotenv import load_dotenv

from .utils import now_utc

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

START_TIME = now_utc()

ELASTICSEARCH_URL = os.environ.get("ELASTICSEARCH_URL", "").rstrip("/")
ELASTICSEARCH_USERNAME = os.environ.get("ELASTICSEARCH_USERNAME")
ELASTICSEARCH_PASSWORD = os.environ.get("ELASTICSEARCH_PASSWORD")
ELASTICSEARCH_API_KEY = os.environ.get("ELASTICSEARCH_API_KEY")
ELASTICSEARCH_VERIFY_TLS = os.environ.get("ELASTICSEARCH_VERIFY_TLS", "true").lower() == "true"
AGENT_ELASTIC_API_KEY = os.environ.get("AGENT_ELASTIC_API_KEY")
ALLOW_AGENT_BASIC_AUTH = os.environ.get("ALLOW_AGENT_BASIC_AUTH", "false").lower() == "true"
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
IP_BLOCKS_INDEX = os.environ.get("IP_BLOCKS_INDEX", "netsentinel-ip-blocks")

# Reponse automatique : blocage temporaire des IP a l'origine d'une menace
# critique. La duree limitee est un garde-fou contre les faux positifs.
AUTO_BLOCK_ENABLED = os.environ.get("AUTO_BLOCK_ENABLED", "true").lower() not in {"0", "false", "no"}
BLOCK_DURATION_MINUTES = int(os.environ.get("BLOCK_DURATION_MINUTES", "30"))
BLOCK_EXPIRY_SWEEP_SECONDS = int(os.environ.get("BLOCK_EXPIRY_SWEEP_SECONDS", "60"))
ADMIN_API_SECRET = os.environ.get("ADMIN_API_SECRET", "1234")
NETSENTINEL_API_URL = os.environ.get("NETSENTINEL_API_URL", "http://127.0.0.1:8010").rstrip("/")


def current_admin_api_secret() -> str:
    return os.environ.get("ADMIN_API_SECRET", ADMIN_API_SECRET)


def allowed_origins() -> list[str]:
    configured = [origin.strip() for origin in os.environ.get("CORS_ORIGINS", "").split(",") if origin.strip()]
    defaults = ["http://localhost:3000", "http://127.0.0.1:3000"]
    origins: list[str] = []
    for origin in [*configured, *defaults]:
        if origin not in origins:
            origins.append(origin)
    return origins
