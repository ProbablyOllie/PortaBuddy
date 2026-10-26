import { useMemo, useState } from 'react';
import { cableIndex } from '../lib/project';
import type { Face } from '../lib/types';
import { useStore } from '../store';
import { freePositions, uRange } from './model';
import { useNav } from './nav';
import { PortGrid, ScreenHeader } from './ui';

export function DeviceScreen({ id, highlight }: { id: string; highlight?: string }) {
  const project = useStore((s) => s.project);
  const { updateDevice, moveDevice, setDeviceMount, removeDevice, duplicateDevice, openBulkPatch, flash } = useStore.getState();
  const push = useNav((s) => s.push);
  const back = useNav((s) => s.back);
  const replaceTop = useNav((s) => s.replaceTop);
  const [details, setDetails] = useState(false);
  const cables = useMemo(() => cableIndex(project.cables), [project.cables]);
  const device = project.devices.find((d) => d.id === id);
  const rack = project.racks.find((r) => r.id === device?.rackId);

  if (!device || !rack) {
    return (
      <div className="m-screen">
        <ScreenHeader title="Device not found" />
        <p className="m-hint">It may have been deleted.</p>
      </div>
    );
  }

  const ports = device.portGroups.flatMap((g) => g.ports);
  const used = ports.filter((p) => cables.has(p.id)).length;
  const positions = freePositions(project, rack.id, device, device.id);

  return (
    <div className="m-screen">
      <ScreenHeader
        title={device.name}
        sub={`${rack.name} · ${uRange(device.positionU, device.heightU)} · ${used}/${ports.length} ports used`}
      />
      <div className="m-screen-body">
        <label className="m-field">
          Name / hostname
          <input value={device.name} onChange={(e) => updateDevice(id, { name: e.target.value })} />
        </label>

        <PortGrid device={device} cables={cables} highlightId={highlight} onTap={(port) => push({ kind: 'port', deviceId: id, portId: port.id })} />

        <div className="m-actions">
          {ports.length ? (
            <button className="m-btn" onClick={() => openBulkPatch({ from: id })}>
              Bulk patch…
            </button>
          ) : null}
          <button className="m-btn" onClick={() => setDetails(!details)} aria-expanded={details}>
            {details ? 'Hide details' : 'Position & details'}
          </button>
        </div>

        {details ? (
          <div className="m-card">
            <div className="m-muted">{device.model}</div>
            <label className="m-field">
              Position
              <select
                value={device.positionU}
                onChange={(e) => {
                  if (!moveDevice(id, rack.id, Number(e.target.value))) flash('Not enough free space there.');
                }}
              >
                {positions.map((p) => (
                  <option key={p} value={p}>
                    {uRange(p, device.heightU)}
                  </option>
                ))}
              </select>
            </label>
            <div className="m-row">
              <label className="m-field">
                Mounted facing
                <select value={device.facing} onChange={(e) => setDeviceMount(id, { facing: e.target.value as Face })}>
                  <option value="front">Front of rack</option>
                  <option value="rear">Rear of rack</option>
                </select>
              </label>
              <label className="m-field">
                Depth
                <select value={device.fullDepth ? 'full' : 'half'} onChange={(e) => setDeviceMount(id, { fullDepth: e.target.value === 'full' })}>
                  <option value="full">Full</option>
                  <option value="half">Half</option>
                </select>
              </label>
            </div>
            <label className="m-field">
              Notes
              <textarea rows={2} value={device.notes} placeholder="Serial, asset tag, IP…" onChange={(e) => updateDevice(id, { notes: e.target.value })} />
            </label>
            <div className="m-actions">
              <button
                className="m-btn"
                onClick={() => {
                  duplicateDevice(id);
                  const sel = useStore.getState().selection;
                  if (sel?.kind === 'device' && sel.id !== id) replaceTop({ kind: 'device', id: sel.id });
                }}
              >
                Duplicate
              </button>
              <button
                className="m-btn danger"
                onClick={() => {
                  if (!used || confirm(`Delete ${device.name} and its ${used} cables?`)) {
                    back();
                    removeDevice(id);
                  }
                }}
              >
                Delete device
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
