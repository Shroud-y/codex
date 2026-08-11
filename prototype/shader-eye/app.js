/* global document, window, fetch, performance, console, requestAnimationFrame, navigator */

// ---------------------------------------------------------------- params ---

/** Everything live-adjustable. `u` is the uniform name where one exists. */
const PARAMS = [
  { u: 'uWarpAmp', label: 'warp amplitude', min: 0, max: 0.12, step: 0.001, value: 0.034 },
  { u: 'uOctaves', label: 'noise octaves', min: 1, max: 6, step: 0.1, value: 4.0 },
  { u: 'uNoiseScale', label: 'noise scale', min: 0.5, max: 24, step: 0.1, value: 6.4 },
  { u: 'uThickness', label: 'membrane thickness', min: 0.0005, max: 0.03, step: 0.0005, value: 0.006 },
  { u: 'uThickVar', label: 'thickness variation', min: 0, max: 1, step: 0.01, value: 0.62 },
  { u: 'uCoreIntensity', label: 'core intensity', min: 0, max: 12, step: 0.05, value: 1.5 },
  { u: 'uCoreRadius', label: 'core radius', min: 0.02, max: 1.2, step: 0.01, value: 0.2 },
  { u: 'uDispersion', label: 'dispersion', min: 0, max: 0.2, step: 0.001, value: 0.035 },
  { u: 'uInterior', label: 'interior volume', min: 0, max: 3, step: 0.02, value: 0.9 },
  { u: 'uOpenness', label: 'aperture openness', min: 0, max: 1, step: 0.01, value: 1.0 },
  { u: 'uRadiusA', label: 'bloom A radius (tight, ½ res)', min: 0.2, max: 3, step: 0.05, value: 1.2 },
  { u: 'uStrengthA', label: 'bloom A strength', min: 0, max: 3, step: 0.01, value: 0.55 },
  { u: 'uRadiusB', label: 'bloom B radius (wide, 1/16 res)', min: 0.2, max: 3, step: 0.05, value: 1.5 },
  { u: 'uStrengthB', label: 'bloom B strength', min: 0, max: 3, step: 0.01, value: 0.8 },
  { u: 'uExposure', label: 'exposure', min: 0.05, max: 6, step: 0.01, value: 1.0 },
  { u: 'uTimeScale', label: 'time scale', min: 0, max: 4, step: 0.01, value: 1.0 }
];

const COLOURS = [
  { u: 'uBaseHue', label: 'base hue', value: '#3FC8DC' },
  { u: 'uCoreHue', label: 'core hue', value: '#B8F4FF' }
];

/*
 * Rage. Red, not fire. Three things were making it read as flame and all three
 * are held down here: dispersion, which literally paints a spectrum along the
 * contour; a wide core, whose blowout ramps red through orange and yellow on
 * its way to white; and a peach core hue whose green sits above its blue.
 * Damage comes from warp and thickness variation instead.
 */
const RAGE = {
  uOpenness: 0.14,
  uWarpAmp: 0.072,
  uOctaves: 5.4,
  uNoiseScale: 9.8,
  uThickVar: 0.85,
  uThickness: 0.0085,
  uCoreIntensity: 1.3,
  uCoreRadius: 0.07,
  uDispersion: 0.03,
  uBaseHue: '#E80808',
  uCoreHue: '#FF5A5A'
};

const state = {};
for (const p of PARAMS) state[p.u] = p.value;
for (const c of COLOURS) state[c.u] = c.value;
const defaults = { ...state };

let bgMode = 0;
let tonemap = 0;
let renderPreset = 'native';

// -------------------------------------------------------------- gl setup ---

const canvas = document.getElementById('gl');
const gl = canvas.getContext('webgl2', {
  antialias: false,
  alpha: false,
  powerPreference: 'high-performance'
});
if (!gl) throw new Error('WebGL2 unavailable');

const floatExt = gl.getExtension('EXT_color_buffer_float')
  || gl.getExtension('EXT_color_buffer_half_float');
