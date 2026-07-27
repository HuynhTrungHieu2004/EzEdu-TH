import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { getApiErrorDetail } from '../api/errors';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const locationMessage = (location.state as { message?: string } | null)?.message ?? null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(locationMessage);

  useEffect(() => {
    if (locationMessage) {
      window.history.replaceState({}, document.title);
    }

    if (localStorage.getItem('access_token')) {
      navigate('/dashboard');
    }
  }, [locationMessage, navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await authApi.login({ email, password });
      localStorage.setItem('access_token', data.access_token);
      const user = await authApi.getMe();
      if (user.role === 'student' && !user.student_profile_completed) navigate('/student-onboarding');
      else if (user.role === 'student') navigate('/published-questions');
      else if (user.role === 'admin') navigate('/admin/dashboard');
      else navigate('/dashboard');
    } catch (err: unknown) {
      const detail = getApiErrorDetail(err);
      setError(
        detail ?? 'Đăng nhập thất bại. Vui lòng kiểm tra lại tài khoản và mật khẩu.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-mark" translate="no">Ez</div>
          <h2 className="auth-title">Đăng nhập EzEdu AI</h2>
          <p className="auth-subtitle">Biến học liệu thành đề thi dễ dàng</p>
        </div>

        {success && <div className="alert alert-success">{success}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="form-stack">
          <div className="form-group">
            <label htmlFor="login-email" className="form-label">Email đăng nhập</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              disabled={loading}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="login-password" className="form-label">Mật khẩu</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              className="form-input"
            />
          </div>

          <button type="submit" disabled={loading} className="btn-primary btn-full">
            {loading ? 'Đang xác thực...' : 'Đăng nhập'}
          </button>
        </form>

        <div className="auth-footer">
          Chưa có tài khoản?{' '}
          <button type="button" onClick={() => navigate('/register')} className="text-link">
            Đăng ký ngay
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
