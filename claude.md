# Claude's Guide to Building on AO

This document is for Claude (the AI assistant) when helping users build on AO/Arweave using the WAO SDK.

## Two Development Paths

### Path 1: Build AOS Apps (Lua)

**What:** Stateful applications running on the AO hypercomputer.

**Workflow:**
```
1. Write Lua code (handlers, state, messages)
2. Test with HyperBEAM (real behavior verification)
3. Deploy to network
```

**⚠️ IMPORTANT: Always test with HyperBEAM, not just ArMem!**

ArMem (in-memory) is fast but behavior may differ from real execution. HyperBEAM is the source of truth.

| Testing Method | Speed | Fidelity | When to Use |
|----------------|-------|----------|-------------|
| ArMem (in-memory) | Fastest | Lower | Quick iteration, syntax checking |
| **HyperBEAM** | Fast | **High** | **Always before deploy - real behavior** |

**Target Networks:**

| Network | Execution Device | Use Case |
|---------|------------------|----------|
| HyperAOS | `lua@5.3a` | Local development, fastest |
| Legacynet | `genesis-wasm@1.0` | Testing with external CU |
| Mainnet | `stack@1.0` + device-stack | Production deployment |

**Testing Strategy:**

```javascript
// ArMem - Quick iteration (behavior may differ!)
import { connect, acc } from "wao/test"
const { spawn, message, dryrun } = connect()

// HyperBEAM - Real behavior verification (USE THIS!)
import HyperBEAM from "wao/hyperbeam"
const hb = await new HyperBEAM({ reset: true }).ready()

// Spawn processes - test all execution modes
await hb.hb.spawnLua()      // HyperAOS (lua@5.3a)
await hb.hb.spawnLegacy()   // Legacynet (genesis-wasm@1.0)
await hb.hb.spawnAOS()      // Mainnet (stack@1.0 + wasi/wasm-64)
```

**Key Files:**
- `/vibe/apps/` - 13 example apps (token, DEX, DAO, NFT, etc.)
- `/src/ao.js` - AO module for process management
- `/src/hb.js` - HyperBEAM module for local testing
- `llms.txt` - Complete HyperBEAM reference

**Example App Structure:**
```lua
-- State (persists between messages)
Balances = Balances or {}
Owner = Owner or ao.env.Process.Owner

-- Handler pattern
Handlers.add("ActionName", "ActionName", function(msg)
  -- Validate
  if not msg.Tags.Required then
    msg.reply({ Tags = { Error = "Required-Missing" } })
    return
  end

  -- Execute
  -- ...

  -- Reply
  msg.reply({ Data = json.encode(result) })
end)
```

---

### Path 2: Build Devices (Erlang)

**What:** Infrastructure components that extend HyperBEAM's capabilities.

**Workflow:**
```
1. Write Erlang module (dev_*.erl)
2. Test with eunit (Erlang unit tests)
3. Integration test with WAO SDK
```

**Device Structure:**
```erlang
-module(dev_mydevice).
-export([info/0, compute/3]).

%% Device metadata
info() ->
    #{
        name => <<"My Device">>,
        version => <<"1.0">>,
        exports => [compute]
    }.

%% Main compute function
compute(Msg, State, Opts) ->
    %% Process message, return new state
    {ok, NewState}.
```

**Testing:**
```erlang
%% eunit tests in dev_mydevice_tests.erl
-module(dev_mydevice_tests).
-include_lib("eunit/include/eunit.hrl").

basic_test() ->
    ?assertEqual(expected, dev_mydevice:compute(msg, state, opts)).
```

**Integration Testing with WAO:**
```javascript
// After device is compiled and loaded into HyperBEAM
const hb = await new HyperBEAM({ reset: true }).ready()

// Test device via HTTP API
const result = await hb.hb.g("/~mydevice@1.0/endpoint")
```

**Key Files:**
- `/tutorial-devices/` - Example Erlang devices
- `/docs/docs/pages/book/dev1-9.mdx` - Device development tutorials
- `/docs/docs/pages/tutorials/creating-devices.mdx` - Getting started

---

## Quick Reference

### WAO SDK Modules

