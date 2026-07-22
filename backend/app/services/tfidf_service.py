"""
TF-IDF Keyword Extraction Service
===================================
Sử dụng thuật toán TF-IDF (Term Frequency - Inverse Document Frequency) từ scikit-learn
để trích xuất từ khóa trọng tâm của tài liệu.

Thuật toán TF-IDF hoạt động bằng cách:
- TF (Term Frequency): Đo tần suất xuất hiện của từ trong đoạn văn bản
- IDF (Inverse Document Frequency): Đo mức độ đặc biệt của từ trong toàn bộ tập corpus
- TF-IDF = TF * IDF → Từ có điểm cao = xuất hiện nhiều TRONG tài liệu nhưng HIẾM trong corpus chung
"""

import logging
import re
from typing import List, Dict

from sklearn.feature_extraction.text import TfidfVectorizer

logger = logging.getLogger(__name__)

# Vietnamese stop words (common words that don't carry meaning)
VIETNAMESE_STOP_WORDS = {
    "và", "của", "là", "có", "được", "trong", "để", "các", "cho", "với",
    "này", "đó", "theo", "từ", "một", "những", "không", "khi", "đã",
    "sẽ", "thì", "cũng", "như", "về", "do", "hay", "hoặc", "nhưng",
    "mà", "nên", "vì", "bởi", "tại", "đến", "hơn", "rất", "lại",
    "còn", "nếu", "thì", "bị", "ra", "vào", "lên", "xuống", "nào",
    "đây", "đấy", "kia", "ấy", "bao", "giờ", "bao nhiêu", "tất cả",
    "mỗi", "mọi", "ai", "gì", "sao", "đâu", "nơi", "tuy", "dù",
    "mặc dù", "tuy nhiên", "nhờ", "qua", "trên", "dưới", "giữa",
    "trước", "sau", "ngoài", "quá", "rồi", "vậy", "thế", "chỉ",
    "cần", "phải", "nữa", "vừa", "đang", "chưa", "luôn", "luôn luôn",
    "thường", "hay", "nhiều", "ít", "hết", "cả", "toàn", "riêng",
    "chung", "khác", "cùng", "giống", "bằng", "hơn", "nhất", "rằng",
}


def _tokenize_vietnamese(text: str) -> List[str]:
    """
    Tách từ tiếng Việt đơn giản bằng regex.
    Xử lý cả bigram (2 từ liền) để bắt các cụm từ quan trọng.
    """
    # Normalize
    text = text.lower().strip()
    # Extract words (Vietnamese words can include diacritics)
    words = re.findall(r'[a-záàảãạăắằẳẵặâấầẩẫậéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵđ]+', text)
    # Filter stop words and short words
    filtered = [w for w in words if w not in VIETNAMESE_STOP_WORDS and len(w) > 1]
    return filtered


def extract_keywords(chunks: List[str], top_n: int = 15) -> List[Dict[str, float]]:
    """
    Trích xuất từ khóa trọng tâm từ danh sách text chunks sử dụng thuật toán TF-IDF.

    Args:
        chunks: Danh sách các đoạn văn bản (text chunks) của tài liệu
        top_n: Số lượng từ khóa cần trích xuất (mặc định 15)

    Returns:
        Danh sách từ khóa kèm điểm TF-IDF, sắp xếp giảm dần theo điểm:
        [{"keyword": "quang hợp", "score": 0.85}, ...]
    """
    if not chunks:
        return []

    try:
        # Preprocess: join chunks but keep them separate as "documents" for IDF calculation
        # Use both unigrams and bigrams to capture compound terms
        # When there are few chunks, max_df must be 1.0 to avoid "max_df < min_df" error
        effective_max_df = 1.0 if len(chunks) <= 3 else 0.95
        vectorizer = TfidfVectorizer(
            analyzer='word',
            tokenizer=_tokenize_vietnamese,
            ngram_range=(1, 2),  # Unigrams and bigrams
            max_features=500,
            min_df=1,
            max_df=effective_max_df,
            sublinear_tf=True,  # Apply log normalization to TF
        )

        tfidf_matrix = vectorizer.fit_transform(chunks)
        feature_names = vectorizer.get_feature_names_out()

        # Aggregate TF-IDF scores across all chunks (sum of scores per term)
        scores = tfidf_matrix.sum(axis=0).A1  # Convert sparse matrix to dense array

        # Create keyword-score pairs and sort
        keyword_scores = []
        for idx, score in enumerate(scores):
            keyword = feature_names[idx]
            # Skip single-character terms
            if len(keyword) <= 1:
                continue
            keyword_scores.append({
                "keyword": keyword,
                "score": round(float(score), 4)
            })

        # Sort by score descending and take top_n
        keyword_scores.sort(key=lambda x: x["score"], reverse=True)
        result = keyword_scores[:top_n]

        logger.info(f"📊 TF-IDF extracted {len(result)} keywords from {len(chunks)} chunks")
        if result:
            logger.info(f"   Top keywords: {', '.join([kw['keyword'] for kw in result[:5]])}")

        return result

    except Exception as e:
        logger.error(f"TF-IDF extraction failed: {e}")
        return []


def extract_keywords_from_text(text: str, top_n: int = 15) -> List[Dict[str, float]]:
    """
    Convenience wrapper: extract keywords from a single block of text.
    Splits the text into paragraphs to create the IDF corpus.
    """
    if not text or not text.strip():
        return []

    # Split into paragraphs as pseudo-documents
    paragraphs = [p.strip() for p in text.split('\n\n') if p.strip() and len(p.strip()) > 20]
    if not paragraphs:
        paragraphs = [text]

    return extract_keywords(paragraphs, top_n)
