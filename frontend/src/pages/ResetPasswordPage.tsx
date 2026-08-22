import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { getApiErrorDetail } from '../api/errors';

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState(token ? '' : 'Liên kết thiếu mã xác nhận.');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setLoading(true); setError('');
    try { setMessage((await authApi.resetPassword(token, password)).message); }
    catch (err) { setError(getApiErrorDetail(err) ?? 'Không đặt lại được mật khẩu.'); }
    finally { setLoading(false); }
  }

  return <div className="ez-auth-container"><div className="ez-auth-card"><div className="ez-auth-header"><div className="ez-auth-logo-badge">Ez</div><h1 className="ez-auth-title">Đặt lại mật khẩu</h1></div>
    {message && <div className="alert alert-success">{message}</div>}{error && <div className="alert alert-error">{error}</div>}
    {!message && <form className="ez-field-stack" onSubmit={submit}><div className="ez-field-group"><label className="ez-field-label" htmlFor="new-password">Mật khẩu mới</label><input id="new-password" className="ez-input-control" type="password" minLength={6} maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} required autoComplete="new-password" /></div><button className="ez-btn-primary-gradient" disabled={loading || !token}>{loading ? 'Đang cập nhật…' : 'Đặt lại mật khẩu'}</button></form>}
    <div className="auth-footer"><Link className="text-link" to="/login">Đăng nhập</Link></div>
  </div></div>;
}
