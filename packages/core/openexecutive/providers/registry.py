"""Model registry + per-call provider routing.

``MODEL_SPECS`` is the single source of truth for: what we ship to the
Council UI, which OpenRouter slug each Claude model maps to, and which
Anthropic-only features each model tolerates. ``get_provider(model)``
picks the backend per call so the user can flip an agent's model in the
Council UI and have requests for that agent — and only that agent —
route differently.

User-added remote providers (anything an operator adds through the
Settings page) live in ``provider_store`` — a tiny SQLite table that
survives restarts. Every distinct ``base_url`` they configure gets one
lazily-built ``OpenAICompatibleProvider`` instance, reused across calls
of model slugs served by it.
"""
from __future__ import annotations

from typing import Any

from fastapi import HTTPException

from openexecutive.config import get_settings
from openexecutive.providers.anthropic_provider import AnthropicProvider
from openexecutive.providers.feature_gate import FeatureSpec
from openexecutive.providers.openai_compatible import OpenAICompatibleProvider
from openexecutive.providers.openrouter_provider import OpenRouterProvider
from openexecutive.providers.provider import LLMProvider
from openexecutive.providers.provider_store import (
    get_provider_for_model,
    invalidate_on_write as invalidate_provider_store,
    list_providers as list_custom_providers,
)

# Anthropic-direct slugs — used as canonical model names everywhere in
# the codebase (config defaults, agent class defaults, override DB).
ANTHROPIC_DIRECT_MODELS: list[str] = [
    "claude-opus-4-7",
    "claude-sonnet-4-6",
    "claude-haiku-4-5-20251001",
]

# Models reachable only through OpenRouter. These strings ARE the
# OpenRouter slug — we don't translate them on the way through. Curated
# PAID models only: the rate-limited ``:free`` tier (and the utility_fast-
# only free-model matrix) was removed — its 429s surfaced as user-visible
# errors and the per-agent free-model surface was more than it earned.
# BYO-model routing through OpenRouter is unchanged — add a slug here to
# surface it in the Council UI dropdown.
OPENROUTER_MODELS: list[str] = [
    "openai/gpt-5",
    "openai/gpt-5-mini",
    "openai/gpt-5-nano",
    "google/gemini-2.5-pro",
    "google/gemini-2.5-flash",
    "google/gemini-2.5-flash-lite",
    "meta-llama/llama-3.3-70b-instruct",
    "deepseek/deepseek-r1",
    "x-ai/grok-4",
]


# ZhipuAI (智谱) GLM models reachable through the PaaS endpoint. The slugs
# are the canonical names ZhipuAI publishes (no prefix) and are sent to
# the server verbatim — so changing one here without a matching server
# slug will 404. The default curated set lives in
# ``Settings.zhipuai_models``; this constant is the fallback used when
# ZHIPUAI_MODELS is unset in the env.
DEFAULT_ZHIPUAI_MODELS: list[str] = [
    "glm-4-flash",
    "glm-4-air",
    "glm-4-plus",
]


# Per-Claude OpenRouter slug. The Anthropic-direct name is the registry
# key; the value is what we send when OPENROUTER_ENABLED is on.
_CLAUDE_OPENROUTER_SLUGS: dict[str, str] = {
    "claude-opus-4-7": "anthropic/claude-opus-4.7",
    "claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
    "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4.5",
}


_CLAUDE_FEATURE_SPEC = FeatureSpec(
    supports_cache_control=True,
    supports_thinking=True,
    supports_web_search=True,
    supports_tool_use=True,
)


# Per-non-Claude model spec. ``supports_tool_use`` is universal across
# the curated set; the other three are off — Anthropic-specific server
# tools and prompt-caching annotations have no OpenAI-format equivalent.
_DEFAULT_NON_CLAUDE_SPEC = FeatureSpec(
    supports_cache_control=False,
    supports_thinking=False,
    supports_web_search=False,
    supports_tool_use=True,
)


def _local_models(settings: Any) -> list[str]:
    """Configured local model slugs, or ``[]`` when local routing is off.

    Read defensively: lightweight test settings stubs may omit the field.
    """
    if not getattr(settings, "local_models_enabled", False):
        return []
    return list(getattr(settings, "local_models", []) or [])


