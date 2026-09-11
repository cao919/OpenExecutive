"""HTTP surface for the Settings page's "AI providers" section.

Endpoints (all auth-gated by the shared-secret middleware in main.py):

* ``GET    /providers``              — list every custom provider (built-ins
  like Anthropic / OpenRouter / Local / ZhipuAI are NOT in this list;
  they're surfaced elsewhere by ``/agents/models``)
* ``POST   /providers``              — create a new custom OpenAI-compatible
  provider (name / base_url / api_key / model list)
* ``PATCH  /providers/{id}``         — partial-update; pass ``null`` for
  fields you want to leave alone. API key has its own flag because
  ``null`` is a valid value (clear the key).
* ``DELETE /providers/{id}``         — remove a custom provider and drop
  the cached HTTP client for it
* ``POST   /providers/{id}/test``    — ping ``{base_url}/models`` with the
  stored key (if any) and return ok/fail + the upstream error

Why this lives in its own router: the four built-in providers are
configured at process boot via ``.env``; running an LLM call is the only
runtime data path needing them, so ``registry.py`` owns them. Custom
providers are an *operator* concern, surfaced through the UI, so all of
their state belongs in this admin-shaped route.
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Response, status
from pydantic import BaseModel, Field

from openexecutive.providers import provider_store
from openexecutive.providers.registry import (
    drop_all_custom_provider_singletons,
    drop_custom_provider_singleton,
)
from openexecutive.providers.provider_store import (
    initialize_db as initialize_providers_db,
)

logger = logging.getLogger(__name__)

router = APIRouter()


# ------------------------------------------------------------------
# Schemas
# ------------------------------------------------------------------

class ProviderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=64)
    base_url: str = Field(..., min_length=1, max_length=512)
    api_key: str | None = Field(None, max_length=512)
    models: list[str] = Field(..., min_length=1)
    enabled: bool = Field(True)


class ProviderUpdate(BaseModel):
    # ``None`` for fields the caller wants to leave unchanged; pass an
    # explicit value otherwise. API key is the one exception — use
    # ``clear_api_key`` to wipe it.
    name: str | None = Field(None, min_length=1, max_length=64)
    base_url: str | None = Field(None, min_length=1, max_length=512)
    api_key: str | None = Field(None, max_length=512)
    clear_api_key: bool = Field(False)
    models: list[str] | None = Field(None, min_length=1)
    enabled: bool | None = None


class ProviderOut(BaseModel):
    id: int
    name: str
    base_url: str
    # Masked version — show only the trailing 4 chars so the UI can
    # display "sk-••••abcd" without exposing the secret. Returns null
    # when the underlying value is null.
    api_key_masked: str | None
    has_api_key: bool
    models: list[str]
    enabled: bool
    created_at: str
    updated_at: str


class ProviderTestResponse(BaseModel):
    ok: bool
    status_code: int | None = None
    latency_ms: int | None = None
    # Upstream's error message when ok=False; None on success.
    error: str | None = None
    # When ok=True: model slugs the upstream advertised. Used by the UI
    # to suggest "Save these models" if the operator forgot to list
    # them. Capped at 50 to keep payloads bounded.
    advertised_models: list[str] | None = None


# ------------------------------------------------------------------
# Helpers
# ------------------------------------------------------------------

def _mask(api_key: str | None) -> tuple[str | None, bool]:
    """Return (masked, has_key) — UI-safe representation of a key.

    Never expose the raw value over the wire; the Settings page only
    needs the trailing chars to prove "the key starts with what we
    think it starts with" after a re-paste.
    """
    if not api_key:
        return None, False
    if len(api_key) <= 6:
        # Too short to mask meaningfully; redact entirely.
        return "•" * len(api_key), True
    return f"…{api_key[-4:]}", True


def _to_out(row: dict[str, Any]) -> ProviderOut:
    masked, has = _mask(row["api_key"])
    return ProviderOut(
        id=row["id"],
        name=row["name"],
        base_url=row["base_url"],
        api_key_masked=masked,
        has_api_key=has,
        models=row["models"],
        enabled=row["enabled"],
        created_at=row["created_at"],
        updated_at=row["updated_at"],
    )


# ------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------

# Initialize the SQLite schema on import so the first GET against a
# fresh checkout doesn't 500. Idempotent — safe to call repeatedly.
initialize_providers_db()


@router.get("/providers", response_model=list[ProviderOut])
async def list_custom_providers() -> list[ProviderOut]:
    """List every custom provider the operator has added.

    Built-in providers (Anthropic, OpenRouter, Local, ZhipuAI) are
    surfaced separately by ``/agents/models`` and intentionally
    omitted here — this list is "what did the user add?".
    """
    return [_to_out(row) for row in provider_store.list_providers()]


@router.post(
    "/providers",
    response_model=ProviderOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_provider(payload: ProviderCreate) -> ProviderOut:
    created = provider_store.create_provider(
        name=payload.name,
        base_url=payload.base_url,
        api_key=payload.api_key,
        models=payload.models,
        enabled=payload.enabled,
    )
    logger.info(
        "custom provider added: id=%d name=%r models=%d base_url=%s",
        created["id"],
        created["name"],
        len(created["models"]),
        created["base_url"],
    )
    return _to_out(created)


@router.patch("/providers/{provider_id}", response_model=ProviderOut)
async def update_provider(
    provider_id: int, payload: ProviderUpdate
) -> ProviderOut:
    # Honor the explicit clear flag; otherwise the API key (if any) is
    # left untouched when the field is omitted from the Pydantic body.
    set_key_flag = "api_key" in payload.model_fields_set
    cleared = payload.clear_api_key
    if cleared and set_key_flag:
        raise HTTPException(
            status_code=400,
            detail=(
                "Pass either api_key (to set) or clear_api_key=true "
                "(to wipe), not both."
            ),
        )
    if cleared:
        api_key_value: str | None = ""
    elif set_key_flag:
        api_key_value = payload.api_key
    else:
        # Sentinel — update_provider distinguishes "leave alone" from
        # "wipe to empty" via its own set_api_key flag.
        api_key_value = None

    updated = provider_store.update_provider(
        provider_id,
        name=payload.name,
        base_url=payload.base_url,
        api_key=api_key_value,
        models=payload.models,
        enabled=payload.enabled,
        set_api_key=cleared or set_key_flag,
    )
    if updated is None:
        raise HTTPException(
            status_code=404, detail=f"Provider {provider_id} not found"
        )
    # The HTTP client cached for this id still has the old base_url or
    # key — drop it so the next chat call rebuilds with the new values.
    drop_custom_provider_singleton(provider_id)
    logger.info(
        "custom provider updated: id=%d name=%r enabled=%s models=%d",
        updated["id"],
        updated["name"],
        updated["enabled"],
        len(updated["models"]),
    )
    return _to_out(updated)


@router.delete(
    "/providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_provider(provider_id: int) -> Response:
    if not provider_store.delete_provider(provider_id):
        raise HTTPException(
            status_code=404, detail=f"Provider {provider_id} not found"
        )
    # In case a singleton was already built for this id, evict it. Use
    # drop_all (safer) — after delete the id is gone so id-keyed pop is
    # a no-op anyway.
    drop_all_custom_provider_singletons()
    logger.info("custom provider deleted: id=%d", provider_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/providers/{provider_id}/test", response_model=ProviderTestResponse
)
async def test_provider(provider_id: int) -> ProviderTestResponse:
    """Ping the upstream and report reachability + advertised models.

    Uses ``GET {base_url}/models`` (OpenAI-compatible convention). Any
    2xx is "ok"; 401/403 also count as ok because the key may have
    been intentionally wrong — the operator gets the same status code
    the upstream returned, so they can tell "I can't reach them" from
    "they don't like my key".
    """
    row = provider_store.get_provider_by_id(provider_id)
    if row is None:
        raise HTTPException(
            status_code=404, detail=f"Provider {provider_id} not found"
        )
    headers: dict[str, str] = {}
    if row["api_key"]:
        headers["Authorization"] = f"Bearer {row['api_key']}"
    # Many providers publish /models at the same prefix as /chat/completions
    # (e.g. https://open.bigmodel.cn/api/paas/v4/models). base_url may or
    # may not include the trailing /v1 — call as-is and let the path
    # resolve.
    url = row["base_url"].rstrip("/") + "/models"
    import time

    started = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
    except httpx.HTTPError as exc:
        return ProviderTestResponse(
            ok=False,
            latency_ms=int((time.monotonic() - started) * 1000),
            error=f"{type(exc).__name__}: {exc}",
        )
    latency_ms = int((time.monotonic() - started) * 1000)
    # Read advertised models when the upstream bothered to send them.
    advertised: list[str] | None = None
    if resp.status_code < 400:
        try:
            data = resp.json()
            items = data.get("data") if isinstance(data, dict) else None
            if isinstance(items, list):
                advertised = [
                    str(it.get("id")) for it in items[:50]
                    if isinstance(it, dict) and it.get("id")
                ]
        except Exception:  # noqa: BLE001
            advertised = None
    return ProviderTestResponse(
        # 2xx and 401/403 both indicate "we can reach the upstream";
        # the UI surfaces the status_code verbatim so the operator
        # can interpret "401 bad key" vs "200 all clear" themselves.
        ok=resp.status_code < 500,
        status_code=resp.status_code,
        latency_ms=latency_ms,
        advertised_models=advertised,
        error=None if resp.status_code < 400 else resp.text[:300],
    )
