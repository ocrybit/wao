/**
 * Math Device - Similar to Erlang dev_double.erl, dev_square.erl
 * Demonstrates stateless device with mathematical operations
 *
 * These devices can be composed in a device stack
 */

import { simpleDevice, buildDevice, ok, err, pass } from '../builder.js';
import type { Device } from '../../types/device.js';
import type { TABMMessage } from '../../types/message.js';

/**
 * Create a double device - doubles input values
 * Similar to Erlang dev_double.erl
 *
 * @example
 * ```typescript
 * const double = createDoubleDevice();
 * const result = await double.get('compute', { value: 5 }, {});
 * // result.value === 10
 * ```
 */
export function createDoubleDevice(): Device {
  return simpleDevice(
    'double',
    {
      compute: async (msg) => {
        const value = msg['value'] as number;
        if (typeof value !== 'number') {
          return err(400, 'value must be a number');
        }
        return ok(value * 2);
      },
      info: async () => ok({
        name: 'double@1.0',
        description: 'Doubles input value',
        version: '1.0',
      }),
    },
    { version: '1.0', default: 'compute' }
  );
}

/**
 * Create a square device - squares input values
 * Similar to Erlang dev_square.erl
 *
 * @example
 * ```typescript
 * const square = createSquareDevice();
 * const result = await square.get('compute', { value: 4 }, {});
 * // result.value === 16
 * ```
 */
export function createSquareDevice(): Device {
  return simpleDevice(
    'square',
    {
      compute: async (msg) => {
        const value = msg['value'] as number;
        if (typeof value !== 'number') {
          return err(400, 'value must be a number');
        }
        return ok(value * value);
      },
      info: async () => ok({
        name: 'square@1.0',
        description: 'Squares input value',
        version: '1.0',
      }),
    },
    { version: '1.0', default: 'compute' }
  );
}

/**
 * Create a comprehensive math device with multiple operations
 *
 * Exports: add, subtract, multiply, divide, pow, sqrt, abs, mod, compute
 *
 * @example
 * ```typescript
 * const math = createMathDevice();
 *
 * // Add
 * await math.get('add', { a: 5, b: 3 }, {}); // 8
 *
 * // Multiply
 * await math.get('multiply', { a: 4, b: 7 }, {}); // 28
 *
 * // Power
 * await math.get('pow', { base: 2, exponent: 10 }, {}); // 1024
 *
 * // General compute
 * await math.get('compute', { op: 'add', a: 1, b: 2 }, {}); // 3
 * ```
 */
