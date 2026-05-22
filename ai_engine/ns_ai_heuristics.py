from typing import Any

try:
    from .ns_ai_attack_dict import technique_reference
    from .ns_ai_config import (
        DNS_ANOMALY_THRESHOLD,
        LOOKBACK_MINUTES,
        PORT_SCAN_DISTINCT_PORT_THRESHOLD,
        SSH_FAILURE_THRESHOLD,
    )
    from .ns_ai_schema import FindingPayload
except ImportError:
    from ns_ai_attack_dict import technique_reference
    from ns_ai_config import (
        DNS_ANOMALY_THRESHOLD,
        LOOKBACK_MINUTES,
        PORT_SCAN_DISTINCT_PORT_THRESHOLD,
        SSH_FAILURE_THRESHOLD,
    )
    from ns_ai_schema import FindingPayload


def confidence_from_ratio(observed: int | float, threshold: int | float, floor: float, ceiling: float) -> float:
    if threshold <= 0:
        return ceiling
    ratio = observed / threshold
    scaled = floor + min(max(ratio - 1, 0), 2) * ((ceiling - floor) / 2)
    return round(min(ceiling, max(floor, scaled)), 2)


def severity_from_confidence(confidence: float) -> str:
    if confidence >= 0.9:
        return "critical"
    if confidence >= 0.78:
        return "high"
    if confidence >= 0.62:
        return "medium"
    return "low"


def refs(*techniques: str) -> list[dict[str, str]]:
    items = []
    for technique in techniques:
        ref = technique_reference(technique)
        if ref:
            items.append(ref)
    return items


def detect_ssh_bruteforce(feature_rows: list[dict[str, Any]]) -> list[FindingPayload]:
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
                description=f"{count} failed SSH authentications observed in the last {LOOKBACK_MINUTES} minutes from {row['source_ip']}.",
                recommendation="Block the source IP, enforce SSH key authentication and review auth logs for account targeting.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Credential Access",
                mitre_techniques=refs("T1110"),
                confidence=confidence,
                playbook="Inspect /var/log/auth.log, validate fail2ban bans, disable password authentication and rotate exposed credentials.",
            )
        )
    return findings


def detect_dns_anomaly(feature_rows: list[dict[str, Any]]) -> list[FindingPayload]:
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
                description=f"{count} DNS errors observed from {row['source_ip']} in the last {LOOKBACK_MINUTES} minutes.",
                recommendation="Inspect the querying workload, review DNS resolution failures and isolate the host if the burst persists.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Command and Control",
                mitre_techniques=refs("T1071.004"),
                confidence=confidence,
                playbook="Review queried domains, inspect the originating process and compare with normal DNS behavior.",
            )
        )
    return findings


def detect_port_scan(feature_rows: list[dict[str, Any]]) -> list[FindingPayload]:
    findings = []
    for row in feature_rows:
        distinct_ports = int(row["distinct_ports"])
        if distinct_ports < PORT_SCAN_DISTINCT_PORT_THRESHOLD:
            continue
        confidence = confidence_from_ratio(distinct_ports, PORT_SCAN_DISTINCT_PORT_THRESHOLD, 0.68, 0.93)
        findings.append(
            FindingPayload(
                title="Port scan behavior suspected",
                severity=severity_from_confidence(confidence),
                description=f"{distinct_ports} distinct destination ports contacted by {row['source_ip']} in the last {LOOKBACK_MINUTES} minutes.",
                recommendation="Block the scanner, verify exposed services and reduce the externally reachable attack surface.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Discovery",
                mitre_techniques=refs("T1046"),
                confidence=confidence,
                playbook="Check firewall rules, review targeted ports and confirm whether the traffic is authorized scanning.",
            )
        )
    return findings


def detect_privilege_escalation(feature_rows: list[dict[str, Any]]) -> list[FindingPayload]:
    findings = []
    for row in feature_rows:
        count = int(row["privilege_indicators"])
        if count < 2:
            continue
        confidence = confidence_from_ratio(count, 2, 0.7, 0.95)
        findings.append(
            FindingPayload(
                title="Privilege escalation activity suspected",
                severity=severity_from_confidence(confidence),
                description=f"{count} privilege escalation indicators observed for {row['source_ip']} in the active window.",
                recommendation="Review sudo, service creation and elevation traces on the host before allowing further execution.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Privilege Escalation",
                mitre_techniques=refs("T1548", "T1068"),
                confidence=confidence,
                playbook="Inspect sudo history, privileged group changes and newly created services or tasks.",
            )
        )
    return findings


