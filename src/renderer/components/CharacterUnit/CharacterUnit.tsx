import { useId, useMemo } from 'react';
import type { CSSProperties } from 'react';
import type { SpeechMode } from '@shared/types';
import type { Material, OvoidParams, Persona } from '@renderer/personas';
import {
  halfWidth,
  ovoidAccent,
  ovoidEdge,
  ovoidOutline,
  ovoidSeam,
  ovoidSeamPart,
  seamTs,
  teardrop,
  yAt
} from '@renderer/personas/forms/ovoid';
import styles from './CharacterUnit.module.css';

export interface CharacterUnitProps {
  persona: Persona;
  /** `null` when idle — nothing is being said. */
  mode: SpeechMode | null;
  speaking: boolean;
  /**
   * §4.1 — the governing test. Hides every emissive, bloom and spill layer so
   * the form can be judged on its shading alone. Driven by the design harness;
   * the overlay never sets it.
   */
  unlit?: boolean;
}

/** Persona palette → CSS custom properties on the unit's subtree (§4.4). */
function paletteStyle(persona: Persona): CSSProperties {
  const p = persona.palette;
  return {
    '--p-shell-hi': p.shellHi,
    '--p-shell-lo': p.shellLo,
    '--p-shell-core': p.shellCore,
    '--p-light': p.light,
    '--p-light-core': p.lightCore,
    '--p-light-dim': p.lightDim,
    '--p-trim': p.trim,
    '--p-trim-lit': p.trimLit,
    '--p-accent': p.accent,
    '--p-rage': p.rage,
    '--p-rage-core': p.rageCore,
    '--bob-px': `${persona.motion.amplitudePx}px`,
    '--bob-ms': `${persona.motion.periodMs}ms`,
    width: `${persona.unit.width}px`,
    height: `${persona.unit.height}px`
  } as CSSProperties;
}

export default function CharacterUnit({
  persona,
  mode,
  speaking,
  unlit = false
}: CharacterUnitProps): JSX.Element {
  // Every gradient, filter and clip id must be unique: the design harness puts
  // several units on one page, and duplicate ids silently cross-wire them.
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  const shell = persona.shell;

  return (
    /* The palette lives on the outer element and the mode on the inner one.
       They cannot share: an inline custom property beats any stylesheet rule
       on the same element, so `[data-mode='rage']` would never manage to
       repoint `--p-light` at the rage hue. */
    <div className={styles.root} style={paletteStyle(persona)} aria-hidden="true">
      <div
        className={styles.unit}
        data-mode={mode ?? 'idle'}
        data-speaking={speaking ? 'true' : 'false'}
        data-unlit={unlit ? 'true' : 'false'}
        data-idle={persona.motion.idle}
      >
        {/* Extension point: one branch per ShellForm. Only `ovoid` exists. */}
        {shell.form === 'ovoid' ? (
          <OvoidUnit uid={uid} persona={persona} params={shell.params} material={shell.material} />
        ) : null}
      </div>
    </div>
  );
}

interface OvoidUnitProps {
  uid: string;
  persona: Persona;
  params: OvoidParams;
  material: Material;
}

