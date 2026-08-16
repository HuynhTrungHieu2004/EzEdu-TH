"""Mục lục "Học theo môn" — gom học liệu đã công bố theo môn và chương."""

import unittest
from datetime import datetime, timezone

from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

from app.services.subject_catalog_service import (
    CHUA_PHAN_MON,
    build_catalog,
    validate_taxonomy_ids,
)


class CatalogTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["test_catalog"]
        self.toan = ObjectId()
        self.van = ObjectId()
        self.chuong1 = ObjectId()
        await self.db["curriculum_taxonomy"].insert_many([
            {"_id": self.toan, "node_type": "subject", "name": "Toán"},
            {"_id": self.van, "node_type": "subject", "name": "Ngữ văn"},
            {"_id": self.chuong1, "node_type": "chapter", "name": "Hàm số", "parent_id": str(self.toan)},
        ])

    async def _them_bo(self, **fields):
        doc = {
            "_id": ObjectId(),
            "document_id": "d1",
            "document_name": "Tài liệu",
            "question_count": 5,
            "created_at": datetime.now(timezone.utc),
        }
        doc.update(fields)
        await self.db["question_sets"].insert_one(doc)
        return doc

    async def test_gom_theo_mon_va_dem_dung(self):
        await self._them_bo(subject_id=str(self.toan), chapter_id=str(self.chuong1))
        await self._them_bo(subject_id=str(self.toan))
        await self._them_bo(subject_id=str(self.van))

        muc_luc = await build_catalog(self.db, {})

        theo_ten = {m["name"]: m for m in muc_luc}
        self.assertEqual(theo_ten["Toán"]["count"], 2)
        self.assertEqual(theo_ten["Ngữ văn"]["count"], 1)
        self.assertEqual(theo_ten["Toán"]["chapters"][0]["name"], "Hàm số")
        self.assertEqual(theo_ten["Toán"]["chapters"][0]["count"], 1)

    async def test_hoc_lieu_chua_gan_mon_van_hien_ra(self):
        """Chốt quan trọng nhất: mọi học liệu công bố TRƯỚC tính năng này đều
        chưa có môn. Bỏ chúng khỏi mục lục nghĩa là tính năng mới làm biến mất
        nội dung cũ khỏi tầm mắt học sinh."""
        await self._them_bo()                       # thiếu hẳn trường
        await self._them_bo(subject_id=None)        # trường None
        await self._them_bo(subject_id="")          # trường rỗng

        muc_luc = await build_catalog(self.db, {})

        chua = [m for m in muc_luc if m["id"] == CHUA_PHAN_MON]
        self.assertEqual(len(chua), 1)
        self.assertEqual(chua[0]["count"], 3, "cả ba dạng dữ liệu cũ đều phải gom về một nhóm")

    async def test_chua_phan_mon_luon_xep_cuoi(self):
        """Xếp theo tên như môn thường sẽ đẩy "Chưa phân môn" lên đầu vì chữ C,
        che mất các môn thật."""
        await self._them_bo()
        await self._them_bo(subject_id=str(self.van))

        muc_luc = await build_catalog(self.db, {})

        self.assertEqual(muc_luc[-1]["id"], CHUA_PHAN_MON)

    async def test_bo_loc_hien_thi_duoc_ton_trong(self):
        """Mục lục phải đếm đúng phạm vi học sinh được xem. Bỏ qua bộ lọc ở đây
        nghĩa là em ấy thấy tên môn và số lượng của đề lớp khác."""
        await self._them_bo(subject_id=str(self.toan), audience_type="all")
        await self._them_bo(subject_id=str(self.van), audience_type="classes")

        muc_luc = await build_catalog(self.db, {"audience_type": "all"})

        self.assertEqual([m["name"] for m in muc_luc], ["Toán"])

    async def test_muc_luc_rong_khi_khong_co_gi(self):
        self.assertEqual(await build_catalog(self.db, {}), [])


class ValidateTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.db = AsyncMongoMockClient()["test_catalog"]
        self.toan = ObjectId()
        self.van = ObjectId()
        self.chuong_toan = ObjectId()
        self.chu_de = ObjectId()
        await self.db["curriculum_taxonomy"].insert_many([
            {"_id": self.toan, "node_type": "subject", "name": "Toán"},
            {"_id": self.van, "node_type": "subject", "name": "Ngữ văn"},
            {"_id": self.chuong_toan, "node_type": "chapter", "name": "Hàm số", "parent_id": str(self.toan)},
            {"_id": self.chu_de, "node_type": "topic", "name": "Hàm bậc hai", "parent_id": str(self.chuong_toan)},
        ])

    async def test_cap_hop_le_duoc_chap_nhan(self):
        kq = await validate_taxonomy_ids(
            self.db, subject_id=str(self.toan), chapter_id=str(self.chuong_toan)
        )
        self.assertEqual(kq, (str(self.toan), str(self.chuong_toan)))

    async def test_khong_chon_gi_la_hop_le(self):
        self.assertEqual(await validate_taxonomy_ids(self.db, subject_id=None, chapter_id=None), (None, None))

    async def test_chuong_cua_mon_khac_bi_tu_choi(self):
        """Thiếu chốt này thì chương "Hàm số" của Toán nằm dưới Ngữ văn trong
        mục lục và không ai hiểu vì sao."""
        with self.assertRaises(ValueError) as ctx:
            await validate_taxonomy_ids(
                self.db, subject_id=str(self.van), chapter_id=str(self.chuong_toan)
            )
        self.assertIn("không thuộc môn", str(ctx.exception))

    async def test_id_sai_node_type_bi_tu_choi(self):
        """Gán id của một "chủ đề" vào ô môn học: nếu chỉ kiểm tồn tại thì lọt,
        và mục lục mọc ra một "môn" mang tên chủ đề."""
        with self.assertRaises(ValueError):
            await validate_taxonomy_ids(self.db, subject_id=str(self.chu_de), chapter_id=None)

    async def test_chon_chuong_ma_khong_chon_mon_bi_tu_choi(self):
        with self.assertRaises(ValueError):
            await validate_taxonomy_ids(self.db, subject_id=None, chapter_id=str(self.chuong_toan))

    async def test_id_khong_ton_tai_bi_tu_choi(self):
        with self.assertRaises(ValueError):
            await validate_taxonomy_ids(self.db, subject_id=str(ObjectId()), chapter_id=None)

    async def test_id_khong_phai_objectid_bi_tu_choi_khong_no_500(self):
        with self.assertRaises(ValueError):
            await validate_taxonomy_ids(self.db, subject_id="không-phải-id", chapter_id=None)


if __name__ == "__main__":
    unittest.main()
