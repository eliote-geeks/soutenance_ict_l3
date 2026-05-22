"""
features.py
-----------
Feature engineering for the AI Engine.
Transforms raw Elasticsearch hits into structured feature rows
that heuristics and ML models can consume.

No detection logic here — only data transformation.
"""

import ipaddress
from collections import defaultdict
from datetime import timedelta, timezone
from typing import Any

from .config import ML_BUCKET_MINUTES
from .utils import iso, now_utc, parse_dt


# ---------------------------------------------------------------------------
# Safe field extractors
# ---------------------------------------------------------------------------

def safe_source_ip(source: dict[str, Any]) -> str | None:
    return (source.get("source") or {}).get("ip")


def safe_dest_ip(source: dict[str, Any]) -> str | None:
    return (source.get("destination") or {}).get("ip")


def safe_host(source: dict[str, Any]) -> str | None:
    return (source.get("host") or {}).get("name")


def is_internal_ip(value: str | None) -> bool:
    """Return True if the IP address is private, loopback, or link-local."""
    if not value:
        return False
    try:
        ip = ipaddress.ip_address(value)
    except ValueError:
        return False
    return ip.is_private or ip.is_loopback or ip.is_link_local


# ---------------------------------------------------------------------------
# Feature vector builder (for ML models)
# ---------------------------------------------------------------------------

def feature_vector(row: dict[str, Any]) -> list[float]:
    """
    Convert a feature row dict into a numeric vector for ML models.
    Order matters — keep consistent between training and inference.
    """
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


# ---------------------------------------------------------------------------
# Current window aggregation (for real-time detection)
# ---------------------------------------------------------------------------

def aggregate_current_features(
    log_hits: list[dict[str, Any]],
    packet_hits: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """
    Aggregate Filebeat + Packetbeat hits into one feature row per source IP.
    Used for heuristic and ML inference on the current time window.
    """
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

    # --- Filebeat logs ---
    for hit in log_hits:
        source = hit.get("_source", {})
        message = str(source.get("message", ""))
        ip = safe_source_ip(source)

        # Try to extract IP from SSH log messages if not in field
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

    # --- Packetbeat network flows ---
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

    # --- Serialize sets to counts ---
    return [
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
        for row in features.values()
    ]


# ---------------------------------------------------------------------------
# Historical window aggregation (for ML training)
# ---------------------------------------------------------------------------

def aggregate_historical_windows(
    log_hits: list[dict[str, Any]],
    packet_hits: list[dict[str, Any]],
    bucket_minutes: int = ML_BUCKET_MINUTES,
) -> list[dict[str, Any]]:
    """
    Aggregate hits into time-bucketed feature rows (one per IP per time window).
    Used to build the training baseline for IsolationForest.
    """
    buckets: dict[tuple[str, Any], dict[str, Any]] = defaultdict(
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

    def bucket_for(ts: Any):
        dt = parse_dt(ts).astimezone(timezone.utc)
        floored_minute = (dt.minute // bucket_minutes) * bucket_minutes
        return dt.replace(minute=floored_minute, second=0, microsecond=0)

    # --- Filebeat logs ---
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

    # --- Packetbeat flows ---
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

    # --- Serialize ---
    return [
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
        for (ip, bucket), row in buckets.items()
    ]