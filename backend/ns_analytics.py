import ipaddress
from copy import deepcopy
from datetime import timedelta
from typing import Any

import requests

try:
    from .ns_elastic import ai_service_configured
    from .ns_config import (
        AI_ALERTS_INDEX,
        START_TIME,
        alert_signature,
        alert_source_type,
        iso,
        normalize_text,
        now_utc,
        parse_dt,
        percent_change,
        severity_weight,
    )
except ImportError:
    from ns_elastic import ai_service_configured
    from ns_config import (
        AI_ALERTS_INDEX,
        START_TIME,
        alert_signature,
        alert_source_type,
        iso,
        normalize_text,
        now_utc,
        parse_dt,
        percent_change,
        severity_weight,
    )

try:
    from .ns_demo_data import AI_FINDINGS_BUFFER, BLOCKED_IPS
    from .ns_telemetry import (
        aggregate_packetbeat_traffic as aggregate_telemetry_traffic,
        fetch_ai_runtime_status,
        fetch_elastic_alerts,
        fetch_elastic_logs,
        fetch_metricbeat_hosts,
        fetch_packetbeat_events,
        telemetry_health,
    )
except ImportError:
    from ns_demo_data import AI_FINDINGS_BUFFER, BLOCKED_IPS
    from ns_telemetry import (
        aggregate_packetbeat_traffic as aggregate_telemetry_traffic,
        fetch_ai_runtime_status,
        fetch_elastic_alerts,
        fetch_elastic_logs,
        fetch_metricbeat_hosts,
        fetch_packetbeat_events,
        telemetry_health,
    )


def current_alerts() -> list[dict]:
    raw = fetch_elastic_alerts()
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
    return fetch_metricbeat_hosts()


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


def aggregate_packetbeat_traffic() -> list[dict]:
    return aggregate_telemetry_traffic(traffic_data(), current_alerts())


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
        return "single-source" if len(unique_sources) <= 1 else "campaign"

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
        timeline = [{"timestamp": alert.get("timestamp"), "action": f"{alert.get('title')} ({normalize_text(alert.get('sourceIP'), 'unknown')})"} for alert in alerts_sorted[-8:]]
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
        "versions": [{"version": "hybrid-heuristics-iforest", "status": "active", "precision": None, "recall": None, "f1": None, "falsePositives": len([item for item in alerts if normalize_text(item.get("severity"), "medium") == "low"]), "deployedAt": "live"}],
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
        forecast.append({"timestamp": iso(stamp), "predicted": predicted, "lower": max(predicted - 1, 0), "upper": predicted + 2})
    next_targets = [{"hostname": item["hostname"], "probability": round(min(0.99, max(0.15, item["riskScore"] / 100)), 2), "reason": f"Risk score {item['riskScore']} derived from current telemetry"} for item in sorted(hosts, key=lambda host: host["riskScore"], reverse=True)[:5]]
    risk_trend = "stable"
    if recent_avg > previous_avg:
        risk_trend = "increasing"
    elif recent_avg < previous_avg:
        risk_trend = "decreasing"
    confidence = min(0.95, 0.55 + min(len(alerts), 20) / 50)
    return {"forecast": forecast, "nextTargets": next_targets, "riskTrend": risk_trend, "confidence": confidence}


