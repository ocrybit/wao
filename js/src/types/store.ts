/**
 * AO-Core Store Types
 */

import type { Binary, Base64URL } from './primitives.js';
import type { Result } from './result.js';

/** Base store configuration */
export interface StoreConfig {
  type: string;
  /** Optional prefix for all keys */
  prefix?: string;
}

/** Store interface - content-addressable storage */
export interface Store {
  /** Read data by ID */
  read(id: Base64URL): Promise<Result<Binary>>;

  /** Write data and return content ID */
  write(data: Binary): Promise<Result<Base64URL>>;

  /** Check if data exists */
  exists(id: Base64URL): Promise<boolean>;

  /** Delete data by ID (optional) */
  delete?(id: Base64URL): Promise<Result<void>>;

  /** List all IDs with optional prefix filter */
  list?(prefix?: string): Promise<Result<Base64URL[]>>;
}

/** Store factory function type */
export type StoreFactory = (config: StoreConfig) => Store;

/** Store registry for managing store implementations */
export class StoreRegistry {
  private stores: Map<string, StoreFactory> = new Map();

  /** Register a store factory */
  register(module: string, factory: StoreFactory): void {
    this.stores.set(module, factory);
  }

  /** Create a store from config */
  create(config: StoreConfig): Store | undefined {
    const factory = this.stores.get(config.type);
    if (factory) {
      return factory(config);
    }
    return undefined;
  }

  /** Check if store module is registered */
  has(module: string): boolean {
    return this.stores.has(module);
  }
}
