# AO Development Guide

This guide describes the 4 development tracks for building on AO using the WAO SDK.

## Development Tracks Overview

| Track | Execution Config | Use Case | Deployment Target |
|-------|-----------------|----------|-------------------|
| **1. Legacynet AOS** | `stack@1.0` + `genesis-wasm@1.0` | Existing legacynet apps | Legacynet |
| **2. Mainnet AOS** | `stack@1.0` + `wasm-64@1.0` | Production mainnet apps | Mainnet |
| **3. HyperAOS** | `lua@5.3a` | Fast native Lua apps | HyperBEAM nodes |
| **4. HyperBEAM Devices** | Native Erlang | Core infrastructure | HyperBEAM nodes |

**Execution Device Patterns:**
- **Track 1 & 2**: Use `execution-device: "stack@1.0"` with `device-stack` array:
  - Legacynet: `device-stack: ["genesis-wasm@1.0", "patch@1.0"]`
  - Mainnet: `device-stack: ["wasm-64@1.0", "patch@1.0"]`
- **Track 3**: Use `execution-device: "lua@5.3a"` directly (no stack wrapper)
- **Track 4**: Native Erlang devices (no execution device)

---

## Prerequisites

### Option A: Use WAO SDK (Recommended for development)

```bash
# Clone WAO SDK
git clone https://github.com/ocrybit/wao.git
cd wao
npm install

# Install Erlang 27 (required for local HyperBEAM)
asdf plugin add erlang
asdf install erlang 27.3.4.6
asdf global erlang 27.3.4.6

# Install rebar3
asdf plugin add rebar
asdf install rebar 3.26.0
asdf global rebar 3.26.0

# Configure HyperBEAM environment
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF
```

### Option B: Install HyperBEAM + WAO separately

Follow the official guide: https://hyperbeam.ar.io/run/running-a-hyperbeam-node.html

Clone the WAO-compatible HyperBEAM:
```bash
git clone -b wao https://github.com/weavedb/HyperBEAM.git
cd HyperBEAM
rebar3 compile
```

Add WAO to your project:
```bash
yarn add wao
# or
npm install wao
```

### Verify Installation

```bash
# Check Erlang
erl -eval 'erlang:display(erlang:system_info(otp_release)), halt().'

# Check Node.js
node --version  # Should be 18+

# Run a quick test (if using WAO SDK clone)
npm test -- vibe/apps/tests/counter.test.js
```

---

# Track 1: Legacynet AOS Apps

Build apps for the AO legacynet using `genesis-wasm@1.0` execution device.

## Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      Track 1: Legacynet AOS Apps                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. TEST LUA           2. TEST HYPERBEAM      3. TEST FRONTEND   4. DEPLOY  │
│  ───────────           ──────────────         ─────────────────  ────────   │
│  In-memory WAO    ───► Integration WAO   ───► E2E with WAO  ───► Legacynet  │
│  (ArMem WASM)          (HyperBEAM)            (WAO Server)                   │
│                                                                              │
│  • Fast iteration      • genesis-wasm@1.0     • Full stack        • Deploy  │
│  • Full WASM exec      • Legacy WASM          • HTTP endpoints    • WAO SDK │
│  • ~14 seconds         • ~25 seconds          • React UI                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Step 1: Test Lua In-Memory with WAO

```javascript
// myapp.test.js
import { describe, it } from 'node:test'
import assert from 'assert'
import { readFileSync } from 'fs'
import { ArMem, connect, acc, scheduler } from 'wao/test'

const luaCode = readFileSync('myapp.lua', 'utf-8')

describe('MyApp (In-Memory)', () => {
  it('should work', async () => {
    const mem = new ArMem()
    const { spawn, message, dryrun } = connect(mem)

    // Use aos2_0_6 for legacynet compatibility
    const pid = await spawn({
      signer: acc[0].signer,
      scheduler,
      module: mem.modules.aos2_0_6,
    })

    await message({
      process: pid,
      signer: acc[0].signer,
      tags: [{ name: 'Action', value: 'Eval' }],
      data: luaCode,
    })

    const res = await dryrun({
      process: pid,
      tags: [{ name: 'Action', value: 'Get' }],
    })

    assert.ok(res.Messages[0].Data)
  })
})
```

