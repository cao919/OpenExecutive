"""SQLite-backed store for user-added remote LLM providers.

The built-in providers (Anthropic / OpenRouter / Local / ZhipuAI) are
configured via `.env`; this module is the dynamic counterpart for
*remote* (non-local, non-built-in) providers a user adds at runtime
through the Settings UI. Each entry is an OpenAI-compatible HTTP
endpoint plus a curated list of model slugs it serves, persisted to a
small SQLite table so reloads survive backend restarts without a `.env`
edit.

The provider *singletons* themselves live in
``openexecutive.providers.registry`` — every distinct ``base_url`` (per
provider id) gets one lazily-built ``OpenAICompatibleProvider``. Writes
invalidate that singleton cache so a "Save" button is followed
immediately by a new model showing up in the Council dropdown.

Security note: ``api_key`` is stored in plaintext. This deployment runs
trusted-operator on a single host; if that ever changes, drop in
``cryptography.fernet`` here using a key from the env (or 1Password
CLI), with a one-time migration that re-encrypts existing rows.
"""
from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterator

logger = logging.getLogger(__name__)

# Resolved relative to cwd (same convention as episodic.py). Allow override
# for tests and for ops that want providers.config next to the rest of the
# data directory instead of next to episodic_memory.db.
_DB_ENV_VAR = "PROVIDER_CONFIG_DB_PATH"
DB_PATH = Path(os.environ.get(_DB_ENV_VAR, "./provider_config.db"))

# 5-second TTL so a /admin/providers write is reflected in /agents/models
# within one dropdown reload but a tight loop of get_provider() calls
# doesn't hammer the SQLite file. invalidate_on_write() resets the timer
# eagerly so saves don't have to wait for TTL to expire.
_CACHE_TTL_S = 5.0

_lock = threading.RLock()
_cache: list[dict[str, Any]] | None = None
_cache_expires_at: float = 0.0


@dataclass
class CustomProvider:
    id: int
    name: str
    base_url: str
    api_key: str | None
    models: list[str]
    enabled: bool
    created_at: str
    updated_at: str
    # Set by test_connection; never persisted.
    last_status: str | None = field(default=None, init=False, repr=False)


