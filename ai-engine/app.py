import hashlib
import ipaddress
import json
import os
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests
from dotenv import load_dotenv
from fastapi import FastAPI
from pydantic import BaseModel

try:
    from sklearn.ensemble import IsolationForest
except Exception:  # pragma: no cover - optional dependency at runtime
    IsolationForest = None


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

app = FastAPI(title="NetSentinel AI Engine", version="0.2.0")

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
STATE_DIR = Path(os.environ.get("STATE_DIR", str(ROOT_DIR / "state")))
STATE_FILE = STATE_DIR / "finding_state.json"


class FindingPayload(BaseModel):
    title: str
    severity: str
    description: str
    recommendation: str
    source_ip: str | None = None
    destination_ip: str | None = None
    hostname: str | None = None
    mitre_tactic: str | None = None
    confidence: float | None = None
    playbook: str | None = None
    status: str = "open"


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


def elastic_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if ELASTICSEARCH_API_KEY:
        headers["Authorization"] = f"ApiKey {ELASTICSEARCH_API_KEY}"
    return headers


def elastic_auth() -> tuple[str, str] | None:
    if ELASTICSEARCH_API_KEY:
        return None
    if ELASTICSEARCH_USERNAME and ELASTICSEARCH_PASSWORD:
        return (ELASTICSEARCH_USERNAME, ELASTICSEARCH_PASSWORD)
    return None


