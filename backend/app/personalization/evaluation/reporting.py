from __future__ import annotations

import csv
import json
from datetime import datetime
from pathlib import Path
from typing import Any


def local_date_stamp() -> str:
    return datetime.now().date().isoformat()


def write_json_report(payload: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def write_csv_report(payload: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    rows = [{"metric": key, "value": value} for key, value in _flatten(payload).items()]
    with path.open("w", encoding="utf-8", newline="") as csv_file:
        writer = csv.DictWriter(csv_file, fieldnames=["metric", "value"])
        writer.writeheader()
        writer.writerows(rows)


def write_markdown_report(payload: dict[str, Any], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Personalization Evaluation Report",
        "",
        f"- Generated at: `{payload.get('generated_at')}`",
        f"- Dataset type: `{'synthetic' if payload.get('is_synthetic') else 'real'}`",
    ]
    if payload.get("is_synthetic"):
        lines.extend([
            "",
            "> This report uses synthetic fixture data for pipeline validation only. Do not present these values as real system performance.",
        ])
    lines.extend([
        "",
        "## Data Inventory",
        "",
    ])
    for key, value in (payload.get("data_inventory") or {}).items():
        lines.append(f"- `{key}`: `{value}`")

    for section_name in [
        "kmeans",
        "learner_model",
        "recommendations",
        "baseline_comparison",
        "ablation_study",
        "ai_explanations",
    ]:
        lines.extend(["", f"## {section_name.replace('_', ' ').title()}", ""])
        section = payload.get(section_name)
        if section is None:
            lines.append("_Not evaluated._")
        else:
            lines.append("```json")
            lines.append(json.dumps(section, ensure_ascii=False, indent=2))
            lines.append("```")

    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def write_all_reports(payload: dict[str, Any], output_dir: Path, *, stem: str) -> dict[str, str]:
    output_dir.mkdir(parents=True, exist_ok=True)
    json_path = output_dir / f"{stem}.json"
    csv_path = output_dir / f"{stem}.csv"
    md_path = output_dir / f"{stem}.md"
    write_json_report(payload, json_path)
    write_csv_report(payload, csv_path)
    write_markdown_report(payload, md_path)
    return {
        "json": str(json_path),
        "csv": str(csv_path),
        "markdown": str(md_path),
    }


def _flatten(payload: Any, prefix: str = "") -> dict[str, str]:
    if isinstance(payload, dict):
        flattened: dict[str, str] = {}
        for key, value in payload.items():
            child_prefix = f"{prefix}.{key}" if prefix else str(key)
            flattened.update(_flatten(value, child_prefix))
        return flattened
    if isinstance(payload, list):
        if len(payload) > 20:
            return {prefix: f"[list length={len(payload)}]"}
        flattened = {}
        for index, value in enumerate(payload):
            flattened.update(_flatten(value, f"{prefix}[{index}]"))
        return flattened or {prefix: "[]"}
    return {prefix: "" if payload is None else str(payload)}
