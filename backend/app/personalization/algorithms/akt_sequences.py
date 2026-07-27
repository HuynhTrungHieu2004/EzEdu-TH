from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Literal


SplitStrategy = Literal["time_ordered_per_user", "user_holdout"]


@dataclass(frozen=True)
class AKTSequenceBatch:
    user_ids: list[str]
    question_ids: list[list[str]]
    skill_ids: list[list[str]]
    correctness: list[list[int]]
    elapsed_time_seconds: list[list[float]]
    padding_mask: list[list[bool]]


def build_akt_sequences(
    interactions: list[dict[str, Any]],
    *,
    max_sequence_length: int,
) -> AKTSequenceBatch:
    if max_sequence_length <= 0:
        raise ValueError("max_sequence_length must be positive.")

    grouped: dict[str, list[dict[str, Any]]] = {}
    for interaction in interactions:
        user_id = str(interaction.get("user_id") or "")
        if not user_id:
            continue
        grouped.setdefault(user_id, []).append(interaction)

    user_ids: list[str] = []
    question_ids: list[list[str]] = []
    skill_ids: list[list[str]] = []
    correctness: list[list[int]] = []
    elapsed_time_seconds: list[list[float]] = []
    padding_mask: list[list[bool]] = []

    for user_id, rows in sorted(grouped.items()):
        ordered = sorted(rows, key=lambda row: _timestamp_sort_key(row.get("occurred_at")))
        trimmed = ordered[-max_sequence_length:]
        pad_count = max_sequence_length - len(trimmed)
        user_ids.append(user_id)
        question_ids.append(["<pad>"] * pad_count + [str(row.get("item_id") or "<unknown>") for row in trimmed])
        skill_ids.append(["<pad>"] * pad_count + [str((row.get("knowledge_component_ids") or ["<unknown>"])[0]) for row in trimmed])
        correctness.append([0] * pad_count + [1 if row.get("is_correct") else 0 for row in trimmed])
        elapsed_time_seconds.append([0.0] * pad_count + [max(0.0, float(row.get("elapsed_time_seconds") or row.get("response_time_ms") or 0.0) / (1000.0 if row.get("response_time_ms") is not None else 1.0)) for row in trimmed])
        padding_mask.append([True] * pad_count + [False] * len(trimmed))

    return AKTSequenceBatch(
        user_ids=user_ids,
        question_ids=question_ids,
        skill_ids=skill_ids,
        correctness=correctness,
        elapsed_time_seconds=elapsed_time_seconds,
        padding_mask=padding_mask,
    )


def split_interactions_without_future_leakage(
    interactions: list[dict[str, Any]],
    *,
    strategy: SplitStrategy = "time_ordered_per_user",
    train_ratio: float = 0.7,
    validation_ratio: float = 0.15,
) -> dict[str, list[dict[str, Any]]]:
    if not 0 < train_ratio < 1:
        raise ValueError("train_ratio must be in (0,1).")
    if not 0 <= validation_ratio < 1:
        raise ValueError("validation_ratio must be in [0,1).")
    if train_ratio + validation_ratio >= 1:
        raise ValueError("train_ratio + validation_ratio must be less than 1.")

    if strategy == "user_holdout":
        users = sorted({str(row.get("user_id")) for row in interactions if row.get("user_id")})
        train_end = int(len(users) * train_ratio)
        validation_end = train_end + int(len(users) * validation_ratio)
        train_users = set(users[:train_end])
        validation_users = set(users[train_end:validation_end])
        return {
            "train": [row for row in interactions if str(row.get("user_id")) in train_users],
            "validation": [row for row in interactions if str(row.get("user_id")) in validation_users],
            "test": [row for row in interactions if row.get("user_id") and str(row.get("user_id")) not in train_users | validation_users],
        }

    train: list[dict[str, Any]] = []
    validation: list[dict[str, Any]] = []
    test: list[dict[str, Any]] = []
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in interactions:
        user_id = str(row.get("user_id") or "")
        if user_id:
            grouped.setdefault(user_id, []).append(row)
    for rows in grouped.values():
        ordered = sorted(rows, key=lambda row: _timestamp_sort_key(row.get("occurred_at")))
        train_end = int(len(ordered) * train_ratio)
        validation_end = train_end + int(len(ordered) * validation_ratio)
        train.extend(ordered[:train_end])
        validation.extend(ordered[train_end:validation_end])
        test.extend(ordered[validation_end:])
    return {"train": train, "validation": validation, "test": test}


def _timestamp_sort_key(value: Any) -> float:
    if isinstance(value, datetime):
        return value.timestamp()
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
        except ValueError:
            return 0.0
    return 0.0
