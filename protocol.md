# AO-Core Protocol

**A Decentralized Computation Protocol for Permanent, Verifiable Execution**

Version 1.0

---

## Abstract

AO-Core is a protocol for decentralized computation that achieves permanent, verifiable execution through message-passing semantics and content-addressed storage. The protocol enables trustless computation by separating concerns into independent layers: message representation, device-based computation, cryptographic commitment, and persistent storage. This document describes the theoretical foundations, design principles, and protocol semantics of AO-Core.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Design Philosophy](#2-design-philosophy)
3. [Core Concepts](#3-core-concepts)
4. [The Message Model](#4-the-message-model)
5. [Computation Model](#5-computation-model)
6. [The Converge Algorithm](#6-the-converge-algorithm)
7. [Device Architecture](#7-device-architecture)
8. [Storage Model](#8-storage-model)
9. [Cryptographic Foundations](#9-cryptographic-foundations)
10. [Scheduling and Ordering](#10-scheduling-and-ordering)
11. [Process Execution](#11-process-execution)
12. [Security Model](#12-security-model)
13. [Economic Model](#13-economic-model)
14. [Protocol Properties](#14-protocol-properties)
15. [Future Directions](#15-future-directions)

---

## 1. Introduction

### 1.1 Motivation

Traditional distributed systems face a fundamental tension between decentralization and verifiability. Centralized systems can easily verify computation but require trust in operators. Fully decentralized systems distribute trust but struggle to achieve consensus on computation results efficiently.

AO-Core resolves this tension through a novel approach: rather than requiring consensus on execution, the protocol ensures that computation is **deterministic** and **reproducible**. Any party can independently verify results by re-executing the same computation path. This approach, combined with permanent storage on Arweave, creates a system where computation becomes a mathematical proof rather than a trust assumption.

### 1.2 Goals

The AO-Core protocol aims to provide:

1. **Permanent Computation**: Results persist indefinitely on decentralized storage
2. **Verifiable Execution**: Any party can independently verify computation results
3. **Composable Processes**: Independent processes can interact through message passing
4. **Flexible Trust**: Users choose their trust model through device selection
5. **Economic Sustainability**: Built-in payment mechanisms for computation resources

### 1.3 Scope

This document defines the AO-Core protocol at the conceptual level. It describes:

- The theoretical model underlying the protocol
- Semantic definitions for protocol components
- Security and trust assumptions
- Protocol invariants and guarantees

Implementation details are provided in the separate AO-Core Implementation Specification.

---

## 2. Design Philosophy

### 2.1 Messages as the Universal Primitive

In AO-Core, **everything is a message**. State, computation requests, results, processes, and even the protocol itself are represented as messages. This uniformity provides several advantages:

- **Simplicity**: A single abstraction handles all protocol concerns
- **Composability**: Messages can contain other messages, enabling complex structures
- **Addressability**: Every message has a unique, content-derived identifier
- **Permanence**: Messages can be stored and retrieved indefinitely

### 2.2 Content Addressing

Every message is identified by a cryptographic hash of its contents. This content addressing provides:

- **Integrity**: Any modification changes the identifier
- **Deduplication**: Identical messages share the same identifier
- **Verifiability**: The identifier proves the message's authenticity
- **Location Independence**: Messages can be retrieved from any source

### 2.3 Lazy Evaluation

Computation in AO-Core follows a **lazy evaluation** model. Results are computed on-demand when requested through path resolution, rather than eagerly upon message receipt. This approach enables:

- **Efficiency**: Only requested computations are performed
- **Parallelism**: Independent computations can proceed concurrently
- **Caching**: Results can be cached and reused across requests
- **Composability**: Complex computations build from simpler ones

### 2.4 Device-Based Extensibility

Rather than defining a fixed set of operations, AO-Core delegates computation to **devices**—pluggable modules that implement specific functionality. This architecture enables:

- **Flexibility**: New capabilities can be added without protocol changes
- **Specialization**: Devices can be optimized for specific use cases
- **Trust Selection**: Users choose which devices to trust
- **Evolution**: The protocol can evolve through device improvements

### 2.5 Separation of Concerns

AO-Core separates orthogonal concerns into independent layers:

| Layer | Responsibility |
|-------|----------------|
| Message | Data representation and identity |
| Device | Computation and transformation |
| Store | Persistence and retrieval |
| Codec | Wire format and serialization |
| Commitment | Cryptographic signing and verification |
| Scheduler | Ordering and sequencing |

This separation allows each layer to evolve independently while maintaining protocol coherence.

---

## 3. Core Concepts

### 3.1 Messages

A **message** is an ordered collection of key-value pairs where:

- Keys are case-insensitive strings
- Values can be primitives (strings, numbers, binaries) or nested messages
- Every message has a unique identifier derived from its content

Messages are the atomic unit of data in AO-Core. They represent:

- **State**: The current condition of a process
- **Requests**: Commands to perform computation
- **Results**: Outcomes of computation
- **Metadata**: Information about other messages

### 3.2 Devices

A **device** is a computational module that transforms messages. Each device:

- Declares a set of exported functions
- Accepts a message and returns a transformed result
- May depend on other devices
- Has a versioned identifier (e.g., "process@1.0")

Devices are the computational building blocks of AO-Core. They enable:

- **Modularity**: Complex systems compose from simple devices
- **Upgradability**: New device versions can be deployed independently
- **Trust Boundaries**: Each device represents a trust decision

### 3.3 Paths

A **path** is a sequence of keys that navigates through a message structure:

```
/process-id/slot/42/result/output
```

Paths enable:

- **Navigation**: Traversing nested message structures
- **Computation**: Triggering device functions through resolution
- **Addressing**: Referring to specific values within messages

### 3.4 Hashpath

A **hashpath** is a cryptographic commitment to a computation path. It records:

- The sequence of devices invoked
- The functions called on each device
- The arguments passed to each function

Hashpaths enable:

- **Reproducibility**: The same hashpath always produces the same result
- **Verification**: Results can be verified by replaying the hashpath
- **Caching**: Results can be cached by hashpath for efficient reuse

### 3.5 Processes

A **process** is a stateful computation unit that:

- Maintains state across message invocations
- Receives messages through a scheduler
- Executes computation through a designated execution device
- Produces results and state transitions

Processes enable:

- **Statefulness**: Computations that remember previous interactions
- **Isolation**: Independent processes don't interfere with each other
- **Composition**: Processes communicate through message passing

### 3.6 Slots

A **slot** is a sequential position in a process's message history:

- Slot 0 is the process definition
- Slot 1 is the first message received
- Each subsequent message increments the slot number

Slots enable:

- **Ordering**: Total ordering of messages to a process
- **Determinism**: The same message sequence produces the same state
- **Verification**: Slot sequences can be audited for correctness

---

## 4. The Message Model

### 4.1 Message Structure

A message consists of:

1. **Keys**: String identifiers for values
2. **Values**: Data associated with keys
3. **Identity**: Cryptographic hash of the message content

### 4.2 Key Semantics

Keys in AO-Core follow specific semantic rules:

**Normalization**: Keys are normalized for comparison:
- Case is ignored ("Content-Type" equals "content-type")
- Hyphens and underscores are equivalent ("content-type" equals "content_type")

**Privacy**: Keys prefixed with "priv/" are private:
- Excluded from message hashing
- Excluded from external serialization
- Used for local computation state

**Type Suffixes**: Keys may have type suffixes indicating value type:
- "+integer" for integer values
- "+float" for floating-point values
- "+binary" for binary data
- "+list" for array values
- "+map" for nested messages

### 4.3 Value Types

Messages support the following value types:

| Type | Description |
|------|-------------|
| String | UTF-8 text |
| Integer | Signed whole number |
| Float | IEEE 754 floating-point |
| Binary | Arbitrary byte sequence |
| Message | Nested key-value structure |
| List | Ordered sequence of values |
| Null | Absence of value |

### 4.4 Message Identity

Every message has two identifiers:

**Unsigned ID**: Hash of the message content excluding signatures
- Used for content addressing
- Stable across different signers

**Signed ID**: Hash including the signature
- Used for authenticated messages
- Proves authorship and integrity

### 4.5 Nested Messages (Bundles)

Messages can contain other messages, forming bundles:

- The "body" key holds nested content
- Numbered keys ("1", "2", "3") organize multiple items
- Bundles enable atomic operations on message groups

---

## 5. Computation Model

### 5.1 Functional Paradigm

AO-Core follows a functional computation model:

- **Pure Functions**: Device functions are deterministic—same inputs produce same outputs
- **Immutability**: Messages are immutable once created
- **Referential Transparency**: Message identifiers can substitute for message content

### 5.2 Path Resolution

Computation occurs through path resolution:

1. A path is requested on a message
2. Each path segment triggers computation or navigation
3. The final value is returned to the requester

This model enables:
- Lazy evaluation of complex computations
- Natural caching at each resolution step
- Parallel resolution of independent paths

### 5.3 Device Invocation

When a path segment matches a device function:

1. The device receives the current message and request
2. The device computes and returns a result
3. Resolution continues on the result

Devices may:
- Return a direct value
- Return a transformed message
- Delegate to another device ("pass-through")
- Signal an error

### 5.4 Pass-Through Semantics

A device may return a "pass" result, indicating:

- The device cannot handle the requested key
- Resolution should continue to the next device in the stack

This enables:
- Device composition through stacking
- Specialization with fallback behavior
- Gradual capability extension

### 5.5 Device Stacks

Messages can specify multiple devices through a device stack:

1. Primary device attempts resolution
2. On pass-through, the next device in stack is tried
3. Resolution continues until success or stack exhaustion

Device stacks enable:
- Layered functionality
- Override and extension patterns
- Flexible trust composition

---

## 6. The Converge Algorithm

### 6.1 Overview

The **Converge Algorithm** is the core execution engine of AO-Core. It resolves paths to values through a multi-stage process:

1. **Initialize**: Prepare execution context
2. **Cache Lookup**: Check for cached results
3. **Device Lookup**: Identify the handling device
4. **Key Resolution**: Handle special keys
5. **Execute**: Invoke device function
6. **Postprocess**: Cache and return result

### 6.2 Determinism Requirement

Converge must be deterministic:

- Same message + same path + same options = same result
- No dependence on external state
- No dependence on execution timing

This determinism enables:
- Result verification through re-execution
- Caching without invalidation concerns
- Distributed execution with consistent results

### 6.3 Hashpath Tracking

During execution, Converge maintains a hashpath:

- Each device invocation extends the hashpath
- The hashpath commits to the computation sequence
- Results are keyed by hashpath for caching

### 6.4 Error Semantics

Errors in Converge follow configurable strategies:

| Strategy | Behavior |
|----------|----------|
| Throw | Propagate error immediately |
| Return | Return error as result |
| Log | Record error, continue execution |

### 6.5 Caching Semantics

Converge supports cache control:

- **no-cache**: Skip cache lookup, always compute
- **no-store**: Compute but don't cache result
- **only-if-cached**: Return cached value or error

---

## 7. Device Architecture

### 7.1 Device Identity

Every device has an identity of the form:

```
name@version
```

Where:
- **name** identifies the device's function
- **version** specifies the implementation version

Version matching follows semantic versioning principles.

### 7.2 Device Interface

Devices expose:

- **info**: Metadata about the device (exports, defaults)
- **get**: Retrieve a value by key
- **set**: Store a value by key (optional)
- **handle**: Process an HTTP-style request (optional)

### 7.3 Device Dependencies

Devices may declare dependencies:

- **uses**: List of other devices this device requires
- Dependencies are resolved before device invocation
- Circular dependencies are prohibited

### 7.4 Built-in Devices

The protocol defines standard devices:

| Device | Purpose |
|--------|---------|
| message | Core message operations |
| router | Path-based request routing |
| process | Stateful computation |
| scheduler | Message ordering |
| wasm | WebAssembly execution |
| cache | Result caching |
| p4 | Payment channels |

### 7.5 Custom Devices

Users can deploy custom devices:

- Devices can be native (implementation-language) or WASM
- Custom devices extend protocol capabilities
- Device trust is the user's responsibility

---

## 8. Storage Model

### 8.1 Content-Addressed Storage

All storage in AO-Core is content-addressed:

- Keys are cryptographic hashes
- Values are immutable once stored
- Identical content shares storage

### 8.2 Store Interface

Stores provide:

- **read**: Retrieve value by key
- **write**: Store value with key
- **list**: Enumerate keys by prefix
- **exists**: Check key existence

### 8.3 Store Composition

Stores can be composed into hierarchies:

- **Tiered Storage**: Fast cache backed by slow persistence
- **Replicated Storage**: Multiple stores for redundancy
- **Filtered Storage**: Stores with access restrictions

### 8.4 Arweave Integration

The canonical long-term store is Arweave:

- Permanent, immutable storage
- Content-addressed by transaction ID
- Economically sustainable through one-time payment

### 8.5 Cache Semantics

Caching follows standard HTTP semantics:

- **Cache-Control**: Directives for caching behavior
- **ETag**: Version identifier for validation
- **Last-Modified**: Timestamp for freshness

---

## 9. Cryptographic Foundations

### 9.1 Hash Functions

AO-Core uses cryptographic hashes for:

- **Message Identity**: SHA-256 of message content
- **Deep Hashing**: SHA-384 for Arweave compatibility
- **Hashpath**: SHA-256 chain of computation steps

### 9.2 Signature Schemes

The protocol supports multiple signature schemes:

| Scheme | Key Size | Signature Size | Use Case |
|--------|----------|----------------|----------|
| RSA-4096 PSS | 512 bytes | 512 bytes | Arweave compatibility |
| ED25519 | 32 bytes | 64 bytes | Efficient signatures |
| ECDSA secp256k1 | 65 bytes | 65 bytes | Ethereum compatibility |

### 9.3 Message Signing

Message signing follows HTTP Message Signatures (RFC 9421):

1. Select headers to sign
2. Canonicalize header values
3. Create signature base
4. Sign with private key
5. Attach signature and metadata

### 9.4 Signature Verification

Verification reverses the signing process:

1. Extract signature metadata
2. Reconstruct signature base
3. Verify against public key
4. Validate additional constraints (expiry, etc.)

### 9.5 Deep Hash

Deep hash is Arweave's recursive hashing algorithm:

- **Blobs**: Hash with length prefix
- **Lists**: Sequential hash of elements
- **Recursive**: Nested structures hash recursively

Deep hash enables:
- Merkle-like proofs for nested data
- Efficient verification of partial structures
- Compatibility with Arweave data items

### 9.6 Address Derivation

Addresses derive from public keys:

- **Arweave**: SHA-256 of RSA modulus, base64url encoded
- **Ethereum**: Last 20 bytes of Keccak-256 of public key

---

## 10. Scheduling and Ordering

### 10.1 The Ordering Problem

Processes require deterministic message ordering:

- Different orderings produce different states
- Concurrent messages must be sequenced
- The sequence must be verifiable

### 10.2 Scheduler Role

The scheduler provides:

- **Assignment**: Map messages to sequential slots
- **Timestamping**: Record when assignments occur
- **Signing**: Cryptographically commit to ordering

### 10.3 Slot Assignment

Each message receives a slot assignment:

- Slots are consecutive integers starting from 1
- Each slot contains exactly one message
- The assignment includes metadata (timestamp, block height)

### 10.4 Hash Chain

Schedulers maintain a hash chain:

- Each slot's hash incorporates the previous hash
- The chain commits to the entire message history
- Verification requires only the chain, not all messages

The hash chain provides:
- **Ordering Proof**: Cryptographic proof of sequence
- **Fork Detection**: Inconsistent chains reveal forks
- **Efficient Audit**: Verify ordering without full replay

### 10.5 Epoch Organization

Slots are organized into epochs:

- An epoch contains a fixed number of slots (e.g., 1000)
- Epochs enable batch operations
- Completed epochs can be archived atomically

### 10.6 Schedule Location

A schedule location encodes position as:

```
scheduler-address/epoch/nonce/hash-chain
```

This compact representation enables:
- Efficient position communication
- Quick ordering verification
- Resume from any position

---

## 11. Process Execution

### 11.1 Process Definition

A process is defined by:

- **Execution Device**: How computation occurs (e.g., WASM)
- **Scheduler**: Who orders messages
- **Authority**: Who controls the process
- **Module**: The executable code (for WASM processes)

### 11.2 State Machine Model

Processes follow a state machine model:

```
State(n) + Message(n+1) → State(n+1) + Results(n+1)
```

Where:
- State is the accumulated process state
- Message is the input at a slot
- Results are outputs produced

### 11.3 Execution Flow

For each slot:

1. Retrieve assignment from scheduler
2. Load message referenced by assignment
3. Load state from previous slot
4. Execute message against state
5. Store resulting state and results

### 11.4 Result Types

Execution produces:

- **State**: Updated process state
- **Output**: Direct computation results
- **Spawns**: New processes to create
- **Messages**: Outbound messages to other processes

### 11.5 Lazy State Evaluation

State can be computed lazily:

- State at slot N computes from state at N-1
- Intermediate states need not be persisted
- Computation can resume from any checkpoint

### 11.6 Checkpointing

Processes support checkpointing:

- Full state snapshots at intervals
- Enables efficient state recovery
- Reduces re-computation requirements

---

## 12. Security Model

### 12.1 Trust Assumptions

AO-Core's security depends on:

- **Cryptographic Assumptions**: Hash functions and signatures are secure
- **Scheduler Honesty**: Schedulers correctly order messages
- **Device Correctness**: Devices compute correctly
- **Store Availability**: Storage is accessible when needed

### 12.2 Threat Model

The protocol considers:

| Threat | Mitigation |
|--------|------------|
| Message Tampering | Content-addressed identity |
| Signature Forgery | Cryptographic signatures |
| Replay Attacks | Slot sequencing |
| Ordering Manipulation | Hash chains |
| Execution Manipulation | Deterministic re-execution |

### 12.3 Verifiability

Results are verifiable through:

1. Retrieve the computation's hashpath
2. Re-execute the computation
3. Compare results
4. Discrepancies indicate misbehavior

### 12.4 Trust Minimization

Users minimize trust by:

- Choosing reputable schedulers
- Verifying results independently
- Using multiple independent verifiers
- Monitoring for hash chain forks

### 12.5 Privacy Considerations

Privacy in AO-Core:

- **Public by Default**: Messages on Arweave are public
- **Private Keys**: "priv/" prefix excludes data from publication
- **Encryption**: Users may encrypt message content
- **Zero-Knowledge**: Future devices may support ZK proofs

---

## 13. Economic Model

### 13.1 Resource Costs

Computation consumes resources:

- **Storage**: Permanent data storage on Arweave
- **Computation**: CPU time for execution
- **Bandwidth**: Data transfer between nodes
- **Memory**: Working memory during execution

### 13.2 Payment Channels (P4)

The protocol includes payment channels:

- **Channels**: Bidirectional payment relationships
- **Micropayments**: Efficient small-value transfers
- **Settlement**: On-chain finalization when needed

### 13.3 FAFF Model

"Free at First" (FAFF) enables:

- **Free Tier**: Initial requests at no cost
- **Graduated Pricing**: Costs increase with usage
- **Onboarding**: Low barrier to entry for new users

### 13.4 Pricing Mechanisms

Computation pricing may use:

- **Fixed Pricing**: Predetermined costs per operation
- **Auction**: Market-determined pricing
- **Subscription**: Prepaid access bundles
- **Stake**: Security deposits for service access

### 13.5 Economic Security

Economic mechanisms reinforce security:

- **Stake Slashing**: Penalties for misbehavior
- **Reputation**: Track record affects pricing
- **Insurance**: Coverage for computation failures

---

## 14. Protocol Properties

### 14.1 Correctness Properties

**Determinism**: Given identical inputs, all correct implementations produce identical outputs.

**Consistency**: The state observed after slot N is determined solely by the messages in slots 1 through N.

**Integrity**: Message identifiers cryptographically commit to message content.

### 14.2 Liveness Properties

**Progress**: If a message is submitted to an honest scheduler, it eventually receives a slot assignment.

**Availability**: If data is stored on Arweave, it remains retrievable indefinitely.

### 14.3 Safety Properties

**Non-Repudiation**: A valid signature proves the signer authorized the message.

**Ordering Integrity**: Hash chains prevent undetectable ordering manipulation.

**Fork Accountability**: Conflicting hash chains identify the responsible scheduler.

### 14.4 Performance Properties

**Scalability**: Independent processes execute in parallel without coordination.

**Efficiency**: Lazy evaluation avoids unnecessary computation.

**Cacheability**: Determinism enables aggressive caching.

---

## 15. Future Directions

### 15.1 Enhanced Privacy

Future protocol versions may include:

- Zero-knowledge proof integration
- Encrypted computation
- Private state channels

### 15.2 Cross-Chain Integration

Potential integrations include:

- Bridge protocols to other blockchains
- Cross-chain message passing
- Multi-chain asset management

### 15.3 Governance

Protocol governance may evolve through:

- Decentralized upgrade mechanisms
- Community-driven device standards
- Economic parameter adjustment

### 15.4 Optimization

Performance improvements may include:

- Parallel execution optimization
- State compression techniques
- Proof-of-computation schemes

---

## Glossary

**Assignment**: A scheduler's commitment to a message's position in a process's slot sequence.

**Bundle**: A message containing nested messages.

**Commitment**: A cryptographic signature binding an entity to a message.

**Converge**: The algorithm that resolves paths to values.

**Deep Hash**: Arweave's recursive hashing algorithm for nested data.

**Device**: A pluggable computational module.

**Device Stack**: An ordered list of devices for fallback resolution.

**Epoch**: A fixed-size group of consecutive slots.

**FAFF**: "Free at First" — a pricing model with initial free usage.

**Hash Chain**: A cryptographic chain linking sequential slots.

**Hashpath**: A cryptographic commitment to a computation path.

**Message**: The fundamental data unit—a key-value collection with cryptographic identity.

**P4**: The payment channel protocol.

**Pass-Through**: A device response indicating delegation to the next device.

**Path**: A sequence of keys for navigation and computation.

**Process**: A stateful computation unit receiving ordered messages.

**Scheduler**: An entity that assigns messages to process slots.

**Slot**: A sequential position in a process's message history.

**Store**: A content-addressed persistence layer.

**TABM**: Type-Annotated Binary Message — the native message format.

**Type Suffix**: A key suffix indicating value type (+integer, +float, etc.).

---

## References

1. Arweave Yellow Paper — Permanent Information Storage Protocol
2. RFC 9421 — HTTP Message Signatures
3. RFC 8941 — Structured Field Values for HTTP
4. ANS-104 — Arweave Data Item Specification

---

## Acknowledgments

The AO-Core protocol builds on foundational work in distributed systems, content-addressed storage, and cryptographic protocols. We acknowledge the contributions of the Arweave community and the broader decentralized computing research community.

---

*AO-Core Protocol Specification — Version 1.0*
