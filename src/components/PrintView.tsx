import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CATEGORY_COLORS, PRINT, fitText, printCables, printElevation } from '../lib/printLayout';
import type { Face, Project, Rack } from '../lib/types';
import { useStore } from '../store';

type Sides = Face | 'both';

/** Tallest a drawing may print, so a page fits A4 and US Letter portrait with its header. */
const MAX_DRAWING_MM = 228;
/** Largest U, so short racks don't print absurdly big. */
const MAX_MM_PER_U = 6;

function Elevation({ project, rack, face, compact }: { project: Project; rack: Rack; face: Face; compact: boolean }) {
  const el = useMemo(() => printElevation(project, rack.id, face, compact), [project, rack.id, face, compact]);
  const heightMm = Math.min(MAX_DRAWING_MM, (el.height / PRINT.U) * MAX_MM_PER_U);
  const R = PRINT.RAIL;
  return (
    <svg
      className="print-elevation"
      viewBox={`-1 -1 ${el.width + 2} ${el.height + 2}`}
      style={{ height: `${heightMm}mm` }}
      role="img"
      aria-label={`${rack.name} ${face} elevation`}
    >
      <rect x={0} y={0} width={el.width} height={el.height} fill="#fff" stroke="#111827" strokeWidth={0.8} />
      {el.units.map(({ u, y, h }) => (
        <g key={u}>
          <line x1={R} x2={el.width - R} y1={y + h} y2={y + h} stroke="#d1d5db" strokeWidth={0.25} />
          <rect x={0} y={y} width={R} height={h} fill="#f3f4f6" stroke="#9ca3af" strokeWidth={0.2} />
          <rect x={el.width - R} y={y} width={R} height={h} fill="#f3f4f6" stroke="#9ca3af" strokeWidth={0.2} />
          <text x={R / 2} y={y + h / 2} fontSize={Math.min(3.6, h * 0.62)} textAnchor="middle" dominantBaseline="central" fill="#4b5563">
            {u}
          </text>
          <text x={el.width - R / 2} y={y + h / 2} fontSize={Math.min(3.6, h * 0.62)} textAnchor="middle" dominantBaseline="central" fill="#4b5563">
            {u}
          </text>
        </g>
      ))}
      {el.devices.map((d) => {
        const twoLines = d.h >= PRINT.U * 1.6;
        const nameSize = Math.min(4.4, d.h * 0.42);
        const textW = PRINT.LABEL - 6;
        return (
          <g key={d.id}>
            <rect
              x={R}
              y={d.y}
              width={PRINT.FACE}
              height={d.h}
              fill={d.back ? '#e5e7eb' : '#f9fafb'}
              stroke="#374151"
              strokeWidth={0.5}
              strokeDasharray={d.back ? '2 1' : undefined}
            />
            <rect x={R} y={d.y} width={2.4} height={d.h} fill={CATEGORY_COLORS[d.category]} />
            <line x1={R + PRINT.LABEL} x2={R + PRINT.LABEL} y1={d.y} y2={d.y + d.h} stroke="#9ca3af" strokeWidth={0.3} />
            <text x={R + 5} y={d.y + (twoLines ? d.h / 2 - nameSize * 0.55 : d.h / 2)} fontSize={nameSize} fontWeight={700} dominantBaseline="central" fill="#111827">
              {fitText(d.name, textW - (d.back && !twoLines ? 14 : 0), nameSize)}
              {/* 1U devices have room for one line only, so "rear" goes after the name. */}
              {d.back && !twoLines ? (
                <tspan fontWeight={400} fill="#4b5563" fontSize={nameSize * 0.8}>
                  {' '}
                  (rear)
                </tspan>
              ) : null}
            </text>
            {twoLines ? (
              <text x={R + 5} y={d.y + d.h / 2 + nameSize * 0.65} fontSize={3.2} dominantBaseline="central" fill="#4b5563">
                {fitText(`${d.back ? 'Rear · ' : ''}${d.model}`, textW, 3.2)}
              </text>
            ) : null}
            {d.ports.map((p) => (
              <rect
                key={p.id}
                x={p.x}
                y={p.y}
                width={p.w}
                height={p.h}
                rx={p.type === 'power' || p.type === 'power-in' ? 0.8 : 0.3}
                fill={p.color ?? '#ffffff'}
                stroke={p.color ? '#111827' : '#6b7280'}
                strokeWidth={0.25}
              />
            ))}
          </g>
        );
      })}
    </svg>
  );
}

