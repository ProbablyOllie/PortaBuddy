import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { cableIndex, describePort } from '../lib/project';
import type { PortRef } from '../lib/types';
import { useStore, type CableMode, type ViewMode } from '../store';
import { beginWiring, clickSuppressed, portUnder, suppressNextClick, useWiring } from '../wiring';
import { RackView } from './RackView';

type Pt = { x: number; y: number };

/** A cable hanging between two ports: sags more the further apart they are. */
export function cablePath(a: Pt, b: Pt): string {
  const dx = b.x - a.x;
  const dist = Math.hypot(dx, b.y - a.y);
  const sag = Math.min(140, 18 + dist * 0.22);
  return `M${a.x},${a.y} C${a.x + dx * 0.15},${a.y + sag} ${b.x - dx * 0.15},${b.y + sag} ${b.x},${b.y}`;
}

export function Canvas() {
  const project = useStore((s) => s.project);
  const zoom = useStore((s) => s.zoom);
  const cableMode = useStore((s) => s.cableMode);
  const view = useStore((s) => s.view);
  const compact = useStore((s) => s.compact);
  const autoFit = useStore((s) => s.autoFit);
  const selection = useStore((s) => s.selection);
  const select = useStore((s) => s.select);
  const addRack = useStore((s) => s.addRack);
  const wiring = useWiring((s) => s.wiring);

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const [positions, setPositions] = useState<Map<string, Pt>>(new Map());
  const [size, setSize] = useState({ w: 0, h: 0 });

  const cables = useMemo(() => cableIndex(project.cables), [project.cables]);
  const peers = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of project.cables) {
      m.set(c.a.portId, describePort(project, c.b));
      m.set(c.b.portId, describePort(project, c.a));
    }
    return m;
  }, [project]);

  /** Origin of the scrollable content in viewport coordinates. */
  const origin = useCallback((): Pt => {
    const el = scrollRef.current!;
    const r = el.getBoundingClientRect();
    return { x: r.left + el.clientLeft - el.scrollLeft, y: r.top + el.clientTop - el.scrollTop };
  }, []);

  const measure = useCallback(() => {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return;
    const o = origin();
    const m = new Map<string, Pt>();
    scroll.querySelectorAll<HTMLElement>('[data-port-id]').forEach((el) => {
      const r = el.getBoundingClientRect();
      m.set(el.dataset.portId!, { x: r.left + r.width / 2 - o.x, y: r.top + r.height / 2 - o.y });
    });
    setPositions(m);
    const cr = content.getBoundingClientRect();
    setSize({ w: Math.ceil(cr.right - o.x), h: Math.ceil(cr.bottom - o.y) });
  }, [origin]);

  useLayoutEffect(measure, [project, zoom, view, compact, measure]);

  /** Zoom at which the tallest rack fits the visible height (never above 100%). */
  const fitZoomFor = useCallback(() => {
    const scroll = scrollRef.current;
    const content = contentRef.current;
    if (!scroll || !content) return null;
    const racks = content.querySelectorAll<HTMLElement>('.rack');
    if (!racks.length) return null;
    const top = content.getBoundingClientRect().top;
    const bottom = Math.max(...[...racks].map((r) => r.getBoundingClientRect().bottom));
    const natural = (bottom - top) / zoom + 64; // unzoomed height incl. top padding and room for the floating bars
    return Math.max(0.4, Math.min(1, Math.floor((scroll.clientHeight / natural) * 100) / 100));
  }, [zoom]);

  // Keep the cabinet fitted to the window until the user picks a zoom themselves.
  useLayoutEffect(() => {
    if (!autoFit) return;
    const z = fitZoomFor();
    if (z !== null && Math.abs(z - zoom) >= 0.01) useStore.getState().fitZoom(z);
  }, [autoFit, project, view, compact, zoom, fitZoomFor]);

  useEffect(() => {
    const ro = new ResizeObserver(() => {
      measure();
      const s = useStore.getState();
      if (!s.autoFit) return;
      const z = fitZoomFor();
      if (z !== null && Math.abs(z - s.zoom) >= 0.01) s.fitZoom(z);
    });
    if (contentRef.current) ro.observe(contentRef.current);
    if (scrollRef.current) ro.observe(scrollRef.current);
    return () => ro.disconnect();
  }, [measure, fitZoomFor]);

  // Pointer tracking while a patch lead is being dragged from a port.
  const active = wiring !== null;
  useEffect(() => {
    if (!active) return;
    let target: HTMLElement | null = null;
    const setTarget = (el: HTMLElement | null) => {
      if (el === target) return;
      target?.classList.remove('drop-target');
      target = el;
      target?.classList.add('drop-target');
    };
    const portAt = portUnder;

    const onMove = (e: PointerEvent) => {
      const w = useWiring.getState().wiring;
      if (!w) return;
      const moved = w.moved || Math.hypot(e.clientX - w.startX, e.clientY - w.startY) > 4;
      useWiring.getState().setWiring({ ...w, x: e.clientX, y: e.clientY, moved });
      const el = portAt(e.clientX, e.clientY);
      setTarget(el && el.dataset.portId !== w.from.portId ? el : null);
      // Auto-scroll near the edges so long runs between racks are easy.
      const scroll = scrollRef.current;
      if (scroll) {
        const r = scroll.getBoundingClientRect();
        const edge = 40;
        if (e.clientY < r.top + edge) scroll.scrollTop -= 20;
        else if (e.clientY > r.bottom - edge) scroll.scrollTop += 20;
        if (e.clientX < r.left + edge) scroll.scrollLeft -= 20;
        else if (e.clientX > r.right - edge) scroll.scrollLeft += 20;
      }
    };
    const onUp = (e: PointerEvent) => {
      setTarget(null);
      const w = useWiring.getState().wiring;
      useWiring.getState().setWiring(null);
      if (!w) return;
      const store = useStore.getState();
      suppressNextClick();
      if (!w.moved) {
        store.select(w.cableId ? { kind: 'cable', id: w.cableId } : { kind: 'device', id: w.from.deviceId });
        return;
      }
      const el = portAt(e.clientX, e.clientY);
      if (!el) {
        if (w.cableId) store.flash('Drop the cable end on a free port to re-patch it.');
        return;
      }
      const to: PortRef = { deviceId: el.dataset.deviceId!, portId: el.dataset.portId! };
      if (w.cableId) {
        if (store.repatch(w.cableId, w.from, to)) store.select({ kind: 'cable', id: w.cableId });
      } else {
        store.connect(w.from, to);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setTarget(null);
        useWiring.getState().setWiring(null);
      }
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey);
    return () => {
      setTarget(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  const selectedCableId = selection?.kind === 'cable' ? selection.id : null;
  const ordered = useMemo(
    () => [...project.cables].sort((a, b) => Number(a.id === selectedCableId) - Number(b.id === selectedCableId)),
    [project.cables, selectedCableId],
  );

  // Temporary lead following the pointer.
  let temp: { a: Pt; b: Pt; color: string } | null = null;
  if (wiring?.moved && scrollRef.current) {
    const o = origin();
    const moving = wiring.cableId ? project.cables.find((c) => c.id === wiring.cableId) : undefined;
    const fixed = moving ? (moving.a.portId === wiring.from.portId ? moving.b : moving.a) : wiring.from;
    // When the fixed end is on the hidden side, start the lead where the drag began.
    const a = positions.get(fixed.portId) ?? { x: wiring.startX - o.x, y: wiring.startY - o.y };
    temp = { a, b: { x: wiring.x - o.x, y: wiring.y - o.y }, color: moving?.color ?? '#f59e0b' };
  }

  return (
    <div className="canvas-wrap">
      <ViewControls />
      <div className="canvas" ref={scrollRef} onClick={() => !clickSuppressed() && select(null)}>
        <div className="canvas-content" ref={contentRef} style={{ zoom }}>
          {project.racks.map((rack) => (
            <RackView key={rack.id} rack={rack} cables={cables} peers={peers} />
          ))}
          <button
            className="add-rack"
            onClick={(e) => {
              e.stopPropagation();
              addRack();
            }}
          >
            + Add rack
          </button>
        </div>
        <svg className={`cable-layer mode-${cableMode}${wiring ? ' wiring' : ''}`} width={size.w} height={size.h}>
          {ordered.map((c) => {
            if (wiring?.moved && wiring.cableId === c.id) return null;
            const pa = positions.get(c.a.portId);
            const pb = positions.get(c.b.portId);
            if (!pa && !pb) return null;
            const sel = c.id === selectedCableId;
            if (cableMode === 'hide' && !sel) return null;
            // One end is on the side of the rack that isn't shown: draw a short lead disappearing behind.
            const stub = !pa || !pb;
            const a = (pa ?? pb)!;
            const b = stub ? { x: a.x + 10, y: a.y + 22 } : pb!;
            const d = stub ? `M${a.x},${a.y} Q${a.x},${b.y} ${b.x},${b.y}` : cablePath(a, b);
            return (
              <g
                key={c.id}
                className={`cable${sel ? ' sel' : ''}${stub ? ' stub' : ''}`}
                onPointerDown={(e) => {
                  // Cable ends sit on top of their ports: pressing there picks up the cable end.
                  const el = e.button === 0 ? portUnder(e.clientX, e.clientY) : null;
                  if (!el) return;
                  e.preventDefault();
                  e.stopPropagation();
                  beginWiring(e.clientX, e.clientY, { deviceId: el.dataset.deviceId!, portId: el.dataset.portId! });
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (!clickSuppressed()) select({ kind: 'cable', id: c.id });
                }}
              >
                <title>{`${c.label} · ${c.type}\n${describePort(project, c.a)}\n→ ${describePort(project, c.b)}${stub ? '\n(other end is on the other side of the rack)' : ''}`}</title>
                <path className="cable-hit" d={d} />
                <path className="cable-outline" d={d} />
                <path className="cable-line" d={d} stroke={c.color} />
                <circle className="cable-end" cx={a.x} cy={a.y} r={3} fill={c.color} />
                {stub ? (
                  <circle className="cable-stub-end" cx={b.x} cy={b.y} r={3.5} stroke={c.color} />
                ) : (
                  <circle className="cable-end" cx={b.x} cy={b.y} r={3} fill={c.color} />
                )}
              </g>
            );
          })}
          {temp ? (
            <g className="cable temp">
              <path className="cable-outline" d={cablePath(temp.a, temp.b)} />
              <path className="cable-line" d={cablePath(temp.a, temp.b)} stroke={temp.color} />
            </g>
          ) : null}
        </svg>
      </div>
    </div>
  );
}

/** Floating view settings along the bottom of the canvas. */
function ViewControls() {
  const zoom = useStore((s) => s.zoom);
  const autoFit = useStore((s) => s.autoFit);
  const compact = useStore((s) => s.compact);
  const view = useStore((s) => s.view);
  const cableMode = useStore((s) => s.cableMode);
  const { setZoom, setAutoFit, setCompact, setView, setCableMode } = useStore.getState();
  return (
    <>
      <div className="view-controls left" onClick={(e) => e.stopPropagation()}>
        <span className="vc-label">Side</span>
        {(['front', 'rear', 'both'] as ViewMode[]).map((v) => (
          <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
        <span className="vc-sep" />
        <span className="vc-label">Cables</span>
        {(['show', 'dim', 'hide'] as CableMode[]).map((m) => (
          <button key={m} className={cableMode === m ? 'on' : ''} onClick={() => setCableMode(m)}>
            {m[0].toUpperCase() + m.slice(1)}
          </button>
        ))}
      </div>
      <div className="view-controls" onClick={(e) => e.stopPropagation()}>
        <button onClick={() => setZoom(zoom - 0.1)} title="Zoom out">
          −
        </button>
        <span className="zoom-val" title="Current zoom">
          {Math.round(zoom * 100)}%
        </span>
        <button onClick={() => setZoom(zoom + 0.1)} title="Zoom in">
          +
        </button>
        <button className={autoFit ? 'on' : ''} onClick={() => setAutoFit(true)} title="Fit the racks to the window">
          Fit
        </button>
        <button
          className={compact ? 'on' : ''}
          onClick={() => setCompact(!compact)}
          title={compact ? 'Showing empty rack units small — click to show every U full size' : 'Show empty rack units small to fit more on screen'}
        >
          Compact
        </button>
      </div>
    </>
  );
}
