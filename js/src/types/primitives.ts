/**
 * AO-Core Primitive Types
 */

/** Binary data represented as Uint8Array */
export type Binary = Uint8Array;

/** Base64URL-encoded string (no padding) */
export type Base64URL = string;

/** 43-character base64url address (SHA-256 of public key) */
export type Address = Base64URL;

/** Unix timestamp in milliseconds */
export type Timestamp = number;

/** Signature algorithm types */
export type SignatureType = 1 | 2 | 3;
// 1 = RSA-4096 PSS SHA256
// 2 = ED25519
// 3 = Ethereum ECDSA (secp256k1)

/** Signature type configurations */
export const SIGNATURE_CONFIGS: Record<SignatureType, { sigSize: number; ownerSize: number }> = {
  1: { sigSize: 512, ownerSize: 512 },   // RSA-4096
  2: { sigSize: 64, ownerSize: 32 },     // ED25519
  3: { sigSize: 65, ownerSize: 65 }      // Ethereum
};

/** Type annotation suffixes for keys */
export type TypeSuffix =
  | '+integer'
  | '+float'
  | '+list'
  | '+map'
  | '+binary';

/** All valid type suffixes */
export const TYPE_SUFFIXES: TypeSuffix[] = [
  '+integer',
  '+float',
  '+list',
  '+map',
  '+binary'
];

/** Type annotation prefixes for values */
export type TypePrefix =
  | 'int'
  | 'integer'
  | 'float'
  | 'bin'
  | 'binary'
  | 'ref'
  | 'reference'
  | 'list'
  | 'term';
