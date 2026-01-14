/**
 * RSA-PSS cryptographic operations for AO-Core
 */

import type { Binary } from '../types/index.js';
import type { RSAWallet } from '../types/wallet.js';
import { base64UrlEncode, base64UrlDecode } from '../utils/encoding.js';
import { sha256 } from './hash.js';

/** RSA-PSS algorithm parameters */
const RSA_PSS_PARAMS = {
  name: 'RSA-PSS',
  hash: 'SHA-256',
  saltLength: 32
};

/** Import RSA private key for signing */
async function importPrivateKey(wallet: RSAWallet): Promise<CryptoKey> {
  if (!wallet.d) {
    throw new Error('Wallet does not have private key');
  }

  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'RSA',
      n: base64UrlEncode(wallet.n),
      e: base64UrlEncode(wallet.e),
      d: base64UrlEncode(wallet.d),
      p: wallet.p ? base64UrlEncode(wallet.p) : undefined,
      q: wallet.q ? base64UrlEncode(wallet.q) : undefined,
      dp: wallet.dp ? base64UrlEncode(wallet.dp) : undefined,
      dq: wallet.dq ? base64UrlEncode(wallet.dq) : undefined,
      qi: wallet.qi ? base64UrlEncode(wallet.qi) : undefined
    },
    { name: 'RSA-PSS', hash: 'SHA-256' },
    false,
    ['sign']
  );
}

/** Import RSA public key for verification */
async function importPublicKey(wallet: RSAWallet): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'jwk',
    {
      kty: 'RSA',
      n: base64UrlEncode(wallet.n),
      e: base64UrlEncode(wallet.e)
    },
    { name: 'RSA-PSS', hash: 'SHA-256' },
    false,
    ['verify']
  );
}

/** Sign data with RSA-PSS */
export async function rsaPssSign(
  wallet: RSAWallet,
  data: Binary
): Promise<Binary> {
  const privateKey = await importPrivateKey(wallet);
  const signature = await crypto.subtle.sign(
    RSA_PSS_PARAMS,
    privateKey,
    data as BufferSource
  );
  return new Uint8Array(signature);
}

/** Verify RSA-PSS signature */
export async function rsaPssVerify(
  wallet: RSAWallet,
  signature: Binary,
  data: Binary
): Promise<boolean> {
  try {
    const publicKey = await importPublicKey(wallet);
    return crypto.subtle.verify(
      RSA_PSS_PARAMS,
      publicKey,
      signature as BufferSource,
      data as BufferSource
    );
  } catch {
    return false;
  }
}

/** Generate RSA-4096 key pair */
export async function generateRSAKeyPair(): Promise<RSAWallet> {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: 'RSA-PSS',
      modulusLength: 4096,
      publicExponent: new Uint8Array([0x01, 0x00, 0x01]),
      hash: 'SHA-256'
    },
    true,
    ['sign', 'verify']
  );

  const privateJwk = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  return {
    kty: 'RSA',
    n: base64UrlDecode(privateJwk.n!),
    e: base64UrlDecode(privateJwk.e!),
    d: base64UrlDecode(privateJwk.d!),
    p: base64UrlDecode(privateJwk.p!),
    q: base64UrlDecode(privateJwk.q!),
    dp: base64UrlDecode(privateJwk.dp!),
    dq: base64UrlDecode(privateJwk.dq!),
    qi: base64UrlDecode(privateJwk.qi!)
  };
}

/** Derive address from RSA wallet (SHA-256 of modulus) */
export async function rsaAddress(wallet: RSAWallet): Promise<string> {
  const hash = await sha256(wallet.n);
  return base64UrlEncode(hash);
}
