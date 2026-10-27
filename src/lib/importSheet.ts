import { canPlace, createDevice, emptyProject, firstFreePosition, nextCableLabel, uid } from './project';
import { BUILTIN_TEMPLATES, CABLE_COLORS, CABLE_TYPES, defaultCableFor } from './templates';
import type { Cable, CableType, Device, DeviceTemplate, Port, PortType, Project } from './types';

/**
 * Importing a cable schedule (or a device list) from someone's existing spreadsheet: read the
 * file, guess which column is which, then build the racks, devices and cables it describes.
 * Every step is a pure function so the dialog can preview the result before anything changes.
 */

export type Grid = string[][];

export interface SheetData {
  name: string;
  rows: Grid;
}

export type EndField = 'rack' | 'u' | 'device' | 'port';
export type Field = 'label' | 'type' | 'color' | 'length' | 'notes' | `a.${EndField}` | `b.${EndField}`;
/** Which column (0-based) holds each field. */
export type Mapping = Partial<Record<Field, number>>;

export const FIELD_GROUPS: { title: string; fields: { field: Field; label: string }[] }[] = [
  {
    title: 'End A',
    fields: [
      { field: 'a.device', label: 'Device' },
      { field: 'a.port', label: 'Port' },
      { field: 'a.rack', label: 'Rack' },
      { field: 'a.u', label: 'U position' },
    ],
  },
  {
    title: 'End B',
    fields: [
      { field: 'b.device', label: 'Device' },
      { field: 'b.port', label: 'Port' },
      { field: 'b.rack', label: 'Rack' },
      { field: 'b.u', label: 'U position' },
    ],
  },
  {
    title: 'Cable',
    fields: [
      { field: 'label', label: 'Cable ID' },
      { field: 'type', label: 'Type' },
      { field: 'color', label: 'Colour' },
      { field: 'length', label: 'Length' },
      { field: 'notes', label: 'Notes' },
    ],
  },
];

// ---------- Reading files ----------

/** CSV / TSV with quoted fields; the delimiter (comma, semicolon or tab) is detected. */
export function parseCsv(text: string): Grid {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = [',', ';', '\t'].sort((x, y) => firstLine.split(y).length - firstLine.split(x).length)[0];
  const rows: Grid = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === delim) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.map((r) => r.map((c) => c.trim()));
}

export async function readSpreadsheet(file: File): Promise<SheetData[]> {
  if (/\.(csv|tsv|txt)$/i.test(file.name)) return [{ name: file.name, rows: parseCsv(await file.text()) }];
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  return wb.worksheets.map((ws) => {
    const rows: Grid = [];
    ws.eachRow({ includeEmpty: true }, (r, n) => {
      const cells: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) cells.push((r.getCell(c).text ?? '').trim());
      rows[n - 1] = cells;
    });
    return { name: ws.name, rows: Array.from(rows, (r) => r ?? []) };
  });
}

// ---------- Recognising columns ----------

const A_WORDS = new Set(['a', 'from', 'source', 'src', 'near', 'local', 'origin']);
const B_WORDS = new Set(['b', 'to', 'dest', 'destination', 'dst', 'far', 'remote', 'target']);

