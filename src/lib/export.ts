import { cableIndex, findPort, spanOf } from './project';
import { CATEGORY_LABELS, PORT_TYPE_LABELS, colorName } from './templates';
import type { PortRef, Project } from './types';

export type Row = (string | number)[];

export interface Sheet {
  name: string;
  header: string[];
  rows: Row[];
}

function endpointCols(project: Project, ref: PortRef): Row {
  const info = findPort(project, ref);
  if (!info) return ['', '', '(deleted)', '', ''];
  return [
    info.rack?.name ?? '',
    `U${info.device.positionU}`,
    info.device.name,
    info.port.name || info.group.label,
    PORT_TYPE_LABELS[info.type],
  ];
}

function sortKey(project: Project, ref: PortRef): string {
  const info = findPort(project, ref);
  if (!info) return '~';
  const rackIdx = project.racks.findIndex((r) => r.id === info.device.rackId);
  const rack = info.rack?.heightU ?? 0;
  // Top of rack first, then port order within the device.
  const portIdx = info.device.portGroups.flatMap((g) => g.ports).findIndex((p) => p.id === ref.portId);
  return [rackIdx, rack - info.device.positionU, portIdx].map((n) => String(n).padStart(5, '0')).join('|');
}

export function cableSheet(project: Project): Sheet {
  const cables = [...project.cables].sort((x, y) => x.label.localeCompare(y.label, undefined, { numeric: true }));
  return {
    name: 'Cable Schedule',
    header: [
      'Cable ID', 'Cable type', 'Colour', 'Length (m)',
      'A: Rack', 'A: U', 'A: Device', 'A: Port', 'A: Port type',
      'B: Rack', 'B: U', 'B: Device', 'B: Port', 'B: Port type',
      'Notes',
    ],
    rows: cables.map((c) => {
      // Put the "earlier" end (by rack / height / port order) in the A columns for a consistent read.
      const [a, b] = sortKey(project, c.a) <= sortKey(project, c.b) ? [c.a, c.b] : [c.b, c.a];
      return [c.label, c.type, colorName(c.color), c.lengthM, ...endpointCols(project, a), ...endpointCols(project, b), c.notes];
    }),
  };
}

function orderedDevices(project: Project) {
  return project.racks.flatMap((rack) =>
    project.devices
      .filter((d) => d.rackId === rack.id)
      .sort((a, b) => b.positionU - a.positionU)
      .map((device) => ({ rack, device })),
  );
}

export function portMapSheet(project: Project): Sheet {
  const index = cableIndex(project.cables);
  const rows: Row[] = [];
  for (const { rack, device } of orderedDevices(project)) {
    for (const group of device.portGroups) {
      for (const port of group.ports) {
        const cable = index.get(port.id);
        let peer = '';
        if (cable) {
          const other = cable.a.portId === port.id ? cable.b : cable.a;
          const info = findPort(project, other);
          peer = info ? `${info.rack?.name ?? ''} / U${info.device.positionU} ${info.device.name} / ${info.port.name || info.group.label}` : '(deleted)';
        }
        rows.push([
          rack.name,
          `U${device.positionU}`,
          device.name,
          port.name || group.label,
          group.label,
          PORT_TYPE_LABELS[group.type],
          cable ? 'Connected' : 'Free',
          cable?.label ?? '',
          cable ? cable.type : '',
          peer,
        ]);
      }
    }
  }
  return {
    name: 'Port Map',
    header: ['Rack', 'U', 'Device', 'Port', 'Port group', 'Port type', 'Status', 'Cable ID', 'Cable type', 'Connected to'],
    rows,
  };
}

export function deviceSheet(project: Project): Sheet {
  const index = cableIndex(project.cables);
  return {
    name: 'Devices',
    header: ['Rack', 'Location', 'Position', 'Height (U)', 'Device', 'Model', 'Category', 'Ports', 'Ports used', 'Notes'],
    rows: orderedDevices(project).map(({ rack, device }) => {
      const ports = device.portGroups.flatMap((g) => g.ports);
      const [bottom, top] = spanOf(device);
      return [
        rack.name,
        rack.location,
        bottom === top ? `U${bottom}` : `U${bottom}-U${top}`,
        device.heightU,
        device.name,
        device.model,
        CATEGORY_LABELS[device.category],
        ports.length,
        ports.filter((p) => index.has(p.id)).length,
        device.notes,
      ];
    }),
  };
}

