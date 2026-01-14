/**
 * AO-Core Wallet Types
 */

import type { Binary } from './primitives.js';

/** RSA Wallet (JWK format) */
export interface RSAWallet {
  kty: 'RSA';
  n: Binary;      // Modulus
  e: Binary;      // Public exponent (65537)
  d?: Binary;     // Private exponent (optional, for signing)
  p?: Binary;     // First prime factor
  q?: Binary;     // Second prime factor
  dp?: Binary;    // d mod (p-1)
  dq?: Binary;    // d mod (q-1)
  qi?: Binary;    // q^-1 mod p
}

/** ED25519 Wallet */
export interface ED25519Wallet {
  kty: 'OKP';
  crv: 'Ed25519';
  x: Binary;      // Public key
  d?: Binary;     // Private key (optional)
}

/** Ethereum Wallet (secp256k1) */
export interface EthWallet {
  kty: 'EC';
  crv: 'secp256k1';
  x: Binary;      // Public key X coordinate
  y: Binary;      // Public key Y coordinate
  d?: Binary;     // Private key (optional)
}

/** Union of all wallet types */
export type Wallet = RSAWallet | ED25519Wallet | EthWallet;

/** Check if wallet is RSA */
export function isRSAWallet(wallet: Wallet): wallet is RSAWallet {
  return wallet.kty === 'RSA';
}

/** Check if wallet is ED25519 */
export function isED25519Wallet(wallet: Wallet): wallet is ED25519Wallet {
  return wallet.kty === 'OKP' && wallet.crv === 'Ed25519';
}

/** Check if wallet is Ethereum */
export function isEthWallet(wallet: Wallet): wallet is EthWallet {
  return wallet.kty === 'EC' && wallet.crv === 'secp256k1';
}

/** Check if wallet can sign (has private key) */
export function canSign(wallet: Wallet): boolean {
  return 'd' in wallet && wallet.d !== undefined;
}

/** Default RSA exponent (65537) */
export const RSA_EXPONENT = 65537;
export const RSA_EXPONENT_BYTES = new Uint8Array([0x01, 0x00, 0x01]);
