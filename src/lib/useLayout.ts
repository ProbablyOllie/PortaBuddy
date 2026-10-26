import { useSyncExternalStore } from 'react';
import { useStore } from '../store';

/** Below this width the desktop layout (library + rack + inspector side by side) doesn't fit. */
export const MOBILE_QUERY = '(max-width: 819px)';

function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', onChange);
      return () => m.removeEventListener('change', onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** True when the mobile layout should be shown. */
export function useMobileLayout(): boolean {
  const pref = useStore((s) => s.layoutPref);
  const narrow = useMediaQuery(MOBILE_QUERY);
  return pref === 'mobile' || (pref === 'auto' && narrow);
}

/** Touch screens or narrow windows, where offering the mobile layout makes sense. */
export function useTouchOrNarrow(): boolean {
  const coarse = useMediaQuery('(pointer: coarse)');
  const narrow = useMediaQuery(MOBILE_QUERY);
  return coarse || narrow;
}
