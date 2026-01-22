# WAO SDK - Claude Guide

## Step 1: Setup

**Run this command block exactly as-is. Report the duration to user and proceed to Step 2.**

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

# Create workspaces directory
mkdir -p /home/user/wao/workspaces

# Configure environment
cd /home/user/wao
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF

echo "Installation complete in $((SECONDS - START)) seconds"
```

## Step 2: Interactive Menu

**After setup, present this menu to the user:**

```
Environment ready in X seconds. What would you like to do?

1. Build a Lua app (token, DAO, game, DeFi)
2. Build an Erlang device (infrastructure, gateway)
3. Run tests (verify setup)
4. Explore examples
5. What's possible? (explain tech stack)
6. Manage workspaces (list, continue, delete)
```

**IMPORTANT BEHAVIOR:**
- After completing ANY task, return to this menu
- Ask "What would you like to do next?" with the same options
- If user says "menu" or "options", show this menu again
- All user projects go in `workspaces/[project-name]/`

---

## Workspace Management

**All user projects are created in `/home/user/wao/workspaces/`**

```
workspaces/
├── my-token/           # Lua app
│   ├── app.lua
│   ├── app.test.js
│   └── README.md
├── my-dex/             # Lua app
│   ├── app.lua
│   ├── app.test.js
│   └── README.md
├── rate-limiter/       # Erlang device
│   ├── dev_ratelimiter.erl
│   ├── device.test.js
│   └── README.md
└── ...
```

**Workspace Commands:**
```bash
# List all workspaces
ls -la /home/user/wao/workspaces/

# Check workspace status
cat /home/user/wao/workspaces/[name]/README.md
```

---

## Option 1: Build a Lua App

**When user selects this, ask TWO questions:**

**Question 1: Execution Environment**
```
Which execution environment?

1. Mainnet WASM (Recommended) - aos2_0_6 module, production-ready
2. HyperAOS - lua@5.3a native, fastest for development
3. Legacynet - older aos2_0_1 module

Default: Mainnet WASM
```

**Question 2: App Type & Name**
```
What kind of Lua app? Examples:
- Counter (simple state)
- Token (fungible token with transfers)
- DEX (AMM with liquidity pools)
- DAO (proposals + voting)
- Game (turn-based, lottery)
- Custom (describe your idea)

What should I name the workspace?
```

### Environment Comparison

| Feature | Mainnet WASM | HyperAOS | Legacynet |
|---------|--------------|----------|-----------|
| Module | aos2_0_6 | lua@5.3a | aos2_0_1 |
| Testing | ArMem (fast) | HyperBEAM | ArMem |
| Tag case | Lowercased | Preserved | Preserved |
| Speed | Medium | Fastest | Medium |
| Production | Yes | Dev only | Legacy |

**Workflow:**
1. Create workspace: `workspaces/[name]/`
2. Create `workspaces/[name]/app.lua`
3. Create `workspaces/[name]/app.test.js` (based on environment)
4. Create `workspaces/[name]/README.md` with description
5. Run tests
6. Report results and return to menu

---

### Mainnet WASM Template (Default)

`workspaces/[name]/app.lua`:
```lua
-- [Name] - [Description]
-- Created: [Date]
-- Environment: Mainnet WASM (aos2_0_6)
-- NOTE: Custom tags are lowercased (e.g., msg.Tags.Amount -> msg.Tags.amount)

local json = require("json")

-- State
State = State or {}

-- Handlers
Handlers.add("Info", "Info", function(msg)
  msg.reply({ Data = json.encode({ name = "[name]", version = "1.0" }) })
end)

-- Add your handlers here
```

`workspaces/[name]/app.test.js` (ArMem):
```javascript
import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { ArMem, connect, acc, scheduler } from '../../src/test.js'

const luaCode = readFileSync(new URL('./app.lua', import.meta.url), 'utf-8')

