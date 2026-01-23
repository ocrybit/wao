/**
 * Meta Device
 * Metadata and system information access
 */

import type { Device, DeviceInfo } from '../types/device.js';
import type { TABMMessage, TABMValue } from '../types/message.js';
import type { ResolveResult, Result } from '../types/result.js';
import type { ResolveOptions } from '../types/options.js';
import { ok, err, pass } from '../types/result.js';

/** Meta device exports */
const META_EXPORTS = [
  'info',
  'version',
  'timestamp',
  'random',
  'uuid',
  'hash',
  'device',
  'device-stack',
  'opts',
];

/** Package version */
const VERSION = '1.0.0';

/** Meta device - provides system metadata */
export class MetaDevice implements Device {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  info(_msg?: TABMMessage): DeviceInfo {
    return {
      exports: META_EXPORTS,
    };
  }

  async get(
    key: string,
    msg: TABMMessage,
    opts: ResolveOptions
  ): Promise<ResolveResult<TABMValue>> {
    switch (key) {
      case 'info': {
        const g = globalThis as Record<string, unknown>;
        return ok({
          name: 'hyperbeam-js',
          version: VERSION,
          platform: 'javascript',
          runtime: typeof g.Deno !== 'undefined' ? 'deno' :
                   typeof g.process !== 'undefined' ? 'node' : 'browser',
        });
      }

      case 'version': {
        return ok(VERSION);
      }

      case 'timestamp': {
        return ok(Date.now());
      }

      case 'random': {
        const count = (msg['count'] as number) ?? 32;
        const bytes = new Uint8Array(count);
        crypto.getRandomValues(bytes);
        return ok(bytes);
      }

      case 'uuid': {
        return ok(crypto.randomUUID());
      }

      case 'hash': {
        const algorithm = (msg['algorithm'] as string) ?? 'sha-256';
        const data = msg['data'] as Uint8Array | string | undefined;

        if (!data) {
          return err(400, 'hash requires data parameter');
        }

        const bytes = typeof data === 'string'
          ? new TextEncoder().encode(data)
          : data;

        const hashBuffer = await crypto.subtle.digest(algorithm.toUpperCase(), bytes as BufferSource);
        return ok(new Uint8Array(hashBuffer));
      }

      case 'device': {
        return ok(msg['device'] ?? null);
      }

      case 'device-stack': {
        return ok(msg['device-stack'] ?? []);
      }

      case 'opts': {
        return ok({
          maxDepth: opts.maxDepth,
          timeout: opts.timeout,
        });
      }

      default:
        return pass();
    }
  }
}

/** Create a meta device instance */
export function createMetaDevice(): MetaDevice {
  return new MetaDevice();
}
