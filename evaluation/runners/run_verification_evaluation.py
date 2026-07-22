import os
import sys
import json
import asyncio
from pathlib import Path
from unittest.mock import patch
from bson import ObjectId

# Adjust sys.path to find app and evaluation modules
sys.path.append(str(Path(__file__).resolve().parents[2]))

from app.database.mongodb import get_database
from app.services.verification_service import create_verification_session, run_verification_task
import app.services.verification_service as verification_service
import app.services.llm_service as llm_service

from evaluation.fixtures.setup_test_data import EvaluationFixtureManager
from evaluation.loaders import load_evaluation_cases

# Mock Gemini client for Verification
class MockCandidate:
    def __init__(self):
        self.grounding_metadata = None

class MockResponse:
    def __init__(self, text):
        self.text = text
        self.candidates = [MockCandidate()]

class MockModels:
    def __init__(self, mock_responses):
        self.mock_responses = mock_responses
        
    def generate_content(self, model, contents, config=None):
        prompt_str = str(contents)
        if "CÁC VẤN ĐỀ CẦN XÁC MINH" in prompt_str or "verifications" in prompt_str:
            # Return cross check response
            cross_resp = {
                "verifications": [
                    {
                        "index": 0,
                        "verdict": "confirmed",
                        "confidence": 0.95,
                        "reason": "Chính xác"
                    },
                    {
                        "index": 1,
                        "verdict": "confirmed",
                        "confidence": 0.95,
                        "reason": "Chính xác"
                    }
                ]
            }
            import json
            return MockResponse(json.dumps(cross_resp))
            
        resp_data = self.mock_responses.get("CASE_VERIFY_001", {})
        return MockResponse(resp_data.get("text", "{}"))

class MockGeminiClient:
    def __init__(self, mock_responses):
        self.models = MockModels(mock_responses)

def clean_sentence(text: str) -> str:
    return " ".join(text.strip().split()).lower()

async def run_verification_eval(live_mode: bool = False) -> dict:
    print("--- Running Material Quality Verification Evaluation ---")
    
    manager = EvaluationFixtureManager()
    await manager.setup_fixtures()
    
    db = get_database()
    
    cases = load_evaluation_cases(os.path.join(os.path.dirname(os.path.dirname(__file__)), "datasets", "evaluation_cases.json"))
    verify_cases = [c for c in cases if c.category == "verification"]
    
    with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), "fixtures", "mock_responses.json"), "r", encoding="utf-8") as f:
        mock_responses = json.load(f)
        
    passed = True
    results_details = []
    failed_cases = []
    
    mock_client = MockGeminiClient(mock_responses)
    
    def get_mock_client():
        return mock_client
        
    patch_target = "app.services.llm_service.get_gemini_client" if not live_mode else "non_existent_mock_target"
    
    # We patch get_gemini_client during evaluation
    try:
        with patch(patch_target, side_effect=get_mock_client):
            for case in verify_cases:
                # Map doc key to generated doc id
                doc_key = case.document_fixtures[0].replace(".txt", "")
                doc_id = manager.doc_mapping[doc_key]
                user_id = "eval_user_a_id"
                
                # 1. Create session
                session = await create_verification_session(doc_id, user_id, 1)
                session_id = str(session["_id"])
                
                # 2. Run verification task (calls actual production logic)
                await run_verification_task(doc_id, user_id, session_id)
                
                # 3. Retrieve actual issues from MongoDB
                actual_issues = await db["verification_issues"].find({"session_id": session_id}).to_list(length=100)
                
                # Compare expected issues with actual issues
                expected_list = getattr(case, "expected_issues", [])
                
                matched_expected = set()
                matched_actual = set()
                
                # Match issues (one-to-one) by normalized sentence content and issue type
                for e_idx, exp in enumerate(expected_list):
                    exp_sent = clean_sentence(exp.sentence)
                    for a_idx, act in enumerate(actual_issues):
                        act_sent = clean_sentence(act.get("original_text", ""))
                        # Check sentence overlap or type match
                        if exp.issue_type == act.get("issue_type") and (exp_sent in act_sent or act_sent in exp_sent):
                            matched_expected.add(e_idx)
                            matched_actual.add(a_idx)
                            break
                            
                tp = len(matched_expected)
                fp = len(actual_issues) - len(matched_actual)
                fn = len(expected_list) - len(matched_expected)
                
                precision = tp / (tp + fp) if (tp + fp) > 0 else 1.0
                recall = tp / (tp + fn) if (tp + fn) > 0 else 1.0
                f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 1.0
                
                case_passed = f1 >= 0.8
                if not case_passed:
                    passed = False
                    failed_cases.append({
                        "case_id": case.case_id,
                        "category": case.category,
                        "question": case.question,
                        "reason": f"F1-Score={f1:.2f} is below 0.80"
                    })
                    
                results_details.append({
                    "case_id": case.case_id,
                    "precision": precision,
                    "recall": recall,
                    "f1": f1,
                    "expected_count": len(expected_list),
                    "actual_count": len(actual_issues)
                })
                
    finally:
        await manager.cleanup_fixtures()
        
    return {
        "passed": passed,
        "results": results_details,
        "failed_cases": failed_cases
    }

if __name__ == "__main__":
    res = asyncio.run(run_verification_eval())
    if not res.get("passed"):
        print("FAILURES DETECTED:")
        for fc in res.get("failed_cases", []):
            print(f"  Case: {fc['case_id']} | Category: {fc['category']} | Reason: {fc['reason']}")
    sys.exit(0 if res.get("passed") else 1)
