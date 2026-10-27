import { create } from 'zustand';
import type { Face, PortRef } from '../lib/types';

export type Tab = 'rack' | 'cables' | 'more';

/** What the port picker is picking for. */
export type PickPurpose = { kind: 'new'; from: PortRef } | { kind: 'repatch'; cableId: string; from: PortRef };

/** Screens and sheets opened on top of a tab. Each one is a browser history entry, so Back closes it. */
export type Layer =
  | { kind: 'device'; id: string; /** Port to highlight, e.g. after following a cable. */ port?: string }
  | { kind: 'port'; deviceId: string; portId: string }
  | { kind: 'cable'; id: string }
  | { kind: 'pick'; purpose: PickPurpose }
  | { kind: 'add'; rackId: string; face: Face; top?: number; bottom?: number }
  | { kind: 'rack'; id: string }
  | { kind: 'search' };

export const isSheet = (l: Layer) => l.kind !== 'device';

interface Nav {
  tab: Tab;
  rackId: string | null;
  face: Face;
  layers: Layer[];
  setTab: (t: Tab) => void;
  setRack: (id: string) => void;
  setFace: (f: Face) => void;
  push: (l: Layer) => void;
  /** Swap the top layer for another without adding a history entry (e.g. picker → result). */
  replaceTop: (l: Layer) => void;
  /** Replace the top `count` layers with one (e.g. port sheet + picker → the new cable). */
  collapse: (count: number, l: Layer) => void;
  back: () => void;
  /** Drop every layer (e.g. when changing tab or project). */
  reset: () => void;
}

const hasHistory = () => typeof window !== 'undefined' && typeof history !== 'undefined';

export const useNav = create<Nav>()((set, get) => ({
  tab: 'rack',
  rackId: null,
  face: 'front',
  layers: [],
  setTab: (tab) => {
    get().reset();
    set({ tab });
  },
  setRack: (rackId) => set({ rackId }),
  setFace: (face) => set({ face }),
  push: (l) => {
    const layers = [...get().layers, l];
    set({ layers });
    if (hasHistory()) history.pushState({ pbDepth: layers.length }, '');
  },
  replaceTop: (l) => {
    const layers = get().layers;
    if (!layers.length) return get().push(l);
    set({ layers: [...layers.slice(0, -1), l] });
  },
  collapse: (count, l) => {
    const layers = get().layers;
    const n = Math.min(count, layers.length);
    if (n <= 1) return get().replaceTop(l);
    set({ layers: [...layers.slice(0, layers.length - n), l] });
    // Drop the history entries of the layers that went away.
    if (hasHistory()) history.go(-(n - 1));
  },
  back: () => {
    if (!get().layers.length) return;
    // The popstate handler does the actual pop, so the browser's Back button and ours agree.
    if (hasHistory()) history.back();
    else set({ layers: get().layers.slice(0, -1) });
  },
  reset: () => {
    const n = get().layers.length;
    if (!n) return;
    set({ layers: [] });
    if (hasHistory()) history.go(-n);
  },
}));

/** Keep layers in step with the browser history (Back button, swipe back). */
export function onPopState(e: PopStateEvent) {
  const depth = (e.state as { pbDepth?: number } | null)?.pbDepth ?? 0;
  const { layers } = useNav.getState();
  if (layers.length > depth) useNav.setState({ layers: layers.slice(0, depth) });
}