if (!floatExt) throw new Error('no float render targets - HDR chain cannot run');

const timerExt = gl.getExtension('EXT_disjoint_timer_query_webgl2');

function compile(type, src, name) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    throw new Error(name + ': ' + gl.getShaderInfoLog(sh));
  }
  return sh;
}

function program(vsSrc, fsSrc, name) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl.VERTEX_SHADER, vsSrc, name + '.vert'));
  gl.attachShader(p, compile(gl.FRAGMENT_SHADER, fsSrc, name + '.frag'));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    throw new Error(name + ' link: ' + gl.getProgramInfoLog(p));
  }
  const cache = {};
  const loc = new Proxy(cache, {
    get(target, key) {
      if (!(key in target)) target[key] = gl.getUniformLocation(p, key);
      return target[key];
    }
  });
  return { p, loc };
}

/** Colour-only render target, half-float so radiance can exceed 1.0. */
function target(w, h) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, w, h };
}

/**
 * Scene plus a mip-like ladder of half-resolution levels. Two ping-pong
 * targets per level, because a separable blur needs somewhere to put the
 * horizontal pass. The tight bloom is read off level 0 (½), the wide one off
 * level 3 (1/16).
 */
const rt = { scene: null, levels: [] };
const LEVELS = 4;

function allocate(w, h) {
  if (rt.scene) {
    gl.deleteTexture(rt.scene.tex);
    gl.deleteFramebuffer(rt.scene.fbo);
  }
  for (const pair of rt.levels) {
    for (const t of pair) {
      gl.deleteTexture(t.tex);
      gl.deleteFramebuffer(t.fbo);
    }
  }
  rt.scene = target(w, h);
  rt.levels = [];
  for (let i = 0; i < LEVELS; i++) {
    const lw = Math.max(1, w >> (i + 1));
    const lh = Math.max(1, h >> (i + 1));
    rt.levels.push([target(lw, lh), target(lw, lh)]);
  }
}

/**
 * A bright, busy wallpaper, generated rather than shipped so the folder stays
 * self-contained and binary-free. Deliberately light: this is the hostile case.
 */
function wallpaperTexture() {
  const c = document.createElement('canvas');
  c.width = 1024;
  c.height = 640;
  const x = c.getContext('2d');
  const sky = x.createLinearGradient(0, 0, 0, 640);
  sky.addColorStop(0, '#8fbde8');
  sky.addColorStop(0.5, '#dfeaf2');
  sky.addColorStop(1, '#cbb894');
  x.fillStyle = sky;
  x.fillRect(0, 0, 1024, 640);

  // Soft light patches, then some mid-tone structure. A wallpaper that is
  // uniformly near-white would be a strawman: real ones have contrast, and the
  // eye has to survive both the light parts and the darker ones.
  for (let i = 0; i < 8; i++) {
    const g = x.createRadialGradient(
      Math.random() * 1024, Math.random() * 300, 0,
      Math.random() * 1024, Math.random() * 300, 80 + Math.random() * 200
    );
    g.addColorStop(0, 'rgba(255,252,240,' + (0.2 + Math.random() * 0.3) + ')');
    g.addColorStop(1, 'rgba(255,252,240,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 1024, 640);
  }
  for (let i = 0; i < 55; i++) {
    x.globalAlpha = 0.14 + Math.random() * 0.3;
    x.fillStyle = 'hsl(' + (25 + Math.random() * 70) + ',' + (30 + Math.random() * 45) + '%,' +
      (28 + Math.random() * 44) + '%)';
    x.fillRect(Math.random() * 1024, Math.random() * 640, 30 + Math.random() * 240, 20 + Math.random() * 180);
  }
  x.globalAlpha = 1;
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

function rgb(hex) {
  return [
    parseInt(hex.slice(1, 3), 16) / 255,
    parseInt(hex.slice(3, 5), 16) / 255,
    parseInt(hex.slice(5, 7), 16) / 255
  ];
}

// ---------------------------------------------------------------- render ---

let progEye = null;
let progBlur = null;
let progComposite = null;
let wallpaper = null;
let simTime = 0;
let lastNow = performance.now();

function renderSize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (renderPreset === 'overlay') return [300, 350];   // ~2x the app's skin canvas
  if (renderPreset === '1080p') return [1920, 1080];
  if (renderPreset === '4k') return [3840, 2160];
  return [Math.round(window.innerWidth * dpr), Math.round(window.innerHeight * dpr)];
}

function resize() {
  const size = renderSize();
  if (canvas.width !== size[0] || canvas.height !== size[1]) {
    canvas.width = size[0];
    canvas.height = size[1];
    allocate(size[0], size[1]);
  }
  // Fit the backing store into the window, preserving aspect.
  const scale = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height);
  canvas.style.width = Math.round(canvas.width * scale) + 'px';
  canvas.style.height = Math.round(canvas.height * scale) + 'px';
}