def derive_pipeline_health(logs: list[dict], packet_events: list[dict], alerts: list[dict], hosts: list[dict]) -> dict:
    uptime_seconds = int((now_utc() - START_TIME).total_seconds())
    host_cpu = min(95, max(5, int(sum(item["riskScore"] for item in hosts) / max(len(hosts), 1))))
    host_memory = min(95, 35 + max(0, len(logs) // 3))
    telemetry_status = telemetry_health()
    services = [
        {"name": "Packetbeat", "type": "collector", "status": "healthy" if packet_events else "degraded", "cpu": host_cpu, "memory": host_memory},
        {"name": "Filebeat", "type": "collector", "status": "healthy" if logs else "degraded", "cpu": max(10, host_cpu - 5), "memory": max(10, host_memory - 8)},
        {"name": "AI inference service", "type": "analysis", "status": "healthy" if alerts else "degraded", "cpu": max(10, host_cpu - 8), "memory": max(10, host_memory - 12)},
        {"name": "NetSentinel API", "type": "api", "status": "healthy", "cpu": max(5, host_cpu - 15), "memory": max(10, host_memory - 15)},
    ]
    if telemetry_status.get("configured"):
        backend = normalize_text(telemetry_status.get("backend"), "telemetry")
        health_status = "healthy" if telemetry_status.get("reachable") else "degraded"
        details = telemetry_status.get("details") or {}
        if backend == "elastic" and isinstance(details, dict):
            elastic_status = normalize_text(details.get("status"), "healthy").strip().lower()
            health_status = "degraded" if elastic_status == "yellow" else ("down" if elastic_status == "red" else "healthy")
        services.insert(2, {"name": f"{backend.title()} telemetry", "type": "storage", "status": health_status, "cpu": max(10, host_cpu - 3), "memory": min(98, host_memory + 8)})
    throughput = max(len(packet_events), len(logs), len(alerts)) * 10
    return {"services": services, "ingestionLag": max(10, 200 - min(len(packet_events) * 3, 150)), "queueDepth": max(0, len(alerts) - len(hosts)), "droppedEvents": 0 if logs and packet_events else 1, "throughput": throughput, "uptime": round(min(99.9, 95 + uptime_seconds / 20000), 2)}


def risky_hosts() -> list[dict]:
    return sorted(current_hosts(), key=lambda item: item.get("riskScore", 0), reverse=True)[:5]


def attacking_ips() -> list[dict]:
    counts = {}
    for alert in ALERTS:
        counts.setdefault(alert["sourceIP"], {"count": 0, "severity": alert["severity"], "timestamp": alert["timestamp"]})
        counts[alert["sourceIP"]]["count"] += 1
        counts[alert["sourceIP"]]["severity"] = alert["severity"]
        counts[alert["sourceIP"]]["timestamp"] = alert["timestamp"]
    ranked = []
    for index, (ip, details) in enumerate(counts.items(), start=1):
        ranked.append({"id": f"ip-{index}", "ip": ip, "country": ["CM", "RU", "NL", "US"][index % 4], "attackCount": details["count"] * 23, "lastAttack": details["timestamp"], "blocked": ip in BLOCKED_IPS, "threatLevel": details["severity"]})
    return sorted(ranked, key=lambda item: item["attackCount"], reverse=True)


def anomaly_score() -> dict:
    return {"current": 67, "threshold": 75, "trend": [34, 39, 44, 40, 48, 52, 58, 61, 63, 66, 64, 67]}


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
    return {"eventsPerSecond": 184, "bytesPerSecond": 782344, "failedLogins": 17, "activeConnections": 624, "latency": 34, "queueDepth": 9}


def logs_feed() -> list[dict]:
    base = now_utc()
    return [
        {"id": "log-1", "timestamp": iso(base - timedelta(minutes=3)), "level": "WARN", "source": "filebeat-auth", "message": "sshd[28411]: Failed password for invalid user admin from 185.227.134.41 port 50818 ssh2", "fields": {"host": "auth-gateway-01", "program": "sshd", "source_ip": "185.227.134.41"}},
        {"id": "log-2", "timestamp": iso(base - timedelta(minutes=5)), "level": "INFO", "source": "fail2ban", "message": "Ban 185.227.134.41 after 5 retries on jail sshd", "fields": {"jail": "sshd", "action": "ban", "source_ip": "185.227.134.41"}},
        {"id": "log-3", "timestamp": iso(base - timedelta(minutes=7)), "level": "WARN", "source": "packetbeat", "message": "Detected port scan pattern toward 10.10.0.0/24", "fields": {"flow_count": 37, "ports": [22, 80, 443, 3306], "source_ip": "102.219.88.14"}},
        {"id": "log-4", "timestamp": iso(base - timedelta(minutes=10)), "level": "INFO", "source": "filebeat-system", "message": "sudo session opened for user root by ubuntu(uid=1000)", "fields": {"host": "app-node-01", "program": "sudo", "user": "ubuntu"}},
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
        "serviceUrl": fetch_ai_runtime_status().get("serviceUrl"),
        "modelVersion": "iforest-1.3",
        "mode": "external-service" if ai_service_configured() else "local-demo-contract",
        "lastInferenceAt": iso(now_utc() - timedelta(seconds=18)),
        "writesToIndex": AI_ALERTS_INDEX,
    }


def ai_findings() -> list[dict]:
    alerts = fetch_elastic_alerts() or []
    findings = []
    for alert in alerts:
        findings.append({"findingId": alert["id"], "timestamp": alert["timestamp"], "title": alert["title"], "severity": alert["severity"], "hostname": alert["hostname"], "sourceIP": alert["sourceIP"], "confidence": 0.84 if alert["severity"] in {"critical", "high"} else 0.71, "recommendation": alert["recommendation"]})
    return findings


def ai_recommendations() -> list[dict]:
    return [
        {"pattern": "Brute force SSH detected", "recommendation": "Ban source IP, disable password authentication and audit affected accounts.", "commands": ["sudo fail2ban-client status sshd", "sudo grep 'Failed password' /var/log/auth.log | tail -n 50", "sudo sed -i 's/^#*PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config"]},
        {"pattern": "Horizontal port scan observed", "recommendation": "Block the scanner at the firewall and reduce externally exposed ports.", "commands": ["sudo ufw deny from <source-ip>", "sudo ss -tulpn", "sudo nmap -sV <host>"]},
        {"pattern": "Abnormal outbound DNS burst", "recommendation": "Investigate the process generating DNS traffic and isolate the endpoint if persistence is observed.", "commands": ["sudo lsof -i :53", "sudo tcpdump -ni any port 53 -c 50", "sudo netstat -plant"]},
    ]


def ai_attack_knowledge_base() -> dict:
    if ai_service_configured():
        runtime = fetch_ai_runtime_status()
        service_url = runtime.get("serviceUrl")
        if service_url:
            try:
                response = requests.get(f"{service_url}/attack-knowledge-base", timeout=8)
                response.raise_for_status()
                return response.json()
            except requests.RequestException:
                pass
    return {
        "dictionary": {"source": "MITRE ATT&CK Enterprise", "mode": "backend-fallback"},
        "profileCount": 3,
        "profiles": [
            {"id": "ssh_bruteforce", "name": "SSH brute force", "tactic": "Credential Access", "techniques": [{"id": "T1110", "name": "Brute Force"}]},
            {"id": "dns_c2_anomaly", "name": "DNS command-and-control anomaly", "tactic": "Command and Control", "techniques": [{"id": "T1071.004", "name": "DNS"}]},
            {"id": "port_scan", "name": "Network service discovery / port scan", "tactic": "Discovery", "techniques": [{"id": "T1046", "name": "Network Service Discovery"}]},
        ],
    }


def predictions_data() -> dict:
    forecast = []
    current = now_utc().replace(minute=0, second=0, microsecond=0)
    for offset in range(24):
        stamp = current + timedelta(hours=offset)
        predicted = 18 + (offset % 6) * 4
        forecast.append({"timestamp": iso(stamp), "predicted": predicted, "lower": max(predicted - 5, 0), "upper": predicted + 7})
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
