import requests
from typing import Any

from .config import (
    ELASTICSEARCH_API_KEY,
    ELASTICSEARCH_PASSWORD,
    ELASTICSEARCH_URL,
    ELASTICSEARCH_USERNAME,
    ELASTICSEARCH_VERIFY_TLS,
    FILEBEAT_INDEX,
    PACKETBEAT_INDEX,
    METRICBEAT_INDEX,
    AI_ALERTS_INDEX,
    AI_SERVICE_URL,
    INGEST_AI_ALERTS_INDEX,
    PROFILES_INDEX,
    ASSETS_INDEX,
    PROFILE_ASSETS_INDEX,
)
from .utils import iso, normalize_text, parse_dt, parse_es_timestamp


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
    response = elastic_request("PUT", f"/{index}/_doc/{doc_id}?refresh=wait_for", payload)
    return bool(response)


def fetch_index_documents(index: str, size: int = 200) -> list[dict[str, Any]]:
    result = elastic_request(
        "GET",
        f"/{index}/_search",
        {
            "size": size,
            "sort": [
                {"created_at": {"order": "asc", "unmapped_type": "date"}},
                {"name.keyword": {"order": "asc", "unmapped_type": "keyword"}},
            ],
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
        log_data = source.get("log") or {}
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
                    "path": log_data.get("file", {}).get("path"),
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
        "size": 250,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "_source": [
            "@timestamp",
            "host.name",
            "host.ip",
            "host.os.name",
            "asset_id",
            "profile_id",
            "role",
            "site",
            "environment",
            "event.dataset",
            "kubernetes.node.name",
            "kubernetes.node.cpu.usage.nanocores",
            "kubernetes.node.memory.usage.bytes",
            "kubernetes.node.memory.available.bytes",
            "kubernetes.node.network.rx.bytes",
            "kubernetes.node.network.tx.bytes",
            "kubernetes.node.fs.used.bytes",
            "kubernetes.node.fs.available.bytes",
            "system.cpu.total.norm.pct",
            "system.memory.used.pct",
            "system.fsstat.total_size.used",
            "system.fsstat.total_size.total",
        ],
        "query": {
            "bool": {
                "should": [
                    {"term": {"event.dataset": "kubernetes.node"}},
                    {"prefix": {"event.dataset": "system."}},
                ],
                "minimum_should_match": 1,
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
        host_data = source.get("host") or {}
        system = source.get("system") or {}
        cpu_nano = (((node.get("cpu") or {}).get("usage") or {}).get("nanocores")) or 0
        mem_used = (((node.get("memory") or {}).get("usage") or {}).get("bytes")) or 0
        mem_available = (((node.get("memory") or {}).get("available") or {}).get("bytes")) or 1
        cpu_ratio = (((system.get("cpu") or {}).get("total") or {}).get("norm") or {}).get("pct")
        mem_ratio = ((system.get("memory") or {}).get("used") or {}).get("pct")
        if mem_ratio is None:
            mem_ratio = mem_used / max(mem_used + mem_available, 1)
        if cpu_ratio is None:
            cpu_ratio = min(1, cpu_nano / 1_000_000_000) if cpu_nano else 0
        risk = min(95, int((float(cpu_ratio) * 45) + (float(mem_ratio) * 35) + 20))
        host_ips = host_data.get("ip") or []
        primary_ip = host_ips[0] if isinstance(host_ips, list) and host_ips else None
        asset_id = normalize_text(source.get("asset_id"), f"metricbeat-{hostname}")
        hosts.append(
            {
                "id": asset_id,
                "asset_id": asset_id,
                "profile_id": source.get("profile_id"),
                "hostname": hostname,
                "ip": normalize_text(primary_ip, "metricbeat-host"),
                "os": normalize_text((host_data.get("os") or {}).get("name"), "Linux"),
                "role": normalize_text(source.get("role") or ("Kubernetes Node" if node else None), "workstation"),
                "site": source.get("site"),
                "environment": source.get("environment"),
                "riskScore": risk,
                "criticality": "high" if risk >= 70 else "medium",
                "lastSeen": parse_es_timestamp(source.get("@timestamp")),
                "alertCount": 0,
                "status": "online",
                "agent": "installed",
            }
        )
    return hosts


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
                "sourceType": normalize_text(source.get("source_type"), "heuristic"),
                "signature": normalize_text(source.get("signature"), ""),
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
    return fetch_index_documents(PROFILES_INDEX)


def fetch_assets_metadata() -> list[dict[str, Any]]:
    assets = fetch_index_documents(ASSETS_INDEX)
    if assets:
        return assets
    return [
        {
            "id": host.get("asset_id") or host.get("id"),
            "hostname": host.get("hostname"),
            "host_id": host.get("id"),
            "ip": host.get("ip"),
            "os": host.get("os"),
            "role": host.get("role"),
            "site": host.get("site"),
            "environment": host.get("environment"),
            "tags": ["metricbeat", "auto-discovered"],
            "created_at": host.get("lastSeen"),
        }
        for host in fetch_metricbeat_hosts()
    ]


def fetch_profile_asset_links() -> list[dict[str, Any]]:
    return fetch_index_documents(PROFILE_ASSETS_INDEX)
