import type { Cable, Device, DeviceTemplate, Face, Port, PortGroup, PortRef, PortType, Project, Rack } from './types';

let counter = 0;
export function uid(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${counter.toString(36)}`;
}

export function emptyProject(): Project {
  return {
    version: 2,
    name: 'Untitled cabinet',
    racks: [{ id: uid('rack'), name: 'Rack A', location: '', heightU: 42 }],
    devices: [],
    cables: [],
    customTemplates: [],
  };
}

/** Order in which ports of a group are laid out: returns [row, col] for the i-th port. */
export function portCell(i: number, rows: number, count: number, numbering: 'zigzag' | 'row'): [number, number] {
  if (rows <= 1) return [0, i];
  if (numbering === 'zigzag') return [i % rows, Math.floor(i / rows)];
  const cols = Math.ceil(count / rows);
  return [Math.floor(i / cols), i % cols];
}

export function groupColumns(group: { rows: number; ports: unknown[] }): number {
  return Math.ceil(group.ports.length / Math.max(1, group.rows));
}

export function createDevice(
  template: DeviceTemplate,
  rackId: string,
  positionU: number,
  name?: string,
  facing: Face = template.defaultFacing ?? 'front',
): Device {
  const id = uid('dev');
  const portGroups: PortGroup[] = template.portGroups.map((spec, gi) => {
    const start = spec.start ?? 1;
    const ports: Port[] = Array.from({ length: spec.count }, (_, i) => ({
      id: `${id}:${gi}:${i}`,
      name: `${spec.prefix}${start + i}`,
    }));
    return {
      label: spec.label,
      type: spec.type,
      rows: Math.max(1, Math.min(spec.rows, spec.count || 1)),
      numbering: spec.numbering,
      face: spec.face ?? 'front',
      ports,
    };
  });
  return {
    id,
    rackId,
    name: name ?? template.name,
    model: template.name,
    category: template.category,
    heightU: template.heightU,
    positionU,
    facing,
    fullDepth: template.fullDepth ?? true,
    portGroups,
    notes: '',
  };
}

export const otherFace = (f: Face): Face => (f === 'front' ? 'rear' : 'front');

/** Whether any part of the device can be seen from this side of the rack. */
export function visibleOn(device: Pick<Device, 'facing' | 'fullDepth'>, face: Face): boolean {
  return device.fullDepth || device.facing === face;
}

/** Side of the rack a port group is reached from. Half-depth devices show every port on the side they face. */
export function groupRackFace(device: Pick<Device, 'facing' | 'fullDepth'>, group: Pick<PortGroup, 'face'>): Face {
  if (!device.fullDepth) return device.facing;
  return group.face === 'front' ? device.facing : otherFace(device.facing);
}

/** Port groups of a device seen from one side of the rack, keeping their original indexes. */
export function groupsOn(device: Device, face: Face): { group: PortGroup; index: number }[] {
  if (!visibleOn(device, face)) return [];
  return device.portGroups.map((group, index) => ({ group, index })).filter(({ group }) => groupRackFace(device, group) === face);
}

/** Units occupied by a device, as [bottom, top] inclusive. */
export function spanOf(d: Pick<Device, 'positionU' | 'heightU'>): [number, number] {
  return [d.positionU, d.positionU + d.heightU - 1];
}

/** Where and how a device would sit in a rack. */
export interface Mount {
  heightU: number;
  positionU: number;
  facing: Face;
  fullDepth: boolean;
}

export function canPlace(project: Project, rackId: string, mount: Mount, ignoreDeviceId?: string): boolean {
  const rack = project.racks.find((r) => r.id === rackId);
  if (!rack) return false;
  const { heightU, positionU } = mount;
  if (positionU < 1 || positionU + heightU - 1 > rack.heightU) return false;
  const top = positionU + heightU - 1;
  return !project.devices.some((d) => {
    if (d.rackId !== rackId || d.id === ignoreDeviceId) return false;
    const [b, t] = spanOf(d);
    if (positionU > t || top < b) return false;
    // Two half-depth devices can share a U when they are mounted on opposite sides.
    return d.fullDepth || mount.fullDepth || d.facing === mount.facing;
  });
}

/** Highest free position that fits the device, or null if the rack is full. */
export function firstFreePosition(project: Project, rackId: string, mount: Omit<Mount, 'positionU'>): number | null {
  const rack = project.racks.find((r) => r.id === rackId);
  if (!rack) return null;
  for (let pos = rack.heightU - mount.heightU + 1; pos >= 1; pos--) {
    if (canPlace(project, rackId, { ...mount, positionU: pos })) return pos;
  }
  return null;
}

/** Every position (bottom U, top of rack first) where a device could go. */
export function freePositions(project: Project, rackId: string, mount: Omit<Mount, 'positionU'>, ignoreDeviceId?: string): number[] {
  const rack = project.racks.find((r) => r.id === rackId);
  if (!rack) return [];
  const out: number[] = [];
  for (let p = rack.heightU - mount.heightU + 1; p >= 1; p--) {
    if (canPlace(project, rackId, { ...mount, positionU: p }, ignoreDeviceId)) out.push(p);
  }
  return out;
}

export const uRange = (bottom: number, heightU: number) => (heightU > 1 ? `U${bottom}–${bottom + heightU - 1}` : `U${bottom}`);

export interface PortInfo {
  rack: Rack | undefined;
  device: Device;
  group: PortGroup;
  port: Port;
  type: PortType;
  /** Side of the rack the port is reached from. */
  face: Face;
}

export function findPort(project: Project, ref: PortRef): PortInfo | null {
  const device = project.devices.find((d) => d.id === ref.deviceId);
  if (!device) return null;
  for (const group of device.portGroups) {
    const port = group.ports.find((p) => p.id === ref.portId);
    if (port) {
      return {
        rack: project.racks.find((r) => r.id === device.rackId),
        device,
        group,
        port,
        type: group.type,
        face: groupRackFace(device, group),
      };
    }
  }
  return null;
}

export function cableAtPort(project: Project, portId: string): Cable | undefined {
  return project.cables.find((c) => c.a.portId === portId || c.b.portId === portId);
}

/** Map of portId -> cable for quick lookups while rendering. */
export function cableIndex(cables: Cable[]): Map<string, Cable> {
  const m = new Map<string, Cable>();
  for (const c of cables) {
    m.set(c.a.portId, c);
    m.set(c.b.portId, c);
  }
  return m;
}

export function nextCableLabel(project: Project): string {
  let max = 0;
  for (const c of project.cables) {
    const m = /^C(\d+)$/.exec(c.label);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `C${String(max + 1).padStart(3, '0')}`;
}

export function describePort(project: Project, ref: PortRef): string {
  const info = findPort(project, ref);
  if (!info) return '(missing)';
  const side = info.face === 'rear' ? ' (rear)' : '';
  return `${info.rack?.name ?? '?'} / U${info.device.positionU} ${info.device.name} / ${info.port.name || info.group.label}${side}`;
}

/**
 * Validates and normalises data loaded from a file or storage, upgrading older versions.
 * Version 1 projects had no front/rear: everything stays visible from the front.
 * Throws on malformed input.
 */
export function parseProject(data: unknown): Project {
  const p = data as Partial<Omit<Project, 'version'>> & { version?: number };
  if (!p || typeof p !== 'object' || !Array.isArray(p.racks) || !Array.isArray(p.devices) || !Array.isArray(p.cables)) {
    throw new Error('Not a PortaBuddy project file');
  }
  return {
    version: 2,
    name: typeof p.name === 'string' ? p.name : 'Untitled cabinet',
    racks: p.racks,
    devices: p.devices.map((d) => ({
      ...d,
      facing: d.facing === 'rear' ? 'rear' : 'front',
      fullDepth: d.fullDepth ?? true,
      portGroups: d.portGroups.map((g) => ({ ...g, face: g.face === 'rear' ? 'rear' : 'front' })),
    })),
    cables: p.cables,
    customTemplates: (Array.isArray(p.customTemplates) ? p.customTemplates : []).map((t) => ({ ...t, fullDepth: t.fullDepth ?? true })),
  };
}
