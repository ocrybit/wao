/**
 * AO-Core Converge Algorithm
 * Core path resolution engine
 */

import type { TABMMessage, TABMValue } from '../types/message.js';
import type { Device, DeviceInfo } from '../types/device.js';
import type { ResolveResult, Result } from '../types/result.js';
import type { ResolveOptions } from '../types/options.js';
import { isPass, ok, err } from '../types/result.js';
import { normalizeKey } from '../utils/keys.js';

/** Resolution context for tracking state during resolution */
export interface ResolutionContext {
  /** Current device being resolved */
  device: Device;
  /** Device info cache */
  deviceInfo: DeviceInfo;
  /** Current path being resolved */
  path: string[];
  /** Stack of devices for fallback */
  deviceStack: Device[];
  /** Visited keys to prevent cycles */
  visited: Set<string>;
  /** Maximum resolution depth */
  maxDepth: number;
  /** Current depth */
  depth: number;
}

/** Parse a path string into segments */
export function parsePath(path: string): string[] {
  if (!path || path === '/') {
    return [];
  }
  // Remove leading slash and split
  const normalized = path.startsWith('/') ? path.slice(1) : path;
  return normalized.split('/').filter(segment => segment.length > 0);
}

/** Join path segments into a path string */
export function joinPath(segments: string[]): string {
  if (segments.length === 0) {
    return '/';
  }
  return '/' + segments.join('/');
}

/** Check if a key is exported by a device */
export function isExported(info: DeviceInfo, key: string): boolean {
  const normalizedKey = normalizeKey(key);

  // Check exclusions first
  if (info.excludes?.includes(normalizedKey)) {
    return false;
  }

  // Check if explicitly exported
  return info.exports.includes(normalizedKey);
}

/** Get the handler function name for a device */
export function getHandler(info: DeviceInfo): string | undefined {
  return info.handler;
}

/** Get the default function for path resolution */
export function getDefault(info: DeviceInfo): string | undefined {
  return info.default;
}

/** Get the grouper function name */
export function getGrouper(info: DeviceInfo): string | undefined {
  return info.grouper;
}

/**
 * Resolve a single key on a device
 */
export async function resolveKey(
  device: Device,
  key: string,
  msg: TABMMessage,
  opts: ResolveOptions
): Promise<ResolveResult<TABMValue>> {
  const info = device.info(msg);
  const normalizedKey = normalizeKey(key);

  // Check if key is exported
  if (!isExported(info, normalizedKey)) {
    // Check for default handler
    const defaultFn = getDefault(info);
    if (defaultFn && isExported(info, defaultFn)) {
      // Use default handler with original key
      return device.get(defaultFn, { ...msg, 'requested-key': key }, opts);
    }
    // Key not found, pass through
    return { pass: true };
  }

  return device.get(normalizedKey, msg, opts);
}

/**
 * Resolve through device stack until a non-pass result
 */
export async function resolveWithStack(
  deviceStack: Device[],
  key: string,
  msg: TABMMessage,
  opts: ResolveOptions
): Promise<ResolveResult<TABMValue>> {
  for (const device of deviceStack) {
    const result = await resolveKey(device, key, msg, opts);
    if (!isPass(result)) {
      return result;
    }
  }
  // All devices passed - key not found
  return err(404, `Key not found: ${key}`);
}

/**
 * Main converge function - resolve a path on a message
 */
export async function converge(
  msg: TABMMessage,
  path: string,
  opts: ResolveOptions
): Promise<Result<TABMValue>> {
  const segments = parsePath(path);

  if (segments.length === 0) {
    // Empty path returns the message itself
    return ok(msg);
  }

  let current: TABMValue = msg;
  const visited = new Set<string>();
  const maxDepth = opts.maxDepth ?? 100;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const visitKey = `${i}:${segment}`;

    // Cycle detection
    if (visited.has(visitKey)) {
      return err(508, `Cycle detected at path segment: ${segment}`);
    }
    visited.add(visitKey);

    // Depth check
    if (i > maxDepth) {
      return err(508, `Maximum resolution depth exceeded: ${maxDepth}`);
    }

    // Handle different value types
    if (current === null || current === undefined) {
      return err(404, `Cannot resolve '${segment}' on null/undefined`);
    }

    if (typeof current !== 'object') {
      return err(400, `Cannot resolve '${segment}' on primitive value`);
    }

    if (Array.isArray(current)) {
      // Array index access
      const index = parseInt(segment, 10);
      if (isNaN(index) || index < 0 || index >= current.length) {
        return err(404, `Invalid array index: ${segment}`);
      }
      current = current[index];
    } else if (isMessage(current)) {
      // Message key resolution
      const device = opts.device as Device | undefined;

      if (device) {
        // Use device for resolution
        const result = await resolveKey(device, segment, current, opts);
        if (isPass(result)) {
          // Fall back to direct key access
          if (segment in current) {
            current = current[segment];
          } else {
            return err(404, `Key not found: ${segment}`);
          }
        } else if (result.ok) {
          current = result.value;
        } else {
          return result;
        }
      } else {
        // Direct key access
        if (segment in current) {
          current = current[segment];
        } else {
          return err(404, `Key not found: ${segment}`);
        }
      }
    } else {
      return err(400, `Cannot resolve path on value type`);
    }
  }

  return ok(current);
}

/** Type guard for TABMMessage */
function isMessage(value: unknown): value is TABMMessage {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Resolve with full device stack support
 */
export async function convergeWithDevices(
  msg: TABMMessage,
  path: string,
  devices: Device[],
  opts: ResolveOptions
): Promise<Result<TABMValue>> {
  const segments = parsePath(path);

  if (segments.length === 0) {
    return ok(msg);
  }

  let current: TABMValue = msg;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    if (current === null || current === undefined) {
      return err(404, `Cannot resolve '${segment}' on null/undefined`);
    }

    if (!isMessage(current)) {
      // For non-message values, try direct access
      if (Array.isArray(current)) {
        const index = parseInt(segment, 10);
        if (isNaN(index) || index < 0 || index >= current.length) {
          return err(404, `Invalid array index: ${segment}`);
        }
        current = current[index];
        continue;
      }
      return err(400, `Cannot resolve '${segment}' on non-message value`);
    }

    // Try device stack resolution
    const result = await resolveWithStack(devices, segment, current, opts);

    if (isPass(result)) {
      // All devices passed, try direct access
      if (segment in current) {
        current = current[segment];
      } else {
        return err(404, `Key not found: ${segment}`);
      }
    } else if (result.ok) {
      current = result.value;
    } else {
      return result;
    }
  }

  return ok(current);
}
