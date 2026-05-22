import hashlib
import json
from datetime import timedelta
from typing import Any

try:
    from .ns_ai_config import FINDING_SUPPRESSION_MINUTES, STATE_DIR, STATE_FILE, iso, now_utc, parse_dt
    from .ns_ai_schema import FindingPayload
except ImportError:
    from ns_ai_config import FINDING_SUPPRESSION_MINUTES, STATE_DIR, STATE_FILE, iso, now_utc, parse_dt
    from ns_ai_schema import FindingPayload


def dedup_signature(finding: FindingPayload) -> str:
    payload = "|".join(
        [
            finding.title.strip().lower(),
            (finding.source_ip or "").strip().lower(),
            (finding.destination_ip or "").strip().lower(),
            (finding.hostname or "").strip().lower(),
            (finding.mitre_tactic or "").strip().lower(),
        ]
    )
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def load_state() -> dict[str, Any]:
    if not STATE_FILE.exists():
        return {"published": {}}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"published": {}}


def save_state(state: dict[str, Any]) -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(json.dumps(state, ensure_ascii=True, indent=2), encoding="utf-8")


def prune_state(state: dict[str, Any]) -> dict[str, Any]:
    published = state.get("published") or {}
    cutoff = now_utc() - timedelta(days=7)
    fresh = {}
    for signature, payload in published.items():
        last_seen = parse_dt((payload or {}).get("last_published_at"))
        if last_seen >= cutoff:
            fresh[signature] = payload
    state["published"] = fresh
    return state


def should_publish(finding: FindingPayload, state: dict[str, Any]) -> bool:
    signature = dedup_signature(finding)
    last = ((state.get("published") or {}).get(signature) or {}).get("last_published_at")
    if not last:
        return True
    return parse_dt(last) < now_utc() - timedelta(minutes=FINDING_SUPPRESSION_MINUTES)


def mark_published(finding: FindingPayload, state: dict[str, Any]) -> None:
    signature = dedup_signature(finding)
    state.setdefault("published", {})[signature] = {
        "last_published_at": iso(now_utc()),
        "title": finding.title,
        "source_ip": finding.source_ip,
        "hostname": finding.hostname,
    }
