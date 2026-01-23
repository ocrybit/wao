/**
 * ANS-104 Codec - Arweave Bundle Format
 * Encoding for Arweave-compatible data items
 */

import type { TABMMessage, Tag } from '../types/message.js';
import type { Binary, Base64URL, SignatureType } from '../types/primitives.js';
import type { Codec } from '../types/codec.js';
import type { Result } from '../types/result.js';
import { ok, err } from '../types/result.js';
import {
  toBinary,
  fromBinary,
  concat,
  toBase64URL,
  fromBase64URL,
} from '../utils/encoding.js';
import { deepHash } from '../crypto/hash.js';

/** ANS-104 Data Item structure */
export interface DataItem {
  signature: Binary;
  owner: Binary;
  target?: Binary;
  anchor?: Binary;
  tags: Tag[];
  data: Binary;
}

/** Signature configuration by type */
const SIGNATURE_CONFIG: Record<SignatureType, { sigLength: number; pubLength: number }> = {
  1: { sigLength: 512, pubLength: 512 }, // RSA-4096
  2: { sigLength: 64, pubLength: 32 },   // ED25519
  3: { sigLength: 65, pubLength: 20 },   // Ethereum
};

/** Encode number as little-endian bytes */
function encodeLE(num: number, bytes: number): Binary {
  const result = new Uint8Array(bytes);
  for (let i = 0; i < bytes; i++) {
    result[i] = (num >> (i * 8)) & 0xff;
  }
  return result;
}

/** Decode little-endian bytes to number */
function decodeLE(data: Binary, offset: number, bytes: number): number {
  let result = 0;
  for (let i = 0; i < bytes; i++) {
    result |= data[offset + i] << (i * 8);
  }
  return result;
}

/** Encode avro-style long */
function encodeAvroLong(num: number): Binary {
  const bytes: number[] = [];
  let n = num;

  while (n > 127) {
    bytes.push((n & 0x7f) | 0x80);
    n = n >>> 7;
  }
  bytes.push(n);

  return new Uint8Array(bytes);
}

/** Decode avro-style long */
function decodeAvroLong(data: Binary, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;

  while (true) {
    const byte = data[offset + bytesRead];
    value |= (byte & 0x7f) << shift;
    bytesRead++;

    if ((byte & 0x80) === 0) break;
    shift += 7;
  }

  return { value, bytesRead };
}

/** Encode tags in ANS-104 format */
function encodeTags(tags: Tag[]): Binary {
  if (tags.length === 0) {
    return encodeAvroLong(0);
  }

  const parts: Binary[] = [encodeAvroLong(tags.length)];

  for (const tag of tags) {
    parts.push(encodeAvroLong(tag.name.length));
    parts.push(tag.name);
    parts.push(encodeAvroLong(tag.value.length));
    parts.push(tag.value);
  }

  // Terminator
  parts.push(new Uint8Array([0]));

  return concat(parts);
}

/** Decode tags from ANS-104 format */
function decodeTags(data: Binary, offset: number): { tags: Tag[]; bytesRead: number } {
  const { value: count, bytesRead: countBytes } = decodeAvroLong(data, offset);
  let pos = offset + countBytes;
  const tags: Tag[] = [];

  for (let i = 0; i < count; i++) {
    const { value: nameLen, bytesRead: nameLenBytes } = decodeAvroLong(data, pos);
    pos += nameLenBytes;

    const name = data.slice(pos, pos + nameLen);
    pos += nameLen;

    const { value: valueLen, bytesRead: valueLenBytes } = decodeAvroLong(data, pos);
    pos += valueLenBytes;

    const value = data.slice(pos, pos + valueLen);
    pos += valueLen;

    tags.push({ name, value });
  }

  // Skip terminator if present
  if (data[pos] === 0) {
    pos++;
  }

  return { tags, bytesRead: pos - offset };
}

/** Encode a data item to ANS-104 format */
export function encodeDataItem(item: DataItem, sigType: SignatureType = 1): Binary {
  const config = SIGNATURE_CONFIG[sigType];

  const parts: Binary[] = [];

  // Signature type (2 bytes LE)
  parts.push(encodeLE(sigType, 2));

  // Signature
  if (item.signature.length !== config.sigLength) {
    throw new Error(`Invalid signature length: expected ${config.sigLength}, got ${item.signature.length}`);
  }
  parts.push(item.signature);

  // Owner (public key)
  if (item.owner.length !== config.pubLength) {
    throw new Error(`Invalid owner length: expected ${config.pubLength}, got ${item.owner.length}`);
  }
  parts.push(item.owner);

  // Target presence flag and value
  if (item.target && item.target.length > 0) {
    parts.push(new Uint8Array([1])); // has target
    parts.push(item.target);
  } else {
    parts.push(new Uint8Array([0])); // no target
  }

  // Anchor presence flag and value
  if (item.anchor && item.anchor.length > 0) {
    parts.push(new Uint8Array([1])); // has anchor
    parts.push(item.anchor);
  } else {
    parts.push(new Uint8Array([0])); // no anchor
  }

  // Number of tags (8 bytes LE)
  parts.push(encodeLE(item.tags.length, 8));

  // Tags byte size (8 bytes LE) - calculate first
  const encodedTags = encodeTags(item.tags);
  parts.push(encodeLE(encodedTags.length, 8));

  // Encoded tags
  parts.push(encodedTags);

  // Data
  parts.push(item.data);

  return concat(parts);
}

