import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLogger } from '../log/logger';
import { PROBE_SCRIPT } from './probeScript';

const log = createLogger('probe');

const POLL_MS = 30_000;
/** If a reply never comes, the cached answer must not go stale forever. */
const REPLY_TIMEOUT_MS = 10_000;

/**
 * Fullscreen and microphone detection for the suppression rules (§8.5).
 * Everything is wrapped in try/catch: a probe that cannot run reports "not
 * active" rather than silencing the companion forever.
 */
export class PresenceProbe {
  private child: ChildProcessWithoutNullStreams | null = null;
  private scriptDir: string | null = null;
  private buffer = '';
  private timer: NodeJS.Timeout | null = null;
  private lastAskedAt = 0;
  private failed = false;

  private fullscreen = false;
  private microphone = false;
  /**
   * Applications already holding the capture device when Codex started.
   * Discord and Teams keep it open for their whole lifetime, so a purely
   * level-triggered reading would silence the companion permanently. Only a
   * holder that appears *after* the baseline counts as a call.
   */
  private microphoneBaseline: Set<string> | null = null;

  get fullscreenActive(): boolean {
    return this.fullscreen;
  }

  get microphoneActive(): boolean {
    return this.microphone;
  }

  get healthy(): boolean {
    return this.child !== null && !this.failed;
  }

  start(): void {
    if (process.platform !== 'win32') {
      log.info('presence probe is Windows-only — fullscreen/microphone suppression disabled');
      this.failed = true;
      return;
    }
    this.spawnHost();
    this.timer = setInterval(() => this.poll(), POLL_MS);
    this.timer.unref?.();
    this.poll();
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    try {
      this.child?.stdin.write('quit\n');
      this.child?.kill();
    } catch {
      // Already gone.
    }
    this.child = null;
    if (this.scriptDir) {
      try {
        rmSync(this.scriptDir, { recursive: true, force: true });
      } catch {
        // Temp cleanup is best effort.
      }
      this.scriptDir = null;
    }
  }

  private spawnHost(): void {
    try {
      this.scriptDir = mkdtempSync(join(tmpdir(), 'codex-probe-'));
      const scriptPath = join(this.scriptDir, 'probe.ps1');
      writeFileSync(scriptPath, PROBE_SCRIPT, 'utf8');

      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', scriptPath],
        { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }
      );

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => this.consume(chunk));
      child.stderr.setEncoding('utf8');
      child.stderr.on('data', (chunk: string) => log.debug(`probe stderr: ${chunk.trim()}`));
      child.on('exit', (code) => {
        log.debug(`probe host exited with code ${code ?? 'null'}`);
        this.child = null;
        // A dead probe must not mean permanent silence.
        this.fullscreen = false;
        this.microphone = false;
      });
      child.on('error', (err) => {
        this.failed = true;
        log.warn(`presence probe unavailable: ${err.message}`);
      });

      this.child = child;
      log.info(`presence probe host spawned (pid ${child.pid ?? 'unknown'})`);
    } catch (err) {
      this.failed = true;
      log.warn(`cannot start presence probe: ${(err as Error).message}`);
    }
  }

  private consume(chunk: string): void {
    this.buffer += chunk;
    let index = this.buffer.indexOf('\n');
    while (index >= 0) {
      const line = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 1);
      this.handleLine(line);
      index = this.buffer.indexOf('\n');
    }
  }

  private handleLine(line: string): void {
    log.debug(`probe line: ${line}`);
    if (line === 'ready=1') {
      log.info('presence probe ready');
      return;
    }
    if (line.startsWith('fs=')) this.fullscreen = line.endsWith('1');
    else if (line.startsWith('mic=')) this.updateMicrophone(line.slice('mic='.length));
  }

  private updateMicrophone(payload: string): void {
    const holders = new Set(payload.split('|').filter((name) => name.length > 0));

    if (this.microphoneBaseline === null) {
      this.microphoneBaseline = holders;
      this.microphone = false;
      if (holders.size > 0) {
        log.info(
          `microphone held at startup by ${holders.size} app(s); ignoring those as a baseline`
        );
      }
      return;
    }

    // A baseline holder that has released the device must not be permanently
    // excused — drop it so a later re-open is detected as a new call.
    for (const name of [...this.microphoneBaseline]) {
      if (!holders.has(name)) this.microphoneBaseline.delete(name);
    }

    const baseline = this.microphoneBaseline;
    this.microphone = [...holders].some((name) => !baseline.has(name));
  }

  private poll(): void {
    if (this.failed) return;
    if (!this.child) {
      this.spawnHost();
      return;
    }
    const now = Date.now();
    if (this.lastAskedAt !== 0 && now - this.lastAskedAt > REPLY_TIMEOUT_MS + POLL_MS) {
      // No reply for a whole cycle: assume nothing is active rather than
      // keeping a stale "suppressed" forever.
      this.fullscreen = false;
      this.microphone = false;
      this.microphoneBaseline = null;
    }
    this.lastAskedAt = now;
    try {
      this.child.stdin.write('fs\nmic\n');
    } catch (err) {
      log.debug(`probe write failed: ${String(err)}`);
      this.child = null;
    }
  }
}
