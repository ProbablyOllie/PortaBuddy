import { describe, expect, it } from 'vitest';
import { freePositions, portTileLabel, rackRows, textOn } from '../../mobile/model';
import { createDevice, emptyProject } from '../project';
import { BUILTIN_TEMPLATES } from '../templates';

const tpl = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)!;

function sample() {
  const p = emptyProject();
  const rack = p.racks[0];
  p.devices.push(
    createDevice(tpl('pp-24'), rack.id, 42, 'PP-A01', 'front'), // half depth, front only
    createDevice(tpl('pdu-1u'), rack.id, 42, 'PDU-1', 'rear'), // half depth, behind the panel
    createDevice(tpl('sw-48'), rack.id, 41, 'core-sw1'),
    createDevice(tpl('srv-2u'), rack.id, 30, 'esx01'),
  );
  return { p, rackId: rack.id };
}

describe('rackRows', () => {
  it('lists devices and runs of free units from the top, per side', () => {
    const { p, rackId } = sample();
    const front = rackRows(p, rackId, 'front').map((r) => (r.kind === 'device' ? r.device.name : `free ${r.top}-${r.bottom}`));
    expect(front).toEqual(['PP-A01', 'core-sw1', 'free 40-32', 'esx01', 'free 29-1']);
    const rear = rackRows(p, rackId, 'rear');
    expect(rear.map((r) => (r.kind === 'device' ? r.device.name : 'free'))).toEqual(['PDU-1', 'core-sw1', 'free', 'esx01', 'free']);
    // The switch faces the front, so from the rear we see its back.
    expect(rear.find((r) => r.kind === 'device' && r.device.name === 'core-sw1')).toMatchObject({ back: true });
    expect(rear.find((r) => r.kind === 'device' && r.device.name === 'esx01')).toMatchObject({ top: 31, bottom: 30 });
  });
});

describe('freePositions', () => {
  it('lists where a device fits, top first, honouring sides', () => {
    const { p, rackId } = sample();
    const twoU = freePositions(p, rackId, { heightU: 2, facing: 'front', fullDepth: true });
    expect(twoU[0]).toBe(39); // U39-40
    expect(twoU).not.toContain(30);
    expect(twoU).not.toContain(31); // would overlap esx01 at U31
    // Nothing fits at U42 on either side for a half-depth device now.
    expect(freePositions(p, rackId, { heightU: 1, facing: 'rear', fullDepth: false })).not.toContain(42);
    // Moving esx01 may keep its own position.
    const esx = p.devices.find((d) => d.name === 'esx01')!;
    expect(freePositions(p, rackId, esx, esx.id)).toContain(30);
  });
});

describe('tiles', () => {
  it('picks readable text and short labels', () => {
    expect(textOn('#111827')).toBe('#ffffff');
    expect(textOn('#eab308')).toBe('#111827');
    expect(portTileLabel('Gi1/0/12', 'x')).toBe('12');
    expect(portTileLabel('mgmt', 'x')).toBe('mgmt');
    expect(portTileLabel('', 'Console')).toBe('Cons');
  });
});
