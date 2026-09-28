import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildWorkbook, cableSheet, deviceSheet, elevationGrid, portMapSheet, toCsv } from '../export';
import { createDevice, emptyProject } from '../project';
import { BUILTIN_TEMPLATES } from '../templates';
import type { Project } from '../types';

const tpl = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)!;

function sample(): Project {
  const p = emptyProject();
  p.name = 'Test cab';
  p.racks.push({ id: 'r2', name: 'Rack B', location: 'Row 2', heightU: 24 });
  const pp = createDevice(tpl('pp-24'), p.racks[0].id, 42, 'PP-A1');
  const sw = createDevice(tpl('sw-48'), p.racks[0].id, 41, 'core-sw1');
  const srv = createDevice(tpl('srv-2u'), 'r2', 10, 'esx01');
  p.devices.push(pp, sw, srv);
  p.cables.push(
    { id: 'c1', label: 'C001', a: { deviceId: sw.id, portId: sw.portGroups[0].ports[0].id }, b: { deviceId: pp.id, portId: pp.portGroups[0].ports[0].id }, type: 'Cat6', color: '#2563eb', lengthM: '0.5', notes: 'VLAN 10, "users"' },
    { id: 'c2', label: 'C002', a: { deviceId: srv.id, portId: srv.portGroups[0].ports[0].id }, b: { deviceId: sw.id, portId: sw.portGroups[0].ports[1].id }, type: 'Cat6a', color: '#eab308', lengthM: '3', notes: '' },
  );
  return p;
}

describe('sheets', () => {
  it('builds the cable schedule with the higher end in the A columns', () => {
    const s = cableSheet(sample());
    expect(s.rows).toHaveLength(2);
    // PP-A1 sits above core-sw1, so it is listed as end A.
    expect(s.rows[0].slice(0, 9)).toEqual(['C001', 'Cat6', 'Blue', '0.5', 'Rack A', 'U42', 'PP-A1', '1', 'RJ45']);
    expect(s.rows[0].slice(9, 14)).toEqual(['Rack A', 'U41', 'core-sw1', 'Gi1', 'RJ45']);
    // Rack A comes before Rack B.
    expect(s.rows[1][6]).toBe('core-sw1');
    expect(s.rows[1][11]).toBe('esx01');
  });

  it('lists every port with its status', () => {
    const s = portMapSheet(sample());
    expect(s.rows).toHaveLength(24 + 52 + 11);
    const gi1 = s.rows.find((r) => r[2] === 'core-sw1' && r[3] === 'Gi1')!;
    expect(gi1[6]).toBe('Connected');
    expect(gi1[7]).toBe('C001');
    expect(gi1[9]).toBe('Rack A / U42 PP-A1 / 1');
    expect(s.rows.find((r) => r[2] === 'core-sw1' && r[3] === 'Gi3')![6]).toBe('Free');
  });

  it('summarises devices', () => {
    const s = deviceSheet(sample());
    expect(s.rows.map((r) => r[4])).toEqual(['PP-A1', 'core-sw1', 'esx01']);
    expect(s.rows[2][2]).toBe('U10-U11');
    expect(s.rows[1][8]).toBe(2);
  });

  it('draws rack elevations with merged multi-U devices', () => {
    const e = elevationGrid(sample());
    expect(e.header).toEqual(['U', 'Rack A', 'Rack B']);
    expect(e.rows[0]).toEqual(['U42', 'PP-A1 (Patch panel 24-port)', '—']);
    const u11 = e.rows.findIndex((r) => r[0] === 'U11');
    expect(e.rows[u11][2]).toContain('esx01');
    expect(e.merges).toEqual([{ col: 2, fromRow: u11, toRow: u11 + 1 }]);
  });

  it('escapes CSV', () => {
    const csv = toCsv(cableSheet(sample()));
    expect(csv).toContain('"VLAN 10, ""users"""');
    expect(csv.split('\r\n')[0].startsWith('Cable ID,')).toBe(true);
  });
});

describe('buildWorkbook', () => {
  it('produces a readable xlsx with all sheets', async () => {
    const blob = await buildWorkbook(sample());
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await blob.arrayBuffer());
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Summary', 'Cable Schedule', 'Port Map', 'Devices', 'Rack Elevations']);
    const cables = wb.getWorksheet('Cable Schedule')!;
    expect(cables.getCell('A2').value).toBe('C001');
    expect(cables.getCell('G2').value).toBe('PP-A1');
  });
});
