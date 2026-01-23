/**
 * AO-Core Device Types
 */

import type { TABMMessage, TABMValue } from './message.js';
import type { ResolveResult, Result } from './result.js';
import type { ResolveOptions } from './options.js';

/** Device metadata */
export interface DeviceInfo {
  /** Exported function names */
  exports: string[];
  /** Functions to exclude from external access */
  excludes?: string[];
  /** Default function for path resolution */
  default?: string;
  /** Function for grouping related calls */
  grouper?: string;
  /** HTTP request handler function */
  handler?: string;
}

/** Device interface - all devices must implement this */
export interface Device {
  /** Get device metadata */
  info(msg?: TABMMessage): DeviceInfo;

  /** Optional: list of device dependencies */
  uses?(): string[];

  /** Resolve a key on this device */
  get(
    key: string,
    msg: TABMMessage,
    opts: ResolveOptions
  ): Promise<ResolveResult<TABMValue>>;

  /** Set a key value (optional) */
  set?(
    key: string,
    value: TABMValue,
    msg: TABMMessage,
    opts: ResolveOptions
  ): Promise<Result<TABMMessage>>;

  /** Handle HTTP request (optional) */
  handle?(
    msg: TABMMessage,
    req: TABMMessage,
    opts: ResolveOptions
  ): Promise<Result<TABMMessage>>;
}

/** Device identifier parsed from string */
export interface DeviceIdentifier {
  name: string;
  version?: string;
}

/** Parse device string: "name@version" or just "name" */
export function parseDeviceId(deviceStr: string): DeviceIdentifier {
  const atIndex = deviceStr.indexOf('@');
  if (atIndex === -1) {
    return { name: deviceStr };
  }
  return {
    name: deviceStr.substring(0, atIndex),
    version: deviceStr.substring(atIndex + 1)
  };
}

/** Format device identifier to string */
export function formatDeviceId(device: DeviceIdentifier): string {
  if (device.version) {
    return `${device.name}@${device.version}`;
  }
  return device.name;
}

/** Module naming convention: dev_<name> -> name@version */
export function deviceToModule(device: DeviceIdentifier): string {
  return `dev_${device.name.replace(/-/g, '_')}`;
}

/** Device loader function type */
export type DeviceLoader = (
  deviceId: string,
  opts: ResolveOptions
) => Promise<Device | undefined>;

/** Device registry for caching loaded devices */
export class DeviceRegistry {
  private devices: Map<string, Device> = new Map();
  private loader: DeviceLoader;

  constructor(loader: DeviceLoader) {
    this.loader = loader;
  }

  /** Register a device */
  register(id: string, device: Device): void {
    this.devices.set(id, device);
  }

  /** Get a device, loading if necessary */
  async get(id: string, opts: ResolveOptions): Promise<Device | undefined> {
    let device = this.devices.get(id);
    if (!device) {
      device = await this.loader(id, opts);
      if (device) {
        this.devices.set(id, device);
      }
    }
    return device;
  }

  /** Check if device is registered */
  has(id: string): boolean {
    return this.devices.has(id);
  }

  /** Clear all devices */
  clear(): void {
    this.devices.clear();
  }
}
