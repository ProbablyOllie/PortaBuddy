import { describe, expect, it } from 'vitest';
import { createDevice, emptyProject } from '../project';
import { search } from '../search';
import { BUILTIN_TEMPLATES } from '../templates';

const tpl = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)!;

function sample() {
  const p = emptyProject();
  const rack = p.racks[0];
  const pp = createDevice(tpl('pp-24'), rack.id, 42, 'PP-A01');
  const sw = createDevice(tpl('sw-48'), rack.id, 41, 'core-sw1');
  const srv = createDevice(tpl('srv-1u'), rack.id, 30, 'esx01');
  p.devices.push(pp, sw, srv);
  p.cables.push({
    id: 'c1', label: 'C001', type: 'Cat6', color: '#2563eb', lengthM: '', notes: 'VLAN 20 printers',
    a: { deviceId: pp.id, portId: pp.portGroups[0].ports[11].id },
    b: { deviceId: sw.id, portId: sw.portGroups[0].ports[11].id },
  });
  return { p, pp, sw, srv };
}

describe('search', () => {
  it('finds a port by device and port name, showing where it goes', () => {
    const { p, pp } = sample();
    const hits = search(p, 'pp-a01 12');
    expect(hits[0]).toMatchObject({ kind: 'port', id: pp.portGroups[0].ports[11].id, cableId: 'c1', face: 'front' });
    expect(hits[0].detail).toBe('C001 → Rack A / U41 core-sw1 / Gi12');
  });

  it('ranks exact port names first', () => {
    const { p } = sample();
    const ports = search(p, 'gi1').filter((h) => h.kind === 'port');
    expect(ports[0].title).toBe('core-sw1 · Gi1');
  });

  it('finds cables by notes and devices by name', () => {
    const { p } = sample();
    expect(search(p, 'printers').map((h) => h.kind)).toEqual(['cable']);
    expect(search(p, 'esx01')[0]).toMatchObject({ kind: 'device', face: 'front' });
  });

  it('reports which side of the rack a port is on', () => {
    const { p } = sample();
    expect(search(p, 'esx01 eth0').find((h) => h.kind === 'port')).toMatchObject({ face: 'rear' });
  });

  it('returns nothing for an empty query', () => {
    expect(search(sample().p, '   ')).toEqual([]);
  });
});
