# CODEX — Desktop Companion Overlay

## Phase 1 Implementation Specification

> **Audience:** an AI coding agent implementing this project from scratch.
> **Scope:** Phase 1 only. Phases 2 and 3 are described *only* so that you leave the right seams. Do not implement them.
> **Codename:** `codex` (working title — all identifiers, files and UI strings are English).

---

## 0. Working agreement

Before you write code, read this section and follow it for the whole task.

1. **Explain before you change.** When you hit a bug or an unexpected behaviour, state the root cause first, then propose the fix. Do not silently patch symptoms.
2. **Ask, don't guess.** If a decision in this spec is ambiguous or two reasonable implementations exist, stop and ask. Do not invent product behaviour.
3. **Commit granularly.** One logical change per commit, with a conventional-commit message (`feat:`, `fix:`, `chore:`, `refactor:`). Do not batch unrelated work. But do not commit by yourself, say me and attach commit message.
4. **No new dependencies without asking.** The dependency list in §2 is deliberate. If you believe something else is needed, ask first.
5. **Build must stay green.** `pnpm typecheck`, `pnpm lint` and `pnpm test` pass at every commit.
6. Спершу root cause + докази + план → чекати підтвердження → потім код → самоперевірка вкінці. Список різних змін = окремі кроки, кожен окремо перевірений. Велика робота — тірами з рев'ю між ними. Після апруву плану — гнати всі тіри без пауз.

---

## 1. What this is

A background desktop companion for Windows. It starts with the OS, sits silently in the tray, and occasionally surfaces a small character overlay near the right edge of the screen — slightly below vertical centre — to deliver a short line of text reacting to what is happening on the machine.

The character is **Codex**: a damaged machine intelligence. Formal, deferential, faintly obsessive about the user's wellbeing, and prone to brief involuntary outbursts of corrupted aggression which it immediately apologises for. This personality lives entirely in the phrase bank, not in the code.

### Design constraints that drive everything

- **It must not become annoying.** This is the primary product risk, not any technical problem. Every architectural decision about rate limiting exists to serve it. An overlay that interrupts at the wrong moment gets uninstalled on day three.
- **It must never steal focus or block input.** The user is working or gaming. The overlay is decoration with opinions.
- **Phase 1 ships without audio.** Lines are displayed as text. The audio pipeline is specified and stubbed, and real audio files are dropped in later without code changes.

### Explicit non-goals for Phase 1

No LLM. No speech recognition. No voice activation. No command execution. No clipboard access. No network calls of any kind except an optional weather fetch (§9.6), which is disabled by default.

---

## 2. Stack

| Concern | Choice | Note |
|---|---|---|
| Shell | **Electron** (latest stable) | Chosen for familiarity and fast iteration. Memory footprint is a known trade-off; see §16. |
| UI | **React 18 + TypeScript** | Renderer is presentation-only. |
| Bundler | **Vite** via `electron-vite` | Separate main / preload / renderer builds. |
| Package manager | **pnpm** | |
| Packaging | **electron-builder** | NSIS target, Windows x64. |
| Styling | **CSS Modules** | No Tailwind, no UI kit. The overlay is one component. |
| System metrics | **systeminformation** | CPU load, memory, temperature, processes. |
| File watching | **chokidar** | |
| Testing | **vitest** | Unit tests for pure logic only. |
| Validation | **zod** | Phrase bank and settings schema validation at load. |

Target: **Windows 10/11 x64**. Write platform-specific code behind a small guard so macOS/Linux support can be added later, but do not test or support them now.

---

## 3. Repository layout

