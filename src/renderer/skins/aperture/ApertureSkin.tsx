import { useCallback, useId, useMemo, useState } from 'react';
import type { SkinProps } from '../types';
import { effectivePalette, paletteVars } from '../palette';
import {
  CANVAS,
  CENTRE,
  EYE,
  RING,
  RIB_INSET,
  frameOutline,
  fractures,
  lens,
  pane,
  quadrant,
  ribLine,
  ticks
} from './geometry';
import ShaderEye, { shaderEyeSupported } from './ShaderEye';
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
export default function ApertureSkin({
  palette,
  mode,
  speaking,
  reducedMotion,
  unlit = false
}: SkinProps): JSX.Element {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const p = effectivePalette(palette, mode);

  /* Decided once, at first paint: a machine without WebGL2 or half-float
     render targets keeps the SVG eye. An always-on overlay must not lose its
     optic because a driver said no — and the SVG version is a fair fallback
     rather than a placeholder, since it is what shipped. `glFailed` covers the
     rarer case of a driver that passes the probe and then fails to link. */
  const probed = useMemo(() => shaderEyeSupported(), []);
  const [glFailed, setGlFailed] = useState(false);
  const useShader = probed && !glFailed;
  const onGlUnavailable = useCallback(() => setGlFailed(true), []);

  const geo = useMemo(
    () => ({
      ribOuter: frameOutline(0),
      ribInner: frameOutline(RIB_INSET, 0.72),
      ribBevel: frameOutline(1.2, 0.96),
      ribInnerBevel: frameOutline(RIB_INSET + 1.2, 0.7),
      // §4 — one rib carries visibly more metal than the other three.
      ribHeavyInner: frameOutline(RIB_INSET + 5, 0.62),
      heavyQuadrant: quadrant(2),
      // Trim and rim ride the rib centre-lines rather than hand-placed
      // diagonals, so they stay on the metal at any proportions.
      trim: ribLine(0, 0.16, 0.56),
      trimLit: ribLine(0, 0.16, 0.56, RIB_INSET / 2 - 1.3),
      trimShadow: ribLine(0, 0.16, 0.56, RIB_INSET / 2 + 1.4),
      trimHeavy: ribLine(0, 0.16, 0.33),
      wear: ribLine(0, 0.4, 0.46),
      rimMain: ribLine(3, 0.26, 0.74),
      rimHot: ribLine(3, 0.44, 0.6),
      rimLower: ribLine(2, 0.3, 0.56),
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

            <clipPath id={`${uid}-heavy`}>
              <path d={geo.heavyQuadrant} />
            </clipPath>

            {/* Four tonal steps across the rib: core shadow, base, mid-light,
                and the rim layer 8 lays on top. */}
            <linearGradient id={`${uid}-rib`} x1="0.12" y1="0" x2="0.9" y2="1">
              <stop offset="0" stopColor="var(--p-shell-hi)" />
              <stop offset="0.4" stopColor="var(--p-shell-lo)" />
              <stop offset="1" stopColor="var(--p-shell-core)" />
            </linearGradient>

            {/* Glass. The frame exists to be seen through, so this stays
                nearly clear: a flat fill at any readable opacity turns it into
                frosted glass and the desktop disappears. `userSpaceOnUse` so
                the gradient is centred on the *eye* rather than on each pane's
                own bounding box — the light fills the volume, it is not
                painted on the faces. */}
            <radialGradient
              id={`${uid}-glass`}
              gradientUnits="userSpaceOnUse"
              cx={CENTRE.x}
              cy={CENTRE.y}
              r="72"
            >
              <stop offset="0" stopColor="var(--p-light)" stopOpacity="0.1" />
              <stop offset="0.45" stopColor="var(--p-light)" stopOpacity="0.035" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
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
                opacity={i === 1 ? 0.8 : i === 3 ? 1 : 0.9}
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

            {/* §4 — the lower-left rib is built up thicker than its
                neighbours. Not enough to notice on its own; enough that the
                frame stops reading as a stamped symmetrical mark. */}
            <g clipPath={`url(#${uid}-heavy)`}>
              <path
                d={`${geo.ribOuter} ${geo.ribHeavyInner}`}
                fillRule="evenodd"
                fill={`url(#${uid}-rib)`}
              />
              <path
                d={geo.ribHeavyInner}
                fill="none"
                stroke="#000000"
                strokeWidth="1.6"
                strokeOpacity="0.5"
              />
              <path
                d={geo.ribHeavyInner}
                fill="none"
                stroke="#A8BCC6"
                strokeWidth="0.7"
                strokeOpacity="0.3"
                transform="translate(0.4 -0.9)"
              />
            </g>

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
                d={geo.trimShadow}
                stroke="#000000"
                strokeWidth="2"
                strokeOpacity="0.4"
                fill="none"
              />
              <path
                d={geo.trim}
                stroke="var(--p-trim)"
                strokeWidth="2.4"
                strokeLinecap="round"
                fill="none"
              />
              {/* §4 — heavier for the first third of its run, then thinning. */}
              <path
                d={geo.trimHeavy}
                stroke="var(--p-trim)"
                strokeWidth="3.8"
                strokeLinecap="round"
                fill="none"
              />
              <path
                d={geo.trimLit}
                stroke="var(--p-trim-lit)"
                strokeWidth="0.8"
                strokeOpacity="0.8"
                fill="none"
              />
              {/* The one wear mark: paint rubbed through to the copper. */}
              <path
                d={geo.wear}
                stroke="var(--p-accent)"
                strokeWidth="3"
                strokeOpacity="0.7"
                strokeLinecap="round"
                fill="none"
              />

              {/* Rim light: three runs of different weight along the edges
                  facing the light, never one uniform outline. */}
              <path
                d={geo.rimMain}
                fill="none"
                stroke={`url(#${uid}-rim)`}
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <path
                d={geo.rimHot}
                fill="none"
                stroke="#F2FAFE"
                strokeWidth="2"
                strokeOpacity="0.4"
                strokeLinecap="round"
              />
              <path
                d={geo.rimLower}
                fill="none"
                stroke="#BCD2DC"
                strokeWidth="0.9"
                strokeOpacity="0.16"
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
            strokeOpacity="0.2"
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

      {/* ---- 0 + 6 · eye · aperture breathing --------------------------
          Light, not a shape: the core goes white because the radiance exceeds
          what the tonemapper can hold, and the contour is torn by a domain
          warp rather than by hand-placed anchors. Neither is reachable in SVG,
          which is why this one layer is a canvas.

          The canvas owns its own breathing and its own rage compression, so it
          uses `.eyeGl` — `.eye`'s CSS transforms would squash the bloom along
          with the slit and animate the aperture twice over. */}
      {useShader ? (
        <div className={`${styles.eyeGl} ${styles.emissive}`} data-motion="eye">
          <ShaderEye
            baseHue={p.light}
            coreHue={p.lightCore}
            mode={mode}
            speaking={speaking}
            reducedMotion={reducedMotion}
            unlit={unlit}
            onUnavailable={onGlUnavailable}
          />
        </div>
      ) : (
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
      )}

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
              <stop offset="0" stopColor="var(--p-light)" stopOpacity="1" />
              <stop offset="0.35" stopColor="var(--p-light)" stopOpacity="0.55" />
              <stop offset="0.72" stopColor="var(--p-light)" stopOpacity="0.18" />
              <stop offset="1" stopColor="var(--p-light)" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Wide enough to actually reach the ribs: the point of layer 7 is
              that the metal nearest the eye picks up a cold reflection while
              the outer corners stay warm. Too tight and the eye reads as
              sitting in front of the frame rather than inside it. */}
          <ellipse
            cx={CENTRE.x}
            cy={CENTRE.y}
            rx={EYE.width * 1.75}
            ry={EYE.height * 3.4}
            fill={`url(#${uid}-spillgrad)`}
            opacity="0.3"
          />
        </svg>
      </div>
    </div>
  );
}
