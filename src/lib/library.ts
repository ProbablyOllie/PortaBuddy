import { emptyProject, parseProject, uid } from './project';
import type { Project } from './types';

/**
 * Every project lives in browser storage, with a short version history, so starting or opening
 * another project never replaces the one you were working on.
 *
 * Keys:
 *  - `portabuddy-library`          index: current project id + metadata for each project
 *  - `portabuddy-p:<id>`           the project itself
 *  - `portabuddy-v:<id>`           version history (snapshots, oldest first)
 */

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  readonly length: number;
  key(index: number): string | null;
}

export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: number;
  /** Last change made to the project. */
  updatedAt: number;
  /** Last time it was downloaded with Save, if ever. */
  fileSavedAt: number | null;
  racks: number;
  devices: number;
  cables: number;
}

export interface Snapshot {
  at: number;
  project: Project;
}

interface Index {
  currentId: string | null;
  projects: ProjectMeta[];
  /** Ask before closing the tab when there are changes not saved to a file. */
  warnOnClose: boolean;
}

const INDEX_KEY = 'portabuddy-library';
/** Where earlier versions of the app autosaved the one and only project. */
export const LEGACY_KEY = 'portabuddy-project';
const projectKey = (id: string) => `portabuddy-p:${id}`;
const versionsKey = (id: string) => `portabuddy-v:${id}`;

/** A new version is kept at most this often while editing. */
export const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
export const MAX_SNAPSHOTS = 20;
/** Version history per project is trimmed (oldest first) to stay under this many characters. */
export const MAX_HISTORY_CHARS = 1_500_000;

export class StorageFullError extends Error {
  constructor() {
    super('Browser storage is full');
  }
}

export function memoryStorage(): StorageLike {
  const m = new Map<string, string>();
  return {
    getItem: (k) => m.get(k) ?? null,
    setItem: (k, v) => void m.set(k, v),
    removeItem: (k) => void m.delete(k),
    get length() {
      return m.size;
    },
    key: (i) => [...m.keys()][i] ?? null,
  };
}

function counts(p: Project) {
  return { name: p.name, racks: p.racks.length, devices: p.devices.length, cables: p.cables.length };
}

export class Library {
  constructor(
    private storage: StorageLike,
    private now: () => number = Date.now,
  ) {}

  // ----- index -----

  private readIndex(): Index {
    try {
      const raw = this.storage.getItem(INDEX_KEY);
      if (raw) {
        const i = JSON.parse(raw) as Partial<Index>;
        if (Array.isArray(i.projects)) return { currentId: i.currentId ?? null, projects: i.projects, warnOnClose: i.warnOnClose ?? true };
      }
    } catch {
      /* fall through to an empty index */
    }
    return { currentId: null, projects: [], warnOnClose: true };
  }

  private writeIndex(i: Index) {
    this.write(INDEX_KEY, JSON.stringify(i));
  }

  /** setItem that frees space from old versions when storage is full, then gives up with StorageFullError. */
  private write(key: string, value: string) {
    try {
      this.storage.setItem(key, value);
      return;
    } catch {
      /* probably quota; trim and retry */
    }
    for (let attempt = 0; attempt < 4; attempt++) {
      if (!this.trimHistories()) break;
      try {
        this.storage.setItem(key, value);
        return;
      } catch {
        /* keep trimming */
      }
    }
    throw new StorageFullError();
  }

  /** Halve every project's version history. Returns false when there is nothing left to drop. */
  private trimHistories(): boolean {
    let dropped = false;
    for (const meta of this.readIndex().projects) {
      const v = this.versions(meta.id);
      if (!v.length) continue;
      const keep = v.slice(Math.ceil(v.length / 2));
      dropped = true;
      try {
        if (keep.length) this.storage.setItem(versionsKey(meta.id), JSON.stringify(keep));
        else this.storage.removeItem(versionsKey(meta.id));
      } catch {
        // Too full even to write the shorter history: drop it entirely.
        this.storage.removeItem(versionsKey(meta.id));
      }
    }
    return dropped;
  }

