import { useEffect, type ReactNode } from 'react';
import { groupsOn } from '../lib/project';
import { cssEscape } from '../lib/validate';
import { PORT_TYPE_LABELS } from '../lib/templates';
import type { Cable, Device, Face, Port, PortGroup } from '../lib/types';
import { portTileLabel, textOn } from './model';
import { useNav } from './nav';

/** Panel sliding up from the bottom. Tapping outside or the × goes back. */
export function Sheet({ title, children, full, footer }: { title: ReactNode; children: ReactNode; full?: boolean; footer?: ReactNode }) {
  const back = useNav((s) => s.back);
  return (
    <div className="m-sheet-backdrop" onClick={back}>
      <div className={`m-sheet${full ? ' full' : ''}`} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <div className="m-sheet-head">
          <div className="m-sheet-title">{title}</div>
          <button className="m-icon-btn" aria-label="Close" onClick={back}>
            ×
          </button>
        </div>
        <div className="m-sheet-body">{children}</div>
        {footer ? <div className="m-sheet-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

export function ScreenHeader({ title, sub, right }: { title: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  const back = useNav((s) => s.back);
  return (
    <div className="m-screen-head">
      <button className="m-icon-btn" aria-label="Back" onClick={back}>
        ‹
      </button>
      <div className="m-screen-title">
        <div>{title}</div>
        {sub ? <div className="m-sub">{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}


/**
 * All ports of a device as big touch targets, grouped by side of the rack and port group.
 * Ports wrap in number order rather than copying the faceplate, which would be far too small.
 */
export function PortGrid({
  device,
  cables,
  onTap,
  disabled,
  highlightId,
  faces = ['front', 'rear'],
}: {
  device: Device;
  cables: Map<string, Cable>;
  onTap: (port: Port, group: PortGroup) => void;
  /** Ports that can't be tapped (e.g. already in use when picking a port to patch to). */
  disabled?: (port: Port, group: PortGroup) => boolean;
  /** Port to scroll to and ring. */
  highlightId?: string;
  faces?: Face[];
}) {
  useEffect(() => {
    if (!highlightId) return;
    document.querySelector(`[data-m-port="${cssEscape(highlightId)}"]`)?.scrollIntoView({ block: 'center' });
  }, [highlightId]);

  const sections = faces.map((face) => ({ face, groups: groupsOn(device, face).filter((x) => x.group.ports.length) })).filter((s) => s.groups.length);
  if (!sections.length) return <p className="m-hint">This device has no ports.</p>;
  return (
    <div className="m-ports">
      {sections.map(({ face, groups }) => (
        <section key={face}>
          {sections.length > 1 || face === 'rear' ? <h3 className="m-face-label">{face === 'front' ? 'Front of rack' : 'Rear of rack'}</h3> : null}
          {groups.map(({ group, index }) => {
            const used = group.ports.filter((p) => cables.has(p.id)).length;
            return (
              <div key={index} className="m-port-group">
                <div className="m-group-head">
                  {group.label} <span className="m-muted">· {PORT_TYPE_LABELS[group.type]} · {used}/{group.ports.length} used</span>
                </div>
                <div className="m-port-grid">
                  {group.ports.map((port) => {
                    const cable = cables.get(port.id);
                    const highlight = port.id === highlightId;
                    return (
                      <button
                        key={port.id}
                        data-m-port={port.id}
                        className={`m-port pt-${group.type.replace('+', 'p')}${cable ? ' connected' : ''}${highlight ? ' highlight' : ''}`}
                        style={cable ? { background: cable.color, color: textOn(cable.color), borderColor: cable.color } : undefined}
                        disabled={disabled?.(port, group)}
                        aria-label={`${port.name || group.label}${cable ? `, cable ${cable.label}` : ', free'}`}
                        onClick={() => onTap(port, group)}
                      >
                        {portTileLabel(port.name, group.label)}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
