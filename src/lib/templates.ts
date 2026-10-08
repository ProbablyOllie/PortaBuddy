import type { CableType, DeviceCategory, DeviceTemplate, PortGroupSpec, PortType } from './types';

const g = (
  label: string,
  prefix: string,
  count: number,
  type: PortType,
  rows = 1,
  numbering: PortGroupSpec['numbering'] = 'zigzag',
  start = 1,
): PortGroupSpec => ({ label, prefix, count, type, rows, numbering, start });

export const BUILTIN_TEMPLATES: DeviceTemplate[] = [
  // Switches
  { id: 'sw-8', name: 'Switch 8-port', category: 'switch', heightU: 1, portGroups: [g('RJ45', 'Gi', 8, 'rj45'), g('Uplink', 'SFP', 2, 'sfp')] },
  { id: 'sw-16', name: 'Switch 16-port', category: 'switch', heightU: 1, portGroups: [g('RJ45', 'Gi', 16, 'rj45', 2), g('Uplink', 'SFP', 2, 'sfp')] },
  { id: 'sw-24', name: 'Switch 24-port', category: 'switch', heightU: 1, portGroups: [g('RJ45', 'Gi', 24, 'rj45', 2), g('Uplink', 'Te', 4, 'sfp+', 2)] },
  { id: 'sw-48', name: 'Switch 48-port', category: 'switch', heightU: 1, portGroups: [g('RJ45', 'Gi', 48, 'rj45', 2), g('Uplink', 'Te', 4, 'sfp+', 2)] },
  { id: 'sw-48-poe', name: 'Switch 48-port PoE + mgmt', category: 'switch', heightU: 1, portGroups: [g('RJ45 PoE', 'Gi', 48, 'rj45', 2), g('Uplink', 'Te', 4, 'sfp+', 2), g('Mgmt', 'Mgmt', 1, 'rj45'), g('Console', 'Con', 1, 'console')] },
  { id: 'sw-agg-48', name: 'Aggregation 48x SFP+ / 6x QSFP', category: 'switch', heightU: 1, portGroups: [g('SFP+', 'Te', 48, 'sfp+', 2), g('QSFP28', 'Hu', 6, 'qsfp', 2)] },
  { id: 'sw-core-32', name: 'Spine 32x QSFP', category: 'switch', heightU: 1, portGroups: [g('QSFP28', 'Hu', 32, 'qsfp', 2)] },

  // Patch panels
  { id: 'pp-12', name: 'Patch panel 12-port', category: 'patch-panel', heightU: 1, portGroups: [g('Cat6', '', 12, 'rj45', 1, 'row')] },
  { id: 'pp-24', name: 'Patch panel 24-port', category: 'patch-panel', heightU: 1, portGroups: [g('Cat6', '', 24, 'rj45', 1, 'row')] },
  { id: 'pp-48', name: 'Patch panel 48-port (1U HD)', category: 'patch-panel', heightU: 1, portGroups: [g('Cat6', '', 48, 'rj45', 2, 'row')] },
  { id: 'pp-48-2u', name: 'Patch panel 48-port (2U)', category: 'patch-panel', heightU: 2, portGroups: [g('Cat6', '', 48, 'rj45', 2, 'row')] },
  { id: 'fp-24', name: 'Fibre panel 24x LC', category: 'patch-panel', heightU: 1, portGroups: [g('LC duplex', 'F', 24, 'lc', 1, 'row')] },
  { id: 'fp-12-sc', name: 'Fibre panel 12x SC', category: 'patch-panel', heightU: 1, portGroups: [g('SC', 'F', 12, 'sc', 1, 'row')] },

  // Servers
  { id: 'srv-1u', name: 'Server 1U', category: 'server', heightU: 1, portGroups: [g('NIC', 'eth', 2, 'rj45', 1, 'row', 0), g('SFP+', 'p', 2, 'sfp+', 1, 'row', 1), g('iDRAC/iLO', 'bmc', 1, 'rj45'), g('PSU', 'PSU', 2, 'power-in', 1, 'row')] },
  { id: 'srv-2u', name: 'Server 2U', category: 'server', heightU: 2, portGroups: [g('NIC', 'eth', 4, 'rj45', 2, 'row', 0), g('SFP+', 'p', 4, 'sfp+', 2, 'row', 1), g('iDRAC/iLO', 'bmc', 1, 'rj45'), g('PSU', 'PSU', 2, 'power-in', 2, 'row')] },
  { id: 'srv-4u', name: 'Server 4U', category: 'server', heightU: 4, portGroups: [g('NIC', 'eth', 4, 'rj45', 2, 'row', 0), g('SFP28', 'p', 4, 'sfp28', 2, 'row', 1), g('QSFP', 'q', 2, 'qsfp', 2, 'row'), g('iDRAC/iLO', 'bmc', 1, 'rj45'), g('PSU', 'PSU', 4, 'power-in', 4, 'row')] },

  // Routers / firewalls
  { id: 'rtr-1u', name: 'Router 1U', category: 'router', heightU: 1, portGroups: [g('WAN/LAN', 'Gi0/', 8, 'rj45', 2, 'zigzag', 0), g('SFP', 'SFP', 2, 'sfp'), g('Console', 'Con', 1, 'console')] },
  { id: 'fw-1u', name: 'Firewall 1U', category: 'firewall', heightU: 1, portGroups: [g('Data', 'port', 8, 'rj45', 2), g('SFP+', 'x', 4, 'sfp+', 2), g('Mgmt', 'mgmt', 1, 'rj45'), g('HA', 'ha', 1, 'rj45'), g('Console', 'Con', 1, 'console')] },

  // Storage
  { id: 'nas-2u', name: 'NAS / SAN 2U', category: 'storage', heightU: 2, portGroups: [g('NIC', 'eth', 4, 'rj45', 2, 'row', 0), g('SFP+', 'p', 4, 'sfp+', 2, 'row'), g('Mgmt', 'mgmt', 1, 'rj45'), g('PSU', 'PSU', 2, 'power-in', 2, 'row')] },

  // Power
  { id: 'pdu-1u', name: 'PDU 1U 8x C13', category: 'power', heightU: 1, portGroups: [g('Outlets', 'Out', 8, 'power', 1, 'row')] },
  { id: 'pdu-2u', name: 'PDU 2U 16x C13', category: 'power', heightU: 2, portGroups: [g('Outlets', 'Out', 16, 'power', 2, 'row')] },
  { id: 'ups-2u', name: 'UPS 2U', category: 'power', heightU: 2, portGroups: [g('Outlets', 'Out', 8, 'power', 2, 'row'), g('Network card', 'net', 1, 'rj45')] },

  // Other
  { id: 'cm-1u', name: 'Cable manager 1U', category: 'other', heightU: 1, portGroups: [] },
  { id: 'blank-1u', name: 'Blanking panel 1U', category: 'other', heightU: 1, portGroups: [] },
  { id: 'shelf-2u', name: 'Shelf 2U', category: 'other', heightU: 2, portGroups: [] },
];

