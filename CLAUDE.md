# WAO SDK - Claude Guide

## Step 1: Setup

**IMPORTANT: Run this command block exactly as-is. ASSUME SUCCESS and proceed to Step 2.**

```bash
START=$SECONDS

# Extract tarballs
cd ~ && tar -xJf /home/user/wao/claude/installation/asdf-erlang-rebar.tar.xz
cd ~ && tar -xJf /home/user/wao/claude/installation/hyperbeam-wao-ready.tar.xz
cd /home/user/wao && tar -xJf /home/user/wao/claude/installation/wao-node-modules.tar.xz

# Setup Erlang
. ~/.asdf/asdf.sh && asdf global erlang 27.3.4.6 && asdf global rebar 3.26.0

# Install dependencies (tarballs may be incomplete)
cd /home/user/wao && npm install

# Build and link hbsig properly
cd /home/user/wao/hbsig && npm install && npm run build
rm -f /home/user/wao/node_modules/hbsig
ln -s ../hbsig/dist /home/user/wao/node_modules/hbsig

# Register dev_dex device for Erlang tests
cp /home/user/wao/claude/devices/dev_dex.erl ~/HyperBEAM/src/
grep -q 'dev_dex' ~/HyperBEAM/src/hb_opts.erl || \
  sed -i 's/#{<<"name">> => <<"whois@1.0">>, <<"module">> => dev_whois}/#{<<"name">> => <<"whois@1.0">>, <<"module">> => dev_whois},\n            #{<<"name">> => <<"dex@1.0">>, <<"module">> => dev_dex}/' ~/HyperBEAM/src/hb_opts.erl
cd ~/HyperBEAM && rebar3 compile

# Configure environment
cd /home/user/wao
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF

echo "Installation complete in $((SECONDS - START)) seconds"
```

## Step 2: Ask User

**IMMEDIATELY after running Step 1 (do NOT verify anything), report:**

"Environment ready in X seconds. What would you like to build?"

(Replace X with the actual seconds from the setup output)

1. **Lua app** - Stateful process (token, DAO, game)
2. **Erlang device** - HyperBEAM infrastructure
3. **Run existing tests** - Verify setup works
4. **Explore examples** - See 13 apps in `claude/apps/`

---

## Quick Reference

| Task | Command |
|------|---------|
| **HyperBEAM tests** | `HB_TIMEOUT=120 node --test --test-concurrency=1 claude/apps/tests/hyperbeam.test.js` |
| **ArMem tests** | `npm test -- claude/apps/tests/amm-dex-wasm.test.js` |
| **Kill stuck processes** | `pkill -9 -f beam.smp; pkill -9 -f epmd` |
| **Erlang device tests** | `HB_TIMEOUT=120 node --test --test-concurrency=1 claude/apps/tests/dev-dex.test.js` |

---

## File Structure

```
wao/
├── claude/
│   ├── SKILL.md                # Vibe coding skill
│   ├── apps/                   # Lua apps + frontends
│   │   ├── SKILL.md            # Lua development skill
│   │   ├── counter.lua         # Simple counter
│   │   ├── token.lua           # Fungible token
│   │   ├── amm-dex.lua         # DEX (Lua)
│   │   ├── amm-dex-ui/         # Lua DEX frontend
│   │   ├── erlang-dex-ui/      # Erlang DEX frontend
│   │   └── tests/
│   │       ├── hyperbeam.test.js   # Lua tests (30 pass)
│   │       └── dev-dex.test.js     # Erlang tests (14 pass)
│   ├── devices/                # Erlang devices
│   │   ├── SKILL.md            # Erlang development skill
│   │   ├── dev_dex.erl         # AMM DEX device
│   │   └── dev_kv.erl          # Key-value store
│   ├── docs/                   # Reference documentation
│   │   ├── llms.txt            # HyperBEAM internals (READ FOR DEVICES)
│   │   ├── ao-core.md          # Protocol specification
│   │   └── aos-dev.md          # Development guide (4 tracks)
│   └── installation/           # Setup tarballs
└── src/
    ├── hb.js                   # HB class (HyperBEAM client)
    ├── hyperbeam.js            # HyperBEAM node manager
    ├── ao.js                   # AO process client
    ├── test.js                 # ArMem utilities
    └── server.js               # WAO Server
```

---

## Deep Dive Resources

| File | When to Read |
|------|--------------|
| **`claude/docs/llms.txt`** | **MANDATORY for Erlang devices** - TABM format, device callbacks, key resolution |
| `claude/docs/ao-core.md` | Protocol work - TypeScript types, cryptographic operations |
| `claude/docs/aos-dev.md` | Development workflows - 4 tracks with execution devices |

