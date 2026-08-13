import { Dialog } from './ui';

interface Props {
  open: boolean;
  email: string;
  fullName: string;
  onChoose: (role: 'student' | 'lecturer') => void;
  onCancel: () => void;
}

/**
 * Hỏi vai cho người lần đầu đăng nhập bằng Google.
 *
 * Google không trả về thông tin vai trò, mà hệ thống phân quyền theo vai ngay
 * từ lúc tạo tài khoản. Hỏi một lần ở đây thay vì đoán rồi bắt quản trị sửa sau.
 */
export function GoogleRoleDialog({ open, email, fullName, onChoose, onCancel }: Props) {
  return (
    <Dialog open={open} onClose={onCancel} size="sm" title="Bạn là ai trên EzEdu AI?">
      <p>
        Chào <strong>{fullName}</strong> ({email}). Chọn vai để chúng tôi hiển thị đúng
        công cụ cho bạn.
      </p>
      <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
        <button type="button" className="ez-btn ez-btn-primary" onClick={() => onChoose('student')}>
          Tôi là học sinh
        </button>
        <button type="button" className="ez-btn" onClick={() => onChoose('lecturer')}>
          Tôi là giảng viên
        </button>
      </div>
    </Dialog>
  );
}
