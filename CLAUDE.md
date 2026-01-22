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
```

**IMPORTANT BEHAVIOR:**
- After completing ANY task, return to this menu
- Ask "What would you like to do next?" with the same options
- If user says "menu" or "options", show this menu again

---

## Option 1: Build a Lua App

**When user selects this, ask:**
```
What kind of Lua app? Examples:
- Counter (simple state)
- Token (fungible token with transfers)
- DEX (AMM with liquidity pools)
- DAO (proposals + voting)
- Game (turn-based, lottery)
- Custom (describe your idea)
```

**Workflow:**
1. Create `claude/apps/[name].lua`
2. Write tests in `claude/apps/tests/hyperbeam.test.js`
3. Run: `HB_TIMEOUT=120 node --test --test-concurrency=1 claude/apps/tests/hyperbeam.test.js`
4. Return to menu

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

NOTE: I'll read claude/docs/llms.txt first for TABM format.
```

**Workflow:**
1. Read `claude/docs/llms.txt` (MANDATORY)
2. Create `claude/devices/dev_[name].erl`
3. Copy to `~/HyperBEAM/src/`
4. Register in `~/HyperBEAM/src/hb_opts.erl`
5. Compile: `cd ~/HyperBEAM && rebar3 compile`
6. Test with HyperBEAM
7. Return to menu

**Reference examples:** `claude/devices/*.erl` (9 devices)

---

## Option 3: Run Tests

**When user selects this, offer:**
```
Which tests?
1. Lua app tests (30 tests) - HyperBEAM + lua@5.3a
2. Erlang device tests (14 tests) - DEX device
3. Both
```

**Commands:**
| Test | Command |
|------|---------|
| Lua apps | `HB_TIMEOUT=120 node --test --test-concurrency=1 claude/apps/tests/hyperbeam.test.js` |
| Erlang DEX | `HB_TIMEOUT=120 node --test --test-concurrency=1 claude/apps/tests/dev-dex.test.js` |
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

**Ask:** "Want me to read any of these? Or return to menu?"

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

### File Structure
```
claude/
├── apps/           # 13 Lua apps + tests
├── devices/        # 9 Erlang devices
├── docs/           # Reference docs
│   ├── llms.txt    # HyperBEAM internals (READ FOR DEVICES)
│   ├── ao-core.md  # Protocol spec
│   └── aos-dev.md  # Dev guide
└── installation/   # Setup tarballs
```

**Ask:** "Ready to build something? Back to menu?"

---

## Quick Commands Reference

| Task | Command |
|------|---------|
| Lua tests | `HB_TIMEOUT=120 node --test --test-concurrency=1 claude/apps/tests/hyperbeam.test.js` |
| Erlang tests | `HB_TIMEOUT=120 node --test --test-concurrency=1 claude/apps/tests/dev-dex.test.js` |
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
cp /home/user/wao/claude/devices/dev_[name].erl ~/HyperBEAM/src/
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
import HyperBEAM from "../../../src/hyperbeam.js"

const hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
const hb = hbeam.hb

// GET request
const info = await hb.g('/~device@1.0/info')

// POST request
const result = await hb.p('/~device@1.0/action', { amount: 100 })

// Cleanup
hbeam.kill()
```
