import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useMotion } from './useMotion';

export interface ConfettiProps {
  /** Bật một lần khi có thành tích đáng ăn mừng. */
  active: boolean;
  /** Số mảnh trên thiết bị con trỏ chính xác; thiết bị cảm ứng dùng một nửa. */
  pieces?: number;
}

const COLORS = ['var(--ez-accent)', 'var(--ez-primary)', 'var(--ez-nav-bg)'];

/**
 * Confetti tiết chế: một loạt mảnh nhỏ rơi trong ~1,4s rồi tự dọn.
 *
 * Không chạy khi người dùng yêu cầu giảm chuyển động, và giảm một nửa số mảnh
 * trên thiết bị cảm ứng (spec §7.5). Không dùng canvas — vài chục span đủ cho
 * hiệu ứng một lần, không cần thêm dependency.
 */
export function Confetti({ active, pieces = 18 }: ConfettiProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { reducedMotion, coarsePointer } = useMotion();

  useGSAP(() => {
    const root = rootRef.current;
    if (!root || !active || reducedMotion) return;

    const count = coarsePointer ? Math.ceil(pieces / 2) : pieces;
    const nodes: HTMLSpanElement[] = [];
    for (let index = 0; index < count; index += 1) {
      const piece = document.createElement('span');
      piece.className = 'ez-confetti-piece';
      piece.style.backgroundColor = COLORS[index % COLORS.length];
      piece.style.left = `${(index + 0.5) * (100 / count)}%`;
      root.append(piece);
      nodes.push(piece);
    }

    const timeline = gsap.timeline();
    timeline.fromTo(
      nodes,
      { y: -12, autoAlpha: 0, rotate: 0 },
      {
        y: () => 120 + Math.abs(Math.sin(nodes.length) * 40),
        autoAlpha: 1,
        rotate: (index: number) => (index % 2 === 0 ? 160 : -160),
        duration: 1.1,
        ease: 'power1.in',
        stagger: 0.03,
      },
    );
    timeline.to(nodes, { autoAlpha: 0, duration: 0.3 }, '-=0.35');

    // useGSAP revert dọn tween; các node do mình tạo thì tự xoá.
    return () => {
      nodes.forEach((node) => node.remove());
    };
  }, { scope: rootRef, dependencies: [active, reducedMotion, coarsePointer, pieces], revertOnUpdate: true });

  return <div ref={rootRef} className="ez-confetti" aria-hidden="true" />;
}
