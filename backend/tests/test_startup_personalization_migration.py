import os
import stat
import subprocess
import tempfile
import unittest
from pathlib import Path


BACKEND_DIR = Path(__file__).resolve().parents[1]


class StartupPersonalizationMigrationTests(unittest.TestCase):
    def _run_start(self, enabled: str) -> list[str]:
        with tempfile.TemporaryDirectory() as temp_dir:
            fake_bin = Path(temp_dir)
            command_log = fake_bin / "commands.log"
            for name, body in {
                "python": '#!/usr/bin/env bash\necho "$*" >> "$COMMAND_LOG"\n',
                "uvicorn": "#!/usr/bin/env bash\nexit 0\n",
            }.items():
                executable = fake_bin / name
                executable.write_text(body)
                executable.chmod(executable.stat().st_mode | stat.S_IXUSR)

            env = {
                **os.environ,
                "PATH": f"{fake_bin}:{os.environ['PATH']}",
                "COMMAND_LOG": str(command_log),
                "PERSONALIZATION_ENABLED": enabled,
                "RUN_WORKER": "0",
                "DEMO_PASSWORD": "",
            }
            result = subprocess.run(
                ["bash", str(BACKEND_DIR / "start.sh")],
                cwd=BACKEND_DIR,
                env=env,
                capture_output=True,
                text=True,
                timeout=5,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            return command_log.read_text().splitlines() if command_log.exists() else []

    def test_enabled_personalization_creates_indexes_before_startup(self):
        self.assertEqual(
            self._run_start("true"),
            ["-m scripts.migrate_personalization_indexes --force-production"],
        )

    def test_disabled_personalization_skips_index_migration(self):
        self.assertEqual(self._run_start("false"), [])


if __name__ == "__main__":
    unittest.main()
