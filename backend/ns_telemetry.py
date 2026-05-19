from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

try:
    from .ns_config import (
        NETSENTINEL_TELEMETRY_BACKEND,
        PACKETBEAT_INDEX,
        TELEMETRY_JSON_PATH,
        iso,
        normalize_text,
        parse_dt,
    )
    from .ns_elastic import elastic_configured, elastic_request
    from .ns_ingest import (
        fetch_elastic_alerts as elastic_fetch_alerts,
        fetch_elastic_logs as elastic_fetch_logs,
        fetch_ai_runtime_status,
        fetch_metricbeat_hosts as elastic_fetch_hosts,
        fetch_packetbeat_events as elastic_fetch_packet_events,
    )
except ImportError:
    from ns_config import (
        NETSENTINEL_TELEMETRY_BACKEND,
        PACKETBEAT_INDEX,
        TELEMETRY_JSON_PATH,
        iso,
        normalize_text,
        parse_dt,
    )
    from ns_elastic import elastic_configured, elastic_request
    from ns_ingest import (
        fetch_elastic_alerts as elastic_fetch_alerts,
        fetch_elastic_logs as elastic_fetch_logs,
        fetch_ai_runtime_status,
        fetch_metricbeat_hosts as elastic_fetch_hosts,
        fetch_packetbeat_events as elastic_fetch_packet_events,
    )


def telemetry_backend() -> str:
    return NETSENTINEL_TELEMETRY_BACKEND


def telemetry_configured() -> bool:
    if NETSENTINEL_TELEMETRY_BACKEND == "elastic":
        return elastic_configured()
    if NETSENTINEL_TELEMETRY_BACKEND == "json":
        return True
    return False


def telemetry_health() -> dict[str, Any]:
    if NETSENTINEL_TELEMETRY_BACKEND == "elastic":
        elastic_ok = elastic_request("GET", "/_cluster/health") if elastic_configured() else None
        return {
            "backend": "elastic",
            "configured": elastic_configured(),
            "reachable": bool(elastic_ok),
            "details": elastic_ok or {},
        }
    if NETSENTINEL_TELEMETRY_BACKEND == "json":
        return {
            "backend": "json",
            "configured": True,
            "reachable": TELEMETRY_JSON_PATH.exists(),
            "path": str(TELEMETRY_JSON_PATH),
        }
    return {
        "backend": NETSENTINEL_TELEMETRY_BACKEND,
        "configured": False,
        "reachable": False,
    }


def _load_json_telemetry() -> dict[str, list[dict[str, Any]]]:
    if not TELEMETRY_JSON_PATH.exists():
        return {}
    try:
        payload = json.loads(TELEMETRY_JSON_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict):
        return {}
    return {
        str(key): [dict(item) for item in value if isinstance(item, dict)]
        for key, value in payload.items()
        if isinstance(value, list)
    }


def _rows(name: str, size: int = 200) -> list[dict[str, Any]]:
    return (_load_json_telemetry().get(name) or [])[:size]


def fetch_elastic_logs() -> list[dict]:
    if NETSENTINEL_TELEMETRY_BACKEND == "elastic":
        return elastic_fetch_logs()
    if NETSENTINEL_TELEMETRY_BACKEND == "json":
        return _rows("logs", size=500)
    return []


def fetch_packetbeat_events() -> list[dict]:
    if NETSENTINEL_TELEMETRY_BACKEND == "elastic":
        return elastic_fetch_packet_events()
    if NETSENTINEL_TELEMETRY_BACKEND == "json":
        return _rows("packet_events", size=500)
    return []


def fetch_metricbeat_hosts() -> list[dict]:
    if NETSENTINEL_TELEMETRY_BACKEND == "elastic":
        return elastic_fetch_hosts()
    if NETSENTINEL_TELEMETRY_BACKEND == "json":
        return _rows("metric_hosts", size=200)
    return []


def fetch_elastic_alerts() -> list[dict]:
    if NETSENTINEL_TELEMETRY_BACKEND == "elastic":
        return elastic_fetch_alerts()
    if NETSENTINEL_TELEMETRY_BACKEND == "json":
        return _rows("ai_alerts", size=200)
    return []


def aggregate_packetbeat_traffic(default_points: list[dict], alerts: list[dict]) -> list[dict]:
    if NETSENTINEL_TELEMETRY_BACKEND == "elastic":
        payload = {
            "size": 0,
            "query": {"range": {"@timestamp": {"gte": "now-24h", "lte": "now"}}},
            "aggs": {
                "traffic_over_time": {
                    "date_histogram": {"field": "@timestamp", "fixed_interval": "1h", "min_doc_count": 0},
                    "aggs": {
                        "inbound_bytes": {"sum": {"field": "source.bytes"}},
                        "outbound_bytes": {"sum": {"field": "destination.bytes"}},
                    },
                }
            },
        }
        result = elastic_request("GET", f"/{PACKETBEAT_INDEX}/_search", payload)
        buckets = ((((result or {}).get("aggregations") or {}).get("traffic_over_time") or {}).get("buckets")) or []
        if not buckets:
            return default_points
        points = []
        for bucket in buckets:
            dt = parse_dt(bucket.get("key_as_string"))
            hour_alerts = [
                item for item in alerts
                if parse_dt(item.get("timestamp")).replace(minute=0, second=0, microsecond=0) == dt.replace(minute=0, second=0, microsecond=0)
            ]
            inbound = int((((bucket.get("inbound_bytes") or {}).get("value")) or 0) / 1024)
            outbound = int((((bucket.get("outbound_bytes") or {}).get("value")) or 0) / 1024)
            points.append(
                {
                    "time": dt.strftime("%H:%M"),
                    "timestamp": iso(dt),
                    "inbound": max(inbound, 0),
                    "outbound": max(outbound, 0),
                    "blocked": len([item for item in hour_alerts if normalize_text(item.get("status"), "open") in {"resolved", "blocked"}]),
                    "anomalous": len(hour_alerts),
                }
            )
        return points

    if NETSENTINEL_TELEMETRY_BACKEND == "json":
        explicit_points = _rows("traffic", size=200)
        if explicit_points:
            return explicit_points
        packet_events = fetch_packetbeat_events()
        if not packet_events:
            return default_points
        points_by_hour: dict[str, dict[str, Any]] = {}
        for event in packet_events:
            dt = parse_dt(event.get("timestamp"))
            bucket = dt.replace(minute=0, second=0, microsecond=0)
            key = iso(bucket)
            row = points_by_hour.setdefault(
                key,
                {"time": bucket.strftime("%H:%M"), "timestamp": key, "inbound": 0, "outbound": 0, "blocked": 0, "anomalous": 0},
            )
            bytes_value = int(event.get("bytes") or event.get("networkBytes") or 0)
            row["inbound"] += max(0, bytes_value // 2048)
            row["outbound"] += max(0, bytes_value // 2048)
        return list(sorted(points_by_hour.values(), key=lambda item: item["timestamp"]))

    return default_points