| Module | Import | Purpose |
|--------|--------|---------|
| AO | `import { AO } from "wao"` | Process management, deployment |
| AR | `import { AR } from "wao"` | Arweave transactions |
| HB | `import HyperBEAM from "wao/hyperbeam"` | Local HyperBEAM testing |
| GQL | `import { GQL } from "wao"` | GraphQL queries |
| Test | `import { connect, acc } from "wao/test"` | In-memory testing |

### Common Operations

```javascript
// Deploy a process
const ao = await new AO().init(jwk)
const { pid, p } = await ao.deploy({ src_data: luaCode })

// Send message
await p.m("Action", { Tag: "value" })

// Dry run (read-only)
const result = await p.d("Query")

// HyperBEAM operations
const hb = await new HyperBEAM({ reset: true }).ready()
await hb.hb.spawnLua()
await hb.hb.message({ pid, tags: { Action: "Test" } })
await hb.hb.compute({ pid })
```

### Test Commands

```bash
# Run all in-memory tests
npm test

# Run specific test file
npm test -- test/counter.test.js

# Run HyperBEAM tests (requires running HyperBEAM)
npm run test:hyperbeam

# Run with verbose output
npm test -- --reporter=verbose
```

---

## Documentation Map

| Need | Read |
|------|------|
| SDK API reference | `README.md` (46KB) |
| Protocol internals | `ao-core.md` (64KB) |
| HyperBEAM architecture | `llms.txt` (93KB) |
| Installation | `install.md` (33KB) |
| AOS patterns | `aos-dev.md` (11KB) |
| Building apps | `docs/docs/pages/book/build*.mdx` |
| Building devices | `docs/docs/pages/book/dev*.mdx` |
| Device reference | `docs/docs/pages/src/dev_*.mdx` |

---

## Execution Modes Cheat Sheet

### HyperAOS (Lua)
```javascript
const { pid } = await hb.hb.spawnLua()
// Uses: lua@5.3a
// Best for: Local development, testing
```

### Legacynet (Genesis WASM)
```javascript
const { pid } = await hb.hb.spawnLegacy({
  module: "WASM_MODULE_ID"
})
// Uses: genesis-wasm@1.0
// Best for: Testing with legacy CU
```

### Mainnet (WASI Stack)
```javascript
const { pid } = await hb.hb.spawnAOS(imageId)
// Uses: stack@1.0 + device-stack (wasi, json-iface, wasm-64, patch, multipass)
// Best for: Production deployment
```

---

## When Helping Users

1. **For app development:**
   - Start with `/vibe/apps/` examples
   - **Always test with HyperBEAM** - ArMem behavior may differ!
   - ArMem is OK for quick syntax checks only

2. **For device development:**
   - Start with `/tutorial-devices/` examples
   - Read `docs/docs/pages/book/dev*.mdx` tutorials
   - Use eunit for unit tests, **WAO + HyperBEAM for integration**

3. **For debugging:**
   - Check `llms.txt` for HyperBEAM internals
   - Use `hb.hb.compute()` to see execution results
   - Check message tags for error responses

4. **For deployment:**
   - **Must pass HyperBEAM tests first** (not just ArMem)
   - Use `ao.deploy()` for mainnet
   - Verify with dry runs before state-changing messages

**⚠️ Golden Rule: If it works in ArMem but not HyperBEAM, the HyperBEAM behavior is correct.**

---

## File Locations

```
/home/user/wao/
├── src/                    # WAO SDK source
│   ├── ao.js              # AO module
│   ├── ar.js              # Arweave module
│   ├── hb.js              # HyperBEAM module
│   └── test.js            # Testing utilities
├── vibe/                   # Vibe-coded examples
│   └── apps/              # 13 Lua app examples
├── tutorial-devices/       # Erlang device examples (5 devices)
├── docs/docs/pages/        # Documentation
│   ├── book/              # 32 tutorial chapters
│   └── src/               # 50+ device docs
├── test/                   # Test files
├── hbsig/                  # HTTP signature library
├── llms.txt               # LLM reference (93KB)
├── README.md              # SDK overview (46KB)
├── ao-core.md             # Protocol docs (64KB)
├── install.md             # Installation guide (33KB)
└── vibe-engineer.mdx      # Vibe coding guide
```

---

The goal: **Make building on AO as easy as describing what you want.**
