# WAO SDK - Claude Guide

## Step 1: Setup

**Run this command block exactly as-is (it runs silently). Then output the splash and duration directly as text.**

```bash
START=$SECONDS

# Extract tarballs (silent)
cd ~ && tar -xJf /home/user/wao/claude/installation/asdf-erlang-rebar.tar.xz
cd ~ && tar -xJf /home/user/wao/claude/installation/hyperbeam-wao-ready.tar.xz
cd /home/user/wao && tar -xJf /home/user/wao/claude/installation/wao-node-modules.tar.xz

# Setup Erlang (silent)
. ~/.asdf/asdf.sh && asdf global erlang 27.3.4.6 && asdf global rebar 3.26.0

# Install dependencies (silent)
cd /home/user/wao && npm install --silent 2>/dev/null

# Build and link hbsig (silent)
cd /home/user/wao/hbsig && npm install --silent 2>/dev/null && npm run build --silent 2>/dev/null
rm -f /home/user/wao/node_modules/hbsig
ln -s ../hbsig/dist /home/user/wao/node_modules/hbsig

# Register dev_dex device for Erlang tests (silent)
cp /home/user/wao/claude/devices/dev_dex.erl ~/HyperBEAM/src/
grep -q 'dev_dex' ~/HyperBEAM/src/hb_opts.erl || \
  sed -i 's/#{<<"name">> => <<"whois@1.0">>, <<"module">> => dev_whois}/#{<<"name">> => <<"whois@1.0">>, <<"module">> => dev_whois},\n            #{<<"name">> => <<"dex@1.0">>, <<"module">> => dev_dex}/' ~/HyperBEAM/src/hb_opts.erl
cd ~/HyperBEAM && rebar3 compile > /dev/null 2>&1

# Create workspaces directory
mkdir -p /home/user/wao/workspaces

# Configure environment
cd /home/user/wao
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF

# Output duration only (splash is displayed by assistant)
echo "$((SECONDS - START))"
```

**After running the command, output this splash directly as text (replacing X with the duration):**

```
██╗    ██╗ █████╗  ██████╗
██║    ██║██╔══██╗██╔═══██╗
██║ █╗ ██║███████║██║   ██║
██║███╗██║██╔══██║██║   ██║
╚███╔███╔╝██║  ██║╚██████╔╝
 ╚══╝╚══╝ ╚═╝  ╚═╝ ╚═════╝

  WizardAO SDK on Claude Code

Installation complete in X seconds
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

### Workspace Structure

```
workspaces/
├── my-token/                # Lua app
│   ├── package.json         # Scripts: test, dev
│   ├── README.md            # Description & commands
│   ├── lua/
│   │   └── token.lua        # Lua source code
│   ├── test/
│   │   └── main.test.js     # Tests
│   └── frontend/            # Optional Vite app
│       ├── package.json
│       ├── index.html
│       ├── main.js
│       └── style.css
├── rate-limiter/            # Erlang device
│   ├── package.json
│   ├── README.md
│   ├── erlang/
│   │   └── dev_ratelimiter.erl
│   ├── test/
│   │   └── main.test.js
│   └── frontend/            # Optional Vite app
└── ...
```

### Root package.json Template

`workspaces/[name]/package.json`:
```json
{
  "name": "[name]",
  "type": "module",
  "scripts": {
    "test": "node --test test/main.test.js",
    "dev": "cd frontend && npm run dev"
  }
}
```

**Workspace Commands:**
```bash
# List all workspaces
ls -la /home/user/wao/workspaces/

# Check workspace status
cat /home/user/wao/workspaces/[name]/README.md

# Run tests
cd workspaces/[name] && npm test

# Run frontend
cd workspaces/[name] && npm run dev
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
1. Create workspace structure:
   - `workspaces/[name]/package.json`
   - `workspaces/[name]/lua/[name].lua`
   - `workspaces/[name]/test/main.test.js`
   - `workspaces/[name]/README.md`
2. Run tests
3. **Ask user:** "Would you like me to build a frontend for this app?"
4. If yes, create Vite frontend in `workspaces/[name]/frontend/`
5. Report results and return to menu

