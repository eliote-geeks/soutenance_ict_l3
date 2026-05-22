from __future__ import annotations

import json
from copy import deepcopy
from typing import Any

try:
    from .ns_config import DATABASE_URL, NETSENTINEL_STORAGE_BACKEND, STORAGE_JSON_PATH
    from .ns_elastic import elastic_configured, elastic_request
except ImportError:
    from ns_config import DATABASE_URL, NETSENTINEL_STORAGE_BACKEND, STORAGE_JSON_PATH
    from ns_elastic import elastic_configured, elastic_request

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    psycopg = None
    dict_row = None


def storage_backend() -> str:
    return NETSENTINEL_STORAGE_BACKEND


def storage_configured() -> bool:
    if NETSENTINEL_STORAGE_BACKEND == "elastic":
        return elastic_configured()
    if NETSENTINEL_STORAGE_BACKEND == "json":
        return True
    if NETSENTINEL_STORAGE_BACKEND in {"postgres", "postgresql"}:
        return bool(DATABASE_URL and psycopg)
    return False


def storage_health() -> dict[str, Any]:
    if NETSENTINEL_STORAGE_BACKEND == "elastic":
        elastic_ok = elastic_request("GET", "/_cluster/health") if elastic_configured() else None
        return {
            "backend": "elastic",
            "configured": elastic_configured(),
            "reachable": bool(elastic_ok),
            "details": elastic_ok or {},
        }
    if NETSENTINEL_STORAGE_BACKEND == "json":
        return {
            "backend": "json",
            "configured": True,
            "reachable": True,
            "path": str(STORAGE_JSON_PATH),
        }
    if NETSENTINEL_STORAGE_BACKEND in {"postgres", "postgresql"}:
        if not DATABASE_URL:
            return {"backend": "postgresql", "configured": False, "reachable": False, "error": "DATABASE_URL is required."}
        if not psycopg:
            return {"backend": "postgresql", "configured": False, "reachable": False, "error": "Install psycopg[binary]."}
        try:
            with psycopg.connect(DATABASE_URL, row_factory=dict_row) as conn:
                with conn.cursor() as cursor:
                    cursor.execute("SELECT 1 AS ok")
                    cursor.fetchone()
            return {"backend": "postgresql", "configured": True, "reachable": True}
        except Exception as exc:
            return {"backend": "postgresql", "configured": True, "reachable": False, "error": str(exc)}
    return {
        "backend": NETSENTINEL_STORAGE_BACKEND,
        "configured": False,
        "reachable": False,
    }


def _load_json_store() -> dict[str, dict[str, dict[str, Any]]]:
    if not STORAGE_JSON_PATH.exists():
        return {}
    try:
        payload = json.loads(STORAGE_JSON_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict):
        return {}
    return {
        str(index): {
            str(doc_id): dict(document)
            for doc_id, document in documents.items()
            if isinstance(document, dict)
        }
        for index, documents in payload.items()
        if isinstance(documents, dict)
    }


def _save_json_store(payload: dict[str, dict[str, dict[str, Any]]]) -> None:
    STORAGE_JSON_PATH.parent.mkdir(parents=True, exist_ok=True)
    STORAGE_JSON_PATH.write_text(json.dumps(payload, ensure_ascii=True, indent=2), encoding="utf-8")
    try:
        STORAGE_JSON_PATH.chmod(0o600)
    except OSError:
        pass


def _ensure_postgres_schema(conn: Any) -> None:
    with conn.cursor() as cursor:
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS netsentinel_documents (
                index_name TEXT NOT NULL,
                doc_id TEXT NOT NULL,
                payload JSONB NOT NULL,
                created_at TIMESTAMPTZ DEFAULT now(),
                updated_at TIMESTAMPTZ DEFAULT now(),
                PRIMARY KEY (index_name, doc_id)
            )
            """
        )
        cursor.execute(
            "CREATE INDEX IF NOT EXISTS idx_netsentinel_documents_payload_id ON netsentinel_documents ((payload->>'id'))"
        )


def _postgres_connection():
    if not DATABASE_URL:
        raise RuntimeError("DATABASE_URL is required for PostgreSQL storage.")
    if not psycopg:
        raise RuntimeError("psycopg[binary] is required for PostgreSQL storage.")
    return psycopg.connect(DATABASE_URL, row_factory=dict_row)


def index_doc(index: str, doc_id: str, payload: dict[str, Any]) -> bool:
    if NETSENTINEL_STORAGE_BACKEND == "elastic":
        response = elastic_request("PUT", f"/{index}/_doc/{doc_id}", payload)
        return bool(response)
    if NETSENTINEL_STORAGE_BACKEND == "json":
        store = _load_json_store()
        document = deepcopy(payload)
        document["id"] = document.get("id") or doc_id
        store.setdefault(index, {})[doc_id] = document
        _save_json_store(store)
        return True
    if NETSENTINEL_STORAGE_BACKEND in {"postgres", "postgresql"}:
        document = deepcopy(payload)
        document["id"] = document.get("id") or doc_id
        with _postgres_connection() as conn:
            _ensure_postgres_schema(conn)
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO netsentinel_documents (index_name, doc_id, payload)
                    VALUES (%s, %s, %s::jsonb)
                    ON CONFLICT (index_name, doc_id)
                    DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
                    """,
                    (index, doc_id, json.dumps(document)),
                )
        return True
    return False


def fetch_documents(index: str, size: int = 200) -> list[dict[str, Any]]:
    if NETSENTINEL_STORAGE_BACKEND == "elastic":
        result = elastic_request(
            "GET",
            f"/{index}/_search",
            {
                "size": size,
                "sort": [
                    {"created_at": {"order": "asc", "unmapped_type": "date"}},
                    {"name.keyword": {"order": "asc", "unmapped_type": "keyword"}},
                ],
                "_source": True,
            },
        )
        hits = (((result or {}).get("hits") or {}).get("hits")) or []
        documents: list[dict[str, Any]] = []
        for hit in hits:
            source = hit.get("_source") or {}
            if "_id" not in source:
                source["id"] = source.get("id") or hit.get("_id")
            documents.append(source)
        return documents
    if NETSENTINEL_STORAGE_BACKEND == "json":
        documents = list((_load_json_store().get(index) or {}).values())
        return sorted(
            documents,
            key=lambda item: (
                str(item.get("created_at") or item.get("@timestamp") or ""),
                str(item.get("name") or item.get("id") or ""),
            ),
        )[:size]
    if NETSENTINEL_STORAGE_BACKEND in {"postgres", "postgresql"}:
        with _postgres_connection() as conn:
            _ensure_postgres_schema(conn)
            with conn.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT payload
                    FROM netsentinel_documents
                    WHERE index_name = %s
                    ORDER BY COALESCE(payload->>'created_at', payload->>'@timestamp', ''), COALESCE(payload->>'name', payload->>'id', '')
                    LIMIT %s
                    """,
                    (index, size),
                )
                return [dict(row["payload"]) for row in cursor.fetchall()]
    return []
