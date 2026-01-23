import { describe, it, expect } from 'vitest';
import {
  messageToTags,
  tagsToMessage,
  encodeTags,
  computeId,
  computeMessageId,
  computeUnsignedId,
  isBundle,
  getBundleItems,
  cloneMessage,
  deepCloneMessage,
} from '../src/utils/message.js';
import type { TABMMessage, Tag } from '../src/types/message.js';
import { toBinary, fromBinary } from '../src/utils/encoding.js';

describe('Message Utilities', () => {
  describe('messageToTags', () => {
    it('should convert simple message to tags', () => {
      const msg: TABMMessage = {
        'action': 'transfer',
        'amount': 100,
      };
      const tags = messageToTags(msg);
      expect(tags.length).toBeGreaterThan(0);

      const actionTag = tags.find(t => fromBinary(t.name) === 'action');
      expect(actionTag).toBeDefined();
      expect(fromBinary(actionTag!.value)).toBe('transfer');
    });

    it('should exclude special keys', () => {
      const msg: TABMMessage = {
        'signature': new Uint8Array([1, 2, 3]),
        'owner': new Uint8Array([4, 5, 6]),
        'body': new Uint8Array([7, 8, 9]),
        'regular': 'included',
      };
      const tags = messageToTags(msg);
      const names = tags.map(t => fromBinary(t.name));

      expect(names).not.toContain('signature');
      expect(names).not.toContain('owner');
      expect(names).not.toContain('body');
      expect(names).toContain('regular');
    });

    it('should exclude private keys', () => {
      const msg: TABMMessage = {
        'public': 'visible',
        'priv/secret': 'hidden',
      };
      const tags = messageToTags(msg);
      const names = tags.map(t => fromBinary(t.name));

      expect(names).toContain('public');
      expect(names).not.toContain('priv/secret');
    });

    it('should skip null and undefined values', () => {
      const msg: TABMMessage = {
        'defined': 'value',
        'nullValue': null,
        'undefinedValue': undefined,
      };
      const tags = messageToTags(msg);
      const names = tags.map(t => fromBinary(t.name));

      expect(names).toContain('defined');
      expect(names).not.toContain('nullValue');
      expect(names).not.toContain('undefinedValue');
    });

    it('should handle boolean values', () => {
      const msg: TABMMessage = {
        'active': true,
        'disabled': false,
      };
      const tags = messageToTags(msg);

      const activeTag = tags.find(t => fromBinary(t.name) === 'active');
      const disabledTag = tags.find(t => fromBinary(t.name) === 'disabled');

      expect(fromBinary(activeTag!.value)).toBe('true');
      expect(fromBinary(disabledTag!.value)).toBe('false');
    });
  });

  describe('tagsToMessage', () => {
    it('should convert tags back to message', () => {
      const tags: Tag[] = [
        { name: toBinary('action'), value: toBinary('transfer') },
        { name: toBinary('amount'), value: toBinary('100') },
      ];
      const msg = tagsToMessage(tags);

      expect(msg['action']).toBe('transfer');
      expect(msg['amount']).toBe('100');
    });

    it('should handle empty tags', () => {
      const msg = tagsToMessage([]);
      expect(msg).toEqual({});
    });

    it('should parse JSON arrays', () => {
      const tags: Tag[] = [
        { name: toBinary('items'), value: toBinary('[1,2,3]') },
      ];
      const msg = tagsToMessage(tags);
      expect(msg['items']).toEqual([1, 2, 3]);
    });

    it('should parse JSON objects', () => {
      const tags: Tag[] = [
        { name: toBinary('config'), value: toBinary('{"a":1}') },
      ];
      const msg = tagsToMessage(tags);
      expect(msg['config']).toEqual({ a: 1 });
    });
  });

  describe('encodeTags', () => {
    it('should encode tags to binary format', () => {
      const tags: Tag[] = [
        { name: toBinary('key'), value: toBinary('value') },
      ];
      const encoded = encodeTags(tags);
      expect(encoded).toBeInstanceOf(Uint8Array);
      expect(encoded.length).toBeGreaterThan(0);
    });

    it('should handle empty tags', () => {
      const encoded = encodeTags([]);
      expect(encoded.length).toBe(0);
    });

    it('should handle multiple tags', () => {
      const tags: Tag[] = [
        { name: toBinary('a'), value: toBinary('1') },
        { name: toBinary('b'), value: toBinary('2') },
        { name: toBinary('c'), value: toBinary('3') },
      ];
      const encoded = encodeTags(tags);
      expect(encoded).toBeInstanceOf(Uint8Array);
    });
  });

  describe('computeId / computeMessageId / computeUnsignedId', () => {
    it('should compute message ID', async () => {
      const msg: TABMMessage = {
        'action': 'test',
        'body': new Uint8Array([1, 2, 3]),
      };

      const id = await computeId(msg, true);
      expect(typeof id).toBe('string');
      expect(id.length).toBeGreaterThan(0);
    });

    it('should compute unsigned ID', async () => {
      const msg: TABMMessage = {
        'action': 'test',
        'body': new Uint8Array([1, 2, 3]),
      };

      const unsignedId = await computeId(msg, false);
      expect(typeof unsignedId).toBe('string');
    });

    it('should compute different IDs with/without signature', async () => {
      const msg: TABMMessage = {
        'action': 'test',
        'signature': new Uint8Array([9, 8, 7]),
      };

      const signedId = await computeId(msg, true);
      const unsignedId = await computeId(msg, false);

      expect(signedId).not.toBe(unsignedId);
    });

    it('computeMessageId should include signature', async () => {
      const msg: TABMMessage = { 'test': 'data' };
      const id = await computeMessageId(msg);
      expect(typeof id).toBe('string');
    });

    it('computeUnsignedId should exclude signature', async () => {
      const msg: TABMMessage = { 'test': 'data' };
      const id = await computeUnsignedId(msg);
      expect(typeof id).toBe('string');
    });

    it('should produce consistent IDs', async () => {
      const msg: TABMMessage = {
        'action': 'test',
        'body': new Uint8Array([1, 2, 3]),
      };

      const id1 = await computeMessageId(msg);
      const id2 = await computeMessageId(msg);

      expect(id1).toBe(id2);
    });
  });

  describe('isBundle', () => {
    it('should detect bundle message', () => {
      const bundle: TABMMessage = {
        'body': {
          '1': { action: 'first' },
          '2': { action: 'second' },
        },
      };
      expect(isBundle(bundle)).toBe(true);
    });

    it('should not detect non-bundle', () => {
      const msg: TABMMessage = {
        'body': new Uint8Array([1, 2, 3]),
      };
      expect(isBundle(msg)).toBe(false);
    });

    it('should not detect message without body', () => {
      const msg: TABMMessage = {
        'action': 'test',
      };
      expect(isBundle(msg)).toBe(false);
    });

    it('should not detect empty body object', () => {
      const msg: TABMMessage = {
        'body': {},
      };
      expect(isBundle(msg)).toBe(false);
    });
  });

  describe('getBundleItems', () => {
    it('should extract bundle items', () => {
      const bundle: TABMMessage = {
        'body': {
          '1': { action: 'first' },
          '2': { action: 'second' },
          '3': { action: 'third' },
        },
      };
      const items = getBundleItems(bundle);

      expect(items.length).toBe(3);
      expect(items[0]).toEqual({ action: 'first' });
      expect(items[1]).toEqual({ action: 'second' });
      expect(items[2]).toEqual({ action: 'third' });
    });

    it('should return empty array for non-bundle', () => {
      const msg: TABMMessage = {
        'body': new Uint8Array([1, 2, 3]),
      };
      expect(getBundleItems(msg)).toEqual([]);
    });

    it('should return empty array for missing body', () => {
      const msg: TABMMessage = { 'action': 'test' };
      expect(getBundleItems(msg)).toEqual([]);
    });

    it('should handle sparse indices', () => {
      const bundle: TABMMessage = {
        'body': {
          '1': { action: 'first' },
          // '2' missing
          '3': { action: 'third' }, // won't be included
        },
      };
      const items = getBundleItems(bundle);
      expect(items.length).toBe(1);
    });
  });

  describe('cloneMessage', () => {
    it('should create shallow copy', () => {
      const original: TABMMessage = {
        'a': 1,
        'b': 'string',
        'nested': { x: 1 },
      };
      const clone = cloneMessage(original);

      expect(clone).toEqual(original);
      expect(clone).not.toBe(original);

      // Nested object should be same reference (shallow)
      expect(clone['nested']).toBe(original['nested']);
    });

    it('should not affect original when modifying clone', () => {
      const original: TABMMessage = { 'a': 1 };
      const clone = cloneMessage(original);
      clone['a'] = 99;

      expect(original['a']).toBe(1);
    });
  });

  describe('deepCloneMessage', () => {
    it('should create deep copy', () => {
      const original: TABMMessage = {
        'a': 1,
        'nested': { x: 1, y: 2 },
        'array': [1, 2, 3],
      };
      const clone = deepCloneMessage(original);

      expect(clone).toEqual(original);
      expect(clone).not.toBe(original);
      expect(clone['nested']).not.toBe(original['nested']);
      expect(clone['array']).not.toBe(original['array']);
    });

    it('should preserve binary data', () => {
      const original: TABMMessage = {
        'data': new Uint8Array([1, 2, 3, 4, 5]),
      };
      const clone = deepCloneMessage(original);

      expect(clone['data']).toBeInstanceOf(Uint8Array);
      expect(clone['data']).toEqual(original['data']);
      expect(clone['data']).not.toBe(original['data']);
    });

    it('should handle complex nested structures', () => {
      const original: TABMMessage = {
        'level1': {
          'level2': {
            'level3': {
              'value': 42,
              'binary': new Uint8Array([1, 2]),
            },
          },
        },
      };
      const clone = deepCloneMessage(original);

      const cloneLevel3 = (clone['level1'] as TABMMessage)['level2'] as TABMMessage;
      const origLevel3 = (original['level1'] as TABMMessage)['level2'] as TABMMessage;

      expect(cloneLevel3).not.toBe(origLevel3);
      expect((cloneLevel3['level3'] as TABMMessage)['value']).toBe(42);
    });
  });
});
