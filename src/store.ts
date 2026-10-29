import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { migrateCableMode, type CableMode } from './lib/cableFocus';
import { safeColor } from './lib/validate';
import { library, StorageFullError, type ProjectMeta } from './lib/library';
import { canPlace, createDevice, emptyProject, findPort, nextCableLabel, uid } from './lib/project';
import { BUILTIN_TEMPLATES, defaultCableFor } from './lib/templates';
import type { Cable, Device, DeviceTemplate, Face, PortRef, PortType, Project, Rack, Selection } from './lib/types';

export type { CableMode } from './lib/cableFocus';
/** Which sides of the racks are drawn. */
export type ViewMode = Face | 'both';
/**
 * Tap-then-tap mode: something was picked and the next tap says where it goes. This is how the
 * desktop layout works on touch screens, where drag and drop isn't available (it works with a
 * mouse too).
 */
export type Armed =
  | { kind: 'place'; templateId: string }
  | { kind: 'move'; deviceId: string }
  | { kind: 'patch'; from: PortRef }
  | { kind: 'repatch'; cableId: string; from: PortRef };

/** Which layout to use: automatic picks the mobile one on narrow screens. */
export type LayoutPref = 'auto' | 'mobile' | 'desktop';

const HISTORY_LIMIT = 100;

interface State {
  project: Project;
  /** Library id of the open project. */
  projectId: string;
  /** Last change to the open project (null if untouched since it was created). */
  lastEditAt: number | null;
  /** Last time the open project was downloaded with Save. */
  fileSavedAt: number | null;
  /** The last write to browser storage failed (usually because it is full). */
  storageError: boolean;
  /** Ask before closing the tab when there are changes not saved to a file. */
  warnOnClose: boolean;
  projectsOpen: boolean;
  past: Project[];
  future: Project[];
  selection: Selection;
  zoom: number;
  cableMode: CableMode;
  view: ViewMode;
  /** Draw empty rack units short so a whole cabinet fits on screen. */
  compact: boolean;
  /** Keep the zoom fitted to the window until the user zooms by hand. */
  autoFit: boolean;
  /** Device whose name is being edited in place on the rack. */
  renamingId: string | null;
  armed: Armed | null;
  printOpen: boolean;
  /** Bulk patch dialog, optionally starting from a device. */
  bulkPatch: { from?: string } | null;
  libraryOpen: boolean;
  inspectorOpen: boolean;
  layoutPref: LayoutPref;
  /** Last cable style used, so consecutive patch leads keep the same look. */
  lastCable: Pick<Cable, 'type' | 'color'> | null;
  message: string | null;

  select: (s: Selection) => void;
  /** Zoom chosen by the user; turns off auto-fit. */
  setZoom: (z: number) => void;
  /** Zoom chosen by auto-fit. */
  fitZoom: (z: number) => void;
  setAutoFit: (on: boolean) => void;
  setCompact: (on: boolean) => void;
  startRename: (deviceId: string | null) => void;
  openBulkPatch: (opts: { from?: string } | null) => void;
  arm: (a: Armed | null) => void;
  showPrint: (open: boolean) => void;
  setCableMode: (m: CableMode) => void;
  setView: (v: ViewMode) => void;
  togglePanel: (panel: 'library' | 'inspector') => void;
  setLayoutPref: (p: LayoutPref) => void;
  flash: (msg: string | null) => void;
  undo: () => void;
  redo: () => void;

  setProjectName: (name: string) => void;
  /** Start a new, empty project; the current one stays in the library. */
  newProject: () => void;
  /** Add a project read from a file to the library and open it. */
  importProject: (p: Project, opts?: { backedUp?: boolean }) => void;
  /** Replace the open project with an imported version of it, as one undo step. */
  applyImport: (p: Project) => void;
  importOpen: boolean;
  showImport: (open: boolean) => void;
  openProject: (id: string) => void;
  duplicateProject: (id: string) => void;
  deleteProject: (id: string) => void;
  /** Replace the open project with an earlier version (the current state is kept as a version first). */
  restoreVersion: (at: number) => void;
  markFileSaved: () => void;
  setWarnOnClose: (on: boolean) => void;
  showProjects: (open: boolean) => void;

