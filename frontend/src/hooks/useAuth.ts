import { useContext } from 'react';
import { AuthContext } from '../contexts/auth-context';
import type { AuthContextValue } from '../contexts/auth-context';

/**
 * Truy cập thông tin người dùng đang đăng nhập.
 * Tách khỏi AuthContext.tsx để file đó chỉ export component — điều kiện để
 * Fast Refresh của Vite hoạt động đúng.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth phải được dùng bên trong <AuthProvider>.');
  }
  return ctx;
}
