import { useMemo, useState } from 'react';
import { CABLE_COLORS, CABLE_TYPES, defaultCableFor } from '../lib/templates';
import type { CableType, Device, PortRef } from '../lib/types';
import { patchProblem, usedPorts, useStore } from '../store';

interface Props {
  /** Device to patch from, e.g. the one selected when the dialog was opened. */
  initialFrom?: string;
  onClose: () => void;
}

const allPorts = (d: Device | undefined) => (d ? d.portGroups.flatMap((g) => g.ports.map((p) => ({ ...p, group: g }))) : []);

export function BulkPatch({ initialFrom, onClose }: Props) {
  const project = useStore((s) => s.project);
  const lastCable = useStore((s) => s.lastCable);
  const connectMany = useStore((s) => s.connectMany);
  const flash = useStore((s) => s.flash);

  const devices = useMemo(
    () =>
      project.racks.flatMap((r) =>
        project.devices
          .filter((d) => d.rackId === r.id && d.portGroups.some((g) => g.ports.length))
          .sort((a, b) => b.positionU - a.positionU)
          .map((d) => ({ d, label: `${r.name} · U${d.positionU} · ${d.name}` })),
      ),
    [project],
  );
  const used = useMemo(() => usedPorts(project), [project]);

  const [fromId, setFromId] = useState(initialFrom && devices.some((x) => x.d.id === initialFrom) ? initialFrom : (devices[0]?.d.id ?? ''));
  const [toId, setToId] = useState(() => devices.find((x) => x.d.id !== fromId)?.d.id ?? fromId);
  const fromPorts = allPorts(project.devices.find((d) => d.id === fromId));
  const toPorts = allPorts(project.devices.find((d) => d.id === toId));
  // Default to the first free port on each side.
  const firstFree = (ports: ReturnType<typeof allPorts>) => Math.max(0, ports.findIndex((p) => !used.has(p.id)));
  const [fromStart, setFromStart] = useState(() => firstFree(fromPorts));
  const [toStart, setToStart] = useState(() => firstFree(toPorts));
  const maxCount = Math.max(0, Math.min(fromPorts.length - fromStart, toPorts.length - toStart));
  // null = as many as fit on both devices.
  const [count, setCount] = useState<number | null>(null);
  const n = Math.min(count ?? maxCount, maxCount);

  const start = lastCable ?? defaultCableFor(fromPorts[fromStart]?.group.type ?? 'rj45');
  const [type, setType] = useState<CableType>(start.type);
  const [color, setColor] = useState(start.color);

  const pairs: [PortRef, PortRef][] = Array.from({ length: n }, (_, i) => [
    { deviceId: fromId, portId: fromPorts[fromStart + i].id },
    { deviceId: toId, portId: toPorts[toStart + i].id },
  ]);
  const problems = pairs.map(([a, b]) => patchProblem(project, a, b, used));
  const ok = problems.filter((p) => !p).length;

  const pickDevice = (id: string, side: 'from' | 'to') => {
    const ports = allPorts(project.devices.find((d) => d.id === id));
    setCount(null);
    if (side === 'from') {
      setFromId(id);
      setFromStart(firstFree(ports));
    } else {
      setToId(id);
      setToStart(firstFree(ports));
    }
  };

  const portSelect = (ports: ReturnType<typeof allPorts>, value: number, onChange: (i: number) => void) => (
    <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {ports.map((p, i) => (
        <option key={p.id} value={i}>
          {p.name || p.group.label}
          {used.has(p.id) ? ' (in use)' : ''}
        </option>
      ))}
    </select>
  );

  if (devices.length === 0) {
    return (
      <div className="modal-backdrop" onMouseDown={onClose}>
        <div className="modal narrow" onMouseDown={(e) => e.stopPropagation()}>
          <h3>Bulk patch</h3>
          <p className="hint">Add some devices with ports to a rack first.</p>
          <div className="modal-actions">
            <button className="btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Bulk patch</h3>
        <p className="hint">Patch a run of ports in one go, e.g. patch panel ports 1–24 to switch ports Gi1–24.</p>
        <div className="bulk-grid">
          <div className="bulk-side">
            <h4>From</h4>
            <label>
              Device
              <select value={fromId} onChange={(e) => pickDevice(e.target.value, 'from')}>
                {devices.map(({ d, label }) => (
                  <option key={d.id} value={d.id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Starting at port
              {portSelect(fromPorts, fromStart, (i) => {
                setFromStart(i);
                setCount(null);
              })}
            </label>
          </div>
          <div className="bulk-arrow">→</div>
          <div className="bulk-side">
            <h4>To</h4>
            <label>
              Device
              <select value={toId} onChange={(e) => pickDevice(e.target.value, 'to')}>
                {devices.map(({ d, label }) => (
                  <option key={d.id} value={d.id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Starting at port
              {portSelect(toPorts, toStart, (i) => {
                setToStart(i);
                setCount(null);
              })}
            </label>
          </div>
        </div>
        <div className="bulk-options">
          <label>
            Number of cables
            <input
              type="number"
              min={1}
              max={maxCount}
              value={n}
              onChange={(e) => setCount(Math.max(1, Math.min(maxCount, Math.floor(Number(e.target.value)) || 1)))}
            />
          </label>
          <label>
            Cable type
            <select value={type} onChange={(e) => setType(e.target.value as CableType)}>
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
                  className={`swatch${color.toLowerCase() === c.hex ? ' on' : ''}`}
                  style={{ background: c.hex }}
                  title={c.name}
                  onClick={() => setColor(c.hex)}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="bulk-preview">
          <table>
            <thead>
              <tr>
                <th>From</th>
                <th />
                <th>To</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {pairs.map((_, i) => (
                <tr key={i} className={problems[i] ? 'skip' : ''}>
                  <td>{fromPorts[fromStart + i].name || fromPorts[fromStart + i].group.label}</td>
                  <td>
                    <span className="dot" style={{ background: problems[i] ? '#d1d5db' : color }} />
                  </td>
                  <td>{toPorts[toStart + i].name || toPorts[toStart + i].group.label}</td>
                  <td className="muted">{problems[i] ? `skipped: ${problems[i]}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="modal-actions">
          <span className="muted bulk-summary">
            {ok} cable{ok === 1 ? '' : 's'} will be created{ok < n ? `, ${n - ok} skipped` : ''}
          </span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={ok === 0}
            onClick={() => {
              const r = connectMany(pairs, { type, color });
              flash(`Created ${r.created} cable${r.created === 1 ? '' : 's'}${r.skipped ? ` (${r.skipped} skipped)` : ''}. Undo with Ctrl+Z.`);
              onClose();
            }}
          >
            Patch {ok} cable{ok === 1 ? '' : 's'}
          </button>
        </div>
      </div>
    </div>
  );
}
