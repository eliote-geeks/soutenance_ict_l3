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


ELASTICSEARCH_URL = os.environ.get("ELASTICSEARCH_URL", "").rstrip("/")
ELASTICSEARCH_USERNAME = os.environ.get("ELASTICSEARCH_USERNAME")
ELASTICSEARCH_PASSWORD = os.environ.get("ELASTICSEARCH_PASSWORD")
ELASTICSEARCH_API_KEY = os.environ.get("ELASTICSEARCH_API_KEY")
ELASTICSEARCH_VERIFY_TLS = os.environ.get("ELASTICSEARCH_VERIFY_TLS", "true").lower() == "true"
FILEBEAT_INDEX = os.environ.get("FILEBEAT_INDEX", "filebeat-*")
PACKETBEAT_INDEX = os.environ.get("PACKETBEAT_INDEX", "packetbeat-*")
NETSENTINEL_BACKEND_URL = os.environ.get("NETSENTINEL_BACKEND_URL", "http://127.0.0.1:8010").rstrip("/")
LOOKBACK_MINUTES = int(os.environ.get("LOOKBACK_MINUTES", "10"))
SSH_FAILURE_THRESHOLD = int(os.environ.get("SSH_FAILURE_THRESHOLD", "8"))
DNS_ANOMALY_THRESHOLD = int(os.environ.get("DNS_ANOMALY_THRESHOLD", "20"))
PORT_SCAN_DISTINCT_PORT_THRESHOLD = int(os.environ.get("PORT_SCAN_DISTINCT_PORT_THRESHOLD", "12"))
FINDING_SUPPRESSION_MINUTES = int(os.environ.get("FINDING_SUPPRESSION_MINUTES", "60"))
ML_HISTORY_HOURS = int(os.environ.get("ML_HISTORY_HOURS", "24"))
ML_BUCKET_MINUTES = int(os.environ.get("ML_BUCKET_MINUTES", "15"))
ML_MIN_SAMPLES = int(os.environ.get("ML_MIN_SAMPLES", "10"))
ML_CONTAMINATION = float(os.environ.get("ML_CONTAMINATION", "0.12"))
ML_RANDOM_STATE = int(os.environ.get("ML_RANDOM_STATE", "42"))
RF_MIN_SAMPLES = int(os.environ.get("RF_MIN_SAMPLES", "24"))
RF_MIN_POSITIVE_SAMPLES = int(os.environ.get("RF_MIN_POSITIVE_SAMPLES", "6"))
RF_ALERT_PROBABILITY = float(os.environ.get("RF_ALERT_PROBABILITY", "0.72"))
ATTACK_DICT_SOURCE_URL = os.environ.get(
    "ATTACK_DICT_SOURCE_URL",
    "https://raw.githubusercontent.com/mitre-attack/attack-stix-data/master/enterprise-attack/enterprise-attack.json",
)
STATE_DIR = Path(os.environ.get("STATE_DIR", str(ROOT_DIR / "state")))
STATE_FILE = STATE_DIR / "finding_state.json"
ATTACK_DICT_FILE = STATE_DIR / "attack_dictionary_enterprise.json"
