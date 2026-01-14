import { describe, it, expect } from 'vitest';
import {
  toBinary,
  fromBinary,
  base64UrlEncode,
  base64UrlDecode,
  toBase64URL,
  fromBase64URL,
  base64Encode,
  base64Decode,
  concat,
  arraysEqual,
  toBigEndian64,
  fromBigEndian64,
  encodeVarint,
  decodeVarint,
  hexEncode,
  hexDecode,
  encodeOptional,
  decodeOptional,
} from '../src/utils/encoding.js';

describe('Encoding Utilities', () => {
  describe('toBinary / fromBinary', () => {
    it('should convert string to binary and back', () => {
      const original = 'Hello, World!';
      const binary = toBinary(original);
      expect(binary).toBeInstanceOf(Uint8Array);
      expect(fromBinary(binary)).toBe(original);
    });

    it('should handle empty string', () => {
      const binary = toBinary('');
      expect(binary.length).toBe(0);
      expect(fromBinary(binary)).toBe('');
    });

    it('should handle unicode characters', () => {
      const original = '你好世界 🌍';
      const binary = toBinary(original);
      expect(fromBinary(binary)).toBe(original);
    });

    it('should handle special characters', () => {
      const original = '!@#$%^&*()_+-=[]{}|;:\'",.<>?/\\`~';
      const binary = toBinary(original);
      expect(fromBinary(binary)).toBe(original);
    });
  });

  describe('base64UrlEncode / base64UrlDecode', () => {
    it('should encode and decode binary data', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
      const encoded = base64UrlEncode(original);
      expect(encoded).not.toContain('+');
      expect(encoded).not.toContain('/');
      expect(encoded).not.toContain('=');
      const decoded = base64UrlDecode(encoded);
      expect(arraysEqual(decoded, original)).toBe(true);
    });

    it('should handle empty array', () => {
      const original = new Uint8Array([]);
      const encoded = base64UrlEncode(original);
      expect(encoded).toBe('');
      const decoded = base64UrlDecode(encoded);
      expect(decoded.length).toBe(0);
    });

    it('should produce URL-safe output', () => {
      // Data that would produce + and / in standard base64
      const data = new Uint8Array([251, 255, 254, 253]);
      const encoded = base64UrlEncode(data);
      expect(encoded).toMatch(/^[A-Za-z0-9_-]*$/);
    });

    it('toBase64URL should be alias for base64UrlEncode', () => {
      const data = new Uint8Array([1, 2, 3]);
      expect(toBase64URL(data)).toBe(base64UrlEncode(data));
    });

    it('fromBase64URL should be alias for base64UrlDecode', () => {
      const encoded = 'AQID';
      expect(arraysEqual(fromBase64URL(encoded), base64UrlDecode(encoded))).toBe(true);
    });
  });

  describe('base64Encode / base64Decode', () => {
    it('should encode and decode with standard base64', () => {
      const original = new Uint8Array([1, 2, 3, 4, 5]);
      const encoded = base64Encode(original);
      const decoded = base64Decode(encoded);
      expect(arraysEqual(decoded, original)).toBe(true);
    });

    it('should include padding', () => {
      const data = new Uint8Array([1, 2]);
      const encoded = base64Encode(data);
      expect(encoded.endsWith('=')).toBe(true);
    });
  });

  describe('concat', () => {
    it('should concatenate multiple arrays', () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([3, 4]);
      const c = new Uint8Array([5, 6]);
      const result = concat([a, b, c]);
      expect(result).toEqual(new Uint8Array([1, 2, 3, 4, 5, 6]));
    });

    it('should handle empty arrays', () => {
      const a = new Uint8Array([1, 2]);
      const b = new Uint8Array([]);
      const c = new Uint8Array([3]);
      const result = concat([a, b, c]);
      expect(result).toEqual(new Uint8Array([1, 2, 3]));
    });

    it('should handle single array', () => {
      const a = new Uint8Array([1, 2, 3]);
      const result = concat([a]);
      expect(result).toEqual(a);
    });

    it('should handle empty input', () => {
      const result = concat([]);
      expect(result).toEqual(new Uint8Array([]));
    });
  });

  describe('arraysEqual', () => {
    it('should return true for equal arrays', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 3]);
      expect(arraysEqual(a, b)).toBe(true);
    });

    it('should return false for different arrays', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2, 4]);
      expect(arraysEqual(a, b)).toBe(false);
    });

    it('should return false for different lengths', () => {
      const a = new Uint8Array([1, 2, 3]);
      const b = new Uint8Array([1, 2]);
      expect(arraysEqual(a, b)).toBe(false);
    });

    it('should return true for empty arrays', () => {
      const a = new Uint8Array([]);
      const b = new Uint8Array([]);
      expect(arraysEqual(a, b)).toBe(true);
    });
  });

  describe('toBigEndian64 / fromBigEndian64', () => {
    it('should encode and decode numbers', () => {
      const values = [0, 1, 255, 256, 65535, 16777215, Number.MAX_SAFE_INTEGER];
      for (const value of values) {
        const encoded = toBigEndian64(value);
        expect(encoded.length).toBe(8);
        const decoded = fromBigEndian64(encoded);
        expect(decoded).toBe(BigInt(value));
      }
    });

    it('should handle bigint input', () => {
      const value = BigInt('9007199254740992'); // 2^53
      const encoded = toBigEndian64(value);
      const decoded = fromBigEndian64(encoded);
      expect(decoded).toBe(value);
    });

    it('should be big-endian', () => {
      const value = 0x0102030405060708n;
      const encoded = toBigEndian64(value);
      expect(encoded[0]).toBe(0x01);
      expect(encoded[7]).toBe(0x08);
    });
  });

  describe('encodeVarint / decodeVarint', () => {
    it('should encode and decode small numbers', () => {
      for (let i = 0; i < 128; i++) {
        const encoded = encodeVarint(i);
        expect(encoded.length).toBe(1);
        const [decoded, pos] = decodeVarint(encoded, 0);
        expect(decoded).toBe(i);
        expect(pos).toBe(1);
      }
    });

    it('should encode and decode larger numbers', () => {
      const values = [128, 255, 256, 16383, 16384, 2097151, 2097152];
      for (const value of values) {
        const encoded = encodeVarint(value);
        const [decoded, pos] = decodeVarint(encoded, 0);
        expect(decoded).toBe(value);
        expect(pos).toBe(encoded.length);
      }
    });

    it('should decode from offset', () => {
      const prefix = new Uint8Array([0xAA, 0xBB]);
      const varint = encodeVarint(300);
      const combined = concat([prefix, varint]);
      const [decoded, pos] = decodeVarint(combined, 2);
      expect(decoded).toBe(300);
      expect(pos).toBe(2 + varint.length);
    });

    it('should use continuation bits correctly', () => {
      // 128 = 0x80 should need 2 bytes: 0x80 0x01
      const encoded = encodeVarint(128);
      expect(encoded.length).toBe(2);
      expect(encoded[0] & 0x80).toBe(0x80); // continuation bit set
      expect(encoded[1] & 0x80).toBe(0);    // continuation bit not set
    });
  });

  describe('hexEncode / hexDecode', () => {
    it('should encode and decode hex', () => {
      const original = new Uint8Array([0, 1, 15, 16, 255]);
      const hex = hexEncode(original);
      expect(hex).toBe('00010f10ff');
      const decoded = hexDecode(hex);
      expect(arraysEqual(decoded, original)).toBe(true);
    });

    it('should handle empty array', () => {
      const original = new Uint8Array([]);
      const hex = hexEncode(original);
      expect(hex).toBe('');
      const decoded = hexDecode(hex);
      expect(decoded.length).toBe(0);
    });

    it('should pad single digits', () => {
      const data = new Uint8Array([0, 1, 2]);
      const hex = hexEncode(data);
      expect(hex).toBe('000102');
    });
  });

  describe('encodeOptional / decodeOptional', () => {
    it('should encode present value', () => {
      const data = new Uint8Array([1, 2, 3]);
      const encoded = encodeOptional(data, 3);
      expect(encoded[0]).toBe(1); // present flag
      expect(arraysEqual(encoded.slice(1), data)).toBe(true);
    });

    it('should encode absent value', () => {
      const data = new Uint8Array([]);
      const encoded = encodeOptional(data, 3);
      expect(encoded.length).toBe(1);
      expect(encoded[0]).toBe(0); // absent flag
    });

    it('should decode present value', () => {
      const data = new Uint8Array([1, 2, 3]);
      const encoded = encodeOptional(data, 3);
      const [decoded, newOffset] = decodeOptional(encoded, 0, 3);
      expect(arraysEqual(decoded, data)).toBe(true);
      expect(newOffset).toBe(4); // 1 flag + 3 data
    });

    it('should decode absent value', () => {
      const encoded = new Uint8Array([0]); // absent
      const [decoded, newOffset] = decodeOptional(encoded, 0, 3);
      expect(decoded.length).toBe(0);
      expect(newOffset).toBe(1);
    });
  });
});
