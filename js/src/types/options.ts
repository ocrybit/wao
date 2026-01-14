/**
 * AO-Core Options Types
 */

import type { Binary } from './primitives.js';
import type { Wallet } from './wallet.js';
import type { StoreConfig } from './store.js';

/** Error handling strategies */
export type ErrorStrategy = 'throw' | 'return' | 'log';

/** Cache control directives */
export type CacheControl =
  | 'no-cache'
  | 'no-store'
  | 'only-if-cached'
  | string;

/** Resolution options passed through the system */
export interface ResolveOptions {
  // Cryptographic
  /** Current hashpath for computation tracking */
  hashpath?: Binary;
  /** Public key wallet for verification */
  wallet?: Wallet;
  /** Private key wallet for signing */
  privWallet?: Wallet;

  // Caching
  /** Cache control directive */
  cacheControl?: CacheControl;

  // Storage
  /** Storage backend configuration */
  store?: StoreConfig | StoreConfig[];

  // Execution
  /** How to handle errors */
  errorStrategy?: ErrorStrategy;
  /** Execution timeout in milliseconds */
  timeout?: number;
  /** Enable parallel execution */
  spawnWorker?: boolean;

  // Device resolution
  /** Override device for resolution */
  device?: unknown;
  /** Device stack for fallback */
  deviceStack?: string[];
  /** Maximum resolution depth */
  maxDepth?: number;

  // Additional context (extensible)
  [key: string]: unknown;
}

/** Default options */
export const DEFAULT_OPTIONS: Partial<ResolveOptions> = {
  errorStrategy: 'throw',
  timeout: 120000,
  spawnWorker: false
};

/** Merge options with defaults */
export function mergeOptions(
  opts: ResolveOptions,
  defaults: Partial<ResolveOptions> = DEFAULT_OPTIONS
): ResolveOptions {
  return { ...defaults, ...opts };
}
