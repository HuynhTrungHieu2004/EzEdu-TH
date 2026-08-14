import { useRef } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useMotion } from './useMotion';

export interface AnimatedCounterProps {
  value: number;
  duration?: number;
  formatter?: (value: number) => string;
}

const defaultFormatter = (value: number) => String(value);

export function AnimatedCounter({
  value,
  duration = 0.72,
  formatter = defaultFormatter,
}: AnimatedCounterProps) {
  const targetRef = useRef<HTMLSpanElement>(null);
  const { reducedMotion } = useMotion();

  useGSAP(() => {
    const target = targetRef.current;
    if (!target) return;

    const renderIntermediate = (current: number) => {
      target.textContent = formatter(Math.round(current));
    };
    const renderFinal = () => {
      target.textContent = formatter(value);
    };

    if (reducedMotion) {
      renderFinal();
      return;
    }

    const counter = { current: 0 };
    renderIntermediate(counter.current);
    gsap.to(counter, {
      current: value,
      duration,
      ease: 'power3.out',
      onUpdate: () => renderIntermediate(counter.current),
      onComplete: renderFinal,
    });
  }, { scope: targetRef, dependencies: [value, duration, formatter, reducedMotion], revertOnUpdate: true });

  return <span ref={targetRef}>{formatter(reducedMotion ? value : 0)}</span>;
}
