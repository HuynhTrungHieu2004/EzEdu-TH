import { useCallback } from 'react';

import { authApi } from '../api/authApi';
import { useSocialSignIn, type SocialRole } from './useSocialSignIn';

/**
 * Luồng đăng nhập Facebook, dùng chung cho trang Đăng nhập và Đăng ký.
 *
 * Giống hệt Google về mặt luồng (xem `useSocialSignIn`), chỉ khác endpoint và
 * khác tên trường: Facebook gửi `access_token`, Google gửi `id_token`.
 */
export function useFacebookSignIn(thongBaoLoiMacDinh = 'Đăng nhập bằng Facebook thất bại.') {
  const goiApi = useCallback(
    (accessToken: string, role?: SocialRole) =>
      authApi.loginWithFacebook({ access_token: accessToken, role }),
    [],
  );

  return useSocialSignIn(goiApi, thongBaoLoiMacDinh);
}
