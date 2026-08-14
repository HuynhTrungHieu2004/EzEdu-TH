import { useRef, type ComponentPropsWithoutRef, type PointerEvent } from 'react';
import { useGSAP } from '@gsap/react';
import { gsap } from 'gsap';
import { useMotion } from './useMotion';

export interface MotionCardProps extends ComponentPropsWithoutRef<'div'> {
  tilt?: number;
  lift?: number;
}

type QuickSetter = (value: number) => void;

const noop: QuickSetter = () => undefined;

export function MotionCard({
  tilt = 6,
  lift = -4,
  onPointerMove,
  onPointerLeave,
  ...props
}: MotionCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const rotationX = useRef<QuickSetter>(noop);
  const rotationY = useRef<QuickSetter>(noop);
  const translateY = useRef<QuickSetter>(noop);
  const { coarsePointer, reducedMotion } = useMotion();
  const interactive = !coarsePointer && !reducedMotion;

  useGSAP(() => {
    const card = cardRef.current;
    if (!card) return;

    if (!interactive) return;

    rotationX.current = gsap.quickTo(card, 'rotationX', { duration: 0.24, ease: 'power3.out' });
    rotationY.current = gsap.quickTo(card, 'rotationY', { duration: 0.24, ease: 'power3.out' });
    translateY.current = gsap.quickTo(card, 'y', { duration: 0.24, ease: 'power3.out' });

    return () => {
      rotationX.current = noop;
      rotationY.current = noop;
      translateY.current = noop;
    };
  }, { scope: cardRef, dependencies: [interactive, tilt, lift], revertOnUpdate: true });

  const reset = () => {
    rotationX.current(0);
    rotationY.current(0);
    translateY.current(0);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    onPointerMove?.(event);
    if (!interactive || event.defaultPrevented) return;

    const bounds = event.currentTarget.getBoundingClientRect();
    const horizontal = ((event.clientX - bounds.left) / bounds.width - 0.5) * 2;
    const vertical = ((event.clientY - bounds.top) / bounds.height - 0.5) * 2;
    rotationX.current(-vertical * tilt);
    rotationY.current(horizontal * tilt);
    translateY.current(lift);
  };

  const handlePointerLeave = (event: PointerEvent<HTMLDivElement>) => {
    onPointerLeave?.(event);
    reset();
  };

  return (
    <div
      {...props}
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
    />
  );
}
