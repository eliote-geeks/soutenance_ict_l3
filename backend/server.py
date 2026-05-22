import hashlib
import hmac
import ipaddress
import os
import secrets
import uuid
from copy import deepcopy
from datetime import timedelta
from typing import Any

from fastapi import APIRouter, FastAPI, Header, HTTPException, Request, Response
from starlette.middleware.cors import CORSMiddleware

try:
    from .ns_agent import (
        apply_agent_action_results,
        build_local_action_policy,
        build_runtime_config,
        pending_agent_actions,
        queue_agent_action,
        sanitize_agent_signals,
    )
    from .ns_analytics import (
        aggregate_packetbeat_traffic,
        ai_findings,
        ai_attack_knowledge_base,
        ai_recommendations,
        ai_status,
        anomaly_score,
        attacking_ips,
        current_alerts,
        current_hosts,
        derive_anomaly_score,
        derive_attacking_ips,
        derive_incidents,
        derive_model_metrics,
        derive_pipeline_health,
        derive_predictions,
        derive_realtime_metrics,
        live_events,
        logs_feed,
        model_metrics,
        pipeline_health,
        predictions_data,
        realtime_metrics,
        risky_hosts,
        traffic_data,
    )
    from .ns_config import (
        ADMIN_API_SECRET,
        AGENT_ELASTIC_API_KEY,
        AGENT_INSTANCES_INDEX,
        AGENT_TOKENS_INDEX,
        AI_ALERTS_INDEX,
        AI_SERVICE_URL,
        ALLOW_AGENT_BASIC_AUTH,
        ASSETS_INDEX,
        ELASTICSEARCH_API_KEY,
        ELASTICSEARCH_PASSWORD,
        ELASTICSEARCH_URL,
        ELASTICSEARCH_USERNAME,
        INGEST_AI_ALERTS_INDEX,
        NETSENTINEL_API_URL,
        NETSENTINEL_STORAGE_BACKEND,
        NETSENTINEL_TELEMETRY_BACKEND,
        PROFILE_ASSETS_INDEX,
        PROFILES_INDEX,
        alert_signature,
        allowed_origins,
        alert_source_type,
        iso,
        normalize_text,
        now_utc,
        parse_dt,
        percent_change,
    )
    from .ns_demo_data import AI_FINDINGS_BUFFER, ALERTS, BLOCKED_IPS, DEFAULT_ASSETS, DEFAULT_PROFILE_ASSETS, DEFAULT_PROFILES, HOSTS, TICKETS
    from .ns_elastic import ai_service_configured, elastic_configured, elastic_request
    from .ns_ingest import elastic_events_from_logs, fetch_ai_runtime_status
    from .ns_schemas import (
        AIFindingIngest,
        AgentCheckinRequest,
        AgentCommandCreateRequest,
        AgentEnrollmentTokenCreateRequest,
        AgentEnrollRequest,
        AgentHeartbeatRequest,
        AgentInstanceActionRequest,
        AdminSessionRequest,
        AssetCreateRequest,
        BlockIPRequest,
        ProfileAssetCreateRequest,
        ProfileCreateRequest,
        ReportExportRequest,
        TicketRequest,
    )
    from .ns_storage import fetch_documents as storage_fetch_documents
    from .ns_storage import index_doc as storage_index_doc
    from .ns_storage import storage_configured, storage_health
    from .ns_telemetry import fetch_elastic_logs, fetch_packetbeat_events, telemetry_health
except ImportError:
    from ns_agent import (
        apply_agent_action_results,
        build_local_action_policy,
        build_runtime_config,
        pending_agent_actions,
        queue_agent_action,
        sanitize_agent_signals,
    )
    from ns_analytics import (
        aggregate_packetbeat_traffic,
        ai_findings,
        ai_attack_knowledge_base,
        ai_recommendations,
        ai_status,
        anomaly_score,
        attacking_ips,
        current_alerts,
        current_hosts,
        derive_anomaly_score,
        derive_attacking_ips,
        derive_incidents,
        derive_model_metrics,
        derive_pipeline_health,
        derive_predictions,
        derive_realtime_metrics,
        live_events,
        logs_feed,
        model_metrics,
        pipeline_health,
        predictions_data,
        realtime_metrics,
        risky_hosts,
        traffic_data,
    )
    from ns_config import (
        ADMIN_API_SECRET,
        AGENT_ELASTIC_API_KEY,
        AGENT_INSTANCES_INDEX,
        AGENT_TOKENS_INDEX,
        AI_ALERTS_INDEX,
        AI_SERVICE_URL,
        ALLOW_AGENT_BASIC_AUTH,
        ASSETS_INDEX,
        ELASTICSEARCH_API_KEY,
        ELASTICSEARCH_PASSWORD,
        ELASTICSEARCH_URL,
        ELASTICSEARCH_USERNAME,
        INGEST_AI_ALERTS_INDEX,
        NETSENTINEL_API_URL,
        NETSENTINEL_STORAGE_BACKEND,
        NETSENTINEL_TELEMETRY_BACKEND,
        PROFILE_ASSETS_INDEX,
        PROFILES_INDEX,
        alert_signature,
        allowed_origins,
        alert_source_type,
        iso,
        normalize_text,
        now_utc,
        parse_dt,
        percent_change,
    )
    from ns_demo_data import AI_FINDINGS_BUFFER, ALERTS, BLOCKED_IPS, DEFAULT_ASSETS, DEFAULT_PROFILE_ASSETS, DEFAULT_PROFILES, HOSTS, TICKETS
    from ns_elastic import ai_service_configured, elastic_configured, elastic_request
    from ns_ingest import elastic_events_from_logs, fetch_ai_runtime_status
    from ns_schemas import (
        AIFindingIngest,
        AgentCheckinRequest,
        AgentCommandCreateRequest,
        AgentEnrollmentTokenCreateRequest,
        AgentEnrollRequest,
        AgentHeartbeatRequest,
        AgentInstanceActionRequest,
        AdminSessionRequest,
        AssetCreateRequest,
        BlockIPRequest,
        ProfileAssetCreateRequest,
        ProfileCreateRequest,
        ReportExportRequest,
        TicketRequest,
    )
    from ns_storage import fetch_documents as storage_fetch_documents
    from ns_storage import index_doc as storage_index_doc
    from ns_storage import storage_configured, storage_health
    from ns_telemetry import fetch_elastic_logs, fetch_packetbeat_events, telemetry_health


