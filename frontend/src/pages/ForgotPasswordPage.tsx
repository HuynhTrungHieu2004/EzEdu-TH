import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { getApiErrorDetail } from '../api/errors';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true); setError(''); setMessage('');
    try { setMessage((await authApi.forgotPassword(email)).message); }
    catch (err) { setError(getApiErrorDetail(err) ?? 'Không gửi được hướng dẫn.'); }
    finally { setLoading(false); }
  }

  return <div className="ez-auth-container"><div className="ez-auth-card"><div className="ez-auth-header"><div className="ez-auth-logo-badge">Ez</div><h1 className="ez-auth-title">Quên mật khẩu</h1><p className="ez-auth-subtitle">Nhập email để nhận liên kết đặt lại mật khẩu.</p></div>
    {message && <div className="alert alert-success">{message}</div>}{error && <div className="alert alert-error">{error}</div>}
    <form className="ez-field-stack" onSubmit={submit}><div className="ez-field-group"><label className="ez-field-label" htmlFor="recovery-email">Email</label><input id="recovery-email" className="ez-input-control" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" /></div><button className="ez-btn-primary-gradient" disabled={loading}>{loading ? 'Đang gửi…' : 'Gửi hướng dẫn'}</button></form>
    <div className="auth-footer"><Link className="text-link" to="/login">Quay lại đăng nhập</Link></div>
  </div></div>;
}