describe('[Name] App (Mainnet WASM)', () => {
  let mem, spawn, message, dryrun, pid

  before(async () => {
    mem = new ArMem()
    const conn = connect(mem)
    spawn = conn.spawn
    message = conn.message
    dryrun = conn.dryrun

    // Spawn process with aos2_0_6
    pid = await spawn({
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
  })

  it('should return info', async () => {
    const res = await dryrun({
      process: pid,
      signer: acc[0].signer,
      tags: [{ name: "Action", value: "Info" }],
    })
    const data = JSON.parse(res.Messages[0].Data)
    assert.strictEqual(data.name, '[name]')
  })
})
```

**Test command:** `node --test workspaces/[name]/app.test.js`

---

### HyperAOS Template

`workspaces/[name]/app.lua`:
```lua
-- [Name] - [Description]
-- Created: [Date]
-- Environment: HyperAOS (lua@5.3a)
-- NOTE: Tag case is preserved

local json = require("json")

-- State
State = State or {}

-- Handlers
Handlers.add("Info", "Info", function(msg)
  msg.reply({ Data = json.encode({ name = "[name]", version = "1.0" }) })
end)

-- Add your handlers here
```

`workspaces/[name]/app.test.js` (HyperBEAM):
```javascript
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import HyperBEAM from '../../src/hyperbeam.js'

const luaCode = readFileSync(new URL('./app.lua', import.meta.url), 'utf-8')

describe('[Name] App (HyperAOS)', () => {
  let hbeam, hb, pid

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
    hb = hbeam.hb

    // Get Lua module and spawn process
    const moduleId = await hb.getLua()
    const tags = {
      "execution-device": "lua@5.3a",
      module: moduleId,
      type: "Process",
      device: "process@1.0",
      scheduler: hb.addr,
      data: luaCode,
    }
    const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await hb.commit(tags, { path: false })),
    })
    pid = response.headers.get("process")
  }, 120000)

  after(() => hbeam?.kill())

  it('should return info', async () => {
    // Send Info message
    const msgTags = { type: "Message", target: pid, Action: "Info" }
    const msgResponse = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(await hb.commit(msgTags, { path: false })),
    })
    const slot = msgResponse.headers.get("slot")

    // Compute result
    const result = await hb.g(`/${pid}~process@1.0/compute`, { slot: parseInt(slot) })
    assert.ok(result)
  })
})
```

**Test command:** `HB_TIMEOUT=120 node --test workspaces/[name]/app.test.js`

---

### Legacynet Template

`workspaces/[name]/app.lua`:
```lua
-- [Name] - [Description]
-- Created: [Date]
-- Environment: Legacynet (aos2_0_1)
-- NOTE: Tag case is preserved (legacy behavior)

local json = require("json")

-- State
State = State or {}

-- Handlers
Handlers.add("Info", "Info", function(msg)
  msg.reply({ Data = json.encode({ name = "[name]", version = "1.0" }) })
end)

-- Add your handlers here
```

`workspaces/[name]/app.test.js` (ArMem with aos2_0_1):
```javascript
import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { ArMem, connect, acc, scheduler } from '../../src/test.js'

const luaCode = readFileSync(new URL('./app.lua', import.meta.url), 'utf-8')

describe('[Name] App (Legacynet)', () => {
  let mem, spawn, message, dryrun, pid

  before(async () => {
    mem = new ArMem()
    const conn = connect(mem)
    spawn = conn.spawn
    message = conn.message
    dryrun = conn.dryrun

    // Spawn process with aos2_0_1 (legacy)
    pid = await spawn({
      signer: acc[0].signer,
      scheduler,
      module: mem.modules.aos2_0_1,
    })

    // Load Lua code
    await message({
      process: pid,
      signer: acc[0].signer,
      tags: [{ name: "Action", value: "Eval" }],
      data: luaCode,
    })
  })

  it('should return info', async () => {
    const res = await dryrun({
      process: pid,
      signer: acc[0].signer,
      tags: [{ name: "Action", value: "Info" }],
    })
    const data = JSON.parse(res.Messages[0].Data)
    assert.strictEqual(data.name, '[name]')
  })
})
```

**Test command:** `node --test workspaces/[name]/app.test.js`

---

### README Template for Lua Apps

`workspaces/[name]/README.md`:
```markdown
# [Name]

