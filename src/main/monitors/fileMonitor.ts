import { basename, extname } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import type { EventBus } from '../core/eventBus';
import { EventType, createEvent } from '../core/events';
import { createLogger } from '../log/logger';
import type { Monitor } from './Monitor';

const log = createLogger('monitor:file');

/** §9.6 — a file only counts once its size has been stable for 5 s. */
const STABILITY_MS = 5_000;
/** Extracting an archive must produce at most one event, not four hundred. */
const COLLAPSE_WINDOW_MS = 10_000;

const IGNORED_EXTENSIONS = new Set(['.tmp', '.crdownload', '.part', '.download', '.partial']);

export function isIgnoredFile(filePath: string): boolean {
  const name = basename(filePath);
  if (name.startsWith('~') || name.startsWith('.')) return true;
  return IGNORED_EXTENSIONS.has(extname(name).toLowerCase());
}

interface Collapsed {
  timer: NodeJS.Timeout;
  first: string;
  count: number;
}

export class FileMonitor implements Monitor {
  readonly id = 'file';

  private watchers: FSWatcher[] = [];
  private pending = new Map<string, Collapsed>();

  constructor(
    private readonly getDownloadFolders: () => string[],
    private readonly getBuildFolders: () => string[] = () => []
  ) {}

  async start(bus: EventBus): Promise<void> {
    this.watchOne(bus, this.getDownloadFolders(), EventType.fileDownloadComplete, 'download');
    this.watchOne(bus, this.getBuildFolders(), EventType.fileBuildComplete, 'build');
  }

  async stop(): Promise<void> {
    for (const { timer } of this.pending.values()) clearTimeout(timer);
    this.pending.clear();
    await Promise.all(this.watchers.map((watcher) => watcher.close().catch(() => undefined)));
    this.watchers = [];
  }

  private watchOne(bus: EventBus, folders: string[], eventType: string, bucket: string): void {
    const targets = folders.filter((folder) => folder.length > 0);
    if (targets.length === 0) return;

    const watcher = chokidar.watch(targets, {
      ignoreInitial: true,
      depth: 1,
      awaitWriteFinish: { stabilityThreshold: STABILITY_MS, pollInterval: 500 },
      ignored: (path: string) => isIgnoredFile(path)
    });

    watcher.on('add', (filePath: string) => this.collapse(bus, eventType, bucket, filePath));
    watcher.on('error', (err: unknown) => log.debug(`watcher error: ${String(err)}`));

    this.watchers.push(watcher);
    log.info(`watching ${targets.join(', ')} for ${bucket} completion`);
  }

  /** Collapses a burst into one event carrying the first file and a count. */
  private collapse(bus: EventBus, eventType: string, bucket: string, filePath: string): void {
    const existing = this.pending.get(bucket);
    if (existing) {
      existing.count += 1;
      return;
    }

    const entry: Collapsed = {
      first: filePath,
      count: 1,
      timer: setTimeout(() => {
        const done = this.pending.get(bucket);
        this.pending.delete(bucket);
        if (!done) return;
        bus.emit(
          createEvent(
            eventType,
            'notable',
            { path: done.first, name: basename(done.first), count: done.count },
            Date.now()
          )
        );
      }, COLLAPSE_WINDOW_MS)
    };
    entry.timer.unref?.();
    this.pending.set(bucket, entry);
  }
}