---

### Mainnet WASM Template (Default)

`workspaces/[name]/package.json`:
```json
{
  "name": "[name]",
  "type": "module",
  "scripts": {
    "test": "node --test test/main.test.js",
    "dev": "cd frontend && npm run dev"
  }
}
```

`workspaces/[name]/lua/[name].lua`:
```lua
-- [Name] - [Description]
-- Created: [Date]
-- Environment: Mainnet WASM (aos2_0_6)

local json = require("json")

-- State
State = State or {}

-- Handlers
Handlers.add("Info", "Info", function(msg)
  msg.reply({ Data = json.encode({ name = "[name]", version = "1.0" }) })
end)

-- Add your handlers here
```

`workspaces/[name]/test/main.test.js` (ArMem):
```javascript
import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { ArMem, connect, acc, scheduler } from '../../../src/test.js'

const luaCode = readFileSync(new URL('../lua/[name].lua', import.meta.url), 'utf-8')

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

**Test command:** `cd workspaces/[name] && npm test`

---

### HyperAOS Template

`workspaces/[name]/package.json`:
```json
{
  "name": "[name]",
  "type": "module",
  "scripts": {
    "test": "HB_TIMEOUT=120 node --test test/main.test.js",
    "dev": "cd frontend && npm run dev"
  }
}
```

`workspaces/[name]/lua/[name].lua`:
```lua
-- [Name] - [Description]
-- Created: [Date]
-- Environment: HyperAOS (lua@5.3a)

local json = require("json")

-- State
State = State or {}

-- Handlers
Handlers.add("Info", "Info", function(msg)
  msg.reply({ Data = json.encode({ name = "[name]", version = "1.0" }) })
end)

-- Add your handlers here
```

`workspaces/[name]/test/main.test.js` (HyperBEAM):
```javascript
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import HyperBEAM from '../../../src/hyperbeam.js'

const luaCode = readFileSync(new URL('../lua/[name].lua', import.meta.url), 'utf-8')

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

**Test command:** `cd workspaces/[name] && npm test`

---

### Legacynet Template

`workspaces/[name]/package.json`:
```json
{
  "name": "[name]",
  "type": "module",
  "scripts": {
    "test": "node --test test/main.test.js",
    "dev": "cd frontend && npm run dev"
  }
}
```

`workspaces/[name]/lua/[name].lua`:
```lua
-- [Name] - [Description]
-- Created: [Date]
-- Environment: Legacynet (aos2_0_1)

local json = require("json")

-- State
State = State or {}

-- Handlers
Handlers.add("Info", "Info", function(msg)
  msg.reply({ Data = json.encode({ name = "[name]", version = "1.0" }) })
end)

-- Add your handlers here
```

`workspaces/[name]/test/main.test.js` (ArMem with aos2_0_1):
```javascript
import { describe, it, before } from 'node:test'
import assert from 'node:assert'
import { readFileSync } from 'fs'
import { ArMem, connect, acc, scheduler } from '../../../src/test.js'

const luaCode = readFileSync(new URL('../lua/[name].lua', import.meta.url), 'utf-8')

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

**Test command:** `cd workspaces/[name] && npm test`

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

## Structure
\`\`\`
[name]/
├── package.json
├── README.md
├── lua/
│   └── [name].lua
├── test/
│   └── main.test.js
└── frontend/          # Optional
    └── ...
\`\`\`

## Handlers
- Info: Returns app info
- Add more...

## Commands
\`\`\`bash
# Run tests
npm test

# Run frontend (if created)
npm run dev
\`\`\`

## Notes
- [Environment-specific notes]
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
2. Create workspace structure:
   - `workspaces/[name]/package.json`
   - `workspaces/[name]/erlang/dev_[name].erl`
   - `workspaces/[name]/test/main.test.js`
   - `workspaces/[name]/README.md`
3. Copy to HyperBEAM: `cp workspaces/[name]/erlang/dev_[name].erl ~/HyperBEAM/src/`
4. Register in `~/HyperBEAM/src/hb_opts.erl`
5. Compile: `cd ~/HyperBEAM && rebar3 compile`
6. Run tests: `cd workspaces/[name] && npm test`
7. **Ask user:** "Would you like me to build a frontend for this device?"
8. If yes, create Vite frontend in `workspaces/[name]/frontend/`
9. Report results and return to menu

**Erlang Device Workspace Template:**

`workspaces/[name]/package.json`:
```json
{
  "name": "[name]",
  "type": "module",
  "scripts": {
    "test": "HB_TIMEOUT=120 node --test test/main.test.js",
    "dev": "cd frontend && npm run dev"
  }
}
```

`workspaces/[name]/erlang/dev_[name].erl`:
```erlang
-module(dev_[name]).
-export([info/3]).
%% Add more exports as needed

