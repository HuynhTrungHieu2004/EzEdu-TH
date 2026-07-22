import os
import sys
import json
import asyncio
from pathlib import Path
from unittest.mock import patch

# Adjust sys.path to find app and evaluation modules
sys.path.append(str(Path(__file__).resolve().parents[2]))

from app.services.question_generation_service import generate_questions
import app.services.question_generation_service as question_generation_service
import app.services.llm_service as llm_service
import logging
logging.basicConfig(level=logging.INFO, format="%(levelname)s:%(name)s:%(message)s")

from evaluation.fixtures.setup_test_data import EvaluationFixtureManager
from evaluation.loaders import load_evaluation_cases

# Mock Gemini client for Question Gen
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
        resp_data = self.mock_responses.get("CASE_QUESTION_GEN_001", {})
        return MockResponse(resp_data.get("text", "[]"))

class MockGeminiClient:
    def __init__(self, mock_responses):
        self.models = MockModels(mock_responses)

async def run_question_gen_eval(live_mode: bool = False) -> dict:
    print("--- Running AI Question Generation Evaluation ---")
    
    manager = EvaluationFixtureManager()
    await manager.setup_fixtures()
    
    cases = load_evaluation_cases(os.path.join(os.path.dirname(os.path.dirname(__file__)), "datasets", "evaluation_cases.json"))
    qgen_cases = [c for c in cases if c.category == "question_gen"]
    
    with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), "fixtures", "mock_responses.json"), "r", encoding="utf-8") as f:
        mock_responses = json.load(f)
        
    passed = True
    results_details = []
    failed_cases = []
    
    mock_client = MockGeminiClient(mock_responses)
    
    def get_mock_client():
        return mock_client
        
    patch_target = "app.services.llm_service.get_gemini_client" if not live_mode else "non_existent_mock_target"
    
    try:
        with patch(patch_target, side_effect=get_mock_client):
            with patch("app.services.question_generation_service.is_gemini_available", return_value=True):
                for case in qgen_cases:
                    doc_key = case.document_fixtures[0].replace(".txt", "")
                    doc_id = manager.doc_mapping[doc_key]
                    user_id = "eval_user_a_id"
                    
                    # Execute production question generation service
                    questions = await generate_questions(
                        document_id=doc_id,
                        user_id=user_id,
                        question_count=case.expected_question_count,
                        difficulty="medium",
                        question_type="multiple_choice"
                    )
                    
                    # Assertions
                    q_list = questions.get("questions", [])
                    valid_questions_count = 0
                    duplicate_questions_count = 0
                    seen_questions = set()
                    
                    for q in q_list:
                        q_text = q.get("question", "").strip()
                        options = q.get("options")
                        choices = q.get("choices")
                        correct = q.get("correct_answer", "").strip()
                        explanation = q.get("explanation", "").strip()
                        
                        choices_list = []
                        correct_in_choices = False
                        if isinstance(choices, list):
                            choices_list = choices
                            correct_in_choices = correct in choices_list
                        elif isinstance(options, dict):
                            choices_list = list(options.values())
                            correct_in_choices = correct in options
                            
                        # 1. 4 choices count constraint
                        choices_ok = len(choices_list) == 4
                        
                        # 2. Duplicate choices check
                        unique_choices_ok = len(set(choices_list)) == len(choices_list)
                        
                        # 3. Explanation exists
                        explanation_ok = len(explanation) > 0
                        
                        q_ok = choices_ok and unique_choices_ok and correct_in_choices and explanation_ok
                        if q_ok:
                            valid_questions_count += 1
                            
                        if q_text in seen_questions:
                            duplicate_questions_count += 1
                        seen_questions.add(q_text)
                        
                    # Evaluate final case status
                    case_passed = (
                        valid_questions_count == case.expected_question_count
                        and duplicate_questions_count == 0
                    )
                    
                    if not case_passed:
                        passed = False
                        reason = f"Valid Questions={valid_questions_count}/{case.expected_question_count}, Duplicates={duplicate_questions_count}"
                        failed_cases.append({
                            "case_id": case.case_id,
                            "category": case.category,
                            "question": case.question,
                            "reason": reason
                        })
                        
                    results_details.append({
                        "case_id": case.case_id,
                        "valid_questions_count": valid_questions_count,
                        "duplicate_questions_count": duplicate_questions_count,
                        "questions_generated": q_list
                    })
                
    finally:
        await manager.cleanup_fixtures()
        
    return {
        "passed": passed,
        "results": results_details,
        "failed_cases": failed_cases
    }

if __name__ == "__main__":
    res = asyncio.run(run_question_gen_eval())
    if not res.get("passed"):
        print("FAILURES DETECTED:")
        for fc in res.get("failed_cases", []):
            print(f"  Case: {fc['case_id']} | Category: {fc['category']} | Reason: {fc['reason']}")
    sys.exit(0 if res.get("passed") else 1)
