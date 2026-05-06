import ipaddress
from collections import defaultdict
from datetime import timedelta, timezone
from typing import Any

try:
    from .ns_ai_clients import elastic_request
    from .ns_ai_config import FILEBEAT_INDEX, LOOKBACK_MINUTES, PACKETBEAT_INDEX, iso, now_utc, parse_dt
except ImportError:
    from ns_ai_clients import elastic_request
    from ns_ai_config import FILEBEAT_INDEX, LOOKBACK_MINUTES, PACKETBEAT_INDEX, iso, now_utc, parse_dt


def lookback_gte(minutes: int) -> str:
    return iso(now_utc() - timedelta(minutes=minutes))


def filebeat_hits(minutes: int = LOOKBACK_MINUTES, size: int = 500) -> list[dict[str, Any]]:
    payload = {
        "size": size,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "_source": [
            "@timestamp",
            "message",
            "event.dataset",
            "kubernetes.pod.name",
            "kubernetes.namespace",
            "source.ip",
            "host.name",
            "stream",
            "netsentinel.agent.signals",
        ],
        "query": {"range": {"@timestamp": {"gte": lookback_gte(minutes)}}},
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
            "source.bytes",
            "destination.ip",
            "destination.port",
            "destination.bytes",
            "network.protocol",
            "network.bytes",
            "event.dataset",
            "query",
            "status",
            "host.name",
            "url.path",
        ],
        "query": {"range": {"@timestamp": {"gte": lookback_gte(minutes)}}},
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


def aggregate_current_features(log_hits: list[dict[str, Any]], packet_hits: list[dict[str, Any]]) -> list[dict[str, Any]]:
    features: dict[str, dict[str, Any]] = defaultdict(
        lambda: {
            "source_ip": None,
            "hostname": None,
            "failed_logins": 0,
            "dns_errors": 0,
            "privilege_indicators": 0,
            "defense_evasion_indicators": 0,
            "phishing_indicators": 0,
            "distinct_ports": set(),
            "distinct_destinations": set(),
            "external_destinations": set(),
            "internal_remote_service_hits": 0,
            "exfil_bytes": 0,
            "suspicious_archive_hits": 0,
            "event_count": 0,
            "protocols": set(),
            "http_paths": set(),
        }
    )

    privilege_keywords = (
        "sudo",
        "privilege escalation",
        "added to sudoers",
        "new service creation",
        "setuid",
        "runas",
    )
    evasion_keywords = (
        "shadow copies",
        "vssadmin",
        "clear logs",
        "wevtutil cl",
        "disable defender",
        "tamper",
        "history -c",
        "setenforce 0",
        "stop security service",
    )
    phishing_keywords = (
        "phish",
        "credential harvest",
        "suspicious attachment",
        "macro",
        "dmarc",
        "spf",
        "spoof",
        "mail delivery",
    )
    archive_keywords = (".zip", ".rar", ".7z", "archive upload", "exfil")
    remote_admin_ports = {22, 135, 139, 445, 3389, 5985, 5986}

    for hit in log_hits:
        source = hit.get("_source", {})
        message = str(source.get("message", ""))
        lower_message = message.lower()
        dataset = str((source.get("event") or {}).get("dataset") or "")
        agent_signals = ((((source.get("netsentinel") or {}).get("agent")) or {}).get("signals")) or {}
        ip = safe_source_ip(source)
        if dataset == "netsentinel.agent" and isinstance(agent_signals, dict):
            ip = ip or str(agent_signals.get("source_ip") or "")
            if not ip:
                continue
            row = features[ip]
            row["source_ip"] = ip
            row["hostname"] = row["hostname"] or str(agent_signals.get("hostname") or safe_host(source) or "")
            row["event_count"] += 1
            row["failed_logins"] += int(agent_signals.get("failed_login_indicators") or 0)
            row["privilege_indicators"] += int(agent_signals.get("privilege_indicators") or 0)
            row["defense_evasion_indicators"] += int(agent_signals.get("defense_evasion_indicators") or 0)
            row["phishing_indicators"] += int(agent_signals.get("phishing_indicators") or 0)
            row["suspicious_archive_hits"] += int(agent_signals.get("suspicious_archive_hits") or 0)
            row["internal_remote_service_hits"] += int(agent_signals.get("internal_remote_service_hits") or 0)
            row["exfil_bytes"] += int(agent_signals.get("external_established_connections") or 0) * 500000
            external_count = int(agent_signals.get("external_destinations") or 0)
            if external_count:
                row["external_destinations"].update({f"agent-ext-{idx}" for idx in range(external_count)})
            continue
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
        if any(keyword in lower_message for keyword in privilege_keywords):
            row["privilege_indicators"] += 1
        if any(keyword in lower_message for keyword in evasion_keywords):
            row["defense_evasion_indicators"] += 1
        if any(keyword in lower_message for keyword in phishing_keywords):
            row["phishing_indicators"] += 1
        if any(keyword in lower_message for keyword in archive_keywords):
            row["suspicious_archive_hits"] += 1

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
        network_bytes = int(((source.get("network") or {}).get("bytes")) or 0)
        if dst_port:
            row["distinct_ports"].add(int(dst_port))
        if dst_ip:
            row["distinct_destinations"].add(dst_ip)
            if not is_internal_ip(dst_ip):
                row["external_destinations"].add(dst_ip)
        if protocol:
            row["protocols"].add(protocol)
        if source.get("status") == "Error" and protocol == "dns":
            row["dns_errors"] += 1
        path = (source.get("url") or {}).get("path")
        if path:
            row["http_paths"].add(path)
            if any(keyword in path.lower() for keyword in archive_keywords):
                row["suspicious_archive_hits"] += 1
        if is_internal_ip(row["source_ip"]) and dst_ip and is_internal_ip(dst_ip) and dst_port in remote_admin_ports:
            row["internal_remote_service_hits"] += 1
        if dst_ip and not is_internal_ip(dst_ip):
            row["exfil_bytes"] += network_bytes

    return [
        {
            "source_ip": row["source_ip"],
            "hostname": row["hostname"],
            "failed_logins": row["failed_logins"],
            "dns_errors": row["dns_errors"],
            "privilege_indicators": row["privilege_indicators"],
            "defense_evasion_indicators": row["defense_evasion_indicators"],
            "phishing_indicators": row["phishing_indicators"],
            "distinct_ports": len(row["distinct_ports"]),
            "distinct_destinations": len(row["distinct_destinations"]),
            "external_destinations": len(row["external_destinations"]),
            "internal_remote_service_hits": row["internal_remote_service_hits"],
            "exfil_bytes": row["exfil_bytes"],
            "suspicious_archive_hits": row["suspicious_archive_hits"],
            "event_count": row["event_count"],
            "protocol_count": len(row["protocols"]),
            "http_path_count": len(row["http_paths"]),
            "is_internal": is_internal_ip(row["source_ip"]),
        }
        for row in features.values()
    ]


