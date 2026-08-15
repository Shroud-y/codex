import { describe, expect, it } from 'vitest';
import {
  parseBattery,
  parseDrives,
  parseProcessNames,
  parseTemperature
} from '@main/system/systemQueries';
import { processStem } from '@main/monitors/processMonitor';

/**
 * These parsers stand between the probe host's line protocol and the monitors.
 * The case that matters most is the unhappy one: a monitor that mistakes "no
 * reading" for a value fires events about a machine state that never happened.
 */
describe('probe reply parsing', () => {
  describe('processes', () => {
    it('reads a name list', () => {
      expect(parseProcessNames('chrome|code|discord')).toEqual(
        new Set(['chrome', 'code', 'discord'])
      );
    });

    it('reports no reading rather than an empty machine', () => {
      // There is always at least the probe itself, so an empty list is a
      // failed query — and an empty set would stop every watched process.
      expect(parseProcessNames('')).toBeNull();
      expect(parseProcessNames(null)).toBeNull();
    });

    it('matches a watchlist written with or without the extension', () => {
      expect(processStem('Chrome.exe')).toBe('chrome');
      expect(processStem('chrome')).toBe('chrome');
      expect(processStem('  Code.EXE ')).toBe('code');
    });
  });

  describe('temperature', () => {
    it('reads degrees', () => {
      expect(parseTemperature('61.5')).toBe(61.5);
    });

    it('treats an empty reply as unsupported', () => {
      expect(parseTemperature('')).toBeNull();
      expect(parseTemperature('   ')).toBeNull();
      expect(parseTemperature(null)).toBeNull();
    });
  });

  describe('battery', () => {
    it('reads status and charge', () => {
      expect(parseBattery('1:17')).toEqual({ present: true, discharging: true, percent: 17 });
      expect(parseBattery('2:79')).toEqual({ present: true, discharging: false, percent: 79 });
    });

    it('distinguishes a machine with no battery from a failed query', () => {
      // 'none' is final and stops the polling; null only skips this tick.
      expect(parseBattery('none')).toEqual({ present: false, discharging: false, percent: 0 });
      expect(parseBattery(null)).toBeNull();
      expect(parseBattery('garbage')).toBeNull();
    });

    it('counts the low and critical states as discharging', () => {
      expect(parseBattery('4:9')?.discharging).toBe(true);
      expect(parseBattery('5:3')?.discharging).toBe(true);
      // Charging, and charging-but-low, are not.
      expect(parseBattery('6:40')?.discharging).toBe(false);
      expect(parseBattery('8:12')?.discharging).toBe(false);
    });
  });

  describe('drives', () => {
    it('reads free and total bytes per drive', () => {
      expect(parseDrives('C:1024:4096|D:50:100')).toEqual([
        { mount: 'C:', free: 1024, size: 4096 },
        { mount: 'D:', free: 50, size: 100 }
      ]);
    });

    it('skips a malformed entry without discarding the rest', () => {
      expect(parseDrives('C:1024:4096|nonsense|D:50:100')).toHaveLength(2);
    });

    it('reports no reading rather than an empty machine', () => {
      expect(parseDrives('')).toBeNull();
      expect(parseDrives(null)).toBeNull();
    });
  });
});
