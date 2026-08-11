# shader-eye — isolated prototype

An evaluation prototype: the companion's eye rendered as a WebGL2 fragment
shader instead of SVG, so the two can be compared before anything is decided.

**This folder is self-contained and touches nothing in the app.** It imports no
app code, is imported by no app code, and adds no dependency — the server is
Node built-ins only, and the capture harness borrows the Electron binary that
`node_modules` already has. Deleting `prototype/` removes every trace.

## Run

```
node prototype/shader-eye/server.mjs      # → http://127.0.0.1:5178/
```

Any browser with WebGL2. All uniforms are live — no reload.

## Screenshots and benchmarks

```
npx electron prototype/shader-eye/capture.mjs
```

Writes `shots/*.png` and `bench.json`. Nothing else on the machine is touched.
It disables vsync so the GPU timings measure the shader rather than the
monitor; the `fps` field in `bench.json` is therefore not a real-world frame
rate, and `gpuMedianMs` is the number to read.

## Layout

| file | what it is |
| --- | --- |
| `index.html` | page, control panel markup, styling |
| `app.js` | GL setup, the pass chain, sliders, timing |
| `shaders/eye.frag` | the eye: SDF, domain warp, membrane, core, interior |
| `shaders/blur.frag` | one axis of a separable gaussian |
| `shaders/composite.frag` | background + bloom, tonemap, dither |
| `capture.mjs` | Electron screenshot + benchmark harness |

## The pass chain

1. **Eye → RGBA16F.** Nothing clamps; radiance runs past 1.0 on purpose.
2. **Bloom ladder.** Four half-steps (½ → 1/16). The tight bloom is read off
   level 0, the wide one off level 3. Width comes from downsampling, not from
   stretching the kernel — seven taps cannot cover thirty texels, and trying
   produces comb ringing rather than a wide gaussian.
3. **Composite.** Background *plus* radiance, then ACES (or Reinhard), then a
   one-LSB dither. Adding before tonemapping is deliberate: it is what makes a
   bright background eat the eye, which is a behaviour worth seeing.

## Controls

Sliders for warp amplitude, octaves, noise scale, membrane thickness and
thickness variation, core intensity and radius, dispersion, interior volume,
aperture openness, both bloom radii and strengths, exposure, time scale; colour
pickers for base and core hue. Buttons: **rage preset** (snaps, no transition),
**reset**, **copy uniforms** (JSON to clipboard), **hide chrome**. Selectors for
background (near-black / bright wallpaper / mid grey), tonemapper, and render
size — including an overlay-sized 300×350 preset, since the app's skin canvas is
150×175 and a fullscreen quad is not the cost that would actually be paid.

The wallpaper is generated at runtime rather than shipped, so the folder stays
binary-free.
