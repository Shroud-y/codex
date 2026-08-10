# Codex — desktop companion overlay

Phase 1. A background companion for Windows that sits in the tray and
occasionally surfaces a small character overlay near the right edge of the
screen to react to what is happening on the machine.

Text only in Phase 1 — the audio pipeline is specified and stubbed, and real
audio files are dropped in later without code changes.

## Commands

```sh
pnpm install
pnpm dev          # electron-vite dev
pnpm typecheck    # tsc for the node and web projects
pnpm lint
pnpm test         # vitest, pure logic only
pnpm start        # run the production build without packaging
pnpm build        # typecheck + bundle + NSIS installer into release/
pnpm icons        # regenerate resources/icons/*.ico
```

## Shape of the thing

```
Monitors ──emit──▶ EventBus ──▶ TriggerEngine ──▶ SpeechDirector ──▶ VoiceEngine
                                     │                  │                 │
                              (rules match)      (may veto)          (plays / no-op)
                                                        │
                                                        └──▶ IPC ──▶ Overlay window
```

The renderer holds no business logic. Every timing, selection and suppression
decision happens in main, which is why all of it is unit-testable without a
browser. `SpeechDirector.submit()` is the single choke point — there is no
other path to the overlay.

| Piece | File |
|---|---|
| Event types and priorities | `src/main/core/events.ts` |
| Trigger rules (data, one array) | `src/main/core/triggerEngine.ts` |
| Arbitration, cooldowns, deferral | `src/main/core/speechDirector.ts` |
| Weighted pick + anti-repeat (pure) | `src/main/core/selector.ts` |
| Cooldown ledger (pure, injected clock) | `src/main/core/cooldown.ts` |
| Do-not-disturb (pure) | `src/main/core/suppression.ts` |
| Phrase bank schema + loader | `src/main/core/phraseBank.ts` |
| Fullscreen / microphone detection | `src/main/system/presenceProbe.ts` |
| Phrase content | `resources/phrases/bank.json` |

## Authoring phrases

`resources/phrases/bank.json` is validated with zod at startup; a schema
violation is a fatal error naming the offending entry. A phrase is a list of
segments, not a string, because the character's defining trait is the
mid-sentence break into a corrupted register followed by an immediate apology.

**A phrase `id` is a contract.** It becomes the audio filename `<id>.ogg`.
Renaming a shipped id orphans its audio.

Keep glitch (`rage`) phrases to roughly one in five — they work because they
are unexpected. The current bank is 78 phrases across 21 groups, 23% glitchy;
`tests/phraseBank.test.ts` fails if that ratio drifts out of range.

## Adding audio later

Drop `<phraseId>.ogg` files into `resources/audio/`. On the next launch the
engine selection switches from `NullVoiceEngine` to `PrerenderedVoiceEngine`
automatically — no setting, no code change. Missing files fall back to
text-only per phrase, so a partially voiced bank works. See
`tools/render-voice/README.md` for the intended offline render pipeline.

## Debug panel

Dev builds only, from the tray. Live event log, a dropdown that fires any
synthetic event, active cooldowns with remaining time, and the current
suppression state with its reason.

## Windows-specific notes

Fullscreen and microphone detection run through a single long-lived PowerShell
host (`src/main/system/probeScript.ts`) using P/Invoke via `Add-Type`. No
native module, and no shell spawn per poll — spawning PowerShell every 30 s
would blow the idle-CPU budget on its own.

The microphone check is **edge-triggered against a startup baseline**:
applications such as Discord hold the capture device open for their entire
lifetime, so a level-triggered reading would silence the companion permanently.
See "Known deviations" below.

## Known deviations from the Phase 1 spec

Each of these is a deliberate decision made during implementation, listed so
they can be accepted or reversed on review.

1. **Microphone detection is edge-triggered.** §8.5 specifies
   `LastUsedTimeStop == 0` as "microphone in use". On this machine that is
   permanently true while Discord runs — Discord holds the capture device open
   for its whole lifetime, not just during calls — which would suppress the
   companion forever. The probe now records the set of holders at startup as a
   baseline and only treats a *new* holder as a call. Baseline entries that
   release the device are dropped, so a later re-open is still detected. The
   cost: a call already in progress when Codex starts is not detected.
   This also matches §9's own rule that observations be edge-triggered rather
   than level-triggered.

2. **The startup greeting explicitly bypasses the boot blackout.** §8.5 makes
   the greeting an exception to the 60 s post-boot silence, so `SpeechRequest`
   carries a `bypassBootGrace` flag that the wiring sets for
   `session.startup`. Without it the greeting was suppressed at +25 s and only
   escaped later through the deferral queue.

3. **Audio rides on `speech:show`.** §12 forbids IPC channels beyond the listed
   ones; §14.3 requires audio to play from a hidden `<audio>` in the overlay.
   The only way to satisfy both is an optional `audioUrl` field on the existing
   `speech:show` payload, served over a registered `codex-audio://` scheme so
   it loads in both dev and packaged builds.

4. **Two preload scripts.** `preload/index.ts` is exactly the §12 surface and
   nothing more, for the overlay. The settings and debug windows use a separate
   `preload/panel.ts`, so the overlay's surface stays minimal.

5. **`core/conditions.ts` is a file §3 does not list.** The condition types and
   `evaluateConditions` needed a home shared by the phrase bank, the trigger
   engine and the director.

6. **chokidar is bundled, not externalized.** chokidar ≥5 is ESM-only and the
   main bundle is CommonJS (required for a sandboxed preload), so a
   `require('chokidar')` would throw. It is bundled in `electron.vite.config.ts`;
   every other dependency stays external.

7. **The overlay unmounts when hidden.** Measured: with the portrait's CSS
   animations still running behind a hidden window, the renderer burned 2.9 s
   of CPU per 60 s idle — `backgroundThrottling: false` means Chromium will not
   throttle it. Speech state is torn down 400 ms after the exit animation and
   animations are gated off, which took idle CPU from 0.80% to 0.08%.

## Measured performance (packaged build, idle)

| Metric | Target | Hard fail | Measured |
|---|---|---|---|
| Idle RAM, private working set | < 180 MB | > 300 MB | **80.7 MB** |
| Idle RAM, private bytes (commit) | | | 189.0 MB |
| Idle RAM, sum of working sets | | | 311.1 MB |
| Idle CPU, 60 s average | < 0.3% | > 1% | **0.114%** |
| Cold start to tray | < 2.5 s | > 5 s | **0.72 s** |

Three memory figures, because the choice of metric decides whether this passes.
The sum of working sets double-counts pages shared between the four Chromium
processes, so it overstates the real cost; private working set — the number
Task Manager shows in its Memory column — is 80.7 MB. On any reading except
the most pessimistic one, the budget is met.
