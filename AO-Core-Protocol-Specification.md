# AO-Core Protocol Specification

**Version:** 2.0
**Status:** Draft
**Date:** January 2026

---

## Abstract

AO-Core is a decentralized computation protocol built on the principle of message-passing between stateless, deterministic computational units called *devices*. The protocol provides a universal framework for verifiable, reproducible computation where messages serve as both data and computation requests. This specification defines the core protocol concepts, message formats, resolution semantics, commitment mechanisms, device architecture, and execution model independent of any specific implementation.

---

## 1. Introduction

### 1.1 Purpose

AO-Core enables decentralized, verifiable computation through a simple yet powerful abstraction: all computation is expressed as the resolution of message pairs. Given two messages and a set of options, the protocol produces a deterministic result that can be independently verified by any participant.

### 1.2 Design Principles

1. **Message-Centric**: All state and computation is expressed through messages
2. **Deterministic Resolution**: Given identical inputs, resolution always produces identical outputs
3. **Cryptographic Verifiability**: All computations can be cryptographically committed and verified
4. **Device Composability**: Complex behaviors emerge from composing simple, single-purpose devices
5. **Format Agnosticism**: The protocol supports multiple wire formats while maintaining semantic equivalence
6. **Lazy Evaluation**: Data is loaded on-demand through a link mechanism
7. **Stateless Devices**: All state is carried in messages, never in devices

### 1.3 Scope

This specification covers:
- The AO-Core resolution protocol
- Type-Annotated Binary Message (TABM) format
- Device interface contracts and complete device registry
- Path syntax and resolution semantics
- Commitment and verification mechanisms
- Device stack execution model
- Process and scheduling semantics
- Storage and caching architecture

---

## 2. Core Concepts

### 2.1 Messages

A **message** is the fundamental unit of data and computation in AO-Core. Messages are key-value maps where:

- **Keys** are binary strings (normalized to lowercase)
- **Values** are either binary strings, nested messages (maps), or links

Messages carry both data and metadata. The protocol distinguishes between:

1. **Base Messages**: Contain the primary state or data being operated upon (Message1)
2. **Request Messages**: Specify the computation or query to perform (Message2)
3. **Result Messages**: Contain the output of resolution

### 2.2 Devices

A **device** is a computational unit that implements one or more resolution functions. Devices are:

- **Stateless**: All state is carried in messages
- **Deterministic**: Given identical inputs, produce identical outputs
- **Composable**: Can be combined into stacks or chains
- **Versioned**: Identified by `name@major.minor` format

Every message has an associated device, specified by the `device` key. If not specified, a default message device is used.

### 2.3 Resolution

**Resolution** is the core operation of AO-Core:

```
resolve(Message1, Message2, Options) -> {Status, Result}
```

Where:
- `Message1`: The base message containing state and device specification
- `Message2`: The request message specifying the operation (typically via `path`)
- `Options`: Runtime configuration and context
- `Status`: One of `ok`, `error`, `skip`, or `pass`
- `Result`: The resolution output (message, value, or error information)

### 2.4 Paths

A **path** is a sequence of keys that specifies a traversal through nested messages. Paths are binary strings with components separated by `/`:

```
/key1/key2/key3
```

Path resolution follows these rules:
1. Each path component is resolved against the current message
2. Resolution may invoke the message's device
3. The result becomes the context for the next component
4. Resolution terminates when the path is exhausted or an error occurs

---

## 3. Type-Annotated Binary Message (TABM) Format

### 3.1 Overview

TABM is the canonical internal representation for AO-Core messages. It ensures consistent handling across different wire formats while preserving type information.

### 3.2 Structure

A TABM is a map where:
- All keys are binary strings
- All values are either:
  - Binary strings (terminal values)
  - Nested TABMs (submessages)
  - Links (references to external data)

### 3.3 Type Annotations

Rich types (integers, floats, atoms, lists) are encoded with type annotations in a special `ao-types` key:

```json
{
  "value": "42",
  "ao-types": "value=integer"
}
```

The `ao-types` field is a Structured Fields dictionary (RFC-9651) mapping key names to their types.

### 3.4 Supported Types

| Type | Description | Encoding |
|------|-------------|----------|
| `binary` | Raw binary data | Direct value |
| `integer` | Signed integer | Structured Fields integer |
| `float` | Floating point | Decimal string |
| `atom` | Symbolic constant | Structured Fields token |
| `list` | Ordered sequence | Structured Fields list |
| `explicit-type` | User-specified type | Full type specification |

