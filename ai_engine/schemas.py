"""
schemas.py
----------
Pydantic models for the AI Engine.
FindingPayload is the standard output of every detector (heuristic or ML).
"""

from pydantic import BaseModel


class FindingPayload(BaseModel):
    """
    A single detection finding produced by any detector.
    Published to the backend via the /api/ai/findings endpoint.
    """
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
    status: str = "open"