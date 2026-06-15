import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/authApi';

const RegisterPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  useEffect(() => {
    // If already logged in, redirect to dashboard
    if (localStorage.getItem('access_token')) {
      navigate('/dashboard');
    }
  }, [navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
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
      });
      // Redirect to login page with success message
      navigate('/login', {
        state: { message: 'Đăng ký tài khoản thành công! Vui lòng đăng nhập.' },
      });
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      setError(
        typeof detail === 'string'
          ? detail
          : 'Đăng ký không thành công. Email có thể đã tồn tại hoặc không hợp lệ.'
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
          <h2 style={styles.title}>Đăng Ký Tài Khoản</h2>
          <p style={styles.subtitle}>Tạo tài khoản để sử dụng hệ thống</p>
        </div>

        {error && <div style={styles.errorAlert}>{error}</div>}

        <form onSubmit={handleSubmit} style={styles.form}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Họ và tên</label>
            <input
              type="text"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Nguyễn Văn A"
              required
              disabled={loading}
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Email</label>
            <input
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
            <label style={styles.label}>Mật khẩu (tối thiểu 6 ký tự)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Xác nhận mật khẩu</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
              required
              disabled={loading}
              style={styles.input}
            />
          </div>

          <button type="submit" disabled={loading} style={styles.button}>
            {loading ? 'Đang đăng ký...' : 'Đăng Ký Tài Khoản'}
          </button>
        </form>

        <div style={styles.footer}>
          Đã có tài khoản?{' '}
          <span onClick={() => navigate('/login')} style={styles.link}>
            Đăng nhập
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
    gap: '16px',
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

export default RegisterPage;
