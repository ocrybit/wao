# AOS Development Guide

This guide describes the recommended development workflow for building AOS (AO Operating System) applications using the WAO SDK.

## Prerequisites

### Environment Setup

```bash
# Clone WAO SDK
git clone https://github.com/ocrybit/wao.git
cd wao
npm install

# Install Erlang 27 (required for HyperBEAM)
asdf plugin add erlang
asdf install erlang 27.3.4.6
asdf global erlang 27.3.4.6

# Install rebar3 (Erlang build tool)
asdf plugin add rebar
asdf install rebar 3.26.0
asdf global rebar 3.26.0

# Configure HyperBEAM environment
cat > .env.hyperbeam << 'EOF'
ARWEAVE_GATEWAY=https://arweave-proxy.ocrybit.workers.dev
HB_REBAR3=false
EOF
```

### Verify Installation

```bash
# Check Erlang
erl -eval 'erlang:display(erlang:system_info(otp_release)), halt().'

# Check Node.js
node --version  # Should be 18+

# Run a quick test
npm test -- vibe/apps/tests/counter.test.js
```

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

---

# Erlang Device Development Guide

This section describes how to build native HyperBEAM devices in Erlang with Vite + React frontends.

## Erlang Development Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                 Erlang Device Development Flow                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   1. WRITE          2. REGISTER         3. TEST & BUILD UI      │
│   ─────────         ─────────           ────────────────        │
│   dev_xxx.erl  ───► hb_opts.erl   ───►  Vitest + React          │
│   (device code)     (device map)        (frontend app)          │
│                                                                  │
│   • HTTP API        • Add to map        • DexClient HTTP        │
│   • State mgmt      • Set ~path         • Component tests       │
│   • Business logic  • Restart HB        • Full UI               │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## When to Use Erlang vs Lua

| Aspect | Lua (AOS) | Erlang (Native Device) |
|--------|-----------|------------------------|
| **Use Case** | Custom app logic | Core HB functionality |
| **State** | Process-scoped | Global via `persistent_term` |
| **Performance** | WASM overhead | Native Erlang speed |
| **HTTP API** | Via scheduler | Direct device routes |
| **Testing** | ArMem in-memory | HyperBEAM + Vitest |
| **Complexity** | Simpler | More control |

## Step 1: Write Your Erlang Device

Create a device module in `hyperbeam/src/`:

```erlang
%% dev_mydevice.erl
-module(dev_mydevice).
-export([info/3, routes/0]).
-export([init/3, get_state/3, update_state/3]).

%% Device info
info(_M1, _M2, _Opts) ->
    #{
        name => <<"My Device">>,
        version => <<"1.0.0">>
    }.

%% HTTP routes (required for ~mydevice@1.0 prefix)
routes() ->
    #{
        <<"init">> => fun init/3,
        <<"get-state">> => fun get_state/3,
        <<"update-state">> => fun update_state/3
    }.

%% Initialize state
init(M1, M2, Opts) ->
    %% Get parameter from request body or query
    User = get_param(<<"user">>, M1, M2, Opts, <<"anonymous">>),

    %% Store state globally with persistent_term
    Key = {?MODULE, state},
    State = #{user => User, count => 0},
    persistent_term:put(Key, State),

    {ok, #{status => <<"initialized">>, user => User}}.

%% Read state
get_state(_M1, _M2, _Opts) ->
    Key = {?MODULE, state},
    State = persistent_term:get(Key, #{count => 0}),
    {ok, State}.

%% Update state
update_state(M1, M2, Opts) ->
    Key = {?MODULE, state},
    OldState = persistent_term:get(Key, #{count => 0}),

    Value = get_param(<<"value">>, M1, M2, Opts, 0),
    NewState = OldState#{count => Value},
    persistent_term:put(Key, NewState),

    {ok, NewState}.

%% Helper to get parameter from body or query
get_param(Name, M1, M2, _Opts, Default) ->
    case maps:get(Name, M1, undefined) of
        undefined -> maps:get(Name, M2, Default);
        V -> V
    end.
```

