import { describe, expect, it } from 'vitest';
import { cableSheet, deviceSheet } from '../export';
import {
  applyPlan,
  autoMap,
  buildPlan,
  classifyHeader,
  detectHeaderRow,
  guessTemplate,
  importTarget,
  parseColor,
  parseCableType,
  parseCsv,
  parseU,
  readDeviceSheets,
  type Grid,
} from '../importSheet';
import { createDevice, emptyProject, findPort } from '../project';
import { BUILTIN_TEMPLATES } from '../templates';
import type { Project } from '../types';

const tpl = (id: string) => BUILTIN_TEMPLATES.find((t) => t.id === id)!;
const run = (base: Project, grid: Grid, extra?: Grid[]) => {
  const h = detectHeaderRow(grid);
  const info = readDeviceSheets((extra ?? []).map((rows, i) => ({ name: `s${i}`, rows })));
  const plan = buildPlan(base, grid, h, autoMap(grid[h]), info, BUILTIN_TEMPLATES);
  return { plan, result: applyPlan(base, plan, (d) => d.templateId, BUILTIN_TEMPLATES) };
};
/** Every cable as "device port <-> device port" so results can be compared regardless of ids. */
const links = (p: Project) =>
  p.cables
    .map((c) => {
      const a = findPort(p, c.a)!;
      const b = findPort(p, c.b)!;
      return [`${a.device.name} ${a.port.name}`, `${b.device.name} ${b.port.name}`].sort().join(' <-> ') + ` [${c.label} ${c.type} ${c.color} ${c.lengthM}]`;
    })
    .sort();

describe('reading', () => {
  it('parses CSV with quotes, semicolons and Windows line endings', () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['x, y', 'say "hi"'],
    ]);
    expect(parseCsv('Device;Port\nsw1;Gi1')).toEqual([
      ['Device', 'Port'],
      ['sw1', 'Gi1'],
    ]);
  });

  it('reads values in the forms people write them', () => {
    expect([parseU('U41'), parseU('10-11'), parseU('U10-U11'), parseU('')]).toEqual([41, 10, 10, undefined]);
    expect(['cat 6', 'CAT6A', 'Cat5e', 'fibre', 'OS2 singlemode', 'IEC C13', 'weird'].map(parseCableType)).toEqual([
      'Cat6',
      'Cat6a',
      'Cat5e',
      'OM4',
      'OS2',
      'Power',
      'Other',
    ]);
    expect([parseColor('Blue'), parseColor('gray'), parseColor('#abc'), parseColor('plaid')]).toEqual(['#2563eb', '#6b7280', '#aabbcc', undefined]);
  });
});

describe('recognising columns', () => {
  it('understands common header styles', () => {
    const cases: Record<string, string | null> = {
      'A: Device': 'a.device',
      'B: Port': 'b.port',
      'A: U': 'a.u',
      'A: Port type': null,
      'A: Side': null,
      'From Device': 'a.device',
      'To Interface': 'b.port',
      'Source Switch': 'a.device',
      'Destination Port': 'b.port',
      'Device A': 'a.device',
      'Port 2': 'b.port',
      'Side B Rack': 'b.rack',
      'Cable ID': 'label',
      'Cable type': 'type',
      Colour: 'color',
      'Length (m)': 'length',
      Notes: 'notes',
      Device: 'a.device',
      Rack: 'a.rack',
      Position: 'a.u',
      'Purchase date': null,
    };
    for (const [header, field] of Object.entries(cases)) expect([header, classifyHeader(header)]).toEqual([header, field]);
  });

  it('finds the header row below a title', () => {
    expect(detectHeaderRow([['Comms room patching'], [], ['From device', 'From port', 'To device', 'To port'], ['a', '1', 'b', '2']])).toBe(2);
  });
});

describe('guessing device types', () => {
  it('uses names and ports', () => {
    expect(guessTemplate('PP-A01', ['1', '24'])).toBe('pp-24');
    expect(guessTemplate('core-sw1', ['Gi1/0/1', 'Gi1/0/40'])).toBe('sw-48');
    expect(guessTemplate('esx01', ['eth0'])).toBe('srv-1u');
    expect(guessTemplate('PDU-A', ['Out3'])).toBe('pdu-1u');
    expect(guessTemplate('anything', ['1'], BUILTIN_TEMPLATES, 'Server 2U')).toBe('srv-2u');
  });
});

