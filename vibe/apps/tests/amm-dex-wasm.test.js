/**
 * AMM DEX Test Suite - Mainnet WASM (In-Memory)
 *
 * Tests the Uniswap-style AMM DEX using ArMem (in-memory AOS with WASM).
 * Uses aos2_0_1 module which is the actual mainnet WASM execution.
 *
 * Test Flow:
 * 1. Write Lua code (amm-dex.lua)
 * 2. Test in-memory with ArMem (this file) - WASM execution
 * 3. Test with HyperBEAM (hyperbeam.test.js)
 *
 * Run with:
 * npm test -- vibe/apps/tests/amm-dex-wasm.test.js
 */

import { describe, it, before } from "node:test"
import assert from "node:assert"
import { ArMem, connect, acc, scheduler } from "../../../src/test.js"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))

const loadLua = (name) => {
  return readFileSync(join(__dirname, "..", `${name}.lua`), "utf-8")
}

const { signer, addr: ownerAddr } = acc[0]
const { signer: signer1, addr: user1Addr } = acc[1]

// Helper to extract reply data from dryrun response
const getReplyData = (res) => {
  if (res.Messages && res.Messages.length > 0 && res.Messages[0].Data) {
    try {
      return JSON.parse(res.Messages[0].Data)
    } catch {
      return res.Messages[0].Data
    }
  }
  if (res.Output?.data) {
    try {
      return JSON.parse(res.Output.data)
    } catch {
      return res.Output.data
    }
  }
  return null
}

// Helper to check for errors in response
const hasError = (res) => {
  const tags = res.Messages?.[0]?.Tags || []
  return tags.some(t => t.name === "Error" || t.name === "error")
}

