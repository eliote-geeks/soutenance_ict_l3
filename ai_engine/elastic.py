"""
elastic.py
----------
All Elasticsearch communication for the AI Engine.
Handles authentication, querying Filebeat and Packetbeat indexes.
No detection logic lives here — only data fetching.
"""

from datetime import timedelta
from typing import Any

import requests

from .config import (
    ELASTICSEARCH_API_KEY,
    ELASTICSEARCH_PASSWORD,
    ELASTICSEARCH_URL,
    ELASTICSEARCH_USERNAME,
    ELASTICSEARCH_VERIFY_TLS,
    FILEBEAT_INDEX,
    LOOKBACK_MINUTES,
    PACKETBEAT_INDEX,
)
from .utils import iso, now_utc


# ---------------------------------------------------------------------------
# Auth helpers
# ---------------------------------------------------------------------------

def elastic_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if ELASTICSEARCH_API_KEY:
        headers["Authorization"] = f"ApiKey {ELASTICSEARCH_API_KEY}"
    return headers


def elastic_auth() -> tuple[str, str] | None:
    if ELASTICSEARCH_API_KEY:
        return None
    if ELASTICSEARCH_USERNAME and ELASTICSEARCH_PASSWORD:
        return (ELASTICSEARCH_USERNAME, ELASTICSEARCH_PASSWORD)
    return None


# ---------------------------------------------------------------------------
# Core request helper
# ---------------------------------------------------------------------------

def elastic_request(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    """
    Send a GET request to Elasticsearch and return the JSON response.
    Raises requests.HTTPError on non-2xx responses.
    """
    response = requests.get(
        f"{ELASTICSEARCH_URL}{path}",
        json=payload,
        headers=elastic_headers(),
        auth=elastic_auth(),
        timeout=12,
        verify=ELASTICSEARCH_VERIFY_TLS,
    )
    response.raise_for_status()
    return response.json()


# ---------------------------------------------------------------------------
# Time range helper
# ---------------------------------------------------------------------------

def lookback_gte(minutes: int) -> str:
    """Return an ISO timestamp for 'now minus N minutes' (used in ES range queries)."""
    return iso(now_utc() - timedelta(minutes=minutes))


# ---------------------------------------------------------------------------
# Index query helpers
# ---------------------------------------------------------------------------

def filebeat_hits(
    minutes: int = LOOKBACK_MINUTES,
    size: int = 500,
) -> list[dict[str, Any]]:
    """
    Fetch recent Filebeat log documents from Elasticsearch.
    Returns a list of raw Elasticsearch hit objects.
    """
    payload = {
        "size": size,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "_source": [
            "@timestamp",
            "message",
            "kubernetes.pod.name",
            "kubernetes.namespace",
            "source.ip",
            "host.name",
            "stream",
        ],
        "query": {
            "range": {
                "@timestamp": {
                    "gte": lookback_gte(minutes)
                }
            }
        },
    }
    result = elastic_request(f"/{FILEBEAT_INDEX}/_search", payload)
    return (((result.get("hits") or {}).get("hits")) or [])


def packetbeat_hits(
    minutes: int = LOOKBACK_MINUTES,
    size: int = 1000,
) -> list[dict[str, Any]]:
    """
    Fetch recent Packetbeat network flow documents from Elasticsearch.
    Returns a list of raw Elasticsearch hit objects.
    """
    payload = {
        "size": size,
        "sort": [{"@timestamp": {"order": "desc"}}],
        "_source": [
            "@timestamp",
            "source.ip",
            "source.port",
            "source.bytes",
            "source.packets",
            "destination.ip",
            "destination.port",
            "destination.bytes",
            "destination.packets",
            "network.bytes",
            "network.packets",
            "network.transport",
            "network.protocol",
            "event.duration",
            "event.start",
            "event.end",
            "event.dataset",
            "query",
            "status",
            "host.name",
            "url.path",
        ],
        "query": {
            "range": {
                "@timestamp": {
                    "gte": lookback_gte(minutes)
                }
            }
        },
    }
    result = elastic_request(f"/{PACKETBEAT_INDEX}/_search", payload)
    return (((result.get("hits") or {}).get("hits")) or [])