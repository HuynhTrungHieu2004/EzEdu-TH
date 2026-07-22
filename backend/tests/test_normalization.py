import unittest
from app.utils.normalization import normalize_title

class TestNormalization(unittest.TestCase):
    def test_unicode_normalization_and_lowercase(self):
        # NFC and NFD strings should result in the same normalized string
        title_nfc = "Học Liệu Tiếng Việt"
        title_nfd = "Học Liệu Tiếng Việt" # contains decomposed accents
        
        self.assertEqual(normalize_title(title_nfc), "hoc lieu tieng viet")
        self.assertEqual(normalize_title(title_nfd), "hoc lieu tieng viet")

    def test_accents_and_special_characters(self):
        # Test Vietnamese characters with accents, and Đ/đ
        self.assertEqual(normalize_title("Đại Học Quốc Gia"), "dai hoc quoc gia")
        self.assertEqual(normalize_title("đường đi bộ"), "duong di bo")
        self.assertEqual(normalize_title("LỚP HỌC MỚI"), "lop hoc moi")

    def test_whitespace_normalization(self):
        # Test leading/trailing spaces and multiple spaces
        self.assertEqual(normalize_title("   Học   liệu    mới   "), "hoc lieu moi")
        self.assertEqual(normalize_title("\tHọc\nliệu\r"), "hoc lieu")

    def test_empty_and_none(self):
        self.assertEqual(normalize_title(""), "")
        self.assertEqual(normalize_title(None), "")

    def test_special_metacharacters(self):
        # Normalization should keep alphanumeric and normal punctuation, lowercased
        self.assertEqual(normalize_title("Chat [AI] - (Gemini) * ?"), "chat [ai] - (gemini) * ?")
