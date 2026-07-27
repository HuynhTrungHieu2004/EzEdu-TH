import argparse
import asyncio
import json
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from app.database.mongodb import close_mongo_connection, connect_to_mongo
from app.personalization.jobs.kmeans_training_job import train_cluster_type
from app.personalization.repositories.mongo import PersonalizationMongoRepository


CLUSTER_TYPES = ("content", "question", "learner_ability", "learner_behavior", "learner_interest")


async def run(cluster_types: list[str]):
    await connect_to_mongo()
    try:
        repo = PersonalizationMongoRepository()
        results = []
        for cluster_type in cluster_types:
            results.append((await train_cluster_type(cluster_type, repository=repo)).model_dump())
        return results
    finally:
        await close_mongo_connection()


def main():
    parser = argparse.ArgumentParser(description="Train personalization K-Means models offline.")
    parser.add_argument("--cluster-type", choices=CLUSTER_TYPES, action="append")
    args = parser.parse_args()
    cluster_types = args.cluster_type or list(CLUSTER_TYPES)
    print(json.dumps(asyncio.run(run(cluster_types)), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
