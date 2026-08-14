import { useContext } from 'react';
import { MotionContext, type MotionContextValue } from './MotionProvider';

export function useMotion(): MotionContextValue {
  const motion = useContext(MotionContext);

  if (!motion) {
    throw new Error('useMotion must be used within a MotionProvider.');
  }

  return motion;
}