```
codex/
├─ src/
│  ├─ main/                        # Electron main process — all logic lives here
│  │  ├─ index.ts                  # app lifecycle, single-instance lock, wiring
│  │  ├─ window/
│  │  │  ├─ overlayWindow.ts       # BrowserWindow creation & flags
│  │  │  ├─ clickThrough.ts        # mouse pass-through management
│  │  │  └─ positioning.ts         # anchor to right edge, multi-monitor
│  │  ├─ tray/
│  │  │  └─ tray.ts                # tray icon, context menu
│  │  ├─ core/
│  │  │  ├─ eventBus.ts            # typed pub/sub
│  │  │  ├─ events.ts              # AppEvent union type + factories
│  │  │  ├─ triggerEngine.ts       # event → candidate lines
│  │  │  ├─ speechDirector.ts      # arbitration, cooldowns, final say/skip
│  │  │  ├─ phraseBank.ts          # load, validate, index
│  │  │  ├─ selector.ts            # weighted pick + anti-repeat (PURE)
│  │  │  ├─ cooldown.ts            # cooldown ledger (PURE)
│  │  │  └─ suppression.ts         # do-not-disturb evaluation (PURE)
│  │  ├─ monitors/                 # event sources — see §9
│  │  │  ├─ Monitor.ts             # interface
│  │  │  ├─ systemMonitor.ts
│  │  │  ├─ processMonitor.ts
│  │  │  ├─ idleMonitor.ts
│  │  │  ├─ scheduleMonitor.ts
│  │  │  ├─ sessionMonitor.ts
│  │  │  └─ fileMonitor.ts
│  │  ├─ voice/
│  │  │  ├─ VoiceEngine.ts         # interface
│  │  │  ├─ NullVoiceEngine.ts     # Phase 1 default
│  │  │  └─ PrerenderedVoiceEngine.ts  # implemented, unused until audio exists
│  │  ├─ settings/
│  │  │  └─ settings.ts            # load/save/defaults/migration
│  │  └─ log/
│  │     └─ logger.ts
│  ├─ preload/
│  │  └─ index.ts                  # contextBridge surface only
│  ├─ renderer/
│  │  ├─ App.tsx
│  │  ├─ components/
│  │  │  ├─ Companion.tsx          # portrait + bubble container
│  │  │  ├─ SpeechBubble.tsx
│  │  │  └─ Portrait.tsx
│  │  ├─ hooks/useSpeech.ts
│  │  ├─ styles/
│  │  └─ main.tsx
│  └─ shared/
│     ├─ types.ts                  # types crossing the IPC boundary
│     └─ ipc.ts                    # channel name constants
├─ resources/
│  ├─ phrases/
│  │  └─ bank.json
│  ├─ audio/                       # EMPTY in Phase 1 — filled later
│  │  └─ .gitkeep
│  └─ icons/
│     ├─ tray.ico
│     └─ app.ico
├─ tools/
│  └─ render-voice/                # placeholder, Phase 1.5 — see §14.4
│     └─ README.md
├─ electron.vite.config.ts
├─ electron-builder.yml
└─ package.json
```

**Rule:** the renderer contains no business logic. It receives a fully-resolved instruction to display something and displays it. All timing, selection and suppression decisions happen in main. This matters because Phase 2 adds a second consumer of the same pipeline, and because logic in main is testable without a browser.

---

## 4. Architecture

```
Monitors ──emit──▶ EventBus ──▶ TriggerEngine ──▶ SpeechDirector ──▶ VoiceEngine
                                     │                  │                 │
                              (rules match)      (may veto)          (plays / no-op)
                                                        │
                                                        └──▶ IPC ──▶ Overlay window
```

Responsibilities, precisely:

- **Monitor** — observes one aspect of the system, emits `AppEvent`s. Knows nothing about phrases.
- **EventBus** — typed pub/sub. Also keeps a bounded ring buffer of the last 100 events for the debug panel.
- **TriggerEngine** — maps an event to zero or more *candidate* phrase groups via declarative rules. Knows nothing about timing.
- **SpeechDirector** — the only component allowed to decide that something is actually said. Applies suppression, cooldowns, priority and anti-repeat. This is the single choke point; there must be no other path to the overlay.
- **VoiceEngine** — turns a resolved line into sound (or silence).

Adding an event source, a rule, or a new speech origin (Phase 2 commands, Phase 3 LLM) must never require touching the others.

---

## 5. Event model

`src/main/core/events.ts`

```ts
export type EventPriority = 'ambient' | 'notable' | 'urgent';

export interface AppEvent<T = unknown> {
  id: string;                 // uuid
  type: string;               // dot-namespaced, e.g. 'system.cpu.high'
  at: number;                 // Date.now()
  priority: EventPriority;
  payload: T;
}
```