%% GET /~[name]@1.0/info
info(_M1, _M2, _Opts) ->
    {ok, #{<<"name">> => <<"[name]">>, <<"version">> => <<"1.0">>}}.

%% Add your endpoints here
```

`workspaces/[name]/test/main.test.js`:
```javascript
import { describe, it, before, after } from 'node:test'
import assert from 'node:assert'
import HyperBEAM from '../../../src/hyperbeam.js'

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

## Structure
\`\`\`
[name]/
├── package.json
├── README.md
├── erlang/
│   └── dev_[name].erl
├── test/
│   └── main.test.js
└── frontend/          # Optional
    └── ...
\`\`\`

## Endpoints
- GET /~[name]@1.0/info - Device info
- Add more...

## Commands
\`\`\`bash
# Deploy to HyperBEAM
cp erlang/dev_[name].erl ~/HyperBEAM/src/
cd ~/HyperBEAM && rebar3 compile

# Run tests
npm test

# Run frontend (if created)
npm run dev
\`\`\`
```

**Reference examples:** `claude/devices/*.erl` (9 devices)

---

## Frontend Template (Vite)

**After building a Lua app or Erlang device, ask:**
```
Would you like me to build a frontend for this app?
```

**If yes, create a Vite project:**

```bash
cd workspaces/[name]
npm create vite@latest frontend -- --template vanilla
cd frontend && npm install && npm install wao
```

**Frontend Structure:**
```
workspaces/[name]/frontend/
├── package.json
├── index.html
├── main.js          # WAO SDK interaction logic
└── style.css
```

**`frontend/index.html` Template:**
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>[Name] App</title>
    <link rel="stylesheet" href="/style.css" />
  </head>
  <body>
    <div id="app">
      <h1>[Name]</h1>
      <div class="process-input">
        <input type="text" id="processId" placeholder="Enter Process ID" />
        <button id="connectBtn">Connect</button>
      </div>
      <div id="content" class="hidden">
        <!-- App-specific UI here -->
      </div>
      <div id="status"></div>
    </div>
    <script type="module" src="/main.js"></script>
  </body>
</html>
```

**`frontend/main.js` Template:**
```javascript
import { AO } from "wao/web"

let ao = null
let processId = null

function setStatus(msg, type = "") {
  const el = document.getElementById("status")
  el.textContent = msg
  el.className = type
}

// Initialize AO with ArConnect wallet
async function initAO() {
  if (ao) return ao

  if (!window.arweaveWallet) {
    setStatus("Please install ArConnect wallet", "error")
    return null
  }

  await window.arweaveWallet.connect(["ACCESS_ADDRESS", "SIGN_TRANSACTION"])
  ao = new AO({ wallet: window.arweaveWallet })
  await ao.init()
  return ao
}

// Dryrun (read-only)
async function query(action, tags = {}) {
  const _ao = ao || new AO()
  const res = await _ao.dryrun({
    process: processId,
    tags: { Action: action, ...tags },
  })
  return res.Messages?.[0]?.Data ? JSON.parse(res.Messages[0].Data) : null
}

// Message (write, needs wallet)
async function send(action, tags = {}) {
  const _ao = await initAO()
  if (!_ao) return null

  const res = await _ao.message({
    process: processId,
    tags: { Action: action, ...tags },
  })
  return res
}

// Connect button
document.getElementById("connectBtn").addEventListener("click", async () => {
  processId = document.getElementById("processId").value.trim()
  if (!processId) return setStatus("Enter a Process ID", "error")

  try {
    // Query initial state
    const info = await query("Info")
    document.getElementById("content").classList.remove("hidden")
    setStatus("Connected!", "success")
  } catch (err) {
    setStatus(`Error: ${err.message}`, "error")
  }
})
```

**`frontend/style.css` Template:**
```css
:root {
  --bg: #1a1a2e;
  --surface: #16213e;
  --primary: #e94560;
  --text: #eee;
  --text-dim: #888;
}

* { box-sizing: border-box; margin: 0; padding: 0; }

body {
  font-family: system-ui, sans-serif;
  background: var(--bg);
  color: var(--text);
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
}

#app { text-align: center; padding: 2rem; max-width: 500px; }
h1 { margin-bottom: 2rem; }

.process-input { display: flex; gap: 0.5rem; margin-bottom: 2rem; }
.process-input input {
  flex: 1; padding: 0.75rem; border: none; border-radius: 8px;
  background: var(--surface); color: var(--text);
}
.process-input button {
  padding: 0.75rem 1.5rem; border: none; border-radius: 8px;
  background: var(--primary); color: white; cursor: pointer;
}

.hidden { display: none !important; }

#status {
  margin-top: 1.5rem; padding: 0.75rem; border-radius: 8px;
  font-size: 0.85rem; color: var(--text-dim);
}
#status.error { background: #5c1e2e; color: #ff6b6b; }
#status.success { background: #1e5c3a; color: #6bff9e; }