### Key Patterns

**State Management with `persistent_term`:**
```erlang
%% Store (survives across HTTP requests)
persistent_term:put({?MODULE, my_key}, Value).

%% Retrieve with default
persistent_term:get({?MODULE, my_key}, DefaultValue).
```

**Routes Function:**
```erlang
routes() ->
    #{
        <<"action-name">> => fun handler_function/3
    }.
```

**Handler Signature:**
```erlang
handler_function(M1, M2, Opts) ->
    %% M1 = parsed request body (JSON map)
    %% M2 = query parameters map
    %% Opts = HyperBEAM options
    {ok, ResponseMap}.
```

## Step 2: Register the Device

Add your device to `hyperbeam/src/hb_opts.erl`:

```erlang
%% In the default_devices() function, add:
<<"mydevice@1.0">> => #{
    module => dev_mydevice,
    routes => dev_mydevice:routes(),
    <<"~path">> => <<"~mydevice@1.0">>
}
```

**Restart HyperBEAM** to load the new device:
```bash
# Stop existing HyperBEAM, then restart
HB_TIMEOUT=120 node --test --test-concurrency=1 your-test.js
```

## Step 3: Create JavaScript Client

Create a client class to call your device HTTP API:

```javascript
// MyDeviceClient.js
export default class MyDeviceClient {
  constructor(baseUrl) {
    this.baseUrl = baseUrl
  }

  async init(user) {
    const res = await fetch(`${this.baseUrl}/~mydevice@1.0/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user })
    })
    return res.json()
  }

  async getState() {
    const res = await fetch(`${this.baseUrl}/~mydevice@1.0/get-state`)
    return res.json()
  }

  async updateState(value) {
    const res = await fetch(`${this.baseUrl}/~mydevice@1.0/update-state`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value })
    })
    return res.json()
  }
}
```

**Important**: HyperBEAM lowercases all response keys. `TOKEN-A` becomes `token-a`.

## Step 4: Write Vitest Tests

Create tests in `vibe/apps/your-app/`:

```javascript
// mydevice.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import HyperBEAM from '../../src/hyperbeam.js'
import MyDeviceClient from './MyDeviceClient.js'

describe('My Device', () => {
  let hbeam, client

  beforeAll(async () => {
    // Start HyperBEAM (takes ~5-10s)
    hbeam = await new HyperBEAM({
      reset: true,
      timeout: 120
    }).ready()

    client = new MyDeviceClient(hbeam.url)
  }, 60000)  // 60s timeout for setup

  afterAll(() => {
    if (hbeam) hbeam.kill()
  })

  it('should initialize', async () => {
    const result = await client.init('test-user')
    expect(result.status).toBe('initialized')
    expect(result.user).toBe('test-user')
  })

  it('should get state', async () => {
    const result = await client.getState()
    expect(result.count).toBeDefined()
  })

  it('should update state', async () => {
    await client.updateState(42)
    const result = await client.getState()
    expect(result.count).toBe(42)
  })
})
```

### Run Vitest Tests

```bash
# Run all tests
cd vibe/apps/your-app && npm test

# Run specific test file
npx vitest run mydevice.test.js

# Watch mode
npx vitest
```

## Step 5: Build React Frontend

### Project Setup

```bash
cd vibe/apps
npm create vite@latest mydevice-ui -- --template react
cd mydevice-ui
npm install
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom
```

### Vite Config

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
  },
})
```

### Test Setup

```javascript
// src/test/setup.js
import '@testing-library/jest-dom'
```

### Component Structure

```
mydevice-ui/
├── src/
│   ├── components/
│   │   ├── StatePanel.jsx       # Display/update state
│   │   └── StatePanel.test.jsx  # Component tests
│   ├── lib/
│   │   └── MyDeviceClient.js    # HTTP client
│   ├── test/
│   │   └── setup.js             # Vitest setup
│   ├── App.jsx                  # Main app
│   └── main.jsx                 # Entry point
├── vite.config.js
└── package.json
```

