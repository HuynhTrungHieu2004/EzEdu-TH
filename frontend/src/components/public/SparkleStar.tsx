/**
 * SparkleStar — hoạ tiết trang trí gốc (4 cánh sao / sparkle / blob), tự vẽ
 * bằng SVG, không sao chép tài sản của bất kỳ trang nào khác. Dùng quanh
 * hero/section-break theo tinh thần MagicSchool — chỉ trang trí, không mang
 * thông tin, nên ẩn hoàn toàn với trình đọc màn hình.
 */
export type SparkleVariant = 'four-point' | 'sparkle' | 'blob';

export interface SparkleStarProps {
  variant?: SparkleVariant;
  size?: number;
  className?: string;
}

export default function SparkleStar({ variant = 'four-point', size = 32, className }: SparkleStarProps) {
  if (variant === 'blob') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        aria-hidden="true"
        focusable="false"
        className={className}
      >
        <path
          d="M50 6C68 6 90 20 94 42C98 64 82 88 58 94C34 100 10 84 6 60C2 36 20 6 50 6Z"
          fill="currentColor"
        />
      </svg>
    );
  }

  if (variant === 'sparkle') {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        aria-hidden="true"
        focusable="false"
        className={className}
      >
        <path
          d="M50 4 L58 40 L96 50 L58 60 L50 96 L42 60 L4 50 L42 40 Z"
          fill="currentColor"
        />
        <circle cx="82" cy="18" r="5" fill="currentColor" />
        <circle cx="14" cy="78" r="3.5" fill="currentColor" />
      </svg>
    );
  }

  // four-point (mặc định) — ngôi sao 4 cánh nhọn, đúng tinh thần MagicSchool
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      <path d="M50 2 C54 34 66 46 98 50 C66 54 54 66 50 98 C46 66 34 54 2 50 C34 46 46 34 50 2 Z" fill="currentColor" />
    </svg>
  );
}
