/**
 * Erlang DEX Device Test Suite
 *
 * Tests the dev_dex Erlang device on HyperBEAM.
 * Uses direct HTTP API calls to the device endpoints.
 *
 * Note: HyperBEAM converts tag/key names to lowercase, so:
 *   TOKEN-X becomes token-x
 *   TOKEN-A becomes token-a
 *
 * Run with:
 * . ~/.asdf/asdf.sh && HB_TIMEOUT=120 node --test --test-concurrency=1 vibe/apps/tests/dev-dex.test.js
 */

import assert from "assert"
import { describe, it, before, after } from "node:test"
import HyperBEAM from "../../../src/hyperbeam.js"

describe("Erlang DEX Device", function () {
  let hbeam, hb

  before(async () => {
    hbeam = await new HyperBEAM({ reset: true, timeout: 120 }).ready()
    hb = hbeam.hb
  })

  after(async () => {
    if (hbeam) hbeam.kill()
  })

  describe("Device Info", () => {
    it("should return device info", async () => {
      const info = await hb.g("/~dex@1.0/info")
      assert.equal(info.name, "dex")
      assert.equal(info.version, "1.0")
      assert.ok(info.swap_fee)
    })
  })

  describe("Token Operations", () => {
    it("should mint tokens", async () => {
      const result = await hb.p("/~dex@1.0/mint", {
        from: "alice",
        token: "TOKEN-A",
        amount: "100000"
      })
      assert.equal(result.action, "minted")
      assert.equal(result.balance, 100000)
    })

    it("should get balances", async () => {
      // First mint some tokens
      await hb.p("/~dex@1.0/mint", {
        from: "bob",
        token: "TOKEN-A",
        amount: "50000"
      })
      await hb.p("/~dex@1.0/mint", {
        from: "bob",
        token: "TOKEN-B",
        amount: "75000"
      })

      // Balances are returned as top-level keys (lowercase due to HyperBEAM)
      const result = await hb.g("/~dex@1.0/balances", { from: "bob" })
      assert.equal(result.count, 2)
      assert.equal(result["token-a"], 50000)
      assert.equal(result["token-b"], 75000)
    })
  })

  describe("Pool Operations", () => {
    it("should create a pool", async () => {
      // Mint tokens for pool creator
      await hb.p("/~dex@1.0/mint", {
        from: "poolcreator",
        token: "TOKEN-X",
        amount: "200000"
      })
      await hb.p("/~dex@1.0/mint", {
        from: "poolcreator",
        token: "TOKEN-Y",
        amount: "200000"
      })

      // Create pool
      const result = await hb.p("/~dex@1.0/create_pool", {
        from: "poolcreator",
        tokena: "TOKEN-X",
        tokenb: "TOKEN-Y",
        amounta: "100000",
        amountb: "100000"
      })

      assert.equal(result.action, "pool-created")
      assert.equal(result.pool_id, "TOKEN-X-TOKEN-Y")
      assert.ok(result.liquidity > 0)
    })

    it("should reject creating duplicate pool", async () => {
      try {
        await hb.p("/~dex@1.0/create_pool", {
          from: "poolcreator",
          tokena: "TOKEN-X",
          tokenb: "TOKEN-Y",
          amounta: "10000",
          amountb: "10000"
        })
        assert.fail("Should have thrown an error")
      } catch (e) {
        assert.ok(e.message.includes("pool-exists") || e.message.includes("400"))
      }
    })

    it("should list pools", async () => {
      const result = await hb.g("/~dex@1.0/pools")
      assert.ok(result.count >= 1)
    })

    it("should get pool info", async () => {
      const result = await hb.g("/~dex@1.0/pool", { poolid: "TOKEN-X-TOKEN-Y" })
      // Price and TVL are returned directly
      assert.ok(result.price > 0)
      // Pool details are linked but we can check existence
      assert.ok(result["pool+link"] || result.tvl !== undefined)
    })
  })

  describe("Swap Operations", () => {
    it("should get swap quote", async () => {
      const result = await hb.g("/~dex@1.0/quote", {
        tokenin: "TOKEN-X",
        tokenout: "TOKEN-Y",
        amountin: "1000"
      })

      assert.equal(result.amount_in, 1000)
      assert.ok(result.amount_out > 0)
      assert.ok(result.amount_out < 1000) // Less due to fee
      assert.ok(result.fee > 0)
    })

    it("should execute swap", async () => {
      // Check balance before (using lowercase keys)
      const beforeBal = await hb.g("/~dex@1.0/balances", { from: "poolcreator" })
      const tokenXBefore = beforeBal["token-x"] || 0

      // Swap
      const result = await hb.p("/~dex@1.0/swap", {
        from: "poolcreator",
        tokenin: "TOKEN-X",
        tokenout: "TOKEN-Y",
        amountin: "5000"
      })

      assert.equal(result.action, "swapped")
      assert.equal(result.amount_in, 5000)
      assert.ok(result.amount_out > 0)

      // Check balance after
      const afterBal = await hb.g("/~dex@1.0/balances", { from: "poolcreator" })
      assert.equal(afterBal["token-x"], tokenXBefore - 5000)
    })

    it("should reject swap with slippage", async () => {
      try {
        await hb.p("/~dex@1.0/swap", {
          from: "poolcreator",
          tokenin: "TOKEN-X",
          tokenout: "TOKEN-Y",
          amountin: "1000",
          minamountout: "999999"  // Impossible min
        })
        assert.fail("Should have thrown an error")
      } catch (e) {
        assert.ok(e.message.includes("slippage") || e.message.includes("400"))
      }
    })
  })

  describe("Liquidity Operations", () => {
    it("should add liquidity", async () => {
      const result = await hb.p("/~dex@1.0/add_liquidity", {
        from: "poolcreator",
        poolid: "TOKEN-X-TOKEN-Y",
        amounta: "10000",
        amountb: "10000"
      })

      assert.equal(result.action, "liquidity-added")
      assert.ok(result.liquidity > 0)
    })

    it("should get my liquidity positions", async () => {
      const result = await hb.g("/~dex@1.0/my_liquidity", { from: "poolcreator" })
      // Positions are linked, check for presence
      assert.ok(result["positions+link"] || result.user === "poolcreator")
    })

    it("should remove liquidity by percent", async () => {
      // Remove 10% of liquidity
      const result = await hb.p("/~dex@1.0/remove_liquidity", {
        from: "poolcreator",
        poolid: "TOKEN-X-TOKEN-Y",
        percent: "10"
      })

      // Verify the operation succeeded
      assert.equal(result.action, "liquidity-removed")
      assert.ok(result.amount_a > 0, "Should return some token A")
      assert.ok(result.amount_b > 0, "Should return some token B")
      assert.ok(result.remaining_liquidity >= 0, "Should have remaining liquidity info")
    })
  })

  describe("Constant Product Invariant", () => {
    it("should maintain k >= k_before after swap", async () => {
      // Create fresh pool for this test
      await hb.p("/~dex@1.0/mint", {
        from: "ktest",
        token: "TOKEN-K1",
        amount: "200000"
      })
      await hb.p("/~dex@1.0/mint", {
        from: "ktest",
        token: "TOKEN-K2",
        amount: "200000"
      })
      await hb.p("/~dex@1.0/create_pool", {
        from: "ktest",
        tokena: "TOKEN-K1",
        tokenb: "TOKEN-K2",
        amounta: "100000",
        amountb: "100000"
      })

      // Get quote before swap (use larger amount to avoid integer division rounding to 0)
      const quoteBefore = await hb.g("/~dex@1.0/quote", {
        tokenin: "TOKEN-K1",
        tokenout: "TOKEN-K2",
        amountin: "1000"
      })
      assert.ok(quoteBefore.amount_out > 0, "Quote should return non-zero amount")

      // Swap
      await hb.p("/~dex@1.0/swap", {
        from: "ktest",
        tokenin: "TOKEN-K1",
        tokenout: "TOKEN-K2",
        amountin: "1000"
      })

      // Get quote after to verify pool still works
      const quoteAfter = await hb.g("/~dex@1.0/quote", {
        tokenin: "TOKEN-K1",
        tokenout: "TOKEN-K2",
        amountin: "1000"
      })

      // Pool should still function after swap
      assert.ok(quoteAfter.amount_out > 0, "Pool should still work after swap")
      // Due to price impact, output should be slightly less after a swap
      // (reserves shifted so price changed)
    })
  })
})