function OvoidUnit({ uid, persona, params, material }: OvoidUnitProps): JSX.Element {
  const geometry = useMemo(() => {
    const outline = ovoidOutline(params);
    const seams = seamTs(params).map((t, i) => ({
      t,
      // Deterministic per-seam variation — no two identical (§4.2).
      d: ovoidSeam(params, t, 0.26 + i * 0.03, i === 1 ? 0.06 : -0.04)
    }));

    const trimT = 0.83;
    const optics = persona.optics;
    const opticY = yAt(params, optics.atT);
    // Narrow enough that the teardrop reads as a lens rather than an eye.
    const opticW = optics.size * 0.58;

    return {
      outline,
      seams,
      trimT,
      trim: ovoidSeam(params, trimT, 0.24),
      // Noticeably thicker on the left (§4.5) — a partial run over the same arc.
      trimHeavy: ovoidSeamPart(params, trimT, 0.0, 0.46, 0.24),
      trimLit: ovoidSeam(params, trimT - 0.016, 0.24),
      trimShadow: ovoidSeam(params, trimT + 0.022, 0.24),
      accent: ovoidAccent(params, 0.58, 0.68),
      // §4.2 detail density gradient: fine work clusters around the optics
      // and thins out toward the base.
      brow: ovoidSeamPart(params, optics.atT - 0.2, 0.18, 0.82, 0.2),
      vents: [0.5, 0.535, 0.57].map((t) => ovoidSeamPart(params, t, 0.12, 0.34, 0.18)),
      // Rim light is three overlapping runs of different weight, thickest
      // where the surface turns away fastest (§4.2) — never one outline.
      rimMain: ovoidEdge(params, 0.06, 0.55, -1),
      rimTight: ovoidEdge(params, 0.14, 0.34, -1),
      rimLower: ovoidEdge(params, 0.55, 0.78, -1),
      rimTop: ovoidEdge(params, 0.0, 0.12, 1),
      optic: teardrop(opticW, optics.size),
      opticHousing: teardrop(opticW * 1.3, optics.size * 1.18),
      opticY,
      opticW,
      bellyY: yAt(params, params.bellyT),
      bellyHalf: halfWidth(params, params.bellyT)
    };
  }, [params, persona.optics]);

  const optics = persona.optics;
  const opticXs =
    optics.arrangement === 'paired'
      ? [params.cx - optics.spread, params.cx + optics.spread]
      : [params.cx];

  return (
    <>
      <svg
        className={styles.svg}
        viewBox={`0 0 ${persona.unit.width} ${persona.unit.height}`}
        role="presentation"
        focusable="false"
      >
        <defs>
        <clipPath id={`${uid}-shell`}>
          <path d={geometry.outline} />
        </clipPath>

        {/* Four tonal steps live here: rim (layer 8), mid-light, base, core. */}
        <linearGradient id={`${uid}-form`} x1="0.1" y1="0.02" x2="0.88" y2="0.96">
          <stop offset="0" stopColor="var(--p-shell-hi)" />
          <stop offset="0.44" stopColor="var(--p-shell-lo)" />
          <stop offset="1" stopColor="var(--p-shell-core)" />
        </linearGradient>

        <radialGradient id={`${uid}-coreshadow`} cx="0.8" cy="0.84" r="0.58">
          <stop offset="0" stopColor="#000" stopOpacity="0.66" />
          <stop offset="1" stopColor="#000" stopOpacity="0" />
        </radialGradient>

        {/* Metal: narrow, high contrast, sharp falloff. Ceramic: broad and
            gentle. They must not shade the same way (§4.2). */}
        {material === 'metal' ? (
          <linearGradient id={`${uid}-spec`} x1="0.1" y1="0" x2="0.95" y2="0.35">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="0.34" stopColor="#E4EEF4" stopOpacity="0.46" />
            <stop offset="0.46" stopColor="#FFFFFF" stopOpacity="0.1" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        ) : (
          <linearGradient id={`${uid}-spec`} x1="0.05" y1="0" x2="1" y2="0.6">
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.02" />
            <stop offset="0.45" stopColor="#F2F6F8" stopOpacity="0.22" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
        )}

        {/* Metal picks up colour from its surroundings: a cold bounce off the
            desk plane, warm bleed from the trim. */}
        <linearGradient id={`${uid}-bounce`} x1="0" y1="1" x2="0.2" y2="0">
          <stop offset="0" stopColor="var(--p-light-dim)" stopOpacity="0.34" />
          <stop offset="0.5" stopColor="var(--p-light-dim)" stopOpacity="0.06" />
          <stop offset="1" stopColor="var(--p-light-dim)" stopOpacity="0" />
        </linearGradient>

        <linearGradient id={`${uid}-rim`} x1="0.5" y1="0" x2="0.1" y2="1">
          <stop offset="0" stopColor="#DCEBF2" stopOpacity="0.05" />
          <stop offset="0.28" stopColor="#F4FBFF" stopOpacity="0.85" />
          <stop offset="0.66" stopColor="#CFE2EA" stopOpacity="0.34" />
          <stop offset="1" stopColor="#CFE2EA" stopOpacity="0" />
        </linearGradient>

        <linearGradient id={`${uid}-trimgrad`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="var(--p-trim-lit)" />
          <stop offset="0.38" stopColor="var(--p-trim)" />
          <stop offset="1" stopColor="#6E5714" />
        </linearGradient>

        {/* Emissive, layer 1 of 4: white at the core, hue only at the edge —
            real light saturates to white at intensity (§4.2). */}
        <radialGradient id={`${uid}-opticcore`} cx="0.5" cy="0.38" r="0.5">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="0.55" stopColor="#FFFFFF" stopOpacity="0.92" />
          <stop offset="1" stopColor="var(--p-light-core)" stopOpacity="0" />
        </radialGradient>

        <radialGradient id={`${uid}-opticbody`} cx="0.5" cy="0.4" r="0.62">
          <stop offset="0" stopColor="var(--p-light-core)" />
          <stop offset="0.5" stopColor="var(--p-light)" />
          <stop offset="1" stopColor="var(--p-light-dim)" />
        </radialGradient>

        <radialGradient id={`${uid}-housing`} cx="0.42" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#10202400" />
          <stop offset="1" stopColor="#000000" stopOpacity="0.75" />
        </radialGradient>

        <radialGradient id={`${uid}-spill`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--p-light)" stopOpacity="0.9" />
          <stop offset="0.45" stopColor="var(--p-light)" stopOpacity="0.28" />
          <stop offset="1" stopColor="var(--p-light)" stopOpacity="0" />
        </radialGradient>

        <radialGradient id={`${uid}-atmos`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="var(--p-light)" stopOpacity="0.55" />
          <stop offset="1" stopColor="var(--p-light)" stopOpacity="0" />
        </radialGradient>

        {/* Kills the plastic-vector flatness. Static — never animated. */}
        <filter id={`${uid}-grain`} x="-10%" y="-10%" width="120%" height="120%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
          <feColorMatrix type="saturate" values="0" />
        </filter>

        {/* Seams are not mathematically perfect. Also static. */}
        <filter id={`${uid}-warp`} x="-20%" y="-40%" width="140%" height="180%">
          <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="1" seed="3" result="n" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="n"
            scale="1.4"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/* Filter regions are kept as tight as the blur radius allows: the
            surface inside one is rasterised at device pixel ratio, and a
            region three times larger than it needs to be is three times the
            work every time the layer is touched. */}
        <filter id={`${uid}-bloom`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="3" />
        </filter>

        <filter id={`${uid}-halo`} x="-160%" y="-140%" width="420%" height="380%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>

      {/* ---- 0 · atmospheric halo ------------------------------------- */}
      <g className={`${styles.atmos} ${styles.emissive}`} data-layer="0">
        <ellipse
          cx={params.cx}
          cy={geometry.opticY + 6}
          rx={geometry.bellyHalf * 1.25}
          ry={geometry.bellyHalf * 1.1}
          fill={`url(#${uid}-atmos)`}
          filter={`url(#${uid}-halo)`}
          opacity="0.24"
        />
      </g>

      {/* ---- 1–5 · the object itself. Never mutated after first paint. -- */}
      <g className={styles.static} data-layer="1-5">
        {/* 1 · silhouette base — the flat darkest value that carries the mass */}
        <path d={geometry.outline} fill="var(--p-shell-core)" />

        {/* 2 · form shading */}
        <g clipPath={`url(#${uid}-shell)`}>
          <rect x="0" y="0" width="150" height="180" fill={`url(#${uid}-form)`} />
          <rect x="0" y="0" width="150" height="180" fill={`url(#${uid}-coreshadow)`} />
          <ellipse
            cx={params.cx - params.bellyHalf * 0.46}
            cy={yAt(params, 0.3)}
            rx={params.bellyHalf * (material === 'metal' ? 0.34 : 0.56)}
            ry={(params.bottom - params.top) * (material === 'metal' ? 0.3 : 0.4)}
            fill={`url(#${uid}-spec)`}
            transform={`rotate(-14 ${params.cx - params.bellyHalf * 0.46} ${yAt(params, 0.3)})`}
          />
          <rect
            x="0"
            y={yAt(params, 0.72)}
            width="150"
            height={params.bottom - yAt(params, 0.72) + 6}
            fill={`url(#${uid}-bounce)`}
          />
        </g>

        {/* 3 · panel geometry, bevels, contact occlusion */}
        <g clipPath={`url(#${uid}-shell)`} filter={`url(#${uid}-warp)`}>
          {geometry.seams.map((seam, i) => (
            <g key={`seam-${i}`}>
              {/* A seam is two strokes: one dark line is a scratch, a dark
                  line plus a light one 1 px away is an edge with thickness. */}
              <path
                d={seam.d}
                fill="none"
                stroke="var(--p-shell-core)"
                strokeWidth="0.8"
                strokeOpacity={0.72 - i * 0.12}
              />
              <path
                d={seam.d}
                fill="none"
                stroke="#8FA3AC"
                strokeWidth="0.6"
                strokeOpacity={0.26 - i * 0.05}
                transform="translate(0 -1)"
              />
              {/* Contact occlusion: the panel below sits proud of the one above. */}
              <path
                d={seam.d}
                fill="none"
                stroke="#000000"
                strokeWidth="2.4"
                strokeOpacity={0.14 - i * 0.03}
                transform="translate(0 1.8)"
              />
            </g>
          ))}

          {/* Brow above the optics — the heaviest seam on the body, because
              the eye should be led here first. */}
          <path
            d={geometry.brow}
            fill="none"
            stroke="var(--p-shell-core)"
            strokeWidth="1.2"
            strokeOpacity="0.9"
          />
          <path
            d={geometry.brow}
            fill="none"
            stroke="#A9BDC6"
            strokeWidth="0.7"
            strokeOpacity="0.4"
            transform="translate(0 -1.1)"
          />
          <path
            d={geometry.brow}
            fill="none"
            stroke="#000000"
            strokeWidth="3"
            strokeOpacity="0.24"
            transform="translate(0 2)"
          />

          {/* Vent slots, left flank only. */}
          {geometry.vents.map((d, i) => (
            <g key={`vent-${i}`}>
              <path d={d} fill="none" stroke="#0B0F11" strokeWidth="1.7" strokeOpacity="0.8" />
              <path
                d={d}
                fill="none"
                stroke="#93A7B0"
                strokeWidth="0.5"
                strokeOpacity="0.28"
                transform="translate(0 -1.2)"
              />
            </g>
          ))}
        </g>

        {/* 3b · optic housings — dark sockets with a rim and inner occlusion.
            Deliberately outside the emissive group so the unlit review mode
            still shows a set lens rather than an empty hole. */}
        <g clipPath={`url(#${uid}-shell)`}>
          {opticXs.map((x, i) => {
            const side = i === 0 ? -1 : 1;
            const tilt = optics.tiltDeg * side;
            return (
              <g
                key={`housing-${i}`}
                transform={`translate(${x} ${geometry.opticY}) rotate(${tilt})`}
              >
                <path d={geometry.opticHousing} fill="#0A1416" />
                <path
                  d={geometry.opticHousing}
                  fill="none"
                  stroke="#000000"
                  strokeWidth="2.6"
                  strokeOpacity="0.45"
                />
                <path
                  d={geometry.opticHousing}
                  fill="none"
                  stroke="#7E9098"
                  strokeWidth="0.7"
                  strokeOpacity="0.42"
                  transform="translate(-0.5 -0.7)"
                />
                {/* Dark glass so the socket reads as filled when unlit. */}
                <path d={geometry.optic} fill="#0C1B20" />
                <path d={geometry.optic} fill={`url(#${uid}-housing)`} />
              </g>
            );
          })}
        </g>

        {/* 4 · material detail — grain, one scuffed panel, one discoloured one */}
        <g clipPath={`url(#${uid}-shell)`}>
          <rect
            x="0"
            y="0"
            width="150"
            height="180"
            filter={`url(#${uid}-grain)`}
            opacity="0.05"
            style={{ mixBlendMode: 'overlay' }}
          />
          <ellipse
            cx={params.cx + params.bellyHalf * 0.5}
            cy={yAt(params, 0.68)}
            rx="13"
            ry="7"
            fill="#8A9AA2"
            opacity="0.07"
            transform={`rotate(18 ${params.cx + params.bellyHalf * 0.5} ${yAt(params, 0.68)})`}
          />
          <ellipse
            cx={params.cx - params.bellyHalf * 0.62}
            cy={yAt(params, 0.86)}
            rx="9"
            ry="5"
            fill="#3F2A1E"
            opacity="0.3"
          />
        </g>

        {/* 5 · trim and hard accents */}
        <g clipPath={`url(#${uid}-shell)`}>
          <path
            d={geometry.trimShadow}
            fill="none"
            stroke="#000000"
            strokeWidth="3.2"
            strokeOpacity="0.42"
          />
          <path
            d={geometry.trim}
            fill="none"
            stroke={`url(#${uid}-trimgrad)`}
            strokeWidth="2.6"
            strokeLinecap="round"
          />
          <path
            d={geometry.trimHeavy}
            fill="none"
            stroke={`url(#${uid}-trimgrad)`}
            strokeWidth="4.2"
            strokeLinecap="round"
          />
          <path
            d={geometry.trimLit}
            fill="none"
            stroke="var(--p-trim-lit)"
            strokeWidth="0.8"
            strokeOpacity="0.75"
          />

          <path d={geometry.accent} fill="var(--p-accent)" />
          <path d={geometry.accent} fill={`url(#${uid}-coreshadow)`} opacity="0.5" />
          {/* Worn upper edge — brighter where the paint has rubbed through. */}
          <path
            d={geometry.accent}
            fill="none"
            stroke="#D9885F"
            strokeWidth="0.7"
            strokeOpacity="0.34"
            transform="translate(0 -0.6)"
          />
          <path
            d={geometry.accent}
            fill="none"
            stroke="#000000"
            strokeWidth="1.6"
            strokeOpacity="0.35"
            transform="translate(0.8 1.4)"
          />
        </g>
      </g>

      {/* ---- 6 · optics ------------------------------------------------ */}
      <g className={`${styles.optics} ${styles.emissive}`} data-layer="6">
        {opticXs.map((x, i) => {
          const side = i === 0 ? -1 : 1;
          const tilt = optics.tiltDeg * side;
          const gain = side === 1 ? optics.rightBias : 1;
          return (
            <g key={`optic-${i}`} transform={`translate(${x} ${geometry.opticY}) rotate(${tilt})`}>
              {/* 4 · wide atmospheric halo */}
              <path
                d={geometry.optic}
                fill="var(--p-light)"
                filter={`url(#${uid}-halo)`}
                opacity={0.3 * gain}
              />
              {/* 3 · tight bloom */}
              <path
                d={geometry.optic}
                fill="var(--p-light)"
                filter={`url(#${uid}-bloom)`}
                opacity={0.52 * gain}
              />
              {/* 2 · hue body */}
              <path d={geometry.optic} fill={`url(#${uid}-opticbody)`} opacity={Math.min(1, gain)} />
              {/* 1 · white-hot core, not the hue. Small on purpose: a large
                  white centre blows the lens out and the teardrop stops
                  reading as a shape at all. */}
              <path
                d={geometry.optic}
                fill={`url(#${uid}-opticcore)`}
                transform="scale(0.42) translate(0 -6)"
                opacity={Math.min(1, 0.85 * gain)}
              />
            </g>
          );
        })}
      </g>

      {/* ---- 7 · light spill onto the shell ---------------------------- */}
      <g
        className={`${styles.spill} ${styles.emissive}`}
        data-layer="7"
        clipPath={`url(#${uid}-shell)`}
        style={{ mixBlendMode: 'screen' }}
      >
        <ellipse
          cx={params.cx}
          cy={geometry.opticY + 4}
          rx={params.bellyHalf * 1.15}
          ry={params.bellyHalf}
          fill={`url(#${uid}-spill)`}
          opacity="0.26"
        />
      </g>

      {/* ---- 8 · rim light. Static, and never a uniform outline. -------- */}
      <g className={styles.static} data-layer="8" clipPath={`url(#${uid}-shell)`}>
        <path
          d={geometry.rimMain}
          fill="none"
          stroke={`url(#${uid}-rim)`}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d={geometry.rimTight}
          fill="none"
          stroke="#F6FCFF"
          strokeWidth="2.4"
          strokeOpacity="0.62"
          strokeLinecap="round"
        />
        <path
          d={geometry.rimLower}
          fill="none"
          stroke="#BCD2DC"
          strokeWidth="0.9"
          strokeOpacity="0.22"
          strokeLinecap="round"
        />
        <path
          d={geometry.rimTop}
          fill="none"
          stroke="#D7E7EE"
          strokeWidth="0.8"
          strokeOpacity="0.3"
          strokeLinecap="round"
        />
      </g>

      </svg>

      {persona.furniture.includes('halo') ? (
        <Halo persona={persona} params={params} outline={geometry.outline} />
      ) : null}
    </>
  );
}

/**
 * §4.3 layer 9 — foreground furniture, and the one piece that has to live
 * outside the main SVG.
 *
 * Rotating a `<g>` inside the shell's SVG re-rasterises that whole SVG, filter
 * graph included, on every frame: measured at ~0.9% CPU on its own, three
 * times the entire budget. As its own element with `will-change: transform` it
 * is a composited layer the GPU spins for free, and the occlusion that used to
 * need an SVG mask becomes a static CSS `clip-path` on the non-rotating
 * parent.
 */
function Halo({
  persona,
  params,
  outline
}: {
  persona: Persona;
  params: OvoidParams;
  outline: string;
}): JSX.Element {
  const cy = params.top + 3;
  const rx = halfWidth(params, params.bellyT) * 0.78;
  return (
    <div
      className={styles.haloClip}
      // Everything except the shell, so the lower arc passes behind the body.
      style={{ clipPath: `path(evenodd, "M -60 -60 H 220 V 240 H -60 Z ${outline}")` }}
    >
      <div
        className={styles.haloSpin}
        data-layer="9"
        style={{ transformOrigin: `${params.cx}px ${cy}px` }}
      >
        <svg
          className={styles.haloSvg}
          viewBox={`0 0 ${persona.unit.width} ${persona.unit.height}`}
          role="presentation"
          focusable="false"
        >
          <ellipse
            cx={params.cx}
            cy={cy}
            rx={rx}
            ry="10"
            fill="none"
            stroke="var(--p-trim)"
            strokeWidth="2"
            strokeOpacity="0.75"
            transform={`rotate(-14 ${params.cx} ${cy})`}
          />
          <ellipse
            cx={params.cx}
            cy={cy}
            rx={rx}
            ry="10"
            fill="none"
            stroke="var(--p-trim-lit)"
            strokeWidth="0.7"
            strokeOpacity="0.6"
            transform={`rotate(-14 ${params.cx} ${cy - 1})`}
          />
        </svg>
      </div>
    </div>
  );
}