```bash
npm test -- myapp.test.js
```

## Step 2: Test Integration with HyperBEAM

```javascript
// myapp.hyperbeam.test.js
import { describe, it, before, after } from 'node:test'
import assert from 'assert'
import HyperBEAM from 'wao/hyperbeam'

describe('MyApp (HyperBEAM)', () => {
  let hbeam, hb

  before(async () => {
    hbeam = await new HyperBEAM({
      reset: true,
      timeout: 120,
    }).ready()
    hb = hbeam.hb
  })

  after(() => hbeam?.kill())

  it('should spawn and execute', async () => {
    // Legacynet: stack@1.0 with genesis-wasm@1.0 in device-stack
    const tags = {
      type: 'Process',
      device: 'process@1.0',
      'execution-device': 'stack@1.0',
      'device-stack': ['genesis-wasm@1.0', 'patch@1.0'],
      'push-device': 'push@1.0',
      'patch-from': '/results/outbox',
      scheduler: hb.addr,
    }
    // ... test logic
  })
})
```

```bash
HB_TIMEOUT=120 node --test --test-concurrency=1 myapp.hyperbeam.test.js
```

## Step 3: Test Frontend E2E with WAO Server

```javascript
// myapp.e2e.test.js
import { describe, it, beforeAll, afterAll } from 'vitest'
import { ArMem, connect, acc, scheduler } from 'wao/test'
import Server from 'wao/server'

describe('MyApp E2E', () => {
  let server, mem, pid

  beforeAll(async () => {
    mem = new ArMem()
    const { spawn, message } = connect(mem)

    // Start WAO Server with ArMem backend
    server = new Server({ port: 4000, aoconnect: mem, log: false })

    pid = await spawn({
      signer: acc[0].signer,
      scheduler,
      module: mem.modules.aos2_0_6,
    })
  }, 60000)

  afterAll(() => server?.end())

  it('should respond to HTTP', async () => {
    // CU endpoint at port+4
    const res = await fetch('http://localhost:4004/status')
    expect(res.ok).toBe(true)
  })
})
```

## Step 4: Deploy to Mainnet

```javascript
import { AO } from 'wao'

const ao = new AO()

// Deploy process
const pid = await ao.spawn({
  module: 'YOUR_MODULE_ID',  // aos2_0_6 module on mainnet
  scheduler: 'SCHEDULER_ADDRESS',
})

// Send messages
await ao.message({
  process: pid,
  action: 'YourAction',
  data: '...',
})
```

---

# Track 2: Mainnet AOS Apps

Build production apps for AO mainnet using `wasm-64@1.0` execution device.

## Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Track 2: Mainnet AOS Apps                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. TEST LUA           2. TEST HYPERBEAM      3. TEST FRONTEND   4. DEPLOY  │
│  ───────────           ──────────────         ─────────────────  ────────   │
│  In-memory WAO    ───► In-memory HB WAO  ───► Local HB WAO  ───► Mainnet    │
│  (ArMem WASM)          (wasm-64@1.0)          (WAO Server)                   │
│                                                                              │
│  • Fast iteration      • wasm-64@1.0          • Production-like   • Deploy  │
│  • aos2_0_6            • Cached images        • HTTP endpoints    • WAO SDK │
│  • ~14 seconds         • ~30 seconds          • React UI                    │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Step 1: Test Lua In-Memory with WAO

Same as Track 1 - use ArMem with `aos2_0_6` module.

## Step 2: Test with In-Memory HyperBEAM

