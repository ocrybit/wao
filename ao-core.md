# AO-Core Protocol Specification v1.0

This document provides a complete specification for implementing HyperBEAM, the reference implementation of the AO-Core protocol. It is designed to enable implementation in any programming language.

## Table of Contents

### Main Sections
1. [Overview](#1-overview)
2. [Core Concepts](#2-core-concepts)
3. [Message Format (TABM)](#3-message-format-tabm)
4. [HTTP API](#4-http-api)
5. [Device System](#5-device-system)
6. [Converge Algorithm](#6-converge-algorithm)
7. [Path Resolution](#7-path-resolution)
8. [Store System](#8-store-system)
9. [Cryptographic Operations](#9-cryptographic-operations)
10. [Scheduler and Process Management](#10-scheduler-and-process-management)
11. [Built-in Devices](#11-built-in-devices)
12. [Codec System](#12-codec-system)
13. [Caching System](#13-caching-system)
14. [HTTP Client](#14-http-client)
15. [Configuration Options](#15-configuration-options)

### Appendices
- [A: Message Examples](#appendix-a-message-examples)
- [B: Error Codes](#appendix-b-error-codes)
- [C: Protocol Constants](#appendix-c-protocol-constants)
- [D: Base64URL Encoding](#appendix-d-base64url-encoding)
- [E: Reference Implementation Modules](#appendix-e-reference-implementation-modules)
- [F: Detailed Key Handling](#appendix-f-detailed-key-handling)
- [G: Detailed Converge Algorithm](#appendix-g-detailed-converge-algorithm)
- [H: HTTP Server Implementation](#appendix-h-http-server-implementation)
- [I: HTTP Message Signatures (RFC-9421)](#appendix-i-http-message-signatures-rfc-9421)
- [J: Bundle and Nested Message Handling](#appendix-j-bundle-and-nested-message-handling)
- [K: WASM Execution Details](#appendix-k-wasm-execution-details)
- [L: Arweave Integration](#appendix-l-arweave-integration)
- [M: Push and Relay System](#appendix-m-push-and-relay-system)
- [N: Multipass Execution](#appendix-n-multipass-execution)
- [O: Event and Logging System](#appendix-o-event-and-logging-system)
- [P: Process Lifecycle](#appendix-p-process-lifecycle)
- [Q: Payment Channels (P4)](#appendix-q-payment-channels-p4)
- [R: Testing Framework](#appendix-r-testing-framework)
- [S: Full API Reference](#appendix-s-full-api-reference)
- [T: Implementation Checklist](#appendix-t-implementation-checklist)

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

## 2. Core Concepts

### 2.1 Messages

A **message** is the fundamental unit of data in AO-Core. Messages are key-value maps where:
- Keys are binaries (strings)
- Values can be: binaries, integers, floats, atoms, nested messages, or lists

### 2.2 Devices

A **device** is a module that provides operations on messages. Devices are identified by a `device` key in the message and define functions that can be called via path resolution.

### 2.3 Hashpath

A **hashpath** is a cryptographic commitment to the computation path. It ensures deterministic execution by recording which device functions were called with which arguments.

### 2.4 Keys

Keys in messages are normalized for comparison:
- Case-insensitive matching (converted to lowercase)
- Hyphens (`-`) and underscores (`_`) are equivalent
- Integer keys are normalized to binary strings

```
"Content-Type" == "content_type" == "CONTENT-TYPE"
```

### 2.5 Private Keys

Keys starting with `priv/` are private and excluded from:
- Message hashing/signing
- External serialization
- Hashpath computation

---

## 3. Message Format (TABM)

TABM (Type-Annotated Binary Message) is the native message format, built on the ANS-104 data item specification from Arweave.

### 3.1 Structure

A TABM message consists of:

```
┌─────────────────────────────────────────────┐
│  Signature Type (2 bytes)                   │
├─────────────────────────────────────────────┤
│  Signature (variable, based on type)        │
├─────────────────────────────────────────────┤
│  Owner (512 bytes for RSA-4096)             │
├─────────────────────────────────────────────┤
│  Target (0 or 32 bytes)                     │
├─────────────────────────────────────────────┤
│  Anchor (0 or 32 bytes)                     │
├─────────────────────────────────────────────┤
│  Tags Count (8 bytes, big-endian)           │
├─────────────────────────────────────────────┤
│  Tags Bytes Size (8 bytes, big-endian)      │
├─────────────────────────────────────────────┤
│  Tags (AVS format)                          │
├─────────────────────────────────────────────┤
│  Data (remaining bytes)                     │
└─────────────────────────────────────────────┘
```

### 3.2 Signature Types

| Type ID | Algorithm | Signature Size | Owner Size |
|---------|-----------|----------------|------------|
| 1 | RSA-4096 PSS SHA256 | 512 bytes | 512 bytes |
| 2 | ED25519 | 64 bytes | 32 bytes |
| 3 | Ethereum ECDSA | 65 bytes | 65 bytes |

### 3.3 Tags (AVS Format)

Tags use Apache Avro Variable-length encoding:

```
For each tag:
  - Name length (AVS varint)
  - Name bytes
  - Value length (AVS varint)
  - Value bytes
```

AVS Varint encoding:
- Values 0-127: single byte
- Larger values: 7 bits per byte, MSB indicates continuation

### 3.4 Type Annotations

Values in tags can be type-annotated using the format:
```
Type:Value
```

Supported types:
| Type | Format | Example |
|------|--------|---------|
| `int` / `integer` | Decimal string | `int:42` |
| `float` | Decimal with point | `float:3.14` |
| `bin` / `binary` | Base64URL encoded | `bin:SGVsbG8` |
| `ref` / `reference` | Base64URL ID | `ref:abc123...` |
| `list` | Structured fields format | `list:"a", "b", "c"` |
| `term` | Erlang term format | `term:{ok, value}` |

### 3.5 Type Suffix System

Keys can have type suffixes that indicate the expected type of the value. When looking up a key, the system checks for typed variants:

| Suffix | Type | Description |
|--------|------|-------------|
| `+integer` | Integer | Value should be an integer |
| `+float` | Float | Value should be a floating point number |
| `+binary` | Binary | Value should be binary data |
| `+list` | List | Value should be an array/list |
| `+map` | Map | Value should be a nested message/map |

Example:
```erlang
#{
  <<"count+integer">> => 42,
  <<"price+float">> => 19.99,
  <<"data+binary">> => <<1,2,3,4>>,
  <<"tags+list">> => [<<"a">>, <<"b">>, <<"c">>],
  <<"metadata+map">> => #{<<"key">> => <<"value">>}
}
```

When looking up a key, check for typed variants:

```erlang
find_typed_key(Msg, Key) ->
    Suffixes = [<<"">>, <<"+integer">>, <<"+float">>,
                <<"+binary">>, <<"+list">>, <<"+map">>],
    find_with_suffix(Msg, Key, Suffixes).

find_with_suffix(_Msg, _Key, []) -> not_found;
find_with_suffix(Msg, Key, [Suffix | Rest]) ->
    TypedKey = <<Key/binary, Suffix/binary>>,
    case maps:find(TypedKey, Msg) of
        {ok, Value} -> {ok, TypedKey, Value};
        error -> find_with_suffix(Msg, Key, Rest)
    end.
```

Type coercion rules:
```erlang
coerce_to_type(Key, Value) ->
    case extract_type_suffix(Key) of
        <<"+integer">> -> to_integer(Value);
        <<"+float">> -> to_float(Value);
        <<"+binary">> -> to_binary(Value);
        <<"+list">> -> to_list(Value);
        <<"+map">> -> to_map(Value);
        _ -> Value
    end.

to_integer(V) when is_integer(V) -> V;
to_integer(V) when is_float(V) -> trunc(V);
to_integer(V) when is_binary(V) -> binary_to_integer(V).

to_float(V) when is_float(V) -> V;
to_float(V) when is_integer(V) -> float(V);
to_float(V) when is_binary(V) -> binary_to_float(V).
```

### 3.6 Message ID Calculation

```
Unsigned ID = SHA-256(
  SHA-256(Owner) ||
  SHA-256(Target) ||
  SHA-256(Anchor) ||
  SHA-256(Tags) ||
  SHA-256(Data)
)

Signed ID = SHA-256(
  SHA-256(Signature) ||
  Unsigned ID
)
```

### 3.6 Nested Messages (Bundles)

Messages can contain other messages. The `body` key holds nested content:
- Single nested message: `body` contains the message
- Multiple items: `body` is numbered map (`1`, `2`, `3`, ...)

Bundle manifest format:
```json
{
  "manifest": "arweave/paths",
  "version": "0.2.0",
  "paths": {
    "1": { "id": "<base64url-id>" },
    "2": { "id": "<base64url-id>" }
  }
}
```

---

## 4. HTTP API

### 4.1 Endpoint Structure

```
http://<host>:<port>/<path>
```

Default port: 10000 (configurable via `port` option)

### 4.2 Request Processing

1. Parse HTTP request into singleton message
2. Route to appropriate handler based on path
3. Execute via Converge algorithm
4. Serialize response message to HTTP

### 4.3 Path Format

Paths are `/`-separated segments that navigate message structure:

```
/process-id/key1/key2/function?arg1=value1&arg2=value2
```

Special path components:
- `~device@version`: Direct device access (e.g., `~scheduler@1.0`)
- `now`: Current timestamp
- `slot`: Scheduler slot number
- `hashpath`: Compute hashpath for execution

### 4.4 Request Message Structure

HTTP requests are converted to messages:

```erlang
#{
  <<"method">> => <<"GET">>,           % HTTP method
  <<"path">> => <<"/process/key">>,    % Request path
  <<"body">> => <<...>>,               % Request body
  <<"headers">> => #{...},             % HTTP headers as map
  <<"query-params">> => #{...}         % Query string parameters
}
```

### 4.5 Response Message Structure

Response messages contain:

```erlang
#{
  <<"status">> => 200,                          % HTTP status code
  <<"content-type">> => <<"application/json">>, % MIME type
  <<"body">> => <<...>>,                        % Response body
  <<"headers">> => #{...}                       % Additional headers
}
```

### 4.6 Multipart Requests

For `multipart/form-data`:
- Each part becomes a numbered key in the message
- Part headers preserved in each part's message

### 4.7 Content Negotiation

Request `Accept` header determines response format:
- `application/json`: JSON encoding
- `application/octet-stream`: Raw binary
- `application/x-ans-104`: TABM/ANS-104 format

### 4.8 Singleton Message Format

A singleton wraps the request with metadata:

```erlang
#{
  <<"1">> => RequestMessage,
  <<"device">> => <<"router@1.0">>,
  <<"request">> => true
}
```

---

## 5. Device System

### 5.1 Device Identification

Devices are specified by name and optional version:
```
device-name@version
```

Examples: `message@1.0`, `scheduler@1.0`, `wasm64-emscripten@1.0`

### 5.2 Device Interface

Every device must implement these core functions:

| Function | Required | Description |
|----------|----------|-------------|
| `info/0` or `info/1` | Yes | Returns device metadata and exported functions |
| `uses/0` | No | List of other devices this device depends on |

### 5.3 Info Structure

```erlang
#{
  <<"exports">> => [
    <<"function1">>,
    <<"function2/2">>   % with arity
  ],
  <<"excludes">> => [
    <<"internal_only">>
  ],
  <<"default">> => <<"compute">>,  % default function for path resolution
  <<"grouper">> => <<"function">>, % for grouping related calls
  <<"handler">> => <<"handle">>    % HTTP request handler
}
```

### 5.4 Function Resolution

When resolving a path like `/msg/device-function`:

1. Get device from message's `device` key
2. Look up function in device's exports
3. Check function is not in excludes
4. Call with signature: `Function(Message, Request, Opts)`

### 5.5 Device Loading

Devices can be:
- **Native**: Erlang modules (e.g., `dev_message`)
- **WASM**: WebAssembly modules loaded at runtime
- **Remote**: Delegated to another node

Module naming convention:
```
dev_<device_name> -> device-name@1.0
```

### 5.6 Handler Functions

Devices can define handlers for different HTTP methods:

```erlang
handle(Message, Request, Opts) ->
    Method = maps:get(<<"method">>, Request),
    case Method of
        <<"GET">> -> handle_get(Message, Request, Opts);
        <<"POST">> -> handle_post(Message, Request, Opts);
        _ -> {error, method_not_allowed}
    end.
```

### 5.7 Device Stack

Messages can specify multiple devices using the `device-stack` key for fallback resolution:

```erlang
#{
  <<"device">> => <<"primary@1.0">>,
  <<"device-stack">> => [<<"fallback1@1.0">>, <<"fallback2@1.0">>],
  ...
}
```

Resolution order:
1. Try primary device specified in `device` key
2. If result is `{pass, true}`, try each device in `device-stack` in order
3. Stop at first device that returns a definite result

```erlang
resolve_with_stack(Key, Msg, Opts) ->
    PrimaryDevice = maps:get(<<"device">>, Msg),
    case call_device(PrimaryDevice, get, [Key, Msg, Opts]) of
        {ok, Value} -> {ok, Value};
        {pass, true} ->
            Stack = maps:get(<<"device-stack">>, Msg, []),
            try_stack(Key, Msg, Stack, Opts);
        {error, Reason} -> {error, Reason}
    end.

try_stack(_Key, _Msg, [], _Opts) -> not_found;
try_stack(Key, Msg, [Device | Rest], Opts) ->
    case call_device(Device, get, [Key, Msg, Opts]) of
        {ok, Value} -> {ok, Value};
        {pass, true} -> try_stack(Key, Msg, Rest, Opts);
        {error, _} -> try_stack(Key, Msg, Rest, Opts)
    end.
```

### 5.8 Pass-Through Results

Device functions can return three types of results:

| Result Type | Format | Meaning |
|------------|--------|---------|
| Success | `{ok, Value}` | Key resolved to Value |
| Pass | `{pass, true}` | Delegate to next device in stack |
| Error | `{error, Reason}` | Resolution failed |

The pass-through pattern allows devices to handle only keys they know about:

```erlang
% Example device that handles specific keys
get(Key, Msg, Opts) ->
    case Key of
        <<"id">> -> {ok, compute_id(Msg)};
        <<"keys">> -> {ok, maps:keys(Msg)};
        _ -> {pass, true}  % Let another device handle it
    end.
```

---

## 6. Converge Algorithm

The Converge algorithm is the core execution engine that resolves paths to values.

### 6.1 Resolution Stages

```
┌─────────────────────────────────────────────────────────────┐
│ Stage 1: INITIALIZE                                         │
│   - Normalize message keys                                  │
│   - Set up execution context                                │
│   - Initialize hashpath                                     │
├─────────────────────────────────────────────────────────────┤
│ Stage 2: CACHE_LOOKUP                                       │
│   - Check if result already cached                          │
│   - Return cached value if valid hashpath                   │
├─────────────────────────────────────────────────────────────┤
│ Stage 3: DEVICE_LOOKUP                                      │
│   - Determine which device handles the request              │
│   - Load device if not already loaded                       │
├─────────────────────────────────────────────────────────────┤
│ Stage 4: RESOLVE_KEYS                                       │
│   - Handle special keys (id, hashpath, etc.)                │
│   - Resolve key references                                  │
├─────────────────────────────────────────────────────────────┤
│ Stage 5: EXECUTE                                            │
│   - Call device function                                    │
│   - May recursively converge for nested paths               │
├─────────────────────────────────────────────────────────────┤
│ Stage 6: POSTPROCESS                                        │
│   - Apply transformations to result                         │
│   - Update hashpath                                         │
│   - Cache result                                            │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Path Resolution

```erlang
resolve(Message, Path, Opts) ->
    case split_path(Path) of
        [] ->
            Message;
        [Key | Rest] ->
            case get_key(Message, Key, Opts) of
                {ok, Value} when is_map(Value) ->
                    resolve(Value, Rest, Opts);
                {ok, Value} when Rest == [] ->
                    Value;
                {device_call, Device, Function} ->
                    Result = call_device(Device, Function, Message, Opts),
                    resolve(Result, Rest, Opts);
                not_found ->
                    not_found
            end
    end.
```

### 6.3 Hashpath Computation

Hashpath ensures deterministic execution:

```erlang
hashpath(PreviousHashpath, DeviceID, FunctionName, Args) ->
    SHA256(
        PreviousHashpath ||
        SHA256(DeviceID) ||
        SHA256(FunctionName) ||
        SHA256(serialize(Args))
    )
```

### 6.4 Execution Context (Opts)

The `Opts` map carries execution context:

```erlang
#{
  hashpath => <<...>>,           % Current hashpath
  cache_control => <<"no-cache">>, % Caching behavior
  store => StoreConfig,          % Storage backend
  wallet => WalletKey,           % Signing key
  error_strategy => throw,       % How to handle errors
  spawn_worker => true,          % Parallel execution
  timeout => 60000               % Execution timeout (ms)
}
```

### 6.5 Error Handling

Errors can be:
- **Thrown**: Execution stops, error propagates
- **Returned**: `{error, Reason}` returned to caller
- **Logged**: Error recorded but execution continues

Controlled by `error_strategy` option: `throw | return | log`

### 6.6 Recursive Resolution

When a device function returns a message with further paths:

```erlang
Result = DeviceFunction(Msg, Req, Opts),
case needs_further_resolution(Result) of
    true -> converge(Result, RemainingPath, Opts);
    false -> Result
end.
```

---

## 7. Path Resolution

### 7.1 Path Syntax

```
/<segment>/<segment>/...
```

Each segment can be:
- **Key**: Direct message key lookup
- **Index**: Numeric index for lists (`1`, `2`, etc.)
- **Device call**: `~device@version/function`
- **Special**: `id`, `hashpath`, `keys`, `owner`, etc.

### 7.2 Special Keys

| Key | Description |
|-----|-------------|
| `id` | Message's unsigned ID (SHA-256 hash) |
| `signed-id` | Message's signed ID |
| `hashpath` | Current execution hashpath |
| `keys` | List of all keys in message |
| `owner` | Message owner's address |
| `target` | Message target address |
| `anchor` | Message anchor |
| `signature` | Message signature |
| `timestamp` | Message timestamp |
| `nonce` | Message nonce |

### 7.3 Key Normalization

```erlang
normalize_key(Key) ->
    LowerKey = string:lowercase(Key),
    binary:replace(LowerKey, <<"-">>, <<"_">>, [global]).
```

### 7.4 Path Matching

For routing, paths can contain patterns:

```erlang
% Exact match
<<"/process/compute">>

% Wildcard
<<"/process/*/status">>

% Regex
<<"^/process/[a-z0-9]+/compute$">>
```

### 7.5 Route Resolution

The router device handles path-based dispatch:

```erlang
resolve_route(Path, Routes) ->
    lists:foldl(
        fun({Pattern, Handler}, Acc) ->
            case match_pattern(Path, Pattern) of
                true -> Handler;
                false -> Acc
            end
        end,
        not_found,
        Routes
    ).
```

---

## 8. Store System

### 8.1 Store Interface

Every store backend must implement:

| Function | Signature | Description |
|----------|-----------|-------------|
| `start/1` | `(Config) -> ok` | Initialize store |
| `stop/1` | `(Config) -> ok` | Shutdown store |
| `read/2` | `(Key, Config) -> {ok, Value} \| not_found` | Read value |
| `write/3` | `(Key, Value, Config) -> ok` | Write value |
| `list/2` | `(Prefix, Config) -> [Key]` | List keys |
| `reset/1` | `(Config) -> ok` | Clear all data |

### 8.2 Store Configuration

```erlang
#{
  <<"store-module">> => hb_store_fs,  % Backend module
  <<"name">> => <<"cache">>,          % Store name/path
  <<"capacity">> => 4294967296,       % Max size (bytes)
  % Backend-specific options...
}
```

### 8.3 Filesystem Store (hb_store_fs)

Stores data as files on disk:

```erlang
#{
  <<"store-module">> => hb_store_fs,
  <<"name">> => <<"/path/to/cache">>
}
```

Key mapping:
```
Key: <<"abc123def456...">> (43 chars base64url)
Path: /path/to/cache/ab/c1/abc123def456...
```

### 8.4 LMDB Store (hb_store_lmdb)

Lightning Memory-Mapped Database:

```erlang
#{
  <<"store-module">> => hb_store_lmdb,
  <<"name">> => <<"/path/to/lmdb">>,
  <<"map_size">> => 10737418240  % 10GB
}
```

### 8.5 RocksDB Store (hb_store_rocksdb)

Facebook's RocksDB backend:

```erlang
#{
  <<"store-module">> => hb_store_rocksdb,
  <<"name">> => <<"/path/to/rocksdb">>
}
```

Value encoding:
- `<<1, Data...>>`: Link reference
- `<<2, Data...>>`: Raw data
- `<<3, Data...>>`: Group/directory

### 8.6 LRU Cache Store (hb_store_lru)

In-memory cache with eviction:

```erlang
#{
  <<"store-module">> => hb_store_lru,
  <<"capacity">> => 4294967296,  % 4GB default
  <<"store">> => BackingStore    % Eviction target
}
```

Uses three ETS tables:
- `cache`: Key -> Value mapping
- `stats`: Key -> {Size, LastAccess}
- `index`: {LastAccess, Key} ordered set for LRU

### 8.7 Gateway Store (hb_store_gateway)

Fetches from Arweave gateways:

```erlang
#{
  <<"store-module">> => hb_store_gateway,
  <<"gateway">> => <<"https://arweave.net">>,
  <<"store">> => LocalCache  % Local cache store
}
```

### 8.8 Remote Node Store (hb_store_remote_node)

Fetches from another HyperBEAM node:

```erlang
#{
  <<"store-module">> => hb_store_remote_node,
  <<"node">> => <<"http://other-node:10000">>,
  <<"store">> => LocalCache
}
```

Uses endpoint: `GET /<id>/~cache@1.0/read`

### 8.9 Composite Stores

Stores can be composed:

```erlang
[
  #{<<"store-module">> => hb_store_lru, ...},      % L1: Memory
  #{<<"store-module">> => hb_store_rocksdb, ...},  % L2: Local disk
  #{<<"store-module">> => hb_store_gateway, ...}   % L3: Network
]
```

Read: Try each store in order until found
Write: Write to first store (or all, configurable)

---

## 9. Cryptographic Operations

### 9.1 Hashing

Primary hash: SHA-256

```erlang
hash(Data) -> crypto:hash(sha256, Data).
```

### 9.2 RSA-4096 PSS

Signing algorithm for Arweave compatibility:

```erlang
% Sign
sign(Message, PrivateKey) ->
    Digest = sha256(Message),
    Salt = random_bytes(32),
    rsa_pss_sign(Digest, Salt, PrivateKey).

% Verify
verify(Message, Signature, PublicKey) ->
    Digest = sha256(Message),
    rsa_pss_verify(Digest, Signature, PublicKey).
```

RSA-PSS parameters:
- Hash: SHA-256
- MGF: MGF1-SHA256
- Salt length: 32 bytes
- Trailer: 0xBC

### 9.3 ED25519

Alternative signing for efficiency:

```erlang
sign_ed25519(Message, PrivateKey) ->
    crypto:sign(eddsa, none, Message, [PrivateKey, ed25519]).

verify_ed25519(Message, Signature, PublicKey) ->
    crypto:verify(eddsa, none, Message, Signature, [PublicKey, ed25519]).
```

### 9.4 Ethereum ECDSA (secp256k1)

For Ethereum wallet compatibility:

```erlang
sign_eth(Message, PrivateKey) ->
    Hash = keccak256(Message),
    {V, R, S} = secp256k1_sign(Hash, PrivateKey),
    <<R:32/binary, S:32/binary, V:1/binary>>.
```

### 9.5 Address Derivation

```erlang
% RSA address (Arweave)
address(PublicKey) -> sha256(PublicKey).

% Ethereum address
eth_address(PublicKey) ->
    Hash = keccak256(PublicKey),
    binary:part(Hash, 12, 20).  % Last 20 bytes
```

### 9.6 Wallet Format

```erlang
% RSA Wallet (JWK format internally)
#{
  <<"kty">> => <<"RSA">>,
  <<"n">> => ModulusBase64,
  <<"e">> => ExponentBase64,
  <<"d">> => PrivateExponentBase64,
  ...
}

% ED25519 Wallet
#{
  <<"kty">> => <<"OKP">>,
  <<"crv">> => <<"Ed25519">>,
  <<"x">> => PublicKeyBase64,
  <<"d">> => PrivateKeyBase64
}
```

### 9.7 HTTP Message Signatures (RFC-9421)

For signing HTTP requests/responses:

```erlang
signature_input(Components, Params) ->
    % Components: list of header names to sign
    % Params: keyid, alg, created, expires, nonce

signing_base(Request, Components) ->
    lists:map(
        fun(Component) ->
            Value = get_component(Request, Component),
            <<Component/binary, ": ", Value/binary>>
        end,
        Components
    ).
```

### 9.8 Deep Hash Algorithm (Arweave-Specific)

Deep Hash is Arweave's recursive hashing algorithm for creating content-addressed identifiers. It uses SHA-384 and handles nested data structures.

```erlang
% Deep hash for binary data (blob)
deep_hash(Data) when is_binary(Data) ->
    Tag = <<"blob", (integer_to_binary(byte_size(Data)))/binary>>,
    sha384(<<(sha384(Tag))/binary, (sha384(Data))/binary>>);

% Deep hash for list of items
deep_hash(Items) when is_list(Items) ->
    Tag = <<"list", (integer_to_binary(length(Items)))/binary>>,
    TagHash = sha384(Tag),
    lists:foldl(
        fun(Item, Acc) ->
            ItemHash = deep_hash(Item),
            sha384(<<Acc/binary, ItemHash/binary>>)
        end,
        TagHash,
        Items
    ).

sha384(Data) -> crypto:hash(sha384, Data).
```

Deep Hash is used for:
- ANS-104 data item signing
- Bundle item identification
- Content-addressed storage

For ANS-104 data items, the deep hash input is:
```erlang
deep_hash_data_item(DataItem) ->
    deep_hash([
        <<"dataitem">>,
        <<"1">>,                        % Format version
        SignatureType,                  % "1" for RSA-PSS
        Owner,                          % Public key
        Target,                         % Target address (or empty)
        Anchor,                         % Anchor (or empty)
        [[TagName, TagValue] || {TagName, TagValue} <- Tags],
        Data
    ]).
```

### 9.9 Structured Fields (RFC-8941)

HTTP Structured Fields provide a consistent serialization format for HTTP header values.

**Encoding Rules:**

| Type | Encoding |
|------|----------|
| String | `"value"` (double-quoted, escaped) |
| Integer | Decimal digits |
| Boolean | `?1` (true) or `?0` (false) |
| Binary | `:base64data:` (colon-delimited base64) |
| List | `(item1 item2 item3)` (space-separated) |
| Dictionary | `key1=value1, key2=value2` |

```erlang
encode_structured_field(Value) when is_binary(Value) ->
    Escaped = binary:replace(Value, <<"\"">>, <<"\\\"">>, [global]),
    <<"\"", Escaped/binary, "\"">>;
encode_structured_field(Value) when is_integer(Value) ->
    integer_to_binary(Value);
encode_structured_field(true) -> <<"?1">>;
encode_structured_field(false) -> <<"?0">>;
encode_structured_field({binary, Data}) ->
    <<":", (base64url_encode(Data))/binary, ":">>;
encode_structured_field(List) when is_list(List) ->
    Items = [encode_structured_field(I) || I <- List],
    <<"(", (iolist_to_binary(lists:join(<<" ">>, Items)))/binary, ")">>;
encode_structured_field(Map) when is_map(Map) ->
    Items = [[K, <<"=">>, encode_structured_field(V)]
             || {K, V} <- maps:to_list(Map)],
    iolist_to_binary(lists:join(<<", ">>, Items)).
```

**Decoding:**
```erlang
decode_structured_field(Str) ->
    Trimmed = string:trim(Str),
    case Trimmed of
        <<"\"", Rest/binary>> -> decode_string(Rest);
        <<":", Rest/binary>> -> decode_binary(Rest);
        <<"?1">> -> true;
        <<"?0">> -> false;
        <<"(", Rest/binary>> -> decode_list(Rest);
        _ -> decode_number_or_token(Trimmed)
    end.
```

---

## 10. Scheduler and Process Management

### 10.1 Scheduler Device

The scheduler manages message ordering for processes:

```erlang
#{
  <<"device">> => <<"scheduler@1.0">>,
  <<"process">> => ProcessID,
  <<"authority">> => SchedulerAddress
}
```

### 10.2 Slot Assignment

Each message gets a sequential slot number:

```erlang
assign_slot(Process, Message, Opts) ->
    CurrentSlot = get_current_slot(Process),
    NextSlot = CurrentSlot + 1,
    Assignment = #{
        <<"slot">> => NextSlot,
        <<"timestamp">> => current_timestamp(),
        <<"block-height">> => current_block_height(),
        <<"process">> => Process,
        <<"message">> => message_id(Message)
    },
    sign_and_store(Assignment, Opts).
```

### 10.3 Message Flow

```
┌─────────┐    ┌───────────┐    ┌──────────┐    ┌────────┐
│ Client  │───>│ Scheduler │───>│ Executor │───>│ Result │
└─────────┘    └───────────┘    └──────────┘    └────────┘
                    │                │
                    v                v
              ┌──────────┐    ┌──────────┐
              │ Slot DB  │    │ State DB │
              └──────────┘    └──────────┘
```

### 10.4 Process State

```erlang
#{
  <<"process">> => ProcessID,
  <<"current-slot">> => 12345,
  <<"last-assignment">> => AssignmentID,
  <<"authority">> => SchedulerAddress,
  <<"cache-control">> => <<"always">>
}
```

### 10.5 Assignment Format

```erlang
#{
  <<"type">> => <<"assignment">>,
  <<"slot">> => 12345,
  <<"timestamp">> => 1699900000000,
  <<"block-height">> => 1234567,
  <<"block-hash">> => <<"abc123...">>,
  <<"block-timestamp">> => 1699899990,
  <<"process">> => ProcessID,
  <<"message">> => MessageID,
  <<"hash-chain">> => HashChainValue,
  <<"signature">> => Signature,
  <<"owner">> => SchedulerAddress
}
```

### 10.6 Execution Model

```erlang
execute_slot(Process, Slot, Opts) ->
    Assignment = get_assignment(Process, Slot),
    Message = get_message(Assignment),
    PreviousState = get_state(Process, Slot - 1),

    Result = compute(PreviousState, Message, Opts),

    store_state(Process, Slot, Result),
    Result.
```

### 10.7 Compute Flow

1. Load process state at slot N-1
2. Get assignment for slot N
3. Load message from assignment
4. Execute message against state
5. Store resulting state at slot N
6. Return results to caller

### 10.8 Epoch-Based Scheduling

Slots are organized into epochs for efficient batching and archival:

```erlang
% Epoch configuration
-define(SLOTS_PER_EPOCH, 1000).

% Calculate epoch from slot
epoch_from_slot(Slot) -> Slot div ?SLOTS_PER_EPOCH.

% Calculate nonce (position within epoch)
nonce_from_slot(Slot) -> Slot rem ?SLOTS_PER_EPOCH.

% Full slot from epoch and nonce
slot_from_epoch_nonce(Epoch, Nonce) ->
    (Epoch * ?SLOTS_PER_EPOCH) + Nonce.
```

**Schedule Location Format:**

A schedule location encodes the current position as `address/epoch/nonce/hash-chain`:

```erlang
format_schedule_location(Address, Epoch, Nonce, HashChain) ->
    <<Address/binary, "/",
      (integer_to_binary(Epoch))/binary, "/",
      (integer_to_binary(Nonce))/binary, "/",
      HashChain/binary>>.

parse_schedule_location(Location) ->
    [Address, EpochStr, NonceStr, HashChain] =
        binary:split(Location, <<"/">>, [global]),
    #{
        address => Address,
        epoch => binary_to_integer(EpochStr),
        nonce => binary_to_integer(NonceStr),
        hash_chain => HashChain
    }.
```

**Epoch Benefits:**
- Efficient range queries for slots within an epoch
- Enables batch archival of completed epochs to Arweave
- Allows epoch-based payment settlements
- Supports parallel processing of independent epochs

### 10.9 Hash Chain Computation

The hash chain provides cryptographic ordering proof for slots:

```erlang
compute_hash_chain(ProcessId, Slot, Message, PreviousHashChain) ->
    Input = <<
        ProcessId/binary,
        (integer_to_binary(Slot))/binary,
        (message_id(Message))/binary,
        PreviousHashChain/binary
    >>,
    sha256(Input).
```

**Hash Chain Properties:**
- Each slot's hash chain value depends on all previous slots
- Provides total ordering proof without full history replay
- Enables efficient verification of scheduler honesty
- Genesis hash chain (slot 0) is the process ID itself

```erlang
% Genesis slot
initial_hash_chain(ProcessId) -> sha256(ProcessId).

% Assignment with hash chain
create_assignment(Process, Slot, Message, Opts) ->
    PreviousSlot = Slot - 1,
    PreviousHashChain = case Slot of
        1 -> initial_hash_chain(Process);
        _ -> get_hash_chain(Process, PreviousSlot)
    end,

    HashChain = compute_hash_chain(Process, Slot, Message, PreviousHashChain),

    Assignment = #{
        <<"slot">> => Slot,
        <<"timestamp">> => erlang:system_time(millisecond),
        <<"process">> => Process,
        <<"message">> => message_id(Message),
        <<"epoch">> => epoch_from_slot(Slot),
        <<"nonce">> => nonce_from_slot(Slot),
        <<"hash-chain">> => HashChain
    },

    sign_assignment(Assignment, Opts).
```

**Verification:**
```erlang
verify_hash_chain(Process, Assignments) ->
    lists:foldl(
        fun(Assignment, {true, PrevHash}) ->
            Slot = maps:get(<<"slot">>, Assignment),
            MsgId = maps:get(<<"message">>, Assignment),
            ExpectedHash = compute_hash_chain(Process, Slot, MsgId, PrevHash),
            ActualHash = maps:get(<<"hash-chain">>, Assignment),
            {ExpectedHash =:= ActualHash, ActualHash};
        (_, {false, _}) ->
            {false, invalid}
        end,
        {true, initial_hash_chain(Process)},
        lists:sort(fun(A, B) ->
            maps:get(<<"slot">>, A) < maps:get(<<"slot">>, B)
        end, Assignments)
    ).
```

---

## 11. Built-in Devices

### 11.1 Message Device (`message@1.0`)

Core message operations:

| Function | Description |
|----------|-------------|
| `id` | Get message ID |
| `get` | Get key value |
| `set` | Set key value |
| `keys` | List all keys |
| `match` | Pattern match |
| `serialize` | Convert to binary |
| `deserialize` | Parse from binary |
| `sign` | Sign message |
| `verify` | Verify signature |

### 11.2 Router Device (`router@1.0`)

HTTP request routing:

| Function | Description |
|----------|-------------|
| `route` | Match path to handler |
| `handle` | Process HTTP request |
| `dispatch` | Forward to target |

### 11.3 Scheduler Device (`scheduler@1.0`)

Process scheduling:

| Function | Description |
|----------|-------------|
| `schedule` | Assign slot to message |
| `slot` | Get current slot |
| `info` | Scheduler metadata |
| `next` | Get next assignment |
| `assignments` | List assignments |

### 11.4 Compute Device (`compute@1.0`)

State computation:

| Function | Description |
|----------|-------------|
| `compute` | Execute message on state |
| `result` | Get computation result |
| `state` | Get process state |
| `push` | Add message to process |

### 11.5 WASM Device (`wasm64-emscripten@1.0`)

WebAssembly execution:

| Function | Description |
|----------|-------------|
| `init` | Initialize WASM module |
| `compute` | Execute WASM function |
| `snapshot` | Save WASM state |
| `restore` | Restore WASM state |

Configuration:
```erlang
#{
  <<"device">> => <<"wasm64-emscripten@1.0">>,
  <<"wasm-module">> => ModuleBinary,
  <<"memory-limit">> => 8589934592,  % 8GB
  <<"stack-size">> => 8388608,       % 8MB
  <<"mode">> => <<"wasm64">>
}
```

### 11.6 Process Device (`process@1.0`)

Process lifecycle:

| Function | Description |
|----------|-------------|
| `spawn` | Create new process |
| `state` | Get current state |
| `compute` | Execute on process |
| `push` | Send message to process |
| `cron` | Schedule recurring execution |

### 11.7 Cache Device (`cache@1.0`)

Caching operations:

| Function | Description |
|----------|-------------|
| `read` | Read from cache |
| `write` | Write to cache |
| `lookup` | Check cache without loading |
| `notify` | Cache invalidation |

### 11.8 JSON Device (`json@1.0`)

JSON encoding/decoding:

| Function | Description |
|----------|-------------|
| `encode` | Message to JSON |
| `decode` | JSON to message |
| `serialize` | JSON string output |

### 11.9 Wallet Device (`wallet@1.0`)

Wallet operations:

| Function | Description |
|----------|-------------|
| `generate` | Create new wallet |
| `address` | Get wallet address |
| `sign` | Sign data |
| `verify` | Verify signature |

### 11.10 Meta Device (`meta@1.0`)

Device introspection:

| Function | Description |
|----------|-------------|
| `info` | Get device info |
| `exports` | List exported functions |
| `devices` | List available devices |

### 11.11 Relay Device (`relay@1.0`)

Cross-node messaging:

| Function | Description |
|----------|-------------|
| `push` | Forward message |
| `result` | Get relay result |
| `listen` | Subscribe to messages |

### 11.12 CRON Device (`cron@1.0`)

Scheduled execution:

| Function | Description |
|----------|-------------|
| `schedule` | Add cron job |
| `next` | Get next execution time |
| `tick` | Trigger scheduled jobs |

### 11.13 Multipass Device (`multipass@1.0`)

Multi-stage execution:

| Function | Description |
|----------|-------------|
| `pass` | Execute single pass |
| `passes` | Execute all passes |
| `result` | Get pass result |

Passes: `init`, `pre`, `execute`, `post`, `finalize`

### 11.14 P4 Device (`p4@1.0`)

Payment channel management:

| Function | Description |
|----------|-------------|
| `balance` | Get channel balance |
| `topup` | Add funds |
| `withdraw` | Remove funds |
| `check` | Verify payment |

---

## 12. Codec System

### 12.1 Codec Interface

```erlang
% Encode message to binary
encode(Message, Opts) -> {ok, Binary} | {error, Reason}.

% Decode binary to message
decode(Binary, Opts) -> {ok, Message} | {error, Reason}.

% Content type
content_type() -> <<"application/x-format">>.
```

### 12.2 Available Codecs

| Codec | Content-Type | Description |
|-------|--------------|-------------|
| `codec_ans104` | `application/x-ans-104` | ANS-104 data items |
| `codec_json` | `application/json` | JSON encoding |
| `codec_flat` | `application/x-flat` | Flat key-value |
| `codec_httpsig` | `application/x-httpsig` | HTTP signatures |
| `codec_structured` | `application/x-structured` | RFC-9651 structured fields |

### 12.3 JSON Encoding Rules

```erlang
% Message to JSON
encode_json(Message) ->
    maps:fold(
        fun
            (Key, Value, Acc) when is_binary(Value) ->
                Acc#{Key => Value};
            (Key, Value, Acc) when is_integer(Value) ->
                Acc#{Key => Value};
            (Key, Value, Acc) when is_map(Value) ->
                Acc#{Key => encode_json(Value)};
            (Key, Value, Acc) when is_list(Value) ->
                Acc#{Key => lists:map(fun encode_json/1, Value)}
        end,
        #{},
        Message
    ).
```

### 12.4 ANS-104 Encoding

```erlang
encode_ans104(Message) ->
    SignatureType = get_signature_type(Message),
    Signature = maps:get(<<"signature">>, Message, <<>>),
    Owner = maps:get(<<"owner">>, Message, <<>>),
    Target = maps:get(<<"target">>, Message, <<>>),
    Anchor = maps:get(<<"anchor">>, Message, <<>>),
    Tags = encode_tags(maps:get(<<"tags">>, Message, #{})),
    Data = maps:get(<<"data">>, Message, <<>>),

    <<
        SignatureType:16/big,
        Signature/binary,
        Owner/binary,
        (encode_optional(Target))/binary,
        (encode_optional(Anchor))/binary,
        (length(Tags)):64/big,
        (byte_size(Tags)):64/big,
        Tags/binary,
        Data/binary
    >>.
```

### 12.5 Structured Fields (RFC-9651)

For complex header values:

```erlang
% Dictionary: key=value, key=value
parse_dictionary(<<"a=1, b=2">>) -> #{<<"a">> => 1, <<"b">> => 2}.

% List: "item1", "item2", "item3"
parse_list(<<"\"a\", \"b\", \"c\"">>) -> [<<"a">>, <<"b">>, <<"c">>].

% Item with parameters: value;param1=x;param2=y
parse_item(<<"token;q=0.5">>) -> {<<"token">>, #{<<"q">> => 0.5}}.
```

### 12.6 Commitment Device Interface

A Commitment Device handles cryptographic signing and verification of messages. It is separate from codec encoding/decoding.

```erlang
% Commitment device behavior
-callback commit(Message, Opts) -> {ok, SignedMessage} | {error, Reason}.
-callback verify(Message, Mode, Opts) -> boolean().
-callback signers(Message, Opts) -> [Address].
-callback unsigned_id(Message, Opts) -> ID.
```

**Interface Functions:**

| Function | Description |
|----------|-------------|
| `commit/2` | Sign the message with wallet from Opts |
| `verify/3` | Verify signature(s), Mode: `all` or `any` |
| `signers/2` | Get list of signer addresses |
| `unsigned_id/2` | Get message ID without signature |

**HTTPSig Commitment (Default):**

```erlang
% dev_codec_httpsig as commitment device
commit_httpsig(Msg, Opts) ->
    Wallet = maps:get(priv_wallet, Opts),
    HeadersToSign = maps:keys(maps:without([<<"body">>, <<"signature">>,
                                            <<"signature-input">>], Msg)),
    SigInput = create_signature_input(HeadersToSign),
    SigBase = create_signature_base(Msg, SigInput),
    Signature = rsa_pss_sign(Wallet, SigBase),
    {ok, Msg#{
        <<"signature">> => Signature,
        <<"signature-input">> => SigInput,
        <<"owner">> => wallet_address(Wallet)
    }}.

verify_httpsig(Msg, _Mode, _Opts) ->
    Signature = maps:get(<<"signature">>, Msg),
    SigInput = maps:get(<<"signature-input">>, Msg),
    Owner = maps:get(<<"owner">>, Msg),
    SigBase = create_signature_base(Msg, SigInput),
    rsa_pss_verify({n => Owner, e => 65537}, Signature, SigBase).
```

**ANS-104 Commitment:**

```erlang
commit_ans104(Msg, Opts) ->
    Wallet = maps:get(priv_wallet, Opts),
    Tags = message_to_tags(Msg),
    Data = maps:get(<<"body">>, Msg, <<>>),

    % Deep hash signature data
    SigData = deep_hash([
        <<"dataitem">>, <<"1">>, <<"1">>,
        wallet_pubkey(Wallet),
        <<>>, <<>>,  % target, anchor
        [[N, V] || {N, V} <- Tags],
        Data
    ]),

    Signature = rsa_pss_sign(Wallet, SigData),
    ID = sha256(Signature),

    {ok, Msg#{
        <<"signature">> => Signature,
        <<"owner">> => wallet_pubkey(Wallet),
        <<"id">> => ID
    }}.
```

**Multi-Signature Support:**

Messages can have multiple signatures (e.g., from different authorities):

```erlang
signers(Msg, _Opts) ->
    case maps:get(<<"attestations">>, Msg, undefined) of
        undefined ->
            [maps:get(<<"owner">>, Msg)];
        Attestations when is_list(Attestations) ->
            [maps:get(<<"owner">>, A) || A <- Attestations]
    end.

verify(Msg, all, Opts) ->
    Signers = signers(Msg, Opts),
    lists:all(fun(S) -> verify_signer(Msg, S, Opts) end, Signers);
verify(Msg, any, Opts) ->
    Signers = signers(Msg, Opts),
    lists:any(fun(S) -> verify_signer(Msg, S, Opts) end, Signers).
```

---

## 13. Caching System

### 13.1 Cache Keys

Cache keys are derived from:
- Message ID (for raw messages)
- Hashpath (for computation results)
- Path + Options hash (for resolutions)

```erlang
cache_key(Message, Path, Opts) ->
    ID = message_id(Message),
    PathHash = sha256(Path),
    OptsHash = sha256(serialize_opts(Opts)),
    sha256(<<ID/binary, PathHash/binary, OptsHash/binary>>).
```

### 13.2 Cache Control

Via `cache-control` header/option:

| Value | Behavior |
|-------|----------|
| `no-cache` | Skip cache lookup, always compute |
| `no-store` | Don't cache result |
| `only-if-cached` | Only return if cached |
| `max-age=N` | Cache for N seconds |
| `stale-while-revalidate` | Return stale, refresh async |

### 13.3 Cache Invalidation

```erlang
invalidate(Pattern, Store) ->
    Keys = list_matching(Pattern, Store),
    lists:foreach(fun(K) -> delete(K, Store) end, Keys).
```

### 13.4 Preloading

Preload data on startup:

```erlang
preload(Config) ->
    Sources = maps:get(<<"preload">>, Config, []),
    lists:foreach(
        fun(Source) ->
            Data = fetch(Source),
            store_local(Data)
        end,
        Sources
    ).
```

---

## 14. HTTP Client

### 14.1 Connection Pooling

HyperBEAM maintains connection pools per host:

```erlang
#{
  <<"pool-size">> => 10,
  <<"max-connections">> => 100,
  <<"idle-timeout">> => 60000,
  <<"connect-timeout">> => 5000
}
```

### 14.2 Request Options

```erlang
request(Method, URL, Headers, Body, Opts) ->
    #{
        method => Method,
        url => URL,
        headers => Headers,
        body => Body,
        timeout => maps:get(timeout, Opts, 30000),
        follow_redirects => maps:get(follow_redirects, Opts, true),
        max_redirects => maps:get(max_redirects, Opts, 5)
    }.
```

### 14.3 Response Handling

```erlang
#{
  status => 200,
  headers => #{<<"content-type">> => <<"application/json">>},
  body => <<"{...}">>
}
```

### 14.4 Retry Logic

```erlang
with_retry(Fun, MaxRetries, Delay) ->
    try Fun()
    catch
        error:timeout when MaxRetries > 0 ->
            timer:sleep(Delay),
            with_retry(Fun, MaxRetries - 1, Delay * 2)
    end.
```

---

## 15. Configuration Options

### 15.1 Node Configuration

```erlang
#{
  %% Network
  <<"port">> => 10000,
  <<"host">> => <<"0.0.0.0">>,

  %% Storage
  <<"store">> => [
    #{<<"store-module">> => hb_store_lru, <<"capacity">> => 4294967296},
    #{<<"store-module">> => hb_store_rocksdb, <<"name">> => <<"./data">>}
  ],

  %% Identity
  <<"wallet">> => WalletConfig,
  <<"address">> => NodeAddress,

  %% Execution
  <<"scheduler">> => SchedulerConfig,
  <<"compute-timeout">> => 60000,

  %% Features
  <<"features">> => [<<"wasm">>, <<"p4">>, <<"relay">>],

  %% Logging
  <<"log-level">> => <<"info">>,
  <<"debug-modules">> => []
}
```

### 15.2 Option Resolution

Options are resolved in order:
1. Explicit call options
2. Message options
3. Process defaults
4. Node configuration
5. System defaults

```erlang
get_opt(Key, Opts) ->
    case maps:find(Key, Opts) of
        {ok, Value} -> Value;
        error -> get_default(Key)
    end.
```

### 15.3 Feature Flags

```erlang
#{
  <<"features">> => #{
    <<"wasm">> => true,
    <<"p4">> => false,
    <<"rocksdb">> => true,
    <<"remote-attestation">> => false
  }
}
```

---

## Appendix A: Message Examples

### A.1 Simple Message

```erlang
#{
  <<"device">> => <<"message@1.0">>,
  <<"data">> => <<"Hello, World!">>,
  <<"content-type">> => <<"text/plain">>
}
```

### A.2 Process Message

```erlang
#{
  <<"device">> => <<"process@1.0">>,
  <<"type">> => <<"process">>,
  <<"scheduler">> => SchedulerAddress,
  <<"module">> => WasmModuleID,
  <<"memory-limit">> => 8589934592,
  <<"compute-limit">> => 10000000000
}
```

### A.3 Assignment Message

```erlang
#{
  <<"device">> => <<"scheduler@1.0">>,
  <<"type">> => <<"assignment">>,
  <<"process">> => ProcessID,
  <<"slot">> => 12345,
  <<"timestamp">> => 1699900000000,
  <<"message">> => MessageID,
  <<"signature">> => Signature
}
```

### A.4 HTTP Request as Message

```erlang
#{
  <<"device">> => <<"router@1.0">>,
  <<"method">> => <<"POST">>,
  <<"path">> => <<"/process/abc123/compute">>,
  <<"headers">> => #{
    <<"content-type">> => <<"application/json">>,
    <<"authorization">> => <<"Bearer token">>
  },
  <<"body">> => <<"{\"action\": \"transfer\", \"amount\": 100}">>
}
```

---

## Appendix B: Error Codes

| Code | Name | Description |
|------|------|-------------|
| 400 | Bad Request | Malformed request message |
| 401 | Unauthorized | Missing or invalid signature |
| 403 | Forbidden | Access denied |
| 404 | Not Found | Message/process not found |
| 408 | Timeout | Computation timeout |
| 413 | Payload Too Large | Message exceeds size limit |
| 500 | Internal Error | Server error |
| 502 | Bad Gateway | Upstream node error |
| 503 | Service Unavailable | Node overloaded |

---

## Appendix C: Protocol Constants

```erlang
%% Message limits
-define(MAX_MESSAGE_SIZE, 12582912).      % 12MB
-define(MAX_TAG_COUNT, 128).
-define(MAX_TAG_NAME_SIZE, 1024).
-define(MAX_TAG_VALUE_SIZE, 3072).

%% Timeouts
-define(DEFAULT_TIMEOUT, 60000).          % 60s
-define(MAX_TIMEOUT, 600000).             % 10min

%% Cache
-define(DEFAULT_LRU_CAPACITY, 4294967296). % 4GB
-define(CACHE_TTL_DEFAULT, 3600).          % 1hr

%% Hashing
-define(HASH_ALG, sha256).
-define(ID_SIZE, 32).                      % bytes
-define(ENCODED_ID_SIZE, 43).              % base64url
```

---

## Appendix D: Base64URL Encoding

```erlang
encode_base64url(Binary) ->
    Base64 = base64:encode(Binary),
    NoPadding = binary:replace(Base64, <<"=">>, <<>>, [global]),
    NoPlus = binary:replace(NoPadding, <<"+">>, <<"-">>, [global]),
    binary:replace(NoPlus, <<"/">>, <<"_">>, [global]).

decode_base64url(Encoded) ->
    WithPlus = binary:replace(Encoded, <<"-">>, <<"+">>, [global]),
    WithSlash = binary:replace(WithPlus, <<"_">>, <<"/">>, [global]),
    Padding = case byte_size(WithSlash) rem 4 of
        0 -> <<>>;
        2 -> <<"==">>;
        3 -> <<"=">>
    end,
    base64:decode(<<WithSlash/binary, Padding/binary>>).
```

---

## Appendix E: Reference Implementation Modules

| Module | Description |
|--------|-------------|
| `hb.erl` | Application entry point |
| `hb_converge.erl` | Core resolution algorithm |
| `hb_message.erl` | Message operations |
| `hb_path.erl` | Path parsing and resolution |
| `hb_opts.erl` | Option management |
| `hb_cache.erl` | Caching system |
| `hb_store.erl` | Store interface |
| `hb_http_server.erl` | HTTP server |
| `hb_http_client.erl` | HTTP client |
| `dev_message.erl` | Message device |
| `dev_router.erl` | Router device |
| `dev_scheduler.erl` | Scheduler device |
| `dev_process.erl` | Process device |
| `dev_wasm.erl` | WASM device |

---

## Appendix F: Detailed Key Handling

### F.1 Key Normalization Algorithm

All keys are normalized before comparison or lookup:

```erlang
normalize_key(Key) when is_integer(Key) ->
    integer_to_binary(Key);
normalize_key(Key) when is_atom(Key) ->
    normalize_key(atom_to_binary(Key, utf8));
normalize_key(Key) when is_binary(Key) ->
    %% Convert to lowercase
    Lower = string:lowercase(Key),
    %% Replace hyphens with underscores
    binary:replace(Lower, <<"-">>, <<"_">>, [global]).
```

### F.2 Key Equivalence Examples

```
"Content-Type"  == "content-type" == "content_type" == "CONTENT_TYPE"
"Process-ID"    == "process_id"   == "PROCESS-ID"
"1"             == 1              (integer keys)
```

### F.3 Private Keys (`priv/`)

Keys under `priv/` are excluded from:
- Serialization to external formats
- Signature calculation
- Hashpath computation
- Cache key generation

```erlang
is_private_key(<<"priv/", _/binary>>) -> true;
is_private_key(<<"priv">>) -> true;
is_private_key(_) -> false.

%% Filter private keys
filter_private(Message) ->
    maps:filter(
        fun(Key, _) -> not is_private_key(Key) end,
        Message
    ).
```

### F.4 Reserved Keys

| Key | Purpose | Private |
|-----|---------|---------|
| `device` | Device identifier | No |
| `id` | Message ID (computed) | No |
| `signature` | Message signature | No |
| `owner` | Message owner address | No |
| `target` | Target address | No |
| `anchor` | Transaction anchor | No |
| `data` | Message data/body | No |
| `body` | Nested messages | No |
| `tags` | ANS-104 tags | No |
| `priv` | Private data container | Yes |
| `priv/hashpath` | Current hashpath | Yes |
| `priv/cache` | Cache metadata | Yes |
| `priv/wallet` | Signing wallet | Yes |
| `commitments` | Signature commitments | Partial |

### F.5 Message Key Access

```erlang
%% Get with normalization
get(Key, Message, Opts) ->
    NormKey = normalize_key(Key),
    case maps:find(NormKey, normalize_keys(Message, Opts)) of
        {ok, Value} -> Value;
        error -> maps:get(default, Opts, not_found)
    end.

%% Set with normalization
set(Key, Value, Message, Opts) ->
    NormKey = normalize_key(Key),
    Message#{NormKey => Value}.

%% Normalize all keys in message
normalize_keys(Message, Opts) when is_map(Message) ->
    maps:fold(
        fun(K, V, Acc) ->
            Acc#{normalize_key(K) => maybe_normalize_value(V, Opts)}
        end,
        #{},
        Message
    ).
```

### F.6 Deep Key Access

For nested paths like `body/1/data`:

```erlang
deep_get(Path, Message, Opts) ->
    Parts = path_to_parts(Path),
    deep_get_parts(Parts, Message, Opts).

deep_get_parts([], Value, _Opts) ->
    Value;
deep_get_parts([Key | Rest], Message, Opts) when is_map(Message) ->
    case get(Key, Message, Opts) of
        not_found -> not_found;
        Value -> deep_get_parts(Rest, Value, Opts)
    end;
deep_get_parts(_, _, _) ->
    not_found.
```

---

## Appendix G: Detailed Converge Algorithm

### G.1 Resolution State Machine

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    v                                         │
┌──────────┐   ┌────────┐   ┌─────────┐   ┌─────────┐   ┌────────┐
│  START   │──>│NORMALIZE│──>│ LOOKUP  │──>│ DEVICE  │──>│EXECUTE │
└──────────┘   └────────┘   └─────────┘   └─────────┘   └────────┘
                                │              │              │
                                │ not_found    │ error        │
                                v              v              v
                           ┌─────────┐   ┌─────────┐   ┌────────┐
                           │  ERROR  │   │  ERROR  │   │ RESULT │
                           └─────────┘   └─────────┘   └────────┘
                                                             │
                                                             │ has more path
                                                             │
                                                             └──────> (recurse)
```

### G.2 Full Resolution Algorithm

```erlang
resolve(Message, Opts) ->
    Path = get_path(Opts),
    resolve(Message, Path, Opts).

resolve(Message, Path, Opts) ->
    %% Stage 1: Normalize
    NormMessage = normalize_keys(Message, Opts),
    NormPath = normalize_path(Path),

    %% Stage 2: Cache lookup
    case check_cache(NormMessage, NormPath, Opts) of
        {hit, CachedResult} ->
            CachedResult;
        miss ->
            %% Stage 3: Execute
            Result = do_resolve(NormMessage, NormPath, Opts),

            %% Stage 4: Cache store
            maybe_cache(NormMessage, NormPath, Result, Opts),
            Result
    end.

do_resolve(Message, [], _Opts) ->
    %% Empty path - return message
    Message;

do_resolve(Message, [Key | Rest], Opts) ->
    %% Check for device function call
    case is_device_call(Key, Message, Opts) of
        {true, Device, Function} ->
            %% Execute device function
            Result = call_device(Device, Function, Message, Opts),
            %% Continue with remaining path
            resolve(Result, Rest, Opts);

        false ->
            %% Simple key lookup
            case get_key_value(Key, Message, Opts) of
                {ok, Value} when is_map(Value) ->
                    resolve(Value, Rest, Opts);
                {ok, Value} when Rest == [] ->
                    Value;
                {ok, _Value} ->
                    %% Non-map value but more path remaining
                    {error, {cannot_traverse, Key, Rest}};
                not_found ->
                    not_found
            end
    end.
```

### G.3 Device Function Resolution

```erlang
is_device_call(Key, Message, Opts) ->
    Device = get_device(Message, Opts),
    case Device of
        not_found ->
            false;
        DeviceMod ->
            Info = DeviceMod:info(Message),
            Exports = maps:get(<<"exports">>, Info, []),
            case lists:member(Key, Exports) of
                true -> {true, DeviceMod, Key};
                false -> check_default_function(Key, Info, DeviceMod)
            end
    end.

check_default_function(Key, Info, DeviceMod) ->
    case maps:get(<<"default">>, Info, undefined) of
        undefined -> false;
        DefaultFn -> {true, DeviceMod, DefaultFn, Key}
    end.

get_device(Message, Opts) ->
    case get(<<"device">>, Message, Opts) of
        not_found -> not_found;
        DeviceName -> load_device(DeviceName, Opts)
    end.

load_device(Name, _Opts) ->
    %% Parse device name: "name@version"
    {DevName, _Version} = parse_device_name(Name),
    %% Convert to module: dev_<name>
    ModName = list_to_existing_atom("dev_" ++ binary_to_list(DevName)),
    ModName.
```

### G.4 Hashpath Computation

```erlang
compute_hashpath(PrevHashpath, Device, Function, Args, Opts) ->
    case maps:get(hashpath, Opts, compute) of
        ignore ->
            PrevHashpath;
        compute ->
            DeviceHash = crypto:hash(sha256, Device),
            FunctionHash = crypto:hash(sha256, Function),
            ArgsHash = hash_args(Args),
            crypto:hash(sha256, <<
                PrevHashpath/binary,
                DeviceHash/binary,
                FunctionHash/binary,
                ArgsHash/binary
            >>)
    end.

hash_args(Args) when is_map(Args) ->
    %% Sort keys for determinism
    Sorted = lists:sort(maps:to_list(Args)),
    crypto:hash(sha256, term_to_binary(Sorted));
hash_args(Args) ->
    crypto:hash(sha256, term_to_binary(Args)).
```

### G.5 Error Handling in Converge

```erlang
handle_error(Error, Opts) ->
    Strategy = maps:get(error_strategy, Opts, throw),
    case Strategy of
        throw ->
            throw(Error);
        return ->
            {error, Error};
        log ->
            log_error(Error),
            {error, Error};
        ignore ->
            not_found
    end.
```

---

## Appendix H: HTTP Server Implementation

### H.1 Request Parsing

```erlang
parse_request(Method, Path, Headers, Body) ->
    #{
        <<"method">> => Method,
        <<"path">> => Path,
        <<"headers">> => parse_headers(Headers),
        <<"body">> => Body,
        <<"query-params">> => parse_query(Path)
    }.

parse_headers(Headers) ->
    lists:foldl(
        fun({Name, Value}, Acc) ->
            NormName = normalize_key(Name),
            Acc#{NormName => Value}
        end,
        #{},
        Headers
    ).

parse_query(Path) ->
    case binary:split(Path, <<"?">>) of
        [_] -> #{};
        [_, Query] ->
            parse_query_string(Query)
    end.

parse_query_string(Query) ->
    Parts = binary:split(Query, <<"&">>, [global]),
    lists:foldl(
        fun(Part, Acc) ->
            case binary:split(Part, <<"=">>) of
                [Key, Value] ->
                    Acc#{url_decode(Key) => url_decode(Value)};
                [Key] ->
                    Acc#{url_decode(Key) => true}
            end
        end,
        #{},
        Parts
    ).
```

### H.2 Singleton Creation

```erlang
create_singleton(Request, Opts) ->
    #{
        <<"device">> => <<"router@1.0">>,
        <<"request">> => true,
        <<"1">> => Request,
        <<"priv">> => #{
            <<"trace">> => start_trace()
        }
    }.
```

### H.3 Response Serialization

```erlang
serialize_response(Message, Opts) ->
    Status = maps:get(<<"status">>, Message, 200),
    ContentType = maps:get(<<"content-type">>, Message, <<"application/octet-stream">>),
    Body = serialize_body(Message, ContentType, Opts),
    Headers = build_response_headers(Message, ContentType),
    {Status, Headers, Body}.

serialize_body(Message, <<"application/json">>, Opts) ->
    json_encode(filter_private(Message));
serialize_body(Message, <<"application/x-ans-104">>, Opts) ->
    ans104_encode(Message, Opts);
serialize_body(Message, _, _Opts) ->
    maps:get(<<"body">>, Message, <<>>).

build_response_headers(Message, ContentType) ->
    BaseHeaders = [
        {<<"content-type">>, ContentType}
    ],
    %% Add custom headers from message
    CustomHeaders = maps:get(<<"headers">>, Message, #{}),
    BaseHeaders ++ maps:to_list(CustomHeaders).
```

### H.4 Content Negotiation

```erlang
negotiate_content_type(Request, Opts) ->
    Accept = get(<<"accept">>, get(<<"headers">>, Request, #{}), Opts),
    case Accept of
        not_found ->
            <<"application/octet-stream">>;
        <<"*/*">> ->
            <<"application/octet-stream">>;
        <<"application/json">> ->
            <<"application/json">>;
        <<"application/x-ans-104">> ->
            <<"application/x-ans-104">>;
        Other ->
            %% Parse accept header with quality values
            parse_accept(Other)
    end.

parse_accept(Accept) ->
    %% "application/json;q=0.9, text/html;q=0.8"
    Parts = binary:split(Accept, <<",">>, [global]),
    Sorted = lists:sort(
        fun({_, Q1}, {_, Q2}) -> Q1 > Q2 end,
        lists:map(fun parse_accept_part/1, Parts)
    ),
    case Sorted of
        [{Type, _} | _] -> Type;
        [] -> <<"application/octet-stream">>
    end.
```

### H.5 Multipart Parsing

```erlang
parse_multipart(Body, Boundary) ->
    Parts = split_multipart(Body, Boundary),
    lists:foldl(
        fun({Index, Part}, Acc) ->
            {Headers, Content} = split_part(Part),
            Acc#{integer_to_binary(Index) => #{
                <<"headers">> => Headers,
                <<"body">> => Content
            }}
        end,
        #{},
        lists:zip(lists:seq(1, length(Parts)), Parts)
    ).

split_multipart(Body, Boundary) ->
    Delimiter = <<"--", Boundary/binary>>,
    Parts = binary:split(Body, Delimiter, [global]),
    %% Remove first (empty) and last (--) parts
    lists:filter(
        fun(P) -> P /= <<>> andalso P /= <<"--">> andalso P /= <<"--\r\n">> end,
        Parts
    ).
```

---

## Appendix I: HTTP Message Signatures (RFC-9421)

### I.1 Signature Components

HTTP signatures cover specific request/response components:

```erlang
%% Components that can be signed
signature_components() -> [
    <<"@method">>,         % HTTP method
    <<"@target-uri">>,     % Full request URI
    <<"@authority">>,      % Host header
    <<"@scheme">>,         % http or https
    <<"@request-target">>, % Path + query
    <<"@path">>,           % Just the path
    <<"@query">>,          % Query string
    <<"content-type">>,    % Content-Type header
    <<"content-length">>,  % Content-Length header
    <<"content-digest">>   % Body digest
].
```

### I.2 Signature Base Construction

```erlang
build_signature_base(Request, Components) ->
    Lines = lists:map(
        fun(Component) ->
            Value = get_component_value(Component, Request),
            <<Component/binary, ": ", Value/binary>>
        end,
        Components
    ),
    iolist_to_binary(lists:join(<<"\n">>, Lines)).

get_component_value(<<"@method">>, Req) ->
    maps:get(<<"method">>, Req);
get_component_value(<<"@path">>, Req) ->
    [Path | _] = binary:split(maps:get(<<"path">>, Req), <<"?">>),
    Path;
get_component_value(<<"@authority">>, Req) ->
    maps:get(<<"host">>, maps:get(<<"headers">>, Req, #{}), <<>>);
get_component_value(Header, Req) ->
    maps:get(Header, maps:get(<<"headers">>, Req, #{}), <<>>).
```

### I.3 Signature Parameters

```erlang
signature_params() -> #{
    <<"keyid">> => KeyIdentifier,      % Signer's key ID
    <<"alg">> => <<"rsa-pss-sha256">>, % Algorithm
    <<"created">> => Timestamp,        % Creation time (Unix)
    <<"expires">> => Timestamp,        % Expiry time
    <<"nonce">> => RandomNonce         % Replay protection
}.
```

### I.4 Signature Header Format

```
Signature-Input: sig1=("@method" "@path" "content-digest");
                 keyid="key123";alg="rsa-pss-sha256";
                 created=1699900000;expires=1699903600

Signature: sig1=:base64-encoded-signature:
```

### I.5 Creating a Signature

```erlang
sign_request(Request, Wallet, Opts) ->
    Components = maps:get(components, Opts, default_components()),
    SigBase = build_signature_base(Request, Components),
    Params = build_signature_params(Wallet, Opts),

    %% Add params to signature base
    ParamsLine = format_params(Components, Params),
    FullBase = <<SigBase/binary, "\n", "\"@signature-params\": ", ParamsLine/binary>>,

    %% Sign
    Signature = crypto_sign(FullBase, Wallet),

    %% Add headers
    Request#{
        <<"headers">> => maps:merge(
            maps:get(<<"headers">>, Request, #{}),
            #{
                <<"signature-input">> => format_signature_input(Components, Params),
                <<"signature">> => format_signature(Signature)
            }
        )
    }.
```

### I.6 Verifying a Signature

```erlang
verify_signature(Request) ->
    SigInput = get_header(<<"signature-input">>, Request),
    Signature = get_header(<<"signature">>, Request),

    {Components, Params} = parse_signature_input(SigInput),
    SigBase = build_signature_base(Request, Components),

    KeyID = maps:get(<<"keyid">>, Params),
    PublicKey = lookup_public_key(KeyID),

    %% Verify expiry
    case check_expiry(Params) of
        expired -> {error, expired};
        ok ->
            %% Verify signature
            case crypto_verify(SigBase, Signature, PublicKey) of
                true -> {ok, Params};
                false -> {error, invalid_signature}
            end
    end.
```

### I.7 Content-Digest Header

For body integrity:

```erlang
add_content_digest(Request) ->
    Body = maps:get(<<"body">>, Request, <<>>),
    Digest = crypto:hash(sha256, Body),
    DigestHeader = <<"sha-256=:", (base64:encode(Digest))/binary, ":">>,
    set_header(<<"content-digest">>, DigestHeader, Request).
```

---

## Appendix J: Bundle and Nested Message Handling

### J.1 Bundle Structure

A bundle contains multiple data items:

```erlang
#{
    <<"device">> => <<"message@1.0">>,
    <<"bundle-format">> => <<"ans-104">>,
    <<"body">> => #{
        <<"1">> => FirstItem,
        <<"2">> => SecondItem,
        <<"3">> => ThirdItem
    },
    <<"manifest">> => #{
        <<"version">> => <<"0.2.0">>,
        <<"paths">> => #{
            <<"1">> => #{<<"id">> => ItemID1},
            <<"2">> => #{<<"id">> => ItemID2}
        }
    }
}
```

### J.2 Bundle Serialization

```erlang
serialize_bundle(Items) ->
    %% Calculate headers
    ItemCount = length(Items),
    Headers = lists:map(
        fun(Item) ->
            Binary = serialize_item(Item),
            ID = message_id(Item),
            Size = byte_size(Binary),
            {ID, Size, Binary}
        end,
        Items
    ),

    %% Build bundle binary
    HeaderSection = build_header_section(Headers),
    DataSection = iolist_to_binary([Bin || {_, _, Bin} <- Headers]),

    <<
        ItemCount:256/big,
        HeaderSection/binary,
        DataSection/binary
    >>.

build_header_section(Headers) ->
    iolist_to_binary([
        <<Size:256/big, ID:32/binary>>
        || {ID, Size, _} <- Headers
    ]).
```

### J.3 Bundle Parsing

```erlang
parse_bundle(Binary) ->
    <<ItemCount:256/big, Rest/binary>> = Binary,
    {Headers, DataSection} = parse_headers(Rest, ItemCount),
    Items = extract_items(Headers, DataSection),
    #{
        <<"body">> => number_items(Items),
        <<"manifest">> => build_manifest(Items)
    }.

parse_headers(Binary, Count) ->
    parse_headers(Binary, Count, []).

parse_headers(Rest, 0, Acc) ->
    {lists:reverse(Acc), Rest};
parse_headers(<<Size:256/big, ID:32/binary, Rest/binary>>, Count, Acc) ->
    parse_headers(Rest, Count - 1, [{ID, Size} | Acc]).

extract_items(Headers, DataSection) ->
    extract_items(Headers, DataSection, []).

extract_items([], <<>>, Acc) ->
    lists:reverse(Acc);
extract_items([{_ID, Size} | Headers], Data, Acc) ->
    <<ItemBinary:Size/binary, Rest/binary>> = Data,
    Item = deserialize_item(ItemBinary),
    extract_items(Headers, Rest, [Item | Acc]).
```

### J.4 Nested Message Resolution

When resolving paths into nested messages:

```erlang
resolve_nested(Message, [<<"body">> | Rest], Opts) ->
    Body = maps:get(<<"body">>, Message, #{}),
    resolve_nested(Body, Rest, Opts);

resolve_nested(Message, [Index | Rest], Opts) when is_integer(Index) ->
    Key = integer_to_binary(Index),
    case maps:get(Key, Message, not_found) of
        not_found -> not_found;
        Nested -> resolve_nested(Nested, Rest, Opts)
    end;

resolve_nested(Message, [Key | Rest], Opts) ->
    case maps:get(Key, Message, not_found) of
        not_found -> not_found;
        Nested when is_map(Nested) -> resolve_nested(Nested, Rest, Opts);
        Value when Rest == [] -> Value;
        _ -> not_found
    end;

resolve_nested(Message, [], _Opts) ->
    Message.
```

### J.5 Lazy Loading

Nested items can be loaded on-demand:

```erlang
lazy_get(Key, Message, Opts) ->
    case maps:get(Key, Message, not_found) of
        not_found ->
            %% Check manifest for ID
            case get_manifest_id(Key, Message) of
                not_found -> not_found;
                ID -> load_from_store(ID, Opts)
            end;
        #{<<"ref">> := ID} ->
            %% Reference - load from store
            load_from_store(ID, Opts);
        Value ->
            Value
    end.

get_manifest_id(Key, Message) ->
    Manifest = maps:get(<<"manifest">>, Message, #{}),
    Paths = maps:get(<<"paths">>, Manifest, #{}),
    case maps:get(Key, Paths, not_found) of
        not_found -> not_found;
        #{<<"id">> := ID} -> ID
    end.
```

---

## Appendix K: WASM Execution Details

### K.1 WASM Runtime (WAMR)

HyperBEAM uses WebAssembly Micro Runtime (WAMR) in AOT mode:

```erlang
#{
  <<"runtime">> => <<"wamr">>,
  <<"mode">> => <<"aot">>,          % Ahead-of-time compiled
  <<"wasm64">> => true,             % 64-bit memory addressing
  <<"memory-limit">> => 8589934592, % 8GB max
  <<"stack-size">> => 8388608,      % 8MB stack
  <<"table-size">> => 65536         % Function table entries
}
```

### K.2 WASM Module Structure

```
┌─────────────────────────────────────────┐
│ Module Header                           │
├─────────────────────────────────────────┤
│ Type Section (function signatures)      │
├─────────────────────────────────────────┤
│ Import Section (host functions)         │
├─────────────────────────────────────────┤
│ Function Section                        │
├─────────────────────────────────────────┤
│ Memory Section (initial/max pages)      │
├─────────────────────────────────────────┤
│ Global Section                          │
├─────────────────────────────────────────┤
│ Export Section                          │
├─────────────────────────────────────────┤
│ Code Section                            │
├─────────────────────────────────────────┤
│ Data Section (initial memory)           │
└─────────────────────────────────────────┘
```

### K.3 Host Function Imports

Standard AO WASM imports:

| Function | Signature | Description |
|----------|-----------|-------------|
| `ao_read` | `(ptr, len) -> i32` | Read from message |
| `ao_write` | `(ptr, len) -> i32` | Write to output |
| `ao_log` | `(ptr, len) -> void` | Debug logging |
| `ao_get_sender` | `(ptr) -> i32` | Get message sender |
| `ao_get_process` | `(ptr) -> i32` | Get process ID |
| `ao_spawn` | `(ptr, len) -> i64` | Spawn subprocess |
| `ao_send` | `(ptr, len) -> i64` | Send message |

### K.4 Memory Layout

```
0x00000000 ┌─────────────────────┐
           │ Stack (grows down)  │
           ├─────────────────────┤
           │ Heap (grows up)     │
           ├─────────────────────┤
           │ Global Data         │
           ├─────────────────────┤
           │ Code (read-only)    │
0xFFFFFFFF └─────────────────────┘
```

### K.5 State Snapshots

WASM state can be serialized for checkpointing:

```erlang
snapshot(WasmInstance) ->
    #{
        <<"memory">> => get_memory_bytes(WasmInstance),
        <<"globals">> => get_globals(WasmInstance),
        <<"table">> => get_table(WasmInstance)
    }.

restore(Snapshot, WasmInstance) ->
    set_memory_bytes(WasmInstance, maps:get(<<"memory">>, Snapshot)),
    set_globals(WasmInstance, maps:get(<<"globals">>, Snapshot)),
    set_table(WasmInstance, maps:get(<<"table">>, Snapshot)).
```

### K.6 Compute Limits

Execution is metered by:

```erlang
#{
  <<"compute-limit">> => 10000000000,  % Max instructions
  <<"memory-limit">> => 8589934592,    % Max memory bytes
  <<"call-depth">> => 1000,            % Max call stack
  <<"timeout">> => 60000               % Wall clock ms
}
```

### K.7 AOS (AO Operating System)

AOS provides a Lua environment on WASM:

```erlang
#{
  <<"device">> => <<"wasm64-emscripten@1.0">>,
  <<"module">> => AOSWasmModule,
  <<"variant">> => <<"aos-2.0">>,
  <<"extensions">> => [<<"json">>, <<"base64">>, <<"crypto">>]
}
```

---

## Appendix L: Arweave Integration

### L.1 Transaction Format

Arweave transaction structure:

```erlang
#{
  <<"format">> => 2,
  <<"id">> => TransactionID,           % SHA-256 hash
  <<"last_tx">> => AnchorID,           % Previous tx or block
  <<"owner">> => OwnerPublicKey,       % RSA-4096 public key
  <<"target">> => TargetAddress,       % Recipient (or empty)
  <<"quantity">> => <<"0">>,           % AR amount in winston
  <<"reward">> => <<"123456">>,        % Mining reward
  <<"data">> => DataBinary,            % Transaction data
  <<"data_size">> => <<"1024">>,       % Data size string
  <<"data_root">> => MerkleRoot,       % Data merkle root
  <<"tags">> => [                      % Key-value tags
    #{<<"name">> => <<"App">>, <<"value">> => <<"AO">>}
  ],
  <<"signature">> => RSASignature      % RSA-PSS signature
}
```

### L.2 Data Item (ANS-104)

For bundled transactions:

```erlang
#{
  <<"signature_type">> => 1,           % RSA-4096
  <<"signature">> => Signature,
  <<"owner">> => Owner,
  <<"target">> => Target,              % Optional
  <<"anchor">> => Anchor,              % Optional
  <<"tags">> => Tags,
  <<"data">> => Data
}
```

### L.3 Bundle Format

ANS-104 bundle structure:

```
┌────────────────────────────────────┐
│ Item Count (32 bytes, big-endian)  │
├────────────────────────────────────┤
│ Item 1 Header:                     │
│   - Size (32 bytes)                │
│   - ID (32 bytes)                  │
├────────────────────────────────────┤
│ Item 2 Header...                   │
├────────────────────────────────────┤
│ Item N Header...                   │
├────────────────────────────────────┤
│ Item 1 Binary Data                 │
├────────────────────────────────────┤
│ Item 2 Binary Data...              │
├────────────────────────────────────┤
│ Item N Binary Data...              │
└────────────────────────────────────┘
```

### L.4 Gateway API

Standard Arweave gateway endpoints:

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/tx/{id}` | GET | Get transaction by ID |
| `/tx/{id}/data` | GET | Get transaction data |
| `/{id}` | GET | Get data item by ID |
| `/graphql` | POST | GraphQL queries |
| `/price/{bytes}` | GET | Get price for data |
| `/tx` | POST | Submit transaction |

### L.5 GraphQL Queries

```graphql
query GetTransactions($ids: [ID!]) {
  transactions(ids: $ids) {
    edges {
      node {
        id
        owner { address }
        tags { name value }
        block { height timestamp }
        data { size }
      }
    }
  }
}
```

### L.6 Block Structure

```erlang
#{
  <<"height">> => 1234567,
  <<"hash">> => BlockHash,
  <<"previous_block">> => PrevHash,
  <<"timestamp">> => 1699900000,
  <<"txs">> => [TxID1, TxID2, ...],
  <<"reward_addr">> => MinerAddress
}
```

---

## Appendix M: Push and Relay System

### M.1 Push Device

Sends messages to remote processes:

```erlang
push(Message, Target, Opts) ->
    #{
        <<"device">> => <<"push@1.0">>,
        <<"target">> => Target,         % Process ID or address
        <<"message">> => Message,
        <<"await">> => true,            % Wait for result
        <<"timeout">> => 30000
    }.
```

### M.2 Relay Device

Cross-node message forwarding:

```erlang
#{
  <<"device">> => <<"relay@1.0">>,
  <<"routes">> => [
    #{
      <<"pattern">> => <<"process-*">>,
      <<"target">> => <<"http://node2:10000">>
    }
  ]
}
```

### M.3 Message Routing

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│ Client  │───>│ Node 1  │───>│ Node 2  │───>│ Process │
└─────────┘    └─────────┘    └─────────┘    └─────────┘
                   │              │
                   │  Relay       │  Local
                   │  Protocol    │  Execution
```

### M.4 Push Message Format

```erlang
#{
  <<"type">> => <<"push">>,
  <<"id">> => MessageID,
  <<"target">> => ProcessID,
  <<"from">> => SenderAddress,
  <<"body">> => MessageContent,
  <<"timestamp">> => Timestamp,
  <<"signature">> => Signature
}
```

### M.5 Result Retrieval

```erlang
get_result(ProcessID, MessageID, Opts) ->
    Path = <<ProcessID/binary, "/results/", MessageID/binary>>,
    converge(Path, Opts).
```

---

## Appendix N: Multipass Execution

### N.1 Execution Passes

The multipass device executes in stages:

```
┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌──────────┐
│  Init   │───>│   Pre   │───>│ Execute │───>│  Post   │───>│ Finalize │
└─────────┘    └─────────┘    └─────────┘    └─────────┘    └──────────┘
```

### N.2 Pass Responsibilities

| Pass | Purpose |
|------|---------|
| `init` | Load state, validate input |
| `pre` | Transform input, set up context |
| `execute` | Core computation |
| `post` | Transform output, cleanup |
| `finalize` | Persist state, sign results |

### N.3 Implementation

```erlang
multipass(Message, Request, Opts) ->
    Passes = [init, pre, execute, post, finalize],
    lists:foldl(
        fun(Pass, {State, Msg}) ->
            Result = execute_pass(Pass, State, Msg, Opts),
            update_state(State, Result)
        end,
        {initial_state(), Message},
        Passes
    ).
```

### N.4 Pass Hooks

Devices can register hooks for each pass:

```erlang
#{
  <<"hooks">> => #{
    <<"pre">> => [validate_input, normalize_keys],
    <<"post">> => [sign_output, add_timestamp]
  }
}
```

---

## Appendix O: Event and Logging System

### O.1 Event Structure

```erlang
event(Tag, Data) ->
    event(Tag, Data, #{}).

event(Tag, Data, Opts) ->
    Timestamp = erlang:system_time(millisecond),
    Event = #{
        <<"tag">> => Tag,
        <<"data">> => Data,
        <<"timestamp">> => Timestamp,
        <<"module">> => calling_module(),
        <<"line">> => calling_line()
    },
    emit_event(Event, Opts).
```

### O.2 Event Tags

| Tag | Description |
|-----|-------------|
| `debug` | Development debugging |
| `info` | General information |
| `warning` | Potential issues |
| `error` | Errors |
| `trace` | Execution tracing |
| `perf` | Performance metrics |

### O.3 Tracing

Request tracing through the system:

```erlang
start_trace() ->
    TracePID = spawn(fun() -> trace_loop(#{steps => []}) end),
    TracePID.

record_step(TracePID, Step) ->
    TracePID ! {record_step, Step}.

get_trace(TracePID) ->
    TracePID ! {get_trace, self()},
    receive {trace, Trace} -> Trace end.
```

### O.4 Debug Output Format

```erlang
format_event(Event) ->
    io_lib:format(
        "[~s] ~s:~p ~p: ~p",
        [
            format_timestamp(maps:get(<<"timestamp">>, Event)),
            maps:get(<<"module">>, Event),
            maps:get(<<"line">>, Event),
            maps:get(<<"tag">>, Event),
            maps:get(<<"data">>, Event)
        ]
    ).
```

---

## Appendix P: Process Lifecycle

### P.1 Process States

```
┌─────────┐
│ Created │
└────┬────┘
     │ spawn
     v
┌─────────┐
│ Running │<──────┐
└────┬────┘       │
     │            │ message
     │ idle       │
     v            │
┌─────────┐       │
│  Idle   │───────┘
└────┬────┘
     │ terminate
     v
┌─────────┐
│ Stopped │
└─────────┘
```

### P.2 Process Spawning

```erlang
spawn_process(Definition, Opts) ->
    ProcessID = generate_id(Definition),
    ProcessMsg = #{
        <<"device">> => <<"process@1.0">>,
        <<"type">> => <<"process">>,
        <<"id">> => ProcessID,
        <<"scheduler">> => get_scheduler(Opts),
        <<"module">> => maps:get(<<"module">>, Definition),
        <<"authority">> => maps:get(<<"authority">>, Definition, self_address()),
        <<"created-at">> => timestamp()
    },
    store_process(ProcessMsg, Opts),
    {ok, ProcessID}.
```

### P.3 State Evolution

```
State(0) ─────> State(1) ─────> State(2) ─────> ...
    │              │              │
    │ Msg(1)       │ Msg(2)       │ Msg(3)
    │              │              │
    v              v              v
 Assignment(1)  Assignment(2)  Assignment(3)
```

### P.4 Checkpoint Strategy

```erlang
#{
  <<"checkpoint-strategy">> => <<"every-n">>,
  <<"checkpoint-interval">> => 100,  % Every 100 slots
  <<"snapshot-format">> => <<"full">>
}
```

---

## Appendix Q: Payment Channels (P4)

### Q.1 Channel Structure

```erlang
#{
  <<"device">> => <<"p4@1.0">>,
  <<"type">> => <<"payment-channel">>,
  <<"id">> => ChannelID,
  <<"payer">> => PayerAddress,
  <<"payee">> => PayeeAddress,
  <<"balance">> => 1000000000,  % in winston
  <<"nonce">> => 0,
  <<"created-at">> => Timestamp
}
```

### Q.2 Payment Flow

```
┌───────┐    ┌─────────┐    ┌───────┐
│ Payer │───>│ Channel │───>│ Payee │
└───────┘    └─────────┘    └───────┘
     │            │              │
     │ deposit    │ payment      │ withdraw
     │            │              │
     v            v              v
  Balance++   Balance--      Settlement
```

### Q.3 Payment Message

```erlang
#{
  <<"type">> => <<"payment">>,
  <<"channel">> => ChannelID,
  <<"amount">> => 100000,
  <<"nonce">> => 1,
  <<"signature">> => PayerSignature
}
```

### Q.4 Settlement

```erlang
settle_channel(ChannelID, FinalState, Opts) ->
    Channel = get_channel(ChannelID),
    verify_signatures(FinalState, Channel),
    PayerRefund = maps:get(<<"balance">>, FinalState),
    PayeeAmount = initial_balance(Channel) - PayerRefund,
    transfer(maps:get(<<"payer">>, Channel), PayerRefund),
    transfer(maps:get(<<"payee">>, Channel), PayeeAmount).
```

### Q.5 FAFF (Free at First) Payment Model

FAFF allows new users to access services without upfront payment, with free requests gradually transitioning to paid:

```erlang
-record(faff_state, {
    underlying :: payment_device(),
    free_requests :: map(),       % Address -> Count
    free_limit :: integer()       % Default: 100
}).

%% Initialize FAFF device wrapping another payment device
init_faff(UnderlyingDevice, FreeLimit) ->
    #faff_state{
        underlying = UnderlyingDevice,
        free_requests = #{},
        free_limit = FreeLimit
    }.

%% Check if request is free
is_free_request(Address, State) ->
    Count = maps:get(Address, State#faff_state.free_requests, 0),
    Count < State#faff_state.free_limit.

%% Process payment with FAFF logic
faff_payment(Address, Amount, State) ->
    case is_free_request(Address, State) of
        true ->
            % Increment free request counter
            NewCount = maps:get(Address, State#faff_state.free_requests, 0) + 1,
            NewState = State#faff_state{
                free_requests = maps:put(Address, NewCount, State#faff_state.free_requests)
            },
            {ok, free, NewState};
        false ->
            % Delegate to underlying payment device
            case apply_payment(State#faff_state.underlying, Address, Amount) of
                {ok, Receipt} -> {ok, {paid, Receipt}, State};
                {error, Reason} -> {error, Reason, State}
            end
    end.
```

**FAFF Device Integration:**

```erlang
% P4 preprocessor with FAFF
preprocess_p4_faff(Request, Opts) ->
    Sender = maps:get(<<"owner">>, Request, undefined),
    case Sender of
        undefined ->
            {ok, Request};  % Anonymous, no payment
        _ ->
            Estimate = estimate_cost(Request, Opts),
            FAFFState = get_faff_state(Opts),
            case faff_payment(Sender, Estimate, FAFFState) of
                {ok, free, NewState} ->
                    put_faff_state(NewState, Opts),
                    {ok, Request};
                {ok, {paid, Receipt}, NewState} ->
                    put_faff_state(NewState, Opts),
                    {ok, Request#{<<"payment-receipt">> => Receipt}};
                {error, insufficient_funds, _} ->
                    {error, {402, <<"Payment required">>}}
            end
    end.
```

**Configuration:**

```erlang
#{
    <<"device">> => <<"p4@1.0">>,
    <<"faff-enabled">> => true,
    <<"faff-limit">> => 100,         % Free requests per address
    <<"faff-reset-period">> => 86400, % Reset daily (seconds)
    <<"underlying-payment">> => <<"ao-token">>
}
```

**Benefits of FAFF:**
- Reduces barrier to entry for new users
- Allows users to try services before committing
- Gradual transition from free to paid tier
- Customizable free limits per service

---

## Appendix R: Testing Framework

### R.1 Test Store

```erlang
test_store() ->
    TestDir = <<"test-cache-", (timestamp())/binary>>,
    #{
        <<"store-module">> => hb_store_fs,
        <<"name">> => TestDir,
        <<"cleanup">> => true
    }.
```

### R.2 Test Utilities

```erlang
%% Run test with isolated store
with_test_store(Fun) ->
    Store = test_store(),
    try
        hb_store:start(Store),
        Fun(Store)
    after
        hb_store:reset(Store)
    end.

%% Benchmark function
benchmark(Fun, Duration) ->
    EndTime = timestamp() + Duration,
    benchmark_loop(Fun, EndTime, 0).

benchmark_loop(Fun, EndTime, Count) ->
    case timestamp() < EndTime of
        true ->
            Fun(),
            benchmark_loop(Fun, EndTime, Count + 1);
        false ->
            Count
    end.
```

### R.3 Assertion Helpers

```erlang
assert_message_equal(Expected, Actual) ->
    Keys = maps:keys(Expected),
    lists:foreach(
        fun(Key) ->
            ExpectedVal = maps:get(Key, Expected),
            ActualVal = maps:get(Key, Actual, undefined),
            assert_equal(ExpectedVal, ActualVal, Key)
        end,
        Keys
    ).

assert_throws(Fun, ExpectedException) ->
    try
        Fun(),
        error({expected_exception, ExpectedException})
    catch
        error:ExpectedException -> ok;
        throw:ExpectedException -> ok
    end.
```

---

## Appendix S: Full API Reference

### S.1 Core Functions

```erlang
%% Message Operations
hb_message:id(Message) -> ID
hb_message:id(Message, signed | unsigned) -> ID
hb_message:sign(Message, Wallet) -> SignedMessage
hb_message:verify(Message) -> true | false
hb_message:get(Key, Message, Opts) -> Value
hb_message:set(Key, Value, Message, Opts) -> NewMessage
hb_message:keys(Message, Opts) -> [Key]
hb_message:serialize(Message) -> Binary
hb_message:deserialize(Binary) -> Message

%% Converge
hb_converge:resolve(Message, Path, Opts) -> Result
hb_converge:resolve(Message, Opts) -> Result

%% Store
hb_store:read(Key, Store) -> {ok, Value} | not_found
hb_store:write(Key, Value, Store) -> ok
hb_store:list(Prefix, Store) -> [Key]
hb_store:delete(Key, Store) -> ok
hb_store:start(Store) -> ok
hb_store:stop(Store) -> ok
hb_store:reset(Store) -> ok

%% Path
hb_path:parse(PathBinary) -> [Segment]
hb_path:to_binary(Segments) -> PathBinary
hb_path:matches(Path, Pattern) -> true | false

%% Options
hb_opts:get(Key, Opts) -> Value
hb_opts:get(Key, Default, Opts) -> Value
hb_opts:set(Key, Value, Opts) -> NewOpts
```

### S.2 Device Functions

```erlang
%% Generic device interface
Device:info() -> InfoMap
Device:info(Message) -> InfoMap
Device:uses() -> [DeviceName]

%% Message device
dev_message:id(Message, Request, Opts) -> ID
dev_message:get(Message, Request, Opts) -> Value
dev_message:set(Message, Request, Opts) -> NewMessage
dev_message:keys(Message, Request, Opts) -> [Key]
dev_message:serialize(Message, Request, Opts) -> Binary

%% Scheduler device
dev_scheduler:schedule(Message, Request, Opts) -> Assignment
dev_scheduler:slot(Message, Request, Opts) -> SlotNumber
dev_scheduler:info(Message, Request, Opts) -> SchedulerInfo

%% Process device
dev_process:spawn(Message, Request, Opts) -> ProcessID
dev_process:compute(Message, Request, Opts) -> Result
dev_process:state(Message, Request, Opts) -> State
dev_process:push(Message, Request, Opts) -> ok

%% WASM device
dev_wasm:init(Message, Request, Opts) -> Instance
dev_wasm:compute(Message, Request, Opts) -> Result
dev_wasm:snapshot(Message, Request, Opts) -> Snapshot
dev_wasm:restore(Message, Request, Opts) -> ok
```

### S.3 HTTP Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/{id}` | Get message by ID |
| GET | `/{id}/{path}` | Resolve path on message |
| POST | `/{id}` | Send message to ID |
| POST | `/` | Create new message |
| GET | `/~{device}/{function}` | Direct device call |
| GET | `/{process}/slot/{n}` | Get slot assignment |
| GET | `/{process}/state` | Get process state |
| POST | `/{process}/push` | Push message to process |

---

## Appendix T: Implementation Checklist

### T.1 Core Components

- [ ] Message parsing (TABM/ANS-104)
- [ ] Message serialization
- [ ] ID calculation (SHA-256)
- [ ] Signature verification (RSA-PSS, ED25519, ECDSA)
- [ ] Key normalization
- [ ] Path parsing
- [ ] Converge algorithm

### T.2 Devices

- [ ] Message device
- [ ] Router device
- [ ] Scheduler device
- [ ] Process device
- [ ] Cache device
- [ ] JSON device
- [ ] WASM device (requires WAMR or similar)

### T.3 Storage

- [ ] Store interface
- [ ] Filesystem store
- [ ] In-memory LRU store
- [ ] Remote/gateway store

### T.4 HTTP

- [ ] HTTP server
- [ ] Request parsing
- [ ] Response serialization
- [ ] Content negotiation
- [ ] Multipart handling

### T.5 Cryptography

- [ ] SHA-256
- [ ] Base64URL encoding
- [ ] RSA-PSS signing/verification
- [ ] ED25519 signing/verification
- [ ] Wallet management

---

*Document Version: 1.0*
*Generated from HyperBEAM source analysis*
