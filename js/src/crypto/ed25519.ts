/**
 * ED25519 cryptographic operations for AO-Core
 */

import type { Binary } from '../types/index.js';
import type { ED25519Wallet } from '../types/wallet.js';
import { base64UrlEncode, base64UrlDecode } from '../utils/encoding.js';
import { sha256 } from './hash.js';

/** Sign data with ED25519 */
export async function ed25519Sign(
  wallet: ED25519Wallet,
  data: Binary
): Promise<Binary> {
  if (!wallet.d) {
    throw new Error('Wallet does not have private key');
  }

  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'OKP',
      crv: 'Ed25519',
      x: base64UrlEncode(wallet.x),
      d: base64UrlEncode(wallet.d)
    },
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('Ed25519', privateKey, data as BufferSource);
  return new Uint8Array(signature);
}

/** Verify ED25519 signature */
export async function ed25519Verify(
  wallet: ED25519Wallet,
  signature: Binary,
  data: Binary
): Promise<boolean> {
  try {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      {
        kty: 'OKP',
        crv: 'Ed25519',
        x: base64UrlEncode(wallet.x)
      },
      { name: 'Ed25519' },
      false,
      ['verify']
    );

    return crypto.subtle.verify('Ed25519', publicKey, signature as BufferSource, data as BufferSource);
  } catch {
    return false;
  }
}

/** Generate ED25519 key pair */
export async function generateED25519KeyPair(): Promise<ED25519Wallet> {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'Ed25519' },
    true,
    ['sign', 'verify']
  ) as CryptoKeyPair;

  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  return {
    kty: 'OKP',
    crv: 'Ed25519',
    x: base64UrlDecode(privateJwk.x!),
    d: base64UrlDecode(privateJwk.d!)
  };
}

/** Derive address from ED25519 wallet (SHA-256 of public key) */
export async function ed25519Address(wallet: ED25519Wallet): Promise<string> {
  const hash = await sha256(wallet.x);
  return base64UrlEncode(hash);
}
