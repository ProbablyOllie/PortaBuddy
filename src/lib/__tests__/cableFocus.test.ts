import { describe, expect, it } from 'vitest';
import { AUTO_FOCUS_THRESHOLD, effectiveMode, focusedCables, migrateCableMode } from '../cableFocus';
import type { Cable } from '../types';

const cable = (id: string, a: string, b: string): Cable => ({
  id,
  label: id,
  a: { deviceId: a, portId: `${a}:${id}` },
  b: { deviceId: b, portId: `${b}:${id}` },
  type: 'Cat6',
  color: '#000000',
  lengthM: '',
  notes: '',
});

describe('cable display', () => {
  it('Auto shows everything until the rack gets busy', () => {
    expect(effectiveMode('auto', AUTO_FOCUS_THRESHOLD)).toBe('all');
    expect(effectiveMode('auto', AUTO_FOCUS_THRESHOLD + 1)).toBe('focus');
    expect(effectiveMode('off', 3)).toBe('off');
  });

  it('focuses on the selected or hovered device and the selected cable', () => {
    const cables = [cable('c1', 'pp', 'sw'), cable('c2', 'srv', 'sw'), cable('c3', 'srv', 'pdu')];
    expect([...focusedCables(cables, { deviceIds: ['pp', null] })]).toEqual(['c1']);
    expect([...focusedCables(cables, { deviceIds: [null, 'sw'] })].sort()).toEqual(['c1', 'c2']);
    expect([...focusedCables(cables, { deviceIds: [], cableId: 'c3' })]).toEqual(['c3']);
  });

  it('carries over the old Show / Dim / Hide setting', () => {
    expect(['show', 'dim', 'hide', undefined, 'focus'].map(migrateCableMode)).toEqual(['all', 'focus', 'off', 'auto', 'focus']);
  });
});