```javascript
import HyperBEAM from 'wao/hyperbeam'

const hbeam = await new HyperBEAM({
  reset: true,
  timeout: 120,
}).ready()

// Mainnet: stack@1.0 with wasm-64@1.0 in device-stack
const tags = {
  type: 'Process',
  device: 'process@1.0',
  'execution-device': 'stack@1.0',
  'device-stack': ['wasm-64@1.0', 'patch@1.0'],
  'push-device': 'push@1.0',
  'patch-from': '/results/outbox',
  scheduler: hbeam.hb.addr,
}
```

## Step 3: Test Frontend E2E with Local HyperBEAM

```javascript
import HyperBEAM from 'wao/hyperbeam'
import MyClient from './lib/MyClient'

describe('E2E Tests', () => {
  let hbeam, client

  beforeAll(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
    client = new MyClient(hbeam.url)
  }, 120000)

  afterAll(() => hbeam?.kill())

  it('should work end-to-end', async () => {
    // Test your frontend against local HyperBEAM
  })
})
```

## Step 4: Deploy to Mainnet

Same as Track 1 - use WAO SDK's `AO` class.

---

# Track 3: HyperAOS Apps

Build fast Lua apps for HyperBEAM nodes using `lua@5.3a` execution device (native luerl).

## Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         Track 3: HyperAOS Apps                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. TEST LUA & INTEGRATION           2. TEST FRONTEND        3. DEPLOY      │
│  ────────────────────────            ──────────────          ────────       │
│  In-memory HyperBEAM WAO        ───► Local HyperBEAM    ───► HyperBEAM      │
│  (lua@5.3a)                          (WAO + Vitest)          Nodes          │
│                                                                              │
│  • lua@5.3a device                   • E2E tests             • Deploy to    │
│  • No WASM overhead                  • React components      • HB nodes     │
│  • ~10 seconds                       • HTTP client                          │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Step 1: Test Lua & Integration with HyperBEAM

```javascript
import { describe, it, before, after } from 'node:test'
import assert from 'assert'
import { readFileSync } from 'fs'
import HyperBEAM from 'wao/hyperbeam'

const luaCode = readFileSync('myapp.lua', 'utf-8')

describe('HyperAOS App', () => {
  let hbeam, hb, pid

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
    hb = hbeam.hb

    // Get Lua module (cached)
    const moduleId = await hb.getLua()

    // Spawn with lua@5.3a (native luerl)
    const tags = {
      type: 'Process',
      device: 'process@1.0',
      'execution-device': 'lua@5.3a',
      module: moduleId,
      scheduler: hb.addr,
      data: luaCode,
    }

    const committed = await hb.commit(tags, { path: false })
    const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(committed),
    })
    pid = response.headers.get('process')
  })

  after(() => hbeam?.kill())

  it('should execute Lua natively', async () => {
    // Schedule message
    const msgTags = { type: 'Message', target: pid, Action: 'Get' }
    const committed = await hb.commit(msgTags, { path: false })
    const res = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(committed),
    })
    const slot = res.headers.get('slot')

    // Compute
    const result = await hb.g(`/${pid}~process@1.0/compute`, { slot: parseInt(slot) })
    assert.ok(result)
  })
})
```

```bash
HB_TIMEOUT=120 node --test --test-concurrency=1 myapp.hyperaos.test.js
```

## Step 2: Test Frontend E2E with Local HyperBEAM

```javascript
// Using Vitest for frontend tests
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import HyperBEAM from 'wao/hyperbeam'
import MyClient from './lib/MyClient'

describe('HyperAOS Frontend', () => {
  let hbeam, client

  beforeAll(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
    client = new MyClient(hbeam.url)
  }, 120000)

  afterAll(() => hbeam?.kill())

  it('should work with frontend', async () => {
    const result = await client.getData()
    expect(result).toBeDefined()
  })
})
```

## Step 3: Deploy to HyperBEAM Nodes

Deploy your Lua app to production HyperBEAM nodes.

