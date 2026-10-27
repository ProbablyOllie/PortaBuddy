import { useMemo, useRef, useState } from 'react';
import {
  FIELD_GROUPS,
  applyPlan,
  autoMap,
  buildPlan,
  detectHeaderRow,
  importTarget,
  readDeviceSheets,
  readSpreadsheet,
  type Field,
  type Mapping,
  type NewDevice,
  type SheetData,
} from '../lib/importSheet';
import { allTemplates, useStore } from '../store';

const plural = (n: number, word: string) => (n === 1 ? word : `${word}s`);

const colName = (i: number) => {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/** Import racks, devices and cables from a spreadsheet: pick the file, check the columns, preview, import. */
export function ImportDialog() {
  const project = useStore((s) => s.project);
  const { showImport, importProject, applyImport, flash } = useStore.getState();
  const templates = useMemo(() => allTemplates(project), [project]);
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState<SheetData[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerRow, setHeaderRow] = useState(0);
  const [mapping, setMapping] = useState<Mapping>({});
  const [target, setTarget] = useState<'new' | 'current'>('new');
  const [choices, setChoices] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const close = () => showImport(false);

  const chooseSheet = (all: SheetData[], i: number) => {
    const h = detectHeaderRow(all[i].rows);
    setSheetIdx(i);
    setHeaderRow(h);
    setMapping(autoMap(all[i].rows[h] ?? []));
    setChoices({});
  };

  const open = async (file: File) => {
    setBusy(true);
    try {
      const all = (await readSpreadsheet(file)).filter((s) => s.rows.some((r) => r.some((c) => c)));
      if (!all.length) throw new Error('the file is empty');
      setFileName(file.name);
      setSheets(all);
      // Start on the sheet whose columns look most like a cable schedule.
      const score = (s: SheetData) => {
        const m = autoMap(s.rows[detectHeaderRow(s.rows)] ?? []);
        return (m['a.device'] !== undefined ? 2 : 0) + (m['b.device'] !== undefined ? 3 : 0) + (m['a.port'] !== undefined ? 1 : 0);
      };
      const best = all.reduce((bi, s, i) => (score(s) > score(all[bi]) ? i : bi), 0);
      chooseSheet(all, best);
    } catch (err) {
      flash(`Could not read ${file.name}: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const sheet = sheets?.[sheetIdx];
  const headers = sheet?.rows[headerRow] ?? [];
  // What the import builds on: an empty project, or the open one (devices are matched by name).
  const base = useMemo(() => (target === 'new' ? importTarget(fileName || 'Imported') : project), [target, fileName, project]);
  const deviceInfo = useMemo(() => (sheets ? readDeviceSheets(sheets) : new Map()), [sheets]);
  const plan = useMemo(
    () => (sheet ? buildPlan(base, sheet.rows, headerRow, mapping, deviceInfo, templates) : null),
    [sheet, base, headerRow, mapping, deviceInfo, templates],
  );
  const templateFor = (d: NewDevice) => choices[d.key] ?? d.templateId;
  // A dry run on a copy, so the counts and problems shown are exactly what Import will do.
  const result = useMemo(
    () => (plan ? applyPlan(base, plan, (d) => choices[d.key] ?? d.templateId, templates) : null),
    [plan, base, choices, templates],
  );
  const ready = mapping['a.device'] !== undefined;

  const doImport = () => {
    if (!result) return;
    if (target === 'new') importProject(result.project, { backedUp: false });
    else applyImport(result.project);
    flash(
      `Imported ${result.cables} cable${result.cables === 1 ? '' : 's'} and ${result.devices} new device${result.devices === 1 ? '' : 's'}${
        result.problems.length ? ` — ${result.problems.length} row${result.problems.length === 1 ? '' : 's'} skipped` : ''
      }.`,
    );
    close();
  };

  const setField = (field: Field, col: string) => {
    const next = { ...mapping };
    if (col === '') delete next[field];
    else next[field] = Number(col);
    setMapping(next);
  };

  return (
    <div className="modal-backdrop" onMouseDown={close}>
      <div className="modal import" onMouseDown={(e) => e.stopPropagation()}>
        <h3>Import from a spreadsheet</h3>
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.csv,.tsv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) open(f);
            e.target.value = '';
          }}
        />
        {!sheets ? (
          <div className="import-start">
            <p>
              Bring in a cable schedule or device list you already keep in Excel (.xlsx) or CSV. Each row is a cable — a device and port at
              each end — or just a device. Columns like <i>From device, From port, To device, To port, Cable ID, Colour, Type, Length,
              Rack, U</i> are recognised automatically, and you can adjust them before anything is imported.
            </p>
            <p className="hint">Devices that don't exist yet are created, with a device type guessed from their name and ports. PortaBuddy's own Excel export imports straight back in.</p>
            <button className="btn primary" disabled={busy} onClick={() => fileRef.current?.click()}>
              {busy ? 'Reading…' : 'Choose a spreadsheet…'}
            </button>
          </div>
        ) : (
          <>
            <div className="import-file">
              <b>{fileName}</b>
              {sheets.length > 1 ? (
                <label>
                  Sheet
                  <select value={sheetIdx} onChange={(e) => chooseSheet(sheets, Number(e.target.value))}>
                    {sheets.map((s, i) => (
                      <option key={i} value={i}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
              <label>
                Headings in row
                <select
                  value={headerRow}
                  onChange={(e) => {
                    const h = Number(e.target.value);
                    setHeaderRow(h);
                    setMapping(autoMap(sheet!.rows[h] ?? []));
                  }}
                >
                  {sheet!.rows.slice(0, 15).map((r, i) => (
                    <option key={i} value={i}>
                      {i + 1}: {r.filter(Boolean).slice(0, 3).join(', ').slice(0, 40) || '(empty)'}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn" onClick={() => fileRef.current?.click()}>
                Choose another file…
              </button>
            </div>

            <div className="import-mapping">
              {FIELD_GROUPS.map((g) => (
                <fieldset key={g.title}>
                  <legend>{g.title}</legend>
                  {g.fields.map(({ field, label }) => (
                    <label key={field}>
                      {label}
                      <select value={mapping[field] ?? ''} onChange={(e) => setField(field, e.target.value)}>
                        <option value="">—</option>
                        {headers.map((h, i) => (
                          <option key={i} value={i}>
                            {colName(i)}: {h || '(no heading)'}
                          </option>
                        ))}
                      </select>
                    </label>
                  ))}
                </fieldset>
              ))}
            </div>
            {!ready ? <p className="import-warn">Choose which column holds the device names (End A → Device) to continue.</p> : null}

            {ready && plan && result ? (
              <>
                <div className="import-summary">
                  <span>
                    <b>{result.cables}</b> {plural(result.cables, 'cable')}
                  </span>
                  <span>
                    <b>{result.devices}</b> new {plural(result.devices, 'device')}
                  </span>
                  {result.unchanged ? (
                    <span>
                      <b>{result.unchanged}</b> already in the project
                    </span>
                  ) : null}
                  {result.racks ? (
                    <span>
                      <b>{result.racks}</b> new {plural(result.racks, 'rack')}
                    </span>
                  ) : null}
                  <span className={result.problems.length ? 'warn' : ''}>
                    <b>{result.problems.length}</b> {plural(result.problems.length, 'problem')}
                  </span>
                </div>

                {plan.newDevices.length ? (
                  <div className="import-section">
                    <h4>New devices — check the device types</h4>
                    <div className="import-table-wrap">
                      <table className="import-table">
                        <thead>
                          <tr>
                            <th>Device</th>
                            <th>Rack / U</th>
                            <th>Ports used in the sheet</th>
                            <th>Device type</th>
                          </tr>
                        </thead>
                        <tbody>
                          {plan.newDevices.map((d) => (
                            <tr key={d.key}>
                              <td>
                                <b>{d.name}</b>
                              </td>
                              <td>
                                {d.rack ?? 'first rack'}
                                {d.u ? ` · U${d.u}` : ''}
                              </td>
                              <td className="muted">{d.ports.length ? `${d.ports.slice(0, 4).join(', ')}${d.ports.length > 4 ? ` … (${d.ports.length})` : ''}` : '—'}</td>
                              <td>
                                <select value={templateFor(d)} onChange={(e) => setChoices({ ...choices, [d.key]: e.target.value })}>
                                  {templates.map((t) => (
                                    <option key={t.id} value={t.id}>
                                      {t.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}

                {result.problems.length ? (
                  <div className="import-section">
                    <h4>Rows that won't be imported</h4>
                    <ul className="import-problems">
                      {result.problems.slice(0, 50).map((p, i) => (
                        <li key={i}>
                          {p.row ? <span className="muted">Row {p.row}: </span> : null}
                          {p.message}
                        </li>
                      ))}
                      {result.problems.length > 50 ? <li className="muted">…and {result.problems.length - 50} more</li> : null}
                    </ul>
                  </div>
                ) : null}

                <div className="import-target">
                  <label>
                    <input type="radio" checked={target === 'new'} onChange={() => setTarget('new')} />
                    As a new project <span className="muted">(recommended)</span>
                  </label>
                  <label>
                    <input type="radio" checked={target === 'current'} onChange={() => setTarget('current')} />
                    Into “{project.name}” <span className="muted">— matches devices by name; one undo step</span>
                  </label>
                </div>
              </>
            ) : null}
          </>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={close}>
            Cancel
          </button>
          {sheets ? (
            <button className="btn primary" disabled={!ready || !result || (!result.cables && !result.devices)} onClick={doImport}>
              Import
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