def _zhipuai_models(settings: Any) -> list[str]:
    """Configured ZhipuAI model slugs, or ``[]`` when ZhipuAI routing is off.

    Defensive read: if the operator cleared ``ZHIPUAI_MODELS`` in the env
    we fall back to the curated default rather than surfacing an empty
    dropdown — ZhipuAI is the one backend where the user almost certainly
    wants the published free/paid tiers rather than a custom list.
    """
    if not getattr(settings, "zhipuai_enabled", False):
        return []
    configured = list(getattr(settings, "zhipuai_models", []) or [])
    return configured or DEFAULT_ZHIPUAI_MODELS


def allowed_models() -> list[str]:
    """Flat allowlist the Council UI's dropdown reads.

    The dropdown can't offer a model the runtime won't actually serve, so
    each family is folded in only when it's reachable:

    * Anthropic-direct trio — when an ``ANTHROPIC_API_KEY`` is set, OR when
      ``OPENROUTER_ENABLED`` is on (Claude is then reachable via OpenRouter).
    * OpenRouter set — when ``OPENROUTER_ENABLED`` is on.
    * Local models — when ``LOCAL_MODELS_ENABLED`` is on.
    * ZhipuAI models — when ``ZHIPUAI_ENABLED`` is on.
    * User-added custom providers — every model in any enabled
      ``custom_providers`` row is included so a Settings-page "Save"
      shows up in the dropdown without restarting the backend.
    """
    settings = get_settings()
    models: list[str] = []
    if getattr(settings, "anthropic_api_key", None) or settings.openrouter_enabled:
        models.extend(ANTHROPIC_DIRECT_MODELS)
    if settings.openrouter_enabled:
        models.extend(OPENROUTER_MODELS)
    models.extend(_local_models(settings))
    models.extend(_zhipuai_models(settings))
    for custom in list_custom_providers():
        if custom["enabled"]:
            models.extend(custom["models"])
    # The same slug can land in both built-ins and a custom row (e.g.
    # ``glm-4-flash`` lives in both ZHIPUAI_MODELS and a user-added
    # ZhipuAI custom provider). Dedupe while preserving order so the
    # Council UI dropdown stays stable.
    return list(dict.fromkeys(models))


def allowed_models_for(agent_id: str | None) -> list[str]:
    """Per-agent allowlist for the Council UI dropdown and PATCH validator.

    Every agent — specialists, the Executive, Quality Judge, and the
    ``utility_fast`` virtual agent — gets the same ``allowed_models()``
    list. (The ``utility_fast``-only free/cheap OpenRouter matrix was
    removed; ``agent_id`` is retained for call-site stability and any
    future per-agent rules.)
    """
    return allowed_models()


def _is_claude(model: str) -> bool:
    return model in _CLAUDE_OPENROUTER_SLUGS


# Module-level singletons — providers pool their own HTTP connections and
# are async-safe. Recreating them per call burns ~10 ms each.
_anthropic_provider: AnthropicProvider | None = None
_openrouter_provider: OpenRouterProvider | None = None
_local_provider: OpenAICompatibleProvider | None = None
_zhipuai_provider: OpenAICompatibleProvider | None = None
# Custom provider singletons keyed by provider_id so two providers that
# happen to share a base URL don't collapse (one might be enabled with
# a key, the other disabled without — they'd have different auth headers
# at the wire level).
_custom_providers: dict[int, OpenAICompatibleProvider] = {}


def _anthropic() -> AnthropicProvider:
    global _anthropic_provider
    if _anthropic_provider is None:
        settings = get_settings()
        api_key = settings.anthropic_api_key
        if not api_key:
            # Reachable only when a Claude model is requested with no key and
            # OpenRouter off — e.g. an Anthropic-free deployment that left a
            # model setting pointed at Claude. Fail with actionable guidance.
            raise HTTPException(
                status_code=400,
                detail=(
                    "A Claude model was requested but ANTHROPIC_API_KEY is not "
                    "set. Set it, enable OpenRouter, or point the model setting "
                    "at a configured local model."
                ),
            )
        _anthropic_provider = AnthropicProvider(api_key=api_key)
    return _anthropic_provider


