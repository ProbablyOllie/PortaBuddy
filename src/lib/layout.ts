import { groupColumns } from './project';
import type { Device, PortGroup } from './types';

/** Height of one rack unit in CSS pixels (before zoom). */
export const U_PX = 40;
/** Width of the usable 19" face of a rack in CSS pixels. */
export const FACE_W = 640;
/** Width of the device label/drag handle on the left of each device. */
export const HANDLE_W = 112;
export const GROUP_GAP = 8;

/** Port cell size so every port shown on this side of the device fits. */
export function portSize(device: Device, shown: PortGroup[]): { w: number; h: number } {
  const groups = shown.filter((g) => g.ports.length);
  const cols = groups.reduce((n, g) => n + groupColumns(g), 0);
  const rows = Math.max(1, ...groups.map((g) => g.rows));
  const availW = FACE_W - HANDLE_W - 16 - GROUP_GAP * Math.max(0, groups.length - 1);
  const availH = device.heightU * U_PX - 8;
  const w = Math.max(7, Math.min(20, Math.floor(availW / Math.max(1, cols)) - 2));
  const h = Math.max(6, Math.min(16, Math.floor(availH / rows) - 2));
  return { w, h };
}

/** Height of an empty rack unit in compact mode. */
export const EMPTY_U_PX = 14;

/** Vertical layout of one rack: every U has its own height, so empty space can be drawn short. */
export interface RackLayout {
  heightU: number;
  /** Height of each U, indexed by U number (1-based; index 0 unused). */
  heights: number[];
  /** Distance from the top of the rack to the top of each U. */
  tops: number[];
  total: number;
}

/**
 * Units occupied by a device on either side of the rack stay full height, so the front and rear
 * of a rack always line up; in compact mode the rest shrink.
 */
export function rackLayout(heightU: number, devices: Pick<Device, 'positionU' | 'heightU'>[], compact: boolean): RackLayout {
  const occupied = new Array<boolean>(heightU + 1).fill(false);
  for (const d of devices) {
    for (let u = d.positionU; u < d.positionU + d.heightU && u <= heightU; u++) occupied[u] = true;
  }
  const heights = occupied.map((o, u) => (u === 0 ? 0 : compact && !o ? EMPTY_U_PX : U_PX));
  const tops = new Array<number>(heightU + 1).fill(0);
  let y = 0;
  for (let u = heightU; u >= 1; u--) {
    tops[u] = y;
    y += heights[u];
  }
  return { heightU, heights, tops, total: y };
}

/** The U at a distance from the top of the rack (clamped to the rack). */
export function uAtY(layout: RackLayout, y: number): number {
  for (let u = layout.heightU; u >= 1; u--) {
    if (y < layout.tops[u] + layout.heights[u]) return u;
  }
  return 1;
}

/** Box covering `heightU` units whose lowest unit is `positionU`. */
export function spanBox(layout: RackLayout, positionU: number, heightU: number): { top: number; height: number } {
  const topU = Math.min(layout.heightU, positionU + heightU - 1);
  let height = 0;
  for (let u = positionU; u <= topU; u++) height += layout.heights[u];
  return { top: layout.tops[topU], height };
}
