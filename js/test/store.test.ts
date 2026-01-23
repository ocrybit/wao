import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore, createMemoryStore } from '../src/store/memory.js';
import { FSStore, createFSStore } from '../src/store/fs.js';
import { CompositeStore, createCompositeStore, createCachedStore } from '../src/store/composite.js';
import { isOk } from '../src/types/result.js';
import { toBinary, toBase64URL } from '../src/utils/encoding.js';
import { sha256 } from '../src/crypto/hash.js';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('Store System', () => {
  describe('MemoryStore', () => {
    let store: MemoryStore;

    beforeEach(() => {
      store = createMemoryStore();
    });

    describe('write / read', () => {
      it('should write and read data', async () => {
        const data = toBinary('test data');
        const writeResult = await store.write(data);

        expect(isOk(writeResult)).toBe(true);
        if (!isOk(writeResult)) return;

        const id = writeResult.value;
        const readResult = await store.read(id);

        expect(isOk(readResult)).toBe(true);
        if (isOk(readResult)) {
          expect(readResult.value).toEqual(data);
        }
      });

      it('should return error for non-existent id', async () => {
        const result = await store.read('nonexistent');
        expect(isOk(result)).toBe(false);
        if (!isOk(result)) {
          expect(result.error.status).toBe(404);
        }
      });
    });

    describe('exists', () => {
      it('should return true for existing data', async () => {
        const data = toBinary('test');
        const writeResult = await store.write(data);
        if (!isOk(writeResult)) return;

        const exists = await store.exists(writeResult.value);
        expect(exists).toBe(true);
      });

      it('should return false for non-existing data', async () => {
        const exists = await store.exists('nonexistent');
        expect(exists).toBe(false);
      });
    });

    describe('delete', () => {
      it('should delete existing data', async () => {
        const data = toBinary('test');
        const writeResult = await store.write(data);
        if (!isOk(writeResult)) return;

        const id = writeResult.value;
        const deleteResult = await store.delete(id);
        expect(isOk(deleteResult)).toBe(true);

        const exists = await store.exists(id);
        expect(exists).toBe(false);
      });

      it('should return error for non-existent id', async () => {
        const result = await store.delete('nonexistent');
        expect(isOk(result)).toBe(false);
      });
    });

    describe('list', () => {
      it('should list all ids', async () => {
        await store.write(toBinary('data1'));
        await store.write(toBinary('data2'));
        await store.write(toBinary('data3'));

        const result = await store.list();
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value.length).toBe(3);
        }
      });

      it('should return empty list for empty store', async () => {
        const result = await store.list();
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value.length).toBe(0);
        }
      });
    });

    describe('stats', () => {
      it('should track entries and size', async () => {
        const data1 = toBinary('hello');
        const data2 = toBinary('world');

        await store.write(data1);
        await store.write(data2);

        const stats = store.stats();
        expect(stats.entries).toBe(2);
        expect(stats.totalSize).toBe(data1.length + data2.length);
      });
    });

    describe('clear', () => {
      it('should remove all data', async () => {
        await store.write(toBinary('data1'));
        await store.write(toBinary('data2'));

        store.clear();

        const stats = store.stats();
        expect(stats.entries).toBe(0);
        expect(stats.totalSize).toBe(0);
      });
    });

    describe('limits', () => {
      it('should enforce maxEntries', async () => {
        const limitedStore = createMemoryStore({ maxEntries: 2 });

        await limitedStore.write(toBinary('first'));
        await limitedStore.write(toBinary('second'));
        await limitedStore.write(toBinary('third'));

        const stats = limitedStore.stats();
        expect(stats.entries).toBe(2);
      });

      it('should enforce maxSize', async () => {
        const limitedStore = createMemoryStore({ maxSize: 10 });

        await limitedStore.write(toBinary('12345')); // 5 bytes
        await limitedStore.write(toBinary('67890')); // 5 bytes
        await limitedStore.write(toBinary('ABCDE')); // 5 bytes - should evict

        const stats = limitedStore.stats();
        expect(stats.totalSize).toBeLessThanOrEqual(10);
      });
    });

    describe('prefix', () => {
      it('should use prefix for keys', async () => {
        const prefixedStore = createMemoryStore({ prefix: 'test' });

        const writeResult = await prefixedStore.write(toBinary('data'));
        if (!isOk(writeResult)) return;

        const readResult = await prefixedStore.read(writeResult.value);
        expect(isOk(readResult)).toBe(true);
      });
    });
  });

  describe('FSStore', () => {
    let store: FSStore;
    let testDir: string;

    beforeEach(() => {
      testDir = join(tmpdir(), `hyperbeam-test-${Date.now()}`);
      mkdirSync(testDir, { recursive: true });
      store = createFSStore({ type: 'fs', directory: testDir });
    });

    afterEach(() => {
      if (existsSync(testDir)) {
        rmSync(testDir, { recursive: true });
      }
    });

    describe('write / read', () => {
      it('should write and read data', async () => {
        const data = toBinary('test data for filesystem');
        const writeResult = await store.write(data);

        expect(isOk(writeResult)).toBe(true);
        if (!isOk(writeResult)) return;

        const id = writeResult.value;
        const readResult = await store.read(id);

        expect(isOk(readResult)).toBe(true);
        if (isOk(readResult)) {
          expect(readResult.value).toEqual(data);
        }
      });

      it('should return error for non-existent id', async () => {
        const result = await store.read('nonexistent-id');
        expect(isOk(result)).toBe(false);
      });
    });

    describe('exists', () => {
      it('should return true for existing file', async () => {
        const data = toBinary('test');
        const writeResult = await store.write(data);
        if (!isOk(writeResult)) return;

        const exists = await store.exists(writeResult.value);
        expect(exists).toBe(true);
      });

      it('should return false for non-existing file', async () => {
        const exists = await store.exists('nonexistent');
        expect(exists).toBe(false);
      });
    });

    describe('delete', () => {
      it('should delete existing file', async () => {
        const data = toBinary('test');
        const writeResult = await store.write(data);
        if (!isOk(writeResult)) return;

        const id = writeResult.value;
        const deleteResult = await store.delete(id);
        expect(isOk(deleteResult)).toBe(true);

        const exists = await store.exists(id);
        expect(exists).toBe(false);
      });
    });

    describe('list', () => {
      it('should list all files', async () => {
        await store.write(toBinary('file1'));
        await store.write(toBinary('file2'));

        const result = await store.list();
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value.length).toBe(2);
        }
      });
    });

    describe('content-addressable', () => {
      it('should use content hash as id', async () => {
        const data = toBinary('content for hashing');
        const expectedHash = toBase64URL(await sha256(data));

        const writeResult = await store.write(data);
        expect(isOk(writeResult)).toBe(true);
        if (isOk(writeResult)) {
          expect(writeResult.value).toBe(expectedHash);
        }
      });
    });

    describe('writeWithId', () => {
      it('should write with specific id', async () => {
        const data = toBinary('data');
        const customId = 'my-custom-id';

        const writeResult = await store.writeWithId(customId, data);
        expect(isOk(writeResult)).toBe(true);

        const readResult = await store.read(customId);
        expect(isOk(readResult)).toBe(true);
        if (isOk(readResult)) {
          expect(readResult.value).toEqual(data);
        }
      });
    });
  });

  describe('CompositeStore', () => {
    let cache: MemoryStore;
    let persistent: MemoryStore;
    let composite: CompositeStore;

    beforeEach(() => {
      cache = createMemoryStore();
      persistent = createMemoryStore();
      composite = createCompositeStore({
        type: 'composite',
        stores: [cache, persistent],
        readPolicy: 'fallback',
        writePolicy: 'all',
        populateOnRead: true,
      });
    });

    describe('read with fallback', () => {
      it('should read from first store if available', async () => {
        const data = toBinary('cached data');
        await cache.write(data);

        const id = (await cache.list())!;
        if (!isOk(id)) return;

        const result = await composite.read(id.value[0]);
        expect(isOk(result)).toBe(true);
      });

      it('should fallback to second store', async () => {
        const data = toBinary('persistent data');
        const writeResult = await persistent.write(data);
        if (!isOk(writeResult)) return;

        const result = await composite.read(writeResult.value);
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toEqual(data);
        }
      });

      it('should populate cache on read', async () => {
        const data = toBinary('to be cached');
        const writeResult = await persistent.write(data);
        if (!isOk(writeResult)) return;

        // Read from composite (should populate cache)
        await composite.read(writeResult.value);

        // Verify cache now has the data
        const cacheResult = await cache.read(writeResult.value);
        expect(isOk(cacheResult)).toBe(true);
      });
    });

    describe('write to all', () => {
      it('should write to all stores', async () => {
        const data = toBinary('write to all');
        const writeResult = await composite.write(data);

        expect(isOk(writeResult)).toBe(true);
        if (!isOk(writeResult)) return;

        const id = writeResult.value;

        // Both stores should have the data
        expect(await cache.exists(id)).toBe(true);
        expect(await persistent.exists(id)).toBe(true);
      });
    });

    describe('exists', () => {
      it('should return true if any store has data', async () => {
        const data = toBinary('test');
        const writeResult = await cache.write(data);
        if (!isOk(writeResult)) return;

        const exists = await composite.exists(writeResult.value);
        expect(exists).toBe(true);
      });

      it('should return false if no store has data', async () => {
        const exists = await composite.exists('nonexistent');
        expect(exists).toBe(false);
      });
    });

    describe('delete', () => {
      it('should delete from all stores', async () => {
        const data = toBinary('to delete');
        const writeResult = await composite.write(data);
        if (!isOk(writeResult)) return;

        const id = writeResult.value;
        await composite.delete(id);

        expect(await cache.exists(id)).toBe(false);
        expect(await persistent.exists(id)).toBe(false);
      });
    });

    describe('list', () => {
      it('should list from all stores (deduplicated)', async () => {
        await cache.write(toBinary('cache1'));
        await cache.write(toBinary('cache2'));
        await persistent.write(toBinary('persist1'));

        const result = await composite.list();
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value.length).toBe(3);
        }
      });
    });

    describe('getStores / addStore / removeStore', () => {
      it('should manage store list', () => {
        expect(composite.getStores().length).toBe(2);

        const newStore = createMemoryStore();
        composite.addStore(newStore);
        expect(composite.getStores().length).toBe(3);

        composite.removeStore(newStore);
        expect(composite.getStores().length).toBe(2);
      });

      it('should prepend store', () => {
        const newStore = createMemoryStore();
        composite.addStore(newStore, true);
        expect(composite.getStores()[0]).toBe(newStore);
      });
    });
  });

  describe('createCachedStore', () => {
    it('should create composite with cache + persistence', async () => {
      const cache = createMemoryStore();
      const persistence = createMemoryStore();
      const cachedStore = createCachedStore(cache, persistence);

      const data = toBinary('cached store test');
      const writeResult = await cachedStore.write(data);
      expect(isOk(writeResult)).toBe(true);
    });
  });
});