def _local() -> OpenAICompatibleProvider:
    global _local_provider
    if _local_provider is None:
        settings = get_settings()
        base_url = getattr(settings, "local_base_url", None)
        if not base_url:
            # The Settings model_validator already prevents LOCAL_MODELS_ENABLED
            # without a base URL, but defense in depth — a misconfigured env
            # could otherwise produce a request against an empty host.
            raise HTTPException(
                status_code=400,
                detail="Local model routing requires LOCAL_BASE_URL",
            )
        # Local models get the non-Claude feature spec: no cache_control,
        # thinking, or server-side web_search — those are Anthropic-only and
        # would 400 (or be silently ignored) on an OpenAI-compatible server.
        spec_lookup: dict[str, FeatureSpec] = {
            m: _DEFAULT_NON_CLAUDE_SPEC for m in _local_models(settings)
        }
        _local_provider = OpenAICompatibleProvider(
            base_url=base_url,
            api_key=getattr(settings, "local_api_key", None),
            timeout_s=getattr(settings, "local_timeout_s", 300.0),
            spec_lookup=spec_lookup,
        )
    return _local_provider


def _openrouter() -> OpenRouterProvider:
    global _openrouter_provider
    if _openrouter_provider is None:
        settings = get_settings()
        if not settings.openrouter_api_key:
            # The Settings model_validator already prevents OPENROUTER_ENABLED
            # without a key, but defense in depth — a misconfigured env could
            # otherwise produce a None-token request.
            raise HTTPException(
                status_code=400,
                detail="OpenRouter routing requires OPENROUTER_API_KEY",
            )
        # Pre-build the slug + spec lookup so the provider can resolve a
        # Claude model to its OpenRouter slug + feature spec on each call.
        slug_lookup = dict(_CLAUDE_OPENROUTER_SLUGS)
        spec_lookup: dict[str, FeatureSpec] = {
            m: _CLAUDE_FEATURE_SPEC for m in ANTHROPIC_DIRECT_MODELS
        }
        for m in OPENROUTER_MODELS:
            spec_lookup[m] = _DEFAULT_NON_CLAUDE_SPEC
        _openrouter_provider = OpenRouterProvider(
            api_key=settings.openrouter_api_key,
            base_url=settings.openrouter_base_url,
            app_title=settings.openrouter_app_title,
            referer=settings.openrouter_referer,
            timeout_s=settings.openrouter_timeout_s,
            slug_lookup=slug_lookup,
            spec_lookup=spec_lookup,
        )
    return _openrouter_provider


def _zhipuai() -> OpenAICompatibleProvider:
    global _zhipuai_provider
    if _zhipuai_provider is None:
        settings = get_settings()
        if not settings.zhipuai_api_key:
            # _validate_zhipuai already enforces this at startup; defense
            # in depth in case a request lands between the toggle and the
            # validator running (e.g. in tests that bypass Settings).
            raise HTTPException(
                status_code=400,
                detail="ZhipuAI routing requires ZHIPUAI_API_KEY",
            )
        # ZhipuAI is OpenAI-compatible but exposes none of the Anthropic
        # server tools (cache_control, thinking, web_search). Use the same
        # non-Claude spec as local + OpenRouter-byok so call sites
        # silently strip those kwargs before they hit the wire.
        spec_lookup: dict[str, FeatureSpec] = {
            m: _DEFAULT_NON_CLAUDE_SPEC for m in _zhipuai_models(settings)
        }
        _zhipuai_provider = OpenAICompatibleProvider(
            base_url=settings.zhipuai_base_url,
            api_key=settings.zhipuai_api_key,
            timeout_s=settings.zhipuai_timeout_s,
            spec_lookup=spec_lookup,
        )
    return _zhipuai_provider