**Type:** Lua App
**Environment:** [Mainnet WASM | HyperAOS | Legacynet]
**Module:** [aos2_0_6 | lua@5.3a | aos2_0_1]
**Created:** [Date]
**Status:** In Progress

## Description
[User's description]

## Handlers
- Info: Returns app info
- Add more...

## Test Command
\`\`\`bash
[HB_TIMEOUT=120] node --test workspaces/[name]/app.test.js
\`\`\`

## Notes
- [Environment-specific notes about tag casing, etc.]
```

**Reference examples:** `claude/apps/*.lua` (13 apps)

---

## Option 2: Build an Erlang Device

**When user selects this, ask:**
```
What kind of Erlang device? Examples:
- Key-Value store (simple persistence)
- Rate limiter (request throttling)
- Gateway (HTTP proxy/router)
- Analytics (metrics collection)
- Custom (describe your idea)

What should I name the workspace? (will be prefixed with dev_)
```

**Workflow:**
1. **Read `claude/docs/llms.txt`** (MANDATORY for TABM format)
2. Create workspace: `workspaces/[name]/`
3. Create `workspaces/[name]/dev_[name].erl`
4. Create `workspaces/[name]/device.test.js`
5. Create `workspaces/[name]/README.md`
6. Copy to HyperBEAM: `cp workspaces/[name]/dev_[name].erl ~/HyperBEAM/src/`
7. Register in `~/HyperBEAM/src/hb_opts.erl`
8. Compile: `cd ~/HyperBEAM && rebar3 compile`
9. Run tests: `node --test workspaces/[name]/device.test.js`
10. Report results and return to menu

**Erlang Device Workspace Template:**

`workspaces/[name]/dev_[name].erl`:
```erlang
-module(dev_[name]).
-export([info/3]).
%% Add more exports as needed

%% GET /~[name]@1.0/info
info(_M1, _M2, _Opts) ->
    {ok, #{<<"name">> => <<"[name]">>, <<"version">> => <<"1.0">>}}.

%% Add your endpoints here
```

`workspaces/[name]/device.test.js`:
```javascript
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import HyperBEAM from '../../src/hyperbeam.js'

describe('[Name] Device', () => {
  let hbeam, hb

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
    hb = hbeam.hb
  }, 120000)

  after(() => hbeam?.kill())

  it('should return info', async () => {
    const info = await hb.g('/~[name]@1.0/info')
    assert.strictEqual(info.name, '[name]')
  })
})
```

`workspaces/[name]/README.md`:
```markdown
# [Name] Device

**Type:** Erlang Device
**Created:** [Date]
**Status:** In Progress
**Device Name:** [name]@1.0

## Description
[User's description]

## Endpoints
- GET /~[name]@1.0/info - Device info
- Add more...

## Deploy Command
\`\`\`bash
cp workspaces/[name]/dev_[name].erl ~/HyperBEAM/src/
cd ~/HyperBEAM && rebar3 compile
\`\`\`

## Test Command
\`\`\`bash
HB_TIMEOUT=120 node --test workspaces/[name]/device.test.js
\`\`\`
```

**Reference examples:** `claude/devices/*.erl` (9 devices)

---

## Option 3: Run Tests

**When user selects this, offer:**
```
Which tests?
1. Lua app tests (30 tests) - Example apps
2. Erlang device tests (14 tests) - DEX device
3. Workspace tests - Run tests for a specific workspace
4. All workspace tests
```

**Commands:**
| Test | Command |
|------|---------|
| Example Lua apps | `HB_TIMEOUT=120 node --test --test-concurrency=1 claude/apps/tests/hyperbeam.test.js` |
| Example Erlang DEX | `HB_TIMEOUT=120 node --test --test-concurrency=1 claude/apps/tests/dev-dex.test.js` |
| Specific workspace | `HB_TIMEOUT=120 node --test workspaces/[name]/*.test.js` |
| All workspaces | `HB_TIMEOUT=120 node --test workspaces/**/*.test.js` |
| Kill stuck | `pkill -9 -f beam.smp; pkill -9 -f epmd` |

After tests complete, return to menu.

---

## Option 4: Explore Examples

**When user selects this, show:**

### Lua Apps (13 examples in `claude/apps/`)
| App | Description | Key Handlers |
|-----|-------------|--------------|
| `counter.lua` | Simple counter | Inc, Dec, Get, Reset |
| `token.lua` | Fungible token | Transfer, Balance, Mint |
| `kv-store.lua` | Key-value store | Set, Get, Delete |
| `amm-dex.lua` | AMM DEX | AddLiquidity, Swap, GetPool |
| `voting-dao.lua` | Governance DAO | CreateProposal, Vote, Execute |
| `nft-collection.lua` | NFT collection | Mint, Transfer, GetOwner |
| `chatroom.lua` | Chat room | Register, Send, GetMessages |
| `todo.lua` | Todo list | Add, Complete, List |
| `social-feed.lua` | Social feed | CreatePost, Like, Follow |
| `auction.lua` | Auction house | CreateAuction, Bid, Settle |
| `escrow.lua` | Escrow service | Create, Release, Refund |
| `lottery.lua` | Lottery game | Buy, Draw, Claim |
| `staking-pool.lua` | Staking pool | Stake, Unstake, Claim |

### Erlang Devices (9 examples in `claude/devices/`)
| Device | Description | Key Endpoints |
|--------|-------------|---------------|
| `dev_dex.erl` | AMM DEX | mint, swap, add_liquidity |
| `dev_kv.erl` | Key-value store | set, get, delete |
| `dev_counter.erl` | Counter | inc, dec, get |
| `dev_gateway.erl` | HTTP gateway | proxy, route |
| `dev_analytics.erl` | Analytics | track, query |
| `dev_ratelimiter.erl` | Rate limiter | check, reset |
| `dev_processor.erl` | Message processor | process, batch |
| `dev_dataplatform.erl` | Data platform | store, query, aggregate |
| `dev_aojs.erl` | AO.js integration | eval, call |

**Ask:** "Want me to read any of these? Copy one as starting point? Or return to menu?"

---

## Option 5: What's Possible?

**When user selects this, explain:**

### Tech Stack Overview

```
┌─────────────────────────────────────────────────────────┐
│                     WAO SDK                              │
├─────────────────────────────────────────────────────────┤
│  Lua Apps (AO Processes)    │  Erlang Devices           │
│  ─────────────────────────  │  ───────────────────────  │
│  • Stateful processes       │  • HyperBEAM extensions   │
│  • Runs on Arweave          │  • Node-level infra       │
│  • User-facing apps         │  • Gateways, caches       │
│  • Tokens, DAOs, games      │  • Custom protocols       │
├─────────────────────────────────────────────────────────┤
│                    Testing Options                       │
├─────────────────────────────────────────────────────────┤
│  ArMem (WASM)               │  HyperBEAM (Native)       │
│  • In-memory simulation     │  • Real Erlang node       │
│  • Fast iteration           │  • Full device support    │
│  • aos2_0_6 module          │  • lua@5.3a execution     │
└─────────────────────────────────────────────────────────┘
```

### When to Use What

| Want to build... | Use | Test with |
|------------------|-----|-----------|
| Token/NFT | Lua app | ArMem or HyperBEAM |
| DAO/Voting | Lua app | ArMem or HyperBEAM |
| Game | Lua app | ArMem or HyperBEAM |
| DeFi (DEX, lending) | Lua app | ArMem or HyperBEAM |
| API Gateway | Erlang device | HyperBEAM |
| Rate limiter | Erlang device | HyperBEAM |
| Custom protocol | Erlang device | HyperBEAM |
| Analytics/Metrics | Erlang device | HyperBEAM |

### Key Concepts

**Lua Apps:**
- State persists in process memory (`Count = Count or 0`)
- Handlers respond to Actions (`Handlers.add("Inc", "Inc", fn)`)
- Messages have Tags (Action, From, custom tags)
- aos2_0_6 lowercases custom tag names

**Erlang Devices:**
- Exposed via HTTP: `GET/POST /~device@1.0/endpoint`
- State in `persistent_term`
- TABM format: `<<"key+integer">> => 42`
- Must register in `hb_opts.erl`

**Ask:** "Ready to build something? Back to menu?"

---

## Option 6: Manage Workspaces

**When user selects this, show:**
```
Workspace Management:

1. List all workspaces
2. Continue working on a workspace
3. Delete a workspace
4. Back to menu
```

**List workspaces:** Show table with name, type, status, last modified
```bash
ls -la /home/user/wao/workspaces/
```

**Continue workspace:**
- Read the workspace's README.md
- Show current status and next steps
- Resume development

**Delete workspace:**
- Confirm with user
- Remove directory
- If Erlang device, remind to remove from hb_opts.erl

---

## Quick Commands Reference

| Task | Command |
|------|---------|
| List workspaces | `ls -la workspaces/` |
| Lua example tests | `HB_TIMEOUT=120 node --test --test-concurrency=1 claude/apps/tests/hyperbeam.test.js` |
| Erlang example tests | `HB_TIMEOUT=120 node --test --test-concurrency=1 claude/apps/tests/dev-dex.test.js` |
| Workspace tests | `HB_TIMEOUT=120 node --test workspaces/[name]/*.test.js` |
| Kill stuck | `pkill -9 -f beam.smp; pkill -9 -f epmd` |
| Recompile HB | `cd ~/HyperBEAM && rebar3 compile` |
| Load Erlang | `. ~/.asdf/asdf.sh` |

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

**"Cannot find package 'ramda'" or missing packages:**
```bash
cd /home/user/wao && npm install
```

**"Cannot find module hbsig":**
```bash
cd /home/user/wao/hbsig && npm install && npm run build
rm -f /home/user/wao/node_modules/hbsig
ln -s ../hbsig/dist /home/user/wao/node_modules/hbsig
```

**Erlang "device_not_loadable":**
```bash
cp workspaces/[name]/dev_[name].erl ~/HyperBEAM/src/
# Add to preloaded_devices in ~/HyperBEAM/src/hb_opts.erl
cd ~/HyperBEAM && rebar3 compile
```

---

## Reference: Lua Handler Pattern

```lua
Count = Count or 0
Balances = Balances or {}
Owner = Owner or ao.env.Process.Owner

Handlers.add("Inc", "Inc", function(msg)
  Count = Count + 1
  msg.reply({ Data = tostring(Count) })
end)

Handlers.add("Transfer", "Transfer", function(msg)
  local to = msg.Tags.To
  local amount = tonumber(msg.Tags.Amount) or 0
  if Balances[msg.From] >= amount then
    Balances[msg.From] = Balances[msg.From] - amount
    Balances[to] = (Balances[to] or 0) + amount
    msg.reply({ Data = json.encode({ success = true }) })
  else
    msg.reply({ Data = json.encode({ error = "Insufficient balance" }) })
  end
end)
```

## Reference: Erlang Device Pattern

```erlang
-module(dev_mydevice).
-export([info/3, action/3, query/3]).

info(_M1, _M2, _Opts) ->
    {ok, #{<<"name">> => <<"mydevice">>, <<"version">> => <<"1.0">>}}.

action(_M1, M2, _Opts) ->
    Amount = maps:get(<<"amount">>, M2, 0),
    {ok, #{<<"result">> => <<"ok">>, <<"amount+integer">> => Amount}}.

query(_M1, M2, _Opts) ->
    From = maps:get(<<"from">>, M2, <<"anonymous">>),
    {ok, #{<<"user">> => From}}.
```

## Reference: HyperBEAM Test Pattern

```javascript
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import HyperBEAM from '../../src/hyperbeam.js'

describe('My App/Device', () => {
  let hbeam, hb

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
    hb = hbeam.hb
  }, 120000)

  after(() => hbeam?.kill())

  // GET request
  it('should get info', async () => {
    const info = await hb.g('/~device@1.0/info')
    assert.ok(info.name)
  })

  // POST request
  it('should perform action', async () => {
    const result = await hb.p('/~device@1.0/action', { amount: 100 })
    assert.strictEqual(result.result, 'ok')
  })
})
```
