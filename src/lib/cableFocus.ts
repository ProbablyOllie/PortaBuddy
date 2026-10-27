import type { Cable } from './types';

export type CableMode = 'auto' | 'all' | 'focus' | 'off';

/** Above this many cables, Auto stops drawing every cable and focuses on what you're looking at. */
export const AUTO_FOCUS_THRESHOLD = 30;
/** Cable labels are drawn on the lines only when this few are in focus, so they stay readable. */
export const MAX_LABELLED = 16;

export function effectiveMode(mode: CableMode, cableCount: number): Exclude<CableMode, 'auto'> {
  if (mode !== 'auto') return mode;
  return cableCount > AUTO_FOCUS_THRESHOLD ? 'focus' : 'all';
}

/** Cables to draw in focus mode: those of the selected or hovered device, plus the selected cable. */
export function focusedCables(cables: Cable[], focus: { deviceIds: (string | null | undefined)[]; cableId?: string | null }): Set<string> {
  const devices = new Set(focus.deviceIds.filter(Boolean));
  const out = new Set<string>();
  for (const c of cables) {
    if (c.id === focus.cableId || devices.has(c.a.deviceId) || devices.has(c.b.deviceId)) out.add(c.id);
  }
  return out;
}

/** Map an older saved setting (Show / Dim / Hide) onto the current modes. */
export function migrateCableMode(old: unknown): CableMode {
  switch (old) {
    case 'show':
      return 'all';
    case 'dim':
      return 'focus';
    case 'hide':
      return 'off';
    case 'auto':
    case 'all':
    case 'focus':
    case 'off':
      return old;
    default:
      return 'auto';
  }
}
