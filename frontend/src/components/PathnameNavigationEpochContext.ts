import { createContext, useContext } from 'react';

export const PathnameNavigationEpochContext = createContext<object>({});

export function usePathnameNavigationEpoch(): object {
  return useContext(PathnameNavigationEpochContext);
}
