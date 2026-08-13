import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { getApiErrorDetail } from '../api/errors';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { GoogleRoleDialog } from '../components/GoogleRoleDialog';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';

const RegisterPage = () => {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'student' | 'lecturer'>('student');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();
  const { refresh } = useAuth();
  const google = useGoogleSignIn('Đăng ký bằng Google thất bại.');

  useEffect(() => {
    // If already logged in, redirect to dashboard
    if (localStorage.getItem('access_token')) {
      navigate('/dashboard');
    }
  }, [navigate]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (password.length < 6) {
      setError('Mật khẩu phải chứa ít nhất 6 ký tự.');
      return;
    }

    if (password !== confirmPassword) {
      setError('Mật khẩu xác nhận không khớp.');
      return;
    }

    setLoading(true);

    try {
      await authApi.register({
        email,
        full_name: fullName,
        password,
        role,
      });
      if (role === 'student') {
        const data = await authApi.login({ email, password });
        localStorage.setItem('access_token', data.access_token);
        // Xem chú thích trong LoginPage.tsx: không refresh() thì AuthProvider
        // vẫn coi là 'anonymous' và RoleRoute sẽ đưa người dùng quay lại /login.
        await refresh();
        navigate('/student-onboarding', { replace: true });
        return;
      }

      // Redirect lecturers to login page with success message
      navigate('/login', {
        state: { message: 'Đăng ký tài khoản thành công! Vui lòng đăng nhập.' },
      });
    } catch (err: unknown) {
      const detail = getApiErrorDetail(err);
      setError(
        detail ?? 'Đăng ký không thành công. Email có thể đã tồn tại hoặc không hợp lệ.'
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
          <h1 className="auth-title">Đăng ký EzEdu AI</h1>
          <p className="auth-subtitle">Biến học liệu thành đề thi dễ dàng</p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <form onSubmit={handleSubmit} className="form-stack">
          <div className="form-group">
            <label htmlFor="register-full-name" className="form-label">Họ và tên</label>
            <input
              id="register-full-name"
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
              required
              disabled={loading}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="register-email" className="form-label">Email</label>
            <input
              id="register-email"
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
            <label htmlFor="register-role" className="form-label">Bạn là</label>
            <select
              id="register-role"
              value={role}
              onChange={(e) => setRole(e.target.value as 'student' | 'lecturer')}
              disabled={loading}
              className="form-select"
            >
              <option value="student">Học sinh</option>
              <option value="lecturer">Giảng viên</option>
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="register-password" className="form-label">Mật khẩu (tối thiểu 6 ký tự)</label>
            <input
              id="register-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              className="form-input"
            />
          </div>

          <div className="form-group">
            <label htmlFor="register-confirm-password" className="form-label">Xác nhận mật khẩu</label>
            <input
              id="register-confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              className="form-input"
            />
          </div>

          <Button type="submit" size="hero" block disabled={loading}>
            {loading ? 'Đang đăng ký...' : 'Đăng ký tài khoản'}
          </Button>
        </form>

        <div style={{ display: 'grid', gap: 12, justifyItems: 'center', marginTop: 16 }}>
          <span className="text-muted">hoặc</span>
          <GoogleSignInButton onCredential={google.onCredential} />
          {google.error && <p className="text-danger">{google.error}</p>}
        </div>
        {google.dialogProps && <GoogleRoleDialog {...google.dialogProps} />}

        <div className="auth-footer">
          Đã có tài khoản?{' '}
          <button type="button" onClick={() => navigate('/login')} className="text-link">
            Đăng nhập
          </button>
        </div>
      </div>
    </div>
  );
};

export default RegisterPage;