function PageHeader({ project, rack, title }: { project: Project; rack: Rack; title: string }) {
  const used = new Set(project.devices.filter((d) => d.rackId === rack.id).flatMap((d) => Array.from({ length: d.heightU }, (_, i) => d.positionU + i))).size;
  return (
    <header className="print-head">
      <div>
        <div className="print-title">
          {rack.name} — {title}
        </div>
        <div className="print-meta">
          {project.name}
          {rack.location ? ` · ${rack.location}` : ''} · {rack.heightU}U rack, {used}U used
        </div>
      </div>
      <div className="print-meta right">
        Printed {new Date().toLocaleDateString()}
        <br />
        PortaBuddy
      </div>
    </header>
  );
}

/** Full-screen print preview with options; printing shows only the pages. */
export function PrintView() {
  const project = useStore((s) => s.project);
  const showPrint = useStore((s) => s.showPrint);
  const [rackIds, setRackIds] = useState<string[]>(() => project.racks.map((r) => r.id));
  const [sides, setSides] = useState<Sides>('both');
  const [cables, setCables] = useState(true);
  const [compact, setCompact] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);

  // While open, printing (Ctrl+P too) shows only the pages, not the app behind them.
  useEffect(() => {
    document.body.classList.add('print-view-open');
    const fit = () => setPreviewZoom(Math.min(1, (window.innerWidth - 24) / 760));
    fit();
    window.addEventListener('resize', fit);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && showPrint(false);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('print-view-open');
      window.removeEventListener('resize', fit);
      window.removeEventListener('keydown', onKey);
    };
  }, [showPrint]);

  const racks = project.racks.filter((r) => rackIds.includes(r.id));
  const faces: Face[] = sides === 'both' ? ['front', 'rear'] : [sides];
  const pageCount = racks.length * faces.length;

  return createPortal(
    <div className="print-root">
      <div className="print-toolbar">
        <div className="print-options">
          <strong>Print / PDF</strong>
          <span className="print-opt">
            {project.racks.map((r) => (
              <label key={r.id}>
                <input
                  type="checkbox"
                  checked={rackIds.includes(r.id)}
                  onChange={(e) => setRackIds(e.target.checked ? [...rackIds, r.id] : rackIds.filter((x) => x !== r.id))}
                />
                {r.name}
              </label>
            ))}
          </span>
          <span className="seg">
            {(['front', 'rear', 'both'] as Sides[]).map((s) => (
              <button key={s} className={sides === s ? 'on' : ''} onClick={() => setSides(s)}>
                {s === 'both' ? 'Front & rear' : s[0].toUpperCase() + s.slice(1)}
              </button>
            ))}
          </span>
          <label className="print-opt">
            <input type="checkbox" checked={cables} onChange={(e) => setCables(e.target.checked)} />
            Cable schedule
          </label>
          <label className="print-opt" title="Draw empty rack units short">
            <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
            Compact empty space
          </label>
        </div>
        <div className="print-actions">
          <span className="muted">To get a PDF, choose “Save as PDF” as the printer.</span>
          <button className="btn" onClick={() => showPrint(false)}>
            Close
          </button>
          <button className="btn primary" disabled={!pageCount} onClick={() => window.print()}>
            Print…
          </button>
        </div>
      </div>

      <div className="print-pages" style={{ ['--preview-zoom' as string]: previewZoom }}>
        {!pageCount ? <p className="print-empty">Choose at least one rack to print.</p> : null}
        {racks.map((rack) => (
          <div key={rack.id}>
            {faces.map((face) => (
              <section key={face} className="print-page">
                <PageHeader project={project} rack={rack} title={face === 'front' ? 'Front' : 'Rear'} />
                <Elevation project={project} rack={rack} face={face} compact={compact} />
                <footer className="print-legend">
                  <span>
                    <i className="lg-port" /> free port
                  </span>
                  <span>
                    <i className="lg-port used" /> patched (cable colour)
                  </span>
                  <span>
                    <i className="lg-back" /> back of a full-depth device
                  </span>
                </footer>
              </section>
            ))}
            {cables ? <CableSchedule project={project} rack={rack} /> : null}
          </div>
        ))}
      </div>
    </div>,
    document.body,
  );
}

function CableSchedule({ project, rack }: { project: Project; rack: Rack }) {
  const rows = useMemo(() => printCables(project, rack.id), [project, rack.id]);
  return (
    <section className="print-page print-flow">
      <PageHeader project={project} rack={rack} title="Cable schedule" />
      {rows.length ? (
        <table className="print-table">
          <thead>
            <tr>
              <th>Cable</th>
              <th>Colour</th>
              <th>Type</th>
              <th>m</th>
              <th>This rack</th>
              <th>Goes to</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label + r.here}>
                <td className="nowrap">
                  <b>{r.label}</b>
                </td>
                <td className="nowrap">
                  <i className="swatch-print" style={{ background: r.color }} />
                  {r.colorName}
                </td>
                <td>{r.type}</td>
                <td>{r.length}</td>
                <td>{r.here}</td>
                <td>{r.there}</td>
                <td>{r.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="print-meta">No cables in this rack.</p>
      )}
    </section>
  );
}
