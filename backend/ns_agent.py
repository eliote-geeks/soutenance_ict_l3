from __future__ import annotations

import uuid
import ipaddress
import re
from datetime import datetime, timedelta
from typing import Any

try:
    from .ns_config import iso, normalize_text, now_utc
except ImportError:
    from ns_config import iso, normalize_text, now_utc


SUPPORTED_AGENT_ACTIONS = {
    "block_ip",
    "unblock_ip",
    "terminate_process_by_name",
    "terminate_process_by_pid",
    "collect_triage",
}
DANGEROUS_AGENT_ACTIONS = {
    "block_ip",
    "unblock_ip",
    "terminate_process_by_name",
    "terminate_process_by_pid",
}


SIGNAL_INT_KEYS = {
    "failed_login_indicators",
    "privilege_indicators",
    "defense_evasion_indicators",
    "phishing_indicators",
    "suspicious_archive_hits",
    "internal_remote_service_hits",
    "external_destinations",
    "external_established_connections",
    "listening_ports",
}

SAFE_PROCESS_NAME = re.compile(r"^[A-Za-z0-9_.-]{1,64}$")
PROTECTED_PROCESS_NAMES = {
    "system",
    "systemd",
    "init",
    "smss",
    "csrss",
    "wininit",
    "services",
    "lsass",
    "svchost",
    "winlogon",
    "explorer",
    "sshd",
    "sudo",
    "python",
    "python3",
    "bash",
    "sh",
    "powershell",
    "pwsh",
    "filebeat",
    "packetbeat",
    "metricbeat",
    "winlogbeat",
    "netsentinel-agent-runtime",
}


def build_local_action_policy() -> dict[str, Any]:
    return {
        "enabled": True,
        "require_approved_instance": True,
        "allowed_actions": sorted(SUPPORTED_AGENT_ACTIONS),
        "max_pending_actions": 10,
    }


def build_runtime_config(os_name: str | None = None) -> dict[str, Any]:
    normalized = normalize_text(os_name, "").lower()
    is_windows = "windows" in normalized
    return {
        "heartbeat_interval_seconds": 300,
        "telemetry_log_path": (
            r"C:\ProgramData\NetSentinelAgent\signals.ndjson"
            if is_windows
            else "/var/log/netsentinel-agent/signals.ndjson"
        ),
        "triage_output_dir": (
            r"C:\ProgramData\NetSentinelAgent\triage"
            if is_windows
            else "/var/log/netsentinel-agent/triage"
        ),
    }


def sanitize_agent_signals(signals: dict[str, Any] | None) -> dict[str, Any]:
    if not isinstance(signals, dict):
        return {}

    payload: dict[str, Any] = {
        "collected_at": normalize_text(signals.get("collected_at"), iso(now_utc())),
        "telemetry_version": normalize_text(signals.get("telemetry_version"), "1.0"),
        "platform": normalize_text(signals.get("platform"), "unknown"),
        "hostname": normalize_text(signals.get("hostname"), ""),
        "source_ip": normalize_text(signals.get("source_ip"), ""),
    }

    for key in SIGNAL_INT_KEYS:
        value = signals.get(key, 0)
        try:
            payload[key] = max(0, int(value))
        except (TypeError, ValueError):
            payload[key] = 0

    suspicious_processes = signals.get("suspicious_processes") or []
    if isinstance(suspicious_processes, list):
        payload["suspicious_processes"] = [normalize_text(item, "") for item in suspicious_processes[:12] if normalize_text(item, "")]
    else:
        payload["suspicious_processes"] = []

    notes = signals.get("notes") or []
    if isinstance(notes, list):
        payload["notes"] = [normalize_text(item, "") for item in notes[:8] if normalize_text(item, "")]
    else:
        payload["notes"] = []

    return payload


