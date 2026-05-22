"""
config.py
---------
All environment variables and path constants for the AI Engine.
Every other module imports from here — never call os.environ.get() elsewhere.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

# ---------------------------------------------------------------------------
# Load .env file from the same directory as this file
# ---------------------------------------------------------------------------
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ---------------------------------------------------------------------------
# Elasticsearch connection
# ---------------------------------------------------------------------------
ELASTICSEARCH_URL: str = os.environ.get("ELASTICSEARCH_URL", "").rstrip("/")
ELASTICSEARCH_USERNAME: str | None = os.environ.get("ELASTICSEARCH_USERNAME")
ELASTICSEARCH_PASSWORD: str | None = os.environ.get("ELASTICSEARCH_PASSWORD")
ELASTICSEARCH_API_KEY: str | None = os.environ.get("ELASTICSEARCH_API_KEY")
ELASTICSEARCH_VERIFY_TLS: bool = (
    os.environ.get("ELASTICSEARCH_VERIFY_TLS", "true").lower() == "true"
)

# ---------------------------------------------------------------------------
# Elasticsearch index names
# ---------------------------------------------------------------------------
FILEBEAT_INDEX: str = os.environ.get("FILEBEAT_INDEX", "filebeat-*")
PACKETBEAT_INDEX: str = os.environ.get("PACKETBEAT_INDEX", "packetbeat-*")

# ---------------------------------------------------------------------------
# Backend API (NetSentinel main API — receives findings from this engine)
# ---------------------------------------------------------------------------
NETSENTINEL_BACKEND_URL: str = os.environ.get(
    "NETSENTINEL_BACKEND_URL", "http://127.0.0.1:8010"
).rstrip("/")

# ---------------------------------------------------------------------------
# Detection window & heuristic thresholds
# ---------------------------------------------------------------------------
LOOKBACK_MINUTES: int = int(os.environ.get("LOOKBACK_MINUTES", "10"))
SSH_FAILURE_THRESHOLD: int = int(os.environ.get("SSH_FAILURE_THRESHOLD", "8"))
DNS_ANOMALY_THRESHOLD: int = int(os.environ.get("DNS_ANOMALY_THRESHOLD", "20"))
PORT_SCAN_DISTINCT_PORT_THRESHOLD: int = int(
    os.environ.get("PORT_SCAN_DISTINCT_PORT_THRESHOLD", "12")
)
LATERAL_MOVEMENT_HOST_THRESHOLD: int = int(
    os.environ.get("LATERAL_MOVEMENT_HOST_THRESHOLD", "5")
)
PRIVILEGE_ESCALATION_EVENT_THRESHOLD: int = int(
    os.environ.get("PRIVILEGE_ESCALATION_EVENT_THRESHOLD", "3")
)

# ---------------------------------------------------------------------------
# Finding deduplication window
# ---------------------------------------------------------------------------
FINDING_SUPPRESSION_MINUTES: int = int(
    os.environ.get("FINDING_SUPPRESSION_MINUTES", "60")
)

# ---------------------------------------------------------------------------
# ML / IsolationForest settings
# ---------------------------------------------------------------------------
ML_HISTORY_HOURS: int = int(os.environ.get("ML_HISTORY_HOURS", "24"))
ML_BUCKET_MINUTES: int = int(os.environ.get("ML_BUCKET_MINUTES", "15"))
ML_MIN_SAMPLES: int = int(os.environ.get("ML_MIN_SAMPLES", "10"))
ML_CONTAMINATION: float = float(os.environ.get("ML_CONTAMINATION", "0.12"))
ML_RANDOM_STATE: int = int(os.environ.get("ML_RANDOM_STATE", "42"))

# ---------------------------------------------------------------------------
# Prevention / auto-block
# ---------------------------------------------------------------------------
AUTO_BLOCK_ENABLED: bool = (
    os.environ.get("AUTO_BLOCK_ENABLED", "true").lower() == "true"
)
AUTO_BLOCK_SEVERITIES: set[str] = {"critical"}

# ---------------------------------------------------------------------------
# File system paths
# ---------------------------------------------------------------------------
STATE_DIR: Path = Path(os.environ.get("STATE_DIR", str(ROOT_DIR / "state")))
STATE_FILE: Path = STATE_DIR / "finding_state.json"
MODEL_DIR: Path = STATE_DIR / "models"

# Isolation Forest saved model paths
IFOREST_MODEL_PATH: Path = MODEL_DIR / "isolation_forest.pkl"
IFOREST_SCALER_PATH: Path = MODEL_DIR / "iforest_scaler.pkl"

# Random Forest saved model paths
RF_MODEL_PATH: Path = MODEL_DIR / "random_forest.pkl"
RF_SCALER_PATH: Path = MODEL_DIR / "rf_scaler.pkl"