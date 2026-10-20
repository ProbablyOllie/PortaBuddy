import { describe, expect, it } from 'vitest';
import { canPlace, createDevice, emptyProject, firstFreePosition, groupsOn, nextCableLabel, parseProject, portCell, type Mount } from '../project';
import { BUILTIN_TEMPLATES } from '../templates';

const tpl = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)!;

describe('createDevice', () => {
  it('generates named ports from the template', () => {
    const d = createDevice(tpl('sw-48'), 'r', 10);
    expect(d.portGroups.map((g) => g.ports.length)).toEqual([48, 4, 2]);
    expect(d.portGroups.map((g) => g.face)).toEqual(['front', 'front', 'rear']);
    expect(d.portGroups[0].ports[0].name).toBe('Gi1');
    expect(d.portGroups[0].ports[47].name).toBe('Gi48');
    expect(d.portGroups[1].ports[3].name).toBe('Te4');
    const ids = d.portGroups.flatMap((g) => g.ports.map((p) => p.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('honours a custom start number', () => {
    const d = createDevice(tpl('srv-1u'), 'r', 1);
    expect(d.portGroups[0].ports.map((p) => p.name)).toEqual(['eth0', 'eth1']);
  });
});

describe('portCell', () => {
  it('zigzags odd ports on top and even below', () => {
    expect([0, 1, 2, 3].map((i) => portCell(i, 2, 24, 'zigzag'))).toEqual([[0, 0], [1, 0], [0, 1], [1, 1]]);
  });
  it('fills row by row for patch panels', () => {
    expect(portCell(0, 2, 48, 'row')).toEqual([0, 0]);
    expect(portCell(23, 2, 48, 'row')).toEqual([0, 23]);
    expect(portCell(24, 2, 48, 'row')).toEqual([1, 0]);
  });
});

const full = (heightU: number, positionU: number): Mount => ({ heightU, positionU, facing: 'front', fullDepth: true });

describe('placement', () => {
  it('rejects overlaps and out-of-rack positions', () => {
    const p = emptyProject();
    const rack = p.racks[0];
    p.devices.push(createDevice(tpl('srv-2u'), rack.id, 10)); // U10-U11
    expect(canPlace(p, rack.id, full(1, 9))).toBe(true);
    expect(canPlace(p, rack.id, full(1, 10))).toBe(false);
    expect(canPlace(p, rack.id, full(1, 11))).toBe(false);
    expect(canPlace(p, rack.id, full(2, 9))).toBe(false);
    expect(canPlace(p, rack.id, full(1, 12))).toBe(true);
    expect(canPlace(p, rack.id, full(1, 0))).toBe(false);
    expect(canPlace(p, rack.id, full(2, 42))).toBe(false);
    expect(canPlace(p, rack.id, full(2, 41))).toBe(true);
    // A device may be moved onto its own current span.
    expect(canPlace(p, rack.id, full(2, 10), p.devices[0].id)).toBe(true);
  });

  it('lets half-depth devices share a U from opposite sides', () => {
    const p = emptyProject();
    const rack = p.racks[0];
    p.devices.push(createDevice(tpl('pp-24'), rack.id, 20, undefined, 'front'));
    const half = (facing: 'front' | 'rear'): Mount => ({ heightU: 1, positionU: 20, facing, fullDepth: false });
    expect(canPlace(p, rack.id, half('rear'))).toBe(true);
    expect(canPlace(p, rack.id, half('front'))).toBe(false);
    // A full-depth device needs both sides free.
    expect(canPlace(p, rack.id, { ...half('rear'), fullDepth: true })).toBe(false);
  });

  it('finds the highest free slot', () => {
    const p = emptyProject();
    const rack = p.racks[0];
    expect(firstFreePosition(p, rack.id, { heightU: 1, facing: 'front', fullDepth: true })).toBe(42);
    p.devices.push(createDevice(tpl('sw-48'), rack.id, 42));
    expect(firstFreePosition(p, rack.id, { heightU: 2, facing: 'front', fullDepth: true })).toBe(40);
  });
});

describe('sides', () => {
  it('shows each port group on exactly one side of the rack', () => {
    const srv = createDevice(tpl('srv-2u'), 'r', 1);
    expect(groupsOn(srv, 'front')).toEqual([]);
    expect(groupsOn(srv, 'rear').map((x) => x.group.label)).toEqual(['NIC', 'SFP+', 'iDRAC/iLO', 'PSU']);
    // Mounted the other way round, the NICs face the front of the rack.
    const reversed = { ...srv, facing: 'rear' as const };
    expect(groupsOn(reversed, 'front')).toHaveLength(4);
    expect(groupsOn(reversed, 'rear')).toHaveLength(0);
  });

  it('hides half-depth devices from the other side', () => {
    const pdu = createDevice(tpl('pdu-1u'), 'r', 1);
    expect(pdu.facing).toBe('rear');
    expect(groupsOn(pdu, 'front')).toEqual([]);
    expect(groupsOn(pdu, 'rear')).toHaveLength(1);
  });
});

describe('misc', () => {
  it('numbers cables sequentially', () => {
    const p = emptyProject();
    expect(nextCableLabel(p)).toBe('C001');
    p.cables.push({ id: 'x', label: 'C009', a: { deviceId: '', portId: '' }, b: { deviceId: '', portId: '' }, type: 'Cat6', color: '#000000', lengthM: '', notes: '' });
    expect(nextCableLabel(p)).toBe('C010');
  });

  it('validates project files', () => {
    expect(() => parseProject({ hello: 1 })).toThrow();
    const p = emptyProject();
    expect(parseProject(JSON.parse(JSON.stringify(p)))).toEqual(p);
  });

  it('upgrades version 1 projects so everything stays on the front', () => {
    const v1 = {
      version: 1,
      name: 'old',
      racks: [{ id: 'r', name: 'A', location: '', heightU: 42 }],
      devices: [
        {
          id: 'd', rackId: 'r', name: 's', model: 'Server 1U', category: 'server', heightU: 1, positionU: 1, notes: '',
          portGroups: [{ label: 'NIC', type: 'rj45', rows: 1, numbering: 'row', ports: [{ id: 'd:0:0', name: 'eth0' }] }],
        },
      ],
      cables: [],
      customTemplates: [{ id: 't', name: 'x', category: 'other', heightU: 1, portGroups: [] }],
    };
    const p = parseProject(v1);
    expect(p.version).toBe(2);
    expect(p.devices[0]).toMatchObject({ facing: 'front', fullDepth: true });
    expect(p.devices[0].portGroups[0].face).toBe('front');
    expect(groupsOn(p.devices[0], 'front')).toHaveLength(1);
    expect(p.customTemplates[0].fullDepth).toBe(true);
  });
});