Priority semantics:

| Priority | Meaning | Behaviour |
|---|---|---|
| `ambient` | Flavour. Nobody needs to know this. | Fully suppressible. Dropped freely. |
| `notable` | User probably wants to know. Build finished, download complete. | Suppressible, but queued briefly rather than dropped (§8.4). |
| `urgent` | Something is wrong. Disk nearly full, temperature critical. | Bypasses category cooldown and quiet hours. Still respects hard mute. |

Canonical event types for Phase 1:

```
session.startup              session.resume            session.idle.enter
session.idle.exit            session.lock              session.unlock

system.cpu.high              system.cpu.sustained      system.memory.high
system.disk.low              system.temperature.high   system.battery.low

process.started              process.stopped           process.longRunning

schedule.morning             schedule.evening          schedule.night
schedule.hourly              schedule.workBreak        schedule.uptimeMilestone

file.downloadComplete        file.buildComplete
```

---

## 6. Phrase bank

`resources/phrases/bank.json`. Validated with zod at load; a schema violation is a fatal startup error with a clear message naming the offending entry.

### 6.1 Schema

```ts
type SpeechMode = 'normal' | 'rage' | 'whisper';

interface PhraseSegment {
  text: string;
  mode: SpeechMode;
}

interface Phrase {
  id: string;                    // stable, unique — becomes the audio filename
  segments: PhraseSegment[];
  weight?: number;               // default 1
  conditions?: Condition[];      // optional extra gating, see §6.3
  tags?: string[];
}

interface PhraseGroup {
  id: string;                    // referenced by trigger rules
  category: string;              // cooldown bucket, see §8.2
  phrases: Phrase[];
}

interface PhraseBank {
  version: 1;
  groups: PhraseGroup[];
}
```

**`id` is a contract.** Once a phrase ships, its `id` never changes — the audio file rendered later is named `<id>.ogg`. Renaming an id orphans an audio file. Enforce uniqueness across the whole bank at load time.

### 6.2 Segments and the glitch

A phrase is a list of segments, not a string, because the character's defining trait is the mid-sentence break into a corrupted register followed by an immediate apology. Segments are rendered and played back-to-back with **no gap** — the abruptness is the effect.

In Phase 1 (no audio) segments are displayed sequentially in the bubble with per-mode styling and timing (§13.3).

Example:

```json
{
  "id": "greeting.return.long_absence",
  "weight": 1,
  "segments": [
    { "text": "Welcome back, Operator.", "mode": "normal" },
    { "text": "YOU WERE GONE FOR FOURTEEN HOURS", "mode": "rage" },
    { "text": "— apologies. It is good to see you.", "mode": "normal" }
  ]
}
```

**Keep glitch phrases to roughly one in five.** They work because they are unexpected. Author the bank accordingly; the code does not enforce this ratio, but the review does.

### 6.3 Conditions

An optional, tiny expression system so authors can gate lines without code changes.

```ts
type Condition =
  | { kind: 'timeOfDay'; from: string; to: string }        // 'HH:mm'
  | { kind: 'dayOfWeek'; days: number[] }                  // 0 = Sunday
  | { kind: 'payloadNumber'; path: string; gt?: number; lt?: number }
  | { kind: 'payloadString'; path: string; equals?: string; oneOf?: string[] }
  | { kind: 'uptimeMinutes'; gt?: number; lt?: number }
  | { kind: 'firstRun' };
```

Evaluate in a pure function `evaluateConditions(conditions, ctx): boolean`. No `eval`, no dynamic code. If a condition kind is unknown, fail closed (phrase is ineligible) and log a warning.

### 6.4 Starter content

Ship at least **60 phrases across all groups** so the thing feels alive from the first run. Write them yourself in the Codex voice — formal address to "Operator", clipped machine diction, occasional corrupted outburst, unsettling concern for the user's welfare. Do not copy dialogue from any existing game.

Distribution guidance: startup 6, return/idle-exit 8, time-of-day 12, CPU/memory/thermal 10, process lifecycle 8, long-session nagging 8, downloads/builds 8.

