"""Central AI model pricing and estimated cost helpers."""
from __future__ import annotations

import json
from decimal import Decimal, ROUND_HALF_UP
from typing import Any, Optional

from app.core.config import settings


# USD per 1M tokens. These defaults are estimates only and can be replaced by
# AI_MODEL_PRICING_JSON without code changes.
DEFAULT_MODEL_PRICING: dict[str, dict[str, Any]] = {
    "anthropic:claude-haiku-4-5-20251001": {
        "input_per_1m": 1.0,
        "output_per_1m": 5.0,
        "currency": "USD",
    },
    "anthropic:claude-sonnet-5": {
        "input_per_1m": 3.0,
        "output_per_1m": 15.0,
        "currency": "USD",
    },
    "google:gemini-2.5-flash": {
        "input_per_1m": 0.30,
        "output_per_1m": 2.50,
        "currency": "USD",
    },
    "groq:llama-3.3-70b-versatile": {
        "input_per_1m": 0.59,
        "output_per_1m": 0.79,
        "currency": "USD",
    },
    "groq:whisper-large-v3": {
        "input_per_1m": 0.0,
        "output_per_1m": 0.0,
        "currency": "USD",
    },
}


def _pricing_from_settings() -> dict[str, dict[str, Any]]:
    raw = getattr(settings, "AI_MODEL_PRICING_JSON", "") or ""
    if not raw.strip():
        return DEFAULT_MODEL_PRICING
    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError:
        return DEFAULT_MODEL_PRICING
    if not isinstance(parsed, dict):
        return DEFAULT_MODEL_PRICING
    result = dict(DEFAULT_MODEL_PRICING)
    for key, value in parsed.items():
        if isinstance(key, str) and isinstance(value, dict):
            result[key] = value
    return result


def pricing_key(provider: str | None, model: str | None) -> str:
    return f"{(provider or '').strip().lower()}:{(model or '').strip()}"


def get_model_pricing(provider: str | None, model: str | None) -> Optional[dict[str, Any]]:
    pricing = _pricing_from_settings()
    return pricing.get(pricing_key(provider, model)) or pricing.get(f"*:{(model or '').strip()}")


def estimate_cost(
    *,
    provider: str | None,
    model: str | None,
    input_tokens: int | None,
    output_tokens: int | None,
) -> tuple[Optional[float], str]:
    config = get_model_pricing(provider, model)
    currency = str((config or {}).get("currency") or "USD")
    if not config:
        return None, currency

    input_count = Decimal(int(input_tokens or 0))
    output_count = Decimal(int(output_tokens or 0))
    input_rate = Decimal(str(config.get("input_per_1m", 0)))
    output_rate = Decimal(str(config.get("output_per_1m", 0)))
    cost = ((input_count * input_rate) + (output_count * output_rate)) / Decimal(1_000_000)
    return float(cost.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP)), currency


def pricing_catalog() -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for key, value in sorted(_pricing_from_settings().items()):
        provider, _, model = key.partition(":")
        rows.append({
            "provider": provider,
            "model": model,
            "input_per_1m": float(value.get("input_per_1m", 0)),
            "output_per_1m": float(value.get("output_per_1m", 0)),
            "currency": str(value.get("currency") or "USD"),
        })
    return rows
