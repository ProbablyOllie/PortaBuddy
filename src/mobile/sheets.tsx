import { useMemo, useState } from 'react';
import { cableIndex, findPort } from '../lib/project';
import { search } from '../lib/search';
import { CABLE_COLORS, CABLE_TYPES, CATEGORY_LABELS, PORT_TYPE_LABELS } from '../lib/templates';
import type { CableType, DeviceCategory, DeviceTemplate, Face, PortRef } from '../lib/types';
import { allTemplates, patchProblem, usedPorts, useStore } from '../store';
import { freePositions, textOn, uRange } from './model';
import { useNav, type PickPurpose } from './nav';
import { PortGrid, Sheet } from './ui';

const sideLabel = (f: Face) => (f === 'front' ? 'front' : 'rear');

/** One end of a cable, tappable to jump to that device with the port highlighted. */
function EndButton({ end, label }: { end: PortRef; label: string }) {
  const project = useStore((s) => s.project);
  const replaceTop = useNav((s) => s.replaceTop);
  const info = findPort(project, end);
  if (!info) return <div className="m-end">{label}: (missing)</div>;
  return (
    <button className="m-end" onClick={() => replaceTop({ kind: 'device', id: info.device.id, port: end.portId })}>
      <span className="m-end-label">{label}</span>
      <span>
        <b>{info.device.name}</b> · port <b>{info.port.name || info.group.label}</b>
      </span>
      <span className="m-muted">
        {info.rack?.name} · {uRange(info.device.positionU, info.device.heightU)} · {sideLabel(info.face)} of rack · {PORT_TYPE_LABELS[info.type]}
      </span>
      <span className="m-chev" aria-hidden>
        ›
      </span>
    </button>
  );
}

export function PortSheet({ deviceId, portId }: { deviceId: string; portId: string }) {
  const project = useStore((s) => s.project);
  const { renamePort, removeCable } = useStore.getState();
  const { push, back } = useNav();
  const info = findPort(project, { deviceId, portId });
  if (!info) return <Sheet title="Port">Port not found.</Sheet>;
  const cable = project.cables.find((c) => c.a.portId === portId || c.b.portId === portId);
  const here: PortRef = { deviceId, portId };
  const other = cable ? (cable.a.portId === portId ? cable.b : cable.a) : null;

  return (
    <Sheet title={`${info.device.name} · ${info.port.name || info.group.label}`}>
      <div className="m-muted">
        {info.group.label} · {PORT_TYPE_LABELS[info.type]} · {sideLabel(info.face)} of rack
      </div>
      {cable && other ? (
        <>
          <div className="m-cable-chip" style={{ background: cable.color, color: textOn(cable.color) }}>
            {cable.label} · {cable.type}
            {cable.lengthM ? ` · ${cable.lengthM} m` : ''}
          </div>
          <EndButton end={other} label="Goes to" />
          <div className="m-actions">
            <button className="m-btn" onClick={() => push({ kind: 'cable', id: cable.id })}>
              Edit cable
            </button>
            <button className="m-btn" onClick={() => push({ kind: 'pick', purpose: { kind: 'repatch', cableId: cable.id, from: here } })}>
              Move this end…
            </button>
            <button
              className="m-btn danger"
              onClick={() => {
                back();
                removeCable(cable.id);
              }}
            >
              Unpatch
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="m-hint">This port is free.</p>
          <button className="m-btn primary wide" onClick={() => push({ kind: 'pick', purpose: { kind: 'new', from: here } })}>
            Patch to another port…
          </button>
        </>
      )}
      <label className="m-field">
        Port name
        <input value={info.port.name} placeholder={info.group.label} onChange={(e) => renamePort(deviceId, portId, e.target.value)} />
      </label>
    </Sheet>
  );
}

