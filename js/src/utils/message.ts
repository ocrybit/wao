/**
 * Message utilities for AO-Core
 */

import type { Binary, Base64URL, Tag, TABMMessage, TABMValue } from '../types/index.js';
import { sha256 } from '../crypto/hash.js';
import {
  concat,
  base64UrlEncode,
  toBinary,
  encodeVarint
} from './encoding.js';
import { publicKeys, isPrivateKey } from './keys.js';

/** Convert message to tags (excluding special keys) */
export function messageToTags(msg: TABMMessage): Tag[] {
  const tags: Tag[] = [];
  const excludeKeys = new Set([
    'signature', 'signature-type', 'signature-input',
    'owner', 'target', 'anchor', 'body', 'id', 'unsigned-id'
  ]);

  for (const [key, value] of Object.entries(msg)) {
    if (excludeKeys.has(key.toLowerCase())) continue;
    if (isPrivateKey(key)) continue;
    if (value === null || value === undefined) continue;

    const tagValue = serializeTagValue(value);
    tags.push({
      name: toBinary(key),
      value: toBinary(tagValue)
    });
  }

  return tags;
}

/** Serialize value for tag */
function serializeTagValue(value: TABMValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (value instanceof Uint8Array) return base64UrlEncode(value);
  if (Array.isArray(value)) return JSON.stringify(value);
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/** Convert tags to message */
export function tagsToMessage(tags: Tag[]): TABMMessage {
  const msg: TABMMessage = {};
  for (const tag of tags) {
    const name = new TextDecoder().decode(tag.name);
    const value = new TextDecoder().decode(tag.value);
    msg[name] = parseTagValue(value);
  }
  return msg;
}

/** Parse tag value to appropriate type */
function parseTagValue(value: string): TABMValue {
  // Try to parse as JSON for complex types
  if (value.startsWith('[') || value.startsWith('{')) {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  // Check for type prefix
  const colonIndex = value.indexOf(':');
  if (colonIndex > 0 && colonIndex < 10) {
    const type = value.substring(0, colonIndex).toLowerCase();
    const data = value.substring(colonIndex + 1);

    switch (type) {
      case 'int':
      case 'integer':
        return parseInt(data, 10);
      case 'float':
        return parseFloat(data);
      case 'bool':
      case 'boolean':
        return data.toLowerCase() === 'true';
      default:
        return value;
    }
  }

  return value;
}

/** Encode tags to AVS binary format */
export function encodeTags(tags: Tag[]): Binary {
  const parts: Binary[] = [];
  for (const tag of tags) {
    parts.push(encodeVarint(tag.name.length));
    parts.push(tag.name);
    parts.push(encodeVarint(tag.value.length));
    parts.push(tag.value);
  }
  return concat(parts);
}

/** Compute message ID */
export async function computeId(
  msg: TABMMessage,
  includeSig: boolean
): Promise<Base64URL> {
  const owner = (msg['owner'] as Binary) || new Uint8Array();
  const target = (msg['target'] as Binary) || new Uint8Array();
  const anchor = (msg['anchor'] as Binary) || new Uint8Array();
  const tags = messageToTags(msg);
  const data = (msg['body'] as Binary) || new Uint8Array();

  // Compute unsigned ID
  const unsignedId = await sha256(concat([
    await sha256(owner),
    await sha256(target),
    await sha256(anchor),
    await sha256(encodeTags(tags)),
    await sha256(data)
  ]));

  if (!includeSig) {
    return base64UrlEncode(unsignedId);
  }

  // Compute signed ID
  const signature = (msg['signature'] as Binary) || new Uint8Array();
  const signedId = await sha256(concat([
    await sha256(signature),
    unsignedId
  ]));

  return base64UrlEncode(signedId);
}

/** Check if message is a bundle */
export function isBundle(msg: TABMMessage): boolean {
  const body = msg['body'];
  return (
    typeof body === 'object' &&
    body !== null &&
    !(body instanceof Uint8Array) &&
    '1' in (body as TABMMessage)
  );
}

/** Get bundle items */
export function getBundleItems(msg: TABMMessage): TABMMessage[] {
  const body = msg['body'] as TABMMessage;
  if (!body) return [];

  const items: TABMMessage[] = [];
  let index = 1;
  while (String(index) in body) {
    items.push(body[String(index)] as TABMMessage);
    index++;
  }
  return items;
}

/** Clone message (shallow) */
export function cloneMessage(msg: TABMMessage): TABMMessage {
  return { ...msg };
}

/** Deep clone message */
export function deepCloneMessage(msg: TABMMessage): TABMMessage {
  return JSON.parse(JSON.stringify(msg, (_, value) => {
    if (value instanceof Uint8Array) {
      return { __binary: Array.from(value) };
    }
    return value;
  }), (_, value) => {
    if (value && typeof value === 'object' && '__binary' in value) {
      return new Uint8Array(value.__binary);
    }
    return value;
  });
}

/** Compute signed message ID */
export async function computeMessageId(msg: TABMMessage): Promise<Base64URL> {
  return computeId(msg, true);
}

/** Compute unsigned message ID */
export async function computeUnsignedId(msg: TABMMessage): Promise<Base64URL> {
  return computeId(msg, false);
}
