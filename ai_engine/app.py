"""
main.py
-------
AI Engine entry point.

This file is intentionally thin — it only:
  1. Creates the FastAPI app
  2. Defines the 3 API endpoints (/health, /status, /run-once)
  3. Delegates all logic to the appropriate module

Run with:
  uvicorn main:app --host 0.0.0.0 --port 9000 --reload
"""

from fastapi import FastAPI

from .config import (
    ELASTICSEARCH_URL,
    FINDING_SUPPRESSION_MINUTES,
    LOOKBACK_MINUTES,
    ML_BUCKET_MINUTES,
    ML_CONTAMINATION,
    ML_HISTORY_HOURS,
    ML_MIN_SAMPLES,
    NETSENTINEL_BACKEND_URL,
    PORT_SCAN_DISTINCT_PORT_THRESHOLD,
    DNS_ANOMALY_THRESHOLD,
    SSH_FAILURE_THRESHOLD,
)
from .cycle import run_detection_cycle

try:
    from .ml_models import SKLEARN_AVAILABLE
except ImportError:
    SKLEARN_AVAILABLE = False

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = FastAPI(
    title="NetSentinel AI Engine",
    version="0.3.0",
    description="Threat detection engine: heuristics + IsolationForest + RandomForest",
)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/health")
async def health():
    """Basic liveness check."""
    return {
        "status": "ok",
        "elasticUrl": ELASTICSEARCH_URL,
        "backendUrl": NETSENTINEL_BACKEND_URL,
        "mlEnabled": SKLEARN_AVAILABLE,
    }


@app.get("/status")
async def status():
    """Return current configuration and thresholds."""
    return {
        "lookbackMinutes": LOOKBACK_MINUTES,
        "dedupWindowMinutes": FINDING_SUPPRESSION_MINUTES,
        "thresholds": {
            "sshFailure": SSH_FAILURE_THRESHOLD,
            "dnsAnomaly": DNS_ANOMALY_THRESHOLD,
            "portScanDistinctPorts": PORT_SCAN_DISTINCT_PORT_THRESHOLD,
        },
        "ml": {
            "enabled": SKLEARN_AVAILABLE,
            "historyHours": ML_HISTORY_HOURS,
            "bucketMinutes": ML_BUCKET_MINUTES,
            "minSamples": ML_MIN_SAMPLES,
            "contamination": ML_CONTAMINATION,
        },
    }


@app.post("/run-once")
async def run_once():
    """
    Trigger one detection cycle manually.
    In production this is called on a schedule (e.g. every 60 seconds via cron or APScheduler).
    """
    return run_detection_cycle()