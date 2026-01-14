/**
 * Composite Store Implementation
 * Combines multiple stores with read/write policies
 */

import type { Store, StoreConfig } from '../types/store.js';
import type { Binary, Base64URL } from '../types/primitives.js';
import type { Result } from '../types/result.js';
import { ok, err, isOk } from '../types/result.js';

/** Policy for composite store operations */
export type CompositePolicy = 'first' | 'all' | 'fallback';

/** Composite store configuration */
export interface CompositeStoreConfig extends StoreConfig {
  type: 'composite';
  /** Child stores in priority order */
  stores: Store[];
  /** Read policy: first (return first hit), fallback (try next on error) */
  readPolicy?: CompositePolicy;
  /** Write policy: first (write to first only), all (write to all) */
  writePolicy?: CompositePolicy;
  /** Whether to populate higher-priority stores on read */
  populateOnRead?: boolean;
}

/** Composite store implementation */
export class CompositeStore implements Store {
  private stores: Store[];
  private config: CompositeStoreConfig;

  constructor(config: CompositeStoreConfig) {
    this.stores = config.stores;
    this.config = {
      ...config,
      readPolicy: config.readPolicy ?? 'fallback',
      writePolicy: config.writePolicy ?? 'first',
      populateOnRead: config.populateOnRead ?? false,
    };
  }

  /** Read data by ID - uses read policy */
  async read(id: Base64URL): Promise<Result<Binary>> {
    const missedStores: Store[] = [];

    for (const store of this.stores) {
      const result = await store.read(id);

      if (isOk(result)) {
        // Populate higher-priority stores if enabled
        if (this.config.populateOnRead && missedStores.length > 0) {
          const data = result.value;
          for (const missedStore of missedStores) {
            await missedStore.write(data);
          }
        }
        return result;
      }

      if (this.config.readPolicy === 'first') {
        // Return first result even if error
        return result;
      }

      // Fallback policy - track missed stores and continue
      missedStores.push(store);
    }

    return err(404, `Not found in any store: ${id}`);
  }

  /** Write data - uses write policy */
  async write(data: Binary): Promise<Result<Base64URL>> {
    if (this.stores.length === 0) {
      return err(500, 'No stores configured');
    }

    if (this.config.writePolicy === 'first') {
      // Write to first store only
      return this.stores[0].write(data);
    }

    // Write to all stores
    let id: Base64URL | undefined;
    const errors: string[] = [];

    for (const store of this.stores) {
      const result = await store.write(data);
      if (isOk(result)) {
        if (!id) {
          id = result.value;
        }
      } else {
        errors.push(result.error.message);
      }
    }

    if (id) {
      return ok(id);
    }

    return err(500, `Write failed on all stores: ${errors.join(', ')}`);
  }

  /** Check if data exists - returns true if any store has it */
  async exists(id: Base64URL): Promise<boolean> {
    for (const store of this.stores) {
      if (await store.exists(id)) {
        return true;
      }
    }
    return false;
  }

  /** Delete from all stores */
  async delete(id: Base64URL): Promise<Result<void>> {
    let deleted = false;
    const errors: string[] = [];

    for (const store of this.stores) {
      if (!store.delete) continue;
      const result = await store.delete(id);
      if (isOk(result)) {
        deleted = true;
      } else if (result.error.status !== 404) {
        errors.push(result.error.message);
      }
    }

    if (deleted) {
      return ok(undefined);
    }

    if (errors.length > 0) {
      return err(500, `Delete errors: ${errors.join(', ')}`);
    }

    return err(404, `Not found: ${id}`);
  }

  /** List IDs from all stores (deduplicated) */
  async list(prefix?: string): Promise<Result<Base64URL[]>> {
    const allIds = new Set<Base64URL>();
    const errors: string[] = [];

    for (const store of this.stores) {
      if (!store.list) continue;
      const result = await store.list(prefix);
      if (isOk(result)) {
        for (const id of result.value) {
          allIds.add(id);
        }
      } else {
        errors.push(result.error.message);
      }
    }

    if (allIds.size > 0 || errors.length === 0) {
      return ok(Array.from(allIds));
    }

    return err(500, `List errors: ${errors.join(', ')}`);
  }

  /** Get underlying stores */
  getStores(): Store[] {
    return this.stores;
  }

  /** Add a store to the composite */
  addStore(store: Store, prepend = false): void {
    if (prepend) {
      this.stores.unshift(store);
    } else {
      this.stores.push(store);
    }
  }

  /** Remove a store from the composite */
  removeStore(store: Store): boolean {
    const index = this.stores.indexOf(store);
    if (index !== -1) {
      this.stores.splice(index, 1);
      return true;
    }
    return false;
  }
}

/** Create a composite store */
export function createCompositeStore(config: CompositeStoreConfig): CompositeStore {
  return new CompositeStore(config);
}

/** Create a simple cache + persistence store */
export function createCachedStore(cache: Store, persistence: Store): CompositeStore {
  return new CompositeStore({
    type: 'composite',
    stores: [cache, persistence],
    readPolicy: 'fallback',
    writePolicy: 'all',
    populateOnRead: true,
  });
}
