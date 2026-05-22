from __future__ import annotations

from typing import Any

try:
    from .ns_ai_attack_dict import attack_dictionary_status, technique_reference
except ImportError:
    from ns_ai_attack_dict import attack_dictionary_status, technique_reference


ATTACK_PROFILES: dict[str, dict[str, Any]] = {
    "ssh_bruteforce": {
        "name": "SSH brute force",
        "tactic": "Credential Access",
        "techniques": ["T1110"],
        "features": {"failed_logins": 8},
        "logSources": ["filebeat:auth.log", "winlogbeat:Security", "netsentinel.agent.signals"],
        "recommendedAction": "Block the source IP, disable password authentication and review targeted accounts.",
        "trainingLabel": 1,
    },
    "dns_c2_anomaly": {
        "name": "DNS command-and-control anomaly",
        "tactic": "Command and Control",
        "techniques": ["T1071.004"],
        "features": {"dns_errors": 20},
        "logSources": ["packetbeat:dns", "filebeat:dns", "netsentinel.agent.signals"],
        "recommendedAction": "Review queried domains, inspect the originating process and isolate if the burst persists.",
        "trainingLabel": 1,
    },
    "port_scan": {
        "name": "Network service discovery / port scan",
        "tactic": "Discovery",
        "techniques": ["T1046"],
        "features": {"distinct_ports": 12},
        "logSources": ["packetbeat:flow", "packetbeat:tcp"],
        "recommendedAction": "Verify whether scanning is authorized, reduce exposed services and block hostile sources.",
        "trainingLabel": 1,
    },
    "privilege_escalation": {
        "name": "Privilege escalation activity",
        "tactic": "Privilege Escalation",
        "techniques": ["T1548", "T1068"],
        "features": {"privilege_indicators": 2},
        "logSources": ["filebeat:auth.log", "winlogbeat:Security", "netsentinel.agent.signals"],
        "recommendedAction": "Review sudo, service creation, RunAs and privileged group changes.",
        "trainingLabel": 1,
    },
    "defense_evasion": {
        "name": "Defense evasion behavior",
        "tactic": "Defense Evasion",
        "techniques": ["T1070", "T1562"],
        "features": {"defense_evasion_indicators": 2},
        "logSources": ["winlogbeat:Security", "filebeat:system", "netsentinel.agent.signals"],
        "recommendedAction": "Check log clearing, control tampering and security-service shutdown traces.",
        "trainingLabel": 1,
    },
    "lateral_movement": {
        "name": "Lateral movement via remote services",
        "tactic": "Lateral Movement",
        "techniques": ["T1021"],
        "features": {"internal_remote_service_hits": 3},
        "logSources": ["packetbeat:flow", "winlogbeat:Security", "netsentinel.agent.signals"],
        "recommendedAction": "Validate SSH, SMB, RDP and WinRM use between internal hosts.",
        "trainingLabel": 1,
    },
    "exfiltration": {
        "name": "Potential data exfiltration",
        "tactic": "Exfiltration",
        "techniques": ["T1041", "T1048"],
        "features": {"exfil_bytes": 5_000_000, "external_destinations": 3, "suspicious_archive_hits": 2},
        "matchMode": "any",
        "logSources": ["packetbeat:flow", "packetbeat:http", "netsentinel.agent.signals"],
        "recommendedAction": "Review outbound transfers, archive staging and remote destinations.",
        "trainingLabel": 1,
    },
    "phishing": {
        "name": "Phishing-related activity",
        "tactic": "Initial Access",
        "techniques": ["T1566"],
        "features": {"phishing_indicators": 2},
        "logSources": ["filebeat:mail", "winlogbeat:Security", "netsentinel.agent.signals"],
        "recommendedAction": "Inspect mail gateway, attachments and credential-harvesting traces.",
        "trainingLabel": 1,
    },
}


def profile_technique_refs(profile: dict[str, Any]) -> list[dict[str, str]]:
    refs = []
    for technique_id in profile.get("techniques") or []:
        ref = technique_reference(technique_id) or {"id": technique_id, "name": technique_id}
        refs.append({"id": ref["id"], "name": ref["name"]})
    return refs


def profile_matches_row(profile: dict[str, Any], row: dict[str, Any]) -> bool:
    checks = []
    for feature, threshold in (profile.get("features") or {}).items():
        try:
            checks.append(float(row.get(feature, 0)) >= float(threshold))
        except (TypeError, ValueError):
            checks.append(False)
    if not checks:
        return False
    if profile.get("matchMode") == "any":
        return any(checks)
    return all(checks)


def matching_attack_profiles(row: dict[str, Any]) -> list[dict[str, Any]]:
    matches = []
    for profile_id, profile in ATTACK_PROFILES.items():
        if not profile_matches_row(profile, row):
            continue
        matches.append(
            {
                "id": profile_id,
                "name": profile["name"],
                "tactic": profile["tactic"],
                "techniques": profile_technique_refs(profile),
                "features": profile["features"],
                "logSources": profile["logSources"],
                "recommendedAction": profile["recommendedAction"],
            }
        )
    return matches


def row_training_label(row: dict[str, Any]) -> int:
    return 1 if matching_attack_profiles(row) else 0


def attack_knowledge_base() -> dict[str, Any]:
    return {
        "dictionary": attack_dictionary_status(),
        "profileCount": len(ATTACK_PROFILES),
        "profiles": [
            {
                "id": profile_id,
                "name": profile["name"],
                "tactic": profile["tactic"],
                "techniques": profile_technique_refs(profile),
                "features": profile["features"],
                "matchMode": profile.get("matchMode", "all"),
                "logSources": profile["logSources"],
                "recommendedAction": profile["recommendedAction"],
            }
            for profile_id, profile in ATTACK_PROFILES.items()
        ],
    }