### 3.5 Reserved Keys

The following keys have special semantic meaning:

| Key | Purpose |
|-----|---------|
| `device` | Specifies the message's device |
| `path` | Request path for resolution |
| `commitments` | Cryptographic signatures |
| `ao-types` | Type annotations |
| `priv` | Private/transient data (never serialized) |
| `body` | Primary data payload |
| `data` | Alternative data key (ANS-104 compatibility) |
| `id` | Message identifier (content hash) |
| `keys` | List of message keys |
| `hashpath` | Cryptographic computation chain |
| `assignments` | Scheduler slot assignments |
| `scheduler` | Scheduler device reference |
| `authority` | Signing authority specification |

### 3.6 Key Normalization

Keys undergo normalization:
1. Convert to binary string
2. Normalize to lowercase (except for ID fields)
3. Preserve case for:
   - Message IDs (43 characters, base64)
   - Keys starting with uppercase letters followed by hyphen

---

## 4. Path Syntax and Resolution

### 4.1 Basic Path Structure

Paths follow the pattern:
```
/Part1/Part2/.../PartN/
```

Where each part can be:
- A simple key: `key`
- A typed key: `key+type: value`
- A device specifier: `key~device` or `~device`
- A subpath resolution: `(/nested/path)`
- An index: `1` (for list access)

### 4.2 Device Specifiers

Device specifiers in paths allow resolution through a specific device:

| Syntax | Meaning |
|--------|---------|
| `~Device` | Resolve using Device as context |
| `Key~Device` | Resolve Key using Device |

Example:
```
/process~process@1.0/state
```

### 4.3 Typed Keys

Typed keys embed type information in the path:

| Syntax | Interpretation |
|--------|----------------|
| `key+int: 42` | Integer value |
| `key+float: 3.14` | Float value |
| `key+atom: foo` | Atom value |
| `key+list: [a,b,c]` | List value |

### 4.4 Subpath Resolution

Parenthesized paths are resolved recursively:

```
/outer/(/inner/key)/continuation
```

The subpath `/inner/key` is resolved first, and its result is used as context for `continuation`.

### 4.5 Query String Parameters

Paths may include query parameters:

```
/path?param1=value1&param2=value2
```

Query parameters are parsed into the request message.

### 4.6 Path Normalization Algorithm

```
FUNCTION normalize_path(RawPath):
    1. Convert to binary string
    2. Strip leading/trailing slashes
    3. Split on "/" separator
    4. For each component:
       a. URL-decode (percent-decode)
       b. Parse device specifiers (~)
       c. Parse type annotations (+)
       d. Parse subpaths (parentheses)
    5. Return normalized path components
```

---

## 5. Resolution Protocol

### 5.1 Resolution Algorithm

The resolution algorithm processes a request against a base message:

```
FUNCTION resolve(Base, Request, Options):
    1. Normalize keys in both messages
    2. Extract path from Request (default: "/")
    3. Extract device from Base (default: message@1.0)
    4. For each path component:
       a. Look up key in current message
       b. If key maps to device function, invoke it
       c. If key maps to submessage, recurse
       d. Handle special statuses (skip, pass)
    5. Return {Status, Result}
```

### 5.2 Device Resolution

When a key corresponds to a device function:

```
FUNCTION device_resolve(Device, Key, Base, Request, Options):
    1. Load device module
    2. Check device exports:
       a. If Key function exists with arity 3:
          - Invoke Device:Key(Base, Request, Options)
       b. Else if 'info' function exists:
          - Get 'exports' from info
          - Check if Key is exported
          - Invoke or return raw value
    3. Handle special keys (id, keys, hashpath, etc.)
    4. Return {Status, Result}
```

### 5.3 Status Codes

| Status | Meaning | Behavior |
|--------|---------|----------|
| `ok` | Successful resolution | Return result |
| `error` | Resolution failed | Propagate error |
| `skip` | Skip remaining stack | Stop processing |
| `pass` | Pass to next handler | Continue to next device |

### 5.4 Path Resolution Modes

| Mode | Description |
|------|-------------|
| `default` | Standard resolution through device |
| `direct` | Bypass device, access raw key |
| `lazy` | Return link without loading |
| `deep` | Recursively resolve all links |

---

