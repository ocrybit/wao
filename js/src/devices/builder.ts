/**
 * Custom Device Builder
 * Utilities for creating custom devices similar to Erlang HyperBEAM
 */

import type { Device, DeviceInfo } from '../types/device.js';
import type { TABMMessage, TABMValue } from '../types/message.js';
import type { ResolveResult, Result } from '../types/result.js';
import type { ResolveOptions } from '../types/options.js';
import { ok, err, pass } from '../types/result.js';

/** Handler function type for device methods */
export type DeviceHandler = (
  msg: TABMMessage,
  opts: ResolveOptions
) => Promise<ResolveResult<TABMValue>> | ResolveResult<TABMValue>;

/** Setter function type for device methods */
export type DeviceSetter = (
  value: TABMValue,
  msg: TABMMessage,
  opts: ResolveOptions
) => Promise<Result<TABMMessage>> | Result<TABMMessage>;

/** HTTP handler function type */
export type HttpHandler = (
  msg: TABMMessage,
  req: TABMMessage,
  opts: ResolveOptions
) => Promise<Result<TABMMessage>> | Result<TABMMessage>;

/** Configuration for building a custom device */
export interface DeviceConfig {
  /** Device name (e.g., 'counter', 'math') */
  name: string;
  /** Device version (e.g., '1.0') */
  version?: string;
  /** Exported method names */
  exports: string[];
  /** Default method for path resolution */
  default?: string;
  /** Method handlers */
  handlers: Record<string, DeviceHandler>;
  /** Method setters (optional) */
  setters?: Record<string, DeviceSetter>;
  /** HTTP request handler (optional) */
  httpHandler?: HttpHandler;
  /** Device dependencies */
  uses?: string[];
  /** Excluded methods */
  excludes?: string[];
}

/**
 * Build a custom device from configuration
 * Similar to Erlang's dev_<name>.erl pattern
 */
export function buildDevice(config: DeviceConfig): Device {
  const {
    name,
    version = '1.0',
    exports,
    handlers,
    setters,
    httpHandler,
    uses,
    excludes,
  } = config;

  const deviceId = version ? `${name}@${version}` : name;

  return {
    info(_msg?: TABMMessage): DeviceInfo {
      return {
        exports,
        default: config.default,
        excludes,
      };
    },

    uses(): string[] {
      return uses ?? [];
    },

    async get(
      key: string,
      msg: TABMMessage,
      opts: ResolveOptions
    ): Promise<ResolveResult<TABMValue>> {
      const handler = handlers[key];
      if (handler) {
        return handler(msg, opts);
      }
      // Pass through if no handler
      return pass();
    },

    async set(
      key: string,
      value: TABMValue,
      msg: TABMMessage,
      opts: ResolveOptions
    ): Promise<Result<TABMMessage>> {
      if (setters) {
        const setter = setters[key];
        if (setter) {
          return setter(value, msg, opts);
        }
      }
      // Default: just set the key
      return ok({ ...msg, [key]: value });
    },

    async handle(
      msg: TABMMessage,
      req: TABMMessage,
      opts: ResolveOptions
    ): Promise<Result<TABMMessage>> {
      if (httpHandler) {
        return httpHandler(msg, req, opts);
      }
      return err(501, `${deviceId} does not support HTTP handling`);
    },
  };
}

/**
 * Create a simple device with just get handlers
 * Convenience function for common patterns
 */
export function simpleDevice(
  name: string,
  handlers: Record<string, DeviceHandler>,
  options?: {
    version?: string;
    default?: string;
    uses?: string[];
  }
): Device {
  return buildDevice({
    name,
    version: options?.version,
    exports: Object.keys(handlers),
    handlers,
    default: options?.default,
    uses: options?.uses,
  });
}

/**
 * Create a stateful device with internal state
 * Useful for counters, caches, etc.
 */
export function statefulDevice<TState>(
  name: string,
  initialState: TState,
  config: {
    version?: string;
    exports: string[];
    default?: string;
    handlers: Record<
      string,
      (state: TState, msg: TABMMessage, opts: ResolveOptions) => {
        result: ResolveResult<TABMValue>;
        newState?: TState;
      }
    >;
  }
): Device & { getState: () => TState; setState: (s: TState) => void; reset: () => void } {
  let state = structuredClone(initialState);

  const device = buildDevice({
    name,
    version: config.version,
    exports: config.exports,
    default: config.default,
    handlers: Object.fromEntries(
      Object.entries(config.handlers).map(([key, handler]) => [
        key,
        async (msg: TABMMessage, opts: ResolveOptions) => {
          const { result, newState } = handler(state, msg, opts);
          if (newState !== undefined) {
            state = newState;
          }
          return result;
        },
      ])
    ),
  });

  return {
    ...device,
    getState: () => state,
    setState: (s: TState) => { state = s; },
    reset: () => { state = structuredClone(initialState); },
  };
}

/**
 * Compose multiple devices into a stack
 * Similar to Erlang's dev_stack
 */
export function composeDevices(
  name: string,
  devices: Device[],
  options?: { version?: string }
): Device {
  // Merge all exports
  const allExports = new Set<string>();
  for (const device of devices) {
    const info = device.info();
    for (const exp of info.exports) {
      allExports.add(exp);
    }
  }

  return {
    info(_msg?: TABMMessage): DeviceInfo {
      return {
        exports: Array.from(allExports),
      };
    },

    uses(): string[] {
      return devices.flatMap(d => d.uses?.() ?? []);
    },

    async get(
      key: string,
      msg: TABMMessage,
      opts: ResolveOptions
    ): Promise<ResolveResult<TABMValue>> {
      // Try each device in order
      for (const device of devices) {
        const result = await device.get(key, msg, opts);
        if (!('pass' in result)) {
          return result;
        }
      }
      return pass();
    },

    async set(
      key: string,
      value: TABMValue,
      msg: TABMMessage,
      opts: ResolveOptions
    ): Promise<Result<TABMMessage>> {
      // Try each device in order
      for (const device of devices) {
        if (device.set) {
          const info = device.info(msg);
          if (info.exports.includes(key)) {
            return device.set(key, value, msg, opts);
          }
        }
      }
      return ok({ ...msg, [key]: value });
    },

    async handle(
      msg: TABMMessage,
      req: TABMMessage,
      opts: ResolveOptions
    ): Promise<Result<TABMMessage>> {
      // Try each device in order
      for (const device of devices) {
        if (device.handle) {
          const result = await device.handle(msg, req, opts);
          if (result.ok) {
            return result;
          }
        }
      }
      return err(501, `No device in stack handles HTTP requests`);
    },
  };
}

// Re-export result helpers for convenience
export { ok, err, pass };
