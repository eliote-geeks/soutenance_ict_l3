import uuid
from copy import deepcopy
from datetime import datetime, timedelta
from typing import Any
from .scope import aggregate_scope_traffic

from fastapi import APIRouter, FastAPI, Header, HTTPException
from starlette.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from .agents import (
    assert_admin_secret,
    build_agent_activation,
    ensure_asset_document,
    ensure_profile_asset_assignment,
    fetch_agent_enrollment_tokens,
    fetch_agent_instances,
    find_agent_enrollment_token,
    find_agent_instance,
    hash_agent_token,
    require_agent_storage,
    token_expired,
)
from .analytics import (
    ai_findings,
    ai_recommendations,
    ai_status,
    derive_attacking_ips,
    derive_anomaly_score,
    derive_incidents,
    derive_model_metrics,
    derive_predictions,
    derive_pipeline_health,
    derive_realtime_metrics,
    elastic_events_from_logs,
    live_events,
    logs_feed,
)
from .config import (
    ADMIN_API_SECRET,
    AI_ALERTS_INDEX,
    AI_SERVICE_URL,
    AGENT_INSTANCES_INDEX,
    AGENT_TOKENS_INDEX,
    allowed_origins,
    ASSETS_INDEX,
    ELASTICSEARCH_URL,
    INGEST_AI_ALERTS_INDEX,
    NETSENTINEL_API_URL,
    PROFILE_ASSETS_INDEX,
    PROFILES_INDEX,
)
from .data import ALERTS, AI_FINDINGS_BUFFER, BLOCKED_IPS, HOSTS, TICKETS
from .elastic import (
    ai_service_configured,
    elastic_configured,
    elastic_index_doc,
    elastic_request,
    fetch_assets_metadata,
    fetch_elastic_logs,
    fetch_elastic_alerts,
    fetch_packetbeat_events,
    fetch_profile_asset_links,
    fetch_profiles_metadata,
)
from .scope import (
    alert_signature,
    alert_source_type,
    current_alerts,
    current_hosts,
    filter_alerts_by_scope,
    filter_hosts_by_scope,
    filter_logs_by_scope,
    filter_packet_events_by_scope,
    resolve_scope,
    scope_summary,
)
from .schemas import (
    AIFindingIngest,
    AgentCheckinRequest,
    AgentEnrollRequest,
    AgentEnrollmentTokenCreateRequest,
    AgentHeartbeatRequest,
    AssetCreateRequest,
    BlockIPRequest,
    ProfileAssetCreateRequest,
    ProfileCreateRequest,
    ReportExportRequest,
    TicketRequest,
)
from .utils import iso, now_utc, normalize_text, parse_dt, percent_change

# Request/Response models
class ChatbotRequest(BaseModel):
    message: str
    conversationHistory: list = None
    isOnline: bool = True

app = FastAPI(title="NetSentinel AI API", version="0.1.0")
api_router = APIRouter(prefix="/api")


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
    assert_admin_secret(x_admin_secret)
    tokens = []
    for token in fetch_agent_enrollment_tokens():
        tokens.append({**token, "expired": token_expired(token)})
    return {"tokens": tokens}


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


@api_router.post("/chatbot/ask")
async def chatbot_ask(request: ChatbotRequest):
    from .chatbot import get_chatbot_response

    try:
        print(f"[CHATBOT] Question: {request.message}")

        result = get_chatbot_response(
            question=request.message,
            conversation_history=request.conversationHistory or [],
            is_online=request.isOnline,
        )

        return result

    except Exception as e:
        import traceback
        traceback.print_exc()

        return {
            "response": f"Server Error: {str(e)}",
            "usedFallback": True,
        }

app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=allowed_origins(),
    allow_methods=["*"],
    allow_headers=["*"],
)
