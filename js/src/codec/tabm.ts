/**
 * TABM Codec - Type-Annotated Binary Message format
 * Native message encoding for AO-Core
 */

import type { TABMMessage, TABMValue, Tag } from '../types/message.js';
import type { Binary, TypeSuffix } from '../types/primitives.js';
import type { Codec } from '../types/codec.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import {
  toBinary,
  fromBinary,
  concat,
  encodeVarint,
  decodeVarint,
  toBase64URL,
  fromBase64URL,
} from '../utils/encoding.js';
import { getTypeSuffix, stripTypeSuffix } from '../utils/keys.js';

/** Type markers for TABM encoding */
const enum TypeMarker {
  Null = 0x00,
  Boolean = 0x01,
  Integer = 0x02,
  Float = 0x03,
  String = 0x04,
  Binary = 0x05,
  List = 0x06,
  Map = 0x07,
}

/** Encode a TABM value to binary */
export function encodeValue(value: TABMValue): Binary {
  if (value === null || value === undefined) {
    return new Uint8Array([TypeMarker.Null]);
  }

  if (typeof value === 'boolean') {
    return new Uint8Array([TypeMarker.Boolean, value ? 1 : 0]);
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value)) {
      // Encode as varint
      const varint = encodeVarint(Math.abs(value));
      const sign = value < 0 ? 1 : 0;
      return concat([
        new Uint8Array([TypeMarker.Integer, sign]),
        varint,
      ]);
    } else {
      // Encode as 64-bit float
      const buffer = new ArrayBuffer(8);
      new DataView(buffer).setFloat64(0, value, false);
      return concat([
        new Uint8Array([TypeMarker.Float]),
        new Uint8Array(buffer),
      ]);
    }
  }

  if (typeof value === 'string') {
    const bytes = toBinary(value);
    const length = encodeVarint(bytes.length);
    return concat([
      new Uint8Array([TypeMarker.String]),
      length,
      bytes,
    ]);
  }

  if (value instanceof Uint8Array) {
    const length = encodeVarint(value.length);
    return concat([
      new Uint8Array([TypeMarker.Binary]),
      length,
      value,
    ]);
  }

  if (Array.isArray(value)) {
    const length = encodeVarint(value.length);
    const items = value.map(item => encodeValue(item));
    return concat([
      new Uint8Array([TypeMarker.List]),
      length,
      ...items,
    ]);
  }

  if (typeof value === 'object') {
    const entries = Object.entries(value);
    const length = encodeVarint(entries.length);
    const items: Binary[] = [];

    for (const [key, val] of entries) {
      const keyBytes = toBinary(key);
      const keyLength = encodeVarint(keyBytes.length);
      items.push(keyLength, keyBytes, encodeValue(val as TABMValue));
    }

    return concat([
      new Uint8Array([TypeMarker.Map]),
      length,
      ...items,
    ]);
  }

  throw new Error(`Cannot encode value of type: ${typeof value}`);
}

