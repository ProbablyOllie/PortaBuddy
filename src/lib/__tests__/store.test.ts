import { describe, expect, it } from 'vitest';
import { useStore } from '../../store';

const s = () => useStore.getState();

function setup() {
  s().newProject();
  const rackId = s().project.racks[0].id;
  expect(s().placeDevice('sw-24', rackId, 40)).toBe(true);
  expect(s().placeDevice('pp-24', rackId, 41)).toBe(true);
  expect(s().placeDevice('pdu-1u', rackId, 1)).toBe(true);
  const [sw, pp, pdu] = s().project.devices;
  return { rackId, sw, pp, pdu };
}

describe('store', () => {

  it('connects ports and refuses double-patching', () => {
    const { sw, pp } = setup();
    const a = { deviceId: sw.id, portId: sw.portGroups[0].ports[0].id };
    const b = { deviceId: pp.id, portId: pp.portGroups[0].ports[0].id };
    const c = { deviceId: pp.id, portId: pp.portGroups[0].ports[1].id };
    expect(s().connect(a, b)).toBe(true);
    expect(s().project.cables).toHaveLength(1);
    expect(s().project.cables[0].label).toBe('C001');
    expect(s().connect(a, c)).toBe(false);
    expect(s().connect(c, c)).toBe(false);
  });

  it('keeps power and data separate', () => {
    const { sw, pdu } = setup();
    expect(s().connect({ deviceId: sw.id, portId: sw.portGroups[0].ports[0].id }, { deviceId: pdu.id, portId: pdu.portGroups[0].ports[0].id })).toBe(false);
  });

  it('re-patches a cable end', () => {
    const { sw, pp } = setup();
    const a = { deviceId: sw.id, portId: sw.portGroups[0].ports[0].id };
    const b = { deviceId: pp.id, portId: pp.portGroups[0].ports[0].id };
    const c = { deviceId: pp.id, portId: pp.portGroups[0].ports[5].id };
    s().connect(a, b);
    const id = s().project.cables[0].id;
    expect(s().repatch(id, b, c)).toBe(true);
    expect(s().project.cables[0].b).toEqual(c);
    expect(s().project.cables[0].a).toEqual(a);
  });

  it('moves devices only into free space', () => {
    const { rackId, sw } = setup();
    expect(s().moveDevice(sw.id, rackId, 41)).toBe(false);
    expect(s().moveDevice(sw.id, rackId, 20)).toBe(true);
    expect(s().project.devices.find((d) => d.id === sw.id)!.positionU).toBe(20);
  });

  it('removes cables with their device, and undo restores both', () => {
    const { sw, pp } = setup();
    s().connect({ deviceId: sw.id, portId: sw.portGroups[0].ports[0].id }, { deviceId: pp.id, portId: pp.portGroups[0].ports[0].id });
    s().removeDevice(sw.id);
    expect(s().project.cables).toHaveLength(0);
    s().undo();
    expect(s().project.cables).toHaveLength(1);
    expect(s().project.devices.some((d) => d.id === sw.id)).toBe(true);
    s().redo();
    expect(s().project.cables).toHaveLength(0);
  });

  it('collapses rapid typing into a single undo step', () => {
    const { sw } = setup();
    const before = s().past.length;
    s().updateDevice(sw.id, { name: 'c' });
    s().updateDevice(sw.id, { name: 'co' });
    s().updateDevice(sw.id, { name: 'core' });
    expect(s().past.length).toBe(before + 1);
    s().undo();
    expect(s().project.devices.find((d) => d.id === sw.id)!.name).toBe('Switch 24-port');
  });

  it('duplicates a device with fresh port ids', () => {
    const { sw } = setup();
    s().duplicateDevice(sw.id);
    const copy = s().project.devices.at(-1)!;
    expect(copy.id).not.toBe(sw.id);
    expect(copy.portGroups[0].ports[0].id.startsWith(copy.id)).toBe(true);
    expect(copy.positionU).toBe(39);
  });
});