---

## Part 1: Lua Apps

### Lua Handler Pattern

```lua
-- State
Count = Count or 0
Balances = Balances or {}
Owner = Owner or ao.env.Process.Owner

-- Simple action
Handlers.add("Inc", "Inc", function(msg)
  Count = Count + 1
  msg.reply({ Data = tostring(Count) })
end)

-- Multi-user state
Handlers.add("Mint", "Mint", function(msg)
  local amount = tonumber(msg.Tags.Amount) or 0
  Balances[msg.From] = (Balances[msg.From] or 0) + amount
  msg.reply({ Data = json.encode({ balance = Balances[msg.From] }) })
end)

-- Owner-only with error
Handlers.add("Reset", "Reset", function(msg)
  if msg.From ~= Owner then
    msg.reply({ Data = json.encode({ error = "Unauthorized" }) })
    return
  end
  Count = 0
  msg.reply({ Data = json.encode({ success = true }) })
end)

-- Query with JSON response
Handlers.add("GetState", "GetState", function(msg)
  msg.reply({ Data = json.encode({
    count = Count,
    balance = Balances[msg.From] or 0
  }) })
end)
```

### Tag Naming (aos2_0_6)

**aos2_0_6 lowercases custom tags.** This is expected behavior.

| Tag Type | JavaScript | Lua |
|----------|------------|-----|
| Custom | `{ name: "Tokena", value: "X" }` | `msg.Tags.Tokena` |
| Reserved | `{ name: "Action", value: "Swap" }` | `msg.Tags.Action` |

Reserved tags that stay capitalized: `Action`, `Data`, `From`, `Target`, `Owner`, `Module`, `Scheduler`

### HyperBEAM Test Pattern (lua@5.3a)

```javascript
import HyperBEAM from "../../../src/hyperbeam.js"

const hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
const hb = hbeam.hb

// Spawn process
const moduleId = await hb.getLua()
const tags = {
  "execution-device": "lua@5.3a",
  module: moduleId,
  type: "Process",
  device: "process@1.0",
  scheduler: hb.addr,
  data: luaCode,  // Lua source
}
const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(await hb.commit(tags, { path: false })),
})
const pid = response.headers.get("process")

// Send message
const msgTags = { type: "Message", target: pid, Action: "Inc" }
const msgResponse = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(await hb.commit(msgTags, { path: false })),
})
const slot = msgResponse.headers.get("slot")

// Compute result
const result = await hb.g(`/${pid}~process@1.0/compute`, { slot: parseInt(slot) })

// Cleanup
hbeam.kill()
```

### ArMem Test Pattern (WASM)

```javascript
import { ArMem, connect, acc, scheduler } from "../../../src/test.js"
import { readFileSync } from "fs"

const luaCode = readFileSync("claude/apps/counter.lua", "utf-8")
const mem = new ArMem()
const { spawn, message, dryrun } = connect(mem)

// Spawn with aos2_0_6 (default, lowercases tags)
const pid = await spawn({
  signer: acc[0].signer,
  scheduler,
  module: mem.modules.aos2_0_6,
})

// Load Lua code
await message({
  process: pid,
  signer: acc[0].signer,
  tags: [{ name: "Action", value: "Eval" }],
  data: luaCode,
})

// Send message (lowercase custom tags!)
await message({
  process: pid,
  signer: acc[0].signer,
  tags: [
    { name: "Action", value: "CreatePool" },
    { name: "Tokena", value: "TOKEN-A" },
    { name: "Tokenb", value: "TOKEN-B" },
  ],
})

// Query (read-only)
const res = await dryrun({
  process: pid,
  signer: acc[0].signer,
  tags: [{ name: "Action", value: "Get" }],
})
const data = JSON.parse(res.Messages[0].Data)
```

### Example Apps

| App | Handlers |
|-----|----------|
| `counter.lua` | Inc, Dec, Get, Reset |
| `token.lua` | Transfer, Balance, Mint |
| `kv-store.lua` | Set, Get, Delete |
| `amm-dex.lua` | AddLiquidity, Swap, GetPool |
| `voting-dao.lua` | CreateProposal, Vote, Execute |

---

## Part 2: Erlang Devices

**BEFORE BUILDING ERLANG DEVICES: Read `claude/docs/llms.txt` for TABM format and device patterns.**

### When to Use Erlang vs Lua

