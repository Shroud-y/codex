/** Materials shade differently on purpose (§4.2). */
export type Material = 'metal' | 'ceramic';

export const OVOID_CANVAS = { width: 150, height: 175 };

/** Geometry of the shell, in the skin's own canvas coordinates. */
export interface OvoidParams {
  /** Vertical axis of the shell. */
  cx: number;
  /** Apex and base. */
  top: number;
  bottom: number;
  /** Half-width immediately below the apex. */
  apexHalf: number;
  /** Widest half-width. */
  bellyHalf: number;
  /** Half-width where the shell meets its base. */
  baseHalf: number;
  /** 0..1 — where the belly sits between `top` and `bottom`. */
  bellyT: number;
  /**
   * The right half is scaled by this. §4.2 asks for deliberate asymmetry:
   * exactly 1 reads as a corporate mark, so never use it.
   */
  rightBias: number;
  /** Number of panel seams following the shell curvature. */
  panelCount: number;
}

export interface OpticSpec {
  count: 1 | 2;
  shape: 'teardrop';
  arrangement: 'paired' | 'single';
  /** Height of one optic; width follows the shape's ratio. */
  size: number;
  /** Centre-to-axis distance for `paired`. */
  spread: number;
  /** Vertical position along the shell, 0..1 from apex to base. */
  atT: number;
  /** Inward-down tilt in degrees, mirrored across the axis. */
  tiltDeg: number;
  /** §4.5 — one optic is fractionally brighter than its twin. */
  rightBias: number;
}

/** §4.5 — the shell itself. Skin-local: nothing outside this folder needs it. */
export const OVOID_PARAMS: OvoidParams = {
  cx: 75,
  top: 34,
  bottom: 166,
  apexHalf: 18,
  bellyHalf: 55,
  baseHalf: 40,
  bellyT: 0.6,
  // Never 1 (§4.2). The right flank carries ~3% more mass.
  rightBias: 1.03,
  panelCount: 3
};

export const OVOID_OPTICS: OpticSpec = {
  count: 2,
  shape: 'teardrop',
  arrangement: 'paired',
  size: 40,
  spread: 16,
  atT: 0.44,
  tiltDeg: 28,
  // §4.5 — the right optic runs fractionally hot.
  rightBias: 1.06
};

export const OVOID_MATERIAL: Material = 'metal';

/**
 * Parametric path generators for the `ovoid` shell form.
 *
 * Everything — outline, seams, trim arcs, rim-light segments — derives from a
 * single `halfWidth(t)` function. That is the point: a seam generated from the
 * same function as the outline always meets the edge exactly, at any set of
 * parameters, which is what stops the panel lines drifting off the body when a
 * persona changes its proportions.
 */

const SAMPLES = 44;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Half-width of the shell at `t`, 0 at the apex and 1 at the base. */
export function halfWidth(p: OvoidParams, t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  if (clamped <= p.bellyT) {
    // Swells quickly out of the apex, easing into the belly.
    const u = clamped / p.bellyT;
    return lerp(p.apexHalf, p.bellyHalf, Math.sin((u * Math.PI) / 2) ** 0.8);
  }
  // Draws back in toward the base, but slowly — this is what makes it read as
  // wider at the base rather than as an egg standing on its point.
  const u = (clamped - p.bellyT) / (1 - p.bellyT);
  return lerp(p.bellyHalf, p.baseHalf, u ** 1.6);
}

export function yAt(p: OvoidParams, t: number): number {
  return p.top + (p.bottom - p.top) * t;
}

/** A point on the contour. `side` is +1 for the right edge, -1 for the left. */
export function edgePoint(p: OvoidParams, t: number, side: 1 | -1): [number, number] {
  const half = halfWidth(p, t) * (side === 1 ? p.rightBias : 1);
  return [p.cx + half * side, yAt(p, t)];
}

type Point = [number, number];