export function createMathDevice(): Device {
  return buildDevice({
    name: 'math',
    version: '1.0',
    exports: [
      'add', 'subtract', 'multiply', 'divide',
      'pow', 'sqrt', 'abs', 'mod', 'neg',
      'min', 'max', 'round', 'floor', 'ceil',
      'compute', 'info'
    ],
    default: 'compute',
    handlers: {
      // Binary operations
      add: async (msg) => {
        const a = msg['a'] as number ?? msg['value'] as number;
        const b = msg['b'] as number ?? 0;
        if (typeof a !== 'number') return err(400, 'a must be a number');
        return ok(a + b);
      },

      subtract: async (msg) => {
        const a = msg['a'] as number ?? msg['value'] as number;
        const b = msg['b'] as number ?? 0;
        if (typeof a !== 'number') return err(400, 'a must be a number');
        return ok(a - b);
      },

      multiply: async (msg) => {
        const a = msg['a'] as number ?? msg['value'] as number;
        const b = msg['b'] as number ?? 1;
        if (typeof a !== 'number') return err(400, 'a must be a number');
        return ok(a * b);
      },

      divide: async (msg) => {
        const a = msg['a'] as number ?? msg['value'] as number;
        const b = msg['b'] as number ?? 1;
        if (typeof a !== 'number') return err(400, 'a must be a number');
        if (b === 0) return err(400, 'division by zero');
        return ok(a / b);
      },

      mod: async (msg) => {
        const a = msg['a'] as number ?? msg['value'] as number;
        const b = msg['b'] as number;
        if (typeof a !== 'number' || typeof b !== 'number') {
          return err(400, 'both a and b must be numbers');
        }
        return ok(a % b);
      },

      // Power operations
      pow: async (msg) => {
        const base = msg['base'] as number ?? msg['a'] as number ?? msg['value'] as number;
        const exponent = msg['exponent'] as number ?? msg['b'] as number ?? 2;
        if (typeof base !== 'number') return err(400, 'base must be a number');
        return ok(Math.pow(base, exponent));
      },

      sqrt: async (msg) => {
        const value = msg['value'] as number ?? msg['a'] as number;
        if (typeof value !== 'number') return err(400, 'value must be a number');
        if (value < 0) return err(400, 'cannot take sqrt of negative number');
        return ok(Math.sqrt(value));
      },

      // Unary operations
      abs: async (msg) => {
        const value = msg['value'] as number ?? msg['a'] as number;
        if (typeof value !== 'number') return err(400, 'value must be a number');
        return ok(Math.abs(value));
      },

      neg: async (msg) => {
        const value = msg['value'] as number ?? msg['a'] as number;
        if (typeof value !== 'number') return err(400, 'value must be a number');
        return ok(-value);
      },

      // Comparison
      min: async (msg) => {
        const values = msg['values'] as number[] ?? [msg['a'] as number, msg['b'] as number];
        if (!Array.isArray(values) || values.some(v => typeof v !== 'number')) {
          return err(400, 'values must be an array of numbers');
        }
        return ok(Math.min(...values));
      },

      max: async (msg) => {
        const values = msg['values'] as number[] ?? [msg['a'] as number, msg['b'] as number];
        if (!Array.isArray(values) || values.some(v => typeof v !== 'number')) {
          return err(400, 'values must be an array of numbers');
        }
        return ok(Math.max(...values));
      },

      // Rounding
      round: async (msg) => {
        const value = msg['value'] as number;
        if (typeof value !== 'number') return err(400, 'value must be a number');
        const precision = (msg['precision'] as number) ?? 0;
        const factor = Math.pow(10, precision);
        return ok(Math.round(value * factor) / factor);
      },

      floor: async (msg) => {
        const value = msg['value'] as number;
        if (typeof value !== 'number') return err(400, 'value must be a number');
        return ok(Math.floor(value));
      },

      ceil: async (msg) => {
        const value = msg['value'] as number;
        if (typeof value !== 'number') return err(400, 'value must be a number');
        return ok(Math.ceil(value));
      },

      // General compute dispatcher
      compute: async (msg) => {
        const op = msg['op'] as string ?? msg['operation'] as string;
        const value = msg['value'] as number;
        const a = msg['a'] as number ?? value;
        const b = msg['b'] as number;

        switch (op) {
          case 'add': return ok((a ?? 0) + (b ?? 0));
          case 'subtract': case 'sub': return ok((a ?? 0) - (b ?? 0));
          case 'multiply': case 'mul': return ok((a ?? 1) * (b ?? 1));
          case 'divide': case 'div':
            if (b === 0) return err(400, 'division by zero');
            return ok((a ?? 0) / (b ?? 1));
          case 'pow': case 'power':
            return ok(Math.pow(a ?? 0, b ?? 2));
          case 'sqrt':
            return ok(Math.sqrt(a ?? 0));
          case 'abs':
            return ok(Math.abs(a ?? 0));
          case 'neg': case 'negate':
            return ok(-(a ?? 0));
          case 'double':
            return ok((a ?? 0) * 2);
          case 'square':
            return ok((a ?? 0) * (a ?? 0));
          default:
            return err(400, `Unknown operation: ${op}`);
        }
      },

      info: async () => ok({
        name: 'math@1.0',
        description: 'Mathematical operations device',
        version: '1.0',
        operations: ['add', 'subtract', 'multiply', 'divide', 'pow', 'sqrt', 'abs', 'mod'],
      }),
    },
  });
}

// Export types
export type DoubleDevice = ReturnType<typeof createDoubleDevice>;
export type SquareDevice = ReturnType<typeof createSquareDevice>;
export type MathDevice = ReturnType<typeof createMathDevice>;
