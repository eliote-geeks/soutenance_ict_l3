from typing import Any

from pydantic import BaseModel


class BlockIPRequest(BaseModel):
    ip: str


class TicketRequest(BaseModel):
    alertId: str
    priority: str = "medium"
    assignee: str | None = None


class ReportExportRequest(BaseModel):
    type: str
    filters: dict | None = None


class AIFindingIngest(BaseModel):
    title: str
    severity: str = "medium"
    description: str
    recommendation: str
    source_ip: str | None = None
    destination_ip: str | None = None
    hostname: str | None = None
    mitre_tactic: str | None = None
    confidence: float | None = None
    playbook: str | None = None
    mitre_techniques: list[dict[str, str]] | None = None
    status: str = "open"


class ProfileCreateRequest(BaseModel):
    id: str
    name: str
    type: str = "user"
    description: str | None = None


class AssetCreateRequest(BaseModel):
    id: str
    hostname: str
    ip: str
    os: str
    role: str
    site: str = "default-site"
    environment: str = "prod"
    host_id: str | None = None
    tags: list[str] | None = None


class ProfileAssetCreateRequest(BaseModel):
    profile_id: str
    asset_id: str


class AgentEnrollmentTokenCreateRequest(BaseModel):
    asset_id: str
    profile_id: str | None = None
    site: str = "default-site"
    role: str = "workstation"
    environment: str = "prod"
    expires_in_minutes: int = 30
    single_use: bool = True


class AgentEnrollRequest(BaseModel):
    token: str
    hostname: str
    ip: str
    os: str
    agent_version: str = "0.1.0"


class AgentCheckinRequest(BaseModel):
    instance_id: str
    hostname: str | None = None
    ip: str | None = None
    os: str | None = None
    activation_applied: bool = False
    capabilities: dict[str, Any] | None = None


class AgentHeartbeatRequest(BaseModel):
    instance_id: str
    service_state: str = "running"
    last_error: str | None = None
    signals: dict[str, Any] | None = None
    action_results: list[dict[str, Any]] | None = None


class AgentInstanceActionRequest(BaseModel):
    reason: str | None = None


class AgentCommandCreateRequest(BaseModel):
    action_type: str
    parameters: dict[str, Any] | None = None
    reason: str | None = None
