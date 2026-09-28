import { useMemo, useState } from 'react';
import { cableIndex, describePort, findPort, spanOf } from '../lib/project';
import { CABLE_COLORS, CABLE_TYPES, PORT_TYPE_LABELS } from '../lib/templates';
import type { CableType, PortRef } from '../lib/types';
import { useStore } from '../store';

export function Inspector() {
  const [tab, setTab] = useState<'props' | 'cables'>('props');
  const count = useStore((s) => s.project.cables.length);
  return (
    <aside className="inspector">
      <div className="tabs">
        <button className={tab === 'props' ? 'on' : ''} onClick={() => setTab('props')}>
          Properties
        </button>
        <button className={tab === 'cables' ? 'on' : ''} onClick={() => setTab('cables')}>
          Cables ({count})
        </button>
      </div>
      <div className="inspector-body">{tab === 'props' ? <Properties /> : <CableList onPick={() => setTab('props')} />}</div>
    </aside>
  );
}

function Properties() {
  const selection = useStore((s) => s.selection);
  if (selection?.kind === 'rack') return <RackProps id={selection.id} />;
  if (selection?.kind === 'device') return <DeviceProps id={selection.id} />;
  if (selection?.kind === 'cable') return <CableProps id={selection.id} />;
  return <Overview />;
}

function Overview() {
  const project = useStore((s) => s.project);
  const ports = project.devices.reduce((n, d) => n + d.portGroups.reduce((m, g) => m + g.ports.length, 0), 0);
  return (
    <div className="props">
      <h3>{project.name}</h3>
      <dl className="stats">
        <dt>Racks</dt>
        <dd>{project.racks.length}</dd>
        <dt>Devices</dt>
        <dd>{project.devices.length}</dd>
        <dt>Ports</dt>
        <dd>{ports}</dd>
        <dt>Cables</dt>
        <dd>{project.cables.length}</dd>
      </dl>
      <h4>How to use</h4>
      <ol className="help">
        <li>Drag devices from the library on the left into a rack. Drag a device by its label to move it.</li>
        <li>Press on a port and drag to another port to run a cable between them — across racks too.</li>
        <li>Drag the end of an existing cable to a different port to re-patch it.</li>
        <li>Click a cable, device or rack header to edit its details here.</li>
        <li>
          Use <b>Export</b> to download an Excel workbook with the cable schedule, port map, device list and rack elevations.
        </li>
      </ol>
      <p className="hint">
        Your work is saved automatically in this browser. Use <b>Save</b> to keep a project file you can share or re-open elsewhere.
      </p>
      <p className="hint">Shortcuts: Delete removes the selection, Ctrl+Z / Ctrl+Shift+Z undo and redo, Esc cancels.</p>
    </div>
  );
}

function RackProps({ id }: { id: string }) {
  const project = useStore((s) => s.project);
  const updateRack = useStore((s) => s.updateRack);
  const removeRack = useStore((s) => s.removeRack);
  const moveRack = useStore((s) => s.moveRack);
  const select = useStore((s) => s.select);
  const rack = project.racks.find((r) => r.id === id);
  if (!rack) return <Overview />;
  const devices = project.devices.filter((d) => d.rackId === id).sort((a, b) => b.positionU - a.positionU);
  const used = devices.reduce((n, d) => n + d.heightU, 0);
  return (
    <div className="props">
      <div className="kind">Rack</div>
      <label>
        Name
        <input value={rack.name} onChange={(e) => updateRack(id, { name: e.target.value })} />
      </label>
      <label>
        Location
        <input value={rack.location} placeholder="e.g. Comms room 1, Row B" onChange={(e) => updateRack(id, { location: e.target.value })} />
      </label>
      <label>
        Height (U)
        <input
          type="number"
          min={1}
          max={60}
          value={rack.heightU}
          onChange={(e) => {
            const v = Math.floor(Number(e.target.value));
            if (v >= 1 && v <= 60) updateRack(id, { heightU: v });
          }}
        />
      </label>
      <p className="hint">
        {used}U of {rack.heightU}U used · {devices.length} devices
      </p>
      <div className="row-buttons">
        <button className="btn" onClick={() => moveRack(id, -1)}>
          ◀ Move left
        </button>
        <button className="btn" onClick={() => moveRack(id, 1)}>
          Move right ▶
        </button>
      </div>
      <h4>Contents</h4>
      <ul className="link-list">
        {devices.map((d) => {
          const [b, t] = spanOf(d);
          return (
            <li key={d.id}>
              <button className="link" onClick={() => select({ kind: 'device', id: d.id })}>
                U{b === t ? b : `${b}–${t}`} · {d.name}
              </button>
            </li>
          );
        })}
        {!devices.length ? <li className="hint">Empty — drag devices in from the library.</li> : null}
      </ul>
      <button
        className="btn danger"
        onClick={() => {
          if (!devices.length || confirm(`Delete ${rack.name} and the ${devices.length} devices in it?`)) removeRack(id);
        }}
      >
        Delete rack
      </button>
    </div>
  );
}

