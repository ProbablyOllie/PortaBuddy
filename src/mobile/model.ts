import { spanOf, visibleOn } from '../lib/project';
import type { Device, Face, Project } from '../lib/types';

export type RackRow =
  | { kind: 'device'; device: Device; top: number; bottom: number; /** Seeing the back of a full-depth device. */ back: boolean }
  | { kind: 'free'; top: number; bottom: number };

/**
 * One side of a rack as a top-to-bottom list: a row per device seen from that side, and one row
 * per run of free units (free on this side — a half-depth device may sit behind it).
 */
export function rackRows(project: Project, rackId: string, face: Face): RackRow[] {
  const rack = project.racks.find((r) => r.id === rackId);
  if (!rack) return [];
  const devices = project.devices.filter((d) => d.rackId === rackId && visibleOn(d, face));
  const at = (u: number) => devices.find((d) => u >= d.positionU && u < d.positionU + d.heightU);
  const rows: RackRow[] = [];
  let u = rack.heightU;
  while (u >= 1) {
    const d = at(u);
    if (d) {
      const [bottom, top] = spanOf(d);
      rows.push({ kind: 'device', device: d, top: Math.min(top, rack.heightU), bottom, back: d.facing !== face });
      u = bottom - 1;
    } else {
      const top = u;
      while (u >= 1 && !at(u)) u--;
      rows.push({ kind: 'free', top, bottom: u + 1 });
    }
  }
  return rows;
}

export { freePositions, uRange } from '../lib/project';

export { textOn } from '../lib/templates';

/** Short label for a port tile: its trailing number, or the start of its name. */
export function portTileLabel(name: string, fallback: string): string {
  const n = /(\d+)$/.exec(name)?.[1];
  if (n) return n;
  return (name || fallback).slice(0, 4);
}
