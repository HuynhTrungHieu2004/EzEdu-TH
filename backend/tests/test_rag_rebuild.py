"""Nạp lại kho vector từ MongoDB sau khi container mất ổ đĩa.

Gói miễn phí của Render không có ổ đĩa bền: mỗi lần deploy là container mới và
thư mục Chroma trắng trơn. Trước đây phải lập chỉ mục lại toàn bộ học liệu bằng
tay, và hỏi đáp có trích dẫn im lặng không tìm được gì cho tới khi ai đó thử.
"""

import unittest
from unittest.mock import patch

from mongomock_motor import AsyncMongoMockClient

from app.services import rag_service as svc


class ChromaGia:
    """Chroma giả tối thiểu: nhớ những gì được upsert, đếm được."""

    def __init__(self):
        self.collections: dict[str, dict] = {}

    # --- API mà rag_service dùng ---
    def get_or_create_collection(self, name, **kwargs):
        return _CollectionGia(self.collections.setdefault(name, {}))

    def get_collection(self, name):
        return _CollectionGia(self.collections.setdefault(name, {}))

    def list_collections(self):
        return list(self.collections.keys())


class _CollectionGia:
    def __init__(self, kho: dict):
        self.kho = kho

    def upsert(self, ids, documents, embeddings, metadatas):
        for i, _id in enumerate(ids):
            self.kho[_id] = {
                "document": documents[i],
                "embedding": embeddings[i],
                "metadata": metadatas[i],
            }

    def count(self):
        return len(self.kho)


class RebuildTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["test_rag"]
        self.chroma = ChromaGia()

    def _va(self):
        """Thay MongoDB và Chroma bằng bản giả."""
        return (
            patch.object(svc, "get_database", return_value=self.db),
            patch.object(svc, "init_chroma_client", return_value=self.chroma),
            patch.object(svc, "_managed_collection_names", side_effect=lambda c: list(c.collections.keys())),
        )

    async def _them_doan(self, so_luong: int, *, co_vector: bool = True, chieu: int = 768):
        for i in range(so_luong):
            doc = {
                "document_id": f"doc-{i}",
                "user_id": "u1",
                "chunk_index": 0,
                "content": f"nội dung {i}",
                "text_preview": f"nội dung {i}",
            }
            if co_vector:
                doc["embedding"] = [0.1] * chieu
            await self.db["document_chunks"].insert_one(doc)

    async def test_nap_lai_du_so_doan(self):
        await self._them_doan(5)
        a, b, c = self._va()
        with a, b, c:
            kq = await svc.rebuild_chroma_from_mongo()
        self.assertEqual(kq["restored"], 5)
        self.assertEqual(sum(len(v) for v in self.chroma.collections.values()), 5)

    async def test_khong_goi_api_nhung(self):
        """Chốt quan trọng nhất.

        Nếu hàm này nhúng lại thì mỗi lần container khởi động sẽ đốt hạn mức
        Gemini, và Render free khởi động lại rất thường — cách đó tệ hơn cả việc
        để kho vector rỗng. Vector đã lưu sẵn trong `document_chunks`.
        """
        await self._them_doan(3)
        a, b, c = self._va()
        with a, b, c, \
             patch.object(svc, "get_embeddings") as nhung_nhieu, \
             patch.object(svc, "get_embedding") as nhung_mot:
            await svc.rebuild_chroma_from_mongo()

        nhung_nhieu.assert_not_called()
        nhung_mot.assert_not_called()

    async def test_doan_khong_co_vector_bi_bo_qua_chu_khong_nhung_lai(self):
        await self._them_doan(2, co_vector=True)
        await self._them_doan(2, co_vector=False)
        a, b, c = self._va()
        with a, b, c, patch.object(svc, "get_embeddings") as nhung:
            kq = await svc.rebuild_chroma_from_mongo()

        self.assertEqual(kq["restored"], 2)
        self.assertEqual(kq["skipped"], 2)
        nhung.assert_not_called()

    async def test_chay_hai_lan_khong_nhan_doi(self):
        """Id sinh theo `document_id:chunk_index` nên `upsert` ghi đè đúng chỗ."""
        await self._them_doan(4)
        a, b, c = self._va()
        with a, b, c:
            await svc.rebuild_chroma_from_mongo()
            await svc.rebuild_chroma_from_mongo()
        self.assertEqual(sum(len(v) for v in self.chroma.collections.values()), 4)

    async def test_vector_khac_chieu_vao_collection_khac(self):
        """Chroma từ chối vector lệch chiều với collection. Gộp chung là hỏng."""
        await self._them_doan(2, chieu=768)
        await self._them_doan(1, chieu=384)
        a, b, c = self._va()
        with a, b, c:
            await svc.rebuild_chroma_from_mongo()
        self.assertEqual(len(self.chroma.collections), 2, "hai số chiều phải nằm ở hai collection")

    async def test_chi_nap_khi_thieu(self):
        """Nạp lại mỗi lần khởi động sẽ ghi đè kho đang lành bằng chính nó — vô
        hại nhưng tốn thời gian khởi động một cách vô ích."""
        await self._them_doan(3)
        a, b, c = self._va()
        with a, b, c:
            await svc.rebuild_chroma_from_mongo()      # lần đầu: nạp đủ
            kq = await svc.rebuild_chroma_if_empty()   # lần hai: đã đủ, phải bỏ qua
        self.assertEqual(kq["restored"], 0)

    async def test_nap_khi_chroma_rong(self):
        await self._them_doan(3)
        a, b, c = self._va()
        with a, b, c:
            kq = await svc.rebuild_chroma_if_empty()
        self.assertEqual(kq["restored"], 3)

    async def test_dem_thay_duoc_kho_vector_mat(self):
        """`ping_chroma()` chỉ bắt tay nên báo "healthy" với kho rỗng trơn. Phép
        đếm này là thứ duy nhất nhìn ra sự cố."""
        await self._them_doan(4)
        a, b, c = self._va()
        with a, b, c:
            dem = await svc.dem_vector_va_doan()
        self.assertEqual(dem["mongo_chunks"], 4)
        self.assertEqual(dem["chroma_vectors"], 0, "chưa nạp thì Chroma phải rỗng")


if __name__ == "__main__":
    unittest.main()
