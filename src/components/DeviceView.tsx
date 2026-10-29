import { memo, useEffect, useRef, useState, type PointerEvent } from 'react';
import { endDrag, startDrag } from '../lib/dnd';
import { GROUP_GAP, HANDLE_W, portSize } from '../lib/layout';
import { groupColumns, groupsOn, portCell } from '../lib/project';
import { PORT_TYPE_LABELS } from '../lib/templates';
import type { Cable, Device, Face } from '../lib/types';
import { useStore } from '../store';
import { trailingDigits } from '../lib/validate';
import { beginWiring, clickSuppressed, useWiring } from '../wiring';

interface Props {
  device: Device;
  /** Side of the rack being drawn. */
  face: Face;
  /** Position and height within the rack, from the rack layout. */
  box: { top: number; height: number };
  /** portId -> cable, for every connected port in the project. */
  cables: Map<string, Cable>;
  /** Human readable description of the far end, per connected portId. */
  peers: Map<string, string>;
  selected: boolean;
  selectedCableId: string | null;
}

export const DeviceView = memo(function DeviceView({ device, face, box, cables, peers, selected, selectedCableId }: Props) {
  const select = useStore((s) => s.select);
  const startRename = useStore((s) => s.startRename);
  // The port picked as the start of a tap-to-patch.
  const armedPort = useStore((s) => (s.armed?.kind === 'patch' || s.armed?.kind === 'repatch') && s.armed.from.deviceId === device.id ? s.armed.from.portId : null);
  const updateDevice = useStore((s) => s.updateDevice);
  // In Both view a full-depth device is drawn twice; edit its name only on the side it faces.
  const renaming = useStore((s) => s.renamingId === device.id && (s.view !== 'both' || device.facing === face));
  const shown = groupsOn(device, face);
  const { w, h } = portSize(device, shown.map((x) => x.group));
  // Seeing the back of a full-depth device (e.g. a server's rear from the rear of the rack).
  const backSide = device.facing !== face;
  const showNumbers = w >= 15 && h >= 12;

  const onPortDown = (e: PointerEvent, portId: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    beginWiring(e.clientX, e.clientY, { deviceId: device.id, portId });
  };

  return (
    <div
      className={`device cat-${device.category}${selected ? ' selected' : ''}${backSide ? ' back' : ''}${device.fullDepth ? '' : ' half'}`}
      style={{ top: box.top, height: box.height }}
      data-device-el={device.id}
      data-face={face}
      onPointerEnter={(e) => e.pointerType === 'mouse' && useWiring.getState().setHoverDevice(device.id)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && useWiring.getState().setHoverDevice(null)}
      onClick={(e) => {
        e.stopPropagation();
        if (clickSuppressed()) return;
        const armed = useStore.getState().armed;
        if (armed?.kind === 'place' || (armed?.kind === 'move' && armed.deviceId !== device.id)) {
          useStore.getState().flash('That space is taken — tap an empty spot in the rack.');
          return;
        }
        select({ kind: 'device', id: device.id });
      }}
    >
      <div
        className="device-handle"
        style={{ width: HANDLE_W }}
        draggable={!renaming}
        title={`Drag to move this device · double-click to rename${backSide ? ' · rear of device' : ''}`}
        onDoubleClick={(e) => {
          e.stopPropagation();
          startRename(device.id);
          if (backSide) select({ kind: 'device', id: device.id });
        }}
        onDragStart={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const grabOffsetU = Math.floor(((e.clientY - rect.top) / rect.height) * device.heightU);
          startDrag(e, {
            kind: 'device',
            deviceId: device.id,
            heightU: device.heightU,
            fullDepth: device.fullDepth,
            grabOffsetU,
            facing: device.facing,
            fromFace: face,
          });
        }}
        onDragEnd={endDrag}
      >
        {renaming ? (
          <RenameInput
            initial={device.name}
            onDone={(name) => {
              startRename(null);
              if (name !== null && name.trim() && name.trim() !== device.name) updateDevice(device.id, { name: name.trim() });
            }}
          />
        ) : (
          <span className="device-name">{device.name}</span>
        )}
        {device.heightU > 1 || device.name !== device.model || backSide ? (
          <span className="device-model">
            {backSide ? 'Rear · ' : ''}
            {device.model}
          </span>
        ) : null}
      </div>
      <div className="device-ports" style={{ gap: GROUP_GAP }}>
        {shown.map(({ group, index: gi }) => {
          if (!group.ports.length) return null;
          const cols = groupColumns(group);
          return (
            <div
              key={gi}
              className="port-group"
              title={`${group.label} (${PORT_TYPE_LABELS[group.type]})`}
              style={{ gridTemplateColumns: `repeat(${cols}, ${w}px)`, gridTemplateRows: `repeat(${group.rows}, ${h}px)` }}
            >
              {group.ports.map((port, i) => {
                const [row, col] = portCell(i, group.rows, group.ports.length, group.numbering);
                const cable = cables.get(port.id);
                const label = port.name || group.label;
                const peer = peers.get(port.id);
                const num = trailingDigits(port.name);
                return (
                  <div
                    key={port.id}
                    data-port-id={port.id}
                    data-device-id={device.id}
                    className={`port pt-${group.type.replace('+', 'p')}${cable ? ' connected' : ''}${cable && cable.id === selectedCableId ? ' active' : ''}${port.id === armedPort ? ' armed' : ''}`}
                    style={{
                      gridRow: row + 1,
                      gridColumn: col + 1,
                      ...(cable ? { ['--cable' as string]: cable.color } : null),
                    }}
                    title={`${label} · ${PORT_TYPE_LABELS[group.type]}${cable ? `\n${cable.label} → ${peer ?? ''}` : '\nDrag to another port to patch'}`}
                    onPointerDown={(e) => onPortDown(e, port.id)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {showNumbers && num !== undefined ? <span className="port-num">{num}</span> : null}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
});

/** In-place name editor: Enter or clicking away saves, Escape cancels (reports null). */
function RenameInput({ initial, onDone }: { initial: string; onDone: (name: string | null) => void }) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  const done = useRef(false);
  const finish = (name: string | null) => {
    if (done.current) return;
    done.current = true;
    onDone(name);
  };
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      className="rename-input"
      value={value}
      aria-label="Device name"
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') finish(value);
        else if (e.key === 'Escape') finish(null);
      }}
      onBlur={() => finish(value)}
    />
  );
}
