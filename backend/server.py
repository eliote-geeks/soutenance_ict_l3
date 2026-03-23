import ipaddress
import hashlib
import os
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any
import uuid

from dotenv import load_dotenv
from fastapi import APIRouter, FastAPI
from pydantic import BaseModel
import requests
from starlette.middleware.cors import CORSMiddleware


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

app = FastAPI(title="NetSentinel AI API", version="0.1.0")
api_router = APIRouter(prefix="/api")


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


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


def allowed_origins() -> list[str]:
    configured = [origin.strip() for origin in os.environ.get("CORS_ORIGINS", "").split(",") if origin.strip()]
    defaults = ["http://localhost:3000", "http://127.0.0.1:3000"]
    origins: list[str] = []
    for origin in [*configured, *defaults]:
        if origin not in origins:
            origins.append(origin)
    return origins

HOSTS = [
    {
        "id": "host-edge-fw",
        "hostname": "edge-fw-01",
        "ip": "10.10.0.1",
        "os": "Debian 12",
        "role": "Firewall",
        "riskScore": 88,
        "criticality": "critical",
        "lastSeen": iso(now_utc() - timedelta(minutes=2)),
        "alertCount": 7,
        "status": "online",
        "agent": "installed",
    },
    {
        "id": "host-auth",
        "hostname": "auth-gateway-01",
        "ip": "10.10.0.10",
        "os": "Ubuntu 24.04",
        "role": "Authentication",
        "riskScore": 81,
        "criticality": "high",
        "lastSeen": iso(now_utc() - timedelta(minutes=4)),
        "alertCount": 5,
        "status": "online",
        "agent": "installed",
    },
    {
        "id": "host-app",
        "hostname": "app-node-01",
        "ip": "10.10.1.20",
        "os": "Ubuntu 22.04",
        "role": "Application",
        "riskScore": 63,
        "criticality": "high",
        "lastSeen": iso(now_utc() - timedelta(minutes=3)),
        "alertCount": 3,
        "status": "online",
        "agent": "installed",
    },
    {
        "id": "host-db",
        "hostname": "db-core-01",
        "ip": "10.10.2.15",
        "os": "Rocky Linux 9",
        "role": "Database",
        "riskScore": 54,
        "criticality": "critical",
        "lastSeen": iso(now_utc() - timedelta(minutes=7)),
        "alertCount": 2,
        "status": "online",
        "agent": "installed",
    },
    {
        "id": "host-lab",
        "hostname": "lab-client-07",
        "ip": "10.10.3.77",
        "os": "Windows 11",
        "role": "Workstation",
        "riskScore": 72,
        "criticality": "medium",
        "lastSeen": iso(now_utc() - timedelta(minutes=5)),
        "alertCount": 4,
        "status": "online",
        "agent": "missing",
    },
]

ALERTS = [
    {
        "id": "ALT-000101",
        "timestamp": iso(now_utc() - timedelta(minutes=9)),
        "title": "Brute force SSH detected",
        "severity": "critical",
        "status": "open",
        "sourceIP": "185.227.134.41",
        "destIP": "10.10.0.10",
        "hostname": "auth-gateway-01",
        "assignee": "SOC Analyst 1",
        "eta": "20m",
        "mitreTactic": "Credential Access",
        "description": "fail2ban and auth.log show 46 failed SSH attempts from the same source within 6 minutes.",
        "recommendation": "Ban the source IP, disable password login on SSH and verify whether any account was locked.",
        "playbook": "Check /var/log/auth.log, review fail2ban jail state, force key-only SSH and rotate exposed credentials.",
    },
    {
        "id": "ALT-000102",
        "timestamp": iso(now_utc() - timedelta(minutes=16)),
        "title": "Horizontal port scan observed",
        "severity": "high",
        "status": "investigating",
        "sourceIP": "102.219.88.14",
        "destIP": "10.10.0.1",
        "hostname": "edge-fw-01",
        "assignee": "SOC Analyst 2",
        "eta": "45m",
        "mitreTactic": "Discovery",
        "description": "Packetbeat detected one external address probing 18 ports across 7 internal assets.",
        "recommendation": "Drop the source IP on the firewall, confirm exposure of scanned ports and tighten ingress rules.",
        "playbook": "Correlate Packetbeat flows with firewall rules, validate exposed services and close unused ports.",
    },
    {
        "id": "ALT-000103",
        "timestamp": iso(now_utc() - timedelta(minutes=28)),
        "title": "Abnormal outbound DNS burst",
        "severity": "medium",
        "status": "open",
        "sourceIP": "10.10.3.77",
        "destIP": "8.8.8.8",
        "hostname": "lab-client-07",
        "assignee": "Unassigned",
        "eta": None,
        "mitreTactic": "Command and Control",
        "description": "The AI model flagged unusual DNS request volume from lab-client-07 outside normal lab hours.",
        "recommendation": "Inspect active processes on the workstation and review domains queried in the last hour.",
        "playbook": "Collect DNS history, isolate the endpoint if the burst persists and run malware triage.",
    },
    {
        "id": "ALT-000104",
        "timestamp": iso(now_utc() - timedelta(minutes=42)),
        "title": "Privilege escalation pattern",
        "severity": "high",
        "status": "resolved",
        "sourceIP": "10.10.1.20",
        "destIP": "10.10.1.20",
        "hostname": "app-node-01",
        "assignee": "SOC Lead",
        "eta": None,
        "mitreTactic": "Privilege Escalation",
        "description": "System logs show repeated sudo elevation attempts followed by a new service creation.",
        "recommendation": "Review sudoers changes, inspect new services and compare binaries against a trusted baseline.",
        "playbook": "Audit service files, validate package integrity and restore the node from a clean image if needed.",
    },
]

INCIDENTS = [
    {
        "id": "INC-00021",
        "title": "SSH brute force campaign",
        "severity": "critical",
        "status": "active",
        "createdAt": iso(now_utc() - timedelta(hours=3)),
        "updatedAt": iso(now_utc() - timedelta(minutes=11)),
        "alertCount": 3,
        "affectedHosts": 2,
        "assignee": "SOC Lead",
        "timeline": [
            {"timestamp": iso(now_utc() - timedelta(hours=3)), "action": "Brute force activity observed in auth.log"},
            {"timestamp": iso(now_utc() - timedelta(hours=2, minutes=25)), "action": "fail2ban blocked the primary source IP"},
            {"timestamp": iso(now_utc() - timedelta(hours=1, minutes=50)), "action": "Authentication policy review started"},
        ],
        "tactics": ["Credential Access", "Discovery"],
    },
    {
        "id": "INC-00022",
        "title": "DNS anomaly on lab segment",
        "severity": "medium",
        "status": "investigating",
        "createdAt": iso(now_utc() - timedelta(hours=5)),
        "updatedAt": iso(now_utc() - timedelta(minutes=35)),
        "alertCount": 2,
        "affectedHosts": 1,
        "assignee": "SOC Analyst 2",
        "timeline": [
            {"timestamp": iso(now_utc() - timedelta(hours=5)), "action": "Model flagged outbound DNS anomaly"},
            {"timestamp": iso(now_utc() - timedelta(hours=4, minutes=20)), "action": "Domain list collected for review"},
        ],
        "tactics": ["Command and Control", "Exfiltration"],
    },
]

