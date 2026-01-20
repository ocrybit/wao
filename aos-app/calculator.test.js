/**
 * Calculator AOS App Tests (In-Memory)
 *
 * Tests the calculator app using WAO SDK's in-memory AO execution.
 * This validates the Lua handlers work correctly before HyperBEAM deployment.
 *
 * Run with:
 * node --experimental-wasm-memory64 --test --test-concurrency=1 aos-app/calculator.test.js
 */

import assert from "assert"
import { describe, it, before } from "node:test"
import { readFileSync } from "fs"
import { resolve, dirname } from "path"
import { fileURLToPath } from "url"
import { connect, acc, scheduler } from "../src/test.js"
import ArMem from "../src/armem.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const calculatorScript = readFileSync(
  resolve(__dirname, "calculator.lua"),
  "utf8"
)

// Use pre-configured test accounts
const [alice] = acc

describe("Calculator App (In-Memory)", function () {
  let ao, pid

  before(async () => {
    // Create in-memory AO environment
    const mem = new ArMem()
    const { spawn, message, dryrun } = connect(mem)

    // Spawn a process with the AOS module
    pid = await spawn({
      signer: alice.signer,
      scheduler,
      module: mem.modules.aos2_0_1,
    })

    // Load the calculator script
    await message({
      process: pid,
      signer: alice.signer,
      tags: [{ name: "Action", value: "Eval" }],
      data: calculatorScript,
    })

    ao = { mem, spawn, message, dryrun, pid }
    console.log("Calculator process spawned:", pid)
  })

  // Helper to get tag value from output
  const getTag = (output, name) =>
    output?.Tags?.find(t => t.name === name)?.value

  describe("Basic Operations", function () {
    it("should add two numbers", async () => {
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [
          { name: "Action", value: "Add" },
          { name: "A", value: "10" },
          { name: "B", value: "5" },
        ],
      })
      const output = result.Messages?.[0]
      assert.equal(getTag(output, "Result"), "15")
      assert.equal(getTag(output, "Operation"), "Add")
      console.log("10 + 5 =", getTag(output, "Result"))
    })

    it("should subtract two numbers", async () => {
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [
          { name: "Action", value: "Subtract" },
          { name: "A", value: "20" },
          { name: "B", value: "8" },
        ],
      })
      const output = result.Messages?.[0]
      assert.equal(getTag(output, "Result"), "12")
      console.log("20 - 8 =", getTag(output, "Result"))
    })

    it("should multiply two numbers", async () => {
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [
          { name: "Action", value: "Multiply" },
          { name: "A", value: "7" },
          { name: "B", value: "6" },
        ],
      })
      const output = result.Messages?.[0]
      assert.equal(getTag(output, "Result"), "42")
      console.log("7 * 6 =", getTag(output, "Result"))
    })

    it("should divide two numbers", async () => {
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [
          { name: "Action", value: "Divide" },
          { name: "A", value: "100" },
          { name: "B", value: "4" },
        ],
      })
      const output = result.Messages?.[0]
      assert.equal(getTag(output, "Result"), "25")
      console.log("100 / 4 =", getTag(output, "Result"))
    })

    it("should handle division by zero", async () => {
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [
          { name: "Action", value: "Divide" },
          { name: "A", value: "10" },
          { name: "B", value: "0" },
        ],
      })
      const output = result.Messages?.[0]
      assert.equal(getTag(output, "Error"), "DivisionByZero")
      console.log("Division by zero handled correctly")
    })
  })

  describe("Advanced Operations", function () {
    it("should compute power", async () => {
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [
          { name: "Action", value: "Power" },
          { name: "Base", value: "2" },
          { name: "Exponent", value: "10" },
        ],
      })
      const output = result.Messages?.[0]
      assert.equal(getTag(output, "Result"), "1024")
      console.log("2^10 =", getTag(output, "Result"))
    })

    it("should compute square root", async () => {
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [
          { name: "Action", value: "Sqrt" },
          { name: "Value", value: "144" },
        ],
      })
      const output = result.Messages?.[0]
      assert.equal(getTag(output, "Result"), "12")
      console.log("sqrt(144) =", getTag(output, "Result"))
    })

    it("should handle sqrt of negative number", async () => {
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [
          { name: "Action", value: "Sqrt" },
          { name: "Value", value: "-1" },
        ],
      })
      const output = result.Messages?.[0]
      assert.equal(getTag(output, "Error"), "NegativeValue")
      console.log("sqrt(-1) handled correctly")
    })

    it("should compute modulo", async () => {
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [
          { name: "Action", value: "Mod" },
          { name: "A", value: "17" },
          { name: "B", value: "5" },
        ],
      })
      const output = result.Messages?.[0]
      assert.equal(getTag(output, "Result"), "2")
      console.log("17 % 5 =", getTag(output, "Result"))
    })
  })

  describe("Memory Operations", function () {
    it("should store value in memory", async () => {
      // Use message (not dryrun) to persist state
      await ao.message({
        process: ao.pid,
        signer: alice.signer,
        tags: [
          { name: "Action", value: "Store" },
          { name: "Value", value: "42" },
        ],
      })

      const result = await ao.dryrun({
        process: ao.pid,
        tags: [{ name: "Action", value: "Recall" }],
      })
      const output = result.Messages?.[0]
      assert.equal(getTag(output, "Memory"), "42")
      console.log("Stored and recalled:", getTag(output, "Memory"))
    })

    it("should clear memory", async () => {
      await ao.message({
        process: ao.pid,
        signer: alice.signer,
        tags: [{ name: "Action", value: "ClearMemory" }],
      })

      const result = await ao.dryrun({
        process: ao.pid,
        tags: [{ name: "Action", value: "Recall" }],
      })
      const output = result.Messages?.[0]
      assert.equal(getTag(output, "Memory"), "0")
      console.log("Memory cleared")
    })
  })

  describe("History Operations", function () {
    it("should track history via message operations", async () => {
      // Use message (not dryrun) to persist calculations in history
      await ao.message({
        process: ao.pid,
        signer: alice.signer,
        tags: [
          { name: "Action", value: "Add" },
          { name: "A", value: "1" },
          { name: "B", value: "2" },
        ],
      })

      const result = await ao.dryrun({
        process: ao.pid,
        tags: [{ name: "Action", value: "HistoryCount" }],
      })
      const output = result.Messages?.[0]
      const count = parseInt(getTag(output, "Count"))
      assert.ok(count > 0, "History should have entries after message")
      console.log("History count after Add:", count)
    })

    it("should clear history", async () => {
      await ao.message({
        process: ao.pid,
        signer: alice.signer,
        tags: [{ name: "Action", value: "ClearHistory" }],
      })

      const result = await ao.dryrun({
        process: ao.pid,
        tags: [{ name: "Action", value: "HistoryCount" }],
      })
      const output = result.Messages?.[0]
      assert.equal(getTag(output, "Count"), "0")
      console.log("History cleared")
    })
  })

  describe("Info Handler", function () {
    it("should return app info", async () => {
      const result = await ao.dryrun({
        process: ao.pid,
        tags: [{ name: "Action", value: "Info" }],
      })
      const output = result.Messages?.[0]
      assert.equal(getTag(output, "Name"), "Calculator")
      assert.equal(getTag(output, "Version"), "1.0")
      assert.equal(getTag(output, "AppType"), "Mainnet-WASM")
      assert.ok(getTag(output, "Device-Stack")?.includes("wasm-64@1.0"))
      console.log("App info:", getTag(output, "Name"), getTag(output, "Version"))
    })
  })
})