def detect_defense_evasion(feature_rows: list[dict[str, Any]]) -> list[FindingPayload]:
    findings = []
    for row in feature_rows:
        count = int(row["defense_evasion_indicators"])
        if count < 2:
            continue
        confidence = confidence_from_ratio(count, 2, 0.68, 0.94)
        findings.append(
            FindingPayload(
                title="Defense evasion behavior suspected",
                severity=severity_from_confidence(confidence),
                description=f"{count} defense evasion indicators were observed from {row['source_ip']} in the active telemetry window.",
                recommendation="Check whether logs, security controls or forensic traces were tampered with and isolate if confirmed.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Defense Evasion",
                mitre_techniques=refs("T1070", "T1562"),
                confidence=confidence,
                playbook="Review log clearing, Defender tampering, service disabling and shadow copy deletion activity.",
            )
        )
    return findings


def detect_lateral_movement(feature_rows: list[dict[str, Any]]) -> list[FindingPayload]:
    findings = []
    for row in feature_rows:
        count = int(row["internal_remote_service_hits"])
        if count < 3:
            continue
        confidence = confidence_from_ratio(count, 3, 0.66, 0.93)
        findings.append(
            FindingPayload(
                title="Lateral movement via remote services suspected",
                severity=severity_from_confidence(confidence),
                description=f"{count} internal remote administration/service accesses were observed from {row['source_ip']} in the last {LOOKBACK_MINUTES} minutes.",
                recommendation="Validate whether these internal remote service connections are authorized and contain the host if not.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Lateral Movement",
                mitre_techniques=refs("T1021"),
                confidence=confidence,
                playbook="Inspect SSH, SMB, RDP and WinRM usage from the source host toward internal assets.",
            )
        )
    return findings


def detect_exfiltration(feature_rows: list[dict[str, Any]]) -> list[FindingPayload]:
    findings = []
    for row in feature_rows:
        exfil_bytes = int(row["exfil_bytes"])
        external_destinations = int(row["external_destinations"])
        archive_hits = int(row["suspicious_archive_hits"])
        if exfil_bytes < 5_000_000 and external_destinations < 3 and archive_hits < 2:
            continue
        confidence = confidence_from_ratio(exfil_bytes + (external_destinations * 500_000) + (archive_hits * 1_000_000), 5_000_000, 0.68, 0.96)
        findings.append(
            FindingPayload(
                title="Potential exfiltration pattern detected",
                severity=severity_from_confidence(confidence),
                description=(
                    f"Outbound external transfer indicators observed for {row['source_ip']} "
                    f"(bytes={exfil_bytes}, external_destinations={external_destinations}, archive_hits={archive_hits})."
                ),
                recommendation="Review outbound transfers, archive staging and remote destinations before allowing further network egress.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Exfiltration",
                mitre_techniques=refs("T1041", "T1048"),
                confidence=confidence,
                playbook="Inspect external uploads, compressed archive activity and destination infrastructure.",
            )
        )
    return findings


def detect_phishing(feature_rows: list[dict[str, Any]]) -> list[FindingPayload]:
    findings = []
    for row in feature_rows:
        count = int(row["phishing_indicators"])
        if count < 2:
            continue
        confidence = confidence_from_ratio(count, 2, 0.64, 0.9)
        findings.append(
            FindingPayload(
                title="Phishing-related activity suspected",
                severity=severity_from_confidence(confidence),
                description=f"{count} phishing or mail-delivery indicators were observed around {row['source_ip']} during the active window.",
                recommendation="Inspect mail gateway, suspicious attachment and credential-harvesting traces associated with the source host.",
                source_ip=row["source_ip"],
                hostname=row["hostname"],
                mitre_tactic="Initial Access",
                mitre_techniques=refs("T1566"),
                confidence=confidence,
                playbook="Review spoofing, DMARC/SPF failures, suspicious attachments and phishing-related log events.",
            )
        )
    return findings
