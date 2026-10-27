import { useEffect } from 'react';
import { BulkPatch } from '../components/BulkPatch';
import { ProjectsDialog } from '../components/ProjectsDialog';
import { backupStatus, saveBackupFile } from '../lib/fileActions';
import { hasUnbackedChanges, useStore } from '../store';
import { DeviceScreen } from './DeviceScreen';
import { isSheet, onPopState, useNav, type Layer, type Tab } from './nav';
import { RackScreen } from './RackScreen';
import { AddDeviceSheet, CableSheet, PickSheet, PortSheet, RackSheet, SearchSheet } from './sheets';
import { CablesScreen, MoreScreen } from './TabScreens';
import './mobile.css';

function renderSheet(l: Layer) {
  switch (l.kind) {
    case 'port':
      return <PortSheet deviceId={l.deviceId} portId={l.portId} />;
    case 'cable':
      return <CableSheet id={l.id} />;
    case 'pick':
      return <PickSheet purpose={l.purpose} />;
    case 'add':
      return <AddDeviceSheet rackId={l.rackId} face={l.face} top={l.top} bottom={l.bottom} />;
    case 'rack':
      return <RackSheet id={l.id} />;
    case 'search':
      return <SearchSheet />;
    default:
      return null;
  }
}

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'rack', label: 'Rack', icon: '▤' },
  { id: 'cables', label: 'Cables', icon: '⇄' },
  { id: 'more', label: 'More', icon: '⋯' },
];

/** Touch layout for phones: lists and big targets instead of the drag-and-drop rack drawing. */
export function MobileApp() {
  const project = useStore((s) => s.project);
  const projectId = useStore((s) => s.projectId);
  const message = useStore((s) => s.message);
  const projectsOpen = useStore((s) => s.projectsOpen);
  const bulkPatch = useStore((s) => s.bulkPatch);
  const canUndo = useStore((s) => s.past.length > 0);
  const status = backupStatus({
    storageError: useStore((s) => s.storageError),
    unbacked: useStore(hasUnbackedChanges),
    fileSavedAt: useStore((s) => s.fileSavedAt),
  });
  const { flash, undo, showProjects, openBulkPatch } = useStore.getState();
  const { tab, layers, setTab, push } = useNav();

  useEffect(() => {
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // A different project: start again from its first rack.
  useEffect(() => {
    useNav.getState().reset();
    useNav.setState({ rackId: null });
  }, [projectId]);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => flash(null), 3500);
    return () => clearTimeout(t);
  }, [message, flash]);

  const screen = [...layers].reverse().find((l) => !isSheet(l));
  const top = layers[layers.length - 1];
  const sheet = top && isSheet(top) ? top : null;

  return (
    <div className="m-app">
      <header className="m-topbar">
        <button className="m-title" onClick={() => showProjects(true)} aria-label="Projects">
          <span className="m-title-name">{project.name || 'Untitled'}</span>
          <span className={`m-status ${status.cls}`}>
            <span className="status-dot" />
            {status.text}
          </span>
        </button>
        <button className="m-icon-btn" aria-label="Undo" disabled={!canUndo} onClick={undo}>
          ↶
        </button>
        <button className="m-icon-btn" aria-label="Search" onClick={() => push({ kind: 'search' })}>
          ⌕
        </button>
        <button className={`m-icon-btn save${status.cls !== 'ok' ? ' attn' : ''}`} aria-label="Save backup file" onClick={saveBackupFile}>
          ⤓
        </button>
      </header>

      <main className="m-main">
        {screen?.kind === 'device' ? (
          <DeviceScreen key={screen.id} id={screen.id} highlight={screen.port} />
        ) : tab === 'rack' ? (
          <RackScreen />
        ) : tab === 'cables' ? (
          <CablesScreen />
        ) : (
          <MoreScreen />
        )}
      </main>

      <nav className="m-tabbar">
        {TABS.map((t) => (
          <button key={t.id} className={tab === t.id && !screen ? 'on' : ''} onClick={() => setTab(t.id)}>
            <span className="m-tab-icon" aria-hidden>
              {t.icon}
            </span>
            {t.label}
          </button>
        ))}
      </nav>

      {sheet ? renderSheet(sheet) : null}
      {projectsOpen ? <ProjectsDialog /> : null}
      {bulkPatch ? <BulkPatch initialFrom={bulkPatch.from} onClose={() => openBulkPatch(null)} /> : null}
      {message ? (
        <div className="m-toast" role="status" onClick={() => flash(null)}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
