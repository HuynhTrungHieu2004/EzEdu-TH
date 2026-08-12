"""Ghép Content-Based Filtering với K-Means.

Hai thuật toán bù đúng nhược điểm của nhau: **K-Means lo độ phủ, CBF lo độ
chính xác cá nhân**. Mô-đun này cài hai cách ghép có giá trị thật.

**Cách A — cụm thu hẹp, CBF xếp hạng.** CBF thuần phải tính cosine với toàn bộ
N item. Dùng nhãn cụm K-Means để chọn trước vài cụm gần hồ sơ người học nhất,
rồi chỉ xếp hạng trong đó: chi phí từ `O(N)` xuống `O(k + N·c/k)` với c là số
cụm được chọn.

> **Đã cài và đo, nhưng CỐ TÌNH CHƯA NỐI vào luồng chạy.** Đo thực tế (vector
> 384 chiều, 8 cụm, chọn 2 cụm):
>
> | N item | CBF toàn bộ | Cụm rồi CBF | Tỉ lệ |
> |---|---|---|---|
> | 1.000 | 36.8ms | 9.4ms | 3.91× |
> | 5.000 | 182.1ms | 47.1ms | 3.87× |
> | 20.000 | 738.3ms | 184.8ms | 3.99× |
>
> Con số trên chỉ đạt được khi tâm cụm được **tính sẵn**. Nếu tính lại tâm cụm
> trong mỗi lượt gợi ý thì cách này **chậm hơn** cách thường 15–25%, vì bước
> dựng tâm cụm cũng phải quét hết N item và cộng vector 384 chiều — tốn ngang
> việc chấm điểm toàn bộ.
>
> Kho học liệu hiện giới hạn 1.000 item mỗi lượt, tức tiết kiệm khoảng 27ms.
> Chưa đủ để đánh đổi lấy một tầng cache tâm cụm kèm rủi ro dữ liệu cũ khi mô
> hình phân cụm được huấn luyện lại. Các hàm ở đây đã có test đầy đủ, sẵn sàng
> nối khi quy mô kho học liệu đủ lớn.

Lưu ý về không gian: tâm cụm lưu trong `cluster_models` nằm ở **không gian đặc
trưng đã trộn và chuẩn hoá** (embedding × 0.7 + khối số × 0.3, đã z-score), nên
không so cosine trực tiếp với vector hồ sơ được. Ở đây tâm cụm được tính lại
**trong chính không gian embedding** bằng trung bình embedding các thành viên
cụm — vẫn dùng đúng cách phân hoạch của K-Means, chỉ đổi hệ quy chiếu để phép
đo có nghĩa.

**Cách B — chống bong bóng lọc.** Đây là nhược điểm cố hữu của CBF: chỉ gợi ý
thứ giống cái đã học, nên người học bị nhốt trong một vùng kiến thức và không
bao giờ gặp chủ đề mới. Nhãn cụm cho biết "vùng nào người này chưa chạm tới",
nhờ đó ép được ít nhất một item thuộc vùng mới vào top-N.

Cơ chế `RERANK_MAX_SAME_QUESTION_CLUSTER` sẵn có chỉ chặn item **liên tiếp**
cùng cụm — đó là giãn cách, không phải phủ: một top-10 vẫn có thể chỉ gồm hai
cụm xen kẽ nhau. Cách B bổ sung đúng chiều còn thiếu.
"""

from __future__ import annotations

from typing import Any, Dict, Iterable, List, Optional, Sequence, Set

from app.personalization.services.content_based_filtering_service import cosine_similarity


def _cluster_of(item: Dict[str, Any]) -> Optional[Any]:
    cluster = item.get("question_cluster_id")
    if cluster is None:
        cluster = item.get("content_cluster_id")
    return cluster


def touched_clusters(
    events: Iterable[Dict[str, Any]],
    items_by_id: Dict[str, Dict[str, Any]],
) -> Set[Any]:
    """Các cụm mà người học đã từng chạm tới."""
    touched: Set[Any] = set()
    for event in events:
        item = items_by_id.get(str(event.get("item_id")))
        if not item:
            continue
        cluster = _cluster_of(item)
        if cluster is not None:
            touched.add(cluster)
    return touched


