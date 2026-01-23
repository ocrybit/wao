# AO-Core Protocol Specification v1.0

This document provides a complete specification for implementing HyperBEAM, the reference implementation of the AO-Core protocol. It is designed to enable implementation in any programming language using TypeScript interfaces as the canonical type definitions.

## Table of Contents

### Main Sections
1. [Overview](#1-overview)
2. [Core Data Types](#2-core-data-types)
3. [Message Format (TABM)](#3-message-format-tabm)
4. [Key Resolution](#4-key-resolution)
5. [Device System](#5-device-system)
6. [Converge Algorithm](#6-converge-algorithm)
7. [Store System](#7-store-system)
8. [Codec System](#8-codec-system)
9. [Commitment System](#9-commitment-system)
10. [Cryptographic Operations](#10-cryptographic-operations)
11. [Scheduler and Process Management](#11-scheduler-and-process-management)
12. [HTTP API](#12-http-api)
13. [Built-in Devices](#13-built-in-devices)
14. [Payment System](#14-payment-system)

### Appendices
- [A: Message Examples](#appendix-a-message-examples)
- [B: Error Codes](#appendix-b-error-codes)
- [C: Protocol Constants](#appendix-c-protocol-constants)
- [D: Deep Hash Algorithm](#appendix-d-deep-hash-algorithm)
- [E: Structured Fields (RFC-8941)](#appendix-e-structured-fields-rfc-8941)
- [F: Implementation Checklist](#appendix-f-implementation-checklist)

---

## 1. Overview

AO-Core is a decentralized computation protocol built on message passing and content-addressed storage. HyperBEAM is the Erlang reference implementation.

### 1.1 Design Principles

- **Message-Centric**: All state and computation expressed as messages
- **Content-Addressed**: Messages identified by cryptographic hash
- **Device-Based Computation**: Pluggable devices provide functionality
- **Lazy Evaluation**: Computation happens on-demand via path resolution
- **Deterministic**: Same inputs produce same outputs (for hashpath verification)

### 1.2 Architecture Layers

```
┌─────────────────────────────────────────────────────────────┐
│                      HTTP API Layer                         │
├─────────────────────────────────────────────────────────────┤
│                    Converge Algorithm                       │
├─────────────────────────────────────────────────────────────┤
│                     Device System                           │
├─────────────────────────────────────────────────────────────┤
│    Message Layer (TABM)    │    Store Layer (Pluggable)    │
├─────────────────────────────────────────────────────────────┤
│              Cryptographic Primitives (Arweave)             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Core Data Types

### 2.1 Primitive Types

```typescript
// Base types
type Binary = Uint8Array;
type Base64URL = string;  // Base64URL-encoded string (no padding)
type Address = Base64URL; // 43-character base64url (SHA-256 of public key)
type Timestamp = number;  // Unix milliseconds

// Signature types
type SignatureType = 1 | 2 | 3;
// 1 = RSA-4096 PSS SHA256
// 2 = ED25519
// 3 = Ethereum ECDSA (secp256k1)
```

### 2.2 Message Types

```typescript
// Base TABM value types
type TABMValue =
  | string
  | number
  | boolean
  | Binary
  | TABMMessage
  | TABMValue[]
  | null;

// Core message structure
interface TABMMessage {
  [key: string]: TABMValue;
}

// Type annotation suffixes for keys
type TypeSuffix =
  | '+integer'   // Number is integer
  | '+float'     // Number is float
  | '+list'      // Value is array
  | '+map'       // Value is nested message
  | '+binary';   // Value is binary

// Standard message keys
interface StandardMessage extends TABMMessage {
  // Identity
  'id'?: Base64URL;
  'unsigned-id'?: Base64URL;

  // Device configuration
  'device'?: string;           // e.g., "process@1.0"
  'device-stack'?: string[];   // e.g., ["dev1@1.0", "dev2@1.0"]

  // HTTP-like fields
  'path'?: string;
  'method'?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  'body'?: Binary | TABMMessage;
  'status'?: number;

  // Cryptographic fields
  'signature'?: Binary;
  'signature-input'?: string;
  'owner'?: Binary;
  'target'?: Binary;
  'anchor'?: Binary;

  // Process fields
  'process'?: Base64URL;
  'slot'?: number;
  'timestamp'?: Timestamp;
  'block-height'?: number;

  // Scheduling
  'scheduler'?: Address;
  'nonce'?: number;
  'hash-chain'?: Base64URL;
  'epoch'?: number;
}
```

### 2.3 Result Types

```typescript
// Error information
interface ErrorInfo {
  status: number;
  message: string;
  details?: unknown;
}

// Result type for operations
type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: ErrorInfo };

// Special return values for device resolution
type ResolveResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: ErrorInfo }
  | { pass: true };    // Delegate to next device in stack
```

### 2.4 Wallet Types

```typescript
// RSA Wallet (JWK format)
interface RSAWallet {
  kty: 'RSA';
  n: Binary;     // Modulus
  e: Binary;     // Public exponent (65537)
  d?: Binary;    // Private exponent (optional, for signing)
  p?: Binary;    // First prime factor
  q?: Binary;    // Second prime factor
  dp?: Binary;   // d mod (p-1)
  dq?: Binary;   // d mod (q-1)
  qi?: Binary;   // q^-1 mod p
}

// ED25519 Wallet
interface ED25519Wallet {
  kty: 'OKP';
  crv: 'Ed25519';
  x: Binary;     // Public key
  d?: Binary;    // Private key (optional)
}

// Ethereum Wallet
interface EthWallet {
  kty: 'EC';
  crv: 'secp256k1';
  x: Binary;     // Public key X coordinate
  y: Binary;     // Public key Y coordinate
  d?: Binary;    // Private key (optional)
}

type Wallet = RSAWallet | ED25519Wallet | EthWallet;
```

### 2.5 Options Types

```typescript
interface ResolveOptions {
  // Cryptographic
  hashpath?: Binary;
  wallet?: Wallet;           // Public key for verification
  privWallet?: Wallet;       // Private key for signing

  // Caching
  cacheControl?: 'no-cache' | 'no-store' | 'only-if-cached' | string;

  // Storage
  store?: StoreConfig | StoreConfig[];

  // Execution
  errorStrategy?: 'throw' | 'return' | 'log';
  timeout?: number;          // Milliseconds
  spawnWorker?: boolean;     // Enable parallel execution

  // Device resolution
  device?: string;
  deviceStack?: string[];
}
```

---

## 3. Message Format (TABM)

TABM (Type-Annotated Binary Message) is the native message format, built on the ANS-104 data item specification from Arweave.

### 3.1 Binary Structure

```typescript
interface TABMBinaryLayout {
  signatureType: number;     // 2 bytes, big-endian
  signature: Binary;         // Variable size based on type
  owner: Binary;             // Variable size based on type
  target: Binary;            // 0 or 32 bytes
  anchor: Binary;            // 0 or 32 bytes
  tagsCount: bigint;         // 8 bytes, big-endian
  tagsBytesSize: bigint;     // 8 bytes, big-endian
  tags: Binary;              // AVS format
  data: Binary;              // Remaining bytes
}

// Signature type configurations
const SIGNATURE_CONFIGS: Record<SignatureType, {sigSize: number; ownerSize: number}> = {
  1: { sigSize: 512, ownerSize: 512 },   // RSA-4096
  2: { sigSize: 64, ownerSize: 32 },     // ED25519
  3: { sigSize: 65, ownerSize: 65 }      // Ethereum
};
```

### 3.2 Tag Encoding (AVS Format)

Tags use Apache Avro Variable-length encoding:

```typescript
interface Tag {
  name: Binary;
  value: Binary;
}

// Encode varint (AVS format)
function encodeVarint(value: number): Binary {
  const bytes: number[] = [];
  while (value > 127) {
    bytes.push((value & 0x7F) | 0x80);
    value >>>= 7;
  }
  bytes.push(value);
  return new Uint8Array(bytes);
}

// Decode varint
function decodeVarint(data: Binary, offset: number): [number, number] {
  let value = 0;
  let shift = 0;
  let pos = offset;

  while (true) {
    const byte = data[pos++];
    value |= (byte & 0x7F) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }

  return [value, pos];
}

// Encode tags to AVS binary
function encodeTags(tags: Tag[]): Binary {
  const parts: Binary[] = [];
  for (const tag of tags) {
    parts.push(encodeVarint(tag.name.length));
    parts.push(tag.name);
    parts.push(encodeVarint(tag.value.length));
    parts.push(tag.value);
  }
  return concat(parts);
}
```

### 3.3 Type Annotations

Values can be type-annotated using prefix format:

```typescript
type TypePrefix = 'int' | 'integer' | 'float' | 'bin' | 'binary' |
                  'ref' | 'reference' | 'list' | 'term';

// Parse type-annotated value
function parseTypedValue(value: string): TABMValue {
  const colonIndex = value.indexOf(':');
  if (colonIndex === -1) return value;

  const type = value.substring(0, colonIndex).toLowerCase();
  const data = value.substring(colonIndex + 1);

  switch (type) {
    case 'int':
    case 'integer':
      return parseInt(data, 10);
    case 'float':
      return parseFloat(data);
    case 'bin':
    case 'binary':
      return base64UrlDecode(data);
    case 'ref':
    case 'reference':
      return data;  // Keep as base64url string
    case 'list':
      return parseStructuredList(data);
    case 'term':
      return data;  // Implementation-specific
    default:
      return value;
  }
}
```

### 3.4 Type Suffix System

Keys can have type suffixes that indicate the expected type:

```typescript
// Extract type suffix from key
function extractTypeSuffix(key: string): TypeSuffix | null {
  const suffixes: TypeSuffix[] = ['+integer', '+float', '+list', '+map', '+binary'];
  for (const suffix of suffixes) {
    if (key.endsWith(suffix)) return suffix;
  }
  return null;
}

// Find key with any type suffix variant
function findTypedKey(msg: TABMMessage, key: string): string | null {
  const suffixes = ['', '+integer', '+float', '+binary', '+list', '+map'];
  for (const suffix of suffixes) {
    const typedKey = key + suffix;
    if (typedKey in msg) return typedKey;
  }
  return null;
}

// Coerce value based on type suffix
function coerceToType(key: string, value: unknown): TABMValue {
  const suffix = extractTypeSuffix(key);
  switch (suffix) {
    case '+integer': return Math.floor(Number(value));
    case '+float': return Number(value);
    case '+binary': return toBinary(value);
    case '+list': return Array.isArray(value) ? value : [value];
    case '+map': return toMessage(value);
    default: return value as TABMValue;
  }
}
```

### 3.5 Message ID Calculation

```typescript
async function computeId(msg: TABMMessage, includeSig: boolean): Promise<Base64URL> {
  const parts: Binary[] = [];

  // Get owner, target, anchor, tags, data
  const owner = msg['owner'] as Binary || new Uint8Array();
  const target = msg['target'] as Binary || new Uint8Array();
  const anchor = msg['anchor'] as Binary || new Uint8Array();
  const tags = messageToTags(msg);
  const data = msg['body'] as Binary || new Uint8Array();

  // Compute unsigned ID
  const unsignedId = await sha256(concat([
    await sha256(owner),
    await sha256(target),
    await sha256(anchor),
    await sha256(encodeTags(tags)),
    await sha256(data)
  ]));

  if (!includeSig) {
    return base64UrlEncode(unsignedId);
  }

  // Compute signed ID
  const signature = msg['signature'] as Binary || new Uint8Array();
  const signedId = await sha256(concat([
    await sha256(signature),
    unsignedId
  ]));

  return base64UrlEncode(signedId);
}
```

### 3.6 Nested Messages (Bundles)

```typescript
interface BundleManifest {
  manifest: 'arweave/paths';
  version: '0.2.0';
  paths: Record<string, { id: Base64URL }>;
}

// Check if message is a bundle
function isBundle(msg: TABMMessage): boolean {
  const body = msg['body'];
  return typeof body === 'object' && body !== null && !ArrayBuffer.isView(body);
}

// Get bundle items
function getBundleItems(msg: TABMMessage): TABMMessage[] {
  const body = msg['body'] as TABMMessage;
  const items: TABMMessage[] = [];

  let index = 1;
  while (String(index) in body) {
    items.push(body[String(index)] as TABMMessage);
    index++;
  }

  return items;
}
```

---

## 4. Key Resolution

### 4.1 Key Normalization

Keys are normalized for comparison:

```typescript
function normalizeKey(key: string): string {
  // Convert to lowercase
  let normalized = key.toLowerCase();
  // Replace hyphens with underscores
  normalized = normalized.replace(/-/g, '_');
  // Remove type suffix for comparison
  const suffixes = ['+integer', '+float', '+binary', '+list', '+map'];
  for (const suffix of suffixes) {
    if (normalized.endsWith(suffix)) {
      normalized = normalized.slice(0, -suffix.length);
      break;
    }
  }
  return normalized;
}

// Keys are equivalent if normalized forms match
function keysEqual(a: string, b: string): boolean {
  return normalizeKey(a) === normalizeKey(b);
}
```

### 4.2 Private Keys

Keys starting with `priv/` are private:

```typescript
function isPrivateKey(key: string): boolean {
  return key.startsWith('priv/') || key.startsWith('priv_');
}

// Filter out private keys
function publicKeys(msg: TABMMessage): TABMMessage {
  const result: TABMMessage = {};
  for (const [key, value] of Object.entries(msg)) {
    if (!isPrivateKey(key)) {
      result[key] = value;
    }
  }
  return result;
}
```

### 4.3 Special Keys

```typescript
type SpecialKey =
  | 'id'           // Message's signed ID
  | 'unsigned-id'  // Message's unsigned ID
  | 'hashpath'     // Current execution hashpath
  | 'keys'         // List of all keys
  | 'owner'        // Message owner's address
  | 'target'       // Message target address
  | 'anchor'       // Message anchor
  | 'signature'    // Message signature
  | 'timestamp'    // Message timestamp
  | 'nonce';       // Message nonce

// Resolve special key
async function resolveSpecialKey(
  key: SpecialKey,
  msg: TABMMessage,
  opts: ResolveOptions
): Promise<TABMValue> {
  switch (key) {
    case 'id':
      return computeId(msg, true);
    case 'unsigned-id':
      return computeId(msg, false);
    case 'hashpath':
      return opts.hashpath || null;
    case 'keys':
      return Object.keys(msg);
    default:
      return msg[key] ?? null;
  }
}
```

---

## 5. Device System

### 5.1 Device Interface

```typescript
interface DeviceInfo {
  exports: string[];           // Exported functions
  excludes?: string[];         // Hidden functions
  default?: string;            // Default function for path resolution
  grouper?: string;            // Function for grouping related calls
  handler?: string;            // HTTP request handler function
}

interface Device {
  // Get device metadata
  info(msg?: TABMMessage): DeviceInfo;

  // Optional: list of dependencies
  uses?(): string[];

  // Resolve a key on this device
  get(
    key: string,
    msg: TABMMessage,
    opts: ResolveOptions
  ): Promise<ResolveResult<TABMValue>>;

  // Set a key value (optional)
  set?(
    key: string,
    value: TABMValue,
    msg: TABMMessage,
    opts: ResolveOptions
  ): Promise<Result<TABMMessage>>;

  // Handle HTTP request (optional)
  handle?(
    msg: TABMMessage,
    req: TABMMessage,
    opts: ResolveOptions
  ): Promise<Result<TABMMessage>>;
}
```

### 5.2 Device Identification

```typescript
interface DeviceIdentifier {
  name: string;
  version?: string;
}

// Parse device string: "name@version" or just "name"
function parseDeviceId(deviceStr: string): DeviceIdentifier {
  const atIndex = deviceStr.indexOf('@');
  if (atIndex === -1) {
    return { name: deviceStr };
  }
  return {
    name: deviceStr.substring(0, atIndex),
    version: deviceStr.substring(atIndex + 1)
  };
}

// Module naming convention: dev_<name> -> name@version
function deviceToModule(device: DeviceIdentifier): string {
  return `dev_${device.name.replace(/-/g, '_')}`;
}
```

### 5.3 Device Stack

Messages can specify multiple devices using the `device-stack` key:

```typescript
interface DeviceStackMessage extends TABMMessage {
  'device': string;           // Primary device
  'device-stack'?: string[];  // Fallback devices
}

// Resolve with device stack fallback
async function resolveWithStack(
  key: string,
  msg: TABMMessage,
  opts: ResolveOptions
): Promise<ResolveResult<TABMValue>> {
  // 1. Try primary device
  const primaryDevice = msg['device'] as string;
  if (primaryDevice) {
    const device = await loadDevice(primaryDevice, opts);
    const result = await device.get(key, msg, opts);

    if (result.ok) return result;
    if ('pass' in result && result.pass) {
      // Continue to device stack
    } else if (!result.ok) {
      return result;  // Return error
    }
  }

  // 2. Try device stack
  const stack = msg['device-stack'] as string[] | undefined;
  if (stack && stack.length > 0) {
    for (const deviceName of stack) {
      const device = await loadDevice(deviceName, opts);
      if (device) {
        const result = await device.get(key, msg, opts);
        if (result.ok) return result;
        if (!('pass' in result)) break;  // Stop on error
      }
    }
  }

  return { ok: false, error: { status: 404, message: `Key not found: ${key}` } };
}
```

### 5.4 Pass-Through Results

Devices can delegate to the next device in the stack:

```typescript
// Example device that handles specific keys only
const ExampleDevice: Device = {
  info: () => ({ exports: ['id', 'keys'] }),

  async get(key, msg, opts) {
    switch (key) {
      case 'id':
        return { ok: true, value: await computeId(msg, true) };
      case 'unsigned-id':
        return { ok: true, value: await computeId(msg, false) };
      case 'keys':
        return { ok: true, value: Object.keys(msg) };
      default:
        return { pass: true };  // Let another device handle it
    }
  }
};
```

---

## 6. Converge Algorithm

The Converge algorithm is the core execution engine that resolves paths to values.

### 6.1 Resolution Stages

```typescript
enum ConvergeStage {
  INITIALIZE = 'initialize',
  CACHE_LOOKUP = 'cache_lookup',
  DEVICE_LOOKUP = 'device_lookup',
  RESOLVE_KEYS = 'resolve_keys',
  EXECUTE = 'execute',
  POSTPROCESS = 'postprocess'
}

interface ConvergeContext {
  stage: ConvergeStage;
  message: TABMMessage;
  path: string[];
  opts: ResolveOptions;
  hashpath: Binary;
  cache?: StoreConfig;
}
```

### 6.2 Path Resolution

```typescript
// Split path into segments
function splitPath(path: string): string[] {
  if (!path || path === '/') return [];
  return path.split('/').filter(s => s.length > 0);
}

// Main resolve function
async function resolve(
  msg: TABMMessage,
  path: string | string[],
  opts: ResolveOptions
): Promise<Result<TABMValue>> {
  const segments = typeof path === 'string' ? splitPath(path) : path;

  if (segments.length === 0) {
    return { ok: true, value: msg };
  }

  const [key, ...rest] = segments;

  // Check for device call syntax: ~device@version/function
  if (key.startsWith('~')) {
    const deviceStr = key.substring(1);
    const device = await loadDevice(deviceStr, opts);
    if (rest.length === 0) {
      return { ok: true, value: device.info() };
    }
    const [func, ...funcRest] = rest;
    const result = await device.get(func, msg, opts);
    if (!result.ok || 'pass' in result) {
      return { ok: false, error: { status: 404, message: `Function not found: ${func}` } };
    }
    if (funcRest.length === 0) {
      return result;
    }
    if (typeof result.value === 'object' && result.value !== null) {
      return resolve(result.value as TABMMessage, funcRest, opts);
    }
    return result;
  }

  // Normal key resolution
  const result = await resolveWithStack(key, msg, opts);

  if (!result.ok || 'pass' in result) {
    return { ok: false, error: { status: 404, message: `Key not found: ${key}` } };
  }

  if (rest.length === 0) {
    return result;
  }

  // Continue resolution if value is a message
  if (typeof result.value === 'object' && result.value !== null && !ArrayBuffer.isView(result.value)) {
    return resolve(result.value as TABMMessage, rest, opts);
  }

  return { ok: false, error: { status: 400, message: 'Cannot traverse non-message value' } };
}
```

### 6.3 Hashpath Computation

```typescript
async function computeHashpath(
  previousHashpath: Binary,
  deviceId: string,
  functionName: string,
  args: TABMValue[]
): Promise<Binary> {
  const parts = [
    previousHashpath,
    await sha256(toBinary(deviceId)),
    await sha256(toBinary(functionName)),
    await sha256(toBinary(JSON.stringify(args)))
  ];

  return sha256(concat(parts));
}

// Initial hashpath from message ID
async function initialHashpath(msg: TABMMessage): Promise<Binary> {
  const id = await computeId(msg, true);
  return sha256(base64UrlDecode(id));
}
```

### 6.4 Error Handling

```typescript
type ErrorStrategy = 'throw' | 'return' | 'log';

async function handleError(
  error: ErrorInfo,
  strategy: ErrorStrategy
): Promise<Result<never>> {
  switch (strategy) {
    case 'throw':
      throw new Error(`[${error.status}] ${error.message}`);
    case 'log':
      console.error(`Error: [${error.status}] ${error.message}`);
      // Fall through to return
    case 'return':
    default:
      return { ok: false, error };
  }
}
```

---

## 7. Store System

### 7.1 Store Interface

```typescript
interface StoreConfig {
  'store-module': string;
  'name'?: string;
  'capacity'?: number;
  [key: string]: TABMValue;
}

interface Store {
  // Initialize store
  start(config: StoreConfig): Promise<void>;

  // Shutdown store
  stop(config: StoreConfig): Promise<void>;

  // Read value by key
  read(key: Base64URL, config: StoreConfig): Promise<Result<Binary>>;

  // Write value
  write(key: Base64URL, value: Binary, config: StoreConfig): Promise<Result<void>>;

  // List keys by prefix
  list(prefix: string, config: StoreConfig): Promise<Base64URL[]>;

  // Clear all data
  reset(config: StoreConfig): Promise<void>;

  // Check if key exists
  exists?(key: Base64URL, config: StoreConfig): Promise<boolean>;

  // Delete key
  delete?(key: Base64URL, config: StoreConfig): Promise<void>;
}
```

### 7.2 Filesystem Store

```typescript
interface FSStoreConfig extends StoreConfig {
  'store-module': 'hb_store_fs';
  'name': string;  // Base path
}

// Key to path mapping (2-level directory structure)
function keyToPath(basePath: string, key: Base64URL): string {
  // Key: "abc123def456..." (43 chars)
  // Path: /base/ab/c1/abc123def456...
  const dir1 = key.substring(0, 2);
  const dir2 = key.substring(2, 4);
  return `${basePath}/${dir1}/${dir2}/${key}`;
}
```

### 7.3 LMDB Store

```typescript
interface LMDBStoreConfig extends StoreConfig {
  'store-module': 'hb_store_lmdb';
  'name': string;           // Database path
  'map_size'?: number;      // Max database size (default: 10GB)
}
```

### 7.4 RocksDB Store

```typescript
interface RocksDBStoreConfig extends StoreConfig {
  'store-module': 'hb_store_rocksdb';
  'name': string;
}

// Value encoding prefixes
const ROCKSDB_PREFIXES = {
  LINK: 0x01,      // Reference to another key
  DATA: 0x02,      // Raw data
  GROUP: 0x03      // Directory/group marker
};
```

### 7.5 LRU Cache Store

```typescript
interface LRUStoreConfig extends StoreConfig {
  'store-module': 'hb_store_lru';
  'capacity': number;        // Max size in bytes
  'store'?: StoreConfig;     // Backing store for eviction
}

interface LRUEntry {
  key: Base64URL;
  value: Binary;
  size: number;
  lastAccess: number;
}
```

### 7.6 Gateway Store

```typescript
interface GatewayStoreConfig extends StoreConfig {
  'store-module': 'hb_store_gateway';
  'gateway': string;         // e.g., "https://arweave.net"
  'store'?: StoreConfig;     // Local cache
}

// Fetch from gateway
async function gatewayRead(
  key: Base64URL,
  config: GatewayStoreConfig
): Promise<Result<Binary>> {
  const url = `${config.gateway}/${key}`;
  const response = await fetch(url);

  if (!response.ok) {
    return { ok: false, error: { status: response.status, message: 'Gateway fetch failed' } };
  }

  const data = new Uint8Array(await response.arrayBuffer());

  // Cache locally if configured
  if (config.store) {
    await storeWrite(key, data, config.store);
  }

  return { ok: true, value: data };
}
```

### 7.7 Remote Node Store

```typescript
interface RemoteNodeStoreConfig extends StoreConfig {
  'store-module': 'hb_store_remote_node';
  'node': string;            // e.g., "http://other-node:10000"
  'store'?: StoreConfig;     // Local cache
}

// Endpoint: GET /<id>/~cache@1.0/read
```

### 7.8 Composite Stores

```typescript
// Stores can be composed as an array for tiered access
type CompositeStore = StoreConfig[];

// Read: Try each store in order until found
async function compositeRead(
  key: Base64URL,
  stores: CompositeStore
): Promise<Result<Binary>> {
  for (const store of stores) {
    const result = await storeRead(key, store);
    if (result.ok) return result;
  }
  return { ok: false, error: { status: 404, message: 'Not found in any store' } };
}

// Example: Memory -> Disk -> Network
const tieredStore: CompositeStore = [
  { 'store-module': 'hb_store_lru', capacity: 1073741824 },      // 1GB memory
  { 'store-module': 'hb_store_rocksdb', name: '/data/cache' },   // Local disk
  { 'store-module': 'hb_store_gateway', gateway: 'https://arweave.net' }
];
```

---

## 8. Codec System

### 8.1 Codec Interface

```typescript
interface Codec {
  // Content type this codec handles
  contentType(): string;

  // Encode message to wire format
  encode(msg: TABMMessage, opts: ResolveOptions): Promise<Result<Binary>>;

  // Decode wire format to message
  decode(data: Binary, opts: ResolveOptions): Promise<Result<TABMMessage>>;
}

// Available codecs
const CODECS: Record<string, Codec> = {
  'application/x-ans-104': ANS104Codec,
  'application/json': JSONCodec,
  'application/x-httpsig': HTTPSigCodec,
  'application/x-structured': StructuredFieldsCodec
};
```

### 8.2 JSON Codec

```typescript
const JSONCodec: Codec = {
  contentType: () => 'application/json',

  async encode(msg, opts) {
    const publicMsg = publicKeys(msg);
    const json = JSON.stringify(publicMsg, (key, value) => {
      if (value instanceof Uint8Array) {
        return { _type: 'binary', data: base64UrlEncode(value) };
      }
      return value;
    });
    return { ok: true, value: toBinary(json) };
  },

  async decode(data, opts) {
    const json = new TextDecoder().decode(data);
    const parsed = JSON.parse(json, (key, value) => {
      if (value && typeof value === 'object' && value._type === 'binary') {
        return base64UrlDecode(value.data);
      }
      return value;
    });
    return { ok: true, value: parsed };
  }
};
```

### 8.3 ANS-104 Codec

```typescript
const ANS104Codec: Codec = {
  contentType: () => 'application/x-ans-104',

  async encode(msg, opts) {
    const sigType = (msg['signature-type'] as number) || 1;
    const config = SIGNATURE_CONFIGS[sigType as SignatureType];

    const signature = msg['signature'] as Binary || new Uint8Array(config.sigSize);
    const owner = msg['owner'] as Binary || new Uint8Array(config.ownerSize);
    const target = msg['target'] as Binary || new Uint8Array();
    const anchor = msg['anchor'] as Binary || new Uint8Array();
    const tags = messageToTags(msg);
    const data = msg['body'] as Binary || new Uint8Array();

    const tagsEncoded = encodeTags(tags);

    const parts: Binary[] = [
      new Uint8Array([(sigType >> 8) & 0xFF, sigType & 0xFF]),
      signature,
      owner,
      encodeOptional(target, 32),
      encodeOptional(anchor, 32),
      toBigEndian64(tags.length),
      toBigEndian64(tagsEncoded.length),
      tagsEncoded,
      data
    ];

    return { ok: true, value: concat(parts) };
  },

  async decode(data, opts) {
    let offset = 0;

    // Signature type
    const sigType = (data[offset] << 8) | data[offset + 1];
    offset += 2;

    const config = SIGNATURE_CONFIGS[sigType as SignatureType];
    if (!config) {
      return { ok: false, error: { status: 400, message: `Unknown signature type: ${sigType}` } };
    }

    // Signature
    const signature = data.slice(offset, offset + config.sigSize);
    offset += config.sigSize;

    // Owner
    const owner = data.slice(offset, offset + config.ownerSize);
    offset += config.ownerSize;

    // Target (optional)
    const [target, newOffset1] = decodeOptional(data, offset, 32);
    offset = newOffset1;

    // Anchor (optional)
    const [anchor, newOffset2] = decodeOptional(data, offset, 32);
    offset = newOffset2;

    // Tags count and size
    const tagsCount = fromBigEndian64(data.slice(offset, offset + 8));
    offset += 8;
    const tagsBytesSize = fromBigEndian64(data.slice(offset, offset + 8));
    offset += 8;

    // Tags
    const tagsData = data.slice(offset, offset + Number(tagsBytesSize));
    offset += Number(tagsBytesSize);
    const tags = decodeTags(tagsData, Number(tagsCount));

    // Data
    const body = data.slice(offset);

    const msg = tagsToMessage(tags);
    msg['signature-type'] = sigType;
    msg['signature'] = signature;
    msg['owner'] = owner;
    if (target.length > 0) msg['target'] = target;
    if (anchor.length > 0) msg['anchor'] = anchor;
    if (body.length > 0) msg['body'] = body;

    return { ok: true, value: msg };
  }
};
```

---

## 9. Commitment System

Cryptographic message signing and verification.

### 9.1 Commitment Device Interface

```typescript
interface CommitmentDevice {
  name: string;

  // Sign message
  commit(
    msg: TABMMessage,
    opts: ResolveOptions
  ): Promise<Result<TABMMessage>>;

  // Verify signature(s)
  verify(
    msg: TABMMessage,
    mode: 'all' | 'any',
    opts: ResolveOptions
  ): Promise<boolean>;

  // Get list of signers
  signers(
    msg: TABMMessage,
    opts: ResolveOptions
  ): Promise<Address[]>;

  // Get unsigned message ID
  unsignedId(
    msg: TABMMessage,
    opts: ResolveOptions
  ): Promise<Base64URL>;
}
```

### 9.2 HTTPSig Commitment

```typescript
const HTTPSigCommitment: CommitmentDevice = {
  name: 'httpsig@1.0',

  async commit(msg, opts) {
    const wallet = opts.privWallet;
    if (!wallet) {
      return { ok: false, error: { status: 400, message: 'No wallet provided' } };
    }

    // Get headers to sign (all except body, signature, signature-input)
    const headersToSign = Object.keys(msg)
      .filter(k => k !== 'body' && k !== 'signature' && k !== 'signature-input')
      .map(k => `"${k.toLowerCase()}"`)
      .join(' ');

    const created = Math.floor(Date.now() / 1000);
    const sigInput = `sig1=(${headersToSign});created=${created};keyid="${walletAddress(wallet)}"`;

    const sigBase = createSignatureBase(msg, sigInput);
    const signature = await rsaPssSign(wallet as RSAWallet, sigBase);

    return {
      ok: true,
      value: {
        ...msg,
        'signature': signature,
        'signature-input': sigInput,
        'owner': (wallet as RSAWallet).n
      }
    };
  },

  async verify(msg, mode, opts) {
    const signature = msg['signature'] as Binary;
    const sigInput = msg['signature-input'] as string;
    const owner = msg['owner'] as Binary;

    if (!signature || !sigInput || !owner) return false;

    const sigBase = createSignatureBase(msg, sigInput);
    const publicKey: RSAWallet = { kty: 'RSA', n: owner, e: EXPONENT_65537 };

    return rsaPssVerify(publicKey, signature, sigBase);
  },

  async signers(msg, opts) {
    const owner = msg['owner'] as Binary;
    if (!owner) return [];
    return [base64UrlEncode(await sha256(owner))];
  },

  async unsignedId(msg, opts) {
    const unsigned = { ...msg };
    delete unsigned['signature'];
    delete unsigned['signature-input'];
    delete unsigned['owner'];
    return computeId(unsigned, false);
  }
};

// Create signature base per RFC-9421
function createSignatureBase(msg: TABMMessage, sigInput: string): Binary {
  const match = sigInput.match(/sig1=\(([^)]*)\)/);
  if (!match) throw new Error('Invalid signature-input');

  const headers = match[1].split(' ').map(h => h.replace(/"/g, ''));

  const lines: string[] = [];
  for (const header of headers) {
    const value = msg[header];
    if (value === undefined) continue;
    const encoded = encodeStructuredField(value);
    lines.push(`"${header}": ${encoded}`);
  }

  // Add signature params
  const paramsStart = sigInput.indexOf(';');
  const params = paramsStart >= 0 ? sigInput.substring(paramsStart) : '';
  lines.push(`"@signature-params": sig1=(${match[1]})${params}`);

  return toBinary(lines.join('\n'));
}
```

### 9.3 ANS-104 Commitment

```typescript
const ANS104Commitment: CommitmentDevice = {
  name: 'ans104@1.0',

  async commit(msg, opts) {
    const wallet = opts.privWallet as RSAWallet;
    if (!wallet) {
      return { ok: false, error: { status: 400, message: 'No wallet' } };
    }

    const tags = messageToTags(msg);
    const data = msg['body'] as Binary || new Uint8Array();

    // Compute signature data using deep hash
    const signatureData = await deepHash([
      toBinary('dataitem'),
      toBinary('1'),              // format version
      toBinary('1'),              // signature type (RSA-PSS)
      wallet.n,                   // owner
      toBinary(''),               // target
      toBinary(''),               // anchor
      tags.map(t => [t.name, t.value]),
      data
    ]);

    const signature = await rsaPssSign(wallet, signatureData);

    return {
      ok: true,
      value: {
        ...msg,
        'signature': signature,
        'owner': wallet.n,
        'id': base64UrlEncode(await sha256(signature))
      }
    };
  },

  async verify(msg, mode, opts) {
    const signature = msg['signature'] as Binary;
    const owner = msg['owner'] as Binary;

    if (!signature || !owner) return false;

    const tags = messageToTags(msg);
    const data = msg['body'] as Binary || new Uint8Array();

    const signatureData = await deepHash([
      toBinary('dataitem'),
      toBinary('1'),
      toBinary('1'),
      owner,
      toBinary(''),
      toBinary(''),
      tags.map(t => [t.name, t.value]),
      data
    ]);

    return rsaPssVerify({ kty: 'RSA', n: owner, e: EXPONENT_65537 }, signature, signatureData);
  },

  async signers(msg, opts) {
    const owner = msg['owner'] as Binary;
    if (!owner) return [];
    return [base64UrlEncode(await sha256(owner))];
  },

  async unsignedId(msg, opts) {
    return computeId(msg, false);
  }
};
```

---

## 10. Cryptographic Operations

### 10.1 Hashing

```typescript
// SHA-256 (primary hash)
async function sha256(data: Binary): Promise<Binary> {
  const hash = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(hash);
}

// SHA-384 (for deep hash)
async function sha384(data: Binary): Promise<Binary> {
  const hash = await crypto.subtle.digest('SHA-384', data);
  return new Uint8Array(hash);
}

// Keccak-256 (for Ethereum)
async function keccak256(data: Binary): Promise<Binary> {
  // Implementation required - not available in Web Crypto
  throw new Error('Keccak256 requires external library');
}
```

### 10.2 RSA-4096 PSS

```typescript
// RSA-PSS parameters
const RSA_PSS_PARAMS = {
  hash: 'SHA-256',
  mgf: 'MGF1-SHA256',
  saltLength: 32
};

async function rsaPssSign(wallet: RSAWallet, data: Binary): Promise<Binary> {
  // Convert wallet to CryptoKey
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'RSA',
      n: base64UrlEncode(wallet.n),
      e: base64UrlEncode(wallet.e),
      d: base64UrlEncode(wallet.d!),
      p: base64UrlEncode(wallet.p!),
      q: base64UrlEncode(wallet.q!),
      dp: base64UrlEncode(wallet.dp!),
      dq: base64UrlEncode(wallet.dq!),
      qi: base64UrlEncode(wallet.qi!)
    },
    { name: 'RSA-PSS', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign(
    { name: 'RSA-PSS', saltLength: 32 },
    privateKey,
    data
  );

  return new Uint8Array(signature);
}

async function rsaPssVerify(
  wallet: RSAWallet,
  signature: Binary,
  data: Binary
): Promise<boolean> {
  const publicKey = await crypto.subtle.importKey(
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

  return crypto.subtle.verify(
    { name: 'RSA-PSS', saltLength: 32 },
    publicKey,
    signature,
    data
  );
}
```

### 10.3 ED25519

```typescript
async function ed25519Sign(wallet: ED25519Wallet, data: Binary): Promise<Binary> {
  const privateKey = await crypto.subtle.importKey(
    'jwk',
    {
      kty: 'OKP',
      crv: 'Ed25519',
      x: base64UrlEncode(wallet.x),
      d: base64UrlEncode(wallet.d!)
    },
    { name: 'Ed25519' },
    false,
    ['sign']
  );

  const signature = await crypto.subtle.sign('Ed25519', privateKey, data);
  return new Uint8Array(signature);
}

async function ed25519Verify(
  wallet: ED25519Wallet,
  signature: Binary,
  data: Binary
): Promise<boolean> {
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

  return crypto.subtle.verify('Ed25519', publicKey, signature, data);
}
```

### 10.4 Address Derivation

```typescript
// RSA address (Arweave style)
async function rsaAddress(wallet: RSAWallet): Promise<Address> {
  const hash = await sha256(wallet.n);
  return base64UrlEncode(hash);
}

// Ethereum address
async function ethAddress(wallet: EthWallet): Promise<string> {
  const pubKey = concat([wallet.x, wallet.y]);
  const hash = await keccak256(pubKey);
  // Last 20 bytes, prefixed with 0x
  return '0x' + Array.from(hash.slice(-20))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
```

### 10.5 Deep Hash Algorithm

Arweave's recursive hashing algorithm:

```typescript
type DeepHashInput = Binary | DeepHashInput[];

async function deepHash(data: DeepHashInput): Promise<Binary> {
  if (data instanceof Uint8Array) {
    // Blob: sha384(sha384("blob" + length) || sha384(data))
    const tag = toBinary('blob' + data.length);
    return sha384(concat([await sha384(tag), await sha384(data)]));
  }

  // List: fold over items
  const tag = toBinary('list' + data.length);
  let hash = await sha384(tag);

  for (const item of data) {
    const itemHash = await deepHash(item);
    hash = await sha384(concat([hash, itemHash]));
  }

  return hash;
}
```

---

## 11. Scheduler and Process Management

### 11.1 Scheduler Interface

```typescript
interface Scheduler {
  // Assign a slot to a message
  assign(
    process: Base64URL,
    message: TABMMessage,
    opts: ResolveOptions
  ): Promise<Result<Assignment>>;

  // Get current slot for process
  currentSlot(process: Base64URL): Promise<number>;

  // Get assignment by slot
  getAssignment(process: Base64URL, slot: number): Promise<Result<Assignment>>;

  // Get assignments in range
  getAssignments(
    process: Base64URL,
    fromSlot: number,
    toSlot: number
  ): Promise<Assignment[]>;
}

interface Assignment extends TABMMessage {
  'type': 'assignment';
  'slot': number;
  'timestamp': Timestamp;
  'block-height': number;
  'block-hash'?: Base64URL;
  'block-timestamp'?: Timestamp;
  'process': Base64URL;
  'message': Base64URL;
  'epoch': number;
  'nonce': number;
  'hash-chain': Base64URL;
  'signature': Binary;
  'owner': Binary;
}
```

### 11.2 Epoch-Based Scheduling

Slots are organized into epochs for efficient batching:

```typescript
const SLOTS_PER_EPOCH = 1000;

function epochFromSlot(slot: number): number {
  return Math.floor(slot / SLOTS_PER_EPOCH);
}

function nonceFromSlot(slot: number): number {
  return slot % SLOTS_PER_EPOCH;
}

function slotFromEpochNonce(epoch: number, nonce: number): number {
  return epoch * SLOTS_PER_EPOCH + nonce;
}

// Schedule location format: "address/epoch/nonce/hash-chain"
interface ScheduleLocation {
  address: Address;
  epoch: number;
  nonce: number;
  hashChain: Base64URL;
}

function parseScheduleLocation(loc: string): ScheduleLocation {
  const [address, epochStr, nonceStr, hashChain] = loc.split('/');
  return {
    address,
    epoch: parseInt(epochStr),
    nonce: parseInt(nonceStr),
    hashChain
  };
}

function formatScheduleLocation(loc: ScheduleLocation): string {
  return `${loc.address}/${loc.epoch}/${loc.nonce}/${loc.hashChain}`;
}
```

### 11.3 Hash Chain Computation

```typescript
async function computeHashChain(
  processId: Base64URL,
  slot: number,
  messageId: Base64URL,
  previousHashChain: Binary
): Promise<Binary> {
  const input = concat([
    base64UrlDecode(processId),
    toBinary(String(slot)),
    base64UrlDecode(messageId),
    previousHashChain
  ]);

  return sha256(input);
}

// Genesis hash chain (slot 0)
async function initialHashChain(processId: Base64URL): Promise<Binary> {
  return sha256(base64UrlDecode(processId));
}

// Create assignment with hash chain
async function createAssignment(
  scheduler: Scheduler,
  process: Base64URL,
  message: TABMMessage,
  wallet: RSAWallet,
  opts: ResolveOptions
): Promise<Result<Assignment>> {
  const currentSlot = await scheduler.currentSlot(process);
  const slot = currentSlot + 1;
  const timestamp = Date.now();

  // Get previous hash chain
  let previousHashChain: Binary;
  if (slot === 1) {
    previousHashChain = await initialHashChain(process);
  } else {
    const prevAssignment = await scheduler.getAssignment(process, slot - 1);
    if (!prevAssignment.ok) {
      return prevAssignment;
    }
    previousHashChain = base64UrlDecode(prevAssignment.value['hash-chain']);
  }

  const messageId = await computeId(message, true);
  const hashChain = await computeHashChain(process, slot, messageId, previousHashChain);

  const assignment: Assignment = {
    'type': 'assignment',
    'slot': slot,
    'timestamp': timestamp,
    'block-height': 0,  // Fill from chain
    'process': process,
    'message': messageId,
    'epoch': epochFromSlot(slot),
    'nonce': nonceFromSlot(slot),
    'hash-chain': base64UrlEncode(hashChain),
    'signature': new Uint8Array(),
    'owner': wallet.n
  };

  // Sign assignment
  const signed = await HTTPSigCommitment.commit(assignment, { ...opts, privWallet: wallet });
  if (!signed.ok) return signed;

  return { ok: true, value: signed.value as Assignment };
}
```

### 11.4 Hash Chain Verification

```typescript
async function verifyHashChain(
  process: Base64URL,
  assignments: Assignment[]
): Promise<boolean> {
  // Sort by slot
  const sorted = [...assignments].sort((a, b) => a['slot'] - b['slot']);

  let previousHash = await initialHashChain(process);

  for (const assignment of sorted) {
    const slot = assignment['slot'];
    const messageId = assignment['message'];
    const expectedHash = await computeHashChain(process, slot, messageId, previousHash);
    const actualHash = base64UrlDecode(assignment['hash-chain']);

    if (!arraysEqual(expectedHash, actualHash)) {
      return false;
    }

    previousHash = actualHash;
  }

  return true;
}
```

### 11.5 Process Execution

```typescript
interface Process extends TABMMessage {
  'device': 'process@1.0';
  'execution-device': string;      // e.g., "wasm64-emscripten@1.0"
  'scheduler-device': string;      // e.g., "scheduler@1.0"
  'scheduler'?: Address;
  'authority'?: Address;
  'module'?: Base64URL;
}

interface ProcessState {
  process: Base64URL;
  slot: number;
  state: TABMMessage;
  results?: TABMMessage[];
}

async function executeSlot(
  process: Process,
  slot: number,
  opts: ResolveOptions
): Promise<Result<ProcessState>> {
  const scheduler = await loadDevice(process['scheduler-device'], opts);
  const executor = await loadDevice(process['execution-device'], opts);

  // Get assignment
  const assignmentResult = await scheduler.get(`slot/${slot}`, process, opts);
  if (!assignmentResult.ok) return assignmentResult as Result<ProcessState>;

  const assignment = assignmentResult.value as Assignment;
  const messageId = assignment['message'];

  // Get message
  const messageResult = await opts.store
    ? storeRead(messageId, opts.store as StoreConfig)
    : { ok: false, error: { status: 404, message: 'No store configured' } };
  if (!messageResult.ok) return messageResult as unknown as Result<ProcessState>;

  // Get previous state
  const prevStateResult = slot > 1
    ? await executor.get(`state/${slot - 1}`, process, opts)
    : { ok: true, value: {} };
  if (!prevStateResult.ok && !('pass' in prevStateResult)) {
    return prevStateResult as Result<ProcessState>;
  }

  const prevState = (prevStateResult as { ok: true; value: TABMMessage }).value;

  // Execute
  const computeResult = await executor.get('compute', {
    ...process,
    'state': prevState,
    'message': messageResult.value
  }, opts);

  if (!computeResult.ok) return computeResult as Result<ProcessState>;

  return {
    ok: true,
    value: {
      process: process['id'] as Base64URL,
      slot,
      state: computeResult.value as TABMMessage
    }
  };
}
```

---

## 12. HTTP API

### 12.1 Request Processing

```typescript
interface HTTPRequest {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  path: string;
  headers: Record<string, string>;
  body?: Binary;
  queryParams?: Record<string, string>;
}

interface HTTPResponse {
  status: number;
  headers: Record<string, string>;
  body?: Binary;
}

// Convert HTTP request to TABM message
function requestToMessage(req: HTTPRequest): TABMMessage {
  const msg: TABMMessage = {
    'method': req.method,
    'path': req.path
  };

  // Parse headers
  for (const [key, value] of Object.entries(req.headers)) {
    const normalizedKey = key.toLowerCase();
    msg[normalizedKey] = decodeStructuredField(value);
  }

  if (req.body) {
    msg['body'] = req.body;
  }

  if (req.queryParams) {
    for (const [key, value] of Object.entries(req.queryParams)) {
      msg[`query-${key}`] = value;
    }
  }

  return msg;
}

// Convert TABM message to HTTP response
function messageToResponse(msg: TABMMessage): HTTPResponse {
  const headers: Record<string, string> = {};

  for (const [key, value] of Object.entries(msg)) {
    if (key === 'body' || key === 'status') continue;
    if (isPrivateKey(key)) continue;
    headers[key.toLowerCase()] = encodeStructuredField(value);
  }

  return {
    status: (msg['status'] as number) || 200,
    headers,
    body: msg['body'] as Binary | undefined
  };
}
```

### 12.2 Singleton Message Format

```typescript
// Wrap request in singleton for routing
function createSingleton(request: TABMMessage): TABMMessage {
  return {
    '1': request,
    'device': 'router@1.0',
    'request': true
  };
}
```

### 12.3 Content Negotiation

```typescript
function selectCodec(acceptHeader: string): Codec {
  const types = acceptHeader.split(',').map(t => t.trim().split(';')[0]);

  for (const type of types) {
    if (type in CODECS) {
      return CODECS[type];
    }
  }

  // Default to JSON
  return JSONCodec;
}
```

### 12.4 HTTP Client

```typescript
interface HTTPClient {
  get(url: string, msg: TABMMessage, opts: ResolveOptions): Promise<Result<TABMMessage>>;
  post(url: string, msg: TABMMessage, opts: ResolveOptions): Promise<Result<TABMMessage>>;
}

class AOHTTPClient implements HTTPClient {
  async get(url: string, msg: TABMMessage, opts: ResolveOptions): Promise<Result<TABMMessage>> {
    // Sign if wallet provided
    const signedMsg = opts.privWallet
      ? await HTTPSigCommitment.commit(msg, opts)
      : { ok: true as const, value: msg };

    if (!signedMsg.ok) return signedMsg;

    const headers = messageToHeaders(signedMsg.value);
    const response = await fetch(url, { method: 'GET', headers });

    return responseToMessage(response);
  }

  async post(url: string, msg: TABMMessage, opts: ResolveOptions): Promise<Result<TABMMessage>> {
    const signedMsg = opts.privWallet
      ? await HTTPSigCommitment.commit(msg, opts)
      : { ok: true as const, value: msg };

    if (!signedMsg.ok) return signedMsg;

    const headers = messageToHeaders(signedMsg.value);
    const body = msg['body'] as Binary | undefined;

    const response = await fetch(url, { method: 'POST', headers, body });
    return responseToMessage(response);
  }
}

function messageToHeaders(msg: TABMMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(msg)) {
    if (key === 'body') continue;
    if (isPrivateKey(key)) continue;
    headers[key] = encodeStructuredField(value);
  }
  return headers;
}

async function responseToMessage(response: Response): Promise<Result<TABMMessage>> {
  const msg: TABMMessage = {
    'status': response.status
  };

  for (const [key, value] of response.headers.entries()) {
    msg[key] = decodeStructuredField(value);
  }

  if (response.body) {
    msg['body'] = new Uint8Array(await response.arrayBuffer());
  }

  return { ok: true, value: msg };
}
```

---

## 13. Built-in Devices

### 13.1 Message Device

```typescript
const MessageDevice: Device = {
  info: () => ({
    exports: ['id', 'unsigned-id', 'get', 'set', 'keys', 'serialize', 'deserialize', 'sign', 'verify']
  }),

  async get(key, msg, opts) {
    switch (key) {
      case 'id':
        return { ok: true, value: await computeId(msg, true) };
      case 'unsigned-id':
        return { ok: true, value: await computeId(msg, false) };
      case 'keys':
        return { ok: true, value: Object.keys(msg) };
      default:
        // Check for key in message (with type suffix variants)
        const typedKey = findTypedKey(msg, key);
        if (typedKey) {
          return { ok: true, value: msg[typedKey] };
        }
        return { pass: true };
    }
  }
};
```

### 13.2 Router Device

```typescript
interface Route {
  pattern: string | RegExp;
  handler: string;  // Device name
}

const RouterDevice: Device = {
  info: () => ({
    exports: ['route', 'handle', 'dispatch'],
    handler: 'handle'
  }),

  async get(key, msg, opts) {
    if (key === 'route') {
      const path = msg['path'] as string;
      const routes = msg['routes'] as Route[] || [];

      for (const route of routes) {
        if (matchRoute(path, route.pattern)) {
          return { ok: true, value: route.handler };
        }
      }
      return { ok: false, error: { status: 404, message: 'No matching route' } };
    }
    return { pass: true };
  },

  async handle(msg, req, opts) {
    const path = req['path'] as string;
    const segments = splitPath(path);

    if (segments.length === 0) {
      return { ok: true, value: msg };
    }

    return resolve(msg, segments, opts);
  }
};
```

### 13.3 Process Device

```typescript
const ProcessDevice: Device = {
  info: () => ({
    exports: ['compute', 'state', 'result', 'results', 'push', 'slot', 'now'],
    default: 'compute',
    handler: 'handle'
  }),

  async get(key, msg, opts) {
    switch (key) {
      case 'compute':
        return computeProcess(msg, opts);
      case 'state':
        return getProcessState(msg, opts);
      case 'result':
        return getProcessResult(msg, opts);
      case 'results':
        return getProcessResults(msg, opts);
      case 'slot':
        return { ok: true, value: msg['slot'] || 0 };
      case 'now':
        return { ok: true, value: Date.now() };
      default:
        return { pass: true };
    }
  }
};
```

### 13.4 Scheduler Device

```typescript
const SchedulerDevice: Device = {
  info: () => ({
    exports: ['schedule', 'slot', 'current', 'location', 'assignments']
  }),

  async get(key, msg, opts) {
    const process = msg['process'] as Base64URL;

    switch (key) {
      case 'current':
        const current = await getCurrentSlot(process, opts);
        return { ok: true, value: current };

      case 'location':
        const loc = await getScheduleLocation(process, opts);
        return { ok: true, value: formatScheduleLocation(loc) };

      default:
        // Handle slot/<n> pattern
        if (key.startsWith('slot/')) {
          const slot = parseInt(key.substring(5));
          return getAssignment(process, slot, opts);
        }
        return { pass: true };
    }
  }
};
```

### 13.5 WASM Device

```typescript
interface WASMInstance {
  memory: WebAssembly.Memory;
  exports: Record<string, Function>;
}

const WASMDevice: Device = {
  info: () => ({
    exports: ['init', 'compute', 'state', 'call']
  }),

  async get(key, msg, opts) {
    switch (key) {
      case 'init':
        return initWASM(msg, opts);
      case 'compute':
        return executeWASM(msg, opts);
      case 'state':
        return getWASMState(msg, opts);
      default:
        return { pass: true };
    }
  }
};

async function initWASM(msg: TABMMessage, opts: ResolveOptions): Promise<ResolveResult<WASMInstance>> {
  const moduleId = msg['module'] as Base64URL;

  // Load WASM binary from store
  const store = opts.store as StoreConfig;
  const wasmResult = await storeRead(moduleId, store);
  if (!wasmResult.ok) return wasmResult as ResolveResult<WASMInstance>;

  // Compile and instantiate
  const module = await WebAssembly.compile(wasmResult.value);
  const imports = createWASMImports(msg, opts);
  const instance = await WebAssembly.instantiate(module, imports);

  return {
    ok: true,
    value: {
      memory: instance.exports.memory as WebAssembly.Memory,
      exports: instance.exports as Record<string, Function>
    }
  };
}
```

---

## 14. Payment System

### 14.1 Payment Interface

```typescript
interface PaymentDevice {
  // Get balance for address
  balance(address: Address, opts: ResolveOptions): Promise<Result<bigint>>;

  // Estimate cost for operation
  estimate(msg: TABMMessage, opts: ResolveOptions): Promise<Result<bigint>>;

  // Debit account
  debit(address: Address, amount: bigint, opts: ResolveOptions): Promise<Result<Receipt>>;

  // Credit account (refund)
  credit(address: Address, amount: bigint, opts: ResolveOptions): Promise<Result<Receipt>>;
}

interface Receipt {
  id: Base64URL;
  from: Address;
  to: Address;
  amount: bigint;
  timestamp: Timestamp;
  signature: Binary;
}
```

### 14.2 P4 Payment Channel

```typescript
interface PaymentChannel extends TABMMessage {
  'device': 'p4@1.0';
  'type': 'payment-channel';
  'id': Base64URL;
  'payer': Address;
  'payee': Address;
  'balance': number;  // in winston
  'nonce': number;
  'created-at': Timestamp;
}

interface PaymentMessage extends TABMMessage {
  'type': 'payment';
  'channel': Base64URL;
  'amount': number;
  'nonce': number;
  'signature': Binary;
}

const P4Device: Device = {
  info: () => ({
    exports: ['balance', 'topup', 'withdraw', 'check', 'settle']
  }),

  async get(key, msg, opts) {
    switch (key) {
      case 'balance':
        return getChannelBalance(msg, opts);
      case 'check':
        return checkPayment(msg, opts);
      default:
        return { pass: true };
    }
  }
};
```

### 14.3 FAFF (Free at First) Payment Model

```typescript
interface FAFFConfig {
  enabled: boolean;
  freeLimit: number;        // Free requests per address
  resetPeriod?: number;     // Reset period in seconds
}

interface FAFFState {
  requests: Map<Address, number>;
  lastReset: Timestamp;
}

class FAFFPayment implements PaymentDevice {
  private underlying: PaymentDevice;
  private config: FAFFConfig;
  private state: FAFFState;

  constructor(underlying: PaymentDevice, config: FAFFConfig) {
    this.underlying = underlying;
    this.config = config;
    this.state = {
      requests: new Map(),
      lastReset: Date.now()
    };
  }

  private isFreeRequest(address: Address): boolean {
    // Check for reset
    if (this.config.resetPeriod) {
      const elapsed = Date.now() - this.state.lastReset;
      if (elapsed > this.config.resetPeriod * 1000) {
        this.state.requests.clear();
        this.state.lastReset = Date.now();
      }
    }

    const count = this.state.requests.get(address) || 0;
    return count < this.config.freeLimit;
  }

  async debit(address: Address, amount: bigint, opts: ResolveOptions): Promise<Result<Receipt>> {
    if (this.isFreeRequest(address)) {
      // Increment counter
      const count = this.state.requests.get(address) || 0;
      this.state.requests.set(address, count + 1);

      // Return free receipt
      return {
        ok: true,
        value: {
          id: 'free-' + Date.now(),
          from: address,
          to: 'system',
          amount: 0n,
          timestamp: Date.now(),
          signature: new Uint8Array()
        } as Receipt
      };
    }

    // Delegate to underlying payment
    return this.underlying.debit(address, amount, opts);
  }

  async balance(address: Address, opts: ResolveOptions): Promise<Result<bigint>> {
    const freeRemaining = this.config.freeLimit - (this.state.requests.get(address) || 0);
    if (freeRemaining > 0) {
      // Return "infinite" balance for free tier
      return { ok: true, value: BigInt(Number.MAX_SAFE_INTEGER) };
    }
    return this.underlying.balance(address, opts);
  }

  async estimate(msg: TABMMessage, opts: ResolveOptions): Promise<Result<bigint>> {
    return this.underlying.estimate(msg, opts);
  }

  async credit(address: Address, amount: bigint, opts: ResolveOptions): Promise<Result<Receipt>> {
    return this.underlying.credit(address, amount, opts);
  }
}
```

---

## Appendix A: Message Examples

### A.1 Simple Message

```typescript
const simpleMessage: TABMMessage = {
  'device': 'message@1.0',
  'content-type': 'text/plain',
  'body': toBinary('Hello, World!')
};
```

### A.2 Signed HTTP Request

```typescript
const signedRequest: TABMMessage = {
  'device': 'process@1.0',
  'method': 'POST',
  'path': '/compute',
  'content-type': 'application/json',
  'body': toBinary('{"action": "transfer", "amount": 100}'),
  'signature': signature,
  'signature-input': 'sig1=("device" "method" "path" "content-type");created=1699900000',
  'owner': ownerPublicKey
};
```

### A.3 Process Definition

```typescript
const processDefinition: Process = {
  'device': 'process@1.0',
  'execution-device': 'wasm64-emscripten@1.0',
  'scheduler-device': 'scheduler@1.0',
  'scheduler': 'scheduler-address-here',
  'authority': 'process-owner-address',
  'module': 'wasm-module-id-here'
};
```

### A.4 Assignment

```typescript
const assignment: Assignment = {
  'type': 'assignment',
  'slot': 42,
  'timestamp': 1699900000000,
  'block-height': 1234567,
  'process': 'process-id',
  'message': 'message-id',
  'epoch': 0,
  'nonce': 42,
  'hash-chain': 'hash-chain-value',
  'signature': signature,
  'owner': schedulerPublicKey
};
```

---

## Appendix B: Error Codes

| Status | Code | Description |
|--------|------|-------------|
| 400 | BAD_REQUEST | Invalid request format |
| 401 | UNAUTHORIZED | Missing or invalid signature |
| 402 | PAYMENT_REQUIRED | Insufficient funds |
| 403 | FORBIDDEN | Access denied |
| 404 | NOT_FOUND | Resource not found |
| 409 | CONFLICT | State conflict |
| 500 | INTERNAL_ERROR | Server error |
| 503 | SERVICE_UNAVAILABLE | Temporary unavailability |

---

## Appendix C: Protocol Constants

```typescript
const PROTOCOL_CONSTANTS = {
  // Signature types
  SIGNATURE_RSA_PSS: 1,
  SIGNATURE_ED25519: 2,
  SIGNATURE_ETHEREUM: 3,

  // Default RSA exponent
  RSA_EXPONENT: 65537,

  // Hash sizes
  SHA256_SIZE: 32,
  SHA384_SIZE: 48,

  // Address size (base64url of SHA-256)
  ADDRESS_SIZE: 43,

  // Default port
  DEFAULT_PORT: 10000,

  // Slots per epoch
  SLOTS_PER_EPOCH: 1000,

  // Default timeout (ms)
  DEFAULT_TIMEOUT: 120000,

  // FAFF defaults
  DEFAULT_FAFF_LIMIT: 100,
  DEFAULT_FAFF_RESET: 86400  // 24 hours
};
```

---

## Appendix D: Deep Hash Algorithm

Complete implementation reference:

```typescript
type DeepHashInput = Binary | DeepHashInput[];

async function deepHash(data: DeepHashInput): Promise<Binary> {
  if (data instanceof Uint8Array) {
    // Handle binary blob
    const tag = toBinary('blob' + data.length);
    const tagHash = await sha384(tag);
    const dataHash = await sha384(data);
    return sha384(concat([tagHash, dataHash]));
  }

  if (Array.isArray(data)) {
    // Handle list
    const tag = toBinary('list' + data.length);
    let hash = await sha384(tag);

    for (const item of data) {
      const itemHash = await deepHash(item);
      hash = await sha384(concat([hash, itemHash]));
    }

    return hash;
  }

  throw new Error('Invalid deep hash input');
}

// Usage for ANS-104 data item
async function dataItemSignatureData(
  owner: Binary,
  target: Binary,
  anchor: Binary,
  tags: Tag[],
  data: Binary
): Promise<Binary> {
  return deepHash([
    toBinary('dataitem'),
    toBinary('1'),           // format
    toBinary('1'),           // sig type
    owner,
    target,
    anchor,
    tags.map(t => [t.name, t.value]),
    data
  ]);
}
```

---

## Appendix E: Structured Fields (RFC-8941)

### E.1 Encoding

```typescript
function encodeStructuredField(value: TABMValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') {
    return `"${value.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return value ? '?1' : '?0';
  if (value instanceof Uint8Array) {
    return `:${base64Encode(value)}:`;  // Standard base64 for SF
  }
  if (Array.isArray(value)) {
    return '(' + value.map(encodeStructuredField).join(' ') + ')';
  }
  // Dictionary
  return Object.entries(value as Record<string, TABMValue>)
    .map(([k, v]) => `${k}=${encodeStructuredField(v)}`)
    .join(', ');
}
```

### E.2 Decoding

```typescript
function decodeStructuredField(str: string): TABMValue {
  const trimmed = str.trim();

  // String
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  // Binary
  if (trimmed.startsWith(':') && trimmed.endsWith(':')) {
    return base64Decode(trimmed.slice(1, -1));
  }

  // Boolean
  if (trimmed === '?1') return true;
  if (trimmed === '?0') return false;

  // List
  if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
    return parseList(trimmed.slice(1, -1));
  }

  // Number
  if (/^-?\d+(\.\d+)?$/.test(trimmed)) {
    return trimmed.includes('.') ? parseFloat(trimmed) : parseInt(trimmed);
  }

  // Token (unquoted string)
  return trimmed;
}
```

---

## Appendix F: Implementation Checklist

### F.1 Core Components

- [ ] TABM message parsing and serialization
- [ ] Type suffix key handling
- [ ] Key normalization
- [ ] Private key filtering
- [ ] Message ID computation (signed and unsigned)

### F.2 Cryptographic

- [ ] SHA-256 hashing
- [ ] SHA-384 hashing (for deep hash)
- [ ] RSA-4096 PSS signing and verification
- [ ] ED25519 signing and verification (optional)
- [ ] Deep hash algorithm
- [ ] Base64URL encoding/decoding

### F.3 Device System

- [ ] Device loading and caching
- [ ] Device stack resolution
- [ ] Pass-through result handling
- [ ] Info/exports introspection

### F.4 Converge Algorithm

- [ ] Path splitting and parsing
- [ ] Key resolution with type variants
- [ ] Hashpath computation
- [ ] Error handling strategies
- [ ] Cache integration

### F.5 Store System

- [ ] Store interface implementation
- [ ] At least one backend (FS recommended)
- [ ] Composite store support
- [ ] LRU caching (recommended)

### F.6 Codec System

- [ ] JSON codec
- [ ] ANS-104 codec
- [ ] HTTPSig codec
- [ ] Structured fields encoding/decoding

### F.7 Commitment System

- [ ] HTTPSig commitment (RFC-9421)
- [ ] ANS-104 commitment
- [ ] Signature verification

### F.8 Scheduler

- [ ] Slot assignment
- [ ] Hash chain computation
- [ ] Epoch organization
- [ ] Schedule location formatting

### F.9 HTTP API

- [ ] Request to message conversion
- [ ] Message to response conversion
- [ ] Content negotiation
- [ ] Singleton message wrapping

### F.10 Built-in Devices

- [ ] Message device
- [ ] Router device
- [ ] Process device
- [ ] Scheduler device
- [ ] WASM device (optional)

### F.11 Payment (Optional)

- [ ] P4 payment channel
- [ ] FAFF payment model

---

*End of AO-Core Protocol Specification v1.0*
