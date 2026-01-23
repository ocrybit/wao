/**
 * Key handling utilities for AO-Core
 */

import type { TABMMessage, TABMValue, TypeSuffix } from '../types/index.js';
import { TYPE_SUFFIXES } from '../types/index.js';
import { toBinary } from './encoding.js';

/** Normalize key for comparison */
export function normalizeKey(key: string): string {
  // Convert to lowercase
  let normalized = key.toLowerCase();
  // Replace hyphens with underscores
  normalized = normalized.replace(/-/g, '_');
  // Remove type suffix for comparison
  for (const suffix of TYPE_SUFFIXES) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }
  return normalized;
}

/** Check if two keys are equivalent */
export function keysEqual(a: string, b: string): boolean {
  return normalizeKey(a) === normalizeKey(b);
}

/** Check if key is private (priv/ prefix) */
export function isPrivateKey(key: string): boolean {
  const lower = key.toLowerCase();
  return lower.startsWith('priv/') || lower.startsWith('priv_');
}

/** Extract type suffix from key */
export function extractTypeSuffix(key: string): TypeSuffix | null {
  for (const suffix of TYPE_SUFFIXES) {
    if (key.endsWith(suffix)) {
      return suffix;
    }
  }
  return null;
}

/** Remove type suffix from key */
export function stripTypeSuffix(key: string): string {
  const suffix = extractTypeSuffix(key);
  if (suffix) {
    return key.slice(0, -suffix.length);
  }
  return key;
}

/** Find key with any type suffix variant */
export function findTypedKey(msg: TABMMessage, key: string): string | null {
  // Check exact key first
  if (key in msg) return key;

  // Check with type suffixes
  const suffixes = ['', ...TYPE_SUFFIXES];
  const baseKey = stripTypeSuffix(key);

  for (const suffix of suffixes) {
    const typedKey = baseKey + suffix;
    if (typedKey in msg) return typedKey;
  }

  return null;
}

/** Coerce value based on type suffix */
export function coerceToType(key: string, value: unknown): TABMValue {
  const suffix = extractTypeSuffix(key);
  switch (suffix) {
    case '+integer':
      return Math.floor(Number(value));
    case '+float':
      return Number(value);
    case '+binary':
      if (value instanceof Uint8Array) return value;
      if (typeof value === 'string') return toBinary(value);
      return toBinary(String(value));
    case '+list':
      return Array.isArray(value) ? value : [value as TABMValue];
    case '+map':
      if (typeof value === 'object' && value !== null) {
        return value as TABMMessage;
      }
      return {};
    default:
      return value as TABMValue;
  }
}

/** Filter out private keys from message */
export function publicKeys(msg: TABMMessage): TABMMessage {
  const result: TABMMessage = {};
  for (const [key, value] of Object.entries(msg)) {
    if (!isPrivateKey(key)) {
      result[key] = value;
    }
  }
  return result;
}

/** Get value from message with key normalization */
export function getKey(msg: TABMMessage, key: string): TABMValue | undefined {
  // Direct lookup first
  if (key in msg) return msg[key];

  // Try normalized variations
  const normalizedKey = normalizeKey(key);
  for (const msgKey of Object.keys(msg)) {
    if (normalizeKey(msgKey) === normalizedKey) {
      return msg[msgKey];
    }
  }

  return undefined;
}

/** Set value in message */
export function setKey(
  msg: TABMMessage,
  key: string,
  value: TABMValue
): TABMMessage {
  return { ...msg, [key]: value };
}

/** Get all keys from message */
export function getKeys(msg: TABMMessage): string[] {
  return Object.keys(msg);
}

/** Check if message has key */
export function hasKey(msg: TABMMessage, key: string): boolean {
  return findTypedKey(msg, key) !== null;
}

// Alias for common naming
export const getTypeSuffix = extractTypeSuffix;
