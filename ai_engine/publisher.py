"""
publisher.py
------------
Manages finding deduplication and submission to the backend API.

Responsibilities:
  - Compute a stable signature for each finding (for dedup)
  - Track which findings were recently published (state file on disk)
  - Submit new findings to the NetSentinel backend /api/ai/findings endpoint
"""

import hashlib
import json
from datetime import timedelta
from typing import Any

import requests

from .config import (
    FINDING_SUPPRESSION_MINUTES,
    NETSENTINEL_BACKEND_URL,
    STATE_DIR,
    STATE_FILE,
)
from .schemas import FindingPayload
from .utils import iso, now_utc, parse_dt


# ---------------------------------------------------------------------------
# Finding signature (deduplication key)
# ---------------------------------------------------------------------------

def dedup_signature(finding: FindingPayload) -> str:
    """
    Compute a stable SHA-256 hash that uniquely identifies a finding.
    Two findings with the same title + IPs + tactic produce the same signature.
    """
    raw = "|".join(
        [
            finding.title.strip().lower(),
            (finding.source_ip or "").strip().lower(),
            (finding.destination_ip or "").strip().lower(),
            (finding.hostname or "").strip().lower(),
            (finding.mitre_tactic or "").strip().lower(),
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# State file management
# ---------------------------------------------------------------------------

def load_state() -> dict[str, Any]:
    """Load the deduplication state from disk. Returns empty state on error."""
    if not STATE_FILE.exists():
        return {"published": {}}
    try:
        return json.loads(STATE_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {"published": {}}


def save_state(state: dict[str, Any]) -> None:
    """Persist the deduplication state to disk."""
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    STATE_FILE.write_text(
        json.dumps(state, ensure_ascii=True, indent=2), encoding="utf-8"
    )


def prune_state(state: dict[str, Any]) -> dict[str, Any]:
    """Remove entries older than 7 days to keep the state file small."""
    published = state.get("published") or {}
    cutoff = now_utc() - timedelta(days=7)
    state["published"] = {
        sig: payload
        for sig, payload in published.items()
        if parse_dt((payload or {}).get("last_published_at")) >= cutoff
    }
    return state


# ---------------------------------------------------------------------------
# Publish decision
# ---------------------------------------------------------------------------

def should_publish(finding: FindingPayload, state: dict[str, Any]) -> bool:
    """
    Return True if this finding should be submitted to the backend.
    A finding is suppressed if an identical one was published within
    FINDING_SUPPRESSION_MINUTES minutes.
    """
    signature = dedup_signature(finding)
    last = ((state.get("published") or {}).get(signature) or {}).get(
        "last_published_at"
    )
    if not last:
        return True
    return parse_dt(last) < now_utc() - timedelta(minutes=FINDING_SUPPRESSION_MINUTES)


def mark_published(finding: FindingPayload, state: dict[str, Any]) -> None:
    """Record that this finding was just published (updates state in-memory)."""
    signature = dedup_signature(finding)
    state.setdefault("published", {})[signature] = {
        "last_published_at": iso(now_utc()),
        "title": finding.title,
        "source_ip": finding.source_ip,
        "hostname": finding.hostname,
    }


# ---------------------------------------------------------------------------
# Backend submission
# ---------------------------------------------------------------------------

def backend_post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    """POST a JSON payload to the NetSentinel backend API."""
    response = requests.post(
        f"{NETSENTINEL_BACKEND_URL}{path}",
        json=payload,
        timeout=12,
    )
    response.raise_for_status()
    return response.json()


def publish_findings(findings: list[FindingPayload]) -> list[dict[str, Any]]:
    """
    Submit each finding to the backend, skipping recently published duplicates.
    Updates and saves the deduplication state after each successful publish.
    """
    published = []
    state = prune_state(load_state())

    for finding in findings:
        if not should_publish(finding, state):
            continue
        try:
            response = backend_post("/api/ai/findings", finding.model_dump())
            published.append(response)
            mark_published(finding, state)
        except requests.RequestException:
            # Backend unreachable — skip this cycle, will retry next run
            pass

    save_state(state)
    return published