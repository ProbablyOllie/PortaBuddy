import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { canPlace, createDevice, emptyProject, findPort, nextCableLabel, parseProject, uid } from './lib/project';
import { BUILTIN_TEMPLATES, defaultCableFor } from './lib/templates';
import type { Cable, Device, DeviceTemplate, Face, PortRef, PortType, Project, Rack, Selection } from './lib/types';

export type CableMode = 'show' | 'dim' | 'hide';
/** Which sides of the racks are drawn. */
export type ViewMode = Face | 'both';

const HISTORY_LIMIT = 100;

interface State {
  project: Project;
  past: Project[];
  future: Project[];
  selection: Selection;
  zoom: number;
  cableMode: CableMode;
  view: ViewMode;
  libraryOpen: boolean;
  inspectorOpen: boolean;
  /** Last cable style used, so consecutive patch leads keep the same look. */
  lastCable: Pick<Cable, 'type' | 'color'> | null;
  message: string | null;

  select: (s: Selection) => void;
  setZoom: (z: number) => void;
  setCableMode: (m: CableMode) => void;
  setView: (v: ViewMode) => void;
  togglePanel: (panel: 'library' | 'inspector') => void;
  flash: (msg: string | null) => void;
  undo: () => void;
  redo: () => void;

  setProjectName: (name: string) => void;
  loadProject: (p: Project) => void;
  newProject: () => void;

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
  repatch: (cableId: string, from: PortRef, to: PortRef) => boolean;
  updateCable: (id: string, patch: Partial<Omit<Cable, 'id' | 'a' | 'b'>>) => void;
  removeCable: (id: string) => void;

  saveTemplate: (t: DeviceTemplate) => void;
  removeTemplate: (id: string) => void;
}

const isPower = (t: PortType) => t === 'power' || t === 'power-in';

export function allTemplates(project: Project): DeviceTemplate[] {
  return [...BUILTIN_TEMPLATES, ...project.customTemplates];
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

      return {
        project: emptyProject(),
        past: [],
        future: [],
        selection: null,
        zoom: 1,
        cableMode: 'show',
        view: 'front',
        libraryOpen: true,
        inspectorOpen: true,
        lastCable: null,
        message: null,

        select: (selection) => set({ selection }),
        setZoom: (zoom) => set({ zoom: Math.min(2, Math.max(0.4, Math.round(zoom * 100) / 100)) }),
        setCableMode: (cableMode) => set({ cableMode }),
        setView: (view) => set({ view }),
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
        loadProject: (project) => set({ project, past: [], future: [], selection: null }),
        newProject: () => set({ project: emptyProject(), past: [], future: [], selection: null }),

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
          set({ selection: { kind: 'device', id: device.id } });
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
        updateCable: (id, patch) => {
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
      name: 'portabuddy-project',
      version: 2,
      partialize: (s) => ({
        project: s.project,
        zoom: s.zoom,
        cableMode: s.cableMode,
        view: s.view,
        libraryOpen: s.libraryOpen,
        inspectorOpen: s.inspectorOpen,
      }),
      migrate: (persisted, version) => {
        const state = persisted as Pick<State, 'project' | 'zoom' | 'cableMode' | 'view' | 'libraryOpen' | 'inspectorOpen'>;
        if (version < 2 && state.project) {
          try {
            return { ...state, project: parseProject(state.project) };
          } catch {
            return { ...state, project: emptyProject() };
          }
        }
        return state;
      },
    },
  ),
);
