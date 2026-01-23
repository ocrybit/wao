/**
 * Scheduler Device
 * Message ordering and hash chain management
 */

import type { Device, DeviceInfo } from '../types/device.js';
import type { TABMMessage, TABMValue, Assignment } from '../types/message.js';
import type { ResolveResult, Result } from '../types/result.js';
import type { ResolveOptions } from '../types/options.js';
import type { Binary, Base64URL, Timestamp } from '../types/primitives.js';
import type { Wallet } from '../types/wallet.js';
import { ok, err, pass } from '../types/result.js';
import { sha256 } from '../crypto/hash.js';
import { toBase64URL, fromBase64URL, toBinary, concat } from '../utils/encoding.js';
import { computeMessageId } from '../utils/message.js';

/** Scheduler device exports */
const SCHEDULER_EXPORTS = [
  'slot',
  'assign',
  'assignments',
  'next-slot',
  'epoch',
  'nonce',
  'hash-chain',
  'schedule',
  'verify',
  'current',
  'history',
];

/** Epoch configuration */
export interface EpochConfig {
  /** Slots per epoch */
  slotsPerEpoch: number;
  /** Duration per epoch in ms */
  duration: number;
}

/** Process scheduling state */
interface SchedulerState {
  processId: Base64URL;
  currentSlot: number;
  currentEpoch: number;
  nonce: number;
  hashChain: Base64URL;
  assignments: Assignment[];
}

/** Default epoch configuration */
const DEFAULT_EPOCH_CONFIG: EpochConfig = {
  slotsPerEpoch: 1000,
  duration: 3600000, // 1 hour
};

/** Scheduler device - manages message ordering */
export class SchedulerDevice implements Device {
  private states: Map<string, SchedulerState> = new Map();
  private epochConfig: EpochConfig;
  private wallet?: Wallet;

  constructor(wallet?: Wallet, epochConfig?: Partial<EpochConfig>) {
    this.wallet = wallet;
    this.epochConfig = { ...DEFAULT_EPOCH_CONFIG, ...epochConfig };
  }

  info(_msg?: TABMMessage): DeviceInfo {
    return {
      exports: SCHEDULER_EXPORTS,
      default: 'assign',
    };
  }

  /** Initialize or get scheduler state for a process */
  private getOrCreateState(processId: Base64URL): SchedulerState {
    let state = this.states.get(processId);
    if (!state) {
      // Initialize with genesis hash
      const genesisHash = toBase64URL(new Uint8Array(32)); // Zero hash
      state = {
        processId,
        currentSlot: 0,
        currentEpoch: 0,
        nonce: 0,
        hashChain: genesisHash,
        assignments: [],
      };
      this.states.set(processId, state);
    }
    return state;
  }

  /** Compute next hash chain value */
  private async computeNextHashChain(
    prevHash: Base64URL,
    messageId: Base64URL,
    slot: number
  ): Promise<Base64URL> {
    // Decode prevHash (always valid base64URL from our initialization)
    const prevHashBytes = fromBase64URL(prevHash);
    // Message ID might be arbitrary string, so encode as UTF-8
    const messageIdBytes = toBinary(messageId);
    const slotBytes = toBinary(String(slot));

    const data = concat([prevHashBytes, messageIdBytes, slotBytes]);
    const hash = await sha256(data);
    return toBase64URL(hash);
  }

