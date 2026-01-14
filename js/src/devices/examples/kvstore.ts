/**
 * Key-Value Store Device
 * Demonstrates a stateful device with persistent key-value storage
 */

import { statefulDevice, ok, err, pass } from '../builder.js';
import type { TABMMessage, TABMValue } from '../../types/message.js';

interface KVStoreState {
  data: Map<string, TABMValue>;
}

/**
 * Create a key-value store device
 *
 * Exports:
 * - get: Get value by key
 * - set: Set key-value pair
 * - delete: Delete a key
 * - has: Check if key exists
 * - keys: List all keys
 * - values: List all values
 * - entries: List all key-value pairs
 * - size: Get number of entries
 * - clear: Clear all data
 *
 * @example
 * ```typescript
 * const kv = createKVStoreDevice();
 *
 * // Set a value
 * await kv.get('set', { key: 'name', value: 'Alice' }, {});
 *
 * // Get a value
 * const result = await kv.get('get', { key: 'name' }, {});
 * // result.value === 'Alice'
 *
 * // Check if key exists
 * const exists = await kv.get('has', { key: 'name' }, {});
 * // exists.value === true
 * ```
 */
export function createKVStoreDevice(namespace?: string) {
  const deviceName = namespace ? `kvstore-${namespace}` : 'kvstore';

  return statefulDevice<KVStoreState>(
    deviceName,
    { data: new Map() },
    {
      version: '1.0',
      exports: ['get', 'set', 'delete', 'has', 'keys', 'values', 'entries', 'size', 'clear', 'info', 'compute'],
      default: 'get',
      handlers: {
        // Get value by key
        get: (state, msg) => {
          const key = msg['key'] as string ?? msg['requested-key'] as string;
          if (!key) {
            return { result: err(400, 'key is required') };
          }
          const value = state.data.get(key);
          if (value === undefined) {
            return { result: pass() };
          }
          return { result: ok(value) };
        },

        // Set key-value pair
        set: (state, msg) => {
          const key = msg['key'] as string;
          const value = msg['value'] as TABMValue;
          if (!key) {
            return { result: err(400, 'key is required') };
          }
          const newData = new Map(state.data);
          newData.set(key, value);
          return {
            result: ok({ key, value, action: 'set' }),
            newState: { data: newData },
          };
        },

        // Delete a key
        delete: (state, msg) => {
          const key = msg['key'] as string;
          if (!key) {
            return { result: err(400, 'key is required') };
          }
          if (!state.data.has(key)) {
            return { result: err(404, `Key not found: ${key}`) };
          }
          const newData = new Map(state.data);
          newData.delete(key);
          return {
            result: ok({ key, action: 'deleted' }),
            newState: { data: newData },
          };
        },

        // Check if key exists
        has: (state, msg) => {
          const key = msg['key'] as string ?? msg['requested-key'] as string;
          if (!key) {
            return { result: err(400, 'key is required') };
          }
          return { result: ok(state.data.has(key)) };
        },

        // List all keys
        keys: (state) => ({
          result: ok(Array.from(state.data.keys())),
        }),

        // List all values
        values: (state) => ({
          result: ok(Array.from(state.data.values())),
        }),

        // List all entries as array of [key, value] pairs
        entries: (state) => ({
          result: ok(Array.from(state.data.entries())),
        }),

        // Get number of entries
        size: (state) => ({
          result: ok(state.data.size),
        }),

        // Clear all data
        clear: () => ({
          result: ok({ action: 'cleared' }),
          newState: { data: new Map() },
        }),

        // Process@1.0 compatible compute handler
        compute: (state, msg) => {
          const action = msg['action'] as string;
          const key = msg['key'] as string;
          const value = msg['value'] as TABMValue;

          switch (action) {
            case 'get':
              if (!key) return { result: err(400, 'key required for get') };
              return {
                result: state.data.has(key) ? ok(state.data.get(key)) : pass(),
              };
            case 'set':
              if (!key) return { result: err(400, 'key required for set') };
              const newDataSet = new Map(state.data);
              newDataSet.set(key, value);
              return {
                result: ok({ key, value }),
                newState: { data: newDataSet },
              };
            case 'delete':
              if (!key) return { result: err(400, 'key required for delete') };
              const newDataDel = new Map(state.data);
              newDataDel.delete(key);
              return {
                result: ok({ key, deleted: true }),
                newState: { data: newDataDel },
              };
            default:
              return { result: err(400, `Unknown action: ${action}`) };
          }
        },

        // Device info
        info: (state) => ({
          result: ok({
            name: `${deviceName}@1.0`,
            description: 'Key-value store device',
            version: '1.0',
            size: state.data.size,
            namespace,
          }),
        }),
      },
    }
  );
}

// Export type
export type KVStoreDevice = ReturnType<typeof createKVStoreDevice>;
