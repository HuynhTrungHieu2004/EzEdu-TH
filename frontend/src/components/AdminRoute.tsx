import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { isAdminAreaRole } from '../utils/adminPermissions';
import { Skeleton } from './ui';

interface AdminRouteProps {
  children: ReactNode;
}

/**
 * Chặn khu vực quản trị.
 *
 * Đây là hàng rào cho trải nghiệm; backend vẫn là nơi quyết định quyền cuối cùng
 * và trả 403 độc lập với lớp này.
 *
 * Khác với bản trước: dùng AuthContext dùng chung thay vì tự gọi `/auth/me` lại
 * mỗi lần đổi route, và chuyển hướng bằng <Navigate> ngay trong lượt render thay
 * vì gọi navigate() trong useEffect — nhờ vậy trang quản trị không kịp render ra
 * trước khi bị chuyển đi.
 */
export default function AdminRoute({ children }: AdminRouteProps) {
  const { status, role, homePath } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="ez-stack" style={{ padding: 'var(--ez-space-6)' }}>
        <Skeleton height="2rem" width="40%" />
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

  if (!isAdminAreaRole(role)) {
    return <Navigate to={homePath} replace state={{ deniedFrom: location.pathname }} />;
  }

  return <>{children}</>;
}