  addRack: () => void;
  updateRack: (id: string, patch: Partial<Omit<Rack, 'id'>>) => void;
  removeRack: (id: string) => void;
  moveRack: (id: string, dir: -1 | 1) => void;

  placeDevice: (templateId: string, rackId: string, positionU: number, facing?: Face) => boolean;
  /** Move a device; `facing` turns it to face the other side of the rack. */
  moveDevice: (deviceId: string, rackId: string, positionU: number, facing?: Face) => boolean;
  setDeviceMount: (id: string, patch: Partial<Pick<Device, 'facing' | 'fullDepth'>>) => boolean;
  updateDevice: (id: string, patch: Partial<Pick<Device, 'name' | 'notes'>>) => void;
  renamePort: (deviceId: string, portId: string, name: string) => void;
  removeDevice: (id: string) => void;
  duplicateDevice: (id: string) => void;

  connect: (a: PortRef, b: PortRef) => boolean;
  /** Patch many port pairs as one undo step. Pairs that can't be patched are skipped. */
  connectMany: (pairs: [PortRef, PortRef][], style: Pick<Cable, 'type' | 'color'>) => { created: number; skipped: number };
  repatch: (cableId: string, from: PortRef, to: PortRef) => boolean;
  updateCable: (id: string, patch: Partial<Omit<Cable, 'id' | 'a' | 'b'>>) => void;
  removeCable: (id: string) => void;

  saveTemplate: (t: DeviceTemplate) => void;
  removeTemplate: (id: string) => void;
}

const isPower = (t: PortType) => t === 'power' || t === 'power-in';
const clampZoom = (z: number) => Math.min(2, Math.max(0.4, Math.round(z * 100) / 100));

/** Why two ports can't be patched together, or null if they can. `used` holds port ids that already have a cable. */
export function patchProblem(project: Project, a: PortRef, b: PortRef, used: Set<string>): string | null {
  if (a.portId === b.portId) return 'same port';
  const infoA = findPort(project, a);
  const infoB = findPort(project, b);
  if (!infoA || !infoB) return 'missing port';
  if (used.has(a.portId) || used.has(b.portId)) return 'already in use';
  if (isPower(infoA.type) !== isPower(infoB.type)) return 'power and data mixed';
  return null;
}

export function usedPorts(project: Project): Set<string> {
  return new Set(project.cables.flatMap((c) => [c.a.portId, c.b.portId]));
}

export function allTemplates(project: Project): DeviceTemplate[] {
  return [...BUILTIN_TEMPLATES, ...project.customTemplates];
}

const boot = library.boot();

/**
 * When the project was last changed, for the "not backed up" warning. A project that was never
 * touched since it was created counts as unchanged — unless it has content (e.g. imported from
 * the old single autosave), which is worth backing up.
 */
function editedAt(meta: ProjectMeta | undefined, project: Project): number | null {
  if (!meta) return null;
  const hasContent = project.devices.length > 0 || project.cables.length > 0;
  return meta.updatedAt > meta.createdAt || hasContent ? meta.updatedAt : null;
}

