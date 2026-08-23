import React, { useCallback, useState, useEffect, useRef } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Moon, Sun, Check } from 'lucide-react';
import { authApi, isDemoLoginConfigured, type SocialLoginResponse, type SocialRole } from '../api/authApi';
import { getApiErrorDetail } from '../api/errors';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../contexts/ThemeContext';
import { renderGoogleButton } from '../utils/socialAuth';

const viteEnv = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};
const googleClientId = viteEnv.VITE_GOOGLE_CLIENT_ID?.trim() ?? '';

const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const { preference, setPreference } = useTheme();
  const locationMessage = (location.state as { message?: string } | null)?.message ?? null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(locationMessage);
  const googleButtonRef = useRef<HTMLDivElement>(null);
  const [pendingSocial, setPendingSocial] = useState<{ provider: 'google' | 'facebook'; token: string; profile: SocialLoginResponse } | null>(null);

  useEffect(() => {
    if (locationMessage) {
      window.history.replaceState({}, document.title);
    }
    const token = localStorage.getItem('access_token');
    if (token) {
      authApi.getMe().then((user) => {
        if (user.role === 'student') navigate('/published-questions');
        else if (user.role === 'admin') navigate('/admin/dashboard');
        else navigate('/dashboard');
      }).catch(() => {
        localStorage.removeItem('access_token');
      });
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
      await refresh();

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

  const finishSocialLogin = useCallback(async (result: SocialLoginResponse, provider: 'google' | 'facebook', token: string) => {
    if (result.needs_role) { setPendingSocial({ provider, token, profile: result }); return; }
    if (!result.access_token) throw new Error('Máy chủ không trả về phiên đăng nhập.');
    localStorage.setItem('access_token', result.access_token);
    const user = await authApi.getMe();
    await refresh();
    if (user.role === 'student' && !user.student_profile_completed) navigate('/student-onboarding');
    else if (user.role === 'student') navigate('/student/dashboard');
    else if (user.role === 'admin' || user.role === 'super_admin') navigate('/admin/dashboard');
    else navigate('/dashboard');
  }, [navigate, refresh]);

  const submitSocialToken = useCallback(async (provider: 'google' | 'facebook', token: string, role?: SocialRole) => {
    setLoading(true); setError(null);
    try {
      const result = provider === 'google' ? await authApi.googleLogin(token, role) : await authApi.facebookLogin(token, role);
      await finishSocialLogin(result, provider, token);
    } catch (err) { setError(getApiErrorDetail(err) ?? 'Đăng nhập mạng xã hội thất bại.'); }
    finally { setLoading(false); }
  }, [finishSocialLogin]);

  useEffect(() => {
    const parent = googleButtonRef.current;
    if (!googleClientId || !parent) return;
    renderGoogleButton(parent, googleClientId, (credential) => void submitSocialToken('google', credential))
      .catch((err) => setError(err instanceof Error ? err.message : 'Không tải được Google Login.'));
  }, [submitSocialToken]);

  const handleBypassLogin = async (role: 'teacher' | 'student' | 'admin' = 'teacher') => {
    setLoading(true);
    setError(null);
    try {
      await authApi.bypassLogin(role);
      await refresh();
      if (role === 'student') navigate('/published-questions');
      else if (role === 'admin') navigate('/admin/dashboard');
      else navigate('/dashboard');
    } catch {
      setError('Vào ứng dụng thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ez-auth-container">
      {/* ── Background Floating Glow Orbs ───────────────────────────── */}
      <div className="ez-auth-orb ez-auth-orb-1" aria-hidden="true" />
      <div className="ez-auth-orb ez-auth-orb-2" aria-hidden="true" />
      <div className="ez-auth-orb ez-auth-orb-3" aria-hidden="true" />

      {/* ── Top Theme Toggle Float ──────────────────────────────────── */}
      <div className="ez-auth-top-actions">
        <button
          type="button"
          className="ez-theme-btn"
          onClick={() => setPreference(preference === 'dark' ? 'light' : 'dark')}
          title={preference === 'dark' ? 'Chuyển sang giao diện Sáng' : 'Chuyển sang giao diện Tối'}
          aria-label="Đổi giao diện Sáng/Tối"
        >
          {preference === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>

      {/* ── Glassmorphism Card ──────────────────────────────────────── */}
      <div className="ez-auth-card">
        {/* Header */}
        <div className="ez-auth-header">
          <div className="ez-auth-logo-badge" translate="no">
            Ez
          </div>
          <h1 className="ez-auth-title">Đăng nhập EzEdu AI</h1>
          <p className="ez-auth-subtitle">Biến học liệu thành đề thi dễ dàng & chuẩn hóa AI</p>
        </div>

        {/* Alert Messages */}
        {success && <div className="alert alert-success">{success}</div>}
        {error && <div className="alert alert-error">{error}</div>}



        {/* Login Form */}
        <form onSubmit={handleSubmit} className="ez-field-stack">
          {/* Email Input */}
          <div className="ez-field-group">
            <label htmlFor="login-email" className="ez-field-label">
              <span>Email đăng nhập</span>
            </label>
            <div className="ez-input-wrapper">
              <Mail className="ez-input-icon-left" size={18} />
              <input
                id="login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                autoComplete="email"
                disabled={loading}
                className="ez-input-control"
              />
            </div>
          </div>

          {/* Password Input */}
          <div className="ez-field-group">
            <div className="ez-field-label">
              <label htmlFor="login-password">Mật khẩu</label>
            </div>
            <div className="ez-input-wrapper">
              <Lock className="ez-input-icon-left" size={18} />
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                disabled={loading}
                className="ez-input-control"
              />
              <button
                type="button"
                className="ez-input-icon-right"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Ẩn nội dung đã nhập' : 'Hiển thị nội dung đã nhập'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Remember Me */}
          <div className="ez-auth-options">
            <label className="ez-checkbox-label">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="ez-sr-only"
                style={{ display: 'none' }}
              />
              <div className="ez-custom-checkbox">
                {rememberMe && <Check size={12} strokeWidth={3} />}
              </div>
              <span>Ghi nhớ đăng nhập</span>
            </label>
          </div>

          {/* Submit Button */}
          <button type="submit" className="ez-btn-primary-gradient" disabled={loading}>
            {loading ? (
              <span>Đang xác thực...</span>
            ) : (
              <>
                <span>Đăng nhập</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>

          <Link to="/forgot-password" className="ez-auth-link">
            Quên mật khẩu?
          </Link>
        </form>

        {/* Divider */}
        <div className="ez-divider-wrap">
          <div className="ez-divider-line" />
          <span>Hoặc tiếp tục với</span>
          <div className="ez-divider-line" />
        </div>

        {pendingSocial && <div className="alert alert-success"><p>{pendingSocial.profile.full_name || pendingSocial.profile.email}, hãy chọn vai trò để hoàn tất đăng ký.</p><div className="ez-social-grid"><button type="button" className="ez-social-btn" onClick={() => void submitSocialToken(pendingSocial.provider, pendingSocial.token, 'student')}>Học sinh</button><button type="button" className="ez-social-btn" onClick={() => void submitSocialToken(pendingSocial.provider, pendingSocial.token, 'lecturer')}>Giáo viên</button></div></div>}

        {/* Social Login Grid */}
        <div className="ez-social-grid ez-social-stack">
          {googleClientId ? <div ref={googleButtonRef} aria-label="Đăng nhập bằng Google" /> : <button type="button" className="ez-social-btn" disabled>Google chưa được cấu hình</button>}

          <button
            type="button"
            className="ez-social-btn"
            disabled
            style={{ background: '#1877F2', borderColor: '#1877F2', color: '#fff', opacity: 1, cursor: 'default' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <span>Đăng nhập bằng Facebook</span>
          </button>
        </div>

        {isDemoLoginConfigured && <>
          <div className="ez-divider-wrap" style={{ marginTop: '1.25rem' }}>
            <div className="ez-divider-line" />
            <span>Vào nhanh trải nghiệm (Demo)</span>
            <div className="ez-divider-line" />
          </div>

          <div className="ez-social-grid" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
          <button
            type="button"
            className="ez-social-btn"
            onClick={() => handleBypassLogin('teacher')}
            title="Đăng nhập Giảng viên"
          >
            <span>🎓 Giảng viên</span>
          </button>

          <button
            type="button"
            className="ez-social-btn"
            onClick={() => handleBypassLogin('student')}
            title="Đăng nhập Học sinh"
          >
            <span>📚 Học sinh</span>
          </button>

          <button
            type="button"
            className="ez-social-btn"
            onClick={() => handleBypassLogin('admin')}
            title="Đăng nhập Quản trị viên Admin"
            style={{ borderColor: 'var(--ez-primary-alpha-40)', background: 'var(--ez-primary-alpha-10)' }}
          >
            <span>⚡ Admin</span>
          </button>
          </div>
        </>}

        {/* Footer Link */}
        <div className="auth-footer" style={{ marginTop: '1.75rem' }}>
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
