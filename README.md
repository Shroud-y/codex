<img src="resources/icons/app.png" width="96" height="96" alt="Codex app icon">

# Codex

A desktop companion for Windows. It sits in the tray, watches what's
happening on your machine, and occasionally pops up a small character near
the edge of the screen to say something about it — dry, a little paranoid,
never asks permission first.

Phase 1, text only. The audio pipeline is built and just waiting for voice
files to be dropped in — see [Adding voice audio](#adding-voice-audio).

![Ordis speaking over the desktop](resources/screenshots/overlay.png)

## What it reacts to

- **Apps and games launching or closing** — Steam, your game clients, and a
  growing list of specific games each get their own lines; anything else on
  the watchlist gets a generic one.
- **System state** — CPU/memory/temperature spikes, low disk, low battery.
- **Your session** — lock/unlock, coming back from being idle, waking from
  sleep.
- **The clock** — morning/evening/night greetings, hourly check-ins, work
  breaks, and a line when nothing has happened in a while.
- **Files** — a download finishing, a build completing.

It goes quiet on its own during quiet hours, while a fullscreen app (like a
game) is in front, or while your microphone is in a call — so it doesn't talk
over you.

## Install

Grab the installer from `release/Codex Setup 0.1.0.exe` (built with
`pnpm build`, see below) and run it. Codex starts with Windows and lives in
the tray — closing its windows never quits it, only **Quit** from the tray
menu does.

## Using it

Right-click the tray icon:

| Item | Does |
|---|---|
| Say something now | Forces a line immediately, ignoring cooldowns and quiet-mode — good for checking it's alive |
| Mute | Silences it completely until you unmute |
| Snooze | 30 minutes, 2 hours, or until restart |
| Frequency | Chatty / Balanced / Reserved / Rare — scales how often it speaks |
| Settings… | Opens the settings window (below) |
| Quit | Actually exits |

## Configuring

From **Settings…**:

- **Appearance** — switch the character's skin, live, no restart.
- **Frequency profile** — same four levels as the tray menu.
- **Quiet hours** — a daily window where it stays silent regardless of
  frequency.
- **Suppress on fullscreen / while a mic is active** — on by default, so a
  game or a call isn't interrupted.
- **Watched processes** — one `.exe` name per line. Codex only reacts to
  processes on this list; add or remove freely.
- **Watched folders** — one path per line, for the download-complete
  reaction. Restart to pick up changes.

## Development

```sh
pnpm install
pnpm dev          # electron-vite dev
pnpm design       # overlay design harness in a browser, no Electron
pnpm typecheck    # tsc for the node and web projects
pnpm lint
pnpm test         # vitest, pure logic only
pnpm start        # run the production build without packaging
pnpm build        # typecheck + bundle + NSIS installer into release/
pnpm icons        # regenerate resources/icons/*.ico
```

Run `pnpm design` before touching anything visual — it shows every character
state over four backgrounds with the checks the design has to pass, with no
Electron and no monitors running.

## How it's built

```
Monitors ──emit──▶ EventBus ──▶ TriggerEngine ──▶ SpeechDirector ──▶ VoiceEngine
                                     │                  │                 │
                              (rules match)      (may veto)          (plays / no-op)
                                                        │
                                                        └──▶ IPC ──▶ Overlay window
```

The renderer holds no business logic — every timing, selection and
suppression decision happens in main, which is why it's all unit-testable
without a browser. The full architecture, the Windows-specific plumbing, the
deliberate deviations from the original spec, and the measured performance
numbers are in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**.

## Authoring phrases

`resources/phrases/bank.json` is what Codex says, grouped by situation and
validated with zod at startup — a bad entry is a fatal error naming the
offending phrase. A few rules:

- A phrase is a list of **segments**, not a single string — the character's
  defining trait is breaking mid-sentence into a corrupted `rage` register
  and immediately apologising. Keep `rage` segments to roughly one in five;
  they land because they're rare. (`tests/phraseBank.test.ts` fails the
  build if that ratio drifts.)
- **A phrase `id` is a contract** — it becomes the audio filename
  `<id>.ogg`. Don't rename a shipped id, or its audio goes with it.
- Situational reactions (a specific game, app, or launcher) live in their
  own `process.started.*` / `process.stopped.*` groups in the bank, matched
  by process name in `src/main/core/triggerEngine.ts`. Add a new game or app
  there and to `DEFAULT_WATCHED_PROCESSES` in
  `src/main/settings/settings.ts`.

## Adding voice audio

Drop `<phraseId>.ogg` files into `resources/audio/`. On the next launch the
engine switches from text-only to playing them automatically — no setting,
no code change, and a partially voiced bank just falls back to text per
missing phrase. See `tools/render-voice/README.md` for the intended offline
render pipeline. The overlay's own appear/disappear cues are separate — see
`resources/audio/cues/README.md`.

## Debug panel

Dev builds only, opened from the tray. Live event log, a dropdown that fires
any synthetic event, active cooldowns with remaining time, and the current
suppression state with its reason.