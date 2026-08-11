import { describe, expect, it } from 'vitest';
import { getPersona, personaIds } from '@renderer/personas';
import {
  OVOID_OPTICS,
  OVOID_OPTIC_CENTRE,
  OVOID_PARAMS,
  edgePoint,
  halfWidth,
  ovoidAccent,
  ovoidEdge,
  ovoidOutline,
  ovoidSeam,
  ovoidSeamPart,
  seamTs,
  teardrop,
  yAt
} from '@renderer/skins/ovoid/geometry';

/**
 * The shell form is the one piece of the redesign that is pure computation, so
 * it is the one piece worth testing: everything else is pixels and has the
 * design harness instead. What matters is that generated geometry stays *on*
 * the body under any parameters, because that is what breaks silently when a
 * second persona changes the proportions.
 */

const p = OVOID_PARAMS;

describe('halfWidth', () => {
  it('is widest at the belly', () => {
    const belly = halfWidth(p, p.bellyT);
    expect(belly).toBeCloseTo(p.bellyHalf, 6);
    for (const t of [0, 0.2, 0.4, 0.8, 1]) {
      expect(halfWidth(p, t)).toBeLessThanOrEqual(belly + 1e-9);
    }
  });

  it('leaves the base wider than the apex — an ovoid, not an egg on its point', () => {
    expect(halfWidth(p, 1)).toBeCloseTo(p.baseHalf, 6);
    expect(halfWidth(p, 1)).toBeGreaterThan(halfWidth(p, 0));
  });

  it('swells monotonically out of the apex and draws back in below the belly', () => {
    for (let t = 0; t < p.bellyT; t += 0.02) {
      expect(halfWidth(p, t + 0.02)).toBeGreaterThan(halfWidth(p, t));
    }
    for (let t = p.bellyT; t < 0.98; t += 0.02) {
      expect(halfWidth(p, t + 0.02)).toBeLessThan(halfWidth(p, t));
    }
  });

  it('clamps rather than extrapolating outside 0..1', () => {
    expect(halfWidth(p, -3)).toBe(halfWidth(p, 0));
    expect(halfWidth(p, 4)).toBe(halfWidth(p, 1));
  });
});

describe('edgePoint', () => {
  it('breaks the mirror by exactly rightBias', () => {
    const [xr] = edgePoint(p, 0.5, 1);
    const [xl] = edgePoint(p, 0.5, -1);
    expect(xr - p.cx).toBeCloseTo((p.cx - xl) * p.rightBias, 6);
  });

  it('never lands outside the unit box', () => {
    for (let t = 0; t <= 1; t += 0.05) {
      for (const side of [1, -1] as const) {
        const [x, y] = edgePoint(p, t, side);
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(150);
        expect(y).toBeGreaterThanOrEqual(p.top);
        expect(y).toBeLessThanOrEqual(p.bottom);
      }
    }
  });
});

describe('paths', () => {
  const numbers = (d: string): number[] =>
    (d.match(/-?\d+(\.\d+)?/g) ?? []).map((n) => Number(n));

  it('emit finite coordinates only', () => {
    const paths = [
      ovoidOutline(p),
      ovoidEdge(p, 0.1, 0.6, -1),
      ovoidSeam(p, 0.6),
      ovoidSeamPart(p, 0.83, 0, 0.46),
      ovoidAccent(p, 0.5, 0.63),
      teardrop(34, 46)
    ];
    for (const d of paths) {
      expect(d.length).toBeGreaterThan(0);
      expect(d).not.toMatch(/NaN|Infinity/);
      expect(numbers(d).every(Number.isFinite)).toBe(true);
    }
  });

  it('closes the silhouette', () => {
    expect(ovoidOutline(p).trimEnd().endsWith('Z')).toBe(true);
  });

  it('leaves rim-light runs open — a closed outline reads as a sticker', () => {
    expect(ovoidEdge(p, 0.06, 0.55, -1)).not.toMatch(/Z$/);
  });

  it('keeps seams inside the silhouette at the height they cross', () => {
    for (const t of seamTs(p)) {
      const [left, y] = edgePoint(p, t, -1);
      const [right] = edgePoint(p, t, 1);
      const xs = numbers(ovoidSeam(p, t)).filter((_, i) => i % 2 === 0);
      for (const x of xs) {
        expect(x).toBeGreaterThanOrEqual(left);
        expect(x).toBeLessThanOrEqual(right);
      }
      expect(y).toBeGreaterThan(p.top);
    }
  });

  it('places every seam below the optics and above the trim band', () => {
    const opticY = yAt(p, OVOID_OPTICS.atT);
    for (const t of seamTs(p)) {
      expect(yAt(p, t)).toBeGreaterThan(opticY);
      expect(t).toBeLessThan(0.83);
    }
    expect(seamTs(p)).toHaveLength(p.panelCount);
  });

  it('runs the heavy part of the trim band down the left side only', () => {
    const xs = numbers(ovoidSeamPart(p, 0.83, 0, 0.46)).filter((_, i) => i % 2 === 0);
    const mid = p.cx;
    expect(Math.max(...xs)).toBeLessThan(mid);
  });
});

describe('optic centre', () => {
  it('is what the name label is aligned to, so it must sit on the optics', () => {
    expect(OVOID_OPTIC_CENTRE.x).toBe(OVOID_PARAMS.cx);
    expect(OVOID_OPTIC_CENTRE.y).toBeCloseTo(yAt(OVOID_PARAMS, OVOID_OPTICS.atT), 6);
    // Inside the canvas, and above the trim band.
    expect(OVOID_OPTIC_CENTRE.y).toBeGreaterThan(OVOID_PARAMS.top);
    expect(OVOID_OPTIC_CENTRE.y).toBeLessThan(yAt(OVOID_PARAMS, 0.83));
  });
});

describe('persona registry', () => {
  it('ships exactly one persona', () => {
    expect(personaIds()).toEqual(['codex']);
  });

  it('falls back rather than leaving the overlay blank', () => {
    expect(getPersona(undefined).id).toBe('codex');
    expect(getPersona('a-persona-that-does-not-exist').id).toBe('codex');
  });

  it('is deliberately asymmetric — perfect symmetry reads as a logo', () => {
    expect(OVOID_PARAMS.rightBias).not.toBe(1);
    expect(OVOID_OPTICS.rightBias).not.toBe(1);
  });
});
