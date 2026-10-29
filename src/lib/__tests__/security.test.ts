import { describe, expect, it } from 'vitest';
import { useStore } from '../../store';
import { cableSheet, csvCell, toCsv } from '../export';
import { SHEET_LIMITS, limitGrid } from '../importSheet';
import { parseProject } from '../project';
import { LIMITS, cssEscape, safeColor, sanitizeProject, trailingDigits, trailingNumber } from '../validate';

const device = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  rackId: 'r1',
  name: 'sw',
  model: 'Switch',
  category: 'switch',
  heightU: 1,
  positionU: 40,
  facing: 'front',
  fullDepth: true,
  notes: '',
  portGroups: [{ label: 'RJ45', type: 'rj45', rows: 1, numbering: 'row', face: 'front', ports: [{ id: `${id}:0`, name: 'Gi1' }, { id: `${id}:1`, name: 'Gi2' }] }],
  ...extra,
});
const project = (patch: Record<string, unknown> = {}) => ({
  version: 2,
  name: 'p',
  customTemplates: [],
  racks: [{ id: 'r1', name: 'Rack A', location: '', heightU: 42 }],
  devices: [device('d1')],
  cables: [],
  ...patch,
});
const cable = (extra: Record<string, unknown> = {}) => ({
  id: 'c1',
  label: 'C001',
  a: { deviceId: 'd1', portId: 'd1:0' },
  b: { deviceId: 'd1', portId: 'd1:1' },
  type: 'Cat6',
  color: '#2563eb',
  lengthM: '',
  notes: '',
  ...extra,
});