export const useStore = create<State>()(
  persist(
    (set, get) => {
      let lastKey: string | null = null;
      let lastAt = 0;
      /**
       * Apply an undoable change to the project. Consecutive edits with the same `coalesce` key
       * (e.g. typing into one text field) collapse into a single undo step.
       */
      const commit = (fn: (p: Project) => Project, coalesce?: string) => {
        const prev = get().project;
        const next = fn(prev);
        if (next === prev) return;
        const now = Date.now();
        const merge = coalesce !== undefined && coalesce === lastKey && now - lastAt < 1500 && get().past.length > 0;
        lastKey = coalesce ?? null;
        lastAt = now;
        if (merge) set({ project: next, future: [] });
        else set({ project: next, past: [...get().past.slice(-HISTORY_LIMIT + 1), prev], future: [] });
      };

      /** Open a project from the library, with a fresh undo history. */
      const switchTo = (id: string) => {
        const project = library.load(id) ?? emptyProject();
        library.setCurrent(id);
        const meta = library.meta(id);
        set({
          project,
          projectId: id,
          lastEditAt: editedAt(meta, project),
          fileSavedAt: meta?.fileSavedAt ?? null,
          past: [],
          future: [],
          selection: null,
          renamingId: null,
          armed: null,
        });
      };

      return {
        project: boot.project,
        projectId: boot.id,
        lastEditAt: editedAt(library.meta(boot.id), boot.project),
        fileSavedAt: library.meta(boot.id)?.fileSavedAt ?? null,
        storageError: false,
        warnOnClose: library.warnOnClose(),
        projectsOpen: false,
        past: [],
        future: [],
        selection: null,
        zoom: 1,
        cableMode: 'auto',
        view: 'front',
        compact: true,
        autoFit: true,
        renamingId: null,
        bulkPatch: null,
        armed: null,
        printOpen: false,
        libraryOpen: true,
        inspectorOpen: true,
        layoutPref: 'auto',
        lastCable: null,
        message: null,

        select: (selection) => set({ selection }),
        setZoom: (zoom) => set({ zoom: clampZoom(zoom), autoFit: false }),
        fitZoom: (zoom) => set({ zoom: clampZoom(zoom) }),
        setAutoFit: (autoFit) => set({ autoFit }),
        setCompact: (compact) => set({ compact }),
        startRename: (renamingId) => set({ renamingId }),
        openBulkPatch: (bulkPatch) => set({ bulkPatch }),
        arm: (armed) => set({ armed }),
        showPrint: (printOpen) => set({ printOpen }),
        setCableMode: (cableMode) => set({ cableMode }),
        setView: (view) => set({ view }),
        setLayoutPref: (layoutPref) => set({ layoutPref }),
        togglePanel: (panel) =>
          panel === 'library' ? set({ libraryOpen: !get().libraryOpen }) : set({ inspectorOpen: !get().inspectorOpen }),
        flash: (message) => set({ message }),

        undo: () => {
          const { past, project, future } = get();
          if (!past.length) return;
          set({ project: past[past.length - 1], past: past.slice(0, -1), future: [project, ...future] });
        },
        redo: () => {
          const { past, project, future } = get();
          if (!future.length) return;
          set({ project: future[0], past: [...past, project], future: future.slice(1) });
        },

        setProjectName: (name) => commit((p) => ({ ...p, name }), 'project-name'),
        newProject: () => {
          flushSave();
          switchTo(library.create(emptyProject()));
        },
        importProject: (project, opts = {}) => {
          flushSave();
          // Opening a file never overwrites anything: it becomes a project of its own. A
          // PortaBuddy file counts as a backup of it; a spreadsheet it was built from doesn't.
          const id = library.create(project);
          if (opts.backedUp ?? true) library.markFileSaved(id);
          switchTo(id);
        },
        applyImport: (project) => commit(() => project),
        importOpen: false,
        showImport: (importOpen) => set({ importOpen }),
        openProject: (id) => {
          if (id === get().projectId) return;
          flushSave();
          switchTo(id);
        },
        duplicateProject: (id) => {
          flushSave();
          const p = library.load(id);
          if (!p) return;
          switchTo(library.create({ ...p, name: `${p.name} (copy)` }));
        },
        deleteProject: (id) => {
          const wasOpen = id === get().projectId;
          library.remove(id);
          if (wasOpen) {
            const next = library.list()[0];
            switchTo(next ? next.id : library.create(emptyProject()));
          }
        },
        restoreVersion: (at) => {
          const { projectId, project } = get();
          const snap = library.versions(projectId).find((v) => v.at === at);
          if (!snap) return;
          flushSave();
          library.addVersion(projectId, project);
          commit(() => snap.project);
          get().flash('Restored an earlier version. Undo with Ctrl+Z, or restore a newer version.');
        },
        markFileSaved: () => {
          flushSave();
          library.markFileSaved(get().projectId);
          set({ fileSavedAt: Date.now() });
        },
        setWarnOnClose: (warnOnClose) => {
          library.setWarnOnClose(warnOnClose);
          set({ warnOnClose });
        },
        showProjects: (projectsOpen) => set({ projectsOpen }),

        addRack: () => {
          const id = uid('rack');
          commit((p) => ({
            ...p,
            racks: [...p.racks, { id, name: `Rack ${String.fromCharCode(65 + (p.racks.length % 26))}`, location: '', heightU: 42 }],
          }));
          set({ selection: { kind: 'rack', id } });
        },
        updateRack: (id, patch) =>
          commit((p) => {
            if (patch.heightU !== undefined) {
              const h = patch.heightU;
              if (p.devices.some((d) => d.rackId === id && d.positionU + d.heightU - 1 > h)) {
                get().flash('Cannot shrink the rack below an installed device.');
                return p;
              }
            }
            return { ...p, racks: p.racks.map((r) => (r.id === id ? { ...r, ...patch } : r)) };
          }, `rack:${id}:${Object.keys(patch).join()}`),
        removeRack: (id) => {
          commit((p) => {
            const gone = new Set(p.devices.filter((d) => d.rackId === id).map((d) => d.id));
            return {
              ...p,
              racks: p.racks.filter((r) => r.id !== id),
              devices: p.devices.filter((d) => !gone.has(d.id)),
              cables: p.cables.filter((c) => !gone.has(c.a.deviceId) && !gone.has(c.b.deviceId)),
            };
          });
          set({ selection: null });
        },
        moveRack: (id, dir) =>
          commit((p) => {
            const i = p.racks.findIndex((r) => r.id === id);
            const j = i + dir;
            if (i < 0 || j < 0 || j >= p.racks.length) return p;
            const racks = [...p.racks];
            [racks[i], racks[j]] = [racks[j], racks[i]];
            return { ...p, racks };
          }),

        placeDevice: (templateId, rackId, positionU, facing) => {
          const p = get().project;
          const t = allTemplates(p).find((x) => x.id === templateId);
          if (!t) return false;
          const side = facing ?? t.defaultFacing ?? 'front';
          if (!canPlace(p, rackId, { heightU: t.heightU, positionU, facing: side, fullDepth: t.fullDepth })) return false;
          const sameModel = p.devices.filter((d) => d.model === t.name).length;
          const device = createDevice(t, rackId, positionU, sameModel ? `${t.name} ${sameModel + 1}` : t.name, side);
          commit((pr) => ({ ...pr, devices: [...pr.devices, device] }));
          set({ selection: { kind: 'device', id: device.id }, renamingId: device.id });
          return true;
        },
        moveDevice: (deviceId, rackId, positionU, facing) => {
          const p = get().project;
          const d = p.devices.find((x) => x.id === deviceId);
          if (!d) return false;
          const side = facing ?? d.facing;
          if (!canPlace(p, rackId, { heightU: d.heightU, positionU, facing: side, fullDepth: d.fullDepth }, deviceId)) return false;
          if (d.rackId === rackId && d.positionU === positionU && d.facing === side) return true;
          commit((pr) => ({
            ...pr,
            devices: pr.devices.map((x) => (x.id === deviceId ? { ...x, rackId, positionU, facing: side } : x)),
          }));
          return true;
        },
        setDeviceMount: (id, patch) => {
          const p = get().project;
          const d = p.devices.find((x) => x.id === id);
          if (!d) return false;
          const next = { ...d, ...patch };
          if (!canPlace(p, d.rackId, next, id)) {
            get().flash('Another device is in the way on that side of the rack.');
            return false;
          }
          commit((pr) => ({ ...pr, devices: pr.devices.map((x) => (x.id === id ? next : x)) }));
          return true;
        },
        updateDevice: (id, patch) =>
          commit(
            (p) => ({ ...p, devices: p.devices.map((d) => (d.id === id ? { ...d, ...patch } : d)) }),
            `device:${id}:${Object.keys(patch).join()}`,
          ),
        renamePort: (deviceId, portId, name) =>
          commit((p) => ({
            ...p,
            devices: p.devices.map((d) =>
              d.id !== deviceId
                ? d
                : {
                    ...d,
                    portGroups: d.portGroups.map((g) => ({
                      ...g,
                      ports: g.ports.map((pt) => (pt.id === portId ? { ...pt, name } : pt)),
                    })),
                  },
            ),
          }), `port:${portId}`),
        removeDevice: (id) => {
          commit((p) => ({
            ...p,
            devices: p.devices.filter((d) => d.id !== id),
            cables: p.cables.filter((c) => c.a.deviceId !== id && c.b.deviceId !== id),
          }));
          set({ selection: null });
        },
        duplicateDevice: (id) => {
          const p = get().project;
          const d = p.devices.find((x) => x.id === id);
          if (!d) return;
          // Prefer the slot directly above, then below, then anywhere in the same rack.
          const rack = p.racks.find((r) => r.id === d.rackId)!;
          const candidates = [d.positionU + d.heightU, d.positionU - d.heightU];
          for (let pos = rack.heightU - d.heightU + 1; pos >= 1; pos--) candidates.push(pos);
          const pos = candidates.find((c) => canPlace(p, d.rackId, { ...d, positionU: c }));
          if (pos === undefined) {
            get().flash('No free space in this rack for a copy.');
            return;
          }
          const newId = uid('dev');
          const copy: Device = {
            ...d,
            id: newId,
            name: `${d.name} copy`,
            positionU: pos,
            portGroups: d.portGroups.map((g, gi) => ({
              ...g,
              ports: g.ports.map((pt, i) => ({ ...pt, id: `${newId}:${gi}:${i}` })),
            })),
          };
          commit((pr) => ({ ...pr, devices: [...pr.devices, copy] }));
          set({ selection: { kind: 'device', id: newId } });
        },

        connect: (a, b) => {
          const p = get().project;
          if (a.portId === b.portId) return false;
          const used = p.cables.some((c) => [c.a.portId, c.b.portId].some((id) => id === a.portId || id === b.portId));
          if (used) {
            get().flash('That port already has a cable. Drag its existing cable end to re-patch it.');
            return false;
          }
          const infoA = findPort(p, a);
          const infoB = findPort(p, b);
          if (!infoA || !infoB) return false;
          if (isPower(infoA.type) !== isPower(infoB.type)) {
            get().flash('Power ports can only be connected to other power ports.');
            return false;
          }
          const style = get().lastCable ?? defaultCableFor(infoA.type);
          const fitted = isPower(infoA.type) ? defaultCableFor(infoA.type) : style;
          const cable: Cable = { id: uid('cab'), label: nextCableLabel(p), a, b, type: fitted.type, color: fitted.color, lengthM: '', notes: '' };
          commit((pr) => ({ ...pr, cables: [...pr.cables, cable] }));
          set({ selection: { kind: 'cable', id: cable.id } });
          return true;
        },
        connectMany: (pairs, style) => {
          const p = get().project;
          const used = usedPorts(p);
          const cables: Cable[] = [];
          let next = Number(/^C(\d+)$/.exec(nextCableLabel(p))![1]);
          for (const [a, b] of pairs) {
            if (patchProblem(p, a, b, used)) continue;
            used.add(a.portId);
            used.add(b.portId);
            const power = isPower(findPort(p, a)!.type);
            const look = power ? defaultCableFor('power') : style;
            const label = `C${String(next++).padStart(3, '0')}`;
            cables.push({ id: uid('cab'), label, a, b, type: look.type, color: look.color, lengthM: '', notes: '' });
          }
          if (cables.length) {
            commit((pr) => ({ ...pr, cables: [...pr.cables, ...cables] }));
            if (style.type !== 'Power') set({ lastCable: { type: style.type, color: style.color } });
          }
          return { created: cables.length, skipped: pairs.length - cables.length };
        },
        repatch: (cableId, from, to) => {
          const p = get().project;
          const cable = p.cables.find((c) => c.id === cableId);
          if (!cable || !findPort(p, to)) return false;
          if (from.portId === to.portId) return true;
          const keep = cable.a.portId === from.portId ? cable.b : cable.a;
          if (keep.portId === to.portId) return false;
          const keepInfo = findPort(p, keep);
          const toInfo = findPort(p, to)!;
          if (keepInfo && isPower(keepInfo.type) !== isPower(toInfo.type)) {
            get().flash('Power ports can only be connected to other power ports.');
            return false;
          }
          if (p.cables.some((c) => c.id !== cableId && (c.a.portId === to.portId || c.b.portId === to.portId))) {
            get().flash('That port already has a cable.');
            return false;
          }
          commit((pr) => ({
            ...pr,
            cables: pr.cables.map((c) =>
              c.id !== cableId ? c : c.a.portId === from.portId ? { ...c, a: to } : { ...c, b: to },
            ),
          }));
          return true;
        },
        updateCable: (id, rawPatch) => {
          // Colours end up in style and SVG attributes: only #rrggbb is accepted.
          const patch = rawPatch.color === undefined ? rawPatch : { ...rawPatch, color: safeColor(rawPatch.color) };
          commit(
            (p) => ({ ...p, cables: p.cables.map((c) => (c.id === id ? { ...c, ...patch } : c)) }),
            `cable:${id}:${Object.keys(patch).join()}`,
          );
          const c = get().project.cables.find((x) => x.id === id);
          if (c && (patch.type || patch.color) && c.type !== 'Power') set({ lastCable: { type: c.type, color: c.color } });
        },
        removeCable: (id) => {
          commit((p) => ({ ...p, cables: p.cables.filter((c) => c.id !== id) }));
          set({ selection: null });
        },

        saveTemplate: (t) =>
          commit((p) => ({
            ...p,
            customTemplates: p.customTemplates.some((x) => x.id === t.id)
              ? p.customTemplates.map((x) => (x.id === t.id ? t : x))
              : [...p.customTemplates, t],
          })),
        removeTemplate: (id) => commit((p) => ({ ...p, customTemplates: p.customTemplates.filter((t) => t.id !== id) })),
      };
    },
    {
      // Projects live in the library (lib/library.ts); this key only holds view preferences.
      name: 'portabuddy-ui',
      version: 2,
      // v1 had Show / Dim / Hide for cables.
      migrate: (persisted) => {
        const state = (persisted ?? {}) as Record<string, unknown>;
        return { ...state, cableMode: migrateCableMode(state.cableMode) } as never;
      },
      partialize: (s) => ({
        zoom: s.zoom,
        cableMode: s.cableMode,
        view: s.view,
        compact: s.compact,
        autoFit: s.autoFit,
        libraryOpen: s.libraryOpen,
        inspectorOpen: s.inspectorOpen,
        layoutPref: s.layoutPref,
      }),
    },
  ),
);

