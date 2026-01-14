import { describe, it, expect } from 'vitest';
import {
  normalizeKey,
  keysEqual,
  isPrivateKey,
  extractTypeSuffix,
  getTypeSuffix,
  stripTypeSuffix,
  findTypedKey,
  coerceToType,
  publicKeys,
  getKey,
  setKey,
  getKeys,
  hasKey,
} from '../src/utils/keys.js';
import type { TABMMessage } from '../src/types/message.js';

describe('Key Utilities', () => {
  describe('normalizeKey', () => {
    it('should convert to lowercase', () => {
      expect(normalizeKey('MyKey')).toBe('mykey');
      expect(normalizeKey('ALLCAPS')).toBe('allcaps');
    });

    it('should replace hyphens with underscores', () => {
      expect(normalizeKey('my-key')).toBe('my_key');
      expect(normalizeKey('multi-word-key')).toBe('multi_word_key');
    });

    it('should remove type suffixes', () => {
      expect(normalizeKey('count+integer')).toBe('count');
      expect(normalizeKey('value+float')).toBe('value');
      expect(normalizeKey('data+binary')).toBe('data');
      expect(normalizeKey('items+list')).toBe('items');
      expect(normalizeKey('config+map')).toBe('config');
    });

    it('should handle combined transformations', () => {
      expect(normalizeKey('My-Count+integer')).toBe('my_count');
    });
  });

  describe('keysEqual', () => {
    it('should match identical keys', () => {
      expect(keysEqual('key', 'key')).toBe(true);
    });

    it('should match case-insensitive', () => {
      expect(keysEqual('Key', 'key')).toBe(true);
      expect(keysEqual('KEY', 'key')).toBe(true);
    });

    it('should match hyphen and underscore variants', () => {
      expect(keysEqual('my-key', 'my_key')).toBe(true);
    });

    it('should match with different type suffixes', () => {
      expect(keysEqual('count+integer', 'count+float')).toBe(true);
      expect(keysEqual('count', 'count+integer')).toBe(true);
    });

    it('should not match different keys', () => {
      expect(keysEqual('key1', 'key2')).toBe(false);
    });
  });

  describe('isPrivateKey', () => {
    it('should detect priv/ prefix', () => {
      expect(isPrivateKey('priv/secret')).toBe(true);
      expect(isPrivateKey('Priv/Secret')).toBe(true);
      expect(isPrivateKey('PRIV/SECRET')).toBe(true);
    });

    it('should detect priv_ prefix', () => {
      expect(isPrivateKey('priv_secret')).toBe(true);
      expect(isPrivateKey('Priv_Secret')).toBe(true);
    });

    it('should not match non-private keys', () => {
      expect(isPrivateKey('public')).toBe(false);
      expect(isPrivateKey('privacy')).toBe(false);
      expect(isPrivateKey('private')).toBe(false);
    });
  });

  describe('extractTypeSuffix / getTypeSuffix', () => {
    it('should extract +integer suffix', () => {
      expect(extractTypeSuffix('count+integer')).toBe('+integer');
      expect(getTypeSuffix('count+integer')).toBe('+integer');
    });

    it('should extract +float suffix', () => {
      expect(extractTypeSuffix('value+float')).toBe('+float');
    });

    it('should extract +binary suffix', () => {
      expect(extractTypeSuffix('data+binary')).toBe('+binary');
    });

    it('should extract +list suffix', () => {
      expect(extractTypeSuffix('items+list')).toBe('+list');
    });

    it('should extract +map suffix', () => {
      expect(extractTypeSuffix('config+map')).toBe('+map');
    });

    it('should return null for no suffix', () => {
      expect(extractTypeSuffix('plain-key')).toBe(null);
      expect(extractTypeSuffix('noSuffix')).toBe(null);
    });
  });

  describe('stripTypeSuffix', () => {
    it('should remove type suffix', () => {
      expect(stripTypeSuffix('count+integer')).toBe('count');
      expect(stripTypeSuffix('value+float')).toBe('value');
      expect(stripTypeSuffix('data+binary')).toBe('data');
    });

    it('should return original if no suffix', () => {
      expect(stripTypeSuffix('plain-key')).toBe('plain-key');
    });
  });

  describe('findTypedKey', () => {
    const msg: TABMMessage = {
      'count+integer': 42,
      'name': 'test',
      'data+binary': new Uint8Array([1, 2, 3]),
    };

    it('should find exact key', () => {
      expect(findTypedKey(msg, 'name')).toBe('name');
      expect(findTypedKey(msg, 'count+integer')).toBe('count+integer');
    });

    it('should find key with type suffix', () => {
      expect(findTypedKey(msg, 'count')).toBe('count+integer');
      expect(findTypedKey(msg, 'data')).toBe('data+binary');
    });

    it('should return null for non-existent key', () => {
      expect(findTypedKey(msg, 'missing')).toBe(null);
    });
  });

  describe('coerceToType', () => {
    it('should coerce to integer', () => {
      expect(coerceToType('count+integer', '42')).toBe(42);
      expect(coerceToType('count+integer', 42.7)).toBe(42);
    });

    it('should coerce to float', () => {
      expect(coerceToType('value+float', '3.14')).toBe(3.14);
      expect(coerceToType('value+float', 42)).toBe(42);
    });

    it('should coerce to binary', () => {
      const result = coerceToType('data+binary', 'hello');
      expect(result).toBeInstanceOf(Uint8Array);
    });

    it('should coerce to list', () => {
      expect(coerceToType('items+list', [1, 2, 3])).toEqual([1, 2, 3]);
      expect(coerceToType('items+list', 'single')).toEqual(['single']);
    });

    it('should coerce to map', () => {
      const obj = { a: 1 };
      expect(coerceToType('config+map', obj)).toEqual(obj);
      expect(coerceToType('config+map', 'invalid')).toEqual({});
    });

    it('should return value unchanged for no suffix', () => {
      expect(coerceToType('plain', 'value')).toBe('value');
      expect(coerceToType('plain', 42)).toBe(42);
    });
  });

  describe('publicKeys', () => {
    it('should filter out private keys', () => {
      const msg: TABMMessage = {
        'public': 'visible',
        'priv/secret': 'hidden',
        'priv_internal': 'also hidden',
        'another-public': 'visible too',
      };
      const result = publicKeys(msg);
      expect(result).toEqual({
        'public': 'visible',
        'another-public': 'visible too',
      });
    });

    it('should handle empty message', () => {
      expect(publicKeys({})).toEqual({});
    });

    it('should handle message with only public keys', () => {
      const msg: TABMMessage = { a: 1, b: 2 };
      expect(publicKeys(msg)).toEqual(msg);
    });
  });

  describe('getKey', () => {
    const msg: TABMMessage = {
      'count+integer': 42,
      'Name': 'test',
    };

    it('should get exact key', () => {
      expect(getKey(msg, 'count+integer')).toBe(42);
    });

    it('should get normalized key', () => {
      expect(getKey(msg, 'name')).toBe('test');
      expect(getKey(msg, 'NAME')).toBe('test');
    });

    it('should return undefined for missing key', () => {
      expect(getKey(msg, 'missing')).toBeUndefined();
    });
  });

  describe('setKey', () => {
    it('should set key in new message', () => {
      const msg: TABMMessage = { a: 1 };
      const result = setKey(msg, 'b', 2);
      expect(result).toEqual({ a: 1, b: 2 });
      expect(msg).toEqual({ a: 1 }); // original unchanged
    });

    it('should overwrite existing key', () => {
      const msg: TABMMessage = { a: 1 };
      const result = setKey(msg, 'a', 99);
      expect(result).toEqual({ a: 99 });
    });
  });

  describe('getKeys', () => {
    it('should return all keys', () => {
      const msg: TABMMessage = { a: 1, b: 2, c: 3 };
      expect(getKeys(msg).sort()).toEqual(['a', 'b', 'c']);
    });

    it('should return empty array for empty message', () => {
      expect(getKeys({})).toEqual([]);
    });
  });

  describe('hasKey', () => {
    const msg: TABMMessage = {
      'count+integer': 42,
      'name': 'test',
    };

    it('should return true for existing key', () => {
      expect(hasKey(msg, 'name')).toBe(true);
      expect(hasKey(msg, 'count+integer')).toBe(true);
    });

    it('should return true for key with different suffix', () => {
      expect(hasKey(msg, 'count')).toBe(true);
    });

    it('should return false for missing key', () => {
      expect(hasKey(msg, 'missing')).toBe(false);
    });
  });
});