/** Decode a data item from ANS-104 format */
export function decodeDataItem(data: Binary): Result<DataItem> {
  try {
    let pos = 0;

    // Signature type (2 bytes LE)
    const sigType = decodeLE(data, pos, 2) as SignatureType;
    pos += 2;

    const config = SIGNATURE_CONFIG[sigType];
    if (!config) {
      return err(400, `Unknown signature type: ${sigType}`);
    }

    // Signature
    const signature = data.slice(pos, pos + config.sigLength);
    pos += config.sigLength;

    // Owner
    const owner = data.slice(pos, pos + config.pubLength);
    pos += config.pubLength;

    // Target
    const hasTarget = data[pos] === 1;
    pos += 1;
    let target: Binary | undefined;
    if (hasTarget) {
      target = data.slice(pos, pos + 32);
      pos += 32;
    }

    // Anchor
    const hasAnchor = data[pos] === 1;
    pos += 1;
    let anchor: Binary | undefined;
    if (hasAnchor) {
      anchor = data.slice(pos, pos + 32);
      pos += 32;
    }

    // Number of tags (8 bytes LE)
    const tagCount = decodeLE(data, pos, 8);
    pos += 8;

    // Tags byte size (8 bytes LE)
    const tagsSize = decodeLE(data, pos, 8);
    pos += 8;

    // Decode tags
    const { tags } = decodeTags(data, pos);
    pos += tagsSize;

    // Data is everything remaining
    const itemData = data.slice(pos);

    return ok({
      signature,
      owner,
      target,
      anchor,
      tags,
      data: itemData,
    });
  } catch (e) {
    return err(400, `ANS-104 decode error: ${(e as Error).message}`);
  }
}

/** Get the signature data for a data item (for signing) */
export async function getSignatureData(
  owner: Binary,
  target: Binary | undefined,
  anchor: Binary | undefined,
  tags: Tag[],
  data: Binary
): Promise<Binary> {
  const parts: (string | Binary)[] = [
    'dataitem',
    '1', // version
    owner,
    target ?? new Uint8Array(0),
    anchor ?? new Uint8Array(0),
    ...tags.flatMap(t => [t.name, t.value]),
    data,
  ];

  return deepHash(parts.map(p => typeof p === 'string' ? toBinary(p) : p));
}

/** Convert TABMMessage to DataItem format */
export function messageToDataItem(msg: TABMMessage): DataItem {
  const tags: Tag[] = [];

  // Extract standard fields to tags
  for (const [key, value] of Object.entries(msg)) {
    if (key === 'signature' || key === 'owner' || key === 'target' || key === 'anchor' || key === 'body') {
      continue;
    }

    if (value === null || value === undefined) {
      continue;
    }

    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      tags.push({
        name: toBinary(key),
        value: toBinary(String(value)),
      });
    }
  }

  return {
    signature: (msg['signature'] as Binary) ?? new Uint8Array(512),
    owner: (msg['owner'] as Binary) ?? new Uint8Array(512),
    target: msg['target'] as Binary | undefined,
    anchor: msg['anchor'] as Binary | undefined,
    tags,
    data: (msg['body'] as Binary) ?? new Uint8Array(0),
  };
}

/** Convert DataItem to TABMMessage format */
export function dataItemToMessage(item: DataItem): TABMMessage {
  const msg: TABMMessage = {
    signature: item.signature,
    owner: item.owner,
  };

  if (item.target && item.target.length > 0) {
    msg['target'] = item.target;
  }

  if (item.anchor && item.anchor.length > 0) {
    msg['anchor'] = item.anchor;
  }

  for (const tag of item.tags) {
    const key = fromBinary(tag.name);
    const value = fromBinary(tag.value);
    msg[key] = value;
  }

  if (item.data.length > 0) {
    msg['body'] = item.data;
  }

  return msg;
}

/** ANS-104 Codec implementation */
export const ANS104Codec: Codec = {
  name: 'ans-104',
  mimeType: 'application/x-ans-104',

  encode(msg: TABMMessage): Result<Binary> {
    try {
      const item = messageToDataItem(msg);
      const sigType = (msg['signature-type'] as SignatureType) ?? 1;
      return ok(encodeDataItem(item, sigType));
    } catch (e) {
      return err(400, `ANS-104 encode error: ${(e as Error).message}`);
    }
  },

  decode(data: Binary): Result<TABMMessage> {
    const result = decodeDataItem(data);
    if (!result.ok) {
      return result;
    }
    return ok(dataItemToMessage(result.value));
  },
};
