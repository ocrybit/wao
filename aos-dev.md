# AOS Development Guide

This guide describes the recommended development workflow for building AOS (AO Operating System) applications using the WAO SDK.

## Development Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    AOS Development Flow                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. WRITE          2. TEST IN-MEMORY       3. DEPLOY           │
│   ─────────         ─────────────────       ──────────          │
│   Lua Module   ───► WAO SDK Tests     ───►  HyperBEAM           │
│   (counter.lua)     (fast iteration)        (production)        │
│                                                                  │
│   • Handlers        • Full Lua execution    • Process spawn     │
│   • State           • No dependencies       • Message routing   │
│   • Logic           • ~14 seconds           • Persistence       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Why This Flow?

| Phase | Speed | Dependencies | Use Case |
|-------|-------|--------------|----------|
| In-Memory | ~14s for 7 tests | None | Development, iteration |
| HyperBEAM | ~25s for 9 tests | HyperBEAM node | Production validation |

**In-memory testing** provides full Lua execution without starting HyperBEAM, making development iteration fast.

## Step 1: Write Your Lua Module

Create your AOS Lua script with handlers:

```lua
-- myapp.lua
local state = {}

-- Initialize state
Handlers.add("Init", "Init", function(msg)
  state.owner = msg.From
  state.count = 0
  msg.reply({ Data = "Initialized" })
end)

-- Query state
Handlers.add("Get", "Get", function(msg)
  msg.reply({
    Data = tostring(state.count),
    Owner = state.owner or "none"
  })
end)

-- Modify state
Handlers.add("Set", "Set", function(msg)
  local value = tonumber(msg.Value) or tonumber(msg.Tags.Value) or 0
  state.count = value
  msg.reply({ Data = tostring(state.count) })
end)
```

### Handler Pattern

```lua
Handlers.add("ActionName", "ActionName", function(msg)
  -- msg.From     - Sender address
  -- msg.Data     - Message data
  -- msg.Tags     - Message tags (msg.Tags.Key or msg.Key)
  -- msg.Target   - Target process
  -- msg.reply()  - Send response
end)
```

## Step 2: Test In-Memory with WAO SDK

Create a test file that runs your Lua code in-memory:

```javascript
// myapp.test.js
import assert from "assert"
import { describe, it, before } from "node:test"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { AO, connect, acc, scheduler } from "../src/test.js"
import ArMem from "../src/armem.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const myAppScript = readFileSync(resolve(__dirname, "myapp.lua"), "utf8")
const [{ signer, jwk }] = acc

describe("My App (In-Memory)", function() {
  let mem, ao, pid

  before(async () => {
    // Create in-memory AO environment
    mem = new ArMem()
    const { spawn, message, dryrun } = connect(mem)

    // Spawn a process with AOS module
    pid = await spawn({
      signer,
      scheduler,
      module: mem.modules.aos2_0_1,
    })

    // Load your Lua script
    await message({
      process: pid,
      signer,
      tags: [{ name: "Action", value: "Eval" }],
      data: myAppScript,
    })

    ao = { mem, spawn, message, dryrun, pid }
  })

  it("should initialize", async () => {
    await ao.message({
      process: ao.pid,
      signer,
      tags: [{ name: "Action", value: "Init" }],
      data: "",
    })

    const result = await ao.dryrun({
      process: ao.pid,
      tags: [{ name: "Action", value: "Get" }],
      data: "",
    })

    assert.equal(result.Messages[0].Data, "0")
  })

  it("should set value", async () => {
    await ao.message({
      process: ao.pid,
      signer,
      tags: [
        { name: "Action", value: "Set" },
        { name: "Value", value: "42" },
      ],
      data: "",
    })

    const result = await ao.dryrun({
      process: ao.pid,
      tags: [{ name: "Action", value: "Get" }],
      data: "",
    })

    assert.equal(result.Messages[0].Data, "42")
  })
})
```

### Run In-Memory Tests

```bash
HB_TIMEOUT=60 node --experimental-wasm-memory64 --test --test-concurrency=1 myapp.test.js
```

### Key APIs

| API | Description |
|-----|-------------|
| `spawn({ signer, scheduler, module })` | Create a new process |
| `message({ process, signer, tags, data })` | Send a message (modifies state) |
| `dryrun({ process, tags, data })` | Query state (read-only) |

### Available Modules

```javascript
mem.modules.aos2_0_1  // AOS 2.0.1 (recommended)
mem.modules.aos2_0_3  // AOS 2.0.3
mem.modules.aos2_0_4_32  // AOS 2.0.4 (32-bit)
```

## Step 3: Deploy to HyperBEAM

Once your in-memory tests pass, validate on HyperBEAM:

