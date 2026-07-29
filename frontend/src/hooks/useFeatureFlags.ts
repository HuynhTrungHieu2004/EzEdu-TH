import { useEffect, useState } from 'react';
import { fetchPublicRuntimeConfig } from '../api/systemSettingsApi';

/**
 * Đọc feature flag công khai từ `GET /api/v1/runtime-config`.
 *
 * Cần thiết để navigation không hiện mục dẫn tới trang chắc chắn trả 403.
 * Ví dụ thực tế: `enable_personalization` đang tắt ở môi trường hiện tại, nhưng
 * mục "Cá nhân hóa" vẫn nằm trong sidebar học sinh và mở ra một trang trắng.
 * Xem docs/ui-redesign/01-audit-report.md §4.4.
 *
 * Trong lúc chưa tải xong, mọi flag coi như TẮT — thà thiếu một mục trong nav
 * vài trăm milli giây còn hơn hiện một mục rồi mới ẩn đi.
 */
export function useFeatureFlags(): {
  flags: Record<string, boolean>;
  loading: boolean;
  isEnabled: (key: string) => boolean;
} {
  const [flags, setFlags] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchPublicRuntimeConfig(controller.signal)
      .then((config) => {
        setFlags(config.feature_flags ?? {});
        setLoading(false);
      })
      .catch(() => {
        // Không chặn giao diện khi không đọc được cấu hình.
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  return {
    flags,
    loading,
    isEnabled: (key: string) => flags[key] === true,
  };
}
