from copy import deepcopy
from datetime import datetime, timedelta, timezone
from typing import Any

from .data import AI_FINDINGS_BUFFER, ALERTS, HOSTS
from .elastic import fetch_elastic_alerts, fetch_metricbeat_hosts, fetch_packetbeat_events, fetch_profiles_metadata, fetch_assets_metadata, fetch_profile_asset_links
from .utils import iso, normalize_text, parse_dt


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
    now = datetime.now(timezone.utc)
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


def aggregate_packetbeat_traffic() -> list[dict[str, Any]]:
    now = datetime.now(timezone.utc)
    buckets = []
    for hours_ago in range(23, -1, -1):
        stamp = (now - timedelta(hours=hours_ago)).replace(minute=0, second=0, microsecond=0)
        buckets.append(
            {
                "timestamp": iso(stamp),
                "alerts": 0,
                "blocked": 0,
                "inbound": 320 + (hours_ago * 12 % 80),
                "outbound": 240 + (hours_ago * 9 % 60),
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


def current_alerts() -> list[dict[str, Any]]:
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


def current_hosts() -> list[dict[str, Any]]:
    return fetch_metricbeat_hosts()


def alert_source_type(title: str | None) -> str:
    return "ml" if "ml network anomaly" in normalize_text(title, "").lower() else "heuristic"


def alert_signature(*parts: Any) -> str:
    raw = "|".join(normalize_text(part, "").strip().lower() for part in parts)
    return __import__("hashlib").sha256(raw.encode("utf-8")).hexdigest()[:16].upper()
