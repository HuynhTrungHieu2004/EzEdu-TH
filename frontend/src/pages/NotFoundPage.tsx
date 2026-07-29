import { useNavigate } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { Button, ErrorState } from '../components/ui';
import { useAuth } from '../hooks/useAuth';

/**
 * Trang 404.
 *
 * Trước đây route `*` render thẳng trang chủ, nên một URL sai lại hiện trang
 * giới thiệu sản phẩm và người dùng không biết mình đã gõ sai.
 * Xem docs/ui-redesign/01-audit-report.md §6.2 (lỗi H4).
 */
export default function NotFoundPage() {
  const navigate = useNavigate();
  const { status, homePath } = useAuth();

  const isSignedIn = status === 'authenticated';
  const homeLabel = isSignedIn ? 'Về tổng quan' : 'Về trang chủ';
  const homeTo = isSignedIn ? homePath : '/';

  return (
    <div className="ez-container" style={{ paddingBlock: 'var(--ez-space-16)' }}>
      <ErrorState
        titleAs="h1"
        icon={<FileQuestion size={28} />}
        title="Không tìm thấy trang này"
        description="Đường dẫn có thể đã thay đổi, bị gõ sai, hoặc nội dung đã được chuyển sang chỗ khác."
        actions={
          <>
            <Button onClick={() => navigate(homeTo, { replace: true })}>{homeLabel}</Button>
            <Button variant="outline" onClick={() => navigate(-1)}>
              Quay lại trang trước
            </Button>
          </>
        }
      />
    </div>
  );
}