def aggregate_historical_windows(log_hits: list[dict[str, Any]], packet_hits: list[dict[str, Any]], bucket_minutes: int) -> list[dict[str, Any]]:
    buckets: dict[tuple[str, Any], dict[str, Any]] = defaultdict(
        lambda: {
            "failed_logins": 0,
            "dns_errors": 0,
            "privilege_indicators": 0,
            "defense_evasion_indicators": 0,
            "phishing_indicators": 0,
            "distinct_ports": set(),
            "distinct_destinations": set(),
            "external_destinations": set(),
            "internal_remote_service_hits": 0,
            "exfil_bytes": 0,
            "suspicious_archive_hits": 0,
            "event_count": 0,
            "protocols": set(),
            "http_paths": set(),
            "hostname": None,
        }
    )

    privilege_keywords = (
        "sudo",
        "privilege escalation",
        "added to sudoers",
        "new service creation",
        "setuid",
        "runas",
    )
    evasion_keywords = (
        "shadow copies",
        "vssadmin",
        "clear logs",
        "wevtutil cl",
        "disable defender",
        "tamper",
        "history -c",
        "setenforce 0",
        "stop security service",
    )
    phishing_keywords = (
        "phish",
        "credential harvest",
        "suspicious attachment",
        "macro",
        "dmarc",
        "spf",
        "spoof",
        "mail delivery",
    )
    archive_keywords = (".zip", ".rar", ".7z", "archive upload", "exfil")
    remote_admin_ports = {22, 135, 139, 445, 3389, 5985, 5986}

    def bucket_for(ts: Any):
        dt = parse_dt(ts).astimezone(timezone.utc)
        floored_minute = (dt.minute // bucket_minutes) * bucket_minutes
        return dt.replace(minute=floored_minute, second=0, microsecond=0)

    for hit in log_hits:
        source = hit.get("_source", {})
        message = str(source.get("message", ""))
        lower_message = message.lower()
        dataset = str((source.get("event") or {}).get("dataset") or "")
        agent_signals = ((((source.get("netsentinel") or {}).get("agent")) or {}).get("signals")) or {}
        ip = safe_source_ip(source)
        if dataset == "netsentinel.agent" and isinstance(agent_signals, dict):
            ip = ip or str(agent_signals.get("source_ip") or "")
            if not ip:
                continue
            key = (ip, bucket_for(source.get("@timestamp")))
            row = buckets[key]
            row["hostname"] = row["hostname"] or str(agent_signals.get("hostname") or safe_host(source) or "")
            row["event_count"] += 1
            row["failed_logins"] += int(agent_signals.get("failed_login_indicators") or 0)
            row["privilege_indicators"] += int(agent_signals.get("privilege_indicators") or 0)
            row["defense_evasion_indicators"] += int(agent_signals.get("defense_evasion_indicators") or 0)
            row["phishing_indicators"] += int(agent_signals.get("phishing_indicators") or 0)
            row["suspicious_archive_hits"] += int(agent_signals.get("suspicious_archive_hits") or 0)
            row["internal_remote_service_hits"] += int(agent_signals.get("internal_remote_service_hits") or 0)
            row["exfil_bytes"] += int(agent_signals.get("external_established_connections") or 0) * 500000
            external_count = int(agent_signals.get("external_destinations") or 0)
            if external_count:
                row["external_destinations"].update({f"agent-ext-{idx}" for idx in range(external_count)})
            continue
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
        if any(keyword in lower_message for keyword in privilege_keywords):
            row["privilege_indicators"] += 1
        if any(keyword in lower_message for keyword in evasion_keywords):
            row["defense_evasion_indicators"] += 1
        if any(keyword in lower_message for keyword in phishing_keywords):
            row["phishing_indicators"] += 1
        if any(keyword in lower_message for keyword in archive_keywords):
            row["suspicious_archive_hits"] += 1

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
        network_bytes = int(((source.get("network") or {}).get("bytes")) or 0)
        if protocol:
            row["protocols"].add(protocol)
        if dst_port:
            row["distinct_ports"].add(int(dst_port))
        if dst_ip:
            row["distinct_destinations"].add(dst_ip)
            if not is_internal_ip(dst_ip):
                row["external_destinations"].add(dst_ip)
        if source.get("status") == "Error" and protocol == "dns":
            row["dns_errors"] += 1
        path = (source.get("url") or {}).get("path")
        if path:
            row["http_paths"].add(path)
            if any(keyword in path.lower() for keyword in archive_keywords):
                row["suspicious_archive_hits"] += 1
        if is_internal_ip(ip) and dst_ip and is_internal_ip(dst_ip) and dst_port in remote_admin_ports:
            row["internal_remote_service_hits"] += 1
        if dst_ip and not is_internal_ip(dst_ip):
            row["exfil_bytes"] += network_bytes

    return [
        {
            "source_ip": ip,
            "bucket_start": iso(bucket),
            "hostname": row["hostname"],
            "failed_logins": row["failed_logins"],
            "dns_errors": row["dns_errors"],
            "privilege_indicators": row["privilege_indicators"],
            "defense_evasion_indicators": row["defense_evasion_indicators"],
            "phishing_indicators": row["phishing_indicators"],
            "distinct_ports": len(row["distinct_ports"]),
            "distinct_destinations": len(row["distinct_destinations"]),
            "external_destinations": len(row["external_destinations"]),
            "internal_remote_service_hits": row["internal_remote_service_hits"],
            "exfil_bytes": row["exfil_bytes"],
            "suspicious_archive_hits": row["suspicious_archive_hits"],
            "event_count": row["event_count"],
            "protocol_count": len(row["protocols"]),
            "http_path_count": len(row["http_paths"]),
            "is_internal": is_internal_ip(ip),
        }
        for (ip, bucket), row in buckets.items()
    ]


def feature_vector(row: dict[str, Any]) -> list[float]:
    return [
        float(row["failed_logins"]),
        float(row["dns_errors"]),
        float(row["privilege_indicators"]),
        float(row["defense_evasion_indicators"]),
        float(row["phishing_indicators"]),
        float(row["distinct_ports"]),
        float(row["distinct_destinations"]),
        float(row["external_destinations"]),
        float(row["internal_remote_service_hits"]),
        float(row["exfil_bytes"]),
        float(row["suspicious_archive_hits"]),
        float(row["event_count"]),
        float(row["protocol_count"]),
        float(row["http_path_count"]),
        1.0 if row["is_internal"] else 0.0,
    ]
