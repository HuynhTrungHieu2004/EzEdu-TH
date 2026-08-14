import { useRef, type ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useMotion } from './useMotion';
import { MOTION_DURATION, MOTION_EASE } from './timing';

export interface PageEntranceProps {
  children: ReactNode;
  routeKey: string;
  className?: string;
}

export function PageEntrance({ children, routeKey, className }: PageEntranceProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { reducedMotion } = useMotion();

  useGSAP(() => {
    const target = rootRef.current;
    if (!target) return;

    if (reducedMotion) {
      gsap.set(target, { clearProps: 'all' });
      return;
    }

    gsap.fromTo(
      target,
      { autoAlpha: 0, y: 18 },
      {
        autoAlpha: 1,
        y: 0,
        duration: MOTION_DURATION.slow,
        ease: MOTION_EASE.emphasized,
        clearProps: 'transform,opacity,visibility',
      },
    );
  }, { scope: rootRef, dependencies: [routeKey, reducedMotion], revertOnUpdate: true });

  return (
    <div ref={rootRef} className={className} data-page-entrance>
      {children}
    </div>
  );
}