describe('importing', () => {
  it('builds devices and cables from a typical third-party sheet', () => {
    const grid = parseCsv(
      [
        'Cable,From Device,From Port,To Device,To Port,Colour,Type,Length',
        'P001,PP-A01,1,SW-CORE-01,Gi1/0/1,Blue,Cat6,1m',
        'P002,PP-A01,2,SW-CORE-01,Gi1/0/2,Yellow,cat 6a,',
        'P003,PP-A01,2,SW-CORE-01,Gi1/0/3,,,', // panel port 2 used twice
        'P004,SW-CORE-01,Gi1/0/99,PP-A01,3,,,', // no such port on a 48-port switch
      ].join('\n'),
    );
    const { plan, result } = run(importTarget('Comms room.csv'), grid);
    expect(plan.newDevices.map((d) => [d.name, d.templateId])).toEqual([
      ['PP-A01', 'pp-24'],
      ['SW-CORE-01', 'sw-48'],
    ]);
    expect(result.project.name).toBe('Comms room');
    expect(result.racks).toBe(1);
    expect(links(result.project)).toEqual([
      'PP-A01 1 <-> SW-CORE-01 Gi1/0/1 [P001 Cat6 #2563eb 1]',
      'PP-A01 2 <-> SW-CORE-01 Gi1/0/2 [P002 Cat6a #eab308 ]',
    ]);
    expect(result.problems.map((p) => p.row)).toEqual([4, 5]);
    expect(result.problems[0].message).toMatch(/already has a cable \(P002\)/);
    expect(result.problems[1].message).toMatch(/no port "Gi1\/0\/99"/);
  });

  it('uses devices that already exist in the project, without renaming their ports', () => {
    const base = emptyProject();
    const sw = createDevice(tpl('sw-24'), base.racks[0].id, 40, 'sw1');
    base.devices.push(sw);
    const { result } = run(base, parseCsv('From Device,From Port,To Device,To Port\nsw1,1,new-pp,1\nsw1,Gi2,PDU-9,Out1'));
    expect(result.devices).toBe(2);
    expect(links(result.project)).toEqual([expect.stringMatching(/^new-pp 1 <-> sw1 Gi1 /)]);
    expect(result.problems.map((p) => p.message)).toEqual(['Connects a power port to a data port']);
    // The existing project wasn't touched.
    expect(base.cables).toHaveLength(0);
  });

  it('skips cables that are already there when re-importing', () => {
    const grid = parseCsv('From Device,From Port,To Device,To Port\npp1,1,sw1,Gi1\npp1,2,sw1,Gi2');
    const first = run(importTarget('x'), grid).result.project;
    const again = run(first, parseCsv('From Device,From Port,To Device,To Port\npp1,1,sw1,Gi1\npp1,2,sw1,Gi2\npp1,3,sw1,Gi3')).result;
    expect([again.cables, again.unchanged, again.devices, again.problems.length]).toEqual([1, 2, 0, 0]);
  });

  it('round-trips PortaBuddy’s own export', () => {
    const p = emptyProject();
    p.racks.push({ id: 'rb', name: 'Rack B', location: '', heightU: 24 });
    const pp = createDevice(tpl('pp-48'), p.racks[0].id, 42, 'PP-A01');
    const sw = createDevice(tpl('sw-48'), p.racks[0].id, 41, 'core-sw1');
    const srv = createDevice(tpl('srv-2u'), 'rb', 10, 'esx01');
    const pdu = createDevice(tpl('pdu-1u'), 'rb', 1, 'PDU-B1', 'rear');
    p.devices.push(pp, sw, srv, pdu);
    const ref = (d: typeof pp, g: number, i: number) => ({ deviceId: d.id, portId: d.portGroups[g].ports[i].id });
    p.cables.push(
      { id: 'c1', label: 'C001', a: ref(pp, 0, 0), b: ref(sw, 0, 0), type: 'Cat6', color: '#2563eb', lengthM: '0.5', notes: 'VLAN 10, "users"' },
      { id: 'c2', label: 'C002', a: ref(srv, 0, 0), b: ref(sw, 0, 1), type: 'Cat6a', color: '#dc2626', lengthM: '3', notes: '' },
      { id: 'c3', label: 'C003', a: ref(srv, 3, 1), b: ref(pdu, 0, 4), type: 'Power', color: '#111827', lengthM: '', notes: '' },
    );
    const asGrid = (s: { header: string[]; rows: (string | number)[][] }): Grid => parseCsv([s.header, ...s.rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n'));
    const { result } = run(importTarget('x'), asGrid(cableSheet(p)), [asGrid(deviceSheet(p))]);
    expect(result.problems).toEqual([]);
    expect(links(result.project)).toEqual(links(p));
    const summary = (q: Project) =>
      q.devices.map((d) => `${q.racks.find((r) => r.id === d.rackId)!.name} U${d.positionU} ${d.name} ${d.model}`).sort();
    expect(summary(result.project)).toEqual(summary(p));
  });
});
