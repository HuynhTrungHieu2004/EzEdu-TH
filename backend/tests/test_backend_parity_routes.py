from app.main import app


def test_synced_backend_exposes_source_feature_groups():
    paths = set(app.openapi()["paths"])
    required_fragments = (
        "/auth/google",
        "/auth/facebook",
        "/study-exams",
        "/teacher/content-history",
        "/curriculum-kb/crawl",
    )
    missing = [item for item in required_fragments if not any(item in path for path in paths)]
    assert not missing, f"Missing source backend feature groups: {missing}"