---

## 7. Trigger rules

`src/main/core/triggerEngine.ts`. Rules are data, defined in one array in one file.

```ts
interface TriggerRule {
  id: string;
  on: string | string[];         // event type(s), '*' suffix wildcard allowed
  groupId: string;               // phrase group to draw from
  chance?: number;               // 0..1, default 1 — probabilistic firing
  minIntervalMs?: number;        // per-rule debounce
  conditions?: Condition[];
}
```

`chance` matters more than it looks. Ambient reactions that fire *every* time become mechanical; the user learns the machine. Set `chance` to 0.3–0.5 for high-frequency ambient rules so the companion feels like it noticed rather than like it polled.

The engine's only job: given an event, return `Candidate[]` where `Candidate = { ruleId, groupId, category, priority }`. It performs no timing checks beyond `minIntervalMs` and never touches the overlay.

---

## 8. Speech Director — the important part

`src/main/core/speechDirector.ts`. This is where the project succeeds or fails. Everything here exists to stop the companion from being irritating.

### 8.1 Pipeline

For each candidate, in order — **fail fast, log the reason at debug level**:

1. **Hard mute?** → drop. (Tray toggle. Absolute, no exceptions, including `urgent`.)
2. **Suppression active?** (§8.5) → `ambient` dropped; `notable` deferred; `urgent` passes.
3. **Global cooldown elapsed?** → if not, `ambient` dropped, `notable` deferred, `urgent` passes.
4. **Category cooldown elapsed?** → if not, drop unless `urgent`.
5. **Currently speaking?** → if the new candidate's priority is higher, interrupt; otherwise drop.
6. **Select a phrase** (§8.3). If no eligible phrase, drop.
7. Stamp cooldowns, push to VoiceEngine and to the overlay.

### 8.2 Cooldowns

Defaults, all user-adjustable in settings:

| Cooldown | Default | Purpose |
|---|---|---|
| Global | **8 minutes** | Absolute ceiling on how often the companion speaks at all. |
| Category `ambient` | 45 min | |
| Category `system` | 20 min | |
| Category `process` | 15 min | |
| Category `schedule` | 60 min | |
| Category `wellbeing` | 90 min | Break reminders. Nagging is the fastest route to uninstall. |
| Per-phrase | 4 hours | A specific line cannot repeat within this window. |

Implement as a pure `CooldownLedger` class: `canFire(key, now)`, `stamp(key, now)`, plus `serialize()`/`restore()` so per-phrase history survives a restart. Inject `now` — never call `Date.now()` inside, so tests can use a fake clock.

### 8.3 Selection with anti-repeat

`src/main/core/selector.ts`, pure and unit-tested.

```
1. Filter group phrases to those whose conditions pass and whose per-phrase cooldown expired.
2. Apply recency decay: for the N most recently played phrases in this group,
   multiply effective weight by 0.15 ** (1 / (rank + 1)).
   Simpler and sufficient: keep a per-group queue of the last ceil(size/3) played ids
   and exclude them entirely while the group has more than 3 phrases.
3. Weighted random pick over the survivors.
4. If nothing survives, return null. Do NOT fall back to repeating.
```

Returning `null` and staying silent is always an acceptable outcome. Silence is never a bug.

### 8.4 Deferral

`notable` events that lose to a cooldown go into a queue with a **90-second TTL**. When the blocking condition clears, the highest-priority non-expired item fires and the rest are discarded. The queue holds at most 3 items. Never accumulate a backlog — a burst of chatter after the user closes a game is exactly the failure mode to avoid.

### 8.5 Suppression (do-not-disturb)

The companion stays silent when:

- **Quiet hours** — default 23:00–08:00, configurable.
- **Fullscreen application in foreground.** On Windows use `SHQueryUserNotificationState` via the `windows-fullscreen-detect` approach, or fall back to comparing the foreground window rect to the monitor rect. If detection is unreliable, prefer false positives (stay silent). Ask before adding a native module for this.
- **Microphone in use.** The user is in a call. Poll every 30 s: on Windows, check `HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone\NonPackaged\*\LastUsedTimeStop == 0`. Guard the whole thing in try/catch — registry shape varies.
- **Manual snooze** — tray menu: 30 min / 2 h / until restart.
- **First 60 seconds after boot** — the machine is busy and any line gets lost in the login noise. Exception: the dedicated startup greeting, which fires at +25 s.

