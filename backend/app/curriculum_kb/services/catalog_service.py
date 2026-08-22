from __future__ import annotations

from pathlib import Path
from typing import Iterable

from app.curriculum_kb.schemas.dataset import CurriculumTaxonomy, DatasetManifest


def load_taxonomy(path: Path) -> dict:
    taxonomy = CurriculumTaxonomy.model_validate_json(path.read_text(encoding="utf-8"))
    return taxonomy.model_dump(mode="json")


def _valid_combinations(taxonomy: dict) -> set[tuple[str, int, str]]:
    return {
        (subject["id"], grade, topic["id"])
        for subject in taxonomy["subjects"]
        for grade in subject["grades"]
        for topic in subject["topics"]
    }


def _manifest_combinations(manifest: DatasetManifest) -> set[tuple[str, int, str]]:
    return {
        (mapping.subject_id, grade, topic_id)
        for source in manifest.sources
        for mapping in source.mappings
        for grade in mapping.grades
        for topic_id in mapping.topic_ids
    }


def load_manifest(path: Path, *, taxonomy: dict) -> DatasetManifest:
    manifest = DatasetManifest.model_validate_json(path.read_text(encoding="utf-8"))
    if manifest.curriculum_version != taxonomy["curriculum_version"]:
        raise ValueError("Manifest curriculum_version does not match the official taxonomy")

    valid = _valid_combinations(taxonomy)
    invalid = sorted(_manifest_combinations(manifest) - valid)
    if invalid:
        subject_id, grade, topic_id = invalid[0]
        raise ValueError(f"Invalid curriculum mapping: {subject_id} grade {grade} topic {topic_id}")
    return manifest


def coverage_gaps(
    manifest: DatasetManifest,
    taxonomy: dict,
    *,
    subject_id: str | None = None,
    grades: Iterable[int] = range(6, 13),
) -> list[dict]:
    requested_grades = set(grades)
    covered = _manifest_combinations(manifest)
    expected = {
        combination
        for combination in _valid_combinations(taxonomy)
        if (subject_id is None or combination[0] == subject_id) and combination[1] in requested_grades
    }
    return [
        {"subject_id": item[0], "grade": item[1], "topic_id": item[2]}
        for item in sorted(expected - covered)
    ]