/** Catmull-Rom through the samples, emitted as cubic béziers. */
function smoothPath(points: Point[], closed: boolean): string {
  const n = points.length;
  const at = (i: number): Point => {
    if (closed) return points[(i + n) % n] as Point;
    return points[Math.min(n - 1, Math.max(0, i))] as Point;
  };

  const [x0, y0] = at(0);
  let d = `M ${x0.toFixed(2)} ${y0.toFixed(2)}`;

  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i += 1) {
    const [xp, yp] = at(i - 1);
    const [x1, y1] = at(i);
    const [x2, y2] = at(i + 1);
    const [xn, yn] = at(i + 2);
    const c1x = x1 + (x2 - xp) / 6;
    const c1y = y1 + (y2 - yp) / 6;
    const c2x = x2 - (xn - x1) / 6;
    const c2y = y2 - (yn - y1) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)} ${c2x.toFixed(2)} ${c2y.toFixed(2)} ${x2.toFixed(
      2
    )} ${y2.toFixed(2)}`;
  }

  return closed ? `${d} Z` : d;
}

/**
 * The closed silhouette: right flank down, base, left flank up, apex cap.
 * Two mirrored runs of cubics, as §4.5 asks, with the mirror broken by
 * `rightBias`.
 */
export function ovoidOutline(p: OvoidParams): string {
  const points: Point[] = [];

  for (let i = 0; i <= SAMPLES; i += 1) {
    points.push(edgePoint(p, i / SAMPLES, 1));
  }

  // Base, sagging very slightly so it is not a ruled line.
  const sag = 2.2;
  for (let i = 1; i <= 3; i += 1) {
    const u = i / 4;
    points.push([
      lerp(p.cx + p.baseHalf * p.rightBias, p.cx - p.baseHalf, u),
      p.bottom + Math.sin(u * Math.PI) * sag
    ]);
  }

  for (let i = SAMPLES; i >= 0; i -= 1) {
    points.push(edgePoint(p, i / SAMPLES, -1));
  }

  // Apex cap: the flanks stop at `apexHalf`, this closes over the top. Kept
  // shallow — a tall cap turns the ovoid into a raindrop.
  points.push([p.cx, p.top - p.apexHalf * 0.42]);

  return smoothPath(points, true);
}

/**
 * An open run of the contour between two `t` values — used for rim light,
 * which must be laid on in several overlapping strokes of different width
 * rather than one uniform outline (§4.2).
 */
export function ovoidEdge(p: OvoidParams, t0: number, t1: number, side: 1 | -1): string {
  const steps = Math.max(3, Math.round(Math.abs(t1 - t0) * SAMPLES));
  const points: Point[] = [];
  for (let i = 0; i <= steps; i += 1) {
    points.push(edgePoint(p, lerp(t0, t1, i / steps), side));
  }
  return smoothPath(points, false);
}

/**
 * A panel seam at `t`, following the curvature. `sagRatio` bends it downward
 * so it reads as wrapping around a solid body instead of cutting across a
 * flat one; `skew` shifts the low point off centre so no two are identical.
 */
export function ovoidSeam(p: OvoidParams, t: number, sagRatio = 0.3, skew = 0): string {
  const [xl, y] = edgePoint(p, t, -1);
  const [xr] = edgePoint(p, t, 1);
  // Stop a hair short of the silhouette so the stroke never straddles the edge.
  const inset = 0.015 * (xr - xl);
  const left = xl + inset;
  const right = xr - inset;
  const width = right - left;
  const controlX = left + width * (0.5 + skew);
  const controlY = y + width * sagRatio;
  return `M ${left.toFixed(2)} ${y.toFixed(2)} Q ${controlX.toFixed(2)} ${controlY.toFixed(
    2
  )} ${right.toFixed(2)} ${y.toFixed(2)}`;
}

/** Seam positions, spread across the body below the optics. */
export function seamTs(p: OvoidParams): number[] {
  const ts: number[] = [];
  for (let i = 1; i <= p.panelCount; i += 1) {
    // Below the optics and above the trim band, so nothing collides.
    ts.push(0.5 + (i / (p.panelCount + 1)) * 0.3);
  }
  return ts;
}

/** A partial seam — the trim band is thicker on one side (§4.5). */
export function ovoidSeamPart(
  p: OvoidParams,
  t: number,
  from: number,
  to: number,
  sagRatio = 0.3
): string {
  const [xl, y] = edgePoint(p, t, -1);
  const [xr] = edgePoint(p, t, 1);
  const inset = 0.015 * (xr - xl);
  const left = xl + inset;
  const width = xr - inset - left;
  const points: Point[] = [];
  const steps = 10;
  for (let i = 0; i <= steps; i += 1) {
    const u = lerp(from, to, i / steps);
    // The same quadratic `ovoidSeam` emits, evaluated directly: with the
    // control point at the midpoint x is linear in u, and y sags by 2u(1-u)S.
    points.push([left + width * u, y + 2 * u * (1 - u) * width * sagRatio]);
  }
  return smoothPath(points, false);
}

/**
 * The copper accent block on the right flank: a trapezoid whose corners are
 * pinned to the shell surface, so it stays on the body under any proportions.
 */
export function ovoidAccent(p: OvoidParams, t0: number, t1: number): string {
  const [xOuterTop, yTop] = edgePoint(p, t0, 1);
  const [xOuterBottom, yBottom] = edgePoint(p, t1, 1);
  const innerTop = p.cx + (xOuterTop - p.cx) * 0.5;
  const innerBottom = p.cx + (xOuterBottom - p.cx) * 0.58;
  // Held well inboard of the silhouette: a block that reaches the edge stops
  // reading as a panel bolted to a curved flank and starts reading as a beak.
  return [
    `M ${innerTop.toFixed(2)} ${yTop.toFixed(2)}`,
    `L ${(xOuterTop - 9).toFixed(2)} ${(yTop + 2.4).toFixed(2)}`,
    `L ${(xOuterBottom - 10).toFixed(2)} ${yBottom.toFixed(2)}`,
    `L ${innerBottom.toFixed(2)} ${(yBottom - 2).toFixed(2)}`,
    'Z'
  ].join(' ');
}

/**
 * A teardrop optic centred on the origin, tip pointing down. The caller
 * rotates it into place, mirroring the tilt for the second optic.
 */
export function teardrop(width: number, height: number): string {
  const rx = width / 2;
  const ry = height / 2;
  // Weighted so the mass sits high and the tip is drawn out below.
  return [
    `M 0 ${(-ry).toFixed(2)}`,
    `C ${(rx * 0.62).toFixed(2)} ${(-ry).toFixed(2)} ${rx.toFixed(2)} ${(-ry * 0.5).toFixed(
      2
    )} ${rx.toFixed(2)} ${(ry * 0.1).toFixed(2)}`,
    `C ${rx.toFixed(2)} ${(ry * 0.62).toFixed(2)} ${(rx * 0.42).toFixed(2)} ${(ry * 0.9).toFixed(
      2
    )} 0 ${ry.toFixed(2)}`,
    `C ${(-rx * 0.42).toFixed(2)} ${(ry * 0.9).toFixed(2)} ${(-rx).toFixed(2)} ${(
      ry * 0.62
    ).toFixed(2)} ${(-rx).toFixed(2)} ${(ry * 0.1).toFixed(2)}`,
    `C ${(-rx).toFixed(2)} ${(-ry * 0.5).toFixed(2)} ${(-rx * 0.62).toFixed(2)} ${(-ry).toFixed(
      2
    )} 0 ${(-ry).toFixed(2)}`,
    'Z'
  ].join(' ');
}

/**
 * Where the optic sits, in canvas coordinates. The name label is aligned to
 * this (§1.2), so it is part of the skin's public shape rather than an
 * internal detail.
 */
export const OVOID_OPTIC_CENTRE = {
  x: OVOID_PARAMS.cx,
  y: yAt(OVOID_PARAMS, OVOID_OPTICS.atT)
};
