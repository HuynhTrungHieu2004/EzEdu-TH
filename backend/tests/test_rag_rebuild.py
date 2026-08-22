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

    async def test_migrate_local_embedding_idempotent_and_keeps_legacy_vector(self):
        await self._them_doan(2, chieu=768)
        a, b, c = self._va()
        with a, b, c:
            first = await svc.migrate_embeddings_to_local()
            second = await svc.migrate_embeddings_to_local()

        docs = [doc async for doc in self.db["document_chunks"].find({})]
        self.assertEqual(first["migrated"], 2)
        self.assertEqual(second["migrated"], 2)
        self.assertTrue(all(len(doc["embedding"]) == 768 for doc in docs))
        self.assertTrue(all(len(doc["local_embedding"]) == svc.EMBEDDING_DIMENSION for doc in docs))
        self.assertEqual(len(self.chroma.collections[f"document_chunks_local_{svc.EMBEDDING_DIMENSION}d"]), 2)


if __name__ == "__main__":
    unittest.main()


class LuuVectorTests(unittest.IsolatedAsyncioTestCase):
    """Đường ghi chính phải lưu vector vào MongoDB, không chỉ vào ChromaDB.

    Thiếu bước này thì `rebuild_chroma_from_mongo()` chẳng dựng lại được gì:
    nó cố ý không nhúng lại, nên không có vector trong Mongo là bó tay. Cả tính
    năng nạp-lại trở thành đồ trang trí, và điều đó chỉ lộ ra sau một lần deploy
    khi hỏi đáp có trích dẫn im lặng không tìm được gì.
    """

    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["test_rag"]
        self.chroma = ChromaGia()

    async def test_add_document_chunks_luu_vector_vao_mongo(self):
        with patch.object(svc, "get_database", return_value=self.db), \
             patch.object(svc, "init_chroma_client", return_value=self.chroma), \
             patch.object(svc, "build_embeddings", return_value=("gemini", [[0.5] * 768, [0.6] * 768])):
            await svc.add_document_chunks("doc-1", "u1", ["đoạn một", "đoạn hai"])

        luu = [d async for d in self.db["document_chunks"].find({})]
        self.assertEqual(len(luu), 2)
        for d in luu:
            self.assertIn("embedding", d, "thiếu vector thì không dựng lại được sau khi deploy")
            self.assertEqual(len(d["embedding"]), 768)

    async def test_vector_luu_dung_thu_tu_tung_doan(self):
        """Gán nhầm vector của đoạn khác thì tìm kiếm trả về đoạn không liên
        quan, và lỗi đó rất khó nhận ra vì hệ thống vẫn chạy bình thường."""
        with patch.object(svc, "get_database", return_value=self.db), \
             patch.object(svc, "init_chroma_client", return_value=self.chroma), \
             patch.object(svc, "build_embeddings", return_value=("gemini", [[0.1] * 768, [0.9] * 768])):
            await svc.add_document_chunks("doc-1", "u1", ["đoạn một", "đoạn hai"])

        theo_index = {d["chunk_index"]: d for d in [x async for x in self.db["document_chunks"].find({})]}
        self.assertAlmostEqual(theo_index[0]["embedding"][0], 0.1)
        self.assertAlmostEqual(theo_index[1]["embedding"][0], 0.9)

    async def test_ghi_roi_nap_lai_duoc_ngay(self):
        """Đường đi trọn vẹn: lập chỉ mục, mất Chroma, nạp lại từ Mongo."""
        with patch.object(svc, "get_database", return_value=self.db), \
             patch.object(svc, "init_chroma_client", return_value=self.chroma), \
             patch.object(svc, "build_embeddings", return_value=("gemini", [[0.5] * 768] * 3)):
            await svc.add_document_chunks("doc-1", "u1", ["a", "b", "c"])

        self.chroma.collections.clear()  # container mới, ổ đĩa trắng

        with patch.object(svc, "get_database", return_value=self.db), \
             patch.object(svc, "init_chroma_client", return_value=self.chroma), \
             patch.object(svc, "_managed_collection_names", side_effect=lambda c: list(c.collections.keys())), \
             patch.object(svc, "get_embeddings") as nhung:
            kq = await svc.rebuild_chroma_if_empty()

        self.assertEqual(kq["restored"], 3)
        nhung.assert_not_called()
