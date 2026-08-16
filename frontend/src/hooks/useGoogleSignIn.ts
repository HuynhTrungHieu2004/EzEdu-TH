import { useCallback } from 'react';

import { authApi } from '../api/authApi';
import { useSocialSignIn, type SocialRole } from './useSocialSignIn';

/**
 * Luồng đăng nhập Google, dùng chung cho trang Đăng nhập và Đăng ký.
 *
 * Toàn bộ logic nằm ở `useSocialSignIn` — ở đây chỉ còn phần riêng của Google
 * là cái endpoint được gọi.
 */
export function useGoogleSignIn(thongBaoLoiMacDinh = 'Đăng nhập bằng Google thất bại.') {
  // useCallback với deps rỗng: `useSocialSignIn` dùng hàm này trong deps của
  // chính nó, arrow tạo mới mỗi render sẽ làm nút Google dựng lại liên tục.
  const goiApi = useCallback(
    (idToken: string, role?: SocialRole) => authApi.loginWithGoogle({ id_token: idToken, role }),
    [],
  );

  return useSocialSignIn(goiApi, thongBaoLoiMacDinh);
}
