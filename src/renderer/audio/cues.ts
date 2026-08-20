import type { CueSources } from '@shared/types';

/**
 * The two overlay cues — arrival and departure — synthesised at runtime, and
 * replaceable by a file without touching this module.
 *
 * No audio file *ships* for these. A quarter-second UI sound is cheaper to
 * describe than to store, and a synthesised one is retuned by changing a
 * number here rather than re-rendering an asset. But dropping
 * `appear.ogg`/`.wav`/`.mp3` (or `disappear.*`) into `resources/audio/cues`
 * overrides it: main resolves the files at startup and sends the URLs with
 * `state:update`, `setCueSources` takes them, and the synthesiser below is
 * simply not called for that cue. Replacing one and keeping the other is
 * fine. Voice lines are the neighbouring case and stay prerendered (§14.3).
 *
 * Both cues are built from the same four voices so they read as one machine:
 * a square tick (the instant), a sub thump (weight), bandpassed noise (the
 * mechanism), and a detuned pair of triangles (the optic). Appear sweeps
 * everything upward and lands; disappear runs the tonal half back down,
 * shorter and quieter, so it closes the sentence instead of starting one.
 */

/** Peak of the mixed cue. Deliberately low — this thing speaks all day. */
const MASTER_GAIN = 0.16;

/** Floor for exponential ramps, which cannot reach or pass through zero. */
const SILENCE = 0.0001;

/**
 * How long the audio device is held open after the last cue finishes.
 *
 * It is held at all only so that a show and the hide a few seconds later do
 * not each pay for a device start; it is *released* because an open context is
 * expensive to leave lying around. Measured in Electron on this machine over
 * 20 s spans, summed across the app's processes: nothing open 0.09 %, one idle
 * AudioContext 1.86 %, and a *suspended* one still 1.02 % — sixteen times the
 * app's entire idle draw, all day, for a sound nobody is listening to.
 * Suspending is therefore not enough; the context has to go.
 */
const IDLE_CLOSE_MS = 3000;

interface Cue {
  out: GainNode;
  sources: AudioScheduledSourceNode[];
  pending: number;
}

/** Files that replace a cue, from main. Empty means synthesise both. */
let sources: CueSources = { appear: null, disappear: null };
/** What main last said, so an unchanged repeat can be ignored. */
let declared: CueSources | null = null;
const players = new Map<CueId, HTMLAudioElement>();

type CueId = keyof CueSources;

let ctx: AudioContext | null = null;
let noiseBuffer: AudioBuffer | null = null;
let current: Cue | null = null;
let closeTimer: number | null = null;

/**
 * Opened on demand and closed again once the cue is over (see
 * `IDLE_CLOSE_MS`). Reopening costs about 30 ms before the clock starts
 * moving — measured — which is under two frames of a 200 ms entry animation
 * and the right side of that trade for an app that is idle all day. The very
 * first context in the process is slower, around 230 ms, so the login-time
 * cue can lag; it is one line at startup and not worth holding a device open
 * for the rest of the session.
 *
 * The overlay is click-through and never receives a gesture, so the context
 * would stay suspended under Chromium's default autoplay policy — main passes
 * `--autoplay-policy=no-user-gesture-required` for exactly this. `resume()`
 * still runs, because the design harness opens in an ordinary browser.
 */
function audio(): AudioContext | null {
  cancelClose();
  if (ctx) return ctx;
  if (typeof AudioContext !== 'function') return null;
  try {
    ctx = new AudioContext({ latencyHint: 'interactive' });
  } catch {
    return null;
  }
  return ctx;
}

function cancelClose(): void {
  if (closeTimer === null) return;
  window.clearTimeout(closeTimer);
  closeTimer = null;
}

function scheduleClose(): void {
  cancelClose();
  closeTimer = window.setTimeout(() => {
    closeTimer = null;
    // A cue that outlives the timer keeps the device: nothing here is that
    // long, but closing under a running graph would cut it off mid-note.
    if (current) {
      scheduleClose();
      return;
    }
    closeNow();
  }, IDLE_CLOSE_MS);
}

function closeNow(): void {
  cancelClose();
  const target = ctx;
  ctx = null;
  current = null;
  // Housekeeping, not a fix: a buffer does outlive its context (verified),
  // but there is no reason to keep half a second of noise alive for a device
  // that is gone, and the next one is then cut at the new context's rate.
  noiseBuffer = null;
  void target?.close().catch(() => {
    /* Already closed, or the device went away underneath us. */
  });
}

/**
 * A context that will not resume plays nothing and still costs ~1% CPU, and
 * its sources never end — so the idle close, which hangs off `onended`, would
 * never fire. Drop it instead.
 */
function start(target: AudioContext): void {
  if (target.state !== 'suspended') return;
  void target.resume().catch(() => closeNow());
}

