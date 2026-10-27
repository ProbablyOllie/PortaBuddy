import { useRef, useState } from 'react';
import { library } from '../lib/library';
import { parseProject } from '../lib/project';
import { timeAgo } from '../lib/time';
import { flushSave, useStore } from '../store';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function ProjectsDialog() {
  const projectId = useStore((s) => s.projectId);
  // Re-read the library whenever the open project changes or is edited.
  useStore((s) => s.lastEditAt);
  useStore((s) => s.fileSavedAt);
  const warnOnClose = useStore((s) => s.warnOnClose);
  const { showProjects, newProject, importProject, openProject, duplicateProject, deleteProject, restoreVersion, setWarnOnClose, flash } =
    useStore.getState();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [, setRev] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  // Make sure the list shows the latest state of the open project.
  useState(() => {
    flushSave();
    return null;
  });
  const projects = library.list();
  const close = () => showProjects(false);
  const after = () => setRev((n) => n + 1);

  const openFile = async (file: File) => {
    try {
      importProject(parseProject(JSON.parse(await file.text())));
      flash(`Opened ${file.name} as a new project.`);
      close();
    } catch (err) {
      flash(`Could not open ${file.name}: ${(err as Error).message}`);
    }
  };

  const usageMb = (library.usage() * 2) / 1_000_000; // UTF-16: ~2 bytes per character

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal projects" onMouseDown={(e) => e.stopPropagation()}>
        <div className="projects-head">
          <h3>Projects</h3>
          <div className="row-buttons">
            <button
              className="btn"
              onClick={() => {
                newProject();
                close();
              }}
            >
              + New project
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              Open file…
            </button>
            <button
              className="btn"
              title="Build a project from a cable schedule or device list in Excel or CSV"
              onClick={() => {
                close();
                useStore.getState().showImport(true);
              }}
            >
              Import spreadsheet…
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) openFile(f);
                e.target.value = '';
              }}
            />
          </div>
        </div>
        <p className="hint">
          Projects are kept in this browser, with earlier versions saved automatically as you work. Opening a file adds it as a new project —
          nothing is overwritten. Use <b>Save</b> to download a backup file: browser storage can be cleared, and files can be shared.
        </p>

        <ul className="project-list">
          {projects.map((m) => {
            const current = m.id === projectId;
            const unbacked = m.fileSavedAt === null ? m.devices + m.cables > 0 || m.updatedAt > m.createdAt : m.updatedAt > m.fileSavedAt;
            const versions = expanded === m.id ? [...library.versions(m.id)].reverse() : [];
            return (
              <li key={m.id} className={current ? 'current' : ''}>
                <div className="project-row">
                  <div className="project-info">
                    <div className="project-title">
                      {m.name || 'Untitled'}
                      {current ? <span className="badge">Open</span> : null}
                    </div>
                    <div className="project-meta">
                      {plural(m.racks, 'rack')} · {plural(m.devices, 'device')} · {plural(m.cables, 'cable')} · edited {timeAgo(m.updatedAt)}
                    </div>
                    <div className={`project-backup ${unbacked ? 'warn' : 'ok'}`}>
                      {m.fileSavedAt ? `File backup ${timeAgo(m.fileSavedAt)}` : 'Never saved to a file'}
                      {unbacked && m.fileSavedAt ? ' · changed since' : ''}
                    </div>
                  </div>
                  <div className="row-buttons">
                    {current ? null : (
                      <button
                        className="btn primary"
                        onClick={() => {
                          openProject(m.id);
                          close();
                        }}
                      >
                        Open
                      </button>
                    )}
                    <button className="btn" onClick={() => setExpanded(expanded === m.id ? null : m.id)} aria-expanded={expanded === m.id}>
                      Versions
                    </button>
                    <button
                      className="btn"
                      onClick={() => {
                        duplicateProject(m.id);
                        after();
                      }}
                    >
                      Duplicate
                    </button>
                    <button
                      className="btn danger"
                      onClick={() => {
                        const warn = unbacked ? ' It has changes that are not saved to a file.' : '';
                        if (confirm(`Delete “${m.name}” and its versions from this browser?${warn} This can't be undone.`)) {
                          deleteProject(m.id);
                          after();
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                {expanded === m.id ? (
                  <div className="versions">
                    {versions.length ? (
                      <table>
                        <tbody>
                          {versions.map((v) => (
                            <tr key={v.at}>
                              <td title={new Date(v.at).toLocaleString()}>{timeAgo(v.at)}</td>
                              <td className="muted">
                                {plural(v.project.devices.length, 'device')} · {plural(v.project.cables.length, 'cable')}
                              </td>
                              <td>
                                <button
                                  className="btn"
                                  onClick={() => {
                                    openProject(m.id);
                                    restoreVersion(v.at);
                                    close();
                                  }}
                                >
                                  Restore
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="hint">No earlier versions yet — one is kept every few minutes while you work.</p>
                    )}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="projects-foot">
          <label className="check">
            <input type="checkbox" checked={warnOnClose} onChange={(e) => setWarnOnClose(e.target.checked)} />
            Warn me before closing the tab if there are changes not saved to a file
          </label>
          <span className="muted">Using {usageMb < 0.1 ? '< 0.1' : usageMb.toFixed(1)} MB of browser storage</span>
        </div>
        <div className="modal-actions">
          <button className="btn" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
