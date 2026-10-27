import { useEffect, useState } from 'react';
import { useTouchOrNarrow } from '../lib/useLayout';
import { backupStatus, exportCsvFile, exportWorkbook, saveBackupFile } from '../lib/fileActions';
import { hasUnbackedChanges, useStore } from '../store';
import { SearchBox } from './SearchBox';

export function Toolbar() {
  const project = useStore((s) => s.project);
  const unbacked = useStore(hasUnbackedChanges);
  const storageError = useStore((s) => s.storageError);
  const fileSavedAt = useStore((s) => s.fileSavedAt);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const { setProjectName, openBulkPatch, undo, redo, addRack, showProjects, setLayoutPref } = useStore.getState();
  const offerMobile = useTouchOrNarrow();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  const exportXlsx = async () => {
    setBusy(true);
    await exportWorkbook();
    setBusy(false);
  };
  const exportCsv = exportCsvFile;
  const save = saveBackupFile;

  // Re-render every minute so "backed up 3 min ago" stays current.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const status = backupStatus({ storageError, unbacked, fileSavedAt });

  return (
    <header className="toolbar">
      <div className="brand">
        <img src="./favicon.svg" alt="" width={22} height={22} />
        PortaBuddy
      </div>
      <div className="project-id">
        <input className="project-name" value={project.name} onChange={(e) => setProjectName(e.target.value)} title="Project name" />
        <button className={`save-status ${status.cls}`} title={status.title} onClick={status.cls === 'ok' ? () => showProjects(true) : save}>
          <span className="status-dot" />
          {status.text}
        </button>
      </div>
      <SearchBox />

      <div className="tb-group">
        <button className="btn" onClick={() => showProjects(true)} title="Switch, create, open or restore projects">
          Projects
        </button>
        <button
          className={`btn${unbacked || storageError ? ' save-attn' : ''}`}
          onClick={save}
          title="Download the project as a backup file you can open later or share"
        >
          Save
        </button>
        <div className="menu-wrap">
          <button
            className="btn primary"
            disabled={busy}
            onClick={(e) => {
              e.stopPropagation();
              setMenu(!menu);
            }}
          >
            {busy ? 'Exporting…' : 'Export ▾'}
          </button>
          {menu ? (
            <div className="menu">
              <button onClick={exportXlsx}>Excel workbook (.xlsx)</button>
              <button onClick={() => exportCsv('cables')}>Cable schedule (.csv)</button>
              <button onClick={() => exportCsv('ports')}>Port map (.csv)</button>
              <button onClick={() => useStore.getState().showPrint(true)}>Print / PDF…</button>
            </div>
          ) : null}
        </div>
      </div>

      <div className="tb-group">
        <button className="btn" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          ↶
        </button>
        <button className="btn" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          ↷
        </button>
        <button className="btn" onClick={addRack}>
          + Rack
        </button>
        <button
          className="btn"
          title="Patch a run of ports in one go"
          onClick={() => {
            const sel = useStore.getState().selection;
            openBulkPatch({ from: sel?.kind === 'device' ? sel.id : undefined });
          }}
        >
          Bulk patch
        </button>
        {offerMobile ? (
          <button className="btn" title="Switch to the touch-friendly layout" onClick={() => setLayoutPref('mobile')}>
            Mobile layout
          </button>
        ) : null}
      </div>

</header>
  );
}