## 6. Commitment Model

### 6.1 Overview

Commitments provide cryptographic proof of message authenticity and integrity. The protocol supports multiple commitment schemes through commitment devices.

### 6.2 Commitment Structure

Commitments are stored in the `commitments` key as a map from signer ID to commitment data:

```json
{
  "key1": "value1",
  "commitments": {
    "<signer-id>": {
      "keys": ["key1"],
      "signature": "<signature-bytes>",
      "algorithm": "rsa-pss-sha256"
    }
  }
}
```

### 6.3 Commitment Operations

#### 6.3.1 Commit

Creates a cryptographic commitment for a message:

```
commit(Message, Wallet, Options) -> CommittedMessage
```

Steps:
1. Select keys to sign (all by default, or specified subset)
2. Generate signature base from selected keys
3. Create signature using wallet key
4. Add commitment entry to `commitments` key

#### 6.3.2 Verify

Verifies commitments in a message:

```
verify(Message, Signers, Options) -> boolean
```

Where `Signers` can be:
- `all`: Verify all signers
- `any`: Verify at least one signer
- `[SignerID, ...]`: Verify specific signers

### 6.4 HTTP Message Signatures (RFC-9421)

For HTTP transport, commitments use HTTP Message Signatures:

1. **Signature Input**: Specifies signed components
   ```
   sig1=("@method" "@path" "content-digest");keyid="...";alg="rsa-pss-sha256"
   ```

2. **Signature**: Base64-encoded signature bytes
   ```
   sig1=:base64signature:
   ```

3. **Content Digest**: SHA-256 of body content
   ```
   sha-256=:base64hash:
   ```

### 6.5 Supported Algorithms

| Algorithm | Description | Key Type |
|-----------|-------------|----------|
| `rsa-pss-sha256` | RSA-PSS with SHA-256 | RSA Public Key |
| `hmac-sha256` | HMAC with SHA-256 | Shared Secret |
| `ed25519` | EdDSA with Curve25519 | Ed25519 Key |
| `unsigned-sha256` | Unsigned content hash | None |

### 6.6 Arweave Wallet Format

Commitments support Arweave wallets:
- **Format**: RSA-4096 key pair in JWK format
- **Address**: SHA-256 hash of public key modulus, Base64URL encoded
- **Signing**: RSA-PSS with SHA-256

---

## 7. Device Architecture

### 7.1 Device Interface

Devices implement a standard interface with optional functions:

```
INTERFACE Device:
    # Information
    info() -> DeviceInfo

    # Lifecycle
    init(Base, Request, Options) -> {ok, State} | {error, Reason}

    # Resolution (key-based)
    <key>(Base, Request, Options) -> {Status, Result}

    # Special Operations
    compute(Base, Request, Options) -> {ok, Result}

    # Codec operations
    to(Message, Request, Options) -> {ok, Encoded}
    from(Encoded, Request, Options) -> {ok, Message}
    commit(Message, Request, Options) -> {ok, Committed}
    verify(Message, Request, Options) -> {ok, boolean}
    id(Message, Request, Options) -> {ok, ID}
```

### 7.2 Device Info Structure

```
DeviceInfo = {
    "exports": [Key, ...],        # Exported resolution keys
    "excludes": [Key, ...],       # Keys to exclude from resolution
    "default": default | term,    # Default resolution behavior
    "handler": Key,               # Default handler key
    "grouper": Key,               # Group handler key
    "requires_initialization": boolean
}
```

### 7.3 Core Devices

#### 7.3.1 Message Device (`message@1.0`)

The identity device that resolves keys directly from the message:

**Exported Keys:**
- `id`: Message content hash (SHA-256, Base64URL)
- `keys`: List of message keys
- `set`: Create new message with additional keys
- `remove`: Remove keys from message
- `hashpath`: Current hashpath value

#### 7.3.2 Stack Device (`stack@1.0`)

Composes multiple devices into a processing pipeline:

**Execution Modes:**
- `fold`: Sequential execution, each result feeds the next
- `map`: Parallel execution, results collected

**Device Stack Structure:**
```json
{
  "device": "stack@1.0",
  "device-stack": [
    {"device": "device1@1.0"},
    {"device": "device2@1.0"},
    {"device": "device3@1.0"}
  ]
}
```

**Status Handling:**
- `ok`: Continue to next device
- `skip`: Stop processing, return current result
- `pass`: Skip current device, try next
- `error`: Stop processing, return error

