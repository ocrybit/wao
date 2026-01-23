/**
 * Token AOS App Tests (In-Memory)
 *
 * Tests the token Lua script using WAO SDK's in-memory AO execution.
 * Tests comprehensive token features: Transfer, Balance, Mint, Burn, Allowance, etc.
 *
 * Run with:
 * node --experimental-wasm-memory64 --test --test-concurrency=1 aos-app/token.test.js
 */

import assert from "assert"
import { describe, it, before } from "node:test"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { connect, acc, scheduler } from "../src/test.js"
import ArMem from "../src/armem.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

// Load the token Lua script
const tokenScript = readFileSync(resolve(__dirname, "token.lua"), "utf8")

// Use pre-configured test accounts
const [alice, bob, charlie] = acc

describe("Token App (In-Memory)", function() {
  let mem, ao, pid

  before(async () => {
    // Create in-memory AO environment
    mem = new ArMem()
    const { spawn, message, dryrun } = connect(mem)

    // Spawn a process with the AOS module
    pid = await spawn({
      signer: alice.signer,
      scheduler,
      module: mem.modules.aos2_0_1,
    })

    // Load the token script
    await message({
      process: pid,
      signer: alice.signer,
      tags: [{ name: "Action", value: "Eval" }],
      data: tokenScript,
    })

    ao = { mem, spawn, message, dryrun, pid }
    console.log("Token process spawned:", pid)
  })

  describe("Info Handler", function() {
    it("should return token info", async () => {
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [{ name: "Action", value: "Info" }],
        data: "",
      })

      const output = result.Messages?.[0]
      assert.ok(output, "Should have output message")

      const tags = output.Tags || []
      const getName = name => tags.find(t => t.name === name)?.value

      // Check essential token metadata is present
      assert.ok(getName("Name"), "Should have Name tag")
      assert.ok(getName("Ticker"), "Should have Ticker tag")
      assert.ok(getName("Denomination"), "Should have Denomination tag")
      assert.ok(getName("Total-Supply"), "Should have Total-Supply tag")

      console.log("Token info:", {
        name: getName("Name"),
        ticker: getName("Ticker"),
        denomination: getName("Denomination"),
      })
    })
  })

  describe("Balance Handler", function() {
    it("should get initial balance of process (all tokens)", async () => {
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [
          { name: "Action", value: "Balance" },
          { name: "Target", value: ao.pid },
        ],
        data: "",
      })

      const output = result.Messages?.[0]
      assert.ok(output, "Should have output message")

      // Process should have initial supply (10000 * 10^12)
      const balance = output.Data
      assert.ok(balance, "Should have balance")
      assert.ok(BigInt(balance) > 0n, "Balance should be positive")
    })

    it("should get zero balance for new account", async () => {
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [
          { name: "Action", value: "Balance" },
          { name: "Target", value: bob.addr },
        ],
        data: "",
      })

      const output = result.Messages?.[0]
      assert.ok(output, "Should have output message")
      assert.equal(output.Data, "0", "New account should have 0 balance")
    })
  })

  describe("Transfer Handler", function() {
    it("should transfer tokens from process to bob", async () => {
      const transferAmount = "1000000000000" // 1 token

      // Transfer from process to bob
      const result = await ao.message({
        process: ao.pid,
        signer: alice.signer,
        tags: [
          { name: "Action", value: "Eval" },
        ],
        // Use ao.send to transfer from process
        data: `ao.send({
          Target = ao.id,
          Action = "Transfer",
          Recipient = "${bob.addr}",
          Quantity = "${transferAmount}"
        })`,
      })

      // Check bob's balance
      const balanceResult = await ao.dryrun({
        process: ao.pid,
        tags: [
          { name: "Action", value: "Balance" },
          { name: "Target", value: bob.addr },
        ],
        data: "",
      })

      const output = balanceResult.Messages?.[0]
      assert.ok(output, "Should have output message")
      assert.equal(output.Data, transferAmount, "Bob should have received tokens")
    })

    it("should fail transfer with insufficient balance", async () => {
      const hugeAmount = "999999999999999999999999999"

      const result = await ao.dryrun({
        process: ao.pid,
        Owner: bob.addr,
        tags: [
          { name: "Action", value: "Transfer" },
          { name: "Recipient", value: charlie.addr },
          { name: "Quantity", value: hugeAmount },
        ],
        data: "",
      })

      const output = result.Messages?.[0]
      assert.ok(output, "Should have output message")

      const tags = output.Tags || []
      const errorTag = tags.find(t => t.name === "Error")
      assert.ok(errorTag || output.Data?.includes("Insufficient"), "Should report insufficient balance")
    })
  })

  describe("Total-Supply Handler", function() {
    it("should return total supply", async () => {
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [{ name: "Action", value: "Total-Supply" }],
        data: "",
      })

      const output = result.Messages?.[0]
      assert.ok(output, "Should have output message")

      const supply = output.Data
      assert.ok(supply, "Should have total supply")
      assert.ok(BigInt(supply) > 0n, "Total supply should be positive")
    })
  })

  describe("Balances Handler", function() {
    it("should return all balances as JSON", async () => {
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [{ name: "Action", value: "Balances" }],
        data: "",
      })

      const output = result.Messages?.[0]
      assert.ok(output, "Should have output message")

      const balances = JSON.parse(output.Data)
      assert.ok(typeof balances === "object", "Should return object")
      assert.ok(Object.keys(balances).length > 0, "Should have at least one balance")
    })
  })

  describe("Mint Handler", function() {
    it("should mint new tokens (owner only)", async () => {
      const mintAmount = "5000000000000" // 5 tokens

      // Mint to charlie
      await ao.message({
        process: ao.pid,
        signer: alice.signer,
        tags: [{ name: "Action", value: "Eval" }],
        data: `ao.send({
          Target = ao.id,
          Action = "Mint",
          Recipient = "${charlie.addr}",
          Quantity = "${mintAmount}"
        })`,
      })

      // Check charlie's balance
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [
          { name: "Action", value: "Balance" },
          { name: "Target", value: charlie.addr },
        ],
        data: "",
      })

      const output = result.Messages?.[0]
      assert.ok(output, "Should have output message")
      assert.equal(output.Data, mintAmount, "Charlie should have minted tokens")
    })
  })

  describe("Burn Handler", function() {
    it("should burn tokens", async () => {
      const burnAmount = "1000000000000" // 1 token

      // Get initial supply
      const initialSupply = await ao.dryrun({
        process: ao.pid,
        tags: [{ name: "Action", value: "Total-Supply" }],
        data: "",
      })
      const initialTotal = BigInt(initialSupply.Messages?.[0]?.Data || "0")

      // Burn tokens from process
      await ao.message({
        process: ao.pid,
        signer: alice.signer,
        tags: [{ name: "Action", value: "Eval" }],
        data: `ao.send({
          Target = ao.id,
          Action = "Burn",
          Quantity = "${burnAmount}"
        })`,
      })

      // Check new supply
      const newSupply = await ao.dryrun({
        process: ao.pid,
        tags: [{ name: "Action", value: "Total-Supply" }],
        data: "",
      })
      const newTotal = BigInt(newSupply.Messages?.[0]?.Data || "0")

      assert.ok(newTotal < initialTotal, "Total supply should decrease after burn")
    })
  })

  describe("Allowance System", function() {
    it("should approve allowance", async () => {
      const allowanceAmount = "2000000000000" // 2 tokens

      await ao.message({
        process: ao.pid,
        signer: alice.signer,
        tags: [{ name: "Action", value: "Eval" }],
        data: `ao.send({
          Target = ao.id,
          Action = "Approve",
          Spender = "${bob.addr}",
          Quantity = "${allowanceAmount}"
        })`,
      })

      // Check allowance
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [
          { name: "Action", value: "Allowance" },
          { name: "Owner", value: ao.pid },
          { name: "Spender", value: bob.addr },
        ],
        data: "",
      })

      const output = result.Messages?.[0]
      assert.ok(output, "Should have output message")
      assert.equal(output.Data, allowanceAmount, "Allowance should be set")
    })
  })
})
