# WAO SDK - Claude Guide

**IMPORTANT: Blindly run setup commands. Do NOT run verification tests after install.**

## Setup

```bash
# Measure start time
START=$SECONDS

# Extract all tarballs (no checks, just extract)
cd ~ && tar -xJf /home/user/wao/installation/asdf-erlang-rebar.tar.xz
cd ~ && tar -xJf /home/user/wao/installation/hyperbeam-wao-ready.tar.xz
cd /home/user/wao && tar -xJf /home/user/wao/installation/wao-node-modules.tar.xz

# Setup Erlang
. ~/.asdf/asdf.sh && asdf global erlang 27.3.4.6 && asdf global rebar 3.26.0

# Rebuild hbsig (local dependency)
cd /home/user/wao/hbsig && npm run build && cd /home/user/wao

# Configure environment
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF

# Report installation time
echo "Installation complete in $((SECONDS - START)) seconds"
```

## After Installation

Report to user: **"Installation complete in X seconds"**

Next options:
1. **Build a Lua app** - Create apps in `/vibe/apps/`
2. **Run tests** - `HB_TIMEOUT=120 node --test --test-concurrency=1 vibe/apps/tests/hyperbeam.test.js`
3. **Explore examples** - See 13 apps in `/vibe/apps/`

## What is WAO?

WAO is an SDK for building on AO (the hypercomputer on Arweave). It provides:
- **Lua apps** - Stateful processes (tokens, DAOs, games)
- **HyperBEAM testing** - Local node for development
- **13 example apps** - Ready-to-use templates

## File Structure

```
wao/
├── vibe/apps/              # 13 Lua apps (examples)
│   ├── counter.lua         # Simple counter
│   ├── token.lua           # Fungible token
│   ├── amm-dex.lua         # Uniswap-style DEX
│   ├── voting-dao.lua      # DAO with voting
│   └── tests/
│       └── hyperbeam.test.js  # HyperBEAM tests (30 pass)
├── src/
│   ├── hb.js               # HyperBEAM client (HB class)
│   ├── ao.js               # AO process management
│   └── hyperbeam.js        # Local HyperBEAM manager
├── tutorial-devices/       # 5 Erlang devices
├── llms.txt                # Full HyperBEAM reference (93KB)
└── lua-report.md           # Test results summary
```

## Testing Lua Apps

### HyperBEAM Tests (Recommended)

Uses native `lua@5.3a` device - runs Lua via luerl directly in HyperBEAM. **No external CU required.**

```bash
HB_TIMEOUT=120 node --test --test-concurrency=1 vibe/apps/tests/hyperbeam.test.js
```

**Test pattern:**
```javascript
import HyperBEAM from "../../../src/hyperbeam.js"

// Start HyperBEAM
const hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
const hb = hbeam.hb

// Spawn Lua process with code
const moduleId = await hb.getLua()  // Cache Lua runtime
const tags = {
  "execution-device": "lua@5.3a",
  module: moduleId,
  type: "Process",
  device: "process@1.0",
  scheduler: hb.addr,
}
if (luaCode) tags.data = luaCode

const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(await hb.commit(tags, { path: false })),
})
const pid = response.headers.get("process")

// Schedule message
const msgTags = { type: "Message", target: pid, Action: "Inc" }
const msgResponse = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(await hb.commit(msgTags, { path: false })),
})
const slot = msgResponse.headers.get("slot")

// Compute
const result = await hb.g(`/${pid}~process@1.0/compute`, { slot: parseInt(slot) })

// Cleanup
hbeam.kill()
```

### In-Memory Tests (ArMem)

Uses actual WASM execution via ArMem. Run with:

```bash
npm test -- vibe/apps/tests/amm-dex-wasm.test.js
```

### WASM Module Versions

