/**
 * Encoding utilities for AO-Core
 */

import type { Binary } from '../types/index.js';

/** Convert string to binary */
export function toBinary(str: string): Binary {
  return new TextEncoder().encode(str);
}

/** Convert binary to string */
export function fromBinary(data: Binary): string {
  return new TextDecoder().decode(data);
}

/** Base64URL encode (no padding) */
export function base64UrlEncode(data: Binary): string {
  const base64 = btoa(String.fromCharCode(...data));
  return base64
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** Base64URL decode */
export function base64UrlDecode(str: string): Binary {
  // Add padding if needed
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (base64.length % 4)) % 4;
  base64 += '==='.slice(0, padding);

  const binary = atob(base64);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

/** Standard base64 encode (with padding) */
export function base64Encode(data: Binary): string {
  return btoa(String.fromCharCode(...data));
}

/** Standard base64 decode */
export function base64Decode(str: string): Binary {
  const binary = atob(str);
  return new Uint8Array([...binary].map(c => c.charCodeAt(0)));
}

/** Concatenate multiple binary arrays */
export function concat(arrays: Binary[]): Binary {
  const totalLength = arrays.reduce((sum, arr) => sum + arr.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    result.set(arr, offset);
    offset += arr.length;
  }
  return result;
}

/** Compare two binary arrays for equality */
export function arraysEqual(a: Binary, b: Binary): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/** Encode number as big-endian 64-bit */
export function toBigEndian64(value: number | bigint): Binary {
  const result = new Uint8Array(8);
  const big = BigInt(value);
  for (let i = 7; i >= 0; i--) {
    result[i] = Number(big >> BigInt((7 - i) * 8) & BigInt(0xFF));
  }
  return result;
}

/** Decode big-endian 64-bit to number */
export function fromBigEndian64(data: Binary): bigint {
  let value = BigInt(0);
  for (let i = 0; i < 8; i++) {
    value = (value << BigInt(8)) | BigInt(data[i]);
  }
  return value;
}

/** Encode optional field (presence byte + data or just presence byte) */
export function encodeOptional(data: Binary, expectedSize: number): Binary {
  if (data.length === 0) {
    return new Uint8Array([0]); // Not present
  }
  return new Uint8Array([1, ...data]); // Present
}

/** Decode optional field */
export function decodeOptional(
  data: Binary,
  offset: number,
  size: number
): [Binary, number] {
  const present = data[offset];
  if (present === 0) {
    return [new Uint8Array(), offset + 1];
  }
  return [data.slice(offset + 1, offset + 1 + size), offset + 1 + size];
}

/** Encode varint (AVS format) */
export function encodeVarint(value: number): Binary {
  const bytes: number[] = [];
  let v = value;
  while (v > 127) {
    bytes.push((v & 0x7F) | 0x80);
    v >>>= 7;
  }
  bytes.push(v);
  return new Uint8Array(bytes);
}

/** Decode varint (AVS format) */
export function decodeVarint(data: Binary, offset: number): [number, number] {
  let value = 0;
  let shift = 0;
  let pos = offset;

  while (true) {
    const byte = data[pos++];
    value |= (byte & 0x7F) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }

  return [value, pos];
}

/** Hex encode */
export function hexEncode(data: Binary): string {
  return Array.from(data)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Hex decode */
export function hexDecode(str: string): Binary {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i += 2) {
    bytes.push(parseInt(str.substring(i, i + 2), 16));
  }
  return new Uint8Array(bytes);
}

// Aliases for common naming conventions
export const toBase64URL = base64UrlEncode;
export const fromBase64URL = base64UrlDecode;
