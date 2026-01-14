import { describe, it, expect, beforeEach } from 'vitest';
import {
  MessageDevice,
  createMessageDevice,
} from '../src/devices/message.js';
import {
  MetaDevice,
  createMetaDevice,
} from '../src/devices/meta.js';
import {
  ProcessDevice,
  createProcessDevice,
} from '../src/devices/process.js';
import {
  SchedulerDevice,
  createSchedulerDevice,
} from '../src/devices/scheduler.js';
import { createMemoryStore } from '../src/store/memory.js';
import { isOk, isPass } from '../src/types/result.js';
import type { TABMMessage } from '../src/types/message.js';

describe('Built-in Devices', () => {
  describe('MessageDevice', () => {
    let device: MessageDevice;

    beforeEach(() => {
      device = createMessageDevice();
    });

    describe('info', () => {
      it('should return device info', () => {
        const info = device.info();
        expect(info.exports).toContain('id');
        expect(info.exports).toContain('keys');
        expect(info.exports).toContain('has');
        expect(info.default).toBe('get');
      });
    });

    describe('get - id', () => {
      it('should compute message ID', async () => {
        const msg: TABMMessage = { test: 'value' };
        const result = await device.get('id', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(typeof result.value).toBe('string');
        }
      });
    });

    describe('get - unsigned-id', () => {
      it('should compute unsigned message ID', async () => {
        const msg: TABMMessage = { test: 'value' };
        const result = await device.get('unsigned-id', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(typeof result.value).toBe('string');
        }
      });
    });

    describe('get - keys', () => {
      it('should return all keys', async () => {
        const msg: TABMMessage = { a: 1, b: 2, c: 3 };
        const result = await device.get('keys', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const keys = result.value as string[];
          expect(keys).toContain('a');
          expect(keys).toContain('b');
          expect(keys).toContain('c');
        }
      });
    });

    describe('get - has', () => {
      it('should check if key exists', async () => {
        const msg: TABMMessage = {
          'requested-key': 'existing',
          'existing': 'value',
        };
        const result = await device.get('has', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(true);
        }
      });

      it('should return false for missing key', async () => {
        const msg: TABMMessage = {
          'requested-key': 'missing',
        };
        const result = await device.get('has', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(false);
        }
      });
    });

    describe('get - type', () => {
      it('should return type of value', async () => {
        const testCases: [unknown, string][] = [
          [null, 'null'],
          ['string', 'string'],
          [42, 'number'],
          [true, 'boolean'],
          [new Uint8Array([1, 2]), 'binary'],
          [[1, 2, 3], 'list'],
        ];

        for (const [value, expectedType] of testCases) {
          const msg: TABMMessage = { value };
          const result = await device.get('type', msg, {});

          expect(isOk(result)).toBe(true);
          if (isOk(result)) {
            expect(result.value).toBe(expectedType);
          }
        }
      });
    });

    describe('get - size', () => {
      it('should return number of keys', async () => {
        const msg: TABMMessage = { a: 1, b: 2, c: 3 };
        const result = await device.get('size', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(3);
        }
      });
    });

    describe('get - default (direct access)', () => {
      it('should return value for existing key', async () => {
        const msg: TABMMessage = {
          'requested-key': 'mykey',
          'mykey': 'myvalue',
        };
        const result = await device.get('get', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe('myvalue');
        }
      });

      it('should pass for missing key', async () => {
        const msg: TABMMessage = {
          'requested-key': 'missing',
        };
        const result = await device.get('get', msg, {});

        expect(isPass(result)).toBe(true);
      });
    });

    describe('set', () => {
      it('should set value in message', async () => {
        const msg: TABMMessage = { key: 'setkey' };
        const result = await device.set('set', 'newvalue', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value['setkey']).toBe('newvalue');
        }
      });
    });
  });

  describe('MetaDevice', () => {
    let device: MetaDevice;

    beforeEach(() => {
      device = createMetaDevice();
    });

    describe('info', () => {
      it('should return device info', () => {
        const info = device.info();
        expect(info.exports).toContain('info');
        expect(info.exports).toContain('version');
        expect(info.exports).toContain('timestamp');
        expect(info.exports).toContain('random');
      });
    });

    describe('get - info', () => {
      it('should return system info', async () => {
        const result = await device.get('info', {}, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const info = result.value as TABMMessage;
          expect(info['name']).toBe('hyperbeam-js');
          expect(info['platform']).toBe('javascript');
          expect(['node', 'deno', 'browser']).toContain(info['runtime']);
        }
      });
    });

    describe('get - version', () => {
      it('should return version string', async () => {
        const result = await device.get('version', {}, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(typeof result.value).toBe('string');
        }
      });
    });

    describe('get - timestamp', () => {
      it('should return current timestamp', async () => {
        const before = Date.now();
        const result = await device.get('timestamp', {}, {});
        const after = Date.now();

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const ts = result.value as number;
          expect(ts).toBeGreaterThanOrEqual(before);
          expect(ts).toBeLessThanOrEqual(after);
        }
      });
    });

    describe('get - random', () => {
      it('should return random bytes', async () => {
        const result = await device.get('random', {}, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const bytes = result.value as Uint8Array;
          expect(bytes).toBeInstanceOf(Uint8Array);
          expect(bytes.length).toBe(32); // default
        }
      });

      it('should return specified number of bytes', async () => {
        const msg: TABMMessage = { count: 64 };
        const result = await device.get('random', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const bytes = result.value as Uint8Array;
          expect(bytes.length).toBe(64);
        }
      });
    });

    describe('get - uuid', () => {
      it('should return UUID string', async () => {
        const result = await device.get('uuid', {}, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const uuid = result.value as string;
          expect(uuid).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
        }
      });
    });

    describe('get - hash', () => {
      it('should compute hash of data', async () => {
        const msg: TABMMessage = {
          data: 'test data',
          algorithm: 'sha-256',
        };
        const result = await device.get('hash', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const hash = result.value as Uint8Array;
          expect(hash).toBeInstanceOf(Uint8Array);
          expect(hash.length).toBe(32);
        }
      });

      it('should return error without data', async () => {
        const result = await device.get('hash', {}, {});
        expect(isOk(result)).toBe(false);
      });
    });
  });

  describe('ProcessDevice', () => {
    let device: ProcessDevice;
    const store = createMemoryStore();

    beforeEach(() => {
      device = createProcessDevice(store);
    });

    describe('info', () => {
      it('should return device info', () => {
        const info = device.info();
        expect(info.exports).toContain('id');
        expect(info.exports).toContain('spawn');
        expect(info.exports).toContain('compute');
        expect(info.default).toBe('compute');
      });
    });

    describe('get - spawn', () => {
      it('should create new process', async () => {
        const msg: TABMMessage = {
          'execution-device': 'wasm@1.0',
          'scheduler': 'scheduler-address',
        };
        const result = await device.get('spawn', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const process = result.value as TABMMessage;
          expect(process['device']).toBe('process@1.0');
          expect(process['id']).toBeDefined();
        }
      });

      it('should return error without execution-device', async () => {
        const result = await device.get('spawn', {}, {});
        expect(isOk(result)).toBe(false);
      });
    });

    describe('get - slot', () => {
      it('should return current slot', async () => {
        // First spawn a process
        const spawnMsg: TABMMessage = {
          'execution-device': 'wasm@1.0',
        };
        const spawnResult = await device.get('spawn', spawnMsg, {});
        if (!isOk(spawnResult)) return;

        const processId = (spawnResult.value as TABMMessage)['id'] as string;

        const msg: TABMMessage = { process: processId };
        const result = await device.get('slot', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(0);
        }
      });
    });

    describe('get - state', () => {
      it('should return process state', async () => {
        // First spawn a process
        const spawnMsg: TABMMessage = {
          'execution-device': 'wasm@1.0',
        };
        const spawnResult = await device.get('spawn', spawnMsg, {});
        if (!isOk(spawnResult)) return;

        const processId = (spawnResult.value as TABMMessage)['id'] as string;

        const msg: TABMMessage = { process: processId };
        const result = await device.get('state', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toEqual({});
        }
      });
    });
  });

  describe('SchedulerDevice', () => {
    let device: SchedulerDevice;

    beforeEach(() => {
      device = createSchedulerDevice();
    });

    describe('info', () => {
      it('should return device info', () => {
        const info = device.info();
        expect(info.exports).toContain('slot');
        expect(info.exports).toContain('assign');
        expect(info.exports).toContain('hash-chain');
        expect(info.default).toBe('assign');
      });
    });

    describe('get - slot', () => {
      it('should return current slot for process', async () => {
        const msg: TABMMessage = { process: 'test-process-id' };
        const result = await device.get('slot', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(0);
        }
      });

      it('should return error without process', async () => {
        const result = await device.get('slot', {}, {});
        expect(isOk(result)).toBe(false);
      });
    });

    describe('get - next-slot', () => {
      it('should return next slot number', async () => {
        const msg: TABMMessage = { process: 'test-process-id' };
        const result = await device.get('next-slot', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(1);
        }
      });
    });

    describe('get - assign', () => {
      it('should create assignment', async () => {
        const msg: TABMMessage = {
          process: 'test-process-id',
          message: 'message-id-123',
        };
        const result = await device.get('assign', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const assignment = result.value as TABMMessage;
          expect(assignment['type']).toBe('assignment');
          expect(assignment['slot']).toBe(1);
          expect(assignment['process']).toBe('test-process-id');
        }
      });

      it('should increment slot on each assign', async () => {
        const msg: TABMMessage = {
          process: 'test-process-id',
          message: 'msg-1',
        };

        const result1 = await device.get('assign', msg, {});
        const result2 = await device.get('assign', { ...msg, message: 'msg-2' }, {});

        if (isOk(result1) && isOk(result2)) {
          expect((result1.value as TABMMessage)['slot']).toBe(1);
          expect((result2.value as TABMMessage)['slot']).toBe(2);
        }
      });
    });

    describe('get - hash-chain', () => {
      it('should return hash chain value', async () => {
        const msg: TABMMessage = { process: 'test-process-id' };
        const result = await device.get('hash-chain', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(typeof result.value).toBe('string');
        }
      });

      it('should update hash chain after assign', async () => {
        const processId = 'hash-chain-test';

        const before = await device.get('hash-chain', { process: processId }, {});

        await device.get('assign', {
          process: processId,
          message: 'test-msg',
        }, {});

        const after = await device.get('hash-chain', { process: processId }, {});

        if (isOk(before) && isOk(after)) {
          expect(before.value).not.toBe(after.value);
        }
      });
    });

    describe('get - current', () => {
      it('should return current scheduler state', async () => {
        const msg: TABMMessage = { process: 'current-test' };
        const result = await device.get('current', msg, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const state = result.value as TABMMessage;
          expect(state).toHaveProperty('slot');
          expect(state).toHaveProperty('epoch');
          expect(state).toHaveProperty('nonce');
          expect(state).toHaveProperty('hash-chain');
        }
      });
    });

    describe('clear', () => {
      it('should clear all states', async () => {
        // Create some state
        await device.get('assign', {
          process: 'clear-test',
          message: 'msg',
        }, {});

        device.clear();

        // Verify reset
        const result = await device.get('slot', { process: 'clear-test' }, {});
        if (isOk(result)) {
          expect(result.value).toBe(0);
        }
      });
    });
  });
});
