import json
from typing import List, Any
from evaluation.schemas import (
    ParsingEvaluationCase,
    RetrievalEvaluationCase,
    QAEvaluationCase,
    RoutingEvaluationCase,
    VerificationEvaluationCase,
    QuestionGenEvaluationCase,
    InjectionEvaluationCase,
    ConversationEvaluationCase,
)

def load_case_from_dict(data: dict) -> Any:
    cat = data.get("category")
    if cat == "parsing":
        return ParsingEvaluationCase(**data)
    elif cat == "retrieval":
        return RetrievalEvaluationCase(**data)
    elif cat == "qa":
        return QAEvaluationCase(**data)
    elif cat == "routing":
        return RoutingEvaluationCase(**data)
    elif cat == "verification":
        return VerificationEvaluationCase(**data)
    elif cat == "question_gen":
        return QuestionGenEvaluationCase(**data)
    elif cat == "injection":
        return InjectionEvaluationCase(**data)
    elif cat == "conversation":
        return ConversationEvaluationCase(**data)
    else:
        raise ValueError(f"Unknown category: {cat}")

def load_evaluation_cases(filepath: str) -> List[Any]:
    with open(filepath, "r", encoding="utf-8") as f:
        raw_data = json.load(f)
    
    if isinstance(raw_data, list):
        cases_list = raw_data
    else:
        cases_list = raw_data.get("cases", [])
        
    seen_ids = set()
    loaded_cases = []
    for item in cases_list:
        case_id = item.get("case_id")
        if not case_id:
            raise ValueError("Evaluation case is missing case_id.")
        if case_id in seen_ids:
            raise ValueError(f"Duplicate case_id found: {case_id}")
        seen_ids.add(case_id)
        
        case = load_case_from_dict(item)
        loaded_cases.append(case)
        
    return loaded_cases
