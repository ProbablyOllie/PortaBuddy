import { describe, expect, it } from 'vitest';
import { flushSave, hasUnbackedChanges, useStore } from '../../store';
import { library } from '../library';
import { emptyProject } from '../project';

const s = () => useStore.getState();

function setup() {
  s().newProject();
  const rackId = s().project.racks[0].id;
  expect(s().placeDevice('sw-24', rackId, 40)).toBe(true);
  expect(s().placeDevice('pp-24', rackId, 41)).toBe(true);
  expect(s().placeDevice('pdu-1u', rackId, 1, 'front')).toBe(true);
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

  it('turns devices round and respects the other side', () => {
    const { rackId, pp, sw } = setup();
    // A half-depth patch panel at U41 leaves the rear of U41 free for another half-depth device...
    expect(s().placeDevice('pdu-1u', rackId, 41, 'rear')).toBe(true);
    // ...but not for the full-depth switch.
    expect(s().moveDevice(sw.id, rackId, 41)).toBe(false);
    // The panel can't be turned to the rear now that the PDU is there.
    expect(s().setDeviceMount(pp.id, { facing: 'rear' })).toBe(false);
    expect(s().setDeviceMount(sw.id, { facing: 'rear' })).toBe(true);
    expect(s().project.devices.find((d) => d.id === sw.id)!.facing).toBe('rear');
    // Moving with a new facing turns the device round.
    expect(s().moveDevice(pp.id, rackId, 30, 'rear')).toBe(true);
    expect(s().project.devices.find((d) => d.id === pp.id)).toMatchObject({ positionU: 30, facing: 'rear' });
  });

  it('bulk patches a run of ports as one undo step, skipping clashes', () => {
    const { sw, pp, pdu } = setup();
    const ppPorts = pp.portGroups[0].ports;
    const swPorts = sw.portGroups[0].ports;
    // Port 3 is already patched elsewhere.
    s().connect({ deviceId: pp.id, portId: ppPorts[2].id }, { deviceId: sw.id, portId: swPorts[20].id });
    const before = s().past.length;
    const pairs = ppPorts.slice(0, 6).map((p, i) => [{ deviceId: pp.id, portId: p.id }, { deviceId: sw.id, portId: swPorts[i].id }] as [
      { deviceId: string; portId: string },
      { deviceId: string; portId: string },
    ]);
    // A power outlet can't take a data lead.
    pairs.push([{ deviceId: pdu.id, portId: pdu.portGroups[0].ports[0].id }, { deviceId: sw.id, portId: swPorts[10].id }]);
    const r = s().connectMany(pairs, { type: 'Cat6a', color: '#16a34a' });
    expect(r).toEqual({ created: 5, skipped: 2 });
    expect(s().past.length).toBe(before + 1);
    const labels = s().project.cables.map((c) => c.label);
    expect(labels).toEqual(['C001', 'C002', 'C003', 'C004', 'C005', 'C006']);
    expect(s().project.cables.at(-1)).toMatchObject({ type: 'Cat6a', color: '#16a34a' });
    s().undo();
    expect(s().project.cables).toHaveLength(1);
  });

  it('asks for a name when a device is dropped in', () => {
    s().newProject();
    const rackId = s().project.racks[0].id;
    s().placeDevice('sw-24', rackId, 10);
    expect(s().renamingId).toBe(s().project.devices[0].id);
  });

  it('keeps the previous project when starting or opening another', () => {
    const { sw } = setup();
    const firstId = s().projectId;
    s().setProjectName('Comms room');
    s().newProject();
    expect(s().projectId).not.toBe(firstId);
    expect(s().project.devices).toHaveLength(0);
    expect(s().past).toHaveLength(0);
    // The first project is still in the library with its devices.
    expect(library.load(firstId)!.name).toBe('Comms room');
    expect(library.load(firstId)!.devices.some((d) => d.id === sw.id)).toBe(true);
    s().importProject({ ...emptyProject(), name: 'From file' });
    expect(s().project.name).toBe('From file');
    expect(hasUnbackedChanges(s())).toBe(false); // it came from a file
    s().openProject(firstId);
    expect(s().project.name).toBe('Comms room');
  });

  it('flags changes that are not backed up to a file', () => {
    setup();
    expect(hasUnbackedChanges(s())).toBe(true);
    s().markFileSaved();
    expect(hasUnbackedChanges(s())).toBe(false);
    // An edit a moment later counts again.
    const later = Date.now() + 5;
    while (Date.now() < later) {
      /* wait for the clock to move */
    }
    s().setProjectName('changed');
    expect(hasUnbackedChanges(s())).toBe(true);
  });

  it('restores an earlier version as an undoable change', () => {
    setup();
    flushSave();
    const id = s().projectId;
    library.addVersion(id, { ...emptyProject(), name: 'Earlier' });
    const at = library.versions(id).at(-1)!.at;
    const devicesNow = s().project.devices.length;
    s().restoreVersion(at);
    expect(s().project.name).toBe('Earlier');
    s().undo();
    expect(s().project.devices).toHaveLength(devicesNow);
  });

  it('deleting the open project switches to another', () => {
    setup();
    const doomed = s().projectId;
    s().deleteProject(doomed);
    expect(s().projectId).not.toBe(doomed);
    expect(library.load(doomed)).toBeNull();
  });

  it('forgets a pending tap-then-tap when switching project', () => {
    const { sw } = setup();
    s().arm({ kind: 'move', deviceId: sw.id });
    s().newProject();
    expect(s().armed).toBeNull();
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