```javascript
import { HB } from 'wao'

const hb = new HB({ url: 'https://your-hyperbeam-node.com' })

// Spawn process
const tags = {
  type: 'Process',
  device: 'process@1.0',
  'execution-device': 'lua@5.3a',
  module: 'YOUR_LUA_MODULE_ID',
  scheduler: 'SCHEDULER_ADDRESS',
  data: luaCode,
}

const committed = await hb.commit(tags, { path: false })
const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(committed),
})
const pid = response.headers.get('process')
```

---

# Track 4: HyperBEAM Devices

Build native Erlang devices that extend HyperBEAM functionality.

## Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Track 4: HyperBEAM Devices                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. TEST DEVICE        2. TEST INTEGRATION    3. TEST FRONTEND   4. DEPLOY  │
│  ─────────────         ────────────────       ─────────────────  ────────   │
│  EUnit in HB      ───► In-memory HB WAO  ───► Local HB WAO  ───► HB Nodes   │
│  (Erlang tests)        (HTTP API)             (Vitest + React)              │
│                                                                              │
│  • Unit tests          • WAO SDK tests        • Component tests   • Deploy  │
│  • Fast feedback       • HTTP client          • E2E tests         • Custom  │
│  • Erlang native       • ~10 seconds          • Vitest            • HB node │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Step 1: Test Device with EUnit

```erlang
%% dev_mydevice_tests.erl
-module(dev_mydevice_tests).
-include_lib("eunit/include/eunit.hrl").

basic_test() ->
    %% Test your device logic
    {ok, Result} = dev_mydevice:get(#{}, #{}, #{}),
    ?assertEqual(0, maps:get(value, Result)).

state_test() ->
    %% Test state management
    dev_mydevice:set(#{<<"value">> => 42}, #{}, #{}),
    {ok, Result} = dev_mydevice:get(#{}, #{}, #{}),
    ?assertEqual(42, maps:get(value, Result)).
```

Run EUnit tests:
```bash
cd HyperBEAM
rebar3 eunit --module=dev_mydevice_tests
```

## Step 2: Test Integration with WAO

```javascript
// mydevice.integration.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import HyperBEAM from 'wao/hyperbeam'

describe('MyDevice Integration', () => {
  let hbeam, hb

  beforeAll(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
    hb = hbeam.hb
  }, 120000)

  afterAll(() => hbeam?.kill())

  it('should respond to HTTP API', async () => {
    const res = await fetch(`${hbeam.url}/~mydevice@1.0/get`)
    const data = await res.json()
    expect(data.value).toBeDefined()
  })

  it('should update state', async () => {
    await fetch(`${hbeam.url}/~mydevice@1.0/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 42 })
    })

    const res = await fetch(`${hbeam.url}/~mydevice@1.0/get`)
    const data = await res.json()
    expect(data.value).toBe(42)
  })
})
```

## Step 3: Test Frontend E2E with Local HyperBEAM

```javascript
// mydevice-ui/src/test/e2e.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import HyperBEAM from 'wao/hyperbeam'
import MyDeviceClient from '../lib/MyDeviceClient'

describe('MyDevice Frontend E2E', () => {
  let hbeam, client

  beforeAll(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
    client = new MyDeviceClient(hbeam.url)
  }, 120000)

  afterAll(() => hbeam?.kill())

  it('should work end-to-end', async () => {
    await client.set(100)
    const result = await client.get()
    expect(result.value).toBe(100)
  })
})
```

### Client Class Pattern

```javascript
// MyDeviceClient.js
export default class MyDeviceClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl
  }

  async get() {
    const res = await fetch(`${this.baseUrl}/~mydevice@1.0/get`)
    return res.json()  // Note: HyperBEAM lowercases response keys
  }

  async set(value) {
    const res = await fetch(`${this.baseUrl}/~mydevice@1.0/set`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    })
    return res.json()
  }
}
```

## Step 4: Deploy to HyperBEAM Nodes

1. Copy your device to HyperBEAM source:
```bash
cp dev_mydevice.erl ~/HyperBEAM/src/
```

2. Register in `hb_opts.erl`:
```erlang
<<"mydevice@1.0">> => #{
    module => dev_mydevice,
    routes => dev_mydevice:routes(),
    <<"~path">> => <<"~mydevice@1.0">>
}
```

3. Recompile and restart:
```bash
cd ~/HyperBEAM
rebar3 compile
# Restart your HyperBEAM node
```

---

## Erlang Device Development Reference

### Device Module Structure

```erlang
-module(dev_mydevice).
-export([info/3, routes/0]).
-export([get/3, set/3]).

