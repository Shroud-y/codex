/**
 * Geometry for the `aperture` skin — an optical mechanism, not a body. Kept
 * local to the skin: §3 asks explicitly that skins not start accumulating a
 * shared widget library this early.
 */

export const CANVAS = { width: 150, height: 175 };
export const CENTRE = { x: 75, y: 88 };

/** Half-diagonals of the rhombus, and how far each corner is chamfered. */
export const FRAME = { halfW: 68, halfH: 75, chamfer: 13 };

/** How deep the rib is, measured inward from the outer edge. */
export const RIB_INSET = 7;

/**
 * The ring is a free-standing circle inside the frame, and the gap is the
 * point: laid tight against the ribs it merges into them and three depth
 * planes collapse into two. The frame's inner edge crosses the horizontal
 * axis at `halfW - RIB_INSET` = 61, so a radius of 52 leaves 9 px of clear
 * air at the tightest point.
 */
export const RING = { radius: 52, inner: 39 };

/** Clear distance between the outermost tick and the nearest rib. */
export const RING_CLEARANCE = FRAME.halfW - RIB_INSET - RING.radius;
export const EYE = { width: 62, height: 22 };

type Point = [number, number];

const fmt = (n: number): string => n.toFixed(2);

function polygon(points: Point[]): string {
  return `${points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${fmt(x)} ${fmt(y)}`).join(' ')} Z`;
}

/**
 * A rhombus standing on its point with every corner cut back rather than
 * sharp. `inset` shrinks it toward the centre, which is how the ribs get their
 * thickness — an outer and an inner run of the same shape.
 */
export function frameOutline(inset = 0, chamferScale = 1): string {
  const w = FRAME.halfW - inset;
  const h = FRAME.halfH - inset;
  const c = FRAME.chamfer * chamferScale;
  // The chamfer is applied along each edge, so it moves in both axes in
  // proportion to that edge's slope.
  const cx = (c * w) / Math.hypot(w, h);
  const cy = (c * h) / Math.hypot(w, h);

  const top: Point = [CENTRE.x, CENTRE.y - h];
  const right: Point = [CENTRE.x + w, CENTRE.y];
  const bottom: Point = [CENTRE.x, CENTRE.y + h];
  const left: Point = [CENTRE.x - w, CENTRE.y];

  return polygon([
    [top[0] + cx, top[1] + cy],
    [right[0] - cx, right[1] - cy],
    [right[0] - cx, right[1] + cy],
    [bottom[0] + cx, bottom[1] - cy],
    [bottom[0] - cx, bottom[1] - cy],
    [left[0] + cx, left[1] + cy],
    [left[0] + cx, left[1] - cy],
    [top[0] - cx, top[1] + cy]
  ]);
}

/**
 * A full quadrant wedge, used as a clip when one rib has to be thicker than
 * the others (§4: uniform detail is what makes a shape read as a logo).
 */
export function quadrant(q: 0 | 1 | 2 | 3): string {
  return pane(q, -6);
}

/** One of the four triangular glass faces, as a wedge from the centre. */
export function pane(quadrant: 0 | 1 | 2 | 3, inset = 6): string {
  const w = FRAME.halfW - inset;
  const h = FRAME.halfH - inset;
  const corners: Point[] = [
    [CENTRE.x, CENTRE.y - h],
    [CENTRE.x + w, CENTRE.y],
    [CENTRE.x, CENTRE.y + h],
    [CENTRE.x - w, CENTRE.y]
  ];
  const a = corners[quadrant] as Point;
  const b = corners[(quadrant + 1) % 4] as Point;
  return polygon([[CENTRE.x, CENTRE.y], a, b]);
}

/**
 * A run along the centre-line of one rib, `t` from 0 to 1 between its two
 * corners. Trim and rim light are placed with this rather than by hand: a
 * hand-placed diagonal drifts off the metal the moment the frame's
 * proportions change, and then reads as a scratch across the glass.
 *
 * Edges are numbered clockwise from the top corner: 0 top→right, 1
 * right→bottom, 2 bottom→left, 3 left→top.
 */
export function ribLine(edge: 0 | 1 | 2 | 3, t0: number, t1: number, offset = RIB_INSET / 2): string {
  const corners: Point[] = [
    [CENTRE.x, CENTRE.y - FRAME.halfH],
    [CENTRE.x + FRAME.halfW, CENTRE.y],
    [CENTRE.x, CENTRE.y + FRAME.halfH],
    [CENTRE.x - FRAME.halfW, CENTRE.y]
  ];
  const a = corners[edge] as Point;
  const b = corners[(edge + 1) % 4] as Point;

  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);

  // Whichever perpendicular points at the centre is the inward one.
  let nx = -dy / len;
  let ny = dx / len;
  if ((CENTRE.x - a[0]) * nx + (CENTRE.y - a[1]) * ny < 0) {
    nx = -nx;
    ny = -ny;
  }

  const at = (t: number): Point => [
    a[0] + dx * t + nx * offset,
    a[1] + dy * t + ny * offset
  ];

  const [x0, y0] = at(t0);
  const [x1, y1] = at(t1);
  return `M ${fmt(x0)} ${fmt(y0)} L ${fmt(x1)} ${fmt(y1)}`;
}

/**
 * Hairline cracks radiating from one corner. Deterministic, and deliberately
 * short of the frame edge so they read as damage to the glass rather than as
 * a second wireframe.
 */
export function fractures(): string[] {
  const origin: Point = [CENTRE.x - FRAME.halfW * 0.62, CENTRE.y - FRAME.halfH * 0.36];
  const runs: { angle: number; length: number; kinkAt: number; kink: number }[] = [
    { angle: 18, length: 54, kinkAt: 0.45, kink: -13 },
    { angle: 38, length: 41, kinkAt: 0.55, kink: 16 },
    { angle: -6, length: 33, kinkAt: 0.6, kink: 11 },
    { angle: 57, length: 22, kinkAt: 0.5, kink: -9 }
  ];

  return runs.map(({ angle, length, kinkAt, kink }) => {
    const a = (angle * Math.PI) / 180;
    const midLength = length * kinkAt;
    const mid: Point = [origin[0] + Math.cos(a) * midLength, origin[1] + Math.sin(a) * midLength];
    const b = ((angle + kink) * Math.PI) / 180;
    const rest = length - midLength;
    const end: Point = [mid[0] + Math.cos(b) * rest, mid[1] + Math.sin(b) * rest];
    return `M ${fmt(origin[0])} ${fmt(origin[1])} L ${fmt(mid[0])} ${fmt(mid[1])} L ${fmt(
      end[0]
    )} ${fmt(end[1])}`;
  });
}

export interface Tick {
  d: string;
  opacity: number;
  width: number;
}

/**
 * The graduated ring. §3.1 is emphatic that it must not be evenly graduated —
 * an even circle of identical ticks reads instantly as a logo — so lengths and
 * opacities vary and two or three arcs are missing entirely.
 */
export function ticks(count = 48): Tick[] {
  const gaps: [number, number][] = [
    [22, 38],
    [104, 118],
    [246, 253]
  ];
  const out: Tick[] = [];

  for (let i = 0; i < count; i += 1) {
    const deg = (i / count) * 360;
    if (gaps.some(([from, to]) => deg >= from && deg <= to)) continue;

    // Deterministic pseudo-variation: no RNG, so the ring is identical on
    // every mount and the static layer can be cached.
    const wobble = Math.sin(i * 2.399) * 0.5 + 0.5;
    const long = i % 6 === 0;
    const length = long ? 9 + wobble * 2 : 4 + wobble * 4;
    const rad = (deg * Math.PI) / 180;
    const from = RING.radius - length;
    const to = RING.radius;

    out.push({
      d: `M ${fmt(CENTRE.x + Math.cos(rad) * from)} ${fmt(
        CENTRE.y + Math.sin(rad) * from
      )} L ${fmt(CENTRE.x + Math.cos(rad) * to)} ${fmt(CENTRE.y + Math.sin(rad) * to)}`,
      opacity: 0.28 + wobble * 0.45 + (long ? 0.2 : 0),
      width: long ? 1.6 : 1
    });
  }

  return out;
}

/**
 * The eye: a lenticular slit, pointed at both ends, horizontal. Its axis
 * deliberately opposes the frame's vertical one — that opposition is the
 * composition.
 */
export function lens(width: number, height: number): string {
  const hw = width / 2;
  const hh = height / 2;
  return [
    `M ${fmt(-hw)} 0`,
    `C ${fmt(-hw * 0.55)} ${fmt(-hh)} ${fmt(hw * 0.55)} ${fmt(-hh)} ${fmt(hw)} 0`,
    `C ${fmt(hw * 0.55)} ${fmt(hh)} ${fmt(-hw * 0.55)} ${fmt(hh)} ${fmt(-hw)} 0`,
    'Z'
  ].join(' ');
}
