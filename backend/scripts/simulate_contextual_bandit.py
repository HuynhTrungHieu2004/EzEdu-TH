import argparse
import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.personalization.services.contextual_bandit_service import simulate_bandit_from_synthetic_data


def synthetic_interactions() -> list[dict]:
    return [
        {"item_id": "item-1", "action": "weak_knowledge", "reward": 0.35, "oracle_reward": 0.5, "learning_gain_proxy": 0.08, "catalog_size": 5},
        {"item_id": "item-2", "action": "forgetting_review", "reward": 0.25, "oracle_reward": 0.4, "learning_gain_proxy": 0.05, "catalog_size": 5},
        {"item_id": "item-3", "action": "exploration", "reward": -0.1, "oracle_reward": 0.3, "learning_gain_proxy": 0.0, "catalog_size": 5},
        {"item_id": "item-4", "action": "current_learning_goal", "reward": 0.45, "oracle_reward": 0.45, "learning_gain_proxy": 0.1, "catalog_size": 5},
    ]


def main() -> None:
    parser = argparse.ArgumentParser(description="Run a clearly synthetic contextual bandit simulation.")
    parser.add_argument("--output", type=Path, help="Optional JSON output path.")
    args = parser.parse_args()

    result = simulate_bandit_from_synthetic_data(synthetic_interactions())
    payload = result.model_dump(mode="json")
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text + "\n", encoding="utf-8")
    print(text)


if __name__ == "__main__":
    main()
