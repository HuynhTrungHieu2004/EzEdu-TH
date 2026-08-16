import { useState, useEffect } from 'react';
import type { FormEvent } from 'react';
import { Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '../api/authApi';
import { getApiErrorDetail } from '../api/errors';
import { useAuth } from '../hooks/useAuth';
import { Alert, Button, Card, CardBody, FormField, Input, Select } from '../components/ui';
import { GoogleSignInButton } from '../components/GoogleSignInButton';
import { FacebookSignInButton } from '../components/FacebookSignInButton';
import { SocialRoleDialog } from '../components/SocialRoleDialog';
import { useGoogleSignIn } from '../hooks/useGoogleSignIn';
import { useFacebookSignIn } from '../hooks/useFacebookSignIn';
import './auth.css';

const BRAND_POINTS = [
  'Giáo viên: tải học liệu, sinh câu hỏi, dựng ma trận đề',
  'Học sinh: ôn tập theo chủ đề và xem tiến độ từng tuần',
  'Mỗi câu trả lời của AI đều kèm nguồn trích dẫn',
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 6;

type FieldErrors = {
  fullName?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
};

const RegisterPage = () => {
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'student' | 'lecturer'>('student');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const navigate = useNavigate();
  const { refresh } = useAuth();
  const google = useGoogleSignIn('Đăng ký bằng Google thất bại.');
  const facebook = useFacebookSignIn('Đăng ký bằng Facebook thất bại.');
  // Đang xử lý một nhà cung cấp thì khoá cả hai nút: bấm nút kia giữa
  // chừng sẽ chạy hai luồng đăng nhập song song, và luồng nào về sau sẽ
  // ghi đè access_token của luồng về trước.
  const dangDangNhap = google.dangXuLy || facebook.dangXuLy;

  useEffect(() => {
    // If already logged in, redirect to dashboard
    if (localStorage.getItem('access_token')) {
      navigate('/dashboard');
    }
  }, [navigate]);

  /** Mỗi lỗi hiện cạnh đúng trường gây ra nó, không gộp vào một dòng trên đầu. */
  function validate(): boolean {
    const next: FieldErrors = {};
    if (!fullName.trim()) next.fullName = 'Nhập họ và tên.';
    if (!email.trim()) next.email = 'Nhập email.';
    else if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Email chưa đúng định dạng.';
    if (password.length < MIN_PASSWORD_LENGTH) {
      next.password = `Mật khẩu phải chứa ít nhất ${MIN_PASSWORD_LENGTH} ký tự.`;
    }
    if (confirmPassword !== password) next.confirmPassword = 'Mật khẩu xác nhận không khớp.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setLoading(true);
    try {
      await authApi.register({ email, full_name: fullName, password, role });
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
      setError(detail ?? 'Đăng ký không thành công. Email có thể đã tồn tại hoặc không hợp lệ.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ez-auth">
      <aside className="ez-auth-brand" aria-hidden="true">
        <h2 className="ez-auth-brand-title">Tạo tài khoản EzEdu AI</h2>
        <p className="ez-auth-brand-sub">
          Một tài khoản dùng chung cho việc dạy và việc học, phân quyền theo vai trò bạn chọn.
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
            <h1 className="ez-auth-title">Đăng ký</h1>
            <p className="ez-auth-subtitle">Chỉ mất một phút để bắt đầu.</p>
          </div>

          {error && <Alert tone="error" style={{ marginBottom: 'var(--ez-space-4)' }}>{error}</Alert>}

          <form onSubmit={handleSubmit} noValidate>
            <div className="ez-auth-fields">
              <FormField label="Họ và tên" error={fieldErrors.fullName}>
                <Input
                  autoComplete="name"
                  value={fullName}
                  placeholder="Nguyễn Văn A"
                  disabled={loading}
                  invalid={Boolean(fieldErrors.fullName)}
                  onChange={(event) => setFullName(event.target.value)}
                />
              </FormField>

              <FormField label="Email" error={fieldErrors.email}>
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

              <FormField label="Bạn là">
                <Select
                  value={role}
                  disabled={loading}
                  options={[
                    { value: 'student', label: 'Học sinh' },
                    { value: 'lecturer', label: 'Giảng viên' },
                  ]}
                  onChange={(event) => setRole(event.target.value as 'student' | 'lecturer')}
                />
              </FormField>

              <FormField
                label="Mật khẩu"
                hint={`Tối thiểu ${MIN_PASSWORD_LENGTH} ký tự`}
                error={fieldErrors.password}
              >
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  placeholder="••••••••"
                  disabled={loading}
                  invalid={Boolean(fieldErrors.password)}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </FormField>

              <FormField label="Xác nhận mật khẩu" error={fieldErrors.confirmPassword}>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  placeholder="••••••••"
                  disabled={loading}
                  invalid={Boolean(fieldErrors.confirmPassword)}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                />
              </FormField>

              <Button type="submit" size="lg" block loading={loading}>
                Đăng ký tài khoản
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
            Đã có tài khoản?{' '}
            <Button variant="link" onClick={() => navigate('/login')}>
              Đăng nhập
            </Button>
          </p>
        </CardBody>
      </Card>
    </div>
  );
};

export default RegisterPage;
