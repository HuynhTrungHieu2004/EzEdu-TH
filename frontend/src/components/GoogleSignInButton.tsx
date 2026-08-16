import { useEffect, useRef, useState } from 'react';

const SCRIPT_ID = 'google-identity-services';
const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';

/** Cache ở phạm vi module: mọi lời gọi loadGoogleScript() dùng chung một promise. */
let scriptPromise: Promise<void> | null = null;

type GoogleButtonText = 'signin_with' | 'signup_with';

type GoogleCredentialResponse = {
  credential?: string;
};

type GoogleIdentityServices = {
  accounts?: {
    id?: {
      initialize: (configuration: {
        client_id: string;
        callback: (response: GoogleCredentialResponse) => void;
      }) => void;
      renderButton: (
        parent: HTMLElement,
        options: {
          theme: 'outline';
          size: 'large';
          width: number;
          text: GoogleButtonText;
          locale: string;
        },
      ) => void;
    };
  };
};

function googleReady(): boolean {
  return !!(window as unknown as { google?: GoogleIdentityServices }).google?.accounts?.id;
}

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
 *
 * Hai điều cần giữ khi thẻ script đã tồn tại từ trước:
 * - Nếu `window.google` đã sẵn sàng (script tải xong từ lâu, ví dụ module bị
 *   HMR nạp lại) thì resolve ngay — sự kiện `load` của thẻ cũ đã bắn qua rồi,
 *   gắn listener lúc này sẽ không bao giờ được gọi.
 * - Nếu lần tải trước hỏng, xoá `scriptPromise` khi reject để lần gọi sau tạo
 *   lại từ đầu — nếu không, một lần mất mạng sẽ kẹt vĩnh viễn ở lỗi cũ.
 */
function loadGoogleScript(): Promise<void> {
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise((resolve, reject) => {
    // Xoá thẻ hỏng khỏi DOM: nếu không, lần gọi sau (retry) sẽ lại thấy "đã
    // tồn tại" và gắn listener vào đúng thẻ đã chết, treo vô thời hạn thay vì
    // tải lại từ đầu.
    const fail = (tag: HTMLScriptElement) => {
      tag.remove();
      scriptPromise = null;
      reject(new Error('Không tải được thư viện Google.'));
    };

    const existing = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (existing) {
      if (googleReady()) {
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
    script.onload = () => resolve();
    script.onerror = () => fail(script);
    document.head.appendChild(script);
  });

  return scriptPromise;
}

interface Props {
  onCredential: (idToken: string) => void;
  disabled?: boolean;
  /**
   * Nhãn GSI vẽ lên nút. Mặc định `signin_with` — KHÔNG dùng `continue_with`:
   * bản tiếng Việt của nó là "Tiếp tục sử dụng dịch vụ bằng Google", dài tới
   * mức GSI không chịu vẽ hẹp hơn 298px, tràn khỏi thẻ trên máy 360px và lệch
   * hẳn so với nút Facebook. `signin_with` / `signup_with` vừa 278px.
   */
  text?: GoogleButtonText;
}

/**
 * Chiều rộng truyền cho GSI, theo chỗ trống thật sự có.
 *
 * Nút Google là iframe do thư viện Google vẽ với chiều rộng CỐ ĐỊNH — CSS bên
 * ngoài không co nó lại được. Để nguyên 320px thì trên máy 360px nó tràn khỏi
 * thẻ và lệch hẳn so với nút Facebook bên dưới (nút đó là HTML của ta nên co
 * bình thường).
 *
 * GSI chỉ nhận khoảng 200–400px; ngoài khoảng đó nó lặng lẽ bỏ qua tham số và
 * quay về mặc định, nên phải kẹp lại chứ không truyền thẳng số đo.
 */
function beRong(container: HTMLElement | null): number {
  const doDuoc = container?.getBoundingClientRect().width ?? 320;
  return Math.round(Math.min(400, Math.max(200, doDuoc)));
}

export function GoogleSignInButton({ onCredential, disabled, text = 'signin_with' }: Props) {
  const holder = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

  useEffect(() => {
    if (!clientId) return;
    let huy = false;
    let quanSat: ResizeObserver | null = null;

    loadGoogleScript()
      .then(() => {
        if (huy || !holder.current) return;
        const google = (window as unknown as { google?: GoogleIdentityServices }).google;
        if (!google?.accounts?.id) return;
        google.accounts.id.initialize({
          client_id: clientId,
          callback: (res) => {
            if (res.credential) onCredential(res.credential);
          },
        });

        const ve = () => {
          if (huy || !holder.current) return;
          google.accounts!.id!.renderButton(holder.current, {
            theme: 'outline',
            size: 'large',
            width: beRong(holder.current.parentElement),
            text,
            locale: 'vi',
          });
        };
        ve();

        // Vẽ lại khi khung đổi bề ngang — xoay ngang máy, mở bàn phím ảo, hoặc
        // kéo cửa sổ. Không có bước này thì nút giữ nguyên bề ngang lúc mới nạp.
        if (holder.current.parentElement && 'ResizeObserver' in window) {
          quanSat = new ResizeObserver(ve);
          quanSat.observe(holder.current.parentElement);
        }
      })
      .catch(() => setError('Không tải được thư viện Google. Kiểm tra kết nối mạng.'));

    return () => {
      huy = true;
      quanSat?.disconnect();
    };
  }, [clientId, onCredential, text]);

  const message = clientId ? error : 'Chưa cấu hình đăng nhập Google.';
  if (message) return <p className="text-muted">{message}</p>;

  // Nút thật do Google render là một iframe bên trong div này — HTML
  // `disabled` không áp dụng được cho nó. `pointer-events: none` chặn mọi
  // click/hover xuống tới iframe (hành vi CSS chuẩn, không cần biết API nội
  // bộ của GSI), còn opacity là dấu hiệu nhìn thấy được rằng đang xử lý.
  return (
    <div
      ref={holder}
      aria-busy={disabled}
      style={{
        // Chiếm trọn bề ngang khung để iframe của Google canh đúng mép với nút
        // Facebook bên dưới; bề ngang thật của iframe do `beRong()` quyết định.
        width: '100%',
        minHeight: 44,
        opacity: disabled ? 0.6 : 1,
        pointerEvents: disabled ? 'none' : 'auto',
      }}
    />
  );
}