function pass(t, prog) {
  gl.bindFramebuffer(gl.FRAMEBUFFER, t ? t.fbo : null);
  gl.viewport(0, 0, t ? t.w : canvas.width, t ? t.h : canvas.height);
  gl.useProgram(prog.p);
}

function drawFullscreen() {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

function blurInto(dst, srcTex, dx, dy, radius) {
  pass(dst, progBlur);
  gl.uniform2f(progBlur.loc.uDstSize, dst.w, dst.h);
  gl.uniform2f(progBlur.loc.uDir, dx, dy);
  gl.uniform1f(progBlur.loc.uRadius, radius);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, srcTex);
  gl.uniform1i(progBlur.loc.uSrc, 0);
  drawFullscreen();
}

/** Blur src into level `i`, halving as it goes. Returns the level's result. */
function blurLevel(i, srcTex, radius) {
  const [ping, pong] = rt.levels[i];
  blurInto(ping, srcTex, 1, 0, radius);
  blurInto(pong, ping.tex, 0, 1, radius);
  return pong;
}

function renderFrame(dt) {
  simTime += dt * state.uTimeScale;

  // 1 - the eye, into HDR.
  pass(rt.scene, progEye);
  gl.uniform2f(progEye.loc.uResolution, rt.scene.w, rt.scene.h);
  gl.uniform1f(progEye.loc.uTime, simTime);
  for (const p of PARAMS) {
    const loc = progEye.loc[p.u];
    if (loc) gl.uniform1f(loc, state[p.u]);
  }
  for (const c of COLOURS) gl.uniform3fv(progEye.loc[c.u], rgb(state[c.u]));
  drawFullscreen();

  // 2 - two bloom taps off one ladder. Level 0 (half res) is the tight one;
  // the chain continues down to 1/16 for the wide one. Width comes from the
  // downsampling, not from stretching the kernel.
  const tight = blurLevel(0, rt.scene.tex, state.uRadiusA);
  let wide = tight;
  for (let i = 1; i < LEVELS; i++) {
    wide = blurLevel(i, wide.tex, i === LEVELS - 1 ? state.uRadiusB : 1.0);
  }

  // 3 - background + radiance, tonemapped together.
  pass(null, progComposite);
  gl.uniform2f(progComposite.loc.uResolution, canvas.width, canvas.height);
  gl.uniform1f(progComposite.loc.uStrengthA, state.uStrengthA);
  gl.uniform1f(progComposite.loc.uStrengthB, state.uStrengthB);
  gl.uniform1f(progComposite.loc.uExposure, state.uExposure);
  gl.uniform1i(progComposite.loc.uBgMode, bgMode);
  gl.uniform1i(progComposite.loc.uTonemap, tonemap);
  bindTexture(rt.scene.tex, 0, 'uScene');
  bindTexture(tight.tex, 1, 'uBloomA');
  bindTexture(wide.tex, 2, 'uBloomB');
  bindTexture(wallpaper, 3, 'uWallpaper');
  drawFullscreen();
}