def _custom(row: dict[str, Any]) -> OpenAICompatibleProvider:
    """Build (or return cached) an OpenAI-compatible provider for a user-added entry.

    Custom providers are remote OpenAI-compatible endpoints (ZhipuAI,
    DeepSeek, Moonshot, anything that speaks ``/v1/chat/completions``).
    They share the same translation pipeline as the local/OAI-compatible
    providers but pick up base_url + key from a SQLite row that the
    Settings page edits at runtime.

    Note: caching is keyed on provider_id, not on the (base_url, api_key)
    tuple, so a user editing the URL or key creates a different
    singleton. Dropping the id-keyed entry on store-invalidation is the
    job of the admin route's ``invalidate_provider_store``-coupled
    reset hook below.
    """
    provider_id = row["id"]
    cached = _custom_providers.get(provider_id)
    if cached is not None:
        return cached
    spec_lookup: dict[str, FeatureSpec] = {
        m: _DEFAULT_NON_CLAUDE_SPEC for m in row["models"]
    }
    provider = OpenAICompatibleProvider(
        base_url=row["base_url"],
        api_key=row["api_key"],
        timeout_s=120.0,  # Remote callouts get a generous default;
        # per-provider overrides can come later when a use-case warrants it.
        spec_lookup=spec_lookup,
    )
    _custom_providers[provider_id] = provider
    return provider


def get_provider(model: str) -> LLMProvider:
    """Return the provider that should serve calls for ``model``.

    Routing rules:

    * Claude family — Anthropic direct by default; OpenRouter when
      ``OPENROUTER_ENABLED`` is on.
    * Local models (slugs listed in ``LOCAL_MODELS`` with
      ``LOCAL_MODELS_ENABLED`` on) — the self-hosted OpenAI-compatible
      backend at ``LOCAL_BASE_URL``.
    * ZhipuAI models (slugs listed in ``ZHIPUAI_MODELS`` with
      ``ZHIPUAI_ENABLED`` on) — the PaaS endpoint at
      ``ZHIPUAI_BASE_URL`` (defaults to the bigmodel.cn PaaS).
    * User-added custom providers — any slug in an enabled
      ``custom_providers`` row routes to that row's ``base_url``.
    * Other non-Claude (anything in ``OPENROUTER_MODELS``, or any unknown
      slug) — OpenRouter only. Raises HTTP 400 when ``OPENROUTER_ENABLED``
      is off, since we have no other backend that speaks those models.
    """
    settings = get_settings()
    if _is_claude(model):
        if settings.openrouter_enabled:
            return _openrouter()
        return _anthropic()
    # Local models take precedence for their configured slugs — a local
    # endpoint can serve them with no external dependency.
    if model in _local_models(settings):
        return _local()
    # ZhipuAI models next — same OpenAI-compatible shape, but a
    # dedicated backend so we never leak a ZhipuAI request to
    # OpenRouter (or vice versa) by accident.
    if model in _zhipuai_models(settings):
        return _zhipuai()
    # User-added custom providers. Checked before the OpenRouter
    # fallback so a custom row's slug routes to its own endpoint
    # rather than to whatever OpenRouter happens to be enabled.
    custom_row = get_provider_for_model(model)
    if custom_row is not None:
        return _custom(custom_row)
    # Other non-Claude slugs require OpenRouter to be enabled.
    if not settings.openrouter_enabled:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Model {model!r} requires OPENROUTER_ENABLED=true (set "
                f"OPENROUTER_API_KEY and toggle the flag), or list it in "
                f"LOCAL_MODELS with LOCAL_MODELS_ENABLED=true to serve it "
                f"from a local OpenAI-compatible backend, or list it in "
                f"ZHIPUAI_MODELS with ZHIPUAI_ENABLED=true to serve it "
                f"from the ZhipuAI PaaS, or add a custom provider "
                f"through the Settings page."
            ),
        )
    return _openrouter()


def _reset_for_tests() -> None:
    """Drop cached provider singletons. Test-only — pytest fixtures call this."""
    global _anthropic_provider, _openrouter_provider, _local_provider, _zhipuai_provider
    _anthropic_provider = None
    _openrouter_provider = None
    _local_provider = None
    _zhipuai_provider = None
    _custom_providers.clear()


def drop_custom_provider_singleton(provider_id: int) -> None:
    """Invalidate a single custom provider's cached HTTP client.

    Called by ``/admin/providers`` after an update or delete so a URL or
    key change takes effect on the next call instead of sticking to the
    stale singleton. Use ``drop_all_custom_provider_singletons`` after
    a delete when the id may already be gone.
    """
    _custom_providers.pop(provider_id, None)


def drop_all_custom_provider_singletons() -> None:
    """Wipe the whole cache. Used after deletes for safety."""
    _custom_providers.clear()