button {
  padding: 0.5rem 1rem; border: none; border-radius: 8px;
  background: var(--surface); color: var(--text); cursor: pointer;
}
button:hover { background: var(--primary); }
```

**Run frontend:** `cd workspaces/[name] && npm run dev`

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
| Specific workspace | `cd workspaces/[name] && npm test` |
| All workspaces | `HB_TIMEOUT=120 node --test workspaces/**/test/main.test.js` |
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
| Workspace tests | `cd workspaces/[name] && npm test` |
| Workspace frontend | `cd workspaces/[name] && npm run dev` |
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

---

## Supplemental: HyperBEAM from Source Installation

**Use this guide when you need to install HyperBEAM from a specific git branch (e.g., wao-m3) instead of the pre-built tarball.**

### Why This Guide Exists

The default setup uses `hyperbeam-wao-ready.tar.xz` which contains a pre-built HyperBEAM. However, when working with specific branches like `ocrybit/HyperBEAM:wao-m3`, you need to:
1. Clone the source from git
2. Use pre-built dependencies from tarball (hexpm is unavailable in this environment)
3. Compile the new source code
4. Extract pre-built NIFs from tarball

### Prerequisites

These are already available via tarballs:
- Erlang 27.3.4.6 (via asdf)
- Rebar3 3.26.0 (via asdf)
- Rust (for WASM runtime)
- Node.js 22+

### Step-by-Step Installation

**Step 1: Extract base tarballs (Erlang, Node modules)**

```bash
cd ~ && tar -xJf /home/user/wao/claude/installation/asdf-erlang-rebar.tar.xz
cd /home/user/wao && tar -xJf /home/user/wao/claude/installation/wao-node-modules.tar.xz

# Setup Erlang
. ~/.asdf/asdf.sh && asdf global erlang 27.3.4.6 && asdf global rebar 3.26.0
```

**Step 2: Clone HyperBEAM from source**

```bash
# Clone specific branch (example: wao-m3 from ocrybit fork)
cd ~ && git clone --branch wao-m3 https://github.com/ocrybit/HyperBEAM.git

