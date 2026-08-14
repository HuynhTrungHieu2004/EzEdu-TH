import { useRef, type ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useMotion } from './useMotion';
import { MOTION_DURATION, MOTION_EASE, MOTION_STAGGER } from './timing';

gsap.registerPlugin(ScrollTrigger);

export interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  /** Phần tử con được reveal; mặc định là chính khối này. */
  selector?: string;
  /** Độ trễ giữa các phần tử khi có nhiều mục. */
  stagger?: number;
}

/**
 * Reveal theo cuộn cho trang công khai.
 *
 * ScrollTrigger được đăng ký một lần ở đây (spec §8) và mọi tween đều nằm trong
 * scope của khối, nên rời trang là `useGSAP` tự revert cả tween lẫn trigger.
 * Ở chế độ giảm chuyển động không tạo trigger nào: nội dung hiện sẵn.
 */
export function ScrollReveal({ children, className, selector, stagger = MOTION_STAGGER }: ScrollRevealProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { reducedMotion } = useMotion();

  useGSAP(() => {
    const root = rootRef.current;
    if (!root) return;

    const targets = selector
      ? Array.from(root.querySelectorAll<HTMLElement>(selector))
      : [root];
    if (targets.length === 0) return;

    if (reducedMotion) {
      gsap.set(targets, { clearProps: 'all' });
      return;
    }

    gsap.fromTo(
      targets,
      { autoAlpha: 0, y: 24 },
      {
        autoAlpha: 1,
        y: 0,
        duration: MOTION_DURATION.slow,
        stagger,
        ease: MOTION_EASE.emphasized,
        clearProps: 'transform,opacity,visibility',
        scrollTrigger: {
          trigger: root,
          start: 'top 85%',
          once: true,
        },
      },
    );
  }, { scope: rootRef, dependencies: [reducedMotion, selector, stagger], revertOnUpdate: true });

  return <div ref={rootRef} className={className}>{children}</div>;
}
