import { useEffect, useMemo, useState, type DragEvent } from 'react';
import { MIME, currentDrag, endDrag, type DragPayload } from '../lib/dnd';
import { FACE_W, rackLayout, spanBox, uAtY, type RackLayout } from '../lib/layout';
import { canPlace, otherFace, visibleOn } from '../lib/project';
import type { Cable, Face, Rack } from '../lib/types';
import { allTemplates, useStore } from '../store';
import { clickSuppressed } from '../wiring';
import { DeviceView } from './DeviceView';

interface Props {
  rack: Rack;
  cables: Map<string, Cable>;
  peers: Map<string, string>;
}

export function RackView({ rack, cables, peers }: Props) {
  const view = useStore((s) => s.view);
  const compact = useStore((s) => s.compact);
  const placing = useStore((s) => s.armed?.kind === 'place' || s.armed?.kind === 'move');
  const devices = useStore((s) => s.project.devices);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const faces: Face[] = view === 'both' ? ['front', 'rear'] : [view];
  const inRack = useMemo(() => devices.filter((d) => d.rackId === rack.id), [devices, rack.id]);
  // Shared by both faces so the front and rear of the rack line up.
  const layout = useMemo(() => rackLayout(rack.heightU, inRack, compact), [rack.heightU, inRack, compact]);
  // Units with something mounted on either side.
  const usedU = useMemo(() => new Set(inRack.flatMap((d) => Array.from({ length: d.heightU }, (_, i) => d.positionU + i))).size, [inRack]);
  const rackSelected = selection?.kind === 'rack' && selection.id === rack.id;

  return (
    <div className={`rack${rackSelected ? ' selected' : ''}${placing ? ' placing' : ''}`} data-rack-id={rack.id}>
      <button className="rack-header" onClick={() => select({ kind: 'rack', id: rack.id })} title="Rack properties">
        <span className="rack-name">{rack.name}</span>
        <span className="rack-meta">
          {rack.location ? `${rack.location} · ` : ''}
          {usedU}/{rack.heightU}U used
        </span>
      </button>
      <div className="rack-faces">
        {faces.map((face) => (
          <RackFace key={face} rack={rack} face={face} layout={layout} cables={cables} peers={peers} />
        ))}
      </div>
    </div>
  );
}

interface FaceProps extends Props {
  face: Face;
  layout: RackLayout;
}

