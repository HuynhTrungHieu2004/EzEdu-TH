/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type MotionMode = 'full' | 'reduced';

export interface MotionContextValue {
  mode: MotionMode;
  reducedMotion: boolean;
  coarsePointer: boolean;
}

export const MotionContext = createContext<MotionContextValue | undefined>(undefined);

function getMotionPreferences() {
  return {
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
  };
}

export function MotionProvider({ children }: { children: ReactNode }) {
  const [preferences, setPreferences] = useState(getMotionPreferences);
  const mode: MotionMode = preferences.reducedMotion ? 'reduced' : 'full';

  useEffect(() => {
    document.documentElement.dataset.motion = mode;
  }, [mode]);

  useEffect(() => {
    const reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarsePointerQuery = window.matchMedia('(pointer: coarse)');
    const syncPreferences = () => {
      setPreferences({
        reducedMotion: reducedMotionQuery.matches,
        coarsePointer: coarsePointerQuery.matches,
      });
    };

    reducedMotionQuery.addEventListener('change', syncPreferences);
    coarsePointerQuery.addEventListener('change', syncPreferences);
    syncPreferences();

    return () => {
      reducedMotionQuery.removeEventListener('change', syncPreferences);
      coarsePointerQuery.removeEventListener('change', syncPreferences);
    };
  }, []);

  const value = useMemo<MotionContextValue>(() => ({
    mode,
    reducedMotion: preferences.reducedMotion,
    coarsePointer: preferences.coarsePointer,
  }), [mode, preferences.coarsePointer, preferences.reducedMotion]);

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}
