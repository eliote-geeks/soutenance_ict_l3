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

# ---------------------------------------------------------------------------
# Flow-level feature extraction (for RandomForest — CICIDS-compatible)
# ---------------------------------------------------------------------------

def extract_flow_features(hit: dict) -> dict | None:
    """
    Extract per-flow features from a Packetbeat document.
    Feature names and scales match CICIDS2018 columns exactly.
    Returns None if essential fields are missing.
    """
    src = hit.get("_source", {})

    net       = src.get("network") or {}
    source    = src.get("source")  or {}
    dest      = src.get("destination") or {}
    event     = src.get("event")   or {}

    # Essential fields — skip flow if missing
    net_bytes   = net.get("bytes")
    net_packets = net.get("packets")
    src_ip      = source.get("ip")
    dst_ip      = dest.get("ip")
    duration_ns = event.get("duration")  # nanoseconds

    if None in (net_bytes, net_packets, src_ip, dst_ip, duration_ns):
        return None
    if net_packets == 0 or duration_ns == 0:
        return None

    duration_us = max(duration_ns / 1_000, 1)      # microseconds (CICIDS unit)
    duration_s  = duration_ns / 1_000_000_000       # seconds

    src_bytes   = float(source.get("bytes")   or 0)
    dst_bytes   = float(dest.get("bytes")     or 0)
    src_packets = float(source.get("packets") or 0)
    dst_packets = float(dest.get("packets")   or 0)
    transport   = str(net.get("transport")    or "").lower()

    # Derived metrics
    flow_packets_per_s = float(net_packets) / duration_s
    flow_bytes_per_s   = float(net_bytes)   / duration_s
    avg_packet_size    = float(net_bytes)   / float(net_packets)
    down_up_ratio      = (dst_bytes / src_bytes) if src_bytes > 0 else 0.0
    protocol_num       = 6 if transport == "tcp" else (
                         17 if transport == "udp" else 0)

    return {
        # Identity
        "source_ip":   src_ip,
        "dest_ip":     dst_ip,
        "src_port":    int(source.get("port") or 0),
        "dst_port":    int(dest.get("port")   or 0),
        "hostname":    (src.get("host") or {}).get("name"),

        # CICIDS-compatible features (same names, same scale)
        "flow_packets_per_s":    flow_packets_per_s,   # Flow Packets/s
        "flow_bytes_per_s":      flow_bytes_per_s,     # Flow Bytes/s
        "fwd_packets_length":    src_bytes,            # Fwd Packets Length Total
        "bwd_packets_length":    dst_bytes,            # Bwd Packets Length Total
        "total_fwd_packets":     src_packets,          # Total Fwd Packets
        "total_bwd_packets":     dst_packets,          # Total Backward Packets
        "down_up_ratio":         down_up_ratio,        # Down/Up Ratio
        "avg_packet_size":       avg_packet_size,      # Avg Packet Size
        "protocol":              protocol_num,          # Protocol (6=TCP,17=UDP)
        "flow_duration_us":      duration_us,          # Flow Duration (microsec)
    }


def aggregate_flow_features(
    packet_hits: list,
) -> list[dict]:
    """
    Convert raw Packetbeat hits into per-source-IP flow feature rows
    for the RandomForest classifier.
    Each row aggregates all flows from the same source IP.
    """
    from collections import defaultdict

    buckets: dict[str, dict] = defaultdict(lambda: {
        "source_ip": None,
        "hostname":  None,
        "flow_count": 0,
        "flow_packets_per_s":  [],
        "flow_bytes_per_s":    [],
        "fwd_packets_length":  0.0,
        "bwd_packets_length":  0.0,
        "total_fwd_packets":   0.0,
        "total_bwd_packets":   0.0,
        "down_up_ratios":      [],
        "avg_packet_sizes":    [],
        "protocols":           set(),
        "flow_durations":      [],
    })

    for hit in packet_hits:
        flow = extract_flow_features(hit)
        if flow is None:
            continue

        ip  = flow["source_ip"]
        row = buckets[ip]
        row["source_ip"] = ip
        row["hostname"]  = row["hostname"] or flow["hostname"]
        row["flow_count"] += 1

        row["flow_packets_per_s"].append(flow["flow_packets_per_s"])
        row["flow_bytes_per_s"].append(flow["flow_bytes_per_s"])
        row["fwd_packets_length"] += flow["fwd_packets_length"]
        row["bwd_packets_length"] += flow["bwd_packets_length"]
        row["total_fwd_packets"]  += flow["total_fwd_packets"]
        row["total_bwd_packets"]  += flow["total_bwd_packets"]
        row["down_up_ratios"].append(flow["down_up_ratio"])
        row["avg_packet_sizes"].append(flow["avg_packet_size"])
        row["protocols"].add(flow["protocol"])
        row["flow_durations"].append(flow["flow_duration_us"])

    import statistics as _stats

    result = []
    for ip, row in buckets.items():
        if row["flow_count"] == 0:
            continue

        def safe_mean(lst):
            return sum(lst) / len(lst) if lst else 0.0

        result.append({
            "source_ip":          ip,
            "hostname":           row["hostname"],
            # Aggregated CICIDS-compatible features
            "flow_packets_per_s": safe_mean(row["flow_packets_per_s"]),
            "flow_bytes_per_s":   safe_mean(row["flow_bytes_per_s"]),
            "fwd_packets_length": row["fwd_packets_length"],
            "bwd_packets_length": row["bwd_packets_length"],
            "total_fwd_packets":  row["total_fwd_packets"],
            "total_bwd_packets":  row["total_bwd_packets"],
            "down_up_ratio":      safe_mean(row["down_up_ratios"]),
            "avg_packet_size":    safe_mean(row["avg_packet_sizes"]),
            "protocol":           max(row["protocols"]) if row["protocols"] else 0,
            "flow_duration_us":   safe_mean(row["flow_durations"]),
        })

    return result