info(_M1, _M2, _Opts) ->
    #{name => <<"mydevice">>, version => <<"1.0">>}.

routes() ->
    #{
        <<"get">> => fun get/3,
        <<"set">> => fun set/3
    }.

get(_M1, _M2, _Opts) ->
    Value = persistent_term:get({?MODULE, value}, 0),
    {ok, #{value => Value}}.

set(M1, _M2, _Opts) ->
    Value = maps:get(<<"value">>, M1, 0),
    persistent_term:put({?MODULE, value}, Value),
    {ok, #{value => Value}}.
```

### State Management

```erlang
%% Store state (survives HTTP requests)
persistent_term:put({?MODULE, key}, Value).

%% Retrieve with default
persistent_term:get({?MODULE, key}, DefaultValue).
```

### Handler Signature

```erlang
handler(M1, M2, Opts) ->
    %% M1 = parsed request body (JSON map)
    %% M2 = query parameters map
    %% Opts = HyperBEAM options
    {ok, ResponseMap}.
```

---

## Quick Reference

### Test Commands by Track

```bash
# Track 1 & 2: Lua in-memory
npm test -- myapp.test.js

# Track 1 & 2: HyperBEAM integration
HB_TIMEOUT=120 node --test --test-concurrency=1 myapp.hyperbeam.test.js

# Track 3: HyperAOS
HB_TIMEOUT=120 node --test --test-concurrency=1 myapp.hyperaos.test.js

# Track 4: Erlang EUnit
cd HyperBEAM && rebar3 eunit --module=dev_mydevice_tests

# Track 4: Integration
npx vitest run mydevice.integration.test.js

# All tracks: Frontend E2E
cd myapp-ui && npm test
```

### WAO Imports

```javascript
// In-memory testing
import { ArMem, connect, acc, scheduler } from 'wao/test'

// HyperBEAM testing
import HyperBEAM from 'wao/hyperbeam'

// WAO Server (for frontend E2E)
import Server from 'wao/server'

// Production client
import { AO, HB } from 'wao'
```

### Execution Devices

| Config | Runtime | Use Case |
|--------|---------|----------|
| `stack@1.0` + `genesis-wasm@1.0` | WASM | Legacynet AOS (Track 1) |
| `stack@1.0` + `wasm-64@1.0` | WASM | Mainnet AOS (Track 2) |
| `lua@5.3a` | luerl | HyperAOS - fast native (Track 3) |
| Native Erlang | BEAM | HyperBEAM devices (Track 4) |

### Key Gotchas

1. **HyperBEAM lowercases response keys**: `TOKEN-A` → `token-a`
2. **aos2_0_6 lowercases custom tags**: `TokenA` → `Tokena`
3. **Kill stuck HyperBEAM**: `pkill -9 -f beam.smp && pkill -9 -f epmd`
4. **Use `persistent_term` for Erlang device state** (not `hb_private`)

---

## Resources

| Resource | Description |
|----------|-------------|
| [HyperBEAM Docs](https://hyperbeam.ar.io/run/running-a-hyperbeam-node.html) | Official HyperBEAM setup guide |
| [HyperBEAM WAO](https://github.com/weavedb/HyperBEAM/tree/wao) | WAO-compatible HyperBEAM fork |
| `llms.txt` | HyperBEAM LLM reference (architecture, patterns) |
| `ao-core.md` | AO protocol specification (TypeScript types) |
| `vibe-engineer.mdx` | Quick start guide (AI-assisted & manual) |
