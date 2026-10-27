import { useMemo } from 'react';
import { cableIndex } from '../lib/project';
import type { Face } from '../lib/types';
import { useStore } from '../store';
import { rackRows, uRange } from './model';
import { useNav } from './nav';

/** Height of one U in the mobile rack list; tall devices get taller cards, capped so a 4U server isn't a whole screen. */
const ROW_U = 30;
const MIN_ROW = 52;

export function RackScreen() {
  const project = useStore((s) => s.project);
  const addRack = useStore((s) => s.addRack);
  const { rackId, face, setRack, setFace, push } = useNav();
  const rack = project.racks.find((r) => r.id === rackId) ?? project.racks[0];
  const cables = useMemo(() => cableIndex(project.cables), [project.cables]);
  const rows = useMemo(() => (rack ? rackRows(project, rack.id, face) : []), [project, rack, face]);

  if (!rack) {
    return (
      <div className="m-empty">
        <p>This project has no racks yet.</p>
        <button className="m-btn primary" onClick={() => addRack()}>
          + Add a rack
        </button>
      </div>
    );
  }

  const usedU = new Set(project.devices.filter((d) => d.rackId === rack.id).flatMap((d) => Array.from({ length: d.heightU }, (_, i) => d.positionU + i))).size;

  return (
    <div className="m-rack-screen">
      <div className="m-rack-tabs" role="tablist">
        {project.racks.map((r) => (
          <button key={r.id} role="tab" aria-selected={r.id === rack.id} className={r.id === rack.id ? 'on' : ''} onClick={() => setRack(r.id)}>
            {r.name}
          </button>
        ))}
        <button
          className="m-rack-add"
          onClick={() => {
            addRack();
            const racks = useStore.getState().project.racks;
            setRack(racks[racks.length - 1].id);
          }}
        >
          + Rack
        </button>
      </div>

      <div className="m-rack-bar">
        <button className="m-rack-info" onClick={() => push({ kind: 'rack', id: rack.id })} aria-label="Rack settings">
          <span className="m-rack-name">{rack.name}</span>
          <span className="m-muted">
            {rack.location ? `${rack.location} · ` : ''}
            {usedU}/{rack.heightU}U used ⋯
          </span>
        </button>
        <div className="m-seg" role="group" aria-label="Side of rack">
          {(['front', 'rear'] as Face[]).map((f) => (
            <button key={f} className={face === f ? 'on' : ''} onClick={() => setFace(f)}>
              {f === 'front' ? 'Front' : 'Rear'}
            </button>
          ))}
        </div>
      </div>

      <div className="m-rack">
        {rows.map((row) => {
          if (row.kind === 'free') {
            const n = row.top - row.bottom + 1;
            return (
              <button
                key={`free-${row.top}`}
                className="m-free"
                onClick={() => push({ kind: 'add', rackId: rack.id, face, top: row.top, bottom: row.bottom })}
              >
                <span className="m-u">{n > 1 ? `U${row.top}–${row.bottom}` : `U${row.top}`}</span>
                <span className="m-muted">{n}U free</span>
                <span className="m-free-add">+ Add</span>
              </button>
            );
          }
          const d = row.device;
          const ports = d.portGroups.flatMap((g) => g.ports);
          const used = ports.filter((p) => cables.has(p.id)).length;
          return (
            <button
              key={d.id}
              className={`m-device cat-${d.category}${row.back ? ' back' : ''}`}
              style={{ minHeight: Math.max(MIN_ROW, Math.min(4, d.heightU) * ROW_U) }}
              onClick={() => push({ kind: 'device', id: d.id })}
            >
              <span className="m-u">{uRange(d.positionU, d.heightU)}</span>
              <span className="m-device-text">
                <span className="m-device-name">{d.name}</span>
                <span className="m-muted">
                  {row.back ? 'Rear of device · ' : ''}
                  {d.name !== d.model ? `${d.model} · ` : ''}
                  {ports.length ? `${used}/${ports.length} ports used` : 'no ports'}
                </span>
                {ports.length ? (
                  <span className="m-usage" aria-hidden>
                    <span style={{ width: `${(used / ports.length) * 100}%` }} />
                  </span>
                ) : null}
              </span>
              <span className="m-chev" aria-hidden>
                ›
              </span>
            </button>
          );
        })}
      </div>
      <p className="m-hint">
        Tap a device to see its ports and patch cables. Showing the {face} of the rack — full-depth devices appear on both sides.
      </p>
    </div>
  );
}
