import { useEffect, useMemo, useRef, useState } from 'react';
import { search, type SearchHit } from '../lib/search';
import type { Face } from '../lib/types';
import { useStore } from '../store';

/** Scroll an element in the rack drawing into view and make it pulse briefly. */
function reveal(selector: string) {
  // Wait for the view switch / selection to render first.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>(selector);
      if (!el) return;
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      el.classList.remove('pulse');
      void el.offsetWidth; // restart the animation
      el.classList.add('pulse');
      setTimeout(() => el.classList.remove('pulse'), 2400);
    }),
  );
}

const KIND_LABEL: Record<SearchHit['kind'], string> = { rack: 'Rack', device: 'Device', cable: 'Cable', port: 'Port' };

export function SearchBox() {
  const project = useStore((s) => s.project);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const hits = useMemo(() => search(project, query), [project, query]);

  // "/" or Ctrl/Cmd+K jumps to search from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
      if ((e.key === '/' && !typing) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const pick = (hit: SearchHit) => {
    const s = useStore.getState();
    // Make sure the side of the rack holding the result is on screen.
    const showFace = (face: Face) => {
      if (s.view !== 'both' && s.view !== face) s.setView(face);
    };
    if (!s.inspectorOpen) s.togglePanel('inspector');
    if (hit.kind === 'rack') {
      s.select({ kind: 'rack', id: hit.id });
      reveal(`[data-rack-id="${hit.id}"]`);
    } else if (hit.kind === 'device') {
      showFace(hit.face);
      s.select({ kind: 'device', id: hit.id });
      reveal(`[data-device-el="${hit.id}"]`);
    } else if (hit.kind === 'cable') {
      showFace(hit.face);
      s.select({ kind: 'cable', id: hit.id });
      reveal(`[data-port-id="${hit.portId}"]`);
    } else {
      showFace(hit.face);
      s.select(hit.cableId ? { kind: 'cable', id: hit.cableId } : { kind: 'device', id: hit.deviceId });
      reveal(`[data-port-id="${hit.id}"]`);
    }
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="search-box">
      <input
        ref={inputRef}
        type="search"
        placeholder="Find device, port or cable…  ( / )"
        aria-label="Search"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(hits.length - 1, a + 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(0, a - 1));
          } else if (e.key === 'Enter' && hits[active]) {
            pick(hits[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
            inputRef.current?.blur();
          }
        }}
      />
      {open && query.trim() ? (
        <div className="search-results" role="listbox">
          {hits.length ? (
            hits.map((hit, i) => (
              <button
                key={`${hit.kind}:${hit.id}`}
                role="option"
                aria-selected={i === active}
                className={i === active ? 'on' : ''}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(hit)}
              >
                <span className={`hit-kind k-${hit.kind}`}>{KIND_LABEL[hit.kind]}</span>
                <span className="hit-text">
                  <span className="hit-title">{hit.title}</span>
                  <span className="hit-detail">{hit.detail}</span>
                </span>
              </button>
            ))
          ) : (
            <div className="search-empty">Nothing matches “{query.trim()}”</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
