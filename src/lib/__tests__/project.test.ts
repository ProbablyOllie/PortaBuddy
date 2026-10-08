import { describe, expect, it } from 'vitest';
import { canPlace, createDevice, emptyProject, firstFreePosition, nextCableLabel, parseProject, portCell } from '../project';
import { BUILTIN_TEMPLATES } from '../templates';

const tpl = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)!;

describe('createDevice', () => {
  it('generates named ports from the template', () => {
    const d = createDevice(tpl('sw-48'), 'r', 10);
    expect(d.portGroups.map((g) => g.ports.length)).toEqual([48, 4]);
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

describe('placement', () => {
  it('rejects overlaps and out-of-rack positions', () => {
    const p = emptyProject();
    const rack = p.racks[0];
    p.devices.push(createDevice(tpl('srv-2u'), rack.id, 10)); // U10-U11
    expect(canPlace(p, rack.id, 1, 9)).toBe(true);
    expect(canPlace(p, rack.id, 1, 10)).toBe(false);
    expect(canPlace(p, rack.id, 1, 11)).toBe(false);
    expect(canPlace(p, rack.id, 2, 9)).toBe(false);
    expect(canPlace(p, rack.id, 1, 12)).toBe(true);
    expect(canPlace(p, rack.id, 1, 0)).toBe(false);
    expect(canPlace(p, rack.id, 2, 42)).toBe(false);
    expect(canPlace(p, rack.id, 2, 41)).toBe(true);
    // A device may be moved onto its own current span.
    expect(canPlace(p, rack.id, 2, 10, p.devices[0].id)).toBe(true);
  });

  it('finds the highest free slot', () => {
    const p = emptyProject();
    const rack = p.racks[0];
    expect(firstFreePosition(p, rack.id, 1)).toBe(42);
    p.devices.push(createDevice(tpl('sw-48'), rack.id, 42));
    expect(firstFreePosition(p, rack.id, 2)).toBe(40);
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
});
