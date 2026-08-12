import unittest

from app.personalization.algorithms.kmeans_clustering import flag_distance_outliers


class FlagDistanceOutliersTests(unittest.TestCase):
    def test_single_extreme_point_is_not_masked_by_its_own_spread(self):
        """Hiệu ứng che lấp: dùng trung bình/độ lệch chuẩn thì điểm lệch nhất
        tự thổi phồng ngưỡng và lọt lưới. Median/MAD không bị vậy."""
        distances = [3.17, 3.68, 3.88, 4.48, 16.69, 17.21, 19.00, 51.33]

        flags = flag_distance_outliers(distances, multiplier=2.5)

        self.assertEqual(flags, [False, False, False, False, False, False, False, True])

    def test_tight_cluster_flags_nobody(self):
        flags = flag_distance_outliers([5.0, 5.1, 4.9, 5.2, 4.8], multiplier=2.5)

        self.assertNotIn(True, flags)

    def test_identical_distances_flag_nobody(self):
        flags = flag_distance_outliers([7.0] * 6, multiplier=2.5)

        self.assertEqual(flags, [False] * 6)

    def test_only_points_above_the_centre_are_flagged(self):
        """Gần tâm cụm là tốt — không bao giờ bị coi là bất thường."""
        distances = [0.0, 9.0, 10.0, 10.0, 11.0, 12.0]

        flags = flag_distance_outliers(distances, multiplier=1.0)

        self.assertFalse(flags[0])

    def test_handles_too_few_points(self):
        self.assertEqual(flag_distance_outliers([], multiplier=2.5), [])
        self.assertEqual(flag_distance_outliers([4.2], multiplier=2.5), [False])

    def test_falls_back_when_mad_is_zero_but_spread_exists(self):
        """Quá nửa số điểm trùng nhau khiến MAD = 0; vẫn phải bắt được điểm lệch."""
        distances = [5.0, 5.0, 5.0, 5.0, 5.0, 90.0]

        flags = flag_distance_outliers(distances, multiplier=2.5)

        self.assertTrue(flags[-1])
        self.assertNotIn(True, flags[:-1])


if __name__ == "__main__":
    unittest.main()