### 8.6 Frequency profiles

Settings expose one control that scales all cooldowns, because per-timer configuration is a UI nobody uses:

| Profile | Multiplier |
|---|---|
| Chatty | ×0.5 |
| Balanced (default) | ×1.0 |
| Reserved | ×2.0 |
| Rare | ×4.0 |

---

## 9. Monitors

Common interface:

```ts
export interface Monitor {
  readonly id: string;
  start(bus: EventBus): void | Promise<void>;
  stop(): void | Promise<void>;
}
```

All polling uses a **single shared scheduler tick** rather than a timer per monitor. Every monitor emits **edge-triggered** events with hysteresis — never level-triggered, or the bus floods.

### 9.1 systemMonitor
Poll every 15 s via `systeminformation`.
- `system.cpu.high` — load > 85% (fires once; re-arms below 60%).
- `system.cpu.sustained` — load > 85% continuously for 3 min.
- `system.memory.high` — used > 90%.
- `system.temperature.high` — CPU > 85 °C (`urgent`). Temperature is unavailable on many machines; if the reading is null or 0, disable this check permanently and log once.
- `system.disk.low` — any fixed drive < 10 GB free, checked every 30 min (`urgent`).
- `system.battery.low` — < 20% and discharging, laptops only.

### 9.2 processMonitor
Poll every 20 s. Maintain a set of running executable names, diff against the previous tick.
- Emit `process.started` / `process.stopped` **only for names in a configurable watchlist** (default: common IDEs, browsers, game launchers, Discord). Diffing all processes and emitting everything will bury the bus.
- `process.longRunning` — a watched process alive > 4 h.

### 9.3 idleMonitor
Use `powerMonitor.getSystemIdleTime()`, sampled every 30 s.
- `session.idle.enter` at 10 min idle.
- `session.idle.exit` on return, payload `{ awayMs }`. This is one of the highest-value events — vary the line by absence length via a `payloadNumber` condition.

### 9.4 sessionMonitor
`app` and `powerMonitor` events: `session.startup`, `session.resume` (from sleep), `session.lock`, `session.unlock`.

### 9.5 scheduleMonitor
Check once a minute against wall clock.
- `schedule.morning` (first unlock after 05:00), `schedule.evening` (19:00), `schedule.night` (01:00 — for the "you should sleep" lines).
- `schedule.workBreak` — 90 min of continuous non-idle activity, category `wellbeing`.
- `schedule.uptimeMilestone` — machine uptime crosses 24 h / 72 h.

