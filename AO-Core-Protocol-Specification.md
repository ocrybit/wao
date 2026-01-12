# AO-Core Protocol Specification

**Version:** 1.0
**Status:** Draft
**Date:** January 2026

---

## Abstract

AO-Core is a decentralized computation protocol built on the principle of message-passing between stateless, deterministic computational units called *devices*. The protocol provides a universal framework for verifiable, reproducible computation where messages serve as both data and computation requests. This specification defines the core protocol concepts, message formats, resolution semantics, commitment mechanisms, and device architecture independent of any specific implementation.

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

### 1.3 Scope

This specification covers:
- The AO-Core resolution protocol
- Type-Annotated Binary Message (TABM) format
- Device interface contracts
- Commitment and verification mechanisms
- Path resolution semantics

---

## 2. Core Concepts

### 2.1 Messages

A **message** is the fundamental unit of data and computation in AO-Core. Messages are key-value maps where:

- **Keys** are binary strings (normalized to lowercase)
- **Values** are either binary strings or nested messages (maps)

Messages carry both data and metadata. The protocol distinguishes between:

1. **Base Messages**: Contain the primary state or data being operated upon
2. **Request Messages**: Specify the computation or query to perform
3. **Result Messages**: Contain the output of resolution

### 2.2 Devices

A **device** is a computational unit that implements one or more resolution functions. Devices are:

- **Stateless**: All state is carried in messages
- **Deterministic**: Given identical inputs, produce identical outputs
- **Composable**: Can be combined into stacks or chains

Every message has an associated device, specified by the `device` key. If not specified, a default identity device is used.

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
- `Result`: The resolution output (message or value)

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

```
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

### 3.5 Reserved Keys

The following keys have special meaning:

| Key | Purpose |
|-----|---------|
| `device` | Specifies the message's device |
| `path` | Request path for resolution |
| `commitments` | Cryptographic signatures |
| `ao-types` | Type annotations |
| `priv` | Private/transient data (never serialized) |
| `body` | Primary data payload |
| `data` | Alternative data key (ANS-104 compatibility) |

---

## 4. Resolution Protocol

### 4.1 Resolution Algorithm

The resolution algorithm processes a request against a base message:

```
FUNCTION resolve(Base, Request, Options):
    1. Normalize keys in both messages
    2. Extract path from Request (default: "/")
    3. Extract device from Base (default: identity device)
    4. For each path component:
       a. Look up key in current message
       b. If key maps to device function, invoke it
       c. If key maps to submessage, recurse
       d. If not found, return error
    5. Return {Status, Result}
```

### 4.2 Device Resolution

When a key corresponds to a device function:

```
FUNCTION device_resolve(Device, Key, Base, Request, Options):
    1. Load device module
    2. If device exports Key function:
       a. Invoke Device:Key(Base, Request, Options)
       b. Return result
    3. Else if device exports 'info' function:
       a. Get reserved keys from info
       b. If Key in reserved keys, return Base[Key]
    4. Else return not_found
```

### 4.3 Status Codes

| Status | Meaning |
|--------|---------|
| `ok` | Successful resolution |
| `error` | Recoverable error |
| `skip` | Skip remaining processing |
| `pass` | Pass to next handler |

### 4.4 Path Normalization

Paths undergo normalization before resolution:

1. Convert to binary string
2. Split on `/` separator
3. Filter empty components
4. Percent-decode each component
5. Normalize case (lowercase for non-ID keys)

---

## 5. Commitment Model

### 5.1 Overview

Commitments provide cryptographic proof of message authenticity and integrity. The protocol supports multiple commitment schemes through commitment devices.

### 5.2 Commitment Structure

Commitments are stored in the `commitments` key:

```
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

### 5.3 Commitment Operations

#### 5.3.1 Commit

Creates a cryptographic commitment for a message:

```
commit(Message, Wallet, Device) -> CommittedMessage
```

#### 5.3.2 Verify

Verifies all commitments in a message:

```
verify(Message, Signers) -> boolean
```

Where `Signers` can be:
- `all`: Verify all signers
- `any`: Verify at least one signer
- `[SignerID, ...]`: Verify specific signers

### 5.4 Supported Algorithms

