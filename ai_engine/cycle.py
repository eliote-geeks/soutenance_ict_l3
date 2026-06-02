"""
cycle.py
--------
Detection cycle orchestrator for the AI Engine.

run_detection_cycle() is the single entry point called by /run-once.
It coordinates all modules in the correct order:
  1. Fetch data from Elasticsearch
  2. Build feature rows
  3. Run all detectors (heuristics + ML)
  4. Deduplicate findings
  5. Publish to backend
  6. Auto-block critical threats

To add a new detector: import it and add it to the findings list below.
"""

from typing import Any

from .config import LOOKBACK_MINUTES, ML_BUCKET_MINUTES, ML_HISTORY_HOURS
from .elastic import filebeat_hits, packetbeat_hits
from .features import aggregate_current_features, aggregate_historical_windows, aggregate_flow_features
from .heuristics import (
    detect_dns_anomaly,
    detect_lateral_movement,
    detect_port_scan,
    detect_privilege_escalation,
    detect_ssh_bruteforce,
)
from .ml_models import detect_ml_anomalies, detect_rf_attacks
from .prevention import auto_block_if_critical
from .publisher import dedup_signature, publish_findings
from .schemas import FindingPayload

try:
    from .ml_models import SKLEARN_AVAILABLE
except ImportError:
    SKLEARN_AVAILABLE = False


def run_detection_cycle() -> dict[str, Any]:
    """
    Run a full detection cycle and return a summary dict.

    Steps:
      1. Fetch current-window data from Filebeat + Packetbeat
      2. Fetch historical data for ML baseline
      3. Build feature rows from raw hits
      4. Run heuristic detectors
      5. Run ML detectors (IsolationForest + RandomForest)
      6. Deduplicate all findings
      7. Publish unique findings to backend
      8. Auto-block critical source IPs
    """

    # ------------------------------------------------------------------
    # 1. Fetch current window data
    # ------------------------------------------------------------------
    log_hits = filebeat_hits(minutes=LOOKBACK_MINUTES, size=1000)
    network_hits = packetbeat_hits(minutes=LOOKBACK_MINUTES, size=2000)

    # ------------------------------------------------------------------
    # 2. Fetch historical data (for ML baseline)
    # ------------------------------------------------------------------
    history_minutes = ML_HISTORY_HOURS * 60
    history_log_hits = filebeat_hits(minutes=history_minutes, size=5000)
    history_network_hits = packetbeat_hits(minutes=history_minutes, size=8000)

    # ------------------------------------------------------------------
    # 3. Build feature rows
    # ------------------------------------------------------------------
    current_rows = aggregate_current_features(log_hits, network_hits)
    history_rows = aggregate_historical_windows(
        history_log_hits, history_network_hits, ML_BUCKET_MINUTES
    )
    # Flow-level features for RandomForest (CICIDS-compatible)
    flow_rows = aggregate_flow_features(network_hits)

    # ------------------------------------------------------------------
    # 4 & 5. Run all detectors
    # ------------------------------------------------------------------
    findings: list[FindingPayload] = []

    # --- Heuristic detectors (rule-based, no ML) ---
    findings.extend(detect_ssh_bruteforce(current_rows))
    findings.extend(detect_dns_anomaly(current_rows))
    findings.extend(detect_port_scan(current_rows))
    findings.extend(detect_privilege_escalation(log_hits))
    findings.extend(detect_lateral_movement(current_rows))

    # --- ML detectors ---
    findings.extend(detect_ml_anomalies(current_rows, history_rows))
    findings.extend(detect_rf_attacks(current_rows, flow_rows))

    # ------------------------------------------------------------------
    # 6. Deduplicate (same signature = same finding, keep first)
    # ------------------------------------------------------------------
    seen: set[str] = set()
    unique: list[FindingPayload] = []
    for finding in findings:
        key = dedup_signature(finding)
        if key not in seen:
            seen.add(key)
            unique.append(finding)

    # ------------------------------------------------------------------
    # 7. Publish unique findings to the backend
    # ------------------------------------------------------------------
    published = publish_findings(unique) if unique else []

    # ------------------------------------------------------------------
    # 8. Auto-block critical source IPs
    # ------------------------------------------------------------------
    blocked = auto_block_if_critical(unique)

    # ------------------------------------------------------------------
    # Return cycle summary
    # ------------------------------------------------------------------
    return {
        "lookbackMinutes": LOOKBACK_MINUTES,
        "filebeatDocuments": len(log_hits),
        "packetbeatDocuments": len(network_hits),
        "featureRows": len(current_rows),
        "flowRows": len(flow_rows),
        "historyRows": len(history_rows),
        "findingsDetected": len(unique),
        "findingsByDetector": _count_by_detector(unique),
        "published": published,
        "autoBlocked": blocked,
        "mlEnabled": SKLEARN_AVAILABLE,
    }


def _count_by_detector(findings: list[FindingPayload]) -> dict[str, int]:
    """Return a count of findings grouped by detector type (for the summary)."""
    counts: dict[str, int] = {}
    for f in findings:
        if "Random Forest" in f.title:
            key = "random_forest"
        elif "ML network anomaly" in f.title:
            key = "isolation_forest"
        elif "SSH" in f.title:
            key = "heuristic_ssh"
        elif "DNS" in f.title:
            key = "heuristic_dns"
        elif "Port scan" in f.title:
            key = "heuristic_port_scan"
        elif "Privilege" in f.title:
            key = "heuristic_privilege_escalation"
        elif "Lateral" in f.title:
            key = "heuristic_lateral_movement"
        else:
            key = "other"
        counts[key] = counts.get(key, 0) + 1
    return counts