#### 7.3.3 Process Device (`process@1.0`)

Implements stateful process semantics:

**Key Functions:**
- `init`: Initialize process with image and scheduler
- `compute`: Execute computation on message
- `push`: Add message to process inbox
- `slot`: Get message at specific slot
- `now`: Current slot number
- `state`: Current process state

**Process Structure:**
```json
{
  "device": "process@1.0",
  "scheduler": "<scheduler-id>",
  "image": "<initial-state-id>",
  "execution-device": "stack@1.0",
  "device-stack": [...]
}
```

#### 7.3.4 Scheduler Device (`scheduler@1.0`)

Assigns ordering to process messages:

**Key Functions:**
- `schedule`: Assign slot to new message
- `slot`: Retrieve message at slot
- `next`: Next unprocessed slot
- `assignments`: List of slot assignments

**Assignment Structure:**
```json
{
  "message": "<message-id>",
  "slot": 42,
  "epoch": 1,
  "nonce": "abc123",
  "timestamp": 1704067200000,
  "block-height": 1500000
}
```

#### 7.3.5 WASM Device (`wasm-64@1.0`)

Executes WebAssembly computations:

**Key Functions:**
- `init`: Initialize WASM instance from image
- `compute`: Execute WASM function
- `snapshot`: Capture instance state
- `import`: Import external function
- `export`: Export WASM function

**Memory Model:**
- 64-bit addressing support
- Page-based memory allocation (64KB pages)
- Linear memory with bounds checking

### 7.4 Codec Devices

#### 7.4.1 ANS-104 Codec (`ans104@1.0`)

Handles Arweave bundle format:

**Operations:**
- `serialize`: Message to ANS-104 binary
- `deserialize`: ANS-104 binary to message
- `id`: Calculate bundle item ID

#### 7.4.2 HTTP Signature Codec (`httpsig@1.0`)

Handles HTTP Message Signatures (RFC-9421):

**Operations:**
- `commit`: Add HTTP signature to message
- `verify`: Verify HTTP signature
- `to`: Convert to HTTP wire format
- `from`: Parse from HTTP wire format

#### 7.4.3 JSON Codec (`json@1.0`)

JSON serialization with type preservation:

**Operations:**
- `serialize`: Message to JSON
- `deserialize`: JSON to message
- Handles `ao-types` for rich type encoding

#### 7.4.4 Structured Codec (`structured@1.0`)

TABM with full type annotations:

**Operations:**
- `serialize`: Message to structured format
- `deserialize`: Structured format to message
- Preserves all type information

### 7.5 Execution Devices

#### 7.5.1 Lua Device (`lua@5.3a`)

Embedded Lua scripting:

**Key Functions:**
- `init`: Initialize Lua state
- `compute`: Execute Lua code
- `snapshot`: Capture Lua state
- `restore`: Restore from snapshot

**Sandboxing:**
Disabled functions for security:
- `os.execute`, `os.exit`, `os.remove`, `os.rename`, `os.tmpname`
- `io.popen`, `io.input`, `io.output`, `io.open`
- `loadfile`, `dofile`
- `debug.debug`
- `load`, `loadstring` (can be enabled)

#### 7.5.2 WASI Device (`wasi@1.0`)

WebAssembly System Interface:

**Standard Imports:**
- `fd_read`, `fd_write`: File descriptor I/O
- `clock_time_get`: Time access
- `args_get`, `args_sizes_get`: Argument handling
- `environ_get`, `environ_sizes_get`: Environment

**Security Model:**
- Capability-based security
- No filesystem access by default
- Stdout/stderr redirected to message

### 7.6 Utility Devices

#### 7.6.1 Apply Device (`apply@1.0`)

Applies transformations to messages:

**Operations:**
- `apply`: Apply function to message
- `merge`: Merge multiple messages

#### 7.6.2 Cache Device (`cache@1.0`)

Controls caching behavior:

**Cache-Control Directives:**
- `no-cache`: Always revalidate
- `no-store`: Never cache
- `max-age`: Maximum cache duration
- `must-revalidate`: Revalidation required

#### 7.6.3 Router Device (`router@1.0`)

Routes requests to appropriate handlers:

**Routing Rules:**
- Pattern-based path matching
- Device delegation
- Load balancing support

#### 7.6.4 Hook Device (`hook@1.0`)

