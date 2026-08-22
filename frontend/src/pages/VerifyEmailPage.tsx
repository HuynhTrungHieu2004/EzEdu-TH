import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { getApiErrorDetail } from '../api/errors';

export default function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const started = useRef(false);
  const [message, setMessage] = useState(token ? 'Đang xác thực email…' : 'Liên kết thiếu mã xác nhận.');
  const [error, setError] = useState(!token);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!token || started.current) return;
    started.current = true;
    authApi.verifyEmail(token).then((result) => { setMessage(result.message); setError(false); }).catch((err) => { setMessage(getApiErrorDetail(err) ?? 'Không xác thực được email.'); setError(true); });
  }, [token]);

  const resend = async () => {
    setSending(true);
    try {
      const result = await authApi.resendVerification();
      setMessage(result.message);
      setError(false);
    } catch (err) {
      setMessage(getApiErrorDetail(err) ?? 'Không gửi lại được liên kết xác thực.');
      setError(true);
    } finally {
      setSending(false);
    }
  };

  return <div className="ez-auth-container"><div className="ez-auth-card"><div className="ez-auth-header"><div className="ez-auth-logo-badge">Ez</div><h1 className="ez-auth-title">Xác thực email</h1></div><div className={`alert ${error ? 'alert-error' : 'alert-success'}`}>{message}</div>{error && <button type="button" className="ez-btn-primary-gradient" disabled={sending} onClick={() => void resend()}>{sending ? 'Đang gửi…' : 'Gửi lại liên kết'}</button>}<div className="auth-footer"><Link className="text-link" to="/login">Đăng nhập</Link></div></div></div>;
}