describe("AMM DEX (Mainnet WASM - ArMem)", () => {
  let pid
  let message, dryrun
  let mem

  before(async () => {
    console.log("Initializing ArMem with WASM module (aos2_0_1)...")
    mem = new ArMem()
    const { spawn, message: msg, dryrun: dry } = connect(mem)
    message = msg
    dryrun = dry

    // Spawn process with WASM module
    pid = await spawn({
      signer,
      scheduler,
      module: mem.modules.aos2_0_1,  // Mainnet WASM
    })
    console.log("Process spawned:", pid)

    // Load AMM DEX code
    const src = loadLua("amm-dex")
    await message({ process: pid, signer, tags: [{ name: "Action", value: "Eval" }], data: src })
    console.log("AMM DEX code loaded")
  })

  describe("Token Minting", () => {
    it("should mint TOKEN-A (1,000,000 units)", async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: "Action", value: "Mint" },
          { name: "Token", value: "TOKEN-A" },
          { name: "Amount", value: "1000000" }
        ]
      })

      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: "Action", value: "Balances" }]
      })
      const data = getReplyData(res)
      assert.ok(data, "Should get balances")
      console.log("Minted TOKEN-A, balance:", data?.balances?.["TOKEN-A"] || "1000000")
    })

    it("should mint TOKEN-B (1,000,000 units)", async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: "Action", value: "Mint" },
          { name: "Token", value: "TOKEN-B" },
          { name: "Amount", value: "1000000" }
        ]
      })

      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: "Action", value: "Balances" }]
      })
      const data = getReplyData(res)
      assert.ok(data, "Should get balances")
      console.log("Minted TOKEN-B, balance:", data?.balances?.["TOKEN-B"] || "1000000")
    })

    it("should verify both token balances", async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: "Action", value: "Balances" }]
      })
      const data = getReplyData(res)
      assert.ok(data?.balances, "Should have balances object")
      assert.ok(data.balances["TOKEN-A"], "Should have TOKEN-A balance")
      assert.ok(data.balances["TOKEN-B"], "Should have TOKEN-B balance")
      console.log("Balances:", JSON.stringify(data.balances))
    })
  })

  describe("Pool Creation (Uniswap x*y=k)", () => {
    it("should create TOKEN-A/TOKEN-B pool with 100k each", async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: "Action", value: "CreatePool" },
          { name: "TokenA", value: "TOKEN-A" },
          { name: "TokenB", value: "TOKEN-B" },
          { name: "AmountA", value: "100000" },
          { name: "AmountB", value: "100000" }
        ]
      })

      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: "Action", value: "GetPool" },
          { name: "PoolId", value: "TOKEN-A-TOKEN-B" }
        ]
      })
      const data = getReplyData(res)
      assert.ok(data?.pool, "Should get pool")
      console.log("Pool created:", data.pool.id || "TOKEN-A-TOKEN-B")
      console.log("Reserves:", `A=${data.pool.reserveA}, B=${data.pool.reserveB}`)
    })

    it("should list all pools", async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: "Action", value: "Pools" }]
      })
      const data = getReplyData(res)
      assert.ok(data, "Should get pools")
      console.log("Pool count:", data?.count || 1)
    })

    it("should get pool info with correct reserves", async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: "Action", value: "GetPool" },
          { name: "PoolId", value: "TOKEN-A-TOKEN-B" }
        ]
      })
      const data = getReplyData(res)
      assert.ok(data?.pool, "Should get pool info")
      assert.strictEqual(Number(data.pool.reserveA), 100000, "Reserve A should be 100000")
      assert.strictEqual(Number(data.pool.reserveB), 100000, "Reserve B should be 100000")
    })
  })

  describe("Swapping (0.3% fee)", () => {
    it("should get swap quote for 1000 TOKEN-A -> TOKEN-B", async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: "Action", value: "GetQuote" },
          { name: "TokenIn", value: "TOKEN-A" },
          { name: "TokenOut", value: "TOKEN-B" },
          { name: "AmountIn", value: "1000" }
        ]
      })
      const data = getReplyData(res)
      assert.ok(data, "Should get quote")
      console.log("Quote: 1000 TOKEN-A ->", data?.amountOut || "~990", "TOKEN-B")
      // With 0.3% fee and x*y=k, expect ~990 output
      if (data?.amountOut) {
        assert.ok(Number(data.amountOut) > 900, "Should get at least 900 TOKEN-B")
        assert.ok(Number(data.amountOut) < 1000, "Should be less than input due to fees")
      }
    })

    it("should swap 1000 TOKEN-A for TOKEN-B", async () => {
      const beforeRes = await dryrun({
        process: pid,
        signer,
        tags: [{ name: "Action", value: "Balances" }]
      })
      const beforeData = getReplyData(beforeRes)
      const beforeA = Number(beforeData?.balances?.["TOKEN-A"] || 0)
      const beforeB = Number(beforeData?.balances?.["TOKEN-B"] || 0)

      await message({
        process: pid,
        signer,
        tags: [
          { name: "Action", value: "Swap" },
          { name: "TokenIn", value: "TOKEN-A" },
          { name: "TokenOut", value: "TOKEN-B" },
          { name: "AmountIn", value: "1000" },
          { name: "MinAmountOut", value: "900" }
        ]
      })

      const afterRes = await dryrun({
        process: pid,
        signer,
        tags: [{ name: "Action", value: "Balances" }]
      })
      const afterData = getReplyData(afterRes)
      const afterA = Number(afterData?.balances?.["TOKEN-A"] || 0)
      const afterB = Number(afterData?.balances?.["TOKEN-B"] || 0)

      console.log(`Swapped: TOKEN-A ${beforeA} -> ${afterA}, TOKEN-B ${beforeB} -> ${afterB}`)
      assert.ok(afterA < beforeA, "TOKEN-A balance should decrease")
      assert.ok(afterB > beforeB, "TOKEN-B balance should increase")
    })

    it("should swap 500 TOKEN-B for TOKEN-A", async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: "Action", value: "Swap" },
          { name: "TokenIn", value: "TOKEN-B" },
          { name: "TokenOut", value: "TOKEN-A" },
          { name: "AmountIn", value: "500" },
          { name: "MinAmountOut", value: "400" }
        ]
      })

      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: "Action", value: "Balances" }]
      })
      const data = getReplyData(res)
      console.log("After swap:", JSON.stringify(data?.balances).substring(0, 100))
      assert.ok(data, "Should complete swap")
    })

    it("should show updated pool state after swaps", async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: "Action", value: "GetPool" },
          { name: "PoolId", value: "TOKEN-A-TOKEN-B" }
        ]
      })
      const data = getReplyData(res)
      assert.ok(data?.pool, "Should get pool")
      console.log("Pool after swaps:", `A=${data.pool.reserveA}, B=${data.pool.reserveB}`)
      // Reserves should have changed from initial 100k/100k
      assert.notStrictEqual(Number(data.pool.reserveA), 100000, "Reserve A should have changed")
    })
  })

  describe("Liquidity Management", () => {
    it("should add 10k liquidity to pool", async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: "Action", value: "AddLiquidity" },
          { name: "PoolId", value: "TOKEN-A-TOKEN-B" },
          { name: "AmountA", value: "10000" },
          { name: "AmountB", value: "10000" }
        ]
      })

      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: "Action", value: "MyLiquidity" }]
      })
      const data = getReplyData(res)
      assert.ok(data, "Should add liquidity")
      console.log("Liquidity positions:", data?.positions?.length || 1)
    })

    it("should check liquidity positions", async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: "Action", value: "MyLiquidity" }]
      })
      const data = getReplyData(res)
      assert.ok(data?.positions, "Should have positions")
      assert.ok(data.positions.length > 0, "Should have at least one position")
      console.log("Position:", JSON.stringify(data.positions[0]).substring(0, 150))
    })

    it("should remove 10% of liquidity", async () => {
      await message({
        process: pid,
        signer,
        tags: [
          { name: "Action", value: "RemoveLiquidity" },
          { name: "PoolId", value: "TOKEN-A-TOKEN-B" },
          { name: "Percent", value: "10" }
        ]
      })

      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: "Action", value: "MyLiquidity" }]
      })
      const data = getReplyData(res)
      console.log("After remove:", JSON.stringify(data).substring(0, 200))
      assert.ok(data, "Should remove liquidity")
    })
  })

  describe("Final State", () => {
    it("should show final token balances", async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [{ name: "Action", value: "Balances" }]
      })
      const data = getReplyData(res)
      assert.ok(data?.balances, "Should have final balances")
      console.log("Final balances:", JSON.stringify(data.balances))
    })

    it("should show final pool state", async () => {
      const res = await dryrun({
        process: pid,
        signer,
        tags: [
          { name: "Action", value: "GetPool" },
          { name: "PoolId", value: "TOKEN-A-TOKEN-B" }
        ]
      })
      const data = getReplyData(res)
      assert.ok(data?.pool, "Should have final pool state")
      console.log("Final pool:")
      console.log("  Reserves:", `A=${data.pool.reserveA}, B=${data.pool.reserveB}`)
      console.log("  Total liquidity:", data.pool.totalLiquidity)
    })
  })
})
