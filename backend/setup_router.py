import importlib
import os
from pathlib import Path

import requests as req_lib
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/api/setup", tags=["setup"])

ENV_PATH = Path(__file__).parent / ".env"


# ── Schemas ──────────────────────────────────────────────────────────────────

class ConnectionTestRequest(BaseModel):
    url: str
    username: str = ""
    password: str = ""
    api_key: str = ""
    verify_tls: bool = False


class SetupCompleteRequest(BaseModel):
    elasticsearch_url: str
    elasticsearch_username: str = "elastic"
    elasticsearch_password: str = ""
    elasticsearch_api_key: str = ""
    elasticsearch_verify_tls: bool = False
    admin_api_secret: str = "netsentinel-admin-dev-secret"
    cors_origins: str = "http://localhost:3000"
    netsentinel_api_url: str = "http://127.0.0.1:8010"
    ai_service_url: str = "http://127.0.0.1:9000"
    filebeat_index: str = "filebeat-*"
    packetbeat_index: str = "packetbeat-*"
    metricbeat_index: str = ".ds-metricbeat-*"
    ai_alerts_index: str = "ai-alerts-*"
    agent_tokens_index: str = "netsentinel-agent-enrollment-tokens"
    agent_instances_index: str = "netsentinel-agent-instances"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/status")
async def setup_status():
    """Returns whether the platform has been configured."""
    env_exists = ENV_PATH.exists()
    es_url = os.environ.get("ELASTICSEARCH_URL", "").strip()
    configured = env_exists and bool(es_url)
    return {"configured": configured, "env_exists": env_exists}


@router.post("/test-connection")
async def test_connection(body: ConnectionTestRequest):
    """Test Elasticsearch connectivity with the provided credentials."""
    try:
        kwargs: dict = {"timeout": 6, "verify": body.verify_tls}
        if body.api_key:
            kwargs["headers"] = {"Authorization": f"ApiKey {body.api_key}"}
        elif body.username:
            kwargs["auth"] = (body.username, body.password)

        url = body.url.rstrip("/")
        resp = req_lib.get(f"{url}/", **kwargs)
        if resp.status_code in (200, 401):
            # 401 means ES replied → it's reachable, but creds are wrong
            if resp.status_code == 401:
                return {"ok": False, "error": "Identifiants incorrects (HTTP 401)"}
            data = resp.json()
            return {
                "ok": True,
                "cluster_name": data.get("cluster_name", "unknown"),
                "version": data.get("version", {}).get("number", "unknown"),
                "node_name": data.get("name", ""),
            }
        return {"ok": False, "error": f"HTTP {resp.status_code}"}
    except req_lib.exceptions.ConnectionError:
        return {"ok": False, "error": "Impossible de joindre le serveur. Vérifiez l'URL et le port."}
    except req_lib.exceptions.Timeout:
        return {"ok": False, "error": "Délai d'attente dépassé (6s). Cluster lent ou inaccessible."}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


@router.get("/current-config")
async def current_config():
    """Return current .env content with sensitive values masked for display."""
    if not ENV_PATH.exists():
        return {"exists": False, "lines": []}
    lines = []
    MASK_KEYS = {"ELASTICSEARCH_PASSWORD", "ELASTICSEARCH_API_KEY", "ADMIN_API_SECRET"}
    for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
        if "=" in raw and not raw.strip().startswith("#"):
            key, _, val = raw.partition("=")
            k = key.strip()
            if k in MASK_KEYS and val:
                display = val[:4] + "•" * min(len(val) - 4, 12) if len(val) > 4 else "••••"
            else:
                display = val
            lines.append({"key": k, "value": display, "raw": raw})
        else:
            lines.append({"key": "", "value": raw, "raw": raw})
    return {"exists": True, "lines": lines}


class ResetRequest(BaseModel):
    admin_secret: str
    dry_run: bool = False


@router.post("/reset")
async def reset_app(body: ResetRequest):
    """Delete backend/.env and mark app as unconfigured. Requires admin secret."""
    from .config import ADMIN_API_SECRET
    if body.admin_secret != ADMIN_API_SECRET:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Secret admin incorrect.")
    if body.dry_run:
        return {"ok": True}  # just checking the secret is valid
    if ENV_PATH.exists():
        ENV_PATH.unlink()
    # Clear key env vars so setup/status returns configured=false immediately
    for key in ("ELASTICSEARCH_URL", "ELASTICSEARCH_USERNAME", "ELASTICSEARCH_PASSWORD",
                "ELASTICSEARCH_API_KEY", "ADMIN_API_SECRET"):
        os.environ.pop(key, None)
    return {"ok": True}


@router.post("/complete")
async def setup_complete(body: SetupCompleteRequest):
    """Write backend/.env and hot-reload config vars into the running process."""
    lines = [
        f"CORS_ORIGINS={body.cors_origins}",
        "NETSENTINEL_STORAGE_BACKEND=elastic",
        "STORAGE_JSON_PATH=./state/storage.json",
        "NETSENTINEL_TELEMETRY_BACKEND=elastic",
        "TELEMETRY_JSON_PATH=./state/telemetry.json",
        f"ELASTICSEARCH_URL={body.elasticsearch_url}",
        f"ELASTICSEARCH_USERNAME={body.elasticsearch_username}",
        f"ELASTICSEARCH_PASSWORD={body.elasticsearch_password}",
        f"ELASTICSEARCH_API_KEY={body.elasticsearch_api_key}",
        f"ELASTICSEARCH_VERIFY_TLS={'true' if body.elasticsearch_verify_tls else 'false'}",
        f"FILEBEAT_INDEX={body.filebeat_index}",
        f"PACKETBEAT_INDEX={body.packetbeat_index}",
        f"METRICBEAT_INDEX={body.metricbeat_index}",
        f"AI_ALERTS_INDEX={body.ai_alerts_index}",
        "INGEST_AI_ALERTS_INDEX=ai-alerts-manual",
        f"AI_SERVICE_URL={body.ai_service_url}",
        "ALLOW_AGENT_BASIC_AUTH=true",
        f"ADMIN_API_SECRET={body.admin_api_secret}",
        f"NETSENTINEL_API_URL={body.netsentinel_api_url}",
        f"AGENT_TOKENS_INDEX={body.agent_tokens_index}",
        f"AGENT_INSTANCES_INDEX={body.agent_instances_index}",
    ]

    ENV_PATH.parent.mkdir(parents=True, exist_ok=True)
    ENV_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")

    # Apply immediately to running process env
    updates = {
        "ELASTICSEARCH_URL": body.elasticsearch_url,
        "ELASTICSEARCH_USERNAME": body.elasticsearch_username,
        "ELASTICSEARCH_PASSWORD": body.elasticsearch_password,
        "ELASTICSEARCH_API_KEY": body.elasticsearch_api_key,
        "ELASTICSEARCH_VERIFY_TLS": "true" if body.elasticsearch_verify_tls else "false",
        "ADMIN_API_SECRET": body.admin_api_secret,
        "CORS_ORIGINS": body.cors_origins,
        "NETSENTINEL_API_URL": body.netsentinel_api_url,
        "AI_SERVICE_URL": body.ai_service_url,
    }
    for key, value in updates.items():
        os.environ[key] = value

    # Hot-reload the config module so subsequent requests use the new values
    try:
        from . import config as cfg_module
        importlib.reload(cfg_module)
    except Exception:
        pass

    return {"ok": True}
