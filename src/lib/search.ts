import { cableIndex, describePort, groupRackFace } from './project';
import { PORT_TYPE_LABELS } from './templates';
import type { Face, Project } from './types';

export type SearchHit =
  | { kind: 'rack'; id: string; title: string; detail: string }
  | { kind: 'device'; id: string; title: string; detail: string; face: Face }
  | { kind: 'cable'; id: string; title: string; detail: string; deviceId: string; portId: string; face: Face }
  | { kind: 'port'; id: string; title: string; detail: string; deviceId: string; cableId: string | null; face: Face };

/** True when every word of the query appears somewhere in the text. */
function matches(terms: string[], text: string): boolean {
  const t = text.toLowerCase();
  return terms.every((term) => t.includes(term));
}

/**
 * Find racks, devices, cables and ports. Every word must match, so "pp-a01 12" finds port 12 on
 * PP-A01. Exact port-name matches come first, then racks, devices, cables and other ports.
 */
export function search(project: Project, query: string, limit = 30): SearchHit[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const rackName = new Map(project.racks.map((r) => [r.id, r.name]));
  const byPort = cableIndex(project.cables);
  const hits: SearchHit[] = [];

  for (const r of project.racks) {
    if (matches(terms, `${r.name} ${r.location}`)) {
      hits.push({ kind: 'rack', id: r.id, title: r.name, detail: r.location || `${r.heightU}U rack` });
    }
  }

  for (const d of project.devices) {
    if (matches(terms, `${d.name} ${d.model} ${d.notes} ${rackName.get(d.rackId) ?? ''}`)) {
      hits.push({ kind: 'device', id: d.id, title: d.name, detail: `${rackName.get(d.rackId) ?? ''} · U${d.positionU} · ${d.model}`, face: d.facing });
    }
  }

  for (const c of project.cables) {
    if (matches(terms, `${c.label} ${c.type} ${c.notes}`)) {
      const a = project.devices.find((d) => d.id === c.a.deviceId);
      const group = a?.portGroups.find((g) => g.ports.some((p) => p.id === c.a.portId));
      hits.push({
        kind: 'cable',
        id: c.id,
        title: `${c.label} · ${c.type}`,
        detail: `${describePort(project, c.a)} → ${describePort(project, c.b)}`,
        deviceId: c.a.deviceId,
        portId: c.a.portId,
        face: a && group ? groupRackFace(a, group) : 'front',
      });
    }
  }

  const ports: (SearchHit & { exact: boolean })[] = [];
  for (const d of project.devices) {
    for (const g of d.portGroups) {
      for (const p of g.ports) {
        const name = p.name || g.label;
        if (!matches(terms, `${d.name} ${name} ${g.label} ${PORT_TYPE_LABELS[g.type]}`)) continue;
        const cable = byPort.get(p.id);
        const other = cable ? (cable.a.portId === p.id ? cable.b : cable.a) : null;
        ports.push({
          kind: 'port',
          id: p.id,
          title: `${d.name} · ${name}`,
          detail: other ? `${cable!.label} → ${describePort(project, other)}` : `${PORT_TYPE_LABELS[g.type]} · free`,
          deviceId: d.id,
          cableId: cable?.id ?? null,
          face: groupRackFace(d, g),
          exact: terms.some((t) => name.toLowerCase() === t),
        });
      }
    }
  }
  ports.sort((x, y) => Number(y.exact) - Number(x.exact));
  const strip = ({ exact: _exact, ...hit }: SearchHit & { exact: boolean }) => hit as SearchHit;
  // A query naming an exact port ("pp-a01 12") is after that port, so it goes above everything else.
  const exact = ports.filter((p) => p.exact).map(strip);
  const rest = ports.filter((p) => !p.exact).map(strip);

  return [...exact, ...hits, ...rest].slice(0, limit);
}
