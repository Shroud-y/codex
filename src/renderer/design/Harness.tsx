import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MS_PER_CHAR } from '@shared/speechTiming';
import CharacterUnit from '@renderer/components/CharacterUnit/CharacterUnit';
import Companion from '@renderer/components/Companion';
import { getPersona, personaIds } from '@renderer/personas';
import { SCENES, type Scene } from './scenes';
import styles from './Harness.module.css';

/**
 * §7 — the design preview. Every overlay state on demand, over every ground
 * the overlay has to survive, with the four §4.1 craft checks as toggles.
 *
 * This page is not part of the shipped overlay: it is a separate entry, built
 * only in development, and it uses no Electron API at all — open it in a
 * browser at `http://localhost:<port>/design.html` while `pnpm dev` runs.
 */

type Ground = 'white' | 'grey' | 'dark' | 'shot';

const GROUNDS: { id: Ground; label: string }[] = [
  { id: 'white', label: 'white document' },
  { id: 'grey', label: 'mid grey' },
  { id: 'dark', label: 'dark game' },
  { id: 'shot', label: 'screenshot' }
];

export default function Harness(): JSX.Element {
  const [sceneId, setSceneId] = useState(SCENES[0]?.id ?? '');
  const [personaId, setPersonaId] = useState(personaIds()[0] ?? 'codex');
  const [ground, setGround] = useState<Ground>('dark');
  const [shot, setShot] = useState<string | null>(null);

  const [unlit, setUnlit] = useState(false);
  const [greyscale, setGreyscale] = useState(false);
  const [squint, setSquint] = useState(false);
  const [tiny, setTiny] = useState(false);
  const [bounds, setBounds] = useState(true);

  const [playing, setPlaying] = useState(false);

  const scene = useMemo(() => SCENES.find((s) => s.id === sceneId) ?? SCENES[0], [sceneId]);
  const persona = getPersona(personaId);

  useEffect(() => {
    return () => {
      if (shot) URL.revokeObjectURL(shot);
    };
  }, [shot]);

  return (
    <div className={styles.page}>
      <aside className={styles.panel}>
        <h1 className={styles.title}>Codex · overlay preview</h1>

        <Group label="State">
          {SCENES.map((s) => (
            <Radio
              key={s.id}
              name="scene"
              label={s.label}
              checked={s.id === sceneId}
              onChange={() => setSceneId(s.id)}
            />
          ))}
        </Group>

        <Group label="Ground">
          {GROUNDS.map((g) => (
            <Radio
              key={g.id}
              name="ground"
              label={g.label}
              checked={g.id === ground}
              onChange={() => setGround(g.id)}
            />
          ))}
          <label className={styles.file}>
            load screenshot…
            <input
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                setShot((previous) => {
                  if (previous) URL.revokeObjectURL(previous);
                  return URL.createObjectURL(file);
                });
                setGround('shot');
              }}
            />
          </label>
        </Group>

        {/* §4.1 — review tools, not extras. */}
        <Group label="Craft checks">
          <Check
            label="unlit (no emissive, no bloom, no spill)"
            checked={unlit}
            onChange={setUnlit}
          />
          <Check label="greyscale (value structure)" checked={greyscale} onChange={setGreyscale} />
          <Check label="squint (heavy blur)" checked={squint} onChange={setSquint} />
          <Check label="32 px silhouette" checked={tiny} onChange={setTiny} />
        </Group>

        <Group label="Harness">
          <Check label="show window bounds" checked={bounds} onChange={setBounds} />
          <Check label="play type-on" checked={playing} onChange={setPlaying} />
          {personaIds().length > 1 ? (
            <select
              className={styles.select}
              value={personaId}
              onChange={(event) => setPersonaId(event.target.value)}
            >
              {personaIds().map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          ) : null}
        </Group>

        <p className={styles.note}>
          Window canvas is 560 × 460, right-anchored. The dashed rule is the real window edge —
          nothing may depend on space outside it.
        </p>
      </aside>

      <main
        className={styles.stage}
        data-ground={ground}
        style={ground === 'shot' && shot ? { backgroundImage: `url(${shot})` } : undefined}
      >
        <div
          className={styles.canvas}
          data-bounds={bounds ? 'true' : 'false'}
          data-greyscale={greyscale ? 'true' : 'false'}
          data-squint={squint ? 'true' : 'false'}
        >
          {scene ? (
            /* Keyed so switching scene or arming playback remounts rather
               than resetting state from an effect. */
            <PreviewStage
              key={`${scene.id}:${playing}`}
              scene={scene}
              persona={persona}
              playing={playing}
              unlit={unlit}
            />
          ) : null}
        </div>

        {tiny ? (
          <div className={styles.silhouettes}>
            {[32, 64, 150].map((size) => (
              <div key={size} className={styles.silhouette}>
                <div style={{ width: size, height: (size / 150) * 175 }}>
                  <div
                    className={styles.scaler}
                    style={{ transform: `scale(${size / 150})` }}
                  >
                    <CharacterUnit persona={persona} mode={null} speaking={false} unlit={unlit} />
                  </div>
                </div>
                <span>{size} px</span>
              </div>
            ))}
          </div>
        ) : null}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * One scene on the canvas. Static by default; with `playing` it replays the
 * reveal at the real per-mode speeds, so type-on can be judged without waiting
 * for a monitor to fire. Remounted by its key when either changes.
 */
function PreviewStage({
  scene,
  persona,
  playing,
  unlit
}: {
  scene: Scene;
  persona: ReturnType<typeof getPersona>;
  playing: boolean;
  unlit: boolean;
}): JSX.Element {
  const [state, setState] = useState({ activeIndex: 0, revealed: 0 });
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (!playing) return;
    const segment = scene.segments[state.activeIndex];
    if (!segment) return;

    const isLast = state.activeIndex >= scene.segments.length - 1;
    if (state.revealed < segment.text.length) {
      timer.current = window.setTimeout(
        () => setState((s) => ({ ...s, revealed: s.revealed + 1 })),
        MS_PER_CHAR[segment.mode]
      );
    } else if (!isLast) {
      // Held rather than instantaneous: the harness is for looking at states,
      // and a real 0 ms jump gives you nothing to look at.
      timer.current = window.setTimeout(
        () => setState((s) => ({ activeIndex: s.activeIndex + 1, revealed: 0 })),
        900
      );
    } else {
      timer.current = window.setTimeout(() => setState({ activeIndex: 0, revealed: 0 }), 2200);
    }

    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [playing, scene, state]);

  const activeIndex = playing ? state.activeIndex : scene.activeIndex;
  const segment = scene.segments[activeIndex];
  const revealed = playing ? state.revealed : (scene.revealed ?? segment?.text.length ?? 0);

  return (
    <Companion
      persona={persona}
      segments={scene.segments}
      activeIndex={activeIndex}
      revealed={revealed}
      visible
      reducedMotion={false}
      onDismiss={() => undefined}
      toast={scene.toast}
      unlit={unlit}
    />
  );
}

function Group({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <section className={styles.group}>
      <h2 className={styles.groupTitle}>{label}</h2>
      {children}
    </section>
  );
}

function Radio({
  name,
  label,
  checked,
  onChange
}: {
  name: string;
  label: string;
  checked: boolean;
  onChange: () => void;
}): JSX.Element {
  return (
    <label className={styles.row}>
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span>{label}</span>
    </label>
  );
}

function Check({
  label,
  checked,
  onChange
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}): JSX.Element {
  return (
    <label className={styles.row}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
