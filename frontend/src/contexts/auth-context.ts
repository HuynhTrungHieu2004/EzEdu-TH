import { createContext } from 'react';
import { isAdminAreaRole } from '../utils/adminPermissions';
import type { UserResponse } from '../types/auth';

/**
 * Khu vực của người dùng. Mỗi người chỉ thuộc đúng một khu vực tại một thời điểm.
 * Xem docs/ui-redesign/02-information-architecture.md §2.
 */
export type AppArea = 'student' | 'teacher' | 'admin';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

export interface AuthContextValue {
  status: AuthStatus;
  user: UserResponse | null;
  role: string | undefined;
  /** Khu vực tương ứng với vai trò, null khi chưa đăng nhập. */
  area: AppArea | null;
  /** Đường dẫn trang chủ của khu vực người dùng đang thuộc. */
  homePath: string;
  /** Học sinh đã hoàn tất thiết lập ban đầu chưa. */
  onboardingCompleted: boolean;
  /** Tải lại thông tin người dùng, ví dụ sau khi cập nhật hồ sơ. */
  refresh: () => Promise<void>;
  /** Xoá token và đưa về trạng thái chưa đăng nhập. */
  logout: () => void;
}

export const TOKEN_KEY = 'access_token';

export const AuthContext = createContext<AuthContextValue | null>(null);

/** Vai trò nào thuộc khu vực giáo viên. `user` là vai trò cũ, giữ để không phá tài khoản đã có. */
const TEACHER_ROLES = new Set(['lecturer', 'user']);

export function areaForRole(role: string | undefined): AppArea | null {
  if (!role) return null;
  if (isAdminAreaRole(role)) return 'admin';
  if (role === 'student') return 'student';
  if (TEACHER_ROLES.has(role)) return 'teacher';
  return null;
}

/** Trang chủ của từng khu vực — dùng cho điều hướng sau đăng nhập và khi bị từ chối quyền. */
export function homePathForArea(area: AppArea | null): string {
  switch (area) {
    case 'admin':
      return '/admin/dashboard';
    case 'student':
    case 'teacher':
      return '/dashboard';
    default:
      return '/login';
  }
}
