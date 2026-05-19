from typing import Any

import requests

try:
    from .ns_config import (
        AI_ALERTS_INDEX,
        AI_SERVICE_URL,
        FILEBEAT_INDEX,
        INGEST_AI_ALERTS_INDEX,
        METRICBEAT_INDEX,
        PACKETBEAT_INDEX,
        alert_signature,
        alert_source_type,
        iso,
        normalize_text,
        now_utc,
    )
    from .ns_elastic import elastic_request
    from .ns_storage import fetch_documents as storage_fetch_documents
except ImportError:
    from ns_config import (
        AI_ALERTS_INDEX,
        AI_SERVICE_URL,
        FILEBEAT_INDEX,
        INGEST_AI_ALERTS_INDEX,
        METRICBEAT_INDEX,
        PACKETBEAT_INDEX,
        alert_signature,
        alert_source_type,
        iso,
        normalize_text,
        now_utc,
    )
    from ns_elastic import elastic_request
    from ns_storage import fetch_documents as storage_fetch_documents


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
        "query": {"term": {"event.dataset": "kubernetes.node"}},
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
    if not hits:
        hits = [
            {"_id": item.get("id"), "_source": item}
            for item in [
                *storage_fetch_documents(INGEST_AI_ALERTS_INDEX, size=50),
                *storage_fetch_documents(AI_ALERTS_INDEX, size=50),
            ]
        ]
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
                "sourceType": normalize_text(source.get("source_type"), alert_source_type(source.get("title"))),
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