function bindTexture(tex, unit, name) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.uniform1i(progComposite.loc[name], unit);
}

// --------------------------------------------------------------- timings ---

const gpuQueries = [];
let gpuMs = 0;

function beginGpu() {
  if (!timerExt) return null;
  const q = gl.createQuery();
  gl.beginQuery(timerExt.TIME_ELAPSED_EXT, q);
  return q;
}

function endGpu(q) {
  if (!q) return;
  gl.endQuery(timerExt.TIME_ELAPSED_EXT);
  gpuQueries.push(q);
  // Results land a few frames later; drain whatever is ready.
  while (gpuQueries.length) {
    const head = gpuQueries[0];
    if (!gl.getQueryParameter(head, gl.QUERY_RESULT_AVAILABLE)) break;
    if (!gl.getParameter(timerExt.GPU_DISJOINT_EXT)) {
      gpuMs = gl.getQueryParameter(head, gl.QUERY_RESULT) / 1e6;
    }
    gl.deleteQuery(gpuQueries.shift());
  }
}

const stats = { frames: 0, acc: 0, fps: 0, cpuMs: 0, mark: 0 };
let sampling = null;

function frame(now) {
  const dt = Math.min((now - lastNow) / 1000, 0.05);
  lastNow = now;
  resize();

  const q = beginGpu();
  const t0 = performance.now();
  renderFrame(dt);
  const cpu = performance.now() - t0;
  endGpu(q);

  stats.frames++;
  stats.acc += stats.mark ? now - stats.mark : 0;
  stats.mark = now;
  stats.cpuMs = stats.cpuMs * 0.9 + cpu * 0.1;
  if (stats.acc > 500) {
    stats.fps = (stats.frames / stats.acc) * 1000;
    readout.textContent =
      stats.fps.toFixed(1) + ' fps   ·   gpu ' + (timerExt ? gpuMs.toFixed(2) + ' ms' : 'n/a') +
      '   ·   cpu ' + stats.cpuMs.toFixed(2) + ' ms   ·   ' + canvas.width + '×' + canvas.height;
    stats.frames = 0;
    stats.acc = 0;
  }

  if (sampling) {
    sampling.gpu.push(gpuMs);
    sampling.dt.push(dt * 1000);
    if (sampling.gpu.length >= sampling.n) {
      const done = sampling;
      sampling = null;
      done.resolve(summarise(done));
    }
  }

  requestAnimationFrame(frame);
}

function summarise(run) {
  const median = (a) => {
    const s = a.slice().sort((x, y) => x - y);
    return s.length ? s[Math.floor(s.length / 2)] : 0;
  };
  const gpu = run.gpu.filter((v) => v > 0);
  const dt = run.dt.slice(4);
  return {
    size: canvas.width + 'x' + canvas.height,
    frames: run.gpu.length,
    gpuMedianMs: gpu.length ? +median(gpu).toFixed(3) : null,
    gpuMaxMs: gpu.length ? +Math.max.apply(null, gpu).toFixed(3) : null,
    frameMedianMs: +median(dt).toFixed(3),
    fps: +(1000 / median(dt)).toFixed(1)
  };
}

// Hooks for the capture script; harmless in a browser.
window.__bench = (frames) => new Promise((resolve) => {
  sampling = { n: frames || 240, gpu: [], dt: [], resolve };
});
window.__state = state;
window.__set = (patch) => {
  Object.assign(state, patch);
  syncControls();
};
window.__setBackground = (m) => {
  bgMode = m;
  document.getElementById('bg').value = String(m);
};
window.__setResolution = (r) => {
  renderPreset = r;
  document.getElementById('res').value = r;
  resize();
};
window.__rage = () => applyRage();
window.__chrome = (visible) => document.body.classList.toggle('bare', !visible);

// ---------------------------------------------------------------- panel ----

const panel = document.getElementById('panel');
const readout = document.getElementById('readout');
const inputs = new Map();

function fmt(v) {
  return Math.abs(v) >= 1 || v === 0 ? String(+(+v).toFixed(3)) : String(+(+v).toFixed(4));
}

