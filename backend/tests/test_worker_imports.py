import os
from pathlib import Path
import subprocess
import sys
import unittest


class WorkerImportTests(unittest.TestCase):
    def test_idle_worker_does_not_load_ai_math_stack(self):
        backend_dir = Path(__file__).resolve().parents[1]
        env = {**os.environ, "PYTHONPATH": str(backend_dir)}
        result = subprocess.run(
            [
                sys.executable,
                "-c",
                (
                    "import sys; import app.worker; "
                    "print(','.join(name for name in "
                    "('chromadb', 'numpy', 'sklearn') if name in sys.modules))"
                ),
            ],
            cwd=backend_dir,
            env=env,
            check=True,
            capture_output=True,
            text=True,
        )

        self.assertEqual(result.stdout.strip(), "")


if __name__ == "__main__":
    unittest.main()