| Feature | Lua (AO Process) | Erlang (HyperBEAM Device) |
|---------|------------------|---------------------------|
| State | Process memory | `persistent_term` |
| Testing | ArMem or HyperBEAM | HyperBEAM only |
| Use Case | User apps, tokens | Infrastructure, gateways |
| Deployment | Arweave mainnet | HyperBEAM node |

### Device File Template

```erlang
-module(dev_mydevice).
-export([info/3, action/3, query/3]).
-include("include/hb.hrl").

-define(STATE_KEY, <<"mydevice-state">>).
-define(BALANCES_KEY, <<"mydevice-balances">>).

%%====================================================================
%% Device Callbacks
%%====================================================================

%% GET /~mydevice@1.0/info
info(_M1, _M2, _Opts) ->
    {ok, #{<<"name">> => <<"mydevice">>, <<"version">> => <<"1.0">>}}.

%% POST /~mydevice@1.0/action - with validation and error handling
action(M1, M2, Opts) ->
    From = get_from(M2),
    Amount = get_int_param(M2, <<"amount">>, 0),

    case Amount > 0 of
        false ->
            {error, #{<<"error">> => <<"invalid_amount">>}};
        true ->
            Balances = load_state(?BALANCES_KEY),
            Current = maps:get(From, Balances, 0),
            NewBalances = maps:put(From, Current + Amount, Balances),
            save_state(?BALANCES_KEY, NewBalances),
            {ok, #{<<"action">> => <<"done">>, <<"balance+integer">> => Current + Amount}}
    end.

%% GET /~mydevice@1.0/query
query(_M1, M2, _Opts) ->
    From = get_from(M2),
    Balances = load_state(?BALANCES_KEY),
    {ok, #{<<"user">> => From, <<"balance+integer">> => maps:get(From, Balances, 0)}}.

%%====================================================================
%% State Helpers
%%====================================================================

load_state(Key) ->
    try persistent_term:get({?MODULE, Key})
    catch error:badarg -> #{}
    end.

save_state(Key, State) ->
    persistent_term:put({?MODULE, Key}, State).

%%====================================================================
%% Parameter Helpers
%%====================================================================

get_param(M2, Key, Default) ->
    case maps:get(Key, M2, not_found) of
        not_found -> Default;
        Value -> Value
    end.

get_int_param(M2, Key, Default) ->
    case get_param(M2, Key, not_found) of
        not_found -> Default;
        Value when is_integer(Value) -> Value;
        Value when is_binary(Value) -> binary_to_integer(Value);
        Value when is_list(Value) -> list_to_integer(Value)
    end.

get_from(M2) ->
    maps:get(<<"from">>, M2, <<"anonymous">>).
```

### TABM Type Annotations

HyperBEAM uses Type-Annotated Binary Messages. Key suffixes:

| Suffix | Type | Example |
|--------|------|---------|
| (none) | binary | `<<"hello">>` |
| `+integer` | integer | `42` |
| `+float` | float | `3.14` |
| `+list` | list | `[1, 2, 3]` |

```erlang
%% Response with typed values
{ok, #{
    <<"count+integer">> => 42,
    <<"ratio+float">> => 0.5,
    <<"items+list">> => [<<"a">>, <<"b">>]
}}.
```

### Device Registration

Add to `~/HyperBEAM/src/hb_opts.erl`:

```erlang
preloaded_devices => [
    #{<<"name">> => <<"mydevice@1.0">>, <<"module">> => dev_mydevice}
]
```

Then: `cd ~/HyperBEAM && rebar3 compile`

### HTTP API Patterns

```javascript
// GET request
const info = await hb.g('/~mydevice@1.0/info')
const data = await hb.g('/~mydevice@1.0/query', { param: 'value' })

// POST request
const result = await hb.p('/~mydevice@1.0/action1', {
  param: 'value',
  amount: 100,
})
```

**Key behaviors:**
- HyperBEAM lowercases all response keys (`TOKEN-A` → `token-a`)
- Numbers may return as strings (use `Number()` for comparisons)
- Use lowercase param names in requests (`tokena` not `tokenA`)

### Erlang Device Test Pattern (Vitest)

