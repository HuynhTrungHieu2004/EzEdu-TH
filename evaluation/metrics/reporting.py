import os
import json
import subprocess
from datetime import datetime, timezone
from typing import Dict, Any

def get_git_commit_hash() -> str:
    try:
        res = subprocess.run(
            ["git", "rev-parse", "short", "HEAD"],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            check=True
        )
        return res.stdout.strip()
    except Exception:
        return "unknown"

def generate_evaluation_reports(
    report_data: Dict[str, Any],
    output_dir: str
) -> Dict[str, str]:
    """
    Generates JSON and Markdown report files.
    """
    os.makedirs(output_dir, exist_ok=True)
    
    timestamp = datetime.now(timezone.utc).isoformat()
    commit_hash = get_git_commit_hash()
    
    report_data["timestamp"] = timestamp
    report_data["commit_hash"] = commit_hash
    
    # Paths
    json_path = os.path.join(output_dir, "report_latest.json")
    md_path = os.path.join(output_dir, "report_latest.md")
    
    # 1. Write JSON (excluding sensitive configs)
    clean_report = report_data.copy()
    if "secrets" in clean_report:
        del clean_report["secrets"]
    if "system_prompt" in clean_report:
        del clean_report["system_prompt"]
        
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(clean_report, f, indent=2, ensure_ascii=False)
        
    # 2. Write Markdown
    passed_emoji = "✅ PASS" if clean_report.get("passed", False) else "❌ FAIL"
    
    md_content = f"""# BÁO CÁO ĐÁNH GIÁ CHẤT LƯỢNG AI & RAG

* **Trạng thái**: {passed_emoji}
* **Thời gian chạy**: {timestamp}
* **Git Commit**: {commit_hash}
* **Dataset Version**: {clean_report.get("dataset_version", "1.0.0")}
* **Fixtures Version**: {clean_report.get("fixtures_version", "1.0.0")}
* **Chế độ**: {"Live API" if clean_report.get("live_mode", False) else "Offline (Mock)"}
* **LLM Model**: {clean_report.get("llm_model", "local")}
* **Embedding Model**: {clean_report.get("embedding_model", "local")}

---

## 📊 KẾT QUẢ CÁC THÀNH PHẦN

"""
    # Summary of categories
    md_content += "| Thành phần | Tổng số Case | Đạt (Pass) | Thất bại (Fail) | Tỷ lệ đạt | Ngưỡng yêu cầu |\n"
    md_content += "| :--- | :---: | :---: | :---: | :---: | :---: |\n"
    
    categories = clean_report.get("categories", {})
    for cat_name, info in categories.items():
        total = info.get("total", 0)
        passed = info.get("passed", 0)
        failed = info.get("failed", 0)
        rate = (passed / total) if total > 0 else 1.0
        threshold = info.get("threshold", 0.0)
        md_content += f"| {cat_name} | {total} | {passed} | {failed} | {rate:.1%} | {threshold:.1%} |\n"
        
    md_content += "\n---\n\n## 🚨 CHI TIẾT CÁC CA THẤT BẠI / CẢNH BÁO\n\n"
    
    failed_cases = clean_report.get("failed_cases_details", [])
    if not failed_cases:
        md_content += "*Không có ca thất bại nào.*\n"
    else:
        for fc in failed_cases:
            md_content += f"### {fc.get('case_id')} ({fc.get('category')})\n"
            md_content += f"* **Câu hỏi**: {fc.get('question')}\n"
            md_content += f"* **Lý do**: {fc.get('reason')}\n\n"
            
    md_content += """
---
## 💡 Hạn chế của Benchmark hiện tại
1. Số lượng ca test còn nhỏ để kiểm soát độ chính xác tối ưu.
2. Đánh giá chất lượng live LLM judge chỉ đóng vai trò tham khảo bổ sung.
"""

    with open(md_path, "w", encoding="utf-8") as f:
        f.write(md_content)
        
    return {
        "json": json_path,
        "markdown": md_path
    }
