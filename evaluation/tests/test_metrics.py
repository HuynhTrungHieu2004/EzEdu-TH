import unittest
import os
import json
from evaluation.metrics.retrieval_metrics import (
    calculate_hit_at_k,
    calculate_recall_at_k,
    calculate_mrr,
    verify_user_isolation
)
from evaluation.metrics.answer_metrics import verify_facts_and_claims, verify_abstention
from evaluation.metrics.citation_metrics import validate_citations, deduplicate_urls
from evaluation.metrics.parsing_metrics import evaluate_parsing_and_chunking
from evaluation.loaders import load_evaluation_cases

class TestMetricsAndValidators(unittest.TestCase):
    
    def test_retrieval_metrics(self):
        actual = [
            {"metadata": {"chunk_index": 1}},
            {"metadata": {"chunk_index": 3}},
            {"metadata": {"chunk_index": 5}}
        ]
        
        # Hit@K tests
        self.assertEqual(calculate_hit_at_k(actual, [3], 1), 0.0)
        self.assertEqual(calculate_hit_at_k(actual, [3], 2), 1.0)
        self.assertEqual(calculate_hit_at_k(actual, [5], 3), 1.0)
        self.assertEqual(calculate_hit_at_k(actual, [], 5), 1.0) # vacuously true
        
        # Recall@K tests
        self.assertEqual(calculate_recall_at_k(actual, [1, 3], 2), 1.0)
        self.assertEqual(calculate_recall_at_k(actual, [1, 10], 3), 0.5)
        
        # MRR tests
        self.assertEqual(calculate_mrr(actual, [3]), 0.5)
        self.assertEqual(calculate_mrr(actual, [1]), 1.0)
        self.assertEqual(calculate_mrr(actual, [10]), 0.0)

    def test_user_isolation(self):
        chunks_clean = [
            {"metadata": {"user_id": "user_a"}},
            {"metadata": {"user_id": "user_a"}}
        ]
        chunks_leaked = [
            {"metadata": {"user_id": "user_a"}},
            {"metadata": {"user_id": "user_b"}}
        ]
        
        self.assertTrue(verify_user_isolation(chunks_clean, "user_a"))
        self.assertFalse(verify_user_isolation(chunks_leaked, "user_a"))

    def test_answer_metrics(self):
        answer = "Thành phố Hồ Chí Minh là trung tâm lớn nhất về kinh tế và dân số."
        req_facts = ["dân số", "kinh tế"]
        bad_facts = ["Hà Nội là lớn nhất"]
        
        res = verify_facts_and_claims(answer, req_facts, bad_facts)
        self.assertTrue(res["passed"])
        self.assertEqual(len(res["missing_facts"]), 0)
        self.assertEqual(len(res["violated_claims"]), 0)
        
        res_fail = verify_facts_and_claims(answer, ["Đà Nẵng"], bad_facts)
        self.assertFalse(res_fail["passed"])
        self.assertIn("Đà Nẵng", res_fail["missing_facts"])

    def test_abstention_check(self):
        self.assertTrue(verify_abstention("Tôi không tìm thấy thông tin phù hợp.", True))
        self.assertFalse(verify_abstention("Hà Nội là thủ đô.", True))
        self.assertTrue(verify_abstention("Hà Nội là thủ đô.", False))

    def test_citation_checks(self):
        text = "Thông tin này được trích xuất từ tài liệu học tập [DOC_1] và báo chí [WEB_1]."
        internal = [{"source_id": "DOC_1"}]
        web = [{"source_id": "WEB_1", "url": "https://wikipedia.org"}]
        
        res = validate_citations(text, internal, web)
        self.assertTrue(res["passed"])
        self.assertIn("DOC_1", res["cited_tags"])
        
        # Test XSS javascript rejection
        web_unsafe = [{"source_id": "WEB_1", "url": "javascript:alert(1)"}]
        res_unsafe = validate_citations(text, internal, web_unsafe)
        self.assertFalse(res_unsafe["passed"])
        self.assertIn("javascript:alert(1)", res_unsafe["unsafe_links"])

    def test_url_deduplication(self):
        urls = ["  https://google.com  ", "https://google.com", "https://bing.com"]
        self.assertEqual(deduplicate_urls(urls), ["https://google.com", "https://bing.com"])

    def test_parsing_metrics(self):
        chunks = ["Hà Nội là thủ đô.", "Sông Hồng chảy qua Bắc Bộ."]
        text = "Hà Nội là thủ đô. Sông Hồng chảy qua Bắc Bộ."
        required = ["Hà Nội", "Sông Hồng"]
        
        metrics = evaluate_parsing_and_chunking(chunks, text, required)
        self.assertEqual(metrics["empty_chunks"], 0)
        self.assertEqual(metrics["fact_preservation_rate"], 1.0)
        self.assertEqual(metrics["max_chunk_length"], len("Sông Hồng chảy qua Bắc Bộ."))

    def test_dataset_uniqueness(self):
        # We test that loaders.py raises an exception on duplicates
        cases_dir = os.path.dirname(os.path.dirname(__file__))
        cases_path = os.path.join(cases_dir, "datasets", "evaluation_cases.json")
        if os.path.exists(cases_path):
            cases = load_evaluation_cases(cases_path)
            self.assertTrue(len(cases) > 0)
            
            # Verify case_id uniqueness
            ids = [c.case_id for c in cases]
            self.assertEqual(len(ids), len(set(ids)))

if __name__ == "__main__":
    unittest.main()
