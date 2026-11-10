import { useEffect, useState } from 'react';
import { useTouchOrNarrow } from '../lib/useLayout';
import { backupStatus, exportCsvFile, exportWorkbook, saveBackupFile } from '../lib/fileActions';
import { hasUnbackedChanges, useStore } from '../store';
import { ChevronDownIcon, HelpIcon, PlusIcon, RedoIcon, UndoIcon } from './icons';
import { SearchBox } from './SearchBox';

export function Toolbar() {
  const project = useStore((s) => s.project);
  const unbacked = useStore(hasUnbackedChanges);
  const storageError = useStore((s) => s.storageError);
  const fileSavedAt = useStore((s) => s.fileSavedAt);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const deviceSelected = useStore((s) => (s.selection?.kind === 'device' ? s.selection.id : null));
  const { setProjectName, openBulkPatch, undo, redo, addRack, showProjects, showHelp, setLayoutPref } = useStore.getState();
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
        <img src="./favicon.svg" alt="" width={20} height={20} />
        PortaBuddy
      </div>
      <div className="project-id">
        <input className="project-name" value={project.name} onChange={(e) => setProjectName(e.target.value)} title="Project name" aria-label="Project name" />
        <button className={`save-status ${status.cls}`} title={status.title} onClick={status.cls === 'ok' ? () => showProjects(true) : save}>
          <span className="status-dot" />
          {status.text}
        </button>
      </div>
      <SearchBox />

      <div className="tb-group">
        <button className="btn quiet icon" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
          <UndoIcon />
        </button>
        <button className="btn quiet icon" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)" aria-label="Redo">
          <RedoIcon />
        </button>
      </div>
      <span className="tb-sep" />
      <div className="tb-group">
        <button className="btn quiet" onClick={addRack}>
          <PlusIcon size={14} />
          Rack
        </button>
        {/* Only offered when there is a device to patch from; the device's properties have it too. */}
        {deviceSelected ? (
          <button className="btn quiet" title="Patch a run of this device's ports in one go" onClick={() => openBulkPatch({ from: deviceSelected })}>
            Bulk patch
          </button>
        ) : null}
        {offerMobile ? (
          <button className="btn quiet" title="Switch to the touch-friendly layout" onClick={() => setLayoutPref('mobile')}>
            Mobile layout
          </button>
        ) : null}
      </div>

      <span className="tb-spacer" />

      <div className="tb-group">
        <button className="btn quiet" onClick={() => showProjects(true)} title="Switch, create, open or restore projects">
          Projects
        </button>
        <button className="btn quiet" onClick={save} title="Download the project as a backup file you can open later or share">
          Save
          {unbacked || storageError ? <span className="attn-dot" title="Changes not yet in a backup file" /> : null}
        </button>
        <div className="menu-wrap">
          <button
            className="btn primary"
            disabled={busy}
            aria-haspopup="menu"
            aria-expanded={menu}
            onClick={(e) => {
              e.stopPropagation();
              setMenu(!menu);
            }}
          >
            {busy ? 'Exporting…' : 'Export'}
            <ChevronDownIcon size={14} />
          </button>
          {menu ? (
            <div className="menu" role="menu">
              <button role="menuitem" onClick={exportXlsx}>
                Excel workbook (.xlsx)
              </button>
              <button role="menuitem" onClick={() => exportCsv('cables')}>
                Cable schedule (.csv)
              </button>
              <button role="menuitem" onClick={() => exportCsv('ports')}>
                Port map (.csv)
              </button>
              <button role="menuitem" onClick={() => useStore.getState().showPrint(true)}>
                Print / PDF…
              </button>
            </div>
          ) : null}
        </div>
        <button className="btn quiet icon" onClick={() => showHelp(true)} title="Tips and keyboard shortcuts" aria-label="Help">
          <HelpIcon />
        </button>
      </div>
    </header>
  );
}
