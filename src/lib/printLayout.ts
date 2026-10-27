import { rackLayout, U_PX } from './layout';
import { describePort, findPort, groupColumns, groupsOn, portCell, visibleOn } from './project';
import { colorName } from './templates';
import type { CableType, DeviceCategory, Face, PortRef, PortType, Project } from './types';

/**
 * Geometry for printed rack elevations, in SVG units. The drawing is not to scale: a real 19" rack
 * is very narrow for its height, which would leave no room for device names. One U is 10 units
 * and the face 24 U wide, which prints at about 5.5 mm per U on A4 or Letter portrait.
 */
export const PRINT = { U: 10, FACE: 240, RAIL: 10, LABEL: 80, PAD: 2.5, GAP: 3, CELL_GAP: 0.7 };

export const CATEGORY_COLORS: Record<DeviceCategory, string> = {
  switch: '#3b82f6',
  'patch-panel': '#10b981',
  server: '#f59e0b',
  router: '#8b5cf6',
  firewall: '#ef4444',
  storage: '#06b6d4',
  power: '#eab308',
  other: '#94a3b8',
};

export interface PrintPort {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** Cable colour, or null when the port is free. */
  color: string | null;
  type: PortType;
}

export interface PrintDevice {
  id: string;
  name: string;
  model: string;
  category: DeviceCategory;
  positionU: number;
  heightU: number;
  y: number;
  h: number;
  /** The back of a full-depth device, seen from the other side of the rack. */
  back: boolean;
  ports: PrintPort[];
}

export interface PrintElevation {
  heightU: number;
  width: number;
  height: number;
  /** Every U with its vertical span, top of the rack first. */
  units: { u: number; y: number; h: number }[];
  devices: PrintDevice[];
}

export function printElevation(project: Project, rackId: string, face: Face, compact: boolean): PrintElevation {
  const rack = project.racks.find((r) => r.id === rackId)!;
  const inRack = project.devices.filter((d) => d.rackId === rackId);
  // Same unit heights as the screen (empty units shrink in compact mode), scaled to print units.
  const layout = rackLayout(rack.heightU, inRack, compact);
  const k = PRINT.U / U_PX;
  const units = Array.from({ length: rack.heightU }, (_, i) => rack.heightU - i).map((u) => ({ u, y: layout.tops[u] * k, h: layout.heights[u] * k }));
  const cableColor = new Map(project.cables.flatMap((c) => [[c.a.portId, c.color] as const, [c.b.portId, c.color] as const]));

  const devices: PrintDevice[] = inRack
    .filter((d) => visibleOn(d, face))
    .map((d) => {
      const topU = Math.min(rack.heightU, d.positionU + d.heightU - 1);
      const y = layout.tops[topU] * k;
      let h = 0;
      for (let u = d.positionU; u <= topU; u++) h += layout.heights[u] * k;

      const groups = groupsOn(d, face)
        .map((x) => x.group)
        .filter((g) => g.ports.length);
      const cols = groups.reduce((n, g) => n + groupColumns(g), 0);
      const rows = Math.max(1, ...groups.map((g) => g.rows));
      const avail = PRINT.FACE - PRINT.LABEL - 2 * PRINT.PAD - PRINT.GAP * Math.max(0, groups.length - 1);
      const pitchX = Math.min(7, avail / Math.max(1, cols));
      const pitchY = Math.min(5, (h - 2 * PRINT.PAD) / rows);
      const w = pitchX - PRINT.CELL_GAP;
      const ph = pitchY - PRINT.CELL_GAP;
      const ports: PrintPort[] = [];
      let x = PRINT.RAIL + PRINT.LABEL + PRINT.PAD;
      for (const g of groups) {
        const gy = y + (h - g.rows * pitchY) / 2;
        g.ports.forEach((p, i) => {
          const [row, col] = portCell(i, g.rows, g.ports.length, g.numbering);
          ports.push({ id: p.id, x: x + col * pitchX, y: gy + row * pitchY, w, h: ph, color: cableColor.get(p.id) ?? null, type: g.type });
        });
        x += groupColumns(g) * pitchX + PRINT.GAP;
      }
      return { id: d.id, name: d.name, model: d.model, category: d.category, positionU: d.positionU, heightU: d.heightU, y, h, back: d.facing !== face, ports };
    });

  return { heightU: rack.heightU, width: PRINT.FACE + 2 * PRINT.RAIL, height: layout.total * k, units, devices };
}

export interface PrintCableRow {
  label: string;
  color: string;
  colorName: string;
  type: CableType;
  length: string;
  /** The end in this rack. */
  here: string;
  /** The other end, with its rack named when it's elsewhere. */
  there: string;
  notes: string;
}

/** Cables with at least one end in the rack, described from that rack's point of view. */
export function printCables(project: Project, rackId: string): PrintCableRow[] {
  const describeLocal = (ref: PortRef) => {
    const info = findPort(project, ref);
    if (!info) return '(missing)';
    return `U${info.device.positionU} ${info.device.name} · ${info.port.name || info.group.label} (${info.face})`;
  };
  return project.cables
    .map((c): PrintCableRow | null => {
      const a = findPort(project, c.a);
      const b = findPort(project, c.b);
      const aHere = a?.device.rackId === rackId;
      const bHere = b?.device.rackId === rackId;
      if (!aHere && !bHere) return null;
      const [here, there] = aHere ? [c.a, c.b] : [c.b, c.a];
      const thereInfo = findPort(project, there);
      return {
        label: c.label,
        color: c.color,
        colorName: colorName(c.color),
        type: c.type,
        length: c.lengthM,
        here: describeLocal(here),
        there: thereInfo?.device.rackId === rackId ? describeLocal(there) : describePort(project, there),
        notes: c.notes,
      };
    })
    .filter((r): r is PrintCableRow => r !== null)
    .sort((x, y) => x.label.localeCompare(y.label, undefined, { numeric: true }));
}

/** Shorten text to roughly fit a width, given a font size in the same units. */
export function fitText(text: string, width: number, fontSize: number): string {
  const max = Math.floor(width / (fontSize * 0.56));
  return text.length <= max ? text : `${text.slice(0, Math.max(1, max - 1))}…`;
}