BLOCKED_IPS = {"185.227.134.41"}
TICKETS = []
AI_FINDINGS_BUFFER = []
DEFAULT_PROFILES = [
    {"id": "profile_admin", "name": "Admin P37", "type": "user", "description": "Primary administrator asset group"},
    {"id": "profile_lab", "name": "Lab Blue Team", "type": "team", "description": "Shared classroom and lab systems"},
    {"id": "profile_dmz", "name": "DMZ Services", "type": "service", "description": "Public-facing perimeter systems"},
]
DEFAULT_ASSETS = [
    {"id": "asset_edge_fw", "hostname": "edge-fw-01", "host_id": "host-edge-fw", "ip": "10.10.0.1", "os": "Debian 12", "role": "Firewall", "site": "yaounde-lab", "environment": "prod", "tags": ["linux", "firewall", "dmz"]},
    {"id": "asset_auth", "hostname": "auth-gateway-01", "host_id": "host-auth", "ip": "10.10.0.10", "os": "Ubuntu 24.04", "role": "Authentication", "site": "yaounde-lab", "environment": "prod", "tags": ["linux", "auth", "internal"]},
    {"id": "asset_app", "hostname": "app-node-01", "host_id": "host-app", "ip": "10.10.1.20", "os": "Ubuntu 22.04", "role": "Application", "site": "yaounde-lab", "environment": "prod", "tags": ["linux", "app", "internal"]},
    {"id": "asset_db", "hostname": "db-core-01", "host_id": "host-db", "ip": "10.10.2.15", "os": "Rocky Linux 9", "role": "Database", "site": "yaounde-lab", "environment": "prod", "tags": ["linux", "database", "core"]},
    {"id": "asset_lab", "hostname": "lab-client-07", "host_id": "host-lab", "ip": "10.10.3.77", "os": "Windows 11", "role": "Workstation", "site": "yaounde-lab", "environment": "lab", "tags": ["windows", "workstation", "lab"]},
]
DEFAULT_PROFILE_ASSETS = [
    {"id": "link_admin_auth", "profile_id": "profile_admin", "asset_id": "asset_auth"},
    {"id": "link_admin_edge", "profile_id": "profile_admin", "asset_id": "asset_edge_fw"},
    {"id": "link_lab_client", "profile_id": "profile_lab", "asset_id": "asset_lab"},
    {"id": "link_dmz_edge", "profile_id": "profile_dmz", "asset_id": "asset_edge_fw"},
    {"id": "link_dmz_app", "profile_id": "profile_dmz", "asset_id": "asset_app"},
]


def elastic_configured() -> bool:
    return bool(ELASTICSEARCH_URL)


def ai_service_configured() -> bool:
    return bool(AI_SERVICE_URL)


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


def elastic_request(method: str, path: str, payload: dict | None = None) -> dict | None:
    if not elastic_configured():
        return None
    try:
        response = requests.request(
            method=method,
            url=f"{ELASTICSEARCH_URL}{path}",
            json=payload,
            headers=elastic_headers(),
            auth=elastic_auth(),
            timeout=8,
            verify=ELASTICSEARCH_VERIFY_TLS,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException:
        return None


def elastic_index_doc(index: str, doc_id: str, payload: dict[str, Any]) -> bool:
    response = elastic_request("PUT", f"/{index}/_doc/{doc_id}", payload)
    return bool(response)


def fetch_index_documents(index: str, size: int = 200) -> list[dict[str, Any]]:
    result = elastic_request(
        "GET",
        f"/{index}/_search",
        {
            "size": size,
            "sort": [{"created_at": {"order": "asc", "unmapped_type": "date"}}, {"name.keyword": {"order": "asc", "unmapped_type": "keyword"}}],
            "_source": True,
        },
    )
    hits = (((result or {}).get("hits") or {}).get("hits")) or []
    documents: list[dict[str, Any]] = []
    for hit in hits:
        source = hit.get("_source") or {}
        if "_id" not in source:
            source["id"] = source.get("id") or hit.get("_id")
        documents.append(source)
    return documents


def normalize_text(value: Any, default: str = "unknown") -> str:
    if value is None:
        return default
    return str(value)


def alert_source_type(title: str | None) -> str:
    return "ml" if "ml network anomaly" in normalize_text(title, "").lower() else "heuristic"


def alert_signature(*parts: Any) -> str:
    raw = "|".join(normalize_text(part, "").strip().lower() for part in parts)
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16].upper()


def parse_es_timestamp(value: Any) -> str:
    if isinstance(value, str) and value:
        return value
    return iso(now_utc())


def fetch_elastic_logs() -> list[dict]:
    payload = {
        "size": 25,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "_source": [
            "@timestamp",
            "message",
            "log.level",
            "log.file.path",
            "event.dataset",
            "host.name",
            "source.ip",
            "destination.ip",
            "destination.port",
            "user.name",
            "event.action",
            "event.reason",
            "kubernetes.namespace",
            "kubernetes.pod.name",
            "stream",
        ],
    }
    result = elastic_request("GET", f"/{FILEBEAT_INDEX}/_search", payload)
    hits = (((result or {}).get("hits") or {}).get("hits")) or []
    logs = []
    for index, hit in enumerate(hits, start=1):
        source = hit.get("_source", {})
        kubernetes = source.get("kubernetes") or {}
        log = source.get("log") or {}
        logs.append(
            {
                "id": hit.get("_id", f"log-{index}"),
                "timestamp": parse_es_timestamp(source.get("@timestamp")),
                "level": normalize_text(source.get("log.level"), "INFO").upper(),
                "source": normalize_text(source.get("event.dataset"), "kubernetes.container_logs"),
                "message": normalize_text(source.get("message"), "Elastic event"),
                "fields": {
                    "host": source.get("host.name"),
                    "source_ip": source.get("source.ip"),
                    "destination_ip": source.get("destination.ip"),
                    "destination_port": source.get("destination.port"),
                    "user": source.get("user.name"),
                    "action": source.get("event.action"),
                    "reason": source.get("event.reason"),
                    "path": log.get("file", {}).get("path"),
                    "namespace": kubernetes.get("namespace"),
                    "pod": (kubernetes.get("pod") or {}).get("name"),
                    "stream": source.get("stream"),
                },
            }
        )
    return logs


def fetch_packetbeat_events() -> list[dict]:
    payload = {
        "size": 20,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "_source": [
            "@timestamp",
            "event.dataset",
            "source.ip",
            "source.port",
            "destination.ip",
            "destination.port",
            "network.protocol",
            "network.bytes",
            "http.request.method",
            "http.response.status_code",
            "url.path",
            "query",
            "status",
            "method",
            "host.name",
        ],
    }
    result = elastic_request("GET", f"/{PACKETBEAT_INDEX}/_search", payload)
    hits = (((result or {}).get("hits") or {}).get("hits")) or []
    events = []
    for index, hit in enumerate(hits, start=1):
        source = hit.get("_source", {})
        event = source.get("event") or {}
        network = source.get("network") or {}
        http = source.get("http") or {}
        request = http.get("request") or {}
        response = http.get("response") or {}
        events.append(
            {
                "id": hit.get("_id", f"packetbeat-{index}"),
                "timestamp": parse_es_timestamp(source.get("@timestamp")),
                "type": normalize_text(source.get("query") or source.get("url", {}).get("path") or event.get("dataset"), "network event"),
                "severity": "medium" if int(response.get("status_code") or 200) < 400 else "high",
                "sourceIP": normalize_text((source.get("source") or {}).get("ip"), "unknown"),
                "destIP": normalize_text((source.get("destination") or {}).get("ip"), "unknown"),
                "destPort": (source.get("destination") or {}).get("port") or 0,
                "hostname": normalize_text((source.get("host") or {}).get("name"), "unknown-host"),
                "user": None,
                "details": normalize_text(source.get("status"), "observed by packetbeat"),
                "mitreTactic": "Discovery" if network.get("protocol") in {"dns", "icmp"} else "Command and Control",
                "modelVersion": "packetbeat-live",
                "confidence": 78,
            }
        )
    return events


def fetch_metricbeat_hosts() -> list[dict]:
    payload = {
        "size": 20,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "_source": [
            "@timestamp",
            "host.name",
            "kubernetes.node.name",
            "kubernetes.node.cpu.usage.nanocores",
            "kubernetes.node.memory.usage.bytes",
            "kubernetes.node.memory.available.bytes",
            "kubernetes.node.network.rx.bytes",
            "kubernetes.node.network.tx.bytes",
            "kubernetes.node.fs.used.bytes",
            "kubernetes.node.fs.available.bytes",
        ],
        "query": {
            "term": {
                "event.dataset": "kubernetes.node"
            }
        },
    }
    result = elastic_request("GET", f"/{METRICBEAT_INDEX}/_search", payload)
    hits = (((result or {}).get("hits") or {}).get("hits")) or []
    hosts = []
    seen = set()
    for index, hit in enumerate(hits, start=1):
        source = hit.get("_source", {})
        node = (source.get("kubernetes") or {}).get("node") or {}
        hostname = normalize_text(node.get("name") or (source.get("host") or {}).get("name"), f"node-{index}")
        if hostname in seen:
            continue
        seen.add(hostname)
        cpu_nano = (((node.get("cpu") or {}).get("usage") or {}).get("nanocores")) or 0
        mem_used = (((node.get("memory") or {}).get("usage") or {}).get("bytes")) or 0
        mem_available = (((node.get("memory") or {}).get("available") or {}).get("bytes")) or 1
        mem_ratio = mem_used / max(mem_used + mem_available, 1)
        risk = min(95, int((cpu_nano / 10_000_000) + (mem_ratio * 35) + 20))
        hosts.append(
            {
                "id": f"metricbeat-{hostname}",
                "hostname": hostname,
                "ip": "k8s-node",
                "os": "Linux",
                "role": "Kubernetes Node",
                "riskScore": risk,
                "criticality": "high" if risk >= 70 else "medium",
                "lastSeen": parse_es_timestamp(source.get("@timestamp")),
                "alertCount": 0,
                "status": "online",
                "agent": "installed",
            }
        )
    return hosts


