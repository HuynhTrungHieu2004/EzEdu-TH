import React, { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, User, Phone, ArrowRight, Moon, Sun, Check, Camera, ShieldCheck } from 'lucide-react';
import { authApi } from '../api/authApi';
import { getApiErrorDetail } from '../api/errors';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../contexts/ThemeContext';

const RegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const { preference, setPreference } = useTheme();

  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [role, setRole] = useState<'student' | 'lecturer'>('student');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(true);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (localStorage.getItem('access_token')) {
      navigate('/dashboard');
    }
  }, [navigate]);

  const getPasswordStrength = (pass: string) => {
    if (!pass) return { score: 0, text: '', labelClass: '' };
    let score = 0;
    if (pass.length >= 6) score += 1;
    if (pass.length >= 10) score += 1;
    if (/[0-9]/.test(pass) && /[a-z]/.test(pass)) score += 1;
    if (/[^A-Za-z0-9]/.test(pass) || /[A-Z]/.test(pass)) score += 1;

    switch (score) {
      case 1:
        return { score: 1, text: 'Yếu', labelClass: 'weak' };
      case 2:
        return { score: 2, text: 'Trung bình', labelClass: 'medium' };
      case 3:
        return { score: 3, text: 'Khá mạnh', labelClass: 'good' };
      case 4:
        return { score: 4, text: 'Rất mạnh', labelClass: 'strong' };
      default:
        return { score: 0, text: 'Rất yếu', labelClass: 'weak' };
    }
  };

  const strengthInfo = getPasswordStrength(password);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAvatarPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!agreeTerms) {
      setError('Vui lòng đồng ý với Điều khoản sử dụng dịch vụ để tiếp tục.');
      return;
    }

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
        await refresh();
        navigate('/student-onboarding', { replace: true });
        return;
      }

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
      <div className="ez-auth-card" style={{ maxWidth: '520px' }}>
        {/* Header */}
        <div className="ez-auth-header" style={{ marginBottom: '1.25rem' }}>
          <div className="ez-auth-logo-badge" translate="no">
            Ez
          </div>
          <h1 className="ez-auth-title">Đăng ký EzEdu AI</h1>
          <p className="ez-auth-subtitle">Trải nghiệm nền tảng học liệu & sinh đề tự động thông minh</p>
        </div>

        {/* Alert Error */}
        {error && <div className="alert alert-error">{error}</div>}



        {/* Avatar Upload (Option) */}
        <div className="ez-avatar-upload-wrap">
          <label htmlFor="avatar-file-input" className="ez-avatar-circle" title="Tải ảnh đại diện">
            {avatarPreview ? (
              <img src={avatarPreview} alt="Avatar Preview" className="ez-avatar-img" />
            ) : (
              <Camera size={26} />
            )}
            <input
              id="avatar-file-input"
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              style={{ display: 'none' }}
              disabled={loading}
            />
          </label>
          <span className="ez-avatar-hint">Tải ảnh đại diện (Tùy chọn)</span>
        </div>

        {/* Register Form */}
        <form onSubmit={handleSubmit} className="ez-field-stack">
          {/* Full Name */}
          <div className="ez-field-group">
            <label htmlFor="register-full-name" className="ez-field-label">
              <span>Họ và tên</span>
            </label>
            <div className="ez-input-wrapper">
              <User className="ez-input-icon-left" size={18} />
              <input
                id="register-full-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nguyễn Văn A"
                required
                autoComplete="name"
                disabled={loading}
                className="ez-input-control"
              />
            </div>
          </div>

          {/* Email */}
          <div className="ez-field-group">
            <label htmlFor="register-email" className="ez-field-label">
              <span>Địa chỉ Email</span>
            </label>
            <div className="ez-input-wrapper">
              <Mail className="ez-input-icon-left" size={18} />
              <input
                id="register-email"
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

          {/* Phone Number */}
          <div className="ez-field-group">
            <label htmlFor="register-phone" className="ez-field-label">
              <span>Số điện thoại (Tùy chọn)</span>
            </label>
            <div className="ez-input-wrapper">
              <Phone className="ez-input-icon-left" size={18} />
              <input
                id="register-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="0912 345 678"
                autoComplete="tel"
                disabled={loading}
                className="ez-input-control"
              />
            </div>
          </div>

          {/* Role Selection */}
          <div className="ez-field-group">
            <label htmlFor="register-role" className="ez-field-label">
              <span>Vai trò sử dụng</span>
            </label>
            <div className="ez-input-wrapper">
              <ShieldCheck className="ez-input-icon-left" size={18} />
              <select
                id="register-role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'student' | 'lecturer')}
                disabled={loading}
                className="ez-input-control ez-select-control"
              >
                <option value="student">👨‍🎓 Học sinh / Học viên</option>
                <option value="lecturer">👨‍🏫 Giảng viên / Giáo viên</option>
              </select>
            </div>
          </div>

          {/* Password Input */}
          <div className="ez-field-group">
            <label htmlFor="register-password" className="ez-field-label">
              <span>Mật khẩu</span>
            </label>
            <div className="ez-input-wrapper">
              <Lock className="ez-input-icon-left" size={18} />
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                disabled={loading}
                className="ez-input-control"
              />
              <button
                type="button"
                className="ez-input-icon-right"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Ẩn mật khẩu chính' : 'Hiển thị mật khẩu chính'}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>

            {/* Password Strength Meter */}
            {password.length > 0 && (
              <div className="ez-strength-container">
                <div className="ez-strength-bars">
                  <div className={`ez-strength-bar ${strengthInfo.score >= 1 ? strengthInfo.labelClass : ''}`} />
                  <div className={`ez-strength-bar ${strengthInfo.score >= 2 ? strengthInfo.labelClass : ''}`} />
                  <div className={`ez-strength-bar ${strengthInfo.score >= 3 ? strengthInfo.labelClass : ''}`} />
                  <div className={`ez-strength-bar ${strengthInfo.score >= 4 ? strengthInfo.labelClass : ''}`} />
                </div>
                <div className="ez-strength-text">
                  Độ mạnh mật khẩu: <strong>{strengthInfo.text}</strong>
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password Input */}
          <div className="ez-field-group">
            <label htmlFor="register-confirm-password" className="ez-field-label">
              <span>Xác nhận mật khẩu</span>
            </label>
            <div className="ez-input-wrapper">
              <Lock className="ez-input-icon-left" size={18} />
              <input
                id="register-confirm-password"
                type={showConfirmPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="new-password"
                disabled={loading}
                className="ez-input-control"
              />
              <button
                type="button"
                className="ez-input-icon-right"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                tabIndex={-1}
                aria-label={showConfirmPassword ? 'Ẩn mật khẩu xác nhận' : 'Hiển thị mật khẩu xác nhận'}
              >
                {showConfirmPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {/* Terms Checkbox */}
          <div className="ez-auth-options" style={{ marginTop: '0.25rem' }}>
            <label className="ez-checkbox-label">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="ez-sr-only"
                style={{ display: 'none' }}
              />
              <div className="ez-custom-checkbox">
                {agreeTerms && <Check size={12} strokeWidth={3} />}
              </div>
              <span style={{ fontSize: '0.825rem' }}>
                Tôi đồng ý với <a href="#terms" onClick={(e) => e.preventDefault()} className="ez-auth-link">Điều khoản dịch vụ</a> & <a href="#privacy" onClick={(e) => e.preventDefault()} className="ez-auth-link">Chính sách bảo mật</a>
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button type="submit" className="ez-btn-primary-gradient" disabled={loading}>
            {loading ? (
              <span>Đang khởi tạo tài khoản...</span>
            ) : (
              <>
                <span>Đăng ký ngay</span>
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="ez-divider-wrap">
          <div className="ez-divider-line" />
          <span>Hoặc đăng ký nhanh</span>
          <div className="ez-divider-line" />
        </div>

        <div className="ez-social-grid">
          <button type="button" className="ez-social-btn" onClick={() => navigate('/login')}>
            Đăng ký bằng Google
          </button>
          <button
            type="button"
            className="ez-social-btn"
            disabled
            style={{ background: '#1877F2', borderColor: '#1877F2', color: '#fff', opacity: 1, cursor: 'default' }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
            </svg>
            <span>Đăng ký bằng Facebook</span>
          </button>
        </div>

        {/* Footer Link */}
        <div className="auth-footer" style={{ marginTop: '1.5rem' }}>
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
