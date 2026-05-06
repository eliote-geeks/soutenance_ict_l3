from pydantic import BaseModel


class FindingPayload(BaseModel):
    title: str
    severity: str
    description: str
    recommendation: str
    source_ip: str | None = None
    destination_ip: str | None = None
    hostname: str | None = None
    mitre_tactic: str | None = None
    mitre_techniques: list[dict[str, str]] | None = None
    confidence: float | None = None
    playbook: str | None = None
    status: str = "open"
