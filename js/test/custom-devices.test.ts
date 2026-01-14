import { describe, it, expect, beforeEach } from 'vitest';
import {
  buildDevice,
  simpleDevice,
  statefulDevice,
  composeDevices,
  ok,
  err,
  pass,
} from '../src/devices/builder.js';
import {
  createCounterDevice,
  createDoubleDevice,
  createSquareDevice,
  createMathDevice,
  createKVStoreDevice,
  createEchoDevice,
  createTransformDevice,
  createLoggerDevice,
} from '../src/devices/examples/index.js';
import { isOk, isPass } from '../src/types/result.js';
import type { Device } from '../src/types/device.js';
import type { TABMMessage } from '../src/types/message.js';

describe('Custom Device System', () => {
  describe('Device Builder', () => {
    describe('buildDevice', () => {
      it('should create a device with handlers', async () => {
        const device = buildDevice({
          name: 'test',
          version: '1.0',
          exports: ['greet', 'info'],
          handlers: {
            greet: async (msg) => ok(`Hello, ${msg['name'] ?? 'World'}!`),
            info: async () => ok({ name: 'test@1.0' }),
          },
        });

        const info = device.info();
        expect(info.exports).toContain('greet');
        expect(info.exports).toContain('info');

        const result = await device.get('greet', { name: 'Alice' }, {});
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe('Hello, Alice!');
        }
      });

      it('should return pass for unknown keys', async () => {
        const device = buildDevice({
          name: 'test',
          exports: ['known'],
          handlers: {
            known: async () => ok('found'),
          },
        });

        const result = await device.get('unknown', {}, {});
        expect(isPass(result)).toBe(true);
      });

      it('should support setters', async () => {
        const device = buildDevice({
          name: 'test',
          exports: ['value'],
          handlers: {
            value: async (msg) => ok(msg['stored']),
          },
          setters: {
            value: async (value, msg) => ok({ ...msg, stored: value }),
          },
        });

        if (device.set) {
          const result = await device.set('value', 42, {}, {});
          expect(isOk(result)).toBe(true);
          if (isOk(result)) {
            expect(result.value['stored']).toBe(42);
          }
        }
      });

      it('should support HTTP handler', async () => {
        const device = buildDevice({
          name: 'api',
          exports: ['handle'],
          handlers: {},
          httpHandler: async (msg, req) => ok({
            status: 200,
            body: 'OK',
          }),
        });

        if (device.handle) {
          const result = await device.handle({}, { path: '/test' }, {});
          expect(isOk(result)).toBe(true);
        }
      });
    });

    describe('simpleDevice', () => {
      it('should create device with just handlers', async () => {
        const device = simpleDevice('calc', {
          add: async (msg) => ok((msg['a'] as number) + (msg['b'] as number)),
          sub: async (msg) => ok((msg['a'] as number) - (msg['b'] as number)),
        });

        const result = await device.get('add', { a: 5, b: 3 }, {});
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(8);
        }
      });
    });

    describe('statefulDevice', () => {
      it('should maintain state across calls', async () => {
        const device = statefulDevice<{ count: number }>(
          'counter',
          { count: 0 },
          {
            exports: ['inc', 'get'],
            handlers: {
              inc: (state) => ({
                result: ok(state.count + 1),
                newState: { count: state.count + 1 },
              }),
              get: (state) => ({
                result: ok(state.count),
              }),
            },
          }
        );

        await device.get('inc', {}, {});
        await device.get('inc', {}, {});
        const result = await device.get('get', {}, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(2);
        }
      });

      it('should expose getState and setState', async () => {
        const device = statefulDevice<{ value: number }>(
          'test',
          { value: 10 },
          {
            exports: ['get'],
            handlers: {
              get: (state) => ({ result: ok(state.value) }),
            },
          }
        );

        expect(device.getState()).toEqual({ value: 10 });

        device.setState({ value: 99 });
        expect(device.getState()).toEqual({ value: 99 });

        device.reset();
        expect(device.getState()).toEqual({ value: 10 });
      });
    });

    describe('composeDevices', () => {
      it('should compose multiple devices', async () => {
        const device1 = simpleDevice('first', {
          a: async () => ok('from-first'),
        });

        const device2 = simpleDevice('second', {
          b: async () => ok('from-second'),
        });

        const composed = composeDevices('stack', [device1, device2]);

        const info = composed.info();
        expect(info.exports).toContain('a');
        expect(info.exports).toContain('b');

        const result1 = await composed.get('a', {}, {});
        const result2 = await composed.get('b', {}, {});

        expect(isOk(result1)).toBe(true);
        expect(isOk(result2)).toBe(true);
        if (isOk(result1)) expect(result1.value).toBe('from-first');
        if (isOk(result2)) expect(result2.value).toBe('from-second');
      });

      it('should try devices in order', async () => {
        const device1 = simpleDevice('first', {
          shared: async () => ok('first-wins'),
        });

        const device2 = simpleDevice('second', {
          shared: async () => ok('second-loses'),
        });

        const composed = composeDevices('stack', [device1, device2]);
        const result = await composed.get('shared', {}, {});

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe('first-wins');
        }
      });
    });
  });

  describe('Counter Device', () => {
    let counter: ReturnType<typeof createCounterDevice>;

    beforeEach(() => {
      counter = createCounterDevice(0);
    });

    it('should initialize with default value', async () => {
      const result = await counter.get('get', {}, {});
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(0);
      }
    });

    it('should increment', async () => {
      await counter.get('increment', {}, {});
      const result = await counter.get('get', {}, {});
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(1);
      }
    });

    it('should increment by amount', async () => {
      await counter.get('increment', { amount: 5 }, {});
      const result = await counter.get('get', {}, {});
      if (isOk(result)) {
        expect(result.value).toBe(5);
      }
    });

    it('should decrement', async () => {
      await counter.get('increment', { amount: 10 }, {});
      await counter.get('decrement', { amount: 3 }, {});
      const result = await counter.get('get', {}, {});
      if (isOk(result)) {
        expect(result.value).toBe(7);
      }
    });

    it('should reset', async () => {
      await counter.get('increment', { amount: 100 }, {});
      await counter.get('reset', {}, {});
      const result = await counter.get('get', {}, {});
      if (isOk(result)) {
        expect(result.value).toBe(0);
      }
    });

    it('should compute with action', async () => {
      const result = await counter.get('compute', { action: 'increment', amount: 5 }, {});
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        const msg = result.value as TABMMessage;
        expect(msg['value']).toBe(5);
        expect(msg['action']).toBe('incremented');
      }
    });

    it('should initialize with custom value', async () => {
      await counter.get('init', { value: 50 }, {});
      const result = await counter.get('get', {}, {});
      if (isOk(result)) {
        expect(result.value).toBe(50);
      }
    });
  });

  describe('Math Devices', () => {
    describe('Double Device', () => {
      const double = createDoubleDevice();

      it('should double values', async () => {
        const result = await double.get('compute', { value: 5 }, {});
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(10);
        }
      });

      it('should return error for non-numbers', async () => {
        const result = await double.get('compute', { value: 'hello' }, {});
        expect(isOk(result)).toBe(false);
      });
    });

    describe('Square Device', () => {
      const square = createSquareDevice();

      it('should square values', async () => {
        const result = await square.get('compute', { value: 7 }, {});
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value).toBe(49);
        }
      });
    });

    describe('Math Device', () => {
      const math = createMathDevice();

      it('should add', async () => {
        const result = await math.get('add', { a: 10, b: 5 }, {});
        if (isOk(result)) {
          expect(result.value).toBe(15);
        }
      });

      it('should subtract', async () => {
        const result = await math.get('subtract', { a: 10, b: 3 }, {});
        if (isOk(result)) {
          expect(result.value).toBe(7);
        }
      });

      it('should multiply', async () => {
        const result = await math.get('multiply', { a: 4, b: 7 }, {});
        if (isOk(result)) {
          expect(result.value).toBe(28);
        }
      });

      it('should divide', async () => {
        const result = await math.get('divide', { a: 20, b: 4 }, {});
        if (isOk(result)) {
          expect(result.value).toBe(5);
        }
      });

      it('should handle division by zero', async () => {
        const result = await math.get('divide', { a: 10, b: 0 }, {});
        expect(isOk(result)).toBe(false);
      });

      it('should compute power', async () => {
        const result = await math.get('pow', { base: 2, exponent: 10 }, {});
        if (isOk(result)) {
          expect(result.value).toBe(1024);
        }
      });

      it('should compute sqrt', async () => {
        const result = await math.get('sqrt', { value: 16 }, {});
        if (isOk(result)) {
          expect(result.value).toBe(4);
        }
      });

      it('should use compute dispatcher', async () => {
        const result = await math.get('compute', { op: 'double', a: 21 }, {});
        if (isOk(result)) {
          expect(result.value).toBe(42);
        }
      });
    });
  });

  describe('KV Store Device', () => {
    let kv: ReturnType<typeof createKVStoreDevice>;

    beforeEach(() => {
      kv = createKVStoreDevice();
    });

    it('should set and get values', async () => {
      await kv.get('set', { key: 'name', value: 'Alice' }, {});
      const result = await kv.get('get', { key: 'name' }, {});
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe('Alice');
      }
    });

    it('should return pass for missing keys', async () => {
      const result = await kv.get('get', { key: 'nonexistent' }, {});
      expect(isPass(result)).toBe(true);
    });

    it('should check key existence', async () => {
      await kv.get('set', { key: 'exists', value: true }, {});

      const hasResult = await kv.get('has', { key: 'exists' }, {});
      const notHasResult = await kv.get('has', { key: 'missing' }, {});

      if (isOk(hasResult)) expect(hasResult.value).toBe(true);
      if (isOk(notHasResult)) expect(notHasResult.value).toBe(false);
    });

    it('should delete keys', async () => {
      await kv.get('set', { key: 'temp', value: 'data' }, {});
      await kv.get('delete', { key: 'temp' }, {});
      const result = await kv.get('has', { key: 'temp' }, {});
      if (isOk(result)) {
        expect(result.value).toBe(false);
      }
    });

    it('should list keys', async () => {
      await kv.get('set', { key: 'a', value: 1 }, {});
      await kv.get('set', { key: 'b', value: 2 }, {});
      await kv.get('set', { key: 'c', value: 3 }, {});

      const result = await kv.get('keys', {}, {});
      if (isOk(result)) {
        const keys = result.value as string[];
        expect(keys).toContain('a');
        expect(keys).toContain('b');
        expect(keys).toContain('c');
      }
    });

    it('should report size', async () => {
      await kv.get('set', { key: 'x', value: 1 }, {});
      await kv.get('set', { key: 'y', value: 2 }, {});

      const result = await kv.get('size', {}, {});
      if (isOk(result)) {
        expect(result.value).toBe(2);
      }
    });

    it('should clear all data', async () => {
      await kv.get('set', { key: 'a', value: 1 }, {});
      await kv.get('set', { key: 'b', value: 2 }, {});
      await kv.get('clear', {}, {});

      const result = await kv.get('size', {}, {});
      if (isOk(result)) {
        expect(result.value).toBe(0);
      }
    });
  });

  describe('Echo Device', () => {
    const echo = createEchoDevice();

    it('should echo message', async () => {
      const msg = { hello: 'world', count: 42 };
      const result = await echo.get('echo', msg, {});
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toEqual(msg);
      }
    });

    it('should echo specific value', async () => {
      const result = await echo.get('value', { value: 'test' }, {});
      if (isOk(result)) {
        expect(result.value).toBe('test');
      }
    });

    it('should return pass for missing value', async () => {
      const result = await echo.get('value', {}, {});
      expect(isPass(result)).toBe(true);
    });

    it('should echo keys', async () => {
      const result = await echo.get('keys', { a: 1, b: 2, c: 3 }, {});
      if (isOk(result)) {
        expect(result.value).toEqual(['a', 'b', 'c']);
      }
    });

    it('should echo as JSON', async () => {
      const result = await echo.get('json', { test: true }, {});
      if (isOk(result)) {
        expect(result.value).toBe('{"test":true}');
      }
    });

    it('should return error on request', async () => {
      const result = await echo.get('error', { status: 404, message: 'Not found' }, {});
      expect(isOk(result)).toBe(false);
      if (!isOk(result) && 'error' in result) {
        expect(result.error.status).toBe(404);
        expect(result.error.message).toBe('Not found');
      }
    });

    it('should handle HTTP requests', async () => {
      if (echo.handle) {
        const result = await echo.handle({ test: 'msg' }, { path: '/echo' }, {});
        expect(isOk(result)).toBe(true);
      }
    });
  });

  describe('Transform Device', () => {
    it('should apply custom transforms', async () => {
      const transform = createTransformDevice({
        double: (msg) => ({ value: (msg['value'] as number) * 2 }),
        uppercase: (msg) => ({ value: String(msg['value']).toUpperCase() }),
      });

      const doubleResult = await transform.get('double', { value: 21 }, {});
      const upperResult = await transform.get('uppercase', { value: 'hello' }, {});

      if (isOk(doubleResult)) {
        expect((doubleResult.value as TABMMessage)['value']).toBe(42);
      }
      if (isOk(upperResult)) {
        expect((upperResult.value as TABMMessage)['value']).toBe('HELLO');
      }
    });
  });

  describe('Logger Device', () => {
    it('should log messages', async () => {
      const logs: unknown[] = [];
      const logger = createLoggerDevice((level, msg) => logs.push({ level, msg }));

      await logger.get('log', { level: 'info', message: 'test' }, {});

      expect(logs.length).toBe(1);
      expect(logs[0]).toEqual({ level: '[info]', msg: 'test' });
    });
  });

  describe('Device Stack Integration', () => {
    it('should compose counter with math device', async () => {
      const counter = createCounterDevice(10);
      const math = createMathDevice();
      const stack = composeDevices('counter-math', [counter, math]);

      // Use counter
      await stack.get('increment', { amount: 5 }, {});
      const count = await stack.get('get', {}, {});
      if (isOk(count)) {
        expect(count.value).toBe(15);
      }

      // Use math (via multiply since it's not exported by counter)
      const multiplied = await stack.get('multiply', { a: 6, b: 7 }, {});
      if (isOk(multiplied)) {
        expect(multiplied.value).toBe(42);
      }
    });

    it('should compose double and square for pipeline', async () => {
      const double = createDoubleDevice();
      const square = createSquareDevice();

      // Process: double(3) = 6, then square(6) = 36
      let value = 3;

      const doubleResult = await double.get('compute', { value }, {});
      if (isOk(doubleResult)) {
        value = doubleResult.value as number;
      }

      const squareResult = await square.get('compute', { value }, {});
      if (isOk(squareResult)) {
        expect(squareResult.value).toBe(36);
      }
    });
  });
});
