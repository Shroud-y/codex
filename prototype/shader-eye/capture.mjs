/* global console, setTimeout, URL */
/**
 * Screenshot + benchmark harness. Electron main process.
 *
 *   npx electron prototype/shader-eye/capture.mjs
 *
 * Uses the Electron binary that already exists in node_modules; it reads
 * nothing from the app and writes only into ./shots and ./bench.json.
 */
import { app, BrowserWindow } from 'electron';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const SHOTS = join(ROOT, 'shots');
const PORT = 5179;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.glsl': 'text/plain; charset=utf-8',
  '.vert': 'text/plain; charset=utf-8',
  '.frag': 'text/plain; charset=utf-8'
};

function serve() {
  return new Promise((resolve) => {
    const s = createServer(async (req, res) => {
      const path = normalize(join(ROOT, req.url === '/' ? 'index.html' : req.url.slice(1)));
      if (!path.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) {
        res.writeHead(403).end();
        return;
      }
      try {
        res.writeHead(200, { 'content-type': TYPES[extname(path)] ?? 'text/plain' });
        res.end(await readFile(path));
      } catch {
        res.writeHead(404).end();
      }
    });
    s.listen(PORT, '127.0.0.1', () => resolve(s));
  });
}

// Unthrottled so the frame-time numbers reflect the shader's real cost rather
// than the monitor's refresh rate.
app.commandLine.appendSwitch('disable-frame-rate-limit');
app.commandLine.appendSwitch('disable-gpu-vsync');
app.commandLine.appendSwitch('force_high_performance_gpu');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await serve();
  await mkdir(SHOTS, { recursive: true });

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    backgroundColor: '#050A0C',
    webPreferences: { offscreen: false, backgroundThrottling: false }
  });
  win.setContentSize(1600, 900);

  const run = (js) => win.webContents.executeJavaScript(js, true);

  await win.loadURL(`http://127.0.0.1:${PORT}/`);
  await run('new Promise(r => { const t = setInterval(() => { if (window.__ready) { clearInterval(t); r(1); } }, 50); })');
  await sleep(1200);

  const shot = async (name) => {
    await sleep(900);
    const img = await win.webContents.capturePage();
    await writeFile(join(SHOTS, name + '.png'), img.toPNG());
    console.log('shot', name);
  };

  await run('window.__chrome(false)');

  await run('window.__setBackground(0)');
  await shot('01-near-black');

  await run('window.__setBackground(1)');
  await shot('02-bright-wallpaper');

  await run('window.__setBackground(2)');
  await shot('03-mid-grey');

  await run('window.__setBackground(0); window.__rage()');
  await shot('04-rage-near-black');

  await run('window.__setBackground(1)');
  await shot('05-rage-bright-wallpaper');

  await run('window.__setBackground(0); window.__set({ uOpenness: 0.02 })');
  await shot('06-rage-closed-slit');

  await run('document.getElementById("reset").click(); window.__set({ uOpenness: 0.12 })');
  await shot('07-calm-narrow-slit');

  // Back to defaults, then a chrome-visible frame so the panel is documented.
  await run('document.getElementById("reset").click(); window.__setBackground(0); window.__chrome(true)');
  await shot('08-panel');
  await run('window.__chrome(false)');

  // Benchmarks. GPU time is the honest cost; fps here is unthrottled.
  const bench = {};
  for (const preset of ['1080p', '4k']) {
    await run(`window.__setResolution(${JSON.stringify(preset)})`);
    await sleep(1500);
    bench[preset] = await run('window.__bench(300)');
    console.log(preset, JSON.stringify(bench[preset]));
  }

  // Same again with dispersion off, to price the three-evaluation split.
  await run('window.__set({ uDispersion: 0 }); window.__setResolution("1080p")');
  await sleep(1200);
  bench['1080p-no-dispersion'] = await run('window.__bench(300)');
  console.log('1080p-no-dispersion', JSON.stringify(bench['1080p-no-dispersion']));

  const gpuInfo = await run('(() => { const c = document.createElement("canvas").getContext("webgl2"); const d = c.getExtension("WEBGL_debug_renderer_info"); return d ? c.getParameter(d.UNMASKED_RENDERER_WEBGL) : "unknown"; })()');
  bench.renderer = gpuInfo;

  await writeFile(join(ROOT, 'bench.json'), JSON.stringify(bench, null, 2));
  console.log('renderer:', gpuInfo);
  console.log('done');
  app.exit(0);
}

app.whenReady().then(main).catch((err) => {
  console.error(err);
  app.exit(1);
});
