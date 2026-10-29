import { describe, expect, it } from 'vitest';
import { LEGACY_KEY, Library, MAX_SNAPSHOTS, SNAPSHOT_INTERVAL_MS, StorageFullError, memoryStorage, type StorageLike } from '../library';
import { emptyProject } from '../project';
import { timeAgo } from '../time';

function setup() {
  let t = 1_000_000;
  const storage = memoryStorage();
  const lib = new Library(storage, () => t);
  return { lib, storage, advance: (ms: number) => (t += ms), now: () => t };
}

const named = (name: string) => ({ ...emptyProject(), name });

describe('Library', () => {
  it('keeps several projects and reopens the current one', () => {
    const { lib, storage, advance } = setup();
    const a = lib.create(named('Comms room'));
    advance(1000);
    const b = lib.create(named('Server room'));
    lib.setCurrent(a);
    expect(lib.list().map((m) => m.name)).toEqual(['Server room', 'Comms room']);
    const again = new Library(storage);
    expect(again.boot()).toMatchObject({ id: a, project: { name: 'Comms room' } });
    lib.remove(b);
    expect(lib.list()).toHaveLength(1);
    expect(lib.load(b)).toBeNull();
  });

  it('keeps a version every few minutes, capped', () => {
    const { lib, advance } = setup();
    const id = lib.create(named('x'));
    lib.save(id, named('v1'));
    advance(60_000);
    lib.save(id, named('v2')); // too soon for another version
    expect(lib.versions(id).map((v) => v.project.name)).toEqual(['v1']);
    advance(SNAPSHOT_INTERVAL_MS);
    lib.save(id, named('v3'));
    expect(lib.versions(id).map((v) => v.project.name)).toEqual(['v1', 'v3']);
    for (let i = 0; i < MAX_SNAPSHOTS + 5; i++) {
      advance(SNAPSHOT_INTERVAL_MS);
      lib.save(id, named(`n${i}`));
    }
    expect(lib.versions(id)).toHaveLength(MAX_SNAPSHOTS);
    expect(lib.load(id)!.name).toBe(`n${MAX_SNAPSHOTS + 4}`);
  });

  it('tracks edits and file backups', () => {
    const { lib, advance } = setup();
    const id = lib.create(named('x'));
    expect(lib.meta(id)!.fileSavedAt).toBeNull();
    advance(1000);
    lib.markFileSaved(id);
    advance(1000);
    lib.save(id, named('y'));
    const m = lib.meta(id)!;
    expect(m.updatedAt).toBeGreaterThan(m.fileSavedAt!);
    expect(m.name).toBe('y');
  });

  it('frees space from old versions when storage is full, and reports when it still cannot save', () => {
    const inner = memoryStorage();
    let limit = Infinity;
    const used = () => {
      let n = 0;
      for (let i = 0; i < inner.length; i++) n += inner.getItem(inner.key(i)!)!.length;
      return n;
    };
    const tight: StorageLike = {
      getItem: (k) => inner.getItem(k),
      removeItem: (k) => inner.removeItem(k),
      key: (i) => inner.key(i),
      get length() {
        return inner.length;
      },
      setItem: (k, v) => {
        if (used() - (inner.getItem(k)?.length ?? 0) + v.length > limit) throw new Error('QuotaExceededError');
        inner.setItem(k, v);
      },
    };
    let t = 0;
    const lib = new Library(tight, () => t);
    const id = lib.create(named('x'));
    for (let i = 0; i < 10; i++) {
      t += SNAPSHOT_INTERVAL_MS;
      lib.save(id, named(`v${i}`));
    }
    const before = lib.versions(id).length;
    limit = used() + 50; // nearly full: the next save only fits once old versions are dropped
    t += 1000;
    const racks = [1, 2, 3].map((i) => ({ id: `r${i}`, name: 'R'.repeat(150), location: '', heightU: 42 }));
    lib.save(id, { ...named('big'), customTemplates: [], racks });
    expect(lib.load(id)!.racks.map((r) => r.name.length)).toEqual([150, 150, 150]);
    expect(lib.versions(id).length).toBeLessThan(before);
    limit = 10;
    expect(() => lib.save(id, named('too big'))).toThrow(StorageFullError);
  });

  it('imports the project autosaved by older versions, once', () => {
    const { storage } = setup();
    storage.setItem(LEGACY_KEY, JSON.stringify({ version: 2, state: { project: { ...named('Old cab'), version: 2 } } }));
    const lib = new Library(storage);
    const { id, project } = lib.boot();
    expect(project.name).toBe('Old cab');
    expect(lib.versions(id)).toHaveLength(1);
    expect(storage.getItem(LEGACY_KEY)).toBeNull();
    expect(new Library(storage).boot().id).toBe(id);
  });

  it('creates an empty project on first run', () => {
    const { lib } = setup();
    const { id, project } = lib.boot();
    expect(project.racks).toHaveLength(1);
    expect(lib.currentId()).toBe(id);
  });
});

describe('timeAgo', () => {
  it('reads naturally', () => {
    const now = 10_000_000_000;
    expect(timeAgo(now - 10_000, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(timeAgo(now - 3 * 3_600_000, now)).toBe('3 h ago');
    expect(timeAgo(now - 30 * 3_600_000, now)).toBe('yesterday');
  });
});
