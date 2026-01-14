/**
 * In-Memory Store Implementation
 * Fast ephemeral storage for testing and caching
 */

import type { Store, StoreConfig } from '../types/store.js';
import type { Binary, Base64URL } from '../types/primitives.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { toBase64URL } from '../utils/encoding.js';

/** Memory store configuration */
export interface MemoryStoreConfig extends StoreConfig {
  type: 'memory';
  /** Maximum number of entries (optional) */
  maxEntries?: number;
  /** Maximum total size in bytes (optional) */
  maxSize?: number;
}

/** In-memory store implementation */
export class MemoryStore implements Store {
  private data: Map<string, Uint8Array> = new Map();
  private config: MemoryStoreConfig;
  private totalSize: number = 0;

  constructor(config: Partial<MemoryStoreConfig> = {}) {
    this.config = {
      type: 'memory',
      prefix: config.prefix ?? '',
      maxEntries: config.maxEntries,
      maxSize: config.maxSize,
    };
  }

  /** Get prefixed key */
  private getKey(id: Base64URL): string {
    return this.config.prefix ? `${this.config.prefix}:${id}` : id;
  }

  /** Read data by ID */
  async read(id: Base64URL): Promise<Result<Binary>> {
    const key = this.getKey(id);
    const data = this.data.get(key);

    if (!data) {
      return err(404, `Not found: ${id}`);
    }

    return ok(data);
  }

  /** Write data and return ID */
  async write(data: Binary): Promise<Result<Base64URL>> {
    const id = toBase64URL(data.slice(0, 32)); // Simple ID from first 32 bytes

    // Check limits
    if (this.config.maxEntries && this.data.size >= this.config.maxEntries) {
      // Evict oldest entry (FIFO)
      const firstKey = this.data.keys().next().value;
      if (firstKey) {
        const oldData = this.data.get(firstKey);
        if (oldData) {
          this.totalSize -= oldData.length;
        }
        this.data.delete(firstKey);
      }
    }

    if (this.config.maxSize && this.totalSize + data.length > this.config.maxSize) {
      // Evict until there's room
      while (this.totalSize + data.length > this.config.maxSize && this.data.size > 0) {
        const firstKey = this.data.keys().next().value;
        if (firstKey) {
          const oldData = this.data.get(firstKey);
          if (oldData) {
            this.totalSize -= oldData.length;
          }
          this.data.delete(firstKey);
        }
      }
    }

    const key = this.getKey(id);
    this.data.set(key, data);
    this.totalSize += data.length;

    return ok(id);
  }

  /** Check if data exists */
  async exists(id: Base64URL): Promise<boolean> {
    const key = this.getKey(id);
    return this.data.has(key);
  }

  /** Delete data by ID */
  async delete(id: Base64URL): Promise<Result<void>> {
    const key = this.getKey(id);
    const data = this.data.get(key);

    if (!data) {
      return err(404, `Not found: ${id}`);
    }

    this.totalSize -= data.length;
    this.data.delete(key);
    return ok(undefined);
  }

  /** List all IDs with optional prefix filter */
  async list(prefix?: string): Promise<Result<Base64URL[]>> {
    const fullPrefix = prefix
      ? (this.config.prefix ? `${this.config.prefix}:${prefix}` : prefix)
      : this.config.prefix;

    const ids: Base64URL[] = [];
    for (const key of this.data.keys()) {
      if (!fullPrefix || key.startsWith(fullPrefix)) {
        // Remove store prefix to get original ID
        const id = this.config.prefix
          ? key.slice(this.config.prefix.length + 1)
          : key;
        ids.push(id);
      }
    }

    return ok(ids);
  }

  /** Get store statistics */
  stats(): { entries: number; totalSize: number } {
    return {
      entries: this.data.size,
      totalSize: this.totalSize,
    };
  }

  /** Clear all data */
  clear(): void {
    this.data.clear();
    this.totalSize = 0;
  }
}

/** Create a memory store */
export function createMemoryStore(config?: Partial<MemoryStoreConfig>): MemoryStore {
  return new MemoryStore(config);
}
