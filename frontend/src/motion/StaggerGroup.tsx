import { useRef, type ReactNode } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useMotion } from './useMotion';
import { MOTION_DURATION, MOTION_EASE, MOTION_STAGGER } from './timing';

export interface StaggerGroupProps {
  children: ReactNode;
  className?: string;
  selector?: string;
}

const DEFAULT_SELECTOR = '[data-motion-item]';

export function StaggerGroup({
  children,
  className,
  selector = DEFAULT_SELECTOR,
}: StaggerGroupProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const { reducedMotion } = useMotion();

  useGSAP(() => {
    const targets = rootRef.current?.querySelectorAll<HTMLElement>(selector);
    if (!targets?.length) return;

    if (reducedMotion) {
      gsap.set(targets, { clearProps: 'all' });
      return;
    }

    gsap.fromTo(
      targets,
      { autoAlpha: 0, y: 18 },
      {
        autoAlpha: 1,
        y: 0,
        duration: MOTION_DURATION.slow,
        stagger: MOTION_STAGGER,
        ease: MOTION_EASE.emphasized,
        clearProps: 'transform,opacity,visibility',
      },
    );
  }, { scope: rootRef, dependencies: [selector, reducedMotion], revertOnUpdate: true });

  return <div ref={rootRef} className={className}>{children}</div>;
}
