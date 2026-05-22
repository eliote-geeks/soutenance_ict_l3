"""
prevention.py
-------------
Automated prevention / response for the AI Engine.

When a critical finding is detected, this module automatically calls
the backend firewall endpoint to block the source IP.

Prevention is separate from detection — detectors never block directly.
All blocking decisions go through this module so they can be controlled
via environment variables and a whitelist.
"""

import requests

from .config import AUTO_BLOCK_ENABLED, AUTO_BLOCK_SEVERITIES, NETSENTINEL_BACKEND_URL
from .schemas import FindingPayload


# ---------------------------------------------------------------------------
# IPs that must never be auto-blocked (safety guardrail)
# ---------------------------------------------------------------------------

NEVER_BLOCK: set[str] = {
    "127.0.0.1",
    "::1",
    "localhost",
}


# ---------------------------------------------------------------------------
# Auto-block on critical findings
# ---------------------------------------------------------------------------

def auto_block_if_critical(findings: list[FindingPayload]) -> list[str]:
    """
    Automatically request an IP block for any critical-severity finding
    that has a known source IP.

    Returns a list of IPs that were successfully sent to the block endpoint.

    Set AUTO_BLOCK_ENABLED=false in .env to disable without changing code.
    """
    if not AUTO_BLOCK_ENABLED:
        return []

    blocked: list[str] = []

    for finding in findings:
        # Only act on configured severities (default: critical only)
        if finding.severity not in AUTO_BLOCK_SEVERITIES:
            continue

        # Must have a source IP to block
        if not finding.source_ip:
            continue

        # Never block whitelisted IPs
        if finding.source_ip in NEVER_BLOCK:
            continue

        try:
            response = requests.post(
                f"{NETSENTINEL_BACKEND_URL}/api/firewall/block",
                json={"ip": finding.source_ip},
                timeout=5,
            )
            if response.ok:
                blocked.append(finding.source_ip)
        except requests.RequestException:
            # Backend unreachable — skip, will retry on next cycle
            pass

    return blocked