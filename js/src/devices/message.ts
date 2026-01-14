/**
 * Message Device
 * Basic message access and manipulation
 */

import type { Device, DeviceInfo } from '../types/device.js';
import type { TABMMessage, TABMValue } from '../types/message.js';
import type { ResolveResult, Result } from '../types/result.js';
import type { ResolveOptions } from '../types/options.js';
import { ok, err, pass } from '../types/result.js';
import { computeMessageId, computeUnsignedId } from '../utils/message.js';

/** Message device exports */
const MESSAGE_EXPORTS = [
  'id',
  'unsigned-id',
  'keys',
  'has',
  'get',
  'set',
  'delete',
  'merge',
  'clone',
  'type',
  'size',
];

/** Message device - provides access to message properties */
export class MessageDevice implements Device {
  info(_msg?: TABMMessage): DeviceInfo {
    return {
      exports: MESSAGE_EXPORTS,
      default: 'get',
    };
  }

  async get(
    key: string,
    msg: TABMMessage,
    _opts: ResolveOptions
  ): Promise<ResolveResult<TABMValue>> {
    switch (key) {
      case 'id': {
        const id = await computeMessageId(msg);
        return ok(id);
      }

      case 'unsigned-id': {
        const id = await computeUnsignedId(msg);
        return ok(id);
      }

      case 'keys': {
        return ok(Object.keys(msg));
      }

      case 'has': {
        const keyToCheck = msg['requested-key'] as string;
        if (!keyToCheck) {
          return err(400, 'has requires a key parameter');
        }
        return ok(keyToCheck in msg);
      }

      case 'get': {
        const keyToGet = msg['requested-key'] as string;
        if (!keyToGet) {
          return pass();
        }
        if (keyToGet in msg) {
          return ok(msg[keyToGet]);
        }
        return pass();
      }

      case 'type': {
        const value = msg['value'] as TABMValue;
        if (value === null || value === undefined) {
          return ok('null');
        }
        if (value instanceof Uint8Array) {
          return ok('binary');
        }
        if (Array.isArray(value)) {
          return ok('list');
        }
        return ok(typeof value);
      }

      case 'size': {
        return ok(Object.keys(msg).length);
      }

      default:
        // Direct property access
        if (key in msg) {
          return ok(msg[key]);
        }
        return pass();
    }
  }

  async set(
    key: string,
    value: TABMValue,
    msg: TABMMessage,
    _opts: ResolveOptions
  ): Promise<Result<TABMMessage>> {
    switch (key) {
      case 'set': {
        const setKey = msg['key'] as string;
        if (!setKey) {
          return err(400, 'set requires a key');
        }
        return ok({ ...msg, [setKey]: value });
      }

      case 'delete': {
        const deleteKey = msg['key'] as string;
        if (!deleteKey) {
          return err(400, 'delete requires a key');
        }
        const result = { ...msg };
        delete result[deleteKey];
        return ok(result);
      }

      case 'merge': {
        if (typeof value !== 'object' || value === null || Array.isArray(value)) {
          return err(400, 'merge requires a message value');
        }
        return ok({ ...msg, ...value as TABMMessage });
      }

      case 'clone': {
        return ok({ ...msg });
      }

      default:
        // Direct property set
        return ok({ ...msg, [key]: value });
    }
  }
}

/** Create a message device instance */
export function createMessageDevice(): MessageDevice {
  return new MessageDevice();
}