/** Decode a TABM value from binary */
export function decodeValue(
  data: Binary,
  offset: number = 0
): { value: TABMValue; bytesRead: number } {
  const marker = data[offset];

  switch (marker) {
    case TypeMarker.Null:
      return { value: null, bytesRead: 1 };

    case TypeMarker.Boolean:
      return { value: data[offset + 1] !== 0, bytesRead: 2 };

    case TypeMarker.Integer: {
      const sign = data[offset + 1];
      const [magnitude, newPos] = decodeVarint(data, offset + 2);
      const varintBytes = newPos - (offset + 2);
      const value = sign ? -magnitude : magnitude;
      return { value, bytesRead: 2 + varintBytes };
    }

    case TypeMarker.Float: {
      const buffer = data.slice(offset + 1, offset + 9);
      const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const value = view.getFloat64(0, false);
      return { value, bytesRead: 9 };
    }

    case TypeMarker.String: {
      const [length, afterLength] = decodeVarint(data, offset + 1);
      const lengthBytes = afterLength - (offset + 1);
      const start = offset + 1 + lengthBytes;
      const bytes = data.slice(start, start + length);
      const value = fromBinary(bytes);
      return { value, bytesRead: 1 + lengthBytes + length };
    }

    case TypeMarker.Binary: {
      const [length, afterLength] = decodeVarint(data, offset + 1);
      const lengthBytes = afterLength - (offset + 1);
      const start = offset + 1 + lengthBytes;
      const value = data.slice(start, start + length);
      return { value, bytesRead: 1 + lengthBytes + length };
    }

    case TypeMarker.List: {
      const [length, afterLength] = decodeVarint(data, offset + 1);
      const lengthBytes = afterLength - (offset + 1);
      const items: TABMValue[] = [];
      let pos = offset + 1 + lengthBytes;

      for (let i = 0; i < length; i++) {
        const { value, bytesRead } = decodeValue(data, pos);
        items.push(value);
        pos += bytesRead;
      }

      return { value: items, bytesRead: pos - offset };
    }

    case TypeMarker.Map: {
      const [length, afterLength] = decodeVarint(data, offset + 1);
      const lengthBytes = afterLength - (offset + 1);
      const map: TABMMessage = {};
      let pos = offset + 1 + lengthBytes;

      for (let i = 0; i < length; i++) {
        const [keyLength, afterKeyLength] = decodeVarint(data, pos);
        pos = afterKeyLength;

        const keyBytes = data.slice(pos, pos + keyLength);
        const key = fromBinary(keyBytes);
        pos += keyLength;

        const { value, bytesRead } = decodeValue(data, pos);
        map[key] = value;
        pos += bytesRead;
      }

      return { value: map, bytesRead: pos - offset };
    }

    default:
      throw new Error(`Unknown type marker: ${marker}`);
  }
}

/** Encode a complete TABM message */
export function encodeMessage(msg: TABMMessage): Binary {
  return encodeValue(msg);
}

/** Decode a complete TABM message */
export function decodeMessage(data: Binary): Result<TABMMessage> {
  try {
    const { value } = decodeValue(data);
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      return ok(value as TABMMessage);
    }
    return err(400, 'Invalid TABM message: root must be a map');
  } catch (e) {
    return err(400, `TABM decode error: ${(e as Error).message}`);
  }
}

/** Convert message to tags (for ANS-104 compatibility) */
export function messageToTags(msg: TABMMessage): Tag[] {
  const tags: Tag[] = [];

  for (const [key, value] of Object.entries(msg)) {
    // Skip binary and nested values for tag conversion
    if (
      value instanceof Uint8Array ||
      Array.isArray(value) ||
      (typeof value === 'object' && value !== null)
    ) {
      continue;
    }

    // Get type suffix for reconstruction
    const suffix = getTypeSuffix(key) || inferTypeSuffix(value);
    const baseKey = stripTypeSuffix(key);
    const tagName = suffix ? `${baseKey}${suffix}` : baseKey;

    tags.push({
      name: toBinary(tagName),
      value: toBinary(String(value ?? '')),
    });
  }

  return tags;
}

/** Convert tags back to partial message */
export function tagsToMessage(tags: Tag[]): TABMMessage {
  const msg: TABMMessage = {};

  for (const tag of tags) {
    const key = fromBinary(tag.name);
    const rawValue = fromBinary(tag.value);
    const suffix = getTypeSuffix(key);
    const baseKey = stripTypeSuffix(key);

    // Parse value based on suffix
    let value: TABMValue = rawValue;

    if (suffix === '+integer') {
      value = parseInt(rawValue, 10);
    } else if (suffix === '+float') {
      value = parseFloat(rawValue);
    } else if (suffix === '+binary') {
      value = fromBase64URL(rawValue);
    }

    msg[baseKey] = value;
  }

  return msg;
}

/** Infer type suffix from value */
function inferTypeSuffix(value: TABMValue): TypeSuffix | undefined {
  if (typeof value === 'number') {
    return Number.isInteger(value) ? '+integer' : '+float';
  }
  return undefined;
}

/** TABM Codec implementation */
export const TABMCodec: Codec = {
  name: 'tabm',
  mimeType: 'application/x-tabm',

  encode(msg: TABMMessage): Result<Binary> {
    try {
      return ok(encodeMessage(msg));
    } catch (e) {
      return err(400, `TABM encode error: ${(e as Error).message}`);
    }
  },

  decode(data: Binary): Result<TABMMessage> {
    return decodeMessage(data);
  },
};
