import { useEffect } from 'react';
import { BulkPatch } from './components/BulkPatch';
import { Canvas } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { Library } from './components/Library';
import { Toolbar } from './components/Toolbar';
import { useStore } from './store';

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

/** Slim bar shown in place of a collapsed side panel. */
function PanelStrip({ side, label, onOpen }: { side: 'left' | 'right'; label: string; onOpen: () => void }) {
  return (
    <button className={`panel-strip ${side}`} onClick={onOpen} title={`Show ${label.toLowerCase()} (${side === 'left' ? '[' : ']'})`}>
      <span className="strip-arrow">{side === 'left' ? '»' : '«'}</span>
      <span className="strip-label">{label}</span>
    </button>
  );
}

export function App() {
  const message = useStore((s) => s.message);
  const flash = useStore((s) => s.flash);
  const libraryOpen = useStore((s) => s.libraryOpen);
  const inspectorOpen = useStore((s) => s.inspectorOpen);
  const togglePanel = useStore((s) => s.togglePanel);
  const bulkPatch = useStore((s) => s.bulkPatch);
  const openBulkPatch = useStore((s) => s.openBulkPatch);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => flash(null), 3500);
    return () => clearTimeout(t);
  }, [message, flash]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e)) return;
      const s = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        s.redo();
      } else if (!mod && e.key === '[') {
        s.togglePanel('library');
      } else if (!mod && e.key === ']') {
        s.togglePanel('inspector');
      } else if (e.key === 'Escape') {
        s.select(null);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && s.selection) {
        e.preventDefault();
        const sel = s.selection;
        if (sel.kind === 'cable') s.removeCable(sel.id);
        else if (sel.kind === 'device') s.removeDevice(sel.id);
        else if (sel.kind === 'rack') {
          const n = s.project.devices.filter((d) => d.rackId === sel.id).length;
          if (!n || confirm(`Delete this rack and the ${n} devices in it?`)) s.removeRack(sel.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app">
      <Toolbar />
      <div
        className="workspace"
        style={{ gridTemplateColumns: `${libraryOpen ? 'var(--library-w)' : 'var(--strip-w)'} 1fr ${inspectorOpen ? 'var(--inspector-w)' : 'var(--strip-w)'}` }}
      >
        {libraryOpen ? <Library /> : <PanelStrip side="left" label="Device library" onOpen={() => togglePanel('library')} />}
        <Canvas />
        {inspectorOpen ? <Inspector /> : <PanelStrip side="right" label="Properties / Cables" onOpen={() => togglePanel('inspector')} />}
      </div>
      {bulkPatch ? <BulkPatch initialFrom={bulkPatch.from} onClose={() => openBulkPatch(null)} /> : null}
      {message ? (
        <div className="toast" role="status" onClick={() => flash(null)}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