app = FastAPI(title="NetSentinel AI API", version="0.1.0")
api_router = APIRouter(prefix="/api")
ADMIN_SESSION_COOKIE = "netsentinel_admin_session"
ADMIN_SESSION_TTL_SECONDS = int(os.environ.get("ADMIN_SESSION_TTL_SECONDS", "28800"))


def elastic_index_doc(index: str, doc_id: str, payload: dict[str, Any]) -> bool:
    return storage_index_doc(index, doc_id, payload)


def fetch_index_documents(index: str, size: int = 200) -> list[dict[str, Any]]:
    return storage_fetch_documents(index, size=size)


def require_agent_storage() -> None:
    if not storage_configured():
        raise HTTPException(status_code=503, detail="Agent enrollment requires a configured storage backend.")


def hash_agent_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


def _sign_admin_session(payload: str) -> str:
    return hmac.new(ADMIN_API_SECRET.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).hexdigest()


def create_admin_session_token() -> str:
    nonce = secrets.token_urlsafe(32)
    issued_at = str(int(now_utc().timestamp()))
    payload = f"{issued_at}.{nonce}"
    return f"{payload}.{_sign_admin_session(payload)}"


def valid_admin_session_token(token: str | None) -> bool:
    if not token or token.count(".") != 2:
        return False
    issued_at_raw, nonce, signature = token.split(".", 2)
    payload = f"{issued_at_raw}.{nonce}"
    expected = _sign_admin_session(payload)
    if not hmac.compare_digest(signature, expected):
        return False
    try:
        issued_at = int(issued_at_raw)
    except ValueError:
        return False
    return int(now_utc().timestamp()) - issued_at <= ADMIN_SESSION_TTL_SECONDS


def assert_admin_secret(provided_secret: str | None, request: Request | None = None) -> None:
    if provided_secret and hmac.compare_digest(provided_secret, ADMIN_API_SECRET):
        return
    cookie_token = request.cookies.get(ADMIN_SESSION_COOKIE) if request else None
    if not valid_admin_session_token(cookie_token):
        raise HTTPException(status_code=401, detail="Invalid admin secret.")


@api_router.post("/admin/session")
async def create_admin_session(request: AdminSessionRequest, response: Response):
    assert_admin_secret(request.secret)
    response.set_cookie(
        ADMIN_SESSION_COOKIE,
        create_admin_session_token(),
        max_age=ADMIN_SESSION_TTL_SECONDS,
        httponly=True,
        secure=os.environ.get("ADMIN_SESSION_COOKIE_SECURE", "false").lower() == "true",
        samesite=os.environ.get("ADMIN_SESSION_COOKIE_SAMESITE", "lax"),
    )
    return {"success": True}


@api_router.delete("/admin/session")
async def delete_admin_session(response: Response):
    response.delete_cookie(ADMIN_SESSION_COOKIE)
    return {"success": True}


def token_expired(document: dict[str, Any]) -> bool:
    expires_at = document.get("expires_at")
    if not expires_at:
        return False
    return parse_dt(expires_at) <= now_utc()


def fetch_agent_enrollment_tokens() -> list[dict[str, Any]]:
    return fetch_index_documents(AGENT_TOKENS_INDEX, size=500)


def fetch_agent_instances() -> list[dict[str, Any]]:
    return fetch_index_documents(AGENT_INSTANCES_INDEX, size=500)


def find_agent_enrollment_token(raw_token: str) -> dict[str, Any] | None:
    hashed = hash_agent_token(raw_token)
    for token in fetch_agent_enrollment_tokens():
        if token.get("token_hash") == hashed:
            return token
    return None


def find_agent_instance(instance_id: str) -> dict[str, Any] | None:
    return next((item for item in fetch_agent_instances() if item.get("id") == instance_id), None)


def agent_elastic_auth_payload() -> dict[str, Any]:
    payload: dict[str, Any] = {"url": ELASTICSEARCH_URL}
    api_key = AGENT_ELASTIC_API_KEY or ELASTICSEARCH_API_KEY
    if api_key:
        payload["api_key"] = api_key
    elif ALLOW_AGENT_BASIC_AUTH and ELASTICSEARCH_USERNAME and ELASTICSEARCH_PASSWORD:
        payload["username"] = ELASTICSEARCH_USERNAME
        payload["password"] = ELASTICSEARCH_PASSWORD
    else:
        raise HTTPException(
            status_code=503,
            detail="Agent credentials are not configured. Set AGENT_ELASTIC_API_KEY or explicitly allow basic auth.",
        )
    return payload


def fetch_profiles_metadata() -> list[dict[str, Any]]:
    documents = fetch_index_documents(PROFILES_INDEX)
    if documents:
        return documents
    return deepcopy(DEFAULT_PROFILES)


def fetch_assets_metadata() -> list[dict[str, Any]]:
    documents = fetch_index_documents(ASSETS_INDEX)
    if documents:
        return documents
    return deepcopy(DEFAULT_ASSETS)


