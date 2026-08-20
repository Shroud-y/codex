/**
 * Precompiles resources/probe/CodexProbe.cs into resources/probe/CodexProbe.dll.
 *
 *   node tools/make-probe-dll.mjs
 *
 * Why this exists: the probe host used to compile that C# on every launch with
 * an inline `Add-Type`. Measured from the app's own log, the gap between
 * spawning the host and its `ready=1` was 14-25 s on a cold machine and 0.44 s
 * on a warm one — a csc.exe spawn, a temp assembly written to disk, and
 * Defender scanning a binary it had never seen before. All of it landed during
 * login. A DLL built once has a stable hash, so Defender clears it once and
 * PowerShell only has to load it.
 *
 * Windows-only, like the probe itself. On any other platform this is a no-op,
 * and `probeScript.ts` falls back to compiling the .cs at runtime.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, statSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const probeDir = join(here, '..', 'resources', 'probe');
const source = join(probeDir, 'CodexProbe.cs');
const output = join(probeDir, 'CodexProbe.dll');

if (process.platform !== 'win32') {
  console.log('probe dll: not Windows — skipped (runtime falls back to the .cs)');
  process.exit(0);
}

if (!existsSync(source)) {
  console.error(`probe dll: source missing at ${source}`);
  process.exit(1);
}

// Rebuilding an unchanged DLL would hand Defender a new hash to scan for no
// reason, so only compile when the source is actually newer.
if (existsSync(output) && statSync(output).mtimeMs >= statSync(source).mtimeMs) {
  console.log('probe dll: up to date');
  process.exit(0);
}

// `Add-Type -OutputAssembly` is the same compiler the runtime fallback would
// use — this just pays for it once, at build time, instead of at every login.
const script = [
  `$ErrorActionPreference = 'Stop'`,
  `Add-Type -Path '${source}' -OutputAssembly '${output}' -OutputType Library`
].join('; ');

const result = spawnSync(
  'powershell.exe',
  ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
  { encoding: 'utf8', windowsHide: true }
);

if (result.error) {
  console.error(`probe dll: cannot run powershell — ${result.error.message}`);
  process.exit(1);
}
if (result.status !== 0 || !existsSync(output)) {
  console.error(`probe dll: compile failed\n${result.stderr || result.stdout}`);
  // Drop whatever is there rather than leaving a DLL that no longer matches
  // the source beside it — the runtime fallback compiles the .cs, which is the
  // honest answer while this is broken.
  if (existsSync(output)) unlinkSync(output);
  process.exit(1);
}

console.log(`probe dll: wrote ${output} (${statSync(output).size} bytes)`);
