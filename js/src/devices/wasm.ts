/**
 * WASM Device
 * WebAssembly module execution
 */

import type { Device, DeviceInfo } from '../types/device.js';
import type { TABMMessage, TABMValue } from '../types/message.js';
import type { ResolveResult, Result } from '../types/result.js';
import type { ResolveOptions } from '../types/options.js';
import type { Binary, Base64URL } from '../types/primitives.js';
import type { Store } from '../types/store.js';
import { ok, err, pass, isOk } from '../types/result.js';
import { toBase64URL, fromBase64URL, toBinary, fromBinary } from '../utils/encoding.js';

/** WASM device exports */
const WASM_EXPORTS = [
  'load',
  'call',
  'memory',
  'info',
  'state',
  'snapshot',
  'restore',
];

/** WASM module instance */
interface WASMInstance {
  module: WebAssembly.Module;
  instance: WebAssembly.Instance;
  memory: WebAssembly.Memory;
  exports: string[];
}

/** WASM device - executes WebAssembly modules */
export class WASMDevice implements Device {
  private instances: Map<string, WASMInstance> = new Map();
  private store?: Store;

  constructor(store?: Store) {
    this.store = store;
  }

  info(_msg?: TABMMessage): DeviceInfo {
    return {
      exports: WASM_EXPORTS,
      default: 'call',
    };
  }

  async get(
    key: string,
    msg: TABMMessage,
    opts: ResolveOptions
  ): Promise<ResolveResult<TABMValue>> {
    switch (key) {
      case 'load': {
        const moduleId = msg['module'] as Base64URL;
        const moduleBytes = msg['wasm'] as Binary;

        if (!moduleId && !moduleBytes) {
          return err(400, 'load requires module or wasm');
        }

        try {
          let bytes: Binary;

          if (moduleBytes) {
            bytes = moduleBytes;
          } else if (this.store && moduleId) {
            const result = await this.store.read(moduleId);
            if (!isOk(result)) {
              return err(404, `Module not found: ${moduleId}`);
            }
            bytes = result.value;
          } else {
            return err(400, 'Cannot load module without store');
          }

          // Compile and instantiate
          const module = await WebAssembly.compile(bytes as BufferSource);
          const memory = new WebAssembly.Memory({ initial: 256, maximum: 512 });

          const importObject = {
            env: {
              memory,
              // Standard imports for AO modules
              ao_get: this.createAOGet(msg, opts),
              ao_set: this.createAOSet(msg, opts),
              ao_spawn: this.createAOSpawn(opts),
              ao_send: this.createAOSend(opts),
              ao_log: this.createAOLog(),
            },
          };

          const instance = await WebAssembly.instantiate(module, importObject);

          // Get exported function names
          const exports = Object.keys(instance.exports).filter(
            name => typeof instance.exports[name] === 'function'
          );

          const instanceId = moduleId ?? toBase64URL(bytes.slice(0, 32));

          this.instances.set(instanceId, {
            module,
            instance,
            memory,
            exports,
          });

          return ok({
            'module-id': instanceId,
            'exports': exports,
          });
        } catch (e) {
          return err(500, `WASM load error: ${(e as Error).message}`);
        }
      }

      case 'call': {
        const moduleId = msg['module'] as Base64URL;
        const funcName = msg['function'] as string;
        const args = msg['args'] as TABMValue[] | undefined;

        if (!moduleId) {
          return err(400, 'call requires module');
        }

        if (!funcName) {
          return err(400, 'call requires function');
        }

        const inst = this.instances.get(moduleId);
        if (!inst) {
          return err(404, `Module not loaded: ${moduleId}`);
        }

        const func = inst.instance.exports[funcName];
        if (typeof func !== 'function') {
          return err(404, `Function not found: ${funcName}`);
        }

        try {
          // Convert args to WASM-compatible format
          const wasmArgs = this.convertToWASMArgs(args ?? [], inst);
          const result = func(...wasmArgs);
          const converted = this.convertFromWASMResult(result, inst);
          return ok(converted);
        } catch (e) {
          return err(500, `WASM call error: ${(e as Error).message}`);
        }
      }

      case 'memory': {
        const moduleId = msg['module'] as Base64URL;
        const offset = (msg['offset'] as number) ?? 0;
        const length = (msg['length'] as number) ?? 256;

        if (!moduleId) {
          return err(400, 'memory requires module');
        }

        const inst = this.instances.get(moduleId);
        if (!inst) {
          return err(404, `Module not loaded: ${moduleId}`);
        }

        const buffer = new Uint8Array(inst.memory.buffer);
        return ok(buffer.slice(offset, offset + length));
      }

      case 'info': {
        const moduleId = msg['module'] as Base64URL;

        if (!moduleId) {
          // Return info about all loaded modules
          return ok({
            'loaded-modules': Array.from(this.instances.keys()),
          });
        }

        const inst = this.instances.get(moduleId);
        if (!inst) {
          return err(404, `Module not loaded: ${moduleId}`);
        }

        return ok({
          'module-id': moduleId,
          'exports': inst.exports,
          'memory-size': inst.memory.buffer.byteLength,
        });
      }

      case 'state': {
        const moduleId = msg['module'] as Base64URL;

        if (!moduleId) {
          return err(400, 'state requires module');
        }

        const inst = this.instances.get(moduleId);
        if (!inst) {
          return err(404, `Module not loaded: ${moduleId}`);
        }

        // Return memory as state
        return ok(new Uint8Array(inst.memory.buffer));
      }

      case 'snapshot': {
        const moduleId = msg['module'] as Base64URL;

        if (!moduleId) {
          return err(400, 'snapshot requires module');
        }

        const inst = this.instances.get(moduleId);
        if (!inst) {
          return err(404, `Module not loaded: ${moduleId}`);
        }

        const memoryData = new Uint8Array(inst.memory.buffer);

        if (this.store) {
          const result = await this.store.write(memoryData);
          if (isOk(result)) {
            return ok({ 'snapshot-id': result.value });
          }
        }

        return ok({ 'snapshot': memoryData });
      }

      case 'restore': {
        const moduleId = msg['module'] as Base64URL;
        const snapshotId = msg['snapshot-id'] as Base64URL;
        const snapshotData = msg['snapshot'] as Binary;

        if (!moduleId) {
          return err(400, 'restore requires module');
        }

        const inst = this.instances.get(moduleId);
        if (!inst) {
          return err(404, `Module not loaded: ${moduleId}`);
        }

        let data: Binary;

        if (snapshotData) {
          data = snapshotData;
        } else if (snapshotId && this.store) {
          const result = await this.store.read(snapshotId);
          if (!isOk(result)) {
            return err(404, `Snapshot not found: ${snapshotId}`);
          }
          data = result.value;
        } else {
          return err(400, 'restore requires snapshot-id or snapshot');
        }

        // Copy data to memory
        const memView = new Uint8Array(inst.memory.buffer);
        memView.set(data.slice(0, memView.length));

        return ok({ 'restored': moduleId });
      }

      default:
        return pass();
    }
  }

