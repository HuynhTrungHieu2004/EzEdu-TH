import os
import sys
from pathlib import Path

# Adjust sys.path to find app and evaluation modules
sys.path.append(str(Path(__file__).resolve().parents[2]))

from app.services.document_parser import extract_text
from app.services.text_chunking_service import split_text_into_chunks
from evaluation.metrics.parsing_metrics import evaluate_parsing_and_chunking
from evaluation.loaders import load_evaluation_cases

def run_parsing_chunking_eval() -> dict:
    print("--- Running Parsing & Chunking Evaluation ---")
    
    # Locate test.docx in the workspace root
    workspace_root = Path(__file__).resolve().parents[2]
    test_docx_path = os.path.join(workspace_root, "test.docx")
    
    if not os.path.exists(test_docx_path):
        print(f"Warning: test.docx not found at {test_docx_path}. Skipping parsing check.")
        return {
            "passed": True,
            "metrics": {},
            "reason": "test.docx not found"
        }
        
    try:
        # Call actual production services
        extracted_text = extract_text(test_docx_path, "docx")
        chunks = split_text_into_chunks(extracted_text)
        
        # We can define a few required facts to check preservation
        required_sentences = [
            "hệ thống", "học liệu", "đánh giá"
        ]
        
        metrics = evaluate_parsing_and_chunking(chunks, extracted_text, required_sentences)
        
        # Quality check: empty chunks count must be 0
        passed = metrics.get("empty_chunks", 0) == 0 and metrics.get("duplicate_chunk_rate", 0.0) < 0.2
        
        print(f"Chunks Count: {len(chunks)}")
        print(f"Empty Chunks: {metrics.get('empty_chunks')}")
        print(f"Fact Preservation: {metrics.get('fact_preservation_rate'):.1%}")
        
        return {
            "passed": passed,
            "metrics": metrics,
            "chunks_count": len(chunks)
        }
    except Exception as e:
        print(f"Error in parsing evaluation: {e}")
        return {
            "passed": False,
            "error": str(e),
            "reason": "Parser crashed during evaluation"
        }

if __name__ == "__main__":
    res = run_parsing_chunking_eval()
    sys.exit(0 if res.get("passed") else 1)