Intercepts and modifies resolution:

**Hook Points:**
- `pre`: Before device resolution
- `post`: After device resolution
- `error`: On resolution error

### 7.7 Security Devices

#### 7.7.1 Auth Hook Device (`auth-hook@1.0`)

Authentication and authorization:

**Operations:**
- Verify request signatures
- Check authority permissions
- Validate access tokens

#### 7.7.2 PODA Device (`poda@1.0`)

Proof of Data Availability:

**Parameters:**
- `authorities`: List of trusted addresses
- `quorum`: Minimum required validations

#### 7.7.3 Green Zone Device (`green-zone@1.0`)

Trusted execution environment:

**Operations:**
- Verify attestations
- Manage trusted execution contexts
- Hardware-backed security (optional)

### 7.8 Payment Devices

#### 7.8.1 Simple Pay Device (`simple-pay@1.0`)

Basic payment processing:

**Operations:**
- `estimate`: Estimate computation cost
- `pay`: Process payment
- `balance`: Check balance

#### 7.8.2 P4 Device (`p4@1.0`)

Advanced payment protocol:

**Features:**
- Multi-currency support
- Payment channels
- Escrow functionality

---

## 8. Device Stack Execution Model

### 8.1 Stack Configuration

A device stack is an ordered list of devices that process messages:

```json
{
  "device": "stack@1.0",
  "device-stack": [
    {"device": "auth-hook@1.0"},
    {"device": "cache@1.0"},
    {"device": "wasm-64@1.0"},
    {"device": "poda@1.0"}
  ]
}
```

### 8.2 Execution Modes

#### 8.2.1 Fold Mode (Default)

Sequential execution where each device receives the output of the previous:

```
Input -> Device1 -> Result1 -> Device2 -> Result2 -> ... -> FinalResult
```

#### 8.2.2 Map Mode

Parallel execution where each device receives the original input:

```
Input -> Device1 -> Result1 \
      -> Device2 -> Result2  } -> Collect Results
      -> Device3 -> Result3 /
```

### 8.3 Status Propagation

| Device Status | Stack Behavior |
|---------------|----------------|
| `{ok, Result}` | Continue with Result |
| `{skip, Result}` | Stop stack, return Result |
| `{pass, _}` | Skip device, continue with unchanged input |
| `{error, Reason}` | Stop stack, propagate error |

### 8.4 Multipass Processing

The stack supports multiple resolution passes:

```json
{
  "device": "multipass@1.0",
  "passes": [
    {"path": "/init"},
    {"path": "/compute"},
    {"path": "/finalize"}
  ]
}
```

Each pass resolves against the result of the previous pass.

---

## 9. Hashpath: Cryptographic Computation Chains

### 9.1 Overview

Hashpath provides a cryptographic commitment chain that proves the sequence of computations applied to a message. It enables verification of computational history without re-executing all operations.

### 9.2 Structure

A hashpath is a chain of hashes where each link represents a computation step:

```
H_0 = hash(initial_state)
H_n = hash(H_{n-1} || computation_n)
```

### 9.3 Operations

#### 9.3.1 Start

Initialize a new hashpath:

```
start(Message) -> InitialHash
```

Computes: `SHA-256(message_id)`

#### 9.3.2 Chain

Extend hashpath with new element:

```
chain(CurrentHash, NewElement) -> NewHash
```

Computes: `SHA-256(CurrentHash || element_id)`

#### 9.3.3 Accumulate

Chain multiple elements:

```
accumulate(CurrentHash, [E1, E2, ...]) -> NewHash
```

Applies `chain` sequentially for each element.

### 9.4 Hashpath in Messages

Messages carry their hashpath:

```json
{
  "device": "process@1.0",
  "hashpath": "base64-encoded-hash",
  "hashpath-alg": "sha-256"
}
```

### 9.5 Verification

Verify computational history:

1. Obtain initial state
2. Replay all computations
3. Compare hashpath at each step
4. Final hashpath must match

---

## 10. Process and Scheduling

### 10.1 Process Model

A process is a persistent computation context:

```json
{
  "device": "process@1.0",
  "process": "<process-id>",
  "scheduler": "<scheduler-id>",
  "image": "<initial-wasm-image>",
  "execution-device": "stack@1.0"
}
```

### 10.2 Process Lifecycle