| Algorithm | Description |
|-----------|-------------|
| `rsa-pss-sha256` | RSA-PSS with SHA-256 |
| `hmac-sha256` | HMAC with SHA-256 |
| `unsigned-sha256` | Unsigned content hash |

### 5.5 HTTP Message Signatures (RFC-9421)

For HTTP transport, commitments use HTTP Message Signatures:

1. **Signature Base**: Canonicalized representation of signed components
2. **Signature Parameters**: Algorithm, key ID, created timestamp
3. **Signature**: Base64-encoded signature bytes

---

## 6. Device Architecture

### 6.1 Device Interface

Devices implement a standard interface with optional functions:

```
INTERFACE Device:
    # Information
    info() -> DeviceInfo

    # Lifecycle
    init(Base, Request, Options) -> {ok, State} | {error, Reason}

    # Resolution (key-based)
    <key>(Base, Request, Options) -> {Status, Result}

    # Codec operations
    to(Message, Request, Options) -> {ok, Encoded}
    from(Encoded, Request, Options) -> {ok, Message}
    commit(Message, Request, Options) -> {ok, Committed}
    verify(Message, Request, Options) -> {ok, boolean}
```

### 6.2 Core Devices

#### 6.2.1 Message Device (`message@1.0`)

The identity device that resolves keys directly from the message:

- Provides access to raw key values
- Handles reserved keys (`id`, `keys`, `set`, `remove`)
- Supports hashpath generation

#### 6.2.2 Stack Device (`stack@1.0`)

Composes multiple devices into a processing pipeline:

- Manages device stack configuration
- Routes resolution through stack layers
- Supports multi-pass processing

#### 6.2.3 Process Device (`process@1.0`)

Implements stateful process semantics:

- Manages process state across computations
- Handles message scheduling
- Integrates with scheduler devices

#### 6.2.4 Scheduler Device (`scheduler@1.0`)

Assigns ordering to process messages:

- Generates slot assignments
- Manages message sequencing
- Provides assignment retrieval

#### 6.2.5 WASM Device (`wasm-64@1.0`)

Executes WebAssembly computations:

- Manages WASM instances
- Handles memory operations
- Supports 64-bit addressing

### 6.3 Codec Devices

Codec devices handle format conversion:

| Device | Format |
|--------|--------|
| `ans104@1.0` | Arweave ANS-104 bundles |
| `httpsig@1.0` | HTTP Message Signatures |
| `json@1.0` | JSON |
| `structured@1.0` | TABM with rich types |
| `flat@1.0` | Flattened path-value pairs |

### 6.4 Device Versioning

Devices are versioned using semantic versioning:

```
<device-name>@<major>.<minor>
```

Version compatibility rules:
- Same major version: API compatible
- Different major version: May have breaking changes

---

## 7. Hashpath: Cryptographic Computation Chains

### 7.1 Overview

Hashpath provides a cryptographic commitment chain that proves the sequence of computations applied to a message.

### 7.2 Structure

A hashpath is a chain of hashes where each link represents a computation step:

```
H_0 = hash(initial_state)
H_n = hash(H_{n-1} || computation_n)
```

### 7.3 Operations

#### 7.3.1 Chain

Extends the hashpath with a new computation:

```
chain(CurrentHash, NewElement) -> NewHash
```

#### 7.3.2 Accumulate

Combines multiple elements into the hashpath:

```
accumulate(CurrentHash, [Element1, Element2, ...]) -> NewHash
```

### 7.4 Verification

Any party can verify a hashpath by:
1. Obtaining the initial state
2. Replaying all computations
3. Comparing final hashes

---

## 8. Storage and Caching

### 8.1 Store Abstraction

The protocol defines an abstract storage interface:

```
INTERFACE Store:
    read(Key) -> {ok, Value} | {error, not_found}
    write(Key, Value) -> ok | {error, Reason}
    list(Prefix) -> [Key]
    make_link(Source, Target) -> ok
    resolve_link(Key) -> {ok, ResolvedKey}
```

### 8.2 Cache Layers

The caching system operates at three levels:

1. **Raw Layer**: Binary data indexed by content hash
2. **Hashpath Layer**: Graph of computation chains
3. **Message Layer**: Full message references

### 8.3 Links

Links provide lazy loading of nested data:

