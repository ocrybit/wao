import { describe, it, expect } from 'vitest';
import {
  sha256,
  sha384,
  sha512,
  deepHash,
  dataItemDeepHash,
} from '../src/crypto/hash.js';
import {
  rsaPssSign,
  rsaPssVerify,
  generateRSAKeyPair,
  rsaAddress,
} from '../src/crypto/rsa.js';
import {
  ed25519Sign,
  ed25519Verify,
  generateED25519KeyPair,
  ed25519Address,
} from '../src/crypto/ed25519.js';
import { toBinary, arraysEqual, toBase64URL } from '../src/utils/encoding.js';

describe('Cryptographic Operations', () => {
  describe('sha256', () => {
    it('should hash empty input', async () => {
      const hash = await sha256(new Uint8Array([]));
      expect(hash.length).toBe(32);
    });

    it('should produce consistent hashes', async () => {
      const data = toBinary('Hello, World!');
      const hash1 = await sha256(data);
      const hash2 = await sha256(data);
      expect(arraysEqual(hash1, hash2)).toBe(true);
    });

    it('should produce different hashes for different input', async () => {
      const hash1 = await sha256(toBinary('hello'));
      const hash2 = await sha256(toBinary('world'));
      expect(arraysEqual(hash1, hash2)).toBe(false);
    });

    it('should match known SHA-256 value', async () => {
      // SHA-256 of empty string is known
      const hash = await sha256(new Uint8Array([]));
      const hex = Array.from(hash)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
      expect(hex).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    });
  });

  describe('sha384', () => {
    it('should produce 48-byte hash', async () => {
      const hash = await sha384(toBinary('test'));
      expect(hash.length).toBe(48);
    });

    it('should produce consistent hashes', async () => {
      const data = toBinary('test data');
      const hash1 = await sha384(data);
      const hash2 = await sha384(data);
      expect(arraysEqual(hash1, hash2)).toBe(true);
    });
  });

  describe('sha512', () => {
    it('should produce 64-byte hash', async () => {
      const hash = await sha512(toBinary('test'));
      expect(hash.length).toBe(64);
    });

    it('should produce consistent hashes', async () => {
      const data = toBinary('test data');
      const hash1 = await sha512(data);
      const hash2 = await sha512(data);
      expect(arraysEqual(hash1, hash2)).toBe(true);
    });
  });

  describe('deepHash', () => {
    it('should hash binary data', async () => {
      const data = toBinary('test data');
      const hash = await deepHash(data);
      expect(hash.length).toBe(48); // SHA-384 output
    });

    it('should hash nested arrays', async () => {
      const data = [toBinary('a'), toBinary('b'), toBinary('c')];
      const hash = await deepHash(data);
      expect(hash.length).toBe(48);
    });

    it('should hash deeply nested structures', async () => {
      const data = [
        toBinary('outer'),
        [toBinary('inner1'), toBinary('inner2')],
        toBinary('end'),
      ];
      const hash = await deepHash(data);
      expect(hash.length).toBe(48);
    });

    it('should produce different hashes for different structures', async () => {
      const hash1 = await deepHash([toBinary('a'), toBinary('b')]);
      const hash2 = await deepHash([toBinary('b'), toBinary('a')]);
      expect(arraysEqual(hash1, hash2)).toBe(false);
    });

    it('should produce consistent hashes', async () => {
      const data = [toBinary('test'), [toBinary('nested')]];
      const hash1 = await deepHash(data);
      const hash2 = await deepHash(data);
      expect(arraysEqual(hash1, hash2)).toBe(true);
    });
  });

  describe('dataItemDeepHash', () => {
    it('should compute deep hash for data item', async () => {
      const owner = new Uint8Array(512);
      const target = new Uint8Array(32);
      const anchor = new Uint8Array(32);
      const tags: [Uint8Array, Uint8Array][] = [
        [toBinary('key'), toBinary('value')],
      ];
      const data = toBinary('data');

      const hash = await dataItemDeepHash(owner, target, anchor, tags, data);
      expect(hash.length).toBe(48);
    });

    it('should produce consistent results', async () => {
      const owner = new Uint8Array(512).fill(1);
      const target = new Uint8Array(32).fill(2);
      const anchor = new Uint8Array(32).fill(3);
      const tags: [Uint8Array, Uint8Array][] = [];
      const data = toBinary('test');

      const hash1 = await dataItemDeepHash(owner, target, anchor, tags, data);
      const hash2 = await dataItemDeepHash(owner, target, anchor, tags, data);
      expect(arraysEqual(hash1, hash2)).toBe(true);
    });
  });

  describe('RSA Operations', () => {
    describe('generateRSAKeyPair', () => {
      it('should generate valid RSA-4096 key pair', async () => {
        const wallet = await generateRSAKeyPair();

        expect(wallet.kty).toBe('RSA');
        expect(wallet.n).toBeInstanceOf(Uint8Array);
        expect(wallet.e).toBeInstanceOf(Uint8Array);
        expect(wallet.d).toBeInstanceOf(Uint8Array);

        // RSA-4096 modulus should be 512 bytes
        expect(wallet.n.length).toBe(512);
      });
    });

    describe('rsaPssSign / rsaPssVerify', () => {
      it('should sign and verify data', async () => {
        const wallet = await generateRSAKeyPair();
        const data = toBinary('test message to sign');

        const signature = await rsaPssSign(wallet, data);
        expect(signature).toBeInstanceOf(Uint8Array);
        expect(signature.length).toBe(512); // RSA-4096 signature

        const valid = await rsaPssVerify(wallet, signature, data);
        expect(valid).toBe(true);
      });

      it('should fail verification with wrong data', async () => {
        const wallet = await generateRSAKeyPair();
        const data = toBinary('original message');

        const signature = await rsaPssSign(wallet, data);
        const valid = await rsaPssVerify(wallet, signature, toBinary('different message'));

        expect(valid).toBe(false);
      });

      it('should fail verification with wrong signature', async () => {
        const wallet = await generateRSAKeyPair();
        const data = toBinary('test message');

        const signature = await rsaPssSign(wallet, data);
        signature[0] ^= 0xFF; // corrupt signature

        const valid = await rsaPssVerify(wallet, signature, data);
        expect(valid).toBe(false);
      });

      it('should fail verification with wrong key', async () => {
        const wallet1 = await generateRSAKeyPair();
        const wallet2 = await generateRSAKeyPair();
        const data = toBinary('test message');

        const signature = await rsaPssSign(wallet1, data);
        const valid = await rsaPssVerify(wallet2, signature, data);

        expect(valid).toBe(false);
      });
    });

    describe('rsaAddress', () => {
      it('should compute address from wallet', async () => {
        const wallet = await generateRSAKeyPair();
        const address = await rsaAddress(wallet);

        expect(typeof address).toBe('string');
        expect(address.length).toBe(43); // base64url of 32 bytes
      });

      it('should produce consistent addresses', async () => {
        const wallet = await generateRSAKeyPair();
        const addr1 = await rsaAddress(wallet);
        const addr2 = await rsaAddress(wallet);

        expect(addr1).toBe(addr2);
      });

      it('should produce different addresses for different keys', async () => {
        const wallet1 = await generateRSAKeyPair();
        const wallet2 = await generateRSAKeyPair();

        const addr1 = await rsaAddress(wallet1);
        const addr2 = await rsaAddress(wallet2);

        expect(addr1).not.toBe(addr2);
      });
    });
  });

  describe('ED25519 Operations', () => {
    describe('generateED25519KeyPair', () => {
      it('should generate valid ED25519 key pair', async () => {
        const wallet = await generateED25519KeyPair();

        expect(wallet.kty).toBe('OKP');
        expect(wallet.crv).toBe('Ed25519');
        expect(wallet.x).toBeInstanceOf(Uint8Array);
        expect(wallet.d).toBeInstanceOf(Uint8Array);

        // ED25519 keys are 32 bytes
        expect(wallet.x.length).toBe(32);
        expect(wallet.d!.length).toBe(32);
      });
    });

    describe('ed25519Sign / ed25519Verify', () => {
      it('should sign and verify data', async () => {
        const wallet = await generateED25519KeyPair();
        const data = toBinary('test message to sign');

        const signature = await ed25519Sign(wallet, data);
        expect(signature).toBeInstanceOf(Uint8Array);
        expect(signature.length).toBe(64); // ED25519 signature

        const valid = await ed25519Verify(wallet, signature, data);
        expect(valid).toBe(true);
      });

      it('should fail verification with wrong data', async () => {
        const wallet = await generateED25519KeyPair();
        const data = toBinary('original message');

        const signature = await ed25519Sign(wallet, data);
        const valid = await ed25519Verify(wallet, signature, toBinary('different message'));

        expect(valid).toBe(false);
      });

      it('should fail verification with wrong signature', async () => {
        const wallet = await generateED25519KeyPair();
        const data = toBinary('test message');

        const signature = await ed25519Sign(wallet, data);
        signature[0] ^= 0xFF; // corrupt signature

        const valid = await ed25519Verify(wallet, signature, data);
        expect(valid).toBe(false);
      });

      it('should fail verification with wrong key', async () => {
        const wallet1 = await generateED25519KeyPair();
        const wallet2 = await generateED25519KeyPair();
        const data = toBinary('test message');

        const signature = await ed25519Sign(wallet1, data);
        const valid = await ed25519Verify(wallet2, signature, data);

        expect(valid).toBe(false);
      });
    });

    describe('ed25519Address', () => {
      it('should compute address from wallet', async () => {
        const wallet = await generateED25519KeyPair();
        const address = await ed25519Address(wallet);

        expect(typeof address).toBe('string');
        expect(address.length).toBe(43); // base64url of 32 bytes
      });

      it('should produce consistent addresses', async () => {
        const wallet = await generateED25519KeyPair();
        const addr1 = await ed25519Address(wallet);
        const addr2 = await ed25519Address(wallet);

        expect(addr1).toBe(addr2);
      });

      it('should produce different addresses for different keys', async () => {
        const wallet1 = await generateED25519KeyPair();
        const wallet2 = await generateED25519KeyPair();

        const addr1 = await ed25519Address(wallet1);
        const addr2 = await ed25519Address(wallet2);

        expect(addr1).not.toBe(addr2);
      });
    });
  });
});