1. **Creation**: Initialize with image and scheduler
2. **Scheduling**: Messages assigned slots by scheduler
3. **Execution**: Compute each slot in order
4. **State Update**: Process state updated after each computation

### 10.3 Slot Assignment

Schedulers assign monotonically increasing slots:

```
Slot(Message) = {
  slot: integer,           # Sequence number
  epoch: integer,          # Scheduling epoch
  timestamp: integer,      # Block timestamp
  block-height: integer,   # Arweave block height
  nonce: binary            # Uniqueness nonce
}
```

### 10.4 Message Ordering

Messages are processed in slot order:

```
Process State_n = Execute(State_{n-1}, Message_at_slot_n)
```

This ensures deterministic replay.

### 10.5 Cron Scheduling

Periodic message scheduling:

```json
{
  "device": "cron@1.0",
  "interval": "1-hour",
  "action": {"path": "/tick"}
}
```

Supported intervals: second, minute, hour, block, custom.

---

## 11. Storage and Caching

### 11.1 Store Abstraction

The protocol defines an abstract storage interface:

```
INTERFACE Store:
    type() -> atom                    # Store type identifier
    read(Key) -> {ok, Value} | not_found
    write(Key, Value) -> ok
    list(Prefix) -> [Key]
    make_link(Source, Target) -> ok
    resolve_link(Key) -> {ok, ResolvedKey}
    reset() -> ok
    close() -> ok
```

### 11.2 Store Types

| Store Type | Description |
|------------|-------------|
| `hb_store_fs` | Filesystem-based storage |
| `hb_store_lmdb` | LMDB key-value storage |
| `hb_store_remote` | Remote HTTP storage |
| `hb_store_gateway` | Arweave gateway storage |
| `hb_store_composite` | Layered store composition |
| `hb_store_rocksdb` | RocksDB storage |
| `hb_store_lru` | LRU cache store |
| `hb_store_iolist` | In-memory I/O list store |

### 11.3 Composite Stores

Multiple stores can be composed:

```
CompositeStore = [ReadStore1, ReadStore2, ..., WriteStore]
```

Reads cascade through stores; writes go to the last store.

### 11.4 Cache Layers

The caching system operates at three levels:

1. **Raw Layer**: Binary data indexed by content hash
2. **Hashpath Layer**: Graph of computation chains
3. **Message Layer**: Full message references with links

### 11.5 Link Resolution

Links provide lazy loading:

```json
{
  "nested": {
    "type": "link",
    "id": "<content-hash>",
    "lazy": true
  }
}
```

Resolution modes:
- **Lazy**: Return link descriptor
- **Shallow**: Load one level
- **Deep**: Recursively load all

### 11.6 Cache Control

HTTP-style cache control:

```json
{
  "cache-control": ["no-cache", "no-store", "max-age=3600"]
}
```

---

## 12. Network Protocol

### 12.1 HTTP Transport

AO-Core messages are transported over HTTP using:

- **Method**: POST for resolution requests, GET for reads
- **Path**: Encodes the resolution path
- **Headers**: Carry message metadata and signatures
- **Body**: Carries message payload

### 12.2 Request Format

```http
POST /<path> HTTP/2
content-type: application/httpsig
signature-input: sig1=("@method" "@path" "content-digest");keyid="...";created=...
signature: sig1=:<base64-signature>:
content-digest: sha-256=:<base64-hash>:

<body>
```

### 12.3 Response Format

```http
HTTP/2 200
content-type: application/httpsig
ao-result: body

<result-body>
```

### 12.4 Special Headers

| Header | Purpose |
|--------|---------|
| `signature-input` | Signature parameters (RFC-9421) |
| `signature` | Signature value |
| `content-digest` | Body hash |
| `ao-result` | Result location indicator |
| `ao-status` | Resolution status |
| `ao-types` | Type annotations |

### 12.5 Content Negotiation

| Header | Purpose |
|--------|---------|
| `accept` | Preferred response codec |
| `accept-bundle` | Bundle nested messages |
| `codec-device` | Explicit codec specification |
| `cache-control` | Caching directives |

### 12.6 Multipart Messages

For bundled messages:

```http
content-type: multipart/related; boundary="..."

--boundary
content-id: <main-message>

<main message body>

--boundary
content-id: <nested-message>

<nested message body>

--boundary--
```

---

## 13. Security Model

### 13.1 Trust Model

AO-Core supports multiple trust configurations:

| Model | Description |
|-------|-------------|
| Trustless | All messages cryptographically verified |
| Authority-based | Trust specific signers |
| Quorum-based | Require multiple authorities |
| Delegated | Trust delegated to another authority |

### 13.2 Proof of Authority (PODA)

PODA provides consensus through trusted authorities:

```json
{
  "device": "poda@1.0",
  "authorities": ["addr1", "addr2", "addr3"],
  "quorum": 2
}
```

Validation requires:
1. Valid signatures from `quorum` authorities
2. Signatures over the same message content
3. All signers in the `authorities` set

### 13.3 Message Integrity

Message integrity is ensured through:

1. **Content Hashing**: SHA-256 of message content
2. **Signature Coverage**: Explicit specification of signed keys
3. **Commitment Verification**: Cryptographic proof of origin
4. **Hashpath Chain**: Verifiable computation history

### 13.4 Private Data

The `priv` key stores transient data that:
- Is never serialized to storage
- Is never transmitted over the network
- Is stripped during message conversion
- Can store temporary computation state

### 13.5 Rate Limiting

Built-in rate limiting support:

```json
{
  "rate-limit": {
    "requests-per-second": 100,
    "burst": 50,
    "by": "address"
  }
}
```

### 13.6 Secret Management

Secrets are managed through dedicated devices:

```json
{
  "device": "secret@1.0",
  "encryption": "aes-256-gcm",
  "key-derivation": "pbkdf2"
}
```

---

## 14. Conformance

### 14.1 Implementation Requirements

A conforming implementation MUST:

1. Implement the resolution algorithm as specified
2. Support TABM message format
3. Implement at least `message@1.0` device
4. Support `httpsig@1.0` commitment verification
5. Handle path normalization correctly
6. Implement proper status propagation
7. Support device stack execution

### 14.2 Optional Features

Implementations MAY support:

1. Additional codec devices
2. Additional commitment algorithms
3. Extended device interfaces
4. Custom storage backends
5. WASM execution devices
6. Scripting language devices (Lua, etc.)

### 14.3 Interoperability Requirements

For network interoperability:

1. MUST support HTTP/2 transport
2. MUST support RFC-9421 message signatures
3. MUST support ANS-104 bundle format
4. SHOULD support multipart message bundling

---

## Appendix A: Complete Device Registry

### A.1 Core Devices

| Device ID | Module | Purpose |
|-----------|--------|---------|
| `message@1.0` | dev_message | Identity/base message access |
| `stack@1.0` | dev_stack | Device composition |
| `process@1.0` | dev_process | Stateful processes |
| `scheduler@1.0` | dev_scheduler | Message scheduling |
| `apply@1.0` | dev_apply | Message transformation |
| `multipass@1.0` | dev_multipass | Multi-pass processing |

### A.2 Execution Devices

| Device ID | Module | Purpose |
|-----------|--------|---------|
| `wasm-64@1.0` | dev_wasm | WebAssembly execution (64-bit) |
| `lua@5.3a` | dev_lua | Lua scripting |
| `wasi@1.0` | dev_wasi | WASM System Interface |
| `genesis-wasm@1.0` | dev_genesis_wasm | Genesis WASM images |
| `wao@1.0` | dev_wao | WAO WASM caching |

### A.3 Codec Devices

| Device ID | Module | Purpose |
|-----------|--------|---------|
| `httpsig@1.0` | dev_codec_httpsig | HTTP Message Signatures |
| `ans104@1.0` | dev_codec_ans104 | Arweave bundles |
| `json@1.0` | dev_codec_json | JSON codec |
| `structured@1.0` | dev_codec_structured | Rich TABM |
| `flat@1.0` | dev_codec_flat | Flat key-value |

### A.4 Storage Devices

| Device ID | Module | Purpose |
|-----------|--------|---------|
| `cache@1.0` | dev_cache | Cache control |
| `lookup@1.0` | dev_lookup | Data lookup |
| `manifest@1.0` | dev_manifest | Manifest handling |
| `dedup@1.0` | dev_dedup | Deduplication |

### A.5 Security Devices

| Device ID | Module | Purpose |
|-----------|--------|---------|
| `poda@1.0` | dev_poda | Proof of Data Availability |
| `auth-hook@1.0` | dev_auth_hook | Authentication |
| `green-zone@1.0` | dev_green_zone | Trusted execution |
| `snp@1.0` | dev_snp | AMD SNP attestation |
| `secret@1.0` | dev_secret | Secret management |

