import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { getApiErrorDetail } from '../api/errors';
import { postLoginPath } from '../contexts/auth-context';
import type { SocialLoginResponse } from '../types/auth';
import { authApi } from '../api/authApi';
import { useAuth } from './useAuth';

export type SocialRole = 'student' | 'lecturer';

/** Gọi endpoint của một nhà cung cấp. Phải ổn định giữa các lần render. */
export type GoiApiDangNhap = (token: string, role?: SocialRole) => Promise<SocialLoginResponse>;

/**
 * Lõi chung cho mọi luồng đăng nhập mạng xã hội.
 *
 * Với Google hay Facebook thì "đăng nhập" và "đăng ký" là một hành động, nên
 * trang Đăng nhập và trang Đăng ký chạy đúng một luồng. Và giữa các nhà cung
 * cấp, luồng cũng giống hệt nhau — chỉ khác đúng cái endpoint được gọi. Nên tất
 * cả nằm ở đây, mỗi nhà cung cấp chỉ còn là một dòng bọc ngoài.
 *
 * `goiApi` PHẢI ổn định (bọc `useCallback` ở nơi gọi). Truyền một arrow tạo mới
 * mỗi lần render sẽ khiến `onCredential` đổi theo, và nút của nhà cung cấp
 * dựng lại liên tục.
 */
export function useSocialSignIn(goiApi: GoiApiDangNhap, thongBaoLoiMacDinh: string) {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [info, setInfo] = useState<{ email: string; fullName: string } | null>(null);
  const [dangXuLy, setDangXuLy] = useState(false);

  const dangNhap = useCallback(
    async (token: string, role?: SocialRole) => {
      setError(null);
      setDangXuLy(true);
      try {
        const kq = await goiApi(token, role);
        if (kq.needs_role) {
          // Người mới: giữ token để gọi lần hai kèm vai vừa chọn.
          setPendingToken(token);
          setInfo({ email: kq.email ?? '', fullName: kq.full_name ?? '' });
          setDangXuLy(false);
          return;
        }
        localStorage.setItem('access_token', kq.access_token as string);
        const user = await authApi.getMe();
        await refresh();
        navigate(postLoginPath(user));
        // Không tắt dangXuLy ở đây: trang sắp điều hướng đi, nút không còn ai
        // nhìn thấy nữa. Tắt sớm chỉ mở lại cửa sổ bấm-lại trong khoảnh khắc
        // giữa navigate() và khi router thật sự đổi trang.
      } catch (err: unknown) {
        setPendingToken(null);
        setInfo(null);
        setError(getApiErrorDetail(err) ?? thongBaoLoiMacDinh);
        setDangXuLy(false);
      }
    },
    [goiApi, navigate, refresh, thongBaoLoiMacDinh],
  );

  const huy = useCallback(() => {
    setPendingToken(null);
    setInfo(null);
  }, []);

  const onCredential = useCallback((token: string) => void dangNhap(token), [dangNhap]);

  return {
    error,
    dangXuLy,
    onCredential,
    /** null khi chưa cần hỏi vai; ngược lại là props sẵn sàng cho SocialRoleDialog. */
    dialogProps:
      pendingToken && info
        ? {
            open: true as const,
            email: info.email,
            fullName: info.fullName,
            onChoose: (role: SocialRole) => void dangNhap(pendingToken, role),
            onCancel: huy,
          }
        : null,
  };
}
