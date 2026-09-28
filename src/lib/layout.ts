import { groupColumns } from './project';
import type { Device } from './types';

/** Height of one rack unit in CSS pixels (before zoom). */
export const U_PX = 40;
/** Width of the usable 19" face of a rack in CSS pixels. */
export const FACE_W = 640;
/** Width of the device label/drag handle on the left of each device. */
export const HANDLE_W = 112;
export const GROUP_GAP = 8;

/** Port cell size so every port on the device fits on its face. */
export function portSize(device: Device): { w: number; h: number } {
  const groups = device.portGroups.filter((g) => g.ports.length);
  const cols = groups.reduce((n, g) => n + groupColumns(g), 0);
  const rows = Math.max(1, ...groups.map((g) => g.rows));
  const availW = FACE_W - HANDLE_W - 16 - GROUP_GAP * Math.max(0, groups.length - 1);
  const availH = device.heightU * U_PX - 8;
  const w = Math.max(7, Math.min(20, Math.floor(availW / Math.max(1, cols)) - 2));
  const h = Math.max(6, Math.min(16, Math.floor(availH / rows) - 2));
  return { w, h };
}
