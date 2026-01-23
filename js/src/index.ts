/**
 * HyperBEAM JS - AO-Core Protocol Implementation
 *
 * A TypeScript implementation of the AO-Core protocol for decentralized
 * computation on Arweave.
 *
 * @packageDocumentation
 */

// Types
export * from './types/index.js';

// Utilities (exclude messageToTags/tagsToMessage which are also in codec)
export {
  toBinary,
  fromBinary,
  base64UrlEncode,
  base64UrlDecode,
  base64Encode,
  base64Decode,
  concat,
  arraysEqual,
  toBigEndian64,
  fromBigEndian64,
  encodeOptional,
  decodeOptional,
  encodeVarint,
  decodeVarint,
  hexEncode,
  hexDecode,
  toBase64URL,
  fromBase64URL,
} from './utils/encoding.js';

export {
  normalizeKey,
  keysEqual,
  isPrivateKey,
  extractTypeSuffix,
  stripTypeSuffix,
  findTypedKey,
  coerceToType,
  publicKeys,
  getKey,
  setKey,
  getKeys,
  hasKey,
  getTypeSuffix,
} from './utils/keys.js';

export {
  encodeTags,
  computeId,
  isBundle,
  getBundleItems,
  cloneMessage,
  deepCloneMessage,
  computeMessageId,
  computeUnsignedId,
} from './utils/message.js';

// Use utils version of messageToTags/tagsToMessage as the default export
export { messageToTags, tagsToMessage } from './utils/message.js';

// Cryptographic operations
export * from './crypto/index.js';

// Converge algorithm
export * from './converge/index.js';

// Store system
export * from './store/index.js';

// Codec system - export with aliases to avoid conflicts
export {
  encodeValue,
  decodeValue,
  encodeMessage,
  decodeMessage,
  TABMCodec,
  messageToTags as tabmMessageToTags,
  tagsToMessage as tabmTagsToMessage,
} from './codec/tabm.js';

export * from './codec/ans104.js';
export * from './codec/httpsig.js';

// Built-in devices
export * from './devices/index.js';

// Version
export const VERSION = '1.0.0';

// Re-export commonly used types at top level for convenience
export type {
  TABMMessage,
  TABMValue,
  StandardMessage,
  Assignment,
  Process,
  ProcessState,
  Tag,
} from './types/message.js';

export type {
  Device,
  DeviceInfo,
  DeviceLoader,
} from './types/device.js';

export type {
  Result,
  ResolveResult,
  ErrorInfo,
} from './types/result.js';

export type {
  Store,
  StoreConfig,
} from './types/store.js';

export type {
  Codec,
  CommitmentDevice,
} from './types/codec.js';

export type {
  Wallet,
  RSAWallet,
  ED25519Wallet,
} from './types/wallet.js';

export type {
  ResolveOptions,
} from './types/options.js';

export type {
  Binary,
  Base64URL,
  Address,
  Timestamp,
  SignatureType,
  TypeSuffix,
} from './types/primitives.js';
