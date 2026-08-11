import { useId, useMemo } from 'react';
import type { SkinProps } from '../types';
import { effectivePalette, paletteVars } from '../palette';
import {
  CANVAS,
  CENTRE,
  EYE,
  RING,
  frameOutline,
  fractures,
  lens,
  pane,
  ticks
} from './geometry';
import styles from './ApertureSkin.module.css';

export const APERTURE_CANVAS = CANVAS;
export const APERTURE_OPTIC_CENTRE = CENTRE;

/**
 * §3.1 — an optical mechanism rather than a body: a faceted transparent frame
 * holding a graduated ring, holding a single slit eye. Three depth layers, and
 * they are what make it read as a mechanism, so nothing here may collapse them
 * into one.
 *
 * **Why this is five stacked SVGs rather than one.** The frame drifts, the ring
 * counter-rotates and the eye breathes, all at different periods. Animating
 * three `<g>` elements inside a single SVG re-rasterises that SVG's whole
 * filter graph on every frame: measured at 1.61% CPU, five times the budget.
 * Each moving part is its own element instead, so each is a composited layer
 * the GPU transforms for free and no filter is ever re-evaluated. This is the
 * same finding as the ovoid's halo, applied from the start.
 *
 * The layer stack of §2 is unchanged by that split — it just runs across five
 * elements instead of one.
 */
