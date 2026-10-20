import { memo, type PointerEvent } from 'react';
import { endDrag, startDrag } from '../lib/dnd';
import { GROUP_GAP, HANDLE_W, U_PX, portSize } from '../lib/layout';
import { groupColumns, groupsOn, portCell } from '../lib/project';
import { PORT_TYPE_LABELS } from '../lib/templates';
import type { Cable, Device, Face } from '../lib/types';
import { useStore } from '../store';
import { beginWiring, clickSuppressed } from '../wiring';

interface Props {
  device: Device;
  /** Side of the rack being drawn. */
  face: Face;
  rackHeightU: number;
  /** portId -> cable, for every connected port in the project. */
  cables: Map<string, Cable>;
  /** Human readable description of the far end, per connected portId. */
  peers: Map<string, string>;
  selected: boolean;
  selectedCableId: string | null;
}

export const DeviceView = memo(function DeviceView({ device, face, rackHeightU, cables, peers, selected, selectedCableId }: Props) {
  const select = useStore((s) => s.select);
  const shown = groupsOn(device, face);
  const { w, h } = portSize(device, shown.map((x) => x.group));
  // Seeing the back of a full-depth device (e.g. a server's rear from the rear of the rack).
  const backSide = device.facing !== face;
  const top = (rackHeightU - (device.positionU + device.heightU - 1)) * U_PX;
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
      style={{ top, height: device.heightU * U_PX }}
      onClick={(e) => {
        e.stopPropagation();
        if (!clickSuppressed()) select({ kind: 'device', id: device.id });
      }}
    >
      <div
        className="device-handle"
        style={{ width: HANDLE_W }}
        draggable
        title={`Drag to move this device${backSide ? ' (rear of device)' : ''}`}
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
        <span className="device-name">{device.name}</span>
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
                const num = /(\d+)$/.exec(port.name)?.[1];
                return (
                  <div
                    key={port.id}
                    data-port-id={port.id}
                    data-device-id={device.id}
                    className={`port pt-${group.type.replace('+', 'p')}${cable ? ' connected' : ''}${cable && cable.id === selectedCableId ? ' active' : ''}`}
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
