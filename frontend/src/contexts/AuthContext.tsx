import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { authApi } from '../api/authApi';
import { AuthContext, TOKEN_KEY, areaForRole, homePathForArea } from './auth-context';
import type { AuthContextValue, AuthStatus } from './auth-context';
import type { UserResponse } from '../types/auth';

/**
 * Nguồn duy nhất cho thông tin người dùng đang đăng nhập.
 *
 * Trước đây AppLayout và AdminRoute mỗi cái tự gọi `/auth/me` lại mỗi lần đổi
 * route. Provider này gọi một lần rồi chia sẻ kết quả, nên vừa bớt request vừa
 * tránh việc hai chỗ nhìn thấy vai trò khác nhau trong cùng một thời điểm.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserResponse | null>(null);
  // Trạng thái ban đầu suy ra ngay từ token, nên không cần setState trong effect
  // cho trường hợp chưa đăng nhập.
  const [status, setStatus] = useState<AuthStatus>(() =>
    localStorage.getItem(TOKEN_KEY) ? 'loading' : 'anonymous',
  );

  const applyUser = useCallback((me: UserResponse) => {
    setUser(me);
    setStatus('authenticated');
  }, []);

  const clearUser = useCallback(() => {
    // Token hết hạn hoặc không hợp lệ: dọn sạch để không kẹt ở trạng thái lửng lơ.
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setStatus('anonymous');
  }, []);

  const refresh = useCallback(async () => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      clearUser();
      return;
    }
    try {
      applyUser(await authApi.getMe());
    } catch {
      clearUser();
    }
  }, [applyUser, clearUser]);

  useEffect(() => {
    // Không có token thì trạng thái khởi tạo đã là 'anonymous' — không gọi setState.
    if (!localStorage.getItem(TOKEN_KEY)) return;
    let cancelled = false;
    authApi
      .getMe()
      .then((me) => {
        if (!cancelled) applyUser(me);
      })
      .catch(() => {
        if (!cancelled) clearUser();
      });
    return () => {
      cancelled = true;
    };
  }, [applyUser, clearUser]);

  // Đăng nhập/đăng xuất ở tab khác phải được phản ánh sang tab này.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key === TOKEN_KEY) void refresh();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [refresh]);

  const value = useMemo<AuthContextValue>(() => {
    const area = areaForRole(user?.role);
    return {
      status,
      user,
      role: user?.role,
      area,
      homePath: homePathForArea(area),
      onboardingCompleted: user?.student_profile_completed === true,
      refresh,
      logout: clearUser,
    };
  }, [status, user, refresh, clearUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