export default function ApertureSkin({ palette, mode }: SkinProps): JSX.Element {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const p = effectivePalette(palette, mode);

  const geo = useMemo(
    () => ({
      ribOuter: frameOutline(0),
      ribInner: frameOutline(7, 0.72),
      ribBevel: frameOutline(1.2, 0.96),
      ribInnerBevel: frameOutline(8.2, 0.7),
      panes: [0, 1, 2, 3].map((q) => pane(q as 0 | 1 | 2 | 3)),
      cracks: fractures(),
      tickMarks: ticks(),
      eye: lens(EYE.width, EYE.height),
      plate: lens(EYE.width * 1.3, EYE.height * 1.62)
    }),
    []
  );

  const box = `0 0 ${CANVAS.width} ${CANVAS.height}`;

  return (
    <div className={styles.skin} style={paletteVars(p, CANVAS)}>
      {/* ---- frame · drifts ±3° over 12 s ------------------------------ */}
      <div className={styles.frame} data-motion="frame">
        <svg className={styles.svg} viewBox={box} role="presentation" focusable="false">
          <defs>
            <clipPath id={`${uid}-bounds`}>
              <path d={geo.ribOuter} />
            </clipPath>

            {/* Four tonal steps across the rib: core shadow, base, mid-light,
                and the rim layer 8 lays on top. */}
            <linearGradient id={`${uid}-rib`} x1="0.12" y1="0" x2="0.9" y2="1">
              <stop offset="0" stopColor="var(--p-shell-hi)" />
              <stop offset="0.4" stopColor="var(--p-shell-lo)" />
              <stop offset="1" stopColor="var(--p-shell-core)" />
            </linearGradient>

            {/* Glass: barely there, and brighter toward the eye. */}
            <radialGradient id={`${uid}-glass`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="var(--p-light)" stopOpacity="0.16" />
              <stop offset="0.6" stopColor="var(--p-light)" stopOpacity="0.06" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.02" />
            </radialGradient>

            <linearGradient id={`${uid}-rim`} x1="0.1" y1="1" x2="0.9" y2="0">
              <stop offset="0" stopColor="#EAF6FB" stopOpacity="0.04" />
              <stop offset="0.34" stopColor="#FFFFFF" stopOpacity="0.8" />
              <stop offset="0.7" stopColor="#CFE2EA" stopOpacity="0.24" />
              <stop offset="1" stopColor="#CFE2EA" stopOpacity="0" />
            </linearGradient>

            <filter id={`${uid}-grain`} x="-10%" y="-10%" width="120%" height="120%">
              <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="11" />
              <feColorMatrix type="saturate" values="0" result="noise" />
              {/* `feTurbulence` is a generator: it fills the whole filter
                  region regardless of the source, so without clipping it to
                  the source alpha the grain paints a grey rectangle over the
                  unit instead of a texture on the ribs. */}
              <feComposite in="noise" in2="SourceGraphic" operator="in" />
            </filter>
          </defs>

          {/* 2 · glass panes. Transparent on purpose — the desktop shows
              through the mechanism, which is what stops it reading as a card. */}
          <g data-layer="2">
            {geo.panes.map((d, i) => (
              <path
                key={`pane-${i}`}
                d={d}
                fill={`url(#${uid}-glass)`}
                opacity={i === 1 ? 0.55 : i === 3 ? 0.85 : 0.7}
              />
            ))}
          </g>

          {/* 1 · silhouette base · 2 · form shading · 3 · two-stroke ribs */}
          <g data-layer="1-5">
            {/* Outer shape minus inner shape: a frame with real thickness
                rather than a stroked outline. */}
            {/* 1 · silhouette base — the flat darkest value, from the palette
                so a different persona repaints it. */}
            <path
              d={`${geo.ribOuter} ${geo.ribInner}`}
              fillRule="evenodd"
              fill="var(--p-shell-core)"
            />
            <path
              d={`${geo.ribOuter} ${geo.ribInner}`}
              fillRule="evenodd"
              fill={`url(#${uid}-rib)`}
            />

            {/* Every edge is two strokes: a dark line and a light one 1 px
                perpendicular. One line is a scratch; two are an edge. */}
            <path
              d={geo.ribOuter}
              fill="none"
              stroke="var(--p-shell-core)"
              strokeWidth="1.1"
              strokeOpacity="0.95"
            />
            <path
              d={geo.ribBevel}
              fill="none"
              stroke="#9FB4BE"
              strokeWidth="0.7"
              strokeOpacity="0.4"
            />
            <path
              d={geo.ribInner}
              fill="none"
              stroke="#000000"
              strokeWidth="1.6"
              strokeOpacity="0.5"
            />
            <path
              d={geo.ribInnerBevel}
              fill="none"
              stroke="#A8BCC6"
              strokeWidth="0.7"
              strokeOpacity="0.34"
            />

            {/* Contact occlusion where the ribs meet the glass. */}
            <path
              d={geo.ribInner}
              fill="none"
              stroke="#000000"
              strokeWidth="4"
              strokeOpacity="0.22"
              clipPath={`url(#${uid}-bounds)`}
            />

            {/* 4 · material grain over the ribs only. */}
            <path
              d={`${geo.ribOuter} ${geo.ribInner}`}
              fillRule="evenodd"
              fill="#FFFFFF"
              filter={`url(#${uid}-grain)`}
              opacity="0.05"
              style={{ mixBlendMode: 'overlay' }}
            />

            {/* 5 · trim and 8 · rim, clipped so neither can overhang a
                chamfered corner. */}
            <g clipPath={`url(#${uid}-bounds)`}>
              <path
                d={`M ${CENTRE.x + 9} ${CENTRE.y - 62} L ${CENTRE.x + 37} ${CENTRE.y - 32}`}
                stroke="var(--p-trim)"
                strokeWidth="2.4"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d={`M ${CENTRE.x + 9} ${CENTRE.y - 63.4} L ${CENTRE.x + 37} ${CENTRE.y - 33.4}`}
                stroke="var(--p-trim-lit)"
                strokeWidth="0.8"
                strokeOpacity="0.8"
                fill="none"
              />
              <path
                d={`M ${CENTRE.x + 10} ${CENTRE.y - 59.6} L ${CENTRE.x + 38} ${CENTRE.y - 29.6}`}
                stroke="#000000"
                strokeWidth="2"
                strokeOpacity="0.4"
                fill="none"
              />
              {/* The one asymmetric wear mark. */}
              <path
                d={`M ${CENTRE.x + 21} ${CENTRE.y - 49} l 7 7`}
                stroke="var(--p-accent)"
                strokeWidth="3"
                strokeOpacity="0.75"
                strokeLinecap="round"
                fill="none"
              />

              {/* Rim light: three runs of different weight along the two edges
                  facing the light, never one uniform outline. */}
              <path
                d={`M ${CENTRE.x - 47} ${CENTRE.y - 17} L ${CENTRE.x - 20} ${CENTRE.y - 49}`}
                fill="none"
                stroke={`url(#${uid}-rim)`}
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d={`M ${CENTRE.x - 38} ${CENTRE.y - 28} L ${CENTRE.x - 28} ${CENTRE.y - 40}`}
                fill="none"
                stroke="#F2FAFE"
                strokeWidth="1.9"
                strokeOpacity="0.42"
                strokeLinecap="round"
              />
              <path
                d={`M ${CENTRE.x - 52} ${CENTRE.y + 16} L ${CENTRE.x - 36} ${CENTRE.y + 44}`}
                fill="none"
                stroke="#BCD2DC"
                strokeWidth="0.9"
                strokeOpacity="0.18"
                strokeLinecap="round"
              />
            </g>
          </g>

          {/* 3b · fractures. Barely visible until the mechanism loses it. */}
          <g className={styles.cracks} data-layer="3b">
            {geo.cracks.map((d, i) => (
              <g key={`crack-${i}`}>
                <path d={d} fill="none" stroke="#000000" strokeWidth="1.4" strokeOpacity="0.5" />
                <path
                  d={d}
                  fill="none"
                  stroke="#DCEEF5"
                  strokeWidth="0.7"
                  strokeOpacity="0.9"
                  transform="translate(0.6 -0.6)"
                />
                <path
                  className={styles.crackLit}
                  d={d}
                  fill="none"
                  stroke="var(--p-light-core)"
                  strokeWidth="0.8"
                />
              </g>
            ))}
          </g>
        </svg>
      </div>

      {/* ---- tick ring · counter-rotates, 40 s per turn ---------------- */}
      <div className={styles.ring} data-motion="ring">
        <svg className={styles.svg} viewBox={box} role="presentation" focusable="false">
          {geo.tickMarks.map((tick, i) => (
            <g key={`tick-${i}`}>
              <path
                d={tick.d}
                stroke="#05090B"
                strokeWidth={tick.width + 0.8}
                strokeOpacity="0.55"
                transform="translate(0.6 0.6)"
              />
              <path
                d={tick.d}
                stroke="var(--p-trim)"
                strokeWidth={tick.width}
                strokeOpacity={tick.opacity}
              />
            </g>
          ))}
          {/* The third depth layer. */}
          <circle
            cx={CENTRE.x}
            cy={CENTRE.y}
            r={RING.inner + 1}
            fill="none"
            stroke="#000000"
            strokeWidth="1"
            strokeOpacity="0.3"
          />
          <circle
            cx={CENTRE.x}
            cy={CENTRE.y}
            r={RING.inner}
            fill="none"
            stroke="#9FB4BE"
            strokeWidth="1"
            strokeOpacity="0.22"
          />
        </svg>
      </div>

      {/* ---- backing plate · static ------------------------------------ */}
      {/* The one opaque element in the unit: the frame is glass, and over a
          busy wallpaper the eye has nothing to read against without it. */}
      <div className={styles.plate}>
        <svg className={styles.svg} viewBox={box} role="presentation" focusable="false">
          <g transform={`translate(${CENTRE.x} ${CENTRE.y})`}>
            <path d={geo.plate} fill="#0A1416" />
            <path d={geo.plate} fill="none" stroke="#000000" strokeWidth="2.4" strokeOpacity="0.5" />
            <path
              d={geo.plate}
              fill="none"
              stroke="#7E9098"
              strokeWidth="0.7"
              strokeOpacity="0.38"
              transform="translate(0 -0.8)"
            />
          </g>
        </svg>
      </div>

      {/* ---- 0 + 6 · eye · aperture breathing -------------------------- */}
      <div className={`${styles.eye} ${styles.emissive}`} data-motion="eye">
        <svg className={styles.svg} viewBox={box} role="presentation" focusable="false">
          <defs>
            {/* White at the core, hue only outward — real light saturates to
                white at intensity. */}
            <radialGradient id={`${uid}-eyecore`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="#FFFFFF" />
              <stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0.9" />
              <stop offset="1" stopColor="var(--p-light-core)" stopOpacity="0" />
            </radialGradient>

            <radialGradient id={`${uid}-eyebody`} cx="0.5" cy="0.5" r="0.55">
              <stop offset="0" stopColor="var(--p-light-core)" />
              <stop offset="0.45" stopColor="var(--p-light)" />
              <stop offset="1" stopColor="var(--p-light-dim)" />
            </radialGradient>

            <radialGradient id={`${uid}-atmos`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="var(--p-light)" stopOpacity="0.5" />
              <stop offset="1" stopColor="var(--p-light)" stopOpacity="0" />
            </radialGradient>

            <filter id={`${uid}-bloom`} x="-90%" y="-260%" width="280%" height="620%">
              <feGaussianBlur stdDeviation="3" />
            </filter>

            <filter id={`${uid}-halo`} x="-160%" y="-460%" width="420%" height="1020%">
              <feGaussianBlur stdDeviation="14" />
            </filter>
          </defs>

          {/* 0 · wide atmospheric halo */}
          <ellipse
            cx={CENTRE.x}
            cy={CENTRE.y}
            rx={EYE.width * 1.1}
            ry={EYE.height * 1.9}
            fill={`url(#${uid}-atmos)`}
            filter={`url(#${uid}-halo)`}
            opacity="0.3"
          />

          <g transform={`translate(${CENTRE.x} ${CENTRE.y})`}>
            <path d={geo.eye} fill="var(--p-light)" filter={`url(#${uid}-halo)`} opacity="0.42" />
            <path d={geo.eye} fill="var(--p-light)" filter={`url(#${uid}-bloom)`} opacity="0.62" />
            <path d={geo.eye} fill={`url(#${uid}-eyebody)`} />
            <path
              d={geo.eye}
              fill={`url(#${uid}-eyecore)`}
              transform="scale(0.52 0.42)"
              opacity="0.92"
            />
          </g>
        </svg>
      </div>

      {/* ---- 7 · light spill onto ribs, ring and panes ------------------ */}
      {/* Its own element so it can `screen` against the layers beneath it —
          inside the eye's SVG it would only ever see the eye. */}
      <div
        className={`${styles.spill} ${styles.emissive}`}
        style={{ clipPath: `path("${geo.ribOuter}")` }}
      >
        <svg className={styles.svg} viewBox={box} role="presentation" focusable="false">
          <defs>
            <radialGradient id={`${uid}-spillgrad`} cx="0.5" cy="0.5" r="0.5">
              <stop offset="0" stopColor="var(--p-light)" stopOpacity="0.95" />
              <stop offset="0.4" stopColor="var(--p-light)" stopOpacity="0.3" />
              <stop offset="1" stopColor="var(--p-light)" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse
            cx={CENTRE.x}
            cy={CENTRE.y}
            rx={EYE.width * 1.5}
            ry={EYE.height * 2.6}
            fill={`url(#${uid}-spillgrad)`}
            opacity="0.2"
          />
        </svg>
      </div>
    </div>
  );
}
