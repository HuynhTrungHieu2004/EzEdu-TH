import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Skeleton } from './ui';

interface RoleRouteProps {
  /** Các vai trò được phép vào nhánh route này. */
  allow: string[];
  children: ReactNode;
}

/**
 * Chặn theo vai trò ở TẦNG ROUTE.
 *
 * Trước đây việc phân tách vai trò trên giao diện chỉ dựa vào việc ẩn nút trong
 * sidebar, nên gõ trực tiếp URL là vào được: học sinh mở được trang quản lý học
 * liệu, sinh đề và ngân hàng câu hỏi của giáo viên; giáo viên mở được các trang
 * học tập của học sinh rồi nhận 403 và thấy trang gần như trắng.
 * Xem docs/ui-redesign/01-audit-report.md §6.1 (lỗi C1, C2).
 *
 * Điểm quan trọng: khi vai trò không khớp thì KHÔNG render children, nên trang
 * trái phép không hiện ra dù chỉ trong tích tắc trước khi chuyển hướng.
 *
 * Đây vẫn là hàng rào cho trải nghiệm. Backend tiếp tục là nơi quyết định quyền
 * cuối cùng và vẫn trả 403 độc lập với lớp này.
 */
export default function RoleRoute({ allow, children }: RoleRouteProps) {
  const { status, role, homePath } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="ez-stack" style={{ padding: 'var(--ez-space-6)' }}>
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="1rem" width="70%" />
        <Skeleton height="12rem" />
        <span className="ez-sr-only" role="status">
          Đang kiểm tra quyền truy cập
        </span>
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (!role || !allow.includes(role)) {
    // Đưa về trang chủ của khu vực đúng với vai trò, không để trang trái phép lộ ra.
    return <Navigate to={homePath} replace state={{ deniedFrom: location.pathname }} />;
  }

  return <>{children}</>;
}
