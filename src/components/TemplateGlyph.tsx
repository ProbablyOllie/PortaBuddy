import type { DeviceTemplate } from '../lib/types';

const W = 44;
const HEIGHTS = [12, 20, 26, 30];
const PAD = 3;
const STRIPE = 3;

/**
 * A tiny drawing of a device's faceplate for the library: its ports as dots in their real rows
 * and groups, so a 48-port switch and a 12-port panel look different at a glance. Devices with
 * ports only on the back (servers) show those, faintly.
 */
export function TemplateGlyph({ template }: { template: DeviceTemplate }) {
  const h = HEIGHTS[Math.min(Math.max(template.heightU, 1), 4) - 1];
  const withPorts = template.portGroups.filter((g) => g.count > 0);
  const front = withPorts.filter((g) => (g.face ?? 'front') === 'front');
  const groups = front.length ? front : withPorts;

  const rowsOf = (g: { rows: number }) => Math.max(1, Math.floor(g.rows) || 1);
  const cols = groups.map((g) => Math.ceil(g.count / rowsOf(g)));
  const rows = Math.max(...groups.map(rowsOf), 1);
  const gap = 1.5; // space between groups, in port widths
  const units = cols.reduce((n, c) => n + c, 0) + gap * Math.max(0, groups.length - 1);
  const pitchX = Math.min(3.2, (W - STRIPE - PAD * 2) / Math.max(1, units));
  const pitchY = Math.min(4, (h - PAD * 2) / rows);
  const w = Math.max(0.7, pitchX * 0.68);
  const ph = Math.max(1.2, pitchY * 0.68);

  let d = '';
  let x = STRIPE + PAD;
  groups.forEach((g, gi) => {
    const n = rowsOf(g);
    const top = (h - n * pitchY) / 2 + (pitchY - ph) / 2;
    for (let i = 0; i < g.count; i++) {
      const col = Math.floor(i / n);
      const row = i % n;
      d += `M${(x + col * pitchX).toFixed(2)} ${(top + row * pitchY).toFixed(2)}h${w.toFixed(2)}v${ph.toFixed(2)}h${(-w).toFixed(2)}z`;
    }
    x += (cols[gi] + gap) * pitchX;
  });

  return (
    <svg className="template-glyph" width={W} height={h} viewBox={`0 0 ${W} ${h}`} aria-hidden>
      <rect width={W} height={h} rx={2} fill="var(--device)" />
      <rect width={STRIPE} height={h} fill="var(--cat, #94a3b8)" />
      {d ? <path d={d} fill="#dfe5ee" opacity={front.length ? 0.9 : 0.4} /> : null}
    </svg>
  );
}