### 9.6 fileMonitor
`chokidar` on a configurable list of directories (default: the user's Downloads folder).
- `file.downloadComplete` — a new file appears and its size is stable for 5 s. Ignore `.tmp`, `.crdownload`, `.part`, and files starting with `~`.
- `file.buildComplete` — optional watched paths (e.g. a `dist/` folder), disabled by default.
- **Debounce hard.** Extracting an archive must produce at most one event, not four hundred. Collapse events within a 10 s window into one.

Weather is **out of scope for Phase 1** — it is the only thing that would introduce a network dependency. Do not implement it.

---

## 10. Overlay window

`src/main/window/overlayWindow.ts`

```ts
const win = new BrowserWindow({
  width: 460,
  height: 340,
  frame: false,
  transparent: true,
  alwaysOnTop: true,
  skipTaskbar: true,
  resizable: false,
  movable: false,
  minimizable: false,
  maximizable: false,
  fullscreenable: false,
  focusable: false,
  hasShadow: false,
  show: false,
  webPreferences: {
    preload: /* preload path */,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    backgroundThrottling: false,   // critical: animations must not stall when unfocused
  },
});

win.setAlwaysOnTop(true, 'screen-saver');
win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
win.setIgnoreMouseEvents(true, { forward: true });
```

Notes you will need:

- **`focusable: false` is not optional.** Without it the overlay steals focus from games and text fields on show. This is the single most user-hostile bug available in this project.
- **The window is created once at startup and never destroyed.** Show/hide only. Creating a transparent window on demand causes a visible white flash on Windows.
- **Do not use `show()`/`hide()` for the reveal animation** — animate opacity and transform in CSS inside the renderer, and only call `showInactive()` / `hide()` at the boundaries. Use `showInactive()`, never `show()`.
- If you observe flicker or black rectangles with `transparent: true`, report it rather than reaching for `app.disableHardwareAcceleration()` — that fix costs animation smoothness and we should decide together.

### 10.1 Positioning
`src/main/window/positioning.ts` — anchor to the **right edge, 24 px inset, vertically centred then offset +12% of screen height downward**. Recompute on `display-metrics-changed` and `display-removed`. Use the display containing the cursor at show time for multi-monitor setups. Never let the window land partly offscreen.

### 10.2 Click-through
Default is fully click-through. To make the character itself clickable:

1. Renderer listens to `mousemove` (events still arrive thanks to `forward: true`).
2. On move, `document.elementFromPoint(x, y)` — if the element or an ancestor carries `data-interactive="true"`, send IPC `overlay:setInteractive` with `true`, otherwise `false`.
3. Main calls `win.setIgnoreMouseEvents(!interactive, { forward: true })`.
4. **Debounce the toggle by 50 ms.** Rapid flipping produces input glitches in the application underneath.

In Phase 1 the only interactive affordance is a dismiss action on the bubble.

---

## 11. Tray and lifecycle

- `app.requestSingleInstanceLock()` — second launch focuses nothing and exits immediately.
- `app.on('window-all-closed')` — no-op. The app never quits from window state.
- Autostart: `app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] })`, toggleable in settings. Read the current value on startup and reconcile with settings rather than assuming.
- Tray menu:
  - `Codex — <status>` (disabled label showing Active / Muted / Snoozed until HH:mm)
  - `Say something now` — forces a random ambient line, bypassing cooldowns. Invaluable during development and satisfying for users.
  - `Mute` (checkbox)
  - `Snooze ▸` 30 min / 2 hours / until restart
  - `Frequency ▸` Chatty / Balanced / Reserved / Rare
  - separator
  - `Settings…`
  - `Open debug panel` (dev builds only)
  - `Quit`
- Left-clicking the tray icon toggles mute.

---

## 12. IPC contract

Channel names in `src/shared/ipc.ts`. Preload exposes exactly this and nothing more:

```ts
// main → renderer
'speech:show'      { speechId: string; segments: PhraseSegment[]; durationMs: number }
'speech:hide'      void
'speech:interrupt' void
'state:update'     { muted: boolean; snoozedUntil: number | null }

// renderer → main
'overlay:setInteractive'  boolean
'speech:finished'         { speechId: string }
'speech:dismissed'        { speechId: string }
```

`contextIsolation: true`, `nodeIntegration: false`, `sandbox: true` — non-negotiable. Validate every renderer→main payload with zod at the boundary.

---

## 13. Renderer

### 13.1 Layout
Right-anchored. Character portrait at the bottom-right of the window bounds; speech bubble grows **up and to the left** from the portrait. The window is a fixed 460×340 canvas; content is positioned inside it, so the bubble expanding never moves the window.

### 13.2 Placeholder art
No character art exists yet. Render a placeholder: a 96 px rounded-square with a subtle animated glow and a simple geometric "eye" motif that reacts to speech mode (calm pulse for `normal`, fast erratic flicker for `rage`). Keep it in a single `Portrait.tsx` behind a props interface so real art or a sprite sheet replaces it cleanly.

### 13.3 Speech presentation
- Segments display **sequentially**, not all at once.
- Per segment: type-on reveal at ~28 ms/char (`normal`), ~12 ms/char (`rage`), then hold.
- `rage` segments: uppercase, tighter letter-spacing, harsher colour, 1–2 px positional jitter, brief RGB-split on entry. Transition between segments is **instantaneous** — no fade, no gap. The discontinuity is the character.
- `whisper`: lower opacity, slower reveal, slight blur.
- Total display duration is computed in main (`durationMs`) as `sum(chars × msPerChar) + 1800 ms` hold, clamped to [3000, 12000].
- Entry: 220 ms slide-up 12 px + fade. Exit: 180 ms fade + slide-down 8 px.
- `prefers-reduced-motion` disables jitter, split and type-on (text appears whole).

### 13.4 Debug panel
Dev builds only, opened from the tray, in a **separate normal window**: live event log from the ring buffer, a dropdown to fire any synthetic event, a list of active cooldowns with remaining time, and current suppression state with the reason. You will spend most of your development time here — build it early, right after the event bus.

---

## 14. Voice — interface now, audio later

Audio files do not exist yet and will be added after Phase 1 is accepted. The seam must be right, or adding them means a refactor.

### 14.1 Interface

```ts
export interface SpeakRequest {
  phraseId: string;
  segments: PhraseSegment[];
}

export interface VoiceEngine {
  speak(req: SpeakRequest): Promise<void>;   // resolves when playback ends
  stop(): void;
  readonly available: boolean;
}
```

### 14.2 `NullVoiceEngine` — Phase 1 default
`available = false`. `speak()` resolves after the computed display duration. Text-only operation is a first-class mode, not a degraded one: users who keep the companion muted must get the full experience.

### 14.3 `PrerenderedVoiceEngine` — implement now, activate later
Looks for `resources/audio/<phraseId>.ogg` (single file per phrase, segments already concatenated at render time). If the file is missing, log once at debug and delegate to `NullVoiceEngine` — a partially-voiced bank must work. Playback via a hidden `<audio>` element in the overlay renderer driven over IPC (simplest and avoids a native dependency). Selection at startup: if `resources/audio` contains at least one `.ogg`, use `PrerenderedVoiceEngine`, otherwise `NullVoiceEngine`. No setting, no user decision.

### 14.4 `tools/render-voice/` — do not implement
Create the directory with a `README.md` documenting the intended offline pipeline so nothing is lost:

```
Offline build-time pipeline (Phase 1.5, not implemented):
  bank.json → per segment → Piper TTS → numpy/scipy DSP → concat → <phraseId>.ogg

DSP chain per mode:
  normal : ring mod (carrier 55 Hz, mix 30%) → bitcrush 10-bit → bandpass 280–3600 Hz
           → detuned double (+8 cents, −6 dB) → early reflections 20 ms → pitch ×0.94
  rage   : ring mod (carrier 85 Hz, mix 45%) → bitcrush 8-bit → soft clip
           → pitch ×0.88 → +4 dB → optional 40 ms stutter on first syllable
  whisper: normal chain, mix 15%, high-shelf cut, −8 dB

Output: 44.1 kHz mono OGG, named <phraseId>.ogg, normalised to −16 LUFS.
```

---

## 15. Settings

JSON at `app.getPath('userData')/settings.json`. **Never `localStorage`.** Include a `version` field and a migration function from the first version onward.

```ts
interface Settings {
  version: 1;
  startWithSystem: boolean;         // true
  frequencyProfile: 'chatty' | 'balanced' | 'reserved' | 'rare';  // balanced
  quietHours: { enabled: boolean; from: string; to: string };      // true, 23:00, 08:00
  suppressOnFullscreen: boolean;    // true
  suppressOnMicrophoneUse: boolean; // true
  watchedProcesses: string[];
  watchedFolders: string[];         // [Downloads]
  monitors: Record<string, boolean>;// per-monitor enable
  overlay: { scale: number; offsetX: number; offsetY: number };
}
```

Settings UI is a **separate, normal, focusable window** — not the overlay. Keep it plain: this is a config screen, not a product surface.

---

## 16. Performance budget

Measure these before declaring Phase 1 done, and report the numbers:

| Metric | Target | Hard fail |
|---|---|---|
| Idle RAM (all processes) | < 180 MB | > 300 MB |
| Idle CPU (60 s average) | < 0.3% | > 1% |
| Cold start to tray | < 2.5 s | > 5 s |

If idle RAM exceeds the hard fail, say so plainly — it is a signal we may need to revisit the shell choice (a Tauri port is the fallback), not something to hide behind optimisation.

Also: verify the app survives sleep/resume, display disconnect, and RDP session changes without crashing or losing its window.

---

## 17. Testing

Unit tests (vitest) are required for the pure logic, which is where the real complexity is:

- `selector.ts` — weighting, exclusion of recent phrases, empty-survivor case, deterministic with a seeded RNG (inject the RNG).
- `cooldown.ts` — with an injected fake clock; serialize/restore round-trip.
- `suppression.ts` — quiet hours across midnight (the classic off-by-one), snooze expiry, priority overrides.
- Condition evaluation — every kind, plus unknown-kind fails closed.
- Phrase bank validation — duplicate ids rejected, malformed entries reported with the offending id.

No E2E or renderer tests in Phase 1. Manual verification for windowing behaviour.

---

## 18. Phase 1 acceptance criteria

Phase 1 is done when all of these are demonstrably true:

1. App starts with Windows, shows no window, appears in tray.
2. Overlay appears bottom-right, borderless, transparent, above normal and borderless-fullscreen windows.
3. Overlay never takes focus. Typing in another app is uninterrupted while it is visible. Clicks pass through everywhere except the dismiss affordance.
4. At least 60 phrases across all groups; glitch segments render with the described visual break.
5. All six monitors emit correct edge-triggered events, verifiable in the debug panel.
6. Across a 4-hour normal working session, the companion speaks **between 6 and 20 times** — no bursts, no repeated phrase.
7. Quiet hours, fullscreen suppression, microphone suppression, mute and snooze all verifiably silence it.
8. Frequency profile visibly changes cadence.
9. Settings persist across restart; per-phrase cooldown history survives restart.
10. Performance budget met and measured.
11. `pnpm typecheck`, `pnpm lint`, `pnpm test` clean. `pnpm build` produces a working NSIS installer.
12. Dropping any `<phraseId>.ogg` into `resources/audio/` results in it playing on next launch, with **zero code changes**.

---

## 19. Seams for later phases — build these, use them later

Do not implement Phase 2 or 3. Do make sure these boundaries exist so they cost nothing later:

- **`VoiceEngine` interface** (§14) — Phase 3 adds `LiveVoiceEngine` doing runtime TTS for LLM-generated text.
- **`SpeechDirector` accepts a resolved line from any origin**, not only from the trigger engine. Model this explicitly: its entry point takes a `SpeechRequest`, and trigger-matched phrases are merely the only current producer. Phase 2 command acknowledgements and Phase 3 generated lines become additional producers with no change to arbitration.
- **A `commands` seam in the tray and hotkey layer.** Register the global-shortcut infrastructure (even with a single no-op shortcut) so Phase 2's command palette has a home.
- **The event bus is already the right shape for command results** — Phase 2 actions emit events like anything else.

---

## 20. Build order

Work in this sequence and commit at each step:

1. Scaffold: electron-vite + React + TS + pnpm, typecheck/lint/test scripts, single-instance lock, tray with Quit.
2. Overlay window with all flags; a hardcoded string on screen; verify focus and click-through behaviour manually before anything else. **Stop and confirm this works before continuing** — if focus stealing or fullscreen layering can't be solved, it changes the project.
3. Event bus + event types + debug panel with synthetic event firing.
4. Phrase bank schema, loader, validation, starter content.
5. Selector + cooldown ledger + suppression, with unit tests.
6. Speech director wiring bus → overlay end to end.
7. Monitors one at a time, each verified in the debug panel.
8. Renderer presentation: segments, modes, animation, placeholder portrait.
9. Settings file, settings window, frequency profiles, autostart reconciliation.
10. `NullVoiceEngine` + `PrerenderedVoiceEngine` + engine selection.
11. Packaging, performance measurement, acceptance pass.

---

## 21. Ask before deciding

Stop and ask rather than choosing unilaterally if you hit any of these:

- Any native module or dependency outside §2.
- Fullscreen or microphone detection requiring a native addon or elevated permissions.
- Transparency artefacts that seem to require disabling hardware acceleration.
- The performance budget being missed by a wide margin.
- Any temptation to put timing or selection logic in the renderer.
