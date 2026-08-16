import { useCallback, useState } from 'react';

const SCRIPT_ID = 'facebook-jssdk';
const SCRIPT_SRC = 'https://connect.facebook.net/vi_VN/sdk.js';

/** Cache ở phạm vi module: mọi lời gọi loadFacebookScript() dùng chung một promise. */
let scriptPromise: Promise<void> | null = null;

type FacebookLoginResponse = {
  authResponse?: { accessToken?: string } | null;
  status?: string;
};

type FacebookSdk = {
  init: (config: { appId: string; cookie: boolean; xfbml: boolean; version: string }) => void;
  login: (
    callback: (response: FacebookLoginResponse) => void,
    options: { scope: string },
  ) => void;
};

function laySdk(): FacebookSdk | undefined {
  return (window as unknown as { FB?: FacebookSdk }).FB;
}

/**
 * Nạp SDK Facebook — chỉ khi người dùng thật sự bấm nút.
 *
 * Khác nút Google: nút Google là iframe do thư viện Google tự vẽ, nên buộc phải
 * nạp thư viện ngay lúc mở trang mới có nút để nhìn. Nút Facebook là nút HTML
 * của ta, nên hoãn được tới lúc bấm.
 *
 * Hoãn có lý do, không phải để tiết kiệm vài KB: SDK Facebook thả cookie ngay
 * khi nạp. Nạp sẵn cho mọi khách vào trang đăng nhập nghĩa là Facebook theo dõi
 * cả những người chưa từng định dùng Facebook, và câu chữ trong thông báo dữ
 * liệu của trang sẽ không còn đúng. Hoãn tới lúc bấm thì việc đặt cookie trở
 * thành hệ quả của một hành động người dùng tự chọn.
 *
 * Xử lý lỗi giống `GoogleSignInButton`, vì cùng những cái bẫy: xoá thẻ hỏng và
 * xoá promise khi tải lỗi, nếu không một lần mất mạng sẽ kẹt vĩnh viễn.
 */
function loadFacebookScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const fail = (tag: HTMLScriptElement) => {
      tag.remove();
      scriptPromise = null;
      reject(new Error('Không tải được thư viện Facebook.'));
    };

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (laySdk()) {
        resolve();
        return;
      }
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => fail(existing));
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = () => fail(script);
    document.head.appendChild(script);
  });

  return scriptPromise;
}

interface Props {
  onCredential: (accessToken: string) => void;
  disabled?: boolean;
}

export function FacebookSignInButton({ onCredential, disabled }: Props) {
  const [error, setError] = useState<string | null>(null);
  const [dangNap, setDangNap] = useState(false);
  const appId = import.meta.env.VITE_FACEBOOK_APP_ID as string | undefined;
  const version = (import.meta.env.VITE_FACEBOOK_GRAPH_VERSION as string | undefined) ?? 'v21.0';

  const bam = useCallback(async () => {
    if (!appId) return;
    setError(null);
    setDangNap(true);
    try {
      await loadFacebookScript();
      const FB = laySdk();
      if (!FB) throw new Error('SDK Facebook nạp xong nhưng không dùng được.');

      FB.init({ appId, cookie: true, xfbml: false, version });
      FB.login(
        (res) => {
          setDangNap(false);
          const token = res.authResponse?.accessToken;
          if (token) {
            onCredential(token);
            return;
          }
          // Người dùng đóng cửa sổ hoặc bấm Huỷ. Không phải lỗi — im lặng, vì
          // hiện thông báo đỏ cho một hành động họ cố ý làm chỉ gây bối rối.
        },
        { scope: 'email' },
      );
    } catch {
      setDangNap(false);
      setError('Không tải được thư viện Facebook. Kiểm tra kết nối mạng.');
    }
  }, [appId, onCredential, version]);

  // Chưa cấu hình thì biến mất hẳn, không để lại lời nhắn.
  //
  // Khác nút Google: Google đã cấu hình từ lâu nên nhánh này không bao giờ chạy
  // trên bản thật. Facebook thì sẽ ở trạng thái chưa cấu hình suốt quãng chờ
  // duyệt app, và "Chưa cấu hình đăng nhập Facebook" là câu nói với lập trình
  // viên chứ không phải với người vào học — với họ nó chỉ là một lời thú nhận
  // rằng trang web đang hỏng.
  //
  // Vẫn giữ lời nhắn khi chạy dev, vì lúc đó nút biến mất không lý do sẽ khiến
  // chính ta đi tìm bug không tồn tại.
  if (!appId) {
    return import.meta.env.DEV ? (
      <p className="text-muted">Chưa cấu hình đăng nhập Facebook (thiếu VITE_FACEBOOK_APP_ID).</p>
    ) : null;
  }

  return (
    <>
      <button
        type="button"
        className="ez-btn ez-btn-facebook"
        onClick={() => void bam()}
        disabled={disabled || dangNap}
        aria-busy={dangNap}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.96.93-1.96 1.89v2.26h3.33l-.53 3.49h-2.8V24C19.61 23.09 24 18.1 24 12.07z" />
        </svg>
        {dangNap ? 'Đang mở Facebook…' : 'Tiếp tục với Facebook'}
      </button>
      {error && <p className="text-muted">{error}</p>}
    </>
  );
}
