import { useEffect, useState } from 'react';
import { buildWorkbook, cableSheet, downloadBlob, portMapSheet, safeFileName, toCsv } from '../lib/export';
import { hasUnbackedChanges, useStore } from '../store';
import { timeAgo } from '../lib/time';
import { SearchBox } from './SearchBox';

export function Toolbar() {
  const project = useStore((s) => s.project);
  const unbacked = useStore(hasUnbackedChanges);
  const storageError = useStore((s) => s.storageError);
  const fileSavedAt = useStore((s) => s.fileSavedAt);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const { setProjectName, openBulkPatch, undo, redo, addRack, showProjects, markFileSaved, flash } = useStore.getState();
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(false);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [menu]);

  const base = safeFileName(project.name);

  const exportXlsx = async () => {
    setBusy(true);
    try {
      downloadBlob(await buildWorkbook(project), `${base}.xlsx`);
    } catch (err) {
      console.error(err);
      flash('Export failed — see the browser console for details.');
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = (which: 'cables' | 'ports') => {
    const sheet = which === 'cables' ? cableSheet(project) : portMapSheet(project);
    // BOM so Excel opens UTF-8 correctly.
    downloadBlob(new Blob(['﻿' + toCsv(sheet)], { type: 'text/csv;charset=utf-8' }), `${base}_${which}.csv`);
  };

  const save = () => {
    downloadBlob(new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }), `${base}.portabuddy.json`);
    markFileSaved();
  };

  // Re-render every minute so "backed up 3 min ago" stays current.
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60_000);
    return () => clearInterval(t);
  }, []);

  const status = storageError
    ? { cls: 'error', text: 'Not saved', title: 'This browser’s storage is full, so recent changes are not saved. Use Save to download a copy now.' }
    : unbacked
      ? {
          cls: 'warn',
          text: 'Not backed up',
          title: `Saved in this browser only${fileSavedAt ? ` (last file backup ${timeAgo(fileSavedAt)})` : ''}. Click Save to download a backup file — browser storage can be cleared.`,
        }
      : fileSavedAt
        ? { cls: 'ok', text: `Backed up ${timeAgo(fileSavedAt)}`, title: 'No changes since you last saved a file.' }
        : { cls: 'ok', text: 'Saved in browser', title: 'Your work is saved automatically in this browser.' };

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
      </div>

</header>
  );
}
