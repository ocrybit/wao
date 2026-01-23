# Claude Coding Skill

Build AO apps by describing what you want. No manual coding required.

## Invoke

```
follow CLAUDE.md
```

Then describe what you want:
```
Build me a [your idea] app with HyperBEAM tests.
```

## What You Can Build

| Category | Examples |
|----------|----------|
| **DeFi** | Token, AMM DEX, Staking, Lending |
| **NFTs** | Collections, Marketplace, Royalties |
| **DAOs** | Voting, Proposals, Treasury |
| **Social** | Feed, Chat, Follows |
| **Gaming** | Lottery, Auction, Leaderboards |

## 13 Ready Apps

All in `./apps/`:

| App | Description |
|-----|-------------|
| `counter.lua` | Increment/decrement with history |
| `token.lua` | Fungible token (transfers, mint, burn) |
| `chatroom.lua` | Rooms, members, messages |
| `todo.lua` | Tasks with priorities |
| `voting-dao.lua` | Proposals, voting |
| `nft-collection.lua` | Mint, transfer, metadata |
| `kv-store.lua` | Key-value database |
| `amm-dex.lua` | Liquidity pools, swaps |
| `social-feed.lua` | Posts, follows, likes |
| `lottery.lua` | Tickets, random drawing |
| `escrow.lua` | Secure trades |
| `auction.lua` | English/Dutch auctions |
| `staking-pool.lua` | Stake, earn rewards |

## Testing

```bash
# HyperBEAM (recommended) - native Lua via lua@5.3a
HB_TIMEOUT=120 node --test --test-concurrency=1 claude/apps/tests/hyperbeam.test.js

# In-memory (fast)
npm test -- claude/apps/tests/amm-dex-wasm.test.js
```

## Workflow

1. **Describe** what you want
2. **Claude builds** the Lua code
3. **Tests run** on HyperBEAM
4. **Iterate** until it works
5. **Deploy** to mainnet

## Folder Structure

```
claude/
├── SKILL.md              # This file
├── apps/                 # Lua apps + frontends
│   ├── *.lua
│   ├── *-ui/             # React frontends
│   └── tests/
├── devices/              # Erlang devices
│   ├── SKILL.md
│   └── *.erl
├── docs/                 # Reference documentation
│   ├── llms.txt          # HyperBEAM internals
│   ├── ao-core.md        # Protocol spec
│   └── aos-dev.md        # Development guide
└── installation/         # Setup tarballs
```

## Reference

| Doc | Content |
|-----|---------|
| `./docs/llms.txt` | HyperBEAM internals (MANDATORY for devices) |
| `./docs/ao-core.md` | Protocol specification |
| `./docs/aos-dev.md` | Development guide (4 tracks) |
| `/CLAUDE.md` | Main setup + patterns |
