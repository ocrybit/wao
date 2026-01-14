/**
 * Process Device
 * Process definition and state management
 */

import type { Device, DeviceInfo } from '../types/device.js';
import type { TABMMessage, TABMValue, Process, ProcessState } from '../types/message.js';
import type { ResolveResult, Result } from '../types/result.js';
import type { ResolveOptions } from '../types/options.js';
import type { Store } from '../types/store.js';
import type { Base64URL } from '../types/primitives.js';
import { ok, err, pass, isOk } from '../types/result.js';
import { computeMessageId } from '../utils/message.js';

/** Process device exports */
const PROCESS_EXPORTS = [
  'id',
  'slot',
  'state',
  'results',
  'spawn',
  'push',
  'compute',
  'schedule',
  'checkpoint',
  'restore',
];

/** Process device - manages process lifecycle */
export class ProcessDevice implements Device {
  private store?: Store;
  private states: Map<string, ProcessState> = new Map();

  constructor(store?: Store) {
    this.store = store;
  }

  info(_msg?: TABMMessage): DeviceInfo {
    return {
      exports: PROCESS_EXPORTS,
      default: 'compute',
    };
  }

  async get(
    key: string,
    msg: TABMMessage,
    opts: ResolveOptions
  ): Promise<ResolveResult<TABMValue>> {
    switch (key) {
      case 'id': {
        // Get process ID from message
        const processId = msg['process'] as Base64URL;
        return ok(processId ?? null);
      }

      case 'slot': {
        const processId = msg['process'] as Base64URL;
        if (!processId) {
          return err(400, 'No process specified');
        }

        const state = this.states.get(processId);
        return ok(state?.slot ?? 0);
      }

      case 'state': {
        const processId = msg['process'] as Base64URL;
        if (!processId) {
          return err(400, 'No process specified');
        }

        const state = this.states.get(processId);
        if (!state) {
          // Return empty initial state
          return ok({});
        }
        return ok(state.state);
      }

      case 'results': {
        const processId = msg['process'] as Base64URL;
        if (!processId) {
          return err(400, 'No process specified');
        }

        const state = this.states.get(processId);
        return ok(state?.results ?? []);
      }

      case 'spawn': {
        // Create new process definition
        const device = msg['execution-device'] as string;
        const scheduler = msg['scheduler-device'] as string;

        if (!device) {
          return err(400, 'spawn requires execution-device');
        }

        const processMsg: Process = {
          'device': 'process@1.0',
          'execution-device': device,
          'scheduler-device': scheduler ?? 'scheduler@1.0',
          'scheduler': msg['scheduler'] as Base64URL,
          'authority': msg['authority'] as Base64URL,
          'module': msg['module'] as Base64URL,
        };

        const processId = await computeMessageId(processMsg);

        // Initialize state
        this.states.set(processId, {
          process: processId,
          slot: 0,
          state: {},
          results: [],
        });

        return ok({ ...processMsg, 'id': processId });
      }

      case 'compute': {
        // Execute computation step
        const processId = msg['process'] as Base64URL;
        if (!processId) {
          return err(400, 'compute requires process');
        }

        const state = this.states.get(processId);
        if (!state) {
          return err(404, `Process not found: ${processId}`);
        }

        // Computation would be delegated to execution device
        // For now, return current state
        return ok(state.state);
      }

      case 'schedule': {
        // Schedule a message for processing
        const processId = msg['process'] as Base64URL;
        if (!processId) {
          return err(400, 'schedule requires process');
        }

        const state = this.states.get(processId);
        if (!state) {
          return err(404, `Process not found: ${processId}`);
        }

        // Increment slot
        state.slot += 1;

        return ok({
          'type': 'scheduled',
          'process': processId,
          'slot': state.slot,
          'timestamp': Date.now(),
        });
      }

      case 'checkpoint': {
        // Save process state
        const processId = msg['process'] as Base64URL;
        if (!processId) {
          return err(400, 'checkpoint requires process');
        }

        const state = this.states.get(processId);
        if (!state) {
          return err(404, `Process not found: ${processId}`);
        }

        if (this.store) {
          const data = new TextEncoder().encode(JSON.stringify(state));
          const result = await this.store.write(data);
          if (!isOk(result)) {
            return err(500, 'Failed to save checkpoint');
          }
          return ok({ 'checkpoint-id': result.value });
        }

        return ok({ 'checkpoint': state as unknown as TABMMessage });
      }

      case 'restore': {
        // Restore process state
        const checkpointId = msg['checkpoint-id'] as Base64URL;
        if (!checkpointId) {
          return err(400, 'restore requires checkpoint-id');
        }

        if (!this.store) {
          return err(500, 'No store configured for restore');
        }

        const result = await this.store.read(checkpointId);
        if (!isOk(result)) {
          return err(404, `Checkpoint not found: ${checkpointId}`);
        }

        const state = JSON.parse(new TextDecoder().decode(result.value)) as ProcessState;
        this.states.set(state.process, state);

        return ok({ 'restored': state.process, 'slot': state.slot });
      }

      default:
        return pass();
    }
  }

  async set(
    key: string,
    value: TABMValue,
    msg: TABMMessage,
    _opts: ResolveOptions
  ): Promise<Result<TABMMessage>> {
    const processId = msg['process'] as Base64URL;

    if (key === 'state' && processId) {
      const state = this.states.get(processId);
      if (state && typeof value === 'object' && value !== null && !Array.isArray(value)) {
        state.state = value as TABMMessage;
        return ok({ ...msg, 'state-updated': true });
      }
    }

    return ok(msg);
  }

  /** Get current state for a process */
  getState(processId: Base64URL): ProcessState | undefined {
    return this.states.get(processId);
  }

  /** Set state directly (for testing) */
  setState(processId: Base64URL, state: ProcessState): void {
    this.states.set(processId, state);
  }

  /** Clear all states */
  clear(): void {
    this.states.clear();
  }
}

/** Create a process device instance */
export function createProcessDevice(store?: Store): ProcessDevice {
  return new ProcessDevice(store);
}
