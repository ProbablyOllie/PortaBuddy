import type {
  Cable,
  CableType,
  Device,
  DeviceCategory,
  DeviceTemplate,
  Face,
  PortGroup,
  PortGroupSpec,
  PortNumbering,
  PortType,
  Project,
  Rack,
} from './types';

/**
 * Project files are untrusted: people open files they were sent, and whatever is opened is kept in
 * browser storage and loaded on every visit. Everything that enters the app goes through
 * `sanitizeProject`, which checks every field's type, range and size, repairs what it can and
 * drops what it can't — so a malformed or malicious file can't crash the app (now or on every
 * later visit), freeze it, inject CSS through a "colour", or break exports.
 */

export const LIMITS = {
  racks: 200,
  devices: 5000,
  cables: 50000,
  templates: 500,
  groupsPerDevice: 64,
  portsPerDevice: 1024,
  rackHeightU: 60,
  deviceHeightU: 20,
  rowsPerGroup: 8,
  name: 200,
  notes: 2000,
  short: 40,
  id: 100,
} as const;

const PORT_TYPES: readonly PortType[] = ['rj45', 'sfp', 'sfp+', 'sfp28', 'qsfp', 'lc', 'sc', 'console', 'power', 'power-in'];
const CATEGORIES: readonly DeviceCategory[] = ['switch', 'patch-panel', 'server', 'router', 'firewall', 'storage', 'power', 'other'];
const CABLE_TYPES: readonly CableType[] = ['Cat5e', 'Cat6', 'Cat6a', 'Cat8', 'OM3', 'OM4', 'OS2', 'DAC', 'AOC', 'Power', 'Console', 'Other'];
const NUMBERINGS: readonly PortNumbering[] = ['zigzag', 'row'];

const ID_RE = /^[A-Za-z0-9_:.-]{1,100}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
// C0 control characters other than tab and newline: they corrupt the XML in .xlsx exports.
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const arr = (v: unknown, max: number): unknown[] => (Array.isArray(v) ? v.slice(0, max) : []);

/** A plain string of at most `max` characters, without control characters. */
export function cleanText(v: unknown, max: number, fallback = ''): string {
  if (typeof v !== 'string' && typeof v !== 'number') return fallback;
  return String(v).replace(CONTROL_RE, '').slice(0, max);
}

export function cleanInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
const face = (v: unknown): Face => (v === 'rear' ? 'rear' : 'front');

/** Only `#rrggbb` colours are allowed: anything else in a style or SVG attribute is an injection risk. */
export function safeColor(v: unknown, fallback = '#6b7280'): string {
  return typeof v === 'string' && HEX_RE.test(v) ? v.toLowerCase() : fallback;
}

export function safeId(v: unknown): string | null {
  return typeof v === 'string' && ID_RE.test(v) ? v : null;
}

export interface SanitizeReport {
  /** Human-readable notes about what had to be fixed or dropped. */
  issues: string[];
}

function sanitizeGroupSpec(v: unknown, deviceHeight: number): PortGroupSpec | null {
  if (!isObj(v)) return null;
  return {
    label: cleanText(v.label, LIMITS.short, 'Ports'),
    prefix: cleanText(v.prefix, LIMITS.short),
    count: cleanInt(v.count, 0, LIMITS.portsPerDevice, 0),
    start: cleanInt(v.start, 0, 100000, 1),
    type: oneOf(v.type, PORT_TYPES, 'rj45'),
    rows: cleanInt(v.rows, 1, Math.min(LIMITS.rowsPerGroup, deviceHeight * 2), 1),
    numbering: oneOf(v.numbering, NUMBERINGS, 'zigzag'),
    face: face(v.face),
  };
}

