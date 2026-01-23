# AOS Counter App

A simple counter application demonstrating AOS (AO Operating System) development using the WAO SDK.

## Files

- `counter.lua` - The Lua script that implements the counter handlers
- `counter.test.js` - In-memory tests using WAO SDK (no HyperBEAM required)
- `counter.hyperbeam.test.js` - HyperBEAM integration tests

## Counter App Handlers

| Action | Description | Tags |
|--------|-------------|------|
| `Get` | Returns current count | - |
| `Inc` | Increment count by 1 | - |
| `Dec` | Decrement count by 1 | - |
| `Add` | Add custom amount | `Amount` |
| `Reset` | Reset count to 0 | - |
| `Info` | Get app information | - |

## Running Tests

### In-Memory Tests (No HyperBEAM)

Tests the Lua script using WAO SDK's in-memory AO execution:

```bash
HB_TIMEOUT=60 node --experimental-wasm-memory64 --test --test-concurrency=1 aos-app/counter.test.js
```

Expected output: 7 passing tests

### HyperBEAM Tests

Tests process spawning and messaging on HyperBEAM:

```bash
HB_TIMEOUT=120 node --experimental-wasm-memory64 --test --test-concurrency=1 aos-app/counter.hyperbeam.test.js
```

Expected output: 9 passing tests

## Usage Example

### In-Memory (Development)

```javascript
import { AO, connect, acc, scheduler } from "../src/test.js"
import ArMem from "../src/armem.js"

const mem = new ArMem()
const { spawn, message, dryrun } = connect(mem)
const [{ signer }] = acc

// Spawn process
const pid = await spawn({
  signer,
  scheduler,
  module: mem.modules.aos2_0_1,
})

// Load counter script
await message({
  process: pid,
  signer,
  tags: [{ name: "Action", value: "Eval" }],
  data: counterScript,
})

// Send messages
await message({
  process: pid,
  signer,
  tags: [{ name: "Action", value: "Inc" }],
  data: "",
})

// Query state
const result = await dryrun({
  process: pid,
  tags: [{ name: "Action", value: "Get" }],
  data: "",
})

console.log(result.Messages[0].Data) // "1"
```

### HyperBEAM (Production)

```javascript
import HyperBEAM from "../src/hyperbeam.js"

const hbeam = await new HyperBEAM({ reset: true, timeout: 60 }).ready()
const hb = hbeam.hb

// Spawn process
const { pid } = await hb.spawn({
  type: "Process",
  device: "process@1.0",
  scheduler: hb.addr,
  "execution-device": "test-device@1.0",
})

// Schedule messages
await hb.schedule({ pid, tags: { action: "Get" } })

// Compute results
const result = await hb.g(`/${pid}~process@1.0/compute`, { slot: 1 })
```

## Architecture

```
┌─────────────────────────────────────────────┐
│              counter.lua                     │
│  ┌─────────────────────────────────────┐    │
│  │ Handlers:                            │    │
│  │  - Get: Return count                 │    │
│  │  - Inc: count = count + 1            │    │
│  │  - Dec: count = count - 1            │    │
│  │  - Add: count = count + Amount       │    │
│  │  - Reset: count = 0                  │    │
│  │  - Info: Return app metadata         │    │
│  └─────────────────────────────────────┘    │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│           WAO SDK (in-memory)                │
│  - ArMem: In-memory Arweave                 │
│  - aoconnect: Message routing               │
│  - WASM: aos2_0_1 module                    │
└─────────────────────────────────────────────┘
                    │
                    ▼
┌─────────────────────────────────────────────┐
│              HyperBEAM                       │
│  - process@1.0: Process lifecycle           │
│  - scheduler@1.0: Message scheduling        │
│  - test-device@1.0: Basic execution         │
│  - genesis-wasm@1.0: Full AOS execution     │
└─────────────────────────────────────────────┘
```

## Full AOS Execution on HyperBEAM

For full Lua execution on HyperBEAM (not just scheduling), you need:

1. **genesis-wasm execution device**: Requires CU server
   ```javascript
   new HyperBEAM({ genesis_wasm: true })
   ```

2. **stack@1.0 with wasm-64**: Requires cached WASM image
   ```javascript
   await hb.spawnAOS()
   ```

The in-memory tests (`counter.test.js`) provide full Lua execution for development. Use HyperBEAM for production deployments with proper execution devices configured.
