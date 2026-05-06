from typing import Any

import requests

try:
    from .ns_ai_config import (
        ELASTICSEARCH_API_KEY,
        ELASTICSEARCH_PASSWORD,
        ELASTICSEARCH_URL,
        ELASTICSEARCH_USERNAME,
        ELASTICSEARCH_VERIFY_TLS,
        NETSENTINEL_BACKEND_URL,
    )
except ImportError:
    from ns_ai_config import (
        ELASTICSEARCH_API_KEY,
        ELASTICSEARCH_PASSWORD,
        ELASTICSEARCH_URL,
        ELASTICSEARCH_USERNAME,
        ELASTICSEARCH_VERIFY_TLS,
        NETSENTINEL_BACKEND_URL,
    )


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


def elastic_request(path: str, payload: dict[str, Any]) -> dict[str, Any]:
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


def backend_post(path: str, payload: dict[str, Any]) -> dict[str, Any]:
    response = requests.post(
        f"{NETSENTINEL_BACKEND_URL}{path}",
        json=payload,
        timeout=12,
    )
    response.raise_for_status()
    return response.json()