  /** Convert JS args to WASM-compatible */
  private convertToWASMArgs(args: TABMValue[], inst: WASMInstance): number[] {
    return args.map(arg => {
      if (typeof arg === 'number') {
        return arg;
      }
      if (typeof arg === 'boolean') {
        return arg ? 1 : 0;
      }
      // For other types, would need to allocate in WASM memory
      return 0;
    });
  }

  /** Convert WASM result to JS */
  private convertFromWASMResult(result: unknown, inst: WASMInstance): TABMValue {
    if (typeof result === 'number') {
      return result;
    }
    if (typeof result === 'bigint') {
      return Number(result);
    }
    return null;
  }

  /** Create ao_get import function */
  private createAOGet(msg: TABMMessage, opts: ResolveOptions): (ptr: number, len: number) => number {
    return (ptr: number, len: number) => {
      // Would read key from memory and return value
      return 0;
    };
  }

  /** Create ao_set import function */
  private createAOSet(msg: TABMMessage, opts: ResolveOptions): (keyPtr: number, keyLen: number, valPtr: number, valLen: number) => number {
    return (keyPtr: number, keyLen: number, valPtr: number, valLen: number) => {
      // Would write key-value to message
      return 0;
    };
  }

  /** Create ao_spawn import function */
  private createAOSpawn(opts: ResolveOptions): (ptr: number, len: number) => number {
    return (ptr: number, len: number) => {
      // Would spawn new process
      return 0;
    };
  }

  /** Create ao_send import function */
  private createAOSend(opts: ResolveOptions): (ptr: number, len: number) => number {
    return (ptr: number, len: number) => {
      // Would send message
      return 0;
    };
  }

  /** Create ao_log import function */
  private createAOLog(): (ptr: number, len: number) => void {
    return (ptr: number, len: number) => {
      // Would log message
    };
  }

  /** Check if module is loaded */
  hasModule(moduleId: Base64URL): boolean {
    return this.instances.has(moduleId);
  }

  /** Unload a module */
  unload(moduleId: Base64URL): boolean {
    return this.instances.delete(moduleId);
  }

  /** Clear all modules */
  clear(): void {
    this.instances.clear();
  }
}

/** Create a WASM device instance */
export function createWASMDevice(store?: Store): WASMDevice {
  return new WASMDevice(store);
}
