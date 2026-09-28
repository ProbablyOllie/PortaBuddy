import { useState } from 'react';
import { uid } from '../lib/project';
import { CATEGORY_LABELS, PORT_TYPE_LABELS } from '../lib/templates';
import type { DeviceCategory, DeviceTemplate, PortGroupSpec, PortType } from '../lib/types';
import { useStore } from '../store';

interface Props {
  initial: DeviceTemplate | null;
  onClose: () => void;
}

const blankGroup = (): PortGroupSpec => ({ label: 'Ports', prefix: '', count: 24, start: 1, type: 'rj45', rows: 1, numbering: 'zigzag' });

export function TemplateEditor({ initial, onClose }: Props) {
  const saveTemplate = useStore((s) => s.saveTemplate);
  const [t, setT] = useState<DeviceTemplate>(
    () =>
      initial ?? {
        id: uid('tpl'),
        name: 'My device',
        category: 'switch',
        heightU: 1,
        portGroups: [blankGroup()],
        custom: true,
      },
  );

  const setGroup = (i: number, patch: Partial<PortGroupSpec>) =>
    setT({ ...t, portGroups: t.portGroups.map((g, j) => (j === i ? { ...g, ...patch } : g)) });

  const num = (v: string, min: number, max: number) => Math.max(min, Math.min(max, Math.floor(Number(v) || min)));

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div className="modal" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{initial ? 'Edit device type' : 'New device type'}</h3>
        <div className="form-grid">
          <label>
            Name
            <input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} autoFocus />
          </label>
          <label>
            Category
            <select value={t.category} onChange={(e) => setT({ ...t, category: e.target.value as DeviceCategory })}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label>
            Height (U)
            <input type="number" min={1} max={20} value={t.heightU} onChange={(e) => setT({ ...t, heightU: num(e.target.value, 1, 20) })} />
          </label>
        </div>

        <h4>Port groups</h4>
        <p className="hint">
          Each group is a block of identical ports. Ports are named prefix + number, e.g. prefix <code>Gi1/0/</code> starting at 1 gives
          Gi1/0/1, Gi1/0/2…
        </p>
        <table className="groups-table">
          <thead>
            <tr>
              <th>Label</th>
              <th>Type</th>
              <th>Count</th>
              <th>Prefix</th>
              <th>Start #</th>
              <th>Rows</th>
              <th>Numbering</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {t.portGroups.map((g, i) => (
              <tr key={i}>
                <td>
                  <input value={g.label} onChange={(e) => setGroup(i, { label: e.target.value })} />
                </td>
                <td>
                  <select value={g.type} onChange={(e) => setGroup(i, { type: e.target.value as PortType })}>
                    {Object.entries(PORT_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input type="number" min={1} max={256} value={g.count} onChange={(e) => setGroup(i, { count: num(e.target.value, 1, 256) })} />
                </td>
                <td>
                  <input value={g.prefix} onChange={(e) => setGroup(i, { prefix: e.target.value })} />
                </td>
                <td>
                  <input type="number" min={0} value={g.start ?? 1} onChange={(e) => setGroup(i, { start: num(e.target.value, 0, 9999) })} />
                </td>
                <td>
                  <input
                    type="number"
                    min={1}
                    max={t.heightU * 2}
                    value={g.rows}
                    onChange={(e) => setGroup(i, { rows: num(e.target.value, 1, t.heightU * 2) })}
                  />
                </td>
                <td>
                  <select value={g.numbering} onChange={(e) => setGroup(i, { numbering: e.target.value as PortGroupSpec['numbering'] })}>
                    <option value="zigzag">1 top, 2 below</option>
                    <option value="row">Row by row</option>
                  </select>
                </td>
                <td>
                  <button className="icon-btn" title="Remove group" onClick={() => setT({ ...t, portGroups: t.portGroups.filter((_, j) => j !== i) })}>
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn" onClick={() => setT({ ...t, portGroups: [...t.portGroups, blankGroup()] })}>
          + Add port group
        </button>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn primary"
            disabled={!t.name.trim()}
            onClick={() => {
              saveTemplate({
                ...t,
                name: t.name.trim(),
                custom: true,
                portGroups: t.portGroups.map((g) => ({ ...g, rows: Math.min(g.rows, t.heightU * 2) })),
              });
              onClose();
            }}
          >
            Save device type
          </button>
        </div>
        {initial ? <p className="hint">Changes apply to devices you add from now on; devices already in racks keep their ports.</p> : null}
      </div>
    </div>
  );
}