export function CableSheet({ id }: { id: string }) {
  const cable = useStore((s) => s.project.cables.find((c) => c.id === id));
  const { updateCable, removeCable } = useStore.getState();
  const back = useNav((s) => s.back);
  if (!cable) return <Sheet title="Cable">This cable no longer exists.</Sheet>;
  return (
    <Sheet title={`Cable ${cable.label}`}>
      <EndButton end={cable.a} label="End A" />
      <EndButton end={cable.b} label="End B" />
      <label className="m-field">
        Cable ID / label
        <input value={cable.label} onChange={(e) => updateCable(id, { label: e.target.value })} />
      </label>
      <div className="m-row">
        <label className="m-field">
          Type
          <select value={cable.type} onChange={(e) => updateCable(id, { type: e.target.value as CableType })}>
            {CABLE_TYPES.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
        <label className="m-field">
          Length (m)
          <input value={cable.lengthM} inputMode="decimal" placeholder="e.g. 1.5" onChange={(e) => updateCable(id, { lengthM: e.target.value })} />
        </label>
      </div>
      <div className="m-field">
        Colour
        <div className="m-swatches">
          {CABLE_COLORS.map((c) => (
            <button
              key={c.hex}
              className={`m-swatch${cable.color.toLowerCase() === c.hex ? ' on' : ''}`}
              style={{ background: c.hex }}
              aria-label={c.name}
              onClick={() => updateCable(id, { color: c.hex })}
            />
          ))}
        </div>
      </div>
      <label className="m-field">
        Notes
        <textarea rows={2} value={cable.notes} placeholder="VLAN, purpose…" onChange={(e) => updateCable(id, { notes: e.target.value })} />
      </label>
      <button
        className="m-btn danger wide"
        onClick={() => {
          back();
          removeCable(id);
        }}
      >
        Delete cable
      </button>
    </Sheet>
  );
}

/** Pick the port at the other end: first a device, then one of its ports. */
export function PickSheet({ purpose }: { purpose: PickPurpose }) {
  const project = useStore((s) => s.project);
  const { connect, repatch } = useStore.getState();
  const collapse = useNav((s) => s.collapse);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const cables = useMemo(() => cableIndex(project.cables), [project.cables]);
  const from = findPort(project, purpose.from);

  // When moving a cable end, the end that stays put is what the new port must be compatible with.
  const moving = purpose.kind === 'repatch' ? project.cables.find((c) => c.id === purpose.cableId) : undefined;
  const fixed = moving ? (moving.a.portId === purpose.from.portId ? moving.b : moving.a) : purpose.from;
  const used = useMemo(() => {
    const u = usedPorts(project);
    if (moving) {
      u.delete(moving.a.portId);
      u.delete(moving.b.portId);
    }
    return u;
  }, [project, moving]);
  const canUse = (ref: PortRef) => ref.portId !== purpose.from.portId && !patchProblem(project, fixed, ref, used);

  // Show the finished cable in place of both the picker and the port sheet it was opened from,
  // so Back returns straight to the device.
  const done = (cableId: string) => {
    const layers = useNav.getState().layers;
    collapse(layers[layers.length - 2]?.kind === 'port' ? 2 : 1, { kind: 'cable', id: cableId });
  };
  const choose = (to: PortRef) => {
    if (purpose.kind === 'new') {
      if (connect(purpose.from, to)) {
        const sel = useStore.getState().selection;
        if (sel?.kind === 'cable') done(sel.id);
      }
    } else if (repatch(purpose.cableId, purpose.from, to)) {
      done(purpose.cableId);
    }
  };

  const title = `${purpose.kind === 'new' ? 'Patch' : 'Move'} ${from ? `${from.device.name} · ${from.port.name || from.group.label}` : ''} to…`;
  const device = project.devices.find((d) => d.id === deviceId);

  if (device) {
    return (
      <Sheet
        full
        title={
          <>
            <button className="m-link" onClick={() => setDeviceId(null)}>
              ‹ Devices
            </button>{' '}
            {device.name}
          </>
        }
      >
        <p className="m-hint">Tap a free port. Ports already in use, or the wrong kind (power vs data), are greyed out.</p>
        <PortGrid
          device={device}
          cables={cables}
          disabled={(port) => !canUse({ deviceId: device.id, portId: port.id })}
          onTap={(port) => choose({ deviceId: device.id, portId: port.id })}
        />
      </Sheet>
    );
  }

  const q = query.trim().toLowerCase();
  return (
    <Sheet full title={title}>
      <input className="m-search" type="search" placeholder="Find a device…" value={query} onChange={(e) => setQuery(e.target.value)} />
      {project.racks.map((rack) => {
        const devices = project.devices
          .filter((d) => d.rackId === rack.id && (!q || `${d.name} ${d.model}`.toLowerCase().includes(q)))
          .sort((a, b) => b.positionU - a.positionU);
        if (!devices.length) return null;
        return (
          <div key={rack.id} className="m-list-group">
            <h3 className="m-face-label">{rack.name}</h3>
            {devices.map((d) => {
              const free = d.portGroups.flatMap((g) => g.ports).filter((p) => canUse({ deviceId: d.id, portId: p.id })).length;
              return (
                <button key={d.id} className="m-list-item" disabled={!free} onClick={() => setDeviceId(d.id)}>
                  <span className="m-u">{uRange(d.positionU, d.heightU)}</span>
                  <span className="m-device-text">
                    <span className="m-device-name">
                      {d.name}
                      {d.id === purpose.from.deviceId ? ' (this device)' : ''}
                    </span>
                    <span className="m-muted">{free ? `${free} free ports you can use` : 'no suitable free ports'}</span>
                  </span>
                  <span className="m-chev" aria-hidden>
                    ›
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </Sheet>
  );
}

/** Choose a device type, then where it goes. */
export function AddDeviceSheet({ rackId, face, top, bottom }: { rackId: string; face: Face; top?: number; bottom?: number }) {
  const project = useStore((s) => s.project);
  const { placeDevice, updateDevice, startRename } = useStore.getState();
  const replaceTop = useNav((s) => s.replaceTop);
  const [template, setTemplate] = useState<DeviceTemplate | null>(null);
  const [query, setQuery] = useState('');
  const [side, setSide] = useState<Face>(face);
  const [position, setPosition] = useState<number | null>(null);
  const [name, setName] = useState('');
  const rack = project.racks.find((r) => r.id === rackId);

  if (!template) {
    const q = query.trim().toLowerCase();
    const list = allTemplates(project).filter((t) => !q || t.name.toLowerCase().includes(q) || t.category.includes(q));
    const groups = new Map<string, DeviceTemplate[]>();
    for (const t of list) groups.set(t.custom ? 'custom' : t.category, [...(groups.get(t.custom ? 'custom' : t.category) ?? []), t]);
    return (
      <Sheet full title={`Add to ${rack?.name ?? 'rack'}`}>
        <input className="m-search" type="search" placeholder="Search devices…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {[...groups.entries()].map(([cat, ts]) => (
          <div key={cat} className="m-list-group">
            <h3 className="m-face-label">{cat === 'custom' ? 'My devices' : CATEGORY_LABELS[cat as DeviceCategory]}</h3>
            {ts.map((t) => (
              <button
                key={t.id}
                className={`m-list-item cat-${t.category}`}
                onClick={() => {
                  setTemplate(t);
                  const same = project.devices.filter((d) => d.model === t.name).length;
                  setName(same ? `${t.name} ${same + 1}` : t.name);
                  setSide(face);
                }}
              >
                <span className="m-swatch-bar" />
                <span className="m-device-text">
                  <span className="m-device-name">{t.name}</span>
                  <span className="m-muted">
                    {t.heightU}U · {t.fullDepth ? 'full' : 'half'} depth · {t.portGroups.reduce((n, g) => n + g.count, 0)} ports
                  </span>
                </span>
              </button>
            ))}
          </div>
        ))}
      </Sheet>
    );
  }

  const positions = freePositions(project, rackId, { heightU: template.heightU, facing: side, fullDepth: template.fullDepth });
  // Prefer the free run that was tapped: the highest position that fits inside it.
  const preferred = positions.find((p) => top === undefined || (p + template.heightU - 1 <= top && p >= (bottom ?? 1))) ?? positions[0];
  const pos = position !== null && positions.includes(position) ? position : preferred;

  return (
    <Sheet
      title={
        <>
          <button className="m-link" onClick={() => setTemplate(null)}>
            ‹ Devices
          </button>{' '}
          {template.name}
        </>
      }
      footer={
        <button
          className="m-btn primary wide"
          disabled={pos === undefined || !name.trim()}
          onClick={() => {
            if (pos === undefined || !placeDevice(template.id, rackId, pos, side)) return;
            startRename(null);
            const sel = useStore.getState().selection;
            if (sel?.kind !== 'device') return;
            if (name.trim() !== useStore.getState().project.devices.find((d) => d.id === sel.id)?.name) updateDevice(sel.id, { name: name.trim() });
            replaceTop({ kind: 'device', id: sel.id });
          }}
        >
          Add device
        </button>
      }
    >
      <label className="m-field">
        Name / hostname
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <div className="m-field">
        Mounted on
        <div className="m-seg">
          {(['front', 'rear'] as Face[]).map((f) => (
            <button key={f} className={side === f ? 'on' : ''} onClick={() => setSide(f)}>
              {f === 'front' ? 'Front' : 'Rear'}
            </button>
          ))}
        </div>
      </div>
      <label className="m-field">
        Position
        {positions.length ? (
          <select value={pos} onChange={(e) => setPosition(Number(e.target.value))}>
            {positions.map((p) => (
              <option key={p} value={p}>
                {uRange(p, template.heightU)}
              </option>
            ))}
          </select>
        ) : (
          <span className="m-warn">No room for a {template.heightU}U device on this side of the rack.</span>
        )}
      </label>
    </Sheet>
  );
}

export function RackSheet({ id }: { id: string }) {
  const rack = useStore((s) => s.project.racks.find((r) => r.id === id));
  const count = useStore((s) => s.project.devices.filter((d) => d.rackId === id).length);
  const { updateRack, removeRack } = useStore.getState();
  const back = useNav((s) => s.back);
  if (!rack) return <Sheet title="Rack">This rack no longer exists.</Sheet>;
  return (
    <Sheet title="Rack settings">
      <label className="m-field">
        Name
        <input value={rack.name} onChange={(e) => updateRack(id, { name: e.target.value })} />
      </label>
      <label className="m-field">
        Location
        <input value={rack.location} placeholder="e.g. Comms room 1, Row B" onChange={(e) => updateRack(id, { location: e.target.value })} />
      </label>
      <label className="m-field">
        Height (U)
        <input
          type="number"
          inputMode="numeric"
          min={1}
          max={60}
          value={rack.heightU}
          onChange={(e) => {
            const v = Math.floor(Number(e.target.value));
            if (v >= 1 && v <= 60) updateRack(id, { heightU: v });
          }}
        />
      </label>
      <button
        className="m-btn danger wide"
        onClick={() => {
          if (!count || confirm(`Delete ${rack.name} and the ${count} devices in it?`)) {
            back();
            removeRack(id);
          }
        }}
      >
        Delete rack
      </button>
    </Sheet>
  );
}

export function SearchSheet() {
  const project = useStore((s) => s.project);
  const { replaceTop, push, setRack, back } = useNav.getState();
  const [query, setQuery] = useState('');
  const hits = useMemo(() => search(project, query), [project, query]);
  return (
    <Sheet full title="Search">
      <input
        className="m-search"
        type="search"
        autoFocus
        placeholder="Device, port or cable — e.g. pp-a01 12"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {query.trim() && !hits.length ? <p className="m-hint">Nothing matches “{query.trim()}”.</p> : null}
      {hits.map((hit) => (
        <button
          key={`${hit.kind}:${hit.id}`}
          className="m-list-item"
          onClick={() => {
            if (hit.kind === 'rack') {
              setRack(hit.id);
              back();
            } else if (hit.kind === 'device') {
              replaceTop({ kind: 'device', id: hit.id });
            } else if (hit.kind === 'port') {
              replaceTop({ kind: 'device', id: hit.deviceId, port: hit.id });
              push({ kind: 'port', deviceId: hit.deviceId, portId: hit.id });
            } else {
              replaceTop({ kind: 'device', id: hit.deviceId, port: hit.portId });
              push({ kind: 'cable', id: hit.id });
            }
          }}
        >
          <span className="m-kind">{hit.kind}</span>
          <span className="m-device-text">
            <span className="m-device-name">{hit.title}</span>
            <span className="m-muted">{hit.detail}</span>
          </span>
        </button>
      ))}
    </Sheet>
  );
}
