import { useEffect, useRef, useState } from 'react';

const SCRIPT_ID = 'google-identity-services';
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/** Cache ở phạm vi module: mọi lời gọi loadGoogleScript() dùng chung một promise. */
let scriptPromise: Promise<void> | null = null;

/**
 * Nạp script Google Identity Services đúng một lần cho cả ứng dụng.
 *
 * Nạp trong component thay vì nhét vào index.html: trang công khai không cần
 * tải thư viện mà chúng không dùng tới.
 *
 * Dùng promise dùng chung thay vì chỉ kiểm `document.getElementById`: dưới
 * StrictMode, effect chạy hai lần liên tiếp — lần hai sẽ thấy thẻ script đã
 * tồn tại và resolve ngay lập tức dù `onload` thật sự chưa bắn, khiến
 * `window.google` chưa sẵn sàng và nút không bao giờ hiện.
 */
function loadGoogleScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Không tải được thư viện Google.')));
      return;
    }
    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Không tải được thư viện Google.'));
    document.head.appendChild(script);
  });

  return scriptPromise;
}

interface Props {
  onCredential: (idToken: string) => void;
  disabled?: boolean;
}

export function GoogleSignInButton({ onCredential, disabled }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    if (!clientId) {
      setError('Chưa cấu hình đăng nhập Google.');
      return;
    }
    let huy = false;

    loadGoogleScript()
      .then(() => {
        if (huy || !holder.current) return;
        const google = (window as unknown as { google?: any }).google;
        if (!google?.accounts?.id) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (res: { credential?: string }) => {
            if (res.credential) onCredential(res.credential);
          },
        });
        google.accounts.id.renderButton(holder.current, {
          theme: 'outline',
          size: 'large',
          width: 320,
          text: 'continue_with',
          locale: 'vi',
        });
      })
      .catch(() => setError('Không tải được thư viện Google. Kiểm tra kết nối mạng.'));

    return () => {
      huy = true;
    };
  }, [clientId, onCredential]);

  if (error) return <p className="text-muted">{error}</p>;

  return <div ref={holder} aria-busy={disabled} style={{ minHeight: 44 }} />;
}