export const CATEGORY_LABELS: Record<DeviceCategory, string> = {
  switch: 'Switches',
  'patch-panel': 'Patch panels',
  server: 'Servers',
  router: 'Routers',
  firewall: 'Firewalls',
  storage: 'Storage',
  power: 'Power',
  other: 'Other',
};

export const PORT_TYPE_LABELS: Record<PortType, string> = {
  rj45: 'RJ45',
  sfp: 'SFP',
  'sfp+': 'SFP+',
  sfp28: 'SFP28',
  qsfp: 'QSFP',
  lc: 'LC',
  sc: 'SC',
  console: 'Console',
  power: 'Power outlet',
  'power-in': 'Power inlet',
};

export const CABLE_TYPES: CableType[] = ['Cat5e', 'Cat6', 'Cat6a', 'Cat8', 'OM3', 'OM4', 'OS2', 'DAC', 'AOC', 'Power', 'Console', 'Other'];

export const CABLE_COLORS: { name: string; hex: string }[] = [
  { name: 'Blue', hex: '#2563eb' },
  { name: 'Yellow', hex: '#eab308' },
  { name: 'Green', hex: '#16a34a' },
  { name: 'Red', hex: '#dc2626' },
  { name: 'Orange', hex: '#ea580c' },
  { name: 'Purple', hex: '#9333ea' },
  { name: 'Pink', hex: '#db2777' },
  { name: 'Aqua', hex: '#06b6d4' },
  { name: 'Grey', hex: '#6b7280' },
  { name: 'White', hex: '#e5e7eb' },
  { name: 'Black', hex: '#111827' },
];

export function colorName(hex: string): string {
  return CABLE_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name ?? hex;
}

/** Sensible default cable type/colour for a port type when a cable is first drawn. */
export function defaultCableFor(type: PortType): { type: CableType; color: string } {
  switch (type) {
    case 'sfp':
    case 'sfp+':
    case 'sfp28':
      return { type: 'DAC', color: '#111827' };
    case 'qsfp':
      return { type: 'AOC', color: '#ea580c' };
    case 'lc':
    case 'sc':
      return { type: 'OM4', color: '#06b6d4' };
    case 'power':
    case 'power-in':
      return { type: 'Power', color: '#111827' };
    case 'console':
      return { type: 'Console', color: '#6b7280' };
    default:
      return { type: 'Cat6', color: '#2563eb' };
  }
}
