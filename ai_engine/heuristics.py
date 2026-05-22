"""
heuristics.py
-------------
Rule-based (IF-THEN) threat detectors for the AI Engine.

Each detect_* function:
  - Takes pre-aggregated feature rows or raw log hits
  - Returns a list of FindingPayload objects (empty if nothing detected)
  - Has NO side effects — pure detection, no publishing or blocking

To add a new rule: add a new detect_* function and register it in cycle.py.
"""

from typing import Any

from .config import (
    DNS_ANOMALY_THRESHOLD,
    LATERAL_MOVEMENT_HOST_THRESHOLD,
    LOOKBACK_MINUTES,
    PORT_SCAN_DISTINCT_PORT_THRESHOLD,
    PRIVILEGE_ESCALATION_EVENT_THRESHOLD,
    SSH_FAILURE_THRESHOLD,
)
from .features import safe_host, safe_source_ip
from .schemas import FindingPayload


# ---------------------------------------------------------------------------
# Scoring helpers (shared by all heuristics)
# ---------------------------------------------------------------------------

def confidence_from_ratio(
    observed: int,
    threshold: int,
    floor: float,
    ceiling: float,
) -> float:
    """
    Scale a confidence score based on how far 'observed' exceeds 'threshold'.
    Result is always clamped between floor and ceiling.
    """
    if threshold <= 0:
        return ceiling
    ratio = observed / threshold
    scaled = floor + min(max(ratio - 1, 0), 2) * ((ceiling - floor) / 2)
    return round(min(ceiling, max(floor, scaled)), 2)


def severity_from_confidence(confidence: float) -> str:
    """Map a confidence score (0–1) to a severity label."""
    if confidence >= 0.9:
        return "critical"
    if confidence >= 0.78:
        return "high"
    if confidence >= 0.62:
        return "medium"
    return "low"


# ---------------------------------------------------------------------------
# Existing detectors (from original main.py — unchanged logic)
# ---------------------------------------------------------------------------

def detect_ssh_bruteforce(
    feature_rows: list[dict[str, Any]],
) -> list[FindingPayload]:
    """
    Detect SSH brute force: too many failed logins from one source IP
    within the current lookback window.
    """
    findings = []
    for row in feature_rows:
        count = int(row["failed_logins"])
        if count < SSH_FAILURE_THRESHOLD:
            continue
        confidence = confidence_from_ratio(count, SSH_FAILURE_THRESHOLD, 0.74, 0.97)
        findings.append(
            FindingPayload(
                title="SSH brute force suspected",
                severity=severity_from_confidence(confidence),
                description=(
                    f"{count} failed SSH authentications observed in the last "
                    f"{LOOKBACK_MINUTES} minutes from {row['source_ip']}."
                ),
                recommendation=(
                    "Block the source IP, enforce SSH key authentication "
                    "and review auth logs for account targeting."
                ),
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Credential Access",
                confidence=confidence,
                playbook=(
                    "Inspect /var/log/auth.log, validate fail2ban bans, "
                    "disable password authentication and rotate exposed credentials."
                ),
            )
        )
    return findings


def detect_dns_anomaly(
    feature_rows: list[dict[str, Any]],
) -> list[FindingPayload]:
    """
    Detect DNS anomaly burst: unusually high number of DNS errors
    from one source IP — can indicate C2 beaconing or DNS tunneling.
    """
    findings = []
    for row in feature_rows:
        count = int(row["dns_errors"])
        if count < DNS_ANOMALY_THRESHOLD:
            continue
        confidence = confidence_from_ratio(count, DNS_ANOMALY_THRESHOLD, 0.62, 0.9)
        findings.append(
            FindingPayload(
                title="DNS anomaly burst detected",
                severity=severity_from_confidence(confidence),
                description=(
                    f"{count} DNS errors observed from {row['source_ip']} "
                    f"in the last {LOOKBACK_MINUTES} minutes."
                ),
                recommendation=(
                    "Inspect the querying workload, review DNS resolution failures "
                    "and isolate the host if the burst persists."
                ),
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Command and Control",
                confidence=confidence,
                playbook=(
                    "Review queried domains, inspect the originating process "
                    "and compare with normal DNS behavior."
                ),
            )
        )
    return findings


