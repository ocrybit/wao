import { describe, it, expect } from 'vitest';
import {
  encodeValue,
  decodeValue,
  encodeMessage,
  decodeMessage,
  TABMCodec,
  messageToTags as tabmMessageToTags,
  tagsToMessage as tabmTagsToMessage,
} from '../src/codec/tabm.js';
import {
  encodeDataItem,
  decodeDataItem,
  ANS104Codec,
  messageToDataItem,
  dataItemToMessage,
  getSignatureData,
} from '../src/codec/ans104.js';
import {
  HTTPSigCodec,
  parseStructuredParams,
  serializeStructuredParams,
  buildSignatureBase,
  createSignatureInput,
  createSignatureHeader,
  calculateContentDigest,
} from '../src/codec/httpsig.js';
import { isOk } from '../src/types/result.js';
import { toBinary, fromBinary, arraysEqual, toBase64URL } from '../src/utils/encoding.js';
import type { TABMMessage, Tag } from '../src/types/message.js';

describe('Codec System', () => {
  describe('TABM Codec', () => {
    describe('encodeValue / decodeValue', () => {
      it('should encode and decode null', () => {
        const encoded = encodeValue(null);
        const { value } = decodeValue(encoded);
        expect(value).toBe(null);
      });

      it('should encode and decode boolean', () => {
        const trueEncoded = encodeValue(true);
        const falseEncoded = encodeValue(false);

        expect(decodeValue(trueEncoded).value).toBe(true);
        expect(decodeValue(falseEncoded).value).toBe(false);
      });

      it('should encode and decode positive integers', () => {
        const values = [0, 1, 127, 128, 255, 1000, 1000000];
        for (const v of values) {
          const encoded = encodeValue(v);
          const { value } = decodeValue(encoded);
          expect(value).toBe(v);
        }
      });

      it('should encode and decode negative integers', () => {
        const values = [-1, -127, -128, -1000];
        for (const v of values) {
          const encoded = encodeValue(v);
          const { value } = decodeValue(encoded);
          expect(value).toBe(v);
        }
      });

      it('should encode and decode floats', () => {
        // Note: 1e10 is an integer in JS, so we use values that are definitely floats
        const values = [3.14, -2.5, 0.1, 1e-10, 123456.789, 0.123456789];
        for (const v of values) {
          const encoded = encodeValue(v);
          const { value } = decodeValue(encoded);
          expect(value).toBeCloseTo(v);
        }
      });

      it('should encode and decode strings', () => {
        const values = ['', 'hello', 'Hello, World!', '你好', '🌍'];
        for (const v of values) {
          const encoded = encodeValue(v);
          const { value } = decodeValue(encoded);
          expect(value).toBe(v);
        }
      });

      it('should encode and decode binary', () => {
        const data = new Uint8Array([1, 2, 3, 4, 5]);
        const encoded = encodeValue(data);
        const { value } = decodeValue(encoded);
        expect(arraysEqual(value as Uint8Array, data)).toBe(true);
      });

      it('should encode and decode arrays', () => {
        const arr = [1, 'two', true, null];
        const encoded = encodeValue(arr);
        const { value } = decodeValue(encoded);
        expect(value).toEqual(arr);
      });

      it('should encode and decode nested arrays', () => {
        const arr = [1, [2, [3, [4]]]];
        const encoded = encodeValue(arr);
        const { value } = decodeValue(encoded);
        expect(value).toEqual(arr);
      });

      it('should encode and decode objects (maps)', () => {
        const obj = { a: 1, b: 'hello', c: true };
        const encoded = encodeValue(obj);
        const { value } = decodeValue(encoded);
        expect(value).toEqual(obj);
      });

      it('should encode and decode nested objects', () => {
        const obj = {
          level1: {
            level2: {
              value: 42,
            },
          },
        };
        const encoded = encodeValue(obj);
        const { value } = decodeValue(encoded);
        expect(value).toEqual(obj);
      });
    });

    describe('encodeMessage / decodeMessage', () => {
      it('should encode and decode complete message', () => {
        const msg: TABMMessage = {
          action: 'transfer',
          amount: 100,
          recipient: 'address123',
          data: new Uint8Array([1, 2, 3]),
        };

        const encoded = encodeMessage(msg);
        const result = decodeMessage(encoded);

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value['action']).toBe('transfer');
          expect(result.value['amount']).toBe(100);
          expect(result.value['recipient']).toBe('address123');
        }
      });

      it('should reject non-map root', () => {
        const encoded = encodeValue([1, 2, 3]); // array, not map
        const result = decodeMessage(encoded);
        expect(isOk(result)).toBe(false);
      });
    });

    describe('TABMCodec', () => {
      it('should have correct metadata', () => {
        expect(TABMCodec.name).toBe('tabm');
        expect(TABMCodec.mimeType).toBe('application/x-tabm');
      });

      it('should encode via codec interface', () => {
        const msg: TABMMessage = { test: 'value' };
        const result = TABMCodec.encode(msg);
        expect(isOk(result)).toBe(true);
      });

      it('should decode via codec interface', () => {
        const msg: TABMMessage = { test: 'value' };
        const encodeResult = TABMCodec.encode(msg);
        if (!isOk(encodeResult)) return;

        const decodeResult = TABMCodec.decode(encodeResult.value);
        expect(isOk(decodeResult)).toBe(true);
        if (isOk(decodeResult)) {
          expect(decodeResult.value).toEqual(msg);
        }
      });
    });

    describe('tabmMessageToTags / tabmTagsToMessage', () => {
      it('should convert message to tags', () => {
        const msg: TABMMessage = {
          action: 'test',
          count: 42,
        };
        const tags = tabmMessageToTags(msg);
        expect(tags.length).toBeGreaterThan(0);
      });

      it('should convert tags back to message', () => {
        const tags: Tag[] = [
          { name: toBinary('action'), value: toBinary('test') },
          { name: toBinary('count+integer'), value: toBinary('42') },
        ];
        const msg = tabmTagsToMessage(tags);
        expect(msg['action']).toBe('test');
        expect(msg['count']).toBe(42);
      });
    });
  });

  describe('ANS-104 Codec', () => {
    describe('encodeDataItem / decodeDataItem', () => {
      it('should encode and decode data item', () => {
        const item = {
          signature: new Uint8Array(512).fill(1),
          owner: new Uint8Array(512).fill(2),
          target: new Uint8Array(32).fill(3),
          anchor: new Uint8Array(32).fill(4),
          tags: [
            { name: toBinary('key'), value: toBinary('value') },
          ],
          data: toBinary('test data'),
        };

        const encoded = encodeDataItem(item);
        expect(encoded).toBeInstanceOf(Uint8Array);

        const result = decodeDataItem(encoded);
        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(arraysEqual(result.value.signature, item.signature)).toBe(true);
          expect(arraysEqual(result.value.owner, item.owner)).toBe(true);
          expect(arraysEqual(result.value.data, item.data)).toBe(true);
        }
      });

      it('should handle empty tags', () => {
        const item = {
          signature: new Uint8Array(512),
          owner: new Uint8Array(512),
          tags: [],
          data: toBinary('data'),
        };

        const encoded = encodeDataItem(item);
        const result = decodeDataItem(encoded);

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value.tags.length).toBe(0);
        }
      });

      it('should handle missing optional fields', () => {
        const item = {
          signature: new Uint8Array(512),
          owner: new Uint8Array(512),
          tags: [],
          data: new Uint8Array(0),
        };

        const encoded = encodeDataItem(item);
        const result = decodeDataItem(encoded);

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value.target).toBeUndefined();
          expect(result.value.anchor).toBeUndefined();
        }
      });
    });

    describe('messageToDataItem / dataItemToMessage', () => {
      it('should convert message to data item', () => {
        const msg: TABMMessage = {
          signature: new Uint8Array(512),
          owner: new Uint8Array(512),
          action: 'test',
          body: toBinary('content'),
        };

        const item = messageToDataItem(msg);
        expect(item.tags.length).toBeGreaterThan(0);
        expect(arraysEqual(item.data, msg['body'] as Uint8Array)).toBe(true);
      });

      it('should convert data item to message', () => {
        const item = {
          signature: new Uint8Array(512).fill(1),
          owner: new Uint8Array(512).fill(2),
          tags: [
            { name: toBinary('action'), value: toBinary('test') },
          ],
          data: toBinary('content'),
        };

        const msg = dataItemToMessage(item);
        expect(msg['action']).toBe('test');
        expect(arraysEqual(msg['body'] as Uint8Array, item.data)).toBe(true);
      });
    });

    describe('getSignatureData', () => {
      it('should compute signature data', async () => {
        const owner = new Uint8Array(512);
        const target = new Uint8Array(32);
        const anchor = new Uint8Array(32);
        const tags = [
          { name: toBinary('key'), value: toBinary('value') },
        ];
        const data = toBinary('test');

        const sigData = await getSignatureData(owner, target, anchor, tags, data);
        expect(sigData).toBeInstanceOf(Uint8Array);
        expect(sigData.length).toBe(48); // deep hash output
      });
    });

    describe('ANS104Codec', () => {
      it('should have correct metadata', () => {
        expect(ANS104Codec.name).toBe('ans-104');
        expect(ANS104Codec.mimeType).toBe('application/x-ans-104');
      });

      it('should encode via codec interface', () => {
        const msg: TABMMessage = {
          signature: new Uint8Array(512),
          owner: new Uint8Array(512),
          test: 'value',
        };
        const result = ANS104Codec.encode(msg);
        expect(isOk(result)).toBe(true);
      });
    });
  });

  describe('HTTPSig Codec', () => {
    describe('parseStructuredParams / serializeStructuredParams', () => {
      it('should parse signature params', () => {
        const input = '("@method" "@path");alg="rsa-pss-sha256";keyid="test-key"';
        const params = parseStructuredParams(input);

        expect(params.components).toEqual(['@method', '@path']);
        expect(params.alg).toBe('rsa-pss-sha256');
        expect(params.keyid).toBe('test-key');
      });

      it('should parse numeric params', () => {
        const input = '("@method");created=1234567890;expires=9876543210';
        const params = parseStructuredParams(input);

        expect(params.created).toBe(1234567890);
        expect(params.expires).toBe(9876543210);
      });

      it('should serialize params back', () => {
        const params = {
          components: ['@method', '@path'],
          alg: 'ed25519',
          keyid: 'my-key',
        };
        const serialized = serializeStructuredParams(params);

        expect(serialized).toContain('"@method"');
        expect(serialized).toContain('"@path"');
        expect(serialized).toContain('alg="ed25519"');
        expect(serialized).toContain('keyid="my-key"');
      });
    });

    describe('buildSignatureBase', () => {
      it('should build signature base string', () => {
        const msg: TABMMessage = {
          method: 'POST',
          path: '/api/test',
          host: 'example.com',
        };
        const params = {
          components: ['@method', '@path', '@authority'],
        };

        const base = buildSignatureBase(msg, params);
        expect(base).toContain('"@method": POST');
        expect(base).toContain('"@path": /api/test');
        expect(base).toContain('@signature-params');
      });
    });

    describe('createSignatureInput / createSignatureHeader', () => {
      it('should create signature-input header', () => {
        const params = {
          components: ['@method'],
          alg: 'ed25519',
        };
        const input = createSignatureInput('sig1', params);

        expect(input).toMatch(/^sig1=\(/);
        expect(input).toContain('@method');
      });

      it('should create signature header', () => {
        const sig = new Uint8Array([1, 2, 3, 4]);
        const header = createSignatureHeader('sig1', sig);

        expect(header).toMatch(/^sig1=:/);
        expect(header).toMatch(/:$/);
      });
    });

    describe('calculateContentDigest', () => {
      it('should calculate content digest', async () => {
        const body = toBinary('request body');
        const digest = await calculateContentDigest(body);

        expect(digest).toMatch(/^sha-256=:/);
        expect(digest).toMatch(/:$/);
      });
    });

    describe('HTTPSigCodec', () => {
      it('should have correct metadata', () => {
        expect(HTTPSigCodec.name).toBe('httpsig');
        expect(HTTPSigCodec.mimeType).toBe('message/http');
      });

      it('should encode message to HTTP format', () => {
        const msg: TABMMessage = {
          method: 'GET',
          path: '/test',
          host: 'example.com',
        };
        const result = HTTPSigCodec.encode(msg);

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          const text = fromBinary(result.value);
          expect(text).toContain('GET /test HTTP/1.1');
          expect(text).toContain('host: example.com');
        }
      });

      it('should decode HTTP format to message', () => {
        const httpText = 'GET /test HTTP/1.1\r\nhost: example.com\r\n\r\n';
        const result = HTTPSigCodec.decode(toBinary(httpText));

        expect(isOk(result)).toBe(true);
        if (isOk(result)) {
          expect(result.value['method']).toBe('GET');
          expect(result.value['path']).toBe('/test');
          expect(result.value['host']).toBe('example.com');
        }
      });

      it('should handle body in HTTP message', () => {
        const msg: TABMMessage = {
          method: 'POST',
          path: '/api',
          'content-type': 'text/plain',
          body: 'request body content',
        };
        const encodeResult = HTTPSigCodec.encode(msg);

        expect(isOk(encodeResult)).toBe(true);
        if (isOk(encodeResult)) {
          const text = fromBinary(encodeResult.value);
          expect(text).toContain('request body content');
        }
      });
    });
  });
});