function control(spec) {
  const row = document.createElement('label');
  row.className = 'row';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = spec.label;
  const val = document.createElement('span');
  val.className = 'val';
  val.textContent = fmt(state[spec.u]);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = spec.min;
  input.max = spec.max;
  input.step = spec.step;
  input.value = state[spec.u];
  input.addEventListener('input', () => {
    state[spec.u] = parseFloat(input.value);
    val.textContent = fmt(state[spec.u]);
  });
  row.append(name, val, input);
  inputs.set(spec.u, { input, val });
  return row;
}

function colourControl(spec) {
  const row = document.createElement('label');
  row.className = 'row';
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = spec.label;
  const val = document.createElement('span');
  val.className = 'val';
  val.textContent = state[spec.u];
  const input = document.createElement('input');
  input.type = 'color';
  input.value = state[spec.u];
  input.addEventListener('input', () => {
    state[spec.u] = input.value;
    val.textContent = input.value;
  });
  row.append(name, val, input);
  inputs.set(spec.u, { input, val });
  return row;
}

function syncControls() {
  for (const entry of inputs) {
    const u = entry[0];
    const { input, val } = entry[1];
    input.value = state[u];
    if (val) val.textContent = typeof state[u] === 'string' ? state[u] : fmt(state[u]);
  }
}

function applyRage() {
  Object.assign(state, RAGE);   // no transition, by design
  syncControls();
}

let flashTimer = 0;
function flash(msg) {
  const el = document.getElementById('flash');
  el.textContent = msg;
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => { el.textContent = ''; }, 3000);
}

function buildPanel() {
  for (const p of PARAMS) panel.append(control(p));
  for (const c of COLOURS) panel.append(colourControl(c));

  document.getElementById('rage').addEventListener('click', applyRage);
  document.getElementById('reset').addEventListener('click', () => {
    Object.assign(state, defaults);
    syncControls();
  });
  document.getElementById('copy').addEventListener('click', () => {
    const json = JSON.stringify(Object.assign({}, state, { background: bgMode, tonemap }), null, 2);
    navigator.clipboard.writeText(json).then(
      () => flash('uniforms copied'),
      () => { console.log(json); flash('clipboard blocked - logged to console'); }
    );
  });
  document.getElementById('bg').addEventListener('change', (e) => { bgMode = +e.target.value; });
  document.getElementById('tm').addEventListener('change', (e) => { tonemap = +e.target.value; });
  document.getElementById('res').addEventListener('change', (e) => {
    renderPreset = e.target.value;
    resize();
  });
  document.getElementById('bench').addEventListener('click', () => {
    flash('benching 240 frames...');
    window.__bench(240).then((r) => {
      flash(r.fps + ' fps · gpu ' + (r.gpuMedianMs === null ? 'n/a' : r.gpuMedianMs + ' ms') +
        ' · ' + r.size);
    });
  });
  document.getElementById('hide').addEventListener('click', () => {
    document.body.classList.toggle('bare');
  });
}

// ------------------------------------------------------------------ boot ---

function boot() {
  const load = (p) => fetch(p).then((r) => r.text());
  return Promise.all([
    load('shaders/fullscreen.vert'),
    load('shaders/eye.frag'),
    load('shaders/blur.frag'),
    load('shaders/composite.frag')
  ]).then((sources) => {
    const vert = sources[0];
    progEye = program(vert, sources[1], 'eye');
    progBlur = program(vert, sources[2], 'blur');
    progComposite = program(vert, sources[3], 'composite');
    wallpaper = wallpaperTexture();

    gl.bindVertexArray(gl.createVertexArray());   // required even with no attributes
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    buildPanel();
    resize();
    window.addEventListener('resize', resize);
    requestAnimationFrame(frame);
    window.__ready = true;
  });
}

boot().catch((err) => {
  document.getElementById('flash').textContent = String(err && err.message ? err.message : err);
  console.error(err);
});
