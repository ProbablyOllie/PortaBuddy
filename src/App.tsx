import { useEffect } from 'react';
import { Canvas } from './components/Canvas';
import { Inspector } from './components/Inspector';
import { Library } from './components/Library';
import { Toolbar } from './components/Toolbar';
import { useStore } from './store';

function isTyping(e: KeyboardEvent) {
  const el = e.target as HTMLElement | null;
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
}

export function App() {
  const message = useStore((s) => s.message);
  const flash = useStore((s) => s.flash);

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
      <div className="workspace">
        <Library />
        <Canvas />
        <Inspector />
      </div>
      {message ? (
        <div className="toast" role="status" onClick={() => flash(null)}>
          {message}
        </div>
      ) : null}
    </div>
  );
}
