# Vibe Code Testing Report

## Overview

This report covers testing of both:
- **Lua Apps** - AOS processes running on HyperBEAM via native lua@5.3a
- **Erlang Devices** - HyperBEAM infrastructure components

## Summary

| Category | Environment | Status | Tests |
|----------|-------------|--------|-------|
| **Lua Apps** | HyperBEAM (lua@5.3a) | PASS | 30/30 |
| **Erlang Devices** | Eunit | READY | 8 devices |
| **Erlang Devices** | WAO/HyperBEAM | READY | Tests written |

---

## Part 1: Lua Apps (HyperBEAM Tests)

### Test Results

All 30 tests pass using HyperBEAM with native lua@5.3a execution device.

**Run time:** ~45 seconds (includes HyperBEAM startup)

#### Server Status (3 tests)

| Test | Status |
|------|--------|
| HyperBEAM running | PASS |
| lua@5.3a available | PASS |
| Lua module cached | PASS |

#### Basic Lua Process (4 tests)

| Test | Status |
|------|--------|
| Spawn Lua process | PASS |
| Schedule to process | PASS |
| Get process info | PASS |
| Get slot assignments | PASS |

#### Lua Apps (9 apps, 23 tests)

| App | Tests | Status |
|-----|-------|--------|
| Counter | 4 | PASS |
| Token | 3 | PASS |
| Todo | 3 | PASS |
| KV Store | 3 | PASS |
| Chatroom | 2 | PASS |
| Voting DAO | 2 | PASS |
| NFT Collection | 2 | PASS |
| AMM DEX | 2 | PASS |
| Social Feed | 2 | PASS |

### Running Lua App Tests

```bash
HB_TIMEOUT=120 node --test --test-concurrency=1 vibe/apps/tests/hyperbeam.test.js
```

### Architecture

The tests use **native lua@5.3a** execution device which runs Lua code directly in HyperBEAM via luerl (Lua implemented in Erlang). **NO external CU required.**

```
┌──────────────────┐    ┌─────────────────────────────────┐
│   Test Suite     │───▶│   HyperBEAM                     │
│                  │    │   ├── lua@5.3a (luerl)          │
│                  │    │   ├── process@1.0               │
│                  │    │   └── scheduler@1.0             │
└──────────────────┘    └─────────────────────────────────┘
```

Key components:
- **lua@5.3a** - Native Lua execution device using luerl (Lua in Erlang)
- **hyper-aos.js** - Cached Lua runtime module (base64 encoded)
- **process@1.0** - Process lifecycle management
- **scheduler@1.0** - Message scheduling and slot management

### Test Pattern

```javascript
// Spawn native Lua process
const { pid } = await spawnLuaProcess(hb, luaCode)

// Schedule message
const { slot } = await scheduleLuaMessage(hb, pid, { action: "Inc" })

// Compute state at slot
const result = await computeLua(hb, pid, slot)
```

### Helper Functions

```javascript
// Spawn Lua process with code embedded
async function spawnLuaProcess(hb, luaCode) {
  const moduleId = await hb.getLua()  // Cache Lua runtime
  const tags = {
    "execution-device": "lua@5.3a",
    module: moduleId,
    "push-device": "push@1.0",
    // ... other tags
  }
  if (luaCode) tags.data = luaCode
  // POST to scheduler
}

// Schedule message to process
async function scheduleLuaMessage(hb, pid, { action, data, tags }) {
  // POST committed message to scheduler
}

// Compute process state at slot
async function computeLua(hb, pid, slot) {
  return await hb.g(`/${pid}~process@1.0/compute`, { slot })
}
```

### lua@5.3a vs genesis-wasm

| Feature | lua@5.3a | genesis-wasm@1.0 |
|---------|----------|------------------|
| Execution | In-process (luerl) | External CU server |
| CU Required | No | Yes |
| Speed | Fast | Slower (network) |
| Setup | Simple | Requires CU start |
| Memory | Erlang VM | WASM runtime |

---

## Part 2: Erlang Devices

### Vibe-Coded Devices (3 new)

Three new devices were vibe-coded with eunit tests:

#### 1. Counter Device (`dev_counter.erl`)

**Prompt:** "Build a counter device that can increment, decrement, and reset. Track who made each change with history."

**API:**
| Endpoint | Description |
|----------|-------------|
| `GET /~counter@1.0/get` | Get current count |
| `POST /~counter@1.0/inc` | Increment (optional `amount`) |
| `POST /~counter@1.0/dec` | Decrement (optional `amount`) |
| `POST /~counter@1.0/reset` | Reset to zero |
| `GET /~counter@1.0/history` | Get change history |

**Eunit Tests:** 7 tests (info, initial_count, inc, dec, reset, history, resolve)

