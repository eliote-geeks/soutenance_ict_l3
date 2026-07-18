import ipaddress
from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any

from .config import START_TIME
from .data import AI_FINDINGS_BUFFER, ALERTS, BLOCKED_IPS, HOSTS
from .elastic import (
    ai_service_configured,
    elastic_configured,
    elastic_request,
    fetch_ai_runtime_status,
    fetch_elastic_alerts,
    fetch_elastic_logs,
    fetch_packetbeat_events,
)
from .utils import iso, normalize_text, parse_dt


def elastic_events_from_logs(logs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    events = []
    for index, item in enumerate(logs[:20], start=1):
        fields = item.get("fields", {})
        level = normalize_text(item.get("level"), "INFO").lower()
        severity = "medium"
        if level == "error":
            severity = "high"
        elif level == "warn":
            severity = "medium"
        elif normalize_text(item.get("source"), "").lower() == "fail2ban":
            severity = "high"
        events.append(
            {
                "id": f"elastic-event-{index}",
                "timestamp": item["timestamp"],
                "type": normalize_text(item.get("message"), "elastic event")[:80],
                "severity": severity,
                "sourceIP": normalize_text(fields.get("source_ip"), "unknown"),
                "destIP": normalize_text(fields.get("destination_ip"), "unknown"),
                "destPort": int(fields.get("destination_port") or 0),
                "hostname": normalize_text(fields.get("host"), "unknown-host"),
                "user": fields.get("user"),
                "details": normalize_text(item.get("message"), ""),
                "mitreTactic": "Discovery" if "scan" in normalize_text(item.get("message"), "").lower() else "Credential Access",
                "modelVersion": "elastic-pass-through",
                "confidence": 68,
            }
        )
    return events


def derive_attacking_ips(alerts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, dict[str, Any]] = {}
    for alert in alerts:
        ip = normalize_text(alert.get("sourceIP"), "")
        if not ip or ip == "unknown":
            continue
        counts.setdefault(ip, {"count": 0, "severity": normalize_text(alert.get("severity"), "medium"), "timestamp": alert.get("timestamp")})
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


def severity_weight(severity: str | None) -> int:
    return {"critical": 4, "high": 3, "medium": 2, "low": 1}.get(normalize_text(severity, "medium").lower(), 1)


def derive_anomaly_score(alerts: list[dict[str, Any]], packet_events: list[dict[str, Any]], logs: list[dict[str, Any]]) -> dict[str, Any]:
    recent_alerts = len([item for item in alerts if parse_dt(item.get("timestamp")) >= datetime.now(timezone.utc) - timedelta(hours=6)])
    recent_packet = len(packet_events)
    error_logs = len([item for item in logs if normalize_text(item.get("level"), "").upper() in {"WARN", "ERROR"}])
    current = min(100, (recent_alerts * 12) + min(recent_packet, 40) + min(error_logs * 2, 20))
    trend = []
    for hours in range(11, -1, -1):
        cutoff_end = datetime.now(timezone.utc) - timedelta(hours=hours)
        cutoff_start = cutoff_end - timedelta(hours=1)
        bucket_score = len([item for item in alerts if cutoff_start <= parse_dt(item.get("timestamp")) < cutoff_end]) * 15
        trend.append(min(100, bucket_score + 20))
    return {"current": current, "threshold": 75, "trend": trend}


def derive_realtime_metrics(packet_events: list[dict[str, Any]], logs: list[dict[str, Any]], alerts: list[dict[str, Any]]) -> dict[str, Any]:
    now = datetime.now(timezone.utc)
    recent_packets = len([item for item in packet_events if parse_dt(item.get("timestamp")) >= now - timedelta(minutes=1)])
    recent_logs = len([item for item in logs if parse_dt(item.get("timestamp")) >= now - timedelta(minutes=5)])
    failed_logins = len([item for item in logs if "failed" in normalize_text(item.get("message"), "").lower()])
    return {
        "eventsPerSecond": recent_packets or max(1, len(packet_events)),
        "bytesPerSecond": sum(int((item.get("destPort") or 0) * 50) for item in packet_events[:50]),
        "failedLogins": failed_logins,
        "activeConnections": len({(item.get("sourceIP"), item.get("destIP"), item.get("destPort")) for item in packet_events}),
        "latency": 25 + min(len(alerts) * 3, 60),
        "queueDepth": max(0, len(alerts) - 2),
    }


def derive_incidents(alerts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    def alert_family(alert: dict[str, Any]) -> str:
        title = normalize_text(alert.get("title"), "").lower()
        if "ssh" in title or "brute force" in title:
            return "ssh-bruteforce"
        if "dns" in title:
            return "dns-anomaly"
        if "port scan" in title or "scan" in title:
            return "port-scan"
        if "ml network anomaly" in title:
            return "ml-anomaly"
        return normalize_text(alert.get("mitreTactic"), "Security").lower().replace(" ", "-")

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
                "severity": normalize_text(alert.get("severity"), "medium"),
                "assignee": normalize_text(alert.get("assignee"), "Unassigned"),
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
            groups[key]["severity"] = alert.get("severity")

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


def _custom_rule_matches(rule: dict[str, Any], alerts: list[dict[str, Any]], logs: list[dict[str, Any]]) -> int:
    field = normalize_text(rule.get("field"), "message")
    operator = normalize_text(rule.get("operator"), "contains").lower()
    expected = normalize_text(rule.get("value"), "").lower()
    if not expected:
        return 0

    rows: list[dict[str, Any]] = []
    if field.startswith("alert."):
        rows = alerts
        field = field.removeprefix("alert.")
    elif field.startswith("log."):
        rows = logs
        field = field.removeprefix("log.")
    else:
        rows = [*alerts, *logs]

    count = 0
    for row in rows:
        fields = row.get("fields") or {}
        raw = row.get(field)
        if raw is None:
            raw = fields.get(field)
        actual = normalize_text(raw, "").lower()
        if operator == "equals" and actual == expected:
            count += 1
        elif operator == "starts_with" and actual.startswith(expected):
            count += 1
        elif operator == "contains" and expected in actual:
            count += 1
    return count


def derive_model_metrics(alerts: list[dict[str, Any]], logs: list[dict[str, Any]], packet_events: list[dict[str, Any]], custom_rules: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    ai_runtime = fetch_ai_runtime_status()
    title_counts: dict[str, int] = {}
    for alert in alerts:
        title = normalize_text(alert.get("title"), "unknown")
        title_counts[title] = title_counts.get(title, 0) + 1
    total_alerts = max(len(alerts), 1)
    features = [
        {"name": "ssh_failed_logins", "importance": len([item for item in logs if "failed password" in normalize_text(item.get("message"), "").lower()]) / max(len(logs), 1), "trend": "up"},
        {"name": "distinct_dst_ports", "importance": len({item.get("destPort") for item in packet_events if item.get("destPort")}) / max(len(packet_events), 1), "trend": "stable"},
        {"name": "dns_error_findings", "importance": sum(count for title, count in title_counts.items() if "dns" in title.lower()) / total_alerts, "trend": "up"},
        {"name": "high_severity_ratio", "importance": len([item for item in alerts if normalize_text(item.get("severity"), "medium") in {"high", "critical"}]) / total_alerts, "trend": "stable"},
    ]
    detectors = [
        {"name": "SSH brute force", "rule": "failed passwords over threshold", "matches": sum(count for title, count in title_counts.items() if "ssh" in title.lower())},
        {"name": "DNS burst anomaly", "rule": "dns errors over threshold", "matches": sum(count for title, count in title_counts.items() if "dns" in title.lower())},
        {"name": "Port scan", "rule": "distinct destination ports over threshold", "matches": sum(count for title, count in title_counts.items() if "port scan" in title.lower())},
        {"name": "ML anomaly", "rule": "isolation forest outlier on live feature window", "matches": sum(count for title, count in title_counts.items() if "ml network anomaly" in title.lower())},
    ]
    for rule in custom_rules or []:
        detectors.append(
            {
                "id": rule.get("id"),
                "name": rule.get("name"),
                "rule": f"{rule.get('field')} {rule.get('operator')} {rule.get('value')}",
                "matches": _custom_rule_matches(rule, alerts, logs) if rule.get("enabled", True) else 0,
                "custom": True,
                "enabled": rule.get("enabled", True),
                "severity": rule.get("severity", "medium"),
                "attackType": rule.get("attack_type", "Custom"),
                "description": rule.get("description"),
                "createdAt": rule.get("created_at"),
            }
        )

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
        "detectors": detectors,
        "drift": min(0.99, len(alerts) / max(len(packet_events), 1)),
        "latencyMs": 40 + min(len(packet_events), 100),
        "thresholds": (ai_runtime.get("thresholds") if isinstance(ai_runtime, dict) else None) or {},
        "dedupWindowMinutes": ai_runtime.get("dedupWindowMinutes") if isinstance(ai_runtime, dict) else None,
        "ml": (ai_runtime.get("ml") if isinstance(ai_runtime, dict) else None) or {},
    }


def derive_predictions(alerts: list[dict[str, Any]], hosts: list[dict[str, Any]]) -> dict[str, Any]:
    now = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
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
    next_targets = [
        {"hostname": item["hostname"], "probability": round(min(0.99, max(0.15, item["riskScore"] / 100)), 2), "reason": f"Risk score {item['riskScore']} derived from current telemetry"}
        for item in sorted(hosts, key=lambda host: host["riskScore"], reverse=True)[:5]
    ]
    risk_trend = "stable"
    if recent_avg > previous_avg:
        risk_trend = "increasing"
    elif recent_avg < previous_avg:
        risk_trend = "decreasing"
    confidence = min(0.95, 0.55 + min(len(alerts), 20) / 50)
    return {"forecast": forecast, "nextTargets": next_targets, "riskTrend": risk_trend, "confidence": confidence}


def derive_pipeline_health(logs: list[dict[str, Any]], packet_events: list[dict[str, Any]], alerts: list[dict[str, Any]], hosts: list[dict[str, Any]]) -> dict[str, Any]:
    uptime_seconds = int((datetime.now(timezone.utc) - START_TIME).total_seconds())
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
        services.insert(2, {"name": "Elasticsearch", "type": "storage", "status": elastic_status, "cpu": max(10, host_cpu - 3), "memory": min(98, host_memory + 8)})
    throughput = max(len(packet_events), len(logs), len(alerts)) * 10
    return {
        "services": services,
        "ingestionLag": max(10, 200 - min(len(packet_events) * 3, 150)),
        "queueDepth": max(0, len(alerts) - len(hosts)),
        "droppedEvents": 0 if logs and packet_events else 1,
        "throughput": throughput,
        "uptime": round(min(99.9, 95 + uptime_seconds / 20000), 2),
    }


def traffic_data() -> list[dict[str, Any]]:
    base = datetime.now(timezone.utc)
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


def live_events() -> list[dict[str, Any]]:
    rows = []
    model_versions = ["isolation-forest-1.3", "hybrid-rules-2.1", "sequence-detector-0.9"]
    for index, alert in enumerate(ALERTS, start=1):
        rows.append(
            {
                "id": f"event-{index}",
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


def logs_feed() -> list[dict[str, Any]]:
    base = datetime.now(timezone.utc)
    return [
        {"id": "log-1", "timestamp": iso(base - timedelta(minutes=3)), "level": "WARN", "source": "filebeat-auth", "message": "sshd[28411]: Failed password for invalid user admin from 185.227.134.41 port 50818 ssh2", "fields": {"host": "auth-gateway-01", "program": "sshd", "source_ip": "185.227.134.41"}},
        {"id": "log-2", "timestamp": iso(base - timedelta(minutes=5)), "level": "INFO", "source": "fail2ban", "message": "Ban 185.227.134.41 after 5 retries on jail sshd", "fields": {"jail": "sshd", "action": "ban", "source_ip": "185.227.134.41"}},
        {"id": "log-3", "timestamp": iso(base - timedelta(minutes=7)), "level": "WARN", "source": "packetbeat", "message": "Detected port scan pattern toward 10.10.0.0/24", "fields": {"flow_count": 37, "ports": [22, 80, 443, 3306], "source_ip": "102.219.88.14"}},
        {"id": "log-4", "timestamp": iso(base - timedelta(minutes=10)), "level": "INFO", "source": "filebeat-system", "message": "sudo session opened for user root by ubuntu(uid=1000)", "fields": {"host": "app-node-01", "program": "sudo", "user": "ubuntu"}},
    ]


def model_metrics() -> dict[str, Any]:
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


def ai_status() -> dict[str, Any]:
    service_url = None
    if ai_service_configured():
        service_url = "configured"
    return {
        "configured": ai_service_configured(),
        "serviceUrl": service_url,
        "modelVersion": "iforest-1.3",
        "mode": "external-service" if ai_service_configured() else "local-demo-contract",
        "lastInferenceAt": iso(datetime.now(timezone.utc) - timedelta(seconds=18)),
        "writesToIndex": "ai-alerts-*",
    }


def ai_findings() -> list[dict[str, Any]]:
    alerts = fetch_elastic_alerts() or deepcopy(AI_FINDINGS_BUFFER) or deepcopy(ALERTS)
    findings = []
    for alert in alerts:
        findings.append(
            {
                "findingId": alert.get("id"),
                "timestamp": alert.get("timestamp"),
                "title": alert.get("title"),
                "severity": alert.get("severity"),
                "hostname": alert.get("hostname"),
                "sourceIP": alert.get("sourceIP"),
                "confidence": 0.84 if normalize_text(alert.get("severity"), "medium") in {"critical", "high"} else 0.71,
                "recommendation": alert.get("recommendation"),
            }
        )
    return findings


def ai_recommendations() -> list[dict[str, Any]]:
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


def predictions_data() -> dict[str, Any]:
    forecast = []
    current = datetime.now(timezone.utc).replace(minute=0, second=0, microsecond=0)
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


def pipeline_health() -> dict[str, Any]:
    uptime_seconds = int((datetime.now(timezone.utc) - START_TIME).total_seconds())
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
