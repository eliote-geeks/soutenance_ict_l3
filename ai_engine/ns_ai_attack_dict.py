import json
import urllib.request
from typing import Any

try:
    from .ns_ai_config import ATTACK_DICT_FILE, ATTACK_DICT_SOURCE_URL, iso, now_utc
except ImportError:
    from ns_ai_config import ATTACK_DICT_FILE, ATTACK_DICT_SOURCE_URL, iso, now_utc


def _extract_external_id(obj: dict[str, Any]) -> str | None:
    for ref in obj.get("external_references") or []:
        if ref.get("source_name") == "mitre-attack" and ref.get("external_id", "").startswith("T"):
            return ref.get("external_id")
    return None


def _extract_tactics(obj: dict[str, Any]) -> list[str]:
    phases = obj.get("kill_chain_phases") or []
    names = []
    for item in phases:
        if item.get("kill_chain_name") == "mitre-attack":
            phase = item.get("phase_name")
            if phase:
                names.append(phase.replace("-", " ").title())
    return names


SEED_TECHNIQUES = {
    "T1110": {"id": "T1110", "name": "Brute Force"},
    "T1071.004": {"id": "T1071.004", "name": "DNS"},
    "T1046": {"id": "T1046", "name": "Network Service Discovery"},
    "T1566": {"id": "T1566", "name": "Phishing"},
    "T1548": {"id": "T1548", "name": "Abuse Elevation Control Mechanism"},
    "T1068": {"id": "T1068", "name": "Exploitation for Privilege Escalation"},
    "T1070": {"id": "T1070", "name": "Indicator Removal on Host"},
    "T1562": {"id": "T1562", "name": "Impair Defenses"},
    "T1021": {"id": "T1021", "name": "Remote Services"},
    "T1041": {"id": "T1041", "name": "Exfiltration Over C2 Channel"},
    "T1048": {"id": "T1048", "name": "Exfiltration Over Alternative Protocol"},
}


def refresh_attack_dictionary(force: bool = False) -> dict[str, Any]:
    if ATTACK_DICT_FILE.exists() and not force:
        return load_attack_dictionary()

    with urllib.request.urlopen(ATTACK_DICT_SOURCE_URL, timeout=60) as response:
        raw_bundle = json.loads(response.read().decode("utf-8"))

    techniques = []
    for obj in raw_bundle.get("objects") or []:
        if obj.get("type") != "attack-pattern":
            continue
        if obj.get("revoked") or obj.get("x_mitre_deprecated"):
            continue
        technique_id = _extract_external_id(obj)
        if not technique_id:
            continue
        techniques.append(
            {
                "id": technique_id,
                "name": obj.get("name"),
                "description": obj.get("description", ""),
                "tactics": _extract_tactics(obj),
                "platforms": obj.get("x_mitre_platforms") or [],
                "dataSources": obj.get("x_mitre_data_sources") or [],
                "isSubTechnique": bool(obj.get("x_mitre_is_subtechnique")),
            }
        )

    payload = {
        "source": "MITRE ATT&CK Enterprise",
        "sourceUrl": ATTACK_DICT_SOURCE_URL,
        "refreshedAt": iso(now_utc()),
        "techniqueCount": len(techniques),
        "techniques": sorted(techniques, key=lambda item: item["id"]),
    }
    ATTACK_DICT_FILE.parent.mkdir(parents=True, exist_ok=True)
    ATTACK_DICT_FILE.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
    return payload


def load_attack_dictionary(refresh_if_missing: bool = True) -> dict[str, Any]:
    if not ATTACK_DICT_FILE.exists():
        if not refresh_if_missing:
            return {
                "source": "MITRE ATT&CK Enterprise",
                "sourceUrl": ATTACK_DICT_SOURCE_URL,
                "refreshedAt": None,
                "mode": "seed",
                "techniqueCount": len(SEED_TECHNIQUES),
                "techniques": list(SEED_TECHNIQUES.values()),
            }
        return refresh_attack_dictionary(force=True)
    return json.loads(ATTACK_DICT_FILE.read_text(encoding="utf-8"))


def attack_dictionary_status() -> dict[str, Any]:
    payload = load_attack_dictionary(refresh_if_missing=False)
    return {
        "source": payload.get("source"),
        "sourceUrl": payload.get("sourceUrl"),
        "refreshedAt": payload.get("refreshedAt"),
        "mode": payload.get("mode", "cached"),
        "techniqueCount": payload.get("techniqueCount", 0),
    }


def technique_reference(technique_id: str) -> dict[str, str] | None:
    if technique_id in SEED_TECHNIQUES:
        return SEED_TECHNIQUES[technique_id]
    payload = load_attack_dictionary(refresh_if_missing=False)
    for item in payload.get("techniques") or []:
        if item.get("id") == technique_id:
            return {"id": item["id"], "name": item["name"]}
    return None


def lookup_attack_patterns(*, technique_ids: list[str] | None = None, tactic: str | None = None, keywords: list[str] | None = None, limit: int = 5) -> list[dict[str, str]]:
    payload = load_attack_dictionary(refresh_if_missing=False)
    matches = []
    lower_keywords = [item.lower() for item in (keywords or []) if item]
    lower_tactic = tactic.lower() if tactic else None

    for item in payload.get("techniques") or []:
        if technique_ids and item.get("id") not in technique_ids:
            continue
        if lower_tactic and not any(lower_tactic == tactic_name.lower() for tactic_name in item.get("tactics") or []):
            continue
        haystack = " ".join(
            [
                item.get("id", ""),
                item.get("name", ""),
                item.get("description", ""),
                " ".join(item.get("tactics") or []),
                " ".join(item.get("dataSources") or []),
            ]
        ).lower()
        if lower_keywords and not any(keyword in haystack for keyword in lower_keywords):
            continue
        matches.append({"id": item["id"], "name": item["name"]})
        if len(matches) >= limit:
            break
    return matches