/** What a column header means, or null when it isn't one we use. */
export function classifyHeader(header: string): Field | null {
  let tokens = header
    .toLowerCase()
    .split(/[^a-z0-9#]+/)
    .filter(Boolean);
  if (!tokens.length) return null;
  let end: 'a' | 'b' | null = null;
  if ((tokens[0] === 'end' || tokens[0] === 'side') && tokens[1] && (A_WORDS.has(tokens[1]) || B_WORDS.has(tokens[1]))) {
    end = A_WORDS.has(tokens[1]) ? 'a' : 'b';
    tokens = tokens.slice(2);
  } else if (A_WORDS.has(tokens[0]) && tokens.length > 1) {
    end = 'a';
    tokens = tokens.slice(1);
  } else if (B_WORDS.has(tokens[0]) && tokens.length > 1) {
    end = 'b';
    tokens = tokens.slice(1);
  } else if (tokens.length > 1 && ['a', '1'].includes(tokens[tokens.length - 1])) {
    end = 'a';
    tokens = tokens.slice(0, -1);
  } else if (tokens.length > 1 && ['b', '2'].includes(tokens[tokens.length - 1])) {
    end = 'b';
    tokens = tokens.slice(0, -1);
  }
  const rest = tokens.join(' ');
  const has = (...words: string[]) => words.some((w) => tokens.includes(w));

  const endField = (): EndField | null => {
    if (has('type', 'side', 'face', 'speed', 'vlan')) return null;
    if (has('port', 'interface', 'int', 'if', 'socket', 'outlet')) return 'port';
    if (has('rack', 'cabinet', 'cab', 'frame')) return 'rack';
    if (['u', 'ru', 'position', 'pos', 'unit', 'units', 'elevation', 'u position', 'rack unit'].includes(rest)) return 'u';
    if (has('device', 'host', 'hostname', 'name', 'equipment', 'node', 'switch', 'panel', 'hardware', 'asset')) return 'device';
    return null;
  };

  if (end) {
    const f = endField();
    return f ? (`${end}.${f}` as Field) : null;
  }
  if (has('colour', 'color')) return 'color';
  if (has('length', 'len', 'metres', 'meters') || rest === 'm') return 'length';
  if (has('note', 'notes', 'comment', 'comments', 'description', 'purpose', 'vlan', 'remarks')) return 'notes';
  if ((has('type', 'media', 'medium', 'category') && !has('port', 'device')) || rest === 'cat') return 'type';
  if (rest === 'id' || rest === 'label' || rest === 'tag' || rest === 'cable' || /^cable (id|no|number|#|label|ref|reference|tag)$/.test(rest)) return 'label';
  // A header naming no end ("Device", "Port") belongs to end A — e.g. a plain device list.
  const f = endField();
  return f ? (`a.${f}` as Field) : null;
}

/** Guess the column for each field from the header row. */
export function autoMap(headers: string[]): Mapping {
  const m: Mapping = {};
  headers.forEach((h, i) => {
    const f = classifyHeader(h);
    if (f && m[f] === undefined) m[f] = i;
  });
  return m;
}

/** The header row: the first of the top rows in which at least two cells look like headers we know. */
export function detectHeaderRow(rows: Grid): number {
  for (let i = 0; i < Math.min(rows.length, 15); i++) {
    const known = (rows[i] ?? []).filter((c) => c && classifyHeader(c)).length;
    if (known >= 2) return i;
  }
  return Math.max(0, rows.findIndex((r) => r.some((c) => c)));
}

/** Extra details about devices, from a sheet listing them with their model (like PortaBuddy's own "Devices" sheet). */
export interface DeviceInfo {
  model?: string;
  rack?: string;
  u?: number;
}

export function readDeviceSheets(sheets: SheetData[]): Map<string, DeviceInfo> {
  const out = new Map<string, DeviceInfo>();
  for (const sheet of sheets) {
    const h = detectHeaderRow(sheet.rows);
    const headers = sheet.rows[h] ?? [];
    const modelCol = headers.findIndex((x) => /^(model|type|make ?model|product)$/i.test(x.trim()));
    const map = autoMap(headers);
    if (modelCol < 0 || map['a.device'] === undefined || map['b.device'] !== undefined) continue;
    for (const row of sheet.rows.slice(h + 1)) {
      const name = row[map['a.device']]?.trim();
      if (!name) continue;
      out.set(name.toLowerCase(), {
        model: row[modelCol]?.trim() || undefined,
        rack: map['a.rack'] !== undefined ? row[map['a.rack']]?.trim() || undefined : undefined,
        u: map['a.u'] !== undefined ? parseU(row[map['a.u']]) : undefined,
      });
    }
  }
  return out;
}

// ---------- Reading values ----------

/** "U41", "41", "U10-U11" → lowest unit. */
export function parseU(v: string | undefined): number | undefined {
  const n = (v ?? '').match(/\d+/g)?.map(Number);
  return n?.length ? Math.min(...n) : undefined;
}

export function parseCableType(v: string | undefined): CableType | undefined {
  const s = (v ?? '').toLowerCase().replace(/[\s_-]+/g, '');
  if (!s) return undefined;
  const exact = CABLE_TYPES.find((t) => t.toLowerCase() === s);
  if (exact) return exact;
  if (/^(cat)?5e?$/.test(s)) return 'Cat5e';
  if (/^(cat)?6a$/.test(s)) return 'Cat6a';
  if (/^(cat)?6$/.test(s)) return 'Cat6';
  if (/^(cat)?8$/.test(s)) return 'Cat8';
  if (/(om3)/.test(s)) return 'OM3';
  if (/(os[12]|singlemode|smf)/.test(s)) return 'OS2';
  if (/(om4|om5|fibre|fiber|multimode|mmf|lc|sc)/.test(s)) return 'OM4';
  if (/(dac|twinax)/.test(s)) return 'DAC';
  if (/aoc/.test(s)) return 'AOC';
  if (/(power|iec|c13|c14|c19|mains)/.test(s)) return 'Power';
  if (/(console|serial|rollover)/.test(s)) return 'Console';
  return 'Other';
}

const COLOR_WORDS: Record<string, string> = {
  gray: 'Grey',
  cyan: 'Aqua',
  teal: 'Aqua',
  turquoise: 'Aqua',
  violet: 'Purple',
  magenta: 'Pink',
  amber: 'Orange',
};

export function parseColor(v: string | undefined): string | undefined {
  const s = (v ?? '').trim().toLowerCase();
  if (!s) return undefined;
  if (/^#?[0-9a-f]{6}$/.test(s)) return `#${s.replace('#', '')}`;
  if (/^#?[0-9a-f]{3}$/.test(s)) return `#${[...s.replace('#', '')].map((c) => c + c).join('')}`;
  const word = COLOR_WORDS[s] ?? s;
  return CABLE_COLORS.find((c) => c.name.toLowerCase() === word.toLowerCase())?.hex;
}

// ---------- Planning ----------

export interface EndRef {
  device: string;
  port: string;
  rack?: string;
  u?: number;
}

export interface PlanRow {
  /** Row number as shown in the spreadsheet (1-based). */
  row: number;
  a: EndRef;
  b?: EndRef;
  label?: string;
  type?: CableType;
  color?: string;
  length: string;
  notes: string;
}

export interface NewDevice {
  key: string;
  name: string;
  rack?: string;
  u?: number;
  /** Port names the sheet uses on this device. */
  ports: string[];
  /** Guessed device type (template id). */
  templateId: string;
}

export interface Problem {
  row: number;
  message: string;
}

export interface Plan {
  rows: PlanRow[];
  newDevices: NewDevice[];
  problems: Problem[];
}

const cell = (row: string[], col: number | undefined) => (col === undefined ? '' : (row[col] ?? '').trim());
const key = (name: string) => name.trim().toLowerCase();
const trailingNumber = (name: string) => {
  const m = /(\d+)\s*$/.exec(name);
  return m ? Number(m[1]) : null;
};
const letters = (name: string) => name.replace(/[^a-z]/gi, '').toLowerCase();

/**
 * Pick a device type from its name and the ports the sheet uses on it. Only a starting point:
 * the dialog lets the user change it.
 */
export function guessTemplate(name: string, ports: string[], templates: DeviceTemplate[] = BUILTIN_TEMPLATES, model?: string): string {
  if (model) {
    const byModel = templates.find((t) => t.name.toLowerCase() === model.toLowerCase());
    if (byModel) return byModel.id;
  }
  const n = name.toLowerCase();
  const p = ports.join(' ').toLowerCase();
  const max = Math.max(0, ...ports.map((x) => trailingNumber(x) ?? 0));
  const bySize = (ids: string[], sizes: number[]) => ids[sizes.findIndex((s) => max <= s)] ?? ids[ids.length - 1];
  if (/\b(pdu)\b|pdu/.test(n) || /\bout/.test(p)) return bySize(['pdu-1u', 'pdu-2u'], [8, 16]);
  if (/ups/.test(n)) return 'ups-2u';
  if (/(fibre|fiber|odf|fp)/.test(n)) return 'fp-24';
  // Sheets often list only the patched ports, so guess the common 24/48-port sizes rather than the smallest fit.
  if (/(^|[^a-z])pp|patch|panel/.test(n)) return bySize(['pp-24', 'pp-48'], [24, 48]);
  if (/(fw|firewall|asa|fortigate|palo)/.test(n)) return 'fw-1u';
  if (/(rtr|router|gw|gateway)/.test(n)) return 'rtr-1u';
  if (/(nas|san|storage|synology|netapp)/.test(n)) return 'nas-2u';
  if (/(srv|server|esx|host|hv|vm|node|db|app)/.test(n) || /\b(eth|nic|bmc|idrac|ilo)/.test(p)) return max > 4 ? 'srv-2u' : 'srv-1u';
  if (/(sw|switch|core|access|dist|agg|leaf|spine)/.test(n) || /\b(gi|ge|fa|te|xe|et)\d/.test(p)) return bySize(['sw-24', 'sw-48'], [24, 48]);
  return max > 24 ? 'sw-48' : 'pp-24';
}

/** Turn spreadsheet rows into a plan: what the sheet says, which devices are new, and rows that can't be used. */
export function buildPlan(project: Project, rows: Grid, headerRow: number, mapping: Mapping, deviceInfo = new Map<string, DeviceInfo>(), templates: DeviceTemplate[] = BUILTIN_TEMPLATES): Plan {
  const plan: Plan = { rows: [], newDevices: [], problems: [] };
  const existing = new Set(project.devices.map((d) => key(d.name)));
  const fresh = new Map<string, NewDevice>();

  const end = (row: string[], e: 'a' | 'b'): EndRef | null => {
    const device = cell(row, mapping[`${e}.device`]);
    if (!device) return null;
    return {
      device,
      port: cell(row, mapping[`${e}.port`]),
      rack: cell(row, mapping[`${e}.rack`]) || undefined,
      u: parseU(cell(row, mapping[`${e}.u`])),
    };
  };
  const note = (ref: EndRef) => {
    const k = key(ref.device);
    if (existing.has(k)) return;
    const info = deviceInfo.get(k);
    const d = fresh.get(k) ?? { key: k, name: ref.device, rack: ref.rack ?? info?.rack, u: ref.u ?? info?.u, ports: [], templateId: '' };
    d.rack ??= ref.rack;
    d.u ??= ref.u;
    if (ref.port && !d.ports.includes(ref.port)) d.ports.push(ref.port);
    fresh.set(k, d);
  };

  rows.forEach((row, i) => {
    if (i <= headerRow || !row.some((c) => c)) return;
    const rowNo = i + 1;
    const a = end(row, 'a');
    const b = end(row, 'b');
    if (!a && !b) {
      plan.problems.push({ row: rowNo, message: 'No device named in this row' });
      return;
    }
    const first = (a ?? b)!;
    const second = a && b ? b : undefined;
    note(first);
    if (second) note(second);
    if (second && (!first.port || !second.port)) {
      plan.problems.push({ row: rowNo, message: 'A cable needs a port at both ends' });
      return;
    }
    plan.rows.push({
      row: rowNo,
      a: first,
      b: second,
      label: cell(row, mapping.label) || undefined,
      type: parseCableType(cell(row, mapping.type)),
      color: parseColor(cell(row, mapping.color)),
      length: cell(row, mapping.length).replace(/\s*(m|metres?|meters?)$/i, ''),
      notes: cell(row, mapping.notes),
    });
  });

  plan.newDevices = [...fresh.values()].map((d) => ({ ...d, templateId: guessTemplate(d.name, d.ports, templates, deviceInfo.get(d.key)?.model) }));
  return plan;
}

// ---------- Applying ----------

export interface ImportResult {
  project: Project;
  cables: number;
  /** Rows describing a cable the project already has between the same two ports. */
  unchanged: number;
  devices: number;
  racks: number;
  problems: Problem[];
}

const isPower = (t: PortType) => t === 'power' || t === 'power-in';

/**
 * Find the port a sheet means: by exact name, then by number ("Gi1/0/12" → the port numbered 12,
 * preferring one whose letters match). Ports of newly created devices are renamed to the sheet's
 * name so the documentation keeps the names people use.
 */
function resolvePort(device: Device, name: string, rename: boolean): { port: Port; type: PortType } | null {
  const all = device.portGroups.flatMap((g) => g.ports.map((port) => ({ port, type: g.type })));
  const want = name.trim().toLowerCase();
  const exact = all.find((x) => x.port.name.toLowerCase() === want) ?? all.find((x) => x.port.name.replace(/\s+/g, '').toLowerCase() === want.replace(/\s+/g, ''));
  if (exact) return exact;
  const n = trailingNumber(name);
  if (n === null) return null;
  const byNumber = all.filter((x) => trailingNumber(x.port.name) === n);
  const hit = byNumber.find((x) => letters(x.port.name) && letters(x.port.name) === letters(name)) ?? byNumber[0];
  if (hit && rename) hit.port.name = name.trim();
  return hit ?? null;
}

/** Build the result of an import on a copy of the project. Safe to call repeatedly for a preview. */
export function applyPlan(base: Project, plan: Plan, templateFor: (d: NewDevice) => string, templates: DeviceTemplate[]): ImportResult {
  const project: Project = structuredClone(base);
  const problems: Problem[] = [...plan.problems];
  let racksAdded = 0;
  const rackByName = (name: string | undefined) => {
    if (!name) {
      if (!project.racks.length) {
        project.racks.push({ id: uid('rack'), name: 'Rack A', location: '', heightU: 42 });
        racksAdded++;
      }
      return project.racks[0];
    }
    let rack = project.racks.find((r) => r.name.toLowerCase() === name.toLowerCase());
    if (!rack) {
      rack = { id: uid('rack'), name, location: '', heightU: 42 };
      project.racks.push(rack);
      racksAdded++;
    }
    return rack;
  };

  // Devices the sheet names that don't exist yet.
  const created = new Set<string>();
  for (const nd of plan.newDevices) {
    const t = templates.find((x) => x.id === templateFor(nd)) ?? templates[0];
    const rack = rackByName(nd.rack);
    if (nd.u && nd.u + t.heightU - 1 > rack.heightU) rack.heightU = Math.min(60, nd.u + t.heightU - 1);
    const facing = t.defaultFacing ?? 'front';
    const mount = { heightU: t.heightU, facing, fullDepth: t.fullDepth };
    const pos = nd.u && canPlace(project, rack.id, { ...mount, positionU: nd.u }) ? nd.u : firstFreePosition(project, rack.id, mount);
    if (pos === null) {
      problems.push({ row: 0, message: `No room in ${rack.name} for ${nd.name}` });
      continue;
    }
    if (nd.u && pos !== nd.u) problems.push({ row: 0, message: `${nd.name}: U${nd.u} is taken in ${rack.name}, placed at U${pos} instead` });
    const d = createDevice(t, rack.id, pos, nd.name, facing);
    project.devices.push(d);
    created.add(d.id);
  }

  const byName = new Map(project.devices.map((d) => [key(d.name), d]));
  const used = new Set(project.cables.flatMap((c) => [c.a.portId, c.b.portId]));
  const labelOf = new Map(project.cables.flatMap((c) => [[c.a.portId, c.label] as const, [c.b.portId, c.label] as const]));
  let next = Number(/^C(\d+)$/.exec(nextCableLabel(project))![1]);
  let cables = 0;
  let unchanged = 0;
  const pairKey = (p: string, q: string) => [p, q].sort().join('|');
  const existingPairs = new Set(project.cables.map((c) => pairKey(c.a.portId, c.b.portId)));

  for (const r of plan.rows) {
    const ends = [r.a, r.b].filter((e): e is EndRef => !!e).map((e) => {
      const device = byName.get(key(e.device));
      if (!device) return { e, error: `${e.device} could not be added` };
      if (!e.port) return { e, device };
      const port = resolvePort(device, e.port, created.has(device.id));
      return port ? { e, device, port } : { e, device, error: `${device.name} has no port "${e.port}" — try a bigger device type` };
    });
    const bad = ends.find((x) => 'error' in x && x.error);
    if (bad && 'error' in bad) {
      problems.push({ row: r.row, message: bad.error! });
      continue;
    }
    if (!r.b) continue; // a device (and maybe a port name) only
    const [x, y] = ends as { e: EndRef; device: Device; port: { port: Port; type: PortType } }[];
    if (x.port.port.id === y.port.port.id) {
      problems.push({ row: r.row, message: 'Both ends are the same port' });
      continue;
    }
    // Re-importing an updated sheet: cables that are already there are fine, not problems.
    if (existingPairs.has(pairKey(x.port.port.id, y.port.port.id))) {
      unchanged++;
      continue;
    }
    const clash = [x, y].find((z) => used.has(z.port.port.id));
    if (clash) {
      problems.push({ row: r.row, message: `${clash.device.name} ${clash.port.port.name} already has a cable (${labelOf.get(clash.port.port.id)})` });
      continue;
    }
    if (isPower(x.port.type) !== isPower(y.port.type)) {
      problems.push({ row: r.row, message: 'Connects a power port to a data port' });
      continue;
    }
    const look = defaultCableFor(x.port.type);
    const label = r.label ?? `C${String(next++).padStart(3, '0')}`;
    const cable: Cable = {
      id: uid('cab'),
      label,
      a: { deviceId: x.device.id, portId: x.port.port.id },
      b: { deviceId: y.device.id, portId: y.port.port.id },
      type: r.type ?? look.type,
      color: r.color ?? look.color,
      lengthM: r.length,
      notes: r.notes,
    };
    project.cables.push(cable);
    for (const z of [x, y]) {
      used.add(z.port.port.id);
      labelOf.set(z.port.port.id, label);
    }
    cables++;
  }

  return { project, cables, unchanged, devices: created.size, racks: racksAdded, problems };
}

/** A blank project to import into when the import becomes a new project. */
export function importTarget(name: string): Project {
  return { ...emptyProject(), name: name.replace(/\.(xlsx|csv|tsv|txt)$/i, ''), racks: [] };
}
