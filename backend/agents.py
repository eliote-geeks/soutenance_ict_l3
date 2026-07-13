import hashlib
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException

from .config import (
    AGENT_INSTANCES_INDEX,
    AGENT_TOKENS_INDEX,
    ASSETS_INDEX,
    PROFILE_ASSETS_INDEX,
    ELASTICSEARCH_URL,
    ELASTICSEARCH_USERNAME,
    ELASTICSEARCH_PASSWORD,
    ELASTICSEARCH_API_KEY,
    ELASTICSEARCH_VERIFY_TLS,
    AGENT_ELASTIC_API_KEY,
    ALLOW_AGENT_BASIC_AUTH,
    FILEBEAT_INDEX,
    PACKETBEAT_INDEX,
    METRICBEAT_INDEX,
    NETSENTINEL_API_URL,
    current_admin_api_secret,
)
from .data import DEFAULT_ASSETS, DEFAULT_PROFILE_ASSETS
from .elastic import (
    elastic_index_doc,
    elastic_request,
    fetch_assets_metadata,
    fetch_profile_asset_links,
)
from .utils import normalize_text, parse_dt


def require_agent_storage() -> bool:
    return bool(ELASTICSEARCH_URL)


def hash_agent_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def assert_admin_secret(secret: str | None, _request: Any = None) -> None:
    if secret != current_admin_api_secret():
        raise HTTPException(status_code=401, detail="Invalid or missing admin secret")


def token_expired(token: dict[str, Any]) -> bool:
    expires = parse_dt(token.get("expires_at"))
    return expires < datetime.now(timezone.utc)


def fetch_agent_enrollment_tokens() -> list[dict[str, Any]]:
    if not require_agent_storage():
        return []
    response = elastic_request("GET", f"/{AGENT_TOKENS_INDEX}/_search", {"size": 100})
    hits = (((response or {}).get("hits") or {}).get("hits")) or []
    documents = []
    for hit in hits:
        source = hit.get("_source") or {}
        documents.append({"id": hit.get("_id"), **source})
    return documents


def fetch_agent_instances() -> list[dict[str, Any]]:
    if not require_agent_storage():
        return []
    response = elastic_request("GET", f"/{AGENT_INSTANCES_INDEX}/_search", {"size": 100})
    hits = (((response or {}).get("hits") or {}).get("hits")) or []
    instances = []
    for hit in hits:
        source = hit.get("_source") or {}
        instances.append({"id": hit.get("_id"), **source})
    return instances


def find_agent_enrollment_token(raw_token: str) -> dict[str, Any] | None:
    token_hash = hash_agent_token(raw_token)
    return next((token for token in fetch_agent_enrollment_tokens() if token.get("token_hash") == token_hash), None)


def find_agent_instance(instance_id: str) -> dict[str, Any] | None:
    return next((instance for instance in fetch_agent_instances() if instance.get("id") == instance_id), None)


def agent_elastic_auth_payload() -> dict[str, Any]:
    payload: dict[str, Any] = {
        "url": ELASTICSEARCH_URL,
        "verify_tls": ELASTICSEARCH_VERIFY_TLS,
        "indices": {
            "filebeat": FILEBEAT_INDEX,
            "packetbeat": PACKETBEAT_INDEX,
            "metricbeat": METRICBEAT_INDEX,
        },
    }
    if AGENT_ELASTIC_API_KEY:
        payload["api_key"] = AGENT_ELASTIC_API_KEY
        payload["auth_mode"] = "agent_api_key"
    elif ELASTICSEARCH_API_KEY:
        payload["api_key"] = ELASTICSEARCH_API_KEY
        payload["auth_mode"] = "shared_api_key"
    elif ALLOW_AGENT_BASIC_AUTH and ELASTICSEARCH_USERNAME and ELASTICSEARCH_PASSWORD:
        payload["username"] = ELASTICSEARCH_USERNAME
        payload["password"] = ELASTICSEARCH_PASSWORD
        payload["auth_mode"] = "basic"
        payload["allow_basic_auth"] = True
    elif ELASTICSEARCH_URL:
        payload["auth_mode"] = "none"
    else:
        payload["auth_mode"] = "missing"
    return payload


def ensure_asset_document(
    asset_id: str,
    hostname: str,
    ip: str,
    os_name: str,
    role: str,
    site: str,
    environment: str,
) -> dict[str, Any]:
    document = {
        "id": asset_id,
        "hostname": hostname,
        "host_id": asset_id,
        "ip": ip,
        "os": os_name,
        "role": role,
        "site": site,
        "environment": environment,
        "tags": [],
        "created_at": datetime.now(timezone.utc).isoformat() + "Z",
    }
    if ELASTICSEARCH_URL:
        elastic_index_doc(ASSETS_INDEX, asset_id, document)
    return document


def ensure_profile_asset_assignment(profile_id: str, asset_id: str) -> dict[str, Any]:
    link_id = f"{profile_id}__{asset_id}"
    document = {
        "id": link_id,
        "profile_id": profile_id,
        "asset_id": asset_id,
        "created_at": datetime.now(timezone.utc).isoformat() + "Z",
    }
    if ELASTICSEARCH_URL:
        elastic_index_doc(PROFILE_ASSETS_INDEX, link_id, document)
    return document


def build_agent_activation(instance: dict[str, Any]) -> dict[str, Any]:
    asset_id = instance.get("asset_id")
    profile_id = instance.get("profile_id")
    selected_asset = next((item for item in fetch_assets_metadata() if item.get("id") == asset_id), None)
    selected_profile = next((item for item in fetch_profile_asset_links() if item.get("profile_id") == profile_id), None)
    runtime_config = instance.get("runtime") or {}
    return {
        "instance_id": instance.get("id"),
        "asset_id": asset_id,
        "profile_id": profile_id,
        "assigned_at": datetime.now(timezone.utc).isoformat() + "Z",
        "asset": {
            **(selected_asset or {"id": asset_id}),
            "site": instance.get("site"),
            "role": instance.get("role"),
            "environment": instance.get("environment"),
            "profile_id": profile_id,
        },
        "profile": selected_profile or {"profile_id": profile_id},
        "elastic": agent_elastic_auth_payload(),
        "agent": {
            "name": instance.get("agent_name") or "NetSentinel Agent",
            "version": instance.get("agent_version") or "unknown",
        },
        "runtime": {
            "heartbeat_interval_seconds": runtime_config.get("heartbeat_interval_seconds", 300),
        },
        "activation_url": f"{NETSENTINEL_API_URL}/agents/{instance.get('id')}/activate",
    }
