import { describe, expect, it } from 'vitest';
import {
  CENTRE,
  FRAME,
  RIB_INSET,
  RING,
  RING_CLEARANCE,
  frameOutline,
  fractures,
  ribLine,
  ticks
} from '@renderer/skins/aperture/geometry';

/**
 * The aperture's geometry is pure computation, so it is the part worth
 * testing. Two properties matter and both broke once already: the ring has to
 * stay clear of the ribs, or the three depth planes collapse into two; and
 * trim and rim have to stay *on* the metal, or they read as scratches across
 * the glass.
 */

const numbers = (d: string): number[] => (d.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);

describe('the ring is a free-standing plane', () => {
  it('leaves clear air between its outermost tick and the nearest rib', () => {
    expect(RING_CLEARANCE).toBeGreaterThanOrEqual(8);
    expect(RING.radius + RING_CLEARANCE).toBe(FRAME.halfW - RIB_INSET);
  });

  it('keeps the inner hairline inside the tick ring — a third plane, not a second', () => {
    expect(RING.inner).toBeLessThan(RING.radius - 8);
  });
});

describe('ticks', () => {
  const marks = ticks();

  it('are not evenly graduated — an even circle reads as a logo', () => {
    const lengths = new Set(marks.map((t) => t.d));
    expect(lengths.size).toBe(marks.length);
    const opacities = new Set(marks.map((t) => Math.round(t.opacity * 100)));
    expect(opacities.size).toBeGreaterThan(6);
  });

  it('leaves gaps in the ring', () => {
    // Three arcs are omitted, so the count falls short of the requested one.
    expect(marks.length).toBeLessThan(48);
    expect(marks.length).toBeGreaterThan(30);
  });

  it('never reaches past the ring radius', () => {
    for (const mark of marks) {
      for (const [x, y] of pairs(numbers(mark.d))) {
        expect(Math.hypot(x - CENTRE.x, y - CENTRE.y)).toBeLessThanOrEqual(RING.radius + 0.01);
      }
    }
  });
});

describe('ribLine', () => {
  it('stays inside the frame on every edge', () => {
    for (const edge of [0, 1, 2, 3] as const) {
      for (const [x, y] of pairs(numbers(ribLine(edge, 0.05, 0.95)))) {
        // Inside the rhombus: |dx|/halfW + |dy|/halfH <= 1.
        const inside =
          Math.abs(x - CENTRE.x) / FRAME.halfW + Math.abs(y - CENTRE.y) / FRAME.halfH;
        expect(inside).toBeLessThanOrEqual(1);
      }
    }
  });

  it('offsets inward, never outward', () => {
    const deep = numbers(ribLine(0, 0.5, 0.5, 20));
    const shallow = numbers(ribLine(0, 0.5, 0.5, 0));
    const dDeep = Math.hypot((deep[0] ?? 0) - CENTRE.x, (deep[1] ?? 0) - CENTRE.y);
    const dShallow = Math.hypot((shallow[0] ?? 0) - CENTRE.x, (shallow[1] ?? 0) - CENTRE.y);
    expect(dDeep).toBeLessThan(dShallow);
  });
});

describe('paths', () => {
  it('emit finite coordinates only', () => {
    const paths = [frameOutline(0), frameOutline(RIB_INSET, 0.72), ...fractures(), ribLine(1, 0, 1)];
    for (const d of paths) {
      expect(d).not.toMatch(/NaN|Infinity/);
      expect(numbers(d).every(Number.isFinite)).toBe(true);
    }
  });
});

function pairs(values: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i + 1 < values.length; i += 2) out.push([values[i] as number, values[i + 1] as number]);
  return out;
}