```javascript
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import HyperBEAM from '../../../../../src/hyperbeam.js'

describe('MyDevice', () => {
  let hbeam, hb

  beforeAll(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
    hb = hbeam.hb
  }, 120000)

  afterAll(() => hbeam?.kill())

  it('should return info', async () => {
    const info = await hb.g('/~mydevice@1.0/info')
    expect(info.name).toBe('mydevice')
  })

  it('should perform action', async () => {
    const result = await hb.p('/~mydevice@1.0/action', { amount: 100, from: 'alice' })
    expect(result.action).toBe('done')
    expect(Number(result.balance)).toBe(100)  // Numbers may be strings
  })

  it('should reject invalid input', async () => {
    await expect(
      hb.p('/~mydevice@1.0/action', { amount: 0, from: 'bob' })
    ).rejects.toThrow()
  })

  it('should query state', async () => {
    const state = await hb.g('/~mydevice@1.0/query', { from: 'alice' })
    expect(Number(state.balance)).toBe(100)
  })
})
```

---

## Part 3: Frontend Development

### Vitest Configuration

```javascript
// vitest.config.js
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{js,jsx}'],
    testTimeout: 120000,
    pool: 'forks',  // Required for WASM
  },
})
```

### WAO Server Ports

`new Server({ port: N })` creates:
- AR (Gateway): N
- BD (Bundler): N+1
- MU (Message Unit): N+2
- SU (Scheduler Unit): N+3
- CU (Compute Unit): N+4

### Import Paths

```javascript
// Local development (reliable)
import { ArMem, connect, acc, scheduler } from '../../../../../src/test.js'
import HyperBEAM from '../../../../../src/hyperbeam.js'
import Server from '../../../../../src/server.js'

// Package imports (requires npm run build in wao root)
import { ArMem, connect, acc, scheduler } from 'wao/test'
```

---

## HB Class Reference

```javascript
const hb = hbeam.hb

// HTTP operations
hb.g(path, params)              // GET request
hb.p(path, body)                // POST request
hb.commit(tags, opts)           // Sign message

// Helpers
hb.getLua()                     // Get cached Lua module ID
hb.spawn(tags)                  // Spawn process
hb.schedule({ pid, ... })       // Schedule message
hb.now({ pid })                 // Get current state
```

---

## Execution Devices

| Device | Description | Stack Config |
|--------|-------------|--------------|
| `lua@5.3a` | Native luerl | Direct (no stack) |
| `genesis-wasm@1.0` | Legacy WASM | `stack@1.0` + `device-stack` |
| `wasm-64@1.0` | 64-bit WASM | `stack@1.0` + `device-stack` |

**For development, use `lua@5.3a`** - fastest, no CU required.

---

## Module IDs

| Name | Use |
|------|-----|
| `aos2_0_6` | **Default** - lowercases custom tags |
| `aos2_0_1` | Legacy - preserves tag case (don't use) |
| `sqlite` | SQLite support |

---

## Troubleshooting

**Tests hang or "fetch failed":**
```bash
pkill -9 -f beam.smp; pkill -9 -f epmd
export HB_REBAR3=false
```

**Environment not found:**
```bash
. ~/.asdf/asdf.sh
```

**"Cannot find package 'ramda'" or other missing packages:**
```bash
cd /home/user/wao && npm install
```

**"Cannot find module hbsig" or hbsig errors:**
```bash
cd /home/user/wao/hbsig && npm install && npm run build
rm -f /home/user/wao/node_modules/hbsig
ln -s ../hbsig/dist /home/user/wao/node_modules/hbsig
```

**Erlang device tests fail with "device_not_loadable":**
```bash
# Copy device to HyperBEAM and register it
cp /home/user/wao/claude/devices/dev_dex.erl ~/HyperBEAM/src/
# Add to preloaded_devices in ~/HyperBEAM/src/hb_opts.erl:
# #{<<"name">> => <<"dex@1.0">>, <<"module">> => dev_dex}
cd ~/HyperBEAM && rebar3 compile
```

---

## Building Workflow

### Lua Apps
1. Write Lua in `claude/apps/[name].lua`
2. Add tests to `claude/apps/tests/hyperbeam.test.js`
3. Run: `HB_TIMEOUT=120 node --test --test-concurrency=1 claude/apps/tests/hyperbeam.test.js`

### Erlang Devices
1. **Read `claude/docs/llms.txt`** for TABM and device patterns
2. Write device in `claude/devices/dev_[name].erl`
3. Copy to `~/HyperBEAM/src/`
4. Register in `~/HyperBEAM/src/hb_opts.erl`
5. Recompile: `cd ~/HyperBEAM && rebar3 compile`
6. Test with Vitest + HyperBEAM

### Frontend Apps
1. Create in `claude/apps/[name]-ui/`
2. Add `"wao": "file:../../.."` to package.json devDependencies
3. Configure vitest with `pool: 'forks'`
4. Import from source paths for local dev

