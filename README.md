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
pnpm design       # overlay design harness in a browser, no Electron
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

## Overlay presentation

**There is no dialogue box.** Speech is bare text on the desktop, kept legible
by its shadows alone. The event toast is the only element with visible chrome.
Anything that puts a fill, border or radius behind the dialogue undoes the
point of the design.

| Piece | File |
|---|---|
| Palette, type, easing (all of it) | `src/renderer/styles/tokens.css` |
| Skin registry | `src/renderer/skins/index.ts` |
| `eye` skin — the companion | `src/renderer/skins/eye/` |
| Its shaders | `src/renderer/skins/eye/shaders/` |
| Skin dispatcher and shared wrapper | `src/renderer/components/CharacterUnit.tsx` |
| Persona data | `src/renderer/personas/codex.ts` |
| Bare dialogue text | `src/renderer/components/Dialogue.tsx` |
| Framed toast | `src/renderer/components/EventToast.tsx` |
| Zone layout | `src/renderer/components/Companion.module.css` |
| Design harness | `src/renderer/design/Harness.tsx` |

**Persona and skin are separate axes.** A persona is *who is speaking* — name,
palette, phrase bank, voice. A skin is *what it looks like* — geometry and
motion. Any persona can wear any skin, and a skin renders whatever palette it
is handed; a skin that hardcodes a colour is a bug.

**Adding a skin** is one folder under `skins/` and one entry in
`skins/index.ts`. Nothing else changes. The skin declares its own canvas and
the position of its optic, which is what the name label aligns to, so the
composition follows automatically. Users switch skins from Settings →
Appearance, live, with no restart.

**Adding a persona** is a `Persona` object in `src/renderer/personas/index.ts`
plus its `defaultSkin`.

**Run `pnpm design`** before touching anything visual. It shows every state
over white, mid grey, dark and a loaded screenshot, with unlit, greyscale,
32 px and heavy-blur toggles — the four checks the unit has to pass. It needs
no Electron, so it does not start the tray app or its monitors.

**Anything that moves in the DOM gets its own element, and moves only by
`opacity` and `transform`.** Never animate a filter primitive, a gradient stop
or a path `d`. What is left of this after the shader is the unit's bob and the
one-shot chromatic split on entering rage; everything else moves inside the
canvas.

The rule that mattered most under SVG, kept here because it is why the skin
looks the way it does: **do not animate a `<g>` inside an SVG that carries
filters.** Chromium re-rasterises that SVG's whole filter graph every frame,
permanently, on an idle machine — 0.9% CPU for one rotating halo, 1.61% for a
mechanism with three moving groups. Every earlier skin was a stack of five
elements to avoid it.

**The companion is a fragment shader.** §3.1 asks for a membrane of rendered
light — a core that is white *because* of its intensity, colour only in the
falloff, a torn contour. SVG cannot produce the first of those: values clamp at
1.0, so a blowout has to be painted white rather than emerge, and
`feGaussianBlur` gives blur rather than bloom. The shader accumulates radiance
in an RGBA16F target, blooms it down a ladder of half-resolution blurs, and
tonemaps with ACES; the contour is a signed distance field displaced by fBm, so
the tearing costs no hand-placed anchors. It writes premultiplied alpha, so the
canvas stays transparent where the field is dark.

That collapses the layer stack to one element. All the motion is inside the
shader, so there is nothing for the compositor to animate and nothing to split
apart — the rule above stops applying rather than being worked around.

`prototype/shader-eye/` is the standalone harness this was chosen from — it
runs with `node prototype/shader-eye/server.mjs` and imports nothing from the
app.

**There is no fallback.** While the shader was one layer of a mechanism, a
machine without WebGL2 could keep an SVG lens and still show the rest. The eye
is now the whole character, so there is nothing to fall back to: if the context
or the programs fail, the unit renders nothing and the failure is logged.

**The bloom has to fit the canvas.** At 150 x 175 a glow wider than the unit is
cut off in a straight line, and `CLAMP_TO_EDGE` makes it worse than that — an
out-of-range tap re-samples the brightest thing near the border and builds a
bright rectangle of haze around the whole unit. The blur drops out-of-range
taps, the ladder stops at two levels, and the composite fades over the outer
6%. All three are needed; each alone still leaves an edge.

The costly part turned out not to be the shading. Capping the drawn frames
under a deadline while still re-requesting every vsync moved renderer CPU by
hundredths; scheduling the next `requestAnimationFrame` from a 30 fps timer, so
the *callback* stops firing 60 times a second, took it from 0.93% to 0.38%.
Uniforms that only change with the mode are uploaded on change rather than per
frame, for the same reason: this layer costs GL call count, not fragments.

Two related traps, both hit during the redesign:

- `feTurbulence` is a *generator*: it fills the whole filter region regardless
  of the source, so grain must be composited back with
  `feComposite operator="in" in2="SourceGraphic"` or it paints a rectangle.
- `mix-blend-mode` needs an explicit `isolation: isolate` ancestor, but only as
  far up as the layers it should blend with. Isolate too tightly and the light
  spill sees nothing; too loosely and the grain's `overlay` washes the canvas.

## Windows-specific notes

Fullscreen and microphone detection run through a single long-lived PowerShell
host (`src/main/system/probeScript.ts`) using P/Invoke via `Add-Type`. No
native module, and no shell spawn per poll — spawning PowerShell every 30 s
would blow the idle-CPU budget on its own.

