import { describe, expect, it } from 'vitest';
import { PRINT, fitText, printCables, printElevation } from '../printLayout';
import { createDevice, emptyProject } from '../project';
import { BUILTIN_TEMPLATES } from '../templates';

const tpl = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)!;

function sample() {
  const p = emptyProject();
  const a = p.racks[0];
  p.racks.push({ id: 'rb', name: 'Rack B', location: '', heightU: 24 });
  const pp = createDevice(tpl('pp-24'), a.id, 42, 'PP-A01', 'front');
  const sw = createDevice(tpl('sw-48'), a.id, 41, 'core-sw1');
  const srv = createDevice(tpl('srv-2u'), 'rb', 10, 'esx01');
  p.devices.push(pp, sw, srv);
  p.cables.push(
    { id: 'c1', label: 'C001', a: { deviceId: pp.id, portId: pp.portGroups[0].ports[0].id }, b: { deviceId: sw.id, portId: sw.portGroups[0].ports[0].id }, type: 'Cat6', color: '#2563eb', lengthM: '0.5', notes: '' },
    { id: 'c2', label: 'C002', a: { deviceId: srv.id, portId: srv.portGroups[0].ports[0].id }, b: { deviceId: sw.id, portId: sw.portGroups[0].ports[1].id }, type: 'Cat6a', color: '#dc2626', lengthM: '', notes: 'uplink' },
  );
  return { p, a, pp, sw, srv };
}

describe('printElevation', () => {
  it('lays out every U and the devices seen from one side', () => {
    const { p, a } = sample();
    const front = printElevation(p, a.id, 'front', false);
    expect(front.units).toHaveLength(42);
    expect(front.height).toBe(42 * PRINT.U);
    expect(front.devices.map((d) => d.name)).toEqual(['PP-A01', 'core-sw1']);
    expect(front.devices[0]).toMatchObject({ y: 0, h: PRINT.U, back: false });
    // The half-depth patch panel isn't seen from the rear; the switch's back is.
    const rear = printElevation(p, a.id, 'rear', false);
    expect(rear.devices.map((d) => [d.name, d.back])).toEqual([['core-sw1', true]]);
    expect(rear.devices[0].ports).toHaveLength(2); // its rear PSUs
  });

  it('colours patched ports and keeps every port inside its device', () => {
    const { p, a, sw } = sample();
    const el = printElevation(p, a.id, 'front', false);
    const swEl = el.devices.find((d) => d.id === sw.id)!;
    expect(swEl.ports).toHaveLength(52);
    expect(swEl.ports.find((x) => x.id === sw.portGroups[0].ports[0].id)!.color).toBe('#2563eb');
    expect(swEl.ports.find((x) => x.id === sw.portGroups[0].ports[2].id)!.color).toBeNull();
    for (const port of swEl.ports) {
      expect(port.x).toBeGreaterThanOrEqual(PRINT.RAIL + PRINT.LABEL);
      expect(port.x + port.w).toBeLessThanOrEqual(PRINT.RAIL + PRINT.FACE);
      expect(port.y).toBeGreaterThanOrEqual(swEl.y);
      expect(port.y + port.h).toBeLessThanOrEqual(swEl.y + swEl.h);
    }
  });

  it('can draw empty space short', () => {
    const { p, a } = sample();
    expect(printElevation(p, a.id, 'front', true).height).toBeLessThan(printElevation(p, a.id, 'front', false).height / 2);
  });
});

describe('printCables', () => {
  it('lists cables touching the rack, from that rack’s point of view', () => {
    const { p, a } = sample();
    const rows = printCables(p, a.id);
    expect(rows.map((r) => r.label)).toEqual(['C001', 'C002']);
    expect(rows[0]).toMatchObject({ here: 'U42 PP-A01 · 1 (front)', there: 'U41 core-sw1 · Gi1 (front)', colorName: 'Blue' });
    // C002's end in Rack A is the switch; the far end names its rack.
    expect(rows[1]).toMatchObject({ here: 'U41 core-sw1 · Gi2 (front)', there: 'Rack B / U10 esx01 / eth0 (rear)' });
    expect(printCables(p, 'rb').map((r) => r.label)).toEqual(['C002']);
  });
});

describe('fitText', () => {
  it('shortens long names', () => {
    expect(fitText('short', 50, 4)).toBe('short');
    expect(fitText('a very long device name indeed', 30, 4)).toMatch(/…$/);
  });
});