// ----- Autosave to the project library -----

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pending: { id: string; project: Project } | null = null;

/** Write any pending change to browser storage now. */
export function flushSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (!pending) return;
  const { id, project } = pending;
  pending = null;
  try {
    library.save(id, project);
    if (useStore.getState().storageError) useStore.setState({ storageError: false });
  } catch (err) {
    if (!(err instanceof StorageFullError)) console.error(err);
    useStore.setState({ storageError: true });
    useStore.getState().flash('Could not save in this browser: storage is full. Use Save to download a copy now.');
  }
}

useStore.subscribe((s, prev) => {
  if (s.project === prev.project || s.projectId !== prev.projectId) return;
  pending = { id: s.projectId, project: s.project };
  useStore.setState({ lastEditAt: Date.now() });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 400);
});

/** True when the open project has changes that are only in this browser. */
export function hasUnbackedChanges(s: Pick<State, 'lastEditAt' | 'fileSavedAt'>): boolean {
  return s.lastEditAt !== null && (s.fileSavedAt === null || s.lastEditAt > s.fileSavedAt);
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushSave);
  window.addEventListener('beforeunload', (e) => {
    flushSave();
    const s = useStore.getState();
    if (s.storageError || (s.warnOnClose && hasUnbackedChanges(s))) {
      e.preventDefault();
      e.returnValue = ''; // older browsers need this to show the prompt
    }
  });
}
