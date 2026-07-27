import argparse
import asyncio
import json
import math
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.database.mongodb import close_mongo_connection, connect_to_mongo, get_database
from app.personalization.constants.collections import LEARNING_EVENTS


def clamp_probability(value: float) -> float:
    return max(0.001, min(0.999, value))


def compute_metrics(rows: list[dict]) -> dict:
    if not rows:
        return {"status": "no_data", "message": "No real learner model predictions found."}

    correct = 0
    log_loss = 0.0
    brier = 0.0
    buckets: dict[str, dict] = {}
    for row in rows:
        probability = clamp_probability(float(row["predicted_probability"]))
        actual = max(0.0, min(1.0, float(row["actual"])))
        predicted_label = probability >= 0.5
        actual_label = actual >= 0.5
        correct += int(predicted_label == actual_label)
        log_loss += -(actual * math.log(probability) + (1.0 - actual) * math.log(1.0 - probability))
        brier += (probability - actual) ** 2
        bucket_floor = int(probability * 10) / 10
        bucket_name = f"{bucket_floor:.1f}-{bucket_floor + 0.1:.1f}"
        bucket = buckets.setdefault(bucket_name, {"count": 0, "predicted_sum": 0.0, "actual_sum": 0.0})
        bucket["count"] += 1
        bucket["predicted_sum"] += probability
        bucket["actual_sum"] += actual

    calibration = []
    for bucket_name, bucket in sorted(buckets.items()):
        count = bucket["count"]
        calibration.append({
            "bucket": bucket_name,
            "count": count,
            "avg_predicted": bucket["predicted_sum"] / count,
            "avg_actual": bucket["actual_sum"] / count,
        })

    total = len(rows)
    return {
        "status": "ok",
        "sample_count": total,
        "accuracy": correct / total,
        "log_loss": log_loss / total,
        "brier_score": brier / total,
        "calibration_buckets": calibration,
    }


def load_fixture(path: Path) -> list[dict]:
    payload = json.loads(path.read_text())
    if not isinstance(payload, list):
        raise ValueError("Fixture must be a JSON array.")
    rows = []
    for item in payload:
        rows.append({
            "predicted_probability": item["predicted_probability"],
            "actual": item["actual"],
        })
    return rows


async def load_real_rows(limit: int) -> list[dict]:
    await connect_to_mongo()
    try:
        cursor = (
            get_database()[LEARNING_EVENTS]
            .find(
                {
                    "event_type": "question_answered",
                    "learner_model_prediction.probability_before": {"$exists": True},
                    "learner_model_prediction.actual": {"$exists": True},
                }
            )
            .sort("occurred_at", -1)
            .limit(limit)
        )
        rows = []
        async for item in cursor:
            prediction = item["learner_model_prediction"]
            rows.append({
                "predicted_probability": prediction["probability_before"],
                "actual": prediction["actual"],
            })
        return rows
    finally:
        await close_mongo_connection()


async def main():
    parser = argparse.ArgumentParser(description="Evaluate BKT/IRT predictions from real processed learning events.")
    parser.add_argument("--fixture", type=Path, help="Optional JSON fixture with predicted_probability and actual.")
    parser.add_argument("--limit", type=int, default=1000)
    args = parser.parse_args()

    rows = load_fixture(args.fixture) if args.fixture else await load_real_rows(args.limit)
    print(json.dumps(compute_metrics(rows), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(main())