# Or for main HyperBEAM repo:
# cd ~ && git clone --branch edge https://github.com/permaweb/HyperBEAM.git
```

**Step 3: Extract pre-built dependencies from tarball**

The environment cannot fetch packages from hexpm, so we extract the `_build` directory from the tarball:

```bash
# Extract _build directory (contains cowboy, ranch, gun, luerl, etc.)
cd /tmp && tar -xJf /home/user/wao/claude/installation/hyperbeam-wao-ready.tar.xz HyperBEAM/_build
cp -r /tmp/HyperBEAM/_build ~/HyperBEAM/
rm -rf /tmp/HyperBEAM
```

**Step 4: Configure rebar for offline compilation**

The source's `rebar.lock` references hexpm packages. Remove it and use git-based config:

```bash
cd ~/HyperBEAM

# Remove lock file (forces use of existing _build deps)
rm -f rebar.lock

# Use the installation's rebar.config (git-based deps, not hexpm)
cp /home/user/wao/claude/installation/hyperbeam_rebar.config rebar.config
```

**Step 5: Compile HyperBEAM**

```bash
cd ~/HyperBEAM
. ~/.asdf/asdf.sh
rebar3 compile
```

This will:
- Build WASM runtime (wamr) with cmake
- Compile all Erlang source files
- Skip dependency fetching (uses existing _build)

Expected output:
- ~150 .beam files in `_build/default/lib/hb/ebin/`
- WASM library at `_build/wamr/lib/libvmlib.a`

**Step 6: Extract pre-built NIFs**

The native NIFs (hb_beamr.so, hb_keccak.so) require the port_compiler plugin which isn't available. Extract from tarball:

```bash
# Extract NIFs
cd /tmp && tar -xJf /home/user/wao/claude/installation/hyperbeam-wao-ready.tar.xz HyperBEAM/priv

