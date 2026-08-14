import {
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { UNSAFE_NavigationContext } from 'react-router-dom';
import { PathnameNavigationEpochContext } from './PathnameNavigationEpochContext';

const initialPathnameEpoch = {};

interface PathnameNavigationEpochProviderProps {
  children: ReactNode;
}

/**
 * Publishes a fresh token as soon as a pathname navigation reaches browser
 * history, even when the matching route later suspends and its render is
 * abandoned. Search/hash-only history entries intentionally keep the token.
 */
export function PathnameNavigationEpochProvider({ children }: PathnameNavigationEpochProviderProps) {
  const navigationContext = useContext(UNSAFE_NavigationContext);
  const observedPathname = useRef(window.location.pathname);
  const [pathnameEpoch, setPathnameEpoch] = useState<object>(() => initialPathnameEpoch);

  const observePathname = useCallback(() => {
    const nextPathname = window.location.pathname;
    if (nextPathname === observedPathname.current) return;

    observedPathname.current = nextPathname;
    setPathnameEpoch({});
  }, []);

  useLayoutEffect(() => {
    window.addEventListener('popstate', observePathname);
    return () => window.removeEventListener('popstate', observePathname);
  }, [observePathname]);

  const wrappedNavigationContext = useMemo(() => {
    const { navigator } = navigationContext;

    return {
      ...navigationContext,
      navigator: {
        ...navigator,
        push(to: Parameters<typeof navigator.push>[0], state?: unknown, options?: Parameters<typeof navigator.push>[2]) {
          navigator.push(to, state, options);
          observePathname();
        },
        replace(to: Parameters<typeof navigator.replace>[0], state?: unknown, options?: Parameters<typeof navigator.replace>[2]) {
          navigator.replace(to, state, options);
          observePathname();
        },
      },
    };
  }, [navigationContext, observePathname]);

  return (
    <UNSAFE_NavigationContext.Provider value={wrappedNavigationContext}>
      <PathnameNavigationEpochContext.Provider value={pathnameEpoch}>
        {children}
      </PathnameNavigationEpochContext.Provider>
    </UNSAFE_NavigationContext.Provider>
  );
}