export function sanitizeTemplate(v: unknown): DeviceTemplate | null {
  if (!isObj(v)) return null;
  const id = safeId(v.id);
  if (!id) return null;
  const heightU = cleanInt(v.heightU, 1, LIMITS.deviceHeightU, 1);
  let total = 0;
  const portGroups = arr(v.portGroups, LIMITS.groupsPerDevice)
    .map((g) => sanitizeGroupSpec(g, heightU))
    .filter((g): g is PortGroupSpec => g !== null)
    .map((g) => {
      // Keep the total within the per-device limit.
      const count = Math.min(g.count, LIMITS.portsPerDevice - total);
      total += count;
      return { ...g, count };
    });
  return {
    id,
    name: cleanText(v.name, LIMITS.name, 'Custom device') || 'Custom device',
    category: oneOf(v.category, CATEGORIES, 'other'),
    heightU,
    portGroups,
    fullDepth: v.fullDepth !== false,
    defaultFacing: v.defaultFacing === 'rear' ? 'rear' : undefined,
    custom: true,
  };
}

/** Check and repair a project from a file or storage. Throws only if it isn't a project at all. */
export function sanitizeProject(data: unknown, report: SanitizeReport = { issues: [] }): Project {
  if (!isObj(data) || !Array.isArray(data.racks) || !Array.isArray(data.devices) || !Array.isArray(data.cables)) {
    throw new Error('Not a PortaBuddy project file');
  }
  const note = (msg: string) => {
    if (report.issues.length < 50) report.issues.push(msg);
  };
  for (const [key, max] of [
    ['racks', LIMITS.racks],
    ['devices', LIMITS.devices],
    ['cables', LIMITS.cables],
  ] as const) {
    if ((data[key] as unknown[]).length > max) note(`Only the first ${max} ${key} were kept`);
  }

  // Racks
  const racks: Rack[] = [];
  const rackIds = new Set<string>();
  for (const r of arr(data.racks, LIMITS.racks)) {
    const id = isObj(r) ? safeId(r.id) : null;
    if (!isObj(r) || !id || rackIds.has(id)) {
      note('A rack with a missing or duplicate id was dropped');
      continue;
    }
    rackIds.add(id);
    racks.push({
      id,
      name: cleanText(r.name, LIMITS.name, 'Rack') || 'Rack',
      location: cleanText(r.location, LIMITS.name),
      heightU: cleanInt(r.heightU, 1, LIMITS.rackHeightU, 42),
    });
  }
  const rackHeight = new Map(racks.map((r) => [r.id, r.heightU]));

  // Devices and their ports
  const devices: Device[] = [];
  const deviceIds = new Set<string>();
  const portOwner = new Map<string, string>(); // port id -> device id (port ids must be unique)
  for (const d of arr(data.devices, LIMITS.devices)) {
    const id = isObj(d) ? safeId(d.id) : null;
    if (!isObj(d) || !id || deviceIds.has(id)) {
      note('A device with a missing or duplicate id was dropped');
      continue;
    }
    const rackId = safeId(d.rackId);
    if (!rackId || !rackHeight.has(rackId)) {
      note(`${cleanText(d.name, 60, 'A device')} was dropped: its rack doesn't exist`);
      continue;
    }
    const rh = rackHeight.get(rackId)!;
    const heightU = cleanInt(d.heightU, 1, Math.min(LIMITS.deviceHeightU, rh), 1);
    let ports = 0;
    const portGroups: PortGroup[] = [];
    for (const g of arr(d.portGroups, LIMITS.groupsPerDevice)) {
      if (!isObj(g)) continue;
      const list = [];
      for (const p of arr(g.ports, LIMITS.portsPerDevice - ports)) {
        const pid = isObj(p) ? safeId(p.id) : null;
        if (!isObj(p) || !pid || portOwner.has(pid)) continue;
        portOwner.set(pid, id);
        list.push({ id: pid, name: cleanText(p.name, LIMITS.short) });
      }
      ports += list.length;
      portGroups.push({
        label: cleanText(g.label, LIMITS.short, 'Ports'),
        type: oneOf(g.type, PORT_TYPES, 'rj45'),
        rows: cleanInt(g.rows, 1, Math.min(LIMITS.rowsPerGroup, heightU * 2), 1),
        numbering: oneOf(g.numbering, NUMBERINGS, 'zigzag'),
        face: face(g.face),
        ports: list,
      });
    }
    deviceIds.add(id);
    devices.push({
      id,
      rackId,
      name: cleanText(d.name, LIMITS.name, 'Device') || 'Device',
      model: cleanText(d.model, LIMITS.name),
      category: oneOf(d.category, CATEGORIES, 'other'),
      heightU,
      positionU: cleanInt(d.positionU, 1, rh - heightU + 1, 1),
      facing: face(d.facing),
      // Projects from before front/rear existed have no depth: they were full depth.
      fullDepth: d.fullDepth !== false,
      portGroups,
      notes: cleanText(d.notes, LIMITS.notes),
    });
  }

  // Cables: both ends must be real ports, and a port takes one cable.
  const cables: Cable[] = [];
  const cableIds = new Set<string>();
  const usedPorts = new Set<string>();
  let dropped = 0;
  for (const c of arr(data.cables, LIMITS.cables)) {
    const id = isObj(c) ? safeId(c.id) : null;
    const end = (e: unknown) => {
      if (!isObj(e)) return null;
      const deviceId = safeId(e.deviceId);
      const portId = safeId(e.portId);
      return deviceId && portId && portOwner.get(portId) === deviceId ? { deviceId, portId } : null;
    };
    const a = isObj(c) ? end(c.a) : null;
    const b = isObj(c) ? end(c.b) : null;
    if (!isObj(c) || !id || cableIds.has(id) || !a || !b || a.portId === b.portId || usedPorts.has(a.portId) || usedPorts.has(b.portId)) {
      dropped++;
      continue;
    }
    cableIds.add(id);
    usedPorts.add(a.portId);
    usedPorts.add(b.portId);
    cables.push({
      id,
      label: cleanText(c.label, LIMITS.short, 'C?') || 'C?',
      a,
      b,
      type: oneOf(c.type, CABLE_TYPES, 'Other'),
      color: safeColor(c.color),
      lengthM: cleanText(c.lengthM, 20),
      notes: cleanText(c.notes, LIMITS.notes),
    });
  }
  if (dropped) note(`${dropped} cable${dropped === 1 ? '' : 's'} with missing or clashing ends were dropped`);

  const customTemplates = arr(data.customTemplates, LIMITS.templates)
    .map(sanitizeTemplate)
    .filter((t): t is DeviceTemplate => t !== null);

  return {
    version: 2,
    name: cleanText(data.name, LIMITS.name, 'Untitled cabinet') || 'Untitled cabinet',
    racks,
    devices,
    cables,
    customTemplates,
  };
}

/** Escape a value for use inside a CSS attribute selector. */
export function cssEscape(v: string): string {
  return typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(v) : v.replace(/["\\\]]/g, '\\$&');
}

/**
 * The number at the end of a name ("Gi1/0/12" → 12), found by scanning back from the end.
 * Not a regex: patterns like /(\d+)\s*$/ backtrack quadratically on long runs of digits.
 */
export function trailingNumber(name: string): number | null {
  let end = name.length;
  while (end > 0 && /\s/.test(name[end - 1])) end--;
  let start = end;
  while (start > 0 && name.charCodeAt(start - 1) >= 48 && name.charCodeAt(start - 1) <= 57) start--;
  if (start === end) return null;
  return Number(name.slice(Math.max(start, end - 15), end));
}

/** The digits at the very end of a name (no trailing spaces allowed), or undefined. */
export function trailingDigits(name: string): string | undefined {
  let start = name.length;
  while (start > 0 && name.charCodeAt(start - 1) >= 48 && name.charCodeAt(start - 1) <= 57) start--;
  return start < name.length ? name.slice(start) : undefined;
}