describe('opening untrusted project files', () => {
  it('blocks CSS injection through a cable colour', () => {
    for (const bad of ['url(https://attacker.example/x.png)', 'red;background:url(//x)', 'var(--x)', '#12345', 'expression(alert(1))']) {
      expect(sanitizeProject(project({ cables: [cable({ color: bad })] })).cables[0].color).toBe('#6b7280');
    }
    expect(sanitizeProject(project({ cables: [cable({ color: '#AABBCC' })] })).cables[0].color).toBe('#aabbcc');
  });

  it("can't freeze or crash the app with absurd sizes or shapes", () => {
    const p = sanitizeProject(
      project({
        racks: [{ id: 'r1', name: 'Rack A', location: '', heightU: 50_000_000 }],
        devices: [device('d1', { heightU: 1e9, positionU: -5, portGroups: [{ label: 'x', type: 'evil', rows: 1e6, ports: 'nope' }, 'junk', null] })],
      }),
    );
    expect(p.racks[0].heightU).toBe(LIMITS.rackHeightU);
    expect(p.devices[0]).toMatchObject({ heightU: LIMITS.deviceHeightU, positionU: 1 });
    expect(p.devices[0].portGroups).toEqual([{ label: 'x', type: 'rj45', rows: LIMITS.rowsPerGroup, numbering: 'zigzag', face: 'front', ports: [] }]);
    // Huge lists are cut to the limits rather than processed.
    const many = sanitizeProject(project({ devices: [device('d1', { portGroups: [{ label: 'x', type: 'rj45', rows: 1, numbering: 'row', face: 'front', ports: Array.from({ length: 5000 }, (_, i) => ({ id: `p${i}`, name: `${i}` })) }] })] }));
    expect(many.devices[0].portGroups[0].ports).toHaveLength(LIMITS.portsPerDevice);
  });

  it('drops anything that refers to something missing or duplicated', () => {
    const p = sanitizeProject(
      project({
        devices: [device('d1'), device('d1'), device('d2', { rackId: 'nowhere' }), device('bad id"]')],
        cables: [
          cable(),
          cable({ id: 'c2' }), // same ports again
          cable({ id: 'c3', a: { deviceId: 'd1', portId: 'ghost' } }),
          cable({ id: 'c4', b: { deviceId: 'd9', portId: 'd1:1' } }), // port belongs to a different device
          'not a cable',
        ],
      }),
    );
    expect(p.devices.map((d) => d.id)).toEqual(['d1']);
    expect(p.cables.map((c) => c.id)).toEqual(['c1']);
  });

  it('caps text and strips control characters (they corrupt Excel exports)', () => {
    const p = sanitizeProject(project({ name: `x\u0000y${'z'.repeat(5000)}`, devices: [device('d1', { notes: 'a\u0007b\nc' })] }));
    expect(p.name).toHaveLength(LIMITS.name);
    expect(p.name.startsWith('xy')).toBe(true);
    expect(p.devices[0].notes).toBe('ab\nc');
  });

  it("isn't affected by prototype-pollution payloads", () => {
    const evil = JSON.parse('{"version":2,"name":"p","racks":[],"devices":[],"cables":[],"__proto__":{"polluted":true},"customTemplates":[{"__proto__":{"polluted":true},"id":"t1","name":"t","category":"other","heightU":1,"portGroups":[]}]}');
    const p = parseProject(evil);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.getPrototypeOf(p)).toBe(Object.prototype);
    expect((p as unknown as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('still opens a normal project unchanged', () => {
    const ok = project({ cables: [cable()] });
    expect(sanitizeProject(ok)).toEqual(ok);
  });
});

describe('exports', () => {
  it('neutralises spreadsheet formulas in CSV (CSV injection)', () => {
    expect(csvCell('=HYPERLINK("https://x","y")')).toBe(`"'=HYPERLINK(""https://x"",""y"")"`);
    expect(['+1+1', '-2+3', '@SUM(A1)', '\tx'].map(csvCell)).toEqual(["'+1+1", "'-2+3", "'@SUM(A1)", "'\tx"]);
    expect(csvCell('core-sw1')).toBe('core-sw1');
    expect(csvCell(-5)).toBe('-5'); // real numbers are left alone
    const p = sanitizeProject(project({ devices: [device('d1', { name: '=cmd|"/C calc"!A0' })], cables: [cable()] }));
    expect(toCsv(cableSheet(p))).not.toMatch(/(^|,)"?=cmd/m);
  });
});

describe('other hardening', () => {
  it('reads trailing numbers in linear time (no regex backtracking)', () => {
    const long = `${'1'.repeat(100_000)} x`;
    const t = performance.now();
    for (let i = 0; i < 20; i++) trailingNumber(long);
    expect(performance.now() - t).toBeLessThan(200);
    expect([trailingNumber('Gi1/0/12'), trailingNumber('eth0 '), trailingNumber('mgmt'), trailingDigits('Gi12'), trailingDigits('Gi12 ')]).toEqual([12, 0, null, '12', undefined]);
  });

  it('caps what is read from a spreadsheet', () => {
    const big = 'x'.repeat(SHEET_LIMITS.cellChars * 2);
    const row = Array.from({ length: SHEET_LIMITS.columns + 5 }, () => big);
    const grid = limitGrid(Array.from({ length: SHEET_LIMITS.rows + 10 }, () => row));
    expect(grid).toHaveLength(SHEET_LIMITS.rows);
    expect(grid[0]).toHaveLength(SHEET_LIMITS.columns);
    expect(grid[0][0]).toHaveLength(SHEET_LIMITS.cellChars);
  });

  it('refuses unsafe colours when editing a cable', () => {
    useStore.getState().newProject();
    const rackId = useStore.getState().project.racks[0].id;
    useStore.getState().placeDevice('pp-24', rackId, 42);
    const d = useStore.getState().project.devices[0];
    useStore.getState().connect({ deviceId: d.id, portId: d.portGroups[0].ports[0].id }, { deviceId: d.id, portId: d.portGroups[0].ports[1].id });
    const id = useStore.getState().project.cables[0].id;
    useStore.getState().updateCable(id, { color: 'url(https://attacker.example/x)' });
    expect(useStore.getState().project.cables[0].color).toBe('#6b7280');
  });

  it('escapes ids used in CSS selectors', () => {
    expect(cssEscape('a"]b')).not.toContain('"]');
    expect(safeColor(undefined)).toBe('#6b7280');
  });
});
