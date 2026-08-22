import copy
import json
import tempfile
import unittest
from pathlib import Path


BACKEND_ROOT = Path(__file__).resolve().parents[1]
TAXONOMY_PATH = BACKEND_ROOT / "app/curriculum_kb/catalogs/ctgdpt_2018_grades_6_12.json"
MANIFEST_PATH = BACKEND_ROOT / "app/curriculum_kb/catalogs/open_sources_demo_v1.json"


class CurriculumCatalogTests(unittest.TestCase):
    def _catalog_api(self):
        try:
            from app.curriculum_kb.services.catalog_service import coverage_gaps, load_manifest, load_taxonomy
        except ModuleNotFoundError as exc:
            self.fail(f"Catalog service is missing: {exc}")
        return coverage_gaps, load_manifest, load_taxonomy

    def test_manifest_covers_every_declared_subject_grade_combination(self):
        coverage_gaps, load_manifest, load_taxonomy = self._catalog_api()

        taxonomy = load_taxonomy(TAXONOMY_PATH)
        manifest = load_manifest(MANIFEST_PATH, taxonomy=taxonomy)

        self.assertEqual([], coverage_gaps(manifest, taxonomy))
        self.assertLessEqual(manifest.requested_chunk_count, 25_000)

    def test_english_is_covered_for_every_grade_from_6_through_12(self):
        coverage_gaps, load_manifest, load_taxonomy = self._catalog_api()

        taxonomy = load_taxonomy(TAXONOMY_PATH)
        manifest = load_manifest(MANIFEST_PATH, taxonomy=taxonomy)

        self.assertEqual(
            [],
            coverage_gaps(
                manifest,
                taxonomy,
                subject_id="tieng_anh",
                grades=range(6, 13),
            ),
        )

    def test_taxonomy_keeps_integrated_lower_secondary_science_and_split_upper_secondary_sciences(self):
        _, _, load_taxonomy = self._catalog_api()

        taxonomy = load_taxonomy(TAXONOMY_PATH)
        grades_by_subject = {
            item["id"]: set(item["grades"])
            for item in taxonomy["subjects"]
        }

        self.assertEqual({6, 7, 8, 9}, grades_by_subject["khoa_hoc_tu_nhien"])
        self.assertEqual({10, 11, 12}, grades_by_subject["vat_li"])
        self.assertEqual({10, 11, 12}, grades_by_subject["hoa_hoc"])
        self.assertEqual({10, 11, 12}, grades_by_subject["sinh_hoc"])

    def test_manifest_rejects_requested_chunk_count_above_hard_limit(self):
        _, load_manifest, load_taxonomy = self._catalog_api()
        taxonomy = load_taxonomy(TAXONOMY_PATH)
        raw = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        raw["target_chunks_per_combination"] = 300
        raw["chunk_limit"] = 25_000

        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "too-large.json"
            path.write_text(json.dumps(raw), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "25,000"):
                load_manifest(path, taxonomy=taxonomy)

    def test_manifest_rejects_duplicate_source_keys(self):
        _, load_manifest, load_taxonomy = self._catalog_api()
        taxonomy = load_taxonomy(TAXONOMY_PATH)
        raw = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        raw["sources"].append(copy.deepcopy(raw["sources"][0]))

        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "duplicate.json"
            path.write_text(json.dumps(raw), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "source_key"):
                load_manifest(path, taxonomy=taxonomy)

    def test_manifest_rejects_mapping_outside_official_taxonomy(self):
        _, load_manifest, load_taxonomy = self._catalog_api()
        taxonomy = load_taxonomy(TAXONOMY_PATH)
        raw = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
        raw["sources"][0]["mappings"].append(
            {"subject_id": "khoa_hoc_tu_nhien", "grades": [12], "topic_ids": ["curriculum_outcomes"]}
        )

        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "invalid-mapping.json"
            path.write_text(json.dumps(raw), encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "khoa_hoc_tu_nhien.*12"):
                load_manifest(path, taxonomy=taxonomy)


if __name__ == "__main__":
    unittest.main()
