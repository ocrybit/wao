# Vibe-Coded Apps

This folder contains Lua app examples built using natural language prompts with the WAO SDK. Each example demonstrates what's possible when you describe what you want to build in plain English.

> **Note:** Apps are Lua code running on AOS processes. For Erlang devices (HyperBEAM infrastructure), see `/tutorial-devices/`.

## Apps (13 Examples)

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

### 2. Test with HyperBEAM

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

## App Patterns

### State Management
```lua
-- Lazy initialization - state persists between messages
Balances = Balances or {}
Owner = Owner or ao.env.Process.Owner
```

### Handler Pattern
```lua
Handlers.add("ActionName", "ActionName", function(msg)
  -- Validate, execute, reply
  msg.reply({ Data = json.encode(result) })
end)
```

### Access Control
```lua
if msg.From ~= Owner then
  msg.reply({ Tags = { Error = "Unauthorized" } })
  return
end
```

### Error Handling
```lua
if balance < amount then
  msg.reply({
    Tags = { Error = "Insufficient-Balance" },
    Data = json.encode({ have = balance, need = amount })
  })
  return
end
```

## What You Can Build

- **DeFi**: Tokens, DEXs, lending, staking, yield farming
- **NFTs**: Collections, marketplaces, royalties
- **DAOs**: Governance, voting, treasury management
- **Social**: Feeds, messaging, reputation systems
- **Gaming**: Lotteries, auctions, tournaments
- **Infrastructure**: Databases, oracles, bridges

If you can describe it, you can build it!

## Erlang Devices

For HyperBEAM device development (Erlang), see:
- `/tutorial-devices/` - Example device implementations
- `/docs/docs/pages/book/dev*.mdx` - Device development tutorials

---

Built with the WAO SDK
