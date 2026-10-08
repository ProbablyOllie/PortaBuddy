import { useEffect, useState, type DragEvent } from 'react';
import { MIME, currentDrag, endDrag, type DragPayload } from '../lib/dnd';
import { FACE_W, U_PX } from '../lib/layout';
import { canPlace } from '../lib/project';
import type { Cable, Rack } from '../lib/types';
import { useStore } from '../store';
import { clickSuppressed } from '../wiring';
import { DeviceView } from './DeviceView';

interface Props {
  rack: Rack;
  cables: Map<string, Cable>;
  peers: Map<string, string>;
}

export function RackView({ rack, cables, peers }: Props) {
  const project = useStore((s) => s.project);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const placeDevice = useStore((s) => s.placeDevice);
  const moveDevice = useStore((s) => s.moveDevice);
  const flash = useStore((s) => s.flash);
  const [ghost, setGhost] = useState<{ positionU: number; heightU: number; ok: boolean } | null>(null);

  useEffect(() => {
    // A cancelled drag never fires dragleave/drop on the rack, so clear the preview here.
    const clear = () => setGhost(null);
    window.addEventListener('dragend', clear);
    window.addEventListener('drop', clear);
    return () => {
      window.removeEventListener('dragend', clear);
      window.removeEventListener('drop', clear);
    };
  }, []);

  const devices = project.devices.filter((d) => d.rackId === rack.id);
  const selectedCableId = selection?.kind === 'cable' ? selection.id : null;

  /** Rack position (bottom U) the dragged item would occupy for the pointer's current height. */
  const targetFor = (e: DragEvent, payload: DragPayload) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Ratio-based so it stays correct at any zoom level.
    const fromTop = Math.floor(((e.clientY - rect.top) / rect.height) * rack.heightU);
    const grab = payload.kind === 'device' ? payload.grabOffsetU : 0;
    const topU = rack.heightU - fromTop + grab;
    const positionU = Math.max(1, Math.min(rack.heightU - payload.heightU + 1, topU - payload.heightU + 1));
    const ignore = payload.kind === 'device' ? payload.deviceId : undefined;
    return { positionU, heightU: payload.heightU, ok: canPlace(project, rack.id, payload.heightU, positionU, ignore) };
  };

  const onDragOver = (e: DragEvent) => {
    const payload = currentDrag();
    if (!payload) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = payload.kind === 'template' ? 'copy' : 'move';
    const t = targetFor(e, payload);
    if (!ghost || ghost.positionU !== t.positionU || ghost.ok !== t.ok || ghost.heightU !== t.heightU) setGhost(t);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setGhost(null);
    let payload = currentDrag();
    if (!payload) {
      try {
        payload = JSON.parse(e.dataTransfer.getData(MIME)) as DragPayload;
      } catch {
        return;
      }
    }
    endDrag();
    const t = targetFor(e, payload);
    const ok =
      t.ok &&
      (payload.kind === 'template'
        ? placeDevice(payload.templateId, rack.id, t.positionU)
        : moveDevice(payload.deviceId, rack.id, t.positionU));
    if (!ok) flash('Not enough free space there.');
  };

  const units = Array.from({ length: rack.heightU }, (_, i) => rack.heightU - i);
  const rackSelected = selection?.kind === 'rack' && selection.id === rack.id;

  return (
    <div className={`rack${rackSelected ? ' selected' : ''}`}>
      <button className="rack-header" onClick={() => select({ kind: 'rack', id: rack.id })} title="Rack properties">
        <span className="rack-name">{rack.name}</span>
        <span className="rack-meta">
          {rack.location ? `${rack.location} · ` : ''}
          {rack.heightU}U
        </span>
      </button>
      <div className="rack-body">
        <div className="rail">
          {units.map((u) => (
            <div key={u} className="rail-u" style={{ height: U_PX }}>
              {u}
            </div>
          ))}
        </div>
        <div
          className="rack-slots"
          style={{ width: FACE_W, height: rack.heightU * U_PX, backgroundSize: `100% ${U_PX}px` }}
          onDragOver={onDragOver}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setGhost(null);
          }}
          onDrop={onDrop}
          onClick={(e) => {
            e.stopPropagation();
            if (!clickSuppressed()) select(null);
          }}
        >
          {devices.map((d) => (
            <DeviceView
              key={d.id}
              device={d}
              rackHeightU={rack.heightU}
              cables={cables}
              peers={peers}
              selected={selection?.kind === 'device' && selection.id === d.id}
              selectedCableId={selectedCableId}
            />
          ))}
          {ghost ? (
            <div
              className={`ghost${ghost.ok ? '' : ' bad'}`}
              style={{ top: (rack.heightU - (ghost.positionU + ghost.heightU - 1)) * U_PX, height: ghost.heightU * U_PX }}
            >
              U{ghost.positionU}
              {ghost.heightU > 1 ? `–U${ghost.positionU + ghost.heightU - 1}` : ''}
            </div>
          ) : null}
        </div>
        <div className="rail">
          {units.map((u) => (
            <div key={u} className="rail-u" style={{ height: U_PX }}>
              {u}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
