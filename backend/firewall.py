"""
firewall.py
-----------
Applique reellement les decisions de blocage d'adresse IP.

Le moteur IA *decide* (ai_engine/prevention.py), ce module *applique*. La
separation est volontaire : toute decision de blocage passe par ici, donc
par un seul point auditable.

L'application se fait via l'agent NetSentinel installe sur la machine
attaquee : le backend lui met en file une action `block_ip`, l'agent la
recupere a son prochain checkin et pose la regle iptables localement.
C'est le modele agent/bouncer de Wazuh et CrowdSec.

Chaque blocage est *stateful* : il porte une date d'expiration et est
automatiquement leve ensuite (action `unblock_ip`). C'est le garde-fou
contre les faux positifs : une detection erronee ne bannit jamais
definitivement un utilisateur legitime.

Si aucun agent n'est en mesure d'appliquer le blocage, le blocage est
enregistre avec le statut `pending` et le signale honnetement : la
plateforme ne pretend jamais avoir bloque ce qu'elle n'a pas bloque.
"""

import uuid
from datetime import timedelta
from typing import Any

from .agents import fetch_agent_instances
from .config import (
    AGENT_INSTANCES_INDEX,
    AUTO_BLOCK_ENABLED,
    BLOCK_DURATION_MINUTES,
    IP_BLOCKS_INDEX,
)
from .elastic import elastic_index_doc, elastic_request, fetch_index_documents
from .ns_agent import queue_agent_action
from .utils import iso, normalize_text, now_utc, parse_dt

# Adresses qui ne doivent jamais etre bloquees, quoi qu'il arrive.
# Sans ce garde-fou, la plateforme peut se couper elle-meme du reseau.
NEVER_BLOCK: set[str] = {"127.0.0.1", "::1", "localhost"}

ENFORCEABLE_AGENT_STATUSES = {"approved", "active"}


def _agents_for_host(hostname: str | None) -> list[dict[str, Any]]:
    """
    Agents capables d'appliquer un blocage.

    Si un hostname est fourni, on cible l'agent de cette machine : c'est
    elle qui subit l'attaque, c'est donc la que la regle doit tomber.
    Sans hostname, on ne cible rien : bloquer au hasard serait pire que
    ne pas bloquer.
    """
    target = normalize_text(hostname, "").strip().lower()
    if not target:
        return []

    matches = []
    for instance in fetch_agent_instances():
        if normalize_text(instance.get("status"), "") not in ENFORCEABLE_AGENT_STATUSES:
            continue
        candidates = {
            normalize_text(instance.get("hostname"), "").lower(),
            normalize_text(instance.get("asset_id"), "").lower(),
        }
        if target in candidates:
            matches.append(instance)
    return matches


def _dispatch(instances: list[dict[str, Any]], action_type: str, ip: str, reason: str) -> list[str]:
    """Met l'action en file sur chaque agent et persiste l'instance."""
    dispatched = []
    for instance in instances:
        try:
            queue_agent_action(
                instance,
                action_type=action_type,
                parameters={"ip": ip},
                reason=reason,
                confirmation="CONFIRM_LOCAL_ACTION",
            )
        except ValueError:
            continue
        instance_id = instance.get("id")
        if instance_id and elastic_index_doc(AGENT_INSTANCES_INDEX, instance_id, instance):
            dispatched.append(instance_id)
    return dispatched


def find_active_block(ip: str) -> dict[str, Any] | None:
    return next(
        (
            block
            for block in fetch_index_documents(IP_BLOCKS_INDEX)
            if block.get("ip") == ip and block.get("status") in {"enforced", "pending"}
        ),
        None,
    )


