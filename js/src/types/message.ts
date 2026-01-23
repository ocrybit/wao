/**
 * AO-Core Message Types
 */

import type { Binary, Base64URL, Address, Timestamp, SignatureType } from './primitives.js';

/** Base TABM value types */
export type TABMValue =
  | string
  | number
  | boolean
  | Binary
  | TABMMessage
  | TABMValue[]
  | null
  | undefined;

/** Core message structure - key-value map */
export interface TABMMessage {
  [key: string]: TABMValue;
}

/** Standard message with common keys */
export interface StandardMessage extends TABMMessage {
  // Identity
  'id'?: Base64URL;
  'unsigned-id'?: Base64URL;

  // Device configuration
  'device'?: string;
  'device-stack'?: string[];

  // HTTP-like fields
  'path'?: string;
  'method'?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  'body'?: Binary | TABMMessage;
  'status'?: number;

  // Cryptographic fields
  'signature'?: Binary;
  'signature-input'?: string;
  'signature-type'?: SignatureType;
  'owner'?: Binary;
  'target'?: Binary;
  'anchor'?: Binary;

  // Process fields
  'process'?: Base64URL;
  'slot'?: number;
  'timestamp'?: Timestamp;
  'block-height'?: number;

  // Scheduling
  'scheduler'?: Address;
  'nonce'?: number;
  'hash-chain'?: Base64URL;
  'epoch'?: number;
}

/** Tag structure for ANS-104 encoding */
export interface Tag {
  name: Binary;
  value: Binary;
}

/** Bundle manifest format */
export interface BundleManifest {
  manifest: 'arweave/paths';
  version: '0.2.0';
  paths: Record<string, { id: Base64URL }>;
}

/** Assignment message from scheduler */
export interface Assignment extends TABMMessage {
  'type': 'assignment';
  'slot': number;
  'timestamp': Timestamp;
  'block-height': number;
  'block-hash'?: Base64URL;
  'block-timestamp'?: Timestamp;
  'process': Base64URL;
  'message': Base64URL;
  'epoch': number;
  'nonce': number;
  'hash-chain': Base64URL;
  'signature': Binary;
  'owner': Binary;
}

/** Process definition message */
export interface Process extends TABMMessage {
  'device': 'process@1.0';
  'execution-device': string;
  'scheduler-device': string;
  'scheduler'?: Address;
  'authority'?: Address;
  'module'?: Base64URL;
}

/** Process state after execution */
export interface ProcessState {
  process: Base64URL;
  slot: number;
  state: TABMMessage;
  results?: TABMMessage[];
}
