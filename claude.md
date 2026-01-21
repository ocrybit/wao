# WAO SDK - Claude Guide

**Run the setup steps below, then verify with tests.**

## Setup

```bash
# 1. Source asdf if exists
[ -f ~/.asdf/asdf.sh ] && . ~/.asdf/asdf.sh

# 2. Check/install dependencies
npm install
[ -d hbsig/dist ] || (cd hbsig && npm install && npm run build && cd ..)
npm install

# 3. Check Erlang (skip if erl command works)
if ! command -v erl &> /dev/null; then
  [ -d ~/.asdf ] || git clone https://github.com/asdf-vm/asdf.git ~/.asdf --branch v0.14.0
  . ~/.asdf/asdf.sh
  asdf plugin list | grep -q erlang || asdf plugin add erlang
  asdf plugin list | grep -q rebar || asdf plugin add rebar https://github.com/Stratus3D/asdf-rebar.git
  asdf list erlang 2>/dev/null | grep -q 27.3.4.6 || asdf install erlang 27.3.4.6
  asdf global erlang 27.3.4.6
  asdf list rebar 2>/dev/null | grep -q 3.26.0 || asdf install rebar 3.26.0
  asdf global rebar 3.26.0
fi

# 4. Check HyperBEAM (skip if exists)
if [ ! -d ~/HyperBEAM ]; then
  git clone --depth 1 --branch v0.9-milestone-3-beta-3 https://github.com/permaweb/HyperBEAM.git ~/HyperBEAM
  cd ~/HyperBEAM && rebar3 compile && cd -
fi

# 5. Configure environment
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF

# 6. Verify (30 tests should pass)
HB_TIMEOUT=120 node --test --test-concurrency=1 vibe/apps/tests/hyperbeam.test.js
```

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

Fast but behavior may differ from real execution.

```bash
npm test -- vibe/apps/tests/armem.test.js
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
HB_TIMEOUT=120 node --test --test-concurrency=1 vibe/apps/tests/hyperbeam.test.js

# All beta3 tests
HB_TIMEOUT=60 node --test --test-concurrency=1 test/hyperbeam/hb-success-beta3/*.test.js

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
