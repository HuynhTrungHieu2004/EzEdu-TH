interface Props {
  /** Cạnh của ô vuông, tính bằng px. */
  size?: number;
  className?: string;
}

/**
 * Dấu hiệu nhận diện EzEdu AI.
 *
 * Hai dòng chữ biến thành một dấu tích: học liệu vào, câu trả lời đã kiểm chứng
 * ra — đúng việc sản phẩm làm. Chọn hình này sau khi so ba hướng; hai hướng kia
 * (ba vạch kèm chấm tròn, và mũi tên) đọc ra thành nút menu và nút tua nhanh,
 * lại nát ở cỡ 16px của favicon.
 *
 * Gộp một chỗ vì trước đây có tới BỐN nhận diện chỏi nhau: ba ô chữ "Ez" tự vẽ
 * bằng CSS ở sidebar, header công khai và chân trang (mỗi chỗ một kích thước),
 * cộng một favicon hình tài liệu màu chàm chẳng liên quan gì tới ba cái kia.
 *
 * KHÔNG nhận chữ thay thế. Cấu hình `logo_text` mặc định là "EzEdu AI" — tên
 * thương hiệu đầy đủ — và code cũ cắt lấy hai ký tự đầu để chế ra một cái mác
 * giả, chỉ vì chưa có logo. Giữ nhánh đó thì logo không bao giờ hiện trên trang
 * công khai, vì `logo_text` luôn có giá trị. Chữ thương hiệu vẫn hiện bình
 * thường bên cạnh logo qua `site_name`.
 *
 * `viewBox` 48×48 nên mọi toạ độ bên trong là bội của khung; đổi `size` không
 * cần sửa gì bên trong. Gradient có id kèm hậu tố để nhiều bản trên cùng trang
 * không giẫm lên nhau — id trùng thì bản vẽ sau nuốt màu của bản trước.
 */
export function BrandMark({ size = 32, className }: Props) {
  const gradientId = `ez-brand-gradient-${size}`;

  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-label="EzEdu AI"
      style={{ display: 'block', flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8341FA" />
          <stop offset="1" stopColor="#5906EB" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="13" fill={`url(#${gradientId})`} />
      <g fill="#FFFFFF">
        <rect x="12" y="13" width="21" height="4.6" rx="2.3" />
        <rect x="12" y="21" width="14" height="4.6" rx="2.3" />
      </g>
      <path
        d="M14 31.5 19.5 37 34 22.5"
        stroke="#FFAB43"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}