def elastic_request(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    response = requests.get(
        f"{ELASTICSEARCH_URL}{path}",
        json=payload,
        headers=elastic_headers(),
        auth=elastic_auth(),
        timeout=12,
        verify=ELASTICSEARCH_VERIFY_TLS,
    )
    response.raise_for_status()
    return response.json()


def backend_post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    response = requests.post(
        f"{NETSENTINEL_BACKEND_URL}{path}",
        json=payload,
        timeout=12,
    )
    response.raise_for_status()
    return response.json()


def lookback_gte(minutes: int) -> str:
    return iso(now_utc() - timedelta(minutes=minutes))


def filebeat_hits(minutes: int = LOOKBACK_MINUTES, size: int = 500) -> list[dict[str, Any]]:
    payload = {
        "size": size,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "_source": [
            "@timestamp",
            "message",
            "kubernetes.pod.name",
            "kubernetes.namespace",
            "source.ip",
            "host.name",
            "stream",
        ],
        "query": {
            "range": {
                "@timestamp": {
                    "gte": lookback_gte(minutes)
                }
            }
        },
    }
    result = elastic_request(f"/{FILEBEAT_INDEX}/_search", payload)
    return (((result.get("hits") or {}).get("hits")) or [])


def packetbeat_hits(minutes: int = LOOKBACK_MINUTES, size: int = 1000) -> list[dict[str, Any]]:
    payload = {
        "size": size,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "_source": [
            "@timestamp",
            "source.ip",
            "destination.ip",
            "destination.port",
            "network.protocol",
            "event.dataset",
            "query",
            "status",
            "host.name",
            "url.path",
        ],
        "query": {
            "range": {
                "@timestamp": {
                    "gte": lookback_gte(minutes)
                }
            }
        },
    }
    result = elastic_request(f"/{PACKETBEAT_INDEX}/_search", payload)
    return (((result.get("hits") or {}).get("hits")) or [])


def safe_source_ip(source: dict[str, Any]) -> str | None:
    return (source.get("source") or {}).get("ip")


def safe_dest_ip(source: dict[str, Any]) -> str | None:
    return (source.get("destination") or {}).get("ip")


def safe_host(source: dict[str, Any]) -> str | None:
    return (source.get("host") or {}).get("name")


def is_internal_ip(value: str | None) -> bool:
    if not value:
        return False
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback or ip.is_link_local


def dedup_signature(finding: FindingPayload) -> str:
    payload = "|".join(
        [
            finding.title.strip().lower(),
            (finding.source_ip or "").strip().lower(),
            (finding.destination_ip or "").strip().lower(),
            (finding.hostname or "").strip().lower(),
            (finding.mitre_tactic or "").strip().lower(),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def load_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return {"published": {}}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"published": {}}


def save_state(state: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=True, indent=2), encoding="utf-8")


def prune_state(state: dict[str, Any]) -> dict[str, Any]:
    published = state.get("published") or {}
    cutoff = now_utc() - timedelta(days=7)
    fresh = {}
    for signature, payload in published.items():
        last_seen = parse_dt((payload or {}).get("last_published_at"))
        if last_seen >= cutoff:
            fresh[signature] = payload
    state["published"] = fresh
    return state


def should_publish(finding: FindingPayload, state: dict[str, Any]) -> bool:
    signature = dedup_signature(finding)
    last = ((state.get("published") or {}).get(signature) or {}).get("last_published_at")
    if not last:
        return True
    return parse_dt(last) < now_utc() - timedelta(minutes=FINDING_SUPPRESSION_MINUTES)


def mark_published(finding: FindingPayload, state: dict[str, Any]) -> None:
    signature = dedup_signature(finding)
    state.setdefault("published", {})[signature] = {
        "last_published_at": iso(now_utc()),
        "title": finding.title,
        "source_ip": finding.source_ip,
        "hostname": finding.hostname,
    }


def confidence_from_ratio(observed: int, threshold: int, floor: float, ceiling: float) -> float:
    if threshold <= 0:
        return ceiling
    ratio = observed / threshold
    scaled = floor + min(max(ratio - 1, 0), 2) * ((ceiling - floor) / 2)
    return round(min(ceiling, max(floor, scaled)), 2)


def severity_from_confidence(confidence: float) -> str:
    if confidence >= 0.9:
        return "critical"
    if confidence >= 0.78:
        return "high"
    if confidence >= 0.62:
        return "medium"
    return "low"


def aggregate_current_features(log_hits: list[dict[str, Any]], packet_hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    features: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "source_ip": None,
            "hostname": None,
            "failed_logins": 0,
            "dns_errors": 0,
            "distinct_ports": set(),
            "distinct_destinations": set(),
            "event_count": 0,
            "protocols": set(),
            "http_paths": set(),
        }
    )

    for hit in log_hits:
        source = hit.get("_source", {})
        message = str(source.get("message", ""))
        ip = safe_source_ip(source)
        if not ip:
            parts = message.split()
            for idx, token in enumerate(parts):
                if token == "from" and idx + 1 < len(parts):
                    ip = parts[idx + 1]
                    break
        if not ip:
            continue
        row = features[ip]
        row["source_ip"] = ip
        row["hostname"] = row["hostname"] or safe_host(source)
        row["event_count"] += 1
        if "Failed password" in message or "Invalid user" in message:
            row["failed_logins"] += 1

    for hit in packet_hits:
        source = hit.get("_source", {})
        ip = safe_source_ip(source)
        if not ip:
            continue
        row = features[ip]
        row["source_ip"] = ip
        row["hostname"] = row["hostname"] or safe_host(source)
        row["event_count"] += 1
        dst_port = (source.get("destination") or {}).get("port")
        dst_ip = safe_dest_ip(source)
        protocol = (source.get("network") or {}).get("protocol")
        if dst_port:
            row["distinct_ports"].add(int(dst_port))
        if dst_ip:
            row["distinct_destinations"].add(dst_ip)
        if protocol:
            row["protocols"].add(protocol)
        if source.get("status") == "Error" and protocol == "dns":
            row["dns_errors"] += 1
        path = (source.get("url") or {}).get("path")
        if path:
            row["http_paths"].add(path)

    aggregated = []
    for row in features.values():
        aggregated.append(
            {
                "source_ip": row["source_ip"],
                "hostname": row["hostname"],
                "failed_logins": row["failed_logins"],
                "dns_errors": row["dns_errors"],
                "distinct_ports": len(row["distinct_ports"]),
                "distinct_destinations": len(row["distinct_destinations"]),
                "event_count": row["event_count"],
                "protocol_count": len(row["protocols"]),
                "http_path_count": len(row["http_paths"]),
                "is_internal": is_internal_ip(row["source_ip"]),
            }
        )
    return aggregated