def elastic_events_from_logs(logs: list[dict]) -> list[dict]:
    events = []
    for index, item in enumerate(logs[:20], start=1):
        fields = item.get("fields", {})
        level = item.get("level", "INFO").lower()
        severity = "medium"
        if level == "error":
            severity = "high"
        elif level == "warn":
            severity = "medium"
        elif item.get("source") == "fail2ban":
            severity = "high"
        events.append(
            {
                "id": f"elastic-event-{index}",
                "timestamp": item["timestamp"],
                "type": item["message"][:80],
                "severity": severity,
                "sourceIP": normalize_text(fields.get("source_ip"), "unknown"),
                "destIP": normalize_text(fields.get("destination_ip"), "unknown"),
                "destPort": fields.get("destination_port") or 0,
                "hostname": normalize_text(fields.get("host"), "unknown-host"),
                "user": fields.get("user"),
                "details": item["message"],
                "mitreTactic": "Discovery" if "scan" in item["message"].lower() else "Credential Access",
                "modelVersion": "elastic-pass-through",
                "confidence": 68,
            }
        )
    return events


def fetch_elastic_alerts() -> list[dict]:
    payload = {
        "size": 20,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "_source": True,
    }
    result = elastic_request("GET", f"/{AI_ALERTS_INDEX}/_search", payload)
    hits = (((result or {}).get("hits") or {}).get("hits")) or []
    alerts = []
    for index, hit in enumerate(hits, start=1):
        source = hit.get("_source", {})
        alerts.append(
            {
                "id": normalize_text(source.get("alert_id"), hit.get("_id", f"ALT-ES-{index:04d}")),
                "timestamp": parse_es_timestamp(source.get("@timestamp") or source.get("timestamp")),
                "title": normalize_text(source.get("title") or source.get("anomaly_type"), "AI detection"),
                "severity": normalize_text(source.get("severity"), "medium").lower(),
                "status": normalize_text(source.get("status"), "open").lower(),
                "sourceIP": normalize_text(source.get("source_ip"), "unknown"),
                "destIP": normalize_text(source.get("destination_ip"), "unknown"),
                "hostname": normalize_text(source.get("hostname"), "unknown-host"),
                "assignee": normalize_text(source.get("assignee"), "Unassigned"),
                "eta": source.get("eta"),
                "mitreTactic": normalize_text(source.get("mitre_tactic"), "Discovery"),
                "description": normalize_text(source.get("description"), "External AI finding"),
                "recommendation": normalize_text(source.get("recommendation"), "Review related logs and contain if confirmed."),
                "playbook": normalize_text(source.get("playbook"), "Validate evidence, scope impacted hosts and apply containment."),
                "confidence": source.get("confidence"),
                "sourceType": normalize_text(source.get("source_type"), alert_source_type(source.get("title")),),
                "signature": normalize_text(
                    source.get("signature"),
                    alert_signature(
                        source.get("title"),
                        source.get("source_ip"),
                        source.get("destination_ip"),
                        source.get("hostname"),
                        source.get("mitre_tactic"),
                    ),
                ),
            }
        )
    return alerts


def fetch_ai_runtime_status() -> dict[str, Any]:
    targets = []
    if AI_SERVICE_URL:
        targets.append(AI_SERVICE_URL.rstrip("/"))
    fallback_local = "http://127.0.0.1:9000"
    if fallback_local not in targets:
        targets.append(fallback_local)
    for target in targets:
        try:
            response = requests.get(f"{target}/status", timeout=3)
            response.raise_for_status()
            data = response.json()
            if isinstance(data, dict):
                data["serviceUrl"] = target
                return data
        except requests.RequestException:
            continue
    return {}


def fetch_profiles_metadata() -> list[dict[str, Any]]:
    documents = fetch_index_documents(PROFILES_INDEX)
    if documents:
        return documents
    return deepcopy(DEFAULT_PROFILES)


def fetch_assets_metadata() -> list[dict[str, Any]]:
    documents = fetch_index_documents(ASSETS_INDEX)
    if documents:
        return documents
    return deepcopy(DEFAULT_ASSETS)


def fetch_profile_asset_links() -> list[dict[str, Any]]:
    documents = fetch_index_documents(PROFILE_ASSETS_INDEX)
    if documents:
        return documents
    return deepcopy(DEFAULT_PROFILE_ASSETS)


def resolve_scope(profile_id: str | None = None, asset_id: str | None = None) -> dict[str, Any]:
    profiles = fetch_profiles_metadata()
    assets = fetch_assets_metadata()
    links = fetch_profile_asset_links()
    selected_profile = next((item for item in profiles if item.get("id") == profile_id), None) if profile_id else None
    if asset_id:
        selected_assets = [item for item in assets if item.get("id") == asset_id]
    elif selected_profile:
        allowed_asset_ids = {item.get("asset_id") for item in links if item.get("profile_id") == selected_profile.get("id")}
        selected_assets = [item for item in assets if item.get("id") in allowed_asset_ids]
    else:
        selected_assets = assets
    return {
        "profile": selected_profile,
        "assets": selected_assets,
        "assetIds": {item.get("id") for item in selected_assets if item.get("id")},
        "hostnames": {normalize_text(item.get("hostname"), "") for item in selected_assets if item.get("hostname")},
        "ips": {normalize_text(item.get("ip"), "") for item in selected_assets if item.get("ip")},
    }


def filter_logs_by_scope(logs: list[dict[str, Any]], scope: dict[str, Any]) -> list[dict[str, Any]]:
    if len(scope.get("assets") or []) == len(fetch_assets_metadata()):
        return logs
    hostnames = scope.get("hostnames") or set()
    ips = scope.get("ips") or set()
    filtered = []
    for item in logs:
        fields = item.get("fields") or {}
        if normalize_text(fields.get("host"), "") in hostnames:
            filtered.append(item)
            continue
        if normalize_text(fields.get("source_ip"), "") in ips or normalize_text(fields.get("destination_ip"), "") in ips:
            filtered.append(item)
    return filtered


def filter_packet_events_by_scope(events: list[dict[str, Any]], scope: dict[str, Any]) -> list[dict[str, Any]]:
    if len(scope.get("assets") or []) == len(fetch_assets_metadata()):
        return events
    hostnames = scope.get("hostnames") or set()
    ips = scope.get("ips") or set()
    filtered = []
    for item in events:
        if normalize_text(item.get("hostname"), "") in hostnames:
            filtered.append(item)
            continue
        if normalize_text(item.get("sourceIP"), "") in ips or normalize_text(item.get("destIP"), "") in ips:
            filtered.append(item)
    return filtered


def filter_alerts_by_scope(alerts: list[dict[str, Any]], scope: dict[str, Any]) -> list[dict[str, Any]]:
    if len(scope.get("assets") or []) == len(fetch_assets_metadata()):
        return alerts
    hostnames = scope.get("hostnames") or set()
    ips = scope.get("ips") or set()
    filtered = []
    for item in alerts:
        if normalize_text(item.get("hostname"), "") in hostnames:
            filtered.append(item)
            continue
        if normalize_text(item.get("sourceIP"), "") in ips or normalize_text(item.get("destIP"), "") in ips:
            filtered.append(item)
    return filtered


def filter_hosts_by_scope(hosts: list[dict[str, Any]], scope: dict[str, Any]) -> list[dict[str, Any]]:
    if len(scope.get("assets") or []) == len(fetch_assets_metadata()):
        return hosts
    hostnames = scope.get("hostnames") or set()
    ips = scope.get("ips") or set()
    return [item for item in hosts if normalize_text(item.get("hostname"), "") in hostnames or normalize_text(item.get("ip"), "") in ips]


