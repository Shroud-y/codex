import si from 'systeminformation';
import type { EventBus } from '../core/eventBus';
import { EventType, createEvent } from '../core/events';
import { createLogger } from '../log/logger';
import { Hysteresis, type Monitor, type SharedScheduler } from './Monitor';

const log = createLogger('monitor:system');

const POLL_MS = 15_000;
const DISK_POLL_MS = 30 * 60_000;

const CPU_HIGH = 85;
const CPU_REARM = 60;
const MEMORY_HIGH = 90;
const MEMORY_REARM = 75;
const TEMPERATURE_HIGH = 85;
const TEMPERATURE_REARM = 75;
const SUSTAINED_MS = 3 * 60_000;
const DISK_LOW_BYTES = 10 * 1024 ** 3;
const BATTERY_LOW_PERCENT = 20;

export class SystemMonitor implements Monitor {
  readonly id = 'system';

  private readonly cpu = new Hysteresis(CPU_HIGH, CPU_REARM);
  private readonly memory = new Hysteresis(MEMORY_HIGH, MEMORY_REARM);
  private readonly temperature = new Hysteresis(TEMPERATURE_HIGH, TEMPERATURE_REARM);
  private readonly battery = new Hysteresis(-BATTERY_LOW_PERCENT, -(BATTERY_LOW_PERCENT + 10));

  private cpuHighSince: number | null = null;
  private sustainedFired = false;
  private temperatureSupported = true;
  private diskLowDrives = new Set<string>();
  private unsubscribe: (() => void)[] = [];

  constructor(private readonly scheduler: SharedScheduler) {}

  start(bus: EventBus): void {
    this.unsubscribe.push(this.scheduler.every(POLL_MS, (now) => this.poll(bus, now)));
    this.unsubscribe.push(this.scheduler.every(DISK_POLL_MS, (now) => this.pollDisk(bus, now)));
    // Disk is cheap and its poll interval is long; do one pass early.
    setTimeout(() => void this.pollDisk(bus, Date.now()), 90_000).unref?.();
  }

  stop(): void {
    for (const off of this.unsubscribe) off();
    this.unsubscribe = [];
  }

  private async poll(bus: EventBus, now: number): Promise<void> {
    await this.pollCpu(bus, now);
    await this.pollMemory(bus, now);
    await this.pollTemperature(bus, now);
    await this.pollBattery(bus, now);
  }

  private async pollCpu(bus: EventBus, now: number): Promise<void> {
    try {
      const load = await si.currentLoad();
      const value = load.currentLoad;
      if (!Number.isFinite(value)) return;

      if (this.cpu.update(value)) {
        bus.emit(createEvent(EventType.systemCpuHigh, 'ambient', { load: value }, now));
      }

      if (value > CPU_HIGH) {
        this.cpuHighSince ??= now;
        if (!this.sustainedFired && now - this.cpuHighSince >= SUSTAINED_MS) {
          this.sustainedFired = true;
          bus.emit(
            createEvent(
              EventType.systemCpuSustained,
              'notable',
              { load: value, forMs: now - this.cpuHighSince },
              now
            )
          );
        }
      } else if (value < CPU_REARM) {
        this.cpuHighSince = null;
        this.sustainedFired = false;
      }
    } catch (err) {
      log.debug(`cpu poll failed: ${String(err)}`);
    }
  }

  private async pollMemory(bus: EventBus, now: number): Promise<void> {
    try {
      const mem = await si.mem();
      if (!mem.total) return;
      // `active` excludes cache/buffers, which is what a user would call "used".
      const usedPercent = ((mem.active || mem.used) / mem.total) * 100;
      if (this.memory.update(usedPercent)) {
        bus.emit(
          createEvent(
            EventType.systemMemoryHigh,
            'ambient',
            { usedPercent, freeBytes: mem.available },
            now
          )
        );
      }
    } catch (err) {
      log.debug(`memory poll failed: ${String(err)}`);
    }
  }

  private async pollTemperature(bus: EventBus, now: number): Promise<void> {
    if (!this.temperatureSupported) return;
    try {
      const temp = await si.cpuTemperature();
      const value = temp.main;
      // Unavailable on many machines — disable permanently rather than log forever.
      if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
        this.temperatureSupported = false;
        log.info('CPU temperature is unavailable on this machine — thermal checks disabled');
        return;
      }
      if (this.temperature.update(value)) {
        bus.emit(createEvent(EventType.systemTemperatureHigh, 'urgent', { celsius: value }, now));
      }
    } catch {
      this.temperatureSupported = false;
      log.info('CPU temperature could not be read — thermal checks disabled');
    }
  }

  private async pollBattery(bus: EventBus, now: number): Promise<void> {
    try {
      const battery = await si.battery();
      if (!battery.hasBattery) return;
      const discharging = !battery.isCharging && !battery.acConnected;
      // Hysteresis works on "rising" values, so feed it the negated percentage.
      const rose = this.battery.update(discharging ? -battery.percent : 0);
      if (rose && discharging) {
        bus.emit(
          createEvent(EventType.systemBatteryLow, 'urgent', { percent: battery.percent }, now)
        );
      }
    } catch (err) {
      log.debug(`battery poll failed: ${String(err)}`);
    }
  }

  private async pollDisk(bus: EventBus, now: number): Promise<void> {
    try {
      const drives = await si.fsSize();
      for (const drive of drives) {
        if (!drive.mount || typeof drive.available !== 'number') continue;
        const low = drive.available < DISK_LOW_BYTES && drive.size > DISK_LOW_BYTES;
        const known = this.diskLowDrives.has(drive.mount);
        if (low && !known) {
          this.diskLowDrives.add(drive.mount);
          bus.emit(
            createEvent(
              EventType.systemDiskLow,
              'urgent',
              { mount: drive.mount, freeBytes: drive.available, freeGb: drive.available / 1024 ** 3 },
              now
            )
          );
        } else if (!low && known) {
          this.diskLowDrives.delete(drive.mount);
        }
      }
    } catch (err) {
      log.debug(`disk poll failed: ${String(err)}`);
    }
  }
}
