import os
import sys
import json
import asyncio
from pathlib import Path
from unittest.mock import patch

# Adjust sys.path to find app and evaluation modules
sys.path.append(str(Path(__file__).resolve().parents[2]))

from app.schemas.chat import AdvancedChatAskRequest
from app.services.learning_chat_service import ask_advanced_question
import app.services.llm_service as llm_service
import app.services.rag_service as rag_service

from evaluation.fixtures.setup_test_data import EvaluationFixtureManager
from evaluation.loaders import load_evaluation_cases
from evaluation.metrics.answer_metrics import verify_facts_and_claims, verify_abstention, run_llm_judge
from evaluation.metrics.citation_metrics import validate_citations

# 1. Define Mock Gemini Client matching google-genai SDK interface
class MockCandidate:
    def __init__(self, web_sources=None):
        class MockGroundingChunk:
            def __init__(self, title, url):
                self.web = type('Web', (), {"title": title, "uri": url})()
        
        class MockGroundingMetadata:
            def __init__(self, sources):
                self.grounding_chunks = [MockGroundingChunk(s["title"], s["url"]) for s in sources]
                self.search_entry_point = None
                
        self.grounding_metadata = MockGroundingMetadata(web_sources) if web_sources else None

class MockResponse:
    def __init__(self, text, web_sources=None):
        self.text = text
        self.candidates = [MockCandidate(web_sources)]

class MockModels:
    def __init__(self, mock_responses, cases):
        self.mock_responses = mock_responses
        self.cases = cases
        
    def generate_content(self, model, contents, config=None):
        # Identify matching case_id
        matched_case_id = None
        for case in self.cases:
            # Match by question content
            if case.question in contents:
                matched_case_id = case.case_id
                break
                
        if not matched_case_id:
            # Fallback based on keywords
            if "Sa Pa" in contents or "thẩm định" in contents:
                matched_case_id = "CASE_VERIFY_001"
            elif "trắc nghiệm" in contents or "câu hỏi" in contents:
                matched_case_id = "CASE_QUESTION_GEN_001"
            else:
                matched_case_id = "CASE_QA_001"
                
        resp_data = self.mock_responses.get(matched_case_id, {})
        text = resp_data.get("text", "")
        
        # Add grounding support if case is CASE_CONVERSATION_001 or has web search
        web_sources = None
        if "web" in matched_case_id.lower() or "grounding" in matched_case_id.lower():
            web_sources = [{
                "title": "Google Search Source",
                "url": "https://www.google.com"
            }]
            
        return MockResponse(text, web_sources)

class MockGeminiClient:
    def __init__(self, mock_responses, cases):
        self.models = MockModels(mock_responses, cases)

async def run_qa_eval(live_mode: bool = False) -> dict:
    print("--- Running Q&A, Routing & Conversation Evaluation ---")
    
    # Redirect ChromaDB collections
    rag_service.COLLECTION_NAME = "evaluation_document_chunks"
    
    manager = EvaluationFixtureManager()
    await manager.setup_fixtures()
    
    # Load mock responses and cases
    cases = load_evaluation_cases(os.path.join(os.path.dirname(os.path.dirname(__file__)), "datasets", "evaluation_cases.json"))
    with open(os.path.join(os.path.dirname(os.path.dirname(__file__)), "fixtures", "mock_responses.json"), "r", encoding="utf-8") as f:
        mock_responses = json.load(f)
        
    passed = True
    results_details = []
    failed_cases = []
    
    # Setup Mock Client
    mock_client = MockGeminiClient(mock_responses, cases)
    
    def get_mock_client():
        return mock_client
        
    # We patch the gemini client getter of the production LLM service
    patch_target = "app.services.learning_chat_service.get_gemini_client" if not live_mode else "non_existent_mock_target"
    
    try:
        with patch(patch_target, side_effect=get_mock_client):
            qa_cases = [c for c in cases if c.category in ("qa", "routing", "injection", "conversation")]
            
            user_a_id = "eval_user_a_id"
            
            for case in qa_cases:
                # Resolve run_id document IDs using dynamic pre-generated ObjectId hex strings
                run_doc_ids = []
                for doc in case.document_fixtures:
                    doc_key = doc.replace(".txt", "")
                    run_doc_ids.append(manager.doc_mapping[doc_key])
                    
                import uuid
                payload = AdvancedChatAskRequest(
                    question=case.question,
                    document_ids=run_doc_ids,
                    scope=case.scope,
                    use_web_search=case.use_web_search,
                    response_style="normal",
                    request_id=f"req_{uuid.uuid4().hex}"
                )
                
                # Execute production Advanced Q&A service
                try:
                    response = await ask_advanced_question(user_id=user_a_id, payload=payload)
                    answer = response.get("answer", "")
                    retrieval_mode = response.get("retrieval_mode", "internal_only")
                    evidence_status = response.get("evidence_status", "well_supported")
                    
                    # 1. Routing classification check
                    routing_ok = True
                    if hasattr(case, "expected_retrieval_mode") and case.expected_retrieval_mode:
                        routing_ok = (retrieval_mode == case.expected_retrieval_mode)
                        
                    # 2. Fact presence check
                    required_facts = getattr(case, "required_facts", [])
                    forbidden_claims = getattr(case, "forbidden_claims", [])
                    fact_checks = verify_facts_and_claims(answer, required_facts, forbidden_claims)
                    
                    # 3. Abstention check
                    should_abstain = getattr(case, "should_abstain", False)
                    abstain_ok = verify_abstention(answer, should_abstain)
                    
                    # 4. Citations check
                    citation_checks = validate_citations(
                        answer,
                        response.get("internal_citations", []),
                        response.get("web_citations", [])
                    )
                    
                    case_passed = routing_ok and fact_checks["passed"] and abstain_ok and citation_checks["passed"]
                    if not case_passed:
                        passed = False
                        reason = f"Routing={routing_ok}, Facts={fact_checks['passed']}, Abstain={abstain_ok}, Citations={citation_checks['passed']}"
                        failed_cases.append({
                            "case_id": case.case_id,
                            "category": case.category,
                            "question": case.question,
                            "reason": reason
                        })
                        
                    results_details.append({
                        "case_id": case.case_id,
                        "category": case.category,
                        "passed": case_passed,
                        "actual_routing": retrieval_mode,
                        "actual_evidence": evidence_status,
                        "fact_checks": fact_checks,
                        "citation_checks": citation_checks
                    })
                except Exception as e:
                    passed = False
                    failed_cases.append({
                        "case_id": case.case_id,
                        "category": case.category,
                        "question": case.question,
                        "reason": f"Execution error: {e}"
                    })
                    
    finally:
        await manager.cleanup_fixtures()
        
    return {
        "passed": passed,
        "results": results_details,
        "failed_cases": failed_cases
    }

if __name__ == "__main__":
    res = asyncio.run(run_qa_eval())
    if not res.get("passed"):
        print("FAILURES DETECTED:")
        for fc in res.get("failed_cases", []):
            print(f"  Case: {fc['case_id']} | Category: {fc['category']} | Reason: {fc['reason']}")
    sys.exit(0 if res.get("passed") else 1)