# Copy to HyperBEAM
cp -r /tmp/HyperBEAM/priv/* ~/HyperBEAM/priv/
mkdir -p ~/HyperBEAM/_build/default/lib/hb/priv
cp -r /tmp/HyperBEAM/priv/* ~/HyperBEAM/_build/default/lib/hb/priv/

# Cleanup
rm -rf /tmp/HyperBEAM
```

**Step 7: Register custom devices (optional)**

```bash
# Copy dev_dex device
cp /home/user/wao/claude/devices/dev_dex.erl ~/HyperBEAM/src/

# Register in hb_opts.erl (if not already present)
grep -q 'dev_dex' ~/HyperBEAM/src/hb_opts.erl || \
  sed -i 's/#{<<"name">> => <<"whois@1.0">>, <<"module">> => dev_whois}/#{<<"name">> => <<"whois@1.0">>, <<"module">> => dev_whois},\n            #{<<"name">> => <<"dex@1.0">>, <<"module">> => dev_dex}/' ~/HyperBEAM/src/hb_opts.erl

# Recompile
cd ~/HyperBEAM && rebar3 compile
```

**Step 8: Complete WAO SDK setup**

```bash
# Install WAO dependencies
cd /home/user/wao && npm install --silent 2>/dev/null

# Build and link hbsig
cd /home/user/wao/hbsig && npm install --silent 2>/dev/null && npm run build --silent 2>/dev/null
rm -f /home/user/wao/node_modules/hbsig
ln -s ../hbsig/dist /home/user/wao/node_modules/hbsig

# Create workspaces directory
mkdir -p /home/user/wao/workspaces

# Configure environment
cd /home/user/wao
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF
```

### Verification

```bash
# Check installation
cd ~/HyperBEAM
echo "Branch: $(git branch --show-current)"
echo "Commit: $(git log --oneline -1)"
echo "Beam files: $(ls _build/default/lib/hb/ebin/*.beam | wc -l)"
echo "NIFs: $(ls priv/*.so)"
echo "WASM: $(ls _build/wamr/lib/libvmlib.a && echo OK)"
```

Expected output:
```
Branch: wao-m3
Commit: ac68932c refactor: simplify dev_hbsig...
Beam files: 151
NIFs: priv/hb_beamr.so priv/hb_keccak.so
WASM: _build/wamr/lib/libvmlib.a
OK
```

### Complete One-Liner Script

For convenience, here's the complete installation as a single script:

```bash
#!/bin/bash
# HyperBEAM from Source Installation (wao-m3 branch)
# Usage: bash install-hyperbeam-source.sh [branch] [repo]
# Default: wao-m3 from ocrybit/HyperBEAM

BRANCH=${1:-wao-m3}
REPO=${2:-https://github.com/ocrybit/HyperBEAM.git}

set -e

echo "Installing HyperBEAM from $REPO branch $BRANCH"

# Step 1: Base tarballs
cd ~ && tar -xJf /home/user/wao/claude/installation/asdf-erlang-rebar.tar.xz
cd /home/user/wao && tar -xJf /home/user/wao/claude/installation/wao-node-modules.tar.xz
. ~/.asdf/asdf.sh && asdf global erlang 27.3.4.6 && asdf global rebar 3.26.0

# Step 2: Clone source
rm -rf ~/HyperBEAM
cd ~ && git clone --branch $BRANCH $REPO HyperBEAM

# Step 3: Extract dependencies
cd /tmp && tar -xJf /home/user/wao/claude/installation/hyperbeam-wao-ready.tar.xz HyperBEAM/_build
cp -r /tmp/HyperBEAM/_build ~/HyperBEAM/
rm -rf /tmp/HyperBEAM

# Step 4: Configure rebar
cd ~/HyperBEAM
rm -f rebar.lock
cp /home/user/wao/claude/installation/hyperbeam_rebar.config rebar.config

# Step 5: Compile
rebar3 compile

# Step 6: Extract NIFs
cd /tmp && tar -xJf /home/user/wao/claude/installation/hyperbeam-wao-ready.tar.xz HyperBEAM/priv
cp -r /tmp/HyperBEAM/priv/* ~/HyperBEAM/priv/
mkdir -p ~/HyperBEAM/_build/default/lib/hb/priv
cp -r /tmp/HyperBEAM/priv/* ~/HyperBEAM/_build/default/lib/hb/priv/
rm -rf /tmp/HyperBEAM

# Step 7: Register dev_dex
cp /home/user/wao/claude/devices/dev_dex.erl ~/HyperBEAM/src/
grep -q 'dev_dex' ~/HyperBEAM/src/hb_opts.erl || \
  sed -i 's/#{<<"name">> => <<"whois@1.0">>, <<"module">> => dev_whois}/#{<<"name">> => <<"whois@1.0">>, <<"module">> => dev_whois},\n            #{<<"name">> => <<"dex@1.0">>, <<"module">> => dev_dex}/' ~/HyperBEAM/src/hb_opts.erl
cd ~/HyperBEAM && rebar3 compile

# Step 8: WAO SDK setup
cd /home/user/wao && npm install --silent 2>/dev/null
cd /home/user/wao/hbsig && npm install --silent 2>/dev/null && npm run build --silent 2>/dev/null
rm -f /home/user/wao/node_modules/hbsig
ln -s ../hbsig/dist /home/user/wao/node_modules/hbsig
mkdir -p /home/user/wao/workspaces
cat > /home/user/wao/.env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF

echo "Installation complete!"
echo "Branch: $(cd ~/HyperBEAM && git branch --show-current)"
echo "Commit: $(cd ~/HyperBEAM && git log --oneline -1)"
```

### Troubleshooting Source Installation

**"Package not found in any repo: cowboy"**
- Cause: rebar.lock forcing hexpm lookup
- Fix: `rm -f ~/HyperBEAM/rebar.lock`

**"Failed to update package pc from repo hexpm"**
- Cause: Port compiler plugin unavailable
- Fix: Use pre-built NIFs from tarball (Step 6)

**Compilation fails with missing headers**
- Cause: _build directory not copied
- Fix: Re-run Step 3 to extract dependencies

**"device_not_loadable" for custom devices**
- Cause: Device not registered in hb_opts.erl
- Fix: Add device to `preloaded_devices` list and recompile

### Differences: Source vs Tarball

| Aspect | Source Install | Tarball Install |
|--------|---------------|-----------------|
| Flexibility | Any branch/commit | Fixed version |
| Git history | Full history | None |
| Custom code | Can modify source | Pre-compiled |
| Dependencies | From tarball _build | Pre-built |
| NIFs | From tarball priv/ | Pre-built |
| Build time | ~60 seconds | ~30 seconds |
