import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { AnimatedCounter } from '../../src/motion/AnimatedCounter';
import { MotionProvider } from '../../src/motion/MotionProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <MotionProvider>
      <output data-animated-counter>
        <AnimatedCounter value={12.5} duration={0.08} formatter={(value) => value.toFixed(1)} />
      </output>
    </MotionProvider>
  </StrictMode>,
);
