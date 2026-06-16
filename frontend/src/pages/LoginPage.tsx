import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '../api/authApi';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Check if redirect from register success
    const state = location.state as { message?: string } | null;
    if (state && state.message) {
      setSuccess(state.message);
      // Clear location state so message doesn't persist on refresh
      window.history.replaceState({}, document.title);
    }

    // If already logged in, redirect to dashboard
    if (localStorage.getItem('access_token')) {
      navigate('/dashboard');
    }
  }, [location, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const data = await authApi.login({ email, password });
      localStorage.setItem('access_token', data.access_token);
      navigate('/dashboard');
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Đăng nhập thất bại. Vui lòng kiểm tra lại tài khoản và mật khẩu.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logoContainer}>
          <div style={styles.logoBadge}>AI</div>
          <h2 style={styles.title}>Đăng Nhập Hệ Thống</h2>
          <p style={styles.subtitle}>Sinh câu hỏi đánh giá năng lực tự động</p>
        </div>

        {success && <div style={styles.successAlert}>{success}</div>}
        {error && <div style={styles.errorAlert}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label htmlFor="login-email" style={styles.label}>Email đăng nhập</label>
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com"
              required
              disabled={loading}
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label htmlFor="login-password" style={styles.label}>Mật khẩu</label>
            <input
              id="login-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              style={styles.input}
            />
          </div>

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Đang xác thực...' : 'Đăng Nhập'}
          </button>
        </form>

        <div style={styles.footer}>
          Chưa có tài khoản?{' '}
          <span onClick={() => navigate('/register')} style={styles.link}>
            Đăng ký ngay
          </span>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    flexGrow: 1,
    padding: '24px',
    backgroundColor: 'var(--bg)',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    padding: '40px 32px',
    borderRadius: '16px',
    border: '1px solid var(--border)',
    boxShadow: 'var(--shadow)',
    backgroundColor: 'var(--bg)',
    textAlign: 'left' as const,
  },
  logoContainer: {
    textAlign: 'center' as const,
    marginBottom: '32px',
  },
  logoBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '48px',
    height: '48px',
    borderRadius: '12px',
    backgroundColor: 'var(--accent-bg)',
    color: 'var(--accent)',
    fontSize: '20px',
    fontWeight: 'bold',
    marginBottom: '16px',
    border: '1px solid var(--accent-border)',
  },
  title: {
    fontSize: '24px',
    fontWeight: '600',
    margin: '0 0 6px 0',
    color: 'var(--text-h)',
  },
  subtitle: {
    fontSize: '14px',
    color: 'var(--text)',
    margin: 0,
  },
  successAlert: {
    padding: '12px 16px',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    border: '1px solid rgba(34, 197, 94, 0.3)',
    color: '#22c55e',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '20px',
  },
  errorAlert: {
    padding: '12px 16px',
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid rgba(239, 68, 68, 0.3)',
    color: '#ef4444',
    borderRadius: '8px',
    fontSize: '14px',
    marginBottom: '20px',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
  },
  label: {
    fontSize: '14px',
    fontWeight: '500',
    color: 'var(--text-h)',
  },
  input: {
    padding: '12px 16px',
    fontSize: '15px',
    borderRadius: '8px',
    border: '1px solid var(--border)',
    backgroundColor: 'var(--bg)',
    color: 'var(--text-h)',
    outline: 'none',
    transition: 'all 0.2s ease',
  },
  button: {
    padding: '14px',
    fontSize: '16px',
    fontWeight: '600',
    color: '#fff',
    backgroundColor: 'var(--accent)',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    marginTop: '10px',
  },
  footer: {
    marginTop: '24px',
    textAlign: 'center' as const,
    fontSize: '14px',
    color: 'var(--text)',
  },
  link: {
    color: 'var(--accent)',
    fontWeight: '600',
    cursor: 'pointer',
    textDecoration: 'underline',
  },
};

export default LoginPage;
