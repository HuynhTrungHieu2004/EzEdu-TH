import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Check } from 'lucide-react';
import { useNavigate, useLocation } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { getApiErrorDetail } from '../api/errors';
import { postLoginPath } from '../contexts/auth-context';
import { useAuth } from '../hooks/useAuth';
import { Alert, Button, Card, CardBody, FormField, Input } from '../components/ui';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { FacebookSignInButton } from '../components/FacebookSignInButton';
import { SocialRoleDialog } from '../components/SocialRoleDialog';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import { useFacebookSignIn } from '../hooks/useFacebookSignIn';
import './auth.css';

const BRAND_POINTS = [
  'Học liệu của bạn thành ngân hàng câu hỏi có trích dẫn',
  'Ma trận đề và bộ đề cân đối theo độ khó',
  'Học sinh ôn tập ngay trong hội thoại, không cần chờ duyệt',
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { refresh } = useAuth();
  const locationMessage = (location.state as { message?: string } | null)?.message ?? null;

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [success, setSuccess] = useState<string | null>(locationMessage);
  const google = useGoogleSignIn('Đăng nhập bằng Google thất bại.');
  const facebook = useFacebookSignIn('Đăng nhập bằng Facebook thất bại.');
  // Đang xử lý một nhà cung cấp thì khoá cả hai nút: bấm nút kia giữa
  // chừng sẽ chạy hai luồng đăng nhập song song, và luồng nào về sau sẽ
  // ghi đè access_token của luồng về trước.
  const dangDangNhap = google.dangXuLy || facebook.dangXuLy;

  useEffect(() => {
    if (locationMessage) {
      window.history.replaceState({}, document.title);
    }

    if (localStorage.getItem('access_token')) {
      navigate('/dashboard');
    }
  }, [locationMessage, navigate]);

  /** Lỗi nhập liệu hiện ngay cạnh trường thay vì gộp vào một dòng trên đầu form. */
  function validate(): boolean {
    const next: { email?: string; password?: string } = {};
    if (!email.trim()) next.email = 'Nhập email đăng nhập.';
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Email chưa đúng định dạng.';
    if (!password) next.password = 'Nhập mật khẩu.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    if (!validate()) return;

    setLoading(true);
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
      setError(detail ?? 'Đăng nhập thất bại. Vui lòng kiểm tra lại tài khoản và mật khẩu.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ez-auth">
      <aside className="ez-auth-brand" aria-hidden="true">
        <h2 className="ez-auth-brand-title">Học liệu vào, đề luyện tập ra</h2>
        <p className="ez-auth-brand-sub">
          EzEdu AI đọc tài liệu bạn dạy, phân loại nội dung và dựng bộ đề bám đúng chương trình.
        </p>
        <ul className="ez-auth-points">
          {BRAND_POINTS.map((point) => (
            <li key={point} className="ez-auth-point">
              <span className="ez-auth-point-mark">
                <Check size={15} />
              </span>
              <span>{point}</span>
            </li>
          ))}
        </ul>
      </aside>

      <Card>
        <CardBody>
          <div className="ez-auth-form-head">
            <h1 className="ez-auth-title">Đăng nhập</h1>
            <p className="ez-auth-subtitle">Dùng tài khoản EzEdu AI của bạn để tiếp tục.</p>
          </div>

          {success && <Alert tone="success" style={{ marginBottom: 'var(--ez-space-4)' }}>{success}</Alert>}
          {error && <Alert tone="error" style={{ marginBottom: 'var(--ez-space-4)' }}>{error}</Alert>}

          <form onSubmit={handleSubmit} noValidate>
            <div className="ez-auth-fields">
              <FormField label="Email đăng nhập" error={fieldErrors.email}>
                <Input
                  type="email"
                  autoComplete="email"
                  value={email}
                  placeholder="name@example.com"
                  disabled={loading}
                  invalid={Boolean(fieldErrors.email)}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </FormField>

              <FormField label="Mật khẩu" error={fieldErrors.password}>
                <Input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  placeholder="••••••••"
                  disabled={loading}
                  invalid={Boolean(fieldErrors.password)}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </FormField>

              <Button type="submit" size="lg" block loading={loading}>
                Đăng nhập
              </Button>
            </div>
          </form>

          <div className="ez-auth-divider">hoặc</div>

          <div className="ez-auth-alt">
            <GoogleSignInButton onCredential={google.onCredential} disabled={dangDangNhap} />
            {google.error && <Alert tone="error">{google.error}</Alert>}
            <FacebookSignInButton onCredential={facebook.onCredential} disabled={dangDangNhap} />
            {facebook.error && <Alert tone="error">{facebook.error}</Alert>}
          </div>
          {google.dialogProps && <SocialRoleDialog {...google.dialogProps} />}
          {facebook.dialogProps && <SocialRoleDialog {...facebook.dialogProps} />}

          <p className="ez-auth-footer">
            Chưa có tài khoản?{' '}
            <Button variant="link" onClick={() => navigate('/register')}>
              Đăng ký ngay
            </Button>
          </p>
        </CardBody>
      </Card>
    </div>
  );
};

export default LoginPage;
