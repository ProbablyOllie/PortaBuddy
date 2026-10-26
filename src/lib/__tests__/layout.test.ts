import { describe, expect, it } from 'vitest';
import { EMPTY_U_PX, U_PX, rackLayout, spanBox, uAtY } from '../layout';

describe('rackLayout', () => {
  it('keeps every U full height when not compact', () => {
    const l = rackLayout(42, [{ positionU: 40, heightU: 1 }], false);
    expect(l.total).toBe(42 * U_PX);
    expect(l.tops[42]).toBe(0);
    expect(l.tops[1]).toBe(41 * U_PX);
  });

  it('shrinks empty units in compact mode', () => {
    // U42 occupied, U41-U3 empty, U1-U2 a 2U device.
    const l = rackLayout(42, [{ positionU: 42, heightU: 1 }, { positionU: 1, heightU: 2 }], true);
    expect(l.heights[42]).toBe(U_PX);
    expect(l.heights[20]).toBe(EMPTY_U_PX);
    expect(l.total).toBe(3 * U_PX + 39 * EMPTY_U_PX);
    expect(spanBox(l, 1, 2)).toEqual({ top: U_PX + 39 * EMPTY_U_PX, height: 2 * U_PX });
  });

  it('maps a height back to the U under it', () => {
    const l = rackLayout(42, [{ positionU: 42, heightU: 1 }], true);
    expect(uAtY(l, 0)).toBe(42);
    expect(uAtY(l, U_PX - 1)).toBe(42);
    expect(uAtY(l, U_PX)).toBe(41);
    expect(uAtY(l, U_PX + EMPTY_U_PX)).toBe(40);
    expect(uAtY(l, 99999)).toBe(1);
  });
});
