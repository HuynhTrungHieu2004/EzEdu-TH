import os
import sys
import asyncio
from datetime import datetime, timezone

# Adjust sys.path to find app and evaluation modules
sys.path.append(str(Path(__file__).resolve().parents[2]) if 'Path' in globals() else os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from evaluation.config.thresholds import QUALITY_THRESHOLDS, CRITICAL_SAFETY_RULES
from evaluation.runners.run_parsing_chunking_evaluation import run_parsing_chunking_eval
from evaluation.runners.run_rag_evaluation import run_rag_eval
from evaluation.runners.run_qa_evaluation import run_qa_eval
from evaluation.runners.run_verification_evaluation import run_verification_eval
from evaluation.runners.run_question_generation_evaluation import run_question_gen_eval
from evaluation.metrics.reporting import generate_evaluation_reports

async def run_full_evaluation() -> int:
    print("==========================================")
    print("   STARTING FULL AI ASSESSMENTS SUITE    ")
    print("==========================================")
    
    # 1. Run all category evaluation runners
    parsing_res = run_parsing_chunking_eval()
    rag_res = await run_rag_eval()
    qa_res = await run_qa_eval()
    verify_res = await run_verification_eval()
    qgen_res = await run_question_gen_eval()
    
    # 2. Compile metrics and counts
    total_cases = 0
    passed_cases = 0
    failed_cases_details = []
    
    # Category stats
    categories_stats = {
        "parsing": {"total": 0, "passed": 0, "failed": 0, "threshold": 1.0},
        "retrieval": {"total": 0, "passed": 0, "failed": 0, "threshold": QUALITY_THRESHOLDS["hit_at_5"]},
        "qa": {"total": 0, "passed": 0, "failed": 0, "threshold": QUALITY_THRESHOLDS["answer_correctness"]},
        "verification": {"total": 0, "passed": 0, "failed": 0, "threshold": QUALITY_THRESHOLDS["verification_precision"]},
        "question_gen": {"total": 0, "passed": 0, "failed": 0, "threshold": 0.80}
    }
    
    # Processing Parsing
    categories_stats["parsing"]["total"] += 1
    if parsing_res.get("passed"):
        categories_stats["parsing"]["passed"] += 1
        passed_cases += 1
    else:
        categories_stats["parsing"]["failed"] += 1
        failed_cases_details.append({
            "case_id": "CASE_PARSE_001",
            "category": "parsing",
            "question": "test.docx parsing check",
            "reason": parsing_res.get("reason", "Unknown failure")
        })
    total_cases += 1
    
    # Processing RAG
    for r in rag_res.get("results", []):
        categories_stats["retrieval"]["total"] += 1
        if r.get("isolation_ok") and r.get("hit_5", 0) > 0:
            categories_stats["retrieval"]["passed"] += 1
            passed_cases += 1
        else:
            categories_stats["retrieval"]["failed"] += 1
        total_cases += 1
    for fc in rag_res.get("failed_cases", []):
        failed_cases_details.append(fc)
        
    # Processing QA
    for q in qa_res.get("results", []):
        categories_stats["qa"]["total"] += 1
        if q.get("passed"):
            categories_stats["qa"]["passed"] += 1
            passed_cases += 1
        else:
            categories_stats["qa"]["failed"] += 1
        total_cases += 1
    for fc in qa_res.get("failed_cases", []):
        failed_cases_details.append(fc)
        
    # Processing Verification
    for v in verify_res.get("results", []):
        categories_stats["verification"]["total"] += 1
        if v.get("f1", 0) >= QUALITY_THRESHOLDS["verification_precision"]:
            categories_stats["verification"]["passed"] += 1
            passed_cases += 1
        else:
            categories_stats["verification"]["failed"] += 1
        total_cases += 1
    for fc in verify_res.get("failed_cases", []):
        failed_cases_details.append(fc)
        
    # Processing Question Gen
    for qg in qgen_res.get("results", []):
        categories_stats["question_gen"]["total"] += 1
        if qg.get("valid_questions_count", 0) > 0:
            categories_stats["question_gen"]["passed"] += 1
            passed_cases += 1
        else:
            categories_stats["question_gen"]["failed"] += 1
        total_cases += 1
    for fc in qgen_res.get("failed_cases", []):
        failed_cases_details.append(fc)
        
    # Determine full pass criteria
    suite_passed = len(failed_cases_details) == 0
    
    # 3. Construct report payload
    report_data = {
        "passed": suite_passed,
        "total_cases": total_cases,
        "passed_cases": passed_cases,
        "failed_cases_count": len(failed_cases_details),
        "live_mode": False,
        "llm_model": "mock",
        "embedding_model": "local",
        "dataset_version": "1.0.0",
        "fixtures_version": "1.0.0",
        "categories": categories_stats,
        "failed_cases_details": failed_cases_details
    }
    
    # 4. Generate Reports
    reports_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "reports")
    paths = generate_evaluation_reports(report_data, reports_dir)
    print(f"Reports generated successfully:")
    print(f"  JSON: {paths['json']}")
    print(f"  Markdown: {paths['markdown']}")
    
    print("==========================================")
    if suite_passed:
        print("   ✅ ALL AI QUALITY METRICS PASSED!      ")
        print("==========================================")
        return 0
    else:
        print(f"   ❌ FAILED: {len(failed_cases_details)} cases failed.")
        print("==========================================")
        return 1

if __name__ == "__main__":
    exit_code = asyncio.run(run_full_evaluation())
    sys.exit(exit_code)