def aggregate_historical_windows(log_hits: list[dict[str, Any]], packet_hits: list[dict[str, Any]], bucket_minutes: int) -> list[dict[str, Any]]:
    buckets: dict[tuple[str, datetime], dict[str, Any]] = defaultdict(
        lambda: {
            "failed_logins": 0,
            "dns_errors": 0,
            "distinct_ports": set(),
            "distinct_destinations": set(),
            "event_count": 0,
            "protocols": set(),
            "http_paths": set(),
            "hostname": None,
        }
    )

    def bucket_for(ts: Any) -> datetime:
        dt = parse_dt(ts).astimezone(timezone.utc)
        floored_minute = (dt.minute // bucket_minutes) * bucket_minutes
        return dt.replace(minute=floored_minute, second=0, microsecond=0)

    for hit in log_hits:
        source = hit.get("_source", {})
        message = str(source.get("message", ""))
        ip = safe_source_ip(source)
        if not ip and ("Failed password" in message or "Invalid user" in message):
            parts = message.split()
            for idx, token in enumerate(parts):
                if token == "from" and idx + 1 < len(parts):
                    ip = parts[idx + 1]
                    break
        if not ip:
            continue
        key = (ip, bucket_for(source.get("@timestamp")))
        row = buckets[key]
        row["hostname"] = row["hostname"] or safe_host(source)
        row["event_count"] += 1
        if "Failed password" in message or "Invalid user" in message:
            row["failed_logins"] += 1

    for hit in packet_hits:
        source = hit.get("_source", {})
        ip = safe_source_ip(source)
        if not ip:
            continue
        key = (ip, bucket_for(source.get("@timestamp")))
        row = buckets[key]
        row["hostname"] = row["hostname"] or safe_host(source)
        row["event_count"] += 1
        protocol = (source.get("network") or {}).get("protocol")
        dst_port = (source.get("destination") or {}).get("port")
        dst_ip = safe_dest_ip(source)
        if protocol:
            row["protocols"].add(protocol)
        if dst_port:
            row["distinct_ports"].add(int(dst_port))
        if dst_ip:
            row["distinct_destinations"].add(dst_ip)
        if source.get("status") == "Error" and protocol == "dns":
            row["dns_errors"] += 1
        path = (source.get("url") or {}).get("path")
        if path:
            row["http_paths"].add(path)

    windows = []
    for (ip, bucket), row in buckets.items():
        windows.append(
            {
                "source_ip": ip,
                "bucket_start": iso(bucket),
                "hostname": row["hostname"],
                "failed_logins": row["failed_logins"],
                "dns_errors": row["dns_errors"],
                "distinct_ports": len(row["distinct_ports"]),
                "distinct_destinations": len(row["distinct_destinations"]),
                "event_count": row["event_count"],
                "protocol_count": len(row["protocols"]),
                "http_path_count": len(row["http_paths"]),
                "is_internal": is_internal_ip(ip),
            }
        )
    return windows


def feature_vector(row: dict[str, Any]) -> list[float]:
    return [
        float(row["failed_logins"]),
        float(row["dns_errors"]),
        float(row["distinct_ports"]),
        float(row["distinct_destinations"]),
        float(row["event_count"]),
        float(row["protocol_count"]),
        float(row["http_path_count"]),
        1.0 if row["is_internal"] else 0.0,
    ]


def detect_ssh_bruteforce(feature_rows: list[dict[str, Any]]) -> list[FindingPayload]:
    findings = []
    for row in feature_rows:
        count = int(row["failed_logins"])
        if count < SSH_FAILURE_THRESHOLD:
            continue
        confidence = confidence_from_ratio(count, SSH_FAILURE_THRESHOLD, 0.74, 0.97)
        findings.append(
            FindingPayload(
                title="SSH brute force suspected",
                severity=severity_from_confidence(confidence),
                description=f"{count} failed SSH authentications observed in the last {LOOKBACK_MINUTES} minutes from {row['source_ip']}.",
                recommendation="Block the source IP, enforce SSH key authentication and review auth logs for account targeting.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Credential Access",
                confidence=confidence,
                playbook="Inspect /var/log/auth.log, validate fail2ban bans, disable password authentication and rotate exposed credentials.",
            )
        )
    return findings


def detect_dns_anomaly(feature_rows: list[dict[str, Any]]) -> list[FindingPayload]:
    findings = []
    for row in feature_rows:
        count = int(row["dns_errors"])
        if count < DNS_ANOMALY_THRESHOLD:
            continue
        confidence = confidence_from_ratio(count, DNS_ANOMALY_THRESHOLD, 0.62, 0.9)
        findings.append(
            FindingPayload(
                title="DNS anomaly burst detected",
                severity=severity_from_confidence(confidence),
                description=f"{count} DNS errors observed from {row['source_ip']} in the last {LOOKBACK_MINUTES} minutes.",
                recommendation="Inspect the querying workload, review DNS resolution failures and isolate the host if the burst persists.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Command and Control",
                confidence=confidence,
                playbook="Review queried domains, inspect the originating process and compare with normal DNS behavior.",
            )
        )
    return findings


def detect_port_scan(feature_rows: list[dict[str, Any]]) -> list[FindingPayload]:
    findings = []
    for row in feature_rows:
        distinct_ports = int(row["distinct_ports"])
        if distinct_ports < PORT_SCAN_DISTINCT_PORT_THRESHOLD:
            continue
        confidence = confidence_from_ratio(distinct_ports, PORT_SCAN_DISTINCT_PORT_THRESHOLD, 0.68, 0.93)
        findings.append(
            FindingPayload(
                title="Port scan behavior suspected",
                severity=severity_from_confidence(confidence),
                description=f"{distinct_ports} distinct destination ports contacted by {row['source_ip']} in the last {LOOKBACK_MINUTES} minutes.",
                recommendation="Block the scanner, verify exposed services and reduce the externally reachable attack surface.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Discovery",
                confidence=confidence,
                playbook="Check firewall rules, review targeted ports and confirm whether the traffic is authorized scanning.",
            )
        )
    return findings


def detect_ml_anomalies(current_rows: list[dict[str, Any]], history_rows: list[dict[str, Any]]) -> list[FindingPayload]:
    if IsolationForest is None:
        return []
    if len(history_rows) < ML_MIN_SAMPLES or not current_rows:
        return []

    model = IsolationForest(
        contamination=ML_CONTAMINATION,
        random_state=ML_RANDOM_STATE,
        n_estimators=200,
    )
    train_vectors = [feature_vector(row) for row in history_rows]
    model.fit(train_vectors)

    findings = []
    predictions = model.predict([feature_vector(row) for row in current_rows])
    scores = model.score_samples([feature_vector(row) for row in current_rows])
    min_score = min(scores) if len(scores) else -1.0
    max_score = max(scores) if len(scores) else 0.0

    for row, prediction, score in zip(current_rows, predictions, scores):
        if prediction != -1:
            continue
        span = max(max_score - min_score, 1e-6)
        anomaly_strength = (max_score - score) / span
        confidence = round(min(0.97, 0.58 + anomaly_strength * 0.34), 2)
        findings.append(
            FindingPayload(
                title="ML network anomaly detected",
                severity=severity_from_confidence(confidence),
                description=(
                    f"IsolationForest flagged {row['source_ip']} as an outlier on the live feature window "
                    f"(events={row['event_count']}, ports={row['distinct_ports']}, dns_errors={row['dns_errors']})."
                ),
                recommendation="Correlate this outlier with packet captures, system logs and neighboring hosts before containment.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Discovery" if row["distinct_ports"] >= row["dns_errors"] else "Command and Control",
                confidence=confidence,
                playbook="Review the source host context, compare against baseline behavior and escalate if the anomaly repeats.",
            )
        )
    return findings


def publish_findings(findings: list[FindingPayload]) -> list[dict[str, Any]]:
    published = []
    state = prune_state(load_state())
    for finding in findings:
        if not should_publish(finding, state):
            continue
        response = backend_post("/api/ai/findings", finding.model_dump())
        published.append(response)
        mark_published(finding, state)
    save_state(state)
    return published


def run_detection_cycle() -> dict[str, Any]:
    log_hits = filebeat_hits(minutes=LOOKBACK_MINUTES, size=1000)
    network_hits = packetbeat_hits(minutes=LOOKBACK_MINUTES, size=2000)
    current_rows = aggregate_current_features(log_hits, network_hits)

    history_minutes = ML_HISTORY_HOURS * 60
    history_log_hits = filebeat_hits(minutes=history_minutes, size=5000)
    history_network_hits = packetbeat_hits(minutes=history_minutes, size=8000)
    history_rows = aggregate_historical_windows(history_log_hits, history_network_hits, ML_BUCKET_MINUTES)

    findings: list[FindingPayload] = []
    findings.extend(detect_ssh_bruteforce(current_rows))
    findings.extend(detect_dns_anomaly(current_rows))
    findings.extend(detect_port_scan(current_rows))
    findings.extend(detect_ml_anomalies(current_rows, history_rows))

    unique = []
    seen = set()
    for finding in findings:
        key = dedup_signature(finding)
        if key in seen:
            continue
        seen.add(key)
        unique.append(finding)

    published = publish_findings(unique) if unique else []
    return {
        "lookbackMinutes": LOOKBACK_MINUTES,
        "filebeatDocuments": len(log_hits),
        "packetbeatDocuments": len(network_hits),
        "featureRows": len(current_rows),
        "historyRows": len(history_rows),
        "findingsDetected": len(unique),
        "published": published,
        "mlEnabled": IsolationForest is not None,
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "elasticUrl": ELASTICSEARCH_URL,
        "backendUrl": NETSENTINEL_BACKEND_URL,
        "mlEnabled": IsolationForest is not None,
    }


@app.get("/status")
async def status():
    return {
        "lookbackMinutes": LOOKBACK_MINUTES,
        "dedupWindowMinutes": FINDING_SUPPRESSION_MINUTES,
        "thresholds": {
            "sshFailure": SSH_FAILURE_THRESHOLD,
            "dnsAnomaly": DNS_ANOMALY_THRESHOLD,
            "portScanDistinctPorts": PORT_SCAN_DISTINCT_PORT_THRESHOLD,
        },
        "ml": {
            "enabled": IsolationForest is not None,
            "historyHours": ML_HISTORY_HOURS,
            "bucketMinutes": ML_BUCKET_MINUTES,
            "minSamples": ML_MIN_SAMPLES,
            "contamination": ML_CONTAMINATION,
        },
    }


@app.post("/run-once")
async def run_once():
    return run_detection_cycle()