### Example Component

```jsx
// StatePanel.jsx
import { useState, useEffect } from 'react'

export default function StatePanel({ client }) {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(false)

  const loadState = async () => {
    if (!client) return
    const result = await client.getState()
    setState(result)
  }

  useEffect(() => {
    loadState()
  }, [client])

  const handleUpdate = async (value) => {
    setLoading(true)
    try {
      await client.updateState(value)
      await loadState()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div data-testid="state-panel">
      <h2>State</h2>
      {state && (
        <div>
          <p>Count: {state.count}</p>
          <button
            onClick={() => handleUpdate(state.count + 1)}
            disabled={loading}
            data-testid="increment-button"
          >
            Increment
          </button>
        </div>
      )}
    </div>
  )
}
```

### Component Tests

```jsx
// StatePanel.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import StatePanel from './StatePanel'

describe('StatePanel', () => {
  it('renders state panel', () => {
    render(<StatePanel client={null} />)
    expect(screen.getByTestId('state-panel')).toBeInTheDocument()
  })

  it('displays count from client', async () => {
    const mockClient = {
      getState: vi.fn().mockResolvedValue({ count: 42 }),
      updateState: vi.fn().mockResolvedValue({ count: 43 })
    }

    render(<StatePanel client={mockClient} />)

    await waitFor(() => {
      expect(screen.getByText('Count: 42')).toBeInTheDocument()
    })
  })

  it('calls updateState on increment', async () => {
    const mockClient = {
      getState: vi.fn().mockResolvedValue({ count: 10 }),
      updateState: vi.fn().mockResolvedValue({ count: 11 })
    }

    render(<StatePanel client={mockClient} />)

    await waitFor(() => {
      expect(screen.getByTestId('increment-button')).toBeInTheDocument()
    })

    fireEvent.click(screen.getByTestId('increment-button'))

    await waitFor(() => {
      expect(mockClient.updateState).toHaveBeenCalledWith(11)
    })
  })
})
```

### Run Frontend Tests

```bash
# Unit tests (fast, no HyperBEAM)
npm test

# Integration tests with HyperBEAM
npx vitest run integration.test.js
```

## Complete Example: AMM DEX

See the `erlang-dex-ui/` project for a complete example:

- **Erlang device**: `hyperbeam/src/dev_dex.erl`
- **JS Client**: `erlang-dex-ui/src/lib/DexClient.js`
- **React Components**: `erlang-dex-ui/src/components/`
- **Tests**: `erlang-dex-ui/src/components/*.test.jsx`

```bash
# Run all DEX frontend tests (18 tests)
cd vibe/apps/erlang-dex-ui && npm test

# Run HyperBEAM integration tests
cd vibe/apps && npx vitest run dev-dex.test.js
```

## Quick Reference

### Erlang Device Checklist

1. [ ] Create `dev_xxx.erl` in `hyperbeam/src/`
2. [ ] Export `info/3` and `routes/0`
3. [ ] Use `persistent_term` for state
4. [ ] Register in `hb_opts.erl` default_devices()
5. [ ] Set `<<"~path">>` for HTTP routing

### JavaScript Client Checklist

1. [ ] Create client class with fetch calls
2. [ ] Handle lowercase response keys
3. [ ] Use `application/json` content type
4. [ ] Return parsed JSON responses

### Vitest Test Checklist

1. [ ] Setup HyperBEAM in `beforeAll` (60s timeout)
2. [ ] Kill HyperBEAM in `afterAll`
3. [ ] Create client with `hbeam.url`
4. [ ] Test each API endpoint
5. [ ] Mock client for component tests

### Commands

```bash
# Vitest tests (frontend)
cd vibe/apps/your-app && npm test

# HyperBEAM integration tests
HB_TIMEOUT=120 node --test --test-concurrency=1 your-test.js

# Run specific Vitest file
npx vitest run filename.test.js

# Vitest watch mode
npx vitest
```
