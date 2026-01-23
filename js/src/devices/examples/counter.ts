/**
 * Counter Device - Similar to Erlang dev_inc.erl
 * Demonstrates stateful device with increment/decrement operations
 *
 * Compatible with process@1.0 device stack for state management
 */

import { statefulDevice, ok, err, pass } from '../builder.js';
import type { TABMMessage } from '../../types/message.js';
import type { ResolveOptions } from '../../types/options.js';
import type { ResolveResult } from '../../types/result.js';
import type { TABMValue } from '../../types/message.js';

interface CounterState {
  value: number;
}

/**
 * Create a counter device
 *
 * Exports:
 * - init: Initialize counter with optional starting value
 * - compute: Process increment/decrement/reset actions
 * - get: Get current value
 * - info: Get device info
 *
 * @example
 * ```typescript
 * const counter = createCounterDevice();
 *
 * // Initialize
 * await counter.get('init', { value: 10 }, {});
 *
 * // Increment
 * await counter.get('compute', { action: 'increment' }, {});
 *
 * // Get value
 * const result = await counter.get('get', {}, {});
 * // result.value === 11
 * ```
 */
export function createCounterDevice(initialValue = 0) {
  return statefulDevice<CounterState>(
    'counter',
    { value: initialValue },
    {
      version: '1.0',
      exports: ['init', 'compute', 'get', 'set', 'increment', 'decrement', 'reset', 'info'],
      default: 'get',
      handlers: {
        // Initialize counter with optional value
        init: (state, msg) => {
          const newValue = (msg['value'] as number) ?? 0;
          return {
            result: ok({ initialized: true, value: newValue }),
            newState: { value: newValue },
          };
        },

        // Main compute handler - processes actions
        // Compatible with process@1.0 device stack
        compute: (state, msg) => {
          const action = msg['action'] as string;
          const amount = (msg['amount'] as number) ?? 1;

          switch (action) {
            case 'increment':
            case 'inc': {
              const newValue = state.value + amount;
              return {
                result: ok({ value: newValue, action: 'incremented' }),
                newState: { value: newValue },
              };
            }
            case 'decrement':
            case 'dec': {
              const newValue = state.value - amount;
              return {
                result: ok({ value: newValue, action: 'decremented' }),
                newState: { value: newValue },
              };
            }
            case 'reset': {
              const resetTo = (msg['value'] as number) ?? 0;
              return {
                result: ok({ value: resetTo, action: 'reset' }),
                newState: { value: resetTo },
              };
            }
            case 'get':
            case undefined: {
              return {
                result: ok(state.value),
              };
            }
            default:
              return {
                result: err(400, `Unknown action: ${action}`),
              };
          }
        },

        // Get current value
        get: (state) => ({
          result: ok(state.value),
        }),

        // Set value directly
        set: (state, msg) => {
          const newValue = msg['value'] as number;
          if (typeof newValue !== 'number') {
            return { result: err(400, 'value must be a number') };
          }
          return {
            result: ok({ value: newValue, action: 'set' }),
            newState: { value: newValue },
          };
        },

        // Shorthand increment
        increment: (state, msg) => {
          const amount = (msg['amount'] as number) ?? 1;
          const newValue = state.value + amount;
          return {
            result: ok(newValue),
            newState: { value: newValue },
          };
        },

        // Shorthand decrement
        decrement: (state, msg) => {
          const amount = (msg['amount'] as number) ?? 1;
          const newValue = state.value - amount;
          return {
            result: ok(newValue),
            newState: { value: newValue },
          };
        },

        // Reset to initial value
        reset: (state, msg) => {
          const newValue = (msg['value'] as number) ?? initialValue;
          return {
            result: ok({ value: newValue, action: 'reset' }),
            newState: { value: newValue },
          };
        },

        // Device info
        info: () => ({
          result: ok({
            name: 'counter@1.0',
            description: 'Stateful counter device',
            version: '1.0',
          }),
        }),
      },
    }
  );
}

// Export type for the counter device
export type CounterDevice = ReturnType<typeof createCounterDevice>;