  list(): ProjectMeta[] {
    return [...this.readIndex().projects].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  meta(id: string): ProjectMeta | undefined {
    return this.readIndex().projects.find((p) => p.id === id);
  }

  currentId(): string | null {
    return this.readIndex().currentId;
  }

  setCurrent(id: string) {
    const i = this.readIndex();
    this.writeIndex({ ...i, currentId: id });
  }

  warnOnClose(): boolean {
    return this.readIndex().warnOnClose;
  }

  setWarnOnClose(on: boolean) {
    this.writeIndex({ ...this.readIndex(), warnOnClose: on });
  }

  // ----- projects -----

  /** The project exactly as stored, for rescuing it when it can't be displayed. */
  raw(id: string): string | null {
    return this.storage.getItem(projectKey(id));
  }

  load(id: string): Project | null {
    try {
      const raw = this.storage.getItem(projectKey(id));
      return raw ? parseProject(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  /** Adds a project to the library and returns its id. */
  create(project: Project, opts: { updatedAt?: number } = {}): string {
    const id = uid('proj');
    const t = this.now();
    this.write(projectKey(id), JSON.stringify(project));
    const i = this.readIndex();
    i.projects.push({ id, createdAt: t, updatedAt: opts.updatedAt ?? t, fileSavedAt: null, ...counts(project) });
    this.writeIndex(i);
    return id;
  }

  /** Stores the latest state of a project, keeping a version every few minutes. */
  save(id: string, project: Project) {
    const t = this.now();
    this.write(projectKey(id), JSON.stringify(project));
    const i = this.readIndex();
    i.projects = i.projects.map((m) => (m.id === id ? { ...m, ...counts(project), updatedAt: t } : m));
    this.writeIndex(i);
    const last = this.versions(id).at(-1);
    if (!last || t - last.at >= SNAPSHOT_INTERVAL_MS) this.addVersion(id, project);
  }

  markFileSaved(id: string) {
    const i = this.readIndex();
    i.projects = i.projects.map((m) => (m.id === id ? { ...m, fileSavedAt: this.now() } : m));
    this.writeIndex(i);
  }

  remove(id: string) {
    this.storage.removeItem(projectKey(id));
    this.storage.removeItem(versionsKey(id));
    const i = this.readIndex();
    this.writeIndex({ ...i, currentId: i.currentId === id ? null : i.currentId, projects: i.projects.filter((m) => m.id !== id) });
  }

  // ----- versions -----

  versions(id: string): Snapshot[] {
    try {
      const raw = this.storage.getItem(versionsKey(id));
      return raw ? (JSON.parse(raw) as Snapshot[]) : [];
    } catch {
      return [];
    }
  }

  addVersion(id: string, project: Project) {
    const prev = this.versions(id);
    // Versions are identified by time, so keep times unique even when saved in the same millisecond.
    const at = Math.max(this.now(), (prev.at(-1)?.at ?? 0) + 1);
    const v = [...prev, { at, project }];
    while (v.length > MAX_SNAPSHOTS) v.shift();
    let raw = JSON.stringify(v);
    while (raw.length > MAX_HISTORY_CHARS && v.length > 1) {
      v.shift();
      raw = JSON.stringify(v);
    }
    try {
      this.write(versionsKey(id), raw);
    } catch {
      // History is a nice-to-have: never let it block saving the project itself.
    }
  }

  /** Approximate characters used by PortaBuddy in browser storage. */
  usage(): number {
    let n = 0;
    for (let k = 0; k < this.storage.length; k++) {
      const key = this.storage.key(k);
      if (key?.startsWith('portabuddy')) n += key.length + (this.storage.getItem(key)?.length ?? 0);
    }
    return n;
  }

  /**
   * Picks the project to open when the app starts: the last one used, or the newest; imports the
   * single project autosaved by earlier versions; creates an empty project if there is nothing.
   */
  boot(): { id: string; project: Project } {
    let i = this.readIndex();
    if (!i.projects.length) {
      const legacy = this.readLegacy();
      if (legacy) {
        const id = this.create(legacy);
        this.addVersion(id, legacy);
        this.setCurrent(id);
        // Only reached once the project is safely in the library.
        this.storage.removeItem(LEGACY_KEY);
        i = this.readIndex();
      }
    }
    for (const id of [i.currentId, ...this.list().map((m) => m.id)]) {
      if (!id) continue;
      const project = this.load(id);
      if (project) {
        if (id !== i.currentId) this.setCurrent(id);
        return { id, project };
      }
    }
    const project = emptyProject();
    const id = this.create(project);
    this.setCurrent(id);
    return { id, project };
  }

  private readLegacy(): Project | null {
    try {
      const raw = this.storage.getItem(LEGACY_KEY);
      const project = raw ? (JSON.parse(raw) as { state?: { project?: unknown } }).state?.project : null;
      return project ? parseProject(project) : null;
    } catch {
      return null;
    }
  }
}

function browserStorage(): StorageLike {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.getItem(INDEX_KEY);
      return localStorage;
    }
  } catch {
    /* blocked (private mode, sandboxed iframe…) */
  }
  return memoryStorage();
}

export const library = new Library(browserStorage());
