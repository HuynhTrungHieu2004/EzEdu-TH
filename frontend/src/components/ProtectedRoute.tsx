import { Navigate, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Skeleton } from './ui';

interface ProtectedRouteProps {
  children: ReactNode;
}

/**
 * Chỉ kiểm tra đã đăng nhập hay chưa — KHÔNG kiểm tra vai trò.
 * Dùng cho route mà mọi người dùng đã đăng nhập đều được vào (ví dụ /dashboard).
 * Route cần phân tách vai trò phải dùng RoleRoute.
 */
export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return (
      <div className="ez-stack" style={{ padding: 'var(--ez-space-6)' }}>
        <Skeleton height="2rem" width="40%" />
        <Skeleton height="12rem" />
        <span className="ez-sr-only" role="status">
          Đang tải
        </span>
      </div>
    );
  }

  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
