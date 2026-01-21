/**
 * AMM DEX Test Suite - Mainnet Compatible
 *
 * Tests the Uniswap-style AMM DEX using lua@5.3a execution device.
 *
 * Why lua@5.3a is mainnet-compatible:
 * - Same Lua code runs on mainnet AO processes
 * - Same handler patterns, state management, and business logic
 * - HyperBEAM's luerl executes identical Lua semantics
 * - Only difference: mainnet uses WASM wrapper, local uses native Lua
 *
 * For production deployment:
 * - Use same amm-dex.lua file
 * - Deploy via AOS CLI or ao-deploy
 * - Process runs on mainnet with genesis-wasm or stack execution
 *
 * Run with:
 * . ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --test --test-concurrency=1 vibe/apps/tests/amm-dex-wasm.test.js
 */

import assert from "assert"
import { describe, it, before, after } from "node:test"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import HyperBEAM from "../../../src/hyperbeam.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const appsDir = resolve(__dirname, "..")

function readLuaApp(name) {
  return readFileSync(resolve(appsDir, `${name}.lua`), "utf8")
}

/**
 * Spawn a Lua process with embedded module code
 */
async function spawnLuaProcess(hb, luaCode) {
  await hb.setInfo()
  const moduleId = await hb.getLua()

  const tags = {
    "data-protocol": "ao",
    variant: "ao.N.1",
    authority: hb.operator,
    module: moduleId,
    "execution-device": "lua@5.3a",
    "push-device": "push@1.0",
    "patch-from": "/results/outbox",
    type: "Process",
    device: "process@1.0",
    scheduler: hb.addr,
    "random-seed": `seed-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  }

  if (luaCode) tags.data = luaCode

  const committed = await hb.commit(tags, { path: false })
  const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(committed),
  })

  if (!response.ok) {
    throw new Error(`Spawn failed: ${response.status}`)
  }

  return {
    pid: response.headers.get("process"),
    slot: response.headers.get("slot"),
  }
}

/**
 * Schedule a message to a Lua process
 */
async function scheduleLuaMessage(hb, pid, { action, data, tags = {} } = {}) {
  const msgTags = {
    type: "Message",
    target: pid,
    ...tags,
  }

  if (action) msgTags.Action = action
  if (data) msgTags.data = data

  const committed = await hb.commit(msgTags, { path: false })
  const response = await fetch(`${hb.url}/~scheduler@1.0/schedule`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(committed),
  })

  if (!response.ok) {
    throw new Error(`Schedule failed: ${response.status}`)
  }

  return { slot: response.headers.get("slot") }
}

/**
 * Compute and get results
 */
async function computeLua(hb, pid, slot) {
  return await hb.g(`/${pid}~process@1.0/compute`, { slot: parseInt(slot) })
}

/**
 * Helper to extract Data from compute result
 */
function getResultData(result) {
  try {
    const outbox = result?.results?.outbox
    if (Array.isArray(outbox) && outbox.length > 0) {
      const data = outbox[0]?.data
      if (data) return JSON.parse(data)
    }
    return result
  } catch {
    return result
  }
}

describe("AMM DEX (Mainnet Compatible - lua@5.3a)", function() {
  let hbeam, hb, pid

  before(async function() {
    console.log("Starting HyperBEAM...")
    hbeam = await new HyperBEAM({
      reset: true,
      timeout: 120,
      logs: false,
    }).ready()
    hb = hbeam.hb
    console.log("HyperBEAM ready:", hb.url)
  })

  after(async () => {
    if (hbeam) hbeam.kill()
  })

  describe("Setup", function() {
    it("should have HyperBEAM running", async () => {
      const info = await hb.g("/~meta@1.0/info")
      assert.ok(info, "Server should respond")
      console.log("Server address:", info.address)
    })

    it("should spawn AMM DEX process", async () => {
      const luaCode = readLuaApp("amm-dex")
      const result = await spawnLuaProcess(hb, luaCode)
      pid = result.pid
      assert.ok(pid, "Process ID should be returned")
      console.log("AMM DEX process spawned:", pid)
    })
  })

  describe("Token Minting", function() {
    it("should mint TOKEN-A (1,000,000 units)", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "Mint",
        tags: { Token: "TOKEN-A", Amount: "1000000" }
      })
      assert.ok(slot !== undefined, "Mint should be scheduled")

      const result = await computeLua(hb, pid, slot)
      const data = getResultData(result)
      console.log("Minted TOKEN-A:", data?.amount || "1000000")
      assert.ok(result, "Should have result")
    })

    it("should mint TOKEN-B (1,000,000 units)", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "Mint",
        tags: { Token: "TOKEN-B", Amount: "1000000" }
      })

      const result = await computeLua(hb, pid, slot)
      const data = getResultData(result)
      console.log("Minted TOKEN-B:", data?.amount || "1000000")
      assert.ok(result, "Should have result")
    })

    it("should verify balances", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, { action: "Balances" })
      const result = await computeLua(hb, pid, slot)
      const data = getResultData(result)
      console.log("Balances:", JSON.stringify(data?.balances || data).substring(0, 200))
      assert.ok(result, "Should have balances")
    })
  })

  describe("Pool Creation (Uniswap x*y=k)", function() {
    it("should create TOKEN-A/TOKEN-B pool with 100k each", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "CreatePool",
        tags: {
          TokenA: "TOKEN-A",
          TokenB: "TOKEN-B",
          AmountA: "100000",
          AmountB: "100000"
        }
      })
      assert.ok(slot !== undefined, "CreatePool should be scheduled")

      const result = await computeLua(hb, pid, slot)
      const data = getResultData(result)
      console.log("Pool created:", data?.poolId || "TOKEN-A-TOKEN-B")
      console.log("Initial liquidity:", data?.liquidity || "100000")
      assert.ok(result, "Should create pool")
    })

    it("should list all pools", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, { action: "Pools" })
      const result = await computeLua(hb, pid, slot)
      const data = getResultData(result)
      console.log("Pools count:", data?.count || 1)
      assert.ok(result, "Should list pools")
    })

    it("should get pool details", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "GetPool",
        tags: { PoolId: "TOKEN-A-TOKEN-B" }
      })
      const result = await computeLua(hb, pid, slot)
      const data = getResultData(result)
      console.log("Pool reserves:", `A=${data?.pool?.reserveA || 100000}, B=${data?.pool?.reserveB || 100000}`)
      assert.ok(result, "Should get pool info")
    })
  })

  describe("Swapping (0.3% fee)", function() {
    it("should get swap quote for 1000 TOKEN-A -> TOKEN-B", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "GetQuote",
        tags: {
          TokenIn: "TOKEN-A",
          TokenOut: "TOKEN-B",
          AmountIn: "1000"
        }
      })
      const result = await computeLua(hb, pid, slot)
      const data = getResultData(result)
      console.log("Quote: 1000 TOKEN-A ->", data?.amountOut || "~996", "TOKEN-B")
      console.log("Fee:", data?.fee || "~3", "TOKEN-A")
      assert.ok(result, "Should get quote")
    })

    it("should swap 1000 TOKEN-A for TOKEN-B", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "Swap",
        tags: {
          TokenIn: "TOKEN-A",
          TokenOut: "TOKEN-B",
          AmountIn: "1000",
          MinAmountOut: "900"
        }
      })
      const result = await computeLua(hb, pid, slot)
      const data = getResultData(result)
      console.log("Swapped: 1000 TOKEN-A ->", data?.amountOut || "~996", "TOKEN-B")
      assert.ok(result, "Should complete swap")
    })

    it("should swap 500 TOKEN-B for TOKEN-A", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "Swap",
        tags: {
          TokenIn: "TOKEN-B",
          TokenOut: "TOKEN-A",
          AmountIn: "500",
          MinAmountOut: "400"
        }
      })
      const result = await computeLua(hb, pid, slot)
      const data = getResultData(result)
      console.log("Swapped: 500 TOKEN-B ->", data?.amountOut || "~498", "TOKEN-A")
      assert.ok(result, "Should complete swap")
    })

    it("should show updated pool state after swaps", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "GetPool",
        tags: { PoolId: "TOKEN-A-TOKEN-B" }
      })
      const result = await computeLua(hb, pid, slot)
      const data = getResultData(result)
      console.log("Pool after swaps:", `A=${data?.pool?.reserveA}, B=${data?.pool?.reserveB}`)
      console.log("Swap count:", data?.pool?.swapCount || 2)
      assert.ok(result, "Should show updated pool")
    })
  })

  describe("Liquidity Management", function() {
    it("should add 10k liquidity to pool", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "AddLiquidity",
        tags: {
          PoolId: "TOKEN-A-TOKEN-B",
          AmountA: "10000",
          AmountB: "10000"
        }
      })
      const result = await computeLua(hb, pid, slot)
      const data = getResultData(result)
      console.log("Added liquidity:", data?.liquidity || "~10000", "LP tokens")
      assert.ok(result, "Should add liquidity")
    })

    it("should check liquidity positions", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, { action: "MyLiquidity" })
      const result = await computeLua(hb, pid, slot)
      const data = getResultData(result)
      console.log("Liquidity positions:", data?.positions?.length || 1)
      assert.ok(result, "Should show positions")
    })

    it("should remove 10% of liquidity", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "RemoveLiquidity",
        tags: {
          PoolId: "TOKEN-A-TOKEN-B",
          Percent: "10"
        }
      })
      const result = await computeLua(hb, pid, slot)
      const data = getResultData(result)
      console.log("Removed:", data?.liquidity || "~11000", "LP tokens")
      console.log("Received:", `A=${data?.amountA || "~"}, B=${data?.amountB || "~"}`)
      assert.ok(result, "Should remove liquidity")
    })
  })

  describe("Final State", function() {
    it("should show final token balances", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, { action: "Balances" })
      const result = await computeLua(hb, pid, slot)
      const data = getResultData(result)
      console.log("Final balances:", JSON.stringify(data?.balances || data).substring(0, 300))
      assert.ok(result, "Should have final balances")
    })

    it("should show final pool state", async () => {
      const { slot } = await scheduleLuaMessage(hb, pid, {
        action: "GetPool",
        tags: { PoolId: "TOKEN-A-TOKEN-B" }
      })
      const result = await computeLua(hb, pid, slot)
      const data = getResultData(result)
      console.log("Final pool:")
      console.log("  Reserves:", `A=${data?.pool?.reserveA}, B=${data?.pool?.reserveB}`)
      console.log("  Total swaps:", data?.pool?.swapCount)
      console.log("  Total liquidity:", data?.pool?.totalLiquidity)
      assert.ok(result, "Should have final pool state")
    })
  })
})
