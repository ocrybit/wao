/**
 * Filesystem Store Implementation
 * Persistent storage using local filesystem
 */

import type { Store, StoreConfig } from '../types/store.js';
import type { Binary, Base64URL } from '../types/primitives.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import { sha256 } from '../crypto/hash.js';
import { toBase64URL } from '../utils/encoding.js';
import { existsSync, mkdirSync } from 'node:fs';
import { readFile, writeFile, unlink, readdir, stat, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';

/** Filesystem store configuration */
export interface FSStoreConfig extends StoreConfig {
  type: 'fs';
  /** Base directory for storage */
  directory: string;
  /** Use content-addressable storage (hash as filename) */
  contentAddressable?: boolean;
  /** Subdirectory depth for sharding (0-3) */
  shardDepth?: number;
}

/** Filesystem store implementation */
export class FSStore implements Store {
  private config: FSStoreConfig;

  constructor(config: FSStoreConfig) {
    this.config = {
      ...config,
      shardDepth: config.shardDepth ?? 2,
      contentAddressable: config.contentAddressable ?? true,
    };

    // Ensure directory exists
    if (!existsSync(this.config.directory)) {
      mkdirSync(this.config.directory, { recursive: true });
    }
  }

  /** Get file path for an ID */
  private getPath(id: Base64URL): string {
    const prefix = this.config.prefix ? `${this.config.prefix}_` : '';
    const filename = `${prefix}${this.sanitizeId(id)}`;

    if (this.config.shardDepth && this.config.shardDepth > 0) {
      // Create sharded path: ab/cd/abcdef...
      const shards: string[] = [];
      for (let i = 0; i < this.config.shardDepth && i * 2 < id.length; i++) {
        shards.push(id.slice(i * 2, i * 2 + 2));
      }
      return join(this.config.directory, ...shards, filename);
    }

    return join(this.config.directory, filename);
  }

  /** Sanitize ID for use as filename */
  private sanitizeId(id: Base64URL): string {
    // Base64URL is already safe for filenames
    return id.replace(/[/\\?%*:|"<>]/g, '_');
  }

  /** Ensure directory exists for a file path */
  private async ensureDir(filepath: string): Promise<void> {
    const dir = dirname(filepath);
    await mkdir(dir, { recursive: true });
  }

  /** Read data by ID */
  async read(id: Base64URL): Promise<Result<Binary>> {
    const filepath = this.getPath(id);

    try {
      const data = await readFile(filepath);
      return ok(new Uint8Array(data));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return err(404, `Not found: ${id}`);
      }
      return err(500, `Read error: ${(e as Error).message}`);
    }
  }

  /** Write data and return ID */
  async write(data: Binary): Promise<Result<Base64URL>> {
    let id: Base64URL;

    if (this.config.contentAddressable) {
      // Use content hash as ID
      const hash = await sha256(data);
      id = toBase64URL(hash);
    } else {
      // Generate random ID
      const randomBytes = crypto.getRandomValues(new Uint8Array(32));
      id = toBase64URL(randomBytes);
    }

    const filepath = this.getPath(id);

    try {
      await this.ensureDir(filepath);
      await writeFile(filepath, data);
      return ok(id);
    } catch (e) {
      return err(500, `Write error: ${(e as Error).message}`);
    }
  }

  /** Write data with specific ID */
  async writeWithId(id: Base64URL, data: Binary): Promise<Result<void>> {
    const filepath = this.getPath(id);

    try {
      await this.ensureDir(filepath);
      await writeFile(filepath, data);
      return ok(undefined);
    } catch (e) {
      return err(500, `Write error: ${(e as Error).message}`);
    }
  }

  /** Check if data exists */
  async exists(id: Base64URL): Promise<boolean> {
    const filepath = this.getPath(id);

    try {
      await stat(filepath);
      return true;
    } catch {
      return false;
    }
  }

  /** Delete data by ID */
  async delete(id: Base64URL): Promise<Result<void>> {
    const filepath = this.getPath(id);

    try {
      await unlink(filepath);
      return ok(undefined);
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') {
        return err(404, `Not found: ${id}`);
      }
      return err(500, `Delete error: ${(e as Error).message}`);
    }
  }

  /** List all IDs with optional prefix filter */
  async list(prefix?: string): Promise<Result<Base64URL[]>> {
    const ids: Base64URL[] = [];

    try {
      await this.listDir(this.config.directory, ids, prefix);
      return ok(ids);
    } catch (e) {
      return err(500, `List error: ${(e as Error).message}`);
    }
  }

  /** Recursively list directory */
  private async listDir(
    dir: string,
    ids: Base64URL[],
    filterPrefix?: string
  ): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // Directory doesn't exist
    }

    for (const entry of entries) {
      const fullPath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await this.listDir(fullPath, ids, filterPrefix);
      } else if (entry.isFile()) {
        // Remove store prefix if present
        let id = entry.name;
        if (this.config.prefix) {
          const prefixStr = `${this.config.prefix}_`;
          if (id.startsWith(prefixStr)) {
            id = id.slice(prefixStr.length);
          }
        }

        // Apply filter
        if (!filterPrefix || id.startsWith(filterPrefix)) {
          ids.push(id);
        }
      }
    }
  }
}

/** Create a filesystem store */
export function createFSStore(config: FSStoreConfig): FSStore {
  return new FSStore(config);
}