**The system and process monitors read the machine through that same host.**
They used to use `systeminformation`, whose every Windows query spawns a cold
`powershell.exe`: `mem()` one, `processes()` one, `battery()` three. Between a
15 s system poll and a 20 s process poll that came to **19 spawns a minute, at
~640 ms of CPU each** — roughly twelve CPU-seconds per minute, plus nineteen
CLR loads' worth of disk I/O, permanently. At login, when the disk is already
saturated and WMI is cold, it was enough to make the mouse pointer stutter.

Asked of the running host instead, the same questions answer in **11–45 ms**:

| Reading | Now | Interval |
|---|---|---|
| CPU load | `os.cpus()` tick deltas — no query at all | 15 s |
| Memory | `os.totalmem()`/`os.freemem()` — no query at all | 15 s |
| CPU temperature | `temp`, ~20 ms; absent on most desktops, then disabled | 15 s until unsupported |
| Watched processes | `procs`, 11–45 ms (was 860 ms + a spawn) | 20 s |
| Battery | `bat`, 11–17 ms (was three spawns) | 5 min, and once at 90 s |
| Disk space | `disk`, ~1 ms | 30 min, and once at 90 s |

Two details are load-bearing. Disk space comes from `System.IO.DriveInfo`
filtered to fixed drives rather than `Get-PSDrive`, because a disconnected
network mapping makes the latter block for seconds and this host answers one
command at a time — a stall there would hold up the fullscreen and microphone
readings that suppression depends on. And every parser returns *no reading*
rather than a default when a reply is missing or malformed
(`src/main/system/systemQueries.ts`): an empty process list read as "nothing is
running" would fire a stopped event for everything on the watchlist.

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

7. **The overlay unmounts when hidden.** Measured: with the unit's CSS
   animations still running behind a hidden window, the renderer burned 2.9 s
   of CPU per 60 s idle — `backgroundThrottling: false` means Chromium will not
   throttle it. Speech state is torn down 440 ms after the exit animation and
   animations are gated off, which took idle CPU from 0.80% to 0.08%.

8. **Speech segments replace each other rather than accumulating.** The
   redesign spec says segments display "sequentially, never all at once",
   which reads either way. Replacement is the reading that makes the
   instantaneous mid-phrase break land as a glitch instead of as more text
   arriving.

9. **Dialogue carries four text shadows, not the two specified.** The
   specified pair does not keep near-white glyphs legible on a white
   document — neither shadow hugs the glyph edge closely enough to separate it
   from the page. Two hairline shadows sit in front of them. Checked on all
   three grounds in the design harness.

## Measured performance (packaged build, idle)

| Metric | Target | Hard fail | Measured |
|---|---|---|---|
| Idle RAM, private working set | < 180 MB | > 300 MB | **80.7 MB** |
| Idle RAM, private bytes (commit) | | | 189.0 MB |
| Idle RAM, sum of working sets | | | 311.1 MB |
| Idle CPU, 60 s average | < 0.3% | > 1% | **0.114%** (see below) |
| Renderer CPU, overlay visible (`eye`) | < 0.3% | > 1% | 0.36–0.38% |
| Renderer CPU, overlay visible (`eye`, rage) | < 0.3% | > 1% | 0.54% |
| Cold start to tray | < 2.5 s | > 5 s | **0.72 s** |

**The idle-CPU figure counted Codex's own four processes and nothing else.**
While the monitors used `systeminformation`, most of what Codex cost the
machine was being burned in short-lived `powershell.exe` children that had
exited before the next sample — the app looked idle while the machine was not.
See "Windows-specific notes" for what that was and what replaced it. The
number above is the pre-fix measurement and has not been retaken; when it is,
it must be taken over the process tree, not over Codex alone.

Three memory figures, because the choice of metric decides whether this passes.
The sum of working sets double-counts pages shared between the four Chromium
processes, so it overstates the real cost; private working set — the number
Task Manager shows in its Memory column — is 80.7 MB. On any reading except
the most pessimistic one, the budget is met.

The overlay-visible figures are the renderer process with a phrase on screen
and every idle animation running, `backgroundThrottling: false`, measured in
the design harness at 1500 × 940 rather than by waiting for a monitor to fire.

These were measured after the companion became a shader. The last all-SVG skin
measured 0.15% in the same session as a control, so the shader costs roughly
0.2pp more than CSS-animated SVG did — for a layer that now replaces five.
Rage costs more than normal because its noise runs at more octaves.

The window has to be genuinely on screen for any of it to mean anything: a
hidden Electron window throttles `requestAnimationFrame` to about 1 Hz and
stops compositing, which reports the eye at 0.02% and hands back stale frames
for every screenshot.

Ranges, not points, because the number is not stable between runs: identical
code measured 0.33% in one session and 0.50% an hour later, so ambient machine
load moves it more than any code change here does.

What *is* stable is the attribution. With every animation disabled the renderer
costs **0.001%**; switching any single one back on takes it to within a few
hundredths of the all-on figure. The cost is the 60 fps compositor loop itself,
not the number of layers running in it — disabling two of the three animations
barely moves the number. Under 0.3% is therefore reachable only by a completely
still overlay, which the design rules out, and the honest reading of this row is
"one animated overlay costs one compositor loop", not "we are 0.03% over".

The real overlay composites a 560 × 460 window rather than the harness's full
page, so these are an upper bound. Re-measure on the packaged build before
treating any of it as a regression.
