import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { authApi } from '../api/authApi';
import { getApiErrorDetail } from '../api/errors';
import { postLoginPath } from '../contexts/auth-context';
import { useAuth } from './useAuth';

/**
 * Toàn bộ luồng đăng nhập Google, dùng chung cho trang Đăng nhập và Đăng ký.
 *
 * Với Google thì "đăng nhập" và "đăng ký" là một hành động, nên hai trang chạy
 * đúng một luồng. Để logic này trong hook thay vì chép sang cả hai trang: hai
 * bản sao sẽ lệch nhau ngay lần sửa đầu tiên.
 */
export function useGoogleSignIn(thongBaoLoiMacDinh = 'Đăng nhập bằng Google thất bại.') {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [info, setInfo] = useState<{ email: string; fullName: string } | null>(null);

  const dangNhap = useCallback(
    async (idToken: string, role?: 'student' | 'lecturer') => {
      setError(null);
      try {
        const kq = await authApi.loginWithGoogle({ id_token: idToken, role });
        if (kq.needs_role) {
          // Người mới: giữ token để gọi lần hai kèm vai vừa chọn.
          setPendingToken(idToken);
          setInfo({ email: kq.email ?? '', fullName: kq.full_name ?? '' });
          return;
        }
        localStorage.setItem('access_token', kq.access_token as string);
        const user = await authApi.getMe();
        await refresh();
        navigate(postLoginPath(user));
      } catch (err: unknown) {
        setPendingToken(null);
        setInfo(null);
        setError(getApiErrorDetail(err) ?? thongBaoLoiMacDinh);
      }
    },
    [navigate, refresh, thongBaoLoiMacDinh],
  );

  const huy = useCallback(() => {
    setPendingToken(null);
    setInfo(null);
  }, []);

  return {
    error,
    onCredential: (idToken: string) => void dangNhap(idToken),
    /** null khi chưa cần hỏi vai; ngược lại là props sẵn sàng cho GoogleRoleDialog. */
    dialogProps:
      pendingToken && info
        ? {
            open: true as const,
            email: info.email,
            fullName: info.fullName,
            onChoose: (role: 'student' | 'lecturer') => void dangNhap(pendingToken, role),
            onCancel: huy,
          }
        : null,
  };
}
