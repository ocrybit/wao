# Lua App Development

Build stateful AO processes with Lua.

## Quick Start

```bash
# Copy template
cp counter.lua myapp.lua

# Add tests to tests/hyperbeam.test.js

# Run tests
HB_TIMEOUT=120 node --test --test-concurrency=1 claude/apps/tests/hyperbeam.test.js
```

## Handler Pattern

```lua
-- State persists between messages
Count = Count or 0
Balances = Balances or {}
Owner = Owner or ao.env.Process.Owner

-- Simple handler
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

-- Query with JSON
Handlers.add("GetState", "GetState", function(msg)
  msg.reply({ Data = json.encode({
    count = Count,
    balance = Balances[msg.From] or 0
  }) })
end)
```

## Tag Naming (aos2_0_6)

aos2_0_6 lowercases custom tags. This is expected.

| Tag Type | JavaScript | Lua |
|----------|------------|-----|
| Custom | `{ name: "Tokena", value: "X" }` | `msg.Tags.Tokena` |
| Reserved | `{ name: "Action", value: "Swap" }` | `msg.Tags.Action` |

Reserved (stay capitalized): `Action`, `Data`, `From`, `Target`, `Owner`, `Module`, `Scheduler`

## Testing

### HyperBEAM (Recommended)

Native Lua via `lua@5.3a`. No external CU needed.

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
  data: luaCode,
}
const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(await hb.commit(tags, { path: false })),
})
const pid = response.headers.get("process")

// Cleanup
hbeam.kill()
```

### ArMem (In-Memory WASM)

```javascript
import { ArMem, connect, acc, scheduler } from "../../../src/test.js"

const mem = new ArMem()
const { spawn, message, dryrun } = connect(mem)

const pid = await spawn({
  signer: acc[0].signer,
  scheduler,
  module: mem.modules.aos2_0_6,
})

// Load Lua
await message({
  process: pid,
  signer: acc[0].signer,
  tags: [{ name: "Action", value: "Eval" }],
  data: luaCode,
})

// Query
const res = await dryrun({
  process: pid,
  tags: [{ name: "Action", value: "Get" }],
})
```

## Apps in This Folder

| File | Description |
|------|-------------|
| `counter.lua` | Simple counter |
| `token.lua` | Fungible token |
| `chatroom.lua` | Chat rooms |
| `todo.lua` | Task manager |
| `voting-dao.lua` | DAO governance |
| `nft-collection.lua` | NFT collection |
| `kv-store.lua` | Key-value store |
| `amm-dex.lua` | AMM DEX |
| `social-feed.lua` | Social network |
| `lottery.lua` | Lottery |
| `escrow.lua` | Escrow service |
| `auction.lua` | Auction house |
| `staking-pool.lua` | Staking pool |

## Frontends

| Folder | Description |
|--------|-------------|
| `amm-dex-ui/` | Lua DEX React frontend |
| `erlang-dex-ui/` | Erlang DEX React frontend |
