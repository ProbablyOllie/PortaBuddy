import { create } from 'zustand';
import type { PortRef } from './lib/types';
import { useStore } from './store';

/** Transient state while the user drags a patch lead from a port. */
export interface Wiring {
  from: PortRef;
  /** Set when an existing cable end is being moved to another port. */
  cableId: string | null;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
}

interface WiringState {
  wiring: Wiring | null;
  hoverPortId: string | null;
  setWiring: (w: Wiring | null) => void;
  setHoverPort: (id: string | null) => void;
}

export const useWiring = create<WiringState>()((set) => ({
  wiring: null,
  hoverPortId: null,
  setWiring: (wiring) => set({ wiring }),
  setHoverPort: (hoverPortId) => set({ hoverPortId }),
}));

let suppressUntil = 0;

/**
 * After a drag ends on a different element than it started, the browser fires `click` on their
 * common ancestor. Call this when a drag finishes so ancestors can ignore that stray click.
 */
export function suppressNextClick() {
  suppressUntil = Date.now() + 100;
}

export function clickSuppressed(): boolean {
  return Date.now() < suppressUntil;
}

/** Start dragging a lead from a port; if the port already has a cable, that cable end is picked up. */
export function beginWiring(clientX: number, clientY: number, from: PortRef) {
  const cable = useStore.getState().project.cables.find((c) => c.a.portId === from.portId || c.b.portId === from.portId);
  useWiring.getState().setWiring({
    from,
    cableId: cable?.id ?? null,
    startX: clientX,
    startY: clientY,
    x: clientX,
    y: clientY,
    moved: false,
  });
}

/** The port element under a viewport point, looking through cables drawn on top of it. */
export function portUnder(clientX: number, clientY: number): HTMLElement | null {
  for (const el of document.elementsFromPoint(clientX, clientY)) {
    if (el instanceof HTMLElement && el.dataset.portId) return el;
  }
  return null;
}