def fetch_profile_asset_links() -> list[dict[str, Any]]:
    documents = fetch_index_documents(PROFILE_ASSETS_INDEX)
    if documents:
        return documents
    return deepcopy(DEFAULT_PROFILE_ASSETS)


def ensure_asset_document(
    *,
    asset_id: str,
    hostname: str,
    ip: str,
    os_name: str,
    role: str,
    site: str,
    environment: str,
) -> dict[str, Any]:
    existing = next((item for item in fetch_assets_metadata() if item.get("id") == asset_id), None)
    if existing:
        return existing
    document = {
        "id": asset_id,
        "hostname": hostname,
        "host_id": asset_id,
        "ip": ip,
        "os": os_name,
        "role": role,
        "site": site,
        "environment": environment,
        "tags": ["netsentinel-agent", role, environment],
        "created_at": iso(now_utc()),
    }
    elastic_index_doc(ASSETS_INDEX, asset_id, document)
    return document


def ensure_profile_asset_assignment(profile_id: str | None, asset_id: str) -> None:
    if not profile_id:
        return
    link_id = f"{profile_id}__{asset_id}"
    if any(item.get("id") == link_id for item in fetch_profile_asset_links()):
        return
    elastic_index_doc(
        PROFILE_ASSETS_INDEX,
        link_id,
        {
            "id": link_id,
            "profile_id": profile_id,
            "asset_id": asset_id,
            "created_at": iso(now_utc()),
        },
    )


def build_agent_activation(instance: dict[str, Any]) -> dict[str, Any]:
    asset_id = normalize_text(instance.get("asset_id"), "").strip()
    if not asset_id:
        raise HTTPException(status_code=400, detail="Agent instance is missing an asset_id.")
    asset = next((item for item in fetch_assets_metadata() if item.get("id") == asset_id), None) or {}
    return {
        "agent": {
            "name": "NetSentinel Agent",
            "instance_id": instance.get("id"),
            "status": instance.get("status"),
            "approved_at": instance.get("approved_at"),
            "version": instance.get("agent_version") or "unknown",
        },
        "asset": {
            "id": asset_id,
            "hostname": asset.get("hostname") or instance.get("hostname"),
            "ip": asset.get("ip") or instance.get("ip"),
            "os": asset.get("os") or instance.get("os"),
            "role": asset.get("role") or instance.get("role") or "workstation",
            "site": asset.get("site") or instance.get("site") or "default-site",
            "environment": asset.get("environment") or instance.get("environment") or "prod",
            "profile_id": instance.get("profile_id"),
        },
        "elastic": agent_elastic_auth_payload(),
        "server": {"api_url": NETSENTINEL_API_URL},
        "runtime": build_runtime_config(instance.get("os")),
        "local_actions": build_local_action_policy(),
    }


def resolve_scope(profile_id: str | None = None, asset_id: str | None = None) -> dict[str, Any]:
    profiles = fetch_profiles_metadata()
    assets = fetch_assets_metadata()
    links = fetch_profile_asset_links()
    selected_profile = next((item for item in profiles if item.get("id") == profile_id), None) if profile_id else None
    if asset_id:
        selected_assets = [item for item in assets if item.get("id") == asset_id]
    elif selected_profile:
        allowed_asset_ids = {item.get("asset_id") for item in links if item.get("profile_id") == selected_profile.get("id")}
        selected_assets = [item for item in assets if item.get("id") in allowed_asset_ids]
    else:
        selected_assets = assets
    return {
        "profile": selected_profile,
        "assets": selected_assets,
        "assetIds": {item.get("id") for item in selected_assets if item.get("id")},
        "hostnames": {normalize_text(item.get("hostname"), "") for item in selected_assets if item.get("hostname")},
        "ips": {normalize_text(item.get("ip"), "") for item in selected_assets if item.get("ip")},
    }


def filter_logs_by_scope(logs: list[dict[str, Any]], scope: dict[str, Any]) -> list[dict[str, Any]]:
    if len(scope.get("assets") or []) == len(fetch_assets_metadata()):
        return logs
    hostnames = scope.get("hostnames") or set()
    ips = scope.get("ips") or set()
    filtered = []
    for item in logs:
        fields = item.get("fields") or {}
        if normalize_text(fields.get("host"), "") in hostnames:
            filtered.append(item)
            continue
        if normalize_text(fields.get("source_ip"), "") in ips or normalize_text(fields.get("destination_ip"), "") in ips:
            filtered.append(item)
    return filtered


def filter_packet_events_by_scope(events: list[dict[str, Any]], scope: dict[str, Any]) -> list[dict[str, Any]]:
    if len(scope.get("assets") or []) == len(fetch_assets_metadata()):
        return events
    hostnames = scope.get("hostnames") or set()
    ips = scope.get("ips") or set()
    filtered = []
    for item in events:
        if normalize_text(item.get("hostname"), "") in hostnames:
            filtered.append(item)
            continue
        if normalize_text(item.get("sourceIP"), "") in ips or normalize_text(item.get("destIP"), "") in ips:
            filtered.append(item)
    return filtered


def filter_alerts_by_scope(alerts: list[dict[str, Any]], scope: dict[str, Any]) -> list[dict[str, Any]]:
    if len(scope.get("assets") or []) == len(fetch_assets_metadata()):
        return alerts
    hostnames = scope.get("hostnames") or set()
    ips = scope.get("ips") or set()
    filtered = []
    for item in alerts:
        if normalize_text(item.get("hostname"), "") in hostnames:
            filtered.append(item)
            continue
        if normalize_text(item.get("sourceIP"), "") in ips or normalize_text(item.get("destIP"), "") in ips:
            filtered.append(item)
    return filtered


