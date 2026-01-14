/**
 * Hashing utilities for AO-Core
 */

import type { Binary } from '../types/index.js';
import { concat, toBinary } from '../utils/encoding.js';

/** SHA-256 hash */
export async function sha256(data: Binary): Promise<Binary> {
  const hash = await crypto.subtle.digest('SHA-256', data as BufferSource);
  return new Uint8Array(hash);
}

/** SHA-384 hash (for deep hash) */
export async function sha384(data: Binary): Promise<Binary> {
  const hash = await crypto.subtle.digest('SHA-384', data as BufferSource);
  return new Uint8Array(hash);
}

/** SHA-512 hash */
export async function sha512(data: Binary): Promise<Binary> {
  const hash = await crypto.subtle.digest('SHA-512', data as BufferSource);
  return new Uint8Array(hash);
}

/** Deep hash input type */
export type DeepHashInput = Binary | DeepHashInput[];

/**
 * Deep hash algorithm (Arweave-specific)
 * Uses SHA-384 for recursive hashing of nested data structures
 */
export async function deepHash(data: DeepHashInput): Promise<Binary> {
  if (data instanceof Uint8Array) {
    // Blob: sha384(sha384("blob" + length) || sha384(data))
    const tag = toBinary('blob' + data.length);
    const tagHash = await sha384(tag);
    const dataHash = await sha384(data);
    return sha384(concat([tagHash, dataHash]));
  }

  if (Array.isArray(data)) {
    // List: fold over items
    const tag = toBinary('list' + data.length);
    let hash = await sha384(tag);

    for (const item of data) {
      const itemHash = await deepHash(item);
      hash = await sha384(concat([hash, itemHash]));
    }

    return hash;
  }

  throw new Error('Invalid deep hash input');
}

/**
 * Compute deep hash for ANS-104 data item
 */
export async function dataItemDeepHash(
  owner: Binary,
  target: Binary,
  anchor: Binary,
  tags: Array<[Binary, Binary]>,
  data: Binary
): Promise<Binary> {
  return deepHash([
    toBinary('dataitem'),
    toBinary('1'),           // format
    toBinary('1'),           // sig type (RSA)
    owner,
    target,
    anchor,
    tags,
    data
  ]);
}
