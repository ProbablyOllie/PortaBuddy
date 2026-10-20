export type PortType =
  | 'rj45'
  | 'sfp'
  | 'sfp+'
  | 'sfp28'
  | 'qsfp'
  | 'lc'
  | 'sc'
  | 'console'
  | 'power'
  | 'power-in';

export type DeviceCategory =
  | 'switch'
  | 'patch-panel'
  | 'server'
  | 'router'
  | 'firewall'
  | 'storage'
  | 'power'
  | 'other';

/**
 * How ports in a multi-row group are numbered.
 * - `zigzag`: 1 top, 2 bottom, 3 top... (typical switch)
 * - `row`: fill the first row left-to-right, then the next (typical patch panel)
 */
export type PortNumbering = 'zigzag' | 'row';

/** A side of the rack, or of a device. */
export type Face = 'front' | 'rear';

/** Template form of a port group: generates `count` ports named `${prefix}${start + i}`. */
export interface PortGroupSpec {
  label: string;
  prefix: string;
  count: number;
  start?: number;
  type: PortType;
  rows: number;
  numbering: PortNumbering;
  /** Which side of the device the ports are on (default front). */
  face?: Face;
}

export interface DeviceTemplate {
  id: string;
  name: string;
  category: DeviceCategory;
  heightU: number;
  portGroups: PortGroupSpec[];
  /** Full-depth devices fill the U from front to rear; half-depth ones only occupy the side they face. */
  fullDepth: boolean;
  /** Rack side the device is normally mounted facing, used when adding it without a target side. */
  defaultFacing?: Face;
  custom?: boolean;
}

export interface Port {
  id: string;
  name: string;
}

export interface PortGroup {
  label: string;
  type: PortType;
  rows: number;
  numbering: PortNumbering;
  /** Side of the device the ports are on. */
  face: Face;
  ports: Port[];
}

export interface Rack {
  id: string;
  name: string;
  location: string;
  heightU: number;
}

export interface Device {
  id: string;
  rackId: string;
  name: string;
  model: string;
  category: DeviceCategory;
  heightU: number;
  /** Lowest rack unit the device occupies (1-based, U1 is the bottom of the rack). */
  positionU: number;
  /** Rack side the device's front panel faces. */
  facing: Face;
  fullDepth: boolean;
  portGroups: PortGroup[];
  notes: string;
}

export interface PortRef {
  deviceId: string;
  portId: string;
}

export type CableType =
  | 'Cat5e'
  | 'Cat6'
  | 'Cat6a'
  | 'Cat8'
  | 'OM3'
  | 'OM4'
  | 'OS2'
  | 'DAC'
  | 'AOC'
  | 'Power'
  | 'Console'
  | 'Other';

export interface Cable {
  id: string;
  label: string;
  a: PortRef;
  b: PortRef;
  type: CableType;
  color: string;
  lengthM: string;
  notes: string;
}

export interface Project {
  version: 2;
  name: string;
  racks: Rack[];
  devices: Device[];
  cables: Cable[];
  customTemplates: DeviceTemplate[];
}

export type Selection =
  | { kind: 'rack'; id: string }
  | { kind: 'device'; id: string }
  | { kind: 'cable'; id: string }
  | null;
