import unittest

from app.services.document_duplicate_service import (
    NEAR_DUPLICATE_THRESHOLD,
    find_near_duplicates,
)

GOC = (
    "Hàm số bậc hai có dạng y bằng a x bình phương cộng b x cộng c với a khác không. "
    "Đồ thị của hàm số bậc hai là một đường parabol có đỉnh và trục đối xứng. "
    "Parabol quay bề lõm lên trên khi hệ số a dương và quay xuống dưới khi a âm."
)

# Cùng nội dung, chỉ đổi vài chữ và thêm một câu — kiểu bản sửa hoặc xuất lại file.
GAN_TRUNG = (
    "Hàm số bậc hai có dạng y bằng a x bình phương cộng b x cộng c với a khác không. "
    "Đồ thị của hàm số bậc hai là một đường parabol có đỉnh và trục đối xứng rõ ràng. "
    "Parabol quay bề lõm lên trên khi hệ số a dương và quay xuống dưới khi a âm. "
    "Phần này bổ sung thêm một câu ghi chú nhỏ."
)

# Cùng môn, cùng chủ đề lớn, nhưng nội dung khác hẳn.
CUNG_MON_KHAC_BAI = (
    "Phương trình lượng giác cơ bản gồm sin x bằng m và cos x bằng m. "
    "Điều kiện có nghiệm là trị tuyệt đối của m không vượt quá một. "
    "Công thức nghiệm tổng quát cộng thêm k hai pi với k là số nguyên."
)

KHAC_MON = (
    "Chiến dịch Điện Biên Phủ năm 1954 kết thúc thắng lợi. "
    "Hiệp định Genève được ký kết, chấm dứt chiến tranh Đông Dương. "
    "Đây là mốc son trong lịch sử dân tộc Việt Nam."
)


class FindNearDuplicatesTests(unittest.TestCase):
    def test_near_identical_document_is_flagged(self):
        found = find_near_duplicates(GOC, [("d2", GAN_TRUNG)])

        self.assertEqual(len(found), 1)
        self.assertEqual(found[0]["document_id"], "d2")
        self.assertGreaterEqual(found[0]["similarity"], NEAR_DUPLICATE_THRESHOLD)

    def test_same_subject_different_lesson_is_not_flagged(self):
        """Cùng môn không phải là trùng — nếu chặn ở đây thì giáo viên không
        tải nổi bộ bài giảng cùng chương."""
        found = find_near_duplicates(GOC, [("d2", CUNG_MON_KHAC_BAI)])

        self.assertEqual(found, [])

    def test_unrelated_document_is_not_flagged(self):
        found = find_near_duplicates(GOC, [("d2", KHAC_MON)])

        self.assertEqual(found, [])

    def test_results_are_sorted_by_similarity_descending(self):
        found = find_near_duplicates(
            GOC,
            [("khac", KHAC_MON), ("gan", GAN_TRUNG), ("cung_mon", CUNG_MON_KHAC_BAI)],
            threshold=0.0,
        )

        scores = [item["similarity"] for item in found]
        self.assertEqual(scores, sorted(scores, reverse=True))
        self.assertEqual(found[0]["document_id"], "gan")

    def test_threshold_is_respected(self):
        loose = find_near_duplicates(GOC, [("d2", CUNG_MON_KHAC_BAI)], threshold=0.0)
        strict = find_near_duplicates(GOC, [("d2", CUNG_MON_KHAC_BAI)], threshold=0.99)

        self.assertEqual(len(loose), 1)
        self.assertEqual(strict, [])

    def test_limit_caps_the_number_of_results(self):
        others = [(f"d{i}", GAN_TRUNG) for i in range(5)]

        found = find_near_duplicates(GOC, others, limit=2)

        self.assertEqual(len(found), 2)

    def test_empty_inputs_are_handled(self):
        self.assertEqual(find_near_duplicates("", [("d2", GAN_TRUNG)]), [])
        self.assertEqual(find_near_duplicates(GOC, []), [])

    def test_blank_candidate_text_is_skipped(self):
        found = find_near_duplicates(GOC, [("d2", "   "), ("d3", GAN_TRUNG)])

        self.assertEqual([item["document_id"] for item in found], ["d3"])

    def test_similarity_is_within_zero_and_one(self):
        found = find_near_duplicates(
            GOC, [("a", GAN_TRUNG), ("b", KHAC_MON)], threshold=0.0
        )

        for item in found:
            self.assertGreaterEqual(item["similarity"], 0.0)
            self.assertLessEqual(item["similarity"], 1.0)


if __name__ == "__main__":
    unittest.main()