function RackFace({ rack, face, layout, cables, peers }: FaceProps) {
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

  const devices = project.devices.filter((d) => d.rackId === rack.id && visibleOn(d, face));
  const selectedCableId = selection?.kind === 'cable' ? selection.id : null;

  /** Side the dropped device will face: new devices face this side; moved ones turn round only when they cross sides. */
  const facingFor = (payload: DragPayload): Face =>
    payload.kind === 'template' ? face : payload.fromFace === face ? payload.facing : otherFace(payload.facing);

  /** What a tap on the rack would place or move, when something was picked first (tap-then-tap). */
  const armedPayload = (): DragPayload | null => {
    const armed = useStore.getState().armed;
    if (armed?.kind === 'place') {
      const t = allTemplates(project).find((x) => x.id === armed.templateId);
      return t ? { kind: 'template', templateId: t.id, heightU: t.heightU, fullDepth: t.fullDepth } : null;
    }
    if (armed?.kind === 'move') {
      const d = project.devices.find((x) => x.id === armed.deviceId);
      if (!d) return null;
      // Seen from this side it keeps its facing; a half-depth device tapped onto the other side turns round.
      const fromFace = visibleOn(d, face) ? face : otherFace(face);
      return { kind: 'device', deviceId: d.id, heightU: d.heightU, fullDepth: d.fullDepth, grabOffsetU: 0, facing: d.facing, fromFace };
    }
    return null;
  };

  /** Rack position (bottom U) the dragged item would occupy for the pointer's current height. */
  const targetFor = (e: { clientY: number; currentTarget: Element }, payload: DragPayload) => {
    const rect = e.currentTarget.getBoundingClientRect();
    // Ratio-based so it stays correct at any zoom level.
    const pointerU = uAtY(layout, ((e.clientY - rect.top) / rect.height) * layout.total);
    const grab = payload.kind === 'device' ? payload.grabOffsetU : 0;
    const topU = pointerU + grab;
    const positionU = Math.max(1, Math.min(rack.heightU - payload.heightU + 1, topU - payload.heightU + 1));
    const ignore = payload.kind === 'device' ? payload.deviceId : undefined;
    const mount = { heightU: payload.heightU, positionU, facing: facingFor(payload), fullDepth: payload.fullDepth };
    return { positionU, heightU: payload.heightU, ok: canPlace(project, rack.id, mount, ignore) };
  };

  const onDragOver = (e: DragEvent) => {
    const payload = currentDrag();
    if (!payload) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = payload.kind === 'template' ? 'copy' : 'move';
    const t = targetFor(e, payload);
    if (!ghost || ghost.positionU !== t.positionU || ghost.ok !== t.ok || ghost.heightU !== t.heightU) setGhost(t);
  };

  const place = (payload: DragPayload, t: ReturnType<typeof targetFor>) => {
    const facing = facingFor(payload);
    return (
      t.ok &&
      (payload.kind === 'template'
        ? placeDevice(payload.templateId, rack.id, t.positionU, facing)
        : moveDevice(payload.deviceId, rack.id, t.positionU, facing))
    );
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
    if (!place(payload, targetFor(e, payload))) flash('Not enough free space there.');
  };

  const units = Array.from({ length: rack.heightU }, (_, i) => rack.heightU - i);
  const rail = (
    <div className="rail">
      {units.map((u) => (
        <div key={u} className={`rail-u${layout.heights[u] < 20 ? ' short' : ''}`} style={{ height: layout.heights[u] }}>
          {u}
        </div>
      ))}
    </div>
  );
  const ghostBox = ghost ? spanBox(layout, ghost.positionU, ghost.heightU) : null;

  return (
    <div className={`rack-face face-${face}`}>
      <div className="face-label">{face === 'front' ? 'Front' : 'Rear'}</div>
      <div className="rack-body">
        {rail}
        <div
          className="rack-slots"
          style={{ width: FACE_W, height: layout.total }}
          onDragOver={onDragOver}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setGhost(null);
          }}
          onDrop={onDrop}
          onClick={(e) => {
            e.stopPropagation();
            if (clickSuppressed()) return;
            const payload = armedPayload();
            if (!payload) {
              select(null);
              const armed = useStore.getState().armed;
              if (armed?.kind === 'patch' || armed?.kind === 'repatch') useStore.getState().arm(null);
              return;
            }
            setGhost(null);
            if (place(payload, targetFor(e, payload))) useStore.getState().arm(null);
            else flash('That space is taken — tap an empty spot in the rack.');
          }}
          onPointerMove={(e) => {
            // Preview where a picked device would go (mouse only; touch has no hover).
            if (e.pointerType !== 'mouse') return;
            const payload = armedPayload();
            if (!payload) return;
            const t = targetFor(e, payload);
            if (!ghost || ghost.positionU !== t.positionU || ghost.ok !== t.ok) setGhost(t);
          }}
          onPointerLeave={() => {
            if (!currentDrag()) setGhost(null);
          }}
        >
          {units.map((u) => (
            <div key={u} className="slot-u" style={{ top: layout.tops[u], height: layout.heights[u] }} />
          ))}
          {devices.map((d) => (
            <DeviceView
              key={d.id}
              device={d}
              face={face}
              box={spanBox(layout, d.positionU, d.heightU)}
              cables={cables}
              peers={peers}
              selected={selection?.kind === 'device' && selection.id === d.id}
              selectedCableId={selectedCableId}
            />
          ))}
          {ghost && ghostBox ? (
            <div className={`ghost${ghost.ok ? '' : ' bad'}`} style={{ top: ghostBox.top, height: Math.max(ghostBox.height, 18) }}>
              U{ghost.positionU}
              {ghost.heightU > 1 ? `–U${ghost.positionU + ghost.heightU - 1}` : ''}
            </div>
          ) : null}
        </div>
        {rail}
      </div>
    </div>
  );
}