function noise(target: AudioContext): AudioBuffer {
  if (noiseBuffer) return noiseBuffer;
  const buffer = target.createBuffer(1, Math.ceil(target.sampleRate * 0.5), target.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  noiseBuffer = buffer;
  return buffer;
}

/**
 * Opens a cue and takes the previous one down over 15 ms. An interrupting
 * phrase hides and re-shows within a frame or two, so the two cues would
 * otherwise overlap into a single muddled noise — and cutting a running
 * oscillator dead would click.
 */
function begin(target: AudioContext): Cue {
  const now = target.currentTime;

  if (current) {
    const previous = current;
    previous.out.gain.cancelScheduledValues(now);
    previous.out.gain.setValueAtTime(Math.max(previous.out.gain.value, SILENCE), now);
    previous.out.gain.exponentialRampToValueAtTime(SILENCE, now + 0.015);
    for (const source of previous.sources) {
      try {
        source.stop(now + 0.02);
      } catch {
        /* Already stopped; stop() throws only on a source never started. */
      }
    }
  }

  const out = target.createGain();
  out.gain.value = MASTER_GAIN;
  out.connect(target.destination);

  const cue: Cue = { out, sources: [], pending: 0 };
  current = cue;
  return cue;
}

/** Every node disconnects itself; the cue's bus goes when the last one ends. */
function track(cue: Cue, source: AudioScheduledSourceNode): void {
  cue.sources.push(source);
  cue.pending += 1;
  source.onended = () => {
    source.disconnect();
    cue.pending -= 1;
    if (cue.pending > 0) return;
    cue.out.disconnect();
    if (current === cue) current = null;
    scheduleClose();
  };
}

/**
 * Attack, hold, exponential release — the envelope all four voices share.
 *
 * The hold is the part that matters and the part a first pass omits: an
 * exponential release crosses into inaudibility in about a fifth of its
 * nominal length, so a tone that glides for 170 ms under a bare 320 ms decay
 * is silent long before it arrives anywhere. Holding the level for the glide
 * and releasing after it is what makes the pitch move audibly (measured, not
 * assumed — the first version's rise happened entirely below -50 dBFS).
 */
function envelope(
  gain: GainNode,
  at: number,
  level: number,
  attack: number,
  hold: number,
  release: number
): void {
  gain.gain.setValueAtTime(SILENCE, at);
  gain.gain.linearRampToValueAtTime(level, at + attack);
  gain.gain.setValueAtTime(level, at + attack + hold);
  gain.gain.exponentialRampToValueAtTime(SILENCE, at + attack + hold + release);
}

/** The instant of arrival: 14 ms of hard square, before anything tonal. */
function tick(target: AudioContext, cue: Cue, at: number, hz: number, level: number): void {
  const osc = target.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(hz, at);

  const gain = target.createGain();
  envelope(gain, at, level, 0.001, 0, 0.013);

  osc.connect(gain).connect(cue.out);
  track(cue, osc);
  osc.start(at);
  osc.stop(at + 0.05);
}

/** Weight. Mostly felt rather than heard, and gone before the tone peaks. */
function thump(target: AudioContext, cue: Cue, at: number, from: number, to: number, decay: number): void {
  const osc = target.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(from, at);
  osc.frequency.exponentialRampToValueAtTime(to, at + decay * 0.6);

  const gain = target.createGain();
  envelope(gain, at, 0.9, 0.004, 0, decay);

  osc.connect(gain).connect(cue.out);
  track(cue, osc);
  osc.start(at);
  osc.stop(at + decay + 0.05);
}

/**
 * The mechanism: a narrow band of noise dragged across the spectrum. The
 * attack is given by the caller, because a swell into the landing and a wash
 * falling away from one are the same filter run in opposite directions.
 */
function sweep(
  target: AudioContext,
  cue: Cue,
  at: number,
  from: number,
  to: number,
  duration: number,
  attack: number,
  release: number,
  level: number
): void {
  const source = target.createBufferSource();
  source.buffer = noise(target);

  const band = target.createBiquadFilter();
  band.type = 'bandpass';
  band.Q.value = 5;
  band.frequency.setValueAtTime(from, at);
  band.frequency.exponentialRampToValueAtTime(to, at + duration);

  const gain = target.createGain();
  envelope(gain, at, level, attack, Math.max(duration - attack - release, 0), release);

  source.connect(band).connect(gain).connect(cue.out);
  track(cue, source);
  source.start(at);
  source.stop(at + duration + 0.06);
}

/**
 * The optic. Two triangles a few cents apart, so the pitch shimmers instead of
 * sitting there as a clean sine — the light is never quite steady in the skin
 * either.
 *
 * The second one is quieter, and they are close rather than far apart. At
 * equal level and +/-7 cents the pair beat to a null: measured, the held tone
 * dropped to a seventh of its amplitude 140 ms in and came back, which is a
 * stutter in the middle of the cue rather than a shimmer. Unequal levels put a
 * floor under the beat, and 8 cents apart puts its first trough at the end of
 * the hold — so the held tone eases off as the pitch travels instead of
 * sitting flat and then stopping. That easing is the beat, not the envelope.
 */
function optic(
  target: AudioContext,
  cue: Cue,
  at: number,
  from: number,
  to: number,
  glide: number,
  release: number,
  level: number
): void {
  const gain = target.createGain();
  // Held for the glide, released after it — see `envelope`.
  envelope(gain, at, level, 0.008, glide, release);
  gain.connect(cue.out);

  for (const [detune, share] of [
    [-4, 1],
    [4, 0.55]
  ]) {
    const osc = target.createOscillator();
    osc.type = 'triangle';
    osc.detune.value = detune;
    osc.frequency.setValueAtTime(from, at);
    osc.frequency.exponentialRampToValueAtTime(to, at + glide);

    const partial = target.createGain();
    partial.gain.value = share;

    osc.connect(partial).connect(gain);
    track(cue, osc);
    osc.start(at);
    osc.stop(at + glide + release + 0.08);
  }
}

/** The eye opens: tick, weight, iris, then the light coming up. ~360 ms. */
function synthesiseAppear(): void {
  const target = audio();
  if (!target) return;
  start(target);

  const at = target.currentTime + 0.005;
  const cue = begin(target);

  tick(target, cue, at, 1760, 0.22);
  thump(target, cue, at, 130, 46, 0.3);
  sweep(target, cue, at + 0.01, 320, 2600, 0.24, 0.1, 0.11, 0.5);
  optic(target, cue, at + 0.012, 300, 980, 0.18, 0.22, 0.42);
}

/**
 * It closes: the same optic run backwards, no weight behind it, and half the
 * level. ~255 ms — it has to finish inside `EXIT_ANIMATION_MS`, after which
 * main hides the window.
 */
function synthesiseDisappear(): void {
  const target = audio();
  if (!target) return;
  start(target);

  const at = target.currentTime + 0.005;
  const cue = begin(target);

  optic(target, cue, at, 820, 210, 0.14, 0.16, 0.34);
  sweep(target, cue, at, 2400, 420, 0.16, 0.012, 0.12, 0.26);
}

/* ------------------------------------------------------------------ */
/* The seam                                                            */
/* ------------------------------------------------------------------ */

const SYNTHESISED: Record<CueId, () => void> = {
  appear: synthesiseAppear,
  disappear: synthesiseDisappear
};

/**
 * Cues whose file has been asked to play and has not started yet. Emptied by
 * the element's `playing` event — the only signal that the file really began —
 * rather than by the promise `play()` returns, which can reject for reasons
 * that say nothing about the file.
 */
const inFlight = new Set<CueId>();

/**
 * Called with whatever main found in `resources/audio/cues`.
 *
 * `state:update` is pushed on every mute and snooze too, and it carries the
 * same cue sources every time. Rebuilding on those would undo `giveUp` — a
 * file that failed once would be retried, and go silent again, every time the
 * user touched the tray.
 */
export function setCueSources(next: CueSources): void {
  if (declared && declared.appear === next.appear && declared.disappear === next.disappear) {
    return;
  }
  declared = next;
  sources = next;
  players.clear();
  inFlight.clear();
  // Load them now, at startup, rather than on the first cue: a cold file takes
  // about 200 ms to become playable (measured), and a broken one reports its
  // error in under a tenth of that, so both questions are settled long before
  // anything needs to make a sound.
  for (const id of Object.keys(next) as CueId[]) player(id);
}

function player(id: CueId): HTMLAudioElement | null {
  const url = sources[id];
  if (!url) return null;
  const existing = players.get(id);
  if (existing) return existing;

  const element = new Audio(url);
  element.preload = 'auto';
  element.addEventListener('playing', () => inFlight.delete(id));
  element.addEventListener('error', () => giveUp(id));
  players.set(id, element);
  return element;
}

/**
 * Missing, corrupt, or an unsupported codec: drop back to the synthesised cue
 * for the rest of the session rather than going quietly silent.
 *
 * Reached from the element's `error` event, which is the signal that arrives
 * first and reliably — measured at about 8 ms for a URL the protocol refuses,
 * so the fallback cue is not perceptibly late.
 */
function giveUp(id: CueId): void {
  if (!sources[id]) return;
  sources = { ...sources, [id]: null };
  players.delete(id);
  // Only make a sound if this was a cue somebody asked for just now, rather
  // than a late error on an element that already had its moment.
  if (inFlight.delete(id)) SYNTHESISED[id]();
}

function play(id: CueId): void {
  const element = player(id);
  if (!element) {
    SYNTHESISED[id]();
    return;
  }
  inFlight.add(id);
  // Restarting rather than overlapping: a second appear before the first has
  // finished is an interrupt, and the synthesised path treats it the same way.
  element.currentTime = 0;
  void element.play().catch((error: unknown) => {
    // A cue landing on top of another rejects with AbortError and says nothing
    // about whether the file is any good.
    if (error instanceof DOMException && error.name === 'AbortError') {
      inFlight.delete(id);
      return;
    }
    giveUp(id);
  });
}

export function playAppear(): void {
  play('appear');
}

export function playDisappear(): void {
  play('disappear');
}