def aggregate_scope_traffic(packet_events: list[dict[str, Any]], alerts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not packet_events:
        return aggregate_packetbeat_traffic()
    now = now_utc()
    buckets = []
    for hours_ago in range(23, -1, -1):
        bucket_start = (now - timedelta(hours=hours_ago)).replace(minute=0, second=0, microsecond=0)
        bucket_end = bucket_start + timedelta(hours=1)
        scoped_packets = [item for item in packet_events if bucket_start <= parse_dt(item.get("timestamp")) < bucket_end]
        scoped_alerts = [item for item in alerts if bucket_start <= parse_dt(item.get("timestamp")) < bucket_end]
        buckets.append(
            {
                "timestamp": bucket_start.isoformat(),
                "alerts": len(scoped_alerts),
                "blocked": len([item for item in scoped_alerts if normalize_text(item.get("status"), "open") in {"resolved", "blocked"}]),
                "inbound": len(scoped_packets) * 48,
                "outbound": len(scoped_packets) * 36,
            }
        )
    return buckets


def scope_summary(scope: dict[str, Any]) -> dict[str, Any]:
    assets = scope.get("assets") or []
    profile = scope.get("profile")
    return {
        "type": "profile" if profile else ("asset" if len(assets) == 1 else "all"),
        "profile": profile,
        "assetCount": len(assets),
        "assets": assets,
    }


def current_alerts() -> list[dict]:
    raw = fetch_elastic_alerts() or deepcopy(AI_FINDINGS_BUFFER) or deepcopy(ALERTS)
    enriched = []
    for item in raw:
        clone = dict(item)
        clone["confidence"] = clone.get("confidence")
        clone["sourceType"] = clone.get("sourceType") or alert_source_type(clone.get("title"))
        clone["signature"] = clone.get("signature") or alert_signature(
            clone.get("title"),
            clone.get("sourceIP"),
            clone.get("destIP"),
            clone.get("hostname"),
            clone.get("mitreTactic"),
        )
        enriched.append(clone)
    return enriched


def current_hosts() -> list[dict]:
    return fetch_metricbeat_hosts() or deepcopy(HOSTS)


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


def parse_dt(value: Any) -> datetime:
    if isinstance(value, str) and value:
        normalized = value.replace("Z", "+00:00")
        try:
            return datetime.fromisoformat(normalized)
        except ValueError:
            pass
    return now_utc()


def aggregate_packetbeat_traffic() -> list[dict]:
    payload = {
        "size": 0,
        "query": {
            "range": {
                "@timestamp": {
                    "gte": "now-24h",
                    "lte": "now",
                }
            }
        },
        "aggs": {
            "traffic_over_time": {
                "date_histogram": {
                    "field": "@timestamp",
                    "fixed_interval": "1h",
                    "min_doc_count": 0,
                },
                "aggs": {
                    "inbound_bytes": {
                        "sum": {
                            "field": "source.bytes"
                        }
                    },
                    "outbound_bytes": {
                        "sum": {
                            "field": "destination.bytes"
                        }
                    },
                },
            }
        },
    }
    result = elastic_request("GET", f"/{PACKETBEAT_INDEX}/_search", payload)
    buckets = ((((result or {}).get("aggregations") or {}).get("traffic_over_time") or {}).get("buckets")) or []
    if not buckets:
        return traffic_data()

    alerts = current_alerts()
    points = []
    for bucket in buckets:
        dt = parse_dt(bucket.get("key_as_string"))
        hour_alerts = [
            item for item in alerts
            if parse_dt(item.get("timestamp")).replace(minute=0, second=0, microsecond=0) == dt.replace(minute=0, second=0, microsecond=0)
        ]
        anomalous = len(hour_alerts)
        blocked = len([item for item in hour_alerts if normalize_text(item.get("status"), "open") in {"resolved", "blocked"}])
        inbound = int((((bucket.get("inbound_bytes") or {}).get("value")) or 0) / 1024)
        outbound = int((((bucket.get("outbound_bytes") or {}).get("value")) or 0) / 1024)
        points.append(
            {
                "time": dt.strftime("%H:%M"),
                "timestamp": iso(dt),
                "inbound": max(inbound, 0),
                "outbound": max(outbound, 0),
                "blocked": blocked,
                "anomalous": anomalous,
            }
        )
    return points


def derive_attacking_ips(alerts: list[dict]) -> list[dict]:
    counts: dict[str, dict[str, Any]] = {}
    for alert in alerts:
        ip = normalize_text(alert.get("sourceIP"), "")
        if not ip or ip == "unknown":
            continue
        counts.setdefault(ip, {"count": 0, "severity": alert.get("severity"), "timestamp": alert.get("timestamp")})
        counts[ip]["count"] += 1
        if severity_weight(alert.get("severity")) > severity_weight(counts[ip]["severity"]):
            counts[ip]["severity"] = alert.get("severity")
        if parse_dt(alert.get("timestamp")) > parse_dt(counts[ip]["timestamp"]):
            counts[ip]["timestamp"] = alert.get("timestamp")

    countries = ["CM", "RU", "NL", "US", "DE", "FR"]
    ranked = []
    for index, (ip, details) in enumerate(sorted(counts.items(), key=lambda item: item[1]["count"], reverse=True), start=1):
        ranked.append(
            {
                "id": f"ip-{index}",
                "ip": ip,
                "country": countries[(index - 1) % len(countries)],
                "attackCount": details["count"],
                "lastAttack": details["timestamp"],
                "blocked": ip in BLOCKED_IPS,
                "threatLevel": normalize_text(details["severity"], "medium").lower(),
            }
        )
    return ranked[:5]


def derive_anomaly_score(alerts: list[dict], packet_events: list[dict], logs: list[dict]) -> dict:
    recent_alerts = len([item for item in alerts if parse_dt(item.get("timestamp")) >= now_utc() - timedelta(hours=6)])
    recent_packet = len(packet_events)
    error_logs = len([item for item in logs if str(item.get("level", "")).upper() in {"WARN", "ERROR"}])
    current = min(100, (recent_alerts * 12) + min(recent_packet, 40) + min(error_logs * 2, 20))
    trend = []
    for hours in range(11, -1, -1):
        cutoff_end = now_utc() - timedelta(hours=hours)
        cutoff_start = cutoff_end - timedelta(hours=1)
        bucket_score = len([item for item in alerts if cutoff_start <= parse_dt(item.get("timestamp")) < cutoff_end]) * 15
        trend.append(min(100, bucket_score + 20))
    return {"current": current, "threshold": 75, "trend": trend}


def derive_realtime_metrics(packet_events: list[dict], logs: list[dict], alerts: list[dict]) -> dict:
    now = now_utc()
    recent_packets = len([item for item in packet_events if parse_dt(item.get("timestamp")) >= now - timedelta(minutes=1)])
    recent_logs = len([item for item in logs if parse_dt(item.get("timestamp")) >= now - timedelta(minutes=5)])
    failed_logins = len([item for item in logs if "failed" in str(item.get("message", "")).lower()])
    return {
        "eventsPerSecond": recent_packets or max(1, len(packet_events)),
        "bytesPerSecond": sum(int((item.get("destPort") or 0) * 50) for item in packet_events[:50]),
        "failedLogins": failed_logins,
        "activeConnections": len({(item.get("sourceIP"), item.get("destIP"), item.get("destPort")) for item in packet_events}),
        "latency": 25 + min(len(alerts) * 3, 60),
        "queueDepth": max(0, len(alerts) - 2),
    }


def derive_incidents(alerts: list[dict]) -> list[dict]:
    def alert_family(alert: dict[str, Any]) -> str:
        title = normalize_text(alert.get("title"), "").lower()
        tactic = normalize_text(alert.get("mitreTactic"), "Security")
        if "ssh" in title or "brute force" in title:
            return "ssh-bruteforce"
        if "dns" in title:
            return "dns-anomaly"
        if "port scan" in title or "scan" in title:
            return "port-scan"
        if "ml network anomaly" in title:
            return "ml-anomaly"
        return tactic.lower().replace(" ", "-")

    def family_label(family: str) -> str:
        mapping = {
            "ssh-bruteforce": "SSH brute force",
            "dns-anomaly": "DNS burst anomaly",
            "port-scan": "Port scan",
            "ml-anomaly": "ML anomaly",
        }
        return mapping.get(family, family.replace("-", " ").title())

    def incident_scope(alert: dict[str, Any]) -> str:
        source_ip = normalize_text(alert.get("sourceIP"), "")
        hostname = normalize_text(alert.get("hostname"), "")
        family = alert_family(alert)
        if source_ip and source_ip != "unknown":
            try:
                ip = ipaddress.ip_address(source_ip)
                if ip.is_private or ip.is_loopback:
                    return f"{family}::internal"
            except ValueError:
                pass
            return f"{family}::{source_ip}"
        if hostname and hostname != "unknown-host":
            return f"{family}::{hostname}"
        return f"{family}::cluster"

    def scope_type_for_group(sources: set[str]) -> str:
        unique_sources = [item for item in sources if item and item != "unknown"]
        if len(unique_sources) <= 1:
            return "single-source"
        return "campaign"

    groups: dict[str, dict[str, Any]] = {}
    for alert in sorted(alerts, key=lambda item: parse_dt(item.get("timestamp"))):
        bucket = parse_dt(alert.get("timestamp")).replace(minute=0, second=0, microsecond=0)
        campaign_bucket = bucket - timedelta(hours=bucket.hour % 6)
        key = f"{incident_scope(alert)}::{campaign_bucket.isoformat()}"
        groups.setdefault(
            key,
            {
                "alerts": [],
                "family": alert_family(alert),
                "severity": alert.get("severity", "medium"),
                "assignee": alert.get("assignee") or "Unassigned",
                "tactics": set(),
                "hosts": set(),
                "sources": set(),
            },
        )
        groups[key]["alerts"].append(alert)
        groups[key]["tactics"].add(normalize_text(alert.get("mitreTactic"), "Discovery"))
        groups[key]["hosts"].add(normalize_text(alert.get("hostname"), "unknown-host"))
        source_ip = normalize_text(alert.get("sourceIP"), "")
        if source_ip:
            groups[key]["sources"].add(source_ip)
        if severity_weight(alert.get("severity")) > severity_weight(groups[key]["severity"]):
            groups[key]["severity"] = alert.get("severity", "medium")

    incidents = []
    for index, group in enumerate(sorted(groups.values(), key=lambda item: max(parse_dt(alert.get("timestamp")) for alert in item["alerts"]), reverse=True), start=1):
        alerts_sorted = sorted(group["alerts"], key=lambda item: parse_dt(item.get("timestamp")))
        created_at = alerts_sorted[0].get("timestamp")
        updated_at = alerts_sorted[-1].get("timestamp")
        statuses = {normalize_text(alert.get("status"), "open") for alert in alerts_sorted}
        status = "resolved" if statuses <= {"resolved", "closed"} else ("investigating" if "investigating" in statuses else "active")
        source_count = len([item for item in group["sources"] if item and item != "unknown"])
        label = family_label(group["family"])
        scope_type = scope_type_for_group(group["sources"])
        title = f"{label} campaign"
        if source_count == 1:
            only_source = next(iter(group["sources"]), "")
            if only_source and only_source != "unknown":
                title = f"{label} from {only_source}"
                scope_type = "single-source"
        timeline = [
            {"timestamp": alert.get("timestamp"), "action": f"{alert.get('title')} ({normalize_text(alert.get('sourceIP'), 'unknown')})"}
            for alert in alerts_sorted[-8:]
        ]
        incidents.append(
            {
                "id": f"INC-{index:05d}",
                "title": title,
                "severity": normalize_text(group["severity"], "medium").lower(),
                "status": status,
                "createdAt": created_at,
                "updatedAt": updated_at,
                "alertCount": len(alerts_sorted),
                "affectedHosts": len([item for item in group["hosts"] if item and item != "unknown-host"]),
                "assignee": group["assignee"],
                "family": group["family"],
                "familyLabel": label,
                "scopeType": scope_type,
                "primarySource": next(iter(sorted(group["sources"])), None),
                "timeline": timeline,
                "tactics": sorted(group["tactics"]),
            }
        )
    return incidents


def derive_model_metrics(alerts: list[dict], logs: list[dict], packet_events: list[dict]) -> dict:
    ai_runtime = fetch_ai_runtime_status()
    title_counts: dict[str, int] = {}
    for alert in alerts:
        title = normalize_text(alert.get("title"), "unknown")
        title_counts[title] = title_counts.get(title, 0) + 1
    total_alerts = max(len(alerts), 1)
    features = [
        {"name": "ssh_failed_logins", "importance": len([item for item in logs if "failed password" in str(item.get("message", "")).lower()]) / max(len(logs), 1), "trend": "up"},
        {"name": "distinct_dst_ports", "importance": len({item.get("destPort") for item in packet_events if item.get("destPort")}) / max(len(packet_events), 1), "trend": "stable"},
        {"name": "dns_error_findings", "importance": sum(count for title, count in title_counts.items() if "dns" in title.lower()) / total_alerts, "trend": "up"},
        {"name": "high_severity_ratio", "importance": len([item for item in alerts if normalize_text(item.get("severity"), "medium") in {"high", "critical"}]) / total_alerts, "trend": "stable"},
    ]
    return {
        "versions": [
            {
                "version": "hybrid-heuristics-iforest",
                "status": "active",
                "precision": None,
                "recall": None,
                "f1": None,
                "falsePositives": len([item for item in alerts if normalize_text(item.get("severity"), "medium") == "low"]),
                "deployedAt": "live",
            }
        ],
        "features": features,
        "confusionMatrix": None,
        "detectors": [
            {"name": "SSH brute force", "rule": "failed passwords over threshold", "matches": sum(count for title, count in title_counts.items() if "ssh" in title.lower())},
            {"name": "DNS burst anomaly", "rule": "dns errors over threshold", "matches": sum(count for title, count in title_counts.items() if "dns" in title.lower())},
            {"name": "Port scan", "rule": "distinct destination ports over threshold", "matches": sum(count for title, count in title_counts.items() if "port scan" in title.lower())},
            {"name": "ML anomaly", "rule": "isolation forest outlier on live feature window", "matches": sum(count for title, count in title_counts.items() if "ml network anomaly" in title.lower())},
        ],
        "drift": min(0.99, len(alerts) / max(len(packet_events), 1)),
        "latencyMs": 40 + min(len(packet_events), 100),
        "thresholds": (ai_runtime.get("thresholds") if isinstance(ai_runtime, dict) else None) or {},
        "dedupWindowMinutes": ai_runtime.get("dedupWindowMinutes") if isinstance(ai_runtime, dict) else None,
        "ml": (ai_runtime.get("ml") if isinstance(ai_runtime, dict) else None) or {},
    }


def derive_predictions(alerts: list[dict], hosts: list[dict]) -> dict:
    now = now_utc().replace(minute=0, second=0, microsecond=0)
    hourly_counts = []
    for offset in range(24):
        stamp = now - timedelta(hours=23 - offset)
        count = len([item for item in alerts if parse_dt(item.get("timestamp")).replace(minute=0, second=0, microsecond=0) == stamp])
        hourly_counts.append(count)
    recent_avg = sum(hourly_counts[-6:]) / max(len(hourly_counts[-6:]), 1)
    previous_avg = sum(hourly_counts[-12:-6]) / max(len(hourly_counts[-12:-6]), 1)
    slope = recent_avg - previous_avg
    forecast = []
    for offset in range(24):
        stamp = now + timedelta(hours=offset)
        predicted = max(0, round(recent_avg + (slope * (offset / 6))))
        forecast.append(
            {
                "timestamp": iso(stamp),
                "predicted": predicted,
                "lower": max(predicted - 1, 0),
                "upper": predicted + 2,
            }
        )
    next_targets = [
        {
            "hostname": item["hostname"],
            "probability": round(min(0.99, max(0.15, item["riskScore"] / 100)), 2),
            "reason": f"Risk score {item['riskScore']} derived from current telemetry",
        }
        for item in sorted(hosts, key=lambda host: host["riskScore"], reverse=True)[:5]
    ]
    risk_trend = "stable"
    if recent_avg > previous_avg:
        risk_trend = "increasing"
    elif recent_avg < previous_avg:
        risk_trend = "decreasing"
    confidence = min(0.95, 0.55 + min(len(alerts), 20) / 50)
    return {
        "forecast": forecast,
        "nextTargets": next_targets,
        "riskTrend": risk_trend,
        "confidence": confidence,
    }


def derive_pipeline_health(logs: list[dict], packet_events: list[dict], alerts: list[dict], hosts: list[dict]) -> dict:
    uptime_seconds = int((now_utc() - START_TIME).total_seconds())
    host_cpu = min(95, max(5, int(sum(item["riskScore"] for item in hosts) / max(len(hosts), 1))))
    host_memory = min(95, 35 + max(0, len(logs) // 3))
    elastic_health = elastic_request("GET", "/_cluster/health") if elastic_configured() else None
    services = [
        {"name": "Packetbeat", "type": "collector", "status": "healthy" if packet_events else "degraded", "cpu": host_cpu, "memory": host_memory},
        {"name": "Filebeat", "type": "collector", "status": "healthy" if logs else "degraded", "cpu": max(10, host_cpu - 5), "memory": max(10, host_memory - 8)},
        {"name": "AI inference service", "type": "analysis", "status": "healthy" if alerts else "degraded", "cpu": max(10, host_cpu - 8), "memory": max(10, host_memory - 12)},
        {"name": "NetSentinel API", "type": "api", "status": "healthy", "cpu": max(5, host_cpu - 15), "memory": max(10, host_memory - 15)},
    ]
    if elastic_health:
        elastic_status = normalize_text(elastic_health.get("status"), "healthy").strip().lower()
        if elastic_status == "yellow":
            elastic_status = "degraded"
        elif elastic_status == "red":
            elastic_status = "down"
        services.insert(
            2,
            {
                "name": "Elasticsearch",
                "type": "storage",
                "status": elastic_status,
                "cpu": max(10, host_cpu - 3),
                "memory": min(98, host_memory + 8),
            },
        )
    throughput = max(len(packet_events), len(logs), len(alerts)) * 10
    return {
        "services": services,
        "ingestionLag": max(10, 200 - min(len(packet_events) * 3, 150)),
        "queueDepth": max(0, len(alerts) - len(hosts)),
        "droppedEvents": 0 if logs and packet_events else 1,
        "throughput": throughput,
        "uptime": round(min(99.9, 95 + uptime_seconds / 20000), 2),
    }


def traffic_data() -> list[dict]:
    base = now_utc()
    points = []
    for hours_ago in range(23, -1, -1):
        stamp = base - timedelta(hours=hours_ago)
        points.append(
            {
                "time": stamp.strftime("%H:%M"),
                "timestamp": iso(stamp),
                "inbound": 340 + ((hours_ago * 13) % 80),
                "outbound": 250 + ((hours_ago * 11) % 65),
                "blocked": 14 + (hours_ago % 6),
                "anomalous": 6 + (hours_ago % 5),
            }
        )
    return points


def risky_hosts() -> list[dict]:
    return sorted(deepcopy(HOSTS), key=lambda item: item["riskScore"], reverse=True)[:5]


def attacking_ips() -> list[dict]:
    counts = {}
    for alert in ALERTS:
        counts.setdefault(alert["sourceIP"], {"count": 0, "severity": alert["severity"], "timestamp": alert["timestamp"]})
        counts[alert["sourceIP"]]["count"] += 1
        counts[alert["sourceIP"]]["severity"] = alert["severity"]
        counts[alert["sourceIP"]]["timestamp"] = alert["timestamp"]
    ranked = []
    for index, (ip, details) in enumerate(counts.items(), start=1):
        ranked.append(
            {
                "id": f"ip-{index}",
                "ip": ip,
                "country": ["CM", "RU", "NL", "US"][index % 4],
                "attackCount": details["count"] * 23,
                "lastAttack": details["timestamp"],
                "blocked": ip in BLOCKED_IPS,
                "threatLevel": details["severity"],
            }
        )
    return sorted(ranked, key=lambda item: item["attackCount"], reverse=True)


def anomaly_score() -> dict:
    return {
        "current": 67,
        "threshold": 75,
        "trend": [34, 39, 44, 40, 48, 52, 58, 61, 63, 66, 64, 67],
    }


def live_events() -> list[dict]:
    rows = []
    model_versions = ["isolation-forest-1.3", "hybrid-rules-2.1", "sequence-detector-0.9"]
    for index, alert in enumerate(ALERTS):
        rows.append(
            {
                "id": f"event-{index + 1}",
                "timestamp": alert["timestamp"],
                "type": alert["title"],
                "severity": alert["severity"],
                "sourceIP": alert["sourceIP"],
                "destIP": alert["destIP"],
                "destPort": [22, 53, 443, 8080][index % 4],
                "hostname": alert["hostname"],
                "user": ["root", "ubuntu", None, "svc-web"][index % 4],
                "details": alert["description"],
                "mitreTactic": alert["mitreTactic"],
                "modelVersion": model_versions[index % len(model_versions)],
                "confidence": 72 + index * 6,
            }
        )
    return rows


def realtime_metrics() -> dict:
    return {
        "eventsPerSecond": 184,
        "bytesPerSecond": 782344,
        "failedLogins": 17,
        "activeConnections": 624,
        "latency": 34,
        "queueDepth": 9,
    }


def logs_feed() -> list[dict]:
    base = now_utc()
    return [
        {
            "id": "log-1",
            "timestamp": iso(base - timedelta(minutes=3)),
            "level": "WARN",
            "source": "filebeat-auth",
            "message": "sshd[28411]: Failed password for invalid user admin from 185.227.134.41 port 50818 ssh2",
            "fields": {"host": "auth-gateway-01", "program": "sshd", "source_ip": "185.227.134.41"},
        },
        {
            "id": "log-2",
            "timestamp": iso(base - timedelta(minutes=5)),
            "level": "INFO",
            "source": "fail2ban",
            "message": "Ban 185.227.134.41 after 5 retries on jail sshd",
            "fields": {"jail": "sshd", "action": "ban", "source_ip": "185.227.134.41"},
        },
        {
            "id": "log-3",
            "timestamp": iso(base - timedelta(minutes=7)),
            "level": "WARN",
            "source": "packetbeat",
            "message": "Detected port scan pattern toward 10.10.0.0/24",
            "fields": {"flow_count": 37, "ports": [22, 80, 443, 3306], "source_ip": "102.219.88.14"},
        },
        {
            "id": "log-4",
            "timestamp": iso(base - timedelta(minutes=10)),
            "level": "INFO",
            "source": "filebeat-system",
            "message": "sudo session opened for user root by ubuntu(uid=1000)",
            "fields": {"host": "app-node-01", "program": "sudo", "user": "ubuntu"},
        },
    ]


def model_metrics() -> dict:
    return {
        "versions": [
            {"version": "iforest-1.3", "status": "active", "precision": 0.93, "recall": 0.88, "f1": 0.90, "falsePositives": 9, "deployedAt": "2026-03-15"},
            {"version": "hybrid-rules-2.0", "status": "retired", "precision": 0.89, "recall": 0.84, "f1": 0.86, "falsePositives": 14, "deployedAt": "2026-02-28"},
        ],
        "features": [
            {"name": "failed_logins_per_minute", "importance": 0.91, "trend": "stable"},
            {"name": "distinct_ports_targeted", "importance": 0.87, "trend": "up"},
            {"name": "dns_burst_score", "importance": 0.73, "trend": "up"},
            {"name": "fail2ban_bans_last_hour", "importance": 0.69, "trend": "stable"},
        ],
        "drift": 0.12,
        "latencyMs": 61,
    }


def ai_status() -> dict:
    return {
        "configured": ai_service_configured(),
        "serviceUrl": AI_SERVICE_URL or None,
        "modelVersion": "iforest-1.3",
        "mode": "external-service" if ai_service_configured() else "local-demo-contract",
        "lastInferenceAt": iso(now_utc() - timedelta(seconds=18)),
        "writesToIndex": AI_ALERTS_INDEX,
    }


def ai_findings() -> list[dict]:
    alerts = fetch_elastic_alerts()
    if not alerts:
        alerts = deepcopy(ALERTS)
    findings = []
    for alert in alerts:
        findings.append(
            {
                "findingId": alert["id"],
                "timestamp": alert["timestamp"],
                "title": alert["title"],
                "severity": alert["severity"],
                "hostname": alert["hostname"],
                "sourceIP": alert["sourceIP"],
                "confidence": 0.84 if alert["severity"] in {"critical", "high"} else 0.71,
                "recommendation": alert["recommendation"],
            }
        )
    return findings


def ai_recommendations() -> list[dict]:
    return [
        {
            "pattern": "Brute force SSH detected",
            "recommendation": "Ban source IP, disable password authentication and audit affected accounts.",
            "commands": [
                "sudo fail2ban-client status sshd",
                "sudo grep 'Failed password' /var/log/auth.log | tail -n 50",
                "sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config",
            ],
        },
        {
            "pattern": "Horizontal port scan observed",
            "recommendation": "Block the scanner at the firewall and reduce externally exposed ports.",
            "commands": [
                "sudo ufw deny from <source-ip>",
                "sudo ss -tulpn",
                "sudo nmap -sV <host>",
            ],
        },
        {
            "pattern": "Abnormal outbound DNS burst",
            "recommendation": "Investigate the process generating DNS traffic and isolate the endpoint if persistence is observed.",
            "commands": [
                "sudo lsof -i :53",
                "sudo tcpdump -ni any port 53 -c 50",
                "sudo netstat -plant",
            ],
        },
    ]


def predictions_data() -> dict:
    forecast = []
    current = now_utc().replace(minute=0, second=0, microsecond=0)
    for offset in range(24):
        stamp = current + timedelta(hours=offset)
        predicted = 18 + (offset % 6) * 4
        forecast.append(
            {
                "timestamp": iso(stamp),
                "predicted": predicted,
                "lower": max(predicted - 5, 0),
                "upper": predicted + 7,
            }
        )
    return {
        "forecast": forecast,
        "nextTargets": [
            {"asset": "auth-gateway-01", "risk": 0.92, "reason": "recurrent SSH brute force"},
            {"asset": "lab-client-07", "risk": 0.74, "reason": "DNS burst anomaly"},
            {"asset": "edge-fw-01", "risk": 0.69, "reason": "repeated external scanning"},
        ],
        "riskTrend": "increasing",
        "confidence": 0.84,
    }


def pipeline_health() -> dict:
    uptime_seconds = int((now_utc() - START_TIME).total_seconds())
    return {
        "services": [
            {"name": "Packetbeat", "type": "collector", "status": "healthy", "latency": "24 ms", "throughput": "118 flows/s"},
            {"name": "Filebeat", "type": "collector", "status": "healthy", "latency": "18 ms", "throughput": "82 events/s"},
            {"name": "fail2ban parser", "type": "parser", "status": "healthy", "latency": "12 ms", "throughput": "4 bans/h"},
            {"name": "Elasticsearch", "type": "storage", "status": "remote", "latency": "46 ms", "throughput": "indexed"},
            {"name": "AI inference service", "type": "analysis", "status": "healthy", "latency": "61 ms", "throughput": "34 scores/min"},
            {"name": "NetSentinel API", "type": "api", "status": "healthy", "latency": "9 ms", "throughput": "responsive"},
        ],
        "ingestionLag": 46,
        "queueDepth": 9,
        "droppedEvents": 1,
        "throughput": 204,
        "uptime": round(min(99.9, 95 + uptime_seconds / 20000), 2),
    }


class BlockIPRequest(BaseModel):
    ip: str


class TicketRequest(BaseModel):
    alertId: str
    priority: str = "medium"
    assignee: str | None = None


class ReportExportRequest(BaseModel):
    type: str
    filters: dict | None = None


class AIFindingIngest(BaseModel):
    title: str
    severity: str = "medium"
    description: str
    recommendation: str
    source_ip: str | None = None
    destination_ip: str | None = None
    hostname: str | None = None
    mitre_tactic: str | None = None
    confidence: float | None = None
    playbook: str | None = None
    status: str = "open"


class ProfileCreateRequest(BaseModel):
    id: str
    name: str
    type: str = "user"
    description: str | None = None


class AssetCreateRequest(BaseModel):
    id: str
    hostname: str
    ip: str
    os: str
    role: str
    site: str = "default-site"
    environment: str = "prod"
    host_id: str | None = None
    tags: list[str] | None = None


class ProfileAssetCreateRequest(BaseModel):
    profile_id: str
    asset_id: str


@api_router.get("/")
async def root():
    return {
        "name": "NetSentinel AI API",
        "mode": "elastic-remote" if elastic_configured() else "demo-backed",
        "elastic_url": ELASTICSEARCH_URL or "remote-not-configured",
        "ai_service_url": AI_SERVICE_URL or "not-configured",
        "message": "Use this API locally and connect Elasticsearch remotely on the VPS or lab server.",
    }


@api_router.get("/health")
async def health():
    elastic_ok = elastic_request("GET", "/_cluster/health") if elastic_configured() else None
    return {
        "status": "ok",
        "elasticConfigured": elastic_configured(),
        "elasticReachable": bool(elastic_ok) if elastic_configured() else False,
        "aiServiceConfigured": ai_service_configured(),
    }


@api_router.get("/scope/options")
async def scope_options():
    profiles = fetch_profiles_metadata()
    assets = fetch_assets_metadata()
    links = fetch_profile_asset_links()
    profile_counts = {item.get("profile_id"): 0 for item in links}
    for link in links:
        profile_counts[link.get("profile_id")] = profile_counts.get(link.get("profile_id"), 0) + 1
    return {
        "profiles": [
            {
                **item,
                "assetCount": profile_counts.get(item.get("id"), 0),
            }
            for item in profiles
        ],
        "assets": assets,
        "assignments": links,
    }


@api_router.get("/scope")
async def scope(profile_id: str | None = None, asset_id: str | None = None):
    resolved = resolve_scope(profile_id=profile_id, asset_id=asset_id)
    return scope_summary(resolved)


@api_router.get("/profiles")
async def profiles():
    return {"profiles": fetch_profiles_metadata()}


@api_router.post("/profiles")
async def create_profile(request: ProfileCreateRequest):
    document = {
        "id": request.id,
        "name": request.name,
        "type": request.type,
        "description": request.description,
        "created_at": iso(now_utc()),
    }
    stored = elastic_index_doc(PROFILES_INDEX, request.id, document) if elastic_configured() else False
    return {"success": stored or not elastic_configured(), "profile": document}


@api_router.get("/assets")
async def assets():
    assets_payload = fetch_assets_metadata()
    links = fetch_profile_asset_links()
    profile_lookup = {item.get("id"): item for item in fetch_profiles_metadata()}
    profiles_by_asset: dict[str, list[dict[str, Any]]] = {}
    for link in links:
        asset_profiles = profiles_by_asset.setdefault(link.get("asset_id"), [])
        profile = profile_lookup.get(link.get("profile_id"))
        if profile:
            asset_profiles.append({"id": profile.get("id"), "name": profile.get("name"), "type": profile.get("type")})
    return {
        "assets": [
            {
                **item,
                "profiles": profiles_by_asset.get(item.get("id"), []),
            }
            for item in assets_payload
        ]
    }


@api_router.post("/assets")
async def create_asset(request: AssetCreateRequest):
    document = {
        "id": request.id,
        "hostname": request.hostname,
        "host_id": request.host_id or request.id,
        "ip": request.ip,
        "os": request.os,
        "role": request.role,
        "site": request.site,
        "environment": request.environment,
        "tags": request.tags or [],
        "created_at": iso(now_utc()),
    }
    stored = elastic_index_doc(ASSETS_INDEX, request.id, document) if elastic_configured() else False
    return {"success": stored or not elastic_configured(), "asset": document}


@api_router.post("/profile-assets")
async def assign_profile_asset(request: ProfileAssetCreateRequest):
    link_id = f"{request.profile_id}__{request.asset_id}"
    document = {
        "id": link_id,
        "profile_id": request.profile_id,
        "asset_id": request.asset_id,
        "created_at": iso(now_utc()),
    }
    stored = elastic_index_doc(PROFILE_ASSETS_INDEX, link_id, document) if elastic_configured() else False
    return {"success": stored or not elastic_configured(), "assignment": document}


@api_router.get("/overview")
async def overview(profile_id: str | None = None, asset_id: str | None = None):
    resolved_scope = resolve_scope(profile_id=profile_id, asset_id=asset_id)
    alerts = filter_alerts_by_scope(current_alerts(), resolved_scope)
    hosts = filter_hosts_by_scope(current_hosts(), resolved_scope)
    incidents_live = derive_incidents(alerts)
    packetbeat_events = filter_packet_events_by_scope(fetch_packetbeat_events(), resolved_scope)
    logs = filter_logs_by_scope(fetch_elastic_logs(), resolved_scope)
    recent_24h = [item for item in alerts if parse_dt(item.get("timestamp")) >= now_utc() - timedelta(hours=24)]
    previous_24h = [item for item in alerts if now_utc() - timedelta(hours=48) <= parse_dt(item.get("timestamp")) < now_utc() - timedelta(hours=24)]
    recent_12h_anomalies = [item for item in alerts if parse_dt(item.get("timestamp")) >= now_utc() - timedelta(hours=12)]
    previous_12h_anomalies = [item for item in alerts if now_utc() - timedelta(hours=24) <= parse_dt(item.get("timestamp")) < now_utc() - timedelta(hours=12)]
    detection_minutes = [max(1, int((now_utc() - parse_dt(item.get("timestamp"))).total_seconds() / 60)) for item in recent_24h[:10]]
    mean_time_to_detect = round(sum(detection_minutes) / max(len(detection_minutes), 1), 1)
    return {
        "kpis": {
            "totalAlerts": len(alerts),
            "anomalies": len([item for item in alerts if normalize_text(item.get("severity"), "medium") in {"high", "critical", "medium"}]),
            "incidentsOpen": len([item for item in incidents_live if item["status"] in {"active", "investigating"}]),
            "meanTimeToDetect": f"{mean_time_to_detect:.1f}",
            "alertsTrend": percent_change(len(recent_24h), len(previous_24h)),
            "anomaliesTrend": percent_change(len(recent_12h_anomalies), len(previous_12h_anomalies)),
            "incidentsTrend": percent_change(
                len([item for item in incidents_live if item["status"] in {"active", "investigating"}]),
                max(0, len(previous_24h)),
            ),
            "mttdTrend": percent_change(mean_time_to_detect, max(mean_time_to_detect + 2, 1)),
        },
        "trafficData": aggregate_scope_traffic(packetbeat_events, alerts),
        "riskyHosts": sorted(hosts, key=lambda item: item["riskScore"], reverse=True)[:5],
        "attackingIPs": derive_attacking_ips(alerts),
        "anomalyScore": derive_anomaly_score(alerts, packetbeat_events, logs),
        "scope": scope_summary(resolved_scope),
    }


@api_router.get("/stream")
async def stream(profile_id: str | None = None, asset_id: str | None = None):
    resolved_scope = resolve_scope(profile_id=profile_id, asset_id=asset_id)
    alerts = filter_alerts_by_scope(current_alerts(), resolved_scope)
    packetbeat_events = filter_packet_events_by_scope(fetch_packetbeat_events(), resolved_scope)
    if packetbeat_events:
        return {"events": packetbeat_events, "metrics": derive_realtime_metrics(packetbeat_events, fetch_elastic_logs(), alerts)}
    elastic_logs = filter_logs_by_scope(fetch_elastic_logs(), resolved_scope)
    if elastic_logs:
        return {"events": elastic_events_from_logs(elastic_logs), "metrics": derive_realtime_metrics([], elastic_logs, alerts)}
    return {"events": live_events(), "metrics": derive_realtime_metrics([], logs_feed(), alerts)}


@api_router.get("/logs")
async def logs(profile_id: str | None = None, asset_id: str | None = None):
    resolved_scope = resolve_scope(profile_id=profile_id, asset_id=asset_id)
    payload = filter_logs_by_scope(fetch_elastic_logs(), resolved_scope) or filter_logs_by_scope(logs_feed(), resolved_scope)
    return {"logs": payload, "total": len(payload), "page": 1, "pageSize": len(payload)}


@api_router.get("/alerts")
async def alerts(profile_id: str | None = None, asset_id: str | None = None):
    payload = filter_alerts_by_scope(current_alerts(), resolve_scope(profile_id=profile_id, asset_id=asset_id))
    return {"alerts": payload, "total": len(payload)}


@api_router.get("/incidents")
async def incidents(profile_id: str | None = None, asset_id: str | None = None):
    scoped_alerts = filter_alerts_by_scope(current_alerts(), resolve_scope(profile_id=profile_id, asset_id=asset_id))
    return {"incidents": derive_incidents(scoped_alerts)}


@api_router.get("/hosts")
async def hosts(profile_id: str | None = None, asset_id: str | None = None):
    payload = filter_hosts_by_scope(current_hosts(), resolve_scope(profile_id=profile_id, asset_id=asset_id))
    return {"hosts": payload}


@api_router.get("/model")
async def model(profile_id: str | None = None, asset_id: str | None = None):
    resolved_scope = resolve_scope(profile_id=profile_id, asset_id=asset_id)
    return derive_model_metrics(
        filter_alerts_by_scope(current_alerts(), resolved_scope),
        filter_logs_by_scope(fetch_elastic_logs(), resolved_scope),
        filter_packet_events_by_scope(fetch_packetbeat_events(), resolved_scope),
    )


@api_router.get("/predictions")
async def predictions(profile_id: str | None = None, asset_id: str | None = None):
    resolved_scope = resolve_scope(profile_id=profile_id, asset_id=asset_id)
    return derive_predictions(
        filter_alerts_by_scope(current_alerts(), resolved_scope),
        filter_hosts_by_scope(current_hosts(), resolved_scope),
    )


@api_router.get("/pipeline")
async def pipeline(profile_id: str | None = None, asset_id: str | None = None):
    resolved_scope = resolve_scope(profile_id=profile_id, asset_id=asset_id)
    return derive_pipeline_health(
        filter_logs_by_scope(fetch_elastic_logs(), resolved_scope),
        filter_packet_events_by_scope(fetch_packetbeat_events(), resolved_scope),
        filter_alerts_by_scope(current_alerts(), resolved_scope),
        filter_hosts_by_scope(current_hosts(), resolved_scope),
    )


@api_router.get("/ai/status")
async def ai_engine_status():
    return ai_status()


@api_router.get("/ai/findings")
async def ai_engine_findings():
    return {"findings": ai_findings(), "total": len(ai_findings())}


@api_router.get("/ai/recommendations")
async def ai_engine_recommendations():
    return {"items": ai_recommendations()}


@api_router.post("/ai/findings")
async def ingest_ai_finding(finding: AIFindingIngest):
    alert_id = f"AI-{uuid.uuid4().hex[:12].upper()}"
    document = {
        "@timestamp": iso(now_utc()),
        "alert_id": alert_id,
        "title": finding.title,
        "severity": finding.severity.lower(),
        "description": finding.description,
        "recommendation": finding.recommendation,
        "source_ip": finding.source_ip,
        "destination_ip": finding.destination_ip,
        "hostname": finding.hostname,
        "mitre_tactic": finding.mitre_tactic,
        "confidence": finding.confidence,
        "playbook": finding.playbook,
        "status": finding.status.lower(),
    }
    AI_FINDINGS_BUFFER.insert(
        0,
        {
            "id": alert_id,
            "timestamp": document["@timestamp"],
            "title": finding.title,
            "severity": finding.severity.lower(),
            "status": finding.status.lower(),
            "sourceIP": normalize_text(finding.source_ip, "unknown"),
            "destIP": normalize_text(finding.destination_ip, "unknown"),
            "hostname": normalize_text(finding.hostname, "unknown-host"),
            "assignee": "Unassigned",
            "eta": None,
            "mitreTactic": normalize_text(finding.mitre_tactic, "Discovery"),
            "description": finding.description,
            "recommendation": finding.recommendation,
            "playbook": normalize_text(finding.playbook, "Validate the anomaly and contain if confirmed."),
            "confidence": finding.confidence,
            "sourceType": alert_source_type(finding.title),
            "signature": alert_signature(
                finding.title,
                finding.source_ip,
                finding.destination_ip,
                finding.hostname,
                finding.mitre_tactic,
            ),
        },
    )
    if elastic_configured():
        document["source_type"] = alert_source_type(finding.title)
        document["signature"] = alert_signature(
            finding.title,
            finding.source_ip,
            finding.destination_ip,
            finding.hostname,
            finding.mitre_tactic,
        )
        elastic_request("POST", f"/{INGEST_AI_ALERTS_INDEX}/_doc", document)
    return {"success": True, "alertId": alert_id}


@api_router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str):
    for alert in ALERTS:
        if alert["id"] == alert_id:
            alert["status"] = "investigating"
            return {"success": True, "alertId": alert_id, "status": "investigating"}
    return {"success": False, "alertId": alert_id}


@api_router.post("/hosts/{host_id}/isolate")
async def isolate_host(host_id: str):
    for host in HOSTS:
        if host["id"] == host_id or host["hostname"] == host_id:
            host["status"] = "offline"
            host["riskScore"] = min(host["riskScore"] + 5, 100)
            return {"success": True, "hostId": host_id}
    return {"success": False, "hostId": host_id}


@api_router.post("/firewall/block")
async def block_ip(request: BlockIPRequest):
    BLOCKED_IPS.add(request.ip)
    return {"success": True, "ip": request.ip}


@api_router.post("/tickets")
async def create_ticket(request: TicketRequest):
    ticket_id = f"TKT-{len(TICKETS) + 1001}"
    TICKETS.append(
        {
            "ticketId": ticket_id,
            "alertId": request.alertId,
            "priority": request.priority,
            "assignee": request.assignee,
            "createdAt": iso(now_utc()),
        }
    )
    return {"success": True, "ticketId": ticket_id}


@api_router.post("/reports/export")
async def export_report(request: ReportExportRequest):
    report_name = f"{request.type}-report-{now_utc().strftime('%Y%m%d%H%M%S')}.pdf"
    return {"success": True, "downloadUrl": f"/downloads/{report_name}"}


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=allowed_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)
