import { useMemo, useState } from 'react';
import { exportCsvFile, exportWorkbook, saveBackupFile } from '../lib/fileActions';
import { describePort } from '../lib/project';
import { useStore } from '../store';
import { textOn } from './model';
import { useNav } from './nav';

export function CablesScreen() {
  const project = useStore((s) => s.project);
  const push = useNav((s) => s.push);
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return [...project.cables]
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
      .map((c) => ({ c, a: describePort(project, c.a), b: describePort(project, c.b) }))
      .filter((r) => !q || [r.c.label, r.c.type, r.a, r.b, r.c.notes].some((s) => s.toLowerCase().includes(q)));
  }, [project, filter]);

  return (
    <div className="m-tab-body">
      <input className="m-search" type="search" placeholder="Filter cables…" value={filter} onChange={(e) => setFilter(e.target.value)} />
      {!project.cables.length ? <p className="m-hint">No cables yet. Open a device on the Rack tab and tap a port to patch it.</p> : null}
      {rows.map(({ c, a, b }) => (
        <button key={c.id} className="m-list-item" onClick={() => push({ kind: 'cable', id: c.id })}>
          <span className="m-cable-tag" style={{ background: c.color, color: textOn(c.color) }}>
            {c.label}
          </span>
          <span className="m-device-text">
            <span className="m-cable-end">{a}</span>
            <span className="m-cable-end">→ {b}</span>
            <span className="m-muted">
              {c.type}
              {c.lengthM ? ` · ${c.lengthM} m` : ''}
              {c.notes ? ` · ${c.notes}` : ''}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

export function MoreScreen() {
  const { showProjects, openBulkPatch, setLayoutPref, addRack } = useStore.getState();
  const setRack = useNav((s) => s.setRack);
  const setTab = useNav((s) => s.setTab);
  const [busy, setBusy] = useState(false);
  return (
    <div className="m-tab-body">
      <div className="m-menu">
        <h3 className="m-face-label">Project</h3>
        <button onClick={() => showProjects(true)}>
          Projects<span className="m-muted">Switch, create, open a file, restore versions</span>
        </button>
        <button onClick={saveBackupFile}>
          Save backup file<span className="m-muted">Download a .portabuddy.json copy</span>
        </button>

        <h3 className="m-face-label">Export</h3>
        <button
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await exportWorkbook();
            setBusy(false);
          }}
        >
          {busy ? 'Exporting…' : 'Excel workbook (.xlsx)'}
          <span className="m-muted">Cable schedule, port map, devices, rack elevations</span>
        </button>
        <button onClick={() => exportCsvFile('cables')}>Cable schedule (.csv)</button>
        <button onClick={() => exportCsvFile('ports')}>Port map (.csv)</button>

        <h3 className="m-face-label">Edit</h3>
        <button onClick={() => openBulkPatch({})}>
          Bulk patch<span className="m-muted">Patch a run of ports in one go</span>
        </button>
        <button
          onClick={() => {
            addRack();
            const racks = useStore.getState().project.racks;
            setRack(racks[racks.length - 1].id);
            setTab('rack');
          }}
        >
          Add a rack
        </button>

        <h3 className="m-face-label">Display</h3>
        <button onClick={() => setLayoutPref('desktop')}>
          Use the desktop layout<span className="m-muted">Full rack drawing with drag and drop — best on a large screen</span>
        </button>
      </div>
      <p className="m-hint">
        Your work is saved automatically in this browser. Save a backup file now and then — browser storage can be cleared.
      </p>
    </div>
  );
}