@contextmanager
def _get_conn() -> Iterator[sqlite3.Connection]:
    # check_same_thread=False so background ping tasks can read the same
    # connection pool. SQLite's per-connection lock still serializes.
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def initialize_db() -> None:
    """Create the table if missing. Cheap; safe to call on every boot."""
    with _get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS custom_providers (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                base_url TEXT NOT NULL,
                api_key TEXT,
                models TEXT NOT NULL DEFAULT '[]',
                enabled INTEGER NOT NULL DEFAULT 1,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            """
        )


def _row_to_dict(row: sqlite3.Row) -> dict[str, Any]:
    models_raw = row["models"]
    try:
        models = list(json.loads(models_raw)) if models_raw else []
    except json.JSONDecodeError:
        # Defensive: if a row got partially-written garbage, treat it as
        # an empty list rather than crashing the whole list_provider call.
        logger.warning(
            "custom_providers row %r has invalid models JSON; treating as empty",
            row["id"],
        )
        models = []
    return {
        "id": row["id"],
        "name": row["name"],
        "base_url": row["base_url"],
        "api_key": row["api_key"],
        "models": models,
        "enabled": bool(row["enabled"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def invalidate_on_write() -> None:
    """Drop the in-process cache so the next read reloads from SQLite."""
    global _cache, _cache_expires_at
    with _lock:
        _cache = None
        _cache_expires_at = 0.0


def _now_iso() -> str:
    # Match the timestamp format episodic.py uses elsewhere; storing as
    # ISO-8601 strings keeps the schema portable (no tz conversion on
    # read) while remaining `datetime.fromisoformat`-able.
    from datetime import UTC, datetime

    return datetime.now(UTC).isoformat(timespec="seconds")


def list_providers() -> list[dict[str, Any]]:
    """Return all custom providers (enabled or not). Cached for 5 s."""
    global _cache, _cache_expires_at
    now = time.monotonic()
    with _lock:
        if _cache is not None and now < _cache_expires_at:
            return list(_cache)
    rows = _refresh()
    with _lock:
        _cache = rows
        _cache_expires_at = time.monotonic() + _CACHE_TTL_S
    return list(rows)


def _refresh() -> list[dict[str, Any]]:
    # Lazy DB-init: a fresh checkout with no Settings page visit would
    # otherwise crash on first sqlite3.connect() of a non-existent file.
    initialize_db()
    with _get_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM custom_providers ORDER BY id ASC"
        ).fetchall()
    return [_row_to_dict(r) for r in rows]


def get_provider_by_id(provider_id: int) -> dict[str, Any] | None:
    for row in list_providers():
        if row["id"] == provider_id:
            return row
    return None


def get_provider_for_model(model: str) -> dict[str, Any] | None:
    """Return the custom provider that owns ``model``, or ``None``.

    Used by ``registry.get_provider`` to route a request without
    re-walking the whole list per call. Disabled entries still return
    None — the UI can flip them back on with no re-add.
    """
    for row in list_providers():
        if row["enabled"] and model in row["models"]:
            return row
    return None


def _validate_provider_payload(
    *,
    name: str,
    base_url: str,
    models: list[str],
    allow_name_taken_by: int | None = None,
) -> None:
    """Centralised invariants — same rules used by create and update.

    Caller-side Pydantic schemas enforce types; this function enforces
    the rules that cross-row state (uniqueness) or shape (URL) cares
    about.
    """
    from fastapi import HTTPException

    if not name or not name.strip():
        raise HTTPException(status_code=400, detail="name must not be empty")
    if not base_url or not base_url.strip():
        raise HTTPException(
            status_code=400, detail="base_url must not be empty"
        )
    stripped_url = base_url.strip()
    if not (
        stripped_url.startswith("http://")
        or stripped_url.startswith("https://")
    ):
        raise HTTPException(
            status_code=400,
            detail=(
                f"base_url must start with http:// or https://, got "
                f"{base_url!r}"
            ),
        )
    if not models:
        raise HTTPException(
            status_code=400, detail="models must contain at least one slug"
        )
    # Reject duplicate names so the UI's "delete + re-add" round-trip
    # is the only path to rename.
    with _get_conn() as conn:
        existing = conn.execute(
            "SELECT id FROM custom_providers WHERE name = ?",
            (name.strip(),),
        ).fetchone()
    if existing and existing["id"] != allow_name_taken_by:
        raise HTTPException(
            status_code=409,
            detail=f"A provider named {name!r} already exists",
        )


def create_provider(
    *,
    name: str,
    base_url: str,
    api_key: str | None,
    models: list[str],
    enabled: bool = True,
) -> dict[str, Any]:
    _validate_provider_payload(
        name=name, base_url=base_url, models=models
    )
    now = _now_iso()
    with _get_conn() as conn:
        cur = conn.execute(
            """
            INSERT INTO custom_providers
                (name, base_url, api_key, models, enabled,
                 created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                name.strip(),
                base_url.strip().rstrip("/"),
                api_key,
                json.dumps(models),
                1 if enabled else 0,
                now,
                now,
            ),
        )
        new_id = cur.lastrowid
    invalidate_on_write()
    created = get_provider_by_id(new_id)
    assert created is not None  # invariant: just inserted
    return created


def update_provider(
    provider_id: int,
    *,
    name: str | None = None,
    base_url: str | None = None,
    api_key: str | None = None,
    models: list[str] | None = None,
    enabled: bool | None = None,
    set_api_key: bool = False,
) -> dict[str, Any] | None:
    """Partial-update. Pass ``set_api_key=False`` (the default) with
    ``api_key=None`` to keep the existing key; pass ``set_api_key=True``
    to clear or replace it. The two are coupled because None is a
    legitimate value (clear the key), so we can't tell a "leave it
    alone" request from "wipe it" without an explicit flag."""
    existing = get_provider_by_id(provider_id)
    if existing is None:
        return None
    new_name = name.strip() if name is not None else existing["name"]
    new_url = (
        base_url.strip().rstrip("/")
        if base_url is not None
        else existing["base_url"]
    )
    new_models = (
        models if models is not None else list(existing["models"])
    )
    new_enabled = enabled if enabled is not None else existing["enabled"]
    new_api_key = (
        api_key if set_api_key else existing["api_key"]
    )
    _validate_provider_payload(
        name=new_name,
        base_url=new_url,
        models=new_models,
        allow_name_taken_by=provider_id,
    )
    now = _now_iso()
    with _get_conn() as conn:
        conn.execute(
            """
            UPDATE custom_providers SET
                name = ?, base_url = ?, api_key = ?, models = ?,
                enabled = ?, updated_at = ?
            WHERE id = ?
            """,
            (
                new_name,
                new_url,
                new_api_key,
                json.dumps(new_models),
                1 if new_enabled else 0,
                now,
                provider_id,
            ),
        )
    invalidate_on_write()
    return get_provider_by_id(provider_id)


def delete_provider(provider_id: int) -> bool:
    with _get_conn() as conn:
        cur = conn.execute(
            "DELETE FROM custom_providers WHERE id = ?", (provider_id,)
        )
    invalidate_on_write()
    return cur.rowcount > 0
