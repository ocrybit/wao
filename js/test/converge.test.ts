import { describe, it, expect } from 'vitest';
import {
  parsePath,
  joinPath,
  isExported,
  converge,
  convergeWithDevices,
  resolveKey,
  resolveWithStack,
} from '../src/converge/resolve.js';
import type { Device, DeviceInfo } from '../src/types/device.js';
import type { TABMMessage, TABMValue } from '../src/types/message.js';
import type { ResolveResult } from '../src/types/result.js';
import type { ResolveOptions } from '../src/types/options.js';
import { ok, pass, isOk, isPass } from '../src/types/result.js';

describe('Converge Algorithm', () => {
  describe('parsePath', () => {
    it('should parse simple path', () => {
      expect(parsePath('/a/b/c')).toEqual(['a', 'b', 'c']);
    });

    it('should handle root path', () => {
      expect(parsePath('/')).toEqual([]);
    });

    it('should handle empty path', () => {
      expect(parsePath('')).toEqual([]);
    });

    it('should handle path without leading slash', () => {
      expect(parsePath('a/b/c')).toEqual(['a', 'b', 'c']);
    });

    it('should filter empty segments', () => {
      expect(parsePath('/a//b/c/')).toEqual(['a', 'b', 'c']);
    });

    it('should handle single segment', () => {
      expect(parsePath('/key')).toEqual(['key']);
    });
  });

  describe('joinPath', () => {
    it('should join segments with slashes', () => {
      expect(joinPath(['a', 'b', 'c'])).toBe('/a/b/c');
    });

    it('should return root for empty segments', () => {
      expect(joinPath([])).toBe('/');
    });

    it('should handle single segment', () => {
      expect(joinPath(['key'])).toBe('/key');
    });
  });

  describe('isExported', () => {
    it('should return true for exported key', () => {
      const info: DeviceInfo = {
        exports: ['key1', 'key2', 'key3'],
      };
      expect(isExported(info, 'key1')).toBe(true);
      expect(isExported(info, 'key2')).toBe(true);
    });

    it('should return false for non-exported key', () => {
      const info: DeviceInfo = {
        exports: ['key1', 'key2'],
      };
      expect(isExported(info, 'key3')).toBe(false);
    });

    it('should handle exclusions', () => {
      const info: DeviceInfo = {
        exports: ['key1', 'key2'],
        excludes: ['key2'],
      };
      expect(isExported(info, 'key1')).toBe(true);
      expect(isExported(info, 'key2')).toBe(false);
    });

    it('should normalize keys for comparison', () => {
      const info: DeviceInfo = {
        exports: ['my_key'],
      };
      expect(isExported(info, 'MY-KEY')).toBe(true);
    });
  });

  describe('converge', () => {
    const opts: ResolveOptions = {};

    it('should return message for empty path', async () => {
      const msg: TABMMessage = { key: 'value' };
      const result = await converge(msg, '/', opts);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual(msg);
      }
    });

    it('should resolve simple key', async () => {
      const msg: TABMMessage = { key: 'value' };
      const result = await converge(msg, '/key', opts);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe('value');
      }
    });

    it('should resolve nested path', async () => {
      const msg: TABMMessage = {
        level1: {
          level2: {
            value: 42,
          },
        },
      };
      const result = await converge(msg, '/level1/level2/value', opts);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should resolve array index', async () => {
      const msg: TABMMessage = {
        items: ['a', 'b', 'c'],
      };
      const result = await converge(msg, '/items/1', opts);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe('b');
      }
    });

    it('should return error for missing key', async () => {
      const msg: TABMMessage = { key: 'value' };
      const result = await converge(msg, '/missing', opts);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.status).toBe(404);
      }
    });

    it('should return error for invalid array index', async () => {
      const msg: TABMMessage = {
        items: ['a', 'b'],
      };
      const result = await converge(msg, '/items/5', opts);

      expect(isOk(result)).toBe(false);
    });

    it('should return error for resolving on primitive', async () => {
      const msg: TABMMessage = { value: 42 };
      const result = await converge(msg, '/value/nested', opts);

      expect(isOk(result)).toBe(false);
      if (!isOk(result)) {
        expect(result.error.status).toBe(400);
      }
    });

    it('should return error for resolving on null', async () => {
      const msg: TABMMessage = { value: null };
      const result = await converge(msg, '/value/nested', opts);

      expect(isOk(result)).toBe(false);
    });
  });

  describe('resolveKey', () => {
    it('should resolve exported key', async () => {
      const device: Device = {
        info: () => ({ exports: ['test'] }),
        get: async (key, msg, opts) => ok('resolved'),
      };

      const msg: TABMMessage = {};
      const result = await resolveKey(device, 'test', msg, {});

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe('resolved');
      }
    });

    it('should pass for non-exported key', async () => {
      const device: Device = {
        info: () => ({ exports: ['other'] }),
        get: async () => ok('should not be called'),
      };

      const msg: TABMMessage = {};
      const result = await resolveKey(device, 'missing', msg, {});

      expect(isPass(result)).toBe(true);
    });

    it('should use default handler for non-exported key', async () => {
      const device: Device = {
        info: () => ({
          exports: ['default-handler'],
          default: 'default-handler',
        }),
        get: async (key, msg, opts) => {
          if (key === 'default-handler') {
            return ok(`handled: ${msg['requested-key']}`);
          }
          return pass();
        },
      };

      const msg: TABMMessage = {};
      const result = await resolveKey(device, 'any-key', msg, {});

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe('handled: any-key');
      }
    });
  });

  describe('resolveWithStack', () => {
    it('should try devices in order', async () => {
      const callOrder: string[] = [];

      const device1: Device = {
        info: () => ({ exports: ['key'] }),
        get: async () => {
          callOrder.push('device1');
          return pass();
        },
      };

      const device2: Device = {
        info: () => ({ exports: ['key'] }),
        get: async () => {
          callOrder.push('device2');
          return ok('found');
        },
      };

      const msg: TABMMessage = {};
      const result = await resolveWithStack([device1, device2], 'key', msg, {});

      expect(callOrder).toEqual(['device1', 'device2']);
      expect(isOk(result)).toBe(true);
    });

    it('should return first non-pass result', async () => {
      const device1: Device = {
        info: () => ({ exports: ['key'] }),
        get: async () => ok('first'),
      };

      const device2: Device = {
        info: () => ({ exports: ['key'] }),
        get: async () => ok('second'),
      };

      const msg: TABMMessage = {};
      const result = await resolveWithStack([device1, device2], 'key', msg, {});

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe('first');
      }
    });

    it('should return pass if all devices pass', async () => {
      const device: Device = {
        info: () => ({ exports: [] }),
        get: async () => pass(),
      };

      const msg: TABMMessage = {};
      const result = await resolveWithStack([device], 'key', msg, {});

      // Returns pass to allow caller to handle fallback (e.g., direct access)
      expect(isPass(result)).toBe(true);
    });
  });

  describe('convergeWithDevices', () => {
    it('should resolve through device stack', async () => {
      const device: Device = {
        info: () => ({
          exports: ['computed'],
        }),
        get: async (key, msg, opts) => {
          if (key === 'computed') {
            return ok(42);
          }
          return pass();
        },
      };

      const msg: TABMMessage = {
        regular: 'value',
      };

      const result = await convergeWithDevices(msg, '/computed', [device], {});

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should fall back to direct access when devices pass', async () => {
      const device: Device = {
        info: () => ({ exports: [] }),
        get: async () => pass(),
      };

      const msg: TABMMessage = {
        regular: 'direct',
      };

      const result = await convergeWithDevices(msg, '/regular', [device], {});

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe('direct');
      }
    });

    it('should handle nested resolution with devices', async () => {
      const device: Device = {
        info: () => ({
          exports: ['nested'],
        }),
        get: async (key, msg, opts) => {
          if (key === 'nested') {
            return ok({ value: 'deep' });
          }
          return pass();
        },
      };

      const msg: TABMMessage = {};
      const result = await convergeWithDevices(msg, '/nested/value', [device], {});

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe('deep');
      }
    });
  });
});