### A.6 Payment Devices

| Device ID | Module | Purpose |
|-----------|--------|---------|
| `simple-pay@1.0` | dev_simple_pay | Basic payments |
| `p4@1.0` | dev_p4 | Advanced payment protocol |
| `faff@1.0` | dev_faff | Fee handling |

### A.7 Networking Devices

| Device ID | Module | Purpose |
|-----------|--------|---------|
| `router@1.0` | dev_router | Request routing |
| `relay@1.0` | dev_relay | Message relay |
| `push@1.0` | dev_push | Push notifications |

### A.8 Utility Devices

| Device ID | Module | Purpose |
|-----------|--------|---------|
| `meta@1.0` | dev_meta | Node introspection |
| `cron@1.0` | dev_cron | Scheduled execution |
| `hook@1.0` | dev_hook | Resolution hooks |
| `monitor@1.0` | dev_monitor | Monitoring |
| `profile@1.0` | dev_profile | Profiling |
| `patch@1.0` | dev_patch | Message patching |
| `name@1.0` | dev_name | Name resolution |

### A.9 Integration Devices

| Device ID | Module | Purpose |
|-----------|--------|---------|
| `arweave@2.9-pre` | dev_arweave | Arweave integration |
| `compute@1.0` | dev_cu | Compute unit |
| `delegated-compute@1.0` | dev_delegated_compute | Delegated computation |
| `json-iface@1.0` | dev_json_iface | JSON interface |

---

## Appendix B: Wire Format Examples

### B.1 Simple Message (TABM)

```json
{
  "device": "message@1.0",
  "name": "Alice",
  "count": "42",
  "ao-types": "count=integer"
}
```

### B.2 Process Message

```json
{
  "device": "process@1.0",
  "process": "abc123...",
  "scheduler": "xyz789...",
  "image": "wasm-image-id",
  "execution-device": "stack@1.0",
  "device-stack": [
    {"device": "auth-hook@1.0"},
    {"device": "wasm-64@1.0"},
    {"device": "poda@1.0"}
  ]
}
```

### B.3 Committed Message

```json
{
  "greeting": "Hello",
  "commitments": {
    "signer-abc123": {
      "keys": "greeting",
      "algorithm": "rsa-pss-sha256",
      "signature": "base64..."
    }
  }
}
```

### B.4 Scheduler Assignment

```json
{
  "device": "scheduler@1.0",
  "type": "assignment",
  "message": "message-id",
  "slot": 42,
  "epoch": 1,
  "timestamp": 1704067200000,
  "block-height": 1500000
}
```

### B.5 Stack with Multipass

```json
{
  "device": "multipass@1.0",
  "passes": [
    {"path": "/init", "mode": "fold"},
    {"path": "/compute", "mode": "fold"},
    {"path": "/commit", "mode": "map"}
  ],
  "device-stack": [
    {"device": "wasm-64@1.0"},
    {"device": "poda@1.0"}
  ]
}
```

---

## Appendix C: Error Codes

| Code | Meaning |
|------|---------|
| `not_found` | Key or resource not found |
| `invalid_path` | Malformed path specification |
| `device_not_found` | Specified device unavailable |
| `verification_failed` | Commitment verification failed |
| `resolution_error` | General resolution failure |
| `timeout` | Operation timeout |
| `unauthorized` | Authorization failed |
| `rate_limited` | Rate limit exceeded |
| `invalid_message` | Malformed message format |
| `compute_error` | Computation failure |

---

## Appendix D: Path Syntax Grammar

```ebnf
path            = "/" | "/" path-parts
path-parts      = path-part ("/" path-part)*
path-part       = simple-key | typed-key | device-spec | subpath
simple-key      = key-char+
typed-key       = key "+type:" value
device-spec     = "~" device-name | key "~" device-name
subpath         = "(" path ")"
device-name     = name "@" version
version         = major "." minor
key-char        = ALPHA | DIGIT | "-" | "_"
```

---

## References

1. RFC-9421: HTTP Message Signatures
2. RFC-9651: Structured Field Values for HTTP
3. ANS-104: Arweave Bundle Specification
4. WebAssembly Core Specification 2.0
5. WASI Preview 1 Specification
6. Lua 5.3 Reference Manual
7. SHA-256: FIPS 180-4

---

*End of Specification*
