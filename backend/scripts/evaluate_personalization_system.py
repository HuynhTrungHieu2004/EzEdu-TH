import argparse
import asyncio
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.personalization.evaluation.pipeline import run_real_evaluation, run_synthetic_evaluation
from app.personalization.evaluation.reporting import local_date_stamp, write_all_reports


async def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export personalization evaluation metrics as JSON, CSV, and Markdown."
    )
    parser.add_argument(
        "--mode",
        choices=["synthetic", "real"],
        default="synthetic",
        help="Use synthetic fixture data or read available real data from MongoDB.",
    )
    parser.add_argument("--limit", type=int, default=2000, help="Maximum real rows/logs to inspect.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("reports/personalization"),
        help="Directory for generated JSON/CSV/Markdown reports.",
    )
    args = parser.parse_args()

    payload = await run_real_evaluation(args.limit) if args.mode == "real" else run_synthetic_evaluation()
    suffix = "synthetic" if payload.get("is_synthetic") else "real"
    paths = write_all_reports(
        payload,
        args.output_dir,
        stem=f"evaluation-{local_date_stamp()}-{suffix}",
    )
    for kind, path in paths.items():
        print(f"{kind}: {path}")


if __name__ == "__main__":
    asyncio.run(main())