def detect_port_scan(
    feature_rows: list[dict[str, Any]],
) -> list[FindingPayload]:
    """
    Detect port scanning behavior: one source IP contacting many distinct
    destination ports in a short time window.
    """
    findings = []
    for row in feature_rows:
        distinct_ports = int(row["distinct_ports"])
        if distinct_ports < PORT_SCAN_DISTINCT_PORT_THRESHOLD:
            continue
        confidence = confidence_from_ratio(
            distinct_ports, PORT_SCAN_DISTINCT_PORT_THRESHOLD, 0.68, 0.93
        )
        findings.append(
            FindingPayload(
                title="Port scan behavior suspected",
                severity=severity_from_confidence(confidence),
                description=(
                    f"{distinct_ports} distinct destination ports contacted by "
                    f"{row['source_ip']} in the last {LOOKBACK_MINUTES} minutes."
                ),
                recommendation=(
                    "Block the scanner, verify exposed services and reduce "
                    "the externally reachable attack surface."
                ),
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Discovery",
                confidence=confidence,
                playbook=(
                    "Check firewall rules, review targeted ports and confirm "
                    "whether the traffic is authorized scanning."
                ),
            )
        )
    return findings


# ---------------------------------------------------------------------------
# New detectors (added as part of this project)
# ---------------------------------------------------------------------------

def detect_privilege_escalation(
    log_hits: list[dict[str, Any]],
) -> list[FindingPayload]:
    """
    Detect privilege escalation: repeated sudo/su usage or new service
    creation events on the same host within the lookback window.
    """
    sudo_events_by_host: dict[str, list[str]] = {}

    for hit in log_hits:
        src = hit.get("_source", {})
        msg = str(src.get("message", ""))
        host = safe_host(src) or "unknown"

        if (
            "sudo" in msg.lower()
            or "su " in msg.lower()
            or "new service" in msg.lower()
            or "systemctl enable" in msg.lower()
        ):
            sudo_events_by_host.setdefault(host, []).append(msg)

    findings = []
    for host, events in sudo_events_by_host.items():
        if len(events) < PRIVILEGE_ESCALATION_EVENT_THRESHOLD:
            continue
        findings.append(
            FindingPayload(
                title="Privilege escalation pattern detected",
                severity="high",
                description=(
                    f"{len(events)} sudo/su or service-creation events observed "
                    f"on {host} in the last {LOOKBACK_MINUTES} minutes."
                ),
                recommendation=(
                    "Review sudoers changes, inspect new services and compare "
                    "binaries against a trusted baseline."
                ),
                hostname=host,
                mitre_tactic="Privilege Escalation",
                confidence=0.80,
                playbook=(
                    "Audit /var/log/auth.log for sudo usage, run "
                    "'systemctl list-units --type=service' to find new services."
                ),
            )
        )
    return findings


def detect_lateral_movement(
    feature_rows: list[dict[str, Any]],
) -> list[FindingPayload]:
    """
    Detect lateral movement: an internal IP communicating with an unusually
    large number of distinct internal destinations in a short window.
    """
    findings = []
    for row in feature_rows:
        if not row["is_internal"]:
            continue
        distinct_dest = int(row["distinct_destinations"])
        if distinct_dest < LATERAL_MOVEMENT_HOST_THRESHOLD:
            continue
        if row["event_count"] < 20:
            continue  # low traffic — likely not movement, just noise

        confidence = confidence_from_ratio(
            distinct_dest, LATERAL_MOVEMENT_HOST_THRESHOLD, 0.65, 0.92
        )
        findings.append(
            FindingPayload(
                title="Lateral movement suspected",
                severity=severity_from_confidence(confidence),
                description=(
                    f"Internal IP {row['source_ip']} contacted "
                    f"{distinct_dest} distinct internal hosts in "
                    f"the last {LOOKBACK_MINUTES} minutes."
                ),
                recommendation=(
                    "Isolate the source host immediately and review "
                    "all active sessions and open connections."
                ),
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Lateral Movement",
                confidence=confidence,
                playbook=(
                    "Block internal source on the firewall, review SMB/SSH "
                    "connections with 'ss -tulpn', check for credential reuse."
                ),
            )
        )
    return findings