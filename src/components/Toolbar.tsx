import { useEffect, useRef, useState } from 'react';
import { buildWorkbook, cableSheet, downloadBlob, portMapSheet, safeFileName, toCsv } from '../lib/export';
import { parseProject } from '../lib/project';
import { useStore } from '../store';
import { SearchBox } from './SearchBox';

export function Toolbar() {
  const project = useStore((s) => s.project);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const { setProjectName, openBulkPatch, undo, redo, addRack, newProject, loadProject, flash } = useStore.getState();
  const fileRef = useRef<HTMLInputElement>(null);
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
  };

  const open = async (file: File) => {
    try {
      loadProject(parseProject(JSON.parse(await file.text())));
      flash(`Opened ${file.name}`);
    } catch (err) {
      flash(`Could not open ${file.name}: ${(err as Error).message}`);
    }
  };

  return (
    <header className="toolbar">
      <div className="brand">
        <img src="./favicon.svg" alt="" width={22} height={22} />
        PortaBuddy
      </div>
      <input className="project-name" value={project.name} onChange={(e) => setProjectName(e.target.value)} title="Project name" />
      <SearchBox />

      <div className="tb-group">
        <button
          className="btn"
          onClick={() => {
            if (confirm('Start a new project? Unsaved work in this browser will be replaced.')) newProject();
          }}
        >
          New
        </button>
        <button className="btn" onClick={() => fileRef.current?.click()}>
          Open…
        </button>
        <button className="btn" onClick={save} title="Download the project as a file you can open later">
          Save
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) open(f);
            e.target.value = '';
          }}
        />
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