def validate_action_parameters(action_type: str, parameters: dict[str, Any] | None) -> dict[str, Any]:
    payload = dict(parameters or {})
    if action_type in {"block_ip", "unblock_ip"}:
        raw_ip = normalize_text(payload.get("ip"), "").strip()
        try:
            parsed_ip = ipaddress.ip_address(raw_ip)
        except ValueError as exc:
            raise ValueError("A valid ip parameter is required.") from exc
        if parsed_ip.is_loopback or parsed_ip.is_multicast or parsed_ip.is_unspecified:
            raise ValueError("Loopback, multicast and unspecified IPs are not allowed for local firewall actions.")
        payload["ip"] = str(parsed_ip)
        return payload

    if action_type == "terminate_process_by_name":
        name = normalize_text(payload.get("name"), "").strip()
        if not SAFE_PROCESS_NAME.fullmatch(name):
            raise ValueError("A safe process name is required.")
        if name.lower() in PROTECTED_PROCESS_NAMES:
            raise ValueError(f"Refusing to queue termination for protected process {name}.")
        payload["name"] = name
        return payload

    if action_type == "terminate_process_by_pid":
        try:
            pid = int(payload.get("pid"))
        except (TypeError, ValueError) as exc:
            raise ValueError("A valid pid parameter is required.") from exc
        if pid <= 4:
            raise ValueError("System process ids are not allowed.")
        payload["pid"] = pid
        return payload

    if action_type == "collect_triage":
        return {}

    return payload


def queue_agent_action(
    instance: dict[str, Any],
    *,
    action_type: str,
    parameters: dict[str, Any] | None = None,
    reason: str | None = None,
    confirmation: str | None = None,
) -> dict[str, Any]:
    normalized_type = normalize_text(action_type, "").strip().lower()
    if normalized_type not in SUPPORTED_AGENT_ACTIONS:
        raise ValueError(f"Unsupported agent action: {action_type}")
    normalized_reason = normalize_text(reason, "").strip()
    if normalized_type in DANGEROUS_AGENT_ACTIONS:
        if confirmation != "CONFIRM_LOCAL_ACTION":
            raise ValueError("Dangerous local actions require confirmation=CONFIRM_LOCAL_ACTION.")
        if len(normalized_reason) < 12:
            raise ValueError("Dangerous local actions require a clear reason with at least 12 characters.")
    safe_parameters = validate_action_parameters(normalized_type, parameters)

    pending = instance.setdefault("pending_actions", [])
    action = {
        "id": f"action_{uuid.uuid4().hex[:12]}",
        "type": normalized_type,
        "parameters": safe_parameters,
        "reason": normalized_reason,
        "status": "pending",
        "created_at": iso(now_utc()),
        "expires_at": iso(now_utc() + timedelta(hours=6)),
    }
    pending.append(action)
    instance["pending_actions"] = pending[-10:]
    return action


def pending_agent_actions(instance: dict[str, Any]) -> list[dict[str, Any]]:
    pending = []
    now = now_utc()
    for action in instance.get("pending_actions") or []:
        expires_at = action.get("expires_at")
        if expires_at and now >= datetime.fromisoformat(expires_at.replace("Z", "+00:00")):
            if action.get("status") == "pending":
                action["status"] = "expired"
            continue
        if action.get("status") == "pending":
            pending.append(action)
    return pending


def apply_agent_action_results(instance: dict[str, Any], results: list[dict[str, Any]] | None) -> list[dict[str, Any]]:
    if not isinstance(results, list):
        return []

    indexed = {item.get("id"): item for item in instance.get("pending_actions") or [] if item.get("id")}
    applied: list[dict[str, Any]] = []
    for raw in results:
        if not isinstance(raw, dict):
            continue
        action_id = normalize_text(raw.get("action_id"), "")
        if not action_id or action_id not in indexed:
            continue
        action = indexed[action_id]
        success = bool(raw.get("success"))
        action["status"] = "completed" if success else "failed"
        action["completed_at"] = normalize_text(raw.get("finished_at"), iso(now_utc()))
        output = normalize_text(raw.get("output"), "")
        error = normalize_text(raw.get("error"), "")
        if output:
            action["output"] = output[:400]
        if error:
            action["error"] = error[:400]
        applied.append(action)

    if applied:
        history = instance.setdefault("action_history", [])
        history.extend(applied)
        instance["action_history"] = history[-30:]
    return applied