def build_cluster_embedding_centroids(
    items: Sequence[Dict[str, Any]],
) -> Dict[Any, List[float]]:
    """Tâm cụm tính lại trong không gian embedding.

    Dùng đúng cách phân hoạch của K-Means (nhãn `*_cluster_id`) nhưng đổi hệ
    quy chiếu sang không gian embedding để so cosine với vector hồ sơ người học
    có nghĩa.
    """
    sums: Dict[Any, List[float]] = {}
    counts: Dict[Any, int] = {}

    for item in items:
        cluster = _cluster_of(item)
        embedding = item.get("semantic_embedding") or []
        if cluster is None or not embedding:
            continue
        if cluster not in sums:
            sums[cluster] = [0.0] * len(embedding)
            counts[cluster] = 0
        elif len(embedding) != len(sums[cluster]):
            continue
        for index, value in enumerate(embedding):
            sums[cluster][index] += float(value)
        counts[cluster] += 1

    return {
        cluster: [value / counts[cluster] for value in vector]
        for cluster, vector in sums.items()
        if counts[cluster] > 0
    }


def select_nearest_clusters(
    profile_vector: Sequence[float],
    centroids: Dict[Any, List[float]],
    *,
    limit: int = 2,
) -> List[Any]:
    """Chọn `limit` cụm gần hồ sơ người học nhất.

    Không có hồ sơ thì trả rỗng — tầng gọi phải hiểu là "không thu hẹp", tuyệt
    đối không được hiểu thành "không cụm nào phù hợp" rồi lọc sạch ứng viên.
    """
    if not profile_vector or not centroids or limit <= 0:
        return []
    ranked = sorted(
        centroids.items(),
        key=lambda entry: cosine_similarity(profile_vector, entry[1]),
        reverse=True,
    )
    return [cluster for cluster, _ in ranked[:limit]]


def ensure_cluster_exploration(
    ranked_items: List[Dict[str, Any]],
    pool: Sequence[Dict[str, Any]],
    *,
    touched: Set[Any],
    top_n: int,
) -> List[Dict[str, Any]]:
    """Đảm bảo top-N có ít nhất một item thuộc cụm người học chưa chạm tới.

    Giữ nguyên item điểm cao nhất ở đầu — thăm dò không được đánh đổi bằng việc
    đẩy gợi ý tốt nhất xuống. Item được đề lên thay vào vị trí cuối của top-N,
    và độ dài danh sách không đổi.
    """
    if top_n <= 1 or not ranked_items:
        return ranked_items

    head = ranked_items[:top_n]
    if any(_cluster_of(item) not in touched for item in head):
        return ranked_items

    head_ids = {str(item.get("_id")) for item in head}
    explorers = [
        item
        for item in pool
        if _cluster_of(item) is not None
        and _cluster_of(item) not in touched
        and str(item.get("_id")) not in head_ids
    ]
    if not explorers:
        return ranked_items

    # `pool` đã theo thứ tự điểm giảm dần ở tầng gọi; vẫn sắp lại theo `score`
    # khi có để không phụ thuộc ngầm vào thứ tự đầu vào.
    explorers.sort(key=lambda item: float(item.get("score") or 0.0), reverse=True)
    promoted = explorers[0]

    result = list(ranked_items)
    replaced_index = top_n - 1
    dropped = result[replaced_index]
    result[replaced_index] = promoted
    # Item bị đẩy khỏi top-N vẫn giữ lại ngay sau đó thay vì mất hẳn.
    if promoted in result[top_n:]:
        result.remove(promoted)
        result.insert(top_n, dropped)
    else:
        result.insert(top_n, dropped)
        result.pop()
    return result


def ensure_cluster_exploration_for_entries(
    entries: List[Dict[str, Any]],
    *,
    touched: Set[Any],
    top_n: int,
) -> List[Dict[str, Any]]:
    """Bản dùng cho luồng xếp hạng, nơi mỗi phần tử là một "entry".

    Entry có dạng `{"item": {...}, "final_score": float, ...}`. Logic giống hệt
    bản trên, chỉ khác chỗ lấy cụm và điểm.
    """
    if top_n <= 1 or not entries:
        return entries

    def cluster_of_entry(entry: Dict[str, Any]) -> Optional[Any]:
        return _cluster_of(entry.get("item") or {})

    head = entries[:top_n]
    if any(cluster_of_entry(entry) not in touched for entry in head):
        return entries

    head_ids = {id(entry) for entry in head}
    explorers = [
        entry
        for entry in entries[top_n:]
        if cluster_of_entry(entry) is not None
        and cluster_of_entry(entry) not in touched
        and id(entry) not in head_ids
    ]
    if not explorers:
        return entries

    explorers.sort(key=lambda entry: float(entry.get("final_score") or 0.0), reverse=True)
    promoted = explorers[0]

    result = list(entries)
    result.remove(promoted)
    dropped = result[top_n - 1]
    result[top_n - 1] = promoted
    result.insert(top_n, dropped)
    return result
