/**
 * CharacterIllustration — nhân vật minh hoạ phẳng, nhiều màu, phong cách
 * flat/cartoon kiểu Canva (khối bo tròn, mặt đơn giản) — tự vẽ SVG gốc,
 * KHÔNG dùng ảnh chụp thật, KHÔNG sao chép minh hoạ của bất kỳ trang nào
 * khác. Dùng màu qua token để tự đổi theo theme sáng/tối.
 */
export type CharacterVariant = 'hero' | 'teacher' | 'student';

export interface CharacterIllustrationProps {
  variant: CharacterVariant;
  className?: string;
}

export default function CharacterIllustration(props: CharacterIllustrationProps) {
  void props;
  return null;
}
