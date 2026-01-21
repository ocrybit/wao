# Vibe-Coded Examples

This folder contains exhaustive examples of apps and devices built using natural language prompts with the WAO SDK. Each example demonstrates what's possible when you describe what you want to build in plain English.

## Apps (10 Examples)

| App | Description | Vibe Prompt |
|-----|-------------|-------------|
| [Counter](./apps/counter.lua) | Simple counter with history | "Build me a simple counter that can increment, decrement, and reset. Track who made each change." |
| [Token](./apps/token.lua) | Fungible token (ERC-20 style) | "Create a fungible token called VibeToken (VIBE) with transfers, minting, and burning." |
| [Chatroom](./apps/chatroom.lua) | Real-time messaging | "Build a chatroom where users can join rooms, send messages, and see who's online." |
| [Todo](./apps/todo.lua) | Task management | "Create a todo app with priorities, categories, and productivity stats." |
| [Voting DAO](./apps/voting-dao.lua) | Governance system | "Build a DAO where token holders can create proposals and vote." |
| [Auction](./apps/auction.lua) | Auction house | "Create an auction house with English and Dutch auctions, escrow, and auto-settlement." |
| [NFT Collection](./apps/nft-collection.lua) | Non-fungible tokens | "Build an NFT collection with minting, transfers, and metadata." |
| [Staking Pool](./apps/staking-pool.lua) | Stake-to-earn | "Create a staking pool with compound interest and early withdrawal penalties." |
| [KV Store](./apps/kv-store.lua) | On-chain database | "Build a key-value database with namespaces, TTL, and access control." |
| [Social Feed](./apps/social-feed.lua) | Social network | "Build a Twitter-like social feed with posts, follows, likes, and comments." |
| [Lottery](./apps/lottery.lua) | Prize distribution | "Create a lottery with ticket purchasing, random drawing, and prize tiers." |
| [Escrow](./apps/escrow.lua) | Secure trades | "Build an escrow service for peer-to-peer trades with dispute resolution." |
| [AMM DEX](./apps/amm-dex.lua) | Decentralized exchange | "Build a Uniswap-style DEX with liquidity pools and the constant product formula." |

## Devices (4 Examples)

| Device | Description | Vibe Prompt |
|--------|-------------|-------------|
| [Rate Limiter](./devices/rate-limiter.lua) | Message throttling | "Create a device that rate limits incoming messages per address." |
| [Access Control](./devices/access-control.lua) | Role-based permissions | "Create an access control device with roles, permissions, and hierarchy." |
| [Analytics](./devices/analytics.lua) | Usage tracking | "Create an analytics device that tracks all message activity and generates reports." |
| [Logger](./devices/logger.lua) | Debugging/auditing | "Create a logging device with log levels, filtering, and export." |

## How to Use These Examples

### 1. Deploy an App

```javascript
import { AO } from "wao";
import { readFileSync } from "fs";

const ao = await new AO().init(jwk);

// Load the Lua code
const src = readFileSync("./vibe/apps/counter.lua", "utf-8");

// Deploy the process
const { pid, p } = await ao.deploy({
  src_data: src,
  tags: { Name: "My Counter" }
});

// Interact with it
await p.m("Inc", { Amount: "5" });
const result = await p.d("Get");
console.log(result); // { count: 5 }
```

### 2. Test with HyperBEAM (1000x faster)

```javascript
import HyperBEAM from "wao/hyperbeam";
import { readFileSync } from "fs";

const hb = await new HyperBEAM({ reset: true }).ready();

// Spawn a Lua process
const { pid, slot } = await hb.hb.spawnLua();

// Load the app code
const src = readFileSync("./vibe/apps/token.lua", "utf-8");
await hb.hb.eval({ pid, data: src });

// Interact
await hb.hb.message({ pid, tags: { Action: "Transfer", Recipient: "addr...", Quantity: "1000" } });
```

### 3. Combine Apps and Devices

Devices can wrap apps to add functionality:

```lua
-- In your app, use the rate limiter device
local rateLimiter = require("devices/rate-limiter")

-- The rate limiter will automatically throttle incoming messages
-- before they reach your app's handlers
```

## App Patterns Demonstrated

### State Management
All apps demonstrate persistent state that survives across messages:
- `Balances = Balances or {}` - Lazy initialization pattern
- Global variables persist between handler calls

### Handler Patterns
```lua
-- Tag-based routing
Handlers.add("ActionName", "ActionName", function(msg)
  -- Handle message
  msg.reply({ Data = json.encode(result) })
end)

-- Pattern matching
Handlers.add("Transfer", function(msg)
  return msg.Tags.Action == "Transfer" and msg.Tags.Quantity
end, function(msg)
  -- Handle transfer
end)
```

### Message Patterns
```lua
-- Reply to sender
msg.reply({ Data = "response" })

-- Send to another process
ao.send({
  Target = recipient,
  Tags = { Action = "Notify" },
  Data = json.encode(data)
})
```

### Access Control
```lua
-- Owner-only actions
if msg.From ~= Owner then
  msg.reply({ Tags = { Error = "Unauthorized" } })
  return
end
```

### Error Handling
```lua
-- Validate inputs
if not amount or amount <= 0 then
  msg.reply({ Tags = { Error = "Invalid-Amount" }, Data = "Valid amount required" })
  return
end

-- Check conditions
if balance < amount then
  msg.reply({
    Tags = { Error = "Insufficient-Balance" },
    Data = json.encode({ have = balance, need = amount })
  })
  return
end
```

## Device Patterns Demonstrated

### Middleware Pattern
Devices can intercept messages before they reach handlers:
```lua
Handlers.add("Intercept", function(msg)
  return msg.Action ~= nil  -- Match all actions
end, function(msg)
  -- Check rate limit, permissions, etc.
  if not allowed then
    msg.reply({ Tags = { Error = "Blocked" } })
    return  -- Stop processing
  end
  -- Allow message through to next handler
end)
```

### Configuration Pattern
```lua
Config = Config or {
  defaultLimit = 10,
  window = 60
}

-- Owner can update config
Handlers.add("Configure", "Configure", function(msg)
  if msg.From ~= Owner then return end
  if msg.Tags.Limit then Config.defaultLimit = tonumber(msg.Tags.Limit) end
end)
```

### Indexing Pattern
For efficient queries on large datasets:
```lua
LogIndex = LogIndex or {}
LogIndex.level = LogIndex.level or {}
LogIndex.level[entry.levelName] = LogIndex.level[entry.levelName] or {}
table.insert(LogIndex.level[entry.levelName], entryIndex)
```

## What You Can Build

These examples demonstrate that you can build virtually any application:

- **DeFi**: Tokens, DEXs, lending, staking, yield farming
- **NFTs**: Collections, marketplaces, royalties
- **DAOs**: Governance, voting, treasury management
- **Social**: Feeds, messaging, reputation systems
- **Gaming**: Lotteries, auctions, tournaments
- **Infrastructure**: Databases, analytics, access control
- **And more**: If you can describe it, you can build it

## Contributing

Add your own vibe-coded examples! Follow the pattern:

1. Start with a clear "Vibe Prompt" comment describing what you want
2. Implement the Lua handlers
3. Document all actions in the header comment
4. Add to this README

---

Built with ❤️ using the WAO SDK
