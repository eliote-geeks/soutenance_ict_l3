from typing import Any

import requests

try:
    from .ns_config import (
        AI_SERVICE_URL,
        ELASTICSEARCH_API_KEY,
        ELASTICSEARCH_PASSWORD,
        ELASTICSEARCH_URL,
        ELASTICSEARCH_USERNAME,
        ELASTICSEARCH_VERIFY_TLS,
    )
except ImportError:
    from ns_config import (
        AI_SERVICE_URL,
        ELASTICSEARCH_API_KEY,
        ELASTICSEARCH_PASSWORD,
        ELASTICSEARCH_URL,
        ELASTICSEARCH_USERNAME,
        ELASTICSEARCH_VERIFY_TLS,
    )


def elastic_configured() -> bool:
    return bool(ELASTICSEARCH_URL)


def ai_service_configured() -> bool:
    return bool(AI_SERVICE_URL)


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


def elastic_request(method: str, path: str, payload: dict[str, Any] | None = None) -> dict[str, Any] | None:
    if not elastic_configured():
        return None
    try:
        response = requests.request(
            method=method,
            url=f"{ELASTICSEARCH_URL}{path}",
            json=payload,
            headers=elastic_headers(),
            auth=elastic_auth(),
            timeout=8,
            verify=ELASTICSEARCH_VERIFY_TLS,
        )
        response.raise_for_status()
        return response.json()
    except requests.RequestException:
        return None