def enforce_block(
    ip: str,
    *,
    hostname: str | None = None,
    reason: str | None = None,
    duration_minutes: int | None = None,
) -> dict[str, Any]:
    """
    Bloque une adresse IP sur la machine attaquee, pour une duree limitee.

    Renvoie l'etat reel du blocage. `enforced` vaut True uniquement si un
    agent a effectivement recu l'ordre de poser la regle.
    """
    if ip in NEVER_BLOCK:
        return {"ip": ip, "status": "refused", "enforced": False, "detail": "Adresse protegee par la liste blanche."}

    if not AUTO_BLOCK_ENABLED:
        return {"ip": ip, "status": "disabled", "enforced": False, "detail": "Blocage automatique desactive (AUTO_BLOCK_ENABLED)."}

    existing = find_active_block(ip)
    if existing:
        return {**existing, "detail": "Adresse deja bloquee."}

    minutes = duration_minutes or BLOCK_DURATION_MINUTES
    motive = normalize_text(reason, "").strip() or f"Blocage automatique NetSentinel de {ip}"
    agents = _agents_for_host(hostname)
    dispatched = _dispatch(agents, "block_ip", ip, motive)

    block = {
        "id": f"block_{uuid.uuid4().hex[:12]}",
        "ip": ip,
        "hostname": normalize_text(hostname, "unknown-host"),
        "reason": motive,
        "status": "enforced" if dispatched else "pending",
        "enforced_by": dispatched,
        "created_at": iso(now_utc()),
        "expires_at": iso(now_utc() + timedelta(minutes=minutes)),
        "duration_minutes": minutes,
    }
    if not dispatched:
        block["detail"] = (
            f"Aucun agent actif sur '{block['hostname']}' : le blocage est enregistre "
            "mais aucune regle iptables n'a ete posee."
        )
    elastic_index_doc(IP_BLOCKS_INDEX, block["id"], block)
    return {**block, "enforced": bool(dispatched)}


def release_block(ip: str, *, reason: str | None = None) -> dict[str, Any]:
    """Leve un blocage : demande a l'agent de retirer la regle iptables."""
    block = find_active_block(ip)
    if not block:
        return {"ip": ip, "status": "not_found", "enforced": False}

    motive = normalize_text(reason, "").strip() or f"Levee du blocage NetSentinel de {ip}"
    agents = _agents_for_host(block.get("hostname"))
    _dispatch(agents, "unblock_ip", ip, motive)

    block["status"] = "released"
    block["released_at"] = iso(now_utc())
    block["release_reason"] = motive
    elastic_index_doc(IP_BLOCKS_INDEX, block["id"], block)
    return {**block, "enforced": False}


def expire_due_blocks() -> list[str]:
    """
    Leve les blocages arrives a expiration.

    Appelee periodiquement par le backend. C'est ce qui rend le blocage
    *temporaire* : sans elle, un faux positif bannirait definitivement une
    adresse legitime.
    """
    now = now_utc()
    released = []
    for block in fetch_index_documents(IP_BLOCKS_INDEX):
        if block.get("status") not in {"enforced", "pending"}:
            continue
        # parse_dt retombe sur l'instant present quand la valeur est absente
        # ou illisible : sans ce garde, un blocage sans date valide serait
        # leve des le premier passage.
        raw_expiry = block.get("expires_at")
        if not isinstance(raw_expiry, str) or not raw_expiry:
            continue
        if now < parse_dt(raw_expiry):
            continue
        release_block(block["ip"], reason="Expiration automatique du blocage")
        released.append(block["ip"])
    return released


def list_blocks(active_only: bool = False) -> list[dict[str, Any]]:
    blocks = fetch_index_documents(IP_BLOCKS_INDEX)
    if active_only:
        blocks = [b for b in blocks if b.get("status") in {"enforced", "pending"}]
    return sorted(blocks, key=lambda b: b.get("created_at") or "", reverse=True)


def blocked_ips() -> set[str]:
    """Adresses actuellement bloquees — consomme par les vues analytiques."""
    return {b["ip"] for b in list_blocks(active_only=True) if b.get("ip")}


def ensure_blocks_index() -> None:
    """Cree l'index des blocages s'il n'existe pas encore."""
    elastic_request("PUT", f"/{IP_BLOCKS_INDEX}", {})