```javascript
// myapp.hyperbeam.test.js
import assert from "assert"
import { describe, it, before, after } from "node:test"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import HyperBEAM from "../src/hyperbeam.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const myAppScript = readFileSync(resolve(__dirname, "myapp.lua"), "utf8")

describe("My App (HyperBEAM)", function() {
  let hbeam, hb, pid

  before(async () => {
    // Start HyperBEAM
    hbeam = await new HyperBEAM({
      reset: true,
      timeout: 120,
    }).ready()

    hb = hbeam.hb

    // Spawn process using commit + POST pattern
    const tags = {
      type: "Process",
      device: "process@1.0",
      scheduler: hb.addr,
      "execution-device": "test-device@1.0",
      "random-seed": `seed-${Date.now()}`,
    }

    const committed = await hb.commit(tags, { path: false })
    const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(committed),
    })

    pid = response.headers.get("process")
  })

  after(async () => {
    if (hbeam) hbeam.kill()
  })

  it("should spawn process", async () => {
    assert.ok(pid, "Process ID should exist")
  })

  it("should schedule messages", async () => {
    const tags = { type: "Message", target: pid, action: "Get" }
    const committed = await hb.commit(tags, { path: false })

    const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(committed),
    })

    assert.equal(response.status, 200)
  })
})
```

### Run HyperBEAM Tests

```bash
HB_TIMEOUT=120 node --experimental-wasm-memory64 --test --test-concurrency=1 myapp.hyperbeam.test.js
```

## Project Structure

```
my-aos-app/
├── myapp.lua                    # Lua module
├── myapp.test.js                # In-memory tests (development)
├── myapp.hyperbeam.test.js      # HyperBEAM tests (production)
└── README.md                    # Documentation
```

## Example: Counter App

See `aos-app/` for a complete example:

```bash
# In-memory tests (7 tests, ~14s)
HB_TIMEOUT=60 node --experimental-wasm-memory64 --test --test-concurrency=1 aos-app/counter.test.js

# HyperBEAM tests (9 tests, ~25s)
HB_TIMEOUT=120 node --experimental-wasm-memory64 --test --test-concurrency=1 aos-app/counter.hyperbeam.test.js
```

## Common Patterns

### Reading Tags in Lua

```lua
-- Access tag values (both styles work)
local value = msg.Value or msg.Tags.Value
local action = msg.Action or msg.Tags.Action
```

### Replying with Tags

```lua
msg.reply({
  Data = "Response data",
  Status = "success",
  Count = tostring(count)
})
```

### Sending Messages to Other Processes

```lua
Send({
  Target = other_process_id,
  Action = "Notify",
  Data = "Hello"
})
```

### Using Spawn

```lua
Spawn(module_id, {
  Data = initial_data,
  ["On-Boot"] = "Data"
})
```

## Debugging Tips

### Print Debug Output (In-Memory)

```lua
Handlers.add("Debug", "Debug", function(msg)
  print("State:", state.count)  -- Shows in test output
  msg.reply({ Data = "debug" })
end)
```

### Check Message Structure

```javascript
const result = await ao.dryrun({
  process: ao.pid,
  tags: [{ name: "Action", value: "Get" }],
  data: "",
})

console.log("Messages:", result.Messages)
console.log("Output:", result.Output)
console.log("Spawns:", result.Spawns)
```

### Test Assertions

```javascript
// Check message data
assert.equal(result.Messages[0].Data, "expected")

// Check tags
const tags = result.Messages[0].Tags
const statusTag = tags.find(t => t.name === "Status")
assert.equal(statusTag.value, "success")
```

## Full Lua Execution on HyperBEAM

For full Lua execution (not just scheduling), you need:

1. **genesis-wasm execution device**:
   ```javascript
   new HyperBEAM({ genesis_wasm: true })
   ```
   Requires CU server running.

2. **stack@1.0 with wasm-64**:
   Requires cached WASM images.

For development, **in-memory tests provide full Lua execution** and are recommended for fast iteration.

## Quick Reference

### Test Commands

```bash
# In-memory (development)
HB_TIMEOUT=60 node --experimental-wasm-memory64 --test --test-concurrency=1 myapp.test.js

# HyperBEAM (production)
HB_TIMEOUT=120 node --experimental-wasm-memory64 --test --test-concurrency=1 myapp.hyperbeam.test.js
```

### Key Imports

```javascript
// In-memory testing
import { AO, connect, acc, scheduler } from "../src/test.js"
import ArMem from "../src/armem.js"

// HyperBEAM testing
import HyperBEAM from "../src/hyperbeam.js"
```

### Message vs Dryrun

| Method | Modifies State | Use Case |
|--------|---------------|----------|
| `message()` | Yes | Write operations (Inc, Set, etc.) |
| `dryrun()` | No | Read operations (Get, Info, etc.) |