function DeviceProps({ id }: { id: string }) {
  const project = useStore((s) => s.project);
  const updateDevice = useStore((s) => s.updateDevice);
  const renamePort = useStore((s) => s.renamePort);
  const removeDevice = useStore((s) => s.removeDevice);
  const duplicateDevice = useStore((s) => s.duplicateDevice);
  const select = useStore((s) => s.select);
  const index = useMemo(() => cableIndex(project.cables), [project.cables]);
  const device = project.devices.find((d) => d.id === id);
  if (!device) return <Overview />;
  const rack = project.racks.find((r) => r.id === device.rackId);
  const [b, t] = spanOf(device);
  const allPorts = device.portGroups.flatMap((g) => g.ports);
  const used = allPorts.filter((p) => index.has(p.id)).length;

  return (
    <div className="props">
      <div className="kind">Device</div>
      <label>
        Name / hostname
        <input value={device.name} onChange={(e) => updateDevice(id, { name: e.target.value })} />
      </label>
      <p className="hint">
        {device.model} · {rack?.name} · U{b === t ? b : `${b}–${t}`} · {used}/{allPorts.length} ports used
      </p>
      <label>
        Notes
        <textarea rows={2} value={device.notes} placeholder="Serial, asset tag, IP…" onChange={(e) => updateDevice(id, { notes: e.target.value })} />
      </label>
      <div className="row-buttons">
        <button className="btn" onClick={() => duplicateDevice(id)}>
          Duplicate
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (!used || confirm(`Delete ${device.name} and its ${used} cables?`)) removeDevice(id);
          }}
        >
          Delete
        </button>
      </div>
      {device.portGroups.map((g, gi) =>
        g.ports.length ? (
          <div key={gi} className="port-table">
            <h4>
              {g.label} <span className="muted">({PORT_TYPE_LABELS[g.type]})</span>
            </h4>
            <table>
              <tbody>
                {g.ports.map((p) => {
                  const cable = index.get(p.id);
                  const other = cable ? (cable.a.portId === p.id ? cable.b : cable.a) : null;
                  return (
                    <tr key={p.id}>
                      <td>
                        <input className="port-name" value={p.name} onChange={(e) => renamePort(id, p.id, e.target.value)} />
                      </td>
                      <td>
                        {cable && other ? (
                          <button className="link" onClick={() => select({ kind: 'cable', id: cable.id })}>
                            <span className="dot" style={{ background: cable.color }} />
                            {cable.label} → {describePort(project, other)}
                          </button>
                        ) : (
                          <span className="muted">free</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null,
      )}
    </div>
  );
}

function Endpoint({ label, refr }: { label: string; refr: PortRef }) {
  const project = useStore((s) => s.project);
  const select = useStore((s) => s.select);
  const info = findPort(project, refr);
  if (!info) return <p className="muted">{label}: (missing)</p>;
  return (
    <div className="endpoint">
      <div className="endpoint-label">{label}</div>
      <button className="link" onClick={() => select({ kind: 'device', id: info.device.id })}>
        {info.rack?.name} · U{info.device.positionU} · {info.device.name}
      </button>
      <div>
        Port <b>{info.port.name || info.group.label}</b> <span className="muted">({PORT_TYPE_LABELS[info.type]})</span>
      </div>
    </div>
  );
}

function CableProps({ id }: { id: string }) {
  const cable = useStore((s) => s.project.cables.find((c) => c.id === id));
  const updateCable = useStore((s) => s.updateCable);
  const removeCable = useStore((s) => s.removeCable);
  if (!cable) return <Overview />;
  return (
    <div className="props">
      <div className="kind">Cable</div>
      <label>
        Cable ID / label
        <input value={cable.label} onChange={(e) => updateCable(id, { label: e.target.value })} />
      </label>
      <Endpoint label="End A" refr={cable.a} />
      <Endpoint label="End B" refr={cable.b} />
      <label>
        Type
        <select value={cable.type} onChange={(e) => updateCable(id, { type: e.target.value as CableType })}>
          {CABLE_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
      </label>
      <div className="field">
        Colour
        <div className="swatches">
          {CABLE_COLORS.map((c) => (
            <button
              key={c.hex}
              className={`swatch${cable.color.toLowerCase() === c.hex ? ' on' : ''}`}
              style={{ background: c.hex }}
              title={c.name}
              onClick={() => updateCable(id, { color: c.hex })}
            />
          ))}
          <input type="color" value={cable.color} title="Custom colour" onChange={(e) => updateCable(id, { color: e.target.value })} />
        </div>
      </div>
      <label>
        Length (m)
        <input value={cable.lengthM} inputMode="decimal" placeholder="e.g. 1.5" onChange={(e) => updateCable(id, { lengthM: e.target.value })} />
      </label>
      <label>
        Notes
        <textarea rows={2} value={cable.notes} placeholder="VLAN, purpose…" onChange={(e) => updateCable(id, { notes: e.target.value })} />
      </label>
      <p className="hint">Tip: drag either end of the cable in the rack to move it to another port.</p>
      <button className="btn danger" onClick={() => removeCable(id)}>
        Delete cable
      </button>
    </div>
  );
}

function CableList({ onPick }: { onPick: () => void }) {
  const project = useStore((s) => s.project);
  const select = useStore((s) => s.select);
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return [...project.cables]
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
      .map((c) => ({ c, a: describePort(project, c.a), b: describePort(project, c.b) }))
      .filter((r) => !q || [r.c.label, r.c.type, r.a, r.b, r.c.notes].some((s) => s.toLowerCase().includes(q)));
  }, [project, filter]);
  return (
    <div className="props">
      <input className="search" placeholder="Filter cables…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {!project.cables.length ? <p className="hint">No cables yet. Drag from one port to another to create one.</p> : null}
      <ul className="cable-list">
        {rows.map(({ c, a, b }) => (
          <li key={c.id}>
            <button
              onClick={() => {
                select({ kind: 'cable', id: c.id });
                onPick();
              }}
            >
              <span className="dot" style={{ background: c.color }} />
              <b>{c.label}</b> <span className="muted">{c.type}</span>
              <div className="cable-ends">
                {a}
                <br />→ {b}
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
