import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { getApiErrorDetail } from '../api/errors';
import { postLoginPath } from '../contexts/auth-context';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { GoogleRoleDialog } from '../components/GoogleRoleDialog';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const locationMessage = (location.state as { message?: string } | null)?.message ?? null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(locationMessage);
  const google = useGoogleSignIn('Đăng nhập bằng Google thất bại.');

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
      // AuthProvider tự tải /auth/me ở lần mount đầu, khi chưa có token nên
      // status dừng ở 'anonymous'. Không gọi refresh() ở đây thì status không
      // bao giờ cập nhật, khiến RoleRoute coi người vừa đăng nhập là chưa đăng
      // nhập và đưa họ quay lại /login — trong khi trang này thấy token vẫn
      // còn nên lại điều hướng đi, tạo vòng lặp chuyển hướng vô tận.
      await refresh();
      navigate(postLoginPath(user));
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
          <h1 className="auth-title">Đăng nhập EzEdu AI</h1>
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

          <Button type="submit" size="hero" block disabled={loading}>
            {loading ? 'Đang xác thực...' : 'Đăng nhập'}
          </Button>
        </form>

        <div style={{ display: 'grid', gap: 12, justifyItems: 'center', marginTop: 16 }}>
          <span className="text-muted">hoặc</span>
          <GoogleSignInButton onCredential={google.onCredential} />
          {google.error && <p className="text-danger">{google.error}</p>}
        </div>
        {google.dialogProps && <GoogleRoleDialog {...google.dialogProps} />}

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