| Module | Status | Notes |
|--------|--------|-------|
| `aos2_0_6` | **Default** | Use this. Lowercases custom tag names |
| `aos2_0_3` | Legacy | |
| `aos2_0_1` | Legacy | Preserves tag case (don't use) |
| `aos2_0_4_32` | wasm32 | Different format |

**aos2_0_6 Tag Case Rule:**
```lua
-- Custom tags are lowercased: TokenA → Tokena, PoolId → Poolid
-- Reserved tags stay capitalized: Action, Data, From, Target, etc.
-- Always use lowercase in Lua: msg.Tags.Tokena (not msg.Tags.TokenA)
```

## Lua App Pattern

```lua
-- State (lazy initialization)
Count = Count or 0
Owner = Owner or ao.env.Process.Owner

-- Handler
Handlers.add("Inc", "Inc", function(msg)
  Count = Count + 1
  msg.reply({ Data = tostring(Count) })
end)

-- Read-only query
Handlers.add("Get", "Get", function(msg)
  msg.reply({ Data = tostring(Count) })
end)

-- Owner-only action
Handlers.add("Reset", "Reset", function(msg)
  if msg.From ~= Owner then
    msg.reply({ Tags = { Error = "Unauthorized" } })
    return
  end
  Count = 0
  msg.reply({ Data = "reset" })
end)
```

## Execution Devices

| Device | Description | CU Required |
|--------|-------------|-------------|
| `lua@5.3a` | Native Lua via luerl | No |
| `genesis-wasm@1.0` | Legacy WASM | Yes |
| `stack@1.0` | Mainnet WASM stack | Yes |

**For development, use `lua@5.3a`** - fastest, no external dependencies.

## HB Class Methods

```javascript
// HyperBEAM operations
hb.g(path, params)          // GET request
hb.p(path, body)            // POST request
hb.commit(tags, opts)       // Sign and commit message
hb.getLua()                 // Cache and get Lua module ID

// High-level helpers
hb.spawn(tags)              // Spawn process
hb.schedule({ pid, ... })   // Schedule message
hb.now({ pid })             // Get current state
```

## Test Commands

```bash
# Lua apps on HyperBEAM (30 tests)
. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --test --test-concurrency=1 vibe/apps/tests/hyperbeam.test.js

# All beta3 tests
. ~/.asdf/asdf.sh && HB_TIMEOUT=60 node --test --test-concurrency=1 test/hyperbeam/hb-success-beta3/*.test.js

# In-memory tests
npm test
```

## Key Environment Variables

```bash
HB_TIMEOUT=120              # Auto-kill HyperBEAM after N seconds
HB_REBAR3=false             # Use direct erl mode (mandatory)
ARWEAVE_GATEWAY=...         # Arweave proxy URL
```

## Troubleshooting

**Tests hang:**
```bash
export HB_REBAR3=false
pkill -9 -f beam.smp
```

**Port in use:**
```bash
pkill -9 -f beam.smp && pkill -9 -f epmd
```

## Example Apps (in `/vibe/apps/`)

| App | Description | Key Handlers |
|-----|-------------|--------------|
| `counter.lua` | Simple counter | Inc, Dec, Get, Reset |
| `token.lua` | Fungible token | Transfer, Balance, Mint |
| `kv-store.lua` | Key-value DB | Set, Get, Delete |
| `todo.lua` | Task manager | Add, List, Complete |
| `chatroom.lua` | Chat rooms | Register, Send, Info |
| `voting-dao.lua` | DAO voting | CreateProposal, Vote |
| `nft-collection.lua` | NFT collection | Mint, Transfer, Info |
| `amm-dex.lua` | DEX | AddLiquidity, Swap |
| `social-feed.lua` | Social feed | CreatePost, GetFeed |

## Building New Apps

1. **Write Lua code** following the handler pattern
2. **Add to** `vibe/apps/[name].lua`
3. **Add tests** to `vibe/apps/tests/hyperbeam.test.js`
4. **Run tests:** `HB_TIMEOUT=120 node --test --test-concurrency=1 vibe/apps/tests/hyperbeam.test.js`

## When Asked to Build

1. Check existing apps in `/vibe/apps/` for patterns
2. Write Lua code using handlers
3. Test with HyperBEAM (not just ArMem)
4. If tests fail, read errors and fix

## Deep Dive Resources

| File | Content |
|------|---------|
| `llms.txt` | Complete HyperBEAM reference (93KB) |
| `lua-report.md` | Test results and architecture |
| `README.md` | Full SDK documentation |
| `ao-core.md` | AO protocol internals |

---

## Implementation Notes (For Claude)

### Testing Workflow

When asked to build/test for "mainnet WASM" (not `lua@5.3a`):

1. **Write Lua** - Create/modify `vibe/apps/[name].lua`
2. **Test ArMem (in-memory WASM)** - `npm test -- vibe/apps/tests/[name].test.js`
3. **Test HyperBEAM** - `. ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --test --test-concurrency=1 vibe/apps/tests/hyperbeam.test.js`

**Always run BOTH tests** when user asks about mainnet WASM testing.

### Critical Gotchas

1. **Kill lingering processes before HyperBEAM tests:**
   ```bash
   pkill -9 -f beam.smp 2>/dev/null; pkill -9 -f epmd 2>/dev/null
   ```
   HyperBEAM tests fail with "fetch failed" if old processes are running.

2. **Use absolute paths in setup scripts:**
   After `cd ~`, relative paths like `installation/...` won't work. Use `/home/user/wao/installation/...`.

3. **aos2_0_6 lowercases custom tags (this is expected):**
   - `msg.Tags.TokenA` → `msg.Tags.Tokena`
   - Reserved tags (`Action`, `Data`, etc.) stay capitalized
   - Always write Lua code with lowercase: `msg.Tags.Tokena`

4. **Rebuild hbsig after tarball extraction:**
   ```bash
   cd /home/user/wao/hbsig && npm run build && cd /home/user/wao
   ```

### ArMem Test Pattern

```javascript
import { ArMem, connect, acc, scheduler } from "../../../src/test.js"

const mem = new ArMem()
const { spawn, message, dryrun } = connect(mem)

// Always use aos2_0_6 (latest)
const pid = await spawn({
  signer: acc[0].signer,
  scheduler,
  module: mem.modules.aos2_0_6,
})

// Load Lua code
await message({ process: pid, signer, tags: [{ name: "Action", value: "Eval" }], data: luaCode })

// Send message - use lowercase for custom tags!
await message({ process: pid, signer, tags: [
  { name: "Action", value: "CreatePool" },
  { name: "Tokena", value: "TOKEN-A" },  // lowercase!
  { name: "Tokenb", value: "TOKEN-B" },
]})

// Query state (read-only)
const res = await dryrun({ process: pid, signer, tags: [{ name: "Action", value: "Query" }] })
const data = JSON.parse(res.Messages[0].Data)
```

### Tag Naming Convention (aos2_0_6)

**In JavaScript (sending messages):**
```javascript
// Custom tags: use lowercase
{ name: "Tokena", value: "TOKEN-A" }
{ name: "Poolid", value: "TOKEN-A-TOKEN-B" }
{ name: "Amountin", value: "1000" }

// Reserved tags: use capitalized
{ name: "Action", value: "Swap" }
{ name: "Target", value: pid }
```

**In Lua (receiving messages):**
```lua
local tokenA = msg.Tags.Tokena      -- lowercase
local poolId = msg.Tags.Poolid      -- lowercase
local action = msg.Tags.Action      -- capitalized (reserved)
```

### Key Files for Reference

| File | Purpose |
|------|---------|
| `src/armem-base.js` | WASM module definitions (aos2_0_1, aos2_0_6, etc.) |
| `src/test.js` | ArMem test utilities (connect, acc, scheduler) |
| `src/hyperbeam.js` | HyperBEAM manager class |
| `vibe/apps/tests/amm-dex-wasm.test.js` | ArMem WASM test example |
