import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.database.mongodb import close_mongo_connection, connect_to_mongo
from app.personalization.services.advanced_diagnosis_service import build_advanced_diagnosis_experiment_report


async def main() -> None:
    parser = argparse.ArgumentParser(description="Audit readiness for NeuralCD and AKT research/production use.")
    parser.add_argument("--output", type=Path, help="Optional JSON output path.")
    args = parser.parse_args()

    await connect_to_mongo()
    try:
        report = await build_advanced_diagnosis_experiment_report()
    finally:
        await close_mongo_connection()

    payload = report.model_dump(mode="json")
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    asyncio.run(main())