  async get(
    key: string,
    msg: TABMMessage,
    opts: ResolveOptions
  ): Promise<ResolveResult<TABMValue>> {
    const processId = msg['process'] as Base64URL;

    switch (key) {
      case 'slot': {
        if (!processId) {
          return err(400, 'slot requires process');
        }
        const state = this.getOrCreateState(processId);
        return ok(state.currentSlot);
      }

      case 'next-slot': {
        if (!processId) {
          return err(400, 'next-slot requires process');
        }
        const state = this.getOrCreateState(processId);
        return ok(state.currentSlot + 1);
      }

      case 'epoch': {
        if (!processId) {
          return err(400, 'epoch requires process');
        }
        const state = this.getOrCreateState(processId);
        return ok(state.currentEpoch);
      }

      case 'nonce': {
        if (!processId) {
          return err(400, 'nonce requires process');
        }
        const state = this.getOrCreateState(processId);
        return ok(state.nonce);
      }

      case 'hash-chain': {
        if (!processId) {
          return err(400, 'hash-chain requires process');
        }
        const state = this.getOrCreateState(processId);
        return ok(state.hashChain);
      }

      case 'assign': {
        if (!processId) {
          return err(400, 'assign requires process');
        }

        const messageId = msg['message'] as Base64URL;
        if (!messageId) {
          // Compute from message
          const id = await computeMessageId(msg);
          return this.createAssignment(processId, id);
        }

        return this.createAssignment(processId, messageId);
      }

      case 'schedule': {
        if (!processId) {
          return err(400, 'schedule requires process');
        }

        const messageId = await computeMessageId(msg);
        return this.createAssignment(processId, messageId);
      }

      case 'assignments': {
        if (!processId) {
          return err(400, 'assignments requires process');
        }
        const state = this.getOrCreateState(processId);
        const from = (msg['from'] as number) ?? 0;
        const to = (msg['to'] as number) ?? state.currentSlot;
        const assignments = state.assignments.filter(
          a => a.slot >= from && a.slot <= to
        );
        return ok(assignments);
      }

      case 'verify': {
        // Verify an assignment
        const assignment = msg['assignment'] as Assignment;
        if (!assignment) {
          return err(400, 'verify requires assignment');
        }

        const verified = await this.verifyAssignment(assignment);
        return ok(verified);
      }

      case 'current': {
        if (!processId) {
          return err(400, 'current requires process');
        }
        const state = this.getOrCreateState(processId);
        return ok({
          slot: state.currentSlot,
          epoch: state.currentEpoch,
          nonce: state.nonce,
          'hash-chain': state.hashChain,
        });
      }

      case 'history': {
        if (!processId) {
          return err(400, 'history requires process');
        }
        const state = this.getOrCreateState(processId);
        const limit = (msg['limit'] as number) ?? 10;
        const recent = state.assignments.slice(-limit);
        return ok(recent);
      }

      default:
        return pass();
    }
  }

  /** Create a new assignment */
  private async createAssignment(
    processId: Base64URL,
    messageId: Base64URL
  ): Promise<ResolveResult<Assignment>> {
    const state = this.getOrCreateState(processId);

    // Increment slot
    const slot = state.currentSlot + 1;
    const timestamp = Date.now() as Timestamp;

    // Update epoch if needed
    const newEpoch = Math.floor(slot / this.epochConfig.slotsPerEpoch);
    let nonce = state.nonce;
    if (newEpoch > state.currentEpoch) {
      nonce = 0;
    } else {
      nonce += 1;
    }

    // Compute new hash chain
    const hashChain = await this.computeNextHashChain(state.hashChain, messageId, slot);

    // Create assignment
    const assignment: Assignment = {
      'type': 'assignment',
      'slot': slot,
      'timestamp': timestamp,
      'block-height': 0, // Would come from block source
      'process': processId,
      'message': messageId,
      'epoch': newEpoch,
      'nonce': nonce,
      'hash-chain': hashChain,
      'signature': new Uint8Array(0), // Would be signed with wallet
      'owner': new Uint8Array(0), // Would be set from wallet
    };

    // Sign if wallet available
    if (this.wallet) {
      // Signature would be computed here
    }

    // Update state
    state.currentSlot = slot;
    state.currentEpoch = newEpoch;
    state.nonce = nonce;
    state.hashChain = hashChain;
    state.assignments.push(assignment);

    return ok(assignment);
  }

  /** Verify an assignment */
  private async verifyAssignment(assignment: Assignment): Promise<boolean> {
    // Verify hash chain continuity
    const state = this.states.get(assignment.process);
    if (!state) {
      return false;
    }

    // Find previous assignment
    const prevAssignment = state.assignments.find(a => a.slot === assignment.slot - 1);
    if (!prevAssignment && assignment.slot > 1) {
      return false;
    }

    const prevHash = prevAssignment?.['hash-chain'] ?? toBase64URL(new Uint8Array(32));
    const expectedHash = await this.computeNextHashChain(
      prevHash,
      assignment.message,
      assignment.slot
    );

    return expectedHash === assignment['hash-chain'];
  }

  /** Get state for a process */
  getState(processId: Base64URL): SchedulerState | undefined {
    return this.states.get(processId);
  }

  /** Clear all states */
  clear(): void {
    this.states.clear();
  }
}

/** Create a scheduler device instance */
export function createSchedulerDevice(
  wallet?: Wallet,
  epochConfig?: Partial<EpochConfig>
): SchedulerDevice {
  return new SchedulerDevice(wallet, epochConfig);
}
