/**
 * CharacterIllustration — nhân vật minh hoạ phẳng, nhiều màu, phong cách
 * flat/cartoon kiểu Canva (khối bo tròn, mặt đơn giản) — tự vẽ SVG gốc,
 * KHÔNG dùng ảnh chụp thật, KHÔNG sao chép minh hoạ của bất kỳ trang nào
 * khác. Dùng màu qua token để tự đổi theo theme sáng/tối.
 */
import { useId } from 'react';

export type CharacterVariant = 'hero' | 'teacher' | 'student';

export interface CharacterIllustrationProps {
  variant: CharacterVariant;
  className?: string;
}

export default function CharacterIllustration({ variant, className }: CharacterIllustrationProps) {
  const id = useId();
  const title =
    variant === 'hero'
      ? 'Giáo viên và học sinh cùng học với EzEdu AI'
      : variant === 'teacher'
        ? 'Giáo viên soạn bài với EzEdu AI'
        : 'Học sinh luyện tập với EzEdu AI';

  return (
    <svg
      viewBox="0 0 320 320"
      role="img"
      aria-labelledby={`char-illust-${variant}-${id}`}
      className={className}
    >
      <title id={`char-illust-${variant}-${id}`}>{title}</title>

      {/* nền khối bo tròn */}
      <circle cx="160" cy="160" r="150" fill="var(--ez-primary-subtle)" />
      <path
        d="M160 40C220 40 270 90 270 150C270 210 220 250 160 260C100 250 50 210 50 150C50 90 100 40 160 40Z"
        fill="var(--ez-secondary-subtle)"
        opacity="0.6"
      />

      {/* thân người — áo màu accent */}
      <rect x="110" y="180" width="100" height="90" rx="36" fill="var(--ez-accent)" />

      {/* đầu */}
      <circle cx="160" cy="140" r="46" fill="#f0c8a0" />

      {/* tóc */}
      {variant === 'student' ? (
        <path d="M114 128C114 96 142 78 160 78C178 78 206 96 206 128C206 108 188 96 160 96C132 96 114 108 114 128Z" fill="var(--ez-indigo-800)" />
      ) : (
        <path d="M116 118C120 92 140 76 160 76C182 76 202 94 204 120C196 104 180 96 160 96C142 96 124 102 116 118Z" fill="var(--ez-neutral-700)" />
      )}

      {/* mặt cười đơn giản */}
      <circle cx="144" cy="140" r="4.5" fill="var(--ez-neutral-900)" />
      <circle cx="176" cy="140" r="4.5" fill="var(--ez-neutral-900)" />
      <path d="M144 156C150 164 170 164 176 156" stroke="var(--ez-neutral-900)" strokeWidth="4" strokeLinecap="round" fill="none" />

      {/* phụ kiện theo vai trò */}
      {variant === 'teacher' && (
        <rect x="128" y="222" width="64" height="46" rx="8" fill="var(--ez-surface)" stroke="var(--ez-primary)" strokeWidth="3" />
      )}
      {variant === 'student' && (
        <rect x="120" y="216" width="80" height="56" rx="10" fill="var(--ez-surface)" stroke="var(--ez-secondary)" strokeWidth="3" />
      )}
      {variant === 'hero' && (
        <>
          <circle cx="238" cy="222" r="26" fill="var(--ez-secondary)" />
          <path d="M228 222 L235 229 L250 210" stroke="var(--ez-text-on-brand)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </>
      )}
    </svg>
  );
}
