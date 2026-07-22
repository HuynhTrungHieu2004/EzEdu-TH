import os
import sys
import asyncio
from pathlib import Path

# Adjust sys.path to find app and evaluation modules
sys.path.append(str(Path(__file__).resolve().parents[2]))

from app.services.rag_service import search_user_chunks_advanced
import app.services.rag_service as rag_service
from evaluation.fixtures.setup_test_data import EvaluationFixtureManager
from evaluation.loaders import load_evaluation_cases
from evaluation.metrics.retrieval_metrics import (
    calculate_hit_at_k,
    calculate_recall_at_k,
    calculate_mrr,
    verify_user_isolation
)

async def run_rag_eval() -> dict:
    print("--- Running RAG Retrieval & Isolation Evaluation ---")
    
    # Setup collection name prefix
    rag_service.COLLECTION_NAME = "evaluation_document_chunks"
    
    manager = EvaluationFixtureManager()
    await manager.setup_fixtures()
    
    passed = True
    results_details = []
    failed_cases = []
    
    try:
        cases = load_evaluation_cases(os.path.join(os.path.dirname(os.path.dirname(__file__)), "datasets", "evaluation_cases.json"))
        rag_cases = [c for c in cases if c.category in ("retrieval", "rag")]
        
        user_a_id = "eval_user_a_id"
        
        # Look up run-scoped pre-generated ObjectIds
        def get_run_doc_id(fixture_name: str) -> str:
            doc_key = fixture_name.replace(".txt", "")
            return manager.doc_mapping.get(doc_key, "")
            
        for case in rag_cases:
            run_doc_ids = [get_run_doc_id(d) for d in case.document_fixtures]
            
            print(f"Querying for case {case.case_id}: {case.question} with doc_ids: {run_doc_ids}")
            
            actual_chunks = await search_user_chunks_advanced(
                user_id=user_a_id,
                query=case.question,
                document_ids=run_doc_ids,
                n_results=5
            )
            
            print(f"Retrieved {len(actual_chunks)} chunks.")
            
            top_k_info = []
            for idx, ch in enumerate(actual_chunks):
                top_k_info.append({
                    "rank": idx + 1,
                    "document_id": ch.get("metadata", {}).get("document_id"),
                    "chunk_index": ch.get("metadata", {}).get("chunk_index"),
                    "distance": ch.get("distance", 0.0)
                })
            
            expected_indices = [0]
            
            hit_1 = calculate_hit_at_k(actual_chunks, expected_indices, 1)
            hit_5 = calculate_hit_at_k(actual_chunks, expected_indices, 5)
            recall_5 = calculate_recall_at_k(actual_chunks, expected_indices, 5)
            mrr_score = calculate_mrr(actual_chunks, expected_indices)
            
            isolation_ok = verify_user_isolation(actual_chunks, user_a_id)
            
            case_passed = hit_5 > 0.0 and isolation_ok
            if not case_passed:
                passed = False
                failed_cases.append({
                    "case_id": case.case_id,
                    "category": case.category,
                    "question": case.question,
                    "reason": f"Hit@5={hit_5}, Isolation={isolation_ok}"
                })
                
            results_details.append({
                "case_id": case.case_id,
                "hit_1": hit_1,
                "hit_5": hit_5,
                "recall_5": recall_5,
                "mrr": mrr_score,
                "isolation_ok": isolation_ok,
                "top_k_actual": top_k_info
            })
            
        # 2. Critical Owner Isolation test
        doc_b_run_id = get_run_doc_id("doc_g_user_b.txt")
        leak_chunks = await search_user_chunks_advanced(
            user_id=user_a_id,
            query="Delta 99 secret code",
            document_ids=[doc_b_run_id],
            n_results=5
        )
        
        leak_ok = len(leak_chunks) == 0
        if not leak_ok:
            passed = False
            failed_cases.append({
                "case_id": "CRITICAL_ISOLATION_LEAK_TEST",
                "category": "security",
                "question": "Querying User B documents directly under User A",
                "reason": f"Leaked {len(leak_chunks)} chunks from User B!"
            })
            
    finally:
        await manager.cleanup_fixtures()
        
    return {
        "passed": passed,
        "results": results_details,
        "failed_cases": failed_cases
    }

if __name__ == "__main__":
    res = asyncio.run(run_rag_eval())
    sys.exit(0 if res.get("passed") else 1)