#### 2. Rate Limiter Device (`dev_ratelimiter.erl`)

**Prompt:** "Create a token bucket rate limiter for API protection with configurable limits."

**API:**
| Endpoint | Description |
|----------|-------------|
| `POST /~ratelimiter@1.0/check` | Check if allowed |
| `POST /~ratelimiter@1.0/consume` | Consume tokens |
| `GET /~ratelimiter@1.0/status` | Bucket status |
| `POST /~ratelimiter@1.0/configure` | Configure limits |
| `POST /~ratelimiter@1.0/reset` | Reset bucket |

**Eunit Tests:** 7 tests (info, check_allowed, consume, rate_limit, reset, status, resolve)

#### 3. Analytics Device (`dev_analytics.erl`)

**Prompt:** "Build an analytics device to track events, record metrics, and provide statistics."

**API:**
| Endpoint | Description |
|----------|-------------|
| `POST /~analytics@1.0/track` | Track event |
| `POST /~analytics@1.0/metric` | Record metric |
| `GET /~analytics@1.0/events` | Get events |
| `GET /~analytics@1.0/metrics` | Get metrics |
| `GET /~analytics@1.0/stats` | Get statistics |
| `POST /~analytics@1.0/clear` | Clear data |

**Eunit Tests:** 7 tests (info, track, metric, events, stats, clear, resolve)

### Existing Devices (5)

| Device | Description |
|--------|-------------|
| `dev_kv.erl` | Key-value store |
| `dev_processor.erl` | Data encoding & signing |
| `dev_gateway.erl` | Authenticated API gateway |
| `dev_dataplatform.erl` | Arweave storage |
| `dev_aojs.erl` | JavaScript smart contracts |

### Running Device Tests

#### Eunit (after copying to HyperBEAM)
```bash
cd HyperBEAM
rebar3 eunit --module=dev_counter
rebar3 eunit --module=dev_ratelimiter
rebar3 eunit --module=dev_analytics
```

#### WAO Integration
```bash
node --test vibe/devices/tests/device-wao.test.js
```

---

## Device Patterns

### Erlang Device Structure
```erlang
-module(dev_example).
-export([info/3, operation/3]).

info(_M1, _M2, _Opts) ->
    {ok, #{<<"name">> => <<"example">>, <<"version">> => <<"1.0">>}}.

operation(M1, M2, Opts) ->
    Value = maps:get(<<"key">>, M2, default),
    {ok, #{<<"result">> => Value}}.
```

### Eunit Test Pattern
```erlang
-ifdef(TEST).
-include_lib("eunit/include/eunit.hrl").

setup_test_env() ->
    application:ensure_all_started(hb),
    Store = hb_test_utils:test_store(hb_store_fs),
    #{store => [Store]}.

info_test() ->
    {ok, Info} = info(#{}, #{}, #{}),
    ?assertEqual(<<"example">>, maps:get(<<"name">>, Info)).
-endif.
```

### WAO Test Pattern
```javascript
describe("Device (WAO)", () => {
  let hbeam, hb

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true }).ready()
    hb = hbeam.hb
  })

  after(async () => hbeam.kill())

  it("should return info", async () => {
    const info = await hb.g("/~device@1.0/info")
    assert.equal(info?.name, "device")
  })
})
```

---

## File Locations

```
wao/
├── vibe/
│   ├── apps/                    # 13 Lua apps
│   │   ├── counter.lua
│   │   ├── token.lua
│   │   └── ...
│   └── tests/
│       └── hyperbeam.test.js    # HyperBEAM tests (30 tests)
│
│   ├── devices/                 # 8 Erlang devices
│   │   ├── dev_kv.erl          # Existing
│   │   ├── dev_processor.erl   # Existing
│   │   ├── dev_gateway.erl     # Existing
│   │   ├── dev_dataplatform.erl # Existing
│   │   ├── dev_aojs.erl        # Existing
│   │   ├── dev_counter.erl     # Vibe-coded
│   │   ├── dev_ratelimiter.erl # Vibe-coded
│   │   ├── dev_analytics.erl   # Vibe-coded
│   │   └── tests/
│   │       └── device-wao.test.js # WAO integration tests
│
└── lua-report.md               # This report
```

---

## Recommendations

1. **Lua Apps**: Use native lua@5.3a for simple Lua execution (no CU needed)
2. **Complex WASM**: Use genesis-wasm@1.0 if you need full AOS WASM runtime
3. **Erlang Devices**: Use eunit for unit tests, WAO for integration tests
4. **Avoid AOS Globals**: Use prefixed names (e.g., `TokenName` not `Name`)
5. **Response Format**: Lua apps use `msg.reply({ Data = json.encode(...) })`
6. **Device Installation**: Copy to HyperBEAM src and add to `hb_opts.erl`
