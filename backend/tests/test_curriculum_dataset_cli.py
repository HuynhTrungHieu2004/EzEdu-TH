import unittest
from pathlib import Path

from mongomock_motor import AsyncMongoMockClient


BACKEND_ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = BACKEND_ROOT / "app/curriculum_kb/catalogs/open_sources_demo_v1.json"


class CurriculumDatasetCliTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = AsyncMongoMockClient()
        self.db = self.client["test_curriculum_dataset_cli"]

    def _cli_api(self):
        try:
            from app.curriculum_kb.cli import build_parser, run_command
        except ModuleNotFoundError as exc:
            self.fail(f"Dataset CLI is missing: {exc}")
        return build_parser, run_command

    async def test_dry_run_validates_manifest_without_writing_database(self):
        build_parser, run_command = self._cli_api()
        args = build_parser().parse_args(["dry-run", "--manifest", str(MANIFEST_PATH)])

        result = await run_command(args, self.db)

        self.assertEqual("dry-run", result["mode"])
        self.assertLessEqual(result["requested_chunks"], 25_000)
        self.assertEqual(0, await self.db["curriculum_kb_sources"].count_documents({}))
        self.assertEqual(0, await self.db["curriculum_kb_dataset_runs"].count_documents({}))

    async def test_rollback_requires_exact_dataset_confirmation(self):
        build_parser, run_command = self._cli_api()
        args = build_parser().parse_args([
            "rollback",
            "--dataset-key", "dataset-a",
            "--confirm", "dataset-b",
        ])

        with self.assertRaisesRegex(ValueError, "confirmation"):
            await run_command(args, self.db)

    def test_parser_exposes_only_bounded_dataset_operations(self):
        build_parser, _ = self._cli_api()
        parser = build_parser()

        for command in ("dry-run", "import", "resume", "report", "rollback"):
            with self.subTest(command=command):
                required = ["--manifest", str(MANIFEST_PATH)] if command in {"dry-run", "import"} else ["--dataset-key", "demo"]
                if command == "rollback":
                    required += ["--confirm", "demo"]
                self.assertEqual(command, parser.parse_args([command, *required]).command)


if __name__ == "__main__":
    unittest.main()
