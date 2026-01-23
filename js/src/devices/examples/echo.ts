/**
 * Echo Device
 * Simple device for testing and debugging
 * Echoes back the input message with optional transformations
 */

import { buildDevice, ok, err, pass } from '../builder.js';
import type { Device } from '../../types/device.js';
import type { TABMMessage, TABMValue } from '../../types/message.js';
import type { Result } from '../../types/result.js';

/**
 * Create an echo device
 *
 * Exports:
 * - echo: Echo entire message
 * - value: Echo specific value
 * - keys: Echo all keys
 * - json: Echo as JSON string
 * - delay: Echo after delay
 *
 * Also supports HTTP handling for testing
 *
 * @example
 * ```typescript
 * const echo = createEchoDevice();
 *
 * // Echo entire message
 * const result = await echo.get('echo', { hello: 'world' }, {});
 * // result.value === { hello: 'world' }
 *
 * // Echo specific value
 * const result2 = await echo.get('value', { value: 42 }, {});
 * // result2.value === 42
 * ```
 */
export function createEchoDevice(): Device {
  return buildDevice({
    name: 'echo',
    version: '1.0',
    exports: ['echo', 'value', 'keys', 'json', 'delay', 'error', 'pass', 'info'],
    default: 'echo',
    handlers: {
      // Echo entire message
      echo: async (msg) => ok({ ...msg }),

      // Echo specific value
      value: async (msg) => {
        const value = msg['value'];
        return value !== undefined ? ok(value) : pass();
      },

      // Echo all keys
      keys: async (msg) => ok(Object.keys(msg)),

      // Echo as JSON string
      json: async (msg) => ok(JSON.stringify(msg)),

      // Echo after delay (useful for testing async)
      delay: async (msg) => {
        const ms = (msg['delay'] as number) ?? 100;
        const value = msg['value'] ?? msg;
        await new Promise(resolve => setTimeout(resolve, ms));
        return ok(value);
      },

      // Return an error (for testing error handling)
      error: async (msg) => {
        const status = (msg['status'] as number) ?? 500;
        const message = (msg['message'] as string) ?? 'Test error';
        return err(status, message);
      },

      // Return pass (for testing pass-through)
      pass: async () => pass(),

      // Device info
      info: async () => ok({
        name: 'echo@1.0',
        description: 'Echo device for testing',
        version: '1.0',
      }),
    },

    // HTTP request handler
    httpHandler: async (msg, req) => {
      return ok({
        status: 200,
        body: JSON.stringify({
          echoed: true,
          message: msg,
          request: req,
        }),
        headers: {
          'content-type': 'application/json',
        },
      });
    },
  });
}

/**
 * Create a transform device that applies transformations to messages
 *
 * @example
 * ```typescript
 * const transform = createTransformDevice({
 *   double: (msg) => ({ value: (msg.value as number) * 2 }),
 *   uppercase: (msg) => ({ value: String(msg.value).toUpperCase() }),
 * });
 * ```
 */
export function createTransformDevice(
  transforms: Record<string, (msg: TABMMessage) => TABMMessage | TABMValue>
): Device {
  const handlers: Record<string, (msg: TABMMessage) => Promise<{ ok: true; value: TABMValue }>> = {};

  for (const [name, fn] of Object.entries(transforms)) {
    handlers[name] = async (msg) => {
      const result = fn(msg);
      return ok(result);
    };
  }

  // Add info handler
  handlers['info'] = async () => ok({
    name: 'transform@1.0',
    description: 'Custom transform device',
    transforms: Object.keys(transforms),
  });

  return buildDevice({
    name: 'transform',
    version: '1.0',
    exports: [...Object.keys(transforms), 'info'],
    handlers,
  });
}

/**
 * Create a logger device that logs operations
 * Useful for debugging device stacks
 */
export function createLoggerDevice(
  logFn: (operation: string, data: unknown) => void = console.log
): Device {
  return buildDevice({
    name: 'logger',
    version: '1.0',
    exports: ['log', 'info'],
    handlers: {
      log: async (msg) => {
        const level = (msg['level'] as string) ?? 'info';
        const message = msg['message'] ?? msg;
        logFn(`[${level}]`, message);
        return ok({ logged: true });
      },
      info: async () => ok({
        name: 'logger@1.0',
        description: 'Logger device for debugging',
      }),
    },
  });
}

// Export types
export type EchoDevice = ReturnType<typeof createEchoDevice>;
export type TransformDevice = ReturnType<typeof createTransformDevice>;
export type LoggerDevice = ReturnType<typeof createLoggerDevice>;