def filter_hosts_by_scope(hosts: list[dict[str, Any]], scope: dict[str, Any]) -> list[dict[str, Any]]:
    if len(scope.get("assets") or []) == len(fetch_assets_metadata()):
        return hosts
    hostnames = scope.get("hostnames") or set()
    ips = scope.get("ips") or set()
    return [item for item in hosts if normalize_text(item.get("hostname"), "") in hostnames or normalize_text(item.get("ip"), "") in ips]


def aggregate_scope_traffic(packet_events: list[dict[str, Any]], alerts: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if not packet_events:
        return aggregate_packetbeat_traffic()
    now = now_utc()
    buckets = []
    for hours_ago in range(23, -1, -1):
        bucket_start = (now - timedelta(hours=hours_ago)).replace(minute=0, second=0, microsecond=0)
        bucket_end = bucket_start + timedelta(hours=1)
        scoped_packets = [item for item in packet_events if bucket_start <= parse_dt(item.get("timestamp")) < bucket_end]
        scoped_alerts = [item for item in alerts if bucket_start <= parse_dt(item.get("timestamp")) < bucket_end]
        buckets.append(
            {
                "timestamp": bucket_start.isoformat(),
                "alerts": len(scoped_alerts),
                "blocked": len([item for item in scoped_alerts if normalize_text(item.get("status"), "open") in {"resolved", "blocked"}]),
                "inbound": len(scoped_packets) * 48,
                "outbound": len(scoped_packets) * 36,
            }
        )
    return buckets


def scope_summary(scope: dict[str, Any]) -> dict[str, Any]:
    assets = scope.get("assets") or []
    profile = scope.get("profile")
    return {
        "type": "profile" if profile else ("asset" if len(assets) == 1 else "all"),
        "profile": profile,
        "assetCount": len(assets),
        "assets": assets,
    }


@api_router.get("/")
async def root():
    return {
        "name": "NetSentinel AI API",
        "mode": f"{NETSENTINEL_STORAGE_BACKEND}-storage" if storage_configured() else "demo-backed",
        "storage": storage_health(),
        "telemetry": telemetry_health(),
        "elastic_url": ELASTICSEARCH_URL or "remote-not-configured",
        "ai_service_url": AI_SERVICE_URL or "not-configured",
        "message": "Use NETSENTINEL_STORAGE_BACKEND to switch metadata storage without changing code.",
    }


@api_router.get("/health")
async def health():
    elastic_ok = elastic_request("GET", "/_cluster/health") if elastic_configured() else None
    return {
        "status": "ok",
        "storage": storage_health(),
        "telemetry": telemetry_health(),
        "telemetryBackend": NETSENTINEL_TELEMETRY_BACKEND,
        "elasticConfigured": elastic_configured(),
        "elasticReachable": bool(elastic_ok) if elastic_configured() else False,
        "aiServiceConfigured": ai_service_configured(),
    }


@api_router.get("/scope/options")
async def scope_options():
    profiles = fetch_profiles_metadata()
    assets = fetch_assets_metadata()
    links = fetch_profile_asset_links()
    profile_counts = {item.get("profile_id"): 0 for item in links}
    for link in links:
        profile_counts[link.get("profile_id")] = profile_counts.get(link.get("profile_id"), 0) + 1
    return {
        "profiles": [{**item, "assetCount": profile_counts.get(item.get("id"), 0)} for item in profiles],
        "assets": assets,
        "assignments": links,
    }


@api_router.get("/scope")
async def scope(profile_id: str | None = None, asset_id: str | None = None):
    return scope_summary(resolve_scope(profile_id=profile_id, asset_id=asset_id))


@api_router.get("/profiles")
async def profiles():
    return {"profiles": fetch_profiles_metadata()}


@api_router.post("/profiles")
async def create_profile(request: ProfileCreateRequest):
    document = {"id": request.id, "name": request.name, "type": request.type, "description": request.description, "created_at": iso(now_utc())}
    stored = elastic_index_doc(PROFILES_INDEX, request.id, document) if storage_configured() else False
    return {"success": stored or not storage_configured(), "profile": document}


@api_router.get("/assets")
async def assets():
    assets_payload = fetch_assets_metadata()
    links = fetch_profile_asset_links()
    profile_lookup = {item.get("id"): item for item in fetch_profiles_metadata()}
    agent_lookup: dict[str, dict[str, Any]] = {}
    for instance in fetch_agent_instances() if storage_configured() else []:
        asset_key = normalize_text(instance.get("asset_id"), "")
        if not asset_key:
            continue
        current = agent_lookup.get(asset_key)
        if not current or parse_dt(instance.get("last_seen_at")) >= parse_dt(current.get("last_seen_at")):
            agent_lookup[asset_key] = instance
    profiles_by_asset: dict[str, list[dict[str, Any]]] = {}
    for link in links:
        asset_profiles = profiles_by_asset.setdefault(link.get("asset_id"), [])
        profile = profile_lookup.get(link.get("profile_id"))
        if profile:
            asset_profiles.append({"id": profile.get("id"), "name": profile.get("name"), "type": profile.get("type")})
    return {
        "assets": [
            {
                **item,
                "profiles": profiles_by_asset.get(item.get("id"), []),
                "agentStatus": (agent_lookup.get(item.get("id")) or {}).get("status", "inactive"),
                "agentLastSeenAt": (agent_lookup.get(item.get("id")) or {}).get("last_seen_at"),
                "agentInstanceId": (agent_lookup.get(item.get("id")) or {}).get("id"),
            }
            for item in assets_payload
        ]
    }


@api_router.post("/assets")
async def create_asset(request: AssetCreateRequest):
    document = {
        "id": request.id,
        "hostname": request.hostname,
        "host_id": request.host_id or request.id,
        "ip": request.ip,
        "os": request.os,
        "role": request.role,
        "site": request.site,
        "environment": request.environment,
        "tags": request.tags or [],
        "created_at": iso(now_utc()),
    }
    stored = elastic_index_doc(ASSETS_INDEX, request.id, document) if storage_configured() else False
    return {"success": stored or not storage_configured(), "asset": document}


@api_router.post("/profile-assets")
async def assign_profile_asset(request: ProfileAssetCreateRequest):
    link_id = f"{request.profile_id}__{request.asset_id}"
    document = {"id": link_id, "profile_id": request.profile_id, "asset_id": request.asset_id, "created_at": iso(now_utc())}
    stored = elastic_index_doc(PROFILE_ASSETS_INDEX, link_id, document) if storage_configured() else False
    return {"success": stored or not storage_configured(), "assignment": document}


@api_router.post("/agent/enrollment-tokens")
async def create_agent_enrollment_token(request: AgentEnrollmentTokenCreateRequest, http_request: Request, x_admin_secret: str | None = Header(default=None)):
    require_agent_storage()
    assert_admin_secret(x_admin_secret, http_request)
    token_id = f"token_{uuid.uuid4().hex[:12]}"
    raw_token = f"nst_{uuid.uuid4().hex}{uuid.uuid4().hex[:8]}"
    document = {
        "id": token_id,
        "token_hash": hash_agent_token(raw_token),
        "asset_id": request.asset_id,
        "profile_id": request.profile_id,
        "site": request.site,
        "role": request.role,
        "environment": request.environment,
        "single_use": request.single_use,
        "status": "active",
        "created_at": iso(now_utc()),
        "expires_at": iso(now_utc() + timedelta(minutes=max(1, request.expires_in_minutes))),
    }
    elastic_index_doc(AGENT_TOKENS_INDEX, token_id, document)
    return {"success": True, "token": {**document, "raw_token": raw_token}}


@api_router.get("/agent/enrollment-tokens")
async def list_agent_enrollment_tokens(http_request: Request, x_admin_secret: str | None = Header(default=None)):
    require_agent_storage()
    assert_admin_secret(x_admin_secret, http_request)
    return {"tokens": [{**token, "expired": token_expired(token)} for token in fetch_agent_enrollment_tokens()]}


@api_router.post("/agent/enrollment-tokens/{token_id}/revoke")
async def revoke_agent_enrollment_token(token_id: str, http_request: Request, x_admin_secret: str | None = Header(default=None)):
    require_agent_storage()
    assert_admin_secret(x_admin_secret, http_request)
    token = next((item for item in fetch_agent_enrollment_tokens() if item.get("id") == token_id), None)
    if not token:
        raise HTTPException(status_code=404, detail="Enrollment token not found.")
    token["status"] = "revoked"
    token["revoked_at"] = iso(now_utc())
    elastic_index_doc(AGENT_TOKENS_INDEX, token_id, token)
    return {"success": True, "token": token}


@api_router.get("/agent/instances")
async def list_agent_instances(http_request: Request, x_admin_secret: str | None = Header(default=None)):
    require_agent_storage()
    assert_admin_secret(x_admin_secret, http_request)
    assets_lookup = {item.get("id"): item for item in fetch_assets_metadata()}
    instances = []
    for instance in fetch_agent_instances():
        asset = assets_lookup.get(instance.get("asset_id")) or {}
        instances.append(
            {
                **instance,
                "asset": {
                    "id": asset.get("id") or instance.get("asset_id"),
                    "hostname": asset.get("hostname") or instance.get("hostname"),
                    "ip": asset.get("ip") or instance.get("ip"),
                    "os": asset.get("os") or instance.get("os"),
                    "role": asset.get("role") or instance.get("role"),
                    "site": asset.get("site") or instance.get("site"),
                    "environment": asset.get("environment") or instance.get("environment"),
                },
            }
        )
    return {"instances": instances}


@api_router.post("/agent/enroll")
async def enroll_agent(request: AgentEnrollRequest):
    require_agent_storage()
    token = find_agent_enrollment_token(request.token)
    if not token:
        raise HTTPException(status_code=404, detail="Enrollment token not found.")
    if token.get("status") == "revoked":
        raise HTTPException(status_code=403, detail="Enrollment token revoked.")
    if token_expired(token):
        raise HTTPException(status_code=403, detail="Enrollment token expired.")
    if token.get("single_use") and token.get("claimed_by_instance_id"):
        raise HTTPException(status_code=409, detail="Enrollment token already used.")

    instance_id = f"agent_{uuid.uuid4().hex[:12]}"
    instance = {
        "id": instance_id,
        "token_id": token.get("id"),
        "asset_id": token.get("asset_id"),
        "profile_id": token.get("profile_id"),
        "site": token.get("site") or "default-site",
        "role": token.get("role") or "workstation",
        "environment": token.get("environment") or "prod",
        "hostname": request.hostname,
        "ip": request.ip,
        "os": request.os,
        "agent_version": request.agent_version,
        "status": "pending_approval",
        "created_at": iso(now_utc()),
        "last_seen_at": iso(now_utc()),
    }
    elastic_index_doc(AGENT_INSTANCES_INDEX, instance_id, instance)
    token["status"] = "claimed"
    token["claimed_at"] = iso(now_utc())
    token["claimed_by_instance_id"] = instance_id
    elastic_index_doc(AGENT_TOKENS_INDEX, normalize_text(token.get("id"), token.get("id")), token)
    return {
        "success": True,
        "instance": {"id": instance_id, "status": instance["status"], "asset_id": instance["asset_id"], "profile_id": instance["profile_id"]},
        "message": "Enrollment request received. Waiting for admin approval.",
    }


@api_router.post("/agent/instances/{instance_id}/approve")
async def approve_agent_instance(instance_id: str, http_request: Request, x_admin_secret: str | None = Header(default=None)):
    require_agent_storage()
    assert_admin_secret(x_admin_secret, http_request)
    instance = find_agent_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Agent instance not found.")

    ensure_asset_document(
        asset_id=normalize_text(instance.get("asset_id"), instance_id),
        hostname=normalize_text(instance.get("hostname"), instance_id),
        ip=normalize_text(instance.get("ip"), "127.0.0.1"),
        os_name=normalize_text(instance.get("os"), "Unknown"),
        role=normalize_text(instance.get("role"), "workstation"),
        site=normalize_text(instance.get("site"), "default-site"),
        environment=normalize_text(instance.get("environment"), "prod"),
    )
    ensure_profile_asset_assignment(instance.get("profile_id"), normalize_text(instance.get("asset_id"), instance_id))

    instance["status"] = "approved"
    instance["approved_at"] = iso(now_utc())
    instance["last_seen_at"] = iso(now_utc())
    instance["local_action_policy"] = build_local_action_policy()
    instance["runtime"] = build_runtime_config(instance.get("os"))
    elastic_index_doc(AGENT_INSTANCES_INDEX, instance_id, instance)
    return {"success": True, "instance": instance, "activation": build_agent_activation(instance)}


@api_router.post("/agent/instances/{instance_id}/reject")
async def reject_agent_instance(instance_id: str, request: AgentInstanceActionRequest, http_request: Request, x_admin_secret: str | None = Header(default=None)):
    require_agent_storage()
    assert_admin_secret(x_admin_secret, http_request)
    instance = find_agent_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Agent instance not found.")
    instance["status"] = "rejected"
    instance["rejected_at"] = iso(now_utc())
    if request.reason:
        instance["last_error"] = request.reason
    elastic_index_doc(AGENT_INSTANCES_INDEX, instance_id, instance)
    return {"success": True, "instance": instance}


@api_router.post("/agent/instances/{instance_id}/disable")
async def disable_agent_instance(instance_id: str, request: AgentInstanceActionRequest, http_request: Request, x_admin_secret: str | None = Header(default=None)):
    require_agent_storage()
    assert_admin_secret(x_admin_secret, http_request)
    instance = find_agent_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Agent instance not found.")
    instance["status"] = "inactive"
    instance["disabled_at"] = iso(now_utc())
    instance["service_state"] = "disabled"
    if request.reason:
        instance["last_error"] = request.reason
    elastic_index_doc(AGENT_INSTANCES_INDEX, instance_id, instance)
    return {"success": True, "instance": instance}


@api_router.post("/agent/instances/{instance_id}/actions")
async def queue_agent_instance_action(instance_id: str, request: AgentCommandCreateRequest, http_request: Request, x_admin_secret: str | None = Header(default=None)):
    require_agent_storage()
    assert_admin_secret(x_admin_secret, http_request)
    instance = find_agent_instance(instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Agent instance not found.")
    if normalize_text(instance.get("status"), "pending_approval") not in {"approved", "active"}:
        raise HTTPException(status_code=409, detail="Only approved or active agents can receive local actions.")
    try:
        action = queue_agent_action(
            instance,
            action_type=request.action_type,
            parameters=request.parameters,
            reason=request.reason,
            confirmation=request.confirmation,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    elastic_index_doc(AGENT_INSTANCES_INDEX, instance_id, instance)
    return {"success": True, "action": action, "pendingActions": pending_agent_actions(instance)}


@api_router.post("/agent/checkin")
async def agent_checkin(request: AgentCheckinRequest):
    require_agent_storage()
    instance = find_agent_instance(request.instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Agent instance not found.")

    if request.hostname:
        instance["hostname"] = request.hostname
    if request.ip:
        instance["ip"] = request.ip
    if request.os:
        instance["os"] = request.os
    if request.capabilities:
        instance["capabilities"] = request.capabilities
    instance["last_seen_at"] = iso(now_utc())

    status = normalize_text(instance.get("status"), "pending_approval")
    if status == "rejected":
        response: dict[str, Any] = {
            "success": False,
            "instance": {"id": instance.get("id"), "status": "rejected", "asset_id": instance.get("asset_id")},
            "message": "Enrollment rejected by an administrator.",
        }
        if instance.get("last_error"):
            response["error"] = instance.get("last_error")
        return response
    if status == "inactive":
        response = {
            "success": False,
            "instance": {"id": instance.get("id"), "status": "inactive", "asset_id": instance.get("asset_id")},
            "message": "Agent disabled by an administrator.",
        }
        if instance.get("last_error"):
            response["error"] = instance.get("last_error")
        return response
    if status == "approved" and request.activation_applied:
        instance["status"] = "active"
        instance["activated_at"] = iso(now_utc())
        status = "active"
    elastic_index_doc(AGENT_INSTANCES_INDEX, request.instance_id, instance)

    response = {
        "success": True,
        "instance": {"id": instance.get("id"), "status": status, "asset_id": instance.get("asset_id")},
        "pending_actions": pending_agent_actions(instance) if status in {"approved", "active"} else [],
    }
    if status in {"approved", "active"}:
        response["activation"] = build_agent_activation(instance)
        response["message"] = "Apply activation payload locally." if status == "approved" else "Agent active."
    else:
        response["message"] = "Enrollment pending admin approval."
    return response


@api_router.post("/agent/heartbeat")
async def agent_heartbeat(request: AgentHeartbeatRequest):
    require_agent_storage()
    instance = find_agent_instance(request.instance_id)
    if not instance:
        raise HTTPException(status_code=404, detail="Agent instance not found.")
    instance["last_seen_at"] = iso(now_utc())
    instance["service_state"] = request.service_state
    if request.last_error:
        instance["last_error"] = request.last_error
    if request.signals:
        instance["last_signals"] = sanitize_agent_signals(request.signals)
        instance["last_signals_at"] = iso(now_utc())
    applied_results = apply_agent_action_results(instance, request.action_results)
    elastic_index_doc(AGENT_INSTANCES_INDEX, request.instance_id, instance)
    return {
        "success": True,
        "instance": {
            "id": instance.get("id"),
            "status": instance.get("status"),
            "last_seen_at": instance.get("last_seen_at"),
            "service_state": instance.get("service_state"),
        },
        "pending_actions": pending_agent_actions(instance),
        "applied_action_results": applied_results,
    }


@api_router.get("/overview")
async def overview(profile_id: str | None = None, asset_id: str | None = None):
    resolved_scope = resolve_scope(profile_id=profile_id, asset_id=asset_id)
    alerts = filter_alerts_by_scope(current_alerts(), resolved_scope)
    hosts = filter_hosts_by_scope(current_hosts(), resolved_scope)
    incidents_live = derive_incidents(alerts)
    packetbeat_events = filter_packet_events_by_scope(fetch_packetbeat_events(), resolved_scope)
    logs = filter_logs_by_scope(fetch_elastic_logs(), resolved_scope)
    recent_24h = [item for item in alerts if parse_dt(item.get("timestamp")) >= now_utc() - timedelta(hours=24)]
    previous_24h = [item for item in alerts if now_utc() - timedelta(hours=48) <= parse_dt(item.get("timestamp")) < now_utc() - timedelta(hours=24)]
    recent_12h_anomalies = [item for item in alerts if parse_dt(item.get("timestamp")) >= now_utc() - timedelta(hours=12)]
    previous_12h_anomalies = [item for item in alerts if now_utc() - timedelta(hours=24) <= parse_dt(item.get("timestamp")) < now_utc() - timedelta(hours=12)]
    detection_minutes = [max(1, int((now_utc() - parse_dt(item.get("timestamp"))).total_seconds() / 60)) for item in recent_24h[:10]]
    mean_time_to_detect = round(sum(detection_minutes) / max(len(detection_minutes), 1), 1)
    return {
        "kpis": {
            "totalAlerts": len(alerts),
            "anomalies": len([item for item in alerts if normalize_text(item.get("severity"), "medium") in {"high", "critical", "medium"}]),
            "incidentsOpen": len([item for item in incidents_live if item["status"] in {"active", "investigating"}]),
            "meanTimeToDetect": f"{mean_time_to_detect:.1f}",
            "alertsTrend": percent_change(len(recent_24h), len(previous_24h)),
            "anomaliesTrend": percent_change(len(recent_12h_anomalies), len(previous_12h_anomalies)),
            "incidentsTrend": percent_change(len([item for item in incidents_live if item["status"] in {"active", "investigating"}]), max(0, len(previous_24h))),
            "mttdTrend": percent_change(mean_time_to_detect, max(mean_time_to_detect + 2, 1)),
        },
        "trafficData": aggregate_scope_traffic(packetbeat_events, alerts),
        "riskyHosts": sorted(hosts, key=lambda item: item["riskScore"], reverse=True)[:5],
        "attackingIPs": derive_attacking_ips(alerts),
        "anomalyScore": derive_anomaly_score(alerts, packetbeat_events, logs),
        "scope": scope_summary(resolved_scope),
    }


@api_router.get("/stream")
async def stream(profile_id: str | None = None, asset_id: str | None = None):
    resolved_scope = resolve_scope(profile_id=profile_id, asset_id=asset_id)
    alerts = filter_alerts_by_scope(current_alerts(), resolved_scope)
    packetbeat_events = filter_packet_events_by_scope(fetch_packetbeat_events(), resolved_scope)
    if packetbeat_events:
        return {"events": packetbeat_events, "metrics": derive_realtime_metrics(packetbeat_events, fetch_elastic_logs(), alerts)}
    elastic_logs = filter_logs_by_scope(fetch_elastic_logs(), resolved_scope)
    if elastic_logs:
        return {"events": elastic_events_from_logs(elastic_logs), "metrics": derive_realtime_metrics([], elastic_logs, alerts)}
    return {"events": live_events(), "metrics": derive_realtime_metrics([], logs_feed(), alerts)}


@api_router.get("/logs")
async def logs(profile_id: str | None = None, asset_id: str | None = None):
    resolved_scope = resolve_scope(profile_id=profile_id, asset_id=asset_id)
    payload = filter_logs_by_scope(fetch_elastic_logs(), resolved_scope) or filter_logs_by_scope(logs_feed(), resolved_scope)
    return {"logs": payload, "total": len(payload), "page": 1, "pageSize": len(payload)}


@api_router.get("/alerts")
async def alerts(profile_id: str | None = None, asset_id: str | None = None):
    payload = filter_alerts_by_scope(current_alerts(), resolve_scope(profile_id=profile_id, asset_id=asset_id))
    return {"alerts": payload, "total": len(payload)}


@api_router.get("/incidents")
async def incidents(profile_id: str | None = None, asset_id: str | None = None):
    return {"incidents": derive_incidents(filter_alerts_by_scope(current_alerts(), resolve_scope(profile_id=profile_id, asset_id=asset_id)))}


@api_router.get("/hosts")
async def hosts(profile_id: str | None = None, asset_id: str | None = None):
    return {"hosts": filter_hosts_by_scope(current_hosts(), resolve_scope(profile_id=profile_id, asset_id=asset_id))}


@api_router.get("/model")
async def model(profile_id: str | None = None, asset_id: str | None = None):
    resolved_scope = resolve_scope(profile_id=profile_id, asset_id=asset_id)
    return derive_model_metrics(
        filter_alerts_by_scope(current_alerts(), resolved_scope),
        filter_logs_by_scope(fetch_elastic_logs(), resolved_scope),
        filter_packet_events_by_scope(fetch_packetbeat_events(), resolved_scope),
    )


@api_router.get("/predictions")
async def predictions(profile_id: str | None = None, asset_id: str | None = None):
    resolved_scope = resolve_scope(profile_id=profile_id, asset_id=asset_id)
    return derive_predictions(filter_alerts_by_scope(current_alerts(), resolved_scope), filter_hosts_by_scope(current_hosts(), resolved_scope))


@api_router.get("/pipeline")
async def pipeline(profile_id: str | None = None, asset_id: str | None = None):
    resolved_scope = resolve_scope(profile_id=profile_id, asset_id=asset_id)
    return derive_pipeline_health(
        filter_logs_by_scope(fetch_elastic_logs(), resolved_scope),
        filter_packet_events_by_scope(fetch_packetbeat_events(), resolved_scope),
        filter_alerts_by_scope(current_alerts(), resolved_scope),
        filter_hosts_by_scope(current_hosts(), resolved_scope),
    )


@api_router.get("/ai/status")
async def ai_engine_status():
    return ai_status()


@api_router.get("/ai/findings")
async def ai_engine_findings():
    findings = ai_findings()
    return {"findings": findings, "total": len(findings)}


@api_router.get("/ai/recommendations")
async def ai_engine_recommendations():
    return {"items": ai_recommendations()}


@api_router.get("/ai/attack-knowledge-base")
async def ai_engine_attack_knowledge_base():
    return ai_attack_knowledge_base()


@api_router.post("/ai/findings")
async def ingest_ai_finding(finding: AIFindingIngest):
    alert_id = f"AI-{uuid.uuid4().hex[:12].upper()}"
    document = {
        "@timestamp": iso(now_utc()),
        "alert_id": alert_id,
        "title": finding.title,
        "severity": finding.severity.lower(),
        "description": finding.description,
        "recommendation": finding.recommendation,
        "source_ip": finding.source_ip,
        "destination_ip": finding.destination_ip,
        "hostname": finding.hostname,
        "mitre_tactic": finding.mitre_tactic,
        "confidence": finding.confidence,
        "playbook": finding.playbook,
        "mitre_techniques": finding.mitre_techniques,
        "status": finding.status.lower(),
    }
    AI_FINDINGS_BUFFER.insert(
        0,
        {
            "id": alert_id,
            "timestamp": document["@timestamp"],
            "title": finding.title,
            "severity": finding.severity.lower(),
            "status": finding.status.lower(),
            "sourceIP": normalize_text(finding.source_ip, "unknown"),
            "destIP": normalize_text(finding.destination_ip, "unknown"),
            "hostname": normalize_text(finding.hostname, "unknown-host"),
            "assignee": "Unassigned",
            "eta": None,
            "mitreTactic": normalize_text(finding.mitre_tactic, "Discovery"),
            "description": finding.description,
            "recommendation": finding.recommendation,
            "playbook": normalize_text(finding.playbook, "Validate the anomaly and contain if confirmed."),
            "confidence": finding.confidence,
            "sourceType": alert_source_type(finding.title),
            "mitreTechniques": finding.mitre_techniques or [],
            "signature": alert_signature(finding.title, finding.source_ip, finding.destination_ip, finding.hostname, finding.mitre_tactic),
        },
    )
    if storage_configured():
        document["source_type"] = alert_source_type(finding.title)
        document["signature"] = alert_signature(finding.title, finding.source_ip, finding.destination_ip, finding.hostname, finding.mitre_tactic)
        elastic_index_doc(INGEST_AI_ALERTS_INDEX, alert_id, document)
    return {"success": True, "alertId": alert_id}


@api_router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(alert_id: str):
    for alert in ALERTS:
        if alert["id"] == alert_id:
            alert["status"] = "investigating"
            return {"success": True, "alertId": alert_id, "status": "investigating"}
    return {"success": False, "alertId": alert_id}


@api_router.post("/hosts/{host_id}/isolate")
async def isolate_host(host_id: str):
    for host in HOSTS:
        if host["id"] == host_id or host["hostname"] == host_id:
            host["status"] = "offline"
            host["riskScore"] = min(host["riskScore"] + 5, 100)
            return {"success": True, "hostId": host_id}
    return {"success": False, "hostId": host_id}


@api_router.post("/firewall/block")
async def block_ip(request: BlockIPRequest):
    BLOCKED_IPS.add(request.ip)
    return {"success": True, "ip": request.ip}


@api_router.post("/tickets")
async def create_ticket(request: TicketRequest):
    ticket_id = f"TKT-{len(TICKETS) + 1001}"
    TICKETS.append({"ticketId": ticket_id, "alertId": request.alertId, "priority": request.priority, "assignee": request.assignee, "createdAt": iso(now_utc())})
    return {"success": True, "ticketId": ticket_id}


@api_router.post("/reports/export")
async def export_report(request: ReportExportRequest):
    report_name = f"{request.type}-report-{now_utc().strftime('%Y%m%d%H%M%S')}.pdf"
    return {"success": True, "downloadUrl": f"/downloads/{report_name}"}


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=allowed_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)