/** Grid of rack elevations: one column per rack, one row per U (top of rack first). */
export function elevationGrid(project: Project): { header: string[]; rows: Row[]; merges: { col: number; fromRow: number; toRow: number }[] } {
  const maxU = Math.max(0, ...project.racks.map((r) => r.heightU));
  const rows: Row[] = [];
  const merges: { col: number; fromRow: number; toRow: number }[] = [];
  for (let u = maxU; u >= 1; u--) rows.push([`U${u}`, ...project.racks.map(() => '')]);
  project.racks.forEach((rack, ri) => {
    for (let u = maxU; u > rack.heightU; u--) rows[maxU - u][ri + 1] = '—';
    for (const d of project.devices.filter((x) => x.rackId === rack.id)) {
      const [bottom, top] = spanOf(d);
      const fromRow = maxU - top;
      const toRow = maxU - bottom;
      rows[fromRow][ri + 1] = d.name === d.model ? d.name : `${d.name} (${d.model})`;
      if (toRow > fromRow) merges.push({ col: ri + 1, fromRow, toRow });
    }
  });
  return { header: ['U', ...project.racks.map((r) => r.name)], rows, merges };
}

function csvCell(v: string | number): string {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(sheet: Sheet): string {
  return [sheet.header, ...sheet.rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export async function buildWorkbook(project: Project): Promise<Blob> {
  const { default: ExcelJS } = await import('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'PortaBuddy';
  wb.created = new Date();

  const headerFill = { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF1F2937' } };
  const headerFont = { bold: true, color: { argb: 'FFFFFFFF' } };

  const summary = wb.addWorksheet('Summary');
  summary.columns = [{ width: 18 }, { width: 50 }];
  summary.addRows([
    ['Project', project.name],
    ['Exported', new Date().toLocaleString()],
    ['Racks', project.racks.length],
    ['Devices', project.devices.length],
    ['Cables', project.cables.length],
  ]);
  summary.getColumn(1).font = { bold: true };

  for (const sheet of [cableSheet(project), portMapSheet(project), deviceSheet(project)]) {
    const ws = wb.addWorksheet(sheet.name, { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(sheet.header);
    ws.addRows(sheet.rows);
    const head = ws.getRow(1);
    head.font = headerFont;
    head.fill = headerFill;
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.header.length } };
    sheet.header.forEach((h, i) => {
      const longest = Math.max(h.length, ...sheet.rows.map((r) => String(r[i] ?? '').length));
      ws.getColumn(i + 1).width = Math.min(60, Math.max(8, longest + 2));
    });
  }

  // Colour swatch next to each cable's colour name.
  const cableWs = wb.getWorksheet('Cable Schedule');
  if (cableWs) {
    const sorted = [...project.cables].sort((x, y) => x.label.localeCompare(y.label, undefined, { numeric: true }));
    sorted.forEach((c, i) => {
      const cell = cableWs.getCell(i + 2, 3);
      const argb = 'FF' + c.color.replace('#', '').toUpperCase();
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb } };
      const dark = parseInt(c.color.slice(1, 3), 16) * 0.299 + parseInt(c.color.slice(3, 5), 16) * 0.587 + parseInt(c.color.slice(5, 7), 16) * 0.114 < 140;
      cell.font = { color: { argb: dark ? 'FFFFFFFF' : 'FF000000' } };
    });
  }

  const elev = elevationGrid(project);
  const ews = wb.addWorksheet('Rack Elevations', { views: [{ state: 'frozen', ySplit: 1, xSplit: 1 }] });
  ews.addRow(elev.header);
  ews.addRows(elev.rows);
  ews.getRow(1).font = headerFont;
  ews.getRow(1).fill = headerFill;
  ews.getColumn(1).width = 6;
  for (let c = 2; c <= elev.header.length; c++) ews.getColumn(c).width = 36;
  const border = { style: 'thin' as const, color: { argb: 'FF9CA3AF' } };
  elev.rows.forEach((row, ri) => {
    row.forEach((v, ci) => {
      const cell = ews.getCell(ri + 2, ci + 1);
      cell.border = { top: border, bottom: border, left: border, right: border };
      if (ci > 0 && v && v !== '—') {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
      }
    });
  });
  for (const m of elev.merges) ews.mergeCells(m.fromRow + 2, m.col + 1, m.toRow + 2, m.col + 1);

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export function safeFileName(name: string): string {
  return name.trim().replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') || 'portabuddy';
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