```
{
  "nested": {
    "type": "link",
    "id": "<content-hash>",
    "lazy": true
  }
}
```

Link resolution occurs transparently during path traversal.

---

## 9. Network Protocol

### 9.1 HTTP Transport

AO-Core messages are transported over HTTP using:

- **Method**: POST for resolution requests
- **Path**: Encodes the resolution path
- **Headers**: Carry message metadata and signatures
- **Body**: Carries message payload

### 9.2 Request Format

```http
POST /<path> HTTP/2
content-type: application/httpsig
signature-input: sig1=("@method" "@path" "content-digest");keyid="..."
signature: sig1=:<base64-signature>:
content-digest: sha-256=:<base64-hash>:

<body>
```

### 9.3 Response Format

```http
HTTP/2 200
content-type: application/httpsig
ao-result: body

<result-body>
```

### 9.4 Content Negotiation

Clients specify preferred formats via:
- `accept`: Preferred response codec
- `accept-bundle`: Whether to bundle nested messages
- `codec-device`: Explicit codec specification

---

## 10. Security Model

### 10.1 Trust Model

AO-Core supports multiple trust configurations:

1. **Trustless**: All messages cryptographically verified
2. **Authority-based**: Trust specific signers
3. **Quorum-based**: Require multiple authorities

### 10.2 Proof of Authority (PODA)

PODA provides consensus through trusted authorities:

```
PODA Parameters:
  - authorities: [Address1, Address2, ...]
  - quorum: Minimum required validations
```

Validation requires:
1. Valid signatures from `quorum` authorities
2. Signatures over the same message content
3. All signers in the `authorities` set

### 10.3 Message Integrity

Message integrity is ensured through:

1. **Content Hashing**: SHA-256 of message content
2. **Signature Coverage**: Explicit specification of signed keys
3. **Commitment Verification**: Cryptographic proof of origin

### 10.4 Private Data

The `priv` key stores transient data that:
- Is never serialized to storage
- Is never transmitted over the network
- Is stripped during message conversion

---

## 11. Conformance

### 11.1 Implementation Requirements

A conforming implementation MUST:

1. Implement the resolution algorithm as specified
2. Support TABM message format
3. Implement at least `message@1.0` device
4. Support `httpsig@1.0` commitment verification
5. Handle path normalization correctly

### 11.2 Optional Features

Implementations MAY support:

1. Additional codec devices
2. Additional commitment algorithms
3. Extended device interfaces
4. Custom storage backends

---

## Appendix A: Wire Format Examples

### A.1 Simple Message (TABM)

```json
{
  "device": "message@1.0",
  "name": "Alice",
  "count": "42",
  "ao-types": "count=integer"
}
```

### A.2 Nested Message

```json
{
  "device": "process@1.0",
  "process": {
    "image": "abc123...",
    "scheduler": "xyz789..."
  }
}
```

### A.3 Committed Message

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

---

## Appendix B: Device Registry

### Standard Devices

| Device ID | Purpose |
|-----------|---------|
| `message@1.0` | Identity/base message access |
| `stack@1.0` | Device composition |
| `process@1.0` | Stateful processes |
| `scheduler@1.0` | Message scheduling |
| `wasm-64@1.0` | WASM execution |
| `multipass@1.0` | Multi-pass processing |
| `meta@1.0` | Node introspection |
| `router@1.0` | Request routing |

### Codec Devices

| Device ID | Format |
|-----------|--------|
| `httpsig@1.0` | HTTP Message Signatures |
| `ans104@1.0` | Arweave bundles |
| `json@1.0` | JSON |
| `structured@1.0` | Rich TABM |
| `flat@1.0` | Flat key-value |

---

## Appendix C: Error Codes

| Code | Meaning |
|------|---------|
| `not_found` | Key or resource not found |
| `invalid_path` | Malformed path specification |
| `device_not_found` | Specified device unavailable |
| `verification_failed` | Commitment verification failed |
| `resolution_error` | General resolution failure |

---

## References

1. RFC-9421: HTTP Message Signatures
2. RFC-9651: Structured Field Values for HTTP
3. ANS-104: Arweave Bundle Specification
4. WebAssembly Core Specification 2.0

---

*End of Specification*
