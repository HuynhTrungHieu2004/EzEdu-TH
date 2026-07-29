"""Sinh nhiều mã đề tương đương: đảo thứ tự câu hỏi + đảo đáp án an toàn.

Nguyên tắc bắt buộc:
- Giữ mức độ và tổng điểm tương đương giữa các mã đề — KHÔNG đổi tập câu hỏi
  đã chọn, chỉ đổi THỨ TỰ hiển thị và nhãn đáp án (A/B/C/D).
- Có seed để tái tạo lại đúng — dùng `random.Random(seed)` cục bộ, không
  dùng global random state (an toàn khi nhiều mã đề sinh đồng thời).
- Chỉ đảo đáp án cho `multiple_choice` (có `options` dạng {A:..,B:..,...}).
  KHÔNG đảo `true_false`/`short_answer` — đảo không có ý nghĩa (true_false
  không có nhãn để đảo theo cách làm sai lệch nội dung, short_answer không
  có options).
- Sau khi đảo, `correct_answer` của mã đề phải trỏ đúng nhãn MỚI ứng với
  cùng nội dung đáp án đúng ban đầu — kiểm chứng bằng test so khớp nội dung.
- Lưu `option_shuffle` (nhãn mới → nhãn gốc) để truy vết — không sửa/nhân
  bản nội dung gốc trong ngân hàng câu hỏi.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional


@dataclass
class ShuffledCode:
    question_order: List[str]  # question_id theo thứ tự hiển thị cho mã đề này
    option_shuffle: Dict[str, Dict[str, str]] = field(default_factory=dict)  # question_id -> {new_letter: old_letter}


def generate_equivalent_codes(
    *,
    question_ids: List[str],
    questions_by_id: Dict[str, Dict[str, Any]],
    code_count: int,
    seed: Optional[int] = None,
) -> List[ShuffledCode]:
    """Sinh `code_count` mã đề tương đương từ CÙNG một tập `question_ids` đã
    được CP-SAT chọn. `questions_by_id[qid]` cần có `question_type` và
    `options` (dict) để biết câu nào được phép đảo đáp án.
    """
    base_seed = seed if seed is not None else random.SystemRandom().randrange(1, 2**31 - 1)
    codes: List[ShuffledCode] = []

    for code_index in range(code_count):
        rng = random.Random(f"{base_seed}:{code_index}")

        order = list(question_ids)
        rng.shuffle(order)

        option_shuffle: Dict[str, Dict[str, str]] = {}
        for qid in order:
            question = questions_by_id.get(qid, {})
            if question.get("question_type") != "multiple_choice":
                continue
            options = question.get("options")
            if not options:
                continue

            original_letters = list(options.keys())
            shuffled_letters = list(original_letters)
            rng.shuffle(shuffled_letters)

            # new_letter -> old_letter: vị trí thứ k trong original_letters
            # (nhãn cũ, theo thứ tự bảng chữ cái) nhận nội dung của
            # shuffled_letters[k] (nhãn cũ tương ứng nội dung được xáo tới đó).
            option_shuffle[qid] = dict(zip(original_letters, shuffled_letters))

        codes.append(ShuffledCode(question_order=order, option_shuffle=option_shuffle))

    return codes


def apply_shuffle_to_question(
    question: Dict[str, Any], option_shuffle_for_question: Optional[Dict[str, str]]
) -> Dict[str, Any]:
    """Trả về (options mới, correct_answer mới) sau khi áp dụng đảo cho MỘT
    câu hỏi cụ thể trong MỘT mã đề cụ thể — không sửa `question` gốc.
    """
    if not option_shuffle_for_question or question.get("question_type") != "multiple_choice":
        return {"options": question.get("options"), "correct_answer": question.get("correct_answer")}

    original_options = question.get("options") or {}
    correct_letter = question.get("correct_answer")
    correct_text = original_options.get(correct_letter)

    new_options = {
        new_letter: original_options[old_letter]
        for new_letter, old_letter in option_shuffle_for_question.items()
        if old_letter in original_options
    }

    # Đáp án đúng của mã đề này = nhãn MỚI có nội dung trùng đáp án đúng gốc.
    new_correct_answer = next(
        (new_letter for new_letter, text in new_options.items() if text == correct_text),
        correct_letter,  # phòng thủ: không tìm thấy thì giữ nguyên (không nên xảy ra nếu shuffle đúng)
    )

    return {"options": new_options, "correct_answer": new_correct_answer}
