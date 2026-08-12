import unittest

from app.personalization.services.cbf_kmeans_hybrid_service import (
    build_cluster_embedding_centroids,
    ensure_cluster_exploration,
    ensure_cluster_exploration_for_entries,
    select_nearest_clusters,
    touched_clusters,
)

MATH = [1.0, 0.0, 0.0]
HISTORY = [0.0, 1.0, 0.0]
BIOLOGY = [0.0, 0.0, 1.0]


def item(item_id: str, cluster, embedding, score: float = 0.5) -> dict:
    return {
        "_id": item_id,
        "content_cluster_id": cluster,
        "semantic_embedding": embedding,
        "score": score,
    }


POOL = [
    item("m1", 0, MATH, 0.90),
    item("m2", 0, [0.95, 0.05, 0.0], 0.85),
    item("m3", 0, [0.9, 0.1, 0.0], 0.80),
    item("h1", 1, HISTORY, 0.40),
    item("h2", 1, [0.05, 0.95, 0.0], 0.35),
    item("b1", 2, BIOLOGY, 0.30),
]


class TouchedClustersTests(unittest.TestCase):
    def test_collects_clusters_from_the_learner_history(self):
        events = [{"item_id": "m1"}, {"item_id": "h1"}]
        by_id = {i["_id"]: i for i in POOL}

        self.assertEqual(touched_clusters(events, by_id), {0, 1})

    def test_unknown_items_are_ignored(self):
        self.assertEqual(touched_clusters([{"item_id": "khong_co"}], {i["_id"]: i for i in POOL}), set())

    def test_items_without_cluster_are_ignored(self):
        by_id = {"x": {"_id": "x", "content_cluster_id": None}}

        self.assertEqual(touched_clusters([{"item_id": "x"}], by_id), set())


class ClusterCentroidTests(unittest.TestCase):
    def test_centroid_is_the_mean_embedding_of_cluster_members(self):
        centroids = build_cluster_embedding_centroids(POOL)

        self.assertEqual(set(centroids), {0, 1, 2})
        # Cụm 0 toàn nội dung toán -> tâm cụm nghiêng hẳn về chiều thứ nhất.
        self.assertGreater(centroids[0][0], 0.9)
        self.assertLess(centroids[0][1], 0.1)

    def test_items_without_embedding_do_not_break_the_centroid(self):
        pool = POOL + [item("empty", 0, [], 0.1)]

        centroids = build_cluster_embedding_centroids(pool)

        self.assertEqual(len(centroids[0]), 3)

    def test_returns_empty_when_nothing_has_embeddings(self):
        pool = [item("a", 0, []), item("b", 1, [])]

        self.assertEqual(build_cluster_embedding_centroids(pool), {})


class SelectNearestClustersTests(unittest.TestCase):
    def test_picks_the_clusters_closest_to_the_learner_profile(self):
        centroids = build_cluster_embedding_centroids(POOL)

        chosen = select_nearest_clusters(MATH, centroids, limit=1)

        self.assertEqual(chosen, [0])

    def test_limit_controls_how_many_clusters_come_back(self):
        centroids = build_cluster_embedding_centroids(POOL)

        self.assertEqual(len(select_nearest_clusters(MATH, centroids, limit=2)), 2)

    def test_no_profile_means_no_narrowing(self):
        centroids = build_cluster_embedding_centroids(POOL)

        self.assertEqual(select_nearest_clusters([], centroids, limit=2), [])


class EnsureClusterExplorationTests(unittest.TestCase):
    def test_promotes_an_item_from_an_untouched_cluster(self):
        """Điểm yếu cố hữu của CBF: chỉ gợi ý thứ giống cái đã học. Top-N phải
        có ít nhất một item thuộc cụm học sinh chưa chạm tới."""
        ranked = [POOL[0], POOL[1], POOL[2]]  # toàn cụm 0

        result = ensure_cluster_exploration(ranked, POOL, touched={0}, top_n=3)

        clusters = [i["content_cluster_id"] for i in result[:3]]
        self.assertIn(0, clusters)
        self.assertTrue(set(clusters) - {0}, "phải có ít nhất một cụm mới")

    def test_keeps_the_best_scoring_item_at_the_top(self):
        ranked = [POOL[0], POOL[1], POOL[2]]

        result = ensure_cluster_exploration(ranked, POOL, touched={0}, top_n=3)

        self.assertEqual(result[0]["_id"], "m1")

    def test_promoted_item_is_the_best_of_the_untouched_clusters(self):
        ranked = [POOL[0], POOL[1], POOL[2]]

        result = ensure_cluster_exploration(ranked, POOL, touched={0}, top_n=3)

        promoted = [i for i in result[:3] if i["content_cluster_id"] != 0]
        self.assertEqual(promoted[0]["_id"], "h1")  # điểm cao nhất ngoài cụm 0

    def test_does_nothing_when_exploration_already_present(self):
        ranked = [POOL[0], POOL[3], POOL[1]]  # đã có cụm 1

        result = ensure_cluster_exploration(ranked, POOL, touched={0}, top_n=3)

        self.assertEqual([i["_id"] for i in result], ["m1", "h1", "m2"])

    def test_does_nothing_when_every_cluster_was_already_touched(self):
        ranked = [POOL[0], POOL[1], POOL[2]]

        result = ensure_cluster_exploration(ranked, POOL, touched={0, 1, 2}, top_n=3)

        self.assertEqual([i["_id"] for i in result], ["m1", "m2", "m3"])

    def test_never_grows_the_list(self):
        ranked = [POOL[0], POOL[1], POOL[2]]

        result = ensure_cluster_exploration(ranked, POOL, touched={0}, top_n=3)

        self.assertEqual(len(result), len(ranked))


def entry(item_id: str, cluster, score: float) -> dict:
    return {"item": {"_id": item_id, "content_cluster_id": cluster}, "final_score": score}


class EnsureClusterExplorationForEntriesTests(unittest.TestCase):
    ENTRIES = [
        entry("m1", 0, 0.90), entry("m2", 0, 0.85), entry("m3", 0, 0.80),
        entry("h1", 1, 0.40), entry("b1", 2, 0.30),
    ]

    def test_promotes_an_entry_from_an_untouched_cluster(self):
        result = ensure_cluster_exploration_for_entries(self.ENTRIES, touched={0}, top_n=3)

        clusters = [e["item"]["content_cluster_id"] for e in result[:3]]
        self.assertTrue(set(clusters) - {0})
        self.assertEqual(result[0]["item"]["_id"], "m1")

    def test_length_is_preserved_and_nothing_is_lost(self):
        result = ensure_cluster_exploration_for_entries(self.ENTRIES, touched={0}, top_n=3)

        self.assertEqual(len(result), len(self.ENTRIES))
        self.assertEqual(
            {e["item"]["_id"] for e in result}, {e["item"]["_id"] for e in self.ENTRIES}
        )

    def test_untouched_cluster_already_in_head_changes_nothing(self):
        entries = [entry("m1", 0, 0.9), entry("h1", 1, 0.5), entry("m2", 0, 0.4)]

        result = ensure_cluster_exploration_for_entries(entries, touched={0}, top_n=3)

        self.assertEqual([e["item"]["_id"] for e in result], ["m1", "h1", "m2"])


if __name__ == "__main__":
    unittest.main()
